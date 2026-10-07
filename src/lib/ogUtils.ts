export interface OpenGraphResult {
  url: string;
  domain: string;
  siteName?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  favicon?: string;
  author?: string;
}

// In-memory cache for Open Graph metadata to avoid redundant network queries
const ogCache = new Map<string, OpenGraphResult>();
const inFlightPromises = new Map<string, Promise<OpenGraphResult | null>>();

export async function fetchOpenGraphData(url: string): Promise<OpenGraphResult | null> {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (ogCache.has(trimmed)) {
    return ogCache.get(trimmed)!;
  }
  if (inFlightPromises.has(trimmed)) {
    return inFlightPromises.get(trimmed)!;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(`/api/fetch-opengraph?url=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && json.metadata) {
          ogCache.set(trimmed, json.metadata);
          return json.metadata as OpenGraphResult;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch Open Graph metadata:", err);
    } finally {
      inFlightPromises.delete(trimmed);
    }

    // Graceful fallback from client side
    try {
      const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const domain = parsed.hostname.replace(/^www\./, "");
      const fallback: OpenGraphResult = {
        url: trimmed,
        domain,
        siteName: domain,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      };
      ogCache.set(trimmed, fallback);
      return fallback;
    } catch {
      return null;
    }
  })();

  inFlightPromises.set(trimmed, fetchPromise);
  return fetchPromise;
}
