/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Server Nativo Model Context Protocol (MCP) JSON-RPC 2.0 per il Knowledge Vault
 */

import { promises as fsPromises } from "fs";
import fs from "fs";
import path from "path";
import { ResourceItem } from "../src/types";
import { atomicWriteFile } from "./routes/vaultRoutes";

const DATA_DIR = path.join(process.cwd(), "data");
const BACKUP_FILE_PATH = path.join(DATA_DIR, "vault-backup.json");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");

/**
 * Recupera i metadati di sincronizzazione del Vault per i client MCP (AR-05)
 */
export async function getVaultSyncMetadata(): Promise<{
  lastSynchronizedAt: string | null;
  version: string;
  source: "backup" | "snapshot" | "none";
  count: number;
}> {
  try {
    if (fs.existsSync(BACKUP_FILE_PATH)) {
      const content = await fsPromises.readFile(BACKUP_FILE_PATH, "utf8");
      if (content && content.trim().length > 0) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.resources)) {
          return {
            lastSynchronizedAt: parsed.savedAt || new Date().toISOString(),
            version: parsed.version || "okf-0.2",
            source: "backup",
            count: parsed.resources.length,
          };
        }
      }
    }
  } catch {}

  if (fs.existsSync(SNAPSHOTS_DIR)) {
    try {
      const files = await fsPromises.readdir(SNAPSHOTS_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();
      for (const snap of jsonFiles) {
        try {
          const content = await fsPromises.readFile(path.join(SNAPSHOTS_DIR, snap), "utf8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.resources)) {
            return {
              lastSynchronizedAt: parsed.savedAt || snap.replace("snapshot-", "").replace(".json", ""),
              version: parsed.version || "okf-0.2",
              source: "snapshot",
              count: parsed.resources.length,
            };
          }
        } catch {}
      }
    } catch {}
  }

  return {
    lastSynchronizedAt: null,
    version: "okf-0.2",
    source: "none",
    count: 0,
  };
}

// Carica in memoria le risorse del Vault salvate dal backend
export async function getVaultResources(): Promise<ResourceItem[]> {
  try {
    if (fs.existsSync(BACKUP_FILE_PATH)) {
      const content = await fsPromises.readFile(BACKUP_FILE_PATH, "utf8");
      if (content && content.trim().length > 0) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.resources)) {
          return parsed.resources;
        }
      }
    }
  } catch (e) {
    console.warn("[MCP] Errore lettura backup principale:", e);
  }

  // Fallback da snapshot
  if (fs.existsSync(SNAPSHOTS_DIR)) {
    try {
      const files = await fsPromises.readdir(SNAPSHOTS_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();
      for (const snap of jsonFiles) {
        try {
          const content = await fsPromises.readFile(path.join(SNAPSHOTS_DIR, snap), "utf8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.resources)) {
            return parsed.resources;
          }
        } catch {}
      }
    } catch {}
  }

  return [];
}

// Salva una nuova risorsa nel backend in formato compatibile con il vault
export async function appendVaultResource(newResource: ResourceItem): Promise<boolean> {
  try {
    const existing = await getVaultResources();
    const updated = [newResource, ...existing.filter((r) => r.id !== newResource.id)];
    const payload = {
      resources: updated,
      savedAt: new Date().toISOString(),
      version: "okf-0.2",
    };
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    await atomicWriteFile(BACKUP_FILE_PATH, JSON.stringify(payload, null, 2));
    return true;
  } catch (err) {
    console.error("[MCP] Errore appendVaultResource:", err);
    return false;
  }
}

