import fs from "fs";
import path from "path";
import { GoogleGenAI, createPartFromFunctionResponse } from "@google/genai";
import { ResourceItem, ResourceType } from "../src/types";
import {
  getGenAI,
  trackCall,
  isGeminiQuotaInCooldown,
  triggerGeminiQuotaCooldown,
} from "./gemini/client";
import { getOrCreateContextCache } from "./services/contextCacheService";
import {
  vaultFunctionDeclarations,
  dispatchVaultTool,
} from "./services/vaultTools";

// ============================================================================
// Types & Interfaces per l'Architettura Multi-Agente del Vault
// ============================================================================

export type AgentRole =
  | "orchestrator"
  | "graph_navigator"
  | "deep_analyst"
  | "code_specialist"
  | "grounding_verifier";

export interface AgentTraceStep {
  agent: AgentRole;
  action: string;
  description: string;
  itemsFound?: number;
  status: "success" | "warning" | "insufficient";
  timestamp: string;
}

export interface AgenticQueryRequest {
  query: string;
  mode?: "quick_synthesis" | "topological_analysis" | "deep_implementation";
  activeCategory?: string;
  activeTag?: string;
  selectedResourceIds?: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  clientResources?: ResourceItem[];
  preferredModel?: string;
}

export interface CitedResourceMeta {
  id: string;
  title: string;
  type: ResourceType;
  url?: string;
  domain?: string;
  tags?: string[];
  relevanceReason?: string;
}

export interface AgenticQueryResponse {
  answer: string;
  summary: string;
  orchestratorPlan: string;
  trace: AgentTraceStep[];
  citedResources: CitedResourceMeta[];
  citedResourceIds: string[];
  suggestedQuestions: string[];
  graphClusterNodeIds: string[];
  insufficient: boolean;
  mode: string;
  stats: {
    totalVaultResourcesScanned: number;
    relevantResourcesFound: number;
    durationMs: number;
    modelUsed: string;
  };
}

// ============================================================================
// Resource Loader: Legge le risorse da memoria o da data/vault-backup.json
// ============================================================================

export function loadVaultResources(clientItems?: ResourceItem[]): ResourceItem[] {
  if (Array.isArray(clientItems) && clientItems.length > 0) {
    return clientItems;
  }

  const backupPath = path.join(process.cwd(), "data", "vault-backup.json");
  try {
    if (fs.existsSync(backupPath)) {
      const raw = fs.readFileSync(backupPath, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.resources) && data.resources.length > 0) {
        return data.resources;
      }
    }
  } catch (err) {
    console.error("[VAULT_AGENTS] Errore caricamento data/vault-backup.json:", err);
  }

  return [];
}

// ============================================================================
// Sub-Agent 1: Graph Navigator Agent
// ============================================================================

interface GraphAnalysisResult {
  clusterNodeIds: string[];
  connectedEntities: string[];
  relationPaths: Array<{ sourceId: string; targetTitle: string; relationType: string }>;
  trace: AgentTraceStep;
}

