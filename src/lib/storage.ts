// src/lib/storage.ts
import {supabase}from "@/lib/supabase";

/**
 * Safely get the current user id using getSession.
 * Returns null when logged out or on error instead of throwing.
 */
export async function getCurrentUserIdSafe(){
  try{
    const {data:{session}}=await supabase.auth.getSession();
    return session?.user?.id ?? null;
  }catch(err:any){
    console.error("[storage.getCurrentUserIdSafe]",err);
    return null;
  }
}

/**
 * Return a signed URL for a private avatar path, or null if it can't be signed.
 * Use this in the UI and fall back to a placeholder when null is returned.
 */
export async function signAvatarPath(path:string,expires=60*60*24*7){
  try{
    const {data,error}=await supabase.storage
      .from("avatars")
      .createSignedUrl(path,expires);
    if(error)throw error;
    return data.signedUrl;
  }catch(err){
    console.error("[storage.signAvatarPath]",err);
    return null;
  }
}

/**
 * Upload an avatar to the private "avatars" bucket.
 *
 * - If keyFn is provided, it controls the storage path (e.g., children/<child_uid>.png).
 * - If keyFn is omitted, we use a default parent path: parents/<auth_uid>.png.
 *
 * Example for child:
 *   const {path,signedUrl}=await uploadAvatarPrivately(
 *     file,
 *     ()=>`children/${childUid}.png`
 *   );
 */
export async function uploadAvatarPrivately(
  file:File,
  keyFn?:(me:{id:string})=>string
){
  const uid=await getCurrentUserIdSafe();
  if(!uid)throw new Error("Not authenticated");

  const defaultKey=`parents/${uid}.png`;
  const path=keyFn?keyFn({id:uid}):defaultKey;

  const up=await supabase.storage.from("avatars").upload(path,file,{
    upsert:true,
    contentType:file.type||"image/png",
  });
  if(up.error)throw up.error;

  const signedUrl=await signAvatarPath(path);
  return {path,signedUrl};
}
