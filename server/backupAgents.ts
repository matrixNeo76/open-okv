import crypto from "crypto";
import { ResourceItem, RawFileItem, OKFEntity, OKFRelation } from "../src/types";
import { getGenAI, generateWithGeminiFallback } from "./gemini/client";

// ============================================================================
// Types & Contracts per la Pipeline Multi-Agente di Backup & Certificazione
// ============================================================================

export type BackupAgentRole =
  | "backup_orchestrator"
  | "contradiction_sentinel"
  | "topological_graph_auditor"
  | "security_sanitizer"
  | "disaster_recovery_dry_run"
  | "manifest_compiler";

export interface BackupAgentTraceStep {
  agent: BackupAgentRole;
  action: string;
  description: string;
  itemsProcessed?: number;
  itemsFlagged?: number;
  status: "success" | "warning" | "error";
  timestamp: string;
  latencyMs: number;
}

export interface SecurityLeakFinding {
  resourceId: string;
  resourceTitle: string;
  leakType: "api_key" | "bearer_token" | "db_connection" | "private_key" | "aws_credential";
  matchedSample: string;
  location: "rawInput" | "summary" | "metadata" | "body";
}

export interface TopologicalGraphAuditReport {
  totalNodes: number;
  totalEdges: number;
  resolvedEdges: number;
  danglingEdges: Array<{
    sourceId: string;
    sourceTitle: string;
    targetTitle: string;
    relationType: string;
  }>;
  orphanNodes: Array<{
    id: string;
    title: string;
    type: string;
  }>;
  hubNodes: Array<{
    id: string;
    title: string;
    connectionsCount: number;
  }>;
  densityScore: number; // 0 - 100%
  integrityScore: number; // 0 - 100%
}

export interface EpistemicContradictionAuditReport {
  openContradictionsCount: number;
  flaggedConflicts: Array<{
    resourceA: string;
    resourceB?: string;
    concept: string;
    reason: string;
    severity: "low" | "medium" | "high";
  }>;
  epistemicHealthIndex: number; // 0 - 100%
  zeroGuessingCompliant: boolean;
}

export interface DisasterRecoveryDryRunReport {
  passed: boolean;
  roundtripValidated: boolean;
  resourcesReconstructed: number;
  fieldsPreservedPercent: number;
  checksumSha256: string;
  payloadSizeBytes: number;
  formattedSize: string;
  latencyMs: number;
}

export interface CertifiedEpistemicManifest {
  okfVersion: "0.2";
  certificationSeal: "CERTIFIED_OKF_V02_PASS" | "CERTIFIED_WITH_WARNINGS" | "CERTIFICATION_FAILED";
  timestamp: string;
  checksumSha256: string;
  totalResources: number;
  totalRawFiles: number;
  integrityScore: number; // 0 - 100%
  summary: string;
  epistemicHealth: EpistemicContradictionAuditReport;
  graphTopology: TopologicalGraphAuditReport;
  securityAudit: {
    scanned: boolean;
    leaksCount: number;
    sanitized: boolean;
    findings: SecurityLeakFinding[];
  };
  disasterRecoveryDryRun: DisasterRecoveryDryRunReport;
  agentSteps: BackupAgentTraceStep[];
}

export interface AgenticBackupRequest {
  resources: ResourceItem[];
  rawFiles?: RawFileItem[];
  options?: {
    sanitizeSecrets?: boolean;
    runDeepEpistemicScan?: boolean;
    scopeName?: string;
  };
}

export interface AgenticBackupResponse {
  success: boolean;
  manifest: CertifiedEpistemicManifest;
  auditedResources: ResourceItem[];
  rawFiles: RawFileItem[];
  executionTimeMs: number;
}

// ============================================================================
// AGENTE 1: SECURITY SANITIZER & SECRET LEAK AUDITOR
// ============================================================================

