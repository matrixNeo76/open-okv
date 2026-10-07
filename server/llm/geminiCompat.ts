// Involucri compatibili: i chiamanti di generateWithGeminiFallback e generateMultimodalWithGeminiFallback restano invariati
// ma passano dai ruoli. Contratto mantenuto: { text, modelUsed } oppure null (chiave assente, limite raggiunto, file non
// supportato, errore): il chiamante usa la sua euristica locale.
import { generate } from "./llmClient";
import { IMAGE_MIMES, PDF_MIME, normalizeMime, type MediaPart } from "./media";

export interface CompatOptions {
  timeoutMs?: number;
  endpoint?: string;
  thinkingBudget?: number; // ignorato: il ragionamento si decide per ruolo
  preferredModel?: string; // ignorato: il modello si decide per ruolo
}

/** Ruolo in base alla rotta del chiamante; tutto il resto e' estrazione. */
export function roleForEndpoint(endpoint?: string): string {
  return /agentic|dossier|agent/i.test(endpoint ?? "") ? "agentic" : "extraction";
}

export async function generateViaRoles(prompt: string, schema: any, options: CompatOptions | number, endpointFallback: string): Promise<{ text: string; modelUsed: string } | null> {
  const o: CompatOptions = typeof options === "number" ? { timeoutMs: options } : options;
  const endpoint = o.endpoint ?? endpointFallback;
  const r = await generate({ role: roleForEndpoint(endpoint), prompt, schema, endpoint, timeoutMs: o.timeoutMs });
  if (r.ok === false) {
    console.warn(`[llm] ${endpoint}: ${r.reason}`);
    return null;
  }
  return { text: r.text, modelUsed: r.model };
}

/** Contenuti nel formato Gemini ([{ text }, { inlineData: { mimeType, data } }]) -> testo + file. unsupported = motivo se non si puo' convertire. */
export function normalizeContents(contents: any): { text: string; media: MediaPart[] } | { unsupported: string } {
  const texts: string[] = [];
  const media: MediaPart[] = [];
  let unsupported: string | null = null;
  const visit = (part: any) => {
    if (unsupported || part === null || part === undefined) return;
    if (typeof part === "string") return void texts.push(part);
    if (Array.isArray(part)) return void part.forEach(visit);
    if (Array.isArray(part.parts)) return void part.parts.forEach(visit);
    if (typeof part.text === "string") return void texts.push(part.text);
    if (part.inlineData) {
      const mime = normalizeMime(String(part.inlineData.mimeType ?? ""));
      const data = String(part.inlineData.data ?? "").replace(/^data:[^,]*,/, "");
      if (IMAGE_MIMES.includes(mime)) return void media.push({ kind: "image", mimeType: mime, base64: data });
      if (mime === PDF_MIME) return void media.push({ kind: "pdf", mimeType: mime, base64: data });
      if (mime.startsWith("text/")) return void texts.push(Buffer.from(data, "base64").toString("utf8"));
      unsupported = `tipo di file non supportato in questa tappa: ${mime || "sconosciuto"}`;
      return;
    }
    unsupported = "contenuto non supportato (riferimento a file remoto o parte sconosciuta)";
  };
  visit(contents);
  return unsupported ? { unsupported } : { text: texts.join("\n\n"), media };
}

/** Testo + immagini/PDF: ruolo `vision`. Senza file allegati e' una normale richiesta di estrazione. Audio e video: null, nessuna spesa. */
export async function generateMultimodalViaRoles(contents: any, schema: any, timeoutMs: number, endpoint: string): Promise<{ text: string; modelUsed: string } | null> {
  const n = normalizeContents(contents);
  if ("unsupported" in n) {
    console.warn(`[llm] ${endpoint}: ${n.unsupported}: nessuna chiamata`);
    return null;
  }
  const r = await generate({ role: n.media.length ? "vision" : "extraction", prompt: n.text, schema, endpoint, timeoutMs, media: n.media });
  if (r.ok === false) {
    console.warn(`[llm] ${endpoint}: ${r.reason}`);
    return null;
  }
  return { text: r.text, modelUsed: r.model };
}
