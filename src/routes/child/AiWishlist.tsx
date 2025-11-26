// src/routes/child/AiWishlist.tsx
import type React from "react";
import {useEffect,useMemo,useRef,useState}from "react";
import {useNavigate}from "react-router-dom";
import {supabase}from "@/lib/supabase";
import {tpromise}from "@/utils/toastx";
import {
  Sparkles,ArrowLeft,Image as ImageIcon,Bell,Check,Wallet,
  GalleryHorizontalEnd,Save,X,Copy,ExternalLink,Upload,Download
}from "lucide-react";
import {createOrGetWishlistId}from "@/data/wishlist-write";
import {uploadDataUrlToBucket,getSignedUrl,importImages}from "@/lib/storageImages";

/* ------------------------------- Types ------------------------------------ */
type ChildProfile={id:string;child_uid:string;family_id:string;first_name:string;last_name:string|null;nick_name:string|null;age:number|null};
type AiCategory="Fun"|"Learning"|"Outdoor"|"Creative"|"Tech";
type AiSuggestion={id:string;category:AiCategory;title:string;desc:string;points:number;img?:string|null;dbId?:string|null};
type AiImageRespImage={dataUrl?:string;url?:string;signedUrl?:string;publicUrl?:string;path?:string};
type AiImageResp={images:AiImageRespImage[];provider?:string;usedFallback?:boolean;estCostUsd?:number;error?:string;fromCache?:boolean};
type GenMode="sticker"|"card";

/* ----------------------------- Config ------------------------------------- */
const PUBLIC_SEED_URL="/ai/AiWishlist.txt";

// ✅ Edge function / OpenAI support: "auto", "1024x1024", "1024x1536", "1536x1024"
// We send only "auto" from the frontend; the edge fn forwards that to OpenAI.
const STICKER_SIZE="auto";
const CARD_SIZE="auto";

const NO_FALLBACK=true;
const BASE_OCCASIONS=["Birthday","Christmas","Halloween","Diwali","Eid","New Year","Back to School","Just Because","Other"]as const;
const STICKERS_BUCKET="ai-images";
const sizeForMode=(m:GenMode)=>m==="sticker"?STICKER_SIZE:CARD_SIZE;

// ⚖️ soft monthly limits (frontend guard; enforce stronger limits server-side if needed)
const MAX_GEN_PER_MONTH=10;          // paid AI images / month / child
const MAX_GALLERY_USE_PER_MONTH=20;  // gallery "Use" clicks / month / child

// Greeting text length limit so it fits visually
const MAX_WISH_CHARS=80;

/* Occasion flavor pack */
const OCCASION_FLAVOR:Record<string,{emoji:string;style:string;cardFrame?:string}>={
  birthday:{emoji:"🎂",style:"birthday confetti, balloons, rainbow sprinkles, pastel confetti background",cardFrame:"glossy birthday card, confetti border, rounded corners"},
  christmas:{emoji:"🎄",style:"cozy christmas, twinkle lights, candy canes, pine garland",cardFrame:"holiday card, gold foil trim, pine border"},
  halloween:{emoji:"🎃",style:"friendly halloween, cute ghosts, smiling pumpkins, purple night sky",cardFrame:"spooky-cute card, starry border"},
  diwali:{emoji:"🪔",style:"diwali diyas, rangoli patterns, warm bokeh lights, marigold garlands",cardFrame:"festive card, rangoli corner motifs"},
  eid:{emoji:"🌙",style:"eid crescent moon, lanterns, stars, emerald accents",cardFrame:"elegant card, crescent corner filigree"},
  "new year":{emoji:"🎊",style:"new year fireworks, sparkles, glitter confetti",cardFrame:"celebration card, foil border, sparkle overlay"},
  "back to school":{emoji:"🎒",style:"back to school doodles, pencils, notebooks, chalkboard vibe",cardFrame:"lined-paper frame with stickers"},
  "just because":{emoji:"💌",style:"warm friendly vibes, pastel gradient, sparkles",cardFrame:"cheerful greeting card, heart stickers"},
  other:{emoji:"✨",style:"fun cheerful, soft gradients, sparkles",cardFrame:"clean card, subtle gradient frame"}
};

