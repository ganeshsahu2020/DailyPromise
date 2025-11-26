import React,{useEffect,useMemo,useRef,useState}from "react";
import TargetEvidenceSubmission,{type EvidenceItem}from "./TargetEvidenceSubmission";
import QuickCompleteModal from "./QuickCompleteModal";

type CoachPlan={
  greeting:string;
  mood:"cheerful"|"calm"|"playful"|"adventurous";
  estimated_minutes:number;
  materials:string[];
  steps:{title:string;tip?:string;}[];
  encouragements:string[];
};

type Props={
  open:boolean;
  onClose:()=>void;
  childName?:string;
  target:{
    id:string;
    title:string;
    description?:string|null;
    category?:string;
    difficulty?:string|null;
    points_award?:number;
  };
  onMarkDone?:(evidence?:EvidenceItem[])=>void;
};

export default function TargetCoachPanel({
  open,
  onClose,
  childName="Adventure Buddy",
  target,
  onMarkDone,
}:Props){
  const [loading,setLoading]=useState(false);
  const [plan,setPlan]=useState<CoachPlan|null>(null);
  const [minutesLeft,setMinutesLeft]=useState<number|null>(null);
  const [stepIndex,setStepIndex]=useState(0);
  const [speaking,setSpeaking]=useState(false);
  const [celebrations,setCelebrations]=useState<string[]>([]);
  const [userQuestion,setUserQuestion]=useState("");
  const [aiResponse,setAiResponse]=useState("");
  const [isThinking,setIsThinking]=useState(false);
  const [showEvidenceSubmission,setShowEvidenceSubmission]=useState(false);
  const [showQuickComplete,setShowQuickComplete]=useState(false);
  const [showCompletionCelebration,setShowCompletionCelebration]=useState(false);
  const synthRef=useRef<SpeechSynthesis|null>(null);
  const aiResponseRef=useRef<HTMLDivElement>(null);
  const celebrationTimeoutRef=useRef<number|null>(null);

  // visual guidance for the Adventure Guide
  const [guideImageUrl,setGuideImageUrl]=useState<string|null>(null);
  const [guideImageIdea,setGuideImageIdea]=useState<string|null>(null);

  // default visual description so the gradient card always has text
  const defaultGuideIdea=useMemo(
    ()=>`Bright, colourful illustration of ${childName} happily working on "${target.title}", with friendly icons showing the main steps.`,
    [childName,target.title]
  );

  const triggerCelebration=(message:string)=>{
    setCelebrations((prev)=>[...prev,message]);
    setTimeout(()=>{
      setCelebrations((prev)=>prev.slice(1));
    },3000);
  };

  useEffect(()=>{
    if(typeof window!=="undefined"&&"speechSynthesis"in window){
      synthRef.current=window.speechSynthesis;
    }
  },[]);

  function say(text:string){
    if(!synthRef.current)return;
    try{
      setSpeaking(true);
      const u=new SpeechSynthesisUtterance(text);
      u.rate=1.1;
      u.pitch=1.2;
      u.onend=()=>setSpeaking(false);
      synthRef.current.cancel();
      synthRef.current.speak(u);
    }catch{}
  }

  // when the panel opens, reset guide visuals to the default gradient text
  useEffect(()=>{
    if(open){
      setGuideImageUrl(null);
      setGuideImageIdea(defaultGuideIdea);
      setAiResponse("");
      setUserQuestion("");
      setIsThinking(false);
    }
  },[open,defaultGuideIdea]);

  // whenever we get a new answer, auto-scroll and speak it
  useEffect(()=>{
    if(!aiResponse)return;
    const id=setTimeout(()=>{
      aiResponseRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"});
    },60);
    say(aiResponse);
    return()=>{
      clearTimeout(id);
    };
  },[aiResponse]);

  /* ---------------- Local fallback guidance builder --------------- */

  const buildLocalGuidance=(question:string)=>{
    const taskSpecificGuidance:Record<string,string[]>={
      dusting:[
        "🧹 DUSTING PRO-TIP: Start high and work down! Dust shelves first, then furniture, then floors - gravity is your friend!",
        "🎯 SMART DUSTING: Use a microfiber cloth - it grabs dust like magic! Dampen it slightly for extra dust-catching power!",
        "🚀 EFFICIENT DUSTING: Work in sections! Complete one area fully before moving to the next - feel the progress!",
        "🎪 FUN DUSTING: Pretend you're an archaeologist discovering ancient artifacts! Each dust bunny is a hidden treasure!",
        "⚡ QUICK DUSTING: Set a 2-minute timer for each room! Race against the clock like a superhero!",
        "🔍 THOROUGH DUSTING: Don't forget hidden spots! Picture frames, lamp bases, and electronics love attention too!",
      ],
      cleaning:[
        "🌟 CLEANING STRATEGY: Work top to bottom, left to right! It's like reading a book of clean!",
        "🎵 CLEANING DANCE: Put on upbeat music and clean to the rhythm! Each song = one area completed!",
        "🧼 PRODUCT POWER: Remember - a little cleaner goes a long way! You're the master of suds!",
        "🏆 CLEANING CHALLENGE: Can you beat your personal best? Set a timer and go for the gold!",
      ],
      organizing:[
        "📦 ORGANIZING MAGIC: Sort items into three piles - keep, donate, toss! You're the organization wizard!",
        "🎯 ZONE ORGANIZING: Work on one small zone at a time! Complete victory in each area feels amazing!",
        "🌈 COLOR CODING: Arrange items by color - it makes everything look magical and is super satisfying!",
        "📝 LABEL LOVE: Use fun labels or drawings to mark where things belong - you're creating a treasure map!",
      ],
      homework:[
        "📚 STUDY STRATEGY: Use the Pomodoro method! 25 minutes focus, 5 minutes dance break!",
        "🎯 TACKLE TOUGH STUFF: Do the hardest work first when your brain is freshest! You've got this!",
        "✏️ ACTIVE LEARNING: Teach what you learned to a stuffed animal - it helps lock in the knowledge!",
        "🕒 TIME MANAGEMENT: Break big assignments into tiny steps - each one is a mini-victory!",
      ],
      general:[
        "🚀 Tiny steps are still steps forward. You're doing great!",
      ],
    };

    const lowerQuestion=question.toLowerCase();
    const lowerTarget=target.title.toLowerCase();

    let taskType:"dusting"|"cleaning"|"organizing"|"homework"|"general"="general";
    if(lowerQuestion.includes("dust")||lowerTarget.includes("dust"))taskType="dusting";
    else if(lowerQuestion.includes("clean")||lowerTarget.includes("clean"))taskType="cleaning";
    else if(lowerQuestion.includes("organiz")||lowerTarget.includes("organiz"))taskType="organizing";
    else if(lowerQuestion.includes("homework")||lowerQuestion.includes("study")||lowerTarget.includes("homework"))taskType="homework";

    const specificResponses:Record<string,string>={
      help:`🦸‍♂️ SUPERHERO ASSIST: For ${target.title}, here's my battle plan: ${taskSpecificGuidance[taskType]?.[0]||"Break it into tiny missions and celebrate each win!"}`,
      bored:`🎭 ADVENTURE MODE: Let's make ${target.title} FUN! ${taskSpecificGuidance[taskType]?.[3]||"Add a silly story - you're on a secret mission to save the kingdom!"}`,
      tired:`🔋 ENERGY BOOST: For ${target.title}, try this: ${taskSpecificGuidance[taskType]?.[4]||"Set a 2-minute timer and see how much you can accomplish! You'll be amazed!"}`,
      hard:`💪 GROWTH MINDSET: ${target.title} seems tough, but you're tougher! ${taskSpecificGuidance[taskType]?.[1]||"Break it into the smallest possible steps - you can do anything step by step!"}`,
      stuck:`🔄 PROBLEM SOLVER: When stuck on ${target.title}, try: ${taskSpecificGuidance[taskType]?.[5]||"Start with the easiest part first - momentum is magical!"}`,
      how:`🎯 COMPLETE GUIDE: To master ${target.title}: ${taskSpecificGuidance[taskType]?.join(" ")||"Start with a plan, work in small sections, and celebrate progress! You've got this!"}`,
    };

    let response;
    if(lowerQuestion.includes("how"))response=specificResponses.how;
    else if(lowerQuestion.includes("help"))response=specificResponses.help;
    else if(lowerQuestion.includes("bored"))response=specificResponses.bored;
    else if(lowerQuestion.includes("tired"))response=specificResponses.tired;
    else if(lowerQuestion.includes("hard"))response=specificResponses.hard;
    else if(lowerQuestion.includes("stuck"))response=specificResponses.stuck;
    else if(question.trim()){
      const list=taskSpecificGuidance[taskType]||taskSpecificGuidance.general;
      const randomTip=list[Math.floor(Math.random()*list.length)];
      response=`🤖 AI ADVENTURE GUIDE: Great question about ${target.title}! ${randomTip} Remember, you're capable of amazing things!`;
    }else{
      const list=taskSpecificGuidance[taskType]||taskSpecificGuidance.general;
      const randomTip=list[Math.floor(Math.random()*list.length)];
      response=randomTip;
    }

    const defaultIdea=`Bright, colourful illustration of ${childName} happily working on "${target.title}", with friendly icons showing the main steps.`;
    const imageIdeas:Record<string,string>={
      dusting:`Cartoon scene of a kid superhero dusting high shelves and furniture from top to bottom, sparkles floating in the air.`,
      cleaning:`Fun image of a kid with headphones cleaning a room, music notes around, one side messy and the other side shiny.`,
      organizing:`Cute room split into “before” and “after”, boxes labelled KEEP/DONATE/TOSS, child proudly pointing at the organized shelves.`,
      homework:`Cozy desk setup with books, timer, and a kid explaining homework to a plush toy, speech bubbles showing ideas.`,
      general:defaultIdea,
    };

    const imageIdea=imageIdeas[taskType]||defaultIdea;
    return{response,imageIdea};
  };

  /* ----------------- Adventure Guide AI handler ------------------ */

  const getAIGuidance=async(question:string="")=>{
    setIsThinking(true);
    setAiResponse("");
    setGuideImageUrl(null);
    setGuideImageIdea(null);

    // small delay so the “thinking” state is visible
    await new Promise((r)=>setTimeout(r,400));

    // Try Edge Function "ai-target-coach" in guide mode
    try{
      // NOTE: This still uses supabase.functions in your app via the global client,
      // but the coach panel itself no longer writes to Storage/DB.
      const {supabase}=await import("@/lib/supabase");
      const {data,error}=await supabase.functions.invoke("ai-target-coach",{
        body:{
          mode:"guide",
          childName,
          title:target.title,
          description:target.description,
          category:target.category,
          difficulty:target.difficulty??"Easy",
          question,
        },
      });

      console.log("[TargetCoachPanel] guide result",{data,error});

      if(!error&&data&&(data as any).answer){
        const answer=(data as any).answer as string;
        const imageIdea=(data as any).image_idea as string|undefined;
        const imageUrl=(data as any).image_url as string|undefined;

        if(imageUrl)setGuideImageUrl(imageUrl);
        setGuideImageIdea(imageIdea||defaultGuideIdea);
        setAiResponse(answer);
        setIsThinking(false);
        return;
      }
    }catch(e){
      console.error("[TargetCoachPanel] ai-target-coach guide error:",e);
    }finally{
      setIsThinking(false);
    }

    // fallback to local “AI-style” guidance if function missing/fails
    const local=buildLocalGuidance(question);
    setGuideImageIdea(local.imageIdea||defaultGuideIdea);
    setAiResponse(local.response);
  };

  async function fetchPlan(){
    setLoading(true);
    setCelebrations(["✨ Preparing your epic adventure..."]);
    try{
      const {supabase}=await import("@/lib/supabase");
      const {data,error}=await supabase.functions.invoke<CoachPlan>("ai-target-coach",{
        body:{
          childName,
          title:target.title,
          description:target.description,
          category:target.category,
          difficulty:target.difficulty??"Easy",
          minutes_hint:10,
          mode:"plan",
        },
      });

      let p:CoachPlan;
      if(!error&&data){
        p=data;
        triggerCelebration("🎯 Adventure Plan Loaded!");
      }else{
        p={
          greeting:`🦸‍♂️ HEY ${childName.toUpperCase()}! Ready to become a ${target.title} SUPERHERO? Let's rock this! 🎸`,
          mood:"adventurous",
          estimated_minutes:12,
          materials:[
            "Superhero cape (imaginary works!) 🦸",
            "Magic timer that makes time fly ⏰",
            "Giggle juice (water + imagination) 🥤",
            "Dance moves for energy boosts 💃",
          ],
          steps:[
            {title:"🦸‍♂️ SUPERHERO STANCE",tip:"Stand like a superhero! Hands on hips, chest out - feel the POWER flowing through you!"},
            {title:"🔍 MISSION SCAN",tip:"Zoom in like a detective! What's the most fun part to start with? Follow the fun!"},
            {title:"⚡ LIGHTNING ROUND",tip:"3 MINUTES OF PURE AWESOMENESS! Imagine you're the fastest hero in the universe! GO!"},
            {title:"🎪 CIRCUS INTERMISSION",tip:"Time for a silly break! Do 5 star jumps while making animal noises!"},
            {title:"🏁 GRAND FINALE",tip:"LAST 2 MINUTES! Imagine crowds cheering! You're winning the championship!"},
            {title:"🎊 VICTORY LAP",tip:"You did it! Do your signature victory dance!"},
          ],
          encouragements:[
            "HOLY GUACAMOLE! 🤯 You're absolutely CRUSHING it!",
            "WOWZA! 🌟 Your talent is shining brighter than a supernova!",
            "UNSTOPPABLE! 🚀 You're moving at LUDICROUS SPEED!",
            "LEGENDARY! 🏆 Future generations will tell stories about this!",
            "PHENOMENAL! ✨ You've achieved maximum coolness level!",
          ],
        };
        triggerCelebration("🎨 Custom Adventure Crafted!");
      }

      setPlan(p);
      setMinutesLeft(p.estimated_minutes);
      say(p.greeting);
      triggerCelebration("🚀 Adventure Time!");
    }catch(e){
      console.error("[TargetCoachPanel] plan error:",e);
      setPlan({
        greeting:`🌈 Hey ${childName}! Let's turn ${target.title} into the most EPIC adventure ever!`,
        mood:"playful",
        estimated_minutes:8,
        materials:["Imagination goggles","Fun fuel","Silly hat"],
        steps:[
          {title:"🪄 Magic Activation",tip:"Wave your wand and say 'Bippity Boppity FUN!'"},
          {title:"🏃‍♂️ Turbo Boost",tip:"Run in place for 10 seconds to activate turbo mode!"},
          {title:"🎯 Precision Strike",tip:"Focus like a laser on one tiny part!"},
          {title:"🎪 Fun Break",tip:"Tell yourself a joke!"},
          {title:"🏁 Victory Sprint",tip:"Final push! Imagine you're racing to save the kingdom!"},
        ],
        encouragements:["YOU'RE A ROCKSTAR! 🌟","INCREDIBLE! 🎊","SUPERSTAR STATUS! 💫","LEGEND IN THE MAKING! 🏆","PURE GENIUS! 🧠"],
      });
      setMinutesLeft(8);
      triggerCelebration("🛡️ Backup Plan Activated!");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    if(minutesLeft==null)return;
    if(minutesLeft<=0){
      triggerCelebration("⏰ TIME'S UP! You're amazing!");
      return;
    }
    const id=setInterval(()=>{
      setMinutesLeft((m)=>{
        if(m===null)return m;
        const newTime=Math.max(0,m-1);
        if(newTime===5)triggerCelebration("⏳ 5 minutes left - You've got this!");
        if(newTime===2)triggerCelebration("🚨 2 minutes - Final push!");
        if(newTime===1)triggerCelebration("⚡ 1 minute - GO GO GO!");
        return newTime;
      });
    },60*1000);
    return()=>{ clearInterval(id); };
  },[minutesLeft]);

  // Cleanup for celebration timeout
  useEffect(()=>{
    return()=>{
      if(celebrationTimeoutRef.current!=null){
        window.clearTimeout(celebrationTimeoutRef.current);
      }
    };
  },[]);

  const enc=useMemo(()=>plan?.encouragements??[],[plan]);

  function nextStep(){
    const newIndex=Math.min((plan?.steps.length??1)-1,stepIndex+1);
    setStepIndex(newIndex);
    if(enc.length){
      const pep=enc[Math.floor(Math.random()*enc.length)];
      say(pep);
      triggerCelebration(pep);
    }
    if(newIndex===(plan?.steps.length??1)-1){
      triggerCelebration("🎯 Final step! You're almost there!");
    }
  }

  function prevStep(){
    setStepIndex((i)=>Math.max(0,i-1));
  }

  /* --------- Hand completion back to parent (no Storage/DB here) --------- */

  function markDone(evidence?:EvidenceItem[]){
    triggerCelebration("🎉 MISSION ACCOMPLISHED! YOU'RE INCREDIBLE!");
    say(`Congratulations ${childName}! You completed ${target.title} like a true champion!`);

    setShowCompletionCelebration(true);
    if(celebrationTimeoutRef.current!=null){
      window.clearTimeout(celebrationTimeoutRef.current);
    }
    celebrationTimeoutRef.current=window.setTimeout(()=>{
      setShowCompletionCelebration(false);
      onMarkDone?.(evidence);
      onClose();
    },15000);
  }

  useEffect(()=>{
    if(open){
      document.body.style.overflow="hidden";
    }else{
      document.body.style.overflow="unset";
    }
    return()=>{
      document.body.style.overflow="unset";
    };
  },[open]);

  if(!open)return null;

  return(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/50 z-[9990]" onClick={onClose}/>

      {celebrations.map((msg,index)=>(
        <div
          key={index}
          className="fixed left-1/2 transform -translate-x-1/2 z-[10000] animate-bounce"
          style={{top:`${20+index*72}px`}}
        >
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-5 py-2 rounded-full shadow font-semibold text-sm">
            {msg}
          </div>
        </div>
      ))}

      <div className="relative z-[9995] w-full max-w-6xl rounded-2xl shadow-2xl overflow-y-auto max-h-[92vh]">
        <div className="grid grid-cols-1 md:grid-cols-3 bg-slate-900/95">
          {/* LEFT: Mission control */}
          <div className="md:col-span-2 p-4 md:p-6 md:overflow-y-auto md:max-h-[80vh]">
            <div className="flex flex-col h-full">
              <div className="flex items-start justify-between mb-6">
                <div className="min-w-0">
                  <div className="text-sky-300 text-sm mb-2 font-bold flex items-center gap-2">
                    <span className="animate-pulse">🎮</span>
                    YOUR EPIC MISSION CONTROL
                    <span className="animate-pulse">🎮</span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-extrabold leading-tight text-white truncate">
                    {target.title}
                  </h2>
                  <div className="text-white/80 text-xs mt-2 flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-slate-800/60 rounded-full text-xs">🏷️ {target.category||"Top Secret Mission"}</span>
                    <span className="px-2 py-1 bg-slate-800/60 rounded-full text-xs">⚡ {target.difficulty||"EPIC"}</span>
                    <span className="px-2 py-1 bg-slate-800/60 rounded-full text-xs">🏆 {target.points_award??15} XP</span>
                  </div>
                </div>

                <div className="ml-4 flex-shrink-0">
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-lg bg-white/6 hover:bg-white/10 text-sm transition"
                    aria-label="Close mission control"
                  >
                    🚪 Exit
                  </button>
                </div>
              </div>

              <div className="flex-1">
                {!plan?(
                  <div className="rounded-2xl p-5 md:p-6 bg-slate-800/40">
                    <p className="text-white/90 text-lg md:text-xl font-semibold text-center mb-4">
                      🌟 Hey {childName}! Ready to turn "{target.title}" into the most EPIC adventure ever?
                    </p>
                    <div className="text-white/70 text-sm md:text-base text-center mb-6">
                      We'll create a superhero mission with timers, cheers, and pure fun!
                    </div>
                    <button
                      onClick={fetchPlan}
                      disabled={loading}
                      className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 disabled:opacity-60 text-black font-bold text-lg transition transform hover:scale-105"
                    >
                      {loading?(
                        <span className="flex items-center justify-center gap-2">
                          <span className="animate-spin">⚡</span>
                          Launching Adventure...
                        </span>
                      ):(
                        <span className="flex items-center justify-center gap-2">
                          🚀 LAUNCH MISSION!
                        </span>
                      )}
                    </button>
                  </div>
                ):(
                  <div className="space-y-6">
                    <div className="rounded-2xl p-5 bg-slate-800/30">
                      <p className="text-white/90 text-lg font-semibold mb-4">
                        {plan.greeting}
                      </p>

                      {plan.materials.length>0&&(
                        <div className="mt-4">
                          <div className="text-sky-300 text-sm mb-3 font-bold">🎒 MISSION GEAR:</div>
                          <ul className="text-white/90 text-sm space-y-2">
                            {plan.materials.map((m,i)=>(
                              <li key={i}className="flex items-center gap-3">
                                <span className="text-sky-300 text-lg">✦</span>
                                <span>{m}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-3 flex-wrap">
                        <div className="px-3 py-1.5 rounded-full bg-slate-800/60 text-white/90 text-sm">
                          🎭 Mood: {plan.mood.toUpperCase()}
                        </div>
                        <div className="px-3 py-1.5 rounded-full bg-slate-800/60 text-white/90 text-sm font-mono">
                          ⏱️ {minutesLeft??plan.estimated_minutes}m
                        </div>
                        <button
                          className="px-3 py-1.5 rounded-full bg-indigo-600/20 text-white/90 text-sm hover:bg-indigo-600/30 transition-colors"
                          onClick={()=>setMinutesLeft(plan.estimated_minutes)}
                          title="Reset mission timer"
                        >
                          🔄 Reset
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl p-5 bg-slate-800/30">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-white text-lg">🎯 MISSION PHASES</h3>
                        <div className="text-sky-300 text-sm font-mono">
                          Phase {stepIndex+1} of {plan.steps.length}
                        </div>
                      </div>

                      <div className="rounded-xl p-4 bg-slate-800/50">
                        <div className="text-xl font-bold text-white mb-3 flex items-center gap-3">
                          <span className="text-2xl">🎪</span>
                          {plan.steps[stepIndex].title}
                        </div>
                        {plan.steps[stepIndex].tip&&(
                          <div className="text-white/80 text-sm rounded-lg p-3 bg-black/20">
                            💡 {plan.steps[stepIndex].tip}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex gap-3 flex-wrap">
                        <button
                          onClick={prevStep}
                          disabled={stepIndex===0}
                          className="px-4 py-2.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 text-white transition text-sm flex items-center gap-2"
                        >
                          ↩️ Previous
                        </button>
                        <button
                          onClick={nextStep}
                          disabled={stepIndex>=plan.steps.length-1}
                          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 disabled:opacity-40 text-white font-semibold transition transform hover:scale-105 text-sm flex items-center gap-2"
                        >
                          {stepIndex>=plan.steps.length-1?"🏁 Finish!":"Next Phase →"}
                        </button>
                        <button
                          onClick={()=>{
                            const pepTalk=enc[Math.floor(Math.random()*enc.length)]??"You're doing absolutely amazing!";
                            say(pepTalk);
                            triggerCelebration(pepTalk);
                          }}
                          className="ml-auto px-4 py-2.5 rounded-lg bg-pink-600/20 hover:bg-pink-600/30 text-white transition text-sm flex items-center gap-2"
                          title="Get a superhero pep talk!"
                        >
                          🎤 Pep Talk!
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl p-5 bg-slate-800/30">
                      <div className="text-white text-lg font-semibold text-center mb-4">
                        🏁 MISSION STATUS REPORT
                      </div>
                      <div className="space-y-3">
                        <button
                          onClick={()=>setShowEvidenceSubmission(true)}
                          className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg transition transform hover:scale-105"
                        >
                          📸 Submit Evidence & Complete!
                        </button>
                        <button
                          onClick={()=>setShowQuickComplete(true)}
                          className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-green-400 to-emerald-400 text-black font-bold transition text-base flex items-center justify-center gap-2"
                        >
                          🎉 Quick Complete
                        </button>
                      </div>
                    </div>

                    <div className="text-center text-sky-300/80 text-sm font-bold">
                      💫 Remember: Every superhero started as a beginner. You're doing AMAZING!
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Adventure Guide (always visible) */}
          <aside className="p-4 md:p-6 md:sticky md:top-6 md:overflow-y-auto md:max-h-[80vh] bg-slate-900/95">
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="text-3xl">🤖</div>
                <div>
                  <h3 className="font-bold text-white text-lg">Adventure Guide</h3>
                  <p className="text-white/70 text-sm">Get real tips for {target.title}!</p>
                </div>
              </div>

              {/* Visual guidance “image” card */}
              <div className="mb-4 rounded-2xl overflow-hidden bg-slate-800/90 border border-indigo-500/40 shadow-inner">
                {guideImageUrl?(
                  <img
                    src={guideImageUrl}
                    alt={guideImageIdea||defaultGuideIdea}
                    className="w-full h-40 object-cover"
                  />
                ):(
                  <div className="h-40 flex items-center justify-center bg-gradient-to-br from-indigo-600/70 via-purple-600/70 to-pink-500/70">
                    <div className="text-center px-4">
                      <div className="text-3xl mb-1">🗺️</div>
                      <p className="text-xs md:text-sm text-white font-semibold line-clamp-3">
                        {guideImageIdea||defaultGuideIdea}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {isThinking&&!aiResponse&&(
                <div className="mb-4 p-4 rounded-2xl bg-slate-800/60 border border-indigo-400/40">
                  <p className="text-sm text-indigo-100 flex items-center gap-2">
                    <span className="animate-spin">✨</span>
                    Adventure Guide is thinking of a fun way to help…
                  </p>
                </div>
              )}

              {aiResponse&&(
                <div
                  ref={aiResponseRef}
                  className="mb-6 p-4 rounded-2xl bg-slate-800/60 max-h-56 md:max-h-64 overflow-y-auto"
                >
                  <div className="text-white/90 text-base leading-relaxed whitespace-pre-wrap">
                    {aiResponse}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={()=>getAIGuidance("how")}
                  disabled={isThinking}
                  className="px-4 py-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 text-white text-sm"
                >
                  🎯 How to Start
                </button>
                <button
                  onClick={()=>getAIGuidance("bored")}
                  disabled={isThinking}
                  className="px-4 py-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-40 text-white text-sm"
                >
                  🎭 Make it Fun!
                </button>
                <button
                  onClick={()=>getAIGuidance("stuck")}
                  disabled={isThinking}
                  className="px-4 py-3 rounded-lg bg-green-600/20 hover:bg-green-600/30 disabled:opacity-40 text-white text-sm"
                >
                  🔄 I'm Stuck
                </button>
                <button
                  onClick={()=>getAIGuidance("")}
                  disabled={isThinking}
                  className="px-4 py-3 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/15 disabled:opacity-40 text-white text-sm"
                >
                  💡 Random Tip
                </button>
              </div>

              <div className="mt-auto">
                <div className="flex gap-3 mb-2">
                  <input
                    type="text"
                    value={userQuestion}
                    onChange={(e)=>setUserQuestion(e.target.value)}
                    placeholder={`Ask about ${target.title}...`}
                    className="flex-1 px-4 py-3 rounded-lg bg-slate-800/40 text-white placeholder-white/50 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                    onKeyDown={(e)=>{
                      if(e.key==="Enter"&&userQuestion.trim()){
                        getAIGuidance(userQuestion);
                      }
                    }}
                  />
                  <button
                    onClick={()=>getAIGuidance(userQuestion)}
                    disabled={isThinking||!userQuestion.trim()}
                    className="px-5 py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 disabled:opacity-40 text-white font-semibold text-sm"
                  >
                    {isThinking?"🤔...":"Ask"}
                  </button>
                </div>
                <p className="text-white/50 text-xs text-center">
                  Try: "How do I start?" or "Make this more fun!"
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showEvidenceSubmission&&(
        <TargetEvidenceSubmission
          target={target}
          childName={childName}
          onComplete={(evidence)=>{
            console.log("[CoachPanel] evidence from submission:",evidence);
            setShowEvidenceSubmission(false);
            markDone(evidence);
          }}
          onCancel={()=>setShowEvidenceSubmission(false)}
        />
      )}

      {showQuickComplete&&(
        <QuickCompleteModal
          target={target}
          childName={childName}
          onComplete={(quick)=>{
            setShowQuickComplete(false);
            if(quick){
              // Wrap as one EvidenceItem and let parent markDone handle it
              markDone([quick as EvidenceItem]);
            }else{
              markDone();
            }
          }}
          onCancel={()=>setShowQuickComplete(false)}
        />
      )}

      {showCompletionCelebration&&(
        <div className="fixed inset-0 z-[10000] pointer-events-none flex items-center justify-center">
          {/* Falling emojis in front of everything */}
          <div className="absolute inset-0 overflow-hidden">
            {["🎉","🌟","🌸","✨","🏆","🌈"].map((emoji,i)=>(
              <div
                key={i}
                className="absolute text-4xl md:text-5xl animate-bounce"
                style={{
                  left:`${10+15*i}%`,
                  top:`${5+8*i}%`,
                }}
              >
                {emoji}
              </div>
            ))}
          </div>

          {/* Center celebration card */}
          <div className="relative z-[10001] max-w-md w-full px-6 md:px-10">
            <div className="rounded-3xl bg-slate-900/95 border border-emerald-400/40 shadow-2xl px-6 py-6 md:py-8 text-center">
              <div className="text-4xl md:text-5xl mb-3">🎉🌈🏆</div>
              <h2 className="text-xl md:text-2xl font-extrabold text-white mb-2">
                Mission complete, superstar!
              </h2>
              <p className="text-sm md:text-base text-white/80 mb-3">
                Your mission is marked done and your points are being added to your mission earnings.
              </p>
              <div className="text-2xl md:text-3xl mt-1">⭐🎨✨</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
