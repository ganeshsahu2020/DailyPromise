import {useEffect,useRef,useState,useCallback}from "react";
import {Button}from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle}from "@/components/ui/card";
import {Pause,Play,Volume2,VolumeX,RotateCcw,Sparkles,Heart}from "lucide-react";
import {useGameContext}from "./gameContext";
import {useChildPointsRollup}from "../useChildPointsRollup";
import {awardPointsWithKey,makeIdemKey}from "@/lib/points";

const GAME_W=360;
const GAME_H=560;
const PLAYER_W=48;
const PLAYER_H=24;
const STAR_SIZE=18;
const START_SPEED=2.2;
const MAX_SPEED=7;
const SPEED_RAMP_INTERVAL=15000;
const STARS_PER_POINT_AWARD=10;
const POINTS_PER_AWARD=5;

interface Star{
  id:number;
  x:number;
  y:number;
  vy:number;
}

export default function StarCatcher(){
  const {childId,childName}=useGameContext();
  const {totalPoints,totalCompletions,withEvidence,quickCount,playGamePoints,reload}=useChildPointsRollup(childId,90);

  const wrapRef=useRef<HTMLDivElement|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const rafRef=useRef<number|null>(null);
  const lastTsRef=useRef<number>(0);

  const [running,setRunning]=useState(true);
  const [muted,setMuted]=useState(false);
  const [score,setScore]=useState(0);
  const [best,setBest]=useState<number>(()=>Number(localStorage.getItem("starcatcher:best")||0));
  const [lives,setLives]=useState(3);
  const [speed,setSpeed]=useState(START_SPEED);
  const [elapsed,setElapsed]=useState(0);
  const [deviceReady,setDeviceReady]=useState(false);
  const [showAward,setShowAward]=useState(false);

  const playerXRef=useRef(GAME_W/2-PLAYER_W/2);
  const playerVxRef=useRef(0);
  const nextStarId=useRef(1);
  const starsRef=useRef<Star[]>([]);
  const ctxRef=useRef<AudioContext|null>(null);

  const beep=useCallback((freq=880,durMs=80)=>{
    if(muted)return;
    try{
      // @ts-ignore
      ctxRef.current=ctxRef.current||new (window.AudioContext||(window as any).webkitAudioContext)();
      const ctx=ctxRef.current!;
      const o=ctx.createOscillator();
      const g=ctx.createGain();
      o.type="sine";
      o.frequency.value=freq;
      g.gain.value=0.06;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(()=>{
        o.stop();
        o.disconnect();
        g.disconnect();
      },durMs);
    }catch{}
  },[muted]);

  const awardPoints=useCallback(async()=>{
    if(!childId)return;
    try{
      const segment=Math.floor(score/STARS_PER_POINT_AWARD);
      const ref=makeIdemKey("starcatcher",segment);
      await awardPointsWithKey({
        child_uid:childId,
        delta:POINTS_PER_AWARD,
        reason:"StarCatcher reward",
        ref,
      });
      setShowAward(true);
      setTimeout(()=>setShowAward(false),1500);
      await reload();
      try{window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId}}));}catch{}
    }catch{}
  },[childId,score,reload]);

  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      if(["ArrowLeft","a","A"].includes(e.key))playerVxRef.current=-5;
      if(["ArrowRight","d","D"].includes(e.key))playerVxRef.current=5;
      if(e.key===" ")setRunning((r)=>!r);
    };
    const up=(e:KeyboardEvent)=>{
      if(["ArrowLeft","a","A","ArrowRight","d","D"].includes(e.key))playerVxRef.current=0;
    };
    window.addEventListener("keydown",down);
    window.addEventListener("keyup",up);
    return()=>{
      window.removeEventListener("keydown",down);
      window.removeEventListener("keyup",up);
    };
  },[]);

  useEffect(()=>{
    const handleOrientation=(e:DeviceOrientationEvent)=>{
      if(!deviceReady)return;
      const gamma=e.gamma??0;
      playerVxRef.current=Math.max(-6,Math.min(6,gamma/5));
    };
    window.addEventListener("deviceorientation",handleOrientation);
    return()=>window.removeEventListener("deviceorientation",handleOrientation);
  },[deviceReady]);

  const resetGame=useCallback(()=>{
    setScore(0);
    setLives(3);
    setSpeed(START_SPEED);
    setElapsed(0);
    starsRef.current=[];
    playerXRef.current=GAME_W/2-PLAYER_W/2;
    playerVxRef.current=0;
    lastTsRef.current=0;
    setRunning(true);
    setShowAward(false);
  },[]);

  const spawnStar=useCallback(()=>{
    const id=nextStarId.current++;
    const x=STAR_SIZE+Math.random()*(GAME_W-STAR_SIZE*2);
    const vy=speed+Math.random()*1.5;
    starsRef.current.push({id,x,y:-STAR_SIZE,vy});
  },[speed]);

  function starPath(ctx:CanvasRenderingContext2D,cx:number,cy:number,spikes:number,outerR:number,innerR:number){
    let rot=(Math.PI/2)*3;
    let x=cx;
    let y=cy;
    ctx.beginPath();
    ctx.moveTo(cx,cy-outerR);
    for(let i=0;i<spikes;i++){
      x=cx+Math.cos(rot)*outerR;
      y=cy+Math.sin(rot)*outerR;
      ctx.lineTo(x,y);
      rot+=Math.PI/5;
      x=cx+Math.cos(rot)*innerR;
      y=cy+Math.sin(rot)*innerR;
      ctx.lineTo(x,y);
      rot+=Math.PI/5;
    }
    ctx.lineTo(cx,cy-outerR);
    ctx.closePath();
  }

  const loop=useCallback((ts:number)=>{
    if(!canvasRef.current)return;
    const ctx=canvasRef.current.getContext("2d");
    if(!ctx)return;

    if(!lastTsRef.current)lastTsRef.current=ts;
    const dt=Math.min(32,ts-lastTsRef.current);
    lastTsRef.current=ts;

    if(running&&lives>0){
      setElapsed((e)=>e+dt);

      if(elapsed>0&&elapsed%SPEED_RAMP_INTERVAL<dt){
        setSpeed((s)=>Math.min(MAX_SPEED,s+0.6));
      }

      if(Math.random()<0.04+speed*0.01)spawnStar();

      playerXRef.current+=playerVxRef.current;
      playerXRef.current=Math.max(0,Math.min(GAME_W-PLAYER_W,playerXRef.current));

      const pLeft=playerXRef.current;
      const pRight=pLeft+PLAYER_W;
      const pTop=GAME_H-42-PLAYER_H;
      const pBottom=pTop+PLAYER_H;

      const kept:Star[]=[];
      for(const s of starsRef.current){
        s.y+=s.vy;
        const sLeft=s.x-STAR_SIZE/2;
        const sRight=s.x+STAR_SIZE/2;
        const sTop=s.y-STAR_SIZE/2;
        const sBottom=s.y+STAR_SIZE/2;
        const overlap=!(sRight<pLeft||sLeft>pRight||sBottom<pTop||sTop>pBottom);
        if(overlap){
          setScore((sc)=>{
            const next=sc+1;
            if(next%STARS_PER_POINT_AWARD===0)void awardPoints();
            return next;
          });
          beep(900,70);
          continue;
        }
        if(s.y>GAME_H+STAR_SIZE){
          setLives((l)=>Math.max(0,l-1));
          beep(220,120);
          continue;
        }
        kept.push(s);
      }
      starsRef.current=kept;
    }

    ctx.clearRect(0,0,GAME_W,GAME_H);

    const grd=ctx.createLinearGradient(0,0,0,GAME_H);
    grd.addColorStop(0,"#0f172a");
    grd.addColorStop(1,"#1e293b");
    ctx.fillStyle=grd;
    ctx.fillRect(0,0,GAME_W,GAME_H);

    for(const s of starsRef.current){
      ctx.shadowColor="#fbbf24";
      ctx.shadowBlur=15;
      starPath(ctx,s.x,s.y,5,STAR_SIZE/2,STAR_SIZE/4.5);
      ctx.fillStyle="#fde047";
      ctx.fill();
      ctx.shadowBlur=0;
    }

    const pX=playerXRef.current;
    const pY=GAME_H-42-PLAYER_H;

    const playerGrd=ctx.createLinearGradient(pX,pY,pX,pY+PLAYER_H);
    playerGrd.addColorStop(0,"#7dd3fc");
    playerGrd.addColorStop(1,"#38bdf8");
    ctx.fillStyle=playerGrd;
    ctx.fillRect(pX,pY,PLAYER_W,PLAYER_H);
    ctx.fillStyle="#0ea5e9";
    ctx.fillRect(pX+8,pY-10,PLAYER_W-16,10);

    ctx.fillStyle="rgba(255,255,255,0.1)";
    ctx.fillRect(8,8,100,60);
    ctx.fillRect(GAME_W-108,8,100,30);

    ctx.fillStyle="#f8fafc";
    ctx.font="bold 14px Inter, ui-sans-serif";
    ctx.fillText(`Score: ${score}`,16,24);
    ctx.fillText(`Lives: ${lives}`,16,44);
    ctx.fillText(`Best: ${best}`,GAME_W-100,24);
    ctx.fillText(`Speed: ${speed.toFixed(1)}x`,16,64);

    if(showAward){
      ctx.fillStyle="rgba(34,197,94,0.9)";
      ctx.fillRect(GAME_W/2-80,80,160,40);
      ctx.fillStyle="#ffffff";
      ctx.font="bold 14px Inter, ui-sans-serif";
      ctx.textAlign="center";
      ctx.fillText(`+${POINTS_PER_AWARD} Points!`,GAME_W/2,105);
      ctx.textAlign="left";
    }

    if(lives<=0){
      ctx.fillStyle="rgba(0,0,0,0.75)";
      ctx.fillRect(0,0,GAME_W,GAME_H);
      ctx.fillStyle="#fff";
      ctx.font="bold 24px Inter, ui-sans-serif";
      ctx.textAlign="center";
      ctx.fillText("Game Over",GAME_W/2,GAME_H/2-20);
      ctx.font="14px Inter, ui-sans-serif";
      ctx.fillText("Tap Restart",GAME_W/2,GAME_H/2+6);
      ctx.textAlign="left";
    }else if(!running){
      ctx.fillStyle="rgba(0,0,0,0.65)";
      ctx.fillRect(0,0,GAME_W,GAME_H);
      ctx.fillStyle="#fff";
      ctx.font="bold 22px Inter, ui-sans-serif";
      ctx.textAlign="center";
      ctx.fillText("Paused",GAME_W/2,GAME_H/2);
      ctx.textAlign="left";
    }

    rafRef.current=requestAnimationFrame(loop);
  },[running,lives,speed,elapsed,score,best,beep,spawnStar,awardPoints,showAward]);

  useEffect(()=>{
    const c=canvasRef.current;
    if(!c)return;
    c.width=GAME_W;
    c.height=GAME_H;
    const tick=(ts:number)=>loop(ts);
    rafRef.current=requestAnimationFrame(tick);
    return()=>{
      if(rafRef.current)cancelAnimationFrame(rafRef.current);
    };
  },[loop]);

  useEffect(()=>{
    if(score>best){
      setBest(score);
      localStorage.setItem("starcatcher:best",String(score));
    }
  },[score,best]);

  useEffect(()=>{
    const handler=()=>{
      if(lives<=0)resetGame();
    };
    canvasRef.current?.addEventListener("click",handler);
    return()=>canvasRef.current?.removeEventListener("click",handler);
  },[lives,resetGame]);

  return(
    <Card className="bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100 border border-white/20 backdrop-blur-lg">
      <CardHeader className="flex flex-col gap-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-white/20">
            <Sparkles className="w-5 h-5 text-yellow-300"/>
          </div>
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              ⭐ Star Catcher
              {childName&&(
                <span className="bg-gradient-to-r from-yellow-200 to-amber-200 bg-clip-text text-transparent">
                  — Go, {childName}!
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-white/70 mt-1">
              Catch the falling stars. Miss three and it's over. Every {STARS_PER_POINT_AWARD} stars = +{POINTS_PER_AWARD} pts.
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

        <div className="flex items-center gap-2 mt-1">
          <Button
            size="icon"
            variant="secondary"
            onClick={()=>setRunning((r)=>!r)}
            className="bg-white/10 border-white/20 hover:bg-white/20"
            aria-label={running?"Pause":"Play"}
          >
            {running?<Pause className="h-4 w-4"/>:<Play className="h-4 w-4"/>}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={()=>setMuted((m)=>!m)}
            className="bg-white/10 border-white/20 hover:bg-white/20"
            aria-label={muted?"Unmute":"Mute"}
          >
            {muted?<VolumeX className="h-4 w-4"/>:<Volume2 className="h-4 w-4"/>}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={resetGame}
            className="bg-white/10 border-white/20 hover:bg-white/20"
            aria-label="Restart"
          >
            <RotateCcw className="h-4 w-4"/>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          ref={wrapRef}
          className="mx-auto w-full aspect-[9/14] max-w-[360px] rounded-2xl overflow-hidden ring-1 ring-white/10 relative bg-white/5 backdrop-blur"
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"/>
          <div className="absolute inset-x-0 bottom-0 flex items-stretch gap-2 p-3">
            <button
              className="flex-1 h-12 rounded-xl bg-white/5 backdrop-blur ring-1 ring-white/10 active:translate-y-[1px] transition-all hover:bg-white/10 text-white font-bold"
              onTouchStart={()=>{playerVxRef.current=-5;}}
              onMouseDown={()=>{playerVxRef.current=-5;}}
              onTouchEnd={()=>{playerVxRef.current=0;}}
              onMouseUp={()=>{playerVxRef.current=0;}}
              aria-label="Move left"
            >
              ◀
            </button>
            <button
              className="flex-1 h-12 rounded-xl bg-white/5 backdrop-blur ring-1 ring-white/10 active:translate-y-[1px] transition-all hover:bg-white/10 text-white font-bold"
              onTouchStart={()=>{playerVxRef.current=5;}}
              onMouseDown={()=>{playerVxRef.current=5;}}
              onTouchEnd={()=>{playerVxRef.current=0;}}
              onMouseUp={()=>{playerVxRef.current=0;}}
              aria-label="Move right"
            >
              ▶
            </button>
            <button
              className="w-14 h-12 rounded-xl bg-white/5 backdrop-blur ring-1 ring-white/10 active:translate-y-[1px] transition-all hover:bg-white/10 text-white font-bold"
              onClick={()=>setRunning((r)=>!r)}
              aria-label="Pause or Play"
            >
              {running?"II":">"}
            </button>
          </div>
          <div className="absolute top-2 right-2">
            {!deviceReady&&(
              <Button
                size="sm"
                variant="secondary"
                onClick={()=>setDeviceReady(true)}
                className="bg-white/10 backdrop-blur border-white/20"
              >
                Enable Tilt
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs text-white/60">Score</div>
            <div className="font-semibold text-white text-lg">{score}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs text-white/60">Best</div>
            <div className="font-semibold text-white text-lg">{best}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs text-white/60 flex items-center justify-center gap-1">
              <Heart className="w-3 h-3 text-red-400 fill-red-400"/>
              Lives
            </div>
            <div className="font-semibold text-white text-lg">{lives}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs text-white/60">Speed</div>
            <div className="font-semibold text-white text-lg">{speed.toFixed(1)}x</div>
          </div>
        </div>

        <div className="text-center text-xs text-white/60">
          Use arrow keys, buttons, or tilt to move. Every {STARS_PER_POINT_AWARD} stars = +{POINTS_PER_AWARD} points!
        </div>
      </CardContent>
    </Card>
  );
}
