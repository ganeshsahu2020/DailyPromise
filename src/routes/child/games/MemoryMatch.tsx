import {useMemo,useRef,useState}from "react";
import {Card,CardContent,CardHeader,CardTitle}from "@/components/ui/card";
import {useGameContext}from "./gameContext";
import {Button}from "@/components/ui/button";
import {Brain,Trophy}from "lucide-react";
import {useChildPointsRollup}from "../useChildPointsRollup";
import {awardPointsWithKey,makeIdemKey}from "@/lib/points";

const EMOJIS=["🐶","🐱","🐼","🦊","🐸","🐵","🐷","🐯"];
const MATCHES_PER_AWARD=4;
const POINTS_PER_AWARD=5;

export default function MemoryMatch(){
  const {childId}=useGameContext();
  const {totalPoints,totalCompletions,withEvidence,quickCount,playGamePoints,reload}=useChildPointsRollup(childId,90);

  const [deck]=useState<string[]>(()=>{
    const base=[...EMOJIS,...EMOJIS];
    for(let i=base.length-1;i>0;i--){
      const j=(Math.random()*(i+1))|0;
      [base[i],base[j]]=[base[j],base[i]];
    }
    return base;
  });
  const [flipped,setFlipped]=useState<number[]>([]);
  const [matched,setMatched]=useState<boolean[]>(new Array(EMOJIS.length*2).fill(false));
  const [moves,setMoves]=useState(0);
  const [found,setFound]=useState(0);
  const awarding=useRef(false);
  const matchSinceAward=useRef(0);

  async function awardPoints(segment:number){
    if(!childId||awarding.current)return;
    awarding.current=true;
    try{
      const ref=makeIdemKey("memory",segment);
      await awardPointsWithKey({
        child_uid:childId,
        delta:POINTS_PER_AWARD,
        reason:"Memory Match reward",
        ref,
      });
      await reload();
      try{window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId}}));}catch{}
    }finally{
      setTimeout(()=>{awarding.current=false;},300);
    }
  }

  function onFlip(i:number){
    if(matched[i]||flipped.includes(i)||flipped.length===2)return;
    const next=[...flipped,i];
    setFlipped(next);

    if(next.length===2){
      setMoves((m)=>m+1);
      const [a,b]=next;
      if(deck[a]===deck[b]){
        setTimeout(()=>{
          const c=matched.slice();
          c[a]=c[b]=true;
          setMatched(c);
          const nf=found+1;
          setFound(nf);
          matchSinceAward.current+=1;
          if(matchSinceAward.current>=MATCHES_PER_AWARD){
            matchSinceAward.current=0;
            const segment=Math.floor(nf/MATCHES_PER_AWARD)-1;
            void awardPoints(segment);
          }
          setFlipped([]);
        },500);
      }else{
        setTimeout(()=>setFlipped([]),1000);
      }
    }
  }

  function resetGame(){
    setFlipped([]);
    setMatched(new Array(EMOJIS.length*2).fill(false));
    setMoves(0);
    setFound(0);
    matchSinceAward.current=0;
  }

  const done=useMemo(()=>matched.every(Boolean),[matched]);

  return(
    <Card className="game-card-enhanced bg-white/10 backdrop-blur-lg border border-white/20 text-white">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/20">
            <Brain className="w-5 h-5 text-pink-300"/>
          </div>
          <div>
            <CardTitle className="text-lg">🧠 Memory Match</CardTitle>
            <p className="text-sm text-white/70 mt-1">
              Flip cards to find pairs. Every {MATCHES_PER_AWARD} pairs = +{POINTS_PER_AWARD} pts.
            </p>
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
        <div className="grid grid-cols-4 gap-3 mx-auto max-w-sm">
          {deck.map((e,i)=>{
            const show=flipped.includes(i)||matched[i];
            return(
              <button
                key={i}
                aria-label={`card ${i}`}
                onClick={()=>onFlip(i)}
                disabled={show||flipped.length===2}
                className={`
                  h-16 w-16 rounded-xl border-2 transition-all duration-300
                  transform hover:scale-105 active:scale-95
                  ${
                    show
                      ?"bg-gradient-to-br from-emerald-500/30 to-green-500/30 border-emerald-400/50 shadow-lg"
                      :"bg-white/10 hover:bg-white/20 border-white/20 hover:border-white/30"
                  }
                  ${matched[i]?"ring-2 ring-yellow-400/50":""}
                `}
              >
                <span className={`text-2xl transition-all duration-300 ${show?"scale-110":"scale-100"}`}>
                  {show?e:"?"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xl font-bold text-white">{moves}</div>
            <div className="text-xs text-white/60">Moves</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xl font-bold text-white">{found}</div>
            <div className="text-xs text-white/60">Matches</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xl font-bold text-white">{EMOJIS.length}</div>
            <div className="text-xs text-white/60">Total</div>
          </div>
        </div>

        {done?(
          <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-400/30">
            <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2"/>
            <div className="text-lg font-bold text-yellow-300">Amazing! You found all pairs!</div>
            <div className="text-sm text-yellow-200/80 mt-1">Completed in {moves} moves</div>
            <Button
              onClick={resetGame}
              className="mt-3 bg-gradient-to-br from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
            >
              Play Again
            </Button>
          </div>
        ):(
          <div className="text-center text-sm text-white/60">
            Next award in: {MATCHES_PER_AWARD-(matchSinceAward.current%MATCHES_PER_AWARD)} matches
          </div>
        )}
      </CardContent>
    </Card>
  );
}
