import {useEffect,useRef,useState}from "react";
import {Card,CardContent,CardHeader,CardTitle}from "@/components/ui/card";
import {Button}from "@/components/ui/button";
import {useGameContext}from "./gameContext";
import {Calculator,Clock,Award,RotateCcw,Sparkles,FlameKindling}from "lucide-react";
import {aiGetMath}from "@/lib/aiGames";
import {useChildPointsRollup}from "../useChildPointsRollup";
import {awardPointsWithKey,makeIdemKey}from "@/lib/points";

type Q={a:number;b:number;op:"+"|"-"|"*"|"/"|"×"|"÷";ans:number};

function localMakeQ(level:number):Q{
  const band=
    level<=2?{max:10,ops:["+","-"]as const}
    :level<=4?{max:20,ops:["+","-","*"]as const}
    :level<=6?{max:50,ops:["+","-","*","/"]as const}
    :{max:100,ops:["+","-","*","/"]as const};

  let a=(Math.random()*(band.max+1))|0;
  let b=(Math.random()*(band.max+1))|0;
  const op=band.ops[(Math.random()*band.ops.length)|0];

  if(op==="/"){
    b=Math.max(1,b);
    const k=Math.max(1,((Math.random()*9)|0));
    a=b*k;
  }
  const ans=op==="+"?a+b:op==="-"?a-b:op==="*"?a*b:Math.trunc(a/b);
  return{a,b,op,ans};
}

const SECS=60;
const CORRECT_POINTS=2;
const EVERY_CORRECTS=5;
const AWARD_POINTS=5;
const BATCH=6;

const CORRECT_TIME_BONUS=2;
const WRONG_TIME_PENALTY=2;
const STREAK_BONUS_STEP=3;
const STREAK_AWARD_STEP=9;

function badgeForLevel(level:number){
  if(level<=2)return{label:"Beginner",color:"from-emerald-500/20 to-emerald-500/10"};
  if(level<=4)return{label:"Explorer",color:"from-blue-500/20 to-blue-500/10"};
  if(level<=6)return{label:"Challenger",color:"from-violet-500/20 to-violet-500/10"};
  return{label:"Master",color:"from-amber-500/20 to-amber-500/10"};
}

function prettyOp(op:Q["op"]){
  if(op==="*"||op==="×")return"×";
  if(op==="/"||op==="÷")return"÷";
  return op;
}

