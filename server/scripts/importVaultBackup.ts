// Importa un file vault-backup.json (o knowledge-vault-backup-DATA.json) in PostgreSQL.
// Ripetibile: usa l'id di ogni risorsa e aggiorna invece di duplicare.
// Uso: npx tsx server/scripts/importVaultBackup.ts FILE.json [--dry-run] [--user-id local-vault-user]
// Non modifica mai il file di partenza. Al termine confronta conteggi e id e segnala le differenze.
import fs from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry-run");
const uidIdx = args.indexOf("--user-id");
const targetUser = uidIdx >= 0 ? args[uidIdx + 1] : "local-vault-user";
if (!file) {
  console.error("Uso: importVaultBackup.ts FILE.json [--dry-run] [--user-id ID]");
  process.exit(1);
}

const KNOWN = new Set(["id", "userId", "type", "title", "url", "rawInput", "summary", "tags", "isFavorite", "rating", "metadata", "createdAt", "updatedAt"]);
const KNOWN_RAW = new Set(["id", "userId", "fileName", "fileSize", "fileType", "mimeType", "status", "convertedResourceId", "convertedResourceTitle", "contentPreview", "textContent", "base64Data", "hasChunks", "totalChunks", "notes", "createdAt", "updatedAt", "chunks"]);

function ts(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "object" && typeof v.seconds === "number") return new Date(v.seconds * 1000).toISOString(); // Timestamp Firestore
  return null;
}
const pick = (o: any, known: Set<string>) => Object.fromEntries(Object.entries(o).filter(([k]) => !known.has(k)));

async function main() {
  const data = JSON.parse(fs.readFileSync(file!, "utf8"));
  const resources: any[] = Array.isArray(data.resources) ? data.resources : [];
  const rawFiles: any[] = Array.isArray(data.rawFiles) ? data.rawFiles : [];
  console.log(`file: ${file}\n  savedAt: ${data.savedAt ?? "?"} | risorse nel file: ${resources.length} (dichiarate ${data.totalResources ?? "?"}) | file grezzi: ${rawFiles.length} (dichiarati ${data.totalRawFiles ?? "?"})`);

  const ids = resources.map((r) => r.id);
  if (ids.some((i) => !i)) throw new Error("ci sono risorse senza id");
  if (new Set(ids).size !== ids.length) throw new Error("id duplicati nel file");
  if (dry) {
    console.log("DRY-RUN: nessuna scrittura. Il file e' valido.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL non impostata");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  let inserted = 0, updated = 0, relCount = 0;
  try {
    await db.query("BEGIN");
    const before = new Set((await db.query("SELECT id FROM resources")).rows.map((r) => r.id));
    for (const r of resources) {
      const created = ts(r.createdAt) ?? new Date().toISOString();
      const upd = ts(r.updatedAt) ?? created;
      const rating = typeof r.rating === "number" ? Math.round(r.rating) : null;
      await db.query(
        `INSERT INTO resources (id, user_id, legacy_user_id, type, title, url, raw_input, summary, tags, is_favorite, rating, metadata, extra, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           user_id=EXCLUDED.user_id, legacy_user_id=EXCLUDED.legacy_user_id, type=EXCLUDED.type, title=EXCLUDED.title,
           url=EXCLUDED.url, raw_input=EXCLUDED.raw_input, summary=EXCLUDED.summary, tags=EXCLUDED.tags,
           is_favorite=EXCLUDED.is_favorite, rating=EXCLUDED.rating, metadata=EXCLUDED.metadata, extra=EXCLUDED.extra,
           created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at`,
        [r.id, targetUser, r.userId ?? null, r.type ?? "note", r.title ?? "", r.url ?? null, r.rawInput ?? null, r.summary ?? "",
         Array.isArray(r.tags) ? r.tags.map(String) : [], !!r.isFavorite, rating,
         JSON.stringify(r.metadata ?? {}), JSON.stringify(pick(r, KNOWN)), created, upd]
      );
      before.has(r.id) ? updated++ : inserted++;
      // relazioni derivate da metadata.relations
      await db.query("DELETE FROM resource_relations WHERE source_id = $1", [r.id]);
      const rels = Array.isArray(r.metadata?.relations) ? r.metadata.relations : [];
      for (const x of rels) {
        if (!x || typeof x !== "object" || !x.targetTitle || !x.relationType) continue;
        await db.query(
          "INSERT INTO resource_relations (source_id, target_id, target_title, relation_type, weight, description) VALUES ($1,$2,$3,$4,$5,$6)",
          [r.id, x.targetId ?? null, String(x.targetTitle), String(x.relationType), typeof x.weight === "number" ? x.weight : null, x.description ?? null]
        );
        relCount++;
      }
    }
    for (const f of rawFiles) {
      const created = ts(f.createdAt) ?? new Date().toISOString();
      await db.query(
        `INSERT INTO raw_files (id,user_id,legacy_user_id,file_name,file_size,file_type,mime_type,status,converted_resource_id,converted_resource_title,content_preview,text_content,base64_data,has_chunks,total_chunks,notes,extra,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19)
         ON CONFLICT (id) DO UPDATE SET file_name=EXCLUDED.file_name, status=EXCLUDED.status, text_content=EXCLUDED.text_content, extra=EXCLUDED.extra, updated_at=EXCLUDED.updated_at`,
        [f.id, targetUser, f.userId ?? null, f.fileName ?? "", f.fileSize ?? 0, f.fileType ?? "", f.mimeType ?? "", f.status ?? "raw",
         f.convertedResourceId ?? null, f.convertedResourceTitle ?? null, f.contentPreview ?? null, f.textContent ?? null, f.base64Data ?? null,
         !!f.hasChunks, f.totalChunks ?? null, f.notes ?? null, JSON.stringify(pick(f, KNOWN_RAW)), created, ts(f.updatedAt) ?? created]
      );
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }

  // Verifica: conteggi e id a confronto con il file di partenza.
  const inDb = new Set((await db.query("SELECT id FROM resources")).rows.map((r) => r.id));
  const missing = ids.filter((i) => !inDb.has(i));
  const extraInDb = [...inDb].filter((i) => !new Set(ids).has(i));
  const nRel = (await db.query("SELECT count(*)::int AS n FROM resource_relations")).rows[0].n;
  const nFiles = (await db.query("SELECT count(*)::int AS n FROM raw_files")).rows[0].n;
  await db.end();
  console.log(`inserite: ${inserted} | aggiornate: ${updated} | relazioni scritte: ${relCount}`);
  console.log(`VERIFICA: risorse nel file ${ids.length}, nel database ${inDb.size}; id mancanti nel database: ${missing.length}; id nel database non presenti nel file: ${extraInDb.length}; relazioni nel database: ${nRel}; file grezzi nel database: ${nFiles}`);
  if (missing.length) {
    console.error("ERRORE: risorse non importate");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("ERRORE:", String(e?.message || e).replace(/postgres(ql)?:\/\/\S+/g, "[REDATTO]"));
  process.exit(1);
});
