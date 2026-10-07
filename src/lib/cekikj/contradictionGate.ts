import {
  ExecutionTrace,
  ContradictionGateEvaluation,
  ContradictionRecord
} from '../../types';
import { list_contradictions } from './typedTools';

// ============================================================================
// THE CONTRADICTION GATE (Out-of-Loop Governance & Refusal Engine)
// ============================================================================
// "Governance che vive dentro il loop è consultiva; governance che sopravvive
// all'agenzia deve vivere fuori di esso." — Miodrag Cekikj

export async function evaluateContradictionGate(
  query: string,
  trace: ExecutionTrace
): Promise<ContradictionGateEvaluation> {
  // 1. Interrogare in modo completamente indipendente il registro delle contraddizioni
  const contradictionsEnvelope = await list_contradictions();
  const allContradictions = contradictionsEnvelope.data || [];

  const stopWords = new Set([
    'qual', 'quale', 'quali', 'cosa', 'come', 'dove', 'quando', 'perche', 'perché',
    'delle', 'della', 'degli', 'dello', 'del', 'dei', 'nel', 'nella', 'allo', 'alla',
    'per', 'con', 'tra', 'fra', 'the', 'and', 'for', 'with', 'from', 'about', 'what', 'which',
    'ufficiale', 'regola', 'norma'
  ]);

  const extractTokens = (text: string): string[] => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.has(w));
  };

  const queryTokens = new Set(extractTokens(query));
  const touchedTokens = new Set<string>();
  trace.touchedEntities.forEach(ent => {
    extractTokens(ent).forEach(t => touchedTokens.add(t));
  });

  const activeConflicts: ContradictionRecord[] = [];

  allContradictions.forEach(record => {
    if (record.status !== 'open') return;

    const recordId = record.id.toLowerCase();
    const conceptId = record.conceptId.toLowerCase();
    const conceptName = record.conceptName.toLowerCase();

    // A. Direct entity ID or name match
    const directIdMatch = trace.touchedEntities.some(ent => {
      const lower = ent.toLowerCase();
      return (
        lower === conceptId ||
        lower === recordId ||
        conceptId.includes(lower) ||
        lower.includes(conceptId) ||
        conceptName.includes(lower)
      );
    });

    if (directIdMatch) {
      activeConflicts.push(record);
      return;
    }

    // B. Token overlap match (e.g. "api" and "key", "okf", "cache", etc.)
    const conceptTokens = extractTokens(`${recordId} ${conceptId} ${conceptName}`);
    const matchingQueryTokens = conceptTokens.filter(t => queryTokens.has(t));
    const matchingTouchedTokens = conceptTokens.filter(t => touchedTokens.has(t));

    const isDomainTerm = (t: string) => ['api', 'key', 'okf', 'cache', 'storage', 'indexeddb', 'firestore', 'proxy'].includes(t);
    const queryHasDomain = matchingQueryTokens.some(isDomainTerm);
    const touchedHasDomain = matchingTouchedTokens.some(isDomainTerm);

    if (
      (matchingQueryTokens.length >= 2) ||
      (matchingTouchedTokens.length >= 2) ||
      (queryHasDomain && matchingQueryTokens.length >= 2) ||
      (matchingTouchedTokens.length >= 1 && touchedHasDomain) ||
      (queryHasDomain && matchingTouchedTokens.length >= 1)
    ) {
      activeConflicts.push(record);
    }
  });

  // 3. Se non ci sono conflitti aperti, il Gate lascia passare la risposta
  if (activeConflicts.length === 0) {
    return {
      gatePassed: true,
      status: 'PASS',
      conflictsDetected: []
    };
  }

  // 4. Se ci sono conflitti aperti, il Gate BLOCCA formalmente la sintesi
  const primaryConflict = activeConflicts[0];
  const formattedRefusalMessage = `
[CONTRADICTION GATE INTERVENTION — ZERO-GUESSING REFUSAL]
Il sistema ha rilevato un conflitto ontologico aperto nel registro delle contraddizioni sul concetto: "${primaryConflict.conceptName}".

In osservanza della specifica architetturale Cekikj (Parte 3), il modello si rifiuta categoricamente di generare una sintesi arbitraria o una congettura intermedia su fonti non armonizzate.

Fonti Confliggenti Rilevate:
${primaryConflict.conflictingSources.map((src, i) => `
${i + 1}. Fonte: "${src.sourceTitle}"
   - Dichiarazione: "${src.statement}"
   - Owner / Competenza: ${src.owner}
   - Data di Vigenza: dal ${src.validFrom || src.effectiveDate} al ${src.validTo || 'presente'}
   ${src.url ? `- Link Documentale: ${src.url}` : ''}
`).join('')}

Azione Richiesta:
È necessario un arbitraggio umano formale da parte dei rispettivi owner per risolvere il conflitto nel Knowledge Vault prima di poter sintetizzare una risposta univoca.
`.trim();

  return {
    gatePassed: false,
    status: 'BLOCKED_CONTRADICTION',
    conflictsDetected: activeConflicts,
    refusalPayload: {
      conceptName: primaryConflict.conceptName,
      conflictingSources: primaryConflict.conflictingSources,
      gateMessage: formattedRefusalMessage
    }
  };
}
