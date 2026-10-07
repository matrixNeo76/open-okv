import { Router } from "express";
import { Type } from "@google/genai";
import {
  generateWithGeminiFallback,
  generateMultimodalWithGeminiFallback,
  transcribeAudioWithGemini,
} from "../gemini/client";
import { extractTextFromPdfBuffer } from "../services/pdfExtractor";
import {
  fetchOpenGraphMetadata,
  fetchArticleTextFromUrl,
  OpenGraphData,
  sanitizeUrl,
  isGenericTitle,
  extractTitleFromUrlSlug,
} from "../services/openGraphService";
import { fallbackParse } from "../services/heuristicParser";
import {
  performSearchGroundedSynthesis,
  GroundedSearchResult,
} from "../services/searchGroundingService";
import {
  transcribeAudioWithFilesApi,
  withTransientGeminiFile,
} from "../services/filesAdapter";
import { scanGitHubRepositoryOKF } from "../services/githubOkfService";
import { extractMlTagsLocally, normalizeTag, RawTagSuggestion } from "../services/tagMlService";
import { executePreFlightCheck, resolveDocType } from "../services/deterministicGates";
import { scrubMcpConfig } from "../services/mcpSecretScrubber";
import { generateProvenanceRecord } from "../services/provenanceHelper";
import { executeCekikjIngestionGate } from "../services/cekikjIngestionGate";
import { processAcademicPaperPipeline } from "../services/specializedPipelines";
import { parseJupyterNotebookBuffer, parseJupyterNotebookString } from "../services/ipynbParser";
import { parseVaultZipArchive } from "../services/batchMigrationService";
import { fetchFeedData, discoverRssFeedUrl } from "../services/rssService";

export const captureRouter = Router();

// GET /api/fetch-opengraph - Fetch Open Graph and Website preview metadata
captureRouter.get("/fetch-opengraph", async (req, res) => {
  try {
    const targetUrl = (req.query.url as string) || "";
    if (!targetUrl || targetUrl.trim().length === 0) {
      return res.status(400).json({ error: "URL parameter is required" });
    }
    const ogData = await fetchOpenGraphMetadata(targetUrl);
    res.json({ success: true, metadata: ogData });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch Open Graph metadata" });
  }
});

// POST /api/fetch-opengraph
captureRouter.post("/fetch-opengraph", async (req, res) => {
  try {
    const { url: targetUrl } = req.body;
    if (!targetUrl || typeof targetUrl !== "string" || targetUrl.trim().length === 0) {
      return res.status(400).json({ error: "URL is required in body" });
    }
    const ogData = await fetchOpenGraphMetadata(targetUrl);
    res.json({ success: true, metadata: ogData });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch Open Graph metadata" });
  }
});

// POST /api/refactor-document - Deeply analyzes raw or poorly written documents, enhances them into OKF v0.2, and prepares comparison data
captureRouter.post("/refactor-document", async (req, res) => {
  try {
    const {
      fileName = "documento-bozza",
      mimeType = "text/plain",
      fileType = "document",
      textContent = "",
      base64Data = "",
      notes = "",
      userInstructions = "",
      existingResources = [],
      preferredModel = "gemini-3.7-flash"
    } = req.body;

    const cleanBase64 = base64Data ? base64Data.replace(/^data:[^;]+;base64,/, "") : "";
    const lowerName = (fileName || "").toLowerCase();
    const isPdf = lowerName.endsWith(".pdf") || (mimeType && mimeType.toLowerCase().includes("pdf"));
    const isImage = (mimeType && mimeType.toLowerCase().startsWith("image/")) || ["png", "jpg", "jpeg", "webp"].some(ext => lowerName.endsWith("." + ext));

    let originalText = textContent || "";

    // If PDF, extract text with pdfExtractor
    if (!originalText && isPdf && cleanBase64) {
      try {
        const pdfBuf = Buffer.from(cleanBase64, "base64");
        originalText = await extractTextFromPdfBuffer(pdfBuf);
      } catch (pdfErr: any) {
        console.warn("[refactor-document] PDF extraction error:", pdfErr?.message);
      }
    }

    // If text file in base64
    if (!originalText && cleanBase64 && !isImage && !isPdf) {
      try {
        const decoded = Buffer.from(cleanBase64, "base64").toString("utf-8");
        if (/^[\x20-\x7E\s\u00A0-\uFFFF]*$/.test(decoded.slice(0, 500))) {
          originalText = decoded;
        }
      } catch {
        // fallback
      }
    }

    // If empty, fallback to notes
    if (!originalText.trim()) {
      originalText = notes || `Documento caricato: ${fileName}`;
    }

    const contextList = (existingResources as any[]).slice(0, 30).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      tags: r.tags || [],
    }));

    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        domain: { type: Type.STRING },
        docType: { type: Type.STRING },
        readabilityBefore: { type: Type.INTEGER },
        readabilityAfter: { type: Type.INTEGER },
        improvementsApplied: { type: Type.ARRAY, items: { type: Type.STRING } },
        keyDifferencesSummary: { type: Type.STRING },
        markdownContent: { type: Type.STRING },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["name", "type"],
          },
        },
        relations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetTitle: { type: Type.STRING },
              relationType: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ["targetTitle", "relationType"],
          },
        },
      },
      required: [
        "title",
        "summary",
        "tags",
        "domain",
        "docType",
        "readabilityBefore",
        "readabilityAfter",
        "improvementsApplied",
        "keyDifferencesSummary",
        "markdownContent",
      ],
    };

    const systemPrompt = `Sei l'Architetto Epistemico del Knowledge Vault e il motore di Refactoring Documentale (Standard OKF v0.2).
Il tuo compito è prendere una bozza grezza o documento mal scritto, comprenderlo a fondo in ogni dettaglio e rielaborarlo ad altissimo livello qualitativo.

PRINCIPI INDEROGABILI:
1. PRESERVAZIONE DEI FATTI (ZERO-GUESSING):
   Non perdere o alterare alcuna informazione, formula, parametro tecnico, URL, nome o dato presente nel testo originale. Non inventare dati inesistenti.
2. RIELABORAZIONE STRUTTURALE & CHIAREZZA ESPOSITIVA:
   - Riscrivi il documento eliminando ripetizioni, ambiguità grammaticali e disorganizzazione.
   - Crea un'intestazione con Frontmatter YAML OKF v0.2 valido (okf_version: "0.2", title, type: "knowledge", domain, tags, entities, relations).
   - Inserisci un Titolo chiaro e professionale (# Titolo).
   - Inserisci un Sommario Esecutivo (> Sommario...) e Takeaways chiave con elenchi puntati.
   - Struttura il testo in paragrafi logici con sottotitoli (## Sezione, ### Sottosezione).
   - Converti elenchi o passaggi sequenziali in liste ordinate o checklist.
   - Se ci sono snippet di codice, formattali con blocchi \`\`\`linguaggio.
   - Se ci sono confronti o dati tabellari, usa tabelle markdown.
3. ONTOLOGIA E GRAFO:
   - Estrai le entità tecnologiche/concettuali rilevate.
   - Definisci relazioni sensate con le risorse già presenti nel Vault:
     ${JSON.stringify(contextList)}
4. AUDIT DELLA RIELABORAZIONE:
   - Valuta la leggibilità/chiarezza del testo originale: 'readabilityBefore' (0-100).
   - Valuta la leggibilità della versione rielaborata: 'readabilityAfter' (tipicamente 88-98).
   - 'improvementsApplied': elenco di 3-6 migliorie concrete apportate (es. 'Riorganizzata struttura gerarchica in 5 sezioni tematiche', 'Formalizzato YAML frontmatter OKF v0.2', 'Estraibili 4 relazioni topologiche con il grafo', 'Corretta sintassi e formattati snippet di configurazione').
   - 'keyDifferencesSummary': spiegazione concisa (2-3 frasi) delle differenze chiave per l'utente.`;

    const userPrompt = `File Originale: "${fileName}"
${userInstructions ? `Istruzioni dell'utente: ${userInstructions}\n` : ""}

TESTO ORIGINALE DA RIELABORARE:
"""
${originalText.slice(0, 45000)}
"""`;

    let parsed: any = null;

    try {
      const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
      const generated = await generateWithGeminiFallback(fullPrompt, schema, {
        timeoutMs: 40000,
        endpoint: "/api/refactor-document",
        preferredModel: preferredModel || "gemini-3.7-flash"
      });

      if (generated?.text) {
        parsed = JSON.parse(generated.text);
      }
    } catch (aiErr: any) {
      console.warn("[refactor-document] Errore chiamata AI Gemini:", aiErr?.message);
    }

    // Heuristic fallback if AI was unavailable
    if (!parsed || !parsed.markdownContent) {
      console.warn("[refactor-document] Attivazione fallback euristico locale...");
      const cleanTitle = fileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ") || "Documento Rielaborato";
      const words = originalText.split(/\s+/).filter(Boolean).length;
      
      parsed = {
        title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
        summary: `Documento rielaborato e strutturato nello standard OKF v0.2. Contiene ${words} parole della fonte originale organizzate per la consultazione e il grafo di conoscenza.`,
        tags: ["documento-rielaborato", "okf-v0.2", "knowledge"],
        domain: "Document & Knowledge Engineering",
        docType: "specification",
        readabilityBefore: 40,
        readabilityAfter: 85,
        improvementsApplied: [
          "Preservato testo originale con audit trail completo",
          "Generata intestazione e frontmatter compatibile OKF v0.2",
          "Normalizzata la struttura dei paragrafi e la formattazione markdown"
        ],
        keyDifferencesSummary: "Il documento originale è stato preservato integralmente e arricchito con la struttura formale OKF v0.2.",
        markdownContent: `---\nokf_version: "0.2"\ntitle: "${cleanTitle}"\ntype: "knowledge"\ndomain: "Knowledge Engineering"\nstatus: "stable"\nscore: 85\ntags: ["documento-rielaborato", "okf-v0.2"]\n---\n\n# ${cleanTitle}\n\n> **SOMMARIO ESECUTIVO**\n> Documento acquisito e normalizzato per l'integrazione nel Knowledge Vault.\n\n## 1. Contenuto Rielaborato\n\n${originalText}\n`,
        entities: [],
        relations: []
      };
    }

    const readabilityBefore = typeof parsed.readabilityBefore === "number" ? parsed.readabilityBefore : 45;
    const readabilityAfter = typeof parsed.readabilityAfter === "number" ? parsed.readabilityAfter : 92;
    const delta = readabilityAfter - readabilityBefore;

    const refactoringAudit: any = {
      originalCharCount: originalText.length,
      enhancedCharCount: parsed.markdownContent.length,
      originalWordCount: originalText.split(/\s+/).filter(Boolean).length,
      enhancedWordCount: parsed.markdownContent.split(/\s+/).filter(Boolean).length,
      readabilityBefore,
      readabilityAfter,
      readabilityDelta: delta,
      improvementsApplied: parsed.improvementsApplied || [],
      keyDifferencesSummary: parsed.keyDifferencesSummary || "Documento rielaborato secondo lo standard OKF v0.2.",
      refactoredAt: new Date().toISOString(),
      modelUsed: preferredModel || "gemini-3.7-flash"
    };

    return res.json({
      success: true,
      fileName,
      originalContent: originalText,
      resource: {
        type: "knowledge",
        title: parsed.title,
        summary: parsed.summary,
        tags: Array.from(new Set([...(parsed.tags || []), "refactored-doc", "okf-v0.2"])),
        metadata: {
          okfVersion: "0.2",
          domain: parsed.domain || "Knowledge Architecture",
          docType: parsed.docType || "specification",
          score: readabilityAfter,
          markdownContent: parsed.markdownContent,
          rawSourceDocument: originalText,
          isRefactored: true,
          refactoringAudit,
          entities: parsed.entities || [],
          relations: parsed.relations || []
        }
      }
    });

  } catch (err: any) {
    console.error("[refactor-document] Errore fatale:", err);
    return res.status(500).json({ success: false, error: err?.message || "Errore elaborazione refactoring documento" });
  }
});

