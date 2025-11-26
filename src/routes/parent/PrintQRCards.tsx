// src/routes/parent/PrintQRCards.tsx
"use client";
import {useEffect,useMemo,useState}from "react";
import {supabase}from "@/lib/supabase";
import {signAvatarPath}from "@/lib/storage";
import {Info}from "lucide-react";

type Child={
  id?:string; // canonical id (uuid)
  child_uid:string; // legacy (if present)
  first_name:string;
  last_name:string|null;
  nick_name:string|null;
  age:number|null;
  avatar_path:string|null;
  avatar_url?:string|null; // signed url for UI
};

const avatarFallback=
  `data:image/svg+xml;utf8,`+
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>
      <rect width='96' height='96' rx='12' fill='#e5e7eb'/>
      <circle cx='48' cy='38' r='18' fill='#9ca3af'/>
      <rect x='20' y='60' width='56' height='22' rx='11' fill='#9ca3af'/>
    </svg>`
  );

export default function PrintQRCards(){
  const [familyId,setFamilyId]=useState<string|null>(null);
  const [children,setChildren]=useState<Child[]>([]);
  const [loading,setLoading]=useState(true);

  // Controls
  const [qrSize,setQrSize]=useState(240);
  const [showSurname,setShowSurname]=useState(false);
  const [useNickInTitle,setUseNickInTitle]=useState(true);
  const [selectedChildId,setSelectedChildId]=useState<"all"|string>("all");

  // Guide modal
  const [guideOpen,setGuideOpen]=useState(false);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try{
        const{data:me,error}=await supabase.rpc("my_profile");
        if(error)throw error;

        const fam=
          (Array.isArray(me)?me?.[0]?.family_id:(me as any)?.family_id)??null;
        setFamilyId(fam);
        if(!fam)return;

        const{data}=await supabase
          .from("child_profiles")
          .select("id,child_uid,first_name,last_name,nick_name,age,avatar_path")
          .eq("family_id",fam)
          .order("created_at",{ascending:true});

        const rows=(data||[])as Child[];

        const withSigned=await Promise.all(
          rows.map(async(c)=>{
            if(!c.avatar_path)return{...c,avatar_url:null};
            try{
              const url=await signAvatarPath(c.avatar_path,60*60*24*7);
              return{...c,avatar_url:url};
            }catch{
              return{...c,avatar_url:null};
            }
          })
        );

        setChildren(withSigned);
      }catch(e){
        console.error(e);
      }finally{
        setLoading(false);
      }
    })();
  },[]);

  const origin=useMemo(
    ()=>(typeof window!=="undefined"?window.location.origin:""),
    []
  );

  // Prefer nickname; fall back to child id if no nickname
  function makeDeepLink(c:Child){
    if(c.nick_name?.trim()){
      return`${origin}/child/login?fid=${familyId??""}&nick=${encodeURIComponent(
        c.nick_name
      )}`;
    }
    const cid=c.id??"";
    return`${origin}/child/login?fid=${familyId??""}&child=${cid}`;
  }

  function makeQrUrl(c:Child){
    const data=makeDeepLink(c);
    return`https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(
      data
    )}`;
  }

  function printNow(){
    window.print();
  }

  if(loading)return<div className="p-6 glass rounded-2xl">Loading…</div>;
  if(!familyId)
    return(
      <div className="p-6 glass rounded-2xl">
        No family found on your profile. Create a family first.
      </div>
    );

  return(
    <div className="p-6">
      {/* Controls (hidden on print) */}
      <div className="glass rounded-2xl p-4 mb-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-base sm:text-lg">Print QR Cards</div>
            <button
              type="button"
              onClick={()=>setGuideOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs sm:text-sm border border-white/15"
            >
              <Info className="w-4 h-4"/>
              <span>Guide, instructions &amp; process</span>
            </button>
          </div>

          <div className="sm:ml-auto grid grid-cols-1 sm:auto-cols-max sm:grid-flow-col gap-3 min-w-0">
            <label className="inline-flex items-center gap-2 text-sm sm:text-base break-words">
              <input
                type="checkbox"
                checked={showSurname}
                onChange={(e)=>setShowSurname(e.target.checked)}
              />
              Show last name
            </label>

            <label className="inline-flex items-center gap-2 text-sm sm:text-base break-words">
              <input
                type="checkbox"
                checked={useNickInTitle}
                onChange={(e)=>setUseNickInTitle(e.target.checked)}
              />
              Use nickname in title
            </label>

            <label className="inline-flex items-center gap-2 text-sm sm:text-base break-words">
              Child to print:
              <select
                className="control-select rounded-md bg-slate-800 text-white border border-white/20 px-2 py-1 text-sm sm:text-base"
                value={selectedChildId}
                onChange={(e)=>setSelectedChildId(e.target.value as "all"|string)}
              >
                <option value="all">All children</option>
                {children.map((c)=>{
                  const key=c.id??c.child_uid;
                  const name=c.nick_name?.trim()
                    ?c.nick_name
                    :`${c.first_name}${c.last_name?" "+c.last_name:""}`;
                  return(
                    <option key={key}value={key}>
                      {name||"Unnamed child"}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-sm sm:text-base break-words">
              QR size:
              <select
                className="control-select rounded-md bg-slate-800 text-white border border-white/20 px-2 py-1 text-sm sm:text-base"
                value={qrSize}
                onChange={(e)=>setQrSize(parseInt(e.target.value))}
              >
                <option value={180}>180px</option>
                <option value={240}>240px</option>
                <option value={300}>300px</option>
              </select>
            </label>

            <button
              className="px-3 py-2 rounded bg-[var(--brand-emerald)] hover:brightness-110 w-full sm:w-auto"
              onClick={printNow}
            >
              Print
            </button>
          </div>
        </div>

        <p className="mt-2 text-sm sm:text-base text-white/70 break-words">
          These cards prefill the child on the Kiosk/Login screen; kids still enter their
          PIN or password.
        </p>

        {/* Parent instructions on how to use the QR cards */}
        <div className="mt-3 text-xs sm:text-sm text-white/70 break-words space-y-1 print:hidden">
          <p className="font-medium">How to use these QR cards:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Choose <span className="font-semibold">“All children”</span> or a specific
              child in the <span className="font-semibold">“Child to print”</span> menu.
              When you select a single child, only that card will be included when you
              print.
            </li>
            <li>
              Pick a <span className="font-semibold">QR size</span> that matches your
              paper or label layout (smaller for sticker labels, larger for full cards).
            </li>
            <li>
              Click <span className="font-semibold">Print</span>. The QR card(s) are laid
              out for you to cut, laminate, or stick on a notebook, bedroom door, or
              backpack.
            </li>
            <li>
              When your child scans their QR code (with the family device or a kiosk
              camera), it opens the child login screen with their account pre-selected.
              They still need to enter their PIN or password to sign in.
            </li>
            <li>
              For a cleaner link, add a{" "}
              <span className="font-semibold">Nickname</span> on the child profile; it’s
              used in the QR link and on the card title if you enable “Use nickname in
              title.”
            </li>
          </ul>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 print:grid print:grid-cols-3 print:gap-2">
        {children.map((c)=>{
          const cardKey=c.id??c.child_uid;
          const isSelected=
            selectedChildId==="all"||selectedChildId===cardKey;

          const title=
            useNickInTitle&&c.nick_name
              ?`${c.nick_name}`
              :`${c.first_name}${
                  showSurname&&c.last_name?" "+c.last_name:""
                }`;

          const subtitle=
            !useNickInTitle&&c.nick_name
              ?`(${c.nick_name})`
              :c.age!=null
              ?`Age ${c.age}`
              :"";

          const noNick=!c.nick_name?.trim();

          return(
            <div
              key={cardKey}
              className={`glass rounded-2xl p-4 flex flex-col items-center gap-3 print:bg-white print:text-black print:border print:border-gray-300 min-w-0 ${
                !isSelected&&selectedChildId!=="all"?"print:hidden":""
              }`}
              style={{breakInside:"avoid",pageBreakInside:"avoid"}}
            >
              <img
                src={c.avatar_url||avatarFallback}
                alt={c.first_name}
                className="w-16 h-16 rounded-full object-cover ring-2 ring-white/20 print:ring-0"
              />

              <div className="text-center min-w-0">
                <div className="text-lg font-semibold break-words">{title}</div>
                {!!subtitle&&(
                  <div className="text-sm opacity-70 break-words">{subtitle}</div>
                )}
                {noNick&&(
                  <div className="mt-1 text-[11px] text-amber-300 print:hidden break-words">
                    Tip: add a Nickname for a nicer QR link.
                  </div>
                )}
              </div>

              <img
                src={makeQrUrl(c)}
                alt="QR"
                className="rounded bg-white p-2"
                style={{width:qrSize,height:qrSize}}
              />

              <div className="text-[10px] opacity-70 text-center break-all print:text-black">
                {makeDeepLink(c)}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        /* Unified dark select control styling + readable dropdown text */
        .control-select {
          background-color: #020617; /* slate-950 / deep navy */
          color: #f9fafb;            /* near white */
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 0.375rem;
          padding-inline: 0.5rem;
          padding-block: 0.25rem;
          font-size: 0.875rem;
        }
        .control-select:hover {
          background-color: #0f172a; /* slate-900 */
        }
        .control-select:focus {
          outline: 2px solid rgba(45,212,191,0.9); /* emerald-ish */
          outline-offset: 1px;
        }
        .control-select::-ms-expand {
          background-color: transparent;
          color: inherit;
        }
        /* Option styling where supported: light menu, dark text */
        .control-select option {
          background-color: #ffffff;
          color: #0f172a;
        }

        @media (prefers-reduced-motion: reduce) {
          .control-select:focus {
            scroll-behavior: auto;
          }
        }

        @media print {
          @page { margin: 10mm; }
          .glass { box-shadow: none !important; background: white !important; }
          button, .print\\:hidden { display: none !important; }
        }
      `}</style>

      {/* Guide / instructions overlay */}
      {guideOpen&&(
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                  <Info className="w-5 h-5 text-emerald-300"/>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    QR cards – guide, instructions &amp; process
                  </h2>
                  <p className="text-xs text-white/60">
                    How cards connect to child profiles, logins and kiosk usage.
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
                <h3 className="text-sm font-semibold text-white">1. What these QR cards do</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Each card is tied to a <span className="font-medium">child profile</span> in your family.
                  </li>
                  <li>
                    Scanning the QR opens the <span className="font-medium">Child Login / Kiosk</span> screen with that child pre-selected.
                  </li>
                  <li>
                    The QR <span className="font-medium">does not log them in automatically</span> – your child still enters their PIN or password.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">2. Choosing which cards to print</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Use <span className="font-medium">“Child to print”</span>:
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>
                        <span className="font-medium">All children</span> – prints one card per child in your family.
                      </li>
                      <li>
                        Selecting a single child – prints only that child&apos;s card.
                      </li>
                    </ul>
                  </li>
                  <li>
                    If you add or rename children, revisit this page to refresh the card list before printing again.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">3. Names, nicknames and privacy</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <span className="font-medium">Use nickname in title</span> shows the child&apos;s nickname as the big label on the card.
                  </li>
                  <li>
                    Turning off this option uses their first name (and last name if you enable “Show last name”).
                  </li>
                  <li>
                    Nicknames are helpful when:
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>You want kid-friendly names (e.g. “Super Sam”).</li>
                      <li>You prefer not to display full legal names on printed cards.</li>
                    </ul>
                  </li>
                  <li>
                    If a child has no nickname, the card title falls back to their first/last name and a tip suggests adding a nickname.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">4. QR size and printing layout</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Choose <span className="font-medium">QR size</span> based on how you plan to use the cards:
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>
                        <span className="font-medium">180px</span> – best for small sticker labels or multi-card sheets.
                      </li>
                      <li>
                        <span className="font-medium">240px</span> – balanced size for standard A4/Letter cards.
                      </li>
                      <li>
                        <span className="font-medium">300px</span> – large, easy-to-scan codes for posters or laminated cards.
                      </li>
                    </ul>
                  </li>
                  <li>
                    Use your browser&apos;s print preview to confirm how many cards fit per page before printing multiple copies.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">5. Where to place the cards</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Stick or pin cards near shared devices (tablet station, kiosk, family computer).</li>
                  <li>Place cards on notebooks, folders, or bedroom doors so children can always find their code.</li>
                  <li>
                    For younger children, keep cards within adult reach so you can help them scan the right one.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">6. Security and safe use</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    QR cards intentionally <span className="font-medium">do not contain</span> the child&apos;s PIN or password.
                  </li>
                  <li>
                    If a card is lost or heavily shared, you can still rotate the child&apos;s PIN/password from the children/profile areas.
                  </li>
                  <li>
                    If you no longer want a child to use their card, change their secret and destroy or reprint the QR with a new nickname.
                  </li>
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-white">7. Troubleshooting</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    If a QR opens the site but doesn&apos;t pre-select the right child, check that the child&apos;s{" "}
                    <span className="font-medium">nickname matches</span> what&apos;s encoded (or switch to child-id deep links by removing the nickname).
                  </li>
                  <li>
                    Make sure the device has a stable internet connection; the QR just encodes a URL, the login still happens online.
                  </li>
                  <li>
                    If cards look cut off, reduce QR size or print scale and try again.
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
