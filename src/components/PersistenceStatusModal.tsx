import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, 
  Database, 
  HardDrive, 
  Cloud, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  LogIn, 
  X, 
  Clock, 
  Download, 
  Activity, 
  History, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  Info, 
  RotateCcw, 
  Sparkles,
  Trash2,
  PlusCircle,
  FileCheck
} from "lucide-react";
import { User } from "firebase/auth";
import { ResourceItem } from "../types";
import { downloadBackupJSON, sanitizeLocalStorage } from "../lib/recoveryManager";

interface SnapshotItem {
  filename: string;
  timestamp: number;
  formattedDate: string;
  count: number;
  sizeBytes: number;
  formattedSize: string;
}

interface PersistenceStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSignInWithGoogle: () => void;
  resources: ResourceItem[];
  onUploadUnsynced: () => Promise<void>;
  isSyncing: boolean;
  quotaExceeded: boolean;
  onApplyRestoredResources?: (restored: ResourceItem[]) => void;
}

export const PersistenceStatusModal: React.FC<PersistenceStatusModalProps> = ({
  isOpen,
  onClose,
  user,
  onSignInWithGoogle,
  resources,
  onUploadUnsynced,
  isSyncing,
  quotaExceeded,
  onApplyRestoredResources,
}) => {
  const [serverStatus, setServerStatus] = useState<{
    exists: boolean;
    formattedSize?: string;
    savedAt?: string;
    count?: number;
    fileSizeBytes?: number;
  } | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [isLoadingServer, setIsLoadingServer] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [browserStorageEstimate, setBrowserStorageEstimate] = useState<{
    usage: string;
    quota: string;
  } | null>(null);

  // Manual Checkpoint & Snapshot Creation State
  const [isSavingCheckpoint, setIsSavingCheckpoint] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [customSnapshotLabel, setCustomSnapshotLabel] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Restoring snapshot state
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);
  
  // UI Accordion toggles
  const [showSnapshotsList, setShowSnapshotsList] = useState(false);
  const [showUnsyncedDetails, setShowUnsyncedDetails] = useState(false);
  const [showNewSnapshotForm, setShowNewSnapshotForm] = useState(false);

  // Identify local-only vs cloud-synced resources
  const unsyncedResources = useMemo(() => {
    return resources.filter(
      (r) => r.id.startsWith("local-") || r.id.startsWith("conv-") || r.id.startsWith("seed-")
    );
  }, [resources]);

  const firestoreReadyResources = useMemo(() => {
    return resources.filter(
      (r) => !r.id.startsWith("local-") && !r.id.startsWith("conv-") && !r.id.startsWith("seed-")
    );
  }, [resources]);

  const syncPercentage = useMemo(() => {
    if (resources.length === 0) return 100;
    return Math.round((firestoreReadyResources.length / resources.length) * 100);
  }, [resources.length, firestoreReadyResources.length]);

  // Estimated memory payload size
  const estimatedPayloadSizeBytes = useMemo(() => {
    try {
      return new TextEncoder().encode(JSON.stringify(resources)).length;
    } catch {
      return resources.length * 1024 * 3;
    }
  }, [resources]);

  const formattedPayloadSize = `${(estimatedPayloadSizeBytes / 1024).toFixed(1)} KB`;

  // Relative time helper for last saved backup
  const lastSavedRelativeText = useMemo(() => {
    if (!serverStatus?.savedAt) return "Inizializzazione in corso";
    try {
      const savedDate = new Date(serverStatus.savedAt);
      const diffSeconds = Math.max(0, Math.floor((Date.now() - savedDate.getTime()) / 1000));
      if (diffSeconds < 45) return "Pochi secondi fa";
      if (diffSeconds < 120) return "Circa 1 minuto fa";
      if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} minuti fa`;
      if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} ore fa`;
      return savedDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "Data non disponibile";
    }
  }, [serverStatus?.savedAt]);

  // Escape key handler
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

  // Fetch status, snapshots and measure ping latency
  const fetchStatusAndMetrics = async () => {
    setIsLoadingServer(true);
    const start = performance.now();
    try {
      const res = await fetch("/api/vault/backup-status");
      const duration = Math.round(performance.now() - start);
      setPingMs(duration);

      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }

      // Fetch server snapshots
      const snapRes = await fetch("/api/vault/snapshots");
      if (snapRes.ok) {
        const snapData = await snapRes.json();
        if (Array.isArray(snapData.snapshots)) {
          setSnapshots(snapData.snapshots);
        }
      }

      // Browser storage estimate API
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage !== undefined && estimate.quota !== undefined) {
          setBrowserStorageEstimate({
            usage: `${(estimate.usage / (1024 * 1024)).toFixed(1)} MB`,
            quota: `${(estimate.quota / (1024 * 1024)).toFixed(0)} MB`,
          });
        }
      }
    } catch (e) {
      console.warn("Error fetching persistence status:", e);
      setPingMs(null);
    } finally {
      setIsLoadingServer(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatusAndMetrics();
    }
  }, [isOpen, resources.length]);

  // Handle immediate force checkpoint
  const handleForceCheckpoint = async () => {
    setIsSavingCheckpoint(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch("/api/vault/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resources,
          timestamp: Date.now(),
          savedAt: new Date().toISOString(),
          userId: user?.uid || "guest-session",
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setFeedbackMessage({
        type: "success",
        text: `Checkpoint atomico completato con successo su Server e Storage Locale (${resources.length} schede registrate)!`
      });
      await fetchStatusAndMetrics();
      setTimeout(() => setFeedbackMessage(null), 4500);
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: "Errore durante il salvataggio del checkpoint: " + (err?.message || "")
      });
    } finally {
      setIsSavingCheckpoint(false);
    }
  };

  // Handle manual labeled snapshot creation
  const handleCreateLabeledSnapshot = async () => {
    setIsCreatingSnapshot(true);
    setFeedbackMessage(null);
    try {
      const label = customSnapshotLabel.trim() || `Istantanea ${new Date().toLocaleTimeString("it-IT")}`;
      const res = await fetch("/api/vault/create-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          resources,
          userId: user?.uid || "guest-session",
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setFeedbackMessage({
        type: "success",
        text: `Nuova istantanea "${label}" creata e congelata su disco server con successo!`
      });
      setCustomSnapshotLabel("");
      setShowNewSnapshotForm(false);
      setShowSnapshotsList(true);
      await fetchStatusAndMetrics();
      setTimeout(() => setFeedbackMessage(null), 4500);
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: "Impossibile creare l'istantanea: " + (err?.message || "")
      });
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Download a single snapshot from the server
  const handleDownloadServerSnapshot = async (filename: string) => {
    try {
      const res = await fetch(`/api/vault/snapshot-detail?filename=${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error("Errore recupero file snapshot");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setFeedbackMessage({
        type: "error",
        text: "Errore download snapshot: " + (e?.message || "")
      });
    }
  };

  // Restore snapshot directly into vault state
  const handleRestoreServerSnapshot = async (filename: string) => {
    if (!window.confirm(`Sei sicuro di voler ripristinare l'istantanea "${filename}"? Le schede correnti verranno allineate a questa versione.`)) {
      return;
    }

    setRestoringFilename(filename);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`/api/vault/snapshot-detail?filename=${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error("File istantanea non trovato sul server");
      const data = await res.json();
      
      const restoredItems = Array.isArray(data.resources) 
        ? data.resources 
        : Array.isArray(data) 
        ? data 
        : [];

      if (restoredItems.length === 0) {
        throw new Error("L'istantanea selezionata non contiene risorse valide.");
      }

      if (onApplyRestoredResources) {
        onApplyRestoredResources(restoredItems);
      }

      setFeedbackMessage({
        type: "success",
        text: `Ripristino completato con successo: ${restoredItems.length} schede caricate nel Vault.`
      });
      setTimeout(() => setFeedbackMessage(null), 5000);
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: "Errore durante il ripristino dell'istantanea: " + (err?.message || "")
      });
    } finally {
      setRestoringFilename(null);
    }
  };

  // Run local cache sanitization
  const handleSanitizeLocalCache = () => {
    try {
      const result = sanitizeLocalStorage();
      setFeedbackMessage({
        type: "info",
        text: `Cache locale ottimizzata: rimosse ${result.purgedKeys} voci obsolete, liberati circa ${(result.freedBytesApprox / 1024).toFixed(1)} KB.`
      });
      fetchStatusAndMetrics();
      setTimeout(() => setFeedbackMessage(null), 4500);
    } catch (e: any) {
      setFeedbackMessage({
        type: "error",
        text: "Errore durante la sanitizzazione della memoria: " + (e?.message || "")
      });
    }
  };

  if (!isOpen) return null;

  const isAnonymous = user?.isAnonymous ?? true;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-[#0E0C09] border border-[#2D2413] w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden text-[#E0E0E0] flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1E190F] flex items-center justify-between bg-[#141009]/95">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#C5A059]/15 border border-[#C5A059]/30 flex items-center justify-center text-[#D5B069]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Stato Persistenza & Sincronizzazione Dati
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1C160C] text-[#C5A059] border border-[#3E3017]">
                  Triple-Shield OKF v0.2
                </span>
              </div>
              <p className="text-xs text-[#888]">
                Integrità garantita a 3 livelli: Browser Client, Server Filesystem e Cloud Firestore
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatusAndMetrics}
              disabled={isLoadingServer}
              title="Aggiorna metriche di stato e latenza"
              className="p-1.5 rounded-lg bg-[#1A1610] hover:bg-[#251F14] text-[#888] hover:text-white border border-[#2D2413] transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingServer ? "animate-spin text-[#C5A059]" : ""}`} />
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
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Identity & Account Status Banner */}
          <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isAnonymous 
              ? "bg-[#181208] border-[#C5A059]/40" 
              : "bg-[#0B150F] border-emerald-800/40"
          }`}>
            <div className="flex items-start gap-2.5">
              <div className={`p-1.5 rounded-lg mt-0.5 ${isAnonymous ? "bg-amber-950/70 text-[#E5C170]" : "bg-emerald-950/70 text-emerald-400"}`}>
                <Info className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white text-xs">
                    {isAnonymous ? "Sessione Ospite (Autenticazione Anonima)" : "Account Google Proprietario Collegato"}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                    isAnonymous ? "bg-[#251B0C] text-[#E5C170] border border-[#443217]" : "bg-emerald-950 text-emerald-300 border border-emerald-800/60"
                  }`}>
                    UID: {user?.uid ? `${user.uid.slice(0, 10)}...` : "N/D"}
                  </span>
                </div>
                <p className="text-[11px] text-[#A0A0A0] mt-1 leading-relaxed">
                  {isAnonymous ? (
                    <>
                      I documenti sono protetti in locale e sul filesystem server. Per abilitare la sincronizzazione automatica bidirezionale su Firestore da qualunque dispositivo, accedi con Google.
                    </>
                  ) : (
                    <>
                      Connesso come <strong className="text-white">{user?.email}</strong>. Sincronizzazione bitemporale attiva con regole <code className="text-emerald-400">firestore.rules</code> conformi.
                    </>
                  )}
                </p>
              </div>
            </div>

            {isAnonymous && (
              <button
                onClick={() => {
                  onSignInWithGoogle();
                  onClose();
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors shrink-0 shadow-md cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Accedi con Google</span>
              </button>
            )}
          </div>

          {/* Sync Progress & Health Metric Bar */}
          <div className="p-3.5 rounded-xl bg-[#120F0A] border border-[#241C0E] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold text-white">Salute Storage & Sincronizzazione Cloud:</span>
                <span className="text-[11px] font-mono font-medium text-[#C5A059]">
                  {syncPercentage}% allineato
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-[#888]">
                <span>Ultimo Checkpoint: <strong className="text-emerald-400">{lastSavedRelativeText}</strong></span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-[#1C160C] h-2 rounded-full overflow-hidden border border-[#3E3017]/60">
              <div 
                className="h-full bg-gradient-to-r from-[#C5A059] to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(syncPercentage, 5)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10.5px] font-mono text-[#888] pt-0.5">
              <span>Cloud Firestore: {firestoreReadyResources.length} schede</span>
              <span>Protezione Locale/Server: {unsyncedResources.length} schede</span>
              <span>RAM Vault: {formattedPayloadSize}</span>
              {pingMs !== null && <span>Ping: {pingMs}ms</span>}
            </div>
          </div>

          {/* Feedback Message */}
          {feedbackMessage && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-fade-in ${
              feedbackMessage.type === "success" 
                ? "bg-emerald-950/50 border-emerald-800/50 text-emerald-300"
                : feedbackMessage.type === "error"
                ? "bg-red-950/50 border-red-800/50 text-red-300"
                : "bg-amber-950/50 border-amber-800/50 text-amber-300"
            }`}>
              {feedbackMessage.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {feedbackMessage.type === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
              {feedbackMessage.type === "info" && <Info className="w-4 h-4 text-amber-400 shrink-0" />}
              <span>{feedbackMessage.text}</span>
            </div>
          )}

          {/* 3 Storage Layers Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* Level 1: Client Memory & IndexedDB */}
            <div className="p-4 rounded-xl bg-[#130F0A] border border-[#261E0E] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[#888] mb-2 font-mono text-[10px] uppercase">
                  <span>Livello 1: Browser Locale</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <Database className="w-4 h-4 text-[#C5A059]" />
                  <span className="text-white font-bold text-base">
                    {resources.length} Schede
                  </span>
                </div>
                <p className="text-[11px] text-[#888] mt-1 leading-relaxed">
                  IndexedDB + LocalStorage con persistenza ad accesso istantaneo e latenza zero (piena operatività anche offline).
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#1F180B] text-[10px] font-mono text-emerald-400 flex items-center justify-between">
                <span>Integrità: 100% OK</span>
                <button
                  onClick={handleSanitizeLocalCache}
                  className="text-[10px] text-[#C5A059] hover:underline cursor-pointer flex items-center gap-1"
                  title="Pulisce chiavi orfane e cache obsoleta nel browser"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Sanitizza Cache</span>
                </button>
              </div>
            </div>

            {/* Level 2: Backend Server Filesystem */}
            <div className="p-4 rounded-xl bg-[#130F0A] border border-[#261E0E] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[#888] mb-2 font-mono text-[10px] uppercase">
                  <span>Livello 2: Server Backend</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span className="text-white font-bold text-base">
                    {isLoadingServer ? "..." : `${serverStatus?.count ?? resources.length} Schede`}
                  </span>
                </div>
                <p className="text-[11px] text-[#888] mt-1 leading-relaxed">
                  File fisico <code className="text-[#DDD]">vault-backup.json</code> su disco con {snapshots.length} snapshot storici versionati.
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#1F180B] text-[10px] font-mono text-[#AAA] flex items-center justify-between">
                <span>Dim: {serverStatus?.formattedSize || formattedPayloadSize}</span>
                <span className="text-emerald-400">Attivo ({snapshots.length} snap)</span>
              </div>
            </div>

            {/* Level 3: Google Firestore Cloud */}
            <div className="p-4 rounded-xl bg-[#130F0A] border border-[#261E0E] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[#888] mb-2 font-mono text-[10px] uppercase">
                  <span>Livello 3: Firestore Cloud</span>
                  {quotaExceeded ? (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <Cloud className="w-4 h-4 text-sky-400" />
                  <span className="text-white font-bold text-base">
                    {firestoreReadyResources.length} ID Cloud
                  </span>
                </div>
                <p className="text-[11px] text-[#888] mt-1 leading-relaxed">
                  {unsyncedResources.length > 0 ? (
                    <span className="text-amber-300 font-medium">
                      {unsyncedResources.length} schede in attesa di caricamento su Firestore.
                    </span>
                  ) : (
                    <span>Tutte le risorse sono sincronizzate con identificatore Firestore.</span>
                  )}
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#1F180B] text-[10px] font-mono flex items-center justify-between">
                <span className="text-[#888]">{quotaExceeded ? "Quota Protetta" : "Connesso"}</span>
                <span className={unsyncedResources.length > 0 ? "text-amber-300 font-semibold" : "text-emerald-400"}>
                  {unsyncedResources.length > 0 ? `${unsyncedResources.length} da sincronizzare` : "Allineato"}
                </span>
              </div>
            </div>

          </div>

          {/* ACTION TOOLBAR: FORCED CHECKPOINT, NEW SNAPSHOT & DOWNLOAD BACKUP */}
          <div className="p-3.5 rounded-xl bg-[#16120B] border border-[#2B2111] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Operazioni di Checkpoint & Backup:</span>
              </h4>
              <p className="text-[11px] text-[#888] mt-0.5">
                Sincronizza subito la memoria con il server, crea una copia congelata o esporta il file JSON.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleForceCheckpoint}
                disabled={isSavingCheckpoint}
                className="px-3 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                title="Salva immediatamente le modifiche su server e IndexedDB"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSavingCheckpoint ? "animate-spin" : ""}`} />
                <span>{isSavingCheckpoint ? "Salvataggio..." : "Salva Checkpoint Adesso"}</span>
              </button>

              <button
                onClick={() => setShowNewSnapshotForm(!showNewSnapshotForm)}
                className="px-3 py-1.5 rounded-lg bg-[#221B0F] hover:bg-[#2F2414] text-[#E0E0E0] hover:text-white border border-[#3E3017] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Crea una nuova istantanea storicizzata con etichetta"
              >
                <PlusCircle className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Crea Istantanea</span>
              </button>

              <button
                onClick={() => downloadBackupJSON(resources)}
                className="px-3 py-1.5 rounded-lg bg-[#221B0F] hover:bg-[#2F2414] text-[#E0E0E0] hover:text-white border border-[#3E3017] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Esporta copia di sicurezza JSON istantanea sul computer locale"
              >
                <Download className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Esporta JSON</span>
              </button>
            </div>
          </div>

          {/* New Snapshot Form (Collapsible) */}
          {showNewSnapshotForm && (
            <div className="p-3.5 rounded-xl bg-[#1A150C] border border-[#3E2D15] space-y-2.5 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Nuova Istantanea Storicizzata su Server</span>
                </span>
                <span className="text-[10.5px] font-mono text-[#888]">
                  Salva {resources.length} schede in archivio permanente
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customSnapshotLabel}
                  onChange={(e) => setCustomSnapshotLabel(e.target.value)}
                  placeholder="Es. 'Pre-Release v1.2', 'Revisione Architettura', o lascia vuoto..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[#0E0C09] border border-[#3E2D15] text-white text-xs placeholder:text-[#666] focus:outline-none focus:border-[#C5A059]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateLabeledSnapshot();
                  }}
                />
                <button
                  onClick={handleCreateLabeledSnapshot}
                  disabled={isCreatingSnapshot}
                  className="px-3 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingSnapshot ? "Salvataggio..." : "Congela Istantanea"}
                </button>
                <button
                  onClick={() => setShowNewSnapshotForm(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#221B0F] hover:bg-[#2A2010] text-[#888] hover:text-white border border-[#3E2D15] text-xs cursor-pointer"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}

          {/* Unsynced Resources Action Section */}
          {unsyncedResources.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[#1A1409] border border-[#C5A059]/50 flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#E5C170]" />
                    <span>Risorse in attesa di upload su Firestore ({unsyncedResources.length}):</span>
                  </h3>
                  <p className="text-[11px] text-[#AAA] mt-0.5">
                    Queste risorse sono protette al 100% in locale e su server. Puoi inviarle su Firestore con un clic.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowUnsyncedDetails(!showUnsyncedDetails)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#241A0B] hover:bg-[#30220F] text-[#DDD] text-xs font-mono flex items-center gap-1 border border-[#3E2D15] cursor-pointer"
                  >
                    <span>{showUnsyncedDetails ? "Nascondi Lista" : "Mostra Lista"}</span>
                    {showUnsyncedDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  <button
                    onClick={onUploadUnsynced}
                    disabled={isSyncing}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors shrink-0 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                    <span>{isSyncing ? "Caricamento in corso..." : "Carica su Firestore"}</span>
                  </button>
                </div>
              </div>

              {/* Collapsible details of unsynced resources */}
              {showUnsyncedDetails && (
                <div className="mt-2 pt-2 border-t border-[#2F220F] space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar font-mono text-[11px]">
                  {unsyncedResources.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-1 px-2 rounded bg-[#20170A] text-[#D4AF37]">
                      <span className="truncate pr-2">• {item.title}</span>
                      <span className="text-[#777] shrink-0 text-[10px]">({item.type})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Server Snapshots Section with Download and Restore Actions */}
          {snapshots.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[#120F0A] border border-[#241C0E]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#C5A059]" />
                  <span className="text-xs font-semibold text-white">
                    Istantanee Storiche Preservate ({snapshots.length} versioni sul Server)
                  </span>
                </div>

                <button
                  onClick={() => setShowSnapshotsList(!showSnapshotsList)}
                  className="px-2.5 py-1 rounded-lg bg-[#18130B] hover:bg-[#241C10] text-[#DDD] text-xs font-mono flex items-center gap-1 border border-[#2D2211] cursor-pointer"
                >
                  <span>{showSnapshotsList ? "Comprimi" : "Dettagli & Ripristino"}</span>
                  {showSnapshotsList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {showSnapshotsList && (
                <div className="mt-3 pt-2.5 border-t border-[#20180B] space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {snapshots.slice(0, 15).map((snap, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-[#16120B] border border-[#241C0E] flex items-center justify-between text-[11px] font-mono gap-2 hover:border-[#3E2D15] transition-colors">
                      <div className="truncate flex-1">
                        <span className="text-white block truncate font-medium">{snap.filename}</span>
                        <div className="flex items-center gap-2 text-[10px] text-[#777] mt-0.5">
                          <span>{snap.formattedDate}</span>
                          <span>&bull;</span>
                          <span className="text-[#C5A059]">{snap.count} schede</span>
                          <span>&bull;</span>
                          <span>{snap.formattedSize}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleDownloadServerSnapshot(snap.filename)}
                          className="p-1.5 rounded-lg bg-[#20180D] hover:bg-[#2F2212] text-[#AAA] hover:text-white border border-[#3E3017] transition-colors cursor-pointer"
                          title="Scarica file JSON di questo snapshot"
                        >
                          <Download className="w-3.5 h-3.5 text-[#C5A059]" />
                        </button>

                        <button
                          onClick={() => handleRestoreServerSnapshot(snap.filename)}
                          disabled={restoringFilename === snap.filename}
                          className="px-2.5 py-1 rounded-lg bg-[#20180D] hover:bg-[#2F2212] text-[#E0E0E0] hover:text-white border border-[#3E3017] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Ripristina questa versione nel Vault"
                        >
                          <RotateCcw className={`w-3 h-3 text-emerald-400 ${restoringFilename === snap.filename ? "animate-spin" : ""}`} />
                          <span className="text-[10px]">Ripristina</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Explanation of Safety Shield Architecture */}
          <div className="p-3.5 bg-[#100D09] rounded-xl border border-[#221A0C] space-y-2 text-[#999] text-[11px] leading-relaxed">
            <h4 className="text-white font-medium text-xs flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Protezione Continua da Disconnessione e Quota Firestore</span>
            </h4>
            <p>
              1. <strong>Archiviazione Ridondante Atomica</strong>: ogni volta che aggiungi o modifichi una risorsa, viene salvata contemporaneamente su IndexedDB locale, sul file di backup del container e nel database remoto.
            </p>
            <p>
              2. <strong>Scudo Antiguerra e Standby</strong>: se il browser viene ricaricato in modalità anonima o se le quote cloud temporanee vengono superate, l&apos;applicazione <strong>non svuota il Vault</strong> ma mantiene intatto lo stato locale e su disco.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#1E190F] bg-[#141009] flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-[10.5px] font-mono text-[#666]">
            Knowledge Vault OKF v0.2 &bull; Resilienza e Persistenza Multi-Tier Garantita
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1C160C] hover:bg-[#282012] text-white text-xs font-mono border border-[#3E3017] transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
