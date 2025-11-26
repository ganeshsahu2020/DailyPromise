// src/routes/parent/ParentDashboard.tsx
import {useEffect,useMemo,useState,useRef}from "react";
import {useNavigate,Link}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {tpromise}from "@/utils/toastx";
import {ChevronDown,ChevronRight,CheckCircle2,Clock,Maximize2,Loader2}from "lucide-react";

// ✅ Dashboard widgets
import ActionCenter from "@/components/dashboard/ActionCenter";
import ProgressTimeLine from "@/components/dashboard/ProgressTimeLine";
import StreakChips from "@/components/dashboard/StreakChips";

/* ----------------------------- Types ----------------------------- */
type Child={child_uid:string;first_name:string;age:number|null};

// Used for in-memory display AND for DB rows from ai_suggestions
type Suggestion={
  id?:string;
  category:string;
  title:string;
  description?:string|null;
  solution?:string|null;
  steps?:string[];
  materials?:string[];
  whyItHelps?:string;
  difficulty?:string|null;
  points_award?:number|null;
  due_date?:string|null;
  status?:"Suggested"|"Assigned"|"Rejected";
  created_at?:string;
  source?:string|null;
};

type TargetStatus="Active"|"Completed"|"Rejected"|"Expired";
type TargetSummary={
  id:string;
  child_uid:string;
  title:string;
  status:TargetStatus;
  due_date:string|null;
  points_award:number|null;
  created_at?:string;
  completed_at?:string|null;
};

type CompletionDetail={
  completed_at:string|null;
};

/* -------- DB-aligned categories (public.target_category enum) ---- */
const CATEGORIES=[
  "Reading","Fitness","STEM","Art","Music","Chores","Life Skills",
]as const;

const VALID_CATS=new Set<string>(CATEGORIES);
function mapCategory(c?:string):(typeof CATEGORIES)[number]{
  if(!c)return"Life Skills";
  const norm=String(c).trim();
  return(VALID_CATS.has(norm)?norm:"Life Skills")as(typeof CATEGORIES)[number];
}

/** ---- Reusable dark input/select styles ---- */
const inputCls="rounded-xl px-3 py-2 bg-slate-800 text-white border border-white/20 "+
  "placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400/60 focus:border-purple-400/40";
const selectCls="rounded-xl px-3 py-2 bg-slate-800 text-white border border-white/20 w-full "+
  "focus:outline-none focus:ring-2 focus:ring-purple-400/60 focus:border-purple-400/40";

function DarkSelectStyle(){
  return(
    <style>{`
      select { color-scheme: dark; }
      select option, select optgroup { background-color: #0f172a; color: #ffffff; }
      @-moz-document url-prefix() { select option { background-color: #0b122a; color: #ffffff; } }
    `}</style>
  );
}

function statusChipClasses(status:TargetStatus){
  switch(status){
    case"Completed":return"bg-emerald-500/15 text-emerald-300 border-emerald-400/50";
    case"Active":return"bg-sky-500/15 text-sky-300 border-sky-400/50";
    case"Rejected":return"bg-rose-500/15 text-rose-300 border-rose-400/50";
    case"Expired":return"bg-amber-500/15 text-amber-300 border-amber-400/50";
    default:return"bg-white/10 text-white/70 border-white/30";
  }
}

/* ------------------- AI loading helper text --------------------- */
const AI_LOADING_MESSAGES=[
  "Checking your child’s age and interests…",
  "Balancing fun, challenge and learning…",
  "Designing targets that fit into your week…",
]as const;

