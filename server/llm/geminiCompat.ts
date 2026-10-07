// Involucro compatibile: i chiamanti di generateWithGeminiFallback restano invariati ma passano dai ruoli.
// Contratto mantenuto: { text, modelUsed } oppure null (chiave assente, limite raggiunto, errore): il chiamante usa la sua euristica locale.
import { generate } from "./llmClient";

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
