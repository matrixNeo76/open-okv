/**
 * Idempotent OKF v0.2 Provenance & Metadata Backfill Script
 * 
 * Aligns legacy resources in vault-backup.json with OKF v0.2 standards:
 * - Generates immutable metadata.provenance records for legacy items
 * - Resolves ontological metadata.docType using Two-Stage resolveDocType
 * - Sanitizes sensitive MCP credentials using mcpSecretScrubber
 * - Evaluates validation compliance in Shadow Mode without data loss
 * - Supports --dry-run (default), --commit, and --rollback
 */

import fs from "fs";
import path from "path";
import { generateProvenanceRecord, computeSha256 } from "../services/provenanceHelper";
import { resolveDocType } from "../services/deterministicGates";
import { scrubMcpConfig } from "../services/mcpSecretScrubber";

export const FEATURE_FLAGS = {
  ENABLE_OKF_SHADOW_VALIDATION: process.env.ENABLE_OKF_SHADOW_VALIDATION !== "false",
  ENABLE_ADVANCED_ZIP_GUARDIAN: process.env.ENABLE_ADVANCED_ZIP_GUARDIAN !== "false",
  ENABLE_STRICT_MCP_SCRUBBER: process.env.ENABLE_STRICT_MCP_SCRUBBER !== "false",
};

export interface BackfillStats {
  totalInspected: number;
  provenanceAdded: number;
  docTypeUpdated: number;
  mcpScrubbed: number;
  validationWarnings: number;
  compliantCount: number;
}

export interface BackfillResult {
  stats: BackfillStats;
  dryRun: boolean;
  snapshotCreated?: string;
  error?: string;
}

const BACKUP_FILE = path.resolve(process.cwd(), "data/vault-backup.json");
const SNAPSHOTS_DIR = path.resolve(process.cwd(), "data/snapshots");

/**
 * Validates basic OKF v0.2 schema constraints in shadow mode (non-blocking).
 */
export function validateResourceShadowCompliance(item: any): string[] {
  const warnings: string[] = [];

  if (!item.title || typeof item.title !== "string" || item.title.trim().length === 0) {
    warnings.push("Missing or empty 'title'");
  }
  if (!item.type || typeof item.type !== "string") {
    warnings.push("Missing or invalid 'type'");
  }
  if (!item.metadata || typeof item.metadata !== "object") {
    warnings.push("Missing 'metadata' object");
  } else {
    if (item.metadata.okfVersion !== "0.2") {
      warnings.push("metadata.okfVersion is not '0.2'");
    }
    if (!item.metadata.docType) {
      warnings.push("Missing metadata.docType");
    }
  }

  return warnings;
}

/**
 * Runs the backfill migration idempotently across resources.
 */
export function executeBackfill(
  resources: any[],
  options: { dryRun: boolean }
): { updatedResources: any[]; stats: BackfillStats } {
  const stats: BackfillStats = {
    totalInspected: resources.length,
    provenanceAdded: 0,
    docTypeUpdated: 0,
    mcpScrubbed: 0,
    validationWarnings: 0,
    compliantCount: 0,
  };

  const updatedResources = resources.map((originalItem) => {
    // Clone item to avoid unintended in-place mutation during dry-run
    const item = JSON.parse(JSON.stringify(originalItem));
    if (!item.metadata) {
      item.metadata = {};
    }

    item.metadata.okfVersion = "0.2";

    // 1. Resolve and align docType
    const resolution = resolveDocType(item.type, {
      markdownContent: item.metadata.markdownContent,
      domain: item.metadata.domain,
      tags: item.tags,
    });

    if (item.metadata.docType !== resolution.docType || item.metadata.docTypeLocked !== resolution.isLocked) {
      item.metadata.docType = resolution.docType;
      item.metadata.docTypeLocked = resolution.isLocked;
      item.metadata.docTypeResolutionSource = resolution.resolutionSource;
      stats.docTypeUpdated++;
    }

    // 2. Attach immutable provenance if missing
    if (!item.metadata.provenance || !item.metadata.provenance.sha256) {
      const contentToHash = item.metadata.markdownContent || item.summary || item.title || item.id;
      item.metadata.provenance = generateProvenanceRecord({
        modelUsed: item.metadata.preferredModel || "legacy-ingestion",
        pipelineId: "backfill-migration-okf-v0.2",
        pipelineVersion: "1.2.0",
        promptVersion: "0.2.2",
        tokensIn: 0,
        tokensOut: 0,
        durationMs: 0,
        contentToHash,
      });
      stats.provenanceAdded++;
    }

    // 3. MCP credentials scrubbing
    if (item.type === "mcp_server" && FEATURE_FLAGS.ENABLE_STRICT_MCP_SCRUBBER) {
      const beforeStr = JSON.stringify(item.metadata);
      item.metadata = scrubMcpConfig(item.metadata);
      const afterStr = JSON.stringify(item.metadata);
      if (beforeStr !== afterStr) {
        stats.mcpScrubbed++;
      }
    }

    // 4. Shadow Mode compliance check
    if (FEATURE_FLAGS.ENABLE_OKF_SHADOW_VALIDATION) {
      const warnings = validateResourceShadowCompliance(item);
      item.metadata.okfValidationWarnings = warnings;
      if (warnings.length > 0) {
        stats.validationWarnings++;
        item.metadata.schemaCompliance = "draft_pending_validation";
      } else {
        stats.compliantCount++;
        item.metadata.schemaCompliance = "okf_v0.2_compliant";
      }
    }

    return item;
  });

  return { updatedResources, stats };
}

