import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {Flame,Sparkles} from "lucide-react";

export default function StreakChips({childUid}:{childUid?:string}) {
  const [dailyStreak,setDailyStreak]=useState(0);

  useEffect(()=>{void calc();},[childUid]);

  async function calc() {
    if(!childUid){setDailyStreak(0);return;}
    const {data}=await supabase.from("daily_activity_submissions")
      .select("activity_date,status").eq("child_uid",childUid)
      .order("activity_date",{ascending:false}).limit(30);

    let streak=0;
    let cur=new Date();cur.setHours(0,0,0,0);
    for(const row of (data||[])){
      const d=new Date(row.activity_date);d.setHours(0,0,0,0);
      const diff=Math.round((cur.getTime()-d.getTime())/86400000);
      if(diff===0||diff===1){streak++;cur=d;} else if(diff>1){break;}
    }
    setDailyStreak(streak);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/20 border border-orange-400/30 text-orange-200 text-sm">
        <Flame className="w-4 h-4"/> {dailyStreak}-day streak
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-sm">
        <Sparkles className="w-4 h-4"/> Keep it going!
      </span>
    </div>
  );
}