/* ----------------------------- RNG helpers -------------------------------- */
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const hash=(s:string)=>{let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
const rngOf=(seed:number)=>{let t=seed>>>0;return()=>{t+=0x6D2B79F5;let r=Math.imul(t^(t>>>15),1|(t));r^=r+Math.imul(r^(r>>>7),61|(r));return((r^(r>>>14))>>>0)/4294967296;}};
const pick=<T,>(r:()=>number,arr:T[])=>arr[Math.floor(r()*arr.length)];
const normAge=(age:number|null|undefined)=>{const n=Number(age);return Number.isFinite(n)?clamp(Math.round(n),4,17):10;};
const scalePoints=(r:()=>number,level:"low"|"med"|"high"|"ultra")=>{
  const j=(b:number,s:number)=>Math.round(b+s*(r()*2-1));
  if(level==="low")return clamp(j(120,70),50,180);
  if(level==="med")return clamp(j(250,120),160,360);
  if(level==="high")return clamp(j(460,160),360,620);
  return clamp(j(700,120),610,800);
};
const bankByAge=(age:number)=>{
  if(age<=6)return{levels:["low","low","med"],pools:{
    Fun:[["Cuddle plush","Soft buddy for bedtime"],["Sticker book","Peel and play scenes"],["Marble run jr","Build simple tracks"]],
    Learning:[["Picture book set","Read with family"],["ABC puzzle","Letter matching"],["Counting cubes","Colorful math blocks"]],
    Outdoor:[["Bubble kit","Big shimmering bubbles"],["Chalk set","Driveway art"],["T-ball set","Tiny batting fun"]],
    Creative:[["Finger paints","Mess-free sheets"],["Bead kit","Make bracelets"],["Foam craft","Cut, stick, smile"]],
    Tech:[["Kids headphones","Volume-limited"],["Story reader","Bedtime tales"],["Night light","Cozy room glow"]]
  }};
  if(age<=9)return{levels:["low","med","med","high"],pools:{
    Fun:[["Board game","Family play night"],["LEGO small set","Build & imagine"],["Yo-yo pro","Learn cool tricks"]],
    Learning:[["Chapter books","New adventures"],["Science kit","Fizz safely"],["Globe puzzle","World explorer"]],
    Outdoor:[["Scooter bell","Ring & roll"],["Jump rope","Rhythm practice"],["Frisbee duo","Catch & run"]],
    Creative:[["Sketch set","Pencils & pad"],["Origami pack","Fold animals"],["Watercolor kit","Blend hues"]],
    Tech:[["Kids smartwatch","Steps & timer"],["Coding cards","Logic puzzles"],["Clip mic","Sing & narrate"]]
  }};
  if(age<=12)return{levels:["med","med","high"],pools:{
    Fun:[["Strategy board","Think & win"],["LEGO medium","Detailed builds"],["Puzzle 1000","Focus time"]],
    Learning:[["Science lab","Grow crystals"],["Math game","Speed practice"],["History comic","Past made fun"]],
    Outdoor:[["Soccer ball","Practice shots"],["Bike light","Be safe"],["Skate pads","Roll safe"]],
    Creative:[["Acrylic set","Bold colors"],["Clay kit","Model & bake"],["Brush pens","Lettering start"]],
    Tech:[["BT headphones","Study & music"],["Mini drone","Easy flyer"],["STEM robot","Code & drive"]]
  }};
  if(age<=15)return{levels:["med","high","high","ultra"],pools:{
    Fun:[["Co-op board","Team strategy"],["Model kit","Paint & display"],["Card game set","Quick battles"]],
    Learning:[["Typing course","Speed & accuracy"],["Lang app voucher","Daily streaks"],["Math olympiad set","Challenge pack"]],
    Outdoor:[["Badminton set","Backyard rallies"],["Basketball","Court practice"],["Bike repair kit","Tune & ride"]],
    Creative:[["Alcohol markers","Blend & shade"],["Digital sketch pad","Draw & share"],["Ukulele starter","Chord fun"]],
    Tech:[["Mechanical KB","Tactile keys"],["USB mic","Crisp voice"],["Raspberry Pi kit","Hack & learn"]]
  }};
  return{levels:["high","high","ultra"],pools:{
    Fun:[["Escape room pass","Team up IRL"],["Premium puzzle","Display frame"],["D&D starter","Story nights"]],
    Learning:[["Cert course","Career skills"],["E-ink reader","Focus reading"],["3D printing time","Prototype ideas"]],
    Outdoor:[["Fitness tracker","Healthy habits"],["Cycling lights","Night rides"],["Hiking pack","Trail ready"]],
    Creative:[["Entry DSLR lesson","Shoot basics"],["Audio interface","Record music"],["Advanced brush set","Pro results"]],
    Tech:[["Noise-cancel cans","Study focus"],["Quality mouse","Precision aim"],["SSD upgrade","Speed boost"]]
  }};
};
const makeAiList=(childName:string,age:number,seedRaw:string,uid:string)=>{
  const h=hash(`${uid}|${childName}|${age}|${(seedRaw||"").slice(0,64)}`);
  const r=rngOf(h);const plan=bankByAge(age);
  const cats:(keyof ReturnType<typeof bankByAge>["pools"])[]=["Fun","Learning","Outdoor","Creative","Tech"];
  const out:AiSuggestion[]=[];
  for(const cat of cats){
    const pool=plan.pools[cat]as[string,string][];
    const count=clamp(3+Math.floor(r()*2),3,4);
    for(let i=0;i<count;i++){
      const[t,d]=pool[Math.floor(r()*pool.length)];
      const lvl=pick(r,plan.levels as any)as"low"|"med"|"high"|"ultra";
      const pts=scalePoints(r,lvl);
      out.push({id:`${cat}-${i}-${hash(t+d+pts)}`,category:cat as AiCategory,title:t,desc:d,points:pts,img:null,dbId:null});
    }
  }
  return out;
};

/* ------------------------------ Audio helpers ----------------------------- */
function createAudioWithFallback(srcs:string[]){const el=new Audio();let idx=0;const trySet=()=>{if(idx<srcs.length){el.src=srcs[idx++];el.onerror=()=>trySet();}};trySet();return el;}

/* ------------------------------ Image Load Helper ------------------------- */
async function testImageLoad(url:string):Promise<boolean>{
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>resolve(true);
    img.onerror=()=>{console.warn("Image failed to load:",url.substring(0,100));resolve(false);};
    img.src=url;
  });
}

/* ---------------------- Storage recursive listing ------------------------ */
// NOTE: Now reads from the shared `child/` root so *all* child-saved images
// are visible in the Gallery for any logged-in child.
const IMAGE_EXT_RE=/\.(png|jpg|jpeg|webp|gif)$/i;

async function listChildImagePaths(_childUid:string){
  const out:string[]=[];
  const bucket="ai-images";

  async function walk(prefix:string){
    const{data,error}=await supabase.storage.from(bucket).list(prefix,{limit:100,offset:0,sortBy:{column:"name",order:"desc"}});
    if(error){console.warn("storage list error",prefix,error);return;}
    for(const item of data||[]){
      const full=prefix?`${prefix}/${item.name}`:item.name;
      if(IMAGE_EXT_RE.test(item.name)){out.push(full);}
      else{await walk(full);}
    }
  }

  // Previously: `child/${childUid}` (per-child)
  // Now: global gallery under `child/` so all saved images can be browsed
  await walk("child");
  return out;
}

/* -------------------------- Prompt builder -------------------------------- */
/* Note: final prompt is built in buildPromptForSuggestion below; this stub is kept only
   so earlier imports/usages won't break if referenced elsewhere. */
function buildPrompt(_s:AiSuggestion,_mode:GenMode,_wishText?:string){
  return"";
}

