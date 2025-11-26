"use client";
import {useEffect,useRef,useState,useMemo}from "react";
import {Link,useLocation,useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {toast}from "sonner";
import {tpromise}from "@/utils/toastx";
import {
  LS_CHILD,
  LS_FAMILY,
  loadChildren,
  findFamilyForChild,
  verifyChildSecretRemote,
  type Kid,
  childIdByNickname,
}from "@/utils/childAuth";

/* ----------------------------- helpers ------------------------------ */
function looksLikeUuid(s:string){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((s||"").trim());
}
function looksLikeEmail(s:string){
  return /\S+@\S+\.\S+/.test(s||"");
}
async function resolveFamilyId(raw?:string|null):Promise<string|null>{
  const v=(raw||"").trim();
  if(!v)return null;
  if(looksLikeEmail(v))return null;
  if(looksLikeUuid(v))return v;
  const {data,error}=await supabase.rpc("api_family_by_code",{p_code:v});
  if(error||!data)return null;
  return data as string;
}
function readLsChildId():string|null{
  try{
    const raw=localStorage.getItem(LS_CHILD);
    if(!raw)return null;
    try{
      const j=JSON.parse(raw);
      if(j&&(j.id||j.child_uid))return String(j.id||j.child_uid);
    }catch{}
    return raw;
  }catch{
    return null;
  }
}

/* ------------------------------ page ------------------------------- */
export default function ChildLogin(){
  const navigate=useNavigate();
  const loc=useLocation();
  const qs=useMemo(()=>new URLSearchParams(loc.search),[loc.search]);
  const fidParam=qs.get("fid");
  const nickParam=qs.get("nick");

  const [familyId,setFamilyId]=useState<string|null>(null);
  const [children,setChildren]=useState<Kid[]>([]);
  const [childId,setChildId]=useState<string>("");
  const [pinMode,setPinMode]=useState(true);
  const [secret,setSecret]=useState("");
  const [checking,setChecking]=useState(false);
  const [loadingKids,setLoadingKids]=useState(false);

  const [nickInput,setNickInput]=useState("");
  const [manualFid,setManualFid]=useState("");

  const [scanOpen,setScanOpen]=useState(false);
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const rafRef=useRef<number|null>(null);
  const detectorRef=useRef<any>(null);

  const inputClass="rounded-xl px-3 py-2 bg-slate-800 text-white placeholder:text-slate-400 border border-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--brand-emerald)] focus:border-transparent";
  const selectClass="w-full rounded-xl px-3 py-2 bg-slate-800 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--brand-emerald)] focus:border-transparent";

  /* --------------------------- bootstrap kids --------------------------- */
  async function bootstrapKids(fidUuid:string,preselect?:string|null){
    try{
      setLoadingKids(true);
      const kids=await loadChildren(fidUuid);
      setChildren(kids);

      const remembered=readLsChildId();
      const pick=preselect||remembered||(kids[0]?.id??"");
      setChildId(pick);
    }catch(e:any){
      console.error("[bootstrapKids] failed:",e);
      toast.error("Could not load names for this family.");
      setChildren([]);
      setChildId("");
    }finally{
      setLoadingKids(false);
    }
  }

  async function reloadKids(){
    if(!familyId){
      toast.info("Enter Family ID/Code or scan QR to load names.");
      return;
    }
    await bootstrapKids(familyId);
  }

  async function resolveNick(){
    if(!familyId||!nickInput.trim())return;
    const id=await childIdByNickname(familyId,nickInput.trim());
    if(!id){
      toast.error("No child with that nickname.");
      return;
    }
    setChildId(id);
    try{
      localStorage.setItem(LS_CHILD,JSON.stringify({id,child_uid:id}));
    }catch{}
    toast.success("Found you!");
  }

  async function handleManualLoad(){
    const val=manualFid.trim();
    if(!val){
      toast.error("Enter a Family ID or Code first.");
      return;
    }
    const resolved=await resolveFamilyId(val);
    if(!resolved){
      toast.error("Family not found.");
      return;
    }
    setFamilyId(resolved);
    localStorage.setItem(LS_FAMILY,resolved);
    await bootstrapKids(resolved);
  }

  /* ------------------------- initial bootstrap ------------------------- */
  useEffect(()=>{
    (async()=>{
      try{
        let fidUuid:string|null=null;
        let chosenChild:string|null=null;
        const nick=nickParam||null;

        if(fidParam)fidUuid=await resolveFamilyId(fidParam);

        if(!fidUuid){
          const sess=await supabase.auth.getSession();
          if(sess.data.session){
            const {data:me}=await supabase.rpc("my_profile");
            const candidate=(me as any)?.family_id??null;
            fidUuid=candidate?String(candidate):null;
          }
        }

        if(!fidUuid){
          const stored=localStorage.getItem(LS_FAMILY);
          fidUuid=await resolveFamilyId(stored);
        }

        if(!fidUuid){
          const rememberedChild=readLsChildId();
          if(rememberedChild)fidUuid=await findFamilyForChild(rememberedChild);
        }

        if(fidUuid){
          setFamilyId(fidUuid);
          localStorage.setItem(LS_FAMILY,fidUuid);
        }

        if(fidUuid&&nick&&!chosenChild){
          const idFromNick=await childIdByNickname(fidUuid,nick);
          if(idFromNick)chosenChild=idFromNick;
        }

        if(fidUuid){
          await bootstrapKids(fidUuid,chosenChild);
        }else{
          setChildren([]);
        }
      }catch(e){
        console.error("[ChildLogin bootstrap] failed:",e);
      }
    })();

    return()=>{ stopScanner(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /* ------------------------------ enter() ------------------------------ */
  async function enter(){
    let fid=familyId;

    if(!fid&&manualFid.trim()){
      const resolved=await resolveFamilyId(manualFid.trim());
      if(!resolved){
        toast.error("Family not found.");
        return;
      }
      fid=resolved;
      setFamilyId(fid);
      localStorage.setItem(LS_FAMILY,fid);
      await bootstrapKids(fid);
    }

    if(!childId&&nickInput.trim()){
      if(!fid){
        toast.error("Enter Family ID/Code (or scan QR) to resolve nickname.");
        return;
      }
      const id=await childIdByNickname(fid,nickInput.trim());
      if(!id)return toast.error("Nickname not found.");
      setChildId(id);
      try{
        localStorage.setItem(LS_CHILD,JSON.stringify({id,child_uid:id}));
      }catch{}
    }

    if(!childId)return toast.error("Pick your name");

    if(!fid){
      fid=await findFamilyForChild(childId);
      if(!fid)return toast.error("Family not found for this child.");
      setFamilyId(fid);
      localStorage.setItem(LS_FAMILY,fid);
    }

    if(!secret.trim()){
      toast.error(pinMode?"Enter your PIN.":"Enter your password.");
      return;
    }

    setChecking(true);
    try{
      const ok=await tpromise(
        ()=>verifyChildSecretRemote({child_id:childId,fid,clear:secret,pinMode}),
        {
          loading:"Checking your entry…",
          success:"Welcome! Taking you to your report ✨",
          error:(e)=>e?.message||"Login failed.",
          sound:"success",
        }
      );

      if(!ok){
        const e:any=new Error("Incorrect PIN/password.");
        e.code="BAD_SECRET";
        throw e;
      }

      const {data:cp}=await supabase
        .from("child_profiles")
        .select("id,child_uid,first_name,nick_name")
        .eq("id",childId)
        .maybeSingle();

      const canonicalId=childId;
      const legacyUid=cp?.child_uid?String(cp.child_uid):canonicalId;
      const childFirst=cp?.first_name||"";
      const childNick=cp?.nick_name||"";

      try{
        sessionStorage.setItem("child_id",canonicalId);
        sessionStorage.setItem("child_uid",legacyUid);
        localStorage.setItem("child_portal_child_id",canonicalId);
        localStorage.setItem(
          LS_CHILD,
          JSON.stringify({id:canonicalId,child_uid:legacyUid,nick_name:childNick,first_name:childFirst}),
        );
      }catch{}

      toast.success(`Welcome, ${childNick||childFirst||"Super-Star"} ✨`);
      navigate("/child/reports");
    }catch(e:any){
      console.error("[ChildLogin enter] failed:",e);
    }finally{
      setChecking(false);
    }
  }

  /* ---------------------------- QR scanner ---------------------------- */
  async function openScanner(){
    try{
      if(!("BarcodeDetector"in window)){
        toast.error("QR scanning not supported in this browser. Use the printed QR or manual select.");
        return;
      }
      // @ts-ignore
      detectorRef.current=new window.BarcodeDetector({formats:["qr_code"]});
      streamRef.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      setScanOpen(true);
      requestAnimationFrame(tick);
    }catch(e:any){
      console.error(e);
      toast.error(e?.message||"Could not start camera.");
      stopScanner();
    }
  }
  function stopScanner(){
    if(rafRef.current)cancelAnimationFrame(rafRef.current);
    rafRef.current=null;
    if(streamRef.current){
      streamRef.current.getTracks().forEach((t)=>t.stop());
      streamRef.current=null;
    }
    setScanOpen(false);
  }
  async function tick(){
    if(!videoRef.current){
      rafRef.current=requestAnimationFrame(tick);
      return;
    }
    const v=videoRef.current;
    if(streamRef.current&&(v as any).srcObject!==streamRef.current){
      (v as any).srcObject=streamRef.current;
      await (v as any).play().catch(()=>{});
    }
    if(detectorRef.current&&(v as any).readyState>=2){
      try{
        const codes=await detectorRef.current.detect(v);
        if(codes?.length){
          const raw=codes[0].rawValue as string;
          stopScanner();
          handleScanResult(raw);
          return;
        }
      }catch{}
    }
    rafRef.current=requestAnimationFrame(tick);
  }
  async function handleScanResult(url:string){
    try{
      const u=new URL(url);
      const fidQ=u.searchParams.get("fid");
      const child=u.searchParams.get("child");
      const nick=u.searchParams.get("nick");

      let fidUuid=await resolveFamilyId(fidQ);

      if(fidUuid){
        setFamilyId(fidUuid);
        localStorage.setItem(LS_FAMILY,fidUuid);
      }
      if(child){
        setChildId(child);
        try{
          localStorage.setItem(LS_CHILD,JSON.stringify({id:child,child_uid:child}));
          localStorage.setItem("child_portal_child_id",child);
        }catch{}
      }
      if(!child&&nick&&fidUuid){
        const id=await childIdByNickname(fidUuid,nick);
        if(id){
          setChildId(id);
          try{
            localStorage.setItem(LS_CHILD,JSON.stringify({id,child_uid:id}));
            localStorage.setItem("child_portal_child_id",id);
          }catch{}
        }
        await bootstrapKids(fidUuid);
      }else if(fidUuid){
        await bootstrapKids(fidUuid,child||undefined);
      }
      toast.success("QR loaded.");
    }catch(e){
      console.error(e);
      toast.error("Invalid QR.");
    }
  }

  /* ------------------------------- UI -------------------------------- */
  return(
    <div className="px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-3xl font-bold">Child Login</h1>

        {/* Manual Family ID/Code (optional) */}
        <div className="glass rounded-2xl p-4">
          <label className="block text-sm mb-1">Family ID or Code (optional)</label>
          <div className="flex gap-2">
            <input
              className={`flex-1 ${inputClass}`}
              placeholder="Paste family UUID or short code"
              value={manualFid}
              onChange={(e)=>setManualFid(e.target.value)}
              onKeyDown={(e)=>{
                if(e.key==="Enter"){
                  e.preventDefault();
                  void handleManualLoad();
                }
              }}
              aria-label="Family ID or Code"
            />
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
              onClick={()=>{void handleManualLoad();}}
            >
              Load
            </button>
          </div>
          <p className="text-xs text-white/60 mt-2">
            If you don’t know it, ask a parent to open <b>Parent → QR Cards</b> or <b>Child Passwords</b>.
          </p>
        </div>

        <div className="glass rounded-2xl p-4 overflow-visible relative">
          <label className="block text-sm mb-1">I am</label>
          <div className="relative z-20">
            <select
              className={selectClass}
              value={childId}
              onChange={(e)=>setChildId(e.target.value)}
              aria-label="Choose your name"
              onFocus={()=>{
                if(!children.length&&familyId&&!loadingKids)reloadKids();
              }}
            >
              <option value="" disabled className="bg-white text-slate-900">
                {loadingKids
                  ?"Loading names…"
                  :children.length
                  ?"— Select your name —"
                  :"No names yet (enter Family ID/Code or scan QR)"}
              </option>
              {children.map((c)=>(
                <option key={c.id} value={c.id} className="bg-white text-slate-900">
                  {c.name}{typeof c.age==="number"?`· Age ${c.age}`:""}
                </option>
              ))}
            </select>
          </div>

          {/* Manual nickname */}
          <div className="mt-3 grid sm:grid-cols-[1fr_auto] gap-2">
            <input
              className={inputClass}
              placeholder="or type your nickname"
              value={nickInput}
              onChange={(e)=>setNickInput(e.target.value)}
              onBlur={()=>{
                if(!childId&&familyId)resolveNick();
              }}
              onKeyDown={(e)=>{
                if(e.key==="Enter"){
                  e.preventDefault();
                  void resolveNick();
                }
              }}
              aria-label="Nickname"
            />
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
              onClick={()=>{void resolveNick();}}
              disabled={!familyId}
              title={familyId?"":"Enter Family ID/Code first"}
            >
              Find me
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={pinMode}
                onChange={(e)=>{
                  setPinMode(e.target.checked);
                  setSecret("");
                }}
                aria-label="Use PIN mode"
              />
              PIN mode
            </label>

            <Link className="underline opacity-80 hover:opacity-100" to="/child/kiosk">
              Open Big Keypad / QR
            </Link>

            <button type="button" className="px-2 py-1 rounded bg-white/10 hover:bg-white/20" onClick={openScanner}>
              Scan QR
            </button>

            <button
              type="button"
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              onClick={reloadKids}
              disabled={!familyId||loadingKids}
              title={familyId?"Reload names":"Enter Family ID/Code first"}
            >
              Reload names
            </button>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          {!pinMode?(
            <input
              type="password"
              className={inputClass}
              placeholder="Password"
              value={secret}
              onChange={(e)=>setSecret(e.target.value)}
              onKeyDown={(e)=>{
                if(e.key==="Enter"){
                  e.preventDefault();
                  void enter();
                }
              }}
              aria-label="Child password"
            />
          ):(
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              className={`${inputClass} tracking-widest`}
              placeholder="PIN (4–12 digits)"
              value={secret}
              onChange={(e)=>setSecret(e.target.value.replace(/\D+/g,"").slice(0,12))}
              onKeyDown={(e)=>{
                if(e.key==="Enter"){
                  e.preventDefault();
                  void enter();
                }
              }}
              aria-label="Child PIN"
            />
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 focus-ring" onClick={()=>setSecret("")}>
              Clear
            </button>
            <button
              className="px-3 py-2 rounded-xl bg-[var(--brand-emerald)] hover:brightness-110 disabled:opacity-60 focus-ring"
              disabled={!childId||checking}
              onClick={()=>{void enter();}}
            >
              {checking?"Checking…":"Enter"}
            </button>
          </div>

          <p className="mt-2 text-xs text-white/70">
            Parents set this in <b>Parent → Child Passwords</b>.
          </p>
        </div>
      </div>

      {scanOpen&&(
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-4 w-full max-w-md">
            <div className="font-semibold mb-2">Scan Family/Child QR</div>
            <div className="text-xs text-white/70 mb-3">
              We only prefill your name and family—PIN/password is still required.
            </div>
            <div className="rounded-xl overflow-hidden bg-black aspect-video mb-3">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover"/>
            </div>
            <div className="flex justify-end">
              <button className="px-3 py-2 rounded bg-white/10 hover:bg-white/20" onClick={stopScanner}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
