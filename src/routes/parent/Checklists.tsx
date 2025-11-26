import {useEffect,useState}from "react";
import {supabase}from "@/lib/supabase";
import {
  Plus,
  Trash2,
  Check,
  X,
  Calendar,
  ClipboardList,
  Gift,
  Users,
  Send,
  Clock,
  BookOpen,
}from "lucide-react";
import {tpromise}from "@/utils/toastx";
import {toast}from "sonner";

/* ----------------------------- Types ----------------------------- */
type Template={
  id:string;
  family_id:string|null;
  title:string;
  description:string|null;
  frequency:"Daily"|"Weekly"|"Monthly"|"Yearly"|"Once";
  reward_points:number;
  is_active:boolean;
  created_at:string;
};

type ItemDraft={title:string;description?:string;target_count?:number};

/**
 * id        = canonical child_profiles.id
 * child_uid = public child UID / legacy
 */
type Child={
  id:string;
  child_uid:string;
  family_id:string|null;
  first_name?:string|null;
  last_name?:string|null;
  nick_name?:string|null;
};

type AssignmentQueue={
  id:string;
  assignment_id:string;
  template_id:string;
  template_title:string;
  child_uid:string;
  family_id?:string|null;
  period_start:string;
  period_end:string;
  reward_points:number;
  status:"Submitted"|"Open"|"InProgress"|"Approved"|"Rejected"|"Fulfilled";
  created_at:string;
  submitted_at?:string|null;
  reviewed_at?:string|null;
  reviewer_id?:string|null;
  review_notes?:string|null;
};

type ChildNote={
  note?:string|null;
  mood?:string|null;
  location?:string|null;
  minutes?:number|null;
  created_at?:string;
};

type StatusFilter="All"|"Active"|"Completed";

/** ---- Reusable dark input/select styles ---- */
const inputCls=
  "px-3 py-2 rounded-xl bg-slate-800 text-white border border-white/20 "+
  "placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/40";

const selectCls=
  "px-3 py-2 rounded-xl bg-slate-800 text-white border border-white/20 w-full "+
  "focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/40";

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

const ACTIVE_STATUSES:AssignmentQueue["status"][]=[
  "Submitted","Open","InProgress","Approved",
];
const COMPLETED_STATUSES:AssignmentQueue["status"][]=[
  "Rejected","Fulfilled",
];

/* Helper to backfill notes from old queue/view rows */
function extractQueueNote(row:any):ChildNote|null{
  if(!row)return null;

  const meta=row.assignment_meta||row.child_note_meta||{};

  const minutesRaw=
    row.child_minutes??
    row.child_time_minutes??
    row.child_time??
    row.child_duration??
    meta.minutes??
    meta.time_minutes??
    meta.time??
    meta.duration??
    null;

  const minutesNum=
    typeof minutesRaw==="number"
      ?minutesRaw
      :Number.isFinite(Number(minutesRaw))
        ?Number(minutesRaw)
        :null;

  const noteText=
    row.child_note??
    row.child_note_text??
    row.note??
    meta.note??
    meta.child_note??
    meta.child_note_text??
    null;

  const mood=
    row.child_mood??
    row.mood??
    meta.mood??
    meta.child_mood??
    meta.feeling??
    null;

  const location=
    row.child_location??
    row.location??
    row.where??
    meta.location??
    meta.where??
    meta.place??
    null;

  const createdAt=
    row.child_note_created_at??
    row.submitted_at??
    row.created_at??
    meta.created_at??
    null;

  if(
    noteText||
    mood||
    location||
    (typeof minutesNum==="number"&&!Number.isNaN(minutesNum))
  ){
    return{
      note:noteText??null,
      mood:mood??null,
      location:location??null,
      minutes:minutesNum,
      created_at:createdAt||undefined,
    };
  }

  return null;
}

