/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { 
  X, 
  Activity, 
  RefreshCw, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Database, 
  Layers, 
  ShieldCheck, 
  Clock, 
  ExternalLink, 
  ArrowRight,
  ChevronRight,
  Server,
  HardDrive,
  Cpu,
  FileCheck2,
  ListTree
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ResourceItem, VaultHealthCheckReport } from "../types";
import { User } from "../lib/firebase";
import { runVaultHealthCheck } from "../lib/vaultHealthChecker";

export interface VaultHealthCheckDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  resources: ResourceItem[];
  user: User | null;
  quotaExceeded?: boolean;
  onTriggerSync?: () => void;
  onOpenDiscrepancyInspector?: () => void;
  onNotification?: (type: "success" | "error" | "info", msg: string) => void;
}

export const VaultHealthCheckDrawer: React.FC<VaultHealthCheckDrawerProps> = ({
  isOpen,
  onClose,
  resources,
  user,
  quotaExceeded = false,
  onTriggerSync,
  onOpenDiscrepancyInspector,
  onNotification,
}) => {
  const [report, setReport] = useState<VaultHealthCheckReport | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"types" | "orphans" | "okf" | "query">("types");
  const [copied, setCopied] = useState<boolean>(false);
  const [filterOrphans, setFilterOrphans] = useState<"all" | "local_only" | "firestore_only">("all");

  const executeHealthCheck = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await runVaultHealthCheck(resources, user);
      setReport(result);
    } catch (err: any) {
      console.error("[VaultHealthCheckDrawer] Errore esecuzione check:", err);
      if (onNotification) {
        onNotification("error", `Errore durante il Vault Health Check: ${err?.message || "Connessione fallita"}`);
      }
    } finally {
      setIsRunning(false);
    }
  }, [resources, user, onNotification]);

  // Esegue il check ogni volta che il drawer viene aperto
  useEffect(() => {
    if (isOpen) {
      executeHealthCheck();
    }
  }, [isOpen, executeHealthCheck]);

  // Gestione tasto ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    if (onNotification) {
      onNotification("success", "Report di salute copiato negli appunti in formato JSON");
    }
    setTimeout(() => setCopied(false), 2500);
  };

  const getStatusBadge = () => {
    if (isRunning) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-[#1C160C] text-[#C5A059] border border-[#3E3017]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Analisi in corso...</span>
        </span>
      );
    }

    if (!report) return null;

    switch (report.healthStatus) {
      case "HEALTHY":
        return (
          <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Sincronia Ottimale (0 Mismatch)</span>
          </span>
        );
      case "DESYNCHRONIZED":
        return (
          <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-amber-950/70 text-amber-400 border border-amber-800/60 shadow-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Discrepanza Rilevata ({report.overallComparison.delta > 0 ? `+${report.overallComparison.delta} Locali` : `${report.overallComparison.delta} Cloud`})</span>
          </span>
        );
      case "OFFLINE_CACHE":
        return (
          <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-sky-950/70 text-sky-400 border border-sky-800/60 shadow-xs">
            <Database className="w-3.5 h-3.5" />
            <span>Memoria Locale / Quota Bloccata</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full bg-rose-950/70 text-rose-400 border border-rose-800/60 shadow-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Errore Connessione Firestore</span>
          </span>
        );
    }
  };

  const filteredOrphans = report?.orphanResources.filter((item) => {
    if (filterOrphans === "all") return true;
    return item.location === filterOrphans;
  }) || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs font-sans overflow-hidden"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="w-full max-w-2xl h-full bg-[#0C0B08] border-l border-[#2D2413] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Drawer */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E190F] bg-[#141009]/95 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/20 text-[#D5B069] shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-white tracking-wide">
                      Vault Health Check
                    </h2>
                    {getStatusBadge()}
                  </div>
                  <p className="text-xs text-[#888] truncate mt-0.5">
                    Confronto profondo tra memoria locale e query raw Firestore
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={executeHealthCheck}
                  disabled={isRunning}
                  className="p-1.5 rounded-lg text-xs font-mono bg-[#16130D] border border-[#2D2413] text-[#CCC] hover:text-white hover:border-[#C5A059]/40 disabled:opacity-50 transition-all"
                  title="Riesegui Vault Health Check"
                >
                  <RefreshCw className={`w-4 h-4 ${isRunning ? "animate-spin text-[#C5A059]" : ""}`} />
                </button>

                <button
                  onClick={handleCopyReport}
                  disabled={!report}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#16130D] border border-[#2D2413] text-[#CCC] hover:text-white hover:border-[#C5A059]/40 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="Copia Report Diagnostico JSON"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#888]" />}
                  <span className="hidden sm:inline">{copied ? "Copiato" : "Copia Report"}</span>
                </button>

                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-[#888] hover:text-white hover:bg-[#1E190F] transition-colors"
                  aria-label="Chiudi"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenuto Scrollabile */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
              {/* Schede Metriche Primarie a Confronto */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Memoria Locale */}
                <div className="bg-[#141009] border border-[#2D2413] rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#888] mb-1">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-[#38BDF8]" />
                      Locale
                    </span>
                    <span className="text-[10px] text-[#555]">Memoria</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {report ? report.overallComparison.localCount : resources.length}
                  </div>
                  <div className="text-[10px] text-[#777] mt-1 flex items-center justify-between">
                    <span>Utente: {report?.userOwnedComparison.localCount ?? 0}</span>
                    <span>Demo: {report?.systemSampleComparison.localCount ?? 0}</span>
                  </div>
                </div>

                {/* 2. Firestore Raw Query */}
                <div className="bg-[#141009] border border-[#2D2413] rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#888] mb-1">
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3 text-[#C5A059]" />
                      Firestore
                    </span>
                    <span className="text-[10px] text-[#555]">Query Raw</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-[#E5C170]">
                    {isRunning ? (
                      <span className="text-xs text-[#888] animate-pulse font-sans">Caricamento...</span>
                    ) : (
                      report?.overallComparison.firestoreCount ?? 0
                    )}
                  </div>
                  <div className="text-[10px] text-[#777] mt-1 truncate">
                    {report?.firestoreQueryDetails.filterApplied ? "where(userId == ...)" : "Senza filtri"}
                  </div>
                </div>

                {/* 3. Delta Netto */}
                <div className={`border rounded-xl p-3.5 ${
                  !report || report.overallComparison.delta === 0
                    ? "bg-[#141009] border-[#2D2413]"
                    : "bg-[#1C1408] border-[#C5A059]/40"
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#888] mb-1">
                    <span>Delta Netto</span>
                    <span className="text-[10px] text-[#555]">Diff</span>
                  </div>
                  <div className={`text-2xl font-bold font-mono ${
                    !report || report.overallComparison.delta === 0
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}>
                    {report ? (
                      report.overallComparison.delta > 0 
                        ? `+${report.overallComparison.delta}` 
                        : report.overallComparison.delta
                    ) : "0"}
                  </div>
                  <div className="text-[10px] text-[#777] mt-1">
                    {report?.overallComparison.status === "synced"
                      ? "Perfettamente allineato"
                      : report?.overallComparison.status === "local_excess"
                      ? "Elementi locali non salvati"
                      : "Elementi cloud non caricati"}
                  </div>
                </div>

                {/* 4. Latenza & Stato Connessione */}
                <div className="bg-[#141009] border border-[#2D2413] rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#888] mb-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#A78BFA]" />
                      Latenza
                    </span>
                    <span className="text-[10px] text-[#555]">Query</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {report ? `${report.executionDurationMs}ms` : "—"}
                  </div>
                  <div className="text-[10px] text-[#777] mt-1 truncate">
                    {quotaExceeded ? "Quota 429 Bloccata" : "Rete Cloud Attiva"}
                  </div>
                </div>
              </div>

              {/* Selettore Tab di Dettaglio */}
              <div className="flex items-center gap-1 border-b border-[#1E190F] pb-2 text-xs font-mono">
                <button
                  onClick={() => setActiveTab("types")}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === "types"
                      ? "bg-[#241C0E] text-[#E5C170] border border-[#C5A059]/40 font-medium"
                      : "text-[#888] hover:text-[#DDD] hover:bg-[#141009]"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Breakdown per Tipo</span>
                  {report && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 text-[#AAA]">
                      {report.typeBreakdown.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("orphans")}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === "orphans"
                      ? "bg-[#241C0E] text-[#E5C170] border border-[#C5A059]/40 font-medium"
                      : "text-[#888] hover:text-[#DDD] hover:bg-[#141009]"
                  }`}
                >
                  <ListTree className="w-3.5 h-3.5" />
                  <span>Documenti Orfani</span>
                  {report && report.orphanResources.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800/60 font-semibold">
                      {report.orphanResources.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("okf")}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === "okf"
                      ? "bg-[#241C0E] text-[#E5C170] border border-[#C5A059]/40 font-medium"
                      : "text-[#888] hover:text-[#DDD] hover:bg-[#141009]"
                  }`}
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Integrità OKF v0.2</span>
                </button>

                <button
                  onClick={() => setActiveTab("query")}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === "query"
                      ? "bg-[#241C0E] text-[#E5C170] border border-[#C5A059]/40 font-medium"
                      : "text-[#888] hover:text-[#DDD] hover:bg-[#141009]"
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>Dettagli Query</span>
                </button>
              </div>

              {/* Tab 1: Confronto Profondo per Tipo (Deep Comparison Table) */}
              {activeTab === "types" && (
                <div className="space-y-3 animate-fade-in">
                  <div className="bg-[#141009] border border-[#2D2413] rounded-xl overflow-hidden">
                    <div className="grid grid-cols-12 px-4 py-2.5 bg-[#1C160C] text-[11px] font-mono text-[#888] border-b border-[#2D2413]">
                      <div className="col-span-6">Tipologia Risorsa</div>
                      <div className="col-span-2 text-center">Locale</div>
                      <div className="col-span-2 text-center">Firestore</div>
                      <div className="col-span-2 text-right">Stato Delta</div>
                    </div>

                    <div className="divide-y divide-[#1A150D]">
                      {report?.typeBreakdown.map((item) => (
                        <div 
                          key={item.type}
                          className="grid grid-cols-12 px-4 py-3 items-center hover:bg-[#18130B] transition-colors text-xs"
                        >
                          <div className="col-span-6 flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#20180B] text-[#C5A059] border border-[#3A2B14] shrink-0">
                              {item.type}
                            </span>
                            <span className="text-[#DDD] font-medium truncate">
                              {item.label}
                            </span>
                          </div>

                          <div className="col-span-2 text-center font-mono font-medium text-white">
                            {item.localCount}
                          </div>

                          <div className="col-span-2 text-center font-mono font-medium text-[#E5C170]">
                            {item.firestoreCount}
                          </div>

                          <div className="col-span-2 flex items-center justify-end font-mono">
                            {item.match ? (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                                <CheckCircle2 className="w-3 h-3" /> Allineato
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 font-semibold">
                                {item.delta > 0 ? `+${item.delta} loc` : `${item.delta} cld`}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-[#777] px-1 flex items-center justify-between">
                    <span>Totale categorie monitorate: 10 tipologie ontologiche</span>
                    <span>Algoritmo di confronto: Deep Map ID & Key Count</span>
                  </div>
                </div>
              )}

              {/* Tab 2: Documenti Orfani e Discrepanze a Livello ID */}
              {activeTab === "orphans" && (
                <div className="space-y-3 animate-fade-in">
                  {/* Filtri Orfani */}
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-[#888]">
                      Mostrando {filteredOrphans.length} discrepanze di ID
                    </div>
                    <div className="flex items-center gap-1 bg-[#141009] p-0.5 rounded-lg border border-[#2D2413] text-[11px] font-mono">
                      <button
                        onClick={() => setFilterOrphans("all")}
                        className={`px-2 py-0.5 rounded ${filterOrphans === "all" ? "bg-[#241C0E] text-[#E5C170]" : "text-[#777]"}`}
                      >
                        Tutti ({report?.orphanResources.length || 0})
                      </button>
                      <button
                        onClick={() => setFilterOrphans("local_only")}
                        className={`px-2 py-0.5 rounded ${filterOrphans === "local_only" ? "bg-[#241C0E] text-[#E5C170]" : "text-[#777]"}`}
                      >
                        Solo Locali
                      </button>
                      <button
                        onClick={() => setFilterOrphans("firestore_only")}
                        className={`px-2 py-0.5 rounded ${filterOrphans === "firestore_only" ? "bg-[#241C0E] text-[#E5C170]" : "text-[#777]"}`}
                      >
                        Solo Cloud
                      </button>
                    </div>
                  </div>

                  {filteredOrphans.length === 0 ? (
                    <div className="p-8 text-center bg-[#141009] border border-[#2D2413] rounded-xl">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <h4 className="text-sm font-semibold text-white">Nessuna Discrepanza Rilevata</h4>
                      <p className="text-xs text-[#888] mt-1 max-w-md mx-auto">
                        Tutti gli ID in memoria locale corrispondono esattamente ai record restituiti dalla query Firestore.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredOrphans.map((orphan) => (
                        <div 
                          key={`${orphan.location}-${orphan.id}`}
                          className="bg-[#141009] border border-[#2D2413] hover:border-[#3E3017] rounded-xl p-3 flex items-start justify-between gap-3 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                orphan.location === "local_only"
                                  ? "bg-amber-950/60 text-amber-300 border-amber-800/50"
                                  : "bg-sky-950/60 text-sky-300 border-sky-800/50"
                              }`}>
                                {orphan.location === "local_only" ? "Solo Memoria Locale" : "Solo Firestore Cloud"}
                              </span>
                              <span className="text-[10px] font-mono text-[#666]">
                                Tipo: {orphan.type}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold text-white truncate">
                              {orphan.title}
                            </h4>
                            <p className="text-[11px] text-[#888] mt-0.5">
                              {orphan.reason}
                            </p>
                            <p className="text-[10px] font-mono text-[#555] mt-1 truncate">
                              ID: {orphan.id}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Integrità OKF v0.2 & Classificazione Web Links */}
              {activeTab === "okf" && (
                <div className="space-y-4 animate-fade-in">
                  <div className="bg-[#141009] border border-[#2D2413] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white flex items-center gap-2">
                        <FileCheck2 className="w-4 h-4 text-[#C5A059]" />
                        Stato Conformità Standard OKF v0.2
                      </span>
                      <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${
                        report?.okfIntegrity.status === "pass"
                          ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                          : "bg-amber-950/60 text-amber-400 border-amber-800/50"
                      }`}>
                        {report?.okfIntegrity.status === "pass" ? "OKF Conforme" : "Avviso Rilevato"}
                      </span>
                    </div>

                    <p className="text-xs text-[#AAA]">
                      {report?.okfIntegrity.notes}
                    </p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="p-3 bg-[#1C160C] rounded-lg border border-[#2D2413]">
                        <div className="text-[10px] font-mono text-[#888]">Doc OKF in Memoria Locale</div>
                        <div className="text-lg font-bold font-mono text-white mt-0.5">
                          {report?.okfIntegrity.localOkfCount ?? 0}
                        </div>
                      </div>

                      <div className="p-3 bg-[#1C160C] rounded-lg border border-[#2D2413]">
                        <div className="text-[10px] font-mono text-[#888]">Doc OKF su Firestore</div>
                        <div className="text-lg font-bold font-mono text-[#E5C170] mt-0.5">
                          {report?.okfIntegrity.firestoreOkfCount ?? 0}
                        </div>
                      </div>
                    </div>

                    {/* Web Link Guard Status */}
                    <div className="p-3 bg-[#100D08] rounded-lg border border-[#251D10] text-xs space-y-1">
                      <div className="font-semibold text-[#DDD] flex items-center justify-between">
                        <span>Web-Links Guard (Due Fasi di Validazione)</span>
                        <span className="text-emerald-400 font-mono text-[11px]">
                          {report?.okfIntegrity.webLinksAsOkfCount === 0 ? "Protetto (0 Anomalie)" : "Anomalie Rilevate"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#777]">
                        Impedisce ai collegamenti web URL di essere impropriamente marchiati con lo schema di documento tecnico OKF v0.2.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Dettagli Tecnici Query Firestore */}
              {activeTab === "query" && (
                <div className="space-y-3 animate-fade-in text-xs font-mono">
                  <div className="bg-[#141009] border border-[#2D2413] rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-[#888]">
                      <span>Collezione Firestore Target:</span>
                      <span className="text-white">{report?.firestoreQueryDetails.collection || "resources"}</span>
                    </div>

                    <div className="flex items-center justify-between text-[#888]">
                      <span>Filtro Applicato:</span>
                      <span className="text-[#C5A059]">{report?.firestoreQueryDetails.filterApplied}</span>
                    </div>

                    <div className="flex items-center justify-between text-[#888]">
                      <span>Record Restituiti (Raw getDocs):</span>
                      <span className="text-white">{report?.firestoreQueryDetails.rawDocsFetched ?? 0}</span>
                    </div>

                    <div className="flex items-center justify-between text-[#888]">
                      <span>Conteggio Server (getCountFromServer):</span>
                      <span className="text-white">
                        {report?.firestoreQueryDetails.serverCountResult !== undefined 
                          ? report.firestoreQueryDetails.serverCountResult 
                          : "Non supportato / Fallback getDocs"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[#888]">
                      <span>User ID Attivo:</span>
                      <span className="text-[#AAA] truncate max-w-[280px]">
                        {user ? user.uid : "Nessuno (Sessione Anonima/Locale)"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[#888]">
                      <span>Timestamp Esecuzione:</span>
                      <span className="text-[#AAA]">{report?.timestamp || "—"}</span>
                    </div>
                  </div>

                  {/* Raw Report Preview */}
                  <div className="bg-[#100D08] border border-[#251D10] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-[#888]">JSON Diagnostic Report Snapshot:</span>
                      <button
                        onClick={handleCopyReport}
                        className="text-[11px] text-[#C5A059] hover:text-white flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copia JSON
                      </button>
                    </div>
                    <pre className="text-[10px] text-[#888] bg-[#080705] p-2.5 rounded-lg overflow-x-auto max-h-48 custom-scrollbar">
                      {JSON.stringify(report, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer con Azioni */}
            <div className="px-5 py-3.5 border-t border-[#1E190F] bg-[#141009] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                {onOpenDiscrepancyInspector && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenDiscrepancyInspector();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1C160C] border border-[#3E3017] text-[#CCC] hover:text-white hover:border-[#C5A059]/50 transition-colors flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span>Audit Ciclo di Vita</span>
                  </button>
                )}

                {onTriggerSync && (
                  <button
                    onClick={() => {
                      onTriggerSync();
                      setTimeout(() => executeHealthCheck(), 1000);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#241C0E] border border-[#C5A059]/40 text-[#E5C170] hover:text-white hover:bg-[#322510] transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Allinea Memoria Locale</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={executeHealthCheck}
                  disabled={isRunning}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#C5A059] hover:bg-[#D5B069] text-black transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? "animate-spin" : ""}`} />
                  <span>Rianalizza Vault</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
