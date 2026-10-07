import { FunctionDeclaration, Type } from "@google/genai";
import { ResourceItem, ResourceType } from "../../src/types";
import { AgentTraceStep } from "../vaultAgents";

// ============================================================================
// 1. JSON Schema Declarations for Gemini Tool Calling
// ============================================================================

export const vaultFunctionDeclarations: FunctionDeclaration[] = [
  {
    name: "search_vault",
    description: "Searches through the user's curated Knowledge Vault resources by semantic keywords, optional tags, or resource type (e.g. concept, architecture, github_repo, mcp_server, guide).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Search terms, topic or entity name to look up in the Vault titles, summaries, tags, and Markdown bodies.",
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Optional list of tags to filter by (e.g. ['mcp', 'agentic-framework']).",
        },
        type: {
          type: Type.STRING,
          description: "Optional resource type filter: 'concept', 'architecture', 'github_repo', 'mcp_server', 'guide', 'ai_skill', 'article', 'specification'.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "traverse_graph_relations",
    description: "Traverses ontological relations and links in the D3 Knowledge Graph from a specific resource ID up to depth 2 (Hard Bound according to Cekikj architecture).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        resourceId: {
          type: Type.STRING,
          description: "The unique ID of the source resource to start graph traversal from.",
        },
        depth: {
          type: Type.INTEGER,
          description: "Depth of traversal in graph hops (1 or 2). Default is 1.",
        },
      },
      required: ["resourceId"],
    },
  },
  {
    name: "verify_grounding_evidence",
    description: "Audits and verifies whether a specific claim is grounded in the specified resource's executive summary, Markdown content, or metadata (Zero-Guessing Guard).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        claim: {
          type: Type.STRING,
          description: "The statement, assertion, or technical claim to verify against the Vault document.",
        },
        sourceId: {
          type: Type.STRING,
          description: "The resource ID in the Vault expected to support this claim.",
        },
      },
      required: ["claim", "sourceId"],
    },
  },
];

// ============================================================================
// 2. Deterministic Implementations of Vault Tools
// ============================================================================

export interface SearchVaultResult {
  totalMatches: number;
  results: Array<{
    id: string;
    title: string;
    type: ResourceType;
    domain?: string;
    tags: string[];
    summary: string;
    excerpt: string;
    score: number;
  }>;
}

