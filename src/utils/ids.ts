// src/utils/ids.ts

/** Return a single scalar ID (UUID string if available) from mixed inputs. */
export const childIdScalar=(raw:any):string=>{
  if(!raw) return "";
  if(typeof raw==="string") return raw.trim();
  if(typeof raw==="object"){
    const v=raw.id||raw.child_uid||raw.childUid||raw.childID||raw.child;
    return (typeof v==="string"?v.trim():"")||"";
  }
  return String(raw).trim();
};

/** Basic UUID v4/v1 validator (case-insensitive). */
export const isUuid=(s:string):boolean=>{
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s||"");
};

/** Warn (console) if not a UUID, but still return the value. */
export const requireUuidOrWarn=(v:string,label="child_uid"):string=>{
  if(!isUuid(v)){ console.warn(`[ids] ${label} is not a UUID:`, v); }
  return v;
};

/** Normalize any child reference to a UUID-like string (warns if not UUID). */
export const normalizeChildId=(raw:any):string=>{
  const id=childIdScalar(raw);
  return requireUuidOrWarn(id,"child_uid");
};

/** Strict: throw if not a UUID. Useful before DB filters. */
export const requireUuid=(v:string,label="child_uid"):string=>{
  if(!isUuid(v)){ throw new Error(`${label} must be a UUID`); }
  return v;
};

/** Helper: return UUID or null (no warnings, no throws). */
export const toUuidOrNull=(raw:any):string|null=>{
  const id=childIdScalar(raw);
  return isUuid(id)?id:null;
};
