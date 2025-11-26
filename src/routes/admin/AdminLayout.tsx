import {useEffect,useState}from "react";
import {useNavigate,Outlet,Link,NavLink,useLocation}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import Logo from "@/components/brand/Logo";

export default function AdminLayout(){
  const [loading,setLoading]=useState(true);
  const [ok,setOk]=useState(false);
  const [email,setEmail]=useState<string|undefined>();
  const nav=useNavigate();
  const loc=useLocation();

  useEffect(()=>{
    let active=true;
    (async()=>{
      const {data}=await supabase.auth.getUser();
      if(!active)return;
      const u=data.user??null;

      if(!u){
        setLoading(false);
        setOk(false);
        if(!loc.pathname.includes("/admin/login")){
          nav("/admin/login",{replace:true});
        }
        return;
      }

      const role=u.user_metadata?.role as string|undefined;
      if(role!=="admin"){
        await supabase.auth.signOut();
        setLoading(false);
        setOk(false);
        nav("/",{replace:true});
        return;
      }

      setEmail(u.email??undefined);
      setOk(true);
      setLoading(false);
    })();
    return()=>{active=false;};
  },[nav,loc.pathname]);

  async function onSignOut(){
    await supabase.auth.signOut();
    nav("/",{replace:true});
  }

  if(loading){
    return(
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center text-sm text-white/80">
          Checking admin session…
        </div>
      </div>
    );
  }

  if(!ok){
    return null;
  }

  const tabs:{label:string;to:string}[]=[
    {label:"Dashboard",to:"/admin"},
    {label:"Families & Parents",to:"/admin/families"},
    {label:"AI Usage",to:"/admin/ai-usage"},
  ];

  return(
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header with logo */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          {/* Logo + wordmark */}
          <div className="flex items-center gap-3 min-w-0">
            <Logo variant="wordmark" size={60} className="shrink-0"/>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-semibold text-white">
                DailyPromise Admin Console
              </div>
              <div className="text-xs text-white/70">
                System status &amp; analytics
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3 text-xs text-white/70">
            {email&&(
              <span className="hidden sm:inline-block">
                {email}
              </span>
            )}
            <button
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-medium"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Admin nav tabs */}
        <div className="border-t border-white/10 bg-slate-900/90">
          <div className="max-w-7xl mx-auto px-4">
            <nav className="flex gap-2 py-2 text-sm" aria-label="Admin navigation">
              {tabs.map((t)=>(
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={({isActive})=>[
                    "px-3 py-1.5 rounded-xl transition-colors",
                    "border text-xs sm:text-sm",
                    isActive
                      ?"bg-white/15 text-white border-white/25 shadow-inner"
                      :"text-white/75 border-transparent hover:bg-white/10 hover:text-white"
                  ].join(" ")}
                >
                  {t.label}
                </NavLink>
              ))}
              {/* Optional link back to main app */}
              <Link
                to="/"
                className="ml-auto px-3 py-1.5 rounded-xl text-xs sm:text-sm text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
              >
                View app
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main admin content */}
      <main className="flex-1 py-6 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="glass rounded-2xl p-4 sm:p-6 border border-white/10 bg-slate-800/40 backdrop-blur">
            <Outlet/>
          </div>
        </div>
      </main>
    </div>
  );
}
