import React, { useState, useEffect, useMemo } from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  X,
  CheckCircle2,
  Database,
  Filter,
  Layers,
  Sparkles,
  Info,
  ShieldCheck,
  Server,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Cpu,
  Share2,
  Paperclip,
  Bot,
  Lock,
  Network,
  Scale,
  FileCheck,
  Terminal,
  ShieldAlert,
  Sliders,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { ResourceItem, RawFileItem, NavCategory } from "../types";
import {
  exportResourcesToJSON,
  exportResourcesToCSV,
  exportResourcesToMarkdownBundle,
  exportCertifiedBackupToJSON,
  downloadManifestCertificate,
  computeBackupAudit,
  BackupAuditReport
} from "../lib/exportUtils";
import { filterAndRankResources } from "../lib/searchEngine";

// ============================================================================
// Types per la Pipeline Agenti (Client-Side)
// ============================================================================

export interface AgentStepTrace {
  agent: string;
  action: string;
  description: string;
  itemsProcessed?: number;
  itemsFlagged?: number;
  status: "success" | "warning" | "error";
  timestamp: string;
  latencyMs: number;
}

export interface ClientCertifiedManifest {
  okfVersion: "0.2";
  certificationSeal: "CERTIFIED_OKF_V02_PASS" | "CERTIFIED_WITH_WARNINGS" | "CERTIFICATION_FAILED";
  timestamp: string;
  checksumSha256: string;
  totalResources: number;
  totalRawFiles: number;
  integrityScore: number;
  summary: string;
  epistemicHealth: {
    openContradictionsCount: number;
    flaggedConflicts: Array<{
      resourceA: string;
      resourceB?: string;
      concept: string;
      reason: string;
      severity: "low" | "medium" | "high";
    }>;
    epistemicHealthIndex: number;
    zeroGuessingCompliant: boolean;
  };
  graphTopology: {
    totalNodes: number;
    totalEdges: number;
    resolvedEdges: number;
    danglingEdges: Array<{
      sourceId: string;
      sourceTitle: string;
      targetTitle: string;
      relationType: string;
    }>;
    orphanNodes: Array<{
      id: string;
      title: string;
      type: string;
    }>;
    hubNodes: Array<{
      id: string;
      title: string;
      connectionsCount: number;
    }>;
    densityScore: number;
    integrityScore: number;
  };
  securityAudit: {
    scanned: boolean;
    leaksCount: number;
    sanitized: boolean;
    findings: Array<{
      resourceId: string;
      resourceTitle: string;
      leakType: string;
      matchedSample: string;
      location: string;
    }>;
  };
  disasterRecoveryDryRun: {
    passed: boolean;
    roundtripValidated: boolean;
    resourcesReconstructed: number;
    fieldsPreservedPercent: number;
    checksumSha256: string;
    payloadSizeBytes: number;
    formattedSize: string;
    latencyMs: number;
  };
  agentSteps: AgentStepTrace[];
}

interface ExportBackupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resources: ResourceItem[];
  currentCategory: NavCategory;
  selectedTag: string | null;
  searchQuery: string;
  onAddLog?: (level: "info" | "warn" | "error" | "success", category: any, message: string, details?: any) => void;
  rawFiles?: RawFileItem[];
  userId?: string;
}

