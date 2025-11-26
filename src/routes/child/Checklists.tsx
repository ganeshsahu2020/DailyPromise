import {useEffect,useRef,useState}from "react";
import {supabase}from "@/lib/supabase";
import {
  Send,
  ChevronUp,
  ChevronDown,
  Calendar,
  CheckCircle,
  PlayCircle,
  Trophy,
  Sparkles,
  Clock,
  Heart,
  Mic,
  MicOff,
  Volume2,
  PartyPopper,
  Stars,
  Flower2,
  X
}from "lucide-react";
import {toast}from "sonner";
import {tpromise}from "@/utils/toastx";

/* ------------------------------- Types ------------------------------------- */
type Assignment={
  assignment_id:string;
  template_id:string;
  title:string;
  frequency:"Daily"|"Weekly"|"Monthly"|"Yearly"|"Once";
  period_start:string;
  period_end:string;
  status:"Open"|"InProgress"|"Submitted"|"Approved"|"Rejected"|"Fulfilled";
  reward_points:number;
};
type ItemRow={
  id:string;
  item_id:string;
  title:string;
  description:string|null;
  target_count:number;
  progress_count:number;
  status:string;
};
type SubmitExtras={
  note:string;
  mood:"Great"|"Okay"|"Tough"|""; 
  location:"Home"|"Temple"|"School"|"Outdoor"|"Other"|""; 
  minutes:string;
};

type CelebrationHit={assignment_id:string;title:string;reward_points:number};

/* Status filters for main list */
type StatusFilter="All"|"Active"|"Completed";

/* ------------------------- Small delight utils ----------------------------- */
function playBeep(duration=140,freq=880,volume=0.08){
  try{
    const C=(window as any).AudioContext||(window as any).webkitAudioContext;
    if(!C)return;
    const ctx=new C();
    const o=ctx.createOscillator();
    const g=ctx.createGain();
    o.type="sine";
    o.frequency.setValueAtTime(freq,ctx.currentTime);
    g.gain.setValueAtTime(volume,ctx.currentTime);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{
      o.stop();
      ctx.close();
    },duration);
  }catch{}
}
function vibe(ms=60){
  try{
    if("vibrate" in navigator){
      navigator.vibrate(ms);
    }
  }catch{}
}

/* ------------------------------ ID helpers -------------------------------- */
const UUIDRX=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readStoredChildKey():string|null{
  const picks:string[]=[];
  try{
    const v=sessionStorage.getItem("child_id");
    if(v)picks.push(v);
  }catch{}
  try{
    const v=sessionStorage.getItem("child_uid");
    if(v)picks.push(v);
  }catch{}
  try{
    const v=localStorage.getItem("child_portal_child_id");
    if(v)picks.push(v);
  }catch{}
  try{
    const raw=localStorage.getItem("LS_CHILD");
    if(raw){
      try{
        const o=JSON.parse(raw);
        if(o&&o.id)picks.push(String(o.id));
        if(o&&o.child_uid)picks.push(String(o.child_uid));
      }catch{}
    }
  }catch{}
  return picks[0]||null;
}

async function resolveCanonicalChildId(anyKey:string):Promise<string|null>{
  if(!anyKey)return null;

  // A) JSON blob
  if(anyKey.trim().startsWith("{")){
    try{
      const obj=JSON.parse(anyKey);
      const tryList=[obj?.id,obj?.child_uid,obj?.childId,obj?.child_uid_legacy].map((v)=>v&&String(v));
      for(const cand of tryList){
        if(cand&&UUIDRX.test(cand))return cand;
      }
    }catch{}
  }

  // B) Raw UUID
  if(UUIDRX.test(anyKey)){
    try{
      const {data}=await supabase
        .from("child_profiles")
        .select("id,child_uid")
        .or(`id.eq.${anyKey},child_uid.eq.${anyKey}`)
        .limit(1);
      const row=data&&data[0];
      if(row&&row.id&&UUIDRX.test(row.id))return row.id;
      if(row&&row.child_uid&&UUIDRX.test(row.child_uid))return row.child_uid;
    }catch{}
  }

  // C) Generic profile RPC
  try{
    const {data,error}=await supabase.rpc("child_portal_get_profile",{_key:anyKey} as any);
    if(!error&&data){
      const row=Array.isArray(data)?data[0]:data;
      const cand=row&&(row.id||row.child_uid)||null;
      if(cand&&UUIDRX.test(String(cand)))return String(cand);
    }
  }catch{}

  // D) Optional resolve_child_id variants
  try{
    const r1=await supabase.rpc("resolve_child_id",{p_any:anyKey} as any);
    if(!r1.error&&typeof r1.data==="string"&&UUIDRX.test(r1.data))return r1.data;
  }catch{}
  try{
    const r2=await supabase.rpc("resolve_child_id",{p_key:anyKey} as any);
    if(!r2.error&&typeof r2.data==="string"&&UUIDRX.test(r2.data))return r2.data;
  }catch{}

  return null;
}

/* -------------------------- Status helpers --------------------------------- */

const ACTIVE_FILTER_STATUSES:Assignment["status"][]=["Open","InProgress","Submitted"];
const COMPLETED_FILTER_STATUSES:Assignment["status"][]=["Approved","Fulfilled","Rejected"];

/* Rank so active missions float to the top, completed at the bottom */
const STATUS_RANK:Record<Assignment["status"],number>={
  Open:0,
  InProgress:1,
  Submitted:2,
  Approved:3,
  Fulfilled:4,
  Rejected:5
};

