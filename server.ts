import express from "express";
import path from "path";
import dotenv from "dotenv";
import { telemetryRouter } from "./server/routes/telemetryRoutes";
import { vaultRouter } from "./server/routes/vaultRoutes";
import { captureRouter } from "./server/routes/captureRoutes";
import { mcpRouter } from "./server/routes/mcpRoutes";
import { webhookRouter } from "./server/routes/webhookRoutes";

dotenv.config();

const app = express();
const PORT = 3000;

// High-capacity JSON and URL-encoded body parser for documents and base64 media
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ limit: "60mb", extended: true }));

// Serve built assets safely if requested by cached browser clients
const distAssetsPath = path.join(process.cwd(), "dist", "assets");
app.use("/assets", express.static(distAssetsPath));

// Modular API Routers
app.use("/api", telemetryRouter);
app.use("/api/vault", vaultRouter);
app.use("/api", captureRouter);
app.use("/api/mcp", mcpRouter);
app.use("/api/webhook", webhookRouter);

// Vite middleware & Static Production Server Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Knowledge Vault server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
