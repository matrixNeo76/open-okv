// Consultazione dei ruoli e del consumo. SOLA LETTURA e senza segreti.
// Fino alla tappa M4 (autenticazione admin) queste rotte non sono protette: tenere l'istanza in rete locale.
import { Router } from "express";
import { getPool, hasDatabase, redact } from "../db/pool";
import { listRoles, summary } from "./usageStore";

export const llmRouter = Router();

llmRouter.use((_req, res, next) => {
  if (!hasDatabase()) return void res.status(503).json({ error: "database non configurato" });
  next();
});

llmRouter.get("/status", (_req, res) => {
  res.json({ keyConfigured: !!process.env.OPENROUTER_API_KEY, disabledByEnv: process.env.LLM_DISABLED === "1" });
});

llmRouter.get("/roles", async (_req, res) => {
  try {
    res.json({ roles: await listRoles(getPool()) });
  } catch (e) {
    console.error("[llm]", redact(String((e as any)?.message || e)));
    res.status(500).json({ error: "errore interno" });
  }
});

llmRouter.get("/usage", async (_req, res) => {
  try {
    res.json(await summary(getPool()));
  } catch (e) {
    console.error("[llm]", redact(String((e as any)?.message || e)));
    res.status(500).json({ error: "errore interno" });
  }
});
