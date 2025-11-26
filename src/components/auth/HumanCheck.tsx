// src/components/auth/HumanCheck.tsx
import {useEffect,useState}from "react";

type HumanCard={id:number;emoji:string;group:string;label:string};

type ImageGroup={id:string;emoji:string;label:string};

// Expanded pool so puzzles feel fresh more often
const IMAGE_GROUPS:ImageGroup[]=[
  {id:"star",emoji:"⭐",label:"Star"},
  {id:"heart",emoji:"❤️",label:"Heart"},
  {id:"book",emoji:"📚",label:"Book"},
  {id:"key",emoji:"🔑",label:"Key"},
  {id:"moon",emoji:"🌙",label:"Moon"},
  {id:"sun",emoji:"☀️",label:"Sun"},
  {id:"cat",emoji:"🐱",label:"Cat"},
  {id:"dog",emoji:"🐶",label:"Dog"},
  {id:"teddy",emoji:"🧸",label:"Bear"},
  {id:"puzzle",emoji:"🧩",label:"Puzzle"},
  {id:"rocket",emoji:"🚀",label:"Rocket"},
  {id:"car",emoji:"🚗",label:"Car"},
  {id:"rainbow",emoji:"🌈",label:"Rainbow"},
  {id:"icecream",emoji:"🍦",label:"Ice cream"},
  {id:"soccer",emoji:"⚽",label:"Ball"},
  {id:"music",emoji:"🎵",label:"Music"},
];

function shuffleCards(cards:HumanCard[]){
  const arr=[...cards];
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    const tmp=arr[i];
    arr[i]=arr[j];
    arr[j]=tmp;
  }
  return arr;
}

function makePuzzle():HumanCard[]{
  const pool=[...IMAGE_GROUPS];

  // pick one group to be the matching pair
  const matchIdx=Math.floor(Math.random()*pool.length);
  const matchGroup=pool.splice(matchIdx,1)[0];

  // pick two distinct non-matching groups
  const other1=pool.splice(Math.floor(Math.random()*pool.length),1)[0];
  const other2=pool.splice(Math.floor(Math.random()*pool.length),1)[0];

  const cards:HumanCard[]=[
    {id:1,emoji:matchGroup.emoji,group:matchGroup.id,label:`${matchGroup.label} 1`},
    {id:2,emoji:matchGroup.emoji,group:matchGroup.id,label:`${matchGroup.label} 2`},
    {id:3,emoji:other1.emoji,group:other1.id,label:other1.label},
    {id:4,emoji:other2.emoji,group:other2.id,label:other2.label},
  ];

  return shuffleCards(cards);
}

type HumanCheckProps={
  title?:string;
  subtitle?:string;
  disabled?:boolean;
  onChange?:(ok:boolean)=>void;
};

export default function HumanCheck({title,subtitle,disabled,onChange}:HumanCheckProps){
  const [cards,setCards]=useState<HumanCard[]>([]);
  const [selected,setSelected]=useState<number[]>([]);
  const [passed,setPassed]=useState(false);
  const [msg,setMsg]=useState<string|undefined>();

  function resetPuzzle(){
    const next=makePuzzle();
    setCards(next);
    setSelected([]);
    setPassed(false);
    setMsg(undefined);
  }

  // initial puzzle on mount
  useEffect(()=>{
    resetPuzzle();
  },[]);

  // ✅ notify parent *after* render, not while rendering
  useEffect(()=>{
    if(onChange){onChange(passed);}
  },[passed,onChange]);

  function toggleCard(id:number){
    if(disabled||passed)return;

    setSelected((prev)=>{
      const next=prev.includes(id)?prev.filter((x)=>x!==id):[...prev,id].slice(-2);

      if(next.length===2){
        const [a,b]=next;
        const ca=cards.find((c)=>c.id===a);
        const cb=cards.find((c)=>c.id===b);
        if(ca&&cb&&ca.group===cb.group){
          setPassed(true);
          setMsg("Nice! Images match – you’re good to go.");
        }else{
          setMsg("Those don’t match. Try again.");
          setTimeout(()=>{
            setSelected([]);
            setMsg(undefined);
          },300);
        }
      }else{
        setMsg(undefined);
      }

      return next;
    });
  }

  return (
    <div className="mb-3 rounded-xl border border-white/15 bg-slate-900/70 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            {title||"Step 2 · Confirm you are human"}
          </div>
          <div className="text-xs text-slate-200">
            {subtitle||<>Tap the <span className="font-semibold">two matching images</span>.</>}
          </div>
        </div>
        <button
          type="button"
          onClick={resetPuzzle}
          className="text-[10px] text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
        >
          New images
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-2">
        {cards.map((c)=>(
          <button
            key={c.id}
            type="button"
            onClick={()=>toggleCard(c.id)}
            className={[
              "aspect-square rounded-lg flex items-center justify-center text-2xl select-none",
              "bg-slate-800/80 border transition",
              selected.includes(c.id)?"border-emerald-400 bg-emerald-500/10":"border-white/10 hover:border-emerald-300/70",
              passed?"opacity-60 cursor-default":"",
              disabled?"opacity-40 cursor-not-allowed":"",
            ].join(" ")}
            aria-label={c.label}
            disabled={disabled||passed}
          >
            {c.emoji}
          </button>
        ))}
      </div>

      {msg&&(
        <div className="mt-2 text-[11px] text-slate-200">
          {msg}
        </div>
      )}
      {!passed&&(
        <div className="mt-1 text-[10px] text-slate-400">
          This is a simple image check (not a full CAPTCHA).
        </div>
      )}
    </div>
  );
}
