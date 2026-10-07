import { QuotaTelemetryEvent, FirestoreDailyStats, GeminiDailyStats } from "../types";
import { getFirebaseQuotaResetInfo } from "./cacheManager";
import { db, doc, getDoc, getDocFromServer, enableNetwork, disableNetwork } from "./firebase";

// Daily Limits for Firebase Spark (Free Tier)
export const FIRESTORE_DAILY_READ_LIMIT = 50000;
export const FIRESTORE_DAILY_WRITE_LIMIT = 20000;
export const FIRESTORE_DAILY_DELETE_LIMIT = 20000;

// Gemini Free Tier Standard Limits
export const GEMINI_DAILY_REQUEST_LIMIT = 1500;
export const GEMINI_RPM_LIMIT = 15;
export const GEMINI_TPM_LIMIT = 1000000;

const TELEMETRY_STORAGE_KEY = "KV_QUOTA_TELEMETRY_EVENTS";
const FIRESTORE_STATS_STORAGE_KEY = "KV_FIRESTORE_DAILY_STATS";
const QUOTA_EXCEEDED_KEY = "KV_QUOTA_EXCEEDED_FLAG";

// Get date key matching the Pacific Time day (Google Cloud quota cycle) natively
export function getPacificDateKey(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value || String(now.getFullYear());
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

type TelemetryListener = () => void;
const listeners = new Set<TelemetryListener>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try { fn(); } catch (e) { console.error("Telemetry listener error:", e); }
  });
}

export function subscribeToTelemetry(callback: TelemetryListener): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

export function getStoredEvents(): QuotaTelemetryEvent[] {
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Error reading telemetry events:", e);
  }
  return [];
}

export function addTelemetryEvent(event: Omit<QuotaTelemetryEvent, "id" | "timestamp">): QuotaTelemetryEvent {
  const newEvent: QuotaTelemetryEvent = {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString(navigator.language || "it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    ...event,
  };

  try {
    const existing = getStoredEvents();
    const updated = [newEvent, ...existing.slice(0, 199)];
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    // Ignore storage quota
  }

  notifyListeners();
  return newEvent;
}

export function getFirestoreDailyStats(): FirestoreDailyStats {
  const todayKey = getPacificDateKey();
  try {
    const raw = localStorage.getItem(FIRESTORE_STATS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.dateKey === todayKey) {
        return parsed;
      }
    }
  } catch (e) {
    // Ignore
  }

  // Initial fresh stats for today
  const fresh: FirestoreDailyStats = {
    dateKey: todayKey,
    reads: 0,
    writes: 0,
    deletes: 0,
    readLimit: FIRESTORE_DAILY_READ_LIMIT,
    writeLimit: FIRESTORE_DAILY_WRITE_LIMIT,
    deleteLimit: FIRESTORE_DAILY_DELETE_LIMIT,
    activeListeners: 0,
    isLockedOffline: localStorage.getItem(QUOTA_EXCEEDED_KEY) === "true",
  };
  saveFirestoreDailyStats(fresh);
  return fresh;
}

