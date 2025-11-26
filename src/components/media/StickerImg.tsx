// src/components/media/StickerImg.tsx
import {useEffect,useState} from "react";
import {signedUrlFor} from "@/utils/signedUrl";

type Props={
  bucket?:string;
  path?:string|null;
  alt?:string;
  ttlSec?:number;
  className?:string;
  onErrorSrc?:string;
};

export default function StickerImg({bucket="stickers", path, alt, ttlSec=3600, className, onErrorSrc="/img/placeholder.png"}:Props){
  const [src,setSrc]=useState<string>("");

  useEffect(()=>{(async()=>{
    if(!path){setSrc("");return;}
    try{
      const url=await signedUrlFor(bucket, path, ttlSec);
      setSrc(url);
    }catch(e){
      console.warn("StickerImg sign fail", e);
      setSrc(onErrorSrc||"");
    }
  })()},[bucket, path, ttlSec, onErrorSrc]);

  if(!path)return null;
  return(
    <img
      src={src}
      alt={alt||""}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e)=>{(e.currentTarget as HTMLImageElement).src=onErrorSrc||"";}}
    />
  );
}
