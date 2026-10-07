/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Router Express per il Server MCP Nativo (Model Context Protocol) del Knowledge Vault
 */

import { Router } from "express";
import { processMcpJsonRpc, MCP_TOOLS_MANIFEST, getVaultResources, getVaultSyncMetadata } from "../mcpServer";

export const mcpRouter = Router();

// GET /api/mcp - Info, diagnostica e configurazione IDE (Claude Desktop / Cursor)
mcpRouter.get("/", async (req, res) => {
  try {
    const [resources, syncMeta] = await Promise.all([
      getVaultResources(),
      getVaultSyncMetadata(),
    ]);
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol || "http";
    const endpointUrl = `${protocol}://${host}/api/mcp`;

    res.json({
      name: "Knowledge Vault Native MCP Server",
      protocolVersion: "2024-11-05",
      status: "active",
      endpoint: endpointUrl,
      vaultDocumentsIndexed: resources.length,
      vaultLastSynchronizedAt: syncMeta.lastSynchronizedAt,
      snapshotVersion: syncMeta.version,
      triLayerStatus: syncMeta.count > 0 ? "synchronized" : "initialized",
      toolsCount: MCP_TOOLS_MANIFEST.length,
      tools: MCP_TOOLS_MANIFEST,
      ideConfigurations: {
        claudeDesktop: {
          mcpServers: {
            "knowledge-vault": {
              command: "curl",
              args: ["-s", "-X", "POST", endpointUrl, "-H", "Content-Type: application/json"],
              endpoint: endpointUrl,
            },
          },
        },
        cursorOrWindsurf: {
          mcpServers: {
            "knowledge-vault": {
              url: endpointUrl,
              type: "http",
            },
          },
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Errore status MCP" });
  }
});

// POST /api/mcp - Dispatcher JSON-RPC 2.0
mcpRouter.post("/", async (req, res) => {
  try {
    const response = await processMcpJsonRpc(req.body);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id ?? null,
      error: { code: -32603, message: err?.message || "Errore interno MCP" },
    });
  }
});

// GET /api/mcp/sse - Endpoint Server-Sent Events per client MCP SSE standard
mcpRouter.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  // Notifica handshake MCP SSE con endpoint POST di callback
  const host = req.get("host") || "localhost:3000";
  const protocol = req.protocol || "http";
  const endpointUrl = `${protocol}://${host}/api/mcp`;

  res.write(`event: endpoint\ndata: ${JSON.stringify({ endpoint: endpointUrl })}\n\n`);

  // Keep-alive heartbeat ogni 15 secondi
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
  });
});
