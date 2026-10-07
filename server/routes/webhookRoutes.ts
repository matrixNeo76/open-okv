import { Router, Request, Response } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { atomicWriteFile } from "./vaultRoutes";

export const webhookRouter = Router();

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "webhook-config.json");

interface WebhookConfig {
  secretToken: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt?: string;
  totalCaptures: number;
}

// In-memory / file-persisted webhook token configuration
let webhookConfig: WebhookConfig = {
  secretToken: "",
  enabled: true,
  createdAt: new Date().toISOString(),
  totalCaptures: 0,
};

function loadWebhookConfig(): void {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      webhookConfig = JSON.parse(data);
    } else {
      // Generate default secure secret
      const randomSecret = "kv_" + crypto.randomBytes(18).toString("hex");
      webhookConfig = {
        secretToken: randomSecret,
        enabled: true,
        createdAt: new Date().toISOString(),
        totalCaptures: 0,
      };
      atomicWriteFile(CONFIG_FILE, JSON.stringify(webhookConfig, null, 2)).catch(() => {});
    }
  } catch {
    if (!webhookConfig.secretToken) {
      webhookConfig.secretToken = "kv_" + crypto.randomBytes(18).toString("hex");
    }
  }
}

loadWebhookConfig();

async function saveWebhookConfig(): Promise<void> {
  try {
    await atomicWriteFile(CONFIG_FILE, JSON.stringify(webhookConfig, null, 2));
  } catch (err: any) {
    console.warn("[webhookRouter] Failed to persist webhook config:", err?.message);
  }
}

// GET /api/webhook/config - Retrieve webhook secret and sample integrations
webhookRouter.get("/config", (_req: Request, res: Response) => {
  if (!webhookConfig.secretToken) {
    loadWebhookConfig();
  }
  res.json({
    enabled: webhookConfig.enabled,
    secretToken: webhookConfig.secretToken,
    createdAt: webhookConfig.createdAt,
    lastUsedAt: webhookConfig.lastUsedAt,
    totalCaptures: webhookConfig.totalCaptures,
    endpointUrl: "/api/webhook/capture",
    sampleCurl: `curl -X POST "${_req.protocol}://${_req.get("host")}/api/webhook/capture" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookConfig.secretToken}" \\
  -d '{"url": "https://news.ycombinator.com", "source": "curl", "tags": ["tech", "news"]}'`,
    bookmarkletCode: `javascript:(function(){const token="${webhookConfig.secretToken}";const url=window.location.href;const title=document.title;fetch("${_req.protocol}://${_req.get("host")}/api/webhook/capture",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({url:url,title:title,source:"bookmarklet"})}).then(r=>r.json()).then(d=>alert("Salvato nel Vault: "+(d.resource?.title||title))).catch(e=>alert("Errore salvataggio: "+e.message));})();`
  });
});

// POST /api/webhook/regenerate-token - Generate a new secret token
webhookRouter.post("/regenerate-token", async (_req: Request, res: Response) => {
  const newSecret = "kv_" + crypto.randomBytes(18).toString("hex");
  webhookConfig.secretToken = newSecret;
  webhookConfig.createdAt = new Date().toISOString();
  await saveWebhookConfig();
  res.json({
    success: true,
    secretToken: newSecret,
    message: "Nuovo Webhook Token generato con successo.",
  });
});

// POST /api/webhook/capture - Remote Ingestion Endpoint (Browser Extension / CI/CD / Bookmarklet)
webhookRouter.post("/capture", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  const queryToken = req.query.token as string | undefined;

  let providedToken = "";
  if (authHeader.startsWith("Bearer ")) {
    providedToken = authHeader.slice(7).trim();
  } else if (queryToken) {
    providedToken = queryToken.trim();
  }

  if (!webhookConfig.enabled) {
    return res.status(403).json({ error: "L'endpoint webhook è attualmente disabilitato." });
  }

  if (!providedToken || providedToken !== webhookConfig.secretToken) {
    return res.status(401).json({ error: "Token di autorizzazione non valido o assente." });
  }

  const { url, text, title, source, explicitType, tags, notes } = req.body || {};

  if (!url && !text && !title) {
    return res.status(400).json({ error: "Specificare almeno 'url', 'text' o 'title' nel payload." });
  }

  // Update telemetry
  webhookConfig.lastUsedAt = new Date().toISOString();
  webhookConfig.totalCaptures = (webhookConfig.totalCaptures || 0) + 1;
  saveWebhookConfig().catch(() => {});

  try {
    const rawInput = url || text || title || "";
    // Forward internally to /api/analyze-resource or assemble compliant OKF v0.2 payload
    const parsedTags = Array.isArray(tags) ? tags : ["webhook", (source || "remote").toLowerCase()];
    
    // Perform internal fast capture response
    const cleanTitle = title || (url ? `Risorsa da ${new URL(url.startsWith("http") ? url : `https://${url}`).hostname}` : "Acquisizione Webhook");
    
    const resourcePayload = {
      type: explicitType || (url ? "article" : "note"),
      title: cleanTitle,
      url: url || "",
      rawInput,
      summary: text ? text.slice(0, 300) : `Risorsa acquisita da ${source || "servizio remoto"} tramite webhook API.`,
      tags: parsedTags,
      metadata: {
        okfVersion: "0.2",
        domain: "Remote Ingestion",
        docType: "specification",
        source: source || "webhook",
        capturedAt: new Date().toISOString(),
        markdownContent: `---\nokf_version: "0.2"\ntitle: "${cleanTitle.replace(/"/g, '\\"')}"\ntype: "${explicitType || (url ? "article" : "note")}"\ndomain: "Remote Ingestion"\ntags: ${JSON.stringify(parsedTags)}\n---\n\n# ${cleanTitle}\n\n> Acquisito da ${source || "webhook"} il ${new Date().toLocaleString("it-IT")}\n\n${url ? `**URL:** [${url}](${url})\n\n` : ""}${text || notes || ""}`,
      }
    };

    res.status(201).json({
      success: true,
      message: "Risorsa acquisita con successo tramite Webhook!",
      resource: resourcePayload,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[webhookCapture] Ingestion error:", err);
    res.status(500).json({ error: err?.message || "Errore durante l'acquisizione via webhook." });
  }
});
