// Client unico verso OpenRouter. Ogni chiamata dichiara un RUOLO (modello, riserve, parametri e limiti vengono dal database).
// Regole di sicurezza della spesa:
//  1. fail closed: senza chiave, senza database/registro o senza prezzo noto la chiamata NON parte;
//  2. prima di ogni tentativo si stima il costo MASSIMO (ingresso stimato per eccesso + max_tokens) e si controllano i limiti;
//  3. max_tokens e' sempre inviato (mai illimitato); nessun tentativo nascosto: i tentativi sono solo modello + al massimo 2 riserve;
//  4. ogni tentativo lascia una riga in llm_usage (anche bloccato o fallito); un timeout conta la stima intera (potrebbe essere stato fatturato);
//  5. il costo reale si legge da usage.cost; se manca conta la stima;
//  6. immagini e PDF (M2b): tetti di dimensione, immagini e pagine; stima prudente dei token dei file; il motore di lettura dei PDF
//     e' SEMPRE esplicito ("native" se il modello legge i file, altrimenti "cloudflare-ai", gratuito): il default di OpenRouter sarebbe
//     Mistral OCR a pagamento e non viene mai usato.
import { randomUUID } from "node:crypto";
import { getPool, hasDatabase, redact } from "../db/pool";
import { estimateMedia, pdfPageCount, type MediaPart } from "./media";
import { baseUrl, getModelPrice, worstCaseUsd } from "./pricing";
import { geminiSchemaToJsonSchema, topLevelRequired } from "./schemaConvert";
import { finish, loadRole, loadSettings, recordBlocked, reserve, type Connectable } from "./usageStore";

export const MAX_TOKENS_CEILING = 32000;
export const MAX_FALLBACKS = 2;

export interface GenerateRequest {
  role: string;
  prompt: string;
  /** Schema nel formato Gemini (type OBJECT/STRING...) o JSON Schema: viene convertito. */
  schema?: unknown;
  endpoint?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Immagini e PDF da allegare (ruolo `vision`). */
  media?: MediaPart[];
}
export type GenerateResult =
  | { ok: true; text: string; model: string; costUsd: number | null; requestId: string; attempts: number }
  | { ok: false; reason: string; requestId: string; attempts: number };

const safe = (msg: string) => redact(msg).replace(/sk-or-[A-Za-z0-9_-]+/g, "[REDATTO]").slice(0, 300);

