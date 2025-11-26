import {useEffect,useMemo,useState}from "react";
import {useSearchParams,useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {tpromise}from "@/utils/toastx";
import {Clock,BookOpen,Calendar,Target as TargetIcon,CheckCircle2,XCircle}from "lucide-react";

/** DB-aligned types */
type Child={child_uid:string; first_name:string; last_name:string|null; age:number|null;};

type ReviewStatus="Pending"|"Approved"|"Rejected";

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
  created_at?:string;

  // New review metadata
  review_status?:"Pending"|"Approved"|"Rejected"|null;
  reviewed_at?:string|null;
  awarded_points?:number|null;
};

type CompletionDetail={
  target_id:string;
  completion_type:"full_evidence"|"quick_complete"|"completed";
  note:string|null;
  completed_at:string|null;
  points_award:number|null;
  evidence:Array<{
    id:string;
    type:"photo"|"video"|"audio"|"text"|"checklist";
    data:any;
    description?:string|null;
    created_at?:string|null;
  }>;
  events:Array<{id:string; type:string; note:string|null; created_at:string;}>;
};

/** EXACTLY match DB constraints */
const CATEGORIES=["Reading","Fitness","STEM","Art","Music","Chores","Life Skills"]as const;
const DIFFICULTY=["Easy","Medium","Hard"]as const;
const STATUS=["Active","Completed","Rejected","Expired"]as const;

type StatusFilter="all"|"active"|"completed";

/** ---- UI helpers: consistent, readable controls (dark UI) ---- */
const selectCls="rounded px-3 py-2 bg-slate-800 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/40 placeholder-white/60";
const inputCls="rounded px-3 py-2 bg-slate-800 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/40 placeholder-white/60";
const buttonGhost="px-3 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/15";

/** Ensure native <option> menus are readable across browsers */
function DarkSelectStyle(){
  return(
    <style>{`
      select { color-scheme: dark; }
      select option, select optgroup { background-color: #0f172a; color: #ffffff; }
      @-moz-document url-prefix() {
        select option { background-color: #0b122a; color: #ffffff; }
      }
    `}</style>
  );
}

