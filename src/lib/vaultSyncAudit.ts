/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResourceItem, DiagnosticLog } from "../types";
import { parseDate, getTimestampMillis } from "./dateUtils";
import { recordLifecycleEvent } from "./resourceLifecycleTracker";

export type VaultSyncOperation =
  | "INIT_STATE"
  | "HYDRATE_SERVER_FS"
  | "HYDRATE_INDEXED_DB"
  | "FIRESTORE_SNAPSHOT"
  | "FIRESTORE_SNAPSHOT_EMPTY_PRESERVE"
  | "FIRESTORE_SNAPSHOT_EMPTY_CACHE"
  | "FIRESTORE_SNAPSHOT_ERROR_CACHE"
  | "AUTH_UNAUTHENTICATED_CACHE"
  | "CONFLICT_MERGE_APPLY"
  | "UPLOAD_UNSYNCED"
  | "TRIGGER_SYNC_GETDOCS"
  | "SEED_DEMO_DATA"
  | "BATCH_IMPORT_OKF"
  | "MANUAL_ADD"
  | "TOGGLE_FAVORITE"
  | "READING_PROGRESS"
  | "UPDATE_RESOURCE"
  | "DELETE_RESOURCE"
  | "DELETE_ROLLBACK"
  | "EXTERNAL_CALLER";

export interface SetResourcesTraceContext {
  operation: VaultSyncOperation;
  callerDescription?: string;
  remoteCount?: number;          // Remote documents fetched from Firestore (snapshot.size or snap.size)
  docChangesCount?: number;      // Snapshot docChanges count
  remoteDocIds?: string[];       // Exact IDs fetched from Firestore
  userUid?: string | null;       // Active authenticated user UID
  details?: Record<string, any>; // Extra debugging details
}

export interface StaleOverwriteWarning {
  type: "TIMESTAMP_REGRESSION" | "POST_SYNC_CACHE_INJECTION" | "REMOTE_DOCUMENT_DROPPED" | "UNNAMESPACED_CACHE_COLLISION";
  severity: "error" | "warn";
  message: string;
  itemId?: string;
  itemTitle?: string;
  prevTimestamp?: string;
  nextTimestamp?: string;
  details?: Record<string, any>;
}

export interface DiscrepancyReport {
  hasDiscrepancy: boolean;
  remoteCount: number;
  localCountBefore: number;
  localCountAfter: number;
  diff: number;
  localOnlyCount: number;
  remoteOnlyCount: number;
  localOnlyIds: string[];
  remoteOnlyIds: string[];
  explanation: string;
  isBenign: boolean;
}

export interface SyncTraceAuditResult {
  seq: number;
  operation: VaultSyncOperation;
  timestamp: string;
  prevCount: number;
  nextCount: number;
  delta: number;
  remoteCount?: number;
  staleWarnings: StaleOverwriteWarning[];
  discrepancyReport?: DiscrepancyReport;
  addedIds: string[];
  removedIds: string[];
  modifiedIds: string[];
}

// Module-level tracer state to detect cross-operation regressions
let globalTraceSeq = 0;
let lastFirestoreSyncTimeMs = 0;
let lastFirestoreSyncedDocCount = 0;
let lastFirestoreSyncedDocIds = new Set<string>();
let lastFirestoreDocSignatures = new Map<string, { timestampMs: number; title: string; updatedAt: string }>();

const syncTraceHistory: SyncTraceAuditResult[] = [];
const allStaleWarnings: StaleOverwriteWarning[] = [];
let latestDiscrepancyReport: DiscrepancyReport | null = null;
const auditSubscribers = new Set<(history: SyncTraceAuditResult[]) => void>();

export function getSyncTraceHistory(): SyncTraceAuditResult[] {
  return [...syncTraceHistory];
}

export function getAllStaleWarnings(): StaleOverwriteWarning[] {
  return [...allStaleWarnings];
}

export function getLatestDiscrepancyReport(): DiscrepancyReport | null {
  return latestDiscrepancyReport;
}