// POST /api/convert-file-to-okf - Convert Staged / Raw File into full OKF v0.2 Resource
captureRouter.post("/convert-file-to-okf", async (req, res) => {
  const routeStartTime = Date.now();
  try {
    const { 
      fileName = "file", 
      mimeType = "application/octet-stream", 
      fileType = "document", 
      explicitType = "",
      textContent = "", 
      base64Data = "",
      base64 = "",
      notes = "",
      existingResources = [],
      preferredModel = "auto"
    } = req.body;

    const contextList = (existingResources as any[]).slice(0, 30).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      tags: r.tags || [],
    }));

    const cleanFileName = fileName.replace(/[\\/:"*?<>|]/g, "_");
    const inferredTitle = cleanFileName.replace(/\.[^/.]+$/, "");
    const lowerName = fileName.toLowerCase();

    const isAudio = (mimeType && mimeType.toLowerCase().startsWith("audio/")) ||
      ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm", "wma", "aiff"].some((ext) => lowerName.endsWith("." + ext)) ||
      fileType?.toLowerCase() === "audio";

    const isPdf = lowerName.endsWith(".pdf") || (mimeType && mimeType.toLowerCase().includes("pdf")) || fileType?.toLowerCase() === "pdf" || fileType?.toLowerCase() === "paper";
    const isImage = (mimeType && mimeType.toLowerCase().startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].some((ext) => lowerName.endsWith("." + ext));
    const isJupyter = lowerName.endsWith(".ipynb") || fileType?.toLowerCase() === "ipynb" || (mimeType && mimeType.includes("ipynb"));
    const isZip = lowerName.endsWith(".zip") || (mimeType && mimeType.includes("zip")) || fileType?.toLowerCase() === "zip";

    const resolvedMime = mimeType && mimeType !== "application/octet-stream"
      ? mimeType
      : (lowerName.endsWith(".png") ? "image/png"
      : lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") ? "image/jpeg"
      : lowerName.endsWith(".webp") ? "image/webp"
      : lowerName.endsWith(".gif") ? "image/gif"
      : lowerName.endsWith(".svg") ? "image/svg+xml"
      : lowerName.endsWith(".pdf") ? "application/pdf"
      : mimeType || "application/octet-stream");

    const isTroubleshoot = explicitType === "troubleshooting" || 
      lowerName.includes("troubleshoot") || 
      lowerName.includes("fix") || 
      lowerName.includes("error") || 
      lowerName.includes("errore") || 
      lowerName.includes("bug") || 
      lowerName.includes("crash") || 
      lowerName.includes("diagnost") ||
      notes.toLowerCase().includes("troubleshoot") ||
      notes.toLowerCase().includes("errore") ||
      notes.toLowerCase().includes("soluzione");

    const isProcedure = explicitType === "procedure" || 
      lowerName.includes("procedur") || 
      lowerName.includes("playbook") || 
      lowerName.includes("manutenzion") || 
      lowerName.includes("onboarding") || 
      lowerName.includes("runbook") || 
      lowerName.includes("sop") ||
      notes.toLowerCase().includes("procedur") || 
      notes.toLowerCase().includes("playbook") || 
      notes.toLowerCase().includes("manutenzion") || 
      notes.toLowerCase().includes("assistenza");

    let cleanBase64 = "";
    let rawB64 = base64Data || base64 || "";
    if (!rawB64 && typeof textContent === "string" && (textContent.startsWith("data:") || textContent.startsWith("JVBERi0") || textContent.startsWith("SUQz") || textContent.startsWith("UklGR") || textContent.startsWith("//+MYx"))) {
      rawB64 = textContent;
    }

    if (rawB64) {
      const dataPart = rawB64.includes(",") ? rawB64.split(",")[1] : rawB64;
      cleanBase64 = dataPart.replace(/[^A-Za-z0-9+/=]/g, "");
      while (cleanBase64.length % 4 !== 0) {
        cleanBase64 += "=";
      }
    }

    // -------------------------------------------------------------
    // DETERMINISTIC BATCH VAULT MIGRATION PIPELINE (OBSIDIAN / NOTION / MARKDOWN ZIP)
    // -------------------------------------------------------------
    if (isZip && cleanBase64 && cleanBase64.length > 20) {
      try {
        const zipBuffer = Buffer.from(cleanBase64, "base64");
        console.log(`[Batch Ingestion] Unpacking ZIP vault archive "${fileName}"...`);
        const migrationResult = parseVaultZipArchive(zipBuffer, fileName);
        if (migrationResult.success && migrationResult.items.length > 0) {
          return res.json({
            success: true,
            source: "batch_migration_engine",
            pipeline: "zip_vault_migration",
            batch: true,
            totalFilesProcessed: migrationResult.totalFilesProcessed,
            markdownCount: migrationResult.markdownCount,
            wikilinksResolvedCount: migrationResult.wikilinksResolvedCount,
            items: migrationResult.items,
            resource: migrationResult.items[0],
          });
        } else {
          return res.status(400).json({
            success: false,
            error: migrationResult.error || "Impossibile trovare file Markdown (.md) validi nell'archivio ZIP.",
          });
        }
      } catch (zipErr: any) {
        console.warn("[convert-file-to-okf] ZIP batch migration error:", zipErr?.message);
      }
    }

    // -------------------------------------------------------------
    // DETERMINISTIC PRE-FLIGHT GATE & SPECIALIZED ACADEMIC PAPER PIPELINE
    // (Only executed if explicitly requested or strictly an academic paper, NOT troubleshooting)
    // -------------------------------------------------------------
    const isStrictAcademicPaper = !isTroubleshoot && (explicitType === "paper" || fileType === "paper" || lowerName.includes("arxiv") || lowerName.includes("paper"));
    if (isPdf && cleanBase64 && cleanBase64.length > 20 && isStrictAcademicPaper) {
      try {
        const pdfBuffer = Buffer.from(cleanBase64, "base64");
        const existingShaList = (existingResources as any[])
          .filter((r) => r.metadata?.sha256)
          .map((r) => ({ id: r.id, sha256: r.metadata.sha256 }));

        const preFlight = executePreFlightCheck(pdfBuffer, "application/pdf", fileName, existingShaList);

        if (!preFlight.valid && !preFlight.isDuplicate) {
          return res.status(400).json({
            success: false,
            error: preFlight.rejectionReason || "File non valido per l'ingestione.",
          });
        }

        console.log(`[Specialized Ingestion] Executing Academic Paper Pipeline for "${fileName}" (SHA-256: ${preFlight.sha256.slice(0, 8)}...)`);
        const paperResult = await processAcademicPaperPipeline(pdfBuffer, preFlight, {
          existingResources: existingResources as any[],
          filename: fileName,
          notes,
        });

        if (paperResult.success && paperResult.resource) {
          return res.json({
            success: true,
            source: "specialized_academic_paper_pipeline",
            pipeline: "academic_paper",
            preFlight: paperResult.preFlight,
            cekikjEvaluation: paperResult.cekikjGate,
            resource: paperResult.resource,
          });
        }
      } catch (paperPipelineErr: any) {
        console.warn("[convert-file-to-okf] Academic paper pipeline error, falling back to standard pipeline:", paperPipelineErr?.message);
      }
    }

    const schema = {
      type: Type.OBJECT,
      properties: {
        type: { 
          type: Type.STRING,
          description: "Canonical Resource Type: 'troubleshooting' for bug/error/crash screenshots or logs; 'procedure' for SOP, playbooks, maintenance checklists, runbooks; 'knowledge' for diagrams, code snippets, specs, architectures; 'ai_skill' for prompts/agent skills; 'article' for guides/articles; 'mcp_server' for MCP tools; 'paper' for papers."
        },
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        domain: { type: Type.STRING },
        docType: { type: Type.STRING },
        procedureType: { type: Type.STRING },
        targetSystem: { type: Type.STRING },
        estimatedDuration: { type: Type.STRING },
        riskLevel: { type: Type.STRING },
        requiredTools: { type: Type.ARRAY, items: { type: Type.STRING } },
        safetyWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        prerequisites: { type: Type.ARRAY, items: { type: Type.STRING } },
        stepsCount: { type: Type.NUMBER },
        rollbackPlan: { type: Type.STRING },
        affectedSystem: { type: Type.STRING },
        rootCause: { type: Type.STRING },
        problemDescription: { type: Type.STRING },
        errorLog: { type: Type.STRING },
        attemptedFixes: { type: Type.ARRAY, items: { type: Type.STRING } },
        solutionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["name", "type"],
          },
        },
        relations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetId: { type: Type.STRING },
              targetTitle: { type: Type.STRING },
              relationType: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ["targetTitle", "relationType"],
          },
        },
        markdownContent: { type: Type.STRING },
      },
      required: ["title", "summary", "tags", "markdownContent", "entities", "relations"],
    };

    let parsed: any = null;
    let audioTranscript = "";

    // -------------------------------------------------------------
    // PATH A: AUDIO PROCESSING
    // -------------------------------------------------------------
    if (isAudio) {
      let resolvedAudioMime = "audio/mp3";
      if (lowerName.endsWith(".wav") || (mimeType && mimeType.includes("wav"))) {
        resolvedAudioMime = "audio/wav";
      } else if (lowerName.endsWith(".ogg") || (mimeType && mimeType.includes("ogg"))) {
        resolvedAudioMime = "audio/ogg";
      } else if (lowerName.endsWith(".m4a") || (mimeType && (mimeType.includes("m4a") || mimeType.includes("mp4")))) {
        resolvedAudioMime = "audio/mp4";
      } else if (lowerName.endsWith(".aac") || (mimeType && mimeType.includes("aac"))) {
        resolvedAudioMime = "audio/aac";
      } else if (lowerName.endsWith(".flac") || (mimeType && mimeType.includes("flac"))) {
        resolvedAudioMime = "audio/flac";
      } else if (lowerName.endsWith(".webm") || (mimeType && mimeType.includes("webm"))) {
        resolvedAudioMime = "audio/webm";
      } else if (lowerName.endsWith(".mp3") || (mimeType && (mimeType.includes("mp3") || mimeType.includes("mpeg")))) {
        resolvedAudioMime = "audio/mp3";
      }

      console.log(`[Audio Processing] Ingesting audio file "${fileName}" (MIME: ${resolvedAudioMime}, Base64 Length: ${cleanBase64.length})`);

      if (cleanBase64 && cleanBase64.length > 50) {
        // For large audio files (>4MB base64), prioritize transient Files API upload
        if (cleanBase64.length > 4 * 1024 * 1024) {
          try {
            console.log(`[Audio Processing] Large audio detected (>4MB). Using transient Gemini Files API adapter...`);
            const audioBuffer = Buffer.from(cleanBase64, "base64");
            audioTranscript = await transcribeAudioWithFilesApi(audioBuffer, resolvedAudioMime, fileName);
          } catch (filesApiErr: any) {
            console.warn("[Audio Processing] Files API transcription failed, trying inline:", filesApiErr?.message);
          }
        }

        // Standard inline transcription if not yet transcribed
        if (!audioTranscript) {
          audioTranscript = await transcribeAudioWithGemini(cleanBase64, resolvedAudioMime, fileName);
        }

        // Secondary fallback to Files API if inline transcription was empty
        if (!audioTranscript && cleanBase64.length > 10000) {
          try {
            const audioBuffer = Buffer.from(cleanBase64, "base64");
            audioTranscript = await transcribeAudioWithFilesApi(audioBuffer, resolvedAudioMime, fileName);
          } catch (secondErr: any) {
            console.warn("[Audio Processing] Secondary Files API transcription failed:", secondErr?.message);
          }
        }
      }

      const audioPromptText = `You are a Principal Ontologist, Audio Analyst, and Senior Technical Author.
An audio file ("${fileName}", format: ${fileType}, mime: ${resolvedAudioMime}) has been acquired into the Knowledge Vault.

${audioTranscript ? `Spoken Audio Transcript:\n"""\n${audioTranscript.slice(0, 35000)}\n"""` : `User Notes & Description:\n"""${notes || "Traccia audio acquisita nel buffer."}"""`}

${notes ? `User annotations:\n"""${notes}"""` : ""}

Existing resources in the user's Vault for topological cross-linking:
${JSON.stringify(contextList, null, 2)}

Strict OKF v0.2 Rules for Audio Processing & Understanding:
1. 'title': Clear, descriptive title summarizing the primary topic, interview, discussion, lecture, or meeting in the audio.
2. 'summary': Dense, 2-4 sentence executive summary in Italian explaining what is discussed in the audio, key decisions, and takeaways.
3. 'tags': 4 to 8 relevant lowercase technical tags based on the spoken content.
4. 'domain': E.g. "AI Systems & Inference", "Cloud Architecture", "Audio Analysis & Speech", "Engineering & Systems".
5. 'docType': "concept" | "specification" | "architecture" | "guide".
6. 'entities': Array of 4 to 10 canonical entities { name: string, type: string, description: string }.
7. 'relations': Array of weighted relations to existing vault items { targetTitle: string, relationType: 'references' | 'implements' | 'governs' | 'integrates' | 'extends', weight: number (0.5 to 1.0), description: string }.
8. 'markdownContent': An extensive, multi-section Markdown document (AT LEAST 400-900 words) starting with YAML frontmatter.

Return pure JSON strictly matching the schema.`;

      try {
        if (audioTranscript && audioTranscript.length > 10) {
          const generated = await generateWithGeminiFallback(audioPromptText, schema, 40000);
          if (generated?.text) {
            parsed = JSON.parse(generated.text);
          }
        } else if (cleanBase64 && cleanBase64.length > 50 && cleanBase64.length < 10 * 1024 * 1024) {
          const multimodalContents = [
            { text: audioPromptText },
            {
              inlineData: {
                mimeType: resolvedAudioMime,
                data: cleanBase64,
              },
            },
          ];
          const generated = await generateMultimodalWithGeminiFallback(multimodalContents, schema, 45000);
          if (generated?.text) {
            parsed = JSON.parse(generated.text);
          }
        }
      } catch (err: any) {
        console.warn("AI generation failed for audio convert-file-to-okf:", err?.message);
      }

      if (parsed && parsed.title && parsed.markdownContent) {
        return res.json({
          success: true,
          source: "gemini",
          resource: {
            type: "knowledge",
            title: parsed.title,
            summary: parsed.summary,
            tags: Array.from(new Set([...(parsed.tags || []), "audio", "transcript", "okf-v0.2"])),
            metadata: {
              okfVersion: "0.2",
              domain: parsed.domain || "Audio & Media Systems",
              docType: parsed.docType || "specification",
              mediaType: "audio",
              audioTranscript: audioTranscript || undefined,
              entities: parsed.entities || [],
              relations: parsed.relations || [],
              markdownContent: parsed.markdownContent,
              sourceFileName: fileName,
              sourceFileType: "audio",
            },
          },
        });
      }

      const displayTranscript = audioTranscript || notes || `Traccia audio acquisita dal file ${fileName}`;
      const audioFallbackDoc = `---
okf_version: "0.2"
title: "${inferredTitle}"
type: "specification"
domain: "Audio & Media Systems"
tags: ["audio", "transcript", "okf-v0.2"]
created_at: "${new Date().toISOString()}"
entities:
  - name: "${inferredTitle}"
    type: "concept"
    description: "Traccia audio acquisita da ${fileName}"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "references"
    weight: 0.85
---

# ${inferredTitle}

> **Specifiche e trascrizione generate da traccia audio (\`${fileName}\`)**

---

## 1. Panoramica Esecutiva
Documento sonoro acquisito nel Knowledge Vault per archiviazione e consultazione semantica.

---

## 2. Dettagli Traccia
- **File sorgente**: \`${fileName}\`
- **Formato**: \`${resolvedAudioMime}\`
- **Stato trascrizione**: ${audioTranscript ? "Trascritto con successo" : "In attesa di trascrizione"}

---

## 3. Trascrizione Integrale dell'Audio
${displayTranscript}

---

## 4. Ontologia e Grafo
Questa risorsa è mappata per il collegamento con concetti ed entità del Vault.
`;

      return res.json({
        success: true,
        source: "fallback",
        resource: {
          type: "knowledge",
          title: inferredTitle,
          summary: `Traccia audio acquisita da ${fileName}. ${audioTranscript ? "Include trascrizione completa del parlato." : "Archiviata nel Knowledge Vault."}`,
          tags: ["audio", "transcript", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: "Audio & Media Systems",
            docType: "specification",
            mediaType: "audio",
            audioTranscript: audioTranscript || undefined,
            markdownContent: audioFallbackDoc,
            sourceFileName: fileName,
            sourceFileType: "audio",
            entities: [{ name: inferredTitle, type: "concept", description: `Risorsa audio da ${fileName}` }],
            relations: contextList.slice(0, 2).map((c) => ({
              targetId: c.id,
              targetTitle: c.title,
              relationType: "references",
              weight: 0.8,
              description: "Collegamento ontologico nel Vault",
            })),
          },
        },
      });
    }

    // -------------------------------------------------------------
    // PATH B: PDF, IMAGE, CODE, TEXT, MARKDOWN, JSON, LOGS
    // -------------------------------------------------------------
    const promptText = `You are a Principal Software Architect, Ontologist, and Senior Technical Author.
Your mission is to perform deep, exhaustive analysis of the attached document/file ("${fileName}", type: ${fileType}, mime: ${mimeType}) and transform it into an authoritative, complete Open Knowledge Format (OKF v0.2) specification in Italian (using standard English for code, schemas, and technical terms).

User Notes/Annotations attached to this file:
"""${notes || "Nessuna nota aggiuntiva"}"""

Existing resources in the user's Vault for topological cross-linking:
${JSON.stringify(contextList, null, 2)}

${isImage ? `
MULTIMODAL IMAGE VISION & AUTO-CLASSIFICATION MANDATE (UNIVERSAL & NON-SECTORAL):
The attached file is an image/screenshot/scan/document ("${fileName}"). Thoroughly examine every pixel, visual element, diagram, UI window, error alert, code snippet, historical timeline, worksheet, or graphic:
1. STRICT RESOURCE TYPE DETERMINATION ('type'):
   - IF the image depicts an educational, historical, or chronological document, timeline, or conceptual study sheet (such as "collocare i fatti nel tempo", cronologia storica, linee del tempo, schede didattiche, mappe concettuali, tavole sinottiche):
     * MUST set 'type': "knowledge"
     * MUST set 'docType': "concept" (or "guide" or "specification")
     * MUST set 'domain': Subject matter domain (e.g. "Storia & Cronologia", "Discipline Umanistiche", "Scienze dell'Educazione", "Metodologia & Didattica", or the specific historical/scientific era)
     * MUST perform exhaustive OCR of every period, date, historical event, historical figure, milestone, question, definition, and text visible in the document.
     * In 'entities': MUST extract each historical event, epoch/era, date/century, key historical person, and core pedagogical concept with { name: string, type: "event" | "period" | "person" | "concept" | "milestone", description: string }.
     * In 'relations': MUST map chronological and causal relations: relationType 'precedes' (for antecedent events), 'causes' (for cause-and-effect), 'references', or 'extends'.
     * In 'markdownContent': Structure the document beautifully with OKF v0.2 YAML frontmatter, an executive summary, a structured Chronological Timeline Table (Data/Periodo | Evento/Fatto | Protagonisti | Conseguenze), deep thematic analysis, causal connections, and educational key concepts.
   - IF the image depicts an error, exception, stack trace, crash alert, failed build/test, terminal red error, OS error dialog, or bug:
     * MUST set 'type': "troubleshooting"
     * MUST set 'docType': "specification"
     * MUST set 'domain': "System Diagnostics & OS" (or "Developer Tooling", "Cloud Architecture")
     * MUST set 'errorLog': Complete, verbatim OCR transcript of the error text, exception name, error code, and stack trace.
     * MUST set 'problemDescription': Clear Italian summary of what failed and how it manifests.
     * MUST set 'rootCause': Deep technical explanation of why this error occurred.
     * MUST set 'solutionSteps': Ordered, actionable steps and commands to resolve the issue.
     * MUST set 'affectedSystem': Operating system, framework, runtime, library, or hardware affected.
     * MUST include tags: ["troubleshooting", "bugfix", "diagnostica", "fix", ...]
   - IF the image depicts a standard operating procedure, maintenance manual, machine panel photo, or operational workflow:
     * MUST set 'type': "procedure"
     * MUST set 'docType': "guide"
     * MUST set 'domain': "Standard Operating Procedures" or target industry domain
     * MUST extract steps, safety warnings, and tools.
   - IF the image depicts a system architecture diagram, cloud topology (AWS/GCP/Azure), component schema, flowchart, mind map, or data pipeline:
     * MUST set 'type': "knowledge"
     * MUST set 'docType': "architecture"
     * MUST set 'domain': "Cloud Architecture", "Systems Architecture", or "Information Architecture"
     * MUST extract every visual node, component, microservice, or database as an entity in 'entities'.
     * MUST extract all links, data flows, protocols, and dependencies between nodes as relations in 'relations'.
     * MUST detail the end-to-end data flow, protocols, security boundaries, and scalability in 'markdownContent'.
   - IF the image depicts a general document, scanned page, worksheet, infographic, book page, slide, or research notes:
     * MUST set 'type': "knowledge" (or "article" if editorial)
     * MUST set 'docType': "concept" or "guide"
     * MUST perform comprehensive OCR and transcribe all headings, paragraphs, bullet points, data tables, and diagrams into clean Markdown.
   - IF the image depicts a code snippet, script, terminal session, or IDE window:
     * MUST set 'type': "knowledge"
     * MUST set 'docType': "guide"
     * MUST transcribe the exact code faithfully with syntax-highlighted code blocks in 'markdownContent'.
   - IF the image depicts an AI prompt template, system instructions, or agent behavior:
     * MUST set 'type': "ai_skill"
     * MUST set 'docType': "prompt_skill"
   - IF the image depicts a design system, color palette, UI mockup, wireframe, or dashboard:
     * MUST set 'type': "knowledge"
     * MUST set 'docType': "specification"
     * MUST set 'domain': "Developer Tooling" or "UI Design System"
   - DEFAULT FOR OTHER IMAGES:
     * Set 'type': "knowledge"
     * Set 'docType': "concept" or "specification"
