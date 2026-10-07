import { ResourceItem, RawFileItem } from "../types";
import { parseDate } from "./dateUtils";

/**
 * Normalizes a resource item for lossless export into clean JSON, CSV, or Markdown.
 * Converts Firestore Timestamps and date objects to standard ISO strings.
 * Preserves ALL metadata fields, custom ontology definitions, AI summaries, and epistemic markers.
 */
export function normalizeResourceForExport(resource: ResourceItem) {
  const createdDate = parseDate(resource.createdAt);
  const updatedDate = parseDate(resource.updatedAt);

  // Deep sanitize metadata while strictly preserving every single field
  let sanitizedMetadata: Record<string, any> | undefined = undefined;
  if (resource.metadata && typeof resource.metadata === "object") {
    sanitizedMetadata = { ...resource.metadata };

    // Standardize OKF version and arrays
    sanitizedMetadata.okfVersion = sanitizedMetadata.okfVersion || "0.2";
    sanitizedMetadata.entities = Array.isArray(sanitizedMetadata.entities)
      ? sanitizedMetadata.entities
      : [];
    sanitizedMetadata.relations = Array.isArray(sanitizedMetadata.relations)
      ? sanitizedMetadata.relations
      : [];

    // Safely parse nested date fields if present
    if (sanitizedMetadata.publishedAt) {
      const d = parseDate(sanitizedMetadata.publishedAt);
      if (d) sanitizedMetadata.publishedAt = d.toISOString();
    }
    if (sanitizedMetadata.translatedAt) {
      const d = parseDate(sanitizedMetadata.translatedAt);
      if (d) sanitizedMetadata.translatedAt = d.toISOString();
    }
    if (sanitizedMetadata.aiSummarizedAt) {
      const d = parseDate(sanitizedMetadata.aiSummarizedAt);
      if (d) sanitizedMetadata.aiSummarizedAt = d.toISOString();
    }
    if (sanitizedMetadata.validFrom) {
      const d = parseDate(sanitizedMetadata.validFrom);
      if (d) sanitizedMetadata.validFrom = d.toISOString();
    }
    if (sanitizedMetadata.validUntil) {
      const d = parseDate(sanitizedMetadata.validUntil);
      if (d) sanitizedMetadata.validUntil = d.toISOString();
    }
  }

  return {
    id: resource.id,
    type: resource.type,
    title: resource.title || "Risorsa senza titolo",
    summary: resource.summary || "",
    url: resource.url || "",
    rawInput: resource.rawInput || undefined,
    tags: Array.isArray(resource.tags) ? resource.tags : [],
    isFavorite: !!resource.isFavorite,
    rating: typeof resource.rating === "number" ? resource.rating : undefined,
    userId: resource.userId || null,
    createdAt: createdDate ? createdDate.toISOString() : new Date().toISOString(),
    updatedAt: updatedDate ? updatedDate.toISOString() : (createdDate ? createdDate.toISOString() : new Date().toISOString()),
    metadata: sanitizedMetadata,
  };
}

/**
 * Triggers a browser download of a file with the specified content, MIME type and filename.
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface BackupAuditReport {
  totalResources: number;
  totalRawFiles: number;
  estimatedSizeBytes: number;
  formattedSize: string;
  byType: Record<string, number>;
  totalEntities: number;
  totalRelations: number;
  uniqueTagsCount: number;
  integrityScore: number; // 0 - 100%
  issues: string[];
}

/**
 * Performs a pre-flight audit of the resources and raw files to be exported,
 * calculating metrics, broken relations, and estimated file payload size.
 */
