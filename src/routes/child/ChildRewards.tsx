// src/routes/child/ChildRewards.tsx
import {useEffect,useMemo,useRef,useState}from "react";
import {useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {Gift,ShoppingCart,Activity,Zap}from "lucide-react";
import {toast}from "sonner";
import {tpromise}from "@/utils/toastx";

import {fetchReservedOffers}from "@/data/wallet";
import {fetchChildBrief}from "@/utils/childAuth";
import {fetchChildWallet,type ChildWallet}from "@/data/wallet";

/** ---------- Types ---------- */
type Reward={
  id:string;
  title:string;
  description:string|null;
  points_cost:number;
  is_active?:boolean;
  created_at?:string;
};

type Ledger={
  id:number|string;
  child_uid:string;
  points:number;
  reason:string|null;
  created_at:string;
};

type Redemption={
  id:string;
  reward_id:string|null;
  offer_id?:string|null;
  reward_title:string|null;
  points_cost?:number|null;
  status:"Pending"|"Approved"|"Rejected"|"Fulfilled";
  created_at:string;
  reviewed_at?:string|null;
  notes?:string|null;
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

type ChildMini={
  id:string;
  child_uid:string;
  family_id:string|null;
  name?:string|null;
  nick_name?:string|null;
};

const FALLBACK_FAMILY_ID="e21c48a8-5d80-4651-8d31-11923353a10c";

/* ---------------- helpers ---------------- */
const DEBUG=typeof window!=="undefined"&&new URLSearchParams(window.location.search).has("debug");
const UUID_RE=/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function takeUuid(v:any):string|null{
  if(!v)return null;
  if(typeof v==="string"){
    try{
      if(v.trim().startsWith("{")){
        const o=JSON.parse(v);
        return takeUuid(o);
      }
    }catch{}
    const m=v.match(UUID_RE);
    return m?m[0]:null;
  }
  if(typeof v==="object"){
    return takeUuid((v as any).child_uid||(v as any).id||(v as any).uid||JSON.stringify(v));
  }
  return null;
}

function uniqUuids(arr:(string|null|undefined)[]):string[]{
  const out=new Set<string>();
  for(const x of arr){
    const u=takeUuid(x as any);
    if(u)out.add(u);
  }
  return Array.from(out);
}

function readAnyChildKeyFromStorage(){
  const cand:string[]=[];
  try{
    const a=sessionStorage.getItem("child_uid");
    if(a)cand.push(a);
  }catch{}
  try{
    const b=sessionStorage.getItem("child_id");
    if(b)cand.push(b);
  }catch{}
  try{
    const c=localStorage.getItem("child_portal_child_id");
    if(c)cand.push(c);
  }catch{}
  try{
    const raw=localStorage.getItem("LS_CHILD");
    if(raw){
      cand.push(raw);
    }
  }catch{}
  return takeUuid(cand.reverse().find(Boolean))||"";
}

/** Encourage = High-five / Cheer bonus (parent-side reward points) */
function isEncourageReason(reason:any){
  if(!reason)return false;
  const r=String(reason).toLowerCase().trim();
  return r.includes("high-five")||
    r.includes("high five")||
    r.includes("cheer bonus")||
    r.includes("encourage")||
    r.includes("parent bonus")||
    r.includes("bonus from parent")||
    r.includes("grown-up bonus");
}

/* ---------------- data fetchers ---------------- */
async function refreshCatalog(familyId:string|null):Promise<Reward[]>{
  if(familyId){
    try{
      const res=await supabase.rpc("api_child_rewards_catalog",{p_family_id:familyId});
      if(!res.error&&res.data)return res.data as Reward[];
    }catch{}
  }
  const q=await supabase
    .from("rewards_catalog")
    .select("id,title,description,points_cost,is_active,created_at")
    .or(familyId?`family_id.eq.${familyId},family_id.is.null`:"family_id.is.null")
    .eq("is_active",true)
    .order("created_at",{ascending:false});
  return(q.data||[])as Reward[];
}

/* ---------- ledger with multi-layer merge (RPC + child_points) ---------- */
async function refreshLedger(legacyChildUid:string,canonicalId:string):Promise<Ledger[]>{
  const ids=uniqUuids([legacyChildUid,canonicalId]);
  const rows:any[]=[];

  // 1) RPC (api_child_ledger) if present
  try{
    const res=await supabase.rpc("api_child_ledger",{p_child_uid:legacyChildUid});
    if(!res.error&&Array.isArray(res.data)&&res.data.length){
      rows.push(...res.data);
    }
  }catch{}

  // 2) child_points_ledger (canonical table)
  try{
    const q=await supabase
      .from("child_points_ledger")
      .select("id,child_uid,points,reason,created_at")
      .in("child_uid",ids)
      .order("created_at",{ascending:false});
    if(!q.error&&Array.isArray(q.data)&&q.data.length){
      rows.push(...q.data);
    }
  }catch(e){
    console.error("[refreshLedger child_points_ledger]",e);
  }

  // De-duplicate by a composite key
  const byKey=new Map<string,any>();
  for(const r of rows){
    const key=String(
      r.id||
      `${r.child_uid||""}-${r.created_at||""}-${r.reason||""}-${r.points??0}`
    );
    if(!byKey.has(key))byKey.set(key,r);
  }

  return Array.from(byKey.values()).map((r:any)=>({
    id:r.id,
    child_uid:r.child_uid,
    points:Number(r.points??0),
    reason:r.reason??null,
    created_at:r.created_at
  }));
}

/** Redemptions: prefer RPC, but fall back to raw tables if RPC is empty or misaligned. */
async function refreshRedemptions(legacyChildUid:string,canonicalId:string):Promise<Redemption[]>{
  try{
    const res=await supabase.rpc("api_child_redemptions",{p_child_uid:legacyChildUid});
    if(!res.error&&Array.isArray(res.data)&&res.data.length){
      return res.data as Redemption[];
    }
  }catch{}

  const ids=uniqUuids([legacyChildUid,canonicalId]);
  const q=await supabase
    .from("reward_redemptions")
    .select("id,reward_id,offer_id,status,created_at,reviewed_at,notes,child_uid,points_cost")
    .in("child_uid",ids)
    .order("created_at",{ascending:false});

  const rows=(q.data||[])as any[];

  const rewardIds=Array.from(new Set(rows.map((r)=>r.reward_id).filter(Boolean)));
  const offerIds=Array.from(new Set(rows.map((r)=>r.offer_id).filter(Boolean)));

  let rewardMeta:Record<string,{title:string;points_cost:number|null}>={};
  let offerMeta:Record<string,{title:string;points_cost:number|null}>={};

  if(rewardIds.length){
    const t=await supabase
      .from("rewards_catalog")
      .select("id,title,points_cost")
      .in("id",rewardIds);
    if(!t.error&&t.data){
      rewardMeta=Object.fromEntries(
        t.data.map((r:any)=>[r.id,{title:r.title,points_cost:r.points_cost??null}])
      );
    }
  }

  if(offerIds.length){
    const o=await supabase
      .from("reward_offers")
      .select("id,reward_id,custom_title,title,points_cost,points_cost_override,effective_points_cost")
      .in("id",offerIds);
    if(!o.error&&o.data){
      offerMeta=Object.fromEntries(
        o.data.map((r:any)=>{
          const title=r.custom_title||r.title||"Special Reward";
          const cost:(number|null)=(r.points_cost_override??null)??(r.effective_points_cost??null)??(r.points_cost??null);
          return[r.id,{title,points_cost:cost}];
        })
      );
    }
  }

  return rows.map((r)=>{
    const cat=r.reward_id?rewardMeta[r.reward_id]:undefined;
    const off=!r.reward_id&&r.offer_id?offerMeta[r.offer_id]:undefined;

    const title=
      (cat&&cat.title)||
      (off&&off.title)||
      "Special Reward";

    const cost:(number|null)=
      (typeof r.points_cost==="number"&&r.points_cost!=null?r.points_cost:null)||
      (cat&&cat.points_cost!=null?cat.points_cost:null)||
      (off&&off.points_cost!=null?off.points_cost:null)||
      null;

    return{
      id:r.id,
      reward_id:r.reward_id,
      offer_id:r.offer_id??null,
      reward_title:title,
      points_cost:cost,
      status:r.status,
      created_at:r.created_at,
      reviewed_at:r.reviewed_at??null,
      notes:r.notes??null
    }as Redemption;
  });
}

/* -------- reward offers (uses view with effective_points_cost) -------- */
async function refreshOffers(legacyChildUid:string,canonicalId:string,familyId?:string|null):Promise<Offer[]>{
  // Try newest RPC first, but only trust it if it returns non-empty data
  try{
    const {data,error}=await supabase.rpc("api_child_reward_offers_v2",{p_child_uid:legacyChildUid});
    if(!error&&Array.isArray(data)&&data.length)return data as Offer[];
  }catch{}
  // Try older RPC
  try{
    const {data,error}=await supabase.rpc("api_child_reward_offers",{p_child_uid:legacyChildUid});
    if(!error&&Array.isArray(data)&&data.length)return data as Offer[];
  }catch{}

  // Fallback → direct table
  const ids=uniqUuids([legacyChildUid,canonicalId]);
  let qb=supabase
    .from("reward_offers")
    .select("id,family_id,child_uid,target_id,reward_id,custom_title,custom_description,message,points_cost_override,points_cost,effective_points_cost,status,offered_at,decided_at,title,description")
    .in("child_uid",ids)
    .order("offered_at",{ascending:false});
  if(familyId)qb=qb.eq("family_id",familyId);
  const q=await qb;
  const rows=(q.data||[])as any[];

  const rids=Array.from(new Set(rows.map((r)=>r.reward_id).filter(Boolean)));
  let meta:Record<string,{title:string;description:string|null;points_cost:number|null}>={};
  if(rids.length){
    const c=await supabase
      .from("rewards_catalog")
      .select("id,title,description,points_cost")
      .in("id",rids);
    if(!c.error&&c.data){
      meta=Object.fromEntries(
        c.data.map((r:any)=>[
          r.id,
          {title:r.title,description:r.description??null,points_cost:r.points_cost??null}
        ])
      );
    }
  }

  return rows.map((r)=>{
    const cat=r.reward_id?meta[r.reward_id]:undefined;
    const cost:(number|null)=(r.points_cost_override??null)??(r.effective_points_cost??r.points_cost??null)??(cat?.points_cost??null);
    return{
      id:r.id,
      family_id:r.family_id??null,
      child_uid:r.child_uid??null,
      target_id:r.target_id??null,
      reward_id:r.reward_id??null,
      custom_title:r.custom_title??null,
      custom_description:r.custom_description??null,
      message:r.message??null,
      points_cost:cost,
      points_cost_override:r.points_cost_override??null,
      title:r.custom_title??cat?.title??"Special Reward",
      description:r.custom_description??cat?.description??null,
      status:r.status,
      offered_at:r.offered_at,
      decided_at:r.decided_at??null
    }as Offer;
  });
}

/* -------- Fallback wallet (computed from DB if RPC is empty) -------- */
type FallbackWallet={
  earned_points:number;
  reserved_points:number;
  available_points:number;
  source:"rpc"|"fallback";
};

async function fetchEarnedFromView(childUid:string):Promise<number>{
  if(!childUid)return 0;
  const {data,error}=await supabase
    .from("vw_child_completed_targets_v2")
    .select("points",{count:"exact",head:false})
    .eq("child_uid",childUid);
  if(error||!data)return 0;
  return(data as any[]).reduce((s,r)=>s+Number(r.points||0),0);
}

async function fetchReservedFromOffers(childUid:string):Promise<number>{
  if(!childUid)return 0;
  const {data,error}=await supabase
    .from("reward_offers")
    .select("effective_points_cost,status")
    .eq("child_uid",childUid)
    .in("status",["Accepted"]);
  if(error||!data)return 0;
  return(data as any[]).reduce((s,r)=>s+Number(r.effective_points_cost||0),0);
}

async function fetchReservedFromRedemptions(childUid:string):Promise<number>{
  if(!childUid)return 0;
  const {data,error}=await supabase
    .from("reward_redemptions")
    .select("reward_id,status")
    .eq("child_uid",childUid)
    .in("status",["Pending","Approved"]);
  if(error||!data||!(data as any[]).length)return 0;
  const rows=data as any[];
  const rewardIds=Array.from(new Set(rows.map((r)=>r.reward_id).filter(Boolean)));
  if(!rewardIds.length)return 0;

  const {data:rewards,error:err2}=await supabase
    .from("rewards_catalog")
    .select("id,points_cost")
    .in("id",rewardIds);
  if(err2||!rewards)return 0;
  const costMap:Record<string,number>=Object.fromEntries(
    (rewards as any[]).map((r)=>[r.id,Number(r.points_cost||0)])
  );

  return rows.reduce((sum,r)=>sum+(costMap[r.reward_id]||0),0);
}

async function computeFallbackWallet(childUid:string):Promise<FallbackWallet>{
  const [earned,reservedOffers,reservedRedeems]=await Promise.all([
    fetchEarnedFromView(childUid),
    fetchReservedFromOffers(childUid),
    fetchReservedFromRedemptions(childUid)
  ]);
  const reserved=reservedOffers+reservedRedeems;
  const available=Math.max(0,earned-reserved);
  return{earned_points:earned,reserved_points:reserved,available_points:available,source:"fallback"};
}

/* -------------------------------- Component -------------------------------- */
type RewardFilter="all"|"available"|"pending"|"completed";

export default function ChildRewards(){
  const navigate=useNavigate();

  // identity
  const [child,setChild]=useState<ChildMini|null>(null);
  const [familyId,setFamilyId]=useState<string>(FALLBACK_FAMILY_ID);

  // wallet — still used internally for affordability, but not shown as classic chips
  const [wallet,setWallet]=useState<ChildWallet|null>(null);
  const [walletSource,setWalletSource]=useState<"rpc"|"fallback"|"none">("none");

  // side panels
  const [catalog,setCatalog]=useState<Reward[]>([]);
  const [ledger,setLedger]=useState<Ledger[]>([]);
  const [redemptions,setRedemptions]=useState<Redemption[]>([]);
  const [offers,setOffers]=useState<Offer[]>([]);

  // Encourage summary from DB (child_points_ledger)
  const [encouragePts,setEncouragePts]=useState<number>(0);
  // Redemption reserved points summary (offers + pending/approved redemptions)
  const [redemptionPts,setRedemptionPts]=useState<number>(0);

  // UI
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState<string|null>(null);
  const [busyReward,setBusyReward]=useState<string|null>(null);
  const [busyOffer,setBusyOffer]=useState<string|null>(null);

  // catalog status filter
  const [rewardFilter,setRewardFilter]=useState<RewardFilter>("all");

  // reserved list cache (display-only)
  const [reservedLists,setReservedLists]=useState<Record<string,Awaited<ReturnType<typeof fetchReservedOffers>>>>({});

  // realtime
  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);

  function beep(f=980,ms=120){
    try{
      const ctx=new((window as any).AudioContext||(window as any).webkitAudioContext)();
      const o=ctx.createOscillator();
      const g=ctx.createGain();
      o.type="sine";
      o.frequency.value=f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001,ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25,ctx.currentTime+0.01);
      o.start();
      setTimeout(()=>{
        g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.01);
        o.stop();
        ctx.close();
      },ms);
      if("vibrate"in navigator)navigator.vibrate(40);
    }catch{}
  }

  const loadWallet=async(idOrUid:string|null|undefined)=>{
    const u=takeUuid(idOrUid);
    if(!u){
      setWallet(null);
      setWalletSource("none");
      return;
    }
    try{
      const row=await fetchChildWallet(u);
      if(row&&(Number(row.total_points||row.earned_points||0)>0||Number(row.available_points||row.free_points||0)>0)){
        setWallet(row);
        setWalletSource("rpc");
        return;
      }
      const fb=await computeFallbackWallet(u);
      setWallet({
        child_uid:u,
        total_points:fb.earned_points,
        reserved_points:fb.reserved_points,
        available_points:fb.available_points
      });
      setWalletSource("fallback");
    }catch{
      const fb=await computeFallbackWallet(u);
      setWallet({
        child_uid:u,
        total_points:fb.earned_points,
        reserved_points:fb.reserved_points,
        available_points:fb.available_points
      });
      setWalletSource("fallback");
    }
  };

  // Encourage points: aggregate from child_points_ledger over both legacy+canonical IDs
  const loadEncourage=async(legacyId:string|null|undefined,canonicalId?:string|null|undefined)=>{
    const ids=uniqUuids([legacyId,canonicalId]);
    if(!ids.length){
      setEncouragePts(0);
      return;
    }
    try{
      const {data,error}=await supabase
        .from("child_points_ledger")
        .select("child_uid,points,reason")
        .in("child_uid",ids);
      if(error){
        console.error("[Encourage fetch table error]",error);
        setEncouragePts(0);
        return;
      }
      const rows=(data||[])as any[];
      const total=rows.reduce((sum,row)=>{
        const pts=Number(row.points||0);
        if(pts>0&&isEncourageReason(row.reason)){
          return sum+pts;
        }
        return sum;
      },0);
      console.log("[Encourage from table]",{ids,rowsCount:rows.length,total});
      setEncouragePts(total);
    }catch(e){
      console.error("[Encourage fetch table exception]",e);
      setEncouragePts(0);
    }
  };

  // Redemption reserved points: offers (Accepted) + redemptions (Pending/Approved)
  const loadRedemptionReserved=async(legacyId:string|null|undefined,canonicalId?:string|null|undefined)=>{
    const u=takeUuid(canonicalId||legacyId);
    if(!u){
      setRedemptionPts(0);
      return;
    }
    try{
      const [fromOffers,fromRedempts]=await Promise.all([
        fetchReservedFromOffers(u),
        fetchReservedFromRedemptions(u)
      ]);
      const total=fromOffers+fromRedempts;
      console.log("[ChildRewards] redemption reserved pts",{u,fromOffers,fromRedempts,total});
      setRedemptionPts(total);
    }catch(e){
      console.error("[ChildRewards] redemption reserved pts error",e);
      setRedemptionPts(0);
    }
  };

  // ---- Bootstrap ----
  useEffect(()=>{
    (async()=>{
      try{
        setLoading(true);
        setErr(null);

        const keyRaw=readAnyChildKeyFromStorage();
        const key=takeUuid(keyRaw);
        if(!key){
          setChild(null);
          setErr("We couldn't find your child session.");
          return;
        }

        const brief=await fetchChildBrief(key);
        const cid=takeUuid((brief as any)?.id)||key;
        const uid=takeUuid((brief as any)?.child_uid)||key;
        const fam=(brief as any)?.family_id||localStorage.getItem("child_portal_family_id")||FALLBACK_FAMILY_ID;

        setFamilyId(fam);
        const mini:ChildMini={
          id:cid,
          child_uid:uid,
          family_id:fam,
          name:(brief as any)?.name||null,
          nick_name:(brief as any)?.nick_name||null
        };
        setChild(mini);

        await Promise.all([
          loadWallet(uid||cid),
          loadEncourage(uid,cid),
          loadRedemptionReserved(uid,cid),
          (async()=>{
            const [cat,ledg,reds,offs]=await Promise.all([
              refreshCatalog(fam),
              refreshLedger(uid,cid),
              refreshRedemptions(uid,cid),
              refreshOffers(uid,cid,fam)
            ]);
            setCatalog(cat);
            setLedger(ledg);
            setRedemptions(reds);
            setOffers(offs);
          })()
        ]);

        try{
          const idForReserved=uid||cid;
          if(idForReserved){
            const list=await fetchReservedOffers(idForReserved);
            setReservedLists((prev)=>({...prev,[idForReserved]:list}));
          }
        }catch{}
      }catch(e:any){
        console.error("[Rewards bootstrap]",e);
        setErr(e?.message||"Something went wrong.");
      }finally{
        setLoading(false);
      }
    })();

    return()=>{
      try{
        channelRef.current?.unsubscribe();
      }catch{}
      channelRef.current=null;
    };
  },[]);

  // ---- Recompute wallet/encourage when IDs change ----
  useEffect(()=>{
    if(!child?.id&&!child?.child_uid)return;
    const idPref=child?.child_uid||child?.id;
    loadWallet(idPref);
    loadEncourage(child?.child_uid,child?.id);
    loadRedemptionReserved(child?.child_uid,child?.id);
  },[child?.id,child?.child_uid]);

  // ---- Reserved list refresh (display-only) ----
  useEffect(()=>{
    (async()=>{
      const idForReserved=child?.id||child?.child_uid||null;
      const u=takeUuid(idForReserved);
      if(!u)return;
      try{
        const list=await fetchReservedOffers(u);
        setReservedLists((prev)=>({...prev,[u]:list}));
      }catch(e){
        toast.error("Failed to load reserved offers",{description:String(e)});
      }
    })();
  },[child?.id,child?.child_uid]);

  // ---- Realtime ----
  useEffect(()=>{
    const idForEvents=takeUuid(child?.id||child?.child_uid);
    if(!idForEvents)return;

    try{
      channelRef.current?.unsubscribe();
    }catch{}
    channelRef.current=null;

    const ch=supabase.channel(`child-rewards:${idForEvents}`);

    const softRefresh=async()=>{
      try{
        await loadWallet(child?.child_uid||child?.id);
        await loadEncourage(child?.child_uid,child?.id);
        await loadRedemptionReserved(child?.child_uid,child?.id);
      }catch{}
      try{
        if(child){
          const [ledg,reds,offs]=await Promise.all([
            refreshLedger(child.child_uid,child.id),
            refreshRedemptions(child.child_uid,child.id),
            refreshOffers(child.child_uid,child.id,child.family_id)
          ]);
          setLedger(ledg);
          setRedemptions(reds);
          setOffers(offs);
        }
      }catch{}
      try{
        const list=await fetchReservedOffers(idForEvents);
        setReservedLists((prev)=>({...prev,[idForEvents]:list}));
      }catch{}
    };

    const bind=(table:string,event:"*"|"INSERT"|"UPDATE"|"DELETE"="*")=>{
      ch.on(
        "postgres_changes",
        {event,schema:"public",table,filter:`child_uid=eq.${idForEvents}`},
        (payload:any)=>{
          // points notifications for child_points_ledger inserts
          if(table==="child_points_ledger"&&event==="INSERT"){
            const row=payload?.new||{};
            let pts=Number(row.points??0);
            if(!Number.isFinite(pts))pts=0;
            if(pts!==0){
              const reason=row.reason||"Points update";
              const pref=pts>0?"+":"";
              toast.success(`${pref}${pts} pts`,{description:reason});
              beep(1100,120);
            }
          }
          if(table==="reward_redemptions"){
            const now=payload?.new;
            const prev=payload?.old;
            if(now&&prev&&now.status!==prev.status&&now.status==="Approved"){
              toast.success("🎉 Your redemption was approved!");
              beep(1240,140);
            }
          }
          void softRefresh();
        }
      );
    };

    bind("child_points_ledger","INSERT");
    bind("reward_offers");
    bind("reward_redemptions");

    ch.subscribe();
    channelRef.current=ch;

    return()=>{
      try{
        channelRef.current?.unsubscribe();
      }catch{}
      channelRef.current=null;
    };
  },[child?.id,child?.child_uid,child?.family_id]);

  /* ---- Chips (normalize wallet fields from any source) ---- */
  function normalizeWallet(w:any){
    const earned=Number(
      w?.total_points||
      w?.earned_points||
      w?.rewards_total||
      w?.total||
      0
    );
    const reserved=Number(
      w?.reserved_points||
      w?.reserved||
      0
    );
    const availableRaw=(
      w?.available_points||
      w?.free_points||
      w?.available||
      (earned-reserved)
    );
    const available=Math.max(0,Number(availableRaw||0));
    return{earned,available,reserved};
  }

  // Fallback wallet derived purely from ledger + offers + redemptions (no RPC needed)
  function deriveWalletFromLedger(){
    const earned=ledger.reduce((s,l)=>l.points>0?s+l.points:s,0);
    const spent=ledger.reduce((s,l)=>l.points<0?s+(-l.points):s,0);

    const reservedFromOffers=offers
      .filter((o)=>o.status==="Accepted")
      .reduce((s,o)=>s+Number(o.points_cost||0),0);

    const reservedFromRedemptions=redemptions
      .filter((d)=>d.status==="Pending"||d.status==="Approved")
      .reduce((s,d)=>s+Number(d.points_cost||0),0);

    const reserved=reservedFromOffers+reservedFromRedemptions;
    const available=Math.max(0,earned-reserved-spent);

    return{earned,available,reserved};
  }

  const ledgerSum=useMemo(()=>ledger.reduce((s,l)=>s+(l.points||0),0),[ledger]);
  const normWallet=normalizeWallet(wallet);
  const derivedWallet=useMemo(()=>deriveWalletFromLedger(),[ledger,offers,redemptions]);

  // Internal wallet values (still used for affordability/progress)
  const chipEarned=normWallet.earned;
  const chipReserved=normWallet.reserved;
  const chipAvailable=normWallet.available;

  const childDisplayName=child?.nick_name||child?.name||"Kiddo";

  // Encourage-only rows for sidebar list (still based on ledger)
  const encourageLedger=useMemo(
    ()=>ledger.filter((l)=>l.points>0&&isEncourageReason(l.reason)),
    [ledger]
  );

  // Encourage total for chips — now from table (aligned with DB)
  const encourageTotal=encouragePts;

  // Redemption Reward pts = offers (Accepted) + redemptions (Pending/Approved), from DB helpers
  const redemptionRewardPts=redemptionPts;

  // Total pts chip = Encourage + Redemption
  const totalSpecialPts=useMemo(
    ()=>encourageTotal+redemptionRewardPts,
    [encourageTotal,redemptionRewardPts]
  );

  const DebugPanel=()=>{
    if(!DEBUG)return null;
    const dump={
      resolved_child:child,
      wallet_from:walletSource,
      wallet,
      normalized_wallet:normWallet,
      derived_wallet:derivedWallet,
      chipEarned,
      chipAvailable,
      chipReserved,
      ledger_sum_for_reference:ledgerSum,
      encourage_rows:encourageLedger.length,
      encourage_pts_db:encouragePts,
      encourage_total:encourageTotal,
      redemption_pts_db:redemptionPts,
      redemption_reward_pts:redemptionRewardPts,
      total_special_pts:totalSpecialPts,
      offers_count:offers.length,
      redemptions_count:redemptions.length,
      err,
      loading
    };
    return(
      <pre className="text-xs p-3 rounded-xl bg-black/50 border border-white/10 overflow-auto mb-4">
        {JSON.stringify(dump,null,2)}
      </pre>
    );
  };

  function StatCard({
    label,
    value,
    valueClass="",
    prefix="",
    suffix=" pts"
  }:{
    label:string;
    value:number|string;
    valueClass?:string;
    prefix?:string;
    suffix?:string;
  }){
    const safeValue=(typeof value==="number"&&Number.isFinite(value))?value:0;
    return(
      <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
        <div className="text-white/60 text-xs">{label}</div>
        <div
          className={["mt-1 text-2xl font-bold leading-tight tracking-tight",valueClass].join(" ")}
          aria-label={`${label}: ${safeValue}`}
        >
          {prefix}{safeValue}
          <span className="text-white/50 text-xs align-middle">{suffix}</span>
        </div>
      </div>
    );
  }

  const canAfford=(r:Reward)=>chipAvailable>=(r.points_cost??0);

  // classify each reward into "available" | "pending" | "completed"
  function classifyReward(r:Reward):"available"|"pending"|"completed"{
    const related=redemptions.filter((d)=>(
      d.reward_id===r.id||
      d.reward_title===r.title
    ));
    if(related.some((d)=>d.status==="Approved"||d.status==="Fulfilled"))return"completed";
    if(related.some((d)=>d.status==="Pending"))return"pending";
    return"available";
  }

  async function redeem(r:Reward){
    if(!child)return;
    if(!canAfford(r)){
      toast.info("You don’t have enough available points yet—keep going! ✨");
      return;
    }
    await tpromise(
      async()=>{
        try{
          setBusyReward(r.id);
          setErr(null);
          const {error}=await supabase.rpc("api_child_redeem_reward",{
            p_child_uid:child.child_uid,
            p_reward_id:r.id
          });
          if(error)throw error;

          const [ledg,reds,offs]=await Promise.all([
            refreshLedger(child.child_uid,child.id),
            refreshRedemptions(child.child_uid,child.id),
            refreshOffers(child.child_uid,child.id,child.family_id)
          ]);
          setLedger(ledg);
          setRedemptions(reds);
          setOffers(offs);
          await loadWallet(child.id||child.child_uid);
          await loadEncourage(child.child_uid,child.id);
          await loadRedemptionReserved(child.child_uid,child.id);

          try{
            const list=await fetchReservedOffers(child.id||child.child_uid);
            setReservedLists((prev)=>({...prev,[child.id||child.child_uid]:list}));
          }catch{}
        }finally{
          setBusyReward(null);
        }
      },
      {
        loading:"Requesting redemption…",
        success:`Woohoo! You requested “${r.title}”. A grown-up will review it soon. 🎉`,
        error:"Could not request redemption."
      }
    );
  }

  async function acceptOffer(offer:Offer){
    if(!child)return;
    await tpromise(
      async()=>{
        try{
          setBusyOffer(offer.id);

          const {data,error}=await supabase.rpc("api_child_accept_offer_v2",{
            p_child_uid:child.child_uid,
            p_offer_id:offer.id
          });
          if(error){
            toast.error("Offer accept failed",{description:error.message});
            throw error;
          }
          if(data&&data.ok===false){
            toast.error("Offer accept failed",{description:data.error||"Offer not accepted"});
            throw new Error(data.error||"Offer not accepted");
          }

          setOffers((prev)=>prev.filter((o)=>o.id!==offer.id));

          const [offs,ledg,reds]=await Promise.all([
            refreshOffers(child.child_uid,child.id,child.family_id),
            refreshLedger(child.child_uid,child.id),
            refreshRedemptions(child.child_uid,child.id)
          ]);
          setOffers(offs);
          setLedger(ledg);
          setRedemptions(reds);
          await loadWallet(child.id||child.child_uid);
          await loadEncourage(child.child_uid,child.id);
          await loadRedemptionReserved(child.child_uid,child.id);

          try{
            const list=await fetchReservedOffers(child.id||child.child_uid);
            setReservedLists((prev)=>({...prev,[child.id||child.child_uid]:list}));
          }catch{}
        }finally{
          setBusyOffer(null);
        }
      },
      {
        loading:"Accepting offer…",
        success:`Accepted: “${offer.title||"Reward"}” — nice choice! 🎉`,
        error:"Could not accept offer."
      }
    );
  }

  const DebugQuickStats=()=>{
    if(!DEBUG)return null;
    return null;
  };

  const childHasOffered=offers.filter((o)=>o.status==="Offered");

  return(
    <div className="space-y-6">
      <DebugPanel/>
      <DebugQuickStats/>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            🎁 Rewards for{" "}
            <span className="text-yellow-300">{childDisplayName}</span>
          </h1>
          <p className="text-white/70 mt-1">
            Trade your points for exciting treats. Keep completing missions to earn more! 🌟
          </p>
          {!child?.family_id&&(
            <p className="text-xs text-white/50 mt-2">
              Note: family link not found; showing global rewards and your offers only.
            </p>
          )}
        </div>

        {/* 💡 Summary chips — Encourage + Redemption + Total */}
        <div className="grid grid-cols-3 md:grid-cols-3 gap-3">
          <StatCard
            label="Encourage Rewards"
            value={encourageTotal}
            valueClass="text-emerald-300"
          />
          <StatCard
            label="Redemption Reward pts"
            value={redemptionRewardPts}
            valueClass="text-sky-300"
          />
          <StatCard
            label="Total pts"
            value={totalSpecialPts}
            valueClass="text-amber-300"
          />
        </div>
      </div>

      {err&&(
        <div className="glass rounded-xl p-4 border border-red-400/30 text-red-300">
          {err}
        </div>
      )}

      {/* Offers Banner (special mission-linked rewards from parent) */}
      {childHasOffered.length>0&&(
        <div className="glass-premium rounded-2xl p-4 border border-emerald-400/30 bg-emerald-500/10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Gift className="w-5 h-5 text-emerald-300"/>
              <div className="text-white min-w-0">
                <div className="font-semibold">
                  You have {childHasOffered.length} special offer(s)!
                </div>
                <div className="text-white/70 text-sm">
                  These are rewards linked to your missions. Accept to lock them in.
                </div>
              </div>
            </div>
            {childHasOffered[0]&&(
              <button
                onClick={()=>acceptOffer(childHasOffered[0])}
                disabled={busyOffer===childHasOffered[0].id}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-sm w-full sm:w-auto"
              >
                {busyOffer===childHasOffered[0].id?"Accepting…":"Accept First Offer"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header card */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Gift className="w-6 h-6 text-purple-300"/>
              <h2 className="text-xl font-bold text-white">Reward Catalog</h2>
            </div>
            {/* Filter buttons */}
            <div className="flex flex-wrap gap-2 text-xs md:text-sm">
              {[
                {key:"all",label:"All"},
                {key:"available",label:"Ready to redeem"},
                {key:"pending",label:"Requested"},
                {key:"completed",label:"Completed"}
              ].map((b)=>(
                <button
                  key={b.key}
                  onClick={()=>setRewardFilter(b.key as RewardFilter)}
                  className={`px-3 py-1 rounded-full border text-xs md:text-sm transition-all ${
                    rewardFilter===b.key
                      ?"bg-white text-slate-900 border-white"
                      :"bg-white/5 text-white/70 border-white/20 hover:bg-white/10"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reward Catalog */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="w-6 h-6 text-blue-300"/>
              <h2 className="text-xl font-bold text-white">Reward Catalog</h2>
            </div>
            {loading?(
              <div className="text-white/60 text-center py-4">Loading rewards…</div>
            ):catalog.length===0?(
              <div className="text-white/70 text-center py-4">
                No rewards yet. Ask your grown-ups to add some goodies! 🍭
              </div>
            ):(
              <div className="grid gap-4">
                {catalog.map((r)=>{
                  const status=classifyReward(r);
                  if(rewardFilter!=="all"&&rewardFilter!==status)return null;

                  const affordable=canAfford(r);

                  const hasAnyRedemption=status!=="available";
                  const pending=redemptions.find((d)=>(
                    (d.reward_id===r.id||d.reward_title===r.title)&&
                    d.status==="Pending"
                  ));
                  const approvedOrFulfilled=redemptions.find((d)=>(
                    (d.reward_id===r.id||d.reward_title===r.title)&&
                    (d.status==="Approved"||d.status==="Fulfilled")
                  ));

                  const pct=Math.max(
                    0,
                    Math.min(100,Math.floor((chipAvailable/Math.max(1,r.points_cost))*100))
                  );
                  const disableRedeem=!affordable||hasAnyRedemption||busyReward===r.id||loading;

                  return(
                    <div
                      key={r.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 hover-lift transition-all duration-300"
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">✨</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <div className="font-semibold text-lg text-white break-words">
                              {r.title}
                            </div>
                            <div className="px-2 py-0.5 rounded text-sm bg-emerald-500/20 text-emerald-300">
                              {r.points_cost} pts
                            </div>
                            <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-white/5 text-white/60 border border-white/10">
                              {status==="available"
                                ?"Ready"
                                :status==="pending"
                                  ?"Requested"
                                  :"Completed"}
                            </span>
                          </div>
                          {r.description&&(
                            <div className="text-white/80 mb-3 break-words">
                              {r.description}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2 items-center mb-3">
                            {pending&&(
                              <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-300 text-xs">
                                ⏳ Requested – waiting for approval
                              </span>
                            )}
                            {approvedOrFulfilled&&(
                              <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs">
                                ✅ Approved / Fulfilled
                              </span>
                            )}
                          </div>
                          {!affordable&&status==="available"&&(
                            <div className="space-y-2">
                              <div className="h-2 w-full bg-white/10 rounded">
                                <div
                                  className="h-2 bg-emerald-500/70 rounded transition-all duration-1000"
                                  style={{width:`${pct}%`}}
                                />
                              </div>
                              <div className="text-xs text-white/60">
                                {Math.max(0,r.points_cost-chipAvailable)} pts to go — one small
                                mission at a time! 🚀
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={()=>redeem(r)}
                            disabled={disableRedeem}
                            className={`px-4 py-2 rounded-xl transition-all font-semibold w-full sm:w-auto ${
                              disableRedeem
                                ?"bg-white/10 text-white/50 cursor-not-allowed"
                                :"bg-gradient-to-r from-pink-500 to-fuchsia-500 hover:from-pink-400 hover:to-fuchsia-400 text-white hover-lift"
                            }`}
                          >
                            {busyReward===r.id?"Requesting…":"Redeem"}
                          </button>
                          {!affordable&&status==="available"&&(
                            <div className="text-xs text-white/60 text-center">
                              Earn {Math.max(0,r.points_cost-chipAvailable)} more pts
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-4 h-fit">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-6 h-6 text-green-300"/>
              <h2 className="text-xl font-bold text-white">Recent Activity</h2>
            </div>

            {/* Points Ledger — Encourage-only (parent reward pts) */}
            <div className="rounded-xl border border-white/10 bg-white/5 mb-4">
              <div className="p-3 border-b border-white/10 font-semibold text-white">
                Reward Points From Grown-ups
              </div>
              <div className="max-h-[200px] overflow-auto">
                {loading?(
                  <div className="p-3 text-white/60 text-center text-sm">
                    Loading…
                  </div>
                ):encourageLedger.length===0?(
                  <div className="p-3 text-white/70 text-center text-sm">
                    No encouragement points yet — your grown-ups can surprise you with High-fives here! ✨
                  </div>
                ):(
                  encourageLedger.slice(0,5).map((l)=>(
                    <div
                      key={String(l.id)}
                      className="px-3 py-2 border-t border-white/10 text-sm flex items-center gap-3"
                    >
                      <div className={`font-mono ${l.points>=0?"text-emerald-300":"text-red-300"}`}>
                        {l.points>=0?`+${l.points}`:l.points}
                      </div>
                      <div className="text-white/80 flex-1 text-xs min-w-0 break-words">
                        {l.reason||"Points update"}
                      </div>
                      <div className="text-white/50 text-xs">
                        {new Date(l.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Redemptions — catalog reward redemptions */}
            <div className="rounded-xl border border-white/10 bg-white/5">
              <div className="p-3 border-b border-white/10 font-semibold text-white">
                Your Redemptions
              </div>
              <div className="max-h-[200px] overflow-auto">
                {loading?(
                  <div className="p-3 text-white/60 text-center text-sm">
                    Loading…
                  </div>
                ):redemptions.length===0?(
                  <div className="p-3 text-white/70 text-center text-sm">
                    No redemption requests yet.
                  </div>
                ):(
                  redemptions.slice(0,5).map((d)=>(
                    <div
                      key={d.id}
                      className="px-3 py-2 border-t border-white/10 text-sm flex items-center gap-3"
                    >
                      <div className="text-white/80 flex-1 text-xs min-w-0 break-words">
                        <div className="font-medium">
                          {d.reward_title||"Special Reward"}
                        </div>
                        <span
                          className={
                            d.status==="Pending"
                              ?"text-yellow-300"
                              :d.status==="Approved"
                                ?"text-emerald-300"
                                :d.status==="Fulfilled"
                                  ?"text-blue-300"
                                  :"text-red-300"
                          }
                        >
                          {d.status}
                        </span>
                        {typeof d.points_cost==="number"&&(
                          <span className="ml-2 text-white/60">
                            ({d.points_cost} pts)
                          </span>
                        )}
                      </div>
                      <div className="text-white/50 text-xs">
                        {new Date(d.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="glass-premium rounded-2xl p-5 border border-white/20">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-300"/>
              Quick Stats
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-white/80">
                <span>Total Rewards</span>
                <span className="text-emerald-300 font-semibold">
                  {catalog.length}
                </span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Active Offers</span>
                <span className="text-yellow-300 font-semibold">
                  {offers.filter((o)=>o.status==="Offered").length}
                </span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Pending Requests</span>
                <span className="text-blue-300 font-semibold">
                  {redemptions.filter((d)=>d.status==="Pending").length}
                </span>
              </div>
            </div>
          </div>

          <div className="glass-premium rounded-2xl p-5 border border-white/20 bg-gradient-to-br from-purple-500/10 to-pink-500/10">
            <div className="text-4xl mb-2">🎯</div>
            <h4 className="font-bold text-white mb-2">Keep Going!</h4>
            <p className="text-white/80 text-sm">
              Every mission you complete brings you closer to amazing rewards. You're doing great! ✨
            </p>
          </div>
        </aside>
      </div>

      <div className="text-center text-white/70 text-sm">
        Keep shining, {childDisplayName}! Every mission you complete unlocks more magic. ✨
      </div>
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