export function executeSearchVault(
  args: { query: string; tags?: string[]; type?: string },
  resources: ResourceItem[]
): { output: SearchVaultResult; trace: AgentTraceStep } {
  const queryWords = (args.query || "")
    .toLowerCase()
    .replace(/[^\w\sàèéìòù]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const filterTags = Array.isArray(args.tags) ? args.tags.map((t) => t.toLowerCase()) : [];
  const filterType = args.type ? args.type.toLowerCase() : null;

  const scored: Array<{
    id: string;
    title: string;
    type: ResourceType;
    domain?: string;
    tags: string[];
    summary: string;
    excerpt: string;
    score: number;
  }> = [];

  for (const r of resources) {
    if (filterType && r.type.toLowerCase() !== filterType) {
      continue;
    }

    if (filterTags.length > 0) {
      const rTagsLower = (r.tags || []).map((t) => t.toLowerCase());
      const hasTag = filterTags.some((ft) => rTagsLower.includes(ft));
      if (!hasTag) continue;
    }

    let score = 0;
    const titleLower = (r.title || "").toLowerCase();
    const summaryLower = (r.summary || "").toLowerCase();
    const mdLower = (r.metadata?.markdownContent || "").toLowerCase();
    const domainLower = (r.metadata?.domain || "").toLowerCase();

    for (const w of queryWords) {
      if (titleLower.includes(w)) score += 6;
      if (summaryLower.includes(w)) score += 3;
      if (domainLower.includes(w)) score += 4;
      if (mdLower.includes(w)) score += 2;
    }

    if (r.tags) {
      for (const tag of r.tags) {
        if (queryWords.some((w) => tag.toLowerCase().includes(w))) score += 4;
      }
    }

    if (score > 0 || (queryWords.length === 0 && (filterTags.length > 0 || filterType))) {
      let excerpt = r.summary || "";
      if (r.metadata?.aiExecutiveSummary) {
        excerpt = r.metadata.aiExecutiveSummary;
      } else if (r.metadata?.markdownContent) {
        excerpt = r.metadata.markdownContent.slice(0, 260).replace(/#+\s/g, "") + "...";
      }

      scored.push({
        id: r.id,
        title: r.title,
        type: r.type,
        domain: r.metadata?.domain,
        tags: r.tags || [],
        summary: r.summary || "",
        excerpt: excerpt.slice(0, 240),
        score: Math.max(score, 1),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, 8);

  const trace: AgentTraceStep = {
    agent: "deep_analyst",
    action: `Tool: search_vault("${args.query}")`,
    description: `Ricerca completata: ${topResults.length} risorse identificate (su ${scored.length} match totali).`,
    itemsFound: topResults.length,
    status: topResults.length > 0 ? "success" : "insufficient",
    timestamp: new Date().toISOString(),
  };

  return {
    output: {
      totalMatches: scored.length,
      results: topResults,
    },
    trace,
  };
}

export interface TraverseGraphResult {
  sourceId: string;
  sourceTitle: string;
  hopCount: number;
  relations: Array<{
    sourceTitle: string;
    relationType: string;
    targetTitle: string;
    targetId?: string;
    hop: number;
  }>;
  connectedNodes: Array<{
    id: string;
    title: string;
    type: ResourceType;
    domain?: string;
  }>;
}

export function executeTraverseGraphRelations(
  args: { resourceId: string; depth?: number },
  resources: ResourceItem[]
): { output: TraverseGraphResult | { error: string }; trace: AgentTraceStep } {
  const source = resources.find((r) => r.id === args.resourceId);
  if (!source) {
    return {
      output: { error: `Resource with ID "${args.resourceId}" not found in Vault.` },
      trace: {
        agent: "graph_navigator",
        action: `Tool: traverse_graph_relations("${args.resourceId}")`,
        description: `Nodo di origine "${args.resourceId}" non trovato nel grafo.`,
        itemsFound: 0,
        status: "insufficient",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const maxHops = Math.min(Math.max(args.depth || 1, 1), 2); // Hard bound: max 2 hops
  const titleToResource = new Map<string, ResourceItem>();
  resources.forEach((r) => titleToResource.set(r.title.toLowerCase(), r));

  const relations: TraverseGraphResult["relations"] = [];
  const connectedNodesMap = new Map<string, { id: string; title: string; type: ResourceType; domain?: string }>();

  // Hop 1: Relazioni uscenti dal nodo sorgente
  if (Array.isArray(source.metadata?.relations)) {
    for (const rel of source.metadata.relations) {
      if (rel.targetTitle) {
        const targetRes = titleToResource.get(rel.targetTitle.toLowerCase());
        relations.push({
          sourceTitle: source.title,
          relationType: rel.relationType || rel.type || "correlato",
          targetTitle: rel.targetTitle,
          targetId: targetRes?.id,
          hop: 1,
        });

        if (targetRes && targetRes.id !== source.id) {
          connectedNodesMap.set(targetRes.id, {
            id: targetRes.id,
            title: targetRes.title,
            type: targetRes.type,
            domain: targetRes.metadata?.domain,
          });
        }
      }
    }
  }

  // Hop 1: Relazioni entranti (reverse edges nel grafo)
  resources.forEach((r) => {
    if (r.id !== source.id && Array.isArray(r.metadata?.relations)) {
      r.metadata.relations.forEach((rel) => {
        if (rel.targetTitle && rel.targetTitle.toLowerCase() === source.title.toLowerCase()) {
          relations.push({
            sourceTitle: r.title,
            relationType: rel.relationType || rel.type || "correlato",
            targetTitle: source.title,
            targetId: source.id,
            hop: 1,
          });
          connectedNodesMap.set(r.id, {
            id: r.id,
            title: r.title,
            type: r.type,
            domain: r.metadata?.domain,
          });
        }
      });
    }
  });

  // Hop 2 (se depth >= 2): espande dai nodi di primo livello
  if (maxHops === 2 && connectedNodesMap.size > 0 && connectedNodesMap.size < 12) {
    const hop1Nodes = Array.from(connectedNodesMap.keys());
    for (const hop1Id of hop1Nodes) {
      const hop1Res = resources.find((r) => r.id === hop1Id);
      if (hop1Res && Array.isArray(hop1Res.metadata?.relations)) {
        for (const rel of hop1Res.metadata.relations) {
          if (rel.targetTitle) {
            const targetRes2 = titleToResource.get(rel.targetTitle.toLowerCase());
            if (targetRes2 && targetRes2.id !== source.id && !connectedNodesMap.has(targetRes2.id)) {
              relations.push({
                sourceTitle: hop1Res.title,
                relationType: rel.relationType || rel.type || "correlato",
                targetTitle: rel.targetTitle,
                targetId: targetRes2.id,
                hop: 2,
              });
              connectedNodesMap.set(targetRes2.id, {
                id: targetRes2.id,
                title: targetRes2.title,
                type: targetRes2.type,
                domain: targetRes2.metadata?.domain,
              });
            }
          }
        }
      }
    }
  }

  const connectedNodes = Array.from(connectedNodesMap.values()).slice(0, 15);
  const trace: AgentTraceStep = {
    agent: "graph_navigator",
    action: `Tool: traverse_graph_relations("${source.title}", depth: ${maxHops})`,
    description: `Traversale completata: individuati ${relations.length} archi e ${connectedNodes.length} nodi topologicamente collegati.`,
    itemsFound: connectedNodes.length,
    status: connectedNodes.length > 0 ? "success" : "warning",
    timestamp: new Date().toISOString(),
  };

  return {
    output: {
      sourceId: source.id,
      sourceTitle: source.title,
      hopCount: maxHops,
      relations: relations.slice(0, 15),
      connectedNodes,
    },
    trace,
  };
}

export interface VerifyGroundingResult {
  grounded: boolean;
  confidenceScore: number;
  matchedKeywords: string[];
  evidenceExcerpt: string;
  sourceTitle: string;
  auditMessage: string;
}

export function executeVerifyGroundingEvidence(
  args: { claim: string; sourceId: string },
  resources: ResourceItem[]
): { output: VerifyGroundingResult; trace: AgentTraceStep } {
  const resource = resources.find((r) => r.id === args.sourceId);
  if (!resource) {
    const trace: AgentTraceStep = {
      agent: "grounding_verifier",
      action: `Tool: verify_grounding_evidence("${args.sourceId}")`,
      description: `Verifica fallita: Risorsa con ID "${args.sourceId}" inesistente nel Vault.`,
      status: "insufficient",
      timestamp: new Date().toISOString(),
    };
    return {
      output: {
        grounded: false,
        confidenceScore: 0,
        matchedKeywords: [],
        evidenceExcerpt: "",
        sourceTitle: "Sconosciuta",
        auditMessage: "Zero-Guessing Guard: ID risorsa inesistente.",
      },
      trace,
    };
  }

  const claimWords = (args.claim || "")
    .toLowerCase()
    .replace(/[^\w\sàèéìòù]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const textToScan = [
    resource.title,
    resource.summary,
    resource.metadata?.aiExecutiveSummary,
    resource.metadata?.markdownContent,
    ...(resource.tags || []),
    ...(Array.isArray(resource.metadata?.entities)
      ? resource.metadata.entities.map((e) => (typeof e === "string" ? e : e.name))
      : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matchedKeywords = claimWords.filter((word) => textToScan.includes(word));
  const ratio = claimWords.length > 0 ? matchedKeywords.length / claimWords.length : 0;
  const grounded = ratio >= 0.4 || matchedKeywords.length >= 2;

  let evidenceExcerpt = resource.metadata?.aiExecutiveSummary || resource.summary || "";
  if (resource.metadata?.markdownContent) {
    const firstMatch = matchedKeywords[0];
    if (firstMatch) {
      const idx = resource.metadata.markdownContent.toLowerCase().indexOf(firstMatch);
      if (idx !== -1) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(resource.metadata.markdownContent.length, idx + 200);
        evidenceExcerpt = "..." + resource.metadata.markdownContent.slice(start, end).replace(/[\r\n]+/g, " ") + "...";
      }
    }
  }

  const trace: AgentTraceStep = {
    agent: "grounding_verifier",
    action: `Tool: verify_grounding_evidence("${resource.title}")`,
    description: grounded
      ? `Asserzione verificata con successo (${Math.round(ratio * 100)}% concordanza semantica su ${matchedKeywords.length} token).`
      : `Allerta Epistemica: Evidenza insufficiente per il claim nel documento "${resource.title}".`,
    status: grounded ? "success" : "insufficient",
    timestamp: new Date().toISOString(),
  };

  return {
    output: {
      grounded,
      confidenceScore: Math.round(ratio * 100) / 100,
      matchedKeywords,
      evidenceExcerpt: evidenceExcerpt.slice(0, 240),
      sourceTitle: resource.title,
      auditMessage: grounded
        ? "Grounding accertato nel corpus documentale del Vault."
        : "Zero-Guessing Guard: Informazione non sufficientemente supportata.",
    },
    trace,
  };
}

// ============================================================================
// 3. Central Tool Dispatcher Function
// ============================================================================

export function dispatchVaultTool(
  toolName: string,
  args: any,
  resources: ResourceItem[]
): { output: any; trace: AgentTraceStep } {
  switch (toolName) {
    case "search_vault":
      return executeSearchVault(args || { query: "" }, resources);
    case "traverse_graph_relations":
      return executeTraverseGraphRelations(args || { resourceId: "" }, resources);
    case "verify_grounding_evidence":
      return executeVerifyGroundingEvidence(args || { claim: "", sourceId: "" }, resources);
    default:
      return {
        output: { error: `Unknown tool function "${toolName}"` },
        trace: {
          agent: "orchestrator",
          action: `Dispatch unknown tool: ${toolName}`,
          description: `Tentativo di invocazione di strumento non registrato.`,
          status: "insufficient",
          timestamp: new Date().toISOString(),
        },
      };
  }
}
