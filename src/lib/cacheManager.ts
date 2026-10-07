import { ResourceItem, RawFileItem } from "../types";
import {
  saveResourcesToIndexedDB,
  loadResourcesFromIndexedDB,
  saveRawFilesToIndexedDB,
  loadRawFilesFromIndexedDB,
} from "./indexedDb";

export interface CacheMetadata {
  lastSyncTimestamp: number;
  syncIntervalMs: number;
  isQuotaExceeded: boolean;
  quotaResetTimePST: string;
  serverBackupSavedAt?: string;
}

const RESOURCES_CACHE_KEY = "KV_RESOURCES_CACHE";
const RAW_FILES_CACHE_KEY = "KV_RAW_FILES_CACHE";
const CACHE_META_KEY = "KV_CACHE_META";
const QUOTA_EXCEEDED_KEY = "KV_QUOTA_EXCEEDED_FLAG";

// Default interval: 10 minutes (600,000 ms)
export const DEFAULT_SYNC_INTERVAL_MS = 10 * 60 * 1000;

// Google Cloud quotas reset every day at 00:00 US Pacific Time (PST/PDT)
export function getPacificDateKey(): string {
  const now = new Date();
  const utc = now.getTime();
  const jan = new Date(now.getFullYear(), 0, 1);
  const jul = new Date(now.getFullYear(), 6, 1);
  const isDST = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset()) !== now.getTimezoneOffset();
  const pacificOffsetHours = isDST ? -7 : -8;
  const pacificDate = new Date(utc + pacificOffsetHours * 3600000);
  return `${pacificDate.getUTCFullYear()}-${String(pacificDate.getUTCMonth() + 1).padStart(2, "0")}-${String(pacificDate.getUTCDate()).padStart(2, "0")}`;
}

export function isQuotaExceededSaved(): boolean {
  try {
    const raw = localStorage.getItem(QUOTA_EXCEEDED_KEY);
    if (!raw) return false;

    // Check modern JSON structure with daily dateKey
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw);
      const todayKey = getPacificDateKey();
      if (parsed.isExceeded && parsed.dateKey === todayKey) {
        return true;
      }
      // If dateKey is old (yesterday or older), quota automatically reset on Google Cloud!
      localStorage.removeItem(QUOTA_EXCEEDED_KEY);
      return false;
    }

    // Legacy unversioned "true" flag: purge immediately to prevent false-positive sticky banner
    if (raw === "true") {
      localStorage.removeItem(QUOTA_EXCEEDED_KEY);
      return false;
    }
  } catch {
    // Ignore
  }
  return false;
}

export function saveQuotaExceededStatus(isExceeded: boolean): void {
  try {
    if (isExceeded) {
      const record = {
        isExceeded: true,
        dateKey: getPacificDateKey(),
        timestamp: Date.now(),
      };
      localStorage.setItem(QUOTA_EXCEEDED_KEY, JSON.stringify(record));
    } else {
      localStorage.removeItem(QUOTA_EXCEEDED_KEY);
    }
  } catch {
    // Ignore
  }
}

/**
 * Calculates the exact next Firebase Daily Quota Reset time.
 * Google Cloud / Firebase quotas reset every day at midnight US Pacific Time (00:00 PST/PDT).
 * Calculates remaining hours, minutes and seconds in local time.
 */