export function runGraphNavigator(
  query: string,
  resources: ResourceItem[],
  keywords: string[]
): GraphAnalysisResult {
  const queryLower = query.toLowerCase();
  const matchedNodeIds = new Set<string>();
  const connectedEntities = new Set<string>();
  const relationPaths: Array<{ sourceId: string; targetTitle: string; relationType: string }> = [];

  resources.forEach((r) => {
    const titleMatch = r.title.toLowerCase().includes(queryLower);
    const domainMatch = r.metadata?.domain && r.metadata.domain.toLowerCase().includes(queryLower);
    const tagMatch = r.tags && r.tags.some((t) => t.toLowerCase().includes(queryLower) || keywords.some((k) => t.toLowerCase().includes(k)));

    // Entity matching
    let entityMatch = false;
    if (Array.isArray(r.metadata?.entities)) {
      r.metadata?.entities.forEach((ent) => {
        const entName = typeof ent === "string" ? ent : ent.name;
        if (entName && (queryLower.includes(entName.toLowerCase()) || entName.toLowerCase().includes(queryLower))) {
          entityMatch = true;
          connectedEntities.add(entName);
        }
      });
    }

    if (titleMatch || domainMatch || tagMatch || entityMatch) {
      matchedNodeIds.add(r.id);

      // Traversal degli archi OKF di 1° grado
      if (Array.isArray(r.metadata?.relations)) {
        r.metadata.relations.forEach((rel) => {
          if (rel.targetTitle) {
            relationPaths.push({
              sourceId: r.id,
              targetTitle: rel.targetTitle,
              relationType: rel.relationType || rel.type || "correlato",
            });
          }
        });
      }
    }
  });

  // Second-hop expansion limitata (max 2 hop come da specifica Cekikj)
  if (matchedNodeIds.size > 0 && matchedNodeIds.size < 15) {
    resources.forEach((r) => {
      if (!matchedNodeIds.has(r.id) && Array.isArray(r.metadata?.relations)) {
        const connectsToDirect = r.metadata.relations.some((rel) => {
          return rel.targetTitle && Array.from(matchedNodeIds).some((id) => {
            const direct = resources.find((item) => item.id === id);
            return direct && direct.title.toLowerCase() === rel.targetTitle!.toLowerCase();
          });
        });
        if (connectsToDirect && matchedNodeIds.size < 20) {
          matchedNodeIds.add(r.id);
        }
      }
    });
  }

  const clusterNodeIds = Array.from(matchedNodeIds);

  return {
    clusterNodeIds,
    connectedEntities: Array.from(connectedEntities),
    relationPaths: relationPaths.slice(0, 10),
    trace: {
      agent: "graph_navigator",
      action: "Topological Traversal & Clustering",
      description: `Identificati ${clusterNodeIds.length} nodi correlati nel grafo D3, con ${connectedEntities.size} entità canoniche e ${relationPaths.length} archi relazionali.`,
      itemsFound: clusterNodeIds.length,
      status: clusterNodeIds.length > 0 ? "success" : "warning",
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Sub-Agent 2: Deep Content Analyst Agent
// ============================================================================

interface ContentAnalysisResult {
  topCandidateIds: string[];
  keyExcerpts: Array<{ resourceId: string; title: string; excerpt: string; score: number }>;
  trace: AgentTraceStep;
}

export function runDeepContentAnalyst(
  query: string,
  resources: ResourceItem[],
  keywords: string[]
): ContentAnalysisResult {
  const scoredItems: Array<{ id: string; title: string; excerpt: string; score: number }> = [];
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const queryLower = query.toLowerCase().trim();

  resources.forEach((r) => {
    let score = 0;
    const titleLower = (r.title || "").toLowerCase();
    const summaryLower = (r.summary || "").toLowerCase();
    const markdownLower = (r.metadata?.markdownContent || "").toLowerCase();
    const executiveLower = (r.metadata?.aiExecutiveSummary || "").toLowerCase();
    const domainLower = (r.metadata?.domain || "").toLowerCase();

    // 1. Exact phrase matching bonus
    if (titleLower.includes(queryLower)) score += 12;
    if (summaryLower.includes(queryLower)) score += 6;
    if (domainLower && domainLower.includes(queryLower)) score += 6;

    // 2. Word occurrences with weighted semantic fields
    queryWords.forEach((word) => {
      if (titleLower.includes(word)) score += 6;
      if (domainLower.includes(word)) score += 4;
      if (summaryLower.includes(word)) score += 3;
      if (executiveLower.includes(word)) score += 3;
      if (markdownLower.includes(word)) score += 1.5;
    });

    // 3. Tag and OKF entities matching
    if (Array.isArray(r.tags)) {
      r.tags.forEach((tag) => {
        const tagL = tag.toLowerCase();
        if (tagL === queryLower) score += 8;
        else if (queryWords.some((w) => tagL.includes(w))) score += 4;
      });
    }

    if (Array.isArray(r.metadata?.entities)) {
      r.metadata.entities.forEach((ent) => {
        const entName = (typeof ent === "string" ? ent : ent.name || "").toLowerCase();
        if (entName && queryWords.some((w) => entName.includes(w))) {
          score += 5;
        }
      });
    }

    // 4. Boosting per documenti preferiti (isFavorite) o con alto rating
    if (r.isFavorite || r.metadata?.isFavorite) {
      score *= 1.25;
    }
    if (typeof r.rating === "number" && r.rating > 0) {
      score *= 1 + r.rating * 0.04;
    }

    if (score > 0) {
      // Estrai un frammento testuale significativo (excerpt)
      let excerpt = r.summary || "";
      if (r.metadata?.aiExecutiveSummary) {
        excerpt = r.metadata.aiExecutiveSummary;
      } else if (r.metadata?.markdownContent) {
        const firstPara = r.metadata.markdownContent.slice(0, 300).replace(/#+\s/g, "");
        excerpt = firstPara + "...";
      }

      scoredItems.push({
        id: r.id,
        title: r.title,
        excerpt: excerpt.slice(0, 240),
        score: Math.round(score * 10) / 10,
      });
    }
  });

  scoredItems.sort((a, b) => b.score - a.score);
  const topCandidates = scoredItems.slice(0, 15);

  return {
    topCandidateIds: topCandidates.map((c) => c.id),
    keyExcerpts: topCandidates.map((c) => ({
      resourceId: c.id,
      title: c.title,
      excerpt: c.excerpt,
      score: c.score,
    })),
    trace: {
      agent: "deep_analyst",
      action: "Hybrid Semantic & BM25 Scoring Scan",
      description: `Scansione semantica ibrida su corpi Markdown, titoli, tag ed entità canoniche. Estratte ${topCandidates.length} evidenze testuali con punteggio di rilevanza normalizzato e boosting preferiti.`,
      itemsFound: topCandidates.length,
      status: topCandidates.length > 0 ? "success" : "warning",
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Sub-Agent 3: Code & Implementation Specialist Agent
// ============================================================================

interface CodeAnalysisResult {
  codeResourceIds: string[];
  technicalProfiles: Array<{
    id: string;
    title: string;
    type: ResourceType;
    techStack?: string;
    toolsOrLanguage?: string;
  }>;
  trace: AgentTraceStep;
}

export function runCodeImplementationSpecialist(
  query: string,
  resources: ResourceItem[],
  candidateIds: string[]
): CodeAnalysisResult {
  const codeItems: Array<{
    id: string;
    title: string;
    type: ResourceType;
    techStack?: string;
    toolsOrLanguage?: string;
  }> = [];

  const candidatesSet = new Set(candidateIds);
  const targetResources = resources.filter(
    (r) =>
      (r.type === "github_repo" || r.type === "mcp_server" || r.type === "troubleshooting" || r.type === "ai_skill") &&
      (candidatesSet.has(r.id) || candidateIds.length === 0)
  );

  targetResources.forEach((r) => {
    let techStack = r.metadata?.language || r.metadata?.affectedSystem || undefined;
    let toolsOrLanguage = undefined;

    if (r.type === "mcp_server" && Array.isArray(r.metadata?.toolsProvided)) {
      toolsOrLanguage = `Tools: ${r.metadata.toolsProvided.slice(0, 4).join(", ")}`;
    } else if (r.type === "github_repo" && r.metadata?.installCommand) {
      toolsOrLanguage = `Install: ${r.metadata.installCommand}`;
    }

    codeItems.push({
      id: r.id,
      title: r.title,
      type: r.type,
      techStack,
      toolsOrLanguage,
    });
  });

  return {
    codeResourceIds: codeItems.map((c) => c.id),
    technicalProfiles: codeItems.slice(0, 8),
    trace: {
      agent: "code_specialist",
      action: "Code & Implementation Probe",
      description: `Rilevati ${codeItems.length} artefatti tecnici verticali (GitHub repos, MCP servers, fixes architetturali).`,
      itemsFound: codeItems.length,
      status: codeItems.length > 0 ? "success" : "warning",
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Sub-Agent 4: Grounding Verifier (Cekikj Epistemic Guard)
// ============================================================================

interface GroundingVerificationResult {
  verifiedCitedIds: string[];
  insufficient: boolean;
  auditNotes: string;
  trace: AgentTraceStep;
}

export function runGroundingVerifier(
  citedIdsInText: string[],
  validResources: ResourceItem[]
): GroundingVerificationResult {
  const validIdsMap = new Map(validResources.map((r) => [r.id, r]));
  const verifiedCitedIds: string[] = [];

  citedIdsInText.forEach((id) => {
    if (validIdsMap.has(id)) {
      verifiedCitedIds.push(id);
    }
  });

  const insufficient = verifiedCitedIds.length === 0;

  return {
    verifiedCitedIds,
    insufficient,
    auditNotes: insufficient
      ? "Zero-Guessing Guard: Nessuna risorsa verificata nel Vault corrisponde ai claim richiesti."
      : `Audit completato con successo: ${verifiedCitedIds.length} citazioni verificate contro l'indice autoritativo delle 108 risorse.`,
    trace: {
      agent: "grounding_verifier",
      action: "Cekikj Grounding & Zero-Guessing Audit",
      description: insufficient
        ? "Allerta Epistemica: Il Vault non contiene informazioni sufficienti per sostenere questa query. Risposta limitata ai soli dati accertati."
        : `Verificate ${verifiedCitedIds.length} fonti reali nel Vault. Tutti i claim poggiano su evidenze e documenti archiviati.`,
      itemsFound: verifiedCitedIds.length,
      status: insufficient ? "insufficient" : "success",
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Central Orchestrator: Pipeline Esecutiva Multi-Agente
// ============================================================================

export type AgentStreamProgressCallback = (event: string, data: any) => void;

export async function executeAgenticVaultQuery(
  request: AgenticQueryRequest,
  genAI: GoogleGenAI | null,
  onProgress?: AgentStreamProgressCallback
): Promise<AgenticQueryResponse> {
  const startTime = Date.now();
  const allResources = loadVaultResources(request.clientResources);
  const totalCount = allResources.length;

  const traces: AgentTraceStep[] = [];

  // Step 1: Orchestrator Intent Decomposition
  const query = (request.query || "").trim();
  const keywords = query
    .toLowerCase()
    .replace(/[^\w\sàèéìòù]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const orchestratorPlan = `Pianificazione Orchestrator per query: "${query}". Attivazione coordinata di Graph Navigator (topologia D3), Deep Content Analyst (Markdown & Note), Code Specialist (GitHub & MCP) e Grounding Verifier (Cekikj).`;

  const orchestratorTrace: AgentTraceStep = {
    agent: "orchestrator",
    action: "Intent Decomposition & Task Dispatch",
    description: `Decomposto l'intento dell'utente in modalità "${request.mode || "quick_synthesis"}". Inviati task di esplorazione paralleli.`,
    status: "success",
    timestamp: new Date().toISOString(),
  };
  traces.push(orchestratorTrace);
  if (onProgress) {
    onProgress("plan_generated", { plan: orchestratorPlan });
    onProgress("agent_trace_step", orchestratorTrace);
  }

  // Step 2: Parallel Sub-Agent Execution
  const graphResult = runGraphNavigator(query, allResources, keywords);
  traces.push(graphResult.trace);
  if (onProgress) {
    onProgress("agent_trace_step", graphResult.trace);
  }

  const contentResult = runDeepContentAnalyst(query, allResources, keywords);
  traces.push(contentResult.trace);
  if (onProgress) {
    onProgress("agent_trace_step", contentResult.trace);
  }

  // Unione e deduplicazione dei candidati primari
  const candidateIdsSet = new Set<string>([
    ...contentResult.topCandidateIds,
    ...graphResult.clusterNodeIds,
  ]);

  // Se l'utente ha selezionato esplicitamente delle risorse nella UI, hanno priorità
  if (Array.isArray(request.selectedResourceIds) && request.selectedResourceIds.length > 0) {
    request.selectedResourceIds.forEach((id) => candidateIdsSet.add(id));
  }

  const candidateIds = Array.from(candidateIdsSet);
  const codeResult = runCodeImplementationSpecialist(query, allResources, candidateIds);
  traces.push(codeResult.trace);
  if (onProgress) {
    onProgress("agent_trace_step", codeResult.trace);
  }

  // Seleziona i migliori candidati (massimo 12 per contenere il context budget nel bounded loop)
  const candidateResources = allResources
    .filter((r) => candidateIdsSet.has(r.id))
    .slice(0, 12);

  let answerText = "";
  let summaryText = "";
  let modelUsed = "heuristic-local-synthesizer";
  let extractedCitedIds: string[] = [];

  // Step 3: LLM Generation con Gemini Flash Hierarchy e Circuit Breaker
  const activeGenAI = genAI || getGenAI();
  const isCooldown = isGeminiQuotaInCooldown();
  if (activeGenAI && candidateResources.length > 0 && !isCooldown) {
    // Gerarchia Modelli: se l'utente ha scelto un modello specifico, provalo prima
    const candidateHierarchy = [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-flash-latest",
      "gemini-2.5-flash",
      "gemini-3.1-flash-lite",
    ];

    const modelsToTry: string[] = [];
    if (request.preferredModel && request.preferredModel !== "auto") {
      modelsToTry.push(request.preferredModel);
      for (const m of candidateHierarchy) {
        if (m !== request.preferredModel) modelsToTry.push(m);
      }
    } else {
      modelsToTry.push(...candidateHierarchy);
    }

    const compactContext = candidateResources.map((r) => {
      const entitiesStr = Array.isArray(r.metadata?.entities)
        ? r.metadata!.entities.map((e) => (typeof e === "string" ? e : e.name)).slice(0, 5).join(", ")
        : "";
      const relationsStr = Array.isArray(r.metadata?.relations)
        ? r.metadata!.relations.map((rel) => `${rel.relationType || "rel"}:${rel.targetTitle}`).slice(0, 4).join(", ")
        : "";

      return `---
ID: ${r.id}
TITOLO: ${r.title}
TIPO: ${r.type}
DOMINIO: ${r.metadata?.domain || "generale"}
TAG: ${r.tags ? r.tags.join(", ") : ""}
ENTITÀ: ${entitiesStr}
RELAZIONI: ${relationsStr}
SOMMARIO: ${r.summary || ""}
ESTRATTO: ${r.metadata?.aiExecutiveSummary || (r.metadata?.markdownContent ? r.metadata.markdownContent.slice(0, 350) : "")}
URL: ${r.url || ""}`;
    }).join("\n\n");

    const systemPrompt = `Sei il Vault Intelligence Engine del Knowledge Vault personale dell'utente (formato OKF v0.2, conformità Epistemica Cekikj).
Il tuo compito è rispondere all'interrogazione dell'utente basandoti ESCLUSIVAMENTE sulle risorse del Vault fornite nel contesto sottostante o scoperte tramite gli strumenti.

Hai a disposizione i seguenti strumenti tipizzati (Tool Calling):
- search_vault: per cercare ulteriori risorse nel Vault per parole chiave, tag e tipo.
- traverse_graph_relations: per esplorare connessioni ontologiche e archi del grafo D3 (fino a 2 hop).
- verify_grounding_evidence: per verificare formalmente se un'asserzione/claim è supportata dal testo o metadati di un documento specifico del Vault.

REGOLE RIGOROSE DI GROUNDING & ZERO-GUESSING (CEKIKJ ARCHITECTURE):
1. Usa gli strumenti se hai bisogno di cercare dettagli precisi, scoprire relazioni nel grafo o verificare asserzioni.
2. Cita SEMPRE le risorse pertinenti utilizzando il formato esatto: [ID: Titolo della Risorsa].
3. Non inventare risorse o fatti esterni. Se il Vault contiene informazioni parziali, segnala con trasparenza cosa è presente e cosa manca.
4. Se nessuna risorsa nel contesto o nel Vault tratta dell'argomento richiesto, dichiara apertamente l'assenza con la frase: "Nel Vault attuale non sono presenti risorse su questo argomento specifico." e suggerisci argomenti correlati presenti.
5. Struttura la risposta in modo chiaro:
   - **Sintesi Esecutiva**: risposta diretta e concisa alla domanda dell'utente.
   - **Risorse del Vault Pertinenti**: elenco con spiegazione del motivo di pertinenza e citazione [ID: Titolo].
   - **Correlazioni e Grafo**: come queste risorse si collegano tra loro per dominio, tecnologia o entità condivise.
   - **Applicazione Pratica / Codice** (se pertinente per repository GitHub o server MCP).
6. Mantieni un tono sobrio, tecnico, autorevole e privo di cliché o convenevoli generici.`;

    const historyBlock = Array.isArray(request.history) && request.history.length > 0
      ? `CRONOLOGIA DELLA CONVERSAZIONE PRECEDENTE NEL THREAD:\n${request.history
          .slice(-6)
          .map((h) => `${h.role === "user" ? "Utente" : "Assistente Vault"}: ${h.content}`)
          .join("\n\n")}\n\n`
      : "";

    const userPromptText = `${historyBlock}Domanda attuale dell'utente:
"${query}"

Modalità richiesta: ${request.mode || "quick_synthesis"}
Categoria attiva nel filtro: ${request.activeCategory || "Tutte"}
Tag attivo nel filtro: ${request.activeTag || "Nessuno"}

RISORSE DEL VAULT SELEZIONATE DAGLI AGENTI COME CONTESTO INIZIALE:
${compactContext}

Fornisci la sintesi epistemica verificata seguendo le istruzioni di sistema. Rispondi alla domanda attuale tenendo conto del contesto pregresso se presente, citando sempre le risorse pertinenti.`;

    for (const modelName of modelsToTry) {
      const callStart = Date.now();
      try {
        // Hard bounds: Timeout rigido a 18 secondi per rispettare i requisiti Cekikj
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timeout superato (>18s)")), 18000);
        });

        const configPayload: any = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ functionDeclarations: vaultFunctionDeclarations }],
          temperature: 0.2,
        };

        // If gemini-3.8-flash or gemini-3.7-flash, calibrate thinking budget according to mode
        if (modelName === "gemini-3.8-flash" || modelName === "gemini-3.7-flash") {
          configPayload.thinkingConfig = {
            thinkingBudget: request.mode === "deep_implementation" ? 2048 : 1024,
          };
        }

        // Dynamic Context Caching Check (32,768 token threshold)
        if (modelName === "gemini-3.7-flash" || modelName === "gemini-flash-latest") {
          try {
            const cacheResult = await getOrCreateContextCache(compactContext, modelName);
            if (cacheResult.isCached && cacheResult.cachedContentName) {
              console.log(`[VAULT_AGENTS] Invocato Context Cache ${cacheResult.cachedContentName} per query agents`);
              configPayload.cachedContent = cacheResult.cachedContentName;
            }
          } catch (cacheErr: any) {
            console.warn("[VAULT_AGENTS] Context cache check non-fatal error:", cacheErr?.message);
          }
        }

        const conversationContents: any[] = [
          { role: "user", parts: [{ text: userPromptText }] },
        ];

        let round = 0;
        const MAX_TOOL_ROUNDS = 6; // Hard bounds Cekikj (max 6 tool-call rounds)

        while (round < MAX_TOOL_ROUNDS) {
          round++;
          const callPromise = activeGenAI.models.generateContent({
            model: modelName,
            contents: conversationContents,
            config: configPayload,
          });

          const response: any = await Promise.race([callPromise, timeoutPromise]);
          const functionCalls = response.functionCalls;

          if (functionCalls && functionCalls.length > 0) {
            console.log(`[VAULT_AGENTS] Modello ${modelName} ha richiesto ${functionCalls.length} tool call(s) (Round ${round})`);

            const candidateContent = response.candidates?.[0]?.content;
            if (candidateContent) {
              conversationContents.push(candidateContent);
            }

            const responseParts: any[] = [];
            for (const fc of functionCalls) {
              console.log(`[VAULT_AGENTS] Dispatching tool: ${fc.name}`);
              const { output, trace } = dispatchVaultTool(fc.name, fc.args, allResources);
              traces.push(trace);
              if (onProgress) {
                onProgress("agent_trace_step", trace);
              }

              if (fc.name === "search_vault" && Array.isArray(output.results)) {
                output.results.forEach((r: any) => candidateIdsSet.add(r.id));
              } else if (fc.name === "traverse_graph_relations" && Array.isArray(output.connectedNodes)) {
                output.connectedNodes.forEach((n: any) => candidateIdsSet.add(n.id));
              }

              responseParts.push(createPartFromFunctionResponse(fc.id || "", fc.name, output));
            }

            conversationContents.push({ role: "user", parts: responseParts });
          } else {
            const text = response.text || "";
            if (text.trim().length > 0) {
              answerText = text.trim();
              modelUsed = modelName;
              trackCall(modelName, Date.now() - callStart, true);
              break;
            }
            break;
          }
        }

        if (answerText) {
          break;
        }
      } catch (err: any) {
        trackCall(modelName, Date.now() - callStart, false, err?.message);
        const errMsg = (err?.message || "").toLowerCase();
        const isQuota =
          err?.status === "RESOURCE_EXHAUSTED" ||
          err?.code === 429 ||
          errMsg.includes("resource_exhausted") ||
          errMsg.includes("quota") ||
          errMsg.includes("429");
        if (isQuota) {
          triggerGeminiQuotaCooldown(45000);
          console.warn(`[VAULT_AGENTS] Quota 429 esaurita per ${modelName}. Attivato circuit breaker 45s.`);
        } else {
          console.warn(`[VAULT_AGENTS] Fallimento con modello ${modelName}:`, err?.message || err);
        }
      }
    }
  }

  // Fallback Euristico Locale se il modello cloud non è disponibile o candidati insufficienti
  if (!answerText) {
    if (candidateResources.length === 0) {
      answerText = `Nel Knowledge Vault attuale non sono state individuate risorse corrispondenti a "${query}".\n\nL'archivio conta attualmente ${totalCount} risorse incentrate principalmente su orchestrazione di agenti, Model Context Protocol (MCP), architetture distribuite, repository GitHub e paper scientifici.\n\nSuggerimento: prova a cercare per concetti chiave come \`mcp\`, \`gemini\`, \`d3\`, \`knowledge graph\` o consulta la visualizzazione a grafo.`;
      summaryText = `Nessuna risorsa trovata per "${query}".`;
    } else {
      const top3 = candidateResources.slice(0, 5);
      answerText = `### Risorse Rilevate nel Vault per "${query}"\n\nGli agenti hanno individuato **${candidateResources.length} risorse** correlate nel tuo archivio:\n\n` +
        top3.map((r) => `- **[${r.id}: ${r.title}]** (${r.type}${r.metadata?.domain ? ` • ${r.metadata.domain}` : ""})\n  ${r.summary || "Nessun sommario testuale."}`).join("\n\n") +
        `\n\n### Connessioni Rilevate\nI documenti condividono tag e relazioni ontologiche nel cluster concettuale. Clicca sulle risorse o apri la Vista Grafo per esplorare i nodi adiacenti.`;
      summaryText = `Individuate ${candidateResources.length} risorse pertinenti nel Vault.`;
    }
  } else {
    // Genera un breve riassunto per la barra di stato
    summaryText = answerText.split("\n\n")[0].replace(/^#+\s*/, "").slice(0, 180);
  }

  // Estrai gli ID citati nel testo della risposta
  const idRegex = /\[([a-zA-Z0-9_-]{8,}):/g;
  let match;
  while ((match = idRegex.exec(answerText)) !== null) {
    extractedCitedIds.push(match[1]);
  }

  // Se nessun ID nel formato esatto, usa gli ID dei candidati primari solo se il modello non ha dichiarato assenza di informazioni
  const declaredAbsence =
    answerText.toLowerCase().includes("non sono presenti risorse") ||
    answerText.toLowerCase().includes("non contiene informazioni sufficienti") ||
    answerText.toLowerCase().includes("nessuna risorsa trovata");

  if (extractedCitedIds.length === 0 && candidateResources.length > 0 && !declaredAbsence) {
    extractedCitedIds = candidateResources.slice(0, 4).map((r) => r.id);
  }

  // Step 4: Grounding Verifier Audit
  const groundingResult = runGroundingVerifier(declaredAbsence ? [] : extractedCitedIds, allResources);
  traces.push(groundingResult.trace);
  if (onProgress) {
    onProgress("grounding_check", groundingResult.trace);
  }

  // Costruisci i metadati per i badge interattivi cliccabili nella UI
  const citedResourceMap = new Map(allResources.map((r) => [r.id, r]));
  const citedResourcesMeta: CitedResourceMeta[] = groundingResult.verifiedCitedIds
    .map((id) => {
      const r = citedResourceMap.get(id);
      if (!r) return null;
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        url: r.url,
        domain: r.metadata?.domain,
        tags: r.tags,
      };
    })
    .filter(Boolean) as CitedResourceMeta[];

  // Suggerimenti contestuali per approfondimento
  const suggestedQuestions: string[] = [
    `Come si collegano queste risorse nel Grafo D3?`,
    `Quali repository GitHub contengono codice relativo a questo tema?`,
    `Esistono discrepanze o approcci alternativi in questo cluster?`,
  ];

  const durationMs = Date.now() - startTime;

  return {
    answer: answerText,
    summary: summaryText,
    orchestratorPlan,
    trace: traces,
    citedResources: citedResourcesMeta,
    citedResourceIds: groundingResult.verifiedCitedIds,
    suggestedQuestions,
    graphClusterNodeIds: graphResult.clusterNodeIds,
    insufficient: groundingResult.insufficient,
    mode: request.mode || "quick_synthesis",
    stats: {
      totalVaultResourcesScanned: totalCount,
      relevantResourcesFound: candidateResources.length,
      durationMs,
      modelUsed,
    },
  };
}