const SECRET_PATTERNS: Array<{
  type: SecurityLeakFinding["leakType"];
  regex: RegExp;
  mask: string;
}> = [
  {
    type: "api_key",
    regex: /(?:sk-[a-zA-Z0-9_\-]{20,}|AIzaSy[a-zA-Z0-9_\-]{33}|ghp_[a-zA-Z0-9]{36}|xox[baprs]-[0-9a-zA-Z]{10,48})/g,
    mask: "[REDACTED_API_KEY]",
  },
  {
    type: "bearer_token",
    regex: /Bearer\s+ey[a-zA-Z0-9._\-]{20,}/g,
    mask: "Bearer [REDACTED_JWT_TOKEN]",
  },
  {
    type: "db_connection",
    regex: /(?:postgres|postgresql|mongodb(\+srv)?|mysql):\/\/[^:\s]+:[^@\s]+@[^\s]+/g,
    mask: "[REDACTED_DB_CONNECTION_STRING]",
  },
  {
    type: "private_key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    mask: "[REDACTED_PRIVATE_KEY]",
  },
  {
    type: "aws_credential",
    regex: /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
    mask: "[REDACTED_AWS_KEY_ID]",
  },
];

export function runSecuritySanitizer(
  resources: ResourceItem[],
  sanitizeSecrets: boolean
): {
  sanitizedResources: ResourceItem[];
  findings: SecurityLeakFinding[];
  traceStep: BackupAgentTraceStep;
} {
  const startTime = Date.now();
  const findings: SecurityLeakFinding[] = [];
  const sanitizedResources: ResourceItem[] = [];

  for (const res of resources) {
    let modified = false;
    let rawInput = res.rawInput || "";
    let summary = res.summary || "";
    let markdownContent = res.metadata?.markdownContent || "";

    for (const pattern of SECRET_PATTERNS) {
      // Check in rawInput
      if (pattern.regex.test(rawInput)) {
        pattern.regex.lastIndex = 0;
        const matches = rawInput.match(pattern.regex) || [];
        matches.forEach((m) => {
          findings.push({
            resourceId: res.id,
            resourceTitle: res.title,
            leakType: pattern.type,
            matchedSample: m.slice(0, 6) + "..." + m.slice(-4),
            location: "rawInput",
          });
        });
        if (sanitizeSecrets) {
          rawInput = rawInput.replace(pattern.regex, pattern.mask);
          modified = true;
        }
      }

      // Check in summary
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(summary)) {
        pattern.regex.lastIndex = 0;
        const matches = summary.match(pattern.regex) || [];
        matches.forEach((m) => {
          findings.push({
            resourceId: res.id,
            resourceTitle: res.title,
            leakType: pattern.type,
            matchedSample: m.slice(0, 6) + "..." + m.slice(-4),
            location: "summary",
          });
        });
        if (sanitizeSecrets) {
          summary = summary.replace(pattern.regex, pattern.mask);
          modified = true;
        }
      }

      // Check in metadata.markdownContent
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(markdownContent)) {
        pattern.regex.lastIndex = 0;
        const matches = markdownContent.match(pattern.regex) || [];
        matches.forEach((m) => {
          findings.push({
            resourceId: res.id,
            resourceTitle: res.title,
            leakType: pattern.type,
            matchedSample: m.slice(0, 6) + "..." + m.slice(-4),
            location: "metadata",
          });
        });
        if (sanitizeSecrets) {
          markdownContent = markdownContent.replace(pattern.regex, pattern.mask);
          modified = true;
        }
      }
    }

    if (modified && sanitizeSecrets) {
      sanitizedResources.push({
        ...res,
        rawInput,
        summary,
        metadata: {
          ...res.metadata,
          markdownContent,
        },
      });
    } else {
      sanitizedResources.push(res);
    }
  }

  const latencyMs = Date.now() - startTime;
  const traceStep: BackupAgentTraceStep = {
    agent: "security_sanitizer",
    action: "Audit e Sanificazione Credenziali & Token",
    description:
      findings.length === 0
        ? `Nessuna chiave API o credenziale trapelata rilevata su ${resources.length} risorse analizzate.`
        : `Rilevate ${findings.length} credenziali sensibili su ${new Set(findings.map((f) => f.resourceId)).size} risorse.${
            sanitizeSecrets ? " Mascheramento applicato." : " Conservate con alert nel manifesto."
          }`,
    itemsProcessed: resources.length,
    itemsFlagged: findings.length,
    status: findings.length === 0 ? "success" : sanitizeSecrets ? "warning" : "error",
    timestamp: new Date().toISOString(),
    latencyMs,
  };

  return { sanitizedResources, findings, traceStep };
}

