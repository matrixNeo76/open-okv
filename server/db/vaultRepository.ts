// Unico punto del codice che conosce SQL per risorse e file grezzi.
// M1 parte 2: letture. M1 parte 3: scritture (ognuna in una transazione) con rilevamento dei conflitti.
import { AlreadyExistsError, BatchError, ConflictError, NotFoundError } from "./errors";

export interface Queryable {
  query(text: string, values?: any[]): Promise<{ rows: any[] }>;
}
interface Connectable {
  connect(): Promise<Queryable & { release(): void }>;
}

export const SORTS = ["newest", "oldest", "title", "title_desc", "type", "favorites", "relevance"] as const;
export type SortKey = (typeof SORTS)[number];

export interface ListResourcesParams {
  userId: string;
  type?: string;
  tag?: string;
  favorite?: boolean;
  q?: string;
  sort?: SortKey;
  limit: number;
  offset: number;
}

/** Campi scrivibili di una risorsa. `extra` raccoglie i campi di primo livello non previsti. */
export interface ResourceWrite {
  id?: string;
  type?: string;
  title?: string;
  url?: string | null;
  rawInput?: string | null;
  summary?: string;
  tags?: string[];
  isFavorite?: boolean;
  rating?: number | null;
  metadata?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  createdAt?: string;
}

export interface RawFileWrite {
  id?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  mimeType?: string;
  status?: "raw" | "converting" | "converted_okf" | "error";
  convertedResourceId?: string | null;
  convertedResourceTitle?: string | null;
  contentPreview?: string | null;
  textContent?: string | null;
  base64Data?: string | null;
  hasChunks?: boolean;
  totalChunks?: number | null;
  notes?: string | null;
  extra?: Record<string, unknown>;
  createdAt?: string;
}

export type BatchOp =
  | { op: "create"; data: ResourceWrite }
  | { op: "upsert"; data: ResourceWrite; expectedUpdatedAt?: string }
  | { op: "patch"; id: string; data: ResourceWrite; expectedUpdatedAt?: string }
  | { op: "delete"; id: string; expectedUpdatedAt?: string };

const ORDER: Record<Exclude<SortKey, "relevance">, string> = {
  newest: "created_at DESC, id DESC",
  oldest: "created_at ASC, id ASC",
  title: "lower(title) ASC, id ASC",
  title_desc: "lower(title) DESC, id DESC",
  type: "type ASC, created_at DESC, id DESC",
  favorites: "is_favorite DESC, created_at DESC, id DESC",
};

const RESOURCE_COLS = "id, user_id, type, title, url, raw_input, summary, tags, is_favorite, rating, metadata, extra, created_at, updated_at";
// Elenco dei file grezzi: niente testo completo e niente base64 (pesanti).
const RAW_LIST_COLS = "id, user_id, file_name, file_size, file_type, mime_type, status, converted_resource_id, converted_resource_title, content_preview, has_chunks, total_chunks, notes, extra, created_at, updated_at";
// Millisecondi: e' la precisione di JavaScript, quindi l'updatedAt letto dal client si puo' confrontare esattamente.
const NOW_MS = "date_trunc('milliseconds', clock_timestamp())";
const MAX_RELATIONS = 500;

const RESOURCE_COLUMNS: Record<string, { col: string; json?: boolean }> = {
  type: { col: "type" },
  title: { col: "title" },
  url: { col: "url" },
  rawInput: { col: "raw_input" },
  summary: { col: "summary" },
  tags: { col: "tags" },
  isFavorite: { col: "is_favorite" },
  rating: { col: "rating" },
  metadata: { col: "metadata", json: true },
};
const RAW_COLUMNS: Record<string, { col: string }> = {
  fileName: { col: "file_name" },
  fileSize: { col: "file_size" },
  fileType: { col: "file_type" },
  mimeType: { col: "mime_type" },
  status: { col: "status" },
  convertedResourceId: { col: "converted_resource_id" },
  convertedResourceTitle: { col: "converted_resource_title" },
  contentPreview: { col: "content_preview" },
  textContent: { col: "text_content" },
  base64Data: { col: "base64_data" },
  hasChunks: { col: "has_chunks" },
  totalChunks: { col: "total_chunks" },
  notes: { col: "notes" },
};

