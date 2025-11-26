"use client";
import {useEffect,useState,Suspense,lazy,useRef}from "react";
import {useNavigate,useParams,Link}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {fetchChildBrief}from "@/utils/childAuth";
import type {EvidenceItem}from "@/components/child/TargetEvidenceSubmission";

const TargetCoachPanel=lazy(()=>import("../../components/child/TargetCoachPanel"));
const TargetEvidenceSubmission=lazy(()=>import("../../components/child/TargetEvidenceSubmission"));
const QuickCompleteModal=lazy(()=>import("../../components/child/QuickCompleteModal"));

type TargetReviewStatus="Pending"|"Approved"|"Rejected"|null;

type Target={
  id:string;
  title:string;
  description:string|null;
  category:string;
  difficulty:string|null;
  points_award:number|null;
  due_date:string|null;
  status:string;
  created_at:string;
  child_uid?:string;

  review_status?:TargetReviewStatus;
  reviewed_at?:string|null;
  awarded_points?:number|null;
  review_note?:string|null;
};

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
    if(typeof awarded==="number"&&Number.isFinite(awarded)&&awarded>0)return"Approved";
    return"Pending";
  }
  return norm;
}

export default function TargetDetail(){
  const {id}=useParams<{id:string}>();
  const navigate=useNavigate();

  const [loading,setLoading]=useState(true);
  const [target,setTarget]=useState<Target|null>(null);
  const [childName,setChildName]=useState("Child");
  const [childLegacyUid,setChildLegacyUid]=useState<string|null>(null);
  const [openCoach,setOpenCoach]=useState(false);
  const [showEvidenceSubmission,setShowEvidenceSubmission]=useState(false);
  const [showQuickComplete,setShowQuickComplete]=useState(false);

  const [showCelebration,setShowCelebration]=useState(false);
  const celebrationTimeoutRef=useRef<number|null>(null);

  useEffect(()=>{
    (async()=>{
      try{
        const childKey=
          sessionStorage.getItem("child_uid")||
          localStorage.getItem("child_portal_child_id");

        if(!childKey){
          navigate("/child/login");
          return;
        }

        const brief=await fetchChildBrief(childKey);
        if(!brief){
          navigate("/child/login");
          return;
        }

        setChildName((brief as any).nick_name||(brief as any).name||"Child");

        const legacyUid=(brief as any)?.child_uid||(brief as any)?.legacy_uid||null;
        setChildLegacyUid(legacyUid);

        const canonicalId=(brief as any).id as string|undefined;
        if(!id){
          navigate("/child");
          return;
        }

        let found:Target|null=null;

        // 1) Detail RPC with canonical child id
        if(canonicalId){
          const {data,error}=await supabase.rpc("api_child_target_detail",{
            p_target_id:id,
            p_child_id:canonicalId
          });

          if(error){
            console.error("[TargetDetail] api_child_target_detail error:",error);
          }else{
            const rowRaw=(Array.isArray(data)?data[0]:data)as any;
            if(rowRaw){
              const awardedVal=typeof rowRaw.awarded_points==="number"
                ?rowRaw.awarded_points
                :null;
              const derived=deriveReviewStatus(
                rowRaw.status,
                normalizeReviewStatus(rowRaw.review_status),
                awardedVal
              );
              found={
                ...rowRaw,
                review_status:derived,
                awarded_points:awardedVal
              };
            }
          }
        }

        // 2) Fallback via child targets view
        if(!found&&legacyUid){
          const {data,error}=await supabase.rpc("api_child_targets_v1",{
            p_child_uid:legacyUid
          });

          if(error){
            console.error("[TargetDetail] api_child_targets_v1 fallback error:",error);
          }else if(Array.isArray(data)){
            const rowRaw=(data as any[]).find((r)=>r.id===id);
            if(rowRaw){
              const awardedVal=typeof rowRaw.awarded_points==="number"
                ?rowRaw.awarded_points
                :null;
              const derived=deriveReviewStatus(
                rowRaw.status,
                normalizeReviewStatus(rowRaw.review_status),
                awardedVal
              );
              found={
                ...rowRaw,
                review_status:derived,
                awarded_points:awardedVal
              };
            }
          }
        }

        console.log("[TargetDetail] resolved target row:",found);
        setTarget(found);
      }catch(e){
        console.error("[TargetDetail] load failed:",e);
        setTarget(null);
      }finally{
        setLoading(false);
      }
    })();
  },[id,navigate]);

  useEffect(()=>{
    return()=>{
      if(celebrationTimeoutRef.current&&typeof window!=="undefined"){
        window.clearTimeout(celebrationTimeoutRef.current);
        celebrationTimeoutRef.current=null;
      }
    };
  },[]);

  const childStateLabel=(t:Target)=>{
    if(t.status==="Active")return"Active mission";
    if(t.status==="Completed"){
      if(t.review_status==="Approved")return"Approved mission";
      if(t.review_status==="Rejected")return"Not approved";
      return"Submitted mission";
    }
    if(t.status==="Rejected")return"Not approved";
    if(t.status==="Expired")return"Expired";
    return t.status;
  };

  const childStateDescription=(t:Target)=>{
    if(t.status==="Completed"&&t.review_status==="Approved"){
      return"Approved by your grown-up – your points are in your mission earnings.";
    }
    if(t.status==="Completed"&&(!t.review_status||t.review_status==="Pending")){
      return"Submitted! Your grown-up will review this mission soon.";
    }
    if(t.status==="Completed"&&t.review_status==="Rejected"){
      return"This attempt was not approved. You can talk with your grown-up and try again on a new mission.";
    }
    if(t.status==="Rejected"){
      return"This mission was not approved.";
    }
    if(t.status==="Expired"){
      return"This mission expired. You can ask for a new one.";
    }
    return"Complete this mission to earn the points.";
  };

  function playCelebration(autoNavigate?:boolean){
    setShowCelebration(true);

    try{
      const audio=new Audio("/sounds/child-mission-celebration.wav");
      audio.volume=0.9;
      audio.play().catch(()=>{});
    }catch(e){
      console.warn("[TargetDetail] celebration audio failed",e);
    }

    if(typeof window!=="undefined"){
      if(celebrationTimeoutRef.current){
        window.clearTimeout(celebrationTimeoutRef.current);
      }
      celebrationTimeoutRef.current=window.setTimeout(()=>{
        if(autoNavigate){
          navigate("/child");
        }else{
          setShowCelebration(false);
        }
        celebrationTimeoutRef.current=null;
      },15000); // ⏱ keep celebration visible for 15s
    }else if(autoNavigate){
      navigate("/child");
    }
  }

  // -------- Helper: upload evidence files to Storage before calling RPC --------

  async function uploadEvidenceFilesIfNeeded(childUidForRpc:string,targetForPath:Target,evidence:EvidenceItem[]):Promise<EvidenceItem[]>{
    if(!evidence.length)return evidence;

    const processed:EvidenceItem[]=[];
    for(let i=0;i<evidence.length;i++){
      const item=evidence[i];
      const dataAny=item.data as any;
      const isFile=typeof File!=="undefined"&&dataAny instanceof File;

      if(!isFile){
        processed.push(item);
        continue;
      }

      const file=dataAny as File;
      const originalName=file.name||`evidence-${Date.now()}-${i}`;
      const path=originalName;

      console.log("[TargetDetail] upload attempt",{
        bucket:"target-evidence",
        path,
        fileName:file.name,
        fileType:file.type,
        targetId:targetForPath.id,
        childUid:childUidForRpc
      });

      const {data:uploadData,error:uploadError}=await supabase
        .storage
        .from("target-evidence")
        .upload(path,file,{cacheControl:"3600",upsert:false});

      console.log("[TargetDetail] upload result",{uploadData,uploadError});

      if(uploadError){
        console.error("[TargetDetail] upload failed:",uploadError);
        alert(`[target-evidence] upload failed: ${uploadError.message}`);
        throw uploadError;
      }

      processed.push({
        ...item,
        data:path
      });
    }

    return processed;
  }

  async function markDone(evidence?:EvidenceItem[]){
    try{
      if(!target)return;

      const childUidForRpc=target.child_uid||childLegacyUid;
      if(!childUidForRpc){
        console.error("[TargetDetail] missing child uid for completion RPC");
        alert("Could not resolve your profile. Please re-open the mission.");
        return;
      }

      const evidenceSafe=evidence??[];

      const uploadedEvidence=evidenceSafe.length
        ?await uploadEvidenceFilesIfNeeded(String(childUidForRpc),target,evidenceSafe)
        :[];

      const evArr=uploadedEvidence.map((e)=>({
        type:e.type,
        data:Array.isArray(e.data)
          ?JSON.stringify(e.data)
          :typeof e.data==="string"
            ?e.data
            :String(e.data),
        description:e.description??null,
        completion_type:e.type==="checklist"?"quick_complete":"full_evidence",
        metadata:null
      }));

      let completion:"completed"|"quick_complete"|"full_evidence"="completed";
      if(evArr.length>0){
        const onlyChecklist=evArr.every((ev)=>ev.type==="checklist");
        completion=onlyChecklist?"quick_complete":"full_evidence";
      }

      const note=
        completion==="quick_complete"
          ?"Quick complete checklist"
          :evArr.length>0
            ?"Completed with evidence"
            :"Completed";

      console.log("[TargetDetail] completing target with",{
        childUidForRpc,
        targetId:target.id,
        completion,
        note,
        evidenceCount:evArr.length
      });

      const {error}=await supabase.rpc("api_child_complete_target",{
        p_child_uid:childUidForRpc,
        p_target_id:target.id,
        p_completion:completion,
        p_note:note,
        p_evidence:evArr.length?evArr:null
      });
      if(error)throw error;

      playCelebration(true);
    }catch(e){
      console.error("[TargetDetail] markDone failed:",e);
      alert("Could not complete this mission. Please try again.");
    }
  }

  if(loading){
    return(
      <div className="px-6 pb-10">
        <div className="text-white/70">Loading target…</div>
      </div>
    );
  }

  if(!target){
    return(
      <div className="px-6 pb-10">
        <div className="rounded-2xl p-6 bg-slate-900/95 border border-white/10">
          <div className="font-semibold mb-2">Not found</div>
          <div className="text-white/70 mb-4">
            We couldn&apos;t find that target for {childName}.
          </div>
          <Link to="/child" className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white">
            Back to My Targets
          </Link>
        </div>
      </div>
    );
  }

  const stateLabel=childStateLabel(target);
  const stateText=childStateDescription(target);
  const isApproved=target.review_status==="Approved";

  const basePointsRaw=Number(target.points_award??0);
  const basePoints=Number.isFinite(basePointsRaw)?basePointsRaw:0;
  const awardedRaw=typeof target.awarded_points==="number"
    ?Number(target.awarded_points)
    :NaN;
  const hasAwarded=Number.isFinite(awardedRaw)&&awardedRaw>0;
  const awardedPoints=hasAwarded?awardedRaw:0;
  const totalPoints=hasAwarded?awardedPoints:basePoints;
  const bonusPoints=hasAwarded?Math.max(awardedPoints-basePoints,0):0;

  return(
    <div className="px-6 pb-10 space-y-4">
      <div className="mt-2">
        <Link to="/child" className="text-emerald-400 hover:text-emerald-300 text-sm">
          ← Back to My Targets
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 rounded-2xl p-6 bg-slate-900/95 border border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">{target.title}</h1>
              {isApproved&&(
                <div className="mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/60 text-[10px] text-emerald-100">
                    ✅ Approved mission
                  </span>
                </div>
              )}
              <div className="text-sm text-white/60 mt-1">
                {target.category} · {target.difficulty||"Easy"} ·{" "}
                {new Date(target.created_at).toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-white/70">
                {stateText}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="px-2 py-1 rounded text-xs bg-white/10 border border-white/20 text-white/80">
                {stateLabel}
              </span>

              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-sm h-fit">
                {totalPoints} pts
              </span>

              {hasAwarded&&(
                <div className="flex flex-wrap gap-1 justify-end text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/20 text-white/70">
                    Mission reward: {basePoints} pts
                  </span>
                  {bonusPoints>0&&(
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border-emerald-400/50 text-emerald-200">
                      Extra from grown-up: +{bonusPoints} pts
                    </span>
                  )}
                </div>
              )}

              {isApproved&&(
                <div className="text-[11px] text-emerald-300 text-right">
                  Approved – these points are in your mission earnings.
                </div>
              )}
              {target.status==="Completed"&&!target.review_status&&(
                <div className="text-[11px] text-amber-300 text-right">
                  Submitted – waiting for your grown-up to check.
                </div>
              )}
              {target.review_status==="Rejected"&&(
                <div className="text-[11px] text-rose-300 text-right">
                  Not approved – talk with your grown-up and you can try again on a new mission.
                </div>
              )}

              {isApproved&&(
                <button
                  type="button"
                  onClick={()=>playCelebration(false)}
                  className="mt-1 px-3 py-1 rounded-full text-[11px] bg-emerald-500/25 text-emerald-50 border border-emerald-300/80 hover:bg-emerald-500/40 font-semibold"
                >
                  Read &amp; Celebrate 🎉
                </button>
              )}
            </div>
          </div>

          {target.description&&(
            <p className="text-white/80 mt-4">
              {target.description}
            </p>
          )}

          {target.due_date&&(
            <div className="mt-3 text-white/70 text-sm">
              Due: {target.due_date}
            </div>
          )}

          {target.review_note&&(
            <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              <div className="font-semibold mb-1">Message from your grown-up</div>
              <div className="whitespace-pre-wrap">
                {target.review_note}
              </div>
            </div>
          )}

          {isApproved&&(
            <div className="mt-5 rounded-2xl border border-emerald-400/70 bg-emerald-600/20 px-4 py-3 flex flex-col items-center text-center space-y-2">
              <div className="text-xs text-emerald-100">
                Your grown-up approved this mission. Tap below any time to replay your celebration!
              </div>
              <button
                type="button"
                onClick={()=>playCelebration(false)}
                className="px-4 py-2 rounded-full text-sm bg-emerald-500/40 text-emerald-50 border border-emerald-300/90 hover:bg-emerald-500/60 font-semibold"
              >
                Read &amp; Celebrate 🎉
              </button>
            </div>
          )}

          <div className="mt-6 flex gap-3 flex-wrap">
            <button
              onClick={()=>setShowEvidenceSubmission(true)}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold transition transform hover:scale-105 shadow-lg flex items-center justify-center gap-2 flex-1 min-w-[200px]"
            >
              📸 Submit Evidence &amp; Complete!
            </button>

            <button
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold transition border border-white/20 flex-1 min-w-[140px]"
              onClick={()=>setShowQuickComplete(true)}
            >
              🎉 Quick Complete
            </button>

            <button
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold transition flex-1 min-w-[140px]"
              onClick={()=>setOpenCoach(true)}
            >
              🤖 Get Help
            </button>
          </div>

          <div className="mt-4 text-center">
            <p className="text-white/60 text-sm">
              <strong>✨ Recommended:</strong> Submit evidence to show your amazing work!
              <br/>
              <span className="text-white/40">Photos, videos, voice notes, stories, or checklists</span>
            </p>
          </div>
        </div>

        <aside className="p-4 rounded-2xl bg-slate-900/95 border border-white/10 md:sticky md:top-6 h-fit">
          <div className="space-y-4">
            <div>
              <h4 className="text-lg font-bold text-white">Mission Actions</h4>
              <p className="text-white/70 text-sm mt-1">Quick actions for this mission.</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={()=>setShowEvidenceSubmission(true)}
                className="w-full px-4 py-3 rounded-lg bg-purple-500/20 text-white"
              >
                Submit Evidence
              </button>
              <button
                onClick={()=>setShowQuickComplete(true)}
                className="w-full px-4 py-3 rounded-lg bg-green-500/20 text-white"
              >
                Quick Complete
              </button>
              <button
                onClick={()=>setOpenCoach(true)}
                className="w-full px-4 py-3 rounded-lg bg-blue-500/20 text-white"
              >
                Get Coach Help
              </button>
            </div>

            <div className="pt-2 border-t border-white/5">
              <div className="text-xs text-white/60">Info</div>
              <div className="text-sm text-white/80 mt-1">
                Completing updates your points and logs your progress in the family dashboard.
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Evidence Submission */}
      <Suspense fallback={
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="text-white text-lg">Loading evidence submission...</div>
        </div>
      }>
        {showEvidenceSubmission&&target&&(
          <TargetEvidenceSubmission
            target={{id:target.id,title:target.title,category:target.category}}
            childName={childName}
            onComplete={(evidence)=>{setShowEvidenceSubmission(false); markDone(evidence);}}
            onCancel={()=>setShowEvidenceSubmission(false)}
          />
        )}
      </Suspense>

      {/* Quick Complete */}
      <Suspense fallback={
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="text-white text-lg">Loading quick complete...</div>
        </div>
      }>
        {showQuickComplete&&target&&(
          <QuickCompleteModal
            target={target}
            childName={childName}
            onComplete={(quick)=>{
              setShowQuickComplete(false);
              if(quick){
                const ev:EvidenceItem={
                  id:quick.id,
                  type:"checklist",
                  data:quick.data,
                  description:quick.description
                };
                markDone([ev]);
              }else{
                markDone();
              }
            }}
            onCancel={()=>setShowQuickComplete(false)}
          />
        )}
      </Suspense>

      {/* Coach Panel */}
      <Suspense fallback={
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="text-white text-lg">Loading coach...</div>
        </div>
      }>
        {openCoach&&target&&(
          <TargetCoachPanel
            open={openCoach}
            onClose={()=>setOpenCoach(false)}
            childName={childName}
            target={{
              id:target.id,
              title:target.title,
              description:target.description||undefined,
              category:target.category||undefined,
              difficulty:target.difficulty||undefined,
              points_award:target.points_award??undefined
            }}
            onMarkDone={markDone}
          />
        )}
      </Suspense>

      {/* Celebration overlay */}
      {showCelebration&&(
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[radial-gradient(1400px_700px_at_50%_-200px,rgba(52,211,153,0.35),transparent),radial-gradient(1000px_600px_at_10%_120%,rgba(96,165,250,0.3),transparent),linear-gradient(to_bottom,#020617,#020617)] pointer-events-none"/>
          <TargetDetailEmojiRain/>
          <div className="relative max-w-sm w-full px-6 pointer-events-none">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-emerald-400/40 via-sky-400/40 to-pink-400/40 blur-3xl opacity-80"/>
            <div className="relative z-10 rounded-3xl bg-slate-900/95 border border-emerald-300/60 px-6 py-5 text-center space-y-2 shadow-2xl">
              <div className="flex justify-center gap-2 text-3xl mb-1">
                <span className="animate-bounce">🎉</span>
                <span className="animate-bounce delay-150">🌈</span>
                <span className="animate-bounce delay-300">🏆</span>
              </div>
              <div className="text-white font-semibold text-lg">
                Mission complete, superstar!
              </div>
              <div className="text-emerald-100 text-sm">
                Your mission is marked done and your points are being added to your mission earnings.
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

function TargetDetailEmojiRain({count=80}:{count?:number}){
  const [bits]=useState(()=>Array.from({length:count}).map(()=>({
    id:Math.random().toString(36).slice(2),
    left:Math.random()*100,
    size:20+Math.random()*18,
    delay:Math.random()*0.9,
    duration:4+Math.random()*3,
    char:["🌟","✨","🎈","🎉","🏆","💫","⭐","🌈","💖","🎊"][Math.floor(Math.random()*10)]
  })));
  return(
    <div className="pointer-events-none fixed inset-0 z-[95] overflow-hidden">
      {bits.map((b)=>(
        <div
          key={b.id}
          style={{
            position:"absolute",
            left:`${b.left}%`,
            top:"-10%",
            fontSize:`${b.size}px`,
            animation:`targetdetail-fall ${b.duration}s ${b.delay}s ease-in forwards`
          }}
        >
          {b.char}
        </div>
      ))}
      <style>{`
        @keyframes targetdetail-fall{
          0%{transform:translateY(-10vh) rotate(0deg);opacity:0;}
          10%{opacity:1;}
          100%{transform:translateY(110vh) rotate(720deg);opacity:0;}
        }
      `}</style>
    </div>
  );
}
