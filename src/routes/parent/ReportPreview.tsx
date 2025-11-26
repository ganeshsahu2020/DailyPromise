import {useEffect,useMemo,useRef,useState} from "react";
import {useLocation,useNavigate} from "react-router-dom";
import {supabase} from "@/lib/supabase";
import {signAvatarPath} from "@/lib/storage";
import ProgressTimeLine from "@/components/dashboard/ProgressTimeLine";
import {Gift,Coins,PiggyBank,ShieldCheck,Trophy,Gamepad2,ListChecks,Target,Star,BadgeDollarSign,Info,X,Printer} from "lucide-react";
import PdfReportPreview from "@/components/parent/PdfReportPreview";

/* ----------------------------- Types ----------------------------- */
type Child={id?:string;child_uid:string;first_name:string;last_name:string|null;nick_name:string|null;age:number|null;avatar_url?:string|null;avatar_path?:string|null;};
type Family={id:string;display_name:string|null};
type KPIs={completed:number;active:number;weeklyCheckins:number;totalPoints:number};

type Wallet={
  child_uid:string;
  earned_points:number;
  spent_points:number;
  reserved_points:number;
  available_points:number;
  balance_points:number;
  rewards_total:number;
};

type EarnBreakdown={daily:number;checklists:number;games:number;targets:number;wishlist:number;rewardsBonus:number;total:number;};
type DayRow={date:string;pts:number};

/* --------------------------- URL helper -------------------------- */
function useQuery(){
  const {search}=useLocation();
  return useMemo(()=>new URLSearchParams(search),[search]);
}

/* ---------------------- Avatar URL ------------------------------- */
function useAvatarUrl(kid:Child|null){
  const [url,setUrl]=useState<string|undefined>();
  const [err,setErr]=useState(false);

  useEffect(()=>{
    let cancelled=false;
    setErr(false);
    (async ()=>{
      if(!kid){setUrl(undefined);return;}
      if(kid.avatar_url&&/^https?:\/\//i.test(kid.avatar_url)){
        if(!cancelled) setUrl(kid.avatar_url);
        return;
      }
      if(kid.avatar_path){
        try{
          const signed=await signAvatarPath(kid.avatar_path,60*60*24*7);
          if(!cancelled) setUrl(signed||undefined);
          return;
        }catch{}
      }
      if(!cancelled) setUrl(undefined);
    })();
    return ()=>{cancelled=true;};
  },[kid?.child_uid,kid?.avatar_url,kid?.avatar_path]);

  return {url,err,setErr};
}

/* ============================ Helpers ============================ */
const ZERO_BREAK:EarnBreakdown={daily:0,checklists:0,games:0,targets:0,wishlist:0,rewardsBonus:0,total:0};
const cleanUuid=(s?:string|null)=>(s||"").toLowerCase().replace(/[^0-9a-f-]/g,"");

function classifyReason(reason:string){
  const r=(reason||"").toLowerCase();
  if(r.includes("daily activity")) return "daily";
  if(r.includes("checklist")) return "checklists";
  if(r.includes("jumping platformer")||r.includes("game test")||r.includes("game")||r.includes("arcade")||r.includes("minigame")) return "games";
  if(r.includes("target")) return "targets";
  if(r.includes("wishlist")||r.includes("wish")) return "wishlist";
  if(["read 10 pages","dusting adventure","block city","blue sky with rainbow","quick forest painting","draw a monkey"].some((k)=>r.includes(k))) return "targets";
  return "rewardsBonus";
}

async function fetchUnifiedWallet(childId:string){
  const {data,error}=await supabase.rpc("api_wallet_child_unified",{p_child:childId});
  if(error||!data) return null;
  const row=Array.isArray(data)?(data[0] as Wallet|undefined):(data as unknown as Wallet|undefined);
  return row??null;
}