export const ExportBackupDialog: React.FC<ExportBackupDialogProps> = ({
  isOpen,
  onClose,
  resources,
  currentCategory,
  selectedTag,
  searchQuery,
  onAddLog,
  rawFiles = [],
  userId,
}) => {
  // Active View Tab: "standard" | "agentic"
  const [activeTab, setActiveTab] = useState<"standard" | "agentic">("agentic");

  // Standard Export Options
  const [exportScope, setExportScope] = useState<"all" | "filtered">("all");
  const [selectedFormat, setSelectedFormat] = useState<"json" | "csv" | "markdown">("json");
  const [includeRawFiles, setIncludeRawFiles] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [copiedChecksum, setCopiedChecksum] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Agentic Pipeline Options & States
  const [sanitizeSecrets, setSanitizeSecrets] = useState(true);
  const [runDeepEpistemicScan, setRunDeepEpistemicScan] = useState(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [certifiedManifest, setCertifiedManifest] = useState<ClientCertifiedManifest | null>(null);
  const [auditedResources, setAuditedResources] = useState<ResourceItem[] | null>(null);
  const [selectedAgentDetails, setSelectedAgentDetails] = useState<"summary" | "topology" | "epistemic" | "security" | "steps">("summary");

  // Server snapshot status & action state
  const [serverBackupStatus, setServerBackupStatus] = useState<{
    exists: boolean;
    count?: number;
    formattedSize?: string;
    savedAt?: string;
  } | null>(null);
  const [isSyncingServerSnapshot, setIsSyncingServerSnapshot] = useState(false);
  const [serverSyncSuccess, setServerSyncSuccess] = useState<string | null>(null);

  // Filter resources if "filtered" scope is chosen
  const filteredResources = useMemo(() => {
    return filterAndRankResources(
      resources,
      searchQuery,
      currentCategory,
      selectedTag,
      "newest"
    );
  }, [resources, searchQuery, currentCategory, selectedTag]);

  const exportTarget = exportScope === "all" ? resources : filteredResources;
  const rawFilesTarget = includeRawFiles && exportScope === "all" ? rawFiles : [];

  // Compute standard pre-flight audit and metrics
  const auditReport = useMemo<BackupAuditReport>(() => {
    return computeBackupAudit(exportTarget, rawFilesTarget);
  }, [exportTarget, rawFilesTarget]);

  // Query server backup status on dialog open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    fetch("/api/vault/backup-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) {
          setServerBackupStatus(data);
        }
      })
      .catch(() => {
        // Non-critical background status check
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Standard Export File Download
  const handleExportStandard = () => {
    if (exportTarget.length === 0 && rawFilesTarget.length === 0) return;

    setIsExporting(true);
    setSuccessMessage(null);

    try {
      let filename = "";
      let sizeBytes = 0;

      if (selectedFormat === "json") {
        const result = exportResourcesToJSON(
          exportTarget,
          `knowledge_vault_${exportScope}`,
          rawFilesTarget
        );
        filename = result.filename;
        sizeBytes = result.sizeBytes;
      } else if (selectedFormat === "csv") {
        const result = exportResourcesToCSV(
          exportTarget,
          `knowledge_vault_${exportScope}`
        );
        filename = result.filename;
        sizeBytes = result.sizeBytes;
      } else {
        const result = exportResourcesToMarkdownBundle(
          exportTarget,
          `knowledge_vault_bundle_${exportScope}`
        );
        filename = result.filename;
        sizeBytes = result.sizeBytes;
      }

      const formattedBytes =
        sizeBytes >= 1024 * 1024
          ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
          : `${(sizeBytes / 1024).toFixed(1)} KB`;

      setSuccessMessage(
        `File "${filename}" scaricato con successo (${formattedBytes}, ${exportTarget.length} risorse${
          rawFilesTarget.length > 0 ? ` + ${rawFilesTarget.length} file raw` : ""
        }).`
      );

      if (onAddLog) {
        onAddLog(
          "success",
          "SYSTEM",
          `Backup standard esportato in formato ${selectedFormat.toUpperCase()}: ${filename}`,
          {
            format: selectedFormat,
            scope: exportScope,
            count: exportTarget.length,
            rawFilesCount: rawFilesTarget.length,
            sizeBytes,
            filename,
          }
        );
      }

      setTimeout(() => {
        setIsExporting(false);
      }, 600);
    } catch (err: any) {
      setIsExporting(false);
      if (onAddLog) {
        onAddLog("error", "SYSTEM", "Errore durante l'esportazione del backup locale", {
          error: err?.message,
        });
      }
    }
  };

  // Run the Multi-Agent Epistemic Certification Pipeline
  const handleRunAgenticPipeline = async () => {
    setIsRunningPipeline(true);
    setPipelineError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/vault/agentic-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resources: exportTarget,
          rawFiles: rawFilesTarget,
          options: {
            sanitizeSecrets,
            runDeepEpistemicScan,
            scopeName: exportScope,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Errore server (${res.status})`);
      }

      const data = await res.json();
      if (!data.success && !data.manifest) {
        throw new Error(data.error || "La certificazione ad agenti non è andata a buon fine.");
      }

      setCertifiedManifest(data.manifest);
      setAuditedResources(data.auditedResources || exportTarget);

      if (onAddLog) {
        onAddLog(
          "success",
          "SYSTEM",
          `Pipeline Agenti completata: Sigillo [${data.manifest.certificationSeal}], Integrità: ${data.manifest.integrityScore}%`,
          {
            seal: data.manifest.certificationSeal,
            integrityScore: data.manifest.integrityScore,
            checksum: data.manifest.checksumSha256,
            agentSteps: data.manifest.agentSteps?.length,
          }
        );
      }
    } catch (err: any) {
      console.error("Agentic backup error:", err);
      setPipelineError(err?.message || "Errore sconosciuto durante l'esecuzione della pipeline agenti");
      if (onAddLog) {
        onAddLog("error", "SYSTEM", "Fallimento pipeline agenti di backup", {
          error: err?.message,
        });
      }
    } finally {
      setIsRunningPipeline(false);
    }
  };

  // Download Certified Backup (Envelope + Manifest + Raw Files)
  const handleDownloadCertifiedBackup = () => {
    if (!certifiedManifest) return;

    try {
      const resourcesToDownload = auditedResources || exportTarget;
      const { filename, sizeBytes } = exportCertifiedBackupToJSON(
        certifiedManifest,
        resourcesToDownload,
        rawFilesTarget,
        `knowledge_vault_certified_${exportScope}`
      );

      const formattedBytes =
        sizeBytes >= 1024 * 1024
          ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
          : `${(sizeBytes / 1024).toFixed(1)} KB`;

      setSuccessMessage(
        `Backup Certificato scaricato: "${filename}" (${formattedBytes}, ${resourcesToDownload.length} risorse con manifesto crittografico).`
      );
    } catch (err: any) {
      console.error("Download error:", err);
    }
  };

  // Download Standalone Manifest Certificate
  const handleDownloadManifestOnly = () => {
    if (!certifiedManifest) return;

    try {
      const { filename } = downloadManifestCertificate(
        certifiedManifest,
        `epistemic_manifest_${certifiedManifest.checksumSha256.slice(0, 8)}`
      );
      setSuccessMessage(`Certificato scaricato: "${filename}"`);
    } catch (err: any) {
      console.error("Manifest download error:", err);
    }
  };

  // Quick Copy JSON to Clipboard
  const handleCopyJSON = async () => {
    try {
      const samplePayload = certifiedManifest
        ? {
            vault_version: "0.2",
            format: "okf_certified_epistemic_backup",
            certified_manifest: certifiedManifest,
            resources: auditedResources || exportTarget,
            raw_files: rawFilesTarget,
          }
        : {
            vault_version: "0.2",
            format: "okf_knowledge_vault_backup",
            exported_at: new Date().toISOString(),
            total_resources: exportTarget.length,
            total_raw_files: rawFilesTarget.length,
            resources: exportTarget,
            raw_files: rawFilesTarget,
          };

      await navigator.clipboard.writeText(JSON.stringify(samplePayload, null, 2));
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2500);

      if (onAddLog) {
        onAddLog("info", "SYSTEM", `JSON di backup (${exportTarget.length} risorse) copiato negli appunti.`);
      }
    } catch (err: any) {
      console.error("Clipboard copy error:", err);
    }
  };

  // Copy SHA-256 Checksum
  const handleCopyChecksum = async (checksum: string) => {
    try {
      await navigator.clipboard.writeText(checksum);
      setCopiedChecksum(true);
      setTimeout(() => setCopiedChecksum(false), 2500);
    } catch (err) {
      console.error("Checksum copy error:", err);
    }
  };

  // Trigger Immediate Server Snapshot Creation on Physical Disk
  const handleTriggerServerSnapshot = async () => {
    setIsSyncingServerSnapshot(true);
    setServerSyncSuccess(null);

    try {
      const res = await fetch("/api/vault/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resources: auditedResources || resources,
          rawFiles,
          userId: userId || "local-user",
          certifiedManifest: certifiedManifest || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Errore server (${res.status})`);
      }

      const data = await res.json();
      setServerBackupStatus({
        exists: true,
        count: data.count,
        formattedSize: data.formattedSize,
        savedAt: data.savedAt,
      });

      setServerSyncSuccess(
        `Snapshot server archiviato con successo su disco container (${data.count} risorse, ${data.formattedSize}).`
      );

      if (onAddLog) {
        onAddLog(
          "success",
          "FIRESTORE",
          `Snapshot del Vault archiviato su filesystem server: ${data.formattedSize}`,
          data
        );
      }
    } catch (err: any) {
      console.error("Server snapshot error:", err);
      if (onAddLog) {
        onAddLog("error", "SYSTEM", "Errore nella sincronizzazione dello snapshot server", {
          error: err?.message,
        });
      }
    } finally {
      setIsSyncingServerSnapshot(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#0C0C0C] border border-[#242424] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-[#1A1A1A] flex items-center justify-between bg-[#080808] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#141414] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shadow-sm">
              <Bot className="w-5 h-5 text-[#C5A059]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-serif text-white font-medium">
                  Esporta & Backup Certificato
                </h2>
                <span className="text-[10px] font-mono bg-[#1C170E] text-[#C5A059] border border-[#C5A059]/30 px-2 py-0.5 rounded-full">
                  OKF v0.2 Protocol
                </span>
              </div>
              <p className="text-xs text-[#777] font-mono mt-0.5">
                Archiviazione epistemica, audit di consistenza ontologica e simulazione di ripristino
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi finestra"
            className="p-1.5 text-[#666] hover:text-white hover:bg-[#1A1A1A] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* NAVIGATION TABS */}
        <div className="px-4 sm:px-6 pt-3 pb-0 border-b border-[#1A1A1A] bg-[#0A0A0A] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab("agentic");
              setSuccessMessage(null);
            }}
            className={`pb-2.5 px-3 text-xs font-mono flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "agentic"
                ? "border-[#C5A059] text-[#C5A059] font-medium"
                : "border-transparent text-[#777] hover:text-[#BBB]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Pipeline Agenti Epistemica</span>
            <span className="text-[9px] bg-[#1F190F] text-[#C5A059] border border-[#C5A059]/40 px-1.5 py-0.2 rounded font-mono">
              Certificata
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("standard");
              setSuccessMessage(null);
            }}
            className={`pb-2.5 px-3 text-xs font-mono flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "standard"
                ? "border-[#C5A059] text-[#C5A059] font-medium"
                : "border-transparent text-[#777] hover:text-[#BBB]"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Esportazione Standard</span>
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* ========================================================================= */}
          {/* TAB 1: PIPELINE MULTI-AGENTE EPISTEMICA */}
          {/* ========================================================================= */}
          {activeTab === "agentic" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Pipeline Overview Card */}
              <div className="p-4 bg-[#11100C] border border-[#2E2413] rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#1C170E] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-white flex items-center gap-2">
                        <span>Squadra Agenti di Certificazione & Resilienza</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800/40">
                          5 Agenti Attivi
                        </span>
                      </div>
                      <p className="text-[11px] text-[#888] mt-0.5">
                        Esegue l'audit di coerenza dottrinale Cekikj, verifica i link topologici orfani, espunge credenziali sensibili e certifica la ripristinabilità con hash crittografico SHA-256.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunAgenticPipeline}
                    disabled={isRunningPipeline || exportTarget.length === 0}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-black bg-[#C5A059] hover:bg-[#D5B069] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shrink-0 shadow-md shadow-[#C5A059]/10 active:scale-95 cursor-pointer"
                  >
                    {isRunningPipeline ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Analisi in Corso...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{certifiedManifest ? "Ri-Certifica con Agenti" : "Avvia Certificazione"}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Agent Team Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-[11px] font-mono">
                  <div className="p-2 bg-[#161410] border border-[#262015] rounded-lg">
                    <div className="text-[9px] text-[#C5A059] font-semibold flex items-center gap-1">
                      <Bot className="w-3 h-3" /> Orchestrator
                    </div>
                    <div className="text-[10px] text-[#777] mt-1">Strategia & Allocazione</div>
                  </div>
                  <div className="p-2 bg-[#161410] border border-[#262015] rounded-lg">
                    <div className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Sanitizer
                    </div>
                    <div className="text-[10px] text-[#777] mt-1">Leak & Token Scan</div>
                  </div>
                  <div className="p-2 bg-[#161410] border border-[#262015] rounded-lg">
                    <div className="text-[9px] text-sky-400 font-semibold flex items-center gap-1">
                      <Network className="w-3 h-3" /> Topology
                    </div>
                    <div className="text-[10px] text-[#777] mt-1">Archi & Nodi Orfani</div>
                  </div>
                  <div className="p-2 bg-[#161410] border border-[#262015] rounded-lg">
                    <div className="text-[9px] text-amber-400 font-semibold flex items-center gap-1">
                      <Scale className="w-3 h-3" /> Cekikj Sentinel
                    </div>
                    <div className="text-[10px] text-[#777] mt-1">Conflitti & Vigenza</div>
                  </div>
                  <div className="p-2 bg-[#161410] border border-[#262015] rounded-lg col-span-2 sm:col-span-1">
                    <div className="text-[9px] text-purple-400 font-semibold flex items-center gap-1">
                      <FileCheck className="w-3 h-3" /> Dry-Run
                    </div>
                    <div className="text-[10px] text-[#777] mt-1">Roundtrip & SHA-256</div>
                  </div>
                </div>

                {/* Pipeline Controls & Config */}
                <div className="pt-2 border-t border-[#221C11] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-[#CCC]">
                      <input
                        type="checkbox"
                        checked={sanitizeSecrets}
                        onChange={(e) => setSanitizeSecrets(e.target.checked)}
                        className="accent-[#C5A059]"
                      />
                      <span>Espungi e maschera credenziali API / token</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-[#CCC]">
                      <input
                        type="checkbox"
                        checked={runDeepEpistemicScan}
                        onChange={(e) => setRunDeepEpistemicScan(e.target.checked)}
                        className="accent-[#C5A059]"
                      />
                      <span>Scansione semantica profonda Cekikj (Gemini)</span>
                    </label>
                  </div>

                  <span className="text-[11px] font-mono text-[#777]">
                    Target: {exportTarget.length} risorse
                  </span>
                </div>
              </div>

              {/* Pipeline Error Banner */}
              {pipelineError && (
                <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{pipelineError}</span>
                </div>
              )}

              {/* CERTIFIED RESULTS VIEW */}
              {certifiedManifest && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Seal and Global Metric Banner */}
                  <div
                    className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                      certifiedManifest.certificationSeal === "CERTIFIED_OKF_V02_PASS"
                        ? "bg-[#0E1611] border-emerald-800/60"
                        : certifiedManifest.certificationSeal === "CERTIFIED_WITH_WARNINGS"
                        ? "bg-[#16130B] border-amber-800/60"
                        : "bg-[#180E0E] border-red-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          certifiedManifest.certificationSeal === "CERTIFIED_OKF_V02_PASS"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-700/50"
                            : certifiedManifest.certificationSeal === "CERTIFIED_WITH_WARNINGS"
                            ? "bg-amber-950 text-amber-400 border border-amber-700/50"
                            : "bg-red-950 text-red-400 border border-red-700/50"
                        }`}
                      >
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                            Sigillo: {certifiedManifest.certificationSeal}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-black/40 border border-white/10 text-[#AAA]">
                            OKF v0.2
                          </span>
                        </div>
                        <p className="text-[11px] text-[#AAA] mt-0.5 max-w-lg">
                          {certifiedManifest.summary}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                      <div className="text-right">
                        <div className="text-[10px] font-mono text-[#777] uppercase">Punteggio Integrità</div>
                        <div
                          className={`text-xl font-bold font-mono ${
                            certifiedManifest.integrityScore >= 85
                              ? "text-emerald-400"
                              : certifiedManifest.integrityScore >= 70
                              ? "text-amber-400"
                              : "text-red-400"
                          }`}
                        >
                          {certifiedManifest.integrityScore}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cryptographic SHA-256 Checksum Strip */}
                  <div className="p-2.5 bg-[#0F0F0F] border border-[#222] rounded-xl flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <Terminal className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                      <span className="text-[#888] shrink-0">SHA-256:</span>
                      <span className="text-[#DDD] truncate select-all">
                        {certifiedManifest.checksumSha256}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyChecksum(certifiedManifest.checksumSha256)}
                      className="ml-2 px-2 py-1 rounded bg-[#1A1A1A] hover:bg-[#252525] text-[10px] text-[#AAA] hover:text-white flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                    >
                      {copiedChecksum ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiato!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copia Hash</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Detail Category Selector Tabs */}
                  <div className="flex items-center gap-1.5 border-b border-[#222] pb-2 text-xs font-mono overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedAgentDetails("summary")}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        selectedAgentDetails === "summary"
                          ? "bg-[#222] text-white font-medium"
                          : "text-[#777] hover:text-[#CCC]"
                      }`}
                    >
                      Metriche Sintesi
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAgentDetails("topology")}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        selectedAgentDetails === "topology"
                          ? "bg-[#222] text-white font-medium"
                          : "text-[#777] hover:text-[#CCC]"
                      }`}
                    >
                      Grafo Topologico ({certifiedManifest.graphTopology.danglingEdges.length} dangling)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAgentDetails("epistemic")}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        selectedAgentDetails === "epistemic"
                          ? "bg-[#222] text-white font-medium"
                          : "text-[#777] hover:text-[#CCC]"
                      }`}
                    >
                      Salute Cekikj ({certifiedManifest.epistemicHealth.openContradictionsCount} conflitti)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAgentDetails("security")}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        selectedAgentDetails === "security"
                          ? "bg-[#222] text-white font-medium"
                          : "text-[#777] hover:text-[#CCC]"
                      }`}
                    >
                      Sicurezza ({certifiedManifest.securityAudit.leaksCount} leak)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAgentDetails("steps")}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        selectedAgentDetails === "steps"
                          ? "bg-[#222] text-white font-medium"
                          : "text-[#777] hover:text-[#CCC]"
                      }`}
                    >
                      Traccia Agenti ({certifiedManifest.agentSteps.length})
                    </button>
                  </div>

                  {/* DETAILS CONTENT */}
                  {selectedAgentDetails === "summary" && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-3 bg-[#121212] border border-[#222] rounded-xl">
                        <div className="text-[10px] text-[#777] font-mono uppercase">Risorse Reali</div>
                        <div className="text-base font-bold text-white font-mono mt-1">
                          {certifiedManifest.totalResources}
                        </div>
                        <div className="text-[10px] text-[#666] mt-0.5">
                          {certifiedManifest.disasterRecoveryDryRun.formattedSize}
                        </div>
                      </div>
                      <div className="p-3 bg-[#121212] border border-[#222] rounded-xl">
                        <div className="text-[10px] text-[#777] font-mono uppercase">Archi Topologici</div>
                        <div className="text-base font-bold text-sky-400 font-mono mt-1">
                          {certifiedManifest.graphTopology.totalEdges}
                        </div>
                        <div className="text-[10px] text-[#666] mt-0.5">
                          {certifiedManifest.graphTopology.resolvedEdges} interni verificati
                        </div>
                      </div>
                      <div className="p-3 bg-[#121212] border border-[#222] rounded-xl">
                        <div className="text-[10px] text-[#777] font-mono uppercase">Indice Epistemico</div>
                        <div className="text-base font-bold text-amber-400 font-mono mt-1">
                          {certifiedManifest.epistemicHealth.epistemicHealthIndex}%
                        </div>
                        <div className="text-[10px] text-[#666] mt-0.5">
                          Zero-Guessing: {certifiedManifest.epistemicHealth.zeroGuessingCompliant ? "Sì" : "Warning"}
                        </div>
                      </div>
                      <div className="p-3 bg-[#121212] border border-[#222] rounded-xl">
                        <div className="text-[10px] text-[#777] font-mono uppercase">Simulazione Ripristino</div>
                        <div className="text-base font-bold text-emerald-400 font-mono mt-1">
                          {certifiedManifest.disasterRecoveryDryRun.passed ? "100% OK" : "Fallito"}
                        </div>
                        <div className="text-[10px] text-[#666] mt-0.5">
                          Roundtrip Lossless verificato
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedAgentDetails === "topology" && (
                    <div className="p-3 bg-[#111] border border-[#222] rounded-xl space-y-2.5 text-xs">
                      <div className="flex items-center justify-between text-[#AAA] font-mono">
                        <span>Report Topologico del Grafo</span>
                        <span>Integrità: {certifiedManifest.graphTopology.integrityScore}%</span>
                      </div>

                      {certifiedManifest.graphTopology.danglingEdges.length > 0 ? (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          <div className="text-[11px] text-amber-400 font-medium">
                            Riferimenti Esterni o Nodi Mancanti ({certifiedManifest.graphTopology.danglingEdges.length}):
                          </div>
                          {certifiedManifest.graphTopology.danglingEdges.map((edge, i) => (
                            <div
                              key={i}
                              className="p-1.5 bg-[#181818] border border-[#282828] rounded text-[11px] font-mono flex items-center justify-between text-[#BBB]"
                            >
                              <span className="truncate max-w-[45%] text-[#EEE]">{edge.sourceTitle}</span>
                              <span className="text-[10px] text-[#777]">--[{edge.relationType}]--&gt;</span>
                              <span className="truncate max-w-[45%] text-[#C5A059]">{edge.targetTitle}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-emerald-400 text-xs flex items-center gap-1.5 py-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Tutti gli archi del grafo puntano a risorse interne valide al 100%.</span>
                        </div>
                      )}

                      {certifiedManifest.graphTopology.orphanNodes.length > 0 && (
                        <div className="pt-2 border-t border-[#222]">
                          <span className="text-[10px] text-[#777] font-mono">
                            Nodi orfani privi di archi: {certifiedManifest.graphTopology.orphanNodes.length} risorse.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedAgentDetails === "epistemic" && (
                    <div className="p-3 bg-[#111] border border-[#222] rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[#AAA] font-mono">
                        <span>Audit Contraddizioni Epistemiche (Protocollo Cekikj)</span>
                        <span>Indice Salute: {certifiedManifest.epistemicHealth.epistemicHealthIndex}%</span>
                      </div>

                      {certifiedManifest.epistemicHealth.flaggedConflicts.length > 0 ? (
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {certifiedManifest.epistemicHealth.flaggedConflicts.map((conf, idx) => (
                            <div
                              key={idx}
                              className="p-2 bg-[#1A140F] border border-amber-900/40 rounded text-[11px] space-y-1"
                            >
                              <div className="text-amber-400 font-medium flex items-center justify-between">
                                <span>{conf.concept}</span>
                                <span className="text-[9px] uppercase px-1.5 py-0.2 bg-amber-950 rounded">
                                  {conf.severity}
                                </span>
                              </div>
                              <p className="text-[#CCC]">{conf.reason}</p>
                              <div className="text-[10px] text-[#777] font-mono">
                                Risorse: "{conf.resourceA}" {conf.resourceB ? ` ↔ "${conf.resourceB}"` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-emerald-400 text-xs flex items-center gap-1.5 py-2">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Nessuna contraddizione aperta o divergenza dottrinale rilevata. Conforme a Zero-Guessing.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedAgentDetails === "security" && (
                    <div className="p-3 bg-[#111] border border-[#222] rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[#AAA] font-mono">
                        <span>Scansione Credenziali Sensibili & Token</span>
                        <span className={certifiedManifest.securityAudit.leaksCount === 0 ? "text-emerald-400" : "text-amber-400"}>
                          {certifiedManifest.securityAudit.leaksCount} token rilevati
                        </span>
                      </div>

                      {certifiedManifest.securityAudit.findings.length > 0 ? (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {certifiedManifest.securityAudit.findings.map((f, idx) => (
                            <div
                              key={idx}
                              className="p-1.5 bg-[#181512] border border-amber-900/30 rounded text-[11px] font-mono flex items-center justify-between"
                            >
                              <div>
                                <span className="text-[#EEE] font-medium">{f.resourceTitle}</span>
                                <span className="text-[10px] text-[#888] ml-2">({f.location})</span>
                              </div>
                              <div className="text-amber-400 text-[10px]">
                                {f.leakType}: {f.matchedSample}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-emerald-400 text-xs flex items-center gap-1.5 py-2">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Nessuna chiave API o token privato trapelato nel corpus.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedAgentDetails === "steps" && (
                    <div className="p-3 bg-[#111] border border-[#222] rounded-xl space-y-2 text-xs font-mono">
                      <div className="text-[#AAA]">Traccia Esecuzione Sequenziale Agenti</div>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {certifiedManifest.agentSteps.map((step, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-[#161616] border border-[#262626] rounded flex items-start justify-between gap-2"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[#C5A059] font-bold text-[10px] uppercase">
                                  [{step.agent}]
                                </span>
                                <span className="text-[#EEE] text-[11px] font-medium">{step.action}</span>
                              </div>
                              <p className="text-[10px] text-[#888] mt-0.5">{step.description}</p>
                            </div>
                            <span className="text-[9px] text-[#666] shrink-0 font-mono mt-0.5">
                              {step.latencyMs}ms
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certified Actions Grid */}
                  <div className="p-3.5 bg-[#13110C] border border-[#2D2312] rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-white font-medium flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#C5A059]" />
                        <span>Pronto per il Download Certificato</span>
                      </div>
                      <p className="text-[11px] text-[#888]">
                        Archivio con envelope crittografico verificabile e firma di conformità OKF v0.2.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadManifestOnly}
                        className="px-3 py-1.5 rounded-lg border border-[#332A1B] bg-[#1A1711] hover:bg-[#252016] text-xs font-mono text-[#DDD] transition-colors cursor-pointer"
                        title="Scarica solo il certificato JSON con le metriche e hash crittografico"
                      >
                        Solo Manifesto (.json)
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadCertifiedBackup}
                        className="px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-[#C5A059]/10 active:scale-95 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Scarica Backup Certificato</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: ESPORTAZIONE STANDARD */}
          {/* ========================================================================= */}
          {activeTab === "standard" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* FORMAT SELECTION */}
              <div>
                <label className="block text-xs font-mono text-[#AAA] mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>1. Formato di Esportazione</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* JSON FORMAT */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFormat("json");
                      setSuccessMessage(null);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      selectedFormat === "json"
                        ? "bg-[#16130C] border-[#C5A059] text-white shadow-md shadow-[#C5A059]/10"
                        : "bg-[#111] border-[#222] text-[#888] hover:border-[#333] hover:text-[#CCC]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          selectedFormat === "json"
                            ? "bg-[#C5A059] text-black font-bold"
                            : "bg-[#1A1A1A] text-[#777]"
                        }`}
                      >
                        <FileJson className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#222] text-[#C5A059] border border-[#C5A059]/20 rounded">
                        Lossless
                      </span>
                    </div>
                    <div>
                      <div className={`text-xs font-medium ${selectedFormat === "json" ? "text-white font-bold" : ""}`}>
                        JSON Vault
                      </div>
                      <p className="text-[11px] text-[#666] mt-1 leading-snug">
                        Struttura completa OKF v0.2 con metadati, entità, relazioni topologiche e file raw.
                      </p>
                    </div>
                  </button>

                  {/* CSV FORMAT */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFormat("csv");
                      setSuccessMessage(null);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      selectedFormat === "csv"
                        ? "bg-[#16130C] border-[#C5A059] text-white shadow-md shadow-[#C5A059]/10"
                        : "bg-[#111] border-[#222] text-[#888] hover:border-[#333] hover:text-[#CCC]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          selectedFormat === "csv"
                            ? "bg-[#C5A059] text-black font-bold"
                            : "bg-[#1A1A1A] text-[#777]"
                        }`}
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#222] text-[#AAA] rounded">
                        Excel/Fogli
                      </span>
                    </div>
                    <div>
                      <div className={`text-xs font-medium ${selectedFormat === "csv" ? "text-white font-bold" : ""}`}>
                        CSV Tabellare
                      </div>
                      <p className="text-[11px] text-[#666] mt-1 leading-snug">
                        Compatibile RFC 4180 con UTF-8 BOM per accenti italiani perfetti su Excel e Numbers.
                      </p>
                    </div>
                  </button>

                  {/* MARKDOWN BUNDLE FORMAT */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFormat("markdown");
                      setSuccessMessage(null);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      selectedFormat === "markdown"
                        ? "bg-[#16130C] border-[#C5A059] text-white shadow-md shadow-[#C5A059]/10"
                        : "bg-[#111] border-[#222] text-[#888] hover:border-[#333] hover:text-[#CCC]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          selectedFormat === "markdown"
                            ? "bg-[#C5A059] text-black font-bold"
                            : "bg-[#1A1A1A] text-[#777]"
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#222] text-[#AAA] rounded">
                        Obsidian/AI
                      </span>
                    </div>
                    <div>
                      <div className={`text-xs font-medium ${selectedFormat === "markdown" ? "text-white font-bold" : ""}`}>
                        Markdown Bundle
                      </div>
                      <p className="text-[11px] text-[#666] mt-1 leading-snug">
                        Documento unico con blocchi frontmatter YAML per ciascuna risorsa, pronto per Obsidian.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* SCOPE SELECTION */}
              <div>
                <label className="block text-xs font-mono text-[#AAA] mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>2. Ambito dei Dati & Allegati</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      exportScope === "all"
                        ? "bg-[#151515] border-[#C5A059]/60 text-white"
                        : "bg-[#101010] border-[#222] text-[#888] hover:border-[#333]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "all"}
                      onChange={() => {
                        setExportScope("all");
                        setSuccessMessage(null);
                      }}
                      className="accent-[#C5A059]"
                    />
                    <div className="flex-1 text-xs">
                      <span className="font-medium text-[#EEE]">Tutto il Vault</span>
                      <div className="text-[11px] text-[#666] font-mono">
                        {resources.length} elementi totali
                      </div>
                    </div>
                    <Database className="w-4 h-4 text-[#777]" />
                  </label>

                  <label
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      exportScope === "filtered"
                        ? "bg-[#151515] border-[#C5A059]/60 text-white"
                        : "bg-[#101010] border-[#222] text-[#888] hover:border-[#333]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "filtered"}
                      onChange={() => {
                        setExportScope("filtered");
                        setSuccessMessage(null);
                      }}
                      className="accent-[#C5A059]"
                    />
                    <div className="flex-1 text-xs">
                      <span className="font-medium text-[#EEE]">Filtro Attuale</span>
                      <div className="text-[11px] text-[#666] font-mono">
                        {filteredResources.length} elementi visibili
                      </div>
                    </div>
                    <Filter className="w-4 h-4 text-[#777]" />
                  </label>
                </div>

                {/* Attachments Toggle for JSON */}
                {rawFiles.length > 0 && selectedFormat === "json" && exportScope === "all" && (
                  <div className="mt-3 p-2.5 bg-[#121212] border border-[#222] rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-3.5 h-3.5 text-[#C5A059]" />
                      <span className="text-[#CCC]">Includi allegati e file grezzi ({rawFiles.length} file caricati)</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeRawFiles}
                      onChange={(e) => setIncludeRawFiles(e.target.checked)}
                      className="accent-[#C5A059] cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* PRE-FLIGHT AUDIT STRIP */}
              <div className="p-3 bg-[#0F0F0F] border border-[#1E1E1E] rounded-xl flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-2 text-white">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Audit Pre-Export: {auditReport.totalResources} risorse, {auditReport.formattedSize}</span>
                </span>
                <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded text-[10px]">
                  Integrità: {auditReport.integrityScore}%
                </span>
              </div>
            </div>
          )}

          {/* COMMON: SERVER SNAPSHOT BAR */}
          <div className="p-3.5 bg-[#11100D] border border-[#332A1A] rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#1D170E] border border-[#C5A059]/30 flex items-center justify-center text-[#C5A059] shrink-0">
                <Server className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-white font-medium flex items-center gap-2">
                  <span>Snapshot Server Fisico</span>
                  {serverBackupStatus?.exists && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                      Attivo ({serverBackupStatus.formattedSize || "OK"})
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#777] font-mono truncate">
                  {serverBackupStatus?.savedAt
                    ? `Ultimo snapshot: ${new Date(serverBackupStatus.savedAt).toLocaleString("it-IT")}`
                    : "Nessun backup server registrato su disco container"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTriggerServerSnapshot}
              disabled={isSyncingServerSnapshot}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#C5A059] bg-[#1F190F] hover:bg-[#2E2414] border border-[#C5A059]/40 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
              title="Forza la creazione immediata di un nuovo snapshot su file fisico /data/vault-backup.json"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingServerSnapshot ? "animate-spin" : ""}`} />
              <span>{isSyncingServerSnapshot ? "Sincronizzo..." : "Sincronizza Server"}</span>
            </button>
          </div>

          {/* Server Sync Success Banner */}
          {serverSyncSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{serverSyncSuccess}</span>
            </div>
          )}

          {/* Export Success Banner */}
          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:p-5 border-t border-[#1A1A1A] bg-[#080808] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyJSON}
              className="px-3 py-1.5 rounded-lg border border-[#2B2B2B] bg-[#141414] hover:bg-[#1C1C1C] text-xs text-[#CCC] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Copia l'intero payload JSON negli appunti di sistema"
            >
              {copiedToClipboard ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiato!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#AAA]" />
                  <span>Copia JSON</span>
                </>
              )}
            </button>
            <span className="text-[11px] text-[#555] font-mono hidden sm:inline">
              100% Loss-Free OKF v0.2
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-[#2B2B2B] text-xs text-[#AAA] hover:text-white hover:bg-[#141414] transition-colors cursor-pointer"
            >
              Chiudi
            </button>

            {activeTab === "standard" ? (
              <button
                type="button"
                onClick={handleExportStandard}
                disabled={isExporting || exportTarget.length === 0}
                className="flex items-center gap-1.5 bg-[#C5A059] hover:bg-[#D5B069] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-xs py-2 px-4 rounded-lg transition-all shadow-md shadow-[#C5A059]/10 active:scale-95 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>
                  {isExporting
                    ? "Generazione..."
                    : `Scarica ${
                        selectedFormat === "json"
                          ? "JSON"
                          : selectedFormat === "csv"
                          ? "CSV"
                          : "Markdown"
                      } (${auditReport.formattedSize})`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={certifiedManifest ? handleDownloadCertifiedBackup : handleRunAgenticPipeline}
                disabled={isRunningPipeline || exportTarget.length === 0}
                className="flex items-center gap-1.5 bg-[#C5A059] hover:bg-[#D5B069] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-xs py-2 px-4 rounded-lg transition-all shadow-md shadow-[#C5A059]/10 active:scale-95 cursor-pointer"
              >
                {certifiedManifest ? (
                  <>
                    <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Scarica Backup Certificato (.json)</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isRunningPipeline ? "Certificazione in Corso..." : "Esegui & Certifica Backup"}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
