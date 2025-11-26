import {Outlet,useLocation,useNavigate,Link,NavLink}from "react-router-dom";
import {useEffect,useRef,useState,useMemo}from "react";
import {supabase}from "@/lib/supabase";
import {fetchChildBrief,LS_CHILD}from "@/utils/childAuth";
import {
  Menu,
  X,
  Home as HomeIcon,
  CalendarCheck,
  Gamepad2,
  CheckCircle2,
  Gift,
  Heart,
  ClipboardCheck,
  BarChart3,
  User,
  Coins,
  Bell,
  CheckCircle2 as CheckIcon,
  AlertTriangle,
  BookOpen,
}from "lucide-react";
import {toast}from "sonner";
import {notify}from "@/utils/notify";
import Logo from "@/components/brand/Logo";
import {useWallet}from "@/hooks/useWallet";

const FALLBACK_FAMILY_ID="e21c48a8-5d80-4651-8d31-11923353a10c";

/* -------------------- Left nav item -------------------- */
const LeftTab=({
  to,
  label,
  icon:Icon,
  color,
}:{to:string;label:string;icon?:any;color?:string;})=>(
  <NavLink
    to={to}
    className={({isActive})=>
      [
        "px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-3",
        isActive
          ? "bg-white/15 text-white shadow-inner border border-white/20"
          : "text-white/80 hover:text-white hover:bg-white/10 border border-transparent",
      ].join(" ")
    }
  >
    {Icon?<Icon className={["w-4 h-4",color||"text-white/80"].join(" ")}/>:null}
    {label}
  </NavLink>
);

/* -------------------- Unified Wallet -------------------- */
type UnifiedWallet={
  child_uid:string;
  earned_points:number;
  spent_points:number;
  reserved_points:number;
  available_points:number;
  balance_points:number;
  rewards_total:number;
};

async function fetchUnifiedWallet(childId:string):Promise<UnifiedWallet|null>{
  if(!childId)return null;
  const {data,error}=await supabase.rpc("api_wallet_child_unified",{p_child:childId});
  if(error){
    console.warn("[api_wallet_child_unified] error:",error);
    return null;
  }
  const row=Array.isArray(data)?data[0]:null;
  if(!row)return null;

  return {
    child_uid:String(row.child_uid??childId),
    earned_points:Number(row.earned_points??0),
    spent_points:Number(row.spent_points??0),
    reserved_points:Number(row.reserved_points??0),
    available_points:Number(row.available_points??0),
    balance_points:Number(row.balance_points??0),
    rewards_total:Number(row.rewards_total??row.earned_points??0),
  };
}

/* ------------- "effective reserved" fallback (if RPC fails) -------------- */
async function fetchReservedEffectivePoints(
  legacyUid:string|null|undefined,
  canonicalId:string|null|undefined
):Promise<number>{
  const ids=Array.from(new Set([legacyUid,canonicalId].filter(Boolean))) as string[];
  if(ids.length===0)return 0;

  const {data:offers,error:offErr}=await supabase
    .from("reward_offers")
    .select("id,reward_id,child_uid,points_cost,points_cost_override,status")
    .in("child_uid",ids)
    .eq("status","Accepted");
  if(offErr||!offers?.length)return 0;

  const rewardIds=Array.from(new Set((offers.map(o=>o.reward_id).filter(Boolean) as string[])));
  let redeemed:Array<{reward_id:string|null}>=[];

  if(rewardIds.length){
    const {data:rdm,error:rErr}=await supabase
      .from("reward_redemptions")
      .select("reward_id,child_uid,status")
      .in("child_uid",ids)
      .in("reward_id",rewardIds)
      .in("status",["Pending","Approved","Fulfilled"]);
    if(!rErr&&Array.isArray(rdm))redeemed=rdm;
  }

  const redeemedIds=new Set((redeemed??[]).map(r=>r.reward_id).filter(Boolean) as string[]);

  const sum=(offers??[]).reduce((acc,o:any)=>{
    if(o?.reward_id&&redeemedIds.has(o.reward_id))return acc;
    const n=Number(o?.points_cost_override??o?.points_cost??0);
    return acc+(Number.isFinite(n)?n:0);
  },0);
  return sum;
}

