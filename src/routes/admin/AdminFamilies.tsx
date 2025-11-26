// src/routes/admin/AdminFamilies.tsx
import {useEffect,useMemo,useState}from "react";
import {supabase}from "@/lib/supabase";

type FamiliesRow={
  id:string;
  display_name:string|null;
  owner_uid:string|null;
  created_at:string;
  code:string|null;
};

type ParentRow={
  parent_uid:string;
  family_id:string|null;
  first_name:string|null;
  last_name:string|null;
  email:string|null;
  phone:string|null;
  country:string|null;
  region:string|null;
  created_at:string;
};

type ChildRow={
  child_uid:string;
  family_id:string|null;
  first_name:string|null;
  nick_name:string|null;
};

type FamilySummary={
  id:string;
  displayName:string;
  code:string|null;
  created_at:string;
  owners:string[];
  parentsCount:number;
  childrenCount:number;
};

type ParentFilterMode="all"|"withEmail"|"withoutEmail";

export default function AdminFamilies(){
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|undefined>();
  const [families,setFamilies]=useState<FamiliesRow[]>([]);
  const [parents,setParents]=useState<ParentRow[]>([]);
  const [children,setChildren]=useState<ChildRow[]>([]);

  // 🔍 Parent directory controls
  const [parentSearch,setParentSearch]=useState("");
  const [parentFilter,setParentFilter]=useState<ParentFilterMode>("all");

  useEffect(()=>{
    let active=true;
    (async()=>{
      setLoading(true);
      setError(undefined);
      try{
        const [{data:fam,error:fErr},{data:p,error:pErr},{data:c,error:cErr}]=await Promise.all([
          supabase.from("families").select("id,display_name,owner_uid,created_at,code"),
          supabase
            .from("parent_profiles")
            .select("parent_uid,family_id,first_name,last_name,email,phone,country,region,created_at"),
          supabase.from("child_profiles").select("child_uid,family_id,first_name,nick_name")
        ]);
        if(fErr)throw fErr;
        if(pErr)throw pErr;
        if(cErr)throw cErr;
        if(!active)return;
        setFamilies((fam||[]) as FamiliesRow[]);
        setParents((p||[]) as ParentRow[]);
        setChildren((c||[]) as ChildRow[]);
      }catch(e:any){
        if(!active)return;
        setError(e?.message||"Failed to load families");
      }finally{
        if(active)setLoading(false);
      }
    })();
    return()=>{active=false;};
  },[]);

  const rows=useMemo<FamilySummary[]>(()=>{
    const parentByFam=new Map<string,ParentRow[]>();
    parents.forEach((p)=>{
      if(!p.family_id)return;
      const list=parentByFam.get(p.family_id)||[];
      list.push(p);
      parentByFam.set(p.family_id,list);
    });

    const childByFam=new Map<string,ChildRow[]>();
    children.forEach((c)=>{
      if(!c.family_id)return;
      const list=childByFam.get(c.family_id)||[];
      list.push(c);
      childByFam.set(c.family_id,list);
    });

    return families.map((f)=>{
      const parentsList=parentByFam.get(f.id)||[];
      const childrenList=childByFam.get(f.id)||[];
      const owners:string[]=[];
      parentsList.forEach((p)=>{
        const n=[p.first_name,p.last_name].filter(Boolean).join(" ").trim();
        if(n&&!owners.includes(n))owners.push(n);
      });

      const displayName=f.display_name||"Family";
      const created=new Date(f.created_at);
      const createdShort=isNaN(created.getTime())
        ?f.created_at
        :created.toISOString().slice(0,10);

      return{
        id:f.id,
        displayName,
        code:f.code||null,
        created_at:createdShort,
        owners,
        parentsCount:parentsList.length,
        childrenCount:childrenList.length
      };
    }).sort((a,b)=>a.created_at.localeCompare(b.created_at));
  },[families,parents,children]);

  // 🎯 Parent directory: search + filter
  const filteredParents=useMemo(()=>{
    const q=parentSearch.trim().toLowerCase();

    return parents.filter((p)=>{
      // filter mode (email presence)
      const hasEmail=!!(p.email&&p.email.trim());
      if(parentFilter==="withEmail"&&!hasEmail)return false;
      if(parentFilter==="withoutEmail"&&hasEmail)return false;

      if(!q)return true;

      const haystack=[
        p.first_name||"",
        p.last_name||"",
        p.email||"",
        p.phone||"",
        p.country||"",
        p.region||""
      ].join(" ").toLowerCase();

      return haystack.includes(q);
    });
  },[parents,parentSearch,parentFilter]);

  function exportParentsCsv(){
    if(filteredParents.length===0){
      alert("No parents in current filter to export.");
      return;
    }

    const headers=[
      "Parent UID",
      "Family ID",
      "First name",
      "Last name",
      "Email",
      "Phone",
      "Country",
      "Region",
      "Created at"
    ];

    const escapeCsv=(v:string|null|undefined)=>{
      const s=(v??"").replace(/"/g,'""');
      return `"${s}"`;
    };

    const lines:string[]=[];
    lines.push(headers.map((h)=>escapeCsv(h)).join(","));

    filteredParents.forEach((p)=>{
      lines.push([
        p.parent_uid,
        p.family_id||"",
        p.first_name||"",
        p.last_name||"",
        p.email||"",
        p.phone||"",
        p.country||"",
        p.region||"",
        p.created_at||""
      ].map((v)=>escapeCsv(v)).join(","));
    });

    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download="parents-directory.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return(
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold">Families</div>
        <div className="text-xs text-white/60">
          Family groups, parents, and children
        </div>
      </div>

      {loading&&(
        <div className="text-sm text-white/70">Loading families…</div>
      )}
      {error&&(
        <div className="text-sm text-red-300">Error: {error}</div>
      )}

      {!loading&&!error&&(
        <>
          {/* Families summary table (existing) */}
          <div className="glass rounded-2xl p-4 overflow-x-auto">
            {rows.length===0?(
              <div className="text-sm text-white/60">
                No families found yet.
              </div>
            ):(
              <table className="w-full text-xs border-collapse">
                <thead className="text-white/60">
                  <tr className="border-b border-white/10">
                    <th className="text-left py-1 pr-2">Family</th>
                    <th className="text-left py-1 pr-2">Code</th>
                    <th className="text-left py-1 pr-2">Owners</th>
                    <th className="text-right py-1 pr-2">Parents</th>
                    <th className="text-right py-1 pr-2">Children</th>
                    <th className="text-left py-1 pl-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r)=>(
                    <tr key={r.id} className="border-b border-white/5">
                      <td className="py-1 pr-2">{r.displayName}</td>
                      <td className="py-1 pr-2 font-mono text-[11px]">{r.code||"—"}</td>
                      <td className="py-1 pr-2 text-white/80">
                        {r.owners.length>0?r.owners.join(", "):"—"}
                      </td>
                      <td className="py-1 pr-2 text-right">{r.parentsCount}</td>
                      <td className="py-1 pr-2 text-right">{r.childrenCount}</td>
                      <td className="py-1 pl-2 text-white/70">{r.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Parent directory with search/filter/export */}
          <div className="glass rounded-2xl p-4 overflow-x-auto space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Parent directory</div>
                <div className="text-xs text-white/60">
                  All parent profiles (admin-only view)
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Search */}
                <input
                  type="text"
                  value={parentSearch}
                  onChange={(e)=>setParentSearch(e.target.value)}
                  placeholder="Search by name, email, phone, country..."
                  className="bg-black/40 border border-white/15 rounded px-2 py-1 text-xs min-w-[220px] focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />

                {/* Filter: email presence */}
                <select
                  value={parentFilter}
                  onChange={(e)=>setParentFilter(e.target.value as ParentFilterMode)}
                  className="bg-black/40 border border-white/15 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                >
                  <option value="all">All parents</option>
                  <option value="withEmail">With email</option>
                  <option value="withoutEmail">Missing email</option>
                </select>

                {/* Export */}
                <button
                  type="button"
                  onClick={()=>exportParentsCsv()}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white"
                >
                  Export CSV ({filteredParents.length})
                </button>
              </div>
            </div>

            {filteredParents.length===0?(
              <div className="text-xs text-white/60">
                No parents match the current search/filter.
              </div>
            ):(
              <table className="w-full text-xs border-collapse">
                <thead className="text-white/60">
                  <tr className="border-b border-white/10">
                    <th className="text-left py-1 pr-2">Name</th>
                    <th className="text-left py-1 pr-2">Email</th>
                    <th className="text-left py-1 pr-2">Phone</th>
                    <th className="text-left py-1 pr-2">Country</th>
                    <th className="text-left py-1 pr-2">Region</th>
                    <th className="text-left py-1 pr-2">Family</th>
                    <th className="text-left py-1 pr-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParents.map((p)=>(
                    <tr key={p.parent_uid} className="border-b border-white/5">
                      <td className="py-1 pr-2">
                        {(p.first_name||"").trim()} {(p.last_name||"").trim()}
                      </td>
                      <td className="py-1 pr-2">{p.email||"—"}</td>
                      <td className="py-1 pr-2">{p.phone||"—"}</td>
                      <td className="py-1 pr-2">{p.country||"—"}</td>
                      <td className="py-1 pr-2">{p.region||"—"}</td>
                      <td className="py-1 pr-2">
                        {p.family_id?p.family_id.slice(0,8):"no family"}
                      </td>
                      <td className="py-1 pr-2">
                        {p.created_at
                          ?new Date(p.created_at).toLocaleDateString("en-US",{
                            year:"numeric",
                            month:"short",
                            day:"numeric"
                          })
                          :"—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
