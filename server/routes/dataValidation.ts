// Validazione dei corpi delle richieste di scrittura (nessun accesso al database).
// Ogni funzione restituisce i dati puliti oppure lancia ValidationError (-> HTTP 400).
import { ValidationError } from "../db/errors";
import type { BatchOp, RawFileWrite, ResourceWrite } from "../db/vaultRepository";

type Obj = Record<string, unknown>;
export const MAX_BATCH_OPS = 500;
export const MAX_CHUNKS = 5000;
const ID_RE = /^[A-Za-z0-9_.:-]{1,200}$/;
const RAW_STATUS = ["raw", "converting", "converted_okf", "error"] as const;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const bad = (m: string): never => {
  throw new ValidationError(m);
};
/** PostgreSQL non accetta il carattere NUL ne' nei testi ne' dentro jsonb. */
const noNul = (s: string, name: string) => {
  if (s.includes("\u0000")) bad(`${name} contiene un carattere non valido (NUL)`);
};

function text(o: Obj, k: string, max: number, nullable: boolean): string | null | undefined {
  const v = o[k];
  if (v === undefined) return undefined;
  if (v === null) return nullable ? null : bad(`${k} non puo' essere null`);
  if (typeof v !== "string") return bad(`${k} deve essere un testo`);
  if (v.length > max) bad(`${k} troppo lungo (massimo ${max} caratteri)`);
  noNul(v, k);
  return v;
}
function bool(o: Obj, k: string): boolean | undefined {
  const v = o[k];
  if (v === undefined) return undefined;
  return typeof v === "boolean" ? v : bad(`${k} deve essere true o false`);
}
function int(o: Obj, k: string, min: number, max: number, nullable: boolean): number | null | undefined {
  const v = o[k];
  if (v === undefined) return undefined;
  if (v === null) return nullable ? null : bad(`${k} non puo' essere null`);
  if (typeof v !== "number" || !Number.isFinite(v)) return bad(`${k} deve essere un numero`);
  const n = Math.round(v);
  if (n < min || n > max) bad(`${k} deve essere tra ${min} e ${max}`);
  return n;
}
function jsonObject(v: unknown, k: string, maxChars: number): Record<string, unknown> {
  if (!isObj(v)) return bad(`${k} deve essere un oggetto`);
  const s = JSON.stringify(v);
  if (s.length > maxChars) bad(`${k} troppo grande`);
  if (s.includes("\\u0000")) bad(`${k} contiene un carattere non valido (NUL)`);
  return v;
}

/** Data ISO (o numero in millisecondi) -> ISO. */
export function parseTimestamp(v: unknown, name: string): string {
  if (typeof v !== "string" && typeof v !== "number") return bad(`${name} deve essere una data ISO`);
  const d = new Date(v);
  if (isNaN(d.getTime())) return bad(`${name} non e' una data valida`);
  return d.toISOString();
}

export function parseId(v: unknown, name = "id"): string {
  if (typeof v !== "string" || !ID_RE.test(v)) return bad(`${name} non valido (1-200 caratteri tra lettere, numeri, _ . : -)`);
  return v;
}

/** Separa i campi noti dagli altri (che vanno in `extra`). */
function split(o: Obj, known: string[]): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!known.includes(k)) extra[k] = v;
  return Object.keys(extra).length ? jsonObject(extra, "campi aggiuntivi", 1_000_000) : {};
}

const RES_KNOWN = ["id", "userId", "type", "title", "url", "rawInput", "summary", "tags", "isFavorite", "rating", "metadata", "createdAt", "updatedAt", "expectedUpdatedAt", "search", "relations"];
const RAW_KNOWN = ["id", "userId", "fileName", "fileSize", "fileType", "mimeType", "status", "convertedResourceId", "convertedResourceTitle", "contentPreview", "textContent", "base64Data", "hasChunks", "totalChunks", "notes", "createdAt", "updatedAt", "expectedUpdatedAt", "date"];

export function parseExpected(o: Obj): string | undefined {
  return o.expectedUpdatedAt === undefined || o.expectedUpdatedAt === null ? undefined : parseTimestamp(o.expectedUpdatedAt, "expectedUpdatedAt");
}

/** mode: create (id facoltativo), put (id nell'indirizzo), patch (solo i campi presenti, almeno uno). */
export function parseResourceBody(body: unknown, mode: "create" | "put" | "patch"): { data: ResourceWrite; expectedUpdatedAt?: string } {
  if (!isObj(body)) return bad("il corpo deve essere un oggetto JSON");
  const d: ResourceWrite = {};
  if (mode === "create" && body.id !== undefined) d.id = parseId(body.id);
  const type = text(body, "type", 64, false);
  if (type !== undefined) {
    if (!type.trim()) bad("type non puo' essere vuoto");
    d.type = type;
  }
  const title = text(body, "title", 5000, false);
  if (title !== undefined) d.title = title as string;
  const url = text(body, "url", 8192, true);
  if (url !== undefined) d.url = url;
  const raw = text(body, "rawInput", 10_000_000, true);
  if (raw !== undefined) d.rawInput = raw;
  const summary = text(body, "summary", 2_000_000, false);
  if (summary !== undefined) d.summary = summary as string;
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 500) bad("tags deve essere una lista di al massimo 500 testi");
    d.tags = (body.tags as unknown[]).map((t) => {
      if (typeof t !== "string" || t.length > 300) return bad("ogni tag deve essere un testo di al massimo 300 caratteri");
      noNul(t as string, "tags");
      return t as string;
    });
  }
  const fav = bool(body, "isFavorite");
  if (fav !== undefined) d.isFavorite = fav;
  const rating = int(body, "rating", 0, 10, true);
  if (rating !== undefined) d.rating = rating;
  if (body.metadata !== undefined) d.metadata = jsonObject(body.metadata, "metadata", 10_000_000);
  if (body.createdAt !== undefined && body.createdAt !== null && mode !== "patch") d.createdAt = parseTimestamp(body.createdAt, "createdAt");
  const extra = split(body, RES_KNOWN);
  if (Object.keys(extra).length) d.extra = extra;
  if (mode === "patch" && Object.keys(d).length === 0) bad("nessun campo da modificare");
  return { data: d, expectedUpdatedAt: parseExpected(body) };
}

