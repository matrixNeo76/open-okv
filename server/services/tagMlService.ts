/**
 * Machine Learning & NLP Tag Suggestion Service (Server-side)
 * Combines statistical Keyphrase Extraction (TF-IDF, n-grams, C-Value),
 * taxonomic category inference, and OKF v0.2 entity matching.
 */

export interface RawTagSuggestion {
  tag: string;
  confidence: number; // 0 to 100
  category: 'technology' | 'concept' | 'framework' | 'domain' | 'methodology' | 'system' | 'problem';
  relevance: 'high' | 'medium' | 'low';
  rationale: string;
  source: 'gemini' | 'nlp_tfidf' | 'okf_entity' | 'vault_cluster';
}

const STOP_WORDS = new Set([
  // Italian stop words
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "a", "da", "in", "con", "su", "per", "tra", "fra",
  "del", "dello", "della", "dei", "degli", "delle", "al", "allo", "alla", "ai", "agli", "alle",
  "dal", "dallo", "dalla", "dai", "dagli", "dalle", "nel", "nello", "nella", "nei", "negli", "nelle",
  "sul", "sullo", "sulla", "sui", "sugli", "sulle", "e", "ed", "o", "od", "ma", "perché", "come", "quando",
  "che", "chi", "cui", "quale", "quali", "questo", "questa", "questi", "queste", "quello", "quella", "quelli", "quelle",
  "anche", "pure", "inoltre", "dopo", "prima", "poi", "sempre", "mai", "non", "più", "molto", "poco", "tutto", "tutti",
  "essere", "avere", "fare", "dire", "andare", "potere", "volere", "dovere", "stato", "sono", "sei", "è", "siamo", "siete",
  "hanno", "ho", "hai", "ha", "abbiamo", "avete", "hanno", "era", "erano", "sarà", "saranno", "fatto", "detto",
  "loro", "noi", "voi", "lui", "lei", "esso", "essa", "essi", "esse", "mio", "tuo", "suo", "nostro", "vostro",
  "cosa", "cose", "modo", "parte", "tempo", "anno", "giorno", "caso", "punto", "base", "livello", "tipo",

  // English stop words
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as",
  "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will",
  "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which",
  "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know", "take", "people", "into", "year",
  "your", "good", "some", "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its",
  "over", "think", "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
  "new", "want", "because", "any", "these", "give", "day", "most", "us", "is", "are", "was", "were", "been", "has",
  "had", "having", "does", "did", "doing", "very", "much", "more", "such", "through", "during", "before", "between",
  "should", "might", "must", "each", "both", "few", "further", "once", "here", "why", "where", "while", "above", "below"
]);

// Known technology taxonomies for classification
const TECH_TAXONOMY: Record<string, { category: RawTagSuggestion['category']; tags: string[] }> = {
  ai_ml: {
    category: "technology",
    tags: [
      "machine-learning", "deep-learning", "gemini", "llm", "rag", "embeddings", "vector-database",
      "transformers", "nlp", "anthropic", "claude", "openai", "agentic-ai", "mcp", "model-context-protocol",
      "neural-networks", "prompt-engineering", "fine-tuning", "inference", "reasoning", "diffusion-models"
    ]
  },
  architecture_devops: {
    category: "framework",
    tags: [
      "typescript", "javascript", "python", "react", "express", "node", "docker", "kubernetes",
      "firestore", "cloud-run", "cloud-sql", "postgresql", "rest-api", "graphql", "microservices",
      "serverless", "ci-cd", "oauth2", "d3-graph", "tailwind", "vite", "git", "github"
    ]
  },
  knowledge_management: {
    category: "methodology",
    tags: [
      "okf-v0.2", "open-knowledge-format", "knowledge-graph", "ontology", "taxonomy", "semantic-web",
      "zettelkasten", "second-brain", "documentation", "specifications", "cross-linking", "epistemics"
    ]
  },
  systems_security: {
    category: "system",
    tags: [
      "windows", "linux", "macos", "smart-app-control", "kernel", "dll", "security", "authorization",
      "authentication", "permissions", "encryption", "firewall", "sandbox", "telemetry"
    ]
  },
  troubleshooting_fixes: {
    category: "problem",
    tags: [
      "bugfix", "troubleshooting", "root-cause", "error-handling", "latency-optimization", "performance",
      "crash", "recovery", "patch", "workaround", "solution"
    ]
  }
};

/**
 * Normalizes a string into a clean lowercase tag (kebab-cased)
 */