/* --------------------------------- Layout ---------------------------------- */
export default function ChildLayout(){
  // ---------- 1) States ----------
  const [childName,setChildName]=useState("Child");
  const [legacyUid,setLegacyUid]=useState<string|null>(null);
  const [canonicalId,setCanonicalId]=useState<string|null>(null);
  const [familyId,setFamilyId]=useState<string>(FALLBACK_FAMILY_ID);

  const [uw,setUW]=useState<UnifiedWallet|null>(null);
  const [reservedFallback,setReservedFallback]=useState<number>(0);

  const [loading,setLoading]=useState(true);
  const [menuOpen,setMenuOpen]=useState(false);

  // ---------- 2) Router ----------
  const navigate=useNavigate();
  const location=useLocation();

  // ---------- 3) Refs ----------
  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);
  const idsSigRef=useRef<string>("");

  // ---------- 4) Wallet hook ----------
  const wallet=useWallet(familyId) as {
    rows?:Array<{child_uid:string;available_points:number;reserved_points:number;rewards_total?:number;}>;
    totals?:{rewards_total?:number;};
    refetch?:()=>Promise<any>;
    refresh?:()=>Promise<any>;
  };
  const rows=wallet?.rows??[];
  const totals=wallet?.totals??{};
  const refetchWallet=wallet?.refetch||wallet?.refresh;

  const activeWalletRow=useMemo(()=>{
    if(!rows.length)return null;
    if(canonicalId){
      const row=rows.find(r=>String(r.child_uid)===String(canonicalId));
      if(row)return row;
    }
    if(legacyUid){
      const row=rows.find(r=>String(r.child_uid)===String(legacyUid));
      if(row)return row;
    }
    return rows[0]??null;
  },[rows,canonicalId,legacyUid]);

  const childIdForReserved:string|null=
    canonicalId||legacyUid||(activeWalletRow?String(activeWalletRow.child_uid):null);

  // ---------- Bootstrap ----------
  useEffect(()=>{
    const key=
      sessionStorage.getItem("child_uid")||
      localStorage.getItem(LS_CHILD);

    if(!key){
      navigate("/child/login");
      return;
    }

    let mounted=true;
    (async()=>{
      try{
        setLoading(true);

        const brief=await fetchChildBrief(key);

        if(!brief){
          console.warn("[ChildLayout] no child brief for key",key,"– clearing cache and redirecting");
          try{
            sessionStorage.removeItem("child_uid");
            sessionStorage.removeItem("child_id");
            localStorage.removeItem(LS_CHILD);
            localStorage.removeItem("child_portal_family_id");
          }catch{}
          if(mounted)navigate("/child/login");
          return;
        }

        const cid=brief.id;
        const uid=brief.child_uid;
        const fam=
          brief.family_id||
          localStorage.getItem("child_portal_family_id")||
          FALLBACK_FAMILY_ID;

        if(!mounted)return;
        setCanonicalId(cid);
        setLegacyUid(uid);
        setFamilyId(fam);
        setChildName(brief.nick_name||brief.first_name||"Child");

        const idForWallet=cid||uid;
        try{
          const snap=await fetchUnifiedWallet(String(idForWallet));
          if(mounted)setUW(snap);
        }catch{
          if(mounted)setUW(null);
        }

        try{
          const sum=await fetchReservedEffectivePoints(uid,cid);
          if(mounted)setReservedFallback(sum);
        }catch{
          if(mounted)setReservedFallback(0);
        }
      }catch(e){
        console.error("[ChildLayout bootstrap]",e);
        toast.error("Could not load child info",{description:String(e)});
      }finally{
        if(mounted)setLoading(false);
      }
    })();

    return()=>{
      mounted=false;
    };
  },[navigate]);

  // Close drawer on route change
  useEffect(()=>{
    setMenuOpen(false);
  },[location.pathname]);

  // Recompute unified wallet + fallback when IDs change
  useEffect(()=>{
    let alive=true;
    (async()=>{
      if(!legacyUid&&!canonicalId)return;
      const idForWallet=canonicalId||legacyUid;

      try{
        const snap=await fetchUnifiedWallet(String(idForWallet));
        if(alive)setUW(snap);
      }catch{
        // keep last
      }

      try{
        const sum=await fetchReservedEffectivePoints(legacyUid,canonicalId);
        if(alive)setReservedFallback(sum);
      }catch{
        // ignore
      }
    })();
    return()=>{
      alive=false;
    };
  },[legacyUid,canonicalId]);

  // Realtime wallet + cash-out heads-up
  useEffect(()=>{
    const idForEvents=childIdForReserved;
    if(!idForEvents)return;

    const sig=`${idForEvents}`;
    if(idsSigRef.current===sig&&channelRef.current)return;
    idsSigRef.current=sig;

    try{
      channelRef.current?.unsubscribe();
    }catch{}
    channelRef.current=null;

    const ch=supabase.channel(`child-layout:${idForEvents}`);

    const softRefresh=async()=>{
      try{
        const idForWallet=canonicalId||legacyUid||idForEvents;
        const snap=await fetchUnifiedWallet(String(idForWallet));
        setUW(snap);
      }catch{
        // keep last
      }
      try{
        const sum=await fetchReservedEffectivePoints(legacyUid,canonicalId);
        setReservedFallback(sum);
      }catch{
        // no-op
      }
      try{
        await refetchWallet?.();
      }catch{}
    };

    const bind=(table:string,event:"*"|"INSERT"|"UPDATE"|"DELETE"="*")=>{
      ch.on(
        "postgres_changes",
        {event,schema:"public",table,filter:`child_uid=eq.${idForEvents}`},
        ()=>void softRefresh()
      );
    };

    bind("points_ledger");
    bind("reward_offers");
    bind("reward_redemptions");

    const handleCashoutUpdate=(payload:any)=>{
      const prev=payload?.old?.status as string|undefined;
      const next=payload?.new?.status as string|undefined;
      if(!next||prev===next)return;

      const pts=Number(payload?.new?.requested_points??0)||0;
      const cents=Number(payload?.new?.currency_cents??0)||0;
      const dollars=(cents/100).toFixed(2);

      switch(next){
        case "Approved":
          notify.success("Cash-out approved! 🎉",{
            description:`You can accept $${dollars} for ${pts} pts.`,
          });
          break;
        case "Rejected":
          notify.warning?.("Cash-out rejected",{
            description:"Ask a parent for details.",
          })||notify.info("Cash-out rejected",{description:"Ask a parent for details."});
          break;
        case "Accepted":
          notify.info("Cash-out accepted ✅",{
            description:`Waiting for payment of $${dollars}.`,
          });
          break;
        case "Fulfilled":
          notify.success("Paid! 💸",{
            description:`You received $${dollars}. Nice work!`,
          });
          break;
        default:
          break;
      }
    };

    ch.on(
      "postgres_changes",
      {
        event:"UPDATE",
        schema:"public",
        table:"points_redemption_requests",
        filter:`child_uid=eq.${idForEvents}`,
      },
      handleCashoutUpdate
    );

    ch.subscribe();
    channelRef.current=ch;

    return()=>{
      try{
        channelRef.current?.unsubscribe();
      }catch{}
      channelRef.current=null;
    };
  },[childIdForReserved,legacyUid,canonicalId,refetchWallet]);

  // ------- Derived numbers (kept for logic/debug, not shown in UI labels) -------
  const available=
    uw?Math.max(0,Number(uw.available_points??0))
       :Math.max(0,Number(activeWalletRow?.available_points??0));

  const reserved=
    uw?Math.max(0,Number(uw.reserved_points??0))
       :Math.max(
         0,
         Number.isFinite(Number(activeWalletRow?.reserved_points))
           ?Number(activeWalletRow?.reserved_points)
           :reservedFallback
       );

  const balance=
    uw?Math.max(0,Number(uw.balance_points??(available+reserved)))
       :Math.max(0,available+reserved);

  const rewardsTotal=
    uw?Math.max(0,Number(uw.rewards_total??uw.earned_points??0))
       :Math.max(
         0,
         (activeWalletRow?.rewards_total as number|undefined)
           ??(totals?.rewards_total as number|undefined)
           ??balance
       );

  if(loading){
    return(
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/70">Loading…</div>
      </div>
    );
  }

  // ------- Left navigation order -------
  const leftNav=[
    {label:"My Dashboard",to:"/child",icon:HomeIcon,color:"text-sky-300"},
    {label:"My Daily Activities",to:"/child/daily-activity",icon:CalendarCheck,color:"text-emerald-300"},
    {label:"My Targets",to:"/child/targets",icon:CheckCircle2,color:"text-indigo-300"},
    {label:"My Completed Targets",to:"/child/completed",icon:CheckCircle2,color:"text-lime-300"},
    {label:"My Checklists",to:"/child/checklists",icon:ClipboardCheck,color:"text-cyan-300"},
    {label:"My Wishlist",to:"/child/wishlist",icon:Heart,color:"text-pink-300"},
    {label:"Play Games",to:"/child/game",icon:Gamepad2,color:"text-indigo-300"},
    {label:"Magic Story Maker",to:"/child/magic-story-maker",icon:BookOpen,color:"text-rose-300"},
    {label:"My Story Library",to:"/child/story-library",icon:BookOpen,color:"text-orange-300"},
    {label:"My Rewards",to:"/child/rewards",icon:Gift,color:"text-yellow-300"},
    {label:"My Reports",to:"/child/reports",icon:BarChart3,color:"text-teal-300"},
    {label:"My Earnings",to:"/child/earnings",icon:Coins,color:"text-amber-300"},
    {label:"My Points Guide",to:"/child/points-guide",icon:BookOpen,color:"text-sky-200"},
    {label:"My Profile",to:"/child/profile",icon:User,color:"text-purple-300"},
  ] as const;

  async function refreshLight(){
    try{
      const idForWallet=canonicalId||legacyUid||activeWalletRow?.child_uid;
      if(!idForWallet)throw new Error("Missing child id");

      const snap=await fetchUnifiedWallet(String(idForWallet));
      setUW(snap);

      try{
        const sum=await fetchReservedEffectivePoints(legacyUid,canonicalId);
        setReservedFallback(sum);
      }catch{}

      try{
        await refetchWallet?.();
      }catch{}

      toast.success("Points refreshed",{description:"Wallet is up to date ✨"});
    }catch(e){
      toast.error("Refresh failed",{description:String(e)});
    }
  }

  function handleLogout(){
    try{
      sessionStorage.removeItem("child_uid");
      sessionStorage.removeItem("child_id");
      localStorage.removeItem(LS_CHILD);
      localStorage.removeItem("child_portal_family_id");
    }finally{
      navigate("/");
    }
  }

  return(
    <div
      className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
      data-child-layout="1"
      data-wallet-balance={balance}
      data-wallet-available={available}
      data-wallet-reserved={reserved}
      data-wallet-total={rewardsTotal}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo and Welcome */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Logo variant="wordmark" size={60} className="shrink-0"/>
            <div className="leading-tight truncate">
              <div className="text-sm font-semibold text-white truncate">
                Welcome, {childName}! <span aria-hidden>👋</span>
              </div>
              <div className="text-xs text-white/70">
                Ready for your next promise.
              </div>
            </div>
          </div>

          {/* Right-side actions */}
          <div className="hidden md:flex items-center gap-2 flex-1 justify-end">
            <div className="flex items-center gap-1 mr-2">
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center gap-1 transition-colors"
                onClick={()=>notify.info("Ding! Notification sound")}
                title="Test info notification"
              >
                <Bell className="w-3.5 h-3.5"/>
                Ding
              </button>
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white border border-emerald-500/30 flex items-center gap-1 transition-colors"
                onClick={()=>notify.success("Success! Great job 🎉")}
                title="Test success"
              >
                <CheckIcon className="w-3.5 h-3.5"/>
                Success
              </button>
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs bg-rose-600/80 hover:bg-rose-700 text-white border border-rose-500/30 flex items-center gap-1 transition-colors"
                onClick={()=>notify.error(new Error("Oops, try again"))}
                title="Test error"
              >
                <AlertTriangle className="w-3.5 h-3.5"/>
                Error
              </button>
            </div>

            <button
              onClick={()=>void refreshLight()}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors border border-white/10"
            >
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white text-sm font-medium transition-colors border border-red-500/30"
            >
              Logout
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            onClick={()=>setMenuOpen(true)}
          >
            <Menu className="w-5 h-5 text-white"/>
          </button>
        </div>

        {/* Mobile header actions (no points chips) */}
        <div className="md:hidden px-4 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={()=>void refreshLight()}
              className="flex-1 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors border border-white/10"
            >
              Refresh
            </button>
            <button
              onClick={()=>notify.info("Ding! Notification sound")}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors border border-white/10"
              aria-label="Test notification sound"
            >
              🔔
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white text-sm font-medium transition-colors border border-red-500/30"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-80 hidden lg:flex flex-col border-r border-white/10 bg-slate-900/80 backdrop-blur sticky top-16 self-start h-[calc(100vh-4rem)]">
          <div className="p-6 border-b border-white/10">
            <div className="mb-3">
              <Logo variant="icon" size={60}/>
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">My Adventure Hub</h2>
            <p className="text-xs text-white/60">Choose your next mission</p>
          </div>

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto" aria-label="Child navigation">
            {leftNav.map(n=>(
              <LeftTab key={n.to} to={n.to} label={n.label} icon={n.icon} color={n.color}/>
            ))}
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className="text-xs text-white/40 text-center">
              Ready to achieve your targets! 🚀
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          <main className="flex-1 p-6">
            <div className="max-w-6xl mx-auto">
              <div className="glass rounded-2xl p-6 border border-white/10 bg-slate-800/30 backdrop-blur">
                <Outlet/>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Drawer */}
      <div
        className={[
          "lg:hidden fixed inset-0 z-50 transition",
          menuOpen?"opacity-100":"opacity-0 pointer-events-none",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute inset-0 bg-black/70" onClick={()=>setMenuOpen(false)}/>
        <div
          className={[
            "absolute left-0 top-0 bottom-0 w-80",
            "bg-slate-900/95 border-r border-white/10 backdrop-blur",
            "shadow-2xl p-6 transition-transform flex flex-col",
            menuOpen?"translate-x-0":"-translate-x-full",
          ].join(" ")}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Logo variant="icon" size={40}/>
              <div className="text-white font-semibold">My Adventure Menu</div>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-xl p-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors"
              aria-label="Close menu"
              onClick={()=>setMenuOpen(false)}
            >
              <X className="w-5 h-5"/>
            </button>
          </div>

          {/* Mobile Nav (no points grid) */}
          <nav className="flex-1 space-y-2 overflow-y-auto" aria-label="Child mobile navigation">
            {[
              {label:"My Dashboard",to:"/child"},
              {label:"My Daily Activities",to:"/child/daily-activity"},
              {label:"My Targets",to:"/child/targets"},
              {label:"My Completed Targets",to:"/child/completed"},
              {label:"My Checklists",to:"/child/checklists"},
              {label:"My Wishlist",to:"/child/wishlist"},
              {label:"Play Games",to:"/child/game"},
              {label:"Magic Story Maker",to:"/child/magic-story-maker"},
              {label:"My Story Library",to:"/child/story-library"},
              {label:"My Rewards",to:"/child/rewards"},
              {label:"My Reports",to:"/child/reports"},
              {label:"My Earnings",to:"/child/earnings"},
              {label:"My Points Guide",to:"/child/points-guide"},
              {label:"My Profile",to:"/child/profile"},
            ].map(n=>(
              <Link
                key={n.to}
                to={n.to}
                className={[
                  "px-4 py-3 rounded-xl text-sm font-medium border border-white/10",
                  "bg-white/5 hover:bg-white/10 text-white/90 block transition-colors",
                  location.pathname===n.to?"bg-white/15 border-white/20":"",
                ].join(" ")}
                onClick={()=>setMenuOpen(false)}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          {/* Mobile Actions */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={()=>{
                  void refreshLight();
                  setMenuOpen(false);
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors border border-white/10"
              >
                Refresh Points
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
