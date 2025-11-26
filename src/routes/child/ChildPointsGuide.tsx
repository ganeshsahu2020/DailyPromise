"use client";

import {useEffect,useMemo,useState}from "react";
import {useNavigate}from "react-router-dom";
import {useChildPointsRollup}from "./useChildPointsRollup";
import {
  ArrowLeft,
  Coins,
  PiggyBank,
  Gamepad2,
  ListChecks,
  Target,
  Star,
  Sparkles,
  HeartHandshake,
  Zap,
  Trophy,
  Info,
  Calculator,
  Plus
}from "lucide-react";

const POINTS_PER_DOLLAR=200;
const CASH_PER_POINT=1/POINTS_PER_DOLLAR;
const MIN_CASH=10;
const MIN_POINTS=POINTS_PER_DOLLAR*MIN_CASH;

type SimKey="daily"|"targets"|"checklists"|"wishlist"|"games";

type SimState={
  daily:number;
  targets:number;
  checklists:number;
  wishlist:number;
  games:number;
};

const DEFAULT_SIM:SimState={
  daily:1,
  targets:1,
  checklists:1,
  wishlist:0,
  games:2
};

const SIM_POINTS_PER_UNIT:Record<SimKey,number>={
  // These are example numbers – actual points still come from parent settings.
  daily:60,      // one strong Daily Adventure
  targets:30,    // one completed target
  checklists:20, // one finished checklist
  wishlist:10,   // one wishlist item approved
  games:5        // one game win
};

function readAnyChildKey():string|null{
  const picks:string[]=[];
  try{
    const v=sessionStorage.getItem("child_uid");
    if(v)picks.push(v);
  }catch{}
  try{
    const v=sessionStorage.getItem("child_id");
    if(v)picks.push(v);
  }catch{}
  try{
    const v=localStorage.getItem("child_portal_child_id");
    if(v)picks.push(v);
  }catch{}
  try{
    const raw=localStorage.getItem("LS_CHILD");
    if(raw){
      try{
        const o=JSON.parse(raw);
        if(o&&o.id)picks.push(String(o.id));
        if(o&&o.child_uid)picks.push(String(o.child_uid));
      }catch{}
    }
  }catch{}
  return picks[0]||null;
}

