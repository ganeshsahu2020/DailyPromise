// src/routes/parent/Rewards.tsx
import {useEffect,useMemo,useRef,useState}from "react";
import {supabase}from "@/lib/supabase";
import {toast}from "sonner";
import {tpromise}from "@/utils/toastx";
import {childIdScalar,requireUuidOrWarn}from "@/utils/ids";
import {Clock,Gift,BookOpen}from "lucide-react";

/** ------ DB Types ------ */
type Reward={
  id:string;
  title:string;
  description:string|null;
  points_cost:number;
  is_active:boolean;
  created_at?:string;
};

type Ledger={
  id:number;
  child_uid:string;
  points:number;
  reason:string|null;
  created_at:string;
};

type Child={
  child_uid:string;
  first_name:string;
  last_name:string|null;
  age:number|null;
};

type CompletedRow={
  id:string; // target_id
  title:string|null;
  description:string|null;
  category:string|null;
  difficulty:string|null;
  points_award:number|null;
  target_created:string;
  child_uid:string|null;
  points:number|null;
  reason:string|null;
  completion_type:"full_evidence"|"completed"|"quick_complete"|null;
  evidence_count:number|null;
  completed_at:string|null;
  latest_evidence_date:string|null;
};

type CompletionDetail={
  target_id:string;
  completed_at:string|null;
  points_award:number|null;
  completion_type:"full_evidence"|"completed"|"quick_complete"|null;
  note:string|null;
  events:Array<{
    id:string;
    type:string|null;
    data:any;
    description:string|null;
    created_at:string;
  }>;
  evidence:Array<{
    id:string;
    type:"photo"|"video"|"audio"|"text"|"checklist"|string;
    data:any;
    description:string|null;
  }>;
};

type OfferStatusRow={
  id:string;
  target_id:string;
  status:"Offered"|"Accepted"|"Rejected"|"Fulfilled"|"Expired";
};

/** ------ Reward presets from DB ------ */
type Preset={
  id:string;
  family_id:string|null;
  title:string;
  description:string|null;
  points_cost:number;
  is_active:boolean;
};

/** ---- UI helpers: consistent dark controls ---- */
const inputCls=
  "rounded px-3 py-2 bg-slate-800 text-white border border-white/20 "+
  "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/40 "+
  "placeholder-white/60";
const selectCls=
  "rounded px-3 py-2 bg-slate-800 text-white border border-white/20 "+
  "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/40 "+
  "w-full";
const buttonGhost=
  "px-3 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/15";

/** A tiny style fallback to ensure the native dropdown has readable colors */
function DarkSelectStyle(){
  return(
    <style>{`
      select { color-scheme: dark; }
      select option, select optgroup { background-color: #0f172a; color: #fff; }
      @-moz-document url-prefix() {
        select option { background-color: #0b1220; color: #fff; }
      }
    `}</style>
  );
}

/* -------------------------------------------------------------------------- */
/*  SAFE CHILD-SCOPED TABLE-ONLY FETCHERS (offers/redemptions/ledger)         */
/* -------------------------------------------------------------------------- */
async function refreshLedgerSafe(rawChild:any){
  const childId=requireUuidOrWarn(childIdScalar(rawChild),"child_uid");
  const {data,error}=await supabase
    .from("child_points_ledger")
    .select("id,child_uid,points,reason,created_at")
    .eq("child_uid",childId)
    .order("created_at",{ascending:false});
  if(error) throw error;
  return(data||[])as Ledger[];
}

async function refreshRedemptionsSafe(rawChild:any){
  const childId=requireUuidOrWarn(childIdScalar(rawChild),"child_uid");
  const {data,error}=await supabase
    .from("reward_redemptions")
    .select("id,reward_id,status,created_at,reviewed_at,notes")
    .eq("child_uid",childId)
    .order("created_at",{ascending:false});
  if(error) throw error;
  return(data||[]);
}

type OfferRow={
  id:string;
  family_id:string|null;
  child_uid:string;
  target_id:string|null;
  reward_id:string|null;
  custom_title:string|null;
  custom_description:string|null;
  message:string|null;
  points_cost_override:number|null;
  points_cost:number|null;
  title:string|null;
  description:string|null;
  status:string;
  offered_at:string;
  decided_at:string|null;
};
async function refreshOffersSafe(rawChild:any,familyId?:string|null){
  const childId=requireUuidOrWarn(childIdScalar(rawChild),"child_uid");
  let qb=supabase
    .from("reward_offers")
    .select("id,family_id,child_uid,target_id,reward_id,custom_title,custom_description,message,points_cost_override,points_cost,status,offered_at,decided_at,title,description")
    .eq("child_uid",childId)
    .order("offered_at",{ascending:false});
  if(familyId){ qb=qb.eq("family_id",familyId); }
  const {data,error}=await qb;
  if(error) throw error;
  return(data||[])as OfferRow[];
}

/** Child ledger preview helper (50 items, points→delta, includes evidence_count) */
async function fetchChildLedgerPreview(childUid:string){
  const {data,error}=await supabase
    .from("child_points_ledger")
    .select("points,created_at,reason,evidence_count")
    .eq("child_uid",childUid)
    .order("created_at",{ascending:false})
    .limit(50);
  if(error) throw error;
  const rows=(data||[]).map((r:any)=>({delta:Number(r.points||0),created_at:r.created_at,reason:r.reason,evidence_count:Number(r.evidence_count||0)}));
  return rows as Array<{delta:number;created_at:string;reason:string|null;evidence_count:number}>;
}

