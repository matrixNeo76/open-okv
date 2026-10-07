import { ResourceItem, SuggestedTag, TagCategory } from "../types";

const CLIENT_STOP_WORDS = new Set([
  // Italian stop words
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "a", "da", "in", "con", "su", "per", "tra", "fra",
  "del", "dello", "della", "dei", "degli", "delle", "al", "allo", "alla", "ai", "agli", "alle",
  "dal", "dallo", "dalla", "dai", "dagli", "dalle", "nel", "nello", "nella", "nei", "negli", "nelle",
  "sul", "sullo", "sulla", "sui", "sugli", "sulle", "e", "ed", "o", "od", "ma", "perché", "come", "quando",
  "che", "chi", "cui", "quale", "quali", "questo", "questa", "questi", "queste", "quello", "quella", "quelli", "quelle",
  "anche", "pure", "inoltre", "dopo", "prima", "poi", "sempre", "mai", "non", "più", "molto", "poco", "tutto", "tutti",
  "essere", "avere", "fare", "dire", "andare", "potere", "volere", "dovere", "stato", "sono", "sei", "è", "siamo", "siete",
  "hanno", "ho", "hai", "ha", "abbiamo", "avete", "era", "erano", "sarà", "saranno", "fatto", "detto",
  "loro", "noi", "voi", "lui", "lei", "esso", "essa", "essi", "esse", "mio", "tuo", "suo", "nostro", "vostro",
  "cosa", "cose", "modo", "parte", "tempo", "anno", "giorno", "caso", "punto", "base", "livello", "tipo",

  // English stop words
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "it", "for", "not", "on", "with", "as",
  "you", "do", "at", "this", "but", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will",
  "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which",
  "go", "me", "when", "make", "can", "like", "time", "no", "just", "know", "take", "into", "year",
  "your", "good", "some", "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its",
  "over", "think", "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
  "new", "want", "because", "any", "these", "give", "day", "most", "us", "is", "are", "was", "were", "been", "has",
  "had", "having", "does", "did", "doing", "very", "much", "more", "such", "through", "during", "before", "between",
  "should", "might", "must", "each", "both", "few", "further", "once", "here", "why", "where", "while", "above", "below",
  "http", "https", "www", "com", "org", "net", "io", "html", "htm", "page", "site", "web"
]);

const CANONICAL_TECH_PATTERNS: Array<{ pattern: RegExp; tag: string; category: TagCategory; baseConfidence: number }> = [
  { pattern: /\b(model[\s-]context[\s-]protocol|mcp)\b/i, tag: "model-context-protocol", category: "framework", baseConfidence: 96 },
  { pattern: /\b(machine[\s-]learning|ml)\b/i, tag: "machine-learning", category: "technology", baseConfidence: 94 },
  { pattern: /\b(large[\s-]language[\s-]models?|llm)\b/i, tag: "llm", category: "technology", baseConfidence: 95 },
  { pattern: /\b(deep[\s-]learning)\b/i, tag: "deep-learning", category: "technology", baseConfidence: 92 },
  { pattern: /\b(rag|retrieval[\s-]augmented[\s-]generation)\b/i, tag: "rag", category: "concept", baseConfidence: 94 },
  { pattern: /\b(vector[\s-]database|embeddings?|pinecone|chroma|qdrant|milvus)\b/i, tag: "vector-database", category: "technology", baseConfidence: 93 },
  { pattern: /\b(open[\s-]knowledge[\s-]format|okf(\s*v?0\.2)?)\b/i, tag: "okf-v0.2", category: "methodology", baseConfidence: 98 },
  { pattern: /\b(knowledge[\s-]graph|grafo[\s-]conoscenza)\b/i, tag: "knowledge-graph", category: "concept", baseConfidence: 92 },
  { pattern: /\b(ontology|ontologia)\b/i, tag: "ontology", category: "concept", baseConfidence: 89 },
  { pattern: /\b(gemini|google[\s-]ai)\b/i, tag: "gemini", category: "technology", baseConfidence: 94 },
  { pattern: /\b(claude|anthropic)\b/i, tag: "anthropic", category: "technology", baseConfidence: 94 },
  { pattern: /\b(openai|chatgpt|gpt-?4)\b/i, tag: "openai", category: "technology", baseConfidence: 92 },
  { pattern: /\b(agentic|autonomous[\s-]agent|agenti[\s-]autonomi)\b/i, tag: "agentic-ai", category: "concept", baseConfidence: 93 },
  { pattern: /\b(typescript|ts)\b/i, tag: "typescript", category: "framework", baseConfidence: 95 },
  { pattern: /\b(react|react\.js)\b/i, tag: "react", category: "framework", baseConfidence: 92 },
  { pattern: /\b(node|node\.js|express)\b/i, tag: "node", category: "framework", baseConfidence: 90 },
  { pattern: /\b(python)\b/i, tag: "python", category: "framework", baseConfidence: 92 },
  { pattern: /\b(firestore|firebase)\b/i, tag: "firestore", category: "technology", baseConfidence: 91 },
  { pattern: /\b(cloud[\s-]run|gcp|google[\s-]cloud)\b/i, tag: "cloud-run", category: "technology", baseConfidence: 90 },
  { pattern: /\b(docker|containers?)\b/i, tag: "docker", category: "framework", baseConfidence: 88 },
  { pattern: /\b(smart[\s-]app[\s-]control|sac)\b/i, tag: "smart-app-control", category: "system", baseConfidence: 96 },
  { pattern: /\b(troubleshooting|diagnostica|risoluzione[\s-]problemi)\b/i, tag: "troubleshooting", category: "problem", baseConfidence: 92 },
  { pattern: /\b(root[\s-]cause|causa[\s-]scatenante)\b/i, tag: "root-cause", category: "problem", baseConfidence: 89 },
  { pattern: /\b(oauth2?|autenticazione|gsi|identity)\b/i, tag: "oauth2", category: "technology", baseConfidence: 90 },
  { pattern: /\b(d3|d3\.js|data[\s-]visualization)\b/i, tag: "d3-graph", category: "technology", baseConfidence: 91 },
  { pattern: /\b(rest[\s-]api|api[\s-]endpoint)\b/i, tag: "rest-api", category: "concept", baseConfidence: 86 },
];

