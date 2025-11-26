// src/lib/points.ts
import {supabase}from "@/lib/supabase";

type AwardArgs={child_uid:string; delta:number; reason:string; ref?:string|null};

/** Normalize whatever we get (child_profiles.id OR child_profiles.child_uid) to canonical id */
async function resolveCanonicalChildId(seed:string){
  console.log("[points] resolveCanonicalChildId seed",seed);
  const {data,error}=await supabase
    .from("child_profiles")
    .select("id,child_uid")
    .or(`id.eq.${seed},child_uid.eq.${seed}`)
    .limit(1);

  if(error){
    console.warn("[points] resolveCanonicalChildId error",error);
    return seed; // fallback so old flows don't break
  }

  const row=(data?.[0]??null) as {id:string;child_uid:string}|null;
  if(!row){
    console.warn("[points] resolveCanonicalChildId no match, returning seed");
    return seed;
  }

  console.log("[points] resolveCanonicalChildId -> canonical id",row.id,"child_uid",row.child_uid);
  return row.id; // canonical id – same value you just used in the SQL debug call
}

export async function awardPointsWithKey({child_uid,delta,reason,ref}:AwardArgs){
  console.log("[points] awardPointsWithKey called",{child_uid,delta,reason,ref});

  const canonicalChild=await resolveCanonicalChildId(child_uid);
  console.log("[points] awardPointsWithKey canonicalChild",canonicalChild);

  // Scope the ref per child to avoid global collisions across kids
  const scopedRef=ref?`${canonicalChild}:${ref}`:null;

  // ---------------- 1) Try RPC (keeps wallet/idempotency logic) ----------------
  const {data,error}=await supabase.rpc("award_points_idem_api",{
    p_child:canonicalChild,
    p_delta:delta,
    p_reason:reason,
    p_ref:scopedRef
  });

  console.log("[points] award_points_idem_api result",{data,error});

  // If RPC throws, log but don't block the user – we'll still insert a row.
  if(error){
    console.error("award_points_idem_api error",{
      message:error.message,
      details:(error as any).details,
      hint:(error as any).hint,
      code:(error as any).code
    });
  }

  let row:any=Array.isArray(data)?data[0]:data;
  const rpcAwarded=!!(row&&typeof row==="object"&&"awarded"in row&&row.awarded);

  // --------------- 2) Fallback: ensure a ledger row always exists ---------------
  if(!rpcAwarded){
    console.warn("[points] RPC returned no award or empty payload – using direct insert fallback");
    const {data:ins,error:errIns}=await supabase
      .from("points_ledger")
      .insert({
        child_uid:canonicalChild,
        delta,
        reason
      })
      .select("id,child_uid,delta,reason,created_at")
      .maybeSingle();

    console.log("[points] fallback insert into points_ledger result",{ins,errIns});

    if(errIns){
      console.error("[points] fallback insert error",errIns);
      throw errIns;
    }

    row={
      awarded:true,
      ledger_id:ins?.id??null
    };
  }

  // --------------- 3) Notify listeners so rollups refresh immediately ----------
  try{
    window.dispatchEvent(new CustomEvent("points:changed",{detail:{childId:canonicalChild}}));
  }catch{}

  return row as {awarded:boolean; ledger_id:string|null};
}

export function makeIdemKey(prefix:string,segment:number){
  return `${prefix}:${segment}`;
}
