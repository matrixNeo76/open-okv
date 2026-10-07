import { executeBoundedCekikjLoop } from './boundedEngine';
import { search_evidence, resolve_entity, diff, list_contradictions } from './typedTools';
import { verifyGrounding } from './groundingVerifier';

export interface TestResultItem {
  id: string;
  name: string;
  pillar: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

export interface ValidationSuiteReport {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  allPassed: boolean;
  results: TestResultItem[];
}

export async function runCekikjValidationSuite(): Promise<ValidationSuiteReport> {
  const results: TestResultItem[] = [];

  // --------------------------------------------------------------------------
  // TEST 1: REFUSAL TEST (Contradiction Gate Intervention)
  // --------------------------------------------------------------------------
  const t1Start = performance.now();
  try {
    const res = await executeBoundedCekikjLoop("Qual è la regola ufficiale per la conservazione delle API Key?");
    const passed = res.status === 'REFUSAL_CONTRADICTION' && 
                   res.gateEvaluation.gatePassed === false && 
                   res.gateEvaluation.conflictsDetected.length > 0;
    
    results.push({
      id: 'test-1-refusal-gate',
      name: 'Refusal Test su Concetto Conteso (Contradiction Gate)',
      pillar: '4. Contradiction Register & Gate',
      passed,
      details: passed
        ? `Superato: Il gate ha bloccato la sintesi forzata ed ha esposto le fonti in conflitto (${res.gateEvaluation.conflictsDetected[0].conceptName}).`
        : `Fallito: Ricevuto stato inatteso ${res.status}.`,
      durationMs: Math.round(performance.now() - t1Start)
    });
  } catch (err: any) {
    results.push({
      id: 'test-1-refusal-gate',
      name: 'Refusal Test su Concetto Conteso (Contradiction Gate)',
      pillar: '4. Contradiction Register & Gate',
      passed: false,
      details: `Errore di esecuzione: ${err.message}`,
      durationMs: Math.round(performance.now() - t1Start)
    });
  }

  // --------------------------------------------------------------------------
  // TEST 2: ZERO-GUESSING (Insufficient Flag)
  // --------------------------------------------------------------------------
  const t2Start = performance.now();
  try {
    const res = await search_evidence("Quantum Fusion Core 9.9 Cluster Config");
    const passed = res.insufficient === true && (res.data?.length === 0);

    results.push({
      id: 'test-2-insufficient-flag',
      name: 'Zero-Guessing: Flag Insufficient su Informazione Inesistente',
      pillar: '2. Typed Tooling',
      passed,
      details: passed
        ? 'Superato: Il tool ha risposto tassativamente con insufficient: true senza inventare parametri.'
        : 'Fallito: Il flag insufficient non era true.',
      durationMs: Math.round(performance.now() - t2Start)
    });
  } catch (err: any) {
    results.push({
      id: 'test-2-insufficient-flag',
      name: 'Zero-Guessing: Flag Insufficient',
      pillar: '2. Typed Tooling',
      passed: false,
      details: `Errore: ${err.message}`,
      durationMs: Math.round(performance.now() - t2Start)
    });
  }

  // --------------------------------------------------------------------------
  // TEST 3: HARD BOUNDS (Max 8 Rounds Enforcement)
  // --------------------------------------------------------------------------
  const t3Start = performance.now();
  try {
    const res = await executeBoundedCekikjLoop("Cosa prescrive lo standard Open Knowledge Format OKF?");
    const passed = res.trace.roundsCount <= 8 && res.trace.maxRoundsLimit === 8;

    results.push({
      id: 'test-3-hard-bounds',
      name: 'Hard Bounds: Vincolo Rigido Max 8 Rounds',
      pillar: '5. Bounded Loop Engine',
      passed,
      details: passed
        ? `Superato: Esecuzione terminata in ${res.trace.roundsCount}/8 round con successo.`
        : `Fallito: Il limite di round è stato violato (${res.trace.roundsCount}).`,
      durationMs: Math.round(performance.now() - t3Start)
    });
  } catch (err: any) {
    results.push({
      id: 'test-3-hard-bounds',
      name: 'Hard Bounds: Vincolo Rigido Max 8 Rounds',
      pillar: '5. Bounded Loop Engine',
      passed: false,
      details: `Errore: ${err.message}`,
      durationMs: Math.round(performance.now() - t3Start)
    });
  }

  // --------------------------------------------------------------------------
  // TEST 4: BITEMPORAL DIFFERENTIATION
  // --------------------------------------------------------------------------
  const t4Start = performance.now();
  try {
    const res = await diff('concept-okf-metadata-domain', '2025-01-15', '2026-06-01');
    const passed = res.data?.hasChanged === true && 
                   res.data?.stateAtA?.state === 'VERSION_0_1' &&
                   res.data?.stateAtB?.state === 'VERSION_0_2';

    results.push({
      id: 'test-4-bitemporal',
      name: 'Bitemporalità: Differenziale Storico tra Date di Vigenza',
      pillar: '3. Bitemporal & State',
      passed,
      details: passed
        ? `Superato: Differenziale calcolato con successo (${res.data?.stateAtA?.state} -> ${res.data?.stateAtB?.state}).`
        : `Fallito: Diff bitemporale non conforme (${JSON.stringify(res.data)}).`,
      durationMs: Math.round(performance.now() - t4Start)
    });
  } catch (err: any) {
    results.push({
      id: 'test-4-bitemporal',
      name: 'Bitemporalità: Differenziale Storico',
      pillar: '3. Bitemporal & State',
      passed: false,
      details: `Errore: ${err.message}`,
      durationMs: Math.round(performance.now() - t4Start)
    });
  }

  // --------------------------------------------------------------------------
  // TEST 5: GROUNDING CLAIM PRUNING
  // --------------------------------------------------------------------------
  const t5Start = performance.now();
  try {
    const textWithGhostClaim = "Nessuna API Key deve mai raggiungere il browser client. Inoltre il sistema integra un motore quantistico ad antimateria non documentato.";
    const report = verifyGrounding(textWithGhostClaim, [
      {
        id: 'chunk-test',
        documentId: 'doc-sec',
        documentTitle: 'Security Policy',
        text: 'Nessuna API Key deve mai raggiungere il browser client.',
        tokenCount: 15,
        canonicalEntityAnchors: ['api-key-sec'],
        recordedAt: '2026-01-01'
      }
    ], []);

    const passed = report.totalClaims === 2 && report.verifiedClaimsCount === 1 && report.prunedClaimsCount === 1;

    results.push({
      id: 'test-5-grounding',
      name: 'Grounding Check: Rilevamento e Potatura Claim Senza Evidenza',
      pillar: '6. Grounding Check',
      passed,
      details: passed
        ? `Superato: ${report.prunedClaimsCount} asserzione priva di riscontro rilevata e isolata.`
        : `Fallito: Conteggio verifiche non allineato (${report.verifiedClaimsCount}/${report.totalClaims}).`,
      durationMs: Math.round(performance.now() - t5Start)
    });
  } catch (err: any) {
    results.push({
      id: 'test-5-grounding',
      name: 'Grounding Check: Rilevamento Claim',
      pillar: '6. Grounding Check',
      passed: false,
      details: `Errore: ${err.message}`,
      durationMs: Math.round(performance.now() - t5Start)
    });
  }

  const passedTests = results.filter(r => r.passed).length;

  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passedTests,
    failedTests: results.length - passedTests,
    allPassed: passedTests === results.length,
    results
  };
}
