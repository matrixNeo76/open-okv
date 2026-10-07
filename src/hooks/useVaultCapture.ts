/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { 
  auth, 
  signInAnonymously,
  db, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  getDocs, 
  setDoc, 
  writeBatch,
  disableNetwork,
  User 
} from "../lib/firebase";
import { ResourceItem, ResourceType, RawFileItem, DiagnosticLog, CaptureStage, TransformationCategory, ResourceMetadata, GeminiModelId } from "../types";
import { localFallbackAnalyzeResource } from "../lib/fallbackParser";
import { parseDate, getTimestampMillis } from "../lib/dateUtils";
import { loadRawFilesFromIndexedDB } from "../lib/indexedDb";
import { 
  sanitizeForFirestore, 
  isQuotaError, 
  withFirestoreTimeout, 
  saveLocalResources 
} from "./useVaultData";
import { saveQuotaExceededStatus } from "../lib/cacheManager";
import { recordLifecycleEvent } from "../lib/resourceLifecycleTracker";
import { validateOKFDocumentSchema, VALID_OKF_DOC_TYPES, parseOKFDocument } from "../lib/okfParser";

// Local storage key for raw files
const RAW_FILES_STORAGE_KEY = "knowledge_vault_raw_files";

function loadLocalRawFiles(uid?: string): RawFileItem[] | null {
  try {
    const key = uid ? `${RAW_FILES_STORAGE_KEY}_${uid}` : RAW_FILES_STORAGE_KEY;
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.warn("Could not load local raw files:", err);
    return null;
  }
}

function saveLocalRawFiles(files: RawFileItem[], uid?: string) {
  try {
    const key = uid ? `${RAW_FILES_STORAGE_KEY}_${uid}` : RAW_FILES_STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(files));
  } catch (err) {
    console.warn("Could not save local raw files:", err);
  }
}

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
};

export type InputClassificationType = 
  | "web_link"           // Standard HTTP/HTTPS link or web URL
  | "github_repo"        // GitHub repository URL (e.g. github.com/owner/repo)
  | "scientific_paper"   // arXiv, DOI, scientific paper URL or ID
  | "rss_feed"           // RSS / Atom feed URL or XML
  | "mcp_server"         // MCP config or protocol definition
  | "ai_skill"           // Prompt, system instruction, skill template
  | "troubleshooting"    // Bug report, error log, resolution steps
  | "procedure"          // Standard Operating Procedure, playbook, maintenance guide
  | "quick_note"         // Quick note, scratchpad memo
  | "okf_document"       // Formatted technical document with OKF frontmatter
  | "raw_text";          // General raw text/snippet

export interface InputClassificationResult {
  classification: InputClassificationType;
  isWebLink: boolean;
  detectedUrl?: string;
  isExplicitKnowledge: boolean;
  confidence: number;
  reason: string;
  characteristics: {
    hasHttpPrefix: boolean;
    isGitHub: boolean;
    isArxiv: boolean;
    isRss: boolean;
    hasYamlFrontmatter: boolean;
    hasOkfVersionHeader: boolean;
    isMultiLine: boolean;
    length: number;
  };
}

/**
 * Step 1 Classifier: Ispeziona e categorizza l'input grezzo prima di qualsiasi operazione di storage.
 * Identifica in modo deterministico collegamenti web, repository, documenti OKF e note.
 */
