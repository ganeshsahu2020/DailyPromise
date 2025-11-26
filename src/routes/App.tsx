// src/routes/App.tsx
import {useEffect,useRef}from "react";
import {Link,Outlet,useLocation,useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {tpromise}from "@/utils/toastx";
import {unlockAudioOnce}from "@/utils/notify";
import Logo from "@/components/brand/Logo";
import {useAuthUser}from "@/auth/AuthContext";

export default function App(){
  const {user,role,loading}=useAuthUser();
  const nav=useNavigate();
  const loc=useLocation();
  const prevUserRef=useRef<any|undefined>(undefined);

  // 🔊 Unlock audio on first user gesture (Chrome/iOS-safe)
  useEffect(()=>{
    const handleFirstGesture=()=>{
      unlockAudioOnce();
    };

    window.addEventListener("pointerdown",handleFirstGesture,{once:true});

    return()=>{
      window.removeEventListener("pointerdown",handleFirstGesture);
    };
  },[]);

  // Redirect authenticated users away from public home (`/`)
  useEffect(()=>{
    if(loading)return;
    if(!user)return;
    if(loc.pathname!=="/")return;

    if(role==="parent")nav("/parent");
    else if(role==="child")nav("/child");
  },[loading,user,role,loc.pathname,nav]);

  // When a previously logged-in user becomes null (logout in this tab or another tab) → go home
  useEffect(()=>{
    // first run: just record whatever we have, do nothing
    if(prevUserRef.current===undefined){
      prevUserRef.current=user;
      return;
    }

    // previously had a user, now no user → redirect to home
    if(prevUserRef.current&& !user){
      nav("/",{replace:true});
    }

    prevUserRef.current=user;
  },[user,nav]);

  async function onSignOut(){
    await tpromise(supabase.auth.signOut(),{
      loading:"Signing you out…",
      success:"You've logged out. See you soon! 👋",
      error:"Couldn't sign out. Please try again.",
    });
  }

  return(
    <div className="min-h-dvh bg-[var(--brand-deep)] text-[var(--brand-text)]">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Header — aligned to ParentLayout (same height/padding/backdrop) */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 h-16 flex items-center gap-3 sm:gap-4">
          {/* Logo + Wordmark (exact match to ParentLayout usage) */}
          <Link
            to="/"
            className="flex items-center gap-3 sm:gap-4 min-w-0"
            aria-label="DailyPromise Home"
          >
            <Logo variant="wordmark" size={60} className="shrink-0"/>
          </Link>

          {/* Actions (right side) */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {user?(
              <button
                className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-xs sm:text-sm text-white font-medium transition-colors border border-red-500/30"
                onClick={onSignOut}
              >
                Logout
              </button>
            ):(
              <div className="flex gap-1 sm:gap-2">
                <Link
                  to="/auth/login"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs sm:text-sm text-white font-medium transition-colors border border-white/10"
                  aria-label="Sign in"
                >
                  Sign in
                </Link>
                <Link
                  to="/auth/register"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-blue-600/80 hover:bg-blue-700 text-xs sm:text-sm text-white font-medium transition-colors border border-blue-500/30"
                  aria-label="Register"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-3 sm:px-5 lg:px-8 py-5">
        <Outlet/>
      </main>
    </div>
  );
}