function sortAssignments(rows:Assignment[]):Assignment[]{
  return rows.slice().sort((a,b)=>{
    const ra=STATUS_RANK[a.status]??99;
    const rb=STATUS_RANK[b.status]??99;
    if(ra!==rb)return ra-rb;
    const ta=new Date(a.period_start).getTime();
    const tb=new Date(b.period_start).getTime();
    return tb-ta;
  });
}

/* ============================ Component ==================================== */
export default function ChildChecklists(){
  const [childId,setChildId]=useState<string|null>(null);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [items,setItems]=useState<Record<string,ItemRow[]>>({});
  const [busy,setBusy]=useState<string|null>(null);

  const [openExtras,setOpen]=useState<Record<string,boolean>>({});
  const [extras,setEx]=useState<Record<string,SubmitExtras>>({});

  // status filter for main list
  const [statusFilter,setStatusFilter]=useState<StatusFilter>("All");

  // 🎤 voice dictation state
  const [listeningId,setListeningId]=useState<string|null>(null);
  const recognitionRef=useRef<any>(null);

  // 🎤 voice support indicator
  const [voiceSupported,setVoiceSupported]=useState<boolean|null>(null);

  // 🎉 checklist-fulfillment celebration state
  const [celebrateQueue,setCelebrateQueue]=useState<CelebrationHit[]>([]);
  const [celebrateOpen,setCelebrateOpen]=useState(false);
  const [activeCelebration,setActiveCelebration]=useState<CelebrationHit|null>(null);
  const celebrateAudioRef=useRef<HTMLAudioElement|null>(null);
  const prevStatusesRef=useRef<Record<string,Assignment["status"]>>({});
  const hasBootedRef=useRef(false);

  // Detect Web Speech API support
  useEffect(()=>{
    try{
      if(typeof window==="undefined"){
        setVoiceSupported(null);
        return;
      }
      const W=window as any;
      const hasRec=!!(W.SpeechRecognition||W.webkitSpeechRecognition);
      const hasSpeech=typeof W.speechSynthesis!=="undefined";
      setVoiceSupported(hasRec&&hasSpeech);
    }catch{
      setVoiceSupported(null);
    }
  },[]);

  // Celebration audio (drop your file at /public/sounds/checklist_celebrate.wav)
  useEffect(()=>{
    try{
      celebrateAudioRef.current=new Audio("/sounds/checklist_celebrate.wav");
    }catch{}
  },[]);

  // Supabase bootstrap + realtime
  useEffect(()=>{
    let cancelled=false;
    let chAssign:any=null;

    (async()=>{
      const stored=readStoredChildKey();
      if(!stored){
        console.warn("[ChildChecklists] no stored child key");
        return;
      }
      const canonical=await resolveCanonicalChildId(stored);

      if(!canonical){
        console.warn("[ChildChecklists] could not resolve child from key:",stored);
        toast.error("We could not find your profile. Please log in again.");
        return;
      }

      try{
        sessionStorage.setItem("child_id",canonical);
      }catch{}
      try{
        localStorage.setItem("child_portal_child_id",canonical);
      }catch{}
      if(cancelled)return;

      setChildId(canonical);
      await refresh(canonical);
      if(cancelled)return;

      chAssign=supabase
        .channel(`child-assign-${canonical}`)
        .on(
          "postgres_changes",
          {event:"*",schema:"public",table:"checklist_assignments",filter:`child_uid=eq.${canonical}`},
          (payload:any)=>{
            try{
              const n=payload?.new;
              const o=payload?.old;
              const eventType=payload?.eventType;
              if(
                eventType==="UPDATE"&&
                n&&
                n.status==="Fulfilled"&&
                (!o||o.status!=="Fulfilled")
              ){
                const pts=Number(n.reward_points||0);
                if(pts>0){
                  const title=
                    n.title||
                    n.checklist_title||
                    "Checklist complete!";
                  setCelebrateQueue((q)=>[
                    ...q,
                    {
                      assignment_id:String(n.id),
                      title,
                      reward_points:pts
                    }
                  ]);
                }
              }
            }catch{}
            void refresh(canonical);
          }
        )
        .on(
          "postgres_changes",
          {event:"*",schema:"public",table:"checklist_assignment_items"},
          ()=>{
            void refresh(canonical);
          }
        )
        .subscribe();
    })();

    return()=>{
      cancelled=true;
      try{
        if(recognitionRef.current&&typeof recognitionRef.current.stop==="function"){
          recognitionRef.current.stop();
        }
      }catch{}
      recognitionRef.current=null;
      setListeningId(null);
      if(chAssign){
        try{
          supabase.removeChannel(chAssign);
        }catch{}
      }
    };
  },[]);

  // Detect new Fulfilled checklists and queue celebrations (fallback based on list diff)
  function detectCelebrations(rows:Assignment[]){
    setCelebrateQueue((prevQueue)=>{
      const prevMap=prevStatusesRef.current;
      const additions:CelebrationHit[]=[];
      for(const a of rows){
        const prevStatus=prevMap[a.assignment_id];
        if(
          hasBootedRef.current&&
          a.status==="Fulfilled"&&
          a.reward_points>0&&
          prevStatus&&
          prevStatus!=="Fulfilled"
        ){
          additions.push({
            assignment_id:a.assignment_id,
            title:a.title,
            reward_points:a.reward_points
          });
        }
      }
      const nextMap:Record<string,Assignment["status"]>={};
      for(const a of rows){
        nextMap[a.assignment_id]=a.status;
      }
      prevStatusesRef.current=nextMap;
      hasBootedRef.current=true;
      if(!additions.length)return prevQueue;
      return[...prevQueue,...additions];
    });
  }

  async function refresh(cid:string){
    let got=false;

    // Prefer v2 RPC
    try{
      const {data,error}=await supabase.rpc("api_child_active_assignments_v2",{p_child_id:cid} as any);
      if(!error&&Array.isArray(data)){
        const rows=(data as any[]).map((r:any)=>({
          assignment_id:r.assignment_id||r.id,
          template_id:r.template_id,
          title:r.title||r.checklist_title||"Checklist",
          frequency:(r.frequency||"Once") as Assignment["frequency"],
          period_start:r.period_start,
          period_end:r.period_end,
          status:r.status,
          reward_points:Number(r.reward_points||0)
        })) as Assignment[];
        const sorted=sortAssignments(rows);
        detectCelebrations(sorted);
        setAssignments(sorted);
        await loadItemsFor(cid,sorted);
        got=sorted.length>0;
      }
    }catch{}

    if(!got){
      try{
        const {data,error}=await supabase.rpc("api_child_active_assignments",{p_child_uid:cid} as any);
        if(!error&&Array.isArray(data)){
          const rows=(data as any[]).map((r:any)=>({
            assignment_id:r.assignment_id||r.id,
            template_id:r.template_id,
            title:r.title||r.checklist_title||"Checklist",
            frequency:(r.frequency||"Once") as Assignment["frequency"],
            period_start:r.period_start,
            period_end:r.period_end,
            status:r.status,
            reward_points:Number(r.reward_points||0)
          })) as Assignment[];
          const sorted=sortAssignments(rows);
          detectCelebrations(sorted);
          setAssignments(sorted);
          await loadItemsFor(cid,sorted);
          got=sorted.length>0;
        }
      }catch{}
    }

    if(!got){
      const {data,error}=await supabase
        .from("checklist_assignments")
        .select(`
          id,template_id,child_uid,period_start,period_end,status,reward_points,created_at,
          checklist_templates:template_id(title,frequency)
        `)
        .eq("child_uid",cid)
        .in("status",["Open","InProgress","Submitted","Approved","Fulfilled"])
        .order("created_at",{ascending:false});
      if(!error&&Array.isArray(data)){
        const rows=(data as any[]).map((r:any)=>({
          assignment_id:r.id,
          template_id:r.template_id,
          title:r.checklist_templates&&r.checklist_templates.title||"Checklist",
          frequency:(r.checklist_templates&&r.checklist_templates.frequency||"Once") as Assignment["frequency"],
          period_start:r.period_start,
          period_end:r.period_end,
          status:r.status,
          reward_points:Number(r.reward_points||0)
        })) as Assignment[];
        const sorted=sortAssignments(rows);
        detectCelebrations(sorted);
        setAssignments(sorted);
        await loadItemsFor(cid,sorted);
      }else{
        setAssignments([]);
        setItems({});
      }
    }
  }

  async function loadItemsFor(cid:string,rows:Assignment[]){
    const map:Record<string,ItemRow[]>={};
    for(const row of rows){
      try{
        const {data,error}=await supabase.rpc("api_child_assignment_items_v1",{p_assignment_id:row.assignment_id,p_child_id:cid} as any);
        if(!error&&Array.isArray(data)){
          map[row.assignment_id]=(data as any[]).map((r:any)=>({
            id:r.id,
            item_id:r.item_id,
            title:r.title||"Item",
            description:r.description||null,
            target_count:Number(r.target_count||0),
            progress_count:Number(r.progress_count||0),
            status:r.status||"Open"
          }));
          continue;
        }
      }catch{}
      try{
        const {data}=await supabase
          .from("checklist_assignment_items")
          .select("id,item_id,title,description,target_count,progress_count,status")
          .eq("assignment_id",row.assignment_id)
          .order("id",{ascending:true});
        map[row.assignment_id]=(data||[]) as any;
      }catch{
        map[row.assignment_id]=[]; 
      }
    }
    setItems(map);
  }

  async function mark(assignmentId:string,itemId:string,delta:number){
    if(!childId)return;
    setBusy(`${assignmentId}:${itemId}`);

    const p=(async()=>{
      const {error}=await supabase.rpc("child_mark_checklist_progress",{
        p_assignment_id:assignmentId,
        p_item_id:itemId,
        p_delta:delta,
        p_child_uid:childId
      });
      if(error)throw error;
      await refresh(childId);
    })();

    await tpromise(p,{
      loading:delta>0?"Marking progress…":"Updating…",
      success:delta>0?"Progress updated ✅":"Updated ✅",
      error:(e)=>((e&&e.message)||"Could not update progress")
    });

    setBusy(null);
  }

  function toggleExtras(aid:string){
    setOpen((s)=>({
      ...s,
      [aid]:!s[aid]
    }));
    setEx((s)=>({
      ...s,
      [aid]:s[aid]||{
        note:"",
        mood:"",
        location:"",
        minutes:""
      }
    }));
  }

  function updateExtra(aid:string,patch:Partial<SubmitExtras>){
    setEx((s)=>({
      ...s,
      [aid]:{
        ...(s[aid]||{note:"",mood:"",location:"",minutes:""}),
        ...patch
      }
    }));
  }

  /* --------------------------- Voice helpers ------------------------------- */
  function speakPrompt(){
    try{
      const synth=window.speechSynthesis;
      if(!synth)return;
      synth.cancel();
      const u=new SpeechSynthesisUtterance("What did you do for this adventure? You can tell me now, and I will write it for you.");
      u.lang="en-US";
      synth.speak(u);
    }catch{}
  }

  function stopDictation(){
    try{
      if(recognitionRef.current&&typeof recognitionRef.current.stop==="function"){
        recognitionRef.current.stop();
      }
    }catch{}
    recognitionRef.current=null;
    setListeningId(null);
  }

  function startDictation(aid:string){
    if(listeningId===aid){
      stopDictation();
      return;
    }

    const W=window as any;
    const SR=W.SpeechRecognition||W.webkitSpeechRecognition;
    if(!SR){
      toast.error("Voice capture is not supported on this device yet.");
      setVoiceSupported(false);
      return;
    }

    stopDictation();

    const rec=new SR();
    recognitionRef.current=rec;
    rec.lang="en-US";
    rec.interimResults=false;
    rec.continuous=false;

    setListeningId(aid);
    playBeep(120,900,0.15);
    vibe(40);

    rec.onresult=(e:any)=>{
      if(!e.results||e.results.length===0)return;
      const last=e.results[e.results.length-1];
      if(!last||!last[0])return;
      const chunk=String(last[0].transcript||"").trim();
      if(!chunk)return;

      setEx((s)=>{
        const current=s[aid]||{note:"",mood:"",location:"",minutes:""};
        const prevNote=current.note||"";
        const sep=prevNote.length>0?" ":"";
        return{
          ...s,
          [aid]:{
            ...current,
            note:(prevNote+sep+chunk).trim()
          }
        };
      });
    };

    rec.onerror=(e:any)=>{
      console.warn("[ChildChecklists] speech error",e);

      const code=e&&e.error;
      let msg="Something went wrong with voice capture.";

      if(code==="not-allowed"){
        msg="Please allow microphone access in your browser (click the lock icon near the address bar).";
      }else if(code==="network"){
        msg="There was a network issue while listening. Please check your internet and try again.";
      }else if(code==="no-speech"){
        msg="I did not hear any speech. Try speaking a little louder or closer to the mic.";
      }else if(code==="audio-capture"){
        msg="No microphone was found. Please plug in or enable your microphone in Windows settings.";
      }else if(typeof code==="string"){
        msg=`Voice error: ${code}`;
      }

      toast.error(msg);

      setListeningId(null);
      try{
        if(recognitionRef.current&&typeof recognitionRef.current.stop==="function"){
          recognitionRef.current.stop();
        }
      }catch{}
      recognitionRef.current=null;
    };

    rec.onend=()=>{
      playBeep(100,600,0.1);
      vibe(30);
      setListeningId(null);
      recognitionRef.current=null;
    };

    try{
      rec.start();
    }catch(e){
      console.warn("[ChildChecklists] speech start failed",e);
      toast.error("I could not start listening. Please try again.");
      setListeningId(null);
      recognitionRef.current=null;
    }
  }

  /* ------------------------ SUBMIT: write ChildNote + submit --------------- */
  async function submit(assignmentId:string){
    if(!childId){
      console.warn("[child] submit: missing childId",{assignmentId,childId});
      toast.error("We could not find your profile. Please log in again.");
      return;
    }

    const ex=extras[assignmentId];
    console.log("[child] submit clicked",{assignmentId,childId,extras:ex});

    const hasAny=!!(
      ex&&(
        (ex.note&&ex.note.trim().length>0)||
        ex.mood||
        ex.location||
        (ex.minutes&&ex.minutes!=="")
      )
    );

    const p=(async()=>{
      // 1) Insert ChildNote event if there is any content
      if(hasAny&&ex){
        const noteText=ex.note?ex.note.trim():"";
        const minutesVal=ex.minutes?Number(ex.minutes):null;

        const meta={
          note:noteText,
          mood:ex.mood||null,
          location:ex.location||null,
          minutes:minutesVal
        };

        console.log("[child] about to insert ChildNote",{assignmentId,childId,meta});

        const {data,error:noteErr}=await supabase
          .from("checklist_assignment_events")
          .insert({
            assignment_id:assignmentId,
            child_uid:childId,
            actor_role:"child",
            event_type:"ChildNote",
            meta
          } as any)
          .select();

        if(noteErr){
          console.error("[child] ChildNote insert error",noteErr);
          throw noteErr;
        }

        console.log("[child] ChildNote insert OK",data);
      }else{
        console.log("[child] no extras to save, skipping ChildNote insert");
      }

      // 2) Mark assignment Submitted
      console.log("[child] calling child_submit_assignment RPC",{assignmentId,childId});
      const {error}=await supabase.rpc("child_submit_assignment",{
        p_assignment_id:assignmentId,
        p_child_uid:childId
      } as any);
      if(error){
        console.error("[child] submit RPC error",error);
        throw error;
      }
      console.log("[child] submit RPC OK, refreshing");

      // 3) Reset local UI and refresh
      setOpen((s)=>({
        ...s,
        [assignmentId]:false
      }));
      setEx((s)=>({
        ...s,
        [assignmentId]:{
          note:"",
          mood:"",
          location:"",
          minutes:""
        }
      }));

      await refresh(childId);
    })();

    await tpromise(p,{
      loading:"Submitting for review…",
      success:"Submitted for approval 🎉",
      error:(e)=>((e&&e.message)||"Could not submit")
    });
  }

  function statusCfg(s:Assignment["status"]){
    switch(s){
      case "Open":return{cls:"bg-blue-500/20 text-blue-300 border-blue-400/40",icon:"🔵",label:"Ready to Start"};
      case "InProgress":return{cls:"bg-yellow-500/20 text-yellow-300 border-yellow-400/40",icon:"🟡",label:"In Progress"};
      case "Submitted":return{cls:"bg-purple-500/20 text-purple-300 border-purple-400/40",icon:"🟣",label:"Submitted • waiting for parent"};
      case "Approved":return{cls:"bg-emerald-500/20 text-emerald-300 border-emerald-400/40",icon:"✅",label:"Approved • reward coming soon"};
      case "Fulfilled":return{cls:"bg-green-500/20 text-green-300 border-green-400/40",icon:"🎉",label:"Completed • reward delivered"};
      default:return{cls:"bg-gray-500/20 text-gray-300 border-gray-400/40",icon:"⚪",label:s};
    }
  }
  function freqIcon(f:Assignment["frequency"]){
    switch(f){
      case "Daily":return"🌞";
      case "Weekly":return"📅";
      case "Monthly":return"🗓️";
      case "Yearly":return"🎂";
      default:return"⭐";
    }
  }

  // 🔢 Simple JS rollup of checklist points from assignments
  let totalChecklistPts=0;
  let approvedChecklistPts=0;
  let pendingChecklistPts=0;
  for(const a of assignments){
    const pts=a.reward_points||0;
    if(pts<=0)continue;
    if(a.status==="Approved"||a.status==="Fulfilled"){
      approvedChecklistPts+=pts;
      totalChecklistPts+=pts;
    }else if(a.status==="Submitted"){
      pendingChecklistPts+=pts;
      totalChecklistPts+=pts;
    }
  }

  // Counts for header tiles
  const activeCount=assignments.filter((a)=>a.status==="Open"||a.status==="InProgress").length;
  const completedCount=assignments.filter((a)=>a.status==="Approved"||a.status==="Fulfilled").length;
  const potentialPoints=assignments.reduce((s,a)=>s+(a.reward_points||0),0);

  /* ------------------ Status filter + chip styling ------------------------- */
  const statusChipBase="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] border transition";
  const statusChipActive="bg-emerald-500/20 border-emerald-400/60 text-emerald-100";
  const statusChipIdle="bg-white/5 border-white/15 text-white/70 hover:bg-white/10";

  const filteredAssignments=(()=>{
    if(statusFilter==="Active"){
      return assignments.filter((a)=>ACTIVE_FILTER_STATUSES.includes(a.status));
    }
    if(statusFilter==="Completed"){
      return assignments.filter((a)=>COMPLETED_FILTER_STATUSES.includes(a.status));
    }
    return assignments;
  })();

  /* ------------------ Celebration helpers (shared entrypoint) -------------- */

  function openCelebration(hit:CelebrationHit){
    // ⬆️ Scroll page to top so card + stars are visible from top
    try{
      window.scrollTo({top:0,left:0,behavior:"smooth"});
    }catch{}
    setActiveCelebration(hit);
    setCelebrateOpen(true);
    try{
      const el=celebrateAudioRef.current;
      if(el){
        el.currentTime=0;
        void el.play().catch(()=>{});
      }
    }catch{}
  }

  function openNextCelebration(){
    setCelebrateQueue((q)=>{
      if(!q.length)return q;
      const hit=q[q.length-1];
      openCelebration(hit);
      return q.slice(0,-1);
    });
  }

  function handleCloseCelebration(){
    setCelebrateOpen(false);
    setActiveCelebration(null);
    try{
      const el=celebrateAudioRef.current;
      if(el){
        el.pause();
        el.currentTime=0;
      }
    }catch{}
  }

  return(
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-200 to-cyan-200 bg-clip-text text-transparent">
            My Daily Adventures 🚀
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <p className="text-white/70">
              Complete tasks and earn magical points!
            </p>
            {voiceSupported!==null&&(
              <span
                className={[
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border",
                  "text-[11px]",
                  voiceSupported
                    ?"border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                    :"border-rose-400/60 bg-rose-500/10 text-rose-100"
                ].join(" ")}
              >
                <Mic className="w-3 h-3"/>
                {voiceSupported?"Voice ready":"Voice not supported"}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-premium rounded-2xl p-3 text-center border border-white/20 hover-lift">
            <div className="text-lg font-bold text-blue-200">
              {activeCount}
            </div>
            <div className="text-white/70 text-xs">
              Active
            </div>
          </div>
          <div className="glass-premium rounded-2xl p-3 text-center border border-white/20 hover-lift">
            <div className="text-lg font-bold text-emerald-200">
              {completedCount}
            </div>
            <div className="text-white/70 text-xs">
              Completed
            </div>
          </div>
          <div className="glass-premium rounded-2xl p-3 text-center border border-white/20 hover-lift">
            <div className="text-lg font-bold text-purple-200">
              {potentialPoints}
            </div>
            <div className="text-white/70 text-xs">
              Potential Points
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Checklist points summary chips (computed from assignments) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-premium rounded-2xl p-3 border border-white/15 flex items-center justify-between">
          <div>
            <div className="text-xs text-white/60">Total Checklist pts</div>
            <div className="text-xl font-bold text-sky-200">
              {totalChecklistPts} pts
            </div>
            <div className="text-[11px] text-white/50">
              Approved + Pending submissions
            </div>
          </div>
          <div className="p-2 rounded-xl bg-sky-500/20 border border-sky-500/40">
            <Trophy className="w-5 h-5 text-sky-200"/>
          </div>
        </div>
        <div className="glass-premium rounded-2xl p-3 border border-emerald-500/30 flex items-center justify-between bg-emerald-500/5">
          <div>
            <div className="text-xs text-white/60">Approved/Completed pts</div>
            <div className="text-xl font-bold text-emerald-200">
              {approvedChecklistPts} pts
            </div>
            <div className="text-[11px] text-white/50">
              Parent-approved & fulfilled checklists
            </div>
          </div>
          <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
            <CheckCircle className="w-5 h-5 text-emerald-200"/>
          </div>
        </div>
        <div className="glass-premium rounded-2xl p-3 border border-purple-500/30 flex items-center justify-between bg-purple-500/5">
          <div>
            <div className="text-xs text-white/60">Pending Approval pts</div>
            <div className="text-xl font-bold text-purple-200">
              {pendingChecklistPts} pts
            </div>
            <div className="text-[11px] text-white/50">
              Submitted, waiting for review
            </div>
          </div>
          <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/40">
            <Clock className="w-5 h-5 text-purple-200"/>
          </div>
        </div>
      </div>

      {assignments.length===0?(
        <div className="glass-premium rounded-2xl p-6 text-center border border-white/20">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-2xl font-bold text-white mb-2">
            No Adventures Yet!
          </h3>
          <p className="text-white/70 mb-6">
            Your magical tasks will appear here soon...
          </p>
          <div className="text-white/50 text-sm">
            Check back later for new challenges! ✨
          </div>
        </div>
      ):(
        <div className="space-y-4">
          {/* Status filter chips for the main list */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${statusChipBase} ${statusFilter==="All"?statusChipActive:statusChipIdle}`}
              onClick={()=>setStatusFilter("All")}
            >
              All
            </button>
            <button
              type="button"
              className={`${statusChipBase} ${statusFilter==="Active"?statusChipActive:statusChipIdle}`}
              onClick={()=>setStatusFilter("Active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`${statusChipBase} ${statusFilter==="Completed"?statusChipActive:statusChipIdle}`}
              onClick={()=>setStatusFilter("Completed")}
            >
              Completed
            </button>
          </div>

          {filteredAssignments.map((a)=>{
            const list=items[a.assignment_id]||[];

            const isApprovedLike=a.status==="Approved"||a.status==="Fulfilled";
            let done=list.filter((i)=>i.progress_count>=i.target_count).length;
            let pct=list.length?Math.floor((done/list.length)*100):0;

            // ✅ If parent has approved/fulfilled, show card as 100% complete
            if(isApprovedLike&&list.length>0){
              done=list.length;
              pct=100;
            }

            const isSubmitted=a.status==="Submitted";
            const isApproved=isApprovedLike;
            const isLocked=isSubmitted||isApproved;

            const ex=extras[a.assignment_id]||{note:"",mood:"",location:"",minutes:""};
            const sc=statusCfg(a.status);

            const hasCelebrationHit=
              (activeCelebration&&activeCelebration.assignment_id===a.assignment_id)||
              celebrateQueue.some((h)=>h.assignment_id===a.assignment_id);

            return(
              <div
                key={a.assignment_id}
                className="glass-premium rounded-2xl p-4 border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 hover-lift"
              >
                {/* Card header */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white sparkle">
                      <Calendar className="w-6 h-6"/>
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-white">
                          {a.title}
                        </h3>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold border ${sc.cls} self-start sm:self-auto`}
                        >
                          {sc.icon} {sc.label}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-white/70">
                        <div className="flex items-center gap-1">
                          <span>{freqIcon(a.frequency)}</span>
                          <span>{a.frequency}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4"/>
                          <span>
                            {new Date(a.period_start).toLocaleDateString()} –{" "}
                            {new Date(a.period_end).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-center sm:text-right self-center sm:self-auto">
                    <div className="text-xl font-bold text-emerald-300">
                      {a.reward_points}
                    </div>
                    <div className="text-sm text-white/60 flex items-center gap-1 justify-center sm:justify-end">
                      <Trophy className="w-4 h-4"/>
                      <span>points</span>
                    </div>
                    {a.status==="Fulfilled"&&(
                      <button
                        type="button"
                        onClick={()=>{
                          openCelebration({
                            assignment_id:a.assignment_id,
                            title:a.title,
                            reward_points:a.reward_points
                          });
                        }}
                        className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/60 text-[11px] text-emerald-100 hover:bg-emerald-500/30"
                      >
                        <PartyPopper className="w-3 h-3"/>
                        View reward celebration
                      </button>
                    )}
                    {hasCelebrationHit&&!a.status.includes("Fulfilled")&&(
                      <div className="mt-2 text-[10px] text-emerald-200">
                        🎉 New reward notification
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-white/70 mb-2">
                    <span>Mission Progress</span>
                    <span>
                      {done}/{list.length} completed ({pct}
                      %)
                    </span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-1000 ease-out"
                      style={{width:`${pct}%`}}
                    />
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-3 mb-4">
                  {list.map((row)=>{
                    const complete=row.progress_count>=row.target_count||isApprovedLike;
                    const progressPct=row.target_count
                      ?Math.min(100,isApprovedLike?100:(row.progress_count/row.target_count)*100)
                      :0;
                    return(
                      <div
                        key={row.id}
                        className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-200"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {complete?(
                                <CheckCircle className="w-5 h-5 text-emerald-400"/>
                              ):(
                                <PlayCircle className="w-5 h-5 text-blue-400"/>
                              )}
                              <div className="text-white font-semibold">
                                {row.title}
                              </div>
                            </div>
                            {row.description&&(
                              <div className="text-white/70 text-sm mb-2">
                                {row.description}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-xs text-white/60">
                              <span>
                                Progress:{" "}
                                {isApprovedLike?row.target_count:row.progress_count} / {row.target_count}
                              </span>
                              <div className="w-20 bg-white/20 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    complete?"bg-emerald-500":"bg-blue-500"
                                  }`}
                                  style={{width:`${progressPct}%`}}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              disabled={
                                isLocked||
                                busy===`${a.assignment_id}:${row.item_id}`||
                                row.progress_count<=0
                              }
                              onClick={()=>mark(a.assignment_id,row.item_id,-1)}
                              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover-lift"
                              title="Decrease progress"
                            >
                              <ChevronDown className="w-4 h-4"/>
                            </button>
                            <button
                              disabled={isLocked||busy===`${a.assignment_id}:${row.item_id}`}
                              onClick={()=>mark(a.assignment_id,row.item_id,+1)}
                              className="p-2 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover-lift"
                              title="Increase progress"
                            >
                              <ChevronUp className="w-4 h-4"/>
                            </button>
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                complete
                                  ?"bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                                  :"bg-white/10 text-white/60 border border-white/20"
                              }`}
                            >
                              {complete?"✓":"→"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Extras card */}
                <div className="mb-4">
                  <button
                    onClick={()=>toggleExtras(a.assignment_id)}
                    disabled={isLocked}
                    className={`w-full px-4 py-3 rounded-2xl text-white font-semibold transition-all duration-300 hover-lift ${
                      isLocked
                        ?"bg-white/10 cursor-not-allowed"
                        :"bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 hover:from-purple-500/30 hover:to-pink-500/30"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4"/>
                      {openExtras[a.assignment_id]
                        ?"Hide Adventure Details"
                        :"Share Your Adventure Story"}
                    </div>
                  </button>

                  {openExtras[a.assignment_id]&&!isLocked&&(()=>{
                    const listening=listeningId===a.assignment_id;
                    const exCurr=ex;

                    return(
                      <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-400/30">
                        <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                          <Heart className="w-4 h-4"/>
                          Tell us about your adventure!
                        </h4>

                        <div className="space-y-4">
                          {/* What did you do + voice helper */}
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <label className="block text-sm text-white/70">
                                What did you do? ✨
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={()=>startDictation(a.assignment_id)}
                                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                                    listening
                                      ?"bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                                      :"bg-slate-900/60 border-white/20 text-white/80 hover:bg-slate-800"
                                  }`}
                                >
                                  {listening?(
                                    <>
                                      <MicOff className="w-3.5 h-3.5"/>
                                      Listening…
                                    </>
                                  ):(
                                    <>
                                      <Mic className="w-3.5 h-3.5"/>
                                      Tap & talk
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={speakPrompt}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] border border-white/15 bg-slate-900/60 text-white/70 hover:bg-slate-800"
                                  title="Play the question out loud"
                                >
                                  <Volume2 className="w-3.5 h-3.5"/>
                                  Ask me
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={exCurr.note}
                              onChange={(e)=>updateExtra(a.assignment_id,{note:e.target.value})}
                              className="w-full px-4 py-3 rounded-2xl bg-slate-900/70 border border-white/25 text-white placeholder-white/50 focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none resize-none"
                              placeholder="Share your special moments... you can type or use the mic button."
                              rows={3}
                            />
                          </div>

                          {/* Mood + Location */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm text-white/70 mb-2">
                                How did it feel? 💖
                              </label>
                              <select
                                value={exCurr.mood}
                                onChange={(e)=>updateExtra(a.assignment_id,{mood:e.target.value as any})}
                                className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white border border-white/25 text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none"
                              >
                                <option className="bg-white text-slate-900" value="">
                                  Choose mood
                                </option>
                                <option className="bg-white text-slate-900">
                                  Great
                                </option>
                                <option className="bg-white text-slate-900">
                                  Okay
                                </option>
                                <option className="bg-white text-slate-900">
                                  Tough
                                </option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm text-white/70 mb-2">
                                Where? 🗺️
                              </label>
                              <select
                                value={exCurr.location}
                                onChange={(e)=>updateExtra(a.assignment_id,{location:e.target.value as any})}
                                className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white border border-white/25 text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none"
                              >
                                <option className="bg-white text-slate-900" value="">
                                  Choose place
                                </option>
                                <option className="bg-white text-slate-900">
                                  Home
                                </option>
                                <option className="bg-white text-slate-900">
                                  Temple
                                </option>
                                <option className="bg-white text-slate-900">
                                  School
                                </option>
                                <option className="bg-white text-slate-900">
                                  Outdoor
                                </option>
                                <option className="bg-white text-slate-900">
                                  Other
                                </option>
                              </select>
                            </div>
                          </div>

                          {/* Time spent */}
                          <div>
                            <label className="block text-sm text-white/70 mb-2">
                              Time spent ⏰
                            </label>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={exCurr.minutes}
                              onChange={(e)=>updateExtra(a.assignment_id,{minutes:e.target.value})}
                              className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white border border-white/25 placeholder-white/50 focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none"
                              placeholder="Minutes"
                            />
                          </div>
                        </div>

                        <div className="text-xs text-white/50 mt-3 flex items-center gap-2">
                          <Sparkles className="w-3 h-3"/>
                          Your parents will love hearing about your adventure!
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Submit */}
                <div className="flex justify-center sm:justify-end">
                  <button
                    onClick={()=>submit(a.assignment_id)}
                    disabled={isLocked}
                    className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl font-semibold text-white transition-all duration-300 hover-lift w-full sm:w-auto justify-center ${
                      isLocked
                        ?"bg-white/10 text-white/60 cursor-not-allowed"
                        :"bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg hover:shadow-xl"
                    }`}
                  >
                    {isApproved?(
                      <>
                        <CheckCircle className="w-5 h-5"/>
                        {a.status==="Fulfilled"
                          ?"Mission Completed!"
                          :"Mission Approved!"}
                      </>
                    ):isSubmitted?(
                      <>
                        <CheckCircle className="w-5 h-5"/>
                        Mission Submitted – waiting for parent
                      </>
                    ):(
                      <>
                        <Send className="w-5 h-5"/>
                        Submit Adventure for Review
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating celebration chip (tap to open) */}
      {celebrateQueue.length>0&&!celebrateOpen&&(
        <button
          type="button"
          onClick={openNextCelebration}
          className="fixed bottom-4 right-4 z-[170] inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-xl hover:shadow-2xl hover:scale-[1.03] transition-all duration-300"
        >
          <PartyPopper className="w-5 h-5 animate-pulse"/>
          New reward!
          <span className="ml-1 inline-flex items-center justify-center text-xs font-black min-w-5 h-5 px-2 rounded-full bg-white/25">
            {celebrateQueue.length}
          </span>
        </button>
      )}

      <ChecklistCelebrationOverlay
        open={celebrateOpen&&!!activeCelebration}
        hit={activeCelebration}
        onClose={handleCloseCelebration}
        autoCloseMs={12000}
      />
    </div>
  );
}

/* === Celebration overlay & emoji rain ===================================== */
type ChecklistCelebrationOverlayProps={
  open:boolean;
  hit:CelebrationHit|null;
  onClose:()=>void;
  autoCloseMs?:number;
};

function ChecklistCelebrationOverlay({open,hit,onClose,autoCloseMs=12000}:ChecklistCelebrationOverlayProps){
  useEffect(()=>{
    if(!open)return;
    if(!autoCloseMs||autoCloseMs<=0)return;
    const t=setTimeout(onClose,autoCloseMs);
    return()=>clearTimeout(t);
  },[open,autoCloseMs,onClose]);

  if(!open||!hit)return null;

  function handleRead(){
    try{
      const synth=window.speechSynthesis;
      if(!synth)return;
      synth.cancel();
      const text=`Yay! Mission completed. You finished ${hit.title} and earned ${hit.reward_points} points.`;
      const u=new SpeechSynthesisUtterance(text);
      u.lang="en-US";
      synth.speak(u);
    }catch{}
  }

  return(
    <div className="fixed inset-0 z-[180] flex items-start justify-center px-4 pt-8 pb-4">
      <div
        className="absolute inset-0 z-0 bg-[radial-gradient(1400px_700px_at_50%_-200px,rgba(52,211,153,0.35),transparent),radial-gradient(1000px_600px_at_10%_120%,rgba(96,165,250,0.3),transparent),linear-gradient(to_bottom,#020617,#020617)]"
        onClick={onClose}
      />
      {/* 🌸 Emoji rain layer above backdrop, below card */}
      <ChecklistEmojiRain/>
      <div className="relative z-20 glass-premium rounded-3xl border border-emerald-400/60 shadow-[0_0_40px_rgba(34,197,94,0.5)] max-w-lg w-full overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-xl bg-white/10 border border-white/20 text-white/90 hover:bg-white/20"
          aria-label="Close"
        >
          <X className="w-5 h-5"/>
        </button>
        <div className="relative px-6 pt-8 pb-5 bg-gradient-to-br from-emerald-500/30 via-teal-500/20 to-indigo-500/25 border-b border-white/15">
          <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-emerald-400/25 blur-3xl pointer-events-none"/>
          <div className="absolute -bottom-16 -right-10 w-64 h-64 rounded-full bg-cyan-400/25 blur-3xl pointer-events-none"/>
          <div className="flex items-center justify-center gap-3 text-emerald-100 mb-3">
            <Flower2 className="w-8 h-8 animate-bounce"/>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight drop-shadow">
              Congratulations!
            </h2>
            <Stars className="w-8 h-8 animate-bounce [animation-delay:120ms]"/>
          </div>
          <div className="text-6xl md:text-7xl text-center select-none">🌸🌟✨</div>
          <div className="mt-4 flex flex-col items-center gap-1">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-300/70 text-emerald-50 text-xs md:text-sm font-semibold">
              <PartyPopper className="w-4 h-4"/>
              Checklist completed!
            </div>
          </div>
        </div>
        <div className="px-6 py-6 text-center space-y-3">
          <p className="text-white text-base md:text-lg font-semibold">
            You finished <span className="text-emerald-300">{hit.title}</span>
          </p>
          <p className="text-sm md:text-base text-white/75">
            Your effort was noticed and your parent marked this adventure as
            <span className="font-semibold text-emerald-200"> fulfilled</span>.
          </p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <div className="px-5 py-3 rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 text-slate-900 font-extrabold text-lg md:text-xl shadow-lg">
              +{hit.reward_points} pts
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              type="button"
              onClick={handleRead}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold"
            >
              <Volume2 className="w-4 h-4"/>
              Read it aloud
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold"
            >
              Got it! Keep going ✨
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistEmojiRain({count=80}:{count?:number}){
  const [bits]=useState(()=>Array.from({length:count}).map(()=>({
    id:Math.random().toString(36).slice(2),
    left:Math.random()*100,
    size:20+Math.random()*16,
    delay:Math.random()*0.8,
    duration:4+Math.random()*3,
    char:["🌸","🌼","🌟","💫","✨","💖","🎈","⭐","🌺","🍀"][Math.floor(Math.random()*10)]
  })));
  return(
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {bits.map((b)=>(
        <div
          key={b.id}
          style={{
            position:"absolute",
            left:`${b.left}%`,
            top:"-10%",
            fontSize:`${b.size}px`,
            animation:`checklist-fall ${b.duration}s ${b.delay}s ease-in forwards`
          }}
        >
          {b.char}
        </div>
      ))}
      <style>{`
        @keyframes checklist-fall{
          0%{transform:translateY(-10vh) rotate(0deg);opacity:0;}
          10%{opacity:1;}
          100%{transform:translateY(110vh) rotate(720deg);opacity:0;}
        }
      `}</style>
    </div>
  );
}
