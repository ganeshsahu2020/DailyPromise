// src/routes/child/StoryLibrary.tsx
import React,{useEffect,useState,useRef}from "react";
import {supabase}from "@/lib/supabase";
import {fetchChildBrief}from "@/utils/childAuth";
import {toast}from "sonner";
import {
  Sparkles,
  BookOpen,
  LibraryBig,
  Loader2,
  RefreshCw,
  Bookmark,
  Search,
  Filter,
  X,
  ArrowLeft,
  BookText,
  Clock3,
  Volume2,
  VolumeX,
  Heart,
  Share2,
  Download
}from "lucide-react";

type StoryListItem={
  path:string;
  name:string;
  created_at:string;
  owner:string;
  coverUrl?:string|null;

  // hydrated from file:
  title?:string;
  preview?:string;
  typeLabel?:string;
  topic?:string;
  wordCount?:number;
  readMinutes?:number;
};

type ParsedStory={
  title:string;
  body:string;
  moral?:string|null;
  type?:string;
  topic?:string;
  imageId?:string;
};

const STORY_BUCKET="magic-stories";
const COVER_BUCKET="ai-images";
const SHARED_FOLDER="public";
const WORDS_PER_MINUTE=130;
const BGM_URL="/sounds/story-bgm.wav"; // 🔊 soft background music

type StoryLanguage="en"|"hi";
type HindiPayload={body_hi?:string;moral_hi?:string|null};

/* ---------------------- Storage helpers (images) ---------------------- */

async function getSignedCoverUrl(imagePath:string):Promise<string|null>{
  try{
    console.log("[StoryLibrary] Signing image path:",imagePath);
    const {data,error}=await supabase.storage
      .from(COVER_BUCKET)
      .createSignedUrl(imagePath,60*60*6);
    if(error||!data?.signedUrl){
      console.warn("[StoryLibrary] Failed to sign image URL",imagePath,error);
      return null;
    }
    return data.signedUrl;
  }catch(err){
    console.warn("[StoryLibrary] Error signing URL",imagePath,err);
    return null;
  }
}

// New deterministic resolver based on ImageId + story created_at
async function findImageByImageId(imageId:string,storyCreatedAt?:string):Promise<string|null>{
  if(!imageId)return null;
  const trimmed=imageId.trim();

  // If already looks like a full path inside the bucket, try directly
  if(trimmed.includes("/")){
    const direct=await getSignedCoverUrl(trimmed);
    if(direct){
      console.log("[StoryLibrary] ImageId is full path, using direct match:",trimmed);
      return direct;
    }
  }

  // Derive year/month from story created_at (same day as image)
  const baseDate=storyCreatedAt?new Date(storyCreatedAt):new Date();
  const yyyy=baseDate.getUTCFullYear().toString();
  const mm=(baseDate.getUTCMonth()+1).toString().padStart(2,"0");

  const filenameCandidates=new Set<string>();

  // If caller already passed filename with extension
  if(/\.(png|jpg|jpeg|webp)$/i.test(trimmed)){
    filenameCandidates.add(trimmed);
  }

  // Core id (strip stories- and extension)
  const core=trimmed
    .replace(/^stories-/i,"")
    .replace(/\.(png|jpg|jpeg|webp)$/i,"");

  if(core){
    filenameCandidates.add(`${core}.png`);
    filenameCandidates.add(`stories-${core}.png`);
  }

  // First: deterministic MagicStoryMaker layout
  for(const fname of filenameCandidates){
    const path=`magic-stories/other/stories/${yyyy}/${mm}/${fname}`;
    const url=await getSignedCoverUrl(path);
    if(url){
      console.log("[StoryLibrary] ImageId match via YYYY/MM path:",path);
      return url;
    }
  }

  // Second: looser prefixes if structure ever changes
  const prefixes=[
    "magic-stories/other/stories",
    "magic-stories/other"
  ];
  for(const fname of filenameCandidates){
    for(const prefix of prefixes){
      const path=`${prefix}/${fname}`;
      const url=await getSignedCoverUrl(path);
      if(url){
        console.log("[StoryLibrary] ImageId match via loose prefix:",path);
        return url;
      }
    }
  }

  console.warn("[StoryLibrary] No image match for ImageId",imageId);
  return null;
}

/* ------------ Hardcoded mappings for older, legacy stories ----------- */

