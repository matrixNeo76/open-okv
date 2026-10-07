import { ResourceItem, ResourceType, NavCategory } from "../types";
import { isReadLaterResource } from "./readLaterUtils";

/**
 * Normalizes text for search indexing:
 * - Converts to lower case
 * - Strips diacritics / accents (e.g., è -> e, à -> a)
 * - Replaces punctuation and special symbols with spaces while keeping alphanumeric characters
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-_]/g, " ") // replace brackets, punctuation, quotes with space
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedSearchQuery {
  rawQuery: string;
  tokens: string[];
  exactPhrases: string[];
  typeFilter?: ResourceType;
  tagFilters: string[];
  isFavoriteFilter?: boolean;
  domainFilter?: string;
  hasFilters: boolean;
}

/**
 * Parses user search query supporting:
 * - Simple multi-word terms: "chrome nvidia" -> tokens: ["chrome", "nvidia"]
 * - Exact phrases: "google chrome" -> exactPhrases: ["google chrome"]
 * - Type filters: type:troubleshooting or type:mcp
 * - Tag filters: #nvidia or tag:gpu
 * - Favorite filters: is:favorite or is:fav
 * - Domain filters: domain:ai or domain:devops
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      rawQuery: "",
      tokens: [],
      exactPhrases: [],
      tagFilters: [],
      hasFilters: false,
    };
  }

  const exactPhrases: string[] = [];
  let cleanQuery = trimmed;

  // Extract exact phrases wrapped in quotes "..."
  const quoteRegex = /"([^"]+)"/g;
  let match;
  while ((match = quoteRegex.exec(trimmed)) !== null) {
    if (match[1].trim()) {
      exactPhrases.push(normalizeSearchText(match[1]));
    }
  }
  cleanQuery = cleanQuery.replace(quoteRegex, " ");

  const rawTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  const tagFilters: string[] = [];
  let typeFilter: ResourceType | undefined;
  let isFavoriteFilter: boolean | undefined;
  let domainFilter: string | undefined;

  for (const rawToken of rawTokens) {
    const lower = rawToken.toLowerCase();

    // Type filter: type:troubleshooting
    if (lower.startsWith("type:")) {
      const t = lower.replace("type:", "").trim();
      const validTypes: ResourceType[] = [
        "knowledge",
        "troubleshooting",
        "github_repo",
        "mcp_server",
        "ai_skill",
        "article",
        "link",
        "paper",
        "rss",
        "note",
      ];
      if (validTypes.includes(t as ResourceType)) {
        typeFilter = t as ResourceType;
      }
      continue;
    }

    // Tag filter: tag:name or #name
    if (lower.startsWith("tag:")) {
      const tag = lower.replace("tag:", "").trim();
      if (tag) tagFilters.push(normalizeSearchText(tag));
      continue;
    }
    if (lower.startsWith("#") && lower.length > 1) {
      const tag = lower.slice(1).trim();
      if (tag) tagFilters.push(normalizeSearchText(tag));
      continue;
    }

    // Favorite filter: is:fav or is:favorite
    if (lower === "is:fav" || lower === "is:favorite" || lower === "is:starred") {
      isFavoriteFilter = true;
      continue;
    }

    // Domain filter: domain:devops
    if (lower.startsWith("domain:")) {
      const d = lower.replace("domain:", "").trim();
      if (d) domainFilter = normalizeSearchText(d);
      continue;
    }

    // Standard word token
    const normalized = normalizeSearchText(rawToken);
    if (normalized) {
      tokens.push(normalized);
    }
  }

  const hasFilters =
    tokens.length > 0 ||
    exactPhrases.length > 0 ||
    tagFilters.length > 0 ||
    !!typeFilter ||
    isFavoriteFilter !== undefined ||
    !!domainFilter;

  return {
    rawQuery: trimmed,
    tokens,
    exactPhrases,
    typeFilter,
    tagFilters,
    isFavoriteFilter,
    domainFilter,
    hasFilters,
  };
}

export interface SearchMatchResult {
  matches: boolean;
  score: number;
  matchedFields: string[];
}

/**
 * Evaluates whether a ResourceItem matches the search criteria and calculates a relevance score.
 */
