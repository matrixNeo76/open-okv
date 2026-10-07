import {
  getGenAI,
  recordGeminiCall,
  isGeminiQuotaInCooldown,
} from "../gemini/client";

// Dedicated Circuit Breaker for Google Search Grounding Tool
let searchGroundingCooldownUntil = 0;

export function isSearchGroundingInCooldown(): boolean {
  return Date.now() < searchGroundingCooldownUntil;
}

export function triggerSearchGroundingCooldown(durationMs = 120000) {
  searchGroundingCooldownUntil = Date.now() + durationMs;
}

export interface GroundedSearchResult {
  groundedText: string;
  searchQueries: string[];
  webSources: { uri: string; title: string }[];
  modelUsed: string;
}

/**
 * Stage 1 of Two-Stage Grounding:
 * Performs real-time Google Search grounding using Gemini to extract up-to-date
 * architectural details, documentation, entities, and verified web citations.
 */
export async function performSearchGroundedSynthesis(
  query: string,
  userHint?: string,
  timeoutMs = 15000
): Promise<GroundedSearchResult | null> {
  const ai = getGenAI();
  if (!ai || !query || query.trim().length === 0) return null;

  // Circuit breaker: If Gemini API quota is in cooldown OR search tool is in cooldown, return null immediately
  if (isGeminiQuotaInCooldown() || isSearchGroundingInCooldown()) {
    return null;
  }

  const candidateModels = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-flash-latest",
  ];
  const prompt = `Perform a live web search to gather authoritative, up-to-date facts, official documentation, architectural context, repository URLs, and technical specifications for the following user topic or inquiry:
"""
${query}
"""
${userHint ? `Additional Context/Intent: ${userHint}` : ""}

Provide a rich, factual, and detailed technical brief with key entities, features, installation patterns, and verified source references.`;

  for (const model of candidateModels) {
    const startMs = Date.now();
    try {
      const generatePromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);
      const latencyMs = Date.now() - startMs;
      const text = response?.text || "";

      if (text.trim().length > 0) {
        const candidate = response.candidates?.[0];
        const groundingMeta = candidate?.groundingMetadata;

        const webSources: { uri: string; title: string }[] = [];
        if (groundingMeta?.groundingChunks && Array.isArray(groundingMeta.groundingChunks)) {
          for (const chunk of groundingMeta.groundingChunks) {
            if (chunk.web?.uri) {
              webSources.push({
                uri: chunk.web.uri,
                title: chunk.web.title || chunk.web.uri,
              });
            }
          }
        }

        const searchQueries: string[] = groundingMeta?.webSearchQueries || [];

        recordGeminiCall({
          endpoint: "search-grounding",
          model,
          latencyMs,
          status: "success",
          statusCode: 200,
          promptTokens: response?.usageMetadata?.promptTokenCount || 0,
          candidatesTokens: response?.usageMetadata?.candidatesTokenCount || 0,
        });

        return {
          groundedText: text.trim(),
          searchQueries,
          webSources,
          modelUsed: model,
        };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startMs;
      const isQuota =
        err?.status === "RESOURCE_EXHAUSTED" ||
        err?.code === 429 ||
        err?.message?.includes("quota") ||
        err?.message?.includes("429") ||
        err?.message?.includes("RESOURCE_EXHAUSTED");
      const isOverloaded =
        err?.status === "UNAVAILABLE" ||
        err?.code === 503 ||
        err?.message?.includes("overloaded") ||
        err?.message?.includes("high demand");

      recordGeminiCall({
        endpoint: "search-grounding",
        model,
        latencyMs,
        status: isQuota ? "quota_exceeded" : isOverloaded ? "unavailable" : "error",
        statusCode: isQuota ? 429 : isOverloaded ? 503 : 500,
        errorMessage: isQuota ? "429 RESOURCE_EXHAUSTED" : err?.message,
      });

      if (isQuota) {
        triggerSearchGroundingCooldown(120000);
        console.log(
          `[SearchGrounding] Google Search Tool quota limit reached (429 RESOURCE_EXHAUSTED). Entering 120s search tool cooldown; standard Gemini generation remains active.`
        );
        break; // Stop attempting search tool under the same project quota
      } else if (isOverloaded) {
        console.log(`[SearchGrounding] ${model} temporarily overloaded (503). Trying next fallback model...`);
      } else {
        console.log(`[SearchGrounding] ${model} search failed: ${err?.message || "error"}`);
      }
    }
  }

  return null;
}
