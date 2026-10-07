/**
 * Prove del livello dati in sola lettura (M1 parte 2).
 * - Senza DATABASE_URL: solo prove sulle funzioni pure (parametri, conversione righe).
 * - Con DATABASE_URL: prove sul database; con VAULT_BACKUP_JSON confronta anche con il backup di origine.
 * Uso: DATABASE_URL=... [VAULT_BACKUP_JSON=percorso] npm run test:data
 */
import fs from "node:fs";
import http from "node:http";
import express from "express";
import { parsePaging, parseResourceFilters, MAX_LIMIT } from "../routes/dataParams";
import { rowToResource, rowToRawFile, VaultRepository } from "../db/vaultRepository";
import { closePool, getPool, hasDatabase, redact } from "../db/pool";
import { dataRouter, currentUserId } from "../routes/dataRoutes";

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
// Serializzazione con le chiavi in ordine: jsonb non conserva l'ordine delle chiavi degli oggetti.
const canon = (v: any): string =>
  Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}` : JSON.stringify(v);
const sameJson = (a: unknown, b: unknown) => canon(a) === canon(b);

function unitTests() {
  console.log("== funzioni pure");
  assert(sameJson(parsePaging({}), { limit: 50, offset: 0 }), "paginazione predefinita");
  assert(sameJson(parsePaging({ limit: "10", offset: "20" }), { limit: 10, offset: 20 }), "paginazione valida");
  assert("error" in parsePaging({ limit: "0" }), "limit=0 rifiutato");
  assert("error" in parsePaging({ limit: String(MAX_LIMIT + 1) }), "limit oltre il massimo rifiutato");
  assert("error" in parsePaging({ limit: "abc" }), "limit non numerico rifiutato");
  assert("error" in parsePaging({ offset: "-1" }), "offset negativo rifiutato");
  assert(sameJson(parseResourceFilters({ favorite: "true", tag: " ai ", type: "paper" }), { type: "paper", tag: "ai", favorite: true }), "filtri validi");
  assert("error" in parseResourceFilters({ favorite: "si" }), "favorite non booleano rifiutato");
  assert("error" in parseResourceFilters({ sort: "casuale" }), "sort sconosciuto rifiutato");
  assert("error" in parseResourceFilters({ sort: "relevance" }), "sort=relevance senza q rifiutato");
  assert("error" in parseResourceFilters({ q: "x".repeat(201) }), "q troppo lunga rifiutata");
  const r = rowToResource({
    id: "a", user_id: "u", type: "note", title: "T", url: null, raw_input: null, summary: "S", tags: ["x"], is_favorite: true,
    rating: null, metadata: { k: 1 }, extra: { campoExtra: 7 }, created_at: new Date("2026-01-02T03:04:05Z"), updated_at: new Date("2026-01-03T00:00:00Z"),
  });
  assert(r.createdAt === "2026-01-02T03:04:05.000Z" && r.url === undefined && (r as any).campoExtra === 7 && r.isFavorite === true, "riga -> risorsa (date ISO, extra, nulli)");
  assert(rowToRawFile({ id: "f", user_id: "u", file_name: "a.pdf", file_size: "12", file_type: "pdf", mime_type: "application/pdf", status: "raw", has_chunks: false, extra: {}, created_at: new Date(0), updated_at: new Date(0) }).fileSize === 12, "riga -> file grezzo (dimensione numerica)");
  assert(redact("errore postgres://kv:segreta@host/db fine") === "errore [REDATTO] fine", "password nascosta nei messaggi");
}

async function httpGet(base: string, path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
}

async function dbTests() {
  console.log("== database");
  const repo = new VaultRepository(getPool());
  const uid = currentUserId();
  const all = await repo.listResources({ userId: uid, limit: 200, offset: 0 });
  assert(all.total > 0 && all.items.length === Math.min(all.total, 200), `elenco: ${all.total} risorse`, `total=${all.total} items=${all.items.length}`);

  // paginazione: tutte le pagine insieme = elenco completo, senza duplicati
  const seen: string[] = [];
  for (let off = 0; off < all.total; off += 25) seen.push(...(await repo.listResources({ userId: uid, limit: 25, offset: off, sort: "oldest" })).items.map((x) => x.id));
  assert(seen.length === all.total && new Set(seen).size === all.total, "paginazione completa senza duplicati");

  const stats = await repo.stats(uid);
  assert(stats.resources === all.total && stats.migrations.length >= 2, "statistiche coerenti", JSON.stringify(stats));

  const first = all.items[0];
  const one = await repo.getResource(uid, first.id);
  assert(!!one && one.id === first.id && Array.isArray(one.relations), "lettura per id con relazioni");
  assert((await repo.getResource(uid, "id-che-non-esiste")) === null, "id inesistente -> null");
  assert((await repo.listResources({ userId: "altro-utente", limit: 10, offset: 0 })).total === 0, "un altro utente non vede nulla");

  const tag = all.items.find((x) => x.tags.length)?.tags[0];
  if (tag) {
    const t = await repo.listResources({ userId: uid, tag, limit: 200, offset: 0 });
    assert(t.total > 0 && t.items.every((x) => x.tags.includes(tag)), `filtro per tag "${tag}"`);
  }
  // un titolo che e' un indirizzo web viene scomposto da PostgreSQL come URL: si sceglie un titolo normale
  const plain = all.items.find((x) => !/^https?:/i.test(x.title) && /\p{L}{5,}/u.test(x.title));
  const word = plain && (plain.title.match(/\p{L}{5,}/u) || [])[0];
  if (plain && word) {
    const s = await repo.listResources({ userId: uid, q: word, limit: 200, offset: 0 });
    assert(s.items.some((x) => x.id === plain.id), `ricerca testuale "${word}" trova la risorsa`);
  }
  // prefisso sui dati veri: ogni risorsa con una parola che inizia per "postgres" deve essere trovata
  const pre = await getPool().query("SELECT id FROM resources WHERE user_id = $1 AND (title ~* '\\mpostgres' OR summary ~* '\\mpostgres' OR array_to_string(tags,' ') ~* '\\mpostgres')", [uid]);
  const found = new Set((await repo.listResources({ userId: uid, q: "postgres", limit: 200, offset: 0 })).items.map((x) => x.id));
  assert(pre.rows.length > 0 && pre.rows.every((r: any) => found.has(r.id)), `ricerca "postgres" trova tutte le ${pre.rows.length} risorse con parole che iniziano cosi'`);
  assert((await repo.listResources({ userId: uid, q: 'a "b c" -d OR e', limit: 5, offset: 0 })).total >= 0, "sintassi di ricerca con virgolette e OR accettata");
  for (const sort of ["newest", "oldest", "title", "title_desc", "type", "favorites"] as const) {
    assert((await repo.listResources({ userId: uid, sort, limit: 5, offset: 0 })).items.length > 0, `ordinamento ${sort}`);
  }
  const raw = await repo.listRawFiles(uid, 10, 0);
  assert(raw.total >= 0 && raw.items.every((f) => f.base64Data === undefined), "elenco file grezzi senza contenuto base64");

  const backupPath = process.env.VAULT_BACKUP_JSON;
  if (backupPath) {
    console.log("== confronto con il backup di origine");
    const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    const src: any[] = backup.resources;
    assert(src.length === all.total, `numero di risorse: file ${src.length}, database ${all.total}`);
    const byId = new Map(all.items.map((x) => [x.id, x]));
    let diff = 0;
    for (const s of src) {
      const d: any = byId.get(s.id);
      if (!d || d.title !== s.title || d.type !== s.type || (d.summary ?? "") !== (s.summary ?? "") || !sameJson(d.tags, s.tags ?? []) || !sameJson(d.metadata, s.metadata ?? {}) || !!d.isFavorite !== !!s.isFavorite) diff++;
    }
    assert(diff === 0, "campi principali e metadata identici al backup", `${diff} risorse diverse`);
  }

  console.log("== rotte HTTP");
  const app = express();
  app.use("/api/data", dataRouter);
  const server: http.Server = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/data`;
  try {
    const st = await httpGet(base, "/status");
    assert(st.status === 200 && st.body.resources === all.total, "GET /status");
    const lst = await httpGet(base, "/resources?limit=3&sort=title");
    assert(lst.status === 200 && lst.body.items.length === 3 && lst.body.total === all.total, "GET /resources con limit e sort");
    assert((await httpGet(base, "/resources?limit=0")).status === 400, "GET /resources?limit=0 -> 400");
    assert((await httpGet(base, "/resources?sort=boh")).status === 400, "GET /resources?sort=boh -> 400");
    assert((await httpGet(base, `/resources/${encodeURIComponent(first.id)}`)).status === 200, "GET /resources/:id -> 200");
    assert((await httpGet(base, "/resources/nonesiste")).status === 404, "GET /resources/nonesiste -> 404");
    assert((await httpGet(base, "/raw-files")).status === 200, "GET /raw-files");
    assert((await httpGet(base, "/raw-files/nonesiste/chunks")).status === 404, "GET /raw-files/nonesiste/chunks -> 404");
    const post = await fetch(base + "/resources", { method: "POST" });
    assert(post.status === 400, "POST /resources senza corpo valido e' rifiutato (le scritture si provano in test:data-write)");
  } finally {
    await new Promise((ok) => server.close(ok));
  }
}

async function main() {
  unitTests();
  if (hasDatabase()) {
    await dbTests();
  } else {
    console.log("== database: SALTATE (DATABASE_URL non impostata)");
    // senza database le rotte rispondono 503
    const app = express();
    app.use("/api/data", dataRouter);
    const server: http.Server = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
    try {
      const r = await httpGet(`http://127.0.0.1:${(server.address() as any).port}/api/data/status`, "");
      assert(r.status === 503, "senza database le rotte rispondono 503");
    } finally {
      await new Promise((ok) => server.close(ok));
    }
  }
  await closePool();
  console.log(`\nRisultato: ${passed} superati, ${failed} falliti`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRORE:", redact(String(e?.message || e)));
  process.exit(1);
});
