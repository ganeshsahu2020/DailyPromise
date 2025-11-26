import {supabase} from "@/lib/supabase";

type Task={category:string; title:string; description:string; solution:string; steps:string[]; materials:string[]; whyItHelps:string};
type Resp={tasks:Task[]; source:"openai"|"fallback"; error?:string; details?:string};

export async function generateTargets({age,interests,prompt,count}:{age:number; interests:string[]; prompt:string; count:number}):Promise<Resp>{
  try{
    const anon=(import.meta.env.VITE_SUPABASE_ANON_KEY as string)||"";
    const {data:sessionData}=await supabase.auth.getSession();
    const jwt=sessionData?.session?.access_token;

    // Use invoke() with explicit headers so both POST and the gateway path are consistent.
    const {data,error}=await supabase.functions.invoke("ai-generate-targets",{
      body:{age,interests,prompt,count},
      headers:{
        // Supabase functions commonly expect these two:
        "apikey": anon,
        "Authorization": `Bearer ${jwt||anon}`,
        // Being explicit helps some proxies:
        "Content-Type": "application/json"
      }
    });

    if(error){ return {tasks:[],source:"fallback",error:String(error.message||"invoke_failed")}; }
    return (data as Resp)??{tasks:[],source:"fallback",error:"no_data"};
  }catch(e:any){
    return {tasks:[],source:"fallback",error:String(e?.message||e||"invoke_exception")};
  }
}