/* ============================ Component ========================== */
export default function ParentDashboard(){
  const nav=useNavigate();
  const [loading,setLoading]=useState(true);

  // Family
  const [familyId,setFamilyId]=useState<string|undefined>();
  const [familyName,setFamilyName]=useState<string>("");

  // Children and AI suggestions
  const [children,setChildren]=useState<Child[]>([]);
  const [selectedChild,setSelectedChild]=useState<string>("");

  // In-memory list (also reused to show pending rows from DB)
  const [recs,setRecs]=useState<Suggestion[]>([]);

  // Completed targets (summary)
  const [completed,setCompleted]=useState<TargetSummary[]>([]);
  const [completedLoading,setCompletedLoading]=useState(false);

  // Inputs for AI
  const [age,setAge]=useState<number>(9);
  const [interests,setInterests]=useState("space,dinosaurs");
  const [prompt,setPrompt]=useState("");
  const [count,setCount]=useState<number>(5);

  // Per-row overrides when approving
  const [overrideCat,setOverrideCat]=useState<Record<string,(typeof CATEGORIES)[number]>>({});
  const [overrideDue,setOverrideDue]=useState<Record<string,string>>({});
  const [overridePts,setOverridePts]=useState<Record<string,string>>({});

  // UI toggles
  const [timelineOpen,setTimelineOpen]=useState(true);
  const [timelinePreviewOpen,setTimelinePreviewOpen]=useState(false);
  const [pendingOpen,setPendingOpen]=useState(true);
  const [completedOpen,setCompletedOpen]=useState(true);
  const [helpOpen,setHelpOpen]=useState(false);

  // Which pending suggestion is in focus in the inline preview
  const [activeSuggestionId,setActiveSuggestionId]=useState<string|null>(null);

  // AI loading / engagement
  const [aiLoading,setAiLoading]=useState(false);
  const [aiLoadingStep,setAiLoadingStep]=useState(0);

  // Ref to pending section (for scroll into view)
  const pendingSectionRef=useRef<HTMLDivElement|null>(null);

  const interestsArr=useMemo(
    ()=>interests.split(",").map((s)=>s.trim()).filter(Boolean),
    [interests]
  );

  const familyShort=useMemo(()=>{
    if(!familyId)return"";
    const a=familyId.split("-");
    return a.length?`${a[0].toUpperCase()}…${a[a.length-1]}`:familyId;
  },[familyId]);

  // rotate hint text while AI is loading
  useEffect(()=>{
    if(!aiLoading)return;
    setAiLoadingStep(0);
    const id=setInterval(()=>{
      setAiLoadingStep((s)=>(s+1)%AI_LOADING_MESSAGES.length);
    },2400);
    return()=>clearInterval(id);
  },[aiLoading]);

  /* ------------------------- Bootstrap -------------------------- */
  useEffect(()=>{
    (async()=>{
      try{
        const sess=await supabase.auth.getSession();
        const user=sess.data.session?.user;
        if(!user){setLoading(false);return;}

        const{data:boot,error:bootErr}=await supabase.rpc("api_bootstrap_parent");
        if(bootErr)throw bootErr;

        const fam=Array.isArray(boot)?boot[0]?.family_id:(boot as any)?.family_id;
        setFamilyId(fam);

        if(fam){
          const{data:famRow}=await supabase
            .from("families")
            .select("display_name")
            .eq("id",fam)
            .maybeSingle();
          setFamilyName(famRow?.display_name||"My Family");
        }

        if(fam){
          const{data:kids}=await supabase
            .from("child_profiles")
            .select("child_uid,first_name,age")
            .eq("family_id",fam)
            .order("created_at",{ascending:false});
          const k=(kids||[])as Child[];
          setChildren(k);
          if(k.length>0){
            setSelectedChild(k[0].child_uid);
            setAge(k[0].age??9);
          }
        }
      }catch(e){
        console.error("[ParentDashboard] bootstrap failed:",e);
      }finally{
        setLoading(false);
      }
    })();

    const{data:sub}=supabase.auth.onAuthStateChange((_e,s)=>{
      if(!s?.user){
        setFamilyId(undefined);
        setChildren([]);
        setSelectedChild("");
        setRecs([]);
        setCompleted([]);
        setActiveSuggestionId(null);
        try{localStorage.removeItem("aegis_pending_ai_child");}catch{/* ignore */}
      }
    });
    return()=>sub.subscription.unsubscribe();
  },[]);

  // keep age in sync with selected child
  useEffect(()=>{
    if(!selectedChild)return;
    const c=children.find((x)=>x.child_uid===selectedChild);
    if(typeof c?.age==="number")setAge(c.age);
  },[selectedChild,children]);

  /* -------------------- Load pending from DB -------------------- */
  async function loadPendingSuggestions(fid:string,child:string){
    const{data,error}=await supabase
      .from("ai_suggestions")
      .select("id,title,description,category,difficulty,points_award,due_date,status,created_at,source")
      .eq("family_id",fid)
      .eq("child_uid",child)
      .eq("status","Suggested") // backend guard: only pending rows
      .order("created_at",{ascending:false});

    if(error){
      console.error("[loadPendingSuggestions] error:",error);
      setRecs([]);
      setActiveSuggestionId(null);
      return;
    }
    const rows=(data||[])as Suggestion[];
    setRecs(rows);

    const oc:Record<string,(typeof CATEGORIES)[number]>={};
    const od:Record<string,string>={};
    const op:Record<string,string>={};
    rows.forEach((r)=>{
      const id=r.id!;
      oc[id]=mapCategory(r.category);
      od[id]=r.due_date||"";
      op[id]=String(r.points_award??10);
    });
    setOverrideCat(oc);
    setOverrideDue(od);
    setOverridePts(op);

    // focus first row in inline preview (if any)
    setActiveSuggestionId(rows.length?rows[0]?.id??null:null);
  }

  async function loadCompletedTargets(fid:string,child:string){
    setCompletedLoading(true);
    try{
      const{data,error}=await supabase
        .from("targets")
        .select("id,child_uid,title,status,due_date,points_award,created_at")
        .eq("family_id",fid)
        .eq("child_uid",child)
        .eq("status","Completed")
        .order("created_at",{ascending:false})
        .limit(5);
      if(error)throw error;

      const baseRows=(data||[])as TargetSummary[];

      // Enrich with exact completed_at from the same RPC the viewer uses
      const enriched:TargetSummary[]=await Promise.all(
        baseRows.map(async(row)=>{
          try{
            const{data:detail,error:detailErr}=await supabase.rpc("api_child_completion_detail",{
              p_child_uid:child,
              p_target_id:row.id,
            });
            if(detailErr||!detail)return row;
            const d=detail as CompletionDetail;
            return{...row,completed_at:d.completed_at};
          }catch{
            return row;
          }
        })
      );

      setCompleted(enriched);
    }catch(e){
      console.error("[loadCompletedTargets] error:",e);
      setCompleted([]);
    }finally{
      setCompletedLoading(false);
    }
  }

  useEffect(()=>{
    if(familyId&&selectedChild){
      loadPendingSuggestions(familyId,selectedChild);
      loadCompletedTargets(familyId,selectedChild);
    }else{
      setRecs([]);
      setCompleted([]);
      setActiveSuggestionId(null);
    }
  },[familyId,selectedChild]);

  /* --------------- Generate + persist to ai_suggestions --------- */
  async function suggest(){
    if(aiLoading)return;
    setAiLoading(true);
    try{
      const{data,error}=await supabase.functions.invoke("ai-generate-targets",{
        body:{age,interests:interestsArr,prompt,count},
      });

      if(error){
        console.warn("[ai-generate-targets] error:",error);
        alert("AI Suggestions service is currently unavailable.");
        return;
      }

      const j=data as any;
      const ideas:Suggestion[]=Array.isArray(j?.tasks)?j.tasks:[];
      // 🔹 Show ideas immediately in the preview list
      setRecs(ideas);

      if(familyId&&selectedChild&&ideas.length){
        const rows=await Promise.all(
          ideas.slice(0,10).map(async(t)=>({
            family_id:familyId,
            child_uid:selectedChild,
            title:t.title,
            description:t.description??t.solution??null,
            category:mapCategory(t.category),
            difficulty:"Easy",
            points_award:10,
            due_date:null,
            source:j.source||"openai",
            status:"Suggested"as const,
            created_by:(await supabase.auth.getUser()).data.user?.id??null,
          }))
        );

        await tpromise(
          supabase.from("ai_suggestions").insert(rows as any[]),
          {
            loading:"Saving AI ideas…",
            success:"AI suggestions saved",
            error:"Couldn't save suggestions",
          }
        );

        // 🔹 Reload from DB so IDs/status are present and update Pending panel
        await loadPendingSuggestions(familyId,selectedChild);

        // 🔹 Automatically open & scroll to pending approvals
        setPendingOpen(true);
        setTimeout(()=>{
          if(pendingSectionRef.current){
            pendingSectionRef.current.scrollIntoView({behavior:"smooth",block:"start"});
          }
        },80);
      }
    }catch(e){
      console.error("suggest() failed:",e);
      alert("Could not reach AI Suggestions service.");
    }finally{
      setAiLoading(false);
    }
  }

  /* ----------------------- Approve via RPC ---------------------- */
  async function approve(aiId:string){
    if(!familyId||!selectedChild)return;

    const category=overrideCat[aiId]||"Life Skills";
    const points=parseInt(overridePts[aiId]||"10",10);
    const due=overrideDue[aiId]||null;

    await tpromise(
      supabase.rpc("approve_ai_suggestion",{
        p_ai_id:aiId,
        p_points:Number.isFinite(points)?points:10,
        p_due:due?due:null,
        p_category:category,
        p_difficulty:"Easy",
      }),
      {
        loading:"Assigning target…",
        success:"Target assigned ✨",
        error:(err:any)=>err?.message||"Assignment failed",
      }
    );

    await loadPendingSuggestions(familyId,selectedChild);
    await loadCompletedTargets(familyId,selectedChild);
  }

  /* -------------------- Derived UI helpers ---------------------- */
  // Only show true pending rows, sorted by suggestion title
  const pendingSorted=useMemo(()=>{
    const filtered=recs.filter((r)=>!r.status||r.status==="Suggested");
    return[...filtered].sort((a,b)=>{
      const ta=(a.title||"").toLocaleLowerCase();
      const tb=(b.title||"").toLocaleLowerCase();
      if(ta<tb)return-1;
      if(ta>tb)return 1;
      return 0;
    });
  },[recs]);

  const activePendingId=useMemo(()=>{
    if(!pendingSorted.length)return null;
    if(activeSuggestionId&&pendingSorted.some((r)=>r.id===activeSuggestionId)){
      return activeSuggestionId;
    }
    return pendingSorted[0].id??null;
  },[pendingSorted,activeSuggestionId]);

  const activePending=useMemo(
    ()=>pendingSorted.find((r)=>r.id===activePendingId)||null,
    [pendingSorted,activePendingId]
  );

  const pendingCount=pendingSorted.length;

  // 🔔 Sync pending-count badge for sidebar (Child Targets)
  useEffect(()=>{
    try{
      if(selectedChild){
        const payload={child:selectedChild,count:pendingCount};
        localStorage.setItem("aegis_pending_ai_child",JSON.stringify(payload));
        // optional custom event so other components can subscribe
        window.dispatchEvent(new Event("aegis-pending-ai-updated"));
      }else{
        localStorage.removeItem("aegis_pending_ai_child");
      }
    }catch{/* ignore */}
  },[selectedChild,pendingCount]);

  // 🔹 From preview card → open Pending + scroll + focus
  function handlePreviewClick(t:Suggestion){
    setPendingOpen(true);
    if(t.id){
      setActiveSuggestionId(t.id);
    }
    setTimeout(()=>{
      if(pendingSectionRef.current){
        pendingSectionRef.current.scrollIntoView({behavior:"smooth",block:"start"});
      }
    },60);
  }

  /* -------------------- Routes for CTAs ------------------------- */
  const dailyReviewPath="/parent/daily-activities";
  const reportPreviewPath=selectedChild
    ?`/parent/report/preview?child=${encodeURIComponent(selectedChild)}`
    :"/parent/report/preview";

  return(
    <div className="space-y-6">
      <DarkSelectStyle/>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text:white text-white">Parent Dashboard</h1>
          <p className="text-white/70 mt-1">Manage your family&apos;s activities and rewards</p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={()=>nav(dailyReviewPath)}
            aria-label="Review Daily Submissions"
          >
            Review Daily Submissions
          </button>
          <Link
            to={reportPreviewPath}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            aria-label="Open Report Preview"
          >
            Report Preview / Print
          </Link>
          <button
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/15 text-white text-sm border border-white/15"
            type="button"
            onClick={()=>setHelpOpen(true)}
          >
            Dashboard Guide
          </button>
        </div>
      </div>

      {/* Streak + Action/Timeline */}
      <div className="mb-2">
        <StreakChips childUid={selectedChild}/>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Action Center */}
        <div className="rounded-2xl p-5 border border-white/15 bg-white/5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-bold text-white">Action Center</h3>
              <p className="text-xs text-white/60 mt-1">Today&apos;s approvals & quick decisions</p>
            </div>
            <button
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
              onClick={()=>nav(dailyReviewPath)}
            >
              Review Daily
            </button>
          </div>
          <ActionCenter familyId={familyId} childUid={selectedChild}/>
        </div>

        {/* Progress Timeline (collapsible + inline preview overlay) */}
        <div className="rounded-2xl p-5 border border-white/15 bg-white/5">
          <button
            type="button"
            className="w-full flex items-center justify-between text-left"
            onClick={()=>setTimelineOpen((v)=>!v)}
          >
            <div>
              <div className="flex items: center gap-2">
                {timelineOpen?(
                  <ChevronDown className="w-4 h-4 text-emerald-300"/>
                ):(
                  <ChevronRight className="w-4 h-4 text-emerald-300"/>
                )}
                <h3 className="text-lg font-bold text-white">
                  Progress Timeline{selectedChild?" — Activity":" "}
                </h3>
              </div>
              <p className="text-xs text-white/60 mt-1">
                Tap to show or hide recent activity for the selected child.
              </p>
            </div>
          </button>

          {timelineOpen&&(
            <>
              <div className="mt-4">
                <ProgressTimeLine childUid={selectedChild}/>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/60">
                <Clock className="w-3 h-3"/>
                <span>Use the full report view for detailed history and printing.</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                  onClick={()=>setTimelinePreviewOpen(true)}
                >
                  <Maximize2 className="w-3 h-3"/>
                  <span>Open inline timeline preview</span>
                </button>
                <Link
                  to={reportPreviewPath}
                  className="inline-block px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                >
                  Open Report Preview / Print
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Family Summary */}
        <div className="glass rounded-2xl p-5 lg:col-span-1">
          <h2 className="text-xl font-bold text-white mb-4">Family Overview</h2>
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-white/90">Family name</div>
              <div className="text-lg font-semibold text-white">{familyName||"My Family"}</div>
              {familyId&&(
                <div className="text-xs text-white/60 mt-1">
                  ID: <span className="font-mono">{familyShort}</span>
                </div>
              )}
            </div>

            <div>
              <div className="text-white/90">Children</div>
              <div className="space-y-2 mt-2">
                {children.length===0?(
                  <div className="text-white/60 text-sm">No children added yet.</div>
                ):(
                  children.map((child)=>(
                    <button
                      key={child.child_uid}
                      type="button"
                      className={[
                        "w-full flex items-center gap-3 p-2 rounded-lg border text-left transition",
                        selectedChild===child.child_uid
                          ?"bg-emerald-500/10 border-emerald-400/40"
                          :"bg-white/5 border-white/10 hover:bg-white/10",
                      ].join(" ")}
                      onClick={()=>setSelectedChild(child.child_uid)}
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-400"/>
                      <div className="flex-1">
                        <div className="text-white font-medium">{child.first_name}</div>
                        <div className="text-white/60 text-xs">
                          Age: {child.age??"—"} • Tap to focus activity
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AI Suggestions (generator) */}
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <h2 className="text-xl font-bold text-white mb-4">Magic Target Suggestions</h2>

          {/* Child picker + inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="magic-child" className="text-xs text-white/60">
                Child
              </label>
              <select
                id="magic-child"
                className={selectCls}
                value={selectedChild}
                onChange={(e)=>setSelectedChild(e.target.value)}
                aria-label="Select child"
              >
                {children.length===0?(
                  <option value="">No children</option>
                ):children.map((c)=>(
                  <option key={c.child_uid} value={c.child_uid}>
                    {c.first_name} (age {c.age??"—"})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="magic-age" className="text-xs text-white/60">
                Age (years)
              </label>
              <input
                id="magic-age"
                className={inputCls}
                type="number"
                min={3}
                max={17}
                value={age}
                onChange={(e)=>setAge(parseInt(e.target.value||"9"))}
                title="Child age"
                aria-label="Child age"
                placeholder="Child age"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="magic-interests" className="text-xs text-white/60">
                Interests (comma separated)
              </label>
              <input
                id="magic-interests"
                className={inputCls}
                placeholder="e.g., space, dinosaurs"
                value={interests}
                onChange={(e)=>setInterests(e.target.value)}
                aria-label="Interests"
              />
            </div>
          </div>

          {/* Prompt + count */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="col-span-1 md:col-span-3 flex flex-col gap-1">
              <label htmlFor="magic-prompt" className="text-xs text-white/60">
                Describe the type of target you want
              </label>
              <textarea
                id="magic-prompt"
                className={`${inputCls} min-h-[44px] resize-none`}
                placeholder="Tell the AI what you want (e.g., 'indoor STEM challenge that takes 20 minutes')"
                value={prompt}
                onChange={(e)=>setPrompt(e.target.value)}
                aria-label="AI prompt"
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="magic-count" className="text-xs text-white/60">
                Number of ideas
              </label>
              <select
                id="magic-count"
                className={selectCls}
                value={String(count)}
                onChange={(e)=>setCount(parseInt(e.target.value||"5"))}
                title="How many ideas"
                aria-label="Number of ideas"
              >
                {[5,6,7,8,9,10].map((n)=>(
                  <option key={n} value={n}>{n} ideas</option>
                ))}
              </select>
            </div>
          </div>

          <button
            className={[
              "w-full px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600",
              "hover:from-emerald-400 hover:to-teal-500 text-white font-semibold transition-all",
              aiLoading?"opacity-70 cursor-wait":"cursor-pointer",
            ].join(" ")}
            onClick={suggest}
            aria-label="Generate suggestions"
            disabled={aiLoading}
          >
            {aiLoading?(
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin"/>
                <span>Creating personalised ideas…</span>
              </span>
            ):(
              "Generate AI Suggestions"
            )}
          </button>

          {aiLoading&&(
            <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-white/80">
              <p className="font-semibold text-emerald-200 mb-0.5">
                Working on it…
              </p>
              <p>{AI_LOADING_MESSAGES[aiLoadingStep]}</p>
            </div>
          )}

          {/* Simple preview of last generated / pending ideas */}
          <div className="mt-4 space-y-3" aria-live="polite">
            {recs.map((t,i)=>(
              <button
                key={t.id??`idea-${i}`}
                type="button"
                className="w-full text-left glass-premium rounded-xl p-3 border border-white/20 hover:bg-white/10 transition"
                onClick={()=>handlePreviewClick(t)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">
                    {mapCategory(t.category)}
                  </span>
                  <div className="font-semibold text-white line-clamp-2">{t.title}</div>
                </div>
                {t.description&&(
                  <div className="text-white/80 text-sm line-clamp-3">
                    {t.description}
                  </div>
                )}
                {t.status&&(
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-white/50">
                    Status: {t.status}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pending Approvals (collapsible, name list + inline preview card) */}
      <div ref={pendingSectionRef} className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={()=>setPendingOpen((v)=>!v)}
          >
            {pendingOpen?(
              <ChevronDown className="w-4 h-4 text-sky-300"/>
            ):(
              <ChevronRight className="w-4 h-4 text-sky-300"/>
            )}
            <div>
              <h2 className="text-xl font-bold text-white">Pending Target Suggestions</h2>
              <p className="text-xs text-white/60">
                Only suggestions waiting for approval are shown here. Tap a name to preview and assign.
              </p>
            </div>
          </button>

          <button
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
            onClick={()=>nav(reportPreviewPath)}
          >
            Report Preview / Print
          </button>
        </div>

        {!pendingOpen&&(
          <div className="text-xs text-white/60 mt-2">
            Collapsed. Tap the heading to expand and approve suggestions.
          </div>
        )}

        {pendingOpen&&(
          <>
            {!familyId||!selectedChild?(
              <div className="text-white/70 text-center py-4">
                Pick a child to load suggestions.
              </div>
            ):pendingSorted.length===0?(
              <div className="text-white/70 text-center py-4">
                No pending Target suggestions. Generate some ideas above.
              </div>
            ):(
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
                {/* Left: compact name list sorted by title */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 max-h-[360px] overflow-y-auto space-y-1">
                  {pendingSorted.map((r)=>(
                    <button
                      key={r.id}
                      type="button"
                      className={[
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition",
                        activePendingId===r.id
                          ?"bg-emerald-500/15 border border-emerald-400/40"
                          :"bg-transparent border border-transparent hover:bg-white/10",
                      ].join(" ")}
                      onClick={()=>setActiveSuggestionId(r.id??null)}
                    >
                      <span className="px-2 py-1 rounded text-[11px] bg-blue-500/20 text-blue-300 shrink-0">
                        {mapCategory(r.category)}
                      </span>
                      <span className="flex-1 text-white font-semibold line-clamp-2">
                        {r.title}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Right: inline preview card with Approve & Assign controls */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 min-h-[220px]">
                  {!activePending?(
                    <div className="text-white/70 text-sm">
                      Select a suggestion on the left to preview details and approve.
                    </div>
                  ):(
                    <>
                      <div className="flex flex-col gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">
                            {mapCategory(activePending.category)}
                          </span>
                          <h3 className="font-semibold text-white break-words">
                            {activePending.title}
                          </h3>
                        </div>
                        {activePending.description&&(
                          <div className="text-white/80 text-sm break-words">
                            {activePending.description}
                          </div>
                        )}
                        {activePending.created_at&&(
                          <div className="mt-1 text-[11px] text-white/50 flex items-center gap-1">
                            <Clock className="w-3 h-3"/>
                            <span>
                              Suggested{" "}
                              {new Date(activePending.created_at).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                        <div className="flex flex-col gap-1">
                          <label htmlFor="approve-category" className="text-xs text-white/60">
                            Category
                          </label>
                          <select
                            id="approve-category"
                            className={`${selectCls} text-sm`}
                            value={overrideCat[activePendingId!]??mapCategory(activePending.category)}
                            onChange={(e)=>setOverrideCat((s)=>({
                              ...s,
                              [activePendingId!]:e.target.value as(typeof CATEGORIES)[number],
                            }))}
                            title="Category"
                          >
                            {CATEGORIES.map((c)=>(
                              <option key={c}value={c}>{c}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label htmlFor="approve-due" className="text-xs text-white/60">
                            Due date (optional)
                          </label>
                          <input
                            id="approve-due"
                            className={`${inputCls} text-sm`}
                            type="date"
                            value={overrideDue[activePendingId!]??""}
                            onChange={(e)=>setOverrideDue((s)=>({
                              ...s,
                              [activePendingId!]:e.target.value,
                            }))}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label htmlFor="approve-points" className="text-xs text-white/60">
                            Points to award
                          </label>
                          <input
                            id="approve-points"
                            className={`${inputCls} text-sm`}
                            type="number"
                            min={0}
                            step={1}
                            placeholder="Points"
                            value={overridePts[activePendingId!]??"10"}
                            onChange={(e)=>setOverridePts((s)=>({
                              ...s,
                              [activePendingId!]:e.target.value,
                            }))}
                          />
                        </div>
                      </div>

                      <button
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                        onClick={()=>activePendingId&&approve(activePendingId)}
                        disabled={!activePendingId}
                      >
                        <CheckCircle2 className="w-4 h-4"/>
                        <span>Approve &amp; Assign</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recently Completed Targets (with status & direct completion jump) */}
      <div className="glass rounded-2xl p-5">
        <button
          type="button"
          className="w-full flex items-center justify-between text-left mb-3"
          onClick={()=>setCompletedOpen((v)=>!v)}
        >
          <div className="flex items-center gap-2">
            {completedOpen?(
              <ChevronDown className="w-4 h-4 text-emerald-300"/>
            ):(
              <ChevronRight className="w-4 h-4 text-emerald-300"/>
            )}
            <div>
              <h2 className="text-xl font-bold text-white">Recently Completed Targets</h2>
              <p className="text-xs text-white/60">
                Snapshot of the latest finished activities — tap View completion to review &amp; approve.
              </p>
            </div>
          </div>
        </button>

        {completedOpen&&(
          <>
            {!familyId||!selectedChild?(
              <div className="text-white/70 text-center py-3">
                Pick a child to see completed targets.
              </div>
            ):completedLoading?(
              <div className="text-white/70 text-center py-3">
                Loading completed targets…
              </div>
            ):completed.length===0?(
              <div className="text-white/70 text-center py-3">
                No completed targets yet for this child.
              </div>
            ):(
              <div className="space-y-3">
                {completed.map((t)=>(
                  <div
                    key={t.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "px-2 py-1 rounded-full text-[11px] border",
                            statusChipClasses(t.status),
                          ].join(" ")}
                        >
                          {t.status}
                        </span>
                        <span className="font-semibold text-white break-words">
                          {t.title}
                        </span>
                      </div>
                      <div className="text-xs text-white/60 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {t.points_award!=null&&(
                          <span>+{t.points_award} pts</span>
                        )}
                        {t.due_date&&(
                          <span>Due {t.due_date}</span>
                        )}
                        {(t.completed_at||t.created_at)&&(
                          <span>
                            Completed{" "}
                            {new Date((t.completed_at||t.created_at) as string).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-auto">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs border border-white/20"
                        onClick={()=>{
                          nav(`/parent/targets?child=${encodeURIComponent(t.child_uid)}&target=${encodeURIComponent(t.id)}`);
                        }}
                      >
                        <CheckCircle2 className="w-3 h-3"/>
                        <span>View completion</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Inline fullscreen-style preview for Progress Timeline */}
      {timelinePreviewOpen&&(
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Progress Timeline — Activity
                </h2>
                <p className="text-xs text-white/60">
                  Inline preview focused on the currently selected child.
                </p>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                onClick={()=>setTimelinePreviewOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              <ProgressTimeLine childUid={selectedChild}/>
            </div>
          </div>
        </div>
      )}

      {/* Inline help / instructions overlay */}
      {helpOpen&&(
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border:white border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Dashboard Guide – How this screen works
              </h2>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                onClick={()=>setHelpOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto text-sm text-white/80 space-y-4">
              <section>
                <h3 className="font-semibold text-white mb-1">1. Choose a child</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Use the <span className="font-semibold">Children</span> list on the left to focus the dashboard on one child.</li>
                  <li>All widgets (streaks, timeline, AI suggestions, completed targets) follow the selected child.</li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text:white text-white mb-1">2. Action Center</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Shows today&apos;s items that need a quick decision (approve, reject, review).</li>
                  <li>Use <span className="font-semibold">Review Daily</span> to open the full daily-activities screen.</li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-white mb-1">3. Progress Timeline</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Shows a running history of checklists, targets and points for the selected child.</li>
                  <li>Collapse the card to keep the dashboard compact, or use <span className="font-semibold">Open inline timeline preview</span> for a larger view.</li>
                  <li><span className="font-semibold">Report Preview / Print</span> opens a printable report with the same data.</li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-white mb-1">4. Magic Target Suggestions</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Set age and interests, then describe what you want the AI to plan.</li>
                  <li>Use <span className="font-semibold">Generate AI Suggestions</span> to create ideas; they are stored as pending items for this child.</li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-white mb-1">5. Pending Target Suggestions</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>The left column lists all AI ideas that are still waiting to be approved.</li>
                  <li>Tap a title to open its full card on the right.</li>
                  <li>Adjust category, due date and points, then press <span className="font-semibold">Approve &amp; Assign</span> to turn it into a real target.</li>
                  <li>The number of pending ideas also appears as a small badge next to <span className="font-semibold">Child Targets</span> in the sidebar.</li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-white mb-1">6. Recently Completed Targets</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Shows the last few activities the child has completed, with coloured status and points.</li>
                  <li>Dates are aligned to the same completion events as the detailed viewer.</li>
                  <li>Tap <span className="font-semibold">View completion</span> to jump into the Targets screen and review evidence with one click.</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
