"use client";
import {useEffect,useState}from "react";
import {supabase}from "@/lib/supabase";
import {toast}from "sonner";
import {adminListChildren,adminSetChildSecret}from "@/utils/childAuth";
import FamilyCode from "@/components/FamilyCode";
import {Info}from "lucide-react";

type AdminKid={
  id:string;                // canonical child id (matches child_profiles.id)
  child_uid?:string|null;   // legacy uid if present
  first_name:string;
  nick_name?:string|null;
  age:number|null;
  has_secret:boolean;
};

export default function ChildPasswordsPage(){
  const [familyId,setFamilyId]=useState<string|null>(null);
  const [children,setChildren]=useState<AdminKid[]>([]);
  const [loading,setLoading]=useState(true);

  const [mode,setMode]=useState<Record<string,"pin"|"password">>({});
  const [value,setValue]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<Record<string,boolean>>({});

  // Guide modal
  const [guideOpen,setGuideOpen]=useState(false);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        const {data:me,error}=await supabase.rpc("my_profile");
        if(error)throw error;

        const fid=
          (Array.isArray(me)?me?.[0]?.family_id:(me as any)?.family_id)??null;
        setFamilyId(fid);

        if(fid){
          const kids=await adminListChildren(fid);
          setChildren(kids as any);

          const m:Record<string,"pin"|"password">={};
          const v:Record<string,string>={};
          (kids as AdminKid[]).forEach((k)=>{
            m[k.id]="pin";
            v[k.id]="";
          });
          setMode(m);
          setValue(v);
        }
      }catch(e:any){
        console.error(e);
        toast.error(e?.message||"Could not load children.");
      }finally{
        setLoading(false);
      }
    })();
  },[]);

  async function save(id:string){
    if(!familyId){
      toast.error("No family found.");
      return;
    }

    const clear=value[id]||"";
    const currentMode=mode[id];
    const kid=children.find((k)=>k.id===id);

    if(clear.trim()){
      if(currentMode==="pin"){
        if(!/^\d{4,12}$/.test(clear)){
          toast.error("PIN must be 4–12 digits only.");
          return;
        }
      }else{
        if(clear.length<4){
          toast.error("Password should be at least 4 characters.");
          return;
        }
        if(clear.length>50){
          toast.error("Password is too long (max 50 characters).");
          return;
        }
      }
    }

    setBusy((b)=>({...b,[id]:true}));

    try{
      const ok=await adminSetChildSecret({
        child_id:id,
        child_uid:kid?.child_uid||undefined,
        fid:familyId,
        clear,
        pinMode:currentMode==="pin",
      });

      if(!ok)throw new Error("No update performed.");

      toast.success(
        clear
          ?`${currentMode==="pin"?"PIN":"Password"} saved successfully!`
          :"Secret cleared."
      );

      setChildren((arr)=>
        arr.map((k)=>
          k.id===id?{...k,has_secret:!!clear}:k
        )
      );
      setValue((v)=>({...v,[id]:""}));
    }catch(e:any){
      console.error(e);
      toast.error(e?.message||"Could not save password/PIN.");
    }finally{
      setBusy((b)=>({...b,[id]:false}));
    }
  }

  if(loading)return<div className="glass rounded-2xl p-4">Loading…</div>;
  if(!familyId)return<div className="glass rounded-2xl p-4">No family set for this parent.</div>;

  return(
    <div className="space-y-4">
      {/* Family Code card */}
      <FamilyCode className="mb-2"/>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Set Child Passwords</h1>
        <button
          type="button"
          onClick={()=>setGuideOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs sm:text-sm border border-white/15"
        >
          <Info className="w-4 h-4"/>
          <span>Guide, instructions &amp; process</span>
        </button>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="text-sm text-white/80">
          Choose <b>PIN</b> (digits only) or <b>Password</b>. Leaving the field empty and clicking
          Save will <b>clear</b> the secret.
        </p>
        <p className="text-xs text-white/60 mt-2">
          <b>PIN:</b> 4–12 digits only | <b>Password:</b> At least 4 characters, up to 50.
        </p>
        <p className="text-xs text-white/60 mt-2">
          These secrets are used together with your child&apos;s profile and QR cards. QR codes
          (from the QR button or the Print QR Cards page) prefill the child on the login screen,
          but your child still needs this PIN or password to sign in.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {children.map((c)=>(
          <div
            key={c.id}
            className="glass rounded-2xl p-4 relative overflow-visible flex flex-col gap-3"
          >
            <div>
              <div className="mb-1 text-lg font-medium">
                {c.first_name}
                {c.nick_name?(
                  <span className="text-white/60 text-base"> ({c.nick_name})</span>
                ):null}{" "}
                {typeof c.age==="number"?(
                  <span className="text-white/60 text-base">· Age {c.age}</span>
                ):null}
              </div>

              <div className="text-xs text-white/60">
                {c.has_secret?"Secret is set":"No secret set yet"}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-1">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`mode-${c.id}`}
                  checked={mode[c.id]==="pin"}
                  onChange={()=>setMode((m)=>({...m,[c.id]:"pin"}))}
                />
                PIN
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`mode-${c.id}`}
                  checked={mode[c.id]==="password"}
                  onChange={()=>setMode((m)=>({...m,[c.id]:"password"}))}
                />
                Password
              </label>
            </div>

            <input
              aria-label={mode[c.id]==="pin"?"PIN (4–12 digits)":"Password"}
              className="w-full rounded-xl px-3 py-2 text-black"
              placeholder={mode[c.id]==="pin"?"PIN (4–12 digits)":"Password"}
              value={value[c.id]||""}
              onChange={(e)=>
                setValue((v)=>({
                  ...v,
                  [c.id]:
                    mode[c.id]==="pin"
                      ?e.target.value.replace(/\D+/g,"").slice(0,12)
                      :e.target.value.slice(0,50),
                }))
              }
              type={mode[c.id]==="pin"?"tel":"password"}
            />

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="px-3 py-2 rounded-xl bg-[var(--brand-emerald)] hover:brightness-110 disabled:opacity-60"
                onClick={()=>save(c.id)}
                disabled={!!busy[c.id]}
              >
                {busy[c.id]?"Saving…":"Save"}
              </button>
              <button
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
                onClick={()=>setValue((v)=>({...v,[c.id]:""}))}
              >
                Clear field
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Guide / instructions overlay */}
      {guideOpen&&(
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <Info className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Child secrets – guide, instructions &amp; process
                  </h2>
                  <p className="text-xs text-white/60">
                    How PINs and passwords work with child profiles, QR cards and logins.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={()=>setGuideOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1"
              >
                <span>Close</span>
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-sm text-white/80">
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">1. What these secrets do</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Each child can have a <span className="font-medium">PIN or password</span> linked to their profile.
                  </li>
                  <li>
                    The secret is required on the <span className="font-medium">Child Login / Kiosk</span> screen after selecting or scanning the child.
                  </li>
                  <li>
                    QR cards and deep links <span className="font-medium">never contain the actual secret</span>; they only identify the child.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. Choosing between PIN and password</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <span className="font-medium">PIN</span> is best for younger children or shared kiosks:
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>4–12 digits only.</li>
                      <li>Easy to enter on touchscreens and keypads.</li>
                    </ul>
                  </li>
                  <li>
                    <span className="font-medium">Password</span> is better for older children:
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>At least 4 characters, up to 50.</li>
                      <li>Can include letters, numbers and symbols.</li>
                    </ul>
                  </li>
                  <li>
                    You can switch a child from PIN to password (or back) at any time – just choose the mode and Save.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. Setting, changing and clearing a secret</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Pick the mode (<span className="font-medium">PIN</span> or <span className="font-medium">Password</span>) for each child.
                  </li>
                  <li>
                    Type a new value in the field:
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>For PIN: digits only; the UI trims any non-numeric input.</li>
                      <li>For Password: any characters allowed; long values are trimmed to 50 chars.</li>
                    </ul>
                  </li>
                  <li>
                    Click <span className="font-medium">Save</span> to apply it. The status under the name will show whether a secret is set.
                  </li>
                  <li>
                    To completely remove a secret, <span className="font-medium">leave the field empty</span> and click Save. The child will then have no PIN/password until you set one again.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. How this ties into QR cards and logins</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    QR cards (from the Children page or Print QR Cards) only carry a link that identifies the child and family.
                  </li>
                  <li>
                    After scanning, the device opens the login screen with that child pre-selected – then the child enters their PIN/password.
                  </li>
                  <li>
                    Changing the secret here <span className="font-medium">does not require reprinting</span> QR cards; the same QR works with the new secret.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">5. Safety and best practices</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Avoid using important family passwords as child secrets – keep them unique to this system.
                  </li>
                  <li>
                    For PINs, use patterns your child can remember but siblings/friends won&apos;t guess easily.
                  </li>
                  <li>
                    If a child routinely forgets their secret, you can set something simpler and update it gradually as they gain confidence.
                  </li>
                  <li>
                    When a child leaves the program or should no longer log in, either clear their secret or delete their profile from the Children page.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">6. Troubleshooting</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    If a child says their PIN/password isn&apos;t working, verify:
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>You&apos;re on the correct child row.</li>
                      <li>The right mode (PIN vs Password) is selected before saving.</li>
                      <li>The device keyboard isn&apos;t adding extra spaces or auto-correct.</li>
                    </ul>
                  </li>
                  <li>
                    If secrets seem to &quot;not stick&quot;, check for any error messages when saving, or reload the page to refresh data from the server.
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
