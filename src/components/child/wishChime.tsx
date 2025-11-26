import {useEffect,useMemo,useRef,useState}from "react";
import {supabase}from "@/lib/supabase";
import {toast}from "sonner";
import {X,Trophy,PartyPopper,Sparkles,BadgeCheck}from "lucide-react";

/**
 * WishChime — cheerful, kid-friendly overlay for wish fulfillment.
 *
 * - Inserts are queued; child taps a chip to celebrate (no auto-open).
 * - You can open programmatically:
 *      window.dispatchEvent(new CustomEvent("wishChime:show",{detail:{id,title,message}}))
 *
 * Props
 * - childIds: legacy + canonical IDs (any that may appear in child_uid)
 * - wishChimeUrl: sound file (default /sounds/wish_fulfilled.wav). We auto-fallback to .mp3/.wav.
 * - modalTitle/modalSubtitle: header text
 * - autoDismissMs: default 12000 (set 0 to disable)
 */
type Props={
  childIds:Array<string|null|undefined>;
  wishChimeUrl?:string;
  modalTitle?:string;
  modalSubtitle?:string;
  autoDismissMs?:number;
};

type Celebration={id?:string;title?:string;message?:string;created_at?:string};

/** celebration-worthy notification types (wish + approval + fulfilled) */
const CELEBRATE_TYPES=new Set([
  "wish_fulfilled",
  "reward_approved",
  "reward_fulfilled",
  "redemption_approved",
  "redemption_fulfilled",
  "wishlist_approved"
]);