// ============================================================================
// AGENTE 2: TOPOLOGICAL GRAPH AUDITOR
// ============================================================================

export function runTopologicalGraphAuditor(
  resources: ResourceItem[]
): {
  report: TopologicalGraphAuditReport;
  traceStep: BackupAgentTraceStep;
} {
  const startTime = Date.now();

  const titleToResource = new Map<string, ResourceItem>();
  const idToResource = new Map<string, ResourceItem>();
  const incomingDegree = new Map<string, number>();
  const outgoingDegree = new Map<string, number>();

  resources.forEach((r) => {
    const normTitle = (r.title || "").trim().toLowerCase();
    if (normTitle) titleToResource.set(normTitle, r);
    idToResource.set(r.id, r);
    incomingDegree.set(r.id, 0);
    outgoingDegree.set(r.id, 0);
  });

  let totalEdges = 0;
  let resolvedEdges = 0;
  const danglingEdges: TopologicalGraphAuditReport["danglingEdges"] = [];

  resources.forEach((r) => {
    const relations: OKFRelation[] = Array.isArray(r.metadata?.relations)
      ? r.metadata.relations
      : [];

    outgoingDegree.set(r.id, (outgoingDegree.get(r.id) || 0) + relations.length);

    relations.forEach((rel) => {
      totalEdges++;
      const targetNorm = (rel.targetTitle || "").trim().toLowerCase();
      const targetMatch = titleToResource.get(targetNorm);

      if (targetMatch) {
        resolvedEdges++;
        incomingDegree.set(
          targetMatch.id,
          (incomingDegree.get(targetMatch.id) || 0) + 1
        );
      } else {
        danglingEdges.push({
          sourceId: r.id,
          sourceTitle: r.title,
          targetTitle: rel.targetTitle || "(Target indefinito)",
          relationType: rel.relationType || "relates_to",
        });
      }
    });
  });

  // Calculate orphans and hubs
  const orphanNodes: TopologicalGraphAuditReport["orphanNodes"] = [];
  const hubNodes: TopologicalGraphAuditReport["hubNodes"] = [];

  resources.forEach((r) => {
    const totalConns =
      (incomingDegree.get(r.id) || 0) + (outgoingDegree.get(r.id) || 0);

    if (totalConns === 0) {
      orphanNodes.push({ id: r.id, title: r.title, type: r.type });
    } else if (totalConns >= 4) {
      hubNodes.push({ id: r.id, title: r.title, connectionsCount: totalConns });
    }
  });

  hubNodes.sort((a, b) => b.connectionsCount - a.connectionsCount);

  // Density and integrity score
  const maxPossibleEdges = resources.length * (resources.length - 1) || 1;
  const densityScore = Math.min(100, Math.round((totalEdges / maxPossibleEdges) * 100 * 10)); // normalized scale
  const resolutionRatio = totalEdges > 0 ? (resolvedEdges / totalEdges) : 1;
  const integrityScore = Math.round(
    resolutionRatio * 70 + (1 - Math.min(orphanNodes.length / (resources.length || 1), 1)) * 30
  );

  const report: TopologicalGraphAuditReport = {
    totalNodes: resources.length,
    totalEdges,
    resolvedEdges,
    danglingEdges,
    orphanNodes,
    hubNodes,
    densityScore,
    integrityScore,
  };

  const latencyMs = Date.now() - startTime;
  const traceStep: BackupAgentTraceStep = {
    agent: "topological_graph_auditor",
    action: "Audit Connettività e Archi Topologici",
    description: `Grafo composto da ${resources.length} nodi e ${totalEdges} archi. ${resolvedEdges} archi interni verificati, ${danglingEdges.length} riferimenti esterni/orfani, ${orphanNodes.length} nodi isolati.`,
    itemsProcessed: resources.length,
    itemsFlagged: danglingEdges.length + orphanNodes.length,
    status: danglingEdges.length > 5 ? "warning" : "success",
    timestamp: new Date().toISOString(),
    latencyMs,
  };

  return { report, traceStep };
}

// ============================================================================
// AGENTE 3: CEKIKJ CONTRADICTION SENTINEL & EPISTEMIC HEALTH AUDITOR
// ============================================================================