export function evaluateResourceSearch(
  resource: ResourceItem,
  parsed: ParsedSearchQuery
): SearchMatchResult {
  if (!parsed.hasFilters) {
    return { matches: true, score: 0, matchedFields: [] };
  }

  // 1. Direct Field Restrictions
  if (parsed.typeFilter && resource.type !== parsed.typeFilter) {
    return { matches: false, score: 0, matchedFields: [] };
  }
  if (parsed.isFavoriteFilter && !resource.isFavorite) {
    return { matches: false, score: 0, matchedFields: [] };
  }

  // 2. Tag Filters
  if (parsed.tagFilters.length > 0) {
    const resourceTags = (resource.tags || []).map((t) => normalizeSearchText(t));
    const allTagsMatch = parsed.tagFilters.every((reqTag) =>
      resourceTags.some((t) => t.includes(reqTag))
    );
    if (!allTagsMatch) {
      return { matches: false, score: 0, matchedFields: [] };
    }
  }

  // 3. Domain Filter
  if (parsed.domainFilter) {
    const resourceDomain = normalizeSearchText(resource.metadata?.domain || "");
    if (!resourceDomain.includes(parsed.domainFilter)) {
      return { matches: false, score: 0, matchedFields: [] };
    }
  }

  // If no word tokens or exact phrases, but satisfied filters above
  if (parsed.tokens.length === 0 && parsed.exactPhrases.length === 0) {
    return { matches: true, score: 50, matchedFields: ["filter"] };
  }

  // 4. Construct Indexed Normalized Field Corpi
  const titleNorm = normalizeSearchText(resource.title || "");
  const summaryNorm = normalizeSearchText(resource.summary || "");
  const tagsNorm = (resource.tags || []).map((t) => normalizeSearchText(t)).join(" ");
  const urlNorm = normalizeSearchText(resource.url || "");
  const rawInputNorm = normalizeSearchText(resource.rawInput || "");

  // Metadata Deep Fields
  const meta = resource.metadata || {};
  const domainNorm = normalizeSearchText(meta.domain || "");
  const docTypeNorm = normalizeSearchText(meta.docType || "");
  const mdNorm = normalizeSearchText(meta.markdownContent || "");

  // Troubleshooting Fields
  const tsSymptomsNorm = normalizeSearchText(meta.problemDescription || "");
  const tsRootCauseNorm = normalizeSearchText(meta.rootCause || "");
  const tsSystemNorm = normalizeSearchText(meta.affectedSystem || "");
  const tsLogNorm = normalizeSearchText(meta.errorLog || "");
  const tsStepsNorm = normalizeSearchText(
    [...(meta.solutionSteps || []), ...(meta.attemptedFixes || [])].join(" ")
  );

  // Entities & Relations
  const entitiesNorm = Array.isArray(meta.entities)
    ? meta.entities
        .map((e) => (typeof e === "string" ? e : `${e.name} ${e.type} ${e.description || ""}`))
        .join(" ")
    : "";
  const entitiesNormalized = normalizeSearchText(entitiesNorm);

  const relationsNorm = Array.isArray(meta.relations)
    ? meta.relations
        .map((r) => `${r.targetTitle || ""} ${r.relationType || ""} ${r.description || ""}`)
        .join(" ")
    : "";
  const relationsNormalized = normalizeSearchText(relationsNorm);

  // MCP / GitHub / AI Skills Fields
  const mcpNorm = normalizeSearchText(
    `${meta.command || ""} ${(meta.toolsProvided || []).join(" ")} ${meta.configSnippet || ""}`
  );
  const ghNorm = normalizeSearchText(
    `${meta.repoName || ""} ${meta.owner || ""} ${meta.language || ""} ${meta.installCommand || ""}`
  );
  const skillNorm = normalizeSearchText(
    `${meta.skillType || ""} ${meta.recommendedModel || ""} ${(meta.triggerKeywords || []).join(" ")} ${meta.systemPrompt || ""}`
  );
  const notesNorm = normalizeSearchText(
    `${meta.userNotes || ""} ${(meta.keyTakeaways || []).join(" ")} ${(meta.useCases || []).join(" ")}`
  );
  const translatedNorm = normalizeSearchText(
    `${meta.translatedTitle || ""} ${meta.translatedSummary || ""}`
  );

  // Combined full-text corpus
  const fullCorpus = [
    titleNorm,
    summaryNorm,
    tagsNorm,
    urlNorm,
    rawInputNorm,
    domainNorm,
    docTypeNorm,
    tsSymptomsNorm,
    tsRootCauseNorm,
    tsSystemNorm,
    tsLogNorm,
    tsStepsNorm,
    entitiesNormalized,
    relationsNormalized,
    mcpNorm,
    ghNorm,
    skillNorm,
    notesNorm,
    translatedNorm,
    mdNorm,
  ].join(" ");

  let score = 0;
  const matchedFieldsSet = new Set<string>();

  // 5. Check Exact Phrases
  for (const phrase of parsed.exactPhrases) {
    if (!fullCorpus.includes(phrase)) {
      return { matches: false, score: 0, matchedFields: [] };
    }
    score += 80;
    if (titleNorm.includes(phrase)) {
      score += 150;
      matchedFieldsSet.add("titolo");
    }
    if (tagsNorm.includes(phrase)) {
      score += 90;
      matchedFieldsSet.add("tag");
    }
    if (summaryNorm.includes(phrase)) {
      score += 60;
      matchedFieldsSet.add("descrizione");
    }
  }

  // 6. Token Evaluation (Multi-word search)
  // For standard search (e.g. "chrome nvidia"), ALL tokens must be present somewhere in the document!
  const matchedTokensCount = parsed.tokens.filter((token) => fullCorpus.includes(token)).length;

  // Strict Token Coverage:
  // If user typed 1-3 tokens, require ALL of them to match.
  // If user typed 4+ tokens, allow at least 75% coverage or require all for optimal match.
  const requiredTokens = parsed.tokens.length <= 3 ? parsed.tokens.length : Math.ceil(parsed.tokens.length * 0.75);
  const hasTokenMatch = parsed.tokens.length === 0 || matchedTokensCount >= requiredTokens;

  if (!hasTokenMatch) {
    return { matches: false, score: 0, matchedFields: [] };
  }

  // Calculate detailed scoring per token
  for (const token of parsed.tokens) {
    let tokenScore = 0;

    // Exact word or boundary match in Title
    if (titleNorm.includes(token)) {
      tokenScore += 100;
      matchedFieldsSet.add("titolo");
      // Extra bonus if token is exact whole word in title
      const titleWords = titleNorm.split(" ");
      if (titleWords.includes(token)) {
        tokenScore += 50;
      }
    }

    // Match in Tags
    if (tagsNorm.includes(token)) {
      tokenScore += 70;
      matchedFieldsSet.add("tag");
      const tagWords = tagsNorm.split(" ");
      if (tagWords.includes(token)) {
        tokenScore += 30;
      }
    }

    // Match in Troubleshooting Diagnosis (Symptoms, Cause, Steps, Log, System)
    const tsCombined = `${tsSymptomsNorm} ${tsRootCauseNorm} ${tsStepsNorm} ${tsLogNorm} ${tsSystemNorm}`;
    if (tsCombined.includes(token)) {
      tokenScore += 65;
      matchedFieldsSet.add("risoluzione");
    }

    // Match in Summary / Description
    if (summaryNorm.includes(token)) {
      tokenScore += 40;
      matchedFieldsSet.add("sommario");
    }

    // Match in Domain / DocType
    if (domainNorm.includes(token) || docTypeNorm.includes(token)) {
      tokenScore += 35;
      matchedFieldsSet.add("dominio");
    }

    // Match in Entities / Relations
    if (entitiesNormalized.includes(token) || relationsNormalized.includes(token)) {
      tokenScore += 30;
      matchedFieldsSet.add("entità");
    }

    // Match in MCP / GitHub / AI Skills
    if (mcpNorm.includes(token) || ghNorm.includes(token) || skillNorm.includes(token)) {
      tokenScore += 30;
      matchedFieldsSet.add("specifiche");
    }

    // Match in Markdown body / Notes
    if (mdNorm.includes(token) || notesNorm.includes(token)) {
      tokenScore += 20;
      matchedFieldsSet.add("documento");
    }

    // Match in URL / Raw input
    if (urlNorm.includes(token) || rawInputNorm.includes(token)) {
      tokenScore += 15;
      matchedFieldsSet.add("link");
    }

    score += tokenScore;
  }

  // Bonus if exact raw sequence appears in title or summary
  const rawNormalized = normalizeSearchText(parsed.rawQuery);
  if (rawNormalized && titleNorm.includes(rawNormalized)) {
    score += 200;
  } else if (rawNormalized && summaryNorm.includes(rawNormalized)) {
    score += 100;
  }

  // Bonus for favorites if matching
  if (resource.isFavorite) {
    score += 10;
  }

  return {
    matches: true,
    score,
    matchedFields: Array.from(matchedFieldsSet),
  };
}

