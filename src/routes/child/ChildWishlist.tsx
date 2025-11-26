"use client";
import {useEffect,useRef,useState}from "react";
import {useNavigate,Link}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {Star,Sparkles,Target,Gift,Trophy,Plus,Bell,Mic,Square,Wand2,X,Check}from "lucide-react";
import {toast}from "sonner";
import {tpromise}from "@/utils/toastx";

// ✅ Wallet
import {useWallet}from "@/hooks/useWallet";
import {fetchReservedOffers}from "@/data/wallet";

// ✅ Wish fulfilled overlay listener
import WishChime from "@/components/child/wishChime";

/* ---------------- Speech types (for Web Speech API) ------------------------ */
declare global{
  interface Window{
    webkitSpeechRecognition:any;
    SpeechRecognition:any;
    speechSynthesis:SpeechSynthesis;
  }
}
type ListenTarget="title"|"desc"|null;

/* --------------------------------- Types ----------------------------------- */
type ChildProfile={
  id:string;
  child_uid:string;
  family_id:string;
  parent_uid:string|null;
  created_by:string|null;
  first_name:string;
  last_name:string|null;
  nick_name:string|null;
  age:number|null;
  birthday:string|null;
  avatar_path:string|null;
  created_at:string;
  parent_first?:string|null;
  parent_last?:string|null;
  family_name?:string|null;
  avatar_url?:string|null;
  child_pass_hash?:string|null;
};

type WishlistItem={
  id:string;
  family_id:string|null;
  child_uid:string;
  label:string;
  link:string|null;
  created_at:string;
  description:string|null;
  target_points:number|null;
  current_points:number|null;
  status:"pending"|"in_progress"|"completed"|"fulfilled"|string;
  category:string;
  completed_at:string|null;
  fulfilled_at?:string|null;
  approval_status?:"Pending"|"Approved"|"Rejected";
  approved_by?:string|null;
  approved_at?:string|null;
  reward_id?:string|null;
  occasion?:string|null;
  earned_points?:number;
  clamped_points?:number;
};

type Achievement={
  id:string;
  title:string;
  description:string|null;
  points_earned:number;
  created_at:string;
};

type Note={
  id:string;
  title:string;
  message:string;
  type:string;
  created_at:string;
  is_read:boolean;
};

type Offer={
  id:string;
  family_id:string|null;
  child_uid:string|null;
  target_id:string|null;
  reward_id:string|null;
  custom_title:string|null;
  custom_description:string|null;
  message:string|null;
  points_cost:number|null;
  points_cost_override:number|null;
  title:string|null;
  description:string|null;
  status:"Offered"|"Accepted"|"Rejected"|"Fulfilled"|"Expired"|string;
  offered_at:string;
  decided_at:string|null;
};

type Redemption={
  id:string;
  reward_id:string|null;
  status:"Pending"|"Approved"|"Rejected"|"Fulfilled";
  created_at:string;
};

type Overview={
  wishes:number;
  points_allocated:number;
  progress_pct:number;
  rewards_count:number;
  rewards_points:number;
};

/* -------------------------------- Helpers ---------------------------------- */
function effectiveOfferCost(o:Offer,catalog:{[id:string]:number}){
  return ((o.points_cost_override??undefined)??(o.points_cost??undefined)??(o.reward_id?catalog[o.reward_id]??0:0)??0);
}
const N=(v:unknown,def=0)=>{
  const n=Number(v);
  return Number.isFinite(n)?n:def;
};

const FALLBACK_FAMILY_ID="e21c48a8-5d80-4651-8d31-11923353a10c";

/** celebration-worthy notification types (wish + approval + fulfilled) */
const CELEBRATE_TYPES=new Set([
  "wish_fulfilled",
  "reward_approved",
  "reward_fulfilled",
  "redemption_approved",
  "redemption_fulfilled",
  "wishlist_approved"
]);