2. OCR FIDELITY & OKF v0.2 SPECIFICATION:
   - Perform meticulous OCR on all text, hex codes, labels, metrics, dates, and parameters in the image.
   - The generated 'markdownContent' must begin with valid YAML frontmatter conforming to OKF v0.2 with okf_version: "0.2", title, type, domain, tags, entities, and relations.
` : isTroubleshoot ? `
SPECIALIZED TROUBLESHOOTING & ERROR RESOLUTION MANDATE:
The uploaded file is a bug report, system crash log, error screenshot, or a document/PDF containing an error screenshot followed by the applied solution / fix:
1. VISUAL INSPECTION & ERROR OCR:
   - Carefully inspect any visual element, screenshot, error modal, crash alert, dialog box, terminal output, stack trace, or Windows/Linux error code in the PDF/image.
   - Transcribe the exact error text, code, or message into 'errorLog'.
   - Summarize the failure behavior and symptoms into 'problemDescription'.
2. SOLUTION & REMEDIATION EXTRACTION:
   - Read the accompanying or subsequent text detailing how the problem was resolved.
   - Break down the applied solution into discrete, ordered, actionable steps in 'solutionSteps' (e.g., specific registry keys, terminal commands, driver reinstallations, DLL placements, or code fixes).
   - Articulate the technical 'rootCause' explaining why the error occurred.
   - Identify the software, package, operating system, or library in 'affectedSystem'.
   - List any failed attempts or workarounds in 'attemptedFixes' (if mentioned).
3. MANDATORY CLASSIFICATION:
   - 'type': "troubleshooting"
   - 'docType': "specification"
   - 'domain': "System Diagnostics & OS" (or "Developer Tooling", "Cloud Architecture", "Database Engineering" depending on context)
   - 'tags': Include ["troubleshooting", "bugfix", "diagnostica", "fix", ...] and tags related to the affected system.
4. STRUCTURED MARKDOWN DOCUMENT (markdownContent):
   Start with YAML frontmatter conforming to OKF v0.2, followed by:
   # [Titolo Descrittivo del Problema e Soluzione]
   > Scheda diagnostica e procedura di risoluzione per [affectedSystem]
   ## 1. Descrizione del Problema ed Errore Riscontrato
   (Trascrizione fedele dell'errore visibile nello screenshot/PDF)
   ## 2. Analisi della Causa Radice (Root Cause)
   ## 3. Procedura Risolutiva Applicata (Passo-Passo Verificato)
   (Passaggi numerati con comandi o configurazioni)
   ## 4. Verifiche di Ripristino e Prevenzione
` : isProcedure ? `
SPECIALIZED PROCEDURE & PLAYBOOK MANDATE:
The uploaded file is a Standard Operating Procedure (SOP), operational playbook, maintenance guide, hardware servicing manual, onboarding plan, or installation runbook:
1. STRICT RESOURCE TYPE DETERMINATION:
   - 'type': "procedure"
   - 'docType': "guide" (or "specification")
   - 'domain': Target technical domain (e.g. "Hardware & Multifunction Printers", "Systems Administration & DevOps", "IT Customer Support")
   - 'tags': Include ["procedure", "playbook", "sop", "operativo", "manutenzione", ...]
2. PROCEDURE METADATA EXTRACTION:
   - 'procedureType': Categorize into "maintenance", "deployment", "installation", "onboarding", "customer_support", or "troubleshooting_workflow".
   - 'targetSystem': Operating platform, printer model (e.g. Kyocera, Ricoh, Canon, HP), cloud service or software.
   - 'estimatedDuration': Realistic duration (e.g. "20 min", "45 min", "1 ora").
   - 'riskLevel': "low", "medium", "high", or "critical".
   - 'requiredTools': Physical tools, screwdrivers, toner kits, cables, SSH keys, admin passwords.
   - 'safetyWarnings': Crucial safety instructions (power off, electrostatic precautions, avoid production downtime).
   - 'prerequisites': Initial system state or required access.
   - 'rollbackPlan': Explicit recovery or restoration steps if the procedure fails midway.
3. EXECUTABLE STEP CHECKLIST FORMAT IN 'markdownContent':
   Organize into clear sections:
   # [Titolo della Procedura Standard]
   > Playbook operativo standardizzato per [targetSystem]
   ## 1. Obiettivo & Ambito Operativo
   ## 2. Prerequisiti, Attrezzi & Avvertenze di Sicurezza
   ## 3. Checklist Operativa Sequenziale (con Criteri di Accettazione per ogni step)
      - [ ] **Passo 1: [Azione]** - Dettaglio operativo. *Criterio di Accettazione*: Come verificare il completamento.
      - [ ] **Passo 2: [Azione]** - Dettaglio operativo.
   ## 4. Piano di Rollback & Ripristino d'Emergenza
   ## 5. Risoluzione Problemi ed Errori Correlati (link a nodi troubleshooting del Vault)
4. ONTOLOGY RELATIONS:
   Link to any related troubleshooting items or components in 'relations' with relationType: "prevents" or "handles_incident".
` : ""}

Strict OKF v0.2 & Content Depth Mandates:
1. 'title': Clear, canonical title representing the document's core subject.
2. 'summary': Dense, 2-4 sentence executive summary in Italian.
3. 'tags': 4 to 8 relevant lowercase technical tags.
4. 'domain': E.g. "AI Systems & Inference", "Cloud Architecture", "System Diagnostics & OS", "Developer Tooling", "Database Engineering", "Security".
5. 'docType': "concept" | "specification" | "architecture" | "guide" | "tool_description" | "prompt_skill".
6. 'entities': Array of 4 to 10 canonical entities with { name: string, type: string, description: string }.
7. 'relations': Array of weighted relations to existing vault items { targetTitle: string, relationType: 'references' | 'implements' | 'governs' | 'integrates' | 'extends', weight: number (0.5 to 1.0), description: string }.
8. 'markdownContent': An extensive, multi-section Markdown document (500 to 1200+ words) starting with YAML frontmatter.

Return pure JSON strictly matching the schema.`;

    let extractedPdfText = "";
    if (isPdf && cleanBase64 && cleanBase64.length > 50) {
      try {
        const pdfBuffer = Buffer.from(cleanBase64, "base64");
        if (pdfBuffer.length > 10 && pdfBuffer.subarray(0, 4).toString("latin1") === "%PDF") {
          const parsedText = await extractTextFromPdfBuffer(pdfBuffer);
          if (parsedText && parsedText.trim().length > 20) {
            extractedPdfText = parsedText.trim();
            console.log(`[PDF Parser] Extracted ${extractedPdfText.length} characters of text from "${fileName}"`);
          }
        }
      } catch {}
    }

    if (cleanBase64 && cleanBase64.length > 30 && cleanBase64.length < 15 * 1024 * 1024 && (isPdf || isImage)) {
      let resolvedMime = "application/pdf";
      if (isPdf) {
        resolvedMime = "application/pdf";
      } else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || (mimeType && (mimeType.includes("jpeg") || mimeType.includes("jpg")))) {
        resolvedMime = "image/jpeg";
      } else if (lowerName.endsWith(".webp") || (mimeType && mimeType.includes("webp"))) {
        resolvedMime = "image/webp";
      } else if (lowerName.endsWith(".gif") || (mimeType && mimeType.includes("gif"))) {
        resolvedMime = "image/gif";
      } else if (lowerName.endsWith(".png") || (mimeType && mimeType.includes("png"))) {
        resolvedMime = "image/png";
      }

      const multimodalContents = [
        { text: promptText + (extractedPdfText ? `\n\nExtracted Text from PDF:\n"""\n${extractedPdfText.slice(0, 25000)}\n"""` : "") },
        {
          inlineData: {
            mimeType: resolvedMime,
            data: cleanBase64,
          },
        },
      ];

      try {
        const generated = await generateMultimodalWithGeminiFallback(multimodalContents, schema, 45000, "/api/convert-file-to-okf", preferredModel);
        if (generated?.text) {
          parsed = JSON.parse(generated.text);
        }
      } catch (err: any) {
        console.warn("Multimodal AI generation failed for convert-file-to-okf:", err?.message);
      }
    }

    if (!parsed) {
      let extractedText = extractedPdfText || textContent || "";
      let jupyterMetadata: any = null;

      if (isJupyter) {
        try {
          let jupyterJson = textContent || "";
          if (!jupyterJson && cleanBase64) {
            jupyterJson = Buffer.from(cleanBase64, "base64").toString("utf-8");
          }
          if (jupyterJson) {
            const parsedNb = parseJupyterNotebookString(jupyterJson, fileName);
            extractedText = parsedNb.markdownContent;
            jupyterMetadata = {
              kernel: parsedNb.kernelName,
              language: parsedNb.language,
              codeBlocksCount: parsedNb.codeBlocksCount,
              markdownCellsCount: parsedNb.markdownCellsCount,
            };
          }
        } catch (e: any) {
          console.warn("[captureRoutes] Jupyter notebook pre-parsing failed:", e?.message);
        }
      } else if (!extractedText && cleanBase64 && cleanBase64.length > 20 && !isImage && !isPdf) {
        try {
          const decoded = Buffer.from(cleanBase64, "base64").toString("utf-8");
          if (/^[\x20-\x7E\s\u00A0-\uFFFF]*$/.test(decoded.slice(0, 500))) {
            extractedText = decoded;
          }
        } catch {
          extractedText = "";
        }
      }

      const textToAnalyze = extractedText || notes || `File: ${fileName}`;
      const textPrompt = isJupyter
        ? `You are an expert Data Scientist, ML Engineer, and Technical Author.
You are converting a Jupyter Notebook ("${fileName}") into an authoritative Open Knowledge Format (OKF v0.2) guide in Italian (code in Python).
The notebook cells (narrative, math, and code blocks) have been extracted:
"""
${textToAnalyze.slice(0, 45000)}
"""

MANDATE FOR JUPYTER NOTEBOOKS:
1. 'type': "knowledge"
2. 'docType': "guide"
3. 'domain': "Data Science & Machine Learning" (or "Deep Learning", "Data Analytics")
4. 'tags': Include ["jupyter", "python", "machine-learning", "notebook", ...]
5. 'markdownContent': Start with YAML frontmatter conforming to OKF v0.2, then organize into logical sections: Obiettivi, Dataset/Prerequisiti, Pipeline di Esecuzione (con blocchi codice Python), Interpretazione dei Risultati, Istruzioni di Riproducibilità.

Return pure JSON matching the schema strictly.`
        : `${promptText}\n\nDocument/File Content ("${fileName}"):\n"""\n${textToAnalyze.slice(0, 45000)}\n"""`;

      try {
        const generated = await generateWithGeminiFallback(textPrompt, schema, {
          timeoutMs: 35000,
          endpoint: "/api/convert-file-to-okf",
          preferredModel: preferredModel || undefined,
        });
        if (generated?.text) {
          parsed = JSON.parse(generated.text);
        }
      } catch (err: any) {
        console.warn("Text-based Gemini generation failed for convert-file-to-okf:", err?.message);
      }
    }

    if (parsed && parsed.title && parsed.markdownContent) {
      // Validate and resolve canonical ResourceType
      const VALID_RESOURCE_TYPES = ["troubleshooting", "knowledge", "article", "ai_skill", "mcp_server", "paper", "note", "procedure"];

      const isAiDetectedTroubleshoot =
        parsed.type === "troubleshooting" ||
        (Boolean(parsed.errorLog) && parsed.errorLog.length > 5) ||
        (Array.isArray(parsed.solutionSteps) && parsed.solutionSteps.length > 0 && !parsed.docType?.includes("architecture") && !isProcedure);

      let resolvedType: string = "knowledge";
      if (explicitType && VALID_RESOURCE_TYPES.includes(explicitType)) {
        resolvedType = explicitType;
      } else if (isTroubleshoot || isAiDetectedTroubleshoot) {
        resolvedType = "troubleshooting";
      } else if (isProcedure || (parsed.type && (parsed.type.toLowerCase().includes("procedure") || parsed.type.toLowerCase().includes("playbook") || parsed.type.toLowerCase().includes("sop")))) {
        resolvedType = "procedure";
      } else if (parsed.type && VALID_RESOURCE_TYPES.includes(parsed.type.toLowerCase())) {
        resolvedType = parsed.type.toLowerCase();
      } else if (parsed.type && parsed.type.toLowerCase().includes("troubleshoot")) {
        resolvedType = "troubleshooting";
      } else if (parsed.type && parsed.type.toLowerCase().includes("skill")) {
        resolvedType = "ai_skill";
      } else if (parsed.type && parsed.type.toLowerCase().includes("mcp")) {
        resolvedType = "mcp_server";
      } else if (parsed.type && parsed.type.toLowerCase().includes("article")) {
        resolvedType = "article";
      } else if (parsed.type && parsed.type.toLowerCase().includes("paper")) {
        resolvedType = "paper";
      } else {
        resolvedType = "knowledge";
      }

      // Safely attach image preview (under 800KB)
      const resolvedImagePreview = isImage && cleanBase64 && cleanBase64.length < 800 * 1024
        ? (rawB64.startsWith("data:") ? rawB64 : `data:${resolvedMime || "image/png"};base64,${cleanBase64}`)
        : undefined;

      // Ensure YAML frontmatter is present and has proper okf_version & type
      let finalMarkdown = parsed.markdownContent || "";
      if (!finalMarkdown.startsWith("---")) {
        const docId = `doc-${Date.now()}`;
        const docDomain = parsed.domain || (resolvedType === "troubleshooting" ? "System Diagnostics & OS" : resolvedType === "procedure" ? "Standard Operating Procedures" : "Knowledge Architecture");
        const docTypeVal = parsed.docType || (resolvedType === "procedure" ? "guide" : "specification");
        const tagsList = JSON.stringify(parsed.tags || [resolvedType, "okf-v0.2"]);
        finalMarkdown = `---\nokf_version: "0.2"\nid: "${docId}"\ntitle: "${(parsed.title || "Document").replace(/"/g, '\\"')}"\ntype: "${resolvedType}"\ndomain: "${docDomain}"\ndocType: "${docTypeVal}"\ntags: ${tagsList}\n---\n\n${finalMarkdown}`;
      } else if (!finalMarkdown.includes("okf_version:")) {
        finalMarkdown = finalMarkdown.replace(/^---/, `---\nokf_version: "0.2"`);
      }

      const docTypeRes = resolveDocType(resolvedType, {
        markdownContent: finalMarkdown,
        domain: parsed.domain,
        tags: parsed.tags,
      });

      const provenance = generateProvenanceRecord({
        modelUsed: preferredModel || "gemini-3.7-flash",
        pipelineId: isImage ? "multimodal-vision-ocr" : isPdf ? "pdf-extractor" : "universal-multimodal-ocr",
        pipelineVersion: "1.2.0",
        promptVersion: "0.2.2",
        tokensIn: Math.round((textContent?.length || 500) / 4),
        tokensOut: Math.round((finalMarkdown?.length || 500) / 4),
        durationMs: Date.now() - routeStartTime,
        contentToHash: finalMarkdown || textContent || fileName,
      });

      let resourcePayload: any = {
        type: resolvedType,
        title: parsed.title,
        summary: parsed.summary,
        tags: parsed.tags || ["file-upload", resolvedType, "okf-v0.2"],
        metadata: {
          okfVersion: "0.2",
          domain: parsed.domain || (resolvedType === "troubleshooting" ? "System Diagnostics & OS" : resolvedType === "procedure" ? "Standard Operating Procedures" : "Knowledge Architecture"),
          docType: docTypeRes.docType,
          docTypeLocked: docTypeRes.isLocked,
          docTypeResolutionSource: docTypeRes.resolutionSource,
          provenance,
          mediaType: isImage ? "image" : isPdf ? "pdf" : (fileType || undefined),
          imageUrl: resolvedImagePreview,
          ogImage: resolvedImagePreview,
          procedureType: parsed.procedureType || (resolvedType === "procedure" ? "maintenance" : undefined),
          targetSystem: parsed.targetSystem || parsed.affectedSystem || undefined,
          estimatedDuration: parsed.estimatedDuration || undefined,
          riskLevel: parsed.riskLevel || (resolvedType === "procedure" ? "low" : undefined),
          requiredTools: Array.isArray(parsed.requiredTools) && parsed.requiredTools.length > 0 ? parsed.requiredTools : undefined,
          safetyWarnings: Array.isArray(parsed.safetyWarnings) && parsed.safetyWarnings.length > 0 ? parsed.safetyWarnings : undefined,
          prerequisites: Array.isArray(parsed.prerequisites) && parsed.prerequisites.length > 0 ? parsed.prerequisites : undefined,
          stepsCount: parsed.stepsCount || (Array.isArray(parsed.solutionSteps) ? parsed.solutionSteps.length : undefined),
          rollbackPlan: parsed.rollbackPlan || undefined,
          affectedSystem: parsed.affectedSystem || undefined,
          rootCause: parsed.rootCause || undefined,
          problemDescription: parsed.problemDescription || parsed.errorLog || undefined,
          errorLog: parsed.errorLog || undefined,
          attemptedFixes: Array.isArray(parsed.attemptedFixes) && parsed.attemptedFixes.length > 0 ? parsed.attemptedFixes : undefined,
          solutionSteps: Array.isArray(parsed.solutionSteps) && parsed.solutionSteps.length > 0 ? parsed.solutionSteps : undefined,
          entities: parsed.entities || [],
          relations: parsed.relations || [],
          markdownContent: finalMarkdown,
          sourceFileName: fileName,
          sourceFileType: fileType || (isImage ? "image" : undefined),
        },
      };

      if (resolvedType === "mcp_server") {
        resourcePayload = scrubMcpConfig(resourcePayload);
      }

      return res.json({
        success: true,
        source: "gemini",
        resource: resourcePayload,
      });
    }

    const fallbackText = textContent || extractedPdfText || notes || `Contenuto estratto dal file ${fileName}`;

    if (isTroubleshoot || explicitType === "troubleshooting") {
      const fallbackTitle = inferredTitle || "Diagnostica e Risoluzione Problema";
      const fallbackDoc = `---
okf_version: "0.2"
id: "doc-${Date.now()}"
title: "${fallbackTitle}"
type: "troubleshooting"
domain: "System Diagnostics & OS"
tags: ["troubleshooting", "bugfix", "diagnostica", "okf-v0.2"]
created_at: "${new Date().toISOString()}"
entities:
  - name: "${fallbackTitle}"
    type: "problem"
    description: "Problema diagnostico acquisito da ${fileName}"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "references"
    weight: 0.85
---

# ${fallbackTitle}

> **Scheda Diagnostica e Procedura Risolutiva (\`${fileName}\`)**

---

## 1. Descrizione del Problema
${fallbackText.slice(0, 1500)}

---

## 2. Risoluzione e Note
${notes ? notes : "Consultare il file originale allegato per i dettagli completi del fix."}
`;

      const fallbackProvenance = generateProvenanceRecord({
        modelUsed: "heuristic-fallback-local",
        pipelineId: "troubleshooting-heuristic-fallback",
        pipelineVersion: "1.2.0",
        promptVersion: "0.2.2",
        tokensIn: 0,
        tokensOut: Math.round(fallbackDoc.length / 4),
        durationMs: Date.now() - routeStartTime,
        contentToHash: fallbackDoc,
      });

      return res.json({
        success: true,
        source: "fallback",
        resource: {
          type: "troubleshooting",
          title: fallbackTitle,
          summary: `Diagnostica e procedura di risoluzione per errore acquisito da ${fileName}.`,
          tags: ["troubleshooting", "bugfix", "diagnostica", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: "System Diagnostics & OS",
            docType: "specification",
            docTypeLocked: true,
            docTypeResolutionSource: "heuristic_signal",
            provenance: fallbackProvenance,
            mediaType: isImage ? "image" : isPdf ? "pdf" : (fileType || undefined),
            imageUrl: isImage && cleanBase64 && cleanBase64.length < 500 * 1024
              ? (rawB64.startsWith("data:") ? rawB64 : `data:${resolvedMime || "image/png"};base64,${cleanBase64}`)
              : undefined,
            ogImage: isImage && cleanBase64 && cleanBase64.length < 500 * 1024
              ? (rawB64.startsWith("data:") ? rawB64 : `data:${resolvedMime || "image/png"};base64,${cleanBase64}`)
              : undefined,
            problemDescription: fallbackText.slice(0, 500),
            markdownContent: fallbackDoc,
            sourceFileName: fileName,
            sourceFileType: fileType || (isImage ? "image" : undefined),
            entities: [{ name: fallbackTitle, type: "problem", description: `Problema acquisito da ${fileName}` }],
            relations: contextList.slice(0, 2).map((c) => ({
              targetId: c.id,
              targetTitle: c.title,
              relationType: "references",
              weight: 0.8,
              description: "Collegamento ontologico nel Vault",
            })),
          },
        },
      });
    }

    const fallbackDoc = `---
okf_version: "0.2"
title: "${inferredTitle}"
type: "specification"
domain: "Software & Systems"
tags: ["file-upload", "document", "okf-v0.2"]
created_at: "${new Date().toISOString()}"
entities:
  - name: "${inferredTitle}"
    type: "concept"
    description: "Documento originale acquisito da ${fileName}"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "references"
    weight: 0.85
---

# ${inferredTitle}

> **Documento acquisito e convertito da file grezzo (\`${fileName}\`)**

---

## 1. Panoramica Esecutiva
Documentazione acquisita tramite il modulo di upload del Knowledge Vault.

---

## 2. Contenuto Estratto
${fallbackText.slice(0, 3000)}

---

## 3. Topologia e Grafo
Questa specifica è registrata nel Vault per collegamenti ontologici.
`;

    const genericDocTypeRes = resolveDocType("knowledge", {
      markdownContent: fallbackDoc,
      domain: "Software & Systems",
      tags: ["file-upload", "document", "okf-v0.2"],
    });

    const genericFallbackProvenance = generateProvenanceRecord({
      modelUsed: "heuristic-fallback-local",
      pipelineId: "file-heuristic-fallback",
      pipelineVersion: "1.2.0",
      promptVersion: "0.2.2",
      tokensIn: 0,
      tokensOut: Math.round(fallbackDoc.length / 4),
      durationMs: Date.now() - routeStartTime,
      contentToHash: fallbackDoc,
    });

    return res.json({
      success: true,
      source: "fallback",
      resource: {
        type: "knowledge",
        title: inferredTitle,
        summary: `Documento acquisito da ${fileName}. Include specifiche tecniche ed entità mappate.`,
        tags: ["file-upload", "document", "okf-v0.2"],
        metadata: {
          okfVersion: "0.2",
          domain: "Software & Systems",
          docType: genericDocTypeRes.docType,
          docTypeLocked: genericDocTypeRes.isLocked,
          docTypeResolutionSource: genericDocTypeRes.resolutionSource,
          provenance: genericFallbackProvenance,
          mediaType: isImage ? "image" : isPdf ? "pdf" : (fileType || undefined),
          imageUrl: isImage && cleanBase64 && cleanBase64.length < 500 * 1024
            ? (rawB64.startsWith("data:") ? rawB64 : `data:${resolvedMime || "image/png"};base64,${cleanBase64}`)
            : undefined,
          ogImage: isImage && cleanBase64 && cleanBase64.length < 500 * 1024
            ? (rawB64.startsWith("data:") ? rawB64 : `data:${resolvedMime || "image/png"};base64,${cleanBase64}`)
            : undefined,
          markdownContent: fallbackDoc,
          sourceFileName: fileName,
          sourceFileType: fileType || (isImage ? "image" : undefined),
          entities: [{ name: inferredTitle, type: "concept", description: `Risorsa originata da ${fileName}` }],
          relations: contextList.slice(0, 2).map((c) => ({
            targetId: c.id,
            targetTitle: c.title,
            relationType: "references",
            weight: 0.8,
            description: "Collegamento ontologico nel Vault",
          })),
        },
      },
    });
  } catch (error: any) {
    console.error("Convert file to OKF error:", error);
    res.status(500).json({ error: error?.message || "Failed to convert file to OKF" });
  }
});