/** Toglie eventuali recinti ```json e verifica che sia JSON (oggetto o lista). */
export function cleanJson(text: string): { ok: true; text: string; value: any } | { ok: false } {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const value = JSON.parse(t);
    return value !== null && typeof value === "object" ? { ok: true, text: t, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function generate(req: GenerateRequest, deps: { db?: Connectable } = {}): Promise<GenerateResult> {
  const requestId = randomUUID();
  const fail = (reason: string, attempts = 0): GenerateResult => ({ ok: false, reason, requestId, attempts });

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return fail("OPENROUTER_API_KEY non impostata");
  if (!deps.db && !hasDatabase()) return fail("database non configurato: senza registro dei costi le chiamate sono vietate");
  const db = deps.db ?? (getPool() as unknown as Connectable);

  let settings, role;
  try {
    settings = await loadSettings(db);
    role = await loadRole(db, req.role);
  } catch (e) {
    return fail(`configurazione dei modelli non leggibile: ${safe(String((e as any)?.message || e))}`);
  }
  if (!role) return fail(`ruolo "${req.role}" sconosciuto`);

  const jsonSchema = req.schema ? geminiSchemaToJsonSchema(req.schema) : undefined;
  const required = jsonSchema ? topLevelRequired(jsonSchema) : [];
  const fullPrompt = jsonSchema
    ? `${req.prompt}\n\nRispondi SOLO con un oggetto JSON valido (nessun testo fuori dal JSON, nessun blocco markdown) conforme a questo JSON Schema:\n${JSON.stringify(jsonSchema)}`
    : req.prompt;

  // Tetti sui file (modificabili in params del ruolo): si controllano PRIMA di qualunque tentativo
  const media = req.media ?? [];
  const hasImage = media.some((m) => m.kind === "image");
  const hasPdf = media.some((m) => m.kind === "pdf");
  for (const m of media) if (m.kind === "pdf" && m.pages === undefined) m.pages = await pdfPageCount(Buffer.from(m.base64, "base64"));
  const mediaEst = media.length ? estimateMedia(media) : { tokens: 0, bytes: 0, images: 0, pdfPages: 0 };
  if (media.length) {
    const maxBytes = Number(role.params.max_media_bytes ?? 20_000_000);
    const maxImages = Number(role.params.max_images ?? 10);
    const maxPages = Number(role.params.max_pdf_pages ?? 100);
    const over =
      mediaEst.bytes > maxBytes ? `file troppo grandi: ${(mediaEst.bytes / 1e6).toFixed(1)} MB > ${(maxBytes / 1e6).toFixed(1)} MB`
      : mediaEst.images > maxImages ? `troppe immagini: ${mediaEst.images} > ${maxImages}`
      : mediaEst.pdfPages > maxPages ? `PDF troppo lunghi: circa ${mediaEst.pdfPages} pagine > ${maxPages}`
      : null;
    if (over) {
      await recordBlocked(db, { requestId, attempt: 1, role: role.role, model: role.model, endpoint: req.endpoint, estimateUsd: 0 }, over).catch(() => {});
      return fail(over, 0);
    }
  }

  const models = [...new Set([role.model, ...role.fallbacks.slice(0, MAX_FALLBACKS)])];
  const notes: string[] = [];
  let chainSpent = 0;
  let attempts = 0;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const p = { ...role.params, ...(role.params.models?.[model] ?? {}) };
    const maxTokens = Math.max(1, Math.min(Math.floor(req.maxTokens ?? p.max_tokens ?? 4000), MAX_TOKENS_CEILING));
    const timeoutMs = Math.min(Math.max(Number(p.timeout_ms) || 60000, req.timeoutMs ?? 0), 300000);
    const attempt = i + 1;
    attempts = attempt;

    const price = await getModelPrice(model);
    if (!price) {
      const reason = `prezzo di ${model} sconosciuto: chiamata non eseguita`;
      await recordBlocked(db, { requestId, attempt, role: role.role, model, endpoint: req.endpoint, estimateUsd: 0 }, reason).catch(() => {});
      notes.push(reason);
      continue;
    }
    if (hasImage && !price.modalities.includes("image")) {
      const reason = `${model} non accetta immagini: chiamata non eseguita`;
      await recordBlocked(db, { requestId, attempt, role: role.role, model, endpoint: req.endpoint, estimateUsd: 0 }, reason).catch(() => {});
      notes.push(reason);
      continue;
    }
    // PDF: motore SEMPRE esplicito. "native" (solo token) se il modello legge i file, altrimenti "cloudflare-ai" (gratuito). Mai "mistral-ocr".
    const pdfEngine = price.modalities.includes("file") ? "native" : "cloudflare-ai";
    const estimateUsd = worstCaseUsd(price, fullPrompt.length, maxTokens, mediaEst.tokens);

    let r;
    try {
      r = await reserve(db, { requestId, attempt, role, settings, model, endpoint: req.endpoint, estimateUsd, chainSpentUsd: chainSpent, envDisabled: process.env.LLM_DISABLED === "1" });
    } catch (e) {
      return fail(`registro dei costi non disponibile: ${safe(String((e as any)?.message || e))}`, attempt); // senza registro non si chiama
    }
    if (!r.ok) {
      notes.push(`${model}: ${r.reason}`);
      if (r.scope === "stop") break;
      continue;
    }

    const userContent: any = media.length
      ? [
          { type: "text", text: fullPrompt },
          ...media.map((m) =>
            m.kind === "image"
              ? { type: "image_url", image_url: { url: `data:${m.mimeType};base64,${m.base64}` } }
              : { type: "file", file: { filename: m.filename || "document.pdf", file_data: `data:application/pdf;base64,${m.base64}` } }
          ),
        ]
      : fullPrompt;
    const body: any = { model, messages: [{ role: "user", content: userContent }], max_tokens: maxTokens, usage: { include: true } };
    if (hasPdf) body.plugins = [{ id: "file-parser", pdf: { engine: pdfEngine } }];
    if (p.temperature !== undefined) body.temperature = p.temperature;
    if (p.reasoning !== undefined) body.reasoning = p.reasoning;
    if (jsonSchema) {
      body.response_format = p.structured === "json_schema" ? { type: "json_schema", json_schema: { name: "response", schema: jsonSchema } } : { type: "json_object" };
    }

    const t0 = Date.now();
    let httpStatus = 0;
    let raw = "";
    try {
      const res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "open-okv" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      httpStatus = res.status;
      raw = await res.text();
    } catch (e) {
      // timeout o rete caduta: non sappiamo se e' stato fatturato -> conta la stima intera
      const msg = safe(String((e as any)?.message || e));
      await finish(db, r.id, { status: "timeout", countedUsd: estimateUsd, durationMs: Date.now() - t0, error: msg });
      chainSpent += estimateUsd;
      notes.push(`${model}: ${msg} (conteggiati ${estimateUsd.toFixed(4)} $ per prudenza)`);
      continue;
    }
    const durationMs = Date.now() - t0;

    let d: any = null;
    try {
      d = JSON.parse(raw);
    } catch {
      /* risposta non JSON */
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      const msg = safe(`HTTP ${httpStatus}: ${d?.error?.message ?? raw}`);
      await finish(db, r.id, { status: "error", countedUsd: 0, durationMs, error: msg });
      notes.push(`${model}: ${msg}`);
      continue;
    }

    const u = d?.usage ?? {};
    const cost = typeof u.cost === "number" && u.cost >= 0 ? u.cost : null;
    const counted = cost ?? estimateUsd; // costo reale se noto, altrimenti il massimo stimato
    chainSpent += counted;
    const choice = d?.choices?.[0];
    const content = choice?.message?.content;
    const base = {
      costUsd: cost, countedUsd: counted, durationMs,
      promptTokens: u.prompt_tokens ?? null, completionTokens: u.completion_tokens ?? null,
      reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? null,
      finishReason: choice?.finish_reason ?? null, generationId: typeof d?.id === "string" ? d.id : null,
    };
    const extra: string[] = [];
    if (cost === null) extra.push("costo non riportato da OpenRouter: contato il massimo stimato");
    else if (cost > estimateUsd + 1e-9) extra.push(`ANOMALIA: costo reale ${cost.toFixed(6)} $ superiore alla stima ${estimateUsd.toFixed(6)} $`);

    if (typeof content !== "string" || !content.trim()) {
      await finish(db, r.id, { ...base, status: "error", error: ["risposta vuota", ...extra].join("; ") });
      notes.push(`${model}: risposta vuota`);
      continue;
    }
    if (choice?.finish_reason === "length") {
      await finish(db, r.id, { ...base, status: "error", error: ["risposta troncata (max_tokens raggiunto)", ...extra].join("; ") });
      notes.push(`${model}: risposta troncata`);
      continue;
    }
    let text = content;
    if (jsonSchema) {
      const j = cleanJson(content);
      const missing = j.ok ? required.filter((k) => !(k in (j.value as any))) : [];
      if (!j.ok || missing.length) {
        const why = !j.ok ? "JSON non valido" : `campi mancanti: ${missing.join(", ")}`;
        await finish(db, r.id, { ...base, status: "error", error: [why, ...extra].join("; ") });
        notes.push(`${model}: ${why}`);
        continue;
      }
      text = j.text;
    }
    await finish(db, r.id, { ...base, status: "ok", error: extra.length ? extra.join("; ") : null });
    return { ok: true, text, model: typeof d?.model === "string" ? d.model : model, costUsd: cost, requestId, attempts: attempt };
  }
  return fail(notes.join(" | ") || "nessun modello disponibile", attempts);
}