export function classifyCaptureInput(input: string, explicitType?: ResourceType): InputClassificationResult {
  const trimmed = (input || "").trim();
  const lower = trimmed.toLowerCase();
  const isMultiLine = trimmed.includes("\n");
  const length = trimmed.length;

  const hasHttpPrefix = lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("www.");
  const urlRegex = /(?:https?:\/\/|www\.)[^\s]+/i;
  const urlMatch = trimmed.match(urlRegex);
  const domainPattern = /^(?:https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?$/i;
  const isDomainMatch = !urlMatch && domainPattern.test(trimmed) && !trimmed.includes(" ") && length < 350;
  const detectedUrl = urlMatch 
    ? (urlMatch[0].startsWith("www.") ? `https://${urlMatch[0]}` : urlMatch[0]) 
    : (isDomainMatch ? (trimmed.startsWith("http") ? trimmed : `https://${trimmed}`) : undefined);
  const effectiveHttpOrWeb = hasHttpPrefix || Boolean(detectedUrl) || isDomainMatch;

  const isGitHub = Boolean(lower.includes("github.com/"));
  const isArxiv = Boolean(lower.includes("arxiv.org/") || lower.includes("doi.org/") || lower.startsWith("paper:"));
  const isRss = Boolean(
    lower.endsWith(".xml") ||
    lower.includes("/feed") ||
    lower.includes("/rss") ||
    lower.startsWith("rss:") ||
    lower.includes("<rss") ||
    lower.includes("<feed")
  );
  const hasYamlFrontmatter = Boolean(trimmed.match(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---/));
  const hasOkfVersionHeader = Boolean(hasYamlFrontmatter && (lower.includes("okf_version") || lower.includes("okfversion")));

  const isExplicitKnowledge = explicitType === "knowledge";

  // Priorità 1: Paper Accademico / ArXiv
  if (isArxiv || explicitType === "paper") {
    return {
      classification: "scientific_paper",
      isWebLink: Boolean(detectedUrl || hasHttpPrefix),
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.95,
      reason: "Identificato paper scientifico o pre-print accademico (arXiv/DOI)",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 2: Repository GitHub
  if (isGitHub && explicitType !== "mcp_server" && explicitType !== "knowledge") {
    return {
      classification: "github_repo",
      isWebLink: true,
      detectedUrl: detectedUrl || (trimmed.match(/github\.com\/[^\s]+/i) ? `https://${trimmed.match(/github\.com\/[^\s]+/i)![0]}` : undefined),
      isExplicitKnowledge,
      confidence: 0.95,
      reason: "Identificato URL repository GitHub open-source",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 3: Feed RSS / Syndication
  if (isRss || explicitType === "rss") {
    return {
      classification: "rss_feed",
      isWebLink: Boolean(detectedUrl || hasHttpPrefix),
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.9,
      reason: "Identificato feed di syndication RSS / Atom",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 4: Collegamento Web Standard (URL o dominio web senza frontmatter)
  const isPureUrl = (effectiveHttpOrWeb || Boolean(detectedUrl)) && !isMultiLine && length < 350;
  const isWebUrlDominant = (effectiveHttpOrWeb || Boolean(detectedUrl)) && !hasYamlFrontmatter && !trimmed.startsWith("#") && length < 450;

  if ((isPureUrl || isWebUrlDominant || explicitType === "link" || explicitType === "article") && !hasYamlFrontmatter) {
    return {
      classification: "web_link",
      isWebLink: true,
      detectedUrl: detectedUrl || (hasHttpPrefix ? trimmed : undefined),
      isExplicitKnowledge,
      confidence: 0.92,
      reason: "Identificato collegamento web esterno (URL standard)",
      characteristics: { hasHttpPrefix: effectiveHttpOrWeb, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 4b: Comando cURL o richiesta HTTP da terminale -> mcp_server / Tool Specification
  const isCurlCommand = trimmed.startsWith("curl ") || trimmed.startsWith("curl\n") || lower.includes("curl -x") || lower.includes("curl -h") || lower.includes("curl --request");
  if (isCurlCommand && explicitType !== "knowledge") {
    return {
      classification: "mcp_server",
      isWebLink: false,
      detectedUrl: detectedUrl || trimmed.match(/https?:\/\/[^\s"']+/i)?.[0],
      isExplicitKnowledge,
      confidence: 0.92,
      reason: "Rilevato comando cURL per invocazione endpoint API / Tool",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 5: Configurazione MCP Server
  if (lower.includes("mcpservers") || lower.includes("claude_desktop_config") || lower.startsWith("mcp:") || explicitType === "mcp_server") {
    return {
      classification: "mcp_server",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.9,
      reason: "Identificata configurazione Model Context Protocol (MCP)",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 6: AI Skill Prompt
  if (lower.includes("system prompt") || lower.includes("you are a") || lower.startsWith("skill:") || explicitType === "ai_skill") {
    return {
      classification: "ai_skill",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.88,
      reason: "Identificato prompt di sistema o skill per agenti AI",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 7: Troubleshooting Diagnostics & Crash Dump Stack Traces
  const isStackTrace = 
    lower.includes("traceback (most recent call last):") ||
    lower.includes("exception in thread") ||
    (lower.includes("error:") && lower.includes("at ")) ||
    lower.includes("fatal error:") ||
    lower.includes("panic:") ||
    lower.includes("nullpointerexception") ||
    lower.includes("error response from daemon:") ||
    lower.includes("segmentation fault") ||
    lower.includes("econnrefused") ||
    lower.includes("syntaxerror:") ||
    lower.includes("typeerror:") ||
    lower.includes("uncaught exception");

  if (
    explicitType === "troubleshooting" ||
    isStackTrace ||
    (lower.includes("problema") && (lower.includes("soluzione") || lower.includes("fix") || lower.includes("risoluzione"))) ||
    lower.includes("root cause") ||
    lower.includes("causa:") ||
    (lower.includes("errore") && lower.includes(".dll"))
  ) {
    return {
      classification: "troubleshooting",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: isStackTrace ? 0.96 : 0.88,
      reason: isStackTrace 
        ? "Rilevato stack trace o crash dump di sistema (Auto-Diagnostica)" 
        : "Identificato log diagnostico o procedura di troubleshooting",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 7b: Procedura / Playbook / SOP
  if (
    explicitType === "procedure" ||
    lower.startsWith("procedura:") ||
    lower.startsWith("playbook:") ||
    lower.startsWith("sop:") ||
    lower.includes("procedura operativa standard") ||
    lower.includes("procedura operativa") ||
    lower.includes("(sop)") ||
    (lower.includes("procedura") && (lower.includes("passo") || lower.includes("step") || lower.includes("manutenzione") || lower.includes("onboarding") || lower.includes("installazione") || lower.includes("assistenza")))
  ) {
    return {
      classification: "procedure",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.92,
      reason: "Identificata procedura operativa standard, playbook o guida di assistenza",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 8: Nota Rapida
  if (lower.startsWith("nota:") || lower.startsWith("note:") || lower.startsWith("memo:") || lower.startsWith("scratchpad:") || explicitType === "note") {
    return {
      classification: "quick_note",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.85,
      reason: "Identificata nota rapida o appunto di lavoro",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 9: Documento Tecnico OKF v0.2
  if (hasYamlFrontmatter || hasOkfVersionHeader || isExplicitKnowledge || (trimmed.startsWith("#") && isMultiLine && length > 250)) {
    return {
      classification: "okf_document",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: hasYamlFrontmatter ? 0.98 : 0.75,
      reason: hasYamlFrontmatter ? "Identificato documento tecnico strutturato con YAML frontmatter OKF" : "Documento di conoscenza tecnica esteso",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Default: Snippet testuale generico
  return {
    classification: "raw_text",
    isWebLink: Boolean(detectedUrl && length < 150),
    detectedUrl,
    isExplicitKnowledge,
    confidence: 0.6,
    reason: "Snippet testuale grezzo generico",
    characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
  };
}

export interface EnforcedOKFValidationResult {
  isValidOKF: boolean;
  status: 'draft' | 'stable' | 'active';
  isDraft: boolean;
  draftReason?: string;
  isUncategorized: boolean;
  uncategorized: boolean;
  schemaCompliance: 'okf_v0.2_compliant' | 'draft_pending_validation' | 'uncategorized';
  missingMandatoryFields: string[];
  failureReasons: string[];
  primaryFailureReason?: string;
  enforcedTitle: string;
  enforcedSummary: string;
  enforcedTags: string[];
  enforcedDomain: string;
  enforcedDocType: string;
  enforcedMetadata: ResourceMetadata;
  enforcedMarkdownContent: string;
}

/**
 * SCHEMA VALIDATION LAYER (OKF v0.2)
 * Applica una validazione deterministica e rigorosa della struttura OKF v0.2.
 * Se una risorsa non soddisfa tutti i campi obbligatori dell'ontologia,
 * la reindirizza automaticamente allo stato 'Draft' (Bozza) o la contrassegna
 * come 'Uncategorized' (Non categorizzato), preservando integralmente i dati
 * e prevenendo qualsiasi conversione fallita o perdita di informazioni.
 */
export function enforceOKFSchemaValidation(candidate: {
  title?: string;
  summary?: string;
  tags?: string[];
  rawContent?: string;
  markdownContent?: string;
  metadata?: ResourceMetadata;
  resourceType?: ResourceType | string;
  sourceFileName?: string;
}): EnforcedOKFValidationResult {
  const content = candidate.markdownContent || candidate.metadata?.markdownContent || candidate.rawContent || "";
  const baseValidation = validateOKFDocumentSchema(content, candidate.metadata, candidate.resourceType);

  const parsedDoc = baseValidation.parsedDocument || parseOKFDocument(content, candidate.title || "Documento Tecnico");
  const effectiveMeta: ResourceMetadata = {
    ...(candidate.metadata || {}),
  };

  const missingMandatoryFields: string[] = [];

  // 1. okf_version: "0.2"
  const okfVersion = effectiveMeta.okfVersion || (effectiveMeta as any).okf_version || parsedDoc.okfVersion;
  const hasOkfVersion = Boolean(okfVersion && String(okfVersion).includes("0.2"));
  if (!hasOkfVersion) {
    missingMandatoryFields.push('okf_version: "0.2"');
  }

  // 2. title: non vuoto e non generico
  const rawTitle = (candidate.title || (effectiveMeta as any).title || parsedDoc.title || candidate.sourceFileName || "").trim();
  const isGenericTitle = !rawTitle || rawTitle === "Documento Tecnico" || rawTitle === "Nuova Risorsa" || rawTitle.startsWith("http");
  if (isGenericTitle) {
    missingMandatoryFields.push("titolo specifico e non vuoto");
  }

  // 3. docType: deve appartenere a VALID_OKF_DOC_TYPES
  const rawDocType = effectiveMeta.docType || (effectiveMeta as any).type || parsedDoc.docType || "";
  const isValidDocType = Boolean(rawDocType && VALID_OKF_DOC_TYPES.includes(rawDocType as any));
  if (!isValidDocType) {
    missingMandatoryFields.push(`tipo documento consentito (${VALID_OKF_DOC_TYPES.join(", ")})`);
  }

  // 4. domain: dominio applicativo non vuoto e non generico
  const rawDomain = (effectiveMeta.domain || parsedDoc.domain || "").trim();
  const isGenericDomain = !rawDomain || ["generale", "general", "sconosciuto", "unknown", "uncategorized", "default"].includes(rawDomain.toLowerCase());
  if (isGenericDomain) {
    missingMandatoryFields.push("dominio semantico qualificato");
  }

  // 5. tags: array con almeno 1 tag
  const rawTags: (string | number)[] = Array.isArray(candidate.tags) && candidate.tags.length > 0 
    ? candidate.tags 
    : (Array.isArray((effectiveMeta as any).tags) && (effectiveMeta as any).tags.length > 0 ? (effectiveMeta as any).tags : parsedDoc.tags || []);
  if (!Array.isArray(rawTags) || rawTags.length === 0) {
    missingMandatoryFields.push("tag descrittivi (almeno 1)");
  }

  // 6. entities: array con almeno 1 entità ontologica strutturata
  const rawEntities = effectiveMeta.entities || parsedDoc.entities || [];
  if (!Array.isArray(rawEntities) || rawEntities.length === 0) {
    missingMandatoryFields.push("entità ontologiche nel grafo (entities)");
  }

  // 7. relations: array valido di relazioni
  const rawRelations = effectiveMeta.relations || parsedDoc.relations || [];
  if (!Array.isArray(rawRelations)) {
    missingMandatoryFields.push("relazioni ontologiche (relations in formato array)");
  }

  // 8. frontmatter YAML e corpo markdown
  const hasFrontmatter = Boolean(parsedDoc.hasFrontmatter || content.startsWith("---"));
  if (!hasFrontmatter) {
    missingMandatoryFields.push("blocco YAML frontmatter delimitato da '---'");
  }
  const bodyText = (parsedDoc.bodyMarkdown || content.replace(/^---[\s\S]*?---\n*/, "") || "").trim();
  if (bodyText.length < 40) {
    missingMandatoryFields.push("corpo del testo documentale (minimo 40 caratteri)");
  }

  const isValidOKF = baseValidation.isValidOKF && missingMandatoryFields.length === 0;

  if (isValidOKF) {
    const enforcedTitle = rawTitle;
    const enforcedDomain = rawDomain;
    const enforcedDocType = rawDocType;
    const enforcedTags: string[] = Array.from(new Set([...rawTags.map(String), "okf-v0.2"]));
    const enforcedSummary = candidate.summary || (effectiveMeta as any).summary || `Specifiche tecniche validate OKF v0.2: ${enforcedTitle}`;
    
    return {
      isValidOKF: true,
      status: (effectiveMeta.status as any) || "stable",
      isDraft: false,
      isUncategorized: false,
      uncategorized: false,
      schemaCompliance: "okf_v0.2_compliant",
      missingMandatoryFields: [],
      failureReasons: [],
      enforcedTitle,
      enforcedSummary,
      enforcedTags,
      enforcedDomain,
      enforcedDocType,
      enforcedMarkdownContent: content,
      enforcedMetadata: {
        ...effectiveMeta,
        okfVersion: "0.2",
        status: (effectiveMeta.status as any) || "stable",
        isDraft: false,
        isUncategorized: false,
        uncategorized: false,
        domain: enforcedDomain,
        docType: enforcedDocType,
        okfValidationPassed: true,
        okfValidationWarnings: [],
        schemaCompliance: "okf_v0.2_compliant",
        entities: rawEntities,
        relations: rawRelations,
        markdownContent: content,
      },
    };
  }

  // ==========================================================================
  // RIDIREZIONE AUTOMATICA A STATO 'DRAFT' / 'UNCATEGORIZED'
  // Previene il fallimento della conversione o la perdita di dati.
  // ==========================================================================
  const isUncategorized = isGenericDomain || !isValidDocType;
  const enforcedTitle = (!isGenericTitle && rawTitle)
    ? rawTitle 
    : (candidate.sourceFileName?.replace(/\.[^/.]+$/, "") || "Bozza Tecnica Senza Titolo");

  const enforcedDomain = isGenericDomain ? "Uncategorized" : rawDomain;
  const enforcedDocType = isValidDocType ? rawDocType : "concept";

  const draftReason = `Validazione Schema OKF v0.2 incompleta. Reindirizzato automaticamente allo stato di Bozza (Draft) per preservare integralmente i dati: ${missingMandatoryFields.join(", ")}.`;

  // Sanitizzazione tag bozza
  const draftTags = new Set<string>(rawTags.map(String));
  draftTags.add("draft");
  if (isUncategorized) {
    draftTags.add("uncategorized");
  }
  const enforcedTags: string[] = Array.from(draftTags);

  const enforcedSummary = candidate.summary || 
    `Bozza archiviata nel Knowledge Vault. Reindirizzato automaticamente dal Validatore Schema per preservare tutti i contenuti estratti in attesa di completamento dei campi OKF.`;

  // Generazione o aggiornamento frontmatter per garantire che markdown e lettori visualizzino il documento correttamente
  let enforcedMarkdownContent = content;
  if (!hasFrontmatter) {
    enforcedMarkdownContent = `---\nokf_version: "0.2"\ntitle: "${enforcedTitle}"\ntype: "${enforcedDocType}"\nstatus: "draft"\ndomain: "${enforcedDomain}"\ntags: ${JSON.stringify(enforcedTags)}\nentities:\n  - name: "${enforcedTitle}"\n    type: "concept"\n    description: "Bozza creata in attesa di classificazione ontologica"\nrelations: []\n---\n\n# ${enforcedTitle}\n\n> **Nota del Validatore Schema**: *Questo documento è stato preservato in stato Bozza (Draft) poiché mancano alcuni campi obbligatori OKF v0.2 (${missingMandatoryFields.join(", ")}).*\n\n---\n\n${bodyText || content || enforcedSummary}\n`;
  } else {
    if (enforcedMarkdownContent.includes("status:")) {
      enforcedMarkdownContent = enforcedMarkdownContent.replace(/status:\s*["']?[a-zA-Z0-9_-]+["']?/, 'status: "draft"');
    } else {
      enforcedMarkdownContent = enforcedMarkdownContent.replace(/^---\s*[\r\n]+/, '---\nstatus: "draft"\n');
    }
  }

  const failureReasons = [
    ...baseValidation.failureReasons,
    ...missingMandatoryFields.map((f) => `Campo obbligatorio non conforme: ${f}`)
  ];

  const enforcedMetadata: ResourceMetadata = {
    ...effectiveMeta,
    okfVersion: "0.2",
    status: "draft",
    isDraft: true,
    draftReason,
    isUncategorized,
    uncategorized: isUncategorized,
    domain: enforcedDomain,
    docType: enforcedDocType,
    okfValidationPassed: false,
    okfValidationWarnings: missingMandatoryFields.map((f) => `Campo mancante: ${f}`),
    schemaCompliance: isUncategorized ? "uncategorized" : "draft_pending_validation",
    entities: rawEntities.length > 0 ? rawEntities : [{ name: enforcedTitle, type: "concept", description: "Bozza in attesa di ontologia" }],
    relations: rawRelations,
    markdownContent: enforcedMarkdownContent,
  };

  return {
    isValidOKF: false,
    status: "draft",
    isDraft: true,
    draftReason,
    isUncategorized,
    uncategorized: isUncategorized,
    schemaCompliance: isUncategorized ? "uncategorized" : "draft_pending_validation",
    missingMandatoryFields,
    failureReasons,
    primaryFailureReason: missingMandatoryFields[0] ? `Manca: ${missingMandatoryFields[0]}` : baseValidation.primaryFailureReason,
    enforcedTitle,
    enforcedSummary,
    enforcedTags,
    enforcedDomain,
    enforcedDocType,
    enforcedMetadata,
    enforcedMarkdownContent,
  };
}

interface UseVaultCaptureProps {
  user: User | null;
  quotaExceeded: boolean;
  setQuotaExceeded: (val: boolean) => void;
  addLog: (level: DiagnosticLog["level"], category: DiagnosticLog["category"], message: string, details?: any) => void;
  setStatusMessage: (msg: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  resources: ResourceItem[];
  setResources: React.Dispatch<React.SetStateAction<ResourceItem[]>>;
  setSelectedKnowledgeForReader: (item: ResourceItem) => void;
  currentCategory: string;
  setCurrentCategory: (cat: any) => void;
  selectedTag?: string | null;
  setSelectedTag: (tag: string | null) => void;
  searchQuery?: string;
  setSearchQuery: (q: string) => void;
  handleManualAdd?: (newResource: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<boolean>;
}

export function useVaultCapture({
  user,
  quotaExceeded,
  setQuotaExceeded,
  addLog,
  setStatusMessage,
  setErrorMessage,
  resources,
  setResources,
  setSelectedKnowledgeForReader,
  currentCategory,
  setCurrentCategory,
  selectedTag = null,
  setSelectedTag,
  searchQuery = "",
  setSearchQuery,
  handleManualAdd,
}: UseVaultCaptureProps) {
  const [rawFiles, setRawFiles] = useState<RawFileItem[]>(() => {
    const cached = loadLocalRawFiles();
    return cached || [];
  });
  const [isLoadingRawFiles, setIsLoadingRawFiles] = useState(false);
  const [isConvertingRawFileId, setIsConvertingRawFileId] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [captureStage, setCaptureStage] = useState<CaptureStage>("idle");
  const [captureStageMessage, setCaptureStageMessage] = useState<string>("");
  const [transformationCategory, setTransformationCategory] = useState<TransformationCategory | null>(null);

  const wasQuotaExceededRef = useRef<boolean>(quotaExceeded);
  useEffect(() => {
    wasQuotaExceededRef.current = quotaExceeded;
  }, [quotaExceeded]);

  // Initial load of raw files from IndexedDB
  useEffect(() => {
    async function loadIdbFiles() {
      try {
        const idbFiles = await loadRawFilesFromIndexedDB();
        if (idbFiles && idbFiles.length > 0) {
          setRawFiles((prev) => (idbFiles.length >= prev.length ? idbFiles : prev));
        }
      } catch (err) {
        console.warn("Could not load raw files from IndexedDB:", err);
      }
    }
    loadIdbFiles();
  }, []);

  // Realtime listener for User's Staged / Raw Files Buffer
  useEffect(() => {
    if (!user) {
      setRawFiles([]);
      setIsLoadingRawFiles(false);
      return;
    }

    if (quotaExceeded) {
      setIsLoadingRawFiles(false);
      const cachedRaw = loadLocalRawFiles(user.uid);
      if (cachedRaw) {
        setRawFiles(cachedRaw);
      }
      return;
    }

    setIsLoadingRawFiles(true);
    addLog("info", "FIRESTORE", `Sottoscrizione alla collezione 'raw_files' per UID: ${user.uid}`);

    const rawFilesRef = collection(db, "raw_files");
    const q = query(rawFilesRef, where("userId", "==", user.uid));

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: RawFileItem[] = [];
          snapshot.forEach((docSnap) => {
            const rawData = docSnap.data() as Omit<RawFileItem, "id">;
            items.push({
              id: docSnap.id,
              ...rawData,
              createdAt: rawData.createdAt ? parseDate(rawData.createdAt) || new Date() : new Date(),
              updatedAt: rawData.updatedAt ? parseDate(rawData.updatedAt) || new Date() : new Date(),
            });
          });

          items.sort((a, b) => {
            const timeA = getTimestampMillis(a.createdAt);
            const timeB = getTimestampMillis(b.createdAt);
            return timeB - timeA;
          });

          setRawFiles(items);
          saveLocalRawFiles(items, user.uid);
          setIsLoadingRawFiles(false);
          addLog("info", "FIRESTORE", `Sincronizzati ${items.length} file grezzi nel buffer.`);
        },
        (error) => {
          console.warn("Firestore raw_files snapshot notice:", error?.message || error);
          if (isQuotaError(error)) {
            setQuotaExceeded(true);
            const cachedRaw = loadLocalRawFiles(user?.uid);
            if (cachedRaw) {
              setRawFiles(cachedRaw);
            }
          } else {
            addLog("error", "FIRESTORE", `Errore sincronizzazione raw_files: ${error.message}`, error);
          }
          setIsLoadingRawFiles(false);
        }
      );
    } catch (err: any) {
      console.warn("Raw files snapshot setup error:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
      }
      setIsLoadingRawFiles(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, quotaExceeded]);

  // Helper to trace and isolate why resources might not be visible in the current UI view
  const checkAndLogFilterVisibility = (
    savedResource: ResourceItem,
    correlationId: string,
    actionContext: string
  ) => {
    const activeCategory = currentCategory;
    const activeTag = selectedTag;
    const activeSearch = searchQuery.trim();

    const matchesCategory = activeCategory === "all" || activeCategory === savedResource.type;
    const itemTags = (savedResource.tags || []).map((t) => String(t).toLowerCase());
    const matchesTag = !activeTag || itemTags.includes(activeTag.toLowerCase());
    const matchesSearch = !activeSearch ||
      savedResource.title.toLowerCase().includes(activeSearch.toLowerCase()) ||
      savedResource.summary.toLowerCase().includes(activeSearch.toLowerCase());

    const isVisible = matchesCategory && matchesTag && matchesSearch;

    if (!isVisible) {
      const hiddenReasons: string[] = [];
      if (!matchesCategory) {
        hiddenReasons.push(`Filtro categoria: vista "${activeCategory}" vs tipo risorsa "${savedResource.type}"`);
      }
      if (!matchesTag) {
        hiddenReasons.push(`Filtro tag: tag attivo "#${activeTag}" assente nei tag risorsa ([${itemTags.join(", ")}])`);
      }
      if (!matchesSearch) {
        hiddenReasons.push(`Filtro ricerca: query "${activeSearch}" non trovata nel testo`);
      }

      recordLifecycleEvent({
        stage: "FILTER_DISCREPANCY_CHECK",
        resourceId: savedResource.id,
        resourceTitle: savedResource.title,
        resourceType: savedResource.type,
        status: "warn",
        message: `[${actionContext} ${correlationId}] DISCREPANZA CONTEGGIO: Risorsa "${savedResource.title}" salvata con successo ma NASCOSTA dalla vista attuale!`,
        details: {
          correlationId,
          resourceId: savedResource.id,
          resourceTitle: savedResource.title,
          resourceType: savedResource.type,
          activeCategory,
          activeTag,
          activeSearch,
          hiddenReasons,
          totalVaultResources: resources.length,
          advice: `Reimposta la categoria su "all" o azzera i filtri per vedere questa risorsa.`,
        },
      });

      addLog(
        "warn",
        "LIFECYCLE",
        `Discrepanza di visualizzazione [${correlationId}]: "${savedResource.title}" salvata ma nascosta nella vista "${activeCategory}" (${hiddenReasons.join(" | ")}).`
      );
    } else {
      recordLifecycleEvent({
        stage: "FILTER_DISCREPANCY_CHECK",
        resourceId: savedResource.id,
        resourceTitle: savedResource.title,
        resourceType: savedResource.type,
        status: "info",
        message: `[${actionContext} ${correlationId}] Risorsa "${savedResource.title}" visibile correttamente nella vista attuale (${activeCategory}).`,
        details: {
          correlationId,
          resourceId: savedResource.id,
          activeCategory,
          activeTag,
          activeSearch,
          isVisible: true,
        },
      });
    }
  };

  // Upload Raw File with Firestore Staging & Chunking
  const handleUploadRawFile = async (file: File, notes?: string): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
      } catch (authErr: any) {
        addLog("error", "AUTH", "Autenticazione richiesta per caricare file.");
        setErrorMessage("Errore di autenticazione.");
        return false;
      }
    }

    const uploadSessionId = "raw-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const initialRawCount = rawFiles.length;

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isAudio = (file.type && file.type.startsWith("audio/")) || ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm", "wma", "aiff"].includes(ext);
    const isPdf = ext === "pdf" || (file.type && file.type.includes("pdf"));
    const isImage = (file.type && file.type.startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
    const isTextType = !isAudio && !isPdf && !isImage && (["txt", "md", "markdown", "json", "yaml", "yml", "csv", "log", "ts", "js", "py", "rs", "go", "xml", "toml", "sql", "sh"].includes(ext) || (file.type && file.type.startsWith("text/")));
    
    let textContent = "";
    let base64Data = "";
    let resolvedMime = file.type || (isPdf ? "application/pdf" : isImage ? `image/${ext === "jpg" ? "jpeg" : ext}` : "application/octet-stream");
    let previewText = "";

    try {
      recordLifecycleEvent({
        stage: "CAPTURE_INITIATED",
        resourceTitle: file.name,
        resourceType: file.type || "raw_file",
        status: "info",
        message: `[Upload File Grezzo ${uploadSessionId}] Avvio caricamento per "${file.name}" (${(file.size / 1024).toFixed(1)} KB, buffer attuale: ${initialRawCount} file)`,
        details: {
          uploadSessionId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          notesLength: notes?.length || 0,
          initialRawFilesCount: initialRawCount,
          userId: activeUser.uid,
        },
      });

      addLog("info", "CAPTURE", `[${uploadSessionId}] Avvio acquisizione file grezzo: "${file.name}" (${(file.size / 1024).toFixed(1)} KB, raw buffer: ${initialRawCount})`);

      if (isTextType) {
        try {
          textContent = await readFileAsText(file);
        } catch {
          base64Data = await readFileAsBase64(file);
        }
      } else {
        base64Data = await readFileAsBase64(file);
      }

      const CHUNK_SIZE = 300 * 1024;
      const dataPayload = base64Data || textContent;
      const needsChunking = dataPayload.length > CHUNK_SIZE;
      const totalChunks = needsChunking ? Math.ceil(dataPayload.length / CHUNK_SIZE) : 1;

      if (!resolvedMime || resolvedMime === "application/octet-stream") {
        if (ext === "mp3") resolvedMime = "audio/mpeg";
        else if (ext === "wav") resolvedMime = "audio/wav";
        else if (ext === "ogg") resolvedMime = "audio/ogg";
        else if (ext === "m4a") resolvedMime = "audio/mp4";
        else if (ext === "pdf") resolvedMime = "application/pdf";
        else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) resolvedMime = `image/${ext === "jpg" ? "jpeg" : ext}`;
        else resolvedMime = "application/octet-stream";
      }

      if (isTextType) {
        previewText = textContent.slice(0, 3000);
      } else if (isAudio) {
        previewText = `[File Audio: ${file.name} - ${(file.size / 1024).toFixed(1)} KB - Formato: ${ext.toUpperCase() || "AUDIO"}]`;
      } else if (isPdf) {
        previewText = `[Documento PDF: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]`;
      } else if (isImage) {
        previewText = `[Immagine: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]`;
      } else {
        previewText = `[File Binario: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]`;
      }

      recordLifecycleEvent({
        stage: "DATA_TRANSFORMATION",
        resourceTitle: file.name,
        resourceType: isAudio ? "audio" : ext || "document",
        status: "info",
        message: `[File Grezzo ${uploadSessionId}] Trasformazione completata: MIME "${resolvedMime}", chunking=${needsChunking} (${totalChunks} blocchi, ${dataPayload.length} bytes)`,
        details: {
          uploadSessionId,
          resolvedMime,
          isTextType,
          isAudio,
          isPdf,
          isImage,
          needsChunking,
          totalChunks,
          payloadLengthBytes: dataPayload.length,
        },
      });

      if (quotaExceeded) {
        const localId = "local-file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localFile: RawFileItem = {
          id: localId,
          userId: activeUser.uid,
          fileName: file.name,
          fileSize: file.size,
          fileType: isAudio ? "audio" : ext || "document",
          mimeType: resolvedMime,
          status: "raw",
          contentPreview: previewText,
          notes: notes || "",
          hasChunks: false,
          totalChunks: 1,
          textContent: textContent || undefined,
          base64Data: base64Data || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        let rawCountBefore = 0;
        let rawCountAfter = 0;
        setRawFiles((prev) => {
          rawCountBefore = prev.length;
          const updated = [localFile, ...prev];
          rawCountAfter = updated.length;
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "RAW_FILE_STAGED",
          resourceId: localId,
          resourceTitle: file.name,
          resourceType: isAudio ? "audio" : ext || "document",
          status: "info",
          message: `[File Grezzo ${uploadSessionId}] Archiviato in memoria locale con ID "${localId}" (buffer raw: ${rawCountBefore} -> ${rawCountAfter})`,
          details: {
            uploadSessionId,
            fileId: localId,
            storageType: "localStorage",
            rawCountBefore,
            rawCountAfter,
            delta: rawCountAfter - rawCountBefore,
          },
        });

        addLog("info", "CAPTURE", `[${uploadSessionId}] File "${file.name}" archiviato nel buffer locale (ID: ${localId}, count: ${rawCountBefore} -> ${rawCountAfter}).`);
        setStatusMessage(`File "${file.name}" archiviato nel Vault!`);
        setTimeout(() => setStatusMessage(null), 3500);
        return true;
      }

      const rawFileDocData: Record<string, any> = {
        userId: activeUser.uid,
        fileName: file.name,
        fileSize: file.size,
        fileType: isAudio ? "audio" : ext || "document",
        mimeType: resolvedMime,
        status: "raw",
        contentPreview: previewText,
        notes: notes || "",
        hasChunks: needsChunking,
        totalChunks,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (!needsChunking) {
        if (textContent) rawFileDocData.textContent = textContent;
        if (base64Data) rawFileDocData.base64Data = base64Data;
      }

      const sanitized = sanitizeForFirestore(rawFileDocData);
      const writeStart = Date.now();
      const docRef = await withFirestoreTimeout(addDoc(collection(db, "raw_files"), sanitized), 20000);
      const writeDuration = Date.now() - writeStart;

      if (needsChunking) {
        addLog("info", "FIRESTORE", `[${uploadSessionId}] Frammentazione file (${totalChunks} blocchi)...`);
        for (let i = 0; i < totalChunks; i++) {
          const chunkData = dataPayload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await withFirestoreTimeout(setDoc(doc(db, "raw_files", docRef.id, "chunks", `chunk_${i}`), {
            index: i,
            data: chunkData,
            createdAt: serverTimestamp(),
          }), 20000);
        }
      }

      recordLifecycleEvent({
        stage: "RAW_FILE_STAGED",
        resourceId: docRef.id,
        resourceTitle: file.name,
        resourceType: isAudio ? "audio" : ext || "document",
        status: "success",
        message: `[File Grezzo ${uploadSessionId}] Archiviato con successo in Firestore collection 'raw_files' (ID: "${docRef.id}", durata: ${writeDuration}ms)`,
        details: {
          uploadSessionId,
          docId: docRef.id,
          storageType: "firestore",
          writeDurationMs: writeDuration,
          hasChunks: needsChunking,
          totalChunks,
          initialRawCount,
          targetRawCount: initialRawCount + 1,
        },
      });

      addLog("success", "CAPTURE", `[${uploadSessionId}] File "${file.name}" archiviato con successo nel buffer (ID: ${docRef.id})`);
      setStatusMessage(`File "${file.name}" archiviato nel Vault!`);
      setTimeout(() => setStatusMessage(null), 3500);
      return true;
    } catch (err: any) {
      console.error("Upload raw file failed:", err);
      const isTimeoutOrQuota =
        isQuotaError(err) ||
        err?.message?.includes("timed out") ||
        err?.message?.includes("timeout") ||
        err?.code === "deadline-exceeded" ||
        err?.code === "unavailable";

      if (isTimeoutOrQuota) {
        if (isQuotaError(err)) setQuotaExceeded(true);
        const localId = "local-file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localFile: RawFileItem = {
          id: localId,
          userId: activeUser.uid,
          fileName: file.name,
          fileSize: file.size,
          fileType: isAudio ? "audio" : ext || "document",
          mimeType: resolvedMime || file.type || "application/octet-stream",
          status: "raw",
          contentPreview: previewText || `[File: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]`,
          notes: notes || "",
          hasChunks: false,
          totalChunks: 1,
          textContent: textContent || undefined,
          base64Data: base64Data || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        let rawCountBefore = 0;
        let rawCountAfter = 0;
        setRawFiles((prev) => {
          rawCountBefore = prev.length;
          const updated = [localFile, ...prev];
          rawCountAfter = updated.length;
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "RAW_FILE_STAGED",
          resourceId: localId,
          resourceTitle: file.name,
          resourceType: isAudio ? "audio" : ext || "document",
          status: "warn",
          message: `[File Grezzo ${uploadSessionId}] Salvato nel buffer locale (Firestore timeout/quota): "${localId}" (${rawCountBefore} -> ${rawCountAfter})`,
          details: {
            uploadSessionId,
            localId,
            rawCountBefore,
            rawCountAfter,
            error: err?.message,
          },
        });

        const isTimeout = err?.message?.includes("timed out") || err?.message?.includes("timeout");
        setStatusMessage(
          isTimeout
            ? `File "${file.name}" archiviato in memoria locale (timeout sincronizzazione Firestore)`
            : `File "${file.name}" archiviato nella memoria locale (Quota Firestore esaurita)`
        );
        setTimeout(() => setStatusMessage(null), 3500);
        return true;
      }
      addLog("error", "CAPTURE", `[${uploadSessionId}] Errore upload file "${file.name}": ${err.message}`, err);
      setErrorMessage(`Errore upload file: ${err.message || "Errore sconosciuto"}`);
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    }
  };

  // Helper to generate a lightweight thumbnail (<80KB) for image previews
  const generateCompressedThumbnail = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 800;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(e.target?.result as string);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Direct Intelligent Ingestion of Files (PDF, Image, Text, Logs) with Multimodal AI
  const handleCaptureFile = async (
    file: File,
    explicitType?: ResourceType,
    notes?: string,
    onStageUpdate?: (stage: CaptureStage, message?: string) => void,
    preferredModel?: GeminiModelId
  ): Promise<boolean> => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isAudio = (file.type && file.type.startsWith("audio/")) || ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm", "wma", "aiff"].includes(ext);
    const isPdf = ext === "pdf" || (file.type && file.type.includes("pdf"));
    const isImage = (file.type && file.type.startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
    const isJupyter = ext === "ipynb";
    const isZip = ext === "zip" || (file.type && file.type.includes("zip"));
    const isTextType = !isAudio && !isPdf && !isImage && !isZip;

    addLog("info", "CAPTURE", `Inizio acquisizione multimodale del file "${file.name}" (${(file.size / 1024).toFixed(1)} KB, categoria: ${explicitType || (isJupyter ? "jupyter" : "auto")})...`);

    setIsAnalyzing(true);
    setCaptureStage("sending");
    setCaptureStageMessage(`Caricamento file "${file.name}"...`);
    if (onStageUpdate) {
      onStageUpdate("sending", `Caricamento file "${file.name}"...`);
    }

    try {
      let textContent = "";
      let base64Data = "";

      if (isTextType) {
        try {
          textContent = await readFileAsText(file);
        } catch {
          base64Data = await readFileAsBase64(file);
        }
      } else {
        base64Data = await readFileAsBase64(file);
      }

      const stageMsg = explicitType === "troubleshooting"
        ? "Analisi multimodale dello screenshot/PDF (lettura errore, causa e passaggi risolutivi)..."
        : isZip
        ? "Decompressione archivio ZIP ed estrazione grafo [[wikilinks]] OKF v0.2..."
        : isImage
        ? "Ispezione visiva universale con Gemini (documenti didattici, cronologie, schemi, screenshot o note)..."
        : isJupyter
        ? "Estrazione celle di codice e markdown del Jupyter Notebook in guida OKF v0.2..."
        : "Analisi semantica e multimodale con Gemini Flash...";
      setCaptureStage("analyzing");
      setCaptureStageMessage(stageMsg);
      if (onStageUpdate) {
        onStageUpdate("analyzing", stageMsg);
      }

      const res = await fetch("/api/convert-file-to-okf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || (isPdf ? "application/pdf" : isImage ? "image/png" : "text/plain"),
          fileType: ext,
          explicitType: explicitType || undefined,
          base64Data,
          textContent,
          notes: notes || "",
          existingResources: resources.slice(0, 25).map((r) => ({ id: r.id, title: r.title, type: r.type, tags: r.tags || [] })),
          preferredModel: preferredModel || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Errore HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Risposta non valida dal motore di analisi multimodale.");
      }

      // Handle batch migration of archives (.zip with multiple markdown files & wikilinks)
      if (data.batch === true && Array.isArray(data.items) && data.items.length > 0) {
        setCaptureStage("saving");
        const saveMsg = `Archiviazione di ${data.items.length} documenti con topologia [[wikilinks]] migrati...`;
        setCaptureStageMessage(saveMsg);
        if (onStageUpdate) onStageUpdate("saving", saveMsg);

        let importedCount = 0;
        for (const item of data.items) {
          const itemPayload = {
            ...item,
            rawInput: `Archivio: ${file.name} -> ${item.filePath || item.title}`,
            metadata: {
              ...item.metadata,
              sourceFileName: file.name,
              sourceFileType: "zip_entry",
            },
          };
          if (handleManualAdd) {
            await handleManualAdd(itemPayload);
            importedCount++;
          }
        }

        setStatusMessage(`Migrati con successo ${importedCount} documenti da "${file.name}" (${data.wikilinksResolvedCount || 0} wikilink risolti).`);
        setTimeout(() => setStatusMessage(null), 4500);
        return true;
      }

      if (!data.resource) {
        throw new Error("Risposta non valida dal motore di analisi multimodale.");
      }

      setCaptureStage("transforming");
      setCaptureStageMessage("Validazione schema OKF v0.2...");
      if (onStageUpdate) {
        onStageUpdate("transforming", "Validazione schema OKF v0.2...");
      }

      // Preserve image preview if base64 fits safely in Firestore, or generate lightweight thumbnail
      let finalImageUrl = data.resource.metadata?.imageUrl;
      if (!finalImageUrl && isImage) {
        try {
          finalImageUrl = await generateCompressedThumbnail(file);
        } catch {
          if (base64Data && base64Data.length < 500 * 1024) {
            finalImageUrl = base64Data;
          }
        }
      }

      const resourcePayload = {
        ...data.resource,
        rawInput: `File: ${file.name}\n${notes ? `Note utente: ${notes}\n` : ""}\n${data.resource.summary || ""}`,
        metadata: {
          ...data.resource.metadata,
          mediaType: isImage ? "image" : isPdf ? "pdf" : (data.resource.metadata?.mediaType || undefined),
          imageUrl: finalImageUrl || data.resource.metadata?.imageUrl,
          ogImage: finalImageUrl || data.resource.metadata?.ogImage,
          sourceFileName: file.name,
        },
      };

      setCaptureStage("saving");
      setCaptureStageMessage("Archiviazione nel Vault...");
      if (onStageUpdate) {
        onStageUpdate("saving", "Archiviazione nel Vault...");
      }

      let success = false;
      if (handleManualAdd) {
        success = await handleManualAdd(resourcePayload);
      } else {
        const activeUid = user?.uid || auth.currentUser?.uid || "anon";
        const rawData = {
          userId: activeUid,
          type: resourcePayload.type,
          title: resourcePayload.title,
          url: resourcePayload.url ? resourcePayload.url.trim() : "",
          rawInput: resourcePayload.rawInput || "",
          summary: resourcePayload.summary,
          tags: resourcePayload.tags || [],
          isFavorite: false,
          metadata: resourcePayload.metadata || {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        try {
          const docRef = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)), 8000);
          const savedItem: ResourceItem = {
            id: docRef.id,
            ...rawData,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ResourceItem;
          setResources((prev) => [savedItem, ...prev.filter((r) => r.id !== docRef.id)]);
          saveLocalResources([savedItem, ...resources.filter((r) => r.id !== docRef.id)], activeUid);
          success = true;
        } catch {
          const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
          const localItem: ResourceItem = {
            id: localId,
            ...rawData,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ResourceItem;
          setResources((prev) => [localItem, ...prev]);
          saveLocalResources([localItem, ...resources], activeUid);
          success = true;
        }
      }
      if (success) {
        setCaptureStage("success");
        setCaptureStageMessage("Completato!");
        if (onStageUpdate) {
          onStageUpdate("success", "Completato!");
        }
        const typeLabel = resourcePayload.type === "troubleshooting"
          ? "Problema & Fix"
          : isImage
          ? `Screenshot (${resourcePayload.type})`
          : resourcePayload.type;
        setStatusMessage(`"${resourcePayload.title.slice(0, 35)}..." salvato come ${typeLabel} nel Vault!`);
        setTimeout(() => setStatusMessage(null), 4000);
        addLog("success", "CAPTURE", `File "${file.name}" elaborato e salvato come ${typeLabel}: "${resourcePayload.title}".`);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("handleCaptureFile error:", err);
      addLog("error", "CAPTURE", `Errore elaborazione file "${file.name}": ${err?.message}`);
      setErrorMessage(`Errore elaborazione file: ${err?.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => {
        setCaptureStage("idle");
        setCaptureStageMessage("");
      }, 3000);
    }
  };

  // Deep Document Refactoring & Side-by-Side Comparison Generator
  const handleRefactorDocument = async ({
    file,
    text,
    preferredModel,
  }: {
    file?: File;
    text?: string;
    preferredModel?: GeminiModelId;
  }): Promise<{ originalContent: string; resource: ResourceItem; fileName: string } | null> => {
    setIsAnalyzing(true);
    setCaptureStage("analyzing");
    setCaptureStageMessage("Analisi semantica e refactoring documentale in corso...");

    try {
      let textContent = text || "";
      let base64Data = "";
      const fileName = file?.name || "documento-bozza.md";
      const ext = file ? (file.name.split(".").pop()?.toLowerCase() || "") : "md";
      const isPdf = ext === "pdf" || (file?.type && file.type.includes("pdf"));
      const isImage = (file?.type && file.type.startsWith("image/")) || ["png", "jpg", "jpeg", "webp"].includes(ext);
      const isTextType = !isPdf && !isImage && file;

      if (isTextType && file) {
        try {
          textContent = await readFileAsText(file);
        } catch {
          base64Data = await readFileAsBase64(file);
        }
      } else if (file) {
        base64Data = await readFileAsBase64(file);
      }

      addLog("info", "CAPTURE", `Inizio refactoring documentale per "${fileName}" (${textContent.length || base64Data.length} caratteri)...`);

      const res = await fetch("/api/refactor-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          mimeType: file?.type || (isPdf ? "application/pdf" : isImage ? "image/png" : "text/plain"),
          fileType: ext,
          textContent,
          base64Data,
          existingResources: resources.slice(0, 25).map((r) => ({ id: r.id, title: r.title, type: r.type, tags: r.tags || [] })),
          preferredModel: preferredModel || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Errore HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.success || !data.resource) {
        throw new Error("Risposta non valida dal motore di refactoring documentale.");
      }

      setCaptureStage("transforming");
      setCaptureStageMessage("Generazione confronto Side-by-Side...");

      addLog("success", "CAPTURE", `Refactoring semantico completato per "${data.resource.title}".`);

      return {
        originalContent: data.originalContent || textContent,
        resource: {
          id: "refactored-" + Date.now(),
          userId: user?.uid || auth.currentUser?.uid || "anon",
          ...data.resource,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        fileName,
      };
    } catch (err: any) {
      console.error("handleRefactorDocument error:", err);
      addLog("error", "CAPTURE", `Errore refactoring documento: ${err?.message}`);
      setErrorMessage(`Errore refactoring documento: ${err?.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
      return null;
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => {
        setCaptureStage("idle");
        setCaptureStageMessage("");
      }, 1500);
    }
  };

  // Delete Raw File and any chunk subcollections
  const handleDeleteRawFile = async (fileId: string): Promise<boolean> => {
    const deleteSessionId = "del-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const rawCountBefore = rawFiles.length;

    try {
      addLog("info", "FIRESTORE", `[${deleteSessionId}] Eliminazione file grezzo ID: ${fileId} (raw buffer count: ${rawCountBefore})...`);
      
      let rawCountAfter = 0;
      setRawFiles((prev) => {
        const updated = prev.filter((f) => f.id !== fileId);
        rawCountAfter = updated.length;
        saveLocalRawFiles(updated, user?.uid);
        return updated;
      });

      if (!quotaExceeded && !fileId.startsWith("local-")) {
        try {
          const chunksRef = collection(db, "raw_files", fileId, "chunks");
          const chunkSnaps = await withFirestoreTimeout(getDocs(chunksRef), 3000);
          if (!chunkSnaps.empty) {
            const chunkBatch = writeBatch(db);
            chunkSnaps.forEach((cDoc) => chunkBatch.delete(cDoc.ref));
            await withFirestoreTimeout(chunkBatch.commit(), 3000);
          }
        } catch (chunkErr) {
          console.warn("Could not delete chunk subcollection (may not exist):", chunkErr);
        }

        await withFirestoreTimeout(deleteDoc(doc(db, "raw_files", fileId)), 3500);
      }

      recordLifecycleEvent({
        stage: "RAW_FILE_DELETED",
        resourceId: fileId,
        resourceTitle: `File Grezzo ${fileId}`,
        resourceType: "raw_file",
        status: "info",
        message: `[Eliminazione File ${deleteSessionId}] File grezzo eliminato con successo (buffer raw: ${rawCountBefore} -> ${rawCountAfter})`,
        details: {
          deleteSessionId,
          fileId,
          rawCountBefore,
          rawCountAfter,
          delta: rawCountAfter - rawCountBefore,
        },
      });

      addLog("success", "FIRESTORE", `[${deleteSessionId}] File grezzo eliminato con successo (ID: ${fileId}, conteggio: ${rawCountBefore} -> ${rawCountAfter})`);
      setStatusMessage("File eliminato dal buffer.");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    } catch (err: any) {
      console.error("Delete raw file error:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        setStatusMessage("File rimosso dalla memoria locale.");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }
      addLog("error", "FIRESTORE", `[${deleteSessionId}] Errore eliminazione file grezzo: ${err.message}`, err);
      setErrorMessage("Impossibile eliminare il file: " + err.message);
      setTimeout(() => setErrorMessage(null), 4000);
      return false;
    }
  };

  // Convert Staged Raw File to OKF v0.2 Knowledge Document via Gemini
  const handleConvertFileToOKF = async (file: RawFileItem): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) return false;

    const convSessionId = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const initialVaultCount = resources.length;
    const initialRawCount = rawFiles.length;

    try {
      setIsConvertingRawFileId(file.id);

      recordLifecycleEvent({
        stage: "RAW_FILE_CONVERSION",
        resourceId: file.id,
        resourceTitle: file.fileName,
        resourceType: "knowledge",
        status: "info",
        message: `[Conversione File ${convSessionId}] Avvio conversione OKF v0.2 per file grezzo "${file.fileName}" (buffer raw: ${initialRawCount}, vault: ${initialVaultCount} elementi)`,
        details: {
          convSessionId,
          fileId: file.id,
          fileName: file.fileName,
          fileSize: file.fileSize,
          fileType: file.fileType,
          mimeType: file.mimeType,
          hasChunks: file.hasChunks,
          totalChunks: file.totalChunks,
          initialVaultCount,
          initialRawCount,
          userId: activeUser.uid,
        },
      });

      addLog("info", "GEMINI_AI", `[${convSessionId}] Avvio conversione intelligente in standard OKF v0.2 per file: "${file.fileName}"...`);

      let reconstructedText = file.textContent || "";
      let reconstructedBase64 = file.base64Data || "";

      const lowerName = file.fileName.toLowerCase();
      const isAudio = (file.mimeType && file.mimeType.toLowerCase().startsWith("audio/")) ||
        ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm", "wma", "aiff"].some((ext) => lowerName.endsWith("." + ext)) ||
        file.fileType?.toLowerCase() === "audio";
      const isPdf = lowerName.endsWith(".pdf") || (file.mimeType && file.mimeType.toLowerCase().includes("pdf")) || file.fileType?.toLowerCase() === "pdf";
      const isImage = (file.mimeType && file.mimeType.toLowerCase().startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].some((ext) => lowerName.endsWith("." + ext));
      const isBinary = isAudio || isPdf || isImage || Boolean(file.base64Data);

      if (!quotaExceeded && !file.id.startsWith("local-")) {
        // If file might have chunks in subcollection, attempt to retrieve them
        if (file.hasChunks && file.totalChunks && file.totalChunks > 1) {
          addLog("info", "FIRESTORE", `[${convSessionId}] Recupero ${file.totalChunks} blocchi dal database...`);
          try {
            const chunksSnapshot = await getDocs(collection(db, "raw_files", file.id, "chunks"));
            const chunks: { index: number; data: string }[] = [];
            chunksSnapshot.forEach((cSnap) => {
              chunks.push(cSnap.data() as { index: number; data: string });
            });
            chunks.sort((a, b) => a.index - b.index);
            const fullData = chunks.map((c) => c.data).join("");

            if (isBinary) {
              reconstructedBase64 = fullData;
            } else {
              reconstructedText = fullData;
            }
          } catch (chunksErr) {
            console.warn("Could not load chunks from Firestore:", chunksErr);
          }
        }
      }

      if (isBinary && !reconstructedBase64 && file.base64Data) {
        reconstructedBase64 = file.base64Data;
      }

      let resPayload: any = null;
      const convStartTime = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch("/api/convert-file-to-okf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            fileName: file.fileName,
            fileType: isAudio ? "audio" : file.fileType,
            mimeType: file.mimeType,
            textContent: reconstructedText,
            base64Data: reconstructedBase64,
            notes: file.notes,
            existingResources: resources.map((r) => ({
              id: r.id,
              title: r.title,
              type: r.type,
              tags: r.tags,
            })),
          }),
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          resPayload = data.resource;

          if (resPayload && resPayload.title) {
            const durationMs = Date.now() - convStartTime;
            recordLifecycleEvent({
              stage: "AI_ANALYSIS_SUCCESS",
              resourceTitle: resPayload.title,
              resourceType: "knowledge",
              status: "info",
              message: `[Conversione File ${convSessionId}] AI ha analizzato e convertito "${file.fileName}" in ${durationMs}ms: "${resPayload.title}"`,
              details: {
                convSessionId,
                durationMs,
                docType: resPayload.metadata?.docType,
                domain: resPayload.metadata?.domain,
                entitiesCount: resPayload.metadata?.entities?.length || 0,
                relationsCount: resPayload.metadata?.relations?.length || 0,
                tags: resPayload.tags,
              },
            });
          }
        }
      } catch (netErr: any) {
        console.warn("[File Conversion] Network/Gemini API error, applying local fallback:", netErr?.message);
        addLog("warn", "GEMINI_AI", `[${convSessionId}] Fallback locale applicato per file "${file.fileName}": ${netErr?.message || "timeout"}`);
        recordLifecycleEvent({
          stage: "AI_ANALYSIS_FALLBACK",
          resourceTitle: file.fileName,
          resourceType: "knowledge",
          status: "warn",
          message: `[Conversione File ${convSessionId}] API conversione non disponibile (${netErr?.message || "timeout"}), attivazione parser OKF euristico locale`,
          details: { convSessionId, error: netErr?.message },
        });
      }

      if (!resPayload || !resPayload.title) {
        const cleanName = file.fileName.replace(/\.[^/.]+$/, "");
        const fallbackText = reconstructedText || file.notes || `Contenuto acquisito da ${file.fileName}`;
        const localDoc = `---\nokf_version: "0.2"\ntitle: "${cleanName}"\ntype: "specification"\ndomain: "${isAudio ? "Audio & Media Systems" : "Software & Systems"}"\ntags: ["file-upload", "${isAudio ? "audio" : "document"}", "okf-v0.2"]\ncreated_at: "${new Date().toISOString()}"\nentities:\n  - name: "${cleanName}"\n    type: "concept"\n    description: "Documento acquisito da ${file.fileName}"\nrelations:\n  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"\n    relation_type: "references"\n    weight: 0.85\n---\n\n# ${cleanName}\n\n> **Documento acquisito da file grezzo (\`${file.fileName}\`)**\n\n---\n\n## 1. Panoramica Esecutiva\nDocumentazione archiviata e convertita in specifiche OKF v0.2.\n\n---\n\n## 2. Contenuto Estratto\n${fallbackText.slice(0, 4000)}\n`;

        resPayload = {
          title: cleanName,
          summary: `Documento acquisito dal file ${file.fileName}. Specifiche OKF v0.2 generate.`,
          tags: ["file-upload", isAudio ? "audio" : "document", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: isAudio ? "Audio & Media Systems" : "Software & Systems",
            docType: "specification",
            mediaType: isAudio ? "audio" : undefined,
            markdownContent: localDoc,
            entities: [{ name: cleanName, type: "concept", description: `Risorsa da ${file.fileName}` }],
            relations: [{ targetTitle: "Knowledge Vault", relationType: "references", weight: 0.8 }],
          },
        };
      }

      // ========================================================================
      // SCHEMA VALIDATION LAYER (Strict OKF v0.2 Enforcement)
      // Se la risorsa non soddisfa i campi obbligatori di OKF v0.2,
      // viene automaticamente reindirizzata a 'Draft' (Bozza) o 'Uncategorized'
      // anziché forzare una conversione fallita o perdere i dati estratti.
      // ========================================================================
      const schemaValidation = enforceOKFSchemaValidation({
        title: resPayload.title,
        summary: resPayload.summary,
        tags: resPayload.tags,
        markdownContent: resPayload.metadata?.markdownContent,
        rawContent: reconstructedText || file.notes || file.fileName,
        metadata: resPayload.metadata,
        resourceType: "knowledge",
        sourceFileName: file.fileName,
      });

      const finalTitle = schemaValidation.enforcedTitle;
      const finalSummary = schemaValidation.enforcedSummary;
      const finalTags = schemaValidation.enforcedTags;
      const finalMetadata: ResourceMetadata = {
        ...schemaValidation.enforcedMetadata,
        sourceFileName: file.fileName,
        sourceFileId: file.id,
      };

      if (!schemaValidation.isValidOKF) {
        addLog(
          "warn",
          "OKF_PARSER",
          `[${convSessionId}] [Schema Validation Layer] Conversione file "${file.fileName}" non conforme a tutti i campi obbligatori OKF v0.2 (${schemaValidation.missingMandatoryFields.join(", ")}). Reindirizzato automaticamente a Bozza (Draft) / Uncategorized.`,
          {
            missingFields: schemaValidation.missingMandatoryFields,
            isDraft: schemaValidation.isDraft,
            isUncategorized: schemaValidation.isUncategorized,
            schemaCompliance: schemaValidation.schemaCompliance,
          }
        );

        recordLifecycleEvent({
          stage: "OKF_SCHEMA_VALIDATION",
          resourceTitle: finalTitle,
          resourceType: "knowledge",
          status: "warn",
          message: `[Conversione File ${convSessionId}] Schema OKF v0.2 incompleto: reindirizzato automaticamente a Bozza (Draft) - Mancano: ${schemaValidation.missingMandatoryFields.join(", ")}`,
          details: {
            convSessionId,
            redirectedToDraft: true,
            isUncategorized: schemaValidation.isUncategorized,
            missingMandatoryFields: schemaValidation.missingMandatoryFields,
          },
        });
      } else {
        addLog(
          "success",
          "OKF_PARSER",
          `[${convSessionId}] [Schema Validation Layer] File "${file.fileName}" conforme allo standard OKF v0.2 (docType: "${finalMetadata.docType}", entità: ${finalMetadata.entities?.length || 0})`
        );
      }

      const newResourceId = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const newResourceItem: ResourceItem = {
        id: newResourceId,
        userId: activeUser.uid,
        type: "knowledge",
        title: finalTitle,
        summary: finalSummary,
        tags: finalTags,
        metadata: finalMetadata,
        rawInput: `File: ${file.fileName}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Pre-flight duplicate check against existing resources
      const potentialDup = resources.find(
        (r) =>
          r.title.trim().toLowerCase() === newResourceItem.title.trim().toLowerCase() ||
          (r.metadata?.sourceFileName && r.metadata.sourceFileName === file.fileName)
      );

      recordLifecycleEvent({
        stage: "DATA_TRANSFORMATION",
        resourceId: newResourceId,
        resourceTitle: newResourceItem.title,
        resourceType: "knowledge",
        status: potentialDup ? "warn" : "info",
        message: potentialDup
          ? `[Conversione File ${convSessionId}] Trasformazione completata: possibile duplicato rilevato nel Vault ("${potentialDup.title}", ID: "${potentialDup.id}")`
          : `[Conversione File ${convSessionId}] File "${file.fileName}" trasformato (${schemaValidation.isDraft ? "Bozza / Draft" : "Specifica OKF v0.2"}): "${newResourceItem.title}" (${newResourceItem.tags?.length || 0} tag, dominio: "${newResourceItem.metadata?.domain || 'Generale'}")`,
        details: {
          convSessionId,
          tempId: newResourceId,
          sourceFileId: file.id,
          sourceFileName: file.fileName,
          isDraft: schemaValidation.isDraft,
          isUncategorized: schemaValidation.isUncategorized,
          docType: finalMetadata.docType,
          domain: finalMetadata.domain,
          entitiesCount: finalMetadata.entities?.length || 0,
          relationsCount: finalMetadata.relations?.length || 0,
          potentialDuplicate: potentialDup
            ? { id: potentialDup.id, title: potentialDup.title, type: potentialDup.type }
            : null,
        },
      });

      if (quotaExceeded) {
        let countBefore = 0;
        let countAfter = 0;
        setResources((prev) => {
          countBefore = prev.length;
          const updated = [newResourceItem, ...prev];
          countAfter = updated.length;
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        setRawFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === file.id
              ? { ...f, status: "converted_okf" as const, convertedResourceId: newResourceId, convertedResourceTitle: finalTitle }
              : f
          );
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "LOCAL_CREATION",
          resourceId: newResourceId,
          resourceTitle: newResourceItem.title,
          resourceType: "knowledge",
          status: "success",
          message: `[Conversione File ${convSessionId}] Risorsa memorizzata nel Vault locale (conteggio: ${countBefore} -> ${countAfter}, delta: +${countAfter - countBefore})`,
          details: { convSessionId, id: newResourceId, countBefore, countAfter, delta: countAfter - countBefore },
        });

        addLog("success", "OKF_PARSER", `[${convSessionId}] Documento convertito e salvato in memoria locale: "${finalTitle}" (conteggio: ${countBefore} -> ${countAfter})`);
        setStatusMessage(
          schemaValidation.isDraft
            ? `File salvato come Bozza (Draft) nel Vault: "${finalTitle}" (${schemaValidation.isUncategorized ? "Non categorizzato" : "Validazione OKF incompleta"})`
            : `File convertito in specifica OKF v0.2: "${finalTitle}"`
        );
        setTimeout(() => setStatusMessage(null), 5000);
        setSelectedKnowledgeForReader(newResourceItem);
        checkAndLogFilterVisibility(newResourceItem, convSessionId, "Conversione File Locale");
        setCurrentCategory("knowledge");
        setSelectedTag(null);
        setSearchQuery("");
        return true;
      }

      recordLifecycleEvent({
        stage: "FIRESTORE_WRITE_START",
        resourceId: newResourceId,
        resourceTitle: newResourceItem.title,
        resourceType: "knowledge",
        status: "info",
        message: `[Conversione File ${convSessionId}] Salvataggio risorsa convertita in Cloud Firestore (target count: ${resources.length + 1})...`,
        details: { convSessionId, tempId: newResourceId, title: newResourceItem.title, currentVaultCount: resources.length },
      });

      const writeStart = Date.now();
      try {
        const sanitizedResource = sanitizeForFirestore({
          ...newResourceItem,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        delete (sanitizedResource as any).id;

        const newResourceDoc = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizedResource), 20000);
        const writeDuration = Date.now() - writeStart;
        newResourceItem.id = newResourceDoc.id;

        recordLifecycleEvent({
          stage: "FIRESTORE_WRITE_SUCCESS",
          resourceId: newResourceDoc.id,
          resourceTitle: newResourceItem.title,
          resourceType: "knowledge",
          status: "success",
          message: `[Conversione File ${convSessionId}] Risorsa scritta in Firestore in ${writeDuration}ms con ID definitivo "${newResourceDoc.id}" (da temp "${newResourceId}")`,
          details: { convSessionId, originalTempId: newResourceId, firestoreId: newResourceDoc.id, writeDurationMs: writeDuration },
        });

        if (!file.id.startsWith("local-")) {
          try {
            await withFirestoreTimeout(
              setDoc(
                doc(db, "raw_files", file.id),
                {
                  status: "converted_okf",
                  convertedResourceId: newResourceDoc.id,
                  convertedResourceTitle: finalTitle,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              ),
              15000
            );
          } catch (updateRawErr: any) {
            console.warn("Raw file status update in Firestore deferred (latency):", updateRawErr?.message || updateRawErr);
          }
        }
      } catch (saveErr: any) {
        recordLifecycleEvent({
          stage: "FIRESTORE_WRITE_FAIL",
          resourceId: newResourceId,
          resourceTitle: newResourceItem.title,
          resourceType: "knowledge",
          status: "warn",
          message: `[Conversione File ${convSessionId}] Scrittura Firestore non riuscita (${saveErr?.message || "timeout"}), preservato ID locale "${newResourceId}"`,
          details: { convSessionId, error: saveErr?.message, tempId: newResourceId },
        });

        if (isQuotaError(saveErr)) {
          setQuotaExceeded(true);
          wasQuotaExceededRef.current = true;
          saveQuotaExceededStatus(true);
          disableNetwork(db).catch(() => {});
        }
      }

      let countBeforeUpdate = 0;
      let countAfterUpdate = 0;
      setResources((prev) => {
        countBeforeUpdate = prev.length;
        const filtered = prev.filter((r) => r.id !== newResourceItem.id && r.id !== newResourceId);
        const updated = [newResourceItem, ...filtered];
        countAfterUpdate = updated.length;
        saveLocalResources(updated, activeUser.uid);
        return updated;
      });

      setRawFiles((prev) => {
        const updated = prev.map((f) =>
          f.id === file.id
            ? { ...f, status: "converted_okf" as const, convertedResourceId: newResourceItem.id, convertedResourceTitle: finalTitle }
            : f
        );
        saveLocalRawFiles(updated, activeUser.uid);
        return updated;
      });

      addLog(
        "success",
        "OKF_PARSER",
        `[${convSessionId}] Documento convertito con successo! Creato: "${finalTitle}" (stato: ${schemaValidation.status}, conteggio risorse: ${countBeforeUpdate} -> ${countAfterUpdate}, delta: +${countAfterUpdate - countBeforeUpdate})`
      );

      checkAndLogFilterVisibility(newResourceItem, convSessionId, "Conversione File OKF");

      setStatusMessage(
        schemaValidation.isDraft
          ? `File salvato come Bozza (Draft) nel Vault: "${finalTitle}" (${schemaValidation.isUncategorized ? "Non categorizzato" : "Validazione OKF incompleta"})`
          : `File convertito in specifica OKF v0.2: "${finalTitle}"`
      );
      setTimeout(() => setStatusMessage(null), 5000);
      setSelectedKnowledgeForReader(newResourceItem);
      setCurrentCategory("knowledge");
      setSelectedTag(null);
      setSearchQuery("");

      return true;
    } catch (err: any) {
      console.warn("Convert file to OKF error, activating Schema Validation Draft fallback:", err);
      addLog("warn", "GEMINI_AI", `[${convSessionId}] Errore conversione (${err?.message}). Attivazione automatica schema fallback Bozza (Draft) per preservare i dati.`, err);

      try {
        const cleanName = file.fileName.replace(/\.[^/.]+$/, "");
        const fallbackText = file.textContent || file.notes || `Contenuto estratto dal file ${file.fileName}`;
        const isAudioFile = Boolean(
          (file.mimeType && file.mimeType.toLowerCase().startsWith("audio/")) ||
          file.fileType?.toLowerCase() === "audio" ||
          /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.fileName)
        );
        const draftFallback = enforceOKFSchemaValidation({
          title: cleanName,
          summary: `Bozza creata a seguito di eccezione durante la conversione del file ${file.fileName}. Tutti i dati grezzi sono stati preservati.`,
          tags: ["file-upload", isAudioFile ? "audio" : "document", "draft", "uncategorized"],
          markdownContent: fallbackText,
          rawContent: fallbackText,
          metadata: {
            sourceFileName: file.fileName,
            sourceFileId: file.id,
            status: "draft",
            isDraft: true,
            isUncategorized: true,
            uncategorized: true,
            domain: "Uncategorized",
            docType: "concept",
          },
          resourceType: "knowledge",
          sourceFileName: file.fileName,
        });

        const fallbackResourceId = "conv-draft-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const fallbackResourceItem: ResourceItem = {
          id: fallbackResourceId,
          userId: activeUser.uid,
          type: "knowledge",
          title: draftFallback.enforcedTitle,
          summary: draftFallback.enforcedSummary,
          tags: draftFallback.enforcedTags,
          metadata: {
            ...draftFallback.enforcedMetadata,
            sourceFileName: file.fileName,
            sourceFileId: file.id,
          },
          rawInput: `File: ${file.fileName}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        setResources((prev) => {
          const filtered = prev.filter((r) => r.id !== fallbackResourceId);
          const updated = [fallbackResourceItem, ...filtered];
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        setRawFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === file.id
              ? { ...f, status: "converted_okf" as const, convertedResourceId: fallbackResourceId, convertedResourceTitle: fallbackResourceItem.title }
              : f
          );
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });

        if (!quotaExceeded) {
          withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizeForFirestore({
            ...fallbackResourceItem,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })), 5000).catch(() => {});
        }

        setStatusMessage(`File salvato come Bozza (Draft) nel Vault: "${fallbackResourceItem.title}"`);
        setTimeout(() => setStatusMessage(null), 5000);
        setSelectedKnowledgeForReader(fallbackResourceItem);
        setCurrentCategory("knowledge");
        return true;
      } catch (innerErr: any) {
        console.error("Critical draft fallback failure:", innerErr);
        setErrorMessage(`Errore conversione: ${err.message || "Errore sconosciuto"}`);
        setTimeout(() => setErrorMessage(null), 5000);
        return false;
      }
    } finally {
      setIsConvertingRawFileId(null);
    }
  };

  // Analyze text/URL using server-side Gemini endpoint with client-side fallback
  const analyzeWithAI = async (
    input: string, 
    explicitType?: ResourceType,
    onStageUpdate?: (stage: CaptureStage, message?: string) => void,
    correlationId?: string,
    preferredModel?: string
  ) => {
    const activeCorrId = correlationId || ("ai-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6));
    const startTime = Date.now();
    addLog("info", "GEMINI_AI", `[${activeCorrId}] Inizio analisi semantica (${input.length} caratteri, tipo: ${explicitType || "auto"}, modello: ${preferredModel || "auto"})...`);
    
    try {
      if (onStageUpdate) {
        onStageUpdate("sending", "Invio al server...");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      if (onStageUpdate) {
        setTimeout(() => {
          onStageUpdate("analyzing", "Elaborazione semantica con Gemini AI e Search Grounding...");
        }, 300);
      }

      // Provide existing vault resources context for high-fidelity cross-linking
      const contextList = resources.slice(0, 30).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        tags: r.tags || [],
      }));

      const res = await fetch("/api/analyze-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ 
          input, 
          explicitType,
          existingResources: contextList,
          preferredModel: preferredModel || undefined
        }),
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.result && data.result.title) {
          const durationMs = Date.now() - startTime;
          recordLifecycleEvent({
            stage: "AI_ANALYSIS_SUCCESS",
            resourceTitle: data.result.title,
            resourceType: data.result.type,
            status: "info",
            message: `[Analisi Semantica ${activeCorrId}] Elaborazione cloud completata in ${durationMs}ms: "${data.result.title}" (${data.result.type})`,
            details: {
              correlationId: activeCorrId,
              durationMs,
              returnedTitle: data.result.title,
              returnedType: data.result.type,
              tagsCount: data.result.tags?.length || 0,
              tags: data.result.tags,
              entitiesCount: data.result.metadata?.entities?.length || 0,
              relationsCount: data.result.metadata?.relations?.length || 0,
              hasMarkdown: Boolean(data.result.metadata?.markdownContent),
            },
          });

          addLog("success", "GEMINI_AI", `[${activeCorrId}] Analisi completata con successo in ${durationMs}ms: "${data.result.title}" (Tipo: ${data.result.type})`, {
            tags: data.result.tags,
            entities: data.result.metadata?.entities?.length || 0,
            metadata: data.result.metadata,
          });
          return { ...data.result, _source: "cloud_ai" };
        }
      } else {
        const errText = await res.text().catch(() => "");
        addLog("warn", "GEMINI_AI", `[${activeCorrId}] Risposta server non ottimale (${res.status}): ${errText.slice(0, 100)}, attivazione parser locale`);
        const fallbackParsed = localFallbackAnalyzeResource(input, explicitType);
        return { 
          ...fallbackParsed, 
          _source: "local_fallback", 
          _failureReason: `Risposta server HTTP ${res.status}: ${errText.slice(0, 100)}` 
        };
      }
    } catch (networkErr: any) {
      console.warn("[Analyze AI] Endpoint request failed or timed out, activating local parser:", networkErr?.message);
      addLog("warn", "GEMINI_AI", `[${activeCorrId}] Analisi cloud non disponibile (${networkErr?.message || "timeout"}), elaborazione con parser euristico locale ad alta velocità...`);
      if (onStageUpdate) {
        onStageUpdate("analyzing", "Estrazione euristica locale...");
      }

      const fallbackParsed = localFallbackAnalyzeResource(input, explicitType);
      recordLifecycleEvent({
        stage: "AI_ANALYSIS_FALLBACK",
        resourceTitle: fallbackParsed.title,
        resourceType: fallbackParsed.type,
        status: "warn",
        message: `[Analisi Semantica ${activeCorrId}] Applicato parser euristico locale ad alta velocità: "${fallbackParsed.title}" (${fallbackParsed.type})`,
        details: {
          correlationId: activeCorrId,
          fallbackTitle: fallbackParsed.title,
          fallbackType: fallbackParsed.type,
          tagsCount: fallbackParsed.tags?.length || 0,
          tags: fallbackParsed.tags,
          reason: networkErr?.message || "Timeout o errore endpoint",
        },
      });

      addLog("info", "GEMINI_AI", `[${activeCorrId}] Analisi locale completata con successo: "${fallbackParsed.title}" (Tipo: ${fallbackParsed.type})`, {
        tags: fallbackParsed.tags,
        metadata: fallbackParsed.metadata,
      });
      return { 
        ...fallbackParsed, 
        _source: "local_fallback", 
        _failureReason: networkErr?.message || "Timeout o errore chiamata AI" 
      };
    }

    if (onStageUpdate) {
      onStageUpdate("analyzing", "Estrazione euristica locale...");
    }

    const fallbackParsed = localFallbackAnalyzeResource(input, explicitType);
    recordLifecycleEvent({
      stage: "AI_ANALYSIS_FALLBACK",
      resourceTitle: fallbackParsed.title,
      resourceType: fallbackParsed.type,
      status: "warn",
      message: `[Analisi Semantica ${activeCorrId}] Applicato parser euristico locale ad alta velocità: "${fallbackParsed.title}" (${fallbackParsed.type})`,
      details: {
        correlationId: activeCorrId,
        fallbackTitle: fallbackParsed.title,
        fallbackType: fallbackParsed.type,
        tagsCount: fallbackParsed.tags?.length || 0,
        tags: fallbackParsed.tags,
      },
    });

    addLog("info", "GEMINI_AI", `[${activeCorrId}] Analisi locale completata con successo: "${fallbackParsed.title}" (Tipo: ${fallbackParsed.type})`, {
      tags: fallbackParsed.tags,
      metadata: fallbackParsed.metadata,
    });
    return { ...fallbackParsed, _source: "local_fallback", _failureReason: "Nessun risultato valido da endpoint cloud" };
  };

  // Capture Bar Handler
  const handleCapture = async (
    input: string, 
    explicitType?: ResourceType,
    extraMetadata?: Record<string, any>
  ): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
      } catch (authErr: any) {
        addLog("warn", "CAPTURE", "Tentativo di cattura senza utente autenticato.");
        setErrorMessage("Autenticazione in corso, riprova tra un istante.");
        setTimeout(() => setErrorMessage(null), 4000);
        return false;
      }
    }

    const captureSessionId = "cap-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const initialVaultCount = resources.length;

    // ========================================================================
    // LOGGING STEP PRE-TRASFORMAZIONE: ACQUISIZIONE E ISPEZIONE TIPO INPUT GREZZO
    // Cattura la tipologia esatta dell'input grezzo prima di qualsiasi trasformazione.
    // ========================================================================
    const inputClassification = classifyCaptureInput(input, explicitType);

    let preTransformationUrlError: string | null = null;
    let parsedUrlStructure: { protocol?: string; hostname?: string; pathname?: string; search?: string } | null = null;
    if (inputClassification.isWebLink || inputClassification.detectedUrl) {
      try {
        const toTest = inputClassification.detectedUrl || (input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
        const parsed = new URL(toTest);
        parsedUrlStructure = {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          pathname: parsed.pathname,
          search: parsed.search,
        };
      } catch (err: any) {
        preTransformationUrlError = err?.message || "Sintassi URL non valida o URI malformato";
      }
    }

    addLog(
      "info", 
      "CAPTURE", 
      `[${captureSessionId}] [RAW_INPUT_CAPTURED] Acquisito input grezzo di tipo '${inputClassification.classification}' (isWebLink: ${inputClassification.isWebLink}, explicitType: "${explicitType || 'auto'}", caratteri: ${input.length}, linee: ${input.split('\n').length}, URL: "${inputClassification.detectedUrl || 'N/A'}") - ${inputClassification.reason}`,
      {
        captureSessionId,
        rawInputType: inputClassification.classification,
        isWebLink: inputClassification.isWebLink,
        detectedUrl: inputClassification.detectedUrl || null,
        urlSyntaxValid: !preTransformationUrlError,
        urlParseError: preTransformationUrlError,
        urlStructure: parsedUrlStructure,
        explicitType: explicitType || "auto",
        inputLength: input.length,
        lineCount: input.split("\n").length,
        hasYamlFrontmatter: inputClassification.characteristics.hasYamlFrontmatter,
        hasOkfVersionHeader: inputClassification.characteristics.hasOkfVersionHeader,
        confidence: inputClassification.confidence,
        rawSnippet: input.trim().slice(0, 140),
        timestamp: new Date().toISOString(),
      }
    );

    recordLifecycleEvent({
      stage: "RAW_INPUT_CAPTURED",
      resourceTitle: input.trim().slice(0, 60) || "Input Grezzo",
      resourceType: inputClassification.classification,
      status: "info",
      message: `[Cattura ${captureSessionId}] Ispezione pre-trasformazione: Input grezzo rilevato come '${inputClassification.classification}' (isWebLink: ${inputClassification.isWebLink}, caratteri: ${input.length}) - ${inputClassification.reason}`,
      details: {
        captureSessionId,
        rawInputType: inputClassification.classification,
        isWebLink: inputClassification.isWebLink,
        detectedUrl: inputClassification.detectedUrl || null,
        urlSyntaxValid: !preTransformationUrlError,
        urlParseError: preTransformationUrlError,
        urlStructure: parsedUrlStructure,
        explicitType: explicitType || "auto",
        inputLength: input.length,
        lineCount: input.split("\n").length,
        hasYamlFrontmatter: inputClassification.characteristics.hasYamlFrontmatter,
        hasOkfVersionHeader: inputClassification.characteristics.hasOkfVersionHeader,
        confidence: inputClassification.confidence,
        rawSnippet: input.trim().slice(0, 140),
        initialVaultCount,
        currentCategory,
        selectedTag,
        searchQuery,
        userId: activeUser.uid,
      },
    });

    recordLifecycleEvent({
      stage: "CAPTURE_INITIATED",
      resourceTitle: input.slice(0, 60),
      resourceType: explicitType || (inputClassification.isWebLink ? "link" : inputClassification.classification),
      status: "info",
      message: `[Cattura ${captureSessionId}] Fase 1: Input classificato come '${inputClassification.classification}' (isWebLink: ${inputClassification.isWebLink}) - ${inputClassification.reason}`,
      details: {
        captureSessionId,
        step: 1,
        classification: inputClassification.classification,
        isWebLink: inputClassification.isWebLink,
        detectedUrl: inputClassification.detectedUrl,
        confidence: inputClassification.confidence,
        inputLength: input.length,
        explicitType: explicitType || null,
        initialVaultCount,
        currentCategory,
        selectedTag,
        searchQuery,
        userId: activeUser.uid,
      },
    });

    setIsAnalyzing(true);
    setCaptureStage("sending");
    setCaptureStageMessage("Invio richiesta...");
    setTransformationCategory(null);

    const safetyTimer = setTimeout(() => {
      setIsAnalyzing(false);
      setCaptureStage("idle");
      setCaptureStageMessage("");
      setTransformationCategory(null);
    }, 45000);

    addLog("info", "CAPTURE", `[${captureSessionId}] Ricevuta richiesta di cattura [${explicitType || "auto"}]: ${input.slice(0, 80)}...`);
    try {
      let analyzed: any = null;
      let aiAnalysisFailed = false;
      let aiFailureReason = "";

      try {
        analyzed = await analyzeWithAI(
          input, 
          explicitType, 
          (stg, msg) => {
            setCaptureStage(stg);
            if (msg) setCaptureStageMessage(msg);
          },
          captureSessionId,
          extraMetadata?.preferredModel
        );
        if (analyzed && analyzed._source === "local_fallback") {
          aiAnalysisFailed = true;
          aiFailureReason = analyzed._failureReason || "Analisi AI non riuscita, ricorso a parser locale";
        }
      } catch (aiErr: any) {
        aiAnalysisFailed = true;
        aiFailureReason = aiErr?.message || "Eccezione durante la chiamata AI";
        console.warn("[handleCapture] AI analysis error, falling back to local heuristic:", aiErr);
        analyzed = localFallbackAnalyzeResource(input, explicitType);
      }

      if (!analyzed || !analyzed.title) {
        analyzed = localFallbackAnalyzeResource(input, explicitType);
      }

      let resolvedType = explicitType || analyzed.type || (inputClassification.isWebLink ? "link" : "article");
      if (
        (input.includes("github.com/") || (analyzed.url && analyzed.url.includes("github.com/")) || inputClassification.classification === "github_repo") &&
        explicitType !== "mcp_server" &&
        explicitType !== "knowledge" &&
        explicitType !== "article" &&
        resolvedType !== "mcp_server"
      ) {
        resolvedType = "github_repo";
      }

      let resolvedUrl = (analyzed.url && typeof analyzed.url === "string") 
        ? analyzed.url.trim() 
        : (inputClassification.detectedUrl || (input.startsWith("http") ? input.trim() : ""));
      if (!resolvedUrl && input.includes("github.com/")) {
        const ghMatch = input.match(/github\.com\/[^\s]+/i);
        if (ghMatch) resolvedUrl = `https://${ghMatch[0]}`;
      }
      if (!resolvedUrl && extraMetadata?.gdocUrl) {
        resolvedUrl = extraMetadata.gdocUrl;
      }

      let mergedMetadata: ResourceMetadata = {
        ...(analyzed.metadata || {}),
        ...(extraMetadata || {})
      };

      if ((!analyzed.title || analyzed.title.startsWith("http://") || analyzed.title.startsWith("https://") || analyzed.title === "Nuova Risorsa" || analyzed.title.toLowerCase() === "collegamento web") && mergedMetadata.ogTitle) {
        analyzed.title = mergedMetadata.ogTitle;
      }

      // ========================================================================
      // VALIDAZIONE FASE 2: VERIFICA PARSING LINK WEB & LOG MOTIVO SPECIFICO
      // Se è un link web che fallisce il parsing, registra il motivo specifico
      // INVECE di applicare il fallback a documento OKF ("knowledge")!
      // ========================================================================
      const isLinkOrExternalWeb = 
        inputClassification.isWebLink || 
        explicitType === "link" || 
        inputClassification.classification === "web_link" ||
        inputClassification.classification === "github_repo" ||
        resolvedType === "link" || 
        resolvedType === "article" || 
        resolvedType === "github_repo" ||
        Boolean(resolvedUrl && !inputClassification.characteristics.hasYamlFrontmatter);

      let okfConversionFailed = false;
      let okfFailureReason = "";

      if (isLinkOrExternalWeb) {
        // Verifica se il parsing del collegamento web ha riscontrato anomalie o fallimenti
        const linkParseFailures: string[] = [];
        if (preTransformationUrlError) {
          linkParseFailures.push(`Sintassi URL non valida o URI malformato: "${preTransformationUrlError}"`);
        }
        if (aiAnalysisFailed || analyzed?._source === "local_fallback") {
          linkParseFailures.push(
            analyzed?._failureReason
              ? `Analisi cloud non riuscita (${analyzed._failureReason}) - recupero con parser euristico locale`
              : "Analisi cloud non disponibile o timeout - recupero con parser euristico locale"
          );
        }
        if (!analyzed || !analyzed.title || analyzed.title === "Nuova Risorsa" || analyzed.title === input.trim()) {
          linkParseFailures.push("Estrazione metadati remoti incompleta: nessun titolo significativo recuperato dal target web");
        }

        const isFailure = linkParseFailures.length > 0;
        const specificLinkFailureReason = isFailure
          ? linkParseFailures.join(" | ")
          : `L'input è un collegamento web ("${resolvedUrl || inputClassification.detectedUrl || input}"). I link web sono collegamenti/risorse esterne e non documenti con schema OKF v0.2.`;

        okfConversionFailed = true;
        okfFailureReason = specificLinkFailureReason;

        addLog(
          isFailure ? "warn" : "info", 
          "CAPTURE", 
          `[${captureSessionId}] [${isFailure ? "Fallimento Parsing Link Web" : "Fase 2: Classificazione Link Web"}] Motivo specifico: ${specificLinkFailureReason}. La risorsa NON viene convertita in documento OKF ("knowledge"): preservato rigidamente tipo '${resolvedType === "github_repo" ? "github_repo" : "link"}'.`,
          {
            captureSessionId,
            url: resolvedUrl || inputClassification.detectedUrl || input,
            rawInputType: inputClassification.classification,
            parseFailures: linkParseFailures,
            specificFailureReason: specificLinkFailureReason,
            defaultOkfPrevented: true,
            originalAnalyzedType: analyzed?.type,
            enforcedType: resolvedType === "github_repo" ? "github_repo" : "link",
          }
        );

        recordLifecycleEvent({
          stage: "OKF_SCHEMA_VALIDATION",
          resourceTitle: analyzed.title || resolvedUrl || "Web Link",
          resourceType: resolvedType === "github_repo" ? "github_repo" : "link",
          status: isFailure ? "warn" : "info",
          message: isFailure
            ? `[Cattura ${captureSessionId}] Parsing link web non riuscito: ${specificLinkFailureReason} - Default a documento OKF impedito.`
            : `[Cattura ${captureSessionId}] Collegamento web esterno rilevato: conversione a schema documentale OKF v0.2 esclusa per preservare integrità tipologica.`,
          details: {
            captureSessionId,
            step: 2,
            okfConversionPassed: false,
            specificFailureReason: specificLinkFailureReason,
            parseFailures: linkParseFailures,
            classification: inputClassification.classification,
            isWebLink: true,
            url: resolvedUrl || inputClassification.detectedUrl || null,
            originalType: analyzed.type,
            defaultOkfPrevented: true,
            coercedType: resolvedType === "github_repo" ? "github_repo" : "link",
          },
        });

        // Azione correttiva vincolante: impedisce rigorosamente che il link web diventi 'knowledge' o mantenga versioni OKF
        if (resolvedType === "knowledge") {
          resolvedType = "link";
        }
        delete mergedMetadata.okfVersion;
        delete mergedMetadata.okf_version;
        delete mergedMetadata.entities;
        delete mergedMetadata.relations;
        delete mergedMetadata.markdownContent;
        if (mergedMetadata.docType && !["guide", "tool_description"].includes(mergedMetadata.docType)) {
          delete mergedMetadata.docType;
        }

        if (isFailure) {
          mergedMetadata.linkParseFailed = true;
          mergedMetadata.linkParseFailureReason = specificLinkFailureReason;
          mergedMetadata.parseStatus = "failed_as_link";
        }
        mergedMetadata.isWebLink = true;

        // Sanitizzazione sicura di titolo e sommario
        if (!analyzed.title || analyzed.title === "Nuova Risorsa" || analyzed.title === "Documento Knowledge" || analyzed.title === input.trim()) {
          if (parsedUrlStructure?.hostname) {
            analyzed.title = parsedUrlStructure.hostname.replace(/^www\./, "");
          } else if (resolvedUrl) {
            analyzed.title = resolvedUrl.replace(/^https?:\/\//, "").slice(0, 50);
          } else {
            analyzed.title = "Collegamento Web";
          }
        }

        if (!analyzed.summary || analyzed.summary === input.trim()) {
          analyzed.summary = mergedMetadata.ogDescription || `Collegamento web a ${resolvedUrl || input}.`;
        }
      } else if (
        resolvedType === "procedure" || 
        explicitType === "procedure" || 
        inputClassification.classification === "procedure"
      ) {
        // ========================================================================
        // STANDARD OPERATING PROCEDURE (SOP) & PLAYBOOK EXECUTION LAYER
        // Quando l'utente seleziona o incolla una procedura/playbook operativo,
        // preserva rigidamente il tipo 'procedure', arricchisce la checklist degli
        // step operativi, il target system, la durata stimata e il piano di rollback.
        // ========================================================================
        resolvedType = "procedure";

        // Estrazione/sanitizzazione degli step sequenziali se presenti come testo
        let finalSteps: string[] = [];
        if (Array.isArray(mergedMetadata.solutionSteps) && mergedMetadata.solutionSteps.length > 0) {
          finalSteps = mergedMetadata.solutionSteps;
        } else if (Array.isArray(analyzed.metadata?.solutionSteps) && analyzed.metadata.solutionSteps.length > 0) {
          finalSteps = analyzed.metadata.solutionSteps;
        } else {
          // Estrai da input se strutturato in punti numerati o checklist
          const extracted = input
            .split("\n")
            .filter((l) => /^(?:\d+[\.)]|[-*]\s*\[[\s x]\]|\bpasso\s*\d+|\bstep\s*\d+)/i.test(l.trim()))
            .map((l) => l.trim().replace(/^(?:\d+[\.)]|[-*]\s*\[[\s x]\]|\bpasso\s*\d+[:.-]?|\bstep\s*\d+[:.-]?)\s*/i, ""));
          if (extracted.length > 0) {
            finalSteps = extracted;
          }
        }

        mergedMetadata = {
          ...mergedMetadata,
          okfVersion: "0.2",
          docType: mergedMetadata.docType || "guide",
          domain: mergedMetadata.domain || (
            input.toLowerCase().includes("stampant") || input.toLowerCase().includes("kyocera") || input.toLowerCase().includes("ricoh")
              ? "Hardware & Multifunction Printers"
              : "Standard Operating Procedures"
          ),
          procedureType: mergedMetadata.procedureType || "maintenance",
          riskLevel: (mergedMetadata.riskLevel as any) || "low",
          targetSystem: mergedMetadata.targetSystem || (analyzed.metadata?.targetSystem) || undefined,
          estimatedDuration: mergedMetadata.estimatedDuration || (analyzed.metadata?.estimatedDuration) || undefined,
          solutionSteps: finalSteps,
          stepsCount: finalSteps.length > 0 ? finalSteps.length : undefined,
          rollbackPlan: mergedMetadata.rollbackPlan || (analyzed.metadata?.rollbackPlan) || undefined,
          prerequisites: Array.isArray(mergedMetadata.prerequisites) ? mergedMetadata.prerequisites : (analyzed.metadata?.prerequisites || []),
          requiredTools: Array.isArray(mergedMetadata.requiredTools) ? mergedMetadata.requiredTools : (analyzed.metadata?.requiredTools || []),
          safetyWarnings: Array.isArray(mergedMetadata.safetyWarnings) ? mergedMetadata.safetyWarnings : (analyzed.metadata?.safetyWarnings || []),
          markdownContent: mergedMetadata.markdownContent || input,
          status: "stable",
          isDraft: false,
          isUncategorized: false,
          uncategorized: false,
          okfValidationPassed: true,
          schemaCompliance: "okf_v0.2_compliant",
        };

        // Assicura la presenza di tag canonici per procedure
        if (!Array.isArray(analyzed.tags)) {
          analyzed.tags = [];
        }
        for (const t of ["procedure", "playbook", "sop"]) {
          if (!analyzed.tags.includes(t)) {
            analyzed.tags.push(t);
          }
        }

        addLog(
          "success",
          "OKF_PARSER",
          `[${captureSessionId}] [Fase 2: Procedura & SOP] Playbook operativo validato con successo come 'procedure': "${analyzed.title}" (target: ${mergedMetadata.targetSystem || 'Generale'}, ${finalSteps.length} passaggi checklist)`
        );

        recordLifecycleEvent({
          stage: "OKF_SCHEMA_VALIDATION",
          resourceTitle: analyzed.title || "Procedura Operativa",
          resourceType: "procedure",
          status: "success",
          message: `[Cattura ${captureSessionId}] Playbook operativo validato come 'procedure' (${finalSteps.length} passaggi esecutivi)`,
          details: {
            captureSessionId,
            step: 2,
            targetSystem: mergedMetadata.targetSystem,
            stepsCount: finalSteps.length,
            procedureType: mergedMetadata.procedureType,
            riskLevel: mergedMetadata.riskLevel,
            estimatedDuration: mergedMetadata.estimatedDuration,
          },
        });
      } else if (
        resolvedType === "troubleshooting" || 
        explicitType === "troubleshooting" || 
        inputClassification.classification === "troubleshooting"
      ) {
        // ========================================================================
        // TROUBLESHOOTING & SYSTEM DIAGNOSTICS LAYER
        // ========================================================================
        resolvedType = "troubleshooting";
        mergedMetadata = {
          ...mergedMetadata,
          okfVersion: "0.2",
          docType: mergedMetadata.docType || "specification",
          domain: mergedMetadata.domain || "System Diagnostics & OS",
          status: "stable",
          isDraft: false,
          isUncategorized: false,
          uncategorized: false,
          okfValidationPassed: true,
          schemaCompliance: "okf_v0.2_compliant",
        };

        addLog(
          "success",
          "OKF_PARSER",
          `[${captureSessionId}] [Fase 2: Troubleshooting] Scheda diagnostica validata come 'troubleshooting': "${analyzed.title}"`
        );
      } else if (
        (explicitType === "knowledge" || 
        resolvedType === "knowledge" || 
        inputClassification.classification === "okf_document" ||
        Boolean(inputClassification.characteristics?.hasYamlFrontmatter) ||
        Boolean(inputClassification.characteristics?.hasOkfVersionHeader) ||
        Boolean(mergedMetadata.okfVersion) ||
        Boolean(mergedMetadata.okf_version) ||
        Boolean(mergedMetadata.docType) ||
        (Array.isArray(analyzed.tags) && (
          analyzed.tags.includes("okf-v0.2") || 
          analyzed.tags.includes("okf") || 
          analyzed.tags.includes("knowledge")
        ))) &&
        resolvedType !== "mcp_server" &&
        explicitType !== "mcp_server" &&
        resolvedType !== "ai_skill" &&
        explicitType !== "ai_skill" &&
        resolvedType !== "paper" &&
        explicitType !== "paper" &&
        resolvedType !== "note" &&
        explicitType !== "note"
      ) {
        // ========================================================================
        // SCHEMA VALIDATION LAYER (Strict OKF v0.2 Structure Enforcement)
        // Se una risorsa in ingresso destinata o associata allo standard OKF v0.2
        // non contiene tutti i campi obbligatori (okf_version: "0.2", title, 
        // docType valido, domain, tags, entities, relations, frontmatter e markdown),
        // viene reindirizzata automaticamente allo stato 'Draft' (Bozza) o 'Uncategorized'
        // preservando l'integrità dei dati senza provocare conversioni fallite o perdite.
        // ========================================================================
        resolvedType = "knowledge";

        const schemaEnforcement = enforceOKFSchemaValidation({
          title: analyzed.title,
          summary: analyzed.summary,
          tags: Array.isArray(analyzed.tags) ? analyzed.tags : [],
          markdownContent: mergedMetadata.markdownContent || input,
          rawContent: input,
          metadata: mergedMetadata,
          resourceType: resolvedType,
        });

        if (!schemaEnforcement.isValidOKF) {
          okfConversionFailed = true;
          okfFailureReason = schemaEnforcement.primaryFailureReason || schemaEnforcement.failureReasons.join(" | ") || "Schema OKF v0.2 non conforme.";

          // Reindirizzamento automatico allo stato 'Draft' / 'Uncategorized'
          mergedMetadata = {
            ...mergedMetadata,
            ...schemaEnforcement.enforcedMetadata,
            status: "draft",
            isDraft: true,
            isUncategorized: schemaEnforcement.isUncategorized,
            uncategorized: schemaEnforcement.isUncategorized,
            draftReason: schemaEnforcement.draftReason,
            schemaCompliance: schemaEnforcement.schemaCompliance,
            okfValidationPassed: false,
            okfValidationWarnings: schemaEnforcement.failureReasons,
          };
          if (schemaEnforcement.enforcedTitle) {
            analyzed.title = schemaEnforcement.enforcedTitle;
          }
          if (schemaEnforcement.enforcedSummary) {
            analyzed.summary = schemaEnforcement.enforcedSummary;
          }
          if (schemaEnforcement.enforcedTags && schemaEnforcement.enforcedTags.length > 0) {
            analyzed.tags = schemaEnforcement.enforcedTags;
          }
          if (schemaEnforcement.enforcedMarkdownContent) {
            mergedMetadata.markdownContent = schemaEnforcement.enforcedMarkdownContent;
          }

          addLog(
            "warn",
            "OKF_PARSER",
            `[${captureSessionId}] [Fase 2: Schema Validation Layer] Risorsa reindirizzata a Bozza (Draft) / Uncategorized per preservare i dati: ${okfFailureReason}`,
            {
              missingFields: schemaEnforcement.missingMandatoryFields,
              warnings: schemaEnforcement.failureReasons,
              status: schemaEnforcement.status,
              isDraft: schemaEnforcement.isDraft,
              isUncategorized: schemaEnforcement.isUncategorized,
              title: analyzed.title,
            }
          );

          recordLifecycleEvent({
            stage: "OKF_SCHEMA_VALIDATION",
            resourceTitle: analyzed.title || "Documento Tecnico",
            resourceType: resolvedType,
            status: "warn",
            message: `[Cattura ${captureSessionId}] Schema OKF v0.2 incompleto: reindirizzato automaticamente a Bozza (Draft) - Mancano: ${schemaEnforcement.missingMandatoryFields.join(", ")}`,
            details: {
              captureSessionId,
              step: 2,
              okfConversionPassed: false,
              redirectedToDraft: true,
              isUncategorized: schemaEnforcement.isUncategorized,
              missingMandatoryFields: schemaEnforcement.missingMandatoryFields,
              specificFailureReason: okfFailureReason,
            },
          });
        } else {
          mergedMetadata = {
            ...mergedMetadata,
            ...schemaEnforcement.enforcedMetadata,
            okfVersion: "0.2",
            status: (schemaEnforcement.enforcedMetadata.status as any) || "stable",
            isDraft: false,
            isUncategorized: false,
            uncategorized: false,
            okfValidationPassed: true,
            okfValidationWarnings: [],
            schemaCompliance: "okf_v0.2_compliant",
          };
          if (schemaEnforcement.enforcedTitle) {
            analyzed.title = schemaEnforcement.enforcedTitle;
          }
          if (schemaEnforcement.enforcedSummary) {
            analyzed.summary = schemaEnforcement.enforcedSummary;
          }
          if (schemaEnforcement.enforcedTags && schemaEnforcement.enforcedTags.length > 0) {
            analyzed.tags = schemaEnforcement.enforcedTags;
          }
          if (schemaEnforcement.enforcedMarkdownContent) {
            mergedMetadata.markdownContent = schemaEnforcement.enforcedMarkdownContent;
          }

          addLog(
            "success",
            "OKF_PARSER",
            `[${captureSessionId}] [Fase 2: Schema Validation Layer] Documento validato con successo conforme allo standard OKF v0.2 (docType: "${mergedMetadata.docType || 'concept'}", entità: ${mergedMetadata.entities?.length || 0})`
          );

          recordLifecycleEvent({
            stage: "OKF_SCHEMA_VALIDATION",
            resourceTitle: analyzed.title || "Documento OKF",
            resourceType: resolvedType,
            status: "success",
            message: `[Cattura ${captureSessionId}] Documento conforme allo standard OKF v0.2 (docType: "${mergedMetadata.docType || 'concept'}")`,
            details: {
              captureSessionId,
              step: 2,
              okfConversionPassed: true,
              docType: mergedMetadata.docType,
              domain: mergedMetadata.domain,
              entitiesCount: mergedMetadata.entities?.length || 0,
            },
          });
        }
      }

      // Sanitizzazione rigorosa dei tag: rimuove etichette OKF dai collegamenti web
      let sanitizedTags: string[] = Array.isArray(analyzed.tags) ? [...analyzed.tags] : [];
      if (isLinkOrExternalWeb) {
        sanitizedTags = sanitizedTags.filter(
          (t) => !["okf-v0.2", "okf", "okf-v0.1", "knowledge"].includes(String(t).toLowerCase())
        );
        if (resolvedType === "link" && !sanitizedTags.includes("link")) {
          sanitizedTags.push("link");
        }
        if (!sanitizedTags.includes("web")) {
          sanitizedTags.push("web");
        }
        if (parsedUrlStructure?.hostname) {
          const domainTag = parsedUrlStructure.hostname.replace(/^www\./, "").split(".")[0];
          if (domainTag && domainTag.length > 1 && !sanitizedTags.includes(domainTag)) {
            sanitizedTags.push(domainTag);
          }
        }
      } else if (mergedMetadata.status === "draft" || mergedMetadata.isDraft) {
        if (!sanitizedTags.includes("draft")) {
          sanitizedTags.push("draft");
        }
        if (mergedMetadata.isUncategorized && !sanitizedTags.includes("uncategorized")) {
          sanitizedTags.push("uncategorized");
        }
      }

      // ========================================================================
      // FASE INTERMEDIA: DATA TRANSFORMATION (Visual Indicator UI Flow)
      // Chiarisce visivamente se la risorsa viene categorizzata come Web Link,
      // GitHub Repo, OKF Document o OKF Bozza (Draft) prima di essere salvata.
      // ========================================================================
      let detectedTransformCategory: TransformationCategory = "okf_document";
      if (resolvedType === "procedure" || explicitType === "procedure") {
        detectedTransformCategory = "procedure";
      } else if (resolvedType === "troubleshooting" || explicitType === "troubleshooting") {
        detectedTransformCategory = "troubleshooting";
      } else if (resolvedType === "article" || explicitType === "article") {
        detectedTransformCategory = "article";
      } else if (resolvedType === "github_repo" || inputClassification.classification === "github_repo") {
        detectedTransformCategory = "github_repo";
      } else if (isLinkOrExternalWeb || resolvedType === "link") {
        detectedTransformCategory = "web_link";
      } else if (mergedMetadata.status === "draft" || mergedMetadata.isDraft) {
        detectedTransformCategory = "okf_draft";
      } else {
        detectedTransformCategory = "okf_document";
      }

      const categoryDisplayLabel = 
        detectedTransformCategory === "procedure"
          ? "Procedura / SOP Playbook"
          : detectedTransformCategory === "troubleshooting"
          ? "Troubleshooting & Fix"
          : detectedTransformCategory === "article"
          ? "Articolo & Guida"
          : detectedTransformCategory === "web_link" 
          ? "Web Link" 
          : detectedTransformCategory === "github_repo" 
          ? "GitHub Repo" 
          : detectedTransformCategory === "okf_draft"
          ? "OKF Bozza (Draft)"
          : "OKF Document";

      // Impostazione dello stato e del messaggio per la fase intermedia di Data Transformation
      setCaptureStage("transforming");
      setTransformationCategory(detectedTransformCategory);
      setCaptureStageMessage(
        detectedTransformCategory === "okf_draft"
          ? "Data Transformation: Reindirizzato a Bozza OKF (Draft)..."
          : `Data Transformation: Categorizzato come ${categoryDisplayLabel}...`
      );

      // Breve pausa calibrata per consentire all'interfaccia utente di mostrare distintamente
      // l'indicatore visivo di categorizzazione (Web Link, GitHub Repo o OKF Document) prima del commit allo storage
      await new Promise((resolve) => setTimeout(resolve, 850));

      // Controllo duplicati pre-flight rispetto alle risorse esistenti (URL canonico normalizzato o titolo lungo corrispondente)
      const cleanInputUrl = resolvedUrl ? resolvedUrl.trim().toLowerCase().replace(/\/$/, "").split("?")[0] : "";
      const cleanInputTitle = (analyzed.title || "").trim().toLowerCase();

      const potentialDuplicate = resources.find((r) => {
        if (cleanInputUrl && r.url) {
          const rUrl = r.url.trim().toLowerCase().replace(/\/$/, "").split("?")[0];
          if (rUrl === cleanInputUrl) return true;
        }
        if (cleanInputTitle && r.title && cleanInputTitle.length > 8 && !["nuova risorsa", "readme", "documento", "collegamento web"].includes(cleanInputTitle)) {
          const rTitle = r.title.trim().toLowerCase();
          if (rTitle === cleanInputTitle) return true;
          if (cleanInputTitle.length > 25 && rTitle.length > 25 && (rTitle.includes(cleanInputTitle) || cleanInputTitle.includes(rTitle))) {
            return true;
          }
        }
        return false;
      });

      recordLifecycleEvent({
        stage: "DATA_TRANSFORMATION",
        resourceTitle: analyzed.title || "Nuova Risorsa",
        resourceType: resolvedType,
        status: potentialDuplicate ? "warn" : "info",
        message: potentialDuplicate
          ? `[Cattura ${captureSessionId}] Dati trasformati in ${resolvedType} (${categoryDisplayLabel}): duplicato rilevato ("${potentialDuplicate.title}", ID: "${potentialDuplicate.id}"). Aggiornamento della scheda esistente per evitare duplicazioni.`
          : `[Cattura ${captureSessionId}] Dati trasformati in risorsa standard (${resolvedType} - ${categoryDisplayLabel}, ${sanitizedTags.length} tag, dominio: "${mergedMetadata.domain || 'Generale'}")`,
        details: {
          captureSessionId,
          transformationCategory: detectedTransformCategory,
          transformationCategoryLabel: categoryDisplayLabel,
          step1_classification: inputClassification.classification,
          step2_okfValidated: !okfConversionFailed,
          step2_okfFailureReason: okfFailureReason || null,
          isWebLink: inputClassification.isWebLink,
          rawInputLength: input.length,
          analyzedTitle: analyzed.title,
          rawAnalyzedType: analyzed.type,
          explicitTypeRequested: explicitType,
          resolvedType,
          resolvedUrl,
          tagsCount: sanitizedTags.length,
          tags: sanitizedTags,
          domain: mergedMetadata.domain,
          docType: mergedMetadata.docType,
          metadataKeys: Object.keys(mergedMetadata),
          potentialDuplicate: potentialDuplicate ? { id: potentialDuplicate.id, title: potentialDuplicate.title, type: potentialDuplicate.type } : null,
        },
      });

      // Se la risorsa è già presente, arricchiamo la scheda esistente invece di creare un duplicato
      if (potentialDuplicate) {
        addLog("info", "FIRESTORE", `[${captureSessionId}] Risorsa già esistente ("${potentialDuplicate.title}", ID: ${potentialDuplicate.id}). Aggiornamento ed arricchimento metadati senza duplicare...`);

        const mergedTags = Array.from(new Set([...(potentialDuplicate.tags || []), ...sanitizedTags]));
        const enrichedMetadata = {
          ...(potentialDuplicate.metadata || {}),
          ...mergedMetadata,
        };

        const updateData: Partial<ResourceItem> = {
          tags: mergedTags,
          metadata: enrichedMetadata,
          updatedAt: new Date(),
        };

        if (
          (!potentialDuplicate.title || potentialDuplicate.title.startsWith("http") || potentialDuplicate.title.length < (analyzed.title || "").length) &&
          analyzed.title &&
          !analyzed.title.startsWith("http")
        ) {
          updateData.title = analyzed.title;
        }

        try {
          if (potentialDuplicate.id && !potentialDuplicate.id.startsWith("local-")) {
            await withFirestoreTimeout(
              setDoc(doc(db, "resources", potentialDuplicate.id), sanitizeForFirestore(updateData), { merge: true }),
              8000
            );
          }
        } catch (err) {
          console.warn("[Capture] Aggiornamento risorsa remota duplicata fallito:", err);
        }

        setResources((prev) => {
          const updated = prev.map((r) => (r.id === potentialDuplicate.id ? { ...r, ...updateData } : r));
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "RESOURCE_COLLAPSED_DEDUPED",
          resourceId: potentialDuplicate.id,
          resourceTitle: updateData.title || potentialDuplicate.title,
          resourceType: potentialDuplicate.type,
          status: "success",
          message: `[Cattura ${captureSessionId}] Duplicato prevenuto con successo: aggiornata ed arricchita la risorsa già presente ("${potentialDuplicate.title}", ID: "${potentialDuplicate.id}")`,
          details: { captureSessionId, existingId: potentialDuplicate.id },
        });

        setCaptureStage("success");
        setCaptureStageMessage("Già presente - Scheda Aggiornata!");
        setStatusMessage(`Risorsa già presente nel Vault! Scheda "${updateData.title || potentialDuplicate.title}" arricchita e aggiornata.`);
        setTimeout(() => setStatusMessage(null), 4000);

        if (currentCategory !== "all" && currentCategory !== potentialDuplicate.type) {
          setCurrentCategory(potentialDuplicate.type);
        }
        setSelectedTag(null);
        setSearchQuery("");
        return true;
      }

      setCaptureStage("saving");
      setCaptureStageMessage("Salvataggio nel Vault...");

      if (quotaExceeded) {
        const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localResource: ResourceItem = {
          id: localId,
          userId: activeUser.uid,
          type: resolvedType,
          title: analyzed.title || "Nuova Risorsa",
          url: resolvedUrl,
          rawInput: input,
          summary: analyzed.summary || input,
          tags: sanitizedTags,
          isFavorite: false,
          metadata: mergedMetadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        let countBefore = 0;
        let countAfter = 0;
        setResources((prev) => {
          countBefore = prev.length;
          const updated = [localResource, ...prev];
          countAfter = updated.length;
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "LOCAL_CREATION",
          resourceId: localId,
          resourceTitle: localResource.title,
          resourceType: resolvedType,
          status: "info",
          message: `[Cattura ${captureSessionId}] Acquisizione cattura in memoria locale (conteggio: ${countBefore} -> ${countAfter}, delta: +${countAfter - countBefore}): "${localResource.title}"`,
          details: { captureSessionId, id: localId, type: resolvedType, countBefore, countAfter, delta: countAfter - countBefore },
        });

        checkAndLogFilterVisibility(localResource, captureSessionId, "Cattura Locale");

        setCaptureStage("success");
        setCaptureStageMessage("Completato!");
        if (mergedMetadata.status === "draft" || mergedMetadata.isDraft) {
          setStatusMessage(`Risorsa "${localResource.title}" reindirizzata e salvata come Bozza (Draft) nel Vault!`);
        } else {
          setStatusMessage(`Risorsa "${localResource.title}" aggiunta al Vault!`);
        }
        setTimeout(() => setStatusMessage(null), 4000);

        if (currentCategory !== "all" && currentCategory !== resolvedType) {
          setCurrentCategory(resolvedType);
        }
        setSelectedTag(null);
        setSearchQuery("");
        return true;
      }

      addLog("info", "FIRESTORE", `[${captureSessionId}] Salvataggio risorsa "${analyzed.title}" [${resolvedType}]...`);
      const rawData = {
        userId: activeUser.uid,
        type: resolvedType,
        title: analyzed.title || "Nuova Risorsa",
        url: resolvedUrl,
        rawInput: input,
        summary: analyzed.summary || input,
        tags: sanitizedTags,
        isFavorite: false,
        metadata: mergedMetadata,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      recordLifecycleEvent({
        stage: "FIRESTORE_WRITE_START",
        resourceTitle: rawData.title,
        resourceType: resolvedType,
        status: "info",
        message: `[Cattura ${captureSessionId}] Tentativo di scrittura Firestore per nuova risorsa (target count: ${resources.length + 1}): "${rawData.title}"`,
        details: { captureSessionId, type: resolvedType, url: resolvedUrl, currentVaultCount: resources.length },
      });

      const writeStart = Date.now();
      try {
        const docRef = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)), 20000);
        const writeDuration = Date.now() - writeStart;
        addLog("success", "FIRESTORE", `[${captureSessionId}] Risorsa salvata con successo con ID: ${docRef.id} in ${writeDuration}ms`);

        const savedItem: ResourceItem = {
          id: docRef.id,
          ...rawData,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ResourceItem;

        let countBefore = 0;
        let countAfter = 0;
        let wasReplacement = false;
        setResources((prev) => {
          countBefore = prev.length;
          wasReplacement = prev.some((r) => r.id === docRef.id);
          const filtered = prev.filter((r) => r.id !== docRef.id);
          const updated = [savedItem, ...filtered];
          countAfter = updated.length;
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "FIRESTORE_WRITE_SUCCESS",
          resourceId: docRef.id,
          resourceTitle: savedItem.title,
          resourceType: resolvedType,
          status: "success",
          message: `[Cattura ${captureSessionId}] Risorsa memorizzata su Firestore in ${writeDuration}ms con ID "${docRef.id}" (conteggio: ${countBefore} -> ${countAfter}, delta: +${countAfter - countBefore})`,
          details: {
            captureSessionId,
            id: docRef.id,
            title: savedItem.title,
            writeDurationMs: writeDuration,
            countBefore,
            countAfter,
            delta: countAfter - countBefore,
            wasReplacement,
          },
        });

        checkAndLogFilterVisibility(savedItem, captureSessionId, "Scrittura Firestore");
      } catch (firestoreErr: any) {
        console.warn("[handleCapture] Firestore write failed or timed out, using multi-layer local backup:", firestoreErr);
        
        // Before creating a duplicate local- item, check if this resource URL or title already exists in the Vault (e.g. from onSnapshot)
        const checkUrl = rawData.url ? rawData.url.trim().toLowerCase().replace(/\/$/, "").split("?")[0] : "";
        const checkTitle = (rawData.title || "").trim().toLowerCase();
        let alreadyPresentItem: ResourceItem | null = null;
        
        setResources((prev) => {
          const found = prev.find((r) => {
            if (checkUrl && r.url) {
              const rUrl = r.url.trim().toLowerCase().replace(/\/$/, "").split("?")[0];
              if (rUrl === checkUrl) return true;
            }
            if (checkTitle && r.title && checkTitle.length > 8 && r.title.trim().toLowerCase() === checkTitle) {
              return true;
            }
            return false;
          });
          if (found) {
            alreadyPresentItem = found;
          }
          return prev;
        });

        if (alreadyPresentItem) {
          addLog("info", "FIRESTORE", `[${captureSessionId}] Risorsa già presente o sincronizzata con ID "${(alreadyPresentItem as ResourceItem).id}". Creazione duplicato locale prevenuta.`);
        } else {
          const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
          const localItem: ResourceItem = {
            id: localId,
            ...rawData,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ResourceItem;

          if (isQuotaError(firestoreErr)) {
            setQuotaExceeded(true);
            wasQuotaExceededRef.current = true;
            saveQuotaExceededStatus(true);
            disableNetwork(db).catch(() => {});
          }

          let countBefore = 0;
          let countAfter = 0;
          setResources((prev) => {
            if (checkUrl && prev.some((r) => r.url && r.url.trim().toLowerCase().replace(/\/$/, "").split("?")[0] === checkUrl)) {
              return prev;
            }
            countBefore = prev.length;
            const updated = [localItem, ...prev];
            countAfter = updated.length;
            saveLocalResources(updated, activeUser.uid);
            return updated;
          });

          recordLifecycleEvent({
            stage: "FIRESTORE_WRITE_FAIL",
            resourceId: localId,
            resourceTitle: localItem.title,
            resourceType: resolvedType,
            status: "warn",
            message: `[Cattura ${captureSessionId}] Scrittura Firestore fallita (${firestoreErr?.message || "timeout"}), preservata con ID locale "${localId}" (conteggio: ${countBefore} -> ${countAfter})`,
            details: { captureSessionId, localId, error: firestoreErr?.message, countBefore, countAfter },
          });

          checkAndLogFilterVisibility(localItem, captureSessionId, "Fallback Firestore");
        }
      }

      setCaptureStage("success");
      setCaptureStageMessage("Completato!");
      if (mergedMetadata.status === "draft" || mergedMetadata.isDraft) {
        setStatusMessage(`Risorsa "${rawData.title}" reindirizzata e salvata come Bozza (Draft) nel Vault!`);
      } else {
        setStatusMessage(`Risorsa "${rawData.title}" aggiunta al Vault!`);
      }
      setTimeout(() => setStatusMessage(null), 4000);

      if (currentCategory !== "all" && currentCategory !== resolvedType) {
        setCurrentCategory(resolvedType);
      }
      setSelectedTag(null);
      setSearchQuery("");

      return true;
    } catch (error: any) {
      console.warn("Capture fallback activated:", error);
      const emergencyFallback = localFallbackAnalyzeResource(input, explicitType);
      
      const schemaReport = enforceOKFSchemaValidation({
        title: emergencyFallback.title,
        summary: emergencyFallback.summary,
        tags: emergencyFallback.tags,
        markdownContent: emergencyFallback.metadata?.markdownContent || input,
        rawContent: input,
        metadata: {
          ...(emergencyFallback.metadata || {}),
          ...(extraMetadata || {})
        },
        resourceType: emergencyFallback.type,
      });

      const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const localResource: ResourceItem = {
        id: localId,
        userId: activeUser.uid,
        type: emergencyFallback.type,
        title: schemaReport.enforcedTitle,
        url: emergencyFallback.url || extraMetadata?.gdocUrl || (input.startsWith("http") ? input.trim() : ""),
        rawInput: input,
        summary: schemaReport.enforcedSummary,
        tags: schemaReport.enforcedTags,
        isFavorite: false,
        metadata: schemaReport.enforcedMetadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let countBefore = 0;
      let countAfter = 0;
      setResources((prev) => {
        countBefore = prev.length;
        const updated = [localResource, ...prev];
        countAfter = updated.length;
        saveLocalResources(updated, activeUser.uid);
        return updated;
      });

      recordLifecycleEvent({
        stage: "LOCAL_CREATION",
        resourceId: localId,
        resourceTitle: localResource.title,
        resourceType: emergencyFallback.type,
        status: "warn",
        message: `[Cattura ${captureSessionId}] Fallback emergenza: risorsa creata offline (conteggio: ${countBefore} -> ${countAfter}): "${localResource.title}"`,
        details: { captureSessionId, localId, error: error?.message, countBefore, countAfter },
      });

      checkAndLogFilterVisibility(localResource, captureSessionId, "Fallback Emergenza");

      setCaptureStage("success");
      setCaptureStageMessage("Completato (Offline)!");
      setStatusMessage(
        schemaReport.isDraft
          ? `Risorsa "${localResource.title}" salvata come Bozza (Draft) nel Vault!`
          : `Risorsa "${localResource.title}" salvata nel Vault!`
      );
      setTimeout(() => setStatusMessage(null), 4000);
      return true;
    } finally {
      clearTimeout(safetyTimer);
      setTimeout(() => {
        setIsAnalyzing(false);
        setCaptureStage("idle");
        setCaptureStageMessage("");
        setTransformationCategory(null);
      }, 1500);
    }
  };

  return {
    rawFiles,
    setRawFiles,
    isLoadingRawFiles,
    isConvertingRawFileId,
    isAnalyzing,
    captureStage,
    captureStageMessage,
    transformationCategory,
    analyzeWithAI,
    handleCapture,
    handleCaptureFile,
    handleRefactorDocument,
    handleUploadRawFile,
    handleDeleteRawFile,
    handleConvertFileToOKF,
  };
}
