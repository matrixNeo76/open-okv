import React, { useState, useMemo } from "react";
import {
  GitBranch,
  Github,
  BookOpen,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Download,
  ShieldCheck,
  X,
  Layers,
  Sparkles,
  ArrowRight,
  Database
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";
import { initialSampleResources } from "../lib/sampleData";

export interface GitHubOkfSyncItem {
  filePath: string;
  fileName: string;
  title: string;
  summary: string;
  type: ResourceType;
  tags: string[];
  url: string;
  rawUrl: string;
  docType: string;
  domain: string;
  okfVersion?: string;
  isValidOKF: boolean;
  entitiesCount: number;
  relationsCount: number;
  entities: any[];
  relations: any[];
  markdownContent: string;
  sizeBytes: number;
  existingMatch?: {
    id: string;
    title: string;
    isIdentical: boolean;
  };
}

interface OkfSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentResources: ResourceItem[];
  onSyncSystemSpecs: (forceOverwrite?: boolean) => Promise<void>;
  onBatchImportOkf: (
    items: Array<Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">>,
    sourceLabel: string
  ) => Promise<{ added: number; updated: number }>;
  isSyncingSystem: boolean;
  quotaExceeded: boolean;
}

export const OkfSyncModal: React.FC<OkfSyncModalProps> = ({
  isOpen,
  onClose,
  currentResources,
  onSyncSystemSpecs,
  onBatchImportOkf,
  isSyncingSystem,
  quotaExceeded,
}) => {
  const [activeTab, setActiveTab] = useState<"github" | "system">("github");

  // GitHub Sync State
  const [repoInput, setRepoInput] = useState("");
  const [branchInput, setBranchInput] = useState("");
  const [subpathInput, setSubpathInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    owner: string;
    repo: string;
    branch: string;
    items: GitHubOkfSyncItem[];
  } | null>(null);

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [expandedPreviewPath, setExpandedPreviewPath] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"ALL" | "OKF_ONLY" | "NEW_ONLY">("ALL");

  // System Specs State
  const [forceOverwriteSystem, setForceOverwriteSystem] = useState(false);

  // Handler: Scan GitHub Repository
  const handleScanRepository = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanRepo = repoInput.trim();
    if (!cleanRepo) {
      setScanError("Inserisci l'identificatore del repository (es. 'owner/repo' o URL GitHub).");
      return;
    }

    setIsScanning(true);
    setScanError(null);
    setScanResult(null);
    setSelectedPaths(new Set());
    setImportFeedback(null);

    try {
      // Pass existing resources summary to detect duplicates
      const existingSummary = currentResources.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        markdownContent: r.metadata?.markdownContent || "",
      }));

      const res = await fetch("/api/github/scan-okf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: cleanRepo,
          branch: branchInput.trim() || undefined,
          subpath: subpathInput.trim() || undefined,
          maxFiles: 50,
          existingResources: existingSummary,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossibile analizzare il repository GitHub.");
      }

      setScanResult({
        owner: data.owner,
        repo: data.repo,
        branch: data.branch,
        items: data.items || [],
      });

      // By default, select all items that are new or not yet identical
      const autoSelected = new Set<string>();
      (data.items || []).forEach((item: GitHubOkfSyncItem) => {
        if (!item.existingMatch || !item.existingMatch.isIdentical) {
          autoSelected.add(item.filePath);
        }
      });
      setSelectedPaths(autoSelected);
    } catch (err: any) {
      setScanError(err?.message || "Errore durante la connessione alle API di GitHub.");
    } finally {
      setIsScanning(false);
    }
  };

  // Toggle selection
  const handleToggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Select all or none
  const handleToggleSelectAll = () => {
    if (!scanResult) return;
    const currentFiltered = filteredItems;
    const allSelected = currentFiltered.every((i) => selectedPaths.has(i.filePath));
    if (allSelected) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        currentFiltered.forEach((i) => next.delete(i.filePath));
        return next;
      });
    } else {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        currentFiltered.forEach((i) => next.add(i.filePath));
        return next;
      });
    }
  };

  // Handler: Import Selected Items
  const handleImportSelected = async () => {
    if (!scanResult || selectedPaths.size === 0) return;
    setIsImporting(true);
    setImportFeedback(null);

    const itemsToImport = scanResult.items
      .filter((i) => selectedPaths.has(i.filePath))
      .map((item) => {
        return {
          type: item.type,
          title: item.title,
          url: item.url,
          summary: item.summary,
          tags: item.tags,
          isFavorite: false,
          metadata: {
            okfVersion: item.okfVersion || (item.isValidOKF ? "0.2" : undefined),
            docType: item.docType || "specification",
            domain: item.domain || "Software Architecture",
            repoName: scanResult.repo,
            owner: scanResult.owner,
            filePath: item.filePath,
            entities: item.entities || [],
            relations: item.relations || [],
            markdownContent: item.markdownContent,
          },
        } as Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">;
      });

    try {
      const result = await onBatchImportOkf(
        itemsToImport,
        `GitHub: ${scanResult.owner}/${scanResult.repo}`
      );
      setImportFeedback(`Sincronizzazione completata: ${result.added} nuove risorse inserite, ${result.updated} aggiornate.`);
      setTimeout(() => setImportFeedback(null), 6000);
    } catch (err: any) {
      setImportFeedback(`Errore durante l'importazione: ${err?.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered GitHub Items
  const filteredItems = useMemo(() => {
    if (!scanResult) return [];
    return scanResult.items.filter((item) => {
      if (filterMode === "OKF_ONLY" && !item.isValidOKF) return false;
      if (filterMode === "NEW_ONLY" && item.existingMatch) return false;
      return true;
    });
  }, [scanResult, filterMode]);

  // System Specs Audit List
  const systemSpecsStatus = useMemo(() => {
    return initialSampleResources.map((spec) => {
      const existing = currentResources.find(
        (r) =>
          r.title.trim().toLowerCase() === spec.title.trim().toLowerCase() ||
          (spec.url && r.url && r.url.trim().toLowerCase() === spec.url.trim().toLowerCase())
      );
      const isPresent = Boolean(existing);
      const currentMdLen = (existing?.metadata?.markdownContent || "").length;
      const specMdLen = (spec.metadata?.markdownContent || "").length;
      const canUpdate = isPresent && specMdLen > currentMdLen + 100;

      return {
        spec,
        isPresent,
        canUpdate,
        existingId: existing?.id,
      };
    });
  }, [currentResources]);

  const installedSpecsCount = systemSpecsStatus.filter((s) => s.isPresent).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#111] border border-[#262626] rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222] bg-[#141414]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 text-[#C5A059]">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                Sincronizzazione & Importazione OKF v0.2
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1C1C1C] border border-[#333] text-[#A0A0A0]">
                  GitHub & Documenti Fondativi
                </span>
              </h2>
              <p className="text-xs text-[#777] mt-0.5">
                Importa file e documentazione tecnica conforme allo standard OKF direttamente nel tuo Vault
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#777] hover:text-white p-1.5 rounded-lg hover:bg-[#222] transition-colors cursor-pointer"
            title="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 pt-3 border-b border-[#222] bg-[#121212] gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab("github")}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "github"
                ? "border-[#C5A059] text-white font-semibold"
                : "border-transparent text-[#777] hover:text-[#BBB]"
            }`}
          >
            <Github className="w-4 h-4 text-[#C5A059]" />
            <span>Sincronizza da Repository GitHub</span>
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "system"
                ? "border-[#C5A059] text-white font-semibold"
                : "border-transparent text-[#777] hover:text-[#BBB]"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Specifiche Fondative di Sistema ({installedSpecsCount}/{initialSampleResources.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: GITHUB SYNC */}
          {activeTab === "github" && (
            <div className="space-y-5">
              {/* Repo Input Form */}
              <form onSubmit={handleScanRepository} className="p-4 rounded-xl bg-[#161616] border border-[#242424] space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-mono text-[#888] uppercase tracking-wider mb-1">
                      Repository GitHub <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Github className="w-4 h-4 text-[#666] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={repoInput}
                        onChange={(e) => setRepoInput(e.target.value)}
                        placeholder="owner/repo (es. facebook/react oppure URL completo)"
                        className="w-full bg-[#0E0E0E] border border-[#2B2B2B] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-[#555] outline-none focus:border-[#C5A059]/60 font-mono"
                      />
                    </div>
                  </div>

                  <div className="w-full sm:w-36">
                    <label className="block text-[11px] font-mono text-[#888] uppercase tracking-wider mb-1">
                      Branch (opzionale)
                    </label>
                    <input
                      type="text"
                      value={branchInput}
                      onChange={(e) => setBranchInput(e.target.value)}
                      placeholder="main / master"
                      className="w-full bg-[#0E0E0E] border border-[#2B2B2B] rounded-lg px-3 py-2 text-xs text-white placeholder-[#555] outline-none focus:border-[#C5A059]/60 font-mono"
                    />
                  </div>

                  <div className="w-full sm:w-44">
                    <label className="block text-[11px] font-mono text-[#888] uppercase tracking-wider mb-1">
                      Sottocartella (opzionale)
                    </label>
                    <input
                      type="text"
                      value={subpathInput}
                      onChange={(e) => setSubpathInput(e.target.value)}
                      placeholder="docs / specs / .okf"
                      className="w-full bg-[#0E0E0E] border border-[#2B2B2B] rounded-lg px-3 py-2 text-xs text-white placeholder-[#555] outline-none focus:border-[#C5A059]/60 font-mono"
                    />
                  </div>
                </div>

                {/* Submit button & Presets */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#666]">
                    <span>Esempi rapidi:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRepoInput("modelcontextprotocol/servers");
                        setSubpathInput("src");
                      }}
                      className="text-[#C5A059] hover:underline cursor-pointer"
                    >
                      MCP Servers
                    </button>
                    <span>&bull;</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRepoInput("google-gemini/cookbook");
                        setSubpathInput("quickstarts");
                      }}
                      className="text-[#C5A059] hover:underline cursor-pointer"
                    >
                      Gemini Cookbook
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isScanning || !repoInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
                    <span>{isScanning ? "Scansione in corso..." : "Analizza File Markdown & OKF"}</span>
                  </button>
                </div>
              </form>

              {/* Error Banner */}
              {scanError && (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{scanError}</span>
                </div>
              )}

              {/* Import Feedback Banner */}
              {importFeedback && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs flex items-center justify-between gap-2.5 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{importFeedback}</span>
                  </div>
                  <button onClick={() => setImportFeedback(null)} className="text-emerald-400 hover:underline text-[11px]">
                    OK
                  </button>
                </div>
              )}

              {/* Quota Exceeded Notice */}
              {quotaExceeded && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <strong>Protezione Quota Cloud attiva:</strong> I file importati verranno salvati in sicurezza nella persistenza locale del browser (IndexedDB) e nel backup atomico del server senza consumare chiamate Firestore.
                  </div>
                </div>
              )}

              {/* Scan Results Section */}
              {scanResult && (
                <div className="space-y-3">
                  {/* Results Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#141414] border border-[#222]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">
                        {scanResult.items.length} file trovati in <code className="text-[#C5A059]">{scanResult.owner}/{scanResult.repo}</code>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1E1E1E] text-[#888] border border-[#2A2A2A]">
                        branch: {scanResult.branch}
                      </span>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setFilterMode("ALL")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors cursor-pointer ${
                          filterMode === "ALL" ? "bg-[#C5A059] text-black font-semibold" : "bg-[#1C1C1C] text-[#888] hover:text-white"
                        }`}
                      >
                        Tutti ({scanResult.items.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterMode("OKF_ONLY")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors cursor-pointer ${
                          filterMode === "OKF_ONLY" ? "bg-[#C5A059] text-black font-semibold" : "bg-[#1C1C1C] text-[#888] hover:text-white"
                        }`}
                      >
                        Solo OKF v0.2 ({scanResult.items.filter((i) => i.isValidOKF).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterMode("NEW_ONLY")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors cursor-pointer ${
                          filterMode === "NEW_ONLY" ? "bg-[#C5A059] text-black font-semibold" : "bg-[#1C1C1C] text-[#888] hover:text-white"
                        }`}
                      >
                        Non nel Vault ({scanResult.items.filter((i) => !i.existingMatch).length})
                      </button>
                    </div>
                  </div>

                  {/* Actions Bar (Select all + Import button) */}
                  <div className="flex items-center justify-between px-2 text-xs">
                    <label className="flex items-center gap-2 text-[#AAA] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filteredItems.length > 0 && filteredItems.every((i) => selectedPaths.has(i.filePath))}
                        onChange={handleToggleSelectAll}
                        className="rounded border-[#333] accent-[#C5A059]"
                      />
                      <span>Seleziona tutti ({filteredItems.length})</span>
                    </label>

                    <button
                      onClick={handleImportSelected}
                      disabled={isImporting || selectedPaths.size === 0}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <Download className={`w-3.5 h-3.5 ${isImporting ? "animate-bounce" : ""}`} />
                      <span>{isImporting ? "Importazione in corso..." : `Importa ${selectedPaths.size} Risorse nel Vault`}</span>
                    </button>
                  </div>

                  {/* Files List */}
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {filteredItems.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#666] border border-[#222] rounded-xl">
                        Nessun file corrisponde al filtro selezionato.
                      </div>
                    ) : (
                      filteredItems.map((item) => {
                        const isSelected = selectedPaths.has(item.filePath);
                        const isExpanded = expandedPreviewPath === item.filePath;

                        return (
                          <div
                            key={item.filePath}
                            className={`p-3 rounded-xl border transition-all ${
                              isSelected
                                ? "bg-[#141414] border-[#C5A059]/40"
                                : "bg-[#0F0F0F] border-[#1F1F1F] opacity-75 hover:opacity-100"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelect(item.filePath)}
                                  className="mt-1 rounded border-[#333] accent-[#C5A059] cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-white text-xs truncate">
                                      {item.title}
                                    </span>
                                    {item.isValidOKF ? (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-700/50 text-amber-300">
                                        OKF v0.2
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1E1E1E] text-[#888]">
                                        Markdown
                                      </span>
                                    )}
                                    {item.existingMatch ? (
                                      item.existingMatch.isIdentical ? (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/50 border border-blue-800/40 text-blue-400">
                                          Identico nel Vault
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-yellow-950/50 border border-yellow-800/40 text-yellow-300">
                                          Aggiornamento disponibile
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-800/40 text-emerald-400">
                                        Nuovo Documento
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-[#666] font-mono mt-0.5 truncate flex items-center gap-2">
                                    <span>{item.filePath}</span>
                                    <span>&bull;</span>
                                    <span>{(item.sizeBytes / 1024).toFixed(1)} KB</span>
                                    {item.entitiesCount > 0 && (
                                      <>
                                        <span>&bull;</span>
                                        <span className="text-[#A0A0A0]">{item.entitiesCount} entità</span>
                                      </>
                                    )}
                                    {item.relationsCount > 0 && (
                                      <>
                                        <span>&bull;</span>
                                        <span className="text-[#A0A0A0]">{item.relationsCount} relazioni</span>
                                      </>
                                    )}
                                  </div>

                                  <p className="text-[11px] text-[#999] mt-1 line-clamp-1">
                                    {item.summary}
                                  </p>
                                </div>
                              </div>

                              {/* Controls */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setExpandedPreviewPath(isExpanded ? null : item.filePath)}
                                  className="text-[11px] text-[#777] hover:text-[#C5A059] px-2 py-1 rounded bg-[#181818] border border-[#262626] transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{isExpanded ? "Chiudi" : "Anteprima"}</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-[#666] hover:text-white transition-colors"
                                  title="Apri su GitHub"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>

                            {/* Expanded Preview */}
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-[#222] space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {item.tags.map((t) => (
                                    <span key={t} className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1C1C1C] text-[#AAA]">
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                                <pre className="p-2.5 rounded-lg bg-[#080808] border border-[#1C1C1C] text-[10px] font-mono text-[#AAA] overflow-x-auto max-h-48 whitespace-pre-wrap">
                                  {item.markdownContent.slice(0, 1200)}
                                  {item.markdownContent.length > 1200 && "\n... [continua nel file originale]"}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FOUNDATIONAL SYSTEM SPECIFICATIONS */}
          {activeTab === "system" && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#171209] border border-[#C5A059]/30 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-white">
                    Protocolli Operativi e Standard Nativi del Knowledge Vault
                  </h3>
                </div>
                <p className="text-xs text-[#BBB] leading-relaxed">
                  Queste 10 specifiche sono i documenti fondativi del sistema (conformi allo standard <strong>OKF v0.2</strong>):
                  includono i protocolli operativi per agenti autonomi (<code>AGENTS.md</code>), l&apos;architettura di sistema full-stack (<code>ARCHITECTURE.md</code>),
                  le specifiche per Claude (<code>CLAUDE.md</code>) e Gemini (<code>GEMINI.md</code>), i server MCP e le ontologie D3.
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[#888]">Stato di Copertura:</span>
                    <span className="font-mono text-[#E5C170] font-bold">
                      {installedSpecsCount} di {initialSampleResources.length} installate
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-[#AAA] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={forceOverwriteSystem}
                        onChange={(e) => setForceOverwriteSystem(e.target.checked)}
                        className="rounded border-[#333] accent-[#C5A059]"
                      />
                      <span>Sovrascrivi e aggiorna testi esistenti</span>
                    </label>

                    <button
                      onClick={() => onSyncSystemSpecs(forceOverwriteSystem)}
                      disabled={isSyncingSystem}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSystem ? "animate-spin" : ""}`} />
                      <span>{isSyncingSystem ? "Allineamento in corso..." : "Installa / Aggiorna Specifiche"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Table of Foundational Specs */}
              <div className="rounded-xl border border-[#222] bg-[#141414] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#181818] border-b border-[#222] font-mono text-[10px] text-[#777] uppercase tracking-wider flex items-center justify-between">
                  <span>Documento & Specifica di Sistema</span>
                  <span>Stato nel Vault</span>
                </div>
                <div className="divide-y divide-[#1C1C1C]">
                  {systemSpecsStatus.map(({ spec, isPresent, canUpdate }) => (
                    <div key={spec.title} className="p-3.5 flex items-center justify-between gap-4 hover:bg-[#181818] transition-colors">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-white">{spec.title}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1F1F1F] text-[#C5A059]">
                            {spec.metadata?.docType || "specification"}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1F1F1F] text-[#888]">
                            {spec.metadata?.domain || "AI Systems"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#777] line-clamp-1">{spec.summary}</p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {isPresent ? (
                          canUpdate ? (
                            <span className="text-[11px] font-mono text-yellow-400 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> Aggiornabile
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Installato
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] font-mono text-[#777] flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-[#555]" /> Mancante
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#222] bg-[#141414] flex items-center justify-between text-xs text-[#777]">
          <span>Standard OKF (Open Knowledge Format) v0.2 &bull; Interoperabilità Multi-Agente</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-[#222] hover:bg-[#2A2A2A] text-white transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
