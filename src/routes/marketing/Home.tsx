// src/routes/MarketingHome.tsx
import React,{useEffect,useMemo,useRef,useState}from "react";
import {Link,useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import Logo from "@/components/brand/Logo";

/* ----------------- local styles (scoped via global classnames) -----------------
   We add a few small runtime styles here for:
   - animated gradient on logo
   - accessible focus ring fallback
   - marquee animation with reduced-motion respect
   These are minimal to avoid depending on external CSS changes.
*/
const RuntimeStyles=()=>(
  <style
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{
      __html:`
      /* focus-ring fallback (used via .focus-ring) */
      .focus-ring:focus { outline: 3px solid rgba(99,102,241,0.9); outline-offset: 3px; border-radius: 0.5rem; }

      /* animated gradient used by the AnimatedLogo wrapper */
      .animated-gradient {
        background: linear-gradient(90deg, rgba(16,185,129,0.9), rgba(59,130,246,0.85), rgba(249,115,22,0.9));
        background-size: 200% 200%;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: ag-anim 6s linear infinite;
      }

      @keyframes ag-anim {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }

      /* marquee animation (repeats content): respects reduced motion preference */
      .marquee {
        display: inline-block;
        will-change: transform;
      }
      @media (prefers-reduced-motion: no-preference) {
        .marquee > span {
          display:inline-block;
          padding-right: 2rem;
          animation: marquee-scroll 18s linear infinite;
        }
        @keyframes marquee-scroll {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      }

      /* small accessible helper */
      .sr-only { position: absolute !important; height: 1px; width: 1px; overflow: hidden; clip: rect(1px, 1px, 1px, 1px); white-space: nowrap; border:0; padding:0; margin:-1px; }
    `,
    }}
  />
);

/* ------------ simple animated logo wrapper (no new deps) ------------ */
const AnimatedLogo=({size=64}:{size?:number})=>{
  // Respect reduced-motion preference
  const [reducedMotion,setReducedMotion]=useState(false);
  useEffect(()=>{
    const mq=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if(!mq)return;
    const handler=()=>setReducedMotion(mq.matches);
    handler();
    mq.addEventListener?.("change",handler);
    return ()=>mq.removeEventListener?.("change",handler);
  },[]);

  return (
    <div className="relative inline-block shrink-0" aria-hidden={false}>
      <div
        className="absolute inset-0 rounded-full opacity-30"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(52,211,153,.28) 0%, rgba(59,130,246,.20) 40%, transparent 70%)",
          filter:reducedMotion?"none":"blur(18px)",
        }}
      />
      <div
        className={`relative ${reducedMotion?"":"animate-float"}`}
        style={{display:"inline-block"}}
      >
        {/* Gradient ring behind icon to create illuminated, premium effect */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full"
          style={{
            transform:"scale(1.35)",
            filter:"blur(24px)",
            opacity:0.55,
            background:
              "linear-gradient(120deg, rgba(249,115,22,0.08), rgba(99,102,241,0.06), rgba(16,185,129,0.06))",
          }}
        />
        {/* Using animated-gradient text effect for subtle motion on icon wrapper */}
        <div
          className="rounded-full p-1 inline-block animated-gradient"
          style={{
            WebkitBackgroundClip:"text",
            backgroundClip:"text",
            color:"transparent",
          }}
          aria-hidden
        >
          <Logo variant="icon" size={size}/>
        </div>
      </div>
    </div>
  );
};

