import {useEffect,useRef,useState,useMemo}from "react";
import {useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {
  Bell,Gift,Target,CheckCircle,Sparkles,ThumbsUp,ThumbsDown,Plus,
  Image as ImageIcon,X,ExternalLink,Clock,BookOpen,Users,Trash2
}from "lucide-react";
import {tpromise}from "@/utils/toastx";
import {isUuid}from "@/utils/ids";

/* ------------------------------- Config ------------------------------------ */
const DEFAULT_AI_BUCKET="ai-images";
const SIGN_TTL_SEC=3600;

/* ------------------------------- Types ------------------------------------- */
type ChildProfile={
  id:string;
  child_uid:string;
  family_id:string;
  parent_uid:string|null;
  created_by:string|null;
  first_name:string;
  last_name:string|null;
  nick_name:string|null;
  age:number|null;
  birthday?:string|null;
  avatar_path:string|null;
  created_at?:string;
};

type WishlistItem={
  id:string;
  child_uid:string;
  family_id:string|null;
  label:string;
  description:string|null;
  link:string|null;
  target_points:number;
  current_points:number;
  status:"pending"|"in_progress"|"completed"|"fulfilled"|string;
  approval_status?:"Pending"|"Approved"|"Rejected";
  category:string;
  created_at:string;
  completed_at:string|null;
  fulfilled_at:string|null;
  occasion?:string|null;

  // artwork fields may come from legacy stitch or base table
  ai_image_url?:string|null;
  image_url?:string|null;
  image_path?:string|null;
  ai_image_attribution?:string|null;

  child_profile?:any|null;
};

type Notification={
  id:string;
  type:string;
  title:string;
  message:string;
  is_read:boolean;
  created_at:string;
  wishlist_item_id:string|null;
  child_uid:string|null;
  child_profile:Pick<ChildProfile,"id"|"child_uid"|"first_name"|"last_name"|"nick_name">|null;
};

type StatusFilter="all"|"pending"|"approved"|"completed";

/* --------------------------- URL helpers ----------------------------------- */
const isHttpLike=(s?:string|null)=>!!s&&(s.startsWith("http://")||s.startsWith("https://"));
const isDataUrl=(s?:string|null)=>!!s&&s.startsWith("data:");
const trimNull=(s?:string|null)=>typeof s==="string"?s.trim():null;

function parseStoragePath(input?:string|null):{bucket:string;path:string}|null{
  const raw=trimNull(input);
  if(!raw)return null;
  if(isHttpLike(raw)||isDataUrl(raw))return null;
  const colonIdx=raw.indexOf(":");
  if(colonIdx>0){
    const b=raw.slice(0,colonIdx).trim();
    const p=raw.slice(colonIdx+1).replace(/^\/+/,"");
    if(b&&p)return{bucket:b,path:p};
  }
  const slashIdx=raw.indexOf("/");
  if(slashIdx>0){
    const maybeBucket=raw.slice(0,slashIdx);
    const rest=raw.slice(slashIdx+1);
    if(/^[a-z0-9-_]+$/i.test(maybeBucket))return{bucket:maybeBucket,path:rest};
  }
  return{bucket:DEFAULT_AI_BUCKET,path:raw.replace(/^\/+/,"")};
}

/* --------------------------- Component ------------------------------------- */
export default function ParentChildWishlist(){
  const [wishlists,setWishlists]=useState<WishlistItem[]>([]);
  const [notifications,setNotifications]=useState<Notification[]>([]);
  const [selectedChildId,setSelectedChildId]=useState<string>("all");
  const [children,setChildren]=useState<ChildProfile[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [occ,setOcc]=useState<string>("All");
  const [statusFilter,setStatusFilter]=useState<StatusFilter>("all");
  const navigate=useNavigate();

  const [signedMap,setSignedMap]=useState<Record<string,string>>({});

  // Overlays
  const [timelineOpen,setTimelineOpen]=useState(false);
  const [guideOpen,setGuideOpen]=useState(false);

  /* ---------- Lightbox ---------- */
  const [preview,setPreview]=useState<{open:boolean;url:string;title:string}|null>(null);
  const openPreview=(url:string,title:string)=>setPreview({open:true,url,title});
  const closePreview=()=>setPreview(null);
  useEffect(()=>{
    if(!preview?.open)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")closePreview();};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[preview?.open]);

  /* ---------- Audio priming ---------- */
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const audioOkRef=useRef(false);
  useEffect(()=>{
    const unlock=()=>{
      if(!audioRef.current)audioRef.current=new Audio("/sounds/ding.wav");
      audioOkRef.current=true;
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
    window.addEventListener("pointerdown",unlock,{once:true});
    window.addEventListener("keydown",unlock,{once:true});
    return()=>{
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
  },[]);
  const playDing=()=>{try{if(audioOkRef.current&&audioRef.current){audioRef.current.currentTime=0;void audioRef.current.play();}}catch{}};

  /* ---------- Realtime channel ---------- */
  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);

  useEffect(()=>{
    void loadForParent();
    return()=>{try{channelRef.current?.unsubscribe();}catch{}};
  },[]);

  const pickRawImage=(w:Partial<WishlistItem>)=>{
    return trimNull(w.ai_image_url)||trimNull(w.image_url)||trimNull(w.image_path)||null;
  };

  const displayImageFor=(w:WishlistItem)=>{
    const raw=pickRawImage(w);
    if(!raw)return null;
    if(isHttpLike(raw)||isDataUrl(raw))return raw;
    const cached=signedMap[w.id];
    if(cached)return cached;
    return null;
  };

  /* ---------- Batch sign missing images per bucket ---------- */
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      if(!wishlists.length)return;
      const toSignByBucket=new Map<string,{ids:string[];paths:string[]}>();
      for(const w of wishlists){
        if(signedMap[w.id])continue;
        const raw=pickRawImage(w);
        if(!raw||isHttpLike(raw)||isDataUrl(raw))continue;
        const parsed=parseStoragePath(raw);
        if(!parsed)continue;
        const key=parsed.bucket;
        if(!toSignByBucket.has(key))toSignByBucket.set(key,{ids:[],paths:[]});
        toSignByBucket.get(key)!.ids.push(w.id);
        toSignByBucket.get(key)!.paths.push(parsed.path);
      }
      if(!toSignByBucket.size)return;

      const updates:Record<string,string>={};
      for(const [bucket,{ids,paths}]of toSignByBucket){
        try{
          const anyFrom=(supabase.storage.from(bucket)as any);
          if(typeof anyFrom.createSignedUrls==="function"){
            const {data,error}=await anyFrom.createSignedUrls(paths,SIGN_TTL_SEC);
            if(!error&&Array.isArray(data)){
              data.forEach((row:{signedUrl?:string},i:number)=>{if(row?.signedUrl)updates[ids[i]]=row.signedUrl;});
            }
          }else{
            for(let i=0;i<paths.length;i++){
              const {data,error}=await supabase.storage.from(bucket).createSignedUrl(paths[i],SIGN_TTL_SEC);
              if(!error&&data?.signedUrl)updates[ids[i]]=data.signedUrl;
            }
          }
        }catch{}
      }
      if(!cancelled&&Object.keys(updates).length){setSignedMap(prev=>({...prev,...updates}));}
    })();
    return()=>{cancelled=true;};
  },[wishlists,signedMap]);

  /* ---------------------------- Columns ---------------------------- */
  // keep only columns that exist on public.wishlist_items (per 42703) and avoid heavy JSON-ish payloads
  const WL_COLS=useMemo(()=>[
    "id","child_uid","family_id","label","description","link",
    "target_points","current_points","status","approval_status",
    "category","created_at","completed_at","fulfilled_at","occasion",
    "image_url"
  ].join(","),[]);

  /* ---------------------------- Data load ---------------------------- */
  async function loadForParent(){
    try{
      setLoading(true);
      setError(null);

      const {data:auth,error:authErr}=await supabase.auth.getUser();
      if(authErr)throw authErr;
      const user=auth?.user;
      if(!user){
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      // 1) children for this parent
      let childRows:ChildProfile[]=[];
      try{
        const kidsRes=await supabase
          .from("child_profiles")
          .select("id,child_uid,family_id,first_name,last_name,nick_name,avatar_path,age,parent_uid,created_by")
          .or(`parent_uid.eq.${user.id},created_by.eq.${user.id}`)
          .order("first_name",{ascending:true});
        if(kidsRes.error)throw kidsRes.error;
        childRows=(kidsRes.data||[])as ChildProfile[];
      }catch(e:any){
        console.error("child_profiles load failed:",e?.message||e);
        throw e;
      }

      setChildren(childRows);

      if(childRows.length===0){
        setWishlists([]);
        setNotifications([]);
        setSignedMap({});
        setLoading(false);
        return;
      }

      const childUids=childRows.map(c=>c.child_uid).filter(isUuid);
      const safeChildFilter=childUids.length?childUids:["00000000-0000-0000-0000-000000000000"];

      /* 2) wishlist_items (main) */
      let wlRows:WishlistItem[]=[];
      try{
        if(childUids.length){
          const res=await supabase
            .from("wishlist_items")
            .select(WL_COLS)
            .in("child_uid",childUids)
            .order("created_at",{ascending:false})
            .limit(200);
          if(res.error)throw res.error;
          wlRows=(res.data||[])as WishlistItem[];
        }
      }catch(e:any){
        console.error("wishlist_items primary load failed:",e?.message||e);
        // Fallback: even smaller + safe subset
        try{
          if(childUids.length){
            const res=await supabase
              .from("wishlist_items")
              .select("id,child_uid,family_id,label,description,link,target_points,current_points,status,approval_status,category,created_at,completed_at,fulfilled_at")
              .in("child_uid",childUids)
              .order("created_at",{ascending:false})
              .limit(120);
            if(!res.error)wlRows=(res.data||[])as WishlistItem[];
          }
        }catch(e2:any){
          console.error("wishlist_items fallback load also failed:",e2?.message||e2);
        }
      }

      setWishlists(wlRows);
      setSignedMap({});

      /* 2b) legacy stitch (optional & deferred, doesn’t block the first paint) */
      (async()=>{
        try{
          if(!childUids.length)return;
          const legacy=await supabase
            .from("child_wishlist")
            .select("id,child_uid,family_id,label,description,link,target_points,current_points,status,approval_status,category,created_at,completed_at,fulfilled_at,occasion,ai_image_url,image_url,image_path,ai_image_attribution")
            .in("child_uid",childUids)
            .order("created_at",{ascending:false})
            .limit(200);
          if(legacy.error||!Array.isArray(legacy.data))return;
          const existing=new Set(wlRows.map(r=>r.id));
          const extras=(legacy.data as any[])
            .filter(r=>!existing.has(r.id))
            .map(r=>({...r}))as WishlistItem[];
          if(extras.length){
            const merged=[...wlRows,...extras].sort((a,b)=>a.created_at<b.created_at?1:-1);
            setWishlists(merged);
            setSignedMap({});
          }
        }catch(e:any){
          console.warn("legacy child_wishlist stitch failed:",e?.message||e);
        }
      })();

      /* 3) notifications mapping */
      let notes:Notification[]=[];
      try{
        const notesRes=await supabase
          .from("wishlist_notifications")
          .select("id,type,title,message,is_read,created_at,wishlist_item_id,child_uid")
          .in("child_uid",safeChildFilter)
          .eq("is_read",false)
          .order("created_at",{ascending:false})
          .limit(10);

        if(!notesRes.error){
          const uidToChildLocal=Object.fromEntries(childRows.map(c=>[c.child_uid,c]));
          notes=(notesRes.data||[]).map((n:any)=>({
            ...n,
            child_profile:n.child_uid?(uidToChildLocal[n.child_uid]??null):null
          }))as Notification[];
        }
      }catch(e:any){
        console.error("wishlist_notifications load failed:",e?.message||e);
      }
      setNotifications(notes);

      /* 4) Realtime subscriptions */
      try{channelRef.current?.unsubscribe();}catch{}
      const ch=supabase.channel(`parent-wishlist:${user.id}`);

      const rtIn=childUids.map(u=>`"${u}"`).join(",");
      const rtFilter=childUids.length?`child_uid=in.(${rtIn})`:"id=neq.__none__";

      ch.on(
        "postgres_changes",
        {event:"*",schema:"public",table:"wishlist_items",filter:rtFilter},
        async()=>{
          try{
            const fresh=await supabase
              .from("wishlist_items")
              .select(WL_COLS)
              .in("child_uid",safeChildFilter)
              .order("created_at",{ascending:false})
              .limit(200);
            if(!fresh.error){
              setWishlists((fresh.data||[])as WishlistItem[]);
              setSignedMap({});
            }
          }catch(e:any){
            console.error("realtime wishlist_items refresh failed:",e?.message||e);
          }
        }
      );

      ch.on(
        "postgres_changes",
        {event:"INSERT",schema:"public",table:"wishlist_notifications",filter:rtFilter},
        async()=>{
          playDing();
          try{
            const fresh=await supabase
              .from("wishlist_notifications")
              .select("id,type,title,message,is_read,created_at,wishlist_item_id,child_uid")
              .in("child_uid",safeChildFilter)
              .eq("is_read",false)
              .order("created_at",{ascending:false})
              .limit(10);
            if(!fresh.error){
              const byUid=Object.fromEntries(childRows.map(c=>[c.child_uid,c]));
              setNotifications((fresh.data||[]).map((n:any)=>({
                ...n,
                child_profile:n.child_uid?(byUid[n.child_uid]??null):null
              }))as Notification[]);
            }
          }catch(e:any){
            console.error("realtime wishlist_notifications refresh failed:",e?.message||e);
          }
        }
      );

      ch.subscribe();
      channelRef.current=ch;
    }catch(e:any){
      console.error("❌ loadForParent failed:",e?.message||e);
      setError(e?.message||"Failed to load family data");
    }finally{
      setLoading(false);
    }
  }

  /* ---------------------------- Actions ---------------------------- */
  async function markNotificationAsRead(notificationId:string){
    await tpromise(
      ()=>supabase.from("wishlist_notifications").update({is_read:true}).eq("id",notificationId),
      {
        loading:"Marking as read…",
        success:"Notification marked as read.",
        error:"Failed to mark notification as read.",
        sound:"success"
      }
    );
    setNotifications(prev=>prev.filter(n=>n.id!==notificationId));
  }

  async function decideWish(wishlistId:string,approve:boolean){
    const reason=!approve?prompt("Reason for rejection (optional)")??null:null;
    const res=await tpromise(
      ()=>supabase.rpc("parent_wishlist_approve",{
        _wishlist_id:wishlistId,
        _approve:approve,
        _reason:reason
      }),
      {
        loading:approve?"Approving wish…":"Rejecting wish…",
        success:approve?"Wish approved! ✨":"Wish rejected.",
        error:(e:any)=>`Failed to update approval${e?.message?` — ${e.message}`:""}.`,
        sound:approve?"success":"warning"
      }
    );
    if("error"in res&&res.error){
      try{
        const u=await supabase
          .from("wishlist_items")
          .update({
            approval_status:approve?"Approved":"Rejected",
            approved_at:new Date().toISOString()as any
          })
          .eq("id",wishlistId)
          .select();
        if(!u.error)await loadForParent();
      }catch{}
    }else{
      await loadForParent();
    }
  }

  async function grantPoints(wishlistId:string,pts?:number){
  const value=typeof pts==="number"?pts:parseInt(prompt("Enter points to grant")||"0",10);
  if(!Number.isFinite(value)||value<=0)return;

  const res=await tpromise(
    ()=>supabase.rpc("parent_wishlist_grant_points",{
      _wishlist_id:wishlistId,
      _points:value,
      _note:"Parent award"
    }),
    {
      loading:"Granting points…",
      success:`Granted +${value} points 🎉`,
      error:(e:any)=>{
        console.error("parent_wishlist_grant_points error",e);
        // e will usually have: code, message, details, hint
        const msg=e?.message||e?.details||"Unknown conflict while granting points.";
        return`Failed to grant points — ${msg}`;
      },
      sound:"success"
    }
  );

  if(!("error"in res)||!res.error)await loadForParent();
}

  async function markAsFulfilled(itemId:string){
    const res=await tpromise(
      ()=>supabase.rpc("parent_wishlist_fulfill",{_wishlist_id:itemId}),
      {
        loading:"Marking fulfilled…",
        success:"Wish marked as fulfilled. 🎁",
        error:(e:any)=>`Failed to mark fulfilled${e?.message?` — ${e.message}`:""}.`
      }
    );
    if(!("error"in res)||!res.error)await loadForParent();
  }

  async function deleteWish(itemId:string){
    if(!confirm("Delete this wish? This cannot be undone."))return;
    const res=await tpromise(
      ()=>supabase.from("wishlist_items").delete().eq("id",itemId),
      {
        loading:"Deleting wish…",
        success:"Wish deleted.",
        error:(e:any)=>e?.message||"Failed to delete wish."
      }
    );
    if(!("error"in res)||!res.error)await loadForParent();
  }

  /* ---------------------------- Derived ---------------------------- */
  function getCategoryColor(category:string){
    switch(category){
      case "birthday":return"from-pink-500 to-rose-500";
      case "occasion":return"from-purple-500 to-indigo-500";
      case "celebration":return"from-yellow-500 to-orange-500";
      case "achievement":return"from-blue-500 to-cyan-500";
      default:return"from-emerald-500 to-teal-500";
    }
  }
  function getChildDisplayName(child:ChildProfile|NonNullable<WishlistItem["child_profile"]>){
    return child.nick_name||(child.first_name??"");
  }
  function getProgressColor(p:number){
    if(p>=100)return"bg-gradient-to-r from-green-500 to-emerald-500";
    if(p>=75)return"bg-gradient-to-r from-blue-500 to-cyan-500";
    if(p>=50)return"bg-gradient-to-r from-yellow-500 to-orange-500";
    return"bg-gradient-to-r from-pink-500 to-rose-500";
  }

  const OCC_CHOICES=["All","Birthday","Christmas","Halloween","Diwali","Eid","New Year","Back to School","Just Because","Other"];
  const isNamedOccasion=(o:string)=>["Birthday","Christmas","Halloween","Diwali","Eid","New Year","Back to School","Just Because"].includes(o);

  const idToChild=useMemo(()=>Object.fromEntries(children.map(c=>[c.id,c])),[children]);
  const uidToChild=useMemo(()=>Object.fromEntries(children.map(c=>[c.child_uid,c])),[children]);

  const selectedChild=selectedChildId==="all"?null:idToChild[selectedChildId]||null;
  const selectedKeys=selectedChild?[selectedChild.child_uid,selectedChild.id].filter(isUuid):[];
  const selectedChildName=selectedChild?getChildDisplayName(selectedChild):"All children";

  const filteredByChild=useMemo(()=>{
    if(!selectedKeys.length)return wishlists;
    return wishlists.filter(i=>selectedKeys.includes(i.child_uid));
  },[wishlists,selectedKeys]);

  const filteredWishlists=useMemo(()=>{
    let base=filteredByChild;
    if(occ!=="All"){
      base=base.filter(x=>{
        const o=(x.occasion??"").trim();
        if(occ==="Other")return Boolean(o)&&!isNamedOccasion(o);
        return o===occ;
      });
    }
    if(statusFilter==="pending"){
      base=base.filter(x=>!x.approval_status||x.approval_status==="Pending");
    }else if(statusFilter==="approved"){
      base=base.filter(x=>x.approval_status==="Approved");
    }else if(statusFilter==="completed"){
      base=base.filter(x=>x.status==="completed"||x.status==="fulfilled");
    }
    return base;
  },[filteredByChild,occ,statusFilter]);

  // For timeline overlay: use the current filtered wishlist list
  const timelineList=useMemo(()=>{
    return filteredWishlists
      .slice()
      .sort((a,b)=>a.created_at<b.created_at?1:-1);
  },[filteredWishlists]);

  if(loading){
    return(
      <div className="min-h-screen bg-[#050816]">
        <div className="px-6 py-10">
          <div className="text-white/70 text-center">Loading magical wishes...</div>
        </div>
      </div>
    );
  }

  if(error){
    return(
      <div className="min-h-screen bg-[#050816]">
        <div className="px-6 py-10">
          <div className="max-w-2xl mx-auto text-center">
            <div className="glass-premium rounded-3xl p-8 border border-white/20">
              <div className="text-6xl mb-4">😔</div>
              <h2 className="text-2xl font-bold text-white mb-4">Oops! Something went wrong</h2>
              <p className="text-white/70 mb-6">{error}</p>
              <button
                onClick={()=>void loadForParent()}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 rounded-2xl text-white font-semibold transition-all duration-300"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const readyToFulfill=filteredWishlists.filter(i=>i.status==="completed");

  return(
    <div className="min-h-screen bg-[#050816]">
      <div className="relative px-3 sm:px-6 py-6 sm:py-10">
        <div className="max-w-7xl mx-auto min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 min-w-0">
            <div className="min-w-0">
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent break-words">
                Child Magical Wishes ✨
              </h1>
              <p className="text-sm sm:text-base text-purple-200/80 mt-2 break-words">
                Approve, reward, and celebrate progress
              </p>
            </div>
            <div className="flex w-full sm:w-auto gap-3">
              {notifications.length>0&&(
                <div className="relative">
                  <button
                    className="p-3 glass rounded-2xl border border-white/20 hover:bg-white/20 transition-all duration-300 hover-lift w-full sm:w-auto"
                    title="New activity"
                  >
                    <Bell className="w-6 h-6 text-purple-200"/>
                  </button>
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold">
                    {notifications.length}
                  </div>
                </div>
              )}
              <button
                onClick={()=>navigate("/parent")}
                className="px-6 py-3 rounded-2xl glass border border-white/20 hover:bg-white/20 transition-all duration-300 text-white font-semibold hover-lift w-full sm:w-auto"
              >
                ← Dashboard
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="glass-premium rounded-3xl p-6 text-center border border-white/20 hover-lift">
              <div className="text-2xl sm:text-3xl font-bold text-purple-200">{filteredWishlists.length}</div>
              <div className="text-purple-200/70 text-sm sm:text-base">Total Wishes</div>
            </div>
            <div className="glass-premium rounded-3xl p-6 text-center border border-white/20 hover-lift">
              <div className="text-2xl sm:text-3xl font-bold text-pink-200">
                {filteredWishlists.filter(w=>w.approval_status==="Pending"||!w.approval_status).length}
              </div>
              <div className="text-purple-200/70 text-sm sm:text-base">Waiting Approval</div>
            </div>
            <div className="glass-premium rounded-3xl p-6 text-center border border-white/20 hover-lift">
              <div className="text-2xl sm:text-3xl font-bold text-blue-200">
                {filteredWishlists.filter(w=>w.status==="in_progress").length}
              </div>
              <div className="text-purple-200/70 text-sm sm:text-base">In Progress</div>
            </div>
            <div className="glass-premium rounded-3xl p-6 text-center border border-white/20 hover-lift">
              <div className="text-2xl sm:text-3xl font-bold text-green-200">{readyToFulfill.length}</div>
              <div className="text-purple-200/70 text-sm sm:text-base">Ready to Fulfill</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 min-w-0">
              <div className="glass-premium rounded-3xl p-6 mb-6 border border-white/20">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="font-semibold text-white text-sm sm:text-base">
                        Filter by Child:
                      </label>
                      <select
                        value={selectedChildId}
                        onChange={(e)=>setSelectedChildId(e.target.value)}
                        className="rounded-2xl px-4 py-2 bg-white/10 border border-white/20 text-white font-medium focus:ring-2 focus:ring-purple-400 focus:border-transparent w-full sm:w-auto"
                      >
                        <option value="all" className="bg-gray-800">All Children</option>
                        {children.map(child=>(
                          <option key={child.id}value={child.id}className="bg-gray-800">
                            {child.nick_name||(child.first_name??"")}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="font-semibold text-white text-sm sm:text-base">Occasion:</label>
                      <select
                        value={occ}
                        onChange={(e)=>setOcc(e.target.value)}
                        className="px-2 py-2 rounded-2xl bg-white/10 border border-white/20 text-white text-sm"
                      >
                        {OCC_CHOICES.map(o=>(
                          <option key={o}value={o}className="bg-gray-800">
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={()=>setTimelineOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm"
                    >
                      <Clock className="w-4 h-4"/>
                      Open inline timeline preview
                    </button>
                    <button
                      type="button"
                      onClick={()=>setGuideOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-purple-600/80 hover:bg-purple-600 border border-purple-400/60 text-white text-xs sm:text-sm"
                    >
                      <BookOpen className="w-4 h-4"/>
                      Guide, instructions &amp; process
                    </button>
                  </div>
                </div>
              </div>

              {/* Status filter chips */}
              <div className="flex flex-wrap gap-2 mb-4 text-xs">
                {[
                  {key:"all",label:"All"},
                  {key:"pending",label:"Pending"},
                  {key:"approved",label:"Approved"},
                  {key:"completed",label:"Completed"},
                ].map(b=>(
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

              <div className="space-y-4 min-w-0">
                {filteredWishlists.map(item=>{
                  const p=(item.current_points/Math.max(1,item.target_points))*100;
                  const stitched=uidToChild[item.child_uid]||null;
                  const childName=stitched?getChildDisplayName(stitched):"";
                  const imgSrc=displayImageFor(item);
                  const hasImg=Boolean(imgSrc);
                  return(
                    <div
                      key={item.id}
                      className="glass-premium rounded-3xl p-6 border border-white/20 shadow-lg hover:shadow-xl transition-all duration-500 hover-lift min-w-0"
                    >
                      {/* CARD HEADER */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4 min-w-0">
                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 flex-1 min-w-0">
                          <div className="shrink-0 mb-2 sm:mb-0">
                            {hasImg?(
                              <button
                                type="button"
                                onClick={()=>openPreview(imgSrc!,item.label)}
                                className="relative group focus:outline-none"
                                aria-label="Open image preview"
                                title="Click to view large"
                              >
                                <img
                                  src={imgSrc!}
                                  alt={item.label}
                                  className="w-24 h-24 sm:w-20 sm:h-20 rounded-2xl object-cover border border-white/20 shadow-sm group-hover:opacity-90 transition"
                                  onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display="none";}}
                                />
                                <div className="absolute -bottom-2 -right-2 p-1 rounded-xl bg-white/10 border border-white/20 backdrop-blur-sm">
                                  <ImageIcon className="w-4 h-4 text-white/80"/>
                                </div>
                              </button>
                            ):(
                              <div className={`p-3 rounded-2xl bg-gradient-to-r ${getCategoryColor(item.category)} text-white sparkle`}>
                                <Gift className="w-6 h-6"/>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                              <h3 className="text-lg sm:text-xl font-bold text-white break-words">
                                {item.label}
                              </h3>
                              <span className="px-2 py-1 rounded-full text-xs border border-white/20 text-white/80">
                                {childName}
                              </span>
                              {item.occasion&&(
                                <span className="ml-0 px-2 py-1 rounded-full text-[10px] font-medium bg-white/10 border border-white/20 text-white/80">
                                  {item.occasion}
                                </span>
                              )}
                              {item.approval_status&&(
                                <span
                                  className={`px-2 py-1 rounded-full text-xs
                                  ${item.approval_status==="Approved"
                                    ?"bg-emerald-500/30 text-emerald-100 border border-emerald-400"
                                    :item.approval_status==="Rejected"
                                    ?"bg-rose-500/30 text-rose-100 border border-rose-400"
                                    :"bg-amber-500/30 text-amber-100 border border-amber-400"}`}
                                >
                                  {item.approval_status}
                                </span>
                              )}
                              <span
                                className={`px-2 py-1 rounded-full text-xs
                                ${item.status==="completed"?"bg-green-500/30 text-green-100 border border-green-400":""}
                                ${item.status==="fulfilled"?"bg-purple-500/30 text-purple-100 border border-purple-400":""}
                                ${item.status==="in_progress"?"bg-blue-500/30 text-blue-100 border border-blue-400":""}
                                ${item.status==="pending"?"bg-slate-500/30 text-slate-100 border border-slate-400":""}`}
                              >
                                {String(item.status).replace("_"," ")}
                              </span>
                            </div>
                            {item.description&&(
                              <p className="text-white/80 mb-3 break-words">
                                {item.description}
                              </p>
                            )}
                            <div className="mb-3">
                              <div className="flex justify-between text-xs sm:text-sm text-white/70 mb-2">
                                <span>Progress</span>
                                <span>
                                  {Math.round(p)}% ({item.current_points}/{item.target_points})
                                </span>
                              </div>
                              <div className="w-full bg-white/20 rounded-full h-3">
                                <div
                                  className={`h-3 rounded-full ${getProgressColor(p)} transition-all duration-1000 ease-out`}
                                  style={{width:`${Math.min(p,100)}%`}}
                                />
                              </div>
                            </div>
                            {item.ai_image_attribution&&hasImg&&(
                              <div className="text-[10px] text-white/50 mt-1">
                                {item.ai_image_attribution}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap">
                        <div className="flex flex-col xs:flex-row gap-2 w-full sm:w-auto flex-wrap">
                          {item.link&&(
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 rounded-xl text-white font-semibold text-sm transition-all duration-300 hover-lift flex items-center gap-2 w-full sm:w-auto"
                            >
                              <Target className="w-4 h-4"/> View Link
                            </a>
                          )}
                          {item.approval_status==="Pending"&&(
                            <>
                              <button
                                onClick={()=>void decideWish(item.id,true)}
                                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 rounded-xl text-white font-semibold text-sm transition-all duration-300 hover-lift flex items-center gap-2 w-full sm:w-auto"
                              >
                                <ThumbsUp className="w-4 h-4"/> Approve
                              </button>
                              <button
                                onClick={()=>void decideWish(item.id,false)}
                                className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 rounded-xl text-white font-semibold text-sm transition-all duration-300 hover-lift flex items-center gap-2 w-full sm:w-auto"
                              >
                                <ThumbsDown className="w-4 h-4"/> Reject
                              </button>
                            </>
                          )}
                          {item.approval_status==="Approved"&&item.status!=="fulfilled"&&(
                            <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                              <button
                                onClick={()=>void grantPoints(item.id,5)}
                                className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 w-full sm:w-auto"
                              >
                                +5
                              </button>
                              <button
                                onClick={()=>void grantPoints(item.id,10)}
                                className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 w-full sm:w-auto"
                              >
                                +10
                              </button>
                              <button
                                onClick={()=>void grantPoints(item.id,20)}
                                className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 w-full sm:w-auto"
                              >
                                +20
                              </button>
                              <button
                                onClick={()=>void grantPoints(item.id)}
                                className="px-3 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm hover:opacity-90 flex items-center gap-1 w-full sm:w-auto"
                              >
                                <Plus className="w-4 h-4"/> Custom
                              </button>
                            </div>
                          )}
                          {item.status==="completed"&&(
                            <button
                              onClick={()=>void markAsFulfilled(item.id)}
                              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 rounded-xl text-white font-semibold text-sm transition-all duration-300 hover-lift flex items-center gap-2 w-full sm:w-auto"
                            >
                              <CheckCircle className="w-4 h-4"/> Mark Fulfilled
                            </button>
                          )}
                          <button
                            onClick={()=>void deleteWish(item.id)}
                            className="px-4 py-2 rounded-xl bg-white/5 border border-white/25 text-white text-sm hover:bg-rose-600/80 hover:border-rose-400/80 transition-all duration-200 flex items-center gap-2 w-full sm:w-auto"
                          >
                            <Trash2 className="w-4 h-4"/> Delete
                          </button>
                        </div>
                        <div className="text-xs sm:text-sm text-white/60">
                          Created {new Date(item.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredWishlists.length===0&&(
                  <div className="glass-premium rounded-3xl p-12 text-center border border-white/20">
                    <div className="text-6xl mb-4">🌈</div>
                    <h3 className="text-2xl font-bold text-white mb-2">No Wishes Yet</h3>
                    <p className="text-white/70">
                      Your children haven't created any wishes yet.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6 min-w-0">
              {notifications.length>0&&(
                <div className="glass-premium rounded-3xl p-6 border border-white/20">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Bell className="w-5 h-5"/> Recent Activity
                  </h3>
                  <div className="space-y-3">
                    {notifications.map(n=>(
                      <div
                        key={n.id}
                        className="p-3 rounded-2xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-400/30 cursor-pointer hover:shadow-md transition-all duration-300 hover-lift"
                        onClick={()=>void markNotificationAsRead(n.id)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-semibold text-purple-200 text-sm break-words">
                            {n.title}
                          </span>
                          <Sparkles className="w-4 h-4 text-purple-300 shrink-0"/>
                        </div>
                        <p className="text-purple-200/80 text-xs mb-2 break-words">
                          {n.message}
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-purple-300/70 break-words">
                            {n.child_profile?.nick_name||`${n.child_profile?.first_name??""}`.trim()}
                          </span>
                          <span className="text-xs text-purple-300/70">
                            {new Date(n.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="glass-premium rounded-3xl p-6 border border-white/20 bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
                <div className="text-4xl mb-3">🎉</div>
                <h4 className="font-bold text-white mb-2">Celebration Time!</h4>
                <p className="text-white/80 text-sm break-words">
                  {readyToFulfill.length>0
                    ?`You have ${readyToFulfill.length} wishes ready to fulfill! Make it magical! ✨`
                    :"Your children are working hard on their goals. Celebrate their progress! 🌟"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -------- Inline timeline overlay -------- */}
      {timelineOpen&&(
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-[#050816] rounded-2xl border border-white/15 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-2 rounded-xl bg-purple-500/20 border border-purple-400/50">
                  <Clock className="w-5 h-5 text-purple-200"/>
                </span>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-white truncate">
                    Wishlist timeline preview
                  </h2>
                  <p className="text-[11px] sm:text-xs text-white/60 truncate">
                    Showing wishes for <span className="font-semibold">{selectedChildName}</span>{occ!=="All"&&`, occasion: ${occ}`}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={()=>setTimelineOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
              >
                <X className="w-4 h-4"/> Close
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {timelineList.length===0?(
                <div className="text-center text-white/60 text-sm py-6">
                  Nothing to show yet for this selection.
                </div>
              ):(
                <div className="relative pl-4">
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10"/>
                  <div className="space-y-4">
                    {timelineList.map(item=>{
                      const stitched=uidToChild[item.child_uid]||null;
                      const childName=stitched?getChildDisplayName(stitched):item.child_uid.slice(0,8);
                      const pct=Math.round((item.current_points/Math.max(1,item.target_points))*100);
                      return(
                        <div key={item.id}className="relative pl-4">
                          <div className="absolute left-[-6px] top-2 w-3 h-3 rounded-full bg-purple-400 shadow-[0_0_0_4px_rgba(168,85,247,0.35)]"/>
                          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-purple-600/30 border border-purple-400/50">
                                    <Gift className="w-4 h-4 text-purple-100"/>
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-white truncate">
                                      {item.label}
                                    </div>
                                    <div className="text-[11px] text-white/60 flex flex-wrap gap-2 items-center">
                                      <span className="inline-flex items-center gap-1">
                                        <Users className="w-3 h-3"/>
                                        {childName}
                                      </span>
                                      <span className="inline-flex items-center gap-1">
                                        <Clock className="w-3 h-3"/>
                                        {new Date(item.created_at).toLocaleString()}
                                      </span>
                                      {item.occasion&&(
                                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 border border-white/20 text-white/70">
                                          {item.occasion}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {item.description&&(
                                  <p className="text-xs text-white/70 line-clamp-2 break-words">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-xs font-semibold text-emerald-200">
                                  {pct}%
                                </div>
                                <div className="text-[10px] text-white/60">
                                  {item.current_points}/{item.target_points} pts
                                </div>
                                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-white/20 text-white/75">
                                  {item.approval_status==="Approved"&&"✅ Approved"}
                                  {item.approval_status==="Rejected"&&"✖ Rejected"}
                                  {(!item.approval_status||item.approval_status==="Pending")&&"⏳ Pending"}
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

      {/* -------- Guide / instructions overlay -------- */}
      {guideOpen&&(
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-[#050816] rounded-2xl border border-white/15 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-purple-500/20 border border-purple-400/50">
                  <BookOpen className="w-5 h-5 text-purple-200"/>
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-white">
                    Wishlist guide, instructions &amp; process
                  </h2>
                  <p className="text-[11px] sm:text-xs text-white/60">
                    How children create wishes, and how parents approve, reward, and fulfill them.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={()=>setGuideOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
              >
                <X className="w-4 h-4"/> Close
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-sm text-white/80">
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">1. How wishes are created</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Children (or parents on their behalf) add wishes from the child-side app.</li>
                  <li>Each wish has a label, optional description/link, target points, and an occasion if relevant.</li>
                  <li>Some wishes may include AI-generated artwork or an uploaded image to make it feel special.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. Approval flow</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>New wishes appear here with <span className="font-medium">Pending</span> status.</li>
                  <li>Use <span className="font-medium">Approve</span> to accept a wish or <span className="font-medium">Reject</span> with an optional reason.</li>
                  <li>Once approved, the child can actively work towards the target points for that wish.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. Granting points over time</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>After a wish is approved, you can grant points in small steps (+5, +10, +20) or a custom amount.</li>
                  <li>This feeds into the child’s points ledger so progress stays auditable and consistent with their wallet.</li>
                  <li>The progress bar shows <span className="font-mono text-xs">current_points / target_points</span> as a percentage.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. Completion &amp; fulfillment</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>When progress reaches 100% and you’re ready, you can mark a wish as <span className="font-medium">Completed</span> and then <span className="font-medium">Fulfilled</span>.</li>
                  <li><span className="font-medium">Completed</span> usually means the child has earned enough points; <span className="font-medium">Fulfilled</span> means the real-world reward has been delivered.</li>
                  <li>History is preserved so you can always see what was earned and when.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">5. Using filters &amp; the timeline preview</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Use <span className="font-medium">Filter by Child</span> to focus on one child’s wishes, or “All Children” to see everything.</li>
                  <li>The <span className="font-medium">Occasion</span> dropdown lets you quickly slice wishes by events like Birthday, Diwali, or “Just Because”.</li>
                  <li>The status chips let you quickly focus on <span className="font-medium">Pending</span>, <span className="font-medium">Approved</span>, or <span className="font-medium">Completed</span> wishes without scrolling through everything.</li>
                  <li><span className="font-medium">Open inline timeline preview</span> shows the same filtered wishes in a vertical timeline, sorted by created date for quick scanning.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">6. Notifications &amp; audit</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>The <span className="font-medium">Recent Activity</span> panel surfaces unread wishlist notifications for this family.</li>
                  <li>Marking a notification as read clears it from the panel but leaves the underlying data in the database for reports.</li>
                  <li>All actions (approval, rejections, grants, fulfillment) are handled via Supabase RPCs designed to keep wallet and audit data in sync.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">7. Future extensions</h3>
                <p>
                  This layout is built so you can safely extend it with more filters, per-child stats, or richer AI artwork
                  without redesigning the page. The timeline and guide stay inline, so parents never lose context while reviewing wishes.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* -------- Lightbox / Image Preview Modal -------- */}
      {preview?.open&&(
        <div className="fixed inset-0 z-50 p-4 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80"onClick={closePreview}/>
          <div className="relative z-10 w-full max-w-5xl rounded-2xl bg-[#0B1220] border border-white/15 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="text-white/90 text-sm sm:text-base font-semibold truncate pr-2">
                {preview.title}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-white/80 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10"
                >
                  <ExternalLink className="w-4 h-4"/> Open
                </a>
                <button
                  onClick={closePreview}
                  className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
                  aria-label="Close preview"
                >
                  <X className="w-5 h-5"/>
                </button>
              </div>
            </div>
            <div className="bg-black">
              <img
                src={preview.url}
                alt={preview.title}
                className="w-full h-[70vh] object-contain select-none"
                onError={(e)=>{(e.currentTarget as HTMLImageElement).alt="failed-to-load";}}
                draggable={false}
              />
            </div>
            <div className="px-4 py-3 text-[11px] text-white/60 border-t border-white/10">
              Tip: Press <kbd className="px-1 py-0.5 rounded bg-white/10 border border-white/20">Esc</kbd> or click outside to close.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
