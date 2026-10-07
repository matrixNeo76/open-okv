// Lettura e validazione dei parametri delle rotte /api/data (nessun accesso al database).
import { SORTS, type SortKey } from "../db/vaultRepository";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const MAX_QUERY_LENGTH = 200;

type Q = Record<string, unknown>;
const one = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export function parsePaging(q: Q): { limit: number; offset: number } | { error: string } {
  let limit = DEFAULT_LIMIT;
  let offset = 0;
  const l = one(q.limit);
  const o = one(q.offset);
  if (l !== undefined) {
    if (!/^\d+$/.test(l) || Number(l) < 1 || Number(l) > MAX_LIMIT) return { error: `limit deve essere un intero tra 1 e ${MAX_LIMIT}` };
    limit = Number(l);
  }
  if (o !== undefined) {
    if (!/^\d+$/.test(o) || !Number.isSafeInteger(Number(o))) return { error: "offset deve essere un intero >= 0" };
    offset = Number(o);
  }
  return { limit, offset };
}

export function parseResourceFilters(q: Q):
  | { type?: string; tag?: string; favorite?: boolean; q?: string; sort?: SortKey }
  | { error: string } {
  const out: { type?: string; tag?: string; favorite?: boolean; q?: string; sort?: SortKey } = {};
  const type = one(q.type)?.trim();
  if (type) out.type = type;
  const tag = one(q.tag)?.trim();
  if (tag) out.tag = tag;
  const fav = one(q.favorite);
  if (fav !== undefined) {
    if (fav !== "true" && fav !== "false") return { error: "favorite deve essere true o false" };
    out.favorite = fav === "true";
  }
  const text = one(q.q)?.trim();
  if (text) {
    if (text.length > MAX_QUERY_LENGTH) return { error: `q troppo lunga (massimo ${MAX_QUERY_LENGTH} caratteri)` };
    out.q = text;
  }
  const sort = one(q.sort);
  if (sort !== undefined) {
    if (!(SORTS as readonly string[]).includes(sort)) return { error: `sort non valido (ammessi: ${SORTS.join(", ")})` };
    if (sort === "relevance" && !out.q) return { error: "sort=relevance richiede q" };
    out.sort = sort as SortKey;
  }
  return out;
}
