// Rotte di sola lettura su PostgreSQL. Tappa M1 parte 2.
// Attenzione: fino alla tappa M4 (autenticazione) queste rotte non sono protette: tenere l'istanza in rete locale.
import { Router, type Request, type Response } from "express";
import { getPool, hasDatabase, redact } from "../db/pool";
import { VaultRepository } from "../db/vaultRepository";
import { parsePaging, parseResourceFilters } from "./dataParams";

export const dataRouter = Router();

/** Utente unico finche' non c'e' l'autenticazione (M4). Modificabile con VAULT_USER_ID. */
export const currentUserId = (): string => process.env.VAULT_USER_ID || "local-vault-user";

const repo = () => new VaultRepository(getPool());

function fail(res: Response, e: unknown) {
  console.error("[data]", redact(String((e as any)?.message || e)));
  res.status(500).json({ error: "errore interno" });
}

dataRouter.use((_req, res, next) => {
  if (!hasDatabase()) return void res.status(503).json({ error: "database non configurato" });
  next();
});

dataRouter.get("/status", async (_req, res) => {
  try {
    res.json({ database: "ok", ...(await repo().stats(currentUserId())) });
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.get("/resources", async (req: Request, res: Response) => {
  const paging = parsePaging(req.query);
  if ("error" in paging) return void res.status(400).json(paging);
  const filters = parseResourceFilters(req.query);
  if ("error" in filters) return void res.status(400).json(filters);
  try {
    res.json(await repo().listResources({ userId: currentUserId(), ...filters, ...paging }));
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.get("/resources/:id", async (req, res) => {
  try {
    const r = await repo().getResource(currentUserId(), req.params.id);
    r ? res.json(r) : res.status(404).json({ error: "risorsa non trovata" });
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.get("/raw-files", async (req, res) => {
  const paging = parsePaging(req.query);
  if ("error" in paging) return void res.status(400).json(paging);
  try {
    res.json(await repo().listRawFiles(currentUserId(), paging.limit, paging.offset));
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.get("/raw-files/:id", async (req, res) => {
  try {
    const f = await repo().getRawFile(currentUserId(), req.params.id, req.query.includeData === "true");
    f ? res.json(f) : res.status(404).json({ error: "file non trovato" });
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.get("/raw-files/:id/chunks", async (req, res) => {
  const paging = parsePaging(req.query);
  if ("error" in paging) return void res.status(400).json(paging);
  try {
    if (!(await repo().getRawFile(currentUserId(), req.params.id))) return void res.status(404).json({ error: "file non trovato" });
    res.json({ items: await repo().listChunks(currentUserId(), req.params.id, paging.limit, paging.offset), limit: paging.limit, offset: paging.offset });
  } catch (e) {
    fail(res, e);
  }
});
