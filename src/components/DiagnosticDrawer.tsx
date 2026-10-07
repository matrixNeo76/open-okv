import React, { useState, useRef, useEffect } from "react";
import { 
  Terminal, 
  X, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  ChevronDown, 
  ChevronRight,
  ShieldCheck,
  Database,
  Cpu,
  RefreshCw,
  Search
} from "lucide-react";
import { DiagnosticLog, ResourceItem, RawFileItem } from "../types";
import { LogActionResolver } from "./LogActionResolver";
import { DiagnosticActionContext } from "../lib/diagnosticActions";

interface DiagnosticDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  logs: DiagnosticLog[];
  onClearLogs: () => void;
  userId?: string;
  totalResources: number;
  resources?: ResourceItem[];
  rawFiles?: RawFileItem[];
  isQuotaExceeded?: boolean;
  onRefreshOnlineStatus?: () => void | Promise<void>;
  onNotification?: (type: "success" | "error" | "info", msg: string) => void;
}

export const DiagnosticDrawer: React.FC<DiagnosticDrawerProps> = ({
  isOpen,
  onClose,
  logs,
  onClearLogs,
  userId,
  totalResources,
  resources,
  rawFiles,
  isQuotaExceeded,
  onRefreshOnlineStatus,
  onNotification,
}) => {
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpandedLogIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredLogs = logs.filter(log => {
    if (filterLevel !== "all" && log.level !== filterLevel) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchCat = log.category.toLowerCase().includes(q);
      const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(q) : false;
      return matchMsg || matchCat || matchDetails;
    }
    return true;
  });

  const actionContext: DiagnosticActionContext = {
    resources,
    rawFiles,
    isQuotaExceeded,
    onRefreshOnlineStatus,
    onClearLogs,
    onNotification,
  };

  const handleCopyAll = () => {
    const report = {
      exportedAt: new Date().toISOString(),
      userAuthenticated: !!userId,
      userId: userId || "anonymous",
      totalVaultResources: totalResources,
      logs: logs,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelBadge = (level: DiagnosticLog["level"]) => {
    switch (level) {
      case "success":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> OK
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800/60 text-rose-400">
            <AlertCircle className="w-3 h-3" /> ERR
          </span>
        );
      case "warn":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400">
            <AlertTriangle className="w-3 h-3" /> WARN
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800/60 text-sky-400">
            <Info className="w-3 h-3" /> INFO
          </span>
        );
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] h-[85vh] bg-[#0C0B08] border border-[#2D2413] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3.5 sm:px-5 py-3.5 sm:py-4 border-b border-[#1E190F] bg-[#141009]/90">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="p-1.5 sm:p-2 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/20 text-[#D5B069] shrink-0">
              <Terminal className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h2 className="text-xs sm:text-base font-semibold text-white tracking-wide truncate">
                  Console di Diagnostica
                </h2>
                <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded-full bg-[#1C160C] text-[#C5A059] border border-[#3E3017] shrink-0">
                  {logs.length}
                </span>
              </div>
              <p className="hidden xs:block text-[11px] text-[#888] truncate">
                Monitoraggio real-time AI Gemini, OKF v0.2 e Firestore
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handleCopyAll}
              className="px-2 sm:px-3 py-1.5 rounded-lg text-xs font-mono bg-[#16130D] border border-[#2D2413] text-[#CCC] hover:text-[#FFF] hover:border-[#C5A059]/40 flex items-center gap-1.5 transition-all shrink-0"
              title="Copia Report Diagnostico JSON"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#888]" />}
              <span className="hidden sm:inline">{copied ? "Copiato" : "Copia"}</span>
            </button>

            <button
              onClick={onClearLogs}
              className="p-1.5 sm:p-2 rounded-lg text-[#888] hover:text-rose-400 hover:bg-rose-950/20 border border-transparent hover:border-rose-900/40 transition-all shrink-0"
              title="Pulisci Log"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              aria-label="Chiudi finestra"
              className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-[#1C160C] hover:bg-[#2A2010] text-[#EEE] hover:text-white border border-[#3E3017] transition-all shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* System Health Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-5 py-3 border-b border-[#1A150D] bg-[#0E0C09]">
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#141009] border border-[#241C0E]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono uppercase text-[#777]">Firebase Auth</div>
              <div className="text-xs font-mono text-emerald-300 truncate">
                {userId ? `Connesso (${userId.slice(0, 10)}...)` : "Inizializzazione..."}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#141009] border border-[#241C0E]">
            <Database className="w-4 h-4 text-[#C5A059] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono uppercase text-[#777]">Cloud Firestore</div>
              <div className="text-xs font-mono text-[#D5B069] truncate">
                Online ({totalResources} risorse attive)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#141009] border border-[#241C0E]">
            <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono uppercase text-[#777]">Gemini AI / OKF Engine</div>
              <div className="text-xs font-mono text-sky-300 truncate">
                Attivo con Fallback Chain & Timeout Guard
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="px-5 py-2.5 border-b border-[#1E190F] flex flex-wrap items-center justify-between gap-2 bg-[#120E08]">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#777] mr-1">Filtro:</span>
            {(["all", "error", "warn", "success", "info"] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`text-[11px] font-mono px-2.5 py-1 rounded-md uppercase transition-all ${
                  filterLevel === lvl
                    ? "bg-[#C5A059] text-black font-semibold"
                    : "bg-[#18130B] text-[#888] hover:text-white border border-[#2B210F]"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-[#555] absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca nei log..."
              className="w-full bg-[#18130B] border border-[#2B210F] rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#C5A059]"
            />
          </div>
        </div>

        {/* Logs Feed */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2 bg-[#080705] scrollbar-thin scrollbar-thumb-[#2D2413]">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#555]">
              <Terminal className="w-8 h-8 mb-2 opacity-40 text-[#C5A059]" />
              <p className="text-sm text-[#888]">Nessun evento registrato corrispondente ai filtri.</p>
              <p className="text-xs text-[#555] mt-1">
                Esegui una cattura o un caricamento OKF per visualizzare il flusso di esecuzione.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = !!expandedLogIds[log.id];
              const hasDetails = log.details && Object.keys(log.details).length > 0;

              return (
                <div
                  key={log.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    log.level === "error"
                      ? "bg-rose-950/20 border-rose-900/40 text-rose-200"
                      : log.level === "warn"
                      ? "bg-amber-950/20 border-amber-900/40 text-amber-200"
                      : log.level === "success"
                      ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-200"
                      : "bg-[#110E09] border-[#221A0E] text-[#D0D0D0]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="text-[11px] text-[#666] shrink-0 pt-0.5">
                        {log.timestamp}
                      </span>
                      {getLevelBadge(log.level)}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1C160D] border border-[#30230F] text-[#C5A059] font-bold shrink-0">
                        {log.category}
                      </span>
                      <p className="text-xs break-words leading-relaxed flex-1 text-white">
                        {log.message}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <LogActionResolver log={log} context={actionContext} compact />
                      {hasDetails && (
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="text-[11px] text-[#888] hover:text-[#C5A059] flex items-center gap-1 shrink-0 p-1"
                        >
                          <span>{isExpanded ? "Nascondi" : "Dettagli"}</span>
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded JSON Details */}
                  {isExpanded && hasDetails && (
                    <div className="mt-2 pt-2 border-t border-[#261E10] text-[11px] bg-[#0A0805] p-3 rounded-lg overflow-x-auto text-[#AAA]">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1E190F] bg-[#120E08] flex items-center justify-between text-xs text-[#777]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Logging attivo & protetto in sandbox</span>
          </div>
          <div className="text-[11px] font-mono">
            Knowledge Vault v0.2.4 &bull; OKF Protocol Engine
          </div>
        </div>
      </div>
    </div>
  );
};
