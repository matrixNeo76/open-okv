/**
 * Shared Provenance and FinOps Tracking Helper
 * 
 * Attaches immutable provenance audit records (model, tokens, cost, duration, SHA-256)
 * to every ingested resource in metadata.provenance.
 */

import crypto from "crypto";

export interface ProvenanceRecord {
  modelUsed: string;
  pipelineId: string;
  pipelineVersion: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  durationMs: number;
  ingestedAt: string;
  sha256: string;
}

export interface BuildProvenanceOptions {
  modelUsed?: string;
  pipelineId?: string;
  pipelineVersion?: string;
  promptVersion?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  contentToHash?: string | Buffer;
}

/**
 * Calculates estimated cost in USD based on Gemini model pricing tiers.
 * Default baseline uses Gemini Flash pricing: $0.10 / 1M input tokens, $0.40 / 1M output tokens.
 */
export function estimateGeminiCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  let inRate = 0.10 / 1_000_000;
  let outRate = 0.40 / 1_000_000;

  if (model.includes("flash-lite")) {
    inRate = 0.075 / 1_000_000;
    outRate = 0.30 / 1_000_000;
  } else if (model.includes("pro")) {
    inRate = 1.25 / 1_000_000;
    outRate = 5.00 / 1_000_000;
  }

  const cost = tokensIn * inRate + tokensOut * outRate;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Computes deterministic SHA-256 hash of a string or buffer.
 */
export function computeSha256(content: string | Buffer): string {
  if (!content) return "";
  const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Generates an immutable, structured ProvenanceRecord conforming to OKF v0.2.
 */
export function generateProvenanceRecord(options: BuildProvenanceOptions): ProvenanceRecord {
  const modelUsed = options.modelUsed || "gemini-3.7-flash";
  const pipelineId = options.pipelineId || "universal-multimodal-ocr";
  const pipelineVersion = options.pipelineVersion || "1.2.0";
  const promptVersion = options.promptVersion || "0.2.2";
  const tokensIn = options.tokensIn || 0;
  const tokensOut = options.tokensOut || 0;
  const durationMs = options.durationMs || 0;

  const sha256 = options.contentToHash ? computeSha256(options.contentToHash) : "";
  const estimatedCostUsd = estimateGeminiCostUsd(modelUsed, tokensIn, tokensOut);

  return {
    modelUsed,
    pipelineId,
    pipelineVersion,
    promptVersion,
    tokensIn,
    tokensOut,
    estimatedCostUsd,
    durationMs,
    ingestedAt: new Date().toISOString(),
    sha256,
  };
}
