// Applica le migrazioni SQL di server/db/migrations (ordine alfabetico), una volta sola ciascuna.
// Uso: npx tsx server/db/migrate.ts            (usa DATABASE_URL dall'ambiente)
//      npx tsx server/db/migrate.ts --status   (mostra solo lo stato, non modifica nulla)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL non impostata");
  const statusOnly = process.argv.includes("--status");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const reg = await client.query("SELECT to_regclass('public.schema_migrations') AS t");
    const applied = new Set<string>();
    if (reg.rows[0].t) {
      for (const r of (await client.query("SELECT version FROM schema_migrations")).rows) applied.add(r.version);
    }
    for (const f of files) {
      const done = applied.has(f);
      console.log(`${done ? "gia' applicata" : "da applicare  "}  ${f}`);
      if (done || statusOnly) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log(`  -> applicata ${f}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("ERRORE:", String(e?.message || e).replace(/postgres(ql)?:\/\/\S+/g, "[REDATTO]"));
  process.exit(1);
});
