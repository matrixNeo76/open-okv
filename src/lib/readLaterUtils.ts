import { ResourceItem, ReadLaterPriority, ReadLaterSortOption } from "../types";

export const READ_LATER_TAGS = [
  "read-later",
  "read_later",
  "readlater",
  "da-leggere",
  "reading-list",
  "coda-lettura",
  "queue",
  "later",
  "studiare",
  "to-read",
];

/**
 * Determines whether a resource is designated as a Read-It-Later queue item.
 * Evaluates both the explicit metadata flag and future reading tags.
 */
export function isReadLaterResource(resource: ResourceItem | null | undefined): boolean {
  if (!resource) return false;

  // 1. Explicit metadata boolean
  if (resource.metadata?.readLater === true) {
    return true;
  }

  // If explicit false was specified, honor removal from read later
  if (resource.metadata?.readLater === false) {
    return false;
  }

  // 2. Tag matching
  if (Array.isArray(resource.tags) && resource.tags.length > 0) {
    const lowerTags = resource.tags.map((t) => t.toLowerCase().trim());
    return lowerTags.some((tag) => READ_LATER_TAGS.includes(tag));
  }

  return false;
}

/**
 * Returns the reading priority: 'high' | 'medium' | 'low'
 */
export function getReadLaterPriority(resource: ResourceItem): ReadLaterPriority {
  if (resource.metadata?.readLaterPriority) {
    return resource.metadata.readLaterPriority;
  }

  // Check tag heuristic
  if (Array.isArray(resource.tags)) {
    const lowerTags = resource.tags.map((t) => t.toLowerCase().trim());
    if (lowerTags.some((t) => ["alta-priorita", "high-priority", "must-read", "urgente", "urgent", "top-priority"].includes(t))) {
      return "high";
    }
    if (lowerTags.some((t) => ["bassa-priorita", "low-priority", "backlog", "someday"].includes(t))) {
      return "low";
    }
  }

  return "medium";
}

/**
 * Returns reading status: 'unread' | 'in_progress' | 'completed'
 */
export function getReadingStatus(resource: ResourceItem): "unread" | "in_progress" | "completed" {
  if (resource.metadata?.readingStatus) {
    return resource.metadata.readingStatus;
  }
  const progress = Number(resource.metadata?.readingProgress ?? 0);
  if (progress >= 100) return "completed";
  if (progress > 0) return "in_progress";
  return "unread";
}

/**
 * Calculates estimated reading time in minutes based on metadata or content length
 */
export function estimateReadingTimeMin(resource: ResourceItem): number {
  if (resource.metadata?.readingTimeMin) {
    const parsed = Number(resource.metadata.readingTimeMin);
    if (!isNaN(parsed) && parsed > 0) return Math.round(parsed);
  }

  // Estimate from text length (~200 words / ~1000 characters per minute)
  const summaryChars = (resource.summary || "").length;
  const mdChars = (resource.metadata?.markdownContent || "").length;
  const rawChars = (resource.rawInput || "").length;
  const totalChars = summaryChars + mdChars + (rawChars > 200 ? 200 : rawChars);

  if (totalChars === 0) return 3; // default 3 min
  const estimated = Math.ceil(totalChars / 950);
  return Math.max(1, Math.min(180, estimated));
}

/**
 * Formats reading time into a clean human label (e.g. "4 min", "1h 15 min")
 */
export function formatReadingTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

/**
 * Calculates a composite priority score to prioritize items in the queue
 */
export function calculateQueuePriorityScore(resource: ResourceItem): number {
  let score = 0;

  // 1. Base Priority
  const priority = getReadLaterPriority(resource);
  if (priority === "high") score += 300;
  else if (priority === "medium") score += 200;
  else score += 100;

  // 2. Status modifier
  const status = getReadingStatus(resource);
  if (status === "in_progress") score += 120; // boost started readings
  else if (status === "unread") score += 60;
  else if (status === "completed") score -= 500; // push completed down

  // 3. Quick wins: items with short reading time get a small bonus for momentum
  const time = estimateReadingTimeMin(resource);
  if (time <= 5) score += 35;
  else if (time <= 10) score += 20;

  // 4. Favorites bonus
  if (resource.isFavorite) score += 25;

  // 5. Recent queue addition bonus
  if (resource.metadata?.readLaterAddedAt) {
    const addedTime = new Date(resource.metadata.readLaterAddedAt).getTime();
    if (!isNaN(addedTime)) {
      const hoursAgo = (Date.now() - addedTime) / (1000 * 60 * 60);
      if (hoursAgo < 48) score += 20; // recently queued
    }
  }

  return score;
}

