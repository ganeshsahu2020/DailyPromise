import {useEffect,useState}from "react";
import {supabase}from "@/lib/supabase";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
}from "recharts";

type DailyRow={
  day:string;
  images:number;
  usd:number;
  usdPerImage:number;
};

type ChildRow={
  child_uid:string;
  childName:string;
  familyName:string;
  images:number;
  usd:number;
};

type FamilyRow={
  family_id:string;
  familyName:string;
  images:number;
  usd:number;
};

type FeatureFlag={
  id:string;
  key:string;
  label:string|null;
  description:string|null;
  enabled:boolean;
};

type TextUsageRow={
  feature:"story"|"translate";
  day:string;
  calls:number;
  usd:number;
};

type TextTotals={
  feature:"story"|"translate";
  calls:number;
  usd:number;
};

type ChartView="day"|"week"|"month";

/* ------------------- Helpers: aggregate daily → week/month ------------------ */

function getWeekLabel(day:string){
  // Use Monday as week anchor, UTC to keep it deterministic
  const d=new Date(day+"T00:00:00Z");
  const dow=d.getUTCDay(); // 0=Sun..6=Sat
  const offset=(dow+6)%7;  // 0 for Mon, 6 for Sun
  d.setUTCDate(d.getUTCDate()-offset);
  return d.toISOString().slice(0,10); // YYYY-MM-DD (Monday-of-week)
}

function aggregateForView(daily:DailyRow[],view:ChartView):DailyRow[]{
  if(view==="day")return daily;

  const map=new Map<string,{images:number;usd:number}>();

  daily.forEach((row)=>{
    let key=row.day;
    if(view==="week"){
      key=getWeekLabel(row.day);
    }else if(view==="month"){
      key=row.day.slice(0,7); // YYYY-MM
    }
    const cur=map.get(key)||{images:0,usd:0};
    cur.images+=row.images;
    cur.usd+=row.usd;
    map.set(key,cur);
  });

  return Array.from(map.entries())
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([key,{images,usd}])=>({
      day:key,
      images,
      usd:+usd.toFixed(4),
      usdPerImage:images>0?+(usd/images).toFixed(4):0,
    }));
}

/* -------------------------------------------------------------------------- */

