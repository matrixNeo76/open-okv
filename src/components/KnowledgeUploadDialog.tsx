import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  X, 
  UploadCloud, 
  Sparkles, 
  Loader2, 
  BrainCircuit, 
  CheckCircle,
  FileCode,
  FileText,
  AlertCircle,
  Eye,
  Edit3,
  Layers,
  Network,
  Tag,
  BookOpen,
  Zap,
  Trash2,
  FileUp,
  ExternalLink,
  ChevronRight,
  Plus,
  ShieldCheck,
  ShieldAlert,
  GitBranch,
  Share2,
  Clock,
  Workflow,
  ArrowRight,
  Cpu,
  Save,
  RotateCw
} from "lucide-react";
import Markdown from "react-markdown";
import { ResourceItem, DiagnosticLog, OKFEntity, OKFRelation } from "../types";
import { parseOKFDocument, OKF_TEMPLATES, ParsedOKFDocument } from "../lib/okfParser";
import { localFallbackAnalyzeResource } from "../lib/fallbackParser";

export interface IngestionAgentTraceStep {
  agent: "orchestrator" | "structural_deconstructor" | "ontologist" | "graph_linker" | "contradiction_sentinel" | "okf_serializer";
  action: string;
  description: string;
  itemsFound?: number;
  status: "success" | "warning" | "insufficient";
  timestamp: string;
  latencyMs?: number;
}

export interface IngestionContradictionWarning {
  hasConflict: boolean;
  conceptName?: string;
  conflictingSourceTitle?: string;
  conflictReason?: string;
  severity?: "low" | "medium" | "high";
}

interface QueueFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  isPdf: boolean;
  base64?: string;
  text?: string;
  status: "pending" | "processing" | "completed" | "error";
  errorMsg?: string;
}

interface KnowledgeUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadProcessedDoc: (item: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<boolean>;
  existingResources: ResourceItem[];
  onAddLog?: (level: DiagnosticLog["level"], category: DiagnosticLog["category"], message: string, details?: any) => void;
  initialContent?: string;
  initialFileName?: string;
  initialSourceMetadata?: Record<string, any>;
}

