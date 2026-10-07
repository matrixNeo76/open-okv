/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  fbSignOut, 
  onAuthStateChanged, 
  signInAnonymously,
  db, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp,
  getDocs,
  setDoc,
  writeBatch,
  disableNetwork,
  enableNetwork,
  User
} from "../lib/firebase";
import { ResourceItem, DiagnosticLog, RawFileItem, ResourceType } from "../types";
import { initialSampleResources, getInitialSampleResourcesWithIds } from "../lib/sampleData";
import { parseDate, getTimestampMillis } from "../lib/dateUtils";
import { dualLayerStore } from "../lib/cekikj/dualLayerStore";
import { 
  saveCachedResources, 
  loadCachedResources, 
  updateCacheTimestamp,
  DEFAULT_SYNC_INTERVAL_MS,
  saveMultiLayerResources,
  loadFromServerFilesystem,
  isQuotaExceededSaved,
  saveQuotaExceededStatus
} from "../lib/cacheManager";
import { loadResourcesFromIndexedDB, loadRawFilesFromIndexedDB } from "../lib/indexedDb";
import { analyzeResourceConflicts, ConflictAnalysisResult } from "../lib/conflictResolver";
import { performDeepRecoveryScan } from "../lib/recoveryManager";
import { recordLifecycleEvent } from "../lib/resourceLifecycleTracker";
import {
  recordFirestoreRead,
  recordFirestoreWrite,
  recordFirestoreDelete,
  recordFirestoreError,
  setActiveFirestoreListenersCount,
} from "../lib/quotaTelemetry";
import {
  auditSetResourcesOperation,
  recordFirestoreSyncSuccess,
  SetResourcesTraceContext,
} from "../lib/vaultSyncAudit";

// Checks if a value is a plain JavaScript object
function isPlainObject(value: any): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  if (typeof value.toMillis === "function" || typeof value.toDate === "function") return false;
  if ("_methodName" in value || "_delegate" in value) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

// Robust Firestore sanitizer to eliminate all undefined fields recursively
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((v) => v !== undefined)
      .map((v) => (isPlainObject(v) || Array.isArray(v) ? sanitizeForFirestore(v) : v)) as any;
  }
  if (!isPlainObject(obj)) {
    return obj;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    } else if (isPlainObject(value)) {
      result[key] = sanitizeForFirestore(value);
    } else if (Array.isArray(value)) {
      result[key] = value
        .filter((v) => v !== undefined)
        .map((v) => (isPlainObject(v) || Array.isArray(v) ? sanitizeForFirestore(v) : v));
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

// Check if error is strictly related to Firestore quota exhaustion (RESOURCE_EXHAUSTED / 429)
export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();

  // Exclude not-found, permission, network and timeout errors from being marked as quota exhaustion
  if (code.includes("not-found") || msg.includes("not-found") || msg.includes("does not exist")) return false;
  if (code.includes("permission-denied") || msg.includes("permission-denied")) return false;
  if (code.includes("deadline-exceeded") || msg.includes("timed out") || msg.includes("timeout")) return false;
  if (code.includes("unavailable") || msg.includes("could not reach cloud firestore backend")) return false;

  return (
    code.includes("resource-exhausted") ||
    msg.includes("quota limit exceeded") ||
    msg.includes("quota exceeded") ||
    code === "429" ||
    msg.includes(" 429 ")
  );
}

// Check if error is due to timeout, offline or temporary network latency
export function isNetworkOrTimeoutError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    code.includes("deadline-exceeded") ||
    code.includes("unavailable") ||
    msg.includes("latenza") ||
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("could not reach cloud firestore backend") ||
    msg.includes("failed to fetch") ||
    msg.includes("client is offline")
  );
}

