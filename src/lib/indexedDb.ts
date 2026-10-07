import { ResourceItem, RawFileItem } from "../types";

const DB_NAME = "KnowledgeVaultDB";
const DB_VERSION = 1;
const STORE_RESOURCES = "resources";
const STORE_RAW_FILES = "raw_files";
const STORE_META = "metadata";

let dbInstance: IDBDatabase | null = null;

/**
 * Initializes and opens the browser's IndexedDB database.
 */
export function openKnowledgeVaultDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_RESOURCES)) {
        db.createObjectStore(STORE_RESOURCES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_RAW_FILES)) {
        db.createObjectStore(STORE_RAW_FILES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.warn("[IndexedDB] Failed to open database:", event);
      reject(request.error);
    };
  });
}

/**
 * Persists an array of ResourceItem objects directly to IndexedDB.
 */
export async function saveResourcesToIndexedDB(resources: ResourceItem[]): Promise<void> {
  try {
    const db = await openKnowledgeVaultDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_RESOURCES, STORE_META], "readwrite");
      const store = transaction.objectStore(STORE_RESOURCES);
      const metaStore = transaction.objectStore(STORE_META);

      // Clear old items and write all current items
      store.clear();
      resources.forEach((item) => {
        store.put({
          ...item,
          // Normalize dates to ISO or millisecond numbers for safe IDB serialization
          createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
          updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
        });
      });

      metaStore.put({
        key: "last_saved",
        timestamp: Date.now(),
        count: resources.length,
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn("[IndexedDB] Error saving resources:", err);
  }
}

/**
 * Reads all stored ResourceItems from IndexedDB.
 */
export async function loadResourcesFromIndexedDB(): Promise<ResourceItem[]> {
  try {
    const db = await openKnowledgeVaultDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_RESOURCES], "readonly");
      const store = transaction.objectStore(STORE_RESOURCES);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        const normalized: ResourceItem[] = items.map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
        }));
        resolve(normalized);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("[IndexedDB] Error loading resources:", err);
    return [];
  }
}

/**
 * Persists raw files to IndexedDB (supporting large binary/base64 files without localStorage quota limits).
 */
export async function saveRawFilesToIndexedDB(files: RawFileItem[]): Promise<void> {
  try {
    const db = await openKnowledgeVaultDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_RAW_FILES], "readwrite");
      const store = transaction.objectStore(STORE_RAW_FILES);

      store.clear();
      files.forEach((file) => {
        store.put({
          ...file,
          createdAt: file.createdAt instanceof Date ? file.createdAt.toISOString() : file.createdAt,
          updatedAt: file.updatedAt instanceof Date ? file.updatedAt.toISOString() : file.updatedAt,
        });
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn("[IndexedDB] Error saving raw files:", err);
  }
}

/**
 * Reads all stored RawFileItems from IndexedDB.
 */
export async function loadRawFilesFromIndexedDB(): Promise<RawFileItem[]> {
  try {
    const db = await openKnowledgeVaultDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_RAW_FILES], "readonly");
      const store = transaction.objectStore(STORE_RAW_FILES);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        const normalized: RawFileItem[] = items.map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
        }));
        resolve(normalized);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("[IndexedDB] Error loading raw files:", err);
    return [];
  }
}
