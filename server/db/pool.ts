// Collegamento condiviso a PostgreSQL. Legge DATABASE_URL dall'ambiente (mai dal codice).
// Il percorso di ricerca e' fissato su `public`: il database ha `ag_catalog` per primo (impostato per AGE).
import pg from "pg";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL non impostata");
    this.name = "DatabaseNotConfiguredError";
  }
}

let pool: pg.Pool | null = null;

/** Toglie dai messaggi d'errore gli indirizzi di collegamento (contengono la password). */
export function redact(message: string): string {
  return message.replace(/postgres(ql)?:\/\/\S+/g, "[REDATTO]");
}

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new DatabaseNotConfiguredError();
    pool = new pg.Pool({ connectionString: url, max: 10, options: "-c search_path=public" });
    pool.on("error", (e) => console.error("[db] errore su un collegamento inattivo:", redact(String(e?.message || e))));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