// Execute Firestore operations with realistic network timeout
export async function withFirestoreTimeout<T>(operation: Promise<T>, timeoutMs = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new Error("Firestore operation timed out (latenza di connessione di rete temporanea)"));
      }
    }, timeoutMs);

    operation
      .then((res) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          resolve(res);
        }
      })
      .catch((err) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

const DELETED_IDS_STORAGE_KEY = "vault_deleted_resource_ids_v1";

export function getDeletedResourceIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_IDS_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

export function recordDeletedResourceId(id: string): void {
  try {
    const set = getDeletedResourceIds();
    set.add(id);
    localStorage.setItem(DELETED_IDS_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

let multiLayerSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let lastPendingItems: ResourceItem[] | null = null;
let lastPendingRawFiles: RawFileItem[] | undefined = undefined;
let lastPendingUid: string | undefined = undefined;
let lastPendingDeleted: string[] = [];

export function healResourceIntelligence(item: ResourceItem): ResourceItem {
  let modified = false;
  let newSummary = item.summary;
  let newTitle = item.title;
  let newType = item.type;
  let newMetadata = item.metadata ? { ...item.metadata } : {};

  // Auto-heal procedures / SOPs that were ingested or saved with type "knowledge" or "article"
  const isExplicitProcedure = Boolean(
    (item.title && (/procedura\s+operativa\s+standard|\b(sop|playbook)\b/i.test(item.title) || item.title.toLowerCase().includes("procedura operativa standard") || item.title.includes("La Procedura Operativa Standard"))) ||
    item.metadata?.procedureType ||
    (item.tags && item.tags.some((t: string) => t.toLowerCase() === "procedure" || t.toLowerCase() === "sop" || t.toLowerCase() === "playbook"))
  );

  if (isExplicitProcedure && (item.type === "knowledge" || item.type === "article" || !item.type)) {
    newType = "procedure";
    if (!newMetadata.docType) newMetadata.docType = "guide";
    if (!newMetadata.procedureType) newMetadata.procedureType = "customer_support";
    modified = true;
  }

  const isMeetily =
    item.id === "RH48Y3OTh9EznbbXFwcJ" ||
    item.url?.includes("github.com/Zackriya-Solutions/meetily") ||
    (item.title && item.title.includes("Meetily"));

  if (isMeetily) {
    const correctMeetilyExec =
      "Meetily è un assistente per riunioni e meeting minutes open-source orientato alla massima privacy locale (100% on-device). Sviluppato con backend ad alte prestazioni in Rust/Tauri e interfaccia Next.js, esegue la trascrizione audio in tempo reale sfruttando modelli locali all'avanguardia (NVIDIA Parakeet e Whisper con accelerazione GPU Metal/CoreML/Vulkan/CUDA) e genera verbali e sintesi strutturate con LLM locali (Ollama) o endpoint custom compatibili OpenAI, senza mai inviare dati audio o testuali al cloud.";

    const correctMeetilyTakeaways = [
      "Trascrizione 100% Locale & Sovranità dei Dati: Elaborazione audio e memorizzazione dei verbali interamente on-device senza dispersioni nel cloud né dipendenza da API esterne.",
      "Supporto Multi-Modello STT ad Alte Prestazioni: Utilizza NVIDIA Parakeet TDT (fino a 4x più rapido) e Whisper.cpp per una trascrizione accurata a bassissima latenza.",
      "Sintesi Esecutive con LLM Locali e Flessibili: Generazione automatica di verbali, decisioni e azioni tramite Ollama (offline) o endpoint personalizzati (Claude, Groq, OpenAI).",
      "Architettura Desktop Rust & Tauri: Soluzione leggera e reattiva con mixaggio audio intelligente di microfono e audio di sistema, ducking dinamico e prevenzione del clipping.",
      "Import & Enhance e Funzionalità Pro: Capacità di re-ingestione e miglioramento di registrazioni pregresse con modelli superiori, export avanzati e predisposizione per speaker diarization."
    ];

    const correctMeetilyAudience =
      "Team aziendali, professionisti legali, sviluppatori, consulenti e organizzazioni che gestiscono conversazioni riservate e necessitano di verbali automatici nel rispetto rigoroso della privacy e del GDPR.";

    const correctMeetilyActions = [
      "Scaricare e installare l'eseguibile Meetily adeguato alla propria piattaforma (macOS con Metal/CoreML, Windows con Vulkan o build da sorgenti su Linux).",
      "Configurare una sessione locale Ollama o specificare un endpoint OpenAI-compatible per abilitare la sintesi automatica e l'estrazione delle azioni dei meeting.",
      "Testare la trascrizione dal vivo configurando il corretto canale di cattura tra microfono e audio di sistema con il modulo di ducking attivo."
    ];

    const correctMeetilySummary =
      "Meetily è un assistente AI per riunioni e meeting minutes open-source orientato alla massima privacy locale (100% on-device). Basato su architettura Tauri e backend Rust, esegue trascrizione in tempo reale con modelli NVIDIA Parakeet e Whisper, generando riassunti e note tramite Ollama o endpoint personalizzati senza inviare dati al cloud.";

    if (newMetadata.aiExecutiveSummary !== correctMeetilyExec) {
      newMetadata.aiExecutiveSummary = correctMeetilyExec;
      modified = true;
    }
    if (JSON.stringify(newMetadata.aiKeyTakeaways) !== JSON.stringify(correctMeetilyTakeaways)) {
      newMetadata.aiKeyTakeaways = correctMeetilyTakeaways;
      modified = true;
    }
    if (newMetadata.aiTargetAudience !== correctMeetilyAudience) {
      newMetadata.aiTargetAudience = correctMeetilyAudience;
      modified = true;
    }
    if (JSON.stringify(newMetadata.aiActionItems) !== JSON.stringify(correctMeetilyActions)) {
      newMetadata.aiActionItems = correctMeetilyActions;
      modified = true;
    }
    if (newSummary !== correctMeetilySummary) {
      newSummary = correctMeetilySummary;
      modified = true;
    }
  } else {
    // General cleanup for other resources
    if (newMetadata.aiExecutiveSummary && newMetadata.aiExecutiveSummary.includes("analisi di vulnerabilità e metodologie ingegneristiche")) {
      newMetadata.aiExecutiveSummary = newMetadata.aiExecutiveSummary
        .replace(/\.\s*Risorsa tecnica focalizzata su pattern architetturali avanzati,\s*analisi di vulnerabilità e metodologie ingegneristiche per sistemi ad agenti e grafi di conoscenza\.?/gi, ".")
        .replace(/,\s*analisi di vulnerabilità e metodologie ingegneristiche per sistemi ad agenti e grafi di conoscenza\.?/gi, ".")
        .trim();
      modified = true;
    }

    if (Array.isArray(newMetadata.aiKeyTakeaways)) {
      const filtered = newMetadata.aiKeyTakeaways.filter((t: string) => {
        if (!t || typeof t !== "string") return false;
        const s = t.trim();
        if (s.startsWith("[ ]") || s.startsWith("#\n[") || s.startsWith("http") || s.startsWith("[") && s.includes("](")) return false;
        if (s.includes("trendshift.io") || s.includes("github.com") && s.includes("releases")) return false;
        return s.length > 20;
      });
      if (filtered.length !== newMetadata.aiKeyTakeaways.length) {
        newMetadata.aiKeyTakeaways = filtered;
        modified = true;
      }
    }
  }

  const isMinimal =
    !newSummary ||
    newSummary.trim() === "" ||
    newSummary.length < 90 ||
    newSummary.startsWith("http") ||
    newSummary.startsWith("Collegamento web a ") ||
    newSummary.includes("Nota: Il parser") ||
    newSummary.includes("failed_as_link");

  if (newMetadata.aiExecutiveSummary && isMinimal) {
    newSummary = newMetadata.aiExecutiveSummary.slice(0, 320);
    modified = true;
  }

  if (item.title && (item.title.includes("wiht ") || item.title.includes(" wiht") || item.title.includes("wiht\n"))) {
    newTitle = item.title.replace(/\bwiht\b/gi, "with");
    modified = true;
  }

  if (!modified) return item;

  return {
    ...item,
    type: newType,
    title: newTitle,
    summary: newSummary,
    metadata: newMetadata,
  };
}

export function saveLocalResources(items: ResourceItem[], uid?: string, currentRawFiles?: RawFileItem[]) {
  if (items.length === 0) {
    const existing = loadCachedResources(uid);
    if (existing && existing.length > 0) {
      console.warn("[useVaultData] Prevented saving empty array over existing cached resources!");
      return;
    }
  }

  const deletedSet = getDeletedResourceIds();
  let cleanItems = items;
  if (deletedSet.size > 0) {
    cleanItems = items.filter((r) => !deletedSet.has(r.id));
    if (cleanItems.length < items.length) {
      const dropped = items.filter((r) => deletedSet.has(r.id));
      dropped.forEach((d) => {
        recordLifecycleEvent({
          stage: "RESOURCE_DROPPED_TOMBSTONE",
          resourceId: d.id,
          resourceTitle: d.title,
          resourceType: d.type,
          status: "warn",
          message: `Risorsa "${d.title}" (ID: ${d.id}) rimossa dal salvataggio perché marcata nel registro eliminazioni (tombstone)`,
          details: { id: d.id, title: d.title },
        });
      });
    }
  }

  const healedItems = cleanItems.map(healResourceIntelligence);

  // 1. Instant synchronous localStorage cache persistence
  saveCachedResources(healedItems, uid);

  // 2. Debounced multi-layer persistence save (IndexedDB + Server filesystem)
  // Collapses rapid state updates and prevents concurrent overlapping network backups
  lastPendingItems = healedItems;
  lastPendingRawFiles = currentRawFiles;
  lastPendingUid = uid;
  lastPendingDeleted = Array.from(deletedSet);

  if (multiLayerSaveTimeout) {
    clearTimeout(multiLayerSaveTimeout);
  }

  multiLayerSaveTimeout = setTimeout(() => {
    if (lastPendingItems) {
      const toSave = lastPendingItems;
      const toRaw = lastPendingRawFiles;
      const toUid = lastPendingUid;
      const toDeleted = lastPendingDeleted;
      saveMultiLayerResources(toSave, toRaw, toUid, toDeleted).catch((err) => {
        console.warn("[useVaultData] Multi-layer persistence background save error:", err);
      });
    }
  }, 400);
}

export function useVaultData() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resources, setResourcesRaw] = useState<ResourceItem[]>(() => {
    const cached = loadCachedResources();
    const initial = cached && cached.length > 0 ? cached : getInitialSampleResourcesWithIds();
    return initial.map(healResourceIntelligence);
  });
  const [isLoadingResources, setIsLoadingResources] = useState(false);

  const [logs, setLogs] = useState<DiagnosticLog[]>([
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      category: "AUTH",
      message: "Knowledge Vault inizializzato con Persistenza Multi-Livello. Avvio sessione...",
    }
  ]);

  const addLog = (
    level: DiagnosticLog["level"],
    category: DiagnosticLog["category"],
    message: string,
    details?: any
  ) => {
    const newLog: DiagnosticLog = {
      id: "log-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toLocaleTimeString(),
      level,
      category,
      message,
      details,
    };
    setLogs((prev) => [...prev.slice(-150), newLog]);
  };

  // Central Audited Wrapper for all setResources operations
  // Traces call chains, warns on stale local storage overwriting Firestore, and detects count discrepancies
  const setResources = useCallback(
    (
      action: React.SetStateAction<ResourceItem[]>,
      traceContext?: Partial<SetResourcesTraceContext>
    ) => {
      setResourcesRaw((prev) => {
        const rawNext = typeof action === "function" ? (action as (prev: ResourceItem[]) => ResourceItem[])(prev) : action;
        const next = rawNext.map(healResourceIntelligence);
        const ctx: SetResourcesTraceContext = {
          operation: traceContext?.operation || "EXTERNAL_CALLER",
          callerDescription: traceContext?.callerDescription,
          remoteCount: traceContext?.remoteCount,
          docChangesCount: traceContext?.docChangesCount,
          remoteDocIds: traceContext?.remoteDocIds,
          userUid: traceContext?.userUid ?? user?.uid,
          details: traceContext?.details,
        };

        // Audit operation against stale cache overwrites & remote document discrepancies
        auditSetResourcesOperation(prev, next, ctx, addLog);

        return next;
      });
    },
    [user?.uid]
  );

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(() => isQuotaExceededSaved());
  const wasQuotaExceededRef = useRef<boolean>(isQuotaExceededSaved());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());
  const [isSeeding, setIsSeeding] = useState(false);
  const isSeedingRef = useRef(false);

  // Conflict Resolution States
  const [conflictAnalysis, setConflictAnalysis] = useState<ConflictAnalysisResult | null>(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isApplyingMerge, setIsApplyingMerge] = useState(false);

  // Recovery Center & Deep Storage Detection States
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isPersistenceModalOpen, setIsPersistenceModalOpen] = useState(false);
  const [storageDiscrepancyNotice, setStorageDiscrepancyNotice] = useState<{ foundCount: number; currentCount: number } | null>(null);

  const resourcesRef = useRef<ResourceItem[]>(resources);
  useEffect(() => {
    resourcesRef.current = resources;
    if (resources && resources.length > 0) {
      dualLayerStore.syncResources(resources);
    }
  }, [resources]);

  // Multi-Layer Startup Hydration: restore from Backend Server Filesystem or IndexedDB
  useEffect(() => {
    let isMounted = true;
    async function hydrateMultiLayer() {
      try {
        const serverData = await loadFromServerFilesystem();
        if (serverData && serverData.resources && serverData.resources.length > 0 && isMounted) {
          addLog("success", "CACHE", `Archivio persistente Server Backend caricato (${serverData.resources.length} risorse).`);
          setResources(
            (prev) => {
              const analysis = analyzeResourceConflicts(prev, serverData.resources);
              saveLocalResources(analysis.mergedResources, user?.uid);
              return analysis.mergedResources;
            },
            {
              operation: "HYDRATE_SERVER_FS",
              callerDescription: `Startup hydration: ripristino da server filesystem (${serverData.resources.length} risorse archiviate)`,
              details: { count: serverData.resources.length },
            }
          );
        }

        const idbItems = await loadResourcesFromIndexedDB();
        if (idbItems && idbItems.length > 0 && isMounted) {
          addLog("info", "CACHE", `Archivio IndexedDB caricato (${idbItems.length} risorse).`);
          setResources(
            (prev) => {
              const analysis = analyzeResourceConflicts(prev, idbItems);
              saveLocalResources(analysis.mergedResources, user?.uid);
              return analysis.mergedResources;
            },
            {
              operation: "HYDRATE_INDEXED_DB",
              callerDescription: `Startup hydration: ripristino da IndexedDB offline store (${idbItems.length} risorse)`,
              details: { count: idbItems.length },
            }
          );
        }

        setTimeout(async () => {
          if (!isMounted) return;
          try {
            const scan = await performDeepRecoveryScan(resourcesRef.current);
            if (scan.totalUniqueResources > resourcesRef.current.length) {
              setStorageDiscrepancyNotice({
                foundCount: scan.totalUniqueResources,
                currentCount: resourcesRef.current.length,
              });
              addLog(
                "warn",
                "CACHE",
                `Rilevate ${scan.totalUniqueResources} risorse archiviate nei livelli di storage rispetto a ${resourcesRef.current.length} visualizzate. Centro di Recupero disponibile.`
              );
            }
          } catch (e) {
            console.warn("Deep scan background notice:", e);
          }
        }, 1500);
      } catch (err: any) {
        console.warn("Startup multi-layer hydration check:", err?.message || err);
      }
    }

    hydrateMultiLayer();
    return () => { isMounted = false; };
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthLoading(false);
        addLog("success", "AUTH", `Utente autenticato: ${currentUser.email || "Anonimo"} (${currentUser.uid})`);
      } else {
        try {
          addLog("info", "AUTH", "Tentativo di autenticazione anonima rapida...");
          const anonCred = await signInAnonymously(auth);
          setUser(anonCred.user);
          addLog("success", "AUTH", `Sessione anonima stabilita: UID ${anonCred.user.uid}`);
        } catch (err: any) {
          console.warn("Anonymous auth failed, waiting for explicit login:", err);
          addLog("warn", "AUTH", `Autenticazione anonima non riuscita: ${err.message}`);
          setUser(null);
        } finally {
          setAuthLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Proactively disable/enable network according to quota status
  useEffect(() => {
    saveQuotaExceededStatus(quotaExceeded);
    if (quotaExceeded) {
      disableNetwork(db).catch(() => {});
    } else {
      enableNetwork(db).catch(() => {});
    }
  }, [quotaExceeded]);

  // Realtime listener for User's Firestore Resources
  useEffect(() => {
    if (!user) {
      const localCached = loadCachedResources();
      if (localCached && localCached.length > 0) {
        setResources(localCached, {
          operation: "AUTH_UNAUTHENTICATED_CACHE",
          callerDescription: `Caricamento cache locale utente non autenticato (${localCached.length} risorse)`,
          details: { count: localCached.length },
        });
      }
      setIsLoadingResources(false);
      return;
    }

    if (quotaExceeded) {
      setIsLoadingResources(false);
      const cached = loadCachedResources(user.uid);
      if (cached && cached.length > 0) {
        setResources(cached, {
          operation: "FIRESTORE_SNAPSHOT_ERROR_CACHE",
          userUid: user.uid,
          callerDescription: `Quota superata: fallback su cache locale (${cached.length} risorse)`,
          details: { count: cached.length },
        });
      }
      return;
    }

    setIsLoadingResources(true);
    addLog("info", "FIRESTORE", `Sottoscrizione realtime alla collezione 'resources' per UID: ${user.uid}`);

    const resourcesColRef = collection(db, "resources");
    const q = query(
      resourcesColRef,
      where("userId", "==", user.uid)
    );

    let unsubscribe: (() => void) | null = null;
    try {
      setActiveFirestoreListenersCount(1);
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const readCount = snapshot.docChanges().length || snapshot.size;
          if (readCount > 0) {
            recordFirestoreRead(
              readCount,
              "Listener Realtime (onSnapshot)",
              `Ricevuti ${snapshot.size} documenti (${snapshot.docChanges().length} modificati)`
            );
          }

          const items: ResourceItem[] = [];
          snapshot.forEach((docSnap) => {
            const rawData = docSnap.data() as Omit<ResourceItem, "id">;
            const validatedCreatedAt = parseDate(rawData.createdAt) || parseDate(rawData.updatedAt) || new Date();
            const rawItem: ResourceItem = {
              id: docSnap.id,
              ...rawData,
              createdAt: rawData.createdAt ? (parseDate(rawData.createdAt) ? rawData.createdAt : validatedCreatedAt) : validatedCreatedAt,
            };
            items.push(healResourceIntelligence(rawItem));
          });

          items.sort((a, b) => {
            const timeA = getTimestampMillis(a.createdAt);
            const timeB = getTimestampMillis(b.createdAt);
            return timeB - timeA;
          });

          const currentLocalItems = resourcesRef.current;
          const currentLocalCount = currentLocalItems.length;

          recordLifecycleEvent({
            stage: "REALTIME_SNAPSHOT_RECEIVED",
            status: "info",
            message: `Snapshot realtime Firestore: ricevuti ${items.length} documenti remoti (stato locale attuale: ${currentLocalCount})`,
            details: { remoteCount: items.length, localCount: currentLocalCount },
          });

          if (snapshot.empty) {
            if (currentLocalCount > 0) {
              addLog(
                "info",
                "FIRESTORE",
                `Firestore connesso per ${user.email || user.uid} (0 documenti remoti trovati). ${currentLocalCount} risorse locali mantenute e protette dallo scudo di sicurezza.`
              );
              setIsLoadingResources(false);
              return;
            } else {
              const cached = loadCachedResources(user.uid);
              if (cached && cached.length > 0) {
                setResources(cached, {
                  operation: "FIRESTORE_SNAPSHOT_EMPTY_CACHE",
                  remoteCount: 0,
                  userUid: user.uid,
                  callerDescription: `Snapshot Firestore vuoto per nuovo utente, ripristino risorse cache (${cached.length} risorse)`,
                  details: { count: cached.length },
                });
              }
              setIsLoadingResources(false);
              return;
            }
          }

          // Reconcile remote snapshot with current local state safely
          const analysis = analyzeResourceConflicts(currentLocalItems, items);

          // Audit for any local resource that might have been unmerged
          const mergedIdSet = new Set(analysis.mergedResources.map((r) => r.id));
          const unmergedItems = currentLocalItems.filter((r) => !mergedIdSet.has(r.id));
          if (unmergedItems.length > 0) {
            unmergedItems.forEach((unm) => {
              recordLifecycleEvent({
                stage: "CONFLICT_RECONCILIATION",
                resourceId: unm.id,
                resourceTitle: unm.title,
                resourceType: unm.type,
                status: "info",
                message: `Riconciliazione: ID locale "${unm.id}" ("${unm.title}") unificato con record Firestore`,
                details: { originalId: unm.id, title: unm.title },
              });
            });
          }

          recordLifecycleEvent({
            stage: "CONFLICT_RECONCILIATION",
            status: "success",
            message: `Merge completato: ${analysis.mergedResources.length} risorse attive nel Vault (${analysis.localOnlyCount} locali, ${analysis.remoteOnlyCount} remote, ${analysis.identicalCount} identiche)`,
            details: {
              total: analysis.mergedResources.length,
              localOnly: analysis.localOnlyCount,
              remoteOnly: analysis.remoteOnlyCount,
              identical: analysis.identicalCount,
            },
          });

          // Record verified remote baseline in audit tracker
          recordFirestoreSyncSuccess(items, user.uid);

          setConflictAnalysis(analysis.hasConflicts ? analysis : null);
          setResources(analysis.mergedResources, {
            operation: "FIRESTORE_SNAPSHOT",
            remoteCount: items.length,
            docChangesCount: snapshot.docChanges().length,
            remoteDocIds: items.map((r) => r.id),
            userUid: user.uid,
            callerDescription: `Snapshot Firestore realtime: ${items.length} doc remoti, ${snapshot.docChanges().length} modifiche, ${analysis.mergedResources.length} unificati`,
            details: {
              localCountBefore: currentLocalCount,
              localOnly: analysis.localOnlyCount,
              remoteOnly: analysis.remoteOnlyCount,
              identical: analysis.identicalCount,
            },
          });
          saveLocalResources(analysis.mergedResources, user.uid);
          setQuotaExceeded(false);
          wasQuotaExceededRef.current = false;
          saveQuotaExceededStatus(false);
          addLog(
            "info",
            "FIRESTORE",
            `Sincronizzazione realtime Firestore: ${analysis.mergedResources.length} risorse attive allineate e preservate.`
          );
          setIsLoadingResources(false);
        },
        (error) => {
          console.warn("Firestore snapshot notice:", error?.message || error);
          recordFirestoreError(error, "Listener Realtime (onSnapshot)");
          if (isQuotaError(error)) {
            setQuotaExceeded(true);
            wasQuotaExceededRef.current = true;
            disableNetwork(db).catch(() => {});
            addLog("warn", "FIRESTORE", "Limite quota giornaliera Firestore (Free Tier) raggiunto. Attivata persistenza multi-livello offline/locale.");
            const cached = loadCachedResources(user?.uid);
            if (cached && cached.length > 0) {
              setResources(cached, {
                operation: "FIRESTORE_SNAPSHOT_ERROR_CACHE",
                userUid: user?.uid,
                callerDescription: `Errore quota listener: fallback cache locale (${cached.length} risorse)`,
                details: { count: cached.length },
              });
            }
          } else {
            addLog("error", "FIRESTORE", `Errore sincronizzazione Firestore: ${error.message}`, error);
            setStatusMessage(`Errore di connessione Firestore: ${error.message}`);
          }
          setIsLoadingResources(false);
        }
      );
    } catch (err: any) {
      console.warn("Snapshot setup error:", err);
      recordFirestoreError(err, "Listener Realtime setup");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        disableNetwork(db).catch(() => {});
      }
      setIsLoadingResources(false);
    }

    return () => {
      setActiveFirestoreListenersCount(0);
      if (unsubscribe) unsubscribe();
    };
  }, [user, quotaExceeded]);

  // Periodic Auto-Sync Timer (10m)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!quotaExceeded) {
        addLog("info", "CACHE", "Timer di auto-sincronizzazione (10m) scattato.");
        handleTriggerSync();
      }
    }, DEFAULT_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user, quotaExceeded]);

  // Apply resolved merge back to Firestore and local state
  const handleApplyConflictMerge = async (resolvedItems: ResourceItem[], toUpload: ResourceItem[]) => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) return;
    setIsApplyingMerge(true);
    addLog("info", "FIRESTORE", `Avvio applicazione merge: ${resolvedItems.length} risorse totali, ${toUpload.length} da inviare a Firestore...`);
    
    try {
      let uploadCount = 0;
      if (toUpload.length > 0) {
        for (const item of toUpload) {
          const docRef = doc(db, "resources", item.id);
          const cleanPayload = sanitizeForFirestore({
            userId: activeUser.uid,
            type: item.type,
            title: item.title,
            url: item.url || "",
            rawInput: item.rawInput || "",
            summary: item.summary,
            tags: item.tags || [],
            isFavorite: item.isFavorite || false,
            rating: item.rating,
            metadata: item.metadata || {},
            createdAt: parseDate(item.createdAt) || new Date(),
            updatedAt: serverTimestamp(),
          });
          await setDoc(docRef, cleanPayload);
          uploadCount++;
        }
        addLog("success", "FIRESTORE", `Caricate ${uploadCount} risorse su Firestore durante la riconciliazione.`);
      }

      setResources(resolvedItems, {
        operation: "CONFLICT_MERGE_APPLY",
        callerDescription: `Applicazione manuale/guidata merge conflitti (${resolvedItems.length} risorse unificate)`,
        details: { count: resolvedItems.length, uploadedCount: uploadCount },
      });
      saveLocalResources(resolvedItems, activeUser.uid);
      setQuotaExceeded(false);
      wasQuotaExceededRef.current = false;
      setLastSyncTime(new Date());
      updateCacheTimestamp();
      setIsConflictModalOpen(false);
      setConflictAnalysis(null);
      setStatusMessage(`Merge completato: ${resolvedItems.length} risorse unificate e sincronizzate con il cloud.`);
      setTimeout(() => setStatusMessage(null), 5000);
      addLog("success", "FIRESTORE", `Riconciliazione conflitti completata con successo (${resolvedItems.length} risorse totali).`);
    } catch (err: any) {
      console.error("Conflict merge error:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        addLog("warn", "FIRESTORE", "Quota Firestore ancora esaurita durante il merge. Le modifiche rimangono protette in locale.");
        setErrorMessage("Quota Firestore non ancora reimpostata. Le modifiche rimangono protette in memoria locale e su disco.");
      } else {
        addLog("error", "FIRESTORE", `Errore applicazione merge: ${err.message}`, err);
        setErrorMessage(`Errore merge: ${err.message}`);
      }
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsApplyingMerge(false);
    }
  };

  // Upload local-only resources directly to Firestore
  const handleUploadUnsyncedResources = async () => {
    const activeUser = user || auth.currentUser;
    if (!activeUser) {
      setErrorMessage("Nessun utente attivo per inviare a Firestore. Accedi con Google.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const localOnly = resources.filter(
      (r) =>
        r.id.startsWith("local-") ||
        r.id.startsWith("conv-") ||
        r.id.startsWith("seed-") ||
        r.id.startsWith("okf-sync-") ||
        r.id.startsWith("spec-")
    );

    if (localOnly.length === 0) {
      setStatusMessage("Tutte le risorse sono già collegate a Firestore!");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setIsSyncing(true);
    addLog("info", "FIRESTORE", `Caricamento di ${localOnly.length} risorse locali su Firestore...`);

    try {
      await enableNetwork(db).catch(() => {});
      const updatedResources = [...resources];
      let uploadedCount = 0;

      for (const item of localOnly) {
        const rawData = {
          userId: activeUser.uid,
          type: item.type,
          title: item.title,
          url: item.url || "",
          rawInput: item.rawInput || "",
          summary: item.summary,
          tags: item.tags || [],
          isFavorite: item.isFavorite || false,
          rating: item.rating,
          metadata: item.metadata || {},
          createdAt: parseDate(item.createdAt) || new Date(),
          updatedAt: serverTimestamp(),
        };

        const docRef = await withFirestoreTimeout(
          addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)),
          10000
        );
        recordFirestoreWrite();

        const idx = updatedResources.findIndex((r) => r.id === item.id);
        if (idx !== -1) {
          updatedResources[idx] = {
            ...item,
            id: docRef.id,
            userId: activeUser.uid,
            createdAt: item.createdAt,
            updatedAt: new Date(),
          };
        }
        uploadedCount++;
      }

      setResources(updatedResources, {
        operation: "UPLOAD_UNSYNCED",
        callerDescription: `Caricamento completato di ${uploadedCount} risorse locali con ID Firestore`,
        details: { count: updatedResources.length, uploadedCount },
      });
      saveLocalResources(updatedResources, activeUser.uid);
      setQuotaExceeded(false);
      wasQuotaExceededRef.current = false;
      saveQuotaExceededStatus(false);
      setLastSyncTime(new Date());

      addLog("success", "FIRESTORE", `${uploadedCount} risorsa/e caricata/e su Firestore con successo.`);
      setStatusMessage(`${uploadedCount} risorsa/e salvata/e su Firestore! ID cloud generato.`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      addLog("error", "FIRESTORE", `Errore caricamento su Firestore: ${err.message}`, err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        setErrorMessage("Quota Firestore esaurita per oggi.");
      } else {
        setErrorMessage(`Errore Firestore: ${err.message}`);
      }
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Trigger sync with Firestore & conflict analysis
  const handleTriggerSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    addLog("info", "FIRESTORE", "Avvio sincronizzazione con Firestore e verifica conflitti...");
    try {
      if (!user) {
        setIsSyncing(false);
        return;
      }
      await enableNetwork(db).catch(() => {});

      const resourcesRefCollection = collection(db, "resources");
      const q = query(resourcesRefCollection, where("userId", "==", user.uid));
      const snap = await getDocs(q);
      
      recordFirestoreRead(
        snap.size,
        "Sincronizzazione Manuale / Periodica",
        `Letti ${snap.size} documenti dalla collezione Firestore`
      );

      const items: ResourceItem[] = [];
      snap.forEach((docSnap) => {
        const rawData = docSnap.data() as Omit<ResourceItem, "id">;
        const validatedCreatedAt = parseDate(rawData.createdAt) || parseDate(rawData.updatedAt) || new Date();
        items.push({
          id: docSnap.id,
          ...rawData,
          createdAt: rawData.createdAt ? (parseDate(rawData.createdAt) ? rawData.createdAt : validatedCreatedAt) : validatedCreatedAt,
        });
      });

      items.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      const analysis = analyzeResourceConflicts(resourcesRef.current, items);

      // Only open conflict review dialog if there are TRUE timestamp divergences
      const hasTrueDivergence = analysis.localNewerCount > 0 || analysis.remoteNewerCount > 0;
      setConflictAnalysis(hasTrueDivergence ? analysis : null);

      // Record verified remote baseline in audit tracker
      recordFirestoreSyncSuccess(items, user.uid);

      setResources(analysis.mergedResources, {
        operation: "TRIGGER_SYNC_GETDOCS",
        remoteCount: snap.size,
        remoteDocIds: items.map((i) => i.id),
        userUid: user.uid,
        callerDescription: `Sincronizzazione manuale getDocs: ${snap.size} documenti remoti, ${analysis.mergedResources.length} unificati`,
        details: {
          localCountBefore: resourcesRef.current.length,
          localOnly: analysis.localOnlyCount,
          remoteOnly: analysis.remoteOnlyCount,
          hasConflicts: hasTrueDivergence,
        },
      });
      saveLocalResources(analysis.mergedResources, user.uid);
      setQuotaExceeded(false);
      wasQuotaExceededRef.current = false;
      setLastSyncTime(new Date());
      updateCacheTimestamp();

      // Automatically promote any pending local/temporary resources to Firestore
      const pendingToPromote = analysis.mergedResources.filter(
        (r) =>
          r.id.startsWith("local-") ||
          r.id.startsWith("conv-") ||
          r.id.startsWith("okf-sync-") ||
          r.id.startsWith("seed-")
      );

      if (pendingToPromote.length > 0 && !wasQuotaExceededRef.current) {
        addLog("info", "FIRESTORE", `Auto-sincronizzazione: rilevate ${pendingToPromote.length} risorse locali in attesa, avvio promozione cloud...`);
        setTimeout(() => {
          handleUploadUnsyncedResources().catch((promoErr) => {
            console.warn("Auto-promotion deferred:", promoErr);
          });
        }, 1200);
      }

      addLog(
        "success",
        "FIRESTORE",
        `Sincronizzazione completata: ${analysis.mergedResources.length} risorse allineate (${items.length} cloud, ${analysis.localOnlyCount} locali).`
      );
      setStatusMessage(`Sincronizzazione completata: ${analysis.mergedResources.length} risorse allineate.`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      recordFirestoreError(err, "Sincronizzazione (handleTriggerSync)");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        disableNetwork(db).catch(() => {});
        addLog("warn", "FIRESTORE", "Quota Firestore esaurita durante il sync. Modalità locale mantenuta attiva.");
      } else {
        addLog("error", "FIRESTORE", `Errore sincronizzazione: ${err.message}`, err);
        setErrorMessage(`Errore sincronizzazione: ${err.message}`);
        setTimeout(() => setErrorMessage(null), 4000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCheckConflicts = async () => {
    if (!user) return;
    try {
      const resourcesRefCollection = collection(db, "resources");
      const q = query(resourcesRefCollection, where("userId", "==", user.uid));
      const snap = await getDocs(q);
      const items: ResourceItem[] = [];
      snap.forEach((docSnap) => {
        const rawData = docSnap.data() as Omit<ResourceItem, "id">;
        const validatedCreatedAt = parseDate(rawData.createdAt) || parseDate(rawData.updatedAt) || new Date();
        items.push({
          id: docSnap.id,
          ...rawData,
          createdAt: rawData.createdAt ? (parseDate(rawData.createdAt) ? rawData.createdAt : validatedCreatedAt) : validatedCreatedAt,
        });
      });
      const analysis = analyzeResourceConflicts(resourcesRef.current, items);
      setConflictAnalysis(analysis);
      setIsConflictModalOpen(true);
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        setErrorMessage("Quota Firestore esaurita.");
      }
    }
  };

  // Auth Handlers
  const handleGoogleSignIn = async () => {
    try {
      addLog("info", "AUTH", "Avvio login con Google popup...");
      const result = await signInWithPopup(auth, googleProvider);
      addLog("success", "AUTH", `Login Google completato: ${result.user.email}`);
    } catch (error: any) {
      console.error("Google Sign-In failed:", error);
      addLog("error", "AUTH", `Login Google fallito: ${error.message}`, error);
      alert("Accesso con Google non riuscito o popup bloccato.");
    }
  };

  const handleSignOut = async () => {
    try {
      addLog("info", "AUTH", "Disconnessione utente...");
      await fbSignOut(auth);
      await signInAnonymously(auth);
      addLog("success", "AUTH", "Disconnesso. Nuova sessione anonima creata.");
    } catch (error: any) {
      console.error("Sign-Out error:", error);
      addLog("error", "AUTH", `Errore durante sign-out: ${error.message}`, error);
    }
  };

  // Seed / Sync system documentation suite & demo data
  const handleSeedDemoData = async (forceOverwrite = false, currentResourceList?: ResourceItem[]) => {
    const activeUser = user || auth.currentUser;
    if (!activeUser) return;
    if (isSeedingRef.current) return;
    
    isSeedingRef.current = true;
    setIsSeeding(true);
    addLog("info", "CAPTURE", "Inizializzazione e allineamento suite documentale OKF v0.2 nel Vault...");

    if (quotaExceeded) {
      const activeResources = currentResourceList || resources;
      const merged = [...activeResources];
      let addedCount = 0;

      for (const sample of initialSampleResources) {
        const existingIdx = merged.findIndex(
          (r) =>
            r.title.trim().toLowerCase() === sample.title.trim().toLowerCase() ||
            (sample.url && r.url && r.url.trim().toLowerCase() === sample.url.trim().toLowerCase())
        );

        if (existingIdx === -1) {
          merged.push({
            ...sample,
            id: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            userId: activeUser.uid,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ResourceItem);
          addedCount++;
        }
      }

      setResources(merged, {
        operation: "SEED_DEMO_DATA",
        callerDescription: `Seed documentazione locale su quota esaurita (${addedCount} documenti inseriti)`,
        details: { count: merged.length, addedCount },
      });
      saveLocalResources(merged, activeUser.uid);
      setStatusMessage(`Suite OKF v0.2 sincronizzata in memoria locale (${addedCount} documenti).`);
      setTimeout(() => setStatusMessage(null), 4000);
      isSeedingRef.current = false;
      setIsSeeding(false);
      return;
    }

    try {
      const activeResources = currentResourceList || resources;
      const batch = writeBatch(db);
      let addedCount = 0;
      let updatedCount = 0;

      for (const sample of initialSampleResources) {
        const existing = activeResources.find(
          (r) =>
            r.title.trim().toLowerCase() === sample.title.trim().toLowerCase() ||
            (sample.url && r.url && r.url.trim().toLowerCase() === sample.url.trim().toLowerCase())
        );

        if (existing) {
          const currentMdLen = (existing.metadata?.markdownContent || "").length;
          const sampleMdLen = (sample.metadata?.markdownContent || "").length;

          if (forceOverwrite || currentMdLen < 500 || (sampleMdLen > currentMdLen + 200 && existing.type === "knowledge")) {
            const docRef = doc(db, "resources", existing.id);
            const itemToUpdate = sanitizeForFirestore({
              title: sample.title,
              summary: sample.summary,
              type: sample.type,
              tags: sample.tags,
              isFavorite: sample.isFavorite ?? existing.isFavorite ?? false,
              metadata: {
                ...existing.metadata,
                ...sample.metadata,
                markdownContent: sample.metadata?.markdownContent || existing.metadata?.markdownContent,
              },
              updatedAt: serverTimestamp(),
            });
            batch.update(docRef, itemToUpdate);
            updatedCount++;
          }
        } else {
          const newDocRef = doc(collection(db, "resources"));
          const itemToSave = sanitizeForFirestore({
            ...sample,
            url: sample.url || "",
            userId: activeUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(newDocRef, itemToSave);
          addedCount++;
        }
      }

      if (addedCount > 0 || updatedCount > 0) {
        await withFirestoreTimeout(batch.commit(), 10000);
        addLog("success", "CAPTURE", `Sincronizzazione OKF v0.2 completata: ${addedCount} nuove, ${updatedCount} aggiornate!`);
        setStatusMessage(`Suite OKF v0.2 allineata: ${addedCount} create, ${updatedCount} aggiornate.`);
      } else {
        addLog("info", "CAPTURE", "Tutti i documenti del Vault sono già allineati alle specifiche complete OKF v0.2.");
        setStatusMessage("I documenti del Vault sono già aggiornati alle specifiche complete OKF v0.2.");
      }
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.warn("Seed notice:", err?.message || err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        addLog("warn", "FIRESTORE", "Quota scritture giornaliere Firestore esaurita durante il seed. Caricamento documentazione in memoria locale.");
        setResources(initialSampleResources as ResourceItem[], {
          operation: "SEED_DEMO_DATA",
          callerDescription: `Seed documentazione iniziale offline (${initialSampleResources.length} documenti)`,
          details: { count: initialSampleResources.length },
        });
        saveLocalResources(initialSampleResources as ResourceItem[], activeUser.uid);
        setStatusMessage("Modalità sessione locale: Suite documentale OKF v0.2 caricata con successo.");
      } else {
        addLog("error", "CAPTURE", `Errore sincronizzazione documentazione: ${err.message}`, err);
        setErrorMessage("Errore nel caricamento della documentazione: " + err.message);
      }
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      isSeedingRef.current = false;
      setIsSeeding(false);
    }
  };

  // Alias for semantic clarity across the application
  const handleSyncSystemSpecs = handleSeedDemoData;

  // Batch Import OKF Items (e.g. from GitHub or Local Sync)
  const handleBatchImportOkfItems = async (
    itemsToImport: Array<Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">>,
    sourceLabel = "GitHub / OKF Sync"
  ): Promise<{ added: number; updated: number }> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch {
        activeUser = { uid: "local-user" } as any;
      }
    }

    if (!itemsToImport || itemsToImport.length === 0) {
      return { added: 0, updated: 0 };
    }

    addLog("info", "CAPTURE", `Avvio importazione batch di ${itemsToImport.length} risorse da ${sourceLabel}...`);

    if (quotaExceeded) {
      let added = 0;
      let updated = 0;
      const currentList = [...resources];

      for (const item of itemsToImport) {
        const existingIdx = currentList.findIndex(
          (r) =>
            r.title.trim().toLowerCase() === item.title.trim().toLowerCase() ||
            (item.url && r.url && r.url.trim().toLowerCase() === item.url.trim().toLowerCase())
        );

        if (existingIdx !== -1) {
          currentList[existingIdx] = {
            ...currentList[existingIdx],
            ...item,
            metadata: {
              ...currentList[existingIdx].metadata,
              ...item.metadata,
            },
            updatedAt: new Date(),
          };
          updated++;
        } else {
          currentList.unshift({
            ...item,
            id: `okf-sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            userId: activeUser!.uid,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ResourceItem);
          added++;
        }
      }

      setResources(currentList, {
        operation: "BATCH_IMPORT_OKF",
        callerDescription: `Import batch locale/offline da ${sourceLabel} (${added} nuove, ${updated} aggiornate)`,
        details: { count: currentList.length, added, updated },
      });
      saveLocalResources(currentList, activeUser!.uid);
      addLog("success", "CAPTURE", `Importazione batch completata in memoria locale: ${added} nuove, ${updated} aggiornate.`);
      setStatusMessage(`Sincronizzate ${added + updated} risorse nel Vault.`);
      setTimeout(() => setStatusMessage(null), 4000);
      return { added, updated };
    }

    try {
      const batch = writeBatch(db);
      let added = 0;
      let updated = 0;

      for (const item of itemsToImport) {
        const existing = resources.find(
          (r) =>
            r.title.trim().toLowerCase() === item.title.trim().toLowerCase() ||
            (item.url && r.url && r.url.trim().toLowerCase() === item.url.trim().toLowerCase())
        );

        if (existing) {
          const docRef = doc(db, "resources", existing.id);
          const itemToUpdate = sanitizeForFirestore({
            title: item.title,
            summary: item.summary,
            type: item.type,
            tags: item.tags,
            url: item.url || existing.url || "",
            metadata: {
              ...existing.metadata,
              ...item.metadata,
            },
            updatedAt: serverTimestamp(),
          });
          batch.update(docRef, itemToUpdate);
          updated++;
        } else {
          const newDocRef = doc(collection(db, "resources"));
          const itemToSave = sanitizeForFirestore({
            ...item,
            url: item.url || "",
            userId: activeUser!.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(newDocRef, itemToSave);
          added++;
        }
      }

      await withFirestoreTimeout(batch.commit(), 5500);
      
      recordLifecycleEvent({
        stage: "FIRESTORE_WRITE_SUCCESS",
        status: "success",
        message: `Importazione batch Firestore completata: ${added} nuove risorse inserite, ${updated} aggiornate`,
        details: { added, updated, totalItems: itemsToImport.length },
      });

      // Update state in memory immediately so cards and counts reflect the imported items without waiting
      setResources((prev) => {
        const list = [...prev];
        itemsToImport.forEach((imported) => {
          const idx = list.findIndex(
            (r) =>
              (imported.url && r.url && r.url.trim().toLowerCase() === imported.url.trim().toLowerCase()) ||
              r.title.trim().toLowerCase() === imported.title.trim().toLowerCase()
          );
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...imported, updatedAt: new Date() };
          } else {
            list.unshift({
              ...imported,
              id: "imp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
              userId: activeUser!.uid,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        });
        saveLocalResources(list, activeUser!.uid);
        return list;
      }, {
        operation: "BATCH_IMPORT_OKF",
        callerDescription: `Import batch Firestore completato (${added} create, ${updated} aggiornate)`,
        details: { added, updated, total: itemsToImport.length },
      });

      addLog("success", "CAPTURE", `Sincronizzazione OKF completata: ${added} create, ${updated} aggiornate.`);
      setStatusMessage(`Sincronizzate con successo ${added + updated} risorse nel Vault!`);
      setTimeout(() => setStatusMessage(null), 4000);
      return { added, updated };
    } catch (err: any) {
      console.warn("Batch import error:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
      }
      let added = 0;
      let updated = 0;
      const currentList = [...resources];
      for (const item of itemsToImport) {
        const existingIdx = currentList.findIndex(
          (r) =>
            r.title.trim().toLowerCase() === item.title.trim().toLowerCase() ||
            (item.url && r.url && r.url.trim().toLowerCase() === item.url.trim().toLowerCase())
        );
        if (existingIdx !== -1) {
          currentList[existingIdx] = {
            ...currentList[existingIdx],
            ...item,
            updatedAt: new Date(),
          };
          updated++;
        } else {
          currentList.unshift({
            ...item,
            id: `okf-sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            userId: activeUser!.uid,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ResourceItem);
          added++;
        }
      }
      setResources(currentList, {
        operation: "BATCH_IMPORT_OKF",
        callerDescription: `Import batch fallback su errore Firestore (${added} create, ${updated} aggiornate)`,
        details: { count: currentList.length, added, updated },
      });
      saveLocalResources(currentList, activeUser!.uid);
      setStatusMessage(`Risorse salvate nella memoria locale (${added + updated} elementi).`);
      setTimeout(() => setStatusMessage(null), 4000);
      return { added, updated };
    }
  };

  // Manual Add Handler
  const handleManualAdd = async (
    newResource: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">
  ): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch (authErr: any) {
        addLog("warn", "FIRESTORE", "Tentativo di inserimento manuale senza utente.");
        return false;
      }
    }

    if (quotaExceeded) {
      const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const localResource: ResourceItem = {
        id: localId,
        userId: activeUser.uid,
        type: newResource.type,
        title: newResource.title,
        url: newResource.url ? newResource.url.trim() : "",
        rawInput: newResource.rawInput || "",
        summary: newResource.summary,
        tags: newResource.tags || [],
        isFavorite: !!newResource.isFavorite,
        metadata: newResource.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setResources((prev) => {
        const updated = [localResource, ...prev];
        saveLocalResources(updated, activeUser.uid);
        return updated;
      }, {
        operation: "MANUAL_ADD",
        callerDescription: `Aggiunta manuale offline: "${newResource.title}"`,
        details: { id: localId, title: newResource.title },
      });

      setStatusMessage("Risorsa salvata con successo nel Vault!");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    }

    try {
      addLog("info", "FIRESTORE", `Inserimento manuale: "${newResource.title}" [${newResource.type}]`);

      // Controllo deduplicazione preventiva rispetto al patrimonio esistente
      const cleanTitle = (newResource.title || "").trim().toLowerCase();
      const cleanUrl = newResource.url ? newResource.url.trim().toLowerCase().replace(/\/$/, "") : "";
      const cleanArxiv = (newResource.metadata?.arxivId || "").trim().toLowerCase();

      const existingDup = resources.find((r) => {
        if (cleanArxiv && r.metadata?.arxivId && r.metadata.arxivId.trim().toLowerCase() === cleanArxiv) {
          return true;
        }
        if (cleanUrl && r.url && r.url.trim().toLowerCase().replace(/\/$/, "") === cleanUrl) {
          return true;
        }
        if (cleanTitle && cleanTitle.length > 8 && r.title && r.title.trim().toLowerCase() === cleanTitle) {
          return true;
        }
        return false;
      });

      if (existingDup) {
        addLog("info", "FIRESTORE", `Risorsa "${newResource.title}" già presente (ID: ${existingDup.id}). Aggiornamento ed arricchimento senza creare duplicati.`);
        const mergedData = {
          type: newResource.type || existingDup.type,
          summary: newResource.summary || existingDup.summary,
          tags: Array.from(new Set([...(existingDup.tags || []), ...(newResource.tags || [])])),
          metadata: {
            ...(existingDup.metadata || {}),
            ...(newResource.metadata || {}),
          },
          updatedAt: serverTimestamp(),
        };

        if (existingDup.id && !existingDup.id.startsWith("local-")) {
          await withFirestoreTimeout(
            setDoc(doc(db, "resources", existingDup.id), sanitizeForFirestore(mergedData), { merge: true }),
            8000
          );
        }

        setResources((prev) =>
          prev.map((r) => (r.id === existingDup.id ? { ...r, ...mergedData, updatedAt: new Date() } : r))
        );
        return true;
      }

      const rawData = {
        userId: activeUser.uid,
        type: newResource.type,
        title: newResource.title,
        url: newResource.url ? newResource.url.trim() : "",
        rawInput: newResource.rawInput || "",
        summary: newResource.summary,
        tags: newResource.tags || [],
        isFavorite: !!newResource.isFavorite,
        metadata: newResource.metadata || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)), 8000);
      recordFirestoreWrite(1, "Creazione Risorsa", newResource.title);
      addLog("success", "FIRESTORE", `Risorsa inserita con successo (ID: ${docRef.id})`);

      const savedItem: ResourceItem = {
        id: docRef.id,
        ...rawData,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ResourceItem;

      setResources((prev) => {
        const filtered = prev.filter((r) => r.id !== docRef.id);
        const updated = [savedItem, ...filtered];
        saveLocalResources(updated, activeUser.uid);
        return updated;
      }, {
        operation: "MANUAL_ADD",
        callerDescription: `Aggiunta manuale Firestore: "${newResource.title}" (ID: ${docRef.id})`,
        details: { id: docRef.id, title: newResource.title },
      });

      setStatusMessage("Risorsa salvata con successo nel Vault!");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    } catch (error: any) {
      recordFirestoreError(error, "Creazione Risorsa");
      if (isQuotaError(error)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localResource: ResourceItem = {
          id: localId,
          userId: activeUser.uid,
          type: newResource.type,
          title: newResource.title,
          url: newResource.url ? newResource.url.trim() : "",
          rawInput: newResource.rawInput || "",
          summary: newResource.summary,
          tags: newResource.tags || [],
          isFavorite: !!newResource.isFavorite,
          metadata: newResource.metadata || {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        setResources((prev) => {
          const updated = [localResource, ...prev];
          saveLocalResources(updated, activeUser.uid);
          return updated;
        }, {
          operation: "MANUAL_ADD",
          callerDescription: `Aggiunta manuale su errore quota: "${newResource.title}"`,
          details: { id: localId, title: newResource.title },
        });

        setStatusMessage("Risorsa salvata in modalità offline (Quota Firestore esaurita)");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }

      console.warn("Add to cloud deferred/falling back to local storage:", error?.message || error);
      // If Firestore failed due to database NOT_FOUND or network/timeout, save safely to local storage
      const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const localResource: ResourceItem = {
        id: localId,
        userId: activeUser.uid,
        type: newResource.type,
        title: newResource.title,
        url: newResource.url ? newResource.url.trim() : "",
        rawInput: newResource.rawInput || "",
        summary: newResource.summary,
        tags: newResource.tags || [],
        isFavorite: !!newResource.isFavorite,
        metadata: newResource.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setResources((prev) => {
        const updated = [localResource, ...prev];
        saveLocalResources(updated, activeUser.uid);
        return updated;
      }, {
        operation: "MANUAL_ADD",
        callerDescription: `Aggiunta manuale fallback locale: "${newResource.title}"`,
        details: { id: localId, title: newResource.title },
      });

      const isNotFound = String(error?.message || "").includes("NOT_FOUND") || String(error?.code || "").includes("not-found");
      const noticeMsg = isNotFound
        ? "Risorsa salvata nel Vault locale (Database Cloud Firestore in attesa di configurazione/provisioning)"
        : `Risorsa salvata nel Vault locale (Connessione Cloud non riuscita: ${error.message || "offline"})`;

      addLog("warn", "FIRESTORE", noticeMsg, error);
      setStatusMessage(noticeMsg);
      setTimeout(() => setStatusMessage(null), 4000);
      return true;
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (id: string, currentFav: boolean) => {
    const nextFav = !currentFav;
    setResources((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, isFavorite: nextFav } : item));
      saveLocalResources(updated, user?.uid);
      return updated;
    }, {
      operation: "TOGGLE_FAVORITE",
      callerDescription: `Toggle preferito per ID ${id} -> ${nextFav}`,
      details: { id, nextFav },
    });

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-")) {
      return;
    }

    try {
      const docRef = doc(db, "resources", id);
      await withFirestoreTimeout(setDoc(docRef, {
        isFavorite: nextFav,
        updatedAt: serverTimestamp(),
      }, { merge: true }), 10000);
      addLog("info", "FIRESTORE", `Preferito aggiornato per risorsa ${id}: ${nextFav ? "Aggiunto" : "Rimosso"}`);
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return;
      }
      if (isNetworkOrTimeoutError(err)) {
        addLog("warn", "FIRESTORE", `Preferito salvato localmente; sincronizzazione remota differita (latenza di rete).`);
        console.warn("Favorite state saved in local cache (remote latency):", err?.message || err);
        return;
      }
      console.warn("Toggle favorite cloud sync issue:", err?.message || err);
    }
  };

  // Update Reading Progress for Articles
  const handleUpdateReadingProgress = async (id: string, progress: number) => {
    try {
      const resource = resources.find((r) => r.id === id);
      const clamped = Math.max(0, Math.min(100, Math.round(progress)));
      const status: "unread" | "in_progress" | "completed" = clamped === 100 ? "completed" : clamped > 0 ? "in_progress" : "unread";

      setResources((prev) => {
        const updated = prev.map((item) =>
          item.id === id
            ? { ...item, metadata: { ...item.metadata, readingProgress: clamped, readingStatus: status } }
            : item
        );
        saveLocalResources(updated, user?.uid);
        return updated;
      }, {
        operation: "READING_PROGRESS",
        callerDescription: `Avanzamento lettura per "${resource?.title || id}": ${clamped}%`,
        details: { id, clamped, status },
      });

      if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-")) {
        return;
      }

      const docRef = doc(db, "resources", id);
      const updatedMetadata = {
        ...(resource?.metadata || {}),
        readingProgress: clamped,
        readingStatus: status,
      };

      await withFirestoreTimeout(
        setDoc(
          docRef,
          sanitizeForFirestore({
            metadata: updatedMetadata,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ),
        10000
      );

      addLog("info", "FIRESTORE", `Avanzamento lettura aggiornato per "${resource?.title || id}": ${clamped}%`);
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return;
      }
      if (isNetworkOrTimeoutError(err)) {
        addLog("warn", "FIRESTORE", `Avanzamento lettura memorizzato in locale; sincronizzazione cloud differita.`);
        console.warn("Reading progress saved locally (network latency):", err?.message || err);
        return;
      }
      console.warn("Reading progress update non-fatal issue:", err?.message || err);
    }
  };

  // Update Resource
  const handleUpdateResource = async (id: string, updatedData: Partial<ResourceItem>): Promise<boolean> => {
    setResources((prev) => {
      const updated = prev.map((item) =>
        item.id === id
          ? {
              ...item,
              ...updatedData,
              metadata: {
                ...(item.metadata || {}),
                ...(updatedData.metadata || {}),
              },
            }
          : item
      );
      saveLocalResources(updated, user?.uid);
      return updated;
    }, {
      operation: "UPDATE_RESOURCE",
      callerDescription: `Aggiornamento risorsa ${id}`,
      details: { id, fields: Object.keys(updatedData) },
    });

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-") || id.startsWith("conv-")) {
      return true;
    }

    try {
      const existing = resources.find((r) => r.id === id);
      const mergedMetadata = updatedData.metadata
        ? { ...(existing?.metadata || {}), ...updatedData.metadata }
        : undefined;

      const docRef = doc(db, "resources", id);
      const dataToClean = {
        ...updatedData,
        ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
        ...(updatedData.url !== undefined ? { url: updatedData.url.trim() } : {}),
        updatedAt: serverTimestamp(),
      };
      delete (dataToClean as any).id;
      const sanitized = sanitizeForFirestore(dataToClean);
      await withFirestoreTimeout(setDoc(docRef, sanitized, { merge: true }), 5000);
      recordFirestoreWrite(1, "Aggiornamento Risorsa", (updatedData as any).title || id);
      return true;
    } catch (err: any) {
      recordFirestoreError(err, "Aggiornamento Risorsa");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return true;
      }
      if (isNetworkOrTimeoutError(err)) {
        addLog("warn", "FIRESTORE", `Aggiornamento risorsa "${(updatedData as any).title || id}" salvato in locale; sincronizzazione cloud in attesa.`);
        console.warn("Update saved locally, cloud sync deferred due to network latency:", err?.message || err);
        return true;
      }
      console.warn("Update non-fatal error, local data preserved:", err?.message || err);
      return true;
    }
  };

  // Delete Resource
  const handleDeleteResource = async (id: string): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch (authErr: any) {
        addLog("warn", "FIRESTORE", "Tentativo di eliminazione senza utente autenticato.");
        setErrorMessage("Errore di autenticazione. Riprova tra un istante.");
        setTimeout(() => setErrorMessage(null), 4000);
        return false;
      }
    }

    const targetItem = resources.find((r) => r.id === id);
    recordLifecycleEvent({
      stage: "RESOURCE_DELETED",
      resourceId: id,
      resourceTitle: targetItem?.title || id,
      resourceType: targetItem?.type,
      status: "info",
      message: `Eliminazione richiesta per risorsa "${targetItem?.title || id}" (ID: ${id})`,
      details: { id, title: targetItem?.title, type: targetItem?.type },
    });

    const previousResources = [...resources];

    recordDeletedResourceId(id);

    setResources((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveLocalResources(updated, activeUser?.uid);
      return updated;
    }, {
      operation: "DELETE_RESOURCE",
      callerDescription: `Eliminazione risorsa "${targetItem?.title || id}" (ID: ${id})`,
      details: { id, title: targetItem?.title },
    });

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-") || id.startsWith("conv-")) {
      setStatusMessage("Risorsa rimossa dal Vault.");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    }

    try {
      addLog("info", "FIRESTORE", `Eliminazione risorsa ID: ${id}...`);
      await withFirestoreTimeout(deleteDoc(doc(db, "resources", id)), 10000);
      recordFirestoreDelete(1, "Eliminazione Risorsa", id);
      addLog("success", "FIRESTORE", `Risorsa eliminata con successo dal Vault (ID: ${id})`);
      setStatusMessage("Risorsa eliminata con successo!");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    } catch (err: any) {
      recordFirestoreError(err, "Eliminazione Risorsa");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        setStatusMessage("Risorsa rimossa dalla memoria locale.");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }
      if (isNetworkOrTimeoutError(err)) {
        addLog("warn", "FIRESTORE", `Risorsa rimossa in locale; eliminazione cloud differita per latenza di rete.`);
        console.warn("Delete completed locally, remote deletion queued/deferred:", err?.message || err);
        setStatusMessage("Risorsa rimossa dal Vault.");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }
      console.warn("Delete non-fatal error, local deletion preserved:", err);
      setStatusMessage("Risorsa rimossa in locale.");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    }
  };

  // ========================================================================
  // BULK ACTIONS: ELIMINAZIONE, TAGGING E CATEGORIZZAZIONE MULTIPLA
  // ========================================================================

  // Bulk Delete
  const handleBulkDeleteResources = async (ids: string[]): Promise<boolean> => {
    if (!ids || ids.length === 0) return true;
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch (authErr: any) {
        addLog("warn", "FIRESTORE", "Tentativo di eliminazione multipla senza utente autenticato.");
        setErrorMessage("Errore di autenticazione. Riprova tra un istante.");
        setTimeout(() => setErrorMessage(null), 4000);
        return false;
      }
    }

    const idSet = new Set(ids);
    ids.forEach((id) => recordDeletedResourceId(id));

    recordLifecycleEvent({
      stage: "RESOURCE_DELETED",
      resourceId: ids.join(","),
      resourceTitle: `Eliminazione multipla (${ids.length} risorse)`,
      status: "info",
      message: `Eliminazione multipla richiesta per ${ids.length} risorse`,
      details: { ids, count: ids.length },
    });

    setResources((prev) => {
      const updated = prev.filter((item) => !idSet.has(item.id));
      saveLocalResources(updated, activeUser?.uid);
      return updated;
    }, {
      operation: "DELETE_RESOURCE",
      callerDescription: `Eliminazione multipla di ${ids.length} risorse`,
      details: { ids, count: ids.length },
    });

    setStatusMessage(`${ids.length} risorse eliminate dal Vault.`);
    setTimeout(() => setStatusMessage(null), 3500);

    if (quotaExceeded) return true;

    try {
      const firestoreDeletes = ids
        .filter((id) => !id.startsWith("local-") && !id.startsWith("seed-") && !id.startsWith("sample-") && !id.startsWith("conv-"))
        .map((id) =>
          withFirestoreTimeout(deleteDoc(doc(db, "resources", id)), 8000).catch((err) => {
            console.warn(`Errore cancellazione Firestore risorsa ${id}:`, err);
          })
        );

      await Promise.allSettled(firestoreDeletes);
      addLog("info", "FIRESTORE", `Eliminazione multipla completata per ${ids.length} risorse.`);
      return true;
    } catch (err: any) {
      console.warn("Bulk delete non-fatal error:", err);
      return true;
    }
  };

  // Bulk Add Tag
  const handleBulkAddTag = async (ids: string[], rawTag: string): Promise<boolean> => {
    const cleanTag = rawTag.trim().toLowerCase().replace(/^#/, "");
    if (!ids || ids.length === 0 || !cleanTag) return false;

    let activeUser = user || auth.currentUser;
    const idSet = new Set(ids);

    setResources((prev) => {
      const updated = prev.map((item) => {
        if (idSet.has(item.id)) {
          const currentTags = Array.isArray(item.tags) ? item.tags : [];
          if (!currentTags.includes(cleanTag)) {
            return {
              ...item,
              tags: [...currentTags, cleanTag],
              updatedAt: new Date(),
            };
          }
        }
        return item;
      });
      saveLocalResources(updated, activeUser?.uid);
      return updated;
    }, {
      operation: "UPDATE_RESOURCE",
      callerDescription: `Aggiunta tag "#${cleanTag}" a ${ids.length} risorse`,
      details: { ids, tag: cleanTag },
    });

    setStatusMessage(`Tag "#${cleanTag}" aggiunto a ${ids.length} risorse.`);
    setTimeout(() => setStatusMessage(null), 3500);

    if (quotaExceeded) return true;

    try {
      const updates = ids
        .filter((id) => !id.startsWith("local-") && !id.startsWith("seed-") && !id.startsWith("sample-") && !id.startsWith("conv-"))
        .map(async (id) => {
          const existing = resources.find((r) => r.id === id);
          const currentTags = Array.isArray(existing?.tags) ? existing.tags : [];
          if (!currentTags.includes(cleanTag)) {
            const newTags = [...currentTags, cleanTag];
            const docRef = doc(db, "resources", id);
            return withFirestoreTimeout(setDoc(docRef, { tags: newTags, updatedAt: serverTimestamp() }, { merge: true }), 5000);
          }
        });
      await Promise.allSettled(updates);
      return true;
    } catch (err) {
      console.warn("Bulk add tag Firestore error:", err);
      return true;
    }
  };

  // Bulk Remove Tag
  const handleBulkRemoveTag = async (ids: string[], rawTag: string): Promise<boolean> => {
    const cleanTag = rawTag.trim().toLowerCase().replace(/^#/, "");
    if (!ids || ids.length === 0 || !cleanTag) return false;

    let activeUser = user || auth.currentUser;
    const idSet = new Set(ids);

    setResources((prev) => {
      const updated = prev.map((item) => {
        if (idSet.has(item.id)) {
          const currentTags = Array.isArray(item.tags) ? item.tags : [];
          return {
            ...item,
            tags: currentTags.filter((t) => t.toLowerCase() !== cleanTag),
            updatedAt: new Date(),
          };
        }
        return item;
      });
      saveLocalResources(updated, activeUser?.uid);
      return updated;
    }, {
      operation: "UPDATE_RESOURCE",
      callerDescription: `Rimozione tag "#${cleanTag}" da ${ids.length} risorse`,
      details: { ids, tag: cleanTag },
    });

    setStatusMessage(`Tag "#${cleanTag}" rimosso da ${ids.length} risorse.`);
    setTimeout(() => setStatusMessage(null), 3500);

    if (quotaExceeded) return true;

    try {
      const updates = ids
        .filter((id) => !id.startsWith("local-") && !id.startsWith("seed-") && !id.startsWith("sample-") && !id.startsWith("conv-"))
        .map(async (id) => {
          const existing = resources.find((r) => r.id === id);
          const currentTags = Array.isArray(existing?.tags) ? existing.tags : [];
          const newTags = currentTags.filter((t) => t.toLowerCase() !== cleanTag);
          const docRef = doc(db, "resources", id);
          return withFirestoreTimeout(setDoc(docRef, { tags: newTags, updatedAt: serverTimestamp() }, { merge: true }), 5000);
        });
      await Promise.allSettled(updates);
      return true;
    } catch (err) {
      console.warn("Bulk remove tag Firestore error:", err);
      return true;
    }
  };

  // Bulk Categorize
  const handleBulkCategorize = async (ids: string[], newType: ResourceType): Promise<boolean> => {
    if (!ids || ids.length === 0) return false;

    let activeUser = user || auth.currentUser;
    const idSet = new Set(ids);

    setResources((prev) => {
      const updated = prev.map((item) => {
        if (idSet.has(item.id)) {
          const existingMeta = item.metadata || {};
          let updatedMeta = { ...existingMeta };
          if (newType === "knowledge" && !updatedMeta.docType) {
            updatedMeta.docType = "concept";
            updatedMeta.okfVersion = "0.2";
          }
          return {
            ...item,
            type: newType,
            metadata: updatedMeta,
            updatedAt: new Date(),
          };
        }
        return item;
      });
      saveLocalResources(updated, activeUser?.uid);
      return updated;
    }, {
      operation: "UPDATE_RESOURCE",
      callerDescription: `Riclassificazione multipla a "${newType}" per ${ids.length} risorse`,
      details: { ids, newType },
    });

    setStatusMessage(`${ids.length} risorse riclassificate come "${newType}".`);
    setTimeout(() => setStatusMessage(null), 3500);

    if (quotaExceeded) return true;

    try {
      const updates = ids
        .filter((id) => !id.startsWith("local-") && !id.startsWith("seed-") && !id.startsWith("sample-") && !id.startsWith("conv-"))
        .map(async (id) => {
          const existing = resources.find((r) => r.id === id);
          const existingMeta = existing?.metadata || {};
          let updatedMeta = { ...existingMeta };
          if (newType === "knowledge" && !updatedMeta.docType) {
            updatedMeta.docType = "concept";
            updatedMeta.okfVersion = "0.2";
          }
          const docRef = doc(db, "resources", id);
          return withFirestoreTimeout(setDoc(docRef, {
            type: newType,
            metadata: updatedMeta,
            updatedAt: serverTimestamp(),
          }, { merge: true }), 5000);
        });
      await Promise.allSettled(updates);
      return true;
    } catch (err) {
      console.warn("Bulk categorize Firestore error:", err);
      return true;
    }
  };

  // Bulk Toggle Favorite
  const handleBulkToggleFavorite = async (ids: string[], isFavorite: boolean): Promise<boolean> => {
    if (!ids || ids.length === 0) return false;

    let activeUser = user || auth.currentUser;
    const idSet = new Set(ids);

    setResources((prev) => {
      const updated = prev.map((item) => {
        if (idSet.has(item.id)) {
          return {
            ...item,
            isFavorite,
            updatedAt: new Date(),
          };
        }
        return item;
      });
      saveLocalResources(updated, activeUser?.uid);
      return updated;
    }, {
      operation: "UPDATE_RESOURCE",
      callerDescription: `Impostazione preferiti (${isFavorite}) per ${ids.length} risorse`,
      details: { ids, isFavorite },
    });

    setStatusMessage(`${ids.length} risorse ${isFavorite ? "aggiunte ai" : "rimosse dai"} preferiti.`);
    setTimeout(() => setStatusMessage(null), 3500);

    if (quotaExceeded) return true;

    try {
      const updates = ids
        .filter((id) => !id.startsWith("local-") && !id.startsWith("seed-") && !id.startsWith("sample-") && !id.startsWith("conv-"))
        .map(async (id) => {
          const docRef = doc(db, "resources", id);
          return withFirestoreTimeout(setDoc(docRef, {
            isFavorite,
            updatedAt: serverTimestamp(),
          }, { merge: true }), 5000);
        });
      await Promise.allSettled(updates);
      return true;
    } catch (err) {
      console.warn("Bulk favorite Firestore error:", err);
      return true;
    }
  };

  return {
    user,
    authLoading,
    resources,
    setResources,
    isLoadingResources,
    logs,
    addLog,
    setLogs,
    quotaExceeded,
    setQuotaExceeded,
    isSyncing,
    lastSyncTime,
    isSeeding,
    statusMessage,
    setStatusMessage,
    errorMessage,
    setErrorMessage,
    conflictAnalysis,
    setConflictAnalysis,
    isConflictModalOpen,
    setIsConflictModalOpen,
    isApplyingMerge,
    storageDiscrepancyNotice,
    setStorageDiscrepancyNotice,
    handleGoogleSignIn,
    handleSignOut,
    handleSeedDemoData,
    handleSyncSystemSpecs,
    handleBatchImportOkfItems,
    handleManualAdd,
    handleToggleFavorite,
    handleUpdateReadingProgress,
    handleUpdateResource,
    handleDeleteResource,
    handleBulkDeleteResources,
    handleBulkAddTag,
    handleBulkRemoveTag,
    handleBulkCategorize,
    handleBulkToggleFavorite,
    handleApplyConflictMerge,
    handleUploadUnsyncedResources,
    handleTriggerSync,
    handleCheckConflicts,
  };
}
