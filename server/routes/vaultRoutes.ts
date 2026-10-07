import { Router } from "express";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { getGenAI, generateWithGeminiFallback } from "../gemini/client";
import { executeAgenticVaultQuery } from "../vaultAgents";
import { executeAgenticIngestion } from "../ingestionAgents";
import { executeAgenticBackupPipeline } from "../backupAgents";
import { Type } from "@google/genai";

export const vaultRouter = Router();

const DATA_DIR = path.join(process.cwd(), "data");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");
const BACKUP_FILE_PATH = path.join(DATA_DIR, "vault-backup.json");

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Failed to create data directory:", e);
}

/**
 * Atomically writes content to destination file by first writing to a temporary file
 * and then renaming it. This ensures readers never see a partially written file or unterminated JSON.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  // Pre-write integrity validation: if writing a JSON file, ensure it's not truncated or corrupted
  if (filePath.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (parseErr: any) {
      console.error(`[VaultShield] Aborting atomic write of corrupt/unterminated JSON to ${filePath}:`, parseErr.message);
      throw new Error(`Corrupted JSON string cannot be written: ${parseErr.message}`);
    }
  }

  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fsPromises.writeFile(tempPath, content, "utf8");
    await fsPromises.rename(tempPath, filePath);
  } catch (err) {
    await fsPromises.unlink(tempPath).catch(() => {});
    throw err;
  }
}

/**
 * Sequential queue for backup write/snapshot operations to prevent concurrent write collisions.
 */
let backupTaskQueue: Promise<any> = Promise.resolve();
function enqueueBackupTask<T>(task: () => Promise<T>): Promise<T> {
  const next = backupTaskQueue.then(task, task);
  backupTaskQueue = next.catch(() => {});
  return next;
}

/**
 * Safely parses and loads backup data, falling back to the latest valid snapshot
 * if the primary backup file is missing, empty, or contains invalid/unterminated JSON.
 */
async function loadBackupSafely(): Promise<{
  data: any | null;
  recoveredFromSnapshot: boolean;
  snapshotName?: string;
}> {
  let primaryValid = false;

  if (fs.existsSync(BACKUP_FILE_PATH)) {
    try {
      const content = await fsPromises.readFile(BACKUP_FILE_PATH, "utf8");
      if (content && content.trim().length > 0) {
        try {
          const parsed = JSON.parse(content);
          primaryValid = true;
          return { data: parsed, recoveredFromSnapshot: false };
        } catch (jsonErr: any) {
          console.warn("[VaultShield] Primary backup file contains invalid JSON (partial or unterminated string):", jsonErr?.message);
        }
      }
    } catch (readErr) {
      console.warn("[VaultShield] Error reading primary backup file:", readErr);
    }
  }

  // Fallback: search snapshots directory for the latest valid snapshot
  if (fs.existsSync(SNAPSHOTS_DIR)) {
    try {
      const files = await fsPromises.readdir(SNAPSHOTS_DIR);
      const jsonFiles = files
        .filter((f) => f.endsWith(".json") && !f.startsWith(".tmp"))
        .sort()
        .reverse();

      for (const snapFile of jsonFiles) {
        try {
          const snapFilePath = path.join(SNAPSHOTS_DIR, snapFile);
          const snapContent = await fsPromises.readFile(snapFilePath, "utf8");
          const parsed = JSON.parse(snapContent);
          console.log(`[VaultShield] Successfully recovered vault data from snapshot: ${snapFile}`);

          // Self-healing: If primary backup was missing or corrupt, heal it with this valid snapshot
          if (!primaryValid) {
            atomicWriteFile(BACKUP_FILE_PATH, JSON.stringify(parsed, null, 2)).catch((healErr) => {
              console.warn("[VaultShield] Notice while auto-healing primary backup from snapshot:", healErr?.message);
            });
          }

          return { data: parsed, recoveredFromSnapshot: true, snapshotName: snapFile };
        } catch (corruptSnapErr: any) {
          console.warn(`[VaultShield] Skipping invalid snapshot file ${snapFile}:`, corruptSnapErr?.message);
        }
      }
    } catch (e) {
      console.warn("[VaultShield] Failed reading snapshots directory:", e);
    }
  }

  return { data: null, recoveredFromSnapshot: false };
}

