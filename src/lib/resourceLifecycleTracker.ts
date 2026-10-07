import { ResourceItem, NavCategory, ResourceLifecycleEvent, LifecycleStage } from "../types";

const LIFECYCLE_STORAGE_KEY = "KV_RESOURCE_LIFECYCLE_AUDIT_LOGS";
const MAX_LIFECYCLE_LOGS = 120;

type LifecycleListener = (events: ResourceLifecycleEvent[]) => void;
const listeners = new Set<LifecycleListener>();

let memoryEvents: ResourceLifecycleEvent[] = [];

// Load persisted events on initial module load
try {
  const raw = localStorage.getItem(LIFECYCLE_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryEvents = parsed;
    }
  }
} catch {
  memoryEvents = [];
}

function persistEvents() {
  try {
    localStorage.setItem(LIFECYCLE_STORAGE_KEY, JSON.stringify(memoryEvents.slice(0, MAX_LIFECYCLE_LOGS)));
  } catch (err) {
    console.warn("[LifecycleTracker] Failed to persist logs to localStorage:", err);
  }
}

function notifySubscribers() {
  listeners.forEach((fn) => {
    try {
      fn([...memoryEvents]);
    } catch (err) {
      console.error("[LifecycleTracker] Error in subscriber:", err);
    }
  });
}

/**
 * Records a granular lifecycle event to trace resource creations, writes, merges, and drops.
 */
export function recordLifecycleEvent(
  event: Omit<ResourceLifecycleEvent, "id" | "timestamp">
): ResourceLifecycleEvent {
  const newEvent: ResourceLifecycleEvent = {
    ...event,
    id: "evt-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toLocaleTimeString("it-IT", { hour12: false }),
  };

  memoryEvents.unshift(newEvent);
  if (memoryEvents.length > MAX_LIFECYCLE_LOGS) {
    memoryEvents = memoryEvents.slice(0, MAX_LIFECYCLE_LOGS);
  }

  persistEvents();
  notifySubscribers();

  // Highlight in developer console
  const prefix = `[LIFECYCLE][${newEvent.stage}]`;
  if (newEvent.status === "error") {
    console.error(prefix, newEvent.message, newEvent.details || "");
  } else if (newEvent.status === "warn") {
    console.warn(prefix, newEvent.message, newEvent.details || "");
  } else {
    console.info(prefix, newEvent.message, newEvent.details || "");
  }

  return newEvent;
}

/**
 * Returns current snapshot of all lifecycle events.
 */
export function getLifecycleEvents(): ResourceLifecycleEvent[] {
  return [...memoryEvents];
}

/**
 * Subscribes to new lifecycle events.
 */