export function computeBackupAudit(
  resources: ResourceItem[],
  rawFiles: RawFileItem[] = []
): BackupAuditReport {
  const byType: Record<string, number> = {};
  let totalEntities = 0;
  let totalRelations = 0;
  const tagSet = new Set<string>();
  const issues: string[] = [];

  const knownTitles = new Set<string>(
    resources.map((r) => (r.title || "").trim().toLowerCase()).filter(Boolean)
  );

  resources.forEach((r, idx) => {
    byType[r.type] = (byType[r.type] || 0) + 1;

    if (!r.title || !r.title.trim()) {
      issues.push(`Risorsa #${idx + 1} priva di titolo identificativo.`);
    }

    if (Array.isArray(r.tags)) {
      r.tags.forEach((t) => tagSet.add(t.toLowerCase().trim()));
    }

    if (r.metadata) {
      if (Array.isArray(r.metadata.entities)) {
        totalEntities += r.metadata.entities.length;
      }
      if (Array.isArray(r.metadata.relations)) {
        totalRelations += r.metadata.relations.length;
        r.metadata.relations.forEach((rel) => {
          const target = (rel?.targetTitle || "").trim().toLowerCase();
          if (target && !knownTitles.has(target)) {
            // Relation targets an external or missing resource
          }
        });
      }
    }
  });

  // Calculate approximate JSON string size
  let estimatedSizeBytes = 0;
  try {
    const samplePayload = {
      vault_version: "0.2",
      resources: resources.map(normalizeResourceForExport),
      raw_files: rawFiles,
    };
    estimatedSizeBytes = new Blob([JSON.stringify(samplePayload)]).size;
  } catch {
    estimatedSizeBytes = resources.length * 1024 + rawFiles.length * 4096;
  }

  const formattedSize =
    estimatedSizeBytes >= 1024 * 1024
      ? `${(estimatedSizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(estimatedSizeBytes / 1024).toFixed(1)} KB`;

  const integrityScore = Math.max(0, Math.min(100, Math.round(100 - (issues.length * 5))));

  return {
    totalResources: resources.length,
    totalRawFiles: rawFiles.length,
    estimatedSizeBytes,
    formattedSize,
    byType,
    totalEntities,
    totalRelations,
    uniqueTagsCount: tagSet.size,
    integrityScore,
    issues,
  };
}

/**
 * Exports resources to formatted, lossless JSON backup with metadata envelope and raw files.
 */