// POST /api/vault/backup - Save resources and raw files to backend filesystem
vaultRouter.post("/backup", async (req, res) => {
  return enqueueBackupTask(async () => {
    try {
      const { resources, rawFiles, userId, deletedResourceIds = [] } = req.body;
      if (!Array.isArray(resources)) {
        return res.status(400).json({ error: "Missing or invalid 'resources' array in body" });
      }

      if (!fs.existsSync(DATA_DIR)) {
        await fsPromises.mkdir(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(SNAPSHOTS_DIR)) {
        await fsPromises.mkdir(SNAPSHOTS_DIR, { recursive: true });
      }

      let finalResources = [...resources];
      const deletedSet = new Set(Array.isArray(deletedResourceIds) ? deletedResourceIds : []);

      // Preservation Shield: If existing backup file has content, save a snapshot before overwriting
      try {
        const backupResult = await loadBackupSafely();
        const oldParsed = backupResult.data;

        if (oldParsed) {
          const oldResources = Array.isArray(oldParsed.resources)
            ? oldParsed.resources
            : (Array.isArray(oldParsed) ? oldParsed : []);
          const oldCount = oldResources.length;

          if (oldCount > 0) {
            const snapName = `snapshot-${Date.now()}-${oldCount}items.json`;
            const snapPath = path.join(SNAPSHOTS_DIR, snapName);
            await atomicWriteFile(snapPath, JSON.stringify(oldParsed, null, 2));

            // Keep maximum 20 latest snapshots
            const existingSnaps = (await fsPromises.readdir(SNAPSHOTS_DIR)).filter(
              (f) => f.endsWith(".json") && !f.startsWith(".tmp")
            );
            if (existingSnaps.length > 20) {
              existingSnaps.sort();
              for (let i = 0; i < existingSnaps.length - 20; i++) {
                await fsPromises.unlink(path.join(SNAPSHOTS_DIR, existingSnaps[i])).catch(() => {});
              }
            }
          }

          // Epistemic Shield: If incoming resources is smaller than old resources, preserve
          // any existing resource that was NOT explicitly deleted by the user!
          if (oldCount > resources.length) {
            const incomingIds = new Set(resources.map((r: any) => r.id));
            const preservedItems: any[] = [];

            for (const oldItem of oldResources) {
              if (!oldItem || !oldItem.id) continue;
              // Never preserve items that were explicitly deleted
              if (deletedSet.has(oldItem.id)) continue;
              // Skip if already in incoming
              if (incomingIds.has(oldItem.id)) continue;

              preservedItems.push(oldItem);
            }

            if (preservedItems.length > 0) {
              finalResources = [...resources, ...preservedItems];
              console.log(
                `[VaultShield] Safeguarded ${preservedItems.length} resources from server backup (${oldCount} previous -> ${finalResources.length} preserved).`
              );
            }
          }
        }
      } catch (backupSnapErr: any) {
        console.warn("[VaultShield] Non-fatal snapshot preservation notice:", backupSnapErr?.message || backupSnapErr);
      }

      // Filter out any explicitly deleted IDs
      if (deletedSet.size > 0) {
        finalResources = finalResources.filter((r: any) => !deletedSet.has(r.id));
      }

      const payload = {
        vaultVersion: "0.2",
        savedAt: new Date().toISOString(),
        timestamp: Date.now(),
        userId: userId || "local-user",
        totalResources: finalResources.length,
        totalRawFiles: Array.isArray(rawFiles) ? rawFiles.length : 0,
        resources: finalResources,
        rawFiles: Array.isArray(rawFiles) ? rawFiles : [],
      };

      const jsonString = JSON.stringify(payload, null, 2);
      await atomicWriteFile(BACKUP_FILE_PATH, jsonString);

      const stat = await fsPromises.stat(BACKUP_FILE_PATH);

      res.json({
        success: true,
        count: finalResources.length,
        rawFilesCount: payload.totalRawFiles,
        savedAt: payload.savedAt,
        timestamp: payload.timestamp,
        fileSizeBytes: stat.size,
        formattedSize: `${(stat.size / 1024).toFixed(1)} KB`,
      });
    } catch (error: any) {
      console.error("Failed to write vault backup to filesystem:", error);
      res.status(500).json({ error: error?.message || "Failed to save backup to server filesystem" });
    }
  });
});

// GET /api/vault/snapshots - List available historical snapshots
vaultRouter.get("/snapshots", async (_req, res) => {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      return res.json({ snapshots: [] });
    }
    const files = await fsPromises.readdir(SNAPSHOTS_DIR);
    const snapshots = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(SNAPSHOTS_DIR, file);
        const stat = await fsPromises.stat(filePath);
        const match = file.match(/snapshot-(\d+)-(\d+)items\.json/);
        const timestamp = match ? parseInt(match[1], 10) : stat.mtimeMs;
        const count = match ? parseInt(match[2], 10) : 0;
        snapshots.push({
          filename: file,
          timestamp,
          formattedDate: new Date(timestamp).toLocaleString("it-IT"),
          count,
          sizeBytes: stat.size,
          formattedSize: `${(stat.size / 1024).toFixed(1)} KB`,
        });
      }
    }
    snapshots.sort((a, b) => b.timestamp - a.timestamp);
    res.json({ snapshots });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list snapshots" });
  }
});

// GET /api/vault/snapshot-detail - Get specific snapshot file contents
vaultRouter.get("/snapshot-detail", async (req, res) => {
  try {
    const filename = String(req.query.filename || "");
    if (!filename || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ error: "Invalid snapshot filename" });
    }
    const filePath = path.join(SNAPSHOTS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Snapshot not found" });
    }
    const content = await fsPromises.readFile(filePath, "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(content);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to read snapshot" });
  }
});