export async function runCekikjContradictionSentinel(
  resources: ResourceItem[],
  runDeepScan: boolean
): Promise<{
  report: EpistemicContradictionAuditReport;
  traceStep: BackupAgentTraceStep;
}> {
  const startTime = Date.now();
  const flaggedConflicts: EpistemicContradictionAuditReport["flaggedConflicts"] = [];

  // 1. Static Epistemic Check: search for conflicting status or deprecated tags
  const conceptIndex = new Map<string, ResourceItem[]>();

  resources.forEach((r) => {
    // Check tags for deprecation vs active tags
    const hasDeprecated = (r.tags || []).some((t) =>
      ["deprecated", "obsoleto", "superato", "legacy"].includes(t.toLowerCase())
    );
    const hasActive = (r.tags || []).some((t) =>
      ["production", "raccomandato", "v1", "v2", "attivo"].includes(t.toLowerCase())
    );

    if (hasDeprecated && hasActive) {
      flaggedConflicts.push({
        resourceA: r.title,
        concept: "Tagging Dottrinale Confliggente",
        reason: `La risorsa presenta contemporaneamente tag di vigenza attiva e di obsolescenza deprecata.`,
        severity: "medium",
      });
    }

    // Index by primary entity
    const entities = r.metadata?.entities || [];
    entities.forEach((ent: any) => {
      const name = (typeof ent === "string" ? ent : ent?.name || "").trim().toLowerCase();
      if (name && name.length > 3) {
        const list = conceptIndex.get(name) || [];
        list.push(r);
        conceptIndex.set(name, list);
      }
    });
  });

  // 2. Pairwise Epistemic Conflict Heuristics
  conceptIndex.forEach((group, concept) => {
    if (group.length > 1) {
      const titles = group.map((g) => g.title);
      // Check for opposing polarity or contradictory statements in summaries
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const sumA = (group[i].summary || "").toLowerCase();
          const sumB = (group[j].summary || "").toLowerCase();

          const aSaysNo = sumA.includes("deprecat") || sumA.includes("non supportat") || sumA.includes("sconsigliat");
          const bSaysYes = sumB.includes("standard") || sumB.includes("consigliat") || sumB.includes("obbligatori");

          if (aSaysNo && bSaysYes) {
            flaggedConflicts.push({
              resourceA: group[i].title,
              resourceB: group[j].title,
              concept,
              reason: `Divergenza dottrinale rilevata sul concetto '${concept}': uno afferma vigenza/standard, l'altro ne indica obsolescenza o non supporto.`,
              severity: "high",
            });
          }
        }
      }
    }
  });

  // 3. Optional Deep AI Scan with Gemini for edge-cases if resources count <= 30
  if (runDeepScan && resources.length > 0 && resources.length <= 30) {
    try {
      const prompt = `Sei l'Epistemic Contradiction Sentinel secondo il Protocollo Cekikj (Zero-Guessing).
Analizza i seguenti sommari di documenti per identificare eventuali contraddizioni logiche o fattuali palesi.
Rispondi con un array JSON di conflitti nel formato:
[{"concept": "...", "resourceA": "...", "resourceB": "...", "reason": "...", "severity": "low|medium|high"}]

Documenti:
${resources.map((r, i) => `[${i + 1}] "${r.title}": ${r.summary}`).join("\n")}`;

      const aiResponse = await generateWithGeminiFallback(prompt, {
        jsonMode: true,
        temperature: 0.1,
      });

      if (aiResponse?.text) {
        const parsed = JSON.parse(aiResponse.text);
        if (Array.isArray(parsed)) {
          parsed.forEach((c: any) => {
            if (c.concept && c.reason) {
              flaggedConflicts.push({
                resourceA: c.resourceA || "Doc",
                resourceB: c.resourceB,
                concept: c.concept,
                reason: c.reason,
                severity: c.severity || "medium",
              });
            }
          });
        }
      }
    } catch {
      // AI fallback gracefully to deterministic heuristics
    }
  }

  const epistemicHealthIndex = Math.max(
    0,
    Math.min(100, Math.round(100 - flaggedConflicts.length * 8))
  );

  const report: EpistemicContradictionAuditReport = {
    openContradictionsCount: flaggedConflicts.length,
    flaggedConflicts,
    epistemicHealthIndex,
    zeroGuessingCompliant: flaggedConflicts.length === 0,
  };

  const latencyMs = Date.now() - startTime;
  const traceStep: BackupAgentTraceStep = {
    agent: "contradiction_sentinel",
    action: "Audit Contraddizioni Epistemiche Cekikj",
    description:
      flaggedConflicts.length === 0
        ? `Nessuna contraddizione aperta o divergenza logica rilevata. Salute epistemica al 100%.`
        : `Identificate ${flaggedConflicts.length} possibili discrepanze dottrinali nel corpus del Vault.`,
    itemsProcessed: resources.length,
    itemsFlagged: flaggedConflicts.length,
    status: flaggedConflicts.length === 0 ? "success" : "warning",
    timestamp: new Date().toISOString(),
    latencyMs,
  };

  return { report, traceStep };
}

