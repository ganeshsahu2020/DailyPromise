// ui/src/utils/childAuth.ts
import {supabase}from "@/lib/supabase";

/** LocalStorage keys used across child/kiosk flows */
export const LS_CHILD="child_portal_child_id";
export const LS_FAMILY="child_portal_family_id"; // keep consistent with ChildLogin;

/** Safely read child id from LS_CHILD (supports plain id or JSON blob) */
export function readLsChildKey():string{
  try{
    const raw=localStorage.getItem(LS_CHILD);
    if(!raw)return"";
    const trimmed=raw.trim();
    // Newer flows store JSON: {id,child_uid,...}
    if(trimmed.startsWith("{")){
      try{
        const j=JSON.parse(trimmed);
        return String(j.id||j.child_uid||"").trim();
      }catch{
        return"";
      }
    }
    return trimmed;
  }catch{
    return"";
  }
}

export type Kid={
  id:string;                 // child_uid
  name:string;
  age:number|null;
  nickname?:string|null;
  child_pass_hash?:string|null; // kept optional for legacy admin screens
};

export type ChildBrief={
  id:string;          // child_profiles.id (or child_uid if we fall back)
  child_uid:string;
  family_id:string;
  first_name?:string|null;
  last_name?:string|null;
  nick_name?:string|null;
};

/** Load minimal child list for a family (uses SECURITY DEFINER RPC) */
export async function loadChildren(familyId:string):Promise<Kid[]>{
  const {data,error}=await supabase.rpc("api_children_list",{
    p_family_id:familyId,
  });
  if(error){
    console.error("[loadChildren] rpc api_children_list failed:",error);
    return [];
  }
  return (data||[]).map((r:any)=>({
    id:r.id,                 // child_uid
    name:r.name,
    age:r.age??null,
    nickname:r.nickname??null,
  })) as Kid[];
}

/** Resolve child_uid by nickname (case-insensitive within family) */
export async function childIdByNickname(
  familyId:string,
  nick:string
):Promise<string|null>{
  if(!familyId||!nick?.trim())return null;

  // primary (new signature)
  let {data,error}=await supabase.rpc("api_child_id_by_nickname",{
    p_family_id:familyId,
    p_nick:nick.trim(),
  });

  // fallback if PostgREST complains about cached signature (during migrations)
  if(error&&String(error.code)==="PGRST202"){
    ({data,error}=await supabase.rpc("api_child_id_by_nickname",{
      p_family:familyId,
      p_nick:nick.trim(),
    }));
  }

  if(error){
    console.error("[childIdByNickname] rpc failed:",error);
    return null;
  }
  return (data as string)||null;
}

/** Resolve family_id from a child_uid */
export async function findFamilyForChild(
  childUid:string
):Promise<string|null>{
  if(!childUid)return null;
  const {data,error}=await supabase.rpc("api_family_for_child",{
    p_child_uid:childUid,
  });
  if(error){
    console.error("[findFamilyForChild] rpc failed:",error);
    return null;
  }
  return (data as string)||null;
}

/** Verify child's PIN/password on the server (existing RPC) */
export async function verifyChildSecretRemote(args:{
  child_id:string; // child_uid
  fid:string;      // family_id
  clear:string;
  pinMode:boolean;
}):Promise<boolean>{
  const {data,error}=await supabase.rpc("api_child_auth_check",{
    child_id:args.child_id,
    fid:args.fid,
    clear:args.clear,
    pin_mode:args.pinMode,
  });
  if(error){
    console.error("[verifyChildSecretRemote] rpc failed:",error);
    return false;
  }
  return data===true;
}

/* ------------------------------------------------------------------ */
/* ---------------------------- Admin API ---------------------------- */
/* ------------------------------------------------------------------ */

/** Admin: list children (+has_secret flag, if your RPC exposes it) */
export async function adminListChildren(fid:string){
  // primary: new RPC signature (by fid)
  let {data,error}=await supabase.rpc("api_children_admin_list",{fid});

  // fallback: older naming (by p_family_id)
  if(error&&String(error.code)==="PGRST202"){
    ({data,error}=await supabase.rpc("api_children_admin_list",{
      p_family_id:fid,
    }));
  }

  if(error)throw error;
  return (data||[]) as {
    id:string;            // child_uid
    first_name:string|null;
    age:number|null;
    has_secret?:boolean;
    nickname?:string|null;
  }[];
}

/**
 * Admin: set secret (prefers canonical id child_id; legacy child_uid supported by a fallback RPC)
 * Expects server RPCs:
 * - api_child_set_secret(child_id uuid, fid uuid, clear text, pin_mode boolean)
 * - api_child_set_secret_by_uid(child_uid uuid, fid uuid, clear text, pin_mode boolean)
 */
