export interface OpenGraphData {
  url: string;
  domain: string;
  siteName?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  favicon?: string;
  author?: string;
}

// Clean URLs that have been duplicated or concatenated without space
export function sanitizeUrl(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  // Match first valid URL if multiple are glued together like https://...https://...
  const doubleMatch = trimmed.match(/(https?:\/\/[^\s]+?)(?=https?:\/\/|$)/i);
  let clean = doubleMatch ? doubleMatch[1] : trimmed;
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = `https://${clean}`;
  }
  return clean;
}

// Check if a title is a generic site name, error message, or bot shield
export function isGenericTitle(title?: string, domain?: string): boolean {
  if (!title) return true;
  const clean = title.trim().toLowerCase();
  if (clean.length < 2) return true;

  const genericBlacklist = [
    "medium",
    "attention required! | cloudflare",
    "attention required",
    "cloudflare",
    "just a moment...",
    "just a moment",
    "404 not found",
    "404",
    "not found",
    "403 forbidden",
    "forbidden",
    "access denied",
    "robot or human?",
    "are you a human?",
    "verify you are human",
    "security check",
    "web",
    "untitled",
    "home",
    "homepage",
    "login",
    "sign in",
    "sign up",
    "error",
    "pagina non trovata",
    "nuova risorsa",
    "collegamento web",
  ];

  if (genericBlacklist.includes(clean)) return true;
  if (clean.includes("cloudflare") && clean.includes("attention")) return true;
  if (domain) {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, "");
    if (clean === cleanDomain || clean === cleanDomain.split(".")[0]) return true;
  }
  return false;
}

// Extract a human-readable title from URL slug as a fallback
export function extractTitleFromUrlSlug(rawUrl: string): string {
  try {
    const sanitized = sanitizeUrl(rawUrl);
    const parsed = new URL(sanitized);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "";

    // Find the longest segment or segment with hyphens
    let candidate = "";
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg.includes("-") && seg.length > 5) {
        candidate = seg;
        break;
      }
    }
    if (!candidate) {
      candidate = segments[segments.length - 1];
    }

    // Strip trailing hash/hex/numeric ID suffixes like "-c455f11f2ef3", "-7c23236b74e9", "-12345"
    candidate = candidate
      .replace(/-[a-f0-9]{8,}$/i, "")
      .replace(/-[0-9]{5,}$/i, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/^[\-_]+|[\-_]+$/g, "");

    if (!candidate || candidate.length < 3) return "";

    // Convert kebab or snake case into capitalized words
    const words = candidate.split(/[-_]+/).filter(Boolean);
    const acronyms = new Set(["ai", "os", "llm", "mcp", "api", "ui", "ux", "sdk", "cli", "css", "html", "js", "ts", "dhh", "cpu", "gpu"]);
    
    return words
      .map((w) => {
        const lower = w.toLowerCase();
        if (acronyms.has(lower)) return lower.toUpperCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");
  } catch {
    return "";
  }
}

