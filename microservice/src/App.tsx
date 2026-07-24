import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  Sparkles, 
  BookOpen, 
  Music, 
  Presentation, 
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  Volume2,
  X,
  CheckCircle2,
  Play,
  ShieldCheck,
  Zap,
  Microscope,
  Target,
  Users,
  Trophy,
  AlertTriangle,
  Compass,
  Layers,
  Download,
  FileText
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "./lib/utils";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { PROFILES, BRAIN_HEX_CONFIG, BrainHexProfile } from "./constants/brainHex";
import { processMediaWithGemini, generateNaturalAudio, generateSlideImage } from "./services/geminiService";
import { ProcessedContent } from "./types";

export default function App() {
  const [selectedProfile, setSelectedProfile] = useState<BrainHexProfile | null>("mastermind");
  const [file, setFile] = useState<File | null>(null);
  const [className, setClassName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessedContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"markdown" | "slides" | "audio">("markdown");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const downloadFile = (content: string, fileName: string, contentType: string, isBase64 = false) => {
    const a = document.createElement("a");
    if (isBase64) {
      a.href = `data:${contentType};base64,${content}`;
    } else {
      const file = new Blob([content], { type: contentType });
      a.href = URL.createObjectURL(file);
    }
    a.download = fileName;
    a.click();
  };

  const downloadSlidesAsPDF = async () => {
    if (!result) return;
    
    // Salvar estado original
    const originalSlide = currentSlide;
    setIsProcessing(true); // Usar flag de processamento para mostrar algo se quiser
    setJobStatus({ status: "generating_pdf", progress: 0 });

    const element = document.getElementById("slide-capture-area");
    if (!element) return;

    // Medir dimensões reais para manter proporção perfeita
    const width = element.offsetWidth;
    const height = element.offsetHeight;

    const doc = new jsPDF({
      orientation: width > height ? "landscape" : "portrait",
      unit: "px",
      format: [width, height]
    });

    for (let i = 0; i < result.slides.length; i++) {
      setCurrentSlide(i);
      // Aguardar renderização e animação do motion
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const canvas = await html2canvas(element, {
        scale: 2, // Resolução 2x
        useCORS: true,
        backgroundColor: "#0a0a0f",
        logging: false,
        allowTaint: true
      });

      const imgData = canvas.toDataURL("image/png");
      if (i > 0) doc.addPage([width, height], width > height ? "landscape" : "portrait");
      doc.addImage(imgData, "PNG", 0, 0, width, height);
      
      setJobStatus({ status: "generating_pdf", progress: Math.round(((i + 1) / result.slides.length) * 100) });
    }

    // Restaurar estado original
    setCurrentSlide(originalSlide);
    setIsProcessing(false);
    setJobStatus(null);
    
    doc.save(`slides-alquimia-${selectedProfile}-${Date.now()}.pdf`);
  };

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.load();
    }
  }, [audioUrl]);

  const processAlchemy = async (fileData: { data: string; mimeType: string; name: string }, profile: BrainHexProfile) => {
    try {
      // Step 1: Text & Structure (FAST)
      setJobStatus({ status: "processing_text", progress: 10 });
      const textResult = await processMediaWithGemini([fileData], profile);
      const initialResult: ProcessedContent = { ...textResult, slideImages: [], audioBase64: null };
      setResult(initialResult);
      setActiveTab("markdown");
      setJobStatus({ status: "processing_assets", progress: 40 });

      // Step 2: Assets (SLOW - TTS & Images)
      // Generate Audio
      try {
        const voices: Record<BrainHexProfile, any> = {
          mastermind: 'Zephyr', seeker: 'Puck', survivor: 'Charon',
          daredevil: 'Fenrir', conqueror: 'Charon', socializer: 'Kore', achiever: 'Zephyr'
        };
        const { wav, mp3 } = await generateNaturalAudio(textResult.audioScript, voices[profile] || 'Kore');
        
        setResult((prev: any) => ({ ...prev, audioBase64: wav, audioMp3Base64: mp3 }));
        
        const binary = atob(wav);
        const array = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
        const blob = new Blob([array], { type: 'audio/wav' });
        setAudioUrl(URL.createObjectURL(blob));
        setJobStatus((prev: any) => ({ ...prev, progress: 60 }));
      } catch (e) {
        console.error("Audio generation failed", e);
      }

      // Generate Images for slides (with increased delay to respect strict rate limits)
      const maxImages = Math.min(textResult.slides.length, 6);
      for (let i = 0; i < maxImages; i++) {
        try {
          // Wait 3s between images to avoid 429
          if (i > 0) await new Promise(r => setTimeout(r, 3000));
          
          const img = await generateSlideImage(textResult.slides[i].imagePrompt);
          setResult((prev: any) => {
            const newImages = [...(prev.slideImages || [])];
            newImages[i] = img;
            return { ...prev, slideImages: newImages };
          });
          setJobStatus((prev: any) => ({ ...prev, progress: 60 + ((i + 1) / maxImages) * 40 }));
        } catch (e) {
          console.error(`Slide ${i} image failed permanently after retries`, e);
        }
      }

      setJobStatus({ status: "completed", progress: 100 });
      setIsProcessing(false);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Alchemy failed during transmutation");
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setError(null);
    }
  };

  const startConversion = async () => {
    if (!file || !selectedProfile || !className) {
      if (!className) setError("O nome da classe é obrigatório para a transmutação.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setJobStatus({ status: "uploading", progress: 0 });
    setAudioUrl(null);

    try {
      // 1. Process with Gemini (Frontend - Required by Environment)
      setJobStatus({ status: "processing_text", progress: 10 });
      console.log("[Alchemy UI] Transmutando texto/mídia localmente...");
      
      const fileBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });

      const fileData = {
        data: fileBase64,
        mimeType: file.type || "application/octet-stream",
        name: file.name
      };

      const processed = await processMediaWithGemini([fileData], selectedProfile);
      setResult({ ...processed, slideImages: [], audioBase64: null });
      setJobStatus({ status: "processing_assets", progress: 40 });

      // 2. Generate Audio (Frontend)
      console.log("[Alchemy UI] Gerando áudio místico...");
      const { wav, mp3 } = await generateNaturalAudio(processed.audioScript);
      
      // 3. Send to Microservice for Archiving (Supabase)
      console.log("[Alchemy UI] Enviando para o Microserviço de Arquivamento...");
      setJobStatus({ status: "archiving", progress: 80 });

      const archiveResponse = await fetch("/api/v1/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: selectedProfile,
          class_name: className,
          processed,
          mp3Base64: mp3
        }),
      });

      if (!archiveResponse.ok) {
        console.warn("[Alchemy UI] Servidor de arquivamento falhou, mas os dados locais estão prontos.");
      } else {
        const { audioMp3Url } = await archiveResponse.json();
        if (audioMp3Url) setAudioUrl(audioMp3Url);
      }

      // 4. Generate Slide Images (Frontend)
      setResult((prev: any) => ({ ...prev, audioBase64: wav, audioMp3Base64: mp3 }));
      if (!audioUrl && wav) {
        const binary = atob(wav);
        const array = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
        const blob = new Blob([array], { type: 'audio/wav' });
        setAudioUrl(URL.createObjectURL(blob));
      }

      const maxImages = Math.min(processed.slides.length, 6);
      for (let i = 0; i < maxImages; i++) {
        try {
          if (i > 0) await new Promise(r => setTimeout(r, 3000));
          const img = await generateSlideImage(processed.slides[i].imagePrompt);
          setResult((prev: any) => {
            const newImages = [...(prev.slideImages || [])];
            newImages[i] = img;
            return { ...prev, slideImages: newImages };
          });
          setJobStatus({ status: "completed", progress: 80 + ((i + 1) / maxImages) * 20 });
        } catch (e) {
          console.error("Slide image failed", e);
        }
      }

      setJobStatus({ status: "completed", progress: 100 });
      setIsProcessing(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Ocorreu um erro na magia de transmutação.");
      setIsProcessing(false);
    }
  };

  const handleGeminiTTS = async () => {
    if (!result?.audioScript || !selectedProfile) return;
    
    setIsGeneratingAudio(true);
    try {
      // Map profiles to voices for variety
      const voices: Record<BrainHexProfile, any> = {
        mastermind: 'Zephyr',
        seeker: 'Puck',
        survivor: 'Charon',
        daredevil: 'Fenrir',
        conqueror: 'Charon',
        socializer: 'Kore',
        achiever: 'Zephyr'
      };
      
      const voice = voices[selectedProfile] || 'Kore';
      const { wav, mp3 } = await generateNaturalAudio(result.audioScript, voice);
      
      setResult((prev: any) => ({ ...prev, audioBase64: wav, audioMp3Base64: mp3 }));

      // Convert PCM/WAV base64 to Blob
      const binary = atob(wav);
      const array = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
      const blob = new Blob([array], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err: any) {
      console.error(err);
      setError("Falha ao invocar o narrador místico.");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const config = selectedProfile ? BRAIN_HEX_CONFIG[selectedProfile] : BRAIN_HEX_CONFIG.mastermind;

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col font-sans">
      <audio ref={audioRef} src={audioUrl || undefined} />
      
      {/* Header */}
      <header className="py-6 px-10 border-b border-border-dim flex justify-between items-center sticky top-0 z-50" style={{ backgroundColor: 'rgba(10, 10, 15, 0.8)' }}>
        <div className="logo-gradient text-2xl font-extrabold tracking-tighter">
          BRAINHEX ALCHEMY
        </div>
        
        <div className="hidden md:flex gap-3">
          {PROFILES.map((p) => {
            const isSelected = selectedProfile === p;
            const pConfig = BRAIN_HEX_CONFIG[p];
            return (
              <button
                key={p}
                onClick={() => setSelectedProfile(p)}
                className={cn(
                  "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all duration-200",
                  isSelected 
                    ? "text-white border-transparent shadow-[0_0_20px_rgba(112,124,136,0.3)]"
                    : "text-slate-500 border-border-dim hover:border-slate-600"
                )}
                style={isSelected ? { backgroundColor: pConfig.color } : {}}
              >
                {pConfig.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 p-10 max-w-[1400px] mx-auto w-full">
        <div className="flex flex-col gap-6">
          {!result ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) setFile(droppedFile);
              }}
              className={cn(
                "flex-1 drop-zone-mesh border-2 border-dashed rounded-[32px] bg-surface flex flex-col items-center justify-center p-12 cursor-pointer transition-all min-h-[400px]",
                file ? "border-green-500/50" : "border-border-dim hover:border-slate-500"
              )}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              
              <div className="magical-spark top-[20%] left-[30%] w-1 h-1" />
              <div className="magical-spark bottom-[40%] right-[20%] w-1.5 h-1.5" />
              
              {file ? (
                <div className="flex flex-col items-center gap-6 text-center animate-in fade-in zoom-in duration-300">
                  <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/30">
                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-magic text-white">{file.name}</p>
                    <p className="text-slate-400 text-sm">Pronto para Alquimizar • {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  
                  {/* Class Name Input */}
                  <div className="w-full max-w-xs mt-4">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-widest">Identificativo da Classe</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Alquimia I" 
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="text-6xl mb-4 opacity-80 animate-pulse text-indigo-500">
                    <Sparkles size={64} />
                  </div>
                  <p className="text-xl font-medium tracking-tight">Invoque seu Conhecimento</p>
                  <p className="text-sm text-slate-500">Arraste PPTX, PDF, Audio ou Vídeo para converter</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-500">
               {/* Result Tabs for Main View */}
               <div className="flex bg-surface p-1 rounded-2xl border border-border-dim self-start">
                  {(["markdown", "slides", "audio"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-6 py-2.5 rounded-xl text-xs font-bold transition-all capitalize flex items-center gap-2",
                        activeTab === tab 
                          ? "text-white shadow-lg" 
                          : "text-slate-500 hover:text-slate-300"
                      )}
                      style={activeTab === tab ? { backgroundColor: config.color } : {}}
                    >
                      {tab === "markdown" ? "Grimório" : tab === "slides" ? "Slides" : "Audio"}
                    </button>
                  ))}
               </div>

               <div className="flex-1 bg-surface rounded-[32px] p-8 border border-border-dim flex flex-col min-h-[500px]">
                 <AnimatePresence mode="wait">
                   {activeTab === "markdown" && (
                     <motion.div
                       key="markdown"
                       initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                       className="prose prose-invert prose-indigo max-w-none"
                     >
                       <div className="flex justify-between items-center mb-10 pb-4 border-b border-white/10">
                         <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10">
                             <BookOpen style={{ color: config.color }} />
                           </div>
                           <div>
                             <h2 className="text-xl font-magic text-white leading-none">Grimório Alquímico</h2>
                             <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[2px] mt-1">Conhecimento Transmutado</p>
                           </div>
                         </div>
                         <div className="flex items-center gap-4">
                           <div className="flex gap-4 text-[9px] font-bold text-slate-400">
                              <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>Carga: {result.metadata.blocks_processed} blocos</span>
                              <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>Fidelidade: {(result.metadata.confidence * 100).toFixed(0)}%</span>
                           </div>
                           <button 
                             onClick={() => downloadFile(result.markdown, `grimorio-${selectedProfile}.md`, "text/markdown")}
                             className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                             style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.6)' }}
                             onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.color = 'white'; }}
                             onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; }}
                             title="Baixar Grimório"
                           >
                             <Download size={14} />
                             <span>Baixar .md</span>
                           </button>
                         </div>
                       </div>

                      <div className="prose prose-invert prose-slate max-w-none 
                        prose-headings:font-magic prose-headings:tracking-tight 
                        prose-h1:text-5xl prose-h1:mb-12 prose-h1:text-white prose-h1:pb-6 prose-h1:border-b
                        prose-h2:text-3xl prose-h2:mt-16 prose-h2:mb-8 prose-h2:text-slate-200 prose-h2:flex prose-h2:items-center prose-h2:gap-3
                        prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-6 prose-h3:text-slate-400 prose-h3:font-bold
                        prose-p:text-slate-300 prose-p:leading-relaxed prose-p:text-lg prose-p:mb-8
                        prose-strong:text-white prose-strong:font-black
                        prose-ul:list-none prose-ul:pl-0 prose-ul:mb-10
                        prose-li:p-5 prose-li:rounded-2xl prose-li:mb-5 prose-li:flex prose-li:items-start prose-li:gap-4
                        prose-hr:my-20
                      ">
                        <ReactMarkdown
                          components={{
                            h2: ({node, ...props}) => (
                              <h2 {...props}>
                                <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: config.color }} />
                                {props.children}
                              </h2>
                            ),
                            li: ({node, ...props}) => (
                              <li>
                                <div className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                                <div>{props.children}</div>
                              </li>
                            ),
                            blockquote: ({node, ...props}) => (
                              <blockquote className="border-l-4 pl-6 italic text-slate-400 bg-white/2 pb-1 pt-1 rounded-r-xl" style={{ borderColor: config.color }}>
                                {props.children}
                              </blockquote>
                            )
                          }}
                        >
                          {result.markdown}
                        </ReactMarkdown>
                      </div>
                    </motion.div>
                   )}

                   {activeTab === "slides" && (
                     <motion.div
                       key="slides"
                       initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                       className="h-full flex flex-col gap-8"
                     >
                       {/* NOVO LAYOUT DE APRESENTAÇÃO E CONTAÇÃO DE HISTÓRIA */}
                       <div id="slide-capture-area" className="relative flex-1 rounded-[40px] overflow-hidden shadow-2xl flex flex-col lg:flex-row min-h-[620px] bg-[#050505] border border-white/5">
                         {/* Atmospheric Background Gradients */}
                         <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-20 blur-[120px]" style={{ backgroundColor: config.color }} />
                            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-10 blur-[100px]" style={{ backgroundColor: '#ffffff' }} />
                         </div>
                         
                         {/* Painel Esquerdo: Imagem & Guia */}
                         <div className="lg:w-1/2 relative group border-b lg:border-b-0 lg:border-r border-white/5">
                            <motion.img 
                              key={`img-${currentSlide}`}
                              initial={{ scale: 1.1, opacity: 0 }} animate={{ scale: 1, opacity: 0.6 }} transition={{ duration: 1.2 }}
                              src={result.slideImages?.[currentSlide] 
                                    ? `data:image/png;base64,${result.slideImages[currentSlide]}`
                                    : `https://picsum.photos/seed/${result.slides[currentSlide].imagePrompt.replace(/\s+/g, '-')}/800/1000`} 
                              alt="Visual Alquímico" className="absolute inset-0 w-full h-full object-cover grayscale-[0.2] brightness-[0.7] group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-1000"
                              referrerPolicy="no-referrer" crossOrigin="anonymous"
                            />

                            {/* FALLBACK ICON LOGIC - Quando a IA não gera imagem */}
                            {!result.slideImages?.[currentSlide] && (
                               <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900/40 to-black/60 p-12 overflow-hidden z-[1]">
                                  <div className="magical-mesh absolute inset-0 opacity-10" />
                                  <motion.div
                                    key={`fallback-${currentSlide}`}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="relative z-10 flex flex-col items-center text-center gap-6"
                                  >
                                    <div className="w-32 h-32 rounded-3xl rotate-12 flex items-center justify-center border border-white/10 shadow-2xl" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                                       <Layers size={64} style={{ color: config.color }} className="-rotate-12" />
                                    </div>
                                    <div className="space-y-2">
                                       <p className="text-xs font-black uppercase tracking-[4px]" style={{ color: config.color }}>Essência Alquímica</p>
                                       <p className="text-sm italic text-slate-300 max-w-[200px] leading-relaxed px-4">{result.slides[currentSlide].visualDescription}</p>
                                    </div>
                                  </motion.div>
                               </div>
                             )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-60" />
                             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#050505] opacity-40 hidden lg:block" />
                            
                            {/* Personagem do Guia Interativo */}
                            <div className="absolute inset-0 flex items-center justify-center p-12 pointer-events-none">
                              <motion.div
                                key={`guide-${currentSlide}`}
                                initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                                className="relative"
                              >
                                <div className="w-44 h-44 rounded-full flex items-center justify-center relative shadow-[0_0_60px_rgba(0,0,0,0.8)]">
                                  <motion.div 
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                                    transition={{ repeat: Infinity, duration: 3 }}
                                    className="absolute inset-0 rounded-full blur-[40px]" 
                                    style={{ backgroundColor: config.color }} 
                                  />
                                  <config.icon size={80} style={{ color: config.color }} className="drop-shadow-[0_0_20px_white]" />
                                </div>

                                {result.slides[currentSlide].characterQuote && (
                                  <motion.div
                                    initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.4 }}
                                    className="absolute -top-14 -right-14 p-4 rounded-3xl rounded-bl-none w-52 shadow-2xl pointer-events-auto" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', borderStyle: 'solid', borderWidth: '1px' }}
                                  >
                                    <p className="text-[10px] font-black uppercase tracking-[3px] mb-1" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{config.guideName}</p>
                                    <p className="text-[13px] italic leading-tight" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>"{result.slides[currentSlide].characterQuote}"</p>
                                  </motion.div>
                                )}
                              </motion.div>
                            </div>
                         </div>

                         {/* Painel Direito: Conteúdo e Tópicos */}
                         <div 
                           className="lg:w-1/2 p-10 lg:p-14 flex flex-col justify-center relative z-10"
                           style={{ 
                             backgroundColor: selectedProfile === 'mastermind' ? '#0c0c14' : 
                                             selectedProfile === 'seeker' ? '#050a05' :
                                             selectedProfile === 'survivor' ? '#0f0a0a' :
                                             selectedProfile === 'daredevil' ? '#0a0f0a' :
                                             selectedProfile === 'conqueror' ? '#0a0a14' :
                                             selectedProfile === 'socializer' ? '#0f0a14' :
                                             selectedProfile === 'achiever' ? '#140f0a' : 'transparent',
                             borderLeft: '1px solid rgba(255, 255, 255, 0.02)'
                           }}
                         >
                            {/* Decoradores de Fundo Temáticos */}
                            <div className="absolute inset-0 pointer-events-none opacity-5 overflow-hidden">
                              {selectedProfile === 'mastermind' && (
                                <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(${config.color} 1px, transparent 1px)`, backgroundSize: '30px 30px' }} />
                              )}
                              {selectedProfile === 'seeker' && (
                                <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(45deg, ${config.color} 25%, transparent 25%, transparent 50%, ${config.color} 50%, ${config.color} 75%, transparent 75%, transparent)`, backgroundSize: '60px 60px' }} />
                              )}
                              {selectedProfile === 'survivor' && (
                                <div className="absolute inset-0" style={{ backgroundImage: `repeating-linear-gradient(0deg, ${config.color}, ${config.color} 1px, transparent 1px, transparent 40px)` }} />
                              )}
                              {selectedProfile === 'daredevil' && (
                                <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${config.color} 25%, transparent 25%), linear-gradient(225deg, ${config.color} 25%, transparent 25%), linear-gradient(45deg, ${config.color} 25%, transparent 25%), linear-gradient(315deg, ${config.color} 25%, transparent 25%)`, backgroundSize: '40px 40px' }} />
                              )}
                              {selectedProfile === 'conqueror' && (
                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2.5L22.5 16l2.5 2.5L20 21zM0 10h40v2H0v-2zm0 20h40v2H0v-2z' fill='%23ffffff' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E")` }} />
                              )}
                              {selectedProfile === 'socializer' && (
                                <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle, ${config.color} 10%, transparent 11%)`, backgroundSize: '50px 50px' }} />
                              )}
                              {selectedProfile === 'achiever' && (
                                <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(90deg, ${config.color} 2px, transparent 2px), linear-gradient(0deg, ${config.color} 2px, transparent 2px)`, backgroundSize: '60px 60px' }} />
                              )}
                            </div>

                            <div className="space-y-4 relative z-10">
                              <div className="flex gap-2">
                                {result.slides[currentSlide].sourceIds?.map((id: string) => (
                                  <span key={id} className="text-[8px] px-2 py-0.5 rounded-full font-mono uppercase tracking-[2px]" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255, 255, 255, 0.4)' }}>Ref: {id}</span>
                                ))}
                              </div>
                              <motion.h3 
                                key={`title-${currentSlide}`}
                                className="text-4xl font-magic text-white leading-[1.1]"
                              >
                                {result.slides[currentSlide].title}
                              </motion.h3>
                            </div>
                            {/* Tópicos e Explicação Estruturada por Perfil */}
                            <div className="space-y-8 flex-1 flex flex-col justify-center relative z-10 overflow-y-auto scrollbar-hide pr-2">
                              {result.slides[currentSlide].topics && (
                                <div 
                                  className={cn(
                                    "grid gap-4",
                                    selectedProfile === 'mastermind' && "grid-cols-1",
                                    selectedProfile === 'seeker' && "flex flex-col gap-6",
                                    selectedProfile === 'survivor' && "grid-cols-1 py-6",
                                    selectedProfile === 'daredevil' && "grid-cols-1 space-y-2",
                                    selectedProfile === 'conqueror' && "grid-cols-1 lg:grid-cols-2",
                                    selectedProfile === 'socializer' && "flex flex-wrap gap-4 justify-center md:justify-start",
                                    selectedProfile === 'achiever' && "grid-cols-1 pl-6 space-y-4"
                                  )}
                                  style={{ 
                                    borderTop: selectedProfile === 'survivor' || selectedProfile === 'achiever' ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                                    borderBottom: selectedProfile === 'survivor' ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'
                                  }}
                                >
                                  {result.slides[currentSlide].topics.map((t: string, i: number) => (
                                    <motion.div 
                                      key={i}
                                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }}
                                      className={cn(
                                        "flex items-start gap-4 transition-all",
                                        selectedProfile === 'mastermind' && "p-3 rounded-xl flex-row items-center",
                                        selectedProfile === 'seeker' && "relative pl-10 before:absolute before:left-0 before:top-2 before:w-6 before:h-6 before:rounded-full",
                                        selectedProfile === 'survivor' && "p-4 rounded-2xl flex-row items-center",
                                        selectedProfile === 'daredevil' && "p-6 border-l-8 rounded-r-3xl",
                                        selectedProfile === 'conqueror' && "p-4 rounded-2xl shadow-lg",
                                        selectedProfile === 'socializer' && "px-4 py-2 rounded-full",
                                        selectedProfile === 'achiever' && "p-4 last:border-0"
                                      )}
                                      style={{ 
                                        backgroundColor: selectedProfile === 'survivor' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.05)',
                                        borderLeftColor: selectedProfile === 'daredevil' ? config.color : undefined,
                                        borderColor: selectedProfile === 'survivor' ? 'rgba(239, 68, 68, 0.1)' : 
                                                     selectedProfile === 'conqueror' ? `${config.color}33` : 
                                                     (selectedProfile === 'daredevil' ? 'transparent' : 'rgba(255, 255, 255, 0.1)'),
                                        borderStyle: (selectedProfile === 'mastermind' || selectedProfile === 'seeker' || selectedProfile === 'conqueror' || selectedProfile === 'socializer' || selectedProfile === 'achiever') ? 'solid' : 'none',
                                        borderWidth: (selectedProfile === 'achiever') ? '0 0 1px 0' : '1px'
                                      }}
                                    >
                                      {/* Ícones Temáticos por Tópico */}
                                      <div className="shrink-0">
                                        {selectedProfile === 'mastermind' && <Layers size={14} style={{ color: config.color }} />}
                                        {selectedProfile === 'seeker' && <Compass size={14} className="absolute left-1.5 top-3.5" style={{ color: config.color }} />}
                                        {selectedProfile === 'survivor' && <AlertTriangle size={18} style={{ color: '#ef4444' }} />}
                                        {selectedProfile === 'daredevil' && <Zap size={20} style={{ color: '#fbbf24' }} />}
                                        {selectedProfile === 'conqueror' && <Trophy size={16} style={{ color: config.color }} />}
                                        {selectedProfile === 'socializer' && <Users size={14} style={{ color: config.color }} />}
                                        {selectedProfile === 'achiever' && <CheckCircle2 size={16} style={{ color: '#22c55e' }} />}
                                      </div>
                                      
                                      <div className="flex-1">
                                        <p className={cn(
                                          "text-white leading-snug",
                                          selectedProfile === 'daredevil' ? "text-xl font-black uppercase" : "text-[15px] font-bold"
                                        )}>{t}</p>
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              )}

                              {result.slides[currentSlide].explanation && (
                                <motion.div 
                                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                                  className="pt-6 space-y-6"
                                  style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}
                                >
                                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[4px]" style={{ color: 'rgba(255, 255, 255, 0.2)' }}>
                                    <Presentation size={10} />
                                    <span>
                                      {selectedProfile === 'mastermind' && "Síntese Estratégica"}
                                      {selectedProfile === 'seeker' && "Echo da Descoberta"}
                                      {selectedProfile === 'survivor' && "Protocolo de Sobrevivência"}
                                      {selectedProfile === 'daredevil' && "Visão do Abismo"}
                                      {selectedProfile === 'conqueror' && "Decreto de Vitória"}
                                      {selectedProfile === 'socializer' && "Pacto Social"}
                                      {selectedProfile === 'achiever' && "Relatório de Conquista"}
                                      {!selectedProfile && "Lição Alquímica"}
                                    </span>
                                  </div>
                                  <p className="text-[17px] font-light leading-relaxed italic" style={{ color: '#94a3b8' }}>
                                    {result.slides[currentSlide].explanation}
                                  </p>
                                </motion.div>
                              )}
                            </div>

                            {/* Rodapé Interno com Navegação */}
                            <div data-html2canvas-ignore="true" className="mt-8 flex justify-between items-center p-5 rounded-3xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.05)', borderStyle: 'solid', borderWidth: '1px' }}>
                               <div className="flex gap-4">
                                  <button 
                                    onClick={() => setCurrentSlide(s => Math.max(0, s-1))}
                                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-10"
                                    style={{ color: 'rgba(255, 255, 255, 0.3)' }}
                                    disabled={currentSlide === 0}
                                  >
                                    <ChevronLeft size={28} />
                                  </button>
                                  <button 
                                    onClick={() => setCurrentSlide(s => Math.min(result.slides.length-1, s+1))}
                                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-10"
                                    style={{ color: 'rgba(255, 255, 255, 0.3)' }}
                                    disabled={currentSlide === result.slides.length - 1}
                                  >
                                    <ChevronRight size={28} />
                                  </button>
                               </div>
                               <div className="text-[11px] font-mono uppercase tracking-[4px]" style={{ color: 'rgba(255, 255, 255, 0.2)' }}>
                                  Slide {currentSlide + 1} / {result.slides.length}
                               </div>
                               <button 
                                 onClick={() => {
                                   const imgData = result.slideImages?.[currentSlide];
                                   if (imgData) {
                                     downloadFile(imgData, `slide-${currentSlide + 1}.png`, "image/png", true);
                                   }
                                 }}
                                 className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                                 style={{ 
                                   border: '1px solid rgba(255, 255, 255, 0.05)',
                                   backgroundColor: result.slideImages?.[currentSlide] ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                                   color: result.slideImages?.[currentSlide] ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.2)',
                                   opacity: result.slideImages?.[currentSlide] ? 1 : 0.2
                                 }}
                                 disabled={!result.slideImages?.[currentSlide]}
                               >
                                 <Download size={14} />
                                 <span>Imagem</span>
                               </button>
                               <button 
                                 onClick={downloadSlidesAsPDF}
                                 className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all text-white" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                               >
                                 <FileText size={14} />
                                 <span>PDF (Todos)</span>
                               </button>
                            </div>
                         </div>
                       </div>

                       {/* Marcadores Globais */}
                       <div className="flex justify-center flex-wrap gap-2.5 px-10">
                         {result.slides.map((_: any, i: number) => (
                           <motion.div 
                             key={i} 
                             onClick={() => setCurrentSlide(i)} 
                             className={cn(
                               "h-1.5 rounded-full cursor-pointer transition-all duration-300", 
                               i === currentSlide ? "w-10 shadow-[0_0_15px_rgba(255,255,255,0.4)]" : "w-3 bg-white/10 hover:bg-white/20"
                             )} 
                             style={i === currentSlide ? { backgroundColor: config.color } : {}} 
                             whileHover={{ scale: 1.2 }}
                           />
                         ))}
                       </div>
                     </motion.div>
                   )}

                   {activeTab === "audio" && (
                     <motion.div
                       key="audio"
                       initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                       className="flex-1 flex flex-col items-center justify-center gap-8"
                     >
                        <div className="relative w-64 h-64 flex items-center justify-center">
                          <motion.div 
                            animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0.4, 0.1] }} 
                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} 
                            className="absolute inset-0 rounded-full blur-[80px]" 
                            style={{ backgroundColor: config.color }} 
                          />
                          
                          <motion.button 
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              if (audioUrl) {
                                audioRef.current?.paused ? audioRef.current.play() : audioRef.current.pause();
                              } else {
                                handleGeminiTTS();
                              }
                            }}
                            className="w-48 h-48 rounded-full flex items-center justify-center text-white shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all z-10 border-8 border-white/5 group overflow-hidden" 
                            style={{ backgroundColor: config.color }}
                          >
                            {isGeneratingAudio ? (
                              <Loader2 className="w-16 h-16 animate-spin" />
                            ) : audioUrl ? (
                              <Play className="w-20 h-20 group-hover:scale-125 transition-transform" />
                            ) : (
                              <Sparkles className="w-20 h-20 group-hover:scale-125 transition-transform" />
                            )}
                          </motion.button>
                        </div>
                        <div className="text-center max-w-lg space-y-4">
                          <p className="text-xs font-bold uppercase tracking-[4px] text-slate-500">Narrador Místico Ativado</p>
                          <p className="text-2xl font-magic text-white">Voz de {config.guideName}</p>
                          <p className="text-slate-400 italic text-sm">Escute a verdade profunda extraída de 100% da sua oferenda.</p>
                        </div>
                        
                        {audioUrl && (
                          <div className="w-full max-w-md bg-white/5 p-4 rounded-2xl flex items-center gap-4 border border-border-dim animate-in fade-in slide-in-from-bottom-4">
                             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                             <span className="text-xs text-green-500 font-bold uppercase tracking-widest">Ritual Sonoro Preparado</span>
                             <button onClick={() => { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }} className="ml-auto text-slate-500 hover:text-white text-[10px] uppercase font-bold px-2 py-1 rounded hover:bg-white/5 transition-all">Reiniciar</button>
                             {result?.audioMp3Base64 && (
                               <button 
                                 onClick={() => result.audioMp3Base64 && downloadFile(result.audioMp3Base64, `sabedoria-${selectedProfile}.mp3`, "audio/mp3", true)}
                                 className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all text-white"
                                 style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.05)' }}
                               >
                                 <Download size={14} />
                                 Baixar .mp3
                               </button>
                             )}
                          </div>
                        )}
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>
            </div>
          )}
        </div>

        {/* Sidebar Preview */}
        <aside className="output-preview flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="card bg-surface border border-border-dim rounded-[24px] p-6 shadow-2xl">
            <div className="text-[10px] uppercase font-extrabold tracking-[2px] mb-4 flex items-center justify-between" style={{ color: config.color }}>
              <span>Transmutação Ativa</span>
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            </div>
                               <div className="text-[11px] font-mono overflow-hidden relative leading-relaxed" style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '0.75rem', padding: '1rem', minHeight: '160px', color: '#94a3b8' }}>
              {result ? (
                <div className="space-y-4 animate-in fade-in duration-1000">
                  <p className="text-indigo-400 font-bold border-b border-white/5 pb-2">CONHECIMENTO 100% DISTILADO</p>
                  <p className="line-clamp-6 leading-loose">{result.markdown}</p>
                </div>
              ) : (
                <div className="space-y-3 italic opacity-40">
                  <p className="text-white/40"># Aguardando Mídia...</p>
                  <p>## Analisando Fluxo...</p>
                  <p>- Essência Literária</p>
                  <p>- Vibras Lúdicas</p>
                  <p>- Intuição de {config.guideName}</p>
                </div>
              )}
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white p-6" style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}>
                  <Loader2 className="animate-spin w-8 h-8 text-indigo-500" />
                  <div className="w-full h-1 bg-white/10 rounded-full mt-4 overflow-hidden">
                    <motion.div 
                      className="h-full bg-indigo-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${jobStatus?.progress || 10}%` }}
                    />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-widest animate-pulse text-center">
                    {jobStatus?.status === "processing_text" ? "Decifrando Matriz Textual..." : 
                     jobStatus?.status === "processing_assets" ? "Manifestando Mídia Alquímica..." : 
                     "Invocando TrailUp Core..."}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono italic">Progresso: {jobStatus?.progress || 0}%</span>
                </div>
              )}
            </div>
          </div>

          <div className="card bg-surface border border-border-dim rounded-[24px] p-6 shadow-2xl">
            <div className="text-[10px] uppercase font-extrabold tracking-[2px] mb-4 flex items-center justify-between" style={{ color: config.color }}>
              <span>Eco Emocional</span>
              {audioUrl && <Volume2 size={12} className="animate-bounce" />}
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => audioUrl ? audioRef.current?.play() : handleGeminiTTS()} 
                  disabled={!result || isGeneratingAudio}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-30 hover:scale-110 active:scale-95 shadow-lg" 
                  style={{ backgroundColor: config.color }}
                >
                  {isGeneratingAudio ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                </button>
                <div className="flex-1 space-y-2">
                   <div className="h-1.5 bg-border-dim rounded-full relative overflow-hidden">
                    <motion.div 
                      animate={isProcessing || isGeneratingAudio ? { x: ["-100%", "100%"] } : {}}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                      className="absolute inset-0 w-1/2 bg-white/20 rounded-full"
                      style={{ backgroundColor: result ? config.color : undefined }}
                    />
                  </div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase opacity-50">Narrativa emocional configurada</p>
                </div>
              </div>
            </div>
          </div>

          <div className="card bg-surface border border-border-dim rounded-[24px] p-6 flex-1 flex flex-col gap-4 shadow-2xl overflow-hidden group">
             <div className="text-[10px] uppercase font-extrabold tracking-[2px] flex items-center justify-between" style={{ color: config.color }}>
               <span>Visual Ritualístico</span>
               <Presentation size={12} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2 flex-1 relative">
              <div className="aspect-[4/5] bg-black/40 rounded-xl border border-border-dim overflow-hidden transition-all group-hover:border-indigo-500/30">
                {result && <img 
                  src={result.slideImages?.[0] ? `data:image/png;base64,${result.slideImages[0]}` : `https://picsum.photos/seed/${result.slides[0].imagePrompt.substring(0, 20)}/400/500`} 
                  className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all" referrerPolicy="no-referrer" />}
              </div>
              <div className="aspect-[4/5] bg-black/40 rounded-xl border border-border-dim overflow-hidden transition-all group-hover:border-purple-500/30">
                {result && <img 
                  src={result.slideImages?.[1] ? `data:image/png;base64,${result.slideImages[1]}` : `https://picsum.photos/seed/${result.slides[1]?.imagePrompt.substring(0, 20) || 'b'}/400/500`} 
                  className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all" referrerPolicy="no-referrer" />}
              </div>
              
              <div className="absolute inset-0 bg-gradient-to-t from-[#11112b] via-transparent to-transparent pointer-events-none" />
            </div>
            <div className="mt-auto text-center border-t border-border-dim pt-5">
              <p className="text-[10px] text-slate-500 uppercase tracking-[2px] leading-relaxed">
                {result ? `Imagens baseadas no tema ${config.label}` : 'Conectado ao TrailUp v1.0'}
                <br/>
                <span className="font-extrabold text-white/60">ESTÉTICA ALCHEMY 2D</span>
              </p>
            </div>
          </div>
        </aside>
      </main>

      {/* Sticky Footer */}
      <footer className="p-8 px-10 border-t border-border-dim sticky bottom-0 z-50 flex items-center gap-8 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]" style={{ backgroundColor: 'rgba(10, 10, 15, 0.95)' }}>
        <motion.div 
          animate={isProcessing ? { rotate: 360 } : {}}
          transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
          className="w-16 h-16 rounded-full flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(0,0,0,0.5)] z-10 shrink-0"
          style={{ background: `linear-gradient(135deg, ${config.color}88, #000)`, border: `3px solid ${config.color}` }}
        >
          <config.icon size={32} color="white" />
        </motion.div>
        
        <div className="flex-1 space-y-1">
          <div className="flex items-baseline gap-3">
             <h3 className="text-white font-extrabold text-xl tracking-tight uppercase">{config.guideName}</h3>
             <span className="text-[10px] font-bold text-indigo-400 border border-indigo-400/30 px-2 py-0.5 rounded-full uppercase">{config.label}</span>
          </div>
          <p className="text-slate-500 text-sm font-light italic line-clamp-1 max-w-2xl">
            "Minha intuição está 100% focada na sua mídia. Prepare-se para a revelação."
          </p>
        </div>
        
        <div className="flex gap-6 items-center">
           {error && <p className="text-red-500 text-[10px] font-bold animate-pulse max-w-[200px] text-right">{error}</p>}
           {!result ? (
              <button 
                onClick={startConversion}
                disabled={!file || !selectedProfile || isProcessing}
                className="group relative bg-white text-black px-12 py-4 rounded-full font-black text-xs uppercase tracking-[3px] transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 shadow-[0_10px_30px_rgba(255,255,255,0.1)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-indigo-500/10 group-hover:translate-x-full transition-transform duration-500" />
                <span className="relative flex items-center gap-3">
                  {isProcessing ? <Loader2 className="animate-spin" /> : <Sparkles size={14} />}
                  {isProcessing ? "TRANSFORMANDO..." : "INVOCAR ALQUIMIA"}
                </span>
              </button>
           ) : (
              <button 
                onClick={() => { setResult(null); setFile(null); setAudioUrl(null); }}
                className="text-slate-300 px-10 py-4 rounded-full font-bold text-xs uppercase tracking-[2px] transition-all"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#cbd1d8'; }}
              >
                Nova Oferta
              </button>
           )}
        </div>
      </footer>
    </div>
  );
}



