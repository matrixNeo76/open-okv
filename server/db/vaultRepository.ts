// Unico punto del codice che conosce SQL per risorse e file grezzi.
// Tappa M1 parte 2: sola lettura. Le scritture arrivano nella tappa successiva.
export interface Queryable {
  query(text: string, values?: any[]): Promise<{ rows: any[] }>;
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

const iso = (v: any): string | undefined => (v instanceof Date ? v.toISOString() : v == null ? undefined : String(v));

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

  async listResources(p: ListResourcesParams) {
    const where: string[] = ["user_id = $1"];
    const vals: any[] = [p.userId];
    const add = (v: any) => (vals.push(v), `$${vals.length}`);
    if (p.type) where.push(`type = ${add(p.type)}`);
    if (p.tag) where.push(`tags @> ARRAY[${add(p.tag)}]::text[]`);
    if (p.favorite !== undefined) where.push(`is_favorite = ${add(p.favorite)}`);
    let rank = "";
    if (p.q) {
      const ph = add(p.q);
      where.push(`search @@ vault_tsquery(${ph})`);
      rank = `ts_rank(search, vault_tsquery(${ph})) DESC, created_at DESC, id DESC`;
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
}