// Extract Open Graph tags, meta description and favicon from raw HTML
export function extractOpenGraphFromHtml(html: string, targetUrl: string): OpenGraphData {
  const cleanUrl = sanitizeUrl(targetUrl);
  let domain = "";
  let origin = "";
  try {
    const parsed = new URL(cleanUrl);
    domain = parsed.hostname.replace(/^www\./, "");
    origin = parsed.origin;
  } catch {
    domain = "web";
  }

  // Fallback Google Favicon Service
  let favicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined;

  let ogTitle = "";
  let ogDescription = "";
  let ogImage = "";
  let siteName = "";
  let author = "";

  const decodeEntities = (str: string) => {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Helper regex matcher for meta tags
  const getMeta = (propName: string) => {
    const regex = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${propName}["'][^>]*content=["']([^"']+)["']`, "i");
    const match = html.match(regex);
    if (match && match[1]) return decodeEntities(match[1]);
    
    const regexRev = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${propName}["']`, "i");
    const matchRev = html.match(regexRev);
    return matchRev && matchRev[1] ? decodeEntities(matchRev[1]) : "";
  };

  ogTitle = getMeta("og:title") || getMeta("twitter:title");
  if (!ogTitle) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) ogTitle = decodeEntities(titleMatch[1]);
  }

  ogDescription = getMeta("og:description") || getMeta("twitter:description") || getMeta("description");
  ogImage = getMeta("og:image") || getMeta("twitter:image") || getMeta("twitter:image:src");
  siteName = getMeta("og:site_name") || getMeta("application-name");
  author = getMeta("author") || getMeta("article:author") || getMeta("twitter:creator");

  // Check Apollo State (Medium, GitConnected, Substack, etc.)
  const apolloMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (apolloMatch && apolloMatch[1]) {
    try {
      const apolloData = JSON.parse(apolloMatch[1]);
      for (const [key, val] of Object.entries(apolloData)) {
        if (val && typeof val === "object") {
          const item = val as Record<string, any>;
          if (item.__typename === "Post" && item.title) {
            ogTitle = item.title;
            if (!ogDescription) {
              ogDescription = item.subtitle || item.previewContent?.subtitle || item.metaDescription || "";
            }
          }
          if (item.__typename === "User" && item.name && !author) {
            author = item.name;
          }
        }
      }
    } catch {}
  }

  // Check JSON-LD
  const ldJsonMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of ldJsonMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
      if (candidate?.headline && isGenericTitle(ogTitle, domain)) {
        ogTitle = candidate.headline;
      }
      if (!ogDescription && candidate?.description) {
        ogDescription = candidate.description;
      }
      if (!author && candidate?.author?.name) {
        author = candidate.author.name;
      }
    } catch {}
  }

  // Reject generic or bot-challenge titles and fall back to slug extraction
  if (isGenericTitle(ogTitle, domain)) {
    const slugTitle = extractTitleFromUrlSlug(cleanUrl);
    if (slugTitle) {
      ogTitle = slugTitle;
    }
  }

  // If ogImage is relative, resolve it
  if (ogImage && !ogImage.startsWith("http") && origin) {
    try {
      ogImage = new URL(ogImage, origin).toString();
    } catch {}
  }

  // Favicon extraction from link tags
  const iconMatch = html.match(/<link\s+[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i) ||
                    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i);
  if (iconMatch && iconMatch[1]) {
    let iconHref = iconMatch[1].trim();
    if (!iconHref.startsWith("http") && origin) {
      try {
        iconHref = new URL(iconHref, origin).toString();
      } catch {}
    }
    if (iconHref.startsWith("http")) {
      favicon = iconHref;
    }
  }

  // Specialized metadata enrichment for YouTube Videos
  const isYouTube = domain.includes("youtube.com") || domain.includes("youtu.be");
  if (isYouTube) {
    siteName = "YouTube";
    const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (ytMatch && ytMatch[1]) {
      const videoId = ytMatch[1];
      if (!ogImage || ogImage.includes("default.jpg")) {
        ogImage = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }
    if (ogTitle && ogTitle.endsWith(" - YouTube")) {
      ogTitle = ogTitle.replace(/ - YouTube$/, "");
    }
  }

  return {
    url: cleanUrl,
    domain,
    siteName: siteName || domain || "Web",
    ogTitle: ogTitle || undefined,
    ogDescription: ogDescription || undefined,
    ogImage: ogImage || undefined,
    favicon: favicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined),
    author: author || undefined,
  };
}