export function parseRawFileBody(body: unknown, mode: "create" | "patch"): { data: RawFileWrite; expectedUpdatedAt?: string } {
  if (!isObj(body)) return bad("il corpo deve essere un oggetto JSON");
  const d: RawFileWrite = {};
  if (mode === "create" && body.id !== undefined) d.id = parseId(body.id);
  const name = text(body, "fileName", 1000, false);
  if (mode === "create" && name === undefined) bad("fileName e' obbligatorio");
  if (name !== undefined) d.fileName = name as string;
  const size = int(body, "fileSize", 0, Number.MAX_SAFE_INTEGER, false);
  if (size !== undefined) d.fileSize = size as number;
  const ft = text(body, "fileType", 100, false);
  if (ft !== undefined) d.fileType = ft as string;
  const mt = text(body, "mimeType", 200, false);
  if (mt !== undefined) d.mimeType = mt as string;
  if (body.status !== undefined) {
    if (!(RAW_STATUS as readonly unknown[]).includes(body.status)) bad(`status non valido (ammessi: ${RAW_STATUS.join(", ")})`);
    d.status = body.status as RawFileWrite["status"];
  }
  for (const [k, max] of [["convertedResourceId", 200], ["convertedResourceTitle", 5000], ["contentPreview", 100_000], ["textContent", 50_000_000], ["base64Data", 60_000_000], ["notes", 100_000]] as const) {
    const v = text(body, k, max, true);
    if (v !== undefined) (d as any)[k] = v;
  }
  const hc = bool(body, "hasChunks");
  if (hc !== undefined) d.hasChunks = hc;
  const tc = int(body, "totalChunks", 0, MAX_CHUNKS * 100, true);
  if (tc !== undefined) d.totalChunks = tc;
  if (body.createdAt !== undefined && body.createdAt !== null && mode === "create") d.createdAt = parseTimestamp(body.createdAt, "createdAt");
  const extra = split(body, RAW_KNOWN);
  if (Object.keys(extra).length) d.extra = extra;
  if (mode === "patch" && Object.keys(d).length === 0) bad("nessun campo da modificare");
  return { data: d, expectedUpdatedAt: parseExpected(body) };
}

/** Corpo di PUT /raw-files/:id/chunks: { chunks: ["testo", ...] } oppure { chunks: [{ content: "testo" }, ...] }. */
export function parseChunksBody(body: unknown): string[] {
  if (!isObj(body) || !Array.isArray(body.chunks)) return bad("serve { chunks: [...] }");
  if (body.chunks.length > MAX_CHUNKS) bad(`troppi pezzi (massimo ${MAX_CHUNKS})`);
  return body.chunks.map((c, i) => {
    const s = typeof c === "string" ? c : isObj(c) && typeof c.content === "string" ? c.content : bad(`il pezzo ${i} non e' un testo`);
    if ((s as string).length > 5_000_000) bad(`il pezzo ${i} e' troppo grande`);
    noNul(s as string, `pezzo ${i}`);
    return s as string;
  });
}

/** Corpo di POST /resources/batch: { ops: [{ op, id?, data?, expectedUpdatedAt? }, ...] } (massimo 500). */
export function parseBatchBody(body: unknown): BatchOp[] {
  if (!isObj(body) || !Array.isArray(body.ops)) return bad("serve { ops: [...] }");
  if (body.ops.length === 0 || body.ops.length > MAX_BATCH_OPS) bad(`ops deve avere da 1 a ${MAX_BATCH_OPS} operazioni`);
  return body.ops.map((raw, i): BatchOp => {
    try {
      if (!isObj(raw)) return bad("operazione non valida");
      const expectedUpdatedAt = parseExpected(raw);
      if (raw.op === "create") return { op: "create", data: parseResourceBody(raw.data ?? {}, "create").data };
      if (raw.op === "upsert") {
        const id = parseId(raw.id);
        return { op: "upsert", data: { ...parseResourceBody(raw.data ?? {}, "put").data, id }, expectedUpdatedAt };
      }
      if (raw.op === "patch") return { op: "patch", id: parseId(raw.id), data: parseResourceBody(raw.data, "patch").data, expectedUpdatedAt };
      if (raw.op === "delete") return { op: "delete", id: parseId(raw.id), expectedUpdatedAt };
      return bad("op deve essere create, upsert, patch o delete");
    } catch (e) {
      if (e instanceof ValidationError) throw new ValidationError(`operazione ${i}: ${e.message}`);
      throw e;
    }
  });
}
