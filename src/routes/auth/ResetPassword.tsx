import {supabase}from "@/lib/supabase";
import {tpromise}from "@/utils/toastx";
import {useState}from "react";

type HumanCard={id:number;emoji:string;group:string;label:string};

const HUMAN_CARDS:HumanCard[]=[
  {id:1,emoji:"⭐",group:"star",label:"Star 1"},
  {id:2,emoji:"⭐",group:"star",label:"Star 2"},
  {id:3,emoji:"🌙",group:"moon",label:"Moon"},
  {id:4,emoji:"☀️",group:"sun",label:"Sun"},
];

export default function ResetPassword(){
  const [email,setEmail]=useState("");
  const [msg,setMsg]=useState<string|undefined>();
  const [loading,setLoading]=useState(false);

  const [humanSelected,setHumanSelected]=useState<number[]>([]);
  const [humanPassed,setHumanPassed]=useState(false);
  const [humanMsg,setHumanMsg]=useState<string|undefined>();

  function toggleHumanCard(id:number){
    if(humanPassed)return;

    setHumanSelected((prev)=>{
      let next=prev.includes(id)?prev.filter((x)=>x!==id):[...prev,id].slice(-2);

      if(next.length===2){
        const [a,b]=next;
        const ca=HUMAN_CARDS.find((c)=>c.id===a);
        const cb=HUMAN_CARDS.find((c)=>c.id===b);
        if(ca&&cb&&ca.group===cb.group){
          setHumanPassed(true);
          setHumanMsg("Image check complete.");
        }else{
          setHumanMsg("Those don’t match. Try again.");
          setTimeout(()=>{setHumanSelected([]);},250);
        }
      }else{
        setHumanMsg(undefined);
      }

      return next;
    });
  }

  async function onReset(){
    if(!email)return;
    if(!humanPassed){
      setMsg("Please complete the image check before requesting a reset link.");
      return;
    }

    setLoading(true);
    try{
      await tpromise(
        ()=>supabase.auth.resetPasswordForEmail(email,{
          redirectTo:window.location.origin+"/",
        }),
        {
          loading:"Requesting reset link…",
          success:"If this email exists, a reset link was sent.",
          error:(e)=>e?.message||"Could not send reset link",
          sound:"success",
        }
      );
      setMsg("If this email exists, a reset link was sent.");
    }finally{
      setLoading(false);
    }
  }

  return (
    <div className="px-6 py-10 grid place-items-center">
      <div className="w-full max-w-md glass rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-4">Reset password</h1>
        <input
          className="w-full rounded px-3 py-2 text-black mb-2"
          placeholder="Your email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          aria-label="Email"
        />

        {/* Human check */}
        <div className="mb-3 rounded-xl border border-white/15 bg-slate-900/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300 mb-1">
            Step 2 · Confirm you are human
          </div>
          <div className="text-xs text-slate-200 mb-2">
            Tap the <span className="font-semibold">two matching images</span>.
          </div>
          <div className="grid grid-cols-4 gap-2">
            {HUMAN_CARDS.map((c)=>(
              <button
                key={c.id}
                type="button"
                onClick={()=>toggleHumanCard(c.id)}
                className={[
                  "aspect-square rounded-lg flex items-center justify-center text-2xl select-none",
                  "bg-slate-800/80 border transition",
                  humanSelected.includes(c.id)?"border-emerald-400 bg-emerald-500/10":"border-white/10 hover:border-emerald-300/70",
                  humanPassed?"opacity-60 cursor-default":"cursor-pointer",
                ].join(" ")}
                aria-label={c.label}
              >
                {c.emoji}
              </button>
            ))}
          </div>
          {humanMsg&&(
            <div className="mt-2 text-[11px] text-slate-200">
              {humanMsg}
            </div>
          )}
        </div>

        <button
          className="w-full bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded disabled:opacity-60"
          onClick={onReset}
          disabled={loading||!email||!humanPassed}
        >
          {loading?"Sending…":"Send reset link"}
        </button>
        {msg&&<div className="text-sm text-white/80 mt-2">{msg}</div>}
      </div>
    </div>
  );
}
