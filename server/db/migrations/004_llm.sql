-- 004_llm.sql - M2a: ruoli dei modelli, impostazioni generali e registro d'uso con limiti di spesa.
-- Principio: ogni tentativo di chiamata lascia una riga in llm_usage, anche se bloccato o fallito (nessun costo nascosto).
-- I limiti si controllano PRIMA della chiamata, sul massimo che la chiamata potrebbe costare.
SET LOCAL search_path TO public;

-- Impostazioni generali (una sola riga): interruttore generale e tetti su tutti i ruoli insieme.
CREATE TABLE llm_settings (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled           boolean NOT NULL DEFAULT true,
  daily_limit_usd   numeric(10,4) NOT NULL DEFAULT 2 CHECK (daily_limit_usd >= 0),
  monthly_limit_usd numeric(10,4) NOT NULL DEFAULT 15 CHECK (monthly_limit_usd >= 0),
  timezone          text NOT NULL DEFAULT 'Europe/Rome',   -- decide quando "finisce il giorno" e "il mese"
  updated_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO llm_settings DEFAULT VALUES;

-- Un ruolo = un processo dell'app (estrazione, agenti...) con il suo modello, le sue riserve e i suoi limiti.
CREATE TABLE llm_roles (
  role            text PRIMARY KEY,
  description     text NOT NULL DEFAULT '',
  enabled         boolean NOT NULL DEFAULT false,
  model           text NOT NULL,
  fallbacks       text[] NOT NULL DEFAULT '{}',       -- riserve, nell'ordine; al massimo 2 vengono provate
  params          jsonb NOT NULL DEFAULT '{}'::jsonb, -- max_tokens, temperature, reasoning, timeout_ms, structured
  per_request_usd numeric(10,4) NOT NULL DEFAULT 0.02 CHECK (per_request_usd >= 0),
  daily_usd       numeric(10,4) NOT NULL DEFAULT 1    CHECK (daily_usd >= 0),
  monthly_usd     numeric(10,4) NOT NULL DEFAULT 10   CHECK (monthly_usd >= 0),
  max_per_minute  integer NOT NULL DEFAULT 20 CHECK (max_per_minute >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE llm_usage (
  id                bigserial PRIMARY KEY,
  at                timestamptz NOT NULL DEFAULT now(),
  request_id        uuid NOT NULL,                    -- una richiesta puo' avere piu' tentativi (modello e riserve)
  attempt           integer NOT NULL DEFAULT 1,
  role              text NOT NULL,
  model             text NOT NULL,
  endpoint          text,
  status            text NOT NULL CHECK (status IN ('reserved', 'ok', 'error', 'timeout', 'blocked')),
  reserved_usd      numeric(12,6) NOT NULL DEFAULT 0, -- stima del massimo costo, calcolata prima della chiamata
  cost_usd          numeric(12,6),                    -- costo reale letto da OpenRouter (usage.cost)
  counted_usd       numeric(12,6) NOT NULL DEFAULT 0, -- quanto conta nei limiti (stima finche' la chiamata e' in corso o incerta)
  prompt_tokens     integer,
  completion_tokens integer,
  reasoning_tokens  integer,
  duration_ms       integer,
  finish_reason     text,
  generation_id     text,
  error             text
);
CREATE INDEX llm_usage_at_idx      ON llm_usage (at DESC);
CREATE INDEX llm_usage_role_at_idx ON llm_usage (role, at DESC);
CREATE INDEX llm_usage_request_idx ON llm_usage (request_id);

-- Valori di partenza (provvisori, modificabili). Spenti i ruoli che richiedono adattatori non ancora pronti.
INSERT INTO llm_roles (role, description, enabled, model, fallbacks, params) VALUES
  ('extraction', 'Estrazione e arricchimento: testo -> JSON/OKF (analisi, riassunti, tag, traduzioni)', true,
   'deepseek/deepseek-v4.1-flash', ARRAY['z-ai/glm-5.3-flash'],
   '{"max_tokens": 6000, "temperature": 0.2, "reasoning": {"enabled": false}, "timeout_ms": 90000, "structured": "json_object"}'),
  ('agentic', 'Agenti a piu'' passaggi e compiti lunghi (interrogazioni agentiche, dossier)', true,
   'z-ai/glm-5.3-flash', ARRAY['deepseek/deepseek-v4.1-flash'],
   '{"max_tokens": 8000, "temperature": 0.2, "reasoning": {"effort": "low"}, "timeout_ms": 120000, "structured": "json_object"}'),
  ('vision', 'Lettura di PDF e immagini (disponibile dalla tappa M2b)', false,
   'openai/gpt-6-luna', ARRAY['z-ai/glm-5.3-flash'],
   '{"max_tokens": 6000, "temperature": 0.2, "reasoning": {"effort": "low"}, "timeout_ms": 120000, "structured": "json_object"}');