/* ------------------------------ Component ---------------------------------- */
export default function AiWishlist(){
  const nav=useNavigate();
  const[profile,setProfile]=useState<ChildProfile|null>(null);
  const[list,setList]=useState<AiSuggestion[]>([]);
  const[busyId,setBusyId]=useState<string|null>(null);
  const[bulkBusy,setBulkBusy]=useState(false);
  const[err,setErr]=useState<string|null>(null);
  const[inspireBusy,setInspireBusy]=useState(false);

  const[variantCache,setVariantCache]=useState<Record<string,string[]>>({});
  const[pickerOpen,setPickerOpen]=useState(false);
  const[pickerTarget,setPickerTarget]=useState<string|null>(null);
  const[pickerImages,setPickerImages]=useState<string[]>([]);

  const[costById,setCostById]=useState<Record<string,number>>({});
  const[sessionCost,setSessionCost]=useState(0);

  // Monthly usage tracking
  const[genUsed,setGenUsed]=useState(0);
  const[galleryUsed,setGalleryUsed]=useState(0);

  // Greeting text overlay
  const[wishText,setWishText]=useState("");

  const[customOccasions,setCustomOccasions]=useState<string[]>(()=>{
    try{
      const raw=localStorage.getItem("child_ai_custom_occasions");
      return raw?JSON.parse(raw):[];
    }catch{
      return[];
    }
  });
  const allOccasions=useMemo(()=>[...customOccasions,...BASE_OCCASIONS],[customOccasions]);
  const[occasionSel,setOccasionSel]=useState<string>(allOccasions[0]||"Birthday");
  const[occasionCustom,setOccasionCustom]=useState<string>("");

  const[genMode,setGenMode]=useState<GenMode>("sticker");

  const dingRef=useRef<HTMLAudioElement|null>(null);
  const cheerRef=useRef<HTMLAudioElement|null>(null);
  const audioOkRef=useRef(false);
  const channelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);

  const uploadInputRef=useRef<HTMLInputElement|null>(null);
  const uploadTargetIdRef=useRef<string|null>(null);

  const[galleryOpen,setGalleryOpen]=useState(false);
  const[galleryGroups,setGalleryGroups]=useState<Record<string,{path:string;url:string;isMine:boolean}[]>>({});
  const[galleryLoading,setGalleryLoading]=useState(false);
  const[galleryTargetId,setGalleryTargetId]=useState<string|null>(null);
  const[galleryFilter,setGalleryFilter]=useState<"all"|"mine">("all");

  const styles=`
  @keyframes spinx{to{transform:rotate(360deg)}}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  @keyframes dots{0%,20%{content:"."}40%{content:".."}60%{content:"..."}80%,100%{content:"...."}}
  .ai-shimmer{background:linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.18),rgba(255,255,255,0.05));background-size:200% 100%;animation:shimmer 1.2s linear infinite;}
  .ai-spin{animation:spinx 1s linear infinite;}
  .ai-dots::after{content:"";display:inline-block;min-width:1ch;animation:dots 1.6s steps(4,end) infinite}
  `;

  // derived remaining counts
  const genRemaining=Math.max(0,MAX_GEN_PER_MONTH-genUsed);
  const galleryRemaining=Math.max(0,MAX_GALLERY_USE_PER_MONTH-galleryUsed);

  useEffect(()=>{
    const unlock=()=>{
      try{if(!dingRef.current)dingRef.current=createAudioWithFallback(["/sounds/ding.wav","/sounds/ding.mp3"]);}catch{}
      try{if(!cheerRef.current)cheerRef.current=createAudioWithFallback(["/sounds/celebrate.wav","/sounds/celebrate.mp3"]);}catch{}
      audioOkRef.current=true;
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
    window.addEventListener("pointerdown",unlock,{once:true});
    window.addEventListener("keydown",unlock,{once:true});
    return()=>{
      window.removeEventListener("pointerdown",unlock);
      window.removeEventListener("keydown",unlock);
    };
  },[]);
  const playDing=()=>{try{if(audioOkRef.current&&dingRef.current){dingRef.current.currentTime=0;void dingRef.current.play();}}catch{}};
  const playCheer=()=>{try{if(audioOkRef.current&&cheerRef.current){cheerRef.current.currentTime=0;void cheerRef.current.play();}}catch{}};

  // bootstrap profile + initial AI list
  useEffect(()=>{
    (async()=>{
      try{
        setErr(null);
        let key="";
        try{key=sessionStorage.getItem("child_uid")||"";}catch{}
        if(!key){try{key=localStorage.getItem("child_portal_child_id")||"";}catch{}}
        if(!key){nav("/child/login");return;}

        const{data,error}=await supabase.rpc("child_portal_get_profile",{_key:key});
        if(error)throw error;
        const row=(Array.isArray(data)?data[0]:data)as any;
        if(!row){setErr("Child profile not found.");return;}

        const p:ChildProfile={id:row.id,child_uid:row.child_uid,family_id:row.family_id,first_name:row.first_name,last_name:row.last_name,nick_name:row.nick_name,age:row.age};
        setProfile(p);

        let seedText="";
        try{
          const res=await fetch(PUBLIC_SEED_URL,{cache:"no-store"});
          seedText=res.ok?await res.text():"";
        }catch{}

        const age=normAge(p.age);
        const name=p.nick_name||p.first_name||"Friend";
        setList(makeAiList(name,age,seedText,p.child_uid||p.id));
      }catch(e:any){
        console.error(e);
        setErr(e?.message||"Failed to load Magic Wishlist.");
      }
    })();
    return()=>{
      try{channelRef.current?.unsubscribe();}catch{}
      channelRef.current=null;
    };
  },[nav]);

  // monthly usage summary from ai_image_audit
  useEffect(()=>{
    if(!profile?.child_uid)return;
    (async()=>{
      try{
        const now=new Date();
        const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1,0,0,0,0));
        const{data,error}=await supabase
          .from("ai_image_audit")
          .select("provider,n_images,est_cost_usd,created_at")
          .eq("child_uid",profile.child_uid)
          .gte("created_at",start.toISOString());
        if(error){console.warn("ai_image_audit load error",error);return;}
        let gen=0;
        let gallery=0;
        for(const row of(data||[])as any[]){
          const n=Number(row.n_images||1)||1;
          const cost=Number(row.est_cost_usd||0)||0;
          const provider=String(row.provider||"");
          if(provider==="gallery"){gallery+=n;}
          else if(cost>0){gen+=n;}
        }
        setGenUsed(gen);
        setGalleryUsed(gallery);
      }catch(e){
        console.warn("ai_image_audit summary error",e);
      }
    })();
  },[profile?.child_uid]);

  // realtime toasts
  useEffect(()=>{
    if(!profile?.child_uid&&!profile?.id)return;
    try{channelRef.current?.unsubscribe();}catch{}
    channelRef.current=null;

    const childKey=profile?.child_uid||profile?.id;
    const ch=supabase.channel(`ai-wishlist:${childKey}`);

    ch.on("postgres_changes",{event:"INSERT",schema:"public",table:"points_ledger",filter:`child_uid=eq.${childKey}`},(payload:any)=>{
      const delta=Number(payload?.new?.delta??payload?.new?.points??0);
      if(Number.isFinite(delta)&&delta!==0){
        const sign=delta>0?"+":"";
        window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"success",message:`Points update: ${sign}${delta} pts`}}));
        playDing();
      }
    });

    ch.on("postgres_changes",{event:"UPDATE",schema:"public",table:"reward_redemptions",filter:`child_uid=eq.${childKey}`},(payload:any)=>{
      const st=payload?.new?.status as string|undefined;
      const title=payload?.new?.reward_title||"Your reward";
      if(st==="Approved"||st==="Fulfilled"){
        window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"success",message:`Reward ${st.toLowerCase()}: ${title}`}}));
        playCheer();
      }
    });

    ch.subscribe();
    channelRef.current=ch;
    return()=>{
      try{channelRef.current?.unsubscribe();}catch{}
      channelRef.current=null;
    };
  },[profile?.child_uid,profile?.id]);

  async function persistImageUrl(dbId:string,url:string){
    if(!/^https?:\/\//i.test(url)&&!url.startsWith("data:image/"))return;
    await tpromise(
      ()=>supabase.from("wishlist_items").update({image_url:url}).eq("id",dbId),
      {loading:"Saving image URL…",success:"Image URL saved",error:"Save failed"}
    );
  }
  async function persistImagePath(dbId:string,path:string){
    if(!path)return;
    await tpromise(
      ()=>supabase.from("wishlist_items").update({image_bucket:STICKERS_BUCKET,image_path:path}).eq("id",dbId),
      {loading:"Saving to gallery…",success:"Saved to gallery",error:"Save failed"}
    );
  }
  function currentOccasion(){
    if(occasionSel==="Other"){
      const c=(occasionCustom||"").trim();
      return c||"Just Because";
    }
    return occasionSel;
  }

  function buildPromptForSuggestion(s:AiSuggestion,mode:GenMode){
    const occ=currentOccasion();
    const key=occ.toLowerCase();
    const pack=OCCASION_FLAVOR[key]||OCCASION_FLAVOR["other"];
    const emoji=pack.emoji;
    const style=pack.style;
    const frame=pack.cardFrame||"";
    const wt=wishText.trim();
    const textPart=wt
      ?`Leave a clear clean area where we can overlay the greeting text "${wt}". No written text from the artist, just space for it.`
      :"No written text; just artwork with some empty space for a future text overlay.";
    if(mode==="card"){
      return`Greeting card art ${emoji}, wholesome, child-friendly. Occasion: ${occ}.
Item: ${s.title}. Notes: ${s.desc}.
Style: ${style}. Add ${frame}. Simple clean background, high contrast, center composition, printable quality. ${textPart}`;
    }
    return`Cute sticker ${emoji}, glossy, kid-friendly, simple background. Occasion accent: ${occ}.
Item: ${s.title}. Notes: ${s.desc}.
Style: ${style}. Bold silhouette, high contrast, minimal shadows. ${textPart}`;
  }

  /* -------------------- AI image call (aligned with edge fn) -------------------- */
  async function callAiForPrompt(prompt:string,styleSeed?:number,mode?:GenMode){
    const trimmed=prompt.trim();
    if(trimmed.length<20){
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"error",message:`Prompt too short (${trimmed.length})`}}));
      return{uiUrls:[],paths:[],isFallback:true,cost:0,errorMsg:"Prompt too short"};
    }

    const effectiveMode=mode??genMode;
    const size=sizeForMode(effectiveMode); // "auto" on this screen
    const folder=profile?`child/${profile.child_uid}`:"misc";

    const{data,error}=await supabase.functions.invoke("ai-image",{
      body:{
        prompt,
        size,
        n:1,
        folder,
        styleSeed,
        noFallback:NO_FALLBACK
      }
    });
    if(error){throw error;}

    const resp=(data||{})as AiImageResp&{error?:string};
    const items=(resp.images||[])as AiImageRespImage[];
    const provider=(resp.provider||"openai").toLowerCase();
    const cost=Number(resp?.estCostUsd||0);
    const errorMsg=resp?.error?String(resp.error):"";

    const uiUrls=items.map((x)=>String(x?.dataUrl||x?.signedUrl||x?.url||x?.publicUrl||"")).filter(Boolean);
    const paths=items.map((x)=>String(x?.path||"")).filter(Boolean);

    const hardFallback=(provider==="dummy"||provider==="budget"||provider==="gallery"||Boolean(resp.usedFallback&&provider!=="openai"&&provider!=="cache"));

    if(hardFallback){
      console.warn("ai-image fallback provider:",provider,resp);
    }

    return{uiUrls,paths,isFallback:hardFallback,cost,errorMsg};
  }

  /* -------------------- Send wish to parent (auto-generate if needed) ----------- */
  async function sendToParent(s:AiSuggestion){
    if(!profile)return;

    if(!s.img){
      if(genRemaining<=0){
        window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"warning",message:"AI image limit reached for this month. Sending wish without generating a new image. You can still choose from gallery or upload."}}));
      }else{
        try{
          setBusyId(s.id);
          const autoPrompt=buildPromptForSuggestion(s,"card");
          const{uiUrls,paths,isFallback,cost}=await callAiForPrompt(autoPrompt,hash(s.id)+7,"card");
          if(uiUrls[0]){
            setList((prev)=>prev.map((x)=>x.id===s.id?{...x,img:uiUrls[0]}:x));
            setVariantCache((prev)=>({...prev,[s.id]:uiUrls}));
            if(!isFallback&&cost>0){
              setCostById((prev)=>({...prev,[s.id]:cost}));
              setSessionCost((v)=>+(v+cost).toFixed(4));
              setGenUsed((v)=>v+1);
            }
            await tpromise(
              ()=>supabase.from("ai_image_audit").insert({
                child_uid:profile.child_uid??null,
                wishlist_item_id:s.dbId??null,
                provider:isFallback?"fallback":"openai",
                size:sizeForMode("card"),
                n_images:1,
                est_cost_usd:isFallback?0:cost
              }),
              {loading:"",success:"",error:""}
            );
            if(s.dbId&&paths[0]){await persistImagePath(s.dbId,paths[0]);}
          }
        }catch(e){
          console.warn("Auto-generate-on-send failed:",e);
        }finally{
          setBusyId(null);
        }
      }
    }

    const pin=prompt("Enter your PIN to send this wish to your parent")||"";
    const occ=currentOccasion();
    setBusyId(s.id);
    let createdId:string|null=null;

    const rpcRes=await tpromise(
      ()=>supabase.rpc("child_portal_add_wish",{
        _key:profile.child_uid,
        _secret:pin,
        _label:`${s.title} (${occ})`,
        _description:`(AI ${genMode}) ${s.desc}`,
        _category:s.category.toLowerCase(),
        _target_points:s.points,
        _link:null,
        _occasion:occ
      }),
      {loading:"Sending to parent…",success:"Sent! Your parent will review it.",error:"Could not send wish.",sound:"success"}
    );
    if(!("error"in rpcRes)||!rpcRes.error){
      try{
        const d=(rpcRes as any).data;
        createdId=(Array.isArray(d)?d[0]?.id:d?.id)??null;
      }catch{}
    }
    if(!createdId){
      createdId=await createOrGetWishlistId({
        child_uid:profile.child_uid,
        label:`${s.title} (${occ})`,
        description:`(AI ${genMode}) ${s.desc}`,
        category:s.category,
        target_points:Number(s.points)||0,
        link:null,
        occasion:occ
      });
    }
    if(createdId){
      setList((prev)=>prev.map((x)=>x.id===s.id?{...x,dbId:String(createdId)}:x));
      if(s.img){await persistImageUrl(String(createdId),s.img);}
    }

    await tpromise(
      ()=>supabase.rpc("api_child_notify_new_wish",{
        p_child_uid:profile.child_uid,
        p_title:`New ${occ} wish`,
        p_message:`${s.title} (${s.points} pts) • ${occ}`,
        p_family_id:profile.family_id??null,
        p_wishlist_item_id:(createdId??s.dbId??null)
      }),
      {loading:"Notifying parent…",success:"Parent notified.",error:"Notify failed"}
    );

    setBusyId(null);
  }

  /* -------------------- Single-image generator for one wish -------------------- */
  async function makeCardImage(s:AiSuggestion){
    if(genRemaining<=0){
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"warning",message:"You’ve used all AI images for this month. Please pick from gallery or upload your own image."}}));
      return;
    }
    const n=1;
    const mode=genMode;
    const size=sizeForMode(mode); // "auto"
    setBusyId(s.id);
    try{
      const cardPrompt=buildPromptForSuggestion(s,mode);
      const{uiUrls,paths,isFallback,cost,errorMsg}=await callAiForPrompt(cardPrompt,hash(s.id),mode);

      if(uiUrls.length===0){throw new Error(errorMsg||"No provider image available");}

      const canLoad=await testImageLoad(uiUrls[0]);
      if(!canLoad){throw new Error("Generated image could not be loaded");}

      setList((prev)=>prev.map((x)=>x.id===s.id?{...x,img:uiUrls[0]}:x));
      setVariantCache((prev)=>({...prev,[s.id]:uiUrls}));
      if(!isFallback&&cost>0){
        setCostById((prev)=>({...prev,[s.id]:cost}));
        setSessionCost((v)=>+(v+cost).toFixed(4));
        setGenUsed((v)=>v+n);
      }

      await tpromise(
        ()=>supabase.from("ai_image_audit").insert({
          child_uid:profile?.child_uid??null,
          wishlist_item_id:s.dbId??null,
          provider:isFallback?"fallback":"openai",
          size,
          n_images:n,
          est_cost_usd:isFallback?0:cost
        }),
        {loading:"",success:"",error:""}
      );

      if(s.dbId&&paths[0]){await persistImagePath(s.dbId,paths[0]);}
    }catch(e:any){
      console.error("makeCardImage error:",e);
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"error",message:e?.message||"Could not generate image"}}));
    }finally{
      setBusyId(null);
    }
  }

  /* -------------------- Bulk one-image-per-wish generator --------------------- */
  async function generateAll(){
    const n=1;
    const mode=genMode;
    const size=sizeForMode(mode); // "auto"
    let remaining=genRemaining;
    if(remaining<=0){
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"warning",message:"No AI image credits left this month."}}));
      return;
    }
    setBulkBusy(true);
    try{
      for(const s of list){
        if(remaining<=0)break;
        if(s.img)continue; // skip ones that already have images

        const cardPrompt=buildPromptForSuggestion(s,mode);
        try{
          const{uiUrls,paths,isFallback,cost}=await callAiForPrompt(cardPrompt,hash(s.id),mode);
          if(uiUrls.length===0)continue;

          const canLoad=await testImageLoad(uiUrls[0]);
          if(!canLoad)continue;

          const first=uiUrls[0];
          setList((prev)=>prev.map((x)=>x.id===s.id?{...x,img:first}:x));
          setVariantCache((prev)=>({...prev,[s.id]:uiUrls}));
          if(!isFallback&&cost>0){
            setCostById((prev)=>({...prev,[s.id]:cost}));
            setSessionCost((v)=>+(v+cost).toFixed(4));
            setGenUsed((v)=>v+n);
            remaining-=n;
          }

          await tpromise(
            ()=>supabase.from("ai_image_audit").insert({
              child_uid:profile?.child_uid??null,
              wishlist_item_id:s.dbId??null,
              provider:isFallback?"fallback":"openai",
              size,
              n_images:n,
              est_cost_usd:isFallback?0:cost
            }),
            {loading:"",success:"",error:""}
          );

          if(s.dbId&&paths[0]){await persistImagePath(s.dbId,paths[0]);}
        }catch(e){
          console.warn("bulk image fail:",s.title,e);
        }
      }
    }finally{
      setBulkBusy(false);
    }
  }

  function openVariantsFor(id:string){
    const imgs=variantCache[id]||[];
    if(!imgs.length)return;
    setPickerTarget(id);setPickerImages(imgs);setPickerOpen(true);
  }

  async function chooseVariant(url:string){
    if(!pickerTarget)return;
    const target=list.find((x)=>x.id===pickerTarget);
    setList((prev)=>prev.map((x)=>x.id===pickerTarget?{...x,img:url}:x));
    setPickerOpen(false);setPickerTarget(null);setPickerImages([]);
    try{
      if(target?.dbId){await persistImageUrl(target.dbId,url);}
    }catch(e){console.warn("persist image_url failed:",e);}
  }

  async function saveCurrentImageToStorage(s:AiSuggestion){
    if(!profile||!s.img){
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"warning",message:"No image to save"}}));
      return;
    }
    try{
      setBusyId(s.id);
      const y=new Date().getUTCFullYear();const m=String(new Date().getUTCMonth()+1).padStart(2,"0");
      const baseFolder=`child/${profile.child_uid}/${currentOccasion().toLowerCase().replace(/[^a-z0-9]+/g,"-")}/${y}/${m}`;
      let storedPath="";
      if(s.img.startsWith("data:image/")){
        const fileName=`${genMode}-${crypto.randomUUID()}.png`;
        const path=`${baseFolder}/${fileName}`;
        storedPath=await uploadDataUrlToBucket(s.img,path,"image/png");
      }else{
        const items=[{url:s.img,filename:`${genMode}-${crypto.randomUUID()}.png`}];
        const saved=await importImages(items,{folder:`child/${profile.child_uid}`,occasion:currentOccasion(),subfolder:genMode==="card"?"cards":"stickers"});
        storedPath=saved?.[0]?.path||"";
      }
      if(!storedPath){throw new Error("Upload failed");}

      const signed=await getSignedUrl(storedPath,60*60*24*7);
      setList((prev)=>prev.map((x)=>x.id===s.id?{...x,img:signed||x.img}:x));
      if(s.dbId){await persistImagePath(s.dbId,storedPath);}
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"success",message:"Saved to gallery"}}));
    }catch(e:any){
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"error",message:e?.message||"Save failed"}}));
    }finally{
      setBusyId(null);
    }
  }

  function triggerUploadFor(id:string){
    uploadTargetIdRef.current=id;
    uploadInputRef.current?.click();
  }
  async function onUploadPicked(e:React.ChangeEvent<HTMLInputElement>){
    const file=(e.target.files?.[0])||null;
    e.target.value="";
    const targetId=uploadTargetIdRef.current;
    uploadTargetIdRef.current=null;
    if(!file||!targetId)return;
    const reader=new FileReader();
    reader.onload=async(ev)=>{
      const dataUrl=String(ev.target?.result||"");
      setList((prev)=>prev.map((x)=>x.id===targetId?{...x,img:dataUrl}:x));
      const t=list.find((x)=>x.id===targetId);
      if(t?.dbId){await persistImageUrl(t.dbId,dataUrl);}
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"success",message:"Image loaded from device"}}));
    };
    reader.readAsDataURL(file);
  }

  async function openGallery(targetId?:string){
    if(!profile){return;}
    setGalleryTargetId(targetId??null);
    setGalleryOpen(true);
    setGalleryLoading(true);
    setGalleryFilter("all");
    try{
      // Now pulls all child images instead of only this child's folder
      const paths=await listChildImagePaths(profile.child_uid);
      const groups:Record<string,{path:string;url:string;isMine:boolean}[]>= {};

      for(const p of paths){
        try{
          const signed=await getSignedUrl(p,60*60*24*7);
          if(!signed)continue;

          const parts=p.split("/");
          const occSlug=(parts[2]||"other");
          const key=occSlug.replace(/-/g," ");
          const isMine=p.startsWith(`child/${profile.child_uid}/`);

          if(!groups[key]){groups[key]=[];}
          groups[key].push({path:p,url:signed,isMine});
        }catch{}
      }

      Object.keys(groups).forEach((k)=>{
        groups[k].sort((a,b)=>a.path.localeCompare(b.path));
      });

      setGalleryGroups(groups);
    }catch(e){
      console.warn(e);
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"error",message:"Could not load gallery"}}));
    }finally{
      setGalleryLoading(false);
    }
  }

  async function copyToClipboard(s:string){
    try{
      await navigator.clipboard.writeText(s);
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"success",message:"Copied"}}));
    }catch{}
  }

  async function useGalleryPathAsImage(path:string){
    if(galleryRemaining<=0){
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"warning",message:"You’ve used all gallery picks for this month."}}));
      return;
    }
    try{
      const signed=await getSignedUrl(path,60*60*24*7);
      if(!signed){return;}
      const targetId=galleryTargetId||pickerTarget;
      if(targetId){
        setList((prev)=>prev.map((x)=>x.id===targetId?{...x,img:signed||x.img}:x));
      }
      // Log a zero-cost gallery usage so we can count it
      if(profile?.child_uid){
        await supabase.from("ai_image_audit").insert({
          child_uid:profile.child_uid,
          wishlist_item_id:null,
          provider:"gallery",
          size:"gallery",
          n_images:1,
          est_cost_usd:0
        });
        setGalleryUsed((v)=>v+1);
      }
      setGalleryOpen(false);
    }catch(e){
      console.warn(e);
    }
  }

  async function addCustomOccasion(){
    const c=(occasionCustom||"").trim();
    if(!c)return;
    if(customOccasions.includes(c))return;
    const next=[...customOccasions,c].slice(0,20);
    setCustomOccasions(next);
    try{localStorage.setItem("child_ai_custom_occasions",JSON.stringify(next));}catch{}
    setOccasionSel(c);
  }

  function occEmoji(name:string){
    const pack=OCCASION_FLAVOR[(name||"").toLowerCase()]||OCCASION_FLAVOR["other"];
    return pack.emoji;
  }

  async function downloadImageFor(s:AiSuggestion){
    try{
      if(!s.img){return;}
      let blob:Blob;
      if(s.img.startsWith("data:")){
        const res=await fetch(s.img);
        blob=await res.blob();
      }else{
        const res=await fetch(s.img,{mode:"cors"});
        blob=await res.blob();
      }
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      const ext=(blob.type&&blob.type.includes("png"))?"png":(blob.type.includes("jpeg")?"jpg":"png");
      a.href=url;a.download=`${genMode}-${s.title.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.${ext}`;
      document.body.appendChild(a);a.click();a.remove();
      URL.revokeObjectURL(url);
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"success",message:"Downloaded"}}));
    }catch(e){
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"error",message:"Download failed"}}));
    }
  }

  /* -------------------- Inspire Me skeleton UX -------------------- */
  const[ghostIdeas,setGhostIdeas]=useState<number>(0);
  const inspireMore=async()=>{
    if(!profile||inspireBusy)return;
    setInspireBusy(true);
    setGhostIdeas(10);
    try{
      const age=normAge(profile.age);
      const baseSeed=`${Date.now()}|${Math.random()}`;
      const r=rngOf(hash(baseSeed));
      const plan=bankByAge(age);
      const cats:AiCategory[]=["Fun","Learning","Outdoor","Creative","Tech"];

      const fresh:AiSuggestion[]=[];
      for(const cat of cats){
        const pool=plan.pools[cat]as[string,string][];
        for(let i=0;i<2;i++){
          const[t,d]=pool[Math.floor(r()*pool.length)];
          const lvl=pick(r,plan.levels as any)as"low"|"med"|"high"|"ultra";
          const pts=scalePoints(r,lvl);
          fresh.push({id:`${cat}-x-${hash(t+d+pts+baseSeed+i)}`,category:cat,title:t,desc:d,points:pts,img:null,dbId:null});
        }
      }

      const seen=new Set(list.map((x)=>`${x.category}|${x.title.toLowerCase()}`));
      const merged=[...list];
      for(const f of fresh){
        const key=`${f.category}|${f.title.toLowerCase()}`;
        if(!seen.has(key)){merged.push(f);seen.add(key);}
      }
      setList(merged);
      playDing();
    }catch(e:any){
      console.warn(e);
      window.dispatchEvent(new CustomEvent("toastx",{detail:{type:"error",message:e?.message||"Could not fetch more ideas"}}));
    }finally{
      setGhostIdeas(0);
      setInspireBusy(false);
    }
  };

  if(err){
    return(
      <div className="relative min-h[calc(100vh-4rem)]">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-200px,rgba(120,119,198,0.25),transparent),linear-gradient(to_bottom,#0B1220,#0A0F1A)]"/>
        <div className="relative max-w-3xl mx-auto p-4 md:p-6">
          <button onClick={()=>nav(-1)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/20">
            <ArrowLeft className="w-4 h-4"/> Back
          </button>
          <div className="mt-6 glass-premium rounded-2xl p-6 border border-white/20 text-white">
            <div className="text-xl font-bold mb-2">Magic Wishlist</div>
            <div className="text-white/70">{err}</div>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div className="relative">
      <style>{`
        ${styles}
        select.dark-select, input.dark-input {background:#0f172a; color:#ffffff; border:1px solid rgba(255,255,255,0.2);}
        select.dark-select:focus, input.dark-input:focus {outline:none; box-shadow:0 0 0 2px rgba(56,189,248,0.6);}
        select.dark-select option { background:#ffffff; color:#0f172a; }
      `}</style>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_50%_-200px,rgba(120,119,198,0.25),transparent),linear-gradient(to_bottom,#0B1220,#0A0F1A)]"/>
      <div className="absolute -z-10 inset-0 opacity-30 [mask-image:radial-gradient(800px_400px_at_50%_0%,black,transparent)] pointer-events-none">
        <div className="h-full w-full bg-[url('/noise.png')]"/>
      </div>

      {bulkBusy&&(
        <div className="sticky top-2 z-40 mx-auto max-w-6xl px-4">
          <div className="rounded-xl border border-white/20 bg-white/10 text-white px-3 py-2 text-sm backdrop-blur flex items-center gap-2">
            <Sparkles className="w-4 h-4 ai-spin"/> Generating images<span className="ai-dots"></span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={()=>nav(-1)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 w-full sm:w-auto">
              <ArrowLeft className="w-4 h-4"/> Back
            </button>
            <div className="flex items-center gap-2 text-white">
              <Sparkles className="w-6 h-6 text-pink-300"/>
              <h1 className="text-2xl md:text-3xl font-extrabold min-w-0 break-words">Magic Wishlist Picks</h1>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs sm:text-sm text-white/70">Occasion</label>
              <select value={occasionSel} onChange={(e)=>setOccasionSel(e.target.value)} className="dark-select px-3 py-2 rounded-lg text-white text-sm focus:outline-none" aria-label="Occasion">
                {allOccasions.map((o)=>(
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            {occasionSel==="Other"&&(
              <div className="flex items-center gap-2">
                <input
                  value={occasionCustom}
                  onChange={(e)=>setOccasionCustom(e.target.value)}
                  placeholder="Type custom occasion"
                  className="dark-input px-3 py-2 rounded-lg text-sm placeholder-white/50 min-w-[12rem]"
                />
                <button
                  onClick={addCustomOccasion}
                  disabled={!occasionCustom.trim()}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold ${!occasionCustom.trim()?"bg-white/10 text-white/40 cursor-not-allowed":"bg-white/10 hover:bg-white/20 text-white border border-white/20"}`}
                >
                  Save
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs sm:text-sm text-white/70 whitespace-nowrap">Greeting text</label>
              <input
                value={wishText}
                onChange={(e)=>setWishText(e.target.value.slice(0,MAX_WISH_CHARS))}
                placeholder="e.g. Happy Diwali! 🎆"
                className="dark-input px-3 py-2 rounded-lg text-sm placeholder-white/40 min-w-[10rem] sm:min-w-[14rem]"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 p-1">
              <button onClick={()=>setGenMode("sticker")} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${genMode==="sticker"?"bg-white/20 text-white":"text-white/70 hover:text-white"}`}>Sticker</button>
              <button onClick={()=>setGenMode("card")} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${genMode==="card"?"bg-white/20 text-white":"text-white/70 hover:text-white"}`}>Card</button>
            </div>

            <button onClick={()=>void openGallery()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20">
              <GalleryHorizontalEnd className="w-4 h-4"/><span className="text-sm">Gallery</span>
            </button>
          </div>
        </div>

        {profile&&(
          <p className="text-white/70 text-sm sm:text-base">
            Personalized for {profile.nick_name||profile.first_name} (age {normAge(profile.age)}).
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-white/60 min-w-0 break-words">
            Ideas adapt to <span className="font-semibold text-white">{currentOccasion()}</span> {occEmoji(currentOccasion())}.{" "}
            Switch mode to create a <span className="font-semibold text-white">{genMode}</span>.{" "}
            {wishText.trim()&&(
              <span className="text-white/70">Greeting: “{wishText.trim()}” will be shown on your card/sticker.</span>
            )}
          </div>
          <div className="flex flex-col xs:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={()=>void inspireMore()}
              disabled={inspireBusy||bulkBusy}
              className={`px-3 py-2 rounded-xl text-sm font-semibold w-full sm:w-auto ${inspireBusy||bulkBusy?"bg-white/10 text-white/50 cursor-not-allowed":"bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white"}`}
            >
              {inspireBusy?"Loading options…":"Inspire me (AI)"}
            </button>
            <button
              onClick={()=>void generateAll()}
              disabled={bulkBusy||busyId!==null||genRemaining<=0}
              className={`px-3 py-2 rounded-xl text-sm font-semibold w-full sm:w-auto ${bulkBusy||genRemaining<=0?"bg-white/10 text-white/50 cursor-not-allowed":"bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white"}`}
            >
              {bulkBusy?"Generating for all…":genRemaining>0?`Generate for all (${genRemaining} left)`:"No AI credits left"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-[11px] sm:text-xs text-white/60">
          <div>AI images this month: <span className="text-white">{genUsed}/{MAX_GEN_PER_MONTH}</span></div>
          <div>Gallery picks this month: <span className="text-white">{galleryUsed}/{MAX_GALLERY_USE_PER_MONTH}</span></div>
          {sessionCost>0&&(
            <div>Session est. cost: <span className="text-emerald-300">${sessionCost.toFixed(4)}</span></div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {["Fun","Learning","Outdoor","Creative","Tech"].map((cat)=>(
            <div key={cat} className="rounded-2xl p-4 bg-white/8 border border-white/15">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1 sm:gap-2">
                <h3 className="text-white font-semibold min-w-0 break-words">{cat}</h3>
                <span className="text-xs text-white/60">
                  {list.filter((s)=>s.category===cat).length} ideas
                </span>
              </div>

              {inspireBusy&&ghostIdeas>0&&(
                <div className="space-y-3 mb-3">
                  {Array.from({length:2}).map((_,i)=>(
                    <div key={`ghost-${cat}-${i}`} className="p-3 rounded-xl border border-white/20 bg-white/5">
                      <div className="h-4 w-2/5 ai-shimmer rounded mb-2"></div>
                      <div className="h-3 w-3/5 ai-shimmer rounded mb-1"></div>
                      <div className="h-3 w-1/3 ai-shimmer rounded"></div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {list.filter((s)=>s.category===cat).map((s)=>(
                  <div key={s.id} className="p-3 rounded-xl bg-white/10 border border-white/20">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-white truncate">{s.title}</div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white/70">
                            {occEmoji(currentOccasion())} {currentOccasion()}
                          </span>
                        </div>
                        <div className="text-xs text-white/70">{s.desc}</div>
                        <div className="text-xs text-emerald-300 mt-1">{s.points} pts</div>

                        {(s.img||busyId===s.id)&&(
                          <div className="relative mt-2 rounded-xl border border-white/20 overflow-hidden bg-[conic-gradient(#dedefe_25%,transparent_0_50%,#dedefe_0_75%,transparent_0)] [background-size:16px_16px]">
                            {s.img&&(
                              <img
                                src={s.img||""}
                                alt={s.title}
                                className="w-full h-auto object-contain bg-transparent"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(e)=>{
                                  console.warn("Image load error, falling back to placeholder:",s.img?.substring(0,100));
                                  (e.currentTarget as HTMLImageElement).src="/img/placeholder.png";
                                }}
                                onLoad={()=>{
                                  console.log("Image loaded successfully:",s.id);
                                }}
                              />
                            )}

                            {/* Greeting text overlay */}
                            {wishText.trim()&&(
                              <div className="absolute inset-x-3 bottom-3 flex justify-center pointer-events-none">
                                <div className="px-2 py-1 rounded-lg bg-black/60 border border-white/20 text-[11px] sm:text-xs text-white font-semibold backdrop-blur">
                                  {wishText.trim()}
                                </div>
                              </div>
                            )}

                            {busyId===s.id&&(
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm">
                                <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white ai-spin"></div>
                                <div className="text-white text-xs">
                                  Making your {genMode}<span className="ai-dots"></span>
                                </div>
                                <div className="w-2/3 h-1.5 rounded ai-shimmer"></div>
                              </div>
                            )}

                            {String(s.img||"").startsWith("data:image/svg+xml")&&(
                              <span className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded-full bg-white/15 border border-white/25 text-white/80">
                                Preview
                              </span>
                            )}
                            <div className="absolute bottom-2 right-2 text-[10px] px-2 py-1 rounded-md bg-black/40 border border-white/20 text-white/90 backdrop-blur">
                              {genMode==="card"?"Card":"Sticker"}
                            </div>
                          </div>
                        )}

                        {Number(costById[s.id]||0)>0&&(
                          <div className="mt-1 text-[10px] text-white/60">
                            est. image cost: <span className="text-emerald-300">${(costById[s.id]||0).toFixed(4)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                        <button
                          onClick={()=>void makeCardImage(s)}
                          disabled={busyId===s.id||bulkBusy||genRemaining<=0}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold w-full sm:w-auto ${busyId===s.id||bulkBusy||genRemaining<=0?"bg-white/10 text-white/50 cursor-not-allowed":"bg-white/10 hover:bg-white/20 text-white border border-white/20"}`}
                          title={`Generate a ${genMode==="card"?"card":"sticker"} with ${currentOccasion()}`}
                        >
                          <ImageIcon className="w-4 h-4"/>
                          {busyId===s.id?"Making…":genRemaining>0?`Make ${genMode} (${genRemaining} left)`:`No AI credits`}
                        </button>

                        <button
                          onClick={()=>triggerUploadFor(s.id)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 w-full sm:w-auto"
                          title="Upload an image from your device"
                        >
                          <Upload className="w-4 h-4"/> Upload image
                        </button>

                        {(variantCache[s.id]?.length||0)>1&&(
                          <button
                            onClick={()=>openVariantsFor(s.id)}
                            className="px-3 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 w-full sm:w-auto"
                          >
                            Variants ({variantCache[s.id].length})
                          </button>
                        )}

                        <button
                          onClick={()=>void saveCurrentImageToStorage(s)}
                          disabled={!s.img||busyId===s.id||bulkBusy}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 w-full sm:w-auto"
                          title="Save this image to your Supabase bucket"
                        >
                          <Save className="w-4 h-4"/> Save image
                        </button>

                        <button
                          onClick={()=>void downloadImageFor(s)}
                          disabled={!s.img}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 w-full sm:w-auto"
                          title="Download to your device"
                        >
                          <Download className="w-4 h-4"/> Download
                        </button>

                        <button
                          onClick={()=>void openGallery(s.id)}
                          className="px-3 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 w-full sm:w-auto"
                          title="Pick from saved images"
                        >
                          <GalleryHorizontalEnd className="w-4 h-4"/> Pick from gallery
                          {galleryRemaining<=5&&galleryRemaining>0&&(
                            <span className="ml-1 text-[10px] text-amber-300">({galleryRemaining} left)</span>
                          )}
                          {galleryRemaining<=0&&(
                            <span className="ml-1 text-[10px] text-red-300">(limit reached)</span>
                          )}
                        </button>

                        <button
                          onClick={()=>void sendToParent(s)}
                          disabled={busyId===s.id||bulkBusy}
                          className={`px-3 py-2 rounded-xl text-sm font-semibold w-full sm:w-auto ${busyId===s.id||bulkBusy?"bg-white/10 text-white/50 cursor-not-allowed":"bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white"}`}
                          title="Send to parent with current occasion"
                        >
                          {busyId===s.id?"Sending…":"Send 💌"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-white/50">
          Edit <code className="px-1 py-0.5 rounded bg-white/10 border border-white/20">/public/ai/AiWishlist.txt</code> to customize ideas or categories.
        </div>
      </div>

      <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadPicked}/>

      {pickerOpen&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={()=>setPickerOpen(false)}/>
          <div className="relative z-10 w-full max-w-3xl rounded-2xl bg-[#0B1220] border border-white/15 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-300"/>
                Choose your favorite
              </div>
              <button onClick={()=>setPickerOpen(false)} className="px-3 py-1 rounded-lg bg-white/10 text-white/80 hover:bg-white/20">
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pickerImages.map((u,idx)=>(
                <div key={idx} className="rounded-xl overflow-hidden border border-white/20">
                  <button onClick={()=>void chooseVariant(u)} className="w-full block hover:border-white/40 focus:outline-none">
                    <img src={u} alt={`variant-${idx}`} className="w-full h-auto object-cover" onError={(e)=>{(e.currentTarget as HTMLImageElement).alt="failed-to-load";}}/>
                  </button>
                  <div className="px-3 py-2 text-[11px] text-white/60 flex items-center justify-between gap-2">
                    <span className="truncate">variant-{idx}</span>
                    <a href={u} target="_blank" rel="noreferrer" className="underline">open</a>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/60 flex items-center gap-2">
              <Check className="w-3 h-3"/>
              Click an image to apply it to the card.
            </div>
          </div>
        </div>
      )}

      {galleryOpen&&(
        <div className="fixed inset-0 z-50 p-4 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={()=>setGalleryOpen(false)}/>
          <div className="relative z-10 w-full max-w-5xl rounded-2xl bg-[#0B1220] border border-white/15 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <GalleryHorizontalEnd className="w-4 h-4 text-sky-300"/>
                  Saved Images
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                  <span>Showing all kids’ saved images</span>
                  <div className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/15 p-0.5">
                    <button
                      onClick={()=>setGalleryFilter("all")}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${galleryFilter==="all"?"bg-white/20 text-white":"text-white/60 hover:text-white"}`}
                    >
                      All images
                    </button>
                    <button
                      onClick={()=>setGalleryFilter("mine")}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${galleryFilter==="mine"?"bg-emerald-500/80 text-white":"text-white/60 hover:text-white"}`}
                    >
                      My images only
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={()=>setGalleryOpen(false)} className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/10 text-white/80 hover:bg-white/20">
                <X className="w-4 h-4"/> Close
              </button>
            </div>

            {galleryLoading&&(
              <div className="py-8 text-center text-white/60 text-sm">
                Loading gallery<span className="ai-dots"></span>
              </div>
            )}

            {!galleryLoading&&Object.keys(galleryGroups).length===0&&(
              <div className="py-8 text-center text-white/60 text-sm">
                No saved images yet.
              </div>
            )}

            {!galleryLoading&&Object.entries(galleryGroups).map(([group,items])=>{
              const visibleItems=galleryFilter==="all"?items:items.filter((it)=>it.isMine);
              if(!visibleItems.length)return null;
              return(
                <div key={group} className="mb-5">
                  <div className="text-xs uppercase tracking-wide text-white/60 mb-2 flex items-center gap-2">
                    <Wallet className="w-3 h-3 text-emerald-300"/>
                    {group}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {visibleItems.map((it)=>(
                      <div key={it.path} className="rounded-xl overflow-hidden border border-white/15 bg-white/5">
                        <img
                          src={it.url}
                          className="w-full h-auto object-cover"
                          onError={(e)=>{(e.currentTarget as HTMLImageElement).alt="failed";}}
                          alt={it.path}
                        />
                        <div className="p-2 text-[11px] text-white/70 flex items-center gap-2">
                          <span className="truncate" title={it.path}>{it.path.split("/").slice(-1)[0]}</span>
                        </div>
                        <div className="px-2 pb-2 flex items-center justify-between gap-2">
                          <button onClick={()=>void copyToClipboard(it.path)} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 text-white/80 hover:bg-white/20 text-[11px]">
                            <Copy className="w-3 h-3"/> Copy path
                          </button>
                          <div className="flex items-center gap-1">
                            <a
                              href={it.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 text-white/80 hover:bg-white/20 text-[11px]"
                            >
                              <ExternalLink className="w-3 h-3"/> Open
                            </a>
                            <button
                              onClick={()=>void useGalleryPathAsImage(it.path)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white text-[11px]"
                            >
                              Use
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
