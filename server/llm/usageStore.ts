// Registro d'uso e controllo dei limiti di spesa. Ogni tentativo di chiamata lascia una riga in llm_usage.
// La verifica dei limiti e la riserva della stima avvengono nella STESSA transazione, sotto un blocco consultivo:
// due richieste contemporanee non possono superare insieme un limite.
import type { Queryable } from "../db/vaultRepository";

export interface Connectable {
  query(text: string, values?: any[]): Promise<{ rows: any[] }>;
  connect(): Promise<Queryable & { release(): void }>;
}

export interface RoleConfig {
  role: string;
  description: string;
  enabled: boolean;
  model: string;
  fallbacks: string[];
  params: Record<string, any>;
  perRequestUsd: number;
  dailyUsd: number;
  monthlyUsd: number;
  maxPerMinute: number;
}
export interface Settings {
  enabled: boolean;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  timezone: string;
}

const rowToRole = (r: any): RoleConfig => ({
  role: r.role,
  description: r.description,
  enabled: r.enabled,
  model: r.model,
  fallbacks: r.fallbacks ?? [],
  params: r.params ?? {},
  perRequestUsd: Number(r.per_request_usd),
  dailyUsd: Number(r.daily_usd),
  monthlyUsd: Number(r.monthly_usd),
  maxPerMinute: Number(r.max_per_minute),
});

export async function loadSettings(db: Queryable): Promise<Settings> {
  const r = (await db.query("SELECT enabled, daily_limit_usd, monthly_limit_usd, timezone FROM llm_settings LIMIT 1")).rows[0];
  if (!r) throw new Error("llm_settings vuota: migrazione 004 non applicata?");
  return { enabled: r.enabled, dailyLimitUsd: Number(r.daily_limit_usd), monthlyLimitUsd: Number(r.monthly_limit_usd), timezone: r.timezone };
}

export async function loadRole(db: Queryable, role: string): Promise<RoleConfig | null> {
  const r = await db.query("SELECT * FROM llm_roles WHERE role = $1", [role]);
  return r.rows[0] ? rowToRole(r.rows[0]) : null;
}

export async function listRoles(db: Queryable): Promise<RoleConfig[]> {
  return (await db.query("SELECT * FROM llm_roles ORDER BY role")).rows.map(rowToRole);
}

export interface AttemptInfo {
  requestId: string;
  attempt: number;
  role: RoleConfig;
  settings: Settings;
  model: string;
  endpoint?: string;
  estimateUsd: number;
  chainSpentUsd: number; // gia' contato dai tentativi precedenti della stessa richiesta
  envDisabled: boolean;
}
/** stop = nessun altro tentativo (limite generale/di ruolo, ruolo spento); model = prova la riserva successiva. */
export type ReserveResult = { ok: true; id: number } | { ok: false; reason: string; scope: "stop" | "model" };

const EPS = 1e-9;
const usd = (n: number) => n.toFixed(4);

export async function recordBlocked(db: Queryable, a: Pick<AttemptInfo, "requestId" | "attempt" | "endpoint" | "estimateUsd"> & { role: string; model: string }, reason: string) {
  await db.query(
    `INSERT INTO llm_usage (request_id, attempt, role, model, endpoint, status, reserved_usd, counted_usd, error)
     VALUES ($1,$2,$3,$4,$5,'blocked',$6,0,$7)`,
    [a.requestId, a.attempt, a.role, a.model, a.endpoint ?? null, a.estimateUsd, reason.slice(0, 500)]
  );
}

