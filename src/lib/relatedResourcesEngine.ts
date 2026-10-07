import { ResourceItem, OKFRelation } from "../types";
import { normalizeSearchText } from "./searchEngine";

// Common Italian and English stop words + general coding noise
const STOP_WORDS = new Set([
  // Italian stop words
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "dei", "degli", "delle", "della", "dello", "del",
  "di", "a", "da", "in", "con", "su", "per", "tra", "fra", "ed", "ad", "e", "o", "ma", "se", "che", "chi",
  "cui", "non", "come", "dove", "quando", "quale", "quali", "quanto", "quanti", "questo", "questa", "questi",
  "queste", "quello", "quella", "quelli", "quelle", "suo", "sua", "suoi", "sue", "loro", "nostro", "nostra",
  "nostri", "nostre", "vostro", "vostra", "vostri", "vostre", "mio", "mia", "miei", "mie", "essere", "avere",
  "fare", "stato", "stata", "stati", "state", "sono", "sei", "siamo", "siete", "hanno", "ha", "ho", "abbiamo",
  "avete", "anche", "piu", "molto", "poco", "solo", "ogni", "tutti", "tutto", "tutta", "tutte", "dopo", "prima",
  "durante", "sempre", "mai", "gia", "ancora", "oltre", "verso", "sotto", "sopra", "dentro", "fuori", "senza",
  "tramite", "mediante", "secondo", "circa", "inoltre", "quindi", "dunque", "oppure", "mentre", "infatti",
  "invece", "pero", "altri", "altro", "altra", "altre", "stesso", "stessa", "stessi", "stesse", "cio", "ne",
  "ci", "vi", "ti", "mi", "si",

  // English stop words
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "by", "about", "against",
  "between", "into", "through", "during", "before", "after", "above", "below", "from", "up", "down", "of",
  "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how",
  "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only",
  "own", "same", "so", "than", "too", "very", "can", "will", "just", "should", "now", "be", "is", "are", "was",
  "were", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "would", "could",
  "ought", "i", "you", "he", "she", "it", "we", "they", "them", "their", "theirs", "themselves", "what",
  "which", "who", "whom", "this", "that", "these", "those", "am",

  // Generic technical filler
  "null", "undefined", "true", "false", "const", "let", "var", "function", "return", "import", "export",
  "from", "default", "class", "interface", "type", "async", "await", "new", "this", "file", "code", "data",
  "item", "items", "test", "todo", "example", "sample", "view", "page", "app", "component"
]);

export interface RelatedResourceMatch {
  resource: ResourceItem;
  score: number; // 0 - 100 affinity percentage
  tagScore: number; // 0 - 100
  contentScore: number; // 0 - 100
  sharedTags: string[];
  overlappingTerms: string[];
  matchReasons: string[];
  explanation: string;
}

export interface ResourceAffinityResult {
  score: number; // 0 - 100
  tagScore: number;
  contentScore: number;
  sharedTags: string[];
  overlappingTerms: string[];
  explanation: string;
}

interface TermWeightMap {
  weights: Map<string, number>;
  totalWeight: number;
  phrases: Set<string>;
  rawEntities: string[];
}

// In-memory cache for extracted resource term weights to guarantee fast 60fps graph simulation
const termCache = new WeakMap<ResourceItem, TermWeightMap>();

/**
 * Extracts normalized, weighted terms and technical phrases from a ResourceItem.
 * Title and metadata entities receive highest priority; summary and headers medium; body standard.
 */
