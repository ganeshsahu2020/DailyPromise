// src/routes/child/useChildPointsRollup.ts
import {useEffect,useMemo,useRef,useState}from "react";
import {supabase}from "@/lib/supabase";

export type LedgerRow={delta:number;created_at:string;reason:string|null;evidence_count?:number};

export function isGameReason(reason:string|null){
  const raw=(reason||"").toLowerCase();
  if(!raw)return false;
  const s=raw.replace(/[\s\W_]+/g,"");

  // 🎮 Explicitly match our 6 games + a few safe "game" patterns
  return (
    // Star Catcher
    s.includes("starcatcher") ||

    // Math Sprint
    s.includes("mathsprint") || (s.includes("math")&&s.includes("sprint")) ||

    // Word Builder
    s.includes("wordbuilder") || (s.includes("word")&&s.includes("builder")) ||

    // Memory Match
    s.includes("memorymatch") || (s.includes("memory")&&s.includes("match")) ||

    // Jumping Platformer
    s.includes("jumpingplatformer") || (s.includes("jump")&&s.includes("platformer")) ||

    // AnyRunner
    s.includes("anyrunner") || (s.includes("runner")&&s.includes("game")) ||

    // Extra safe patterns where you explicitly tag as game in the future
    raw.includes("play game") ||
    raw.startsWith("game:") ||
    raw.includes("game reward")
  );
}

type Rollup={
  totalPoints:number;
  totalEarned:number;
  totalCompletions:number;
  withEvidence:number;
  quickCount:number;
  playGamePoints:number;
  gameDailyCap:number;
  gamePointsToday:number;
  gamePointsTodayRemaining:number;
  gameCapReached:boolean;
};

const GAME_DAILY_CAP=500;

const initial:Rollup={
  totalPoints:0,
  totalEarned:0,
  totalCompletions:0,
  withEvidence:0,
  quickCount:0,
  playGamePoints:0,
  gameDailyCap:GAME_DAILY_CAP,
  gamePointsToday:0,
  gamePointsTodayRemaining:GAME_DAILY_CAP,
  gameCapReached:false
};

/** Try to turn whatever we got into a clean child_uid/id string */
function normalizeChildSeed(input:string|null):string|null{
  if(!input)return null;
  let v=input.trim();

  // Strip accidental wrapping quotes
  if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))){
    v=v.slice(1,-1).trim();
  }

  // If it looks like a JSON object string, extract child_uid or id
  if(v.startsWith("{")&&v.endsWith("}")){
    try{
      const obj=JSON.parse(v);
      if(obj&&typeof obj==="object"){
        const candidate=(obj.child_uid||obj.id||obj.childId||obj.uid) as string|undefined;
        if(candidate&&typeof candidate==="string"){
          return candidate.trim();
        }
      }
    }catch(_){
      // fall through
    }
    // JSON but no usable id – treat as invalid
    return null;
  }

  return v;
}

/** Resolve both canonical and legacy IDs for robust filtering */
async function resolveChildIds(seed:string){
  const clean=seed.trim();
  if(!clean)return[];

  // Only hit DB if it looks like a UUID; otherwise just use as-is
  const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuidRe.test(clean)){
    return[clean];
  }

  const {data,error}=await supabase
    .from("child_profiles")
    .select("id,child_uid")
    .or(`id.eq.${clean},child_uid.eq.${clean}`)
    .limit(1);

  if(error){
    console.warn("[useChildPointsRollup] resolveChildIds error",error);
  }

  const row=(data?.[0]??null) as {id:string;child_uid:string}|null;
  if(!row)return Array.from(new Set([clean]));
  return Array.from(new Set([clean,row.id,row.child_uid].filter(Boolean)));
}

