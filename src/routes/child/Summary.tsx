"use client";
import React,{useEffect,useMemo,useState}from "react";
import {Link,useLocation}from "react-router-dom";
import {Button}from "@/components/ui/button";
import {Card}from "@/components/ui/card";
import {Sparkles,Award,CheckCircle2,Zap,ArrowLeft}from "lucide-react";
import {fetchChildBrief}from "@/utils/childAuth";
import {useChildPointsRollup}from "./useChildPointsRollup";
import {supabase}from "@/lib/supabase";

type Brief={
  id?:string;
  child_uid?:string;
  legacy_uid?:string;
  family_id?:string;
  nick_name?:string;
  first_name?:string;
  name?:string;
};

function readChildKeyFromStorage():string{
  let v="";
  try{v=sessionStorage.getItem("child_uid")||v;}catch{}
  try{v=localStorage.getItem("child_portal_child_id")||v;}catch{}
  if(!v){
    try{
      const raw=localStorage.getItem("LS_CHILD");
      if(raw){
        try{
          const o=JSON.parse(raw);
          v=o?.child_uid||o?.id||v;
        }catch{v=raw||v;}
      }
    }catch{}
  }
  return (v||"").trim();
}

function nice(n:number){return new Intl.NumberFormat().format(Number(n||0));}