export default function ChildPointsGuide(){
  const nav=useNavigate();
  const [childKey,setChildKey]=useState<string|null>(null);
  const [sim,setSim]=useState<SimState>(DEFAULT_SIM);

  useEffect(()=>{
    setChildKey(readAnyChildKey());
  },[]);

  const {totalPoints,totalEarned,totalCompletions,withEvidence,quickCount,playGamePoints}=useChildPointsRollup(childKey,90);

  const simTodayPoints=useMemo(()=>{
    let sum=0;
    (Object.keys(sim) as SimKey[]).forEach((k)=>{
      const count=sim[k]||0;
      const perUnit=SIM_POINTS_PER_UNIT[k]||0;
      sum+=count*perUnit;
    });
    return sum;
  },[sim]);

  const simTodayCash=useMemo(
    ()=>Math.round(simTodayPoints*CASH_PER_POINT*100)/100,
    [simTodayPoints]
  );

  const simWeekPoints=simTodayPoints*7;
  const simWeekCash=Math.round(simWeekPoints*CASH_PER_POINT*100)/100;

  const daysToMin=Math.max(
    1,
    simTodayPoints>0?Math.ceil(MIN_POINTS/simTodayPoints):9999
  );

  const alreadyNet=Math.max(0,totalPoints);
  const alreadyEarned=Math.max(0,totalEarned);
  const gameShare=alreadyEarned>0?Math.round((playGamePoints/alreadyEarned)*100):0;

  function adjustSim(key:SimKey,delta:number){
    setSim((prev)=>({
      ...prev,
      [key]:Math.max(0,Math.min(12,(prev[key]||0)+delta))
    }));
  }

  function SimRow(props:{
    type:SimKey;
    label:string;
    subtitle:string;
    icon:"daily"|"targets"|"checklists"|"wishlist"|"games";
  }){
    const {type,label,subtitle,icon}=props;
    const count=sim[type];
    const perUnit=SIM_POINTS_PER_UNIT[type];
    const pts=count*perUnit;

    const baseIconClass="w-5 h-5";
    let iconNode:JSX.Element|null=null;
    if(icon==="daily")iconNode=<Sparkles className={baseIconClass}/>;
    if(icon==="targets")iconNode=<Target className={baseIconClass}/>;
    if(icon==="checklists")iconNode=<ListChecks className={baseIconClass}/>;
    if(icon==="wishlist")iconNode=<Star className={baseIconClass}/>;
    if(icon==="games")iconNode=<Gamepad2 className={baseIconClass}/>;

    const tone=type==="daily"
      ?"from-emerald-500/20 to-teal-500/20"
      :type==="targets"
        ?"from-sky-500/20 to-cyan-500/20"
        :type==="checklists"
          ?"from-indigo-500/20 to-purple-500/20"
          :type==="wishlist"
            ?"from-pink-500/20 to-rose-500/20"
            :"from-yellow-500/20 to-orange-500/20";

    return(
      <div className={`rounded-2xl border border-white/15 bg-gradient-to-br ${tone} p-4 flex flex-col gap-3 hover-lift transition-all`}>
        <div className="flex items-center gap-2 text-white">
          <div className="p-2 rounded-xl bg-black/20">
            {iconNode}
          </div>
          <div>
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-[11px] text-white/70">{subtitle}</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={()=>adjustSim(type,-1)}
              className="w-8 h-8 rounded-full border border-white/30 bg-black/20 flex items-center justify-center text-white hover:bg-black/30 disabled:opacity-40"
              disabled={count<=0}
            >
              <span className="text-lg leading-none">−</span>
            </button>
            <div className="px-3 py-1 rounded-xl bg-black/30 border border-white/20 text-center">
              <div className="text-xs text-white/60">Times today</div>
              <div className="text-lg font-bold text-white">{count}</div>
            </div>
            <button
              type="button"
              onClick={()=>adjustSim(type,1)}
              className="w-8 h-8 rounded-full border border-emerald-400/60 bg-emerald-500/30 flex items-center justify-center text-white hover:bg-emerald-500/50"
            >
              <Plus className="w-4 h-4"/>
            </button>
          </div>

          <div className="text-right">
            <div className="text-xs text-white/60">This gives</div>
            <div className="text-sm font-semibold text-emerald-200">
              +{pts} pts
            </div>
            <div className="text-[10px] text-white/50">
              ({perUnit} pts each)
            </div>
          </div>
        </div>
      </div>
    );
  }

  function InfoChip({children}:{children:React.ReactNode}){
    return(
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-white/20 bg-black/30 text-[11px] text-white/70">
        <Info className="w-3 h-3"/>
        {children}
      </span>
    );
  }

  return(
    <div className="space-y-6">
      {/* Back + tiny stats */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={()=>nav(-1)}
          className="inline-flex items-center gap-2 text-xs md:text-sm text-white/70 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4"/>
          Back
        </button>
        <div className="text-right text-[11px] md:text-xs text-white/60 space-y-1">
          <div>
            Last 90 days net points:{" "}
            <span className="text-emerald-300 font-semibold">
              {alreadyNet}
            </span>
          </div>
          <div>
            Total points earned:{" "}
            <span className="text-sky-300 font-semibold">
              {alreadyEarned}
            </span>{" "}
            · From games:{" "}
            <span className="text-violet-300 font-semibold">
              {playGamePoints} pts ({gameShare}%)
            </span>
          </div>
        </div>
      </div>

      {/* Hero: How my points work */}
      <section className="glass-premium rounded-2xl p-5 border border-white/20 bg-gradient-to-br from-emerald-500/20 via-sky-500/10 to-violet-600/20">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-2xl bg-black/30 border border-emerald-300/40">
              <Coins className="w-7 h-7 text-emerald-200"/>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                How My Points Grow 💫
              </h1>
              <p className="text-white/75 text-sm md:text-base mt-1 max-w-xl">
                Every adventure you do — Daily Activities, Targets, Checklists, Wishlist and
                Games — can give you points. Points can turn into rewards or real-world money
                (with your grown-up’s help).
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <InfoChip>Example rate: {POINTS_PER_DOLLAR} pts ≈ $1.00</InfoChip>
                <InfoChip>Minimum cash-out: {MIN_POINTS} pts (${MIN_CASH.toFixed(0)})</InfoChip>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full lg:w-auto">
            <div className="glass-premium rounded-2xl p-3 border border-white/25 text-center">
              <div className="text-xs text-white/60">Points I can see</div>
              <div className="mt-1 text-xl font-bold text-emerald-300 flex items-center justify-center gap-1">
                <PiggyBank className="w-5 h-5"/>
                {alreadyNet}
              </div>
              <div className="text-[10px] text-white/50">after spends & rewards</div>
            </div>
            <div className="glass-premium rounded-2xl p-3 border border-white/25 text-center">
              <div className="text-xs text-white/60">Good things I finished</div>
              <div className="mt-1 text-xl font-bold text-yellow-300 flex items-center justify-center gap-1">
                <Trophy className="w-5 h-5"/>
                {totalCompletions}
              </div>
              <div className="text-[10px] text-white/50">
                {withEvidence} with photos · {quickCount} quick
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step 1: Ways to earn points */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
              Step 1 · Pick how you’ll earn points today
              <Sparkles className="w-5 h-5 text-yellow-300"/>
            </h2>
            <p className="text-sm text-white/70">
              Tap + and − to imagine how many things you’ll do. This is just a playground — 
              parents set the real points.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Calculator className="w-4 h-4"/>
            Points Planner
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <SimRow
            type="daily"
            label="Daily Adventure"
            subtitle="Morning ☀️, afternoon 🌤️ and evening 🌙 routines."
            icon="daily"
          />
          <SimRow
            type="targets"
            label="Targets"
            subtitle="Special missions you complete and show."
            icon="targets"
          />
          <SimRow
            type="checklists"
            label="Checklists"
            subtitle="Mini lists of tasks for a day or week."
            icon="checklists"
          />
          <SimRow
            type="wishlist"
            label="Wishlist"
            subtitle="Earned points when wishlist items are completed."
            icon="wishlist"
          />
          <SimRow
            type="games"
            label="Play Games"
            subtitle="Star Catcher, Word Builder, Math Sprint & more."
            icon="games"
          />
        </div>
      </section>

      {/* Step 2: Today + Week preview */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-premium rounded-2xl p-5 border border-white/20 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <HeartHandshake className="w-5 h-5 text-emerald-300"/>
            <h3 className="text-white font-semibold">
              Step 2 · See how many points this plan could give
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-center">
              <div className="text-xs text-white/60">Points today (plan)</div>
              <div className="text-2xl font-bold text-emerald-300 mt-1">
                +{simTodayPoints}
              </div>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-center">
              <div className="text-xs text-white/60">Today’s money preview</div>
              <div className="text-2xl font-bold text-sky-300 mt-1">
                ${simTodayCash.toFixed(2)}
              </div>
              <div className="text-[10px] text-white/50">
                if your grown-up approved and saved all
              </div>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-center">
              <div className="text-xs text-white/60">1 week (same plan)</div>
              <div className="text-2xl font-bold text-yellow-300 mt-1">
                +{simWeekPoints}
              </div>
              <div className="text-[10px] text-white/50">
                points in 7 days
              </div>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-center">
              <div className="text-xs text-white/60">Week money preview</div>
              <div className="text-2xl font-bold text-purple-300 mt-1">
                ${simWeekCash.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-white/60 mb-1">
              <span>Progress toward a $10 cash-out example</span>
              <span>
                {simTodayPoints>0
                  ?`~${daysToMin} day(s) of this plan`
                  :"Pick some activities above to see your progress!"}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-yellow-400 transition-all duration-700"
                style={{
                  width:`${Math.max(0,Math.min(100,(simWeekPoints/MIN_POINTS)*100))}%`
                }}
              />
            </div>
            <div className="text-[11px] text-white/55 mt-1">
              This is just an example. Your grown-ups decide real point values, rewards and
              when you can cash-out.
            </div>
          </div>
        </div>

        <div className="glass-premium rounded-2xl p-5 border border-white/20">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-yellow-300"/>
            <h3 className="text-white font-semibold">Step 3 · Power-ups for faster earning</h3>
          </div>
          <ul className="space-y-2 text-sm text-white/80">
            <li>• Finish your full Daily Adventure to stack lots of small points.</li>
            <li>• Add evidence (photos or videos) to Targets and Checklists.</li>
            <li>• Try at least one learning game (Word Builder, Math Sprint, etc.).</li>
            <li>• Keep streaks going — grown-ups love approving consistent effort.</li>
          </ul>
        </div>
      </section>

      {/* Fun look-back card */}
      <section className="glass-premium rounded-2xl p-5 border border-white/20 bg-gradient-to-br from-slate-900/80 to-slate-950/90">
        <div className="flex items-center gap-2 mb-3">
          <Gamepad2 className="w-5 h-5 text-violet-300"/>
          <h3 className="text-white font-semibold">
            My last 90 days · Just for fun
          </h3>
        </div>
        {alreadyEarned===0?(
          <p className="text-sm text-white/70">
            Once you start finishing Daily Adventures, Targets, Checklists, Wishlist items
            and games, your history will appear here. Every tiny effort counts. ✨
          </p>
        ):(
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <div className="text-xs text-white/60">Total earned</div>
              <div className="text-xl font-bold text-emerald-300 mt-1">
                {alreadyEarned} pts
              </div>
              <div className="text-[11px] text-white/50">
                before spends
              </div>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <div className="text-xs text-white/60">Still with me</div>
              <div className="text-xl font-bold text-sky-300 mt-1">
                {alreadyNet} pts
              </div>
              <div className="text-[11px] text-white/50">
                after rewards & cash-outs
              </div>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <div className="text-xs text-white/60">Game rewards</div>
              <div className="text-xl font-bold text-violet-300 mt-1">
                {playGamePoints} pts
              </div>
              <div className="text-[11px] text-white/50">
                ~{gameShare}% of your earned points
              </div>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <div className="text-xs text-white/60">Completed missions</div>
              <div className="text-xl font-bold text-yellow-300 mt-1">
                {totalCompletions}
              </div>
              <div className="text-[11px] text-white/50">
                {withEvidence} with evidence · {quickCount} quick
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Closing encouragement */}
      <section className="glass-premium rounded-2xl p-5 border border-white/20 bg-gradient-to-br from-purple-500/15 to-pink-500/20 text-center">
        <div className="text-4xl mb-2">🌟</div>
        <h4 className="text-white font-bold mb-1">You’re building your own super-wallet!</h4>
        <p className="text-sm text-white/80 max-w-xl mx-auto">
          Every Daily Activity, Target, Checklist, Wishlist win or Game you complete
          shows your effort. Points are just the way we say “Well done, keep going!” 🚀
        </p>
      </section>
    </div>
  );
}
