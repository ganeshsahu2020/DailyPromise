// src/data/wallet.ts
import {supabase}from "@/lib/supabase";
import {toast}from "sonner";
import {fetchChildBrief}from "@/utils/childAuth";

/** ───────────────────── Canonical child id resolver ───────────────────── */

export async function resolveCanonicalChildId():Promise<string>{
  // Prefer brief if it already returns canonical id
  const brief=await fetchChildBrief();
  if(brief?.id){
    return brief.id;
  }

  // Fallback: resolve via child_uid stored in browser storage
  let childUid="";
  try{ childUid=sessionStorage.getItem("child_uid")||""; }catch{}
  if(!childUid){
    try{
      const raw=localStorage.getItem("LS_CHILD");
      if(raw){
        try{
          const o=JSON.parse(raw);
          childUid=o.child_uid||o.id||"";
        }catch{}
      }
    }catch{}
  }

  if(!childUid){
    throw new Error("No child_uid found in storage");
  }

  const {data,error}=await supabase
    .from("child_profiles")
    .select("id")
    .eq("child_uid",childUid)
    .single();

  if(error||!data){
    console.error("[wallet] resolveCanonicalChildId error",error);
    throw new Error("Failed to resolve canonical child id");
  }

  return data.id as string;
}

/** ───────────────────────────── Types ───────────────────────────── */

/** Canonical rollup from vw_child_wallet_rollup (DB view) */
export type ChildWalletSummary={
  child_uid:string;
  lifetime_earned_pts:number;
  spent_cashout_pts:number;
  reserved_pts:number;
  spent_total_pts:number;
  available_pts:number;
  balance_pts:number;
};

/** Single-child wallet snapshot (authoritative for chips/UI) */
export type ChildWallet={
  child_uid:string;
  total_points:number;       // == lifetime_earned_pts
  reserved_points:number;    // == reserved_pts
  available_points:number;   // == available_pts
  spent_points:number;       // == spent_total_pts
  balance_points:number;     // == balance_pts
};

// Family list row (for tables/rosters)
export type WalletRow={
  child_uid:string;
  first_name:string|null;
  nick_name:string|null;
  earned_points:number;      // list display; not used for chips
  spent_points:number;       // now prefers summary.spent_total_pts via ChildWallet
  available_points:number;
  reserved_points:number;
  free_points:number;        // mirrors available_points
};

export type ReservedOffer={
  offer_id:string;
  child_uid:string;
  title:string|null;
  description:string|null;
  eff_cost:number;
  status?:string;            // 'Accepted'
};

/** ───────────────────────── Canonical rollup fetch ───────────────────────── */

export async function fetchChildWalletSummary(childUid:string):Promise<ChildWalletSummary>{
  const {data,error}=await supabase
    .from("vw_child_wallet_rollup")
    .select("*")
    .eq("child_uid",childUid)
    .maybeSingle();

  if(error)throw error;

  const summary:ChildWalletSummary=data??{
    child_uid:childUid,
    lifetime_earned_pts:0,
    spent_cashout_pts:0,
    reserved_pts:0,
    spent_total_pts:0,
    available_pts:0,
    balance_pts:0,
  };

  return summary;
}

/** Map canonical summary → ChildWallet for chips/rosters/etc. */
function walletFromSummary(summary:ChildWalletSummary):ChildWallet{
  return{
    child_uid:summary.child_uid,
    total_points:summary.lifetime_earned_pts,
    reserved_points:summary.reserved_pts,
    available_points:summary.available_pts,
    spent_points:summary.spent_total_pts,
    balance_points:summary.balance_pts
  };
}

/** ─────────────────────────── Utilities ─────────────────────────── */
function isUuid(v:string){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||"").trim());
}

/** Display helper: sum “effective” reserved cost from a list */
export function sumReserved(list:ReservedOffer[]|undefined){
  if(!Array.isArray(list)||list.length===0)return 0;
  return list.reduce((acc,o)=>{
    const n=Number(o.eff_cost??0);
    return acc+(Number.isFinite(n)?n:0);
  },0);
}

/* Map any backend-ish shape → ChildWallet shape.
 * Used mainly by the ledger fallback, but also safe for other callers.
 */
