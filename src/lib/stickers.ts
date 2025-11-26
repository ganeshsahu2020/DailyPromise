// src/lib/stickers.ts
import {supabase} from "@/lib/supabase";
import {signedUrlFor} from "@/utils/signedUrl";

const ONE_HOUR=60*60;

export async function signStickerPath(path:string, ttlSec=ONE_HOUR){
  return signedUrlFor("stickers", path, ttlSec);
}

export async function signStickerPaths(paths:string[], ttlSec=ONE_HOUR){
  const out:string[]=[];
  for(const p of paths){ out.push(await signStickerPath(p, ttlSec)); }
  return out;
}

// Optional upload helper (bytes or File)
export async function uploadSticker(file:File|Uint8Array, destPath:string){
  const isFile=typeof File!=="undefined"&&file instanceof File;
  const opts=isFile?{upsert:true}:{contentType:"image/png",upsert:true} as any;
  const {data,error}=await supabase.storage.from("stickers").upload(destPath, file as any, opts);
  if(error)throw error;
  return data?.path??destPath;
}
