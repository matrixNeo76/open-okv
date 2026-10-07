/**
 * Prove del client LLM (M2a) con un OpenRouter FINTO in locale: nessuna chiamata vera, nessun costo.
 * Il database di prova e' uno schema temporaneo (poi eliminato): i dati veri non vengono toccati.
 * Uso: DATABASE_URL=... npm run test:llm
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { geminiSchemaToJsonSchema, topLevelRequired } from "../llm/schemaConvert";
import { cleanJson, generate, MAX_TOKENS_CEILING } from "../llm/llmClient";
import { resetPriceCache, worstCaseUsd } from "../llm/pricing";
import { normalizeContents, roleForEndpoint } from "../llm/geminiCompat";
import { countPdfPages, estimateImageTokens, estimateMedia, imageDimensions, PDF_TOKENS_PER_PAGE } from "../llm/media";
import { getModelPrice } from "../llm/pricing";
import { redact, closePool, getPool, hasDatabase } from "../db/pool";

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
const KEY = "sk-or-test-SECRETKEY123";

// ------------------------------------------------------------ OpenRouter finto
type Reply = { status?: number; body?: any; delayMs?: number; raw?: string };
const catalog = [
  { id: "test/main", pricing: { prompt: "0.000001", completion: "0.000002" } },
  { id: "test/backup", pricing: { prompt: "0.000001", completion: "0.000002" } },
  { id: "test/backup2", pricing: { prompt: "0.000001", completion: "0.000002" } },
  { id: "test/pricey", pricing: { prompt: "0.001", completion: "0.002" } },
  { id: "test/router", pricing: { prompt: "-1", completion: "-1" } },
  { id: "test/vision", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["file", "image", "text"] } },
  { id: "test/textonly", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"] } },
  { id: "test/tiered", pricing: { prompt: "0.000001", completion: "0.000002", overrides: [{ min_prompt_tokens: 272000, prompt: "0.000004", completion: "0.000008" }] }, architecture: { input_modalities: ["text", "image"] } },
];
// file di prova (intestazioni minime, bastano per riconoscere formato e dimensioni)
const pngBuf = (w: number, h: number) => {
  const b = Buffer.alloc(40);
  Buffer.from("89504e470d0a1a0a", "hex").copy(b);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const pdfBuf = (pages: number) => Buffer.from("%PDF-1.4\n" + "<< /Type /Page >>\n".repeat(pages) + `<< /Type /Pages /Count ${pages} >>\n%%EOF`, "latin1");
const b64 = (b: Buffer) => b.toString("base64");
const seen: { model: string; body: any; auth: string }[] = [];
let handler: (model: string, n: number) => Reply = () => okReply("{}");
const okReply = (content: string, cost: number | null = 0.0004, extra: any = {}): Reply => ({
  body: { id: "gen-1", model: "x", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 5 }, ...(cost === null ? {} : { cost }) }, ...extra },
});

function startFake(): Promise<http.Server> {
  const s = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/models") {
      res.setHeader("content-type", "application/json");
      return void res.end(JSON.stringify({ data: catalog }));
    }
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const body = JSON.parse(data || "{}");
      seen.push({ model: body.model, body, auth: String(req.headers.authorization || "") });
      const r = handler(body.model, seen.length);
      setTimeout(() => {
        res.statusCode = r.status ?? 200;
        res.setHeader("content-type", "application/json");
        res.end(r.raw ?? JSON.stringify(r.body));
      }, r.delayMs ?? 0);
    });
  });
  return new Promise((ok) => s.listen(0, "127.0.0.1", () => ok(s)));
}

// ------------------------------------------------------------ prove senza rete
function pureTests() {
  console.log("== conversione dello schema e funzioni pure");
  const g = geminiSchemaToJsonSchema({ type: "OBJECT", properties: { title: { type: "STRING", description: "d" }, n: { type: "INTEGER", nullable: true }, tags: { type: "ARRAY", items: { type: "STRING" } }, sub: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] } }, required: ["title", "tags"], propertyOrdering: ["title"] });
  assert(g.type === "object" && g.properties.title.type === "string" && g.properties.title.description === "d", "OBJECT/STRING -> object/string");
  assert(JSON.stringify(g.properties.n.type) === '["integer","null"]', "nullable -> [tipo, null]");
  assert(g.properties.tags.type === "array" && g.properties.tags.items.type === "string", "ARRAY con items");
  assert(g.properties.sub.required[0] === "ok" && g.propertyOrdering === undefined, "annidati e required; campi solo-Gemini scartati");
  assert(topLevelRequired(g).join() === "title,tags", "campi richiesti al primo livello");
  assert(cleanJson('```json\n{"a":1}\n```').ok === true && cleanJson("non json").ok === false && cleanJson("5").ok === false, "pulizia e controllo del JSON");
  assert(roleForEndpoint("/api/vault/agentic-dossier") === "agentic" && roleForEndpoint("/api/analyze-resource") === "extraction" && roleForEndpoint(undefined) === "extraction", "ruolo dalla rotta del chiamante");
  const jpeg = Buffer.alloc(40);
  Buffer.from("ffd8ffc00011", "hex").copy(jpeg);
  jpeg.writeUInt8(8, 6);
  jpeg.writeUInt16BE(300, 7);
  jpeg.writeUInt16BE(400, 9);
  const gif = Buffer.alloc(20);
  gif.write("GIF89a", 0, "latin1");
  gif.writeUInt16LE(120, 6);
  gif.writeUInt16LE(80, 8);
  const webp = Buffer.alloc(40);
  webp.write("RIFF", 0, "latin1");
  webp.write("WEBP", 8, "latin1");
  webp.write("VP8X", 12, "latin1");
  webp.writeUIntLE(639, 24, 3);
  webp.writeUIntLE(479, 27, 3);
  const dj = (b: Buffer) => JSON.stringify(imageDimensions(b));
  assert(dj(pngBuf(640, 480)) === '{"w":640,"h":480}' && dj(jpeg) === '{"w":400,"h":300}' && dj(gif) === '{"w":120,"h":80}' && dj(webp) === '{"w":640,"h":480}', "dimensioni di PNG, JPEG, GIF e WebP");
  assert(imageDimensions(Buffer.from("non e' un'immagine")) === null, "formato sconosciuto -> nessuna dimensione");
  assert(estimateImageTokens(pngBuf(640, 480)) === Math.ceil((640 * 480) / 512) + 100 && estimateImageTokens(pngBuf(9000, 9000)) === 20000, "token immagine: un token ogni 512 pixel, con tetto");
  assert(countPdfPages(pdfBuf(7)) === 7 && countPdfPages(Buffer.from("%PDF-1.7 senza pagine riconoscibili")) === 1, "pagine PDF contate dagli oggetti /Page e da /Count");
  assert(countPdfPages(Buffer.alloc(300000)) === 10, "senza indicazioni: una pagina ogni 30 KB (per eccesso)");
  const me = estimateMedia([{ kind: "pdf", mimeType: "application/pdf", base64: b64(pdfBuf(4)) }, { kind: "image", mimeType: "image/png", base64: b64(pngBuf(100, 100)) }]);
  assert(me.pdfPages === 4 && me.images === 1 && me.tokens === 4 * PDF_TOKENS_PER_PAGE + estimateImageTokens(pngBuf(100, 100)), "stima complessiva dei file allegati");
  assert(estimateMedia([{ kind: "pdf", mimeType: "application/pdf", base64: b64(Buffer.alloc(300000)), pages: 15 }]).pdfPages === 15, "se il numero esatto di pagine e' noto, la stima lo usa (non la regola prudente)");
  const nc = normalizeContents([{ text: "ciao" }, { inlineData: { mimeType: "image/jpg", data: "AAAA" } }, { inlineData: { mimeType: "text/plain", data: Buffer.from("nota").toString("base64") } }]);
  assert("text" in nc && nc.text === "ciao\n\nnota" && nc.media.length === 1 && nc.media[0].mimeType === "image/jpeg", "contenuti Gemini -> testo + file (image/jpg normalizzato, text/plain letto come testo)");
  assert("unsupported" in normalizeContents([{ text: "x" }, { inlineData: { mimeType: "audio/mpeg", data: "AAAA" } }]) && "unsupported" in normalizeContents([{ fileData: { fileUri: "x" } }]), "audio e riferimenti a file remoti: non supportati");
  const est = worstCaseUsd({ promptUsdPerToken: 1e-6, completionUsdPerToken: 2e-6, requestUsd: 0, modalities: ["text"] }, 3000, 1000);
  assert(Math.abs(est - ((1050) * 1e-6 + 1000 * 2e-6)) < 1e-12, "stima del massimo: ingresso (3 caratteri/token) + max_tokens in uscita");
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

async function dbTests() {
  const schema = "kvtest_" + Math.random().toString(36).slice(2, 10);
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  const fp = async () => (await admin.query("SELECT count(*)::int n, md5(coalesce(string_agg(id || updated_at::text, ',' ORDER BY id), '')) h FROM public.resources")).rows[0];
  const before = await fp();
  const usageCount = async () => ((await admin.query("SELECT to_regclass('public.llm_usage') AS t")).rows[0].t ? (await admin.query("SELECT count(*)::int n FROM public.llm_usage")).rows[0].n : 0);
  const usageBefore = await usageCount();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const fake = await startFake();
  const base = `http://127.0.0.1:${(fake.address() as any).port}`;
  process.env.OPENROUTER_BASE_URL = base;
  process.env.OPENROUTER_API_KEY = KEY;
  process.env.VAULT_DB_SCHEMA = schema;
  delete process.env.LLM_DISABLED;
  try {
    await applyMigrations(admin, schema);
    await closePool();
    const db: any = getPool();
    const q = (sql: string, v?: any[]) => admin.query(`SET search_path TO ${schema}, public`).then(() => admin.query(sql, v));
    const reset = async (roleSet = "", settingsSet = "") => {
      await q("DELETE FROM llm_usage");
      await q(`UPDATE llm_roles SET enabled = true, model = 'test/main', fallbacks = ARRAY['test/backup'], per_request_usd = 1, daily_usd = 100, monthly_usd = 1000, max_per_minute = 1000, params = '{"max_tokens": 1000, "temperature": 0.2, "reasoning": {"enabled": false}, "timeout_ms": 2000, "structured": "json_object"}' WHERE role = 'extraction'`);
      if (roleSet) await q(`UPDATE llm_roles SET ${roleSet} WHERE role = 'extraction'`);
      await q("UPDATE llm_settings SET enabled = true, daily_limit_usd = 1000, monthly_limit_usd = 10000");
      if (settingsSet) await q(`UPDATE llm_settings SET ${settingsSet}`);
      seen.length = 0;
      resetPriceCache();
      handler = () => okReply('{"title":"T","tags":["a"]}');
    };
    const rows = async () => (await q("SELECT * FROM llm_usage ORDER BY id")).rows;
    const schemaG = { type: "OBJECT", properties: { title: { type: "STRING" }, tags: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title", "tags"] };
    const call = (o: any = {}) => generate({ role: "extraction", prompt: "Analizza questo testo.", schema: schemaG, endpoint: "/api/test", ...o }, { db });

    console.log("== chiamata riuscita e registro");
    await reset();
    handler = () => okReply('```json\n{"title":"T","tags":["a"]}\n```', 0.00042);
    let r = await call();
    let rw = await rows();
    assert(r.ok && JSON.parse((r as any).text).title === "T", "risposta valida, recinto ```json rimosso");
    assert(rw.length === 1 && rw[0].status === "ok" && Number(rw[0].cost_usd) === 0.00042 && Number(rw[0].counted_usd) === 0.00042, "una riga 'ok' col costo reale (usage.cost)", JSON.stringify(rw[0]));
    assert(rw[0].prompt_tokens === 100 && rw[0].completion_tokens === 50 && rw[0].reasoning_tokens === 5 && rw[0].generation_id === "gen-1" && rw[0].endpoint === "/api/test", "token, id della generazione e rotta registrati");
    const b = seen[0].body;
    assert(b.max_tokens === 1000 && b.usage?.include === true && b.response_format?.type === "json_object" && b.reasoning?.enabled === false && b.temperature === 0.2, "richiesta: max_tokens sempre presente, usage.include, json_object, ragionamento spento");
    assert(seen[0].auth === `Bearer ${KEY}` && String(b.messages[0].content).includes('"type":"object"'), "chiave nell'intestazione e schema nel prompt");

    console.log("== riserve e fallimenti");
    await reset();
    handler = (m) => (m === "test/main" ? okReply('{"title":"manca tags"}') : okReply('{"title":"T","tags":["b"]}', 0.0003));
    r = await call();
    rw = await rows();
    assert(r.ok && (r as any).model !== undefined && seen.map((s) => s.model).join() === "test/main,test/backup", "campo richiesto mancante -> si passa alla riserva");
    assert(rw.length === 2 && rw[0].status === "error" && rw[0].error.includes("campi mancanti") && rw[1].status === "ok" && rw[0].request_id === rw[1].request_id && rw[1].attempt === 2, "due righe con lo stesso request_id, tentativi 1 e 2");
    assert(Number(rw[0].counted_usd) === 0.0004, "la risposta scartata ha comunque un costo e viene contata");

    await reset();
    handler = (m) => (m === "test/main" ? { body: { choices: [{ message: { content: '{"title":"T"' }, finish_reason: "length" }], usage: { cost: 0.001 } } } : okReply('{"title":"T","tags":[]}'));
    r = await call();
    assert(r.ok && seen.length === 2 && (await rows())[0].error.includes("troncata"), "risposta troncata (finish_reason=length) -> riserva");

    await reset();
    handler = (m) => (m === "test/main" ? { status: 500, body: { error: { message: `guasto ${KEY}` } } } : okReply('{"title":"T","tags":[]}'));
    r = await call();
    rw = await rows();
    assert(r.ok && rw[0].status === "error" && Number(rw[0].counted_usd) === 0 && Number(rw[1].counted_usd) > 0, "HTTP 500: costo 0 per il tentativo fallito, poi riserva");
    assert(!JSON.stringify(rw).includes(KEY) && !JSON.stringify(rw).includes("SECRETKEY"), "la chiave non compare mai nel registro (nemmeno se il server la ripete)");

    await reset();
    handler = (m) => (m === "test/main" ? { body: { choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { cost: 0.0001 } }, delayMs: 1500 } : okReply('{"title":"T","tags":[]}'));
    await q(`UPDATE llm_roles SET params = jsonb_set(params, '{timeout_ms}', '300') WHERE role = 'extraction'`);
    r = await call();
    rw = await rows();
    assert(r.ok && rw[0].status === "timeout" && Number(rw[0].counted_usd) > 0 && Number(rw[0].counted_usd) === Number(rw[0].reserved_usd), "timeout: conta l'intera stima (potrebbe essere stato fatturato)");

    await reset();
    await q(`UPDATE llm_roles SET fallbacks = ARRAY['test/router','test/backup'] WHERE role = 'extraction'`);
    await q(`UPDATE llm_roles SET model = 'test/inesistente' WHERE role = 'extraction'`);
    r = await call();
    rw = await rows();
    assert(r.ok && seen.map((s) => s.model).join() === "test/backup" && rw.filter((x) => x.status === "blocked").length === 2 && rw[0].error.includes("prezzo"), "modello senza prezzo (assente o variabile): bloccato, si prova la riserva");

    await reset();
    handler = () => ({ status: 503, body: { error: { message: "giu'" } } });
    await q(`UPDATE llm_roles SET fallbacks = ARRAY['test/backup','test/backup2','test/pricey','test/main'] WHERE role = 'extraction'`);
    r = await call();
    assert(!r.ok && seen.length === 3, "al massimo 3 tentativi (modello + 2 riserve): nessun tentativo nascosto", `chiamate=${seen.length}`);

    console.log("== limiti: la chiamata NON parte");
    const blockedNoCall = async (name: string, expect: string) => {
      const res = await call();
      const rw2 = await rows();
      assert(!res.ok && seen.length === 0 && rw2.length >= 1 && rw2.every((x) => x.status === "blocked") && rw2[0].error.includes(expect) && Number(rw2[0].counted_usd) === 0, name, JSON.stringify({ res, n: seen.length, e: rw2[0]?.error }));
    };
    await reset("per_request_usd = 0.0000001");
    await blockedNoCall("limite per richiesta", "per richiesta");
    await reset("daily_usd = 0.0000001");
    await blockedNoCall("limite giornaliero del ruolo", "giornaliero del ruolo");
    await reset("monthly_usd = 0.0000001");
    await blockedNoCall("limite mensile del ruolo", "mensile del ruolo");
    await reset("", "daily_limit_usd = 0.0000001");
    await blockedNoCall("limite giornaliero generale", "giornaliero generale");
    await reset("", "monthly_limit_usd = 0.0000001");
    await blockedNoCall("limite mensile generale", "mensile generale");
    await reset("enabled = false");
    await blockedNoCall("ruolo spento", "spento");
    await reset("", "enabled = false");
    await blockedNoCall("interruttore generale spento", "interruttore generale");
    await reset();
    process.env.LLM_DISABLED = "1";
    await blockedNoCall("LLM_DISABLED=1 nell'ambiente", "LLM_DISABLED");
    delete process.env.LLM_DISABLED;

    await reset("max_per_minute = 2");
    await call();
    await call();
    seen.length = 0;
    const third = await call();
    assert(!third.ok && seen.length === 0 && (third as any).reason.includes("frequenza"), "limite di frequenza: la terza richiesta in un minuto e' bloccata");

    await reset();
    await q("INSERT INTO llm_usage (request_id, role, model, status, counted_usd) VALUES (gen_random_uuid(), 'extraction', 'test/main', 'ok', 99.9999)");
    await q("UPDATE llm_roles SET daily_usd = 100.0000 WHERE role = 'extraction'");
    const lim = await call();
    assert(!lim.ok && seen.length === 0, "il consumo gia' registrato conta: 99,9999 $ speso + stima supera i 100 $");
    await reset();
    await q("INSERT INTO llm_usage (request_id, at, role, model, status, counted_usd) VALUES (gen_random_uuid(), now() - interval '40 days', 'extraction', 'test/main', 'ok', 5000)");
    assert((await call()).ok, "il consumo di 40 giorni fa non conta nei limiti di oggi e del mese");

    console.log("== concorrenza");
    await reset();
    const est = worstCaseUsd({ promptUsdPerToken: 1e-6, completionUsdPerToken: 2e-6, requestUsd: 0, modalities: ["text"] }, ("Analizza questo testo." + "\n\nRispondi SOLO con un oggetto JSON valido (nessun testo fuori dal JSON, nessun blocco markdown) conforme a questo JSON Schema:\n" + JSON.stringify(geminiSchemaToJsonSchema(schemaG))).length, 1000);
    await q("UPDATE llm_roles SET daily_usd = $1 WHERE role = 'extraction'", [(est * 3.5).toFixed(6)]);
    handler = () => ({ ...okReply('{"title":"T","tags":[]}', 0.0001), delayMs: 400 });
    const burst = await Promise.all(Array.from({ length: 8 }, () => call()));
    assert(seen.length === 3 && burst.filter((x) => x.ok).length === 3 && burst.filter((x) => !x.ok).length === 5, "8 richieste contemporanee con spazio per 3: ne partono esattamente 3", `partite=${seen.length}`);

    console.log("== costi anomali o mancanti");
    await reset();
    handler = () => okReply('{"title":"T","tags":[]}', null);
    r = await call();
    rw = await rows();
    assert(r.ok && Number(rw[0].counted_usd) === Number(rw[0].reserved_usd) && rw[0].cost_usd === null && rw[0].error.includes("non riportato"), "costo assente: conta il massimo stimato");
    await reset();
    handler = () => okReply('{"title":"T","tags":[]}', 0.5);
    r = await call();
    rw = await rows();
    assert(r.ok && Number(rw[0].counted_usd) === 0.5 && rw[0].error.includes("ANOMALIA"), "costo reale superiore alla stima: segnalato e contato per intero");

    console.log("== divieti (fail closed)");
    await reset();
    delete process.env.OPENROUTER_API_KEY;
    let x = await call();
    assert(!x.ok && seen.length === 0 && (x as any).reason.includes("OPENROUTER_API_KEY"), "senza chiave: nessuna chiamata");
    process.env.OPENROUTER_API_KEY = KEY;
    x = await generate({ role: "inesistente", prompt: "x" }, { db });
    assert(!x.ok && seen.length === 0, "ruolo sconosciuto: nessuna chiamata");
    // registro non scrivibile: un vincolo che rifiuta ogni nuova riga (NON si rinomina la tabella: le ricerche ricadrebbero su `public`, cioe' sul registro vero)
    await q("ALTER TABLE llm_usage ADD CONSTRAINT test_registro_chiuso CHECK (false) NOT VALID");
    x = await call();
    assert(!x.ok && seen.length === 0 && (x as any).reason.includes("registro"), "registro dei costi non scrivibile: nessuna chiamata");
    await q("ALTER TABLE llm_usage DROP CONSTRAINT test_registro_chiuso");
    await reset();
    await call({ maxTokens: 1_000_000_000 });
    assert(seen[0].body.max_tokens === MAX_TOKENS_CEILING, `max_tokens non supera mai ${MAX_TOKENS_CEILING}`);
    await reset();
    handler = () => okReply("testo libero");
    const free = await generate({ role: "extraction", prompt: "ciao" }, { db });
    assert(free.ok && (free as any).text === "testo libero" && seen[0].body.response_format === undefined, "senza schema: testo libero e nessun response_format");

    console.log("== immagini e PDF (ruolo vision)");
    const resetVision = async (set = "") => {
      await reset();
      await q(`UPDATE llm_roles SET enabled = true, model = 'test/vision', fallbacks = ARRAY['test/textonly'], per_request_usd = 1, daily_usd = 100, monthly_usd = 1000, max_per_minute = 1000,
        params = '{"max_tokens": 1000, "reasoning": {"effort": "low"}, "timeout_ms": 2000, "structured": "json_object", "max_media_bytes": 20000000, "max_images": 3, "max_pdf_pages": 50}' WHERE role = 'vision'`);
      if (set) await q(`UPDATE llm_roles SET ${set} WHERE role = 'vision'`);
    };
    const vcall = (media: any[], o: any = {}) => generate({ role: "vision", prompt: "Leggi il documento.", schema: schemaG, endpoint: "/api/convert-file-to-okf", media, ...o }, { db });
    const png = { kind: "image", mimeType: "image/png", base64: b64(pngBuf(800, 600)) };
    const pdf = (n: number, name = "carta.pdf") => ({ kind: "pdf", mimeType: "application/pdf", base64: b64(pdfBuf(n)), filename: name });
    await resetVision();
    let v = await vcall([png, pdf(3)]);
    const vb = seen[0]?.body;
    assert(v.ok && Array.isArray(vb.messages[0].content) && vb.messages[0].content[0].type === "text", "richiesta multimodale: contenuto a parti, prima il testo");
    assert(vb.messages[0].content[1].type === "image_url" && vb.messages[0].content[1].image_url.url.startsWith("data:image/png;base64,"), "immagine come image_url con dati in base64");
    assert(vb.messages[0].content[2].type === "file" && vb.messages[0].content[2].file.filename === "carta.pdf" && vb.messages[0].content[2].file.file_data.startsWith("data:application/pdf;base64,"), "PDF come parte file con nome e dati in base64");
    assert(JSON.stringify(vb.plugins) === '[{"id":"file-parser","pdf":{"engine":"native"}}]', "modello che legge i file: motore PDF esplicito `native` (solo token)");
    const rw1 = (await rows())[0];
    assert(Number(rw1.reserved_usd) > 3 * PDF_TOKENS_PER_PAGE * 1e-7, "la stima del costo include i token dei file", String(rw1.reserved_usd));

    await resetVision("model = 'test/textonly', fallbacks = ARRAY[]::text[]");
    v = await vcall([pdf(2)]);
    assert(v.ok && JSON.stringify(seen[0].body.plugins) === '[{"id":"file-parser","pdf":{"engine":"cloudflare-ai"}}]', "modello senza lettura nativa dei file: motore gratuito `cloudflare-ai`, mai Mistral OCR");
    await resetVision("model = 'test/textonly', fallbacks = ARRAY['test/vision']");
    v = await vcall([png]);
    rw = await rows();
    assert(v.ok && rw[0].status === "blocked" && rw[0].error.includes("non accetta immagini") && seen.length === 1 && seen[0].model === "test/vision", "immagine a un modello senza visione: bloccato prima della chiamata, risponde la riserva con visione", JSON.stringify(rw.map((x) => x.status + ":" + x.model)));
    assert(!JSON.stringify(seen.map((x) => x.body)).includes("mistral"), "in nessuna richiesta compare `mistral-ocr`");

    await resetVision();
    const bigImg = { kind: "image", mimeType: "image/png", base64: b64(Buffer.concat([pngBuf(100, 100), Buffer.alloc(21_000_000)])) };
    v = await vcall([bigImg]);
    assert(!v.ok && seen.length === 0 && (v as any).reason.includes("troppo grandi"), "file oltre 20 MB: bloccato, nessuna chiamata");
    v = await vcall([png, png, png, png]);
    assert(!v.ok && seen.length === 0 && (v as any).reason.includes("troppe immagini"), "piu' immagini del tetto: bloccato, nessuna chiamata");
    v = await vcall([pdf(60)]);
    assert(!v.ok && seen.length === 0 && (v as any).reason.includes("PDF troppo lunghi"), "PDF oltre il tetto di pagine: bloccato, nessuna chiamata");
    assert((await rows()).filter((x) => x.status === "blocked").length === 3, "i tre blocchi sono registrati");

    await resetVision("per_request_usd = 0.01");
    await q("UPDATE llm_roles SET fallbacks = ARRAY[]::text[], model = 'test/tiered' WHERE role = 'vision'");
    v = await vcall([pdf(40)]);
    assert(!v.ok && seen.length === 0 && (v as any).reason.includes("per richiesta"), "PDF di 40 pagine: la stima dei file supera il limite per richiesta -> bloccato prima");
    const tp = await getModelPrice("test/tiered");
    assert(tp!.promptUsdPerToken === 0.000004 && tp!.completionUsdPerToken === 0.000008, "prezzo con fasce: si usa la fascia piu' alta");

    console.log("== involucro multimodale");
    const { generateMultimodalWithGeminiFallback } = await import("../gemini/client");
    await resetVision();
    handler = () => okReply('{"title":"T","tags":["m"]}', 0.0002);
    let mw = await generateMultimodalWithGeminiFallback([{ text: "Analizza" }, { inlineData: { mimeType: "application/pdf", data: b64(pdfBuf(2)) } }], schemaG, 45000, "/api/convert-file-to-okf", "gemini-3.8-flash");
    assert(!!mw && JSON.parse(mw.text).tags[0] === "m" && seen[0].model === "test/vision" && rows !== undefined, "generateMultimodalWithGeminiFallback (stessa firma) passa dal ruolo vision; il modello Gemini preferito e' ignorato");
    seen.length = 0;
    mw = await generateMultimodalWithGeminiFallback([{ text: "Analizza" }, { inlineData: { mimeType: "audio/mpeg", data: "AAAA" } }], schemaG, 45000);
    assert(mw === null && seen.length === 0, "audio: null senza chiamate e senza spesa (il chiamante usa la trascrizione)");
    mw = await generateMultimodalWithGeminiFallback([{ text: "Solo testo" }], schemaG, 45000);
    assert(!!mw && (await rows()).slice(-1)[0].role === "extraction", "senza file allegati e' una normale estrazione (ruolo extraction)");

    console.log("== involucro compatibile e rotte di consultazione");
    await reset();
    handler = () => okReply('{"title":"T","tags":["z"]}', 0.0002);
    const { generateWithGeminiFallback } = await import("../gemini/client");
    const w = await generateWithGeminiFallback("Analizza", schemaG, 6000, "/api/analyze-resource");
    assert(!!w && JSON.parse(w.text).tags[0] === "z" && typeof w.modelUsed === "string", "generateWithGeminiFallback (stessa firma) passa dai ruoli e restituisce {text, modelUsed}");
    await q("UPDATE llm_roles SET enabled = false WHERE role = 'extraction'");
    assert((await generateWithGeminiFallback("Analizza", schemaG, 6000, "/api/analyze-resource")) === null, "se la chiamata e' bloccata restituisce null (il chiamante usa la sua euristica)");

    await reset();
    await call();
    const { llmRouter } = await import("../llm/llmRoutes");
    const app = express();
    app.use("/api/llm", llmRouter);
    const srv: http.Server = await new Promise((ok) => {
      const s = app.listen(0, "127.0.0.1", () => ok(s));
    });
    const get = async (p: string) => {
      const rs = await fetch(`http://127.0.0.1:${(srv.address() as any).port}/api/llm${p}`);
      return { status: rs.status, text: await rs.text() };
    };
    try {
      const u = await get("/usage");
      const uj = JSON.parse(u.text);
      assert(u.status === 200 && Math.abs(uj.todayUsd - 0.0004) < 1e-9 && uj.roles.find((z: any) => z.role === "extraction").okToday === 1, "GET /usage: consumo di oggi e chiamate riuscite");
      const ro = await get("/roles");
      assert(ro.status === 200 && JSON.parse(ro.text).roles.length === 3, "GET /roles: 3 ruoli");
      const st = await get("/status");
      assert(st.status === 200 && JSON.parse(st.text).keyConfigured === true && ![u.text, ro.text, st.text].some((t) => t.includes("SECRETKEY")), "GET /status senza mostrare la chiave; nessuna rotta la espone");
    } finally {
      await new Promise((ok) => srv.close(ok));
    }
  } finally {
    await closePool();
    fake.close();
    delete process.env.VAULT_DB_SCHEMA;
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    const after = await fp();
    assert(after.n === before.n && after.h === before.h, `dati veri intatti (${after.n} risorse, impronta uguale)`);
    assert((await usageCount()) === usageBefore, "il registro d'uso VERO non e' stato toccato dal test");
    assert((await admin.query("SELECT count(*)::int n FROM pg_namespace WHERE nspname = $1", [schema])).rows[0].n === 0, "schema temporaneo eliminato");
    await admin.end();
  }
}

async function main() {
  pureTests();
  if (hasDatabase()) await dbTests();
  else console.log("== database: SALTATE (DATABASE_URL non impostata)");
  console.log(`\nRisultato: ${passed} superati, ${failed} falliti`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error("ERRORE:", redact(String(e?.stack || e?.message || e)));
  process.exit(1);
});
