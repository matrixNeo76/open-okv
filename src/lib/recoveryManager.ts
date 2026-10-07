import { ResourceItem, RawFileItem } from "../types";
import { loadResourcesFromIndexedDB } from "./indexedDb";
import { loadFromServerFilesystem, saveMultiLayerResources } from "./cacheManager";
import { parseDate } from "./dateUtils";

export interface StorageSourceDetail {
  sourceName: string;
  count: number;
  description: string;
  items: ResourceItem[];
}

export interface DeepRecoveryScanReport {
  totalUniqueResources: number;
  uniqueResources: ResourceItem[];
  sources: StorageSourceDetail[];
  totalRawFilesFound: number;
  rawFiles: RawFileItem[];
  hasRecoverableData: boolean;
  scanTimestamp: number;
  currentVaultCount: number;
}

/**
 * Performs a deep scan across all available client-side and server-side storage layers:
 * 1. Every key in window.localStorage (even orphaned or previous account keys)
 * 2. window.sessionStorage
 * 3. Browser IndexedDB (KnowledgeVaultDB)
 * 4. Server Filesystem (/api/vault/backup and snapshots)
 */
export async function performDeepRecoveryScan(currentVaultResources: ResourceItem[]): Promise<DeepRecoveryScanReport> {
  const sources: StorageSourceDetail[] = [];
  const rawFilesAccumulator: RawFileItem[] = [];
  const allFoundResources: ResourceItem[] = [];

  // Helper to normalize and validate resources
  const normalizeItems = (items: any[], sourceKey: string): ResourceItem[] => {
    if (!Array.isArray(items)) return [];
    const valid: ResourceItem[] = [];
    items.forEach((item, index) => {
      if (item && typeof item === "object" && (item.title || item.type || item.url || item.metadata)) {
        const title = item.title || `Risorsa senza titolo #${index + 1}`;
        const type = item.type || "knowledge";
        const createdAt = parseDate(item.createdAt) || parseDate(item.updatedAt) || new Date();
        const updatedAt = parseDate(item.updatedAt) || createdAt;
        valid.push({
          ...item,
          id: item.id || `recovered-${sourceKey}-${index}-${Date.now()}`,
          title,
          type,
          summary: item.summary || "",
          tags: Array.isArray(item.tags) ? item.tags : [],
          createdAt,
          updatedAt,
        });
      }
    });
    return valid;
  };

  // 1. SCAN ALL LOCALSTORAGE KEYS (Exhaustive Scan)
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const storageLength = localStorage.length;
      for (let i = 0; i < storageLength; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        try {
          const rawVal = localStorage.getItem(key);
          if (rawVal && (rawVal.startsWith("[") || rawVal.startsWith("{"))) {
            const parsed = JSON.parse(rawVal);
            let itemsToProcess: any[] = [];
            if (Array.isArray(parsed)) {
              itemsToProcess = parsed;
            } else if (parsed && Array.isArray(parsed.resources)) {
              itemsToProcess = parsed.resources;
            } else if (parsed && Array.isArray(parsed.items)) {
              itemsToProcess = parsed.items;
            } else if (parsed && typeof parsed === "object" && parsed.title && (parsed.type || parsed.metadata)) {
              itemsToProcess = [parsed];
            }

            const normalized = normalizeItems(itemsToProcess, key);
            if (normalized.length > 0) {
              sources.push({
                sourceName: `LocalStorage: ${key}`,
                count: normalized.length,
                description: `Dati trovati nella chiave browser '${key}'`,
                items: normalized,
              });
              allFoundResources.push(...normalized);
            }

            // Also check for raw files in this key
            let rawFilesToProcess: any[] = [];
            if (Array.isArray(parsed) && parsed.some((p: any) => p && p.fileName)) {
              rawFilesToProcess = parsed;
            } else if (parsed && Array.isArray(parsed.rawFiles)) {
              rawFilesToProcess = parsed.rawFiles;
            }
            rawFilesToProcess.forEach((rf: any) => {
              if (rf && rf.fileName) {
                rawFilesAccumulator.push({
                  ...rf,
                  createdAt: parseDate(rf.createdAt) || new Date(),
                });
              }
            });
          }
        } catch {
          // Ignore non-json keys
        }
      }
    }
  } catch (err) {
    console.warn("[RecoveryManager] Error scanning localStorage:", err);
  }

  // 2. SCAN ALL SESSIONSTORAGE KEYS
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        try {
          const rawVal = sessionStorage.getItem(key);
          if (rawVal && (rawVal.startsWith("[") || rawVal.startsWith("{"))) {
            const parsed = JSON.parse(rawVal);
            let itemsToProcess: any[] = [];
            if (Array.isArray(parsed)) {
              itemsToProcess = parsed;
            } else if (parsed && Array.isArray(parsed.resources)) {
              itemsToProcess = parsed.resources;
            } else if (parsed && Array.isArray(parsed.items)) {
              itemsToProcess = parsed.items;
            }
            const normalized = normalizeItems(itemsToProcess, `session-${key}`);
            if (normalized.length > 0) {
              sources.push({
                sourceName: `SessionStorage: ${key}`,
                count: normalized.length,
                description: `Dati di sessione nella chiave '${key}'`,
                items: normalized,
              });
              allFoundResources.push(...normalized);
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn("[RecoveryManager] Error scanning sessionStorage:", err);
  }

  // 3. SCAN INDEXEDDB (Both KnowledgeVaultDB and any existing DBs)
  try {
    // Standard KnowledgeVaultDB
    const idbResources = await loadResourcesFromIndexedDB();
    if (idbResources && idbResources.length > 0) {
      sources.push({
        sourceName: "Browser IndexedDB (KnowledgeVaultDB)",
        count: idbResources.length,
        description: "Database locale strutturato IndexedDB del browser",
        items: idbResources,
      });
      allFoundResources.push(...idbResources);
    }

    // Extended scan: if browser supports indexedDB.databases(), scan any other databases on this origin
    if (typeof window !== "undefined" && window.indexedDB && (window.indexedDB as any).databases) {
      try {
        const dbs = await (window.indexedDB as any).databases();
        for (const dbInfo of dbs) {
          if (dbInfo && dbInfo.name && dbInfo.name !== "KnowledgeVaultDB") {
            try {
              const req = indexedDB.open(dbInfo.name);
              await new Promise<void>((resolve) => {
                req.onsuccess = () => {
                  try {
                    const otherDb = req.result;
                    const storeNames = Array.from(otherDb.objectStoreNames);
                    for (const storeName of storeNames) {
                      try {
                        const tx = otherDb.transaction(storeName, "readonly");
                        const store = tx.objectStore(storeName);
                        const getAllReq = store.getAll();
                        getAllReq.onsuccess = () => {
                          const results = getAllReq.result || [];
                          const normalized = normalizeItems(results, `${dbInfo.name}.${storeName}`);
                          if (normalized.length > 0) {
                            sources.push({
                              sourceName: `IndexedDB: ${dbInfo.name} / ${storeName}`,
                              count: normalized.length,
                              description: `Record trovati in IndexedDB alternativo`,
                              items: normalized,
                            });
                            allFoundResources.push(...normalized);
                          }
                        };
                      } catch {}
                    }
                    otherDb.close();
                  } catch {}
                  resolve();
                };
                req.onerror = () => resolve();
              });
            } catch {}
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn("[RecoveryManager] Error scanning IndexedDB:", err);
  }

  // 4. SCAN SERVER BACKUP FILESYSTEM
  try {
    const serverBackup = await loadFromServerFilesystem();
    if (serverBackup && serverBackup.resources && serverBackup.resources.length > 0) {
      sources.push({
        sourceName: "Backup Server Filesystem (data/vault-backup.json)",
        count: serverBackup.resources.length,
        description: `Backup persistente su file system server (${serverBackup.savedAt || "recente"})`,
        items: serverBackup.resources,
      });
      allFoundResources.push(...serverBackup.resources);
      if (serverBackup.rawFiles && serverBackup.rawFiles.length > 0) {
        rawFilesAccumulator.push(...serverBackup.rawFiles);
      }
    }
  } catch (err) {
    console.warn("[RecoveryManager] Error scanning server filesystem:", err);
  }

  // 5. SCAN SERVER SNAPSHOTS IF AVAILABLE
  try {
    const snapshotsRes = await fetch("/api/vault/snapshots");
    if (snapshotsRes.ok) {
      const snapData = await snapshotsRes.json();
      if (Array.isArray(snapData.snapshots) && snapData.snapshots.length > 0) {
        for (const snap of snapData.snapshots) {
          if (snap.filename) {
            try {
              const resFile = await fetch(`/api/vault/snapshot-detail?filename=${encodeURIComponent(snap.filename)}`);
              if (resFile.ok) {
                const jsonDetail = await resFile.json();
                if (Array.isArray(jsonDetail.resources) && jsonDetail.resources.length > 0) {
                  const normalized = normalizeItems(jsonDetail.resources, snap.filename);
                  sources.push({
                    sourceName: `Snapshot Storico: ${snap.filename}`,
                    count: normalized.length,
                    description: `Istantanea server salvata il ${new Date(snap.timestamp).toLocaleString("it-IT")}`,
                    items: normalized,
                  });
                  allFoundResources.push(...normalized);
                }
              }
            } catch {}
          }
        }
      }
    }
  } catch {}

  // 6. DEDUPLICATE ALL FOUND RESOURCES
  // We deduplicate by unique resource ID, or combination of normalized title, URL, and type
  const uniqueMap = new Map<string, ResourceItem>();

  const isBetterTitle = (candidate?: string, current?: string): boolean => {
    if (!candidate) return false;
    if (!current) return true;
    const candIsUrl = candidate.startsWith("http");
    const currIsUrl = current.startsWith("http");
    if (currIsUrl && !candIsUrl) return true;
    if (!currIsUrl && candIsUrl) return false;
    return candidate.length > current.length;
  };

  allFoundResources.forEach((item) => {
    const titleKey = (item.title || "").trim().toLowerCase();
    const urlKey = item.url ? item.url.trim().toLowerCase().replace(/\/$/, "").split("?")[0] : "";
    
    // Check if duplicate already exists in uniqueMap by ID, canonical URL, or unique title
    let foundExisting: ResourceItem | null = null;
    if (item.id && uniqueMap.has(item.id)) {
      foundExisting = uniqueMap.get(item.id)!;
    } else {
      for (const [_, existing] of uniqueMap.entries()) {
        const existTitle = (existing.title || "").trim().toLowerCase();
        const existUrl = existing.url ? existing.url.trim().toLowerCase().replace(/\/$/, "").split("?")[0] : "";
        
        const isSameUrl = urlKey && existUrl && urlKey.length > 12 && existUrl === urlKey;
        const isSameTitle = titleKey && existTitle && titleKey.length > 8 && !["nuova risorsa", "readme", "documento", "collegamento web"].includes(titleKey) && existTitle === titleKey;
        
        if (isSameUrl || isSameTitle) {
          foundExisting = existing;
          break;
        }
      }
    }

    if (foundExisting) {
      if (isBetterTitle(item.title, foundExisting.title)) {
        foundExisting.title = item.title;
      }
      if (item.summary && (!foundExisting.summary || foundExisting.summary.length < item.summary.length)) {
        foundExisting.summary = item.summary;
      }
      if (item.tags && item.tags.length > 0) {
        foundExisting.tags = Array.from(new Set([...(foundExisting.tags || []), ...item.tags]));
      }
      if (item.metadata) {
        foundExisting.metadata = { ...(foundExisting.metadata || {}), ...item.metadata };
      }
    } else {
      uniqueMap.set(item.id || `gen-${Math.random()}`, {
        ...item,
        tags: [...(item.tags || [])],
        metadata: { ...(item.metadata || {}) },
      });
    }
  });

  const uniqueResources = Array.from(uniqueMap.values());
  const hasRecoverableData = uniqueResources.length > currentVaultResources.length;

  return {
    totalUniqueResources: uniqueResources.length,
    uniqueResources,
    sources,
    totalRawFilesFound: rawFilesAccumulator.length,
    rawFiles: rawFilesAccumulator,
    hasRecoverableData,
    scanTimestamp: Date.now(),
    currentVaultCount: currentVaultResources.length,
  };
}

/**
 * Restores recovered resources into the Vault and persists to all storage layers.
 */
export async function restoreRecoveredResources(
  recoveredResources: ResourceItem[],
  existingResources: ResourceItem[],
  currentUserId?: string,
  rawFiles?: RawFileItem[]
): Promise<{
  mergedCount: number;
  addedCount: number;
  restoredResources: ResourceItem[];
}> {
  const mergedMap = new Map<string, ResourceItem>();

  const getItemKey = (item: ResourceItem): string => {
    if (item.id) return `id:${item.id}`;
    const normTitle = (item.title || "").trim().toLowerCase();
    const cleanUrl = item.url ? item.url.trim().toLowerCase().replace(/\/$/, "") : "";
    return `comp:${item.type}:${normTitle}__${cleanUrl}`;
  };

  // Add existing items first
  existingResources.forEach((item) => {
    mergedMap.set(getItemKey(item), item);
  });

  let addedCount = 0;

  // Add recovered items
  recoveredResources.forEach((item) => {
    const key = getItemKey(item);
    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        ...item,
        userId: currentUserId || item.userId || "vault-user",
        createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt || Date.now()),
        updatedAt: new Date(),
      });
      addedCount++;
    } else {
      // Merge tags and metadata
      const existing = mergedMap.get(key)!;
      if (item.tags && item.tags.length > 0) {
        existing.tags = Array.from(new Set([...(existing.tags || []), ...item.tags]));
      }
      if (item.isFavorite && !existing.isFavorite) {
        existing.isFavorite = true;
      }
      if (item.metadata) {
        existing.metadata = { ...existing.metadata, ...item.metadata };
      }
    }
  });

  const restoredResources = Array.from(mergedMap.values());

  // Sort by createdAt descending
  restoredResources.sort((a, b) => {
    const tA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const tB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return tB - tA;
  });

  // Save to all layers
  await saveMultiLayerResources(restoredResources, rawFiles, currentUserId);

  return {
    mergedCount: restoredResources.length,
    addedCount,
    restoredResources,
  };
}

/**
 * Exports resources directly as a downloadable JSON file in the browser.
 */
export function downloadBackupJSON(resources: ResourceItem[], rawFiles?: RawFileItem[]): void {
  const payload = {
    vaultVersion: "0.2",
    exportedAt: new Date().toISOString(),
    totalResources: resources.length,
    totalRawFiles: rawFiles?.length || 0,
    resources,
    rawFiles: rawFiles || [],
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `knowledge-vault-backup-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Creates an on-demand server snapshot with timestamp and custom label.
 */
export async function createManualServerSnapshot(
  resources: ResourceItem[],
  rawFiles?: RawFileItem[],
  label: string = "Snapshot Manuale",
  userId?: string
): Promise<{
  success: boolean;
  filename: string;
  count: number;
  formattedDate: string;
  formattedSize: string;
}> {
  const response = await fetch("/api/vault/create-snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label,
      resources,
      rawFiles: rawFiles || [],
      userId,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Errore HTTP ${response.status} nella creazione snapshot`);
  }

  return await response.json();
}