/**
 * Main execution function with CLI argument parsing.
 */
export async function runBackfillCli(): Promise<BackfillResult> {
  const args = process.argv.slice(2);
  const isCommit = args.includes("--commit");
  const isRollback = args.includes("--rollback");
  const isDryRun = !isCommit && !isRollback;

  console.log("\n========================================================");
  console.log("  OKF v0.2 PROVENANCE & METADATA BACKFILL MANAGER");
  console.log(`  Mode: ${isRollback ? "ROLLBACK" : isCommit ? "COMMIT (LIVE WRITE)" : "DRY-RUN (SIMULATION)"}`);
  console.log(`  Feature Flags:`, FEATURE_FLAGS);
  console.log("========================================================\n");

  if (!fs.existsSync(BACKUP_FILE)) {
    const errorMsg = `File di backup ${BACKUP_FILE} non trovato.`;
    console.error(`[ERROR] ${errorMsg}`);
    return { stats: { totalInspected: 0, provenanceAdded: 0, docTypeUpdated: 0, mcpScrubbed: 0, validationWarnings: 0, compliantCount: 0 }, dryRun: isDryRun, error: errorMsg };
  }

  // Handle rollback mode
  if (isRollback) {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      const errorMsg = "Nessuna directory degli snapshot trovata per il rollback.";
      console.error(`[ERROR] ${errorMsg}`);
      return { stats: { totalInspected: 0, provenanceAdded: 0, docTypeUpdated: 0, mcpScrubbed: 0, validationWarnings: 0, compliantCount: 0 }, dryRun: false, error: errorMsg };
    }

    const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.startsWith("vault-backup.pre-backfill-")).sort().reverse();
    if (files.length === 0) {
      const errorMsg = "Nessuno snapshot precedente trovato per eseguire il rollback.";
      console.error(`[ERROR] ${errorMsg}`);
      return { stats: { totalInspected: 0, provenanceAdded: 0, docTypeUpdated: 0, mcpScrubbed: 0, validationWarnings: 0, compliantCount: 0 }, dryRun: false, error: errorMsg };
    }

    const latestSnapshot = path.join(SNAPSHOTS_DIR, files[0]);
    console.log(`[ROLLBACK] Ripristino dello snapshot: ${latestSnapshot} -> ${BACKUP_FILE}`);
    fs.copyFileSync(latestSnapshot, BACKUP_FILE);
    console.log("[ROLLBACK OK] Ripristino completato con successo.");
    return { stats: { totalInspected: 0, provenanceAdded: 0, docTypeUpdated: 0, mcpScrubbed: 0, validationWarnings: 0, compliantCount: 0 }, dryRun: false, snapshotCreated: latestSnapshot };
  }

  // Read backup
  const rawData = fs.readFileSync(BACKUP_FILE, "utf-8");
  const backupJson = JSON.parse(rawData);
  const resources = backupJson.resources || [];

  const { updatedResources, stats } = executeBackfill(resources, { dryRun: isDryRun });

  console.log(`[REPORT BACKFILL]`);
  console.log(`  - Risorse totali ispezionate : ${stats.totalInspected}`);
  console.log(`  - Provenance generata        : ${stats.provenanceAdded}`);
  console.log(`  - DocType allineati          : ${stats.docTypeUpdated}`);
  console.log(`  - Segreti MCP bonificati     : ${stats.mcpScrubbed}`);
  console.log(`  - Risorse conformi v0.2      : ${stats.compliantCount}`);
  console.log(`  - Risorse con warning shadow : ${stats.validationWarnings}`);

  let snapshotPath: string | undefined;

  if (isCommit) {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
    snapshotPath = path.join(SNAPSHOTS_DIR, `vault-backup.pre-backfill-${Date.now()}.json`);
    console.log(`[SNAPSHOT] Salvataggio snapshot di sicurezza in: ${snapshotPath}`);
    fs.writeFileSync(snapshotPath, rawData, "utf-8");

    backupJson.resources = updatedResources;
    backupJson.savedAt = new Date().toISOString();
    backupJson.timestamp = Date.now();

    const tempFile = `${BACKUP_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(backupJson, null, 2), "utf-8");
    fs.renameSync(tempFile, BACKUP_FILE);
    console.log(`[COMMIT OK] Aggiornato atomicamente ${BACKUP_FILE} con successo.\n`);
  } else {
    console.log(`\n[DRY-RUN COMPLETE] Nessuna modifica apportata al disco. Per applicare: tsx server/scripts/backfillOkfProvenance.ts --commit\n`);
  }

  return {
    stats,
    dryRun: isDryRun,
    snapshotCreated: snapshotPath,
  };
}

if (process.argv[1] && process.argv[1].endsWith("backfillOkfProvenance.ts")) {
  runBackfillCli()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[FATAL ERROR]", err);
      process.exit(1);
    });
}
