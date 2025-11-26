// src/routes/child/games/JumpPlatformer.tsx
import {useEffect,useRef,useState}from "react";
import {Card,CardContent,CardHeader,CardTitle}from "@/components/ui/card";
import {Button}from "@/components/ui/button";
import {useGameContext}from "./gameContext";
import {MountainSnow,Play,Pause,RotateCcw,Award}from "lucide-react";
import {useChildPointsRollup}from "../useChildPointsRollup";
import {awardPointsWithKey,makeIdemKey}from "@/lib/points";

const W=360,H=200;
const G=0.6;
const JUMP_V=-8;
const SPEED=3;
const AWARD_EVERY=20;
const AWARD_POINTS=5;

export default function JumpPlatformer(){
  const {childId}=useGameContext();
  const {totalPoints,totalCompletions,withEvidence,quickCount,playGamePoints,reload}=useChildPointsRollup(childId,90);

  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const rafRef=useRef<number|null>(null);

  const [running,setRunning]=useState(true);
  const [dist,setDist]=useState(0);
  const [best,setBest]=useState<number>(()=>Number(localStorage.getItem("jump:best")||0));
  const [showAward,setShowAward]=useState(false);

  const distRef=useRef(0);
  const showAwardRef=useRef(false);
  useEffect(()=>{distRef.current=dist;},[dist]);
  useEffect(()=>{showAwardRef.current=showAward;},[showAward]);

  const p=useRef({x:30,y:150,vy:0,onGround:true});
  const obs=useRef<{x:number;w:number;h:number}[]>([{x:360,w:16,h:30}]);
  const lastAwardedDist=useRef(0);

  function reset(){
    p.current={x:30,y:150,vy:0,onGround:true};
    obs.current=[{x:360,w:16,h:30}];
    setDist(0);
    setRunning(true);
    setShowAward(false);
    lastAwardedDist.current=0;
  }

  async function award(){
    if(!childId)return;
    const segment=Math.floor(distRef.current/AWARD_EVERY);
    const idemKey=makeIdemKey("jump",segment);
    try{
      await awardPointsWithKey({
        child_uid:childId,
        delta:AWARD_POINTS,
        reason:"Jumping Platformer reward",
        ref:idemKey,
      });
      setShowAward(true);
      setTimeout(()=>setShowAward(false),1500);
      await reload();
      try{window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId}}));}catch{}
    }catch{}
  }

  useEffect(()=>{
    const onDown=()=>{
      if(p.current.onGround&&running){
        p.current.vy=JUMP_V;
        p.current.onGround=false;
      }
    };
    window.addEventListener("keydown",onDown);
    window.addEventListener("mousedown",onDown);
    window.addEventListener("touchstart",onDown);
    return()=>{
      window.removeEventListener("keydown",onDown);
      window.removeEventListener("mousedown",onDown);
      window.removeEventListener("touchstart",onDown);
    };
  },[running]);

  useEffect(()=>{
    const c=canvasRef.current!;
    c.width=W;
    c.height=H;
    const ctx=c.getContext("2d")!;
    let stopped=false;

    const loop=()=>{
      if(stopped)return;

      if(running){
        p.current.vy+=G;
        p.current.y+=p.current.vy;
        if(p.current.y>=150){
          p.current.y=150;
          p.current.vy=0;
          p.current.onGround=true;
        }

        obs.current.forEach((o)=>o.x-=SPEED);
        if(obs.current[0].x+obs.current[0].w<0)obs.current.shift();
        if(obs.current[obs.current.length-1].x<220){
          const h=20+Math.random()*40;
          obs.current.push({x:W+((Math.random()*120)|0),w:16,h});
        }

        for(const o of obs.current){
          const px=p.current.x,py=p.current.y,ph=24,pw=18;
          const ox=o.x,oy=150-o.h,oh=o.h,ow=o.w;
          const hit=!(px+pw<ox||px>ox+ow||py+ph<oy||py>oy+oh);
          if(hit){
            setRunning(false);
            if(distRef.current>best){
              setBest(distRef.current);
              localStorage.setItem("jump:best",String(distRef.current));
            }
          }
        }

        setDist((d)=>{
          const nd=d+1;
          if(nd-lastAwardedDist.current>=AWARD_EVERY){
            lastAwardedDist.current=nd;
            void award();
          }
          return nd;
        });
      }

      ctx.clearRect(0,0,W,H);

      const skyGrd=ctx.createLinearGradient(0,0,0,H);
      skyGrd.addColorStop(0,"#0f172a");
      skyGrd.addColorStop(1,"#1e293b");
      ctx.fillStyle=skyGrd;
      ctx.fillRect(0,0,W,H);

      ctx.fillStyle="#374151";
      ctx.fillRect(0,174,W,26);

      const playerGrd=ctx.createLinearGradient(p.current.x,p.current.y,p.current.x,p.current.y+24);
      playerGrd.addColorStop(0,"#7dd3fc");
      playerGrd.addColorStop(1,"#38bdf8");
      ctx.fillStyle=playerGrd;
      ctx.fillRect(p.current.x,p.current.y,18,24);
      ctx.fillStyle="#0ea5e9";
      ctx.fillRect(p.current.x+4,p.current.y+6,10,8);

      obs.current.forEach((o)=>{
        const obsGrd=ctx.createLinearGradient(o.x,150-o.h,o.x,150);
        obsGrd.addColorStop(0,"#f59e0b");
        obsGrd.addColorStop(1,"#d97706");
        ctx.fillStyle=obsGrd;
        ctx.fillRect(o.x,150-o.h,o.w,o.h);
        ctx.fillStyle="#b45309";
        ctx.fillRect(o.x+2,150-o.h+2,o.w-4,4);
      });

      ctx.fillStyle="rgba(255,255,255,0.1)";
      ctx.fillRect(8,8,80,40);
      ctx.fillRect(W-88,8,80,40);

      ctx.fillStyle="#f8fafc";
      ctx.font="bold 12px Inter, ui-sans-serif";
      ctx.fillText(`Dist: ${distRef.current}`,16,24);
      ctx.fillText(`Best: ${best}`,W-80,24);

      if(showAwardRef.current){
        ctx.fillStyle="rgba(34,197,94,0.9)";
        ctx.fillRect(W/2-60,60,120,30);
        ctx.fillStyle="#ffffff";
        ctx.font="bold 12px Inter, ui-sans-serif";
        ctx.textAlign="center";
        ctx.fillText(`+${AWARD_POINTS} Points!`,W/2,80);
        ctx.textAlign="left";
      }

      if(!running&&distRef.current>0){
        ctx.fillStyle="rgba(0,0,0,0.75)";
        ctx.fillRect(0,0,W,H);
        ctx.fillStyle="#fff";
        ctx.font="bold 20px Inter, ui-sans-serif";
        ctx.textAlign="center";
        ctx.fillText("Game Over",W/2,H/2-20);
        ctx.font="14px Inter, ui-sans-serif";
        ctx.fillText(`Distance: ${distRef.current}`,W/2,H/2+5);
        ctx.textAlign="left";
      }

      rafRef.current=requestAnimationFrame(loop);
    };

    rafRef.current=requestAnimationFrame(loop);
    return()=>{
      const id=rafRef.current;
      if(id)cancelAnimationFrame(id);
      rafRef.current=null;
      stopped=true;
    };
  },[running,best]);

  return(
    <Card className="bg-gradient-to-b from-slate-900 to-slate-950 text-white border border-white/20 backdrop-blur-lg">
      <CardHeader className="flex flex-col gap-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-white/20">
            <MountainSnow className="w-5 h-5 text-emerald-300"/>
          </div>
          <div>
            <CardTitle className="text-lg">🏔️ Jumping Platformer</CardTitle>
            <p className="text-sm text-white/70 mt-1">
              Tap to jump over obstacles. Every {AWARD_EVERY} distance = +{AWARD_POINTS} pts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2">
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

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={()=>setRunning((r)=>!r)}
            className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
          >
            {running?<><Pause className="h-4 w-4 mr-2"/>Pause</>:<><Play className="h-4 w-4 mr-2"/>Play</>}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={reset}
            className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
          >
            <RotateCcw className="h-4 w-4 mr-2"/>
            Restart
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full max-w-[480px] rounded-2xl border border-white/10 bg-white/5 backdrop-blur mx-auto"
          />
          {showAward&&(
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-full flex items-center gap-2 animate-bounce">
                <Award className="w-4 h-4"/>
                +{AWARD_POINTS} Points!
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs text-white/60">Distance</div>
            <div className="font-semibold text-white text-lg">{dist}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs text-white/60">Best</div>
            <div className="font-semibold text-white text-lg">{best}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs text-white/60">Next Award</div>
            <div className="font-semibold text-white text-lg">
              {AWARD_EVERY-(dist%AWARD_EVERY)}
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-white/60">
          Press Space, tap, or click to jump. Avoid the obstacles!
        </div>
      </CardContent>
    </Card>
  );
}
