// src/routes/TestSupabasePing.tsx
import {useEffect,useState}from "react";
import {supabase}from "@/lib/supabase";

type PingState={
  status:"idle"|"ok"|"error";
  message:string;
};

export default function TestSupabasePing(){
  const [authState,setAuthState]=useState<PingState>({status:"idle",message:""});
  const [dbState,setDbState]=useState<PingState>({status:"idle",message:""});

  // 🔐 Auth check
  useEffect(()=>{(async()=>{
    try{
      setAuthState({status:"idle",message:"Checking auth…"});
      const {data,error}=await supabase.auth.getUser();
      if(error){
        console.error("[Ping] getUser error:",error);
        setAuthState({status:"error",message:String(error.message||error)});
      }else if(!data?.user){
        setAuthState({status:"error",message:"No user (null). Are you logged in?"});
      }else{
        setAuthState({status:"ok",message:`User: ${data.user.email||data.user.id}`});
      }
    }catch(e:any){
      console.error("[Ping] auth exception:",e);
      setAuthState({status:"error",message:e?.message||String(e)});
    }
  })();},[]);

  // 🗄️ Simple DB check against child_profiles
  useEffect(()=>{(async()=>{
    try{
      setDbState({status:"idle",message:"Checking DB (child_profiles)…"});
      const {data,error}=await supabase
        .from("child_profiles")
        .select("id,child_uid,first_name")
        .limit(1);
      if(error){
        console.error("[Ping] DB error:",error);
        setDbState({status:"error",message:String(error.message||error)});
      }else{
        setDbState({
          status:"ok",
          message:`Got ${data?.length||0} rows from child_profiles`,
        });
      }
    }catch(e:any){
      console.error("[Ping] DB exception:",e);
      setDbState({status:"error",message:e?.message||String(e)});
    }
  })();},[]);

  const box=(title:string,state:PingState)=>{
    const colorClass=
      state.status==="ok"
        ?"text-emerald-300"
        :state.status==="error"
        ?"text-rose-300"
        :"text-white/60";

    return(
      <div className="rounded-xl border border-white/20 bg-slate-900/70 p-4">
        <div className="text-white font-semibold mb-1">{title}</div>
        <div className="text-xs text-white/60">Status: {state.status}</div>
        <div className={`mt-1 text-sm break-words ${colorClass}`}>
          {state.message||"…"}
        </div>
      </div>
    );
  };

  return(
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <div className="max-w-xl w-full space-y-4">
        <h1 className="text-xl font-bold">Supabase Health Check</h1>
        <p className="text-sm text-white/70">
          Use this page to see if auth and DB are reachable from the browser.
        </p>
        {box("Auth – supabase.auth.getUser()",authState)}
        {box("DB – from('child_profiles')",dbState)}
      </div>
    </div>
  );
}
