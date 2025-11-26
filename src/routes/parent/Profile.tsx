import {useEffect,useMemo,useRef,useState}from "react";
import {supabase}from "@/lib/supabase";
import {uploadAvatarPrivately,signAvatarPath}from "@/lib/storage";
import {toast}from "sonner";
import {Save,Trash2,UserCircle2,Info,Image as ImageIcon}from "lucide-react";

/* ----------------------------- Types & Constants ---------------------------- */

type ParentProfile={
  parent_uid:string;
  family_id:string|null;
  first_name:string|null;
  middle_name:string|null;
  last_name:string|null;
  email:string|null;
  phone:string|null;
  country:string|null;
  region:string|null;
  language_pref:string|null;
  avatar_url:string|null;   // signed URL for UI
  avatar_path?:string|null; // stored path (private bucket)
};

const LANGS=[
  {code:"en",label:"English"},
  {code:"hi",label:"हिन्दी (Hindi)"},
  {code:"fr",label:"Français"},
  {code:"es",label:"Español"},
  {code:"de",label:"Deutsch"},
  {code:"zh",label:"中文 (Chinese)"},
  {code:"ja",label:"日本語 (Japanese)"},
];

// 20 preset avatars for parents stored in avatars bucket.
const PARENT_PRESET_PATHS=Array.from({length:20},(_,_i)=>{
  const idx=String(_i+1).padStart(2,"0");
  return `presets/parents/parent-${idx}.png`;
});

type PresetAvatar={path:string;url:string|null};