/**
 * Searches and ranks resources based on query, category, tag and sort option.
 */
export function filterAndRankResources(
  resources: ResourceItem[],
  query: string,
  category: NavCategory,
  selectedTag: string | null,
  sortBy: string,
  hideReadLater: boolean = false
): ResourceItem[] {
  const parsed = parseSearchQuery(query);

  const matchedItems: { item: ResourceItem; result: SearchMatchResult }[] = [];

  for (const item of resources) {
    const isReadLater = isReadLaterResource(item);

    // Keep primary view focused on active projects by excluding items queued for later
    if (category !== "read_later" && hideReadLater && isReadLater) {
      continue;
    }

    // 1. Category Filter
    if (category === "favorites" && !item.isFavorite) continue;
    if (category === "read_later") {
      if (!isReadLater) continue;
    } else if (category === "media_files") {
      const hasMedia =
        item.metadata?.mediaType === "image" ||
        item.metadata?.mediaType === "pdf" ||
        item.metadata?.mediaType === "document" ||
        Boolean(item.metadata?.imageUrl) ||
        Boolean(item.metadata?.sourceFileName && /\.(png|jpe?g|webp|gif|svg|pdf|docx?)$/i.test(item.metadata.sourceFileName));
      if (!hasMedia) continue;
    } else if (category !== "all" && category !== "favorites") {
      if (category === "procedure") {
        const isProc = (item.type as string) === "procedure" ||
          Boolean(item.metadata?.procedureType) ||
          Boolean(item.metadata?.targetSystem) ||
          Boolean(item.tags && item.tags.some((t: string) => t.toLowerCase() === "procedure" || t.toLowerCase() === "sop" || t.toLowerCase() === "playbook")) ||
          Boolean(item.title && (/procedura\s+operativa\s+standard|\b(sop|playbook)\b/i.test(item.title) || item.title.toLowerCase().includes("procedura operativa standard")));
        if (!isProc) continue;
      } else if (item.type !== category) {
        continue;
      }
    }

    // 2. Tag Filter
    if (selectedTag) {
      const itemTags = (item.tags || []).map((t) => t.toLowerCase());
      if (!itemTags.includes(selectedTag.toLowerCase())) {
        continue;
      }
    }

    // 3. Search Query Filter & Scoring
    const evalResult = evaluateResourceSearch(item, parsed);
    if (!evalResult.matches) {
      continue;
    }

    matchedItems.push({
      item,
      result: evalResult,
    });
  }

  // If user searched for something and hasn't chosen an explicit sort other than "newest",
  // sort primarily by Search Relevance Score, breaking ties with creation date!
  const isSearchActive = parsed.hasFilters && (parsed.tokens.length > 0 || parsed.exactPhrases.length > 0);

  matchedItems.sort((a, b) => {
    if (isSearchActive && sortBy === "newest") {
      // Relevance Score descending
      if (b.result.score !== a.result.score) {
        return b.result.score - a.result.score;
      }
    }

    if (sortBy === "title") {
      return (a.item.title || "").localeCompare(b.item.title || "");
    }
    if (sortBy === "title_desc") {
      return (b.item.title || "").localeCompare(a.item.title || "");
    }
    if (sortBy === "favorites") {
      if (a.item.isFavorite && !b.item.isFavorite) return -1;
      if (!a.item.isFavorite && b.item.isFavorite) return 1;
    }
    if (sortBy === "type") {
      const typePriority: Record<ResourceType, number> = {
        troubleshooting: 1,
        procedure: 1.5,
        knowledge: 2,
        document_refactor: 2.5,
        paper: 3,
        note: 4,
        mcp_server: 5,
        github_repo: 6,
        ai_skill: 7,
        rss: 8,
        article: 9,
        link: 10,
      };
      const diff = (typePriority[a.item.type] || 99) - (typePriority[b.item.type] || 99);
      if (diff !== 0) return diff;
    }

    const timeA = a.item.createdAt ? (typeof a.item.createdAt === "object" && "toMillis" in a.item.createdAt ? a.item.createdAt.toMillis() : new Date(a.item.createdAt).getTime()) : 0;
    const timeB = b.item.createdAt ? (typeof b.item.createdAt === "object" && "toMillis" in b.item.createdAt ? b.item.createdAt.toMillis() : new Date(b.item.createdAt).getTime()) : 0;

    return sortBy === "oldest" ? timeA - timeB : timeB - timeA;
  });

  return matchedItems.map((m) => m.item);
}