export const KnowledgeUploadDialog: React.FC<KnowledgeUploadDialogProps> = ({
  isOpen,
  onClose,
  onUploadProcessedDoc,
  existingResources,
  onAddLog,
  initialContent,
  initialFileName,
  initialSourceMetadata,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Tab state: "editor" | "preview" | "trace"
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "trace">("editor");

  // Multi-Agent Pipeline Trace state
  const [agentSteps, setAgentSteps] = useState<IngestionAgentTraceStep[]>([]);
  const [orchestratorPlan, setOrchestratorPlan] = useState<string>("");
  const [contradictionAlert, setContradictionAlert] = useState<IngestionContradictionWarning | null>(null);
  const [pipelineExecutionTime, setPipelineExecutionTime] = useState<number | null>(null);
  const [pipelineModelUsed, setPipelineModelUsed] = useState<string>("gemini-3.7-flash");

  // Core Inputs
  const [inputText, setInputText] = useState("");
  const [activeFileName, setActiveFileName] = useState("");
  const [pdfPayload, setPdfPayload] = useState<{ name: string; size: number; base64: string } | null>(null);

  // Multi-file queue
  const [fileQueue, setFileQueue] = useState<QueueFileItem[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  // Metadata overrides (editable in preview)
  const [customTitle, setCustomTitle] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [customDocType, setCustomDocType] = useState("specification");
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Processing & progress states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastProcessedResource, setLastProcessedResource] = useState<any | null>(null);
  const hasSavedDocRef = useRef(false);

  // Instant OKF Frontmatter parsing
  const parsedDoc: ParsedOKFDocument = useMemo(() => {
    return parseOKFDocument(inputText, activeFileName ? activeFileName.replace(/\.[^/.]+$/, "") : "Documento Knowledge");
  }, [inputText, activeFileName]);

  // Sync custom fields when parsedDoc changes (if not modified by user)
  useEffect(() => {
    if (parsedDoc.isValidOKF || parsedDoc.hasFrontmatter) {
      setCustomTitle(parsedDoc.title);
      setCustomDomain(parsedDoc.domain);
      setCustomDocType(parsedDoc.docType);
      setCustomTags(parsedDoc.tags);
    } else if (activeFileName && !customTitle) {
      setCustomTitle(activeFileName.replace(/\.[^/.]+$/, ""));
    }
  }, [parsedDoc.title, parsedDoc.domain, parsedDoc.docType, parsedDoc.tags.join(","), activeFileName]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isProcessing) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isProcessing]);

  // Reset state on modal open
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setSuccess(false);
      setIsProcessing(false);
      setProcessingStage("");
      if (initialContent) {
        setInputText(initialContent);
        if (initialFileName) {
          setActiveFileName(initialFileName);
        }
        setActiveTab("editor");
      }
    }
  }, [isOpen, initialContent, initialFileName]);

  if (!isOpen) return null;

  const logEvent = (level: DiagnosticLog["level"], msg: string, details?: any) => {
    if (onAddLog) {
      onAddLog(level, "CAPTURE", msg, details);
    }
  };

  // Process a single file safely (handles both binary PDF and UTF-8 text)
  const processRawFile = (file: File): Promise<QueueFileItem> => {
    return new Promise((resolve) => {
      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type.includes("pdf");
      const isImage = file.type.startsWith("image/");
      const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      if (isPdf || isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = (e.target?.result as string) || "";
          const cleanBase64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
          resolve({
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type || (isPdf ? "application/pdf" : "image/*"),
            isPdf,
            base64: cleanBase64,
            status: "pending",
          });
        };
        reader.onerror = () => {
          resolve({
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            isPdf,
            status: "error",
            errorMsg: "Impossibile leggere il file binario",
          });
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = (e.target?.result as string) || "";
          resolve({
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type || "text/plain",
            isPdf: false,
            text,
            status: "pending",
          });
        };
        reader.onerror = () => {
          resolve({
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            isPdf: false,
            status: "error",
            errorMsg: "Errore di lettura del file di testo",
          });
        };
        reader.readAsText(file);
      }
    });
  };

  // Handle file selections (single or multi-drop)
  const handleFilesBatch = async (fileList: FileList | File[]) => {
    setErrorMessage(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    logEvent("info", `Ricevuti ${files.length} file per importazione nel Vault.`);

    const parsedItems: QueueFileItem[] = [];
    for (const f of files) {
      const item = await processRawFile(f);
      parsedItems.push(item);
    }

    setFileQueue((prev) => [...parsedItems, ...prev]);

    // Focus the first file
    const first = parsedItems[0];
    if (first) {
      hasSavedDocRef.current = false;
      setSelectedQueueId(first.id);
      setActiveFileName(first.name);
      if (first.isPdf && first.base64) {
        setPdfPayload({ name: first.name, size: first.size, base64: first.base64 });
        setInputText(`[PIPELINE INGESTIONE MULTIMODALE: "${first.name}" (${(first.size / 1024).toFixed(1)} KB)]\n\n✓ Buffer binario caricato nel circuito di ingestione\n✓ Modalità Pixel-to-Markdown OCR attiva per parsing di impaginazione, formule LaTeX ($$) e tabelle\n✓ Team di 6 Agenti autonomi pronto per de-strutturazione, ontologia, linking topologico e audit di contraddizione Cekikj\n\nClicca "Esegui Ingestion Pipeline (6 Agenti)" in basso per avviare il processo.`);
      } else if (first.text) {
        setPdfPayload(null);
        setInputText(first.text);
      }
    }
  };

  const selectQueueItem = (item: QueueFileItem) => {
    setSelectedQueueId(item.id);
    setActiveFileName(item.name);
    setErrorMessage(null);
    if (item.isPdf && item.base64) {
      setPdfPayload({ name: item.name, size: item.size, base64: item.base64 });
      setInputText(`[PIPELINE INGESTIONE MULTIMODALE: "${item.name}" (${(item.size / 1024).toFixed(1)} KB)]\n\n✓ Buffer binario caricato nel circuito di ingestione\n✓ Modalità Pixel-to-Markdown OCR attiva per parsing di impaginazione, formule LaTeX ($$) e tabelle\n✓ Team di 6 Agenti autonomi pronto per de-strutturazione, ontologia, linking topologico e audit di contraddizione Cekikj\n\nClicca "Esegui Ingestion Pipeline (6 Agenti)" in basso per avviare il processo.`);
    } else if (item.text) {
      setPdfPayload(null);
      setInputText(item.text);
    }
  };

  const removeQueueItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFileQueue((prev) => prev.filter((f) => f.id !== id));
    if (selectedQueueId === id) {
      const remaining = fileQueue.filter((f) => f.id !== id);
      if (remaining.length > 0) {
        selectQueueItem(remaining[0]);
      } else {
        setSelectedQueueId(null);
        setActiveFileName("");
        setPdfPayload(null);
        setInputText("");
      }
    }
  };

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesBatch(e.dataTransfer.files);
    }
  };

  // Load a predefined OKF template
  const loadTemplate = (key: keyof typeof OKF_TEMPLATES) => {
    setInputText(OKF_TEMPLATES[key]);
    setActiveFileName(`template-${key}.md`);
    setPdfPayload(null);
    setErrorMessage(null);
    logEvent("info", `Caricato template OKF v0.2: ${key}`);
  };

  // Tag manipulation
  const handleAddTag = () => {
    const clean = tagInput.trim().toLowerCase();
    if (clean && !customTags.includes(clean)) {
      setCustomTags([...customTags, clean]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setCustomTags(customTags.filter((t) => t !== tagToRemove));
  };

  // FAST DIRECT SAVE (0ms latency, for native OKF documents)
  const handleInstantSave = async () => {
    if (!inputText.trim() || isProcessing) return;

    setIsProcessing(true);
    setProcessingStage("Salvataggio diretto OKF v0.2...");
    setErrorMessage(null);

    try {
      const title = customTitle || parsedDoc.title || "Documento Knowledge OKF";
      const docType = customDocType || parsedDoc.docType || "specification";
      const domain = customDomain || parsedDoc.domain || "Knowledge Architecture";
      const tags = customTags.length > 0 ? customTags : parsedDoc.tags;

      const metadata: Record<string, any> = {
        okfVersion: "0.2",
        domain,
        docType,
        entities: parsedDoc.entities || [{ name: title, type: "concept", description: "Entità cardine del documento" }],
        relations: parsedDoc.relations || [],
        markdownContent: inputText,
        sourceFileName: activeFileName || undefined,
      };

      const summary = parsedDoc.bodyMarkdown
        ? parsedDoc.bodyMarkdown.replace(/^[#*-]+\s*/gm, "").slice(0, 280)
        : title;

      const ok = await onUploadProcessedDoc({
        type: "knowledge",
        title,
        url: (initialSourceMetadata?.gdocUrl || initialSourceMetadata?.gdriveSourceUrl) || "",
        rawInput: inputText,
        summary: summary.trim(),
        tags,
        isFavorite: false,
        metadata: {
          ...metadata,
          ...(initialSourceMetadata || {}),
        },
      });

      if (ok) {
        logEvent("success", `Documento OKF v0.2 "${title}" salvato istantaneamente nel Vault.`);
        setSuccess(true);
        setSuccessMessage("Salvato con successo nel Vault!");
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1100);
      } else {
        throw new Error("Salvataggio non riuscito in Firestore. Controlla le regole di sicurezza o la connessione.");
      }
    } catch (err: any) {
      console.error("[Instant OKF Save] Error:", err);
      setErrorMessage(err.message || "Errore durante il salvataggio immediato");
      logEvent("error", "Errore durante il salvataggio immediato", err);
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  // AI CONVERSION VIA GEMINI 3.7 FLASH
  const handleAiConversion = async () => {
    if ((!inputText.trim() && !pdfPayload) || isProcessing) return;

    setIsProcessing(true);
    setProcessingStage("Inizializzazione pipeline ontologica...");
    setErrorMessage(null);

    try {
      const trimmedResources = existingResources.slice(0, 30).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        tags: r.tags || [],
      }));

      let result: any = null;

      // PATH 1: Binary PDF with Multimodal & OCR
      if (pdfPayload && pdfPayload.base64) {
        setProcessingStage("Trascrizione PDF e analisi multimodale con Gemini...");
        logEvent("info", `Avvio conversione multimodale per PDF: "${pdfPayload.name}"`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        try {
          const res = await fetch("/api/convert-file-to-okf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              base64: pdfPayload.base64,
              fileName: pdfPayload.name,
              fileType: "pdf",
              mimeType: "application/pdf",
              existingResources: trimmedResources,
              notes: "Documento importato da Knowledge Upload Dialog",
            }),
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.resource) {
              result = {
                title: data.resource.title,
                summary: data.resource.summary,
                tags: data.resource.tags,
                metadata: data.resource.metadata,
              };
            }
          }
        } catch (netErr: any) {
          console.warn("[PDF Ingestion] Endpoint failed or timed out:", netErr?.message);
        }
      }

      // PATH 2: Text / Markdown / Code processing
      if (!result) {
        setProcessingStage("Estrazione entità e topological linking (Gemini 3.7 Flash)...");
        logEvent("info", `Elaborazione semantica testo con Gemini per "${activeFileName || "documento"}"`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        try {
          const res = await fetch("/api/process-knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              text: inputText.trim(),
              filename: activeFileName || "documento.md",
              existingResources: trimmedResources,
            }),
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            result = data.result;
          }
        } catch (netErr: any) {
          console.warn("[Text Ingestion] Endpoint failed or timed out, applying heuristic fallback:", netErr?.message);
        }
      }

      // PATH 3: Resilient Local Fallback if server failed
      if (!result || !result.title) {
        setProcessingStage("Applicazione parser euristico locale ad alta fedeltà...");
        logEvent("warn", "Utilizzo fallback euristico locale per estrazione OKF.");
        const fallback = localFallbackAnalyzeResource(inputText.trim(), "knowledge");
        result = {
          title: customTitle || (activeFileName ? activeFileName.replace(/\.[^/.]+$/, "") : fallback.title),
          summary: fallback.summary,
          tags: customTags.length > 0 ? customTags : fallback.tags,
          metadata: {
            ...fallback.metadata,
            domain: customDomain || fallback.metadata?.domain || "Software Architecture",
            docType: customDocType || fallback.metadata?.docType || "specification",
          },
        };
      }

      setProcessingStage("Registrazione documento e nodi relazionali nel Vault...");

      const finalTitle = customTitle || result.title || activeFileName || "Documento Knowledge OKF";
      const finalDomain = customDomain || result.metadata?.domain || "Knowledge Architecture";
      const finalDocType = customDocType || result.metadata?.docType || "specification";
      const finalTags = customTags.length > 0 ? customTags : (result.tags || ["knowledge", "okf-v0.2"]);

      const ok = await onUploadProcessedDoc({
        type: "knowledge",
        title: finalTitle,
        url: (initialSourceMetadata?.gdocUrl || initialSourceMetadata?.gdriveSourceUrl) || "",
        rawInput: inputText,
        summary: result.summary || inputText.slice(0, 300),
        tags: finalTags,
        isFavorite: false,
        metadata: {
          ...(result.metadata || {}),
          okfVersion: "0.2",
          domain: finalDomain,
          docType: finalDocType,
          sourceFileName: activeFileName || undefined,
          ...(initialSourceMetadata || {}),
        },
      });

      if (ok) {
        logEvent("success", `Documento convertito e salvato con successo: "${finalTitle}"`);
        setSuccess(true);
        setSuccessMessage("Documento OKF v0.2 salvato nel Vault!");
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1100);
      } else {
        throw new Error("Salvataggio su Firestore fallito. Verifica la sessione di autenticazione.");
      }
    } catch (err: any) {
      console.error("[Knowledge AI Processing] Error:", err);
      setErrorMessage(err.message || "Errore sconosciuto durante la conversione OKF");
      logEvent("error", "Errore conversione OKF", err);
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  // MULTI-AGENT INGESTION PIPELINE (Orchestrator, Deconstructor, Ontologist, Graph Linker, Contradiction Sentinel, Serializer)
  const handleMultiAgentIngest = async (autoSave: boolean = true) => {
    if ((!inputText.trim() && !pdfPayload) || isProcessing) return;

    setIsProcessing(true);
    setProcessingStage("Avvio Orchestrator Multi-Agente OKF v0.2...");
    setErrorMessage(null);
    setContradictionAlert(null);

    const callStart = Date.now();
    try {
      const trimmedResources = existingResources.slice(0, 30).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        tags: r.tags || [],
        domain: (r.metadata as any)?.domain,
        summary: r.summary,
      }));

      logEvent("info", `Inizializzazione Ingestion Orchestrator per "${activeFileName || "documento"}" (${trimmedResources.length} nodi grafo)`);

      const timeoutMs = pdfPayload ? 90000 : 60000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch("/api/vault/agentic-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text: inputText.trim(),
          base64: pdfPayload?.base64,
          filename: activeFileName || (pdfPayload ? pdfPayload.name : "documento.md"),
          fileType: pdfPayload ? "pdf" : "text",
          existingResources: trimmedResources,
        }),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Errore server (${res.status}) durante l'ingestione multi-agente`);
      }

      const data = await res.json();
      if (!data.success || !data.resource) {
        throw new Error("Pipeline multi-agente completata senza generare la risorsa.");
      }

      // Aggiorna stato trace e orchestrazione
      setAgentSteps(data.agentSteps || []);
      setOrchestratorPlan(data.orchestratorPlan || "");
      setPipelineExecutionTime(data.executionTimeMs || (Date.now() - callStart));
      setPipelineModelUsed(data.modelUsed || "gemini-3.7-flash");

      if (data.contradictionWarning?.hasConflict) {
        setContradictionAlert(data.contradictionWarning);
        logEvent(
          "warn",
          `Contradiction Sentinel: rilevata collisione su "${data.contradictionWarning.conceptName}" con "${data.contradictionWarning.conflictingSourceTitle}"`,
          data.contradictionWarning
        );
      }

      const generatedResource = data.resource;
      setLastProcessedResource(generatedResource);
      setInputText(generatedResource.metadata?.markdownContent || inputText);
      setCustomTitle(generatedResource.title);
      setCustomDomain(generatedResource.metadata?.domain || "Knowledge Architecture");
      setCustomDocType(generatedResource.metadata?.docType || "specification");
      setCustomTags(generatedResource.tags || []);

      logEvent(
        "success",
        `Pipeline multi-agente completata con successo: 6 agenti, ${data.agentSteps?.length || 6} passaggi, ${data.executionTimeMs}ms.`
      );

      if (autoSave) {
        if (hasSavedDocRef.current) {
          setSuccess(true);
          setSuccessMessage("Documento già archiviato nel Vault!");
          setTimeout(() => {
            setSuccess(false);
            onClose();
          }, 800);
          return;
        }
        setProcessingStage("Salvataggio documento e nodi relazionali su Firestore...");
        const resType = (generatedResource.type as any) || "knowledge";
        const ok = await onUploadProcessedDoc({
          type: resType,
          title: generatedResource.title,
          url: (initialSourceMetadata?.gdocUrl || initialSourceMetadata?.gdriveSourceUrl) || generatedResource.url || "",
          rawInput: generatedResource.metadata?.markdownContent || inputText,
          summary: generatedResource.summary,
          tags: generatedResource.tags,
          isFavorite: false,
          metadata: {
            ...generatedResource.metadata,
            ...(initialSourceMetadata || {}),
          },
        });

        if (ok) {
          hasSavedDocRef.current = true;
          logEvent("success", `Documento "${generatedResource.title}" salvato nel Vault via Multi-Agent Orchestrator.`);
          setSuccess(true);
          setSuccessMessage("Documento strutturato e salvato con successo dal team di Agenti!");
          setTimeout(() => {
            setSuccess(false);
            onClose();
          }, 1200);
        } else {
          throw new Error("Salvataggio su Firestore non riuscito. Verifica la sessione o le regole di sicurezza.");
        }
      } else {
        setActiveTab("trace");
        setSuccessMessage("Orchestrazione completata! I 6 agenti hanno preparato il documento. Clicca su 'Salva nel Vault' per archiviarlo.");
      }
    } catch (err: any) {
      console.error("[MultiAgent Ingest] Error:", err);
      let msg = err.message || "";
      if (err.name === "AbortError" || msg.includes("aborted")) {
        msg = `La pipeline multi-agente ha superato il tempo massimo (${pdfPayload ? "90s" : "60s"}). Per documenti complessi, puoi salvare subito con 'Salva Istantaneo' o riprovare.`;
      } else if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        msg = "Impossibile contattare il server. Verifica la connessione di rete e riprova.";
      } else if (!msg || msg === "undefined") {
        msg = "Errore durante l'elaborazione dei 6 agenti. I dati inseriti sono preservati e puoi salvarli direttamente.";
      }
      setErrorMessage(msg);
      logEvent("error", "Errore pipeline multi-agente", { error: msg, raw: String(err) });
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  // Salvataggio immediato (0ms AI) del documento già analizzato dai 6 agenti o presente in editor
  const handleSaveProcessedDoc = async () => {
    if (!inputText.trim() || isProcessing) return;

    if (hasSavedDocRef.current) {
      setSuccess(true);
      setSuccessMessage("Documento già salvato nel Vault!");
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 800);
      return;
    }

    setIsProcessing(true);
    setProcessingStage("Salvataggio documento nel Vault...");
    setErrorMessage(null);

    try {
      const currentResource = lastProcessedResource;
      const title = customTitle || currentResource?.title || parsedDoc.title || "Documento Knowledge OKF";
      const docType = customDocType || currentResource?.metadata?.docType || parsedDoc.docType || "specification";
      const domain = customDomain || currentResource?.metadata?.domain || parsedDoc.domain || "Knowledge Architecture";
      const tags = customTags.length > 0 ? customTags : (currentResource?.tags || parsedDoc.tags || []);
      const resourceType = currentResource?.type || (parsedDoc.isValidOKF ? "knowledge" : "knowledge");

      const ok = await onUploadProcessedDoc({
        type: resourceType,
        title,
        url: (initialSourceMetadata?.gdocUrl || initialSourceMetadata?.gdriveSourceUrl) || currentResource?.url || "",
        rawInput: inputText,
        summary: currentResource?.summary || parsedDoc.bodyMarkdown?.slice(0, 280) || title,
        tags,
        isFavorite: false,
        metadata: {
          ...(currentResource?.metadata || {}),
          okfVersion: "0.2",
          domain,
          docType,
          markdownContent: inputText,
          entities: currentResource?.metadata?.entities || (parsedDoc.entities.length > 0 ? parsedDoc.entities : [{ name: title, type: "concept", description: "Entità cardine del documento" }]),
          relations: currentResource?.metadata?.relations || parsedDoc.relations || [],
          ...(initialSourceMetadata || {}),
        },
      });

      if (ok) {
        hasSavedDocRef.current = true;
        logEvent("success", `Documento "${title}" salvato con successo nel Vault.`);
        setSuccess(true);
        setSuccessMessage("Documento salvato con successo nel Vault!");
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1100);
      } else {
        throw new Error("Salvataggio non riuscito in Firestore. Verifica la connessione o i permessi.");
      }
    } catch (err: any) {
      console.error("[Save Processed Doc] Error:", err);
      setErrorMessage(err.message || "Errore durante il salvataggio nel Vault.");
      logEvent("error", "Errore salvataggio Vault", err);
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;
  const isOkfNative = parsedDoc.isValidOKF;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-[#0E0E0E] border border-[#242424] rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-[#1E1E1E] flex items-center justify-between gap-3 bg-[#0B0B0B]">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#161616] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0 shadow-sm">
              <Workflow className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-serif text-white font-medium tracking-tight truncate">
                  Pipeline Ingestione Documenti & Paper
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#1F1A12] text-[#C5A059] border border-[#C5A059]/30 shrink-0 flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> 6 Agenti OKF v0.2
                </span>
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40">
                  Pixel-to-Markdown OCR
                </span>
                {isOkfNative && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/50">
                    <CheckCircle className="w-3 h-3" /> Formato Nativo
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#777] font-mono truncate mt-0.5">
                Parsing multimodale, de-strutturazione, ontologia canonica, linking topologico e audit di contraddizione Cekikj
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-[#141414] p-1 rounded-lg border border-[#262626]">
            <button
              onClick={() => setActiveTab("editor")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "editor"
                  ? "bg-[#222] text-white shadow-sm"
                  : "text-[#888] hover:text-[#DDD]"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="hidden sm:inline">Ingestione & Editor</span>
              <span className="sm:hidden">Ingestione</span>
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "preview"
                  ? "bg-[#222] text-white shadow-sm"
                  : "text-[#888] hover:text-[#DDD]"
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="hidden sm:inline">Anteprima & Metadati</span>
              <span className="sm:hidden">Anteprima</span>
              {parsedDoc.entities.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-[#C5A059]/20 text-[#C5A059] font-mono">
                  {parsedDoc.entities.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("trace")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "trace"
                  ? "bg-[#222] text-white shadow-sm"
                  : "text-[#888] hover:text-[#DDD]"
              }`}
            >
              <Workflow className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="hidden sm:inline">Pipeline Trace (6 Agenti)</span>
              <span className="sm:hidden">Trace</span>
              {agentSteps.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-400 font-mono">
                  {agentSteps.length}
                </span>
              )}
              {contradictionAlert?.hasConflict && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Rilevata collisione epistemica" />
              )}
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Chiudi finestra"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#181818] hover:bg-[#252525] text-[#AAA] hover:text-white border border-[#2E2E2E] transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* TAB 1: SORGENTE & EDITOR */}
          {activeTab === "editor" && (
            <div className="space-y-4">
              {/* File Dropzone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all relative ${
                  dragActive
                    ? "border-[#C5A059] bg-[#C5A059]/10 shadow-lg shadow-[#C5A059]/10"
                    : "border-[#282828] hover:border-[#383838] bg-[#111]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.tex,.latex,.md,.markdown,.txt,.json,.yaml,.yml,.csv,.ts,.tsx,.py,.rs,.go"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFilesBatch(e.target.files);
                    }
                  }}
                />

                <div className="flex flex-col items-center justify-center gap-1.5">
                  <div className="w-10 h-10 rounded-full bg-[#181818] border border-[#2D2D2D] flex items-center justify-center text-[#C5A059] mb-1">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-white">
                    {activeFileName ? (
                      <span className="text-[#C5A059] flex items-center justify-center gap-1.5 font-mono">
                        <FileCode className="w-4 h-4" /> {activeFileName}
                      </span>
                    ) : (
                      "Trascina qui i tuoi Paper (.pdf, .tex), specifiche (.md), appunti (.txt, .json) o clicca per sfogliare"
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap justify-center">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1F1A12] text-[#C5A059] border border-[#C5A059]/30">
                      Pipeline Ingestione OKF v0.2
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-800/40">
                      Pixel-to-Markdown Multimodale
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#181818] text-[#888] border border-[#2A2A2A]">
                      LaTeX ($$) & Tabelle
                    </span>
                  </div>
                  <p className="text-[11px] text-[#666] font-mono max-w-md mt-0.5">
                    De-strutturazione layout, ontologia canonica, linking topologico automatico e audit di contraddizione Cekikj
                  </p>
                </div>
              </div>

              {/* Multi-file Queue Bar (if files uploaded) */}
              {fileQueue.length > 1 && (
                <div className="p-2.5 bg-[#141414] border border-[#242424] rounded-xl flex items-center gap-2 overflow-x-auto">
                  <div className="text-[10px] font-mono uppercase text-[#777] font-semibold px-2 shrink-0">
                    Coda ({fileQueue.length}):
                  </div>
                  {fileQueue.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectQueueItem(item)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono shrink-0 transition-all border ${
                        selectedQueueId === item.id
                          ? "bg-[#252015] border-[#C5A059]/60 text-[#C5A059]"
                          : "bg-[#181818] border-[#2A2A2A] text-[#888] hover:text-white"
                      }`}
                    >
                      {item.isPdf ? <FileText className="w-3.5 h-3.5 text-red-400" /> : <FileCode className="w-3.5 h-3.5 text-blue-400" />}
                      <span className="truncate max-w-[140px]">{item.name}</span>
                      <span className="text-[10px] text-[#666]">({(item.size / 1024).toFixed(0)}K)</span>
                      <span
                        onClick={(e) => removeQueueItem(item.id, e)}
                        className="hover:text-rose-400 p-0.5 rounded cursor-pointer"
                        title="Rimuovi"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Template Quick Loader bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-[#777] font-mono">
                  <BookOpen className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Template OKF Rapidi:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => loadTemplate("architecture")}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white border border-[#2B2B2B] transition-colors"
                  >
                    Architettura
                  </button>
                  <button
                    type="button"
                    onClick={() => loadTemplate("specification")}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white border border-[#2B2B2B] transition-colors"
                  >
                    Specifica
                  </button>
                  <button
                    type="button"
                    onClick={() => loadTemplate("prompt_skill")}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white border border-[#2B2B2B] transition-colors"
                  >
                    Prompt Skill
                  </button>
                  <button
                    type="button"
                    onClick={() => loadTemplate("guide")}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white border border-[#2B2B2B] transition-colors"
                  >
                    Runbook Guida
                  </button>
                </div>
              </div>

              {/* Editor Area with stats */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#777] mb-1.5">
                  <div className="flex items-center gap-2">
                    <span>Editor Documento Markdown:</span>
                    {isOkfNative && (
                      <span className="text-emerald-400 text-[10px] bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
                        Frontmatter OKF v0.2 Rilevato
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span>{wordCount} parole</span>
                    <span>{inputText.length} caratteri</span>
                    {inputText && (
                      <button
                        onClick={() => {
                          setInputText("");
                          setActiveFileName("");
                          setPdfPayload(null);
                        }}
                        className="text-rose-400 hover:text-rose-300 transition-colors ml-1 cursor-pointer"
                        title="Cancella tutto"
                      >
                        Pulisci
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={12}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder={`---\nokf_version: "0.2"\ntitle: "Titolo della Documentazione"\ntype: "specification"\ndomain: "Cloud Architecture"\ntags: ["architettura", "okf-v0.2"]\nentities:\n  - name: "Core Module"\n    type: "component"\n---\n\n# Titolo della Documentazione\n\nIncolla qui le tue specifiche o appunti tecnici...`}
                  className="w-full bg-[#111] border border-[#262626] focus:border-[#C5A059] rounded-xl p-3.5 text-xs text-[#DDD] font-mono leading-relaxed focus:outline-none transition-colors selection:bg-[#C5A059]/30"
                />
              </div>
            </div>
          )}

          {/* TAB 2: ANTEPRIMA STRUTTURATA & METADATI */}
          {activeTab === "preview" && (
            <div className="space-y-4">
              {/* Metadata Control Box */}
              <div className="bg-[#121212] border border-[#242424] rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#1E1E1E] pb-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
                    <Layers className="w-4 h-4" />
                    <span>Schema Metadati OKF v0.2</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#666]">
                    Modificabili prima del salvataggio nel Vault
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Titolo */}
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-mono text-[#888] mb-1">
                      Titolo Canonico
                    </label>
                    <input
                      type="text"
                      value={customTitle || parsedDoc.title}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="es. Architettura del Sistema"
                      className="w-full bg-[#161616] border border-[#2C2C2C] focus:border-[#C5A059] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>

                  {/* Tipo Documento */}
                  <div>
                    <label className="block text-[11px] font-mono text-[#888] mb-1">
                      Tipo Documento (DocType)
                    </label>
                    <select
                      value={customDocType || parsedDoc.docType}
                      onChange={(e) => setCustomDocType(e.target.value)}
                      className="w-full bg-[#161616] border border-[#2C2C2C] focus:border-[#C5A059] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                    >
                      <option value="specification">specification (Specifica)</option>
                      <option value="architecture">architecture (Architettura)</option>
                      <option value="concept">concept (Concetto)</option>
                      <option value="guide">guide (Guida / Runbook)</option>
                      <option value="tool_description">tool_description (Tool)</option>
                      <option value="prompt_skill">prompt_skill (Skill AI)</option>
                    </select>
                  </div>

                  {/* Dominio */}
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-mono text-[#888] mb-1">
                      Ambito & Dominio Tecnico
                    </label>
                    <input
                      type="text"
                      value={customDomain || parsedDoc.domain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="es. Cloud Systems & Distributed Architecture"
                      className="w-full bg-[#161616] border border-[#2C2C2C] focus:border-[#C5A059] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>

                  {/* Versione OKF */}
                  <div>
                    <label className="block text-[11px] font-mono text-[#888] mb-1">
                      Standard
                    </label>
                    <div className="bg-[#181818] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-[#C5A059] font-mono">
                      OKF v0.2 Validato
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-[11px] font-mono text-[#888] mb-1.5">
                    Tag Semantici
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {(customTags.length > 0 ? customTags : parsedDoc.tags).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono bg-[#1C1C1C] text-[#DDD] border border-[#333]"
                      >
                        <Tag className="w-3 h-3 text-[#C5A059]" />
                        {t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          className="hover:text-rose-400 ml-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 max-w-sm">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Aggiungi tag e premi Invio..."
                      className="flex-1 bg-[#161616] border border-[#2C2C2C] focus:border-[#C5A059] rounded-lg px-3 py-1 text-xs text-white font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-2.5 py-1 rounded-lg bg-[#222] hover:bg-[#2A2A2A] text-xs font-mono text-[#CCC] border border-[#333]"
                    >
                      Aggiungi
                    </button>
                  </div>
                </div>

                {/* Entities & Relations Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#1C1C1C]">
                  {/* Entities */}
                  <div>
                    <div className="text-[11px] font-mono text-[#777] mb-1 flex items-center gap-1.5">
                      <Network className="w-3 h-3 text-[#C5A059]" />
                      <span>Entità Riconosciute ({parsedDoc.entities.length}):</span>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-1 bg-[#0D0D0D] p-2 rounded-lg border border-[#202020]">
                      {parsedDoc.entities.length === 0 ? (
                        <p className="text-[11px] text-[#555] font-mono italic">
                          Nessuna entità esplicita nel frontmatter YAML (verranno estratte dall'IA).
                        </p>
                      ) : (
                        parsedDoc.entities.map((ent, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs font-mono bg-[#141414] px-2 py-1 rounded border border-[#222]">
                            <span className="text-white font-medium truncate">{ent.name}</span>
                            <span className="text-[10px] text-[#C5A059] bg-[#1E1A12] px-1.5 py-0.2 rounded border border-[#C5A059]/30">
                              {ent.type}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Relations */}
                  <div>
                    <div className="text-[11px] font-mono text-[#777] mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-[#C5A059]" />
                      <span>Relazioni nel Grafo ({parsedDoc.relations.length}):</span>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-1 bg-[#0D0D0D] p-2 rounded-lg border border-[#202020]">
                      {parsedDoc.relations.length === 0 ? (
                        <p className="text-[11px] text-[#555] font-mono italic">
                          Linking automatico verso {existingResources.length} risorse del Vault.
                        </p>
                      ) : (
                        parsedDoc.relations.map((rel, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs font-mono bg-[#141414] px-2 py-1 rounded border border-[#222]">
                            <span className="text-white truncate max-w-[140px]">{rel.targetTitle || "Risorsa"}</span>
                            <span className="text-[10px] text-blue-400 bg-blue-950/40 px-1.5 py-0.2 rounded border border-blue-800/40">
                              {rel.relationType} ({rel.weight || 0.8})
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rendered Markdown Preview Area */}
              <div className="bg-[#101010] border border-[#242424] rounded-xl p-4 sm:p-5">
                <div className="text-xs font-mono text-[#777] mb-3 border-b border-[#1C1C1C] pb-2 flex items-center justify-between">
                  <span>Anteprima Tipografica Markdown:</span>
                  <span className="text-[10px] text-[#555]">Corpo senza Frontmatter YAML</span>
                </div>
                <div className="prose prose-invert max-w-none text-xs text-[#CCC] leading-relaxed space-y-3 font-sans">
                  <Markdown>
                    {parsedDoc.bodyMarkdown || "*Nessun contenuto Markdown digitato o caricato.*"}
                  </Markdown>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TRACE AGENTI (MULTI-AGENT ORCHESTRATION TIMELINE) */}
          {activeTab === "trace" && (
            <div className="space-y-4">
              {/* Orchestrator Plan Banner */}
              {orchestratorPlan ? (
                <div className="p-4 bg-[#14120D] border border-[#C5A059]/40 rounded-xl space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-mono font-medium text-[#C5A059]">
                      <BrainCircuit className="w-4 h-4 text-[#C5A059]" />
                      <span>PIANO DI ORCHESTRAZIONE CENTRALE</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono text-[#AAA] bg-[#1E1A14] border border-[#332A1C]">
                        Modello: {pipelineModelUsed}
                      </span>
                      {pipelineExecutionTime !== null && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" /> {pipelineExecutionTime}ms
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-[#DDD] leading-relaxed font-sans">
                    {orchestratorPlan}
                  </p>
                </div>
              ) : (
                <div className="p-6 bg-[#111] border border-[#222] rounded-xl text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-[#181818] border border-[#333] flex items-center justify-center text-[#777] mx-auto">
                    <Workflow className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-medium text-white">Nessuna Orchestrazione Eseguita</h3>
                  <p className="text-xs text-[#888] max-w-md mx-auto">
                    Avvia la <strong>Pipeline Multi-Agente</strong> per attivare i 6 agenti cooperativi: deconstruction del formato, estrazione ontologica, topological graph linking e audit di contraddizione Cekikj.
                  </p>
                  <button
                    onClick={() => handleMultiAgentIngest(false)}
                    disabled={(!inputText.trim() && !pdfPayload) || isProcessing}
                    className="px-4 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span>Avvia Pipeline Multi-Agente (Solo Ispezione)</span>
                  </button>
                </div>
              )}

              {/* Contradiction Sentinel Alert Box */}
              {contradictionAlert?.hasConflict && (
                <div className="p-4 bg-amber-950/40 border border-amber-600/50 rounded-xl space-y-2 text-amber-200">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>CEKIKJ EPISTEMIC GATE: RILEVATA COLLISIONE O CONFLITTO APERTO</span>
                  </div>
                  <p className="text-xs text-amber-100 leading-relaxed">
                    Il nuovo documento contiene asserzioni su <strong>"{contradictionAlert.conceptName}"</strong> che divergono da quanto stabilito nella risorsa del Vault:
                  </p>
                  <div className="p-2.5 bg-black/40 border border-amber-700/30 rounded-lg text-xs font-mono text-amber-300">
                    <div><strong>Fonte in Conflitto:</strong> {contradictionAlert.conflictingSourceTitle}</div>
                    <div className="mt-1"><strong>Motivo del Conflitto:</strong> {contradictionAlert.conflictReason}</div>
                  </div>
                  <p className="text-[11px] text-amber-400/90 font-mono">
                    * Il documento è stato tipizzato preservando la traccia di vigenza. Puoi procedere al salvataggio o registrare il caso nel Registro Contraddizioni.
                  </p>
                </div>
              )}

              {/* Agent Timeline List */}
              {agentSteps.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono text-[#777] px-1">
                    <span>Cronologia Decisionale Agenti ({agentSteps.length} passaggi)</span>
                    <span>Zero-Guessing OKF v0.2</span>
                  </div>

                  <div className="space-y-2">
                    {agentSteps.map((step, idx) => {
                      const isOrch = step.agent === "orchestrator";
                      const isDecon = step.agent === "structural_deconstructor";
                      const isOnto = step.agent === "ontologist";
                      const isGraph = step.agent === "graph_linker";
                      const isContra = step.agent === "contradiction_sentinel";

                      const roleLabel = isOrch
                        ? "Ingestion Orchestrator"
                        : isDecon
                        ? "Structural Deconstructor"
                        : isOnto
                        ? "Ontologist Specialist"
                        : isGraph
                        ? "Topological Graph Linker"
                        : isContra
                        ? "Contradiction Sentinel (Cekikj)"
                        : "OKF v0.2 Serializer";

                      const badgeColor = isOrch
                        ? "text-[#C5A059] bg-[#C5A059]/10 border-[#C5A059]/30"
                        : isDecon
                        ? "text-sky-400 bg-sky-950/40 border-sky-800/40"
                        : isOnto
                        ? "text-purple-400 bg-purple-950/40 border-purple-800/40"
                        : isGraph
                        ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
                        : isContra
                        ? step.status === "warning"
                          ? "text-amber-400 bg-amber-950/40 border-amber-700/50"
                          : "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
                        : "text-indigo-400 bg-indigo-950/40 border-indigo-800/40";

                      return (
                        <div
                          key={idx}
                          className="p-3 bg-[#121212] border border-[#222] rounded-xl hover:border-[#2E2E2E] transition-all space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${badgeColor}`}>
                                {roleLabel}
                              </span>
                              <span className="text-xs text-white font-medium">
                                {step.action}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {step.itemsFound !== undefined && (
                                <span className="text-[10px] font-mono text-[#888] bg-[#181818] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
                                  {step.itemsFound} {isOnto ? "entità" : isGraph ? "archi" : isDecon ? "parole" : "elementi"}
                                </span>
                              )}
                              {step.latencyMs !== undefined && (
                                <span className="text-[10px] font-mono text-[#666]">
                                  {step.latencyMs}ms
                                </span>
                              )}
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  step.status === "success"
                                    ? "bg-emerald-500"
                                    : step.status === "warning"
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                                }`}
                                title={`Stato: ${step.status}`}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-[#AAA] leading-relaxed pl-1">
                            {step.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 bg-[#111] border border-[#222] rounded-xl flex items-center justify-between gap-3 mt-4">
                    <span className="text-xs text-[#888] font-mono">
                      Visualizza anteprima completa o procedi con il salvataggio:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveTab("preview")}
                        className="px-3 py-1.5 rounded-lg text-xs text-[#CCC] hover:text-white bg-[#1C1C1C] hover:bg-[#252525] border border-[#333] transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Ispeziona Anteprima & Metadati</span>
                      </button>
                      <button
                        onClick={handleSaveProcessedDoc}
                        disabled={isProcessing}
                        className="px-3.5 py-1.5 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Salva nel Vault</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Real-time processing progress bar */}
          {isProcessing && (
            <div className="p-3.5 bg-[#141414] border border-[#C5A059]/40 rounded-xl space-y-2 animate-pulse">
              <div className="flex items-center justify-between text-xs font-mono text-[#C5A059]">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#C5A059]" />
                  {processingStage || "Analisi e conversione in corso..."}
                </span>
                <span className="text-[10px] text-[#888]">Gemini 3.7 Flash Engine</span>
              </div>
              <div className="w-full bg-[#202020] h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#C5A059] h-full w-2/3 animate-pulse" />
              </div>
            </div>
          )}

          {/* Success Notification */}
          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-center gap-2.5 text-xs text-emerald-200">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Notification */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-start gap-2.5 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{errorMessage}</p>
                <p className="text-[10px] text-rose-400/80 font-mono mt-0.5">
                  Puoi salvare direttamente il testo modificando i campi o riprovare. I tuoi appunti non sono andati persi.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3.5 sm:p-5 border-t border-[#1C1C1C] flex flex-wrap items-center justify-between gap-3 bg-[#0B0B0B]">
          <div className="text-[11px] font-mono text-[#666] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Cross-linking su {existingResources.length} risorse attive nel Vault</span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-3.5 py-2 rounded-lg text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1C1C1C] border border-[#262626] transition-colors cursor-pointer disabled:opacity-50"
            >
              Annulla
            </button>

            {agentSteps.length > 0 ? (
              <>
                {/* Re-run pipeline if user updated the text */}
                <button
                  type="button"
                  onClick={() => handleMultiAgentIngest(false)}
                  disabled={(!inputText.trim() && !pdfPayload) || isProcessing}
                  className="px-3.5 py-2 rounded-lg text-xs text-[#DDD] bg-[#1A1A1A] hover:bg-[#252525] border border-[#333] hover:border-[#444] font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  title="Riesegui l'orchestrazione dei 6 agenti sui testi attuali"
                >
                  <RotateCw className={`w-3.5 h-3.5 text-[#C5A059] ${isProcessing ? "animate-spin" : ""}`} />
                  <span>Riesegui Pipeline (6 Agenti)</span>
                </button>

                {/* Primary action when trace is ready: Save immediately in 0ms */}
                <button
                  type="button"
                  onClick={handleSaveProcessedDoc}
                  disabled={!inputText.trim() || isProcessing}
                  className="px-4 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-[#C5A059]/20 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvataggio nel Vault...</span>
                    </>
                  ) : success ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-950" />
                      <span>Salvato nel Vault!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Salva nel Vault</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {/* If the document has valid OKF frontmatter, show instant 0ms save */}
                {isOkfNative && (
                  <button
                    type="button"
                    onClick={handleInstantSave}
                    disabled={!inputText.trim() || isProcessing}
                    className="px-3.5 py-2 rounded-lg text-xs text-[#C5A059] bg-[#1C1710] hover:bg-[#2A2012] border border-[#C5A059]/40 font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Salva direttamente senza attendere la rielaborazione dell'IA (0ms)"
                  >
                    <Zap className="w-3.5 h-3.5 fill-[#C5A059]" />
                    <span>Salva Istantaneo (0ms)</span>
                  </button>
                )}

                {/* Inspect Multi-Agent Pipeline Trace without immediately saving */}
                <button
                  type="button"
                  onClick={() => handleMultiAgentIngest(false)}
                  disabled={(!inputText.trim() && !pdfPayload) || isProcessing}
                  className="px-3.5 py-2 rounded-lg text-xs text-[#DDD] bg-[#1A1A1A] hover:bg-[#252525] border border-[#333] hover:border-[#444] font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  title="Esegui la pipeline di ingestione (6 Agenti) e visualizza la traccia di derivazione epistemica prima del salvataggio"
                >
                  <Workflow className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Trace Pipeline (6 Agenti)</span>
                </button>

                {/* Multi-Agent Orchestration & Save (Primary) */}
                <button
                  type="button"
                  onClick={() => handleMultiAgentIngest(true)}
                  disabled={(!inputText.trim() && !pdfPayload) || isProcessing}
                  className="px-4 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-[#C5A059]/20 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Esecuzione Pipeline Ingestione...</span>
                    </>
                  ) : success ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-950" />
                      <span>Ingerito & Salvato!</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>
                        {isOkfNative ? "Arricchisci & Ingerisci OKF" : "Esegui Ingestion Pipeline (6 Agenti)"}
                      </span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
