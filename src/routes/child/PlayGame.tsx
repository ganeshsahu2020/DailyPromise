// src/routes/child/PlayGame.tsx
import {Link,NavLink,Outlet,useLocation}from "react-router-dom";
import {useEffect,useRef,useState}from "react";
import {Card,CardContent,CardHeader,CardTitle}from "@/components/ui/card";
import {Button}from "@/components/ui/button";
import {Gamepad2,Star,Brain,Type,MountainSnow,Calculator,Sparkles,FlameKindling}from "lucide-react";
import {fetchChildBrief}from "@/utils/childAuth";
import {useChildPointsRollup}from "./useChildPointsRollup";
import {GameProvider}from "./games/gameContext";

const games=[
  {
    to:"/child/game/star",
    icon:Star,
    title:"Star Catcher",
    blurb:"Catch falling stars",
    color:"from-yellow-500 to-amber-500",
    bgColor:"from-yellow-500/20 to-amber-500/20",
    borderColor:"border-yellow-400/30"
  },
  {
    to:"/child/game/memory",
    icon:Brain,
    title:"Memory Match",
    blurb:"Flip cards, match pairs",
    color:"from-purple-500 to-pink-500",
    bgColor:"from-purple-500/20 to-pink-500/20",
    borderColor:"border-purple-400/30"
  },
  {
    to:"/child/game/words",
    icon:Type,
    title:"Word Builder",
    blurb:"Unscramble words",
    color:"from-blue-500 to-cyan-500",
    bgColor:"from-blue-500/20 to-cyan-500/20",
    borderColor:"border-blue-400/30"
  },
  {
    to:"/child/game/jump",
    icon:MountainSnow,
    title:"Jumping Game",
    blurb:"Tap to jump",
    color:"from-emerald-500 to-green-500",
    bgColor:"from-emerald-500/20 to-green-500/20",
    borderColor:"border-emerald-400/30"
  },
  {
    to:"/child/game/math",
    icon:Calculator,
    title:"Math Sprint",
    blurb:"Quick math questions",
    color:"from-orange-500 to-red-500",
    bgColor:"from-orange-500/20 to-red-500/20",
    borderColor:"border-orange-400/30"
  },
  {
    to:"/child/game/run",
    icon:FlameKindling,
    title:"AnyRunner",
    blurb:"Endless runner – keep going!",
    color:"from-rose-500 to-fuchsia-500",
    bgColor:"from-rose-500/20 to-fuchsia-500/20",
    borderColor:"border-rose-400/30"
  }
] as const;

