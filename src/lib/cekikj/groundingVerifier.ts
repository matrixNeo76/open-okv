import {
  GroundingReport,
  GroundingClaimCheck,
  EvidenceChunk,
  TypedRelationship
} from '../../types';

// ============================================================================
// GROUNDING VERIFIER (Single-Pass Claim Pruner)
// ============================================================================

export function verifyGrounding(
  draftText: string,
  evidenceItems: EvidenceChunk[],
  traversedEdges: TypedRelationship[]
): GroundingReport {
  // 1. Segmentazione della risposta in asserzioni/claim atomici
  const rawSentences = draftText
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  if (rawSentences.length === 0) {
    return {
      totalClaims: 0,
      verifiedClaimsCount: 0,
      prunedClaimsCount: 0,
      groundingScore: 1.0,
      claims: [],
      pass: true
    };
  }

  // Prepara corpus di verifica aggregato
  const evidenceCorpus = evidenceItems.map(e => `${e.documentTitle} ${e.text}`.toLowerCase());
  const edgeCorpus = traversedEdges.map(
    r => `${r.sourceEntityName} ${r.relationshipType} ${r.targetEntityName} ${r.description || ''}`.toLowerCase()
  );

  const claims: GroundingClaimCheck[] = [];
  let verifiedCount = 0;
  let prunedCount = 0;

  rawSentences.forEach(sentence => {
    const lowerSentence = sentence.toLowerCase();
    const words = lowerSentence
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

    const matchingEvidence: string[] = [];
    const matchingEdges: string[] = [];

    // Match con Evidence Chunks
    evidenceItems.forEach(item => {
      const itemText = `${item.documentTitle} ${item.text}`.toLowerCase();
      // Se almeno il 40% delle parole chiave coincide
      const matchWords = words.filter(w => itemText.includes(w));
      if (words.length > 0 && matchWords.length / words.length >= 0.35) {
        matchingEvidence.push(item.id);
      }
    });

    // Match con Archi Ontologici
    traversedEdges.forEach(edge => {
      const edgeText = `${edge.sourceEntityName} ${edge.relationshipType} ${edge.targetEntityName}`.toLowerCase();
      const matchWords = words.filter(w => edgeText.includes(w));
      if (words.length > 0 && matchWords.length / words.length >= 0.35) {
        matchingEdges.push(edge.id);
      }
    });

    const isVerified = matchingEvidence.length > 0 || matchingEdges.length > 0;

    if (isVerified) {
      verifiedCount++;
      claims.push({
        claim: sentence,
        verified: true,
        supportingEvidenceIds: matchingEvidence,
        supportingEdgeIds: matchingEdges
      });
    } else {
      prunedCount++;
      claims.push({
        claim: sentence,
        verified: false,
        supportingEvidenceIds: [],
        supportingEdgeIds: [],
        rejectionReason: 'Nessuna evidenza testuale o arco ontologico a supporto.'
      });
    }
  });

  const groundingScore = rawSentences.length > 0
    ? Math.round((verifiedCount / rawSentences.length) * 100) / 100
    : 1.0;

  return {
    totalClaims: rawSentences.length,
    verifiedClaimsCount: verifiedCount,
    prunedClaimsCount: prunedCount,
    groundingScore,
    claims,
    pass: groundingScore >= 0.70 // Soglia di confidenza 70%
  };
}