export function useChildPointsRollup(childId:string|null,days=90){
  const [rows,setRows]=useState<LedgerRow[]>([]);
  const [ids,setIds]=useState<string[]>([]);
  const chRef=useRef<ReturnType<typeof supabase.channel>|null>(null);
  const sigRef=useRef<string>("");

  async function loadOnce(cIds:string[]){
    if(!cIds.length){
      setRows([]);
      return;
    }
    const since=new Date();
    since.setDate(since.getDate()-Math.max(0,days));
    const sinceISO=since.toISOString();

    const [cpl,pl]=await Promise.all([
      supabase.from("child_points_ledger")
        .select("points,created_at,reason,evidence_count,child_uid")
        .in("child_uid",cIds)
        .gte("created_at",sinceISO)
        .order("created_at",{ascending:false}),
      supabase.from("points_ledger")
        // 🔑 points_ledger uses `delta` as the numeric field
        .select("delta,created_at,reason,child_uid")
        .in("child_uid",cIds)
        .gte("created_at",sinceISO)
        .order("created_at",{ascending:false})
    ]);

    if(cpl.error){
      console.warn("[useChildPointsRollup] child_points_ledger error",cpl.error);
    }
    if(pl.error){
      console.warn("[useChildPointsRollup] points_ledger error",pl.error);
    }

    const a:Array<LedgerRow>=Array.isArray(cpl.data)?cpl.data.map((r:any)=>({
      delta:Number(r?.points||0),
      created_at:String(r?.created_at),
      reason:(r?.reason??null) as string|null,
      evidence_count:Number(r?.evidence_count||0)
    })):[];
    const b:Array<LedgerRow>=Array.isArray(pl.data)?pl.data.map((r:any)=>({
      delta:Number(r?.delta||0),
      created_at:String(r?.created_at),
      reason:(r?.reason??null) as string|null,
      evidence_count:0
    })):[];
    const merged=[...a,...b].sort(
      (x,y)=>new Date(y.created_at).getTime()-new Date(x.created_at).getTime()
    );

    setRows(merged);
  }

  const reload=async()=>{
    if(!ids.length)return;
    await loadOnce(ids);
  };

  // Resolve IDs once when childId changes
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const norm=normalizeChildSeed(childId);
      if(!norm){
        setIds([]);
        setRows([]);
        return;
      }
      const resolved=await resolveChildIds(norm);
      if(!cancelled){
        setIds(resolved);
        await loadOnce(resolved);
      }
    })();
    return()=>{ cancelled=true; };
  },[childId,days]);

  // Realtime + manual poke
  useEffect(()=>{
    if(!ids.length){
      try{chRef.current?.unsubscribe();}catch{}
      chRef.current=null;
      sigRef.current="";
      return;
    }
    const sig=`${ids.join(",")}:${days}`;
    if(sig===sigRef.current&&chRef.current)return;
    sigRef.current=sig;
    try{chRef.current?.unsubscribe();}catch{}
    chRef.current=null;

    const ch=supabase.channel(`rollup:${ids.join(":")}`);
    const refresh=()=>{ void loadOnce(ids); };
    ch
      .on("postgres_changes",{event:"*",schema:"public",table:"child_points_ledger"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"points_ledger"},refresh)
      .subscribe();
    chRef.current=ch;

    const onPoke=(e:Event)=>{
      const cid=(e as CustomEvent)?.detail?.childId as string|undefined;
      if(!cid||ids.includes(cid)){
        void loadOnce(ids);
        let c=0;
        const t=setInterval(()=>{
          c++;
          void loadOnce(ids);
          if(c>=5)clearInterval(t);
        },1000);
      }
    };
    window.addEventListener("points:changed",onPoke);

    return()=>{
      try{chRef.current?.unsubscribe();}catch{}
      chRef.current=null;
      window.removeEventListener("points:changed",onPoke);
    };
  },[ids,days]);

  const rollup=useMemo<Rollup>(()=>{
    if(!rows.length)return initial;

    // 🚫 Ignore pure approval duplicates from child_points_ledger
    const filteredRows=rows.filter((r)=>{
      const reason=(r.reason||"").toLowerCase().trim();
      if(reason==="target approved")return false;
      return true;
    });

    if(!filteredRows.length)return initial;

    const now=new Date();
    const ty=now.getFullYear();
    const tm=now.getMonth();
    const td=now.getDate();

    const normalized=filteredRows.map((r)=>{
      const raw=Number(r?.delta??0);
      const pts=Number.isFinite(raw)?raw:0;
      const ptsPos=pts>0?pts:0;
      const hasEvidence=Number(r?.evidence_count||0)>0;
      const quick=!hasEvidence;
      const isGame=isGameReason(r?.reason||null);

      const d=new Date(r.created_at);
      const isToday=d.getFullYear()===ty&&d.getMonth()===tm&&d.getDate()===td;

      return {pts,ptsPos,hasEvidence,quick,isGame,isToday};
    });

    if(!normalized.length)return initial;

    const walletNetRaw=normalized.reduce((s,r)=>s+r.pts,0);
    const totalEarnedRaw=normalized.reduce((s,r)=>s+r.ptsPos,0);

    const totalCompletions=normalized.filter((r)=>r.ptsPos>0).length;
    const withEvidence=normalized.filter((r)=>r.hasEvidence&&r.ptsPos>0).length;
    const quickCount=normalized.filter((r)=>r.quick&&r.ptsPos>0).length;

    const playGamePointsRaw=normalized.reduce(
      (s,r)=>s+((r.isGame&&r.ptsPos>0)?r.ptsPos:0),
      0
    );

    const gamePointsToday=normalized.reduce(
      (s,r)=>s+((r.isGame&&r.isToday&&r.ptsPos>0)?r.ptsPos:0),
      0
    );

    const gameExcessToday=Math.max(0,gamePointsToday-GAME_DAILY_CAP);
    const gamePointsTodayRemaining=Math.max(0,GAME_DAILY_CAP-gamePointsToday);
    const gameCapReached=gamePointsToday>=GAME_DAILY_CAP;

    // Apply cap only to wallet + game totals (not to negative adjustments)
    const walletNetCapped=Math.max(0,walletNetRaw-gameExcessToday);
    const totalEarnedCapped=Math.max(0,totalEarnedRaw-gameExcessToday);
    const playGamePointsCapped=Math.max(0,playGamePointsRaw-gameExcessToday);

    return {
      totalPoints:walletNetCapped,
      totalEarned:totalEarnedCapped,
      totalCompletions,
      withEvidence,
      quickCount,
      playGamePoints:playGamePointsCapped,
      gameDailyCap:GAME_DAILY_CAP,
      gamePointsToday:Math.min(gamePointsToday,GAME_DAILY_CAP),
      gamePointsTodayRemaining,
      gameCapReached
    };
  },[rows]);

  return {...rollup,reload};
}
