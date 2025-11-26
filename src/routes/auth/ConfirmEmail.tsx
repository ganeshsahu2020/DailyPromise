import React,{useMemo}from "react";
import {useLocation,useNavigate}from "react-router-dom";

function useSupabaseAuthResult(){
  const location=useLocation();

  return useMemo(()=>{
    const hash=location.hash.startsWith("#")?location.hash.slice(1):location.hash;
    const hashParams=new URLSearchParams(hash);
    const searchParams=new URLSearchParams(location.search);

    const get=(key:string)=>{
      return hashParams.get(key)||searchParams.get(key)||undefined;
    };

    const error=get("error")||get("error_code");
    const errorDescription=get("error_description");
    const type=get("type")||get("event")||undefined;

    return {error,errorDescription,type};
  },[location.hash,location.search]);
}

export default function ConfirmEmail(){
  const nav=useNavigate();
  const {error,errorDescription,type}=useSupabaseAuthResult();

  const hasError=!!error;
  const title=hasError?"Link problem":"Email confirmed";
  const primaryMsg=hasError
    ? (errorDescription||"This email link is invalid or has expired.")
    : "Your email is confirmed. You can now sign in to DailyPromise.";

  const secondaryMsg=hasError
    ? "If this link came from an older email, go back to the sign up screen and request a fresh confirmation email."
    : "You can safely close this tab, or continue to the login screen to start using DailyPromise.";

  const typeLabel=type?`Event: ${type}`:"";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-10 grid place-items-center">
      <div className="w-full max-w-md glass rounded-2xl p-6">
        <h1 className="text-xl font-bold mb-2">{title}</h1>

        <p className={`text-sm mb-3 ${hasError?"text-red-200":"text-emerald-200"}`}>
          {primaryMsg}
        </p>

        <p className="text-xs text-white/70 mb-4">
          {secondaryMsg}
        </p>

        {typeLabel&&(
          <p className="text-[11px] text-white/40 mb-4">
            {typeLabel}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={()=>nav("/")}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm"
          >
            Home
          </button>
          <button
            type="button"
            onClick={()=>nav("/auth/login")}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm text-black font-medium"
          >
            Go to Login
          </button>
        </div>
      </div>
    </div>
  );
}
