import {useEffect,useRef,useState}from "react";
import {Card,CardContent,CardHeader,CardTitle}from "@/components/ui/card";
import {useGameContext}from "./gameContext";
import {Button}from "@/components/ui/button";
import {Sparkles,RotateCcw,FlameKindling,Clock}from "lucide-react";
import {aiGetWords}from "@/lib/aiGames";
import {useChildPointsRollup}from "../useChildPointsRollup";
import {awardPointsWithKey,makeIdemKey}from "@/lib/points";

const POINTS_PER_CORRECT=3;
const CORRECTS_PER_AWARD=3;
const AWARD_POINTS=5;

const BASE_WORD_TIME=20;
const STREAK_TIME_BONUS=2;
const WRONG_TIME_PENALTY_NEXT=-2;

function shuffle(s:string){
  const arr=s.split("");
  for(let i=arr.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  if(arr.join("")===s)return shuffle(s);
  return arr.join("");
}

function localWord(level:number){
  const banks:string[][]=[
    ["TREE","PLANET","MUSIC","COLOR","LIGHT","SCHOOL","SPACE","SMILE","BRAVE","GREEN"],
    ["ANIMAL","FAMILY","ROCKET","GARDEN","PUZZLE","PURPLE","MONKEY","FLOWER","SUNSET","POCKET"],
    ["ADVENTURE","NOTEBOOK","RAILWAY","DISCOVER","SUNSHINE","FRIENDLY","CAMPFIRE","WATERFALL"],
    ["EXPLORATION","CELEBRATION","IMAGINATION","DISCOVERY","CONNECTION","ADVENTURERS","INVENTIONS"],
  ];
  const band=level<=2?0:level<=4?1:level<=6?2:3;
  const list=banks[band];
  return list[(Math.random()*list.length)|0];
}

function badgeForLevel(level:number){
  if(level<=2)return{label:"Beginner",color:"from-emerald-500/20 to-emerald-500/10"};
  if(level<=4)return{label:"Explorer",color:"from-blue-500/20 to-blue-500/10"};
  if(level<=6)return{label:"Challenger",color:"from-violet-500/20 to-violet-500/10"};
  return{label:"Master",color:"from-amber-500/20 to-amber-500/10"};
}

export default function WordBuilder(){
  const {childId}=useGameContext();
  const {totalPoints,totalCompletions,withEvidence,quickCount,playGamePoints,reload}=useChildPointsRollup(childId,90);

  const [level,setLevel]=useState(1);
  const [loading,setLoading]=useState(false);

  const [target,setTarget]=useState<string>("");
  const [scrambled,setScrambled]=useState<string>("");
  const [guess,setGuess]=useState("");
  const [score,setScore]=useState(0);
  const [corrects,setCorrects]=useState(0);
  const [streak,setStreak]=useState(0);
  const [bestStreak,setBestStreak]=useState(0);
  const [feedback,setFeedback]=useState<"correct"|"incorrect"|null>(null);

  const [pool,setPool]=useState<string[]>([]);
  const [idx,setIdx]=useState(0);

  const [wordTime,setWordTime]=useState(BASE_WORD_TIME);
  const timerRef=useRef<number|null>(null);
  const [paused,setPaused]=useState(false);
  const baseAdjustRef=useRef(0);

  const currentPoolRef=useRef<string[]>([]);
  const currentIdxRef=useRef(0);

  useEffect(()=>{
    currentPoolRef.current=pool;
    currentIdxRef.current=idx;
  },[pool,idx]);

  useEffect(()=>{
    const words=Array.from({length:8},()=>localWord(level));
    setPool(words);
    setIdx(0);
    setOne(words[0],true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function startTimer(seconds:number){
    if(timerRef.current)clearInterval(timerRef.current);
    setWordTime(seconds);
    timerRef.current=window.setInterval(()=>{
      if(paused)return;
      setWordTime((t)=>{
        if(t<=1){
          if(timerRef.current){
            clearInterval(timerRef.current);
            timerRef.current=null;
          }
          handleIncorrect(true);
          return 0;
        }
        return t-1;
      });
    },1000);
  }

  function baseForNextWord(){
    const minBase=12;
    const next=Math.max(minBase,BASE_WORD_TIME+baseAdjustRef.current);
    return next;
  }

  function setOne(word:string,fresh=false){
    if(timerRef.current){
      clearInterval(timerRef.current);
      timerRef.current=null;
    }
    setTarget(word);
    setScrambled(shuffle(word));
    setGuess("");
    setFeedback(null);
    const hasStreakBonus=streak>=3;
    const start=(fresh?baseForNextWord():baseForNextWord())+(hasStreakBonus?STREAK_TIME_BONUS:0);
    startTimer(start);
  }

  async function refillPoolWithTimeout(){
    setLoading(true);
    const timeoutPromise=new Promise<null>((resolve)=>{
      setTimeout(()=>resolve(null),3000);
    });

    try{
      const aiPromise=aiGetWords(level,8,currentPoolRef.current);
      const result=await Promise.race([aiPromise,timeoutPromise]);
      if(result){
        return result;
      }else{
        return Array.from({length:8},()=>localWord(level));
      }
    }catch{
      return Array.from({length:8},()=>localWord(level));
    }finally{
      setLoading(false);
    }
  }

  async function refillPool(){
    const words=await refillPoolWithTimeout();
    setPool(words);
    setIdx(0);
    setOne(words[0],true);
  }

  async function maybeAward(nextCount:number){
    if(!childId)return;
    const segment=Math.floor(nextCount/CORRECTS_PER_AWARD)-1;
    const ref=makeIdemKey("wordbuilder",segment);
    try{
      await awardPointsWithKey({
        child_uid:childId,
        delta:AWARD_POINTS,
        reason:"Word Builder reward",
        ref,
      });
      await reload();
      try{window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId}}));}catch{}
    }catch{}
  }

  function handleCorrect(){
    if(timerRef.current){
      clearInterval(timerRef.current);
      timerRef.current=null;
    }
    setFeedback("correct");
    const newStreak=streak+1;
    setStreak(newStreak);
    setBestStreak((b)=>Math.max(b,newStreak));

    const bonus=newStreak>0&&newStreak%3===0?1:0;
    setScore((s)=>s+POINTS_PER_CORRECT+bonus);

    setCorrects((c)=>{
      const nc=c+1;
      if(nc%CORRECTS_PER_AWARD===0)void maybeAward(nc);
      if(nc%5===0)setLevel((L)=>L+1);
      return nc;
    });

    setTimeout(()=>{void nextWord();},650);
  }

  function handleIncorrect(timeUp=false){
    if(timerRef.current&&!timeUp){
      clearInterval(timerRef.current);
      timerRef.current=null;
    }
    setFeedback("incorrect");
    setStreak(0);
    baseAdjustRef.current=Math.max(-6,baseAdjustRef.current+WRONG_TIME_PENALTY_NEXT);
    if(!timeUp){
      setGuess("");
      setTimeout(()=>setFeedback(null),600);
    }
    if(timeUp)setTimeout(()=>{void nextWord();},400);
  }

  function submit(){
    if(loading||paused)return;
    if(guess.trim().toUpperCase()===target){
      handleCorrect();
    }else{
      handleIncorrect(false);
    }
  }

  function skip(){
    if(loading||paused)return;
    void nextWord();
  }

  function resetAll(){
    if(timerRef.current){
      clearInterval(timerRef.current);
      timerRef.current=null;
    }
    baseAdjustRef.current=0;
    setLevel(1);
    setScore(0);
    setCorrects(0);
    setStreak(0);
    setBestStreak(0);
    setGuess("");
    setFeedback(null);
    const words=Array.from({length:8},()=>localWord(1));
    setPool(words);
    setIdx(0);
    setOne(words[0],true);
    setLoading(false);
  }

  async function nextWord(){
    if(loading)return;
    setFeedback(null);
    const next=currentIdxRef.current+1;
    if(next<currentPoolRef.current.length){
      setIdx(next);
      setOne(currentPoolRef.current[next]);
      return;
    }
    if(timerRef.current){
      clearInterval(timerRef.current);
      timerRef.current=null;
    }
    setWordTime(0);
    await refillPool();
  }

  useEffect(()=>{
    if(pool.length>0&&!loading){
      const newWord=localWord(level);
      setOne(newWord,true);
    }
  },[level]); // eslint-disable-line react-hooks/exhaustive-deps

  const badge=badgeForLevel(level);

  return(
    <Card className="game-card-enhanced bg-white/10 backdrop-blur-lg border border-white/20 text-white">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-gradient-to-br ${badge.color} border border-white/20`}>
            <Sparkles className="w-5 h-5 text-white"/>
          </div>
          <div>
            <CardTitle className="text-lg">🔤 Word Builder</CardTitle>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">{badge.label}</span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 flex items-center gap-1">
                <FlameKindling className="w-3 h-3 text-amber-300"/>
                Streak {streak}
              </span>
              <span className="text-white/40">Best: {bestStreak}</span>
            </div>
            <p className="text-xs text-white/70 mt-1">
              Adaptive timer: streaks add time, mistakes make the next word a bit tighter.
            </p>
          </div>

          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              onClick={()=>setPaused((p)=>!p)}
              className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
              disabled={loading}
            >
              {paused?"Resume":"Pause"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={resetAll}
              className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
              disabled={loading}
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
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 col-span-3 sm:col-span-1">
            <Clock className="w-4 h-4 text-blue-400 mx-auto mb-1"/>
            <div className="text-xl font-bold text-white">{wordTime}s</div>
            <div className="text-xs text-white/60">Word Time</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-white">{score}</div>
            <div className="text-xs text-white/60">Score</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-white">{corrects}</div>
            <div className="text-xs text-white/60">Solved</div>
          </div>
        </div>

        <div
          className={`text-center p-6 rounded-2xl bg-white/5 border-2 transition-all duration-300 ${
            feedback==="correct"
              ?"border-emerald-400/50 bg-emerald-500/20"
              :feedback==="incorrect"
                ?"border-red-400/50 bg-red-500/20"
                :loading
                  ?"border-amber-400/50 bg-amber-500/20"
                  :"border-white/10"
          }`}
        >
          {loading?(
            <div className="text-xl text-amber-200">Loading new words...</div>
          ):(
            <>
              <div className="text-3xl font-bold tracking-widest text-white mb-3">
                {scrambled.split("").join(" ")}
              </div>
              <div className="text-sm text-white/60">
                Type the word and press Enter
              </div>
            </>
          )}
        </div>

        <form onSubmit={(e)=>{e.preventDefault();submit();}} className="flex flex-col gap-3 w-full">
          <input
            value={guess}
            onChange={(e)=>setGuess(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center font-medium focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder={loading?"Loading...":"YOUR GUESS"}
            autoFocus
            disabled={paused||loading}
          />
          <div className="flex flex-col gap-2 w-full">
            <Button
              type="submit"
              className="w-full bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white py-3"
              size="lg"
              disabled={paused||loading}
            >
              Check
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={skip}
              className="w-full bg-white/10 hover:bg-white/20 border-white/20 text-white py-3"
              size="lg"
              disabled={paused||loading}
            >
              <RotateCcw className="w-4 h-4 mr-2"/>
              Skip
            </Button>
          </div>
        </form>

        <div className="flex justify-between items-center text-sm text-white/60">
          <span>Next award in: {CORRECTS_PER_AWARD-(corrects%CORRECTS_PER_AWARD)}</span>
          <span>Level: {level}</span>
        </div>
      </CardContent>
    </Card>
  );
}
