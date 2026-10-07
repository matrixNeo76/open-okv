import {
  TypedToolEnvelope,
  EvidenceChunk,
  StructuredKnowledgeEntity,
  TypedRelationship,
  ContradictionRecord,
  EntityTimelineState
} from '../../types';
import { dualLayerStore } from './dualLayerStore';

// ============================================================================
// SUITE DEGLI 8 TYPED TOOLS (Zero-Guessing Read-Only Contracts)
// ============================================================================

export interface EvidenceFilters {
  domain?: string;
  asOfDate?: string;
  limit?: number;
}

export interface KnowledgeFilters {
  domain?: string;
  entityType?: string;
}

export interface TraverseResult {
  rootEntity: StructuredKnowledgeEntity;
  edges: TypedRelationship[];
  neighborEntities: StructuredKnowledgeEntity[];
  depthReached: number;
}

export interface EntityDiffResult {
  entityId: string;
  entityName: string;
  dateA: string;
  stateAtA?: EntityTimelineState;
  dateB: string;
  stateAtB?: EntityTimelineState;
  hasChanged: boolean;
  deltaDescription: string;
}

export interface SourceOriginResult {
  sourceId: string;
  type: 'chunk' | 'relationship' | 'document';
  title: string;
  owner?: string;
  recordedAt?: string;
  validFrom?: string;
  validTo?: string;
  textSnippet?: string;
}

/**
 * 1. search_evidence
 * Ricerca sui chunk testuali grezzi con date-range bitemporale e token-matching.
 * Se non trova corrispondenze, risponde tassativamente con insufficient: true.
 */
export async function search_evidence(
  query: string,
  filters?: EvidenceFilters
): Promise<TypedToolEnvelope<EvidenceChunk[]>> {
  const start = performance.now();
  const normalizedQuery = query.toLowerCase().trim();
  const chunks = dualLayerStore.getAllChunks(filters?.asOfDate);
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length > 2);

  if (terms.length === 0) {
    return {
      data: [],
      insufficient: true,
      explanation: 'Query di ricerca vuota o termini insufficienti.',
      trace: {
        tool: 'search_evidence',
        params: { query, filters },
        timestamp: new Date().toISOString(),
        executionMs: Math.round(performance.now() - start)
      }
    };
  }

  // Matching pesato
  const scored = chunks
    .map(chunk => {
      let score = 0;
      const lowerText = chunk.text.toLowerCase();
      const lowerTitle = chunk.documentTitle.toLowerCase();

      terms.forEach(t => {
        if (lowerTitle.includes(t)) score += 5;
        if (lowerText.includes(t)) score += 2;
      });

      return { chunk, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.chunk);

  const limit = filters?.limit || 5;
  const result = scored.slice(0, limit);

  return {
    data: result,
    insufficient: result.length === 0,
    explanation: result.length === 0 
      ? `Nessuna evidenza documentale trovata per "${query}".`
      : `Trovati ${result.length} chunk di evidenza pertinenti.`,
    trace: {
      tool: 'search_evidence',
      params: { query, filters },
      timestamp: new Date().toISOString(),
      executionMs: Math.round(performance.now() - start)
    }
  };
}

/**
 * 2. search_knowledge
 * Ricerca nel livello ontologico curato (concetti canonici, policy, standard).
 */
export async function search_knowledge(
  query: string,
  filters?: KnowledgeFilters
): Promise<TypedToolEnvelope<StructuredKnowledgeEntity[]>> {
  const start = performance.now();
  const normalizedQuery = query.toLowerCase().trim();
  const allEntities = dualLayerStore.getAllEntities();
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length > 2);

  let candidates = allEntities;
  if (filters?.domain) {
    candidates = candidates.filter(e => e.domain.toLowerCase().includes(filters.domain!.toLowerCase()));
  }
  if (filters?.entityType) {
    candidates = candidates.filter(e => e.entityType === filters.entityType);
  }

  const matches = candidates.filter(e => {
    const text = `${e.canonicalName} ${e.aliases.join(' ')} ${e.description}`.toLowerCase();
    return terms.some(term => text.includes(term));
  });

  return {
    data: matches,
    insufficient: matches.length === 0,
    explanation: matches.length === 0
      ? `Nessun concetto ontologico curato trovato per "${query}".`
      : `Individuati ${matches.length} concetti canonici nel Knowledge Layer.`,
    trace: {
      tool: 'search_knowledge',
      params: { query, filters },
      timestamp: new Date().toISOString(),
      executionMs: Math.round(performance.now() - start)
    }
  };
}

