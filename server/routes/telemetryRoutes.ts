import { Router } from "express";
import { Type } from "@google/genai";
import {
  getGenAI,
  recordGeminiCall,
  purgeRollingMinutes,
  geminiCallHistory,
  modelUsageCounts,
  quota429Count,
  error503Count,
  dailyRequestsCount,
  rollingMinuteRequests,
  CANDIDATE_MODELS,
  isGeminiQuotaInCooldown,
  getGeminiQuotaCooldownRemainingMs,
  triggerGeminiQuotaCooldown,
  resetGeminiQuotaCooldown,
} from "../gemini/client";

export const telemetryRouter = Router();

// GET /api/health - Health check endpoint
telemetryRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/telemetry/gemini-stats - Telemetry stats for Gemini AI
telemetryRouter.get("/telemetry/gemini-stats", (_req, res) => {
  purgeRollingMinutes();
  const requestsLastMinute = rollingMinuteRequests.length;
  const tokensLastMinute = rollingMinuteRequests.reduce((sum, item) => sum + item.tokens, 0);

  const inCooldown = isGeminiQuotaInCooldown();
  let status: "OPERATIONAL" | "RATE_LIMITED" | "EXHAUSTED" | "UNAVAILABLE" = "OPERATIONAL";
  if (inCooldown || dailyRequestsCount >= 1500) {
    status = "EXHAUSTED";
  } else if (quota429Count > 0 && requestsLastMinute >= 14) {
    status = "RATE_LIMITED";
  } else if (error503Count > 3) {
    status = "UNAVAILABLE";
  }

  res.json({
    requestsToday: dailyRequestsCount,
    dailyLimit: 1500,
    requestsLastMinute,
    rpmLimit: 15,
    tokensLastMinute,
    tpmLimit: 1000000,
    quota429Count,
    error503Count,
    quotaCooldownActive: inCooldown,
    cooldownRemainingSeconds: Math.ceil(getGeminiQuotaCooldownRemainingMs() / 1000),
    modelCounts: modelUsageCounts,
    recentCalls: geminiCallHistory.slice(0, 35),
    status,
  });
});

// POST /api/telemetry/test-gemini - Live test ping endpoint for Gemini AI
telemetryRouter.post("/telemetry/test-gemini", async (_req, res) => {
  const ai = getGenAI();
  if (!ai) {
    return res.status(500).json({
      success: false,
      message: "Client Gemini non configurato (GEMINI_API_KEY non trovata nell'ambiente server)",
    });
  }

  const start = Date.now();
  try {
    let succeeded = false;
    let usedModel = "";
    let lastErr: any = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: "Rispondi solo con la parola 'OK'.",
        });
        if (response && response.text) {
          succeeded = true;
          usedModel = model;
          resetGeminiQuotaCooldown();
          break;
        }
      } catch (err: any) {
        lastErr = err;
        const isQuota = err?.status === "RESOURCE_EXHAUSTED" || err?.message?.includes("quota") || err?.message?.includes("429");
        if (isQuota) {
          triggerGeminiQuotaCooldown(60000);
          break; // Project-wide quota reached, avoid hammering other candidate models
        }
      }
    }

    const latencyMs = Date.now() - start;
    if (succeeded) {
      recordGeminiCall({
        endpoint: "/api/telemetry/test-gemini",
        model: usedModel,
        latencyMs,
        status: "success",
        statusCode: 200,
      });
      return res.json({
        success: true,
        modelUsed: usedModel,
        latencyMs,
        message: `Test eseguito con successo con ${usedModel} (${latencyMs}ms)`,
      });
    } else {
      const isQuota = lastErr?.status === "RESOURCE_EXHAUSTED" || lastErr?.message?.includes("quota") || lastErr?.message?.includes("429");
      recordGeminiCall({
        endpoint: "/api/telemetry/test-gemini",
        model: CANDIDATE_MODELS[0],
        latencyMs,
        status: isQuota ? "quota_exceeded" : "error",
        statusCode: isQuota ? 429 : 500,
        errorMessage: lastErr?.message,
      });
      return res.status(isQuota ? 429 : 500).json({
        success: false,
        isQuota,
        latencyMs,
        message: isQuota
          ? "Quota / Rate-Limit Gemini Esaurito (429 RESOURCE_EXHAUSTED)"
          : `Errore chiamata Gemini: ${lastErr?.message || "Fallito"}`,
      });
    }
  } catch (outerErr: any) {
    return res.status(500).json({
      success: false,
      message: outerErr?.message || "Errore sconosciuto",
    });
  }
});

