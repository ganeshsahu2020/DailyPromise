// src/routes/TestEdge.tsx
import React,{useState}from "react";
import {supabase}from "@/lib/supabase";

type AiTasksResponse={
  tasks?:any[];
  source?:string;
  error?:string;
  details?:string;
};

export default function TestEdge(){
  const[loading,setLoading]=useState(false);
  const[result,setResult]=useState<AiTasksResponse|null>(null);
  const[errorMsg,setErrorMsg]=useState<string>("");

  const callEdge=async()=>{
    setLoading(true);
    setErrorMsg("");
    setResult(null);

    try{
      const{data,error}=await supabase.functions.invoke("ai-generate-targets",{
        body:{
          age:9,
          interests:["lego"],
          prompt:"quick indoor challenge",
          count:3,
        },
      });

      console.log("[TestEdge] invoke result:",{data,error});

      if(error){
        setErrorMsg(error.message||"Unknown error from edge function");
        return;
      }

      setResult(data as AiTasksResponse);
    }catch(e:any){
      console.error("[TestEdge] invoke failed:",e);
      setErrorMsg(e?.message||String(e));
    }finally{
      setLoading(false);
    }
  };

  return(
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 py-8 text-white bg-slate-950">
      <h1 className="text-2xl md:text-3xl font-bold">Test Edge Function</h1>
      <p className="text-sm md:text-base text-white/70 max-w-xl text-center">
        Press the button to call <code className="font-mono">ai-generate-targets</code> via{" "}
        <code className="font-mono">supabase.functions.invoke</code>. Check the browser console
        for full logs; a trimmed JSON preview will show below.
      </p>

      <button
        type="button"
        onClick={callEdge}
        disabled={loading}
        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm md:text-base"
      >
        {loading?"Calling edge function…":"Call ai-generate-targets"}
      </button>

      {errorMsg&&(
        <div className="max-w-xl w-full mt-4 px-4 py-3 rounded-xl border border-rose-500/50 bg-rose-500/10 text-rose-100 text-xs md:text-sm">
          <div className="font-semibold mb-1">Error</div>
          <div className="break-words">{errorMsg}</div>
        </div>
      )}

      {result&&(
        <div className="max-w-3xl w-full mt-4">
          <div className="mb-1 text-xs md:text-sm text-white/60">
            Source: <span className="font-mono text-emerald-300">{result.source||"unknown"}</span>
          </div>
          <pre className="w-full max-h-80 overflow-auto text-xs md:text-sm bg-slate-900/80 border border-white/10 rounded-xl p-3 font-mono whitespace-pre-wrap break-words">
{JSON.stringify(result,null,2)}
          </pre>
        </div>
      )}
    </div>
  );
}
