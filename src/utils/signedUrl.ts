
// src/utils/signedUrl.ts
import {supabase} from "@/lib/supabase";

type CacheVal={url:string;exp:number};
const cache:Record<string,CacheVal>={};

export async function signedUrlFor(bucket:string, path:string, ttlSec=3600){
  const key=`${bucket}:${path}`;
  const now=Math.floor(Date.now()/1000);
  const hit=cache[key];
  if(hit&&hit.exp-60>now)return hit.url; // keep 60s safety margin

  const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path, ttlSec);
  if(error||!data?.signedUrl)throw error??new Error("no signed url");
  cache[key]={url:data.signedUrl,exp:now+ttlSec};
  return data.signedUrl;
}

export function invalidateSignedUrl(bucket:string, path:string){
  delete cache[`${bucket}:${path}`];
}
