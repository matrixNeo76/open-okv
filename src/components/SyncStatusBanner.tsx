import React, { useEffect, useState } from "react";
import { RefreshCw, Database, Clock, Zap, AlertTriangle, CheckCircle2, HardDrive, Download, ShieldCheck, ChevronDown, ChevronUp, GitMerge, Activity } from "lucide-react";
import { getFirebaseQuotaResetInfo, DEFAULT_SYNC_INTERVAL_MS } from "../lib/cacheManager";

interface SyncStatusBannerProps {
  quotaExceeded: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  onManualSync: () => void;
  resourceCount: number;
  onExportBackup?: () => void;
  hasPendingConflicts?: boolean;
  conflictCount?: number;
  onOpenConflictModal?: () => void;
  onOpenRecoveryModal?: () => void;
  onOpenQuotaTelemetry?: () => void;
  onOpenPersistenceStatus?: () => void;
  unsyncedCount?: number;
  onUploadUnsynced?: () => void;
  isAnonymous?: boolean;
  userEmail?: string | null;
}

export const SyncStatusBanner: React.FC<SyncStatusBannerProps> = ({
  quotaExceeded,
  isSyncing,
  lastSyncTime: _lastSyncTime,
  onManualSync,
  resourceCount,
  onExportBackup,
  hasPendingConflicts,
  conflictCount,
  onOpenConflictModal,
  onOpenRecoveryModal,
  onOpenQuotaTelemetry,
  onOpenPersistenceStatus,
  unsyncedCount = 0,
  onUploadUnsynced,
  isAnonymous = true,
  userEmail = null,
}) => {
  const [quotaInfo, setQuotaInfo] = useState(getFirebaseQuotaResetInfo());
  const [secondsUntilNextAutoSync, setSecondsUntilNextAutoSync] = useState(Math.round(DEFAULT_SYNC_INTERVAL_MS / 1000));
  const [isExpanded, setIsExpanded] = useState(false);
  const [serverStatus, setServerStatus] = useState<{ exists: boolean; formattedSize?: string; savedAt?: string; count?: number } | null>(null);

  // Update countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      setQuotaInfo(getFirebaseQuotaResetInfo());
      setSecondsUntilNextAutoSync((prev) => {
        if (prev <= 1) {
          return Math.round(DEFAULT_SYNC_INTERVAL_MS / 1000);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Poll server backup status on mount and periodically
  useEffect(() => {
    const checkServerBackup = async () => {
      try {
        const res = await fetch("/api/vault/backup-status");
        if (res.ok) {
          const data = await res.json();
          setServerStatus(data);
        }
      } catch {
        // Non-fatal
      }
    };
    checkServerBackup();
    const srvTimer = setInterval(checkServerBackup, 30000);
    return () => clearInterval(srvTimer);
  }, [resourceCount]);

  const formatMinutesSeconds = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full bg-[#0B0B0B] border-b border-[#1C1C1C] px-3 sm:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono select-none">
      {/* Left side: Multi-Layer Storage Badge & Count */}
      <div className="flex items-center gap-2 flex-wrap">
        {quotaExceeded ? (
          <button
            onClick={onOpenQuotaTelemetry}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/40 text-amber-300 text-[11px] font-medium transition-colors cursor-pointer text-left"
            title="Clicca per aprire la pagina dedicata di diagnosi quote e telemetria Gemini/Firestore"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Quota Firestore Esaurita</span>
            <span className="text-[#888]">•</span>
            <span className="text-emerald-400 flex items-center gap-1 font-normal">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Persistenza Multi-Livello Attiva
            </span>
            <span className="text-[10px] bg-amber-900/80 px-1.5 py-0.2 rounded text-amber-200 border border-amber-700/50 ml-1">
              Apri Diagnostica →
            </span>
          </button>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-950/30 border border-emerald-600/30 text-emerald-400 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Persistenza Continua Attiva (Server + IndexedDB + LocalStorage)</span>
          </div>
        )}

        {hasPendingConflicts && onOpenConflictModal && (
          <button
            onClick={onOpenConflictModal}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#1C160B] hover:bg-[#2A2012] border border-[#C5A059]/40 text-[#E5C170] text-[11px] font-medium transition-all cursor-pointer"
            title="Visualizza allineamento tra memoria locale e Firestore"
          >
            <GitMerge className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Allineamento versioni</span>
          </button>
        )}

        {/* Unsynced Local Resources Notice */}
        {unsyncedCount > 0 && (
          <button
            onClick={onOpenPersistenceStatus || onUploadUnsynced}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#1C170E] hover:bg-[#2A2012] border border-[#C5A059]/40 text-[#E5C170] text-[11px] font-medium transition-all cursor-pointer shadow-xs"
            title="Sincronizzazione cloud in background della nuova risorsa acquisita oggi. Clicca per dettagli."
          >
            <RefreshCw className="w-3 h-3 text-[#C5A059] animate-spin shrink-0" />
            <span>Auto-sincronizzazione cloud ({unsyncedCount})</span>
            <span className="text-[10px] text-[#888] ml-0.5">
              • Dettagli
            </span>
          </button>
        )}

        <div className="hidden md:flex items-center gap-2 text-[#777] text-[11px]">
          <button 
            onClick={onOpenPersistenceStatus}
            className="flex items-center gap-1 hover:text-[#E5C170] transition-colors cursor-pointer"
            title="Clicca per aprire lo stato dettagliato dei 3 livelli di storage"
          >
            <Database className="w-3 h-3 text-[#C5A059]" />
            <span>{resourceCount} nodi</span>
          </button>
          {serverStatus?.exists && (
            <button 
              onClick={onOpenPersistenceStatus}
              className="flex items-center gap-1 text-[#4ADE80]/80 hover:text-[#4ADE80] transition-colors cursor-pointer" 
              title="Copia di backup archiviata fisicamente sul filesystem del server backend. Clicca per dettagli."
            >
              <HardDrive className="w-3 h-3 text-[#4ADE80]" />
              <span>Disco Server: {serverStatus.formattedSize || "OK"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Right side: Countdown to Quota Reset & Auto-Sync timer & Export / Manual Sync */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Next Daily Reset Countdown */}
        <div 
          className="flex items-center gap-1.5 text-[#AAA] bg-[#141414] hover:bg-[#1A1A1A] border border-[#262626] px-2 py-0.5 rounded-md cursor-pointer transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
          title="Orario del ciclo di rotazione giornaliero dei contatori gratuiti Google Cloud (00:00 US Pacific Time)"
        >
          <Clock className="w-3 h-3 text-[#C5A059]" />
          <span className="text-[#888] hidden sm:inline">
            {quotaExceeded ? "Reset Quota:" : "Ciclo Giornaliero Cloud:"}
          </span>
          <span className={`text-[11px] ${quotaExceeded ? "font-bold text-amber-300" : "font-semibold text-[#E5C170]"}`}>
            {quotaInfo.formattedCountdown}
          </span>
          {isExpanded ? <ChevronUp className="w-3 h-3 text-[#777]" /> : <ChevronDown className="w-3 h-3 text-[#777]" />}
        </div>

        {/* Dedicated Quota Telemetry Page Button */}
        {onOpenQuotaTelemetry && (
          <button
            onClick={onOpenQuotaTelemetry}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
              quotaExceeded
                ? "bg-amber-950/60 hover:bg-amber-900/80 border-amber-600/60 text-amber-300 shadow-sm"
                : "bg-[#16120A] hover:bg-[#221A0E] border-[#C5A059]/40 hover:border-[#C5A059] text-[#E5C170]"
            }`}
            title="Apri il Centro di Controllo Quote e Telemetria in tempo reale (Gemini + Firestore)"
          >
            <Activity className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Diagnostica Quote</span>
          </button>
        )}

        {/* Quick Instant Export JSON Snapshot */}
        {onExportBackup && (
          <button
            onClick={onExportBackup}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#141414] hover:bg-[#1A160E] border border-[#262626] hover:border-[#C5A059]/40 text-[#CCC] hover:text-[#E5C170] text-[11px] transition-all"
            title="Scarica un file JSON completo con tutte le tue risorse e documenti"
          >
            <Download className="w-3 h-3 text-[#C5A059]" />
            <span className="hidden sm:inline">Scarica Backup</span>
          </button>
        )}

        {/* Auto Sync Timer */}
        {!quotaExceeded && (
          <div className="hidden lg:flex items-center gap-1 text-[#666] text-[11px]" title="Controllo automatico programmato ogni 10 minuti">
            <Zap className="w-3 h-3 text-[#555]" />
            <span>Auto-sync: <span className="text-[#999]">{formatMinutesSeconds(secondsUntilNextAutoSync)}</span></span>
          </div>
        )}

        {/* Recovery Center Button */}
        {onOpenRecoveryModal && (
          <button
            onClick={onOpenRecoveryModal}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#1B160E] hover:bg-[#282012] border border-[#3E3017] hover:border-[#C5A059]/60 text-[#E5C170] text-[11px] font-medium transition-all"
            title="Apri il Centro di Recupero & Diagnostica per ripristinare risorse dal browser e dal server"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Centro Recupero</span>
          </button>
        )}

        {/* Manual Sync Button */}
        <button
          onClick={onManualSync}
          disabled={isSyncing}
          className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md border text-[11px] transition-all ${
            isSyncing
              ? "bg-[#181818] text-[#777] border-[#222] cursor-not-allowed"
              : "bg-[#141414] hover:bg-[#1F180E] text-[#CCC] hover:text-[#E5C170] border-[#262626] hover:border-[#C5A059]/40 active:scale-95"
          }`}
          title="Forza sincronizzazione con Firestore e aggiornamento backup server"
        >
          <RefreshCw className={`w-3 h-3 text-[#C5A059] ${isSyncing ? "animate-spin" : ""}`} />
          <span>{isSyncing ? "Sincronizzo..." : "Sincronizza"}</span>
        </button>
      </div>

      {/* Expanded Details on Click */}
      {isExpanded && (
        <div className="w-full mt-2 p-3 rounded-lg bg-[#121212] border border-[#282828] text-[#CCC] text-[11px] leading-relaxed animate-in fade-in duration-200 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#222] pb-1.5">
            <span className="font-semibold text-[#E5C170] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Architettura di Persistenza Multi-Livello & Protezione Standby
            </span>
            <button onClick={() => setIsExpanded(false)} className="text-[#888] hover:text-white text-[11px]">Chiudi ✕</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
            <div className="p-2.5 rounded bg-[#181818] border border-[#222]">
              <div className="font-semibold text-white flex items-center gap-1 mb-1">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" /> 1. Server Backend (Node.js)
              </div>
              <p className="text-[#888] text-[10px]">
                I dati vengono salvati fisicamente su file JSON nel server cloud (`data/vault-backup.json`). Anche se chiudi Chrome o riavvii il PC, le risorse non andranno perse.
              </p>
            </div>

            <div className="p-2.5 rounded bg-[#181818] border border-[#222]">
              <div className="font-semibold text-white flex items-center gap-1 mb-1">
                <Database className="w-3.5 h-3.5 text-cyan-400" /> 2. Browser IndexedDB
              </div>
              <p className="text-[#888] text-[10px]">
                Database ad alta capacità nel browser, immune alla pulizia automatica della memoria RAM o allo standby delle schede di Chrome.
              </p>
            </div>

            <div className="p-2.5 rounded bg-[#181818] border border-[#222]">
              <div className="font-semibold text-white flex items-center gap-1 mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" /> 3. Ripristino Firestore
              </div>
              <p className="text-[#888] text-[10px]">
                Reset quote previsto alle <strong>00:00 PST ({quotaInfo.formattedResetTime} ora locale)</strong>. Al reset, le risorse verranno riversate automaticamente sul database Firestore.
              </p>
            </div>
          </div>

          {onOpenQuotaTelemetry && (
            <div className="pt-2 border-t border-[#1F1F1F] flex justify-end">
              <button
                onClick={() => {
                  setIsExpanded(false);
                  onOpenQuotaTelemetry();
                }}
                className="flex items-center gap-1.5 text-xs text-[#E5C170] hover:text-white px-3 py-1 rounded bg-[#1A150D] hover:bg-[#251D12] border border-[#C5A059]/40 transition-colors"
              >
                <Activity className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Apri Centro Diagnostica & Telemetria Completo →</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
