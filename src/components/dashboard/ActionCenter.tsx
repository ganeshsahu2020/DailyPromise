import {useEffect,useState} from "react";
import {useNavigate} from "react-router-dom";
import {supabase} from "@/lib/supabase";
import {CheckCircle2,ClipboardList,Gift,HandCoins,ChevronRight} from "lucide-react";

type Counts={submissionsPending:number;wishlistPending:number;redemptionsRequested:number;targetsNeedingOffers:number};

export default function ActionCenter({familyId,childUid}:{familyId?:string;childUid?:string}) {
  const [counts,setCounts]=useState<Counts>({submissionsPending:0,wishlistPending:0,redemptionsRequested:0,targetsNeedingOffers:0});
  const [loading,setLoading]=useState(true);
  const nav=useNavigate();

  useEffect(()=>{void load();},[familyId,childUid]);

  async function load() {
    if(!familyId){setLoading(false);return;}
    const s1=supabase.from("daily_activity_submissions").select("id",{count:"exact",head:true}).eq("status","pending");
    const s2=supabase.from("wishlist_items").select("id",{count:"exact",head:true}).eq("approval_status","Pending");
    const s3=supabase.from("points_redemption_requests").select("id",{count:"exact",head:true}).eq("status","Requested").eq("family_id",familyId);
    const s4=childUid?supabase.rpc("api_child_completed_min",{p_child_uid:childUid}):null;

    const [a,b,c,d]=await Promise.all([s1,s2,s3,s4]);
    const completed=Array.isArray(d?.data)?(d!.data as any[]):[];
    setCounts({
      submissionsPending:a.count||0,
      wishlistPending:b.count||0,
      redemptionsRequested:c.count||0,
      targetsNeedingOffers:Math.max(0,completed.length-0)
    });
    setLoading(false);
  }

  const Card=({icon,title,count,onClick,accent}:{icon:React.ReactNode;title:string;count:number;onClick:()=>void;accent:string;})=>(
    <button onClick={onClick} className="group w-full text-left rounded-2xl p-4 border border-white/15 bg-white/5 hover:bg-white/10 transition">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${accent} bg-opacity-20 border border-white/20`}>{icon}</div>
        <div className="flex-1">
          <div className="text-white font-semibold">{title}</div>
          <div className="text-white/60 text-sm">{loading?"Loading…":`${count} item${count===1?"":"s"}`}</div>
        </div>
        <ChevronRight className="w-5 h-5 text-white/50 group-hover:translate-x-0.5 transition"/>
      </div>
    </button>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Card icon={<ClipboardList className="w-5 h-5 text-yellow-300"/>} title="Review Daily Submissions" count={counts.submissionsPending} onClick={()=>nav("/parent/daily")} accent="bg-yellow-500/20"/>
      <Card icon={<Gift className="w-5 h-5 text-pink-300"/>} title="Approve Wishlists" count={counts.wishlistPending} onClick={()=>nav("/parent/wishlist")} accent="bg-pink-500/20"/>
      <Card icon={<HandCoins className="w-5 h-5 text-indigo-300"/>} title="Cash-out Requests" count={counts.redemptionsRequested} onClick={()=>nav("/parent/redemptions")} accent="bg-indigo-500/20"/>
      <Card icon={<CheckCircle2 className="w-5 h-5 text-emerald-300"/>} title="Offer Rewards for Completed" count={counts.targetsNeedingOffers} onClick={()=>nav("/parent/rewards")} accent="bg-emerald-500/20"/>
    </div>
  );
}