async function fetchWishlistEarned(ids:string[],sinceISO?:string|null){
  try{
    let total=0;
    for(const id of ids){
      const {data}=await supabase.rpc("api_child_wishlist_items_resolved",{p_child_uid:id});
      if(Array.isArray(data)) for(const r of data as any[]){
        const v=Number(r?.earned_points??r?.earned_points_resolved??0);
        if(Number.isFinite(v)) total+=v;
      }
    }
    if(total>0&&!sinceISO) return total;
  }catch{}
  try{
    const {data}=await supabase.from("vw_wishlist_earned").select("earned_points_resolved,child_uid").in("child_uid",ids);
    let t=0;
    if(Array.isArray(data)) for(const r of data as any[]){
      const v=Number(r?.earned_points_resolved??0);
      if(Number.isFinite(v)) t+=v;
    }
    return t;
  }catch{ return 0; }
}

function periodToISO(days:number|null){
  if(days===null) return null;
  const d=new Date(); d.setDate(d.getDate()-days);
  return d.toISOString();
}

/* ----- Build a breakdown (positive inflows) and reconcile to wallet ----- */
async function buildBreakdown(ids:string[],walletTotal?:number,sinceISO?:string|null){
  const [pl,cpl]=await Promise.all([
    supabase.from("points_ledger").select("delta,reason,child_uid,created_at").in("child_uid",ids).gte("created_at",sinceISO||"1970-01-01"),
    // ✅ child_points_ledger now uses points and evidence_count
    supabase.from("child_points_ledger").select("points,reason,child_uid,created_at,evidence_count").in("child_uid",ids).gte("created_at",sinceISO||"1970-01-01")
  ]);

  const rows:{pts:number;reason:string}[]=[];
  if(Array.isArray(pl.data)) for(const r of pl.data) if((Number(r.delta)||0)>0) rows.push({pts:Number(r.delta)||0,reason:String(r.reason||"")});
  if(Array.isArray(cpl.data)) for(const r of cpl.data) if((Number(r.points)||0)>0) rows.push({pts:Number(r.points)||0,reason:String(r.reason||"")});

  const b:{[k in keyof EarnBreakdown]:number}={...ZERO_BREAK};
  for(const row of rows){
    const k=classifyReason(row.reason) as keyof EarnBreakdown;
    if(k!=="total") (b as any)[k]+=row.pts;
  }

  const wish=await fetchWishlistEarned(ids,sinceISO);
  if(wish>b.wishlist) b.wishlist=wish;

  const raw=b.daily+b.checklists+b.games+b.targets+b.rewardsBonus+b.wishlist;
  if(typeof walletTotal==="number"){
    const delta=Math.round(Number(walletTotal)-raw);
    if(delta!==0) b.rewardsBonus+=delta;
  }
  b.total=typeof walletTotal==="number"?Number(walletTotal):(b.daily+b.checklists+b.games+b.targets+b.rewardsBonus+b.wishlist);
  return b as EarnBreakdown;
}

/* ----- Build a 30-day positive-points series (points_ledger + child_points_ledger) ----- */
async function buildLast30Days(ids:string[]):Promise<DayRow[]>{
  const sinceISO=periodToISO(30)!;
  const [pl,cpl]=await Promise.all([
    supabase.from("points_ledger").select("delta,created_at,child_uid").in("child_uid",ids).gte("created_at",sinceISO),
    supabase.from("child_points_ledger").select("points,created_at,child_uid,evidence_count").in("child_uid",ids).gte("created_at",sinceISO)
  ]);
  const map=new Map<string,number>();
  const push=(iso:string,inc:number)=>{
    const d=new Date(iso); const key=d.toISOString().slice(0,10);
    map.set(key,(map.get(key)||0)+inc);
  };
  if(Array.isArray(pl.data)) for(const r of pl.data){const v=Number(r?.delta||0); if(v>0) push(r.created_at,v);}
  if(Array.isArray(cpl.data)) for(const r of cpl.data){const v=Number(r?.points||0); if(v>0) push(r.created_at,v);}

  const out:DayRow[]=[];
  const today=new Date(); today.setHours(0,0,0,0);
  for(let i=29;i>=0;i--){
    const d=new Date(today); d.setDate(today.getDate()-i);
    const key=d.toISOString().slice(0,10);
    out.push({date:key,pts:map.get(key)||0});
  }
  return out;
}