export default function ChildSummaryPage(){
  const loc=useLocation();
  const [childUid,setChildUid]=useState<string>("");
  const [childName,setChildName]=useState<string>("");

  useEffect(()=>{
    (async()=>{
      try{
        const key=new URLSearchParams(loc.search).get("child")||readChildKeyFromStorage();
        if(!key){setChildUid("");setChildName("");return;}

        const brief=(await fetchChildBrief(key))as Brief;
        const uid=brief.child_uid||brief.legacy_uid||key;
        const nm=brief.nick_name||brief.first_name||brief.name||"Child";
        setChildUid(uid);
        setChildName(nm);
      }catch{
        const key=readChildKeyFromStorage();
        setChildUid(key||"");
        setChildName("Child");
      }
    })();
  },[loc.search]);

  // 🎮 Game/feed rollup – NOT wallet/earnings total
  const {totalPoints,totalCompletions,withEvidence,quickCount}=useChildPointsRollup(childUid,90);

  const subtitle=useMemo(()=>{
    if(!childUid)return "We couldn’t find a child session — please log in on the kiosk.";
    return "All your game points & submissions in one cozy spot ✨ (last 90 days).";
  },[childUid]);

  return(
    <div className="min-h-screen p-4 sm:p-6 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-950">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 sm:p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-lg border border-white/20 shadow-lg">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-purple-300"/>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              <span className="bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                {childName?`${childName}’s All Games Summary`:"All Games Summary"}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-white/70 mt-1">
              {subtitle}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/child">
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20"
            >
              <ArrowLeft className="w-4 h-4 mr-2"/>
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      {!childUid?(
        <Card className="rounded-2xl border border-white/20 bg-white/5 p-6 text-center text-white/80">
          Please sign in on the child kiosk to see your summary.
        </Card>
      ):(
        <div className="space-y-6">
          {/* Top chips – explicitly game/feed points */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="glass-premium rounded-2xl p-3 sm:p-4 text-center border border-white/20">
              <div className="text-lg sm:text-xl font-bold text-yellow-300">
                +{nice(totalPoints)}{" "}
                <span className="text-[10px] align-middle text-white/60">pts</span>
              </div>
              <div className="text-white/60 text-xs mt-1">
                Game & activity points (last 90 days)
              </div>
            </div>

            <div className="glass-premium rounded-2xl p-3 sm:p-4 text-center border border-white/20">
              <div className="text-lg sm:text-xl font-bold text-emerald-300">
                {nice(totalCompletions)}
              </div>
              <div className="text-white/60 text-xs mt-1">Submissions</div>
            </div>

            <div className="glass-premium rounded-2xl p-3 sm:p-4 text-center border border-white/20">
              <div className="text-lg sm:text-xl font-bold text-blue-300">
                {nice(withEvidence)}
              </div>
              <div className="text-white/60 text-xs mt-1">With Evidence</div>
            </div>

            <div className="glass-premium rounded-2xl p-3 sm:p-4 text-center border border-white/20">
              <div className="text-lg sm:text-xl font-bold text-rose-300">
                {nice(quickCount)}
              </div>
              <div className="text-white/60 text-xs mt-1">Quick Complete</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/20 bg-white/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-yellow-300"/>
                <h3 className="text-white font-semibold">Where do these points come from?</h3>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                From all the games and activities that post into your{" "}
                <code className="text-white/80">points_ledger</code> and{" "}
                <code className="text-white/80">child_points_ledger</code> – e.g., Star
                Catcher, Memory Match, Math Sprint, Word Builder and more. This is a
                game/feed view only, not your full wallet balance.
              </p>
            </div>

            <Link
              to="/child/play"
              className="rounded-2xl border border-white/20 bg-white/5 p-5 hover:bg-white/10 transition"
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-emerald-300"/>
                <h3 className="text-white font-semibold">Play more games</h3>
              </div>
              <p className="text-white/70 text-sm">
                Try all the arcade games and rack up those bonuses!
              </p>
            </Link>

            <Link
              to="/child/reports"
              className="rounded-2xl border border-white/20 bg-white/5 p-5 hover:bg-white/10 transition"
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-sky-300"/>
                <h3 className="text-white font-semibold">See full reports</h3>
              </div>
              <p className="text-white/70 text-sm">
                Charts, distributions, and your achievements timeline.
              </p>
            </Link>
          </div>

          <RecentPeek childUid={childUid}/>
        </div>
      )}
    </div>
  );
}

function RecentPeek({childUid}:{childUid:string}){
  const [rows,setRows]=useState<Array<{created_at:string;delta:number;reason:string|null;evidence_count?:number}>>([]);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const sinceISO=new Date(Date.now()-30*24*60*60*1000).toISOString();

        // Resolve both id + child_uid so we don’t miss rows
        let ids=[childUid];
        try{
          const {data}=await supabase
            .from("child_profiles")
            .select("id,child_uid")
            .or(`id.eq.${childUid},child_uid.eq.${childUid}`)
            .limit(1);
          if(Array.isArray(data)&&data[0]){
            const row=data[0] as {id:string;child_uid:string|null};
            ids=Array.from(new Set([childUid,row.id,row.child_uid].filter(Boolean) as string[]));
          }
        }catch{
          // fallback to just the given childUid
        }

        // Prefer child_points_ledger (game/feed-friendly)
        let {data,error}=await supabase
          .from("child_points_ledger")
          .select("points,created_at,reason,evidence_count,child_uid")
          .in("child_uid",ids)
          .gte("created_at",sinceISO)
          .order("created_at",{ascending:false})
          .limit(8);

        if(!error&&Array.isArray(data)&&data.length){
          const mapped=(data||[]).map((r:any)=>({
            created_at:r.created_at,
            delta:Number(r.points||0),
            reason:r.reason??null,
            evidence_count:Number(r.evidence_count||0)
          }));
          if(!cancelled)setRows(mapped);
          return;
        }

        // Fallback to points_ledger
        const q2=await supabase
          .from("points_ledger")
          .select("created_at,delta,reason,child_uid")
          .in("child_uid",ids)
          .gte("created_at",sinceISO)
          .order("created_at",{ascending:false})
          .limit(8);

        if(!cancelled&&Array.isArray(q2.data)){
          setRows((q2.data as any[]).map((r)=>({
            created_at:r.created_at,
            delta:Number(r.delta||0),
            reason:r.reason??null
          })));
        }else if(!cancelled){
          setRows([]);
        }
      }catch{
        if(!cancelled)setRows([]);
      }
    })();
    return()=>{cancelled=true;};
  },[childUid]);

  if(!rows.length)return null;

  return(
    <div className="rounded-2xl border border-white/20 bg-white/5 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-purple-300"/>
        <h3 className="text-white font-semibold">Recent activity</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((r,i)=>(
          <div key={i} className="rounded-xl p-3 border border-white/10 bg-white/5">
            <div className="text-white font-medium">
              {r.reason||"Points earned"}
            </div>
            <div className="text-white/60 text-xs mt-0.5">
              {new Date(r.created_at).toLocaleString()}
            </div>
            <div className="mt-2 inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300">
              +{nice(r.delta)} pts
            </div>
            {typeof r.evidence_count==="number"&&r.evidence_count>0&&(
              <div className="mt-1 text-[11px] text-white/60">
                Evidence: {r.evidence_count}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