/* ------------------------- single-player playlist ------------------------- */
function VideoPlaylist({videos}:{videos:{src:string;poster?:string;label?:string}[]}) {
  const [i,setI]=useState(0);
  const [ready,setReady]=useState(false);
  const [muted,setMuted]=useState(true);
  const [playing,setPlaying]=useState(false);
  const vref=useRef<HTMLVideoElement|null>(null);
  const containerRef=useRef<HTMLDivElement|null>(null);

  const cur=videos[i]||null;
  const count=videos.length;

  // load video whenever index changes
  useEffect(()=>{
    const el=vref.current;
    if(!el||!cur)return;
    setReady(false);
    setPlaying(false);
    el.pause();
    // Chrome requires setting src via attributes to ensure load
    el.src=cur.src;
    if(cur.poster)el.poster=cur.poster;
    el.load();
    const onCanPlay=()=>{
      setReady(true);
      // autoplay if allowed
      el.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));
    };
    const onEnded=()=>next();
    const onPlay=()=>setPlaying(true);
    const onPause=()=>setPlaying(false);
    el.addEventListener("canplay",onCanPlay);
    el.addEventListener("ended",onEnded);
    el.addEventListener("play",onPlay);
    el.addEventListener("pause",onPause);
    return ()=>{
      el.removeEventListener("canplay",onCanPlay);
      el.removeEventListener("ended",onEnded);
      el.removeEventListener("play",onPlay);
      el.removeEventListener("pause",onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[i,cur?.src]);

  // update muted state on element
  useEffect(()=>{
    const el=vref.current;
    if(!el)return;
    el.muted=muted;
  },[muted]);

  // keyboard controls for the video area: left/right prev/next, space toggles play
  useEffect(()=>{
    const el=containerRef.current;
    if(!el)return;
    const onKey=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement)&&(e.target as HTMLElement).tagName==="BUTTON")return;
      if(e.key==="ArrowLeft"){
        e.preventDefault();
        prev();
      }else if(e.key==="ArrowRight"){
        e.preventDefault();
        next();
      }else if(e.key===" "||e.key==="Spacebar"){
        // toggle play/pause
        e.preventDefault();
        const video=vref.current;
        if(!video)return;
        if(video.paused){
          video.play().catch(()=>{});
        }else{
          video.pause();
        }
      }else if(e.key.toLowerCase()==="m"){
        // toggle mute with "m"
        setMuted((m)=>!m);
      }
    };
    el.addEventListener("keydown",onKey);
    return ()=>el.removeEventListener("keydown",onKey);
  },[]);

  const next=()=>setI((p)=>(p+1)%count);
  const prev=()=>setI((p)=>(p-1+count)%count);
  const goTo=(idx:number)=>setI(((idx%count)+count)%count);

  if(!cur){
    return null;
  }

  return (
    <div className="glass rounded-2xl p-4" ref={containerRef} tabIndex={0} aria-label="Product videos carousel">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Product videos</div>
        <div className="text-xs text-white/60">Auto-cycling · tap ▶ to unmute</div>
      </div>

      <div className="relative rounded-xl overflow-hidden aspect-video bg-black" role="region" aria-roledescription="video player">
        <video
          ref={vref}
          className="w-full h-full object-cover"
          muted={muted}
          playsInline
          controls
          preload="metadata"
          aria-label={cur.label||"Product video"}
        />

        {/* overlay center controls for play/unmute (visible on pointer devices) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <button
              type="button"
              aria-pressed={!muted}
              aria-label={muted?"Unmute and play":"Mute"}
              title={muted?"Unmute (or press M)":"Mute (or press M)"}
              onClick={()=>{
                const video=vref.current;
                if(!video)return;
                // If currently muted, attempting to unmute should also start playback if paused.
                if(muted){
                  setMuted(false);
                  video.play().catch(()=>{});
                }else{
                  setMuted(true);
                }
              }}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full focus-ring transition-opacity"
              style={{backdropFilter:"blur(6px)"}}
            >
              {muted?"▶ Unmute":"🔊"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg focus-ring"
          aria-label="Previous video"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg focus-ring"
          aria-label="Next video"
        >
          ▶
        </button>

        {/* dots (keyboard focusable) */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5" role="tablist" aria-label="Video selection">
          {videos.map((_,idx)=>(
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx===i}
              aria-label={`Go to video ${idx+1}`}
              onClick={()=>goTo(idx)}
              className={`h-2 w-2 rounded-full ${idx===i?"bg-white":"bg-white/40"} focus-ring`}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 text-sm opacity-80" aria-live="polite">
        {ready?cur.label||"": "Loading…"}
      </div>
    </div>
  );
}

/* ---------------------------- image carousel ---------------------------- */
function ImageRail({images}:{images:{src:string;alt:string}[]}) {
  const containerRef=useRef<HTMLDivElement|null>(null);

  // keyboard to scroll left/right when focused on container
  useEffect(()=>{
    const container=containerRef.current;
    if(!container)return;
    const onKey=(e:KeyboardEvent)=>{
      const scr=containerRef.current;
      if(!scr)return;
      if(e.key==="ArrowRight"){
        e.preventDefault();
        scr.scrollBy({left:scr.clientWidth*0.6,behavior:"smooth"});
      }else if(e.key==="ArrowLeft"){
        e.preventDefault();
        scr.scrollBy({left:-scr.clientWidth*0.6,behavior:"smooth"});
      }
    };
    container.addEventListener("keydown",onKey);
    return ()=>container.removeEventListener("keydown",onKey);
  },[]);

  const scrollByAmount=(dir:"left"|"right")=>{
    const scr=containerRef.current;
    if(!scr)return;
    const delta=dir==="right"?scr.clientWidth*0.8:-scr.clientWidth*0.8;
    scr.scrollBy({left:delta,behavior:"smooth"});
  };

  return (
    <div className="glass rounded-2xl p-4 relative">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Screenshots</div>
        <div className="text-xs text-white/60">Swipe/scroll · use arrows</div>
      </div>
      <div
        ref={containerRef}
        className="overflow-x-auto no-scrollbar"
        tabIndex={0}
        aria-label="Screenshots carousel"
      >
        <div className="flex gap-4 snap-x snap-mandatory min-w-0">
          {images.map((im,idx)=>(
            <img
              key={idx}
              src={im.src}
              alt={im.alt}
              loading="lazy"
              className="h-56 md:h-64 lg:h-72 rounded-xl border border-white/10 object-cover snap-center shrink-0 transition-transform transform hover:scale-[1.02] focus:scale-[1.02] focus-ring"
              tabIndex={0}
              role="img"
              aria-label={im.alt}
            />
          ))}
        </div>
      </div>

      {/* desktop slide controls */}
      <button
        type="button"
        onClick={()=>scrollByAmount("left")}
        className="hidden md:flex items-center justify-center absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/30 hover:bg-black/50 border border-white/20 focus-ring"
        aria-label="Previous screenshot"
      >
        ◀
      </button>
      <button
        type="button"
        onClick={()=>scrollByAmount("right")}
        className="hidden md:flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/30 hover:bg-black/50 border border-white/20 focus-ring"
        aria-label="Next screenshot"
      >
        ▶
      </button>
    </div>
  );
}

/* ------------------------------- marquee ------------------------------- */
const Marquee=({items}:{items:string[]})=>{
  const text=useMemo(()=>items.join(" • "),[items]);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 py-2 overflow-hidden">
      {/* For screen readers we provide a concise, single-line summary and hide the animated duplication */}
      <span className="sr-only">Highlights: {text}</span>

      <div className="marquee whitespace-nowrap text-sm tracking-wide" aria-hidden="true" role="presentation">
        <span className="opacity-90 inline-block pr-6">{text}</span>
        <span className="opacity-90 inline-block pr-6">{text}</span>
      </div>
    </div>
  );
};

/* --------------------------- guide inline modal --------------------------- */
const GuideModal=({open,onClose}:{open:boolean; onClose:()=>void})=>{
  const panelRef=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    if(!open)return;
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){
        e.preventDefault();
        onClose();
      }
    };
    const onClick=(e:MouseEvent)=>{
      if(!panelRef.current)return;
      if(!panelRef.current.contains(e.target as Node)){
        onClose();
      }
    };
    document.addEventListener("keydown",onKey);
    document.addEventListener("mousedown",onClick);
    return ()=>{
      document.removeEventListener("keydown",onKey);
      document.removeEventListener("mousedown",onClick);
    };
  },[open,onClose]);

  if(!open)return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="glass rounded-2xl max-w-lg w-full mx-4 p-6 relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dp-guide-title"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guide"
          className="absolute right-3 top-3 text-white/60 hover:text-white focus-ring rounded-full"
        >
          ✕
        </button>
        <h2 id="dp-guide-title" className="text-lg font-semibold mb-2">
          How DailyPromise works
        </h2>
        <p className="text-sm text-white/70 mb-4">
          Quick walkthrough for parents—from first login to kids earning rewards.
        </p>
        <ol className="space-y-3 text-sm list-decimal list-inside">
          <li>
            <span className="font-medium">Create a parent account.</span> Add your name, email, and secure password.
          </li>
          <li>
            <span className="font-medium">Add your kids.</span> Pick a nickname, set PIN/password, and choose how they sign in.
          </li>
          <li>
            <span className="font-medium">Set daily promises.</span> Mix goals, checklists, and mini challenges with points.
          </li>
          <li>
            <span className="font-medium">Print or share QR cards.</span> Kids scan or tap Kiosk to check in and submit progress.
          </li>
          <li>
            <span className="font-medium">Approve and reward.</span> Review evidence, approve points, and let kids redeem for rewards.
          </li>
        </ol>
        <div className="mt-4 text-xs text-white/60">
          Tip: You can change points, rewards, and limits any time from the parent dashboard.
        </div>
      </div>
    </div>
  );
};

