import React,{useEffect,useMemo,useRef,useState}from "react";
import type {ReactNode}from "react";
import {supabase}from "@/lib/supabase";
import {tpromise}from "@/utils/toastx";
import {toast}from "sonner";
import {fetchChildBrief}from "@/utils/childAuth";
import {
  Coins,CheckCircle2,Clock,BadgeDollarSign,Loader2,
  PiggyBank,Gift,Target,Sparkles,Star,Trophy,Gamepad2,
  ListChecks,HeartHandshake,Info,ShieldCheck
}from "lucide-react";
import {isGameReason}from "./useChildPointsRollup";
import {
  fetchChildWalletSummary,
  reservedPointsForChild,
  type ChildWalletSummary
}from "@/data/wallet";

/** ---------------- Config: conversion + minimums ---------------- */
const POINTS_PER_DOLLAR=200;
const FIXED_RATE=1/POINTS_PER_DOLLAR;
const MIN_CASH=10;
const MIN_POINTS=Math.ceil(MIN_CASH*POINTS_PER_DOLLAR);

/** ---------------- Types ---------------- */
type Status="Requested"|"Approved"|"Rejected"|"Accepted"|"Fulfilled"|"Cancelled";

type Req={
  id:string;
  child_uid:string;
  requested_points:number;
  cad_per_point:number;
  currency_cents:number;
  note:string|null;
  status:Status;
  requested_at:string;
  decided_at:string|null;
  decided_by:string|null;
  accepted_at:string|null;
  fulfilled_at:string|null;
};

const ALL:"All"="All";
type FilterKey=Status|"All";
const FILTERS:FilterKey[]=[ALL,"Requested","Approved","Accepted","Fulfilled","Rejected","Cancelled"];

const cleanUuid=(s?:string|null)=>(s||"").toLowerCase().replace(/[^0-9a-f-]/g,"");

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

/** Small audio helper for heads-up toasts */
function playSound(kind:"info"|"success"|"warning"|"error"="info"){
  const candidates:Record<string,string[]>={
    info:["/sounds/notify-info.wav","/audio/notify-info.wav"],
    success:["/sounds/notify-success.wav","/audio/notify-success.wav"],
    warning:["/sounds/notify-warning.wav","/audio/notify-warning.wav"],
    error:["/sounds/notify-error.wav","/audio/notify-error.wav"],
  };
  const list=candidates[kind]||candidates.info;
  for(const src of list){
    try{
      const a=new Audio(src);
      a.volume=0.6;
      a.play().catch(()=>{});
      break;
    }catch{}
  }
}

/** Classify positive ledger reasons into buckets. */
function classifyReason(reason:string){
  const r=(reason||"").toLowerCase();

  if(isGameReason(reason))return "games";

  if(r.includes("daily activity"))return "daily";
  if(r.includes("checklist"))return "checklists";
  if(r.includes("target"))return "targets";
  if(r.includes("wishlist")||r.includes("wish"))return "wishlist";

  // Dedicated reward buckets:
  // Reward pts = Encourage + Redemption
  if(
    r.includes("encourage reward")||
    r.includes("encouragement reward")||
    r.startsWith("encouragement:")
  ){
    return "rewardEncourage";
  }
  if(
    r.includes("redemption reward")||
    r.startsWith("reward redemption")||
    r.startsWith("redeem reward")
  ){
    return "rewardRedemption";
  }

  // Anything else we ignore for the stage cards
  return null;
}

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

/** Pull wishlist-earned points from wishlist sources. */
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
      console.error("[ChildEarnings.fetchEncouragePoints]",error);
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
    console.log("[ChildEarnings.encouragePtsAlignedWithRewards]",{
      ids,
      rowsCount:rows.length,
      total
    });
    return total;
  }catch(e){
    console.error("[ChildEarnings.fetchEncouragePoints.ex]",e);
    return 0;
  }
}

/** Daily totals (points) from daily_activity_submissions to align with Daily Activity UI. */
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
    console.warn("[earnings.fetchDailyTotals]",e);
    // On CORS / any error: just return zero, we'll fall back to ledger bucket.
    return ZERO_DAILY;
  }
}

