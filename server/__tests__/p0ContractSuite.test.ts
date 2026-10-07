/**
 * P0 Contract Test Suite for OKF v0.2 Architecture & Pipelines
 * 
 * Verifies all 7 tasks and security guardrails of the P0 specification:
 * 1. UTF-8 & Mojibake encoding hygiene
 * 2. Two-Stage DocType Resolver (resolveDocType)
 * 3. Modular MCP Secret Scrubber (scrubMcpConfig)
 * 4. Streaming Archive Security Service (ZIP Guardian)
 * 5. Shared Provenance Helper (provenanceHelper)
 * 6. Idempotent Backfill & Shadow Mode compliance
 */

import AdmZip from "adm-zip";
import { runMojibakeLint } from "../scripts/lintUtf8Encoding";
import { resolveDocType } from "../services/deterministicGates";
import {
  scrubMcpConfig,
  calculateShannonEntropy,
  shouldRedactValue,
  REDACTED_PLACEHOLDER,
} from "../services/mcpSecretScrubber";
import {
  inspectAndExtractZipArchive,
  isSafeZipPath,
  createAtomicTitle,
} from "../services/archiveSecurityService";
import {
  generateProvenanceRecord,
  estimateGeminiCostUsd,
  computeSha256,
} from "../services/provenanceHelper";
import {
  executeBackfill,
  validateResourceShadowCompliance,
} from "../scripts/backfillOkfProvenance";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  \x1b[32m✔\x1b[0m ${testName}`);
    testsPassed++;
  } else {
    console.error(`  \x1b[31m✖\x1b[0m ${testName}`);
    if (details) console.error(`    -> ${details}`);
    testsFailed++;
  }
}

async function runP0TestSuite() {
  console.log("\n========================================================");
  console.log("  RUNNING OKF v0.2 P0 CONTRACT VERIFICATION SUITE");
  console.log("========================================================\n");

  // -------------------------------------------------------------
  // TEST GROUP 1: UTF-8 Encoding & Mojibake Lint
  // -------------------------------------------------------------
  console.log("\x1b[36m[Group 1] Task 0.1 - UTF-8 Encoding & Mojibake Scan\x1b[0m");
  const lintClean = runMojibakeLint();
  assert(lintClean === true, "All repository files are free of mojibake and encoding corruption");

  // -------------------------------------------------------------
  // TEST GROUP 2: Two-Stage DocType Resolver
  // -------------------------------------------------------------
  console.log("\n\x1b[36m[Group 2] Task 0.2 - Two-Stage DocType Resolver\x1b[0m");
  
  // Deterministic ontologies
  const mcpRes = resolveDocType("mcp_server");
  assert(mcpRes.docType === "tool_description" && mcpRes.isLocked === true, "mcp_server deterministically maps to tool_description (locked)");

  const skillRes = resolveDocType("ai_skill");
  assert(skillRes.docType === "prompt_skill" && skillRes.isLocked === true, "ai_skill deterministically maps to prompt_skill (locked)");

  const troubleRes = resolveDocType("troubleshooting");
  assert(troubleRes.docType === "specification" && troubleRes.isLocked === true, "troubleshooting deterministically maps to specification (locked)");

  const procRes = resolveDocType("procedure");
  assert(procRes.docType === "guide" && procRes.isLocked === true, "procedure deterministically maps to guide (locked)");

  const paperRes = resolveDocType("paper");
  assert(paperRes.docType === "specification" && paperRes.isLocked === true, "paper deterministically maps to specification (locked)");

  // Pre-extraction provisional triage
  const preArticle = resolveDocType("article");
  assert(preArticle.docType === "guide" && preArticle.stage === "pre_extraction" && preArticle.isLocked === false, "article pre-extraction yields provisional guide (unlocked)");

  const preKnowledge = resolveDocType("knowledge");
  assert(preKnowledge.docType === "concept" && preKnowledge.stage === "pre_extraction" && preKnowledge.isLocked === false, "knowledge pre-extraction yields provisional concept (unlocked)");

  // Post-extraction AST analysis
  const postDiagram = resolveDocType("knowledge", {
    markdownContent: "# Cloud Architecture\n\n```mermaid\ngraph TD\n  A[Frontend] --> B[API]\n```",
  });
  assert(postDiagram.docType === "architecture" && postDiagram.isLocked === true, "knowledge with mermaid diagram resolves to architecture (locked)");

  const postCode = resolveDocType("knowledge", {
    markdownContent: "# Tutorial\n\n```typescript\nconst x = 10;\n```",
  });
  assert(postCode.docType === "guide" && postCode.isLocked === true, "knowledge with code block resolves to guide (locked)");

  const postTimeline = resolveDocType("knowledge", {
    markdownContent: "# Storia dell'informatica\n\nCronologia eventi:\n- Nel 1969 nasce ARPANET",
  });
  assert(postTimeline.docType === "concept" && postTimeline.isLocked === true, "knowledge with chronological timeline resolves to concept (locked)");

  const postError = resolveDocType("knowledge", {
    markdownContent: "# Crash Report\n\nError: ECONNREFUSED at TCPConnectWrap",
  });
  assert(postError.docType === "specification" && postError.isLocked === true, "knowledge with error stack resolves to specification (locked)");

  // -------------------------------------------------------------
  // TEST GROUP 3: Streaming Archive Security Service (ZIP Guardian)
  // -------------------------------------------------------------
  console.log("\n\x1b[36m[Group 3] Task 0.3 - Archive Security Service (ZIP Guardian)\x1b[0m");

  assert(isSafeZipPath("docs/README.md") === true, "Safe relative path is accepted");
  assert(isSafeZipPath("../secret.txt") === false, "Path traversal with ../ is blocked");
  assert(isSafeZipPath("folder/../../secret.txt") === false, "Embedded path traversal is blocked");
  assert(isSafeZipPath("/etc/passwd") === false, "Absolute path starting with / is blocked");
  assert(isSafeZipPath("C:\\Windows\\System32") === false, "Windows drive letter absolute path is blocked");
  assert(isSafeZipPath("file\0.txt") === false, "Null-byte injection in path is blocked");

  assert(createAtomicTitle("docs/architecture/system.md") === "docs_architecture_system", "Atomic title created without path collisions");

  // Valid Zip mock
  const validZip = new AdmZip();
  validZip.addFile("notes/first.md", Buffer.from("# Primo Documento\nTesto normale"));
  validZip.addFile("notes/second.md", Buffer.from("# Secondo Documento\n[[first]]"));
  const validResult = inspectAndExtractZipArchive(validZip.toBuffer(), "test.zip");
  assert(validResult.valid === true && validResult.totalFiles === 2, "Valid zip extracted successfully");

  // Malicious zip with path traversal
  const evilZip = new AdmZip();
  evilZip.addFile("test.txt", Buffer.from("traversal payload"));
  let evilBuf = evilZip.toBuffer();
  let idx = 0;
  while ((idx = evilBuf.indexOf(Buffer.from("test.txt"), idx)) !== -1) {
    evilBuf.write("../evil", idx);
    idx += 7;
  }
  const evilResult = inspectAndExtractZipArchive(evilBuf, "evil.zip");
  assert(evilResult.valid === false && evilResult.error?.includes("Directory Traversal"), "Directory traversal archive is rejected immediately");

  // Zip bomb ratio protection simulation: 500KB of zeros compresses to ~500 bytes (ratio ~1000:1 > 100:1)
  const ratioZip = new AdmZip();
  ratioZip.addFile("zeros.txt", Buffer.alloc(500 * 1024, 0));
  const ratioResult = inspectAndExtractZipArchive(ratioZip.toBuffer(), "bomb.zip");
  assert(ratioResult.valid === false && ratioResult.error?.includes("Zip Bomb"), "Zip bomb ratio > 100:1 is detected and blocked");

  // -------------------------------------------------------------
  // TEST GROUP 4: Modular MCP Secret Scrubber
  // -------------------------------------------------------------
  console.log("\n\x1b[36m[Group 4] Task 0.4 - Modular MCP Secret Scrubber\x1b[0m");

  // 10 fixture cases
  assert(shouldRedactValue("API_KEY", "sk-1234567890abcdef") === true, "Fixture 1: Key API_KEY is redacted");
  assert(shouldRedactValue("JWT_SECRET", "super-secret-passphrase") === true, "Fixture 2: Key JWT_SECRET is redacted");
  assert(shouldRedactValue("DB_PASSWORD", "postgresRoot123") === true, "Fixture 3: Key DB_PASSWORD is redacted");
  assert(shouldRedactValue("authBearer", "Bearer my-token-value") === true, "Fixture 4: Key authBearer is redacted");
  assert(shouldRedactValue("webhook_url", "https://discord.com/api/webhooks/xyz") === true, "Fixture 5: Key webhook_url is redacted");

  assert(shouldRedactValue("NODE_ENV", "production") === false, "Fixture 6: Safe allowlist value 'production' is preserved");
  assert(shouldRedactValue("HOST", "localhost") === false, "Fixture 7: Safe allowlist value 'localhost' is preserved");
  assert(shouldRedactValue("IP_ADDR", "127.0.0.1") === false, "Fixture 8: Safe allowlist value '127.0.0.1' is preserved");

  // High entropy check with length >= 24
  const highEntropyToken = "dGVzdC1hdXRoLWtleS05MTgyNzM2NDU1MjM=";
  const entropy = calculateShannonEntropy(highEntropyToken);
  assert(entropy > 4.5 && highEntropyToken.length >= 24, "Entropy calculator accurately yields > 4.5 bits/char on base64 tokens");
  assert(shouldRedactValue("GENERIC_PARAM", highEntropyToken) === true, "Fixture 9: High entropy string >= 24 chars is redacted even with generic key");

  // Short string with high entropy without key match
  assert(shouldRedactValue("FLAG", "x!8@") === false, "Fixture 10: Short string without secret key is not falsely redacted");

  // Object recursive scrub
  const dirtyMcpConfig = {
    serverName: "github-tools",
    env: {
      NODE_ENV: "production",
      GITHUB_TOKEN: "ghp_1234567890abcdefghijklmnopqrstu",
      PORT: "3000",
      NESTED: {
        SECRET_SALT: "random-salt",
      },
    },
  };
  const scrubbed = scrubMcpConfig(dirtyMcpConfig);
  assert(
    scrubbed.env.NODE_ENV === "production" &&
    scrubbed.env.GITHUB_TOKEN === REDACTED_PLACEHOLDER &&
    scrubbed.env.NESTED.SECRET_SALT === REDACTED_PLACEHOLDER,
    "Recursive object scrubbing redacts secrets while preserving safe allowlist variables"
  );

  // -------------------------------------------------------------
  // TEST GROUP 5: Shared Provenance Helper
  // -------------------------------------------------------------
  console.log("\n\x1b[36m[Group 5] Task 0.5 - Shared Provenance Helper\x1b[0m");

  const prov = generateProvenanceRecord({
    modelUsed: "gemini-3.7-flash",
    pipelineId: "test-pipeline",
    tokensIn: 1000,
    tokensOut: 500,
    durationMs: 450,
    contentToHash: "OKF v0.2 Verification Document",
  });

  assert(prov.modelUsed === "gemini-3.7-flash", "Provenance records modelUsed");
  assert(prov.pipelineId === "test-pipeline", "Provenance records pipelineId");
  assert(prov.pipelineVersion === "1.2.0", "Provenance sets pipelineVersion");
  assert(prov.sha256.length === 64, "Provenance computes valid 64-char SHA-256 fingerprint");
  assert(prov.estimatedCostUsd > 0, "Provenance calculates FinOps estimated cost in USD");

  // Pricing calculations
  const flashCost = estimateGeminiCostUsd("gemini-3.7-flash", 1_000_000, 1_000_000);
  assert(flashCost === 0.50, "FinOps calculation for Gemini Flash: $0.10 in + $0.40 out = $0.50 per 1M");

  const hashTest = computeSha256("test-content");
  assert(hashTest === "0a3666a0710c08aa6d0de92ce72beeb5b93124cce1bf3701c9d6cdeb543cb73e", "Deterministic SHA-256 hashes match cryptographic standards");

  // -------------------------------------------------------------
  // TEST GROUP 6: Idempotent Backfill & Shadow Mode Compliance
  // -------------------------------------------------------------
  console.log("\n\x1b[36m[Group 6] Task 0.6 - Idempotent Backfill & Shadow Mode\x1b[0m");

  const sampleLegacyResources = [
    {
      id: "sample-1",
      title: "Guida Docker e Containers",
      type: "knowledge",
      summary: "Guida pratica ai container",
      tags: ["docker", "tutorial"],
      metadata: {
        markdownContent: "# Tutorial Docker\n\n```bash\ndocker run -d nginx\n```",
      },
    },
    {
      id: "sample-2",
      title: "MCP Database Connector",
      type: "mcp_server",
      summary: "Connector per PostgreSQL",
      tags: ["mcp", "postgres"],
      metadata: {
        env: {
          DATABASE_PASSWORD: "secret-password",
          NODE_ENV: "production",
        },
      },
    },
  ];

  // Pass 1: Backfill migration
  const pass1 = executeBackfill(sampleLegacyResources, { dryRun: true });
  assert(pass1.stats.provenanceAdded === 2, "Pass 1: Added provenance to all un-migrated items");
  assert(pass1.stats.docTypeUpdated === 2, "Pass 1: Resolved and locked docTypes");
  assert(pass1.stats.mcpScrubbed === 1, "Pass 1: Redacted secrets in MCP item");
  assert(pass1.updatedResources[0].metadata.docType === "guide", "Item with code block mapped to docType guide");
  assert(pass1.updatedResources[1].metadata.docType === "tool_description", "MCP server mapped to docType tool_description");
  assert(pass1.updatedResources[1].metadata.env.DATABASE_PASSWORD === REDACTED_PLACEHOLDER, "MCP password redacted");
  assert(pass1.updatedResources[1].metadata.env.NODE_ENV === "production", "MCP safe env preserved");

  // Pass 2: Re-run on already migrated items to verify idempotence
  const pass2 = executeBackfill(pass1.updatedResources, { dryRun: true });
  assert(pass2.stats.provenanceAdded === 0, "Pass 2: 0 new provenance records added (100% idempotent)");
  assert(pass2.stats.docTypeUpdated === 0, "Pass 2: 0 docType updates on already resolved items (100% idempotent)");
  assert(pass2.stats.mcpScrubbed === 0, "Pass 2: 0 MCP modifications on already scrubbed items (100% idempotent)");

  // Shadow Mode non-blocking compliance validation
  const emptyTitleItem = { id: "bad-item", type: "knowledge", metadata: { okfVersion: "0.2", docType: "concept" } };
  const warnings = validateResourceShadowCompliance(emptyTitleItem);
  assert(warnings.length > 0 && warnings[0].includes("title"), "Shadow Mode detects missing mandatory title without throwing runtime exceptions");

  // -------------------------------------------------------------
  // FINAL RESULTS SUMMARY
  // -------------------------------------------------------------
  console.log("\n========================================================");
  console.log(`  SUITE SUMMARY: \x1b[32m${testsPassed} PASSED\x1b[0m, \x1b[31m${testsFailed} FAILED\x1b[0m`);
  console.log("========================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runP0TestSuite().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
