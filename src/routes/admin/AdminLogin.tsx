// src/routes/admin/AdminLogin.tsx
import {supabase} from "@/lib/supabase";
import {useState} from "react";
import {useNavigate,Link} from "react-router-dom";

export default function AdminLogin(){
  const nav = useNavigate();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|undefined>();

  async function onLogin(){
    setLoading(true);
    setError(undefined);

    const {data,error} = await supabase.auth.signInWithPassword({email,password});
    setLoading(false);

    if(error){
      setError("Invalid admin credentials");
      return;
    }

    const role = data.user?.user_metadata?.role;
    if(role!=="admin"){
      setError("You are not authorized as admin");
      // extra safety: sign out non-admin who tried admin login
      await supabase.auth.signOut();
      return;
    }

    nav("/admin");
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 grid place-items-center">
      <div className="w-full max-w-md glass rounded-2xl p-5">
        <h1 className="text-xl font-bold mb-2">Admin Sign in</h1>
        <p className="text-sm text-white/70 mb-3">
          Restricted area. Only DailyPromise administrators are allowed.
        </p>

        <input
          className="w-full rounded px-3 py-2 text-black mb-2 text-sm"
          placeholder="Admin email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          aria-label="Admin email"
        />
        <input
          className="w-full rounded px-3 py-2 text-black mb-3 text-sm"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          aria-label="Password"
        />

        {error && <div className="text-red-300 text-sm mb-2">{error}</div>}

        <button
          className="w-full bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded text-sm disabled:opacity-60"
          onClick={onLogin}
          disabled={loading}
          aria-label="Sign in as admin"
        >
          {loading ? "…" : "Sign in"}
        </button>

        <div className="text-sm text-white/70 mt-2 flex items-center justify-between">
          <Link to="/admin/reset" className="underline">Forgot password?</Link>
          {/* Optional: hide AdminRegister route in production */}
          <Link to="/admin/register" className="underline">Admin setup</Link>
        </div>
      </div>
    </div>
  );
}
