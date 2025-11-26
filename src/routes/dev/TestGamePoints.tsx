// src/routes/dev/TestGamePoints.tsx
import {useEffect}from "react";
import {supabase}from "@/lib/supabase";

export default function TestGamePoints(){
  useEffect(()=>{
    async function run(){
      const childUid="e5afc7fa-c5be-4cb7-9b8f-22860bf8ba90";
      console.log("[TestGamePoints] inserting test row for",childUid);

      const {data,error}=await supabase
        .from("points_ledger")
        .insert({
          child_uid:childUid,
          delta:5,
          reason:"Test game award"
        })
        .select("id,child_uid,delta,reason,created_at")
        .single();

      console.log("[TestGamePoints] insert result", {data,error});
    }
    run().catch((err)=>console.error("[TestGamePoints] unexpected",err));
  },[]);

  return null;
}
