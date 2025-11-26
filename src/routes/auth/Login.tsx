// src/routes/auth/Login.tsx
import {supabase}from "@/lib/supabase";
import {useState}from "react";
import {useNavigate,Link}from "react-router-dom";
import HumanCheck from "@/components/auth/HumanCheck";

export default function Login(){
  const nav=useNavigate();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|undefined>();
  const [humanOk,setHumanOk]=useState(false);

  async function onLogin(){
    if(loading)return;
    if(!humanOk){
      setError("Please complete the image check before signing in.");
      return;
    }

    setLoading(true);
    setError(undefined);
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    setLoading(false);

    if(error){
      const msg=error.message||"Could not sign in";
      const lower=msg.toLowerCase();
      if(lower.includes("confirm")&&lower.includes("email")){
        setError("Please confirm your email from your inbox before signing in.");
      }else{
        setError(msg);
      }
      return;
    }

    const role=data.user?.user_metadata?.role;
    if(role==="parent"){
      nav("/parent");
    }else if(role==="child"){
      nav("/child/login");
    }else{
      nav("/");
    }
  }

  const goChildLogin=()=>nav("/child/login");
  const goChildKiosk=()=>nav("/child/kiosk");

  return(
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mx-auto max-w-5xl grid gap-5 md:grid-cols-2">
        {/* Parent Sign-in */}
        <div className="w-full glass rounded-2xl p-5 relative z-10">
          <h1 className="text-xl font-bold mb-1">Parent Sign in</h1>
          <p className="text-sm text-white/70 mb-3">
            Use your email and password to access the Parent Dashboard. If you just created an account,
            please confirm the email we sent before signing in.
          </p>

          <input
            className="w-full rounded px-3 py-2 text-black mb-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            onKeyDown={(e)=>{
              if(e.key==="Enter"){
                e.preventDefault();
                void onLogin();
              }
            }}
            aria-label="Email"
          />
          <input
            className="w-full rounded px-3 py-2 text-black mb-2 text-sm"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            onKeyDown={(e)=>{
              if(e.key==="Enter"){
                e.preventDefault();
                void onLogin();
              }
            }}
            aria-label="Password"
          />

          <HumanCheck
            title="Step 2 · Confirm you are human"
            subtitle="Tap the two matching images to continue."
            onChange={setHumanOk}
            disabled={loading}
          />

          {error&&<div className="text-red-300 text-sm mb-2">{error}</div>}

          <button
            className="w-full bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded focus-ring text-sm disabled:opacity-60"
            onClick={onLogin}
            disabled={loading||!humanOk}
            aria-label="Sign in as parent"
          >
            {loading?"Signing in…":"Sign in"}
          </button>

          <div className="text-sm text-white/70 mt-2 flex items-center justify-between">
            <Link to="/auth/reset" className="underline">Forgot password?</Link>
            <Link to="/auth/register" className="underline">Create account</Link>
          </div>
        </div>

        {/* Child Quick Entry */}
        <div className="w-full glass rounded-2xl p-5 relative z-10">
          <h2 className="text-xl font-bold mb-1">Child Access</h2>
          <p className="text-sm text-white/70 mb-3">
            Children do not use email. They enter with a Parent-set Password or PIN. You can also use the Kiosk with big keypad and QR.
          </p>

          <div className="grid gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={goChildLogin}
              className="block text-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 focus-ring text-sm"
              aria-label="Open child login"
            >
              Open Child Login
            </button>

            <button
              type="button"
              onClick={goChildKiosk}
              className="block text-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 focus-ring text-sm"
              aria-label="Open child kiosk"
            >
              Open Child Kiosk (Big Keypad / QR)
            </button>
          </div>

          <div className="text-xs text-white/70 mt-3">
            Parents can set passwords or 4–12 digit PINs in <b>Parent → Child Passwords</b>. (Route: <code>/parent/child-passwords</code>)
          </div>
        </div>
      </div>
    </div>
  );
}
