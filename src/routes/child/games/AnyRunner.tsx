// src/routes/child/games/AnyRunner.tsx
import {useCallback,useEffect,useRef,useState}from "react";
import {Card,CardContent,CardHeader,CardTitle}from "@/components/ui/card";
import {Button}from "@/components/ui/button";
import {useGameContext}from "./gameContext";
import {useChildPointsRollup}from "../useChildPointsRollup";
import {awardPointsWithKey,makeIdemKey}from "@/lib/points";

const AWARD_EVERY=20;
const AWARD_POINTS=5;
const GAME="anyrunner";

export default function AnyRunner(){
  const {childId}=useGameContext();
  const {playGamePoints,reload}=useChildPointsRollup(childId,90);

  const [dist,setDist]=useState(0);
  const [best,setBest]=useState(()=>Number(localStorage.getItem(`${GAME}:best`)||0));
  const [showAward,setShowAward]=useState(false);
  const [running,setRunning]=useState(true);
  const [awardError,setAwardError]=useState<string|null>(null);

  const bestRef=useRef(best);
  const lastAwardSegment=useRef(0);

  useEffect(()=>{bestRef.current=best;},[best]);

  const reset=()=>{
    setDist(0);
    setShowAward(false);
    setAwardError(null);
    lastAwardSegment.current=0;
    setRunning(true);
  };

  const doAward=useCallback(async(segment:number)=>{
    if(!childId)return;
    try{
      const ref=makeIdemKey(GAME,segment);
      await awardPointsWithKey({
        child_uid:childId,
        delta:AWARD_POINTS,
        reason:"game:anyrunner",
        ref,
      });
      setShowAward(true);
      setTimeout(()=>setShowAward(false),1200);
      await reload();
      try{
        window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId}}));
      }catch{}
    }catch(e){
      setAwardError("Points could not be saved right now. They'll keep counting locally.");
      console.error("AnyRunner award error",e);
    }
  },[childId,reload]);

  const step=useCallback(()=>{
    if(!running)return;
    setDist((d)=>{
      const nd=d+1;

      if(nd>bestRef.current){
        bestRef.current=nd;
        setBest(nd);
        try{
          localStorage.setItem(`${GAME}:best`,String(nd));
        }catch{}
      }

      const segment=Math.floor(nd/AWARD_EVERY);
      if(segment>0&&segment>lastAwardSegment.current){
        lastAwardSegment.current=segment;
        void doAward(segment);
      }

      return nd;
    });
  },[doAward,running]);

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.code==="Space"){
        e.preventDefault();
        step();
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[step]);

  const progress=((dist%AWARD_EVERY)/AWARD_EVERY)*100;

  return(
    <Card className="bg-gradient-to-b from-slate-900 to-slate-950 text-white border border-white/20">
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle className="text-base sm:text-lg">AnyRunner</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" onClick={()=>setRunning((r)=>!r)}>
            {running?"Pause":"Resume"}
          </Button>
          <Button size="sm" variant="secondary" onClick={reset}>
            Restart
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-center mb-3">
          <div>
            <div className="text-xs text-white/60">Distance</div>
            <div className="font-semibold text-white text-lg">{dist}</div>
          </div>
          <div>
            <div className="text-xs text-white/60">Best</div>
            <div className="font-semibold text-white text-lg">{best}</div>
          </div>
          <div>
            <div className="text-xs text-white/60">Game Points</div>
            <div className="font-semibold text-emerald-300 text-lg">
              {playGamePoints}
            </div>
          </div>
        </div>

        <div className="mb-2 text-xs text-white/60 text-center">
          Next reward in {Math.max(AWARD_EVERY-(dist%AWARD_EVERY),0)} steps
        </div>
        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-4">
          <div
            className="h-full bg-emerald-400 transition-all"
            style={{width:`${progress}%`}}
          />
        </div>

        {showAward&&(
          <div className="mt-1 text-center text-emerald-300 font-semibold">
            +{AWARD_POINTS} points!
          </div>
        )}

        {awardError&&(
          <div className="mt-2 text-xs text-amber-300 text-center">
            {awardError}
          </div>
        )}

        <div className="mt-4 flex flex-col items-center gap-2">
          <Button size="lg" onClick={step} disabled={!running}>
            Tap to Run!
          </Button>
          <div className="text-[11px] text-white/50 text-center max-w-xs">
            Tap the button or press <span className="font-semibold">Space</span> to run.
            Points are awarded every {AWARD_EVERY} steps.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
