import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Folder,
  ExternalLink,
  Download,
  Upload,
  RefreshCw,
  Search,
  Sparkles,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Lock,
  Layers,
  FileCode,
  ArrowRight,
  Database,
  X,
  Plus,
  BookOpen,
  Headphones,
  Zap,
  FolderPlus,
  Settings,
  Copy,
  LogOut,
  FolderCheck,
  Check,
  BrainCircuit,
  ShieldAlert,
  Network,
  Cpu,
  GitMerge,
  CheckCircle2,
  HelpCircle,
  Sliders,
  Eye
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_KNOWLEDGE_FOLDER_NAME,
  DEFAULT_KNOWLEDGE_FOLDER_URL,
  TargetFolderOption,
  DriveFileInfo,
  GoogleDocExportResult,
  GoogleAuthExpiredError,
  hasValidGoogleToken,
  requestGoogleAccess,
  ensureGoogleAccessToken,
  getActiveFolderConfig,
  setActiveFolderConfig,
  findOrCreateUserKnowledgeFolder,
  verifyFolderAccess,
  listDriveFolderFiles,
  searchDriveDocsAndFiles,
  readDriveDocContent,
  exportResourceToGoogleDoc,
  batchExportResourcesToGoogleDocs,
  exportCompendiumToGoogleDoc,
  parseGoogleResourceUrl,
  searchNotebookLMDocs,
  exportNotebookLMSourceDoc,
  generateAgenticDossierSynthesis,
  AgenticDossierData
} from "../lib/googleDriveDocs";
import { clearGoogleAccessToken, auth } from "../lib/firebase";

export interface AgenticTraceStep {
  agent: "orchestrator" | "structural_deconstructor" | "ontologist" | "graph_linker" | "contradiction_sentinel" | "okf_serializer";
  action: string;
  description: string;
  itemsFound?: number;
  status: "success" | "warning" | "insufficient";
  timestamp: string;
  latencyMs?: number;
}

export interface AgenticContradictionWarning {
  hasConflict: boolean;
  conceptName?: string;
  conflictingSourceTitle?: string;
  vaultStatement?: string;
  docStatement?: string;
  recommendation?: string;
  severity?: "low" | "medium" | "high" | "critical" | string;
}

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultResources: ResourceItem[];
  onIngestContent: (input: string, explicitType?: ResourceType, sourceMetadata?: any) => Promise<boolean>;
  onManualAdd?: (item: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<boolean>;
  onOpenInKnowledgeStudio?: (text: string, fileName: string, sourceMetadata?: Record<string, any>) => void;
  onAddLog?: (level: any, category: any, message: string, details?: any) => void;
  selectedResourceForExport?: ResourceItem | null;
  onResourceExported?: (resourceId: string, exportResult: GoogleDocExportResult) => void;
}