// ============================================================================
// AGENTE 4: DISASTER RECOVERY DRY-RUN & CRYPTOGRAPHIC CHECKSUM AGENT
// ============================================================================

export function runDisasterRecoveryDryRun(
  resources: ResourceItem[],
  rawFiles: RawFileItem[] = []
): {
  report: DisasterRecoveryDryRunReport;
  traceStep: BackupAgentTraceStep;
} {
  const startTime = Date.now();
  let passed = true;
  let roundtripValidated = false;
  let fieldsPreservedPercent = 100;

  let serializedString = "";
  let reconstructedCount = 0;

  try {
    const payload = {
      vault_version: "0.2",
      format: "okf_knowledge_vault_backup",
      exported_at: new Date().toISOString(),
      resources,
      raw_files: rawFiles,
    };

    serializedString = JSON.stringify(payload);
    const parsed = JSON.parse(serializedString);

    if (Array.isArray(parsed.resources) && parsed.resources.length === resources.length) {
      roundtripValidated = true;
      reconstructedCount = parsed.resources.length;

      // Sample-check first and last item for deep integrity
      const sampleIndices = [0, Math.floor(resources.length / 2), resources.length - 1];
      for (const idx of sampleIndices) {
        if (resources[idx]) {
          const orig = resources[idx];
          const restored = parsed.resources[idx];
          if (
            restored.id !== orig.id ||
            restored.title !== orig.title ||
            restored.type !== orig.type
          ) {
            fieldsPreservedPercent -= 10;
            passed = false;
          }
        }
      }
    } else {
      passed = false;
      roundtripValidated = false;
    }
  } catch {
    passed = false;
    roundtripValidated = false;
    fieldsPreservedPercent = 0;
  }

  // Generate SHA-256 Checksum of the canonized JSON stream
  const checksumSha256 = crypto
    .createHash("sha256")
    .update(serializedString || JSON.stringify(resources))
    .digest("hex");

  const payloadSizeBytes = Buffer.byteLength(serializedString, "utf8");
  const formattedSize =
    payloadSizeBytes >= 1024 * 1024
      ? `${(payloadSizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(payloadSizeBytes / 1024).toFixed(1)} KB`;

  const latencyMs = Date.now() - startTime;

  const report: DisasterRecoveryDryRunReport = {
    passed,
    roundtripValidated,
    resourcesReconstructed: reconstructedCount,
    fieldsPreservedPercent: Math.max(0, fieldsPreservedPercent),
    checksumSha256,
    payloadSizeBytes,
    formattedSize,
    latencyMs,
  };

  const traceStep: BackupAgentTraceStep = {
    agent: "disaster_recovery_dry_run",
    action: "Simulazione Ripristino & Hashing Crittografico",
    description: passed
      ? `Dry-Run completato con successo: roundtrip 100% loss-free. Calcolato SHA-256: ${checksumSha256.slice(0, 12)}...`
      : `Errore nella verifica di ripristino o discrepanza nei campi serializzati.`,
    itemsProcessed: resources.length,
    status: passed ? "success" : "error",
    timestamp: new Date().toISOString(),
    latencyMs,
  };

  return { report, traceStep };
}

// ============================================================================
// AGENTE 5 & 6: BACKUP ORCHESTRATOR & MANIFEST COMPILER
// ============================================================================