// POST /api/process-knowledge
captureRouter.post("/process-knowledge", async (req, res) => {
  try {
    const { text, filename, existingResources = [] } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Text content is required" });
    }

    const rawText = text.trim();
    const contextList = (existingResources as any[]).slice(0, 30).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      tags: r.tags || [],
    }));

    const prompt = `You are a Principal Software Architect, Ontologist, and Senior Technical Writer.
Your task is to transform the provided raw text or document into an authoritative, deeply detailed, and comprehensive Open Knowledge Format (OKF v0.2) specification in Italian (with standard English technical terms/code).

Raw Document content (Filename: "${filename || 'document'}"):
"""
${rawText.slice(0, 15000)}
"""

Existing resources in the user's Vault for topological cross-linking:
${JSON.stringify(contextList, null, 2)}

Strict OKF v0.2 & Content Depth Rules:
1. 'title': Clear, canonical title without redundant marketing prefixes.
2. 'summary': A dense, highly descriptive 2-4 sentence executive summary in Italian.
3. 'tags': 4 to 8 relevant lowercase technical tags.
4. 'domain': E.g. "AI Systems & Inference", "Cloud Architecture", "Developer Tooling", "Database Engineering", "Security".
5. 'docType': "concept" | "specification" | "architecture" | "guide" | "tool_description" | "prompt_skill".
6. 'entities': Array of 3 to 8 canonical entities with { name: string, type: string, description: string }.
7. 'relations': Array of weighted relations to existing vault items { targetTitle: string, relationType: 'references' | 'implements' | 'governs' | 'integrates' | 'extends', weight: number (0.5 to 1.0), description: string }.
8. 'markdownContent': A rich, comprehensive, multi-section Markdown document (AT LEAST 400-800 words) starting with YAML frontmatter.

Return JSON strictly matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        domain: { type: Type.STRING },
        docType: { type: Type.STRING },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["name", "type"],
          },
        },
        relations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetId: { type: Type.STRING },
              targetTitle: { type: Type.STRING },
              relationType: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ["targetTitle", "relationType"],
          },
        },
        markdownContent: { type: Type.STRING },
      },
      required: ["title", "summary", "tags", "markdownContent", "entities", "relations"],
    };

    let parsed: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 25000);
      if (generated?.text) {
        parsed = JSON.parse(generated.text);
      }
    } catch (e: any) {
      console.warn("AI generation failed for process-knowledge, using fallback parser:", e?.message);
    }

    if (parsed && parsed.title && parsed.markdownContent) {
      return res.json({
        result: {
          type: "knowledge",
          title: parsed.title,
          summary: parsed.summary,
          tags: parsed.tags || ["knowledge", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: parsed.domain || "Knowledge Architecture",
            docType: parsed.docType || "concept",
            entities: parsed.entities || [],
            relations: parsed.relations || [],
            markdownContent: parsed.markdownContent,
          },
        },
        source: "gemini",
      });
    }

    const lines = rawText.split("\n").filter((l) => l.trim().length > 0);
    const inferredTitle = filename?.replace(/\.[^/.]+$/, "") || lines[0]?.replace(/^#+\s*/, "").slice(0, 100) || "Documento Knowledge";
    const okfDoc = rawText.startsWith("---")
      ? rawText
      : `---\nokf_version: "0.2"\ntitle: "${inferredTitle}"\ntype: "concept"\ndomain: "Software Architecture"\ntags: ["knowledge", "okf-v0.2"]\ncreated_at: "${new Date().toISOString()}"\nentities:\n  - name: "${inferredTitle}"\n    type: "concept"\n    description: "Elemento cardine del documento"\nrelations:\n  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"\n    relation_type: "references"\n    weight: 0.85\n---\n\n# ${inferredTitle}\n\n> **Documentazione tecnica generata per il Knowledge Vault (OKF v0.2)**\n\n---\n\n## 1. Panoramica Esecutiva\n${rawText}\n\n---\n\n## 2. Dettagli Architetturali & Note Operative\n- Risorsa registrata all'interno dell'ontologia del Vault.\n- Compatibile con l'esplorazione topologica nel Grafo D3.\n`;

    return res.json({
      result: {
        type: "knowledge",
        title: inferredTitle,
        summary: rawText.slice(0, 280) + (rawText.length > 280 ? "..." : ""),
        tags: ["knowledge", "okf-v0.2", "doc"],
        metadata: {
          okfVersion: "0.2",
          domain: "Software Architecture",
          docType: "concept",
          markdownContent: okfDoc,
          entities: [{ name: inferredTitle, type: "concept", description: "Concetto primario" }],
          relations: contextList.slice(0, 2).map((c) => ({
            targetId: c.id,
            targetTitle: c.title,
            relationType: "references",
            weight: 0.8,
            description: "Collegamento semantico nel Vault",
          })),
        },
      },
      source: "fallback",
    });
  } catch (error: any) {
    console.error("Knowledge processing error:", error);
    const lines = (req.body.text || "").split("\n").filter((l: string) => l.trim().length > 0);
    const fallbackTitle = req.body.filename?.replace(/\.[^/.]+$/, "") || lines[0]?.slice(0, 100) || "Documento Knowledge";
    res.json({
      result: {
        type: "knowledge",
        title: fallbackTitle,
        summary: (req.body.text || "").slice(0, 300),
        tags: ["knowledge", "okf-v0.2"],
        metadata: {
          okfVersion: "0.2",
          domain: "dev",
          docType: "concept",
          markdownContent: req.body.text || "",
          entities: [{ name: fallbackTitle, type: "concept" }],
          relations: [],
        },
      },
      source: "fallback-error",
      error: error?.message,
    });
  }
});