export function getFirebaseQuotaResetInfo(): {
  resetDate: Date;
  formattedResetTime: string;
  remainingHours: number;
  remainingMinutes: number;
  remainingSeconds: number;
  formattedCountdown: string;
  pacificTimeString: string;
} {
  const now = new Date();

  // Extract year, month, day, hour, minute, second in America/Los_Angeles timezone natively
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);

  const hour = getPart("hour") % 24;
  const minute = getPart("minute");
  const second = getPart("second");

  // Total seconds elapsed in current Pacific day
  const secondsSinceMidnight = hour * 3600 + minute * 60 + second;
  const totalSecondsInDay = 86400;
  const remainingTotalSeconds = Math.max(0, totalSecondsInDay - secondsSinceMidnight);

  const remainingHours = Math.floor(remainingTotalSeconds / 3600);
  const remainingMinutes = Math.floor((remainingTotalSeconds % 3600) / 60);
  const remainingSeconds = remainingTotalSeconds % 60;

  const nextResetDate = new Date(now.getTime() + remainingTotalSeconds * 1000);
  const formattedResetTime = nextResetDate.toLocaleTimeString(navigator.language || "it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const formattedCountdown = `${remainingHours}h ${remainingMinutes.toString().padStart(2, "0")}m ${remainingSeconds
    .toString()
    .padStart(2, "0")}s`;

  const pacificTimeString = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")} PT`;

  return {
    resetDate: nextResetDate,
    formattedResetTime,
    remainingHours,
    remainingMinutes,
    remainingSeconds,
    formattedCountdown,
    pacificTimeString,
  };
}

// ----------------------------------------------------------------------
// 1. LOCAL STORAGE
// ----------------------------------------------------------------------

export function saveCachedResources(items: ResourceItem[], uid?: string): void {
  try {
    const key = uid ? `${RESOURCES_CACHE_KEY}_${uid}` : RESOURCES_CACHE_KEY;
    localStorage.setItem(key, JSON.stringify(items));
    localStorage.setItem(RESOURCES_CACHE_KEY, JSON.stringify(items));
    updateCacheTimestamp();
  } catch (e) {
    console.warn("[CacheManager] Error saving resources to localStorage:", e);
  }
}

export function loadCachedResources(uid?: string): ResourceItem[] | null {
  try {
    const key = uid ? `${RESOURCES_CACHE_KEY}_${uid}` : RESOURCES_CACHE_KEY;
    const raw = localStorage.getItem(key) || localStorage.getItem(RESOURCES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
        }));
      }
    }
  } catch (e) {
    console.warn("[CacheManager] Error loading resources from localStorage:", e);
  }
  return null;
}

export function saveCachedRawFiles(files: RawFileItem[], uid?: string): void {
  try {
    const key = uid ? `${RAW_FILES_CACHE_KEY}_${uid}` : RAW_FILES_CACHE_KEY;
    const trimmed = files.map((f) => ({
      ...f,
      base64Data: f.base64Data ? f.base64Data.slice(0, 1000) + "..." : undefined,
    }));
    localStorage.setItem(key, JSON.stringify(trimmed));
    localStorage.setItem(RAW_FILES_CACHE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("[CacheManager] Error saving raw files to localStorage:", e);
  }
}

export function loadCachedRawFiles(uid?: string): RawFileItem[] | null {
  try {
    const key = uid ? `${RAW_FILES_CACHE_KEY}_${uid}` : RAW_FILES_CACHE_KEY;
    const raw = localStorage.getItem(key) || localStorage.getItem(RAW_FILES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((file) => ({
          ...file,
          createdAt: file.createdAt ? new Date(file.createdAt) : new Date(),
          updatedAt: file.updatedAt ? new Date(file.updatedAt) : new Date(),
        }));
      }
    }
  } catch (e) {
    console.warn("[CacheManager] Error loading raw files from localStorage:", e);
  }
  return null;
}

// ----------------------------------------------------------------------
// 2. BACKEND SERVER FILESYSTEM STORAGE
// ----------------------------------------------------------------------

