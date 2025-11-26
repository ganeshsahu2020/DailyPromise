import React,{useState,useRef,useMemo}from "react";
import {createPortal}from "react-dom";

type EvidenceType="photo"|"video"|"audio"|"text"|"checklist"|"document";
export type EvidenceItem={id:string; type:EvidenceType; data:File|string|string[]; description?:string; previewUrl?:string};

type Props={
  target:{id:string; title:string; category?:string};
  childName:string;
  onComplete:(evidence:EvidenceItem[])=>void;
  onCancel:()=>void;
};

export default function TargetEvidenceSubmission({target,childName,onComplete,onCancel}:Props){
  const [currentStep,setCurrentStep]=useState(0);
  const [evidence,setEvidence]=useState<EvidenceItem[]>([]);
  const [working,setWorking]=useState(false);
  const [description,setDescription]=useState("");

  const photoCameraRef=useRef<HTMLInputElement>(null);
  const photoFileRef=useRef<HTMLInputElement>(null);
  const videoFileRef=useRef<HTMLInputElement>(null);
  const audioFileRef=useRef<HTMLInputElement>(null);
  const docFileRef=useRef<HTMLInputElement>(null);

  const videoRef=useRef<HTMLVideoElement>(null);
  const audioRef=useRef<HTMLAudioElement>(null);

  const steps=useMemo(
    ()=>[
      {type:"photo" as EvidenceType,title:"📸 Take a Photo",description:"Take a picture or upload from your device.",icon:"🖼️"},
      {type:"video" as EvidenceType,title:"🎥 Record a Video",description:"Upload a clip or show a quick tour.",icon:"📹"},
      {type:"audio" as EvidenceType,title:"🎤 Voice Recording",description:"Tell us about your adventure.",icon:"🔊"},
      {type:"document" as EvidenceType,title:"📄 Upload Documents",description:"Add PDFs, Word, Excel, PowerPoint, CSV or text files.",icon:"📎"},
      {type:"text" as EvidenceType,title:"📝 Write About It",description:"Share what you learned.",icon:"✏️"},
      {type:"checklist" as EvidenceType,title:"✅ Completion Checklist",description:"Tick what you completed.",icon:"✔️"},
    ],
    []
  );

  const atFirst=currentStep===0;
  const atLast=currentStep===steps.length-1;

  const checklistItems=[
    "I completed the main task",
    "I did my best work",
    "I cleaned up after myself",
    "I had fun while doing it",
    "I learned something new",
  ];

  const pushLocal=(file:File,type:EvidenceType,desc?:string)=>{
    try{
      const preview=URL.createObjectURL(file);
      const item:EvidenceItem={
        id:String(Date.now()+Math.random()),
        type,
        data:file,
        previewUrl:preview,
        description:desc||`Evidence for ${target.title}`,
      };
      setEvidence((p)=>[...p,item]);
    }catch(err){
      console.error("pushLocal error:",err);
    }
  };

  const pushMany=(files:FileList|File[],type:EvidenceType)=>{
    const arr=Array.from(files||[]);
    if(arr.length===0)return;
    setWorking(true);
    try{
      for(const f of arr){
        pushLocal(f as File,type,description);
      }
      setDescription("");
    }finally{
      setWorking(false);
    }
  };

  const handleText=()=>{
    if(!description.trim())return;
    setEvidence((p)=>[
      ...p,
      {id:String(Date.now()),type:"text",data:description.trim(),description:"Written reflection"},
    ]);
    setDescription("");
  };

  const handleChecklist=(selected:string[])=>{
    setEvidence((p)=>[
      ...p,
      {id:String(Date.now()),type:"checklist",data:selected,description:"Completion checklist"},
    ]);
  };

  const removeItem=(id:string)=>setEvidence((p)=>p.filter((x)=>x.id!==id));

  const startStream=async(kind:"video"|"audio")=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:kind==="video",audio:true});
      if(kind==="video"&&videoRef.current){
        (videoRef.current as any).srcObject=stream;
      }
      if(kind==="audio"&&audioRef.current){
        (audioRef.current as any).srcObject=stream;
      }
    }catch(err){
      console.error("Media error:",err);
      alert("Couldn't access camera/microphone. Please check permissions.");
    }
  };

  const goBack=()=>{
    if(!atFirst)setCurrentStep((s)=>s-1);
  };
  const goNext=()=>{
    if(!atLast)setCurrentStep((s)=>s+1);
    else onComplete(evidence);
  };
  const finish=()=>onComplete(evidence);

  const current=steps[currentStep];

  const renderStep=()=>{
    switch(current.type){
      case"photo":
        return(
          <div className="space-y-4">
            <div className="aspect-video bg-transparent rounded-2xl border-2 border-dashed border-white/10 grid place-items-center">
              <div className="text-center">
                <div className="text-6xl mb-4">📸</div>
                <p className="text-white/70">Take a picture or upload multiple photos.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={()=>photoCameraRef.current?.click()}
                disabled={working}
                className="px-6 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold"
              >
                {working?"📤 Preparing...":"📷 Use Camera"}
              </button>
              <button
                onClick={()=>photoFileRef.current?.click()}
                disabled={working}
                className="px-6 py-4 rounded-xl bg-white/10 text-white"
              >
                📁 Upload Photos
              </button>
              <div className="px-6 py-4 rounded-xl bg-white/5 text-white grid place-items-center text-sm">
                Tip: You can pick multiple
              </div>
            </div>

            <input
              ref={photoCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e)=>{
                const f=e.target.files?.[0];
                if(f)pushMany([f],"photo");
              }}
            />
            <input
              ref={photoFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e)=>{
                if(e.target.files)pushMany(e.target.files,"photo");
              }}
            />
          </div>
        );

      case"video":
        return(
          <div className="space-y-4">
            <div className="aspect-video bg-transparent rounded-2xl border-2 border-dashed border-white/10 relative overflow-hidden">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"/>
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="text-center">
                  <div className="text-6xl mb-4">🎥</div>
                  <p className="text-white/70">Upload one or more short clips.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={()=>startStream("video")}
                className="px-6 py-4 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold"
              >
                ⏺️ Start Camera
              </button>
              <button
                onClick={()=>videoFileRef.current?.click()}
                className="px-6 py-4 rounded-xl bg-white/10 text-white"
              >
                📁 Upload Video(s)
              </button>
            </div>
            <input
              ref={videoFileRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e)=>{
                if(e.target.files)pushMany(e.target.files,"video");
              }}
            />
          </div>
        );

      case"audio":
        return(
          <div className="space-y-4">
            <div className="aspect-video bg-transparent rounded-2xl border-2 border-dashed border-white/10 grid place-items-center">
              <audio ref={audioRef} className="hidden"/>
              <div className="text-center">
                <div className="text-6xl mb-4">🎤</div>
                <p className="text-white/70">Upload one or more audio notes.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={()=>startStream("audio")}
                className="px-6 py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold"
              >
                🎙️ Start Mic
              </button>
              <button
                onClick={()=>audioFileRef.current?.click()}
                className="px-6 py-4 rounded-xl bg-white/10 text-white"
              >
                📁 Upload Audio(s)
              </button>
            </div>
            <input
              ref={audioFileRef}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e)=>{
                if(e.target.files)pushMany(e.target.files,"audio");
              }}
            />
          </div>
        );

      case"document":
        return(
          <div className="space-y-4">
            <div className="aspect-video bg-transparent rounded-2xl border-2 border-dashed border-white/10 grid place-items-center">
              <div className="text-center">
                <div className="text-6xl mb-4">📄</div>
                <p className="text-white/70">
                  Upload PDFs, Word, Excel, PowerPoint, CSV or text files.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={()=>docFileRef.current?.click()}
                disabled={working}
                className="px-6 py-4 rounded-xl bg-white/10 text-white"
              >
                📁 Upload Document(s)
              </button>
              <div className="px-6 py-4 rounded-xl bg-white/5 text-white grid place-items-center text-sm">
                Tip: You can select multiple files
              </div>
            </div>

            <input
              ref={docFileRef}
              type="file"
              multiple
              accept=".pdf,application/pdf,.doc,application/msword,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xls,application/vnd.ms-excel,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.ppt,application/vnd.ms-powerpoint,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.csv,text/csv,.txt,text/plain"
              className="hidden"
              onChange={(e)=>{
                if(e.target.files)pushMany(e.target.files,"document");
              }}
            />
          </div>
        );

      case"text":
        return(
          <div className="space-y-4">
            <textarea
              value={description}
              onChange={(e)=>setDescription(e.target.value)}
              placeholder="What did you do? What was fun or tricky?"
              className="w-full h-48 px-4 py-3 rounded-2xl bg-transparent border border-white/10 text-white placeholder-white/50 resize-none focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                onClick={handleText}
                disabled={!description.trim()}
                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold"
              >
                📝 Save Story
              </button>
              <button
                onClick={()=>setDescription("")}
                className="px-6 py-3 rounded-xl bg-white/10 text-white"
              >
                Clear
              </button>
            </div>
          </div>
        );

      case"checklist":
        return(
          <ChecklistStep
            items={checklistItems}
            onSubmit={handleChecklist}
            onSkip={()=>{}}
          />
        );

      default:
        return null;
    }
  };

  if(typeof document==="undefined")return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/50 z-[9990]" onClick={onCancel}/>

      <div className="relative z-[9995] w-full max-w-4xl rounded-2xl shadow-2xl overflow-y-auto max-h-[92vh] bg-slate-900/95">
        <div className="flex-shrink-0 p-4 sm:p-6 border-b border-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-white truncate">
                🎉 Mission Evidence Collection
              </h2>
              <p className="text-white/70 truncate">
                Great job on "{target.title}"! Let's collect some proof.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:items-center">
              <button
                onClick={()=>{
                  if(!atFirst)setCurrentStep((s)=>s-1);
                }}
                disabled={atFirst}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white"
              >
                ← Back
              </button>
              <button
                onClick={()=>setCurrentStep((s)=>Math.min(s+1,steps.length-1))}
                disabled={atLast}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white"
              >
                Skip
              </button>
              <button
                onClick={()=>{
                  if(!atLast)setCurrentStep((s)=>s+1);
                  else onComplete(evidence);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {atLast?"Save & Finish":"Save & Next →"}
              </button>
              <button
                onClick={()=>onComplete(evidence)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Finish Now
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
              >
                🚪 Exit
              </button>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-xs sm:text-sm text-white/70 mb-2">
              <span>Step {currentStep+1} of {steps.length}</span>
              <span>{Math.round(((currentStep+1)/steps.length)*100)}% Complete</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-green-400 to-emerald-400 h-2 rounded-full transition-all duration-500"
                style={{width:`${((currentStep+1)/steps.length)*100}%`}}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2 p-6 md:overflow-y-auto md:max-h-[80vh]">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">{steps[currentStep].icon}</div>
              <h3 className="text-2xl font-bold text-white mb-2">
                {steps[currentStep].title}
              </h3>
              <p className="text-white/70 text-lg">
                {steps[currentStep].description}
              </p>
            </div>

            <div className="w-full bg-white/5 rounded-2xl p-6 border border-white/10">
              {renderStep()}
            </div>

            {evidence.length>0&&(
              <div className="mt-8 w-full p-6 bg-white/10 rounded-2xl border border-white/10">
                <h4 className="font-bold text-white text-lg mb-4">
                  🎯 Evidence Collected So Far
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {evidence.map((it)=>{
                    const isFile=typeof it.data!=="string"&&!Array.isArray(it.data);
                    const fname=isFile?(it.data as File).name:undefined;
                    return(
                      <div key={it.id} className="relative rounded-xl overflow-hidden bg-white/3 group">
                        {it.type==="photo"&&it.previewUrl&&(
                          <img src={it.previewUrl} alt="preview" className="w-full h-28 object-cover"/>
                        )}
                        {it.type==="video"&&(
                          <div className="h-28 grid place-items-center bg-black/20 text-white/80 text-sm">
                            🎬 Video
                          </div>
                        )}
                        {it.type==="audio"&&(
                          <div className="h-28 grid place-items-center bg-black/20 text-white/80 text-sm">
                            🔊 Audio
                          </div>
                        )}
                        {it.type==="document"&&(
                          <div className="h-28 grid place-items-center bg-black/20 text-white/80 text-xs px-2 text-center">
                            <div>📄 Document</div>
                            {fname&&(
                              <div className="mt-1 line-clamp-2">
                                {fname}
                              </div>
                            )}
                          </div>
                        )}
                        {it.type==="text"&&(
                          <div className="p-3 text-xs text-white/80 line-clamp-4 whitespace-pre-wrap bg-black/20 h-28 overflow-hidden">
                            {String(it.data)}
                          </div>
                        )}
                        {it.type==="checklist"&&Array.isArray(it.data)&&(
                          <div className="p-3 text-xs text-white/80 line-clamp-4 bg-black/20 h-28 overflow-hidden">
                            {(it.data as string[]).join(", ")}
                          </div>
                        )}
                        <button
                          onClick={()=>removeItem(it.id)}
                          className="absolute top-1 right-1 text-xs px-2 py-1 rounded-full bg-red-500/80 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <aside className="p-6 bg-slate-900/95 md:sticky md:top-6 md:max-h-[80vh] md:overflow-y-auto border-t md:border-t-0">
            <div className="flex flex-col h-full">
              <div className="mb-4">
                <h4 className="text-lg font-bold text-white">💡 Evidence Tips</h4>
                <p className="text-white/70 text-sm mt-2">
                  Short, clear photos and short videos work best. For documents, PDFs and standard Office files are preferred.
                </p>
              </div>

              <div className="mb-4">
                <h5 className="font-semibold text-white mb-2">Quick Actions</h5>
                <div className="space-y-2">
                  <button
                    onClick={()=>photoCameraRef.current?.click()}
                    className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm"
                  >
                    📷 Take Photo
                  </button>
                  <button
                    onClick={()=>videoFileRef.current?.click()}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 text-white text-sm"
                  >
                    📁 Upload Video
                  </button>
                  <button
                    onClick={()=>docFileRef.current?.click()}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 text-white text-sm"
                  >
                    📎 Upload Document
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <h5 className="font-semibold text-white mb-2">Recording</h5>
                <div className="space-y-2">
                  <button
                    onClick={()=>startStream("video")}
                    className="w-full px-4 py-2 rounded-lg bg-red-600/20 text-white text-sm"
                  >
                    ⏺️ Start Camera
                  </button>
                  <button
                    onClick={()=>startStream("audio")}
                    className="w-full px-4 py-2 rounded-lg bg-green-600/20 text-white text-sm"
                  >
                    🎙️ Start Mic
                  </button>
                </div>
              </div>

              <div className="mt-auto">
                <div className="space-y-2">
                  <button
                    onClick={()=>onComplete(evidence)}
                    className="w-full px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
                  >
                    🎉 Submit Evidence
                  </button>
                  <button
                    onClick={()=>{ setEvidence([]); }}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 text-white"
                  >
                    Clear All
                  </button>
                </div>
                <p className="text-white/60 text-xs text-center mt-3">
                  All evidence will be attached to the target and saved per your app&apos;s submission flow.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ChecklistStep({
  items,
  onSubmit,
  onSkip,
}:{items:string[]; onSubmit:(selected:string[])=>void; onSkip:()=>void;}){
  const [selected,setSelected]=useState<string[]>([]);
  const toggle=(item:string)=>setSelected((p)=>(p.includes(item)?p.filter((i)=>i!==item):[...p,item]));
  return(
    <div className="space-y-4">
      <div className="space-y-3">
        {items.map((item,i)=>(
          <label
            key={i}
            className="flex items-center gap-3 p-4 bg-white/10 rounded-xl cursor-pointer hover:bg-white/15 transition-all"
          >
            <input
              type="checkbox"
              checked={selected.includes(item)}
              onChange={()=>toggle(item)}
              className="w-5 h-5 text-green-400 bg-white/20 border-white/30 rounded focus:ring-green-400"
            />
            <span className="text-white flex-1">{item}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          onClick={()=>onSubmit(selected)}
          className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-green-400 to-emerald-400 text-black font-bold"
        >
          ✅ Save Checklist
        </button>
        <button
          onClick={onSkip}
          className="px-6 py-3 rounded-xl bg-white/10 text-white"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