/**
 * 3. resolve_entity
 * Risolve un'etichetta linguistica ambigua in un'identità canonica verificata o lista di candidati.
 */
export async function resolve_entity(
  queryLabel: string
): Promise<TypedToolEnvelope<{
  canonicalId?: string;
  entity?: StructuredKnowledgeEntity;
  ambiguousCandidates?: StructuredKnowledgeEntity[];
}>> {
  const start = performance.now();
  const normalized = queryLabel.toLowerCase().trim();
  const allEntities = dualLayerStore.getAllEntities();

  // 1. Exact match canonico o alias
  const exact = allEntities.find(
    e => e.canonicalName.toLowerCase() === normalized ||
         e.aliases.some(a => a.toLowerCase() === normalized)
  );

  if (exact) {
    return {
      data: {
        canonicalId: exact.id,
        entity: exact
      },
      insufficient: false,
      explanation: `Risoluzione esatta dell'entità "${queryLabel}" -> ${exact.canonicalName} (${exact.id}).`,
      trace: {
        tool: 'resolve_entity',
        params: { queryLabel },
        timestamp: new Date().toISOString(),
        executionMs: Math.round(performance.now() - start)
      }
    };
  }

  // 2. Fuzzy / Substring candidates
  const candidates = allEntities.filter(
    e => e.canonicalName.toLowerCase().includes(normalized) ||
         e.aliases.some(a => a.toLowerCase().includes(normalized)) ||
         normalized.includes(e.canonicalName.toLowerCase())
  );

  if (candidates.length === 1) {
    return {
      data: {
        canonicalId: candidates[0].id,
        entity: candidates[0]
      },
      insufficient: false,
      explanation: `Risolta univocamente tramite match parziale -> ${candidates[0].canonicalName}.`,
      trace: {
        tool: 'resolve_entity',
        params: { queryLabel },
        timestamp: new Date().toISOString(),
        executionMs: Math.round(performance.now() - start)
      }
    };
  }

  return {
    data: {
      ambiguousCandidates: candidates
    },
    insufficient: candidates.length === 0,
    explanation: candidates.length === 0
      ? `Impossibile risolvere l'entità "${queryLabel}": nessuna entità corrisponde.`
      : `Etichetta ambigua "${queryLabel}": trovati ${candidates.length} candidati concorrenti.`,
    trace: {
      tool: 'resolve_entity',
      params: { queryLabel },
      timestamp: new Date().toISOString(),
      executionMs: Math.round(performance.now() - start)
    }
  };
}

/**
 * 4. traverse
 * Esplora gli archi tipizzati del grafo partendo da un'entità, con vincolo rigido su max depth <= 2.
 */
