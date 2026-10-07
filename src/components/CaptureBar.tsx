import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  FileText, 
  Github, 
  Cpu, 
  Bot, 
  Loader2,
  CheckCircle,
  HelpCircle,
  BrainCircuit,
  UploadCloud,
  Globe,
  Wrench,
  Paperclip,
  Database,
  ArrowRight,
  ChevronDown,
  Check,
  Zap,
  GraduationCap,
  Rss,
  StickyNote,
  Mic,
  Square,
  Trash2,
  Workflow,
  Wand2,
  X,
  Image as ImageIcon
} from "lucide-react";
import { ResourceType, CaptureStage, TransformationCategory, GeminiModelId } from "../types";
import { GEMINI_MODEL_OPTIONS } from "../constants/geminiModels";

interface CaptureBarProps {
  onCapture: (input: string, explicitType?: ResourceType, extraMetadata?: Record<string, any>) => Promise<boolean>;
  isAnalyzing: boolean;
  captureStage?: CaptureStage;
  captureStageMessage?: string;
  transformationCategory?: TransformationCategory | null;
  onOpenKnowledgeUpload?: () => void;
  onOpenDiagnostic?: () => void;
  onOpenGoogleDrive?: () => void;
  onCaptureFile?: (
    file: File,
    explicitType?: ResourceType,
    notes?: string,
    onStageUpdate?: (stage: CaptureStage, message?: string) => void,
    preferredModel?: GeminiModelId
  ) => Promise<boolean>;
  onUploadRawFile?: (file: File) => Promise<boolean>;
  onRefactorDocument?: (payload: { file?: File; text?: string; preferredModel?: GeminiModelId }) => Promise<void>;
  onOpenIntelligence?: (prefilledQuery?: string) => void;
  isIntelligenceOpen?: boolean;
  resourceCount?: number;
}