function normalizeWalletRow(raw:any,childUid:string):ChildWallet{
  const earned=Number(
    raw?.total_points??
    raw?.earned_points??
    raw?.rewards_total??
    raw?.total??
    0
  );

  const reservedRaw=Number(
    raw?.reserved_points??
    raw?.reserved??
    0
  );

  const availableRaw=(
    raw?.available_points??
    raw?.free_points??
    raw?.available??
    (earned-reservedRaw)
  );
  const available=Math.max(0,Number(availableRaw));

  const safeReserved=Number.isFinite(reservedRaw)
    ?reservedRaw
    :Math.max(0,earned-available);

  const spentRaw=Number(
    raw?.spent_points??
    raw?.spent_total_pts??
    raw?.spent??
    (earned-available-safeReserved)
  );
  const spent=Math.max(0,spentRaw);

  const balanceRaw=Number(
    raw?.balance_points??
    raw?.balance_pts??
    (available+safeReserved)
  );
  const balance=Number.isFinite(balanceRaw)?balanceRaw:(available+safeReserved);

  return{
    child_uid:childUid,
    total_points:earned,
    reserved_points:safeReserved,
    available_points:available,
    spent_points:spent,
    balance_points:balance
  };
}

/** ─────────────── Accepted offers breakdown (display-only) ───────────────
 * Use this to show which offers are reserving points.
 * Chips & earnings now share the same rollup logic.
 */
export async function fetchReservedOffers(childUid:string):Promise<ReservedOffer[]>{
  try{
    const {data,error}=await supabase
      .from("reward_offers")
      .select("id,child_uid,title,description,points_cost,points_cost_override,status")
      .eq("child_uid",childUid)
      .in("status",["Accepted"]);
    if(error)throw error;

    return (data??[]).map((r:any)=>({
      offer_id:r.id,
      child_uid:r.child_uid,
      title:r.title??null,
      description:r.description??null,
      eff_cost:Number(r.points_cost_override??r.points_cost??0)||0,
      status:r.status
    }))as ReservedOffer[];
  }catch(e){
    console.warn("[wallet] fetchReservedOffers fallback failed",e);
    return[];
  }
}

/** Convenience: compute reserved sum for a child from display list */
export async function reservedPointsForChild(childUid:string):Promise<number>{
  const rows=await fetchReservedOffers(childUid);
  return sumReserved(rows);
}

/** ────────────── Fallback: compute wallet from ledgers ──────────────
 * Used ONLY if the canonical rollup view fails (e.g. dev env missing view).
 * This approximates:
 *   total_points       ≈ sum of all positive deltas
 *   reserved_points    ≈ accepted offers
 *   available_points   ≈ net - reserved
 *   spent_points       ≈ earned - available - reserved
 *   balance_points     ≈ available + reserved
 */
async function computeWalletFromLedger(key:string):Promise<ChildWallet|null>{
  const childKey=String(key||"").trim();
  if(!childKey)return null;

  // Try to resolve both canonical + legacy ids
  let ids=[childKey];
  try{
    const {data}=await supabase
      .from("child_profiles")
      .select("id,child_uid")
      .or(`id.eq.${childKey},child_uid.eq.${childKey}`)
      .limit(1);
    const row=(data?.[0]??null)as {id:string;child_uid:string|null}|null;
    if(row){
      ids=Array.from(new Set([childKey,row.id,row.child_uid].filter(Boolean)));
    }
  }catch(e){
    console.warn("[wallet] profile lookup failed for ledger fallback",e);
  }

  let all:number[]=[];

  // child_points_ledger
  try{
    const {data:cpl}=await supabase
      .from("child_points_ledger")
      .select("points,child_uid")
      .in("child_uid",ids);
    if(Array.isArray(cpl)){
      all=all.concat(cpl.map((r:any)=>Number(r.points||0)));
    }
  }catch(e){
    console.warn("[wallet] child_points_ledger fallback query failed",e);
  }

  // points_ledger
  try{
    const {data:pl}=await supabase
      .from("points_ledger")
      .select("delta,child_uid")
      .in("child_uid",ids);
    if(Array.isArray(pl)){
      all=all.concat(pl.map((r:any)=>Number(r.delta||0)));
    }
  }catch(e){
    console.warn("[wallet] points_ledger fallback query failed",e);
  }

  if(!all.length){
    // Nothing visible (RLS or new child) → safe zero wallet
    return{
      child_uid:childKey,
      total_points:0,
      reserved_points:0,
      available_points:0,
      spent_points:0,
      balance_points:0
    };
  }

  const net=all.reduce((s,v)=>s+v,0);
  const earned=all.reduce((s,v)=>s+(v>0?v:0),0);

  // Optional: subtract accepted offers from available for closer DB alignment
  let reservedFromOffers=0;
  try{
    reservedFromOffers=await reservedPointsForChild(childKey);
  }catch(e){
    console.warn("[wallet] reservedPointsForChild failed, using synthetic reserved",e);
  }

  const syntheticAvailable=Math.max(0,net-reservedFromOffers);
  const syntheticReserved=Math.max(0,earned-syntheticAvailable);
  const syntheticSpent=Math.max(0,earned-syntheticAvailable-syntheticReserved);
  const syntheticBalance=syntheticAvailable+syntheticReserved;

  const synthetic={
    total_points:earned,
    reserved_points:syntheticReserved,
    available_points:syntheticAvailable,
    spent_points:syntheticSpent,
    balance_points:syntheticBalance
  };

  return normalizeWalletRow(synthetic,childKey);
}