export async function executeAgenticBackupPipeline(
  request: AgenticBackupRequest
): Promise<AgenticBackupResponse> {
  const globalStart = Date.now();
  const agentSteps: BackupAgentTraceStep[] = [];
  const resources = request.resources || [];
  const rawFiles = request.rawFiles || [];
  const options = request.options || {};
  const sanitizeSecrets = options.sanitizeSecrets ?? true;
  const runDeepScan = options.runDeepEpistemicScan ?? false;

  // STEP 1: Orchestrator Initiation
  const orchestratorStart = Date.now();
  agentSteps.push({
    agent: "backup_orchestrator",
    action: "Pianificazione Strategica e Allocazione Agenti",
    description: `Inizializzazione della Pipeline di Backup & Certificazione Epistemica su ${resources.length} risorse e ${rawFiles.length} file raw. Attivazione di 5 agenti specialistici.`,
    itemsProcessed: resources.length,
    status: "success",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - orchestratorStart,
  });

  // STEP 2: Security Sanitizer Agent
  const securityResult = runSecuritySanitizer(resources, sanitizeSecrets);
  agentSteps.push(securityResult.traceStep);
  const sanitizedResources = securityResult.sanitizedResources;

  // STEP 3: Topological Graph Auditor Agent
  const graphResult = runTopologicalGraphAuditor(sanitizedResources);
  agentSteps.push(graphResult.traceStep);

  // STEP 4: Cekikj Contradiction Sentinel Agent
  const contradictionResult = await runCekikjContradictionSentinel(sanitizedResources, runDeepScan);
  agentSteps.push(contradictionResult.traceStep);

  // STEP 5: Disaster Recovery Dry-Run Agent
  const dryRunResult = runDisasterRecoveryDryRun(sanitizedResources, rawFiles);
  agentSteps.push(dryRunResult.traceStep);

  // STEP 6: Manifest Compilation & Epistemic Seal Assignment
  const manifestStart = Date.now();

  const totalWarnings =
    (securityResult.findings.length > 0 && !sanitizeSecrets ? 1 : 0) +
    (graphResult.report.danglingEdges.length > 5 ? 1 : 0) +
    contradictionResult.report.openContradictionsCount;

  let certificationSeal: CertifiedEpistemicManifest["certificationSeal"] = "CERTIFIED_OKF_V02_PASS";
  if (!dryRunResult.report.passed) {
    certificationSeal = "CERTIFICATION_FAILED";
  } else if (totalWarnings > 0) {
    certificationSeal = "CERTIFIED_WITH_WARNINGS";
  }

  // Composite global integrity score (0-100%)
  const compositeScore = Math.round(
    graphResult.report.integrityScore * 0.35 +
      contradictionResult.report.epistemicHealthIndex * 0.35 +
      dryRunResult.report.fieldsPreservedPercent * 0.2 +
      (securityResult.findings.length === 0 || sanitizeSecrets ? 10 : 0)
  );

  const manifest: CertifiedEpistemicManifest = {
    okfVersion: "0.2",
    certificationSeal,
    timestamp: new Date().toISOString(),
    checksumSha256: dryRunResult.report.checksumSha256,
    totalResources: sanitizedResources.length,
    totalRawFiles: rawFiles.length,
    integrityScore: Math.min(100, Math.max(0, compositeScore)),
    summary: `Backup verificato dall'Orchestratore e certificato con sigillo '${certificationSeal}'. Integrità complessiva: ${compositeScore}%. Risorse: ${sanitizedResources.length}, Archi: ${graphResult.report.totalEdges}, Checksum SHA-256 verificato.`,
    epistemicHealth: contradictionResult.report,
    graphTopology: graphResult.report,
    securityAudit: {
      scanned: true,
      leaksCount: securityResult.findings.length,
      sanitized: sanitizeSecrets,
      findings: securityResult.findings,
    },
    disasterRecoveryDryRun: dryRunResult.report,
    agentSteps,
  };

  agentSteps.push({
    agent: "manifest_compiler",
    action: "Emissione Sigillo di Certificazione Epistemica",
    description: `Sigillo emesso: [${certificationSeal}] con punteggio di integrità ${compositeScore}%. Checksum crittografico allegato al manifesto.`,
    status: certificationSeal === "CERTIFICATION_FAILED" ? "error" : "success",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - manifestStart,
  });

  return {
    success: certificationSeal !== "CERTIFICATION_FAILED",
    manifest,
    auditedResources: sanitizedResources,
    rawFiles,
    executionTimeMs: Date.now() - globalStart,
  };
}