type CompletedFilter="all"|"no_offer"|"pending"|"approved";

export default function RewardsPage(){
  const [loading,setLoading]=useState(true);

  // Family context
  const [familyId,setFamilyId]=useState<string|null>(null);
  const [children,setChildren]=useState<Child[]>([]);
  const [currentChild,setCurrentChild]=useState<string|null>(null);

  // Data
  const [rewards,setRewards]=useState<Reward[]>([]);
  const [ledger,setLedger]=useState<Ledger[]>([]);
  const [completed,setCompleted]=useState<CompletedRow[]>([]);

  // per-child preview ledger (future-use)
  const [childLedgerPreview,setChildLedgerPreview]=useState<Array<{delta:number;created_at:string;reason:string|null;evidence_count:number}>>([]);

  // Offer status locks
  const [offerStatusByTarget,setOfferStatusByTarget]=useState<Record<string,OfferStatusRow>>({});

  // Create Reward form (DB presets)
  const [form,setForm]=useState<Partial<Reward>>({
    is_active:true,
    points_cost:50
  });
  const [presets,setPresets]=useState<Preset[]>([]);
  const [selectedPresetId,setSelectedPresetId]=useState<string>("");

  // Detail drawer
  const [showDetail,setShowDetail]=useState(false);
  const [detailLoading,setDetailLoading]=useState(false);
  const [detail,setDetail]=useState<CompletionDetail|null>(null);
  const [detailTitle,setDetailTitle]=useState<string>("");

  // UI state
  const [bonusBusy,setBonusBusy]=useState<string|null>(null);

  // Offer UI state
  const [offerBusy,setOfferBusy]=useState<string|null>(null);
  const [offerMap,setOfferMap]=useState<Record<string,{
    rewardId:string|null;
    customTitle:string;
    customDesc:string;
    message:string;
    costOverride?:number|"";
  }>>({});

  // Inline overlays
  const [timelineOpen,setTimelineOpen]=useState(false); // rewards catalog timeline
  const [guideOpen,setGuideOpen]=useState(false);
  const [completedTimelineOpen,setCompletedTimelineOpen]=useState(false); // completed targets timeline

  // Completed targets filter
  const [completedFilter,setCompletedFilter]=useState<CompletedFilter>("all");

  // Realtime channel
  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);

  // Tiny delight
  function beep(f=880,ms=120){
    try{
      const ctx=new (window.AudioContext||(window as any).webkitAudioContext)();
      const o=ctx.createOscillator();
      const g=ctx.createGain();
      o.type="sine";
      o.frequency.value=f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001,ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2,ctx.currentTime+0.01);
      o.start();
      setTimeout(()=>{
        g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.01);
        o.stop();
        ctx.close();
      },ms);
      if("vibrate"in navigator) navigator.vibrate(40);
    }catch{}
  }

  /** Bootstrap: family -> children -> balances/rewards/presets */
  useEffect(()=>{
    (async()=>{
      try{
        setLoading(true);

        const me=(await supabase.auth.getUser()).data.user!;
        const {data:p,error:pErr}=await supabase
          .from("parent_profiles")
          .select("family_id")
          .eq("parent_uid",me.id)
          .maybeSingle();

        if(pErr) throw pErr;
        if(!p?.family_id){
          setLoading(false);
          return;
        }

        const fam=p.family_id as string;
        setFamilyId(fam);

        const {data:kids,error:kErr}=await supabase
          .from("child_profiles")
          .select("child_uid,first_name,last_name,age")
          .eq("family_id",fam)
          .order("created_at",{ascending:false});

        if(kErr) throw kErr;
        const list=(kids||[])as Child[];
        setChildren(list);

        const chosen=list[0]?.child_uid??null;
        setCurrentChild(chosen);

        await Promise.all([refreshRewards(fam),refreshLedgerFamily(fam),refreshPresets(fam)]);

        if(chosen){
          await refreshCompleted(chosen);
          await refreshParentOffersForChild(chosen);
          try{
            const rows=await fetchChildLedgerPreview(chosen);
            setChildLedgerPreview(rows);
          }catch{}
        }
      }catch(e){
        console.error("[Parent/Rewards] bootstrap failed:",e);
      }finally{
        setLoading(false);
      }
    })();

    return()=>{
      try{ channelRef.current?.unsubscribe(); }catch{}
      channelRef.current=null;
    };
  },[]);

  /** reacts when a different child is picked */
  useEffect(()=>{
    if(!currentChild) return;
    (async()=>{
      await refreshCompleted(currentChild);
      await refreshParentOffersForChild(currentChild);
      try{
        const rows=await fetchChildLedgerPreview(currentChild);
        setChildLedgerPreview(rows);
      }catch{}
    })();
  },[currentChild]);

  /** Realtime heads-up */
  useEffect(()=>{
    if(!familyId) return;

    try{ channelRef.current?.unsubscribe(); }catch{}
    channelRef.current=null;

    const ch=supabase.channel(`parent-rewards:${familyId}`);

    const softRefresh=async()=>{
      try{
        await refreshLedgerFamily(familyId);
        if(currentChild){
          await refreshCompleted(currentChild);
          await refreshParentOffersForChild(currentChild);
          try{
            const rows=await fetchChildLedgerPreview(currentChild);
            setChildLedgerPreview(rows);
          }catch{}
        }
      }catch{}
    };

    ch.on(
      "postgres_changes",
      {event:"INSERT",schema:"public",table:"points_ledger",filter:`family_id=eq.${familyId}`},
      (payload:any)=>{
        const pts=Number(payload?.new?.delta??payload?.new?.points??0);
        const reason=payload?.new?.reason||"Points update";
        toast.success(`+${pts} pts`,{description:reason});
        beep(1040,120);
        void softRefresh();
      }
    );

    ch.on(
      "postgres_changes",
      {event:"*",schema:"public",table:"reward_redemptions",filter:`family_id=eq.${familyId}`},
      (payload:any)=>{
        const now=payload?.new;
        const prev=payload?.old;
        if(now&&prev&&now.status!==prev.status&&now.status==="Approved"){
          toast.success("🎉 A redemption was approved!",{description:"Reward on the way."});
          beep(1240,140);
        }
        void softRefresh();
      }
    );

    ch.subscribe();
    channelRef.current=ch;

    return()=>{
      try{ channelRef.current?.unsubscribe(); }catch{}
      channelRef.current=null;
    };
  },[familyId,currentChild]);

  /** Data loaders */
  async function refreshRewards(fam:string){
    const {data,error}=await supabase
      .from("rewards_catalog")
      .select("*")
      .eq("family_id",fam)
      .order("created_at",{ascending:false});

    if(error){
      console.error("[refreshRewards] error:",error);
      return;
    }
    setRewards((data||[])as Reward[]);
  }

  async function refreshLedgerFamily(fam:string){
    const {data,error}=await supabase
      .from("child_points_ledger")
      .select("id,child_uid,points,reason,created_at")
      .eq("family_id",fam)
      .order("created_at",{ascending:false});

    if(error){
      console.error("[refreshLedgerFamily] error:",error);
      return;
    }
    setLedger((data||[])as Ledger[]);
  }

  async function refreshCompleted(childUid:string){
    const {data,error}=await supabase.rpc("api_child_completed_min",{p_child_uid:childUid});
    if(error){
      console.error("[refreshCompleted] RPC error:",error);
      setCompleted([]);
      return;
    }
    setCompleted(((data||[])as CompletedRow[]).sort((a,b)=>{
      const ad=a.completed_at||a.target_created;
      const bd=b.completed_at||b.target_created;
      return ad>bd?-1:ad<bd?1:0;
    }));
  }

  async function refreshParentOffersForChild(childUid:string){
    try{
      const me=(await supabase.auth.getUser()).data.user!;
      const {data,error}=await supabase.rpc("api_parent_offers_for_child",{
        p_parent_uid:me.id,
        p_child_uid:childUid
      });
      if(error){
        console.error("[refreshParentOffersForChild] RPC error:",error);
        setOfferStatusByTarget({});
        return;
      }
      const rows=(data||[])as OfferStatusRow[];
      const map:Record<string,OfferStatusRow>={};
      rows.forEach((r)=> (map[r.target_id]=r));
      setOfferStatusByTarget(map);
    }catch(e){
      console.error("[refreshParentOffersForChild] failed:",e);
      setOfferStatusByTarget({});
    }
  }

  async function refreshPresets(fam:string){
    const {data,error}=await supabase
      .from("reward_presets")
      .select("id,family_id,title,description,points_cost,is_active,created_at")
      .or(`family_id.is.null,family_id.eq.${fam}`)
      .eq("is_active",true)
      .order("created_at",{ascending:true});

    if(error){
      console.error("[refreshPresets]",error);
      setPresets([]);
      return;
    }
    setPresets((data||[])as Preset[]);
  }

  /** Presets not yet used in rewards_catalog */
  const availablePresets=useMemo(()=>{
    const usedTitles=new Set(rewards.map((r)=>(r.title||"").trim().toLowerCase()));
    return presets.filter((p)=>!usedTitles.has((p.title||"").trim().toLowerCase()));
  },[presets,rewards]);

  /** Sorted rewards for timeline overlay */
  const sortedRewards=useMemo(()=>{
    const arr=[...rewards];
    arr.sort((a,b)=>{
      const ak=a.created_at||"";
      const bk=b.created_at||"";
      return new Date(bk).getTime()-new Date(ak).getTime();
    });
    return arr;
  },[rewards]);

  /** ------- Add Reward (DB presets + custom) ------- */
  function onPresetChange(id:string){
    setSelectedPresetId(id);
    if(!id){
      setForm({is_active:true,points_cost:50,title:"",description:""});
      return;
    }
    const p=availablePresets.find((x)=>x.id===id);
    if(p){
      setForm({
        is_active:true,
        title:p.title,
        description:p.description||"",
        points_cost:p.points_cost??50
      });
    }
  }

  async function addReward(){
    if(!familyId) return toast.error("Family not resolved yet.");
    if(!form.title) return toast.error("Title required");

    await tpromise(
      async()=>{
        const {error}=await supabase.from("rewards_catalog").insert({
          family_id:familyId,
          title:form.title,
          description:form.description??null,
          points_cost:form.points_cost??50,
          is_active:form.is_active??true
        }as any);
        if(error) throw error;

        setSelectedPresetId("");
        setForm({is_active:true,points_cost:50,title:"",description:""});
        await Promise.all([refreshRewards(familyId),refreshPresets(familyId)]);
      },
      {
        loading:"Adding reward…",
        success:"Reward added ✅",
        error:"Could not add reward"
      }
    );
  }

  /** Bonus points */
  async function giveBonus(childUid:string,points=5,reason="Great effort!"){
    await tpromise(
      async()=>{
        try{
          setBonusBusy(childUid);
          const me=(await supabase.auth.getUser()).data.user!;
          const {error}=await supabase.rpc("api_parent_add_bonus",{
            p_parent_uid:me.id,
            p_child_uid:childUid,
            p_points:points,
            p_reason:reason
          });
          if(error) throw error;

          if(familyId) await refreshLedgerFamily(familyId);
        }finally{
          setBonusBusy(null);
        }
      },
      {
        loading:"Adding bonus…",
        success:"✨ Bonus points added!",
        error:"Could not add bonus points."
      }
    );
  }

  /** Offer UI helpers */
  function setOffer(
    rowId:string,
    patch:Partial<{
      rewardId:string|null;
      customTitle:string;
      customDesc:string;
      message:string;
      costOverride?:number|"";
    }>
  ){
    setOfferMap((m)=>({
      ...m,
      [rowId]:{
        rewardId:null,
        customTitle:"",
        customDesc:"",
        message:"",
        costOverride:"",
        ...(m[rowId]||{}),
        ...patch
      }
    }));
  }

  async function offerRewardForTarget(row:CompletedRow){
    if(!row?.child_uid||!row?.id) return;
    const me=(await supabase.auth.getUser()).data.user!;
    const cfg=offerMap[row.id]||{rewardId:null,customTitle:"",customDesc:"",message:"",costOverride:""};

    await tpromise(async()=>{
      try{
        setOfferBusy(row.id);
        const {error}=await supabase.rpc("api_parent_offer_reward_for_target",{
          p_parent_uid:me.id,
          p_child_uid:row.child_uid,
          p_target_id:row.id,
          p_reward_id:cfg.rewardId||null,
          p_message:cfg.message||null,
          p_custom_title:cfg.customTitle||null,
          p_custom_description:cfg.customDesc||null,
          p_points_cost_override:cfg.costOverride===""?null:Number(cfg.costOverride)
        });

        if(error){
          const code=(error as any)?.code||(error as any)?.status||(error as any)?.details;
          if(String(code)==="409"){
            toast.info("An active offer already exists for this target.");
            await refreshParentOffersForChild(row.child_uid);
            return;
          }
          throw error;
        }

        await refreshParentOffersForChild(row.child_uid);
        toast.success("🎁 Offer sent!");
      }finally{
        setOfferBusy(null);
      }
    },{loading:"Sending offer…",success:"",error:"Could not send reward offer."});
  }

  /** Detail drawer */
  async function openDetail(row:CompletedRow){
    if(!row?.id||!row?.child_uid) return;
    setDetail(null);
    setDetailTitle(row.title||"Completed Mission");
    setShowDetail(true);
    setDetailLoading(true);
    try{
      const {data,error}=await supabase.rpc("api_child_completion_detail",{
        p_child_uid:row.child_uid,
        p_target_id:row.id
      });
      if(error) throw error;
      const payload=Array.isArray(data)?data[0]:data;
      setDetail(payload as CompletionDetail);
    }catch(e:any){
      console.error("[detail] error:",e);
      setDetail({
        target_id:row.id,
        completed_at:row.completed_at,
        points_award:row.points_award??row.points??0,
        completion_type:row.completion_type??"completed",
        note:"Could not load extra details.",
        events:[],
        evidence:[]
      });
    }finally{
      setDetailLoading(false);
    }
  }

  const badge=(t:CompletedRow)=>{
    if(t.completion_type==="quick_complete"){
      return{label:"Quick Complete",cls:"bg-green-500/20 text-green-300",icon:"⚡"};
    }
    if((t.evidence_count||0)>0){
      return{label:"With Evidence",cls:"bg-purple-500/20 text-purple-300",icon:"📸"};
    }
    return{label:"Completed",cls:"bg-blue-500/20 text-blue-300",icon:"✅"};
  };

  const rewardStatusBadge=(active:boolean)=>{
    return active
      ?"bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
      :"bg-slate-500/20 border-slate-400/40 text-slate-200";
  };

  // derive offer bucket for filtering completed targets
  function bucketForCompleted(t:CompletedRow):"no_offer"|"pending"|"approved"{
    const os=offerStatusByTarget[t.id];
    if(!os) return"no_offer";
    if(os.status==="Offered") return"pending";
    if(os.status==="Accepted"||os.status==="Fulfilled") return"approved";
    // Rejected / Expired fold back into "no_offer" so they can be re-offered
    return"no_offer";
  }

  if(loading){
    return(
      <div className="max-w-6xl">
        <div className="glass rounded-2xl p-4">Loading…</div>
      </div>
    );
  }

  return(
    <div className="max-w-6xl min-w-0">
      <DarkSelectStyle/>

      {/* Header + existing inline overlay buttons */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-3xl font-bold break-words">Rewards &amp; Points</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={()=>setTimelineOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-sm"
          >
            <Clock className="w-4 h-4"/>
            Open inline rewards timeline
          </button>
          <button
            type="button"
            onClick={()=>setGuideOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 border border-emerald-500/60 text-white text-sm"
          >
            <BookOpen className="w-4 h-4"/>
            Guide, instructions &amp; process
          </button>
        </div>
      </div>

      {/* Top: create reward */}
      <section className="glass rounded-2xl p-4 mb-6 text-sm sm:text-base">
        <div className="font-semibold mb-2">Add Reward</div>

        <div className="grid md:grid-cols-4 gap-3 mb-3">
          <select
            className={selectCls}
            value={selectedPresetId}
            onChange={(e)=>onPresetChange(e.target.value)}
            title="Pick a preset or choose Custom"
          >
            <option value="">(Custom)</option>
            {availablePresets.map((p)=>(
              <option key={p.id}value={p.id}>
                {p.title} — {p.points_cost} pts
              </option>
            ))}
          </select>

          <input
            className={`${inputCls} md:col-span-2 w-full`}
            placeholder="Title"
            value={form.title||""}
            onChange={(e)=>setForm((f)=>({...f,title:e.target.value}))}
          />
          <input
            className={inputCls}
            type="number"
            min={0}
            placeholder="Points cost"
            value={form.points_cost??50}
            onChange={(e)=>setForm((f)=>({...f,points_cost:parseInt(e.target.value||"50")}))}
          />
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <textarea
            className={`${inputCls} md:col-span-3 w-full`}
            placeholder="Description"
            rows={2}
            value={form.description||""}
            onChange={(e)=>setForm((f)=>({...f,description:e.target.value}))}
          />
          <div className="flex items-end">
            <button
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto border border-emerald-500/40"
              onClick={addReward}
              disabled={!familyId}
            >
              Add
            </button>
          </div>
        </div>
      </section>

      {/* Two columns */}
      <section className="grid md:grid-cols-2 gap-4">
        {/* LEFT: Catalog + Balances */}
        <div className="grid gap-4 min-w-0">
          <div className="glass rounded-2xl p-4 min-w-0">
            <div className="font-semibold mb-2">Catalog</div>
            <div className="grid gap-2">
              {rewards.map((r)=>(
                <div key={r.id}className="rounded bg-white/5 p-3">
                  <div className="flex gap-2 items-center flex-wrap">
                    <div className="font-semibold break-words">{r.title}</div>
                    <div className="text-xs text-white/60">{r.points_cost} pts</div>
                    <span className={`ml-auto px-2 py-0.5 rounded text-[11px] border ${rewardStatusBadge(r.is_active)}`}>
                      {r.is_active?"Active":"Inactive"}
                    </span>
                  </div>
                  {r.description&&(
                    <div className="text-white/80 text-sm break-words mt-1">{r.description}</div>
                  )}
                </div>
              ))}
              {rewards.length===0&&<div className="text-white/70">No rewards yet.</div>}
            </div>
          </div>

          <div className="glass rounded-2xl p-4 min-w-0">
            <div className="font-semibold mb-2">Balances</div>
            <div className="grid gap-2">
              {children.map((c)=>{
                const pts=new Map<string,number>(
                  ledger.map((l)=>[l.child_uid,0])
                );
                ledger.forEach((l)=>pts.set(l.child_uid,(pts.get(l.child_uid)||0)+l.points));
                const total=pts.get(c.child_uid)||0;
                return(
                  <div
                    key={c.child_uid}
                    className="rounded bg-white/5 p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="font-semibold break-words">
                      {c.first_name}
                      {c.last_name?` ${c.last_name}`:""}{" "}
                      {typeof c.age==="number"?`(age ${c.age})`:""}
                    </div>
                    <div className="sm:ml-auto font-semibold">{total} pts</div>
                    <button
                      className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-sm w-full sm:w-auto"
                      onClick={()=>giveBonus(c.child_uid,5,"Cheer bonus – keep it up!")}
                      disabled={bonusBusy===c.child_uid}
                      title="Give a small encouragement bonus"
                    >
                      {bonusBusy===c.child_uid?"Adding…":"✨ Bonus +5"}
                    </button>
                  </div>
                );
              })}
              {children.length===0&&<div className="text-white/70">No children found.</div>}
            </div>
          </div>
        </div>

        {/* RIGHT: Completed targets viewer */}
        <div className="glass rounded-2xl p-4 min-w-0">
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="font-semibold">Completed Targets</div>
              {completed.length>0&&(
                <button
                  type="button"
                  onClick={()=>setCompletedTimelineOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs sm:text-sm"
                >
                  <Clock className="w-4 h-4"/>
                  Open inline timeline preview and take action
                </button>
              )}
              <div className="sm:ml-auto w-full sm:w-auto">
                <select
                  className={selectCls}
                  value={currentChild||""}
                  onChange={(e)=>setCurrentChild(e.target.value||null)}
                >
                  {children.length===0?(
                    <option value="">No children</option>
                  ):(
                    children.map((c)=>(
                      <option key={c.child_uid}value={c.child_uid}>
                        {c.first_name}{c.last_name?` ${c.last_name}`:""}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {completed.length>0&&(
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  {key:"all",label:"All"},
                  {key:"no_offer",label:"No reward yet"},
                  {key:"pending",label:"Pending"},
                  {key:"approved",label:"Approved"}
                ].map((b)=>(
                  <button
                    key={b.key}
                    onClick={()=>setCompletedFilter(b.key as CompletedFilter)}
                    className={`px-3 py-1 rounded-full border transition-all ${
                      completedFilter===b.key
                        ?"bg-white text-slate-900 border-white"
                        :"bg-white/5 text-white/70 border-white/20 hover:bg-white/10"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {(!currentChild||completed.length===0)&&(
            <div className="text-white/70">
              {currentChild?"No completed targets yet.":"Choose a child to view their completed targets."}
            </div>
          )}

          <div className="grid gap-3">
            {completed.map((t)=>{
              const b=badge(t);
              const cfg=offerMap[t.id]||{
                rewardId:null,
                customTitle:"",
                customDesc:"",
                message:"",
                costOverride:""
              };
              const os=offerStatusByTarget[t.id];
              const bucket=bucketForCompleted(t);
              const isLocked=!!os&&os.status!=="Rejected";

              if(completedFilter==="no_offer"&&bucket!=="no_offer") return null;
              if(completedFilter==="pending"&&bucket!=="pending") return null;
              if(completedFilter==="approved"&&bucket!=="approved") return null;

              let offerLabel="";
              if(os){
                if(os.status==="Offered") offerLabel="Offer sent – waiting for child";
                else if(os.status==="Accepted") offerLabel="Child accepted – reward pending";
                else if(os.status==="Fulfilled") offerLabel="Reward fulfilled";
                else if(os.status==="Rejected") offerLabel="Offer rejected";
                else if(os.status==="Expired") offerLabel="Offer expired";
              }

              return(
                <div key={t.id}className="rounded-xl p-4 bg-white/5 border border-white/10 min-w-0">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl shrink-0">🏅</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold break-words">{t.title}</div>
                        <span className={`px-2 py-0.5 rounded text-xs ${b.cls}`}>
                          {b.icon} {b.label}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300">
                          +{t.points||t.points_award||0} pts
                        </span>
                        {os&&(
                          <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-300 ml-2">
                            {offerLabel||`Offer status: ${os.status}`}
                          </span>
                        )}
                      </div>

                      {t.description&&(
                        <div className="text-white/80 text-sm mt-1 line-clamp-2 break-words">
                          {t.description}
                        </div>
                      )}
                      <div className="text-xs text-white/60 mt-1 flex flex-wrap gap-x-2">
                        <span>{t.category||"General"}</span>
                        <span>· {t.difficulty||"Easy"}</span>
                        <span>
                          ·{" "}
                          {t.completed_at
                            ?new Date(t.completed_at).toLocaleString()
                            :new Date(t.target_created).toLocaleString()}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <button
                          className={buttonGhost}
                          onClick={()=>{
                            setCompletedTimelineOpen(false);
                            openDetail(t);
                          }}
                        >
                          View details
                        </button>
                        <button
                          className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-sm w-full sm:w-auto border border-emerald-500/40"
                          onClick={()=>{
                            if(currentChild) giveBonus(currentChild,5,`High-five for "${t.title}"`);
                          }}
                        >
                          ✨ Encourage (+5)
                        </button>
                      </div>

                      {!isLocked&&(
                        <div className="mt-3 grid gap-2">
                          <div className="grid md:grid-cols-3 gap-2">
                            <select
                              className={selectCls}
                              value={cfg.rewardId??""}
                              onChange={(e)=>setOffer(t.id,{rewardId:e.target.value||null})}
                            >
                              <option value="">(Custom reward)</option>
                              {rewards.map((r)=>(
                                <option key={r.id}value={r.id}>
                                  {r.title} — {r.points_cost} pts
                                </option>
                              ))}
                            </select>

                            <input
                              className={inputCls}
                              placeholder="Custom title (optional)"
                              value={cfg.customTitle??""}
                              onChange={(e)=>setOffer(t.id,{customTitle:e.target.value})}
                              disabled={!!cfg.rewardId}
                              title="Disabled when a catalog reward is selected"
                            />

                            <input
                              className={inputCls}
                              type="number"
                              min={0}
                              placeholder="Cost override (optional)"
                              value={cfg.costOverride??""}
                              onChange={(e)=>setOffer(t.id,{
                                costOverride:e.target.value===""?"":Number(e.target.value)
                              })}
                            />
                          </div>

                          <input
                            className={inputCls}
                            placeholder='Message to child (e.g., “Because you rocked math 📚”)'
                            value={cfg.message??""}
                            onChange={(e)=>setOffer(t.id,{message:e.target.value})}
                          />

                          <div className="flex gap-2">
                            <button
                              className="px-3 py-2 rounded bg-fuchsia-600 hover:bg-fuchsia-700 text-sm w-full sm:w-auto border border-fuchsia-500/40"
                              onClick={()=>offerRewardForTarget(t)}
                              disabled={offerBusy===t.id}
                            >
                              {offerBusy===t.id?"Sending…":"🎁 Offer this reward"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Inline rewards timeline overlay (catalog) */}
      {timelineOpen&&(
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-white/15 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <Gift className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">Rewards timeline preview</h2>
                  <p className="text-xs text-white/60">
                    Focused, scrollable view of the current rewards catalog.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={()=>setTimelineOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 max-h-[72vh] overflow-y-auto">
              {sortedRewards.length===0?(
                <div className="text-center text-white/60 text-sm py-6">
                  No rewards configured yet. Add a few on the main panel first.
                </div>
              ):(
                <div className="relative pl-4">
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10"/>
                  <div className="space-y-4">
                    {sortedRewards.map((r)=>(
                      <div key={r.id}className="relative pl-4">
                        <div className="absolute left-[-6px] top-2 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]"/>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">
                                {r.title}
                              </div>
                              <div className="text-xs text-white/60 mt-1 flex flex-wrap gap-2">
                                <span>{r.points_cost} pts</span>
                                {r.created_at&&(
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3"/>
                                    {new Date(r.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] border ${rewardStatusBadge(r.is_active)}`}>
                              {r.is_active?"Active":"Inactive"}
                            </span>
                          </div>
                          {r.description&&(
                            <div className="mt-2 text-xs text-white/70 break-words">
                              {r.description}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Completed targets timeline overlay (with actions) */}
      {completedTimelineOpen&&(
        <div className="fixed inset-0 z-[92] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-white/15 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <Clock className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Completed targets – inline timeline &amp; actions
                  </h2>
                  <p className="text-xs text-white/60">
                    Quickly scan completed missions by status (No reward, Pending, Approved) and take action.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={()=>setCompletedTimelineOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 max-h-[72vh] overflow-y-auto">
              {completed.length>0&&(
                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                  {[
                    {key:"all",label:"All"},
                    {key:"no_offer",label:"No reward yet"},
                    {key:"pending",label:"Pending"},
                    {key:"approved",label:"Approved"}
                  ].map((b)=>(
                    <button
                      key={b.key}
                      onClick={()=>setCompletedFilter(b.key as CompletedFilter)}
                      className={`px-3 py-1 rounded-full border transition-all ${
                        completedFilter===b.key
                          ?"bg-white text-slate-900 border-white"
                          :"bg-white/5 text-white/70 border-white/20 hover:bg-white/10"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}

              {completed.length===0?(
                <div className="text-center text-white/60 text-sm py-6">
                  No completed targets yet for this child.
                </div>
              ):(
                <div className="relative pl-4">
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10"/>
                  <div className="space-y-3">
                    {completed.map((t)=>{
                      const os=offerStatusByTarget[t.id];
                      const bucket=bucketForCompleted(t);

                      if(completedFilter==="no_offer"&&bucket!=="no_offer") return null;
                      if(completedFilter==="pending"&&bucket!=="pending") return null;
                      if(completedFilter==="approved"&&bucket!=="approved") return null;

                      let offerLabel="";
                      if(os){
                        if(os.status==="Offered") offerLabel="Offer sent – waiting for child";
                        else if(os.status==="Accepted") offerLabel="Child accepted – reward pending";
                        else if(os.status==="Fulfilled") offerLabel="Reward fulfilled";
                        else if(os.status==="Rejected") offerLabel="Offer rejected";
                        else if(os.status==="Expired") offerLabel="Offer expired";
                      }

                      return(
                        <div key={t.id}className="relative pl-4">
                          <div className="absolute left-[-6px] top-3 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]"/>
                          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold text-white break-words">
                                  {t.title}
                                </div>
                                <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/20 text-emerald-300">
                                  +{t.points||t.points_award||0} pts
                                </span>
                                {os&&(
                                  <span className="px-2 py-0.5 rounded text-[11px] bg-yellow-500/20 text-yellow-300">
                                    {offerLabel||`Offer status: ${os.status}`}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-white/60 flex flex-wrap gap-2">
                                <span>{t.category||"General"}</span>
                                <span>· {t.difficulty||"Easy"}</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3"/>
                                  {t.completed_at
                                    ?new Date(t.completed_at).toLocaleString()
                                    :new Date(t.target_created).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-2">
                                <button
                                  className={buttonGhost+" text-xs"}
                                  onClick={()=>{
                                    setCompletedTimelineOpen(false);
                                    openDetail(t);
                                  }}
                                >
                                  View details
                                </button>
                                <button
                                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-xs border border-emerald-500/40"
                                  onClick={()=>{
                                    if(currentChild) giveBonus(currentChild,5,`High-five for "${t.title}"`);
                                  }}
                                >
                                  ✨ Encourage (+5)
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guide / instructions overlay */}
      {guideOpen&&(
        <div className="fixed inset-0 z-[91] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <BookOpen className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Rewards guide, instructions &amp; process
                  </h2>
                  <p className="text-xs text-white/60">
                    How points, rewards, offers and redemptions work together for your family.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={()=>setGuideOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto text-sm text-white/80">
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">1. Build your rewards catalog</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Use <span className="font-semibold">Add Reward</span> to define items children can redeem with points.</li>
                  <li>Each reward has a title, optional description, and a points cost.</li>
                  <li>You can start from presets (global or family-specific) or create completely custom rewards.</li>
                  <li>Inactive rewards stay in history but don’t show up as active catalog choices in future flows.</li>
                </ol>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. How points are earned</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Children earn points by completing targets, checklists and daily activities.</li>
                  <li>Approvals are written into the <span className="font-mono text-xs">child_points_ledger</span> table.</li>
                  <li>Bonus points (e.g., “✨ Encourage (+5)”) also flow through the same ledger with friendly reasons.</li>
                </ul>
                <p className="text-white/70">
                  The balances panel on the left is a simple aggregation of that ledger per child.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. Reward offers for completed targets</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>When a target is completed, you see it under <span className="font-semibold">Completed Targets</span>.</li>
                  <li>From there, you can send a reward offer linked to that specific achievement.</li>
                  <li>Select a catalog reward or define a custom one with its own cost and message.</li>
                  <li>Once an offer exists, the UI locks until it’s resolved (Accepted / Rejected / Fulfilled / Expired).</li>
                </ul>
                <p className="text-white/70">
                  This is powered by <span className="font-mono text-xs">api_parent_offer_reward_for_target</span> and related tables
                  so each offer is auditable over time.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. Redemptions &amp; wallet behaviour</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Accepted offers and direct redemptions are recorded in <span className="font-mono text-xs">reward_redemptions</span>.</li>
                  <li>When a redemption is approved, points move out of the child’s available balance as a negative entry.</li>
                  <li>Realtime channels watch these tables and refresh balances, so parents get instant feedback.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">5. Using the inline timeline preview</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>The <span className="font-semibold">inline timeline</span> buttons give focused, scrollable views of your rewards and completed targets.</li>
                  <li>Use the status chips (No reward yet, Pending, Approved) to cut through long lists.</li>
                  <li>From the completed timeline, you can immediately open details and send encouragement without losing your place.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">6. Design intent</h3>
                <p className="text-white/80">
                  Everything here is designed so you can review effort, tune the catalog, and reward your child without page hops or reloads — just inline panels and quick actions.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {showDetail&&(
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end md:items-center md:justify-center p-4">
          <div className="w-full md:max-w-3xl md:rounded-2xl bg-gradient-to-br from-indigo-900 to-purple-900 border border-white/15 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-2xl shrink-0">🧾</div>
                <div className="font-bold text-xl flex-1 break-words">{detailTitle}</div>
              </div>
              <button className={buttonGhost}onClick={()=>setShowDetail(false)}>
                ✕ Close
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-auto">
              {detailLoading&&<div className="text-white/70">Loading…</div>}

              {!detailLoading&&detail&&(
                <div className="grid gap-4">
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="text-white/80 text-sm flex flex-wrap gap-x-2">
                      <span>
                        Completion:{" "}
                        <b className="text-emerald-300">{detail.completion_type||"completed"}</b>
                      </span>
                      <span>
                        • Points:{" "}
                        <b className="text-emerald-300">{detail.points_award??0}</b>
                      </span>
                      <span>
                        • When:{" "}
                        <b className="text-white/90">
                          {detail.completed_at?new Date(detail.completed_at).toLocaleString():"—"}
                        </b>
                      </span>
                    </div>
                    {detail.note&&(
                      <div className="text-white/70 mt-1 break-words">{detail.note}</div>
                    )}
                  </div>

                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="font-semibold mb-2">Evidence</div>
                    {(!detail.evidence||detail.evidence.length===0)&&(
                      <div className="text-white/70">No evidence submitted (Quick Complete).</div>
                    )}
                    <div className="grid gap-3">
                      {detail.evidence?.map((ev)=>(
                        <div key={ev.id}className="rounded bg-white/5 border border-white/10 p-3">
                          <div className="text-sm text-white/80 mb-1 flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-white/10">
                              {iconFor(ev.type)} {ev.type}
                            </span>
                            {(ev as any)?.created_at&&(
                              <span className="text-white/50">
                                {new Date((ev as any).created_at).toLocaleString()}
                              </span>
                            )}
                          </div>

                          {renderEvidence(ev)}
                          {ev.description&&(
                            <div className="text-white/70 text-sm mt-2 break-words">{ev.description}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {detail.events&&detail.events.length>0&&(
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="font-semibold mb-2">Activity Log</div>
                      <div className="grid gap-2 text-sm">
                        {detail.events.map((e)=>(
                          <div key={e.id}className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="text-white/60">{e.type||"event"}</div>
                            <div className="hidden sm:block text-white/40">•</div>
                            <div className="text-white/80 flex-1 break-words">{e.description||"—"}</div>
                            <div className="text-white/50">{new Date(e.created_at).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-white/60 text-sm">
                    Tip: use “✨ Encourage (+5)” to nudge motivation after a great effort.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ------ Small helpers ------ */
function iconFor(t:string){
  switch(t){
    case "photo": return"🖼️";
    case "video": return"📹";
    case "audio": return"🎤";
    case "text": return"📝";
    case "checklist": return"✅";
    default: return"📎";
  }
}

function renderEvidence(ev:{type:string;data:any}){
  if(ev.type==="text"&&typeof ev.data==="string"){
    return <div className="text-white/80 whitespace-pre-wrap break-words">{ev.data}</div>;
  }
  if(ev.type==="checklist"&&Array.isArray(ev.data)){
    return(
      <ul className="list-disc ml-5 text-white/80">
        {ev.data.map((line:string,i:number)=>(
          <li key={i}className="break-words">{line}</li>
        ))}
      </ul>
    );
  }
  if(typeof ev.data==="string"){
    const lower=ev.data.toLowerCase();
    if(ev.type==="photo"&&(lower.startsWith("http")||lower.startsWith("blob:"))){
      return <img src={ev.data}alt="evidence"className="max-h-56 rounded-lg border border-white/10"/>;
    }
    if(ev.type==="video"&&(lower.startsWith("http")||lower.startsWith("blob:"))){
      return <video src={ev.data}controls className="w-full max-h-56 rounded-lg border border-white/10"/>;
    }
    if(ev.type==="audio"&&(lower.startsWith("http")||lower.startsWith("blob:"))){
      return <audio src={ev.data}controls className="w-full"/>;
    }
    return <div className="text-white/80 break-all">{ev.data}</div>;
  }
  return(
    <pre className="text-white/70 text-xs bg-black/30 p-2 rounded overflow-x-auto">
      {JSON.stringify(ev.data,null,2)}
    </pre>
  );
}
