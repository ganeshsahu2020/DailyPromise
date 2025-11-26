import {useEffect,useState,useMemo}from "react";
import {useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {getPointsBalance}from "@/utils/points";
import {tpromise}from "@/utils/tpromise";
import {notify}from "@/utils/notify";
import {
  CheckCircle,
  XCircle,
  Star,
  Trophy,
  Zap,
  Sparkles,
  Sun,
  Moon,
  Utensils,
  BookOpen,
  Heart,
  Shirt,
  Brush,
  Bed,
  Clock,
  Calendar,
  Target,
}from "lucide-react";

type ActivityItem={
  id:string;
  title:string;
  description:string;
  category:string;
  points:number;
  icon:string;
  time_of_day:"morning"|"afternoon"|"evening";
};

type ActivitySubmission={
  id?:string;
  child_uid:string;
  activity_date:string;
  completed_activities:string[];
  total_points:number;
  status:"pending"|"approved"|"rejected";
  submitted_at:string;
  reviewed_at?:string;
};

type ChildProfile={
  id:string;
  child_uid:string;
  first_name:string;
  nick_name:string|null;
};

const DAILY_ACTIVITIES:ActivityItem[]=[
  // Morning
  {id:"wake_up_early",title:"Wake Up Early",description:"Wake up by 7:00 AM with a smile! 😊",category:"morning_routine",points:10,icon:"sun",time_of_day:"morning"},
  {id:"make_bed",title:"Make Your Bed",description:"Start your day by making your bed neat and tidy 🛏️",category:"responsibility",points:15,icon:"bed",time_of_day:"morning"},
  {id:"brush_teeth",title:"Brush Teeth",description:"Brush your teeth for 2 minutes to keep them shiny! 🦷",category:"hygiene",points:10,icon:"brush",time_of_day:"morning"},
  {id:"healthy_breakfast",title:"Eat Healthy Breakfast",description:"Fuel your body with a nutritious breakfast 🍎",category:"health",points:15,icon:"utensils",time_of_day:"morning"},
  {id:"get_dressed",title:"Get Dressed Independently",description:"Choose and put on your clothes all by yourself! 👕",category:"independence",points:10,icon:"shirt",time_of_day:"morning"},
  // Afternoon
  {id:"school_work",title:"Complete School Work",description:"Finish your homework or school assignments 📚",category:"learning",points:20,icon:"book",time_of_day:"afternoon"},
  {id:"reading_time",title:"15 Minutes of Reading",description:"Read a book for at least 15 minutes 📖",category:"learning",points:15,icon:"book-open",time_of_day:"afternoon"},
  {id:"outdoor_play",title:"Outdoor Play Time",description:"Play outside for at least 30 minutes 🌳",category:"physical",points:15,icon:"sparkles",time_of_day:"afternoon"},
  {id:"healthy_lunch",title:"Eat Healthy Lunch",description:"Enjoy a balanced lunch with veggies 🥗",category:"health",points:10,icon:"utensils",time_of_day:"afternoon"},
  // Evening
  {id:"help_dinner",title:"Help with Dinner",description:"Help set the table or prepare dinner 🍽️",category:"responsibility",points:15,icon:"heart",time_of_day:"evening"},
  {id:"evening_hygiene",title:"Evening Hygiene",description:"Brush teeth and take a bath/shower 🛁",category:"hygiene",points:15,icon:"brush",time_of_day:"evening"},
  {id:"pack_bag",title:"Pack School Bag",description:"Prepare your school bag for tomorrow 🎒",category:"responsibility",points:10,icon:"sparkles",time_of_day:"evening"},
  {id:"bed_on_time",title:"Bedtime on Time",description:"Go to bed by 8:30 PM for good rest 😴",category:"health",points:15,icon:"moon",time_of_day:"evening"},
];

const getActivityIcon=(iconName:string)=>{
  const iconProps={className:"w-5 h-5"};
  switch(iconName){
    case "sun":return <Sun {...iconProps}/>;
    case "moon":return <Moon {...iconProps}/>;
    case "utensils":return <Utensils {...iconProps}/>;
    case "book":return <BookOpen {...iconProps}/>;
    case "book-open":return <BookOpen {...iconProps}/>;
    case "heart":return <Heart {...iconProps}/>;
    case "shirt":return <Shirt {...iconProps}/>;
    case "brush":return <Brush {...iconProps}/>;
    case "bed":return <Bed {...iconProps}/>;
    case "sparkles":return <Sparkles {...iconProps}/>;
    default:return <Star {...iconProps}/>;
  }
};

const getTimeOfDayIcon=(time:string)=>{
  const iconProps={className:"w-4 h-4"};
  switch(time){
    case "morning":return <Sun {...iconProps}/>;
    case "afternoon":return <Clock {...iconProps}/>;
    case "evening":return <Moon {...iconProps}/>;
    default:return <Clock {...iconProps}/>;
  }
};

export default function DailyActivity(){
  const navigate=useNavigate();
  const [childProfile,setChildProfile]=useState<ChildProfile|null>(null);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [completedActivities,setCompletedActivities]=useState<Set<string>>(new Set());
  const [todaySubmission,setTodaySubmission]=useState<ActivitySubmission|null>(null);
  const [showSuccess,setShowSuccess]=useState(false);
  const [streak,setStreak]=useState(0);

  // Live points balance chip
  const [balance,setBalance]=useState<number>(0);

  // Lifetime daily totals (all time for this child, in points)
  const [lifetimeDailyTotals,setLifetimeDailyTotals]=useState<{total:number;approved:number;pending:number}>({
    total:0,
    approved:0,
    pending:0
  });

  // Can edit unless today's submission is APPROVED
  const canEdit=useMemo(
    ()=>!todaySubmission||todaySubmission.status!=="approved",
    [todaySubmission]
  );

  useEffect(()=>{
    loadChildProfileAndData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Realtime approvals + balance changes (+ heads-up toasts)
  useEffect(()=>{
    const childUid=
      sessionStorage.getItem("child_uid")||
      localStorage.getItem("child_portal_child_id");
    if(!childUid)return;

    // Approvals/updates on today's submission
    const subA=supabase
      .channel(`das-${childUid}`)
      .on(
        "postgres_changes",
        {
          event:"UPDATE",
          schema:"public",
          table:"daily_activity_submissions",
          filter:`child_uid=eq.${childUid}`,
        },
        (payload)=>{
          const row=payload.new as any;
          const today=new Date().toISOString().slice(0,10);
          if(row.activity_date===today){
            setTodaySubmission(row);
            // refresh streak, balance and lifetime totals when updated
            loadStreakData(childUid);
            refreshBalance(childUid);
            loadLifetimeDailyTotals(childUid);
            if(row.status==="approved"){
              notify.success(`Approved! +${row.total_points} points added 🎉`);
            }else if(row.status==="rejected"){
              notify.warn("Submission was rejected.");
            }
            setShowSuccess(true);
            setTimeout(()=>setShowSuccess(false),4000);
          }
        }
      )
      .subscribe();

    // Ledger inserts → refresh live balance (with heads-up)
    const subB=supabase
      .channel(`pl-${childUid}`)
      .on(
        "postgres_changes",
        {
          event:"INSERT",
          schema:"public",
          table:"points_ledger",
          filter:`child_uid=eq.${childUid}`,
        },
        (payload)=>{
          const delta=Number(payload?.new?.delta??0);
          if(delta>0)notify.success(`+${delta} points added! 🥳`);
          else if(delta<0)notify.warn(`${Math.abs(delta)} points spent.`);
          refreshBalance(childUid);
        }
      )
      .subscribe();

    return ()=>{
      supabase.removeChannel(subA);
      supabase.removeChannel(subB);
    };
  },[]);

  const loadChildProfileAndData=async ()=>{
    try{
      setLoading(true);
      const childUid=
        sessionStorage.getItem("child_uid")||
        localStorage.getItem("child_portal_child_id");

      if(!childUid){
        navigate("/child/login");
        return;
      }

      // Load child profile
      const {data:profileData,error:profileError}=await supabase.rpc(
        "child_portal_get_profile",
        {_key:childUid}
      );
      if(!profileError&&profileData){
        const profile=(Array.isArray(profileData)?profileData[0]:profileData)as ChildProfile;
        setChildProfile(profile);
      }

      // Today (UTC-safe) to match DATE column
      const today=new Date().toISOString().slice(0,10);

      // Check existing submission for today
      const {data:submissionData}=await supabase
        .from("daily_activity_submissions")
        .select("*")
        .eq("child_uid",childUid)
        .eq("activity_date",today)
        .maybeSingle();

      if(submissionData){
        setTodaySubmission(submissionData as ActivitySubmission);
        setCompletedActivities(new Set(submissionData.completed_activities||[]));
      }else{
        setTodaySubmission(null);
        setCompletedActivities(new Set());
      }

      // Streak + Balance + Lifetime daily totals
      await Promise.all([
        loadStreakData(childUid),
        refreshBalance(childUid),
        loadLifetimeDailyTotals(childUid)
      ]);
    }catch(err){
      console.error("Error loading daily activity data:",err);
      notify.error(err,"Load failed");
    }finally{
      setLoading(false);
    }
  };

  const refreshBalance=async (childUid:string)=>{
    setBalance(await getPointsBalance(childUid));
  };

  const loadStreakData=async (childUid:string)=>{
    try{
      // Prefer RPC if present
      const {data,error}=await supabase.rpc("get_child_streak",{_child_uid:childUid});
      if(!error&&data!==null){
        setStreak(data);
        return;
      }

      // Fallback: manual
      const {data:submissions}=await supabase
        .from("daily_activity_submissions")
        .select("activity_date,status")
        .eq("child_uid",childUid)
        .eq("status","approved")
        .order("activity_date",{ascending:false});

      if(submissions&&submissions.length>0){
        let streakCount=0;
        let currentDate=new Date();
        for(let i=0;i<submissions.length;i++){
          const subDate=new Date(submissions[i].activity_date);
          const diffTime=Math.abs(currentDate.getTime()-subDate.getTime());
          const diffDays=Math.ceil(diffTime/(1000*60*60*24));
          if(diffDays===streakCount+1){
            streakCount++;
            currentDate=subDate;
          }else{
            break;
          }
        }
        setStreak(streakCount);
      }else{
        setStreak(0);
      }
    }catch(err){
      console.error("Error loading streak:",err);
      setStreak(0);
    }
  };

  // 🔢 Lifetime daily totals from DB (all submissions for this child)
  const loadLifetimeDailyTotals=async (childUid:string)=>{
    try{
      const {data,error}=await supabase
        .from("daily_activity_submissions")
        .select("total_points,status")
        .eq("child_uid",childUid);

      if(error)throw error;

      let total=0;
      let approved=0;
      let pending=0;

      (data||[]).forEach((row:any)=>{
        const pts=Number(row.total_points||0);
        total+=pts;
        if(row.status==="approved")approved+=pts;
        else if(row.status==="pending")pending+=pts;
      });

      setLifetimeDailyTotals({total,approved,pending});
    }catch(e){
      console.warn("[DailyActivity] failed to load lifetime totals",e);
      setLifetimeDailyTotals({total:0,approved:0,pending:0});
    }
  };

  const toggleActivity=(activityId:string)=>{
    if(!canEdit)return;
    setCompletedActivities((prev)=>{
      const next=new Set(prev);
      next.has(activityId)?next.delete(activityId):next.add(activityId);
      return next;
    });
  };

  // ---- ROLL-UPS (normalized) ----
  const totals=useMemo(()=>{
    const totalPoints=DAILY_ACTIVITIES.reduce((sum,a)=>{
      if(!completedActivities.has(a.id))return sum;
      const n=Number.isFinite(a.points)?Number(a.points):0;
      return sum+n;
    },0 as number);

    const totalCompletions=completedActivities.size;
    const withEvidenceCount=0;
    const quickCount=0;

    const completionPercentage=
      DAILY_ACTIVITIES.length>0
        ?Math.round((totalCompletions/DAILY_ACTIVITIES.length)*100)
        :0;

    return {totalPoints,totalCompletions,withEvidenceCount,quickCount,completionPercentage};
  },[completedActivities]);

  const submitDailyActivities=async ()=>{
    if(!childProfile||submitting)return;

    try{
      setSubmitting(true);
      const today=new Date().toISOString().slice(0,10);

      const submissionData={
        child_uid:childProfile.child_uid,
        activity_date:today,
        completed_activities:Array.from(completedActivities),
        total_points:totals.totalPoints,
        status:"pending",
        submitted_at:new Date().toISOString(),
      };

      // ✅ Wrap in tpromise (toasts + sounds)
      const {data,error}=await tpromise(
        supabase
          .from("daily_activity_submissions")
          .upsert(submissionData,{onConflict:"child_uid,activity_date"})
          .select()
          .maybeSingle(),
        {
          loading:"Saving your daily adventure...",
          success:()=> "Saved! A parent will review it soon ✨",
          error:(e)=>`Save failed: ${e?.message??"try again"}`,
        }
      );

      if(error)throw error;

      setTodaySubmission((data??null)as ActivitySubmission|null);
      setShowSuccess(true);
      setTimeout(()=>setShowSuccess(false),5000);

      // Recompute streak and lifetime totals (in case of auto-approve in tests)
      await Promise.all([
        loadStreakData(childProfile.child_uid),
        loadLifetimeDailyTotals(childProfile.child_uid)
      ]);
    }catch(err:any){
      console.error("Error submitting daily activities:",err);
      // tpromise already showed an error toast/sound; no extra alert
    }finally{
      setSubmitting(false);
    }
  };

  const getActivitiesByTimeOfDay=(t:"morning"|"afternoon"|"evening")=>
    DAILY_ACTIVITIES.filter((a)=>a.time_of_day===t);

  const getTimeOfDayColor=(time:string)=>{
    switch(time){
      case "morning":return "from-yellow-500 to-orange-500";
      case "afternoon":return "from-blue-500 to-cyan-500";
      case "evening":return "from-purple-500 to-indigo-500";
      default:return "from-gray-500 to-slate-500";
    }
  };

  const getTimeOfDayLabel=(time:string)=>{
    switch(time){
      case "morning":return "Morning ☀️";
      case "afternoon":return "Afternoon 🌤️";
      case "evening":return "Evening 🌙";
      default:return time;
    }
  };

  if(loading){
    return (
      <div className="text-white/70 text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
        Loading your daily adventure...
      </div>
    );
  }

  const childName=childProfile?.nick_name||childProfile?.first_name||"Super Star";
  const todayPretty=new Date().toLocaleDateString("en-US",{
    weekday:"long",
    year:"numeric",
    month:"long",
    day:"numeric",
  });

  return (
    <div className="space-y-6">
      {/* Success toast */}
      {showSuccess&&(
        <div className="glass-premium rounded-2xl p-6 border border-emerald-400/30 bg-emerald-500/10 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-emerald-500/20">
              <Trophy className="w-6 h-6 text-emerald-300"/>
            </div>
            <div>
              <h3 className="text-lg font-bold text-emerald-200">Awesome Job! 🎉</h3>
              <p className="text-emerald-100/80 text-sm">
                {todaySubmission?.status==="pending"
                  ?"Your daily adventure was saved. A parent will review it soon!"
                  :"You've earned points today! 🎯"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-yellow-200 to-orange-200 bg-clip-text text-transparent">
            Daily Adventure Checklist 🌟
          </h1>
          <p className="text-white/70 mt-1">Complete your daily tasks and earn amazing rewards!</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-white/60">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4"/>
              {todayPretty}
            </div>
            {streak>0&&(
              <div className="flex items-center gap-1">
                <Zap className="w-4 h-4 text-yellow-400"/>
                {streak} day streak! 🔥
              </div>
            )}
          </div>
        </div>

        {/* Summary chips */}
        <div className="grid grid-cols-4 gap-3">
          <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
            <div className="text-lg font-bold text-emerald-300">{totals.totalCompletions}</div>
            <div className="text-white/60 text-xs">Completed</div>
          </div>
          <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
            <div className="text-lg font-bold text-yellow-300">
              +{totals.totalPoints}
              <span className="text-white/50 text-[10px] align-middle"> pts</span>
            </div>
            <div className="text-white/60 text-xs">Points Today</div>
          </div>
          <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
            <div className="text-lg font-bold text-blue-300">{totals.completionPercentage}%</div>
            <div className="text-white/60 text-xs">Progress</div>
          </div>
          <div className="glass-premium rounded-2xl p-3 text-center border border-white/20">
            <div className="text-lg font-bold text-amber-300">{balance}</div>
            <div className="text-white/60 text-xs">My Points</div>
          </div>
        </div>
      </div>

      {/* NEW: Lifetime daily totals row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-premium rounded-xl px-3 py-2 border border-white/15 flex items-center justify-between text-xs text-white/80">
          <span>Total Daily pts</span>
          <span className="font-semibold text-yellow-300">{lifetimeDailyTotals.total}</span>
        </div>
        <div className="glass-premium rounded-xl px-3 py-2 border border-emerald-500/30 flex items-center justify-between text-xs text-white/80">
          <span>Approved pts</span>
          <span className="font-semibold text-emerald-300">{lifetimeDailyTotals.approved}</span>
        </div>
        <div className="glass-premium rounded-xl px-3 py-2 border border-amber-500/30 flex items-center justify-between text-xs text-white/80">
          <span>Pending approval</span>
          <span className="font-semibold text-amber-300">{lifetimeDailyTotals.pending}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="glass-premium rounded-2xl p-4 border border-white/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/80 text-sm">Your Daily Progress</span>
          <span className="text-white/60 text-sm">{totals.completionPercentage}% Complete</span>
        </div>
        <div className="w-full bg-white/20 rounded-full h-3">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-1000 ease-out"
            style={{width:`${totals.completionPercentage}%`}}
          />
        </div>
        <div className="flex justify-between text-xs text-white/50 mt-2">
          <span>Keep going!</span>
          <span>
            {totals.totalCompletions} of {DAILY_ACTIVITIES.length} tasks
          </span>
        </div>
      </div>

      {/* Activity sections */}
      <div className="space-y-6">
        {(["morning","afternoon","evening"]as const).map((timeOfDay)=>(
          <div key={timeOfDay} className="glass-premium rounded-2xl p-5 border border-white/20">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-xl bg-gradient-to-r ${getTimeOfDayColor(timeOfDay)}`}>
                {getTimeOfDayIcon(timeOfDay)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{getTimeOfDayLabel(timeOfDay)}</h2>
                <p className="text-white/60 text-sm">Complete these {timeOfDay} activities</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {getActivitiesByTimeOfDay(timeOfDay).map((activity)=>{
                const isCompleted=completedActivities.has(activity.id);
                return (
                  <div
                    key={activity.id}
                    className={`p-4 rounded-2xl border-2 transition-all duration-300 ${
                      canEdit?"cursor-pointer hover-lift":"cursor-not-allowed opacity-75"
                    } ${
                      isCompleted
                        ?"border-emerald-500/50 bg-emerald-500/10"
                        :"border-white/20 bg-white/5 hover:border-white/30"
                    }`}
                    onClick={()=>canEdit&&toggleActivity(activity.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          isCompleted?"bg-emerald-500/20 text-emerald-300":"bg-white/10 text-white/60"
                        }`}
                      >
                        {getActivityIcon(activity.icon)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-semibold ${isCompleted?"text-emerald-200":"text-white"}`}>
                            {activity.title}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-300">
                            +{Number(activity.points||0)} pts
                          </span>
                        </div>
                        <p className="text-white/70 text-sm mb-2">{activity.description}</p>
                      </div>

                      <div
                        className={`p-1 rounded-full ${
                          isCompleted?"bg-emerald-500 text-white":"bg-white/10 text-white/30"
                        }`}
                      >
                        {isCompleted?(
                          <CheckCircle className="w-5 h-5"/>
                        ):(
                          <div className="w-5 h-5 rounded-full border-2 border-white/30"/>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Submission Section */}
      <div className="glass-premium rounded-2xl p-6 border border-white/20 text-center">
        {/* PENDING */}
        {todaySubmission&&todaySubmission.status==="pending"&&(
          <div className="space-y-4">
            <div className="text-4xl">📝</div>
            <h3 className="text-xl font-bold text-white">Submission Saved (Pending Review)</h3>
            <p className="text-white/70">
              You’ve selected {totals.totalCompletions} activities and earned{" "}
              <span className="text-yellow-300 font-semibold">+{totals.totalPoints} pts</span> today.
              You can still make changes before it’s approved.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={submitDailyActivities}
                disabled={submitting}
                className={`px-8 py-4 rounded-2xl font-bold text-white shadow-lg transition-all duration-300 flex items-center gap-2 hover-lift ${
                  submitting
                    ?"bg-white/10 text-white/50 cursor-not-allowed"
                    :"bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500"
                }`}
              >
                {submitting?(
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"/>
                    Saving...
                  </>
                ):(
                  <>
                    <Sparkles className="w-5 h-5"/>
                    Update Submission
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* APPROVED */}
        {todaySubmission&&todaySubmission.status==="approved"&&(
          <div className="space-y-3">
            <div className="text-4xl">🎉</div>
            <h3 className="text-xl font-bold text-white">Daily Adventure Approved!</h3>
            <p className="text-white/70">
              You earned <span className="text-yellow-300 font-semibold">{todaySubmission.total_points} points</span> today!
            </p>
            <div className="text-sm text-white/50">Status: <span className="text-emerald-300">Approved</span></div>
            <button
              onClick={()=>navigate("/child")}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold transition-all duration-300 inline-flex items-center gap-2 hover-lift"
            >
              <Target className="w-5 h-5"/>
              Back to Targets
            </button>
          </div>
        )}

        {/* NO submission yet */}
        {!todaySubmission&&(
          <div className="space-y-4">
            <div className="text-4xl">✨</div>
            <h3 className="text-xl font-bold text-white">Ready to Submit Your Day?</h3>
            <p className="text-white/70">
              You’ve completed {totals.totalCompletions} activities and earned +{totals.totalPoints} pts today!
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={submitDailyActivities}
                disabled={submitting||totals.totalCompletions===0}
                className={`px-8 py-4 rounded-2xl font-bold text-white shadow-lg transition-all duration-300 flex items-center gap-2 hover-lift ${
                  submitting||totals.totalCompletions===0
                    ?"bg-white/10 text-white/50 cursor-not-allowed"
                    :"bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500"
                }`}
              >
                {submitting?(
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"/>
                    Submitting...
                  </>
                ):(
                  <>
                    <Sparkles className="w-5 h-5"/>
                    Submit Daily Adventure!
                  </>
                )}
              </button>

              {totals.totalCompletions===0&&(
                <p className="text-amber-300 text-sm">Complete at least one activity to submit your day!</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="glass-premium rounded-2xl p-6 border border-white/20 bg-gradient-to-br from-purple-500/10 to-pink-500/10 text-center">
        <div className="text-4xl mb-3">🌟</div>
        <h4 className="font-bold text-white mb-2">You're Doing Amazing, {childName}!</h4>
        <p className="text-white/80 text-sm">
          Every task you complete helps you grow stronger and smarter. Keep up the great work! 🚀
        </p>
      </div>
    </div>
  );
}
