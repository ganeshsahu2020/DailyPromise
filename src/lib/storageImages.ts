import {supabase} from "@/lib/supabase";

export function dataUrlToBytes(dataUrl:string){
  const b64=dataUrl.split(",")[1]||"";
  const bin=atob(b64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++){bytes[i]=bin.charCodeAt(i);}
  return bytes;
}

export async function uploadDataUrlToBucket(dataUrl:string,path:string,mime="image/png"){
  const bytes=dataUrlToBytes(dataUrl);
  const {data,error}=await supabase.storage.from("ai-images").upload(path,bytes,{contentType:mime,upsert:true});
  if(error)throw error;
  return data?.path||path;
}

export async function getSignedUrl(path:string,expiresInSec=60*60*24){
  const {data,error}=await supabase.storage.from("ai-images").createSignedUrl(path,expiresInSec);
  if(error)throw error;
  return data.signedUrl;
}

export async function listFolder(prefix:string){
  const {data,error}=await supabase.storage.from("ai-images").list(prefix,{limit:100,sortBy:{column:"name",order:"desc"}});
  if(error)throw error;
  return (data||[]).map(x=>`${prefix}/${x.name}`);
}

// Optional: call the edge function to import multiple dataUrls/URLs in one go
export async function importImages(items:{dataUrl?:string;url?:string;folder?:string;filename?:string}[],opts?:{folder?:string;occasion?:string;subfolder?:string}){
  const r=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-image-save`,{
    method:"POST",
    headers:{Authorization:`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({items,...opts})
  });
  const j=await r.json();
  if(!j?.ok)throw new Error(j?.error||"import failed");
  return j.images as {path:string;signedUrl?:string;publicUrl?:string;bytes?:number;from:"dataUrl"|"url"}[];
}