/** ──────────────── Single source of truth (CHIPS) ────────────────
 * Primary path:
 *   1) Read vw_child_wallet_rollup (ChildWalletSummary).
 *   2) Map to ChildWallet so chips & tables match Earnings.
 * Fallback:
 *   - If the view errors (missing in dev / RLS), approximate from ledgers.
 */
export async function fetchChildWallet(idOrUid:string):Promise<ChildWallet|null>{
  const key=String(idOrUid||"").trim();
  if(!key)return null;

  // 1) Canonical rollup (preferred, aligns with ChildEarnings + Checklists)
  try{
    const summary=await fetchChildWalletSummary(key);
    return walletFromSummary(summary);
  }catch(e){
    console.warn("[wallet] fetchChildWalletSummary failed, using ledger fallback",e);
  }

  // 2) Ledger-based fallback for dev / migrations
  return computeWalletFromLedger(key);
}

/** Alias kept for callers already using the Flexible name */
export async function fetchChildWalletFlexible(idOrUid:string):Promise<ChildWallet|null>{
  return fetchChildWallet(idOrUid);
}

/** ───────────── Family-level wallet rows (list/roster UI) ─────────────
 * For each child in family, compute wallet via fetchChildWallet.
 * This keeps:
 *   - All pts
 *   - Available
 *   - Reserved
 *   - Spent
 * aligned with ChildEarnings & Checklists.
 */
export async function fetchWalletForFamily(familyId:string):Promise<WalletRow[]>{
  if(!familyId)return[];

  try{
    const {data:kids,error:kidsErr}=await supabase
      .from("child_profiles")
      .select("child_uid,nick_name,first_name")
      .eq("family_id",familyId);
    if(kidsErr)throw kidsErr;

    const children=(kids??[])as Array<{child_uid:string;nick_name:string|null;first_name:string|null;}>;
    if(children.length===0)return[];

    const wallets=await Promise.all(
      children.map(async(k)=>{
        const w=await fetchChildWallet(k.child_uid);
        return{child:k,wallet:w};
      })
    );

    return wallets.map(({child,wallet})=>{
      const earned=wallet?.total_points??0;
      const reserved=wallet?.reserved_points??0;
      const avail=wallet?.available_points??0;
      const spent=wallet?.spent_points??Math.max(0,earned-avail-reserved);
      return{
        child_uid:child.child_uid,
        first_name:child.first_name??null,
        nick_name:child.nick_name??null,
        earned_points:earned,
        spent_points:spent,
        available_points:avail,
        reserved_points:reserved,
        free_points:avail
      };
    });
  }catch(e){
    toast.message("Using simple ledger-based balance",{description:String(e)});
    return[];
  }
}

/** ────────────────────── Wallet breakdown (by source) ─────────────────────
 * Mirrors the Earnings breakdown buckets:
 *   - daily, checklists, games, targets, wishlist,
 *     rewardEncourage, rewardRedemption, other, total
 *
 * This uses ONLY positive rows from:
 *   - points_ledger.delta
 *   - child_points_ledger.points
 *
 * and classifies them via reason text. The "total" here may differ slightly
 * from vw_child_wallet_rollup.lifetime_earned_pts, but:
 *   wallet.total_points - breakdown.total = adjustments/legacy differences.
 */

export type WalletBreakdown={
  daily:number;
  checklists:number;
  games:number;
  targets:number;
  wishlist:number;
  rewardEncourage:number;
  rewardRedemption:number;
  other:number;
  total:number;
};

const ZERO_WALLET_BREAKDOWN:WalletBreakdown={
  daily:0,
  checklists:0,
  games:0,
  targets:0,
  wishlist:0,
  rewardEncourage:0,
  rewardRedemption:0,
  other:0,
  total:0
};

