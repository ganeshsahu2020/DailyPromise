// src/hooks/useSignedStickers.ts
import {useEffect,useState} from "react";
import {signStickerPaths} from "@/lib/stickers";

export function useSignedStickers(paths:string[]){
  const [urls,setUrls]=useState<string[]>([]);
  useEffect(()=>{ let alive=true;(async()=>{
    try{
      const signed=await signStickerPaths(paths);
      if(alive)setUrls(signed);
    }catch(e){ console.error("signStickerPaths failed", e); }
  })(); return()=>{alive=false}; },[paths.join("|")]);
  return urls;
}