export default function PlayGame(){
  const loc=useLocation();
  const [childId,setChildId]=useState<string|null>(null);
  const [childName,setChildName]=useState<string|null>(null);
  const [activePulse,setActivePulse]=useState(0);
  const activeGameRef=useRef<HTMLDivElement|null>(null);

  // Mobile auto-scroll to Active Game on open
  useEffect(()=>{
    const isGameRoute=loc.pathname.startsWith("/child/game/");
    const isMobile=typeof window!=="undefined"&&window.innerWidth<1024;
    if(isGameRoute&&activeGameRef.current){
      const id=window.setTimeout(()=>{
        activeGameRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
      },60);
      return()=>window.clearTimeout(id);
    }
  },[loc.pathname]);

  // Tiny pulse for dots
  useEffect(()=>{
    const interval=setInterval(()=>setActivePulse((prev)=>(prev+1)%games.length),2000);
    return()=>clearInterval(interval);
  },[]);

  // Resolve child identity
  useEffect(()=>{
    const key=sessionStorage.getItem("child_uid")||localStorage.getItem("child_portal_child_id");
    if(!key)return;
    (async()=>{
      try{
        const brief=await fetchChildBrief(key);
        const childUid=(brief as any)?.child_uid||key;
        const name=(brief as any)?.nick_name||(brief as any)?.name||null;
        setChildId(childUid);
        setChildName(name);
      }catch{
        setChildId(key);
      }
    })();
  },[]);

  const {
    totalPoints,
    totalCompletions,
    withEvidence,
    quickCount,
    playGamePoints,
    gameDailyCap,
    gamePointsToday,
    gamePointsTodayRemaining,
    gameCapReached
  }=useChildPointsRollup(childId,90);

  return(
    <GameProvider value={{childId,childName}}>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-950 relative overflow-hidden p-4 sm:p-6">
        {/* Animated BG */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute bottom-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-purple-500/10 to-transparent animate-wave-slow origin-bottom" />
          <div className="absolute bottom-0 left-0 w-[200%] h-3/4 bg-gradient-to-r from-transparent via-blue-500/5 to-transparent animate-wave-medium origin-bottom animation-delay-[-3s]" />
          <div className="absolute bottom-0 left-0 w-[200%] h-1/2 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent animate-wave-fast origin-bottom animation-delay-[-6s]" />
        </div>

        {/* Floating Particles */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          {[...Array(15)].map((_,i)=>(
            <div
              key={i}
              className="absolute w-2 h-2 bg-white rounded-full animate-float"
              style={{
                left:`${Math.random()*100}%`,
                top:`${Math.random()*100}%`,
                animationDelay:`${Math.random()*20}s`,
                animationDuration:`${15+Math.random()*20}s`
              }}
            />
          ))}
        </div>

        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-lg border border-white/20 shadow-lg">
              <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-300" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                  Play Zone
                </span>
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 animate-pulse hidden sm:block" />
                {childName&&(
                  <span className="text-xs sm:text-sm font-normal bg-gradient-to-r from-cyan-200 to-blue-200 bg-clip-text text-transparent">
                    — Ready, {childName}?
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-white/60 mt-1">
                Six mini-games. All your game points tracked in one place. 🎮
              </p>
            </div>
          </div>
          <Link to="/child" className="mt-2 sm:mt-0 self-end sm:self-auto">
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 text-xs sm:text-sm"
            >
              Back
            </Button>
          </Link>
        </header>

        {/* Rollup chips */}
        <div className="relative z-10 mb-5 sm:mb-7">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="px-3 py-1 text-xs sm:text-sm rounded-full bg-white/10 border border-white/15 text-white/90">
              <span className="font-semibold">Total Points</span>{" "}
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-[2px]">
                +{totalPoints} pts
              </span>
            </span>
            <span className="px-3 py-1 text-xs sm:text-sm rounded-full bg-white/10 border border-white/15 text-white/80">
              From Games (counted):{" "}
              <span className="font-semibold text-amber-200 ml-1">+{playGamePoints} pts</span>
            </span>
            <span className="px-3 py-1 text-xs sm:text-sm rounded-full bg-white/10 border border-white/15 text-white/80">
              Today’s Game Limit:{" "}
              <span className={`font-semibold ml-1 ${gameCapReached?"text-red-200":"text-emerald-200"}`}>
                {gamePointsToday}/{gameDailyCap} pts
              </span>
              {gamePointsTodayRemaining>0&&(
                <span className="ml-1 text-[0.7rem] sm:text-xs text-white/70">
                  ({gamePointsTodayRemaining} pts left today)
                </span>
              )}
            </span>
            <span className="px-3 py-1 text-xs sm:text-sm rounded-full bg-white/10 border border-white/15 text-white/80">
              Completions: <span className="font-semibold text-white ml-1">{totalCompletions}</span>
            </span>
            <span className="px-3 py-1 text-xs sm:text-sm rounded-full bg-white/10 border border-white/15 text-white/80">
              With Evidence: <span className="font-semibold text-emerald-200 ml-1">{withEvidence}</span>
            </span>
            <span className="px-3 py-1 text-xs sm:text-sm rounded-full bg-white/10 border border-white/15 text-white/80">
              Quick: <span className="font-semibold text-cyan-200 ml-1">{quickCount}</span>
            </span>
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 sm:gap-3 relative z-10 mb-6 sm:mb-8">
          {games.map((_,index)=>(
            <div
              key={index}
              className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-500 ${
                index===activePulse
                  ? "bg-gradient-to-r from-purple-400 to-pink-400 scale-125 shadow-[0_0_20px_rgba(192,132,252,0.5)]"
                  : "bg-white/20"
              }`}
            />
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 relative z-10">
          {/* Launcher */}
          <section className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {games.map(({to,icon:Icon,title,blurb,color,borderColor})=>(
                <NavLink
                  key={to}
                  to={to}
                  className="group block transition-all duration-300 hover:translate-y-[-2px] sm:hover:translate-y-[-4px]"
                >
                  <Card className={`h-full backdrop-blur-lg border ${borderColor} transition-all duration-300 hover:shadow-lg sm:hover:shadow-2xl hover:shadow-purple-500/20 bg-gradient-to-br from-white/5 to-white/10 hover:from-white/10 hover:to-white/15`}>
                    <CardHeader className="flex-row items-center gap-3 pb-2 sm:pb-3">
                      <div className={`p-2 sm:p-3 rounded-xl bg-gradient-to-br ${color} shadow-lg group-hover:scale-105 sm:group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="w-4 h-4 sm:w-6 h-6 text-white" />
                      </div>
                      <CardTitle className="text-sm sm:text-lg font-semibold text-white group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-200 group-hover:to-pink-200 group-hover:bg-clip-text">
                        {title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs sm:text-sm text-white/70 -mt-2 pb-3 sm:pb-5 leading-relaxed">
                      {blurb}
                    </CardContent>
                  </Card>
                </NavLink>
              ))}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-6 sm:mt-8">
              <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10 bg-white/5 backdrop-blur text-center">
                <div className="text-lg sm:text-2xl font-bold text-emerald-300">{games.length}</div>
                <div className="text-xs text-white/60 mt-1">Games</div>
              </div>
              <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10 bg-white/5 backdrop-blur text-center">
                <div className="text-lg sm:text-2xl font-bold text-purple-300">{totalCompletions}</div>
                <div className="text-xs text-white/60 mt-1">Earned Events</div>
              </div>
              <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10 bg-white/5 backdrop-blur text-center">
                <div className="text-lg sm:text-2xl font-bold text-amber-300">+{playGamePoints}</div>
                <div className="text-xs text-white/60 mt-1">Game Points (counted)</div>
              </div>
            </div>
          </section>

          {/* Active Game */}
          <aside className="lg:sticky lg:top-24 h-fit" ref={activeGameRef} id="active-game">
            <div className="rounded-xl sm:rounded-2xl border border-white/20 bg-gradient-to-br from-slate-800/50 to-slate-900/70 backdrop-blur-xl p-3 sm:p-4 shadow-lg sm:shadow-2xl">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30">
                  <Sparkles className="w-3 h-3 sm:w-4 h-4 text-purple-300" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-white">Active Game</h3>
              </div>
              <Outlet context={{childId,childName}} />
            </div>

            <div className="mt-4 sm:mt-6 rounded-xl sm:rounded-2xl border border-white/20 bg-gradient-to-br from-blue-900/30 to-cyan-900/30 backdrop-blur-xl p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <div className="p-1 sm:p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/30">
                  <Sparkles className="w-3 h-3 text-cyan-300" />
                </div>
                <h4 className="text-sm font-semibold text-white">Tips 🎯</h4>
              </div>
              <div className="space-y-1 sm:space-y-2 text-xs text-white/70">
                <p>• Play different games to boost your points</p>
                <p>• All game points count toward your daily limit of {gameDailyCap} pts</p>
                {gameCapReached?(
                  <p>• You’ve reached today’s game points limit – you can still play for fun, but no more points today</p>
                ):(
                  <p>• You still have {gamePointsTodayRemaining} game pts available to earn today</p>
                )}
              </div>
            </div>
          </aside>
        </div>

        <style>{`
          @keyframes wave-slow { 0%{transform:translateX(0) scaleY(1)} 50%{transform:translateX(-25%) scaleY(1.05)} 100%{transform:translateX(-50%) scaleY(1)} }
          @keyframes wave-medium { 0%{transform:translateX(0) scaleY(1)} 50%{transform:translateX(-25%) scaleY(1.03)} 100%{transform:translateX(-50%) scaleY(1)} }
          @keyframes wave-fast { 0%{transform:translateX(0) scaleY(1)} 50%{transform:translateX(-25%) scaleY(1.02)} 100%{transform:translateX(-50%) scaleY(1)} }
          @keyframes float { 0%,100%{transform:translateY(0) rotate(0);opacity:.7} 50%{transform:translateY(-20px) rotate(180deg);opacity:1} }
          .animate-wave-slow{animation:wave-slow 25s linear infinite}
          .animate-wave-medium{animation:wave-medium 20s linear infinite}
          .animate-wave-fast{animation:wave-fast 15s linear infinite}
          .animate-float{animation:float 20s ease-in-out infinite}
          @media (prefers-reduced-motion: reduce){
            .animate-wave-slow,.animate-wave-medium,.animate-wave-fast,.animate-float{animation:none}
          }
        `}</style>
      </div>
    </GameProvider>
  );
}