// POST /api/expand-documentation
captureRouter.post("/expand-documentation", async (req, res) => {
  try {
    const { resource, existingResources = [] } = req.body;
    if (!resource || !resource.title) {
      return res.status(400).json({ error: "Resource object with title is required" });
    }

    const {
      title,
      type = "knowledge",
      summary = "",
      url = "",
      tags = [],
      metadata = {},
      rawInput = "",
    } = resource;

    const currentContent = metadata.markdownContent || rawInput || summary || "";
    const contextList = (existingResources as any[]).slice(0, 25).map((r) => ({
      title: r.title,
      type: r.type,
      tags: r.tags || [],
    }));

    const prompt = `You are a World-Class Principal Software Architect and Lead Technical Author.
Create an EXHAUSTIVE, IN-DEPTH, AND PROFESSIONAL Open Knowledge Format (OKF v0.2) Technical Documentation file for the following resource:

Resource Context:
- Title: "${title}"
- Type: "${type}"
- URL: "${url || 'N/A'}"
- Summary: "${summary}"
- Tags: ${JSON.stringify(tags)}
- Existing Document/Context: """${currentContent.slice(0, 8000)}"""
- Type Specific Info: ${JSON.stringify(metadata, null, 2)}

Vault Cross-Reference Pool:
${JSON.stringify(contextList, null, 2)}

Requirements for the Generated Documentation:
1. Length & Depth: Must be a rich, comprehensive technical guide (500 to 1000+ words).
2. Language: Professional Italian for prose and explanations, standard English for technical identifiers, code, commands, and schemas.
3. YAML Frontmatter: Must begin with valid YAML starting with --- and ending with --- containing:
   - okf_version: "0.2"
   - title: "${title}"
   - type: "${metadata.docType || 'guide'}"
   - domain: "${metadata.domain || 'Software Architecture'}"
   - tags: ${JSON.stringify(tags.length > 0 ? tags : ['knowledge', 'okf-v0.2'])}
   - created_at: "${new Date().toISOString()}"
   - entities: array of { name, type, description }
   - relations: array of { target_title, relation_type, weight, description }
4. Document Sections to Include in the Markdown Body:
   # ${title}
   > Executive blockquote summary with key value proposition
   ---
   ## 1. Panoramica Esecutiva & Scopo del Progetto
   ## 2. Architettura Tecnica & Diagramma di Flusso
   ## 3. Guida Operativa, Comandi CLI & Snippet di Codice
   ## 4. Ontologia, Entità & Connessioni Topologiche (incorporate [[Wikilinks]])
   ## 5. Linee Guida di Produzione, Resilienza e Sicurezza

Return pure JSON matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        expandedMarkdown: { type: Type.STRING },
        enhancedSummary: { type: Type.STRING },
        domain: { type: Type.STRING },
        docType: { type: Type.STRING },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["name", "type"],
          },
        },
        relations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetTitle: { type: Type.STRING },
              relationType: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ["targetTitle", "relationType"],
          },
        },
      },
      required: ["expandedMarkdown", "enhancedSummary", "entities", "relations"],
    };

    let result: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 30000);
      if (generated?.text) {
        result = JSON.parse(generated.text);
      }
    } catch (err: any) {
      console.warn("AI generation failed for expand-documentation, using fallback:", err?.message);
    }

    if (result && result.expandedMarkdown) {
      return res.json({
        success: true,
        source: "gemini",
        data: {
          markdownContent: result.expandedMarkdown,
          summary: result.enhancedSummary || summary,
          domain: result.domain || metadata.domain || "Knowledge Systems",
          docType: result.docType || metadata.docType || "specification",
          entities: result.entities || metadata.entities || [],
          relations: result.relations || metadata.relations || [],
        },
      });
    }

    const cleanBody = currentContent.replace(/^---[\s\S]*?---\n*/, "").trim() || summary;
    const fallbackEntities = metadata.entities && metadata.entities.length > 0 
      ? metadata.entities 
      : [
          { name: title, type: "concept", description: `Elemento cardine del documento "${title}"` },
          { name: metadata.domain || "Software Architecture", type: "domain", description: "Dominio di riferimento" },
        ];
    
    const fallbackRelations = metadata.relations && metadata.relations.length > 0
      ? metadata.relations
      : contextList.slice(0, 3).map((c) => ({
          targetTitle: c.title,
          relationType: "references",
          weight: 0.85,
          description: "Correlazione semantica nel Knowledge Vault",
        }));

    const fallbackMarkdown = `---
okf_version: "0.2"
title: "${title}"
type: "${metadata.docType || 'specification'}"
domain: "${metadata.domain || 'Software Architecture'}"
tags: ${JSON.stringify(tags.length > 0 ? tags : ['knowledge', 'okf-v0.2', 'architecture'])}
created_at: "${new Date().toISOString()}"
entities:
${fallbackEntities.map((e: any) => `  - name: "${typeof e === 'string' ? e : e.name}"\n    type: "${typeof e === 'string' ? 'concept' : e.type || 'concept'}"\n    description: "${typeof e === 'string' ? 'Entità associata' : e.description || 'Entità tecnica'}"`).join("\n")}
relations:
${fallbackRelations.map((r: any) => `  - target_title: "${r.targetTitle || r.target_title || 'Knowledge Vault'}"\n    relation_type: "${r.relationType || r.relation_type || 'references'}"\n    weight: ${r.weight || 0.85}\n    description: "${r.description || 'Connessione topologica'}"`).join("\n")}
---

# ${title}

> **Specifiche Tecniche & Approfondimento Architetturale (OKF v0.2)**
> 
> ${summary || `Documentazione approfondita per la risorsa **${title}**, catalogata all'interno del Knowledge Vault.`}

---

## 1. Panoramica Esecutiva & Obiettivi

La risorsa **${title}** rappresenta una componente fondamentale all'interno del dominio **${metadata.domain || 'Software Architecture'}**.
L'obiettivo primario di questa documentazione è formalizzare le linee guida architetturali, i requisiti di sistema e i protocolli di integrazione.

${summary ? `### Contesto & Abstract\n${summary}\n` : ''}

---

## 2. Architettura Tecnica & Specifiche dei Componenti

### Dettagli del Contenuto
${cleanBody}

---

## 3. Guida Operativa & Pattern di Utilizzo

1. **Configurazione Iniziale**: Verificare la conformità con lo standard OKF v0.2.
2. **Esecuzione & Parsing**: Sfruttare le pipeline di trasformazione del Knowledge Vault per mantenere sincronizzato il grafo delle dipendenze.
3. **Validazione**: Eseguire il controllo semantico delle entità e delle relazioni collegate.

---

## 4. Ontologia & Connessioni Topologiche

Questa risorsa è interconnessa con i seguenti concetti e nodi del Vault:
${fallbackRelations.map((r: any) => `- [[${r.targetTitle || r.target_title}]]: *${r.description || 'Relazione semantica'}* (\`${r.relationType || r.relation_type || 'references'}\`)`).join("\n")}

---

## 5. Best Practice, Sicurezza & Resilienza

- **Isolamento dei Dati**: Tutte le entità e i collegamenti rispettano i criteri di riservatezza e isolamento per-utente.
- **Integrità del Grafo**: Ogni aggiornamento mantiene consistenti i pesi di affinità nel motore D3 del grafo.
- **Audit & Versioning**: Revisione tracciata secondo lo standard di conformità OKF v0.2.
`;

    return res.json({
      success: true,
      source: "fallback",
      data: {
        markdownContent: fallbackMarkdown,
        summary: summary || `Documentazione tecnica dettagliata per ${title}`,
        domain: metadata.domain || "Software Architecture",
        docType: metadata.docType || "specification",
        entities: fallbackEntities,
        relations: fallbackRelations,
      },
    });
  } catch (error: any) {
    console.error("Expand documentation error:", error);
    res.status(500).json({ error: error?.message || "Failed to expand documentation" });
  }
});

// POST /api/search-grounded-enrich - On-demand Google Search grounding tool
captureRouter.post("/search-grounded-enrich", async (req, res) => {
  try {
    const { query, hint } = req.body;
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Query string is required" });
    }
    const result = await performSearchGroundedSynthesis(query.trim(), hint, 12000);
    if (!result) {
      return res.json({ success: false, error: "Search grounding was unable to retrieve results." });
    }
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to execute search grounding" });
  }
});

// POST /api/analyze-resource
captureRouter.post("/analyze-resource", async (req, res) => {
  const analyzeStartTime = Date.now();
  try {
    const { input, explicitType, existingResources, searchGrounded, preferredModel } = req.body;
    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return res.status(400).json({ error: "Input string is required" });
    }

    const trimmedInput = input.trim();
    const rawUrlMatch = trimmedInput.match(/https?:\/\/[^\s]+/i);
    let cleanTargetUrl = "";
    let cleanInput = trimmedInput;
    if (rawUrlMatch) {
      cleanTargetUrl = sanitizeUrl(rawUrlMatch[0]);
      if (trimmedInput.replace(/https?:\/\/[^\s]+/gi, "").trim().length === 0) {
        cleanInput = cleanTargetUrl;
      }
    }

    let ogData: OpenGraphData | null = null;
    let articleData: any = null;
    if (cleanTargetUrl) {
      try {
        const [ogRes, artRes] = await Promise.all([
          fetchOpenGraphMetadata(cleanTargetUrl),
          fetchArticleTextFromUrl(cleanTargetUrl, 6000).catch(() => null),
        ]);
        ogData = ogRes;
        articleData = artRes;
      } catch {}
    }

    // -------------------------------------------------------------
    // STAGE 1: REAL-TIME GOOGLE SEARCH GROUNDING SYNTHESIS
    // -------------------------------------------------------------
    let searchGrounding: GroundedSearchResult | null = null;
    const isFullMarkdownDoc = cleanInput.startsWith("---") || cleanInput.length > 2500;
    const shouldSearchGround = searchGrounded !== false && !isFullMarkdownDoc;

    if (shouldSearchGround) {
      try {
        const groundingQuery = (ogData?.ogTitle && !isGenericTitle(ogData.ogTitle, ogData.domain))
          ? `${ogData.ogTitle} ${ogData.author || ""} ${ogData.domain || ""}`.trim()
          : cleanInput;

        console.log(`[analyze-resource] Stage 1 Search Grounding for: "${groundingQuery.slice(0, 70)}..."`);
        searchGrounding = await performSearchGroundedSynthesis(
          groundingQuery,
          explicitType ? `Target category: ${explicitType}` : undefined,
          10000
        );
      } catch (sgErr: any) {
        console.warn("[analyze-resource] Stage 1 Search Grounding skipped:", sgErr?.message);
      }
    }

    const prompt = `You are an expert AI software architect and knowledge curator.
Analyze the following text or URL to extract structured information for a developer knowledge base adhering to Open Knowledge Format (OKF v0.2).

UNIVERSAL OKF v0.2 MANDATE:
EVERY resource is a structured technical document in this Knowledge Vault. You MUST generate:
1. 'metadata.okfVersion': "0.2"
2. 'metadata.domain': Specific domain (e.g. "Agentic Systems & AI", "Software Architecture", "DevOps & Cloud Infrastructure", "Frontend Engineering", "Security & System Diagnostics")
3. 'metadata.docType': "architecture" (for github_repo), "tool_description" (for mcp_server), "prompt_skill" (for ai_skill), "specification" (for troubleshooting/knowledge), "guide" (for article/link), or "concept" (for concepts)
4. 'metadata.entities': Array of 3 to 6 identified technical entities { name, type, description }
5. 'metadata.relations': Array of 2 to 5 topological relations { targetTitle, relationType, weight, description }
6. 'metadata.markdownContent': Full technical documentation starting with YAML frontmatter conforming to OKF v0.2.
7. 'metadata.aiExecutiveSummary': A concise 2-3 sentence executive analytical summary of the core insight.
8. 'metadata.keyTakeaways': 3-5 high-density technical bullet points.

Target Categories:
1. 'troubleshooting' - Technical issues, software bugs, DLL/system errors, crash diagnostics
2. 'github_repo' - GitHub repositories, packages, tools
3. 'mcp_server' - Model Context Protocol servers, tools, connectors for Claude/Gemini/AI agents
4. 'knowledge' - Architecture documents, specifications, second-brain knowledge notes
5. 'ai_skill' - AI System prompts, agents instructions, persona templates, workflow skills
6. 'paper' - Scientific / academic research papers (arXiv, NeurIPS, ICLR)
7. 'rss' - RSS or Atom feed subscriptions
8. 'note' - Quick scratchpad notes, prompt ideas, developer scratchpad
9. 'article' - Blog posts, documentation, tutorials, architectural guides
10. 'link' - Web links, online tools, SaaS platforms, portals, official sites
11. 'procedure' - Standard Operating Procedures (SOP), technical playbooks, maintenance checklists, hardware/multifunction printer servicing, onboarding steps, support runbooks

User Raw Input:
"""
${trimmedInput}
"""
${explicitType ? `User requested type hint: ${explicitType}` : ""}
${articleData?.text ? `
Extracted Web Page / Article Content Body:
"""
${articleData.text.slice(0, 3500)}
"""
` : ""}
${(explicitType === "procedure" || cleanInput.toLowerCase().includes("procedur") || cleanInput.toLowerCase().includes("playbook") || cleanInput.toLowerCase().includes("manutenzion") || cleanInput.toLowerCase().includes("onboarding") || cleanInput.toLowerCase().includes("assistenza") || cleanInput.toLowerCase().includes("sop")) ? `
SPECIALIZED SOP & PLAYBOOK PROCEDURALIZER MANDATE:
The user is requesting or providing an operational procedure, technical playbook, maintenance guide, customer support runbook, or onboarding checklist:
1. STRICT RESOURCE TYPE: Set 'type': "procedure", 'docType': "guide" (or "specification").
2. STRUCTURED PROCEDURE METADATA:
   - 'procedureType': Categorize as "maintenance", "deployment", "installation", "onboarding", "customer_support", or "troubleshooting_workflow".
   - 'targetSystem': Identify the hardware, OS, platform or software (e.g. "Stampanti Multifunzione Kyocera", "Docker & Kubernetes", "Active Directory").
   - 'estimatedDuration': Realistic completion time (e.g. "20 min", "45 min", "2 ore").
   - 'riskLevel': "low", "medium", "high", or "critical".
   - 'requiredTools': Specific tools, credentials, physical kits, or cables needed.
   - 'safetyWarnings': Crucial safety instructions (power off, electrostatic precautions, avoid production downtime).
   - 'prerequisites': Required pre-conditions or safety states.
   - 'rollbackPlan': Explicit fallback/recovery steps if an operation fails midway.
3. EXECUTABLE STEP CHECKLIST FORMAT:
   In 'markdownContent', organize into clear sections:
   # [Titolo Procedura Standard]
   ## 1. Obiettivo & Ambito Operativo
   ## 2. Prerequisiti, Attrezzi & Avvertenze di Sicurezza
   ## 3. Checklist Operativa Sequenziale:
      - [ ] **Passo 1: [Azione Precisa]** - Dettaglio operativo. *Criterio di Accettazione*: Come verificare il successo.
      - [ ] **Passo 2: [Azione Precisa]** - Dettaglio operativo.
   ## 4. Piano di Rollback & Ripristino di Emergenza
   ## 5. Risoluzione Problemi ed Errori Noti Correlati
4. ONTOLOGICAL MESH:
   Cross-link this procedure to any relevant troubleshooting nodes or system components in relations with 'prevents' or 'handles_incident'!
` : ""}
${searchGrounding ? `
VERIFIED REAL-TIME GOOGLE SEARCH GROUNDING BRIEF (Stage 1 Synthesis):
"""
${searchGrounding.groundedText}
"""
Discovered Live Web Citations: ${JSON.stringify(searchGrounding.webSources)}
Targeted Search Queries: ${JSON.stringify(searchGrounding.searchQueries)}
MANDATE: Incorporate these verified real-world facts, authors, repositories, and official documentation links directly into the OKF v0.2 documentation and entities!
` : ""}
${ogData ? `Extracted Open Graph web context:
- Domain: ${ogData.domain}
- Site Name: ${ogData.siteName || ogData.domain}
- OG Title: ${ogData.ogTitle || "N/A"}
- OG Description: ${ogData.ogDescription || "N/A"}
- Favicon: ${ogData.favicon || "N/A"}
- Author: ${ogData.author || "N/A"}
` : ""}
${Array.isArray(existingResources) && existingResources.length > 0 ? `Available Vault Resources for Cross-Linking Relations:
${existingResources.slice(0, 15).map((r: any) => `- "${r.title}" (Tipo: ${r.type}, Tags: ${(r.tags || []).join(", ")})`).join("\n")}
` : ""}

Return pure JSON matching this exact structure:
{
  "type": "troubleshooting" | "article" | "github_repo" | "mcp_server" | "ai_skill" | "knowledge" | "link" | "paper" | "rss" | "note" | "procedure",
  "title": "string",
  "url": "string",
  "summary": "string",
  "tags": ["string"],
  "metadata": {}
}`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["troubleshooting", "article", "github_repo", "mcp_server", "ai_skill", "knowledge", "link", "paper", "rss", "note", "procedure"],
        },
        title: { type: Type.STRING },
        url: { type: Type.STRING },
        summary: { type: Type.STRING },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        metadata: {
          type: Type.OBJECT,
          properties: {
            procedureType: { type: Type.STRING },
            targetSystem: { type: Type.STRING },
            estimatedDuration: { type: Type.STRING },
            riskLevel: { type: Type.STRING },
            requiredTools: { type: Type.ARRAY, items: { type: Type.STRING } },
            safetyWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            prerequisites: { type: Type.ARRAY, items: { type: Type.STRING } },
            stepsCount: { type: Type.NUMBER },
            rollbackPlan: { type: Type.STRING },
            affectedSystem: { type: Type.STRING },
            rootCause: { type: Type.STRING },
            attemptedFixes: { type: Type.ARRAY, items: { type: Type.STRING } },
            solutionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            problemDescription: { type: Type.STRING },
            userNotes: { type: Type.STRING },
            owner: { type: Type.STRING },
            repoName: { type: Type.STRING },
            language: { type: Type.STRING },
            installCommand: { type: Type.STRING },
            protocol: { type: Type.STRING },
            command: { type: Type.STRING },
            args: { type: Type.ARRAY, items: { type: Type.STRING } },
            configSnippet: { type: Type.STRING },
            toolsProvided: { type: Type.ARRAY, items: { type: Type.STRING } },
            skillType: { type: Type.STRING },
            recommendedModel: { type: Type.STRING },
            systemPrompt: { type: Type.STRING },
            triggerKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            exampleUsage: { type: Type.STRING },
            authors: { type: Type.ARRAY, items: { type: Type.STRING } },
            arxivId: { type: Type.STRING },
            doi: { type: Type.STRING },
            pdfUrl: { type: Type.STRING },
            venue: { type: Type.STRING },
            publishedYear: { type: Type.NUMBER },
            tldr: { type: Type.STRING },
            feedUrl: { type: Type.STRING },
            feedFormat: { type: Type.STRING },
            noteCategory: { type: Type.STRING },
            author: { type: Type.STRING },
            readingTimeMin: { type: Type.STRING },
            keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
            ogTitle: { type: Type.STRING },
            ogDescription: { type: Type.STRING },
            ogImage: { type: Type.STRING },
            favicon: { type: Type.STRING },
            siteName: { type: Type.STRING },
            domain: { type: Type.STRING },
            okfVersion: { type: Type.STRING },
            docType: { type: Type.STRING },
            markdownContent: { type: Type.STRING },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["name", "type"],
              },
            },
            relations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  targetId: { type: Type.STRING },
                  targetTitle: { type: Type.STRING },
                  relationType: { type: Type.STRING },
                  weight: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                },
                required: ["targetTitle", "relationType"],
              },
            },
          },
        },
      },
      required: ["type", "title", "summary", "tags"],
    };

    let parsedJson: any = null;
    let isFallback = false;
    let usedModelName = "";
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, {
        timeoutMs: 25000,
        endpoint: "/api/analyze-resource",
        preferredModel,
        thinkingBudget: 512,
      });
      if (generated?.text) {
        parsedJson = JSON.parse(generated.text);
        usedModelName = generated.modelUsed;
      }
    } catch (err: any) {
      console.warn("AI generation failed for analyze-resource, using rule-based parser:", err?.message);
    }

    if (!parsedJson) {
      isFallback = true;
      parsedJson = fallbackParse(cleanInput, explicitType, ogData, articleData);
    }

    if (!parsedJson.tags) parsedJson.tags = [];
    if (!parsedJson.metadata) parsedJson.metadata = {};

    if (searchGrounding) {
      parsedJson.metadata.groundedWithGoogleSearch = true;
      parsedJson.metadata.searchQueries = searchGrounding.searchQueries;
      if (!parsedJson.metadata.webSources || parsedJson.metadata.webSources.length === 0) {
        parsedJson.metadata.webSources = searchGrounding.webSources;
      }
    }

    if (cleanTargetUrl) {
      parsedJson.url = cleanTargetUrl;
    }

    if (ogData) {
      if (!parsedJson.metadata.domain && ogData.domain) parsedJson.metadata.domain = ogData.domain;
      if (!parsedJson.metadata.siteName && ogData.siteName) parsedJson.metadata.siteName = ogData.siteName;
      if (!parsedJson.metadata.favicon && ogData.favicon) parsedJson.metadata.favicon = ogData.favicon;
      if (!parsedJson.metadata.ogDescription && ogData.ogDescription) parsedJson.metadata.ogDescription = ogData.ogDescription;
      if (!parsedJson.metadata.ogTitle && ogData.ogTitle) parsedJson.metadata.ogTitle = ogData.ogTitle;
      if (!parsedJson.metadata.ogImage && ogData.ogImage) parsedJson.metadata.ogImage = ogData.ogImage;
      if (!parsedJson.metadata.author && ogData.author) parsedJson.metadata.author = ogData.author;
    }

    // Title validation and non-generic fallback guarantee
    if (isGenericTitle(parsedJson.title, parsedJson.metadata?.domain || ogData?.domain)) {
      if (ogData?.ogTitle && !isGenericTitle(ogData.ogTitle, ogData.domain)) {
        parsedJson.title = ogData.ogTitle;
      } else if (articleData?.title && !isGenericTitle(articleData.title, ogData?.domain)) {
        parsedJson.title = articleData.title;
      } else if (cleanTargetUrl) {
        parsedJson.title = extractTitleFromUrlSlug(cleanTargetUrl) || (ogData?.domain ? `Risorsa su ${ogData.domain}` : "Nuova Risorsa");
      }
    }

    // Summary validation and rich fallback guarantee
    if (!parsedJson.summary || isGenericTitle(parsedJson.summary, ogData?.domain) || parsedJson.summary.startsWith("http") || parsedJson.summary === trimmedInput || parsedJson.summary.length < 15) {
      if (ogData?.ogDescription) {
        parsedJson.summary = ogData.ogDescription;
      } else if (articleData?.text) {
        const firstP = articleData.text.split("\n\n").find((p: string) => p.trim().length > 30 && p !== parsedJson.title);
        if (firstP) {
          parsedJson.summary = firstP.length > 250 ? firstP.slice(0, 247) + "..." : firstP;
        }
      }
    }

    if (!parsedJson.metadata.aiExecutiveSummary && parsedJson.summary) {
      parsedJson.metadata.aiExecutiveSummary = parsedJson.summary;
    }

    if (explicitType && explicitType !== "link") {
      parsedJson.type = explicitType;
    } else if (parsedJson.type === "knowledge" || parsedJson.type === "article" || !parsedJson.type) {
      if (
        cleanInput.toLowerCase().includes("procedura operativa standard") ||
        cleanInput.toLowerCase().includes("(sop)") ||
        cleanInput.toLowerCase().startsWith("procedura:") ||
        cleanInput.toLowerCase().startsWith("sop:") ||
        cleanInput.toLowerCase().startsWith("playbook:") ||
        (parsedJson.title && parsedJson.title.toLowerCase().includes("procedura operativa standard")) ||
        parsedJson.metadata?.procedureType
      ) {
        parsedJson.type = "procedure";
        if (!parsedJson.metadata.docType) parsedJson.metadata.docType = "guide";
      }
    }

    const ghRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/i;
    const matchGh = (parsedJson.url || trimmedInput).match(ghRegex);
    if (matchGh) {
      const owner = matchGh[1];
      const repoName = matchGh[2].replace(/\.git$/, "").replace(/[#?].*$/, "");
      parsedJson.url = `https://github.com/${owner}/${repoName}`;
      if (!parsedJson.metadata.owner) parsedJson.metadata.owner = owner;
      if (!parsedJson.metadata.repoName) parsedJson.metadata.repoName = repoName;
      if (!parsedJson.metadata.installCommand) {
        parsedJson.metadata.installCommand = `git clone https://github.com/${owner}/${repoName}.git`;
      }
      if (!explicitType || explicitType === "github_repo") {
        parsedJson.type = "github_repo";
      }
      if (!parsedJson.tags.includes("github")) parsedJson.tags.push("github");
    }

    if (parsedJson.url) {
      const arxivMatch = parsedJson.url.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
      if (arxivMatch) {
        parsedJson.type = explicitType || "paper";
        parsedJson.metadata.arxivId = arxivMatch[1];
        parsedJson.metadata.pdfUrl = `https://arxiv.org/pdf/${arxivMatch[1]}.pdf`;
        if (!parsedJson.tags.includes("arxiv")) parsedJson.tags.push("arxiv");
        if (!parsedJson.tags.includes("paper")) parsedJson.tags.push("paper");
      }
    }

    if (explicitType && ["article", "github_repo", "mcp_server", "ai_skill", "knowledge", "link", "troubleshooting", "paper", "rss", "note"].includes(explicitType)) {
      parsedJson.type = explicitType;
    }

    if ((parsedJson.type === "article" || parsedJson.type === "paper") && parsedJson.url && parsedJson.url.startsWith("http") && !parsedJson.url.includes("arxiv.org")) {
      try {
        const scraped = await fetchArticleTextFromUrl(parsedJson.url, 4000);
        if (scraped.text && scraped.text.length > 150 && !parsedJson.metadata.markdownContent) {
          parsedJson.metadata.markdownContent = scraped.markdown || scraped.text;
        }
      } catch {}
    }

    parsedJson.metadata.okfVersion = "0.2";
    const docTypeRes = resolveDocType(parsedJson.type, {
      markdownContent: parsedJson.metadata.markdownContent,
      domain: parsedJson.metadata.domain,
      tags: parsedJson.tags,
    });
    parsedJson.metadata.docType = docTypeRes.docType;
    parsedJson.metadata.docTypeLocked = docTypeRes.isLocked;
    parsedJson.metadata.docTypeResolutionSource = docTypeRes.resolutionSource;

    if (!parsedJson.metadata.domain || parsedJson.metadata.domain === "general") {
      parsedJson.metadata.domain = parsedJson.metadata.siteName || (
        parsedJson.type === "github_repo" ? "Software Architecture"
        : parsedJson.type === "mcp_server" || parsedJson.type === "ai_skill" ? "Agentic Systems & AI"
        : parsedJson.type === "troubleshooting" ? "System Diagnostics & Fix"
        : "Software Architecture"
      );
    }

    if (!parsedJson.metadata.entities || parsedJson.metadata.entities.length === 0) {
      parsedJson.metadata.entities = [
        { name: parsedJson.title, type: "concept", description: parsedJson.summary?.slice(0, 100) || "Elemento centrale" },
        { name: parsedJson.metadata.domain, type: "domain", description: "Dominio di appartenenza" },
      ];
      if (parsedJson.metadata.owner && parsedJson.metadata.repoName) {
        parsedJson.metadata.entities.push({ name: parsedJson.metadata.repoName, type: "software", description: `Repository ${parsedJson.metadata.owner}/${parsedJson.metadata.repoName}` });
      }
      if (parsedJson.metadata.language) {
        parsedJson.metadata.entities.push({ name: parsedJson.metadata.language, type: "technology", description: `Linguaggio: ${parsedJson.metadata.language}` });
      }
      (parsedJson.tags || []).slice(0, 3).forEach((t: string) => {
        if (t.length > 2 && t !== "dev" && t !== "knowledge") {
          parsedJson.metadata.entities.push({ name: t.charAt(0).toUpperCase() + t.slice(1), type: "technology", description: `Tag: ${t}` });
        }
      });
    }

    if (!parsedJson.metadata.relations || parsedJson.metadata.relations.length === 0) {
      parsedJson.metadata.relations = [
        { targetTitle: "Knowledge Vault", relationType: "references", weight: 0.85, description: "Archiviazione e integrazione topologica nel Vault" }
      ];
      if (Array.isArray(existingResources) && existingResources.length > 0) {
        const myTags = (parsedJson.tags || []).map((t: string) => t.toLowerCase());
        for (const er of existingResources) {
          if (er.title !== parsedJson.title) {
            const commonTags = (er.tags || []).filter((t: string) => myTags.includes(t.toLowerCase()));
            if (commonTags.length > 0) {
              parsedJson.metadata.relations.push({
                targetTitle: er.title,
                relationType: "references",
                weight: 0.75,
                description: `Correlazione tematica: ${commonTags.join(", ")}`
              });
              break;
            }
          }
        }
      }
    }

    if (!parsedJson.metadata.markdownContent || parsedJson.metadata.markdownContent.trim().length === 0) {
      const cleanTags = Array.from(new Set(parsedJson.tags.length > 0 ? parsedJson.tags : [parsedJson.type, "okf-v0.2"]));
      const entitiesYaml = (parsedJson.metadata.entities || []).map((e: any) => `  - name: "${e.name}"\n    type: "${e.type || 'concept'}"\n    description: "${e.description || 'Entità'}"`).join("\n");
      const relationsYaml = (parsedJson.metadata.relations || []).map((r: any) => `  - target_title: "${r.targetTitle || r.target_title}"\n    relation_type: "${r.relationType || r.relation_type || 'references'}"\n    weight: ${r.weight || 0.8}\n    description: "${r.description || 'Connessione'}"`).join("\n");

      parsedJson.metadata.markdownContent = `---\nokf_version: "0.2"\ntitle: "${parsedJson.title}"\ntype: "${parsedJson.metadata.docType}"\ndomain: "${parsedJson.metadata.domain}"\ntags: ${JSON.stringify(cleanTags)}\ncreated_at: "${new Date().toISOString()}"\nentities:\n${entitiesYaml}\nrelations:\n${relationsYaml}\n---\n\n# ${parsedJson.title}\n\n> **${parsedJson.metadata.docType?.toUpperCase()} · OKF v0.2**\n> Ambito: ${parsedJson.metadata.domain}\n\n## 1. Panoramica & Sintesi\n\n${parsedJson.summary || cleanInput}\n\n${parsedJson.url ? `**URL di Riferimento:** [${parsedJson.url}](${parsedJson.url})\n\n` : ""}## 2. Specifiche Tecniche & Componenti\n\n- **Tipologia Risorsa**: \`${parsedJson.type}\`\n- **Dominio Tecnico**: \`${parsedJson.metadata.domain}\`\n- **Tipo Documento OKF**: \`${parsedJson.metadata.docType}\`\n${parsedJson.metadata.installCommand ? `- **Installazione / Clone**: \`${parsedJson.metadata.installCommand}\`\n` : ""}${parsedJson.metadata.command ? `- **Comando MCP**: \`${parsedJson.metadata.command}\`\n` : ""}\n## 3. Ontologia & Connessioni Topologiche\n\n${parsedJson.metadata.relations.map((r: any) => `- [[${r.targetTitle || r.target_title}]]: *${r.description || 'Correlazione'}* (\`${r.relationType || 'references'}\`)`).join("\n")}\n`;
    }

    if (parsedJson.type === "mcp_server") {
      parsedJson = scrubMcpConfig(parsedJson);
    }

    parsedJson.metadata.provenance = generateProvenanceRecord({
      modelUsed: isFallback ? "heuristic-fallback" : (usedModelName || "gemini-3.7-flash"),
      pipelineId: `analyze-${parsedJson.type}`,
      pipelineVersion: "1.2.0",
      promptVersion: "0.2.2",
      tokensIn: Math.round((cleanInput?.length || 500) / 4),
      tokensOut: Math.round(((parsedJson.summary?.length || 0) + (parsedJson.metadata.markdownContent?.length || 0)) / 4),
      durationMs: Date.now() - analyzeStartTime,
      contentToHash: cleanInput || parsedJson.title,
    });

    res.json({
      result: parsedJson,
      source: isFallback ? "fallback" : "gemini",
      modelUsed: isFallback ? "heuristic-fallback" : (usedModelName || "gemini-3.8-flash")
    });
  } catch (error: any) {
    console.error("Analysis handler exception:", error);
    const fallbackResult = fallbackParse(req.body.input || "", req.body.explicitType);
    res.json({ result: fallbackResult, source: "fallback-after-error", error: error?.message });
  }
});