export default function AdminAiUsage(){
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|undefined>();

  const [daily,setDaily]=useState<DailyRow[]>([]);
  const [byChild,setByChild]=useState<ChildRow[]>([]);
  const [byFamily,setByFamily]=useState<FamilyRow[]>([]);

  const [textDaily,setTextDaily]=useState<TextUsageRow[]>([]);
  const [textTotals,setTextTotals]=useState<TextTotals[]>([]);

  const [flags,setFlags]=useState<FeatureFlag[]>([]);
  const [flagsSupported,setFlagsSupported]=useState(true);
  const [flagsError,setFlagsError]=useState<string|undefined>();
  const [flagsSaving,setFlagsSaving]=useState<string|undefined>();

  const [rangeDays,setRangeDays]=useState(30);
  const [tableMode,setTableMode]=useState<"daily"|"child"|"family">("daily");
  const [childFilter,setChildFilter]=useState("");
  const [chartView,setChartView]=useState<ChartView>("day");

  useEffect(()=>{
    let active=true;
    (async()=>{
      setLoading(true);
      setError(undefined);

      try{
        const since=new Date();
        since.setDate(since.getDate()-Math.max(1,rangeDays));
        const sinceIso=since.toISOString();

        // 1) Raw AI image audit rows (rangeDays)
        const {data:auditRows,error:auditErr}=await supabase
          .from("ai_image_audit")
          .select("created_at,est_cost_usd,n_images,child_uid")
          .gte("created_at",sinceIso);

        if(auditErr)throw auditErr;

        const rows=auditRows||[];

        // 2) Child + family reference data
        const [{data:childRows,error:childErr},{data:familyRows,error:familyErr}] =
          await Promise.all([
            supabase
              .from("child_profiles")
              .select("child_uid,first_name,nick_name,family_id"),
            supabase
              .from("families")
              .select("id,display_name"),
          ]);

        if(childErr)throw childErr;
        if(familyErr)throw familyErr;

        const childMap=new Map<string,{first_name:string;nick_name:string|null;family_id:string|null}>();
        (childRows||[]).forEach((c:any)=>{
          childMap.set(c.child_uid,{
            first_name:c.first_name,
            nick_name:c.nick_name ?? null,
            family_id:c.family_id ?? null,
          });
        });

        const familyMap=new Map<string,string>();
        (familyRows||[]).forEach((f:any)=>{
          familyMap.set(f.id,f.display_name||"Family");
        });

        // 3) Aggregate per-day
        const dayMap=new Map<string,{images:number;usd:number}>();
        rows.forEach((r:any)=>{
          const day=(r.created_at as string).slice(0,10);
          const n=typeof r.n_images==="number"&&r.n_images>0?r.n_images:1;
          const usd=typeof r.est_cost_usd==="number"?r.est_cost_usd:0;
          const cur=dayMap.get(day)||{images:0,usd:0};
          cur.images+=n;
          cur.usd+=usd;
          dayMap.set(day,cur);
        });

        const dailyArr:Array<DailyRow>=Array.from(dayMap.entries())
          .sort((a,b)=>a[0].localeCompare(b[0]))
          .map(([day,{images,usd}])=>({
            day,
            images,
            usd:+usd.toFixed(4),
            usdPerImage:images>0?+(usd/images).toFixed(4):0,
          }));

        // 4) Aggregate per-child
        const childAgg=new Map<string,{images:number;usd:number}>();
        rows.forEach((r:any)=>{
          const id=r.child_uid as string|undefined|null;
          if(!id)return;
          const n=typeof r.n_images==="number"&&r.n_images>0?r.n_images:1;
          const usd=typeof r.est_cost_usd==="number"?r.est_cost_usd:0;
          const cur=childAgg.get(id)||{images:0,usd:0};
          cur.images+=n;
          cur.usd+=usd;
          childAgg.set(id,cur);
        });

        const childArr:Array<ChildRow>=Array.from(childAgg.entries()).map(([child_uid,{images,usd}])=>{
          const info=childMap.get(child_uid);
          const name=info
            ?(info.nick_name||info.first_name||"Child")
            :"Child";
          const famName=info?.family_id?familyMap.get(info.family_id)||"Family":"Family";
          return{
            child_uid,
            childName:name,
            familyName:famName,
            images,
            usd:+usd.toFixed(4),
          };
        }).sort((a,b)=>b.usd-a.usd);

        // 5) Aggregate per-family (from childArr so we reuse names)
        const famAgg=new Map<string,{name:string;images:number;usd:number}>();
        childArr.forEach((c)=>{
          const fid=(childMap.get(c.child_uid)?.family_id)||"unknown";
          const fname=fid==="unknown"?"Unlinked":(familyMap.get(fid)||"Family");
          const cur=famAgg.get(fid)||{name:fname,images:0,usd:0};
          cur.images+=c.images;
          cur.usd+=c.usd;
          famAgg.set(fid,cur);
        });

        const famArr:Array<FamilyRow>=Array.from(famAgg.entries())
          .map(([family_id,{name,images,usd}])=>({
            family_id,
            familyName:name,
            images,
            usd:+usd.toFixed(4),
          }))
          .sort((a,b)=>b.usd-a.usd);

        // 1b) Story + translation audit rows (rangeDays)
        const [{data:storyAudit,error:storyAuditErr},{data:transAudit,error:transAuditErr}] =
          await Promise.all([
            supabase
              .from("ai_story_audit")
              .select("created_at,est_cost_usd")
              .gte("created_at",sinceIso),
            supabase
              .from("ai_translate_audit")
              .select("created_at,est_cost_usd")
              .gte("created_at",sinceIso),
          ]);

        if(storyAuditErr)throw storyAuditErr;
        if(transAuditErr)throw transAuditErr;

        const textDayMap=new Map<string,{storyUsd:number;transUsd:number;storyCalls:number;transCalls:number}>();

        (storyAudit||[]).forEach((r:any)=>{
          const day=(r.created_at as string).slice(0,10);
          const usd=typeof r.est_cost_usd==="number"?r.est_cost_usd:0;
          const cur=textDayMap.get(day)||{storyUsd:0,transUsd:0,storyCalls:0,transCalls:0};
          cur.storyUsd+=usd;
          cur.storyCalls+=1;
          textDayMap.set(day,cur);
        });

        (transAudit||[]).forEach((r:any)=>{
          const day=(r.created_at as string).slice(0,10);
          const usd=typeof r.est_cost_usd==="number"?r.est_cost_usd:0;
          const cur=textDayMap.get(day)||{storyUsd:0,transUsd:0,storyCalls:0,transCalls:0};
          cur.transUsd+=usd;
          cur.transCalls+=1;
          textDayMap.set(day,cur);
        });

        const textDailyArr:TextUsageRow[]=[];
        textDayMap.forEach((v,day)=>{
          if(v.storyCalls>0){
            textDailyArr.push({
              feature:"story",
              day,
              calls:v.storyCalls,
              usd:+v.storyUsd.toFixed(4),
            });
          }
          if(v.transCalls>0){
            textDailyArr.push({
              feature:"translate",
              day,
              calls:v.transCalls,
              usd:+v.transUsd.toFixed(4),
            });
          }
        });

        // Totals over rangeDays
        let storyCalls=0,storyUsd=0,transCalls=0,transUsd=0;
        textDailyArr.forEach((r)=>{
          if(r.feature==="story"){
            storyCalls+=r.calls;
            storyUsd+=r.usd;
          }else{
            transCalls+=r.calls;
            transUsd+=r.usd;
          }
        });

        const totals:TextTotals[]=[
          {feature:"story",calls:storyCalls,usd:+storyUsd.toFixed(4)},
          {feature:"translate",calls:transCalls,usd:+transUsd.toFixed(4)},
        ];

        if(!active)return;

        setDaily(dailyArr);
        setByChild(childArr);
        setByFamily(famArr);
        setTextDaily(textDailyArr.sort((a,b)=>a.day.localeCompare(b.day)));
        setTextTotals(totals);

        // 6) Optional feature_flags (do NOT fail page if missing)
        try{
          const {data:flagRows,error:flagErr}=await supabase
            .from("feature_flags")
            .select("id,key,label,description,enabled");

          if(flagErr){
            const msg=flagErr.message||"";
            if(/feature_flags/i.test(msg)||/schema cache/i.test(msg)){
              setFlagsSupported(false);
              setFlagsError("feature_flags table not found; switches disabled for now.");
            }else{
              setFlagsSupported(false);
              setFlagsError("Feature flags unavailable.");
            }
          }else{
            setFlagsSupported(true);
            setFlags((flagRows||[]) as FeatureFlag[]);
          }
        }catch(e:any){
          setFlagsSupported(false);
          setFlagsError("Feature flags unavailable.");
        }
      }catch(e:any){
        if(!active)return;
        setError(e?.message||"Failed to load AI usage");
      }finally{
        if(active)setLoading(false);
      }
    })();
    return()=>{active=false;};
  },[rangeDays]);

  async function toggleFlag(id:string,current:boolean){
    setFlagsSaving(id);
    try{
      const next=!current;
      setFlags((prev)=>prev.map((f)=>f.id===id?{...f,enabled:next}:f));

      const {error}=await supabase
        .from("feature_flags")
        .update({enabled:next})
        .eq("id",id);

      if(error){
        // rollback
        setFlags((prev)=>prev.map((f)=>f.id===id?{...f,enabled:current}:f));
        console.error("feature_flags update error",error);
      }
    }finally{
      setFlagsSaving(undefined);
    }
  }

  const filteredChildren=tableMode==="child"
    ?byChild.filter((c)=>{
      if(!childFilter.trim())return true;
      const q=childFilter.toLowerCase();
      return c.childName.toLowerCase().includes(q)||c.familyName.toLowerCase().includes(q);
    })
    :byChild;

  const chartData=aggregateForView(daily,chartView);

  const textDailySorted=textDaily.slice().sort((a,b)=>{
    if(a.day===b.day){
      if(a.feature===b.feature)return 0;
      return a.feature==="story"?-1:1;
    }
    return a.day.localeCompare(b.day);
  });

  const selectBase="bg-slate-900 text-white border border-white/20 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400";
  const inputBase="bg-slate-900 text-white border border-white/20 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400";

  return(
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold">AI usage &amp; cost</div>
        <div className="text-xs text-white/60">
          Last {rangeDays} days · based on ai_image_audit, ai_story_audit, ai_translate_audit
        </div>
      </div>

      {loading&&(
        <div className="text-sm text-white/70">Loading AI metrics…</div>
      )}
      {error&&(
        <div className="text-sm text-red-300">Error: {error}</div>
      )}

      {!loading&&!error&&(
        <>
          {/* Time-series chart */}
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="text-sm font-semibold">Image usage over time</div>
              <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-white/60">
                <div className="flex items-center gap-1">
                  <span>Range</span>
                  <select
                    className={selectBase}
                    style={{backgroundColor:"#020617",color:"#f9fafb"}}
                    value={rangeDays}
                    onChange={(e)=>setRangeDays(Number(e.target.value)||7)}
                  >
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span>View</span>
                  <div className="flex rounded-full bg-white/5 p-0.5">
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded-full ${chartView==="day"?"bg-white text-black":"text-white/70"}`}
                      onClick={()=>setChartView("day")}
                    >
                      Day
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded-full ${chartView==="week"?"bg-white text-black":"text-white/70"}`}
                      onClick={()=>setChartView("week")}
                    >
                      Week
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded-full ${chartView==="month"?"bg-white text-black":"text-white/70"}`}
                      onClick={()=>setChartView("month")}
                    >
                      Month
                    </button>
                  </div>
                </div>
                <div>Hover for exact images &amp; USD</div>
              </div>
            </div>
            {chartData.length<1?(
              <div className="text-xs text-white/60">
                No AI image activity in the selected window.
              </div>
            ):(
              <div className="h-64 w-full min-h-[16rem]" style={{minWidth:220}}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)"/>
                    <XAxis
                      dataKey="day"
                      tick={{fontSize:11,fill:"rgba(248,250,252,0.8)"}}
                      stroke="rgba(248,250,252,0.4)"
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{fontSize:11,fill:"rgba(248,250,252,0.8)"}}
                      stroke="rgba(248,250,252,0.4)"
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{fontSize:11,fill:"rgba(248,250,252,0.8)"}}
                      stroke="rgba(248,250,252,0.4)"
                    />
                    <Tooltip
                      contentStyle={{backgroundColor:"#020617",border:"1px solid rgba(148,163,184,0.6)"}}
                      labelStyle={{color:"#e5e7eb"}}
                    />
                    <Legend wrapperStyle={{color:"#e5e7eb"}}/>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="images"
                      name="Images"
                      dot={false}
                      stroke="#38bdf8"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="usd"
                      name="USD"
                      dot={false}
                      stroke="#22c55e"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Per-child / per-family breakdown */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="glass rounded-2xl p-4">
              <div className="text-sm font-semibold mb-2">
                Top children by image cost ({rangeDays} days)
              </div>
              {byChild.length<1?(
                <div className="text-xs text-white/60">
                  No child-linked AI usage recorded yet.
                </div>
              ):(
                <div className="overflow-x-auto text-xs">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-white/60">
                        <th className="text-left py-1 pr-2">Child</th>
                        <th className="text-left py-1 pr-2">Family</th>
                        <th className="text-right py-1 pr-2">Images</th>
                        <th className="text-right py-1">USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byChild.slice(0,8).map((c)=>(
                        <tr key={c.child_uid} className="border-t border-white/5">
                          <td className="py-1 pr-2">{c.childName}</td>
                          <td className="py-1 pr-2">{c.familyName}</td>
                          <td className="py-1 pr-2 text-right">{c.images}</td>
                          <td className="py-1 text-right">${c.usd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="glass rounded-2xl p-4">
              <div className="text-sm font-semibold mb-2">
                Families by image cost ({rangeDays} days)
              </div>
              {byFamily.length<1?(
                <div className="text-xs text-white/60">
                  No family-level AI usage recorded yet.
                </div>
              ):(
                <div className="h-64 w-full min-h-[16rem]" style={{minWidth:220}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byFamily.slice(0,8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)"/>
                      <XAxis
                        dataKey="familyName"
                        tick={{fontSize:10,fill:"rgba(248,250,252,0.8)"}}
                        stroke="rgba(248,250,252,0.4)"
                      />
                      <YAxis
                        tick={{fontSize:11,fill:"rgba(248,250,252,0.8)"}}
                        stroke="rgba(248,250,252,0.4)"
                      />
                      <Tooltip
                        contentStyle={{backgroundColor:"#020617",border:"1px solid rgba(148,163,184,0.6)"}}
                        labelStyle={{color:"#e5e7eb"}}
                      />
                      <Bar dataKey="usd" name="USD" fill="#22c55e"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* LLM (story + translation) usage summary + per-day table */}
          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-semibold mb-2">
              Story &amp; Hindi translation usage ({rangeDays} days)
            </div>
            {textTotals.length<1?(
              <div className="text-xs text-white/60">
                No story or translation usage recorded in the selected window.
              </div>
            ):(
              <>
                <div className="overflow-x-auto text-xs">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-white/60">
                        <th className="text-left py-1 pr-2">Feature</th>
                        <th className="text-right py-1 pr-2">Calls</th>
                        <th className="text-right py-1 pr-2">USD ({rangeDays} days)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {textTotals.map((t)=>(
                        <tr key={t.feature} className="border-t border-white/5">
                          <td className="py-1 pr-2">
                            {t.feature==="story"?"Story generation":"Hindi translation"}
                          </td>
                          <td className="py-1 pr-2 text-right">{t.calls}</td>
                          <td className="py-1 pr-2 text-right">${t.usd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Per-day LLM breakdown */}
                <div className="mt-4">
                  <div className="text-xs font-semibold mb-1 text-white/70">
                    Per-day LLM usage (story vs translation)
                  </div>
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="text-white/60">
                          <th className="text-left py-1 pr-2">Day</th>
                          <th className="text-left py-1 pr-2">Feature</th>
                          <th className="text-right py-1 pr-2">Calls</th>
                          <th className="text-right py-1 pr-2">USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {textDailySorted.map((r)=>(
                          <tr
                            key={`${r.day}-${r.feature}`}
                            className="border-t border-white/5"
                          >
                            <td className="py-1 pr-2">{r.day}</td>
                            <td className="py-1 pr-2">
                              {r.feature==="story"?"Story":"Translate"}
                            </td>
                            <td className="py-1 pr-2 text-right">{r.calls}</td>
                            <td className="py-1 pr-2 text-right">${r.usd.toFixed(4)}</td>
                          </tr>
                        ))}
                        {textDailySorted.length<1&&(
                          <tr>
                            <td className="py-2 text-center text-white/50" colSpan={4}>
                              No daily LLM usage rows.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Usage tables & filters */}
          <div className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="text-sm font-semibold">
                Usage tables &amp; filters
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-white/60">Table</span>
                  <div className="flex rounded-full bg-white/5 p-0.5">
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded-full ${tableMode==="daily"?"bg-white text-black":"text-white/70"}`}
                      onClick={()=>setTableMode("daily")}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded-full ${tableMode==="child"?"bg-white text-black":"text-white/70"}`}
                      onClick={()=>setTableMode("child")}
                    >
                      By child
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded-full ${tableMode==="family"?"bg-white text-black":"text-white/70"}`}
                      onClick={()=>setTableMode("family")}
                    >
                      By family
                    </button>
                  </div>
                </div>
                {tableMode==="child"&&(
                  <div className="flex items-center gap-1">
                    <span className="text-white/60">Filter</span>
                    <input
                      type="text"
                      value={childFilter}
                      onChange={(e)=>setChildFilter(e.target.value)}
                      placeholder="child or family name"
                      className={inputBase+" min-w-[160px]"}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Tables */}
            <div className="overflow-x-auto text-xs">
              {tableMode==="daily"&&(
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-white/60">
                      <th className="text-left py-1 pr-2">Day</th>
                      <th className="text-right py-1 pr-2">Images</th>
                      <th className="text-right py-1 pr-2">USD</th>
                      <th className="text-right py-1 pr-2">USD/image</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((d)=>(
                      <tr key={d.day} className="border-t border-white/5">
                        <td className="py-1 pr-2">{d.day}</td>
                        <td className="py-1 pr-2 text-right">{d.images}</td>
                        <td className="py-1 pr-2 text-right">${d.usd.toFixed(4)}</td>
                        <td className="py-1 pr-2 text-right">${d.usdPerImage.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tableMode==="child"&&(
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-white/60">
                      <th className="text-left py-1 pr-2">Child</th>
                      <th className="text-left py-1 pr-2">Family</th>
                      <th className="text-right py-1 pr-2">Images</th>
                      <th className="text-right py-1 pr-2">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChildren.map((c)=>(
                      <tr key={c.child_uid} className="border-t border-white/5">
                        <td className="py-1 pr-2">{c.childName}</td>
                        <td className="py-1 pr-2">{c.familyName}</td>
                        <td className="py-1 pr-2 text-right">{c.images}</td>
                        <td className="py-1 pr-2 text-right">${c.usd.toFixed(4)}</td>
                      </tr>
                    ))}
                    {filteredChildren.length<1&&(
                      <tr>
                        <td className="py-2 text-center text-white/50" colSpan={4}>
                          No children match this filter in the selected window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {tableMode==="family"&&(
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-white/60">
                      <th className="text-left py-1 pr-2">Family</th>
                      <th className="text-right py-1 pr-2">Images</th>
                      <th className="text-right py-1 pr-2">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byFamily.map((f)=>(
                      <tr key={f.family_id} className="border-t border-white/5">
                        <td className="py-1 pr-2">{f.familyName}</td>
                        <td className="py-1 pr-2 text-right">{f.images}</td>
                        <td className="py-1 pr-2 text-right">${f.usd.toFixed(4)}</td>
                      </tr>
                    ))}
                    {byFamily.length<1&&(
                      <tr>
                        <td className="py-2 text-center text-white/50" colSpan={3}>
                          No family usage in the selected window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Feature flags (optional) */}
          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-semibold mb-2">
              Feature switches
            </div>
            {!flagsSupported&&(
              <div className="text-xs text-white/60">
                {flagsError||"Feature flags table not found; switches disabled for now."}
              </div>
            )}
            {flagsSupported&&flags.length<1&&(
              <div className="text-xs text-white/60">
                No feature flags configured yet. You can seed rows in <code>public.feature_flags</code>
                &nbsp;for things like <code>ai_images</code>, <code>games</code>, etc.
              </div>
            )}
            {flagsSupported&&flags.length>0&&(
              <div className="space-y-2 text-xs">
                {flags.map((f)=>(
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-3 border border-white/10 rounded-xl px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold text-sm">
                        {f.label||f.key}
                      </div>
                      <div className="text-white/60">
                        {f.description||f.key}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={()=>toggleFlag(f.id,f.enabled)}
                      disabled={flagsSaving===f.id}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        f.enabled
                          ?"bg-emerald-500/80 text-black"
                          :"bg-white/10 text-white/80"
                      }`}
                    >
                      {flagsSaving===f.id?"…":f.enabled?"On":"Off"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
