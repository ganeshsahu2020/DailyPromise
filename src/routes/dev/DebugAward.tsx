// src/routes/dev/DebugAward.tsx
import {useState}from "react";
import {Button}from "@/components/ui/button";
import {awardPointsWithKey,makeIdemKey}from "@/lib/points";

const NEW_CHILD_UID="e5afc7fa-c5be-4cb7-9b8f-22860bf8ba90"; // child_profiles.child_uid

export default function DebugAward(){
  const [status,setStatus]=useState<string>("");

  async function handleClick(){
    setStatus("Running…");
    try{
      const res=await awardPointsWithKey({
        child_uid:NEW_CHILD_UID,
        delta:5,
        reason:"Debug game award",
        ref:makeIdemKey("debug",0)
      });
      console.log("[DebugAward] success",res);
      setStatus("Success: "+JSON.stringify(res));
    }catch(err){
      console.error("[DebugAward] error",err);
      setStatus("Error: "+String((err as any)?.message||err));
    }
  }

  return(
    <div className="p-4 space-y-2">
      <Button onClick={handleClick}>Debug award 5 pts to new child</Button>
      {status&&<div className="text-xs text-white/80 mt-2 break-all">{status}</div>}
    </div>
  );
}
