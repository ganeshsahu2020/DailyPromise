// src/routes/parent/ParentLayout.tsx
import { Outlet, Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ok, tpromise } from "@/utils/toastx";
import {
  Menu,
  X,
  Users,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Home as HomeIcon,
  CalendarCheck,
  Target as TargetIcon,
  Gift,
  ClipboardCheck,
  QrCode,
  KeyRound,
  Heart,
  UserCog,
} from "lucide-react";
import { notify } from "@/utils/notify";
import Logo from "@/components/brand/Logo";

export default function ParentLayout(){
  const [user,setUser] = useState<any>(null);
  const [role,setRole] = useState<string|undefined>();
  const [mobileOpen,setMobileOpen] = useState(false);
  const [pendingChildTargets,setPendingChildTargets] = useState(0);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(()=>{
    supabase.auth.getUser().then(async({data})=>{
      const u = data.user ?? null;
      setUser(u);
      let r = u?.user_metadata?.role as string|undefined;

      if(!r && u){
        const {data:p} = await supabase
          .from("parent_profiles")
          .select("id")
          .eq("parent_uid",u.id)
          .maybeSingle();
        if(p) r = "parent";
      }
      setRole(r);

      if(loc.pathname==="/" && r==="parent"){
        nav("/parent");
      }
    });

    const {data:sub} = supabase.auth.onAuthStateChange((event,session)=>{
      const u = session?.user ?? null;
      setUser(u);
      setRole(u?.user_metadata?.role);

      if(event==="SIGNED_OUT" || event==="USER_DELETED"){
        setMobileOpen(false);
        ok("You've logged out. See you soon! 👋");
        nav("/",{replace:true});
      }
    });
    return ()=>sub.subscription.unsubscribe();
  },[nav,loc.pathname]);

  // 🔔 Sync Child Targets pending badge from dashboard (localStorage)
  useEffect(()=>{
    function syncBadge(){
      try{
        const raw = localStorage.getItem("aegis_pending_ai_child");
        if(!raw){
          setPendingChildTargets(0);
          return;
        }
        const parsed = JSON.parse(raw) as {child:string;count:number};
        setPendingChildTargets(parsed?.count || 0);
      }catch{
        setPendingChildTargets(0);
      }
    }

    syncBadge();
    window.addEventListener("storage",syncBadge);
    window.addEventListener("aegis-pending-ai-updated",syncBadge as any);
    return ()=>{
      window.removeEventListener("storage",syncBadge);
      window.removeEventListener("aegis-pending-ai-updated",syncBadge as any);
    };
  },[]);

  async function onSignOut(){
    await tpromise(supabase.auth.signOut(),{
      loading:"Signing you out…",
      success:"You've logged out. See you soon! 👋",
      error:"Couldn't sign out. Please try again.",
    });
    setMobileOpen(false);
  }

  type NavItem = {
    label:string;
    to:string;
    icon?:any;
    color?:string;
    section?:string;
    hint?:string;
  };

  const navItems:NavItem[] = [
    {
      label:"Parent Dashboard",
      to:"/parent",
      icon:HomeIcon,
      color:"text-sky-300",
      section:"Overview",
      hint:"See a summary of family points, approvals and recent activity.",
    },
    {
      label:"Child Daily Activities",
      to:"/parent/daily-activities",
      icon:CalendarCheck,
      color:"text-emerald-300",
      section:"Children",
      hint:"Review and approve your child’s daily activities.",
    },
    {
      label:"Child Checklists",
      to:"/parent/checklists",
      icon:ClipboardCheck,
      color:"text-cyan-300",
      section:"Children",
      hint:"Manage recurring chores and routines.",
    },
    {
      label:"Child Targets",
      to:"/parent/targets",
      icon:TargetIcon,
      color:"text-indigo-300",
      section:"Children",
      hint:"Set and track long-term goals for each child.",
    },
    {
      label:"Child Rewards",
      to:"/parent/rewards",
      icon:Gift,
      color:"text-yellow-300",
      section:"Children",
      hint:"Configure rewards that children can earn and redeem.",
    },
    {
      label:"Child Wishlist",
      to:"/parent/wishlist",
      icon:Heart,
      color:"text-pink-300",
      section:"Children",
      hint:"View and curate each child’s wish list.",
    },
    {
      label:"Child Redemptions",
      to:"/parent/redemptions",
      icon:CheckCircle2,
      color:"text-lime-300",
      section:"Children",
      hint:"Approve and track reward redemptions.",
    },
    {
      label:"Child Profile",
      to:"/parent/children",
      icon:Users,
      color:"text-purple-300",
      section:"Children",
      hint:"Edit child profiles, nicknames and avatars.",
    },
    {
      label:"Child Passwords",
      to:"/parent/child-passwords",
      icon:KeyRound,
      color:"text-amber-300",
      section:"Children",
      hint:"Set or reset PINs and passwords for child logins.",
    },
    {
      label:"Child QR Cards",
      to:"/parent/qr-cards",
      icon:QrCode,
      color:"text-teal-300",
      section:"Children",
      hint:"Print QR cards to quickly prefill the child on login.",
    },
    {
      label:"Parent Profile",
      to:"/parent/profile",
      icon:UserCog,
      color:"text-rose-300",
      section:"Account",
      hint:"Update your own profile, avatar and family name.",
    },
  ];

  const Tab = ({
    to,
    label,
    icon:Icon,
    color,
    hint,
  }:{
    to:string;
    label:string;
    icon?:any;
    color?:string;
    hint?:string;
  })=>(
    <NavLink
      to={to}
      title={hint || label}
      className={({isActive})=>
        [
          "px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-3 group",
          isActive
            ? "bg-white/15 text-white shadow-inner border border-white/20"
            : "text-white/80 hover:text-white hover:bg-white/10 border border-transparent",
        ].join(" ")
      }
    >
      {Icon ? (
        <span className="inline-flex items-center justify-center rounded-lg bg-slate-900/60 p-1.5 group-hover:bg-slate-900/90 transition-colors">
          <Icon className={["w-4 h-4",color || "text-white/80"].join(" ")} />
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </NavLink>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-2 sm:gap-4">
          {/* Logo + Wordmark */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* 🔹 Slightly smaller logo so it doesn't crowd the header on mobile */}
            <Logo variant="wordmark" size={44} className="shrink-0" />
            <div className="hidden sm:flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-500/20 to-indigo-500/20 border border-blue-500/30">
                <Users className="w-5 h-5 text-blue-300" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-white">
                  Welcome, Parent! <span aria-hidden>👋</span>
                </div>
                <div className="text-xs text-white/70">Family Management Portal</div>
              </div>
            </div>
          </div>

          {/* Actions (notifications + auth) */}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 mr-2">
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center gap-1"
                onClick={()=>notify.info("Ding! Notification sound")}
                title="Test info notification"
              >
                <Bell className="w-3.5 h-3.5" />
                Ding
              </button>
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white border border-emerald-500/30 flex items-center gap-1"
                onClick={()=>notify.success("Success! Sounds good ✨")}
                title="Test success"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Success
              </button>
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs bg-rose-600/80 hover:bg-rose-700 text-white border border-rose-500/30 flex items-center gap-1"
                onClick={()=>notify.error(new Error("Something went wrong"))}
                title="Test error"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Error
              </button>
            </div>

            {user ? (
              <button
                className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white text-xs sm:text-sm font-medium transition-colors border border-red-500/30"
                onClick={onSignOut}
              >
                Logout
              </button>
            ) : (
              <div className="flex gap-2">
                <Link
                  to="/"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium transition-colors border border-white/10"
                  aria-label="Sign in"
                >
                  Sign in
                </Link>
                <Link
                  to="/auth/register"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-blue-600/80 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium transition-colors border border-blue-500/30"
                  aria-label="Register"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            onClick={()=>setMobileOpen(true)}
          >
            <Menu className="w-5 h-5 text-white" />
          </button>
        </div>
      </header>

      {/* Main Content Area with Sticky Sidebar */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-80 hidden lg:flex flex-col border-r border-white/10 bg-slate-900/80 backdrop-blur sticky top-16 self-start h-[calc(100vh-4rem)]">
          <div className="p-6 border-b border-white/10">
            <div className="mb-3">
              <Logo variant="icon" size={60} />
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">Parent Command Center</h2>
            <p className="text-xs text-white/60">Quick links to every part of your family hub.</p>
          </div>

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto" aria-label="Parent navigation">
            {navItems.map((n,idx)=>{
              const prevSection = idx>0 ? navItems[idx-1].section : undefined;
              const showSectionHeader = n.section && n.section!==prevSection;

              const isChildTargets = n.label==="Child Targets";

              return (
                <div key={n.to}>
                  {showSectionHeader && (
                    <div className="px-2 pb-1 pt-3 text-[11px] font-semibold tracking-wide uppercase text-white/40">
                      {n.section}
                    </div>
                  )}

                  {isChildTargets ? (
                    <NavLink
                      to={n.to}
                      title={n.hint || n.label}
                      className={({isActive})=>
                        [
                          "px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-3 group",
                          isActive
                            ? "bg-white/15 text-white shadow-inner border border-white/20"
                            : "text-white/80 hover:text-white hover:bg-white/10 border border-transparent",
                        ].join(" ")
                      }
                    >
                      {()=>( // label + badge
                        <span className="flex items-center justify-between w-full gap-2">
                          <span className="flex items-center gap-3">
                            {n.icon ? (
                              <span className="inline-flex items-center justify-center rounded-lg bg-slate-900/60 p-1.5 group-hover:bg-slate-900/90 transition-colors">
                                <n.icon className={["w-4 h-4",n.color || "text-white/80"].join(" ")} />
                              </span>
                            ) : null}
                            <span className="truncate">{n.label}</span>
                          </span>
                          {pendingChildTargets>0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-5 px-1.5 rounded-full bg-emerald-500 text-xs font-semibold text-slate-900 shadow-sm">
                              {pendingChildTargets}
                            </span>
                          )}
                        </span>
                      )}
                    </NavLink>
                  ) : (
                    <Tab to={n.to} label={n.label} icon={n.icon} color={n.color} hint={n.hint} />
                  )}
                </div>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className="text-xs text-white/40 text-center">
              Building amazing futures together. 🌟
            </div>
            <div className="mt-2 text-[11px] text-white/40 text-center space-x-2">
              <Link
                to="/terms"
                className="underline underline-offset-2 hover:text-white/70"
              >
                Terms
              </Link>
              <span>·</span>
              <Link
                to="/privacy"
                className="underline underline-offset-2 hover:text-white/70"
              >
                Privacy
              </Link>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
          <main className="flex-1 p-6">
            <div className="max-w-6xl mx-auto">
              <div className="glass rounded-2xl p-6 border border-white/10 bg-slate-800/30 backdrop-blur">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      <div
        className={[
          "lg:hidden fixed inset-0 z-50 transition",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute inset-0 bg-black/70" onClick={()=>setMobileOpen(false)} />
        <div
          className={[
            "absolute left-0 top-0 bottom-0 w-80",
            "bg-slate-900/95 border-r border-white/10 backdrop-blur",
            "shadow-2xl p-6 transition-transform flex flex-col",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Logo variant="icon" size={40} />
              <div className="text-white font-semibold">Parent Menu</div>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-xl p-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white"
              aria-label="Close menu"
              onClick={()=>setMobileOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto" aria-label="Parent mobile navigation">
            {navItems.map((n)=>(
              <Link
                key={n.to}
                to={n.to}
                onClick={()=>setMobileOpen(false)}
                className={[
                  "px-4 py-3 rounded-xl text-sm font-medium border border-white/10 flex items-center gap-3",
                  "bg-white/5 hover:bg-white/10 text-white/90",
                  loc.pathname===n.to ? "bg.white/15 border-white/20" : "",
                ].join(" ")}
              >
                {n.icon ? <n.icon className={["w-4 h-4",n.color || "text-white/80"].join(" ")} /> : null}
                <span className="truncate">{n.label}</span>
              </Link>
            ))}
          </nav>

          {user && (
            <div className="mt-6 space-y-3">
              <button
                className="w-full px-4 py-3 rounded-xl bg-red-600/80 hover:bg-red-700 text-white text-sm font-medium transition-colors border border-red-500/30"
                onClick={onSignOut}
              >
                Sign Out
              </button>
            </div>
          )}

          <div className="mt-4 text-[11px] text-white/40 text-center space-x-2">
            <Link
              to="/terms"
              onClick={()=>setMobileOpen(false)}
              className="underline underline-offset-2 hover:text-white/70"
            >
              Terms
            </Link>
            <span>·</span>
            <Link
              to="/privacy"
              onClick={()=>setMobileOpen(false)}
              className="underline underline-offset-2 hover:text-white/70"
            >
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