/** Checklist totals so Child Earnings matches the Child Checklists UI exactly. */
type ChecklistTotals={total:number;approved:number;pending:number;};
const ZERO_CHECKLIST:ChecklistTotals={total:0,approved:0,pending:0};

/**
 * Use the same sources/logic as ChildChecklists:
 *  1) api_child_active_assignments_v2(p_child_id)
 *  2) api_child_active_assignments(p_child_uid)
 *  3) checklist_assignments fallback with same status filters
 *
 * Totals:
 *  - total  = Approved + Fulfilled + Submitted
 *  - approved = Approved + Fulfilled
 *  - pending  = Submitted
 */
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
    console.warn("[earnings.fetchChecklistTotalsForChild] v2 RPC failed",e);
  }

  // 2) Fallback to legacy RPC (p_child_uid)
  if(!rows.length){
    try{
      const {data,error}=await supabase.rpc("api_child_active_assignments",{p_child_uid:childKey} as any);
      if(!error&&Array.isArray(data)&&data.length){
        rows=data as any[];
      }
    }catch(e){
      console.warn("[earnings.fetchChecklistTotalsForChild] v1 RPC failed",e);
    }
  }

  // 3) Final fallback to direct table scan (same as ChildChecklists fallback)
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
      console.warn("[earnings.fetchChecklistTotalsForChild] table fallback failed",e);
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

/** ─────────── Target / mission totals (align with ChildTargetPage) ─────────── */

type TargetReviewStatus="Pending"|"Approved"|"Rejected"|null;

type MissionTotals={approved:number;pending:number;total:number;};
const ZERO_MISSIONS:MissionTotals={approved:0,pending:0,total:0};

function normalizeMissionReviewStatus(raw:any):TargetReviewStatus{
  if(raw==null)return null;
  const s=String(raw).trim().toLowerCase();
  if(s==="approved")return "Approved";
  if(s==="pending")return "Pending";
  if(s==="rejected")return "Rejected";
  return null;
}

function deriveMissionReviewStatus(status:string,reviewRaw:any,awarded:number|null):TargetReviewStatus{
  const norm=normalizeMissionReviewStatus(reviewRaw);
  if(norm)return norm;

  if(status==="Completed"){
    if(typeof awarded==="number"&&Number.isFinite(awarded)&&awarded>0){
      return "Approved";
    }
    return "Pending";
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
    console.warn("[earnings.fetchMissionTotalsForChild]",e);
    return ZERO_MISSIONS;
  }
}