/* ---------------------------- Lightweight Cropper --------------------------- */
function SquareCropper({
  file,
  onCancel,
  onConfirm,
  size=512,
}:{file:File;onCancel:()=>void;onConfirm:(blob:Blob)=>void;size?:number;}){
  const [imgUrl,setImgUrl]=useState<string>("");
  const [natural,setNatural]=useState<{w:number;h:number}|null>(null);
  const [pos,setPos]=useState({x:0,y:0});
  const [scale,setScale]=useState(1);
  const dragging=useRef<null|{x:number;y:number}>(null);

  useEffect(()=>{
    const url=URL.createObjectURL(file);
    setImgUrl(url);
    return()=>URL.revokeObjectURL(url);
  },[file]);

  function onImgLoad(e:React.SyntheticEvent<HTMLImageElement>){
    const el=e.currentTarget;
    setNatural({w:el.naturalWidth,h:el.naturalHeight});
    setPos({x:0,y:0});
    const minSide=Math.min(el.naturalWidth,el.naturalHeight);
    const initScale=size/minSide;
    setScale(initScale);
  }

  function onMouseDown(e:React.MouseEvent){
    dragging.current={x:e.clientX,y:e.clientY};
    window.addEventListener("mousemove",onMouseMove);
    window.addEventListener("mouseup",onMouseUp);
  }
  function onMouseMove(e:MouseEvent){
    if(!dragging.current)return;
    const dx=e.clientX-dragging.current.x;
    const dy=e.clientY-dragging.current.y;
    dragging.current={x:e.clientX,y:e.clientY};
    setPos((p)=>({x:p.x+dx,y:p.y+dy}));
  }
  function onMouseUp(){
    dragging.current=null;
    window.removeEventListener("mousemove",onMouseMove);
    window.removeEventListener("mouseup",onMouseUp);
  }

  async function confirm(){
    if(!natural)return;
    const canvas=document.createElement("canvas");
    canvas.width=size;
    canvas.height=size;
    const ctx=canvas.getContext("2d")!;
    ctx.clearRect(0,0,size,size);

    const drawW=natural.w*scale;
    const drawH=natural.h*scale;
    const cx=size/2+pos.x;
    const cy=size/2+pos.y;
    const x=cx-drawW/2;
    const y=cy-drawH/2;

    const img=new Image();
    img.src=imgUrl;
    await img.decode();

    ctx.imageSmoothingQuality="high";
    ctx.drawImage(img,x,y,drawW,drawH);

    canvas.toBlob((blob)=>blob&&onConfirm(blob),"image/png",0.95);
  }

  return(
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-4 w-full max-w-xl">
        <div className="font-semibold mb-3">Crop Avatar</div>

        <div
          className="relative mx-auto mb-3"
          style={{
            width:`${size}px`,
            maxWidth:"100%",
            aspectRatio:"1 / 1",
            overflow:"hidden",
            borderRadius:"0.75rem",
            border:"1px solid rgba(255,255,255,0.15)",
            cursor:"grab",
          }}
          onMouseDown={onMouseDown}
        >
          {imgUrl&&(
            <img
              src={imgUrl}
              onLoad={onImgLoad}
              alt="to crop"
              draggable={false}
              className="select-none pointer-events-none"
              style={{
                position:"absolute",
                left:"50%",
                top:"50%",
                transform:`translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                transformOrigin:"center center",
                userSelect:"none",
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-white/10"/>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm opacity-80">Zoom</label>
          <input
            type="range"
            min={0.2}
            max={5}
            step={0.01}
            value={scale}
            onChange={(e)=>setScale(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm tabular-nums">{scale.toFixed(2)}×</span>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"onClick={onCancel}>
            Cancel
          </button>
          <button className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700"onClick={confirm}>
            Save &amp; Upload
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Page ------------------------------------ */

export default function ParentProfilePage(){
  const [p,setP]=useState<ParentProfile|null>(null);
  const [familyId,setFamilyId]=useState<string|null>(null);
  const [familyName,setFamilyName]=useState<string>("My Family");
  const [familyCode,setFamilyCode]=useState<string>(""); // short code used on child login
  const [saving,setSaving]=useState(false);
  const [cropFile,setCropFile]=useState<File|null>(null);
  const fileRef=useRef<HTMLInputElement|null>(null);

  // 🔍 Inline guide modal toggle
  const [guideOpen,setGuideOpen]=useState(false);

  // Preset avatar gallery state
  const [presetOpen,setPresetOpen]=useState(false);
  const [presetLoading,setPresetLoading]=useState(false);
  const [presetOptions,setPresetOptions]=useState<PresetAvatar[]>([]);
  const [presetSelected,setPresetSelected]=useState<string|null>(null);

  const shortId=useMemo(()=>{
    if(!familyId)return"";
    const a=familyId.split("-");
    return a.length?`${a[0].toUpperCase()}…${a[a.length-1]}`:familyId;
  },[familyId]);

  useEffect(()=>{
    (async()=>{
      try{
        const sess=await supabase.auth.getSession();
        const user=sess.data.session?.user;
        if(!user)return;

        const{data:boot,error:bootErr}=await supabase.rpc("api_bootstrap_parent");
        if(bootErr)throw bootErr;

        const fam=(Array.isArray(boot)?boot[0]?.family_id:(boot as any)?.family_id)as string|undefined;
        if(fam)setFamilyId(fam);

        if(fam){
          const{data:famRow}=await supabase
            .from("families")
            .select("display_name,code")
            .eq("id",fam)
            .maybeSingle();

          setFamilyName(famRow?.display_name||"My Family");
          setFamilyCode(famRow?.code||"");
        }

        const{data:full}=await supabase
          .from("parent_profiles")
          .select("*")
          .eq("parent_uid",user.id)
          .maybeSingle();

        if(full){
          const row=full as ParentProfile;
          if(row.avatar_path){
            try{
              const fresh=await signAvatarPath(row.avatar_path,60*60*24*7);
              row.avatar_url=fresh;
            }catch{
              // ignore signing errors
            }
          }
          setP(row);
        }
      }catch(e){
        console.error("[ParentProfilePage] bootstrap failed:",e);
      }
    })();

    const{data:sub}=supabase.auth.onAuthStateChange((_e,s)=>{
      if(!s?.user){
        setFamilyId(null);
        setP(null);
      }
    });
    return()=>sub.subscription.unsubscribe();
  },[]);

  async function save(){
    if(!p)return;

    await toast.promise(
      (async()=>{
        setSaving(true);
        try{
          const{error:e1}=await supabase
            .from("parent_profiles")
            .update({
              first_name:p.first_name,
              middle_name:p.middle_name,
              last_name:p.last_name,
              phone:p.phone,
              country:p.country,
              region:p.region,
              language_pref:p.language_pref,
            })
            .eq("parent_uid",p.parent_uid);

          let e2:any=null;
          if(familyId){
            const{error}=await supabase
              .from("families")
              .update({display_name:familyName||"My Family"})
              .eq("id",familyId);
            e2=error;
          }

          if(e1||e2){
            const msg=(e1?.message||"")+(e2?.message?`\n${e2.message}`:"");
            throw new Error(msg||"Save failed");
          }
        }finally{
          setSaving(false);
        }
      })(),
      {
        loading:"Saving profile…",
        success:"Profile updated successfully.",
        error:(err)=>err?.message||"Could not save profile.",
      }
    );
  }

  async function del(){
    if(!p)return;
    const okConfirm=window.confirm("Delete your parent profile?");
    if(!okConfirm)return;

    await toast.promise(
      (async()=>{
        const{error}=await supabase
          .from("parent_profiles")
          .delete()
          .eq("parent_uid",p.parent_uid);
        if(error)throw error;
        setP(null);
      })(),
      {
        loading:"Deleting profile…",
        success:"Parent profile deleted.",
        error:(err)=>err?.message||"Could not delete profile.",
      }
    );
  }

  function onPickAvatar(){
    fileRef.current?.click();
  }
  function onLocalFileChosen(f?:File){
    if(!f)return;
    setCropFile(f);
  }

  async function uploadCropped(blob:Blob){
    if(!p)return;
    setCropFile(null);

    try{
      const file=new File([blob],"avatar.png",{type:"image/png"});
      const{path,signedUrl}=await uploadAvatarPrivately(file);
      await supabase
        .from("parent_profiles")
        .update({avatar_path:path})
        .eq("parent_uid",p.parent_uid);
      setP({...p,avatar_url:signedUrl,avatar_path:path});
      toast.success("Avatar updated.");
    }catch(e:any){
      toast.error(e?.message||"Upload failed");
    }
  }

  async function openPresetGallery(){
    setPresetOpen(true);
    setPresetSelected(p?.avatar_path??null);

    if(presetOptions.length||presetLoading)return;
    setPresetLoading(true);
    try{
      const rows:PresetAvatar[]=await Promise.all(
        PARENT_PRESET_PATHS.map(async(path)=>{
          const url=await signAvatarPath(path,60*60*24*7);
          return{path,url};
        })
      );
      setPresetOptions(rows);
    }catch(e){
      console.error("[ParentProfilePage] preset load error",e);
    }finally{
      setPresetLoading(false);
    }
  }

  async function applyPresetAvatar(){
    if(!p||!presetSelected)return;
    try{
      const signed=await signAvatarPath(presetSelected,60*60*24*7);
      const{error}=await supabase
        .from("parent_profiles")
        .update({avatar_path:presetSelected})
        .eq("parent_uid",p.parent_uid);
      if(error)throw error;

      setP({...p,avatar_path:presetSelected,avatar_url:signed});
      toast.success("Avatar updated.");
      setPresetOpen(false);
    }catch(e:any){
      toast.error(e?.message||"Failed to apply avatar");
    }
  }

  async function copyFamilyCode(){
    if(!familyCode)return;
    try{
      await navigator.clipboard.writeText(familyCode);
      toast.success("Family code copied. Share this with your children for login.");
    }catch{
      toast.error("Could not copy code. You can still read it and type it manually.");
    }
  }

  if(!p)return<div>Loading…</div>;

  return(
    <div className="max-w-3xl">
      {/* Header + guide button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <UserCircle2 className="w-7 h-7 text-emerald-300"/>
          <h1 className="text-3xl font-bold">My Profile</h1>
        </div>
        <button
          type="button"
          onClick={()=>setGuideOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg.white/20 text-xs md:text-sm text-white border border-white/15"
        >
          <Info className="w-4 h-4"/>
          <span>Guide, instructions &amp; process</span>
        </button>
      </div>

      {/* Parent instructions */}
      <div className="glass rounded-2xl p-4 mb-4 flex gap-3">
        <div className="mt-1">
          <Info className="w-5 h-5 text-sky-300"/>
        </div>
        <div className="space-y-1 text-sm text.white/80">
          <p>
            Use this page to keep your <span className="font-semibold">parent details</span> and{" "}
            <span className="font-semibold">family name</span> up to date. Your avatar and
            language preference are shown across the parent dashboards.
          </p>
          <p className="text-white/70">
            After updating your information, click{" "}
            <span className="font-semibold">Save Profile</span>. Changes apply immediately and are
            used by notifications, QR flows, and other parent tools.
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 grid md:grid-cols-2 gap-4">
        {/* Avatar row */}
        <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center gap-4">
          <img
            src={p.avatar_url||"https://placehold.co/96x96?text=👤"}
            alt="Avatar"
            className="h-16 w-16 rounded-full object-cover ring-2 ring-white/20"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg.white/20 text-sm"
              onClick={onPickAvatar}
              type="button"
            >
              <UserCircle2 className="w-4 h-4"/>
              <span>Upload Avatar</span>
            </button>
            <button
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg.white/20 text-sm"
              type="button"
              onClick={openPresetGallery}
            >
              <ImageIcon className="w-4 h-4"/>
              <span>Choose from gallery</span>
            </button>
            {p.avatar_url&&(
              <a
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg.white/20 text-sm"
                href={p.avatar_url}
                target="_blank"
                rel="noreferrer"
              >
                <span>View current</span>
              </a>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e)=>onLocalFileChosen(e.target.files?.[0])}
          />
        </div>

        {/* Family name */}
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-xs font-medium text-white/70">Family name</label>
          <input
            className="w-full rounded-xl bg-slate-900/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
            placeholder="e.g., The Johnsons"
            value={familyName}
            onChange={(e)=>setFamilyName(e.target.value)}
          />
        </div>

        {/* Family login code for children */}
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-xs font-medium text-white/70">
            Family login code (for children)
          </label>
          <div className="flex gap-2">
            <input
              className="w-full rounded-xl bg-slate-900/60 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
              value={familyCode?familyCode.toUpperCase():"Not available"}
              readOnly
              placeholder="Family code will appear here"
            />
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg.white/20 text-xs"
              onClick={copyFamilyCode}
              disabled={!familyCode}
            >
              Copy
            </button>
          </div>
          <p className="text-[11px] text-white/60">
            Children can type this into <b>“Family ID or Code”</b> on the Child Login screen, or use
            a QR card from <b>Parent → QR Cards</b>.
          </p>
        </div>

        {/* Profile fields */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/70">First name</label>
          <input
            className="w-full rounded-xl bg-slate-900/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
            placeholder="First name"
            value={p.first_name??""}
            onChange={(e)=>setP({...p,first_name:e.target.value})}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/70">Middle name</label>
          <input
            className="w-full rounded-xl bg-slate-900/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
            placeholder="Middle name"
            value={p.middle_name??""}
            onChange={(e)=>setP({...p,middle_name:e.target.value})}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/70">Last name</label>
          <input
            className="w-full rounded-xl bg-slate-900/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
            placeholder="Last name"
            value={p.last_name??""}
            onChange={(e)=>setP({...p,last_name:e.target.value})}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/70">Phone</label>
          <input
            className="w-full rounded-xl bg-slate-900/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
            placeholder="Phone"
            value={p.phone??""}
            onChange={(e)=>setP({...p,phone:e.target.value})}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/70">Country</label>
          <input
            className="w-full rounded-xl bg-slate-900/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
            placeholder="Country"
            value={p.country??""}
            onChange={(e)=>setP({...p,country:e.target.value})}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/70">Region / State</label>
          <input
            className="w-full rounded-xl bg-slate-900/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
            placeholder="Region/State"
            value={p.region??""}
            onChange={(e)=>setP({...p,region:e.target.value})}
          />
        </div>

        {/* Language dropdown */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/70">Language preference</label>
          <select
            className="dark-select w-full rounded-xl bg-slate-800 text-white border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-900"
            value={p.language_pref??""}
            onChange={(e)=>setP({...p,language_pref:e.target.value})}
          >
            <option value="">Select language…</option>
            {LANGS.map((l)=>(
              <option key={l.code}value={l.code}>
                {l.label} ({l.code})
              </option>
            ))}
          </select>
        </div>

        {/* IDs (tiny) */}
        <div className="text-sm text-white/60 md:col-span-2">
          Family: <span className="font-medium">{familyName}</span>
          {familyId&&<span className="opacity-60"> (ID {shortId})</span>}
          {familyCode&&(
            <span className="ml-2 opacity-70">
              • Code <span className="font-mono">{familyCode.toUpperCase()}</span>
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-sm"
            disabled={saving}
            onClick={save}
          >
            <Save className="w-4 h-4"/>
            <span>{saving?"Saving…":"Save Profile"}</span>
          </button>
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm"
            onClick={del}
            type="button"
          >
            <Trash2 className="w-4 h-4"/>
            <span>Delete Profile</span>
          </button>
        </div>
      </div>

      {/* Guide / instructions overlay (keep your existing JSX here) */}
      {guideOpen&&(
        <></>
      )}

      {/* Option styling fallback for dark selects */}
      <style>{`
        select.dark-select option {
          background-color:#ffffff;
          color:#020617;
        }
      `}</style>

      {/* Cropper modal */}
      {cropFile&&(
        <SquareCropper
          file={cropFile}
          size={512}
          onCancel={()=>setCropFile(null)}
          onConfirm={(blob)=>uploadCropped(blob)}
        />
      )}

      {/* Preset avatar gallery modal */}
      {presetOpen&&(
        <div className="fixed inset-0 z-[62] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <ImageIcon className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">Choose a preset avatar</h2>
                  <p className="text-xs text-white/60">
                    Pick one of the pre-made avatars or close this and upload your own photo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
                onClick={()=>{
                  setPresetOpen(false);
                  setPresetSelected(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {presetLoading?(
                <div className="text-sm text-white/70">Loading avatars…</div>
              ):(
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-4">
                  {presetOptions.map((opt)=>(
                    <button
                      key={opt.path}
                      type="button"
                      className={`flex flex-col items-center gap-1 group ${
                        presetSelected===opt.path?"ring-2 ring-emerald-400 rounded-2xl p-1 -m-1":""
                      }`}
                      onClick={()=>setPresetSelected(opt.path)}
                    >
                      <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/10 group-hover:ring-emerald-300/80 bg-slate-800 flex items-center justify-center">
                        {opt.url?(
                          <img
                            src={opt.url}
                            alt="preset avatar"
                            className="w-full h-full object-cover"
                          />
                        ):(
                          <span className="text-xs text-white/60">No preview</span>
                        )}
                      </div>
                    </button>
                  ))}
                  {presetOptions.length===0&&!presetLoading&&(
                    <div className="text-sm text-white/70 col-span-full">
                      No preset avatars found. Upload PNGs to
                      <span className="font-mono px-1">avatars/presets/parents</span> then reload.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                onClick={()=>{
                  setPresetOpen(false);
                  setPresetSelected(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm disabled:opacity-60"
                disabled={!presetSelected}
                onClick={applyPresetAvatar}
              >
                Use selected avatar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
