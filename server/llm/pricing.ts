// Prezzi dei modelli (catalogo pubblico di OpenRouter) e stima del costo MASSIMO di una chiamata.
// Principio: se il prezzo di un modello non e' noto la chiamata NON parte (fail closed).
export interface ModelPrice {
  promptUsdPerToken: number;
  completionUsdPerToken: number;
  requestUsd: number;
}

export function baseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
}

const TTL_MS = 6 * 3600 * 1000;
let cache: { at: number; prices: Map<string, ModelPrice> } | null = null;

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null; // "-1" = prezzo variabile (router): non valido
};

/** Legge il catalogo; se la rete non risponde usa la copia vecchia; se non c'e' nessuna copia lancia l'errore. */
async function loadCatalog(): Promise<Map<string, ModelPrice>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.prices;
  try {
    const res = await fetch(`${baseUrl()}/models`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`catalogo modelli: HTTP ${res.status}`);
    const body: any = await res.json();
    const prices = new Map<string, ModelPrice>();
    for (const m of Array.isArray(body?.data) ? body.data : []) {
      const p = num(m?.pricing?.prompt);
      const c = num(m?.pricing?.completion);
      if (typeof m?.id !== "string" || p === null || c === null) continue;
      prices.set(m.id, { promptUsdPerToken: p, completionUsdPerToken: c, requestUsd: num(m.pricing.request) ?? 0 });
    }
    if (prices.size === 0) throw new Error("catalogo modelli vuoto");
    cache = { at: Date.now(), prices };
  } catch (e) {
    if (!cache) throw e;
    console.warn("[llm] catalogo prezzi non aggiornabile, uso la copia precedente:", String((e as any)?.message || e).slice(0, 120));
  }
  return cache!.prices;
}

export async function getModelPrice(model: string): Promise<ModelPrice | null> {
  try {
    return (await loadCatalog()).get(model) ?? null;
  } catch {
    return null;
  }
}

export function resetPriceCache() {
  cache = null;
}

/** Token di ingresso stimati per ECCESSO (3 caratteri per token): meglio sovrastimare che sforare. */
export const estimateInputTokens = (chars: number): number => Math.ceil(chars / 3) + 50;

/** Costo massimo possibile: tutto l'ingresso stimato + max_tokens in uscita (il ragionamento e' compreso in max_tokens). */
export function worstCaseUsd(price: ModelPrice, inputChars: number, maxTokens: number): number {
  return estimateInputTokens(inputChars) * price.promptUsdPerToken + maxTokens * price.completionUsdPerToken + price.requestUsd;
}