const iso = (v: any): string | undefined => {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
};

/** Riga di `resources` -> oggetto con la stessa forma di ResourceItem (date in formato ISO). */
export function rowToResource(r: any) {
  return {
    ...(r.extra ?? {}),
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    url: r.url ?? undefined,
    rawInput: r.raw_input ?? undefined,
    summary: r.summary,
    tags: r.tags ?? [],
    isFavorite: r.is_favorite,
    rating: r.rating ?? undefined,
    metadata: r.metadata ?? {},
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function rowToRawFile(r: any) {
  return {
    ...(r.extra ?? {}),
    id: r.id,
    userId: r.user_id,
    fileName: r.file_name,
    fileSize: Number(r.file_size),
    fileType: r.file_type,
    mimeType: r.mime_type,
    status: r.status,
    convertedResourceId: r.converted_resource_id ?? undefined,
    convertedResourceTitle: r.converted_resource_title ?? undefined,
    contentPreview: r.content_preview ?? undefined,
    textContent: r.text_content ?? undefined,
    base64Data: r.base64_data ?? undefined,
    hasChunks: r.has_chunks,
    totalChunks: r.total_chunks ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export class VaultRepository {
  constructor(private readonly db: Queryable) {}

  // ---------------------------------------------------------------- letture

  async listResources(p: ListResourcesParams) {
    const where: string[] = ["user_id = $1"];
    const vals: any[] = [p.userId];
    const add = (v: any) => (vals.push(v), `$${vals.length}`);
    if (p.type) where.push(`type = ${add(p.type)}`);
    if (p.tag) where.push(`tags @> ARRAY[${add(p.tag)}]::text[]`);
    if (p.favorite !== undefined) where.push(`is_favorite = ${add(p.favorite)}`);
    let rank = "";
    if (p.q) {
      // l'ultima parola vale anche come prefisso: "postgres" trova "PostgreSQL" (migrazione 003)
      const ph = add(p.q);
      where.push(`search @@ vault_tsquery_prefix(${ph})`);
      rank = `ts_rank(search, vault_tsquery_prefix(${ph})) DESC, created_at DESC, id DESC`;
    }
    const sort: SortKey = p.sort ?? (p.q ? "relevance" : "newest");
    const order = sort === "relevance" ? rank || ORDER.newest : ORDER[sort];
    const whereSql = where.join(" AND ");
    const n = vals.length;
    const [items, count] = await Promise.all([
      this.db.query(`SELECT ${RESOURCE_COLS} FROM resources WHERE ${whereSql} ORDER BY ${order} LIMIT $${n + 1} OFFSET $${n + 2}`, [...vals, p.limit, p.offset]),
      this.db.query(`SELECT count(*)::int AS n FROM resources WHERE ${whereSql}`, vals),
    ]);
    return { items: items.rows.map(rowToResource), total: count.rows[0].n as number, limit: p.limit, offset: p.offset };
  }

  async getResource(userId: string, id: string) {
    const r = await this.db.query(`SELECT ${RESOURCE_COLS} FROM resources WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (!r.rows[0]) return null;
    return { ...rowToResource(r.rows[0]), relations: await this.listRelations(id) };
  }

  async listRelations(sourceId: string) {
    const r = await this.db.query(
      "SELECT target_id, target_title, relation_type, weight, description FROM resource_relations WHERE source_id = $1 ORDER BY id",
      [sourceId]
    );
    return r.rows.map((x) => ({
      targetId: x.target_id ?? undefined,
      targetTitle: x.target_title,
      relationType: x.relation_type,
      weight: x.weight == null ? undefined : Number(x.weight),
      description: x.description ?? undefined,
    }));
  }

  async listRawFiles(userId: string, limit: number, offset: number) {
    const [items, count] = await Promise.all([
      this.db.query(`SELECT ${RAW_LIST_COLS} FROM raw_files WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]),
      this.db.query("SELECT count(*)::int AS n FROM raw_files WHERE user_id = $1", [userId]),
    ]);
    return { items: items.rows.map(rowToRawFile), total: count.rows[0].n as number, limit, offset };
  }

  /** Il contenuto base64 si legge solo se richiesto (`includeData`). */
  async getRawFile(userId: string, id: string, includeData = false) {
    const cols = RAW_LIST_COLS + ", text_content" + (includeData ? ", base64_data" : "");
    const r = await this.db.query(`SELECT ${cols} FROM raw_files WHERE id = $1 AND user_id = $2`, [id, userId]);
    return r.rows[0] ? rowToRawFile(r.rows[0]) : null;
  }

  async listChunks(userId: string, fileId: string, limit: number, offset: number) {
    const r = await this.db.query(
      `SELECT c.idx, c.content FROM raw_file_chunks c JOIN raw_files f ON f.id = c.file_id
       WHERE f.id = $1 AND f.user_id = $2 ORDER BY c.idx LIMIT $3 OFFSET $4`,
      [fileId, userId, limit, offset]
    );
    return r.rows.map((x) => ({ index: x.idx as number, content: x.content as string }));
  }

  async stats(userId: string) {
    const r = await this.db.query(
      `SELECT (SELECT count(*)::int FROM resources WHERE user_id = $1) AS resources,
              (SELECT count(*)::int FROM raw_files WHERE user_id = $1) AS raw_files,
              (SELECT count(*)::int FROM resource_relations) AS relations,
              (SELECT coalesce(array_agg(version ORDER BY version), '{}') FROM schema_migrations) AS migrations`,
      [userId]
    );
    const x = r.rows[0];
    return { resources: x.resources as number, rawFiles: x.raw_files as number, relations: x.relations as number, migrations: x.migrations as string[] };
  }

  // -------------------------------------------------------------- scritture

  /** Esegue `fn` in una transazione (se il collegamento lo permette). Annulla tutto se `fn` fallisce. */
  private async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    const db = this.db as Partial<Connectable> & Queryable;
    if (typeof db.connect !== "function") return fn(this.db);
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      try {
        await c.query("ROLLBACK");
      } catch {
        /* il collegamento e' gia' caduto */
      }
      throw e;
    } finally {
      c.release();
    }
  }

  /** Dopo una scrittura senza esito: capisce se la riga non esiste, appartiene ad altri o e' cambiata. */
  private async explainMiss(q: Queryable, table: "resources" | "raw_files", userId: string, id: string, expected?: string): Promise<never> {
    const r = await q.query(`SELECT user_id, updated_at FROM ${table} WHERE id = $1`, [id]);
    const row = r.rows[0];
    if (!row || row.user_id !== userId) throw new NotFoundError(table === "resources" ? "risorsa" : "file");
    throw new ConflictError(iso(row.updated_at));
  }

  /** Riallinea le relazioni derivate da metadata.relations (stessa regola dell'importatore). */
  private async syncRelations(q: Queryable, id: string, metadata: any) {
    await q.query("DELETE FROM resource_relations WHERE source_id = $1", [id]);
    const rels: any[] = Array.isArray(metadata?.relations) ? metadata.relations.slice(0, MAX_RELATIONS) : [];
    for (const x of rels) {
      if (!x || typeof x !== "object" || !x.targetTitle || !x.relationType) continue;
      await q.query(
        "INSERT INTO resource_relations (source_id, target_id, target_title, relation_type, weight, description) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, x.targetId ?? null, String(x.targetTitle), String(x.relationType), typeof x.weight === "number" ? x.weight : null, x.description ?? null]
      );
    }
  }

  private insertValues(userId: string, d: ResourceWrite): any[] {
    return [
      d.id ?? null, userId, d.type ?? "note", d.title ?? "", d.url ?? null, d.rawInput ?? null, d.summary ?? "",
      d.tags ?? [], d.isFavorite ?? false, d.rating ?? null, JSON.stringify(d.metadata ?? {}), JSON.stringify(d.extra ?? {}), d.createdAt ?? null,
    ];
  }
  private static readonly INSERT_SQL = `INSERT INTO resources (id, user_id, type, title, url, raw_input, summary, tags, is_favorite, rating, metadata, extra, created_at, updated_at)
    VALUES (COALESCE($1, uuidv7()::text), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, COALESCE($13::timestamptz, ${NOW_MS}), ${NOW_MS})`;

  private async createIn(q: Queryable, userId: string, d: ResourceWrite) {
    try {
      const r = await q.query(`${VaultRepository.INSERT_SQL} RETURNING ${RESOURCE_COLS}`, this.insertValues(userId, d));
      await this.syncRelations(q, r.rows[0].id, r.rows[0].metadata);
      return { resource: rowToResource(r.rows[0]) };
    } catch (e: any) {
      if (e?.code === "23505") throw new AlreadyExistsError();
      throw e;
    }
  }

  /** Crea una risorsa. Senza `id` il server usa uuidv7(). Se l'id esiste gia': AlreadyExistsError. */
  createResource(userId: string, d: ResourceWrite) {
    return this.tx((q) => this.createIn(q, userId, d));
  }

  private async upsertIn(q: Queryable, userId: string, id: string, d: ResourceWrite, expected?: string) {
    const vals = [...this.insertValues(userId, { ...d, id }), expected ?? null];
    const r = await q.query(
      `${VaultRepository.INSERT_SQL}
       ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, title = EXCLUDED.title, url = EXCLUDED.url, raw_input = EXCLUDED.raw_input,
         summary = EXCLUDED.summary, tags = EXCLUDED.tags, is_favorite = EXCLUDED.is_favorite, rating = EXCLUDED.rating,
         metadata = EXCLUDED.metadata, extra = EXCLUDED.extra,
         created_at = COALESCE($13::timestamptz, resources.created_at), updated_at = ${NOW_MS}
       WHERE resources.user_id = EXCLUDED.user_id
         AND ($14::timestamptz IS NULL OR date_trunc('milliseconds', resources.updated_at) = $14::timestamptz)
       RETURNING WITH (OLD AS o, NEW AS n) to_jsonb(n) - 'search' AS new_row, (o.id IS NULL) AS created, o.updated_at AS previous_updated_at`,
      vals
    );
    if (!r.rows[0]) {
      const cur = await q.query("SELECT user_id, updated_at FROM resources WHERE id = $1", [id]);
      if (cur.rows[0] && cur.rows[0].user_id !== userId) throw new AlreadyExistsError();
      throw new ConflictError(iso(cur.rows[0]?.updated_at));
    }
    const row = r.rows[0];
    await this.syncRelations(q, id, row.new_row.metadata);
    return { resource: rowToResource(row.new_row), created: row.created as boolean, previousUpdatedAt: iso(row.previous_updated_at) };
  }

  /** Sostituisce l'intera risorsa (come setDoc); la crea se non esiste. `createdAt` resta quello originale se non indicato. */
  upsertResource(userId: string, id: string, d: ResourceWrite, expectedUpdatedAt?: string) {
    return this.tx((q) => this.upsertIn(q, userId, id, d, expectedUpdatedAt));
  }

  private async patchIn(q: Queryable, userId: string, id: string, d: ResourceWrite, expected?: string) {
    const vals: any[] = [id, userId];
    const sets: string[] = [];
    for (const [k, spec] of Object.entries(RESOURCE_COLUMNS)) {
      const v = (d as any)[k];
      if (v === undefined) continue;
      vals.push(spec.json ? JSON.stringify(v) : v);
      sets.push(`${spec.col} = $${vals.length}${spec.json ? "::jsonb" : ""}`);
    }
    if (d.extra && Object.keys(d.extra).length) {
      vals.push(JSON.stringify(d.extra));
      sets.push(`extra = extra || $${vals.length}::jsonb`);
    }
    let cond = "";
    if (expected) {
      vals.push(expected);
      cond = ` AND date_trunc('milliseconds', updated_at) = $${vals.length}::timestamptz`;
    }
    const r = await q.query(
      `UPDATE resources SET ${sets.length ? sets.join(", ") + ", " : ""}updated_at = ${NOW_MS}
       WHERE id = $1 AND user_id = $2${cond}
       RETURNING WITH (OLD AS o, NEW AS n) to_jsonb(o) - 'search' AS old_row, to_jsonb(n) - 'search' AS new_row`,
      vals
    );
    if (!r.rows[0]) return this.explainMiss(q, "resources", userId, id, expected);
    const { old_row, new_row } = r.rows[0];
    if (d.metadata !== undefined) await this.syncRelations(q, id, new_row.metadata);
    return { resource: rowToResource(new_row), previous: rowToResource(old_row) };
  }

  /** Modifica parziale: cambiano solo i campi presenti. `previous` e' la risorsa com'era prima (RETURNING OLD). */
  patchResource(userId: string, id: string, d: ResourceWrite, expectedUpdatedAt?: string) {
    return this.tx((q) => this.patchIn(q, userId, id, d, expectedUpdatedAt));
  }

  private async deleteIn(q: Queryable, userId: string, id: string, expected?: string) {
    const vals: any[] = [id, userId];
    let cond = "";
    if (expected) {
      vals.push(expected);
      cond = ` AND date_trunc('milliseconds', updated_at) = $3::timestamptz`;
    }
    const r = await q.query(`DELETE FROM resources WHERE id = $1 AND user_id = $2${cond} RETURNING ${RESOURCE_COLS}`, vals);
    if (!r.rows[0]) return this.explainMiss(q, "resources", userId, id, expected);
    return { deleted: rowToResource(r.rows[0]) };
  }

  /** Cancella la risorsa (le relazioni collegate spariscono con lei) e restituisce com'era. */
  deleteResource(userId: string, id: string, expectedUpdatedAt?: string) {
    return this.tx((q) => this.deleteIn(q, userId, id, expectedUpdatedAt));
  }

  /** Operazioni a blocchi (come writeBatch): tutte o nessuna. Se una fallisce, BatchError indica quale. */
  batchResources(userId: string, ops: BatchOp[]) {
    return this.tx(async (q) => {
      const results: any[] = [];
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        try {
          if (o.op === "create") results.push({ op: o.op, ...(await this.createIn(q, userId, o.data)) });
          else if (o.op === "upsert") {
            if (!o.data.id) throw new NotFoundError("id");
            results.push({ op: o.op, ...(await this.upsertIn(q, userId, o.data.id, o.data, o.expectedUpdatedAt)) });
          } else if (o.op === "patch") results.push({ op: o.op, ...(await this.patchIn(q, userId, o.id, o.data, o.expectedUpdatedAt)) });
          else results.push({ op: o.op, ...(await this.deleteIn(q, userId, o.id, o.expectedUpdatedAt)) });
        } catch (e: any) {
          throw new BatchError(i, e);
        }
      }
      return results;
    });
  }

  // ---------------------------------------------------- file grezzi (scritture)

  createRawFile(userId: string, d: RawFileWrite) {
    return this.tx(async (q) => {
      try {
        const r = await q.query(
          `INSERT INTO raw_files (id, user_id, file_name, file_size, file_type, mime_type, status, converted_resource_id, converted_resource_title,
             content_preview, text_content, base64_data, has_chunks, total_chunks, notes, extra, created_at, updated_at)
           VALUES (COALESCE($1, uuidv7()::text), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb,
             COALESCE($17::timestamptz, ${NOW_MS}), ${NOW_MS})
           RETURNING ${RAW_LIST_COLS}`,
          [d.id ?? null, userId, d.fileName ?? "", d.fileSize ?? 0, d.fileType ?? "", d.mimeType ?? "", d.status ?? "raw",
           d.convertedResourceId ?? null, d.convertedResourceTitle ?? null, d.contentPreview ?? null, d.textContent ?? null, d.base64Data ?? null,
           d.hasChunks ?? false, d.totalChunks ?? null, d.notes ?? null, JSON.stringify(d.extra ?? {}), d.createdAt ?? null]
        );
        return { file: rowToRawFile(r.rows[0]) };
      } catch (e: any) {
        if (e?.code === "23505") throw new AlreadyExistsError();
        throw e;
      }
    });
  }

  patchRawFile(userId: string, id: string, d: RawFileWrite, expectedUpdatedAt?: string) {
    return this.tx(async (q) => {
      const vals: any[] = [id, userId];
      const sets: string[] = [];
      for (const [k, spec] of Object.entries(RAW_COLUMNS)) {
        const v = (d as any)[k];
        if (v === undefined) continue;
        vals.push(v);
        sets.push(`${spec.col} = $${vals.length}`);
      }
      if (d.extra && Object.keys(d.extra).length) {
        vals.push(JSON.stringify(d.extra));
        sets.push(`extra = extra || $${vals.length}::jsonb`);
      }
      let cond = "";
      if (expectedUpdatedAt) {
        vals.push(expectedUpdatedAt);
        cond = ` AND date_trunc('milliseconds', updated_at) = $${vals.length}::timestamptz`;
      }
      const r = await q.query(
        `UPDATE raw_files SET ${sets.length ? sets.join(", ") + ", " : ""}updated_at = ${NOW_MS}
         WHERE id = $1 AND user_id = $2${cond}
         RETURNING WITH (OLD AS o, NEW AS n) o.status AS previous_status, ${RAW_LIST_COLS.split(", ").map((c) => "n." + c).join(", ")}`,
        vals
      );
      if (!r.rows[0]) return this.explainMiss(q, "raw_files", userId, id, expectedUpdatedAt);
      return { file: rowToRawFile(r.rows[0]), previousStatus: r.rows[0].previous_status as string };
    });
  }

  /** Cancella il file grezzo; i suoi pezzi spariscono con lui (ON DELETE CASCADE). */
  deleteRawFile(userId: string, id: string, expectedUpdatedAt?: string) {
    return this.tx(async (q) => {
      const vals: any[] = [id, userId];
      let cond = "";
      if (expectedUpdatedAt) {
        vals.push(expectedUpdatedAt);
        cond = ` AND date_trunc('milliseconds', updated_at) = $3::timestamptz`;
      }
      const r = await q.query(`DELETE FROM raw_files WHERE id = $1 AND user_id = $2${cond} RETURNING ${RAW_LIST_COLS}`, vals);
      if (!r.rows[0]) return this.explainMiss(q, "raw_files", userId, id, expectedUpdatedAt);
      return { deleted: rowToRawFile(r.rows[0]) };
    });
  }

  /** Sostituisce tutti i pezzi di un file (indici da 0) e aggiorna hasChunks e totalChunks. */
  replaceChunks(userId: string, fileId: string, chunks: string[]) {
    return this.tx(async (q) => {
      const own = await q.query("SELECT id FROM raw_files WHERE id = $1 AND user_id = $2 FOR UPDATE", [fileId, userId]);
      if (!own.rows[0]) throw new NotFoundError("file");
      await q.query("DELETE FROM raw_file_chunks WHERE file_id = $1", [fileId]);
      if (chunks.length) {
        await q.query(
          "INSERT INTO raw_file_chunks (file_id, idx, content) SELECT $1, (t.i - 1)::int, t.c FROM unnest($2::text[]) WITH ORDINALITY AS t(c, i)",
          [fileId, chunks]
        );
      }
      await q.query(`UPDATE raw_files SET has_chunks = $2, total_chunks = $3, updated_at = ${NOW_MS} WHERE id = $1`, [fileId, chunks.length > 0, chunks.length]);
      return { totalChunks: chunks.length };
    });
  }
}
