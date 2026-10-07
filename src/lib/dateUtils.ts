/**
 * Date and Timestamp Utilities for Knowledge Vault
 * Safely handles Firestore Timestamps, FieldValues, ISO strings, Epoch milliseconds,
 * and serialized { seconds, nanoseconds } objects.
 */

export function parseDate(ts: any): Date | null {
  if (!ts) return null;

  // 1. JS Date instance
  if (ts instanceof Date) {
    return isNaN(ts.getTime()) ? null : ts;
  }

  // 2. Firestore Timestamp instance with .toDate()
  if (typeof ts.toDate === "function") {
    try {
      const d = ts.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {
      // ignore
    }
  }

  // 3. Object with .toMillis()
  if (typeof ts.toMillis === "function") {
    try {
      const ms = ts.toMillis();
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    } catch {
      // ignore
    }
  }

  // 4. Serialized Firestore Timestamp object { seconds, nanoseconds } or { _seconds, _nanoseconds }
  if (typeof ts === "object") {
    const secs =
      typeof ts.seconds === "number"
        ? ts.seconds
        : typeof ts._seconds === "number"
        ? ts._seconds
        : null;
    const nanos =
      typeof ts.nanoseconds === "number"
        ? ts.nanoseconds
        : typeof ts._nanoseconds === "number"
        ? ts._nanoseconds
        : 0;

    if (secs !== null && !isNaN(secs)) {
      const ms = secs * 1000 + Math.floor(nanos / 1000000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }

    // Pending serverTimestamp Sentinel
    if (ts._methodName || ts._delegate) {
      return new Date();
    }
  }

  // 5. Number timestamp (ms or seconds)
  if (typeof ts === "number" && !isNaN(ts)) {
    // If timestamp is in seconds (e.g. 1724949123 instead of 1724949123000)
    const ms = ts < 1e11 ? ts * 1000 : ts;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // 6. String
  if (typeof ts === "string") {
    const trimmed = ts.trim();
    if (!trimmed || trimmed.toLowerCase() === "invalid date" || trimmed === "null" || trimmed === "undefined") {
      return null;
    }

    // Pure numeric string
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      const ms = num < 1e11 ? num * 1000 : num;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Returns epoch milliseconds for safe sorting and comparison.
 */
export function getTimestampMillis(ts: any, fallbackMs: number = 0): number {
  const d = parseDate(ts);
  return d ? d.getTime() : fallbackMs;
}

/**
 * Formats any timestamp into a clean Italian localized date string.
 * Never outputs "Invalid Date".
 */
export function formatDate(
  ts: any,
  mode: "short" | "full" | "time" | "relative" = "short"
): string {
  const date = parseDate(ts);
  if (!date) {
    // Return empty string or fallback today
    return "";
  }

  try {
    if (mode === "full") {
      return date.toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    if (mode === "time") {
      return date.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    if (mode === "relative") {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 60) return "Poco fa";
      if (diffMins < 60) return `${diffMins} min fa`;
      if (diffHours < 24) return `${diffHours} ore fa`;
      if (diffDays === 1) return "Ieri";
      if (diffDays < 7) return `${diffDays} giorni fa`;
    }

    // Default: "short" mode (e.g. "29 ago 2026")
    return date.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
