import React,{useMemo,useEffect,useRef,useState} from "react";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  AreaChart, Area
} from "recharts";
import {Target as TargetIcon,TrendingUp,Award,Sparkles,Zap} from "lucide-react";

/* ----------------------------- Types ----------------------------- */
type Child={id?:string;child_uid:string;first_name:string;last_name:string|null;nick_name:string|null;age:number|null;avatar_url?:string|null;avatar_path?:string|null;};
type Family={id:string;display_name:string|null};
type KPIs={completed:number;active:number;weeklyCheckins:number;totalPoints:number};
type Wallet={rewards_total:number;available_points?:number};
type EarnBreakdown={daily:number;checklists:number;games:number;targets:number;wishlist:number;rewardsBonus:number;total:number;};
type DayRow={date:string;pts:number};

interface PdfReportProps{
  child:Child|null;
  family:Family|null;
  kpis:KPIs;
  wallet:Wallet|null;
  earn:EarnBreakdown;
  series30:DayRow[];
  period:string;
  avatarUrl?:string;
}

/* ----------------------- Print/visibility helper ----------------------- */
/* Mobile-only: charts get a left-anchored inner wrapper with a max width. */
const PrintableChart:React.FC<{children:React.ReactNode;minHeight?:number}>=({children,minHeight=260})=>{
  const ref=useRef<HTMLDivElement|null>(null);
  const [canRender,setCanRender]=useState(false);
  const printingRef=useRef(false);

  useEffect(()=>{
    const el=ref.current;
    if(!el){setCanRender(false);return;}

    const isMeasurable=()=>{
      try{
        if(!el.isConnected) return false;
        const cs=window.getComputedStyle(el);
        if(cs.display==="none"||cs.visibility==="hidden"||cs.opacity==="0") return false;
        const r=el.getBoundingClientRect();
        const width=Math.max(0,Math.round(r.width));
        return width>=8; // height is numeric below via minHeight
      }catch{return false;}
    };

    const check=()=>{setCanRender(Boolean(isMeasurable()||printingRef.current));};
    check();

    let ro:ResizeObserver|null=null;
    try{ro=new ResizeObserver(check);ro.observe(el);}catch{
      window.addEventListener("resize",check);
      window.addEventListener("orientationchange",check);
    }

    const beforePrint=()=>{printingRef.current=true;check();};
    const afterPrint=()=>{printingRef.current=false;check();};
    window.addEventListener("beforeprint",beforePrint);
    window.addEventListener("afterprint",afterPrint);

    return ()=>{
      if(ro) ro.disconnect();
      window.removeEventListener("resize",check);
      window.removeEventListener("orientationchange",check);
      window.removeEventListener("beforeprint",beforePrint);
      window.removeEventListener("afterprint",afterPrint);
    };
  },[]);

  return (
    <div ref={ref} className="chart-wrapper chart-left min-w-0" style={{width:"100%",minHeight}}>
      {canRender?(
        <div className="chart-inner">
          {/* ✅ Give ResponsiveContainer a concrete height to avoid (-1) */}
          <ResponsiveContainer width="100%" height={minHeight}>{children}</ResponsiveContainer>
        </div>
      ):(
        <div aria-hidden className="chart-inner" style={{width:"100%",minHeight}}/>
      )}
    </div>
  );
};

