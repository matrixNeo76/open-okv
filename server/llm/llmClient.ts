// Client unico verso OpenRouter. Ogni chiamata dichiara un RUOLO (modello, riserve, parametri e limiti vengono dal database).
// Regole di sicurezza della spesa:
//  1. fail closed: senza chiave, senza database/registro o senza prezzo noto la chiamata NON parte;
//  2. prima di ogni tentativo si stima il costo MASSIMO (ingresso stimato per eccesso + max_tokens) e si controllano i limiti;
//  3. max_tokens e' sempre inviato (mai illimitato); nessun tentativo nascosto: i tentativi sono solo modello + al massimo 2 riserve;
//  4. ogni tentativo lascia una riga in llm_usage (anche bloccato o fallito); un timeout conta la stima intera (potrebbe essere stato fatturato);
//  5. il costo reale si legge da usage.cost; se manca conta la stima.
import { randomUUID } from "node:crypto";
import { getPool, hasDatabase, redact } from "../db/pool";
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
    const estimateUsd = worstCaseUsd(price, fullPrompt.length, maxTokens);

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

    const body: any = { model, messages: [{ role: "user", content: fullPrompt }], max_tokens: maxTokens, usage: { include: true } };
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