async function findImageForLegacyStory(storyFileName:string):Promise<string|null>{
  const id=storyFileName.replace(/\.txt$/,"");

  const existingMappings:Record<string,string>={
    "adventure-story-friends-bc5d9653-2435-4955-a91e-726e5b29f528":
      "stories-1d1aeaeb-15a1-46ce-9938-9794a9d8e6fe.png",
    "funny-story-rabbit-and-turtle-832bf940-db2c-4a9e-b67a-58bc35fbdad0":
      "58bc35fbdad0.png",
    "story-with-a-moral-monkey-and-crocodile-4352d7e0-a942-4b7c-90fb-e2e9e097868b":
      "1de0ec240ae2.png",
    "story-with-a-moral-monkey-and-crocodile-800ada36-7b09-4122-a4e6-1de0ec240ae2":
      "e2e9e097868b.png",
    "panchatantra-style-story-owl-fox-tiger-0e8a6016-ba68-4451-9c98-e2f35829f0c5":
      "stories-9f34baf6-0a44-4621-b16d-7852f119bedc.png",
    "adventure-story-midnight-library-adventure-f2ca687a-e46d-43ec-a5eb-a4e4c753848b":
      "stories-4b0fa068-477a-42cf-95a4-620d6a479197.png",

    "adventure-story-the-golden-eggs-23b0f453-55d7-46b7-9bda-fb245e7a2785":
      "stories-7b88c0d7-a2ea-4a57-a242-d6235bd265ac.png",

    "panchatantra-style-story-the-four-friends-and-the-hunter-is-abou-4c667e1e-98bb-4176-92c1-5c55fe057a8e":
      "stories-a1cb0790-eeb6-4f7e-be2a-f6c303963f9e.png",

    "adventure-story-discover-a-magical-wishing-well-that-gra-04e7046a-9ac9-4899-8371-b90adf7df71c":
      "stories-31bc09fb-4a44-430e-9699-fbe95812d5bf.png",

    "adventure-story-milo-the-lost-mammoth-8ad688d9-19a5-4754-866c-8152b362557f":
      "stories-c06a3f54-489d-4099-b8f9-7b3178e2ca3c.png",
    "animal-story-panda-express-delivery-service-a02de559-63e7-415b-86db-dfd90aa75d39":
      "stories-bc2468b1-4be2-49f8-80a4-e8c3a012f7ac.png",
    "animal-story-the-lost-emperor-egg-c0f87d96-0bd3-4671-a460-f879ddf21e4c":
      "stories-d69a4ddb-282f-45d1-b622-72cf9bf32b07.png",

    "animal-story-polar-bear-who-couldn-t-swim-36ce3402-a773-476b-b137-e292bb5edccc":
      "long-tale-polar-bear-512.png",
    "animal-story-polar-bear-who-couldn-t-swim-98f5a6f4-4756-4450-aa0d-3cee6da02de6":
      "koda-courageous-swim-512.png",

    "fantasy-story-untitled-story-idea-8334d0c8-854c-4737-b713-d93f50c38089":
      "TheLittleCloudWhoLovedColors.png",

    "animal-story-untitled-story-idea-80e59431-4628-4a07-a43c-add6c58a77e9":
      "BennyandtheBrightBlueButterfly.png"
  };

  const baseFilename=existingMappings[id];
  if(!baseFilename){
    return null;
  }

  console.log("[StoryLibrary] Using legacy mapping for",id,"→",baseFilename);

  const now=new Date();
  const yyyy=now.getUTCFullYear().toString();
  const mm=(now.getUTCMonth()+1).toString().padStart(2,"0");

  const candidates:string[]=[
    `magic-stories/other/stories/${yyyy}/${mm}/${baseFilename}`,
    `magic-stories/other/stories/${yyyy}/${baseFilename}`,
    `magic-stories/other/stories/${baseFilename}`,
    `magic-stories/other/${baseFilename}`,
    baseFilename
  ];

  for(const path of candidates){
    const url=await getSignedCoverUrl(path);
    if(url){
      console.log("[StoryLibrary] Legacy image resolved at",path);
      return url;
    }
  }

  console.warn("[StoryLibrary] Legacy mapping did not find any existing object for",id);
  return null;
}

/* ---------------------------- Component ----------------------------- */

