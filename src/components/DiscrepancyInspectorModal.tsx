import React, { useState, useEffect } from "react";
import { 
  X, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Filter, 
  Search, 
  RotateCcw, 
  Terminal, 
  Copy, 
  Layers, 
  FileText, 
  Database, 
  GitMerge, 
  Trash2, 
  ArrowRight,
  Sparkles,
  Info,
  Activity,
  Radio,
  Cloud,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { ResourceItem, RawFileItem, NavCategory, ResourceLifecycleEvent } from "../types";
import { 
  analyzeResourceDiscrepancy, 
  getLifecycleEvents, 
  subscribeToLifecycleEvents, 
  clearLifecycleEvents,
  recordLifecycleEvent
} from "../lib/resourceLifecycleTracker";
import {
  subscribeToSyncAudit,
  clearSyncTraceHistory,
  SyncTraceAuditResult,
  StaleOverwriteWarning,
  DiscrepancyReport
} from "../lib/vaultSyncAudit";

export interface DiscrepancyInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  resources: ResourceItem[];
  filteredResources: ResourceItem[];
  rawFiles: RawFileItem[];
  currentCategory: NavCategory;
  setCurrentCategory: (cat: NavCategory) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onOpenRecoveryModal?: () => void;
  onOpenDiagnostic?: () => void;
  onOpenVaultHealthCheck?: () => void;
}

