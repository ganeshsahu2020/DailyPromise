// src/lib/ai.ts
export type AiImage = { url:string; path?:string; error?:string };
export type AiResp = { images:AiImage[]; count:number };

export const aiGenerate = async (prompt:string, n:number=3) => {
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-image`, {
    method:"POST",
    headers:{ "content-type":"application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, authorization:`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ prompt, size:"1024x1024", n })
  });
  if(!r.ok) throw new Error(await r.text());
  return await r.json() as AiResp;
};
