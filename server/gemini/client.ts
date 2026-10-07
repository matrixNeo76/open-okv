import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

// ----------------------------------------------------------------------
// Client Configuration and Initialization
// ----------------------------------------------------------------------
let genAIClient: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI | null {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAIClient;
}

// ----------------------------------------------------------------------
// Server-Side Telemetry Tracker for Gemini AI Quota & Operations
// ----------------------------------------------------------------------
export interface GeminiCallRecord {
  id: string;
  timestamp: string;
  endpoint: string;
  model: string;
  latencyMs: number;
  status: "success" | "quota_exceeded" | "unavailable" | "timeout" | "error";
  statusCode: number;
  promptTokens?: number;
  candidatesTokens?: number;
  errorMessage?: string;
}

export const geminiCallHistory: GeminiCallRecord[] = [];
export const modelUsageCounts: Record<string, number> = {
  "gemini-3.8-flash": 0,
  "gemini-3.7-flash": 0,
  "gemini-flash-latest": 0,
  "gemini-3.1-flash-lite": 0,
};
export let quota429Count = 0;
export let error503Count = 0;
let lastResetDateUtc = new Date().toISOString().slice(0, 10);
export let dailyRequestsCount = 0;

// Circuit Breaker: prevents hammering the API during active 429 quota exhaustion
let quotaCooldownUntil = 0;

export function isGeminiQuotaInCooldown(): boolean {
  return Date.now() < quotaCooldownUntil;
}

export function getGeminiQuotaCooldownRemainingMs(): number {
  return Math.max(0, quotaCooldownUntil - Date.now());
}

export function triggerGeminiQuotaCooldown(durationMs = 60000) {
  quotaCooldownUntil = Math.max(quotaCooldownUntil, Date.now() + durationMs);
}

export function resetGeminiQuotaCooldown() {
  quotaCooldownUntil = 0;
}

export interface RollingEntry {
  timestamp: number;
  tokens: number;
}
export const rollingMinuteRequests: RollingEntry[] = [];

