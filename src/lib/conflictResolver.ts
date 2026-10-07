import { ResourceItem } from "../types";
import { parseDate, getTimestampMillis } from "./dateUtils";
import { recordLifecycleEvent } from "./resourceLifecycleTracker";

/**
 * Normalizza e purifica un URL per il calcolo della firma canonica univoca (OP-05):
 * - Rimuove differenze di protocollo (http vs https)
 * - Rimuove prefissi 'www.' ridondanti
 * - Rimuove trailing slash e frammenti hash (#...)
 * - Filtra parametri di tracking/analytics (utm_*, ref, fbclid, gclid, etc.)
 * - Preserva parametri funzionali (v per YouTube, id, path, etc.) ordinati deterministicamente
 */
export function getCanonicalUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (trimmed.length < 4) return "";

  try {
    const withProto = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
    const urlObj = new URL(withProto);

    let hostname = urlObj.hostname.toLowerCase();
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }

    let pathname = urlObj.pathname.replace(/\/+/g, "/").replace(/\/$/, "");
    if (!pathname) pathname = "";

    const trackingParams = new Set([
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "ref_src", "ref_url", "fbclid", "gclid", "dclid", "msclkid",
      "mc_cid", "mc_eid", "igshid", "si"
    ]);

    const cleanParams = new URLSearchParams();
    urlObj.searchParams.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (!trackingParams.has(lowerKey) && !lowerKey.startsWith("utm_")) {
        cleanParams.append(lowerKey, val);
      }
    });
    cleanParams.sort();
    const searchStr = cleanParams.toString();

    return `${hostname}${pathname}${searchStr ? `?${searchStr}` : ""}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "")
      .split("#")[0]
      .split("?")[0];
  }
}

/**
 * Genera una firma canonica univoca per una risorsa per prevenire duplicati
 * tra fonti locali e remote (Tri-Layer Storage Shield).
 */
export function getCanonicalSignature(item: ResourceItem): string {
  const cleanUrl = item.url ? getCanonicalUrl(item.url) : "";
  const cleanTitle = (item.title || "").trim().toLowerCase().replace(/\s+/g, " ");

  if (cleanUrl && cleanUrl.length > 8) {
    return `url:${cleanUrl}`;
  }

  const genericTitles = new Set([
    "readme", "documento", "note", "nota", "nuova risorsa",
    "untitled", "senza titolo", "appunti", "collegamento web", "risorsa senza titolo"
  ]);

  if (cleanTitle.length > 8 && !genericTitles.has(cleanTitle)) {
    return `title:${cleanTitle}`;
  }

  return `isolated:${item.id || Math.random().toString(36).slice(2)}`;
}

export type ConflictStatus =
  | "local_newer"
  | "remote_newer"
  | "identical"
  | "local_only"
  | "remote_only";

export type ResolutionChoice = "use_local" | "use_remote" | "merged";

export interface ConflictItem {
  id: string;
  title: string;
  type: ResourceItem["type"];
  domain?: string;
  localResource?: ResourceItem;
  remoteResource?: ResourceItem;
  localUpdatedAt: Date | null;
  remoteUpdatedAt: Date | null;
  localTimestampMs: number;
  remoteTimestampMs: number;
  status: ConflictStatus;
  resolution: ResolutionChoice;
  resolvedResource: ResourceItem;
  diffSummary?: string;
}

export interface ConflictAnalysisResult {
  hasConflicts: boolean;
  totalLocal: number;
  totalRemote: number;
  totalMerged: number;
  localOnlyCount: number;
  remoteOnlyCount: number;
  localNewerCount: number;
  remoteNewerCount: number;
  identicalCount: number;
  items: ConflictItem[];
  mergedResources: ResourceItem[];
  itemsToUploadToFirestore: ResourceItem[];
}

/**
 * Compares local resources with remote Firestore resources
 * based on the updatedAt (or createdAt) timestamp and content integrity.
 */
export function analyzeResourceConflicts(
  localItems: ResourceItem[],
  remoteItems: ResourceItem[]
): ConflictAnalysisResult {
  const localMap = new Map<string, ResourceItem>();
  const remoteMap = new Map<string, ResourceItem>();

  // Build remote signature index to detect when a local-ID document is actually already on remote (OP-05)
  const remoteSigMap = new Map<string, ResourceItem>();
  remoteItems.forEach((item) => {
    if (item.id) {
      remoteMap.set(item.id, item);
      const sig = getCanonicalSignature(item);
      if (!sig.startsWith("isolated:")) {
        remoteSigMap.set(sig, item);
      }
    }
  });

  // Map local items, consolidating any temp local IDs if a remote match already exists
  localItems.forEach((item) => {
    if (!item.id) return;

    // Check if this is a temp local ID that matches a remote resource by signature
    const isTempId = 
      item.id.startsWith("local-") || 
      item.id.startsWith("conv-") || 
      item.id.startsWith("seed-") || 
      item.id.startsWith("okf-sync-") ||
      item.id.startsWith("spec-");

    if (isTempId) {
      const sig = getCanonicalSignature(item);
      if (!sig.startsWith("isolated:")) {
        const matchedRemote = remoteSigMap.get(sig);
        if (matchedRemote) {
          recordLifecycleEvent({
            stage: "RESOURCE_COLLAPSED_DEDUPED",
            resourceId: item.id,
            resourceTitle: item.title,
            resourceType: item.type,
            status: "info",
            message: `Riconciliazione ID: risorsa temporanea "${item.id}" unificata con documento Firestore remoto "${matchedRemote.id}" ("${item.title}")`,
            details: { tempId: item.id, remoteId: matchedRemote.id, title: item.title, type: item.type, signature: sig },
          });

          // Associate this local item with the remote ID instead of keeping a split identity
          localMap.set(matchedRemote.id, {
            ...item,
            id: matchedRemote.id,
          });
          return;
        }
      }
    }

    localMap.set(item.id, item);
  });

  const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);
  const conflictItems: ConflictItem[] = [];
  const mergedMap = new Map<string, ResourceItem>();
  const itemsToUploadToFirestore: ResourceItem[] = [];

  let localOnlyCount = 0;
  let remoteOnlyCount = 0;
  let localNewerCount = 0;
  let remoteNewerCount = 0;
  let identicalCount = 0;

  allIds.forEach((id) => {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    // Case 1: Exists only in Local (created while offline / quota exceeded)
    if (local && !remote) {
      localOnlyCount++;
      const localUpdated = parseDate(local.updatedAt) || parseDate(local.createdAt) || new Date();
      const localMs = getTimestampMillis(localUpdated);

      conflictItems.push({
        id,
        title: local.title || "Documento senza titolo",
        type: local.type,
        domain: local.metadata?.domain,
        localResource: local,
        remoteResource: undefined,
        localUpdatedAt: localUpdated,
        remoteUpdatedAt: null,
        localTimestampMs: localMs,
        remoteTimestampMs: 0,
        status: "local_only",
        resolution: "use_local",
        resolvedResource: local,
        diffSummary: "Creato in locale durante il periodo offline",
      });

      mergedMap.set(id, local);
      itemsToUploadToFirestore.push(local);
      return;
    }

    // Case 2: Exists only in Remote (created on Firestore / cloud)
    if (!local && remote) {
      remoteOnlyCount++;
      const remoteUpdated = parseDate(remote.updatedAt) || parseDate(remote.createdAt) || new Date();
      const remoteMs = getTimestampMillis(remoteUpdated);

      conflictItems.push({
        id,
        title: remote.title || "Documento senza titolo",
        type: remote.type,
        domain: remote.metadata?.domain,
        localResource: undefined,
        remoteResource: remote,
        localUpdatedAt: null,
        remoteUpdatedAt: remoteUpdated,
        localTimestampMs: 0,
        remoteTimestampMs: remoteMs,
        status: "remote_only",
        resolution: "use_remote",
        resolvedResource: remote,
        diffSummary: "Presente su Firestore (non ancora scaricato in locale)",
      });

      mergedMap.set(id, remote);
      return;
    }

    // Case 3: Exists in both Local and Remote
    if (local && remote) {
      const localUpdated = parseDate(local.updatedAt) || parseDate(local.createdAt) || new Date();
      const remoteUpdated = parseDate(remote.updatedAt) || parseDate(remote.createdAt) || new Date();

      const localMs = getTimestampMillis(localUpdated);
      const remoteMs = getTimestampMillis(remoteUpdated);

      // Check if fields or timestamps differ
      const timeDiff = Math.abs(localMs - remoteMs);
      const titlesMatch = local.title === remote.title;
      const summariesMatch = local.summary === remote.summary;
      const tagsMatch = JSON.stringify(local.tags || []) === JSON.stringify(remote.tags || []);
      const contentMatch =
        (local.metadata?.markdownContent || "") === (remote.metadata?.markdownContent || "");

      const isContentIdentical = titlesMatch && summariesMatch && tagsMatch && contentMatch;

      if (isContentIdentical && timeDiff < 2000) {
        identicalCount++;
        conflictItems.push({
          id,
          title: local.title || "Documento",
          type: local.type,
          domain: local.metadata?.domain,
          localResource: local,
          remoteResource: remote,
          localUpdatedAt: localUpdated,
          remoteUpdatedAt: remoteUpdated,
          localTimestampMs: localMs,
          remoteTimestampMs: remoteMs,
          status: "identical",
          resolution: "use_remote",
          resolvedResource: remote,
          diffSummary: "Identico su entrambi i lati",
        });
        mergedMap.set(id, remote);
        return;
      }

      // Local is newer than Remote
      if (localMs > remoteMs) {
        localNewerCount++;
        conflictItems.push({
          id,
          title: local.title || remote.title || "Documento",
          type: local.type,
          domain: local.metadata?.domain,
          localResource: local,
          remoteResource: remote,
          localUpdatedAt: localUpdated,
          remoteUpdatedAt: remoteUpdated,
          localTimestampMs: localMs,
          remoteTimestampMs: remoteMs,
          status: "local_newer",
          resolution: "use_local",
          resolvedResource: local,
          diffSummary: `Modifica locale più recente di ${formatDurationDiff(localMs - remoteMs)}`,
        });
        mergedMap.set(id, local);
        itemsToUploadToFirestore.push(local);
        return;
      }

      // Remote is newer than Local
      if (remoteMs > localMs) {
        remoteNewerCount++;
        conflictItems.push({
          id,
          title: remote.title || local.title || "Documento",
          type: remote.type,
          domain: remote.metadata?.domain,
          localResource: local,
          remoteResource: remote,
          localUpdatedAt: localUpdated,
          remoteUpdatedAt: remoteUpdated,
          localTimestampMs: localMs,
          remoteTimestampMs: remoteMs,
          status: "remote_newer",
          resolution: "use_remote",
          resolvedResource: remote,
          diffSummary: `Versione Firestore più recente di ${formatDurationDiff(remoteMs - localMs)}`,
        });
        mergedMap.set(id, remote);
        return;
      }

      // Exact timestamp tie but content differs -> prefer local user's working draft
      localNewerCount++;
      conflictItems.push({
        id,
        title: local.title || remote.title || "Documento",
        type: local.type,
        domain: local.metadata?.domain,
        localResource: local,
        remoteResource: remote,
        localUpdatedAt: localUpdated,
        remoteUpdatedAt: remoteUpdated,
        localTimestampMs: localMs,
        remoteTimestampMs: remoteMs,
        status: "local_newer",
        resolution: "use_local",
        resolvedResource: local,
        diffSummary: "Contenuto differente a parità di data (preferita bozza locale)",
      });
      mergedMap.set(id, local);
      itemsToUploadToFirestore.push(local);
    }
  });

  // Canonical deduplication pass: collapse multiple duplicate URLs or identical long titles across sources
  const isBetterTitle = (candidate?: string, current?: string): boolean => {
    if (!candidate) return false;
    if (!current) return true;
    const candIsUrl = candidate.startsWith("http");
    const currIsUrl = current.startsWith("http");
    if (currIsUrl && !candIsUrl) return true;
    if (!currIsUrl && candIsUrl) return false;
    return candidate.length > current.length;
  };

  const dedupedMerged: ResourceItem[] = [];
  const canonicalUrlIndex = new Map<string, ResourceItem>();
  const canonicalTitleIndex = new Map<string, ResourceItem>();

  Array.from(mergedMap.values()).forEach((item) => {
    const cleanUrl = item.url ? getCanonicalUrl(item.url) : "";
    const cleanTitle = (item.title || "").trim().toLowerCase().replace(/\s+/g, " ");

    let matched: ResourceItem | null = null;
    if (cleanUrl && cleanUrl.length > 8) {
      matched = canonicalUrlIndex.get(cleanUrl) || null;
    }
    const genericTitles = new Set([
      "nuova risorsa", "readme", "documento", "collegamento web",
      "note", "nota", "untitled", "senza titolo", "appunti", "risorsa senza titolo"
    ]);
    if (!matched && cleanTitle && cleanTitle.length > 8 && !genericTitles.has(cleanTitle)) {
      matched = canonicalTitleIndex.get(cleanTitle) || null;
    }

    if (matched) {
      // Merge into canonical document
      if (isBetterTitle(item.title, matched.title)) {
        matched.title = item.title;
      }
      if (item.summary && (!matched.summary || matched.summary.length < item.summary.length)) {
        matched.summary = item.summary;
      }
      if (item.tags && item.tags.length > 0) {
        matched.tags = Array.from(new Set([...(matched.tags || []), ...item.tags]));
      }
      if (item.metadata) {
        matched.metadata = { ...(matched.metadata || {}), ...item.metadata };
      }
    } else {
      const canonical: ResourceItem = {
        ...item,
        tags: [...(item.tags || [])],
        metadata: { ...(item.metadata || {}) },
      };
      dedupedMerged.push(canonical);
      if (cleanUrl && cleanUrl.length > 8) {
        canonicalUrlIndex.set(cleanUrl, canonical);
      }
      if (cleanTitle && cleanTitle.length > 8 && !genericTitles.has(cleanTitle)) {
        canonicalTitleIndex.set(cleanTitle, canonical);
      }
    }
  });

  // Sort merged resources by createdAt descending
  const mergedResources = dedupedMerged.sort((a, b) => {
    const timeA = getTimestampMillis(a.createdAt);
    const timeB = getTimestampMillis(b.createdAt);
    return timeB - timeA;
  });

  const hasConflicts = localOnlyCount > 0 || localNewerCount > 0 || remoteNewerCount > 0;

  return {
    hasConflicts,
    totalLocal: localItems.length,
    totalRemote: remoteItems.length,
    totalMerged: mergedResources.length,
    localOnlyCount,
    remoteOnlyCount,
    localNewerCount,
    remoteNewerCount,
    identicalCount,
    items: conflictItems,
    mergedResources,
    itemsToUploadToFirestore,
  };
}

function formatDurationDiff(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}