// POST /api/generate-insights
captureRouter.post("/generate-insights", async (req, res) => {
  try {
    const { resource } = req.body;
    if (!resource || !resource.title) {
      return res.status(400).json({ error: "Resource object with title is required" });
    }

    const {
      title,
      type = "knowledge",
      summary = "",
      url = "",
      tags = [],
      metadata = {},
      rawInput = "",
    } = resource;

    const prompt = `You are a Principal Software Architect and Technology Strategist.
Analyze the following technical resource (Type: "${type}") and produce a rigorous, realistic, and objective technical evaluation:

Resource Details:
- Title: "${title}"
- Type: "${type}"
- URL: "${url || 'N/A'}"
- Summary: "${summary}"
- Tags: ${JSON.stringify(tags)}
- Type-Specific Metadata: ${JSON.stringify(metadata, null, 2)}
- Additional Context/Raw Input: """${(rawInput || metadata.markdownContent || summary).slice(0, 4000)}"""

Evaluate and generate in Italian:
1. 'useCases': Array of 2 to 4 concrete usage scenarios.
2. 'pros': Array of 2 to 4 distinct key strengths.
3. 'cons': Array of 2 to 3 genuine trade-offs or limitations.
4. 'score': An integer score from 1 to 100 representing overall utility and craftsmanship.
5. 'scoreRationale': A concise 1-2 sentence justification for the assigned score.

Return pure JSON matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        useCases: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        pros: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        cons: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        score: {
          type: Type.INTEGER,
        },
        scoreRationale: {
          type: Type.STRING,
        },
      },
      required: ["useCases", "pros", "cons", "score", "scoreRationale"],
    };

    let result: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 20000);
      if (generated?.text) {
        result = JSON.parse(generated.text);
      }
    } catch (err: any) {
      console.warn("AI generation failed for generate-insights, using fallback:", err?.message);
    }

    if (result && typeof result.score === "number") {
      result.score = Math.max(1, Math.min(100, Math.round(result.score)));
      return res.json({
        success: true,
        source: "gemini",
        insights: result,
      });
    }

    const fallbackScore = type === "mcp_server" ? 88 : type === "github_repo" ? 85 : type === "knowledge" ? 90 : type === "ai_skill" ? 86 : 82;
    const fallbackUseCases: Record<string, string[]> = {
      github_repo: [
        "Integrazione nel proprio stack di sviluppo o template di base",
        "Studio dell'architettura e pattern implementativi open-source",
        "Estensione delle funzionalità core tramite fork o plugin"
      ],
      mcp_server: [
        "Connessione come tool a Claude Desktop, Cursor o agenti autonomi",
        "Esposizione di API e dati locali o remoti al contesto LLM",
        "Automazione di flussi operativi tramite chiamate a funzione standardizzate"
      ],
      ai_skill: [
        "Inclusione nel prompt di sistema di agenti conversazionali o orchestratori",
        "Standardizzazione di comportamenti, vincoli e linee guida operative",
        "Specializzazione del modello su task verticali e formattazione rigorosa"
      ],
      article: [
        "Aggiornamento continuo su pattern architetturali e benchmark",
        "Consultazione rapida come riferimento concettuale e best practice",
        "Condivisione della conoscenza con il team di ingegneria"
      ],
      knowledge: [
        "Archiviazione secondo lo standard Open Knowledge Format (OKF v0.2)",
        "Esplorazione delle relazioni semantiche nel Grafo Topologico D3",
        "Riferimento di architettura per decisioni progettuali di lungo termine"
      ]
    };

    const fallbackPros: Record<string, string[]> = {
      github_repo: ["Codice sorgente verificabile e documentato", "Architettura modulare pronta per l'adozione", "Integrazione trasparente nell'ecosistema"],
      mcp_server: ["Conformità allo standard Model Context Protocol", "Isolamento sicuro dei comandi e delle credenziali", "Espandibilità dei tool forniti"],
      ai_skill: ["Direttive precise e vincoli ben strutturati", "Adattabilità a molteplici modelli LLM", "Riduzione delle allucinazioni tramite regole chiare"],
      article: ["Spiegazione approfondita del problema e della soluzione", "Esempi pratici e riferimenti verificati", "Facile lettura e consultazione rapida"],
      knowledge: ["Struttura formalizzata OKF con entità e relazioni", "Navigabilità nel grafo topologico", "Alta densità informativa e sintesi esecutiva"]
    };

    const fallbackCons: Record<string, string[]> = {
      github_repo: ["Richiede verifica della compatibilità delle dipendenze", "Manutenzione e aggiornamenti legati al maintainer"],
      mcp_server: ["Richiede configurazione del client MCP e variabili d'ambiente", "Dipendenza dal runtime di esecuzione locale/remoto"],
      ai_skill: ["Necessita di calibrazione in base al modello target", "Sensibile a modifiche del prompt di sistema generale"],
      article: ["Le informazioni potrebbero richiedere aggiornamenti nel tempo", "Implementazione pratica a carico dello sviluppatore"],
      knowledge: ["Richiede cura manuale continua per mantenere aggiornati i collegamenti"]
    };

    return res.json({
      success: true,
      source: "fallback",
      insights: {
        useCases: fallbackUseCases[type] || fallbackUseCases.knowledge,
        pros: fallbackPros[type] || fallbackPros.knowledge,
        cons: fallbackCons[type] || fallbackCons.knowledge,
        score: fallbackScore,
        scoreRationale: `Valutazione calcolata per ${title} (${type}) basata su rilevanza architetturale e maturità dei pattern applicati.`,
      },
    });
  } catch (error: any) {
    console.error("Generate insights error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate insights" });
  }
});

// POST /api/translate-resource
captureRouter.post("/translate-resource", async (req, res) => {
  try {
    const { resource } = req.body;
    if (!resource || !resource.title) {
      return res.status(400).json({ error: "Resource object with title is required" });
    }

    const {
      title = "",
      type = "article",
      summary = "",
      url = "",
      rawInput = "",
      metadata = {},
    } = resource;

    let fullContent = metadata.markdownContent || rawInput || "";
    let fetchedOriginalContent = "";

    if (url && url.startsWith("http") && (!fullContent || fullContent.trim().length < 200)) {
      try {
        console.log(`[Translate] Fetching full article text from: ${url}`);
        const scraped = await fetchArticleTextFromUrl(url, 6500);
        if (scraped.text && scraped.text.length > 100) {
          fetchedOriginalContent = scraped.markdown || scraped.text;
          fullContent = fetchedOriginalContent;
        }
      } catch (err: any) {
        console.warn(`[Translate] Could not scrape full body from ${url}:`, err?.message);
      }
    }

    if (!fullContent || fullContent.trim().length === 0) {
      fullContent = summary || title;
    }

    const prompt = `You are a Principal Technical Translator, Software Localization Specialist, and Technical Editor.
Translate the following technical resource (Type: "${type}") into natural, fluent, comprehensive, and professional Italian.

Translation Rules:
1. Technical Fidelity: Keep all code snippets, bash commands, JSON blocks, YAML, API endpoints, variable names, keywords, and library names unchanged.
2. Complete Article Translation: If an article body or documentation text is provided, translate the ENTIRE text in rich Markdown.
3. Structure: Maintain complete Markdown formatting.
4. Quality: Produce an authoritative Italian text.
5. Translate:
   - 'translatedTitle': Italian version of the title.
   - 'translatedSummary': Comprehensive Italian translation of the summary.
   - 'translatedContent': Full, detailed Italian translation of the entire article text.

Resource Details:
- Title: "${title}"
- Type: "${type}"
- URL: "${url || 'N/A'}"
- Summary: """${summary}"""
- Content: """${fullContent.slice(0, 30000)}"""

Return pure JSON matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        translatedTitle: { type: Type.STRING },
        translatedSummary: { type: Type.STRING },
        translatedContent: { type: Type.STRING },
        language: { type: Type.STRING },
      },
      required: ["translatedTitle", "translatedSummary", "translatedContent"],
    };

    let result: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 30000);
      if (generated?.text) {
        result = JSON.parse(generated.text);
      }
    } catch (err: any) {
      console.warn("AI generation failed for translate-resource, using fallback:", err?.message);
    }

    if (result && result.translatedSummary) {
      return res.json({
        success: true,
        source: "gemini",
        fetchedOriginalContent: fetchedOriginalContent || undefined,
        translation: {
          translatedTitle: result.translatedTitle || title,
          translatedSummary: result.translatedSummary,
          translatedContent: result.translatedContent || fullContent,
          language: "it",
          translatedAt: new Date().toISOString(),
        },
      });
    }

    return res.json({
      success: true,
      source: "fallback",
      fetchedOriginalContent: fetchedOriginalContent || undefined,
      translation: {
        translatedTitle: `[IT] ${title}`,
        translatedSummary: summary ? `[Traduzione automatica locale]\n${summary}` : "Nessun sommario disponibile.",
        translatedContent: fullContent ? `## Traduzione di "${title}"\n\n${fullContent}` : "",
        language: "it",
        translatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Translate resource error:", error);
    res.status(500).json({ error: error?.message || "Failed to translate resource" });
  }
});