/**
 * Build a simple breakdown:
 * My Daily + My Checklists + Play Game + Completed Targets + My Wishlist + Reward pts = Total pts
 * No “Other / Bonus”, no adjustments, no reserved math.
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

    // Checklists: use same Approved+Fulfilled total as ChildChecklists header
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

    // Final Total = sum of the 6 visible stage buckets
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
    console.warn("[ChildEarnings.buildBreakdown] falling back to ZERO_BREAK",e);
    return {...ZERO_BREAK};
  }
}

/** ---------------- Component ---------------- */
export default function ChildEarnings(){
  const [childCanonical,setChildCanonical]=useState<string|null>(null);
  const [legacyId,setLegacyId]=useState<string|null>(null);
  const [walletSummary,setWalletSummary]=useState<ChildWalletSummary|null>(null);

  const [spent,setSpent]=useState(0);

  const [rate,setRate]=useState(FIXED_RATE);
  const [points,setPoints]=useState(MIN_POINTS);
  const [note,setNote]=useState("");

  const [rows,setRows]=useState<Req[]>([]);
  const [filter,setFilter]=useState<FilterKey>(ALL);
  const [loading,setLoading]=useState(true);

  const [earn,setEarn]=useState<EarnBreakdown>({...ZERO_BREAK});

  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);

  const [recentLedger,setRecentLedger]=useState<Array<{delta:number;created_at:string;reason:string|null;evidence_count:number}>>([]);

  const totalEarnedDisplay=useMemo(()=>earn.total,[earn.total]);

  // Reward pts = Encourage + Redemption (same as ChildRewards)
  const rewardTotalDisplay=useMemo(
    ()=>earn.rewardEncourage+earn.rewardRedemption,
    [earn.rewardEncourage,earn.rewardRedemption]
  );

  // All pts from stages are usable, minus what is already spent
  const availableForRedemption=useMemo(
    ()=>Math.max(0,totalEarnedDisplay-spent),
    [totalEarnedDisplay,spent]
  );

  const currencyPreview=useMemo(
    ()=>Math.max(0,Math.round(points*rate*100)/100),
    [points,rate]
  );

  const counts=useMemo(()=>{
    const m:Record<FilterKey,number>={
      All:rows.length,
      Requested:0,
      Approved:0,
      Accepted:0,
      Fulfilled:0,
      Rejected:0,
      Cancelled:0
    };
    rows.forEach((r)=>{(m[r.status]as number)++;});
    return m;
  },[rows]);

  const filteredRows=useMemo(
    ()=>filter===ALL?rows:rows.filter((r)=>r.status===filter),
    [rows,filter]
  );

  const eligibleNow=useMemo(
    ()=>availableForRedemption>=MIN_POINTS,
    [availableForRedemption]
  );

  useEffect(()=>{
    (async ()=>{
      setLoading(true);
      try{
        const stored=sessionStorage.getItem("child_uid")
          ||sessionStorage.getItem("child_id")
          ||localStorage.getItem("child_portal_child_id")
          ||localStorage.getItem("child_uid");

        if(!stored){
          toast.error("No child selected. Please log in again.");
          setLoading(false);
          return;
        }

        const brief=await fetchChildBrief(stored);
        const cid=cleanUuid((brief as any)?.id??stored);
        const legacy=cleanUuid((brief as any)?.child_uid??stored);

        setChildCanonical(cid);
        setLegacyId(legacy);
        setRate(FIXED_RATE);

        const ids=Array.from(new Set([cid,legacy].filter(Boolean)))as string[];

        const summary=await fetchChildWalletSummary(cid);
        setWalletSummary(summary);

        const spentT=summary.spent_total_pts||0;
        setSpent(spentT);

        // Encourage Rewards: aligned with ChildRewards → child_points_ledger only
        const encourageFromLedger=await fetchEncouragePoints(ids);

        // Redemption Reward pts: reserved offers
        const redemptionFromReserved=await reservedPointsForChild(cid);

        const bRaw=await buildBreakdown(
          ids,
          cid,
          legacy,
          encourageFromLedger,
          redemptionFromReserved
        );
        const b=bRaw||{...ZERO_BREAK};

        console.log("[ChildEarnings.breakdown.init]",{
          ids,
          spent:spentT,
          encourageFromLedger,
          redemptionFromReserved,
          breakdown:b
        });

        setEarn(b);

        const nextFree=Math.max(0,(b.total||0)-spentT);
        setPoints(()=>Math.max(1,Math.min(nextFree,Math.max(MIN_POINTS,1))));

        await refreshRequests(legacy||cid);

        try{
          const childUid=legacy||cid;
          if(childUid){
            const {data,error}=await supabase
              .from("child_points_ledger")
              .select("points,created_at,reason,evidence_count")
              .eq("child_uid",childUid)
              .order("created_at",{ascending:false})
              .limit(50);
            if(error)throw error;
            const rows=(data||[]).map((r:any)=>({
              delta:Number(r.points||0),
              created_at:r.created_at,
              reason:r.reason??null,
              evidence_count:Number(r.evidence_count||0)
            }));
            setRecentLedger(rows);
          }else{
            setRecentLedger([]);
          }
        }catch(e:any){
          console.warn("[earnings.recentLedger]",e);
          setRecentLedger([]);
        }

        try{channelRef.current?.unsubscribe();}catch{}
        const idFilter=legacy||cid;
        if(idFilter){
          const ch=supabase.channel(`child-earnings:${idFilter}`);
          const refreshAll=async ()=>{
            await Promise.all([
              refreshNumbers(),
              refreshRequests(legacy||cid),
              refreshRecentLedger(legacy||cid)
            ]);
          };
          ch.on(
            "postgres_changes",
            {event:"INSERT",schema:"public",table:"points_ledger",filter:`child_uid=eq.${idFilter}`},
            async (payload:any)=>{
              const d=Number(payload?.new?.delta??0);
              if(d>0){
                toast.success(`+${d} pts earned! 🎉`);
                playSound("success");
              }else{
                toast.info("Points updated.");
                playSound("info");
              }
              await refreshAll();
            }
          );
          ch.on(
            "postgres_changes",
            {event:"UPDATE",schema:"public",table:"points_redemption_requests",filter:`child_uid=eq.${idFilter}`},
            async (payload:any)=>{
              const st=payload?.new?.status as Status|undefined;
              if(st==="Approved"){
                toast.success("Cash-out approved ✅");
                playSound("success");
              }else if(st==="Rejected"){
                toast.warning("Cash-out was not approved this time.");
                playSound("warning");
              }else if(st==="Fulfilled"){
                toast.success("Cash-out paid 💸");
                playSound("success");
              }else{
                playSound("info");
              }
              await refreshAll();
            }
          );
          ch.subscribe();
          channelRef.current=ch;
        }
      }catch(e){
        console.error("[Earnings init]",e);
        toast.error("Could not load your earnings.");
        playSound("error");
      }finally{
        setLoading(false);
      }
    })();

    return ()=>{
      try{channelRef.current?.unsubscribe();}catch{}
      channelRef.current=null;
    };
  },[]);

  async function refreshRequests(id:string){
    const {data,error}=await supabase
      .from("points_redemption_requests")
      .select("*")
      .eq("child_uid",id)
      .order("requested_at",{ascending:false});
    if(error)console.error("[fetch requests]",error);
    setRows((data as Req[])||[]);
  }

  async function refreshNumbers(){
    if(!childCanonical)return;
    const ids=Array.from(new Set([childCanonical,legacyId].filter(Boolean)))as string[];
    try{
      const summary=await fetchChildWalletSummary(childCanonical);
      setWalletSummary(summary);

      const spentT=summary.spent_total_pts||0;
      setSpent(spentT);

      const encourageFromLedger=await fetchEncouragePoints(ids);
      const redemptionFromReserved=await reservedPointsForChild(childCanonical);

      const bRaw=await buildBreakdown(
        ids,
        childCanonical,
        legacyId||null,
        encourageFromLedger,
        redemptionFromReserved
      );
      const b=bRaw||{...ZERO_BREAK};

      console.log("[ChildEarnings.breakdown.refresh]",{
        ids,
        spent:spentT,
        encourageFromLedger,
        redemptionFromReserved,
        breakdown:b
      });

      setEarn(b);

      const nextFree=Math.max(0,(b.total||0)-spentT);
      setPoints((p)=>Math.max(1,Math.min(nextFree,Math.max(p,1))));
    }catch(e){
      console.warn("[earnings.refreshNumbers]",e);
    }
  }

  async function refreshRecentLedger(id:string){
    try{
      const {data,error}=await supabase
        .from("child_points_ledger")
        .select("points,created_at,reason,evidence_count")
        .eq("child_uid",id)
        .order("created_at",{ascending:false})
        .limit(50);
      if(error)throw error;
      const rows=(data||[]).map((r:any)=>({
        delta:Number(r.points||0),
        created_at:r.created_at,
        reason:r.reason??null,
        evidence_count:Number(r.evidence_count||0)
      }));
      setRecentLedger(rows);
    }catch(e:any){
      console.warn("[earnings.refreshRecentLedger]",e);
    }
  }

  /** --------- Cash-out actions --------- */
  async function createRequest(){
    const childForRequest=legacyId||childCanonical;
    if(!childForRequest)return;
    if(points<1||points>availableForRedemption){
      return toast.error("You can only request up to your available points.");
    }
    if(currencyPreview<MIN_CASH){
      toast.error(`Minimum cash-out is $${MIN_CASH.toFixed(0)} (${MIN_POINTS} pts).`);
      return;
    }

    await tpromise(
      ()=>supabase.rpc("api_child_create_cashout",{
        p_child_uid:childForRequest,
        p_points:points,
        p_note:note||null
      }),
      {
        loading:"Creating cash-out request…",
        success:"Request sent to your parent! 🎉",
        error:(e)=>e?.message||e?.error?.message||e?.details||e?.hint||"Could not create request",
        sound:"success",
      }
    );

    await Promise.all([
      refreshRequests(childForRequest),
      refreshNumbers(),
      refreshRecentLedger(childForRequest)
    ]);
    setNote("");
  }

  async function accept(id:string){
    if(!childCanonical)return;
    const rid=cleanUuid(id);

    await tpromise(
      ()=>supabase.rpc("api_child_accept_cashout",{
        p_child_uid:childCanonical,
        p_request_id:rid
      }),
      {
        loading:"Accepting…",
        success:"Accepted. Points have been deducted. 💸",
        error:(e)=>e?.message||"Failed to accept",
        sound:"success",
      }
    );

    await Promise.all([
      refreshNumbers(),
      refreshRequests(legacyId||childCanonical),
      refreshRecentLedger(legacyId||childCanonical||"")
    ]);
  }

  const clampToAvailable=(val:number)=>Math.max(
    1,
    Math.min(Number.isFinite(val)?val:1,availableForRedemption)
  );

  /** ---------------- Small helpers ---------------- */
  function InfoBadge({tip}:{tip:string}){
    return (
      <span className="inline-flex items-center align-middle">
        <Info className="w-3.5 h-3.5 ml-1 text-white/50" aria-label="info" title={tip}/>
      </span>
    );
  }

  /** ------------------------------ UI ------------------------------ */
  if(loading){
    return (
      <div className="flex items-center justify-center gap-2 text-white/70 py-8">
        <Loader2 className="w-4 h-4 animate-spin"/>
        <span>Loading earnings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Stats — simple, stage-based */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* All pts (lifetime from stages) */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 rounded-xl bg-sky-500/20 border border-sky-500/30">
              <Gift className="w-5 h-5 text-sky-300"/>
            </div>
            <div>
              <div className="text-xs text-white/60">All pts</div>
              <div className="text-xl font-semibold text-sky-300">{totalEarnedDisplay} pts</div>
              <div className="text-[10px] text-white/50">
                My Daily + My Checklists + Play Game + Completed Targets + My Wishlist + Reward pts
              </div>
            </div>
          </div>
        </div>

        {/* Available for redemption */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
              <PiggyBank className="w-5 h-5 text-emerald-300"/>
            </div>
            <div>
              <div className="text-xs text-white/60">
                Available for redemption
                <InfoBadge tip={"All pts minus what is already spent (completed cash-outs / rewards)."} />
              </div>
              <div className="text-xl font-semibold text-emerald-300">{availableForRedemption} pts</div>
            </div>
          </div>
        </div>

        {/* Total Spent */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/30">
              <Trophy className="w-5 h-5 text-rose-200"/>
            </div>
            <div>
              <div className="text-xs text-white/60">
                Total Spent
                <InfoBadge tip={"Fulfilled cash-outs and fulfilled rewards from the wallet view."} />
              </div>
              <div className="text-xl font-semibold text-rose-200">{spent} pts</div>
              <div className="text-[10px] text-white/50">
                Fulfilled rewards, past cash-outs, and debits
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Earnings breakdown */}
      <div className="glass rounded-2xl p-5 border border-white/10 bg-slate-900/30">
        <div className="flex items-center gap-2 mb-4">
          <BadgeDollarSign className="w-5 h-5 text-emerald-300"/>
          <h2 className="text-white font-semibold">All Earnings (lifetime)</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <BreakCard icon={<SunburstIcon/>} label="My Daily" value={earn.daily} tone="emerald"/>
          <BreakCard icon={<ListChecks className="w-5 h-5"/>} label="My Checklists" value={earn.checklists} tone="sky"/>
          <BreakCard icon={<Gamepad2 className="w-5 h-5"/>} label="Play Game" value={earn.games} tone="violet"/>
          <BreakCard icon={<Target className="w-5 h-5"/>} label="Completed Targets" value={earn.targets} tone="cyan"/>
          <BreakCard icon={<Star className="w-5 h-5"/>} label="My Wishlist" value={earn.wishlist} tone="pink"/>
          <BreakCard icon={<ShieldCheck className="w-5 h-5"/>} label="Reward pts" value={rewardTotalDisplay} tone="yellow"/>
        </div>

        <div className="mt-3 text-[11px] text-white/60">
          Reward pts:{" "}
          <span className="text-amber-300 font-semibold">
            {rewardTotalDisplay} pts
          </span>{" "}
          <span className="text-white/60">
            ({earn.rewardEncourage} Encourage + {earn.rewardRedemption} Redemption)
          </span>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between flex-wrap gap-3">
          <div className="text-white/80">
            <div className="text-sm">Total Points Earned</div>
            <div className="text-xl font-bold">{totalEarnedDisplay} pts</div>
            <div className="text-[11px] text-white/50 mt-1">
              Calculated simply as: My Daily + My Checklists + Play Game + Completed Targets +
              My Wishlist + Reward pts.
            </div>
          </div>
          <div className="text-sm text-white/70">
            ⓘ Whenever you earn new points, this total and the stage cards update automatically.
          </div>
        </div>
      </div>

      {/* Motivation & Cash-out preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5 border border-white/10 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-yellow-300"/>
            <h3 className="text-white font-semibold">Motivation Tracker</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MiniStat label="Total pts" value={totalEarnedDisplay} suffix=" pts"/>
            <MiniStat label="Total Spent" value={spent} suffix=" pts"/>
            <MiniStat label="Available for cash-out" value={availableForRedemption} suffix=" pts"/>
          </div>

          <div className="text-xs text-white/60 mt-3">
            When you redeem rewards or cash-out, those points move from{" "}
            <span className="text-emerald-300 font-semibold">Available for cash-out</span>{" "}
            into <span className="text-rose-200 font-semibold">Total Spent</span>.
          </div>
        </div>

        <div className="glass rounded-2xl p-5 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <HeartHandshake className="w-5 h-5 text-emerald-300"/>
            <h3 className="text-white font-semibold">Cash-out Preview</h3>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-white/80">
              <span>Available points</span>
              <span className="font-semibold text-emerald-300">{availableForRedemption}</span>
            </div>
            <div className="flex justify-between text-white/80">
              <span>Rate</span>
              <span className="font-semibold">${rate.toFixed(3)}/pt</span>
            </div>
            <div className="flex justify-between text-white/80">
              <span>Potential cash-out</span>
              <span className="font-semibold text-sky-300">${(availableForRedemption*rate).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-white/70 pt-1">
              <span>Minimum withdrawal</span>
              <span className="font-semibold">{MIN_POINTS} pts (${MIN_CASH.toFixed(0)})</span>
            </div>
            <div className={`text-xs ${eligibleNow?"text-emerald-300":"text-rose-300"} pt-1`}>
              {eligibleNow
                ?"Eligible to request now."
                :"Not eligible yet — earn more points to reach the minimum."}
            </div>
          </div>
        </div>
      </div>

      {/* Cash-out request form + quick summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5 border border-white/10 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <BadgeDollarSign className="w-5 h-5 text-emerald-300"/>
            <h3 className="text-white font-semibold">Ask for a cash-out</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/70">Points to request</span>
                <span className="text-xs text-white/60">
                  {MIN_POINTS}–{Math.max(MIN_POINTS,availableForRedemption)} pts
                </span>
              </div>
              <input
                type="range"
                min={MIN_POINTS}
                max={Math.max(MIN_POINTS,availableForRedemption||MIN_POINTS)}
                value={Math.min(Math.max(points,MIN_POINTS),Math.max(MIN_POINTS,availableForRedemption||MIN_POINTS))}
                disabled={!eligibleNow}
                onChange={(e)=>setPoints(clampToAvailable(Number(e.target.value)||0))}
                className="w-full"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="w-24 rounded-md bg-slate-900/60 border border-white/15 px-2 py-1 text-sm text-white"
                  value={points}
                  min={MIN_POINTS}
                  max={availableForRedemption}
                  disabled={!eligibleNow}
                  onChange={(e)=>setPoints(clampToAvailable(Number(e.target.value)||0))}
                />
                <span className="text-xs text-white/60">
                  ≈ ${currencyPreview.toFixed(2)}
                </span>
              </div>
              <div className="text-[11px] text-white/50">
                You can only request what you have in{" "}
                <span className="text-emerald-300 font-semibold">Available for cash-out</span>.
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-white/70">Message to your parent (optional)</label>
              <textarea
                rows={3}
                className="w-full rounded-md bg-slate-900/60 border border-white/15 px-2 py-1 text-sm text-white resize-none"
                placeholder="What is this cash-out for?"
                value={note}
                onChange={(e)=>setNote(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={createRequest}
              disabled={!eligibleNow||points<MIN_POINTS||points>availableForRedemption}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-slate-900 transition-colors"
            >
              <BadgeDollarSign className="w-4 h-4 mr-1.5"/>
              Send cash-out request
            </button>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-5 h-5 text-sky-300"/>
            <h3 className="text-white font-semibold">Request summary</h3>
          </div>
          <div className="space-y-2 text-sm text-white/80">
            <div className="flex justify-between">
              <span>Open requests</span>
              <span className="font-semibold">
                {(counts.Requested||0)+(counts.Approved||0)+(counts.Accepted||0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Fulfilled</span>
              <span className="font-semibold text-emerald-300">
                {counts.Fulfilled||0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Rejected / Cancelled</span>
              <span className="font-semibold text-rose-300">
                {(counts.Rejected||0)+(counts.Cancelled||0)}
              </span>
            </div>
            <div className="pt-2 text-[11px] text-white/60">
              When your parent approves and pays a request, it moves into{" "}
              <span className="text-emerald-300">Fulfilled</span> and
              reductions show up in <span className="text-rose-200">Total Spent</span>.
            </div>
          </div>
        </div>
      </div>

      {/* Cash-out history */}
      <div className="glass rounded-2xl p-5 border border-white/10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-300"/>
            <h3 className="text-white font-semibold">Cash-out history</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f)=>(
              <button
                key={f}
                type="button"
                onClick={()=>setFilter(f)}
                className={`px-2.5 py-1 rounded-full text-[11px] border ${
                  filter===f
                    ?"bg-sky-500/20 border-sky-400 text-sky-100"
                    :"bg-white/5 border-white/10 text-white/60"
                }`}
              >
                {f}{" "}
                <span className="ml-1 text-[10px] text-white/50">
                  {counts[f]??0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {filteredRows.length===0?(
          <div className="py-4 text-sm text-white/60">
            No cash-out requests yet. When you send one, it will show up here.
          </div>
        ):(
          <div className="space-y-2">
            {filteredRows.map((r)=>(
              <div
                key={r.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="space-y-1 text-sm text-white/80">
                  <div className="flex items-center gap-2">
                    <BadgeDollarSign className="w-4 h-4 text-emerald-300"/>
                    <span className="font-semibold">{r.requested_points} pts</span>
                    <StatusPill status={r.status}/>
                  </div>
                  <div className="text-[11px] text-white/60">
                    Requested {new Date(r.requested_at).toLocaleString()}
                    {r.fulfilled_at&&(
                      <> · Paid {new Date(r.fulfilled_at).toLocaleString()}</>
                    )}
                  </div>
                  {r.note&&(
                    <div className="text-[11px] text-white/70">
                      “{r.note}”
                    </div>
                  )}
                </div>
                {r.status==="Approved"&&(
                  <button
                    type="button"
                    onClick={()=>accept(r.id)}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-900 self-start md:self-auto"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1"/>
                    Mark as received
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent earning timeline */}
      <div className="glass rounded-2xl p-5 border border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-5 h-5 text-yellow-300"/>
          <h3 className="text-white font-semibold">Recent points activity</h3>
        </div>
        {recentLedger.length===0?(
          <div className="py-3 text-sm text-white/60">
            No recent entries yet. Complete targets, play games, or finish checklists to earn points.
          </div>
        ):(
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {recentLedger.map((row,idx)=>(
              <div
                key={row.created_at+idx}
                className="flex items-start gap-3 text-sm text-white/80"
              >
                <div className="mt-1">
                  <Coins className="w-4 h-4 text-emerald-300"/>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {row.delta>0?`+${row.delta}`:row.delta} pts
                    </span>
                    <span className="text-[10px] text-white/50">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  {row.reason&&(
                    <div className="text-[11px] text-white/70">
                      {row.reason}
                    </div>
                  )}
                  {row.evidence_count>0&&(
                    <div className="text-[10px] text-white/50">
                      Evidence items: {row.evidence_count}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** ---------------- Small UI subcomponents ---------------- */
function BreakCard({icon,label,value,tone="emerald"}:{
  icon:ReactNode;
  label:string;
  value:number;
  tone?:"emerald"|"sky"|"violet"|"cyan"|"yellow"|"pink";
}){
  const toneMap:Record<string,string>={
    emerald:"from-emerald-500/30 to-teal-500/30 border-emerald-400/40 text-emerald-200",
    sky:"from-sky-500/30 to-blue-500/30 border-sky-400/40 text-sky-200",
    violet:"from-violet-500/30 to-fuchsia-500/30 border-violet-400/40 text-violet-200",
    cyan:"from-cyan-500/30 to-teal-500/30 border-cyan-400/40 text-cyan-200",
    yellow:"from-yellow-500/30 to-amber-500/30 border-yellow-400/40 text-yellow-200",
    pink:"from-pink-500/30 to-rose-500/30 border-rose-400/40 text-rose-200",
  };
  return (
    <div className={`p-4 rounded-2xl bg-gradient-to-br ${toneMap[tone]} border`}>
      <div className="flex items-center gap-2 text-white mb-1">
        <div className="p-1.5 rounded-lg bg-white/10">{icon}</div>
        <div className="text-xs text-white/70">{label}</div>
      </div>
      <div className="text-xl font-bold">{value} pts</div>
    </div>
  );
}

function MiniStat({label,value,suffix=""}:{label:string;value:number;suffix?:string}){
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-xl font-bold text-white mt-1">
        {value}{suffix}
      </div>
    </div>
  );
}

function SunburstIcon(){
  return (
    <div className="w-5 h-5 relative">
      <div className="absolute inset-0 rounded-full border border-yellow-300/60"/>
      <div className="absolute inset-0 animate-ping rounded-full bg-yellow-300/20"/>
    </div>
  );
}

function StatusPill({status}:{status:Status}){
  let cls="bg-white/5 border-white/15 text-white/70";
  let label=status;

  if(status==="Requested"){
    cls="bg-sky-500/20 border-sky-400/40 text-sky-100";
  }else if(status==="Approved"){
    cls="bg-emerald-500/20 border-emerald-400/40 text-emerald-100";
  }else if(status==="Accepted"){
    cls="bg-amber-500/20 border-amber-400/40 text-amber-100";
  }else if(status==="Fulfilled"){
    cls="bg-emerald-600/25 border-emerald-400/60 text-emerald-50";
  }else if(status==="Rejected"||status==="Cancelled"){
    cls="bg-rose-500/20 border-rose-400/40 text-rose-100";
  }

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] border ${cls}`}>
      {label}
    </span>
  );
}