type TabType = "folder" | "search" | "single_export" | "batch_export" | "export_digest" | "paste_link" | "notebooklm";

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  vaultResources,
  onIngestContent,
  onManualAdd,
  onOpenInKnowledgeStudio,
  onAddLog,
  selectedResourceForExport,
  onResourceExported
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(
    selectedResourceForExport ? "single_export" : "folder"
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Multi-Agent Pipeline Ingestion State
  const [isAgenticRunning, setIsAgenticRunning] = useState(false);
  const [agenticTargetTitle, setAgenticTargetTitle] = useState("");
  const [agenticCurrentStage, setAgenticCurrentStage] = useState("");
  const [agenticSteps, setAgenticSteps] = useState<AgenticTraceStep[]>([]);
  const [agenticPlan, setAgenticPlan] = useState<string>("");
  const [agenticContradiction, setAgenticContradiction] = useState<AgenticContradictionWarning | null>(null);
  const [agenticDuration, setAgenticDuration] = useState<number | null>(null);
  const [agenticResultResource, setAgenticResultResource] = useState<any | null>(null);
  const [agenticPendingCommit, setAgenticPendingCommit] = useState<(() => Promise<void>) | null>(null);
  const [showAgenticModal, setShowAgenticModal] = useState(false);

  // Multi-Agent Dossier Synthesis State for Compendium / NotebookLM
  const [useAgenticSynthesis, setUseAgenticSynthesis] = useState(true);
  const [isSynthesizingDossier, setIsSynthesizingDossier] = useState(false);

  // Folder Configuration State
  const [activeFolder, setActiveFolder] = useState<TargetFolderOption>(getActiveFolderConfig());
  const [isFolderSettingsOpen, setIsFolderSettingsOpen] = useState(false);
  const [customFolderInput, setCustomFolderInput] = useState("");
  const [isCreatingPersonalFolder, setIsCreatingPersonalFolder] = useState(false);
  const [folderConfigMessage, setFolderConfigMessage] = useState<string | null>(null);

  // Folder Files & Search State
  const [folderFiles, setFolderFiles] = useState<DriveFileInfo[]>([]);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<"all" | "gdoc" | "text">("all");
  const [searchResults, setSearchResults] = useState<DriveFileInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // NotebookLM Bridge State
  const [notebookLMFiles, setNotebookLMFiles] = useState<DriveFileInfo[]>([]);
  const [isLoadingNotebookLM, setIsLoadingNotebookLM] = useState(false);
  const [notebookLMPasteText, setNotebookLMPasteText] = useState("");
  const [notebookLMDocType, setNotebookLMDocType] = useState<"auto" | "briefing" | "study_guide" | "faq" | "audio_transcript">("auto");
  const [isIngestingNotebookLM, setIsIngestingNotebookLM] = useState(false);
  const [isExportingForNotebookLM, setIsExportingForNotebookLM] = useState(false);
  const [notebookLMExportResult, setNotebookLMExportResult] = useState<(GoogleDocExportResult & { notebookLMUrl: string }) | null>(null);

  // Ingestion State
  const [ingestingFileId, setIngestingFileId] = useState<string | null>(null);
  const [ingestSuccessMessage, setIngestSuccessMessage] = useState<string | null>(null);
  const [pastedUrl, setPastedUrl] = useState("");
  const [isIngestingPastedUrl, setIsIngestingPastedUrl] = useState(false);

  // Single & Compendium Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<GoogleDocExportResult | null>(null);
  const [digestTitle, setDigestTitle] = useState("Compendio Tecnico Knowledge Vault");
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);

  // Batch Export State
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchResults, setBatchResults] = useState<GoogleDocExportResult[]>([]);

  // Copied link toast state
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Initialize selected resources for digest when modal opens
  useEffect(() => {
    if (vaultResources.length > 0 && selectedResourceIds.length === 0) {
      setSelectedResourceIds(vaultResources.slice(0, 15).map((r) => r.id));
    }
  }, [vaultResources]);

  // Update active tab when single export is triggered
  useEffect(() => {
    if (selectedResourceForExport) {
      setActiveTab("single_export");
    }
  }, [selectedResourceForExport]);

  // On open: check if token already cached (WITHOUT opening popup)
  useEffect(() => {
    if (isOpen) {
      const isConnected = hasValidGoogleToken();
      setIsAuthenticated(isConnected);
      if (isConnected) {
        loadFolderContents();
      }
    }
  }, [isOpen]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  /**
   * Safe, explicit user click to authenticate with Google
   */
  const handleConnectGoogle = async () => {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      const token = await requestGoogleAccess();
      if (token) {
        setIsAuthenticated(true);
        loadFolderContents(token);
      }
    } catch (err: any) {
      console.warn("[GoogleDriveModal] Connessione fallita:", err);
      setAuthError(err.message || "Autenticazione Google non completata.");
      setIsAuthenticated(false);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnectGoogle = () => {
    clearGoogleAccessToken();
    setIsAuthenticated(false);
    setFolderFiles([]);
    setSearchResults([]);
  };

  /**
   * Load folder files for active target folder
   */
  const loadFolderContents = useCallback(async (explicitToken?: string) => {
    setIsLoadingFolder(true);
    setFolderError(null);
    try {
      const token = explicitToken || (await ensureGoogleAccessToken(false));
      const files = await listDriveFolderFiles(token, activeFolder.id);
      setFolderFiles(files);
    } catch (err: any) {
      console.error("[GoogleDriveModal] Errore lettura cartella:", err);
      if (err instanceof GoogleAuthExpiredError) {
        setIsAuthenticated(false);
        setAuthError("Sessione Google scaduta. Clicca su 'Autorizza' per riconnetterti.");
      } else {
        setFolderError(err.message || `Impossibile leggere la cartella "${activeFolder.name}".`);
      }
    } finally {
      setIsLoadingFolder(false);
    }
  }, [activeFolder.id, activeFolder.name]);

  /**
   * Create or select personal Knowledge Vault folder
   */
  const handleSetupPersonalFolder = async () => {
    setIsCreatingPersonalFolder(true);
    setFolderConfigMessage(null);
    try {
      const token = await ensureGoogleAccessToken();
      const personalFolder = await findOrCreateUserKnowledgeFolder(token, "Knowledge Vault");
      setActiveFolder(personalFolder);
      setActiveFolderConfig(personalFolder);
      setFolderConfigMessage(`Cartella personale "${personalFolder.name}" attivata su Google Drive!`);
      setIsFolderSettingsOpen(false);
      loadFolderContents(token);
    } catch (err: any) {
      setFolderConfigMessage(`Errore configurazione cartella: ${err.message}`);
    } finally {
      setIsCreatingPersonalFolder(false);
    }
  };

  /**
   * Switch back to shared team knowledge folder
   */
  const handleSelectTeamFolder = () => {
    const teamFolder: TargetFolderOption = {
      id: DEFAULT_KNOWLEDGE_FOLDER_ID,
      name: DEFAULT_KNOWLEDGE_FOLDER_NAME,
      url: DEFAULT_KNOWLEDGE_FOLDER_URL,
      isDefault: true
    };
    setActiveFolder(teamFolder);
    setActiveFolderConfig(teamFolder);
    setFolderConfigMessage("Cartella Team condivisa attivata.");
    setIsFolderSettingsOpen(false);
  };

  /**
   * Apply custom folder URL or ID
   */
  const handleApplyCustomFolder = async () => {
    if (!customFolderInput.trim()) return;
    const parsed = parseGoogleResourceUrl(customFolderInput.trim());
    const folderId = parsed ? parsed.id : customFolderInput.trim();

    try {
      const token = await ensureGoogleAccessToken();
      const verified = await verifyFolderAccess(token, folderId);
      if (!verified.accessible) {
        throw new Error(verified.error || "Cartella non accessibile");
      }

      const customFolder: TargetFolderOption = {
        id: folderId,
        name: verified.folderName || `Cartella (${folderId.slice(0, 8)}...)`,
        url: verified.webViewLink || `https://drive.google.com/drive/folders/${folderId}?usp=sharing`
      };
      setActiveFolder(customFolder);
      setActiveFolderConfig(customFolder);
      setFolderConfigMessage(`Cartella personalizzata "${customFolder.name}" collegata con successo!`);
      setCustomFolderInput("");
      setIsFolderSettingsOpen(false);
      loadFolderContents(token);
    } catch (err: any) {
      alert(`Impossibile collegare la cartella: ${err.message}`);
    }
  };

  /**
   * Search across Drive
   */
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const token = await ensureGoogleAccessToken();
      const results = await searchDriveDocsAndFiles(token, searchQuery, searchFilter);
      setSearchResults(results);
    } catch (err: any) {
      if (err instanceof GoogleAuthExpiredError) {
        setIsAuthenticated(false);
        setAuthError("Sessione Google scaduta. Effettua nuovamente l'accesso.");
      } else {
        setSearchError(err.message || "Errore durante la ricerca.");
      }
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * Multi-Agent Ingestion Pipeline Execution
   * Dispatches input to /api/vault/agentic-ingest through the 6-agent Cekikj pipeline.
   */
  const executeMultiAgentIngest = async (
    rawText: string,
    fileName: string,
    sourceMetadata: {
      gdocId?: string;
      gdocUrl?: string;
      gdriveSourceId?: string;
      sourceOrigin?: string;
      docType?: string;
      sourceMimeType?: string;
    }
  ) => {
    setIsAgenticRunning(true);
    setShowAgenticModal(true);
    setAgenticTargetTitle(fileName);
    setAgenticCurrentStage("Avvio Ingestion Orchestrator & Task Dispatcher...");
    setAgenticSteps([]);
    setAgenticPlan("");
    setAgenticContradiction(null);
    setAgenticDuration(null);
    setAgenticResultResource(null);
    setAgenticPendingCommit(null);

    const startTime = Date.now();
    try {
      const trimmedResources = vaultResources.slice(0, 30).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        tags: r.tags || [],
        domain: (r.metadata as any)?.domain,
        summary: r.summary,
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const res = await fetch("/api/vault/agentic-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text: rawText.trim(),
          filename: fileName,
          fileType: "text",
          notes: `Importato da Google Drive: ${fileName}`,
          existingResources: trimmedResources,
        }),
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Errore server (${res.status})`);
      }

      const data = await res.json();
      if (!data.success || !data.resource) {
        throw new Error("La pipeline multi-agente non ha prodotto la risorsa strutturata.");
      }

      setAgenticSteps(data.agentSteps || []);
      setAgenticPlan(data.orchestratorPlan || "");
      setAgenticDuration(data.executionTimeMs || (Date.now() - startTime));
      setAgenticResultResource(data.resource);

      const commitFunc = async () => {
        const completeMetadata = {
          ...(data.resource.metadata || {}),
          ...sourceMetadata,
          gdocId: sourceMetadata.gdocId,
          gdocUrl: sourceMetadata.gdocUrl,
          gdriveSourceId: sourceMetadata.gdriveSourceId,
          sourceOrigin: sourceMetadata.sourceOrigin || "Google Drive (Multi-Agent Ingest)",
        };

        if (onManualAdd) {
          await onManualAdd({
            type: data.resource.type || "knowledge",
            title: data.resource.title,
            url: sourceMetadata.gdocUrl || "",
            rawInput: data.resource.metadata?.markdownContent || rawText,
            summary: data.resource.summary,
            tags: data.resource.tags || ["knowledge", "google-docs"],
            isFavorite: false,
            metadata: completeMetadata,
          });
        } else {
          await onIngestContent(rawText, "knowledge", completeMetadata);
        }

        if (onAddLog) {
          onAddLog("success", "CAPTURE", `Documento "${data.resource.title}" inserito nel Vault con certificazione multi-agente.`);
        }
        setIngestSuccessMessage(`"${data.resource.title}" certificato e archiviato nel Vault!`);
        setTimeout(() => setIngestSuccessMessage(null), 5000);
      };

      if (data.contradictionWarning?.hasConflict) {
        setAgenticContradiction(data.contradictionWarning);
        setAgenticPendingCommit(() => commitFunc);
        if (onAddLog) {
          onAddLog("warn", "CAPTURE", `Contradiction Sentinel: conflitto epistemico su "${data.contradictionWarning.conceptName}"`, data.contradictionWarning);
        }
      } else {
        await commitFunc();
      }
    } catch (err: any) {
      console.error("[Multi-Agent Ingest Error]", err);
      alert(`Errore pipeline multi-agente: ${err.message}`);
    } finally {
      setIsAgenticRunning(false);
    }
  };

  /**
   * Ingest file via full 6-agent pipeline
   */
  const handleAgenticIngestFile = async (file: DriveFileInfo) => {
    try {
      const token = await ensureGoogleAccessToken();
      const { text, name, webViewLink, mimeType } = await readDriveDocContent(token, file.id, file.mimeType);
      if (!text || text.trim().length === 0) {
        throw new Error("Il file o Google Doc è vuoto.");
      }
      await executeMultiAgentIngest(text, name, {
        gdocId: file.id,
        gdocUrl: webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
        gdriveSourceId: file.id,
        sourceOrigin: "Google Drive (Multi-Agent)",
        sourceMimeType: mimeType,
      });
    } catch (err: any) {
      alert(`Errore lettura file Drive: ${err.message}`);
    }
  };

  /**
   * Opens file directly in Knowledge Studio dialog for manual or semi-automated editing
   */
  const handleOpenInStudio = async (file: DriveFileInfo) => {
    try {
      const token = await ensureGoogleAccessToken();
      const { text, name, webViewLink, mimeType } = await readDriveDocContent(token, file.id, file.mimeType);
      if (onOpenInKnowledgeStudio) {
        onOpenInKnowledgeStudio(text, name, {
          gdocId: file.id,
          gdocUrl: webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
          gdriveSourceId: file.id,
          originalFileName: name,
          sourceMimeType: mimeType,
          sourceOrigin: "Google Drive",
        });
      }
    } catch (err: any) {
      alert(`Errore apertura in Studio: ${err.message}`);
    }
  };

  const handleResolveContradictionInStudio = () => {
    if (onOpenInKnowledgeStudio && agenticResultResource) {
      onOpenInKnowledgeStudio(
        agenticResultResource.metadata?.markdownContent || agenticResultResource.rawInput || "",
        agenticResultResource.title || "Risoluzione Conflitto",
        {
          contradictionWarning: agenticContradiction,
          resolutionMode: "contradiction_override",
        }
      );
      setShowAgenticModal(false);
    }
  };

  const handleConfirmContradictionCommit = async () => {
    if (agenticPendingCommit) {
      await agenticPendingCommit();
      setAgenticContradiction(null);
      setAgenticPendingCommit(null);
    }
  };

  /**
   * Ingest file from Drive / Docs into Vault (Standard Direct Ingestion)
   */
  const handleIngestFile = async (file: DriveFileInfo) => {
    setIngestingFileId(file.id);
    setIngestSuccessMessage(null);
    try {
      const token = await ensureGoogleAccessToken();
      const { text, name, webViewLink, mimeType } = await readDriveDocContent(token, file.id, file.mimeType);

      if (!text || text.trim().length === 0) {
        throw new Error("Il file o Google Doc è vuoto.");
      }

      // Infer resource type
      let explicitType: ResourceType = "knowledge";
      const lowerName = name.toLowerCase();
      if (lowerName.includes("mcp") || lowerName.includes("server")) explicitType = "mcp_server";
      else if (lowerName.includes("skill") || lowerName.includes("prompt")) explicitType = "ai_skill";
      else if (lowerName.includes("repo") || lowerName.includes("github")) explicitType = "github_repo";
      else if (lowerName.includes("guida") || lowerName.includes("articol")) explicitType = "article";

      const success = await onIngestContent(text, explicitType, {
        gdriveSourceId: file.id,
        gdriveSourceUrl: webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
        gdocUrl: webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
        gdocId: file.id,
        originalFileName: name,
        sourceMimeType: mimeType
      });

      if (success) {
        setIngestSuccessMessage(`"${name}" ingerito e analizzato nel Vault con standard OKF v0.2!`);
        setTimeout(() => setIngestSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      alert(`Errore ingestione file: ${err.message}`);
    } finally {
      setIngestingFileId(null);
    }
  };

  /**
   * Ingest via pasted URL
   */
  const handleIngestPastedUrl = async (agentic: boolean = true) => {
    if (!pastedUrl.trim()) return;
    setIsIngestingPastedUrl(true);
    setIngestSuccessMessage(null);

    try {
      const parsed = parseGoogleResourceUrl(pastedUrl);
      if (!parsed) {
        throw new Error("URL non riconosciuto come Google Docs o Google Drive. Inserisci un link valido.");
      }

      const token = await ensureGoogleAccessToken();
      const { text, name, webViewLink, mimeType } = await readDriveDocContent(token, parsed.id);

      if (agentic) {
        await executeMultiAgentIngest(text, name, {
          gdocId: parsed.id,
          gdocUrl: webViewLink || pastedUrl,
          gdriveSourceId: parsed.id,
          sourceOrigin: "Google Docs Link (Multi-Agent)",
          sourceMimeType: mimeType,
        });
        setPastedUrl("");
      } else {
        const success = await onIngestContent(text, "knowledge", {
          gdriveSourceId: parsed.id,
          gdriveSourceUrl: webViewLink || pastedUrl,
          gdocUrl: webViewLink || pastedUrl,
          gdocId: parsed.id,
          originalFileName: name,
          sourceMimeType: mimeType,
        });

        if (success) {
          setIngestSuccessMessage(`"${name}" importato con successo da Google Docs!`);
          setPastedUrl("");
          setTimeout(() => setIngestSuccessMessage(null), 5000);
        }
      }
    } catch (err: any) {
      alert(`Errore importazione link: ${err.message}`);
    } finally {
      setIsIngestingPastedUrl(false);
    }
  };

  const handleOpenPastedUrlInStudio = async () => {
    if (!pastedUrl.trim()) return;
    try {
      const parsed = parseGoogleResourceUrl(pastedUrl);
      if (!parsed) {
        throw new Error("URL non valido.");
      }
      const token = await ensureGoogleAccessToken();
      const { text, name, webViewLink, mimeType } = await readDriveDocContent(token, parsed.id);
      if (onOpenInKnowledgeStudio) {
        onOpenInKnowledgeStudio(text, name, {
          gdocId: parsed.id,
          gdocUrl: webViewLink || pastedUrl,
          gdriveSourceId: parsed.id,
          sourceOrigin: "Google Docs Link",
          sourceMimeType: mimeType,
        });
      }
    } catch (err: any) {
      alert(`Errore apertura in Studio: ${err.message}`);
    }
  };

  /**
   * Export single resource
   */
  const handleExportSingle = async () => {
    if (!selectedResourceForExport) return;
    setIsExporting(true);
    setExportResult(null);

    try {
      const token = await ensureGoogleAccessToken();
      const res = await exportResourceToGoogleDoc(
        token, 
        selectedResourceForExport, 
        activeFolder.id,
        activeFolder.name
      );
      setExportResult(res);

      if (onResourceExported) {
        onResourceExported(selectedResourceForExport.id, res);
      }
    } catch (err: any) {
      alert(`Errore esportazione Google Doc: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Batch Export multiple selected resources as individual Google Docs
   */
  const handleBatchExport = async () => {
    const resourcesToExport = vaultResources.filter((r) => selectedResourceIds.includes(r.id));
    if (resourcesToExport.length === 0) {
      alert("Seleziona almeno una risorsa per l'esportazione batch.");
      return;
    }

    setIsBatchExporting(true);
    setBatchProgress({ current: 0, total: resourcesToExport.length });
    setBatchResults([]);

    try {
      const token = await ensureGoogleAccessToken();
      const results = await batchExportResourcesToGoogleDocs(
        token,
        resourcesToExport,
        activeFolder.id,
        activeFolder.name,
        (current, total, lastResult) => {
          setBatchProgress({ current, total });
          if (lastResult) {
            setBatchResults((prev) => [...prev, lastResult]);
            // Update resource metadata if callback is available
            if (onResourceExported) {
              const matchedResource = resourcesToExport[current - 1];
              if (matchedResource) {
                onResourceExported(matchedResource.id, lastResult);
              }
            }
          }
        }
      );

      setIngestSuccessMessage(`Esportazione batch completata: ${results.length} Google Docs creati in "${activeFolder.name}"!`);
      setTimeout(() => setIngestSuccessMessage(null), 6000);
    } catch (err: any) {
      alert(`Errore durante l'esportazione batch: ${err.message}`);
    } finally {
      setIsBatchExporting(false);
      setBatchProgress(null);
    }
  };

  /**
   * Export multi-resource digest compendium
   */
  const handleExportDigest = async () => {
    const resourcesToExport = vaultResources.filter((r) => selectedResourceIds.includes(r.id));
    if (resourcesToExport.length === 0) {
      alert("Seleziona almeno una risorsa da includere nel Compendio.");
      return;
    }

    setIsExporting(true);
    setExportResult(null);

    try {
      const token = await ensureGoogleAccessToken();
      let agenticDossier: AgenticDossierData | null = null;
      if (useAgenticSynthesis) {
        setIsSynthesizingDossier(true);
        agenticDossier = await generateAgenticDossierSynthesis(
          resourcesToExport,
          digestTitle,
          "google_docs"
        );
        setIsSynthesizingDossier(false);
      }

      const res = await exportCompendiumToGoogleDoc(
        token,
        resourcesToExport,
        digestTitle,
        activeFolder.id,
        activeFolder.name,
        agenticDossier
      );
      setExportResult(res);
    } catch (err: any) {
      alert(`Errore generazione Compendio: ${err.message}`);
    } finally {
      setIsExporting(false);
      setIsSynthesizingDossier(false);
    }
  };

  /**
   * Load files exported to Google Drive for NotebookLM
   */
  const loadNotebookLMFiles = async () => {
    setIsLoadingNotebookLM(true);
    try {
      const token = await ensureGoogleAccessToken();
      const files = await searchNotebookLMDocs(token);
      setNotebookLMFiles(files);
    } catch (err: any) {
      console.warn("Errore ricerca documenti NotebookLM:", err);
    } finally {
      setIsLoadingNotebookLM(false);
    }
  };

  /**
   * Ingest pasted NotebookLM output (via Multi-Agent Pipeline)
   */
  const handleAgenticIngestNotebookLM = async () => {
    if (!notebookLMPasteText.trim() || isAgenticRunning) return;
    const docName = notebookLMDocType === "briefing"
      ? "NotebookLM Briefing Doc"
      : notebookLMDocType === "study_guide"
      ? "NotebookLM Study Guide"
      : notebookLMDocType === "faq"
      ? "NotebookLM FAQ & Glossario"
      : notebookLMDocType === "audio_transcript"
      ? "NotebookLM Audio Deep Dive"
      : "NotebookLM Knowledge Digest";

    await executeMultiAgentIngest(notebookLMPasteText, docName, {
      sourceOrigin: "NotebookLM (Gemini)",
      docType: "concept",
    });
    setNotebookLMPasteText("");
  };

  const handleOpenNotebookLMInStudio = () => {
    if (!notebookLMPasteText.trim()) return;
    if (onOpenInKnowledgeStudio) {
      onOpenInKnowledgeStudio(notebookLMPasteText, "NotebookLM Synthesis", {
        sourceOrigin: "NotebookLM (Gemini)",
        docType: "concept",
      });
    }
  };

  /**
   * Ingest pasted NotebookLM output
   */
  const handleIngestNotebookLMPaste = async () => {
    if (!notebookLMPasteText.trim() || isIngestingNotebookLM) return;
    setIsIngestingNotebookLM(true);
    try {
      let typeLabel = "Appunti & Sintesi NotebookLM";
      let docKind = "guide";
      if (notebookLMDocType === "briefing") {
        typeLabel = "NotebookLM Briefing Doc";
        docKind = "guide";
      } else if (notebookLMDocType === "study_guide") {
        typeLabel = "NotebookLM Study Guide";
        docKind = "guide";
      } else if (notebookLMDocType === "faq") {
        typeLabel = "NotebookLM FAQ & Glossario";
        docKind = "specification";
      } else if (notebookLMDocType === "audio_transcript") {
        typeLabel = "NotebookLM Audio Overview Deep Dive";
        docKind = "concept";
      }

      const formattedInput = `[${typeLabel}]\n\n${notebookLMPasteText.trim()}`;

      const success = await onIngestContent(
        formattedInput,
        "knowledge",
        {
          sourceOrigin: "NotebookLM (Gemini)",
          docType: docKind,
          tags: ["notebooklm", "gemini", "ai-research", notebookLMDocType !== "auto" ? notebookLMDocType : "notes"]
        }
      );

      if (success) {
        setIngestSuccessMessage(`Output di NotebookLM ("${typeLabel}") ingerito e convertito in OKF v0.2!`);
        setNotebookLMPasteText("");
        setTimeout(() => setIngestSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      alert(`Errore ingestione NotebookLM: ${err.message}`);
    } finally {
      setIsIngestingNotebookLM(false);
    }
  };

  /**
   * Export vault resources as a high-density Google Doc for NotebookLM
   */
  const handleExportForNotebookLM = async () => {
    setIsExportingForNotebookLM(true);
    setNotebookLMExportResult(null);
    try {
      const token = await ensureGoogleAccessToken();
      const selected = vaultResources.filter(r => selectedResourceIds.includes(r.id));
      const resourcesToSend = selected.length > 0 ? selected : vaultResources.slice(0, 15);
      
      let agenticDossier: AgenticDossierData | null = null;
      if (useAgenticSynthesis) {
        setIsSynthesizingDossier(true);
        agenticDossier = await generateAgenticDossierSynthesis(
          resourcesToSend,
          "Dossier Epistemico NotebookLM",
          "notebooklm"
        );
        setIsSynthesizingDossier(false);
      }

      const res = await exportNotebookLMSourceDoc(
        token,
        resourcesToSend,
        activeFolder.id,
        undefined,
        activeFolder.name,
        agenticDossier
      );

      setNotebookLMExportResult(res);
    } catch (err: any) {
      alert(`Errore creazione sorgente per NotebookLM: ${err.message}`);
    } finally {
      setIsExportingForNotebookLM(false);
      setIsSynthesizingDossier(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-5xl bg-[#0D0D0D] border border-[#C5A059]/40 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-neutral-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222] bg-[#121212]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold text-white tracking-wide font-serif">
                  Google Drive & Docs Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-950/60 text-blue-300 border border-blue-800/40">
                  Workspace API v3
                </span>
                {isAuthenticated ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Connesso
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-900 text-neutral-400 border border-neutral-700/50">
                    Non Connesso
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-[#888] mt-0.5">
                <span>Cartella attiva:</span>
                <span className="text-white font-medium flex items-center gap-1">
                  <Folder className="w-3.5 h-3.5 text-[#C5A059]" />
                  {activeFolder.name}
                </span>
                <button
                  type="button"
                  onClick={() => setIsFolderSettingsOpen(!isFolderSettingsOpen)}
                  className="text-[11px] text-[#C5A059] hover:underline flex items-center gap-1 ml-1"
                  title="Cambia cartella di destinazione"
                >
                  <Settings className="w-3 h-3" />
                  Cambia
                </button>
                <a
                  href={activeFolder.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 ml-1"
                  title="Apri cartella su Google Drive"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={handleDisconnectGoogle}
                className="p-1.5 rounded-lg bg-[#1A1A1A] hover:bg-[#252525] text-neutral-400 hover:text-red-400 border border-[#2B2B2B] text-xs transition-colors"
                title="Disconnetti Google Workspace"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#222] text-[#888] hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Folder Switcher Drawer (Collapsible) */}
        {isFolderSettingsOpen && (
          <div className="px-5 py-3.5 bg-[#171717] border-b border-[#282828] space-y-3 animate-fade-in text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <FolderCheck className="w-4 h-4 text-[#C5A059]" />
                Seleziona Cartella di Destinazione Google Drive
              </span>
              <button
                onClick={() => setIsFolderSettingsOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                Chiudi
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Team Shared Folder */}
              <button
                type="button"
                onClick={handleSelectTeamFolder}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  activeFolder.id === DEFAULT_KNOWLEDGE_FOLDER_ID
                    ? "bg-[#C5A059]/15 border-[#C5A059] text-white"
                    : "bg-[#101010] border-[#2A2A2A] text-neutral-300 hover:border-[#444]"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-medium text-xs flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-[#C5A059]" />
                    Cartella Team Condivisa
                  </span>
                  {activeFolder.id === DEFAULT_KNOWLEDGE_FOLDER_ID && (
                    <span className="w-2 h-2 rounded-full bg-[#C5A059]"></span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">
                  knowledge (Default condiviso con i collaboratori del Vault)
                </p>
              </button>

              {/* Option 2: Personal Knowledge Vault Folder */}
              <button
                type="button"
                onClick={handleSetupPersonalFolder}
                disabled={isCreatingPersonalFolder}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  activeFolder.isPersonal
                    ? "bg-emerald-950/40 border-emerald-500 text-white"
                    : "bg-[#101010] border-[#2A2A2A] text-neutral-300 hover:border-[#444]"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-medium text-xs flex items-center gap-1.5">
                    <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
                    Mia Cartella Drive Personale
                  </span>
                  {activeFolder.isPersonal && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">
                  {isCreatingPersonalFolder 
                    ? "Verifica / Creazione su Drive..." 
                    : "Crea o usa 'Knowledge Vault' nel tuo account Google personale"}
                </p>
              </button>
            </div>

            {/* Option 3: Custom Folder ID / URL */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={customFolderInput}
                onChange={(e) => setCustomFolderInput(e.target.value)}
                placeholder="Incolla URL o ID di una qualsiasi cartella Google Drive..."
                className="flex-1 px-3 py-1.5 bg-[#0D0D0D] border border-[#333] focus:border-[#C5A059] rounded-xl text-xs text-white placeholder-neutral-500 outline-none"
              />
              <button
                type="button"
                onClick={handleApplyCustomFolder}
                disabled={!customFolderInput.trim()}
                className="px-3 py-1.5 bg-[#262626] hover:bg-[#333] disabled:opacity-50 text-white rounded-xl text-xs font-medium shrink-0"
              >
                Collega Cartella
              </button>
            </div>

            {folderConfigMessage && (
              <p className="text-[11px] text-[#C5A059] italic">{folderConfigMessage}</p>
            )}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1E1E1E] bg-[#0A0A0A] overflow-x-auto scrollbar-thin">
          <button
            onClick={() => { setActiveTab("folder"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "folder"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            Cartella Drive ({folderFiles.length})
          </button>

          <button
            onClick={() => { setActiveTab("search"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "search"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Cerca in Tutto Drive
          </button>

          <button
            onClick={() => { setActiveTab("paste_link"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "paste_link"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Importa da Link
          </button>

          {selectedResourceForExport && (
            <button
              onClick={() => { setActiveTab("single_export"); setExportResult(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "single_export"
                  ? "bg-[#C5A059] text-black font-semibold"
                  : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Esporta Risorsa
            </button>
          )}

          <button
            onClick={() => { setActiveTab("batch_export"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "batch_export"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Batch Export Singoli Docs
          </button>

          <button
            onClick={() => { setActiveTab("export_digest"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "export_digest"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Crea Compendio ({vaultResources.length})
          </button>

          <button
            onClick={() => { 
              setActiveTab("notebooklm"); 
              setExportResult(null); 
              if (notebookLMFiles.length === 0 && isAuthenticated) loadNotebookLMFiles();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "notebooklm"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-md"
                : "text-emerald-400 hover:text-white hover:bg-emerald-950/40 border border-emerald-800/30"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-300" />
            <span>NotebookLM & Gemini</span>
          </button>
        </div>

        {/* Global Notifications */}
        {ingestSuccessMessage && (
          <div className="mx-4 mt-3 p-3 bg-emerald-950/70 border border-emerald-600/50 rounded-xl flex items-center justify-between gap-2 text-xs text-emerald-200 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="font-medium">{ingestSuccessMessage}</span>
            </div>
            <button
              onClick={() => setIngestSuccessMessage(null)}
              className="text-emerald-400 hover:text-white text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Auth Barrier Notice: Clean, Safe Google Connection Card */}
        {!isAuthenticated && (
          <div className="p-8 m-5 bg-[#14120B] border border-[#C5A059]/30 rounded-2xl text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#C5A059]/15 border border-[#C5A059]/30 flex items-center justify-center text-[#C5A059]">
              <Lock className="w-7 h-7" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-semibold text-white tracking-wide">
                Connetti Google Workspace
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Autorizza l'accesso con il tuo account Google per esportare risorse come Google Docs formattati (OKF v0.2), esplorare la cartella <strong className="text-[#C5A059]">{activeFolder.name}</strong> e sincronizzare i documenti con NotebookLM.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={isAuthenticating}
                className="px-6 py-3 rounded-xl bg-[#4285F4] hover:bg-[#3367D6] disabled:bg-[#333] text-white font-medium text-xs shadow-lg transition-all inline-flex items-center gap-2.5 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                {isAuthenticating ? "Connessione in corso..." : "Autorizza Google Drive & Docs"}
              </button>
            </div>

            {authError && (
              <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-xs text-red-300 max-w-md mx-auto">
                <p>{authError}</p>
              </div>
            )}

            <div className="pt-2 text-[11px] text-neutral-500 flex items-center justify-center gap-4">
              <span>✓ Ambito minimo (drive.file & docs)</span>
              <span>✓ Token memorizzato solo nella sessione</span>
              <span>✓ Zero invio a server esterni</span>
            </div>
          </div>
        )}

        {/* Modal Body */}
        {isAuthenticated && (
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            
            {/* TAB 1: Folder View */}
            {activeTab === "folder" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-[#BBB]">
                    <Folder className="w-4 h-4 text-[#C5A059]" />
                    <span>Contenuto cartella: <strong className="text-white">{activeFolder.name}</strong></span>
                    <span className="text-[#666]">({folderFiles.length} file rilevati)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadFolderContents()}
                      disabled={isLoadingFolder}
                      className="px-2.5 py-1 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#333] text-xs text-[#AAA] hover:text-white flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingFolder ? "animate-spin text-[#C5A059]" : ""}`} />
                      Aggiorna
                    </button>
                    <a
                      href={activeFolder.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#333] text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Apri su Drive
                    </a>
                  </div>
                </div>

                {isLoadingFolder ? (
                  <div className="py-12 text-center text-xs text-[#888] space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C5A059]" />
                    <p>Scansione cartella Google Drive in corso...</p>
                  </div>
                ) : folderError ? (
                  <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-xl text-xs text-red-300 space-y-2">
                    <p className="font-semibold">Impossibile leggere la cartella</p>
                    <p>{folderError}</p>
                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={handleSetupPersonalFolder}
                        className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium"
                      >
                        Passa alla mia cartella personale Drive
                      </button>
                      <button
                        onClick={() => setIsFolderSettingsOpen(true)}
                        className="px-3 py-1.5 bg-[#252525] hover:bg-[#333] text-neutral-300 rounded-lg text-xs"
                      >
                        Configura altra cartella
                      </button>
                    </div>
                  </div>
                ) : folderFiles.length === 0 ? (
                  <div className="p-8 text-center bg-[#141414] border border-[#222] rounded-xl space-y-2 text-xs text-[#888]">
                    <Folder className="w-8 h-8 mx-auto text-[#555]" />
                    <p className="font-medium text-white">Nessun file presente nella cartella "{activeFolder.name}"</p>
                    <p className="max-w-md mx-auto">
                      Puoi esportare schede dal Vault, generare il Compendio tecnico, oppure caricare file Google Docs e Markdown nella cartella su Drive.
                    </p>
                    <div className="pt-2 flex items-center justify-center gap-2">
                      <a
                        href={activeFolder.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#222] text-[#C5A059] hover:underline text-xs"
                      >
                        Apri cartella su Google Drive
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {folderFiles.map((file) => {
                      const isGDoc = file.mimeType === "application/vnd.google-apps.document";
                      const isIngesting = ingestingFileId === file.id;

                      return (
                        <div
                          key={file.id}
                          className="p-3 bg-[#141414] hover:bg-[#181818] border border-[#222] hover:border-[#C5A059]/40 rounded-xl flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isGDoc ? "bg-blue-950/40 text-blue-400 border border-blue-800/30" : "bg-amber-950/30 text-amber-400 border border-amber-800/30"
                            }`}>
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-medium text-white truncate">{file.name}</h4>
                              <p className="text-[10px] text-[#666] flex items-center gap-2">
                                <span className="font-mono text-[9px] uppercase px-1.5 py-0.2 bg-[#222] rounded text-neutral-300">
                                  {isGDoc ? "Google Doc" : file.mimeType.split("/").pop()}
                                </span>
                                {file.modifiedTime && (
                                  <span>Modificato: {new Date(file.modifiedTime).toLocaleDateString()}</span>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-[#222] hover:bg-[#2A2A2A] text-[#888] hover:text-white text-xs"
                                title="Apri su Google Docs"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {onOpenInKnowledgeStudio && (
                              <button
                                onClick={() => handleOpenInStudio(file)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#1E1E1E] hover:bg-[#282828] border border-[#333] text-neutral-300 hover:text-white text-xs flex items-center gap-1 transition-all"
                                title="Apri nello Studio OKF"
                              >
                                <FileCode className="w-3 h-3 text-[#C5A059]" />
                                <span className="hidden sm:inline">Studio OKF</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleAgenticIngestFile(file)}
                              disabled={isAgenticRunning}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#C5A059] to-[#E5C683] hover:from-[#D5B069] hover:to-[#F0D597] disabled:opacity-50 text-black font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm"
                              title="Avvia la pipeline di certificazione a 6 agenti autonomi"
                            >
                              <BrainCircuit className="w-3.5 h-3.5 text-black" />
                              <span>Pipeline Agenti</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Search across Drive */}
            {activeTab === "search" && (
              <div className="space-y-4">
                <form onSubmit={handleSearch} className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cerca documenti Google Docs o note in Google Drive per nome o testo..."
                        className="w-full pl-9 pr-3 py-2 bg-[#141414] border border-[#333] focus:border-[#C5A059] rounded-xl text-xs text-white placeholder-[#666] outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSearching || !searchQuery.trim()}
                      className="px-4 py-2 bg-[#C5A059] text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    >
                      {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      Cerca
                    </button>
                  </div>

                  {/* Filter chips */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-neutral-500 text-[11px]">Tipo file:</span>
                    <button
                      type="button"
                      onClick={() => setSearchFilter("all")}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                        searchFilter === "all" ? "bg-[#C5A059] text-black font-semibold" : "bg-[#1E1E1E] text-neutral-400"
                      }`}
                    >
                      Tutti i formati
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchFilter("gdoc")}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                        searchFilter === "gdoc" ? "bg-blue-600 text-white font-semibold" : "bg-[#1E1E1E] text-neutral-400"
                      }`}
                    >
                      Solo Google Docs
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchFilter("text")}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                        searchFilter === "text" ? "bg-amber-600 text-white font-semibold" : "bg-[#1E1E1E] text-neutral-400"
                      }`}
                    >
                      Markdown & Testo
                    </button>
                  </div>
                </form>

                {searchError && (
                  <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-xs text-red-300">
                    {searchError}
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    <p className="text-xs text-[#888]">Risultati ricerca ({searchResults.length}):</p>
                    {searchResults.map((file) => (
                      <div
                        key={file.id}
                        className="p-3 bg-[#141414] border border-[#222] hover:border-[#C5A059]/40 rounded-xl flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <h4 className="text-xs font-medium text-white truncate">{file.name}</h4>
                          <p className="text-[10px] text-[#666]">{file.mimeType}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-[#222] text-[#888] hover:text-white"
                              title="Apri link"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {onOpenInKnowledgeStudio && (
                            <button
                              onClick={() => handleOpenInStudio(file)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#1E1E1E] hover:bg-[#282828] border border-[#333] text-neutral-300 hover:text-white text-xs flex items-center gap-1 transition-all"
                              title="Apri nello Studio OKF"
                            >
                              <FileCode className="w-3 h-3 text-[#C5A059]" />
                              <span className="hidden sm:inline">Studio OKF</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleAgenticIngestFile(file)}
                            disabled={isAgenticRunning}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#C5A059] to-[#E5C683] hover:from-[#D5B069] hover:to-[#F0D597] disabled:opacity-50 text-black font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm"
                          >
                            <BrainCircuit className="w-3.5 h-3.5 text-black" />
                            <span>Pipeline Agenti</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Paste Link */}
            {activeTab === "paste_link" && (
              <div className="p-5 bg-[#141414] border border-[#222] rounded-xl space-y-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-white">Importa da URL Google Docs o Google Drive</h4>
                  <p className="text-[11px] text-[#888]">
                    Incolla un link come <code className="text-[#C5A059]">https://docs.google.com/document/d/...</code> per estrarne automaticamente il testo e processarlo attraverso la pipeline multi-agente conforme allo standard OKF v0.2.
                  </p>
                </div>
                <div className="flex gap-2 flex-col sm:flex-row">
                  <input
                    type="url"
                    value={pastedUrl}
                    onChange={(e) => setPastedUrl(e.target.value)}
                    placeholder="https://docs.google.com/document/d/..."
                    className="flex-1 px-3 py-2 bg-[#0A0A0A] border border-[#333] focus:border-[#C5A059] rounded-xl text-xs text-white placeholder-[#666] outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    {onOpenInKnowledgeStudio && (
                      <button
                        onClick={handleOpenPastedUrlInStudio}
                        disabled={!pastedUrl.trim()}
                        className="px-3 py-2 bg-[#1E1E1E] hover:bg-[#282828] border border-[#333] text-neutral-300 hover:text-white rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
                        title="Apri nello Studio OKF per editing manuale"
                      >
                        <FileCode className="w-3.5 h-3.5 text-[#C5A059]" />
                        Studio OKF
                      </button>
                    )}
                    <button
                      onClick={() => handleIngestPastedUrl(true)}
                      disabled={isIngestingPastedUrl || isAgenticRunning || !pastedUrl.trim()}
                      className="px-4 py-2 bg-gradient-to-r from-[#C5A059] to-[#E5C683] hover:from-[#D5B069] hover:to-[#F0D597] text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isIngestingPastedUrl ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Lettura link...
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="w-3.5 h-3.5" />
                          Pipeline Agenti
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Single Resource Export */}
            {activeTab === "single_export" && selectedResourceForExport && (
              <div className="space-y-4">
                <div className="p-4 bg-[#141414] border border-[#222] rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono font-semibold bg-[#C5A059]/20 text-[#C5A059]">
                      {selectedResourceForExport.type}
                    </span>
                    <span className="text-[10px] text-[#888]">Destinazione: {activeFolder.name}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">{selectedResourceForExport.title}</h3>
                  <p className="text-xs text-[#AAA] line-clamp-2">{selectedResourceForExport.summary}</p>
                </div>

                {exportResult ? (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-600/40 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      Google Doc creato con successo nella cartella "{activeFolder.name}"!
                    </div>
                    <p className="text-xs text-[#AAA] font-mono">{exportResult.title}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={exportResult.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Apri Documento su Google Docs
                      </a>
                      <button
                        onClick={() => copyToClipboard(exportResult.docUrl)}
                        className="px-3 py-2 bg-[#222] hover:bg-[#333] text-[#CCC] rounded-xl text-xs flex items-center gap-1"
                      >
                        {copiedLink === exportResult.docUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedLink === exportResult.docUrl ? "Copiato!" : "Copia Link"}
                      </button>
                      <a
                        href={exportResult.folderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 bg-[#222] hover:bg-[#333] text-[#CCC] rounded-xl text-xs flex items-center gap-1"
                      >
                        <Folder className="w-3.5 h-3.5 text-[#C5A059]" />
                        Apri Cartella Drive
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-[#888]">
                      Verrà generato un documento Google Docs formattato con intestazione OKF v0.2, frontmatter YAML, riepilogo esecutivo, tabella entità e relazioni topologiche, salvato direttamente in <strong className="text-[#C5A059]">{activeFolder.name}</strong>.
                    </p>
                    <button
                      onClick={handleExportSingle}
                      disabled={isExporting}
                      className="w-full py-3 bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#333] text-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                    >
                      {isExporting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Generazione Google Doc in corso...
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          Crea Google Doc in cartella "{activeFolder.name}"
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: Batch Export Multiple Individual Google Docs */}
            {activeTab === "batch_export" && (
              <div className="space-y-4">
                <div className="p-4 bg-[#141414] border border-[#222] rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Esportazione Batch in Singoli Google Docs
                    </h4>
                    <span className="text-[10px] text-neutral-400">Standard OKF v0.2</span>
                  </div>
                  <p className="text-xs text-neutral-400">
                    Crea un documento Google Doc dedicato per ciascuna delle schede selezionate nella cartella <strong className="text-[#C5A059]">{activeFolder.name}</strong>.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#AAA]">Risorse da esportare ({selectedResourceIds.length}/{vaultResources.length})</span>
                    <button
                      onClick={() => {
                        if (selectedResourceIds.length === vaultResources.length) {
                          setSelectedResourceIds([]);
                        } else {
                          setSelectedResourceIds(vaultResources.map((r) => r.id));
                        }
                      }}
                      className="text-[#C5A059] hover:underline"
                    >
                      {selectedResourceIds.length === vaultResources.length ? "Deseleziona tutte" : "Seleziona tutte"}
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 border border-[#222] p-2 rounded-xl bg-[#0A0A0A]">
                    {vaultResources.map((r) => {
                      const isChecked = selectedResourceIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 p-2 hover:bg-[#141414] rounded-lg cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedResourceIds((prev) => [...prev, r.id]);
                              } else {
                                setSelectedResourceIds((prev) => prev.filter((id) => id !== r.id));
                              }
                            }}
                            className="rounded border-[#444] text-[#C5A059] focus:ring-[#C5A059]"
                          />
                          <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-mono bg-[#222] text-[#AAA]">
                            {r.type}
                          </span>
                          <span className="truncate text-white flex-1">{r.title}</span>
                          {r.metadata?.gdocUrl && (
                            <span className="text-[10px] text-blue-400 font-mono">GDoc esistente</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {isBatchExporting && batchProgress && (
                  <div className="p-4 bg-[#141414] border border-[#333] rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-white">
                      <span>Avanzamento esportazione:</span>
                      <span className="font-mono font-semibold">{batchProgress.current} / {batchProgress.total}</span>
                    </div>
                    <div className="w-full bg-[#222] rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-amber-400 h-2 transition-all duration-300 rounded-full"
                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {batchResults.length > 0 && !isBatchExporting && (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-600/40 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between text-emerald-300 text-xs font-semibold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        {batchResults.length} Documenti esportati con successo in "{activeFolder.name}"!
                      </span>
                      <a
                        href={activeFolder.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-emerald-300 flex items-center gap-1"
                      >
                        Vedi cartella <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleBatchExport}
                  disabled={isBatchExporting || selectedResourceIds.length === 0}
                  className="w-full py-3 bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#333] text-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  {isBatchExporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Esportazione batch in corso...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Avvia Batch Export ({selectedResourceIds.length} Google Docs)
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 6: Digest / Compendium Export */}
            {activeTab === "export_digest" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white">Titolo del Compendio</label>
                  <input
                    type="text"
                    value={digestTitle}
                    onChange={(e) => setDigestTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-[#141414] border border-[#333] focus:border-[#C5A059] rounded-xl text-xs text-white outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#AAA]">Risorse incluse ({selectedResourceIds.length}/{vaultResources.length})</span>
                    <button
                      onClick={() => {
                        if (selectedResourceIds.length === vaultResources.length) {
                          setSelectedResourceIds([]);
                        } else {
                          setSelectedResourceIds(vaultResources.map((r) => r.id));
                        }
                      }}
                      className="text-[#C5A059] hover:underline"
                    >
                      {selectedResourceIds.length === vaultResources.length ? "Deseleziona tutte" : "Seleziona tutte"}
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 border border-[#222] p-2 rounded-xl bg-[#0A0A0A]">
                    {vaultResources.map((r) => {
                      const isChecked = selectedResourceIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 p-2 hover:bg-[#141414] rounded-lg cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedResourceIds((prev) => [...prev, r.id]);
                              } else {
                                setSelectedResourceIds((prev) => prev.filter((id) => id !== r.id));
                              }
                            }}
                            className="rounded border-[#444] text-[#C5A059] focus:ring-[#C5A059]"
                          />
                          <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-mono bg-[#222] text-[#AAA]">
                            {r.type}
                          </span>
                          <span className="truncate text-white flex-1">{r.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Agentic Dossier Synthesis Toggle */}
                <div className="p-3 bg-gradient-to-r from-[#17150E] to-[#121212] border border-[#C5A059]/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#C5A059]/20 flex items-center justify-center text-[#C5A059] shrink-0">
                        <BrainCircuit className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-xs font-semibold text-white">Sintesi Epistemica Multi-Agente (Cekikj Synthesis)</h5>
                        <p className="text-[10px] text-[#888]">Genera sintesi esecutiva cross-risorsa e temi topologici nel Google Doc</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={useAgenticSynthesis}
                        onChange={(e) => setUseAgenticSynthesis(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#C5A059]"></div>
                    </label>
                  </div>
                </div>

                {exportResult ? (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-600/40 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      Compendio creato con successo su Google Drive!
                    </div>
                    <p className="text-xs text-[#AAA]">{exportResult.title}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={exportResult.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Apri Compendio su Google Docs
                      </a>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleExportDigest}
                    disabled={isExporting || selectedResourceIds.length === 0}
                    className="w-full py-3 bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#333] text-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                  >
                    {isExporting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Creazione compendio in corso...
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        Genera Compendio Google Doc ({selectedResourceIds.length} Risorse)
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* TAB 7: NotebookLM & Gemini Bridge */}
            {activeTab === "notebooklm" && (
              <div className="space-y-5">
                {/* Intro / Banner */}
                <div className="p-4 bg-gradient-to-r from-emerald-950/50 via-[#10221c]/40 to-[#0c1a16]/40 border border-emerald-600/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        GEMINI 1.5 & NOTEBOOKLM
                      </span>
                      <span className="text-[11px] text-[#888]">Integrazione Google Workspace</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">
                      Ponte Operativo tra Knowledge Vault e Google NotebookLM
                    </h3>
                    <p className="text-xs text-[#AAA] max-w-xl">
                      NotebookLM elabora fonti affidabili per creare podcast audio, briefing e guide. 
                      Usa questo hub per convertire i tuoi taccuini in schede del Vault o esportare la conoscenza come fonti per NotebookLM.
                    </p>
                  </div>

                  <a
                    href="https://notebooklm.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shrink-0 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Apri NotebookLM
                  </a>
                </div>

                {/* Two Columns Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  
                  {/* LEFT COLUMN: Import from NotebookLM */}
                  <div className="p-4 bg-[#141414] border border-[#222] rounded-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-[#222] pb-2">
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                          1. Importa da NotebookLM
                        </h4>
                      </div>
                      <span className="text-[10px] text-[#888]">Drive & Appunti</span>
                    </div>

                    {/* Section 1A: Search Drive for NotebookLM exports */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-[#CCC]">
                          Documenti Google Docs esportati da NotebookLM
                        </label>
                        <button
                          onClick={loadNotebookLMFiles}
                          disabled={isLoadingNotebookLM}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoadingNotebookLM ? "animate-spin" : ""}`} />
                          Scansiona Drive
                        </button>
                      </div>

                      {isLoadingNotebookLM ? (
                        <div className="p-4 text-center text-xs text-[#777] bg-[#0A0A0A] rounded-lg border border-[#222]">
                          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-400" />
                          Ricerca documenti NotebookLM in Google Drive...
                        </div>
                      ) : notebookLMFiles.length > 0 ? (
                        <div className="max-h-40 overflow-y-auto space-y-1.5 border border-[#222] p-2 rounded-xl bg-[#0A0A0A]">
                          {notebookLMFiles.map((file) => (
                            <div
                              key={file.id}
                              className="p-2 bg-[#121212] hover:bg-[#1A1A1A] border border-[#222] rounded-lg flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-white truncate">{file.name}</p>
                                <p className="text-[10px] text-[#666]">
                                  {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "Google Doc"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {onOpenInKnowledgeStudio && (
                                  <button
                                    onClick={() => handleOpenInStudio(file)}
                                    className="px-2 py-1 bg-[#1E1E1E] hover:bg-[#282828] border border-[#333] text-neutral-300 hover:text-white rounded text-[11px] font-medium flex items-center gap-1"
                                    title="Apri nello Studio OKF"
                                  >
                                    <FileCode className="w-3 h-3 text-[#C5A059]" />
                                    <span className="hidden sm:inline">Studio</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleAgenticIngestFile(file)}
                                  disabled={isAgenticRunning}
                                  className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded text-[11px] font-medium flex items-center gap-1 shrink-0 shadow-sm"
                                  title="Ingerisci e certifica con la pipeline a 6 agenti"
                                >
                                  <BrainCircuit className="w-3 h-3 text-white" />
                                  Pipeline Agenti
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-[#777] bg-[#0A0A0A] p-2.5 rounded-lg border border-[#1E1E1E]">
                          Nessun documento con nome tipico di NotebookLM ("Briefing Doc", "Study Guide", "FAQ") trovato al momento. In NotebookLM clicca su <strong>Esporta in Google Documenti</strong> e poi clicca su "Scansiona Drive".
                        </p>
                      )}
                    </div>

                    {/* Section 1B: Paste direct NotebookLM Output */}
                    <div className="space-y-2 pt-2 border-t border-[#222]">
                      <label className="text-xs font-medium text-[#CCC]">
                        Oppure incolla output / appunti generati da NotebookLM:
                      </label>
                      <div className="flex gap-1.5 flex-wrap">
                        {(["auto", "briefing", "study_guide", "faq", "audio_transcript"] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setNotebookLMDocType(type)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                              notebookLMDocType === type
                                ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold"
                                : "bg-[#1E1E1E] text-[#888] hover:text-[#CCC]"
                            }`}
                          >
                            {type === "auto" && "Auto"}
                            {type === "briefing" && "Briefing Doc"}
                            {type === "study_guide" && "Study Guide"}
                            {type === "faq" && "FAQ"}
                            {type === "audio_transcript" && "Audio Notes"}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={notebookLMPasteText}
                        onChange={(e) => setNotebookLMPasteText(e.target.value)}
                        placeholder="Incolla qui la sintesi, la guida di studio o la trascrizione audio generata da NotebookLM..."
                        rows={4}
                        className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#2B2B2B] focus:border-emerald-500 rounded-xl text-xs text-white placeholder-[#555] outline-none resize-none font-mono"
                      />

                      <div className="flex items-center gap-2 pt-1">
                        {onOpenInKnowledgeStudio && (
                          <button
                            type="button"
                            onClick={handleOpenNotebookLMInStudio}
                            disabled={!notebookLMPasteText.trim()}
                            className="px-3 py-2 bg-[#1E1E1E] hover:bg-[#282828] border border-[#333] text-neutral-300 hover:text-white rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
                            title="Apri nello Studio OKF"
                          >
                            <FileCode className="w-3.5 h-3.5 text-[#C5A059]" />
                            Studio OKF
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleAgenticIngestNotebookLM}
                          disabled={isAgenticRunning || !notebookLMPasteText.trim()}
                          className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:bg-[#222] disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-all"
                        >
                          {isAgenticRunning ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Analisi Multi-Agente...
                            </>
                          ) : (
                            <>
                              <BrainCircuit className="w-3.5 h-3.5" />
                              Pipeline Agenti NotebookLM
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Export Vault Knowledge to NotebookLM Source */}
                  <div className="p-4 bg-[#141414] border border-[#222] rounded-xl space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-[#222] pb-2">
                        <div className="flex items-center gap-2">
                          <Upload className="w-4 h-4 text-[#C5A059]" />
                          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                            2. Prepara Fonte per NotebookLM
                          </h4>
                        </div>
                        <span className="text-[10px] text-[#C5A059] font-mono">Dossier Google Doc</span>
                      </div>

                      <p className="text-xs text-[#AAA] leading-relaxed">
                        Compila le risorse del Vault in un unico Google Doc ottimizzato per NotebookLM, salvato direttamente nella cartella <strong className="text-[#C5A059]">{activeFolder.name}</strong> di Google Drive.
                      </p>

                      <div className="p-3 bg-[#0A0A0A] border border-[#222] rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[#888]">
                          <span>Risorse da includere nel Dossier:</span>
                          <span className="text-white font-semibold">
                            {selectedResourceIds.length > 0 ? selectedResourceIds.length : Math.min(vaultResources.length, 15)} schede
                          </span>
                        </div>
                        <p className="text-[11px] text-[#666]">
                          Formattazione ad alta densità sintattica per massimizzare la precisione di Gemini nel generare podcast, quiz e risposte di ricerca.
                        </p>
                      </div>

                      {/* Agentic Dossier Synthesis Toggle */}
                      <div className="p-3 bg-gradient-to-r from-[#17150E] to-[#121212] border border-[#C5A059]/40 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-[#C5A059]/20 flex items-center justify-center text-[#C5A059] shrink-0">
                              <BrainCircuit className="w-4 h-4" />
                            </div>
                            <div>
                              <h5 className="text-xs font-semibold text-white">Sintesi Epistemica Multi-Agente</h5>
                              <p className="text-[10px] text-[#888]">Inietta nel Google Doc la sezione esecutiva cross-vault e suggerimenti podcast</p>
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={useAgenticSynthesis}
                              onChange={(e) => setUseAgenticSynthesis(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#C5A059]"></div>
                          </label>
                        </div>
                      </div>

                      {notebookLMExportResult && (
                        <div className="p-3.5 bg-emerald-950/40 border border-emerald-600/40 rounded-xl space-y-2.5 animate-fade-in">
                          <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                            Fonte per NotebookLM creata con successo!
                          </div>
                          <p className="text-xs text-[#CCC] line-clamp-1 font-mono">
                            {notebookLMExportResult.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <a
                              href={notebookLMExportResult.docUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Visualizza Google Doc
                            </a>
                            <a
                              href="https://notebooklm.google.com"
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-[#252525] hover:bg-[#333] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 border border-[#3A3A3A]"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
                              Vai a NotebookLM (+ Aggiungi Fonte)
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleExportForNotebookLM}
                        disabled={isExportingForNotebookLM || vaultResources.length === 0}
                        className="w-full py-3 bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#222] text-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                      >
                        {isExportingForNotebookLM ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Generazione Dossier per NotebookLM in corso...
                          </>
                        ) : (
                          <>
                            <BookOpen className="w-4 h-4" />
                            Crea Fonte NotebookLM in "{activeFolder.name}"
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#222] bg-[#121212] flex items-center justify-between text-[11px] text-[#666]">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full inline-block ${isAuthenticated ? "bg-emerald-500" : "bg-neutral-600"}`}></span>
            <span>Cartella attiva: <strong>{activeFolder.name}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#222] hover:bg-[#2A2A2A] text-[#AAA] hover:text-white transition-colors"
          >
            Chiudi
          </button>
        </div>

      </div>

      {/* MULTI-AGENT PIPELINE & CONTRADICTION SENTINEL MODAL OVERLAY */}
      {showAgenticModal && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#C5A059]/60 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-[#C5A059]/10 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#222] bg-[#17150E] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#C5A059]/20 border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059]">
                  <BrainCircuit className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">Pipeline Multi-Agente Epistemica</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#C5A059]/20 text-[#C5A059] border border-[#C5A059]/30">
                      Standard OKF v0.2
                    </span>
                  </div>
                  <p className="text-xs text-[#AAA] truncate max-w-md">
                    Sorgente Google Drive: <span className="text-white font-medium">{agenticTargetTitle || "Documento"}</span>
                  </p>
                </div>
              </div>

              {!isAgenticRunning && (
                <button
                  onClick={() => setShowAgenticModal(false)}
                  className="p-1.5 rounded-lg bg-[#222] hover:bg-[#2C2C2C] text-[#888] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Status Header Bar */}
              <div className="p-3.5 bg-[#181818] border border-[#2B2B2B] rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs">
                  {isAgenticRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 text-[#C5A059] animate-spin shrink-0" />
                      <span className="text-neutral-300">
                        Orchestrazione e certificazione epistemica a 6 agenti in corso...
                      </span>
                    </>
                  ) : agenticContradiction?.hasConflict ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-amber-300 font-medium">
                        Pipeline completata con Allerta Contraddizione (Gate #3)
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-emerald-300 font-medium">
                        Certificazione completata con successo ed archiviazione nel Vault!
                      </span>
                    </>
                  )}
                </div>
                {agenticDuration !== null && (
                  <span className="text-[11px] font-mono text-[#888]">
                    {(agenticDuration / 1000).toFixed(2)}s
                  </span>
                )}
              </div>

              {/* 6-Agent Execution Pipeline Steps */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#888] block">
                  Tracciamento Sequenziale Agenti Autonomi
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {agenticSteps.map((step, idx) => {
                    const isSuccess = step.status === "success";
                    const isWarning = step.status === "warning";
                    const isInsufficient = step.status === "insufficient";
                    const agentLabels: Record<string, { icon: string; label: string }> = {
                      orchestrator: { icon: "🧠", label: "Orchestrator Agent" },
                      structural_deconstructor: { icon: "📐", label: "Structural Deconstructor" },
                      ontologist: { icon: "🏷️", label: "Ontologist Agent" },
                      graph_linker: { icon: "🕸️", label: "Graph Linker Agent" },
                      contradiction_sentinel: { icon: "🛡️", label: "Contradiction Sentinel" },
                      okf_serializer: { icon: "📜", label: "OKF Serializer Agent" },
                    };
                    const info = agentLabels[step.agent] || { icon: "🤖", label: step.agent };
                    return (
                      <div
                        key={`${step.agent}-${idx}`}
                        className={`p-3 rounded-xl border transition-all ${
                          isSuccess
                            ? "bg-[#141414] border-[#262626]"
                            : isWarning
                            ? "bg-amber-950/20 border-amber-800/40"
                            : isInsufficient
                            ? "bg-red-950/20 border-red-800/40"
                            : "bg-[#0E0E0E] border-[#1C1C1C]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm shrink-0">{info.icon}</span>
                            <span className="text-xs font-medium text-white truncate">{info.label}</span>
                          </div>
                          {isSuccess && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                          {isWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                          {isInsufficient && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-[#888] mt-1 line-clamp-1">{step.description || step.action}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CONTRADICTION SENTINEL WARNING (Cekikj Gate #3) */}
              {agenticContradiction?.hasConflict && (
                <div className="p-4 bg-amber-950/40 border border-amber-500/50 rounded-xl space-y-3.5 animate-in fade-in duration-300">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                          Gate Epistemico #3: Conflitto Rilevato nel Vault
                        </h4>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-200 uppercase">
                          {agenticContradiction.severity}
                        </span>
                      </div>
                      <p className="text-xs text-[#CCC]">
                        L'agente <strong>Contradiction Sentinel</strong> ha identificato una divergenza semantica sul concetto{" "}
                        <strong className="text-amber-200">"{agenticContradiction.conceptName}"</strong> rispetto alla scheda preesistente{" "}
                        <strong className="text-white">"{agenticContradiction.conflictingSourceTitle}"</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Statements comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-[#0F0E0A] border border-amber-900/40 rounded-lg space-y-1">
                      <span className="text-[10px] font-semibold uppercase text-[#888] tracking-wider">
                        Asserzione nel Vault:
                      </span>
                      <p className="text-amber-100/90 italic">"{agenticContradiction.vaultStatement}"</p>
                    </div>
                    <div className="p-2.5 bg-[#0F0E0A] border border-amber-900/40 rounded-lg space-y-1">
                      <span className="text-[10px] font-semibold uppercase text-[#888] tracking-wider">
                        Asserzione nel Documento Drive:
                      </span>
                      <p className="text-amber-100/90 italic">"{agenticContradiction.docStatement}"</p>
                    </div>
                  </div>

                  {agenticContradiction.recommendation && (
                    <div className="p-2.5 bg-[#14120B] rounded-lg border border-amber-800/30 text-xs text-[#AAA] flex items-start gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span><strong>Raccomandazione Agente:</strong> {agenticContradiction.recommendation}</span>
                    </div>
                  )}

                  {/* Resolution Buttons */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-amber-800/30">
                    <button
                      type="button"
                      onClick={() => {
                        setAgenticContradiction(null);
                        setAgenticPendingCommit(null);
                        setShowAgenticModal(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#222] hover:bg-[#2A2A2A] text-[#AAA] hover:text-white text-xs"
                    >
                      Annulla Ingestione
                    </button>
                    {onOpenInKnowledgeStudio && (
                      <button
                        type="button"
                        onClick={handleResolveContradictionInStudio}
                        className="px-3.5 py-1.5 rounded-lg bg-[#1F1D16] hover:bg-[#2A271D] border border-amber-600/50 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <FileCode className="w-3.5 h-3.5 text-amber-400" />
                        Risolvi nello Studio OKF
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleConfirmContradictionCommit}
                      className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Sovrascrivi & Archivia nel Vault
                    </button>
                  </div>
                </div>
              )}

              {/* SUCCESS STATE */}
              {!isAgenticRunning && !agenticContradiction?.hasConflict && (
                <div className="p-4 bg-emerald-950/30 border border-emerald-600/40 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2.5 text-emerald-300 text-xs font-semibold">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    Nuova scheda OKF v0.2 archiviata con successo nel Knowledge Vault!
                  </div>
                  <p className="text-xs text-[#AAA]">
                    I metadati, il grafo topologico delle entità e il blocco frontmatter sono stati convalidati e sincronizzati.
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAgenticModal(false)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                      Chiudi e Torna a Drive
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