/* ============================ Component ========================== */
type PeriodKey="Lifetime"|"90d"|"30d"|"7d"|"1d";
const PERIODS:PeriodKey[]=["Lifetime","90d","30d","7d","1d"];

export default function ReportPreview(){
  const q=useQuery();
  const nav=useNavigate();
  const qChild=q.get("child")||"";
  const view=(q.get("view")||"").toLowerCase();
  const showPdf=view==="pdf";

  const [family,setFamily]=useState<Family|null>(null);
  const [children,setChildren]=useState<Child[]>([]);
  const [child,setChild]=useState<Child|null>(null);
  const [loading,setLoading]=useState(true);
  const [routed,setRouted]=useState(false);
  const [kpis,setKpis]=useState<KPIs>({completed:0,active:0,weeklyCheckins:0,totalPoints:0});

  const {url:avatarUrl,err:avatarErr,setErr:setAvatarErr}=useAvatarUrl(child);

  const [wallet,setWallet]=useState<Wallet|null>(null);
  const [period,setPeriod]=useState<PeriodKey>("Lifetime");
  const [earn,setEarn]=useState<EarnBreakdown>(ZERO_BREAK);
  const [series30,setSeries30]=useState<DayRow[]>([]);
  const chRef=useRef<ReturnType<typeof supabase.channel>|null>(null);
  const idsRef=useRef<string[]>([]);

  /* --------------------------- Bootstrap -------------------------- */
  useEffect(()=>{
    (async ()=>{
      try{
        const sess=await supabase.auth.getSession();
        const user=sess.data.session?.user;
        if(!user){setLoading(false);return;}

        const {data:boot}=await supabase.rpc("api_bootstrap_parent");
        const famId=(Array.isArray(boot)?boot[0]?.family_id:(boot as any)?.family_id) as string|undefined;
        if(!famId){setLoading(false);return;}

        const {data:famRow}=await supabase.from("families").select("id,display_name").eq("id",famId).maybeSingle();
        if(famRow) setFamily(famRow as Family);

        const {data:kids}=await supabase
          .from("child_profiles")
          .select("id,child_uid,first_name,last_name,nick_name,age,avatar_url,avatar_path,family_id")
          .eq("family_id",famId)
          .order("created_at",{ascending:false});

        const list=await Promise.all(
          (kids||[]).map(async (k:any)=>{
            let signed:string|null=null;
            if(k.avatar_path){try{signed=await signAvatarPath(k.avatar_path,60*60*24*7);}catch{}}
            return {
              id:k.id,child_uid:k.child_uid,first_name:k.first_name,last_name:k.last_name,nick_name:k.nick_name,age:k.age,
              avatar_url:signed||k.avatar_url||null,avatar_path:k.avatar_path
            } as Child;
          })
        );
        setChildren(list);

        if(list.length>0){
          const exists=qChild&&list.some((c)=>c.child_uid===qChild||c.id===qChild);
          const chosen=exists?qChild:list[0].child_uid;

          if(!exists&&!routed){
            setRouted(true);
            nav(`/parent/report/preview?child=${encodeURIComponent(chosen)}`,{replace:true});
            return;
          }
          const current=list.find((c)=>c.child_uid===chosen||c.id===chosen)??null;
          setChild(current);
        }else{
          setChild(null);
        }
      }finally{
        setLoading(false);
      }
    })();
  },[qChild,nav,routed]);

  /* ------------------------------ KPIs + Wallet -------------------- */
  useEffect(()=>{
    if(!child?.child_uid) return;
    (async ()=>{
      const uid=child.child_uid;

      let completed=0,active=0,weeklyCheckins=0,totalPoints=0;
      try{
        const {data}=await supabase.from("vw_child_completed_targets").select("target_id").eq("child_uid",uid);
        if(Array.isArray(data)) completed=data.length;
      }catch{}
      try{
        const {data}=await supabase.from("targets").select("status,child_uid").eq("child_uid",uid);
        if(Array.isArray(data)){
          active=(data as any[]).filter((r)=>{
            const s=String(r?.status||"").toLowerCase();
            return s!=="completed"&&s!=="done"&&s!=="fulfilled";
          }).length;
        }
      }catch{}
      try{
        const since=new Date(); since.setDate(since.getDate()-7);
        const {data}=await supabase.from("points_ledger").select("id,created_at,reason").eq("child_uid",uid).gte("created_at",since.toISOString());
        if(Array.isArray(data)){
          weeklyCheckins=(data as any[]).filter((r)=>{
            const reason=String(r?.reason||"").toLowerCase();
            return reason.startsWith("daily activity approved");
          }).length;
        }
      }catch{}
      try{
        const {data}=await supabase.from("points_ledger").select("delta").eq("child_uid",uid);
        if(Array.isArray(data)) totalPoints=(data as any[]).reduce((s,r)=>s+(Number(r?.delta)||0),0);
      }catch{}
      setKpis({completed,active,weeklyCheckins,totalPoints});

      const keyForWallet=child.id||child.child_uid;
      const w=keyForWallet?await fetchUnifiedWallet(keyForWallet):null;
      setWallet(w||null);

      const canonical=cleanUuid(child.id);
      const legacy=cleanUuid(child.child_uid);
      const ids=Array.from(new Set([canonical,legacy].filter(Boolean))) as string[];
      idsRef.current=ids;

      setSeries30(await buildLast30Days(ids));
    })();
  },[child?.child_uid,child?.id]);

  /* ------------------------------ Breakdown --------------------------- */
  useEffect(()=>{
    if(!child?.child_uid) return;
    (async ()=>{
      const sinceISO=
        period==="Lifetime"?null:
        period==="90d"?periodToISO(90):
        period==="30d"?periodToISO(30):
        period==="7d"?periodToISO(7):periodToISO(1);

      const totalForPeriod=period==="Lifetime"?(wallet?.rewards_total??undefined):undefined;
      const b=await buildBreakdown(idsRef.current,totalForPeriod,sinceISO);
      setEarn(b);
    })();
  },[child?.child_uid,period,wallet?.rewards_total]);

  /* ------------------------------ Realtime ------------------------- */
  useEffect(()=>{
    if(!child?.child_uid) return;
    try{chRef.current?.unsubscribe();}catch{}
    const ch=supabase.channel(`parent-report:${child.child_uid}`);

    const refresh=async ()=>{
      const keyForWallet=child.id||child.child_uid;
      const w=keyForWallet?await fetchUnifiedWallet(keyForWallet):null;
      setWallet(w||null);
      const sinceISO=
        period==="Lifetime"?null:
        period==="90d"?periodToISO(90):
        period==="30d"?periodToISO(30):
        period==="7d"?periodToISO(7):periodToISO(1);
      const totalForPeriod=period==="Lifetime"?(w?.rewards_total??undefined):undefined;
      const b=await buildBreakdown(idsRef.current,totalForPeriod,sinceISO);
      setEarn(b);
      setSeries30(await buildLast30Days(idsRef.current));
    };

    ch.on("postgres_changes",
      {event:"*",schema:"public",table:"points_ledger",filter:`child_uid=eq.${child.child_uid}`},
      refresh
    ).on("postgres_changes",
      {event:"*",schema:"public",table:"reward_offers",filter:`child_uid=eq.${child.child_uid}`},
      refresh
    ).subscribe();
    chRef.current=ch;
    return ()=>{try{chRef.current?.unsubscribe();}catch{} chRef.current=null;};
  },[child?.child_uid,child?.id,period]);

  /* ----------------------------- UI helpers ---------------------- */
  const friendlyName=child?.nick_name||child?.first_name||"Child";
  const handleSwitch=(uid:string)=>nav(`/parent/report/preview?child=${encodeURIComponent(uid)}${showPdf?"&view=pdf":""}`);
  const openPdf=()=>nav(`/parent/report/preview?child=${encodeURIComponent(child?.child_uid||"")}&view=pdf`);
  const closePdf=()=>nav(`/parent/report/preview?child=${encodeURIComponent(child?.child_uid||"")}`);
  const printPdf=()=>window.print();

  const adjustmentToMatchWallet=useMemo(()=>{
    const withoutBonus=earn.daily+earn.checklists+earn.games+earn.targets+earn.wishlist;
    return (period==="Lifetime"?(wallet?.rewards_total||0):earn.total)-withoutBonus;
  },[earn.daily,earn.checklists,earn.games,earn.targets,earn.wishlist,earn.total,period,wallet?.rewards_total]);

  if(loading){return <div className="text-white/70">Loading report…</div>;}

  /* ----------------------------- PDF-ONLY VIEW --------------------- */
  if(showPdf){
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-white/80 text-sm">{family?.display_name?`${family.display_name} • `:""}{friendlyName}</div>
          <div className="flex gap-2">
            <button onClick={printPdf} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500/40 inline-flex items-center gap-1">
              <Printer className="w-4 h-4"/> Print PDF
            </button>
            <button onClick={closePdf} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 inline-flex items-center gap-1">
              <X className="w-4 h-4"/> Close
            </button>
          </div>
        </div>

        <PdfReportPreview
          child={child}
          family={family}
          kpis={kpis}
          wallet={wallet}
          earn={earn}
          series30={series30}
          period={period}
          avatarUrl={avatarUrl}
        />
      </div>
    );
  }

  /* ----------------------------- NORMAL VIEW ---------------------- */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">{`Progress Report${child?` — ${friendlyName}`:""}`}</h1>
            <p className="text-white/70">{family?.display_name?`${family.display_name} • `:""}Generated {new Date().toLocaleString()}</p>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <select className="dx" value={child?.child_uid||""} onChange={(e)=>handleSwitch(e.target.value)}>
            {children.length===0?(
              <option value="">No children</option>
            ):children.map((c)=>(
              <option key={c.child_uid} value={c.child_uid}>
                {(c.nick_name||c.first_name)+(typeof c.age==="number"?` (age ${c.age})`:"")}
              </option>
            ))}
          </select>

          <button onClick={openPdf} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500/40">
            Open Professional PDF
          </button>
        </div>
      </div>

      {/* Profile Card */}
      <div className="glass rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center overflow-hidden">
            {avatarUrl&&!avatarErr?(
              <img src={avatarUrl} className="h-full w-full object-cover" onError={()=>setAvatarErr(true)}/>
            ):(
              <span className="text-3xl">👤</span>
            )}
          </div>
          <div>
            <div className="text-xl font-semibold text-white">{friendlyName}</div>
            <div className="text-white/70 text-sm">
              Age: {child?.age??"—"} • Canonical: <span className="font-mono">{child?.id||"—"}</span> • Legacy: <span className="font-mono">{child?.child_uid||"—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Tile icon={<Gift className="w-5 h-5 text-sky-300"/>} title="Rewards Total" tip="(RPC) Lifetime earned = Σ positive ledger">
          <div className="text-xl font-semibold text-sky-300">{wallet?.rewards_total??0} pts</div>
          <div className="text-xs text-white/50">Unified wallet</div>
        </Tile>
        <Tile icon={<PiggyBank className="w-5 h-5 text-emerald-300"/>} title="Available" tip="(RPC) Earned − Spent − Reserved">
          <div className="text-xl font-semibold text-emerald-300">{wallet?.available_points??0} pts</div>
        </Tile>
        <Tile icon={<Coins className="w-5 h-5 text-white"/>} title="Balance" tip="(RPC) Earned − Spent = Available + Reserved">
          <div className="text-xl font-semibold">{wallet?.balance_points??0} pts</div>
          <div className="text-[10px] text-white/50">Available + Reserved</div>
        </Tile>
        <Tile icon={<ShieldCheck className="w-5 h-5 text-amber-300"/>} title="Reserved" tip="(RPC) Accepted offers on hold">
          <div className="text-xl font-semibold text-amber-300">{wallet?.reserved_points??0} pts</div>
        </Tile>
        <Tile icon={<Trophy className="w-5 h-5 text-rose-200"/>} title="Total Spent" tip="(RPC) Σ negative ledger">
          <div className="text-xl font-semibold text-rose-200">{wallet?.spent_points??0} pts</div>
        </Tile>
      </div>

      {/* Earnings Breakdown */}
      <div className="glass rounded-2xl p-5 border border-white/10 bg-slate-900/30">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <BadgeDollarSign className="w-5 h-5 text-emerald-300"/>
            <h2 className="text-white font-semibold">Earnings Breakdown</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">Timeframe</span>
            <select className="dx" value={period} onChange={(e)=>setPeriod(e.target.value as PeriodKey)}>
              {["Lifetime","90d","30d","7d","1d"].map((p)=>(<option key={p} value={p}>{p}</option>))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <BreakCard icon={<SunburstIcon/>} label="My Daily" value={earn.daily} tone="emerald"/>
          <BreakCard icon={<ListChecks className="w-5 h-5"/>} label="My Checklists" value={earn.checklists} tone="sky"/>
          <BreakCard icon={<Gamepad2 className="w-5 h-5"/>} label="Play Game" value={earn.games} tone="violet"/>
          <BreakCard icon={<Target className="w-5 h-5"/>} label="Completed Targets" value={earn.targets} tone="cyan"/>
          <BreakCard icon={<Star className="w-5 h-5"/>} label="My Wishlist" value={earn.wishlist} tone="pink"/>
          <BreakCard icon={<Trophy className="w-5 h-5"/>} label="Other / Adjust" value={Math.max(0,earn.rewardsBonus)} tone="yellow"/>
        </div>

        <div className="mt-2 text-[12px] text-white/60">
          Adjustment to match {period==="Lifetime"?"wallet":"sum"}:{" "}
          <span className={adjustmentToMatchWallet>=0?"text-emerald-300":"text-rose-300"}>
            {adjustmentToMatchWallet>=0?"+":""}{adjustmentToMatchWallet} pts
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {label:"Targets Completed",value:kpis.completed},
          {label:"Active Targets",value:kpis.active},
          {label:"Weekly Check-ins",value:kpis.weeklyCheckins},
          {label:"Total Points",value:kpis.totalPoints},
        ].map((k)=>(
          <div key={k.label} className="glass-premium rounded-2xl p-4 text-center border border-white/20">
            <div className="text-2xl font-bold text-white">{k.value}</div>
            <div className="text-white/60 text-sm">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="glass rounded-2xl p-5">
        <h2 className="text-lg font-bold text-white mb-3">Recent Activity</h2>
        {child?.child_uid?(
          <ProgressTimeLine childUid={child.child_uid}/>
        ):(
          <div className="text-white/70">Select a child to view timeline.</div>
        )}
      </div>

      <div className="text-xs text-white/50">Generated • {new Date().toLocaleDateString()}</div>
    </div>
  );
}

/* ---------------- UI subcomponents ---------------- */
function Tile({icon,title,tip,children}:{icon:React.ReactNode;title:string;tip?:string;children:React.ReactNode;}){
  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-3 text-white">
        <div className="p-2 rounded-xl bg-white/10 border border-white/10">{icon}</div>
        <div>
          <div className="text-xs text-white/60 flex items-center">
            {title}
            {tip&&<Info className="w-3.5 h-3.5 ml-1 text-white/50" title={tip}/>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function BreakCard({icon,label,value,tone="emerald"}:{icon:React.ReactNode;label:string;value:number;tone?:"emerald"|"sky"|"violet"|"cyan"|"yellow"|"pink";}){
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

function SunburstIcon(){
  return (
    <div className="w-5 h-5 relative">
      <div className="absolute inset-0 rounded-full border border-yellow-300/60"/>
      <div className="absolute inset-0 animate-ping rounded-full bg-yellow-300/20"/>
    </div>
  );
}
