import {
  CekikjEngineResult,
  ExecutionTrace,
  ToolCallStep,
  EvidenceChunk,
  StructuredKnowledgeEntity,
  TypedRelationship,
  BoundedLoopConfig
} from '../../types';
import {
  search_evidence,
  search_knowledge,
  resolve_entity,
  traverse,
  list_contradictions
} from './typedTools';
import { evaluateContradictionGate } from './contradictionGate';
import { verifyGrounding } from './groundingVerifier';

// ============================================================================
// BOUNDED LOOP ENGINE (Deterministic FSM ~80 LOC Core)
// ============================================================================
// Hard Bounds: Max 8 Rounds, Max 2 Hops, 12s Timeout, Early Termination

const DEFAULT_CONFIG: BoundedLoopConfig = {
  maxRounds: 8,
  maxHops: 2,
  timeoutMs: 12000,
  tokenBudget: 4000
};

export async function executeBoundedCekikjLoop(
  query: string,
  userConfig?: Partial<BoundedLoopConfig>
): Promise<CekikjEngineResult> {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  const startTime = performance.now();
  const queryId = `cekikj-${Date.now()}`;

  const trace: ExecutionTrace = {
    id: `trace-${queryId}`,
    query,
    roundsCount: 0,
    maxRoundsLimit: config.maxRounds,
    toolCalls: [],
    touchedEntities: [],
    traversedEdges: [],
    citedEvidenceIds: [],
    totalDurationMs: 0
  };

  const collectedEvidence: EvidenceChunk[] = [];
  const collectedEntities: StructuredKnowledgeEntity[] = [];
  const collectedEdges: TypedRelationship[] = [];

  // --------------------------------------------------------------------------
  // DETERMINISTIC FINITE STATE MACHINE (FSM LOOP)
  // --------------------------------------------------------------------------
  let round = 1;
  let hasTerminated = false;

  while (round <= config.maxRounds && !hasTerminated) {
    // 1. Check Wall-Clock Timeout
    if (performance.now() - startTime > config.timeoutMs) {
      trace.boundsTripped = {
        tripped: true,
        reason: 'TIMEOUT',
        details: `Superato il timeout massimo consentito (${config.timeoutMs}ms).`
      };
      break;
    }

    // 2. FSM Step Selection
    if (round === 1) {
      // Step A: Risoluzione Entità da etichetta
      const stepStart = performance.now();
      const res = await resolve_entity(query);
      const entity = res.data?.entity || res.data?.ambiguousCandidates?.[0];
      
      if (entity) {
        collectedEntities.push(entity);
        trace.touchedEntities.push(entity.id);
        trace.touchedEntities.push(entity.canonicalName);
      }

      trace.toolCalls.push({
        round,
        tool: 'resolve_entity',
        params: { query },
        resultSummary: res.explanation || 'Risoluzione completata',
        insufficient: res.insufficient,
        touchedEntities: entity ? [entity.id, entity.canonicalName] : [],
        executionMs: Math.round(performance.now() - stepStart)
      });

    } else if (round === 2) {
      // Step B: Se nessuna entità risolta al round 1, esegue search_knowledge
      if (collectedEntities.length === 0) {
        const stepStart = performance.now();
        const res = await search_knowledge(query);
        (res.data || []).forEach(e => {
          collectedEntities.push(e);
          trace.touchedEntities.push(e.id);
          trace.touchedEntities.push(e.canonicalName);
        });

        trace.toolCalls.push({
          round,
          tool: 'search_knowledge',
          params: { query },
          resultSummary: res.explanation || 'Ricerca ontologica',
          insufficient: res.insufficient,
          touchedEntities: (res.data || []).flatMap(e => [e.id, e.canonicalName]),
          executionMs: Math.round(performance.now() - stepStart)
        });
      } else {
        // Altrimenti salta al traversal del grafo (Hop 1..2)
        const root = collectedEntities[0];
        const stepStart = performance.now();
        const res = await traverse(root.id, undefined, config.maxHops);
        
        if (res.data) {
          res.data.edges.forEach(e => {
            collectedEdges.push(e);
            trace.traversedEdges.push(e.id);
          });
          res.data.neighborEntities.forEach(n => {
            collectedEntities.push(n);
            trace.touchedEntities.push(n.id);
            trace.touchedEntities.push(n.canonicalName);
          });
        }

        trace.toolCalls.push({
          round,
          tool: 'traverse',
          params: { entityId: root.id, depth: config.maxHops },
          resultSummary: res.explanation || 'Traversamento completato',
          insufficient: res.insufficient,
          touchedEntities: res.data?.neighborEntities.map(e => e.canonicalName) || [],
          executionMs: Math.round(performance.now() - stepStart)
        });
      }

    } else if (round === 3) {
      // Step C: Ricerca Evidence Chunks di supporto
      const stepStart = performance.now();
      const res = await search_evidence(query, { limit: 4 });
      (res.data || []).forEach(c => {
        collectedEvidence.push(c);
        trace.citedEvidenceIds.push(c.id);
      });

      trace.toolCalls.push({
        round,
        tool: 'search_evidence',
        params: { query },
        resultSummary: res.explanation || 'Ricerca evidenze',
        insufficient: res.insufficient,
        touchedEntities: [],
        executionMs: Math.round(performance.now() - stepStart)
      });

    } else if (round === 4) {
      // Step D: Interrogazione del registro delle contraddizioni
      const stepStart = performance.now();
      const res = await list_contradictions();
      trace.toolCalls.push({
        round,
        tool: 'list_contradictions',
        params: {},
        resultSummary: res.explanation || 'Ispezione contraddizioni',
        insufficient: res.insufficient,
        touchedEntities: [],
        executionMs: Math.round(performance.now() - stepStart)
      });
      // Raccolta dati conclusa, termina il ciclo FSM
      hasTerminated = true;
    }

    round++;
  }

  trace.roundsCount = round - 1;
  trace.totalDurationMs = Math.round(performance.now() - startTime);

  // --------------------------------------------------------------------------
  // THE CONTRADICTION GATE (OUT-OF-LOOP GOVERNANCE)
  // --------------------------------------------------------------------------
  const gateEval = await evaluateContradictionGate(query, trace);

  if (!gateEval.gatePassed && gateEval.refusalPayload) {
    return {
      id: queryId,
      query,
      status: 'REFUSAL_CONTRADICTION',
      answerText: gateEval.refusalPayload.gateMessage,
      evidenceItems: collectedEvidence,
      entities: collectedEntities,
      traversedEdges: collectedEdges,
      trace,
      gateEvaluation: gateEval,
      groundingReport: {
        totalClaims: 1,
        verifiedClaimsCount: 1,
        prunedClaimsCount: 0,
        groundingScore: 1.0,
        claims: [{
          claim: 'Rifiuto formalizzato dal Contradiction Gate su conflitto documentato.',
          verified: true,
          supportingEvidenceIds: []
        }],
        pass: true
      },
      timestamp: new Date().toISOString()
    };
  }

  // --------------------------------------------------------------------------
  // DRAFT COMPOSITION & GROUNDING VERIFICATION
  // --------------------------------------------------------------------------
  let draftAnswer = '';

  if (collectedEntities.length === 0 && collectedEvidence.length === 0) {
    draftAnswer = `Nessuna informazione verificabile presente nel Knowledge Layer per "${query}". Il sistema si rifiuta di formulare ipotesi arbitrarie in assenza di evidenza.`;
    return {
      id: queryId,
      query,
      status: 'INSUFFICIENT_KNOWLEDGE',
      answerText: draftAnswer,
      evidenceItems: [],
      entities: [],
      traversedEdges: [],
      trace,
      gateEvaluation: gateEval,
      groundingReport: {
        totalClaims: 1,
        verifiedClaimsCount: 1,
        prunedClaimsCount: 0,
        groundingScore: 1.0,
        claims: [],
        pass: true
      },
      timestamp: new Date().toISOString()
    };
  }

  // Composizione grounded dai dati raccolti
  const entitySummaries = collectedEntities
    .slice(0, 3)
    .map(e => `${e.canonicalName} (${e.domain}): ${e.description}`)
    .join('. ');

  const evidenceQuotes = collectedEvidence
    .slice(0, 2)
    .map(c => `[Fonte: ${c.documentTitle}] "${c.text}"`)
    .join('\n');

  draftAnswer = `
In base all'analisi ontologica ed alle evidenze verificate nel Knowledge Vault:

${entitySummaries ? `• Contesto Ontologico: ${entitySummaries}.\n` : ''}
${collectedEdges.length > 0 ? `• Relazioni Topologiche: ${collectedEdges.map(e => `${e.sourceEntityName} --[${e.relationshipType}]--> ${e.targetEntityName}`).join(', ')}.\n` : ''}
• Evidenze Testuali di Supporto:
${evidenceQuotes || 'Nessun chunk testuale aggiuntivo.'}
`.trim();

  // Verifica di grounding
  const groundingReport = verifyGrounding(draftAnswer, collectedEvidence, collectedEdges);

  return {
    id: queryId,
    query,
    status: trace.boundsTripped?.tripped ? 'BOUNDS_EXCEEDED_PARTIAL' : 'SUCCESS',
    answerText: draftAnswer,
    evidenceItems: collectedEvidence,
    entities: collectedEntities,
    traversedEdges: collectedEdges,
    trace,
    gateEvaluation: gateEval,
    groundingReport,
    timestamp: new Date().toISOString()
  };
}