/**
 * Sorts resources within the Read-It-Later queue
 */
export function sortReadLaterQueue(
  items: ResourceItem[],
  sortBy: ReadLaterSortOption = "priority_recommended"
): ResourceItem[] {
  const list = [...items];

  return list.sort((a, b) => {
    // Completed items are always placed at the bottom regardless of sort option
    const statusA = getReadingStatus(a);
    const statusB = getReadingStatus(b);
    if (statusA === "completed" && statusB !== "completed") return 1;
    if (statusA !== "completed" && statusB === "completed") return -1;

    switch (sortBy) {
      case "priority_recommended": {
        const scoreA = calculateQueuePriorityScore(a);
        const scoreB = calculateQueuePriorityScore(b);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (estimateReadingTimeMin(a) - estimateReadingTimeMin(b));
      }
      case "added_desc": {
        const timeA = a.metadata?.readLaterAddedAt
          ? new Date(a.metadata.readLaterAddedAt).getTime()
          : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.metadata?.readLaterAddedAt
          ? new Date(b.metadata.readLaterAddedAt).getTime()
          : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      }
      case "added_asc": {
        const timeA = a.metadata?.readLaterAddedAt
          ? new Date(a.metadata.readLaterAddedAt).getTime()
          : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.metadata?.readLaterAddedAt
          ? new Date(b.metadata.readLaterAddedAt).getTime()
          : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeA - timeB;
      }
      case "reading_time_asc": {
        return estimateReadingTimeMin(a) - estimateReadingTimeMin(b);
      }
      case "reading_time_desc": {
        return estimateReadingTimeMin(b) - estimateReadingTimeMin(a);
      }
      case "progress_desc": {
        const progA = Number(a.metadata?.readingProgress ?? 0);
        const progB = Number(b.metadata?.readingProgress ?? 0);
        return progB - progA;
      }
      default:
        return 0;
    }
  });
}

/**
 * Creates updated partial resource for toggling Read-It-Later status.
 * Properly manages both the explicit metadata flag and tags.
 */
export function toggleReadLaterStatus(resource: ResourceItem, inQueue: boolean): Partial<ResourceItem> {
  const currentTags = Array.isArray(resource.tags) ? [...resource.tags] : [];
  let updatedTags = [...currentTags];

  if (inQueue) {
    if (!updatedTags.some((t) => READ_LATER_TAGS.includes(t.toLowerCase().trim()))) {
      updatedTags.push("read-later");
    }
    return {
      tags: updatedTags,
      metadata: {
        ...resource.metadata,
        readLater: true,
        readLaterAddedAt: resource.metadata?.readLaterAddedAt || new Date().toISOString(),
        readingStatus: resource.metadata?.readingStatus || "unread",
      },
    };
  } else {
    updatedTags = updatedTags.filter((t) => !READ_LATER_TAGS.includes(t.toLowerCase().trim()));
    return {
      tags: updatedTags,
      metadata: {
        ...resource.metadata,
        readLater: false,
      },
    };
  }
}

/**
 * Updates reading priority for a Read-It-Later item.
 */
export function setReadLaterPriority(resource: ResourceItem, priority: ReadLaterPriority): Partial<ResourceItem> {
  return {
    metadata: {
      ...resource.metadata,
      readLaterPriority: priority,
    },
  };
}

/**
 * Updates personal notes for a Read-It-Later item.
 */
export function setReadLaterNotes(resource: ResourceItem, notes: string): Partial<ResourceItem> {
  return {
    metadata: {
      ...resource.metadata,
      readLaterNotes: notes,
    },
  };
}

/**
 * Updates target reading date for a Read-It-Later item.
 */
export function setReadLaterTargetDate(resource: ResourceItem, targetDate: string | undefined): Partial<ResourceItem> {
  return {
    metadata: {
      ...resource.metadata,
      targetReadDate: targetDate,
    },
  };
}

