"use client";
import {useEffect,useMemo,useState,useRef}from "react";
import {useParams,Link,useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {fetchChildBrief}from "@/utils/childAuth";
import {fetchLedgerSince}from "@/data/ledger";
import {Sparkles,ArrowLeft}from "lucide-react";

type TargetReviewStatus="Pending"|"Approved"|"Rejected"|null;

type Target={
  id:string;
  family_id:string;
  child_uid:string;
  title:string;
  description:string|null;
  category:string|null;
  difficulty:string|null;
  due_date:string|null;
  status:string;
  points_award:number|null;
  created_at:string;

  review_status?:TargetReviewStatus;
  reviewed_at?:string|null;
  awarded_points?:number|null;
};

type TargetNorm=Target&{
  _basePoints:number;
  _awardedPoints:number;
  _effectivePoints:number;
};

type LedgerRow={delta:number;created_at:string;reason:string|null};

function normalizeReviewStatus(raw:any):TargetReviewStatus{
  if(raw==null)return null;
  const s=String(raw).trim().toLowerCase();
  if(s==="approved")return"Approved";
  if(s==="pending")return"Pending";
  if(s==="rejected")return"Rejected";
  return null;
}

function deriveReviewStatus(status:string,review:TargetReviewStatus,awarded:number|null):TargetReviewStatus{
  const norm=normalizeReviewStatus(review);
  if(norm)return norm;

  if(status==="Completed"){
    if(typeof awarded==="number"&&Number.isFinite(awarded)&&awarded>0){
      return"Approved";
    }
    return"Pending";
  }
  return norm;
}

const decisionBadgeCls=(t:TargetNorm)=>{
  if(t.review_status==="Approved")return"border-emerald-400/60 bg-emerald-500/10 text-emerald-200";
  if(t.review_status==="Rejected")return"border-rose-400/60 bg-rose-500/10 text-rose-200";
  if(t.status==="Completed"&&(!t.review_status||t.review_status==="Pending"))return"border-amber-300/60 bg-amber-500/10 text-amber-50";
  if(t.status==="Expired")return"border-slate-400/60 bg-slate-500/10 text-slate-200";
  return"border-white/40 bg-white/5 text-white/70";
};

const statusChipCls=(t:Target|TargetNorm)=>{
  if(t.status==="Active")return"bg-sky-500/15 text-sky-200 border-sky-400/60";
  if(t.status==="Completed"&&t.review_status==="Approved")return"bg-emerald-500/15 text-emerald-200 border-emerald-400/60";
  if(t.status==="Completed"&&(!t.review_status||t.review_status==="Pending"))return"bg-amber-500/15 text-amber-50 border-amber-300/60";
  if(t.status==="Completed"&&t.review_status==="Rejected")return"bg-rose-500/15 text-rose-200 border-rose-400/60";
  if(t.status==="Rejected")return"bg-rose-500/15 text-rose-200 border-rose-400/60";
  if(t.status==="Expired")return"bg-slate-500/15 text-slate-200 border-slate-400/60";
  return"bg-white/10 text-white/70 border-white/30";
};

export default function ChildTargetPage(){
  const {id}=useParams<{id:string}>();
  const nav=useNavigate();

  const [childUid,setChildUid]=useState<string|null>(null);
  const [childIdCanonical,setChildIdCanonical]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);

  const [targets,setTargets]=useState<Target[]>([]);
  const [current,setCurrent]=useState<Target|null>(null);
  const [ledger,setLedger]=useState<LedgerRow[]>([]);
  const [showTimeline,setShowTimeline]=useState(false);

  const [showCelebration,setShowCelebration]=useState(false);
  const celebrationTimeoutRef=useRef<number|null>(null);

  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        setLoading(true);

        const childKey=
          sessionStorage.getItem("child_uid")||
          localStorage.getItem("child_portal_child_id")||
          "";

        if(!childKey){
          if(active){
            setChildUid(null);
            setChildIdCanonical(null);
            setTargets([]);
            setCurrent(null);
            setLedger([]);
          }
          setLoading(false);
          return;
        }

        let legacyUid=childKey;
        let canonicalId:string|null=null;

        try{
          const brief=await fetchChildBrief(childKey);
          if(brief){
            legacyUid=
              (brief as any)?.child_uid||
              (brief as any)?.legacy_uid||
              childKey;
            canonicalId=(brief as any)?.id||null;
          }
        }catch(e){
          console.warn("[ChildTargetPage] fetchChildBrief failed, using stored id",e);
        }

        if(!active)return;
        setChildUid(legacyUid);
        setChildIdCanonical(canonicalId);

        const {data,error}=await supabase.rpc("api_child_targets_v1",{
          p_child_uid:legacyUid
        });
        if(error)throw error;

        const rawList=(data||[])as any[];

        const list=rawList.map((row:any)=>{
          const awardedVal=typeof row.awarded_points==="number"
            ?row.awarded_points
            :null;
          const derived=deriveReviewStatus(
            row.status,
            normalizeReviewStatus(row.review_status),
            awardedVal
          );
          return{
            ...row,
            review_status:derived,
            awarded_points:awardedVal
          } as Target;
        });

        console.log("[ChildTargetPage] targets list:",list);

        if(!active)return;
        setTargets(list);

        const cur=list.find((t)=>t.id===id)||null;
        console.log("[ChildTargetPage] current target for id",id,cur);
        setCurrent(cur);

        const idForLedger=canonicalId||legacyUid;
        if(idForLedger){
          try{
            const rows=await fetchLedgerSince(
              String(idForLedger),
              new Date(Date.now()-365*24*60*60*1000).toISOString()
            );
            if(active)setLedger(rows||[]);
          }catch(e){
            console.error("[ChildTargetPage] ledger fetch failed",e);
            if(active)setLedger([]);
          }
        }else if(active){
          setLedger([]);
        }
      }catch(e){
        console.error("[ChildTargetPage] bootstrap/load error",e);
        if(active){
          setTargets([]);
          setCurrent(null);
          setLedger([]);
        }
      }finally{
        if(active)setLoading(false);
      }
    })();
    return()=>{
      active=false;
    };
  },[id]);

  useEffect(()=>{
    return()=>{
      if(celebrationTimeoutRef.current&&typeof window!=="undefined"){
        window.clearTimeout(celebrationTimeoutRef.current);
        celebrationTimeoutRef.current=null;
      }
    };
  },[]);

  const normalized:TargetNorm[]=useMemo(()=>{
    return targets.map((t)=>{
      const baseRaw=Number(t.points_award);
      const base=Number.isFinite(baseRaw)?baseRaw:0;

      const awardedRaw=typeof t.awarded_points==="number"
        ?Number(t.awarded_points)
        :NaN;
      const awarded=Number.isFinite(awardedRaw)?awardedRaw:0;

      const effective=t.review_status==="Approved"&&Number.isFinite(awardedRaw)
        ?awarded
        :base;

      return{
        ...t,
        _basePoints:base,
        _awardedPoints:awarded,
        _effectivePoints:effective
      };
    });
  },[targets]);

  const activeTargets=useMemo(
    ()=>normalized.filter((t)=>t.status==="Active"),
    [normalized]
  );

  const completedTargets=useMemo(
    ()=>normalized.filter((t)=>t.status==="Completed"),
    [normalized]
  );

  const submittedTargets=useMemo(
    ()=>normalized.filter((t)=>t.status==="Completed"&&(!t.review_status||t.review_status==="Pending")),
    [normalized]
  );

  const {
    missionApprovedPoints,
    missionPendingPoints,
    missionTotalPoints
  }=useMemo(()=>{
    let approved=0;
    let pending=0;

    normalized.forEach((t)=>{
      const base=t._basePoints||0;
      const awarded=t._awardedPoints||0;

      if(t.status!=="Completed")return;
      if(base<=0&&awarded<=0)return;

      if(t.review_status==="Approved"){
        approved+=awarded>0?awarded:base;
      }else if(!t.review_status||t.review_status==="Pending"){
        pending+=base;
      }
    });

    return{
      missionApprovedPoints:approved,
      missionPendingPoints:pending,
      missionTotalPoints:approved+pending
    };
  },[normalized]);

  const childStateLabel=(t:Target|TargetNorm)=>{
    if(t.status==="Active")return"Active mission";
    if(t.status==="Completed"){
      if(t.review_status==="Approved")return"Approved mission";
      if(t.review_status==="Rejected")return"Not approved";
      return"Submitted for review";
    }
    if(t.status==="Rejected")return"Not approved";
    if(t.status==="Expired")return"Expired";
    return t.status;
  };

  const triggerCelebration=()=>{
    setShowCelebration(true);

    try{
      const audio=new Audio("/sounds/child-mission-celebration.wav");
      audio.volume=0.9;
      audio.play().catch(()=>{});
    }catch(e){
      console.warn("[ChildTargetPage] celebration audio failed",e);
    }

    if(typeof window!=="undefined"){
      if(celebrationTimeoutRef.current){
        window.clearTimeout(celebrationTimeoutRef.current);
      }
      celebrationTimeoutRef.current=window.setTimeout(()=>{
        setShowCelebration(false);
        celebrationTimeoutRef.current=null;
      },15000);
    }
  };

  if(loading){
    return(
      <div className="p-6 text-white/70">
        Loading target…
      </div>
    );
  }

  if(!childUid){
    return(
      <div className="p-6 space-y-4">
        <button
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
          onClick={()=>nav(-1)}
        >
          <ArrowLeft className="w-4 h-4"/>
          Back
        </button>
        <div className="text-white/70">
          No child session found. Please sign in on the kiosk.
        </div>
      </div>
    );
  }

  return(
    <div className="p-6 space-y-6">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
        <button
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
          onClick={()=>nav(-1)}
        >
          <ArrowLeft className="w-4 h-4"/>
          Back
        </button>
        <button
          type="button"
          onClick={()=>setShowTimeline(true)}
          className="text-xs text-sky-300 hover:text-sky-200 underline-offset-2 hover:underline"
        >
          Completed Targets
        </button>
      </div>

      {/* Mission points summary */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
          <div className="text-xs text-white/60 mb-1">From missions (approved)</div>
          <div className="text-2xl font-bold text-emerald-300">
            {missionApprovedPoints} pts
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            Points from missions your grown-up has fully approved.
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
          <div className="text-xs text-white/60 mb-1">Waiting for review</div>
          <div className="text-2xl font-bold text-amber-200">
            {missionPendingPoints} pts
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            Submitted missions that are still waiting for a grown-up check.
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
          <div className="text-xs text-white/60 mb-1">All mission points</div>
          <div className="text-2xl font-bold text-sky-200">
            {missionTotalPoints} pts
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            Total points from parent-created and AI missions (approved + waiting).
          </div>
        </div>
      </section>

      {/* Current target detail */}
      {current&&(()=>{
        const isApproved=current.review_status==="Approved";
        const basePts=Number(current.points_award??0)||0;
        const awardedRaw=typeof current.awarded_points==="number"
          ?Number(current.awarded_points)
          :NaN;
        const hasAwarded=Number.isFinite(awardedRaw)&&awardedRaw>0;
        const awardedPts=hasAwarded?awardedRaw:0;
        const total=hasAwarded?awardedPts:basePts;
        const bonus=hasAwarded?Math.max(awardedPts-basePts,0):0;

        return(
          <section className="rounded-2xl p-5 bg-slate-900/95 border border-white/10 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/30">
                  <Sparkles className="w-5 h-5 text-emerald-300"/>
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-white">
                    {current.title}
                  </h1>
                  {isApproved&&(
                    <div className="mt-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/60 text-[10px] text-emerald-100">
                        ✅ Approved mission
                      </span>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-white/60 flex flex-wrap gap-2">
                    <span>{current.category??"General"}</span>
                    <span>·</span>
                    <span>{current.difficulty||"Easy"}</span>
                    {current.points_award!==null&&(
                      <>
                        <span>·</span>
                        <span className="text-emerald-300 font-semibold">
                          {Number(current.points_award??0)} pts mission reward
                        </span>
                      </>
                    )}
                    {current.due_date&&(
                      <>
                        <span>·</span>
                        <span>Due: {current.due_date}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className={`text-xs px-3 py-1 rounded-full border ${statusChipCls(current as any)}`}>
                  {childStateLabel(current as any)}
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-sm h-fit">
                    {total} pts
                  </span>
                  {hasAwarded&&(
                    <div className="flex flex-wrap gap-1 justify-end text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/20 text-white/70">
                        Base: {basePts} pts
                      </span>
                      {bonus>0&&(
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border-emerald-400/50 text-emerald-200">
                          Bonus: +{bonus} pts
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {isApproved&&(
                  <div className="text-[11px] text-emerald-300 text-right">
                    Approved – these points are counted in your mission earnings.
                  </div>
                )}
                {current.status==="Completed"&&!current.review_status&&(
                  <div className="text-[11px] text-amber-300 text-right">
                    Submitted – waiting for your grown-up to check.
                  </div>
                )}
                {current.review_status==="Rejected"&&(
                  <div className="text-[11px] text-rose-300 text-right">
                    Not approved – talk with your grown-up and you can try again on a new mission.
                  </div>
                )}

                {isApproved&&(
                  <button
                    type="button"
                    onClick={triggerCelebration}
                    className="mt-1 px-3 py-1 rounded-full text-[11px] bg-emerald-500/25 text-emerald-50 border border-emerald-300/80 hover:bg-emerald-500/40 font-semibold"
                  >
                    Read &amp; Celebrate 🎉
                  </button>
                )}
              </div>
            </div>

            {current.description&&(
              <p className="text-sm text-white/80 mt-2">
                {current.description}
              </p>
            )}

            {current.review_status==="Rejected"&&(
              <div className="mt-3 text-xs text-rose-300">
                This attempt was not approved. You can talk with your grown-up and try again on a new mission.
              </div>
            )}

            <div className="mt-4 text-xs text-white/60">
              When you add your evidence or completion flow, it connects to this mission so your grown-up can review and award points.
            </div>

            {isApproved&&(
              <div className="mt-5 w-full rounded-2xl border border-emerald-400/70 bg-emerald-600/20 px-4 py-3 flex flex-col items-center text-center space-y-2">
                <div className="text-xs text-emerald-100">
                  Your grown-up approved this mission. Tap below any time to replay your celebration!
                </div>
                <button
                  type="button"
                  onClick={triggerCelebration}
                  className="px-4 py-2 rounded-full text-sm bg-emerald-500/40 text-emerald-50 border border-emerald-300/90 hover:bg-emerald-500/60 font-semibold"
                >
                  Read &amp; Celebrate 🎉
                </button>
              </div>
            )}
          </section>
        );
      })()}

      {/* Active Targets section */}
      <section className="rounded-2xl p-4 bg-slate-900/95 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">
            Active Targets
          </h2>
          <button
            type="button"
            onClick={()=>setShowTimeline(true)}
            className="text-sky-300 text-sm hover:text-sky-200 underline-offset-2 hover:underline"
          >
            View list
          </button>
        </div>

        {activeTargets.length===0?(
          <div className="text-white/70 py-4 text-sm">
            You don't have any active targets right now — check back soon!
          </div>
        ):(
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeTargets.map((t)=>(
              <Link
                key={t.id}
                to={`/child/target/${t.id}`}
                className="group block"
              >
                <div
                  className={`glass rounded-2xl p-4 border-l-4 transition-all ${
                    t.id===current?.id
                      ?"border-emerald-400/80 bg-emerald-500/10"
                      :"border-emerald-500/70 hover:border-emerald-400/90"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30">
                        <Sparkles className="w-4 h-4 text-emerald-300"/>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white line-clamp-2">
                          {t.title}
                        </h3>
                        {t.status==="Completed"&&t.review_status==="Approved"&&(
                          <div className="mt-0.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/60 text-[10px] text-emerald-100">
                              ✅ Approved mission
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      {t._basePoints} pts
                    </span>
                  </div>

                  {t.description&&(
                    <p className="text-xs text-white/80 mb-2 line-clamp-3">
                      {t.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span>
                      {t.category??"General"} · {t.difficulty||"Easy"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-300 group-hover:underline">
                      View
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Submitted missions (waiting for review) */}
      <section className="rounded-2xl p-4 bg-slate-900/95 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-3">
          Submitted missions (waiting for review)
        </h2>
        {submittedTargets.length===0?(
          <div className="text-white/70 text-sm">
            You don't have any missions waiting for review right now.
          </div>
        ):(
          <div className="space-y-3">
            {submittedTargets.map((t)=>(
              <Link
                key={t.id}
                to={`/child/target/${t.id}`}
                className="block group"
              >
                <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>{t.title}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-300/50">
                        Submitted
                      </span>
                    </div>
                    {t.description&&(
                      <p className="text-xs text-white/80 mt-1 line-clamp-2">
                        {t.description}
                      </p>
                    )}
                    <div className="text-[11px] text-white/60 mt-1">
                      {(t.category??"General")} · {t.difficulty||"Easy"}
                      {t.due_date&&(
                        <> · Due: {t.due_date}</>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-amber-200">
                      {t._basePoints} pts
                    </span>
                    <span className="text-[11px] text-amber-200/90">
                      Waiting for your grown-up
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section className="rounded-2xl p-4 bg-slate-900/95 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-3">Recent Activity</h3>
        {ledger.length===0?(
          <div className="text-white/70">No recent activity.</div>
        ):(
          <div className="space-y-2">
            {ledger.slice(0,6).map((r,i)=>(
              <div key={i}className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <div className="text-sm text-white/80">
                  {r.reason??"Points change"}
                </div>
                <div className={`text-sm font-semibold ${r.delta>=0?"text-emerald-300":"text-rose-300"}`}>
                  {r.delta>=0?`+${r.delta}`:r.delta} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Inline timeline modal */}
      {showTimeline&&(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-3xl max-h-[80vh] rounded-2xl bg-slate-950 border border-white/15 shadow-2xl p-5 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg md:text-xl font-semibold text-white">
                  Targets timeline
                </h2>
                <p className="text-xs text-white/60 mt-1">
                  Active missions plus recently completed activity over the last year.
                </p>
              </div>
              <button
                type="button"
                onClick={()=>setShowTimeline(false)}
                className="text-xs px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-6 overflow-y-auto pr-1">
              {/* Active missions */}
              <div>
                <h3 className="text-sm font-semibold text-emerald-300 mb-2">
                  Active missions
                </h3>
                {activeTargets.length===0?(
                  <div className="text-xs text-white/60">
                    No active missions right now.
                  </div>
                ):(
                  <ol className="relative border-l border-white/10 pl-4 space-y-3">
                    {activeTargets.map((t)=>(
                      <li key={t.id}className="relative">
                        <span className="absolute -left-2 top-1 w-3 h-3 rounded-full bg-emerald-400 shadow"/>
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm text-white/90">
                            {t.title}
                          </div>
                          <div className="text-[10px] text-white/50 whitespace-nowrap">
                            {new Date(t.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-[11px] text-white/60 mt-0.5">
                          {(t.category??"General")} · {t.difficulty||"Easy"} · {t._basePoints} pts
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Completed & recent activity */}
              <div>
                <h3 className="text-sm font-semibold text-sky-300 mb-2">
                  Completed &amp; recent activity
                </h3>

                <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/60 text-emerald-200">
                    Approved – points awarded
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-300/60 text-amber-50">
                    Submitted – waiting for review
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-400/60 text-rose-200">
                    Not approved
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-400/60 text-slate-200">
                    Expired/other
                  </span>
                </div>

                {completedTargets.length===0&&ledger.length===0?(
                  <div className="text-xs text-white/60">
                    No recent activity yet.
                  </div>
                ):(
                  <>
                    {completedTargets.length>0&&(
                      <ol className="relative border-l border-emerald-400/50 pl-4 space-y-3 mb-4">
                        {completedTargets.map((t)=>(
                          <li key={t.id}className="relative">
                            <span className="absolute -left-2 top-1 w-3 h-3 rounded-full bg-emerald-400 shadow"/>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm text-white/90">
                                {t.title}
                              </div>
                              <div className="text-[10px] text-white/50 whitespace-nowrap">
                                {new Date(t.created_at).toLocaleString()}
                              </div>
                            </div>
                            {t.review_status==="Approved"&&(
                              <div className="mt-0.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/60 text-[10px] text-emerald-100">
                                  ✅ Approved mission
                                </span>
                              </div>
                            )}
                            <div className="text-[11px] text-white/60 mt-0.5">
                              {(t.category??"General")} · {t.difficulty||"Easy"} · {t._effectivePoints} pts
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                              <span className={`px-2 py-0.5 rounded-full border ${decisionBadgeCls(t)}`}>
                                {childStateLabel(t)}
                              </span>
                              {t.review_status==="Approved"&&typeof t.awarded_points==="number"&&(
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/60 text-emerald-200">
                                  Awarded: {t.awarded_points} pts
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}

                    {ledger.length>0&&(
                      <ol className="relative border-l border-white/10 pl-4 space-y-3">
                        {ledger.slice(0,20).map((r,i)=>(
                          <li key={i}className="relative">
                            <span className="absolute -left-2 top-1 w-3 h-3 rounded-full bg-sky-400 shadow"/>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm text-white/85">
                                {r.reason??"Points change"}
                              </div>
                              <div className="text-[10px] text-white/50 whitespace-nowrap">
                                {new Date(r.created_at).toLocaleString()}
                              </div>
                            </div>
                            <div className={`text-[11px] mt-0.5 ${r.delta>=0?"text-emerald-300":"text-rose-300"}`}>
                              {r.delta>=0?`+${r.delta}`:r.delta} pts
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Celebration overlay */}
      {showCelebration&&(
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[radial-gradient(1400px_700px_at_50%_-200px,rgba(52,211,153,0.35),transparent),radial-gradient(1000px_600px_at_10%_120%,rgba(96,165,250,0.3),transparent),linear-gradient(to_bottom,#020617,#020617)] pointer-events-none"/>
          <TargetEmojiRain/>
          <div className="relative max-w-sm w-full px-6 pointer-events-none">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-emerald-400/40 via-sky-400/40 to-pink-400/40 blur-3xl opacity-80"/>
            <div className="relative z-10 rounded-3xl bg-slate-900/95 border border-emerald-300/60 px-6 py-5 text-center space-y-2 shadow-2xl">
              <div className="flex justify-center gap-2 text-3xl mb-1">
                <span className="animate-bounce">🎉</span>
                <span className="animate-bounce delay-150">🌈</span>
                <span className="animate-bounce delay-300">🏆</span>
              </div>
              <div className="text-white font-semibold text-lg">
                Amazing mission, hero!
              </div>
              <div className="text-emerald-100 text-sm">
                Your grown-up approved this mission and your points are now in your mission earnings.
              </div>
              <div className="flex justify-center gap-3 pt-2 text-xl">
                <span className="animate-bounce">⭐</span>
                <span className="animate-bounce delay-150">🎨</span>
                <span className="animate-bounce delay-300">✨</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TargetEmojiRain({count=70}:{count?:number}){
  const [bits]=useState(()=>Array.from({length:count}).map(()=>({
    id:Math.random().toString(36).slice(2),
    left:Math.random()*100,
    size:20+Math.random()*18,
    delay:Math.random()*0.9,
    duration:4+Math.random()*3,
    char:["🌟","✨","🎈","🎉","🏆","💫","⭐","🌈","💖","🎊"][Math.floor(Math.random()*10)]
  })));
  return(
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {bits.map((b)=>(
        <div
          key={b.id}
          style={{
            position:"absolute",
            left:`${b.left}%`,
            top:"-10%",
            fontSize:`${b.size}px`,
            animation:`target-fall ${b.duration}s ${b.delay}s ease-in forwards`
          }}
        >
          {b.char}
        </div>
      ))}
      <style>{`
        @keyframes target-fall{
          0%{transform:translateY(-10vh) rotate(0deg);opacity:0;}
          10%{opacity:1;}
          100%{transform:translateY(110vh) rotate(720deg);opacity:0;}
        }
      `}</style>
    </div>
  );
}