export default function MathSprint(){
  const {childId}=useGameContext();
  const {totalPoints,totalCompletions,withEvidence,quickCount,playGamePoints,reload}=useChildPointsRollup(childId,90);

  const [time,setTime]=useState(SECS);
  const [level,setLevel]=useState(1);
  const [score,setScore]=useState(0);
  const [corrects,setCorrects]=useState(0);
  const [streak,setStreak]=useState(0);
  const [bestStreak,setBestStreak]=useState(0);
  const [gameActive,setGameActive]=useState(true);
  const [showAward,setShowAward]=useState(false);
  const [flashBonus,setFlashBonus]=useState<null|string>(null);

  const [pool,setPool]=useState<Q[]>([]);
  const [qIdx,setQIdx]=useState(0);
  const [input,setInput]=useState("");

  const awardedFinalRef=useRef(false);
  const loading=useRef(false);
  const timeRef=useRef(SECS);
  timeRef.current=time;

  useEffect(()=>{
    if(!gameActive)return;
    const id=setInterval(()=>setTime((x)=>Math.max(0,x-1)),1000);
    return()=>clearInterval(id);
  },[gameActive]);

  useEffect(()=>{
    if(time===0){
      setGameActive(false);
      setInput("");
    }
  },[time]);

  useEffect(()=>{
    if(!childId)return;
    if(!gameActive&&!awardedFinalRef.current){
      awardedFinalRef.current=true;
      const finalScore=Math.max(0,score);
      if(finalScore>0){
        void onWin(finalScore);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gameActive]);

  useEffect(()=>{
    let cancelled=false;
    async function loadBatch(){
      loading.current=true;
      try{
        const ai=await aiGetMath(level,BATCH);
        const items=
          ai&&Array.isArray(ai)&&ai.length
            ?ai.map((r)=>({a:r.a|0,b:r.b|0,op:r.op as Q["op"],ans:r.ans|0}))
            :Array.from({length:BATCH},()=>localMakeQ(level));
        if(!cancelled){
          setPool(items);
          setQIdx(0);
        }
      }catch{
        if(!cancelled){
          setPool(Array.from({length:BATCH},()=>localMakeQ(level)));
          setQIdx(0);
        }
      }finally{
        loading.current=false;
      }
    }
    loadBatch();
    return()=>{cancelled=true;};
  },[level]);

  async function awardLedgerByCorrects(nextCount:number){
    if(!childId)return;
    const segment=Math.floor(nextCount/EVERY_CORRECTS)-1;
    try{
      await awardPointsWithKey({
        child_uid:childId,
        delta:AWARD_POINTS,
        reason:"Math Sprint reward",
        ref:makeIdemKey("mathsprint",segment),
      });
      setShowAward(true);
      setTimeout(()=>setShowAward(false),1200);
      await reload();
      try{window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId}}));}catch{}
    }catch{}
  }

  async function onWin(finalScore:number){
    if(!childId)return;
    try{
      const ref=makeIdemKey("mathsprint:final",finalScore);
      await awardPointsWithKey({
        child_uid:childId,
        delta:finalScore,
        reason:"MathSprint win",
        ref,
      });
      await reload();
      try{window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId}}));}catch{}
    }catch{}
  }

  function currentQ():Q{
    return pool[qIdx]??localMakeQ(level);
  }

  async function nextQ(){
    const next=qIdx+1;
    if(next<pool.length){
      setQIdx(next);
      setInput("");
      return;
    }
    if(!loading.current){
      try{
        loading.current=true;
        const ai=await aiGetMath(level,BATCH);
        const items=
          ai&&ai.length
            ?ai.map((r)=>({a:r.a|0,b:r.b|0,op:r.op as Q["op"],ans:r.ans|0}))
            :Array.from({length:BATCH},()=>localMakeQ(level));
        setPool(items);
        setQIdx(0);
      }finally{
        loading.current=false;
      }
    }
    setInput("");
  }

  function applyTimeDelta(delta:number){
    const t=Math.max(0,Math.min(SECS,timeRef.current+delta));
    setTime(t);
  }

  function submit(){
    if(!gameActive)return;
    const q=currentQ();
    if(Number(input)===q.ans){
      applyTimeDelta(CORRECT_TIME_BONUS);
      const newStreak=streak+1;
      setStreak(newStreak);
      if(newStreak>bestStreak)setBestStreak(newStreak);

      let bonus=0;
      if(newStreak>0&&newStreak%STREAK_BONUS_STEP===0){
        bonus=1;
        setFlashBonus("+1 Streak Bonus!");
        setTimeout(()=>setFlashBonus(null),800);
      }

      setScore((s)=>s+CORRECT_POINTS+bonus);

      setCorrects((c)=>{
        const nc=c+1;
        if(nc%EVERY_CORRECTS===0)void awardLedgerByCorrects(nc);
        if(nc%4===0)setLevel((L)=>L+1);
        return nc;
      });

      if(newStreak>0&&newStreak%STREAK_AWARD_STEP===0&&childId){
        const seg=Math.floor(newStreak/STREAK_AWARD_STEP);
        void awardPointsWithKey({
          child_uid:childId,
          delta:AWARD_POINTS,
          reason:"Math Sprint hot streak!",
          ref:makeIdemKey("mathsprint:streak",seg),
        }).then(async()=>{
          setShowAward(true);
          setTimeout(()=>setShowAward(false),1200);
          await reload();
          try{window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId}}));}catch{}
        }).catch(()=>{});
      }
    }else{
      applyTimeDelta(-WRONG_TIME_PENALTY);
      setStreak(0);
    }
    void nextQ();
  }

  function reset(){
    setTime(SECS);
    setLevel(1);
    setScore(0);
    setCorrects(0);
    setStreak(0);
    setBestStreak(0);
    setInput("");
    setGameActive(true);
    setShowAward(false);
    setPool([]);
    setQIdx(0);
    awardedFinalRef.current=false;
  }

  const q=currentQ();
  const progress=(time/SECS)*100;
  const badge=badgeForLevel(level);
  const displayOp=prettyOp(q.op);

  return(
    <Card className="bg-gradient-to-b from-slate-900 to-slate-950 text-white border border-white/20 backdrop-blur-lg">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-gradient-to-br ${badge.color} border border-white/10`}>
              <Calculator className="w-5 h-5 text-white"/>
            </div>
            <div>
              <CardTitle className="text-lg">🧮 Math Sprint</CardTitle>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">{badge.label}</span>
                <span className="text-white/60">Streak:</span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 flex items-center gap-1">
                  <FlameKindling className="w-3 h-3 text-amber-300"/>
                  {streak}
                </span>
                <span className="text-white/40">Best: {bestStreak}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Button
              size="sm"
              onClick={()=>setGameActive((g)=>!g)}
              className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
            >
              {gameActive?"Pause":"Play"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={reset}
              className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
            >
              <RotateCcw className="w-4 h-4"/>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="px-3 py-1 text-xs rounded-full bg-white/10 border border-white/15">
            Game Points{" "}
            <span className="ml-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-[2px]">
              +{playGamePoints} pts
            </span>
          </span>
          <span className="px-3 py-1 text-xs rounded-full bg-white/10 border border-white/15">
            Wallet: <strong className="ml-1">{totalPoints}</strong>
          </span>
          <span className="px-3 py-1 text-xs rounded-full bg-white/10 border border-white/15">
            Completions: <strong className="ml-1">{totalCompletions}</strong>
          </span>
          <span className="px-3 py-1 text-xs rounded-full bg-white/10 border border-white/15">
            With Evidence: <strong className="ml-1 text-emerald-200">{withEvidence}</strong>
          </span>
          <span className="px-3 py-1 text-xs rounded-full bg-white/10 border border-white/15">
            Quick: <strong className="ml-1 text-cyan-200">{quickCount}</strong>
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-green-400 to-blue-400 transition-all duration-1000"
            style={{width:`${progress}%`}}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <Clock className="w-4 h-4 text-blue-400 mx-auto mb-1"/>
            <div className="text-xl font-bold text-white">{time}s</div>
            <div className="text-xs text-white/60">Time</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <Award className="w-4 h-4 text-yellow-400 mx-auto mb-1"/>
            <div className="text-xl font-bold text-white">{score}</div>
            <div className="text-xs text-white/60">Score</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xl font-bold text-white">{level}</div>
            <div className="text-xs text-white/60">Level</div>
          </div>
        </div>

        <div className="text-center p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10 relative">
          {showAward&&(
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full">
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 animate-bounce">
                <Sparkles className="w-3 h-3"/>
                +{AWARD_POINTS} Points!
              </div>
            </div>
          )}
          {flashBonus&&(
            <div className="absolute top-2 right-2 text-emerald-300 text-xs font-semibold bg-emerald-500/10 border border-emerald-400/30 rounded-full px-2 py-0.5">
              {flashBonus}
            </div>
          )}

          <div className="text-2xl sm:text-4xl font-bold text-white mb-2 flex flex-wrap justify-center items-center gap-1 sm:gap-3 font-mono tabular-nums">
            <span className="bg-white/10 px-3 py-1 rounded-lg">{currentQ().a}</span>
            <span className="text-cyan-300 mx-3">{displayOp}</span>
            <span className="bg-white/10 px-3 py-1 rounded-lg">{currentQ().b}</span>
            <span className="mx-3">=</span>
            <span className="text-yellow-300 bg-yellow-500/20 px-3 py-1 rounded-lg">?</span>
          </div>

          <div className="text-xs sm:text-sm text-white/60 mt-2">
            Correct adds time. Mistakes reduce time. Keep the streak alive!
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={(e)=>{e.preventDefault();submit();}} className="flex flex-col gap-3 w-full">
            <input
              value={input}
              onChange={(e)=>setInput(e.target.value.replace(/[^0-9-]/g,""))}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center font-bold text-lg sm:text-xl focus:outline-none focus:ring-2 focus:ring-green-400/50"
              inputMode="numeric"
              placeholder="Your answer"
              disabled={!gameActive}
              autoFocus
            />
            <div className="flex flex-col gap-2 w-full">
              <Button
                type="submit"
                disabled={!gameActive}
                className="w-full bg-gradient-to-br from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white py-3"
                size="lg"
              >
                Check
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={()=>{setInput("");void nextQ();}}
                disabled={!gameActive}
                className="w-full bg-white/10 border-white/20 hover:bg-white/20 text-white py-3"
                size="lg"
              >
                Skip
              </Button>
            </div>
          </form>

          <div className="text-center space-y-2">
            <div className="text-sm text-white/70">
              Every {EVERY_CORRECTS} correct = +{AWARD_POINTS} pts
            </div>
            <div className="flex justify-center items-center gap-4 text-xs text-white/50">
              <span>Next award: {EVERY_CORRECTS-(corrects%EVERY_CORRECTS)}</span>
              <span>•</span>
              <span>Streak bonus each {STREAK_BONUS_STEP} in a row</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