export function clearSyncTraceHistory() {
  syncTraceHistory.length = 0;
  allStaleWarnings.length = 0;
  latestDiscrepancyReport = null;
  notifyAuditSubscribers();
}

export function subscribeToSyncAudit(listener: (history: SyncTraceAuditResult[]) => void): () => void {
  auditSubscribers.add(listener);
  listener([...syncTraceHistory]);
  return () => {
    auditSubscribers.delete(listener);
  };
}

function notifyAuditSubscribers() {
  const current = [...syncTraceHistory];
  auditSubscribers.forEach((sub) => {
    try {
      sub(current);
    } catch (e) {
      console.error("Audit subscriber error:", e);
    }
  });
}

/**
 * Returns the current Firestore synchronization baseline snapshot
 */
export function getFirestoreSyncBaseline() {
  return {
    lastFirestoreSyncTimeMs,
    lastFirestoreSyncedDocCount,
    lastFirestoreSyncedDocIds: new Set(lastFirestoreSyncedDocIds),
    docSignaturesCount: lastFirestoreDocSignatures.size,
  };
}

/**
 * Resets or updates the Firestore synchronization baseline
 */
export function recordFirestoreSyncSuccess(remoteDocs: ResourceItem[], userUid?: string) {
  lastFirestoreSyncTimeMs = Date.now();
  lastFirestoreSyncedDocCount = remoteDocs.length;
  lastFirestoreSyncedDocIds = new Set(remoteDocs.map((r) => r.id));
  
  lastFirestoreDocSignatures.clear();
  remoteDocs.forEach((doc) => {
    const ts = parseDate(doc.updatedAt) || parseDate(doc.createdAt) || new Date();
    lastFirestoreDocSignatures.set(doc.id, {
      timestampMs: getTimestampMillis(ts),
      title: doc.title,
      updatedAt: ts.toISOString(),
    });
  });
}

/**
 * Audit and trace every single setResources operation in useVaultData.
 * Performs deep inspection for:
 * 1. Stale local storage / cache overwriting authoritative Firestore data.
 * 2. Discrepancies between remote Firestore docs fetched and local in-memory state.
 * 3. Silent document dropping or regressive timestamp rewrites.
 */