/* -------------------------------- page -------------------------------- */
export default function MarketingHome(){
  const nav=useNavigate();
  const [showGuide,setShowGuide]=useState(false);

  // 🔍 Supabase connectivity sanity check (change table name if needed)
  useEffect(()=>{
    (async()=>{
      try{
        const {data,error}=await supabase.from("child_profiles").select("*").limit(1);
        console.log("[MarketingHome] DB test child_profiles",{data,error});
      }catch(err){
        console.error("[MarketingHome] DB test error",err);
      }
    })();
  },[]);

  // 🔐 secret admin click tracker
  const secretClicksRef=useRef(0);
  const lastClickRef=useRef(0);

  function handleSecretAdminClick(){
    const now=Date.now();
    const diff=now-lastClickRef.current;

    if(diff<800){
      secretClicksRef.current+=1;
    }else{
      secretClicksRef.current=1;
    }

    lastClickRef.current=now;

    if(secretClicksRef.current>=5){
      secretClicksRef.current=0;
      nav("/admin/login");
    }
  }

  const videos=[
    {src:"/ads/hero-parent.mp4",poster:"/ads/hero-parent.jpg",label:"Parent dashboard overview"},
    {src:"/ads/hero-child.mp4",poster:"/ads/hero-child.jpg",label:"Child rewards & goals"},
    {src:"/ads/hero-kiosk.mp4",poster:"/ads/hero-kiosk.jpg",label:"Big-keypad Child Kiosk + QR"},
  ];
  const images=[
    {src:"/shots/parent-dashboard.png",alt:"Parent Dashboard"},
    {src:"/shots/targets.png",alt:"Targets & Tasks"},
    {src:"/shots/rewards.png",alt:"Rewards & Wishlist"},
    {src:"/shots/child-dashboard.png",alt:"Child Dashboard"},
    {src:"/shots/kiosk.png",alt:"Child Kiosk"},
  ];
  const strip=[
    "Built for positive habits",
    "Real-time points & approvals",
    "Playful rewards & wishlists",
    "Parent controls with QR cards",
    "Kid-safe PIN or password",
    "Dark-mode native design",
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-10">
      <RuntimeStyles/>

      {/* HERO — Responsive grid:
          - Mobile/tablet: stacked single column
          - Desktop: two columns, right column sticky
      */}
      <section
        className="
          grid gap-8 items-start
          lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)]
        "
      >
        {/* LEFT: copy + CTAs */}
        <div className="space-y-6 min-w-0">
          {/* Brand row — aligned with App.tsx/ParentLayout wordmark */}
          <div className="flex items-center gap-4" onClick={handleSecretAdminClick}>
            <AnimatedLogo size={72}/>
            <Logo variant="wordmark" size={60} className="shrink-0 animated-gradient"/>
          </div>

          <div>
            <div className="text-3xl sm:text-4xl font-extrabold leading-tight">
              Promise. Practice. Prosper.
            </div>
            <div className="text-white/70 text-sm sm:text-base mt-1">
              DailyPromise is a joyful parent–child goals & rewards app that turns routines into wins.
            </div>
          </div>

          <Marquee items={strip}/>

          <div className="grid xs:grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={()=>nav("/auth/login")}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-[var(--brand-emerald)] text-black font-medium hover:brightness-110 focus-ring text-xs sm:text-sm"
              aria-label="Parent Login"
            >
              Parent Login
            </button>
            <button
              type="button"
              onClick={()=>nav("/child/login")}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 focus-ring text-xs sm:text-sm"
              aria-label="Child Login"
            >
              Child Login
            </button>
            <button
              type="button"
              onClick={()=>nav("/child/kiosk")}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 focus-ring text-xs sm:text-sm"
              aria-label="Child Kiosk"
            >
              Child Kiosk
            </button>
          </div>

          {/* Quick features */}
          <ul className="grid sm:grid-cols-2 gap-2 text-sm" aria-label="Key features">
            {[
              "Instant approvals & notifications",
              "Wallet with points → cash-out",
              "Targets, checklists, games",
              "Wishlists with celebration cards",
            ].map((t,idx)=>(
              <li key={idx} className="glass rounded-lg px-3 py-2">
                <span aria-hidden>✨</span> <span>{t}</span>
              </li>
            ))}
          </ul>

          {/* Guide button */}
          <div>
            <button
              type="button"
              onClick={()=>setShowGuide(true)}
              className="mt-3 inline-flex items-center px-4 py-2 rounded-xl bg-white/8 hover:bg-white/16 border border-white/15 text-sm focus-ring"
              aria-label="Open guide, instructions and process"
            >
              📘 Guide, instructions &amp; process
            </button>
          </div>
        </div>

        {/* RIGHT: sticky hero media on desktop, stacks on mobile */}
        <aside className="lg:sticky lg:top-20 min-w-0" aria-label="Hero media">
          <VideoPlaylist videos={videos}/>
        </aside>
      </section>

      {/* Screenshots */}
      <section className="mt-8">
        <ImageRail images={images}/>
      </section>

      {/* Split ads (optional image or video blocks) */}
      <section
        className="
          mt-8 grid gap-6
          md:grid-cols-2
          lg:grid-cols-3
        "
      >
        <div className="glass rounded-2xl p-5">
          <div className="text-lg font-semibold mb-2">For Parents</div>
          <p className="text-white/70 text-sm mb-3">
            Set goals, approve points, print QR cards, and get gentle progress nudges.
          </p>
          <img
            src="/shots/parent-approvals.png"
            alt="Approvals"
            className="rounded-xl border border-white/10 transition-transform transform hover:scale-[1.02] focus:ring-4"
            loading="lazy"
          />
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="text-lg font-semibold mb-2">For Kids</div>
          <p className="text-white/70 text-sm mb-3">
            Kid-friendly dashboard with rewards, wishlist, and fun mini-games.
          </p>
          <img
            src="/shots/child-rewards.png"
            alt="Child Rewards"
            className="rounded-xl border border-white/10 transition-transform transform hover:scale-[1.02] focus:ring-4"
            loading="lazy"
          />
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="text-lg font-semibold mb-2">Kiosk &amp; QR</div>
          <p className="text-white/70 text-sm mb-3">
            Tap the big keypad or scan QR—PIN/password stays private.
          </p>
          <img
            src="/shots/kiosk.png"
            alt="Kiosk keypad and QR entry"
            className="rounded-xl border border-white/10 transition-transform transform hover:scale-[1.02] focus:ring-4 w-full"
            loading="lazy"
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-10 glass rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="min-w-0">
          <div className="text-xl font-semibold">Ready to start?</div>
          <div className="text-white/70 text-sm">
            Create a parent account, add kids, and print QR cards in minutes.
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/auth/register"
            className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-[var(--brand-coral)] text-white font-medium hover:brightness-110 focus-ring text-xs sm:text-sm"
            aria-label="Register parent account"
          >
            Register
          </Link>
          <Link
            to="/auth/login"
            className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 focus-ring text-xs sm:text-sm"
            aria-label="Sign in"
          >
            Sign in
          </Link>
        </div>
      </section>

      <GuideModal open={showGuide} onClose={()=>setShowGuide(false)}/>
    </div>
  );
}