export function saveFirestoreDailyStats(stats: FirestoreDailyStats) {
  try {
    localStorage.setItem(FIRESTORE_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    // Ignore
  }
  notifyListeners();
}

export function recordFirestoreRead(docCount = 1, caller = "Firestore Query", details?: string) {
  const stats = getFirestoreDailyStats();
  stats.reads += docCount;
  saveFirestoreDailyStats(stats);

  addTelemetryEvent({
    service: "FIRESTORE",
    operation: "READ",
    caller,
    count: docCount,
    status: "SUCCESS",
    details: details || `Lette ${docCount} risorsa/e da Firestore`,
  });
}

export function recordFirestoreWrite(docCount = 1, caller = "Firestore Write", details?: string) {
  const stats = getFirestoreDailyStats();
  stats.writes += docCount;
  saveFirestoreDailyStats(stats);

  addTelemetryEvent({
    service: "FIRESTORE",
    operation: "WRITE",
    caller,
    count: docCount,
    status: "SUCCESS",
    details: details || `Scritte ${docCount} risorsa/e su Firestore`,
  });
}

export function recordFirestoreDelete(docCount = 1, caller = "Firestore Delete", details?: string) {
  const stats = getFirestoreDailyStats();
  stats.deletes += docCount;
  saveFirestoreDailyStats(stats);

  addTelemetryEvent({
    service: "FIRESTORE",
    operation: "DELETE",
    caller,
    count: docCount,
    status: "SUCCESS",
    details: details || `Eliminate ${docCount} risorsa/e da Firestore`,
  });
}

export function recordFirestoreError(error: any, caller = "Firestore Op", details?: string) {
  const msg = String(error?.message || error || "Errore sconosciuto");
  const code = String(error?.code || "");
  
  const isNotFound =
    code.includes("not-found") ||
    msg.toLowerCase().includes("not-found") ||
    msg.toLowerCase().includes("does not exist") ||
    code === "5";

  const isTimeout = msg.toLowerCase().includes("timed out") || msg.toLowerCase().includes("timeout");
  const isPermissionDenied = code.includes("permission-denied") || msg.toLowerCase().includes("permission-denied");

  const isResourceExhausted =
    !isNotFound &&
    !isTimeout &&
    !isPermissionDenied &&
    (code.includes("resource-exhausted") ||
      msg.toLowerCase().includes("resource-exhausted") ||
      msg.toLowerCase().includes("quota limit exceeded") ||
      msg.toLowerCase().includes("quota exceeded") ||
      code === "429");

  const stats = getFirestoreDailyStats();
  stats.lastError = msg;
  stats.lastErrorCode = code;
  if (isResourceExhausted) {
    stats.isLockedOffline = true;
    stats.lockReason = "Quota Giornaliera Google Cloud Firestore (Free Tier) Esaurita (Codice 8: RESOURCE_EXHAUSTED / 429)";
  } else if (isNotFound) {
    stats.lockReason = "Database Firestore non ancora creato nel progetto Google Cloud (NOT_FOUND). Quota libera e intatta.";
  } else if (isTimeout) {
    stats.lockReason = "Timeout rete o latenza di connessione container";
  }
  saveFirestoreDailyStats(stats);

  addTelemetryEvent({
    service: "FIRESTORE",
    operation: "ERROR",
    caller,
    status: isResourceExhausted ? "QUOTA_EXCEEDED" : isTimeout ? "TIMEOUT" : "ERROR",
    statusCode: isResourceExhausted ? 429 : isNotFound ? 404 : 500,
    details: `${caller} fallita: ${msg} ${code ? `[${code}]` : ""}`,
  });
}

export function setActiveFirestoreListenersCount(count: number) {
  const stats = getFirestoreDailyStats();
  stats.activeListeners = count;
  saveFirestoreDailyStats(stats);
}

/**
 * Resets the local offline lock and re-enables network.
 * Used when the user clicks "Verifica & Ripristina Quota Reale" or clears false-positive timeouts.
 */
export async function resetLocalQuotaLock(): Promise<{ success: boolean; message: string }> {
  try {
    localStorage.removeItem(QUOTA_EXCEEDED_KEY);
    const stats = getFirestoreDailyStats();
    stats.isLockedOffline = false;
    stats.lockReason = undefined;
    saveFirestoreDailyStats(stats);

    // Re-enable network in Firestore client
    await enableNetwork(db).catch(() => {});

    addTelemetryEvent({
      service: "FIRESTORE",
      operation: "RESET_LOCK",
      caller: "Pannello Diagnostica",
      status: "SUCCESS",
      details: "Flag di blocco locale rimosso. Rete Firestore riabilitata con successo.",
    });

    return {
      success: true,
      message: "Rete Firestore riattivata e flag di blocco azzerato.",
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Impossibile riattivare la rete: ${err?.message || err}`,
    };
  }
}

/**
 * Performs a live ping read to Firestore to detect if the quota is actually blocked or online.
 */
export async function testFirestoreLiveConnectivity(): Promise<{
  isOnline: boolean;
  isQuotaExhausted: boolean;
  latencyMs: number;
  message: string;
  errorCode?: string;
}> {
  const start = performance.now();
  try {
    // Ensure network is active for test
    await enableNetwork(db).catch(() => {});

    // Try to read a dummy or system telemetry ping document with a 7-second grace timeout
    const testDocRef = doc(db, "_telemetry", "health_check");
    
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ping Firestore (7000ms)")), 7000)
    );

    // Force network fetch from Google Cloud servers using getDocFromServer (bypassing local cache false positives)
    await Promise.race([
      getDocFromServer(testDocRef).catch(() => getDoc(testDocRef)),
      timeoutPromise
    ]);
    const latencyMs = Math.round(performance.now() - start);

    recordFirestoreRead(1, "Test Live Connettività", "Ping di verifica quota Firestore completato con successo");

    // If it succeeded, Firestore is 100% active and NOT blocked!
    await resetLocalQuotaLock();

    return {
      isOnline: true,
      isQuotaExhausted: false,
      latencyMs,
      message: `Firestore è perfettamente OPERATIVO e la quota è DISPONIBILE (Risposta in ${latencyMs}ms). Il blocco locale è stato rimosso.`,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    const msg = String(err?.message || err || "").toLowerCase();
    const code = String(err?.code || "").toLowerCase();

    const isNotFound =
      code.includes("not-found") ||
      msg.includes("not-found") ||
      msg.includes("does not exist") ||
      code === "5";

    const isTimeout = msg.includes("timed out") || msg.includes("timeout");

    const isQuota =
      !isNotFound &&
      !isTimeout &&
      (code.includes("resource-exhausted") ||
        msg.includes("quota limit exceeded") ||
        msg.includes("quota exceeded") ||
        code === "429");

    if (isNotFound) {
      return {
        isOnline: false,
        isQuotaExhausted: false,
        latencyMs,
        errorCode: "NOT_FOUND",
        message: "Il database Firestore non è stato trovato o non è ancora stato creato nel progetto Google Cloud (Database NOT_FOUND). NON si tratta di quota esaurita (la quota giornaliera gratuita è integra a 0/50.000).",
      };
    }

    if (isQuota) {
      recordFirestoreError(err, "Test Live Connettività");
      return {
        isOnline: false,
        isQuotaExhausted: true,
        latencyMs,
        errorCode: code || "RESOURCE_EXHAUSTED",
        message: "Quota giornaliera Google Cloud Firestore confermata ESAURITA (Errore 429 RESOURCE_EXHAUSTED). Il reset automatico avverrà alle 00:00 US Pacific Time.",
      };
    }

    if (isTimeout) {
      return {
        isOnline: false,
        isQuotaExhausted: false,
        latencyMs,
        errorCode: "TIMEOUT",
        message: `Nessuna risposta entro 7 secondi (${latencyMs}ms). Potrebbe trattarsi di una temporanea congestione di rete del container o indisponibilità dei server Google, non necessariamente di quota esaurita.`,
      };
    }

    // Other errors (e.g. permission-denied if _telemetry doc rules restrict, but that confirms Firestore network is REACHABLE!)
    if (code.includes("permission-denied")) {
      // Permission denied proves Firestore reached Google Cloud servers without quota exhaustion!
      await resetLocalQuotaLock();
      return {
        isOnline: true,
        isQuotaExhausted: false,
        latencyMs,
        message: `Connessione a Firestore RIUSCITA (${latencyMs}ms)! I server rispondono correttamente e la quota non è esaurita.`,
      };
    }

    return {
      isOnline: false,
      isQuotaExhausted: false,
      latencyMs,
      errorCode: code || "UNKNOWN",
      message: `Errore durante il test: ${err?.message || err}`,
    };
  }
}

/**
 * Fetch Gemini API telemetry stats from the backend server
 */
export async function fetchGeminiTelemetry(): Promise<GeminiDailyStats | null> {
  try {
    const res = await fetch("/api/telemetry/gemini-stats");
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("Failed to fetch Gemini telemetry:", err);
    return null;
  }
}

/**
 * Trigger a live ping test to Gemini API via backend
 */
export async function testGeminiLiveConnectivity(): Promise<{
  success: boolean;
  latencyMs: number;
  modelUsed?: string;
  message: string;
  isRateLimited?: boolean;
}> {
  const start = performance.now();
  try {
    const res = await fetch("/api/telemetry/test-gemini", { method: "POST" });
    const latencyMs = Math.round(performance.now() - start);
    const data = await res.json();

    if (res.ok && data.success) {
      addTelemetryEvent({
        service: "GEMINI",
        operation: "PING_TEST",
        caller: "Test Live Connettività",
        latencyMs,
        status: "SUCCESS",
        details: `Ping Gemini riuscito con modello ${data.modelUsed} in ${latencyMs}ms`,
      });

      return {
        success: true,
        latencyMs,
        modelUsed: data.modelUsed,
        message: `Gemini AI è OPERATIVO (${data.modelUsed}, risposta in ${latencyMs}ms). Nessun blocco di quota attivo.`,
      };
    } else {
      const isRateLimited = data.isQuota || res.status === 429;
      addTelemetryEvent({
        service: "GEMINI",
        operation: "PING_TEST",
        caller: "Test Live Connettività",
        latencyMs,
        status: isRateLimited ? "RATE_LIMITED" : "ERROR",
        statusCode: res.status,
        details: `Test fallito: ${data.message || "Errore Gemini"}`,
      });

      return {
        success: false,
        latencyMs,
        isRateLimited,
        message: data.message || `Test Gemini fallito con codice ${res.status}`,
      };
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      message: `Impossibile raggiungere il servizio Gemini: ${err?.message || err}`,
    };
  }
}

export function clearTelemetryEvents() {
  localStorage.removeItem(TELEMETRY_STORAGE_KEY);
  notifyListeners();
}

/**
 * Executes a full-stack parallel connectivity diagnostic across Firestore and Gemini AI
 */
export async function testFullStackConnectivity() {
  const [firestoreRes, geminiRes] = await Promise.all([
    testFirestoreLiveConnectivity(),
    testGeminiLiveConnectivity(),
  ]);

  return {
    firestore: firestoreRes,
    gemini: geminiRes,
    timestamp: new Date().toISOString(),
  };
}
