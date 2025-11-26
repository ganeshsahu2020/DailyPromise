import {supabase}from "@/lib/supabase";
import {tpromise}from "@/utils/toastx";
import {useState}from "react";
import HumanCheck from "@/components/auth/HumanCheck";
import {useNavigate}from "react-router-dom";

const CONFETTI_EMOJIS=["🌸","⭐","✨","🌈","🎉"];

const CelebrationStyles=()=>( // minimal local styles for falling emojis
  <style
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{
      __html:`
      @keyframes dp-fall {
        0% { transform: translate3d(0,-120%,0) rotate(0deg); opacity:0; }
        10% { opacity:1; }
        100% { transform: translate3d(0,120vh,0) rotate(360deg); opacity:0; }
      }
      .dp-confetti {
        position:absolute;
        top:-10%;
        font-size:22px;
        animation: dp-fall 4.8s linear infinite;
        pointer-events:none;
      }
    `,
    }}
  />
);

const CelebrationOverlay=({
  email,
  onClose,
  onLogin,
}:{email:string; onClose:()=>void; onLogin:()=>void})=>(
  <>
    <CelebrationStyles/>
    {/* floating emojis */}
    <div className="fixed inset-0 z-30 overflow-hidden pointer-events-none">
      {CONFETTI_EMOJIS.map((emoji,idx)=>(
        <span
          key={idx}
          className="dp-confetti"
          style={{
            left:`${8+idx*18}%`,
            animationDelay:`${idx*0.35}s`,
          }}
        >
          {emoji}
        </span>
      ))}
    </div>

    {/* tiny glass modal */}
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl max-w-sm w-[90%] p-5 text-center relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 text-white/60 hover:text-white text-sm"
        >
          ✕
        </button>

        <div className="text-3xl mb-2">🎉</div>
        <h2 className="text-lg font-semibold mb-1">
          Congratulations, your details are saved!
        </h2>
        <p className="text-xs text-white/75 mb-3">
          We’ve created your DailyPromise parent account and stored your details securely.
        </p>
        <p className="text-xs text-emerald-200 mb-3">
          Next step: open the inbox for{" "}
          <span className="font-semibold">{email||"your email"}</span>, find the
          <span className="font-semibold"> “Confirm your DailyPromise account”</span> email,
          and tap the big button inside.
        </p>
        <p className="text-[11px] text-white/60 mb-4">
          After confirming, come back here and sign in to start setting promises and rewards.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs sm:text-sm"
          >
            I’ll check my email
          </button>
          <button
            type="button"
            onClick={onLogin}
            className="flex-1 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs sm:text-sm text-black font-medium"
          >
            Go to Login
          </button>
        </div>
      </div>
    </div>
  </>
);

export default function Register(){
  const [fn,setFn]=useState("");
  const [ln,setLn]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [error,setError]=useState<string|undefined>();
  const [ok,setOk]=useState(false);
  const [loading,setLoading]=useState(false);
  const [agree,setAgree]=useState(false);
  const [humanOk,setHumanOk]=useState(false);
  const [showCongrats,setShowCongrats]=useState(false);

  const nav=useNavigate();

  async function onRegister(){
    setError(undefined);
    if(!email||!password){setError("Email and password are required");return;}
    if(password!==confirm){setError("Passwords do not match");return;}
    if(!agree){setError("You must agree to the Terms and Conditions");return;}
    if(!humanOk){setError("Please complete the image check to confirm you are human.");return;}

    setLoading(true);
    try{
      await tpromise(
        ()=>supabase.auth.signUp({
          email,
          password,
          options:{
            emailRedirectTo:window.location.origin+"/auth/confirm-email",
            data:{role:"parent",first_name:fn,last_name:ln},
          },
        }),
        {
          loading:"Creating your account…",
          success:"Account created. Please check your email to confirm.",
          error:(e)=>e?.message||"Could not create account",
          sound:"success",
        }
      );
      setOk(true);
      setShowCongrats(true);
    }finally{
      setLoading(false);
    }
  }

  function onKeyDown(e:React.KeyboardEvent<HTMLDivElement>){
    if(e.key==="Enter"){onRegister();}
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 grid place-items-center" onKeyDown={onKeyDown}>
      {showCongrats&&(
        <CelebrationOverlay
          email={email}
          onClose={()=>setShowCongrats(false)}
          onLogin={()=>{
            setShowCongrats(false);
            nav("/auth/login");
          }}
        />
      )}

      <div className="w-full max-w-md glass rounded-2xl p-5">
        <h1 className="text-xl font-bold mb-3">Create Parent Account</h1>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            className="rounded px-3 py-2 text-black text-sm"
            placeholder="First name"
            value={fn}
            onChange={(e)=>setFn(e.target.value)}
          />
          <input
            className="rounded px-3 py-2 text-black text-sm"
            placeholder="Last name"
            value={ln}
            onChange={(e)=>setLn(e.target.value)}
          />
        </div>

        <input
          className="w-full rounded px-3 py-2 text-black mb-2 text-sm"
          placeholder="Email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
        />
        <input
          className="w-full rounded px-3 py-2 text-black mb-2 text-sm"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
        />
        <input
          className="w-full rounded px-3 py-2 text-black mb-3 text-sm"
          placeholder="Confirm Password"
          type="password"
          value={confirm}
          onChange={(e)=>setConfirm(e.target.value)}
        />

        <label className="flex items-start gap-2 text-xs text-slate-100 mb-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={agree}
            onChange={(e)=>setAgree(e.target.checked)}
          />
          <span>
            I agree to the{" "}
            <a href="/terms" className="underline underline-offset-2 hover:text-emerald-300">
              Terms &amp; Conditions
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-emerald-300">
              Privacy Policy
            </a>.
          </span>
        </label>

        <HumanCheck
          title="Step 2 · Confirm you are human"
          subtitle="Tap the two matching images to continue."
          onChange={setHumanOk}
          disabled={loading}
        />

        {error&&<div className="text-red-300 text-sm mb-3">{error}</div>}
        {ok&&<div className="text-emerald-300 text-sm mb-3">Check your email to confirm, then sign in.</div>}

        <button
          className="w-full bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded text-white text-sm disabled:opacity-60"
          onClick={onRegister}
          disabled={loading||!agree||!humanOk}
        >
          {loading?"Creating account…":"Sign up"}
        </button>
      </div>
    </div>
  );
}
