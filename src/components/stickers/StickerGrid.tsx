// src/components/stickers/StickerGrid.tsx
import {useSignedStickers} from "@/hooks/useSignedStickers";

type Props={paths:string[]; onPick?:(url:string)=>void};

export default function StickerGrid({paths,onPick}:Props){
  const urls=useSignedStickers(paths);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {urls.map((u,i)=>(
        <button key={i} onClick={()=>onPick?.(u)} className="aspect-square rounded-lg overflow-hidden ring-1 ring-black/5 hover:ring-brand/40">
          <img src={u} alt="sticker" className="w-full h-full object-contain bg-white" loading="lazy"/>
        </button>
      ))}
    </div>
  );
}
