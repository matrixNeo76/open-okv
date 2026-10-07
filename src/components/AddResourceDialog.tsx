import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  X, 
  Sparkles, 
  Plus, 
  BookOpen, 
  Github, 
  Cpu, 
  Bot, 
  Loader2,
  Wand2,
  Layers,
  FileText,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ListPlus,
  ArrowRight,
  ExternalLink,
  Tag,
  Trash2,
  Play,
  Check,
  HelpCircle,
  Database,
  Globe,
  BrainCircuit,
  Wrench,
  GraduationCap,
  Rss,
  StickyNote,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Network,
  Share2,
  Info,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Compass,
  Workflow
} from "lucide-react";
import { ResourceItem, ResourceType, OKFEntity, OKFRelation } from "../types";

export interface IngestionTraceStep {
  agent: "orchestrator" | "structural_deconstructor" | "ontologist" | "graph_linker" | "contradiction_sentinel" | "okf_serializer";
  action: string;
  description: string;
  itemsFound?: number;
  status: "success" | "warning" | "insufficient";
  timestamp: string;
  latencyMs: number;
}

export interface IngestionContradictionWarning {
  hasConflict: boolean;
  conceptName?: string;
  conflictingSourceTitle?: string;
  conflictReason?: string;
  severity?: "low" | "medium" | "high";
}

interface AddResourceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (newResource: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<boolean>;
  onAnalyzeWithAI: (input: string, explicitType?: ResourceType) => Promise<any>;
  existingResources?: ResourceItem[];
  onOpenIntelligence?: (prefillQuery?: string) => void;
  onAddLog?: (level: any, category: any, message: string, details?: any) => void;
}

interface BulkItem {
  id: string;
  rawText: string;
  status: "idle" | "analyzing" | "saving" | "success" | "error";
  errorMessage?: string;
  analyzedData?: {
    type: ResourceType;
    title: string;
    url?: string;
    summary: string;
    tags: string[];
    metadata?: any;
  };
}

const CATEGORY_DEFINITIONS: Array<{
  id: ResourceType;
  label: string;
  icon: React.ReactNode;
  defaultDocType: string;
  color: string;
  badgeBg: string;
  borderColor: string;
}> = [
  { id: "troubleshooting", label: "Problema & Fix", icon: <Wrench className="w-3.5 h-3.5 text-[#F97316]" />, defaultDocType: "guide", color: "#F97316", badgeBg: "bg-[#F97316]/10", borderColor: "border-[#F97316]/40" },
  { id: "procedure", label: "Procedura / SOP", icon: <Workflow className="w-3.5 h-3.5 text-[#22D3EE]" />, defaultDocType: "guide", color: "#22D3EE", badgeBg: "bg-[#22D3EE]/10", borderColor: "border-[#22D3EE]/40" },
  { id: "knowledge", label: "Knowledge (OKF)", icon: <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059]" />, defaultDocType: "specification", color: "#C5A059", badgeBg: "bg-[#C5A059]/10", borderColor: "border-[#C5A059]/40" },
  { id: "github_repo", label: "GitHub Repo", icon: <Github className="w-3.5 h-3.5 text-[#A855F7]" />, defaultDocType: "architecture", color: "#A855F7", badgeBg: "bg-[#A855F7]/10", borderColor: "border-[#A855F7]/40" },
  { id: "mcp_server", label: "MCP Server", icon: <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />, defaultDocType: "tool_description", color: "#38BDF8", badgeBg: "bg-[#38BDF8]/10", borderColor: "border-[#38BDF8]/40" },
  { id: "ai_skill", label: "AI Skill", icon: <Bot className="w-3.5 h-3.5 text-[#10B981]" />, defaultDocType: "prompt_skill", color: "#10B981", badgeBg: "bg-[#10B981]/10", borderColor: "border-[#10B981]/40" },
  { id: "paper", label: "Paper", icon: <GraduationCap className="w-3.5 h-3.5 text-[#818CF8]" />, defaultDocType: "concept", color: "#818CF8", badgeBg: "bg-[#818CF8]/10", borderColor: "border-[#818CF8]/40" },
  { id: "article", label: "Articolo", icon: <BookOpen className="w-3.5 h-3.5 text-[#F59E0B]" />, defaultDocType: "guide", color: "#F59E0B", badgeBg: "bg-[#F59E0B]/10", borderColor: "border-[#F59E0B]/40" },
  { id: "link", label: "Link Web", icon: <Globe className="w-3.5 h-3.5 text-[#06B6D4]" />, defaultDocType: "tool_description", color: "#06B6D4", badgeBg: "bg-[#06B6D4]/10", borderColor: "border-[#06B6D4]/40" },
  { id: "rss", label: "Feed RSS", icon: <Rss className="w-3.5 h-3.5 text-[#FB923C]" />, defaultDocType: "tool_description", color: "#FB923C", badgeBg: "bg-[#FB923C]/10", borderColor: "border-[#FB923C]/40" },
  { id: "note", label: "Nota Rapida", icon: <StickyNote className="w-3.5 h-3.5 text-[#FBBF24]" />, defaultDocType: "concept", color: "#FBBF24", badgeBg: "bg-[#FBBF24]/10", borderColor: "border-[#FBBF24]/40" },
];

const SUGGESTED_TAGS_BY_CATEGORY: Record<ResourceType, string[]> = {
  troubleshooting: ["debug", "fix", "windows", "dll", "crash", "performance", "sac"],
  procedure: ["procedure", "playbook", "sop", "operativo", "manutenzione", "onboarding", "assistenza"],
  knowledge: ["okf", "architecture", "design-pattern", "spec", "second-brain"],
  github_repo: ["github", "open-source", "typescript", "react", "cli", "library"],
  mcp_server: ["mcp", "claude", "tools", "protocol", "server", "stdio", "agents"],
  ai_skill: ["prompt", "agents", "persona", "system-prompt", "gemini", "workflow"],
  paper: ["paper", "arxiv", "deep-learning", "transformers", "benchmark", "research"],
  article: ["guide", "tutorial", "best-practices", "deep-dive", "insights"],
  link: ["tool", "reference", "saas", "dashboard", "portal", "docs"],
  rss: ["rss", "atom", "news", "feeds", "tech-blog"],
  note: ["note", "scratchpad", "idea", "todo", "memo"],
  document_refactor: ["refactoring", "okf-v0.2", "bozza", "miglioramento", "normalizzazione", "diff"],
};

const COMMON_DOMAINS = [
  "Agentic Systems & AI",
  "Model Context Protocol & Tools",
  "Software Architecture & Design",
  "Frontend & Web Engineering",
  "DevOps & Cloud Infrastructure",
  "Security & System Diagnostics",
  "Scientific & Applied AI Research",
  "Knowledge Engineering"
];