/* --------------------------- Component --------------------------- */
export default function PdfReportPreview({child,family,kpis,wallet,earn,series30,period,avatarUrl}:PdfReportProps){
  const safeSeries30=useMemo(()=>{
    if(Array.isArray(series30)&&series30.length>0) return series30;
    const today=new Date();
    return new Array(7).fill(0).map((_,i)=>{
      const d=new Date(today); d.setDate(today.getDate()-(6-i));
      return {date:d.toISOString().slice(0,10),pts:0};
    });
  },[series30]);

  const completionData=useMemo(()=>[
    {name:"Completed",value:Math.max(0,kpis.completed||0),color:"#10b981"},
    {name:"Active",value:Math.max(0,kpis.active||0),color:"#3b82f6"},
  ],[kpis.completed,kpis.active]);

  const weeklyActivity=useMemo(()=>{
    const total=Math.max(0,kpis.weeklyCheckins||0);
    const base=[2,1,3,4,2,5,1];
    const sum=base.reduce((s,n)=>s+n,0)||1;
    return base.map((n,i)=>({
      day:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i],
      activity:Math.round((n/sum)*total),
      points:Math.round((n/sum)*total)*10
    }));
  },[kpis.weeklyCheckins]);

  const earnPie=useMemo(()=>{
    const d=[
      {name:"Daily Activities",value:earn.daily||0,color:"#10b981"},
      {name:"Checklists",value:earn.checklists||0,color:"#3b82f6"},
      {name:"Games",value:earn.games||0,color:"#8b5cf6"},
      {name:"Targets",value:earn.targets||0,color:"#06b6d4"},
      {name:"Wishlist",value:earn.wishlist||0,color:"#ec4899"},
      {name:"Other/Adjust",value:Math.max(0,earn.rewardsBonus||0),color:"#f59e0b"},
    ];
    return d.filter((x)=>Number(x.value)>0);
  },[earn]);

  /* --- Weekly aggregation for the trend --- */
  const weeklyTrend=useMemo(()=>{
    // Group days by Monday-start week
    const bucket=new Map<string,{week:string;pts:number}>();
    for(const row of safeSeries30){
      const d=new Date(row.date+"T00:00:00");
      const day=d.getDay(); // 0..6 (Sun..Sat)
      const diff=(day+6)%7; // days since Monday
      const monday=new Date(d); monday.setDate(d.getDate()-diff);
      monday.setHours(0,0,0,0);
      const key=monday.toISOString().slice(0,10);
      const label=monday.toLocaleDateString("en-US",{month:"short",day:"numeric"});
      const curr=bucket.get(key)||{week:label,pts:0};
      curr.pts+=Number(row.pts||0);
      bucket.set(key,curr);
    }
    return Array.from(bucket.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([,v])=>v);
  },[safeSeries30]);

  const performanceMetrics=useMemo(()=>[
    {label:"Consistency",value:85,icon:<TrendingUp className="lucide"/>,color:"#10b981"},
    {label:"Engagement",value:92,icon:<Zap className="lucide"/>,color:"#f59e0b"},
    {label:"Completion",value:78,icon:<TargetIcon className="lucide"/>,color:"#3b82f6"},
    {label:"Progress",value:88,icon:<Sparkles className="lucide"/>,color:"#8b5cf6"},
  ],[]);

  const friendlyName=child?.nick_name||child?.first_name||"Child";

  return (
    <div
      id="professional-report"
      role="document"
      className="min-w-0"
      style={{
        boxSizing:"border-box",
        maxWidth:1200,margin:"0 auto",padding:24,
        background:"linear-gradient(180deg,#0b1220 0%, #0f2430 100%)",
        color:"#e6eef8",borderRadius:12,
        fontFamily:`Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial`,
        overflowWrap:"break-word",wordBreak:"break-word"
      }}
    >
      <style>{`
        @media print{
          #professional-report{background:#fff!important;color:#111!important;padding:8px!important;max-width:100%!important;border-radius:0!important}
          .chart-wrapper{min-height:300px!important}
          .glass-card{box-shadow:none!important;background:#fff!important;border:1px solid #e6eef4!important;color:#111!important}
        }
        .report-grid{display:grid;gap:18px;grid-template-columns:1fr}
        @media(min-width:900px){.report-grid{grid-template-columns:360px 1fr}}
        .glass-card{border-radius:12px;padding:18px;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.01));border:1px solid rgba(255,255,255,.04);backdrop-filter:blur(6px) saturate(120%);box-shadow:0 8px 30px rgba(2,6,23,.6)}
        .kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
        @media(min-width:640px){.kpi-grid{grid-template-columns:repeat(4,1fr)}}
        .kpi{border-radius:10px;padding:12px;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.01));border:1px solid rgba(255,255,255,.03);text-align:center}
        .chart-container{border-radius:10px;padding:12px;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.01));border:1px solid rgba(255,255,255,.03);min-height:260px;display:flex;flex-direction:column}
        .earn-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        @media(max-width:640px){.earn-grid{grid-template-columns:repeat(2,1fr)}}
        .muted{color:rgba(230,238,248,.7)}
        .small{font-size:.9rem}

        /* === MOBILE-ONLY CHART TUNING === */
        .chart-left{display:flex;justify-content:flex-start}
        .chart-inner{width:100%} /* no fixed height; ResponsiveContainer uses minHeight prop */
        @media(max-width:640px){
          .chart-inner{max-width:380px;margin-right:auto}
        }
        @media(max-width:400px){
          .chart-inner{max-width:340px}
        }
      `}</style>

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 flex-wrap min-w-0 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0"
            style={{
              width:72,height:72,borderRadius:14,display:"grid",placeItems:"center",
              background:"linear-gradient(90deg,#7c3aed,#06b6d4,#10b981)",boxShadow:"0 8px 30px rgba(7,9,23,.6)"
            }}
            aria-hidden
          >
            <Award style={{color:"white",width:34,height:34}}/>
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-[20px] sm:text-[22px] leading-tight break-words">{`Child Progress Report`}</div>
            <div className="muted header-meta mt-1 break-words">
              {family?.display_name?<strong style={{color:"#dbeafe"}}>{family.display_name} Family • </strong>:null}
              Generated {new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}
            </div>
          </div>
        </div>

        <div className="text-left sm:text-right min-w-0">
          <div className="muted">Period</div>
          <div className="font-bold break-words">{period}</div>
        </div>
      </header>

      <div className="report-grid">
        {/* Left column */}
        <aside className="flex flex-col gap-3 min-w-0">
          <section className="glass-card min-w-0" aria-label="Student profile">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#0f1724] shrink-0">
                {avatarUrl?(
                  <img src={avatarUrl} alt={`${friendlyName} avatar`} className="w-full h-full object-cover"/>
                ):(
                  <div className="w-full h-full grid place-items-center text-2xl">👤</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-base sm:text-[16px]">{friendlyName}</div>
                <div className="muted small">Age: {child?.age??"—"}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="p-2.5 rounded-lg text-center" style={{background:"linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.01))"}}>
                <div className="text-[18px] font-extrabold text-sky-300">{wallet?.rewards_total??0}</div>
                <div className="small muted">Rewards</div>
              </div>
              <div className="p-2.5 rounded-lg text-center" style={{background:"linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.01))"}}>
                <div className="text-[18px] font-extrabold text-emerald-300">{wallet?.available_points??0}</div>
                <div className="small muted">Available</div>
              </div>
            </div>
          </section>

          <section className="glass-card min-w-0" aria-label="Earnings breakdown">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 3v5" stroke="#c7e8ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div className="font-bold">Earnings</div>
              </div>
              <div className="muted small">Lifetime</div>
            </div>

            <div className="earn-grid">
              {[
                {label:"Daily",val:earn.daily},
                {label:"Checklists",val:earn.checklists},
                {label:"Games",val:earn.games},
                {label:"Targets",val:earn.targets},
                {label:"Wishlist",val:earn.wishlist},
                {label:"Adjustments",val:Math.max(0,earn.rewardsBonus)},
              ].map((r,i)=>(
                <div key={i} className="p-2.5 rounded-lg text-center min-w-0" style={{background:"rgba(255,255,255,.02)"}}>
                  <div className="font-extrabold">{r.val}</div>
                  <div className="muted small">{r.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-2 text-[12px]">
              Adjustment to match wallet:{" "}
              <strong style={{color:(earn.total||0)>=0?"#34d399":"#fb7185"}}>{earn.total}</strong>
            </div>
          </section>

          <section className="glass-card min-w-0" aria-label="Recommendations">
            <div className="font-bold mb-2">Recommendations</div>
            <ul className="list-disc pl-5 m-0 space-y-1">
              <li className="small">Keep daily check-ins consistent</li>
              <li className="small">Encourage more varied and challenging targets</li>
              <li className="small">Balance activities between play and learning tasks</li>
            </ul>
          </section>
        </aside>

        {/* Right column */}
        <main className="flex flex-col gap-3 min-w-0">
          <section className="glass-card min-w-0" aria-label="Key performance indicators">
            <div className="kpi-grid">
              {[
                {label:"Targets Completed",value:kpis.completed},
                {label:"Active Targets",value:kpis.active},
                {label:"Weekly Check-ins",value:kpis.weeklyCheckins},
                {label:"Total Points",value:kpis.totalPoints},
              ].map((k)=>(
                <div key={k.label} className="kpi min-w-0">
                  <div className="text-[18px] font-extrabold">{k.value}</div>
                  <div className="muted small">{k.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card min-w-0" aria-label="Performance overview">
            <div className="font-bold mb-3">Performance Overview</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {performanceMetrics.map((m,i)=>(
                <div key={i} className="text-center p-2 min-w-0">
                  <div className="inline-grid place-items-center w-11 h-11 rounded-lg" style={{background:"linear-gradient(90deg,#7c3aed,#06b6d4)"}}>
                    {React.cloneElement(m.icon as any,{style:{color:"white",width:18,height:18}})}
                  </div>
                  <div className="font-extrabold mt-2">{m.value}%</div>
                  <div className="muted small">{m.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card min-w-0" aria-label="Detailed analytics">
            <div className="font-bold mb-3">Detailed Analytics</div>

            <div className="grid grid-cols-1 gap-3">
              {/* Completion ratio */}
              <div className="chart-container min-w-0" aria-label="Target completion ratio">
                <div className="font-semibold mb-2 tight-label">Target Completion Ratio</div>
                <PrintableChart minHeight={240}>
                  <PieChart>
                    <Pie
                      data={completionData}
                      dataKey="value"
                      outerRadius={80}
                      label={({name,percent})=>`${name}: ${(percent*100).toFixed(1)}%`}
                    >
                      {completionData.map((e,i)=>(<Cell key={i} fill={e.color}/>))}
                    </Pie>
                    <Tooltip formatter={(v)=>[`${v} targets`,"Count"]}/>
                    <Legend/>
                  </PieChart>
                </PrintableChart>
              </div>

              {/* Weekly activity */}
              <div className="chart-container min-w-0" aria-label="Weekly activity pattern">
                <div className="font-semibold mb-2 tight-label">Weekly Activity Pattern</div>
                <PrintableChart minHeight={240}>
                  <BarChart data={weeklyActivity} margin={{left:8,right:8}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1b2630"/>
                    <XAxis dataKey="day" stroke="#cfe6ff"/>
                    <YAxis stroke="#cfe6ff"/>
                    <Tooltip formatter={(v,n)=>n==="activity"?[v,"Activities"]:[v,"Points"]}/>
                    <Legend/>
                    <Bar dataKey="activity" name="Activities" radius={[6,6,0,0]} fill="#3b82f6"/>
                    <Bar dataKey="points" name="Points Earned" radius={[6,6,0,0]} fill="#10b981"/>
                  </BarChart>
                </PrintableChart>
              </div>

              {/* Earnings distribution */}
              <div className="chart-container min-w-0" aria-label="Earnings distribution">
                <div className="font-semibold mb-2 tight-label">Earnings Distribution</div>
                <PrintableChart minHeight={240}>
                  <PieChart>
                    <Pie
                      data={earnPie}
                      dataKey="value"
                      outerRadius={80}
                      label={({name,percent})=>`${name}: ${(percent*100).toFixed(1)}%`}
                    >
                      {earnPie.map((e,i)=>(<Cell key={i} fill={e.color}/>))}
                    </Pie>
                    <Tooltip formatter={(v)=>[`${v} points`,"Earnings"]}/>
                    <Legend/>
                  </PieChart>
                </PrintableChart>
              </div>

              {/* Weekly Performance Trend */}
              <div className="chart-container min-w-0" aria-label="Weekly performance trend">
                <div className="font-semibold mb-2 tight-label">Weekly Performance Trend</div>
                <PrintableChart minHeight={240}>
                  <AreaChart data={weeklyTrend} margin={{left:8,right:8}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1b2630"/>
                    <XAxis dataKey="week" stroke="#cfe6ff"/>
                    <YAxis stroke="#cfe6ff"/>
                    <Tooltip formatter={(v)=>[v,"Points Earned (Weekly)"]}/>
                    <Legend/>
                    <Area type="monotone" dataKey="pts" name="Points Earned" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12}/>
                  </AreaChart>
                </PrintableChart>
              </div>
            </div>
          </section>
        </main>
      </div>

      <footer className="mt-4 text-center text-[13px] text-white/70 sm:text-white/70">
        <div className="small">This comprehensive report was generated by the DailyPromise Education System.</div>
        <div className="mt-1 text-[12px]">{friendlyName}'s Progress Report • {new Date().getFullYear()}</div>
      </footer>
    </div>
  );
}
