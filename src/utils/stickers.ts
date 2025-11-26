// src/utils/stickers.ts
import {supabase} from "@/lib/supabase";
import {signedUrlFor} from "@/utils/signedUrl";

type GenArgs={prompt:string;n?:number;folder:string;styleSeed?:number};
type GenResult={signedUrls:string[];filePaths:string[]};

const b64ToUint8=(b64:string)=>{
  const clean=b64.replace(/\s+/g,"");
  const bin=atob(clean);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++){bytes[i]=bin.charCodeAt(i);}
  return bytes;
};

export const generateStickers=async ({prompt,n=4,folder,styleSeed}:GenArgs):Promise<GenResult>=>{
  const fixedPrompt=prompt.trim().endsWith("(")?prompt.trim().slice(0,-1):prompt.trim();

  const res=await fetch("/functions/v1/sticker-gen",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:fixedPrompt,n,folder,styleSeed})});
  if(!res.ok){
    const txt=await res.text().catch(()=>"(no body)");
    throw new Error(`sticker-gen failed ${res.status}: ${txt}`);
  }

  const contentType=res.headers.get("content-type")||"";
  let b64List:string[]=[];
  if(contentType.includes("application/json")){
    const json=await res.json();
    if(Array.isArray(json?.images)){ b64List=json.images.map((x:any)=>x.b64||x.base64||x.data||""); }
    else if(Array.isArray(json)){ b64List=json as string[]; }
    else if(typeof json?.b64==="string"){ b64List=[json.b64]; }
  }else{
    const txt=await res.text();
    b64List=txt.split("\n").map((s)=>s.trim()).filter(Boolean);
  }

  if(!b64List.length)throw new Error("No images returned from sticker-gen");

  const ts=Date.now();
  const filePaths:string[]=[];
  for(let i=0;i<b64List.length;i++){
    const bytes=b64ToUint8(b64List[i]);
    const filePath=`${folder}/sticker-${ts}-${styleSeed??0}-${i+1}.png`;
    const {error}=await supabase.storage.from("stickers").upload(filePath, bytes, {contentType:"image/png", upsert:true});
    if(error)throw error;
    filePaths.push(filePath);
  }

  const signedUrls=await Promise.all(filePaths.map((p)=>signedUrlFor("stickers", p, 3600)));
  return {signedUrls,filePaths};
};