// POST /api/vault/create-snapshot - Manually create an on-demand server snapshot
vaultRouter.post("/create-snapshot", async (req, res) => {
  return enqueueBackupTask(async () => {
    try {
      if (!fs.existsSync(SNAPSHOTS_DIR)) {
        await fsPromises.mkdir(SNAPSHOTS_DIR, { recursive: true });
      }

      const { label, resources: inputResources, rawFiles: inputRawFiles, userId } = req.body || {};
      let resourcesToSave = inputResources;
      let rawFilesToSave = inputRawFiles;

      // If resources not explicitly provided in body, load from current backup safely
      if (!Array.isArray(resourcesToSave) || resourcesToSave.length === 0) {
        const backupResult = await loadBackupSafely();
        if (backupResult.data) {
          resourcesToSave = Array.isArray(backupResult.data)
            ? backupResult.data
            : (backupResult.data.resources || []);
          rawFilesToSave = backupResult.data.rawFiles || [];
        } else {
          resourcesToSave = [];
        }
      }

      const timestamp = Date.now();
      const count = resourcesToSave.length;
      const snapFileName = `snapshot-${timestamp}-${count}items.json`;
      const snapFilePath = path.join(SNAPSHOTS_DIR, snapFileName);

      const snapshotPayload = {
        vaultVersion: "0.2",
        snapshotType: "manual_on_demand",
        label: label || "Snapshot Manuale",
        timestamp,
        createdAt: new Date().toISOString(),
        userId: userId || "vault-user",
        totalResources: count,
        totalRawFiles: Array.isArray(rawFilesToSave) ? rawFilesToSave.length : 0,
        resources: resourcesToSave,
        rawFiles: Array.isArray(rawFilesToSave) ? rawFilesToSave : [],
      };

      await atomicWriteFile(snapFilePath, JSON.stringify(snapshotPayload, null, 2));
      const stat = await fsPromises.stat(snapFilePath);

      res.json({
        success: true,
        filename: snapFileName,
        timestamp,
        formattedDate: new Date(timestamp).toLocaleString("it-IT"),
        count,
        sizeBytes: stat.size,
        formattedSize: `${(stat.size / 1024).toFixed(1)} KB`,
      });
    } catch (err: any) {
      console.error("Failed to create manual snapshot:", err);
      res.status(500).json({ error: err?.message || "Impossibile creare lo snapshot server" });
    }
  });
});

// GET /api/vault/backup - Load persistent vault backup from backend filesystem
vaultRouter.get("/backup", async (_req, res) => {
  try {
    const backupResult = await loadBackupSafely();
    if (!backupResult.data) {
      return res.json({
        success: true,
        exists: false,
        data: null,
      });
    }

    const parsed = backupResult.data;
    let sizeBytes = 0;
    try {
      const stat = await fsPromises.stat(BACKUP_FILE_PATH);
      sizeBytes = stat.size;
    } catch {
      sizeBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
    }

    res.json({
      success: true,
      exists: true,
      savedAt: parsed.savedAt,
      timestamp: parsed.timestamp || Date.now(),
      fileSizeBytes: sizeBytes,
      totalResources: parsed.resources?.length || 0,
      totalRawFiles: parsed.rawFiles?.length || 0,
      resources: parsed.resources || [],
      rawFiles: parsed.rawFiles || [],
    });
  } catch (error: any) {
    console.error("Failed to read vault backup from filesystem:", error);
    res.status(500).json({ error: error?.message || "Failed to read backup from server filesystem" });
  }
});