export default function StoryLibrary(){
  const [items,setItems]=useState<StoryListItem[]>([]);
  const [active,setActive]=useState<ParsedStory|null>(null);
  const [activePath,setActivePath]=useState<string|undefined>();
  const [activeCover,setActiveCover]=useState<string|undefined>();
  const [loading,setLoading]=useState(false);
  const [loadingStory,setLoadingStory]=useState(false);
  const [childName,setChildName]=useState<string>("friend");
  const [searchQuery,setSearchQuery]=useState("");
  const [filterType,setFilterType]=useState("all");
  const [readerMode,setReaderMode]=useState(false);
  const [isSpeaking,setIsSpeaking]=useState(false);
  const [language,setLanguage]=useState<StoryLanguage>("en");

  const [translatedBody,setTranslatedBody]=useState<string|undefined>();
  const [translatedMoral,setTranslatedMoral]=useState<string|undefined>();
  const [translating,setTranslating]=useState(false);

  const [liked,setLiked]=useState<Record<string,boolean>>({});
  const [downloadingPath,setDownloadingPath]=useState<string|undefined>();
  const [showImageModal,setShowImageModal]=useState(false);

  // 🔊 Background music
  const [bgmEnabled,setBgmEnabled]=useState(true);
  const bgmRef=useRef<HTMLAudioElement|null>(null);

  // 🎙️ Prefer female voice toggle
  const [preferFemaleVoice,setPreferFemaleVoice]=useState(true);

  function getOrCreateBgm(){
    if(!bgmRef.current){
      try{
        const audio=new Audio(BGM_URL);
        audio.loop=true;
        audio.volume=0.25;
        bgmRef.current=audio;
      }catch(e){
        console.warn("[StoryLibrary] Could not create BGM audio",e);
      }
    }
    return bgmRef.current;
  }

  function startBgm(){
    try{
      const audio=getOrCreateBgm();
      if(!audio)return;
      audio.currentTime=0;
      const p=audio.play();
      if(p&&typeof p.catch==="function"){
        p.catch((err)=>console.warn("[StoryLibrary] BGM play blocked",err));
      }
    }catch(e){
      console.warn("[StoryLibrary] BGM play error",e);
    }
  }

  function stopBgm(){
    try{
      const audio=bgmRef.current;
      if(audio){
        audio.pause();
        audio.currentTime=0;
      }
    }catch(e){
      console.warn("[StoryLibrary] BGM stop error",e);
    }
  }

  function stopSpeech(){
    try{
      if(typeof window!=="undefined"&&"speechSynthesis"in window){
        window.speechSynthesis.cancel();
      }
    }catch{
      // ignore
    }
    stopBgm();
  }

  useEffect(()=>{
    let alive=true;

    (async()=>{
      setLoading(true);
      try{
        try{
          const brief=await fetchChildBrief();
          if(brief&&alive){
            const friendly=(brief as any).nick_name||(brief as any).first_name||(brief as any).name;
            if(friendly){setChildName(friendly);}
          }
        }catch(e){
          console.info("[StoryLibrary] fetchChildBrief failed (non-fatal)",e);
        }

        await loadStories(alive);
      }catch(e){
        console.error("[StoryLibrary] load failed",e);
        toast.error("Could not load stories",{description:String(e)});
      }finally{
        if(alive)setLoading(false);
      }
    })();

    return()=>{
      alive=false;
      stopSpeech();
    };
  },[]);

  async function loadStories(alive:boolean=true){
    try{
      console.log("[StoryLibrary] Starting to load stories...");
      const {data:files,error}=await supabase.storage
        .from(STORY_BUCKET)
        .list(SHARED_FOLDER,{
          limit:100,
          offset:0,
          sortBy:{column:"created_at",order:"desc"}
        });

      console.log("[StoryLibrary] Storage list result:",{files,error});

      if(error){
        throw error;
      }
      if(!files||files.length===0){
        if(alive)setItems([]);
        return;
      }

      const baseItems:StoryListItem[]=files
        .filter((file)=>file.name.endsWith(".txt"))
        .map((file)=>({
          path:`${SHARED_FOLDER}/${file.name}`,
          name:file.name,
          created_at:file.created_at,
          owner:SHARED_FOLDER
        }));

      console.log("[StoryLibrary] Processed story items:",baseItems);

      const withCovers=await hydrateCovers(baseItems);
      if(alive){
        setItems(withCovers);
        toast.success(`Loaded ${baseItems.length} stories ✨`);
      }
    }catch(err){
      console.error("[StoryLibrary] loadStories error",err);
      toast.error("Could not load stories");
      if(alive)setItems([]);
    }
  }

  async function hydrateCovers(baseItems:StoryListItem[]):Promise<StoryListItem[]>{
    if(!baseItems.length)return baseItems;

    const out:StoryListItem[]=[];
    for(const item of baseItems){
      let coverUrl:string|null=null;
      let titleFromFile:string|undefined;
      let typeLabelFromFile:string|undefined;
      let topicFromFile:string|undefined;
      let preview:string|undefined;
      let wordCount:number|undefined;
      let readMinutes:number|undefined;

      try{
        console.log("[StoryLibrary] Hydrating story from file:",item.name);
        const {data:storyFile,error:downloadError}=await supabase.storage
          .from(STORY_BUCKET)
          .download(item.path);

        if(downloadError||!storyFile){
          console.warn("[StoryLibrary] Could not download story file:",downloadError);
        }else{
          const storyContent=await storyFile.text();
          const parsed=parseStoryFile(storyContent);

          titleFromFile=parsed.title||undefined;
          typeLabelFromFile=parsed.type||undefined;
          topicFromFile=parsed.topic||undefined;
          preview=buildPreview(parsed.body);

          const wc=countWords(parsed.body);
          if(wc>0){
            wordCount=wc;
            readMinutes=Math.max(1,Math.round(wc/WORDS_PER_MINUTE));
          }

          if(parsed.imageId){
            coverUrl=await findImageByImageId(parsed.imageId,item.created_at);
          }
        }

        if(!coverUrl){
          coverUrl=await findImageForLegacyStory(item.name);
        }
      }catch(e){
        console.warn("[StoryLibrary] hydrateCovers failure for",item.name,e);
      }

      out.push({
        ...item,
        coverUrl,
        title:titleFromFile,
        typeLabel:typeLabelFromFile,
        topic:topicFromFile,
        preview,
        wordCount,
        readMinutes
      });
    }

    console.log("[StoryLibrary] Final items with covers:",out);
    return out;
  }

  function buildPreview(body:string):string{
    const clean=body.replace(/\s+/g," ").trim();
    if(!clean)return"";
    if(clean.length<=260)return clean;
    const slice=clean.slice(0,260);
    const lastSentence=Math.max(
      slice.lastIndexOf("."),
      slice.lastIndexOf("!"),
      slice.lastIndexOf("?")
    );
    if(lastSentence>180){
      return slice.slice(0,lastSentence+1);
    }
    const lastSpace=slice.lastIndexOf(" ");
    if(lastSpace>150){
      return slice.slice(0,lastSpace)+"…";
    }
    return slice+"…";
  }

  async function handleRefresh(){
    setLoading(true);
    try{
      await loadStories(true);
    }finally{
      setLoading(false);
    }
  }

  async function ensureHindiTranslation(story:ParsedStory,path?:string):Promise<HindiPayload>{
    if(!story||!path)return{};

    if(translatedBody||translatedMoral){
      return{body_hi:translatedBody,moral_hi:translatedMoral};
    }

    try{
      setTranslating(true);
      const {data,error}=await supabase.functions.invoke("translate-story",{
        body:{
          path,
          text:story.body,
          moral:story.moral,
          target_lang:"hi"
        }
      });

      if(error){
        console.error("[StoryLibrary] translate error",error);
        toast.error("Could not translate this story to Hindi right now.");
        return{};
      }

      const payload=data as HindiPayload|null;

      if(payload?.body_hi){
        setTranslatedBody(payload.body_hi);
      }
      if(typeof payload?.moral_hi==="string"){
        setTranslatedMoral(payload.moral_hi);
      }

      return payload||{};
    }catch(e){
      console.error("[StoryLibrary] translate error",e);
      toast.error("Could not translate this story to Hindi right now.");
      return{};
    }finally{
      setTranslating(false);
    }
  }

  async function openStory(item:StoryListItem){
    console.log("[StoryLibrary] Opening story:",item);
    setActivePath(item.path);
    setActiveCover(item.coverUrl||undefined);
    setShowImageModal(false);
    setLoadingStory(true);
    stopSpeech();
    setIsSpeaking(false);
    setLanguage("en");
    setTranslatedBody(undefined);
    setTranslatedMoral(undefined);

    try{
      const {data,error}=await supabase.storage
        .from(STORY_BUCKET)
        .download(item.path);

      if(error)throw new Error(`Download failed: ${error.message}`);
      if(!data)throw new Error("No story content retrieved");

      const storyContent=await data.text();
      const parsed=parseStoryFile(storyContent);

      if(parsed.imageId&&!item.coverUrl){
        const imageUrl=await findImageByImageId(parsed.imageId,item.created_at);
        if(imageUrl){
          setActiveCover(imageUrl);
        }
      }

      setActive(parsed);
      setReaderMode(true);
      toast.success("Story opened successfully! 📖");
    }catch(err){
      console.error("[StoryLibrary] openStory error",err);
      toast.error("Could not read story",{
        description:err instanceof Error?err.message:String(err)
      });
    }finally{
      setLoadingStory(false);
    }
  }

  function closeReader(){
    setReaderMode(false);
    setActive(null);
    setActivePath(undefined);
    setActiveCover(undefined);
    setShowImageModal(false);
    stopSpeech();
    setIsSpeaking(false);
    setTranslatedBody(undefined);
    setTranslatedMoral(undefined);
    setLanguage("en");
  }

  // helper to bias voices toward female if toggle is on
  function pickPreferredVoice(candidates:SpeechSynthesisVoice[]):SpeechSynthesisVoice|undefined{
    if(!candidates.length)return undefined;
    if(preferFemaleVoice){
      const female=candidates.find((v)=>/female|woman|girl|zira|sara|samantha|emma|joanna|sonia|rani/i.test(v.name));
      if(female)return female;
    }
    return candidates[0];
  }

  async function handleToggleVoice(){
    if(!active)return;
    if(typeof window==="undefined"||!("speechSynthesis"in window)){
      toast.error("This device does not support story voice yet.");
      return;
    }

    if(isSpeaking){
      stopSpeech();
      setIsSpeaking(false);
      return;
    }

    try{
      const synth=window.speechSynthesis;
      const voices=synth.getVoices()||[];

      const hiVoices=voices.filter((v)=>/hi[-_]/i.test(v.lang));
      const enVoices=voices.filter((v)=>/^en[-_]/i.test(v.lang));

      console.log(
        "[StoryLibrary] voices:",
        voices.map((v)=>`${v.name} (${v.lang})`)
      );

      let speakLang:StoryLanguage=language;
      let bodyText:string;
      let moralText:string;

      if(language==="hi"&&!hiVoices.length){
        speakLang="en";
        bodyText=getStoryBodyForLanguage(active,"en");
        moralText=getMoralForLanguage(active,"en");
        toast.info("Hindi voice is not installed on this device; reading the English version instead.");
      }else if(language==="hi"&&activePath){
        const payload=await ensureHindiTranslation(active,activePath);
        const effectiveBody=payload.body_hi||translatedBody||active.body;
        const effectiveMoral=(typeof payload.moral_hi==="string"
          ?payload.moral_hi
          :translatedMoral)||active.moral||"";

        bodyText=effectiveBody;
        moralText=getMoralForLanguage(active,"hi",effectiveMoral);
      }else{
        bodyText=getStoryBodyForLanguage(active,"en",translatedBody);
        moralText=getMoralForLanguage(active,"en",translatedMoral);
      }

      const text=`${active.title}. ${bodyText}${moralText?`\n\n${moralText}`:""}`;
      if(!text.trim()){
        toast.error("There is no story text to read aloud.");
        return;
      }

      const utter=new SpeechSynthesisUtterance(text);

      if(speakLang==="hi"){
        const chosenHi=pickPreferredVoice(hiVoices);
        if(chosenHi){
          utter.voice=chosenHi;
          utter.lang=chosenHi.lang;
        }else if(enVoices[0]){
          utter.voice=enVoices[0];
          utter.lang=enVoices[0].lang;
        }else{
          utter.lang="hi-IN";
        }
      }else{
        const chosenEn=pickPreferredVoice(enVoices);
        if(chosenEn){
          utter.voice=chosenEn;
          utter.lang=chosenEn.lang;
        }else if(hiVoices[0]){
          utter.voice=hiVoices[0];
          utter.lang=hiVoices[0].lang;
        }else{
          utter.lang="en-US";
        }
      }

      utter.rate=0.95;
      utter.pitch=preferFemaleVoice?1.05:1;

      utter.onend=()=>{
        setIsSpeaking(false);
        stopBgm();
      };
      utter.onerror=(ev)=>{
        console.warn("[StoryLibrary] voice error",ev);
        setIsSpeaking(false);
        stopBgm();
        toast.error("Your browser could not play the story voice.");
      };

      setIsSpeaking(true);
      synth.cancel();
      if(bgmEnabled){
        startBgm();
      }
      synth.speak(utter);
    }catch(e){
      console.warn("[StoryLibrary] voice error",e);
      setIsSpeaking(false);
      stopBgm();
      toast.error("Could not play story voice right now.");
    }
  }

  function jumpToMarker(){
    try{
      const el=document.getElementById("continue-marker");
      if(el){
        el.scrollIntoView({behavior:"smooth",block:"start"});
      }else{
        toast.info("We'll show a continue marker in longer stories.");
      }
    }catch{
      // ignore
    }
  }

  function toggleLike(path:string){
    setLiked((prev)=>({
      ...prev,
      [path]:!prev[path]
    }));
  }

  async function handleShareStory(title:string){
    try{
      if(typeof window==="undefined"||typeof navigator==="undefined"){
        return;
      }
      const shareUrl=window.location.href;
      if((navigator as any).share){
        await (navigator as any).share({
          title,
          text:"Check out this cozy DailyPromise story!",
          url:shareUrl
        });
      }else if(navigator.clipboard){
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Story link copied to clipboard.");
      }else{
        toast.info("Sharing is not supported in this browser.");
      }
    }catch(e){
      console.warn("[StoryLibrary] share error",e);
    }
  }

  async function handleDownloadStory(path:string,title?:string){
    try{
      setDownloadingPath(path);
      const {data,error}=await supabase.storage
        .from(STORY_BUCKET)
        .createSignedUrl(path,60);
      if(error||!data?.signedUrl){
        throw error||new Error("No signed URL");
      }

      if(typeof window!=="undefined"){
        const a=document.createElement("a");
        a.href=data.signedUrl;
        a.download=(title||"story")+".txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      toast.success("Story download started.");
    }catch(e){
      console.error("[StoryLibrary] download error",e);
      toast.error("Could not download this story right now.");
    }finally{
      setDownloadingPath(undefined);
    }
  }

  function handleDownloadPdfStory(story:ParsedStory,coverUrl?:string,fileName?:string){
    try{
      if(typeof window==="undefined"){
        return;
      }
      const win=window.open("","_blank","noopener,noreferrer");
      if(!win){
        toast.error("Please allow pop-ups to save the story as PDF.");
        return;
      }

      const escapeHtml=(s:string)=>s
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");

      const title=escapeHtml(story.title);
      const bodyHtml=escapeHtml(story.body).replace(/\n/g,"<br/>");
      const moralText=story.moral?getMoralForLanguage(story,"en"):undefined;
      const moralHtml=moralText?escapeHtml(moralText).replace(/\n/g,"<br/>"):"";

      const docTitle=fileName||"DailyPromise-story";

      win.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;}
    body{
      margin:0;
      padding:32px 24px;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:#ffffff;
      color:#111827;
    }
    .page{
      max-width:900px;
      margin:0 auto;
    }
    h1{
      font-size:28px;
      line-height:1.2;
      margin:0 0 16px;
      text-align:center;
    }
    .meta{
      text-align:center;
      margin-bottom:24px;
      color:#6b7280;
      font-size:14px;
    }
    .cover{
      margin:0 auto 24px;
      border-radius:24px;
      overflow:hidden;
      box-shadow:0 18px 40px rgba(15,23,42,0.25);
    }
    .cover img{
      width:100%;
      height:auto;
      display:block;
    }
    .body{
      font-size:16px;
      line-height:1.7;
      white-space:pre-wrap;
    }
    .moral{
      margin-top:24px;
      padding:16px 20px;
      border-left:4px solid #f59e0b;
      background:#fffbeb;
      border-radius:8px;
      font-size:15px;
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>${title}</h1>
    <div class="meta">DailyPromise Story</div>
    ${coverUrl?`<div class="cover"><img src="${coverUrl}" alt="${title}" /></div>`:""}
    <div class="body">${bodyHtml}</div>
    ${moralHtml?`<div class="moral"><strong>Moral of the story:</strong><br/>${moralHtml}</div>`:""}
  </div>
</body>
</html>
      `);
      win.document.close();
      win.document.title=docTitle;
      setTimeout(()=>{
        win.focus();
        win.print();
        toast.info("Use “Save as PDF” in the print dialog to keep this story.");
      },300);
    }catch(e){
      console.error("[StoryLibrary] PDF download error",e);
      toast.error("Could not prepare the PDF right now.");
    }
  }

  const filteredStories=items.filter((item)=>{
    const {label,type}=describeStoryName(item.name,item.owner);
    const effectiveTitle=item.title||label;
    const effectiveType=item.typeLabel||type;
    const haystack=[
      effectiveTitle,
      item.topic||"",
      item.preview||""
    ].join(" ").toLowerCase();
    const matchesSearch=haystack.includes(searchQuery.toLowerCase());
    const matchesFilter=filterType==="all"||effectiveType.toLowerCase().includes(filterType.toLowerCase());
    return matchesSearch&&matchesFilter;
  });

  const storyTypes=[...new Set(
    items.map((item)=>{
      const {type}=describeStoryName(item.name,item.owner);
      return item.typeLabel||type;
    })
  )];

  const friendlyName=childName||"friend";

  /* ------------------- Reader Mode View ------------------- */

  if(readerMode&&active){
    const storyBody=getStoryBodyForLanguage(active,language,translatedBody);
    const wordCount=countWords(storyBody);
    const readMinutes=wordCount?Math.max(1,Math.round(wordCount/WORDS_PER_MINUTE)):0;
    const showMarker=wordCount>300;
    const activeKey=activePath||"";

    return(
      <div className="relative -m-4 sm:-m-6 md:-m-8 min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-purple-600/25 blur-3xl" />
          <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
        </div>

        <header className="relative bg-slate-950/80 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <button
                  onClick={closeReader}
                  className="flex items-center gap-2 text-amber-100 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-800"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="font-semibold text-sm sm:text-base">Back to Library</span>
                </button>
                <div className="hidden sm:block h-8 w-px bg-slate-700" />
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg md:text-xl font-bold text-white truncate">
                    {active.title}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-2">
                    {active.type&&<span>{active.type}</span>}
                    {active.topic&&<span>• {active.topic}</span>}
                    {wordCount>0&&(
                      <span className="inline-flex items-center gap-1 bg-slate-900 px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold text-amber-200 border border-slate-700">
                        <Clock3 className="h-3 w-3" />
                        {readMinutes}-min read
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center flex-wrap gap-2 sm:gap-3 justify-end">
                {/* Language selector */}
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-[11px] font-semibold text-slate-300">
                    Language
                  </span>
                  <select
                    value={language}
                    onChange={async(e)=>{
                      const lang=e.target.value as StoryLanguage;
                      stopSpeech();
                      setIsSpeaking(false);
                      setLanguage(lang);
                      if(lang==="hi"&&active){
                        await ensureHindiTranslation(active,activePath);
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-900 text-white border border-slate-600 rounded-full text-[11px] sm:text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  >
                    <option value="en" className="bg-white text-slate-900">English</option>
                    <option value="hi" className="bg-white text-slate-900">Hindi</option>
                  </select>
                  {translating&&language==="hi"&&(
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-amber-200">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Translating…
                    </span>
                  )}
                </div>

                {/* 🎙️ Female voice toggle */}
                <div className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-300">
                  <span className="hidden sm:inline font-semibold">
                    Voice
                  </span>
                  <button
                    type="button"
                    onClick={()=>{
                      setPreferFemaleVoice((prev)=>!prev);
                    }}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] sm:text-[11px] font-semibold ${
                      preferFemaleVoice
                        ?"bg-pink-500/20 text-pink-100 border-pink-400/60"
                        :"bg-slate-900 text-slate-400 border-slate-600"
                    }`}
                    aria-pressed={preferFemaleVoice}
                  >
                    <span className="mr-1 hidden sm:inline">
                      {preferFemaleVoice?"Female":"Default"}
                    </span>
                    <span>{preferFemaleVoice?"♀":"◎"}</span>
                  </button>
                </div>

                {/* 🔊 Background music toggle */}
                <div className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-300">
                  <span className="hidden sm:inline font-semibold">
                    Background music
                  </span>
                  <button
                    type="button"
                    onClick={()=>{
                      setBgmEnabled((prev)=>{
                        const next=!prev;
                        if(!next){
                          stopBgm();
                        }else if(isSpeaking){
                          startBgm();
                        }
                        return next;
                      });
                    }}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] sm:text-[11px] font-semibold ${
                      bgmEnabled
                        ?"bg-emerald-500/20 text-emerald-100 border-emerald-400/60"
                        :"bg-slate-900 text-slate-400 border-slate-600"
                    }`}
                    aria-pressed={bgmEnabled}
                  >
                    <span className="mr-1 hidden sm:inline">Music:</span>
                    <span>{bgmEnabled?"On":"Off"}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={jumpToMarker}
                    className={`hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold border ${
                      showMarker
                        ?"bg-amber-500/10 text-amber-100 border-amber-300/50"
                        :"bg-slate-900 text-slate-400 border-slate-700"
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    Continue
                  </button>

                  <button
                    onClick={handleToggleVoice}
                    className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 text-amber-100 border border-amber-300/60 px-3 py-1.5 text-[11px] sm:text-xs font-semibold hover:bg-amber-500/20"
                  >
                    {isSpeaking?(
                      <>
                        <VolumeX className="h-4 w-4" />
                        <span className="hidden sm:inline">Stop voice</span>
                      </>
                    ):(
                      <>
                        <Volume2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Read aloud</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={()=>{
                        toggleLike(activeKey);
                      }}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900/90 text-rose-200/90 hover:text-rose-300 border border-slate-700 px-3 h-8 text-[11px] gap-1"
                      aria-pressed={!!liked[activeKey]}
                    >
                      <Heart
                        className="h-4 w-4"
                        fill={liked[activeKey]?"#fb7185":"none"}
                      />
                      <span className="hidden sm:inline">Like</span>
                    </button>
                    <button
                      onClick={async()=>{
                        await handleShareStory(active.title);
                      }}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900/90 text-slate-100 hover:text-white border border-slate-700 px-3 h-8 text-[11px] gap-1"
                    >
                      <Share2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                    <button
                      onClick={()=>{
                        handleDownloadPdfStory(active,activeCover,active.title);
                      }}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900/90 text-slate-100 hover:text-white border border-slate-700 px-3 h-8 text-[11px] gap-1"
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">PDF</span>
                    </button>
                  </div>

                  <button
                    onClick={closeReader}
                    className="p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8" lang={language==="en"?"en":"hi"}>
          <div className="bg-white rounded-3xl shadow-2xl border border-amber-200 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-400 to-orange-400 p-6 sm:p-8 text-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 font-serif">
                {active.title}
              </h1>
              <div className="flex flex-wrap justify-center gap-3 sm:gap-4 text-amber-100 text-xs sm:text-sm">
                {active.type&&(
                  <span className="bg-white/20 px-4 py-2 rounded-full font-semibold backdrop-blur-sm">
                    {active.type}
                  </span>
                )}
                {active.topic&&(
                  <span className="bg-white/20 px-4 py-2 rounded-full font-semibold backdrop-blur-sm">
                    {active.topic}
                  </span>
                )}
                {wordCount>0&&(
                  <span className="bg-white/20 px-4 py-2 rounded-full font-semibold backdrop-blur-sm inline-flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />
                    {readMinutes}-minute cozy read
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 sm:p-8 md:p-10">
              {activeCover&&(
                <div className="mb-6 sm:mb-8 text-center">
                  <img
                    src={activeCover}
                    alt={active.title}
                    className="mx-auto w-full max-w-3xl max-h-[420px] md:max-h-[480px] object-cover rounded-2xl shadow-lg border border-amber-200 cursor-zoom-in"
                    onClick={()=>{
                      setShowImageModal(true);
                    }}
                    onError={(e)=>{
                      console.warn("Cover image failed to load:",activeCover);
                      (e.currentTarget as HTMLImageElement).style.display="none";
                    }}
                  />
                  <p className="mt-2 text-xs sm:text-sm text-slate-500">
                    Tap the picture to view it in full size.
                  </p>
                </div>
              )}
              <div className="prose prose-lg max-w-none font-serif">
                <div
                  className={`text-gray-800 leading-relaxed text-base sm:text-lg md:text-xl ${
                    language==="hi"?"font-devanagari":""
                  }`}
                >
                  {renderStoryBodyWithMarker(storyBody,showMarker)}
                </div>

                {(active.moral||translatedMoral)&&(
                  <div className="mt-10 sm:mt-12 p-5 sm:p-6 bg-gradient-to-r from-amber-50 to-yellow-50 border-l-4 border-amber-400 rounded-r-lg">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-6 w-6 text-amber-500 mt-1 flex-shrink-0" />
                      <div>
                        <h3 className="text-amber-800 font-bold text-lg mb-2">Moral of the Story</h3>
                        <p
                          className={`text-amber-700 text-base sm:text-lg leading-relaxed ${
                            language==="hi"?"font-devanagari":""
                          }`}
                        >
                          {getMoralForLanguage(active,language,translatedMoral)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-amber-100 bg-amber-50/50 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 text-amber-700">
                <div className="flex items-center gap-2">
                  <BookText className="h-5 w-5" />
                  <span className="text-sm">
                    Enjoyed this cozy story? Pick another adventure from your library.
                  </span>
                </div>
                <button
                  onClick={closeReader}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-5 sm:px-6 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 text-sm"
                >
                  <BookOpen className="h-4 w-4" />
                  Read Another Story
                </button>
              </div>
            </div>
          </div>
        </div>

        {showImageModal&&activeCover&&(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
            onClick={()=>{
              setShowImageModal(false);
            }}
          >
            <div
              className="relative max-w-3xl w-full max-h-[85vh]"
              onClick={(e)=>{
                e.stopPropagation();
              }}
            >
              <button
                onClick={()=>{
                  setShowImageModal(false);
                }}
                className="absolute -top-3 -right-3 bg-slate-900 text-slate-100 rounded-full p-1.5 shadow-lg border border-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={activeCover}
                alt={active.title}
                className="w-full h-full object-contain rounded-3xl shadow-2xl border border-slate-700 bg-slate-900"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ------------------- Library Grid View ------------------- */

  return(
    <div className="relative -m-4 sm:-m-6 md:-m-8 min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-purple-600/25 blur-3xl" />
        <div className="absolute top-1/2 -right-32 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
        <div className="text-center mb-10 sm:mb-12">
          <div className="flex items-center justify-center gap-4 mb-5 sm:mb-6">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-2xl shadow-orange-500/40">
              <LibraryBig className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-yellow-300 via-orange-300 to-pink-300 bg-clip-text text-transparent">
                Your Story Collection
              </h1>
              <p className="mt-2 text-sm sm:text-base text-blue-100">
                Magical adventures for {friendlyName} — ready to read anytime.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
            <div className="flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-emerald-400" />
              <div>
                <p className="text-xl font-bold text-white">{items.length}</p>
                <p className="text-blue-200 text-xs sm:text-sm">Total Stories</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
            <div className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-purple-400" />
              <div>
                <p className="text-xl font-bold text-white">{storyTypes.length}</p>
                <p className="text-blue-200 text-xs sm:text-sm">Story Types</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
            <div className="flex items-center gap-3">
              <Bookmark className="h-7 w-7 text-yellow-400" />
              <div>
                <p className="text-xl font-bold text-white">
                  {items.filter((item)=>item.owner==="public").length}
                </p>
                <p className="text-blue-200 text-xs sm:text-sm">Shared Stories</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 sm:gap-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 sm:py-3 px-4 rounded-xl transition-all duration-200 transform hover:translate-y-0.5"
            >
              {loading?(
                <Loader2 className="h-5 w-5 animate-spin" />
              ):(
                <RefreshCw className="h-5 w-5" />
              )}
              <span className="text-sm sm:text-base">Refresh Library</span>
            </button>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 sm:p-6 mb-8 border border-white/10">
          <div className="flex flex-col md:flex-row gap-4 md:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
              <input
                type="text"
                placeholder="Search stories by title, topic, or a phrase..."
                value={searchQuery}
                onChange={(e)=>setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-slate-900/80 text-white border border-white/15 rounded-xl placeholder-slate-400 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2 items-center">
              <Filter className="h-5 w-5 text-slate-300" />
              <select
                value={filterType}
                onChange={(e)=>setFilterType(e.target.value)}
                className="px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-900 text-white border border-white/15 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              >
                <option value="all" className="bg-white text-slate-900">All Types</option>
                {storyTypes.map((type)=>(

                  <option key={type} value={type.toLowerCase()} className="bg-white text-slate-900">
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 sm:p-6 border border-white/10">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-5 sm:mb-6 flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-blue-400" />
            Your Story Collection
            <span className="text-xs sm:text-sm font-normal text-gray-300 ml-1 sm:ml-2">
              ({filteredStories.length} stories)
            </span>
          </h2>

          {filteredStories.length===0?(
            <div className="text-center py-10 sm:py-12">
              <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center mx-auto mb-4 shadow-2xl">
                <Sparkles className="h-10 w-10 sm:h-12 sm:w-12 text-white" />
              </div>
              <p className="text-gray-200 text-base sm:text-lg mb-2">No stories found</p>
              <p className="text-gray-400 text-sm sm:text-base">
                {searchQuery||filterType!=="all"
                  ?"Try adjusting your search or filters."
                  :"Your story shelf is ready — new adventures will appear here soon!"}
              </p>
            </div>
          ):(
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
              {filteredStories.map((item)=>{
                const {label,type,badge}=describeStoryName(item.name,item.owner);
                const isActive=activePath===item.path;
                const displayTitle=item.title||label;
                const displayType=item.typeLabel||type;
                const readMinutes=item.readMinutes;
                const isLiked=!!liked[item.path];

                return(
                  <div
                    key={item.path}
                    className={`group cursor-pointer transform transition-all duration-300 hover:translate-y-1 ${
                      isActive?"ring-2 ring-yellow-400/80 ring-offset-2 ring-offset-slate-950":""
                    }`}
                    onClick={()=>openStory(item)}
                  >
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl p-5 sm:p-6 border border-white/10 hover:border-white/30 transition-all duration-300 h-full flex flex-col shadow-xl shadow-black/40">
                      <div className="flex items-start gap-4 mb-4 flex-1">
                        <div className="hidden sm:block w-1.5 h-20 rounded-full bg-gradient-to-b from-yellow-400 to-orange-500 shadow-lg" />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="px-3 py-1 bg-blue-500/15 text-blue-200 text-[11px] rounded-full border border-blue-500/30 font-semibold">
                              {badge}
                            </span>
                            <span className="px-3 py-1 bg-purple-500/15 text-purple-200 text-[11px] rounded-full border border-purple-500/30 font-semibold">
                              {displayType}
                            </span>
                            {readMinutes&&(
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 text-amber-200 text-[11px] rounded-full border border-amber-400/40 font-semibold">
                                <Clock3 className="h-3 w-3" />
                                {readMinutes}-min read
                              </span>
                            )}
                          </div>
                          <h3 className="text-white font-bold text-lg sm:text-xl leading-tight mb-1 line-clamp-2 font-serif">
                            {displayTitle}
                          </h3>
                          {item.topic&&(
                            <p className="text-[11px] text-gray-300 mb-1 line-clamp-1">
                              {item.topic}
                            </p>
                          )}
                          {item.preview&&(
                            <p className="text-xs text-gray-300 line-clamp-3 mt-1">
                              {item.preview}
                            </p>
                          )}
                        </div>
                      </div>

                      {item.coverUrl&&(
                        <div className="mb-4 h-32 rounded-xl overflow-hidden border border-white/20 bg-slate-800/60">
                          <img
                            src={item.coverUrl}
                            alt={displayTitle}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e)=>{
                              console.warn("Cover image failed to load for story card:",item.coverUrl);
                              (e.currentTarget as HTMLImageElement).style.display="none";
                            }}
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-white/10 gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-gray-400 text-xs sm:text-sm">
                            {new Date(item.created_at).toLocaleDateString("en-US",{
                              month:"short",
                              day:"numeric",
                              year:"numeric"
                            })}
                          </span>
                          {readMinutes&&(
                            <span className="text-gray-300 text-[11px] inline-flex items-center gap-1">
                              <Clock3 className="h-3 w-3" />
                              {readMinutes}-minute read
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e)=>{
                                e.stopPropagation();
                                toggleLike(item.path);
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-slate-900 text-rose-200/80 hover:text-rose-300 border border-slate-700 h-8 w-8"
                              aria-pressed={isLiked}
                            >
                              <Heart
                                className="h-4 w-4"
                                fill={isLiked?"#fb7185":"none"}
                              />
                            </button>
                            <button
                              onClick={async(e)=>{
                                e.stopPropagation();
                                await handleShareStory(displayTitle);
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-slate-900 text-slate-200 hover:text-white border border-slate-700 h-8 w-8"
                            >
                              <Share2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={async(e)=>{
                                e.stopPropagation();
                                await handleDownloadStory(item.path,displayTitle);
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-slate-900 text-slate-200 hover:text-white border border-slate-700 h-8 w-8"
                              disabled={downloadingPath===item.path}
                            >
                              {downloadingPath===item.path?(
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ):(
                                <Download className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-yellow-300 bg-yellow-500/10 px-3 py-1.5 rounded-full border border-yellow-400/30 text-xs sm:text-sm font-semibold">
                            <Sparkles className="h-4 w-4" />
                            <span>Read Now</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {loadingStory&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl px-6 py-4 flex items-center gap-3 shadow-xl border border-amber-200/60">
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            <span className="text-sm text-amber-50 font-medium">
              Opening your cozy story…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------ Parsing helpers ------------------------ */

function describeStoryName(name:string,owner:string){
  const base=name.replace(/\.txt$/,"");
  const parts=base.split("-");
  const kindRaw=(parts[0]||"story").toLowerCase();
  let kindLabel="Story";
  if(kindRaw.includes("animal"))kindLabel="Animal Story";
  else if(kindRaw.includes("moral"))kindLabel="Moral Story";
  else if(kindRaw.includes("panch"))kindLabel="Panchatantra Story";
  else if(kindRaw.includes("adventure"))kindLabel="Adventure Story";
  else if(kindRaw.includes("fantasy"))kindLabel="Fantasy Story";
  else if(kindRaw.includes("funny"))kindLabel="Funny Story";

  const topicHint=parts.slice(1,parts.length-1).join(" ").replace(/-/g," ").trim();
  const label=topicHint?`${topicHint}`:"Saved story";
  const badge=owner==="public"?"Shared":"Personal";
  return{label,type:kindLabel,badge};
}

function parseStoryFile(text:string):ParsedStory{
  console.log("[parseStoryFile] Raw text length:",text.length);

  const lines=text.split(/\r?\n/);
  let type:string|undefined;
  let topic:string|undefined;
  let title="Magic Story";
  const bodyLines:string[]=[];
  let moral:string|undefined;
  let imageId:string|undefined;
  let mode:"body"|"none"="none";

  for(const rawLine of lines){
    const line=rawLine.trimEnd();

    if(line.startsWith("Type:")){
      type=line.slice(5).trim();
      continue;
    }
    if(line.startsWith("Topic:")){
      topic=line.slice(6).trim();
      continue;
    }
    if(line.startsWith("Title:")){
      const t=line.slice(6).trim();
      if(t)title=t;
      continue;
    }

    const imgMatch=line.match(/^Image\s*Id\s*:\s*(.+)$/i)
      ||line.match(/^ImageId\s*:\s*(.+)$/i)
      ||line.match(/^ImageID\s*:\s*(.+)$/i);
    if(imgMatch){
      imageId=imgMatch[1].trim();
      continue;
    }

    if(/^Moral:/i.test(line)){
      moral=line.replace(/^Moral:\s*/i,"Moral: ").trim();
      continue;
    }

    if(line===""){
      if(mode==="none")continue;
    }
    mode="body";
    bodyLines.push(rawLine);
  }

  if(!imageId){
    const globalMatch=text.match(/^\s*(?:Image\s*Id|ImageId|ImageID)\s*:\s*(.+)$/im);
    if(globalMatch){
      imageId=globalMatch[1].trim();
      console.log("[parseStoryFile] ImageId recovered from global scan:",imageId);
    }else{
      console.log("[parseStoryFile] No ImageId found in story text");
    }
  }

  if(title==="Magic Story"&&bodyLines.length>0){
    const firstLine=bodyLines[0].trim();
    if(
      firstLine
      &&!firstLine.startsWith("Type:")
      &&!firstLine.startsWith("Topic:")
      &&!firstLine.startsWith("Moral:")
    ){
      title=firstLine;
      bodyLines.splice(0,1);
    }
  }

  const body=bodyLines.join("\n").trim();
  const result={title,body,moral,type,topic,imageId};
  console.log("[parseStoryFile] Parsed result:",result);
  return result;
}

function countWords(text:string):number{
  if(!text)return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((w)=>w.length>0).length;
}

function getStoryBodyForLanguage(story:ParsedStory,language:StoryLanguage,translatedBody?:string):string{
  if(language==="hi"&&translatedBody){
    return translatedBody;
  }
  return story.body;
}

function getMoralForLanguage(story:ParsedStory,language:StoryLanguage,translatedMoral?:string):string{
  if(!story.moral&&!translatedMoral)return"";
  if(language==="hi"&&translatedMoral){
    return translatedMoral.replace(/^Moral:\s*/i,"");
  }
  const base=story.moral||translatedMoral||"";
  return base.replace(/^Moral:\s*/i,"");
}

function renderStoryBodyWithMarker(body:string,showMarker:boolean):React.ReactNode[]{
  const totalWords=countWords(body);
  const markerAt=showMarker&&totalWords>0?Math.floor(totalWords*0.45):-1;
  const paragraphs=body.split(/\n{2,}/);
  let running=0;
  let markerInserted=false;
  const nodes:React.ReactNode[]=[];

  for(let i=0;i<paragraphs.length;i++){
    const para=paragraphs[i];
    const wordsInPara=countWords(para);

    if(
      showMarker
      &&!markerInserted
      &&markerAt>=0
      &&running<markerAt
      &&running+wordsInPara>=markerAt
    ){
      nodes.push(
        <div
          key={`marker-${i}`}
          id="continue-marker"
          className="my-6 flex items-center gap-3 rounded-2xl bg-amber-50 border-amber-200 border px-4 py-3 text-amber-800 text-sm md:text-base"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-xs shadow">
            ⭐
          </span>
          <span>
            Continue reading from here next time — this is a cozy halfway point in the adventure.
          </span>
        </div>
      );
      markerInserted=true;
    }

    nodes.push(
      <p key={`p-${i}`} className="mb-4">
        {para}
      </p>
    );
    running+=wordsInPara;
  }

  return nodes;
}
