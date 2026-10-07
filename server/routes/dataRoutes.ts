// Rotte su PostgreSQL: letture (M1 parte 2) e scritture (M1 parte 3).
// Attenzione: fino alla tappa M4 (autenticazione) queste rotte non sono protette: tenere l'istanza in rete locale.
import { Router, type Request, type Response } from "express";
import { getPool, hasDatabase, redact } from "../db/pool";
import { VaultRepository } from "../db/vaultRepository";
import { AlreadyExistsError, BatchError, ConflictError, NotFoundError, ValidationError } from "../db/errors";
import { parsePaging, parseResourceFilters } from "./dataParams";
import { parseBatchBody, parseChunksBody, parseExpected, parseId, parseRawFileBody, parseResourceBody } from "./dataValidation";

export const dataRouter = Router();

/** Utente unico finche' non c'e' l'autenticazione (M4). Modificabile con VAULT_USER_ID. */
export const currentUserId = (): string => process.env.VAULT_USER_ID || "local-vault-user";

const repo = () => new VaultRepository(getPool());

function fail(res: Response, e: unknown) {
  if (e instanceof BatchError) {
    const status = e.cause instanceof NotFoundError ? 404 : e.cause instanceof ConflictError || e.cause instanceof AlreadyExistsError ? 409 : e.cause instanceof ValidationError ? 400 : 500;
    if (status === 500) console.error("[data]", redact(String(e.cause?.message || e.cause)));
    return void res.status(status).json({ error: status === 500 ? "errore interno" : e.message, opIndex: e.opIndex });
  }
  if (e instanceof ValidationError) return void res.status(400).json({ error: e.message });
  if (e instanceof NotFoundError) return void res.status(404).json({ error: e.message });
  if (e instanceof ConflictError) return void res.status(409).json({ error: e.message, currentUpdatedAt: e.currentUpdatedAt });
  if (e instanceof AlreadyExistsError) return void res.status(409).json({ error: e.message });
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

// ---------------------------------------------------------------- scritture
// Il controllo dei conflitti e' facoltativo: se il corpo (o ?expectedUpdatedAt=) contiene l'updatedAt letto
// in precedenza e nel frattempo la riga e' cambiata, la risposta e' 409 con currentUpdatedAt.

dataRouter.post("/resources", async (req, res) => {
  try {
    const { data } = parseResourceBody(req.body, "create");
    res.status(201).json(await repo().createResource(currentUserId(), data));
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.post("/resources/batch", async (req, res) => {
  try {
    const ops = parseBatchBody(req.body);
    res.json({ results: await repo().batchResources(currentUserId(), ops) });
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.put("/resources/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { data, expectedUpdatedAt } = parseResourceBody(req.body, "put");
    const out = await repo().upsertResource(currentUserId(), id, data, expectedUpdatedAt);
    res.status(out.created ? 201 : 200).json(out);
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.patch("/resources/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { data, expectedUpdatedAt } = parseResourceBody(req.body, "patch");
    res.json(await repo().patchResource(currentUserId(), id, data, expectedUpdatedAt));
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.delete("/resources/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    res.json(await repo().deleteResource(currentUserId(), id, parseExpected(req.query as any)));
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.post("/raw-files", async (req, res) => {
  try {
    const { data } = parseRawFileBody(req.body, "create");
    res.status(201).json(await repo().createRawFile(currentUserId(), data));
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.patch("/raw-files/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { data, expectedUpdatedAt } = parseRawFileBody(req.body, "patch");
    res.json(await repo().patchRawFile(currentUserId(), id, data, expectedUpdatedAt));
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.delete("/raw-files/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    res.json(await repo().deleteRawFile(currentUserId(), id, parseExpected(req.query as any)));
  } catch (e) {
    fail(res, e);
  }
});

dataRouter.put("/raw-files/:id/chunks", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    res.json(await repo().replaceChunks(currentUserId(), id, parseChunksBody(req.body)));
  } catch (e) {
    fail(res, e);
  }
});
