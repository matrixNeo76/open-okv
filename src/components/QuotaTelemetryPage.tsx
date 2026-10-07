import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  Database,
  Cpu,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Zap,
  HelpCircle,
  HardDrive,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  Search,
  ArrowRight,
  Unlock,
  Radio,
  BarChart3,
  Server,
  PlayCircle,
  Globe,
  Gauge
} from "lucide-react";
import {
  getFirestoreDailyStats,
  subscribeToTelemetry,
  getStoredEvents,
  clearTelemetryEvents,
  testFirestoreLiveConnectivity,
  testGeminiLiveConnectivity,
  testFullStackConnectivity,
  resetLocalQuotaLock,
  fetchGeminiTelemetry,
  FIRESTORE_DAILY_READ_LIMIT,
  FIRESTORE_DAILY_WRITE_LIMIT,
  FIRESTORE_DAILY_DELETE_LIMIT,
  GEMINI_DAILY_REQUEST_LIMIT,
  GEMINI_RPM_LIMIT,
  GEMINI_TPM_LIMIT,
} from "../lib/quotaTelemetry";
import { getFirebaseQuotaResetInfo } from "../lib/cacheManager";
import { FirestoreDailyStats, GeminiDailyStats, QuotaTelemetryEvent } from "../types";
import { LogActionResolver } from "./LogActionResolver";

interface QuotaTelemetryPageProps {
  quotaExceeded: boolean;
  onRefreshOnlineStatus: () => void;
  onBackToVault: () => void;
}