export function subscribeToLifecycleEvents(callback: LifecycleListener): () => void {
  listeners.add(callback);
  callback([...memoryEvents]);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Clears the lifecycle log history.
 */
export function clearLifecycleEvents(): void {
  memoryEvents = [];
  try {
    localStorage.removeItem(LIFECYCLE_STORAGE_KEY);
  } catch {}
  notifySubscribers();
}

export interface DiscrepancyBreakdown {
  totalInState: number;
  totalCardsDisplayed: number;
  difference: number;
  isDiscrepancyPresent: boolean;
  isRawFilesView: boolean;
  isQuotaMonitorView: boolean;
  hasSearchFilter: boolean;
  hasTagFilter: boolean;
  hasCategoryFilter: boolean;
  categoryFilterName?: string;
  categoryFilteredOutCount: number;
  favoritesFilteredOutCount: number;
  tagFilteredOutCount: number;
  searchFilteredOutCount: number;
  invalidTypeCount: number;
  invalidTypeItems: { id: string; title: string; type: any }[];
  primaryExplanation: string;
  remedyActionLabel?: string;
}

/**
 * Analyzes mathematical discrepancies between state resource count (`resources.length`)
 * and the actual rendered cards (`filteredResources.length`).
 */
export function analyzeResourceDiscrepancy(
  resources: ResourceItem[],
  filteredResources: ResourceItem[],
  currentCategory: NavCategory,
  selectedTag: string | null,
  searchQuery: string
): DiscrepancyBreakdown {
  const totalInState = resources.length;
  const totalCardsDisplayed = filteredResources.length;
  const difference = totalInState - totalCardsDisplayed;

  const isRawFilesView = currentCategory === "raw_files";
  const isQuotaMonitorView = currentCategory === "quota_monitor";
  const isFavoritesView = currentCategory === "favorites";
  const isMediaFilesView = currentCategory === "media_files";
  const hasSearchFilter = searchQuery.trim().length > 0;
  const hasTagFilter = !!selectedTag;
  const hasCategoryFilter = 
    currentCategory !== "all" && 
    currentCategory !== "raw_files" && 
    currentCategory !== "quota_monitor" && 
    currentCategory !== "favorites" &&
    currentCategory !== "media_files";

  let categoryFilteredOutCount = 0;
  let favoritesFilteredOutCount = 0;
  let tagFilteredOutCount = 0;
  let searchFilteredOutCount = 0;
  const invalidTypeItems: { id: string; title: string; type: any }[] = [];

  const standardTypes = new Set([
    "article", "github_repo", "mcp_server", "ai_skill", 
    "knowledge", "link", "troubleshooting", "paper", "rss", "note"
  ]);

  resources.forEach((r) => {
    if (!r.type || !standardTypes.has(r.type)) {
      invalidTypeItems.push({ id: r.id, title: r.title, type: r.type });
    }

    if (isFavoritesView && !r.isFavorite) {
      favoritesFilteredOutCount++;
    } else if (hasCategoryFilter && r.type !== currentCategory) {
      categoryFilteredOutCount++;
    }

    if (selectedTag) {
      const itemTags = (r.tags || []).map((t) => t.toLowerCase());
      if (!itemTags.includes(selectedTag.toLowerCase())) {
        tagFilteredOutCount++;
      }
    }
  });

  // Calculate search exclusions based on items that passed category/tag filters
  searchFilteredOutCount = Math.max(0, difference - categoryFilteredOutCount - favoritesFilteredOutCount);

  let primaryExplanation = "";
  let remedyActionLabel: string | undefined = undefined;

  if (isRawFilesView) {
    primaryExplanation = `Sei nella schermata "Buffer File Grezzi". Le ${totalInState} risorse schedate nel Vault non vengono mostrate in questa vista perché stai gestendo i file sorgente in attesa di elaborazione.`;
    remedyActionLabel = "Passa a Tutte le Risorse";
  } else if (isQuotaMonitorView) {
    primaryExplanation = `Sei nel pannello di Monitoraggio Telemetria Quota Firestore. La griglia delle risorse è nascosta.`;
    remedyActionLabel = "Torna al Vault";
  } else if (isFavoritesView) {
    primaryExplanation = `Stai visualizzando solo i Preferiti. ${favoritesFilteredOutCount} risorse non contrassegnate come preferite sono nascoste.`;
    remedyActionLabel = "Azzera Filtro Preferiti";
  } else if (isMediaFilesView) {
    primaryExplanation = `Stai visualizzando solo la raccolta Documenti & Immagini (scansioni, schemi didattici, timeline e screenshot).`;
    remedyActionLabel = "Mostra Tutte le Risorse";
  } else if (hasCategoryFilter) {
    primaryExplanation = `Stai visualizzando solo la categoria "${currentCategory}". ${categoryFilteredOutCount} risorse di altri tipi sono nascoste dal filtro di categoria attivo.`;
    remedyActionLabel = "Mostra Tutte le Risorse";
  } else if (hasTagFilter && hasSearchFilter) {
    primaryExplanation = `Filtri multipli attivi: tag "#${selectedTag}" e ricerca "${searchQuery}". ${difference} risorse sono escluse dai criteri di ricerca.`;
    remedyActionLabel = "Azzera Ricerca e Tag";
  } else if (hasTagFilter) {
    primaryExplanation = `Filtro per tag "#${selectedTag}" attivo. ${difference} risorse non contengono questo tag.`;
    remedyActionLabel = "Rimuovi Tag Selezionato";
  } else if (hasSearchFilter) {
    primaryExplanation = `Ricerca per "${searchQuery}" attiva. ${difference} risorse non corrispondono alla query.`;
    remedyActionLabel = "Cancella Testo di Ricerca";
  } else if (invalidTypeItems.length > 0) {
    primaryExplanation = `Rilevate ${invalidTypeItems.length} risorse con tipo non standard che potrebbero non visualizzarsi in tutte le viste.`;
    remedyActionLabel = "Ripara Tipi Risorse";
  } else if (difference === 0) {
    primaryExplanation = `Perfetto allineamento: tutte le ${totalInState} risorse protette sono visualizzate a schermo.`;
  } else {
    primaryExplanation = `Visualizzate ${totalCardsDisplayed} card su ${totalInState} nello stato (${difference} non visibili per filtri attivi).`;
    remedyActionLabel = "Azzera Tutti i Filtri";
  }

  return {
    totalInState,
    totalCardsDisplayed,
    difference,
    isDiscrepancyPresent: difference !== 0 || isRawFilesView || isQuotaMonitorView,
    isRawFilesView,
    isQuotaMonitorView,
    hasSearchFilter,
    hasTagFilter,
    hasCategoryFilter,
    categoryFilterName: hasCategoryFilter ? currentCategory : undefined,
    categoryFilteredOutCount,
    favoritesFilteredOutCount,
    tagFilteredOutCount,
    searchFilteredOutCount,
    invalidTypeCount: invalidTypeItems.length,
    invalidTypeItems,
    primaryExplanation,
    remedyActionLabel,
  };
}
