/**
 * Prova con chiamate VERE a OpenRouter, con budget massimo. Gira in uno schema temporaneo (poi eliminato):
 * non scrive nel registro vero. Verifica: costo letto = costo registrato (e = variazione dell'account), blocco PRIMA della
 * chiamata per modello costoso / senza prezzo / limite stretto.
 * Uso: OPENROUTER_API_KEY=... DATABASE_URL=... npx tsx server/scripts/llmLiveCheck.ts [--max-usd 0.05]
 * La chiave non viene mai stampata.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { closePool, getPool, redact } from "../db/pool";
import { baseUrl, getModelPrice } from "../llm/pricing";
import { generate } from "../llm/llmClient";

const arg = process.argv.indexOf("--max-usd");
const CAP = arg >= 0 ? Number(process.argv[arg + 1]) : 0.05;
const KEY = process.env.OPENROUTER_API_KEY || "";
const mask = (s: string) => s.split(KEY).join("[REDATTO]").replace(/sk-or-[A-Za-z0-9_-]+/g, "[REDATTO]");

async function accountUsage(): Promise<number | null> {
  try {
    const r = await fetch(`${baseUrl()}/key`, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const u = (await r.json() as any)?.data?.usage;
    return typeof u === "number" ? u : null;
  } catch {
    return null;
  }
}

const schema = { type: "OBJECT", properties: { title: { type: "STRING" }, tags: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title", "tags"] };
const prompt = "Testo: 'PostgreSQL 18 introduce uuidv7() e RETURNING OLD/NEW, utili per id ordinati nel tempo e per vedere i valori prima e dopo una modifica.'\nCompito: dai un titolo breve e 3 tag.";

async function main() {
  if (!KEY.startsWith("sk-or-")) throw new Error("OPENROUTER_API_KEY mancante o non valida");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL non impostata");
  const schemaName = "kvlive_" + Math.random().toString(36).slice(2, 10);
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schemaName}`);
  let spent = 0;
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(s);
    console.log(mask(s));
  };
  try {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8").replace("SET LOCAL search_path TO public;", `SET LOCAL search_path TO ${schemaName}, public;`);
      await admin.query("BEGIN");
      await admin.query(sql);
      await admin.query("COMMIT");
    }
    process.env.VAULT_DB_SCHEMA = schemaName;
    await closePool();
    const db: any = getPool();
    const q = async (sql: string, v?: any[]) => (await admin.query(`SET search_path TO ${schemaName}, public`), admin.query(sql, v));
    const addRole = (role: string, model: string, extra = "") =>
      q(`INSERT INTO llm_roles (role, model, enabled, fallbacks, params, per_request_usd, daily_usd, monthly_usd, max_per_minute) VALUES ($1,$2,true,'{}',$3::jsonb, 0.01, 0.05, 0.05, 20)`, [role, model, JSON.stringify({ max_tokens: 400, temperature: 0.2, reasoning: { enabled: false }, timeout_ms: 90000, structured: "json_object", ...(extra ? JSON.parse(extra) : {}) })]);

    const before = await accountUsage();
    log(`budget massimo di questa prova: ${CAP} $ | consumo dell'account prima: ${before === null ? "non disponibile" : before.toFixed(6) + " $"}`);

    // A) due chiamate vere con il modello economico predefinito
    await addRole("live_cheap", "deepseek/deepseek-v4.1-flash");
    for (let i = 1; i <= 2; i++) {
      if (spent >= CAP) { log("STOP: budget della prova raggiunto"); break; }
      const r = await generate({ role: "live_cheap", prompt, schema, endpoint: "live-check" }, { db });
      if (r.ok === false) { log(`A${i} ERRORE: ${r.reason}`); continue; }
      spent += r.costUsd ?? 0;
      log(`A${i} ok | modello: ${r.model} | costo reale: ${r.costUsd?.toFixed(6)} $ | tentativi: ${r.attempts}`);
    }
    // B) un secondo modello con parametri propri per modello (override)
    await addRole("live_glm", "z-ai/glm-5.3-flash", JSON.stringify({ reasoning: { effort: "low" } }));
    if (spent < CAP) {
      const r = await generate({ role: "live_glm", prompt, schema, endpoint: "live-check" }, { db });
      if (r.ok === false) log(`B ERRORE: ${r.reason}`);
      else { spent += r.costUsd ?? 0; log(`B ok | modello: ${r.model} | costo reale: ${r.costUsd?.toFixed(6)} $`); }
    }
    // C) modello costosissimo (il piu' caro del catalogo reale): deve essere bloccato PRIMA di partire
    const cat: any = await (await fetch(`${baseUrl()}/models`)).json();
    const priciest = [...cat.data].filter((m: any) => Number(m.pricing?.completion) > 0).sort((a: any, b: any) => Number(b.pricing.completion) - Number(a.pricing.completion))[0];
    await addRole("live_costly", priciest.id);
    const pr = await getModelPrice(priciest.id);
    const rc = await generate({ role: "live_costly", prompt, schema, endpoint: "live-check" }, { db });
    log(`C modello piu' caro del catalogo (${priciest.id}, ${(pr!.completionUsdPerToken * 1e6).toFixed(0)} $/milione di token in uscita) -> ${rc.ok === false ? "BLOCCATO prima della chiamata: " + rc.reason : "ATTENZIONE: la chiamata e' partita!"}`);
    // D) modello inesistente: nessun prezzo -> bloccato
    await addRole("live_unknown", "nessuno/modello-che-non-esiste");
    const ru = await generate({ role: "live_unknown", prompt, schema, endpoint: "live-check" }, { db });
    log(`D modello senza prezzo -> ${ru.ok === false ? "BLOCCATO: " + ru.reason : "ATTENZIONE: la chiamata e' partita!"}`);
    // E) limite giornaliero stretto: dopo il consumo di A, il limite lascia meno della stima
    const used = Number((await q("SELECT coalesce(sum(counted_usd),0) s FROM llm_usage WHERE role = 'live_cheap'")).rows[0].s);
    await q("UPDATE llm_roles SET daily_usd = $1 WHERE role = 'live_cheap'", [(used + 0.00001).toFixed(6)]);
    const re = await generate({ role: "live_cheap", prompt, schema, endpoint: "live-check" }, { db });
    log(`E limite giornaliero stretto (${(used + 0.00001).toFixed(6)} $) -> ${re.ok === false ? "BLOCCATO: " + re.reason : "ATTENZIONE: la chiamata e' partita!"}`);

    // Riepilogo dal registro
    const rows = (await q("SELECT role, model, status, reserved_usd::float8 r, cost_usd::float8 c, counted_usd::float8 k, prompt_tokens pt, completion_tokens ct, reasoning_tokens rt, duration_ms ms FROM llm_usage ORDER BY id")).rows;
    log("\nregistro (schema temporaneo):");
    for (const x of rows) log(`  ${x.role.padEnd(12)} ${String(x.model).padEnd(34)} ${x.status.padEnd(8)} stima ${x.r.toFixed(6)} | reale ${x.c === null ? "-" : x.c.toFixed(6)} | contato ${x.k.toFixed(6)} | token ${x.pt ?? "-"}/${x.ct ?? "-"} (ragionamento ${x.rt ?? "-"}) | ${x.ms ?? "-"} ms`);
    const real = rows.filter((x) => x.status === "ok");
    const sumReal = real.reduce((t, x) => t + (x.c ?? 0), 0);
    log(`\nchiamate vere partite: ${rows.filter((x) => x.status !== "blocked").length} | bloccate prima della chiamata: ${rows.filter((x) => x.status === "blocked").length}`);
    log(`somma dei costi reali nel registro: ${sumReal.toFixed(6)} $ | stima totale massima delle chiamate partite: ${rows.filter((x) => x.status !== "blocked").reduce((t, x) => t + x.r, 0).toFixed(6)} $`);
    await new Promise((ok) => setTimeout(ok, 6000));
    const after = await accountUsage();
    if (before !== null && after !== null) log(`variazione del consumo dell'account (OpenRouter): ${(after - before).toFixed(6)} $ (puo' arrivare in ritardo di qualche secondo)`);
    else log("variazione del consumo dell'account: non disponibile");
    if (rc.ok || ru.ok || re.ok) process.exitCode = 2;
  } finally {
    await closePool();
    await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error("ERRORE:", mask(redact(String(e?.stack || e?.message || e))));
  process.exit(1);
});