export function recordGeminiCall(record: Omit<GeminiCallRecord, "id" | "timestamp">) {
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  if (todayUtc !== lastResetDateUtc) {
    lastResetDateUtc = todayUtc;
    dailyRequestsCount = 0;
    quota429Count = 0;
    error503Count = 0;
  }

  dailyRequestsCount++;
  if (record.model) {
    modelUsageCounts[record.model] = (modelUsageCounts[record.model] || 0) + 1;
  }

  if (record.status === "quota_exceeded") {
    quota429Count++;
  } else if (record.status === "unavailable") {
    error503Count++;
  }

  const nowMs = Date.now();
  const totalTokens = (record.promptTokens || 0) + (record.candidatesTokens || 0);
  rollingMinuteRequests.push({ timestamp: nowMs, tokens: totalTokens });

  // purge older than 60s
  while (rollingMinuteRequests.length > 0 && nowMs - rollingMinuteRequests[0].timestamp > 60000) {
    rollingMinuteRequests.shift();
  }

  const fullRecord: GeminiCallRecord = {
    id: `gem-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now.toISOString(),
    ...record,
  };

  geminiCallHistory.unshift(fullRecord);
  if (geminiCallHistory.length > 100) {
    geminiCallHistory.pop();
  }
}

export function purgeRollingMinutes() {
  const nowMs = Date.now();
  while (rollingMinuteRequests.length > 0 && nowMs - rollingMinuteRequests[0].timestamp > 60000) {
    rollingMinuteRequests.shift();
  }
}

export function trackCall(model: string, latencyMs: number, success: boolean, errorMessage?: string) {
  recordGeminiCall({
    endpoint: "vault-agents",
    model,
    latencyMs,
    status: success ? "success" : errorMessage?.includes("429") ? "quota_exceeded" : errorMessage?.includes("503") ? "unavailable" : errorMessage?.includes("Timeout") ? "timeout" : "error",
    statusCode: success ? 200 : errorMessage?.includes("429") ? 429 : errorMessage?.includes("503") ? 503 : 500,
    errorMessage,
  });
}

// ----------------------------------------------------------------------
// Candidate Model Hierarchy & Generation Helpers
// ----------------------------------------------------------------------
export const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
];

export interface GeminiGenerateOptions {
  timeoutMs?: number;
  endpoint?: string;
  thinkingBudget?: number; // 0 for fast response, or up to 2048 for complex reasoning
  preferredModel?: string; // Optional user-chosen model
}

export async function generateWithGeminiFallback(
  prompt: string,
  schema: any,
  options: GeminiGenerateOptions | number = 6000,
  endpointFallback = "/api/analyze-resource"
): Promise<{ text: string; modelUsed: string } | null> {
  const ai = getGenAI();
  if (!ai) return null;

  if (isGeminiQuotaInCooldown()) {
    console.log(
      `[Gemini] API quota cooldown active (${Math.ceil(getGeminiQuotaCooldownRemainingMs() / 1000)}s remaining) - using local heuristic fallback immediately`
    );
    return null;
  }

  const timeoutMs = typeof options === "number" ? options : (options.timeoutMs ?? 6000);
  const endpoint = typeof options === "number" ? endpointFallback : (options.endpoint ?? endpointFallback);
  const thinkingBudget = typeof options === "object" ? options.thinkingBudget : undefined;
  const preferredModel = typeof options === "object" ? options.preferredModel : undefined;

  let hadQuotaIssue = false;

  // Build model hierarchy: if a valid preferred model is specified, test it first
  const modelsToTry: string[] = [];
  if (preferredModel && preferredModel !== "auto") {
    modelsToTry.push(preferredModel);
    for (const m of CANDIDATE_MODELS) {
      if (m !== preferredModel) modelsToTry.push(m);
    }
  } else {
    modelsToTry.push(...CANDIDATE_MODELS);
  }

  for (const modelName of modelsToTry) {
    const callStart = Date.now();
    try {
      const config: any = {
        responseMimeType: "application/json",
        responseSchema: schema,
      };

      // Native Thinking Budget control: supports gemini-3.8-flash & gemini-3.7-flash
      if (modelName === "gemini-3.8-flash" || modelName === "gemini-3.7-flash") {
        if (thinkingBudget !== undefined) {
          config.thinkingConfig = { thinkingBudget };
        } else {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }
      } else if (modelName.startsWith("gemini-3")) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      if (response && response.text) {
        const latencyMs = Date.now() - callStart;
        recordGeminiCall({
          endpoint,
          model: modelName,
          latencyMs,
          status: "success",
          statusCode: 200,
          promptTokens: response?.usageMetadata?.promptTokenCount || 0,
          candidatesTokens: response?.usageMetadata?.candidatesTokenCount || 0,
        });
        return { text: response.text, modelUsed: modelName };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - callStart;
      const errMsg = (err?.message || "").toLowerCase();
      const isQuota =
        err?.status === "RESOURCE_EXHAUSTED" ||
        err?.code === 429 ||
        errMsg.includes("resource_exhausted") ||
        errMsg.includes("quota") ||
        errMsg.includes("429");
      const isUnavailable =
        err?.status === "UNAVAILABLE" ||
        err?.code === 503 ||
        errMsg.includes("503") ||
        errMsg.includes("overloaded") ||
        errMsg.includes("high demand") ||
        errMsg.includes("unavailable");

      recordGeminiCall({
        endpoint,
        model: modelName,
        latencyMs,
        status: isQuota ? "quota_exceeded" : isUnavailable ? "unavailable" : "error",
        statusCode: isQuota ? 429 : isUnavailable ? 503 : 500,
        errorMessage: err?.message || "Generation error",
      });

      if (isQuota) {
        hadQuotaIssue = true;
        console.log(`[Gemini] Model ${modelName} quota limit reached (429). Trying next candidate model...`);
        continue;
      } else if (isUnavailable) {
        console.log(`[Gemini] ${modelName} temporarily overloaded/busy (503), attempting next candidate model...`);
      } else {
        console.log(`[Gemini] ${modelName} generation issue: ${err?.message || "unknown"}`);
      }
    }
  }

  if (hadQuotaIssue) {
    triggerGeminiQuotaCooldown(45000);
    console.log(
      `[Gemini] All candidate models exhausted or rate-limited. Entering 45s cooldown; switching seamlessly to heuristic fallback parser.`
    );
  }

  return null;
}

export async function generateMultimodalWithGeminiFallback(
  contents: any,
  schema: any,
  timeoutMs = 45000,
  endpoint = "/api/convert-file-to-okf",
  preferredModel?: string
): Promise<{ text: string; modelUsed: string } | null> {
  const ai = getGenAI();
  if (!ai) return null;

  if (isGeminiQuotaInCooldown()) {
    console.log(
      `[Gemini Multimodal] API quota cooldown active (${Math.ceil(getGeminiQuotaCooldownRemainingMs() / 1000)}s remaining) - skipping remote calls`
    );
    return null;
  }

  let hadQuotaIssue = false;

  const modelsToTry: string[] = [];
  if (preferredModel && preferredModel !== "auto") {
    modelsToTry.push(preferredModel);
    for (const m of CANDIDATE_MODELS) {
      if (m !== preferredModel) modelsToTry.push(m);
    }
  } else {
    modelsToTry.push(...CANDIDATE_MODELS);
  }

  for (const modelName of modelsToTry) {
    const callStart = Date.now();
    try {
      const config: any = {
        responseMimeType: "application/json",
        responseSchema: schema,
      };

      if (modelName === "gemini-3.8-flash" || modelName === "gemini-3.7-flash") {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      if (response && response.text) {
        const latencyMs = Date.now() - callStart;
        recordGeminiCall({
          endpoint,
          model: modelName,
          latencyMs,
          status: "success",
          statusCode: 200,
          promptTokens: response?.usageMetadata?.promptTokenCount || 0,
          candidatesTokens: response?.usageMetadata?.candidatesTokenCount || 0,
        });
        return { text: response.text, modelUsed: modelName };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - callStart;
      const errMsg = (err?.message || "").toLowerCase();
      const isQuota =
        err?.status === "RESOURCE_EXHAUSTED" ||
        err?.code === 429 ||
        errMsg.includes("resource_exhausted") ||
        errMsg.includes("quota") ||
        errMsg.includes("429");
      const isUnavailable =
        err?.status === "UNAVAILABLE" ||
        err?.code === 503 ||
        errMsg.includes("503") ||
        errMsg.includes("overloaded") ||
        errMsg.includes("high demand") ||
        errMsg.includes("unavailable");

      recordGeminiCall({
        endpoint,
        model: modelName,
        latencyMs,
        status: isQuota ? "quota_exceeded" : isUnavailable ? "unavailable" : "error",
        statusCode: isQuota ? 429 : isUnavailable ? 503 : 500,
        errorMessage: err?.message || "Multimodal error",
      });

      if (isQuota) {
        hadQuotaIssue = true;
        console.log(`[Gemini Multimodal] Model ${modelName} quota limit reached (429). Trying next candidate model...`);
        continue;
      }
    }
  }

  if (hadQuotaIssue) {
    triggerGeminiQuotaCooldown(45000);
    console.log(`[Gemini Multimodal] All candidate models exhausted or rate-limited. Entering 45s cooldown.`);
  }

  return null;
}

export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string,
  fileName: string,
  timeoutMs = 50000
): Promise<string> {
  const ai = getGenAI();
  if (!ai || !audioBase64) return "";

  const lowerName = fileName.toLowerCase();
  const mimeCandidates: string[] = [];

  if (mimeType && mimeType.startsWith("audio/")) {
    mimeCandidates.push(mimeType);
  }

  if (lowerName.endsWith(".m4a") || (mimeType && (mimeType.includes("m4a") || mimeType.includes("mp4")))) {
    if (!mimeCandidates.includes("audio/mp4")) mimeCandidates.push("audio/mp4");
    if (!mimeCandidates.includes("audio/m4a")) mimeCandidates.push("audio/m4a");
    if (!mimeCandidates.includes("audio/aac")) mimeCandidates.push("audio/aac");
    if (!mimeCandidates.includes("audio/x-m4a")) mimeCandidates.push("audio/x-m4a");
  } else if (lowerName.endsWith(".mp3") || (mimeType && mimeType.includes("mp3"))) {
    if (!mimeCandidates.includes("audio/mp3")) mimeCandidates.push("audio/mp3");
    if (!mimeCandidates.includes("audio/mpeg")) mimeCandidates.push("audio/mpeg");
  } else if (lowerName.endsWith(".wav") || (mimeType && mimeType.includes("wav"))) {
    if (!mimeCandidates.includes("audio/wav")) mimeCandidates.push("audio/wav");
    if (!mimeCandidates.includes("audio/x-wav")) mimeCandidates.push("audio/x-wav");
  } else if (lowerName.endsWith(".ogg") || (mimeType && mimeType.includes("ogg"))) {
    if (!mimeCandidates.includes("audio/ogg")) mimeCandidates.push("audio/ogg");
  } else if (lowerName.endsWith(".flac") || (mimeType && mimeType.includes("flac"))) {
    if (!mimeCandidates.includes("audio/flac")) mimeCandidates.push("audio/flac");
  } else if (lowerName.endsWith(".webm") || (mimeType && mimeType.includes("webm"))) {
    if (!mimeCandidates.includes("audio/webm")) mimeCandidates.push("audio/webm");
  }

  if (mimeCandidates.length === 0) {
    mimeCandidates.push("audio/mp4", "audio/mp3", "audio/wav");
  }

  const transcriptionPrompt = `Accurately transcribe all spoken speech, dialogues, and discussions from this audio recording ("${fileName}"). Output the full verbatim transcription in the original spoken language (e.g., Italian or English). Use clear paragraphs, proper punctuation, and indicate speaker turns if identifiable. Do not invent details or add external commentary.`;

  const audioModels = [
    "gemini-3.5-transcribe",
    "gemini-3.7-flash",
    "gemini-flash-latest",
  ];

  for (const modelName of audioModels) {
    for (const currentMime of mimeCandidates) {
      try {
        console.log(`[Audio Transcribe] Attempting transcription with ${modelName} (MIME: ${currentMime}) for "${fileName}"...`);
        const config: any = {};
        if (modelName === "gemini-3.7-flash") {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }

        const generatePromise = ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                mimeType: currentMime,
                data: audioBase64,
              },
            },
            {
              text: transcriptionPrompt,
            },
          ],
          config,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        );

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        if (response && response.text && response.text.trim().length > 0) {
          console.log(`[Audio Transcribe] Successfully transcribed ${response.text.length} chars with ${modelName} (MIME: ${currentMime})`);
          return response.text.trim();
        }
      } catch (err: any) {
        console.warn(`[Audio Transcribe] Model ${modelName} with MIME ${currentMime} failed:`, err?.message || "error");
      }
    }
  }

  return "";
}