export async function traverse(
  entityId: string,
  relationshipType?: string,
  depth: number = 1
): Promise<TypedToolEnvelope<TraverseResult>> {
  const start = performance.now();
  const root = dualLayerStore.getEntityById(entityId);

  if (!root) {
    return {
      data: null,
      insufficient: true,
      explanation: `Entità radice "${entityId}" non trovata nel grafo.`,
      trace: {
        tool: 'traverse',
        params: { entityId, relationshipType, depth },
        timestamp: new Date().toISOString(),
        executionMs: Math.round(performance.now() - start)
      }
    };
  }

  // HARD BOUND: depth consentita tassativamente 1 o 2
  const safeDepth = Math.min(Math.max(1, depth), 2);
  const allEdges = dualLayerStore.getAllRelationships();
  const visitedEdgeIds = new Set<string>();
  const neighborIds = new Set<string>();

  // Hop 1
  allEdges.forEach(edge => {
    if (edge.sourceEntityId === entityId || edge.targetEntityId === entityId) {
      if (!relationshipType || edge.relationshipType === relationshipType) {
        visitedEdgeIds.add(edge.id);
        neighborIds.add(edge.sourceEntityId === entityId ? edge.targetEntityId : edge.sourceEntityId);
      }
    }
  });

  // Hop 2 (se richiesto)
  if (safeDepth === 2) {
    const hop1Neighbors = Array.from(neighborIds);
    allEdges.forEach(edge => {
      if (hop1Neighbors.includes(edge.sourceEntityId) || hop1Neighbors.includes(edge.targetEntityId)) {
        if (!relationshipType || edge.relationshipType === relationshipType) {
          visitedEdgeIds.add(edge.id);
          neighborIds.add(edge.sourceEntityId);
          neighborIds.add(edge.targetEntityId);
        }
      }
    });
  }

  neighborIds.delete(entityId);
  const foundEdges = allEdges.filter(e => visitedEdgeIds.has(e.id));
  const neighbors = Array.from(neighborIds)
    .map(id => dualLayerStore.getEntityById(id))
    .filter((e): e is StructuredKnowledgeEntity => !!e);

  return {
    data: {
      rootEntity: root,
      edges: foundEdges,
      neighborEntities: neighbors,
      depthReached: safeDepth
    },
    insufficient: foundEdges.length === 0,
    explanation: foundEdges.length === 0
      ? `Nessun arco di relazione trovato per "${root.canonicalName}" (depth ${safeDepth}).`
      : `Traversamento completato con ${foundEdges.length} archi e ${neighbors.length} entità vicine.`,
    trace: {
      tool: 'traverse',
      params: { entityId, relationshipType, depth: safeDepth },
      timestamp: new Date().toISOString(),
      executionMs: Math.round(performance.now() - start)
    }
  };
}

/**
 * 5. timeline
 * Ricostruisce la sequenza degli stati temporali e di vigenza di un'entità.
 */
export async function timeline(
  entityId: string
): Promise<TypedToolEnvelope<EntityTimelineState[]>> {
  const start = performance.now();
  const entity = dualLayerStore.getEntityById(entityId);

  if (!entity || !entity.timeline || entity.timeline.length === 0) {
    return {
      data: [],
      insufficient: true,
      explanation: `Nessuna traccia temporale disponibile per l'entità "${entityId}".`,
      trace: {
        tool: 'timeline',
        params: { entityId },
        timestamp: new Date().toISOString(),
        executionMs: Math.round(performance.now() - start)
      }
    };
  }

  const sorted = [...entity.timeline].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    data: sorted,
    insufficient: false,
    explanation: `Estratti ${sorted.length} stati temporali per "${entity.canonicalName}".`,
    trace: {
      tool: 'timeline',
      params: { entityId },
      timestamp: new Date().toISOString(),
      executionMs: Math.round(performance.now() - start)
    }
  };
}

/**
 * 6. diff
 * Differenziale bitemporale tra due date di vigenza per una data entità.
 */
export async function diff(
  entityId: string,
  dateA: string,
  dateB: string
): Promise<TypedToolEnvelope<EntityDiffResult>> {
  const start = performance.now();
  const entity = dualLayerStore.getEntityById(entityId);

  if (!entity) {
    return {
      data: null,
      insufficient: true,
      explanation: `Entità "${entityId}" non trovata per eseguire il diff.`,
      trace: {
        tool: 'diff',
        params: { entityId, dateA, dateB },
        timestamp: new Date().toISOString(),
        executionMs: Math.round(performance.now() - start)
      }
    };
  }

  const findStateAt = (targetDate: string) => {
    if (!entity.timeline) return undefined;
    return entity.timeline.find(t => targetDate >= t.validFrom && targetDate <= t.validTo);
  };

  const stateA = findStateAt(dateA);
  const stateB = findStateAt(dateB);
  const hasChanged = stateA?.state !== stateB?.state;

  const deltaDescription = !stateA && !stateB
    ? 'Nessun dato di vigenza per entrambe le date richieste.'
    : !stateA
    ? `Alla data ${dateA} non esisteva uno stato valido; alla data ${dateB} lo stato è ${stateB?.state}.`
    : !stateB
    ? `Alla data ${dateA} lo stato era ${stateA.state}; alla data ${dateB} è decaduto.`
    : hasChanged
    ? `Variazione di stato: ${stateA.state} (${stateA.description}) -> ${stateB.state} (${stateB.description}).`
    : `Stato invariato (${stateA.state}): la medesima vigenza si applicava a entrambe le date.`;

  return {
    data: {
      entityId: entity.id,
      entityName: entity.canonicalName,
      dateA,
      stateAtA: stateA,
      dateB,
      stateAtB: stateB,
      hasChanged,
      deltaDescription
    },
    insufficient: !stateA && !stateB,
    explanation: deltaDescription,
    trace: {
      tool: 'diff',
      params: { entityId, dateA, dateB },
      timestamp: new Date().toISOString(),
      executionMs: Math.round(performance.now() - start)
    }
  };
}

