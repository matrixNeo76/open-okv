import crypto from "crypto";
import { getGenAI, recordGeminiCall } from "../gemini/client";

interface ActiveCacheEntry {
  cacheName: string;
  model: string;
  createdAt: number;
  expiresAt: number;
  tokenCount: number;
}

const cacheStore = new Map<string, ActiveCacheEntry>();
export const MIN_CACHE_TOKENS = 32768; // Gemini API threshold for Context Caching

/**
 * Approximate token count helper (~4 characters per token for multi-language technical text)
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

/**
 * Dynamic Context Caching Service:
 * Automatically checks payload token size. If payload exceeds the Gemini threshold
 * (32,768 tokens), creates or reuses an active Gemini Cache instance (1 hour TTL).
 * If under the threshold or if caching is unavailable, falls back gracefully to standard prompt execution.
 */
export async function getOrCreateContextCache(
  contextText: string,
  model = "gemini-3.7-flash",
  ttlSeconds = 3600
): Promise<{ cachedContentName: string | null; isCached: boolean; tokenCount: number }> {
  const estimatedTokens = estimateTokenCount(contextText);

  // If under the 32,768 token threshold, context caching is not allowed by Gemini API
  if (estimatedTokens < MIN_CACHE_TOKENS) {
    return {
      cachedContentName: null,
      isCached: false,
      tokenCount: estimatedTokens,
    };
  }

  const ai = getGenAI();
  if (!ai) {
    return { cachedContentName: null, isCached: false, tokenCount: estimatedTokens };
  }

  // Hash the context to deduplicate
  const contentHash = crypto.createHash("sha256").update(contextText).digest("hex");
  const existing = cacheStore.get(contentHash);

  // Check if existing cache is still valid (>60s remaining)
  if (existing && existing.expiresAt - Date.now() > 60000) {
    console.log(`[ContextCache] Reusing active cache: ${existing.cacheName} (${existing.tokenCount} tokens)`);
    return {
      cachedContentName: existing.cacheName,
      isCached: true,
      tokenCount: existing.tokenCount,
    };
  }

  const startMs = Date.now();
  try {
    console.log(`[ContextCache] Creating Gemini Context Cache for ~${estimatedTokens} tokens with TTL ${ttlSeconds}s...`);

    const cacheResult: any = await ai.caches.create({
      model,
      config: {
        contents: [
          {
            role: "user",
            parts: [{ text: contextText }],
          },
        ],
        displayName: `vault-cache-${contentHash.slice(0, 8)}`,
        ttl: `${ttlSeconds}s`,
      },
    });

    if (cacheResult?.name) {
      const now = Date.now();
      cacheStore.set(contentHash, {
        cacheName: cacheResult.name,
        model,
        createdAt: now,
        expiresAt: now + ttlSeconds * 1000,
        tokenCount: estimatedTokens,
      });

      recordGeminiCall({
        endpoint: "context-cache-create",
        model,
        latencyMs: Date.now() - startMs,
        status: "success",
        statusCode: 200,
        promptTokens: estimatedTokens,
      });

      console.log(`[ContextCache] Successfully created cache ${cacheResult.name}`);
      return {
        cachedContentName: cacheResult.name,
        isCached: true,
        tokenCount: estimatedTokens,
      };
    }
  } catch (err: any) {
    console.warn(`[ContextCache] Failed to create cache (falling back to direct prompt):`, err?.message);
    recordGeminiCall({
      endpoint: "context-cache-create",
      model,
      latencyMs: Date.now() - startMs,
      status: "error",
      statusCode: 500,
      errorMessage: err?.message,
    });
  }

  return {
    cachedContentName: null,
    isCached: false,
    tokenCount: estimatedTokens,
  };
}