export default function ParentChecklists(){
  const [familyId,setFamilyId]=useState<string|null>(null);
  const [familyLoaded,setFamilyLoaded]=useState(false);

  const [templates,setTemplates]=useState<Template[]>([]);
  const [children,setChildren]=useState<Child[]>([]);
  const [queue,setQueue]=useState<AssignmentQueue[]>([]);
  const [loading,setLoading]=useState(true);

  // Latest child note per assignment_id
  const [notesByAssignment,setNotesByAssignment]=useState<Record<string,ChildNote>>({});

  // Builder state
  const [title,setTitle]=useState("");
  const [desc,setDesc]=useState("");
  const [frequency,setFrequency]=useState<Template["frequency"]>("Daily");
  const [rewardPoints,setRewardPoints]=useState(25);
  const [items,setItems]=useState<ItemDraft[]>([{title:"",target_count:1}]);
  const [saving,setSaving]=useState(false);

  // Assign state
  const [selTemplate,setSelTemplate]=useState<string>("");
  const [selChild,setSelChild]=useState<string>("");
  const [assigning,setAssigning]=useState(false);

  // Overlays
  const [timelineOpen,setTimelineOpen]=useState(false);
  const [guideOpen,setGuideOpen]=useState(false);

  // Filters
  const [statusFilter,setStatusFilter]=useState<StatusFilter>("Active");
  const [timelineStatusFilter,setTimelineStatusFilter]=useState<StatusFilter>("All");
  const [timelineChildFilter,setTimelineChildFilter]=useState<string>("");

  // Timeline detail drawer
  const [timelineSelected,setTimelineSelected]=useState<AssignmentQueue|null>(null);

  /* ────────────────────── 1) Resolve parent → family_id ────────────────────── */
  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        const {data:userData,error:userErr}=await supabase.auth.getUser();
        if(userErr)console.error("[ParentChecklists] getUser error",userErr);
        const uid=userData?.user?.id;
        if(!uid){
          if(active){
            console.warn("[ParentChecklists] No auth user; family scope will be empty.");
            setFamilyId(null);
          }
          return;
        }
        const {data:parent,error:parentErr}=await supabase
          .from("parent_profiles")
          .select("family_id")
          .eq("parent_uid",uid)
          .maybeSingle();
        if(parentErr)console.error("[ParentChecklists] parent_profiles error",parentErr);
        if(active){
          setFamilyId(parent?.family_id??null);
        }
      }catch(e){
        console.error("[ParentChecklists] family lookup failed",e);
        if(active)setFamilyId(null);
      }finally{
        if(active)setFamilyLoaded(true);
      }
    })();
    return()=>{active=false;};
  },[]);

  /* ────────────────────── 2) Family-scoped boot + channel ───────────────────── */
  useEffect(()=>{
    if(!familyLoaded)return;

    let mounted=true;

    async function boot(){
      if(!familyId){
        console.warn("[ParentChecklists] No family_id; showing empty lists.");
        setTemplates([]);
        setChildren([]);
        setQueue([]);
        setNotesByAssignment({});
        setLoading(false);
        return;
      }

      setLoading(true);
      await Promise.all([
        refreshTemplates(familyId),
        refreshChildren(familyId),
        refreshQueue(familyId),
      ]);
      if(mounted)setLoading(false);
    }

    boot();

    if(!familyId)return;

    const ch=supabase
      .channel("checklist-queue")
      .on(
        "postgres_changes",
        {event:"*",schema:"public",table:"checklist_assignments"},
        ()=>{
          void refreshQueue(familyId);
        }
      )
      .subscribe();

    return()=>{
      mounted=false;
      try{supabase.removeChannel(ch);}catch{}
    };
  },[familyId,familyLoaded]);

  /* ───────────────────────── Family-scoped loaders ───────────────────────── */

  async function refreshTemplates(famId:string){
    const {data,error}=await supabase
      .from("checklist_templates")
      .select("*")
      .eq("family_id",famId)
      .eq("is_active",true)
      .order("created_at",{ascending:false});
    if(error)console.error("[checklist_templates]",error);
    if(!error&&data)setTemplates(data as any);
  }

  async function refreshChildren(famId:string){
    const {data,error}=await supabase
      .from("child_profiles")
      .select("id,child_uid,family_id,first_name,last_name,nick_name")
      .eq("family_id",famId)
      .order("created_at",{ascending:false});
    if(error)console.error("[child_profiles]",error);
    if(!error&&data)setChildren(data as any);
  }

  async function refreshQueue(famId:string){
    const {data,error}=await supabase
      .from("v_checklist_review_queue")
      .select("*")
      .eq("family_id",famId)
      .order("created_at",{ascending:false});

    if(error){
      console.error("[v_checklist_review_queue]",error);
      setQueue([]);
      setNotesByAssignment({});
      return;
    }

    if(!data){
      setQueue([]);
      setNotesByAssignment({});
      return;
    }

    const rawRows=data as any[];

    const backfillNotes:Record<string,ChildNote>={};
    const rows=(rawRows).map((r)=>{

      const assignmentId=String(r.assignment_id||r.id);
      const noteFromQueue=extractQueueNote(r);
      if(noteFromQueue)backfillNotes[assignmentId]=noteFromQueue;

      return{
        id:String(r.id),
        assignment_id:assignmentId,
        template_id:String(r.template_id),
        template_title:String(r.template_title),
        child_uid:String(r.child_uid),
        family_id:r.family_id??null,
        period_start:String(r.period_start),
        period_end:String(r.period_end),
        reward_points:Number(r.reward_points||0),
        status:r.status as AssignmentQueue["status"],
        created_at:String(r.created_at),
        submitted_at:r.submitted_at||null,
        reviewed_at:r.reviewed_at||null,
        reviewer_id:r.reviewer_id||null,
        review_notes:r.review_notes||null,
      } as AssignmentQueue;
    });

    setQueue(rows);
    await loadChildNotes(rows,backfillNotes);
  }

  // 🔍 Always load latest ChildNote per assignment from events, with queue backfill as seed
  async function loadChildNotes(rows:AssignmentQueue[],seed?:Record<string,ChildNote>){
    try{
      const ids=rows
        .map((r)=>r.assignment_id||r.id)
        .filter((x)=>!!x);

      if(!ids.length){
        setNotesByAssignment(seed||{});
        return;
      }

      const {data,error}=await supabase
        .from("checklist_assignment_events")
        .select("assignment_id,meta,created_at,event_type")
        .eq("event_type","ChildNote")
        .in("assignment_id",ids)
        .order("created_at",{ascending:false});

      const byId:Record<string,ChildNote>={...(seed||{})};

      if(error){
        console.error("[checklist_assignment_events child notes]",error);
        setNotesByAssignment(byId);
        return;
      }

      if(Array.isArray(data)){
        for(const row of data as any[]){
          const aid=String(row.assignment_id);
          const meta=row.meta||{};

          const minutesRaw=
            meta.minutes??
            meta.time_minutes??
            meta.time??
            meta.duration??
            null;

          const minutesNum=
            typeof minutesRaw==="number"
              ?minutesRaw
              :Number.isFinite(Number(minutesRaw))
                ?Number(minutesRaw)
                :null;

          const noteText=
            meta.note??
            meta.child_note??
            meta.child_note_text??
            meta.story??
            null;

          const mood=
            meta.mood??
            meta.child_mood??
            meta.feeling??
            null;

          const location=
            meta.location??
            meta.where??
            meta.place??
            null;

          const createdAt=row.created_at??meta.created_at??null;

          if(
            noteText||
            mood||
            location||
            (typeof minutesNum==="number"&&!Number.isNaN(minutesNum))
          ){
            // Events override any older queue-derived note
            byId[aid]={
              note:noteText??null,
              mood:mood??null,
              location:location??null,
              minutes:minutesNum,
              created_at:createdAt||undefined,
            };
          }
        }
      }

      setNotesByAssignment(byId);
    }catch(e){
      console.error("[parent notes fetch]",e);
      setNotesByAssignment(seed||{});
    }
  }

  /* ─────────────────────────── Builder helpers ─────────────────────────── */

  function addItem(){setItems((prev)=>[...prev,{title:"",target_count:1}]);}
  function removeItem(idx:number){setItems((prev)=>prev.filter((_,i)=>i!==idx));}
  function updateItem(idx:number,patch:Partial<ItemDraft>){
    setItems((prev)=>prev.map((it,i)=>(i===idx?{...it,...patch}:it)));
  }

  async function createTemplate(){
    if(!familyId){
      toast.error("No family linked to this parent yet.");
      return;
    }

    try{
      setSaving(true);

      const clean=items
        .filter((i)=>String(i.title||"").trim().length)
        .map((i,order_index)=>({
          title:i.title.trim(),
          description:(i.description||"").trim()||null,
          target_count:Number.isFinite(i.target_count as any)?Number(i.target_count):1,
          weight:1,
          order_index,
        }));

      const p=(async()=>{
        const {error}=await supabase.rpc("create_checklist_template",{
          p_title:title.trim(),
          p_description:desc.trim()||null,
          p_frequency:frequency,
          p_reward_points:rewardPoints,
          p_items:clean,
        }as any);
        if(error)throw error;
      })();

      await tpromise(p,{
        loading:"Creating template…",
        success:"Checklist template created ✅",
        error:(e)=>e?.message||"Could not create template",
      });

      setTitle("");setDesc("");setFrequency("Daily");setRewardPoints(25);
      setItems([{title:"",target_count:1}]);
      if(familyId)await refreshTemplates(familyId);
    }catch(e:any){
      console.error("[createTemplate]",e);
    }finally{
      setSaving(false);
    }
  }

  async function assignTemplate(){
    if(!selTemplate||!selChild){
      toast.error("Pick a template and a child.");
      return;
    }

    const template=templates.find((t)=>t.id===selTemplate)||null;
    const child=children.find((c)=>c.child_uid===selChild||c.id===selChild)||null;

    if(!template||!child){
      toast.error("Could not find template or child. Please refresh and try again.");
      return;
    }

    if(template.family_id&&child.family_id&&template.family_id!==child.family_id){
      toast.error("This child is not in the same family as the checklist template. Please pick a matching child.");
      return;
    }

    try{
      setAssigning(true);

      const p=(async()=>{
        const {error}=await supabase.rpc("assign_checklist_to_child",{
          p_template_id:template.id,
          p_child_uid:child.id,
          p_anchor_date:new Date().toISOString().slice(0,10),
        }as any);
        if(error)throw error;
      })();

      await tpromise(p,{
        loading:"Assigning template…",
        success:"Checklist assigned 🎯",
        error:(e)=>e?.message||"Could not assign checklist",
      });

      if(familyId)await refreshQueue(familyId);
    }catch(e:any){
      console.error("[assignTemplate]",e);
    }finally{
      setAssigning(false);
    }
  }

  async function reviewAssignment(assignmentId:string,action:"Approve"|"Reject"){
    const notes=action==="Reject"?(prompt("Reason (optional):")||null):null;

    const p=(async()=>{
      const {error}=await supabase.rpc("parent_review_assignment",{
        p_assignment_id:assignmentId,
        p_action:action,
        p_notes:notes,
      });
      if(error)throw error;
    })();

    await tpromise(p,{
      loading:action==="Approve"?"Approving…":"Rejecting…",
      success:
        action==="Approve"
          ?"Approved ✅ — points added & completed"
          :"Rejected ❌",
      error:(e)=>e?.message||"Could not review assignment",
    });

    if(familyId)await refreshQueue(familyId);
  }

  async function fulfillAssignment(assignmentId:string){
    const p=(async()=>{
      try{
        const {error}=await supabase.rpc("parent_fulfill_assignment",{
          p_assignment_id:assignmentId,
        }as any);
        if(!error)return;
        console.warn("[parent_fulfill_assignment] error, falling back",error);
      }catch(e){
        console.warn("[parent_fulfill_assignment] exception, falling back",e);
      }

      const {error:err2}=await supabase.rpc("parent_review_assignment",{
        p_assignment_id:assignmentId,
        p_action:"Fulfill",
        p_notes:null,
      }as any);
      if(err2)throw err2;
    })();

    await tpromise(p,{
      loading:"Marking as fulfilled…",
      success:"Checklist marked as fulfilled ✅",
      error:(e)=>e?.message||"Could not mark as fulfilled",
    });

    if(familyId)await refreshQueue(familyId);
  }

  async function deleteAssignment(assignmentId:string){
    if(!confirm("Delete this checklist assignment from history? This cannot be undone."))return;

    const p=(async()=>{
      const {error}=await supabase
        .from("checklist_assignments")
        .delete()
        .eq("id",assignmentId);
      if(error)throw error;
    })();

    await tpromise(p,{
      loading:"Deleting checklist…",
      success:"Checklist deleted from history 🗑️",
      error:(e)=>e?.message||"Could not delete checklist",
    });

    if(timelineSelected&&timelineSelected.assignment_id===assignmentId){
      setTimelineSelected(null);
    }

    if(familyId)await refreshQueue(familyId);
  }

  /* ─────────────────────────── UI helpers ─────────────────────────── */

  const prettyChild=(uid:string)=>{
    const c=children.find((x)=>x.child_uid===uid||x.id===uid);
    if(!c)return uid.slice(0,8);
    return c.nick_name||c.first_name||uid.slice(0,8);
  };

  const statusBadge=(s:AssignmentQueue["status"])=>{
    let cls="bg-white/10 border-white/20 text-white/80";
    if(s==="Submitted"||s==="Open")cls="bg-sky-500/15 border-sky-500/30 text-sky-200";
    if(s==="InProgress")cls="bg-amber-500/15 border-amber-500/30 text-amber-200";
    if(s==="Approved")cls="bg-emerald-500/15 border-emerald-500/30 text-emerald-200";
    if(s==="Rejected")cls="bg-rose-500/15 border-rose-500/30 text-rose-200";
    if(s==="Fulfilled")cls="bg-indigo-500/15 border-indigo-500/30 text-indigo-200";
    return cls;
  };

  const statusLabel=(s:AssignmentQueue["status"])=>{
    switch(s){
      case "Submitted":return"Submitted • waiting for review";
      case "Open":return"Assigned • not yet submitted";
      case "InProgress":return"In progress";
      case "Approved":return"Approved • waiting to fulfill";
      case "Rejected":return"Rejected";
      case "Fulfilled":return"Fulfilled • reward delivered";
      default:return s;
    }
  };

  const selectedTemplate=templates.find((t)=>t.id===selTemplate)||null;
  const availableChildren=selectedTemplate&&selectedTemplate.family_id
    ?children.filter((c)=>c.family_id===selectedTemplate.family_id)
    :children;

  const activeQueue=queue.filter((q)=>ACTIVE_STATUSES.includes(q.status));
  const completedQueue=queue.filter((q)=>COMPLETED_STATUSES.includes(q.status));

  let displayQueue=queue;
  if(statusFilter==="Active")displayQueue=activeQueue;
  if(statusFilter==="Completed")displayQueue=completedQueue;

  const filteredTimeline=queue
    .slice()
    .filter((q)=>{
      if(timelineChildFilter&&q.child_uid!==timelineChildFilter)return false;
      if(timelineStatusFilter==="Active"&&!ACTIVE_STATUSES.includes(q.status))return false;
      if(timelineStatusFilter==="Completed"&&!COMPLETED_STATUSES.includes(q.status))return false;
      return true;
    })
    .sort((a,b)=>{
      const ta=new Date(a.submitted_at||a.created_at).getTime();
      const tb=new Date(b.submitted_at||b.created_at).getTime();
      return tb-ta;
    });

  const waitingReviewCount=activeQueue.filter((q)=>q.status==="Submitted").length;
  const openInProgressCount=activeQueue.filter((q)=>q.status==="Open"||q.status==="InProgress").length;
  const approvedAwaitingFulfillmentCount=activeQueue.filter((q)=>q.status==="Approved").length;
  const totalRewardQueued=activeQueue.reduce((s,q)=>s+(q.reward_points||0),0);
  const totalCompletedReward=completedQueue.reduce((s,q)=>s+(q.reward_points||0),0);

  const statusChipBase=
    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition";
  const statusChipActive="bg-emerald-500/20 border-emerald-400/60 text-emerald-100";
  const statusChipIdle="bg-white/5 border-white/15 text-white/70 hover:bg-white/10";

  const selectedTimelineNote=timelineSelected
    ?notesByAssignment[timelineSelected.assignment_id]
    :undefined;

  /* ───────────────────────────── Render ───────────────────────────── */

  return(
    <div className="space-y-6">
      <DarkSelectStyle/>

      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
          <ClipboardList className="w-5 h-5 text-emerald-300"/>
        </div>
        <div className="min-w-0">
          <div className="text-white font-semibold truncate">Checklists</div>
          <div className="text-xs text-white/60">Create templates, assign to children, review submissions</div>
        </div>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MAIN (Review Queue) */}
        <div className="lg:col-span-2 min-w-0">
          <div className="glass rounded-2xl p-6 border border-white/10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-6 h-6 text-yellow-300"/>
                  <div>
                    <h2 className="text-xl font-bold text-white">Submitted Checklists</h2>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-white/70">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                        <Clock className="w-3 h-3"/>
                        Waiting review: {waitingReviewCount}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                        In progress / open: {openInProgressCount}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                        Awaiting fulfilment: {approvedAwaitingFulfillmentCount}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                        Active rewards in queue: {totalRewardQueued} pts
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                        Completed rewards total: {totalCompletedReward} pts
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status filter chips */}
                <div className="flex flex-wrap gap-2 mt-1">
                  <button
                    type="button"
                    className={`${statusChipBase} ${statusFilter==="All"?statusChipActive:statusChipIdle}`}
                    onClick={()=>setStatusFilter("All")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`${statusChipBase} ${statusFilter==="Active"?statusChipActive:statusChipIdle}`}
                    onClick={()=>setStatusFilter("Active")}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`${statusChipBase} ${statusFilter==="Completed"?statusChipActive:statusChipIdle}`}
                    onClick={()=>setStatusFilter("Completed")}
                  >
                    Completed
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={()=>{
                    setTimelineOpen(true);
                    setTimelineSelected(null);
                    setTimelineStatusFilter("All");
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
                >
                  <Clock className="w-4 h-4"/>
                  Open inline timeline preview
                </button>
                <button
                  onClick={()=>setGuideOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm"
                >
                  <BookOpen className="w-4 h-4"/>
                  Guide, instructions &amp; process
                </button>
              </div>
            </div>

            {loading?(
              <div className="text-white/70">Loading…</div>
            ):displayQueue.length===0?(
              <div className="text-white/70">
                {statusFilter==="Completed"
                  ?"No completed checklists yet."
                  :statusFilter==="Active"
                    ?"No active checklists right now."
                    :"No checklists yet."}
              </div>
            ):(
              <div className="grid md:grid-cols-2 gap-4">
                {displayQueue.map((q)=>{
                  const note=notesByAssignment[q.assignment_id];
                  const submittedAt=q.submitted_at||q.created_at;
                  const canReview=q.status==="Submitted"||q.status==="Open"||q.status==="InProgress";
                  const canFulfill=q.status==="Approved";
                  const isCompleted=COMPLETED_STATUSES.includes(q.status);

                  const hasAnyNoteField=note&&(
                    (note.note&&note.note.trim().length>0)||
                    (note.mood&&note.mood.trim().length>0)||
                    (note.location&&note.location.trim().length>0)||
                    (typeof note.minutes==="number"&&!Number.isNaN(note.minutes))
                  );

                  return(
                    <div key={q.id}className="p-4 rounded-2xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-white font-semibold min-w-0 truncate">{q.template_title}</div>
                        <div className="text-xs text-white/60 shrink-0 text-right">
                          {new Date(q.period_start).toLocaleDateString()} –{" "}
                          {new Date(q.period_end).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="text-white/70 text-sm mt-1 break-words">
                        Child: <span className="text-white">{prettyChild(q.child_uid)}</span>
                      </div>
                      <div className="text-white/70 text-sm">
                        Reward: <span className="text-emerald-300 font-semibold">{q.reward_points} pts</span>
                      </div>
                      {submittedAt&&(
                        <div className="text-white/60 text-xs mt-0.5">
                          Submitted at: {new Date(submittedAt).toLocaleString()}
                        </div>
                      )}

                      {note&&hasAnyNoteField&&(
                        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/40 p-3">
                          <div className="text-xs uppercase tracking-wide text-white/60 mb-1">
                            Child’s note
                          </div>
                          <div className="space-y-2 text-xs text-white/80">
                            {/* What did you do? */}
                            <div>
                              <div className="text-[11px] text-white/60 mb-0.5">
                                What did you do? ✨
                              </div>
                              <div className="text-white/90 whitespace-pre-wrap">
                                {note.note&&note.note.trim().length
                                  ?note.note
                                  :<span className="text-white/40 italic">Not shared</span>}
                              </div>
                            </div>

                            {/* Mood / Where / Time / Added */}
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                                Mood:{" "}
                                {note.mood&&note.mood.trim().length
                                  ?note.mood
                                  :<span className="text-white/40 italic">Not shared</span>}
                              </span>
                              <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                                Where:{" "}
                                {note.location&&note.location.trim().length
                                  ?note.location
                                  :<span className="text-white/40 italic">Not shared</span>}
                              </span>
                              <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                                Time spent:{" "}
                                {typeof note.minutes==="number"&&!Number.isNaN(note.minutes)
                                  ?`${note.minutes} min`
                                  :<span className="text-white/40 italic">Not shared</span>}
                              </span>
                              {note.created_at&&(
                                <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                                  Added: {new Date(note.created_at).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] border ${statusBadge(q.status)}`}>
                          {statusLabel(q.status)}
                        </span>
                        <div className="flex flex-wrap gap-2 justify-end">
                          {canFulfill&&(
                            <button
                              onClick={()=>fulfillAssignment(q.assignment_id)}
                              className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-600 hover:from-indigo-400 hover:to-emerald-500 text-white inline-flex items-center gap-2"
                            >
                              <Check className="w-4 h-4"/> Mark fulfilled
                            </button>
                          )}
                          {!canFulfill&&!isCompleted&&(
                            <>
                              <button
                                onClick={()=>canReview&&reviewAssignment(q.assignment_id,"Reject")}
                                disabled={!canReview}
                                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <X className="w-4 h-4"/> Reject
                              </button>
                              <button
                                onClick={()=>canReview&&reviewAssignment(q.assignment_id,"Approve")}
                                disabled={!canReview}
                                className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Check className="w-4 h-4"/> Approve
                              </button>
                            </>
                          )}
                          {isCompleted&&(
                            <button
                              type="button"
                              onClick={()=>deleteAssignment(q.assignment_id)}
                              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-red-600/80 border border-red-500/40 text-xs text-red-100 inline-flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4"/> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ASIDE (Builder + Assign) */}
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-4 h-fit">
          {/* Builder */}
          <div className="glass rounded-2xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="w-6 h-6 text-emerald-300"/>
              <h2 className="text-lg font-bold text-white">Create Template</h2>
            </div>

            <div className="space-y-4">
              <input
                className={`w-full ${inputCls}`}
                placeholder="Template title (e.g., Morning Routine)"
                value={title}
                onChange={(e)=>setTitle(e.target.value)}
              />
              <textarea
                className={`w-full ${inputCls}`}
                placeholder="Short description"
                value={desc}
                onChange={(e)=>setDesc(e.target.value)}
              />
              <div className="flex flex-wrap gap-3 items-center">
                <select
                  className={selectCls}
                  value={frequency}
                  onChange={(e)=>setFrequency(e.target.value as any)}
                >
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Yearly">Yearly</option>
                  <option value="Once">Once</option>
                </select>
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-yellow-300"/>
                  <input
                    type="number"
                    min={0}
                    className={`w-28 ${inputCls}`}
                    value={rewardPoints}
                    onChange={(e)=>setRewardPoints(parseInt(e.target.value||"0",10))}
                    placeholder="Points"
                  />
                  <span className="text-white/60 text-sm">pts</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-white/80">Items</div>
                {items.map((it,idx)=>(
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center"
                  >
                    <input
                      className={inputCls}
                      placeholder={`Item ${idx+1} title`}
                      value={it.title}
                      onChange={(e)=>updateItem(idx,{title:e.target.value})}
                    />
                    <input
                      type="number"
                      min={1}
                      className={`w-full sm:w-24 ${inputCls}`}
                      value={it.target_count??1}
                      onChange={(e)=>updateItem(idx,{target_count:parseInt(e.target.value||"1",10)})}
                      title="Target count"
                    />
                    <button
                      onClick={()=>removeItem(idx)}
                      className="p-2 rounded-xl bg-red-600/80 hover:bg-red-600 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4 text-white"/>
                    </button>
                    <input
                      className={`w-full sm:col-span-3 ${inputCls} text-white/80`}
                      placeholder="(Optional) item description"
                      value={it.description||""}
                      onChange={(e)=>updateItem(idx,{description:e.target.value})}
                    />
                  </div>
                ))}
                <button
                  onClick={addItem}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
                >
                  <Plus className="w-4 h-4"/> Add Item
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={createTemplate}
                  disabled={
                    saving||
                    !title.trim()||
                    items.filter((i)=>i.title.trim()).length===0
                  }
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold"
                >
                  {saving?"Saving…":"Create Template"}
                </button>
              </div>
            </div>
          </div>

          {/* Assign */}
          <div className="glass rounded-2xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-6 h-6 text-sky-300"/>
              <h2 className="text-lg font-bold text-white">Assign To Child</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                className={`flex-1 min-w-[12rem] ${selectCls}`}
                value={selTemplate}
                onChange={(e)=>setSelTemplate(e.target.value)}
              >
                <option value="">Select Template</option>
                {templates.map((t)=>(
                  <option key={t.id}value={t.id}>
                    {t.title} • {t.frequency} • {t.reward_points} pts
                  </option>
                ))}
              </select>
              <select
                className={`flex-1 min-w-[10rem] ${selectCls}`}
                value={selChild}
                onChange={(e)=>setSelChild(e.target.value)}
              >
                <option value="">
                  {selectedTemplate&&selectedTemplate.family_id
                    ?"Select Child (same family)"
                    :"Select Child"}
                </option>
                {availableChildren.map((c)=>(
                  <option key={c.id}value={c.child_uid||c.id}>
                    {c.nick_name||c.first_name||c.id.slice(0,8)}
                  </option>
                ))}
              </select>
              <button
                onClick={assignTemplate}
                disabled={!selTemplate||!selChild||assigning}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              >
                <Send className="w-4 h-4"/> {assigning?"Assigning…":"Assign"}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-white/80 text-sm">
              💡 Tip: Approving a submission awards the checklist’s points. Once you&apos;ve delivered the reward, mark it as{" "}
              <span className="font-semibold">Fulfilled</span> so the status flow stays in sync.
            </div>
          </div>
        </aside>
      </div>

      {/* Inline timeline overlay */}
      {timelineOpen&&(
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <Calendar className="w-5 h-5 text-emerald-300"/>
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-white truncate">
                    Checklist timeline preview
                  </h2>
                  <p className="text-xs text-white/60">
                    Focused history of active and completed checklists, with filters and quick actions.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col gap-1 mr-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-white/60"/>
                    <select
                      className="px-2 py-1 rounded-lg bg-slate-800 text-xs text-white border border-white/20 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                      value={timelineChildFilter}
                      onChange={(e)=>setTimelineChildFilter(e.target.value)}
                    >
                      <option value="">All children</option>
                      {children.map((c)=>(
                        <option key={c.child_uid||c.id}value={c.child_uid||c.id}>
                          {c.nick_name||c.first_name||(c.child_uid||c.id).slice(0,8)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={`${statusChipBase} ${timelineStatusFilter==="All"?statusChipActive:statusChipIdle}`}
                      onClick={()=>setTimelineStatusFilter("All")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`${statusChipBase} ${timelineStatusFilter==="Active"?statusChipActive:statusChipIdle}`}
                      onClick={()=>setTimelineStatusFilter("Active")}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      className={`${statusChipBase} ${timelineStatusFilter==="Completed"?statusChipActive:statusChipIdle}`}
                      onClick={()=>setTimelineStatusFilter("Completed")}
                    >
                      Completed
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
                  onClick={()=>{
                    setTimelineOpen(false);
                    setTimelineSelected(null);
                  }}
                >
                  <X className="w-4 h-4"/> Close
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row">
              {/* Timeline list */}
              <div className="p-4 max-h-[70vh] overflow-y-auto md:w-2/3 border-r border-white/10">
                {filteredTimeline.length===0?(
                  <div className="text-center text-white/60 text-sm py-6">
                    Nothing to show yet for this selection.
                  </div>
                ):(
                  <div className="relative pl-4">
                    <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10"/>
                    <div className="space-y-4">
                      {filteredTimeline.map((q)=>(
                        <div key={q.id}className="relative pl-4">
                          <div className="absolute left-[-6px] top-2 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]"/>
                          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-white truncate">
                                  {q.template_title}
                                </div>
                                <div className="text-xs text-white/60 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="w-3 h-3"/>
                                    {prettyChild(q.child_uid)}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="w-3 h-3"/>
                                    {new Date(q.period_start).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                                    {" – "}
                                    {new Date(q.period_end).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3"/>
                                    {new Date(q.submitted_at||q.created_at).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-semibold text-emerald-300">
                                  {q.reward_points} pts
                                </div>
                                <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${statusBadge(q.status)}`}>
                                  {statusLabel(q.status)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 justify-end">
                              <button
                                type="button"
                                onClick={()=>setTimelineSelected(q)}
                                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white inline-flex items-center gap-1"
                              >
                                <ClipboardList className="w-3 h-3"/> View completion
                              </button>
                              {COMPLETED_STATUSES.includes(q.status)&&(
                                <button
                                  type="button"
                                  onClick={()=>deleteAssignment(q.assignment_id)}
                                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-600/80 border border-red-500/40 text-xs text-red-100 inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3"/> Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline detail / completion drawer */}
              <div className="md:w-1/3 p-4 max-h-[70vh] overflow-y-auto bg-slate-950/40">
                {timelineSelected?(
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        {timelineSelected.template_title}
                      </h3>
                      <button
                        type="button"
                        onClick={()=>setTimelineSelected(null)}
                        className="text-xs text-white/60 hover:text-white flex items-center gap-1"
                      >
                        <X className="w-3 h-3"/> Clear
                      </button>
                    </div>
                    <div className="text-xs text-white/60">
                      Child: <span className="text-white">{prettyChild(timelineSelected.child_uid)}</span>
                    </div>
                    <div className="text-xs text-white/60">
                      Window:{" "}
                      {new Date(timelineSelected.period_start).toLocaleDateString()} –{" "}
                      {new Date(timelineSelected.period_end).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-white/60">
                      Reward: <span className="text-emerald-300 font-semibold">{timelineSelected.reward_points} pts</span>
                    </div>
                    <div className="text-xs text-white/60">
                      Status:{" "}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${statusBadge(timelineSelected.status)}`}>
                        {statusLabel(timelineSelected.status)}
                      </span>
                    </div>
                    {timelineSelected.submitted_at&&(
                      <div className="text-xs text-white/60">
                        Submitted: {new Date(timelineSelected.submitted_at).toLocaleString()}
                      </div>
                    )}
                    {timelineSelected.reviewed_at&&(
                      <div className="text-xs text-white/60">
                        Reviewed: {new Date(timelineSelected.reviewed_at).toLocaleString()}
                      </div>
                    )}
                    {timelineSelected.review_notes&&(
                      <div className="mt-2 text-xs text-white/80">
                        <div className="font-semibold mb-1">Parent review notes</div>
                        <div className="bg-white/5 border border-white/10 rounded-lg p-2 whitespace-pre-wrap">
                          {timelineSelected.review_notes}
                        </div>
                      </div>
                    )}
                    {selectedTimelineNote&&(
                      <div className="mt-2 text-xs text-white/80">
                        <div className="font-semibold mb-1">Child’s note</div>
                        <div className="bg-white/5 border border-white/10 rounded-lg p-2 space-y-2">
                          <div>
                            <div className="text-[11px] text-white/60 mb-0.5">
                              What did you do? ✨
                            </div>
                            <div className="text-white/90 whitespace-pre-wrap">
                              {selectedTimelineNote.note&&selectedTimelineNote.note.trim().length
                                ?selectedTimelineNote.note
                                :<span className="text-white/40 italic">Not shared</span>}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10">
                              Mood:{" "}
                              {selectedTimelineNote.mood&&selectedTimelineNote.mood.trim().length
                                ?selectedTimelineNote.mood
                                :<span className="text-white/40 italic">Not shared</span>}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10">
                              Where:{" "}
                              {selectedTimelineNote.location&&selectedTimelineNote.location.trim().length
                                ?selectedTimelineNote.location
                                :<span className="text-white/40 italic">Not shared</span>}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10">
                              Time spent:{" "}
                              {typeof selectedTimelineNote.minutes==="number"&&!Number.isNaN(selectedTimelineNote.minutes)
                                ?`${selectedTimelineNote.minutes} min`
                                :<span className="text-white/40 italic">Not shared</span>}
                            </span>
                          </div>
                          {selectedTimelineNote.created_at&&(
                            <div className="text-[11px] text-white/60 mt-1">
                              Added: {new Date(selectedTimelineNote.created_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {COMPLETED_STATUSES.includes(timelineSelected.status)&&(
                      <div className="pt-2 border-t border-white/10 mt-2">
                        <button
                          type="button"
                          onClick={()=>deleteAssignment(timelineSelected.assignment_id)}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs"
                        >
                          <Trash2 className="w-4 h-4"/> Delete from history
                        </button>
                      </div>
                    )}
                  </div>
                ):(
                  <div className="h-full flex items-center justify-center text-xs text-white/60 text-center px-4">
                    Select a checklist in the timeline to see completion details, child notes, and review history here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guide / instructions overlay */}
      {guideOpen&&(
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <BookOpen className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Checklist guide, instructions &amp; process
                  </h2>
                  <p className="text-xs text-white/60">
                    Quick reference for templates, assignments, and parent review.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
                onClick={()=>setGuideOpen(false)}
              >
                <X className="w-4 h-4"/> Close
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-sm text-white/80">
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">1. Build a template</h3>
                <ol className="list-decimal list-inside space-y-1 text-white/80">
                  <li>Give your routine a name (e.g., Morning Routine, Homework Block).</li>
                  <li>Pick a frequency (Daily, Weekly, etc.) and total reward points.</li>
                  <li>Add items: each item is a step the child will tick off. Target count is how many times they should do it in that period.</li>
                  <li>Optionally add a short description under each item to clarify expectations.</li>
                </ol>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. Assign to a child</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li>Select a template and a child, then click <span className="font-medium">Assign</span>.</li>
                  <li>The system creates an assignment window (period start/end) and shows it in the “Submitted Checklists” area once the child sends it back.</li>
                  <li>You can assign the same template to multiple children; each gets their own independent progress and reward.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. What the child sees</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li>Children see your items as a checklist with counts and progress.</li>
                  <li>They complete items over the period and then submit the checklist for review.</li>
                  <li>They can optionally attach a note, mood, location or minutes spent — surfaced here as “Child’s note”.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. Parent review &amp; status flow</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li><span className="font-medium">Submitted/Open</span> – waiting for you to decide.</li>
                  <li><span className="font-medium">InProgress</span> – optional mid-way state if you enable partial checks.</li>
                  <li><span className="font-medium text-emerald-300">Approved</span> – points are awarded to the child’s wallet and the checklist is accepted.</li>
                  <li><span className="font-medium text-indigo-300">Fulfilled</span> – once you physically give the reward (or connect to another reward flow), mark it fulfilled so the loop is complete.</li>
                  <li><span className="font-medium text-rose-300">Rejected</span> – no points; history is kept for transparency.</li>
                </ul>
                <p className="text-white/70">
                  Approving uses <span className="font-mono text-xs">parent_review_assignment</span>, and fulfillment uses{" "}
                  <span className="font-mono text-xs">parent_fulfill_assignment</span> (or a "Fulfill" action) so the checklist,
                  events, and wallet stay in sync and audit-friendly.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">5. Using the timeline preview</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li>The timeline shows submissions ordered by submission time.</li>
                  <li>Use the child and status filters in the header to focus on a single child, only active items, or completed history.</li>
                  <li>Each entry displays template title, child, schedule window and reward points, with quick actions for viewing and cleanup.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">6. Future tweaks</h3>
                <p className="text-white/80">
                  This screen stays stable even if you later add filters, more frequencies, or richer child notes.
                  The overlays are inline, so you don&apos;t leave the page while reviewing.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