function readAnyChildKeyFromStorage(){
  const grab=(k:string)=>{try{return localStorage.getItem(k)??sessionStorage.getItem(k)??null;}catch{return null;}};

  const ids=new Set<string>();

  // simple keys
  const direct=["child_uid","child_id","child_portal_child_id"];
  for(const k of direct){
    const v=grab(k);
    if(v&&typeof v==="string"&&v.trim()){
      // if someone stored JSON, try to parse then fall back
      if(/^\s*[\{\[]/.test(v)){
        try{
          const o=JSON.parse(v);
          if(o?.child_uid) ids.add(String(o.child_uid));
          if(o?.id) ids.add(String(o.id));
        }catch{
          ids.add(v.trim());
        }
      }else{
        ids.add(v.trim());
      }
    }
  }

  // LS_CHILD JSON blob (expected)
  const raw=grab("LS_CHILD");
  if(raw&&/^\s*\{/.test(raw)){
    try{
      const o=JSON.parse(raw);
      if(o?.child_uid) ids.add(String(o.child_uid));
      if(o?.id) ids.add(String(o.id));
    }catch{}
  }

  // return a single scalar id/uid
  const out=Array.from(ids).find((x)=>x&&x.length>0)??"";
  return String(out);
}

/* ------------------------------ Confetti UI -------------------------------- */
function ConfettiOverlay({onDone}:{onDone:()=>void}){
  const [bits]=useState(()=>Array.from({length:60}).map(()=>({
    id:Math.random().toString(36).slice(2),
    left:Math.random()*100,
    size:18+Math.random()*10,
    delay:Math.random()*0.6,
    duration:2.6+Math.random()*1.4,
    rotate:(Math.random()*360)|0,
    char:["🎉","✨","💖","🎊","🌟"][Math.floor(Math.random()*5)]
  })));

  useEffect(()=>{
    const t=setTimeout(onDone,3500);
    return()=>clearTimeout(t);
  },[onDone]);

  return(
    <div className="pointer-events-none fixed inset-0 z-[65] overflow-hidden">
      {bits.map((b)=>(
        <div
          key={b.id}
          style={{
            position:"absolute",
            left:`${b.left}%`,
            top:"-10%",
            fontSize:`${b.size}px`,
            transform:`rotate(${b.rotate}deg)`,
            animation:`fall ${b.duration}s ${b.delay}s ease-in forwards`
          }}
        >
          {b.char}
        </div>
      ))}
      <style>{`
        @keyframes fall{
          0%{transform:translateY(-10vh) rotate(0deg);opacity:0;}
          10%{opacity:1;}
          100%{transform:translateY(110vh) rotate(720deg);opacity:0;}
        }
      `}</style>
    </div>
  );
}

/* ------------------------------ Audio helpers ------------------------------ */
function createAudioWithFallback(srcs:string[]){
  const el=new Audio();
  el.preload="auto";
  let idx=0;
  const trySet=()=>{
    if(idx<srcs.length){
      const base=srcs[idx++];
      const url=base.includes("?")?`${base}&v=${Date.now()%1000}`:`${base}?v=${Date.now()%1000}`;
      el.src=url;
      el.onerror=()=>trySet();
    }
  };
  trySet();
  return el;
}

/* -------------------------------- Component -------------------------------- */
type ReservedListsMap={ [childId:string]:any };

export default function ChildWishlist(){
  const navigate=useNavigate();

  // profile + identity
  const [profile,setProfile]=useState<ChildProfile|null>(null);
  const [familyId,setFamilyId]=useState<string>(FALLBACK_FAMILY_ID);

  // collections
  const [items,setItems]=useState<WishlistItem[]>([]);
  const [notes,setNotes]=useState<Note[]>([]);
  const [achievements,setAchievements]=useState<Achievement[]>([]);
  const [offers,setOffers]=useState<Offer[]>([]);
  const [redemptions,setRedemptions]=useState<Redemption[]>([]);

  // header overview
  const [overview,setOverview]=useState<Overview|null>(null);

  // ui state
  const [busyOffer,setBusyOffer]=useState<string|null>(null);
  const [newItem,setNewItem]=useState("");
  const [newDescription,setNewDescription]=useState("");
  const [targetPoints,setTargetPoints]=useState(100);
  const [selectedCategory,setSelectedCategory]=useState("general");
  const [loading,setLoading]=useState(true);
  const [showAddForm,setShowAddForm]=useState(false);
  const [error,setError]=useState<string|null>(null);

  // NEW: Occasion filter
  const [occ,setOcc]=useState<string>("All");
  const OCC_CHOICES=["All","Birthday","Christmas","Halloween","Diwali","Eid","New Year","Back to School","Just Because","Other"];
  const isNamedOccasion=(o:string)=>["Birthday","Christmas","Halloween","Diwali","Eid","New Year","Back to School","Just Because"].includes(o);

  // NEW: Status toggle (All / Pending / Approved / Fulfilled)
  const [statusTab,setStatusTab]=useState<"all"|"pending"|"approved"|"fulfilled">("all");

  // celebration modal
  const [celebrate,setCelebrate]=useState<{title:string;points?:number}|null>(null);
  const [showConfetti,setShowConfetti]=useState(false);

  // 🔔 scroll to notifications target
  const notifRef=useRef<HTMLDivElement|null>(null);

  // 🔄 wallet hook (family-scoped)
  const {rows}=useWallet(familyId);

  // derive active wallet row for this child
  const activeWalletRow=(()=>{
    if(!rows?.length||!profile) return rows?.[0]??null;
    const byCanonical=rows.find((r:any)=>r.child_uid===profile.id);
    if(byCanonical) return byCanonical;
    const byLegacy=rows.find((r:any)=>r.child_uid===profile.child_uid);
    return byLegacy??rows[0]??null;
  })();

  // reserved cache
  const [,setReservedLists]=useState<ReservedListsMap>({});
  const [reservedEffective,setReservedEffective]=useState<number>(0);

  // realtime channel keeper
  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);

  /* ----------- audio gated behind first user gesture ----------------------- */
  const dingRef=useRef<HTMLAudioElement|null>(null);
  const cheerRef=useRef<HTMLAudioElement|null>(null);
  const fulfilledRef=useRef<HTMLAudioElement|null>(null);
  const audioOkRef=useRef(false);

  // unified celebration sound (tries fulfilled → celebrate → ding)
  const playCelebration=()=>{
    try{
      if(!audioOkRef.current) return;
      const order=[fulfilledRef.current,cheerRef.current,dingRef.current].filter(Boolean)as HTMLAudioElement[];
      for(const a of order){
        try{
          a.currentTime=0;
          const p=a.play();
          if(p&&typeof p.then==="function"){void p.then(()=>{}).catch(()=>{});}
          break;
        }catch{}
      }
    }catch{}
  };

  useEffect(()=>{
    const unlock=()=>{
      try{
        if(!dingRef.current) dingRef.current=createAudioWithFallback(["/sounds/ding.wav","/sounds/ding.mp3"]);
      }catch{}
      try{
        if(!cheerRef.current) cheerRef.current=createAudioWithFallback(["/sounds/celebrate.wav","/sounds/celebrate.mp3","/sounds/success.wav","/sounds/success.mp3"]);
      }catch{}
      try{
        if(!fulfilledRef.current) fulfilledRef.current=createAudioWithFallback(["/sounds/wish_fulfilled.wav","/sounds/wish_fulfilled.mp3","/sounds/celebrate.wav","/sounds/celebrate.mp3","/sounds/ding.wav"]);
      }catch{}
      audioOkRef.current=true;
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
    window.addEventListener("pointerdown",unlock,{once:true});
    window.addEventListener("keydown",unlock,{once:true});
    return()=>{
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
  },[]);

  const playDing=()=>{try{if(audioOkRef.current&&dingRef.current){dingRef.current.currentTime=0;void dingRef.current.play();}}catch{}};
  const playCheer=()=>{try{if(audioOkRef.current&&cheerRef.current){cheerRef.current.currentTime=0;void cheerRef.current.play();}}catch{}};

  // ✅ Overlay open listener — event name fixed to wishChime:show
  useEffect(()=>{
    const onOpen=()=>playCelebration();
    window.addEventListener("wishChime:show",onOpen as EventListener);
    return()=>window.removeEventListener("wishChime:show",onOpen as EventListener);
  },[]);

  /* --------------------- Speech: recognition + synthesis -------------------- */
  const recognitionRef=useRef<any|null>(null);
  const [listening,setIsListening]=useState(false);
  const isListeningRef=useRef(false);
  const [listeningTarget,setListeningTarget]=useState<ListenTarget>(null);
  const listeningTargetRef=useRef<ListenTarget>(null);
  const supportsSpeech=typeof window!=="undefined"&&((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition);

  const isIOS=typeof navigator!=="undefined"&&/iP(hone|ad|od)/i.test(navigator.userAgent);

  const baseTitleRef=useRef<string>("");
  const baseDescRef=useRef<string>("");

  // Guided flow
  const [guided,setGuided]=useState(false);
  const [guidedStep,setGuidedStep]=useState<"idle"|"title"|"desc"|"done">("idle");

  // Text-to-speech helper
  function speak(text:string):Promise<void>{
    if(typeof window==="undefined"||!window.speechSynthesis) return Promise.resolve();
    return new Promise((resolve)=>{
      const u=new SpeechSynthesisUtterance(text);
      u.rate=1.0;
      u.pitch=1.1;
      u.onend=()=>resolve();
      try{
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }catch{
        resolve();
      }
    });
  }

  function ensureRecognizer(){
    if(!supportsSpeech) return null;
    if(recognitionRef.current) return recognitionRef.current;

    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const rec=new SR();
    rec.lang="en-US";
    rec.interimResults=true;
    rec.continuous=isIOS?false:true;
    (rec as any).maxAlternatives=1;

    rec.onstart=()=>{
      isListeningRef.current=true;
      if(listeningTargetRef.current==="title") setNewItem(baseTitleRef.current);
      else if(listeningTargetRef.current==="desc") setNewDescription(baseDescRef.current);
    };

    rec.onresult=(ev:any)=>{
      const target=listeningTargetRef.current;
      let interim="";let finalText="";
      for(let i=ev.resultIndex;i<ev.results.length;i++){
        const res=ev.results[i];
        const txt=res[0].transcript;
        if(res.isFinal) finalText+=txt;
        else interim+=txt;
      }
      if(target==="title"){
        const next=(baseTitleRef.current+" "+interim+" "+finalText).replace(/\s+/g," ").trim();
        setNewItem(next);
        if(finalText) baseTitleRef.current=(baseTitleRef.current+" "+finalText).replace(/\s+/g," ").trim();
      }else if(target==="desc"){
        const next=(baseDescRef.current+" "+interim+" "+finalText).replace(/\s+/g," ").trim();
        setNewDescription(next);
        if(finalText) baseDescRef.current=(baseDescRef.current+" "+finalText).replace(/\s+/g," ").trim();
      }
    };

    rec.onerror=(e:any)=>{
      isListeningRef.current=false;
      setIsListening(false);
      setListeningTarget(null);
      listeningTargetRef.current=null;
      toast.error(e?.error==="not-allowed"?"Microphone permission denied.":"Microphone error. Please try again.");
    };

    rec.onend=async()=>{
      isListeningRef.current=false;
      setIsListening(false);
      if(guided){
        if(guidedStep==="title"&&baseTitleRef.current.length>0){
          await speak("Great choice! Now, tell me why this wish is special to you.");
          startListening("desc");
          setGuidedStep("desc");
        }else if(guidedStep==="desc"&&baseDescRef.current.length>0){
          await speak("Wonderful! Your wish is ready. You can tap the green button to save it.");
          setGuidedStep("done");
          setGuided(false);
        }
      }
    };

    recognitionRef.current=rec;
    return rec;
  }

  function startListening(target:ListenTarget){
    if(!supportsSpeech){toast.info("Voice input isn't supported on this browser.");return;}
    const rec=ensureRecognizer();
    if(!rec) return;
    try{
      try{window.speechSynthesis?.cancel();}catch{}
      if(target==="title") baseTitleRef.current=newItem.trim();
      if(target==="desc") baseDescRef.current=newDescription.trim();
      setListeningTarget(target);
      listeningTargetRef.current=target;
      if(isListeningRef.current){try{rec.stop();}catch{}}
      setTimeout(()=>{
        try{
          rec.start();
          setIsListening(true);
          isListeningRef.current=true;
          if(!guided) toast.info(target==="title"?"Listening for your wish…":"Listening for the special details…");
        }catch{}
      },80);
    }catch{}
  }

  function stopListening(){
    try{recognitionRef.current?.stop();}catch{}
    isListeningRef.current=false;
    setIsListening(false);
    setListeningTarget(null);
    listeningTargetRef.current=null;
  }

  async function startGuided(){
    setGuided(true);
    const who=(profile?.nick_name||profile?.first_name||"friend").trim();
    await speak(`Hi ${who}! I am listening to your wish. Tell me, what do you wish for?`);
    setGuidedStep("title");
    startListening("title");
  }

  /* ---------------------------- Bootstrap load ----------------------------- */
  useEffect(()=>{
    (async ()=>{
      try{
        setLoading(true);
        setError(null);

        const key=readAnyChildKeyFromStorage();
        if(!key){navigate("/child/login");return;}

        // ✅ Canonical resolver (aligned across app)
        const resolved=await resolveCanonicalChildId(key);
        if(!resolved){navigate("/child/login");return;}

        const {id,child_uid,family_id}=resolved;
        setFamilyId(family_id||FALLBACK_FAMILY_ID);

        // Prefer a full profile view/RPC; fallback to base table
        let childProfile:ChildProfile|null=null;
        try{
          const {data,error}=await supabase.rpc("child_portal_get_profile",{_key:id||child_uid});
          if(!error){
            childProfile=(Array.isArray(data)?data[0]:data)as ChildProfile|null;
          }
        }catch{}
        if(!childProfile){
          const {data}=await supabase.from("child_profiles").select("*").or(`id.eq.${id},child_uid.eq.${child_uid}`).limit(1);
          childProfile=(data?.[0]??null)as ChildProfile|null;
        }
        if(!childProfile){
          setError("Child profile not found. Please log in again.");
          setTimeout(()=>{
            sessionStorage.removeItem("child_uid");
            localStorage.removeItem("child_portal_child_id");
            navigate("/child/login");
          },1500);
          return;
        }

        setProfile(childProfile);
        sessionStorage.setItem("child_uid",childProfile.child_uid);
        localStorage.setItem("child_portal_child_id",childProfile.child_uid);
        localStorage.setItem("child_portal_family_id",family_id||FALLBACK_FAMILY_ID);

        const [wishes,recentAch,notifs,offs,reds]=await Promise.all([
          loadWishlist(childProfile.child_uid,childProfile.id),
          loadRecentAchievements(childProfile.child_uid,childProfile.id),
          loadNotifications(childProfile.child_uid,childProfile.id),
          loadOffers(childProfile.child_uid,childProfile.id,childProfile.family_id),
          loadRedemptions(childProfile.child_uid,childProfile.id)
        ]);

        setItems(wishes);
        setAchievements(recentAch);
        setNotes(notifs);
        setOffers(offs);
        setRedemptions(reds);

        const ov=await loadOverviewSafe(childProfile.child_uid,wishes,offs);
        setOverview(ov);

        const eff=await fetchReservedEffectivePoints(childProfile.child_uid,childProfile.id);
        setReservedEffective(Math.max(0,Number(eff||0)));
      }catch(e:any){
        console.error("❌ loadProfileAndWishlist:",e);
        setError(e?.message||"Failed to load your wishlist. Please try again.");
      }finally{
        setLoading(false);
      }
    })();

    return()=>{
      try{channelRef.current?.unsubscribe();}catch{}
      channelRef.current=null;
      stopListening();
      try{window.speechSynthesis?.cancel();}catch{}
    };
  },[navigate]);

  /* ---- Keep overview in sync even if the RPC was unavailable / late ------- */
  useEffect(()=>{
    const wishes=items.length;
    const points_allocated=items.reduce((s,it)=>{
      if(typeof it.clamped_points==="number") return s+Math.max(0,it.clamped_points);
      const earned=Math.max(0,N(it.current_points,0));
      const target=Math.max(1,N(it.target_points,100));
      return s+Math.min(earned,target);
    },0);
    const totalTargets=items.reduce((s,it)=>s+Math.max(1,N(it.target_points,100)),0);
    const progress_pct=totalTargets>0?(points_allocated/totalTargets)*100:0;
    const acceptedOrFulfilled=offers.filter((o)=>o.status==="Accepted"||o.status==="Fulfilled");
    const rewards_count=acceptedOrFulfilled.length;
    const rewards_points=acceptedOrFulfilled.reduce((s,o)=>s+effectiveOfferCost(o,{}),0);

    setOverview({wishes,points_allocated,progress_pct,rewards_count,rewards_points});
  },[items,offers]);

  /* -------------------- Reserved list for the active child ------------------ */
  useEffect(()=>{
    const idForReserved=profile?.id||profile?.child_uid||activeWalletRow?.child_uid||null;
    if(!idForReserved) return;

    (async ()=>{
      try{
        const list=await fetchReservedOffers(idForReserved);
        setReservedLists((prev)=>({...prev,[idForReserved]:list}));
      }catch(e){
        console.warn("Reserved offers load failed:",e);
      }
    })();
  },[profile?.id,profile?.child_uid,activeWalletRow?.child_uid]);

  /* -------- Recompute numeric effective reserved when IDs change ----------- */
  useEffect(()=>{
    (async ()=>{
      if(!profile?.child_uid&&!profile?.id) return;
      try{
        const eff=await fetchReservedEffectivePoints(profile?.child_uid,profile?.id);
        setReservedEffective(Math.max(0,Number(eff||0)));
      }catch{}
    })();
  },[profile?.child_uid,profile?.id]);

  /* ------------------- Realtime: soft refresh + heads-up toasts ------------- */
  useEffect(()=>{
    // ✅ prefer child_uid for realtime notifications (matches table)
    const idForEvents=profile?.child_uid||profile?.id||activeWalletRow?.child_uid;
    if(!idForEvents) return;

    try{channelRef.current?.unsubscribe();}catch{}
    channelRef.current=null;

    const ch=supabase.channel(`child-wishlist:${idForEvents}`);

    const softRefresh=async()=>{
      try{
        const eff=await fetchReservedEffectivePoints(profile?.child_uid,profile?.id);
        setReservedEffective(Math.max(0,Number(eff||0)));

        const list=await fetchReservedOffers(String(idForEvents));
        setReservedLists((prev)=>({...prev,[String(idForEvents)]:list}));

        if(profile){
          const [offs,reds,wishes,notifs]=await Promise.all([
            loadOffers(profile.child_uid,profile.id,profile.family_id),
            loadRedemptions(profile.child_uid,profile.id),
            loadWishlist(profile.child_uid,profile.id),
            loadNotifications(profile.child_uid,profile.id)
          ]);
          setOffers(offs);
          setRedemptions(reds);
          setItems(wishes);
          const ov=await loadOverviewSafe(profile.child_uid,wishes,offs);
          setOverview(ov);
        }
      }catch(e){
        console.warn("wishlist soft refresh failed:",e);
      }
    };

    const heads=(title:string,description?:string,tone:"success"|"info"|"warning"|"error"="info")=>{
      const msg=description?`${title} — ${description}`:title;
      if(tone==="success") toast.success(msg);
      else if(tone==="warning") toast.warning(msg);
      else if(tone==="error") toast.error(msg);
      else toast.info(msg);
      playDing();
    };

    // 🔁 **Aligned here** → listen on child_points_ledger instead of legacy points_ledger
    ch.on("postgres_changes",{event:"INSERT",schema:"public",table:"child_points_ledger",filter:`child_uid=eq.${idForEvents}`},(payload:any)=>{
      const pts=Number(payload?.new?.points??payload?.new?.delta??0);
      if(Number.isFinite(pts)&&pts!==0){
        const sign=pts>0?"+":"";
        heads("Points update",`${sign}${pts} pts added to your balance!`,pts>0?"success":"warning");
      }else{
        heads("Points updated","Your points have changed.","info");
      }
      void softRefresh();
    });

    ch.on("postgres_changes",{event:"UPDATE",schema:"public",table:"reward_redemptions",filter:`child_uid=eq.${idForEvents}`},(payload:any)=>{
      const newStatus=payload?.new?.status;
      const title=payload?.new?.reward_title||"Your reward";
      if(newStatus==="Approved") heads("Reward approved 🎉",`${title} is approved!`,"success");
      else if(newStatus==="Fulfilled"){
        heads("Reward fulfilled 💝",`${title} is fulfilled! Enjoy!`,"success");
        playCelebration();
        setShowConfetti(true);
      }else if(newStatus==="Rejected") heads("Reward update",`${title} was not approved this time.`,"warning");
      void softRefresh();
    });

    ch.on("postgres_changes",{event:"INSERT",schema:"public",table:"reward_offers",filter:`child_uid=eq.${idForEvents}`},(payload:any)=>{
      const title=payload?.new?.custom_title||payload?.new?.title||"Special Reward";
      heads("New offer 🎁",`"${title}" is now available.`,"info");
      void softRefresh();
    });

    ch.on("postgres_changes",{event:"UPDATE",schema:"public",table:"reward_offers",filter:`child_uid=eq.${idForEvents}`},(payload:any)=>{
      const status=payload?.new?.status;
      const title=payload?.new?.custom_title||payload?.new?.title||"Reward";
      if(status==="Expired") heads("Offer expired",`"${title}" is no longer available.`,"warning");
      if(status==="Rejected") heads("Offer update",`"${title}" was declined.`,"warning");
      void softRefresh();
    });

    // 🔔 child wishlist notifications (approval + fulfilled) — now realtime
    ch.on("postgres_changes",{event:"INSERT",schema:"public",table:"wishlist_notifications",filter:`child_uid=eq.${idForEvents}`},async(payload:any)=>{
      const n=(payload?.new??null)as Partial<Note>|null;

      if(n){
        const typeStr=String(n.type||"");
        const isCelebrate=CELEBRATE_TYPES.has(typeStr);
        if(isCelebrate){
          // heads-up toast + celebration handled by WishChime/overlay
          const msg=n.title?`${n.title}${n.message?` — ${n.message}`:""}`:(n.message||"Wish update");
          toast.success(msg);
          playCelebration();
        }else if(n.title){
          const msg=n.message?`${n.title} — ${n.message}`:n.title;
          toast.info(msg);
          playDing();
        }
      }

      try{
        const fresh=await loadNotifications(profile?.child_uid||String(idForEvents),profile?.id);
        setNotes(fresh);
      }catch{}

      void softRefresh();
    });

    ch.on("postgres_changes",{event:"UPDATE",schema:"public",table:"wishlist_items",filter:`child_uid=eq.${idForEvents}`},(payload:any)=>{
      if(payload?.new?.status==="fulfilled"){
        setCelebrate({title:payload?.new?.label??"Wish fulfilled!",points:N(payload?.new?.target_points,0)});
        playCelebration();
        setShowConfetti(true);
      }
      void softRefresh();
    });

    ch.on("postgres_changes",{event:"*",schema:"public",table:"wishlist_items",filter:`child_uid=eq.${idForEvents}`},()=>void softRefresh());

    ch.subscribe();
    channelRef.current=ch;

    return()=>{
      try{channelRef.current?.unsubscribe();}catch{}
      channelRef.current=null;
    };
  },[profile?.id,profile?.child_uid,profile?.family_id,activeWalletRow?.child_uid]);

  /* ----------------------------- Data loaders ------------------------------ */
  async function loadWishlist(legacyChildUid:string,canonicalId?:string){
    const {data,error}=await supabase.rpc("api_child_wishlist_items_resolved",{p_child_uid:legacyChildUid});
    if(!error&&Array.isArray(data)){return data as unknown as WishlistItem[];}
    const ids=Array.from(new Set([legacyChildUid,canonicalId].filter(Boolean)))as string[];
    const q=await supabase.from("wishlist_items").select("*").in("child_uid",ids).order("created_at",{ascending:false});
    return (q.data||[])as WishlistItem[];
  }

  async function loadRecentAchievements(legacyChildUid:string,canonicalId?:string){
    const ids=Array.from(new Set([legacyChildUid,canonicalId].filter(Boolean)))as string[];
    const {data}=await supabase.from("achievements").select("*").in("child_uid",ids).order("created_at",{ascending:false}).limit(5);
    return (data||[])as Achievement[];
  }

  // 🔧 CHILD: align notifications with parent — direct table query, no RPC
  async function loadNotifications(childUid:string,canonicalId?:string){
    const ids=Array.from(new Set([childUid,canonicalId].filter(Boolean)))as string[];
    if(!ids.length) return [];
    try{
      const {data,error}=await supabase
        .from("wishlist_notifications")
        .select("id,title,message,type,is_read,created_at,child_uid")
        .in("child_uid",ids)
        .eq("is_read",false)
        .order("created_at",{ascending:false})
        .limit(50);

      if(error){
        console.warn("loadNotifications (child) error:",error);
        return [];
      }
      return (data||[]).map((n:any)=>({
        id:n.id,
        title:n.title,
        message:n.message,
        type:n.type,
        created_at:n.created_at,
        is_read:n.is_read
      }))as Note[];
    }catch(e){
      console.warn("loadNotifications (child) threw:",e);
      return [];
    }
  }

  // ✅ Hardened offers loader
  async function loadOffers(legacyChildUid:string,canonicalId:string,familyId?:string|null){
    try{
      const v2=await supabase.rpc("api_child_reward_offers_v2",{p_child_uid:legacyChildUid});
      if(!v2.error&&v2.data) return v2.data as Offer[];
    }catch{}
    try{
      const v1=await supabase.rpc("api_child_reward_offers",{p_child_uid:legacyChildUid});
      if(!v1.error&&v1.data) return v1.data as Offer[];
    }catch{}
    const ids=Array.from(new Set([legacyChildUid,canonicalId].filter(Boolean)))as string[];
    let q=supabase
      .from("reward_offers")
      .select("id,family_id,child_uid,target_id,reward_id,custom_title,custom_description,message,points_cost_override,points_cost,status,offered_at,decided_at")
      .in("child_uid",ids)
      .order("offered_at",{ascending:false});
    if(familyId) q=q.eq("family_id",familyId);
    const {data}=await q;
    return (data||[])as Offer[];
  }

  async function loadRedemptions(legacyChildUid:string,canonicalId:string){
    try{
      const res=await supabase.rpc("api_child_redemptions",{p_child_uid:legacyChildUid});
      if(!res.error&&res.data) return res.data as Redemption[];
    }catch{}
    const q=await supabase
      .from("reward_redemptions")
      .select("id,reward_id,status,created_at")
      .in("child_uid",[legacyChildUid,canonicalId])
      .order("created_at",{ascending:false});
    return (q.data||[])as Redemption[];
  }

  async function loadOverviewSafe(childUid:string,currentItems:WishlistItem[],currentOffers:Offer[]):Promise<Overview>{
    try{
      const {data,error}=await supabase.rpc("api_child_wishlist_overview",{p_child_uid:childUid});
      if(!error&&data){
        const row=Array.isArray(data)?data[0]:data;
        if(row) return row as Overview;
      }
    }catch{}
    const wishes=currentItems.length;
    const points_allocated=currentItems.reduce((s,it)=>{
      if(typeof it.clamped_points==="number") return s+Math.max(0,it.clamped_points);
      const earned=Math.max(0,N(it.current_points,0));
      const target=Math.max(1,N(it.target_points,100));
      return s+Math.min(earned,target);
    },0);
    const totalTargets=currentItems.reduce((s,it)=>s+Math.max(1,N(it.target_points,100)),0);
    const progress_pct=totalTargets>0?(points_allocated/totalTargets)*100:0;
    const acceptedOrFulfilled=currentOffers.filter((o)=>o.status==="Accepted"||o.status==="Fulfilled");
    const rewards_count=acceptedOrFulfilled.length;
    const rewards_points=acceptedOrFulfilled.reduce((s,o)=>s+effectiveOfferCost(o,{}),0);
    return {wishes,points_allocated,progress_pct,rewards_count,rewards_points};
  }

  /* -------------------------------- Actions -------------------------------- */
  async function addItem(){
    if(!newItem.trim()||!profile){setError("Please enter a wish and try again.");return;}

    const pin=prompt("Enter your PIN to confirm this wish")||"";

    const res=await tpromise(()=>supabase.rpc("child_portal_add_wish",{
      _key:profile.child_uid,
      _secret:pin,
      _label:newItem.trim(),
      _description:newDescription.trim()||null,
      _category:selectedCategory||"general",
      _target_points:Math.max(10,+targetPoints||100),
      _link:null
    }),{
      loading:"Adding your wish…",
      success:"Wish added! ✨",
      error:(e)=>(e?.code==="28000"?"That PIN didn't match. Please try again.":"Could not add wish."),
      sound:"success"
    });

    if(!("error" in res)||!res.error){
      setNewItem("");
      setNewDescription("");
      setTargetPoints(100);
      setSelectedCategory("general");
      setShowAddForm(false);
      const w=await loadWishlist(profile.child_uid,profile.id);
      setItems(w);
      const ov=await loadOverviewSafe(profile.child_uid,w,offers);
      setOverview(ov);
    }
  }

  async function acceptOffer(offer:Offer){
    if(!profile) return;
    setBusyOffer(offer.id);

    const res=await tpromise(()=>supabase.rpc("api_child_accept_offer",{p_child_uid:profile.child_uid,p_offer_id:offer.id}),{
      loading:"Accepting offer…",
      success:`Accepted "${offer.title||"Reward"}"! 🎉`,
      error:"Could not accept this reward.",
      sound:"success"
    });

    if(!("error" in res)||!res.error){
      const [offs,reds,w]=await Promise.all([
        loadOffers(profile.child_uid,profile.id,profile.family_id),
        loadRedemptions(profile.child_uid,profile.id),
        loadWishlist(profile.child_uid,profile.id)
      ]);
      setOffers(offs);
      setRedemptions(reds);
      setItems(w);
      setOverview(await loadOverviewSafe(profile.child_uid,w,offs));
    }else{
      const offs=await loadOffers(profile.child_uid,profile.id,profile.family_id);
      setOffers(offs);
    }

    setBusyOffer(null);
  }

  /* ------------------------- Status/visual helpers -------------------------- */
  function getCategoryIcon(category:string){
    switch(category){
      case "birthday":return <Gift className="w-5 h-5"/>;
      case "occasion":return <Sparkles className="w-5 h-5"/>;
      case "celebration":return <Trophy className="w-5 h-5"/>;
      case "achievement":return <Target className="w-5 h-5"/>;
      default:return <Star className="w-5 h-5"/>;
    }
  }
  function getCategoryColor(category:string){
    switch(category){
      case "birthday":return "from-pink-500 to-rose-500";
      case "occasion":return "from-purple-500 to-indigo-500";
      case "celebration":return "from-yellow-500 to-orange-500";
      case "achievement":return "from-blue-500 to-cyan-500";
      default:return "from-emerald-500 to-teal-500";
    }
  }
  function getProgressColor(p:number){
    if(p>=100) return "bg-gradient-to-r from-green-500 to-emerald-500";
    if(p>=75) return "bg-gradient-to-r from-blue-500 to-cyan-500";
    if(p>=50) return "bg-gradient-to-r from-yellow-500 to-orange-500";
    return "bg-gradient-to-r from-pink-500 to-rose-500";
  }

  const latestOfferByReward=new Map<string,Offer>();
  for(const o of offers) if(o.reward_id&&!latestOfferByReward.has(o.reward_id)) latestOfferByReward.set(o.reward_id,o);
  const latestRedemByReward=new Map<string,Redemption>();
  for(const r of redemptions) if(r.reward_id&&!latestRedemByReward.has(r.reward_id)) latestRedemByReward.set(r.reward_id,r);

  function statusForItem(item:WishlistItem){
    if(item.status==="fulfilled"||item.completed_at) return {label:"Fulfilled",tone:"blue" as const,decided:true};
    if(item.status==="completed") return {label:"Completed",tone:"emerald" as const,decided:true};
    if(item.approval_status==="Approved") return {label:"Approved",tone:"emerald" as const,decided:true};

    const rewardId=item.reward_id??null;
    if(rewardId){
      const r=latestRedemByReward.get(rewardId);
      if(r){
        if(r.status==="Pending") return {label:"Requested",tone:"yellow" as const,decided:true};
        if(r.status==="Approved") return {label:"Approved",tone:"emerald" as const,decided:true};
        if(r.status==="Fulfilled") return {label:"Fulfilled",tone:"blue" as const,decided:true};
        if(r.status==="Rejected") return {label:"Rejected",tone:"red" as const,decided:true};
      }
      const o=latestOfferByReward.get(rewardId);
      if(o){
        if(o.status==="Accepted") return {label:"Accepted",tone:"emerald" as const,decided:true};
        if(o.status==="Rejected") return {label:"Rejected",tone:"red" as const,decided:true};
        if(o.status==="Expired") return {label:"Expired",tone:"gray" as const,decided:true};
        if(o.status==="Offered") return {label:"Offered",tone:"sky" as const,decided:false};
      }
    }

    const target=Math.max(1,N(item.target_points,100));
    const earned=typeof item.earned_points==="number"?Math.max(0,item.earned_points):Math.max(0,N(item.current_points,0));
    if(earned>=target){return {label:"Completed",tone:"emerald" as const,decided:true};}
    return {label:"In progress",tone:"slate" as const,decided:false};
  }

  // Map status label → filter group
  function groupForStatusLabel(label:string):"pending"|"approved"|"fulfilled"{
    if(label==="Fulfilled") return "fulfilled";
    if(label==="Approved"||label==="Accepted"||label==="Requested"||label==="Completed") return "approved";
    return "pending";
  }

  /* -------- Totals for debug panel (still handy) ---------------------------- */
  const chipAvailable=Math.max(0,N((activeWalletRow as any)?.available_points,0));
  const chipReserved=Math.max(0,N((activeWalletRow as any)?.reserved_points,0)>0?N((activeWalletRow as any)?.reserved_points,0):N(reservedEffective,0));
  const chipBalance=Math.max(0,chipAvailable+chipReserved);

  const childName=profile?.nick_name||profile?.first_name||"My";

  const wishesCount=overview?.wishes??items.length;
  const pointsAllocated=Math.round(overview?.points_allocated??0);
  const progressPct=Math.round(overview?.progress_pct??0);
  const rewardsCount=overview?.rewards_count??0;
  const rewardsPts=Math.round(overview?.rewards_points??0);

  /* ------------------------- Notification helpers -------------------------- */
  async function markNoteRead(id:string){
    if(!profile) return;
    try{
      try{
        const res=await supabase.rpc("api_child_mark_notifications_read",{p_any:profile.child_uid,p_ids:[id]});
        if(!("error" in res)||!res.error){setNotes((prev)=>prev.filter((n)=>n.id!==id));return;}
      }catch{}
      const idsForChild=Array.from(new Set([profile.child_uid,profile.id].filter(Boolean)))as string[];
      const {error:updErr}=await supabase.from("wishlist_notifications").update({is_read:true}).eq("id",id).in("child_uid",idsForChild);
      if(!updErr) setNotes((prev)=>prev.filter((n)=>n.id!==id));
    }catch(e){console.warn("markNoteRead err",e);}
  }

  async function markAllNotesRead(){
    if(!profile||notes.length===0) return;
    const ids=notes.map((n)=>n.id);
    try{
      try{
        const res=await supabase.rpc("api_child_mark_notifications_read",{p_any:profile.child_uid,p_ids:ids});
        if(!("error" in res)||!res.error){setNotes([]);toast.success("All notifications cleared.");return;}
      }catch{}
      const idsForChild=Array.from(new Set([profile.child_uid,profile.id].filter(Boolean)))as string[];
      const {error:updErr}=await supabase.from("wishlist_notifications").update({is_read:true}).in("id",ids).in("child_uid",idsForChild);
      if(!updErr){setNotes([]);toast.success("All notifications cleared.");}
    }catch(e){console.warn("markAllNotesRead err",e);toast.error("Could not mark all notifications as read.");}
  }

  if(loading){
    return(
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-200px,rgba(120,119,198,0.25),transparent),linear-gradient(to_bottom,#0B1220,#0A0F1A)]"/>
        <div className="relative text-white/70 text-center py-12">Loading your magical wishlist…</div>
      </div>
    );
  }
  if(error){
    return(
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-200px,rgba(120,119,198,0.25),transparent),linear-gradient(to_bottom,#0B1220,#0A0F1A)]"/>
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="glass-premium rounded-2xl p-8 border border-white/20 mt-8">
            <div className="text-6xl mb-4">😔</div>
            <h2 className="text-2xl font-bold text-white mb-4">Oops! Something went wrong</h2>
            <p className="text-white/70 mb-6">{error}</p>
            <div className="flex gap-4 justify-center">
              <button onClick={()=>window.location.reload()} className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 rounded-2xl text-white font-semibold transition-all duration-300">Try Again</button>
              <button onClick={()=>navigate("/child")} className="px-6 py-3 bg-white/10 hover:bg.white/20 border border-white/20 rounded-2xl text-white font-semibold transition-all duration-300">Back to Dashboard</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Apply Occasion + Status filter to the rendered list ----------- */
  const filteredItems=items.filter((x)=>{
    // 1) Occasion filter
    if(occ!=="All"){
      const o=(x.occasion??"").trim();
      if(occ==="Other"){
        if(!(o&&!isNamedOccasion(o))) return false;
      }else{
        if(o!==occ) return false;
      }
    }

    // 2) Status tab filter
    if(statusTab==="all") return true;
    const s=statusForItem(x);
    const group=groupForStatusLabel(s.label);
    return group===statusTab;
  });

  return(
    <div className="relative">
      {/* Luxe parent-like background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_50%_-200px,rgba(120,119,198,0.25),transparent),linear-gradient(to_bottom,#0B1220,#0A0F1A)]"/>
      <div className="absolute -z-10 inset-0 opacity-30 [mask-image:radial-gradient(800px_400px_at_50%_0%,black,transparent)] pointer-events-none">
        <div className="h-full w-full bg-[url('/noise.png')]"/>
      </div>

      {/* Wish fulfilled greeting-card listener + popup */}
      <WishChime childIds={[profile?.child_uid,profile?.id]} autoDismissMs={12000} modalTitle="Your wish came true! 💖 Enjoy!"/>

      {/* Confetti */}
      {showConfetti&&<ConfettiOverlay onDone={()=>setShowConfetti(false)}/>}

      {/* Celebration greeting card */}
      {celebrate&&(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setCelebrate(null)}/>
          <div className="relative glass-premium border border-emerald-400/40 rounded-3xl p-8 max-w-lg w-full text-center animate-in fade-in zoom-in duration-300">
            <button onClick={()=>setCelebrate(null)} className="absolute top-3 right-3 p-2 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/20" aria-label="Close celebration">
              <X className="w-5 h-5"/>
            </button>
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-2xl font-extrabold text-emerald-200">Wish Fulfilled!</h3>
            <p className="text-white/80 mt-2">
              {celebrate.title} — Amazing work!{celebrate.points?` You reached ${celebrate.points} points!`:""}
            </p>
            <div className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-lg">
              <Trophy className="w-5 h-5"/>
              Celebrate your success!
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                {childName}'s Magical Wishlist ✨
              </h1>
              <p className="text-white/70 mt-2">Every achievement brings your wishes closer!</p>
            </div>

            {/* AI Wishlist button */}
            <Link to="/child/ai-wishlist" className="px-4 py-2 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold inline-flex items-center gap-2" title="AI Wishlist">
              <Sparkles className="w-5 h-5"/>
              AI Wishlist
            </Link>
          </div>

          {/* Notifications bell */}
          {notes.length>0&&(
            <div className="flex items-center gap-3">
              <button onClick={()=>notifRef.current?.scrollIntoView({behavior:"smooth",block:"start"})} className="relative" title="View notifications">
                <div className="p-3 glass rounded-2xl border border-white/20">
                  <Bell className="w-6 h-6 text-purple-200"/>
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold">
                  {notes.length}
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-premium rounded-2xl p-4 text-center border border-white/20 hover-lift">
            <div className="text-xl md:text-2xl font-bold text-purple-200">{wishesCount}</div>
            <div className="text-white/70 text-sm">Wishes</div>
          </div>
          <div className="glass-premium rounded-2xl p-4 text-center border border-white/20 hover-lift">
            <div className="text-xl md:text-2xl font-bold text-pink-200">{pointsAllocated}</div>
            <div className="text-white/70 text-sm">Points Allocated</div>
          </div>
          <div className="glass-premium rounded-2xl p-4 text-center border border-white/20 hover-lift">
            <div className="text-xl md:text-2xl font-bold text-blue-200">{Math.max(0,Math.min(100,progressPct))}%</div>
            <div className="text-white/70 text-sm">Progress</div>
          </div>
          <div className="glass-premium rounded-2xl p-4 text-center border border-white/20 hover-lift">
            <div className="text-xl md:text-2xl font-bold text-emerald-200">{rewardsCount}</div>
            <div className="text-white/70 text-sm">Rewards</div>
            <div className="text-xs text-emerald-200/80 mt-1">{rewardsPts} pts</div>
          </div>
        </div>

        {/* Offers banner */}
        {offers.length>0&&(
          <div className="glass-premium rounded-2xl p-4 border border-emerald-400/30 bg-emerald-500/10">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Gift className="w-5 h-5 text-emerald-300"/>
                <div className="text-white">
                  <div className="font-semibold">You have {offers.filter((o)=>o.status==="Offered").length} special offer(s)!</div>
                  <div className="text-white/70 text-sm">Accept to lock in your reward.</div>
                </div>
              </div>
              {offers.filter((o)=>o.status==="Offered")[0]&&(
                <button onClick={()=>acceptOffer(offers.filter((o)=>o.status==="Offered")[0])} className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-sm">
                  Accept First Offer
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Add wish form */}
            {showAddForm?(
              <div className="glass-premium rounded-2xl p-6 border border-white/20 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white">Make a New Wish 🌠</h3>
                  <button type="button" onClick={startGuided} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text.white text-sm hover:bg-white/20" title="Guide me with voice">
                    <Wand2 className="w-4 h-4"/>
                    Guide me 🎙️
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Title + Mic */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="What do you wish for? ✨"
                      value={newItem}
                      onChange={(e)=>{setNewItem(e.target.value);baseTitleRef.current=e.target.value;}}
                      className="w-full rounded-2xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 font-medium focus:ring-2 focus:ring-purple-400 focus:border-transparent pr-12"
                      aria-label="What do you wish for?"
                    />
                    <button
                      type="button"
                      onClick={()=>listening&&listeningTarget==="title"?stopListening():startListening("title")}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl border ${listening&&listeningTarget==="title"?"bg-emerald-600/30 border-emerald-400 text-emerald-200":"bg-white/10 border-white/20 text-white/80 hover:bg-white/20"}`}
                      aria-label="Speak your wish"
                      title="Speak your wish"
                    >
                      {listening&&listeningTarget==="title"?<Square className="w-4 h-4"/>:<Mic className="w-4 h-4"/>}
                    </button>
                  </div>

                  {/* Description + Mic */}
                  <div className="relative">
                    <textarea
                      placeholder="Tell us more about your wish... Why is it special? 💫"
                      value={newDescription}
                      onChange={(e)=>{setNewDescription(e.target.value);baseDescRef.current=e.target.value;}}
                      rows={3}
                      className="w-full rounded-2xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 font-medium focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none pr-12"
                      aria-label="Tell us more about your wish"
                    />
                    <button
                      type="button"
                      onClick={()=>listening&&listeningTarget==="desc"?stopListening():startListening("desc")}
                      className={`absolute right-2 top-3 p-2 rounded-xl border ${listening&&listeningTarget==="desc"?"bg-emerald-600/30 border-emerald-400 text-emerald-200":"bg-white/10 border-white/20 text-white/80 hover:bg-white/20"}`}
                      aria-label="Speak details about your wish"
                      title="Speak details about your wish"
                    >
                      {listening&&listeningTarget==="desc"?<Square className="w-4 h-4"/>:<Mic className="w-4 h-4"/>}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white font-medium mb-2">Category</label>
                      <select
                        value={selectedCategory}
                        onChange={(e)=>setSelectedCategory(e.target.value)}
                        className="w-full rounded-2xl px-4 py-3 bg-white/10 border border-white/20 text-white font-medium focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                      >
                        <option value="general" className="bg-gray-800">🌟 General</option>
                        <option value="birthday" className="bg-gray-800">🎂 Birthday</option>
                        <option value="occasion" className="bg-gray-800">🎉 Special Occasion</option>
                        <option value="celebration" className="bg-gray-800">🏆 Celebration</option>
                        <option value="achievement" className="bg-gray-800">🎯 Achievement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-white font-medium mb-2">Target Points</label>
                      <input
                        type="number"
                        value={targetPoints}
                        onChange={(e)=>setTargetPoints(parseInt(e.target.value))}
                        min={10}
                        max={1000}
                        className="w-full rounded-2xl px-4 py-3 bg-white/10 border border-white/20 text-white font-medium focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={()=>void addItem()} className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-2xl font-bold text-white shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 hover-lift">
                      <Sparkles className="w-5 h-5"/>
                      Make a Wish!
                    </button>
                    <button
                      onClick={()=>{
                        setShowAddForm(false);
                        stopListening();
                        window.speechSynthesis?.cancel();
                        setGuided(false);
                        setGuidedStep("idle");
                      }}
                      className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold transition-all duration-300 hover-lift"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ):(
              <button
                onClick={()=>{
                  setShowAddForm(true);
                  setTimeout(()=>{void startGuided();},0);
                }}
                className="w-full glass-premium rounded-2xl p-6 border-2 border-dashed border-purple-400 hover:border-purple-300 hover:bg-white/10 transition-all duration-300 group hover-lift"
              >
                <div className="flex items-center justify-center gap-3 text-purple-200 group-hover:text-white">
                  <Plus className="w-6 h-6"/>
                  <span className="text-lg font-semibold">Add a New Wish</span>
                </div>
              </button>
            )}

            {/* Occasion Filter */}
            <div className="glass-premium rounded-2xl p-4 border border-white/20">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-white font-medium">Occasion:</label>
                <select
                  value={occ}
                  onChange={(e)=>setOcc(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm"
                >
                  {OCC_CHOICES.map((o)=>(
                    <option key={o} value={o} className="bg-gray-800">{o}</option>
                  ))}
                </select>
                {occ!=="All"&&(
                  <button onClick={()=>setOcc("All")} className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white/80 text-sm hover:bg-white/20">
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Status toggle buttons */}
            <div className="glass-premium rounded-2xl p-4 border border-white/20">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-white font-medium">Show wishes:</span>
                {[
                  {key:"all",label:"All"},
                  {key:"pending",label:"Still working on it"},
                  {key:"approved",label:"Approved & locked"},
                  {key:"fulfilled",label:"Wish came true"}
                ].map((b)=>(
                  <button
                    key={b.key}
                    type="button"
                    onClick={()=>setStatusTab(b.key as "all"|"pending"|"approved"|"fulfilled")}
                    className={`px-3 py-1.5 rounded-2xl text-xs font-semibold inline-flex items-center gap-1 border transition-all ${
                      statusTab===b.key
                        ?"bg-emerald-500/30 border-emerald-400 text-emerald-100 shadow-sm"
                        :"bg-white/5 border-white/15 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {statusTab===b.key&&<Check className="w-3 h-3"/>}
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Offers list */}
            {offers.length>0&&(
              <div className="glass-premium rounded-2xl p-6 border border-white/20">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Gift className="w-5 h-5"/>
                  Special Offers
                </h3>

                <div className="space-y-3">
                  {offers.map((o)=>{
                    const disabled=o.status!=="Offered"||busyOffer===o.id;
                    const cost=effectiveOfferCost(o,{});
                    return(
                      <div key={o.id} className="p-4 rounded-2xl bg-white/10 border border-white/20">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <div className="font-semibold text-lg text-white">{o.title||"Special Reward"}</div>
                              <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300">{cost?`${cost} pts`:"—"}</span>
                              <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-300">{o.status}</span>
                            </div>
                            {o.description&&<div className="text-white/80 mb-2">{o.description}</div>}
                            {o.message&&<div className="text-white/70 text-sm mb-2">Note: {o.message}</div>}
                            <div className="text-xs text-white/50">Offered {new Date(o.offered_at).toLocaleString()}{o.decided_at?` • Decided ${new Date(o.decided_at).toLocaleString()}`:""}</div>
                          </div>

                          <button
                            onClick={()=>acceptOffer(o)}
                            disabled={disabled}
                            className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap ${disabled?"bg-white/10 text-white/50 cursor-not-allowed":"bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white"}`}
                          >
                            {busyOffer===o.id?"Accepting…":o.status!=="Offered"?"Decided":"Accept"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Wishes list (filtered) */}
            <div className="space-y-4">
              {filteredItems.map((item)=>{
                const s=statusForItem(item);
                const target=Math.max(1,N(item.target_points,100));
                const earnedResolved=typeof item.earned_points==="number"?Math.max(0,item.earned_points):Math.max(0,N(item.current_points,0));
                const earnedClamped=typeof item.clamped_points==="number"?Math.max(0,item.clamped_points):Math.min(earnedResolved,target);

                const decisionLabels=new Set(["Approved","Accepted","Fulfilled","Requested","Completed"]);
                const isDecided=decisionLabels.has(s.label);

                const displayNumerator=isDecided?target:earnedClamped;
                const pct=isDecided?100:Math.max(0,Math.min(100,Math.floor((earnedClamped/target)*100)));

                return(
                  <div key={item.id} className="glass-premium rounded-2xl p-6 border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 hover-lift">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 rounded-2xl bg-gradient-to-r ${getCategoryColor(item.category)} text-white sparkle`}>
                          {getCategoryIcon(item.category)}
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-lg font-bold text-white">{item.label}</h3>

                            {/* Occasion badge */}
                            {item.occasion&&(
                              <span className="ml-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 border border-white/20 text-white/80">
                                {item.occasion}
                              </span>
                            )}

                            {item.approval_status&&(
                              <span className={`px-2 py-1 rounded-full text-xs ${item.approval_status==="Approved"?"bg-emerald-500/30 text-emerald-100 border border-emerald-400":item.approval_status==="Rejected"?"bg-rose-500/30 text-rose-100 border border-rose-400":"bg-amber-500/30 text-amber-100 border border-amber-400"}`}>
                                {item.approval_status}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded text-xs bg-${s.tone}-500/20 text-${s.tone}-300`}>{s.label}</span>
                          </div>
                          {item.description&&<p className="text-white/80">{item.description}</p>}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text.white">{displayNumerator} / {target}</div>
                        <div className="text-sm text-white/60">points</div>
                        {isDecided&&<div className="text-[11px] text-emerald-200/80 mt-1">Locked for this reward</div>}
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex justify-between text-sm text-white/70 mb-2">
                        <span>Progress</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full bg-white/20 rounded-full h-3">
                        <div className={`h-3 rounded-full ${getProgressColor(pct)} transition-all duration-1000 ease-out`} style={{width:`${pct}%`}}/>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold bg-${s.tone}-500/20 text-${s.tone}-200 border border-${s.tone}-400/40`}>{s.label}</div>
                      {s.label==="Fulfilled"&&(
                        <div className="flex items-center gap-1 text-blue-300">
                          <Trophy className="w-4 h-4"/>
                          <span className="text-xs font-semibold">Enjoy your reward!</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredItems.length===0&&!showAddForm&&(
                <div className="glass-premium rounded-2xl p-8 text-center border border-white/20">
                  <div className="text-6xl mb-4">✨</div>
                  <h3 className="text-2xl font-bold text-white mb-2">No wishes match this filter</h3>
                  <p className="text-white/70 mb-6">Try switching the Occasion or Status filter, or add a new wish!</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Sticky on desktop */}
          <aside className="space-y-6 lg:sticky lg:top-4 h-fit">
            {/* Notifications */}
            <div ref={notifRef} className="glass-premium rounded-2xl p-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5"/>
                Parent Updates
                {notes.length>0&&(
                  <button onClick={()=>void markAllNotesRead()} className="ml-auto text-xs px-3 py-1 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/20" title="Mark all as read">
                    Mark all read
                  </button>
                )}
              </h3>

              {notes.length>0?(
                <div className="space-y-2">
                  {notes.map((n)=>{
                    const isCelebrate=CELEBRATE_TYPES.has(String(n.type||""));
                    return(
                      <div
                        key={n.id}
                        role={isCelebrate?"button":undefined}
                        tabIndex={isCelebrate?0:undefined}
                        onClick={()=>{
                          if(isCelebrate){
                            window.dispatchEvent(new CustomEvent("wishChime:show",{detail:{id:n.id,title:n.title,message:n.message}}));
                            playCelebration();
                          }
                        }}
                        onKeyDown={(e)=>{
                          if(!isCelebrate) return;
                          if(e.key==="Enter"||e.key===" "){
                            e.preventDefault();
                            window.dispatchEvent(new CustomEvent("wishChime:show",{detail:{id:n.id,title:n.title,message:n.message}}));
                            playCelebration();
                          }
                        }}
                        className={`p-3 rounded-2xl bg-white/10 border border-white/20 ${isCelebrate?"cursor-pointer hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/50":""}`}
                        title={isCelebrate?"Tap to celebrate!":undefined}
                      >
                        <div className="flex items.start gap-2">
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-white flex items-center gap-2">
                              {isCelebrate&&<Sparkles className="w-4 h-4 text-emerald-300"/>}
                              {n.title}
                              {isCelebrate&&(
                                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">Celebrate</span>
                              )}
                            </div>
                            {n.message&&<div className="text-xs text-white/70 mt-1">{n.message}</div>}
                            <div className="text-[10px] text-white/50 mt-2">{new Date(n.created_at).toLocaleString()}</div>
                          </div>

                          <button className="shrink-0 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 text-xs inline-flex items-center gap-1" onClick={(e)=>{e.stopPropagation();void markNoteRead(n.id);}} title="Mark read">
                            <Check className="w-3 h-3"/>
                            Read
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ):(
                <div className="text-center py-4 text-white/70 text-sm">No new notifications.</div>
              )}
            </div>

            {/* Achievements */}
            <div className="glass-premium rounded-2xl p-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5"/>
                Recent Achievements
              </h3>
              <div className="space-y-3">
                {achievements.map((a)=>(
                  <div key={a.id} className="p-3 rounded-2xl bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-400/30">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-yellow-200 text-sm">{a.title}</span>
                      <span className="text-sm font-bold text-yellow-300">+{a.points_earned}</span>
                    </div>
                    {a.description&&<p className="text-yellow-200/80 text-xs mt-1">{a.description}</p>}
                    <div className="text-xs text-yellow-300/70 mt-2">{new Date(a.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
                {achievements.length===0&&(
                  <div className="text-center py-4 text-white/70">
                    <div className="text-4xl mb-2">🎯</div>
                    <p className="text-sm">No achievements yet</p>
                    <p className="text-xs">Start working on your wishes!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Encouragement card */}
            <div className="glass-premium rounded-2xl p-6 border border-white/20 bg-gradient-to-br from-purple-500/10 to-pink-500/10">
              <div className="text-4xl mb-3">💝</div>
              <h4 className="font-bold text-white mb-2">You're Amazing!</h4>
              <p className="text-white/80 text-sm">Every step you take brings you closer to your dreams. Keep shining bright! ✨</p>
            </div>

            {/* Debug info */}
            {profile&&(
              <details className="glass-premium rounded-2xl p-4 border border-white/20">
                <summary className="cursor-pointer text-white/60 text-sm">Debug Info</summary>
                <div className="mt-2 text-xs text-white/50 space-y-1">
                  <div><strong>Child UID (legacy):</strong> {profile.child_uid}</div>
                  <div><strong>Canonical ID:</strong> {profile.id}</div>
                  <div><strong>Family ID:</strong> {familyId}</div>
                  <div><strong>Available / Balance / Reserved:</strong> {chipAvailable} / {chipBalance} / {chipReserved}</div>
                  <div><strong>wallet rows:</strong> {rows?.length??0}</div>
                </div>
              </details>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- private helpers below -------------------------- */

// ✅ Canonical resolver used across the app (unify with ChildRouteGuard)
async function resolveCanonicalChildId(anyId:any):Promise<{id:string;child_uid:string;family_id:string|null}|null>{
  // 1) Normalize: pull a scalar id/uid from anything passed in
  let key="";
  try{
    if(typeof anyId==="string"){key=anyId.trim();}
    else if(anyId&&typeof anyId==="object"){
      if(anyId.id) key=String(anyId.id);
      else if(anyId.child_uid) key=String(anyId.child_uid);
      else key=JSON.stringify(anyId);
    }
    if(/^\s*\{/.test(key)){
      const o=JSON.parse(key);
      key=String(o.id||o.child_uid||"");
    }
  }catch{}
  if(!key){return null;}

  // 2) Primary: working lookup RPC
  try{
    const {data,error}=await supabase.rpc("api_child_lookup",{p_key:key});
    if(!error&&data){
      const row=(Array.isArray(data)?data[0]:data)as {id?:string;child_uid?:string;family_id?:string|null}|null;
      if(row?.id&&row?.child_uid){return {id:row.id,child_uid:row.child_uid,family_id:row.family_id??null};}
    }
  }catch{}

  // 3) Secondary: child_portal_get_profile({_key})
  try{
    const {data,error}=await supabase.rpc("child_portal_get_profile",{_key:key} as any);
    if(!error&&data){
      const r=(Array.isArray(data)?data[0]:data)as any;
      if(r?.id&&r?.child_uid){return {id:String(r.id),child_uid:String(r.child_uid),family_id:(r.family_id??null)as string|null};}
    }
  }catch{}

  // 4) Fallback: direct table match with a **scalar** key only
  try{
    const {data}=await supabase
      .from("child_profiles")
      .select("id,child_uid,family_id")
      .or(`id.eq.${key},child_uid.eq.${key}`)
      .limit(1);
    const r=data?.[0];
    if(r?.id&&r?.child_uid){return {id:r.id,child_uid:r.child_uid,family_id:r.family_id??null};}
  }catch{}

  return null;
}

async function fetchReservedEffectivePoints(legacyUid?:string|null,canonicalId?:string|null):Promise<number>{
  const ids=Array.from(new Set([legacyUid,canonicalId].filter(Boolean)))as string[];
  if(ids.length===0) return 0;

  const {data:offers,error:offErr}=await supabase
    .from("reward_offers")
    .select("id,reward_id,child_uid,points_cost,points_cost_override,status")
    .in("child_uid",ids)
    .eq("status","Accepted");
  if(offErr||!offers?.length) return 0;

  const rewardIds=Array.from(new Set(offers.map((o)=>o.reward_id).filter(Boolean)as string[]));
  let redeemed:Array<{reward_id:string|null}>=[]; 
  if(rewardIds.length){
    const {data:rdm}=await supabase
      .from("reward_redemptions")
      .select("reward_id,child_uid,status")
      .in("child_uid",ids)
      .in("reward_id",rewardIds)
      .in("status",["Pending","Approved","Fulfilled"]);
    redeemed=Array.isArray(rdm)?rdm:[];
  }
  const redeemedIds=new Set((redeemed??[]).map((r)=>r.reward_id).filter(Boolean)as string[]);

  return (offers??[]).reduce((acc,o:any)=>{
    if(o?.reward_id&&redeemedIds.has(o.reward_id)) return acc;
    const n=Number(o?.points_cost_override??o?.points_cost??0);
    return acc+(Number.isFinite(n)?n:0);
  },0);
}
