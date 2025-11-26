// src/lib/supabase.ts
import {createClient}from "@supabase/supabase-js";

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey=import.meta.env.VITE_SUPABASE_ANON_KEY;

if(!supabaseUrl||!supabaseAnonKey){
  console.error("[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars");
}

// 🔑 Functions URL: uses VITE_FUNCTIONS_URL if set, otherwise cloud edge functions
const functionsUrl=import.meta.env.VITE_FUNCTIONS_URL ?? `${supabaseUrl}/functions/v1`;

export const supabase=createClient(supabaseUrl!,supabaseAnonKey!,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
  },
  functions:{url:functionsUrl},
});