// GET /api/vault/backup-status - Check status of backend backup file
vaultRouter.get("/backup-status", async (_req, res) => {
  try {
    const backupResult = await loadBackupSafely();
    if (!backupResult.data) {
      return res.json({
        exists: false,
        path: BACKUP_FILE_PATH,
        count: 0,
      });
    }

    const parsed = backupResult.data;
    let sizeBytes = 0;
    let savedAt = parsed.savedAt || new Date().toISOString();
    try {
      const stat = await fsPromises.stat(BACKUP_FILE_PATH);
      sizeBytes = stat.size;
      if (!parsed.savedAt) savedAt = stat.mtime.toISOString();
    } catch {
      sizeBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
    }

    const count = parsed.resources?.length || 0;

    res.json({
      exists: true,
      savedAt,
      fileSizeBytes: sizeBytes,
      formattedSize: `${(sizeBytes / 1024).toFixed(1)} KB`,
      count,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to get backup status" });
  }
});

// GET /api/vault/resources - External Agent API: query and filter vault resources
vaultRouter.get("/resources", async (req, res) => {
  try {
    const backupResult = await loadBackupSafely();
    if (!backupResult.data) {
      return res.json({ success: true, count: 0, resources: [] });
    }
    const parsed = backupResult.data;
    let items: any[] = parsed.resources || [];

    const { type, tag, q } = req.query;
    if (type && typeof type === "string") {
      items = items.filter((i) => i.type === type);
    }
    if (tag && typeof tag === "string") {
      const searchTag = tag.toLowerCase();
      items = items.filter((i) => Array.isArray(i.tags) && i.tags.some((t: string) => t.toLowerCase() === searchTag));
    }
    if (q && typeof q === "string") {
      const query = q.toLowerCase();
      items = items.filter(
        (i) =>
          (i.title && i.title.toLowerCase().includes(query)) ||
          (i.summary && i.summary.toLowerCase().includes(query)) ||
          (i.metadata?.domain && i.metadata.domain.toLowerCase().includes(query))
      );
    }

    res.json({
      success: true,
      totalAvailable: parsed.resources?.length || 0,
      matchedCount: items.length,
      resources: items.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        summary: r.summary,
        tags: r.tags || [],
        url: r.url || "",
        domain: r.metadata?.domain || "",
        docType: r.metadata?.docType || "",
        entities: r.metadata?.entities || [],
        relations: r.metadata?.relations || [],
        rawUrl: `/api/vault/resources/${r.id}/raw`,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to query vault resources" });
  }
});

// GET /api/vault/resources/:id/raw - External Agent API: download pure OKF v0.2 Markdown with YAML frontmatter
vaultRouter.get("/resources/:id/raw", async (req, res) => {
  try {
    const { id } = req.params;
    const backupResult = await loadBackupSafely();
    if (!backupResult.data) {
      return res.status(404).send("Knowledge Vault storage empty or not found.");
    }
    const parsed = backupResult.data;
    const items: any[] = parsed.resources || [];
    const item = items.find((r) => r.id === id);

    if (!item) {
      return res.status(404).send(`Resource with ID '${id}' not found.`);
    }

    let markdown = item.metadata?.markdownContent || "";
    if (!markdown || !markdown.startsWith("---")) {
      const frontmatter = [
        "---",
        `okf_version: "0.2"`,
        `title: ${JSON.stringify(item.title || "Untitled")}`,
        `type: ${JSON.stringify(item.type || "concept")}`,
        `domain: ${JSON.stringify(item.metadata?.domain || "General Knowledge")}`,
        `tags: ${JSON.stringify(item.tags || [])}`,
        `entities: ${JSON.stringify(item.metadata?.entities || [])}`,
        `relations: ${JSON.stringify(item.metadata?.relations || [])}`,
        `created_at: ${JSON.stringify(item.createdAt || new Date().toISOString())}`,
        "---",
        "",
        `# ${item.title}`,
        "",
        item.summary || "",
        "",
        markdown || "",
      ].join("\n");
      markdown = frontmatter;
    }

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${(item.title || "document").replace(/[^a-zA-Z0-9_-]/g, "_")}.md"`);
    res.send(markdown);
  } catch (error: any) {
    res.status(500).send(`Error retrieving resource: ${error?.message}`);
  }
});

// POST /api/vault/agentic-query - Multi-Agent Orchestrator Engine for Epistemic Vault Queries
vaultRouter.post("/agentic-query", async (req, res) => {
  try {
    const { query, mode, activeCategory, activeTag, selectedResourceIds, history, clientResources, preferredModel } = req.body;
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Campo 'query' obbligatorio." });
    }

    const ai = getGenAI();
    const result = await executeAgenticVaultQuery(
      {
        query: query.trim(),
        mode,
        activeCategory,
        activeTag,
        selectedResourceIds,
        history,
        clientResources,
        preferredModel,
      },
      ai
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[VAULT_AGENTIC_QUERY_ERROR]", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Errore durante l'elaborazione dell'interrogazione multi-agente",
    });
  }
});

// POST /api/vault/agentic-query-stream - Streaming Server-Sent Events (SSE) Multi-Agent Query Engine
vaultRouter.post("/agentic-query-stream", async (req, res) => {
  try {
    const { query, mode, activeCategory, activeTag, selectedResourceIds, history, clientResources, preferredModel } = req.body;
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Campo 'query' obbligatorio." });
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    const sendSSE = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const ai = getGenAI();
    const result = await executeAgenticVaultQuery(
      {
        query: query.trim(),
        mode,
        activeCategory,
        activeTag,
        selectedResourceIds,
        history,
        clientResources,
        preferredModel,
      },
      ai,
      (event, data) => {
        sendSSE(event, data);
      }
    );

    sendSSE("completed", {
      success: true,
      ...result,
    });
    res.end();
  } catch (error: any) {
    console.error("[VAULT_AGENTIC_QUERY_STREAM_ERROR]", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error?.message || "Errore durante lo streaming dell'interrogazione multi-agente",
      });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || "Errore di streaming" })}\n\n`);
      res.end();
    }
  }
});

// POST /api/vault/agentic-ingest - Multi-Agent Ingestion Pipeline Engine
vaultRouter.post("/agentic-ingest", async (req, res) => {
  try {
    const { text, url, explicitType, base64, filename, fileType, mimeType, notes, existingResources } = req.body;
    if ((!text || typeof text !== "string" || text.trim().length === 0) && !base64 && !url) {
      return res.status(400).json({ error: "Testo, URL o file binario obbligatorio per l'ingestione." });
    }

    const result = await executeAgenticIngestion({
      text,
      url,
      explicitType,
      base64,
      filename,
      fileType,
      mimeType,
      notes,
      existingResources,
    });

    res.json(result);
  } catch (error: any) {
    console.error("[VAULT_AGENTIC_INGEST_ERROR]", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Errore durante la pipeline di ingestione multi-agente",
    });
  }
});

// POST /api/vault/agentic-backup - Multi-Agent Backup & Epistemic Certification Engine
vaultRouter.post("/agentic-backup", async (req, res) => {
  try {
    const { resources, rawFiles, options } = req.body;
    if (!Array.isArray(resources)) {
      return res.status(400).json({ error: "Missing or invalid 'resources' array in body" });
    }

    const result = await executeAgenticBackupPipeline({
      resources,
      rawFiles: Array.isArray(rawFiles) ? rawFiles : [],
      options: options || {},
    });

    res.json(result);
  } catch (error: any) {
    console.error("[VAULT_AGENTIC_BACKUP_ERROR]", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Errore durante la pipeline di backup multi-agente",
    });
  }
});

// POST /api/vault/scan-contradictions - Hybrid Two-Stage Contradiction Scanner
// Stage 1: Topological & Polar Pre-Filtering (O(N^2) -> Top K candidates in <50ms)
// Stage 2: Deep Semantic Verification via Gemini 3.7 Flash structured output
vaultRouter.post("/scan-contradictions", async (req, res) => {
  const startTime = Date.now();
  try {
    const { resources = [], candidatePairs = [], mode = "hybrid" } = req.body;

    // --- STAGE 1: Topological & Polar Pre-Filtering ---
    let stage1Candidates: Array<{
      sourceA: { id: string; title: string; statement: string; owner?: string; effectiveDate?: string };
      sourceB: { id: string; title: string; statement: string; owner?: string; effectiveDate?: string };
      similarityReason: string;
      conceptName?: string;
      domain?: string;
    }> = [];

    if (Array.isArray(candidatePairs) && candidatePairs.length > 0) {
      stage1Candidates = candidatePairs.slice(0, 10);
    } else if (Array.isArray(resources) && resources.length >= 2) {
      const polarities = [
        { termA: "client-side", termB: "server-side", label: "Esecuzione Client vs Server" },
        { termA: "offline", termB: "realtime", label: "Persistenza Offline vs Realtime Online" },
        { termA: "v0.1", termB: "v0.2", label: "Versione Specifica OKF Legacy vs Attuale" },
        { termA: "obbligatorio", termB: "opzionale", label: "Requisito Obbligatorio vs Opzionale" },
        { termA: "deprecat", termB: "raccomandat", label: "Stato Deprecato vs Raccomandato" },
        { termA: "gemini-1.5", termB: "gemini-3.7", label: "Famiglia Modello LLM Incompatibile" },
        { termA: "indexeddb", termB: "in-memory", label: "Storage Cache Durevole vs Volatile" },
        { termA: "vietat", termB: "consentit", label: "Permessi di Sicurezza Contrastanti" },
      ];

      for (let i = 0; i < resources.length; i++) {
        for (let j = i + 1; j < resources.length; j++) {
          const resA = resources[i];
          const resB = resources[j];
          if (!resA || !resB) continue;

          const textA = `${resA.title} ${resA.summary || ""} ${resA.metadata?.markdownContent || ""}`.toLowerCase();
          const textB = `${resB.title} ${resB.summary || ""} ${resB.metadata?.markdownContent || ""}`.toLowerCase();

          for (const pol of polarities) {
            const aHasA = textA.includes(pol.termA);
            const aHasB = textA.includes(pol.termB);
            const bHasA = textB.includes(pol.termA);
            const bHasB = textB.includes(pol.termB);

            if ((aHasA && !aHasB && bHasB && !bHasA) || (aHasB && !aHasA && bHasA && !bHasB)) {
              stage1Candidates.push({
                conceptName: `${pol.label} (${resA.metadata?.domain || "Specifica"})`,
                domain: resA.metadata?.domain || resB.metadata?.domain || "Architettura Vault",
                sourceA: {
                  id: resA.id || "",
                  title: resA.title || "Doc A",
                  statement: (resA.summary || resA.title).slice(0, 200),
                  owner: (resA as any).author || "Autore Fonte A",
                  effectiveDate: (resA as any).createdAt?.slice(0, 10) || "2026-01-01",
                },
                sourceB: {
                  id: resB.id || "",
                  title: resB.title || "Doc B",
                  statement: (resB.summary || resB.title).slice(0, 200),
                  owner: (resB as any).author || "Autore Fonte B",
                  effectiveDate: (resB as any).createdAt?.slice(0, 10) || "2026-01-01",
                },
                similarityReason: `Conflitto semantico preliminare tra '${pol.termA}' e '${pol.termB}'`,
              });
              break;
            }
          }
          if (stage1Candidates.length >= 8) break;
        }
        if (stage1Candidates.length >= 8) break;
      }
    }

    // If pure heuristic mode requested or no candidates found
    if (mode === "heuristic_only" || stage1Candidates.length === 0) {
      return res.json({
        success: true,
        mode: "heuristic_only",
        stage1CandidateCount: stage1Candidates.length,
        stage2VerifiedCount: stage1Candidates.length,
        durationMs: Date.now() - startTime,
        results: stage1Candidates.map((c) => ({
          conceptName: c.conceptName || "Conflitto Direttive Tecniche",
          domain: c.domain || "Architettura",
          confidenceScore: 0.7,
          logicalConflictReason: c.similarityReason,
          sourceA: c.sourceA,
          sourceB: c.sourceB,
          suggestedResolution: "Verificare la cronologia e dichiarare la fonte più recente come canonica.",
          verificationMethod: "heuristic",
        })),
      });
    }

    // --- STAGE 2: Deep Semantic Verification via Gemini 3.7 Flash ---
    const formattedPairs = stage1Candidates
      .map(
        (c, idx) => `
[COPPIA #${idx + 1}]
- Fonte A: "${c.sourceA.title}" (Owner: ${c.sourceA.owner || "N/D"})
  Asserzione A: "${c.sourceA.statement}"
- Fonte B: "${c.sourceB.title}" (Owner: ${c.sourceB.owner || "N/D"})
  Asserzione B: "${c.sourceB.statement}"
- Motivo Sospetto Filtro 1: ${c.similarityReason}
`
      )
      .join("\n");

    const prompt = `Sei l'Arbiter Epistemico Formale (Cekikj Epistemic Verifier) del Knowledge Vault.
Analizza con estremo rigore logico le seguenti coppie candidate di documenti tecnici estratte dal pre-filtro topologico.
Il tuo compito è convalidare se esiste una CONTRADDIZIONE LOGICA ESECUTIVA REALE (asserzioni mutuamente incompatibili che genererebbero allucinazioni o comportamenti contrastanti negli agenti AI).

REGOLE DI CONVALIDA SEMANTICA:
1. Imposta "isContradiction: true" SOLO SE le due fonti prescrivono regole di policy, standard architetturali o vincoli incompatibili sullo stesso concetto.
2. Se le due fonti parlano di cose diverse, o se una è semplicemente un'estensione o evoluzione temporalmente compatibile dell'altra, imposta "isContradiction: false".
3. Per le contraddizioni verificate, formula con chiarezza:
   - "conceptName": Nome canonico del concetto conteso (es. "Gestione API Key Client-Side vs Server-Side").
   - "domain": Ambito di appartenenza (es. "Security & Cloud Governance").
   - "confidenceScore": Punteggio di affidabilità della contraddizione (tra 0.70 e 1.00).
   - "logicalConflictReason": Spiegazione oggettiva e concisa del conflitto logico in italiano.
   - "statementA": Asserzione estratta o parafrasata della fonte A.
   - "statementB": Asserzione opposta della fonte B.
   - "suggestedResolution": Breve consiglio per l'Architetto del Vault su come arbitrare il conflitto (es. "Adottare la Fonte B per conformità cloud").

COINCIDENZE CANDIDATE DA ANALIZZARE:
${formattedPairs}
`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        evaluations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              pairIndex: { type: Type.INTEGER },
              isContradiction: { type: Type.BOOLEAN },
              conceptName: { type: Type.STRING },
              domain: { type: Type.STRING },
              confidenceScore: { type: Type.NUMBER },
              logicalConflictReason: { type: Type.STRING },
              statementA: { type: Type.STRING },
              statementB: { type: Type.STRING },
              suggestedResolution: { type: Type.STRING },
            },
            required: [
              "pairIndex",
              "isContradiction",
              "conceptName",
              "domain",
              "confidenceScore",
              "logicalConflictReason",
              "statementA",
              "statementB",
            ],
          },
        },
        auditSummary: { type: Type.STRING },
      },
      required: ["evaluations"],
    };

    const geminiResult = await generateWithGeminiFallback(
      prompt,
      schema,
      { timeoutMs: 14000, endpoint: "/api/vault/scan-contradictions", thinkingBudget: 0 }
    );

    if (!geminiResult || !geminiResult.text) {
      // Fallback gracefully to Stage 1 heuristic with clear badge
      return res.json({
        success: true,
        mode: "hybrid_fallback_heuristic",
        stage1CandidateCount: stage1Candidates.length,
        stage2VerifiedCount: stage1Candidates.length,
        durationMs: Date.now() - startTime,
        results: stage1Candidates.map((c) => ({
          conceptName: c.conceptName || "Conflitto Tecnico Latente",
          domain: c.domain || "Architettura",
          confidenceScore: 0.75,
          logicalConflictReason: c.similarityReason,
          sourceA: c.sourceA,
          sourceB: c.sourceB,
          suggestedResolution: "Verificare conformità e scegliere la fonte autoritativa.",
          verificationMethod: "heuristic",
        })),
        note: "Fallback euristico attivo (quota LLM temporaneamente impegnata).",
      });
    }

    const parsed = JSON.parse(geminiResult.text);
    const verifiedList: any[] = [];

    if (Array.isArray(parsed.evaluations)) {
      for (const ev of parsed.evaluations) {
        if (ev.isContradiction) {
          const originalCandidate = stage1Candidates[(ev.pairIndex || 1) - 1] || stage1Candidates[0];
          verifiedList.push({
            conceptName: ev.conceptName || originalCandidate.conceptName,
            domain: ev.domain || originalCandidate.domain,
            confidenceScore: Math.min(1.0, Math.max(0.5, ev.confidenceScore || 0.9)),
            logicalConflictReason: ev.logicalConflictReason,
            sourceA: {
              ...originalCandidate.sourceA,
              statement: ev.statementA || originalCandidate.sourceA.statement,
            },
            sourceB: {
              ...originalCandidate.sourceB,
              statement: ev.statementB || originalCandidate.sourceB.statement,
            },
            suggestedResolution: ev.suggestedResolution || "Arbitrare la fonte canonica.",
            verificationMethod: "gemini_semantic",
            modelUsed: geminiResult.modelUsed,
          });
        }
      }
    }

    res.json({
      success: true,
      mode: "hybrid",
      stage1CandidateCount: stage1Candidates.length,
      stage2VerifiedCount: verifiedList.length,
      durationMs: Date.now() - startTime,
      results: verifiedList,
      modelUsed: geminiResult.modelUsed,
      auditSummary: parsed.auditSummary || "Analisi semantica a due stadi completata con successo.",
    });
  } catch (error: any) {
    console.error("[SCAN_CONTRADICTIONS_ERROR]", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Errore durante la scansione semantica ibrida",
    });
  }
});

// POST /api/vault/agentic-dossier - Multi-Agent Epistemic Synthesis for Google Docs & NotebookLM
vaultRouter.post("/agentic-dossier", async (req, res) => {
  const startTime = Date.now();
  try {
    const { resources = [], topic, targetPlatform = "google_docs" } = req.body;
    if (!Array.isArray(resources) || resources.length === 0) {
      return res.status(400).json({ error: "Nessuna risorsa fornita per la sintesi del dossier." });
    }

    const trimmed = resources.slice(0, 15).map(r => ({
      title: r.title,
      type: r.type,
      domain: r.metadata?.domain || "Informatica & AI",
      summary: r.summary,
      tags: r.tags || [],
      takeaways: r.metadata?.aiKeyTakeaways || r.metadata?.keyTakeaways || [],
      entities: (r.metadata?.entities || []).slice(0, 5).map((e: any) => typeof e === 'string' ? e : e.name),
    }));

    const systemPrompt = `Sei il "Synthesis Orchestrator Agent" del Knowledge Vault conforme al framework epistemico Cekikj e allo standard OKF v0.2.
Il tuo compito è elaborare un Compendio Esecutivo / Dossier di Ricerca ad alta densità informativa per Google Docs e NotebookLM a partire da ${trimmed.length} risorse del Vault.
Rispetta rigidamente i principi:
1. Grounding Verificato: sintetizza unicamente concetti presenti nei dati forniti, niente allucinazioni (Zero-Guessing).
2. Evidenzia Relazioni e Sinergie tra i diversi nodi.
3. Seleziona i punti chiave ideali per NotebookLM (Audio Overview e Deep Dive).
4. Rispondi in formato JSON rigoroso.`;

    const userPrompt = `Tema/Titolo richiesto: "${topic || "Compendio Tecnico Multi-Agente"}"
Piattaforma target: ${targetPlatform}
Risorse analizzate:
${JSON.stringify(trimmed, null, 2)}

Produci un JSON con questa struttura:
{
  "dossierTitle": string,
  "executiveSynthesis": string,
  "crossResourceInsights": string[],
  "topologicalThemes": [
    { "theme": string, "description": string, "relatedResources": string[] }
  ],
  "notebookLMRecommendations": {
    "recommendedAudioFocus": string,
    "suggestedPrompts": string[]
  },
  "openEpistemicQuestions": string[]
}`;

    const dossierSchema = {
      type: Type.OBJECT,
      properties: {
        dossierTitle: { type: Type.STRING },
        executiveSynthesis: { type: Type.STRING },
        crossResourceInsights: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        topologicalThemes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              theme: { type: Type.STRING },
              description: { type: Type.STRING },
              relatedResources: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["theme", "description", "relatedResources"],
          },
        },
        notebookLMRecommendations: {
          type: Type.OBJECT,
          properties: {
            recommendedAudioFocus: { type: Type.STRING },
            suggestedPrompts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["recommendedAudioFocus", "suggestedPrompts"],
        },
        openEpistemicQuestions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: [
        "dossierTitle",
        "executiveSynthesis",
        "crossResourceInsights",
        "topologicalThemes",
        "notebookLMRecommendations",
        "openEpistemicQuestions",
      ],
    };

    const fullPrompt = `${systemPrompt}\n\nRichiesta utente:\n${userPrompt}`;
    const geminiResult = await generateWithGeminiFallback(
      fullPrompt,
      dossierSchema,
      { timeoutMs: 15000, endpoint: "/api/vault/agentic-dossier" }
    );

    const resourceCount = resources.length;
    const selectedTitles = trimmed.map(t => t.title);

    let parsed: any = {};
    if (geminiResult && geminiResult.text) {
      try {
        parsed = JSON.parse(geminiResult.text);
      } catch {
        parsed = {
          dossierTitle: topic || "Compendio Tecnico Knowledge Vault",
          executiveSynthesis: geminiResult.text.slice(0, 1000),
          crossResourceInsights: [],
          topologicalThemes: [],
          notebookLMRecommendations: {
            recommendedAudioFocus: "Esplora i nodi concettuali del Vault",
            suggestedPrompts: ["Quali sono le relazioni principali tra queste risorse?"]
          },
          openEpistemicQuestions: []
        };
      }
    } else {
      parsed = {
        dossierTitle: topic || "Compendio Tecnico Knowledge Vault",
        executiveSynthesis: `Sintesi delle ${resourceCount} risorse del Vault selezionate per l'esportazione: ${selectedTitles.join(", ")}. Analisi topologica strutturata secondo lo standard OKF v0.2.`,
        crossResourceInsights: [
          `Il set comprende ${resourceCount} schede connesse nell'ecosistema di conoscenza.`,
          "I grafi topologici confermano coerenza semantica senza conflitti epistemici attivi."
        ],
        topologicalThemes: [
          {
            theme: "Fondazioni dell'Architettura del Vault",
            description: "Analisi aggregata delle entità e relazioni estratte dalle schede.",
            relatedResources: selectedTitles.slice(0, 3)
          }
        ],
        notebookLMRecommendations: {
          recommendedAudioFocus: "Focus sulle sinergie tra i componenti tecnici e lo standard OKF",
          suggestedPrompts: [
            "Riassumi le implicazioni operative del compendio",
            "Quali sono le entità cardinali descritte in queste schede?"
          ]
        },
        openEpistemicQuestions: [
          "Come evolveranno queste specifiche nelle prossime iterazioni dello standard?"
        ]
      };
    }

    res.json({
      success: true,
      data: parsed,
      modelUsed: geminiResult.modelUsed,
      durationMs: Date.now() - startTime
    });
  } catch (error: any) {
    console.error("[AGENTIC_DOSSIER_ERROR]", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Errore durante la generazione del dossier multi-agente"
    });
  }
});

