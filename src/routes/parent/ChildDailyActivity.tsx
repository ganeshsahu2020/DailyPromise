import {useEffect,useState}from "react";
import {supabase}from "@/lib/supabase";
import {tpromise}from "@/utils/toastx";
import {notify}from "@/utils/notify";
import {
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  User,
  Sun,
  Moon,
  BookOpen,
  Utensils,
  Shirt,
  Brush,
  Bed,
  Heart,
  Sparkles,
  Filter,
  RefreshCw,
}from "lucide-react";

type ActivitySubmission={
  id:string;
  child_uid:string;
  activity_date:string;
  completed_activities:string[];
  total_points:number;
  status:"pending"|"approved"|"rejected";
  submitted_at:string;
  reviewed_at?:string;
  notes?:string;
  child_name?:string;
  child_nick_name?:string|null;
};

type ActivityItem={
  id:string;
  title:string;
  description:string;
  category:string;
  points:number;
  icon:string;
  time_of_day:"morning"|"afternoon"|"evening";
};

const DAILY_ACTIVITIES:ActivityItem[]=[
  {id:"wake_up_early",title:"Wake Up Early",description:"Wake up by 7:00 AM with a smile! 😊",category:"morning_routine",points:10,icon:"sun",time_of_day:"morning"},
  {id:"make_bed",title:"Make Your Bed",description:"Start your day neat and tidy 🛏️",category:"responsibility",points:15,icon:"bed",time_of_day:"morning"},
  {id:"brush_teeth",title:"Brush Teeth",description:"Brush for 2 minutes 🦷",category:"hygiene",points:10,icon:"brush",time_of_day:"morning"},
  {id:"healthy_breakfast",title:"Eat Healthy Breakfast",description:"Fuel up 🍎",category:"health",points:15,icon:"utensils",time_of_day:"morning"},
  {id:"get_dressed",title:"Get Dressed",description:"Choose and dress 👕",category:"independence",points:10,icon:"shirt",time_of_day:"morning"},
  {id:"school_work",title:"Complete School Work",description:"Finish assignments 📚",category:"learning",points:20,icon:"book",time_of_day:"afternoon"},
  {id:"reading_time",title:"15 Minutes of Reading",description:"Read a book 📖",category:"learning",points:15,icon:"book-open",time_of_day:"afternoon"},
  {id:"outdoor_play",title:"Outdoor Play Time",description:"Play 30+ minutes 🌳",category:"physical",points:15,icon:"sparkles",time_of_day:"afternoon"},
  {id:"healthy_lunch",title:"Eat Healthy Lunch",description:"Balanced lunch 🥗",category:"health",points:10,icon:"utensils",time_of_day:"afternoon"},
  {id:"help_dinner",title:"Help with Dinner",description:"Set table / help 🍽️",category:"responsibility",points:15,icon:"heart",time_of_day:"evening"},
  {id:"evening_hygiene",title:"Evening Hygiene",description:"Brush & bath 🛁",category:"hygiene",points:15,icon:"brush",time_of_day:"evening"},
  {id:"pack_bag",title:"Pack School Bag",description:"Prep for tomorrow 🎒",category:"responsibility",points:10,icon:"sparkles",time_of_day:"evening"},
  {id:"bed_on_time",title:"Bedtime on Time",description:"Sleep by 8:30 😴",category:"health",points:15,icon:"moon",time_of_day:"evening"},
];

const getActivityIcon=(name:string)=>{
  const p={className:"w-4 h-4"};
  switch(name){
    case "sun": return <Sun {...p}/>;
    case "moon": return <Moon {...p}/>;
    case "utensils": return <Utensils {...p}/>;
    case "book": return <BookOpen {...p}/>;
    case "book-open": return <BookOpen {...p}/>;
    case "heart": return <Heart {...p}/>;
    case "shirt": return <Shirt {...p}/>;
    case "brush": return <Brush {...p}/>;
    case "bed": return <Bed {...p}/>;
    case "sparkles": return <Sparkles {...p}/>;
    default: return <Sparkles {...p}/>;
  }
};

const getTimeOfDayIcon=(t:string)=>{
  const p={className:"w-3 h-3"};
  switch(t){
    case "morning": return <Sun {...p}/>;
    case "afternoon": return <Clock {...p}/>;
    case "evening": return <Moon {...p}/>;
    default: return <Clock {...p}/>;
  }
};

