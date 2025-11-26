// src/utils/notify.ts
/**
 * Notification sound + helpers (Sonner-friendly)
 * - Unlocks audio on first user gesture (call unlockAudioOnce() in App root).
 * - Preloads short UI sounds.
 * - Throttles rapid-fire plays (per sound key).
 * - Works nicely alongside sonner's toast.* calls.
 */

import {toast}from "sonner";

/* ------------------------------------------------------------------ */
/* Types & Config                                                      */
/* ------------------------------------------------------------------ */

type NotifyKind="info"|"success"|"warn"|"error";

/** Map of sound keys to URLs (public/ or CDN). */
export const SOUND_URLS:Record<NotifyKind,string>={
  info:"/sounds/notify-info.wav",
  success:"/sounds/notify-success.wav",
  warn:"/sounds/notify-warn.wav",
  error:"/sounds/notify-error.wav",
};

/** Minimum interval between plays per key (ms) to avoid spam. */
let MIN_INTERVAL_MS=600;

/** Global enable switch + volume */
let AUDIO_ENABLED=true;
let VOLUME=0.8;

/* ------------------------------------------------------------------ */
/* Internal state                                                      */
/* ------------------------------------------------------------------ */

const cache:Partial<Record<NotifyKind,HTMLAudioElement>>={};
const lastPlayedAt:Partial<Record<NotifyKind,number>>={};
let unlocked=false;

// WebAudio fallback if <audio> fails (tiny beep)
let audioCtx:AudioContext|null=null;

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function now(){
  return Date.now();
}

function shouldThrottle(key:NotifyKind){
  const last=lastPlayedAt[key]??0;
  return now()-last<MIN_INTERVAL_MS;
}

function markPlayed(key:NotifyKind){
  lastPlayedAt[key]=now();
}

function ensureContext(){
  if(typeof window==="undefined"){return null;}
  if(!audioCtx){
    try{
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - webkitAudioContext for older Safari
      const Ctx=window.AudioContext||(window as any).webkitAudioContext;
      audioCtx=Ctx?new Ctx():null;
    }catch{
      audioCtx=null;
    }
  }
  return audioCtx;
}

function fallbackBeep(kind:NotifyKind){
  const ctx=ensureContext();
  if(!ctx)return;

  const osc=ctx.createOscillator();
  const gain=ctx.createGain();

  const freq=
    kind==="success"?880:
    kind==="info"?740:
    kind==="warn"?520:
    440;

  osc.frequency.value=freq;
  gain.gain.value=0.0001;

  osc.connect(gain);
  gain.connect(ctx.destination);

  const t0=ctx.currentTime;
  const dur=0.12;

  gain.gain.setValueAtTime(0.0001,t0);
  gain.gain.linearRampToValueAtTime(0.08*VOLUME,t0+0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001,t0+dur);

  osc.start(t0);
  osc.stop(t0+dur);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Call once in App root on first pointerdown to enable audio on iOS/Safari. */
export function unlockAudioOnce(){
  if(unlocked)return;

  try{
    const ctx=ensureContext();
    if(ctx&&ctx.state==="suspended"){
      ctx.resume().catch(()=>{});
    }

    (Object.keys(SOUND_URLS)as NotifyKind[]).forEach((k)=>{
      const a=new Audio();
      a.preload="auto";
      a.src=SOUND_URLS[k];
      a.volume=VOLUME;
      cache[k]=a;
    });

    unlocked=true;
  }catch{
    unlocked=true;
  }
}

/** Adjust master volume (0..1). */
export function setVolume(v:number){
  VOLUME=Math.max(0,Math.min(1,v));
  (Object.keys(cache)as NotifyKind[]).forEach((k)=>{
    const a=cache[k];
    if(a)a.volume=VOLUME;
  });
}

/** Enable/disable sounds globally. */
export function setEnabled(enabled:boolean){
  AUDIO_ENABLED=!!enabled;
}

/** Change throttle interval (ms). */
export function setMinIntervalMs(ms:number){
  MIN_INTERVAL_MS=Math.max(0,ms|0);
}

/** Preload sounds manually (optional). */
export function prime(){
  unlockAudioOnce();
}

/** Low-level play: respects throttle + enabled + unlock. */
export async function play(kind:NotifyKind):Promise<void>{
  if(!AUDIO_ENABLED)return;
  if(shouldThrottle(kind))return;
  markPlayed(kind);

  try{
    const elem=cache[kind]??(()=>{
      const a=new Audio(SOUND_URLS[kind]);
      a.preload="auto";
      a.volume=VOLUME;
      cache[kind]=a;
      return a;
    })();

    if(!unlocked){
      await elem.play().catch(()=>{});
      return;
    }

    try{elem.currentTime=0;}catch{}
    await elem.play();
  }catch{
    try{
      fallbackBeep(kind);
    }catch{
      // ignore
    }
  }
}

/* ------------------------------------------------------------------ */
/* Sonner-friendly helpers                                             */
/* ------------------------------------------------------------------ */

function stringOrError(e:unknown):string{
  if(!e)return "Something went wrong";
  if(typeof e==="string")return e;
  const any=e as any;
  return any?.message||any?.error_description||any?.hint||"Something went wrong";
}

export const notify={
  info(message:string,opts?:Parameters<typeof toast.info>[1]){
    toast.info(message,opts);
    void play("info");
  },
  success(message:string,opts?:Parameters<typeof toast.success>[1]){
    toast.success(message,opts);
    void play("success");
  },
  warn(message:string,opts?:Parameters<typeof toast.warning>[1]){
    toast.warning(message,opts);
    void play("warn");
  },
  error(err:unknown,title?:string){
    toast.error(title??"Error",{description:stringOrError(err)});
    void play("error");
  },
};

export const ok=(m:string,d?:string)=>notify.success(m,d?{description:d}:undefined);
export const info=(m:string,d?:string)=>notify.info(m,d?{description:d}:undefined);
export const warn=(m:string,d?:string)=>notify.warn(m,d?{description:d}:undefined);
export const err=(e:unknown,t?:string)=>notify.error(e,t);