export const DiscrepancyInspectorModal: React.FC<DiscrepancyInspectorModalProps> = ({
  isOpen,
  onClose,
  resources,
  filteredResources,
  rawFiles,
  currentCategory,
  setCurrentCategory,
  selectedTag,
  setSelectedTag,
  searchQuery,
  setSearchQuery,
  onOpenRecoveryModal,
  onOpenDiagnostic,
  onOpenVaultHealthCheck,
}) => {
  const [events, setEvents] = useState<ResourceLifecycleEvent[]>([]);
  const [syncTraces, setSyncTraces] = useState<SyncTraceAuditResult[]>([]);
  const [activeTab, setActiveTab] = useState<"lifecycle" | "synctrace">("lifecycle");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsubEvents = subscribeToLifecycleEvents((allEvts) => {
      setEvents(allEvts);
    });
    const unsubSync = subscribeToSyncAudit((allTraces) => {
      setSyncTraces(allTraces);
    });
    return () => {
      unsubEvents();
      unsubSync();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const analysis = analyzeResourceDiscrepancy(
    resources,
    filteredResources,
    currentCategory,
    selectedTag,
    searchQuery
  );

  const handleResetAllFilters = () => {
    setCurrentCategory("all");
    setSelectedTag(null);
    setSearchQuery("");
    recordLifecycleEvent({
      stage: "FILTER_DISCREPANCY_CHECK",
      status: "success",
      message: `Tutti i filtri di visualizzazione sono stati azzerati. Ripristinata la visualizzazione globale delle ${resources.length} risorse.`,
      details: { previousCategory: currentCategory, previousTag: selectedTag, previousQuery: searchQuery },
    });
  };

  const filteredEvents = events.filter((evt) => {
    if (filterStage === "all") return true;
    if (filterStage === "capture") {
      return (
        evt.stage === "RAW_INPUT_CAPTURED" ||
        evt.stage === "CAPTURE_INITIATED" ||
        evt.stage === "DATA_TRANSFORMATION" ||
        evt.stage === "AI_ANALYSIS_SUCCESS" ||
        evt.stage === "AI_ANALYSIS_FALLBACK" ||
        evt.stage === "LOCAL_CREATION"
      );
    }
    if (filterStage === "conversion") return evt.stage === "RAW_FILE_CONVERSION" || evt.stage === "RAW_FILE_STAGED" || evt.stage === "RAW_FILE_DELETED";
    if (filterStage === "firestore") return evt.stage === "FIRESTORE_WRITE_START" || evt.stage === "FIRESTORE_WRITE_SUCCESS" || evt.stage === "FIRESTORE_WRITE_FAIL";
    if (filterStage === "merge") return evt.stage === "CONFLICT_RECONCILIATION" || evt.stage === "RESOURCE_COLLAPSED_DEDUPED";
    if (filterStage === "deletion") return evt.stage === "RESOURCE_DELETED" || evt.stage === "RESOURCE_DROPPED_TOMBSTONE";
    return true;
  });

  const handleCopyAuditReport = () => {
    const report = {
      exportedAt: new Date().toISOString(),
      discrepancyAnalysis: analysis,
      counts: {
        totalStateResources: resources.length,
        totalDisplayedCards: filteredResources.length,
        rawFilesCount: rawFiles.length,
        difference: analysis.difference,
      },
      currentFilters: {
        category: currentCategory,
        selectedTag,
        searchQuery,
      },
      lifecycleEvents: events,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStageBadge = (stage: ResourceLifecycleEvent["stage"]) => {
    switch (stage) {
      case "RAW_INPUT_CAPTURED":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-950/70 border border-violet-800 text-violet-300">RAW INPUT</span>;
      case "CAPTURE_INITIATED":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-950/70 border border-blue-800 text-blue-300">CAPTURE INIT</span>;
      case "DATA_TRANSFORMATION":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950/70 border border-indigo-800 text-indigo-300">TRANSFORMATION</span>;
      case "AI_ANALYSIS_SUCCESS":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-teal-950/70 border border-teal-800 text-teal-300">AI PARSED</span>;
      case "AI_ANALYSIS_FALLBACK":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950/70 border border-amber-800 text-amber-300">AI FALLBACK</span>;
      case "RAW_FILE_STAGED":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950/70 border border-sky-800 text-sky-300">RAW STAGED</span>;
      case "RAW_FILE_DELETED":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-950/70 border border-rose-800 text-rose-300">RAW DELETED</span>;
      case "RAW_FILE_CONVERSION":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950/70 border border-cyan-800 text-cyan-300">RAW CONVERSION</span>;
      case "LOCAL_CREATION":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950/70 border border-amber-800 text-amber-300">LOCAL STORED</span>;
      case "OKF_SCHEMA_VALIDATION":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950/70 border border-indigo-800 text-indigo-300">OKF VALIDATION</span>;
      case "FIRESTORE_WRITE_START":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950/70 border border-sky-800 text-sky-300">FIRESTORE PUSH</span>;
      case "FIRESTORE_WRITE_SUCCESS":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950/70 border border-emerald-800 text-emerald-300">FIRESTORE OK</span>;
      case "FIRESTORE_WRITE_FAIL":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-950/70 border border-rose-800 text-rose-300">FIRESTORE FAIL</span>;
      case "RESOURCE_COLLAPSED_DEDUPED":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-950/70 border border-purple-800 text-purple-300">DEDUPED MERGE</span>;
      case "CONFLICT_RECONCILIATION":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1C160B] border border-[#C5A059]/40 text-[#E5C170]">RECONCILED</span>;
      case "RESOURCE_DELETED":
      case "RESOURCE_DROPPED_TOMBSTONE":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950/70 border border-amber-800 text-amber-300">DELETED / TOMBSTONE</span>;
      case "FILTER_DISCREPANCY_CHECK":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-yellow-950/70 border border-yellow-800 text-yellow-300">FILTER CHECK</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#151515] border border-[#333] text-[#AAA]">{stage}</span>;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fade-in font-sans"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl max-h-[90vh] bg-[#0A0907] border border-[#2D2413] rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E190F] bg-[#141009]/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/25 text-[#D5B069]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Audit Integrità Risorse & Tracciamento Ciclo di Vita
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1C160B] border border-[#3E3017] text-[#C5A059]">
                  OKF v0.2 + Firestore
                </span>
              </div>
              <p className="text-xs text-[#888]">
                Verifica in tempo reale dello stato in memoria vs card visualizzate e log degli inserimenti
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAuditReport}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#16130D] border border-[#2D2413] text-[#CCC] hover:text-white hover:border-[#C5A059]/40 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Copia Report Diagnostico Completo JSON"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#888]" />}
              <span>{copied ? "Copiato" : "Copia Audit JSON"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#888] hover:text-white hover:bg-[#1A160F] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#080705]">
          
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#110E09] border border-[#251D10]">
              <span className="text-[11px] text-[#888] flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-[#C5A059]" />
                Totale Risorse nello Stato
              </span>
              <div className="text-2xl font-bold font-mono text-white mt-1">
                {resources.length}
              </div>
              <span className="text-[10px] text-[#666]">
                Tutti i record protetti in memoria
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#110E09] border border-[#251D10]">
              <span className="text-[11px] text-[#888] flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                Card Visualizzate a Schermo
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                {filteredResources.length}
              </div>
              <span className="text-[10px] text-[#666]">
                Corrispondenti ai filtri attuali
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#110E09] border border-[#251D10]">
              <span className="text-[11px] text-[#888] flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                Buffer File Grezzi
              </span>
              <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                {rawFiles.length}
              </div>
              <span className="text-[10px] text-[#666]">
                File in attesa o convertiti in OKF
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${
              analysis.difference === 0 
                ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300"
                : "bg-amber-950/20 border-amber-900/40 text-amber-300"
            }`}>
              <span className="text-[11px] text-[#888] flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Discrepanza Filtri
              </span>
              <div className="text-2xl font-bold font-mono mt-1">
                {analysis.difference === 0 ? "0 (Allineato)" : `-${analysis.difference} nascoste`}
              </div>
              <span className="text-[10px] opacity-80">
                {analysis.difference === 0 ? "Tutte le card visibili" : "Escluse da filtri attivi"}
              </span>
            </div>
          </div>

          {/* Mathematical Explanation Banner */}
          <div className="p-4 rounded-xl bg-[#120E08] border border-[#2C210E] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#C5A059] shrink-0" />
                <span className="text-xs font-semibold text-[#E5C170]">
                  Diagnosi sulla Visibilità delle Risorse
                </span>
              </div>
              <p className="text-xs text-[#CCC] leading-relaxed">
                {analysis.primaryExplanation}
              </p>
            </div>

            {analysis.isDiscrepancyPresent && (
              <button
                onClick={handleResetAllFilters}
                className="px-3 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{analysis.remedyActionLabel || "Mostra Tutte le 108 Card"}</span>
              </button>
            )}
          </div>

          {/* Tab Selection between Lifecycle and Sync Audit */}
          <div className="flex items-center gap-2 border-b border-[#22180B] pb-2">
            <button
              onClick={() => setActiveTab("lifecycle")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                activeTab === "lifecycle"
                  ? "bg-[#C5A059]/20 text-[#E5C170] border border-[#C5A059]/40 font-semibold"
                  : "text-[#888] hover:text-[#CCC] hover:bg-[#15120C]"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Ciclo di Vita & Cattura ({events.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("synctrace")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                activeTab === "synctrace"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/40 font-semibold"
                  : "text-[#888] hover:text-[#CCC] hover:bg-[#15120C]"
              }`}
            >
              <Cloud className="w-3.5 h-3.5 text-blue-400" />
              <span>Audit Sync Firestore & Sovrascritture ({syncTraces.length})</span>
              {syncTraces.some((t) => t.staleWarnings.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
          </div>

          {activeTab === "lifecycle" ? (
            /* Lifecycle & Event Stream Timeline */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#C5A059]" />
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                    Registro Ciclo di Vita (Lifecycle Events Trace)
                  </h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#18130B] border border-[#2D2210] text-[#C5A059]">
                    {filteredEvents.length} eventi
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: "all", label: "TUTTI" },
                    { id: "capture", label: "CATTURA & TRASFORMAZIONE" },
                    { id: "conversion", label: "CONVERSIONI RAW" },
                    { id: "firestore", label: "FIRESTORE" },
                    { id: "merge", label: "MERGE / DEDUP" },
                    { id: "deletion", label: "ELIMINAZIONI" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setFilterStage(tab.id)}
                      className={`text-[10px] font-mono px-2 py-1 rounded transition-all cursor-pointer ${
                        filterStage === tab.id
                          ? "bg-[#C5A059] text-black font-semibold"
                          : "bg-[#141009] text-[#888] hover:text-white border border-[#231A0D]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}

                  {events.length > 0 && (
                    <button
                      onClick={clearLifecycleEvents}
                      className="p-1 text-[#666] hover:text-rose-400 text-xs ml-1 cursor-pointer"
                      title="Svuota eventi ciclo di vita"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Events Feed */}
              <div className="bg-[#050403] border border-[#1A140A] rounded-xl p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-2 scrollbar-thin scrollbar-thumb-[#2D2413]">
                {filteredEvents.length === 0 ? (
                  <div className="text-center py-6 text-[#555]">
                    <p>Nessun evento registrato per questo filtro.</p>
                    <p className="text-[11px] mt-1 text-[#444]">
                      Gli eventi di creazione, salvataggio Firestore, conversione raw e deduplicazione vengono tracciati automaticamente qui.
                    </p>
                  </div>
                ) : (
                  filteredEvents.map((evt) => (
                    <div 
                      key={evt.id} 
                      className="p-2 rounded-lg bg-[#0E0B07] border border-[#1F180D] flex items-start justify-between gap-3 text-[11px]"
                    >
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[#666] text-[10px]">{evt.timestamp}</span>
                          {getStageBadge(evt.stage)}
                          {evt.resourceTitle && (
                            <span className="text-[#E5C170] font-semibold truncate max-w-xs">
                              "{evt.resourceTitle}"
                            </span>
                          )}
                        </div>
                        <p className="text-[#BBB] break-words">
                          {evt.message}
                        </p>
                        {evt.details && Object.keys(evt.details).length > 0 && (
                          <div className="text-[10px] text-[#777] bg-[#070604] p-1.5 rounded border border-[#19140A] mt-1">
                            {Object.entries(evt.details).map(([k, v]) => (
                              <span key={k} className="mr-3 inline-block">
                                <span className="text-[#999]">{k}:</span> <span className="text-[#C5A059]">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Sync Audit & Stale Overwrite Trace */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                    Tracciamento Catena setResources & Firestore Sync
                  </h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-950/60 border border-blue-800/60 text-blue-300">
                    {syncTraces.length} operazioni
                  </span>
                </div>

                {syncTraces.length > 0 && (
                  <button
                    onClick={clearSyncTraceHistory}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-[#888] hover:text-rose-400 font-mono transition-colors cursor-pointer"
                    title="Azzera storico audit sync"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Azzera Log</span>
                  </button>
                )}
              </div>

              {/* Sync Feed */}
              <div className="bg-[#050403] border border-[#1A140A] rounded-xl p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-2 scrollbar-thin scrollbar-thumb-[#2D2413]">
                {syncTraces.length === 0 ? (
                  <div className="text-center py-6 text-[#555]">
                    <p>Nessuna operazione setResources registrata finora.</p>
                    <p className="text-[11px] mt-1 text-[#444]">
                      Ogni aggiornamento dello stato (listener realtime Firestore, snapshot, idratazione, manual add, toggle favorite) viene verificato per prevenire regressioni di timestamp o documenti remoti scartati.
                    </p>
                  </div>
                ) : (
                  syncTraces.map((trace) => {
                    const hasWarnings = trace.staleWarnings.length > 0;
                    const hasDiscrepancy = trace.discrepancyReport?.hasDiscrepancy;

                    return (
                      <div
                        key={trace.seq}
                        className={`p-2.5 rounded-lg border text-[11px] space-y-1.5 ${
                          hasWarnings
                            ? "bg-rose-950/20 border-rose-900/50 text-rose-200"
                            : hasDiscrepancy && !trace.discrepancyReport?.isBenign
                            ? "bg-amber-950/20 border-amber-900/50 text-amber-200"
                            : "bg-[#0E0B07] border-[#1F180D] text-[#CCC]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-[#666] text-[10px]">#{trace.seq} {trace.timestamp}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-950/80 border border-blue-800 text-blue-300">
                              {trace.operation}
                            </span>
                            <span className="text-[10px] font-semibold text-white">
                              {trace.prevCount} ➔ {trace.nextCount} ({trace.delta >= 0 ? `+${trace.delta}` : trace.delta})
                            </span>
                          </div>

                          {trace.remoteCount !== undefined && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                              Firestore Remoto: {trace.remoteCount}
                            </span>
                          )}
                        </div>

                        {/* Warnings if any */}
                        {trace.staleWarnings.length > 0 && (
                          <div className="space-y-1 mt-1 p-2 rounded bg-rose-950/40 border border-rose-800/40">
                            {trace.staleWarnings.map((w, wIdx) => (
                              <div key={wIdx} className="flex items-start gap-1.5 text-rose-300 text-[10px]">
                                <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                                <span><strong>[{w.type}]</strong> {w.message}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Discrepancy Note */}
                        {trace.discrepancyReport && trace.discrepancyReport.hasDiscrepancy && (
                          <div className="p-1.5 rounded bg-amber-950/30 border border-amber-800/30 text-amber-300 text-[10px] flex items-center justify-between">
                            <span>
                              Discrepanza: Firestore {trace.discrepancyReport.remoteCount} vs Locale {trace.discrepancyReport.localCountAfter} (Diff: {trace.discrepancyReport.diff > 0 ? "+" : ""}{trace.discrepancyReport.diff})
                            </span>
                            <span className="text-[9px] opacity-75">{trace.discrepancyReport.explanation}</span>
                          </div>
                        )}

                        {/* Diff summary */}
                        {(trace.addedIds.length > 0 || trace.removedIds.length > 0) && (
                          <div className="text-[10px] text-[#777] flex items-center gap-3">
                            {trace.addedIds.length > 0 && (
                              <span className="text-emerald-400">+{trace.addedIds.length} nuovi</span>
                            )}
                            {trace.removedIds.length > 0 && (
                              <span className="text-rose-400">-{trace.removedIds.length} rimossi</span>
                            )}
                            {trace.modifiedIds.length > 0 && (
                              <span className="text-amber-400">~{trace.modifiedIds.length} aggiornati</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Quick Troubleshooting & Actions */}
          <div className="p-3.5 rounded-xl bg-[#110E09] border border-[#22180B] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[#AAA]">
              <span>Sospetti che manchino risorse fisiche dal database?</span>
            </div>
            <div className="flex items-center gap-2">
              {onOpenVaultHealthCheck && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenVaultHealthCheck();
                  }}
                  className="px-2.5 py-1 rounded bg-[#20180B] hover:bg-[#2A200F] border border-[#C5A059]/60 text-[#E5C170] text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Activity className="w-3 h-3 text-[#C5A059]" />
                  <span>Vault Health Check (Firestore Raw)</span>
                </button>
              )}
              {onOpenRecoveryModal && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenRecoveryModal();
                  }}
                  className="px-2.5 py-1 rounded bg-[#1C160B] hover:bg-[#251D0F] border border-[#C5A059]/40 text-[#E5C170] text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-[#C5A059]" />
                  <span>Scansione Profonda Storage (Recovery)</span>
                </button>
              )}
              {onOpenDiagnostic && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenDiagnostic();
                  }}
                  className="px-2.5 py-1 rounded bg-[#151515] hover:bg-[#202020] border border-[#333] text-[#CCC] text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Terminal className="w-3 h-3 text-cyan-400" />
                  <span>Console Diagnostica Completa</span>
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1E190F] bg-[#0E0B07] flex items-center justify-between text-xs text-[#777]">
          <span>Audit Tracciabilità OKF v0.2 conforme allo Standard Cekikj</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1F190E] hover:bg-[#2B2313] border border-[#332612] text-white font-medium transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
