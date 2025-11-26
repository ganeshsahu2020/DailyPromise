// src/routes/admin/AdminResetPassword.tsx
import {supabase} from "@/lib/supabase";
import {tpromise} from "@/utils/toastx";
import {useState} from "react";

export default function AdminResetPassword(){
  const [email,setEmail] = useState("");
  const [msg,setMsg] = useState<string|undefined>();
  const [loading,setLoading] = useState(false);

  async function onReset(){
    setLoading(true);
    try{
      await tpromise(
        ()=>supabase.auth.resetPasswordForEmail(email,{
          redirectTo: window.location.origin + "/admin/login"
        }),
        {
          loading:"Requesting admin reset link…",
          success:"If this admin email exists, a reset link was sent.",
          error:(e)=>e?.message || "Could not send reset link",
          sound:"success"
        }
      );
      setMsg("If this admin email exists, a reset link was sent.");
    }finally{
      setLoading(false);
    }
  }

  return (
    <div className="px-6 py-10 grid place-items-center">
      <div className="w-full max-w-md glass rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-4">Admin password reset</h1>
        <input
          className="w-full rounded px-3 py-2 text-black mb-2"
          placeholder="Admin email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          aria-label="Admin email"
        />
        <button
          className="w-full bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded disabled:opacity-60"
          onClick={onReset}
          disabled={loading || !email}
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
        {msg && <div className="text-sm text-white/80 mt-2">{msg}</div>}
      </div>
    </div>
  );
}