// Resilient server-side URL fetcher for Open Graph & full article extraction
export async function fetchArticleTextFromUrl(rawUrl: string, timeoutMs = 6000): Promise<{ title?: string; text: string; markdown: string }> {
  const targetUrl = sanitizeUrl(rawUrl);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { text: "", markdown: "" };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml") && !contentType.includes("text/plain")) {
      return { text: "", markdown: "" };
    }

    const rawHtml = await response.text();
    
    let domain = "";
    try {
      domain = new URL(targetUrl).hostname.replace(/^www\./, "");
    } catch {}

    // Special handler for RSS and Atom Feeds: parse recent articles/preprints
    const isRssFeed = rawHtml.includes("<rss") || rawHtml.includes("<channel") || rawHtml.includes("<feed") || targetUrl.includes("/rss") || targetUrl.endsWith(".xml");
    if (isRssFeed) {
      const channelTitleMatch = rawHtml.match(/<channel[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ||
                                rawHtml.match(/<feed[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ||
                                rawHtml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const feedTitle = channelTitleMatch ? channelTitleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "Feed RSS";

      const channelDescMatch = rawHtml.match(/<channel[\s\S]*?<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
                               rawHtml.match(/<feed[\s\S]*?<subtitle>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/subtitle>/i);
      const feedDesc = channelDescMatch ? channelDescMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
      
      const itemBlocks = rawHtml.match(/<item[\s\S]*?<\/item>/gi) || rawHtml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
      const parsedItems: string[] = [];

      for (const itemBlock of itemBlocks.slice(0, 12)) {
        const itemTitle = itemBlock.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const itemLink = itemBlock.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim() ||
                         itemBlock.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]?.trim();
        const itemDesc = itemBlock.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
                         itemBlock.match(/<summary>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const itemAuthor = itemBlock.match(/<dc:creator>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/dc:creator>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ||
                           itemBlock.match(/<author>[\s\S]*?<name>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/name>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();

        if (itemTitle) {
          let line = `### ${itemTitle}\n`;
          if (itemAuthor) line += `**Autori**: ${itemAuthor}\n`;
          if (itemLink) line += `**Link**: ${itemLink}\n`;
          if (itemDesc) line += `\n${itemDesc}\n`;
          parsedItems.push(line);
        }
      }

      if (parsedItems.length > 0) {
        const feedMarkdown = `# ${feedTitle}\n\n${feedDesc ? `> ${feedDesc}\n\n` : ""}**Sorgente**: ${targetUrl}\n\n## Ultimi Articoli e Preprint nel Feed:\n\n${parsedItems.join("\n---\n\n")}`;
        return {
          title: feedTitle,
          text: feedMarkdown,
          markdown: feedMarkdown,
        };
      }
    }

    // Extract title
    let title = "";
    const ogTitleMatch = rawHtml.match(/<meta[^>]+property=["'](?:og|twitter):title["'][^>]+content=["']([^"']+)["']/i) ||
                         rawHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:og|twitter):title["']/i) ||
                         rawHtml.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      title = ogTitleMatch[1].replace(/\s+/g, " ").trim();
    }
    if (isGenericTitle(title, domain)) {
      const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1] && !isGenericTitle(titleMatch[1], domain)) {
        title = titleMatch[1].replace(/\s+/g, " ").trim();
      } else {
        title = "";
      }
    }

    // Check for Medium / GitConnected Apollo State before stripping scripts
    let apolloParagraphs: string[] = [];
    const apolloMatch = rawHtml.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (apolloMatch && apolloMatch[1]) {
      try {
        const apolloData = JSON.parse(apolloMatch[1]);
        for (const [key, val] of Object.entries(apolloData)) {
          if (val && typeof val === "object") {
            const item = val as Record<string, any>;
            if (item.__typename === "Post" && item.title) {
              title = item.title;
            }
            if (item.__typename === "Paragraph" && typeof item.text === "string" && item.text.trim()) {
              apolloParagraphs.push(item.text.trim());
            }
          }
        }
      } catch {
        // Continue with HTML parsing
      }
    }

    // Check for application/ld+json articleBody or description
    let ldJsonText = "";
    const ldJsonMatches = [...rawHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of ldJsonMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
        if (candidate?.headline && isGenericTitle(title, domain)) {
          title = candidate.headline;
        }
        if (candidate?.articleBody && typeof candidate.articleBody === "string") {
          ldJsonText = candidate.articleBody;
          break;
        } else if (candidate?.description && typeof candidate.description === "string" && !ldJsonText) {
          ldJsonText = candidate.description;
        }
      } catch {
        // ignore JSON-LD parse errors
      }
    }

    // If title is still missing or generic, fall back to URL slug
    if (isGenericTitle(title, domain)) {
      const slugTitle = extractTitleFromUrlSlug(targetUrl);
      if (slugTitle) {
        title = slugTitle;
      }
    }

    // Isolate the main readable content
    let contentHtml = rawHtml;
    
    // Remove script, style, noscript, svg, nav, footer, header, form tags
    contentHtml = contentHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    contentHtml = contentHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
    contentHtml = contentHtml.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");
    contentHtml = contentHtml.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ");
    contentHtml = contentHtml.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ");
    contentHtml = contentHtml.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ");
    contentHtml = contentHtml.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ");
    contentHtml = contentHtml.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ");
    contentHtml = contentHtml.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, " ");

    // Look for <article>, <main>, or [role="main"] if present
    const articleMatch = contentHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = contentHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    
    let targetSection = articleMatch ? articleMatch[1] : (mainMatch ? mainMatch[1] : contentHtml);

    // Convert common HTML blocks to Markdown-like structure
    let formattedText = targetSection
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n")
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n")
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n")
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n> $1\n")
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<hr\s*[\/]?>/gi, "\n---\n")
      .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

    // Strip remaining HTML tags
    formattedText = formattedText.replace(/<[^>]+>/g, " ");

    // Decode HTML entities
    formattedText = formattedText
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\r\n/g, "\n");

    // Normalize spacing and consecutive blank lines
    formattedText = formattedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index, arr) => line.length > 0 || (index > 0 && arr[index - 1].length > 0))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Prefer structured Apollo paragraphs (Medium / GitConnected) or LD+JSON if richer than generic HTML
    if (apolloParagraphs.length > 0) {
      formattedText = apolloParagraphs.join("\n\n");
    } else if (ldJsonText && (formattedText.length < 300 || ldJsonText.length > formattedText.length)) {
      formattedText = ldJsonText;
    }

    return {
      title,
      text: formattedText,
      markdown: formattedText,
    };
  } catch (err: any) {
    return { text: "", markdown: "" };
  }
}