function normReason(raw:any){
  const r=raw==null?"":String(raw);
  return r.toLowerCase().trim();
}

function isDebugReason(raw:any){
  const r=normReason(raw);
  if(!r)return false;
  return r.includes("rpc debug award")||r.startsWith("debug");
}

// Local copy so we don't depend on React routes
function isGameReasonLocal(reason:any){
  const raw=normReason(reason);
  if(!raw)return false;
  const s=raw.replace(/[\s\W_]+/g,"");
  return (
    s.includes("starcatcher")||
    s.includes("mathsprint")||(s.includes("math")&&s.includes("sprint"))||
    s.includes("wordbuilder")||(s.includes("word")&&s.includes("builder"))||
    s.includes("memorymatch")||(s.includes("memory")&&s.includes("match"))||
    s.includes("jumpplatformer")||
    s.includes("jumpinggame")||
    s.includes("jumpgame")||
    s.includes("quizgame")||
    s.includes("trivia")||
    s.includes("game")
  );
}

type WalletBucketKey=Exclude<keyof WalletBreakdown,"total">;

function classifyWalletReason(reason:any):WalletBucketKey{
  const r=normReason(reason);
  if(!r)return"other";

  if(isGameReasonLocal(r))return"games";

  if(r.includes("daily activity"))return"daily";
  if(r.includes("checklist"))return"checklists";
  if(r.includes("target"))return"targets";
  if(r.includes("wishlist")||r.includes("wish"))return"wishlist";

  const storyKeys=[
    "read 10 pages",
    "dusting adventure",
    "block city",
    "blue sky with rainbow",
    "quick forest painting",
    "draw a monkey"
  ];
  if(storyKeys.some((k)=>r.includes(k.toLowerCase())))return"targets";

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

  return"other";
}

export async function fetchChildWalletBreakdown(childUid:string):Promise<WalletBreakdown>{
  const uid=String(childUid||"").trim();
  if(!uid)return{...ZERO_WALLET_BREAKDOWN};

  // Resolve canonical + legacy ids (same pattern as ledger fallback)
  let ids=[uid];
  try{
    const {data}=await supabase
      .from("child_profiles")
      .select("id,child_uid")
      .or(`id.eq.${uid},child_uid.eq.${uid}`)
      .limit(1);
    const row=(data?.[0]??null)as {id:string;child_uid:string|null}|null;
    if(row){
      ids=Array.from(new Set([uid,row.id,row.child_uid].filter(Boolean)))as string[];
    }
  }catch(e){
    console.warn("[wallet] fetchChildWalletBreakdown profile lookup failed",e);
  }

  const buckets:{[K in keyof WalletBreakdown]:number}={...ZERO_WALLET_BREAKDOWN};

  const addRow=(pts:number,reason:any)=>{
    const n=Number(pts||0);
    if(!Number.isFinite(n)||n<=0)return;
    if(isDebugReason(reason))return;
    const bucket=classifyWalletReason(reason);
    buckets[bucket]+=n;
    buckets.total+=n;
  };

  // points_ledger (delta>0)
  try{
    const {data:pl,error:plErr}=await supabase
      .from("points_ledger")
      .select("delta,reason,child_uid")
      .in("child_uid",ids);
    if(plErr)throw plErr;
    (pl||[]).forEach((r:any)=>{
      const delta=Number(r.delta||0);
      if(delta>0)addRow(delta,r.reason);
    });
  }catch(e){
    console.warn("[wallet] fetchChildWalletBreakdown points_ledger failed",e);
  }

  // child_points_ledger (points>0)
  try{
    const {data:cpl,error:cplErr}=await supabase
      .from("child_points_ledger")
      .select("points,reason,child_uid")
      .in("child_uid",ids);
    if(cplErr)throw cplErr;
    (cpl||[]).forEach((r:any)=>{
      const pts=Number(r.points||0);
      if(pts>0)addRow(pts,r.reason);
    });
  }catch(e){
    console.warn("[wallet] fetchChildWalletBreakdown child_points_ledger failed",e);
  }

  return buckets;
}

/** ─────────────────────── IDs finder (by family) ─────────────────────── */
export async function childIdsForFamily(familyId:string):Promise<string[]>{
  const {data,error}=await supabase
    .from("child_profiles")
    .select("child_uid")
    .eq("family_id",familyId);
  if(error)throw error;
  return (data??[]).map((r:{child_uid:string})=>r.child_uid);
}

/** Legacy helper (optional) */
export function looksLikeUuid(v:string){
  return isUuid(v);
}
