// src/lib/authHelpers.ts
import {supabase}from "@/lib/supabase";

export async function getCurrentUserOrNull(){
  // 1) Check for a valid session
  const {data:{session},error:sessionError}=await supabase.auth.getSession();
  if(sessionError){
    console.warn("[auth] getSession error:",sessionError);
    return null;
  }
  if(!session){
    // No logged-in user
    return null;
  }

  // 2) Now it’s safe to ask for the user
  const {data,error}=await supabase.auth.getUser();
  if(error){
    console.warn("[auth] getUser error:",error);
    return null;
  }
  return data.user ?? null;
}
