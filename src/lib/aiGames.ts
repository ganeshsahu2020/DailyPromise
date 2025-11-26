// src/lib/aiGames.ts
import {supabase} from "@/lib/supabase";

export type MathItem={a:number; b:number; op:"+"|"-"|"*"|"/"; ans:number};

function toInt(n:any,fb=0){const v=Number(n); return Number.isFinite(v)?Math.trunc(v):fb;}
function normOp(op:any){const s=String(op??"").trim(); if(s==="+")return "+"; if(s==="-")return "-"; if(s==="*"||s==="×"||s==="x"||s==="X")return "*"; if(s==="/"||s==="÷")return "/"; return "+";}

export async function aiGetMath(level=1,batch=6):Promise<MathItem[]>{
  try{
    const {data,error}=await supabase.functions.invoke("ai-games",{body:{type:"math",level,batch}});
    if(error) throw error;
    const items=Array.isArray(data?.items)?data.items:[];
    const clean=items.map((it:any)=>{const a=toInt(it?.a,0); const b0=toInt(it?.b,0); const op=normOp(it?.op); const b=op==="/"?(b0===0?1:Math.abs(b0)):b0; let ans=toInt(it?.ans,NaN); if(!Number.isFinite(ans)){ans=op==="+"?a+b:op==="-"?a-b:op==="*"?(a*b):Math.trunc(a/b);} return {a,b,op,ans};});
    if(clean.length) return clean;
    throw new Error("empty");
  }catch{
    const out:MathItem[]=[]; for(let i=0;i<batch;i++){const a=(Math.random()*11)|0; const b=(Math.random()*11)|0; const ops:Array<MathItem["op"]>=["+","-"]; const op=ops[(Math.random()*ops.length)|0]; const ans=op==="+"?a+b:a-b; out.push({a,b,op,ans});} return out;
  }
}

export async function aiGetWords(level=1,count=8,exclude:string[]=[]):Promise<string[]>{
  try{
    const {data,error}=await supabase.functions.invoke("ai-games",{body:{type:"words",level,count,exclude}});
    if(error) throw error;
    const allowed=/^[A-Z]{3,16}$/;
    const words:string[]=(Array.isArray(data?.words)?data.words:[])
      .map((w:any)=>String(w??"").toUpperCase().trim())
      .filter((w:string)=>allowed.test(w));
    if(words.length) return words;
    throw new Error("empty");
  }catch{
    const BANKS:string[][]=[["TREE","PLANET","MUSIC","COLOR","LIGHT","SCHOOL","SPACE","SMILE","BRAVE","GREEN"],["ANIMAL","FAMILY","ROCKET","GARDEN","PUZZLE","PURPLE","MONKEY","FLOWER","SUNSET","POCKET"],["ADVENTURE","NOTEBOOK","RAILWAY","DISCOVER","SUNSHINE","FRIENDLY","CAMPFIRE","WATERFALL"],["EXPLORATION","CELEBRATION","IMAGINATION","DISCOVERY","CONNECTION","ADVENTURERS","INVENTIONS"]];
    const band=level<=2?0:level<=4?1:level<=6?2:3; const list=BANKS[band];
    const set=new Set<string>(exclude?.map((s)=>s.toUpperCase().trim())??[]); const out:string[]=[];
    while(out.length<count){const w=list[(Math.random()*list.length)|0]; if(!set.has(w)){set.add(w); out.push(w);}}
    return out;
  }
}
