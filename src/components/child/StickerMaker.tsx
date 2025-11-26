// src/components/child/StickerMaker.tsx
import {useState} from "react";
import {generateStickers} from "@/utils/stickers";

export default function StickerMaker(){
  const [urls,setUrls]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const folder="child/be5c8651-2baa-4326-aef2-39cc21c0b4a5";
  const styleSeed=3208437370;

  const onMake=async ()=>{
    try{
      setBusy(true);
      const {signedUrls}=await generateStickers({
        prompt:"Cute sticker, glossy, kid-friendly, simple background. Item: Board game. Notes: Family play night.",
        n:4, folder, styleSeed
      });
      setUrls(signedUrls);
    }catch(err:any){
      console.error(err);
      alert(err?.message||"Failed to generate stickers");
    }finally{ setBusy(false); }
  };

  return(
    <div className="space-y-3">
      <button className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50" onClick={onMake} disabled={busy}>
        {busy?"Generating…":"Generate 4 Stickers"}
      </button>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {urls.map((u,i)=>(
          <img key={i} src={u} alt={`sticker ${i+1}`} className="rounded-xl shadow-md" loading="lazy" referrerPolicy="no-referrer"/>
        ))}
      </div>
    </div>
  );
}