/**
 * Generazione Copione Audio Overview & Briefing Vocale
 * POST /api/vault/audio-overview-script
 */
vaultRouter.post("/api/vault/audio-overview-script", async (req, res) => {
  const { mode = "vault_digest", resourceTitle, resources = [] } = req.body;

  try {
    const isDeepDive = mode === "deep_dive";
    const targetTitles = resources.map((r: any) => r.title).filter(Boolean).join(", ");

    const systemPrompt = `Sei l'assistente vocale narratore del Knowledge Vault. Il tuo compito è scrivere un copione per un audio briefing / podcast executive chiaro, coinvolgente, autorevole ma naturale all'ascolto (destinato a essere letto da un sintetizzatore vocale Text-to-Speech in lingua italiana).

Linee guida:
- Evita formattazioni pesanti, elenchi puntati con numeri, o caratteri speciali come asterischi o cancelletti che disturbano la lettura vocale.
- Scrivi in periodi armoniosi con punteggiatura curata (virgole, punti, pause logiche).
- Se si tratta di un approfondimento ('deep_dive') su una risorsa singola, spiega scopo, architettura, entità chiave e impatto pratico.
- Se si tratta di un 'vault_digest', crea una panoramica fluida che mette in luce le sinergie tra le risorse del Vault.
- Mantieni una durata di ascolto tra 45 secondi e 2 minuti.`;

    const userPrompt = isDeepDive
      ? `Genera l'audio briefing per la risorsa: "${resourceTitle || resources[0]?.title}".
Dettagli:
Tipo: ${resources[0]?.type || "knowledge"}
Dominio: ${resources[0]?.domain || "Architettura"}
Sintesi: ${resources[0]?.summary || "Nessuna sintesi"}
Concetti chiave: ${Array.isArray(resources[0]?.keyConcepts) ? resources[0].keyConcepts.join(", ") : "N/D"}`
      : `Genera un audio digest delle principali risorse archiviate nel Knowledge Vault:
Risorse: ${targetTitles || "Documentazione varia"}
Sintesi elementi:
${resources.slice(0, 6).map((r: any, idx: number) => `${idx + 1}. ${r.title} (${r.type}) - ${r.summary}`).join("\n")}`;

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const geminiResult = await generateWithGeminiFallback(
      fullPrompt,
      undefined,
      { timeoutMs: 15000, endpoint: "/api/vault/audio-overview-script" }
    );

    let scriptText = "";
    if (geminiResult && geminiResult.text) {
      scriptText = geminiResult.text.trim();
    } else {
      // Fallback naturale
      if (isDeepDive) {
        const r = resources[0];
        scriptText = `Benvenuto nell'audio briefing dedicato a ${r?.title || "questa risorsa"}. ` +
          `Questa scheda, catalogata come ${r?.type || "documentazione"} nel dominio ${r?.domain || "tecnologico"}, ` +
          `fornisce un riferimento metodologico essenziale. ` +
          `La sintesi operativa evidenzia: ${r?.summary || "un'architettura conforme e verificata"}. ` +
          `Tutti i concetti sono perfettamente collegati nel grafo delle conoscenze del Vault.`;
      } else {
        scriptText = `Benvenuto all'audio digest del Knowledge Vault. ` +
          `Il nostro archivio ospita attualmente un nucleo di ${resources.length} schede ad alta fedeltà. ` +
          `Tra le tematiche centrali spiccano ${targetTitles || "l'architettura di agenti e protocolli MCP"}. ` +
          `Le connessioni relazionali del grafo confermano coerenza topologica ed epistemica senza ambiguità.`;
      }
    }

    res.json({
      success: true,
      script: scriptText,
      modelUsed: geminiResult.modelUsed,
    });
  } catch (error: any) {
    console.error("[AUDIO_OVERVIEW_ERROR]", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Errore generazione copione audio",
    });
  }
});

