// src/routes/parent/ParentRedemptions.tsx
import {useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "@/lib/supabase";
import {tpromise} from "@/utils/toastx";
import {toast} from "sonner";
import {Check,X,HandCoins,BadgeDollarSign,Loader2,FileDown} from "lucide-react";

type Status="Requested"|"Approved"|"Rejected"|"Accepted"|"Fulfilled"|"Cancelled";
type Row={
  id:string;
  family_id:string|null;
  child_uid:string;
  requested_points:number;
  cad_per_point:number;
  currency_cents:number;
  note:string|null;
  status:Status;
  requested_at:string;
  decided_at:string|null;
  decided_by:string|null;
  accepted_at:string|null;
  fulfilled_at:string|null;
};

type ChildMeta={name:string;nick?:string|null;emoji?:string|null};

const ALL:"All"="All";
type FilterKey=Status|"All";
const FILTERS:FilterKey[]=[ALL,"Requested","Approved","Accepted","Fulfilled","Rejected","Cancelled"];

// 💱 FX config (override via Vite env if you like)
const FX_USD_PER_CAD=Number(import.meta.env.VITE_FX_USD_PER_CAD ?? "0.75"); // 1 CAD ≈ 0.75 USD
const FX_INR_PER_CAD=Number(import.meta.env.VITE_FX_INR_PER_CAD ?? "60");   // 1 CAD ≈ 60 INR

function pickEmoji(name?:string){
  const emojis=["🎈","🧠","🚀","🌟","🐣","🦄","🐼","🐱","🐶","🐼","🐧","🐨"];
  if(!name)return emojis[0];
  const code=name.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  return emojis[code%emojis.length];
}
const cleanUuid=(s?:string|null)=>(s||"").toLowerCase().replace(/[^0-9a-f-]/g,"");

export default function ParentRedemptions(){
  const [rows,setRows]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState<FilterKey>(ALL);
  const [childMap,setChildMap]=useState<Record<string,ChildMeta>>({});
  const [families,setFamilies]=useState<string[]>([]);
  const [guideOpen,setGuideOpen]=useState(false);
  const channelsRef=useRef<ReturnType<typeof supabase.channel>[]>([]);

  const counts=useMemo(()=>{
    const m:Record<FilterKey,number>={
      All:rows.length,
      Requested:0,
      Approved:0,
      Accepted:0,
      Fulfilled:0,
      Rejected:0,
      Cancelled:0,
    };
    rows.forEach((r)=>{(m[r.status] as number)++;});
    return m;
  },[rows]);

  const filteredRows=useMemo(
    ()=>filter===ALL?rows:rows.filter((r)=>r.status===filter),
    [rows,filter]
  );

  // Per-child redemption summary for sidebar
  const childSummaries=useMemo(()=>{
    const acc:Record<string,{
      key:string;
      name:string;
      emoji:string;
      totalPoints:number;
      totalCad:number;
      fulfilledCount:number;
    }>={};
    rows.forEach((r)=>{
      const key=cleanUuid(r.child_uid);
      if(!key)return;
      const meta=childMap[key];
      const nm=meta?.name||"Child";
      const em=meta?.emoji||pickEmoji(nm);
      if(!acc[key]){
        acc[key]={
          key,
          name:nm,
          emoji:em,
          totalPoints:0,
          totalCad:0,
          fulfilledCount:0,
        };
      }
      acc[key].totalPoints+=r.requested_points||0;
      acc[key].totalCad+=(r.currency_cents||0)/100;
      if(r.status==="Fulfilled")acc[key].fulfilledCount++;
    });
    return Object.values(acc).sort((a,b)=>a.name.localeCompare(b.name));
  },[rows,childMap]);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        // 1) Families for this parent
        const {data:me}=await supabase.auth.getUser();
        const parentUid=me.user?.id||null;

        let fams:string[]=[];
        if(parentUid){
          const {data:pf,error:pfErr}=await supabase
            .from("parent_profiles")
            .select("family_id")
            .eq("parent_uid",parentUid);
          if(pfErr)console.error("[parent_profiles]",pfErr);
          fams=(pf||[]).map((x:any)=>x.family_id).filter(Boolean);
        }
        setFamilies(fams);

        // 2) Requests in those families
        let q=supabase
          .from("points_redemption_requests")
          .select("*")
          .order("requested_at",{ascending:false});
        if(fams.length)q=q.in("family_id",fams);

        const {data:reqs,error:reqErr}=await q;
        if(reqErr){
          console.error("[points_redemption_requests]",reqErr);
          setRows([]);
          setChildMap({});
          setLoading(false);
          return;
        }

        const list=(reqs||[]) as Row[];
        setRows(list);

        // 3) Child names
        const rawIds=Array.from(new Set(list.map((r)=>cleanUuid(r.child_uid)).filter(Boolean)));
        const childIds=rawIds.filter((id)=>/^[0-9a-f-]{36}$/.test(id)); // these match child_profiles.id

        if(childIds.length>0){
          const {data:kids,error:kidErr}=await supabase
            .from("child_profiles")
            .select("id,child_uid,first_name,nick_name,avatar_url")
            .in("id",childIds); // 🔑 use id, not child_uid

          if(kidErr){
            console.error("[child_profiles]",kidErr);
            setChildMap({});
          }else{
            const map:Record<string,ChildMeta>={};
            (kids||[]).forEach((k:any)=>{
              const key=cleanUuid(k.id); // same shape as points_redemption_requests.child_uid
              const nm=k.nick_name||k.first_name||"Child";
              map[key]={name:nm,nick:k.nick_name,emoji:pickEmoji(nm)};
            });
            setChildMap(map);
          }
        }else{
          setChildMap({});
        }

        // 4) Realtime heads-up for new/updated requests (per-family channels)
        try{
          channelsRef.current.forEach((ch)=>ch.unsubscribe());
        }catch{}
        channelsRef.current=[];

        fams.forEach((familyId)=>{
          if(!familyId)return;
          const ch=supabase.channel(`parent-redemptions:${familyId}`);

          // INSERT -> new request arrives
          ch.on(
            "postgres_changes",
            {event:"INSERT",schema:"public",table:"points_redemption_requests",filter:`family_id=eq.${familyId}`},
            async(payload:any)=>{
              const r=payload?.new as Row;
              const key=cleanUuid(r.child_uid);
              const who=childMap[key]?.name||"Child";
              const dollars=(r.currency_cents||0)/100;
              toast.info(`New cash-out request from ${who}: ${r.requested_points} pts ($${dollars.toFixed(2)} CAD)`);
              await refresh();
            }
          );

          // UPDATE -> status changes
          ch.on(
            "postgres_changes",
            {event:"UPDATE",schema:"public",table:"points_redemption_requests",filter:`family_id=eq.${familyId}`},
            async(payload:any)=>{
              const r=payload?.new as Row;
              const key=cleanUuid(r.child_uid);
              const who=childMap[key]?.name||"Child";
              if(r.status==="Accepted"){
                toast.success(`${who} accepted the payout. Proceed to fulfill 💸`);
              }else if(r.status==="Fulfilled"){
                toast.success(`Payout fulfilled for ${who}. ✅`);
              }else if(r.status==="Rejected"){
                toast.warning("Request was rejected.");
              }else if(r.status==="Approved"){
                toast.success("Request approved.");
              }else if(r.status==="Cancelled"){
                toast("Request cancelled.",{description:`${who}'s request is no longer active.`});
              }
              await refresh();
            }
          );

          ch.subscribe();
          channelsRef.current.push(ch);
        });
      }catch(e){
        console.error("[ParentRedemptions init]",e);
        setRows([]);
        setChildMap({});
      }finally{
        setLoading(false);
      }
    })();

    return ()=>{
      try{
        channelsRef.current.forEach((ch)=>ch.unsubscribe());
      }catch{}
      channelsRef.current=[];
    };
  },[]);

  async function refresh(){
    let q=supabase
      .from("points_redemption_requests")
      .select("*")
      .order("requested_at",{ascending:false});
    if(families.length)q=q.in("family_id",families);

    const {data,error}=await q;
    if(error)console.error("[refresh requests]",error);
    setRows((data||[]) as Row[]);
  }

  async function decide(id:string,approve:boolean){
    await tpromise(
      ()=>supabase.rpc("api_parent_decide_cashout",{p_request_id:id,p_approve:approve}),
      {
        loading:approve?"Approving…":"Rejecting…",
        success:approve?"Approved.":"Rejected.",
        error:(e)=>e?.message||"Could not update",
        sound:approve?"success":"warning",
      }
    );
    await refresh();
  }

  async function fulfill(id:string){
    await tpromise(
      ()=>supabase.rpc("api_parent_fulfill_cashout",{p_request_id:id}),
      {
        loading:"Marking as fulfilled…",
        success:"Fulfilled. ✅",
        error:(e)=>e?.message||"Could not fulfill",
        sound:"success",
      }
    );
    await refresh();
  }

  function exportFulfilledCsv(){
    const fulfilled=rows.filter((r)=>r.status==="Fulfilled");
    if(!fulfilled.length)return alert("No fulfilled payouts to export yet.");

    const header=[
      "request_id",
      "child_uid",
      "child_name",
      "points",
      "rate_cad_per_point",
      "amount_cad",
      "requested_at",
      "accepted_at",
      "fulfilled_at",
    ];
    const lines=[header.join(",")];

    fulfilled.forEach((r)=>{
      const key=cleanUuid(r.child_uid);
      const meta=childMap[key];
      const nm=meta?.name||"";
      const amount=(r.currency_cents||0)/100;
      const row=[
        r.id,
        r.child_uid,
        `"${String(nm).replace(/"/g,'""')}"`,
        r.requested_points,
        r.cad_per_point.toFixed(2),
        amount.toFixed(2),
        r.requested_at?new Date(r.requested_at).toISOString():"",
        r.accepted_at?new Date(r.accepted_at).toISOString():"",
        r.fulfilled_at?new Date(r.fulfilled_at).toISOString():"",
      ];
      lines.push(row.join(","));
    });

    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const stamp=new Date().toISOString().slice(0,10).replace(/-/g,"");
    a.href=url;
    a.download=`redemptions-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return(
    <div className="space-y-6">
      {/* Title row (left-aligned) */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30">
          <HandCoins className="w-5 h-5 text-indigo-300"/>
        </div>
        <div className="min-w-0">
          <div className="text-white font-semibold truncate">Redemptions &amp; Cash-outs</div>
          <div className="text-xs text-white/60">Approve, reject, fulfill payouts — with quick filters</div>
        </div>
      </div>

      {/* Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MAIN */}
        <div className="lg:col-span-2 min-w-0 space-y-4">
          <div className="space-y-3">
            {loading&&<div className="text-white/60 text-sm">Loading…</div>}

            {!loading&&filteredRows.map((r)=>{
              const amountCad=(r.currency_cents||0)/100;
              const key=cleanUuid(r.child_uid);
              const meta=childMap[key];
              const displayName=meta?.name||"Child";
              const emoji=meta?.emoji||"🎈";
              const nick=meta?.nick;
              const approxUsd=amountCad*FX_USD_PER_CAD;
              const approxInr=amountCad*FX_INR_PER_CAD;

              return(
                <div key={r.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="text-white min-w-0">
                      <div className="font-semibold flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 border border-white/15 shrink-0">
                          {emoji}
                        </span>
                        <span className="truncate">{displayName}</span>
                        {nick&&nick!==displayName&&(
                          <span className="text-xs text-white/60">(also known as {nick})</span>
                        )}
                      </div>

                      <div className="mt-0.5">
                        <span className="font-medium">{r.requested_points} pts</span>
                        <span className="opacity-70"> → </span>
                        <span className="font-medium">${amountCad.toFixed(2)} CAD</span>
                        <span className="opacity-70"> @ ${r.cad_per_point.toFixed(2)}/pt</span>
                      </div>

                      {/* approx FX line */}
                      <div className="text-xs text-white/60 mt-0.5">
                        ≈ ${approxUsd.toFixed(2)} USD • ₹{approxInr.toFixed(0)} INR
                      </div>

                      <div className="text-xs text-white/60 break-words mt-1">
                        Requested: {new Date(r.requested_at).toLocaleString()}
                        {r.note?` · “${r.note}”`:""}
                      </div>
                      <div className="text-xs text-white/60 mt-1">Status: {r.status}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {r.status==="Requested"&&(
                        <>
                          <button
                            onClick={()=>decide(r.id,true)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm border border-emerald-500/30 inline-flex items-center gap-1"
                          >
                            <Check className="w-4 h-4"/> Approve
                          </button>
                          <button
                            onClick={()=>decide(r.id,false)}
                            className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-700 text-white text-sm border border-red-500/30 inline-flex items-center gap-1"
                          >
                            <X className="w-4 h-4"/> Reject
                          </button>
                        </>
                      )}

                      {r.status==="Accepted"&&(
                        <button
                          onClick={()=>fulfill(r.id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm border border-indigo-500/30 inline-flex items-center gap-1"
                        >
                          <BadgeDollarSign className="w-4 h-4"/> Mark Fulfilled
                        </button>
                      )}

                      {r.status==="Approved"&&(
                        <span className="text-sm text-white/70">Waiting for child acceptance…</span>
                      )}
                      {r.status==="Fulfilled"&&(
                        <span className="text-sm text-emerald-300">Paid ✅</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading&&!filteredRows.length&&(
              <div className="text-white/60 text-sm">No rows for this filter.</div>
            )}
          </div>
        </div>

        {/* ASIDE */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 h-fit">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-white font-semibold mb-3">Quick Actions</div>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={()=>setGuideOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-indigo-600/80 border border-indigo-500/40 text-white hover:bg-indigo-700"
              >
                <HandCoins className="w-4 h-4"/> Redemption instructions &amp; process
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportFulfilledCsv}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
              >
                <FileDown className="w-4 h-4"/> Export Fulfilled CSV
              </button>
              <button
                onClick={async()=>{setLoading(true);await refresh();setLoading(false);}}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
              >
                <Loader2 className="w-4 h-4 animate-spin"/> Refresh
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-white font-semibold mb-3">Status Filters</div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((s)=>(
                <button
                  key={s}
                  onClick={()=>setFilter(s)}
                  className={[
                    "px-3 py-1.5 rounded-lg text-sm border transition",
                    filter===s
                      ?"bg-white/15 border-white/25 text-white"
                      :"bg-white/5 border-white/10 text-white/80 hover:bg-white/10",
                  ].join(" ")}
                >
                  {s} <span className="ml-1 text-white/60">({counts[s]??0})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Child details / redemption summary */}
          {childSummaries.length>0&&(
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="text-white font-semibold mb-3">Child redemption details</div>
              <div className="space-y-2 text-sm">
                {childSummaries.map((c)=>{
                  const usd=c.totalCad*FX_USD_PER_CAD;
                  const inr=c.totalCad*FX_INR_PER_CAD;
                  return(
                    <div
                      key={c.key}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/40 border border-white/10 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 border border-white/15">
                          {c.emoji}
                        </span>
                        <div className="min-w-0">
                          <div className="text-white truncate">{c.name}</div>
                          <div className="text-[11px] text-white/60">
                            {c.totalPoints} pts · ${c.totalCad.toFixed(2)} CAD
                          </div>
                          <div className="text-[11px] text-white/50">
                            ≈ ${usd.toFixed(2)} USD • ₹{inr.toFixed(0)} INR
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] text-emerald-300 text-right">
                        {c.fulfilledCount} paid
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-white/80 text-sm">
              💡 Tip: After a child accepts, points are deducted immediately and the request moves to{" "}
              <span className="text-sky-300 font-medium">Accepted</span>. Mark as{" "}
              <span className="text-indigo-300 font-medium">Fulfilled</span> once you pay out.
            </div>
          </div>
        </aside>
      </div>

      {/* Inline fullscreen-style instructions overlay */}
      {guideOpen&&(
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40">
                  <HandCoins className="w-5 h-5 text-indigo-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Redemption instructions &amp; points conversion
                  </h2>
                  <p className="text-xs text-white/60">
                    Inline guide so you can review the process without leaving this page.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                onClick={()=>setGuideOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-sm text-white/80">
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">1. How a cash-out request flows</h3>
                <ol className="list-decimal list-inside space-y-1 text-white/80">
                  <li><span className="font-medium">Requested</span> – child submits a cash-out with points and a note.</li>
                  <li><span className="font-medium">Approved / Rejected</span> – you decide whether the request makes sense.</li>
                  <li><span className="font-medium">Accepted</span> – once approved, the child confirms they still want the payout.</li>
                  <li><span className="font-medium">Fulfilled</span> – you actually pay the child (cash, gift card, transfer) and mark it as paid.</li>
                  <li><span className="font-medium">Cancelled</span> – either side can cancel if the payout is no longer needed.</li>
                </ol>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. Points → money &amp; multi-currency conversion</h3>
                <p>
                  Each request stores a rate <span className="font-mono">cad_per_point</span>. The base payout in CAD is:
                </p>
                <p className="font-mono text-xs bg-slate-800/80 rounded-lg px-3 py-2 inline-block">
                  amount_cad = requested_points × cad_per_point
                </p>
                <p className="mt-2">
                  For other currencies we use simple fixed conversion factors (you can tune them with{" "}
                  <span className="font-mono">VITE_FX_USD_PER_CAD</span> and{" "}
                  <span className="font-mono">VITE_FX_INR_PER_CAD</span> in your environment):
                </p>
                <p className="font-mono text-xs bg-slate-800/80 rounded-lg px-3 py-2 inline-block">
                  amount_usd = amount_cad × FX_USD_PER_CAD{"\n"}
                  amount_inr = amount_cad × FX_INR_PER_CAD
                </p>
                <p className="text-white/70">
                  The cards show the CAD amount plus approximate USD and INR equivalents so parents in different regions
                  can reason about the value at a glance.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. What happens to wallet points?</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li>When you <span className="font-medium text-emerald-300">approve</span>, the system can reserve or deduct points (depending on your wallet setup).</li>
                  <li>When a request is <span className="font-medium text-indigo-300">fulfilled</span>, it is considered fully paid and locked in history.</li>
                  <li>If you <span className="font-medium text-rose-300">reject</span> or <span className="font-medium text-amber-300">cancel</span>, reserved points are returned to the child&apos;s available balance.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. Using filters &amp; child details</h3>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  <li>Use the <span className="font-medium">Status Filters</span> on the right to focus on a single stage (e.g., only <span className="font-medium">Requested</span>).</li>
                  <li>The <span className="font-medium">Child redemption details</span> card shows total points and CAD requested per child, plus approximate USD/INR and how many payouts are already paid.</li>
                  <li>Export a CSV of all <span className="font-medium">Fulfilled</span> rows for record keeping or reimbursement.</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
