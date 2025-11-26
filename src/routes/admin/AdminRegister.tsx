// src/routes/admin/AdminRegister.tsx
import {supabase} from "@/lib/supabase";
import {tpromise} from "@/utils/toastx";
import {useState} from "react";

export default function AdminRegister(){
  const [fn,setFn] = useState("");
  const [ln,setLn] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [confirm,setConfirm] = useState("");
  const [error,setError] = useState<string|undefined>();
  const [ok,setOk] = useState(false);
  const [loading,setLoading] = useState(false);

  async function onRegister(){
    setError(undefined);
    if(!email || !password){
      setError("Email and password are required");
      return;
    }
    if(password!==confirm){
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try{
      await tpromise(
        ()=>supabase.auth.signUp({
          email,
          password,
          options:{data:{role:"admin",first_name:fn,last_name:ln}}
        }),
        {
          loading:"Creating admin account…",
          success:"Admin account created. Please check your email to confirm.",
          error:(e)=>e?.message || "Could not create admin account",
          sound:"success"
        }
      );
      setOk(true);
    }finally{
      setLoading(false);
    }
  }

  function onKeyDown(e:React.KeyboardEvent<HTMLDivElement>){
    if(e.key==="Enter") onRegister();
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 grid place-items-center" onKeyDown={onKeyDown}>
      <div className="w-full max-w-md glass rounded-2xl p-5">
        <h1 className="text-xl font-bold mb-3">Create Admin Account</h1>
        <p className="text-sm text-white/70 mb-3">
          Use only for internal administrator provisioning.
        </p>

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
          placeholder="Admin email"
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

        {error && <div className="text-red-300 text-sm mb-3">{error}</div>}
        {ok && (
          <div className="text-emerald-300 text-sm mb-3">
            Admin created. Confirm via email, then sign in at /admin/login.
          </div>
        )}

        <button
          className="w-full bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded text-white text-sm disabled:opacity-60"
          onClick={onRegister}
          disabled={loading}
        >
          {loading ? "Creating admin…" : "Sign up admin"}
        </button>
      </div>
    </div>
  );
}
