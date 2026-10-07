import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, 
  RotateCcw, 
  Download, 
  Upload, 
  Database, 
  HardDrive, 
  Layers, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Search, 
  FileText,
  Clock,
  Sparkles,
  RefreshCw,
  FolderArchive,
  CheckSquare,
  Square,
  Copy,
  Check,
  Camera,
  Trash2,
  ChevronDown,
  ChevronUp,
  Tag,
  Eye
} from "lucide-react";
import { ResourceItem, RawFileItem, NavCategory } from "../types";
import { 
  performDeepRecoveryScan, 
  DeepRecoveryScanReport, 
  restoreRecoveredResources, 
  downloadBackupJSON,
  createManualServerSnapshot,
  sanitizeLocalStorage,
  generateRecoveryDiagnosticReport
} from "../lib/recoveryManager";

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentResources: ResourceItem[];
  currentCategory: NavCategory;
  selectedTag: string | null;
  searchQuery: string;
  onResetFilters: () => void;
  onApplyRestoredResources: (restored: ResourceItem[]) => void;
  currentUserId?: string;
  rawFiles: RawFileItem[];
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({
  isOpen,
  onClose,
  currentResources,
  currentCategory,
  selectedTag,
  searchQuery,
  onResetFilters,
  onApplyRestoredResources,
  currentUserId,
  rawFiles,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanReport, setScanReport] = useState<DeepRecoveryScanReport | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItemsForRestore, setSelectedItemsForRestore] = useState<Set<string>>(new Set());
  
  // Filtering and Tabs
  const [viewTab, setViewTab] = useState<"all" | "missing" | "active">("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [modalSearch, setModalSearch] = useState<string>("");
  
  // Advanced Tools State
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  
  // File Import State
  const [isImportingFile, setIsImportingFile] = useState(false);

  // Active items maps for instant delta detection
  const activeIds = useMemo(() => new Set(currentResources.map((r) => r.id)), [currentResources]);
  const activeTitles = useMemo(
    () => new Set(currentResources.map((r) => (r.title || "").trim().toLowerCase())),
    [currentResources]
  );

  // Helper to check if item is missing from active vault view
  const isItemMissing = (item: ResourceItem): boolean => {
    if (item.id && activeIds.has(item.id)) return false;
    const normTitle = (item.title || "").trim().toLowerCase();
    if (normTitle && activeTitles.has(normTitle)) return false;
    return true;
  };

  // Run deep scan when modal opens
  useEffect(() => {
    if (isOpen) {
      handleRunScan();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleRunScan = async () => {
    setIsScanning(true);
    setRestoreSuccessMessage(null);
    setErrorMessage(null);
    try {
      const report = await performDeepRecoveryScan(currentResources);
      setScanReport(report);
      // Default: select all unique items found
      setSelectedItemsForRestore(new Set(report.uniqueResources.map((r) => r.id)));
    } catch (err: any) {
      console.error("[RecoveryModal] Scan failed:", err);
      setErrorMessage("Errore durante la scansione profonda dello storage: " + (err?.message || ""));
    } finally {
      setIsScanning(false);
    }
  };

  // Identify missing resources
  const missingResources = useMemo(() => {
    if (!scanReport) return [];
    return scanReport.uniqueResources.filter(isItemMissing);
  }, [scanReport, activeIds, activeTitles]);

  // Restore only missing resources
  const handleRestoreMissingOnly = async () => {
    if (missingResources.length === 0) return;
    setIsRestoring(true);
    setRestoreSuccessMessage(null);
    setErrorMessage(null);

    try {
      const result = await restoreRecoveredResources(
        missingResources,
        currentResources,
        currentUserId,
        rawFiles
      );

      onApplyRestoredResources(result.restoredResources);
      setRestoreSuccessMessage(
        `Ripristino completato! ${result.addedCount} risorse mancanti ripristinate con successo nel Vault (${result.mergedCount} totali).`
      );
      setTimeout(handleRunScan, 1500);
    } catch (err: any) {
      console.error("[RecoveryModal] Restore missing error:", err);
      setErrorMessage("Errore durante il ripristino delle risorse mancanti: " + (err?.message || ""));
    } finally {
      setIsRestoring(false);
    }
  };

  // Restore selected resources
  const handleRestoreSelected = async () => {
    if (!scanReport || selectedItemsForRestore.size === 0) return;
    setIsRestoring(true);
    setRestoreSuccessMessage(null);
    setErrorMessage(null);

    try {
      const itemsToRestore = scanReport.uniqueResources.filter((r) =>
        selectedItemsForRestore.has(r.id)
      );

      const result = await restoreRecoveredResources(
        itemsToRestore,
        currentResources,
        currentUserId,
        rawFiles
      );

      onApplyRestoredResources(result.restoredResources);
      setRestoreSuccessMessage(
        `Ripristino completato con successo! ${result.addedCount} nuove risorse inserite, ${result.mergedCount} risorse totali ora attive.`
      );
      setTimeout(handleRunScan, 1500);
    } catch (err: any) {
      console.error("[RecoveryModal] Restore error:", err);
      setErrorMessage("Errore durante il ripristino: " + (err?.message || ""));
    } finally {
      setIsRestoring(false);
    }
  };

  // Manual Server Snapshot Creation
  const handleCreateServerSnapshot = async () => {
    setIsCreatingSnapshot(true);
    setRestoreSuccessMessage(null);
    setErrorMessage(null);

    try {
      const listToSnapshot = scanReport?.uniqueResources.length ? scanReport.uniqueResources : currentResources;
      const res = await createManualServerSnapshot(
        listToSnapshot,
        rawFiles,
        `Snapshot-Manuale-${new Date().toISOString().slice(0, 10)}`,
        currentUserId
      );
      setRestoreSuccessMessage(`Istantanea creata con successo sul server: ${res.filename} (${res.count} risorse, ${res.formattedSize}).`);
      setTimeout(handleRunScan, 1200);
    } catch (err: any) {
      console.error("[RecoveryModal] Snapshot error:", err);
      setErrorMessage("Errore nella creazione dello snapshot: " + (err?.message || ""));
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Sanitize and compact local storage
  const handleSanitizeStorage = () => {
    setIsSanitizing(true);
    try {
      const { purgedKeys, freedBytesApprox } = sanitizeLocalStorage();
      setRestoreSuccessMessage(
        `Storage locale sanitizzato: rimosse ${purgedKeys} chiavi obsolete o orfane (liberati circa ${(freedBytesApprox / 1024).toFixed(1)} KB).`
      );
      setTimeout(handleRunScan, 1000);
    } catch (err: any) {
      setErrorMessage("Errore durante la pulizia dello storage: " + (err?.message || ""));
    } finally {
      setIsSanitizing(false);
    }
  };

  // Copy diagnostic markdown report
  const handleCopyDiagnosticReport = async () => {
    try {
      const activeDesc = hasActiveFilters
        ? `Categoria: ${currentCategory}, Tag: ${selectedTag || "nessuno"}, Ricerca: "${searchQuery}"`
        : "Nessun filtro attivo";
      const md = generateRecoveryDiagnosticReport(scanReport, currentResources, activeDesc);
      await navigator.clipboard.writeText(md);
      setDiagnosticCopied(true);
      setTimeout(() => setDiagnosticCopied(false), 3000);
    } catch {
      setErrorMessage("Impossibile copiare il report negli appunti.");
    }
  };

  // Export JSON backup
  const handleExportJSON = () => {
    const listToExport = scanReport?.uniqueResources.length ? scanReport.uniqueResources : currentResources;
    downloadBackupJSON(listToExport, rawFiles);
  };

  // Import JSON backup
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setIsImportingFile(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const importedResources: any[] = Array.isArray(parsed) ? parsed : (parsed.resources || []);
        
        if (importedResources.length === 0) {
          throw new Error("Nessuna risorsa valida trovata nel file JSON caricato.");
        }

        const normalized: ResourceItem[] = importedResources.map((r, i) => ({
          id: r.id || `file-imported-${Date.now()}-${i}`,
          userId: r.userId || currentUserId || "offline-user",
          title: r.title || `Risorsa importata #${i + 1}`,
          type: r.type || "knowledge",
          summary: r.summary || "",
          tags: Array.isArray(r.tags) ? r.tags : [],
          url: r.url || "",
          metadata: r.metadata,
          isFavorite: !!r.isFavorite,
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
          updatedAt: new Date(),
        }));

        const result = await restoreRecoveredResources(
          normalized,
          currentResources,
          currentUserId,
          rawFiles
        );

        onApplyRestoredResources(result.restoredResources);
        setRestoreSuccessMessage(
          `Importate e ripristinate ${result.addedCount} nuove risorse dal file (${result.mergedCount} totali nel Vault)!`
        );
        setTimeout(handleRunScan, 1500);
      } catch (err: any) {
        setErrorMessage(err?.message || "Errore nel caricamento del file di backup.");
      } finally {
        setIsImportingFile(false);
      }
    };
    reader.readAsText(file);
  };

  const hasActiveFilters = currentCategory !== "all" || !!selectedTag || !!searchQuery.trim();

  // Selection Toggles
  const handleSelectAll = () => {
    if (!scanReport) return;
    setSelectedItemsForRestore(new Set(scanReport.uniqueResources.map((r) => r.id)));
  };

  const handleDeselectAll = () => {
    setSelectedItemsForRestore(new Set());
  };

  const handleSelectMissingOnly = () => {
    setSelectedItemsForRestore(new Set(missingResources.map((r) => r.id)));
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItemsForRestore((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  // Filtered items to display in the list
  const displayList = (scanReport?.uniqueResources || []).filter((r) => {
    // Tab filter
    const missing = isItemMissing(r);
    if (viewTab === "missing" && !missing) return false;
    if (viewTab === "active" && missing) return false;

    // Type filter
    if (filterType !== "all" && r.type !== filterType) return false;

    // Search query filter
    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase();
      const matchTitle = (r.title || "").toLowerCase().includes(q);
      const matchSummary = (r.summary || "").toLowerCase().includes(q);
      const matchTags = r.tags?.some((t) => t.toLowerCase().includes(q));
      return matchTitle || matchSummary || matchTags;
    }
    return true;
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-5xl max-h-[92vh] bg-[#0E0C09] border border-[#2D2413] rounded-2xl flex flex-col shadow-2xl overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E190F] bg-[#141009]/95">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#C5A059]/15 border border-[#C5A059]/30 text-[#D5B069]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Centro di Recupero & Protezione Dati
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1C160C] text-[#C5A059] border border-[#3E3017]">
                  Storage Shield v0.2
                </span>
              </div>
              <p className="text-xs text-[#888]">
                Scansione esaustiva multi-livello (LocalStorage, Session, IndexedDB, Server Backup e Snapshots)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunScan}
              disabled={isScanning}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-[#1A1610] hover:bg-[#251F14] text-[#CCC] hover:text-white border border-[#2D2413] flex items-center gap-1.5 transition-all cursor-pointer"
              title="Riesegui scansione completa di tutti i livelli"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-[#C5A059]" : ""}`} />
              <span className="hidden sm:inline">Riscansiona</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Chiudi finestra"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1C160C] hover:bg-[#2A2010] text-[#888] hover:text-white border border-[#3E3017] transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* SECTION 1: FILTER STATUS WARNING (Alert if filters are active and hiding items) */}
          {hasActiveFilters && (
            <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Filter className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold text-amber-300">Filtri di visualizzazione attivi: </span>
                  <span className="text-[#DDD]">
                    {currentCategory !== "all" && `Categoria: "${currentCategory}" • `}
                    {selectedTag && `Tag: "#${selectedTag}" • `}
                    {searchQuery && `Ricerca: "${searchQuery}"`}
                  </span>
                  <p className="text-[11px] text-amber-400/80 mt-0.5">
                    Le tue risorse potrebbero non essere perse ma solo filtrate dalla vista principale del Vault.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  onResetFilters();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-medium shrink-0 transition-colors cursor-pointer"
              >
                Azzera Filtri e Mostra Tutto
              </button>
            </div>
          )}

          {/* Messages: Success & Error */}
          {restoreSuccessMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-300 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{restoreSuccessMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center gap-2 text-xs text-rose-300 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* SECTION 2: STORAGE CARDS WITH DELTA BADGES */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#141009] border border-[#241C0E]">
              <div className="flex items-center justify-between text-xs text-[#888] mb-1">
                <span>Vault Attivo</span>
                <Layers className="w-3.5 h-3.5 text-[#C5A059]" />
              </div>
              <div className="text-xl font-bold text-white">
                {currentResources.length}
              </div>
              <span className="text-[10px] text-[#777]">risorse caricate in memoria</span>
            </div>

            <div className="p-3 rounded-xl bg-[#141009] border border-[#241C0E]">
              <div className="flex items-center justify-between text-xs text-[#888] mb-1">
                <span>Storage Totale</span>
                <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-blue-300">
                {scanReport ? scanReport.totalUniqueResources : "..."}
              </div>
              <span className="text-[10px] text-[#777]">risorse uniche rilevate</span>
            </div>

            <div className={`p-3 rounded-xl border transition-all ${
              missingResources.length > 0 
                ? "bg-[#1E1609] border-[#C5A059]/60 shadow-xs" 
                : "bg-[#141009] border-[#241C0E]"
            }`}>
              <div className="flex items-center justify-between text-xs text-[#888] mb-1">
                <span className={missingResources.length > 0 ? "text-[#E5C170] font-semibold" : ""}>
                  Da Recuperare
                </span>
                <Sparkles className={`w-3.5 h-3.5 ${missingResources.length > 0 ? "text-[#C5A059] animate-pulse" : "text-emerald-400"}`} />
              </div>
              <div className={`text-xl font-bold ${missingResources.length > 0 ? "text-[#E5C170]" : "text-emerald-300"}`}>
                {missingResources.length > 0 ? `+${missingResources.length}` : "0"}
              </div>
              <span className="text-[10px] text-[#777]">
                {missingResources.length > 0 ? "assenti nel Vault attivo" : "tutte le risorse allineate"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#141009] border border-[#241C0E]">
              <div className="flex items-center justify-between text-xs text-[#888] mb-1">
                <span>Buffer Grezzi</span>
                <FolderArchive className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-purple-300">
                {scanReport ? scanReport.totalRawFilesFound : rawFiles.length}
              </div>
              <span className="text-[10px] text-[#777]">file grezzi preservati</span>
            </div>
          </div>

          {/* SOURCING BREAKDOWN ACCORDION */}
          {scanReport && scanReport.sources.length > 0 && (
            <div className="p-3 rounded-xl bg-[#120F0A] border border-[#261E0E]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-[#D5B069] flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  <span>Sorgenti di Storage Rilevate ({scanReport.sources.length}):</span>
                </h4>
                <span className="text-[10px] font-mono text-[#777]">
                  Scansione bitemporale multi-tier
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {scanReport.sources.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-[#18130B] border border-[#241C0E]">
                    <div className="min-w-0 pr-2">
                      <span className="font-mono text-white text-[11px] truncate block">{s.sourceName}</span>
                      <span className="text-[10px] text-[#777] line-clamp-1">{s.description}</span>
                    </div>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#20180D] text-[#C5A059] border border-[#3E3017] shrink-0 font-medium">
                      {s.count} schede
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: ACTION CONTROLS & RESTORE BAR */}
          <div className="p-3.5 rounded-xl bg-[#17130C] border border-[#2E2413] flex flex-col gap-3">
            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {/* Restore Missing Only (Highlight Button) */}
                {missingResources.length > 0 && (
                  <button
                    onClick={handleRestoreMissingOnly}
                    disabled={isRestoring}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#C5A059] to-[#D5B069] hover:from-[#D5B069] hover:to-[#E5C170] text-black font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {isRestoring ? "Ripristino in corso..." : `Ripristina Solo Mancanti (+${missingResources.length})`}
                    </span>
                  </button>
                )}

                {/* Restore Selected */}
                <button
                  onClick={handleRestoreSelected}
                  disabled={isRestoring || !scanReport || selectedItemsForRestore.size === 0}
                  className="px-3.5 py-2 rounded-lg bg-[#221A0D] hover:bg-[#302412] text-[#E5C170] border border-[#C5A059]/50 font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRestoring ? "animate-spin" : ""}`} />
                  <span>
                    {isRestoring
                      ? "Ripristino in corso..."
                      : `Ripristina Selezionate (${selectedItemsForRestore.size})`}
                  </span>
                </button>
              </div>

              {/* Maintenance Tools Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Snapshot Server Button */}
                <button
                  onClick={handleCreateServerSnapshot}
                  disabled={isCreatingSnapshot}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1D180F] hover:bg-[#282114] text-[#DDD] hover:text-white border border-[#362A14] text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Crea un'istantanea congelata permanente sul filesystem del server"
                >
                  <Camera className={`w-3.5 h-3.5 text-sky-400 ${isCreatingSnapshot ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Istantanea Server</span>
                </button>

                {/* Sanitize Storage Button */}
                <button
                  onClick={handleSanitizeStorage}
                  disabled={isSanitizing}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1D180F] hover:bg-[#282114] text-[#DDD] hover:text-white border border-[#362A14] text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Rimuovi chiavi orfane, temporanee e frammenti nulli dal browser"
                >
                  <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Sanitizza Storage</span>
                </button>

                {/* Diagnostic Report Button */}
                <button
                  onClick={handleCopyDiagnosticReport}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1D180F] hover:bg-[#282114] text-[#DDD] hover:text-white border border-[#362A14] text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copia negli appunti il report diagnostico completo in Markdown"
                >
                  {diagnosticCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#C5A059]" />
                  )}
                  <span className="hidden sm:inline">
                    {diagnosticCopied ? "Copiato!" : "Report Diagnostico"}
                  </span>
                </button>

                {/* Export Backup JSON */}
                <button
                  onClick={handleExportJSON}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1D180F] hover:bg-[#282114] text-[#DDD] hover:text-white border border-[#362A14] text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Esporta copia JSON di sicurezza sul tuo computer"
                >
                  <Download className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span className="hidden sm:inline">Scarica Backup</span>
                </button>

                {/* Import JSON File */}
                <label className="cursor-pointer px-2.5 py-1.5 rounded-lg bg-[#1D180F] hover:bg-[#282114] text-[#DDD] hover:text-white border border-[#362A14] text-xs flex items-center gap-1.5 transition-colors">
                  <Upload className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isImportingFile ? "Caricamento..." : "Importa JSON"}</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isImportingFile}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* SECTION 4: PREVIEW OF RECOVERABLE RESOURCES WITH TABS & GRANULAR SELECTION */}
          <div className="border border-[#241C0E] rounded-xl overflow-hidden bg-[#110E09]">
            {/* Table Control Header */}
            <div className="p-3 border-b border-[#241C0E] flex flex-wrap items-center justify-between gap-3 bg-[#16120B]">
              {/* Tabs: Tutte / Solo Mancanti / Già nel Vault */}
              <div className="flex items-center gap-1 bg-[#1A150D] p-0.5 rounded-lg border border-[#2D2211]">
                <button
                  onClick={() => setViewTab("all")}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                    viewTab === "all"
                      ? "bg-[#2A2010] text-[#E5C170] font-semibold border border-[#C5A059]/40"
                      : "text-[#888] hover:text-[#CCC]"
                  }`}
                >
                  Tutte ({scanReport?.uniqueResources.length || 0})
                </button>
                <button
                  onClick={() => setViewTab("missing")}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer flex items-center gap-1 ${
                    viewTab === "missing"
                      ? "bg-[#33220A] text-[#E5C170] font-semibold border border-[#C5A059]/60"
                      : "text-[#888] hover:text-[#CCC]"
                  }`}
                >
                  <span>Solo Mancanti</span>
                  {missingResources.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-[#C5A059] text-black text-[10px] font-bold">
                      {missingResources.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setViewTab("active")}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                    viewTab === "active"
                      ? "bg-[#2A2010] text-[#E5C170] font-semibold border border-[#C5A059]/40"
                      : "text-[#888] hover:text-[#CCC]"
                  }`}
                >
                  Già Attive ({currentResources.length})
                </button>
              </div>

              {/* Filters: Search & Type */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3 h-3 text-[#777] absolute left-2 top-2" />
                  <input
                    type="text"
                    placeholder="Cerca per titolo o tag..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="pl-7 pr-2 py-1 text-[11px] font-mono rounded-lg bg-[#1E180E] border border-[#332512] text-white placeholder-[#666] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-2 py-1 text-[11px] font-mono rounded-lg bg-[#1E180E] border border-[#332512] text-[#CCC] focus:outline-none cursor-pointer"
                >
                  <option value="all">Tutti i tipi</option>
                  <option value="knowledge">Knowledge</option>
                  <option value="troubleshooting">Troubleshooting</option>
                  <option value="mcp_server">MCP Server</option>
                  <option value="github_repo">GitHub Repo</option>
                  <option value="ai_skill">AI Skill</option>
                  <option value="article">Articolo</option>
                </select>
              </div>
            </div>

            {/* Granular Selection Controls Bar */}
            <div className="px-3 py-1.5 border-b border-[#20170A] bg-[#140F08] flex items-center justify-between text-[11px] font-mono text-[#888]">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-[#C5A059] hover:underline cursor-pointer flex items-center gap-1"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>Seleziona Tutte</span>
                </button>
                <span>•</span>
                <button
                  onClick={handleDeselectAll}
                  className="hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <Square className="w-3 h-3" />
                  <span>Deseleziona</span>
                </button>
                {missingResources.length > 0 && (
                  <>
                    <span>•</span>
                    <button
                      onClick={handleSelectMissingOnly}
                      className="text-[#E5C170] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Solo Mancanti ({missingResources.length})</span>
                    </button>
                  </>
                )}
              </div>
              <div>
                <span>Selezionate: </span>
                <strong className="text-white">{selectedItemsForRestore.size}</strong> di {scanReport?.uniqueResources.length || 0}
              </div>
            </div>

            {/* List of Resources */}
            <div className="max-h-72 overflow-y-auto divide-y divide-[#1D170C] custom-scrollbar">
              {displayList.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#777] font-mono">
                  {isScanning
                    ? "Scansione multi-livello in corso..."
                    : "Nessuna risorsa trovata per i criteri selezionati."}
                </div>
              ) : (
                displayList.map((item) => {
                  const isSelected = selectedItemsForRestore.has(item.id);
                  const missing = isItemMissing(item);
                  const isExpanded = expandedItemId === item.id;

                  return (
                    <div 
                      key={item.id} 
                      className={`p-3 transition-colors ${
                        missing ? "bg-[#181207]/40 hover:bg-[#20170A]" : "hover:bg-[#16120B]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleItemSelection(item.id)}
                          className="mt-0.5 text-[#C5A059] hover:text-[#E5C170] cursor-pointer shrink-0"
                          title={isSelected ? "Deseleziona" : "Seleziona per il ripristino"}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#C5A059]" />
                          ) : (
                            <Square className="w-4 h-4 text-[#555]" />
                          )}
                        </button>

                        {/* Resource Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white truncate max-w-md text-xs">
                              {item.title}
                            </span>

                            {/* Badge: Missing vs Active */}
                            {missing ? (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>RECUPERABILE / NON ATTIVA</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#162218] text-emerald-400 border border-emerald-900/40">
                                ✓ Già nel Vault
                              </span>
                            )}

                            {/* Type Badge */}
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#20190D] text-[#C5A059] border border-[#3A2C14]">
                              {item.type}
                            </span>

                            {item.metadata?.docType && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#161C24] text-sky-400 border border-sky-900/40">
                                {item.metadata.docType}
                              </span>
                            )}
                          </div>

                          {item.summary && (
                            <p className="text-[11px] text-[#888] line-clamp-1 mt-0.5">{item.summary}</p>
                          )}

                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <div className="flex items-center gap-3 text-[10px] text-[#666] font-mono">
                              <span className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {item.createdAt ? new Date(item.createdAt).toLocaleDateString("it-IT") : "N/D"}
                              </span>
                              {item.tags && item.tags.length > 0 && (
                                <span className="truncate max-w-xs text-[#C5A059]/80">
                                  #{item.tags.slice(0, 4).join(" #")}
                                </span>
                              )}
                            </div>

                            {/* Expand / View Details Button */}
                            <button
                              type="button"
                              onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                              className="text-[10px] font-mono text-[#888] hover:text-[#E5C170] flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>{isExpanded ? "Comprimi" : "Dettagli"}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>

                          {/* Expanded Content Drawer */}
                          {isExpanded && (
                            <div className="mt-2.5 p-3 rounded-lg bg-[#0C0A07] border border-[#241C0E] text-xs text-[#CCC] space-y-2 animate-fade-in font-mono">
                              {item.summary && (
                                <div>
                                  <span className="text-[#C5A059] font-bold block text-[10px] uppercase">Sommario:</span>
                                  <p className="text-[#DDD] text-[11px] mt-0.5">{item.summary}</p>
                                </div>
                              )}
                              {item.url && (
                                <div>
                                  <span className="text-[#C5A059] font-bold block text-[10px] uppercase">URL Sorgente:</span>
                                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline break-all text-[11px]">
                                    {item.url}
                                  </a>
                                </div>
                              )}
                              {item.metadata?.markdownContent && (
                                <div>
                                  <span className="text-[#C5A059] font-bold block text-[10px] uppercase">Anteprima Markdown:</span>
                                  <pre className="mt-1 p-2 rounded bg-[#141009] border border-[#221A0C] text-[10px] text-[#BBB] overflow-x-auto max-h-36 custom-scrollbar whitespace-pre-wrap">
                                    {item.metadata.markdownContent.slice(0, 600)}
                                    {item.metadata.markdownContent.length > 600 ? "..." : ""}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#1E190F] bg-[#141009] flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-[11px] text-[#777] font-mono">
            Protezione Dati Bitemporale · Salvataggio atomico simultaneo su LocalStorage, IndexedDB e Server.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1C160C] hover:bg-[#282012] text-[#CCC] hover:text-white border border-[#3E3017] text-xs font-mono transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
