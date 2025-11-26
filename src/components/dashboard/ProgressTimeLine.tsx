import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {CalendarDays,CheckCircle,Award,Coins,Image as Img} from "lucide-react";

type Item=
  |{kind:"daily";id:string;date:string;pct:number;status:string}
  |{kind:"target";id:string;title:string;date:string;points:number}
  |{kind:"points";id:string;date:string;delta:number;reason?:string|null}
  |{kind:"reward";id:string;date:string;status:string;label:string}
  |{kind:"evidence";id:string;date:string;label:string};

export default function ProgressTimeLine({childUid}:{childUid?:string}){
  const [items,setItems]=useState<Item[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{void load();},[childUid]);

  async function load(){
    if(!childUid){setItems([]);setLoading(false);return;}

    const {data:daily}=await supabase.from("daily_activity_submissions")
      .select("id,activity_date,completed_activities,status,submitted_at")
      .eq("child_uid",childUid)
      .order("submitted_at",{ascending:false})
      .limit(5);

    const {data:completed}=await supabase.rpc("api_child_completed_min",{p_child_uid:childUid});

    // ✅ child_points_ledger now returns points/evidence_count (not delta/evidence_url)
    const {data:ledger,error}=await supabase
      .from("child_points_ledger")
      .select("points,created_at,reason,evidence_count,id")
      .eq("child_uid",childUid)
      .order("created_at",{ascending:false})
      .limit(50);

    if(error){console.warn("[timeline ledger]",error);}

    // Map points -> delta for downstream UI
    const mapped=(ledger||[]).map((r:any)=>({
      id:String(r.id??`${r.created_at}:${Math.random()}`),
      delta:Number(r.points||0),
      created_at:r.created_at,
      reason:r.reason,
      evidence_count:Number(r.evidence_count||0)
    }));

    const {data:redeem}=await supabase.from("points_redemption_requests")
      .select("id,status,requested_at")
      .eq("child_uid",childUid)
      .order("requested_at",{ascending:false})
      .limit(3);

    const merged:Item[]=[];
    (daily||[]).forEach((r:any)=>merged.push({
      kind:"daily",
      id:r.id,
      date:r.submitted_at||r.activity_date,
      pct:Math.round(((r.completed_activities?.length??0)/13)*100),
      status:r.status
    }));

    (completed||[]).slice(0,6).forEach((t:any)=>merged.push({
      kind:"target",
      id:t.id,
      title:t.title||"Completed target",
      date:t.completed_at||t.latest_evidence_date||t.target_created,
      points:t.points||t.points_award||0
    }));

    (mapped||[]).slice(0,5).forEach((l:any)=>merged.push({
      kind:"points",
      id:String(l.id),
      date:l.created_at,
      delta:l.delta,
      reason:l.reason
    }));

    (redeem||[]).forEach((r:any)=>merged.push({
      kind:"reward",
      id:r.id,
      date:r.requested_at,
      status:r.status,
      label:"Cash-out request"
    }));

    merged.sort((a,b)=>(a.date>b.date?-1:1));
    setItems(merged.slice(0,12));
    setLoading(false);
  }

  const Row=({it}:{it:Item})=>{
    const line="before:content-[''] before:absolute before:left-[11px] before:top-6 before:bottom-0 before:w-px before:bg-white/10 relative pl-8";
    const chip="px-2 py-0.5 rounded text-xs border border-white/10";
    const when=(d:string)=>new Date(d).toLocaleString();

    if(it.kind==="daily"){
      return (
        <div className={line}>
          <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white/10 grid place-items-center border border-white/20">
            <CalendarDays className="w-4 h-4 text-sky-300"/>
          </div>
          <div className="text-white/90">Daily checklist submitted</div>
          <div className="text-white/60 text-sm">{it.pct}% complete • {it.status}</div>
          <div className="text-white/40 text-xs">{when(it.date)}</div>
        </div>
      );
    }
    if(it.kind==="target"){
      return (
        <div className={line}>
          <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white/10 grid place-items-center border border-white/20">
            <CheckCircle className="w-4 h-4 text-emerald-300"/>
          </div>
          <div className="text-white/90">{it.title}</div>
          <div className="text-emerald-300 text-xs inline-block mt-1">{`+${it.points} pts`}</div>
          <div className="text-white/40 text-xs">{when(it.date)}</div>
        </div>
      );
    }
    if(it.kind==="points"){
      return (
        <div className={line}>
          <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white/10 grid place-items-center border border-white/20">
            <Coins className="w-4 h-4 text-yellow-300"/>
          </div>
          <div className="text-white/90">{it.delta>0?`Bonus +${it.delta} pts`:`${it.delta} pts`}</div>
          {it.reason&&<div className="text-white/60 text-sm">{it.reason}</div>}
          <div className="text-white/40 text-xs">{when(it.date)}</div>
        </div>
      );
    }
    if(it.kind==="reward"){
      return (
        <div className={line}>
          <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white/10 grid place-items-center border border-white/20">
            <Award className="w-4 h-4 text-fuchsia-300"/>
          </div>
          <div className="text-white/90">{it.label}</div>
          <div className="text-white/60 text-sm">Status: <span className={chip}>{it.status}</span></div>
          <div className="text-white/40 text-xs">{when(it.date)}</div>
        </div>
      );
    }
    return (
      <div className={line}>
        <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white/10 grid place-items-center border border-white/20">
          <Img className="w-4 h-4 text-purple-300"/>
        </div>
        <div className="text-white/90">Evidence added</div>
        <div className="text-white/40 text-xs">{when((it as any).date)}</div>
      </div>
    );
  };

  if(!childUid){return <div className="text-white/60">Pick a child to view progress.</div>;}
  if(loading){return <div className="text-white/60">Loading timeline…</div>;}
  if(items.length===0){return <div className="text-white/60">No recent activity yet.</div>;}
  return <div className="space-y-4">{items.map((it)=><Row key={`${it.kind}:${it.id}`} it={it}/>)}</div>;
}