// Resilient server-side URL fetcher for Open Graph extraction
export async function fetchOpenGraphMetadata(rawUrl: string, timeoutMs = 4500): Promise<OpenGraphData> {
  const targetUrl = sanitizeUrl(rawUrl);

  let domain = "";
  try {
    const parsed = new URL(targetUrl);
    domain = parsed.hostname.replace(/^www\./, "");
  } catch {
    domain = "web";
  }

  const fallbackSlugTitle = extractTitleFromUrlSlug(targetUrl);

  const defaultResult: OpenGraphData = {
    url: targetUrl,
    domain,
    siteName: domain,
    ogTitle: fallbackSlugTitle || undefined,
    favicon: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return defaultResult;
    }

    const contentType = response.headers.get("content-type") || "";
    const isXmlOrRss = contentType.includes("xml") || contentType.includes("rss") || contentType.includes("atom") || targetUrl.includes("/rss") || targetUrl.endsWith(".xml");
    if (!contentType.includes("text/html") && !contentType.includes("xhtml") && !isXmlOrRss) {
      return defaultResult;
    }

    const buffer = await response.text();

    if (isXmlOrRss || buffer.includes("<rss") || buffer.includes("<channel") || buffer.includes("<feed")) {
      const channelTitleMatch = buffer.match(/<channel[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ||
                                buffer.match(/<feed[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ||
                                buffer.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const channelDescMatch = buffer.match(/<channel[\s\S]*?<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
                               buffer.match(/<feed[\s\S]*?<subtitle>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/subtitle>/i) ||
                               buffer.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

      const rawRssTitle = channelTitleMatch ? channelTitleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
      const rawRssDesc = channelDescMatch ? channelDescMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";

      if (rawRssTitle && !isGenericTitle(rawRssTitle, domain)) {
        return {
          url: targetUrl,
          domain,
          siteName: domain,
          ogTitle: rawRssTitle,
          ogDescription: rawRssDesc || defaultResult.ogDescription,
          favicon: defaultResult.favicon,
        };
      }
    }

    const htmlSlice = buffer.slice(0, 300000);
    return extractOpenGraphFromHtml(htmlSlice, targetUrl);
  } catch (err: any) {
    return defaultResult;
  }
}
