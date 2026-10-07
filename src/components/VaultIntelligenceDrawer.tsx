import React, { useState, useEffect, useRef } from "react";
import {
  BrainCircuit,
  Sparkles,
  X,
  Maximize2,
  Minimize2,
  Send,
  Loader2,
  GitGraph,
  FileText,
  Code2,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Check,
  BookmarkPlus,
  RefreshCw,
  Compass,
  Layers,
  ArrowRight,
  Database,
  Terminal,
  Download,
  FileCode,
  FileJson,
  CheckCircle2,
  Share2,
  Zap,
} from "lucide-react";
import Markdown from "react-markdown";
import { ResourceItem, ResourceType, OKFEntity, OKFRelation, GeminiModelId } from "../types";
import { GEMINI_MODEL_OPTIONS } from "../constants/geminiModels";
import {
  buildOKFMarkdown,
  buildStructuredJSON,
  downloadBlobFile,
  sanitizeFilename,
  extractEntitiesAndRelationsFromCitations,
} from "../lib/okfSerializer";

// Tipologia di risposta ricevuta dal server
export interface AgentTraceStep {
  agent: "orchestrator" | "graph_navigator" | "deep_analyst" | "code_specialist" | "grounding_verifier";
  action: string;
  description: string;
  itemsFound?: number;
  status: "success" | "warning" | "insufficient";
  timestamp: string;
}

export interface CitedResourceMeta {
  id: string;
  title: string;
  type: ResourceType;
  url?: string;
  domain?: string;
  tags?: string[];
  relevanceReason?: string;
}

export interface AgenticQueryResponse {
  answer: string;
  summary: string;
  orchestratorPlan: string;
  trace: AgentTraceStep[];
  citedResources: CitedResourceMeta[];
  citedResourceIds: string[];
  suggestedQuestions: string[];
  graphClusterNodeIds: string[];
  insufficient: boolean;
  mode: string;
  stats: {
    totalVaultResourcesScanned: number;
    relevantResourcesFound: number;
    durationMs: number;
    modelUsed: string;
  };
}

export interface ConversationMessage {
  id: string;
  userQuery: string;
  mode: "quick_synthesis" | "topological_analysis" | "deep_implementation";
  response?: AgenticQueryResponse;
  liveTraces?: AgentTraceStep[];
  livePlan?: string;
  error?: string;
  timestamp: string;
}

export interface SaveNotePayload {
  title: string;
  summary: string;
  markdown: string;
  tags: string[];
  domain?: string;
  entities?: OKFEntity[];
  relations?: OKFRelation[];
}

interface VaultIntelligenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  resources: ResourceItem[];
  activeCategory?: string;
  activeTag?: string | null;
  initialQuery?: string;
  onClearInitialQuery?: () => void;
  onOpenResource: (resource: ResourceItem) => void;
  onShowInGraph: (nodeIds?: string[]) => void;
  onSaveAsNote?: (payload: SaveNotePayload) => Promise<boolean | ResourceItem>;
  onOpenCekikjModal?: () => void;
}