export const AddResourceDialog: React.FC<AddResourceDialogProps> = ({
  isOpen,
  onClose,
  onAdd,
  onAnalyzeWithAI,
  existingResources,
  onOpenIntelligence,
  onAddLog,
}) => {
  // Modal Mode: Single Resource vs. Bulk Import
  const [modalMode, setModalMode] = useState<"single" | "bulk">("single");

  // Orchestrator & Multi-Agent Ingestion Pipeline State
  const [aiMode, setAiMode] = useState<"agentic" | "flash">("agentic");
  const [agentSteps, setAgentSteps] = useState<IngestionTraceStep[]>([]);
  const [orchestratorPlan, setOrchestratorPlan] = useState<string | null>(null);
  const [contradictionWarning, setContradictionWarning] = useState<IngestionContradictionWarning | null>(null);
  const [isExecutingAgents, setIsExecutingAgents] = useState(false);
  const [showAgentTrace, setShowAgentTrace] = useState(false);

  // Single Add Form State
  const [type, setType] = useState<ResourceType>("github_repo");
  const [hasUserSelectedType, setHasUserSelectedType] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [mcpConfig, setMcpConfig] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [installCommand, setInstallCommand] = useState("");
  const [affectedSystem, setAffectedSystem] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [attemptedFixesStr, setAttemptedFixesStr] = useState("");
  const [solutionStepsStr, setSolutionStepsStr] = useState("");
  const [userNotes, setUserNotes] = useState("");

  // Procedure & SOP State
  const [procedureType, setProcedureType] = useState("customer_support");
  const [targetSystem, setTargetSystem] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [riskLevel, setRiskLevel] = useState("low");
  const [requiredToolsStr, setRequiredToolsStr] = useState("");
  const [safetyWarningsStr, setSafetyWarningsStr] = useState("");
  const [prerequisitesStr, setPrerequisitesStr] = useState("");
  const [rollbackPlan, setRollbackPlan] = useState("");

  const [arxivId, setArxivId] = useState("");
  const [authorsStr, setAuthorsStr] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [venue, setVenue] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [noteCategory, setNoteCategory] = useState("scratchpad");

  // OKF v0.2 Protocol & Graph Topology State
  const [domain, setDomain] = useState("Agentic Systems & AI");
  const [docType, setDocType] = useState("architecture");
  const [entities, setEntities] = useState<OKFEntity[]>([]);
  const [relations, setRelations] = useState<OKFRelation[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [markdownContent, setMarkdownContent] = useState("");
  const [showAdvancedOkf, setShowAdvancedOkf] = useState(false);

  // New Entity / Relation input sub-state
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState("Technology");
  const [newRelationTarget, setNewRelationTarget] = useState("");
  const [newRelationType, setNewRelationType] = useState("relates_to");

  // JSON Validation sub-state for MCP
  const [jsonValidationStatus, setJsonValidationStatus] = useState<null | "valid" | "invalid">(null);

  // AI & Submission Status
  const [aiInputPrompt, setAiInputPrompt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Import State
  const [bulkRawText, setBulkRawText] = useState("");
  const [bulkSplitMode, setBulkSplitMode] = useState<"lines" | "paragraphs">("lines");
  const [bulkDefaultType, setBulkDefaultType] = useState<ResourceType | "auto">("auto");
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgressIndex, setBulkProgressIndex] = useState(0);
  const cancelBulkRef = useRef(false);

  // Reset entire form to default clean state
  const resetForm = () => {
    setType("github_repo");
    setTitle("");
    setUrl("");
    setSummary("");
    setTagsStr("");
    setMcpConfig("");
    setSystemPrompt("");
    setInstallCommand("");
    setAffectedSystem("");
    setRootCause("");
    setAttemptedFixesStr("");
    setSolutionStepsStr("");
    setUserNotes("");
    setProcedureType("customer_support");
    setTargetSystem("");
    setEstimatedDuration("");
    setRiskLevel("low");
    setRequiredToolsStr("");
    setSafetyWarningsStr("");
    setPrerequisitesStr("");
    setRollbackPlan("");
    setArxivId("");
    setAuthorsStr("");
    setPdfUrl("");
    setVenue("");
    setFeedUrl("");
    setNoteCategory("scratchpad");
    setDomain("Agentic Systems & AI");
    setDocType("architecture");
    setEntities([]);
    setRelations([]);
    setScore(null);
    setMarkdownContent("");
    setAiInputPrompt("");
    setAiSuccessMessage(null);
    setAiErrorMessage(null);
    setFormErrorMessage(null);
    setShowAdvancedOkf(false);
    setJsonValidationStatus(null);
    setNewEntityName("");
    setNewRelationTarget("");
    setAgentSteps([]);
    setOrchestratorPlan(null);
    setContradictionWarning(null);
    setIsExecutingAgents(false);
    setShowAgentTrace(false);
    setHasUserSelectedType(false);
  };

  // Auto-detect resource category when user types or pastes text/URL in AI input, unless user explicitly chose a category
  useEffect(() => {
    if (hasUserSelectedType) return;
    const trimmed = aiInputPrompt.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("http")) {
      if (trimmed.includes("github.com/")) {
        setType("github_repo");
      } else if (trimmed.includes("arxiv.org/")) {
        setType("paper");
      } else {
        setType("link");
      }
    } else {
      const lower = trimmed.toLowerCase();
      if (
        lower.includes("procedura operativa standard") ||
        lower.includes("procedura operativa") ||
        lower.includes("(sop)") ||
        lower.startsWith("procedura:") ||
        lower.startsWith("sop:") ||
        lower.startsWith("playbook:") ||
        (lower.includes("procedura") && (lower.includes("assistenza") || lower.includes("manutenzione") || lower.includes("step") || lower.includes("passo")))
      ) {
        setType("procedure");
      } else if (
        (lower.includes("problema") && (lower.includes("soluzione") || lower.includes("risoluzione"))) ||
        lower.includes("root cause") ||
        (lower.includes("errore") && lower.includes(".dll"))
      ) {
        setType("troubleshooting");
      }
    }
  }, [aiInputPrompt, hasUserSelectedType]);

  // Sync default docType when type changes (if not populated by AI)
  useEffect(() => {
    const cat = CATEGORY_DEFINITIONS.find((c) => c.id === type);
    if (cat && !entities.length) {
      setDocType(cat.defaultDocType);
    }
  }, [type, entities.length]);

  // Parse bulk text into items whenever bulkRawText or bulkSplitMode changes
  useEffect(() => {
    if (isBulkProcessing) return;
    const text = bulkRawText.trim();
    if (!text) {
      setBulkItems([]);
      return;
    }

    let chunks: string[] = [];
    if (bulkSplitMode === "lines") {
      chunks = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    } else {
      chunks = text
        .split(/(?:\r?\n\s*\r?\n|(?:\r?\n)?---\s*(?:\r?\n)?)/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
    }

    const items: BulkItem[] = chunks.map((chunk, idx) => ({
      id: `item-${idx}-${Date.now()}`,
      rawText: chunk,
      status: "idle",
    }));

    setBulkItems(items);
  }, [bulkRawText, bulkSplitMode, isBulkProcessing]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting && !isBulkProcessing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isSubmitting, isBulkProcessing]);

  // Compute tag suggestions for currently selected category
  const suggestedTags = useMemo(() => {
    const currentTags = tagsStr.split(",").map((t) => t.trim().toLowerCase());
    return (SUGGESTED_TAGS_BY_CATEGORY[type] || []).filter((t) => !currentTags.includes(t));
  }, [tagsStr, type]);

  // Intent Detection: check if input prompt looks like an analytical query for the orchestrator
  const isAnalyticalQuery = useMemo(() => {
    const trimmed = aiInputPrompt.trim().toLowerCase();
    if (!trimmed || trimmed.startsWith("http")) return false;
    const analyticalKeywords = [
      "cosa ", "come ", "perché ", "perche ", "qual è ", "quali ", "chi ",
      "confronta", "analizza", "audit", "differenza", "spiega", "search",
      "trova", "quali sono", "riassumi", "valuta", "verificare", "relazione tra"
    ];
    return trimmed.endsWith("?") || analyticalKeywords.some((kw) => trimmed.startsWith(kw) || trimmed.includes(` ${kw}`));
  }, [aiInputPrompt]);

  // Mandatory Early Return strictly after all hooks
  if (!isOpen) return null;

  // Single Auto-Fill Helper with full metadata retention
  const handleAIAutoFill = async (overridePrompt?: string) => {
    const promptToUse = (overridePrompt || aiInputPrompt).trim();
    if (!promptToUse || isAnalyzing) return;
    
    setIsAnalyzing(true);
    setAiErrorMessage(null);
    setAiSuccessMessage(null);
    setFormErrorMessage(null);

    try {
      const data = await onAnalyzeWithAI(promptToUse, hasUserSelectedType ? type : undefined);
      if (data && data.title) {
        if (data.title) setTitle(data.title);
        if (data.url) setUrl(data.url);
        if (data.summary) setSummary(data.summary);
        if (data.tags && Array.isArray(data.tags)) setTagsStr(data.tags.join(", "));
        if (data.type) {
          setType(data.type);
          setHasUserSelectedType(true);
        }

        // Retain OKF metadata
        if (data.metadata?.domain) setDomain(data.metadata.domain);
        if (data.metadata?.docType) setDocType(data.metadata.docType);
        if (typeof data.metadata?.score === "number") setScore(data.metadata.score);
        if (Array.isArray(data.metadata?.entities) && data.metadata.entities.length > 0) {
          const formattedEntities: OKFEntity[] = data.metadata.entities.map((e: any) => 
            typeof e === "string" ? { name: e, type: "Concept" } : { name: e.name || String(e), type: e.type || "Concept", description: e.description }
          );
          setEntities(formattedEntities);
          setShowAdvancedOkf(true);
        }
        if (Array.isArray(data.metadata?.relations) && data.metadata.relations.length > 0) {
          setRelations(data.metadata.relations);
          setShowAdvancedOkf(true);
        }
        if (data.metadata?.markdownContent) {
          setMarkdownContent(data.metadata.markdownContent);
        }

        // Retain specific category metadata
        if (data.metadata?.configSnippet) setMcpConfig(data.metadata.configSnippet);
        if (data.metadata?.systemPrompt) setSystemPrompt(data.metadata.systemPrompt);
        if (data.metadata?.installCommand) setInstallCommand(data.metadata.installCommand);
        if (data.metadata?.affectedSystem) setAffectedSystem(data.metadata.affectedSystem);
        if (data.metadata?.rootCause) setRootCause(data.metadata.rootCause);
        if (Array.isArray(data.metadata?.attemptedFixes)) setAttemptedFixesStr(data.metadata.attemptedFixes.join("\n"));
        if (Array.isArray(data.metadata?.solutionSteps)) setSolutionStepsStr(data.metadata.solutionSteps.join("\n"));
        if (data.metadata?.procedureType) setProcedureType(data.metadata.procedureType);
        if (data.metadata?.targetSystem) setTargetSystem(data.metadata.targetSystem);
        if (data.metadata?.estimatedDuration) setEstimatedDuration(data.metadata.estimatedDuration);
        if (data.metadata?.riskLevel) setRiskLevel(data.metadata.riskLevel);
        if (Array.isArray(data.metadata?.requiredTools)) setRequiredToolsStr(data.metadata.requiredTools.join("\n"));
        if (Array.isArray(data.metadata?.safetyWarnings)) setSafetyWarningsStr(data.metadata.safetyWarnings.join("\n"));
        if (Array.isArray(data.metadata?.prerequisites)) setPrerequisitesStr(data.metadata.prerequisites.join("\n"));
        if (data.metadata?.rollbackPlan) setRollbackPlan(data.metadata.rollbackPlan);
        if (data.metadata?.userNotes) setUserNotes(data.metadata.userNotes);
        if (data.metadata?.arxivId) setArxivId(data.metadata.arxivId);
        if (Array.isArray(data.metadata?.authors)) setAuthorsStr(data.metadata.authors.join(", "));
        if (data.metadata?.pdfUrl) setPdfUrl(data.metadata.pdfUrl);
        if (data.metadata?.venue) setVenue(data.metadata.venue);
        if (data.metadata?.feedUrl) setFeedUrl(data.metadata.feedUrl);
        if (data.metadata?.noteCategory) setNoteCategory(data.metadata.noteCategory);

        const entCount = data.metadata?.entities?.length || 0;
        const relCount = data.metadata?.relations?.length || 0;
        setAiSuccessMessage(
          `✓ Dati estratti con successo (${data.type.toUpperCase()}) con Gemini AI: ` +
          `Dominio "${data.metadata?.domain || 'Specificato'}", ${entCount} entità e ${relCount} relazioni tracciate.`
        );
      } else {
        throw new Error("L'analisi semantica non ha restituito dati validi");
      }
    } catch (e: any) {
      console.error(e);
      setAiErrorMessage(e?.message || "Errore durante l'analisi con Gemini AI. Verifica la connessione o compila i campi manualmente.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Multi-Agent Pipeline Auto-Fill with Orchestrator, Graph Linker & Contradiction Sentinel
  const handleAgenticAutoFill = async (overridePrompt?: string) => {
    const promptToUse = (overridePrompt || aiInputPrompt).trim();
    if (!promptToUse || isAnalyzing) return;

    setIsAnalyzing(true);
    setIsExecutingAgents(true);
    setAiErrorMessage(null);
    setAiSuccessMessage(null);
    setFormErrorMessage(null);
    setContradictionWarning(null);
    setAgentSteps([]);
    setOrchestratorPlan(null);

    if (onAddLog) {
      onAddLog(
        "info",
        "CAPTURE",
        `Avvio Orchestratore Ingestione Multi-Agente per: "${promptToUse.slice(0, 60)}..."`
      );
    }

    try {
      const isWebUrl = promptToUse.startsWith("http");
      const urlMatch = promptToUse.match(/https?:\/\/[^\s]+/i);
      const targetUrl = isWebUrl ? promptToUse.trim() : (urlMatch ? urlMatch[0] : (url || undefined));

      const response = await fetch("/api/vault/agentic-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: promptToUse,
          url: targetUrl,
          explicitType: hasUserSelectedType ? type : undefined,
          existingResources: (existingResources || []).map((r) => ({
            id: r.id,
            title: r.title,
            type: r.type,
            domain: r.metadata?.domain,
            tags: r.tags,
            summary: r.summary,
          })),
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Errore server (${response.status}) durante l'ingestione agenziale`);
      }

      const result = await response.json();
      if (!result.success || !result.resource) {
        throw new Error(result.error || "La pipeline agenziale non ha restituito una risorsa valida");
      }

      const resData = result.resource;
      if (resData.title) setTitle(resData.title);
      if (resData.summary) setSummary(resData.summary);
      if (Array.isArray(resData.tags)) setTagsStr(resData.tags.join(", "));
      if (resData.type) {
        setType(resData.type);
        setHasUserSelectedType(true);
      }
      if (resData.url) setUrl(resData.url);
      else if (targetUrl) setUrl(targetUrl);

      // Metadati OKF v0.2
      if (resData.metadata?.domain) setDomain(resData.metadata.domain);
      if (resData.metadata?.docType) setDocType(resData.metadata.docType);
      if (Array.isArray(resData.metadata?.entities) && resData.metadata.entities.length > 0) {
        setEntities(resData.metadata.entities);
        setShowAdvancedOkf(true);
      }
      if (Array.isArray(resData.metadata?.relations) && resData.metadata.relations.length > 0) {
        setRelations(resData.metadata.relations);
        setShowAdvancedOkf(true);
      }
      if (resData.metadata?.markdownContent) {
        setMarkdownContent(resData.metadata.markdownContent);
      }

      // Retain specific category and procedure metadata
      if (resData.metadata?.procedureType) setProcedureType(resData.metadata.procedureType);
      if (resData.metadata?.targetSystem) setTargetSystem(resData.metadata.targetSystem);
      if (resData.metadata?.estimatedDuration) setEstimatedDuration(resData.metadata.estimatedDuration);
      if (resData.metadata?.riskLevel) setRiskLevel(resData.metadata.riskLevel);
      if (Array.isArray(resData.metadata?.requiredTools)) setRequiredToolsStr(resData.metadata.requiredTools.join("\n"));
      if (Array.isArray(resData.metadata?.safetyWarnings)) setSafetyWarningsStr(resData.metadata.safetyWarnings.join("\n"));
      if (Array.isArray(resData.metadata?.prerequisites)) setPrerequisitesStr(resData.metadata.prerequisites.join("\n"));
      if (resData.metadata?.rollbackPlan) setRollbackPlan(resData.metadata.rollbackPlan);
      if (Array.isArray(resData.metadata?.solutionSteps)) setSolutionStepsStr(resData.metadata.solutionSteps.join("\n"));
      if (resData.metadata?.affectedSystem) setAffectedSystem(resData.metadata.affectedSystem);
      if (resData.metadata?.rootCause) setRootCause(resData.metadata.rootCause);
      if (Array.isArray(resData.metadata?.attemptedFixes)) setAttemptedFixesStr(resData.metadata.attemptedFixes.join("\n"));
      if (resData.metadata?.configSnippet) setMcpConfig(resData.metadata.configSnippet);
      if (resData.metadata?.systemPrompt) setSystemPrompt(resData.metadata.systemPrompt);
      if (resData.metadata?.installCommand) setInstallCommand(resData.metadata.installCommand);

      // Tracing steps & Orchestrator Plan
      if (Array.isArray(result.agentSteps)) {
        setAgentSteps(result.agentSteps);
      }
      if (result.orchestratorPlan) {
        setOrchestratorPlan(result.orchestratorPlan);
      }

      // Contradiction Warning Sentinel
      if (result.contradictionWarning?.hasConflict) {
        setContradictionWarning(result.contradictionWarning);
        if (onAddLog) {
          onAddLog(
            "warn",
            "CAPTURE",
            `Contradiction Sentinel: rilevato potenziale conflitto su "${result.contradictionWarning.conceptName}" con "${result.contradictionWarning.conflictingSourceTitle}"`,
            result.contradictionWarning
          );
        }
      }

      const entCount = resData.metadata?.entities?.length || 0;
      const relCount = resData.metadata?.relations?.length || 0;
      const stepCount = result.agentSteps?.length || 0;
      const categoryLabel = CATEGORY_DEFINITIONS.find((c) => c.id === resData.type)?.label || resData.type;

      setAiSuccessMessage(
        `✓ Pipeline Ingestione Agenti completata (${stepCount} agenti, ${result.executionTimeMs || 0}ms): ` +
        `Classificata come "${categoryLabel}" (Dominio "${resData.metadata?.domain || 'Specificato'}", ${entCount} entità e ${relCount} relazioni nel grafo).`
      );

      if (onAddLog) {
        onAddLog(
          "success",
          "CAPTURE",
          `Ingestione Agenti completata per "${resData.title}" (${categoryLabel}) con ${result.modelUsed || "Gemini"}`,
          { entCount, relCount, stepCount, type: resData.type }
        );
      }
    } catch (err: any) {
      console.warn("[AGENTIC_INGEST_FALLBACK]", err);
      if (onAddLog) {
        onAddLog("warn", "CAPTURE", `Fallback automatico a Flash Auto-Fill: ${err?.message}`);
      }
      // Graceful fallback to standard auto-fill
      try {
        await handleAIAutoFill(promptToUse);
      } catch (fallbackErr: any) {
        setAiErrorMessage(err?.message || "Errore durante l'esecuzione della pipeline agenziale.");
      }
    } finally {
      setIsAnalyzing(false);
      setIsExecutingAgents(false);
    }
  };

  // Dispatcher based on active mode
  const handleExecuteAI = async (overridePrompt?: string) => {
    if (aiMode === "agentic") {
      await handleAgenticAutoFill(overridePrompt);
    } else {
      await handleAIAutoFill(overridePrompt);
    }
  };

  // Helper to append a suggested tag
  const handleAddTag = (tagToAdd: string) => {
    const current = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
    if (!current.includes(tagToAdd)) {
      const updated = [...current, tagToAdd];
      setTagsStr(updated.join(", "));
    }
  };

  // Helper to add a custom entity
  const handleAddNewEntity = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newEntityName.trim()) return;
    setEntities((prev) => [
      ...prev,
      { name: newEntityName.trim(), type: newEntityType.trim() || "Concept" },
    ]);
    setNewEntityName("");
  };

  const handleRemoveEntity = (indexToRemove: number) => {
    setEntities((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Helper to add a custom relation
  const handleAddNewRelation = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newRelationTarget.trim()) return;
    setRelations((prev) => [
      ...prev,
      {
        targetTitle: newRelationTarget.trim(),
        relationType: newRelationType,
        weight: 1,
      },
    ]);
    setNewRelationTarget("");
  };

  const handleRemoveRelation = (indexToRemove: number) => {
    setRelations((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Helper to validate MCP JSON Config
  const handleValidateMcpJson = () => {
    if (!mcpConfig.trim()) {
      setJsonValidationStatus(null);
      return;
    }
    try {
      JSON.parse(mcpConfig);
      setJsonValidationStatus("valid");
    } catch {
      setJsonValidationStatus("invalid");
    }
  };

  // Paste from clipboard helper for Auto-Fill
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setAiInputPrompt(text);
      }
    } catch (err) {
      console.warn("Clipboard access denied or unavailable", err);
    }
  };

  // Single Form Submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrorMessage(null);

    if (!title.trim() || !summary.trim() || isSubmitting) {
      setFormErrorMessage("Il Titolo e la Descrizione/Sommario sono campi obbligatori.");
      return;
    }

    setIsSubmitting(true);
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith("github.com/")) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const tagsArray = tagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    // Guaranteed Standard OKF v0.2 metadata
    const metadata: Record<string, any> = {
      okfVersion: "0.2",
      domain: domain.trim() || "Agentic Systems & AI",
      docType: docType.trim() || "architecture",
      entities: entities.length > 0 ? entities : undefined,
      relations: relations.length > 0 ? relations : undefined,
      score: score !== null ? score : undefined,
      markdownContent: markdownContent.trim() || undefined,
    };

    if (type === "procedure") {
      metadata.procedureType = procedureType.trim() || "customer_support";
      if (targetSystem.trim()) metadata.targetSystem = targetSystem.trim();
      if (estimatedDuration.trim()) metadata.estimatedDuration = estimatedDuration.trim();
      metadata.riskLevel = riskLevel || "low";
      if (requiredToolsStr.trim()) {
        metadata.requiredTools = requiredToolsStr.split("\n").map((s) => s.trim().replace(/^[-*•]\s*/, "")).filter(Boolean);
      }
      if (safetyWarningsStr.trim()) {
        metadata.safetyWarnings = safetyWarningsStr.split("\n").map((s) => s.trim().replace(/^[-*•]\s*/, "")).filter(Boolean);
      }
      if (prerequisitesStr.trim()) {
        metadata.prerequisites = prerequisitesStr.split("\n").map((s) => s.trim().replace(/^[-*•]\s*/, "")).filter(Boolean);
      }
      if (rollbackPlan.trim()) {
        metadata.rollbackPlan = rollbackPlan.trim();
      }
      if (solutionStepsStr.trim()) {
        const steps = solutionStepsStr.split("\n").map((s) => s.trim().replace(/^[-*•\d.]\s*/, "")).filter(Boolean);
        metadata.solutionSteps = steps;
        metadata.stepsCount = steps.length;
      }
      metadata.docType = docType || "guide";
      if (!tagsArray.includes("procedure")) tagsArray.push("procedure");
      if (!tagsArray.includes("sop")) tagsArray.push("sop");
      if (!tagsArray.includes("playbook")) tagsArray.push("playbook");
    }

    if (type === "troubleshooting") {
      if (affectedSystem) metadata.affectedSystem = affectedSystem;
      if (rootCause) metadata.rootCause = rootCause;
      if (attemptedFixesStr) {
        metadata.attemptedFixes = attemptedFixesStr
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      if (solutionStepsStr) {
        metadata.solutionSteps = solutionStepsStr
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      metadata.docType = docType || "guide";
      if (!tagsArray.includes("troubleshooting")) tagsArray.push("troubleshooting");
    }
    if (type === "paper") {
      if (arxivId.trim()) {
        metadata.arxivId = arxivId.trim();
        metadata.pdfUrl = pdfUrl.trim() || `https://arxiv.org/pdf/${arxivId.trim()}.pdf`;
        if (!cleanUrl) cleanUrl = `https://arxiv.org/abs/${arxivId.trim()}`;
      } else if (pdfUrl.trim()) {
        metadata.pdfUrl = pdfUrl.trim();
      }
      if (authorsStr.trim()) {
        metadata.authors = authorsStr.split(",").map((a) => a.trim()).filter(Boolean);
      }
      if (venue.trim()) metadata.venue = venue.trim();
      metadata.docType = docType || "concept";
      if (!tagsArray.includes("paper")) tagsArray.push("paper");
    }
    if (type === "rss") {
      metadata.feedUrl = feedUrl.trim() || cleanUrl;
      metadata.feedFormat = (feedUrl || cleanUrl).includes("atom") ? "atom" : "rss";
      metadata.docType = docType || "tool_description";
      if (!tagsArray.includes("rss")) tagsArray.push("rss");
    }
    if (type === "note") {
      metadata.noteCategory = noteCategory || "scratchpad";
      metadata.docType = docType || "concept";
      if (!metadata.markdownContent) metadata.markdownContent = summary.trim();
      if (!tagsArray.includes("note")) tagsArray.push("note");
    }
    if (type === "mcp_server" && mcpConfig) {
      metadata.configSnippet = mcpConfig;
      metadata.docType = docType || "tool_description";
      if (!tagsArray.includes("mcp")) tagsArray.push("mcp");
    }
    if (type === "ai_skill" && systemPrompt) {
      metadata.systemPrompt = systemPrompt;
      metadata.docType = docType || "prompt_skill";
      if (!tagsArray.includes("skill")) tagsArray.push("skill");
    }
    if (userNotes.trim()) metadata.userNotes = userNotes.trim();
    if (type === "github_repo") {
      const ghRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/i;
      const matchGh = (cleanUrl || title).match(ghRegex);
      if (matchGh) {
        metadata.owner = matchGh[1];
        metadata.repoName = matchGh[2].replace(/\.git$/, "").replace(/[#?].*$/, "");
        if (!installCommand) {
          metadata.installCommand = `git clone https://github.com/${metadata.owner}/${metadata.repoName}.git`;
        }
      }
      if (installCommand) metadata.installCommand = installCommand;
      metadata.docType = docType || "architecture";
      if (!tagsArray.includes("github")) tagsArray.push("github");
    }
    if (type === "link") {
      metadata.docType = docType || "tool_description";
      if (markdownContent && !markdownContent.trim().startsWith("#")) {
        metadata.markdownContent = markdownContent.trim();
      } else {
        delete metadata.markdownContent;
      }
    }

    try {
      const success = await onAdd({
        type,
        title: title.trim(),
        url: cleanUrl || "",
        summary: summary.trim(),
        tags: tagsArray,
        isFavorite: false,
        metadata,
      });

      setIsSubmitting(false);
      if (success) {
        resetForm();
        onClose();
      } else {
        setFormErrorMessage("Impossibile salvare la risorsa nel database. Verifica la connessione.");
      }
    } catch (saveErr: any) {
      setIsSubmitting(false);
      setFormErrorMessage(saveErr?.message || "Errore di salvataggio in Firestore.");
    }
  };

  // Sample Data for Quick Bulk Import Testing
  const loadBulkSamples = () => {
    const samples = [
      "https://github.com/anthropics/anthropic-quickstarts",
      "https://github.com/modelcontextprotocol/servers",
      "PostgreSQL MCP Server: Configurazione e tool per interrogare database relazionali con Claude",
      "Prompt Skill: Senior Software Architect persona per revisione architettura microservizi e cloud",
      "https://news.ycombinator.com/item?id=38870123"
    ].join("\n");
    setBulkSplitMode("lines");
    setBulkRawText(samples);
  };

  // Process a single bulk item through AI and save to Firestore
  const processSingleBulkItem = async (item: BulkItem, explicitType?: ResourceType): Promise<boolean> => {
    try {
      const targetType = explicitType || (bulkDefaultType === "auto" ? undefined : bulkDefaultType);
      const analyzed = await onAnalyzeWithAI(item.rawText, targetType);

      if (!analyzed || !analyzed.title) {
        throw new Error("L'analisi AI non ha restituito un titolo valido");
      }

      let resolvedType: ResourceType = analyzed.type || targetType || "article";
      if (
        (item.rawText.includes("github.com/") || (analyzed.url && analyzed.url.includes("github.com/"))) &&
        targetType !== "mcp_server" &&
        targetType !== "knowledge" &&
        resolvedType !== "mcp_server"
      ) {
        resolvedType = "github_repo";
      }

      let resolvedUrl = (analyzed.url && typeof analyzed.url === "string") ? analyzed.url.trim() : (item.rawText.startsWith("http") ? item.rawText.trim() : "");
      if (!resolvedUrl && item.rawText.includes("github.com/")) {
        const ghMatch = item.rawText.match(/github\.com\/[^\s]+/i);
        if (ghMatch) resolvedUrl = `https://${ghMatch[0]}`;
      }

      const analyzedPayload = {
        type: resolvedType,
        title: analyzed.title || "Risorsa Senza Titolo",
        url: resolvedUrl,
        summary: analyzed.summary || item.rawText,
        tags: Array.isArray(analyzed.tags) ? analyzed.tags : ["imported"],
        metadata: {
          okfVersion: "0.2",
          domain: analyzed.metadata?.domain || "Agentic Systems & AI",
          docType: analyzed.metadata?.docType || "architecture",
          entities: analyzed.metadata?.entities || [],
          relations: analyzed.metadata?.relations || [],
          score: analyzed.metadata?.score,
          ...(analyzed.metadata || {}),
        },
      };

      setBulkItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: "saving", analyzedData: analyzedPayload }
            : i
        )
      );

      const saved = await onAdd({
        type: analyzedPayload.type,
        title: analyzedPayload.title,
        url: analyzedPayload.url || "",
        summary: analyzedPayload.summary,
        tags: analyzedPayload.tags,
        isFavorite: false,
        metadata: analyzedPayload.metadata,
        rawInput: item.rawText,
      });

      if (!saved) {
        throw new Error("Salvataggio nel database Firestore non riuscito");
      }

      setBulkItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: "success", analyzedData: analyzedPayload }
            : i
        )
      );

      return true;
    } catch (err: any) {
      console.error("Bulk item error:", err);
      setBulkItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "error",
                errorMessage: err.message || "Errore durante l'analisi",
              }
            : i
        )
      );
      return false;
    }
  };

  // Run Bulk Processing for all items sequentially
  const handleStartBulkProcessing = async () => {
    if (bulkItems.length === 0 || isBulkProcessing) return;

    setIsBulkProcessing(true);
    cancelBulkRef.current = false;
    setBulkProgressIndex(0);

    if (onAddLog) {
      onAddLog(
        "info",
        "CAPTURE",
        `Avvio importazione in blocco di ${bulkItems.length} elementi con analisi AI Gemini...`
      );
    }

    let successCount = 0;
    let failCount = 0;

    for (let idx = 0; idx < bulkItems.length; idx++) {
      if (cancelBulkRef.current) {
        if (onAddLog) {
          onAddLog("warn", "CAPTURE", "Importazione in blocco interrotta dall'utente.");
        }
        break;
      }

      const item = bulkItems[idx];
      if (item.status === "success") {
        successCount++;
        continue;
      }

      setBulkProgressIndex(idx + 1);

      setBulkItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "analyzing", errorMessage: undefined } : i))
      );

      const ok = await processSingleBulkItem(item);
      if (ok) {
        successCount++;
      } else {
        failCount++;
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    setIsBulkProcessing(false);

    if (onAddLog) {
      onAddLog(
        successCount > 0 ? "success" : "warn",
        "CAPTURE",
        `Importazione in blocco completata: ${successCount} salvate con successo, ${failCount} errori.`,
        { successCount, failCount, total: bulkItems.length }
      );
    }
  };

  const handleRetrySingleItem = async (item: BulkItem) => {
    setBulkItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: "analyzing", errorMessage: undefined } : i))
    );
    await processSingleBulkItem(item);
  };

  const handleRemoveBulkItem = (id: string) => {
    setBulkItems((prev) => prev.filter((i) => i.id !== id));
  };

  const completedCount = bulkItems.filter((i) => i.status === "success").length;
  const errorCount = bulkItems.filter((i) => i.status === "error").length;
  const progressPercent = bulkItems.length > 0 ? Math.round((completedCount / bulkItems.length) * 100) : 0;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-[#0D0D0D] border border-[#262626] rounded-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-[#1C1C1C] flex items-center justify-between gap-2.5 bg-[#0A0A0A]">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[#161616] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0 shadow-xs">
              {modalMode === "single" ? <Plus className="w-4 h-4 stroke-[2.5]" /> : <Layers className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-medium text-white tracking-tight truncate">
                  {modalMode === "single" ? "Aggiungi Risorsa al Vault" : "Importazione Multi-Risorsa in Blocco"}
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1A1A1A] border border-[#333] text-[#C5A059]">
                  OKF v0.2
                </span>
              </div>
              <p className="text-[11px] text-[#777] hidden sm:block truncate">
                {modalMode === "single"
                  ? "Archiviazione tecnica conforme al protocollo epistemico Zero-Guessing con estrazione automatica entità e grafo."
                  : "Elaborazione parallela di URL multipli e snippet con classificazione semantica Gemini."}
              </p>
            </div>
          </div>

          {/* Mode Switch Tabs & Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-[#141414] border border-[#262626] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => !isBulkProcessing && setModalMode("single")}
                disabled={isBulkProcessing}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                  modalMode === "single"
                    ? "bg-[#C5A059] text-black font-semibold shadow-xs"
                    : "text-[#888] hover:text-[#CCC]"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Singola</span>
              </button>
              <button
                type="button"
                onClick={() => setModalMode("bulk")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                  modalMode === "bulk"
                    ? "bg-[#C5A059] text-black font-semibold shadow-xs"
                    : "text-[#888] hover:text-[#CCC]"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>In Blocco</span>
                {bulkItems.length > 0 && (
                  <span className="text-[9px] bg-black/40 px-1 py-0.2 rounded font-mono text-black font-bold">
                    {bulkItems.length}
                  </span>
                )}
              </button>
            </div>

            {modalMode === "single" && (
              <button
                type="button"
                onClick={resetForm}
                title="Pulisci tutti i campi del modulo"
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-[#888] hover:text-[#C5A059] bg-[#141414] hover:bg-[#1A1A1A] border border-[#262626] rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Pulisci</span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Chiudi finestra"
              disabled={isBulkProcessing || isSubmitting}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1C1C1C] hover:bg-[#2A2A2A] text-[#EEE] hover:text-white border border-[#333] transition-colors shrink-0 cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {modalMode === "single" ? (
            /* ========================================================================= */
            /* SINGLE RESOURCE MODE                                                      */
            /* ========================================================================= */
            <>
              {/* AI & Multi-Agent Auto-Fill Helper Box */}
              <div className="bg-[#111] border border-[#262626] rounded-xl p-3.5 sm:p-4 space-y-3">
                {/* Header & Mode Selector */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#1A1A1A] pb-2.5">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                    <BrainCircuit className="w-4 h-4 text-[#C5A059]" />
                    <span className="font-semibold">Motore di Ingestione Semantica & Agenti</span>
                  </div>

                  {/* Mode Selector Tabs */}
                  <div className="flex items-center bg-[#090909] border border-[#222] rounded-lg p-0.5 self-stretch sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setAiMode("agentic")}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-mono transition-all cursor-pointer ${
                        aiMode === "agentic"
                          ? "bg-[#C5A059]/20 text-[#C5A059] border border-[#C5A059]/40 font-semibold shadow-xs"
                          : "text-[#777] hover:text-[#BBB]"
                      }`}
                    >
                      <BrainCircuit className="w-3 h-3 text-[#C5A059]" />
                      <span>Pipeline Agenti (Grafo + Cekikj)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiMode("flash")}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 py-1 rounded text-[10px] sm:text-[11px] font-mono transition-all cursor-pointer ${
                        aiMode === "flash"
                          ? "bg-[#C5A059]/20 text-[#C5A059] border border-[#C5A059]/40 font-semibold shadow-xs"
                          : "text-[#777] hover:text-[#BBB]"
                      }`}
                    >
                      <Zap className="w-3 h-3 text-[#C5A059]" />
                      <span>Flash Auto-Fill</span>
                    </button>
                  </div>
                </div>

                {/* Prompt Input & Action */}
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={aiInputPrompt}
                      onChange={(e) => setAiInputPrompt(e.target.value)}
                      placeholder={
                        aiMode === "agentic"
                          ? "Incolla URL o testo: l'Orchestratore coordinerà Ontologist, Graph Linker e Contradiction Sentinel..."
                          : "Incolla URL o testo per estrazione rapida con Gemini 3.7 Flash..."
                      }
                      className="w-full bg-[#080808] border border-[#262626] rounded-lg pl-3 pr-8 py-2 text-xs text-[#E0E0E0] placeholder-[#555] focus:outline-none focus:border-[#C5A059] transition-colors font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleExecuteAI();
                        }
                      }}
                    />
                    {navigator.clipboard && (
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#C5A059] p-1 transition-colors cursor-pointer"
                        title="Incolla dagli appunti"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExecuteAI()}
                    disabled={!aiInputPrompt.trim() || isAnalyzing}
                    className="bg-[#C5A059]/15 hover:bg-[#C5A059]/25 border border-[#C5A059]/50 text-[#C5A059] hover:text-white px-3.5 py-2 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer disabled:opacity-40 shadow-xs"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
                        <span>{aiMode === "agentic" ? "Agenti in esecuzione..." : "Analisi Flash..."}</span>
                      </>
                    ) : aiMode === "agentic" ? (
                      <>
                        <BrainCircuit className="w-3.5 h-3.5" />
                        <span>Esegui Agenti Ingestione</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Auto-Fill Rapido</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Intelligent Query Intent Detector: Forward to Intelligence Orchestrator */}
                {isAnalyticalQuery && onOpenIntelligence && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 bg-[#17140B] border border-[#C5A059]/40 rounded-lg text-xs animate-in fade-in">
                    <div className="flex items-center gap-2 text-[#E0C58A] min-w-0">
                      <Bot className="w-4 h-4 text-[#C5A059] shrink-0" />
                      <span className="text-[11px] leading-tight">
                        Questo input sembra una domanda analitica per il Vault. Vuoi inoltrarla all'<strong>Orchestratore di Intelligence</strong>?
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenIntelligence(aiInputPrompt);
                        onClose();
                      }}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-[#C5A059] hover:bg-[#D8B46E] text-black font-semibold rounded text-[11px] font-mono transition-colors cursor-pointer"
                    >
                      <span>Invia all'Orchestratore (Ctrl+I)</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Contradiction Sentinel Alert Card (Cekikj Gate) */}
                {contradictionWarning?.hasConflict && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 text-amber-200 text-xs font-mono animate-in fade-in">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <span>🛡️ Contradiction Sentinel: Rilevato Conflitto Epistemico</span>
                        <span className="text-[9px] px-1 py-0.2 bg-amber-900/60 rounded text-amber-200">
                          {contradictionWarning.severity || "medium"}
                        </span>
                      </div>
                      <p className="text-[#DDD] text-[11px] leading-relaxed">
                        Il concetto <strong>"{contradictionWarning.conceptName}"</strong> diverge da quanto registrato in una risorsa del Vault:
                      </p>
                      <div className="bg-black/50 p-2 rounded border border-amber-900/40 text-[11px] text-[#BBB] space-y-0.5">
                        <div><strong className="text-white">Fonte in Conflitto:</strong> {contradictionWarning.conflictingSourceTitle}</div>
                        <div><strong className="text-white">Motivo Discrepanza:</strong> {contradictionWarning.conflictReason}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setContradictionWarning(null)}
                      className="text-amber-400 hover:text-amber-200 p-1 cursor-pointer"
                      title="Chiudi avviso"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Multi-Agent Tracing Pipeline Bar & Accordion */}
                {agentSteps.length > 0 && (
                  <div className="bg-[#0A0A0A] border border-[#222] rounded-lg p-2.5 sm:p-3 space-y-2 font-mono">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-[#AAA]">
                        <Compass className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span className="font-medium text-white">Tracing Agenti di Ingestione ({agentSteps.length} Step)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAgentTrace(!showAgentTrace)}
                        className="text-[11px] text-[#C5A059] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>{showAgentTrace ? "Comprimi Dettagli" : "Espandi Dettagli"}</span>
                        {showAgentTrace ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Compact Step Badges */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 pt-0.5">
                      {agentSteps.map((step, idx) => {
                        const isContra = step.agent === "contradiction_sentinel";
                        const isWarn = step.status === "warning";
                        return (
                          <div
                            key={idx}
                            className={`p-1.5 rounded border text-[10px] flex flex-col justify-between ${
                              isContra && isWarn
                                ? "bg-amber-950/30 border-amber-800/60 text-amber-300"
                                : "bg-[#141414] border-[#262626] text-[#BBB]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-white truncate capitalize">
                                {step.agent.replace(/_/g, " ")}
                              </span>
                              <span>{isWarn ? "⚠️" : "✓"}</span>
                            </div>
                            <div className="text-[9px] text-[#666] truncate mt-0.5">{step.latencyMs}ms</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Detailed Trace Accordion */}
                    {showAgentTrace && (
                      <div className="space-y-1.5 pt-2 border-t border-[#1C1C1C] animate-in fade-in">
                        {orchestratorPlan && (
                          <div className="text-[11px] bg-[#111] p-2 rounded border border-[#222] text-[#CCC]">
                            <span className="text-[#C5A059] font-semibold">Piano Orchestratore:</span> {orchestratorPlan}
                          </div>
                        )}
                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                          {agentSteps.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-[11px] p-1.5 rounded bg-[#111] border border-[#1A1A1A]">
                              <span className="text-[#C5A059] shrink-0 font-semibold">[{step.agent}]</span>
                              <span className="text-[#888] shrink-0">{step.action}:</span>
                              <span className="text-[#CCC] flex-1">{step.description}</span>
                              {step.itemsFound !== undefined && (
                                <span className="text-[#777] shrink-0">({step.itemsFound} items)</span>
                              )}
                              <span className="text-[10px] text-[#666] shrink-0">{step.latencyMs}ms</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Success / Error Banners */}
                {aiSuccessMessage && (
                  <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-900/60 rounded-lg p-2.5 font-mono animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                    <span className="flex-1 leading-relaxed">{aiSuccessMessage}</span>
                    <button
                      type="button"
                      onClick={() => setAiSuccessMessage(null)}
                      className="text-emerald-500 hover:text-emerald-300 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {aiErrorMessage && (
                  <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/20 border border-red-900/60 rounded-lg p-2.5 font-mono animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <span className="flex-1 leading-relaxed">{aiErrorMessage}</span>
                    <button
                      type="button"
                      onClick={() => setAiErrorMessage(null)}
                      className="text-red-500 hover:text-red-300 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Single Resource Main Form */}
              <form onSubmit={handleSingleSubmit} className="space-y-4 text-xs">
                {/* Category Selector Grid */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-mono uppercase text-[#777] font-medium">
                      Categoria Risorsa *
                    </label>
                    <span className="text-[10px] font-mono text-[#555]">
                      Tipo OKF predefinito: <code className="text-[#C5A059]">{docType}</code>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {CATEGORY_DEFINITIONS.map((cat) => {
                      const isSelected = type === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setType(cat.id);
                            setHasUserSelectedType(true);
                          }}
                          className={`flex items-center justify-start sm:justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs transition-all cursor-pointer ${
                            isSelected
                              ? `${cat.badgeBg} ${cat.borderColor} text-white font-medium shadow-xs ring-1 ring-[#C5A059]/30`
                              : "bg-[#0A0A0A] border-[#222] text-[#777] hover:text-[#CCC] hover:border-[#333]"
                          }`}
                        >
                          {cat.icon}
                          <span className="truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-mono uppercase text-[#777] font-medium">
                      Titolo *
                    </label>
                    <span className="text-[10px] font-mono text-[#555]">{title.length} caratteri</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="es. PostgreSQL MCP Server, PriMus SAC Block, Anthropic Quickstarts..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059] transition-colors"
                  />
                </div>

                {/* URL with quick-ai-fill trigger */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-mono uppercase text-[#777] font-medium">
                      URL / Link Risorsa (Opzionale)
                    </label>
                    {url.trim().startsWith("http") && (
                      <button
                        type="button"
                        onClick={() => handleAIAutoFill(url)}
                        disabled={isAnalyzing}
                        className="text-[10px] font-mono text-[#C5A059] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Analizza questo URL con AI</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/org/repo oppure https://arxiv.org/abs/..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059] transition-colors"
                  />
                </div>

                {/* Summary */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-mono uppercase text-[#777] font-medium">
                      Descrizione / Sommario *
                    </label>
                    <span className="text-[10px] font-mono text-[#555]">{summary.length} caratteri</span>
                  </div>
                  <textarea
                    required
                    rows={3}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Descrivi l'architettura, scopo pratico, bugfix o funzionalità chiave..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059] transition-colors leading-relaxed"
                  />
                </div>

                {/* Specific Category Fields */}
                {type === "procedure" && (
                  <div className="space-y-3 bg-[#081519] border border-[#133E47] rounded-xl p-3.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-mono text-[#22D3EE]">
                        <Workflow className="w-3.5 h-3.5" />
                        <span className="font-semibold">Parametri Procedura Operativa Standard (SOP & Playbook)</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#0EA5E9] bg-[#0E3B46]/60 px-2 py-0.5 rounded border border-[#22D3EE]/30">
                        Guida Eseguibile
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#22D3EE] mb-1">
                          Sistema / Hardware / Software Target
                        </label>
                        <input
                          type="text"
                          value={targetSystem}
                          onChange={(e) => setTargetSystem(e.target.value)}
                          placeholder="es. Assistenza Informatica Generica / Windows 11 / Stampanti Kyocera"
                          className="w-full bg-[#050D11] border border-[#164E59] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#22D3EE] mb-1">
                          Tipologia Procedura
                        </label>
                        <select
                          value={procedureType}
                          onChange={(e) => setProcedureType(e.target.value)}
                          className="w-full bg-[#050D11] border border-[#164E59] rounded-lg p-2 text-xs text-[#22D3EE] focus:outline-none focus:border-[#22D3EE]"
                        >
                          <option value="customer_support">Assistenza Tecnica & Helpdesk (Customer Support)</option>
                          <option value="maintenance">Manutenzione Ordinaria / Straordinaria</option>
                          <option value="deployment">Deployment & Rilascio Piattaforma</option>
                          <option value="installation">Installazione & Configurazione Iniziale</option>
                          <option value="onboarding">Onboarding / Formazione Operativa</option>
                          <option value="troubleshooting_workflow">Workflow Risolutivo Sequenziale</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#22D3EE] mb-1">
                          Durata Stimata (es. 20 min, 45 min, 2 ore)
                        </label>
                        <input
                          type="text"
                          value={estimatedDuration}
                          onChange={(e) => setEstimatedDuration(e.target.value)}
                          placeholder="es. 30 min"
                          className="w-full bg-[#050D11] border border-[#164E59] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#22D3EE] mb-1">
                          Livello di Rischio Operativo
                        </label>
                        <select
                          value={riskLevel}
                          onChange={(e) => setRiskLevel(e.target.value)}
                          className="w-full bg-[#050D11] border border-[#164E59] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                        >
                          <option value="low">Basso (Nessun impatto su produzione)</option>
                          <option value="medium">Medio (Riavvio servizi o modifiche locali)</option>
                          <option value="high">Alto (Fermo temporaneo o permessi admin)</option>
                          <option value="critical">Critico (Disaster recovery / modifiche infrastruttura)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#AAA] mb-1">
                          Prerequisiti Operativi (uno per riga)
                        </label>
                        <textarea
                          rows={2}
                          value={prerequisitesStr}
                          onChange={(e) => setPrerequisitesStr(e.target.value)}
                          placeholder="es. Credenziali Amministratore&#10;Accesso alla rete interna"
                          className="w-full font-mono bg-[#050D11] border border-[#1F333B] rounded-lg p-2 text-xs text-[#CCC] focus:outline-none focus:border-[#22D3EE]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#AAA] mb-1">
                          Strumenti & Attrezzi Richiesti (uno per riga)
                        </label>
                        <textarea
                          rows={2}
                          value={requiredToolsStr}
                          onChange={(e) => setRequiredToolsStr(e.target.value)}
                          placeholder="es. Client SSH / Terminale&#10;Cavo LAN Cat6&#10;Chiavetta USB"
                          className="w-full font-mono bg-[#050D11] border border-[#1F333B] rounded-lg p-2 text-xs text-[#CCC] focus:outline-none focus:border-[#22D3EE]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-amber-400 mb-1">
                        Avvertenze di Sicurezza & Precauzioni (una per riga)
                      </label>
                      <textarea
                        rows={2}
                        value={safetyWarningsStr}
                        onChange={(e) => setSafetyWarningsStr(e.target.value)}
                        placeholder="es. Eseguire sempre un backup prima di modificare la configurazione&#10;Non spegnere il dispositivo durante l'aggiornamento firmware"
                        className="w-full font-mono bg-[#0D0B05] border border-amber-900/40 rounded-lg p-2 text-xs text-amber-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-[#22D3EE] mb-1 flex items-center justify-between">
                        <span>Checklist Operativa Sequenziale (un passaggio per riga) *</span>
                        <span className="text-[#666] font-normal lowercase">
                          {solutionStepsStr.split("\n").filter((s) => s.trim()).length} passaggi definiti
                        </span>
                      </label>
                      <textarea
                        rows={4}
                        value={solutionStepsStr}
                        onChange={(e) => setSolutionStepsStr(e.target.value)}
                        placeholder="es. 1. Accedere al pannello di controllo via browser (IP statico)&#10;2. Verificare che il protocollo SMBv2/v3 sia abilitato&#10;3. Creare cartella condivisa con permessi di scrittura&#10;4. Eseguire test di invio e certificare esito"
                        className="w-full font-mono bg-[#050D11] border border-[#164E59] rounded-lg p-2.5 text-xs text-[#67E8F9] focus:outline-none focus:border-[#22D3EE]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-rose-400 mb-1">
                        Piano di Rollback & Ripristino di Emergenza (Opzionale)
                      </label>
                      <textarea
                        rows={2}
                        value={rollbackPlan}
                        onChange={(e) => setRollbackPlan(e.target.value)}
                        placeholder="es. Se il servizio non risponde entro 60s, ripristinare il file di config precedente e riavviare il demone."
                        className="w-full font-mono bg-[#110608] border border-rose-950/60 rounded-lg p-2 text-xs text-rose-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                )}

                {/* Specific Category Fields */}
                {type === "troubleshooting" && (
                  <div className="space-y-3 bg-[#14100C] border border-[#2D1E12] rounded-xl p-3.5 animate-in fade-in">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-[#F97316]">
                      <Wrench className="w-3.5 h-3.5" />
                      <span className="font-semibold">Dettagli Diagnostici & Risoluzione Bug</span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-[#F97316] mb-1">
                        Sistema / Software Coinvolto
                      </label>
                      <input
                        type="text"
                        value={affectedSystem}
                        onChange={(e) => setAffectedSystem(e.target.value)}
                        placeholder="es. PriMus-Av.usBIM (ACCA) / Windows 11 KB5121003 / Node.js v20"
                        className="w-full bg-[#0A0705] border border-[#3E2314] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#F97316]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-[#F97316] mb-1">
                        Causa Scatenante / Diagnosi Tecnica
                      </label>
                      <textarea
                        rows={2}
                        value={rootCause}
                        onChange={(e) => setRootCause(e.target.value)}
                        placeholder="es. Lo Smart App Control (SAC) di Windows ha bloccato borlndmm.dll..."
                        className="w-full bg-[#0A0705] border border-[#3E2314] rounded-lg p-2 text-xs text-[#E0E0E0] focus:outline-none focus:border-[#F97316]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#888] mb-1">
                          Tentativi Non Risolutivi (uno per riga)
                        </label>
                        <textarea
                          rows={3}
                          value={attemptedFixesStr}
                          onChange={(e) => setAttemptedFixesStr(e.target.value)}
                          placeholder="es. Rigenerazione cartella .Common&#10;Scansione SFC / DISM"
                          className="w-full font-mono bg-[#0A0705] border border-[#333] rounded-lg p-2 text-xs text-[#AAA] focus:outline-none focus:border-[#F97316]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#10B981] mb-1">
                          Procedura Risolutiva (un passaggio per riga)
                        </label>
                        <textarea
                          rows={3}
                          value={solutionStepsStr}
                          onChange={(e) => setSolutionStepsStr(e.target.value)}
                          placeholder="es. 1. Aprire Sicurezza di Windows&#10;2. Controllo app intelligente > Disattivare e riavviare"
                          className="w-full font-mono bg-[#0A0705] border border-[#1B3828] rounded-lg p-2 text-xs text-[#34D399] focus:outline-none focus:border-[#10B981]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {type === "paper" && (
                  <div className="space-y-3 bg-[#0E0F1C] border border-[#1E2242] rounded-xl p-3.5 animate-in fade-in">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-[#818CF8]">
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span className="font-semibold">Dati Pubblicazione Scientifica</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                          ID arXiv (es. 2401.12345)
                        </label>
                        <input
                          type="text"
                          value={arxivId}
                          onChange={(e) => setArxivId(e.target.value)}
                          placeholder="es. 2401.12345"
                          className="w-full bg-[#070712] border border-[#272B54] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                          Conferenza / Venue / Anno
                        </label>
                        <input
                          type="text"
                          value={venue}
                          onChange={(e) => setVenue(e.target.value)}
                          placeholder="es. NeurIPS 2024 / ICLR"
                          className="w-full bg-[#070712] border border-[#272B54] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                          Autori (separati da virgola)
                        </label>
                        <input
                          type="text"
                          value={authorsStr}
                          onChange={(e) => setAuthorsStr(e.target.value)}
                          placeholder="es. Ashish Vaswani, Noam Shazeer..."
                          className="w-full bg-[#070712] border border-[#272B54] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-[#818CF8] mb-1">
                          Link Diretto al PDF
                        </label>
                        <input
                          type="url"
                          value={pdfUrl}
                          onChange={(e) => setPdfUrl(e.target.value)}
                          placeholder="https://arxiv.org/pdf/2401.12345.pdf"
                          className="w-full bg-[#070712] border border-[#272B54] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#818CF8]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {type === "mcp_server" && (
                  <div className="space-y-3 bg-[#0B1520] border border-[#162A3E] rounded-xl p-3.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-mono text-[#38BDF8]">
                        <Cpu className="w-3.5 h-3.5" />
                        <span className="font-semibold">Configurazione JSON MCP Host</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleValidateMcpJson}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#162A3E] hover:bg-[#1E3A57] text-[#38BDF8] border border-[#38BDF8]/40 transition-colors cursor-pointer"
                      >
                        Valida JSON
                      </button>
                    </div>

                    <textarea
                      rows={4}
                      value={mcpConfig}
                      onChange={(e) => {
                        setMcpConfig(e.target.value);
                        if (jsonValidationStatus) setJsonValidationStatus(null);
                      }}
                      placeholder='{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]\n    }\n  }\n}'
                      className="w-full font-mono bg-[#060D14] border border-[#1E3650] rounded-lg p-2.5 text-xs text-[#38BDF8] focus:outline-none focus:border-[#38BDF8]"
                    />

                    {jsonValidationStatus === "valid" && (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Configurazione JSON valida!
                      </span>
                    )}
                    {jsonValidationStatus === "invalid" && (
                      <span className="text-[10px] font-mono text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Errore di sintassi JSON nel blocco di configurazione.
                      </span>
                    )}
                  </div>
                )}

                {type === "ai_skill" && (
                  <div className="space-y-2 bg-[#091811] border border-[#143324] rounded-xl p-3.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-mono text-[#10B981]">
                        <Bot className="w-3.5 h-3.5" />
                        <span className="font-semibold">System Prompt / Istruzioni Persona Skill</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#666]">{systemPrompt.length} caratteri</span>
                    </div>

                    <textarea
                      rows={4}
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Sei un assistente specializzato in architettura software e refactoring..."
                      className="w-full font-mono bg-[#050E09] border border-[#193F2B] rounded-lg p-2.5 text-xs text-[#A7F3D0] focus:outline-none focus:border-[#10B981]"
                    />
                  </div>
                )}

                {type === "github_repo" && (
                  <div className="space-y-2 bg-[#120B1A] border border-[#28173B] rounded-xl p-3.5 animate-in fade-in">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-[#A855F7]">
                      <Github className="w-3.5 h-3.5" />
                      <span className="font-semibold">Comando Install / Clone Rapido</span>
                    </div>

                    <input
                      type="text"
                      value={installCommand}
                      onChange={(e) => setInstallCommand(e.target.value)}
                      placeholder="git clone https://github.com/..."
                      className="w-full font-mono bg-[#0B0610] border border-[#351E4E] rounded-lg p-2.5 text-xs text-[#E9D5FF] focus:outline-none focus:border-[#A855F7]"
                    />
                  </div>
                )}

                {type === "rss" && (
                  <div className="space-y-2 bg-[#170E07] border border-[#331D0E] rounded-xl p-3.5 animate-in fade-in">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-[#FB923C]">
                      <Rss className="w-3.5 h-3.5" />
                      <span className="font-semibold">Feed URL RSS / Atom</span>
                    </div>
                    <input
                      type="url"
                      value={feedUrl}
                      onChange={(e) => setFeedUrl(e.target.value)}
                      placeholder="https://example.com/feed.xml"
                      className="w-full bg-[#0D0704] border border-[#442512] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#FB923C]"
                    />
                  </div>
                )}

                {type === "note" && (
                  <div className="space-y-2 bg-[#171408] border border-[#2E2810] rounded-xl p-3.5 animate-in fade-in">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-[#FBBF24]">
                      <StickyNote className="w-3.5 h-3.5" />
                      <span className="font-semibold">Tipologia Nota di Sviluppo</span>
                    </div>
                    <select
                      value={noteCategory}
                      onChange={(e) => setNoteCategory(e.target.value)}
                      className="w-full bg-[#0C0B04] border border-[#433915] rounded-lg p-2 text-xs text-[#FBBF24] focus:outline-none focus:border-[#FBBF24]"
                    >
                      <option value="scratchpad">Scratchpad / Appunto al volo</option>
                      <option value="memo">Memo Architetturale</option>
                      <option value="prompt_idea">Idea Prompt / Sperimentazione</option>
                    </select>
                  </div>
                )}

                {/* Optional Custom User Notes */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#C5A059] mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Note & Commenti Personali (Opzionale)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="Appunti personali, contesto del progetto o istruzioni d'uso specifiche..."
                    className="w-full bg-[#111] border border-[#2A2315] rounded-lg p-2.5 text-xs text-[#E5C170] placeholder-[#665] focus:outline-none focus:border-[#C5A059] transition-colors"
                  />
                </div>

                {/* Tags Section with Quick-Suggestion Chips */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase text-[#777] font-medium flex items-center gap-1">
                      <Tag className="w-3 h-3 text-[#C5A059]" />
                      <span>Tag Tematici (separati da virgola)</span>
                    </label>
                  </div>

                  <input
                    type="text"
                    value={tagsStr}
                    onChange={(e) => setTagsStr(e.target.value)}
                    placeholder="mcp, typescript, ai-agent, architecture, react..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059] transition-colors"
                  />

                  {/* Suggestion Chips */}
                  {suggestedTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      <span className="text-[10px] font-mono text-[#555] mr-1">Suggeriti:</span>
                      {suggestedTags.slice(0, 6).map((tg) => (
                        <button
                          key={tg}
                          type="button"
                          onClick={() => handleAddTag(tg)}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161616] hover:bg-[#222] border border-[#262626] text-[#888] hover:text-[#C5A059] transition-colors cursor-pointer"
                        >
                          +{tg}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ========================================================================= */}
                {/* ADVANCED OKF v0.2 METADATA & GRAPH TOPOLOGY COLLAPSIBLE PANEL            */}
                {/* ========================================================================= */}
                <div className="border border-[#222] rounded-xl overflow-hidden bg-[#0A0A0A]">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedOkf(!showAdvancedOkf)}
                    className="w-full p-3 flex items-center justify-between text-left hover:bg-[#111] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <Network className="w-4 h-4 text-[#C5A059]" />
                      <span className="font-semibold text-white">Topologia & Metadati OKF v0.2</span>
                      {(entities.length > 0 || relations.length > 0) && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/30">
                          {entities.length} Entità · {relations.length} Relazioni
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[#777]">
                      <span className="text-[10px] font-mono hidden sm:inline">
                        {showAdvancedOkf ? "Comprimi" : "Espandi per visualizzare o modificare nodi del grafo"}
                      </span>
                      {showAdvancedOkf ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {showAdvancedOkf && (
                    <div className="p-3.5 sm:p-4 border-t border-[#1C1C1C] space-y-4 text-xs bg-[#0D0D0D] animate-in fade-in">
                      {/* Domain & DocType Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-[#777] mb-1">
                            Dominio Conoscitivo OKF:
                          </label>
                          <input
                            type="text"
                            list="okf-domains-list"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="es. Agentic Systems & AI"
                            className="w-full bg-[#111] border border-[#262626] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                          />
                          <datalist id="okf-domains-list">
                            {COMMON_DOMAINS.map((dm) => (
                              <option key={dm} value={dm} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono uppercase text-[#777] mb-1">
                            Tipologia Documentale (`docType`):
                          </label>
                          <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            className="w-full bg-[#111] border border-[#262626] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#C5A059] font-mono"
                          >
                            <option value="concept">concept (Concetti & Teorie)</option>
                            <option value="architecture">architecture (Architetture & Repository)</option>
                            <option value="guide">guide (Guide, Problem & Fix, Tutorial)</option>
                            <option value="specification">specification (Specifiche Tecniche)</option>
                            <option value="tool_description">tool_description (Server MCP & Tool)</option>
                            <option value="prompt_skill">prompt_skill (Skill & Agenti)</option>
                          </select>
                        </div>
                      </div>

                      {/* Entities Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-mono uppercase text-[#C5A059] font-semibold flex items-center gap-1">
                            <BrainCircuit className="w-3 h-3" />
                            <span>Entità Topologiche Riconosciute ({entities.length}):</span>
                          </label>
                          <span className="text-[10px] text-[#555] font-mono">Tracciate nel Grafo D3</span>
                        </div>

                        {/* Entities list chips */}
                        {entities.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 p-2 bg-[#111] border border-[#222] rounded-lg max-h-32 overflow-y-auto">
                            {entities.map((ent, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 text-[11px] font-mono bg-[#181818] border border-[#333] px-2 py-0.5 rounded-md text-[#E0E0E0]"
                              >
                                <span className="text-[#C5A059] text-[9px] uppercase font-bold">[{ent.type}]</span>
                                <span>{ent.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEntity(idx)}
                                  className="text-[#666] hover:text-red-400 ml-0.5 cursor-pointer"
                                  title="Rimuovi entità"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono text-[#666] italic bg-[#111] p-2 rounded-lg border border-[#1A1A1A]">
                            Nessuna entità specificata. Usa l'Auto-Fill AI oppure aggiungine una di seguito.
                          </div>
                        )}

                        {/* Add entity input */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newEntityName}
                            onChange={(e) => setNewEntityName(e.target.value)}
                            placeholder="Nome entità (es. TypeScript, Anthropic...)"
                            className="flex-1 bg-[#111] border border-[#262626] rounded-lg p-1.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddNewEntity();
                              }
                            }}
                          />
                          <select
                            value={newEntityType}
                            onChange={(e) => setNewEntityType(e.target.value)}
                            className="bg-[#111] border border-[#262626] rounded-lg p-1.5 text-xs text-[#CCC] font-mono"
                          >
                            <option value="Technology">Technology</option>
                            <option value="Framework">Framework</option>
                            <option value="Concept">Concept</option>
                            <option value="Organization">Organization</option>
                            <option value="Standard">Standard</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleAddNewEntity}
                            disabled={!newEntityName.trim()}
                            className="px-2.5 py-1.5 bg-[#222] hover:bg-[#333] text-[#C5A059] border border-[#333] rounded-lg text-xs font-mono disabled:opacity-40 cursor-pointer"
                          >
                            + Aggiungi
                          </button>
                        </div>
                      </div>

                      {/* Relations Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-mono uppercase text-[#C5A059] font-semibold flex items-center gap-1">
                            <Share2 className="w-3 h-3" />
                            <span>Relazioni con Altre Risorse ({relations.length}):</span>
                          </label>
                          <span className="text-[10px] text-[#555] font-mono">Archi del Grafo Epistemico</span>
                        </div>

                        {relations.length > 0 ? (
                          <div className="space-y-1 p-2 bg-[#111] border border-[#222] rounded-lg max-h-32 overflow-y-auto">
                            {relations.map((rel, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-[11px] font-mono bg-[#181818] border border-[#2A2A2A] px-2.5 py-1 rounded text-[#DDD]"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="text-[#A855F7] text-[10px] uppercase font-semibold">
                                    {rel.relationType || "relates_to"}
                                  </span>
                                  <ArrowRight className="w-3 h-3 text-[#555] shrink-0" />
                                  <span className="truncate text-white font-medium">{rel.targetTitle}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRelation(idx)}
                                  className="text-[#666] hover:text-red-400 p-0.5 cursor-pointer shrink-0"
                                  title="Rimuovi relazione"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono text-[#666] italic bg-[#111] p-2 rounded-lg border border-[#1A1A1A]">
                            Nessuna relazione dichiarata con altre schede del Vault.
                          </div>
                        )}

                        {/* Add relation input */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newRelationTarget}
                            onChange={(e) => setNewRelationTarget(e.target.value)}
                            placeholder="Titolo scheda correlata..."
                            className="flex-1 bg-[#111] border border-[#262626] rounded-lg p-1.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddNewRelation();
                              }
                            }}
                          />
                          <select
                            value={newRelationType}
                            onChange={(e) => setNewRelationType(e.target.value)}
                            className="bg-[#111] border border-[#262626] rounded-lg p-1.5 text-xs text-[#CCC] font-mono"
                          >
                            <option value="relates_to">relates_to</option>
                            <option value="implements">implements</option>
                            <option value="depends_on">depends_on</option>
                            <option value="extends">extends</option>
                            <option value="references">references</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleAddNewRelation}
                            disabled={!newRelationTarget.trim()}
                            className="px-2.5 py-1.5 bg-[#222] hover:bg-[#333] text-[#C5A059] border border-[#333] rounded-lg text-xs font-mono disabled:opacity-40 cursor-pointer"
                          >
                            + Collega
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Form Error Message */}
                {formErrorMessage && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/60 rounded-lg p-2.5 font-mono animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{formErrorMessage}</span>
                  </div>
                )}

                {/* Submit and Action Buttons */}
                <div className="pt-3 border-t border-[#1C1C1C] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[#666]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span>Conforme standard Open Knowledge Format v0.2</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1C1C1C] border border-[#262626] transition-colors cursor-pointer"
                    >
                      Annulla
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmitting || !title.trim() || !summary.trim()}
                      className="px-5 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#C5A059]/10 active:scale-95"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Salvataggio nel Vault...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Aggiungi al Vault</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            /* ========================================================================= */
            /* BULK IMPORT MODE                                                          */
            /* ========================================================================= */
            <div className="space-y-4">
              {/* Top Controls & Explanation */}
              <div className="bg-[#111] border border-[#222] rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#C5A059]" />
                    <span className="text-xs font-mono font-medium text-white">
                      Importazione Multi-Risorsa Intelligente con Gemini AI
                    </span>
                  </div>
                  
                  {/* Action Presets */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadBulkSamples}
                      disabled={isBulkProcessing}
                      className="text-[10px] font-mono px-2 py-1 bg-[#1A1A1A] hover:bg-[#252525] border border-[#333] text-[#C5A059] rounded hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                      title="Carica un set di esempio con URL GitHub, server MCP e note rapide"
                    >
                      <ListPlus className="w-3 h-3" />
                      <span>Carica Esempi</span>
                    </button>
                    {bulkRawText && (
                      <button
                        type="button"
                        onClick={() => {
                          setBulkRawText("");
                          setBulkItems([]);
                        }}
                        disabled={isBulkProcessing}
                        className="text-[10px] font-mono px-2 py-1 bg-[#1A1A1A] hover:bg-[#252525] border border-[#333] text-[#888] hover:text-red-400 rounded transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Pulisci</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Configuration Row: Splitting mode & Category Default */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#1C1C1C] text-xs">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#777] mb-1">
                      Modalità di Separazione:
                    </label>
                    <div className="flex items-center gap-1 bg-[#0A0A0A] p-1 rounded-lg border border-[#222]">
                      <button
                        type="button"
                        onClick={() => setBulkSplitMode("lines")}
                        disabled={isBulkProcessing}
                        className={`flex-1 py-1 px-2 rounded text-[11px] font-mono text-center transition-colors cursor-pointer ${
                          bulkSplitMode === "lines"
                            ? "bg-[#222] text-[#C5A059] font-medium"
                            : "text-[#777] hover:text-[#CCC]"
                        }`}
                      >
                        Una riga per elemento
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkSplitMode("paragraphs")}
                        disabled={isBulkProcessing}
                        className={`flex-1 py-1 px-2 rounded text-[11px] font-mono text-center transition-colors cursor-pointer ${
                          bulkSplitMode === "paragraphs"
                            ? "bg-[#222] text-[#C5A059] font-medium"
                            : "text-[#777] hover:text-[#CCC]"
                        }`}
                        title="Ideale per blocchi di testo o snippet separati da una riga vuota o '---'"
                      >
                        Blocchi / Snippet (---)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#777] mb-1">
                      Categoria di Destinazione Predefinita:
                    </label>
                    <select
                      value={bulkDefaultType}
                      onChange={(e) => setBulkDefaultType(e.target.value as any)}
                      disabled={isBulkProcessing}
                      className="w-full bg-[#0A0A0A] border border-[#222] rounded-lg py-1.5 px-2 text-[11px] text-[#DDD] focus:outline-none focus:border-[#C5A059] font-mono"
                    >
                      <option value="auto">✨ Rilevamento Automatico con AI</option>
                      <option value="troubleshooting">🔧 Problema & Fix (Troubleshooting)</option>
                      <option value="knowledge">🧠 Knowledge (OKF v0.2)</option>
                      <option value="github_repo">🐙 GitHub Repository</option>
                      <option value="mcp_server">⚡ MCP Server</option>
                      <option value="ai_skill">🤖 AI Skill / Prompt</option>
                      <option value="paper">🎓 Paper Scientifico (arXiv)</option>
                      <option value="article">📖 Articolo / Guida</option>
                      <option value="link">🌐 Link & Web Tool</option>
                      <option value="rss">📡 Feed RSS / Atom</option>
                      <option value="note">📝 Nota Rapida / Scratchpad</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Multi-line Textarea */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#777] mb-1">
                  <span>Incolla URL o frammenti ({bulkItems.length} elementi rilevati):</span>
                  <span className="text-[#C5A059]">
                    {bulkSplitMode === "lines" ? "1 riga = 1 risorsa" : "Separatore: riga vuota o ---"}
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={bulkRawText}
                  onChange={(e) => setBulkRawText(e.target.value)}
                  disabled={isBulkProcessing}
                  placeholder={`https://github.com/owner/repository\nhttps://github.com/modelcontextprotocol/servers\nPostgreSQL MCP Server: config per Claude...\nhttps://news.ycombinator.com/...`}
                  className="w-full font-mono bg-[#080808] border border-[#262626] rounded-xl p-3 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#C5A059] leading-relaxed resize-y"
                />
              </div>

              {/* Live Batch Progress Bar & Stats */}
              {(isBulkProcessing || completedCount > 0 || errorCount > 0) && (
                <div className="bg-[#0F0F0F] border border-[#222] rounded-xl p-3.5 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#AAA] flex items-center gap-1.5">
                      {isBulkProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />}
                      <span>
                        {isBulkProcessing
                          ? `Analisi elemento ${bulkProgressIndex} di ${bulkItems.length}...`
                          : `Processo completato: ${completedCount} su ${bulkItems.length} archiviate`}
                      </span>
                    </span>
                    <span className="text-[#C5A059] font-bold">{progressPercent}%</span>
                  </div>

                  <div className="w-full h-2 bg-[#1A1A1A] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-[#C5A059] to-emerald-400 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono text-[#888]">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{completedCount} Importate</span>
                    </span>
                    {errorCount > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{errorCount} Errori</span>
                      </span>
                    )}
                    <span className="text-[#666]">
                      {bulkItems.length - completedCount - errorCount} In attesa
                    </span>
                  </div>
                </div>
              )}

              {/* Detected Items List Preview */}
              {bulkItems.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-mono uppercase text-[#777] flex items-center justify-between">
                    <span>Lista Elementi da Importare ({bulkItems.length}):</span>
                    {isBulkProcessing && (
                      <button
                        type="button"
                        onClick={() => {
                          cancelBulkRef.current = true;
                        }}
                        className="text-red-400 hover:text-red-300 text-[10px] font-mono underline cursor-pointer"
                      >
                        Interrompi Importazione
                      </button>
                    )}
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {bulkItems.map((item, idx) => {
                      const isItemAnalyzing = item.status === "analyzing";
                      const isItemSaving = item.status === "saving";
                      const isItemSuccess = item.status === "success";
                      const isItemError = item.status === "error";

                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2.5 transition-all ${
                            isItemSuccess
                              ? "bg-emerald-950/20 border-emerald-900/60"
                              : isItemError
                              ? "bg-red-950/20 border-red-900/60"
                              : isItemAnalyzing || isItemSaving
                              ? "bg-[#16140E] border-[#C5A059]/50 shadow-xs"
                              : "bg-[#111] border-[#1F1F1F]"
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <span className="font-mono text-[10px] text-[#666] pt-0.5 shrink-0">
                              #{idx + 1}
                            </span>

                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="font-medium text-white truncate text-[11px]">
                                {item.analyzedData?.title || item.rawText}
                              </div>

                              <div className="text-[10px] text-[#777] truncate flex items-center gap-2 font-mono">
                                {item.analyzedData ? (
                                  <>
                                    <span className="text-[#C5A059] uppercase font-semibold">
                                      {item.analyzedData.type}
                                    </span>
                                    {item.analyzedData.tags?.length > 0 && (
                                      <span>· {item.analyzedData.tags.slice(0, 3).join(", ")}</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="truncate">{item.rawText}</span>
                                )}
                              </div>

                              {item.errorMessage && (
                                <div className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{item.errorMessage}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Status Badge & Action */}
                          <div className="flex items-center gap-2 shrink-0">
                            {isItemSuccess && (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                <span>Salvato</span>
                              </span>
                            )}

                            {isItemAnalyzing && (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-[#C5A059] bg-[#1C170E] border border-[#C5A059]/40 px-2 py-0.5 rounded-full">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Analisi AI...</span>
                              </span>
                            )}

                            {isItemSaving && (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded-full">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Salvataggio...</span>
                              </span>
                            )}

                            {isItemError && (
                              <button
                                type="button"
                                onClick={() => handleRetrySingleItem(item)}
                                className="flex items-center gap-1 text-[10px] font-mono text-red-300 hover:text-white bg-red-950/80 hover:bg-red-900 border border-red-800 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Riprova</span>
                              </button>
                            )}

                            {item.status === "idle" && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBulkItem(item.id)}
                                disabled={isBulkProcessing}
                                className="text-[#555] hover:text-red-400 p-1 transition-colors cursor-pointer"
                                title="Rimuovi questo elemento"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bulk Footer Actions */}
              <div className="pt-3 border-t border-[#1C1C1C] flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] text-[#666] font-mono flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>
                    {completedCount === bulkItems.length && bulkItems.length > 0
                      ? "Tutte le risorse sono state salvate nel Vault."
                      : `${bulkItems.length} risorse in coda di elaborazione.`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isBulkProcessing}
                    className="px-4 py-2 rounded-lg text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1C1C1C] border border-[#262626] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {completedCount > 0 ? "Chiudi" : "Annulla"}
                  </button>

                  <button
                    type="button"
                    onClick={handleStartBulkProcessing}
                    disabled={
                      isBulkProcessing ||
                      bulkItems.length === 0 ||
                      (completedCount === bulkItems.length && errorCount === 0)
                    }
                    className="px-5 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#C5A059]/10 active:scale-95"
                  >
                    {isBulkProcessing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Analisi in Corso...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-black" />
                        <span>
                          {errorCount > 0 && completedCount > 0
                            ? `Riprova Errori (${errorCount})`
                            : `Avvia Importazione (${bulkItems.length})`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
