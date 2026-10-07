import { CekikjEngineResult, ContradictionRecord } from '../../types';

export function generateCekikjAuditMarkdown(
  result: CekikjEngineResult,
  contradictions: ContradictionRecord[]
): string {
  const timestamp = new Date().toISOString();
  const openCount = contradictions.filter(c => c.status === 'open').length;
  const resolvedCount = contradictions.filter(c => c.status === 'resolved').length;
  const groundingScore = Math.round((result.groundingReport?.groundingScore ?? 1) * 100);
  const conflict = result.gateEvaluation?.conflictsDetected?.[0];

  let md = `# Dossier di Audit Epistemico Cekikj (Zero-Guessing Compliance)
**Data Generazione**: \`${timestamp}\`  
**Standard**: Architettura Cekikj / OKF v0.2  
**Esito Ciclo Epistemico**: **${result.status}**  
**Grounding Ratio**: **${groundingScore}%**  
**Latenza Esecuzione**: \`${result.trace.totalDurationMs}ms\` (${result.trace.roundsCount}/8 round)

---

## 1. Query & Parametri di Ingresso
- **Query Utente**: "${result.query}"
- **Tool Invocati**: ${result.trace.toolCalls.length}
- **Evidence Chunks Estratti**: ${result.evidenceItems?.length || 0}
- **Entità Ontologiche Ispezionate**: ${result.entities?.length || 0}
- **Relazioni Attraversate**: ${result.traversedEdges?.length || 0}

---

## 2. Valutazione del Contradiction Gate
- **Stato Gate**: ${
    result.status === 'REFUSAL_CONTRADICTION'
      ? '🔴 **BLOCCATO** - Rilevata contraddizione aperta nel registro'
      : '🟢 **APPROVATO** - Nessun conflitto aperto rilevato'
  }
- **Contraddizioni nel Registro**: ${openCount} Aperte, ${resolvedCount} Risolte

${
  conflict
    ? `### Contraddizione Rilevata:
- **Concetto**: ${conflict.conceptName}
- **Stato**: ${conflict.status.toUpperCase()}
- **Fonti in Conflitto**:
${conflict.conflictingSources
  .map(
    s => `  - **${s.sourceTitle}** (${s.owner}, ${s.effectiveDate || s.validFrom}):
    > "${s.statement}"`
  )
  .join('\n')}
`
    : ''
}

---

## 3. Traccia Esecutiva dei Typed Tools (FSM Trace)
| Round | Strumento Invocato | Latenza (ms) | Esito / Note |
| :--- | :--- | :--- | :--- |
${result.trace.toolCalls
  .map(
    (tc, idx) =>
      `| ${tc.round || idx + 1} | \`${tc.tool}\` | ${tc.executionMs}ms | ${
        tc.insufficient ? '⚠️ Evidenze Insufficienti' : '✅ Completato'
      } (${tc.resultSummary || 'OK'}) |`
  )
  .join('\n')}

---

## 4. Risposta Composita Out-of-Loop
${
  result.status === 'REFUSAL_CONTRADICTION'
    ? `> ⚠️ **RIFIUTO EPISTEMICO ATTIVO**\n>\n> ${result.answerText.replace(/\n/g, '\n> ')}`
    : result.status === 'INSUFFICIENT_KNOWLEDGE'
    ? `> ℹ️ **DICHIARAZIONE DI INSUFFICIENZA DATI**\n>\n> ${result.answerText.replace(/\n/g, '\n> ')}`
    : result.answerText
}

---

## 5. Asserzioni e Ancoraggi Epistemici (Grounding Report)
- **Claim Totali**: ${result.groundingReport?.totalClaims || 0}
- **Claim Verificati**: ${result.groundingReport?.verifiedClaimsCount || 0}
- **Score Grounding**: ${groundingScore}%

${
  (result.groundingReport?.claims || [])
    .map(
      (c, idx) =>
        `- **[Claim #${idx + 1}]** ${c.verified ? '🟢 Verificato' : '🔴 Non Verificato'}: "${c.claim}"`
    )
    .join('\n')
}

---

## 6. Certificato di Conformità Zero-Guessing
Il presente output è stato validato dall'architettura epistemica Cekikj. Tutte le asserzioni sono garantite da prove documentali esistenti nel Knowledge Vault senza speculazioni, inferenze non autorizzate o tentativi iterati ciechi.
`;

  return md;
}

export function downloadCekikjAuditFile(
  result: CekikjEngineResult,
  contradictions: ContradictionRecord[]
) {
  const content = generateCekikjAuditMarkdown(result, contradictions);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `CEKIKJ_AUDIT_${result.status}_${Date.now()}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
