// src/hooks/useSignedMedia.ts
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

export function useSignedMedia(bucket:string, path:string|null|undefined, seconds=3600){
  const [url,setUrl]=useState<string|null>(null);
  useEffect(()=>{
    let live=true;
    (async()=>{
      if(!path){setUrl(null);return;}
      const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path, seconds);
      if(live) setUrl(error? null : data?.signedUrl ?? null);
    })();
    return()=>{live=false};
  },[bucket,path,seconds]);
  return url;
}