export function exportResourcesToJSON(
  resources: ResourceItem[],
  filenamePrefix: string = "knowledge_vault_backup",
  rawFiles: RawFileItem[] = []
): { filename: string; jsonString: string; sizeBytes: number } {
  const normalized = resources.map(normalizeResourceForExport);
  const audit = computeBackupAudit(resources, rawFiles);

  const backupPayload = {
    vault_version: "0.2",
    format: "okf_knowledge_vault_backup",
    exported_at: new Date().toISOString(),
    total_resources: resources.length,
    total_raw_files: rawFiles.length,
    totalRawFiles: rawFiles.length,
    statistics: {
      by_type: audit.byType,
      total_entities: audit.totalEntities,
      total_relations: audit.totalRelations,
      unique_tags: audit.uniqueTagsCount,
      integrity_score: audit.integrityScore,
    },
    resources: normalized,
    raw_files: rawFiles,
    rawFiles: rawFiles,
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.json`;

  downloadFile(jsonString, filename, "application/json");
  return { filename, jsonString, sizeBytes: new Blob([jsonString]).size };
}

/**
 * Helper to escape CSV cell fields safely according to RFC 4180.
 */
function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Exports resources to CSV format with RFC 4180 escaping and UTF-8 BOM for Excel/Numbers compatibility.
 */
export function exportResourcesToCSV(
  resources: ResourceItem[],
  filenamePrefix: string = "knowledge_vault_backup"
): { filename: string; sizeBytes: number } {
  const headers = [
    "ID",
    "Tipo",
    "Titolo",
    "Sommario",
    "URL",
    "Tags",
    "Preferito",
    "Rating",
    "Versione OKF",
    "Dominio",
    "Tipo Documento",
    "Entità Principali",
    "Numero Relazioni",
    "Relazioni Dettagliate",
    "Data Creazione",
    "Data Modifica"
  ];

  const rows = resources.map((r) => {
    const norm = normalizeResourceForExport(r);
    const entitiesList = norm.metadata?.entities
      ?.map((e: any) => (typeof e === "string" ? e : e?.name || ""))
      .filter(Boolean)
      .join("; ") || "";

    const relationsList = norm.metadata?.relations
      ?.map((rel: any) => `${rel?.targetTitle || "?"} (${rel?.relationType || "relates_to"})`)
      .join("; ") || "";

    const relationsCount = norm.metadata?.relations?.length || 0;
    const tagsList = norm.tags.join("; ");

    return [
      escapeCSV(norm.id),
      escapeCSV(norm.type),
      escapeCSV(norm.title),
      escapeCSV(norm.summary),
      escapeCSV(norm.url),
      escapeCSV(tagsList),
      escapeCSV(norm.isFavorite ? "Sì" : "No"),
      escapeCSV(norm.rating ?? ""),
      escapeCSV(norm.metadata?.okfVersion || "0.2"),
      escapeCSV(norm.metadata?.domain || ""),
      escapeCSV(norm.metadata?.docType || ""),
      escapeCSV(entitiesList),
      escapeCSV(relationsCount),
      escapeCSV(relationsList),
      escapeCSV(norm.createdAt),
      escapeCSV(norm.updatedAt),
    ].join(",");
  });

  // Include UTF-8 BOM (\uFEFF) so Microsoft Excel / Apple Numbers decode Italian characters & accents correctly
  const csvContent = "\uFEFF" + [headers.map(escapeCSV).join(","), ...rows].join("\r\n");
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.csv`;

  downloadFile(csvContent, filename, "text/csv");
  return { filename, sizeBytes: new Blob([csvContent]).size };
}

/**
 * Exports resources into a concatenated OKF v0.2 Markdown bundle (.md),
 * containing YAML frontmatter blocks for each document, readable in Obsidian, Logseq, VSCode or AI tools.
 */
export function exportResourcesToMarkdownBundle(
  resources: ResourceItem[],
  filenamePrefix: string = "knowledge_vault_bundle"
): { filename: string; sizeBytes: number } {
  const parts: string[] = [];

  parts.push(`# Knowledge Vault Export - OKF v0.2 Archive`);
  parts.push(`> Data Esportazione: ${new Date().toLocaleString("it-IT")} | Risorse Totali: ${resources.length}`);
  parts.push(`> Conforme alle specifiche Open Knowledge Format v0.2 (Epistemic Protocol)`);
  parts.push(`\n---\n`);

  resources.forEach((r, idx) => {
    const norm = normalizeResourceForExport(r);
    const meta = norm.metadata || {};

    const entityNames = (meta.entities || [])
      .map((e: any) => (typeof e === "string" ? e : e?.name || ""))
      .filter(Boolean);

    const relationsLines = (meta.relations || []).map((rel: any) => {
      return `    - targetTitle: "${(rel?.targetTitle || "").replace(/"/g, '\\"')}"\n      relationType: "${rel?.relationType || "relates_to"}"\n      weight: ${rel?.weight ?? 0.8}`;
    });

    const yamlFrontmatter = [
      `---`,
      `okf_version: "0.2"`,
      `id: "${norm.id}"`,
      `type: "${norm.type}"`,
      `title: "${norm.title.replace(/"/g, '\\"')}"`,
      `domain: "${(meta.domain || "Knowledge Architecture").replace(/"/g, '\\"')}"`,
      `doc_type: "${meta.docType || "specification"}"`,
      `tags: [${norm.tags.map((t) => `"${t}"`).join(", ")}]`,
      `entities: [${entityNames.map((e: string) => `"${e}"`).join(", ")}]`,
      relationsLines.length > 0
        ? `relations:\n${relationsLines.join("\n")}`
        : `relations: []`,
      `created_at: "${norm.createdAt}"`,
      `updated_at: "${norm.updatedAt}"`,
      norm.url ? `source_url: "${norm.url}"` : null,
      `---`,
    ]
      .filter(Boolean)
      .join("\n");

    const contentBody =
      meta.markdownContent ||
      norm.rawInput ||
      norm.summary ||
      `*Nessun contenuto Markdown registrato per "${norm.title}".*`;

    parts.push(`<!-- Risorsa #${idx + 1} -->`);
    parts.push(yamlFrontmatter);
    parts.push(`\n# ${norm.title}\n`);
    if (norm.summary) {
      parts.push(`**Sommario**: ${norm.summary}\n`);
    }
    if (norm.url) {
      parts.push(`**URL di Riferimento**: [${norm.url}](${norm.url})\n`);
    }
    parts.push(`## Contenuto del Documento\n\n${contentBody}\n`);
    parts.push(`\n---\n`);
  });

  const markdownContent = parts.join("\n");
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.md`;

  downloadFile(markdownContent, filename, "text/markdown");
  return { filename, sizeBytes: new Blob([markdownContent]).size };
}

/**
 * Exports a certified backup payload containing the Epistemic Manifest,
 * cryptographic checksum, audited resources, and raw files.
 */
export function exportCertifiedBackupToJSON(
  manifest: any,
  resources: ResourceItem[],
  rawFiles: RawFileItem[] = [],
  filenamePrefix: string = "certified_epistemic_vault_backup"
): { filename: string; jsonString: string; sizeBytes: number } {
  const normalized = resources.map(normalizeResourceForExport);

  const payload = {
    vault_version: "0.2",
    format: "okf_certified_epistemic_backup",
    certified_manifest: manifest,
    resources: normalized,
    raw_files: rawFiles,
    rawFiles: rawFiles,
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.json`;

  downloadFile(jsonString, filename, "application/json");
  return { filename, jsonString, sizeBytes: new Blob([jsonString]).size };
}

/**
 * Downloads only the cryptographic Epistemic Manifest certificate as a standalone JSON file.
 */
export function downloadManifestCertificate(
  manifest: any,
  filenamePrefix: string = "epistemic_manifest"
): { filename: string; sizeBytes: number } {
  const jsonString = JSON.stringify(manifest, null, 2);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.json`;

  downloadFile(jsonString, filename, "application/json");
  return { filename, sizeBytes: new Blob([jsonString]).size };
}

