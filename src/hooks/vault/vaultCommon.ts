/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Utility pure condivise e funzioni helper per i micro-hook del Knowledge Vault
 */

import { ResourceItem, RawFileItem } from "../../types";
import { saveCachedResources, loadCachedResources, saveMultiLayerResources } from "../../lib/cacheManager";
import { recordLifecycleEvent } from "../../lib/resourceLifecycleTracker";

// Verifica se un valore è un oggetto JavaScript semplice
export function isPlainObject(value: any): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  if (typeof value.toMillis === "function" || typeof value.toDate === "function") return false;
  if ("_methodName" in value || "_delegate" in value) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

// Sanitizzatore ricorsivo per Firestore (elimina campi undefined)
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

// Verifica se un errore è correlato all'esaurimento quote Firestore (429 / RESOURCE_EXHAUSTED)
export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();

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

// Verifica se un errore è dovuto a timeout, offline o latenza di rete temporanea
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

// Esecuzione di operazioni Firestore con timeout di rete esplicito
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

export function saveLocalResources(items: ResourceItem[], uid?: string, currentRawFiles?: RawFileItem[]) {
  if (items.length === 0) {
    const existing = loadCachedResources(uid);
    if (existing && existing.length > 0) {
      console.warn("[vaultCommon] Prevented saving empty array over existing cached resources!");
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

  // 1. Instant synchronous localStorage cache persistence
  saveCachedResources(cleanItems, uid);

  // 2. Debounced multi-layer persistence save (IndexedDB + Server filesystem)
  lastPendingItems = cleanItems;
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
        console.warn("[vaultCommon] Multi-layer persistence background save error:", err);
      });
    }
  }, 1000);
}