export function auditSetResourcesOperation(
  prevItems: ResourceItem[],
  nextItems: ResourceItem[],
  context: SetResourcesTraceContext,
  addLogFn?: (level: DiagnosticLog["level"], category: DiagnosticLog["category"], message: string, details?: any) => void
): SyncTraceAuditResult {
  globalTraceSeq++;
  const seq = globalTraceSeq;
  const nowStr = new Date().toLocaleTimeString("it-IT", { hour12: false });
  const prevCount = prevItems.length;
  const nextCount = nextItems.length;
  const delta = nextCount - prevCount;

  // Build ID lookup sets
  const prevMap = new Map<string, ResourceItem>(prevItems.map((r) => [r.id, r]));
  const nextMap = new Map<string, ResourceItem>(nextItems.map((r) => [r.id, r]));

  const addedIds: string[] = [];
  const removedIds: string[] = [];
  const modifiedIds: string[] = [];

  nextItems.forEach((nextItem) => {
    const prevItem = prevMap.get(nextItem.id);
    if (!prevItem) {
      addedIds.push(nextItem.id);
    } else {
      const prevMs = getTimestampMillis(parseDate(prevItem.updatedAt) || parseDate(prevItem.createdAt));
      const nextMs = getTimestampMillis(parseDate(nextItem.updatedAt) || parseDate(nextItem.createdAt));
      if (prevMs !== nextMs || prevItem.title !== nextItem.title || prevItem.type !== nextItem.type) {
        modifiedIds.push(nextItem.id);
      }
    }
  });

  prevItems.forEach((prevItem) => {
    if (!nextMap.has(prevItem.id)) {
      removedIds.push(prevItem.id);
    }
  });

  // --------------------------------------------------------------------------
  // 1. AUDIT: STALE LOCAL STORAGE / CACHE OVERWRITE DETECTION
  // --------------------------------------------------------------------------
  const staleWarnings: StaleOverwriteWarning[] = [];

  // Check 1A: Post-Firestore Sync Cache Injection
  // If a Firestore sync has already occurred and confirmed remote docs,
  // check if a cache hydration operation is trying to inject or replace items.
  const isCacheHydrationOp =
    context.operation === "HYDRATE_SERVER_FS" ||
    context.operation === "HYDRATE_INDEXED_DB" ||
    context.operation === "AUTH_UNAUTHENTICATED_CACHE" ||
    context.operation === "FIRESTORE_SNAPSHOT_EMPTY_CACHE";

  if (lastFirestoreSyncTimeMs > 0 && isCacheHydrationOp) {
    const timeSinceFirestoreSyncSec = ((Date.now() - lastFirestoreSyncTimeMs) / 1000).toFixed(1);
    const droppedRemoteDocs = Array.from(lastFirestoreSyncedDocIds).filter((id) => !nextMap.has(id));

    if (droppedRemoteDocs.length > 0) {
      staleWarnings.push({
        type: "POST_SYNC_CACHE_INJECTION",
        severity: "error",
        message: `Operazione cache "${context.operation}" eseguita ${timeSinceFirestoreSyncSec}s DOPO sincronizzazione Firestore e ha ELIMINATO ${droppedRemoteDocs.length} documenti Firestore confermati!`,
        details: {
          droppedRemoteDocIds: droppedRemoteDocs,
          timeSinceFirestoreSyncSec,
          operation: context.operation,
        },
      });
    } else if (prevCount > nextCount) {
      staleWarnings.push({
        type: "POST_SYNC_CACHE_INJECTION",
        severity: "warn",
        message: `Operazione cache "${context.operation}" successiva a Firestore sync ha ridotto il numero di risorse da ${prevCount} a ${nextCount}.`,
        details: { prevCount, nextCount, operation: context.operation },
      });
    }
  }

  // Check 1B: Timestamp Regression (Stale Cache overwriting newer state)
  // Check if any item in nextItems has an older timestamp than what we had in prevItems or in Firestore signatures
  nextItems.forEach((nextItem) => {
    const nextDate = parseDate(nextItem.updatedAt) || parseDate(nextItem.createdAt) || new Date();
    const nextMs = getTimestampMillis(nextDate);

    // Compare against previous local item
    const prevItem = prevMap.get(nextItem.id);
    if (prevItem) {
      const prevDate = parseDate(prevItem.updatedAt) || parseDate(prevItem.createdAt) || new Date();
      const prevMs = getTimestampMillis(prevDate);

      // If timestamp went backwards by more than 2 seconds without being a rollback operation
      if (prevMs > nextMs + 2000 && context.operation !== "DELETE_ROLLBACK") {
        staleWarnings.push({
          type: "TIMESTAMP_REGRESSION",
          severity: "error",
          itemId: nextItem.id,
          itemTitle: nextItem.title,
          prevTimestamp: prevDate.toISOString(),
          nextTimestamp: nextDate.toISOString(),
          message: `Regressione timestamp rilevata per "${nextItem.title}" (ID: ${nextItem.id}): precedente ${prevDate.toISOString()} ➔ sovrascritto con versione più vecchia ${nextDate.toISOString()} (-${Math.round((prevMs - nextMs) / 1000)}s) via "${context.operation}".`,
          details: { prevItem, nextItem, operation: context.operation },
        });
      }
    }

    // Compare against known authoritative Firestore signature
    const firestoreSig = lastFirestoreDocSignatures.get(nextItem.id);
    if (firestoreSig && firestoreSig.timestampMs > nextMs + 2000 && context.operation !== "DELETE_ROLLBACK") {
      staleWarnings.push({
        type: "TIMESTAMP_REGRESSION",
        severity: "error",
        itemId: nextItem.id,
        itemTitle: nextItem.title,
        prevTimestamp: firestoreSig.updatedAt,
        nextTimestamp: nextDate.toISOString(),
        message: `Dati remoti Firestore per "${nextItem.title}" sovrascritti da stato cache locale stantio! Versione Firestore (${firestoreSig.updatedAt}) sostituita da (${nextDate.toISOString()}).`,
        details: { firestoreSig, nextItem, operation: context.operation },
      });
    }
  });

  // Check 1C: Remote Documents Dropped (Unintended Document Loss)
  if (
    context.operation !== "DELETE_RESOURCE" &&
    context.operation !== "AUTH_UNAUTHENTICATED_CACHE" &&
    lastFirestoreSyncedDocIds.size > 0
  ) {
    const missingFirestoreDocs: string[] = [];
    lastFirestoreSyncedDocIds.forEach((remoteId) => {
      if (!nextMap.has(remoteId)) {
        missingFirestoreDocs.push(remoteId);
      }
    });

    if (missingFirestoreDocs.length > 0) {
      staleWarnings.push({
        type: "REMOTE_DOCUMENT_DROPPED",
        severity: "error",
        message: `Rilevata perdita di ${missingFirestoreDocs.length} documenti Firestore remoti durante "${context.operation}" (non eliminati esplicitamente)!`,
        details: { missingFirestoreDocs, operation: context.operation },
      });
    }
  }

  // --------------------------------------------------------------------------
  // 2. AUDIT: DISCREPANCY IN COUNT (FETCHED VS LOCAL STATE)
  // --------------------------------------------------------------------------
  let discrepancyReport: DiscrepancyReport | undefined = undefined;

  if (context.remoteCount !== undefined) {
    const remoteCount = context.remoteCount;
    const remoteDocIdSet = new Set(context.remoteDocIds || []);

    const localOnlyIds: string[] = [];
    nextItems.forEach((item) => {
      if (remoteDocIdSet.size > 0) {
        if (!remoteDocIdSet.has(item.id)) {
          localOnlyIds.push(item.id);
        }
      } else {
        // Fallback: temporary local IDs or un-synced items
        if (
          item.id.startsWith("local-") ||
          item.id.startsWith("conv-") ||
          item.id.startsWith("seed-") ||
          item.id.startsWith("okf-sync-") ||
          item.id.startsWith("spec-")
        ) {
          localOnlyIds.push(item.id);
        }
      }
    });

    const remoteOnlyIds: string[] = [];
    if (context.remoteDocIds) {
      context.remoteDocIds.forEach((remId) => {
        if (!nextMap.has(remId)) {
          remoteOnlyIds.push(remId);
        }
      });
    }

    const hasDiscrepancy = remoteCount !== nextCount;
    const diff = nextCount - remoteCount;

    let explanation = "Allineamento perfetto: il conteggio documenti Firestore corrisponde esattamente allo stato locale.";
    let isBenign = true;

    if (hasDiscrepancy) {
      if (diff > 0) {
        // More items locally than on Firestore
        explanation = `Lo stato locale contiene ${diff} risorse in più rispetto a Firestore (${nextCount} locali vs ${remoteCount} remoti). Motivo: ${localOnlyIds.length} risorse create in locale/offline o cache in attesa di sincronizzazione.`;
        isBenign = localOnlyIds.length >= diff;
      } else {
        // Fewer items locally than on Firestore
        explanation = `Lo stato locale contiene ${Math.abs(diff)} risorse in meno rispetto a Firestore (${nextCount} locali vs ${remoteCount} remoti). Motivo: filtri tombstones, documenti non riconciliati o eliminati localmente.`;
        isBenign = remoteOnlyIds.length === 0;
      }
    }

    discrepancyReport = {
      hasDiscrepancy,
      remoteCount,
      localCountBefore: prevCount,
      localCountAfter: nextCount,
      diff,
      localOnlyCount: localOnlyIds.length,
      remoteOnlyCount: remoteOnlyIds.length,
      localOnlyIds,
      remoteOnlyIds,
      explanation,
      isBenign,
    };
  }

  // --------------------------------------------------------------------------
  // 3. DETAILED CONSOLE LOG OUTPUT
  // --------------------------------------------------------------------------
  emitConsoleAuditLog(seq, context, prevCount, nextCount, delta, staleWarnings, discrepancyReport, addedIds, removedIds, modifiedIds);

  // --------------------------------------------------------------------------
  // 4. EMIT LIFECYCLE & DIAGNOSTIC NOTIFICATIONS
  // --------------------------------------------------------------------------
  if (staleWarnings.length > 0) {
    staleWarnings.forEach((warning) => {
      recordLifecycleEvent({
        stage: "STALE_OVERWRITE_PREVENTED",
        status: warning.severity === "error" ? "error" : "warn",
        message: `[VAULT_AUDIT] ${warning.message}`,
        details: { ...warning.details, operation: context.operation, seq },
      });

      if (addLogFn) {
        addLogFn(
          warning.severity === "error" ? "error" : "warn",
          "CACHE",
          `[Audit Sincronizzazione #${seq}] ${warning.message}`,
          warning.details
        );
      }
    });
  }

  if (discrepancyReport && discrepancyReport.hasDiscrepancy && !discrepancyReport.isBenign) {
    recordLifecycleEvent({
      stage: "SYNC_DISCREPANCY_DETECTED",
      status: "warn",
      message: `[VAULT_AUDIT] Discrepanza conteggio documenti: ${discrepancyReport.remoteCount} remoti Firestore vs ${discrepancyReport.localCountAfter} locali. ${discrepancyReport.explanation}`,
      details: {
        operation: context.operation,
        remoteCount: discrepancyReport.remoteCount,
        localCount: discrepancyReport.localCountAfter,
        diff: discrepancyReport.diff,
        remoteOnlyIds: discrepancyReport.remoteOnlyIds,
        localOnlyIds: discrepancyReport.localOnlyIds,
      },
    });

    if (addLogFn) {
      addLogFn(
        "warn",
        "FIRESTORE",
        `[Audit Discrepanza #${seq}] Documenti Firestore: ${discrepancyReport.remoteCount} | Risorse Locali: ${discrepancyReport.localCountAfter} (${discrepancyReport.explanation})`,
        discrepancyReport
      );
    }
  }

  const auditResult: SyncTraceAuditResult = {
    seq,
    operation: context.operation,
    timestamp: nowStr,
    prevCount,
    nextCount,
    delta,
    remoteCount: context.remoteCount,
    staleWarnings,
    discrepancyReport,
    addedIds,
    removedIds,
    modifiedIds,
  };

  syncTraceHistory.unshift(auditResult);
  if (syncTraceHistory.length > 200) {
    syncTraceHistory.pop();
  }

  if (staleWarnings.length > 0) {
    allStaleWarnings.unshift(...staleWarnings);
    if (allStaleWarnings.length > 100) {
      allStaleWarnings.length = 100;
    }
  }

  if (discrepancyReport) {
    latestDiscrepancyReport = discrepancyReport;
  }

  notifyAuditSubscribers();

  return auditResult;
}