export function cleanTag(raw: string): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Client-Side Instant Statistical Tag Suggester (TF-IDF + Entity + Vault Co-occurrence)
 */
export function generateClientSideSuggestedTags(params: {
  title: string;
  summary?: string;
  content?: string;
  type?: string;
  domain?: string;
  existingTags?: string[];
  vaultTags?: string[];
  entities?: Array<string | { name: string; type?: string }>;
  troubleshooting?: { affectedSystem?: string; rootCause?: string };
}): SuggestedTag[] {
  const {
    title = "",
    summary = "",
    content = "",
    type = "article",
    domain = "",
    existingTags = [],
    vaultTags = [],
    entities = [],
    troubleshooting,
  } = params;

  const existingSet = new Set(existingTags.map((t) => cleanTag(t)));
  const vaultSet = new Set(vaultTags.map((t) => cleanTag(t)));
  const map = new Map<string, SuggestedTag>();

  function upsert(
    tagRaw: string,
    confidence: number,
    category: TagCategory,
    rationale: string,
    source: SuggestedTag["source"]
  ) {
    const norm = cleanTag(tagRaw);
    if (!norm || norm.length < 2 || norm.length > 35 || CLIENT_STOP_WORDS.has(norm)) return;
    if (existingSet.has(norm)) return;

    const current = map.get(norm);
    if (current) {
      current.confidence = Math.min(99, Math.round(current.confidence + confidence * 0.25));
      if (confidence > current.confidence - 10) {
        current.rationale = `${current.rationale} • ${rationale}`;
      }
      current.relevance = current.confidence >= 80 ? "high" : current.confidence >= 60 ? "medium" : "low";
    } else {
      const conf = Math.min(98, Math.max(40, Math.round(confidence)));
      map.set(norm, {
        tag: norm,
        confidence: conf,
        category,
        relevance: conf >= 80 ? "high" : conf >= 60 ? "medium" : "low",
        rationale,
        source,
      });
    }
  }

  // 1. Check OKF Entities
  if (Array.isArray(entities)) {
    entities.forEach((ent) => {
      const name = typeof ent === "string" ? ent : ent?.name;
      const typeStr = typeof ent === "string" ? "concept" : ent?.type || "concept";
      if (name && name.trim().length > 1) {
        const cat: TagCategory =
          typeStr.toLowerCase().includes("tech") || typeStr.toLowerCase().includes("lib")
            ? "technology"
            : typeStr.toLowerCase().includes("sys")
            ? "system"
            : "concept";
        upsert(name, 94, cat, `Entità ontologica OKF (${typeStr})`, "okf_entity");
      }
    });
  }

  // 2. Domain classification
  if (domain && domain.trim().length > 0 && domain !== "Uncategorized") {
    upsert(domain, 88, "domain", `Dominio concettuale qualificato: ${domain}`, "nlp_tfidf");
  }

  // 3. Troubleshooting specifics
  if (troubleshooting?.affectedSystem) {
    upsert(troubleshooting.affectedSystem, 92, "system", "Sistema scatenante identificato", "nlp_tfidf");
  }
  if (troubleshooting?.rootCause) {
    const words = troubleshooting.rootCause.split(/[\s,.;:]+/).filter((w) => w.length > 3 && !CLIENT_STOP_WORDS.has(w.toLowerCase()));
    words.slice(0, 3).forEach((w) => {
      upsert(w, 80, "problem", "Termine chiave estratto dalla causa scatenante (Root Cause)", "nlp_tfidf");
    });
  }

  // 4. Canonical Tech Patterns matching against full content
  const corpus = `${title} ${title} ${summary} ${summary} ${(content || "").slice(0, 5000)}`.toLowerCase();
  CANONICAL_TECH_PATTERNS.forEach(({ pattern, tag, category, baseConfidence }) => {
    if (pattern.test(corpus)) {
      const inTitle = pattern.test(title.toLowerCase());
      const inSummary = pattern.test(summary.toLowerCase());
      const boost = inTitle ? 4 : inSummary ? 2 : 0;
      upsert(
        tag,
        Math.min(99, baseConfidence + boost),
        category,
        inTitle ? "Menzione primaria nel titolo della risorsa" : "Pattern tecnologico rilevato nel contenuto",
        "nlp_tfidf"
      );
    }
  });

  // 5. Co-occurrence with Vault Cluster Tags
  vaultSet.forEach((vTag) => {
    if (vTag && vTag.length > 2 && !existingSet.has(vTag)) {
      const escaped = vTag.replace(/[-_]/g, "[\\s-_]");
      try {
        const regex = new RegExp(`\\b${escaped}\\b`, "i");
        if (regex.test(corpus)) {
          upsert(vTag, 86, "concept", "Coerenza ontologica con la tassonomia del Vault", "vault_cluster");
        }
      } catch {}
    }
  });

  // 6. Token Frequency (TF-IDF heuristic for unigrams & bigrams)
  const tokens = corpus
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !CLIENT_STOP_WORDS.has(t));

  const counts: Record<string, number> = {};
  tokens.forEach((t) => {
    counts[t] = (counts[t] || 0) + 1;
  });

  Object.entries(counts)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .forEach(([word, count]) => {
      upsert(
        word,
        Math.min(84, 55 + count * 4),
        "concept",
        `Frequenza semantica elevata (${count} ricorrenze)`,
        "nlp_tfidf"
      );
    });

  return Array.from(map.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

export interface FetchMlTagSuggestionsOptions {
  resource: ResourceItem;
  vaultTags?: string[];
  activeTitle?: string;
  activeSummary?: string;
  activeContent?: string;
  activeTags?: string[];
  signal?: AbortSignal;
}

export interface TagSuggestionResult {
  suggestedTags: SuggestedTag[];
  source: "gemini" | "local_nlp";
  modelUsed?: string;
  isAiEnhanced: boolean;
}

/**
 * Fetch ML suggestions from the Express backend with automatic fallback to local NLP engine
 */
export async function fetchMlTagSuggestions(
  options: FetchMlTagSuggestionsOptions
): Promise<TagSuggestionResult> {
  const {
    resource,
    vaultTags = [],
    activeTitle,
    activeSummary,
    activeContent,
    activeTags,
    signal,
  } = options;

  const title = activeTitle ?? resource.title ?? "";
  const summary = activeSummary ?? resource.summary ?? "";
  const content = activeContent ?? resource.metadata?.markdownContent ?? "";
  const existingTags = activeTags ?? resource.tags ?? [];
  const type = resource.type;
  const domain = resource.metadata?.domain || "";
  const url = resource.url || "";
  const entities = resource.metadata?.entities || [];
  const troubleshooting = {
    affectedSystem: resource.metadata?.affectedSystem,
    rootCause: resource.metadata?.rootCause,
  };

  // Immediate local baseline
  const localBaseline = generateClientSideSuggestedTags({
    title,
    summary,
    content,
    type,
    domain,
    existingTags,
    vaultTags,
    entities,
    troubleshooting,
  });

  try {
    const res = await fetch("/api/suggest-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        summary,
        content,
        type,
        domain,
        url,
        existingTags,
        vaultTags,
        entities,
        troubleshooting,
      }),
      signal,
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.success && Array.isArray(data.suggestedTags) && data.suggestedTags.length > 0) {
      return {
        suggestedTags: data.suggestedTags,
        source: data.source === "gemini" ? "gemini" : "local_nlp",
        modelUsed: data.modelUsed,
        isAiEnhanced: data.source === "gemini",
      };
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw err;
    }
    console.warn("[TagSuggester] Fallback to client-side ML engine:", err?.message);
  }

  return {
    suggestedTags: localBaseline,
    source: "local_nlp",
    modelUsed: "TF-IDF & Ontologia Client",
    isAiEnhanced: false,
  };
}