function cleanMarkdownForIntelligence(text: string): string {
  if (!text) return "";
  return text
    // Remove markdown image embeds like ![alt](url) or [![badge](url)](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Remove empty markdown links like [ ](url) or [  ](url)
    .replace(/\[\s*\]\([^)]*\)/g, "")
    // Convert markdown links [text](url) to just text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Remove raw URLs
    .replace(/https?:\/\/[^\s)\]]+/g, "")
    // Remove HTML tags
    .replace(/<[^>]+>/g, " ")
    // Remove markdown header markers #, ##, ###
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italics
    .replace(/[*_]{1,3}/g, "")
    // Remove divider or anchor relics like #--- or ---
    .replace(/^[-_]{3,}\s*$/gm, "")
    .replace(/#+[-_]{2,}/g, "")
    // Normalize spaces and newlines
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

// POST /api/summarize-resource
captureRouter.post("/summarize-resource", async (req, res) => {
  try {
    const { resource } = req.body;
    if (!resource || !resource.title) {
      return res.status(400).json({ error: "Resource object with title is required" });
    }

    let {
      title = "",
      type = "article",
      summary = "",
      url = "",
      tags = [],
      rawInput = "",
      metadata = {},
    } = resource;

    const isCorruptedText = (s: string) =>
      !s ||
      s.includes("Il parser ha tentato di associare lo schema OKF") ||
      s.includes("I link web non costituiscono documenti di specifica tecnica OKF") ||
      s.includes("failed_as_link") ||
      s.startsWith("Collegamento web a ");

    let cleanSummary = isCorruptedText(summary) ? "" : summary;
    let cleanTitle = title;
    if (
      !cleanTitle ||
      cleanTitle.toLowerCase() === "collegamento web" ||
      cleanTitle.toLowerCase() === "nuova risorsa" ||
      cleanTitle.toLowerCase() === "medium" ||
      cleanTitle.toLowerCase().includes("levelup.gitconnected.com")
    ) {
      cleanTitle = "";
    }

    let fullContent = metadata.markdownContent || "";
    if (isCorruptedText(fullContent)) {
      fullContent = "";
    }

    let extractedTitle = "";
    let extractedDesc = "";
    let extractedAuthor = "";

    const targetUrl = url || (rawInput && rawInput.startsWith("http") ? rawInput.trim() : "");
    if (targetUrl && (!fullContent || fullContent.length < 300 || !cleanTitle || !cleanSummary)) {
      try {
        const [articleData, ogData] = await Promise.all([
          fetchArticleTextFromUrl(targetUrl, 7000),
          fetchOpenGraphMetadata(targetUrl, 4000),
        ]);

        if (articleData?.title && articleData.title.toLowerCase() !== "medium") {
          extractedTitle = articleData.title;
        } else if (ogData?.ogTitle) {
          extractedTitle = ogData.ogTitle;
        }

        if (ogData?.ogDescription) {
          extractedDesc = ogData.ogDescription;
        }
        if (ogData?.author) {
          extractedAuthor = ogData.author;
        }

        if (articleData?.text && articleData.text.length > 100) {
          fullContent = articleData.text;
        } else if (articleData?.markdown && articleData.markdown.length > 100) {
          fullContent = articleData.markdown;
        } else if (extractedDesc) {
          fullContent = `${extractedTitle ? `# ${extractedTitle}\n\n` : ""}${extractedDesc}`;
        }
      } catch (err) {
        // Continue with available data
      }
    }

    if (extractedTitle && (
      !cleanTitle ||
      cleanTitle.toLowerCase().includes("wiht") ||
      cleanTitle.toLowerCase() === "collegamento web" ||
      cleanTitle.toLowerCase() === "nuova risorsa" ||
      cleanTitle.toLowerCase() === "medium" ||
      extractedTitle.toLowerCase() === cleanTitle.toLowerCase().replace(/\bwiht\b/g, "with")
    )) {
      cleanTitle = extractedTitle;
    } else if (!cleanTitle) {
      cleanTitle = extractedTitle || title || "Articolo Tecnico";
    }
    if (!cleanSummary && extractedDesc) {
      cleanSummary = extractedDesc;
    }

    const typeLabel =
      type === "github_repo"
        ? "Repository GitHub"
        : type === "mcp_server"
        ? "Server MCP"
        : type === "ai_skill"
        ? "AI Skill"
        : type === "knowledge"
        ? "Documento OKF"
        : "Articolo Tecnico";

    const prompt = `You are a Principal Technology Analyst and Executive Editor.
Create a high-density, structured Executive Brief in Italian for this technical resource.

Resource Information:
- Title: "${cleanTitle}"
- Type: "${typeLabel}"
- URL: "${targetUrl || 'N/A'}"
- Author: "${extractedAuthor || metadata.author || 'N/A'}"
- Tags: ${JSON.stringify(tags)}
- Context / Subtitle: """${cleanSummary}"""
- Full Body / Content: """${cleanMarkdownForIntelligence(fullContent).slice(0, 12000)}"""

Produce the following in Italian:
1. 'executiveSummary': A 2-4 sentence executive overview explaining the core architecture, significance, and technical methodology.
2. 'keyTakeaways': Array of 3 to 6 practical technical bullet points.
3. 'targetAudience': A concise definition of target audience.
4. 'actionItems': Array of 2 to 4 immediate actionable next steps.
5. 'estimatedReadingTime': Estimated reading time string (e.g., '6 minuti').

Return pure JSON matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        executiveSummary: { type: Type.STRING },
        keyTakeaways: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        targetAudience: { type: Type.STRING },
        actionItems: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        estimatedReadingTime: { type: Type.STRING },
      },
      required: ["executiveSummary", "keyTakeaways", "targetAudience", "actionItems"],
    };

    let result: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 20000);
      if (generated?.text) {
        result = JSON.parse(generated.text);
      }
    } catch (err: any) {
      // Non-fatal, gracefully caught
    }

    if (result && result.executiveSummary) {
      const preferredCleanSummary =
        !cleanSummary || cleanSummary.length < 90 || isCorruptedText(cleanSummary)
          ? result.executiveSummary.slice(0, 320)
          : cleanSummary;

      return res.json({
        success: true,
        source: "gemini",
        cleanedTitle: cleanTitle,
        cleanedSummary: preferredCleanSummary,
        extractedContent: fullContent || undefined,
        summaryResult: {
          executiveSummary: result.executiveSummary,
          keyTakeaways: result.keyTakeaways || [],
          targetAudience: result.targetAudience || "Sviluppatori, Architetti Software e Specialisti AI",
          actionItems: result.actionItems || [],
          estimatedReadingTime: result.estimatedReadingTime || "5 minuti",
          summarizedAt: new Date().toISOString(),
        },
      });
    }

    // Heuristic Fallback (Zero-latency when Gemini quota is in cooldown or offline)
    const cleanedText = cleanMarkdownForIntelligence(fullContent);
    const contentParagraphs = cleanedText
      .split("\n\n")
      .map((p) => p.trim())
      .filter((p) => {
        if (p.length < 35) return false;
        if (p.startsWith("[") || p.startsWith("#") || p.startsWith("- [ ]")) return false;
        const lower = p.toLowerCase();
        if (
          lower.includes("sign up") ||
          lower.includes("sitemap") ||
          lower.includes("cookie") ||
          lower.includes("all rights reserved") ||
          lower.includes("licensed under") ||
          lower.includes("contributing guidelines") ||
          lower.includes("trendshift.io") ||
          lower.includes("releases")
        ) {
          return false;
        }
        return true;
      });

    const dynamicTakeaways: string[] = [];
    if (extractedDesc && extractedDesc.length > 25) {
      const cleanDesc = extractedDesc.replace(/^[-*•\d.]+\s*/, "").trim();
      dynamicTakeaways.push(cleanDesc.length > 220 ? cleanDesc.slice(0, 217) + "..." : cleanDesc);
    }
    for (const p of contentParagraphs) {
      if (dynamicTakeaways.length >= 5) break;
      const cleanP = p.replace(/^[-*•\d.]+\s*/, "").trim();
      if (
        cleanP.length > 30 &&
        cleanP !== cleanTitle &&
        !dynamicTakeaways.some((t) => t.toLowerCase().includes(cleanP.slice(0, 30).toLowerCase()))
      ) {
        dynamicTakeaways.push(cleanP.length > 220 ? cleanP.slice(0, 217) + "..." : cleanP);
      }
    }
    if (dynamicTakeaways.length < 3) {
      if (type === "github_repo") {
        dynamicTakeaways.push(
          `Architettura applicativa e implementazione open-source per ${cleanTitle}.`,
          "Pattern ingegneristici modulari orientati a prestazioni, affidabilità e manutenibilità.",
          "Possibilità di esecuzione e integrazione locale o nel proprio stack infrastrutturale."
        );
      } else {
        dynamicTakeaways.push(
          `Analisi tecnica approfondita e principi operativi per ${cleanTitle}.`,
          "Metodologie ingegneristiche e best practice applicabili nel Knowledge Vault.",
          "Mappatura delle entità e relazioni concettuali nel Grafo D3."
        );
      }
    }

    let execBrief = "";
    if (extractedDesc) {
      execBrief = `${cleanTitle}: ${extractedDesc}`;
      if (contentParagraphs.length > 0 && contentParagraphs[0] !== extractedDesc) {
        const extraP = contentParagraphs[0].replace(/^[-*•\d.]+\s*/, "").trim();
        if (extraP.length > 30 && !execBrief.toLowerCase().includes(extraP.slice(0, 25).toLowerCase())) {
          execBrief += ` ${extraP}`;
        }
      }
    } else if (contentParagraphs.length > 0) {
      execBrief = `${cleanTitle}: ${contentParagraphs.slice(0, 2).map((p) => p.replace(/^[-*•\d.]+\s*/, "").trim()).join(" ")}`;
    } else {
      execBrief = `${cleanTitle} è una risorsa tecnica di tipo ${typeLabel}. Fornisce specifiche implementative, architettura applicativa e metodologie operative dettagliate.`;
    }

    const titleAndTags = `${cleanTitle} ${tags.join(" ")} ${type}`.toLowerCase();
    let targetAudience = "Ingegneri del software, architetti di sistema e team tecnici";
    if (
      titleAndTags.includes("meet") ||
      titleAndTags.includes("whisper") ||
      titleAndTags.includes("speech") ||
      titleAndTags.includes("audio") ||
      titleAndTags.includes("transcript")
    ) {
      targetAudience = "Professionisti, team aziendali e sviluppatori che necessitano di soluzioni per meeting, trascrizione audio e produttività nel rispetto della privacy";
    } else if (
      titleAndTags.includes("security") ||
      titleAndTags.includes("vulnerab") ||
      titleAndTags.includes("auth")
    ) {
      targetAudience = "Security engineer, specialisti di cybersecurity e devops";
    } else if (type === "github_repo") {
      targetAudience = "Sviluppatori software, ingegneri e maintainer di progetti open-source";
    }

    let actionItems: string[] = [];
    if (type === "github_repo") {
      actionItems = [
        `Esaminare la documentazione ufficiale e i requisiti di sistema nel repository ${cleanTitle}`,
        "Testare l'installazione o l'esecuzione in locale tramite release precompilate o compilazione dai sorgenti",
        "Valutare l'integrazione o l'adozione delle funzionalità core nei flussi di lavoro del team"
      ];
    } else {
      actionItems = [
        `Esaminare i dettagli tecnici e le specifiche della risorsa ${cleanTitle}`,
        "Condividere o archiviare le note e le considerazioni pratiche nel Knowledge Vault",
        "Pianificare l'eventuale sperimentazione o adozione delle metodologie illustrate"
      ];
    }

    const wordCount = fullContent.split(/\s+/).filter(Boolean).length;
    const estTime = Math.max(2, Math.round(wordCount / 180)) + " minuti";

    const preferredFallbackSummary =
      !cleanSummary || cleanSummary.length < 90 || isCorruptedText(cleanSummary)
        ? (extractedDesc || execBrief.slice(0, 320))
        : cleanSummary;

    return res.json({
      success: true,
      source: "fallback",
      cleanedTitle: cleanTitle,
      cleanedSummary: preferredFallbackSummary,
      extractedContent: fullContent || undefined,
      summaryResult: {
        executiveSummary: execBrief,
        keyTakeaways: dynamicTakeaways.slice(0, 5),
        targetAudience,
        actionItems,
        estimatedReadingTime: estTime,
        summarizedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Summarize resource error:", error);
    res.status(500).json({ error: error?.message || "Failed to summarize resource" });
  }
});

// POST /api/github/scan-okf - Scan GitHub repository for Markdown files & OKF v0.2 specifications
captureRouter.post("/github/scan-okf", async (req, res) => {
  try {
    const { repo, branch, subpath, maxFiles, existingResources } = req.body;
    if (!repo || typeof repo !== "string" || repo.trim().length === 0) {
      return res.status(400).json({ error: "Il parametro 'repo' è obbligatorio (es. 'owner/repo' o URL GitHub)." });
    }

    const result = await scanGitHubRepositoryOKF({
      repoInput: repo,
      branch: branch ? String(branch).trim() : undefined,
      subpath: subpath ? String(subpath).trim() : undefined,
      maxFiles: typeof maxFiles === "number" ? maxFiles : 35,
      existingResources: Array.isArray(existingResources) ? existingResources : [],
    });

    res.json(result);
  } catch (error: any) {
    console.error("GitHub OKF scan error:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Errore imprevisto durante la scansione del repository GitHub.",
    });
  }
});

// POST /api/suggest-tags - Machine Learning & Generative Semantic Tag Suggestion Engine
captureRouter.post("/suggest-tags", async (req, res) => {
  try {
    const {
      title = "",
      summary = "",
      content = "",
      type = "article",
      domain = "",
      url = "",
      existingTags = [],
      vaultTags = [],
      entities = [],
      troubleshooting,
    } = req.body;

    if (!title && !summary && !content) {
      return res.status(400).json({
        success: false,
        error: "Almeno un campo informativo (titolo, sommario o contenuto) è necessario per l'analisi ML.",
      });
    }

    // Step 1: Execute fast local NLP/TF-IDF statistical analysis as baseline
    const localSuggestions = extractMlTagsLocally({
      title,
      summary,
      content,
      type,
      domain,
      existingTags,
      vaultTags,
      entities,
      troubleshooting,
    });

    // Step 2: Attempt Deep Semantic Analysis using Gemini AI with fallback models
    const prompt = `You are a Principal Ontologist, Machine Learning Classifier, and Knowledge Architect.
Your task is to analyze the following Knowledge Vault resource and recommend high-precision, relevant tags.

RESOURCE DETAILS:
- Title: "${title}"
- Type: ${type}
- Domain: "${domain || "Not specified"}"
- URL / Reference: "${url || "None"}"
- Summary: "${summary ? summary.slice(0, 1500) : "None"}"
- Content / Excerpt:
"""
${(content || summary || title).slice(0, 8000)}
"""
${entities && entities.length > 0 ? `- OKF Entities: ${JSON.stringify(entities)}` : ""}
${troubleshooting?.affectedSystem ? `- Affected System: ${troubleshooting.affectedSystem}` : ""}
${troubleshooting?.rootCause ? `- Root Cause: ${troubleshooting.rootCause}` : ""}

EXISTING TAGS ON RESOURCE (do NOT duplicate these, suggest new complementary tags):
${JSON.stringify(existingTags)}

EXISTING VAULT TAXONOMY TAGS (re-use matching canonical tags where relevant to maintain cluster coherence):
${JSON.stringify((vaultTags || []).slice(0, 60))}

REQUIREMENTS FOR ML TAG RECOMMENDATION:
1. Provide between 5 and 10 highly relevant, specific technical tags.
2. Format: Strictly lowercase, kebab-case (e.g. "model-context-protocol", "vector-database", "okf-v0.2", "typescript", "oauth2").
3. Assign a realistic confidence score (integer 0 to 100) based on content relevance and topic centrality.
4. Categorize each tag into: "technology" | "concept" | "framework" | "domain" | "methodology" | "system" | "problem".
5. Relevance: "high" (>= 80), "medium" (60-79), or "low" (< 60).
6. Provide a short, precise rationale in Italian explaining why this tag was inferred from the content.
7. Avoid overly generic filler tags like "article", "doc", "web", "misc", "info".

Return pure JSON strictly complying with the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        suggestedTags: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              tag: { type: Type.STRING },
              confidence: { type: Type.INTEGER },
              category: {
                type: Type.STRING,
                enum: ["technology", "concept", "framework", "domain", "methodology", "system", "problem"],
              },
              relevance: { type: Type.STRING, enum: ["high", "medium", "low"] },
              rationale: { type: Type.STRING },
            },
            required: ["tag", "confidence", "category", "relevance", "rationale"],
          },
        },
        primaryDomain: { type: Type.STRING },
      },
      required: ["suggestedTags"],
    };

    let geminiParsed: any = null;
    let modelUsed = "";

    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 25000, "/api/suggest-tags");
      if (generated?.text) {
        geminiParsed = JSON.parse(generated.text);
        modelUsed = generated.modelUsed;
      }
    } catch (aiErr: any) {
      console.warn("[TagML] Gemini inference failed, falling back to local NLP engine:", aiErr?.message);
    }

    // Step 3: Fusion of Gemini results with local NLP and Vault taxonomy
    const existingSet = new Set((existingTags || []).map((t: string) => normalizeTag(t)));
    const mergedMap = new Map<string, RawTagSuggestion>();

    // If Gemini succeeded, populate with Gemini results
    if (geminiParsed?.suggestedTags && Array.isArray(geminiParsed.suggestedTags)) {
      geminiParsed.suggestedTags.forEach((item: any) => {
        const norm = normalizeTag(item.tag);
        if (norm && !existingSet.has(norm)) {
          const confidence = Math.min(99, Math.max(40, Number(item.confidence) || 75));
          mergedMap.set(norm, {
            tag: norm,
            confidence,
            category: item.category || "concept",
            relevance: confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low",
            rationale: item.rationale || "Inferenza semantica generativa",
            source: "gemini",
          });
        }
      });
    }

    // Incorporate local NLP suggestions (fill in gaps or boost confidence if both agree)
    localSuggestions.forEach((local) => {
      const norm = normalizeTag(local.tag);
      if (!norm || existingSet.has(norm)) return;

      const existing = mergedMap.get(norm);
      if (existing) {
        // Multi-engine agreement bonus!
        existing.confidence = Math.min(99, existing.confidence + 5);
        existing.rationale = `${existing.rationale} • Confermato da analisi statistica NLP`;
      } else if (mergedMap.size < 14) {
        mergedMap.set(norm, local);
      }
    });

    const finalSuggestions = Array.from(mergedMap.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 12);

    return res.json({
      success: true,
      source: geminiParsed ? "gemini" : "local_nlp",
      modelUsed: geminiParsed ? modelUsed : "TF-IDF / C-Value Heuristic",
      suggestedTags: finalSuggestions,
      count: finalSuggestions.length,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Tag suggestion error:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Errore imprevisto durante l'analisi e suggerimento dei tag.",
    });
  }
});

