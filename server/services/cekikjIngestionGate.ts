import { ResourceItem } from "../../src/types";

export interface ProofChainVerification {
  claim: string;
  sourceExcerpt?: string;
  confidence: number;
  grounded: boolean;
}

export interface DetectedContradiction {
  existingResourceId: string;
  existingResourceTitle: string;
  claimInNewDoc: string;
  claimInExistingDoc: string;
  severity: "direct_conflict" | "divergent_benchmark" | "deprecated_spec";
}

export interface CekikjGateResult {
  status: "certified_grounded" | "partial_insufficient" | "flagged_contradiction";
  groundingScore: number; // 0.0 to 1.0
  insufficient: boolean;
  insufficientFields: string[];
  contradictions: DetectedContradiction[];
  verifiedProofChains: ProofChainVerification[];
  sanitizedResource: any;
  epistemicWarnings: string[];
}

/**
 * Cekikj Epistemic Grounding Gate:
 * Enforces Zero-Guessing, verifies proof chains between generated content and raw source,
 * detects topological contradictions with the Vault corpus, and verifies graph referential integrity.
 */
export function executeCekikjIngestionGate(
  generatedResource: any,
  rawSourceText: string,
  existingVaultResources: ResourceItem[],
  options: {
    minGroundingScore?: number;
    strictZeroGuessing?: boolean;
    pipelineType?: string;
  } = {}
): CekikjGateResult {
  const minGroundingScore = options.minGroundingScore ?? 0.75;
  const epistemicWarnings: string[] = [];
  const insufficientFields: string[] = [];
  const contradictions: DetectedContradiction[] = [];
  const verifiedProofChains: ProofChainVerification[] = [];

  // Deep clone to sanitize without mutating original
  const sanitized = JSON.parse(JSON.stringify(generatedResource));
  if (!sanitized.metadata) sanitized.metadata = {};

  const cleanRawSource = (rawSourceText || "").toLowerCase();

  // 1. Zero-Guessing Audit on Key Entities & Claims
  const entities = Array.isArray(sanitized.metadata.entities) ? sanitized.metadata.entities : [];
  let groundedEntitiesCount = 0;

  entities.forEach((entity: any) => {
    const entityName = (typeof entity === "string" ? entity : entity.name || "").trim();
    if (!entityName) return;

    const lowerName = entityName.toLowerCase();
    // Check if the entity name actually appears in raw text or title
    const appearsInSource = cleanRawSource.includes(lowerName) || (sanitized.title || "").toLowerCase().includes(lowerName);

    if (appearsInSource) {
      groundedEntitiesCount++;
      verifiedProofChains.push({
        claim: `Entità ontologica "${entityName}"`,
        sourceExcerpt: `Presente nel testo sorgente`,
        confidence: 0.95,
        grounded: true,
      });
    } else {
      epistemicWarnings.push(`Entità "${entityName}" non rinvenuta nel testo sorgente; mantenuta con riserva.`);
      verifiedProofChains.push({
        claim: `Entità ontologica "${entityName}"`,
        confidence: 0.4,
        grounded: false,
      });
    }
  });

  // Calculate lexical grounding score based on entities and key takeaways
  const totalChecked = Math.max(entities.length, 1);
  let groundingScore = groundedEntitiesCount / totalChecked;

  // Bonus for title and summary overlap
  const titleWords = (sanitized.title || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w: string) => w.length > 3);
  let titleOverlap = 0;
  titleWords.forEach((tw: string) => {
    if (cleanRawSource.includes(tw)) titleOverlap++;
  });
  if (titleWords.length > 0) {
    const titleScore = titleOverlap / titleWords.length;
    groundingScore = groundingScore * 0.7 + titleScore * 0.3;
  }

  // Cap groundingScore
  groundingScore = Math.min(Math.max(Number(groundingScore.toFixed(2)), 0.1), 1.0);

  // 2. Zero-Guessing Check on Missing Critical Fields
  if (!sanitized.summary || sanitized.summary.trim().length < 20) {
    insufficientFields.push("summary");
    sanitized.summary = "Sommario sintetico non desumibile con certezza assoluta dalla sorgente grezza.";
  }

  if (options.pipelineType === "academic_paper") {
    if (!sanitized.metadata.venue || sanitized.metadata.venue.includes("Non specificat") || sanitized.metadata.venue.includes("N/A")) {
      insufficientFields.push("venue");
      sanitized.metadata.venue = "[NON SPECIFICATO NEL DOCUMENTO]";
    }
    if (!sanitized.metadata.doi && !cleanRawSource.includes("10.")) {
      insufficientFields.push("doi");
    }
  }

  // 3. Graph Referential Integrity Check
  // Relations must only reference resources that actually exist in the Vault
  if (Array.isArray(sanitized.metadata.relations)) {
    const existingTitlesMap = new Map(existingVaultResources.map((r) => [r.title.toLowerCase().trim(), r]));
    const existingIdsMap = new Map(existingVaultResources.map((r) => [r.id, r]));

    sanitized.metadata.relations = sanitized.metadata.relations.filter((rel: any) => {
      const targetTitle = (rel.targetTitle || "").toLowerCase().trim();
      const targetId = rel.targetId;

      const match = (targetId && existingIdsMap.get(targetId)) || (targetTitle && existingTitlesMap.get(targetTitle));
      if (!match) {
        epistemicWarnings.push(
          `Relazione rimossa verso "${rel.targetTitle || targetId}": nodo inesistente nel Vault (regola di integrità referenziale).`
        );
        return false;
      }
      // Populate missing id if title matched
      if (!rel.targetId && match) {
        rel.targetId = match.id;
        rel.targetTitle = match.title;
      }
      return true;
    });
  }

  // 4. Contradiction Scanner vs Existing Vault Knowledge
  // Look for direct benchmark or metric divergence
  const newSummary = (sanitized.summary || "").toLowerCase();
  existingVaultResources.forEach((vaultItem) => {
    // Check if the two items share domain or entities
    const sameDomain =
      vaultItem.metadata?.domain &&
      sanitized.metadata?.domain &&
      vaultItem.metadata.domain.toLowerCase() === sanitized.metadata.domain.toLowerCase();

    if (sameDomain) {
      const vaultSummary = (vaultItem.summary || "").toLowerCase();
      // Heuristic conflict detection for negation / opposite assertions
      const hasConflictKeywords =
        (newSummary.includes("deprecat") && vaultSummary.includes("standard")) ||
        (newSummary.includes("vulnerabil") && vaultSummary.includes("sicur")) ||
        (newSummary.includes("inferiore") && vaultSummary.includes("superiore"));

      if (hasConflictKeywords) {
        contradictions.push({
          existingResourceId: vaultItem.id,
          existingResourceTitle: vaultItem.title,
          claimInNewDoc: sanitized.title,
          claimInExistingDoc: vaultItem.title,
          severity: "divergent_benchmark",
        });
      }
    }
  });

  // 5. Determine Final Epistemic Status
  let status: CekikjGateResult["status"] = "certified_grounded";
  if (contradictions.length > 0) {
    status = "flagged_contradiction";
    epistemicWarnings.push(`Rilevate ${contradictions.length} possibili discrepanze rispetto al corpus del Vault.`);
  } else if (groundingScore < minGroundingScore || insufficientFields.length > 1) {
    status = "partial_insufficient";
    epistemicWarnings.push(
      `Verifica Cekikj parziale (Grounding: ${(groundingScore * 100).toFixed(0)}%, Campi omessi: ${insufficientFields.join(", ")}). Nessuna congettura inventata.`
    );
  }

  // Attach final epistemic badge to metadata
  sanitized.metadata.cekikjEvaluation = {
    status,
    groundingScore,
    insufficient: insufficientFields.length > 0,
    insufficientFields,
    contradictions,
    verifiedProofChains,
    evaluatedAt: new Date().toISOString(),
  };

  return {
    status,
    groundingScore,
    insufficient: insufficientFields.length > 0,
    insufficientFields,
    contradictions,
    verifiedProofChains,
    sanitizedResource: sanitized,
    epistemicWarnings,
  };
}
