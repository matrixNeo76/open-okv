import { sanitizeUrl } from "./openGraphService";

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  pubDate?: string;
  relativeTime?: string;
  author?: string;
  summary: string;
  content?: string;
  categories: string[];
  pdfUrl?: string;
}

export interface FeedData {
  title: string;
  description: string;
  feedUrl: string;
  siteUrl?: string;
  format: "rss" | "atom";
  lastUpdated?: string;
  items: FeedItem[];
}

// In-memory cache for feeds with 5-minute TTL
interface CacheEntry {
  timestamp: number;
  data: FeedData;
}
const feedCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cleanCdataAndEntities(val: string): string {
  if (!val) return "";
  let text = val;
  // Unwrap CDATA blocks
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
  // Decode common XML/HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
  return text.trim();
}

function stripHtml(val: string): string {
  if (!val) return "";
  return cleanCdataAndEntities(val).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatRelativeTime(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 0) return "Poco fa";
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 2) return "Poco fa";
    if (diffMin < 60) return `${diffMin}m fa`;
    if (diffHours < 24) return `${diffHours}h fa`;
    if (diffDays === 1) return "Ieri";
    if (diffDays < 7) return `${diffDays}gg fa`;
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export async function discoverRssFeedUrl(inputUrl: string): Promise<string | null> {
  const target = sanitizeUrl(inputUrl);
  if (!target) return null;

  // If already ends in /rss, .xml, /feed or contains /rss/, it is already a feed
  if (target.includes("/rss") || target.endsWith(".xml") || target.includes("/feed")) {
    return target;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(target, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KnowledgeVaultFeedBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    // Check for <link rel="alternate" type="application/rss+xml" href="...">
    const linkMatch = html.match(/<link[^>]+type=["']application\/(?:rss\+xml|atom\+xml)["'][^>]*>/i);
    if (linkMatch) {
      const hrefMatch = linkMatch[0].match(/href=["']([^"']+)["']/i);
      if (hrefMatch && hrefMatch[1]) {
        try {
          return new URL(hrefMatch[1], target).href;
        } catch {
          return hrefMatch[1];
        }
      }
    }

    // Common standard fallbacks
    const commonPaths = ["/rss", "/feed", "/rss.xml", "/feed.xml", "/atom.xml"];
    for (const p of commonPaths) {
      try {
        const candidate = new URL(p, target).href;
        const checkRes = await fetch(candidate, { method: "HEAD", signal: AbortSignal.timeout(2000) });
        if (checkRes.ok && (checkRes.headers.get("content-type")?.includes("xml") || checkRes.headers.get("content-type")?.includes("rss"))) {
          return candidate;
        }
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchFeedData(rawFeedUrl: string, limit = 40): Promise<FeedData> {
  const targetUrl = sanitizeUrl(rawFeedUrl);
  if (!targetUrl) {
    throw new Error("URL del feed non specificato o non valido.");
  }

  // Check cache
  const cached = feedCache.get(targetUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (Knowledge Vault RSS Reader)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
      },
    });
  } catch (netErr: any) {
    clearTimeout(timeout);
    throw new Error(`Impossibile contattare l'host del feed (${netErr?.message || "timeout rete"}).`);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Errore HTTP ${response.status} durante il recupero del feed (${response.statusText}).`);
  }

  const rawXml = await response.text();
  if (!rawXml || rawXml.trim().length === 0) {
    throw new Error("Il server remoto ha restituito una risposta vuota.");
  }

  // Check if server returned an HTML page that points to a feed
  const isXml = rawXml.includes("<rss") || rawXml.includes("<channel") || rawXml.includes("<feed") || rawXml.includes("<rdf:RDF");
  if (!isXml) {
    const discovered = await discoverRssFeedUrl(targetUrl);
    if (discovered && discovered !== targetUrl) {
      return fetchFeedData(discovered, limit);
    }
    throw new Error("Il link fornito non sembra un feed RSS o Atom valido (formato XML non rilevato).");
  }

  const isAtom = rawXml.includes("<feed") && !rawXml.includes("<rss");
  let feedTitle = "";
  let feedDescription = "";
  let siteUrl = "";
  let lastUpdated = "";

  if (isAtom) {
    const titleMatch = rawXml.match(/<feed[\s\S]*?<title(?:[^>]*)>([\s\S]*?)<\/title>/i);
    feedTitle = titleMatch ? stripHtml(titleMatch[1]) : "Feed Atom";

    const descMatch = rawXml.match(/<subtitle(?:[^>]*)>([\s\S]*?)<\/subtitle>/i);
    feedDescription = descMatch ? stripHtml(descMatch[1]) : "";

    const linkMatch = rawXml.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i) ||
                      rawXml.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/>/i);
    siteUrl = linkMatch ? linkMatch[1] : "";

    const updatedMatch = rawXml.match(/<updated>([\s\S]*?)<\/updated>/i);
    lastUpdated = updatedMatch ? cleanCdataAndEntities(updatedMatch[1]) : "";
  } else {
    // RSS 2.0 or RSS 1.0 / RDF
    const channelMatch = rawXml.match(/<channel[\s\S]*?>([\s\S]*?)<\/channel>/i);
    const headerSection = channelMatch ? channelMatch[1].slice(0, 1500) : rawXml.slice(0, 1500);

    const titleMatch = headerSection.match(/<title(?:[^>]*)>([\s\S]*?)<\/title>/i);
    feedTitle = titleMatch ? stripHtml(titleMatch[1]) : "Feed RSS";

    const descMatch = headerSection.match(/<description(?:[^>]*)>([\s\S]*?)<\/description>/i);
    feedDescription = descMatch ? stripHtml(descMatch[1]) : "";

    const linkMatch = headerSection.match(/<link(?:[^>]*)>([\s\S]*?)<\/link>/i);
    siteUrl = linkMatch ? cleanCdataAndEntities(linkMatch[1]).replace(/<[^>]+>/g, "").trim() : "";

    const dateMatch = headerSection.match(/<(?:lastBuildDate|pubDate)>([\s\S]*?)<\/(?:lastBuildDate|pubDate)>/i);
    lastUpdated = dateMatch ? cleanCdataAndEntities(dateMatch[1]) : "";
  }

  // Fallback domain name for feedTitle if generic
  if (!feedTitle || feedTitle.toLowerCase() === "feed" || feedTitle.length < 3) {
    try {
      feedTitle = `Feed RSS: ${new URL(targetUrl).hostname.replace(/^www\./, "")}`;
    } catch {
      feedTitle = "Feed RSS";
    }
  }

  // Extract individual items
  const items: FeedItem[] = [];
  const itemRegex = isAtom ? /<entry[\s\S]*?<\/entry>/gi : /<item[\s\S]*?<\/item>/gi;
  const matches = rawXml.match(itemRegex) || [];

  for (let i = 0; i < Math.min(matches.length, limit); i++) {
    const block = matches[i];

    // Title
    const titleMatch = block.match(/<title(?:[^>]*)>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : "Elemento senza titolo";

    // Link
    let link = "";
    if (isAtom) {
      const atomLink = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/>/i) ||
                       block.match(/<link[^>]+href=["']([^"']+)["']/i);
      link = atomLink ? atomLink[1].trim() : "";
    } else {
      const rssLink = block.match(/<link(?:[^>]*)>([\s\S]*?)<\/link>/i);
      link = rssLink ? cleanCdataAndEntities(rssLink[1]).replace(/<[^>]+>/g, "").trim() : "";
    }

    // ID / GUID
    const guidMatch = block.match(/<guid(?:[^>]*)>([\s\S]*?)<\/guid>/i) ||
                      block.match(/<id(?:[^>]*)>([\s\S]*?)<\/id>/i);
    const id = guidMatch ? cleanCdataAndEntities(guidMatch[1]).replace(/<[^>]+>/g, "").trim() : (link || `feed-item-${i}-${Date.now()}`);

    // Pub Date
    const pubDateMatch = block.match(/<(?:pubDate|published|updated)>([\s\S]*?)<\/(?:pubDate|published|updated)>/i) ||
                         block.match(/<dc:date>([\s\S]*?)<\/dc:date>/i);
    const pubDate = pubDateMatch ? cleanCdataAndEntities(pubDateMatch[1]).trim() : undefined;
    const relativeTime = formatRelativeTime(pubDate);

    // Author
    const authorMatch = block.match(/<dc:creator(?:[^>]*)>([\s\S]*?)<\/dc:creator>/i) ||
                        block.match(/<author>[\s\S]*?<name(?:[^>]*)>([\s\S]*?)<\/name>/i) ||
                        block.match(/<author(?:[^>]*)>([\s\S]*?)<\/author>/i);
    const author = authorMatch ? stripHtml(authorMatch[1]) : undefined;

    // Content & Summary
    const contentMatch = block.match(/<content:encoded(?:[^>]*)>([\s\S]*?)<\/content:encoded>/i) ||
                         block.match(/<content(?:[^>]*)>([\s\S]*?)<\/content>/i);
    const descMatch = block.match(/<description(?:[^>]*)>([\s\S]*?)<\/description>/i) ||
                      block.match(/<summary(?:[^>]*)>([\s\S]*?)<\/summary>/i);

    const fullContentRaw = contentMatch ? cleanCdataAndEntities(contentMatch[1]) : (descMatch ? cleanCdataAndEntities(descMatch[1]) : "");
    const cleanSummary = stripHtml(descMatch ? descMatch[1] : fullContentRaw);

    // Categories / Tags
    const categories: string[] = [];
    const catMatches = block.match(/<category(?:[^>]*)>([\s\S]*?)<\/category>/gi) ||
                       block.match(/<category[^>]+term=["']([^"']+)["']/gi) || [];
    for (const cm of catMatches) {
      const termMatch = cm.match(/term=["']([^"']+)["']/i);
      const textMatch = cm.match(/<category(?:[^>]*)>([\s\S]*?)<\/category>/i);
      const catVal = termMatch ? termMatch[1] : (textMatch ? stripHtml(textMatch[1]) : "");
      if (catVal && !categories.includes(catVal)) {
        categories.push(catVal);
      }
    }

    // Specialized arXiv PDF detection
    let pdfUrl: string | undefined = undefined;
    const arxivIdMatch = link.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i) ||
                         title.match(/arXiv:([0-9]+\.[0-9]+(?:v[0-9]+)?)/i) ||
                         cleanSummary.match(/arXiv:([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
    if (arxivIdMatch) {
      pdfUrl = `https://arxiv.org/pdf/${arxivIdMatch[1]}.pdf`;
    }

    items.push({
      id,
      title,
      link: link || targetUrl,
      pubDate,
      relativeTime,
      author,
      summary: cleanSummary,
      content: fullContentRaw,
      categories: categories.slice(0, 6),
      pdfUrl,
    });
  }

  const result: FeedData = {
    title: feedTitle,
    description: feedDescription,
    feedUrl: targetUrl,
    siteUrl: siteUrl || undefined,
    format: isAtom ? "atom" : "rss",
    lastUpdated: lastUpdated || undefined,
    items,
  };

  feedCache.set(targetUrl, { timestamp: Date.now(), data: result });
  return result;
}