export const QuotaTelemetryPage: React.FC<QuotaTelemetryPageProps> = ({
  quotaExceeded,
  onRefreshOnlineStatus,
  onBackToVault,
}) => {
  // Live State
  const [firestoreStats, setFirestoreStats] = useState<FirestoreDailyStats>(getFirestoreDailyStats());
  const [geminiStats, setGeminiStats] = useState<GeminiDailyStats | null>(null);
  const [events, setEvents] = useState<QuotaTelemetryEvent[]>(getStoredEvents());
  const [quotaCountdown, setQuotaCountdown] = useState(getFirebaseQuotaResetInfo());
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Test Ping States
  const [isTestingFirestore, setIsTestingFirestore] = useState(false);
  const [firestoreTestResult, setFirestoreTestResult] = useState<{
    isOnline: boolean;
    isQuotaExhausted: boolean;
    latencyMs: number;
    message: string;
    errorCode?: string;
  } | null>(null);

  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    modelUsed?: string;
    message: string;
    isRateLimited?: boolean;
  } | null>(null);

  const [isTestingFullStack, setIsTestingFullStack] = useState(false);
  const [isResettingLock, setIsResettingLock] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [simulationActive, setSimulationActive] = useState(false);

  // Filters for Audit Log
  const [serviceFilter, setServiceFilter] = useState<"ALL" | "FIRESTORE" | "GEMINI">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ERROR" | "SUCCESS">("ALL");
  const [searchLogQuery, setSearchLogQuery] = useState("");
  const [isExplainerOpen, setIsExplainerOpen] = useState(true);

  // Function to refresh Gemini stats
  const refreshBackendStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const data = await fetchGeminiTelemetry();
      if (data) setGeminiStats(data);
    } catch (e) {
      console.warn("Telemetry backend fetch warning:", e);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Subscribe to live telemetry updates
  useEffect(() => {
    const unsub = subscribeToTelemetry(() => {
      setFirestoreStats(getFirestoreDailyStats());
      setEvents(getStoredEvents());
    });

    const timer = setInterval(() => {
      setQuotaCountdown(getFirebaseQuotaResetInfo());
    }, 1000);

    refreshBackendStats();
    const geminiTimer = setInterval(refreshBackendStats, 15000);

    const handleFocus = () => {
      refreshBackendStats();
      setFirestoreStats(getFirestoreDailyStats());
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      unsub();
      clearInterval(timer);
      clearInterval(geminiTimer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshBackendStats]);

  // Handler: Live Ping Test for Firestore
  const handleTestFirestore = async () => {
    setIsTestingFirestore(true);
    setFirestoreTestResult(null);
    try {
      const res = await testFirestoreLiveConnectivity();
      setFirestoreTestResult(res);
      if (res.isOnline && !res.isQuotaExhausted) {
        onRefreshOnlineStatus();
      }
    } catch (err: any) {
      setFirestoreTestResult({
        isOnline: false,
        isQuotaExhausted: false,
        latencyMs: 0,
        message: `Errore imprevisto durante il test: ${err?.message || err}`,
      });
    } finally {
      setIsTestingFirestore(false);
    }
  };

  // Handler: Live Ping Test for Gemini
  const handleTestGemini = async () => {
    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const res = await testGeminiLiveConnectivity();
      setGeminiTestResult(res);
      refreshBackendStats();
    } catch (err: any) {
      setGeminiTestResult({
        success: false,
        latencyMs: 0,
        message: `Errore test Gemini: ${err?.message || err}`,
      });
    } finally {
      setIsTestingGemini(false);
    }
  };

  // Handler: Global Full-Stack Test (Firestore + Gemini in parallel)
  const handleTestFullStack = async () => {
    setIsTestingFullStack(true);
    setFirestoreTestResult(null);
    setGeminiTestResult(null);
    try {
      const results = await testFullStackConnectivity();
      setFirestoreTestResult(results.firestore);
      setGeminiTestResult(results.gemini);
      if (results.firestore.isOnline && !results.firestore.isQuotaExhausted) {
        onRefreshOnlineStatus();
      }
      refreshBackendStats();
    } catch (err: any) {
      console.error("Full-stack test error:", err);
    } finally {
      setIsTestingFullStack(false);
    }
  };

  // Handler: Reset Local Offline Lock & Re-enable Network
  const handleResetLock = async () => {
    setIsResettingLock(true);
    setResetMessage(null);
    try {
      const res = await resetLocalQuotaLock();
      setResetMessage(res.message);
      onRefreshOnlineStatus();
      setTimeout(() => setResetMessage(null), 5000);
    } finally {
      setIsResettingLock(false);
    }
  };

  // Handler: Export Telemetry Logs as JSON
  const handleExportLogs = () => {
    const report = {
      exportedAt: new Date().toISOString(),
      quotaCountdown: {
        countdown: quotaCountdown.formattedCountdown,
        pacificTime: quotaCountdown.pacificTimeString,
        nextResetDate: quotaCountdown.resetDate.toISOString(),
      },
      firestoreStats,
      geminiStats,
      diagnosticPingResults: {
        firestore: firestoreTestResult,
        gemini: geminiTestResult,
      },
      events,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `knowledge-vault-telemetry-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (serviceFilter !== "ALL" && ev.service !== serviceFilter) return false;
      if (statusFilter === "ERROR" && ev.status === "SUCCESS") return false;
      if (statusFilter === "SUCCESS" && ev.status !== "SUCCESS") return false;
      if (searchLogQuery) {
        const q = searchLogQuery.toLowerCase();
        const match =
          ev.caller.toLowerCase().includes(q) ||
          ev.operation.toLowerCase().includes(q) ||
          (ev.details && ev.details.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [events, serviceFilter, statusFilter, searchLogQuery]);

  // Calculations for Percentages
  const readsPercent = Math.min(100, Math.round((firestoreStats.reads / FIRESTORE_DAILY_READ_LIMIT) * 100));
  const writesPercent = Math.min(100, Math.round((firestoreStats.writes / FIRESTORE_DAILY_WRITE_LIMIT) * 100));
  const deletesPercent = Math.min(100, Math.round((firestoreStats.deletes / FIRESTORE_DAILY_DELETE_LIMIT) * 100));

  const geminiRpmPercent = geminiStats
    ? Math.min(100, Math.round((geminiStats.requestsLastMinute / GEMINI_RPM_LIMIT) * 100))
    : 0;
  const geminiDailyPercent = geminiStats
    ? Math.min(100, Math.round((geminiStats.requestsToday / GEMINI_DAILY_REQUEST_LIMIT) * 100))
    : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0A0A0A] text-[#E0E0E0] overflow-y-auto font-sans">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="border-b border-[#1E1E1E] bg-[#0E0E0E] px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20 backdrop-blur-md bg-opacity-95">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToVault}
            className="flex items-center gap-1.5 text-xs text-[#888] hover:text-[#C5A059] px-2.5 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1A1A1A] border border-[#222] transition-colors cursor-pointer"
          >
            <span>&larr; Torna al Vault</span>
          </button>
          <div className="h-4 w-[1px] bg-[#222]" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#C5A059]/10 border border-[#C5A059]/30 text-[#C5A059]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight flex items-center gap-2">
                Centro di Controllo Quote & Telemetria
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#181818] border border-[#282828] text-[#888]">
                  Gemini + Firestore
                </span>
              </h1>
            </div>
          </div>
        </div>

        {/* Action Buttons: Ping Tests & Reset Lock */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleTestFullStack}
            disabled={isTestingFullStack}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Esegue un test parallelo simultaneo su Firestore e Gemini AI"
          >
            <Radio className={`w-3.5 h-3.5 ${isTestingFullStack ? "animate-pulse" : ""}`} />
            <span>{isTestingFullStack ? "Diagnosi in corso..." : "Diagnosi Completa"}</span>
          </button>

          <button
            onClick={handleResetLock}
            disabled={isResettingLock}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-700/40 text-emerald-300 font-medium transition-colors cursor-pointer"
            title="Azzera il flag di blocco memorizzato in locale e riattiva immediatamente la rete Firestore"
          >
            <Unlock className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isResettingLock ? "Sblocco in corso..." : "Azzera Blocco Locale"}</span>
          </button>

          <button
            onClick={refreshBackendStats}
            disabled={isLoadingStats}
            className="p-1.5 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] border border-[#262626] text-[#BBB] hover:text-white transition-colors cursor-pointer"
            title="Ricarica telemetria dal backend Express"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? "animate-spin text-[#C5A059]" : ""}`} />
          </button>

          <button
            onClick={handleExportLogs}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] border border-[#262626] text-[#BBB] hover:text-white transition-colors cursor-pointer"
            title="Esporta l'intero log e i contatori diagnostici in formato JSON"
          >
            <Download className="w-3.5 h-3.5 text-[#888]" />
            <span className="hidden sm:inline">Esporta Report</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Reset Feedback Notification */}
        {resetMessage && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-600/50 text-emerald-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{resetMessage}</span>
            </div>
            <button onClick={() => setResetMessage(null)} className="text-emerald-400 hover:underline text-[11px] cursor-pointer">
              Chiudi
            </button>
          </div>
        )}

        {/* Global Live Status Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Firestore Cloud Status Card */}
          <div className={`p-4 rounded-xl border flex flex-col justify-between ${
            quotaExceeded
              ? "bg-amber-950/20 border-amber-700/40"
              : "bg-[#111] border-[#222]"
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${
                  quotaExceeded ? "bg-amber-900/40 text-amber-300" : "bg-emerald-950/50 text-emerald-400 border border-emerald-800/40"
                }`}>
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-mono text-[#888] uppercase tracking-wider">Stato Firestore</div>
                  <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                    {quotaExceeded ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Bloccato / Offline Shield
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Operativo & Connesso
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[#1C1C1C] text-[11px] text-[#777] flex items-center justify-between">
              <span>Piano: <strong>Firebase Spark (Free)</strong></span>
              <span className="text-[#C5A059] font-mono">50k letture/dì</span>
            </div>
          </div>

          {/* 2. Gemini AI Status Card */}
          <div className="p-4 rounded-xl border bg-[#111] border-[#222] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/30">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-mono text-[#888] uppercase tracking-wider">Stato Gemini AI</div>
                  <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                    {geminiStats?.status === "RATE_LIMITED" ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Rate Limit 15 RPM Raggiunto
                      </span>
                    ) : geminiStats?.status === "EXHAUSTED" ? (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Quota 1.500 RPD Esaurita
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Operativo (3 Modelli)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[#1C1C1C] text-[11px] text-[#777] flex items-center justify-between">
              <span>Rate Limit: <strong>15 req/min (RPM)</strong></span>
              <span className="text-[#C5A059] font-mono">1.500 req/dì</span>
            </div>
          </div>

          {/* 3. Daily Reset Countdown Card */}
          <div className="p-4 rounded-xl border bg-[#111] border-[#222] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-950/40 text-blue-400 border border-blue-800/40">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-mono text-[#888] uppercase tracking-wider">Reset Quota Google Cloud</div>
                  <div className="text-base font-mono font-bold text-[#E5C170] tracking-tight">
                    {quotaCountdown.formattedCountdown}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[#1C1C1C] text-[11px] text-[#777] flex items-center justify-between">
              <span>Ora Pacifico: <strong>{quotaCountdown.pacificTimeString}</strong></span>
              <span className="font-mono text-[#AAA]">Reset alle 00:00 PT</span>
            </div>
          </div>
        </div>

        {/* Interactive Explainer Accordion: "Perchè ho sempre la quota di firestore finita?" */}
        <div className="rounded-xl border border-[#2B2415] bg-[#14120B] p-5">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setIsExplainerOpen(!isExplainerOpen)}
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-[#C5A059]/20 text-[#C5A059]">
                <HelpCircle className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-[#F2DA9D]">
                Perchè leggo "22h prima di poterla riutilizzare" e come si sbloccano le quote?
              </h2>
            </div>
            {isExplainerOpen ? <ChevronUp className="w-4 h-4 text-[#888]" /> : <ChevronDown className="w-4 h-4 text-[#888]" />}
          </div>

          {isExplainerOpen && (
            <div className="mt-4 pt-4 border-t border-[#262013] grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#CCC] leading-relaxed">
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[#0F0D07] border border-[#2B2312]">
                  <div className="font-semibold text-[#E5C170] flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-[#C5A059]" />
                    1. Il Ciclo Globale delle 24 Ore (00:00 US Pacific Time)
                  </div>
                  <p className="text-[#AAA] text-[11px]">
                    I server Google Cloud e Firebase Firestore nel piano gratuito <em>Spark</em> resettano le quote di utilizzo (50.000 letture/giorno e 20.000 scritture/giorno) una sola volta al giorno, precisamente alla <strong>mezzanotte solare di Mountain View / California (00:00 PST/PDT)</strong>. Se una quota viene saturata la mattina presto, il timer indicherà naturalmente ~22-23 ore rimanenti fino al prossimo ciclo.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0F0D07] border border-[#2B2312]">
                  <div className="font-semibold text-[#E5C170] flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    2. La Trappola dei "Falsi Positivi" da Timeout di Rete
                  </div>
                  <p className="text-[#AAA] text-[11px]">
                    Spesso la quota reale di Google <strong>NON è esaurita</strong>: nei container di sviluppo possono verificarsi brevi ritardi di rete (timeout &gt; 3.5s). In precedenza, il sistema scambiava qualsiasi timeout per quota esaurita e salvava una variabile permanente nel browser (<code className="text-[#E5C170]">KV_QUOTA_EXCEEDED_FLAG</code>), bloccando l'app in offline continuo! Cliccando su <strong>"Azzera Blocco Locale"</strong> o eseguendo il <strong>"Ping Live"</strong> sottostante puoi verificare se Firestore risponde e sbloccarlo all'istante.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[#0F0D07] border border-[#2B2312]">
                  <div className="font-semibold text-[#E5C170] flex items-center gap-1.5 mb-1">
                    <Cpu className="w-3.5 h-3.5 text-[#C5A059]" />
                    3. La Differenza tra Limiti Gemini AI e Firestore
                  </div>
                  <p className="text-[#AAA] text-[11px]">
                    È fondamentale distinguere i due motori:
                    <br />&bull; <strong>Gemini AI</strong>: blocca le richieste quando si superano le <strong>15 chiamate al minuto</strong> (errore 429). Il blocco di Gemini dura <strong>solo 60 secondi</strong>, non 24 ore!
                    <br />&bull; <strong>Firestore</strong>: gestisce il database documentale (limite di 50.000 letture su 24 ore). Quando Gemini è sovraccarico, il database Firestore funziona comunque regolarmente, e viceversa.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0F0D07] border border-[#2B2312]">
                  <div className="font-semibold text-[#E5C170] flex items-center gap-1.5 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    4. Nessuna Perdita Dati: Persistenza Multi-Livello
                  </div>
                  <p className="text-[#AAA] text-[11px]">
                    Anche nel caso in cui la quota Firestore sia effettivamente al 100% per tutta la giornata, il Knowledge Vault ha attivato automaticamente la <strong>Persistenza Continua Multi-Livello</strong>: tutte le tue risorse, note, tag e modifiche vengono salvate in tempo reale sul disco del server backend (<code className="text-emerald-400">/api/vault/backup</code>) e nel database IndexedDB del browser, permettendoti di continuare a lavorare senza interruzioni.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live Connectivity Diagnostics Box */}
        <div className="rounded-xl border border-[#222] bg-[#111] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#C5A059]" />
                Verifica Live della Connettività e della Quota Effettiva
              </h2>
              <p className="text-xs text-[#777] mt-0.5">
                Esegui una chiamata ping in tempo reale per scoprire se i server Google rispondono o se la quota è realmente bloccata.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleTestFirestore}
                disabled={isTestingFirestore || isTestingFullStack}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#333] text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#C5A059] ${isTestingFirestore ? "animate-spin" : ""}`} />
                <span>{isTestingFirestore ? "Test Firestore..." : "Ping Live Firestore"}</span>
              </button>

              <button
                onClick={handleTestGemini}
                disabled={isTestingGemini || isTestingFullStack}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#333] text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#C5A059] ${isTestingGemini ? "animate-spin" : ""}`} />
                <span>{isTestingGemini ? "Test Gemini..." : "Ping Live Gemini"}</span>
              </button>

              <button
                onClick={() => setSimulationActive(!simulationActive)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                  simulationActive 
                    ? "bg-[#2A1B0B] border-[#C5A059] text-[#F0C060]" 
                    : "bg-[#161616] border-[#2A2A2A] text-[#888] hover:text-white"
                }`}
                title="Attiva la simulazione visiva della protezione offline multi-livello"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>{simulationActive ? "Chiudi Simulatore" : "Simulatore di Resilienza"}</span>
              </button>
            </div>
          </div>

          {/* Active Resilience Simulator Banner */}
          {simulationActive && (
            <div className="mb-4 p-3.5 rounded-xl bg-[#171209] border border-[#C5A059]/40 space-y-2 text-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Simulatore di Resilienza & Fallback Architetturale
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#241B0D] text-[#C5A059] border border-[#3E2D15]">
                  Test OKF v0.2
                </span>
              </div>
              <p className="text-[#AAA] text-[11px] leading-relaxed">
                In caso di esaurimento totale di Firestore (50k/50k) o Gemini (15 RPM), l&apos;applicazione adotta la seguente catena di continuità garantita:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div className="p-2 rounded bg-[#100C06] border border-[#241A0B]">
                  <div className="font-mono text-[10px] text-emerald-400">1. Persistenza Locale</div>
                  <div className="text-[11px] text-white">IndexedDB salva ogni modifica istantaneamente senza latenza.</div>
                </div>
                <div className="p-2 rounded bg-[#100C06] border border-[#241A0B]">
                  <div className="font-mono text-[10px] text-blue-400">2. Backup Server</div>
                  <div className="text-[11px] text-white">Scrittura atomica su disco container (file JSON permanente).</div>
                </div>
                <div className="p-2 rounded bg-[#100C06] border border-[#241A0B]">
                  <div className="font-mono text-[10px] text-amber-400">3. Parser Euristico</div>
                  <div className="text-[11px] text-white">Analisi a regole locale (0ms latenza) se Gemini è saturo.</div>
                </div>
              </div>
            </div>
          )}

          {/* Test Results Display */}
          {(firestoreTestResult || geminiTestResult) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[#1C1C1C]">
              {firestoreTestResult && (
                <div className={`p-3 rounded-lg border text-xs ${
                  firestoreTestResult.isOnline
                    ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-300"
                    : firestoreTestResult.isQuotaExhausted
                    ? "bg-amber-950/40 border-amber-800/40 text-amber-300"
                    : "bg-rose-950/40 border-rose-800/40 text-rose-300"
                }`}>
                  <div className="font-semibold flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5">
                      {firestoreTestResult.isOnline ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      Risultato Ping Firestore
                    </span>
                    <span className="font-mono text-[10px] opacity-80">{firestoreTestResult.latencyMs}ms</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">{firestoreTestResult.message}</p>
                </div>
              )}

              {geminiTestResult && (
                <div className={`p-3 rounded-lg border text-xs ${
                  geminiTestResult.success
                    ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-300"
                    : "bg-amber-950/40 border-amber-800/40 text-amber-300"
                }`}>
                  <div className="font-semibold flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5">
                      {geminiTestResult.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      Risultato Ping Gemini AI
                    </span>
                    <span className="font-mono text-[10px] opacity-80">{geminiTestResult.latencyMs}ms</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">{geminiTestResult.message}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detailed Metrics Breakdown: Firestore vs Gemini */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Firestore Deep Metrics */}
          <div className="rounded-xl border border-[#222] bg-[#111] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1C1C1C] pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#C5A059]" />
                <h3 className="text-sm font-semibold text-white">Consumi Firestore (Oggi - Fuso Pacific)</h3>
              </div>
              <span className="text-[11px] font-mono text-[#888]">{firestoreStats.dateKey}</span>
            </div>

            {/* Read Gauge */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#AAA] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Letture Documenti (Reads)
                </span>
                <span className="font-mono text-white">
                  <strong>{firestoreStats.reads.toLocaleString()}</strong> / {FIRESTORE_DAILY_READ_LIMIT.toLocaleString()} ({readsPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#1C1C1C] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    readsPercent > 90 ? "bg-rose-500" : readsPercent > 70 ? "bg-amber-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.max(1, readsPercent)}%` }}
                />
              </div>
              <div className="text-[10px] text-[#666] mt-1">
                Include snapshot in tempo reale, sincronizzazioni e letture manuali di risorse.
              </div>
            </div>

            {/* Write Gauge */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#AAA] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  Scritture Documenti (Writes)
                </span>
                <span className="font-mono text-white">
                  <strong>{firestoreStats.writes.toLocaleString()}</strong> / {FIRESTORE_DAILY_WRITE_LIMIT.toLocaleString()} ({writesPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#1C1C1C] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    writesPercent > 90 ? "bg-rose-500" : writesPercent > 70 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.max(1, writesPercent)}%` }}
                />
              </div>
              <div className="text-[10px] text-[#666] mt-1">
                Generato da creazione nuove risorse, aggiornamento tag, valutazioni e toggle preferiti.
              </div>
            </div>

            {/* Delete Gauge */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#AAA] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
                  Eliminazioni Documenti (Deletes)
                </span>
                <span className="font-mono text-white">
                  <strong>{firestoreStats.deletes.toLocaleString()}</strong> / {FIRESTORE_DAILY_DELETE_LIMIT.toLocaleString()} ({deletesPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#1C1C1C] rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(1, deletesPercent)}%` }}
                />
              </div>
            </div>

            {/* Listener count & details */}
            <div className="pt-2 border-t border-[#1C1C1C] flex items-center justify-between text-xs text-[#888]">
              <span>Sottoscrizioni Realtime Attive:</span>
              <span className="font-mono text-emerald-400 font-semibold">{firestoreStats.activeListeners} listener</span>
            </div>
          </div>

          {/* Gemini AI Deep Metrics */}
          <div className="rounded-xl border border-[#222] bg-[#111] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1C1C1C] pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#C5A059]" />
                <h3 className="text-sm font-semibold text-white">Consumi Gemini AI (Server Backend)</h3>
              </div>
              <span className="text-[11px] font-mono text-[#888]">Rate Limits Ufficiali</span>
            </div>

            {/* RPM Gauge */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#AAA] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Richieste Ultimo Minuto (RPM)
                </span>
                <span className="font-mono text-white">
                  <strong>{geminiStats?.requestsLastMinute || 0}</strong> / {GEMINI_RPM_LIMIT} RPM ({geminiRpmPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#1C1C1C] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    geminiRpmPercent > 80 ? "bg-rose-500" : geminiRpmPercent > 50 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.max(1, geminiRpmPercent)}%` }}
                />
              </div>
              <div className="text-[10px] text-[#666] mt-1">
                Limite critico: se superi 15 chiamate in 60s, Gemini risponde con errore 429 temporaneo.
              </div>
            </div>

            {/* Daily RPD Gauge */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#AAA] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                  Richieste Giornaliere (RPD)
                </span>
                <span className="font-mono text-white">
                  <strong>{geminiStats?.requestsToday || 0}</strong> / {GEMINI_DAILY_REQUEST_LIMIT} RPD ({geminiDailyPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#1C1C1C] rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(1, geminiDailyPercent)}%` }}
                />
              </div>
            </div>

            {/* Token Velocity */}
            <div className="p-2.5 rounded-lg bg-[#0C0C0C] border border-[#1E1E1E] flex items-center justify-between text-xs">
              <div>
                <div className="text-[#777] text-[11px]">Token Generati nell&apos;ultimo minuto:</div>
                <div className="font-mono font-bold text-white text-sm">
                  {(geminiStats?.tokensLastMinute || 0).toLocaleString()} <span className="text-[10px] font-normal text-[#666]">/ 1.000.000 TPM</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[#777] text-[11px]">Errori Quota 429 Rilevati:</div>
                <div className="font-mono font-bold text-amber-400 text-sm">
                  {geminiStats?.quota429Count || 0}
                </div>
              </div>
            </div>

            {/* Models in rotation */}
            <div className="pt-2 border-t border-[#1C1C1C]">
              <div className="text-[11px] text-[#777] mb-2">Chiamate per Modello AI in Rotazione:</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(geminiStats?.modelCounts || {
                  "gemini-3.7-flash": 0,
                  "gemini-flash-latest": 0,
                  "gemini-3.1-flash-lite": 0,
                }).map(([model, count]) => (
                  <div key={model} className="px-2 py-1 rounded bg-[#181818] border border-[#262626] text-[10px] font-mono flex items-center gap-1.5">
                    <span className="text-[#AAA]">{model}:</span>
                    <span className="text-[#C5A059] font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Audit Trail: Event Ledger */}
        <div className="rounded-xl border border-[#222] bg-[#111] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C1C1C] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#C5A059]" />
                Registro Eventi Telemetrici in Tempo Reale
              </h3>
              <p className="text-xs text-[#777] mt-0.5">
                Tracciamento dettagliato di ogni singola operazione su Firestore e Gemini con latenze e cause di blocco.
              </p>
            </div>

            {/* Filter and Clear Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Service Filter */}
              <div className="flex rounded-lg bg-[#181818] p-0.5 border border-[#262626] text-xs">
                {(["ALL", "FIRESTORE", "GEMINI"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setServiceFilter(filter)}
                    className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-colors cursor-pointer ${
                      serviceFilter === filter
                        ? "bg-[#C5A059] text-black font-semibold"
                        : "text-[#888] hover:text-white"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#181818] border border-[#262626] text-xs text-[#CCC] px-2.5 py-1 rounded-lg outline-none cursor-pointer"
              >
                <option value="ALL">Tutti gli Esiti</option>
                <option value="ERROR">Solo Errori / Blocchi</option>
                <option value="SUCCESS">Solo Successi</option>
              </select>

              {/* Clear History */}
              <button
                onClick={clearTelemetryEvents}
                className="p-1.5 rounded-lg bg-[#181818] hover:bg-rose-950/40 border border-[#262626] hover:border-rose-800/40 text-[#777] hover:text-rose-400 transition-colors cursor-pointer"
                title="Azzera la cronologia eventi"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search bar inside ledger */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#555] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cerca negli eventi (chiamante, operazione, dettagli)..."
              value={searchLogQuery}
              onChange={(e) => setSearchLogQuery(e.target.value)}
              className="w-full bg-[#0C0C0C] border border-[#222] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#555] outline-none focus:border-[#C5A059]/50"
            />
          </div>

          {/* Table of Events */}
          <div className="overflow-x-auto max-h-96 rounded-lg border border-[#1A1A1A]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#0B0B0B] text-[#777] font-mono text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-[#1A1A1A]">
                <tr>
                  <th className="py-2.5 px-3">Ora</th>
                  <th className="py-2.5 px-3">Servizio</th>
                  <th className="py-2.5 px-3">Operazione</th>
                  <th className="py-2.5 px-3">Origine / Trigger</th>
                  <th className="py-2.5 px-3">Latenza</th>
                  <th className="py-2.5 px-3">Stato</th>
                  <th className="py-2.5 px-3">Dettagli</th>
                  <th className="py-2.5 px-3 text-right">Azione AI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181818] font-mono text-[11px]">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#666]">
                      Nessun evento telemetrico corrisponde ai filtri impostati.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-[#141414] transition-colors">
                      <td className="py-2 px-3 text-[#777] shrink-0 whitespace-nowrap">{ev.timestamp}</td>
                      <td className="py-2 px-3 shrink-0">
                        {ev.service === "FIRESTORE" ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-800/40 text-blue-400 text-[10px]">
                            Firestore
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/40 text-amber-400 text-[10px]">
                            Gemini AI
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-semibold text-white whitespace-nowrap">{ev.operation}</td>
                      <td className="py-2 px-3 text-[#AAA] whitespace-nowrap">{ev.caller}</td>
                      <td className="py-2 px-3 text-[#777] whitespace-nowrap">
                        {ev.latencyMs !== undefined ? `${ev.latencyMs}ms` : "-"}
                      </td>
                      <td className="py-2 px-3 shrink-0">
                        {ev.status === "SUCCESS" ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-800/30 text-[10px]">
                            OK
                          </span>
                        ) : ev.status === "QUOTA_EXCEEDED" || ev.status === "RATE_LIMITED" ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 text-[10px] font-bold">
                            429 Quota
                          </span>
                        ) : ev.status === "TIMEOUT" ? (
                          <span className="px-1.5 py-0.5 rounded bg-yellow-950/60 text-yellow-300 border border-yellow-800/40 text-[10px]">
                            Timeout
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-800/30 text-[10px]">
                            Errore
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-[#888] font-sans text-xs max-w-md truncate" title={ev.details}>
                        {ev.details || "-"}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <LogActionResolver
                          log={{
                            id: ev.id,
                            timestamp: ev.timestamp,
                            level: ev.status === "SUCCESS" ? "info" : ev.status === "QUOTA_EXCEEDED" || ev.status === "RATE_LIMITED" ? "warn" : "error",
                            category: ev.service === "FIRESTORE" ? "FIRESTORE" : "GEMINI_AI",
                            message: `[${ev.operation}] ${ev.caller}: ${ev.details || ev.status}`,
                            details: ev,
                          }}
                          context={{
                            isQuotaExceeded: quotaExceeded,
                            onRefreshOnlineStatus,
                          }}
                          compact
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