export function extractResourceTerms(resource: ResourceItem): TermWeightMap {
  if (termCache.has(resource)) {
    return termCache.get(resource)!;
  }

  const weights = new Map<string, number>();
  const phrases = new Set<string>();

  const addTerm = (rawTerm: string, weight: number) => {
    const clean = normalizeSearchText(rawTerm);
    if (!clean || clean.length < 3 || STOP_WORDS.has(clean)) return;
    // Skip terms that are pure numbers
    if (/^\d+$/.test(clean)) return;

    const current = weights.get(clean) || 0;
    weights.set(clean, current + weight);
  };

  const addPhrase = (phrase: string, weight: number) => {
    const clean = normalizeSearchText(phrase);
    if (!clean || clean.length < 5) return;
    const words = clean.split(/\s+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
    if (words.length >= 2 && words.length <= 4) {
      const phraseKey = words.join(" ");
      phrases.add(phraseKey);
      const current = weights.get(phraseKey) || 0;
      weights.set(phraseKey, current + weight * 1.5);
    }
  };

  // 1. Title terms (Highest signal: 3.5x)
  if (resource.title) {
    const titleWords = normalizeSearchText(resource.title).split(/\s+/);
    titleWords.forEach((w) => addTerm(w, 3.5));
    // Check 2-word combinations in title
    for (let i = 0; i < titleWords.length - 1; i++) {
      addPhrase(`${titleWords[i]} ${titleWords[i + 1]}`, 3.5);
    }
  }

  // 2. Declared Entities in OKF Metadata (High signal: 3.0x)
  const rawEntities: string[] = [];
  if (resource.metadata?.entities && Array.isArray(resource.metadata.entities)) {
    resource.metadata.entities.forEach((ent: any) => {
      const entName = typeof ent === "string" ? ent : ent?.name;
      if (entName) {
        rawEntities.push(entName);
        addTerm(entName, 3.0);
        addPhrase(entName, 3.0);
      }
    });
  }

  // 3. Domain & Affected System (2.5x)
  if (resource.metadata?.domain && resource.metadata.domain.toLowerCase() !== "general") {
    addTerm(resource.metadata.domain, 2.5);
  }
  if (resource.metadata?.affectedSystem) {
    addTerm(resource.metadata.affectedSystem, 2.5);
    addPhrase(resource.metadata.affectedSystem, 2.5);
  }

  // 4. Summary terms (2.0x)
  if (resource.summary) {
    const summaryWords = normalizeSearchText(resource.summary).split(/\s+/);
    summaryWords.forEach((w) => addTerm(w, 2.0));
    for (let i = 0; i < summaryWords.length - 1; i++) {
      if (!STOP_WORDS.has(summaryWords[i]) && !STOP_WORDS.has(summaryWords[i + 1])) {
        addPhrase(`${summaryWords[i]} ${summaryWords[i + 1]}`, 2.0);
      }
    }
  }

  // 5. Technical metadata (dependencies, tools, keywords) (2.0x)
  const technicalLists = [
    ...(resource.metadata?.dependencies || []),
    ...(resource.metadata?.toolsProvided || []),
    ...(resource.metadata?.triggerKeywords || []),
    ...(resource.metadata?.prerequisites || []),
  ];
  technicalLists.forEach((tech) => {
    if (typeof tech === "string") {
      addTerm(tech, 2.2);
      addPhrase(tech, 2.2);
    }
  });

  // 6. Markdown Content / Raw input (1.0x, with header boost 1.8x)
  const markdown = resource.metadata?.markdownContent || resource.rawInput || "";
  if (markdown) {
    // Strip markdown frontmatter and code blocks to avoid noise
    const cleanContent = markdown
      .replace(/^---[\s\S]*?---\n*/, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/https?:\/\/[^\s]+/g, "");

    const lines = cleanContent.split("\n");
    lines.forEach((line) => {
      const isHeader = line.startsWith("#");
      const weight = isHeader ? 1.8 : 1.0;
      const cleanLine = normalizeSearchText(line);
      if (!cleanLine) return;
      const words = cleanLine.split(/\s+/);
      words.forEach((w) => addTerm(w, weight));
      if (isHeader) {
        for (let i = 0; i < words.length - 1; i++) {
          addPhrase(`${words[i]} ${words[i + 1]}`, 2.0);
        }
      }
    });
  }

  let totalWeight = 0;
  weights.forEach((w) => {
    totalWeight += w;
  });

  const result: TermWeightMap = {
    weights,
    totalWeight: Math.max(totalWeight, 1),
    phrases,
    rawEntities,
  };

  termCache.set(resource, result);
  return result;
}

/**
 * Calculates bidirectional semantic affinity between two ResourceItems based on:
 * 1. Shared tags (Jaccard similarity + count)
 * 2. Overlapping content (terms, entities, technical phrases with frequency weights)
 */
export function calculateResourceAffinity(
  docA: ResourceItem,
  docB: ResourceItem
): ResourceAffinityResult {
  if (docA.id === docB.id) {
    return {
      score: 100,
      tagScore: 100,
      contentScore: 100,
      sharedTags: docA.tags || [],
      overlappingTerms: [],
      explanation: "Stessa risorsa",
    };
  }

  // --- Part 1: Shared Tags Analysis ---
  const tagsA = (docA.tags || []).map((t) => t.toLowerCase().trim()).filter((t) => t.length > 1 && t !== "dev" && t !== "doc");
  const tagsB = (docB.tags || []).map((t) => t.toLowerCase().trim()).filter((t) => t.length > 1 && t !== "dev" && t !== "doc");

  const sharedTagsSet = new Set<string>();
  tagsA.forEach((t) => {
    if (tagsB.includes(t)) sharedTagsSet.add(t);
  });
  const sharedTags = Array.from(sharedTagsSet);

  let tagScore = 0;
  if (tagsA.length > 0 || tagsB.length > 0) {
    const unionSize = new Set([...tagsA, ...tagsB]).size;
    const jaccard = unionSize > 0 ? sharedTags.length / unionSize : 0;
    // Score based on Jaccard + raw count boost
    tagScore = Math.min(100, Math.round((jaccard * 65) + (Math.min(sharedTags.length, 4) * 10)));
  }

  // --- Part 2: Overlapping Content Analysis ---
  const termsA = extractResourceTerms(docA);
  const termsB = extractResourceTerms(docB);

  const sharedTermsWithScore: { term: string; score: number }[] = [];
  let intersectionWeight = 0;

  // Compare terms
  termsA.weights.forEach((weightA, term) => {
    const weightB = termsB.weights.get(term);
    if (weightB !== undefined && weightB > 0) {
      // Harmonic / min weight contribution
      const overlapWeight = Math.min(weightA, weightB) * 2;
      intersectionWeight += overlapWeight;
      sharedTermsWithScore.push({
        term,
        score: overlapWeight,
      });
    }
  });

  // Sort overlapping terms by significance
  sharedTermsWithScore.sort((a, b) => b.score - a.score);
  const overlappingTerms = sharedTermsWithScore.slice(0, 8).map((st) => st.term);

  // Content Overlap Coefficient
  const minTotal = Math.min(termsA.totalWeight, termsB.totalWeight);
  const contentRatio = minTotal > 0 ? Math.min(1.0, intersectionWeight / (minTotal * 0.85)) : 0;
  const contentScore = Math.min(100, Math.round(contentRatio * 100));

  // --- Part 3: Entity / Domain Cross-Bonus ---
  let bonus = 0;
  // If same domain
  if (
    docA.metadata?.domain &&
    docB.metadata?.domain &&
    docA.metadata.domain.toLowerCase() === docB.metadata.domain.toLowerCase() &&
    docA.metadata.domain.toLowerCase() !== "general"
  ) {
    bonus += 8;
  }

  // If common declared entity
  const commonEntities = termsA.rawEntities.filter((e) =>
    termsB.rawEntities.some((eb) => eb.toLowerCase() === e.toLowerCase())
  );
  if (commonEntities.length > 0) {
    bonus += Math.min(15, commonEntities.length * 6);
  }

  // --- Part 4: Combined Affinity Score (0 - 100) ---
  let finalScore = 0;
  if (sharedTags.length > 0 && contentScore > 0) {
    // Both signals present: high confidence
    finalScore = Math.round(tagScore * 0.40 + contentScore * 0.60 + bonus);
  } else if (sharedTags.length > 0) {
    // Only tag signal
    finalScore = Math.round(tagScore * 0.70 + bonus);
  } else if (contentScore > 0) {
    // Only content overlap signal
    finalScore = Math.round(contentScore * 0.75 + bonus);
  }

  finalScore = Math.min(100, Math.max(0, finalScore));

  // --- Part 5: Human-readable Explanation ---
  const reasons: string[] = [];
  if (sharedTags.length > 0) {
    reasons.push(`${sharedTags.length} tag in comune (${sharedTags.map((t) => "#" + t).join(", ")})`);
  }
  if (overlappingTerms.length > 0) {
    const topSample = overlappingTerms.slice(0, 3).map((t) => `"${t}"`).join(", ");
    reasons.push(`${overlappingTerms.length} termini sovrapposti (${topSample})`);
  }
  if (commonEntities.length > 0) {
    reasons.push(`entità condivisa: ${commonEntities[0]}`);
  }

  const explanation = reasons.length > 0 
    ? reasons.join(" • ")
    : "Bassa affinità contestuale";

  return {
    score: finalScore,
    tagScore,
    contentScore,
    sharedTags,
    overlappingTerms,
    explanation,
  };
}

/**
 * Identifies and ranks top related resources for a specific target ResourceItem
 * based on shared tags and overlapping content.
 */
export function identifyRelatedResources(
  targetResource: ResourceItem,
  allResources: ResourceItem[],
  options: {
    limit?: number;
    minScore?: number;
  } = {}
): RelatedResourceMatch[] {
  const { limit = 6, minScore = 20 } = options;

  const matches: RelatedResourceMatch[] = [];

  for (const candidate of allResources) {
    if (candidate.id === targetResource.id) continue;

    const affinity = calculateResourceAffinity(targetResource, candidate);

    // Accept if overall score >= minScore, or if they share at least 2 tags or 3 significant content terms
    if (
      affinity.score >= minScore ||
      (affinity.sharedTags.length >= 2) ||
      (affinity.sharedTags.length >= 1 && affinity.overlappingTerms.length >= 2) ||
      (affinity.overlappingTerms.length >= 4)
    ) {
      const matchReasons: string[] = [];
      if (affinity.sharedTags.length > 0) {
        matchReasons.push(`Tag: ${affinity.sharedTags.map((t) => "#" + t).join(", ")}`);
      }
      if (affinity.overlappingTerms.length > 0) {
        matchReasons.push(`Contenuto: ${affinity.overlappingTerms.slice(0, 3).join(", ")}`);
      }

      matches.push({
        resource: candidate,
        score: Math.max(affinity.score, affinity.sharedTags.length > 0 ? 30 : 20),
        tagScore: affinity.tagScore,
        contentScore: affinity.contentScore,
        sharedTags: affinity.sharedTags,
        overlappingTerms: affinity.overlappingTerms,
        matchReasons,
        explanation: affinity.explanation,
      });
    }
  }

  // Sort descending by score, then tag count, then content score
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.sharedTags.length !== a.sharedTags.length) return b.sharedTags.length - a.sharedTags.length;
    return b.contentScore - a.contentScore;
  });

  return matches.slice(0, limit);
}

/**
 * Helper to convert an auto-identified affinity into an OKF v0.2 Relation object
 * so the user can easily link the two resources permanently.
 */
export function createOkfRelationFromAffinity(match: RelatedResourceMatch): OKFRelation {
  let relationType: OKFRelation["relationType"] = "related_to";

  if (match.sharedTags.length >= 2 && match.contentScore > 50) {
    relationType = "related_to";
  } else if (match.resource.type === "mcp_server") {
    relationType = "uses_tool";
  } else if (match.resource.type === "troubleshooting") {
    relationType = "references";
  }

  return {
    targetId: match.resource.id,
    targetTitle: match.resource.title,
    relationType,
    weight: Math.min(1.0, Math.max(0.6, match.score / 100)),
    description: `Relazione generata da affinità semantica (${match.score}%): ${match.explanation}`,
  };
}
