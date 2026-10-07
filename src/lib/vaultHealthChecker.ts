/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getCountFromServer 
} from "firebase/firestore";
import { db, User } from "./firebase";
import { 
  ResourceItem, 
  ResourceType, 
  VaultHealthCheckReport, 
  TypeComparisonItem, 
  OrphanResourceItem 
} from "../types";

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  knowledge: "Specifiche & Guide OKF v0.2",
  procedure: "Procedure & Playbook Operativi (SOP)",
  article: "Articoli & Deep Dive",
  github_repo: "Repository GitHub",
  mcp_server: "Server MCP (Model Context)",
  ai_skill: "Competenze & Prompt AI",
  troubleshooting: "Soluzioni & Troubleshooting",
  note: "Note Rapide & Memoria",
  paper: "Paper Scientifici (arXiv)",
  rss: "Feed & Bollettini RSS",
  link: "Collegamenti Web & Risorse",
  document_refactor: "Bozze Rielaborate (OKF v0.2)",
};

export const ALL_CHECKED_TYPES: ResourceType[] = [
  "knowledge",
  "procedure",
  "document_refactor",
  "article",
  "github_repo",
  "mcp_server",
  "ai_skill",
  "troubleshooting",
  "note",
  "paper",
  "rss",
  "link",
];

export interface RunHealthCheckOptions {
  forceServerCount?: boolean;
}

/**
 * Esegue il Vault Health Check confrontando profondamente lo stato in memoria locale
 * con i record raw restituiti direttamente da una query Firestore.
 */