export async function saveToServerFilesystem(
  resources: ResourceItem[],
  rawFiles?: RawFileItem[],
  userId?: string,
  deletedResourceIds?: string[]
): Promise<{ success: boolean; count?: number; savedAt?: string; formattedSize?: string }> {
  try {
    const response = await fetch("/api/vault/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resources,
        rawFiles: rawFiles || [],
        userId: userId || "local-vault-user",
        deletedResourceIds: deletedResourceIds || [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Server backup returned status ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      count: data.count,
      savedAt: data.savedAt,
      formattedSize: data.formattedSize,
    };
  } catch (error: any) {
    console.warn("[CacheManager] Server backup save error:", error?.message || error);
    return { success: false };
  }
}

export async function loadFromServerFilesystem(): Promise<{
  resources: ResourceItem[];
  rawFiles: RawFileItem[];
  savedAt?: string;
} | null> {
  try {
    const response = await fetch("/api/vault/backup");
    if (!response.ok) return null;

    const data = await response.json();
    if (data.exists && Array.isArray(data.resources) && data.resources.length > 0) {
      const normalizedResources: ResourceItem[] = data.resources.map((item: any) => ({
        ...item,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
      }));

      const normalizedRawFiles: RawFileItem[] = (data.rawFiles || []).map((file: any) => ({
        ...file,
        createdAt: file.createdAt ? new Date(file.createdAt) : new Date(),
        updatedAt: file.updatedAt ? new Date(file.updatedAt) : new Date(),
      }));

      return {
        resources: normalizedResources,
        rawFiles: normalizedRawFiles,
        savedAt: data.savedAt,
      };
    }
  } catch (error) {
    console.warn("[CacheManager] Server backup load error:", error);
  }
  return null;
}

// ----------------------------------------------------------------------
// 3. UNIFIED MULTI-LAYER SAVE (LocalStorage + IndexedDB + Server Filesystem)
// ----------------------------------------------------------------------

export async function saveMultiLayerResources(
  resources: ResourceItem[],
  rawFiles?: RawFileItem[],
  userId?: string,
  deletedResourceIds?: string[]
): Promise<{
  localSuccess: boolean;
  indexedDbSuccess: boolean;
  serverSuccess: boolean;
  serverInfo?: { savedAt?: string; formattedSize?: string };
}> {
  let localSuccess = false;
  let indexedDbSuccess = false;
  let serverSuccess = false;
  let serverInfo: any = undefined;

  // 1. LocalStorage
  try {
    saveCachedResources(resources, userId);
    if (rawFiles) saveCachedRawFiles(rawFiles, userId);
    localSuccess = true;
  } catch (e) {
    console.warn("[MultiLayer] LocalStorage save failed:", e);
  }

  // 2. IndexedDB
  try {
    await saveResourcesToIndexedDB(resources);
    if (rawFiles && rawFiles.length > 0) {
      await saveRawFilesToIndexedDB(rawFiles);
    }
    indexedDbSuccess = true;
  } catch (e) {
    console.warn("[MultiLayer] IndexedDB save failed:", e);
  }

  // 3. Server Filesystem
  try {
    const srvResult = await saveToServerFilesystem(resources, rawFiles, userId, deletedResourceIds);
    if (srvResult.success) {
      serverSuccess = true;
      serverInfo = {
        savedAt: srvResult.savedAt,
        formattedSize: srvResult.formattedSize,
      };
    }
  } catch (e) {
    console.warn("[MultiLayer] Server save failed:", e);
  }

  return {
    localSuccess,
    indexedDbSuccess,
    serverSuccess,
    serverInfo,
  };
}

export function updateCacheTimestamp(): void {
  try {
    const meta: CacheMetadata = {
      lastSyncTimestamp: Date.now(),
      syncIntervalMs: DEFAULT_SYNC_INTERVAL_MS,
      isQuotaExceeded: false,
      quotaResetTimePST: "00:00 PST",
    };
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
  } catch (e) {
    // Ignore storage write warnings
  }
}

export function getCacheMetadata(): CacheMetadata {
  try {
    const raw = localStorage.getItem(CACHE_META_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    // Fallback
  }
  return {
    lastSyncTimestamp: Date.now(),
    syncIntervalMs: DEFAULT_SYNC_INTERVAL_MS,
    isQuotaExceeded: false,
    quotaResetTimePST: "00:00 PST",
  };
}
