import { OKFEntity, OKFRelation, ResourceType } from "../types";
import { AgenticQueryResponse, CitedResourceMeta } from "../components/VaultIntelligenceDrawer";

export interface OKFExportOptions {
  query: string;
  response: AgenticQueryResponse;
  mode?: string;
  timestamp?: string;
}

/**
 * Pulisce una stringa per l'utilizzo sicuro come nome file su Windows, macOS e Linux.
 */
export function sanitizeFilename(title: string, ext: string = "md"): string {
  const cleanTitle = title
    .replace(/^[#\s*]+/, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60);

  const dateStr = new Date().toISOString().split("T")[0];
  return `${cleanTitle}_${dateStr}.${ext.replace(/^\./, "")}`;
}

/**
 * Costruisce l'intestazione YAML frontmatter conforme allo standard OKF v0.2.
 */
export function buildOKFYamlFrontmatter(
  title: string,
  docType: string = "concept",
  domain: string = "ai-intelligence-synthesis",
  tags: string[] = [],
  entities: OKFEntity[] = [],
  relations: OKFRelation[] = [],
  extraMeta: Record<string, any> = {}
): string {
  const lines: string[] = [
    "---",
    `okf_version: "0.2"`,
    `id: "synth-${Date.now()}"`,
    `title: ${JSON.stringify(title)}`,
    `type: ${JSON.stringify(docType)}`,
    `domain: ${JSON.stringify(domain)}`,
  ];

  // Tags
  if (tags.length > 0) {
    lines.push("tags:");
    tags.forEach((t) => lines.push(`  - ${JSON.stringify(t)}`));
  } else {
    lines.push("tags: []");
  }

  // Entities
  if (entities.length > 0) {
    lines.push("entities:");
    entities.forEach((ent) => {
      lines.push(`  - name: ${JSON.stringify(ent.name)}`);
      lines.push(`    type: ${JSON.stringify(ent.type || "concept")}`);
      if (ent.description) {
        lines.push(`    description: ${JSON.stringify(ent.description)}`);
      }
    });
  } else {
    lines.push("entities: []");
  }

  // Relations
  if (relations.length > 0) {
    lines.push("relations:");
    relations.forEach((rel) => {
      lines.push(`  - targetTitle: ${JSON.stringify(rel.targetTitle || rel.target || "Resource")}`);
      if (rel.targetId) {
        lines.push(`    targetId: ${JSON.stringify(rel.targetId)}`);
      }
      lines.push(`    relationType: ${JSON.stringify(rel.relationType || "references")}`);
      lines.push(`    weight: ${rel.weight || 0.85}`);
      if (rel.description) {
        lines.push(`    description: ${JSON.stringify(rel.description)}`);
      }
    });
  } else {
    lines.push("relations: []");
  }

  // Extra Metadata (source query, engine, etc.)
  lines.push(`created_at: ${JSON.stringify(extraMeta.createdAt || new Date().toISOString())}`);
  if (extraMeta.sourceQuery) {
    lines.push(`source_query: ${JSON.stringify(extraMeta.sourceQuery)}`);
  }
  if (extraMeta.engineModel) {
    lines.push(`engine_model: ${JSON.stringify(extraMeta.engineModel)}`);
  }
  if (extraMeta.mode) {
    lines.push(`query_mode: ${JSON.stringify(extraMeta.mode)}`);
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Estrae entità e relazioni automatiche a partire dalle risorse citate dal motore.
 */
export function extractEntitiesAndRelationsFromCitations(
  citedResources: CitedResourceMeta[]
): { entities: OKFEntity[]; relations: OKFRelation[] } {
  const entities: OKFEntity[] = [];
  const relations: OKFRelation[] = [];

  const seenEntities = new Set<string>();

  citedResources.forEach((res) => {
    // Aggiungi entità associata alla risorsa citata
    if (!seenEntities.has(res.title)) {
      seenEntities.add(res.title);
      entities.push({
        name: res.title,
        type: res.type === "mcp_server" ? "tool" : res.type === "github_repo" ? "repository" : "concept",
        description: res.domain ? `Risorsa Vault in ambito ${res.domain}` : "Risorsa citata nella sintesi epistemica",
      });
    }

    // Aggiungi arco relazionale esplicito
    relations.push({
      targetId: res.id,
      targetTitle: res.title,
      relationType: "references",
      weight: 0.85,
      description: res.relevanceReason || `Citata come fonte autoritativa per la sintesi multi-agente`,
    });
  });

  return { entities, relations };
}

/**
 * Genera il testo Markdown completo con frontmatter YAML conforme a OKF v0.2.
 */
export function buildOKFMarkdown(options: OKFExportOptions): { title: string; markdown: string } {
  const { query, response, mode } = options;
  const rawTitle = `Sintesi Vault: ${query.replace(/^[#\s*]+/, "").slice(0, 60)}`;
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

  const { entities, relations } = extractEntitiesAndRelationsFromCitations(response.citedResources || []);

  const domain = response.citedResources?.[0]?.domain || "AI Knowledge Engineering";
  const tags = Array.from(
    new Set([
      "vault-intelligence",
      "ai-synthesis",
      "okf-v0.2",
      mode || "quick_synthesis",
      ...(response.citedResources?.flatMap((r) => r.tags || []) || []).slice(0, 4),
    ])
  );

  const frontmatter = buildOKFYamlFrontmatter(
    title,
    "concept",
    domain,
    tags,
    entities,
    relations,
    {
      sourceQuery: query,
      engineModel: response.stats?.modelUsed || "gemini-3.7-flash",
      mode: mode || response.mode,
      createdAt: new Date().toISOString(),
    }
  );

  const fullMarkdown = [
    frontmatter,
    "",
    `# ${title}`,
    "",
    `> **Query di Origine**: "${query}"  `,
    `> **Generato da**: Vault Intelligence (${response.stats?.modelUsed || "gemini-3.7-flash"}) con validazione Cekikj Zero-Guessing.  `,
    `> **Fonti Verificate**: ${response.citedResources?.length || 0} risorse nel Vault.`,
    "",
    response.answer,
  ].join("\n");

  return { title, markdown: fullMarkdown };
}

/**
 * Genera il payload JSON completo strutturato per l'esportazione o pipeline esterne.
 */
export function buildStructuredJSON(options: OKFExportOptions): string {
  const { query, response, mode, timestamp } = options;
  const { entities, relations } = extractEntitiesAndRelationsFromCitations(response.citedResources || []);

  const payload = {
    okf_version: "0.2",
    id: `export-${Date.now()}`,
    sourceQuery: query,
    mode: mode || response.mode,
    timestamp: timestamp || new Date().toISOString(),
    modelUsed: response.stats?.modelUsed,
    insufficient: response.insufficient,
    summary: response.summary,
    answer: response.answer,
    entities,
    relations,
    citedResources: response.citedResources,
    orchestratorPlan: response.orchestratorPlan,
    agentTrace: response.trace,
    stats: response.stats,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Avvia il download lato client di un file di testo (Markdown o JSON).
 */
export function downloadBlobFile(filename: string, content: string, mimeType: string = "text/markdown;charset=utf-8"): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Errore durante il download del file:", err);
  }
}
