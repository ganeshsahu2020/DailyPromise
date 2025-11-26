// src/components/AiVariantModal.tsx
import { useEffect, useState } from "react";

type Props = { open:boolean; onClose:()=>void; images:{url:string}[]; onPick:(url:string)=>void };

export default function AiVariantModal({ open, onClose, images, onPick }:Props){
  const [ready,setReady] = useState(false);
  useEffect(()=>{ if(open){ setReady(true); } },[open]);
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}/>
      <div className="relative w-full max-w-4xl rounded-2xl bg-slate-900 p-4 ring-1 ring-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Pick a variant</h2>
          <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={onClose}>Close</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {images.map((it,idx)=>(
            <button key={idx} className="rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-white/30"
              onClick={()=>{ onPick(it.url); onClose(); }}>
              {ready && <img src={it.url} alt={`variant ${idx+1}`} className="w-full h-full object-cover" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