/**
 * 7. list_contradictions
 * Interroga il registro ufficiale delle incongruenze e conflitti aperti tra fonti.
 */
export async function list_contradictions(
  conceptId?: string
): Promise<TypedToolEnvelope<ContradictionRecord[]>> {
  const start = performance.now();
  const all = dualLayerStore.getAllContradictions();

  const filtered = conceptId
    ? all.filter(c => 
        c.conceptId === conceptId || 
        c.conceptName.toLowerCase().includes(conceptId.toLowerCase())
      )
    : all;

  return {
    data: filtered,
    insufficient: filtered.length === 0,
    explanation: filtered.length === 0
      ? `Nessuna contraddizione registrata ${conceptId ? `per il concetto "${conceptId}"` : 'nel sistema'}.`
      : `Trovati ${filtered.length} record di contraddizione aperti.`,
    trace: {
      tool: 'list_contradictions',
      params: { conceptId },
      timestamp: new Date().toISOString(),
      executionMs: Math.round(performance.now() - start)
    }
  };
}

/**
 * 8. get_source
 * Recupera l'origine puntuale e le attestazioni di ownership di un chunk o relazione.
 */
export async function get_source(
  sourceId: string
): Promise<TypedToolEnvelope<SourceOriginResult>> {
  const start = performance.now();

  // Verifica se è un chunk
  const chunk = dualLayerStore.getChunkById(sourceId);
  if (chunk) {
    return {
      data: {
        sourceId: chunk.id,
        type: 'chunk',
        title: chunk.documentTitle,
        recordedAt: chunk.recordedAt,
        validFrom: chunk.validFrom,
        validTo: chunk.validTo,
        textSnippet: chunk.text
      },
      insufficient: false,
      explanation: `Fonte verificata (Evidence Chunk) proveniente da "${chunk.documentTitle}".`,
      trace: {
        tool: 'get_source',
        params: { sourceId },
        timestamp: new Date().toISOString(),
        executionMs: Math.round(performance.now() - start)
      }
    };
  }

  // Verifica se è una relazione
  const rel = dualLayerStore.getAllRelationships().find(r => r.id === sourceId);
  if (rel) {
    return {
      data: {
        sourceId: rel.id,
        type: 'relationship',
        title: `${rel.sourceEntityName} --[${rel.relationshipType}]--> ${rel.targetEntityName}`,
        validFrom: rel.validFrom,
        validTo: rel.validTo,
        textSnippet: rel.description
      },
      insufficient: false,
      explanation: `Fonte verificata (Arco di Conoscenza) tra ${rel.sourceEntityName} e ${rel.targetEntityName}.`,
      trace: {
        tool: 'get_source',
        params: { sourceId },
        timestamp: new Date().toISOString(),
        executionMs: Math.round(performance.now() - start)
      }
    };
  }

  return {
    data: null,
    insufficient: true,
    explanation: `Identificativo sorgente "${sourceId}" non censito nel Vault.`,
    trace: {
      tool: 'get_source',
      params: { sourceId },
      timestamp: new Date().toISOString(),
      executionMs: Math.round(performance.now() - start)
    }
  };
}