export const VaultIntelligenceDrawer: React.FC<VaultIntelligenceDrawerProps> = ({
  isOpen,
  onClose,
  resources,
  activeCategory,
  activeTag,
  initialQuery,
  onClearInitialQuery,
  onOpenResource,
  onShowInGraph,
  onSaveAsNote,
  onOpenCekikjModal,
}) => {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"quick_synthesis" | "topological_analysis" | "deep_implementation">("quick_synthesis");
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>("auto");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedActionId, setCopiedActionId] = useState<string | null>(null);
  const [savedNotesMap, setSavedNotesMap] = useState<Record<string, { title: string; savedAt: string }>>({});
  const [isSavingNoteId, setIsSavingNoteId] = useState<string | null>(null);
  const [expandedTraceIds, setExpandedTraceIds] = useState<Record<string, boolean>>({});

  // Ascolta query iniziale (es. passata dalla CaptureBar)
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setQuery(initialQuery.trim());
      if (onClearInitialQuery) {
        onClearInitialQuery();
      }
    }
  }, [initialQuery, onClearInitialQuery]);

  // Menu Dropdown Stati
  const [openCopyMenuId, setOpenCopyMenuId] = useState<string | null>(null);
  const [openDownloadMenuId, setOpenDownloadMenuId] = useState<string | null>(null);

  const [conversation, setConversation] = useState<ConversationMessage[]>([
    {
      id: "initial-welcome",
      userQuery: "Come posso interrogare il Vault?",
      mode: "quick_synthesis",
      timestamp: new Date().toISOString(),
      response: {
        answer: `### Benvenuto in Vault Intelligence\n\nQuesto motore epistemico è orchestrato da un team di **5 agenti specializzati** che interrogano in tempo reale le **${resources.length} risorse** del tuo archivio OKF v0.2:\n\n1. **Central Orchestrator**: pianifica la ricerca ed evita indovinelli o sintesi non comprovate (**Zero-Guessing**).\n2. **Graph Navigator**: naviga il grafo relazionale D3 fino a 2 hop.\n3. **Deep Content Analyst**: estrae evidenze dai corpi estesi Markdown e dalle specifiche.\n4. **Code & MCP Specialist**: esamina 57 repository GitHub e server MCP.\n5. **Grounding Verifier**: certifica le citazioni contro i documenti reali.\n\n*Puoi porre qualsiasi domanda complessa in linguaggio naturale qui sotto. Ogni risposta potrà essere copiata, scaricata o archiviata nel Vault in formato OKF v0.2 con collegamenti automatici al grafo.*`,
        summary: "Motore Multi-Agente attivo su 108 risorse del Vault",
        orchestratorPlan: "Inizializzazione sessione di consultazione multi-agente",
        trace: [
          {
            agent: "orchestrator",
            action: "Sistema Inizializzato",
            description: `Orchestrator pronto per query su ${resources.length} risorse.`,
            status: "success",
            timestamp: new Date().toISOString(),
          },
        ],
        citedResources: [],
        citedResourceIds: [],
        suggestedQuestions: [
          "Quali server MCP sono registrati nel Vault?",
          "Come si collegano le guide di Context Engineering nel Grafo?",
          "Confronta Claude Code con Cursor e Codex",
          "Mostrami i repository GitHub per agenti autonomi",
        ],
        graphClusterNodeIds: [],
        insufficient: false,
        mode: "quick_synthesis",
        stats: {
          totalVaultResourcesScanned: resources.length,
          relevantResourcesFound: resources.length,
          durationMs: 0,
          modelUsed: "gemini-3.7-flash",
        },
      },
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Chiudi i menu a tendina se si clicca altrove
  useEffect(() => {
    const handleOutsideClick = () => {
      setOpenCopyMenuId(null);
      setOpenDownloadMenuId(null);
      setIsModelDropdownOpen(false);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Focus automatico sul campo input all'apertura
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  // Scorrimento automatico verso l'ultimo messaggio
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, isLoading]);

  // Chiusura con tasto Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Simulazione animata degli stadi degli agenti durante il caricamento
  useEffect(() => {
    if (!isLoading) {
      setActiveStageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setActiveStageIndex((prev) => (prev < 4 ? prev + 1 : prev));
    }, 1800);

    return () => clearInterval(interval);
  }, [isLoading]);

  const stages = [
    { title: "Orchestrator", desc: "Decomposizione dell'intento & query routing" },
    { title: "Graph Navigator", desc: "Scansione topologica D3 (cluster & 2-hop)" },
    { title: "Deep Content Analyst", desc: "Lettura comparativa Markdown & estratti" },
    { title: "Code Specialist", desc: "Ispezione repository GitHub & server MCP" },
    { title: "Grounding Verifier", desc: "Audit Epistemico Cekikj & Zero-Guessing" },
  ];

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || query).trim();
    if (!textToSend || isLoading) return;

    const messageId = `msg-${Date.now()}`;
    const newMsg: ConversationMessage = {
      id: messageId,
      userQuery: textToSend,
      mode,
      liveTraces: [],
      timestamp: new Date().toISOString(),
    };

    setConversation((prev) => [...prev, newMsg]);
    setQuery("");
    setIsLoading(true);
    setActiveStageIndex(0);

    try {
      // Estrae la cronologia degli ultimi scambi per dare memoria multi-turno agli agenti
      const historyPayload = conversation
        .filter((msg) => msg.response && msg.response.answer)
        .slice(-5)
        .flatMap((msg) => [
          { role: "user" as const, content: msg.userQuery },
          { role: "assistant" as const, content: msg.response!.answer.slice(0, 1000) },
        ]);

      const payload = {
        query: textToSend,
        mode,
        activeCategory,
        activeTag: activeTag || undefined,
        history: historyPayload,
        clientResources: resources.slice(0, 150),
        preferredModel: selectedModel === "auto" ? undefined : selectedModel,
      };

      // Tenta prima la connessione in streaming Server-Sent Events (SSE)
      let streamSucceeded = false;
      try {
        const streamResponse = await fetch("/api/vault/agentic-query-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (streamResponse.ok && streamResponse.body) {
          const reader = streamResponse.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Parsing dei messaggi SSE (event / data)
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
              const lines = part.split("\n");
              let eventType = "message";
              let dataStr = "";

              for (const line of lines) {
                if (line.startsWith("event: ")) {
                  eventType = line.slice(7).trim();
                } else if (line.startsWith("data: ")) {
                  dataStr = line.slice(6).trim();
                }
              }

              if (!dataStr) continue;

              try {
                const parsedData = JSON.parse(dataStr);
                if (eventType === "plan_generated") {
                  setConversation((prev) =>
                    prev.map((msg) =>
                      msg.id === messageId ? { ...msg, livePlan: parsedData.plan } : msg
                    )
                  );
                } else if (eventType === "agent_trace_step") {
                  setConversation((prev) =>
                    prev.map((msg) => {
                      if (msg.id !== messageId) return msg;
                      const currentTraces = msg.liveTraces || [];
                      return { ...msg, liveTraces: [...currentTraces, parsedData] };
                    })
                  );
                  // Avanza la fase dell'indicatore visivo
                  if (parsedData.agent === "graph_navigator") setActiveStageIndex(1);
                  else if (parsedData.agent === "deep_analyst") setActiveStageIndex(2);
                  else if (parsedData.agent === "code_specialist") setActiveStageIndex(3);
                } else if (eventType === "grounding_check") {
                  setActiveStageIndex(4);
                  setConversation((prev) =>
                    prev.map((msg) => {
                      if (msg.id !== messageId) return msg;
                      const currentTraces = msg.liveTraces || [];
                      return { ...msg, liveTraces: [...currentTraces, parsedData] };
                    })
                  );
                } else if (eventType === "completed") {
                  streamSucceeded = true;
                  setConversation((prev) =>
                    prev.map((msg) =>
                      msg.id === messageId ? { ...msg, response: parsedData } : msg
                    )
                  );
                }
              } catch (parseErr) {
                console.warn("[SSE_PARSE_WARNING]", parseErr);
              }
            }
          }
        }
      } catch (streamErr) {
        console.warn("[SSE_STREAM_FAIL_FALLBACK_TO_REST]", streamErr);
      }

      // Se lo streaming non è riuscito a completare la risposta, esegui fallback su REST classico
      if (!streamSucceeded) {
        const response = await fetch("/api/vault/agentic-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `Errore server (${response.status})`);
        }

        const data: AgenticQueryResponse = await response.json();

        setConversation((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, response: data }
              : msg
          )
        );
      }
    } catch (err: any) {
      console.error("[VAULT_INTELLIGENCE_CLIENT_ERROR]", err);
      setConversation((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, error: err.message || "Impossibile completare l'interrogazione." }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // --- AZIONI DI COPIA ---
  const handleCopyOKF = (msg: ConversationMessage) => {
    if (!msg.response) return;
    const { markdown } = buildOKFMarkdown({
      query: msg.userQuery,
      response: msg.response,
      mode: msg.mode,
      timestamp: msg.timestamp,
    });
    navigator.clipboard.writeText(markdown);
    setCopiedActionId(`${msg.id}-okf`);
    setOpenCopyMenuId(null);
    setTimeout(() => setCopiedActionId(null), 2500);
  };

  const handleCopyClean = (msg: ConversationMessage) => {
    if (!msg.response) return;
    navigator.clipboard.writeText(msg.response.answer);
    setCopiedActionId(`${msg.id}-clean`);
    setOpenCopyMenuId(null);
    setTimeout(() => setCopiedActionId(null), 2500);
  };

  const handleCopyJSON = (msg: ConversationMessage) => {
    if (!msg.response) return;
    const jsonStr = buildStructuredJSON({
      query: msg.userQuery,
      response: msg.response,
      mode: msg.mode,
      timestamp: msg.timestamp,
    });
    navigator.clipboard.writeText(jsonStr);
    setCopiedActionId(`${msg.id}-json`);
    setOpenCopyMenuId(null);
    setTimeout(() => setCopiedActionId(null), 2500);
  };

  // --- AZIONI DI DOWNLOAD ---
  const handleDownloadMarkdown = (msg: ConversationMessage) => {
    if (!msg.response) return;
    const { title, markdown } = buildOKFMarkdown({
      query: msg.userQuery,
      response: msg.response,
      mode: msg.mode,
      timestamp: msg.timestamp,
    });
    const filename = sanitizeFilename(title, "md");
    downloadBlobFile(filename, markdown, "text/markdown;charset=utf-8");
    setOpenDownloadMenuId(null);
  };

  const handleDownloadJSON = (msg: ConversationMessage) => {
    if (!msg.response) return;
    const jsonStr = buildStructuredJSON({
      query: msg.userQuery,
      response: msg.response,
      mode: msg.mode,
      timestamp: msg.timestamp,
    });
    const filename = sanitizeFilename(`Sintesi_${msg.userQuery.slice(0, 30)}`, "json");
    downloadBlobFile(filename, jsonStr, "application/json;charset=utf-8");
    setOpenDownloadMenuId(null);
  };

  // --- AZIONE DI ARCHIVIAZIONE NEL VAULT (OKF v0.2) ---
  const handleSaveAsVaultNote = async (msg: ConversationMessage) => {
    if (!onSaveAsNote || !msg.response) return;
    setIsSavingNoteId(msg.id);

    try {
      const { title, markdown } = buildOKFMarkdown({
        query: msg.userQuery,
        response: msg.response,
        mode: msg.mode,
        timestamp: msg.timestamp,
      });

      const { entities, relations } = extractEntitiesAndRelationsFromCitations(
        msg.response.citedResources || []
      );

      const domain = msg.response.citedResources?.[0]?.domain || "AI Intelligence Synthesis";
      const tags = Array.from(
        new Set([
          "vault-intelligence",
          "ai-synthesis",
          "okf-v0.2",
          msg.mode,
          ...(msg.response.citedResources?.flatMap((r) => r.tags || []) || []).slice(0, 4),
        ])
      );

      const summaryText =
        msg.response.summary ||
        msg.response.answer.slice(0, 220).replace(/^[#\s*]+/, "") + "...";

      const ok = await onSaveAsNote({
        title,
        summary: summaryText,
        markdown,
        tags,
        domain,
        entities,
        relations,
      });

      if (ok) {
        setSavedNotesMap((prev) => ({
          ...prev,
          [msg.id]: {
            title,
            savedAt: new Date().toLocaleTimeString(),
          },
        }));
      }
    } catch (err) {
      console.error("Errore salvataggio nota nel Vault:", err);
    } finally {
      setIsSavingNoteId(null);
    }
  };

  const toggleTrace = (msgId: string) => {
    setExpandedTraceIds((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none select-none print:hidden">
      {/* Backdrop semi-trasparente per chiusura rapida */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 pointer-events-auto"
      />

      {/* Slide-over Drawer Panel */}
      <aside
        role="dialog"
        aria-label="Vault Intelligence Panel"
        className={`pointer-events-auto relative flex flex-col h-full bg-[#0C0A06] border-l border-[#262015] shadow-2xl transition-all duration-300 z-10 ${
          isExpanded ? "w-full md:w-[840px]" : "w-full sm:w-[500px]"
        }`}
      >
        {/* Header superiore del Drawer */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#221B10] bg-[#120E08]/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1F170B] border border-[#C5A059]/40 flex items-center justify-center text-[#E5C170]">
              <BrainCircuit className="w-4 h-4 text-[#C5A059]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white tracking-wide font-sans">
                  Vault Intelligence
                </h2>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/40">
                  OKF v0.2
                </span>
              </div>
              <p className="text-[11px] text-[#888] font-sans">
                5 Agenti coordinati su {resources.length} risorse del Vault
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle Espansione a Schermo Largo */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-md text-[#888] hover:text-white hover:bg-[#1A150D] transition-colors cursor-pointer"
              title={isExpanded ? "Riduci larghezza" : "Espandi a schermo largo"}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Pulsante Chiusura */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[#888] hover:text-white hover:bg-[#1A150D] transition-colors cursor-pointer"
              title="Chiudi pannello (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modalità di Interrogazione (Pill Selector) & Scelta Modello Gemini */}
        <div className="px-4 py-2 bg-[#0E0B07] border-b border-[#1A150D] flex items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#666] mr-1 shrink-0">
              Modalità:
            </span>
            <button
              onClick={() => setMode("quick_synthesis")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                mode === "quick_synthesis"
                  ? "bg-[#C5A059] text-black font-semibold shadow-xs"
                  : "bg-[#16120B] text-[#999] hover:text-[#DDD] hover:bg-[#201A10]"
              }`}
            >
              Sintesi Rapida
            </button>
            <button
              onClick={() => setMode("topological_analysis")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                mode === "topological_analysis"
                  ? "bg-[#C5A059] text-black font-semibold shadow-xs"
                  : "bg-[#16120B] text-[#999] hover:text-[#DDD] hover:bg-[#201A10]"
              }`}
            >
              <GitGraph className="w-3 h-3" />
              Grafo & Connessioni
            </button>
            <button
              onClick={() => setMode("deep_implementation")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                mode === "deep_implementation"
                  ? "bg-[#C5A059] text-black font-semibold shadow-xs"
                  : "bg-[#16120B] text-[#999] hover:text-[#DDD] hover:bg-[#201A10]"
              }`}
            >
              <Code2 className="w-3 h-3" />
              Codice & MCP
            </button>
          </div>

          {/* Model Selector Dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsModelDropdownOpen(!isModelDropdownOpen);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#16120B] hover:bg-[#201A10] border border-[#2B2113] hover:border-[#C5A059]/40 text-xs font-mono text-[#DDD] transition-all cursor-pointer shadow-xs"
              title="Seleziona modello Gemini per Vault Intelligence"
            >
              <Zap className={`w-3 h-3 ${selectedModel === "gemini-3.8-flash" ? "text-amber-400 animate-pulse" : selectedModel === "gemini-3.7-flash" ? "text-purple-400" : "text-[#C5A059]"}`} />
              <span className="font-medium text-white max-w-[110px] sm:max-w-[140px] truncate">
                {GEMINI_MODEL_OPTIONS.find((m) => m.id === selectedModel)?.label || "Auto Fallback"}
              </span>
              <ChevronDown className={`w-3 h-3 text-[#777] transition-transform ${isModelDropdownOpen ? "rotate-180 text-[#C5A059]" : ""}`} />
            </button>

            {isModelDropdownOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1.5 w-72 bg-[#0F0F0F] border border-[#262626] rounded-xl shadow-2xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="px-2.5 py-1 text-[10px] font-mono text-[#666] uppercase tracking-wider border-b border-[#1A1A1A] mb-1 flex items-center justify-between">
                  <span>Modello Gemini Intelligence</span>
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

        {/* Area di Conversazione (Feed Messaggi) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans select-text">
          {conversation.map((msg) => (
            <div key={msg.id} className="space-y-3">
              {/* Messaggio Utente */}
              {msg.id !== "initial-welcome" && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-[#1F190F] border border-[#C5A059]/30 rounded-2xl rounded-tr-xs px-4 py-2.5 text-sm text-[#F0E6D2] shadow-sm">
                    <div className="text-[10px] font-mono text-[#A89260] mb-0.5 flex items-center gap-1.5">
                      <span>Tu</span>
                      <span>•</span>
                      <span className="uppercase">{msg.mode.replace("_", " ")}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{msg.userQuery}</p>
                  </div>
                </div>
              )}

              {/* Risposta del Sistema / Agenti */}
              {msg.response && (
                <div className="flex flex-col gap-2 bg-[#120E08] border border-[#241D12] rounded-xl p-4 shadow-sm relative">
                  {/* Intestazione Risposta & Badge Modello */}
                  <div className="flex items-center justify-between gap-2 border-b border-[#1C160E] pb-2 text-[11px] font-mono text-[#888]">
                    <div className="flex items-center gap-1.5 text-[#C5A059]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="font-semibold text-[#E5C170]">Vault Intelligence</span>
                      <span className="text-[#555]">•</span>
                      <span className="text-[10px] text-[#777]">
                        {msg.response.stats.modelUsed === "heuristic-local-synthesizer"
                          ? "Sintetizzatore Euristico Locale (Zero-Quota)"
                          : msg.response.stats.modelUsed}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {msg.response.insufficient ? (
                        <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 text-[9.5px]">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Zero-Guessing
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/40 text-[9.5px]">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          Grounding Verificato
                        </span>
                      )}
                      {msg.response.stats.durationMs > 0 && (
                        <span className="text-[10px] text-[#666] ml-1">
                          {(msg.response.stats.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Corpo Risposta Markdown */}
                  <div className="text-xs sm:text-[13px] leading-relaxed text-[#E0E0E0] space-y-2.5 prose prose-invert max-w-none">
                    <Markdown>{msg.response.answer}</Markdown>
                  </div>

                  {/* Risorse del Vault Citate (Cards strip interattiva) */}
                  {msg.response.citedResources && msg.response.citedResources.length > 0 && (
                    <div className="mt-2 pt-3 border-t border-[#1C160E] space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#A89874]">
                        <span className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-[#C5A059]" />
                          Fonti Verificate nel Vault ({msg.response.citedResources.length})
                        </span>
                        {msg.response.graphClusterNodeIds.length > 0 && (
                          <button
                            onClick={() => onShowInGraph(msg.response?.graphClusterNodeIds)}
                            className="text-[10px] text-[#E5C170] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <GitGraph className="w-3 h-3" />
                            Mostra cluster nel Grafo
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.response.citedResources.map((res) => {
                          const fullItem = resources.find((r) => r.id === res.id);
                          return (
                            <div
                              key={res.id}
                              onClick={() => fullItem && onOpenResource(fullItem)}
                              className="group p-2 rounded-lg bg-[#18130B] hover:bg-[#221B10] border border-[#2B2215] hover:border-[#C5A059]/60 cursor-pointer transition-all flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="text-[9.5px] uppercase font-mono px-1 rounded bg-[#2A2012] text-[#D5B069] border border-[#C5A059]/30">
                                    {res.type}
                                  </span>
                                  {res.domain && (
                                    <span className="text-[9px] text-[#777] truncate max-w-[120px]">
                                      {res.domain}
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-xs font-semibold text-[#DDD] group-hover:text-white line-clamp-2 transition-colors">
                                  {res.title}
                                </h4>
                              </div>
                              <div className="mt-2 pt-1 border-t border-[#20180D] flex items-center justify-between text-[10px] text-[#888] font-mono">
                                <span className="truncate max-w-[140px] text-[9.5px]">
                                  {res.id.slice(0, 14)}...
                                </span>
                                <span className="text-[#C5A059] group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-sans font-medium">
                                  Apri <ArrowRight className="w-2.5 h-2.5" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Accordion Traccia di Ragionamento Epistemico degli Agenti */}
                  {msg.response.trace && msg.response.trace.length > 0 && (
                    <div className="mt-2 border-t border-[#1C160E] pt-2">
                      <button
                        onClick={() => toggleTrace(msg.id)}
                        className="w-full flex items-center justify-between text-[11px] font-mono text-[#888] hover:text-[#CCC] transition-colors py-1 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-[#A89874]" />
                          Traccia Epistemica ({msg.response.trace.length} passaggi)
                        </span>
                        {expandedTraceIds[msg.id] ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {expandedTraceIds[msg.id] && (
                        <div className="mt-2 space-y-1.5 bg-[#0A0805] rounded-lg p-2.5 border border-[#1C170E] font-mono text-[11px]">
                          {msg.response.trace.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-[#999]">
                              <span className="text-[#C5A059] shrink-0 font-bold">
                                [{step.agent.slice(0, 5).toUpperCase()}]
                              </span>
                              <div className="flex-1">
                                <span className="text-white font-medium">{step.action}:</span>{" "}
                                <span className="text-[#AAA]">{step.description}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* BARRA AZIONI COMPLETA: COPIA, SCARICA, ARCHIVIA OKF, GRAFO */}
                  <div className="mt-3 pt-2.5 border-t border-[#1C160E] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 relative">
                      {/* 1. MENU A TENDINA COPIA MULTIFORMATO */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDownloadMenuId(null);
                            setOpenCopyMenuId(openCopyMenuId === msg.id ? null : msg.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#18130B] hover:bg-[#241B10] border border-[#2B2012] hover:border-[#C5A059]/50 text-[#C5A059] hover:text-[#E5C170] text-[11px] font-mono transition-all cursor-pointer"
                          title="Copia la risposta in vari formati"
                        >
                          {copiedActionId?.startsWith(msg.id) ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-semibold">Copiato!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copia</span>
                              <ChevronDown className="w-3 h-3 opacity-60" />
                            </>
                          )}
                        </button>

                        {openCopyMenuId === msg.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 bottom-full mb-1 w-64 bg-[#141009] border border-[#3A2D1B] rounded-xl shadow-2xl p-1.5 z-30 font-sans text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150"
                          >
                            <div className="px-2 py-1 text-[10px] font-mono text-[#888] uppercase tracking-wider border-b border-[#221B10]">
                              Formati di Copia
                            </div>
                            <button
                              onClick={() => handleCopyOKF(msg)}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#221A0F] text-left text-[#DDD] hover:text-white transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2">
                                <FileCode className="w-3.5 h-3.5 text-[#C5A059]" />
                                <div>
                                  <div className="font-semibold text-white">Markdown OKF v0.2</div>
                                  <div className="text-[10px] text-[#888]">Con Frontmatter YAML</div>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-[#C5A059] opacity-0 group-hover:opacity-100 transition-opacity">
                                .md
                              </span>
                            </button>

                            <button
                              onClick={() => handleCopyClean(msg)}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#221A0F] text-left text-[#DDD] hover:text-white transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-[#888]" />
                                <div>
                                  <div className="font-semibold text-white">Testo Semplice</div>
                                  <div className="text-[10px] text-[#888]">Solo corpo Markdown</div>
                                </div>
                              </div>
                            </button>

                            <button
                              onClick={() => handleCopyJSON(msg)}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#221A0F] text-left text-[#DDD] hover:text-white transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2">
                                <FileJson className="w-3.5 h-3.5 text-blue-400" />
                                <div>
                                  <div className="font-semibold text-white">JSON Strutturato</div>
                                  <div className="text-[10px] text-[#888]">Metadati, entità & trace</div>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                .json
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 2. MENU A TENDINA SCARICA FILE */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenCopyMenuId(null);
                            setOpenDownloadMenuId(openDownloadMenuId === msg.id ? null : msg.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#18130B] hover:bg-[#241B10] border border-[#2B2012] hover:border-[#C5A059]/50 text-[#C5A059] hover:text-[#E5C170] text-[11px] font-mono transition-all cursor-pointer"
                          title="Scarica la sintesi come file"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Scarica</span>
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        </button>

                        {openDownloadMenuId === msg.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 bottom-full mb-1 w-64 bg-[#141009] border border-[#3A2D1B] rounded-xl shadow-2xl p-1.5 z-30 font-sans text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150"
                          >
                            <div className="px-2 py-1 text-[10px] font-mono text-[#888] uppercase tracking-wider border-b border-[#221B10]">
                              Download File
                            </div>
                            <button
                              onClick={() => handleDownloadMarkdown(msg)}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#221A0F] text-left text-[#DDD] hover:text-white transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2">
                                <FileCode className="w-3.5 h-3.5 text-[#C5A059]" />
                                <div>
                                  <div className="font-semibold text-white">Documento OKF (.md)</div>
                                  <div className="text-[10px] text-[#888]">Pronto per Obsidian/Git</div>
                                </div>
                              </div>
                              <Download className="w-3.5 h-3.5 text-[#C5A059] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>

                            <button
                              onClick={() => handleDownloadJSON(msg)}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#221A0F] text-left text-[#DDD] hover:text-white transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2">
                                <FileJson className="w-3.5 h-3.5 text-blue-400" />
                                <div>
                                  <div className="font-semibold text-white">Dataset Completo (.json)</div>
                                  <div className="text-[10px] text-[#888]">Dati completi per agenti</div>
                                </div>
                              </div>
                              <Download className="w-3.5 h-3.5 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 3. PULSANTE SALVA NEL VAULT COME NOTA OKF */}
                      {onSaveAsNote && (
                        <button
                          onClick={() => handleSaveAsVaultNote(msg)}
                          disabled={isSavingNoteId === msg.id || !!savedNotesMap[msg.id]}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono transition-all cursor-pointer disabled:cursor-default ${
                            savedNotesMap[msg.id]
                              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                              : "bg-[#18130B] hover:bg-[#241B10] border-[#2B2012] hover:border-[#C5A059]/50 text-[#C5A059] hover:text-[#E5C170]"
                          }`}
                          title="Archivia questa sintesi come nuova scheda OKF permanente con collegamenti nel grafo"
                        >
                          {isSavingNoteId === msg.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
                              <span>Archiviazione...</span>
                            </>
                          ) : savedNotesMap[msg.id] ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Archiviata nel Vault</span>
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="w-3.5 h-3.5" />
                              <span>Salva Nota OKF</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* 4. PULSANTE MOSTRA NEL GRAFO */}
                      <button
                        onClick={() => onShowInGraph(msg.response?.graphClusterNodeIds)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#18130B] hover:bg-[#241B10] border border-[#2B2012] hover:border-[#C5A059]/50 text-[#AAA] hover:text-[#E5C170] text-[11px] font-mono transition-all cursor-pointer"
                        title="Passa alla visualizzazione Grafo D3 per esplorare i nodi correlati"
                      >
                        <GitGraph className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Vista Grafo</span>
                      </button>

                      {/* 5. PULSANTE ISPETTORE EPISTEMICO CEKIKJ */}
                      {onOpenCekikjModal && (
                        <button
                          onClick={onOpenCekikjModal}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#18130B] hover:bg-[#241B10] border border-[#2B2012] hover:border-[#C5A059]/50 text-[#C5A059] hover:text-[#E5C170] text-[11px] font-mono transition-all cursor-pointer"
                          title="Apri la console Zero-Guessing e l'ispezione DAG Cekikj"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                          <span>Console Epistemica</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Domande Suggerite Contestuali */}
                  {msg.response.suggestedQuestions && msg.response.suggestedQuestions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#1C160E] space-y-1.5">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-[#666]">
                        Approfondisci con gli agenti:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.response.suggestedQuestions.map((sq, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(sq)}
                            className="text-left text-[11px] px-2.5 py-1 rounded-full bg-[#18130B] hover:bg-[#241B10] border border-[#2B2012] hover:border-[#C5A059]/50 text-[#C5A059] hover:text-[#E5C170] transition-colors cursor-pointer"
                          >
                            {sq}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Errore eventuale */}
              {msg.error && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/50 text-red-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-red-300">Errore interrogazione:</div>
                    <p className="mt-0.5">{msg.error}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Indicatore di Caricamento con Pipeline Agenti Live */}
          {isLoading && (
            <div className="p-4 rounded-xl bg-[#120E08] border border-[#C5A059]/40 shadow-lg space-y-3 animate-pulse">
              <div className="flex items-center justify-between text-xs text-[#C5A059] font-mono">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#C5A059]" />
                  Orchestrazione in corso...
                </span>
                <span className="text-[10px] text-[#888]">
                  Fase {activeStageIndex + 1} di {stages.length}
                </span>
              </div>

              {/* Pipeline Step Indicator */}
              <div className="space-y-1.5 font-mono text-[11px]">
                {stages.map((st, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 transition-all ${
                      idx === activeStageIndex
                        ? "text-white font-bold"
                        : idx < activeStageIndex
                        ? "text-emerald-400/80"
                        : "text-[#555]"
                    }`}
                  >
                    <span className="w-4 text-center">
                      {idx < activeStageIndex ? "✓" : idx === activeStageIndex ? "▶" : "○"}
                    </span>
                    <span className="w-36 truncate">{st.title}</span>
                    <span className="text-[10px] text-[#777] hidden sm:inline">
                      {st.desc}
                    </span>
                  </div>
                ))}
              </div>

              {/* Live Streaming Activity Feed */}
              {(() => {
                const lastMsg = conversation[conversation.length - 1];
                const traces = lastMsg?.liveTraces || [];
                if (traces.length === 0) return null;
                return (
                  <div className="mt-2 pt-2 border-t border-[#221A10] space-y-1">
                    <div className="text-[10px] text-[#C5A059] uppercase tracking-wider font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Attività Agenti in Streaming SSE:
                    </div>
                    {traces.slice(-3).map((tr, i) => (
                      <div key={i} className="text-[10.5px] text-[#BBB] font-mono flex items-center gap-1.5 truncate">
                        <span className="text-emerald-400">⚡</span>
                        <span className="text-[#C5A059] font-semibold">[{tr.agent}]</span>
                        <span className="truncate text-[#DDD]">{tr.action}: {tr.description}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Barra di Input Inferiore */}
        <div className="p-3 bg-[#100C07] border-t border-[#221A10] shrink-0 space-y-2">
          {/* Badge del Contesto Attivo */}
          <div className="flex items-center justify-between text-[10px] font-mono text-[#777] px-1">
            <span className="flex items-center gap-1 truncate">
              <Compass className="w-3 h-3 text-[#C5A059]" />
              Contesto: {resources.length} risorse ({activeCategory ? activeCategory.toUpperCase() : "TUTTE"})
              {activeTag && <span className="text-[#C5A059]"> • Tag: {activeTag}</span>}
            </span>
            <span className="hidden sm:inline text-[#555]">Invio per inviare</span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="relative flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Chiedi al Vault (es. Quali server MCP gestiscono file e database?)..."
              disabled={isLoading}
              className="flex-1 bg-[#18130B] border border-[#2B2113] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/40 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#F0E6D2] placeholder-[#666] resize-none outline-hidden transition-all font-sans leading-relaxed disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!query.trim() || isLoading}
              className="h-10 px-4 rounded-xl bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#2A2214] text-black disabled:text-[#555] font-semibold flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed shadow-md shrink-0"
              title="Invia richiesta (Invio)"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
};
