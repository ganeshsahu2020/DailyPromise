// src/routes/child/ChildReports.tsx
import React,{useEffect,useMemo,useRef,useState}from "react";
import {Link,useLocation}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {Button}from "@/components/ui/button";
import {Tabs,TabsContent,TabsList,TabsTrigger}from "@/components/ui/tabs";
import {
  LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid,
  BarChart,Bar,Legend,PieChart,Pie,Cell
}from "recharts";
import {toast}from "sonner";
import {
  Trophy,Star,Target as TargetIcon,Calendar,Sparkles,
  TrendingUp,Award,Zap,Clock,Gift,Camera,Heart,Info
}from "lucide-react";
import {fetchChildBrief}from "@/utils/childAuth";
import {isGameReason}from "./useChildPointsRollup";
import {
  fetchChildWallet,
  fetchChildWalletBreakdown,
  type ChildWallet,
  type WalletBreakdown
}from "@/data/wallet";

/* ------------------------------- Types ---------------------------------- */
export type UnifiedWallet={  // legacy shape, no longer used as truth
  child_uid:string;
  earned_points:number;
  spent_points:number;
  reserved_points:number;
  available_points:number;
  balance_points:number;
  rewards_total:number;
};

export type LedgerRow={
  id:string|number;
  child_uid:string;
  delta:number;
  reason:string|null;
  created_at:string;
};

export type DailyRow={
  id:string;
  child_uid:string;
  total_points:number;
  activity_date:string;
  reviewed_at:string|null;
  submitted_at:string|null;
  status:string|null;
};

type MemoryItem={path:string;name:string;url:string|null;createdAt?:string|null;};

/** ------- Legacy earnings breakdown (stage-style) ------- */
type EarnBreakdown={
  daily:number;
  checklists:number;
  games:number;
  targets:number;
  wishlist:number;
  rewardEncourage:number;
  rewardRedemption:number;
  total:number;
};
const ZERO_BREAK:EarnBreakdown={
  daily:0,
  checklists:0,
  games:0,
  targets:0,
  wishlist:0,
  rewardEncourage:0,
  rewardRedemption:0,
  total:0
};

/* ------------------------------- Helpers -------------------------------- */
function nice(n:number){return new Intl.NumberFormat().format(Number(n??0));}
function looksLikeUuid(s:string){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((s||"").trim());
}
function childFromQuery(locSearch:string):string|null{
  try{
    const p=new URLSearchParams(locSearch);
    const v=p.get("child");
    return v&&v.trim()?v.trim():null;
  }catch{return null;}
}
function cleanUuid(s?:string|null){
  return (s||"").toLowerCase().replace(/[^0-9a-f-]/g,"");
}

/** Align child-key lookup with ChildEarnings.tsx */
function readChildKeyFromStorage():string|null{
  try{
    return (
      sessionStorage.getItem("child_uid")||
      sessionStorage.getItem("child_id")||
      localStorage.getItem("child_portal_child_id")||
      localStorage.getItem("child_uid")||
      null
    );
  }catch{
    return null;
  }
}

async function resolveChildIds(rawKey:string):Promise<{legacyUid:string;canonicalId:string}|null>{
  const key=(rawKey||"").trim();
  if(!key)return null;

  // Try by id
  if(looksLikeUuid(key)){
    const {data,error}=await supabase
      .from("child_profiles")
      .select("id, child_uid")
      .eq("id",key)
      .maybeSingle();
    if(!error&&data){
      return{
        legacyUid:cleanUuid((data.child_uid as any)||data.id),
        canonicalId:cleanUuid(data.id)
      };
    }
  }

  // Try by child_uid or id
  const {data,error}=await supabase
    .from("child_profiles")
    .select("id, child_uid")
    .or(`child_uid.eq.${key},id.eq.${key}`)
    .limit(1)
    .maybeSingle();
  if(!error&&data){
    return{
      legacyUid:cleanUuid((data.child_uid as any)||data.id),
      canonicalId:cleanUuid(data.id)
    };
  }
  return null;
}

const COLORS=["#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316"];

/** Classify reasons into the same buckets as ChildEarnings.tsx (legacy) */
function classifyReason(reason:string):keyof EarnBreakdown|null{
  const r=(reason||"").toLowerCase();

  if(isGameReason(reason))return"games";

  if(r.includes("daily activity"))return"daily";
  if(r.includes("checklist"))return"checklists";
  if(r.includes("target"))return"targets";
  if(r.includes("wishlist")||r.includes("wish"))return"wishlist";

  // Map some story-style labels to targets
  if(["read 10 pages","dusting adventure","block city","blue sky with rainbow","quick forest painting","draw a monkey"].some((k)=>r.includes(k)))return"targets";

  // Dedicated reward buckets:
  if(
    r.includes("encourage reward")||
    r.includes("encouragement reward")||
    r.startsWith("encouragement:")
  )return"rewardEncourage";

  if(
    r.includes("redemption reward")||
    r.startsWith("reward redemption")||
    r.startsWith("redeem reward")
  )return"rewardRedemption";

  return null;
}

/** Positive inflows across both ledgers (same as ChildEarnings) */
async function fetchPositiveInflows(ids:string[]){
  const [pl,cpl]=await Promise.all([
    supabase.from("points_ledger").select("delta,reason,child_uid").in("child_uid",ids),
    supabase.from("child_points_ledger").select("points,reason,child_uid").in("child_uid",ids)
  ]);

  const rows:{pts:number;reason:string}[]=[];
  if(Array.isArray(pl.data)){
    for(const r of pl.data){
      if((Number(r.delta)||0)>0){
        rows.push({pts:Number(r.delta)||0,reason:String(r.reason||"")});
      }
    }
  }
  if(Array.isArray(cpl.data)){
    for(const r of cpl.data){
      if((Number(r.points)||0)>0){
        rows.push({pts:Number(r.points)||0,reason:String(r.reason||"")});
      }
    }
  }
  return rows;
}

/** Wishlist-earned points (RPC + fallback view) */
async function fetchWishlistEarned(ids:string[]):Promise<number>{
  let wishlistPts=0;
  for(const id of ids){
    try{
      const {data,error}=await supabase.rpc("api_child_wishlist_items_resolved",{p_child_uid:id});
      if(!error&&Array.isArray(data)&&data.length){
        for(const row of data as any[]){
          const v=Number(row?.earned_points??row?.earned_points_resolved??0);
          if(Number.isFinite(v))wishlistPts+=v;
        }
        if(wishlistPts>0)return wishlistPts;
      }
    }catch{}
  }
  try{
    const {data}=await supabase
      .from("vw_wishlist_earned")
      .select("earned_points_resolved,child_uid")
      .in("child_uid",ids);
    if(Array.isArray(data)){
      for(const r of data as any[]){
        const v=Number(r?.earned_points_resolved??0);
        if(Number.isFinite(v))wishlistPts+=v;
      }
    }
  }catch{}
  return wishlistPts;
}

