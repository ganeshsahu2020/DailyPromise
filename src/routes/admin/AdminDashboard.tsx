import {useEffect,useState}from "react";
import {Link}from "react-router-dom";
import {supabase}from "@/lib/supabase";

type AdminMetrics={
  parents:number;
  children:number;
  wishlistItems:number;
  aiImageCalls:number;
  aiImageCost:number;
  llmCalls:number;
  llmCost:number;
  storyCalls:number;
  transCalls:number;
};

type ParentRow={
  parent_uid:string;
  first_name:string|null;
  last_name:string|null;
  email:string|null;
  phone:string|null;
  family_id:string|null;
};

type ChildRow={
  child_uid:string;
  first_name:string;
  nick_name:string|null;
  family_id:string|null;
};

export default function AdminDashboard(){
  const [metrics,setMetrics]=useState<AdminMetrics>({
    parents:0,
    children:0,
    wishlistItems:0,
    aiImageCalls:0,
    aiImageCost:0,
    llmCalls:0,
    llmCost:0,
    storyCalls:0,
    transCalls:0
  });
  const [parentsList,setParentsList]=useState<ParentRow[]>([]);
  const [childrenList,setChildrenList]=useState<ChildRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|undefined>();

  useEffect(()=>{
    let active=true;
    (async()=>{
      setLoading(true);
      setError(undefined);
      try{
        // 🔢 Counts (head + count:exact) – note parent_uid/child_uid, not "id"
        const [
          parentsRes,
          childrenRes,
          wishlistRes,
        ]=await Promise.all([
          supabase.from("parent_profiles").select("parent_uid",{count:"exact",head:true}),
          supabase.from("child_profiles").select("child_uid",{count:"exact",head:true}),
          supabase.from("wishlist_items").select("id",{count:"exact",head:true}),
        ]);

        if(parentsRes.error)throw parentsRes.error;
        if(childrenRes.error)throw childrenRes.error;
        if(wishlistRes.error)throw wishlistRes.error;

        const parents=parentsRes.count||0;
        const children=childrenRes.count||0;
        const wishlistItems=wishlistRes.count||0;

        // 🧠 AI image + LLM usage for last 30 days
        const since=new Date();
        since.setDate(since.getDate()-30);
        const sinceIso=since.toISOString();

        const {data:imgRows,error:imgErr}=await supabase
          .from("ai_image_audit")
          .select("n,est_cost_usd,created_at")
          .gte("created_at",sinceIso);

        if(imgErr)throw imgErr;

        let aiImageCalls=0;
        let aiImageCost=0;

        (imgRows||[]).forEach((row:any)=>{
          const calls=typeof row.n==="number"&&row.n>0?row.n:1;
          const cost=typeof row.est_cost_usd==="number"?row.est_cost_usd:0;
          aiImageCalls+=calls;
          aiImageCost+=cost;
        });

        // 📚 LLM story + translation usage (30 days)
        const [{data:storyRows,error:storyErr},{data:transRows,error:transErr}]=
          await Promise.all([
            supabase
              .from("ai_story_audit")
              .select("est_cost_usd,created_at")
              .gte("created_at",sinceIso),
            supabase
              .from("ai_translate_audit")
              .select("est_cost_usd,created_at")
              .gte("created_at",sinceIso),
          ]);

        if(storyErr)throw storyErr;
        if(transErr)throw transErr;

        let storyCalls=0;
        let storyCost=0;
        let transCalls=0;
        let transCost=0;

        (storyRows||[]).forEach((row:any)=>{
          const cost=typeof row.est_cost_usd==="number"?row.est_cost_usd:0;
          storyCalls+=1;
          storyCost+=cost;
        });

        (transRows||[]).forEach((row:any)=>{
          const cost=typeof row.est_cost_usd==="number"?row.est_cost_usd:0;
          transCalls+=1;
          transCost+=cost;
        });

        const llmCalls=storyCalls+transCalls;
        const llmCost=storyCost+transCost;

        // 👨‍👩‍👧 Parent directory + recent children
        const [{data:parentRows,error:parentErr},{data:childRows,error:childErr}]=
          await Promise.all([
            supabase
              .from("parent_profiles")
              .select("parent_uid,first_name,last_name,email,phone,family_id,created_at")
              .order("created_at",{ascending:false})
              .limit(100), // show up to 100 parents in directory
            supabase
              .from("child_profiles")
              .select("child_uid,first_name,nick_name,family_id,created_at")
              .order("created_at",{ascending:false})
              .limit(5),
          ]);

        if(parentErr)throw parentErr;
        if(childErr)throw childErr;

        if(!active)return;

        setMetrics({
          parents,
          children,
          wishlistItems,
          aiImageCalls,
          aiImageCost,
          llmCalls,
          llmCost,
          storyCalls,
          transCalls
        });
        setParentsList((parentRows||[]) as ParentRow[]);
        setChildrenList((childRows||[]) as ChildRow[]);
      }catch(e:any){
        if(!active)return;
        setError(e?.message||"Failed to load admin metrics");
      }finally{
        if(active)setLoading(false);
      }
    })();
    return()=>{active=false;};
  },[]);

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-lg font-semibold">Overview</div>
        <div className="text-xs text-white/50 flex gap-3">
          <Link to="/admin/ai-usage" className="underline hover:text-white/80">
            AI usage details
          </Link>
          <Link to="/admin/families" className="underline hover:text-white/80">
            Families
          </Link>
        </div>
      </div>

      {loading&&(
        <div className="text-sm text-white/70">Loading metrics…</div>
      )}
      {error&&(
        <div className="text-sm text-red-300">Error: {error}</div>
      )}

      {!loading&&!error&&(
        <>
          {/* Top-level metrics */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass rounded-2xl p-4">
              <div className="text-xs text-white/60 mb-1">Parents</div>
              <div className="text-2xl font-semibold">{metrics.parents}</div>
              <div className="text-xs text-white/50 mt-1">
                Distinct parent profiles
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <div className="text-xs text-white/60 mb-1">Children</div>
              <div className="text-2xl font-semibold">{metrics.children}</div>
              <div className="text-xs text-white/50 mt-1">
                Distinct child profiles
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <div className="text-xs text-white/60 mb-1">Wishlist items</div>
              <div className="text-2xl font-semibold">{metrics.wishlistItems}</div>
              <div className="text-xs text-white/50 mt-1">
                Cards, stickers, gifts created
              </div>
            </div>
          </div>

          {/* AI usage summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-xs text-white/60">AI images (30 days)</div>
                <Link to="/admin/ai-usage" className="text-[11px] underline text-white/60 hover:text-white">
                  view chart
                </Link>
              </div>
              <div className="text-2xl font-semibold">{metrics.aiImageCalls}</div>
              <div className="text-xs text-white/50 mt-1">
                Number of AI image generations (all sizes, all children)
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-xs text-white/60">AI image cost (30 days)</div>
                <Link to="/admin/ai-usage" className="text-[11px] underline text-white/60 hover:text-white">
                  breakdown
                </Link>
              </div>
              <div className="text-2xl font-semibold">
                ${metrics.aiImageCost.toFixed(4)}
              </div>
              <div className="text-xs text-white/50 mt-1">
                Sum of est_cost_usd from ai_image_audit
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div
                  className="text-xs text-white/60"
                  title="Based on ai_story_audit (stories) and ai_translate_audit (Hindi translations)"
                >
                  LLM (stories + translation)
                </div>
                <Link to="/admin/ai-usage" className="text-[11px] underline text-white/60 hover:text-white">
                  audit
                </Link>
              </div>
              <div className="text-2xl font-semibold">
                {metrics.llmCalls} calls
              </div>
              <div className="text-xs text-white/50 mt-1">
                ${metrics.llmCost.toFixed(4)} in last 30 days
              </div>
              <div className="text-[11px] text-white/60 mt-1">
                {metrics.storyCalls} story · {metrics.transCalls} translation
              </div>
            </div>
          </div>

          {/* Parent directory + recent children */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Parent directory table */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">
                  Parent directory (first {parentsList.length} rows)
                </div>
                <Link
                  to="/admin/families"
                  className="text-[11px] underline text-white/60 hover:text-white"
                >
                  manage families
                </Link>
              </div>

              {parentsList.length<1?(
                <div className="text-xs text-white/60">
                  No parent profiles visible for this admin user.
                </div>
              ):(
                <div className="overflow-x-auto text-xs">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-white/60">
                        <th className="text-left py-1 pr-2">Name</th>
                        <th className="text-left py-1 pr-2">Email</th>
                        <th className="text-left py-1 pr-2">Phone</th>
                        <th className="text-left py-1 pr-2">Family</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parentsList.map((p)=>(
                        <tr key={p.parent_uid} className="border-t border-white/5">
                          <td className="py-1 pr-2">
                            {(p.first_name||"").trim()} {(p.last_name||"").trim()}
                          </td>
                          <td className="py-1 pr-2">
                            {p.email||"—"}
                          </td>
                          <td className="py-1 pr-2">
                            {p.phone||"—"}
                          </td>
                          <td className="py-1 pr-2">
                            {p.family_id?p.family_id.slice(0,8):"no family"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent children */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">Recent children</div>
                <Link
                  to="/admin/families"
                  className="text-[11px] underline text-white/60 hover:text-white"
                >
                  manage
                </Link>
              </div>
              {childrenList.length<1?(
                <div className="text-xs text-white/60">
                  No child profiles found yet.
                </div>
              ):(
                <ul className="space-y-1 text-xs">
                  {childrenList.map((c)=>(
                    <li
                      key={c.child_uid}
                      className="flex items-center justify-between gap-2 border-b border-white/5 last:border-b-0 py-1"
                    >
                      <div className="truncate">
                        <div className="font-semibold truncate">
                          {c.nick_name||c.first_name}
                        </div>
                        <div className="text-white/60 truncate">
                          {c.first_name!==c.nick_name&&c.nick_name
                            ?`${c.first_name} (${c.nick_name})`
                            :c.first_name}
                        </div>
                      </div>
                      <div className="text-[11px] text-white/50">
                        {c.family_id?c.family_id.slice(0,8):"no family"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