// POST /api/diagnostics/analyze-log - AI Diagnostic Engine with Local Fallback
telemetryRouter.post("/diagnostics/analyze-log", async (req, res) => {
  const { logMessage = "", category = "SYSTEM", level = "error", details = null, context = {} } = req.body;
  const start = Date.now();

  const lowerMsg = String(logMessage || "").toLowerCase();
  const lowerCat = String(category || "").toLowerCase();
  const isQuotaRelated = lowerMsg.includes("quota") || lowerMsg.includes("429") || lowerMsg.includes("resource_exhausted") || lowerMsg.includes("esaurita");
  const isTimeoutRelated = lowerMsg.includes("timed out") || lowerMsg.includes("timeout") || lowerMsg.includes("latenza");
  const isNetworkOffline = lowerMsg.includes("offline") || lowerMsg.includes("network") || lowerMsg.includes("abort");

  const buildHeuristicResponse = () => {
    if (isQuotaRelated) {
      return {
        explanation: "La quota gratuita giornaliera Firestore o Gemini ha raggiunto la soglia limite temporanea. I dati locali non sono compromessi.",
        severity: "medium",
        dataSafetyNote: "I dati creati rimangono memorizzati nella cache locale (IndexedDB) e nel file di backup server.",
        suggestedActions: [
          {
            id: "FORCE_SERVER_BACKUP",
            label: "Salva su Backup Server",
            description: "Crea una copia di sicurezza immediata sul file system del server Express",
            isPrimary: true,
            risk: "safe",
          },
          {
            id: "RESET_OFFLINE_LOCK",
            label: "Azzera Blocco Locale & Riconnetti",
            description: "Cancella il flag locale di blocco e invia un nuovo ping di verifica",
            isPrimary: false,
            risk: "safe",
          },
          {
            id: "EXPORT_EMERGENCY_JSON",
            label: "Esporta Snapshot JSON",
            description: "Scarica subito un backup di emergenza sul tuo dispositivo",
            isPrimary: false,
            risk: "safe",
          },
        ],
        source: "heuristic",
      };
    }

    if (isTimeoutRelated || isNetworkOffline) {
      return {
        explanation: "Si è verificato un rallentamento o un'interruzione momentanea della connessione di rete con i servizi cloud.",
        severity: "low",
        dataSafetyNote: "Nessun dato è andato perso: la memoria locale conserva l'intero stato del Vault.",
        suggestedActions: [
          {
            id: "TEST_CONNECTIVITY",
            label: "Verifica Connettività Live",
            description: "Esegue un test di ping sia verso Google Gemini che verso Firestore",
            isPrimary: true,
            risk: "safe",
          },
          {
            id: "RESET_OFFLINE_LOCK",
            label: "Ripristina Rete Cloud",
            description: "Forza la riattivazione della scheda di rete Firestore disabilitata",
            isPrimary: false,
            risk: "safe",
          },
        ],
        source: "heuristic",
      };
    }

    if (lowerCat.includes("okf") || lowerCat.includes("capture") || lowerMsg.includes("schema") || lowerMsg.includes("parsing")) {
      return {
        explanation: "L'elaborazione del documento o file multimediale ha incontrato una discrepanza di formattazione o limite di contesto.",
        severity: "medium",
        dataSafetyNote: "Il file originale o il testo grezzo è preservato nello Staging Buffer dei Raw Files.",
        suggestedActions: [
          {
            id: "SWITCH_LOCAL_HEURISTIC",
            label: "Converti con Estrattore Euristico",
            description: "Estrae metadati OKF v0.2 istantaneamente a regole fisse a latenza zero",
            isPrimary: true,
            risk: "safe",
          },
          {
            id: "EXPORT_EMERGENCY_JSON",
            label: "Esporta Copia JSON",
            description: "Salva i dati grezzi su file JSON scaricabile",
            isPrimary: false,
            risk: "safe",
          },
        ],
        source: "heuristic",
      };
    }

    return {
      explanation: "Rilevato evento diagnostico nel sistema. L'infrastruttura sta operando regolarmente con persistenza attiva.",
      severity: "low",
      dataSafetyNote: "Il Vault è protetto con sincronizzazione a tre livelli (Firestore, Server, IndexedDB).",
      suggestedActions: [
        {
          id: "TEST_CONNECTIVITY",
          label: "Esegui Diagnostica Generale",
          description: "Controlla lo stato delle API di backend e del database",
          isPrimary: true,
          risk: "safe",
        },
        {
          id: "CLEAR_TRANSIENT_ERRORS",
          label: "Archivia Avvisi Transitori",
          description: "Pulisce gli avvisi superati dalla console di log",
          isPrimary: false,
          risk: "safe",
        },
      ],
      source: "heuristic",
    };
  };

  const ai = getGenAI();
  if (!ai || context.isQuotaExceeded || isQuotaRelated) {
    return res.json(buildHeuristicResponse());
  }

  try {
    const diagnosticSchema = {
      type: Type.OBJECT,
      properties: {
        explanation: {
          type: Type.STRING,
          description: "Spiegazione sintetica in massimo 2 frasi in italiano comprensibile e orientato all'utente",
        },
        severity: {
          type: Type.STRING,
          description: "low, medium, high, o critical",
        },
        dataSafetyNote: {
          type: Type.STRING,
          description: "Breve frase sulla sicurezza dei dati (es. 'I tuoi dati locali su IndexedDB e backup server sono intatti')",
        },
        suggestedActions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: {
                type: Type.STRING,
                description: "Uno tra: RESET_OFFLINE_LOCK, FORCE_SERVER_BACKUP, TEST_CONNECTIVITY, SWITCH_LOCAL_HEURISTIC, EXPORT_EMERGENCY_JSON, CLEAR_TRANSIENT_ERRORS",
              },
              label: {
                type: Type.STRING,
                description: "Titolo breve del pulsante (es. 'Azzera Blocco Quota')",
              },
              description: {
                type: Type.STRING,
                description: "Descrizione di cosa farà questa azione",
              },
              isPrimary: {
                type: Type.BOOLEAN,
                description: "true se è l'azione principale consigliata",
              },
              risk: {
                type: Type.STRING,
                description: "safe oppure warning",
              },
            },
            required: ["id", "label", "description", "risk"],
          },
        },
      },
      required: ["explanation", "severity", "dataSafetyNote", "suggestedActions"],
    };

    const prompt = `Sei l'assistente diagnostico intelligente di Knowledge Vault.
Analizza questo evento di log diagnostico e genera una diagnosi chiara e 1-3 azioni operative concrete.

MESSAGGIO LOG: "${logMessage}"
CATEGORIA: ${category}
LIVELLO: ${level}
DETTAGLI: ${details ? JSON.stringify(details).slice(0, 500) : "N/A"}
STATO SISTEMA: ${JSON.stringify(context)}

CATALOGO AZIONI DISPONIBILI (Usa ESCLUSIVAMENTE questi ID):
- RESET_OFFLINE_LOCK: Sblocca il blocco locale di Firestore e riattiva la connessione.
- FORCE_SERVER_BACKUP: Forza il salvataggio immediato sul file system del server Express (/api/vault/backup).
- TEST_CONNECTIVITY: Esegue un ping diagnostico in tempo reale verso Firestore e Gemini.
- SWITCH_LOCAL_HEURISTIC: Usa il parser euristico locale a regole (0ms, 0 token) senza chiamare le API AI.
- EXPORT_EMERGENCY_JSON: Scarica istantaneamente uno snapshot JSON locale sul dispositivo dell'utente.
- CLEAR_TRANSIENT_ERRORS: Pulisce i log temporanei non bloccanti.

Restituisci un JSON rigoroso conforme allo schema.`;

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout diagnosi")), 12000));

    let succeeded = false;
    let resultJson: any = null;
    let usedModel = "";

    for (const model of CANDIDATE_MODELS) {
      try {
        const config: any = {
          responseMimeType: "application/json",
          responseSchema: diagnosticSchema,
          maxOutputTokens: 600,
        };
        if (model.startsWith("gemini-3")) {
          config.thinkingConfig = { thinkingBudget: 0 };
        }

        const geminiCall = ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });

        const response: any = await Promise.race([geminiCall, timeoutPromise]);
        const text = response?.text;
        if (text) {
          resultJson = JSON.parse(text);
          usedModel = model;
          succeeded = true;
          break;
        }
      } catch {
        // Try next fallback model
      }
    }

    if (succeeded && resultJson) {
      const latencyMs = Date.now() - start;
      recordGeminiCall({
        endpoint: "/api/diagnostics/analyze-log",
        model: usedModel,
        latencyMs,
        status: "success",
        statusCode: 200,
      });

      return res.json({
        ...resultJson,
        source: "gemini",
        modelUsed: usedModel,
        latencyMs,
      });
    }
  } catch {
    // Non-fatal: handled smoothly via heuristic fallback
  }

  return res.json(buildHeuristicResponse());
});