export async function runVaultHealthCheck(
  localResources: ResourceItem[],
  user: User | null,
  options: RunHealthCheckOptions = {}
): Promise<VaultHealthCheckReport> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const reportId = `health-check-${Date.now()}`;

  const targetUid = user?.uid;
  let firestoreDocs: ResourceItem[] = [];
  let rawDocsFetched = 0;
  let serverCountResult: number | undefined = undefined;
  let hasQuotaError = false;
  let errorCode: string | undefined = undefined;
  let errorMessage: string | undefined = undefined;

  const collectionName = "resources";
  const filterApplied = targetUid 
    ? `where("userId", "==", "${targetUid}")` 
    : `where("userId", "==", "local-vault-user")`;

  try {
    const resRef = collection(db, collectionName);
    const q = targetUid
      ? query(resRef, where("userId", "==", targetUid))
      : query(resRef, where("userId", "==", "local-vault-user"));

    // 1. Tenta conteggio server-side aggregato (getCountFromServer)
    try {
      const countSnap = await getCountFromServer(q);
      serverCountResult = countSnap.data().count;
    } catch (countErr: any) {
      console.warn("[VaultHealthCheck] getCountFromServer fallito (fallback a getDocs):", countErr?.message);
    }

    // 2. Query diretta per i record raw
    const snap = await getDocs(q);
    rawDocsFetched = snap.docs.length;
    firestoreDocs = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
      } as ResourceItem;
    });

  } catch (err: any) {
    const msg = err?.message || String(err);
    const code = err?.code || "FIRESTORE_QUERY_ERROR";
    errorCode = code;
    errorMessage = msg;

    if (code === "resource-exhausted" || msg.includes("quota") || msg.includes("429")) {
      hasQuotaError = true;
    }
  }

  const executionDurationMs = Math.round(performance.now() - startTime);

  // Calcolo metriche locali
  const totalLocal = localResources.length;
  const userOwnedLocal = localResources.filter(
    (r) => r.userId && r.userId === targetUid && !r.id.startsWith("sample-")
  );
  const systemSampleLocal = localResources.filter(
    (r) => r.userId === "local-vault-user" || r.id.startsWith("sample-")
  );

  const effectiveFirestoreCount = serverCountResult !== undefined ? serverCountResult : rawDocsFetched;

  // Breakdown per tipologia di risorsa
  const typeBreakdown: TypeComparisonItem[] = ALL_CHECKED_TYPES.map((type) => {
    const localCount = localResources.filter((r) => r.type === type).length;
    const firestoreCount = firestoreDocs.filter((r) => r.type === type).length;
    const delta = localCount - firestoreCount;
    return {
      type,
      label: RESOURCE_TYPE_LABELS[type] || type,
      localCount,
      firestoreCount,
      delta,
      match: delta === 0,
    };
  });

  // Identificazione documenti orfani e differenze di ID
  const localIdMap = new Map<string, ResourceItem>();
  localResources.forEach((r) => localIdMap.set(r.id, r));

  const firestoreIdMap = new Map<string, ResourceItem>();
  firestoreDocs.forEach((r) => firestoreIdMap.set(r.id, r));

  const orphanResources: OrphanResourceItem[] = [];

  // Local-only
  localResources.forEach((r) => {
    if (!firestoreIdMap.has(r.id)) {
      let reason = "Non sincronizzato su Firestore";
      if (r.id.startsWith("sample-")) {
        reason = "Campione dimostrativo di sistema (non salvato su cloud)";
      } else if (r.id.startsWith("local-") || r.id.startsWith("conv-") || r.id.startsWith("seed-")) {
        reason = "Creato localmente / In attesa di scrittura cloud";
      } else if (r.userId !== targetUid) {
        reason = `UserId locale (${r.userId}) diverso da utente attivo (${targetUid || "anonimo"})`;
      }
      orphanResources.push({
        id: r.id,
        title: r.title || "Risorsa senza titolo",
        type: r.type,
        location: "local_only",
        reason,
        updatedAt: r.updatedAt ? String(r.updatedAt) : undefined,
      });
    }
  });

  // Firestore-only
  firestoreDocs.forEach((d) => {
    if (!localIdMap.has(d.id)) {
      orphanResources.push({
        id: d.id,
        title: d.title || "Risorsa cloud",
        type: d.type,
        location: "firestore_only",
        reason: "Presente su Firestore ma assente nella memoria locale",
        updatedAt: d.updatedAt ? String(d.updatedAt) : undefined,
      });
    }
  });

  // Controllo integrità OKF v0.2
  const localOkfCount = localResources.filter(
    (r) => r.type === "knowledge" || (r.tags && r.tags.includes("okf-v0.2"))
  ).length;
  const firestoreOkfCount = firestoreDocs.filter(
    (d) => d.type === "knowledge" || (d.tags && d.tags.includes("okf-v0.2"))
  ).length;

  // Rilevamento web links con tag OKF impropri
  const webLinksAsOkf = localResources.filter((r) => {
    const isLink = r.type === "link" || /^https?:\/\/[^\s]+$/i.test((r.url || "").trim());
    const hasOkfTag = r.tags && (r.tags.includes("okf-v0.2") || r.tags.includes("okf"));
    return isLink && (hasOkfTag || r.type === "knowledge");
  });

  let okfStatus: 'pass' | 'warning' | 'fail' = 'pass';
  let okfNotes = "Tutti i documenti OKF v0.2 e i link risultano conformi.";
  if (webLinksAsOkf.length > 0) {
    okfStatus = 'warning';
    okfNotes = `${webLinksAsOkf.length} collegamenti web presentano tag o tipo OKF improprio.`;
  } else if (Math.abs(localOkfCount - firestoreOkfCount) > 0) {
    okfStatus = 'warning';
    okfNotes = `Discrepanza di ${Math.abs(localOkfCount - firestoreOkfCount)} documenti tra memoria locale e cloud.`;
  }

  // Determinazione stato complessivo di salute
  let healthStatus: 'HEALTHY' | 'DESYNCHRONIZED' | 'OFFLINE_CACHE' | 'ERROR' = 'HEALTHY';
  if (hasQuotaError) {
    healthStatus = 'OFFLINE_CACHE';
  } else if (errorCode) {
    healthStatus = 'ERROR';
  } else {
    // Un utente autenticato è considerato sano se i documenti utente corrispondono e non ci sono orfani non-demo
    const realOrphans = orphanResources.filter(
      (o) => !o.id.startsWith("sample-")
    );
    const userDelta = userOwnedLocal.length - effectiveFirestoreCount;
    if (userDelta !== 0 || realOrphans.length > 0) {
      healthStatus = 'DESYNCHRONIZED';
    }
  }

  return {
    id: reportId,
    timestamp,
    executionDurationMs,
    userId: targetUid,
    overallComparison: {
      localCount: totalLocal,
      firestoreCount: effectiveFirestoreCount,
      delta: totalLocal - effectiveFirestoreCount,
      status: totalLocal === effectiveFirestoreCount ? 'synced' : totalLocal > effectiveFirestoreCount ? 'local_excess' : 'firestore_excess',
    },
    userOwnedComparison: {
      localCount: userOwnedLocal.length,
      firestoreCount: effectiveFirestoreCount,
      delta: userOwnedLocal.length - effectiveFirestoreCount,
      status: userOwnedLocal.length === effectiveFirestoreCount ? 'synced' : userOwnedLocal.length > effectiveFirestoreCount ? 'local_excess' : 'firestore_excess',
    },
    systemSampleComparison: {
      localCount: systemSampleLocal.length,
      description: "Documenti dimostrativi di default precaricati all'avvio",
    },
    typeBreakdown,
    orphanResources,
    okfIntegrity: {
      localOkfCount,
      firestoreOkfCount,
      webLinksAsOkfCount: webLinksAsOkf.length,
      status: okfStatus,
      notes: okfNotes,
    },
    firestoreQueryDetails: {
      collection: collectionName,
      filterApplied,
      serverCountResult,
      rawDocsFetched,
      hasQuotaError,
      errorCode,
      errorMessage,
    },
    healthStatus,
  };
}