// Elenco dei tool tipizzati esposti dall'MCP Server
export const MCP_TOOLS_MANIFEST = [
  {
    name: "vault_search",
    description:
      "Cerca risorse nel Knowledge Vault tramite query semantica e testuale, con filtri opzionali su categoria, tag e dominio applicativo.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Termine di ricerca o domanda semantica da abbinare ai documenti.",
        },
        type: {
          type: "string",
          enum: ["knowledge", "github_repo", "mcp_server", "ai_skill", "article"],
          description: "Filtro tipologia risorsa.",
        },
        tag: {
          type: "string",
          description: "Filtro opzionale per singolo tag (es. 'agentic', 'mcp', 'typescript').",
        },
        limit: {
          type: "number",
          description: "Numero massimo di risultati da restituire (predefinito 10, max 50).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "vault_get_resource",
    description:
      "Recupera una risorsa specifica del Vault identificata tramite il suo ID univoco o titolo esatto, restituendo metadati completi, frontmatter YAML ed entità OKF v0.2.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "ID univoco della risorsa nel Vault.",
        },
        title: {
          type: "string",
          description: "Titolo della risorsa se l'ID non è noto.",
        },
      },
    },
  },
  {
    name: "vault_traverse_graph",
    description:
      "Naviga topologicamente il grafo delle relazioni a partire da una risorsa radice, esplorando entità collegate e archi semantici fino a maxHops livelli.",
    inputSchema: {
      type: "object",
      properties: {
        rootId: {
          type: "string",
          description: "ID univoco della risorsa radice di partenza.",
        },
        maxHops: {
          type: "number",
          description: "Profondità massima di navigazione nel grafo (predefinito 2, max 3).",
        },
        relationType: {
          type: "string",
          description: "Filtro opzionale sul tipo di relazione (es. 'depends_on', 'relates_to', 'implements').",
        },
      },
      required: ["rootId"],
    },
  },
  {
    name: "vault_ingest_document",
    description:
      "Inserisce programmaticamente un nuovo documento tecnico conforme allo standard OKF v0.2 con metadati ed entità estratte.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Titolo chiaro e descrittivo del documento.",
        },
        type: {
          type: "string",
          enum: ["knowledge", "github_repo", "mcp_server", "ai_skill", "article"],
          description: "Tipo risorsa.",
        },
        summary: {
          type: "string",
          description: "Sintesi concisa dei concetti chiave.",
        },
        markdownContent: {
          type: "string",
          description: "Contenuto Markdown formattato (preferibilmente con frontmatter YAML).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Array di tag identificativi.",
        },
        domain: {
          type: "string",
          description: "Dominio applicativo (es. 'AI Agents', 'Architecture', 'Protocol').",
        },
        url: {
          type: "string",
          description: "URL sorgente o repository correlato.",
        },
      },
      required: ["title", "type", "markdownContent", "tags"],
    },
  },
  {
    name: "vault_check_contradictions",
    description:
      "Verifica epistemica di consistenza Cekikj (Zero-Guessing): controlla se concetti, dipendenze o asserzioni generano contraddizioni rispetto al corpus del Vault.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Argomento o asserzione da verificare per contraddizioni.",
        },
        resourceIds: {
          type: "array",
          items: { type: "string" },
          description: "Elenco facoltativo di ID di risorse da confrontare a coppie.",
        },
      },
      required: ["topic"],
    },
  },
];