export default function TargetsPage(){
  const [loading,setLoading]=useState(true);

  const nav=useNavigate();
  const [searchParams,setSearchParams]=useState<any>(useSearchParams()[0]);

  // Family context
  const [familyId,setFamilyId]=useState<string|null>(null);
  const [children,setChildren]=useState<Child[]>([]);

  // Data
  const [targets,setTargets]=useState<Target[]>([]);

  // Create form
  const [form,setForm]=useState<Partial<Target>>({
    status:"Active",
    points_award:10,
    category:CATEGORIES[0],
    difficulty:"Easy",
  });

  // Completion viewer (parent side)
  const [viewerOpen,setViewerOpen]=useState(false);
  const [viewerLoading,setViewerLoading]=useState(false);
  const [viewerErr,setViewerErr]=useState<string|null>(null);
  const [viewer,setViewer]=useState<CompletionDetail|null>(null);
  const [viewerForTitle,setViewerForTitle]=useState<string>("");
  const [viewerTargetId,setViewerTargetId]=useState<string|null>(null);
  const [viewerChildUid,setViewerChildUid]=useState<string|null>(null);

  // Review actions (approve/reject)
  const [reviewWorking,setReviewWorking]=useState(false);
  const [reviewNote,setReviewNote]=useState("");
  const [reviewError,setReviewError]=useState<string|null>(null);

  // Inline overlays
  const [timelineOpen,setTimelineOpen]=useState(false);
  const [guideOpen,setGuideOpen]=useState(false);

  // Filters
  const [statusFilter,setStatusFilter]=useState<StatusFilter>("all");

  // Current target being viewed (to lock review panel once decided)
  const viewerTarget=useMemo(
    ()=>targets.find((t)=>t.id===viewerTargetId)||null,
    [targets,viewerTargetId]
  );

  const viewerDecision=viewerTarget?.review_status as ReviewStatus|undefined;
  const viewerAlreadyDecided=viewerDecision==="Approved"||viewerDecision==="Rejected";

  const currentChild=useMemo(
    ()=>children.find((c)=>c.child_uid===form.child_uid),
    [children,form.child_uid]
  );

  // Apply query param child on first load (if present)
  useEffect(()=>{
    const qpChild=searchParams.get("child");
    if(qpChild){
      setForm((f)=>({...f,child_uid:qpChild}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    (async()=>{
      try{
        setLoading(true);
        const {data:auth,error:authErr}=await supabase.auth.getUser();
        const me=auth?.user||null;

        if(authErr){
          console.warn("[TargetsPage] auth getUser error:",authErr);
          setFamilyId(null);
          setChildren([]);
          return;
        }
        if(!me){
          console.warn("[TargetsPage] no authenticated parent user");
          setFamilyId(null);
          setChildren([]);
          return;
        }

        const {data:p,error:pErr}=await supabase
          .from("parent_profiles")
          .select("family_id")
          .eq("parent_uid",me.id)
          .maybeSingle();

        if(pErr) throw pErr;
        if(!p?.family_id){
          setFamilyId(null);
          setChildren([]);
          return;
        }

        setFamilyId(p.family_id);

        const {data:kids,error:kErr}=await supabase
          .from("child_profiles")
          .select("child_uid,first_name,last_name,age")
          .eq("family_id",p.family_id)
          .order("created_at",{ascending:false});

        if(kErr) throw kErr;
        const list=(kids||[])as Child[];
        setChildren(list);

        if(!form.child_uid&&list.length>0){
          setForm((f)=>({...f,child_uid:list[0].child_uid}));
        }

        await refresh(p.family_id);
      }catch(e){
        console.error("[TargetsPage] bootstrap failed:",e);
        setFamilyId(null);
        setChildren([]);
      }finally{
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  async function refresh(fam:string){
    const {data,error}=await supabase
      .from("targets")
      .select("id,family_id,child_uid,title,description,category,difficulty,due_date,status,points_award,created_at,review_status,reviewed_at,awarded_points")
      .eq("family_id",fam)
      .order("created_at",{ascending:false});

    if(error){
      console.error("[refresh] error:",error);
      return;
    }
    setTargets((data||[])as Target[]);
  }

  function explainInsertError(e:any):string{
    const code=e?.code;
    const msg=e?.message||"";
    if(code==="22P02"&&msg.includes("enum target_category")){
      return"Category must be one of the allowed values. Pick from the Category dropdown.";
    }
    if(code==="23514"){
      if(msg.includes("targets_difficulty_check")) return"Difficulty must be one of: Easy, Medium, Hard.";
      if(msg.includes("targets_status_check")) return"Status must be one of: Active, Completed, Rejected, Expired.";
      return"Some value violates a database rule. Please adjust your inputs.";
    }
    return msg||"Insert failed";
  }

  async function save(){
    try{
      if(!familyId) return alert("No family ID available.");
      if(!form.child_uid) return alert("Please choose a child.");
      if(!form.title||form.title.trim().length===0) return alert("Activity title is required.");
      if(!form.category||!CATEGORIES.includes(form.category as any)){
        return alert("Pick a Category from the dropdown.");
      }
      if(form.difficulty&&!DIFFICULTY.includes(form.difficulty as any)){
        return alert("Difficulty must be Easy, Medium, or Hard.");
      }
      if(form.status&&!STATUS.includes(form.status as any)){
        return alert("Status must be Active, Completed, Rejected, or Expired.");
      }

      const {data:auth}=await supabase.auth.getUser();
      const me=auth?.user||null;
      if(!me) return alert("You need to be signed in as a parent.");

      const payload={
        family_id:familyId,
        child_uid:form.child_uid,
        title:form.title!.trim(),
        description:form.description?.trim()||null,
        category:form.category as string,
        difficulty:form.difficulty||"Easy",
        due_date:form.due_date||null,
        status:form.status||"Active",
        points_award:typeof form.points_award==="number"
          ?form.points_award
          :parseInt(String(form.points_award??10),10)||10,
        created_by:me.id,
      }as const;

      // Primary attempt (with created_by)
      const first=supabase.from("targets").insert(payload as any);

      // If created_by blocked by RLS, retry without it
      await tpromise(
        first.then(async({error})=>{
          if(error&&String(error.message||"").includes("created_by")){
            const {error:retryErr}=await supabase
              .from("targets")
              .insert({...payload,created_by:undefined}as any);
            if(retryErr) throw retryErr;
          }else if(error){
            throw error;
          }
          return{ok:true};
        }),
        {loading:"Creating target…",success:"Target created",error:(e:any)=>explainInsertError(e)}
      );

      setForm((f)=>({
        child_uid:f.child_uid,
        category:f.category??CATEGORIES[0],
        difficulty:"Easy",
        status:"Active",
        points_award:10,
      }));
      await refresh(familyId);
    }catch(e:any){
      console.error("[save] insert failed:",e);
      alert(explainInsertError(e));
    }
  }

  async function remove(id:string){
    if(!familyId) return;
    if(!confirm("Delete this target?")) return;

    await tpromise(
      supabase.from("targets").delete().eq("id",id),
      {loading:"Deleting…",success:"Target deleted",error:(e:any)=>e?.message||"Delete failed"}
    );

    await refresh(familyId);
  }

  /** Sign storage paths for evidence and return a viewer-ready detail */
  async function resolveEvidence(detail:CompletionDetail):Promise<CompletionDetail>{
    const resolved=await Promise.all(
      (detail.evidence||[]).map(async(ev)=>{
        const v=ev.data;

        // 0) Structured JSON: {bucket, path} → use exactly that
        if(v&&typeof v==="object"){
          const bucket=(v as any).bucket;
          const path=(v as any).path;
          if(typeof bucket==="string"&&typeof path==="string"){
            try{
              const {data:urlData,error}=await supabase
                .storage
                .from(bucket)
                .createSignedUrl(path,3600);

              if(!error&&urlData?.signedUrl){
                return{...ev,data:urlData.signedUrl};
              }
            }catch{
              // fall back to original value
            }
            return ev;
          }
        }

        // 1) Non-string → just return as-is
        if(typeof v!=="string"){
          return ev;
        }

        let raw=String(v).trim().replace(/^"+|"+$/g,"");
        if(!raw){
          return ev;
        }

        // 2) Already a URL or data URI → use as-is (no signing)
        if(/^https?:\/\//i.test(raw)||/^data:/i.test(raw)){
          return{...ev,data:raw};
        }

        // Legacy one-off: skip this broken filename so we don't hit Storage
        if(raw==="DesktopScreenshot.png"){
          console.warn("[resolveEvidence] skipping legacy DesktopScreenshot.png evidence");
          return{...ev,data:null};
        }

        const candidates:{bucket:string; path:string}[]=[];

        // 3) Canonical bucket-prefixed formats
        if(raw.startsWith("memories/")){
          // Only sign if evidence explicitly points into memories
          candidates.push({bucket:"memories",path:raw.slice("memories/".length)});
        }else if(raw.startsWith("target-evidence/")){
          // Path already includes folder inside target-evidence
          candidates.push({bucket:"target-evidence",path:raw.slice("target-evidence/".length)});
        }else if(raw.startsWith("stickers/")){
          candidates.push({bucket:"stickers",path:raw.slice("stickers/".length)});
        }else if(raw.startsWith("sticker-")){
          // plain sticker name
          candidates.push({bucket:"stickers",path:raw});
        }else{
          // 4) Bare or unknown string (e.g. "DesktopScreenshot.png")
          //    → your current uploader saves this in the root of target-evidence.
          candidates.push({bucket:"target-evidence",path:raw});
        }

        if(!candidates.length){
          return ev;
        }

        for(const c of candidates){
          try{
            const {data:urlData,error}=await supabase
              .storage
              .from(c.bucket)
              .createSignedUrl(c.path,3600);

            if(!error&&urlData?.signedUrl){
              return{...ev,data:urlData.signedUrl};
            }
          }catch{
            // ignore and try next (if any)
          }
        }

        // Nothing worked → fall back to original
        return ev;
      })
    );

    return{...detail,evidence:resolved};
  }

  async function viewCompletion(t:Target){
    try{
      setViewerErr(null);
      setViewer(null);
      setViewerForTitle(t.title);
      setViewerTargetId(t.id);
      setViewerChildUid(t.child_uid);
      setViewerOpen(true);
      setViewerLoading(true);
      setReviewNote("");
      setReviewError(null);

      const {data,error}=await supabase.rpc("api_child_completion_detail",{p_child_uid:t.child_uid,p_target_id:t.id});
      if(error) throw error;

      const signed=await resolveEvidence(data as CompletionDetail);
      setViewer(signed);
    }catch(e:any){
      console.error("[TargetsPage] completion detail error:",e);
      setViewerErr(e?.message||"Could not load completion details.");
      setViewer(null);
    }finally{
      setViewerLoading(false);
    }
  }

  // Approve → wallet update + review_status via RPC (with parent uid)
  async function approveCompletion(){
    if(!viewerChildUid||!viewerTargetId) return;
    try{
      setReviewWorking(true);
      setReviewError(null);

      const {data:auth}=await supabase.auth.getUser();
      const user=auth?.user??null;
      if(!user){
        throw new Error("You must be logged in as a parent");
      }

      await tpromise(
        supabase
          .rpc("approve_target_completion",{
            p_parent_uid:user.id,
            p_child_uid:viewerChildUid,
            p_target_id:viewerTargetId,
            p_points:null,
            p_note:reviewNote||null,
          })
          .then(({error})=>{
            if(error) throw error;
            return{ok:true};
          }),
        {
          loading:"Approving and updating wallet…",
          success:"Approved & wallet updated",
          error:(e:any)=>e?.message||"Approval failed",
        }
      );

      if(familyId) await refresh(familyId);
    }catch(e:any){
      console.error("[TargetsPage] approveCompletion failed:",e);
      setReviewError(e?.message||"Approval failed");
    }finally{
      setReviewWorking(false);
    }
  }

  // Reject → mark rejected via RPC (with parent uid)
  async function rejectCompletion(){
    if(!viewerChildUid||!viewerTargetId) return;
    if(!confirm("Reject this completion? No points will be awarded.")) return;
    try{
      setReviewWorking(true);
      setReviewError(null);

      const {data:auth}=await supabase.auth.getUser();
      const user=auth?.user??null;
      if(!user){
        throw new Error("You must be logged in as a parent");
      }

      await tpromise(
        supabase
          .rpc("reject_target_completion",{
            p_parent_uid:user.id,
            p_child_uid:viewerChildUid,
            p_target_id:viewerTargetId,
            p_note:reviewNote||null,
          })
          .then(({error})=>{
            if(error) throw error;
            return{ok:true};
          }),
        {
          loading:"Rejecting completion…",
          success:"Completion rejected",
          error:(e:any)=>e?.message||"Rejection failed",
        }
      );

      if(familyId) await refresh(familyId);
    }catch(e:any){
      console.error("[TargetsPage] rejectCompletion failed:",e);
      setReviewError(e?.message||"Rejection failed");
    }finally{
      setReviewWorking(false);
    }
  }

  // When arriving from dashboard: ?target=...&child=...
  useEffect(()=>{
    const targetId=searchParams.get("target");
    if(!targetId||targets.length===0) return;
    const t=targets.find((x)=>x.id===targetId);
    if(!t) return;

    // Focus that child + completed filter
    setForm((f)=>f.child_uid?f:{...f,child_uid:t.child_uid});
    setStatusFilter("completed");
    viewCompletion(t);

    // Clear only the target param so refreshes don't reopen it endlessly
    setSearchParams((prev:any)=>{
      const p=new URLSearchParams(prev as any);
      p.delete("target");
      return p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[targets]);

  function intOrNull(v:string,fallback=10){
    const n=parseInt(v||"",10);
    return Number.isFinite(n)?n:fallback;
  }

  const prettyChild=(uid:string)=>{
    const c=children.find((ch)=>ch.child_uid===uid);
    if(!c) return uid.slice(0,8);
    return c.first_name||uid.slice(0,8);
  };

  const statusBadge=(s:string)=>{
    switch(s){
      case "Active": return"bg-emerald-500/15 border-emerald-500/30 text-emerald-200";
      case "Completed": return"bg-sky-500/15 border-sky-500/30 text-sky-200";
      case "Rejected": return"bg-rose-500/15 border-rose-500/30 text-rose-200";
      case "Expired": return"bg-amber-500/15 border-amber-500/30 text-amber-200";
      default: return"bg-white/10 border-white/20 text-white/70";
    }
  };

  const reviewStatusBadge=(s?:ReviewStatus)=>{
    switch(s){
      case "Approved":
        return"bg-emerald-500/20 border-emerald-500/40 text-emerald-200";
      case "Rejected":
        return"bg-rose-500/20 border-rose-500/40 text-rose-200";
      case "Pending":
      default:
        return"bg-slate-500/20 border-slate-500/40 text-slate-200";
    }
  };

  const reviewStatusLabel=(s?:ReviewStatus)=>{
    switch(s){
      case "Approved": return"Approved";
      case "Rejected": return"Rejected";
      case "Pending":
      default: return"Pending review";
    }
  };

  const sortedTimeline=useMemo(()=>{
    const arr=[...targets];
    arr.sort((a,b)=>{
      const aKey=a.created_at||a.due_date||"";
      const bKey=b.created_at||b.due_date||"";
      return new Date(bKey).getTime()-new Date(aKey).getTime();
    });
    return arr;
  },[targets]);

  // Only Active + Completed for action-focused timeline
  const actionTimeline=useMemo(
    ()=>sortedTimeline.filter((t)=>t.status==="Active"||t.status==="Completed"),
    [sortedTimeline]
  );

  const filteredTargets=useMemo(
    ()=>targets.filter((t)=>{
      if(statusFilter==="active") return t.status==="Active";
      if(statusFilter==="completed") return t.status==="Completed";
      return true;
    }),
    [targets,statusFilter]
  );

  return(
    <div className="max-w-6xl">
      <DarkSelectStyle/>

      {/* Header + inline overlay buttons */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-3xl font-bold">Targets</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={()=>setTimelineOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-sm"
          >
            <Clock className="w-4 h-4"/>
            Open inline timeline preview and take action
          </button>
          <button
            type="button"
            onClick={()=>setGuideOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 border border-emerald-500/60 text-white text-sm"
          >
            <BookOpen className="w-4 h-4"/>
            Guide, instructions &amp; process
          </button>
        </div>
      </div>

      {/* Create form */}
      <div className="glass rounded-2xl p-4 mb-6 grid md:grid-cols-3 gap-3 text-sm sm:text-base">
        <select
          className={selectCls}
          value={form.child_uid||""}
          onChange={(e)=>setForm((f)=>({...f,child_uid:e.target.value||""}))}
          title="Select child"
        >
          {children.length===0?(
            <option value=""className="bg-white text-slate-900">No children</option>
          ):(
            children.map((c)=>(
              <option key={c.child_uid}value={c.child_uid}className="bg-white text-slate-900">
                {c.first_name}{c.last_name?` ${c.last_name}`:""} {typeof c.age==="number"?`(age ${c.age})`:""}
              </option>
            ))
          )}
        </select>

        <input
          className={inputCls}
          placeholder="Activity title (e.g., 20 Push-ups Challenge)"
          value={form.title||""}
          onChange={(e)=>setForm((f)=>({...f,title:e.target.value}))}
        />

        <select
          className={selectCls}
          value={form.category||CATEGORIES[0]}
          onChange={(e)=>setForm((f)=>({...f,category:(e.target.value as any)||CATEGORIES[0]}))}
          title="Category"
        >
          {CATEGORIES.map((c)=>(
            <option key={c}value={c}className="bg-white text-slate-900">{c}</option>
          ))}
        </select>

        <input
          className={`${inputCls} md:col-span-2`}
          placeholder="Description (optional)"
          value={form.description||""}
          onChange={(e)=>setForm((f)=>({...f,description:e.target.value}))}
        />

        <div className="flex gap-2 flex-wrap">
          <select
            className={selectCls}
            value={form.difficulty||"Easy"}
            onChange={(e)=>setForm((f)=>({...f,difficulty:(e.target.value as any)||"Easy"}))}
            title="Difficulty"
          >
            {DIFFICULTY.map((d)=>(
              <option key={d}value={d}className="bg-white text-slate-900">{d}</option>
            ))}
          </select>

          <input
            className={inputCls}
            type="date"
            value={form.due_date||""}
            onChange={(e)=>setForm((f)=>({...f,due_date:e.target.value||null}))}
            title="Due date"
          />

          <input
            className={`${inputCls} w-28`}
            type="number"
            min={0}
            step={1}
            placeholder="Points"
            value={form.points_award??10}
            onChange={(e)=>setForm((f)=>({...f,points_award:intOrNull(e.target.value,10)}))}
            title="Points award"
          />

          <select
            className={selectCls}
            value={form.status||"Active"}
            onChange={(e)=>setForm((f)=>({...f,status:(e.target.value as any)||"Active"}))}
            title="Status"
          >
            {STATUS.map((s)=>(
              <option key={s}value={s}className="bg-white text-slate-900">{s}</option>
            ))}
          </select>
        </div>

        <button
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto border border-emerald-500/40"
          onClick={save}
          disabled={loading||!familyId}
        >
          Create
        </button>
      </div>

      {/* Status filter row */}
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {[
          {key:"all",label:"All"},
          {key:"active",label:"Active"},
          {key:"completed",label:"Completed"},
        ].map((b)=>(
          <button
            key={b.key}
            onClick={()=>setStatusFilter(b.key as StatusFilter)}
            className={`px-3 py-1 rounded-full border transition-all ${
              statusFilter===b.key
                ?"bg-white text-slate-900 border-white"
                :"bg-white/5 text-white/70 border-white/20 hover:bg-white/10"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="grid gap-3">
        {filteredTargets.map((t)=>(
          <div key={t.id}className="glass rounded-xl p-4 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0">
                <div className="font-semibold break-words">{t.title}</div>
                <div className="text-xs text-white/60 flex flex-wrap gap-x-2">
                  <span>{t.category??"—"}</span>
                  <span>· {t.difficulty||"Easy"}</span>
                  <span>· {t.points_award??10} pts</span>
                </div>
              </div>

              <div className="sm:ml-auto flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-start sm:items-center">
                <div className="flex flex-wrap gap-1 justify-end">
                  <div className={`text-xs sm:text-sm px-2 py-0.5 rounded-full border ${statusBadge(t.status)}`}>
                    {t.status}
                  </div>
                  <div className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full border ${reviewStatusBadge(t.review_status as ReviewStatus|undefined)}`}>
                    {reviewStatusLabel(t.review_status as ReviewStatus|undefined)}
                  </div>
                </div>

                {t.status==="Completed"&&(
                  <button className={buttonGhost}onClick={()=>viewCompletion(t)}>
                    View Completion
                  </button>
                )}

                <button className={buttonGhost}onClick={()=>remove(t.id)}>
                  Delete
                </button>
              </div>
            </div>

            <div className="text-xs text-white/50 mt-2 break-words flex flex-wrap items-center gap-1">
              <span>Child: {prettyChild(t.child_uid)}</span>
              {t.due_date&&(
                <span>· Due: {t.due_date}</span>
              )}
              {t.reviewed_at&&(
                <span>
                  · Reviewed {new Date(t.reviewed_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                </span>
              )}
              {t.review_status==="Approved"&&typeof t.awarded_points==="number"&&(
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[10px] text-emerald-200">
                  +{t.awarded_points} pts awarded
                </span>
              )}
            </div>

            {t.description&&(
              <div className="text-white/80 mt-2 break-words">{t.description}</div>
            )}
          </div>
        ))}
        {filteredTargets.length===0&&!loading&&(
          <div className="text-white/70">No targets match this filter.</div>
        )}
      </div>

      {/* Inline timeline overlay: Active + Completed targets with actions */}
      {timelineOpen&&(
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-white/15 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <TargetIcon className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Active &amp; completed targets – timeline &amp; actions
                  </h2>
                  <p className="text-xs text-white/60">
                    Focused, scrollable view so you can scan key missions and act without leaving this page.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={()=>setTimelineOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 max-h-[72vh] overflow-y-auto">
              {actionTimeline.length>0&&(
                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                  {[
                    {key:"all",label:"All"},
                    {key:"active",label:"Active"},
                    {key:"completed",label:"Completed"},
                  ].map((b)=>(
                    <button
                      key={b.key}
                      onClick={()=>setStatusFilter(b.key as StatusFilter)}
                      className={`px-3 py-1 rounded-full border transition-all ${
                        statusFilter===b.key
                          ?"bg-white text-slate-900 border-white"
                          :"bg-white/5 text-white/70 border-white/20 hover:bg-white/10"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}

              {actionTimeline.length===0?(
                <div className="text-center text-white/60 text-sm py-6">
                  No Active or Completed targets yet.
                </div>
              ):(
                <div className="relative pl-4">
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10"/>
                  <div className="space-y-4">
                    {actionTimeline.map((t)=>{
                      if(statusFilter==="active"&&t.status!=="Active") return null;
                      if(statusFilter==="completed"&&t.status!=="Completed") return null;

                      return(
                        <div key={t.id}className="relative pl-4">
                          <div className="absolute left-[-6px] top-2 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]"/>
                          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-white truncate">
                                  {t.title}
                                </div>
                                <div className="text-xs text-white/60 flex flex-wrap gap-2 mt-1">
                                  <span>{prettyChild(t.child_uid)}</span>
                                  {t.category&&<span>• {t.category}</span>}
                                  {t.difficulty&&<span>• {t.difficulty}</span>}
                                  {(t.created_at||t.due_date)&&(
                                    <span className="inline-flex items-center gap-1">
                                      <Calendar className="w-3 h-3"/>
                                      {new Date(t.created_at||t.due_date as string).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                                    </span>
                                  )}
                                </div>
                                {t.description&&(
                                  <div className="mt-2 text-xs text-white/70 break-words">
                                    {t.description}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 flex flex-col gap-2 items-end">
                                <div className="text-sm font-semibold text-emerald-300">
                                  {t.points_award??10} pts
                                </div>
                                <div className="flex flex-wrap gap-1 justify-end">
                                  <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${statusBadge(t.status)}`}>
                                    {t.status}
                                  </div>
                                  <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${reviewStatusBadge(t.review_status as ReviewStatus|undefined)}`}>
                                    {reviewStatusLabel(t.review_status as ReviewStatus|undefined)}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 justify-end mt-1">
                                  {t.status==="Completed"&&(
                                    <button
                                      className={buttonGhost+" text-xs"}
                                      onClick={()=>{
                                        setTimelineOpen(false);
                                        viewCompletion(t);
                                      }}
                                    >
                                      View completion
                                    </button>
                                  )}
                                  <button
                                    className={buttonGhost+" text-xs"}
                                    onClick={()=>remove(t.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guide / instructions overlay */}
      {guideOpen&&(
        <div className="fixed inset-0 z-[91] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <BookOpen className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Targets guide, instructions &amp; process
                  </h2>
                  <p className="text-xs text-white/60">
                    How to design, assign and review parent–child targets.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={()=>setGuideOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto text-sm text-white/80">
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">1. Create a target</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Select the child you want to motivate.</li>
                  <li>Give the target a clear title (e.g., “Read 20 pages”, “Math practice 3 nights”).</li>
                  <li>Pick a category and difficulty that match the skill level.</li>
                  <li>Optionally set a due date and description to define “done”.</li>
                  <li>Set the points award so children understand the reward up front.</li>
                </ol>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. Status and lifecycle</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li><span className="font-semibold">Active</span> – target is visible and in-progress for the child.</li>
                  <li><span className="font-semibold">Completed</span> – child has submitted completion and points can be awarded.</li>
                  <li><span className="font-semibold">Rejected</span> – completion is declined with feedback (no points).</li>
                  <li><span className="font-semibold">Expired</span> – due date passed without completion (optional consequence).</li>
                </ul>
                <p className="text-white/70">
                  You can adjust status manually for edge cases, but normally it flows via the child app and completion review.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. What children see</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Each active target shows title, description, due date and points.</li>
                  <li>They can upload evidence (photos, videos, audio, checklists, text notes) when they finish.</li>
                  <li>Once submitted, the target moves to your review queue and stops being editable on their side.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. Reviewing completions</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Use <span className="font-semibold">View Completion</span> on a completed target to see evidence and a full timeline.</li>
                  <li>Photos, videos and audio are signed from secure storage so they remain private.</li>
                  <li>Timeline entries show when the target was created, updated and completed, plus any parent/child notes.</li>
                </ul>
                <p className="text-white/70">
                  Approvals and rejections are handled by dedicated functions so points, history and audit trails stay in sync.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">5. Using the timeline preview</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>The inline timeline focuses on <span className="font-semibold">Active</span> and <span className="font-semibold">Completed</span> targets.</li>
                  <li>Use the status chips (All, Active, Completed) to cut long lists into manageable slices.</li>
                  <li>From the timeline, you can jump straight to <span className="font-semibold">View completion</span> or <span className="font-semibold">Delete</span> without scrolling the main page.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">6. Design intent</h3>
                <p className="text-white/80">
                  The main list stays simple and scrollable, while the timeline overlay gives you a focused “control tower”
                  for your most important targets, so you can review, tidy and act with minimal clicks.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Parent Completion Viewer */}
      {viewerOpen&&(
        <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-white/15 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold break-words">Completion – {viewerForTitle}</h2>
              <div className="flex items-center gap-2">
                <button
                  className={buttonGhost+" text-xs"}
                  onClick={()=>{
                    if(viewerChildUid&&viewerTargetId){
                      nav(`/parent/daily-activities?child=${encodeURIComponent(viewerChildUid)}&target=${encodeURIComponent(viewerTargetId)}`);
                    }else{
                      nav("/parent/daily-activities");
                    }
                  }}
                >
                  Review in Daily Review
                </button>
                <button
                  className={buttonGhost}
                  onClick={()=>{
                    setViewerOpen(false);
                    setViewer(null);
                    setViewerErr(null);
                    setReviewNote("");
                    setReviewError(null);
                    setViewerTargetId(null);
                    setViewerChildUid(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto">
              {viewerLoading&&<div className="text-white/70">Loading…</div>}
              {viewerErr&&<div className="text-red-400 break-words">{viewerErr}</div>}

              {viewer&&(
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-sm">
                      {viewer.completion_type==="quick_complete"
                        ?"Quick Complete"
                        :viewer.completion_type==="full_evidence"
                        ?"With Evidence"
                        :"Completed"}
                    </span>
                    {viewer.points_award!=null&&(
                      <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-sm">
                        +{viewer.points_award} pts
                      </span>
                    )}
                    {viewer.completed_at&&(
                      <span className="text-white/60 text-sm">
                        Completed {new Date(viewer.completed_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {viewer.note&&(
                    <div className="text-white/80 break-words">
                      <span className="text-white/50">Child note: </span>
                      {viewer.note}
                    </div>
                  )}

                  {/* Review panel – Approve / Reject (locked once decided) */}
                  <div className="border border-white/15 rounded-xl p-3 bg-white/5 space-y-2">
                    {viewerAlreadyDecided?(
                      <div className="space-y-2">
                        <div className="text-xs text-white/70">
                          This completion has already been{" "}
                          <span className="font-semibold">
                            {viewerDecision==="Approved"?"approved and awarded":"rejected"}
                          </span>{" "}
                          by a grown-up, so you can&apos;t change it from here.
                        </div>
                        {viewerDecision==="Approved"&&typeof viewerTarget?.awarded_points==="number"&&(
                          <div className="text-xs text-emerald-300">
                            Awarded: {viewerTarget.awarded_points} pts
                          </div>
                        )}
                      </div>
                    ):(
                      <>
                        <div className="text-xs text-white/70">
                          Record your decision here. Approving will update this child&apos;s wallet with this target&apos;s points;
                          rejecting keeps the history but gives no points.
                        </div>
                        <textarea
                          className="w-full rounded-lg bg-slate-800 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/40"
                          rows={2}
                          placeholder="Optional note for your child (e.g. what they did well, or what to improve)…"
                          value={reviewNote}
                          onChange={(e)=>setReviewNote(e.target.value)}
                        />
                        {reviewError&&(
                          <div className="text-xs text-rose-400">{reviewError}</div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={approveCompletion}
                            disabled={reviewWorking||viewerLoading}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <CheckCircle2 className="w-4 h-4"/>
                            <span>Approve &amp; award points</span>
                          </button>
                          <button
                            type="button"
                            onClick={rejectCompletion}
                            disabled={reviewWorking||viewerLoading}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <XCircle className="w-4 h-4"/>
                            <span>Reject</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Evidence</h3>
                    {viewer.evidence.length===0?(
                      <div className="text-white/60">No evidence submitted.</div>
                    ):(
                      <div className="grid gap-2">
                        {viewer.evidence.map((ev)=>(
                          <div key={ev.id}className="p-3 rounded bg-white/5 border border-white/10">
                            <div className="text-sm text-white/70 mb-2">
                              {ev.type.toUpperCase()} {ev.created_at?`· ${new Date(ev.created_at).toLocaleString()}`:""}
                            </div>

                            {ev.type==="text"&&(
                              <div className="whitespace-pre-wrap break-words">{String(ev.data??"")}</div>
                            )}

                            {ev.type==="checklist"&&Array.isArray(ev.data)&&(
                              <ul className="list-disc pl-5 space-y-1">
                                {(ev.data as any[]).map((line,i)=>(
                                  <li key={i}className="break-words">{String(line)}</li>
                                ))}
                              </ul>
                            )}

                            {(ev.type==="photo"||ev.type==="video"||ev.type==="audio")&&typeof ev.data==="string"&&(()=>{
                              const raw=ev.data.trim().replace(/^"+|"+$/g,"");
                              const isUrl=/^(https?:\/\/|data:)/i.test(raw);

                              return(
                                <>
                                  {/\.(mp4|webm|mov|m4v)$/i.test(raw)?(
                                    <video src={raw}controls className="w-full rounded-lg border border-white/10"/>
                                  ):/\.(mp3|wav|ogg|m4a)$/i.test(raw)?(
                                    <audio src={raw}controls className="w-full"/>
                                  ):(
                                    <img src={raw}alt="evidence"className="w-full rounded-lg border border-white/10"/>
                                  )}

                                  {isUrl&&(
                                    <div className="mt-1">
                                      <a
                                        className="text-emerald-400 underline break-words"
                                        href={raw}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Open original
                                      </a>
                                    </div>
                                  )}
                                </>
                              );
                            })()}

                            {ev.description&&(
                              <div className="text-white/60 text-sm mt-1 break-words">{ev.description}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Timeline</h3>
                    {viewer.events.length===0?(
                      <div className="text-white/60">No timeline events.</div>
                    ):(
                      <div className="grid gap-2">
                        {viewer.events.map((e)=>(
                          <div key={e.id}className="p-3 rounded bg-white/5 border border-white/10">
                            <div className="text-white/80">
                              <span className="font-semibold">{e.type}</span>{" "}
                              <span className="text-white/50">· {new Date(e.created_at).toLocaleString()}</span>
                            </div>
                            {e.note&&<div className="text-white/70 break-words">{e.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
