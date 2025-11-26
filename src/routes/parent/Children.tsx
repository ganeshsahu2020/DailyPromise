// src/routes/parent/Children.tsx
import {useEffect,useRef,useState}from "react";
import {supabase}from "@/lib/supabase";
import {uploadAvatarPrivately,signAvatarPath}from "@/lib/storage";
import {adminSetChildSecret}from "@/utils/childAuth";
import {toast}from "sonner";
import {Edit2,Trash2,Save,XCircle,Image as ImageIcon,UserPlus,Info}from "lucide-react";

/* ------------------------------- Types ------------------------------------- */
type Child={
  child_uid:string;
  first_name:string;
  last_name:string|null;
  nick_name:string|null;
  age:number|null;
  birthday?:string|null;

  // DB
  avatar_path:string|null;
  avatar_url?:string|null;

  id?:string;
};

type PresetAvatar={path:string;url:string|null};

// 20 preset avatars for children.
// Make sure these files exist in the `avatars` bucket,
// e.g. avatars/presets/children/child-01.png ... child-20.png
const CHILD_PRESET_PATHS=Array.from({length:20},(_,_i)=>{
  const idx=String(_i+1).padStart(2,"0");
  return`presets/children/child-${idx}.png`;
});

/* ----------------------- Inline safe placeholder --------------------------- */
const avatarPlaceholder=
  `data:image/svg+xml;utf8,`+
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#0ea5e9'/>
          <stop offset='100%' stop-color='#10b981'/>
        </linearGradient>
      </defs>
      <circle cx='48' cy='48' r='48' fill='#111827'/>
      <circle cx='48' cy='36' r='16' fill='url(#g)'/>
      <rect x='20' y='58' width='56' height='22' rx='11' fill='url(#g)'/>
    </svg>`
  );

/* ---------------------- Lightweight 1:1 cropper ---------------------------- */
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
  const drag=useRef<null|{x:number;y:number}>(null);

  useEffect(()=>{
    const url=URL.createObjectURL(file);
    setImgUrl(url);
    return()=>URL.revokeObjectURL(url);
  },[file]);

  function onImgLoad(e:React.SyntheticEvent<HTMLImageElement>){
    const el=e.currentTarget;
    const w=el.naturalWidth,h=el.naturalHeight;
    setNatural({w,h});
    const minSide=Math.min(w,h);
    setScale(size/minSide);
    setPos({x:0,y:0});
  }

  function onMouseDown(e:React.MouseEvent){
    drag.current={x:e.clientX,y:e.clientY};
    window.addEventListener("mousemove",onMouseMove);
    window.addEventListener("mouseup",onMouseUp);
  }
  function onMouseMove(e:MouseEvent){
    if(!drag.current)return;
    const dx=e.clientX-drag.current.x;
    const dy=e.clientY-drag.current.y;
    drag.current={x:e.clientX,y:e.clientY};
    setPos((p)=>({x:p.x+dx,y:p.y+dy}));
  }
  function onMouseUp(){
    drag.current=null;
    window.removeEventListener("mousemove",onMouseMove);
    window.removeEventListener("mouseup",onMouseUp);
  }

  async function confirm(){
    if(!natural)return;
    const canvas=document.createElement("canvas");
    canvas.width=size;
    canvas.height=size;
    const ctx=canvas.getContext("2d")!;
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
          {!!imgUrl&&(
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

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg-white/20"
            onClick={onCancel}
          >
            <XCircle className="w-4 h-4"/>
            <span>Cancel</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700"
            onClick={confirm}
          >
            <Save className="w-4 h-4"/>
            <span>Save &amp; Upload</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Page ------------------------------------ */
export default function ChildrenPage(){
  const [familyId,setFamilyId]=useState<string|null>(null);
  const [children,setChildren]=useState<Child[]>([]);
  const [loading,setLoading]=useState(true);

  // new child form
  const [fn,setFn]=useState("");
  const [ln,setLn]=useState("");
  const [nn,setNn]=useState("");
  const [age,setAge]=useState<number>(9);
  const [dob,setDob]=useState<string>(""); // YYYY-MM-DD

  // optional: set secret at creation
  const [secretMode,setSecretMode]=useState<"pin"|"password">("pin");
  const [secretValue,setSecretValue]=useState<string>("");

  // avatar for new child
  const [newAvatarSigned,setNewAvatarSigned]=useState<string>("");
  const [newAvatarPath,setNewAvatarPath]=useState<string>("");

  // per-row edit/delete state
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editDraft,setEditDraft]=useState<Partial<Child>|null>(null);
  const [rowBusy,setRowBusy]=useState<string|null>(null);

  // cropper states
  const newFileRef=useRef<HTMLInputElement|null>(null);
  const [cropNewFile,setCropNewFile]=useState<File|null>(null);

  const changeFileRef=useRef<HTMLInputElement|null>(null);
  const [cropForChild,setCropForChild]=useState<{file:File;child_uid:string}|null>(null);
  const [changingFor,setChangingFor]=useState<string|null>(null);

  // QR modal state
  const [qrFor,setQrFor]=useState<Child|null>(null);
  function openQrFor(c:Child){
    setQrFor(c);
  }
  function closeQr(){
    setQrFor(null);
  }

  // inline guide modal
  const [guideOpen,setGuideOpen]=useState(false);

  // preset avatar gallery state
  // "new" => apply to new child form; otherwise child_uid of existing child
  const [presetForChild,setPresetForChild]=useState<"new"|string|null>(null);
  const [childPresetLoading,setChildPresetLoading]=useState(false);
  const [childPresetOptions,setChildPresetOptions]=useState<PresetAvatar[]>([]);
  const [childPresetSelected,setChildPresetSelected]=useState<string|null>(null);

  useEffect(()=>{
    (async()=>{
      try{
        const sess=await supabase.auth.getSession();
        if(!sess.data.session){
          setLoading(false);
          return;
        }
        const{data:prof,error:meErr}=await supabase.rpc("my_profile");
        if(meErr)throw meErr;

        const fam=(Array.isArray(prof)?prof[0]?.family_id:(prof as any)?.family_id)??null;
        setFamilyId(fam);

        if(fam){
          await refreshChildren(fam);
        }
      }catch(e:any){
        console.error("[ChildrenPage] init error:",e?.message||e);
      }finally{
        setLoading(false);
      }
    })();
  },[]);

  async function refreshChildren(fam:string){
    try{
      const{data,error}=await supabase
        .from("child_profiles")
        .select("child_uid,first_name,last_name,nick_name,age,avatar_path,birthday,id")
        .eq("family_id",fam)
        .order("created_at",{ascending:false});
      if(error)throw error;

      const rows=(data||[])as Child[];

      const withSigned=await Promise.all(
        rows.map(async(c)=>{
          if(!c.avatar_path)return{...c,avatar_url:null};
          const signed=await signAvatarPath(c.avatar_path,60*60*24*7);
          if(!signed&&c.avatar_path.startsWith("parents/")){
            return{...c,avatar_url:null};
          }
          return{...c,avatar_url:signed};
        })
      );
      setChildren(withSigned);
    }catch(e:any){
      console.error("[ChildrenPage] refreshChildren error:",e?.message||e);
      setChildren([]);
    }
  }

  function pickNewAvatar(){
    newFileRef.current?.click();
  }
  function onNewLocalFile(f?:File){
    if(!f)return;
    setCropNewFile(f);
  }
  async function uploadCroppedForNew(blob:Blob){
    setCropNewFile(null);
    try{
      const file=new File([blob],"child.png",{type:"image/png"});
      const{path,signedUrl}=await uploadAvatarPrivately(
        file,
        (me)=>`children/${me.id}-${Date.now()}.png`
      );
      setNewAvatarPath(path);
      setNewAvatarSigned(signedUrl);
    }catch(e:any){
      alert(e.message||"Upload failed");
    }
  }

  function startChangeAvatar(child_uid:string){
    setChangingFor(child_uid);
    changeFileRef.current?.click();
  }
  function onChangeLocalFile(f?:File){
    if(!f||!changingFor)return;
    setCropForChild({file:f,child_uid:changingFor});
  }
  async function uploadCroppedForChild(child_uid:string,blob:Blob){
    setCropForChild(null);
    setChangingFor(null);
    try{
      const file=new File([blob],"child.png",{type:"image/png"});
      const{path}=await uploadAvatarPrivately(file,()=>`children/${child_uid}-${Date.now()}.png`);
      const{error}=await supabase
        .from("child_profiles")
        .update({avatar_path:path})
        .eq("child_uid",child_uid);
      if(error)throw error;

      if(familyId)await refreshChildren(familyId);
    }catch(e:any){
      alert(e.message||"Upload failed");
    }
  }

  async function fixAvatarPath(c:Child){
    if(!c.avatar_path||!c.avatar_path.startsWith("parents/")){
      alert("This child's avatar is not using a legacy parents/ path.");
      return;
    }
    if(!confirm(`Fix avatar path for ${c.first_name}?`))return;

    try{
      setRowBusy(c.child_uid);

      const oldPath=c.avatar_path;
      const newPath=`children/${c.child_uid}.png`;

      const copyRes=await supabase.storage.from("avatars").copy(oldPath,newPath);
      if(copyRes.error)throw copyRes.error;

      const{error:updErr}=await supabase
        .from("child_profiles")
        .update({avatar_path:newPath})
        .eq("child_uid",c.child_uid);
      if(updErr)throw updErr;

      if(familyId)await refreshChildren(familyId);
      alert("Avatar path fixed.");
    }catch(e:any){
      console.error("[fixAvatarPath] error:",e?.message||e);
      alert(e?.message||"Failed to fix avatar path.");
    }finally{
      setRowBusy(null);
    }
  }

  async function ensureChildPresetsLoaded(){
    if(childPresetOptions.length||childPresetLoading)return;
    setChildPresetLoading(true);
    try{
      const rows:PresetAvatar[]=await Promise.all(
        CHILD_PRESET_PATHS.map(async(path)=>{
          const url=await signAvatarPath(path,60*60*24*7);
          return{path,url};
        })
      );
      setChildPresetOptions(rows);
    }catch(e){
      console.error("[ChildrenPage] load child presets error",e);
    }finally{
      setChildPresetLoading(false);
    }
  }

  function openPresetForNewChild(){
    setPresetForChild("new");
    setChildPresetSelected(newAvatarPath||null);
    ensureChildPresetsLoaded();
  }

  function openPresetForExistingChild(child_uid:string){
    setPresetForChild(child_uid);
    const child=children.find((c)=>c.child_uid===child_uid);
    setChildPresetSelected(child?.avatar_path??null);
    ensureChildPresetsLoaded();
  }

  async function applyChildPresetAvatar(){
    if(!presetForChild||!childPresetSelected)return;
    try{
      const signed=await signAvatarPath(childPresetSelected,60*60*24*7);
      if(presetForChild==="new"){
        setNewAvatarPath(childPresetSelected);
        setNewAvatarSigned(signed||"");
      }else{
        const child_uid=presetForChild;
        const{error}=await supabase
          .from("child_profiles")
          .update({avatar_path:childPresetSelected})
          .eq("child_uid",child_uid);
        if(error)throw error;
        if(familyId)await refreshChildren(familyId);
      }
      setPresetForChild(null);
      setChildPresetSelected(null);
    }catch(e:any){
      alert(e?.message||"Failed to apply avatar");
    }
  }

  function computeAgeFromDob(d:string):number|null{
    if(!d)return null;
    const b=new Date(d+"T00:00:00");
    if(isNaN(b.getTime()))return null;
    const today=new Date();
    let years=today.getFullYear()-b.getFullYear();
    const m=today.getMonth()-b.getMonth();
    if(m<0||(m===0&&today.getDate()<b.getDate()))years--;
    return years>=0?years:null;
  }

  /* ----------------------------- CRUD actions ------------------------------ */
  async function addChild(){
    if(!familyId){
      alert("No family associated with your account. Ask an admin to link your profile to a family.");
      return;
    }
    if(!nn.trim()){
      alert("Nickname is required (used as handle).");
      return;
    }
    if(secretMode==="pin"&&secretValue.trim()&&!/^\d{4,12}$/.test(secretValue.trim())){
      alert("PIN must be 4–12 digits.");
      return;
    }

    const me=(await supabase.auth.getUser()).data.user;
    if(!me){
      alert("You must be signed in.");
      return;
    }

    const ageFromDob=computeAgeFromDob(dob);
    const finalAge=typeof age==="number"&&age!==9?age:ageFromDob??age;

    const payload:any={
      family_id:familyId,
      first_name:fn,
      last_name:ln||null,
      nick_name:nn||null,
      avatar_path:newAvatarPath||null,
      age:finalAge,
      birthday:dob||null,
      created_by:me.id,
    };

    async function doAddChild(){
      let row:{child_uid?:string;id?:string}|null=null;

      try{
        const{data,error}=await supabase
          .from("child_profiles")
          .insert(payload)
          .select("child_uid,id")
          .single();

        if(error){
          if(String(error.message||"").includes("created_by")){
            delete payload.created_by;
            const retry=await supabase
              .from("child_profiles")
              .insert(payload)
              .select("child_uid,id")
              .single();
            if(retry.error)throw retry.error;
            row=retry.data as any;
          }else{
            throw error;
          }
        }else{
          row=data as any;
        }
      }catch(e:any){
        if((e as any).code==="23505"){
          throw new Error("That nickname is already taken in your family. Pick another.");
        }
        console.error("[addChild] insert error:",e?.message||e);
        throw new Error(e?.message||"Insert failed");
      }

      const newChildId=row?.id;
      const newChildUid=row?.child_uid;

      if(secretValue.trim()){
        try{
          const ok=await adminSetChildSecret({
            child_id:newChildId,
            child_uid:newChildId?undefined:newChildUid,
            fid:familyId,
            clear:secretMode==="pin"?secretValue.trim():secretValue,
            pinMode:secretMode==="pin",
          });
          if(!ok)throw new Error("No update performed");
        }catch(e:any){
          console.warn("[addChild] Secret not set immediately:",e?.message||e);
        }
      }

      // Reset form
      setFn("");
      setLn("");
      setNn("");
      setNewAvatarPath("");
      setNewAvatarSigned("");
      setAge(9);
      setDob("");
      setSecretValue("");
      setSecretMode("pin");

      await refreshChildren(familyId);
    }

    await toast.promise(doAddChild(),{
      loading:"Saving child profile…",
      success:"Child profile saved.",
      error:(err:any)=>err?.message||"Failed to save child profile.",
    });
  }

  function beginEdit(c:Child){
    setEditingId(c.child_uid);
    setEditDraft({
      child_uid:c.child_uid,
      first_name:c.first_name,
      last_name:c.last_name,
      nick_name:c.nick_name,
      age:c.age,
      birthday:c.birthday??null,
    });
  }
  function cancelEdit(){
    setEditingId(null);
    setEditDraft(null);
  }
  async function saveEdit(){
    if(!editingId||!editDraft)return;
    setRowBusy(editingId);

    async function doSave(){
      let nextAge:number|null=typeof editDraft.age==="number"?editDraft.age:null;
      if(!nextAge&&editDraft.birthday){
        nextAge=computeAgeFromDob(editDraft.birthday);
      }

      const{error}=await supabase
        .from("child_profiles")
        .update({
          first_name:editDraft.first_name??undefined,
          last_name:editDraft.last_name??null,
          nick_name:editDraft.nick_name??null,
          age:nextAge,
          birthday:editDraft.birthday??null,
        })
        .eq("child_uid",editingId);
      if(error)throw error;

      if(familyId)await refreshChildren(familyId);
      cancelEdit();
    }

    try{
      await toast.promise(doSave(),{
        loading:"Saving changes…",
        success:"Child profile updated.",
        error:(err:any)=>err?.message||"Failed to update child profile.",
      });
    }finally{
      setRowBusy(null);
    }
  }

  async function deleteChild(c:Child){
    if(!familyId)return;
    if(!confirm(`Delete ${c.first_name}${c.last_name?" "+c.last_name:""}?`))return;
    setRowBusy(c.child_uid);

    async function doDelete(){
      if(c.avatar_path){
        await supabase.storage
          .from("avatars")
          .remove([c.avatar_path])
          .catch(()=>{});
      }
      const{error}=await supabase
        .from("child_profiles")
        .delete()
        .eq("child_uid",c.child_uid);
      if(error)throw error;

      await refreshChildren(familyId);
    }

    try{
      await toast.promise(doDelete(),{
        loading:"Deleting child…",
        success:"Child profile deleted.",
        error:(err:any)=>err?.message||"Failed to delete child.",
      });
    }finally{
      setRowBusy(null);
    }
  }

  if(loading)return<div>Loading…</div>;

  return(
    <div className="max-w-5xl">
      {/* Header + guide button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-3xl font-bold">Children</h1>
        <button
          type="button"
          onClick={()=>setGuideOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs md:text-sm text-white border border-white/15"
        >
          <Info className="w-4 h-4"/>
          <span>Guide, instructions &amp; process</span>
        </button>
      </div>

      {/* Parent guidance for managing child accounts */}
      <div className="glass rounded-2xl p-4 mb-6">
        <div className="text-sm text-white/80 font-semibold mb-1">
          How to manage your children&apos;s profiles
        </div>
        <ul className="text-xs sm:text-sm text-white/70 list-disc list-inside space-y-1">
          <li>
            Create <span className="font-semibold">one profile per child</span>. The
            nickname is used as their friendly handle and in QR codes.
          </li>
          <li>
            You can set either a <span className="font-semibold">PIN</span> (4–12 digits)
            or a <span className="font-semibold">password</span>. Keep this secret and
            do not reuse important passwords.
          </li>
          <li>
            Use <span className="font-semibold">Edit</span> to update names, nickname,
            or age, and <span className="font-semibold">Delete</span> if you need to
            remove a test profile or a profile no longer in use.
          </li>
          <li>
            Avatars help your child recognize their account quickly on kiosks and
            dashboards. Crop and upload a clear face or character they know.
          </li>
          <li>
            QR codes (from the QR button and the Print QR Cards page){" "}
            <span className="font-semibold">only prefill the account</span>; your child
            still needs their PIN/password to log in.
          </li>
        </ul>
      </div>

      {!familyId&&(
        <div className="glass rounded-2xl p-4 mb-6">
          <div className="text-sm">
            No family is linked to your profile yet. Ask an admin to assign you to a family, then reload this page.
          </div>
        </div>
      )}

      {/* Create Child */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="font-semibold mb-3">Create Child Profile</div>

        {/* Avatar preview + pick */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <img
            src={newAvatarSigned||avatarPlaceholder}
            alt="preview"
            className="w-16 h-16 rounded-full object-cover ring-2 ring-white/20"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg-white/20 w-full sm:w-auto"
              onClick={pickNewAvatar}
              disabled={!familyId}
              title={!familyId?"No family linked":""}
            >
              <ImageIcon className="w-4 h-4"/>
              <span>Upload Avatar</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg-white/20 w-full sm:w-auto"
              onClick={openPresetForNewChild}
              disabled={!familyId}
              title={!familyId?"No family linked":""}
            >
              <ImageIcon className="w-4 h-4"/>
              <span>Choose from gallery</span>
            </button>
          </div>
          <input
            ref={newFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e)=>onNewLocalFile(e.target.files?.[0]||undefined)}
          />
        </div>

        <div className="grid md:grid-cols-6 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/70">First name</label>
            <input
              className="rounded px-3 py-2 text-black"
              placeholder="First name"
              value={fn}
              onChange={(e)=>setFn(e.target.value)}
              disabled={!familyId}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/70">Last name (optional)</label>
            <input
              className="rounded px-3 py-2 text-black"
              placeholder="Last name"
              value={ln}
              onChange={(e)=>setLn(e.target.value)}
              disabled={!familyId}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/70">Nickname (required)</label>
            <input
              className="rounded px-3 py-2 text-black"
              placeholder="Nickname (used for QR/login handle)"
              value={nn}
              onChange={(e)=>setNn(e.target.value)}
              disabled={!familyId}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/70">Date of birth</label>
            <input
              className="rounded px-3 py-2 text-black"
              type="date"
              value={dob}
              onChange={(e)=>setDob(e.target.value)}
              disabled={!familyId}
              aria-label="Date of Birth"
              placeholder="YYYY-MM-DD"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/70">Age override (optional)</label>
            <input
              className="rounded px-3 py-2 text-black"
              type="number"
              min={3}
              max={17}
              value={age}
              onChange={(e)=>setAge(parseInt(e.target.value||"9"))}
              disabled={!familyId}
              title="Age (auto-computed from DOB if left default)"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/70">Login type</label>
            <div className="rounded px-3 py-2 bg.white/5 bg-white/5 text-sm flex items-center gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="secretMode"
                  checked={secretMode==="pin"}
                  onChange={()=>setSecretMode("pin")}
                  disabled={!familyId}
                />
                PIN
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="secretMode"
                  checked={secretMode==="password"}
                  onChange={()=>setSecretMode("password")}
                  disabled={!familyId}
                />
                Password
              </label>
            </div>
          </div>
        </div>

        <div className="mt-3 grid md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/70">
              {secretMode==="pin"?"PIN (4–12 digits)":"Password"}
            </label>
            <input
              className="rounded px-3 py-2 text-black"
              placeholder={secretMode==="pin"?"PIN (4–12 digits)":"Password"}
              inputMode={secretMode==="pin"?"numeric":undefined}
              pattern={secretMode==="pin"?"[0-9]*":undefined}
              value={secretValue}
              onChange={(e)=>
                setSecretValue(
                  secretMode==="pin"
                    ?e.target.value.replace(/\D+/g,"").slice(0,12)
                    :e.target.value
                )
              }
              aria-label={secretMode==="pin"?"PIN (4–12 digits)":"Password"}
              disabled={!familyId}
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 w-full sm:w-auto"
              onClick={addChild}
              disabled={!familyId}
              title={!familyId?"No family linked":""}
            >
              <UserPlus className="w-4 h-4"/>
              <span>Add Child</span>
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-white/5 pt-3 text-xs text-white/70 space-y-1">
          <p className="font-medium">Tips for keeping accounts safe and clear:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Use nicknames that your child recognizes but don&apos;t expose private info.</li>
            <li>
              PINs should be easy for your child to remember but hard for siblings or friends to guess.
            </li>
            <li>
              If you change a child&apos;s PIN or password, let them know before their next session so they don&apos;t get locked out.
            </li>
            <li>
              Use Delete sparingly; once a profile is removed, activity and rewards tied to that child may no longer be visible.
            </li>
          </ul>
        </div>
      </div>

      {/* Existing children */}
      <div className="grid md:grid-cols-2 gap-4">
        {children.map((c)=>{
          const isEditing=editingId===c.child_uid;
          const needsFix=!!c.avatar_path&&c.avatar_path.startsWith("parents/");
          return(
            <div
              key={c.child_uid}
              className="glass rounded-2xl p-4 flex flex-col sm:flex-row gap-4 sm:items-center"
            >
              <img
                src={c.avatar_url||avatarPlaceholder}
                alt={c.first_name}
                className="w-16 h-16 rounded-full object-cover ring-2 ring-white/20 shrink-0"
              />

              <div className="flex-1 min-w-0 break-words">
                {!isEditing?(
                  <>
                    <div className="text-lg font-semibold">
                      <span>
                        {c.first_name} {c.last_name||""}
                      </span>{" "}
                      {c.nick_name?<span className="text-white/60">({c.nick_name})</span>:null}
                    </div>
                    <div className="text-white/70 text-sm">
                      Age: {c.age??"—"} {c.birthday?` • DOB: ${c.birthday}`:""}
                    </div>
                    {needsFix&&(
                      <div className="text-xs text-amber-300 mt-1">
                        Legacy avatar path detected (parents/…). Click “Fix Avatar Path”.
                      </div>
                    )}
                  </>
                ):(
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/70">First name</label>
                      <input
                        className="rounded px-3 py-2 text-black"
                        placeholder="First name"
                        value={editDraft?.first_name??""}
                        onChange={(e)=>
                          setEditDraft((d)=>({... (d||{}),first_name:e.target.value}))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/70">Last name</label>
                      <input
                        className="rounded px-3 py-2 text-black"
                        placeholder="Last name"
                        value={editDraft?.last_name??""}
                        onChange={(e)=>
                          setEditDraft((d)=>({... (d||{}),last_name:e.target.value}))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/70">Nickname</label>
                      <input
                        className="rounded px-3 py-2 text-black"
                        placeholder="Nickname"
                        value={editDraft?.nick_name??""}
                        onChange={(e)=>
                          setEditDraft((d)=>({... (d||{}),nick_name:e.target.value}))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/70">Age</label>
                      <input
                        className="rounded px-3 py-2 text-black"
                        type="number"
                        min={3}
                        max={17}
                        placeholder="Age"
                        value={editDraft?.age??""}
                        onChange={(e)=>
                          setEditDraft((d)=>({
                            ... (d||{}),
                            age:e.target.value?parseInt(e.target.value):null,
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-white/70">Birthday</label>
                      <input
                        className="rounded px-3 py-2 text-black"
                        type="date"
                        placeholder="YYYY-MM-DD"
                        value={(editDraft?.birthday as string)??""}
                        onChange={(e)=>
                          setEditDraft((d)=>({
                            ... (d||{}),
                            birthday:e.target.value||null,
                          }))
                        }
                        aria-label="Birthday"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-col gap-2 w-full sm:w-auto">
                {!isEditing?(
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg-white/20 w-full sm:w-auto"
                      onClick={()=>startChangeAvatar(c.child_uid)}
                      disabled={rowBusy===c.child_uid}
                    >
                      <ImageIcon className="w-4 h-4"/>
                      <span>Change Avatar</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg-white/20 w-full sm:w-auto"
                      onClick={()=>openPresetForExistingChild(c.child_uid)}
                      disabled={rowBusy===c.child_uid}
                    >
                      <ImageIcon className="w-4 h-4"/>
                      <span>Choose Avatar</span>
                    </button>

                    {needsFix&&(
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-60 w-full sm:w-auto"
                        onClick={()=>fixAvatarPath(c)}
                        disabled={rowBusy===c.child_uid}
                        title="Copy legacy file to children/<child_uid>.png and update DB"
                      >
                        <Save className="w-4 h-4"/>
                        <span>Fix Avatar Path</span>
                      </button>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg-white/20 w-full sm:w-auto"
                        onClick={()=>beginEdit(c)}
                        disabled={rowBusy===c.child_uid}
                      >
                        <Edit2 className="w-4 h-4"/>
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg-white/20 w-full sm:w-auto"
                        onClick={()=>openQrFor(c)}
                      >
                        <span>QR</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                        onClick={()=>deleteChild(c)}
                        disabled={rowBusy===c.child_uid}
                      >
                        <Trash2 className="w-4 h-4"/>
                        <span>Delete</span>
                      </button>
                    </div>
                  </>
                ):(
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 w-full sm:w-auto"
                      onClick={saveEdit}
                      disabled={rowBusy===c.child_uid}
                    >
                      <Save className="w-4 h-4"/>
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg-white/20 w-full sm:w-auto"
                      onClick={cancelEdit}
                      disabled={rowBusy===c.child_uid}
                    >
                      <XCircle className="w-4 h-4"/>
                      <span>Cancel</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {children.length===0&&<div className="text-white/70">No children created yet.</div>}
      </div>

      {/* Hidden input for changing existing avatars */}
      <input
        ref={changeFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e)=>onChangeLocalFile(e.target.files?.[0]||undefined)}
      />

      {/* Croppers */}
      {cropNewFile&&(
        <SquareCropper
          file={cropNewFile}
          onCancel={()=>setCropNewFile(null)}
          onConfirm={(blob)=>uploadCroppedForNew(blob)}
          size={512}
        />
      )}
      {cropForChild&&(
        <SquareCropper
          file={cropForChild.file}
          onCancel={()=>{
            setCropForChild(null);
            setChangingFor(null);
          }}
          onConfirm={(blob)=>uploadCroppedForChild(cropForChild.child_uid,blob)}
          size={512}
        />
      )}

      {/* Preset avatar gallery for children */}
      {presetForChild&&(
        <div className="fixed inset-0 z-[68] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <ImageIcon className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Choose a child avatar
                  </h2>
                  <p className="text-xs text-white/60">
                    These presets are shared across all families. You can still upload your own photos any time.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
                onClick={()=>{
                  setPresetForChild(null);
                  setChildPresetSelected(null);
                }}
              >
                <XCircle className="w-4 h-4"/>
                <span>Close</span>
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {childPresetLoading?(
                <div className="text-sm text-white/70">Loading avatars…</div>
              ):(
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-4">
                  {childPresetOptions.map((opt)=>(
                    <button
                      key={opt.path}
                      type="button"
                      className={`flex flex-col items-center gap-1 group ${
                        childPresetSelected===opt.path?"ring-2 ring-emerald-400 rounded-2xl p-1 -m-1":""
                      }`}
                      onClick={()=>setChildPresetSelected(opt.path)}
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
                  {childPresetOptions.length===0&&!childPresetLoading&&(
                    <div className="text-sm text-white/70 col-span-full">
                      No preset avatars found. Upload PNGs to
                      <span className="font-mono px-1">avatars/presets/children</span> then reload.
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
                  setPresetForChild(null);
                  setChildPresetSelected(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm disabled:opacity-60"
                disabled={!childPresetSelected}
                onClick={applyChildPresetAvatar}
              >
                Use selected avatar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrFor&&familyId&&(
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="font-semibold mb-2">Scan to prefill</div>
            <div className="text-xs text-white/70 mb-4">
              Child still enters their PIN/password after scanning this code.
            </div>
            {(()=>{
              if(!qrFor.nick_name?.trim()){
                return<div className="text-red-400 text-sm">Set a nickname to generate QR.</div>;
              }
              const url=`${window.location.origin}/child/login?fid=${familyId}&nick=${encodeURIComponent(
                qrFor.nick_name
              )}`;
              const img=`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
                url
              )}`;
              return(
                <>
                  <img src={img}alt="QR code"className="mx-auto rounded bg-white p-2"/>
                  <div className="mt-2 break-all text-xs opacity-80">{url}</div>
                </>
              );
            })()}
            <div className="mt-4">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-white/10 hover:bg.white/20 hover:bg-white/20"
                onClick={closeQr}
              >
                <XCircle className="w-4 h-4"/>
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide / instructions overlay */}
      {guideOpen&&(
        <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <Info className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Children profiles – guide, instructions &amp; process
                  </h2>
                  <p className="text-xs text-white/60">
                    How child accounts, avatars, PINs/passwords and QR codes work together.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
                onClick={()=>setGuideOpen(false)}
              >
                <XCircle className="w-4 h-4"/>
                <span>Close</span>
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-sm text-white/80">
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">1. One profile per child</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Create exactly one profile for each child in your family.</li>
                  <li>
                    First/last name are used for reports and parent views;{" "}
                    <span className="font-medium">nickname</span> is used on the child side
                    and in QR-prefilled links.
                  </li>
                  <li>
                    If you&apos;re testing, clearly label test children (for example,
                    “Test – Alex”) so you can delete them later.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. Age and date of birth</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    When you enter a <span className="font-medium">date of birth</span>,
                    the app can auto-compute age.
                  </li>
                  <li>
                    Use the <span className="font-medium">Age override</span> only when
                    needed (for example, when you don&apos;t know the exact birthday).
                  </li>
                  <li>Age is used for tuning games, targets and suggested difficulty.</li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. PIN vs password</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <span className="font-medium">PIN</span> is a 4–12 digit code that&apos;s
                    easy to type on a kiosk or tablet.
                  </li>
                  <li>
                    <span className="font-medium">Password</span> can include letters and is
                    better for older children or home devices.
                  </li>
                  <li>
                    Choose one mode per child; you can update it later if they graduate
                    from PIN to password.
                  </li>
                  <li>
                    Never reuse high-value passwords (email, banking, etc.) as child
                    passwords here.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. Avatars and recognition</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Avatars appear on the child dashboard, kiosks and QR login screens,
                    helping children spot their account quickly.
                  </li>
                  <li>
                    Use a clear face photo or a simple character your child recognizes
                    at a glance.
                  </li>
                  <li>
                    If you see a <span className="font-medium">legacy avatar path</span>{" "}
                    warning, use “Fix Avatar Path” once; it will update storage to the
                    new children/ pattern.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text.white">5. QR codes and logins</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    The <span className="font-medium">QR button</span> creates a code that
                    pre-fills family and nickname on the child login screen.
                  </li>
                  <li>
                    The QR code does <span className="font-medium">not</span> bypass
                    authentication – your child still enters their PIN or password.
                  </li>
                  <li>
                    Use printed QR cards for quick sign-in at home, school or shared
                    devices.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">6. Editing and deleting</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Use <span className="font-medium">Edit</span> when a name, nickname,
                    age or birthday needs to be corrected.
                  </li>
                  <li>
                    Use <span className="font-medium text-rose-300">Delete</span> for
                    test accounts or profiles no longer used; this can impact historical
                    views of rewards and activities.
                  </li>
                  <li>
                    If you&apos;re unsure, prefer editing over deleting so the history
                    stays intact.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">7. Family links and diagnostics</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    All children on this page are tied to your{" "}
                    <span className="font-medium">current family</span>.
                  </li>
                  <li>
                    If the page says “No family linked”, your parent profile needs to be
                    attached to a family before children can be created.
                  </li>
                  <li>
                    When troubleshooting with support or Supabase, you can reference the
                    family_id on rows from <code className="text-xs bg-black/40 px-1 rounded">
                      child_profiles
                    </code>.
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
