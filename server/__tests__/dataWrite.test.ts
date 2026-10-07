/**
 * Prove delle scritture (M1 parte 3) e della ricerca per prefisso.
 * Le prove sul database girano in uno SCHEMA TEMPORANEO (creato e poi eliminato): i dati veri in `public` non vengono toccati
 * (a inizio e fine si controlla un'impronta delle risorse dell'utente reale).
 * Senza DATABASE_URL girano solo le prove di validazione.
 * Uso: DATABASE_URL=... npm run test:data-write
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { AlreadyExistsError, BatchError, ConflictError, NotFoundError, ValidationError } from "../db/errors";
import { closePool, getPool, hasDatabase, redact } from "../db/pool";
import { VaultRepository } from "../db/vaultRepository";
import { parseBatchBody, parseChunksBody, parseRawFileBody, parseResourceBody } from "../routes/dataValidation";

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string, details?: string) {
  if (cond) {
    passed++;
    console.log(`  OK   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${details ? " -> " + details : ""}`);
  }
}
async function throwsA(fn: () => Promise<unknown> | unknown, cls: new (...a: any[]) => Error): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof cls;
  }
}

function validationTests() {
  console.log("== validazione dei corpi");
  const t = (f: () => unknown) => throwsA(f, ValidationError);
  const ok = parseResourceBody({ id: "abc_1", title: "T", tags: ["a"], rating: 3.6, metadata: { x: 1 }, strano: { y: 1 }, userId: "hacker", updatedAt: "2000-01-01" }, "create");
  assert(ok.data.id === "abc_1" && ok.data.rating === 4 && (ok.data.extra as any).strano.y === 1 && !("userId" in (ok.data.extra ?? {})) && !("updatedAt" in (ok.data.extra ?? {})), "campi noti, extra, userId e updatedAt ignorati");
  assert(parseResourceBody({ title: "x", expectedUpdatedAt: "2026-01-01T00:00:00Z" }, "patch").expectedUpdatedAt === "2026-01-01T00:00:00.000Z", "expectedUpdatedAt normalizzato");
  const cases: [string, () => unknown][] = [
    ["corpo non oggetto", () => parseResourceBody("ciao", "create")],
    ["id con barra", () => parseResourceBody({ id: "a/b" }, "create")],
    ["type vuoto", () => parseResourceBody({ type: " " }, "create")],
    ["title non testo", () => parseResourceBody({ title: 5 }, "create")],
    ["title null", () => parseResourceBody({ title: null }, "create")],
    ["tags non lista", () => parseResourceBody({ tags: "a" }, "create")],
    ["tag non testo", () => parseResourceBody({ tags: [1] }, "create")],
    ["rating fuori limite", () => parseResourceBody({ rating: 99 }, "create")],
    ["rating testo", () => parseResourceBody({ rating: "x" }, "create")],
    ["metadata array", () => parseResourceBody({ metadata: [] }, "create")],
    ["carattere NUL nel titolo", () => parseResourceBody({ title: "a\u0000b" }, "create")],
    ["NUL dentro metadata", () => parseResourceBody({ metadata: { k: "a\u0000b" } }, "create")],
    ["patch vuota", () => parseResourceBody({}, "patch")],
    ["expectedUpdatedAt non data", () => parseResourceBody({ title: "x", expectedUpdatedAt: "ieri" }, "patch")],
    ["file senza fileName", () => parseRawFileBody({}, "create")],
    ["status non valido", () => parseRawFileBody({ fileName: "a", status: "boh" }, "create")],
    ["fileSize negativo", () => parseRawFileBody({ fileName: "a", fileSize: -1 }, "create")],
    ["pezzi mancanti", () => parseChunksBody({})],
    ["pezzo non testo", () => parseChunksBody({ chunks: [1] })],
    ["batch vuoto", () => parseBatchBody({ ops: [] })],
    ["batch op sconosciuta", () => parseBatchBody({ ops: [{ op: "boh" }] })],
    ["batch patch senza id", () => parseBatchBody({ ops: [{ op: "patch", data: { title: "x" } }] })],
    ["batch oltre 500", () => parseBatchBody({ ops: Array.from({ length: 501 }, () => ({ op: "delete", id: "a" })) })],
  ];
  return Promise.all(cases.map(async ([n, f]) => assert(await t(f), `rifiutato: ${n}`)));
}

async function applyMigrations(admin: pg.Client, schema: string) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8").replace("SET LOCAL search_path TO public;", `SET LOCAL search_path TO ${schema}, public;`);
    await admin.query("BEGIN");
    try {
      await admin.query(sql);
      await admin.query("COMMIT");
    } catch (e) {
      await admin.query("ROLLBACK");
      throw e;
    }
  }
}

const fingerprint = async (admin: pg.Client) =>
  (await admin.query("SELECT count(*)::int n, md5(coalesce(string_agg(id || updated_at::text, ',' ORDER BY id), '')) h FROM public.resources")).rows[0];

async function dbTests() {
  const schema = "kvtest_" + Math.random().toString(36).slice(2, 10);
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  const before = await fingerprint(admin);
  await admin.query(`CREATE SCHEMA ${schema}`);
  try {
    await applyMigrations(admin, schema);
    process.env.VAULT_DB_SCHEMA = schema;
    await closePool();
    const repo = new VaultRepository(getPool());
    const U = "utente-test";
    const list = (o: any = {}) => repo.listResources({ userId: U, limit: 200, offset: 0, ...o });

    console.log("== scrittura di risorse");
    const c1 = await repo.createResource(U, { id: "r1", type: "article", title: "Guida a PostgreSQL", summary: "Come usare il database", tags: ["db", "sql"], metadata: { relations: [{ targetTitle: "Altro", relationType: "related", weight: 0.5, targetId: "r2" }, { relationType: "x" }] } });
    assert(c1.resource.id === "r1" && c1.resource.title === "Guida a PostgreSQL" && !!c1.resource.createdAt, "creazione con id");
    assert((await repo.listRelations("r1")).length === 1, "relazioni create da metadata.relations (quella senza titolo scartata)");
    const c2 = await repo.createResource(U, { title: "Senza id" });
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(c2.resource.id) && c2.resource.type === "note" && c2.resource.isFavorite === false, "senza id: uuidv7 e valori predefiniti");
    assert(await throwsA(() => repo.createResource(U, { id: "r1", title: "doppione" }), AlreadyExistsError), "id gia' esistente -> AlreadyExistsError");

    console.log("== modifica parziale e conflitti");
    const p1 = await repo.patchResource(U, "r1", { title: "Zebra quantistica" });
    assert(p1.resource.title === "Zebra quantistica" && p1.previous.title === "Guida a PostgreSQL", "RETURNING OLD/NEW: restituisce titolo nuovo e precedente");
    assert(p1.resource.summary === "Come usare il database" && sameArr(p1.resource.tags, ["db", "sql"]), "i campi non indicati restano invariati");
    assert(p1.resource.updatedAt! > p1.previous.updatedAt!, "updatedAt aumenta");
    assert((await list({ q: "zebra" })).items.some((x) => x.id === "r1") && !(await list({ q: "guida" })).items.some((x) => x.id === "r1"), "la ricerca segue la modifica del titolo");
    const okExp = await repo.patchResource(U, "r1", { isFavorite: true }, p1.resource.updatedAt);
    assert(okExp.resource.isFavorite === true, "modifica con updatedAt atteso corretto");
    let conflict: any = null;
    try {
      await repo.patchResource(U, "r1", { title: "vecchia versione" }, p1.resource.updatedAt);
    } catch (e) {
      conflict = e;
    }
    assert(conflict instanceof ConflictError && conflict.currentUpdatedAt === okExp.resource.updatedAt, "updatedAt vecchio -> ConflictError con l'updatedAt attuale");
    assert((await repo.getResource(U, "r1"))!.title === "Zebra quantistica", "dopo il conflitto la riga non e' cambiata");
    assert(await throwsA(() => repo.patchResource(U, "non-esiste", { title: "x" }), NotFoundError), "id inesistente -> NotFoundError");
    assert(await throwsA(() => repo.patchResource("altro-utente", "r1", { title: "x" }), NotFoundError), "risorsa di un altro utente -> NotFoundError");
    await repo.patchResource(U, "r1", { metadata: { nota: 1 } });
    assert((await repo.listRelations("r1")).length === 0, "le relazioni si riallineano quando cambia metadata");
    const px = await repo.patchResource(U, "r1", { extra: { a: 1 } });
    const py = await repo.patchResource(U, "r1", { extra: { b: 2 } });
    assert((px.resource as any).a === 1 && (py.resource as any).a === 1 && (py.resource as any).b === 2, "i campi extra si fondono");
    assert((await repo.patchResource(U, "r1", { rating: null, url: null })).resource.rating === undefined, "rating e url si possono azzerare con null");

    console.log("== sostituzione completa (upsert)");
    const u1 = await repo.upsertResource(U, "r3", { title: "Nuova", type: "paper", tags: ["x"] });
    assert(u1.created === true && u1.previousUpdatedAt === undefined, "upsert di una risorsa nuova");
    const u2 = await repo.upsertResource(U, "r3", { title: "Sostituita" });
    assert(u2.created === false && u2.resource.type === "note" && u2.resource.tags.length === 0 && u2.resource.createdAt === u1.resource.createdAt && !!u2.previousUpdatedAt, "upsert sostituisce tutto e conserva createdAt");
    assert(await throwsA(() => repo.upsertResource(U, "r3", { title: "x" }, "2001-01-01T00:00:00.000Z"), ConflictError), "upsert con updatedAt vecchio -> ConflictError");
    assert(await throwsA(() => repo.upsertResource("altro-utente", "r3", { title: "furto" }), AlreadyExistsError), "upsert su id di un altro utente rifiutato");

    console.log("== cancellazione");
    await repo.patchResource(U, "r1", { metadata: { relations: [{ targetTitle: "T", relationType: "related" }] } });
    assert((await repo.listRelations("r1")).length === 1, "(preparazione) relazione presente");
    const cur = (await repo.getResource(U, "r1"))!;
    assert(await throwsA(() => repo.deleteResource(U, "r1", "2001-01-01T00:00:00.000Z"), ConflictError) && !!(await repo.getResource(U, "r1")), "cancellazione con updatedAt vecchio -> ConflictError, la riga resta");
    const del = await repo.deleteResource(U, "r1", cur.updatedAt);
    assert(del.deleted.id === "r1" && (await repo.getResource(U, "r1")) === null && (await repo.listRelations("r1")).length === 0, "cancellazione: restituisce la riga e toglie le relazioni");
    assert(await throwsA(() => repo.deleteResource(U, "r1"), NotFoundError), "cancellare due volte -> NotFoundError");

    console.log("== operazioni a blocchi");
    const b = await repo.batchResources(U, [
      { op: "create", data: { id: "b1", title: "uno" } },
      { op: "upsert", data: { id: "b2", title: "due" } },
      { op: "patch", id: "b1", data: { title: "uno bis" } },
      { op: "delete", id: "r3" },
    ]);
    assert(b.length === 4 && (await repo.getResource(U, "b1"))!.title === "uno bis" && (await repo.getResource(U, "r3")) === null, "blocco riuscito: 4 operazioni");
    const n0 = (await list()).total;
    let be: any = null;
    try {
      await repo.batchResources(U, [{ op: "create", data: { id: "b3", title: "tre" } }, { op: "patch", id: "b1", data: { title: "x" }, expectedUpdatedAt: "2001-01-01T00:00:00.000Z" }]);
    } catch (e) {
      be = e;
    }
    assert(be instanceof BatchError && be.opIndex === 1 && be.cause instanceof ConflictError, "blocco con conflitto: BatchError indica l'operazione 1");
    assert((await list()).total === n0 && (await repo.getResource(U, "b3")) === null, "blocco fallito: nessuna modifica (tutto annullato)");

    console.log("== ricerca per prefisso");
    await repo.createResource(U, { id: "s1", title: "Corso di PostgreSQL avanzato", summary: "indici e vettori" });
    await repo.createResource(U, { id: "s2", title: "Ricetta della pasta", summary: "cucina" });
    const ids = async (q: string) => (await list({ q })).items.map((x) => x.id);
    assert((await ids("postgres")).includes("s1"), '"postgres" trova PostgreSQL');
    assert((await ids("postgresq")).includes("s1"), '"postgresq" trova PostgreSQL');
    assert((await ids("corso postgres")).includes("s1") && !(await ids("corso postgres")).includes("s2"), '"corso postgres": parole intere + prefisso finale');
    assert((await ids("indic")).includes("s1"), "prefisso nel riassunto");
    assert(!(await ids('"postgres"')).includes("s1"), 'tra virgolette il prefisso non si applica');
    assert((await ids("corso -ricetta")).includes("s1") && !(await ids("corso -corso")).includes("s1"), "esclusione con il segno meno: funziona e non applica il prefisso");
    assert(!(await ids("postgres pasta")).includes("s2") && !(await ids("postgres pasta")).includes("s1"), "due parole: entrambe richieste");
    assert((await ids("pasta")).includes("s2"), "parola intera continua a funzionare");
    assert((await ids("p")).length === 0, "una lettera sola non fa prefisso");
    assert((await ids("")).length === (await list()).total, "testo vuoto = nessuna ricerca (elenco completo)");

    console.log("== file grezzi e pezzi");
    const f1 = await repo.createRawFile(U, { id: "f1", fileName: "a.pdf", fileSize: 10, fileType: "pdf", mimeType: "application/pdf" });
    assert(f1.file.status === "raw" && f1.file.hasChunks === false, "creazione file grezzo");
    const fp = await repo.patchRawFile(U, "f1", { status: "converting" });
    assert(fp.file.status === "converting" && fp.previousStatus === "raw", "cambio stato con stato precedente (RETURNING OLD)");
    assert(await throwsA(() => repo.patchRawFile(U, "f1", { status: "boh" as any }), Error), "status non ammesso dal database");
    await repo.replaceChunks(U, "f1", ["uno", "due", "tre"]);
    assert((await repo.listChunks(U, "f1", 10, 0)).map((c) => c.content).join() === "uno,due,tre" && (await repo.getRawFile(U, "f1"))!.totalChunks === 3 && (await repo.getRawFile(U, "f1"))!.hasChunks === true, "pezzi sostituiti, in ordine, con conteggio");
    await repo.replaceChunks(U, "f1", ["solo"]);
    assert((await repo.listChunks(U, "f1", 10, 0)).length === 1, "seconda sostituzione: resta un solo pezzo");
    assert(await throwsA(() => repo.replaceChunks("altro-utente", "f1", ["x"]), NotFoundError), "pezzi di un file altrui -> NotFoundError");
    await repo.deleteRawFile(U, "f1");
    const left = await admin.query(`SELECT count(*)::int n FROM ${schema}.raw_file_chunks`);
    assert(left.rows[0].n === 0 && (await repo.getRawFile(U, "f1")) === null, "cancellazione del file toglie anche i pezzi");

    console.log("== rotte HTTP");
    const { dataRouter } = await import("../routes/dataRoutes");
    process.env.VAULT_USER_ID = U;
    const app = express();
    app.use(express.json());
    app.use("/api/data", dataRouter);
    const server: http.Server = await new Promise((ok) => {
      const s = app.listen(0, "127.0.0.1", () => ok(s));
    });
    const base = `http://127.0.0.1:${(server.address() as any).port}/api/data`;
    const call = async (method: string, p: string, body?: unknown) => {
      const r = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    };
    try {
      const a = await call("POST", "/resources", { id: "h1", title: "http", tags: ["t"] });
      assert(a.status === 201 && a.body.resource.id === "h1", "POST /resources -> 201");
      assert((await call("POST", "/resources", { id: "h1" })).status === 409, "POST con id esistente -> 409");
      assert((await call("POST", "/resources", { rating: "x" })).status === 400, "POST con rating non valido -> 400");
      assert((await call("POST", "/resources", { title: "a\u0000b" })).status === 400, "POST con carattere NUL -> 400");
      const pu = await call("PUT", "/resources/h2", { title: "due" });
      assert(pu.status === 201 && pu.body.created === true, "PUT nuova -> 201");
      assert((await call("PUT", "/resources/h2", { title: "due bis" })).status === 200, "PUT esistente -> 200");
      const pa = await call("PATCH", "/resources/h1", { title: "http bis", expectedUpdatedAt: a.body.resource.updatedAt });
      assert(pa.status === 200 && pa.body.previous.title === "http", "PATCH -> 200 con previous");
      const pc = await call("PATCH", "/resources/h1", { title: "x", expectedUpdatedAt: a.body.resource.updatedAt });
      assert(pc.status === 409 && pc.body.currentUpdatedAt === pa.body.resource.updatedAt, "PATCH con updatedAt vecchio -> 409 e currentUpdatedAt");
      assert((await call("PATCH", "/resources/h1", {})).status === 400, "PATCH vuota -> 400");
      assert((await call("PATCH", "/resources/nonesiste", { title: "x" })).status === 404, "PATCH inesistente -> 404");
      assert((await call("PATCH", "/resources/a%2Fb", { title: "x" })).status === 400, "id non valido nell'indirizzo -> 400");
      const bt = await call("POST", "/resources/batch", { ops: [{ op: "create", data: { id: "h3", title: "tre" } }, { op: "delete", id: "h2" }] });
      assert(bt.status === 200 && bt.body.results.length === 2, "POST /resources/batch -> 200");
      const bf = await call("POST", "/resources/batch", { ops: [{ op: "create", data: { id: "h4" } }, { op: "delete", id: "nonesiste" }] });
      assert(bf.status === 404 && bf.body.opIndex === 1, "batch con id inesistente -> 404 e opIndex");
      assert((await call("GET", "/resources/h4")).status === 404, "dopo il batch fallito h4 non esiste");
      const dc = await call("DELETE", `/resources/h1?expectedUpdatedAt=2001-01-01T00:00:00Z`);
      assert(dc.status === 409, "DELETE con updatedAt vecchio -> 409");
      assert((await call("DELETE", "/resources/h1")).status === 200 && (await call("DELETE", "/resources/h1")).status === 404, "DELETE -> 200, poi 404");
      const rf = await call("POST", "/raw-files", { id: "hf", fileName: "x.txt" });
      assert(rf.status === 201, "POST /raw-files -> 201");
      assert((await call("PUT", "/raw-files/hf/chunks", { chunks: ["a", { content: "b" }] })).body.totalChunks === 2, "PUT chunks -> 2 pezzi");
      assert((await call("GET", "/raw-files/hf/chunks")).body.items.length === 2, "GET chunks -> 2 pezzi");
      assert((await call("PATCH", "/raw-files/hf", { status: "boh" })).status === 400, "PATCH raw-file con status non valido -> 400");
      assert((await call("DELETE", "/raw-files/hf")).status === 200, "DELETE /raw-files -> 200");
    } finally {
      await new Promise((ok) => server.close(ok));
    }
  } finally {
    await closePool();
    delete process.env.VAULT_DB_SCHEMA;
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    const after = await fingerprint(admin);
    assert(after.n === before.n && after.h === before.h, `dati veri intatti (${after.n} risorse, impronta uguale prima e dopo)`);
    const left = await admin.query("SELECT count(*)::int n FROM pg_namespace WHERE nspname = $1", [schema]);
    assert(left.rows[0].n === 0, "schema temporaneo eliminato");
    await admin.end();
  }
}
const sameArr = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function main() {
  await validationTests();
  if (hasDatabase()) await dbTests();
  else console.log("== database: SALTATE (DATABASE_URL non impostata)");
  console.log(`\nRisultato: ${passed} superati, ${failed} falliti`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error("ERRORE:", redact(String(e?.stack || e?.message || e)));
  process.exit(1);
});