export async function adminSetChildSecret(params:{
  child_id?:string;     // preferred (child_uid but named child_id)
  child_uid?:string;    // legacy param name supported by fallback RPC
  fid:string;           // family_id
  clear:string;         // PIN/password plaintext to hash server-side
  pinMode:boolean;      // true=PIN, false=password
}):Promise<boolean>{
  if(params.child_id){
    const {data,error}=await supabase.rpc("api_child_set_secret",{
      child_id:params.child_id,
      fid:params.fid,
      clear:params.clear,
      pin_mode:params.pinMode,
    });
    if(error)throw error;
    return data===true;
  }

  if(params.child_uid){
    const {data,error}=await supabase.rpc("api_child_set_secret_by_uid",{
      child_uid:params.child_uid,
      fid:params.fid,
      clear:params.clear,
      pin_mode:params.pinMode,
    });
    if(error)throw error;
    return data===true;
  }

  throw new Error("adminSetChildSecret requires child_id or child_uid");
}

/* ------------------------------------------------------------------ */
/* -------------------------- Child brief API ------------------------ */
/* ------------------------------------------------------------------ */

function looksLikeUuid(s:string):boolean{
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    (s||"").trim()
  );
}

/** Resolve a raw key from hint / sessionStorage / localStorage variants */
function resolveChildKey(hint?:string):{rawKey:string; cameFromLs:boolean}{
  const hintTrim=(hint||"").trim();

  let ss="";
  try{
    ss=sessionStorage.getItem("child_uid")?.trim()||"";
  }catch{}

  let lsKey="";
  let cameFromLs=false;

  try{
    // 1) canonical LS_CHILD (child_portal_child_id) – may be plain or JSON
    const raw1=localStorage.getItem(LS_CHILD);
    if(raw1){
      const t=raw1.trim();
      if(t.startsWith("{")){
        try{
          const j=JSON.parse(t);
          lsKey=String(j.child_uid||j.id||"").trim();
        }catch{
          lsKey=t;
        }
      }else{
        lsKey=t;
      }
      if(lsKey)cameFromLs=true;
    }

    // 2) legacy "LS_CHILD" key, if someone used that literal
    if(!lsKey){
      const raw2=localStorage.getItem("LS_CHILD");
      if(raw2){
        const t2=raw2.trim();
        if(t2.startsWith("{")){
          try{
            const j2=JSON.parse(t2);
            lsKey=String(j2.child_uid||j2.id||"").trim();
          }catch{
            lsKey=t2;
          }
        }else{
          lsKey=t2;
        }
        if(lsKey)cameFromLs=true;
      }
    }
  }catch{}

  const rawKey=hintTrim||ss||lsKey;
  return{rawKey,cameFromLs};
}

/**
 * Brief info for the child header/dropdown, resolved directly from child_profiles.
 *
 * Priority:
 *  1) explicit hint (id / child_uid / nick_name)
 *  2) sessionStorage["child_uid"]
 *  3) localStorage[LS_CHILD] or legacy "LS_CHILD" (supports plain or JSON blob)
 */
export async function fetchChildBrief(hint?:string):Promise<ChildBrief|null>{
  const {rawKey,cameFromLs}=resolveChildKey(hint);

  console.log("[fetchChildBrief] rawKey from storage/hint:",rawKey);

  if(!rawKey){
    console.warn("[fetchChildBrief] no key found in hint/session/localStorage");
    return null;
  }

  let key=rawKey.trim();

  // If somehow a JSON string slipped through, try to extract child_uid again
  if(key.startsWith("{")){
    try{
      const obj=JSON.parse(key);
      key=String(obj.child_uid||obj.id||"").trim();
    }catch{
      console.warn("[fetchChildBrief] could not parse JSON key",key);
    }
  }

  if(!key){
    console.warn("[fetchChildBrief] resolved key is empty after JSON parsing");
    if(cameFromLs){
      try{localStorage.removeItem(LS_CHILD);}catch{}
    }
    return null;
  }

  if(!looksLikeUuid(key)){
    console.warn("[fetchChildBrief] key does not look like UUID",key);
    return null;
  }

  const {data,error}=await supabase
    .from("child_profiles")
    .select("id,child_uid,family_id,first_name,last_name,nick_name")
    .eq("child_uid",key)
    .maybeSingle();

  if(error){
    console.error("[fetchChildBrief] query error:",error);
    return null;
  }
  if(!data){
    console.warn("[fetchChildBrief] no child found for child_uid",key);
    // self-heal if LS had a bad value
    if(cameFromLs){
      try{localStorage.removeItem(LS_CHILD);}catch{}
    }
    return null;
  }

  const brief:ChildBrief={
    id:String(data.id??data.child_uid),
    child_uid:String(data.child_uid),
    family_id:String(data.family_id),
    first_name:data.first_name,
    last_name:data.last_name,
    nick_name:data.nick_name,
  };

  return brief;
}