/** Encourage = High-five / Cheer bonus (parent-side reward points) */
function isEncourageReason2(reason:any){
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

/**
 * Encourage points aligned with ChildRewards:
 * - Source: child_points_ledger only
 * - Filter: points>0 and isEncourageReason2(reason)
 */
async function fetchEncouragePoints(ids:string[]):Promise<number>{
  if(!ids.length)return 0;
  try{
    const {data,error}=await supabase
      .from("child_points_ledger")
      .select("child_uid,points,reason")
      .in("child_uid",ids);
    if(error){
      console.error("[ChildReports.fetchEncouragePoints]",error);
      return 0;
    }
    const rows=(data||[])as any[];
    const total=rows.reduce((sum,row)=>{
      const pts=Number(row.points||0);
      if(pts>0&&isEncourageReason2(row.reason)){
        return sum+pts;
      }
      return sum;
    },0);
    return total;
  }catch(e){
    console.error("[ChildReports.fetchEncouragePoints.ex]",e);
    return 0;
  }
}

/** Daily totals (points) from daily_activity_submissions (same helper as ChildEarnings) */
type DailyTotals={approved:number;pending:number;total:number;};
const ZERO_DAILY:DailyTotals={approved:0,pending:0,total:0};

async function fetchDailyTotals(ids:string[]):Promise<DailyTotals>{
  const childIds=Array.from(new Set(ids.filter(Boolean)));
  if(!childIds.length)return ZERO_DAILY;

  try{
    const {data,error}=await supabase
      .from("daily_activity_submissions")
      .select("total_points,status,child_uid")
      .in("child_uid",childIds);

    if(error)throw error;

    let approved=0;
    let pending=0;
    let total=0;

    (data||[]).forEach((row:any)=>{
      const pts=Number(row.total_points||0);
      total+=pts;
      if(row.status==="approved")approved+=pts;
      else if(row.status==="pending")pending+=pts;
    });

    return{approved,pending,total};
  }catch(e){
    console.warn("[ChildReports.fetchDailyTotals]",e);
    return ZERO_DAILY;
  }
}

/** Checklist totals so ChildReports matches Child Checklists + Earnings */
type ChecklistTotals={total:number;approved:number;pending:number;};
const ZERO_CHECKLIST:ChecklistTotals={total:0,approved:0,pending:0};

async function fetchChecklistTotalsForChild(childKey:string):Promise<ChecklistTotals>{
  if(!childKey)return ZERO_CHECKLIST;

  let rows:any[]=[];

  // 1) Prefer v2 RPC (p_child_id)
  try{
    const {data,error}=await supabase.rpc("api_child_active_assignments_v2",{p_child_id:childKey} as any);
    if(!error&&Array.isArray(data)&&data.length){
      rows=data as any[];
    }
  }catch(e){
    console.warn("[ChildReports.fetchChecklistTotalsForChild] v2 RPC failed",e);
  }

  // 2) Fallback to legacy RPC (p_child_uid)
  if(!rows.length){
    try{
      const {data,error}=await supabase.rpc("api_child_active_assignments",{p_child_uid:childKey} as any);
      if(!error&&Array.isArray(data)&&data.length){
        rows=data as any[];
      }
    }catch(e){
      console.warn("[ChildReports.fetchChecklistTotalsForChild] v1 RPC failed",e);
    }
  }

  // 3) Final fallback to direct table scan
  if(!rows.length){
    try{
      const {data,error}=await supabase
        .from("checklist_assignments")
        .select(`
          id,template_id,child_uid,period_start,period_end,status,reward_points,created_at,
          checklist_templates:template_id(title,frequency)
        `)
        .eq("child_uid",childKey)
        .in("status",["Open","InProgress","Submitted","Approved","Fulfilled"])
        .order("created_at",{ascending:false});
      if(!error&&Array.isArray(data)){
        rows=data as any[];
      }
    }catch(e){
      console.warn("[ChildReports.fetchChecklistTotalsForChild] table fallback failed",e);
    }
  }

  let total=0;
  let approved=0;
  let pending=0;

  for(const r of rows){
    const pts=Number(r.reward_points||0);
    if(!Number.isFinite(pts)||pts<=0)continue;
    const s=String(r.status||"");
    if(s==="Approved"||s==="Fulfilled"){
      approved+=pts;
      total+=pts;
    }else if(s==="Submitted"){
      pending+=pts;
      total+=pts;
    }
  }

  return{total,approved,pending};
}

/** ─────────── Target / mission totals (align with ChildEarnings) ─────────── */

type TargetReviewStatus="Pending"|"Approved"|"Rejected"|null;
type MissionTotals={approved:number;pending:number;total:number;};
const ZERO_MISSIONS:MissionTotals={approved:0,pending:0,total:0};

function normalizeMissionReviewStatus(raw:any):TargetReviewStatus{
  if(raw==null)return null;
  const s=String(raw).trim().toLowerCase();
  if(s==="approved")return"Approved";
  if(s==="pending")return"Pending";
  if(s==="rejected")return"Rejected";
  return null;
}

function deriveMissionReviewStatus(status:string,reviewRaw:any,awarded:number|null):TargetReviewStatus{
  const norm=normalizeMissionReviewStatus(reviewRaw);
  if(norm)return norm;

  if(status==="Completed"){
    if(typeof awarded==="number"&&Number.isFinite(awarded)&&awarded>0){
      return"Approved";
    }
    return"Pending";
  }
  return norm;
}

/** Use api_child_targets_v1 to compute mission-approved + pending points. */
async function fetchMissionTotalsForChild(childUid:string):Promise<MissionTotals>{
  if(!childUid)return ZERO_MISSIONS;

  try{
    const {data,error}=await supabase.rpc("api_child_targets_v1",{p_child_uid:childUid});
    if(error)throw error;

    const rows=(data||[])as any[];
    let approved=0;
    let pending=0;

    for(const row of rows){
      const status=String(row.status||"");
      const baseRaw=Number(row.points_award);
      const base=Number.isFinite(baseRaw)?baseRaw:0;

      const awardedRaw=typeof row.awarded_points==="number"
        ?Number(row.awarded_points)
        :NaN;
      const awarded=Number.isFinite(awardedRaw)?awardedRaw:0;

      const review=deriveMissionReviewStatus(
        status,
        row.review_status,
        Number.isFinite(awardedRaw)?awardedRaw:null
      );

      if(status!=="Completed")continue;
      if(base<=0&&awarded<=0)continue;

      if(review==="Approved"){
        approved+=awarded>0?awarded:base;
      }else if(!review||review==="Pending"){
        pending+=base;
      }
    }

    return{approved,pending,total:approved+pending};
  }catch(e){
    console.warn("[ChildReports.fetchMissionTotalsForChild]",e);
    return ZERO_MISSIONS;
  }
}

/**
 * Build the same lifetime breakdown as ChildEarnings (legacy):
 * My Daily + My Checklists + Play Game + Completed Targets + My Wishlist + Reward pts
 * NOTE: We now use canonical wallet (ChildWallet) as the final "truth" for totals,
 * but we still keep this for comparison/debug.
 */
async function buildBreakdown(
  allIds:string[],
  canonicalId:string,
  legacyId:string|null,
  rewardEncourageOverride?:number,
  rewardRedemptionOverride?:number
):Promise<EarnBreakdown>{
  try{
    const ledgerIds=Array.from(new Set(allIds.filter(Boolean)));
    const canonicalForChecklist=canonicalId||ledgerIds[0]||"";
    const missionChildUid=legacyId||canonicalId||ledgerIds[0]||"";

    const [inflows,wishPts,dailyTotals,checkTotals,missionTotals]=await Promise.all([
      fetchPositiveInflows(ledgerIds),
      fetchWishlistEarned(ledgerIds),
      fetchDailyTotals(ledgerIds),
      fetchChecklistTotalsForChild(canonicalForChecklist),
      missionChildUid?fetchMissionTotalsForChild(missionChildUid):Promise.resolve(ZERO_MISSIONS)
    ]);

    const base:{[k in "daily"|"checklists"|"games"|"targets"|"wishlist"|"rewardEncourage"|"rewardRedemption"]:number}={
      daily:0,
      checklists:0,
      games:0,
      targets:0,
      wishlist:0,
      rewardEncourage:0,
      rewardRedemption:0
    };

    for(const row of inflows){
      const bucket=classifyReason(row.reason);
      if(!bucket)continue;
      if(bucket in base){
        base[bucket as keyof typeof base]+=row.pts;
      }
    }

    const b:EarnBreakdown={...ZERO_BREAK};

    // Wishlist: max(ledger-based, wishlist RPC/view)
    const wishlistFromLedger=base.wishlist;
    b.wishlist=Math.max(wishlistFromLedger,wishPts);

    // Daily: prefer authoritative rollup, fallback to ledger bucket
    b.daily=dailyTotals.approved||base.daily;

    // Checklists: Approved+Fulfilled
    b.checklists=checkTotals.approved||0;

    // Targets / missions
    b.targets=missionTotals.approved||base.targets;

    // Games from ledger
    b.games=base.games;

    // Rewards: prefer summary overrides; fallback to ledger buckets
    const encValid=typeof rewardEncourageOverride==="number"&&Number.isFinite(rewardEncourageOverride)&&rewardEncourageOverride>0;
    const redValid=typeof rewardRedemptionOverride==="number"&&Number.isFinite(rewardRedemptionOverride)&&rewardRedemptionOverride>0;

    b.rewardEncourage=encValid?Number(rewardEncourageOverride):base.rewardEncourage;
    b.rewardRedemption=redValid?Number(rewardRedemptionOverride):base.rewardRedemption;

    // Final Total = sum of the 7 visible stage buckets
    b.total=
      b.daily+
      b.checklists+
      b.games+
      b.targets+
      b.wishlist+
      b.rewardEncourage+
      b.rewardRedemption;

    return b;
  }catch(e){
    console.warn("[ChildReports.buildBreakdown] falling back to ZERO_BREAK",e);
    return{...ZERO_BREAK};
  }
}

/* ---------------------------- Tiny UI helper ---------------------------- */
function InfoBadge({tip}:{tip:string}){
  return(
    <span className="inline-flex items-center align-middle">
      <Info className="w-3.5 h-3.5 ml-1 text-white/50" aria-label="info" title={tip}/>
    </span>
  );
}

/* ---------------------- Measured chart frame (loop-safe) ---------------- */
function MeasuredChart({
  active,height=320,className="",children
}:{active:boolean;height?:number;className?:string;children:(dims:{width:number;height:number})=>React.ReactNode;}){
  const ref=useRef<HTMLDivElement|null>(null);
  const [width,setWidth]=useState(0);
  const lastWidthRef=useRef(0);

  useEffect(()=>{
    const el=ref.current;
    if(!el)return;
    el.style.minWidth="0";
    const ro=new ResizeObserver((entries)=>{
      for(const e of entries){
        const w=Math.floor(e.contentRect.width);
        if(w!==lastWidthRef.current){
          lastWidthRef.current=w;
          requestAnimationFrame(()=>setWidth(w));
        }
      }
    });
    ro.observe(el);
    return()=>ro.disconnect();
  },[]);

  const canRender=active&&width>10;

  return(
    <div
      ref={ref}
      className={`w-full min-w-0 rounded-2xl bg-white/5 border border-white/10 p-2 ${className}`}
      style={{height,minHeight:height,overflow:"hidden"}}
      data-testid="measured-chart"
    >
      {canRender?children({width:Math.max(0,width-8),height:height-8}):(
        <div className="h-full grid place-items-center text-sm opacity-70">
          {!active?"Hidden (activate tab to render)":"Measuring…"}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Page ---------------------------------- */
export default function ChildReports(){
  const location=useLocation();

  const [activeTab,setActiveTab]=useState<"progress"|"feed"|"memories">("progress");

  const [legacyUid,setLegacyUid]=useState<string>("");
  const [canonicalId,setCanonicalId]=useState<string>("");
  const [childName,setChildName]=useState<string>("");

  const [wallet,setWallet]=useState<ChildWallet|null>(null);               // canonical wallet
  const [walletBreakdown,setWalletBreakdown]=useState<WalletBreakdown>({
    daily:0,
    checklists:0,
    games:0,
    targets:0,
    wishlist:0,
    rewardEncourage:0,
    rewardRedemption:0,
    other:0,
    total:0
  });
  const [earn,setEarn]=useState<EarnBreakdown>(ZERO_BREAK);                // legacy stage breakdown

  const [ledger,setLedger]=useState<LedgerRow[]>([]);
  const [daily,setDaily]=useState<DailyRow[]>([]);
  const [loading,setLoading]=useState(false);

  // 🔍 Canonical wallet snapshot (single source of truth)
  const walletTotal=Math.max(0,Number(wallet?.total_points??0));           // == lifetime_earned_pts
  const walletAvailable=Math.max(0,Number(wallet?.available_points??0));
  const walletReserved=Math.max(0,Number(wallet?.reserved_points??0));
  const walletBalance=Math.max(0,Number(wallet?.balance_points??walletAvailable+walletReserved));
  const spentPoints=Math.max(0,Number(wallet?.spent_points??0));
  const walletRewardsTotal=walletTotal;

  // 🧮 Totals used in header (prefers canonical wallet, falls back to breakdown/stage)
  const stageTotal=Math.max(0,Number(earn.total??0));                       // e.g. 9274
  const breakdownTotal=Math.max(0,Number(walletBreakdown.total??0));       // from wallet breakdown helper
  const totalPointsEarned=Math.max(walletTotal,breakdownTotal,stageTotal); // final "Total pts"

  const totalSpent=spentPoints;
  const availableForCashOut=Math.max(0,totalPointsEarned-totalSpent);
  const balance=availableForCashOut;

  // Breakdown introspection (where does the "extra" sit?)
  const visibleBucketsTotal=
    Math.max(0,Number(walletBreakdown.daily??0))+
    Math.max(0,Number(walletBreakdown.checklists??0))+
    Math.max(0,Number(walletBreakdown.games??0))+
    Math.max(0,Number(walletBreakdown.targets??0))+
    Math.max(0,Number(walletBreakdown.wishlist??0))+
    Math.max(0,Number(walletBreakdown.rewardEncourage??0))+
    Math.max(0,Number(walletBreakdown.rewardRedemption??0));

  const otherOrAdjust=Math.max(0,Number(walletBreakdown.other??0));
  const deltaWalletVsBreakdown=walletTotal-breakdownTotal;
  const walletMinusStage=Math.max(0,walletTotal-stageTotal);               // this is your 1,217-style delta

  // Memories state
  const [memLoading,setMemLoading]=useState(false);
  const [memories,setMemories]=useState<MemoryItem[]>([]);
  const fileRef=useRef<HTMLInputElement>(null);

  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);
  const idsRef=useRef<string>("");
  const refreshTimer=useRef<number|null>(null);

  async function debouncedWalletRefresh(){
    if(refreshTimer.current)window.clearTimeout(refreshTimer.current);
    refreshTimer.current=window.setTimeout(async()=>{
      if(!canonicalId)return;
      try{
        const w=await fetchChildWallet(canonicalId);
        setWallet(w);
        const bd=await fetchChildWalletBreakdown(canonicalId);
        setWalletBreakdown(bd);
      }catch(e){
        console.warn("[ChildReports.debouncedWalletRefresh]",e);
      }
    },250);
  }
  function cleanupChannel(){
    try{channelRef.current?.unsubscribe();}catch{}
    channelRef.current=null;
  }
  function subscribeRealtime(ids:{legacyUid:string;canonicalId:string}){
    const sig=`${ids.legacyUid}|${ids.canonicalId}`;
    if(idsRef.current===sig&&channelRef.current)return;
    idsRef.current=sig;

    cleanupChannel();
    const ch=supabase.channel(`reports:${ids.canonicalId}`);

    ch.on(
      "postgres_changes",
      {event:"*",schema:"public",table:"points_ledger",filter:`child_uid=eq.${ids.legacyUid}`},
      ()=>{void debouncedWalletRefresh();}
    );
    if(ids.canonicalId!==ids.legacyUid){
      ch.on(
        "postgres_changes",
        {event:"*",schema:"public",table:"points_ledger",filter:`child_uid=eq.${ids.canonicalId}`},
        ()=>{void debouncedWalletRefresh();}
      );
    }
    ch.on(
      "postgres_changes",
      {event:"*",schema:"public",table:"reward_offers",filter:`child_uid=eq.${ids.canonicalId}`},
      ()=>{void debouncedWalletRefresh();}
    );
    if(ids.canonicalId!==ids.legacyUid){
      ch.on(
        "postgres_changes",
        {event:"*",schema:"public",table:"reward_offers",filter:`child_uid=eq.${ids.legacyUid}`},
        ()=>{void debouncedWalletRefresh();}
      );
    }
    ch.on(
      "postgres_changes",
      {event:"*",schema:"public",table:"daily_activity_submissions",filter:`child_uid=eq.${ids.canonicalId}`},
      ()=>{}
    );
    if(ids.canonicalId!==ids.legacyUid){
      ch.on(
        "postgres_changes",
        {event:"*",schema:"public",table:"daily_activity_submissions",filter:`child_uid=eq.${ids.legacyUid}`},
        ()=>{}
      );
    }

    ch.subscribe();
    channelRef.current=ch;
  }

  async function refreshAllFromSession(opts?:{silent?:boolean}){
    const fromUrl=childFromQuery(location.search);
    const key=fromUrl||readChildKeyFromStorage()||"";
    if(!key){
      if(!opts?.silent){
        setLegacyUid("");setCanonicalId("");
        setWallet(null);
        setWalletBreakdown({
          daily:0,
          checklists:0,
          games:0,
          targets:0,
          wishlist:0,
          rewardEncourage:0,
          rewardRedemption:0,
          other:0,
          total:0
        });
        setLedger([]);setDaily([]);setEarn(ZERO_BREAK);
        toast.error("We couldn't find your session. Please log in.");
      }
      return;
    }
    await refreshAll(key,opts);
  }

  async function refreshAll(raw:string,opts?:{silent?:boolean}){
    if(!raw)return;
    if(!opts?.silent)setLoading(true);
    try{
      let legacy="",canonical="";

      // Prefer Child Brief (same as earnings)
      try{
        const brief=await fetchChildBrief(raw);
        legacy=cleanUuid((brief as any)?.child_uid||(brief as any)?.legacy_uid||raw);
        canonical=cleanUuid((brief as any)?.id||(brief as any)?.canonical_id||legacy);
      }catch{
        const ids=await resolveChildIds(raw);
        if(!ids)throw new Error("Child not found for this session.");
        legacy=ids.legacyUid;
        canonical=ids.canonicalId;
      }

      setLegacyUid((prev)=>(prev===legacy?prev:legacy));
      setCanonicalId((prev)=>(prev===canonical?prev:canonical));
      subscribeRealtime({legacyUid:legacy,canonicalId:canonical});

      try{
        const {data:profile}=await supabase
          .from("child_profiles")
          .select("first_name, nick_name")
          .eq("id",canonical)
          .maybeSingle();
        const nm=profile?.nick_name||profile?.first_name||"Child";
        setChildName((prev)=>(prev===nm?prev:nm));
      }catch{
        setChildName((prev)=>(prev||"Child"));
      }

      // Canonical wallet snapshot (single source of truth)
      const w=await fetchChildWallet(canonical);
      setWallet(w);

      // Ledger + daily
      const ledgerData=await fetchLedgerData(legacy,canonical);
      setLedger(ledgerData);
      const dailyData=await fetchDailyData(legacy);
      setDaily(dailyData);

      // Lifetime earnings breakdown from same logic as ChildEarnings (stage-style)
      const ids=Array.from(new Set([canonical,legacy].filter(Boolean))) as string[];
      const encourageFromLedger=await fetchEncouragePoints(ids);
      const redemptionOverride=Math.max(0,Number(w?.reserved_points??0));
      const legacyBreakdown=await buildBreakdown(
        ids,
        canonical,
        legacy,
        encourageFromLedger>0?encourageFromLedger:undefined,
        redemptionOverride>0?redemptionOverride:undefined
      );
      setEarn(legacyBreakdown);

      // Wallet breakdown (authoritative, including "other")
      try{
        const bd=await fetchChildWalletBreakdown(canonical);
        setWalletBreakdown(bd);
      }catch(e){
        console.warn("[ChildReports.refreshAll] fetchChildWalletBreakdown failed",e);
        setWalletBreakdown({
          daily:0,
          checklists:0,
          games:0,
          targets:0,
          wishlist:0,
          rewardEncourage:0,
          rewardRedemption:0,
          other:0,
          total:0
        });
      }

      // Auto-load gallery if already on tab
      if(activeTab==="memories"){
        void loadMemories(canonical);
      }

    }catch(err:any){
      console.error("[Reports refreshAll]",err);
      if(!opts?.silent)toast.error(err?.message||"Error loading reports");
      setWallet(null);
      setWalletBreakdown({
        daily:0,
        checklists:0,
        games:0,
        targets:0,
        wishlist:0,
        rewardEncourage:0,
        rewardRedemption:0,
        other:0,
        total:0
      });
      setLedger([]);setDaily([]);setEarn(ZERO_BREAK);
    }finally{
      if(!opts?.silent)setLoading(false);
    }
  }

  async function fetchLedgerData(legacyChildUid:string,canonicalId:string):Promise<LedgerRow[]>{
    try{
      const res=await supabase.rpc("api_child_ledger",{p_child_uid:legacyChildUid});
      if(!res.error&&Array.isArray(res.data)){
        return (res.data as any[]).map((r,i)=>({
          id:r.id??i,
          child_uid:r.child_uid??legacyChildUid,
          delta:Number(r.delta??r.points??0),
          reason:r.reason??null,
          created_at:r.created_at??r.occurred_at??new Date().toISOString()
        }));
      }
    }catch{}
    const q=await supabase
      .from("points_ledger")
      .select("id,child_uid,delta,reason,created_at")
      .in("child_uid",[legacyChildUid,canonicalId])
      .order("created_at",{ascending:false})
      .limit(50);
    if(q.error)return[];
    const rows=(q.data||[])as any[];
    return rows.map((r)=>({
      id:r.id,
      child_uid:r.child_uid,
      delta:Number(r.delta??0),
      reason:r.reason??null,
      created_at:r.created_at
    }))as LedgerRow[];
  }

  async function fetchDailyData(legacyChildUid:string):Promise<DailyRow[]>{
    const {data,error}=await supabase.rpc("api_child_daily",{p_child_uid:legacyChildUid,p_days:60});
    if(error){
      console.warn("[fetchDailyData] api_child_daily error:",error);
      return[];
    }
    return (data??[]).map((d:any)=>({
      ...d,
      total_points:Number(d?.total_points??0)
    }))as DailyRow[];
  }

  useEffect(()=>{
    void refreshAllFromSession();
    return()=>{
      cleanupChannel();
      if(refreshTimer.current)window.clearTimeout(refreshTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    function onVis(){
      if(document.visibilityState!=="visible"||!legacyUid)return;
      void refreshAllFromSession({silent:true});
    }
    window.addEventListener("focus",onVis);
    document.addEventListener("visibilitychange",onVis);
    return()=>{
      window.removeEventListener("focus",onVis);
      document.removeEventListener("visibilitychange",onVis);
    };
  },[legacyUid,location.search]);

  /* ------------------------------ Memories ------------------------------ */
  async function loadMemories(childId:string){
    if(!childId)return;
    setMemLoading(true);
    try{
      const folder=`${childId}`;
      const {data:list,error}=await supabase.storage
        .from("memories")
        .list(folder,{limit:200,offset:0,sortBy:{column:"created_at",order:"desc"}});
      if(error)throw error;
      const items=list||[];
      const signed=await Promise.all(items.map(async(it)=>{
        const path=`${folder}/${it.name}`;
        try{
          const {data}=await supabase.storage
            .from("memories")
            .createSignedUrl(path,3600);
          return{
            path,
            name:it.name,
            url:data?.signedUrl||null,
            createdAt:(it as any).created_at||null
          }as MemoryItem;
        }catch{
          return{path,name:it.name,url:null}as MemoryItem;
        }
      }));
      setMemories(signed);
    }catch(err:any){
      console.warn("[memories] list error",err);
      toast.error("Couldn't load gallery.");
    }finally{
      setMemLoading(false);
    }
  }

  async function uploadMemories(files:FileList|null){
    if(!files||!canonicalId){
      toast.error("No files or child id.");
      return;
    }
    setMemLoading(true);
    try{
      const up=Array.from(files).slice(0,20);
      const folder=`${canonicalId}`;
      for(const f of up){
        const safeName=f.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        const key=`${folder}/${Date.now()}-${safeName}`;
        const {error}=await supabase.storage
          .from("memories")
          .upload(key,f,{upsert:false,cacheControl:"3600"});
        if(error){
          console.warn("upload error",error);
          continue;
        }
        try{
          await supabase
            .from("child_memories")
            .insert({child_id:canonicalId,file_path:key,file_name:safeName});
        }catch{}
      }
      toast.success("Upload complete!");
      await loadMemories(canonicalId);
      setActiveTab("memories");
    }catch(err:any){
      console.error("uploadMemories",err);
      toast.error("Upload failed.");
    }finally{
      setMemLoading(false);
    }
  }

  function onClickUpload(){
    if(!canonicalId){
      toast.error("Missing child id");
      return;
    }
    fileRef.current?.click();
  }
  async function onClickView(){
    setActiveTab("memories");
    await loadMemories(canonicalId);
  }

  /* ------------------------------ Derived ------------------------------- */
  const ts=useMemo(()=>{
    const map=new Map<string,{date:string;earned:number;daily:number}>();
    for(const row of ledger){
      const d=new Date(row.created_at).toISOString().slice(0,10);
      const prev=map.get(d)||{date:d,earned:0,daily:0};
      prev.earned+=Number(row.delta||0);
      map.set(d,prev);
    }
    for(const row of daily){
      const d=(row.activity_date||"").slice(0,10);
      const prev=map.get(d)||{date:d,earned:0,daily:0};
      prev.daily+=Number(row.total_points||0);
      map.set(d,prev);
    }
    return Array.from(map.values())
      .sort((a,b)=>a.date.localeCompare(b.date))
      .slice(-30);
  },[ledger,daily]);

  const feedTotals=useMemo(()=>{
    const totalPoints=
      ledger.reduce((s,r)=>s+Number(r.delta||0),0)+
      daily.reduce((s,d)=>s+Number(d.total_points||0),0);
    const totalCompletions=daily.length;
    return{totalPoints,totalCompletions,withEvidenceCount:0,quickCompleteCount:0};
  },[ledger,daily]);

  const submissionsForApproval=useMemo(()=>{
    return daily.filter((d)=>{
      const s=(d.status||"").toLowerCase();
      return s==="pending"||s==="submitted"||!s;
    }).length;
  },[daily]);

  const walletData=[
    {name:"Total pts",value:totalPointsEarned,color:"#10b981"},
    {name:"Total Spent",value:totalSpent,color:"#ef4444"},
    {name:"Available for cash-out",value:availableForCashOut,color:"#8b5cf6"},
    otherOrAdjust>0?{name:"Other / Adjustments",value:otherOrAdjust,color:"#f97316"}:null
  ].filter((i)=>i&&i.value>0) as {name:string;value:number;color:string}[];

  function getAchievementIcon(index:number){
    const icons=[Trophy,Star,Award,Zap,TargetIcon,Sparkles];
    return icons[index%icons.length];
  }

  const recentAchievements=useMemo(()=>{
    return[...ledger].reverse().slice(0,12).map((r,index)=>({
      ...r,
      delta:Number(r.delta||0),
      icon:getAchievementIcon(index),
      color:COLORS[index%COLORS.length]
    }));
  },[ledger]);

  function getMotivationalMessage(){
    if(availableForCashOut>=1000)return"You're a Super-Star! 🌟";
    if(availableForCashOut>=500)return"Amazing progress! 🚀";
    if(availableForCashOut>=100)return"Great work! Keep going! 💪";
    return"Every small step counts! 🌈";
  }

  const [previewPts,setPreviewPts]=useState<number>(0);
  const afterAccept=useMemo(
    ()=>Math.max(0,availableForCashOut-Math.max(0,Math.floor(previewPts||0))),
    [availableForCashOut,previewPts]
  );

  /* --------------------------------- UI --------------------------------- */
  const [tmp,setTmp]=useState("");
  if(!legacyUid){
    return(
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-white">We couldn't find your session.</h2>
          <p className="text-white/70">
            Please log in first so we can show your Super-Star report.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              asChild
              className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
            >
              <Link to="/child/login">Go to Child Login</Link>
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
            <input
              className="flex-1 px-3 py-2 rounded bg-white/10 border border-white/20 text-white text-sm"
              placeholder="Paste child UUID or legacy uid…"
              value={tmp}
              onChange={(e)=>setTmp(e.target.value)}
            />
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-sm"
              onClick={()=>{
                const v=(tmp||"").trim();
                if(!v)return toast.error("Please paste a child id or uid.");
                try{
                  sessionStorage.setItem("child_uid",v);
                  localStorage.setItem("child_portal_child_id",v);
                  localStorage.setItem("LS_CHILD",JSON.stringify({id:v,child_uid:v}));
                }catch{}
                toast.success("Child context set. Loading…");
                setTimeout(()=>{
                  window.location.assign(
                    `/child/reports?child=${encodeURIComponent(v)}`
                  );
                },50);
              }}
            >
              Load
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div className="space-y-6 min-w-0" data-testid="reports-root">
      {/* hidden uploader */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,video/*,audio/*"
        onChange={(e)=>uploadMemories(e.currentTarget.files)}
      />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
            {childName}'s Super-Star Report ✨
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={()=>refreshAllFromSession()}
            disabled={loading}
            className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white"
          >
            {loading?"Refreshing...":"Refresh"}
          </Button>
        </div>
      </div>

      {/* Motivation */}
      <p className="text-white/70">{getMotivationalMessage()}</p>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
        {/* Available */}
        <div className="rounded-2xl p-4 border border-white/20 bg-white/5 hover-lift">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-bold text-emerald-300">{nice(availableForCashOut)}</div>
              <div className="text-white/70 text-sm">
                Available
                <InfoBadge tip={"Available for cash-out = Total pts − Total Spent (lifetime) (single source of truth)"} />
              </div>
              <div className="text-xs text-emerald-300/80 mt-1">Ready to spend! 🎁</div>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-300">
              <Gift className="w-6 h-6"/>
            </div>
          </div>
        </div>

        {/* Submissions for approval */}
        <div className="rounded-2xl p-4 border border-white/20 bg-white/5 hover-lift">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-bold text-amber-300">{nice(submissionsForApproval)}</div>
              <div className="text-white/70 text-sm">
                Submissions for approval
              </div>
              <div className="text-xs text-amber-300/80 mt-1">
                Waiting for grown-up review ⏳
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-300">
              <Clock className="w-6 h-6"/>
            </div>
          </div>
        </div>

        {/* Balance / Lifetime earned */}
        <div className="rounded-2xl p-4 border border-white/20 bg-white/5 hover-lift">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-bold text-purple-300">{nice(balance)}</div>
              <div className="text-white/70 text-sm">
                Balance
                <InfoBadge tip={"Balance = Total pts − Total Spent (same as Available for cash-out)"} />
              </div>
              <div className="text-xs text-purple-300/80 mt-1">Your super-power! ⚡</div>
              <div className="text-[11px] text-white/50 mt-2">
                Rewards Total:{" "}
                <span className="text-white/70">{nice(totalPointsEarned)}</span> pts{" "}
                • Spent:{" "}
                <span className="text-white/70">{nice(totalSpent)}</span> pts
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-300">
              <Zap className="w-6 h-6"/>
            </div>
          </div>
        </div>
      </div>

      {/* Lifetime formula summary: Total pts − Total Spent = Available for cash-out */}
      <div className="rounded-2xl p-4 border border-white/20 bg-white/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="text-white/80 text-sm max-w-md">
            <span className="font-semibold">Total Points Summary</span>{" "}
            <span className="text-white/60">
              (single source of truth: canonical wallet → Total pts − Total Spent = Available for cash-out)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto text-sm">
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/60 text-[11px] uppercase tracking-wide">
                Total pts
              </div>
              <div className="text-emerald-300 font-semibold text-lg">
                {nice(totalPointsEarned)}{" "}<span className="text-xs">pts</span>
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/60 text-[11px] uppercase tracking-wide">
                Total Spent
              </div>
              <div className="text-rose-300 font-semibold text-lg">
                {nice(totalSpent)}{" "}<span className="text-xs">pts</span>
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/60 text-[11px] uppercase tracking-wide">
                Available for cash-out
              </div>
              <div className="text-sky-300 font-semibold text-lg">
                {nice(availableForCashOut)}{" "}<span className="text-xs">pts</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Accept preview */}
      <div className="rounded-2xl p-4 border border-white/20 bg-white/5">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="text-white/80 text-sm">
            <span className="font-medium">Accept Preview</span>{" "}
            <span className="text-white/60">
              (see how accepting a reward/cash-out would change Available)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end w-full md:w-auto">
            <div>
              <label className="block text-xs text-white/60 mb-1">
                Available (now)
              </label>
              <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-white">
                {availableForCashOut} pts
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">
                Points to accept
              </label>
              <input
                type="number"
                min={0}
                max={Math.max(0,availableForCashOut)}
                value={previewPts}
                onChange={(e)=>{
                  const v=Math.max(0,Math.floor(Number(e.target.value||0)));
                  setPreviewPts(Math.min(v,availableForCashOut));
                }}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">
                After Accept → Available
              </label>
              <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 font-semibold">
                {availableForCashOut} − {previewPts} = {afterAccept} pts
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet breakdown vs stage buckets (shows the 1,217-style delta) */}
      <div className="rounded-2xl p-4 border border-white/20 bg-white/5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-300"/>
            <h3 className="text-sm md:text-base font-semibold text-white">
              Wallet Breakdown (where do extra points come from?)
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/60 text-[11px] uppercase tracking-wide">
                Stage-style total
              </div>
              <div className="text-white font-semibold text-base">
                {nice(stageTotal)}{" "}<span className="text-xs">pts</span>
              </div>
              <div className="text-[11px] text-white/60 mt-1">
                From My Daily + Checklists + Games + Targets + Wishlist + Reward pts.
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/60 text-[11px] uppercase tracking-wide">
                Wallet total (canonical)
              </div>
              <div className="text-emerald-300 font-semibold text-base">
                {nice(walletTotal)}{" "}<span className="text-xs">pts</span>
              </div>
              <div className="text-[11px] text-white/60 mt-1">
                Exact lifetime earned from wallet rollup (single source of truth).
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white/60 text-[11px] uppercase tracking-wide">
                Other / Adjustments
              </div>
              <div className="text-amber-300 font-semibold text-base">
                {nice(walletMinusStage)}{" "}<span className="text-xs">pts</span>
              </div>
              <div className="text-[11px] text-white/60 mt-1">
                Points not in the 6 visible stage buckets (e.g. legacy entries, manual adjustments).
              </div>
            </div>
          </div>
          <div className="text-[11px] text-white/60">
            Check: Stage total{" "}
            <span className="text-white/80">{nice(stageTotal)}</span>{" "}
            + Other/Adjustments{" "}
            <span className="text-white/80">{nice(walletMinusStage)}</span>{" "}
            = Wallet total{" "}
            <span className="text-white/80">{nice(walletTotal)}</span>.
          </div>
        </div>
      </div>

      {/* Main Content (Tabs) */}
      <div
        className="rounded-2xl border border-white/20 overflow-hidden bg-white/5 min-w-0"
        data-testid="reports-charts"
      >
        <Tabs
          defaultValue="progress"
          className="w-full min-w-0"
          onValueChange={async(v)=>{
            setActiveTab(v as typeof activeTab);
            if(v==="memories"){
              await loadMemories(canonicalId);
            }
          }}
        >
          <TabsList className="grid w-full grid-cols-3 p-2 bg-white/5">
            <TabsTrigger
              value="progress"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-600"
            >
              <TrendingUp className="w-4 h-4"/>
              <span>Progress</span>
            </TabsTrigger>
            <TabsTrigger
              value="feed"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-600"
            >
              <Trophy className="w-4 h-4"/>
              <span>Achievements</span>
            </TabsTrigger>
            <TabsTrigger
              value="memories"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-600"
            >
              <Camera className="w-4 h-4"/>
              <span>Memories</span>
            </TabsTrigger>
          </TabsList>

          {/* Progress Tab */}
          <TabsContent value="progress" className="p-6 space-y-6 min-w-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-w-0">
              <div className="space-y-4 min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-300"/>
                  <h3 className="text-lg font-semibold text-white">
                    Points Over Time
                  </h3>
                </div>
                <MeasuredChart active={activeTab==="progress"} height={320}>
                  {({width,height})=>(
                    <LineChart
                      data={ts}
                      width={width}
                      height={height}
                      margin={{top:8,right:12,left:0,bottom:8}}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                      <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12}/>
                      <YAxis stroke="#9CA3AF" fontSize={12}/>
                      <Tooltip
                        contentStyle={{
                          backgroundColor:"rgba(17, 24, 39, 0.9)",
                          border:"1px solid rgba(255,255,255,0.1)",
                          borderRadius:"8px",
                          color:"white"
                        }}
                      />
                      <Legend/>
                      <Line
                        type="monotone"
                        dataKey="earned"
                        name="Points Earned"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{r:2}}
                      />
                      <Line
                        type="monotone"
                        dataKey="daily"
                        name="Daily Activities"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{r:2}}
                      />
                    </LineChart>
                  )}
                </MeasuredChart>
              </div>

              <div className="space-y-4 min-w-0">
                <div className="flex items-center gap-2">
                  <TargetIcon className="w-5 h-5 text-blue-300"/>
                  <h3 className="text-lg font-semibold text-white">
                    Points Distribution
                  </h3>
                </div>
                <MeasuredChart active={activeTab==="progress"} height={320}>
                  {({width,height})=>(
                    <PieChart width={width} height={height}>
                      <Pie
                        data={walletData}
                        cx={width/2}
                        cy={height/2}
                        labelLine={false}
                        label={({name,percent})=>
                          `${name} ${(percent*100).toFixed(0)}%`
                        }
                        outerRadius={Math.min(width,height)/3}
                        innerRadius={Math.min(width,height)/6}
                        dataKey="value"
                      >
                        {walletData.map((entry,index)=>(
                          <Cell key={`cell-${index}`} fill={entry.color}/>
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor:"rgba(17, 24, 39, 0.9)",
                          border:"1px solid rgba(255,255,255,0.1)",
                          borderRadius:"8px",
                          color:"white"
                        }}
                      />
                    </PieChart>
                  )}
                </MeasuredChart>
              </div>
            </div>

            <div className="space-y-4 min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-300"/>
                <h3 className="text-lg font-semibold text-white">
                  Points Summary
                </h3>
              </div>
              <MeasuredChart active={activeTab==="progress"} height={320}>
                {({width,height})=>(
                  <BarChart
                    width={width}
                    height={height}
                    data={[{label:"Lifetime",total:totalPointsEarned,spent:totalSpent,available:availableForCashOut}]}
                    margin={{top:8,right:12,left:0,bottom:8}}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                    <XAxis dataKey="label" stroke="#9CA3AF" fontSize={12}/>
                    <YAxis stroke="#9CA3AF" fontSize={12}/>
                    <Tooltip
                      contentStyle={{
                        backgroundColor:"rgba(17, 24, 39, 0.9)",
                        border:"1px solid rgba(255,255,255,0.1)",
                        borderRadius:"8px",
                        color:"white"
                      }}
                    />
                    <Legend/>
                    <Bar
                      dataKey="total"
                      name="Total pts"
                      fill="#10b981"
                    />
                    <Bar
                      dataKey="spent"
                      name="Total Spent"
                      fill="#ef4444"
                    />
                    <Bar
                      dataKey="available"
                      name="Available for cash-out"
                      fill="#8b5cf6"
                    />
                  </BarChart>
                )}
              </MeasuredChart>
            </div>
          </TabsContent>

          {/* Feed Tab */}
          <TabsContent value="feed" className="p-6 space-y-6 min-w-0">
            {/* headline line: +pts & submissions */}
            <div className="rounded-2xl p-3 border border-white/10 bg-white/5 text-sm text-white/80">
              +{nice(feedTotals.totalPoints)} pts{" "}
              <span className="font-semibold">Total Points</span>{" "}
              and{" "}
              <span className="font-semibold">
                {nice(submissionsForApproval)}
              </span>{" "}
              Submissions for approval
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
                <div className="text-lg font-bold text-emerald-300">
                  {nice(submissionsForApproval)}
                </div>
                <div className="text-white/60 text-xs">Submissions for approval</div>
              </div>
              <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
                <div className="text-lg font-bold text-yellow-300">
                  +{nice(feedTotals.totalPoints)}
                  <span className="text-white/50 text-[10px] align-middle">
                    {" "}
                    pts
                  </span>
                </div>
                <div className="text-white/60 text-xs">Total Points (feed)</div>
              </div>
              <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
                <div className="text-lg font-bold text-blue-300">0</div>
                <div className="text-white/60 text-xs">With Evidence</div>
              </div>
              <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
                <div className="text-lg font-bold text-rose-300">0</div>
                <div className="text-white/60 text-xs">Quick Complete</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="w-5 h-5 text-yellow-300"/>
                  <h3 className="text-lg font-semibold text-white">
                    Recent Achievements
                  </h3>
                </div>
                {recentAchievements.length===0?(
                  <div className="rounded-2xl p-8 text-center border border-white/10 bg-white/5">
                    <div className="text-4xl mb-3">🌟</div>
                    <p className="text-white/70 mb-2">No achievements yet</p>
                    <p className="text-white/50 text-sm">
                      Complete some activities to earn points!
                    </p>
                  </div>
                ):(
                  <div className="space-y-3">
                    {recentAchievements.map((achievement)=>{
                      const IconComponent=achievement.icon;
                      return(
                        <div
                          key={String(achievement.id)}
                          className="rounded-2xl p-4 border border-white/10 bg-white/5 hover-lift transition-all duration-200"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="p-2 rounded-xl text-white"
                              style={{backgroundColor:`${achievement.color}20`}}
                            >
                              <IconComponent
                                className="w-4 h-4"
                                style={{color:achievement.color}}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium break-words">
                                {achievement.reason||"You earned points!"}
                              </p>
                              <p className="text-white/60 text-sm mt-1">
                                {new Date(
                                  achievement.created_at
                                ).toLocaleDateString()}{" "}
                                • +{nice(achievement.delta)} pts
                              </p>
                            </div>
                            <div
                              className="px-2 py-1 rounded-full text-xs font-bold text-white"
                              style={{backgroundColor:achievement.color}}
                            >
                              +{nice(achievement.delta)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-green-300"/>
                  <h3 className="text-lg font-semibold text-white">
                    Daily Activity Summary
                  </h3>
                </div>
                {daily.length===0?(
                  <div className="rounded-2xl p-8 text-center border border-white/10 bg-white/5">
                    <div className="text-4xl mb-3">📅</div>
                    <p className="text-white/70 mb-2">
                      No daily activities yet
                    </p>
                    <p className="text-white/50 text-sm">
                      Start tracking your daily progress!
                    </p>
                  </div>
                ):(
                  <div className="space-y-3">
                    {daily
                      .slice(-5)
                      .reverse()
                      .map((day)=>(
                        <div
                          key={day.id}
                          className="rounded-2xl p-4 border border-white/10 bg-white/5"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium">
                                {new Date(
                                  day.activity_date
                                ).toLocaleDateString()}
                              </p>
                              <p className="text-white/60 text-sm mt-1">
                                Status: {day.status||"Submitted"}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-emerald-300">
                                +{nice(day.total_points)}
                              </div>
                              <div className="text-xs text-white/60">
                                points
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Memories Tab */}
          <TabsContent value="memories" className="p-8 min-w-0">
            <div className="text-center py-10">
              <div className="text-6xl mb-4">📸</div>
              <h3 className="text-2xl font-bold text-white mb-3">
                Your Memory Gallery
              </h3>
              <p className="text-white/70 mb-6 max-w-prose mx-auto">
                Share photos or proof links from your activities and we'll
                create an amazing timeline scrapbook of your achievements!
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={onClickUpload}
                  disabled={memLoading}
                  className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white"
                >
                  <Camera className="w-4 h-4 mr-2"/>
                  {memLoading?"Uploading…":"Upload Memories"}
                </Button>
                <Button
                  onClick={onClickView}
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <Heart className="w-4 h-4 mr-2"/>
                  View Gallery
                </Button>
              </div>

              {/* Gallery grid */}
              <div className="mt-10">
                {memLoading&&(
                  <div className="text-white/70 mb-4">Loading…</div>
                )}
                {!memLoading&&memories.length===0?(
                  <div className="text-white/60">No memories yet.</div>
                ):(
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {memories.map((m)=>(
                      <a
                        key={m.path}
                        href={m.url??"#"}
                        target="_blank"
                        rel="noreferrer"
                        className="group block rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 transition"
                        title={m.name}
                      >
                        {/\.(mp4|webm|mov|m4v)$/i.test(m.name)?(
                          <div className="aspect-video grid place-items-center text-white/80 text-sm">
                            🎬 Video
                          </div>
                        ):/\.(mp3|wav|ogg|m4a)$/i.test(m.name)?(
                          <div className="aspect-video grid place-items-center text-white/80 text-sm">
                            🔊 Audio
                          </div>
                        ):(
                          <img
                            src={m.url??""}
                            alt={m.name}
                            className="w-full h-full object-cover aspect-square"
                          />
                        )}
                        <div className="px-2 py-1 text-xs text-white/60 truncate">
                          {m.name}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 min-w-0">
        <div className="rounded-2xl p-6 border border-white/20 text-center hover-lift bg-white/5">
          <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white inline-block mb-4">
            <TargetIcon className="w-6 h-6"/>
          </div>
          <h3 className="text-white font-semibold mb-2">Try New Targets</h3>
          <p className="text-white/70 text-sm mb-4">
            Pick something fun to earn more points today!
          </p>
          <Button
            asChild
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white"
          >
            <Link to="/child">Go to Dashboard</Link>
          </Button>
        </div>

        <div className="rounded-2xl p-6 border border-white/20 text-center hover-lift bg-white/5">
          <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 text-white inline-block mb-4">
            <Gift className="w-6 h-6"/>
          </div>
          <h3 className="text-white font-semibold mb-2">Open Checklists</h3>
          <p className="text-white/70 text-sm mb-4">
            Knock out items and rack up points ✅
          </p>
          <Button
            asChild
            variant="outline"
            className="w-full border-white/20 text-white hover:bg-white/10"
          >
            <Link to="/child/checklists">Go to Checklists</Link>
          </Button>
        </div>

        <div className="rounded-2xl p-6 border border-white/20 text-center hover-lift bg-white/5">
          <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white inline-block mb-4">
            <Zap className="w-6 h-6"/>
          </div>
          <h3 className="text-white font-semibold mb-2">Log Daily Activity</h3>
          <p className="text-white/70 text-sm mb-4">
            Tiny wins add up to big achievements! 🔥
          </p>
          <Button
            asChild
            variant="outline"
            className="w-full border-white/20 text-white hover:bg-white/10"
          >
            <Link to="/child/daily-activity">Daily Activity</Link>
          </Button>
        </div>
      </div>

      {/* Debug info */}
      {process.env.NODE_ENV==="development"&&(legacyUid||canonicalId)&&(
        <details className="text-xs text-white/70">
          <summary className="cursor-pointer">Debug Info</summary>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="p-2 rounded bg-white/5 border border-white/10">
              <div>
                <strong>legacyUid:</strong> {legacyUid}
              </div>
              <div>
                <strong>canonicalId:</strong> {canonicalId}
              </div>
            </div>
            <div className="p-2 rounded bg-white/5 border border-white/10">
              <div>
                <strong>Stage breakdown total (earn.total):</strong> {stageTotal}
              </div>
              <div>
                <strong>walletBreakdown.total:</strong> {breakdownTotal}
              </div>
              <div>
                <strong>Visible buckets (no &quot;other&quot;):</strong> {visibleBucketsTotal}
              </div>
              <div>
                <strong>Other / Adjustments (walletBreakdown.other):</strong> {otherOrAdjust}
              </div>
              <div>
                <strong>Δ wallet.total_points − walletBreakdown.total:</strong> {deltaWalletVsBreakdown}
              </div>
              <div>
                <strong>Wallet − Stage (extra pts):</strong> {walletMinusStage}
              </div>
            </div>
            <div className="p-2 rounded bg-white/5 border border-white/10">
              <div>
                <strong>Canonical wallet.total_points:</strong> {walletTotal}
              </div>
              <div>
                <strong>Final totalPointsEarned (header):</strong> {totalPointsEarned}
              </div>
              <div>
                <strong>Total Spent (wallet.spent_points):</strong> {totalSpent}
              </div>
              <div>
                <strong>Available for cash-out (header):</strong> {availableForCashOut}
              </div>
              <div>
                <strong>wallet.available_points (raw):</strong> {walletAvailable}
              </div>
              <div>
                <strong>wallet.balance_points (raw):</strong> {walletBalance}
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