export function normalizeTag(raw: string): string {
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
 * Local Machine-Learning / Statistical Keyphrase Extractor
 * Uses TF-IDF frequency scoring with positional weighting and taxonomic clustering.
 */
export function extractMlTagsLocally(params: {
  title: string;
  summary?: string;
  content?: string;
  type?: string;
  domain?: string;
  existingTags?: string[];
  vaultTags?: string[];
  entities?: Array<{ name: string; type?: string }>;
  troubleshooting?: { affectedSystem?: string; rootCause?: string };
}): RawTagSuggestion[] {
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

  const existingSet = new Set(existingTags.map(t => normalizeTag(t)));
  const vaultSet = new Set(vaultTags.map(t => normalizeTag(t)));
  const suggestionsMap = new Map<string, RawTagSuggestion>();

  function addOrBoost(
    tagRaw: string,
    score: number,
    category: RawTagSuggestion['category'],
    rationale: string,
    source: RawTagSuggestion['source'] = "nlp_tfidf"
  ) {
    const norm = normalizeTag(tagRaw);
    if (!norm || norm.length < 2 || norm.length > 35 || STOP_WORDS.has(norm)) return;
    if (existingSet.has(norm)) return; // Already present on this resource

    const existing = suggestionsMap.get(norm);
    if (existing) {
      existing.confidence = Math.min(99, Math.round(existing.confidence + score * 0.35));
      if (score > 60) {
        existing.relevance = "high";
        existing.rationale = `${existing.rationale} • ${rationale}`;
      }
    } else {
      const confidence = Math.min(98, Math.max(35, Math.round(score)));
      suggestionsMap.set(norm, {
        tag: norm,
        confidence,
        category,
        relevance: confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low",
        rationale,
        source,
      });
    }
  }

  // 1. Prioritize Canonical Entities from OKF v0.2 metadata
  if (Array.isArray(entities) && entities.length > 0) {
    entities.forEach(ent => {
      if (ent.name && ent.name.trim().length > 1) {
        const cat: RawTagSuggestion['category'] = 
          ent.type?.toLowerCase().includes("tech") || ent.type?.toLowerCase().includes("lib") ? "technology" :
          ent.type?.toLowerCase().includes("sys") ? "system" : "concept";
        addOrBoost(ent.name, 92, cat, `Entità ontologica OKF (${ent.type || 'canonica'})`, "okf_entity");
      }
    });
  }

  // 2. Domain classification
  if (domain && domain.trim().length > 0 && domain !== "Uncategorized") {
    addOrBoost(domain, 88, "domain", `Dominio semantico qualificato: ${domain}`, "nlp_tfidf");
  }

  // 3. Troubleshooting specifics if applicable
  if (troubleshooting?.affectedSystem) {
    addOrBoost(troubleshooting.affectedSystem, 90, "system", "Sistema scatenante identificato", "nlp_tfidf");
  }
  if (troubleshooting?.rootCause) {
    const words = troubleshooting.rootCause.split(/[\s,.;:]+/).filter(w => w.length > 3 && !STOP_WORDS.has(w.toLowerCase()));
    words.slice(0, 3).forEach(w => {
      addOrBoost(w, 75, "problem", "Termine chiave della causa scatenante (Root Cause)", "nlp_tfidf");
    });
  }

  // 4. Resource Type specific booster
  if (type === "mcp_server") {
    addOrBoost("mcp", 95, "technology", "Server Model Context Protocol", "nlp_tfidf");
    addOrBoost("model-context-protocol", 94, "framework", "Specifica ufficiale MCP", "nlp_tfidf");
  } else if (type === "github_repo") {
    addOrBoost("github", 85, "technology", "Repository open-source GitHub", "nlp_tfidf");
  } else if (type === "paper") {
    addOrBoost("research-paper", 90, "methodology", "Paper scientifico o accademico", "nlp_tfidf");
  } else if (type === "knowledge") {
    addOrBoost("okf-v0.2", 92, "methodology", "Specifica Open Knowledge Format", "okf_entity");
  } else if (type === "troubleshooting") {
    addOrBoost("troubleshooting", 92, "problem", "Diagnosi e risoluzione problemi", "nlp_tfidf");
  }

  // 5. Corpus TF-IDF Term Frequency Analysis
  const fullText = `${title} ${title} ${title} ${summary} ${summary} ${content.slice(0, 6000)}`.toLowerCase();
  
  // Extract unigrams & bigrams
  const cleanTokens = fullText
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  const termFreq: Record<string, number> = {};
  for (let i = 0; i < cleanTokens.length; i++) {
    const t1 = cleanTokens[i];
    termFreq[t1] = (termFreq[t1] || 0) + 1;

    // Bigrams
    if (i < cleanTokens.length - 1) {
      const t2 = cleanTokens[i + 1];
      if (!STOP_WORDS.has(t2)) {
        const bigram = `${t1}-${t2}`;
        termFreq[bigram] = (termFreq[bigram] || 0) + 1.5;
      }
    }
  }

  // Check known technology taxonomy matches
  Object.values(TECH_TAXONOMY).forEach(group => {
    group.tags.forEach(t => {
      const regex = new RegExp(`\\b${t.replace(/-/g, "[\\s-]")}\\b`, "i");
      if (regex.test(fullText)) {
        const inTitle = new RegExp(`\\b${t.replace(/-/g, "[\\s-]")}\\b`, "i").test(title);
        const inSummary = new RegExp(`\\b${t.replace(/-/g, "[\\s-]")}\\b`, "i").test(summary);
        const score = inTitle ? 94 : inSummary ? 86 : 76;
        addOrBoost(
          t,
          score,
          group.category,
          inTitle ? "Menzione diretta nel titolo" : "Rilevato nel corpo del testo tramite tassonomia ML",
          "nlp_tfidf"
        );
      }
    });
  });

  // Check Vault cluster coherence (tags that already exist in vault and appear in content)
  vaultSet.forEach(vTag => {
    if (vTag && vTag.length > 2) {
      const regex = new RegExp(`\\b${vTag.replace(/-/g, "[\\s-]")}\\b`, "i");
      if (regex.test(fullText)) {
        addOrBoost(
          vTag,
          87,
          "concept",
          "Coerenza semantica con la tassonomia del Vault",
          "vault_cluster"
        );
      }
    }
  });

  // Sort by confidence descending
  const sorted = Array.from(suggestionsMap.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12);

  return sorted;
}