/**
 * Visual Console Formatter with CSS styling, badges, and expandable groups
 */
function emitConsoleAuditLog(
  seq: number,
  context: SetResourcesTraceContext,
  prevCount: number,
  nextCount: number,
  delta: number,
  staleWarnings: StaleOverwriteWarning[],
  discrepancyReport: DiscrepancyReport | undefined,
  addedIds: string[],
  removedIds: string[],
  modifiedIds: string[]
) {
  const hasErrors = staleWarnings.some((w) => w.severity === "error");
  const hasWarnings = staleWarnings.length > 0 || (discrepancyReport?.hasDiscrepancy && !discrepancyReport.isBenign);

  const badgeBg = hasErrors ? "#DC2626" : hasWarnings ? "#D97706" : "#2563EB";
  const badgeText = hasErrors ? "STALE OVERWRITE" : hasWarnings ? "DISCREPANCY" : "SYNC OK";
  const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "=";

  const headerTitle = `%c[VAULT_SYNC #${seq}]%c %c${context.operation}%c | ${prevCount} ➔ ${nextCount} (${deltaStr}) | %c${badgeText}%c`;

  // Start styled console group
  console.groupCollapsed(
    headerTitle,
    "background: #1C1917; color: #C5A059; font-weight: bold; padding: 2px 6px; border-radius: 4px;",
    "",
    "color: #60A5FA; font-weight: bold; font-size: 11px;",
    "color: #D1D5DB; font-size: 11px;",
    `background: ${badgeBg}; color: #FFFFFF; font-weight: bold; padding: 1px 5px; border-radius: 3px; font-size: 10px;`,
    ""
  );

  console.log("%c📝 Operazione:", "font-weight: bold;", context.operation, context.callerDescription ? `(${context.callerDescription})` : "");
  console.log("%c📊 Conteggio Stato:", "font-weight: bold;", {
    precedente: prevCount,
    nuovo: nextCount,
    variazione: delta,
    aggiunti: addedIds.length,
    rimossi: removedIds.length,
    modificati: modifiedIds.length,
  });

  if (context.remoteCount !== undefined) {
    console.log("%c☁️ Documenti Firestore Remoti:", "font-weight: bold;", {
      remoteCount: context.remoteCount,
      docChangesCount: context.docChangesCount ?? "N/A",
      remoteDocIdsCount: context.remoteDocIds?.length ?? 0,
      userUid: context.userUid || "Nessun UID",
    });
  }

  // 1. Highlight Stale Overwrites in Console
  if (staleWarnings.length > 0) {
    console.group("%c🚨 SOVRASCRITTURE STANTIE / MISMANAGED CACHE RILEVATE:", "color: #EF4444; font-weight: bold;");
    staleWarnings.forEach((warning, idx) => {
      const prefix = warning.severity === "error" ? "❌ [ERRORE GRAVE]" : "⚠️ [AVVISO]";
      console.warn(
        `%c${prefix} #${idx + 1} (${warning.type}): %c${warning.message}`,
        "color: #EF4444; font-weight: bold;",
        "color: #F87171;",
        warning.details || {}
      );
    });
    console.groupEnd();
  }

  // 2. Highlight Discrepancies in Console
  if (discrepancyReport) {
    if (discrepancyReport.hasDiscrepancy) {
      const discColor = discrepancyReport.isBenign ? "#F59E0B" : "#EF4444";
      console.group(
        `%c⚠️ DISCREPANZA CONTEGGIO DOCUMENTI (${discrepancyReport.diff > 0 ? "+" : ""}${discrepancyReport.diff}):`,
        `color: ${discColor}; font-weight: bold;`
      );
      console.log(`%cRemoti Firestore: %c${discrepancyReport.remoteCount} %c| Locali Vault: %c${discrepancyReport.localCountAfter}`,
        "font-weight: bold;", "color: #3B82F6; font-weight: bold;",
        "font-weight: bold;", "color: #10B981; font-weight: bold;"
      );
      console.log("%cSpiegazione:", "font-weight: bold;", discrepancyReport.explanation);
      console.log("%cDettaglio ID:", "font-weight: bold;", {
        soloLocali: discrepancyReport.localOnlyIds,
        soloRemoti: discrepancyReport.remoteOnlyIds,
        benigna: discrepancyReport.isBenign,
      });
      console.groupEnd();
    } else {
      console.log(
        "%c✅ Sincronizzazione Allineata:%c Conteggio remoto Firestore e stato locale perfettamente sincronizzati.",
        "color: #10B981; font-weight: bold;",
        "color: #D1D5DB;"
      );
    }
  }

  // 3. Diff Details Table
  if (addedIds.length > 0 || removedIds.length > 0 || modifiedIds.length > 0) {
    console.groupCollapsed("%c🔍 Dettaglio Variazione Elementi (Diff)", "color: #9CA3AF;");
    if (addedIds.length > 0) console.log("Aggiunti (" + addedIds.length + "):", addedIds);
    if (removedIds.length > 0) console.log("Rimossi (" + removedIds.length + "):", removedIds);
    if (modifiedIds.length > 0) console.log("Modificati (" + modifiedIds.length + "):", modifiedIds);
    console.groupEnd();
  }

  if (context.details) {
    console.log("%c📋 Metadati Aggiuntivi:", "font-weight: bold;", context.details);
  }

  console.groupEnd();
}