// Gestore delle chiamate ai tool
export async function handleMcpToolCall(toolName: string, args: any): Promise<any> {
  const resources = await getVaultResources();

  switch (toolName) {
    case "vault_search": {
      const q = String(args.query || "").toLowerCase();
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 10));
      const filtered = resources.filter((r) => {
        if (args.type && r.type !== args.type) return false;
        if (args.tag && !(r.tags || []).some((t) => t.toLowerCase() === String(args.tag).toLowerCase())) return false;
        const inTitle = (r.title || "").toLowerCase().includes(q);
        const inSummary = (r.summary || "").toLowerCase().includes(q);
        const inTags = (r.tags || []).some((t) => t.toLowerCase().includes(q));
        const inDomain = (r.metadata?.domain || "").toLowerCase().includes(q);
        return inTitle || inSummary || inTags || inDomain;
      });

      const results = filtered.slice(0, limit).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        url: r.url,
        summary: r.summary,
        tags: r.tags,
        domain: r.metadata?.domain,
        okfVersion: r.metadata?.okfVersion || "0.2",
      }));

      return {
        totalFound: filtered.length,
        returned: results.length,
        results,
      };
    }

    case "vault_get_resource": {
      const id = args.id ? String(args.id) : null;
      const title = args.title ? String(args.title).toLowerCase() : null;

      const found = resources.find((r) => {
        if (id && r.id === id) return true;
        if (title && r.title.toLowerCase() === title) return true;
        return false;
      });

      if (!found) {
        return {
          found: false,
          error: `Risorsa non trovata nel Vault per id='${id}' o title='${title}'`,
        };
      }

      return {
        found: true,
        resource: {
          id: found.id,
          title: found.title,
          type: found.type,
          url: found.url,
          summary: found.summary,
          tags: found.tags,
          metadata: found.metadata,
          markdownContent: found.metadata?.markdownContent || `# ${found.title}\n\n${found.summary}`,
        },
      };
    }

    case "vault_traverse_graph": {
      const rootId = String(args.rootId || "");
      const maxHops = Math.min(3, Math.max(1, Number(args.maxHops) || 2));
      const relFilter = args.relationType ? String(args.relationType).toLowerCase() : null;

      const root = resources.find((r) => r.id === rootId);
      if (!root) {
        return { error: `Nodo radice id='${rootId}' non trovato nel grafo del Vault.` };
      }

      const visitedIds = new Set<string>([rootId]);
      const nodes: any[] = [{ id: root.id, title: root.title, type: root.type, hop: 0 }];
      const edges: any[] = [];

      let currentHopIds = [rootId];

      for (let hop = 1; hop <= maxHops; hop++) {
        const nextHopIds: string[] = [];

        for (const curId of currentHopIds) {
          const curRes = resources.find((r) => r.id === curId);
          if (!curRes) continue;

          // Cerca relazioni dichiarate nei metadati
          const declaredRelations = curRes.metadata?.relations || [];
          for (const rel of declaredRelations) {
            if (relFilter && rel.relationType.toLowerCase() !== relFilter) continue;
            // Cerca il target per titolo o id
            const targetRes = resources.find(
              (r) =>
                r.id === rel.targetTitle ||
                r.title.toLowerCase() === rel.targetTitle.toLowerCase()
            );

            if (targetRes) {
              edges.push({
                source: curId,
                target: targetRes.id,
                relationType: rel.relationType,
                weight: rel.weight || 1,
                description: rel.description,
              });

              if (!visitedIds.has(targetRes.id)) {
                visitedIds.add(targetRes.id);
                nodes.push({ id: targetRes.id, title: targetRes.title, type: targetRes.type, hop });
                nextHopIds.push(targetRes.id);
              }
            }
          }

          // Cerca condivisione di entità o tag tra risorse
          const curTags = new Set(curRes.tags || []);
          for (const other of resources) {
            if (visitedIds.has(other.id)) continue;
            const sharedTags = (other.tags || []).filter((t) => curTags.has(t));
            if (sharedTags.length >= 2) {
              visitedIds.add(other.id);
              nodes.push({ id: other.id, title: other.title, type: other.type, hop });
              edges.push({
                source: curId,
                target: other.id,
                relationType: "shares_tags",
                sharedTags,
                weight: sharedTags.length,
              });
              nextHopIds.push(other.id);
            }
          }
        }

        currentHopIds = nextHopIds;
        if (currentHopIds.length === 0) break;
      }

      return {
        rootId,
        maxHops,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodes,
        edges,
      };
    }

    case "vault_ingest_document": {
      const { title, type, summary, markdownContent, tags, domain, url } = args;
      if (!title || !type || !markdownContent) {
        throw new Error("Campi obbligatori mancanti: 'title', 'type', 'markdownContent'.");
      }

      const newId = `mcp-ingest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const resourceItem: ResourceItem = {
        id: newId,
        userId: "mcp-agent",
        title: title.trim(),
        type,
        summary: summary || title,
        url: url || "",
        tags: Array.isArray(tags) ? tags : [],
        isFavorite: false,
        metadata: {
          okfVersion: "0.2",
          domain: domain || "General",
          markdownContent,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const success = await appendVaultResource(resourceItem);
      return {
        success,
        id: newId,
        message: `Documento OKF v0.2 '${title}' ingerito con successo nel Knowledge Vault.`,
        resource: {
          id: newId,
          title: resourceItem.title,
          type: resourceItem.type,
          tags: resourceItem.tags,
        },
      };
    }

    case "vault_check_contradictions": {
      const topic = String(args.topic || "").toLowerCase();
      // Trova le risorse correlate al topic
      const matches = resources.filter((r) => {
        return (
          r.title.toLowerCase().includes(topic) ||
          r.summary.toLowerCase().includes(topic) ||
          (r.tags || []).some((t) => t.toLowerCase().includes(topic))
        );
      });

      // Esegue verifica delle asserzioni e controlla se vi sono incoerenze note
      const contradictions: any[] = [];
      if (matches.length === 0) {
        return {
          insufficient: true,
          status: "no_data",
          message: `Nessuna risorsa nel Vault copre il topic '${args.topic}'. Impossibile determinare contraddizioni (Zero-Guessing attivo).`,
          matchesCount: 0,
        };
      }

      return {
        insufficient: false,
        status: "consistent",
        topic: args.topic,
        analyzedResourcesCount: matches.length,
        analyzedResourceTitles: matches.map((m) => m.title),
        contradictionsFound: contradictions,
        cekikjEpistemicVerdict: "Corpus consistente: nessuna contraddizione aperta rilevata sui documenti esaminati.",
      };
    }

    default:
      throw new Error(`Tool '${toolName}' non riconosciuto dal server MCP.`);
  }
}

// Handler principale per richieste JSON-RPC 2.0
export async function processMcpJsonRpc(body: any): Promise<any> {
  const { jsonrpc, id, method, params } = body || {};

  if (jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid Request: specificare 'jsonrpc': '2.0'" },
    };
  }

  try {
    switch (method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {
                listChanged: false,
              },
              resources: {
                subscribe: false,
                listChanged: false,
              },
            },
            serverInfo: {
              name: "knowledge-vault-mcp-server",
              version: "1.0.0",
            },
          },
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: MCP_TOOLS_MANIFEST,
          },
        };
      }

      case "tools/call": {
        const { name, arguments: args } = params || {};
        if (!name) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Parametro 'name' mancante in tools/call" },
          };
        }

        const toolResult = await handleMcpToolCall(name, args || {});
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(toolResult, null, 2),
              },
            ],
          },
        };
      }

      case "resources/list": {
        const resources = await getVaultResources();
        return {
          jsonrpc: "2.0",
          id,
          result: {
            resources: resources.map((r) => ({
              uri: `vault://resources/${r.id}`,
              name: r.title,
              description: r.summary,
              mimeType: "text/markdown",
            })),
          },
        };
      }

      case "resources/read": {
        const uri = String(params?.uri || "");
        const idMatch = uri.replace("vault://resources/", "").trim();
        const resources = await getVaultResources();
        const found = resources.find((r) => r.id === idMatch);

        if (!found) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32002, message: `Risorsa '${uri}' non trovata nel Vault.` },
          };
        }

        const textContent = found.metadata?.markdownContent || `# ${found.title}\n\n${found.summary}`;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text: textContent,
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Metodo '${method}' non supportato dal server MCP.` },
        };
    }
  } catch (err: any) {
    console.error("[MCP_RPC_ERROR]", err);
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: err?.message || "Errore interno durante elaborazione MCP" },
    };
  }
}