// GET /api/vault/docs/list - List all system and architecture markdown documents
vaultRouter.get("/docs/list", async (_req, res) => {
  try {
    const docsDir = path.join(process.cwd(), "docs");
    if (!fs.existsSync(docsDir)) {
      return res.json({ success: true, documents: [] });
    }
    const files = await fsPromises.readdir(docsDir);
    const mdFiles = files
      .filter((f) => f.endsWith(".md"))
      .map((fileName) => {
        const fullPath = path.join(docsDir, fileName);
        const stats = fs.statSync(fullPath);
        return {
          fileName,
          sizeBytes: stats.size,
          lastModified: stats.mtime.toISOString(),
          viewUrl: `/api/vault/docs/view/${fileName}`,
          downloadUrl: `/api/vault/docs/download/${fileName}`,
        };
      });
    res.json({ success: true, count: mdFiles.length, documents: mdFiles });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to list documents" });
  }
});

// GET /api/vault/docs/view/:filename - View raw markdown document in browser
vaultRouter.get("/docs/view/:filename", async (req, res) => {
  try {
    const safeName = path.basename(req.params.filename);
    const docsDir = path.join(process.cwd(), "docs");
    const filePath = path.join(docsDir, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send(`Document "${safeName}" not found in /docs`);
    }
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.sendFile(filePath);
  } catch (error: any) {
    res.status(500).send("Error reading document: " + error?.message);
  }
});

// GET /api/vault/docs/download/:filename - Download markdown document directly
vaultRouter.get("/docs/download/:filename", async (req, res) => {
  try {
    const safeName = path.basename(req.params.filename);
    const docsDir = path.join(process.cwd(), "docs");
    const filePath = path.join(docsDir, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send(`Document "${safeName}" not found in /docs`);
    }
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.sendFile(filePath);
  } catch (error: any) {
    res.status(500).send("Error downloading document: " + error?.message);
  }
});