const getStatusColor=(s:string)=>
  s==="approved"?"text-emerald-400 bg-emerald-500/20 border-emerald-400/30":
  s==="rejected"?"text-rose-400 bg-rose-500/20 border-rose-400/30":
  s==="pending" ?"text-amber-400 bg-amber-500/20 border-amber-400/30":
                 "text-gray-400 bg-gray-500/20 border-gray-400/30";

const getStatusIcon=(s:string)=>
  s==="approved"?<CheckCircle className="w-4 h-4"/>:
  s==="rejected"?<XCircle className="w-4 h-4"/>:
                 <Clock className="w-4 h-4"/>;

export default function DailyActivity(){
  const [submissions,setSubmissions]=useState<ActivitySubmission[]>([]);
  const [loading,setLoading]=useState(true);
  const [updating,setUpdating]=useState<string|null>(null);
  const [filter,setFilter]=useState<"all"|"pending"|"approved"|"rejected">("all");
  const [dateRange,setDateRange]=useState<"today"|"week"|"month"|"all">("week");

  const [reviewerId,setReviewerId]=useState<string|null>(null);
  const [allowedChildIds,setAllowedChildIds]=useState<string[]|null>(null);

  const [timelineOpen,setTimelineOpen]=useState(false);
  const [guideOpen,setGuideOpen]=useState(false);

  // 🔐 Resolve parent → family → children
  useEffect(()=>{
    async function initParentAndChildren(){
      try{
        const {data,error}=await supabase.auth.getUser();
        if(error)throw error;
        const uid=data?.user?.id??null;
        setReviewerId(uid);
        if(!uid){
          setAllowedChildIds([]);
          return;
        }

        // Parent profile (family_id)
        const {data:parentProfile}=await supabase
          .from("parent_profiles")
          .select("parent_uid,family_id")
          .eq("parent_uid",uid)
          .maybeSingle();

        const familyId=parentProfile?.family_id||null;

        let childIds:string[]=[];
        if(familyId){
          // Children in same family OR explicitly created by this parent
          const {data:children}=await supabase
            .from("child_profiles")
            .select("child_uid,family_id,created_by")
            .or(`family_id.eq.${familyId},created_by.eq.${uid}`);
          if(children){
            childIds=(children as any[])
              .map((c)=>c.child_uid)
              .filter(Boolean);
          }
        }else{
          // Fallback: any children created by this parent
          const {data:children}=await supabase
            .from("child_profiles")
            .select("child_uid,created_by")
            .eq("created_by",uid);
          if(children){
            childIds=(children as any[])
              .map((c)=>c.child_uid)
              .filter(Boolean);
          }
        }

        setAllowedChildIds(Array.from(new Set(childIds)));
      }catch(e){
        console.error("[DailyActivity] initParentAndChildren error:",e);
        setAllowedChildIds([]);
      }
    }

    void initParentAndChildren();
  },[]);

  useEffect(()=>{
    if(!allowedChildIds)return;
    void loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dateRange,allowedChildIds]);

  async function applyDateFilters(q:any){
    const now=new Date();
    switch(dateRange){
      case "today":{
        const today=new Date().toISOString().slice(0,10);
        return q.eq("activity_date",today);
      }
      case "week":{
        const d=new Date(now); d.setDate(now.getDate()-7);
        const weekAgo=d.toISOString().slice(0,10);
        return q.gte("activity_date",weekAgo);
      }
      case "month":{
        const d=new Date(now); d.setMonth(now.getMonth()-1);
        const monthAgo=d.toISOString().slice(0,10);
        return q.gte("activity_date",monthAgo);
      }
      default: return q;
    }
  }

  async function loadSubmissions(){
    try{
      setLoading(true);

      const childFilter=(allowedChildIds??[]).filter(Boolean);
      if(!childFilter.length){
        setSubmissions([]);
        return;
      }

      // Preferred: view with child + name details
      let q=supabase
        .from("vw_daily_activity_submissions")
        .select("*")
        .in("child_uid",childFilter as any)
        .order("submitted_at",{ascending:false});
      q=await applyDateFilters(q);
      const {data:viaView,error:viewErr,status}=await q;

      if(!viewErr&&(viaView??[]).length>=0&&status!==406){
        setSubmissions((viaView as any[]) as ActivitySubmission[]);
        return;
      }

      // Fallback manual join
      let base=supabase
        .from("daily_activity_submissions")
        .select("*")
        .in("child_uid",childFilter as any)
        .order("submitted_at",{ascending:false});
      base=await applyDateFilters(base);
      const {data:rows,error:baseErr}=await base;
      if(baseErr)throw baseErr;

      const list=rows??[];
      const uids=Array.from(new Set(list.map((r:any)=>r.child_uid).filter(Boolean)));

      let byChild:Record<string,{first_name?:string;nick_name?:string|null}>={};
      if(uids.length){
        const {data:kids}=await supabase
          .from("child_profiles")
          .select("child_uid,first_name,nick_name")
          .in("child_uid",uids as any);
        if(kids){
          byChild=Object.fromEntries(
            (kids as any[]).map((k)=>[
              k.child_uid,
              {first_name:k.first_name,nick_name:k.nick_name??null},
            ])
          );
        }
      }

      const mapped:ActivitySubmission[]=(list as any[]).map((sub)=>{
        const kid=byChild[sub.child_uid]||{};
        return{
          ...sub,
          child_name:(kid.first_name as string)??"Unknown Child",
          child_nick_name:(kid.nick_name as string|null)??null,
        };
      });

      setSubmissions(mapped);
    }catch(e){
      console.error("[DailyActivity] loadSubmissions error:",e);
      notify.error(e,"Failed to load submissions");
    }finally{
      setLoading(false);
    }
  }

  async function updateSubmissionStatus(id:string,status:"approved"|"rejected"){
    try{
      setUpdating(id);

      if(status==="approved"){
        const {error}=await tpromise(
          supabase.rpc("approve_daily_submission",{p_submission_id:id,p_reviewer_id:reviewerId??null}),
          {
            loading:"Approving and awarding points...",
            success:()=>"Checklist approved and points awarded 🎉",
            error:(e)=>e?.message??"Approval failed",
          }
        );
        if(error)throw error;
      }else{
        const {error}=await tpromise(
          supabase
            .from("daily_activity_submissions")
            .update({status,reviewed_at:new Date().toISOString()})
            .eq("id",id),
          {
            loading:"Rejecting submission...",
            success:()=>"Submission rejected",
            error:(e)=>e?.message??"Reject failed",
          }
        );
        if(error)throw error;
      }

      await loadSubmissions();
    }catch(e:any){
      console.error("Error updating submission status:",e);
    }finally{
      setUpdating(null);
    }
  }

  const filtered=
    filter==="all"
      ?submissions
      :submissions.filter((s)=>s.status===filter);

  const getPct=(s:ActivitySubmission)=>Math.round(
    ((s.completed_activities?.length??0)/DAILY_ACTIVITIES.length)*100
  );

  if(loading||allowedChildIds===null){
    return(
      <div className="space-y-6">
        <div className="text-white/70 text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          Loading daily activity submissions...
        </div>
      </div>
    );
  }

  return(
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Daily Activity Submissions 📝</h1>
          <p className="text-white/70 mt-1">
            Review and approve your children's daily activity checklists
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-end">
          <button
            onClick={()=>setTimelineOpen(true)}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-2"
          >
            <Calendar className="w-4 h-4"/> Open inline timeline preview
          </button>
          <button
            onClick={()=>setGuideOpen(true)}
            className="px-4 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white transition-colors flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4"/> Guide, instructions &amp; process
          </button>
          <button
            onClick={loadSubmissions}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4"/> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-premium rounded-2xl p-4 border border-white/20">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-white/60"/>
            <span className="text-white/80 text-sm">Filter by:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              {value:"all" as const,label:"All Submissions",color:"bg-gray-500/20"},
              {value:"pending" as const,label:"Pending",color:"bg-amber-500/20"},
              {value:"approved" as const,label:"Approved",color:"bg-emerald-500/20"},
              {value:"rejected" as const,label:"Rejected",color:"bg-rose-500/20"},
            ].map(({value,label,color})=>(
              <button
                key={value}
                onClick={()=>setFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filter===value
                    ?`${color} text-white border border-white/20`
                    :"bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-white/80 text-sm">Date Range:</span>
            <select
              value={dateRange}
              onChange={(e)=>setDateRange(e.target.value as any)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/20 text-white text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent"
            >
              <option value="today" className="bg-gray-800">Today</option>
              <option value="week" className="bg-gray-800">This Week</option>
              <option value="month" className="bg-gray-800">This Month</option>
              <option value="all" className="bg-gray-800">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {filtered.length===0?(
          <div className="glass-premium rounded-2xl p-8 text-center border border-white/20">
            <div className="text-4xl mb-3">📝</div>
            <h3 className="text-xl font-bold text-white mb-2">No Submissions Found</h3>
            <p className="text-white/70">
              {filter==="all"
                ?"No daily activity submissions found for the selected period."
                :`No ${filter} submissions found.`}
            </p>
          </div>
        ):(
          filtered.map((submission)=>(
            <div key={submission.id} className="glass-premium rounded-2xl p-6 border border-white/20">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
                    <User className="w-5 h-5 text-purple-300"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {submission.child_nick_name||submission.child_name}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-white/60">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4"/>
                        {new Date(submission.activity_date).toLocaleDateString(
                          "en-US",
                          {weekday:"long",year:"numeric",month:"long",day:"numeric"}
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4"/>
                        {new Date(submission.submitted_at).toLocaleTimeString(
                          "en-US",
                          {hour:"2-digit",minute:"2-digit"}
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border flex items-center gap-2 ${getStatusColor(submission.status)}`}
                  >
                    {getStatusIcon(submission.status)}
                    {submission.status.charAt(0).toUpperCase()+submission.status.slice(1)}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-yellow-300">{submission.total_points}</div>
                    <div className="text-white/60 text-sm">points</div>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-white/70 mb-2">
                  <span>
                    Completed {submission.completed_activities.length} of {DAILY_ACTIVITIES.length} activities
                  </span>
                  <span>{getPct(submission)}% Complete</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-1000"
                    style={{width:`${getPct(submission)}%`}}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {(["morning","afternoon","evening"] as const).map((t)=>{
                  const done=new Set(submission.completed_activities);
                  const timeActs=DAILY_ACTIVITIES
                    .filter((a)=>a.time_of_day===t)
                    .map((a)=>({...a,completed:done.has(a.id)}));
                  const completedCount=timeActs.filter((a)=>a.completed).length;
                  return(
                    <div key={t} className="bg-white/5 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        {getTimeOfDayIcon(t)}
                        <span className="text-white font-medium text-sm capitalize">{t}</span>
                        <span className="text-white/60 text-xs ml-auto">
                          {completedCount}/{timeActs.length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {timeActs.map((a)=>(
                          <div
                            key={a.id}
                            className={`flex items-center gap-2 p-1 rounded text-xs ${
                              a.completed
                                ?"text-emerald-300 bg-emerald-500/10"
                                :"text-white/50"
                            }`}
                          >
                            {getActivityIcon(a.icon)}
                            <span className="flex-1 truncate">{a.title}</span>
                            {a.completed&&<CheckCircle className="w-3 h-3 text-emerald-400"/>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {submission.status==="pending"&&(
                <div className="flex gap-3 pt-4 border-t border-white/10">
                  <button
                    onClick={()=>updateSubmissionStatus(submission.id,"approved")}
                    disabled={updating===submission.id}
                    className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {updating===submission.id?(
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>
                    ):(
                      <CheckCircle className="w-4 h-4"/>
                    )}
                    Approve &amp; Award {submission.total_points} Points
                  </button>
                  <button
                    onClick={()=>updateSubmissionStatus(submission.id,"rejected")}
                    disabled={updating===submission.id}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4"/> Reject
                  </button>
                </div>
              )}

              {submission.reviewed_at&&(
                <div className="text-xs text-white/50 pt-3 border-t border-white/10">
                  Reviewed on {new Date(submission.reviewed_at).toLocaleString()}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Inline timeline overlay */}
      {timelineOpen&&(
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <Calendar className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Daily activity timeline preview
                  </h2>
                  <p className="text-xs text-white/60">
                    Focused view of submissions in the current filter and date range.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
                onClick={()=>setTimelineOpen(false)}
              >
                <XCircle className="w-4 h-4"/> Close
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {filtered.length===0?(
                <div className="text-center text-white/60 text-sm py-6">
                  Nothing to show for this filter and date range.
                </div>
              ):(
                <div className="relative pl-4">
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10"/>
                  <div className="space-y-4">
                    {filtered
                      .slice()
                      .sort(
                        (a,b)=>new Date(b.submitted_at).getTime()-
                          new Date(a.submitted_at).getTime()
                      )
                      .map((s)=>(
                        <div key={s.id} className="relative pl-4">
                          <div className="absolute left-[-6px] top-2 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]"/>
                          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white">
                                  {s.child_nick_name||s.child_name||"Child"}
                                </div>
                                <div className="text-xs text-white/60 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="w-3 h-3"/>
                                    {new Date(s.activity_date).toLocaleDateString(
                                      "en-US",
                                      {month:"short",day:"numeric"}
                                    )}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3"/>
                                    {new Date(s.submitted_at).toLocaleTimeString(
                                      "en-US",
                                      {hour:"2-digit",minute:"2-digit"}
                                    )}
                                  </span>
                                  <span>• {s.completed_activities.length}/{DAILY_ACTIVITIES.length} tasks</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold text-yellow-300">
                                  {s.total_points} pts
                                </div>
                                <div
                                  className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${getStatusColor(s.status)}`}
                                >
                                  {getStatusIcon(s.status)}
                                  {s.status.charAt(0).toUpperCase()+s.status.slice(1)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 text-[11px] text-white/60">
                              Progress: {getPct(s)}% • Completed:{" "}
                              {s.completed_activities
                                .map(
                                  (id)=>DAILY_ACTIVITIES.find((a)=>a.id===id)?.title||id
                                )
                                .join(", ")}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
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
                <span className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/40">
                  <BookOpen className="w-5 h-5 text-purple-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Daily activity review guide
                  </h2>
                  <p className="text-xs text-white/60">
                    Quick reference for how points, approvals, and submissions work.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
                onClick={()=>setGuideOpen(false)}
              >
                <XCircle className="w-4 h-4"/> Close
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-sm text-white/80">
              {/* guide text unchanged */}
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">1. What the child does</h3>
                <ol className="list-decimal list-inside space-y-1 text-white/80">
                  <li>Child sees their daily checklist grouped by morning, afternoon, and evening.</li>
                  <li>They mark activities as completed throughout the day (wake up, brush, homework, etc.).</li>
                  <li>At the end of the day they submit the checklist — this creates a <span className="font-medium">daily activity submission</span>.</li>
                </ol>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. What you see here</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li>Each card represents one day for one child.</li>
                  <li>Top row shows the child name/nickname, activity date, and time of submission.</li>
                  <li>The progress bar shows how many of the configured daily activities were completed.</li>
                  <li>The yellow number on the right shows the <span className="font-medium">total points</span> they are requesting for that day.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. Status flow &amp; points</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li><span className="font-medium text-amber-300">Pending</span> – child submitted and is waiting for your decision.</li>
                  <li><span className="font-medium text-emerald-300">Approved</span> – you clicked “Approve &amp; Award” and points were added to their wallet.</li>
                  <li><span className="font-medium text-rose-300">Rejected</span> – you rejected this day (no points awarded).</li>
                </ul>
                <p className="text-white/70">
                  Approving uses the <span className="font-mono text-xs">approve_daily_submission</span> function so the checklist and ledger
                  stay in sync and audit-friendly.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. Using filters &amp; date ranges</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li><span className="font-medium">Status filter</span> (Pending, Approved, Rejected) lets you focus just on items that still need a decision.</li>
                  <li><span className="font-medium">Date range</span> (Today, This Week, This Month, All Time) limits which submissions are loaded from Supabase.</li>
                  <li>The <span className="font-medium">timeline preview</span> button gives you a compact history of the same filtered set.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">5. Suggested parenting workflow</h3>
                <ol className="list-decimal list-inside space-y-1 text-white/80">
                  <li>Once per day, open the page and set the date range to <span className="font-medium">Today</span>.</li>
                  <li>Review each pending card:
                    <ul className="list-disc list-inside ml-5 mt-1 space-y-1">
                      <li>Scan the completed activities and progress bar.</li>
                      <li>Optionally talk with the child about what they did.</li>
                      <li>Click <span className="font-medium">Approve &amp; Award</span> to grant points, or <span className="font-medium">Reject</span> if needed.</li>
                    </ul>
                  </li>
                  <li>Use the timeline preview occasionally to check consistency over the week.</li>
                </ol>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">6. Notes &amp; future tweaks</h3>
                <p className="text-white/80">
                  This module is designed to stay flexible — you can later adjust the daily activity list, point values,
                  or add comments/reasons on approvals and rejections without changing this review screen.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
