import {useEffect,useRef,useState}from "react";
import {supabase}from "@/lib/supabase";
import {signAvatarPath}from "@/lib/storage";
import {toast}from "sonner";
import {fetchChildBrief}from "@/utils/childAuth";
import {
  Star,
  Trophy,
  Target,
  Zap,
  Gift,
  Calendar,
  Users,
  Award,
  Sparkles,
}from "lucide-react";

/* ------------------------------- Types ------------------------------------- */
type RpcRow={
  id:string;
  child_uid:string;
  family_id:string;
  parent_uid:string|null;
  created_by:string|null;
  first_name:string;
  last_name:string|null;
  nick_name:string|null;
  age:number|null;
  birthday:string|null;
  avatar_path:string|null;
  created_at:string;

  parent_first?:string|null;
  parent_last?:string|null;
  family_name?:string|null;

  avatar_url?:string|null;
  child_pass_hash?:string|null;
};

type ChildProfile=RpcRow&{
  avatar_signed_url?:string|null;
  parent_name?:string|null;
};

type UnifiedWallet={
  child_uid:string;
  earned_points:number;
  spent_points:number;
  reserved_points:number;
  available_points:number;
  balance_points:number;
  rewards_total:number;
};

/* ----------------------- Helpers ------------------------------------------ */
const avatarPlaceholder=
  `data:image/svg+xml;utf8,`+
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#0ea5e9'/>
        <stop offset='100%' stop-color='#10b981'/>
      </linearGradient>
    </defs>
    <circle cx='48' cy='48' r='48' fill='#111827'/>
    <circle cx='48' cy='36' r='16' fill='url(#g)'/>
    <rect x='20' y='58' width='56' height='22' rx='11' fill='url(#g)'/>
  </svg>`
  );

function nz(n:number){
  const v=Number.isFinite(n)?n:0;
  return Object.is(v,-0)?0:Math.max(0,v);
}

async function fetchUnifiedWallet(childId:string):Promise<UnifiedWallet|null>{
  if(!childId)return null;
  const {data,error}=await supabase.rpc("api_wallet_child_unified",{p_child:childId});
  if(error){
    console.warn("[api_wallet_child_unified] error:",error);
    return null;
  }
  const row=Array.isArray(data)?data[0]:null;
  if(!row)return null;

  return {
    child_uid:String(row.child_uid??childId),
    earned_points:Number(row.earned_points??0),
    spent_points:Number(row.spent_points??0),
    reserved_points:Number(row.reserved_points??0),
    available_points:Number(row.available_points??0),
    balance_points:Number(
      row.balance_points??(
        Number(row.available_points??0)+Number(row.reserved_points??0)
      )
    ),
    rewards_total:Number(row.rewards_total??row.earned_points??0),
  };
}

/* -------------------------------- Component -------------------------------- */
export default function ChildProfilePage(){
  const [profile,setProfile]=useState<ChildProfile|null>(null);
  const [loading,setLoading]=useState(true);
  const [busyFix,setBusyFix]=useState(false);
  const ran=useRef(false);

  const [achievementCount,setAchievementCount]=useState(0);
  const [uw,setUW]=useState<UnifiedWallet|null>(null);
  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);

  // ---------- Bootstrap: use fetchChildBrief + unified wallet ----------
  useEffect(()=>{
    if(ran.current)return;
    ran.current=true;

    (async()=>{
      try{
        setLoading(true);

        // 1) Resolve child via fetchChildBrief (handles hint/session/LS + self-heal)
        const brief=await fetchChildBrief();
        if(!brief){
          setProfile(null);
          setUW(null);
          return;
        }

        const cid=brief.id;
        const uid=brief.child_uid;

        // 2) Load full profile via child_portal_get_profile (try id → child_uid)
        let childProfile:RpcRow|null=null;

        try{
          const {data:rows1,error:err1}=await supabase.rpc("child_portal_get_profile",{_key:cid});
          if(err1){
            console.warn("[child_portal_get_profile] by id error",err1);
          }else{
            const row=Array.isArray(rows1)?rows1[0]:rows1;
            if(row)childProfile=row as RpcRow;
          }
        }catch(e){
          console.warn("[child_portal_get_profile] by id failed",e);
        }

        if(!childProfile&&uid&&uid!==cid){
          try{
            const {data:rows2,error:err2}=await supabase.rpc("child_portal_get_profile",{_key:uid});
            if(err2){
              console.warn("[child_portal_get_profile] by child_uid error",err2);
            }else{
              const row=Array.isArray(rows2)?rows2[0]:rows2;
              if(row)childProfile=row as RpcRow;
            }
          }catch(e){
            console.warn("[child_portal_get_profile] by child_uid failed",e);
          }
        }

        if(!childProfile){
          console.warn("[ChildProfile] no profile rows for",cid,uid);
          setProfile(null);
          setUW(null);
          return;
        }

        let avatar_signed_url:string|null=null;
        const p=childProfile.avatar_path||null;
        if(p&&!p.startsWith("parents/")){
          avatar_signed_url=await signAvatarPath(p,60*60*24*7);
        }

        const parent_name=
          [childProfile.parent_first,childProfile.parent_last]
            .filter(Boolean)
            .join(" ")||null;

        const fullProfile:ChildProfile={...childProfile,avatar_signed_url,parent_name};
        setProfile(fullProfile);

        // fun fake achievements
        setAchievementCount(Math.floor(Math.random()*15)+5);

        // 3) Unified wallet using same id/uid pattern as layout
        try{
          const idForWallet=cid||uid;
          const snap=await fetchUnifiedWallet(String(idForWallet));
          setUW(snap);
        }catch{
          setUW(null);
        }
      }catch(e){
        console.error("[ChildProfile bootstrap]",e);
        setProfile(null);
        setUW(null);
      }finally{
        setLoading(false);
      }
    })();

    const onChange=()=>void refreshUnified();
    window.addEventListener("points-changed",onChange);
    return()=>window.removeEventListener("points-changed",onChange);
  },[]);

  // ---------- Realtime wallet updates (child_uid-based like other screens) ----------
  useEffect(()=>{
    const idForEvents=profile?.child_uid;
    if(!idForEvents)return;

    try{
      channelRef.current?.unsubscribe();
    }catch{}
    channelRef.current=null;

    const ch=supabase.channel(`child-profile:${idForEvents}`);

    const refresh=async()=>{
      try{
        const id=profile?.id||profile?.child_uid;
        if(!id)return;
        const snap=await fetchUnifiedWallet(String(id));
        setUW(snap);
      }catch{
        // keep last
      }
    };

    const bind=(table:string,event:"*"|"INSERT"|"UPDATE"|"DELETE"="*")=>{
      ch.on(
        "postgres_changes",
        {event,schema:"public",table,filter:`child_uid=eq.${idForEvents}`},
        refresh
      );
    };

    bind("points_ledger");
    bind("reward_offers");
    bind("reward_redemptions");

    ch.subscribe();
    channelRef.current=ch;

    return()=>{
      try{
        channelRef.current?.unsubscribe();
      }catch{}
      channelRef.current=null;
    };
  },[profile?.child_uid,profile?.id]);

  async function refreshUnified(){
    const id=profile?.id||profile?.child_uid;
    if(!id)return;
    try{
      const snap=await fetchUnifiedWallet(String(id));
      setUW(snap);
      toast.success("Points refreshed",{description:"Wallet is up to date ✨"});
    }catch(e){
      toast.error("Refresh failed",{description:String(e)});
    }
  }

  const available=nz(Number(uw?.available_points??0));
  const reserved=nz(Number(uw?.reserved_points??0));
  const balance=nz(Number(uw?.balance_points??(available+reserved)));
  const rewardsTotal=nz(Number(uw?.rewards_total??uw?.earned_points??0));

  if(loading){
    return(
      <div className="min-h-96 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
            <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse absolute -top-2 -right-2"/>
          </div>
          <div className="text-white/70 text-lg font-medium">Loading your awesome profile...</div>
          <div className="text-white/40 text-sm mt-2">Getting everything ready for you!</div>
        </div>
      </div>
    );
  }

  if(!profile){
    return(
      <div className="text-center py-8">
        <div className="glass rounded-3xl p-8 max-w-md mx-auto border-2 border-white/10 bg-gradient-to-br from-red-500/10 to-pink-500/10">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-red-400 to-pink-500 rounded-full flex items-center justify-center">
            <Target className="w-10 h-10 text-white"/>
          </div>
          <h2 className="text-2xl font-bold mb-4 text-red-300">Adventure Paused! 🚀</h2>
          <p className="text-white/70 mb-6">
            We couldn't find your explorer profile. Let's try again!
          </p>
          <button
            onClick={()=>window.location.reload()}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            Launch Profile Search
          </button>
        </div>
      </div>
    );
  }

  const needsFix=!!profile.avatar_path&&profile.avatar_path.startsWith("parents/");

  const memberSince=new Date(profile.created_at);
  const now=new Date();
  const monthsAsMember=
    (now.getFullYear()-memberSince.getFullYear())*12+
    (now.getMonth()-memberSince.getMonth());

  async function fixLegacyAvatar(){
    if(!profile?.avatar_path||!profile.child_uid)return;
    if(!profile.avatar_path.startsWith("parents/"))return;

    setBusyFix(true);
    try{
      const oldPath=profile.avatar_path;
      const newPath=`children/${profile.child_uid}.png`;

      const copyRes=await supabase.storage.from("avatars").copy(oldPath,newPath);
      if(copyRes.error)throw copyRes.error;

      const {error:updErr}=await supabase
        .from("child_profiles")
        .update({avatar_path:newPath})
        .eq("child_uid",profile.child_uid);
      if(updErr)throw updErr;

      const {data:rows,error}=await supabase.rpc("child_portal_get_profile",{_key:profile.child_uid});
      if(error)throw error;

      const childProfile=(Array.isArray(rows)?rows[0]:rows) as RpcRow|null;
      if(childProfile){
        let avatar_signed_url:string|null=null;
        const p=childProfile.avatar_path||null;
        if(p&&!p.startsWith("parents/")){
          avatar_signed_url=await signAvatarPath(p,60*60*24*7);
        }
        const parent_name=
          [childProfile.parent_first,childProfile.parent_last]
            .filter(Boolean)
            .join(" ")||null;

        setProfile({...childProfile,avatar_signed_url,parent_name});
      }

      toast.success("Avatar fixed! ✨");
    }catch(e:any){
      toast.error("Avatar migration failed",{description:e?.message||String(e)});
    }finally{
      setBusyFix(false);
    }
  }

  return(
    // FULL-BLEED ON MOBILE, constrained on md+
    <div className="w-full md:max-w-6xl md:mx-auto md:px-4">
      {/* Animated Header */}
      <div className="text-center mb-8 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent animate-pulse"/>
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-300 bg-clip-text text-transparent relative z-10">
          My Super Profile! 🎉
        </h1>
        <p className="text-white/60 text-lg mt-2 relative z-10">
          Welcome to your achievement headquarters, {profile.nick_name||profile.first_name}!
        </p>
      </div>

      {/* Main Profile Card */}
      <div className="glass w-full rounded-none md:rounded-3xl p-4 md:p-8 border-2 border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Avatar & Quick Stats Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="text-center">
              <div className="relative inline-block">
                <div className="absolute -inset-4 bg-gradient-to-r from-emerald-400/30 to-cyan-400/30 rounded-full blur-lg animate-pulse"/>
                <img
                  src={profile.avatar_signed_url||profile.avatar_url||avatarPlaceholder}
                  alt={profile.first_name}
                  className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-44 md:h-44 rounded-full object-cover ring-4 ring-white/20 shadow-2xl z-10 transform hover:scale-105 transition-transform duration-300 mx-auto"
                />
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg z-20">
                  <Sparkles className="w-4 h-4 text-white"/>
                </div>
              </div>

              {needsFix&&(
                <button
                  onClick={fixLegacyAvatar}
                  disabled={busyFix}
                  className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg"
                >
                  {busyFix?"✨ Fixing Avatar...":"🎨 Upgrade Avatar"}
                </button>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-1">
                {profile.nick_name||profile.first_name}
              </h2>
              {profile.nick_name&&profile.nick_name!==profile.first_name&&(
                <p className="text-white/60 text-sm">
                  AKA {profile.first_name} {profile.last_name||""}
                </p>
              )}
            </div>

            <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-4 text-center border border-purple-500/30 w-full">
              <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2"/>
              <div className="text-white font-bold text-lg">{achievementCount}</div>
              <div className="text-white/60 text-xs">Achievements Unlocked</div>
            </div>

            <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-2xl p-4 text-center border border-cyan-500/30 w-full">
              <Calendar className="w-6 h-6 text-cyan-300 mx-auto mb-2"/>
              <div className="text-white font-bold text-lg">
                {Math.max(1,monthsAsMember)}
              </div>
              <div className="text-white/60 text-xs">
                {monthsAsMember===1?"Month":"Months"} as Member
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {/* Points Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gradient-to-br from-emerald-500/20 to-green-500/20 rounded-2xl p-6 text-center border border-emerald-500/30 transform hover:scale-105 transition-transform duration-200 w-full">
                <Zap className="w-8 h-8 text-emerald-300 mx-auto mb-3"/>
                <div className="text-3xl font-bold text-emerald-300">{available}</div>
                <div className="text-white/80 text-sm font-medium">Available Points</div>
                <div className="text-white/40 text-xs mt-1">Ready to spend! 🎁</div>
                <button
                  onClick={()=>void refreshUnified()}
                  className="mt-3 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                >
                  🔄 Refresh
                </button>
              </div>

              <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl p-6 text-center border border-blue-500/30 transform hover:scale-105 transition-transform duration-200 w-full">
                <Star className="w-8 h-8 text-blue-300 mx-auto mb-3"/>
                <div className="text-2xl font-bold text-blue-300">{balance}</div>
                <div className="text-white/80 text-sm font-medium">Total Balance</div>
                <div className="text-white/40 text-xs mt-1">All your points! ⭐</div>
              </div>

              <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl p-6 text-center border border-amber-500/30 transform hover:scale-105 transition-transform duration-200 w-full">
                <Gift className="w-8 h-8 text-amber-300 mx-auto mb-3"/>
                <div className="text-2xl font-bold text-amber-300">{reserved}</div>
                <div className="text-white/80 text-sm font-medium">Reserved</div>
                <div className="text-white/40 text-xs mt-1">For cool rewards! 🎯</div>
              </div>
            </div>

            {/* Profile Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-2xl p-6 border border-white/10 w-full">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-cyan-400"/>
                  Personal Info
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                    <span className="text-white/60 text-sm">First Name</span>
                    <span className="text-white font-medium">{profile.first_name}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                    <span className="text-white/60 text-sm">Last Name</span>
                    <span className="text-white font-medium">{profile.last_name||"—"}</span>
                  </div>
                  {profile.nick_name&&(
                    <div className="flex justify-between items-center py-2 border-b border-white/10">
                      <span className="text-white/60 text-sm">Super Nickname</span>
                      <span className="text-emerald-300 font-medium">
                        {profile.nick_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-2xl p-6 border border-white/10 w-full">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-400"/>
                  Family & Celebration
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                    <span className="text-white/60 text-sm">Family Team</span>
                    <span className="text-white font-medium">
                      {profile.family_name||profile.family_id||"—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                    <span className="text-white/60 text-sm">Parent Hero</span>
                    <span className="text-white font-medium">
                      {profile.parent_name||profile.parent_uid||profile.created_by||"—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                    <span className="text-white/60 text-sm">Birthday Bash</span>
                    <span className="text-white font-medium">
                      {profile.birthday
                        ?new Date(profile.birthday+"T00:00:00").toLocaleDateString("en-US",{
                          year:"numeric",
                          month:"long",
                          day:"numeric",
                        })
                        :"—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-white/60 text-sm">Adventure Started</span>
                    <span className="text-white font-medium">
                      {new Date(profile.created_at).toLocaleDateString("en-US",{
                        year:"numeric",
                        month:"long",
                        day:"numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl p-6 border border-emerald-500/20 w-full">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-emerald-400"/>
                  My Super Stats
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">Points Power</span>
                    <span className="text-emerald-300 font-bold">{balance} pts</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">Rewards Ready</span>
                    <span className="text-amber-300 font-bold">{available} pts</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">Achievement Level</span>
                    <span className="text-purple-300 font-bold">
                      {achievementCount>10
                        ?"Expert"
                        :achievementCount>5
                          ?"Advanced"
                          :"Beginner"}
                    </span>
                  </div>
                </div>
              </div>

              <details className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-2xl p-6 border border-white/10 w-full">
                <summary className="cursor-pointer text-white/50 text-sm font-medium flex items-center gap-2">
                  <span>🔧 Explorer Details</span>
                </summary>
                <div className="mt-4 p-4 bg-white/5 rounded-xl space-y-2 text-xs">
                  <div>
                    <strong>Explorer ID (legacy uid):</strong> {profile.child_uid}
                  </div>
                  <div>
                    <strong>Mission Code (canonical id):</strong> {profile.id}
                  </div>
                  <div>
                    <strong>Team ID:</strong> {profile.family_id}
                  </div>
                  <div>
                    <strong>Captain ID:</strong> {profile.parent_uid||"None"}
                  </div>
                  <div>
                    <strong>Birthday Code:</strong> {profile.birthday||"Classified"}
                  </div>
                  <div>
                    <strong>Avatar Source:</strong> {profile.avatar_path||"Top Secret"}
                  </div>
                  {uw&&(
                    <div className="mt-3">
                      <strong>Unified Wallet Snapshot:</strong>
                      <pre className="mt-1 whitespace-pre-wrap break-all">
                        {JSON.stringify(uw,null,2)}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      {/* Celebration Footer */}
      <div className="text-center mt-8">
        <div className="text-white/40 text-sm">
          Keep being awesome, {profile.nick_name||profile.first_name}! 🌟
        </div>
        <div className="flex justify-center gap-2 mt-2">
          {Array.from({length:5}).map((_,i)=>(
            <Sparkles
              key={i}
              className="w-4 h-4 text-yellow-400 animate-pulse"
              style={{animationDelay:`${i*0.2}s`}}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
