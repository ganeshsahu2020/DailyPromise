// src/hooks/useAudioPool.ts
import {useEffect,useRef} from 'react';
export function useAudioPool(srcs:string[]){
  const refs = useRef<HTMLAudioElement[]>([]);
  useEffect(()=>{
    refs.current = srcs.map(s=>new Audio(s));
    // Try to warm them after first user gesture
    const warm = ()=>{refs.current.forEach(a=>{a.load();}); window.removeEventListener('pointerdown',warm,{capture:true} as any);};
    window.addEventListener('pointerdown',warm,{capture:true} as any);
    return ()=>window.removeEventListener('pointerdown',warm,{capture:true} as any);
  },[srcs]);
  return {
    play:(src:string)=>{const a=new Audio(src); a.play().catch(()=>{});}
  };
}