/** Controlla tutti i limiti e, se passano, registra la riserva (status 'reserved', conta la stima). */
export async function reserve(db: Connectable, a: AttemptInfo): Promise<ReserveResult> {
  const block = async (c: Queryable, reason: string, scope: "stop" | "model"): Promise<ReserveResult> => {
    await recordBlocked(c, { ...a, role: a.role.role }, reason);
    await c.query("COMMIT");
    return { ok: false, reason, scope };
  };
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext('llm_usage_limits'))");
    if (a.envDisabled) return await block(c, "LLM_DISABLED=1: chiamate ai modelli disattivate", "stop");
    if (!a.settings.enabled) return await block(c, "interruttore generale spento (llm_settings.enabled)", "stop");
    if (!a.role.enabled) return await block(c, `ruolo "${a.role.role}" spento`, "stop");
    if (a.chainSpentUsd + a.estimateUsd > a.role.perRequestUsd + EPS) {
      return await block(c, `limite per richiesta: stima ${usd(a.chainSpentUsd + a.estimateUsd)} $ > ${usd(a.role.perRequestUsd)} $`, "model");
    }
    const tz = a.settings.timezone;
    const s = (
      await c.query(
        `WITH b AS (SELECT (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) AS d, (date_trunc('month', now() AT TIME ZONE $1) AT TIME ZONE $1) AS m)
         SELECT coalesce(sum(counted_usd) FILTER (WHERE at >= b.d), 0)::float8 AS all_day,
                coalesce(sum(counted_usd), 0)::float8 AS all_month,
                coalesce(sum(counted_usd) FILTER (WHERE role = $2 AND at >= b.d), 0)::float8 AS role_day,
                coalesce(sum(counted_usd) FILTER (WHERE role = $2), 0)::float8 AS role_month,
                count(*) FILTER (WHERE role = $2 AND status <> 'blocked' AND at >= now() - interval '1 minute')::int AS per_min
         FROM llm_usage CROSS JOIN b WHERE at >= b.m`,
        [tz, a.role.role]
      )
    ).rows[0];
    const e = a.estimateUsd;
    if (s.per_min >= a.role.maxPerMinute) return await block(c, `limite di frequenza: ${s.per_min} richieste nell'ultimo minuto (massimo ${a.role.maxPerMinute})`, "stop");
    if (s.role_day + e > a.role.dailyUsd + EPS) return await block(c, `limite giornaliero del ruolo: ${usd(s.role_day)} $ speso + stima ${usd(e)} $ > ${usd(a.role.dailyUsd)} $`, "stop");
    if (s.role_month + e > a.role.monthlyUsd + EPS) return await block(c, `limite mensile del ruolo: ${usd(s.role_month)} $ speso + stima ${usd(e)} $ > ${usd(a.role.monthlyUsd)} $`, "stop");
    if (s.all_day + e > a.settings.dailyLimitUsd + EPS) return await block(c, `limite giornaliero generale: ${usd(s.all_day)} $ speso + stima ${usd(e)} $ > ${usd(a.settings.dailyLimitUsd)} $`, "stop");
    if (s.all_month + e > a.settings.monthlyLimitUsd + EPS) return await block(c, `limite mensile generale: ${usd(s.all_month)} $ speso + stima ${usd(e)} $ > ${usd(a.settings.monthlyLimitUsd)} $`, "stop");
    const ins = await c.query(
      `INSERT INTO llm_usage (request_id, attempt, role, model, endpoint, status, reserved_usd, counted_usd)
       VALUES ($1,$2,$3,$4,$5,'reserved',$6,$6) RETURNING id`,
      [a.requestId, a.attempt, a.role.role, a.model, a.endpoint ?? null, e]
    );
    await c.query("COMMIT");
    return { ok: true, id: Number(ins.rows[0].id) };
  } catch (err) {
    try {
      await c.query("ROLLBACK");
    } catch {
      /* collegamento caduto */
    }
    throw err;
  } finally {
    c.release();
  }
}

export interface Outcome {
  status: "ok" | "error" | "timeout";
  countedUsd: number; // quanto deve contare nei limiti
  costUsd?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  durationMs?: number;
  finishReason?: string | null;
  generationId?: string | null;
  error?: string | null;
}

export async function finish(db: Queryable, id: number, o: Outcome) {
  await db.query(
    `UPDATE llm_usage SET status = $2, counted_usd = $3, cost_usd = $4, prompt_tokens = $5, completion_tokens = $6, reasoning_tokens = $7,
       duration_ms = $8, finish_reason = $9, generation_id = $10, error = $11 WHERE id = $1`,
    [id, o.status, o.countedUsd, o.costUsd ?? null, o.promptTokens ?? null, o.completionTokens ?? null, o.reasoningTokens ?? null,
     o.durationMs ?? null, o.finishReason ?? null, o.generationId ?? null, o.error ? o.error.slice(0, 500) : null]
  );
}

/** Riepilogo per le rotte di consultazione: consumo di oggi e del mese, per ruolo, e ultimi problemi. */
export async function summary(db: Queryable) {
  const settings = await loadSettings(db);
  const tz = settings.timezone;
  const per = await db.query(
    `WITH b AS (SELECT (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) AS d, (date_trunc('month', now() AT TIME ZONE $1) AT TIME ZONE $1) AS m)
     SELECT r.role,
            coalesce(sum(u.counted_usd) FILTER (WHERE u.at >= b.d), 0)::float8 AS today_usd,
            coalesce(sum(u.counted_usd), 0)::float8 AS month_usd,
            count(u.id) FILTER (WHERE u.at >= b.d AND u.status = 'ok')::int AS ok_today,
            count(u.id) FILTER (WHERE u.at >= b.d AND u.status IN ('error','timeout'))::int AS failed_today,
            count(u.id) FILTER (WHERE u.at >= b.d AND u.status = 'blocked')::int AS blocked_today
     FROM llm_roles r CROSS JOIN b LEFT JOIN llm_usage u ON u.role = r.role AND u.at >= b.m
     GROUP BY r.role ORDER BY r.role`,
    [tz]
  );
  const recent = await db.query(
    `SELECT at, role, model, endpoint, status, reserved_usd::float8, cost_usd::float8, counted_usd::float8, error
     FROM llm_usage WHERE status <> 'ok' ORDER BY id DESC LIMIT 20`
  );
  const roles = per.rows.map((r) => ({ role: r.role, todayUsd: r.today_usd, monthUsd: r.month_usd, okToday: r.ok_today, failedToday: r.failed_today, blockedToday: r.blocked_today }));
  return {
    settings,
    todayUsd: roles.reduce((t, r) => t + r.todayUsd, 0),
    monthUsd: roles.reduce((t, r) => t + r.monthUsd, 0),
    roles,
    recentProblems: recent.rows.map((x) => ({ at: x.at instanceof Date ? x.at.toISOString() : x.at, role: x.role, model: x.model, endpoint: x.endpoint ?? undefined, status: x.status, reservedUsd: x.reserved_usd, costUsd: x.cost_usd ?? undefined, countedUsd: x.counted_usd, error: x.error ?? undefined })),
  };
}