export const CaptureBar: React.FC<CaptureBarProps> = ({
  onCapture,
  isAnalyzing,
  captureStage = "idle",
  captureStageMessage,
  transformationCategory,
  onOpenKnowledgeUpload,
  onCaptureFile,
  onUploadRawFile,
  onRefactorDocument,
  onOpenIntelligence,
  isIntelligenceOpen = false,
  resourceCount,
}) => {
  const [input, setInput] = useState("");
  const [selectedType, setSelectedType] = useState<ResourceType | "auto">("auto");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>("auto");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Attached File / Screenshot Preview State
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null);

  const handleSetAttachedFile = (file: File) => {
    if (attachedPreviewUrl) {
      URL.revokeObjectURL(attachedPreviewUrl);
    }
    setAttachedFile(file);
    if (file.type.startsWith("image/")) {
      setAttachedPreviewUrl(URL.createObjectURL(file));
    } else {
      setAttachedPreviewUrl(null);
    }
  };

  const handleClearAttachedFile = () => {
    if (attachedPreviewUrl) {
      URL.revokeObjectURL(attachedPreviewUrl);
    }
    setAttachedFile(null);
    setAttachedPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (attachedPreviewUrl) {
        URL.revokeObjectURL(attachedPreviewUrl);
      }
    };
  }, [attachedPreviewUrl]);

  // Audio Voice Memo Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioTimerRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Close type and model dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    if (isTypeDropdownOpen || isModelDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTypeDropdownOpen, isModelDropdownOpen]);

  // Auto-resize textarea based on content (1 to 4 lines)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 36), 130)}px`;
    }
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isAnalyzing) return;

    const rawInput = input.trim();
    if (selectedType === "document_refactor" && onRefactorDocument) {
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "36px";
      }
      await onRefactorDocument({ text: rawInput, preferredModel: selectedModel });
      return;
    }

    // Sanitize any duplicated or accidentally concatenated URLs (e.g. https://...https://...)
    let cleanInput = rawInput;
    if (rawInput.startsWith("http://") || rawInput.startsWith("https://")) {
      const doubleMatch = rawInput.match(/(https?:\/\/[^\s]+?)(?=https?:\/\/|$)/i);
      if (doubleMatch) {
        cleanInput = doubleMatch[1];
      }
    }

    const success = await onCapture(
      cleanInput, 
      selectedType === "auto" ? undefined : selectedType,
      { preferredModel: selectedModel }
    );

    if (success) {
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "36px";
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Direct Clipboard Paste for Screenshot/Image Ingestion (Ctrl+V / Cmd+V)
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData && e.clipboardData.items) {
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            try {
              setIsUploadingFile(true);
              const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
              const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
              const pastedFile = new File([file], `screenshot-clipboard-${timestampStr}.${ext}`, { type: item.type });
              if (selectedType === "document_refactor" && onRefactorDocument) {
                await onRefactorDocument({ file: pastedFile, preferredModel: selectedModel });
                setInput("");
                return;
              }
              if (onCaptureFile) {
                const ok = await onCaptureFile(
                  pastedFile,
                  selectedType !== "auto" ? selectedType : undefined,
                  input.trim() || undefined,
                  undefined,
                  selectedModel
                );
                if (ok) {
                  setInput("");
                  setShowSuccess(true);
                  setTimeout(() => setShowSuccess(false), 3000);
                }
              } else if (onUploadRawFile) {
                const ok = await onUploadRawFile(pastedFile);
                if (ok) {
                  setInput("");
                  setShowSuccess(true);
                  setTimeout(() => setShowSuccess(false), 3000);
                }
              }
            } catch (err) {
              console.error("Paste image error:", err);
            } finally {
              setIsUploadingFile(false);
            }
            return;
          }
        }
      }
    }
  };

  // Drag and Drop Handler for direct drop on CaptureBar
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      try {
        setIsUploadingFile(true);
        if (selectedType === "document_refactor" && onRefactorDocument) {
          await onRefactorDocument({ file, preferredModel: selectedModel });
          setInput("");
          return;
        }
        let ok = false;
        if (onCaptureFile) {
          ok = await onCaptureFile(
            file,
            selectedType !== "auto" ? selectedType : undefined,
            input.trim() || undefined,
            undefined,
            selectedModel
          );
          if (ok) {
            setInput("");
          }
        } else if (onUploadRawFile) {
          ok = await onUploadRawFile(file);
        }
        if (ok) {
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
        }
      } catch (err) {
        console.error("Drop file error:", err);
      } finally {
        setIsUploadingFile(false);
      }
    }
  };

  // Cleanup audio recorder on unmount
  useEffect(() => {
    return () => {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("La registrazione vocale richiede un browser con supporto MediaDevices.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/wav",
      ];
      let selectedMime = "";
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
        for (const m of mimeCandidates) {
          if (MediaRecorder.isTypeSupported(m)) {
            selectedMime = m;
            break;
          }
        }
      }

      const recorder = new MediaRecorder(
        stream,
        selectedMime ? { mimeType: selectedMime } : undefined
      );
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);

      audioTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn("Accesso microfono non consentito o errore:", err);
      alert("Impossibile accedere al microfono. Verifica le autorizzazioni nel browser.");
    }
  };

  const handleStopAndUploadRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    if (audioTimerRef.current) clearInterval(audioTimerRef.current);

    const recorder = mediaRecorderRef.current;
    const stream = audioStreamRef.current;

    recorder.onstop = async () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false);
      setRecordingDuration(0);

      if (audioChunksRef.current.length > 0 && onUploadRawFile) {
        const mime = recorder.mimeType || "audio/webm";
        const ext = mime.includes("ogg")
          ? "ogg"
          : mime.includes("mp4")
          ? "mp4"
          : mime.includes("wav")
          ? "wav"
          : "webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });

        if (audioBlob.size > 500) {
          const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
          const audioFile = new File(
            [audioBlob],
            `nota-vocale-${timestampStr}.${ext}`,
            { type: mime }
          );

          try {
            setIsUploadingFile(true);
            const ok = await onUploadRawFile(audioFile);
            if (ok) {
              setShowSuccess(true);
              setTimeout(() => setShowSuccess(false), 3000);
            }
          } catch (err) {
            console.error("Errore upload nota vocale:", err);
          } finally {
            setIsUploadingFile(false);
          }
        }
      }
    };

    recorder.stop();
  };

  const handleCancelRecording = () => {
    if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const typeOptions: { 
    id: ResourceType | "auto"; 
    label: string; 
    icon: React.ReactNode;
    color: string;
    description: string;
  }[] = [
    { id: "auto", label: "Auto-Detect (Testo, Immagini & Doc)", icon: <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />, color: "text-[#C5A059]", description: "Analisi multimodale universale: immagini didattiche, cronologie, schemi, link, note o file in OKF v0.2" },
    { id: "document_refactor", label: "Rielabora & Migliora Bozza", icon: <Wand2 className="w-3.5 h-3.5 text-indigo-400" />, color: "text-indigo-400", description: "Comprende a fondo bozze o note grezze, le rielabora in OKF v0.2 e mostra il confronto side-by-side" },
    { id: "knowledge", label: "Knowledge & Documenti (OKF)", icon: <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059]" />, color: "text-[#C5A059]", description: "Documenti didattici, cronologie (es. 'collocare i fatti nel tempo'), schemi, scansioni, note e specifiche .md" },
    { id: "paper", label: "Paper Scientifico", icon: <GraduationCap className="w-3.5 h-3.5 text-[#818CF8]" />, color: "text-[#818CF8]", description: "Articoli accademici (arXiv, DOI, venue, PDF)" },
    { id: "rss", label: "Feed RSS", icon: <Rss className="w-3.5 h-3.5 text-[#FB923C]" />, color: "text-[#FB923C]", description: "Flussi di aggiornamento RSS e Atom da blog e lab AI" },
    { id: "note", label: "Nota Rapida", icon: <StickyNote className="w-3.5 h-3.5 text-[#FBBF24]" />, color: "text-[#FBBF24]", description: "Scratchpad veloce, idee per prompt o memo architetturali" },
    { id: "procedure", label: "Procedura / Playbook", icon: <Workflow className="w-3.5 h-3.5 text-[#22D3EE]" />, color: "text-[#22D3EE]", description: "Playbook operativi, SOP, manutenzioni, onboarding e guide di assistenza" },
    { id: "troubleshooting", label: "Problemi & Fix", icon: <Wrench className="w-3.5 h-3.5 text-[#F97316]" />, color: "text-[#F97316]", description: "Cause radice, diagnostica errori e checklist di risoluzione" },
    { id: "mcp_server", label: "MCP Server", icon: <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />, color: "text-[#38BDF8]", description: "Server Model Context Protocol, tools e snippet JSON" },
    { id: "github_repo", label: "GitHub Repo", icon: <Github className="w-3.5 h-3.5 text-[#A855F7]" />, color: "text-[#A855F7]", description: "Repository open-source, codice sorgente e pacchetti" },
    { id: "ai_skill", label: "AI Skill & Prompt", icon: <Bot className="w-3.5 h-3.5 text-[#10B981]" />, color: "text-[#10B981]", description: "Prompt di sistema e regole comportamentali per agenti" },
    { id: "article", label: "Articolo & Guida", icon: <FileText className="w-3.5 h-3.5 text-[#F59E0B]" />, color: "text-[#F59E0B]", description: "Guide tecniche, saggi e documentazione generale" },
    { id: "link", label: "Link & Web Tool", icon: <Globe className="w-3.5 h-3.5 text-[#06B6D4]" />, color: "text-[#06B6D4]", description: "Risorse online, tool web e link di consultazione" },
  ];

  const currentOption = typeOptions.find((t) => t.id === selectedType) || typeOptions[0];

  const getStageLabel = () => {
    if (captureStageMessage) return captureStageMessage;
    switch (captureStage) {
      case "sending":
        return "Invio richiesta...";
      case "analyzing":
        return "Elaborazione AI...";
      case "transforming":
        if (transformationCategory === "procedure") return "Data Transformation: Procedura & SOP Playbook...";
        if (transformationCategory === "troubleshooting") return "Data Transformation: Troubleshooting & Fix...";
        if (transformationCategory === "article") return "Data Transformation: Articolo & Guida...";
        if (transformationCategory === "web_link") return "Data Transformation: Web Link...";
        if (transformationCategory === "github_repo") return "Data Transformation: GitHub Repo...";
        if (transformationCategory === "okf_draft") return "Data Transformation: OKF Bozza (Draft)...";
        if (transformationCategory === "okf_document") return "Data Transformation: OKF Document...";
        return "Data Transformation in corso...";
      case "saving":
        return "Salvataggio nel Vault...";
      case "success":
        return "Completato!";
      default:
        return "Elaborazione in corso...";
    }
  };

  return (
    <div className="w-full">
      <form 
        onSubmit={handleSubmit} 
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingOver(false);
          }
        }}
        onDrop={handleDrop}
        className="relative"
      >
        {/* Visual Drag and Drop Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 bg-[#121008]/95 border-2 border-dashed border-[#C5A059] rounded-xl flex items-center justify-center gap-3 backdrop-blur-xs transition-all pointer-events-none animate-fade-in shadow-2xl">
            <UploadCloud className="w-6 h-6 text-[#C5A059] animate-bounce" />
            <span className="text-xs sm:text-sm font-mono font-medium text-[#E5C170]">
              Rilascia qui l'immagine, screenshot o documento per l'ingestione OKF v0.2...
            </span>
          </div>
        )}

        <div className="bg-[#0C0C0C] border border-[#222] hover:border-[#2E2E2E] focus-within:border-[#C5A059]/80 focus-within:ring-1 focus-within:ring-[#C5A059]/40 rounded-xl p-2.5 shadow-xl transition-all space-y-2">
          
          {/* Top Control Bar: Contextual Chips & Engine Indicators - Unified 32px height row */}
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-0.5">
            
            {/* Left Group: Type Selector + Gemini Model Selector */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              {/* Type Selector Dropdown */}
              <div className="relative shrink-0" ref={typeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                  className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg bg-[#141414] hover:bg-[#1A1A1A] border border-[#262626] hover:border-[#383838] text-[11px] font-mono text-[#DDD] transition-all cursor-pointer shadow-xs whitespace-nowrap"
                  title="Seleziona tipologia di classificazione AI"
                >
                  {currentOption.icon}
                  <span className="font-medium text-white whitespace-nowrap">{currentOption.label}</span>
                  <ChevronDown className={`w-3 h-3 text-[#777] shrink-0 transition-transform ${isTypeDropdownOpen ? "rotate-180 text-[#C5A059]" : ""}`} />
                </button>

                {/* Type Dropdown Popover */}
                {isTypeDropdownOpen && (
                  <div className="absolute left-0 bottom-full mb-2 w-72 bg-[#0F0F0F] border border-[#262626] rounded-xl shadow-2xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-mono text-[#666] uppercase tracking-wider border-b border-[#1A1A1A] mb-1">
                      Tipo di Risorsa per l'Agente
                    </div>
                    <div className="space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                      {typeOptions.map((opt) => {
                        const isSelected = selectedType === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSelectedType(opt.id);
                              setIsTypeDropdownOpen(false);
                            }}
                            className={`w-full flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${
                              isSelected
                                ? "bg-[#1F180E] border border-[#C5A059]/40 text-[#E5C170]"
                                : "hover:bg-[#161616] text-[#BBB] hover:text-white"
                            }`}
                          >
                            <span className="mt-0.5 shrink-0">{opt.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between text-xs font-mono font-medium">
                                <span>{opt.label}</span>
                                {isSelected && <Check className="w-3 h-3 text-[#C5A059]" />}
                              </div>
                              <p className="text-[10px] text-[#666] truncate mt-0.2">
                                {opt.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Model Selector Dropdown */}
              <div className="relative shrink-0" ref={modelDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                  className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg bg-[#141414] hover:bg-[#1A1A1A] border border-[#262626] hover:border-[#383838] text-[11px] font-mono text-[#DDD] transition-all cursor-pointer shadow-xs whitespace-nowrap"
                  title="Seleziona modello Gemini per la cattura e classificazione (Default: priorità 3.8 Flash con thinking)"
                >
                  <Zap className={`w-3 h-3 shrink-0 ${selectedModel === "gemini-3.8-flash" ? "text-amber-400 animate-pulse" : selectedModel === "gemini-3.7-flash" ? "text-purple-400" : "text-[#C5A059]"}`} />
                  <span className="font-medium text-white whitespace-nowrap">
                    {GEMINI_MODEL_OPTIONS.find((m) => m.id === selectedModel)?.label || "Auto Fallback"}
                  </span>
                  <ChevronDown className={`w-2.5 h-2.5 text-[#777] shrink-0 transition-transform ${isModelDropdownOpen ? "rotate-180 text-[#C5A059]" : ""}`} />
                </button>

                {/* Model Dropdown Popover */}
                {isModelDropdownOpen && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 bottom-full mb-2 w-72 bg-[#0F0F0F] border border-[#262626] rounded-xl shadow-2xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-mono text-[#666] uppercase tracking-wider border-b border-[#1A1A1A] mb-1 flex items-center justify-between">
                      <span>Modello Gemini per Cattura</span>
                      <span className="text-[9px] text-[#C5A059] bg-[#C5A059]/10 px-1 py-0.2 rounded font-mono">OKF v0.2</span>
                    </div>
                    <div className="space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                      {GEMINI_MODEL_OPTIONS.map((opt) => {
                        const isSelected = selectedModel === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSelectedModel(opt.id);
                              setIsModelDropdownOpen(false);
                            }}
                            className={`w-full flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${
                              isSelected
                                ? "bg-[#1F180E] border border-[#C5A059]/40 text-[#E5C170]"
                                : "hover:bg-[#161616] text-[#BBB] hover:text-white"
                            }`}
                          >
                            <Zap className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${opt.id === "gemini-3.8-flash" ? "text-amber-400" : opt.id === "gemini-3.7-flash" ? "text-purple-400" : "text-[#C5A059]"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between text-xs font-mono font-medium">
                                <span className="flex items-center gap-1.5">
                                  {opt.label}
                                  {opt.supportsThinking && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 font-mono">
                                      Thinking
                                    </span>
                                  )}
                                </span>
                                {isSelected && <Check className="w-3 h-3 text-[#C5A059]" />}
                              </div>
                              <p className="text-[10px] text-[#777] line-clamp-2 mt-0.5 leading-tight">
                                {opt.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Group: Actions (Import Doc + Intelligence ⌘K) */}
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {showSuccess && (
                <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-semibold animate-fade-in whitespace-nowrap mr-1">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" /> Salvato!
                </span>
              )}

              {onOpenKnowledgeUpload && (
                <button
                  type="button"
                  onClick={onOpenKnowledgeUpload}
                  className="h-8 flex items-center gap-1.5 text-[#C5A059] hover:text-[#F0D598] text-[11px] font-mono bg-[#161208] hover:bg-[#221A0C] border border-[#C5A059]/40 hover:border-[#C5A059]/70 px-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
                  title="Pipeline di Ingestione Paper scientifici, PDF multimodale (Pixel-to-Markdown OCR), .md con architettura a 6 Agenti e Gate Cekikj"
                >
                  <Workflow className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Ingestione Doc / Paper</span>
                  <span className="sm:hidden">Ingestione</span>
                </button>
              )}

              {/* Unified Vault Intelligence Command Button */}
              {onOpenIntelligence && (
                <button
                  type="button"
                  id="capturebar-vault-intelligence-btn"
                  onClick={() => {
                    if (input.trim()) {
                      onOpenIntelligence(input.trim());
                      setInput("");
                    } else {
                      onOpenIntelligence();
                    }
                  }}
                  className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer border shrink-0 whitespace-nowrap ${
                    isIntelligenceOpen
                      ? "bg-[#C5A059] text-black border-[#C5A059] font-bold shadow-[0_0_12px_rgba(197,160,89,0.4)]"
                      : "bg-[#18130B] hover:bg-[#241A0D] text-[#E5C170] hover:text-[#F8E2A8] border-[#C5A059]/60 hover:border-[#C5A059] shadow-xs active:scale-95"
                  }`}
                  title="Apri Vault Intelligence: Orchestratore Agenti Autonomi (Scorciatoia globale: ⌘K / Ctrl+K)"
                  aria-label="Apri Vault Intelligence"
                >
                  <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                  <span className="font-semibold">Intelligence</span>
                  <span className="hidden sm:inline-block text-[9.5px] px-1 py-0.2 rounded bg-black/40 text-[#C5A059] border border-[#C5A059]/30 font-mono font-medium">
                    ⌘K
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Stepper Feedback when Analyzing */}
          {isAnalyzing && (
            <div className="mx-0.5 px-3 py-2 bg-[#12110D] border border-[#C5A059]/30 rounded-xl space-y-2 animate-fade-in shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs text-[#DDD]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-2 w-2 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C5A059] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C5A059]"></span>
                  </span>
                  <span className="font-medium text-[#E5C170] text-xs truncate">
                    {getStageLabel()}
                  </span>
                </div>

                {/* 4-Step Stepper: 1. Pre-Flight -> 2. Gemini SOTA -> 3. Cekikj Gate -> 4. Vault */}
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    captureStage === 'sending' 
                      ? 'bg-[#C5A059] text-black font-semibold' 
                      : 'text-emerald-400 bg-emerald-950/40'
                  }`}>
                    1. Pre-Flight
                  </span>
                  <ArrowRight className="w-2.5 h-2.5 text-[#555]" />
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    captureStage === 'analyzing' 
                      ? 'bg-[#C5A059] text-black font-semibold' 
                      : captureStage === 'transforming' || captureStage === 'saving' || captureStage === 'success'
                      ? 'text-emerald-400 bg-emerald-950/40'
                      : 'text-[#666]'
                  }`}>
                    2. Gemini Thinking
                  </span>
                  <ArrowRight className="w-2.5 h-2.5 text-[#555]" />
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    captureStage === 'transforming' 
                      ? 'bg-[#C5A059] text-black font-semibold ring-1 ring-[#C5A059]' 
                      : captureStage === 'saving' || captureStage === 'success'
                      ? 'text-emerald-400 bg-emerald-950/40'
                      : 'text-[#666]'
                  }`}>
                    3. Cekikj Gate
                  </span>
                  <ArrowRight className="w-2.5 h-2.5 text-[#555]" />
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    captureStage === 'saving' 
                      ? 'bg-[#C5A059] text-black font-semibold' 
                      : captureStage === 'success'
                      ? 'text-emerald-400 bg-emerald-950/40'
                      : 'text-[#666]'
                  }`}>
                    4. Vault OKF
                  </span>
                </div>
              </div>

              {/* Specific Visual Indicator during Intermediate 'Data Transformation' Phase */}
              {(captureStage === 'transforming' || transformationCategory) && (
                <div
                  id="capture-transformation-indicator"
                  className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border text-xs transition-all animate-fade-in ${
                    transformationCategory === "procedure"
                      ? "bg-cyan-950/80 border-cyan-500/60 text-cyan-200"
                      : transformationCategory === "troubleshooting"
                      ? "bg-orange-950/80 border-orange-500/60 text-orange-200"
                      : transformationCategory === "web_link"
                      ? "bg-sky-950/80 border-sky-500/60 text-sky-200"
                      : transformationCategory === "github_repo"
                      ? "bg-purple-950/80 border-purple-500/60 text-purple-200"
                      : transformationCategory === "okf_draft"
                      ? "bg-[#2A1808]/95 border-amber-500/70 text-amber-200"
                      : "bg-[#251A0A]/95 border-[#C5A059]/70 text-[#F5DE98]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-black/50 border border-white/10 shrink-0">
                      {transformationCategory === "procedure" && <Workflow className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />}
                      {transformationCategory === "troubleshooting" && <Wrench className="w-3.5 h-3.5 text-orange-400 animate-pulse" />}
                      {transformationCategory === "web_link" && <Globe className="w-3.5 h-3.5 text-sky-400 animate-pulse" />}
                      {transformationCategory === "github_repo" && <Github className="w-3.5 h-3.5 text-purple-400 animate-pulse" />}
                      {transformationCategory === "okf_draft" && <FileText className="w-3.5 h-3.5 text-amber-400 animate-pulse" />}
                      {(transformationCategory === "okf_document" || !transformationCategory) && (
                        <FileText className="w-3.5 h-3.5 text-[#C5A059] animate-pulse" />
                      )}
                    </span>
                    <div className="flex items-baseline gap-1.5 truncate">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#999] shrink-0">
                        Data Transformation:
                      </span>
                      <span className="font-bold tracking-wide text-xs">
                        {transformationCategory === "procedure"
                          ? "Procedura / SOP Playbook"
                          : transformationCategory === "troubleshooting"
                          ? "Troubleshooting & Fix"
                          : transformationCategory === "web_link"
                          ? "Web Link"
                          : transformationCategory === "github_repo"
                          ? "GitHub Repo"
                          : transformationCategory === "okf_draft"
                          ? "OKF Bozza (Draft)"
                          : "OKF Document"}
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] opacity-85 hidden sm:inline text-right font-mono shrink-0">
                    {transformationCategory === "procedure"
                      ? "Playbook operativo · Checklist eseguibile & rollback"
                      : transformationCategory === "troubleshooting"
                      ? "Diagnostica errore · Causa radice & fix verificato"
                      : transformationCategory === "web_link"
                      ? "Escluso schema OKF v0.2 · Salvataggio come link web"
                      : transformationCategory === "github_repo"
                      ? "Repository codice open-source · Architettura tecnica"
                      : transformationCategory === "okf_draft"
                      ? "Campi OKF incompleti · Reindirizzato a Bozza / Uncategorized"
                      : "Schema OKF v0.2 · Frontmatter YAML & entità ontologiche"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Hidden File Input for Direct Attachments */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={async (e) => {
              if (e.target.files && e.target.files.length > 0) {
                const file = e.target.files[0];
                try {
                  setIsUploadingFile(true);
                  if (selectedType === "document_refactor" && onRefactorDocument) {
                    await onRefactorDocument({ file, preferredModel: selectedModel });
                    setInput("");
                    return;
                  }
                  let ok = false;
                  if (onCaptureFile) {
                    ok = await onCaptureFile(
                      file,
                      selectedType !== "auto" ? selectedType : undefined,
                      input.trim() || undefined,
                      undefined,
                      selectedModel
                    );
                    if (ok) {
                      setInput("");
                    }
                  } else if (onUploadRawFile) {
                    ok = await onUploadRawFile(file);
                  }
                  if (ok) {
                    setShowSuccess(true);
                    setTimeout(() => setShowSuccess(false), 3000);
                  }
                } catch (err) {
                  console.error("File upload error:", err);
                } finally {
                  setIsUploadingFile(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }
              }
            }}
            className="hidden"
            accept=".zip,.ipynb,.pdf,.txt,.md,.markdown,.json,.yaml,.yml,.csv,.log,.png,.jpg,.jpeg,.webp,.svg,.ts,.js,.py,.rs,.go,.mp3,.wav,.m4a,.ogg,.aac,.flac,.opus,.webm,audio/*,image/*"
          />

          {/* Audio Recording Live State */}
          {isRecording ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[#160B0B] border border-red-900/50 rounded-xl animate-fade-in my-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-3 w-3 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                </span>
                <span className="font-mono font-bold text-xs text-red-400 shrink-0">
                  REC {formatDuration(recordingDuration)}
                </span>
                <span className="text-xs text-[#AAA] truncate hidden sm:inline">
                  Registrazione nota vocale in corso...
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCancelRecording}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-[#999] hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                  title="Annulla registrazione vocale"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Annulla</span>
                </button>

                <button
                  type="button"
                  onClick={handleStopAndUploadRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Ferma la registrazione e salva la nota nel Vault"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Salva Nota Vocale</span>
                </button>
              </div>
            </div>
          ) : (
            /* Main Agentic Input Row */
            <div className="flex items-end gap-2 px-1 pt-0.5">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  selectedType === "document_refactor"
                    ? "Incolla bozza (o trascina file/incolla screenshot con Ctrl+V) per refactoring Side-by-Side in OKF v0.2..."
                    : selectedType === "knowledge"
                    ? "Incolla testo, doc didattici (es. collocare i fatti nel tempo), cronologie, immagini o guide .md da strutturare in OKF v0.2..."
                    : selectedType === "procedure"
                    ? "Incolla appunti di assistenza, descrivi la procedura o trascina manuale/foto del pannello da trasformare in Playbook..."
                    : selectedType === "troubleshooting"
                    ? "Incolla screenshot di errore con Ctrl+V o descrivi il bug/stack trace, poi clicca Cattura..."
                    : "Incolla link, testo, oppure allega/trascina/incolla immagini (Ctrl+V) e documenti per l'elaborazione OKF v0.2..."
                }
                disabled={isAnalyzing || isUploadingFile}
                className="bg-transparent border-none text-xs sm:text-sm w-full text-[#E0E0E0] focus:outline-none placeholder-[#555] disabled:opacity-50 resize-none py-1.5 max-h-32 overflow-y-auto leading-relaxed custom-scrollbar font-sans"
              />

              {/* Voice Memo Direct Microphone Button */}
              {onUploadRawFile && (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  disabled={isAnalyzing || isUploadingFile}
                  className="p-2 text-[#777] hover:text-[#E5C170] hover:bg-[#181818] rounded-xl border border-transparent hover:border-[#282828] transition-colors shrink-0 mb-0.5 cursor-pointer disabled:opacity-50"
                  title="Registra nota vocale (trascrizione automatica Gemini ed archiviazione in OKF v0.2)"
                  aria-label="Registra nota vocale"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}

              {/* Quick File Attachment Button */}
              {(onCaptureFile || onUploadRawFile || onRefactorDocument) && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing || isUploadingFile}
                  className={`p-2 rounded-xl border transition-colors shrink-0 mb-0.5 cursor-pointer disabled:opacity-50 ${
                    selectedType === "document_refactor"
                      ? "text-indigo-400 bg-indigo-950/40 border-indigo-500/50 hover:bg-indigo-900/50 hover:text-indigo-300"
                      : selectedType === "procedure"
                      ? "text-cyan-400 bg-cyan-950/30 border-cyan-500/40 hover:bg-cyan-900/40 hover:text-cyan-300"
                      : selectedType === "troubleshooting"
                      ? "text-orange-400 bg-orange-950/30 border-orange-500/40 hover:bg-orange-900/40 hover:text-orange-300"
                      : "text-[#777] hover:text-[#E5C170] hover:bg-[#181818] border-transparent hover:border-[#282828]"
                  }`}
                  title={
                    selectedType === "document_refactor"
                      ? "Allega bozza o documento (PDF, MD, TXT, DOCX) da comprendere, rielaborare e confrontare Side-by-Side"
                      : selectedType === "procedure"
                      ? "Allega manuale di servizio, procedura PDF, foto del pannello o registrazione audio dell'intervento"
                      : selectedType === "troubleshooting"
                      ? "Allega screenshot errore, PDF o log diagnostico per analisi multimodale e risoluzione (Problema & Fix)"
                      : "Allega immagine o documento: schemi didattici, cronologie storiche, scansioni, screenshot o PDF per l'ingestione universale OKF v0.2"
                  }
                  aria-label="Allega file"
                >
                  {isUploadingFile ? (
                    <Loader2 className="w-4 h-4 text-[#C5A059] animate-spin" />
                  ) : (
                    <Paperclip className={`w-4 h-4 ${selectedType === "document_refactor" ? "text-indigo-400 stroke-[2.5]" : selectedType === "procedure" ? "text-cyan-400 stroke-[2.5]" : selectedType === "troubleshooting" ? "text-orange-400 stroke-[2.5]" : ""}`} />
                  )}
                </button>
              )}

              {/* Submit Action Button */}
              <button
                type="submit"
                disabled={!input.trim() || isAnalyzing || isUploadingFile}
                className={`${
                  selectedType === "document_refactor"
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : selectedType === "procedure"
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "bg-[#C5A059] hover:bg-[#D5B069] text-black"
                } disabled:bg-[#1A1A1A] disabled:text-[#444] font-semibold text-xs py-2 px-4 rounded-xl transition-all flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95 self-end mb-0.5 cursor-pointer disabled:cursor-not-allowed`}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="hidden sm:inline">Analisi...</span>
                  </>
                ) : selectedType === "document_refactor" ? (
                  <>
                    <Wand2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span className="hidden sm:inline font-medium">Rielabora</span>
                  </>
                ) : selectedType === "procedure" ? (
                  <>
                    <Workflow className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span className="hidden sm:inline font-medium">Playbook</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span className="hidden sm:inline font-medium">Cattura</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
