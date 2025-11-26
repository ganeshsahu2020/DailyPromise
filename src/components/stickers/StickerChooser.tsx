// src/components/stickers/StickerChooser.tsx
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {signedUrlFor} from "@/utils/signedUrl";

type Props={open:boolean;onClose:()=>void;childFolder:string;onPick:(path:string)=>void;bucket?:string;title?:string;};
type Obj={name:string;id:string;updated_at:string;created_at:string;size:number};
type FileRow={path:string;name:string;id:string;updated_at:string;size:number};

async function listRecursive(bucket:string,prefix:string,maxDepth=3):Promise<FileRow[]>{
  const out:FileRow[]=[];
  async function walk(dir:string,depth:number){
    if(depth>maxDepth)return;
    const {data,error}=await supabase.storage.from(bucket).list(dir,{limit:100,offset:0,sortBy:{column:"updated_at",order:"desc"}});
    if(error)return;
    for(const o of (data||[])){
      const isFolder=(o as any).name?.endsWith("/");
      if(isFolder){
        await walk(`${dir}/${o.name.replace(/\/$/,"")}`,depth+1);
      }else{
        out.push({path:`${dir}/${o.name}`,name:o.name,id:(o as any).id,updated_at:(o as any).updated_at,size:(o as any).size});
      }
    }
  }
  await walk(prefix,0);
  return out.sort((a,b)=>a.updated_at<b.updated_at?1:-1);
}

export default function StickerChooser({open,onClose,childFolder,onPick,bucket="stickers",title="Choose a sticker"}:Props){
  const [objects,setObjects]=useState<FileRow[]>([]);
  const [thumbs,setThumbs]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState<string|null>(null);

  useEffect(()=>{(async()=>{
    if(!open)return;
    setLoading(true);setErr(null);
    try{
      const files=await listRecursive(bucket,childFolder,3);
      setObjects(files);

      const signed:Record<string,string>={};
      await Promise.all(files.map(async(f)=>{
        try{ signed[f.id]=await signedUrlFor(bucket,f.path,900); }
        catch{ signed[f.id]="/img/placeholder.png"; }
      }));
      setThumbs(signed);
    }catch(e:any){
      console.error(e);
      setErr(e?.message||"Failed to load stickers.");
    }finally{ setLoading(false); }
  })()},[open,bucket,childFolder]);

  if(!open)return null;

  return(
    <div className="fixed inset-0 z-50 p-4 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose}/>
      <div className="relative z-10 w-full max-w-4xl rounded-2xl bg-[#0B1220] border border-white/15 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-semibold">{title}</div>
          <button onClick={onClose} className="px-3 py-1 rounded-lg bg-white/10 text-white/80 hover:bg-white/20">Close</button>
        </div>

        {loading&&(<div className="text-white/70 text-sm">Loading…</div>)}
        {err&&(<div className="text-red-300 text-sm mb-2">{err}</div>)}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {objects.map((o)=>(
            <button key={o.id} onClick={()=>onPick(o.path)} className="rounded-xl overflow-hidden border border-white/20 bg-white/5 hover:bg-white/10">
              <img src={thumbs[o.id]||"/img/placeholder.png"} alt={o.name} className="w-full h-40 object-contain bg-transparent" loading="lazy"/>
              <div className="px-3 py-2 text-[11px] text-white/60 truncate">{o.path.replace(`${childFolder}/`,"")}</div>
            </button>
          ))}
        </div>

        {!loading&&!objects.length&&(<div className="text-white/60 text-sm mt-3">No stickers yet in this folder.</div>)}
      </div>
    </div>
  );
}