export default function WishChime({
  childIds,
  wishChimeUrl="/sounds/wish_fulfilled.wav",
  modalTitle="Your wish came true! 💖 Enjoy!",
  modalSubtitle,
  autoDismissMs=12000
}:Props){
  const [open,setOpen]=useState(false);
  const [subtitle,setSubtitle]=useState<string|undefined>(modalSubtitle);
  const [queue,setQueue]=useState<Celebration[]>([]);
  const [active,setActive]=useState<Celebration|null>(null);

  const audioOkRef=useRef(false);
  const chimeRef=useRef<HTMLAudioElement|null>(null);
  const channels=useRef<ReturnType<typeof supabase.channel>[]>([]);
  const lastEnqAtRef=useRef<number>(0);
  const openedAtRef=useRef<number>(0);

  /* ------------ small audio helper with extension fallback ----------------- */
  function createAudioWithFallback(src:string):HTMLAudioElement{
    const el=new Audio();
    const hasExt=/\.(mp3|wav)$/i.test(src);
    const base=hasExt?src.replace(/\.(mp3|wav)$/i,""):src;
    const candidates=[src,`${base}.wav`,`${base}.mp3`]
      .filter((v,i,arr)=>!!v&&arr.indexOf(v)===i);
    let idx=0;
    const tryNext=()=>{
      if(idx<candidates.length){
        el.src=candidates[idx++];
        el.onerror=()=>tryNext();
      }
    };
    tryNext();
    return el;
  }

  /* -------------------- user-gesture gate for audio ------------------------ */
  useEffect(()=>{
    const unlock=()=>{
      audioOkRef.current=true;
      if(!chimeRef.current){
        try{chimeRef.current=createAudioWithFallback(wishChimeUrl);}catch{}
      }
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
    window.addEventListener("pointerdown",unlock,{once:true});
    window.addEventListener("keydown",unlock,{once:true});
    return()=>{
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
  },[wishChimeUrl]);

  /* ---------------------------- id normalization --------------------------- */
  const ids=useMemo(
    ()=>Array.from(new Set((childIds||[]).map((s)=>String(s||"").trim()).filter(Boolean))),
    [childIds]
  );

  /* ------------- realtime: wishlist_notifications INSERT ------------------- */
  useEffect(()=>{
    try{channels.current.forEach((c)=>c.unsubscribe());}catch{}
    channels.current=[];

    if(!ids.length) return;

    const onInsert=(payload:any)=>{
      const n=payload?.new||{};
      const type=String(n.type||"");
      const title=n.title?String(n.title):undefined;
      const message=n.message?String(n.message):undefined;

      if(CELEBRATE_TYPES.has(type)){
        const now=Date.now();
        if(now-lastEnqAtRef.current<1000) return; // cooldown
        lastEnqAtRef.current=now;
        setQueue((q)=>[...q,{id:n.id,title,message,created_at:n.created_at}]);
        toast.success(title||"Wish fulfilled! Tap Celebrate to view 🎉");
      }else{
        if(title||message){
          const msg=title&&message?`${title} — ${message}`:(title||message);
          toast.info(String(msg));
        }
      }
    };

    ids.forEach((id)=>{
      const ch=supabase
        .channel(`wish-chime:${id}`)
        .on("postgres_changes",{event:"INSERT",schema:"public",table:"wishlist_notifications",filter:`child_uid=eq.${id}`},onInsert)
        .subscribe();
      channels.current.push(ch);
    });

    return()=>{
      try{channels.current.forEach((c)=>c.unsubscribe());}catch{}
      channels.current=[];
    };
  },[ids]);

  /* --------------- programmatic open: wishChime:show ----------------------- */
  useEffect(()=>{
    const handler=(e:Event)=>{
      const ce=e as CustomEvent<{id?:string;title?:string;message?:string}>;
      const d=ce.detail||{};
      setQueue((q)=>{
        const match=q.find((c)=>d.id?c.id===d.id:true);
        const chosen=match||{id:d.id,title:d.title,message:d.message};
        setTimeout(()=>openCelebration(chosen),0);
        return match?.id?q.filter((x)=>x.id!==match.id):q;
      });
    };
    window.addEventListener("wishChime:show" as any,handler as any);
    return()=>window.removeEventListener("wishChime:show" as any,handler as any);
  },[]);

  async function openCelebration(c:Celebration|null){
    if(!c) return;
    setActive(c);
    setSubtitle(c.message||c.title||modalSubtitle);
    try{
      if(audioOkRef.current){
        if(!chimeRef.current) chimeRef.current=createAudioWithFallback(wishChimeUrl);
        chimeRef.current.currentTime=0;
        await chimeRef.current.play().catch(()=>{});
      }
    }catch{}
    openedAtRef.current=Date.now();
    setOpen(true);
  }

  function openFromQueue(){
    setQueue((q)=>{
      if(!q.length) return q;
      const c=q[q.length-1];
      setTimeout(()=>openCelebration(c),0);
      return q.slice(0,-1);
    });
  }

  /* ------------------------------ auto-dismiss ----------------------------- */
  useEffect(()=>{
    if(!open||!autoDismissMs||autoDismissMs<=0) return;
    const t=setTimeout(()=>setOpen(false),autoDismissMs);
    return()=>clearTimeout(t);
  },[open,autoDismissMs]);

  /* ------------------------------- esc close ------------------------------- */
  useEffect(()=>{
    if(!open) return;
    const onKey=(e:KeyboardEvent)=>e.key==="Escape"&&setOpen(false);
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open]);

  const backdropClick=()=>{
    const elapsed=Date.now()-openedAtRef.current;
    if(elapsed<250) return;
    setOpen(false);
  };

  return(
    <>
      {/* Floating chip */}
      {queue.length>0&&!open&&(
        <button
          onClick={openFromQueue}
          title="Celebrate"
          className="fixed bottom-4 right-4 z-[190] group inline-flex items-center gap-2 rounded-2xl px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.03]"
        >
          <PartyPopper className="w-5 h-5 animate-pulse"/>
          Celebrate!
          <span className="ml-1 inline-flex items-center justify-center text-xs font-black min-w-5 h-5 px-2 rounded-full bg-white/20">
            {queue.length}
          </span>
        </button>
      )}

      {/* Full-screen overlay */}
      {open&&(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-[radial-gradient(1600px_800px_at_50%_-200px,rgba(34,197,94,0.25),transparent),radial-gradient(1200px_600px_at_20%_120%,rgba(59,130,246,0.20),transparent),linear-gradient(to_bottom,#08111c,#060b13)]" onClick={backdropClick}/>
          <StarsBG/>
          <div className="relative glass-premium border border-emerald-400/50 rounded-3xl p-0 max-w-2xl w-full text-center overflow-hidden animate-in fade-in zoom-in duration-300 shadow-[0_0_40px_rgba(16,185,129,.35)]">
            <div className="relative px-6 pt-8 pb-4 bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-cyan-500/20 border-b border-white/10">
              <div className="absolute -top-12 -left-10 w-48 h-48 rounded-full bg-emerald-500/25 blur-2xl pointer-events-none"/>
              <div className="absolute -bottom-16 -right-12 w-72 h-72 rounded-full bg-cyan-500/25 blur-3xl pointer-events-none"/>
              <div className="mx-auto mb-3 flex items-center justify-center gap-3 text-emerald-200">
                <PartyPopper className="w-9 h-9 animate-bounce"/>
                <h3 className="text-3xl md:text-4xl font-extrabold tracking-tight drop-shadow">Wish Fulfilled!</h3>
                <Sparkles className="w-9 h-9 animate-bounce [animation-delay:150ms]"/>
              </div>
              <div className="text-8xl md:text-9xl leading-none select-none">🎈🎉💖🎊</div>
              <div className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-emerald-400/60 bg-emerald-500/20 text-emerald-100 font-extrabold shadow-md animate-[pop_500ms_ease-out]">
                <BadgeCheck className="w-5 h-5"/>
                Yay! You did it!
              </div>
            </div>

            <div className="px-6 py-7">
              <p className="text-white/95 text-lg md:text-xl font-semibold">{modalTitle}</p>
              {((subtitle)||active?.title||active?.message)&&(
                <p className="text-white/75 text-sm md:text-base mt-2">
                  {subtitle||active?.title||active?.message}
                </p>
              )}
              <div className="mt-7 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black shadow-lg">
                <Trophy className="w-5 h-5"/>
                Celebrate your success!
              </div>
            </div>

            <button
              onClick={()=>setOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-white/10 border border-white/20 text-white/90 hover:bg-white/20"
              aria-label="Close"
              title="Close"
            >
              <X className="w-5 h-5"/>
            </button>

            <ConfettiOverlay onDone={()=>{}}/>
            <CornerSparkles/>
          </div>
        </div>
      )}
    </>
  );
}

/* === Visual helpers ======================================================== */
function StarsBG(){
  return(
    <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(800px_400px_at_50%_0%,black,transparent)]">
      <div className="h-full w-full bg-[url('/noise.png')]"/>
      <div className="absolute inset-0">
        <div className="twinkle absolute left-[15%]top-[22%]"/>
        <div className="twinkle absolute left-[72%]top-[32%][animation-delay:300ms]"/>
        <div className="twinkle absolute left-[42%]top-[66%][animation-delay:600ms]"/>
        <style>{`
          .twinkle::after{content:'✦';font-size:18px;color:rgba(255,255,255,0.8);animation:twinkle 2.2s ease-in-out infinite;}
          @keyframes twinkle{0%,100%{opacity:.1;transform:scale(.8)rotate(0deg);}50%{opacity:1;transform:scale(1.1)rotate(20deg);}}
          @keyframes pop{0%{transform:scale(.8);opacity:0;}100%{transform:scale(1);opacity:1;}}
        `}</style>
      </div>
    </div>
  );
}

function CornerSparkles(){
  return(
    <>
      <div className="pointer-events-none absolute -top-3 -left-3 text-yellow-200/90 animate-pulse">✨</div>
      <div className="pointer-events-none absolute -bottom-3 -right-3 text-pink-200/90 animate-pulse [animation-delay:200ms]">✨</div>
    </>
  );
}

function ConfettiOverlay({onDone}:{onDone:()=>void}){
  const [bits]=useState(()=>Array.from({length:100}).map(()=>({
    id:Math.random().toString(36).slice(2),
    left:Math.random()*100,
    size:16+Math.random()*14,
    delay:Math.random()*0.4,
    duration:2.4+Math.random()*1.8,
    rotate:(Math.random()*360)|0,
    char:["🎉","✨","💖","🎊","🌟","🎈"][Math.floor(Math.random()*6)]
  })));
  useEffect(()=>{
    const t=setTimeout(onDone,3500);
    return()=>clearTimeout(t);
  },[onDone]);
  return(
    <div className="pointer-events-none fixed inset-0 z-[201] overflow-hidden">
      {bits.map((b)=>(
        <div
          key={b.id}
          style={{
            position:"absolute",left:`${b.left}%`,top:"-10%",fontSize:`${b.size}px`,
            transform:`rotate(${b.rotate}deg)`,
            animation:`wish-fall ${b.duration}s ${b.delay}s ease-in forwards`
          }}
        >
          {b.char}
        </div>
      ))}
      <style>{`
        @keyframes wish-fall{0%{transform:translateY(-10vh)rotate(0deg);opacity:0;}12%{opacity:1;}100%{transform:translateY(110vh)rotate(720deg);opacity:0;}}
      `}</style>
    </div>
  );
}
