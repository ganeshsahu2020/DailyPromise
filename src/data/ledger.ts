// src/data/ledger.ts
import {supabase}from "@/lib/supabase";

// Accept standard UUIDs (v1–v5)
export const UUID_RX=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(s:any){return String(s??"").trim();}
function isUuid(s:any){return UUID_RX.test(clean(s));}

/** Resolve a canonical id to legacy child_uid (and return both if available). */
async function resolveLedgerIds(input:string):Promise<{legacy?:string;canonical?:string}>{
  const raw=clean(input);
  if(!isUuid(raw)) throw new Error("Invalid child_uid");
  const {data,error}=await supabase
    .from("child_profiles")
    .select("id,child_uid")
    .or(`id.eq.${raw},child_uid.eq.${raw}`)
    .limit(1)
    .maybeSingle();

  if(error){
    console.warn("[ledger.resolveLedgerIds] lookup error:",error);
    return {legacy:raw,canonical:raw};
  }
  if(!data){
    return {legacy:raw,canonical:raw};
  }
  return {legacy:data.child_uid||raw,canonical:data.id||raw};
}

/**
 * Safe ledger fetcher (last-N-days via sinceISO).
 * Accepts canonical or legacy id; queries both to be future-proof.
 * Maps to UI shape: {delta,created_at,reason,evidence_count}.
 * ⚠️ Includes BOTH child_points_ledger.points and points_ledger.delta.
 */
export async function fetchLedgerSince(childId:string,sinceISO:string){
  const id=clean(childId);
  if(!isUuid(id)) throw new Error("Invalid child_uid");

  const {legacy,canonical}=await resolveLedgerIds(id);
  const ids=Array.from(new Set([legacy,canonical].filter(Boolean))) as string[];

  const [cpl,pl]=await Promise.all([
    supabase
      .from("child_points_ledger")
      .select("points,created_at,reason,evidence_count,child_uid")
      .in("child_uid",ids)
      .gte("created_at",sinceISO)
      .order("created_at",{ascending:false}),
    supabase
      .from("points_ledger")
      .select("delta,created_at,reason,child_uid")
      .in("child_uid",ids)
      .gte("created_at",sinceISO)
      .order("created_at",{ascending:false})
  ]);

  if(cpl.error) throw cpl.error;
  if(pl.error) throw pl.error;

  const a=(cpl.data||[]).map((r:any)=>({
    delta:Number(r.points??0),
    created_at:String(r.created_at),
    reason:r.reason??null,
    evidence_count:Number(r.evidence_count??0)
  }));

  const b=(pl.data||[]).map((r:any)=>({
    delta:Number(r.delta??0),
    created_at:String(r.created_at),
    reason:r.reason??null,
    evidence_count:0
  }));

  const merged=[...a,...b].sort(
    (x,y)=>new Date(y.created_at).getTime()-new Date(x.created_at).getTime()
  );

  return merged;
}