// -------------------------------------------------------------
// RSS & ATOM FEED READER PROXY ENDPOINTS
// -------------------------------------------------------------
captureRouter.post("/fetch-feed-items", async (req, res) => {
  try {
    const { feedUrl, limit } = req.body;
    if (!feedUrl || typeof feedUrl !== "string") {
      return res.status(400).json({ success: false, error: "Parametro 'feedUrl' obbligatorio." });
    }

    const feedData = await fetchFeedData(feedUrl, typeof limit === "number" ? limit : 40);
    return res.json({
      success: true,
      feed: feedData,
    });
  } catch (err: any) {
    console.error("[fetch-feed-items] Error:", err.message);
    return res.status(500).json({
      success: false,
      error: err?.message || "Impossibile recuperare il feed RSS.",
    });
  }
});

captureRouter.post("/discover-feed", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, error: "Parametro 'url' obbligatorio." });
    }

    const discoveredUrl = await discoverRssFeedUrl(url);
    return res.json({
      success: true,
      discovered: Boolean(discoveredUrl),
      feedUrl: discoveredUrl,
    });
  } catch (err: any) {
    console.error("[discover-feed] Error:", err.message);
    return res.status(500).json({
      success: false,
      error: err?.message || "Errore durante il rilevamento del feed RSS.",
    });
  }
});

// -------------------------------------------------------------
// BATCH VAULT MIGRATION ARCHIVE (ZIP) ENDPOINT
// -------------------------------------------------------------
captureRouter.post("/import-vault-archive", async (req, res) => {
  try {
    const { base64Data, fileName = "vault-archive.zip" } = req.body;
    if (!base64Data || typeof base64Data !== "string") {
      return res.status(400).json({
        success: false,
        error: "Parametro 'base64Data' mancante o non valido per l'archivio ZIP.",
      });
    }

    const dataPart = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
    let cleanBase64 = dataPart.replace(/[^A-Za-z0-9+/=]/g, "");
    while (cleanBase64.length % 4 !== 0) {
      cleanBase64 += "=";
    }

    const zipBuffer = Buffer.from(cleanBase64, "base64");
    const migrationResult = parseVaultZipArchive(zipBuffer, fileName);

    return res.json(migrationResult);
  } catch (err: any) {
    console.error("[import-vault-archive] Error:", err.message);
    return res.status(500).json({
      success: false,
      error: err?.message || "Errore durante l'elaborazione dell'archivio ZIP.",
    });
  }
});