/**
 * Sanitizes and compacts browser local storage by purging obsolete or corrupted temporary keys.
 */
export function sanitizeLocalStorage(): { purgedKeys: number; freedBytesApprox: number } {
  let purgedKeys = 0;
  let freedBytesApprox = 0;

  if (typeof window === "undefined" || !window.localStorage) {
    return { purgedKeys: 0, freedBytesApprox: 0 };
  }

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Identify junk, temporary or nullified keys
      const val = localStorage.getItem(k);
      if (!val || val === "null" || val === "undefined" || val === "{}") {
        keysToRemove.push(k);
        continue;
      }

      // Check for legacy dead keys or runaway tokens
      if (k.startsWith("temp_") || k.startsWith("debug_") || k.includes("_stale_")) {
        keysToRemove.push(k);
        continue;
      }
    }

    keysToRemove.forEach((k) => {
      const v = localStorage.getItem(k) || "";
      freedBytesApprox += k.length + v.length;
      localStorage.removeItem(k);
      purgedKeys++;
    });
  } catch (err) {
    console.warn("[RecoveryManager] sanitizeLocalStorage warning:", err);
  }

  return { purgedKeys, freedBytesApprox };
}

/**
 * Generates an exhaustive markdown report of all storage layers and recovery statuses.
 */
