// CONTRACT: Story ↔ Image linking
// - MagicStoryMaker generates a per-story UUID (storyUuid).
// - We send storyUuid to ai-story so it can store `ImageId: <storyUuid>` in the .txt file in magic-stories/public.
// - We send storyUuid + explicit filename `stories-<storyUuid>.png` + folder/subfolder to ai-image,
//   which saves the PNG in ai-images at magic-stories/other/stories/YYYY/MM.
// - StoryLibrary later reads ImageId from the .txt and matches it to the PNG via UUID/filename.

import {useEffect,useMemo,useRef,useState,type FormEvent}from "react";
import {useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {
  Sparkles,
  BookOpen,
  Image as ImageIcon,
  Loader2,
  Wand2,
  Mic,
  MicOff,
  Headphones
}from "lucide-react";
import {fetchChildBrief}from "@/utils/childAuth";
import {tpromise}from "@/utils/toastx";
import {toast}from "sonner";

type StoryTypeOption={value:string;label:string;hint:string};
type StoryLength="short"|"medium"|"long";

type StoryLengthOption={value:StoryLength;label:string;hint:string};

const STORY_TYPES:StoryTypeOption[]=[
  {value:"animal",label:"Animal Story",hint:"Cute animals going on big, cozy adventures"},
  {value:"moral",label:"Story with a Moral",hint:"A warm, longer tale that teaches a gentle lesson"},
  {value:"funny",label:"Funny Story",hint:"Silly, giggly fun that goes on for a while and ends happily"},
  {value:"adventure",label:"Adventure Story",hint:"Exploring, discovering, and being brave in a long, cozy journey"},
  {value:"fantasy",label:"Fantasy Story",hint:"Magic, dragons, and wonder (but never scary), told like a bedtime epic"},
  {value:"panchatantra",label:"Panchatantra-style Story",hint:"Animal fables with a clear moral at the end, perfect for slow reading"}
];

const STORY_LENGTHS:StoryLengthOption[]=[
  {value:"short",label:"Short Story",hint:"Quick cozy read (about 250–400 words)"},
  {value:"medium",label:"Medium Story",hint:"Bedtime length (about 450–700 words)"},
  {value:"long",label:"Long Story",hint:"Epic cozy read (about 700–1000 words)"}
];

type StoryPayload={
  title:string;
  body:string;
  type:string;
  topic:string;
  moral?:string|null;
  storagePath?:string|null;
  signedUrl?:string|null;
  imageId?:string;
};

type LocalStory={title:string;body:string;moral?:string};

type SpeechField="topic"|"why";

type StoryUsageEntry={key:string;ts:number};

const ENABLE_STORY_IMAGE=true;

// not used directly right now, but kept for clarity with contract
const STORY_BUCKET="magic-stories";
const COVER_BUCKET="ai-images";

// localStorage key prefix
const LS_STORY_USAGE="magicStoryUsage";
// hard cap: 3 stories per month (per child profile on this browser)
const MONTH_LIMIT=3;

export default function MagicStoryMaker(){
  const nav=useNavigate();

  const [storyType,setStoryType]=useState<string>("animal");
  const [storyLength,setStoryLength]=useState<StoryLength>("medium");
  const [topic,setTopic]=useState<string>("");
  const [shortSummary,setShortSummary]=useState<string>("");
  const [longSummary,setLongSummary]=useState<string>("");
  const [loading,setLoading]=useState(false);
  const [imageLoading,setImageLoading]=useState(false);
  const [story,setStory]=useState<StoryPayload|null>(null);
  const [imageUrl,setImageUrl]=useState<string|undefined>();
  const [error,setError]=useState<string|undefined>();
  const [childUid,setChildUid]=useState<string|null>(null);
  const [childName,setChildName]=useState<string>("friend");

  const [isListening,setIsListening]=useState(false);
  const [guided,setGuided]=useState(false);

  // monthly usage counter (per child profile on this browser)
  const [storiesUsedThisMonth,setStoriesUsedThisMonth]=useState<number>(0);

  const recognitionRef=useRef<any>(null);
  const guidedModeRef=useRef(false);
  const baseTopicRef=useRef<string>("");
  const currentFieldRef=useRef<SpeechField>("topic");

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        const brief=await fetchChildBrief();
        if(!mounted)return;

        if(brief?.child_uid){
          setChildUid(brief.child_uid);
        }
        const friendly=(brief as any)?.nick_name||(brief as any)?.first_name||(brief as any)?.name;
        if(friendly){setChildName(friendly);}

        // initialise monthly counter for this specific child (fallback to device if no child_uid)
        try{
          const entries=loadUsage(brief?.child_uid||null);
          const monthCount=getMonthCount(entries);
          setStoriesUsedThisMonth(monthCount);
        }catch{}
      }catch(e){
        console.warn("MagicStoryMaker: could not resolve child uid",e);
        // fallback: still compute device-level usage if child uid fetch failed
        try{
          const entries=loadUsage(null);
          const monthCount=getMonthCount(entries);
          setStoriesUsedThisMonth(monthCount);
        }catch{}
      }
    })();

    return()=>{
      mounted=false;
      stopAllVoice();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const currentType=useMemo(
    ()=>STORY_TYPES.find((t)=>t.value===storyType)||STORY_TYPES[0],
    [storyType]
  );

  const currentLength=useMemo(
    ()=>STORY_LENGTHS.find((l)=>l.value===storyLength)||STORY_LENGTHS[1],
    [storyLength]
  );

  const storiesLeft=Math.max(MONTH_LIMIT-storiesUsedThisMonth,0);

  // Generate UUID for consistent story and image naming
  function generateUuid():string{
    return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,(c)=>{
      const r=Math.random()*16|0;
      const v=c==="x"?r:(r&0x3|0x8);
      return v.toString(16);
    });
  }

  /* ---------------------- usage & duplicate helpers ---------------------- */

  function getUsageKey(childId:string|null){
    return childId?`${LS_STORY_USAGE}:${childId}`:LS_STORY_USAGE;
  }

  function makeStoryFingerprint(type:string,length:StoryLength,rawTopic:string){
    const cleanTopic=rawTopic.trim().toLowerCase().replace(/\s+/g," ");
    return`${type}::${length}::${cleanTopic}`;
  }

  function loadUsage(childId:string|null):StoryUsageEntry[]{
    try{
      const storageKey=getUsageKey(childId);
      const raw=localStorage.getItem(storageKey);
      if(!raw)return[];
      const arr=JSON.parse(raw);
      if(!Array.isArray(arr))return[];
      return arr.map((x:any)=>({
        key:String(x.key),
        ts:Number(x.ts)||Date.now()
      }));
    }catch{
      return[];
    }
  }

  function saveUsage(childId:string|null,entries:StoryUsageEntry[]){
    try{
      const storageKey=getUsageKey(childId);
      localStorage.setItem(storageKey,JSON.stringify(entries));
    }catch{}
  }

  function getMonthCount(entries:StoryUsageEntry[]):number{
    const now=new Date();
    const m=now.getMonth();
    const y=now.getFullYear();
    return entries.filter((e)=>{
      const d=new Date(e.ts);
      return d.getMonth()===m&&d.getFullYear()===y;
    }).length;
  }

  function recordStoryUsage(childId:string|null,fingerprint:string){
    try{
      const existing=loadUsage(childId);
      const nowTs=Date.now();
      const oneYear=365*24*60*60*1000;
      const pruned=existing.filter((e)=>nowTs-e.ts<oneYear);
      const withoutSame=pruned.filter((e)=>e.key!==fingerprint);
      withoutSame.push({key:fingerprint,ts:nowTs});
      saveUsage(childId,withoutSame);
      const monthCount=getMonthCount(withoutSame);
      setStoriesUsedThisMonth(monthCount);
    }catch{}
  }

  // Get signed URL for an image path
  async function getSignedUrl(imagePath:string):Promise<string|null>{
    try{
      console.log("[MagicStoryMaker] Getting signed URL for:",imagePath);
      const {data,error}=await supabase.storage
        .from(COVER_BUCKET)
        .createSignedUrl(imagePath,60*60);
      if(error||!data?.signedUrl){
        console.warn("[MagicStoryMaker] Failed to sign URL for",imagePath,error);
        return null;
      }
      return data.signedUrl;
    }catch(err){
      console.warn("[MagicStoryMaker] Error signing URL for",imagePath,err);
      return null;
    }
  }

  async function handleGenerate(e:FormEvent){
    e.preventDefault();
    setError(undefined);

    const trimmedTopic=topic.trim();
    const trimmedShort=shortSummary.trim();
    const trimmedLong=longSummary.trim();

    console.log("[MagicStoryMaker] handleGenerate submit",{
      type:storyType,
      length:storyLength,
      topic:trimmedTopic,
      hasShort:!!trimmedShort,
      hasLong:!!trimmedLong
    });

    if(!trimmedTopic&&!trimmedShort&&!trimmedLong){
      setError("Please type a short title or idea, or add a summary for your story.");
      return;
    }

    // 🔐 1) Duplicate detection (same type + length + topic) per child
    const fpTopic=trimmedTopic||trimmedShort||trimmedLong.split(/\s+/).slice(0,5).join(" ");
    const fingerprint=makeStoryFingerprint(storyType as string,storyLength,fpTopic);
    const usageEntries=loadUsage(childUid);
    const duplicate=usageEntries.some((u)=>u.key===fingerprint);
    if(duplicate){
      const msg="It looks like you already created this kind of story with that idea. You can read it again in your Story Library.";
      console.log("[MagicStoryMaker] duplicate fingerprint hit",fingerprint);
      setError(msg);
      toast.info("This story idea is already in your Story Library.");
      // ⛔ stay on this page; no nav so image generation is never interrupted
      return;
    }

    // 🔐 2) Monthly cap (3 per month per child profile on this browser)
    const monthCount=getMonthCount(usageEntries);
    setStoriesUsedThisMonth(monthCount);
    if(monthCount>=MONTH_LIMIT){
      const msg=`You have already created ${monthCount} stories this month for this child. To keep things special, you can make up to ${MONTH_LIMIT} new stories each month. Please enjoy your stories from the Story Library.`;
      console.log("[MagicStoryMaker] monthly limit reached for child",childUid,monthCount);
      setError(msg);
      toast.info("Monthly story limit reached for this child.");
      // ⛔ stay on this page; do not auto-nav
      return;
    }

    setStory(null);
    setImageUrl(undefined);
    setLoading(true);

    try{
      // shared key
      const storyUuid=generateUuid();
      console.log("Generated UUID for story and image:",storyUuid);

      // 1) Call ai-story (with toasts, then fallback to direct invoke)
      let storyResultRaw;
      try{
        storyResultRaw=await tpromise(
          supabase.functions.invoke<any>("ai-story",{
            body:{
              kind:currentType.label,
              topic:trimmedTopic||"Untitled story idea",
              child_uid:childUid,
              storyUuid,
              length:storyLength,
              shortSummary:trimmedShort||null,
              longSummary:trimmedLong||null
            }
          }),
          {
            loading:"Asking the story fairies for a cozy tale…",
            success:"Your story text is ready ✨",
            error:"The story spell fizzled"
          }
        );
      }catch(tpErr){
        console.error("tpromise/ai-story error:",tpErr);
        storyResultRaw=await supabase.functions.invoke<any>("ai-story",{
          body:{
            kind:currentType.label,
            topic:trimmedTopic||"Untitled story idea",
            child_uid:childUid,
            storyUuid,
            length:storyLength,
            shortSummary:trimmedShort||null,
            longSummary:trimmedLong||null
          }
        });
      }

      const outer=(storyResultRaw as any)?.data??storyResultRaw;
      const fnError=(storyResultRaw as any)?.error||(outer as any)?.error||null;
      if(fnError){
        console.error("ai-story error",fnError);
        throw new Error(fnError.message||String(fnError));
      }

      // ✅ Normalize whatever shape ai-story returns (string or object)
      let payload=normalizeStoryResult(
        outer,
        currentType.label,
        trimmedTopic||trimmedShort||"Untitled story idea"
      );

      // ensure imageId at least has storyUuid
      if(!payload.imageId){payload.imageId=storyUuid;}

      if(!payload.body||!payload.body.trim()){
        console.warn("ai-story returned empty body, using local fallback");
        const fallback=buildLocalStory(currentType.label,trimmedTopic||trimmedShort||"",storyLength);
        payload.title=fallback.title;
        payload.body=fallback.body;
        payload.moral=fallback.moral;
      }

      /* ---------- 2) Illustration from ai-image ---------- */
      if(ENABLE_STORY_IMAGE){
        setImageLoading(true);

        const imagePrompt=buildImagePrompt(currentType.label,payload.topic);
        const now=new Date();
        const currentYear=now.getFullYear().toString();
        const currentMonth=(now.getMonth()+1).toString().padStart(2,"0");
        const deterministicPath=`magic-stories/other/stories/${currentYear}/${currentMonth}/stories-${storyUuid}.png`;

        console.log("[MagicStoryMaker] Calling ai-image for story:",storyUuid);

        let imageInvokeResult:any=null;
        let imagePathFromFn:string|undefined;
        let directUrl:string|undefined;

        try{
          try{
            imageInvokeResult=await tpromise(
              supabase.functions.invoke<any>("ai-image",{
                body:{
                  prompt:imagePrompt,
                  size:"auto",
                  n:1,
                  folder:"magic-stories/other",
                  subfolder:`stories/${currentYear}/${currentMonth}`,
                  occasion:"stories",
                  storyUuid,
                  filename:`stories-${storyUuid}.png`
                }
              }),
              {
                loading:"Painting your picture...",
                success:"Illustration ready 🎨",
                error:"We could not paint this time"
              }
            );
          }catch(imageTpromiseError){
            console.error("ai-image tpromise error:",imageTpromiseError);
            imageInvokeResult=await supabase.functions.invoke<any>("ai-image",{
              body:{
                prompt:imagePrompt,
                size:"auto",
                n:1,
                folder:"magic-stories/other",
                subfolder:`stories/${currentYear}/${currentMonth}`,
                occasion:"stories",
                storyUuid,
                filename:`stories-${storyUuid}.png`
              }
            });
          }

          console.log("[MagicStoryMaker] ai-image raw result:",imageInvokeResult);

          const raw=(imageInvokeResult as any)?.data??imageInvokeResult;

          if(typeof raw==="number"){
            console.warn("ai-image returned a bare Number (likely estCostUsd). No image metadata in response.");
          }else{
            const images=Array.isArray((raw as any)?.images)
              ?(raw as any).images
              :Array.isArray(raw)
                ?raw
                :Array.isArray((raw as any)?.data?.images)
                  ?(raw as any).data.images
                  :[];

            if(!images.length){
              console.warn("[MagicStoryMaker] ai-image response had no images array",raw);
            }

            const first=images?.[0];
            if(first){
              directUrl=
                first.signedUrl||
                first.publicUrl||
                first.url||
                first.dataUrl||
                undefined;
              imagePathFromFn=
                first.path||
                first.storagePath||
                first.objectPath||
                undefined;
            }
          }
        }catch(imageError){
          console.error("MagicStoryMaker: Image generation failed:",imageError);
          toast.error("We couldn't draw a picture this time, but your story is ready.");
        }finally{
          try{
            // 1) Prefer direct URL from function
            if(directUrl){
              setImageUrl(directUrl);
              console.log("[MagicStoryMaker] Using URL from ai-image payload:",directUrl);
              toast.success("Your illustration is ready! 🎨");
            }else{
              // 2) Try signing path from function, else deterministic fallback
              const pathToSign=imagePathFromFn||deterministicPath;
              console.log("[MagicStoryMaker] Signing fallback path:",pathToSign);
              const signed=await getSignedUrl(pathToSign);
              if(signed){
                setImageUrl(signed);
                console.log("[MagicStoryMaker] Using signed URL:",signed);
                toast.success("Your illustration is ready! 🎨");
              }else{
                console.warn("MagicStoryMaker: No usable image URL or storage path; illustration unavailable.");
                toast.info("Story created, but we couldn't load the illustration this time.");
              }
            }
          }catch(signErr){
            console.warn("MagicStoryMaker: final image signing failed:",signErr);
          }
          setImageLoading(false);
        }
      }

      setStory(payload);
      recordStoryUsage(childUid,fingerprint);
    }catch(err){
      console.error("MagicStoryMaker handleGenerate error",err);

      // ---------- OFFLINE / ERROR FALLBACK ----------
      const fallbackTopic=trimmedTopic||trimmedShort||trimmedLong||"a kind child";
      const fallback=buildLocalStory(currentType.label,fallbackTopic,storyLength);
      const fallbackUuid=generateUuid();

      try{
        const prebuiltText=[
          `Title: ${fallback.title}`,
          "",
          fallback.body,
          fallback.moral??""
        ].join("\n");

        const {data:saveData,error:saveError}=await supabase.functions.invoke<any>("ai-story",{
          body:{
            kind:currentType.label,
            topic:fallbackTopic,
            child_uid:childUid,
            prebuiltContent:prebuiltText,
            length:storyLength,
            storyUuid:fallbackUuid,
            imageId:fallbackUuid,
            shortSummary:trimmedShort||null,
            longSummary:trimmedLong||null
          }
        });

        if(saveError){
          throw saveError;
        }

        const outer=(saveData as any)?.data??saveData;
        const stored=normalizeStoryResult(
          outer,
          currentType.label,
          fallbackTopic
        );

        const payload:StoryPayload={
          title:stored.title||fallback.title,
          body:stored.body||fallback.body,
          type:stored.type||currentType.label,
          topic:stored.topic||fallbackTopic,
          moral:stored.moral??fallback.moral,
          storagePath:(outer as any)?.storagePath??stored.storagePath??null,
          signedUrl:(outer as any)?.signedUrl??stored.signedUrl??null,
          imageId:stored.imageId||fallbackUuid
        };

        setStory(payload);
        toast.success("We saved your offline story into the Story Library.");
      }catch(saveErr){
        console.warn("MagicStoryMaker: fallback story could not be saved",saveErr);
        setStory({
          title:fallback.title,
          body:fallback.body,
          type:currentType.label,
          topic:fallbackTopic,
          moral:fallback.moral,
          storagePath:null,
          signedUrl:null,
          imageId:fallbackUuid
        });
        toast.info("You can read this story now, but it might not appear in the Story Library.");
      }

      recordStoryUsage(childUid,fingerprint);
      setError("We used our offline story magic to spin a cozy tale because the cloud spell was a bit sleepy.");
      setImageLoading(false);
    }finally{
      setLoading(false);
    }
  }

  function stopAllVoice(){
    guidedModeRef.current=false;
    setGuided(false);
    try{
      if(typeof window!=="undefined"&&"speechSynthesis"in window){
        window.speechSynthesis.cancel();
      }
    }catch{}
    try{
      recognitionRef.current?.stop?.();
    }catch{}
    recognitionRef.current=null;
    setIsListening(false);
  }

  async function speak(text:string){
    if(typeof window==="undefined"||!("speechSynthesis"in window)){return;}
    return await new Promise<void>((resolve)=>{
      try{
        const synth=window.speechSynthesis;
        synth.cancel();
        const utter=new SpeechSynthesisUtterance(text);
        utter.rate=1;
        utter.pitch=1;
        utter.onend=()=>resolve();
        utter.onerror=()=>resolve();
        synth.speak(utter);
      }catch{
        resolve();
      }
    });
  }

  function startDictation(field:SpeechField){
    if(typeof window==="undefined"){return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SR){
      toast.error("Your device does not support the voice helper yet.");
      return;
    }

    try{
      recognitionRef.current?.stop?.();
    }catch{}

    const rec=new SR();
    rec.lang="en-US";
    rec.interimResults=true;
    rec.continuous=false;

    currentFieldRef.current=field;

    if(field==="topic"){
      baseTopicRef.current=topic.trim();
    }

    rec.onstart=()=>{
      setIsListening(true);
    };

    rec.onresult=(event:any)=>{
      let finalBase=baseTopicRef.current||"";
      let liveInterim="";
      for(let i=0;i<event.results.length;i++){
        const res=event.results[i];
        const transcript=String(res[0]?.transcript||"").trim();
        if(!transcript)continue;
        if(res.isFinal){
          finalBase=(finalBase+" "+transcript).replace(/\s+/g," ").trim();
          baseTopicRef.current=finalBase;
        }else{
          liveInterim=(liveInterim+" "+transcript).replace(/\s+/g," ").trim();
        }
      }
      const merged=(finalBase+" "+liveInterim).replace(/\s+/g," ").trim();
      setTopic(merged);
    };

    rec.onerror=()=>{
      setIsListening(false);
    };

    rec.onend=()=>{
      setIsListening(false);
      recognitionRef.current=null;
      if(guidedModeRef.current){
        void advanceGuidedFlow(field);
      }
    };

    recognitionRef.current=rec;
    rec.start();
  }

  async function advanceGuidedFlow(last:SpeechField){
    if(last==="topic"){
      if(!topic.trim()){
        await speak("I did not quite hear that. You can try again, or type your idea instead.");
        guidedModeRef.current=false;
        setGuided(false);
        return;
      }
      await speak("That sounds like a wonderful story idea! When you are ready, tap Generate Story to see your cozy tale.");
      guidedModeRef.current=false;
      setGuided(false);
    }else{
      guidedModeRef.current=false;
      setGuided(false);
    }
  }

  async function handleGuided(){
    if(typeof window==="undefined"){
      toast.error("Voice helper only works in the browser.");
      return;
    }
    const hasSynth=!!(window as any).speechSynthesis;
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!hasSynth||!SR){
      toast.error("This device does not support the voice helper yet.");
      return;
    }

    stopAllVoice();
    guidedModeRef.current=true;
    setGuided(true);
    baseTopicRef.current="";
    setTopic("");

    const name=childName||"friend";
    await speak(`Hi ${name}! I can help you think of a magic story.`);
    await speak("First, tell me what your story could be about. For example, you can say, a brave ladybug who finds a lost key.");
    startDictation("topic");
  }

  const micLabel=guided
    ?(isListening?"Listening…":"Guided voice on")
    :("Guide me 🎙️");

  const micIcon=guided
    ?(isListening?<Mic className="h-4 w-4" />:<Headphones className="h-4 w-4" />)
    :<Mic className="h-4 w-4" />;

  return(
    <div className="min-h-[calc(100vh-4rem)] flex items-stretch justify-center px-2 sm:px-4 py-4 sm:py-6">
      <div className="w-full max-w-5xl bg-slate-950/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-4 sm:p-7 md:p-8 flex flex-col gap-6 relative">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-pink-500 via-violet-500 to-sky-500 flex items-center justify-center shadow-xl shadow-pink-500/40">
              <Sparkles className="h-7 w-7 text-white drop-shadow" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-sky-300 via-emerald-300 to-amber-300 bg-clip-text text-transparent tracking-tight">
                Magic Story Maker
              </h1>
              <p className="text-sm sm:text-base text-white/75 mt-1">
                Pick a story style, choose how long it should be, and share your own summary. We&apos;ll redesign it as a cozy tale with a matching picture.
              </p>
            </div>
          </div>
        </header>

        {/* Form + Image column */}
        <form
          onSubmit={handleGenerate}
          className="grid gap-5 md:gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start"
        >
          {/* Controls */}
          <div className="space-y-4 md:space-y-5">
            <div>
              <label className="block text-sm font-semibold text-white mb-1.5">
                What kind of story would you like?
              </label>
              <div className="relative">
                <select
                  value={storyType}
                  onChange={(e)=>setStoryType(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-slate-900/80 text-white px-4 py-2.5 pr-10 text-sm sm:text-base shadow-md shadow-black/40 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                >
                  {STORY_TYPES.map((opt)=>(
                    <option
                      key={opt.value}
                      value={opt.value}
                      className="bg-slate-900 text-white"
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Wand2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-sky-300 pointer-events-none" />
              </div>
              <p className="mt-1 text-xs text-sky-200">
                {currentType.hint}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-1.5">
                How long should your story be?
              </label>
              <div className="relative">
                <select
                  value={storyLength}
                  onChange={(e)=>setStoryLength(e.target.value as StoryLength)}
                  className="w-full rounded-2xl border border-white/15 bg-slate-900/80 text-white px-4 py-2.5 pr-10 text-sm sm:text-base shadow-md shadow-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                >
                  {STORY_LENGTHS.map((opt)=>(
                    <option
                      key={opt.value}
                      value={opt.value}
                      className="bg-slate-900 text-white"
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-emerald-200">
                {currentLength.hint}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-1">
                Story title or tiny idea{" "}
                <span className="font-normal text-sky-200">
                  (e.g., &quot;Forest Wishing Well&quot; or &quot;Sharing Wishes&quot;)
                </span>
              </label>
              <input
                value={topic}
                onChange={(e)=>setTopic(e.target.value)}
                maxLength={80}
                placeholder="e.g., The Wishing Well in Whispering Woods"
                className="w-full rounded-2xl border border-white/15 bg-slate-900 text-white px-4 py-2.5 text-sm sm:text-base shadow-md shadow-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 placeholder:text-slate-400"
              />
              <p className="mt-1 text-xs text-emerald-200">
                This becomes the high-level idea and is used to file your story in the library.
              </p>
            </div>

            {/* Short summary */}
            <div className="mt-3">
              <label className="block text-sm font-semibold text-white mb-1">
                Short summary (optional)
              </label>
              <textarea
                value={shortSummary}
                onChange={(e)=>setShortSummary(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="e.g., Three animal friends find a magical wishing well, make selfish wishes that backfire, then learn to make one selfless wish that helps their whole forest."
                className="w-full rounded-2xl border border-white/15 bg-slate-900 text-white px-4 py-2.5 text-sm shadow-md shadow-black/40 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 placeholder:text-slate-400"
              />
              <p className="mt-1 text-xs text-sky-200">
                2–3 lines is perfect. We keep your idea and moral, and just polish it into bedtime language.
              </p>
            </div>

            {/* Long outline */}
            <div className="mt-3">
              <label className="block text-sm font-semibold text-white mb-1">
                Full story idea (optional)
              </label>
              <textarea
                value={longSummary}
                onChange={(e)=>setLongSummary(e.target.value)}
                rows={6}
                placeholder="Paste your full scene-by-scene outline here. We follow this structure closely, just smoothing language."
                className="w-full rounded-2xl border border-white/15 bg-slate-900 text-white px-4 py-2.5 text-sm shadow-md shadow-black/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 placeholder:text-slate-400"
              />
              <p className="mt-1 text-xs text-emerald-200">
                If you give a detailed outline, we treat it as the blueprint: same characters, scenes, and lesson—only the wording becomes cozier.
              </p>
            </div>

            {error&&(
              <div className="rounded-2xl border border-rose-500/60 bg-rose-900/40 px-3 py-2 text-xs sm:text-sm text-rose-50 shadow shadow-rose-900/40">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={loading||storiesLeft<=0}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-emerald-400 to-amber-400 px-6 py-3 text-base sm:text-lg font-semibold text-slate-950 shadow-xl shadow-amber-400/40 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-sky-300/70 transition-transform"
                >
                  {loading?(
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Weaving story & picture...
                    </>
                  ):(
                    <>
                      <BookOpen className="h-5 w-5" />
                      Generate Story!
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={()=>guided?stopAllVoice():void handleGuided()}
                  disabled={loading}
                  className={[
                    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-md shadow-black/40",
                    "border",
                    guided
                      ?"bg-emerald-600 text-white border-emerald-400"
                      :"bg-slate-900/80 text-white border-white/20 hover:bg-slate-800",
                    loading?"opacity-60 cursor-not-allowed":""
                  ].join(" ")}
                >
                  {guided?(
                    <>
                      {micIcon}
                      {micLabel}
                      <MicOff className="h-3.5 w-3.5 opacity-80" />
                    </>
                  ):(
                    <>
                      {micIcon}
                      {micLabel}
                    </>
                  )}
                </button>
              </div>

              {/* Monthly counter */}
              <p className="text-[11px] sm:text-xs text-sky-100/80">
                {storiesLeft>0
                  ?`Story builds left this month for this child: ${storiesLeft} of ${MONTH_LIMIT}.`
                  :`You have used your ${MONTH_LIMIT} story builds for this month for this child. Please enjoy your Story Library until next month.`}
              </p>
            </div>

            <p className="text-[11px] sm:text-xs text-white/60">
              Stories are kept gentle, happy, and safe for children. For moral and Panchatantra stories, we always add a clear lesson at the end. Short and medium stories are quicker reads; long stories feel like a big, cozy chapter.
            </p>
          </div>

          {/* Image panel */}
          <div className="mt-4 md:mt-0">
            <div className="rounded-3xl border-2 border-dashed border-sky-500/40 bg-slate-900/70 shadow-inner shadow-black/60 p-3 sm:p-4 flex flex-col items-center justify-center min-h-[220px]">
              {imageLoading?(
                <div className="flex flex-col items-center text-center px-2 py-4">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-sky-400 via-emerald-300 to-amber-300 flex items-center justify-center mb-2 shadow-xl shadow-sky-500/40">
                    <Loader2 className="h-9 w-9 text-white drop-shadow animate-spin" />
                  </div>
                  <p className="text-sm sm:text-base font-medium text-white">
                    Painting your picture...
                  </p>
                  <p className="mt-1 text-[11px] sm:text-xs text-sky-100/80">
                    AI is creating a soft, friendly cartoon for your story
                  </p>
                </div>
              ):imageUrl?(
                <div className="w-full">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sky-100 text-sm">
                      <ImageIcon className="h-4 w-4" />
                      <span>Magic illustration</span>
                    </div>
                  </div>
                  <div className="w-full aspect-square rounded-2xl overflow-hidden border border-sky-400/50 bg-slate-950 shadow-lg shadow-black/60">
                    <img
                      src={imageUrl}
                      alt="Colorful illustration from your story"
                      className="h-full w-full object-cover"
                      onError={(ev)=>{
                        console.error("MagicStoryMaker: Image failed to load in UI:",imageUrl);
                        (ev.currentTarget as HTMLImageElement).style.display="none";
                        toast.error("Could not display the illustration");
                      }}
                      onLoad={()=>{
                        console.log("MagicStoryMaker: Image loaded successfully in UI");
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] sm:text-xs text-sky-100/80 text-center">
                    A colorful, child-friendly scene inspired by your story.
                  </p>
                </div>
              ):story?(
                <div className="flex flex-col items-center text-center px-2 py-4">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 flex items-center justify-center mb-2 shadow-xl shadow-amber-500/40">
                    <ImageIcon className="h-9 w-9 text-white drop-shadow" />
                  </div>
                  <p className="text-sm sm:text-base font-medium text-white">
                    Illustration not available
                  </p>
                  <p className="mt-1 text-[11px] sm:text-xs text-sky-100/80">
                    Your story is ready, but we couldn&apos;t generate an illustration this time.
                  </p>
                </div>
              ):(
                <div className="flex flex-col items-center text-center px-2 py-4">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-sky-400 via-emerald-300 to-amber-300 flex items-center justify-center mb-2 shadow-xl shadow-sky-500/40">
                    <ImageIcon className="h-9 w-9 text-white drop-shadow" />
                  </div>
                  <p className="text-sm sm:text-base font-medium text-white">
                    Your picture will appear here
                  </p>
                  <p className="mt-1 text-[11px] sm:text-xs text-sky-100/80">
                    We&apos;ll draw a soft, friendly cartoon of a key moment from your tale.
                  </p>
                </div>
              )}
            </div>
          </div>
        </form>

        {loading&&(
          <div className="absolute inset-0 rounded-3xl bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
            <p className="text-sky-100 text-sm sm:text-base font-medium">
              Weaving your story and painting your picture...
            </p>
          </div>
        )}

        {/* Story display */}
        <section className="mt-1">
          <div className="rounded-3xl border border-amber-400/40 bg-slate-900/80 shadow-xl shadow-black/60 px-4 sm:px-6 py-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg sm:text-xl font-semibold text-amber-100">
                Your Storybook Page
              </h2>
            </div>

            {story?(
              <>
                <div className='space-y-2 font-["Short_Stack","Comic Sans MS",cursive] text-[14px] sm:text-[15px] leading-relaxed text-slate-50 max-h-[420px] sm:max-h-[520px] overflow-y-auto pr-1'>
                  <h3 className="text-base sm:text-lg font-bold text-sky-200 mb-1">
                    {story.title}
                  </h3>
                  <p className="whitespace-pre-line">
                    {story.body}
                  </p>
                  {story.moral&&(
                    <p className="mt-3 font-semibold text-amber-200">
                      {story.moral}
                    </p>
                  )}
                  {story.storagePath&&(
                    <p className="mt-3 text-[11px] sm:text-xs text-amber-200/80">
                      Saved to your Story Library so you can read the full story again later.
                    </p>
                  )}
                </div>

                {story.storagePath&&(
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <p className="text-[11px] sm:text-xs text-slate-200/80">
                      Want to browse your other stories too?
                    </p>
                    <button
                      type="button"
                      onClick={()=>nav("/child/story-library")}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-400 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-950 shadow-md shadow-amber-500/40 hover:scale-[1.02] active:scale-100 transition-transform"
                    >
                      <BookOpen className="h-4 w-4" />
                      Open Story Library
                    </button>
                  </div>
                )}
              </>
            ):(
              <p className='font-["Short_Stack","Comic Sans MS",cursive] text-[14px] sm:text-[15px] text-slate-100'>
                Your story will appear here. Choose a story type, pick Short, Medium, or Long, add a title or idea and (optionally) your own summary, then tap{" "}
                <span className="font-semibold">Generate Story!</span> to begin your cozy adventure.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- Normalizer for ai-story shapes ---------------- */

function normalizeStoryResult(raw:any,kindLabel:string,topicFallback:string):StoryPayload{
  // raw may be:
  // - {story:{...},storagePath,...}
  // - {title,body,...}
  // - "plain story text"
  const container=raw&&typeof raw==="object"&&"story"in raw?raw:raw;
  const storyObj=(container as any)?.story??container;

  let body="";
  if(typeof storyObj==="string"){
    body=storyObj;
  }else if(typeof storyObj?.body==="string"&&storyObj.body.trim()){
    body=storyObj.body;
  }else if(typeof storyObj?.text==="string"&&storyObj.text.trim()){
    body=storyObj.text;
  }

  const title=typeof storyObj?.title==="string"&&storyObj.title.trim()
    ?storyObj.title
    :"Your Magic Story";

  const topic=typeof storyObj?.topic==="string"&&storyObj.topic.trim()
    ?storyObj.topic
    :topicFallback||"Untitled story idea";

  const moral=typeof storyObj?.moral==="string"&&storyObj.moral.trim()
    ?storyObj.moral
    :undefined;

  const storagePath=(container as any)?.storagePath??(storyObj as any)?.storagePath??null;
  const signedUrl=(container as any)?.signedUrl??(storyObj as any)?.signedUrl??null;
  const imageId=(storyObj as any)?.imageId??(container as any)?.imageId;

  return{
    title,
    body,
    type:(storyObj as any)?.type||kindLabel,
    topic,
    moral,
    storagePath,
    signedUrl,
    imageId
  };
}

/* ---------------- Local fallback story builder ---------------- */

function buildLocalStory(kind:string,topic:string,length:StoryLength):LocalStory{
  const rawTopic=(topic||"").trim()||"a kind child";

  const sentenceEndIndex=Math.min(
    ...[".","!","?"].map((ch)=>{
      const idx=rawTopic.indexOf(ch);
      return idx===-1?Number.POSITIVE_INFINITY:idx;
    })
  );

  const baseForSubject=sentenceEndIndex===Number.POSITIVE_INFINITY
    ?rawTopic
    :rawTopic.slice(0,sentenceEndIndex);

  const subjectWords=baseForSubject
    .replace(/["“”]+/g,"")
    .split(/\s+/)
    .slice(0,6)
    .join(" ")
    .trim();

  const subject=subjectWords||"a kind child";

  const hasArticle=/^(a|an|the)\s/i.test(subject);
  const looksNamed=/^[A-Z]/.test(subject.charAt(0));
  const who=hasArticle||looksNamed?subject:`a ${subject}`;

  const titleSubject=subject.charAt(0).toUpperCase()+subject.slice(1);
  const baseTitle=`The Long Tale Of ${titleSubject}`.replace(/\s+/g," ");

  const isMoral=/moral/i.test(kind);
  const isPanch=/panchatantra/i.test(kind);
  const moralNeeded=isMoral||isPanch;

  const p1=`On a soft, bright morning, there was ${who} who loved to notice the tiny, magical details hidden inside ordinary days. \
They watched how sunlight slid across the floor like golden paint, listened to the gentle creaks of the house waking up, and \
smiled when they heard the first chirps of birds outside the window. To most people it was just another day, but to ${who} it \
already felt like a quiet adventure waiting to begin.`;

  const p2=`After breakfast, they padded through the house and out into the yard, feeling the cool floor and then the warm ground \
beneath their feet. The world was busy in its own small ways: ants marched in a careful line, a cloud drifted lazily across the \
sky, and a butterfly fluttered past as if it had an important secret to deliver. ${who} waved at it anyway, just in case.`;

  const p3=`But then, a little problem appeared. Something special had gone missing, or someone they cared about looked a bit sad \
and far away. Maybe it was a favorite toy, a drawing they had worked hard on, or even just a feeling that a promise from yesterday \
was becoming hard to keep today. The house felt slightly louder, the air felt slightly heavier, and for a moment ${who} wondered \
if the day was going to turn wobbly and difficult.`;

  const p4=`Instead of hiding from the problem, they took a long, slow breath. They remembered all the tiny times they had helped \
before: sharing a snack, offering the last sticker, or sitting close to a friend who didn't want to talk yet but also didn't want \
to be alone. One by one, these memories lined up in their mind like friendly fireflies, each one carrying the same message: you \
can try, and trying kindly always matters.`;

  const p5=`So ${who} started with the simplest thing. They asked gentle questions instead of sharp ones. They checked under cushions, \
inside boxes, and behind curtains for the missing object. They drew a funny picture to cheer someone up, or quietly sat beside a \
friend until the words were ready to come. Every small step felt like placing another soft brick in a bridge that would carry \
everyone from worry back to comfort.`;

  const p6=`Hours passed in this careful, patient way. Little by little, the knot of worry in their chest began to loosen. Maybe the \
lost thing was found in a silly place, like under the bed or tucked into a shoe. Maybe the sad friend smiled and decided to try \
again. Maybe the promise from yesterday was kept in a new, creative way that felt even more thoughtful than the original plan.`;

  const p7=`By the time the sky turned orange and pink, the whole day felt longer and richer than it had that morning. ${who} was \
tired in the best possible way: the sleepy, satisfied kind of tired that comes from doing something good and kind and brave. The \
problem that had seemed so large at lunchtime now looked smaller and softer, wrapped in warm memories of helping hands and shared \
smiles.`;

  const p8=`That night, snuggled under their blanket with the sounds of the house settling around them, ${who} thought about \
everything that had happened. The stars outside blinked like tiny friendly eyes, and the moon hung in the sky like a gentle night \
light. As their eyes grew heavy, they knew that tomorrow might bring new questions and new little problems. But they also knew \
something even stronger: with patience, kindness, and a brave heart, they could help turn almost any wobbly day into a long, cozy \
story with a bright, hopeful ending.`;

  const all=[p1,p2,p3,p4,p5,p6,p7,p8];

  let body:string;
  if(length==="short"){
    body=all.slice(0,4).join("\n\n");
  }else if(length==="medium"){
    body=all.slice(0,6).join("\n\n");
  }else{
    body=all.join("\n\n");
  }

  let moral:string|undefined;
  if(moralNeeded){
    moral="Moral: Gentle, patient kindness can slowly turn a worrying day into a cozy story with a bright, hopeful ending.";
  }

  return{title:baseTitle,body,moral};
}

/* ---------------- Image prompt helper ---------------- */

function buildImagePrompt(kind:string,topic:string){
  const cleanTopic=topic.trim()||"a kind child on a sunny day";
  return`Cute, colorful cartoon illustration of ${cleanTopic} in a warm, child-friendly scene from a ${kind} for kids, soft rounded shapes, pastel colors, happy faces, no scary elements, safe for young children.`;
}
