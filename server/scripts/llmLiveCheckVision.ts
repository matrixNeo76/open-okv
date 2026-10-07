/**
 * Prova con file VERI e chiamate vere a OpenRouter, ruolo `vision` (configurazione reale della migrazione 005), con budget massimo.
 * Gira in uno schema temporaneo (poi eliminato): non scrive nel registro vero.
 * Uso: OPENROUTER_API_KEY=... DATABASE_URL=... npx tsx server/scripts/llmLiveCheckVision.ts --image FILE.png --pdf FILE.pdf [--max-usd 0.5]
 * La chiave non viene mai stampata.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { closePool, getPool, redact } from "../db/pool";
import { baseUrl } from "../llm/pricing";
import { generate } from "../llm/llmClient";
import { estimateMedia, pdfPageCount } from "../llm/media";

const argv = process.argv;
const opt = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const CAP = Number(opt("--max-usd") ?? 0.5);
const imageFile = opt("--image");
const pdfFile = opt("--pdf");
const KEY = process.env.OPENROUTER_API_KEY || "";
const mask = (s: string) => s.split(KEY).join("[REDATTO]").replace(/sk-or-[A-Za-z0-9_-]+/g, "[REDATTO]");
const log = (s: string) => console.log(mask(s));

async function accountUsage(): Promise<number | null> {
  try {
    const r = await fetch(`${baseUrl()}/key`, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(15000) });
    const u = r.ok ? ((await r.json()) as any)?.data?.usage : null;
    return typeof u === "number" ? u : null;
  } catch {
    return null;
  }
}

const schemaImg = { type: "OBJECT", properties: { text: { type: "STRING" }, description: { type: "STRING" } }, required: ["text", "description"] };
const schemaPdf = { type: "OBJECT", properties: { title: { type: "STRING" }, authors: { type: "ARRAY", items: { type: "STRING" } }, abstract: { type: "STRING" } }, required: ["title", "authors", "abstract"] };

async function main() {
  if (!KEY.startsWith("sk-or-")) throw new Error("OPENROUTER_API_KEY mancante o non valida");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL non impostata");
  if (!imageFile || !pdfFile) throw new Error("servono --image e --pdf");
  const schemaName = "kvlive_" + Math.random().toString(36).slice(2, 10);
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schemaName}`);
  let failures = 0;
  const check = (ok: boolean, name: string) => {
    log(`  ${ok ? "OK  " : "FAIL"} ${name}`);
    if (!ok) failures++;
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
    const role = (await q("SELECT model, fallbacks, per_request_usd::float8 pr, daily_usd::float8 d, monthly_usd::float8 m, enabled FROM llm_roles WHERE role = 'vision'")).rows[0];
    log(`ruolo vision (da migrazione 005): modello ${role.model} | riserve ${role.fallbacks.join(",")} | per richiesta ${role.pr} $ | al giorno ${role.d} $ | al mese ${role.m} $ | acceso: ${role.enabled}`);
    const before = await accountUsage();
    log(`budget massimo della prova: ${CAP} $ | consumo dell'account prima: ${before === null ? "non disponibile" : before.toFixed(6) + " $"}`);

    const spent = async () => Number((await q("SELECT coalesce(sum(counted_usd),0) s FROM llm_usage")).rows[0].s);
    const last = async () => (await q("SELECT model, status, reserved_usd::float8 r, cost_usd::float8 c, prompt_tokens pt, completion_tokens ct, reasoning_tokens rt, duration_ms ms, error FROM llm_usage ORDER BY id DESC LIMIT 1")).rows[0];

    // V1: immagine
    log("\nV1 immagine (logo con testo)");
    const img = fs.readFileSync(imageFile);
    const imgMedia = { kind: "image" as const, mimeType: "image/png", base64: img.toString("base64") };
    const e1 = estimateMedia([imgMedia]);
    const r1 = await generate({ role: "vision", prompt: "Leggi tutto il testo visibile nell'immagine e descrivi cosa rappresenta.", schema: schemaImg, endpoint: "live-image", media: [imgMedia] }, { db });
    if (r1.ok === false) check(false, `chiamata riuscita: ${r1.reason}`);
    else {
      const j = JSON.parse(r1.text);
      const l = await last();
      log(`  modello: ${r1.model} | testo letto: ${JSON.stringify(j.text).slice(0, 120)} | descrizione: ${JSON.stringify(j.description).slice(0, 160)}`);
      log(`  token reali in ingresso: ${l.pt} (stima prudente dei soli file: ${e1.tokens}) | uscita: ${l.ct} (ragionamento ${l.rt}) | costo reale ${l.c} $ | stima massima ${l.r.toFixed(6)} $ | ${l.ms} ms`);
      check(/python/i.test(JSON.stringify(j)), "il testo del logo ('python') e' stato letto");
      check(l.pt <= e1.tokens + 400, "la stima dei token dell'immagine non e' inferiore al reale");
    }
    if ((await spent()) > CAP) throw new Error("budget raggiunto");

    // V2: PDF letto direttamente (15 pagine)
    log("\nV2 PDF letto direttamente dal modello (motore native)");
    const pdf = fs.readFileSync(pdfFile);
    const pages = await pdfPageCount(pdf);
    const pdfMedia = { kind: "pdf" as const, mimeType: "application/pdf", base64: pdf.toString("base64"), filename: "paper.pdf", pages };
    const e2 = estimateMedia([pdfMedia]);
    const r2 = await generate({ role: "vision", prompt: "Estrai titolo, autori e abstract di questo articolo scientifico.", schema: schemaPdf, endpoint: "live-pdf", media: [pdfMedia] }, { db });
    if (r2.ok === false) check(false, `chiamata riuscita: ${r2.reason}`);
    else {
      const j = JSON.parse(r2.text);
      const l = await last();
      log(`  modello: ${r2.model} | pagine: ${pages} | titolo: ${JSON.stringify(j.title)} | autori: ${j.authors?.length}`);
      log(`  token reali in ingresso: ${l.pt} (stima prudente dei soli file: ${e2.tokens}) | uscita: ${l.ct} (ragionamento ${l.rt}) | costo reale ${l.c} $ | stima massima ${l.r.toFixed(6)} $ | ${l.ms} ms`);
      check(/attention/i.test(j.title || ""), "il titolo 'Attention Is All You Need' e' stato letto");
      check((j.authors?.length ?? 0) >= 6, "gli autori sono stati estratti (almeno 6)");
      check(l.pt <= e2.tokens + 1000, "la stima dei token del PDF non e' inferiore al reale");
      check(Number(l.c) <= l.r, "il costo reale non supera la stima massima");
    }
    if ((await spent()) > CAP) throw new Error("budget raggiunto");

    // V3: pipeline reale degli articoli scientifici, dall'inizio alla fine (passa dal contenitore multimodale compatibile)
    log("\nV3 pipeline reale processAcademicPaperPipeline (end-to-end)");
    const { executePreFlightCheck } = await import("../services/deterministicGates");
    const { processAcademicPaperPipeline } = await import("../services/specializedPipelines");
    const pre = executePreFlightCheck(pdf, "application/pdf", "attention.pdf", []);
    const t3 = Date.now();
    const res = await processAcademicPaperPipeline(pdf, pre, { filename: "attention.pdf", existingResources: [] });
    const l3 = await last();
    const rows3 = (await q("SELECT role, endpoint, status, cost_usd::float8 c FROM llm_usage WHERE endpoint LIKE '/api/specialized%' ORDER BY id")).rows;
    const md = String(res.resource?.metadata?.markdownContent || "");
    log(`  durata ${((Date.now() - t3) / 1000).toFixed(1)} s | titolo: ${JSON.stringify(res.resource?.title)} | autori: ${res.resource?.metadata?.authors?.length} | tag: ${(res.resource?.tags || []).slice(0, 5).join(", ")} | markdown: ${md.length} caratteri`);
    log(`  chiamate registrate dalla pipeline: ${rows3.map((x) => `${x.role}/${x.status}/${x.c}$`).join(" ; ")} | token ingresso/uscita: ${l3.pt}/${l3.ct}`);
    check(res.success === true && /attention/i.test(String(res.resource?.title)), "la pipeline ha prodotto la risorsa con il titolo giusto");
    check(rows3.length >= 1 && rows3.every((x) => x.role === "vision" && x.status === "ok"), "la pipeline e' passata dal ruolo vision (chiamata registrata, esito ok)");
    check(md.length > 1500 && /^---/.test(md.trimStart()), "il documento OKF in markdown e' sostanzioso e parte con il frontmatter");
    if ((await spent()) > CAP) throw new Error("budget raggiunto");

    // V4: PDF enorme (120 pagine): bloccato prima della chiamata
    log("\nV4 PDF di 120 pagine: deve essere bloccato PRIMA della chiamata");
    const nRows = Number((await q("SELECT count(*) n FROM llm_usage WHERE status <> 'blocked'")).rows[0].n);
    const fake = Buffer.from("%PDF-1.4\n" + "<< /Type /Page >>\n".repeat(120) + "<< /Type /Pages /Count 120 >>\n%%EOF", "latin1");
    const r4 = await generate({ role: "vision", prompt: "Riassumi.", schema: schemaPdf, endpoint: "live-big", media: [{ kind: "pdf", mimeType: "application/pdf", base64: fake.toString("base64"), pages: 120 }] }, { db });
    const nAfter = Number((await q("SELECT count(*) n FROM llm_usage WHERE status <> 'blocked'")).rows[0].n);
    log(`  esito: ${r4.ok === false ? "BLOCCATO: " + r4.reason : "ATTENZIONE: la chiamata e' partita!"}`);
    check(r4.ok === false && nAfter === nRows, "PDF da 120 pagine bloccato, nessuna chiamata partita");

    // Riepilogo
    const rows = (await q("SELECT endpoint, model, status, reserved_usd::float8 r, cost_usd::float8 c, counted_usd::float8 k, prompt_tokens pt, completion_tokens ct, duration_ms ms FROM llm_usage ORDER BY id")).rows;
    log("\nregistro (schema temporaneo):");
    for (const x of rows) log(`  ${String(x.endpoint).padEnd(34)} ${String(x.model).padEnd(22)} ${x.status.padEnd(8)} stima ${x.r.toFixed(6)} | reale ${x.c === null ? "-" : x.c.toFixed(6)} | contato ${x.k.toFixed(6)} | token ${x.pt ?? "-"}/${x.ct ?? "-"} | ${x.ms ?? "-"} ms`);
    const sumReal = rows.reduce((t, x) => t + (x.c ?? 0), 0);
    log(`\nsomma dei costi reali nel registro: ${sumReal.toFixed(6)} $ (budget ${CAP} $) | chiamate vere: ${rows.filter((x) => x.status !== "blocked").length} | bloccate: ${rows.filter((x) => x.status === "blocked").length}`);
    log(`consumo account prima della prova (per il confronto successivo): ${before === null ? "n.d." : before.toFixed(6)} $`);
    log(failures ? `\nESITO: ${failures} controlli falliti` : "\nESITO: tutti i controlli superati");
    if (failures) process.exitCode = 2;
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