export function generateRecoveryDiagnosticReport(
  report: DeepRecoveryScanReport | null,
  currentResources: ResourceItem[],
  activeFiltersDesc?: string
): string {
  const nowStr = new Date().toLocaleString("it-IT");
  let md = `# 🛡️ Report Diagnostico: Centro di Recupero & Protezione Dati Knowledge Vault\n\n`;
  md += `> **Data Scansione**: ${nowStr}  \n`;
  md += `> **Standard di Conformità**: Open Knowledge Format (OKF v0.2)  \n`;
  md += `> **Stato Filtri UI Attivi**: ${activeFiltersDesc || "Nessun filtro restrittivo (Visualizzazione Completa)"}\n\n`;
  md += `---\n\n`;

  md += `## 1. Riepilogo Volumetrico Storage\n\n`;
  md += `| Parametro | Valore |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Risorse Attive nel Vault** | **${currentResources.length}** |\n`;
  md += `| **Risorse Uniche Rilevate nello Storage** | **${report ? report.totalUniqueResources : "N/D"}** |\n`;
  
  const missingCount = report ? Math.max(0, report.totalUniqueResources - currentResources.length) : 0;
  md += `| **Risorse Mancanti / Recuperabili** | **${missingCount > 0 ? `+${missingCount} (DA RIPRISTINARE)` : "0 (Allineamento Perfetto)"}** |\n`;
  md += `| **Livelli di Storage con Dati** | ${report ? report.sources.length : "N/D"} sorgenti |\n`;
  md += `| **File Grezzi Preservati** | ${report ? report.totalRawFilesFound : 0} |\n\n`;

  if (report && report.sources.length > 0) {
    md += `## 2. Dettaglio Livelli di Storage Scansionati\n\n`;
    report.sources.forEach((s, idx) => {
      md += `### ${idx + 1}. \`${s.sourceName}\`\n`;
      md += `- **Descrizione**: ${s.description}\n`;
      md += `- **Elementi Rilevati**: **${s.count}**\n\n`;
    });
  }

  if (report && missingCount > 0) {
    const activeIds = new Set(currentResources.map((r) => r.id));
    const activeTitles = new Set(currentResources.map((r) => (r.title || "").trim().toLowerCase()));
    const missingItems = report.uniqueResources.filter((item) => {
      if (item.id && activeIds.has(item.id)) return false;
      const t = (item.title || "").trim().toLowerCase();
      if (t && activeTitles.has(t)) return false;
      return true;
    });

    md += `## 3. Elenco Risorse Recuperabili Non Attive (${missingItems.length})\n\n`;
    missingItems.slice(0, 30).forEach((item, idx) => {
      md += `${idx + 1}. **${item.title}** (\`${item.type}\`)\n`;
      if (item.summary) md += `   - *Sintesi*: ${item.summary.slice(0, 120)}...\n`;
      if (item.tags?.length) md += `   - *Tag*: ${item.tags.join(", ")}\n`;
    });
    if (missingItems.length > 30) {
      md += `\n*...e altre ${missingItems.length - 30} risorse recuperabili disponibili nel report completo.*\n`;
    }
  } else {
    md += `## 3. Stato di Coerenza\n\n`;
    md += `✅ Nessuna discrepanza o perdita rilevata. Tutte le risorse uniche archiviate nei database locali e remoti sono attualmente visibili e caricate nel Vault.\n`;
  }

  md += `\n---\n*Report generato automaticamente dal modulo Storage Shield v0.2*\n`;
  return md;
}

