"use client";
import {useEffect,useRef,useState}from "react";
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
import {supabase}from "@/lib/supabase";

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
  // Emails are not used as codes/UUIDs
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

export default function ChildKiosk(){
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
      console.error("[ChildKiosk bootstrapKids] failed:",e);
      toast.error("Could not load names for this family.");
      setChildren([]);
      setChildId("");
    }finally{
      setLoadingKids(false);
    }
  }

  /* ------------------------- initial bootstrap ------------------------- */
  useEffect(()=>{
    (async()=>{
      try{
        const params=new URLSearchParams(window.location.search);
        const fidParam=params.get("fid");
        const nick=params.get("nick");
        let fidUuid: string|null = await resolveFamilyId(fidParam);
        let child=params.get("child")||readLsChildId()||"";

        if(!fidUuid){
          const stored=localStorage.getItem(LS_FAMILY);
          fidUuid=await resolveFamilyId(stored);
        }

        if(!fidUuid&&child){
          fidUuid=await findFamilyForChild(child);
        }

        if(fidUuid){
          setFamilyId(fidUuid);
          localStorage.setItem(LS_FAMILY,fidUuid);
        }else{
          setFamilyId(null);
          setChildren([]);
          return;
        }

        if(fidUuid&&nick&&!child){
          const idFromNick=await childIdByNickname(fidUuid,nick);
          if(idFromNick)child=idFromNick;
        }

        await bootstrapKids(fidUuid,child);
      }catch(e){
        console.error("[ChildKiosk bootstrap] failed:",e);
      }
    })();

    return()=>stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /* --------------------------- PIN helpers --------------------------- */
  function add(n:string){
    if(checking)return;
    setSecret((s)=>(s+n).slice(0,12));
  }
  function back(){
    if(checking)return;
    setSecret((s)=>s.slice(0,-1));
  }
  function clear(){
    if(checking)return;
    setSecret("");
  }

  /* ------------------------------ enter() ------------------------------ */
  async function enter(){
    if(checking)return;

    let fid=familyId;

    // Allow manual family ID / code like ChildLogin
    if(!fid&&manualFid.trim()){
      const resolved=await resolveFamilyId(manualFid.trim());
      if(!resolved){
        toast.error("Family not found.");
        return;
      }
      fid=resolved;
      setFamilyId(fid);
      localStorage.setItem(LS_FAMILY,fid);
      if(!children.length)await bootstrapKids(fid);
    }

    if(!childId&&nickInput.trim()){
      if(!fid){
        toast.error("Enter Family ID/Code (or scan QR) first.");
        return;
      }
      const id=await childIdByNickname(fid,nickInput.trim());
      if(!id){
        toast.error("Nickname not found.");
        return;
      }
      setChildId(id);
      try{
        localStorage.setItem(LS_CHILD,JSON.stringify({id,child_uid:id}));
      }catch{}
    }

    if(!childId)return toast.error("Pick your name");

    if(!fid){
      fid=await findFamilyForChild(childId);
      if(!fid)return toast.error("Family not found.");
      setFamilyId(fid);
      localStorage.setItem(LS_FAMILY,fid);
    }

    if(!secret.trim()){
      toast.error(pinMode?"Enter your PIN.":"Enter your password.");
      return;
    }

    setChecking(true);
    try{
      await tpromise(
        ()=>verifyChildSecretRemote({child_id:childId,fid,clear:secret,pinMode}).then((ok)=>{
          if(!ok){
            const e:any=new Error("Incorrect PIN/password.");
            e.code="BAD_SECRET";
            throw e;
          }
          try{
            localStorage.setItem(LS_CHILD,JSON.stringify({id:childId,child_uid:childId}));
          }catch{}
          sessionStorage.setItem("child_uid",childId);
        }),
        {
          loading:"Checking your entry…",
          success:"Welcome! Taking you to your dashboard 🧭",
          error:(e)=>e?.message||"Login failed.",
          sound:"success",
        }
      );

      window.location.href="/child";
    }finally{
      setChecking(false);
      setSecret("");
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
    if(streamRef.current&&v.srcObject!==streamRef.current){
      v.srcObject=streamRef.current;
      await v.play().catch(()=>{});
    }
    if(detectorRef.current&&v.readyState>=2){
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
        }catch{}
      }
      if(!child&&nick&&fidUuid){
        const id=await childIdByNickname(fidUuid,nick);
        if(id){
          setChildId(id);
          try{
            localStorage.setItem(LS_CHILD,JSON.stringify({id,child_uid:id}));
          }catch{}
        }
        await bootstrapKids(fidUuid);
      }else if(fidUuid){
        await bootstrapKids(fidUuid,child||undefined);
      }
      toast.success("QR loaded.");
    }catch{
      toast.error("Invalid QR.");
    }
  }

  /* ------------------------------- UI -------------------------------- */
  return(
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <h1 className="text-3xl font-bold">Child Kiosk</h1>

      {/* Manual Family ID/Code to mirror ChildLogin behaviour */}
      <div className="glass rounded-2xl p-4">
        <label className="block text-sm mb-1">Family ID or Code (optional)</label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl px-3 py-2 bg-white text-black"
            placeholder="Paste family UUID or short code"
            value={manualFid}
            onChange={(e)=>setManualFid(e.target.value)}
            aria-label="Family ID or Code"
          />
          <button
            type="button"
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
            onClick={async()=>{
              const resolved=await resolveFamilyId(manualFid);
              if(!resolved)return toast.error("Family not found.");
              setFamilyId(resolved);
              localStorage.setItem(LS_FAMILY,resolved);
              await bootstrapKids(resolved);
            }}
          >
            Load
          </button>
        </div>
        <p className="text-xs text-white/60 mt-2">
          Or scan your QR card below. Family code is the same one used on the child login screen.
        </p>
      </div>

      <div className="glass rounded-2xl p-4 overflow-visible relative">
        <div className="mb-2 font-medium">I am</div>
        <div className="relative z-20">
          <select
            className="w-full rounded-xl px-3 py-2 bg-white text-black pointer-events-auto"
            value={childId}
            onChange={(e)=>setChildId(e.target.value)}
            onFocus={()=>{
              if(!children.length&&familyId&&!loadingKids)bootstrapKids(familyId);
            }}
            aria-label="Choose your name"
          >
            <option value="" disabled>
              {loadingKids
                ?"Loading names…"
                :children.length
                ?"— Select your name —"
                :"No names yet (enter Family ID/Code or scan QR)"}
            </option>
            {children.map((c)=>(
              <option key={c.id} value={c.id}>
                {c.name}{typeof c.age==="number"?`· Age ${c.age}`:""}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid sm:grid-cols-[1fr_auto] gap-2">
          <input
            className="rounded-xl px-3 py-2 bg-white text-black"
            placeholder="or type your nickname"
            value={nickInput}
            onChange={(e)=>setNickInput(e.target.value)}
            aria-label="Nickname"
          />
          <button
            type="button"
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
            onClick={async()=>{
              if(!familyId){
                toast.error("Enter Family ID/Code (or scan QR) first.");
                return;
              }
              const id=await childIdByNickname(familyId,nickInput.trim());
              if(!id){
                toast.error("Nickname not found.");
                return;
              }
              setChildId(id);
              try{
                localStorage.setItem(LS_CHILD,JSON.stringify({id,child_uid:id}));
              }catch{}
              toast.success("Found you!");
            }}
          >
            Find me
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-medium">Enter {pinMode?"PIN":"Password"}</div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pinMode}
              onChange={(e)=>{
                if(checking)return;
                setPinMode(e.target.checked);
                setSecret("");
              }}
              aria-label="Use PIN mode"
            />
            PIN mode
          </label>
        </div>

        {!pinMode?(
          <input
            type="password"
            className="mb-4 w-full rounded-xl px-3 py-2 text-black"
            placeholder="Password"
            value={secret}
            onChange={(e)=>setSecret(e.target.value)}
            onKeyDown={(e)=>{
              if(e.key==="Enter")enter();
            }}
            aria-label="Child password"
          />
        ):(
          <>
            <div className="mb-4 h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-2xl tracking-[0.4em]">
              <div className="flex h-full items-center">
                {secret.replace(/./g,"•")||" "}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9"].map((n)=>(
                <button
                  key={n}
                  onClick={()=>add(n)}
                  className="rounded-xl border border-white/10 bg-white/5 py-6 text-3xl"
                >
                  {n}
                </button>
              ))}
              <button
                className="rounded-xl border border-white/10 bg-white/5 py-6"
                onClick={clear}
              >
                Clear
              </button>
              <button
                className="rounded-xl border border-white/10 bg-white/5 py-6 text-3xl"
                onClick={()=>add("0")}
              >
                0
              </button>
              <button
                className="rounded-xl border border-white/10 bg-white/5 py-6"
                onClick={back}
              >
                ⌫
              </button>
            </div>
          </>
        )}

        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          <a
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg_white/20 bg-white/10 hover:bg-white/20"
            href="/child/login"
          >
            Back to Login
          </a>
          <button
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
            onClick={openScanner}
          >
            Scan QR
          </button>
          <button
            className="px-3 py-2 rounded-xl bg-[var(--brand-emerald)] hover:brightness-110 disabled:opacity-60"
            disabled={!childId||checking}
            onClick={enter}
          >
            {checking?"Checking…":"Enter"}
          </button>
        </div>
      </div>

      {scanOpen&&(
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-4 w-full max-w-md">
            <div className="font-semibold mb-2">Scan Family/Child QR</div>
            <div className="text-xs text-white/70 mb-3">
              Point your camera at the QR card. We only prefill your name and
              family—PIN/password is still required.
            </div>
            <div className="rounded-xl overflow-hidden bg-black aspect-video mb-3">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover"/>
            </div>
            <div className="flex justify-end">
              <button
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
                onClick={stopScanner}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
