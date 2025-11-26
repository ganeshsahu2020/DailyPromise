"use client";
import {useEffect,useMemo,useState}from "react";
import {Link}from "react-router-dom";
import {Sparkles,Target as TargetIcon,Gamepad2,Gift,Trophy,CheckCircle,Compass}from "lucide-react";
import {fetchChildBrief}from "@/utils/childAuth";
import {useChildPointsRollup}from "./useChildPointsRollup";
import {fetchChildWalletSummary}from "@/data/wallet";

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
  try{ v=sessionStorage.getItem("child_uid")||v; }catch{}
  try{ v=localStorage.getItem("child_portal_child_id")||v; }catch{}
  if(!v){
    try{
      const raw=localStorage.getItem("LS_CHILD");
      if(raw){
        try{
          const o=JSON.parse(raw);
          v=o?.child_uid||o?.id||v;
        }catch{ v=raw||v; }
      }
    }catch{}
  }
  return (v||"").trim();
}

export default function ChildDashboard(){
  const [childUid,setChildUid]=useState<string>("");
  const [childName,setChildName]=useState<string>("Child");
  const [walletTotal,setWalletTotal]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    (async()=>{
      try{
        const key=readChildKeyFromStorage();
        if(!key){
          setChildUid("");
          setChildName("Child");
          setWalletTotal(null);
          setLoading(false);
          return;
        }

        const brief=(await fetchChildBrief(key)) as Brief;
        const uid=brief.child_uid||brief.legacy_uid||key;
        const nm=brief.nick_name||brief.first_name||brief.name||"Child";
        setChildUid(uid);
        setChildName(nm);

        const canonicalId=(brief.id||key||"").trim();
        if(canonicalId){
          try{
            const summary=await fetchChildWalletSummary(canonicalId);
            // lifetime_earned_pts should now align with Earnings total
            setWalletTotal(
              typeof summary?.lifetime_earned_pts==="number"
                ?summary.lifetime_earned_pts
                :null
            );
          }catch(e){
            console.warn("[ChildDashboard] wallet summary failed",e);
            setWalletTotal(null);
          }
        }else{
          setWalletTotal(null);
        }
      }catch(e){
        console.warn("[ChildDashboard] brief load failed",e);
        const key=readChildKeyFromStorage();
        setChildUid(key||"");
        setChildName("Child");
        setWalletTotal(null);
      }finally{
        setLoading(false);
      }
    })();
  },[]);

  const {
    totalPoints:rawTotalPoints,
    totalCompletions,
    withEvidence,
    quickCount
  }=useChildPointsRollup(childUid||null,90);

  // 1) Normalise rollup total
  const rollupTotal=Number.isFinite(rawTotalPoints as number)
    ?Number(rawTotalPoints)
    :0;

  // 2) Use wallet summary only if it's a positive, valid number
  const walletPts=typeof walletTotal==="number"&&Number.isFinite(walletTotal)
    ?walletTotal
    :null;

  // 3) Final total: prefer wallet if >0, else fall back to rollup
  const totalPoints=walletPts!==null&&walletPts>0
    ?walletPts
    :rollupTotal;

  const safeTotalPoints=Number.isFinite(totalPoints)?totalPoints:0;

  const nice=(n:number)=>new Intl.NumberFormat().format(n);

  const greeting=useMemo(()=>{
    if(!childUid)return "Log in to see your missions and points.";
    if(safeTotalPoints>=200)return "🔥 You’re on a streak!";
    if(safeTotalPoints>=100)return "✨ Awesome progress so far!";
    if(safeTotalPoints>0)return "🌟 Nice work—keep going!";
    return "🚀 Let’s earn your first points!";
  },[childUid,safeTotalPoints]);

  if(loading){
    return(
      <div className="text-white/70 text-center py-8">
        Loading dashboard…
      </div>
    );
  }

  return(
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-white/20">
            <Sparkles className="w-5 h-5 text-emerald-300"/>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Welcome back, {childName||"Child"}!
            </h1>
            <p className="text-white/70 mt-1 text-sm md:text-base">
              {greeting}
            </p>
          </div>
        </div>
      </header>

      {/* Quick stats */}
      {childUid&&(
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="glass-premium rounded-2xl p-3 md:p-4 border border-white/15 text-center">
            <div className="text-lg md:text-xl font-bold text-yellow-300">
              +{nice(safeTotalPoints)}{" "}
              <span className="text-[10px] align-middle text-white/60">pts</span>
            </div>
            <div className="text-white/60 text-xs mt-1">Total Points</div>
          </div>
          <div className="glass-premium rounded-2xl p-3 md:p-4 border border-white/15 text-center">
            <div className="text-lg md:text-xl font-bold text-emerald-300">
              {nice(totalCompletions)}
            </div>
            <div className="text-white/60 text-xs mt-1">Submissions</div>
          </div>
          <div className="glass-premium rounded-2xl p-3 md:p-4 border border-white/15 text-center">
            <div className="text-lg md:text-xl font-bold text-sky-300">
              {nice(withEvidence)}
            </div>
            <div className="text-white/60 text-xs mt-1">With Evidence</div>
          </div>
          <div className="glass-premium rounded-2xl p-3 md:p-4 border border-white/15 text-center">
            <div className="text-lg md:text-xl font-bold text-rose-300">
              {nice(quickCount)}
            </div>
            <div className="text-white/60 text-xs mt-1">Quick Complete</div>
          </div>
        </section>
      )}

      {/* Main CTA: My Targets */}
      <section className="rounded-2xl border border-white/15 bg-slate-900/90 p-5 md:p-6 flex flex-col md:flex-row items-center gap-5">
        <div className="flex-1">
          <h2 className="text-xl md:text-2xl font-semibold text-white flex items-center gap-2 mb-2">
            <TargetIcon className="w-5 h-5 text-emerald-300"/>
            My Targets
          </h2>
          <p className="text-white/70 text-sm md:text-base">
            See all your missions in one place. Mark them done, add evidence, and watch your points grow.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <Link to="/child/targets" className="w-full">
            <button className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm md:text-base shadow-lg">
              View My Targets
            </button>
          </Link>
          <div className="text-[11px] text-white/60 text-center">
            Tip: You can also submit evidence and use the coach inside each mission.
          </div>
        </div>
      </section>

      {/* Optional small helpers (kept light) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/child/play"
          className="rounded-2xl border border-white/15 bg-white/5 p-4 hover:bg-white/10 transition"
        >
          <div className="flex items-center gap-2 mb-1">
            <Gamepad2 className="w-5 h-5 text-emerald-300"/>
            <h3 className="text-white font-semibold text-sm md:text-base">Play games to earn more points</h3>
          </div>
          <p className="text-white/70 text-xs md:text-sm">
            Jump into the arcade and boost your score with fun games.
          </p>
        </Link>

        <Link
          to="/child/wishlist"
          className="rounded-2xl border border-white/15 bg-white/5 p-4 hover:bg-white/10 transition"
        >
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-5 h-5 text-pink-300"/>
            <h3 className="text-white font-semibold text-sm md:text-base">Check your rewards & wishlist</h3>
          </div>
          <p className="text-white/70 text-xs md:text-sm">
            See what you can trade your points for and what you’re wishing for next.
          </p>
        </Link>
      </section>

      {/* Recent wins + Keep growing */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-premium rounded-2xl p-5 border border-white/20">
          <h4 className="text-white font-bold mb-3 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-300"/>
            Recent Wins
          </h4>
          <div className="space-y-2">
            <div className="p-3 rounded-2xl bg-yellow-500/10 border border-yellow-400/30 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-yellow-300 mt-0.5"/>
              <div className="text-sm text-yellow-100">Finished a task yesterday — great job!</div>
            </div>
            <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-start gap-2">
              <Compass className="w-4 h-4 text-cyan-300 mt-0.5"/>
              <div className="text-sm text-cyan-100">Try a task from a new category for bonus fun.</div>
            </div>
          </div>
        </div>

        <div className="glass-premium rounded-2xl p-6 border border-white/20 bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
          <div className="text-4xl mb-2">🌱</div>
          <div className="text-white font-bold mb-1">Keep growing!</div>
          <div className="text-white/80 text-sm">Small steps add up. Pick one target and try for 10 minutes.</div>
        </div>
      </section>
    </div>
  );
}
