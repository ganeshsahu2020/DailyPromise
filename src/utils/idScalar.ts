// Small helpers to consistently coerce incoming objects/strings into UUID scalars
// and warn safely when a UUID is missing.

export function isUuid(s:string){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s||"").trim());
}

/** Try several common shapes and return a UUID string or null. */
export function childIdScalar(raw:any):string|null{
  const cands = [raw, raw?.child_uid, raw?.id];
  for(const v of cands){
    const s = String(v??"").trim();
    if(isUuid(s)) return s;
  }
  return null;
}

/** Same idea, for family_id if you ever need it. */
export function familyIdScalar(raw:any):string|null{
  const cands = [raw, raw?.family_id, raw?.id];
  for(const v of cands){
    const s = String(v??"").trim();
    if(isUuid(s)) return s;
  }
  return null;
}

/** Require a UUID; log a clear warning and return empty string to avoid PostgREST 400s. */
export function requireUuidOrWarn(id:string|null,label="uuid"):string{
  if(id) return id;
  console.warn(`Expected a UUID for ${label}, got null/invalid. Using empty string to avoid 400.`);
  return "";
}
