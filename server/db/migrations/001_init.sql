-- 001_init.sql - M1: risorse, file grezzi, pezzi, relazioni.
-- Principio: le colonne su cui si filtra sono colonne vere; il resto resta in jsonb.
-- Gli id sono testo perche' arrivano da Firestore.

-- Il database ha search_path con ag_catalog per primo (impostato per AGE): senza questa riga
-- le tabelle verrebbero create (e negate) li'. SET LOCAL vale solo dentro la transazione.
SET LOCAL search_path TO public;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resources (
  id              text PRIMARY KEY,
  user_id         text NOT NULL,
  legacy_user_id  text,                       -- userId originale di Firestore, conservato
  type            text NOT NULL,              -- insieme aperto: nessun vincolo CHECK
  title           text NOT NULL DEFAULT '',
  url             text,
  raw_input       text,
  summary         text NOT NULL DEFAULT '',
  tags            text[] NOT NULL DEFAULT '{}',
  is_favorite     boolean NOT NULL DEFAULT false,
  rating          integer,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- campi di primo livello non previsti
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  search          tsvector
);

CREATE INDEX resources_user_created_idx ON resources (user_id, created_at DESC);
CREATE INDEX resources_type_idx         ON resources (type);
CREATE INDEX resources_url_idx          ON resources (url) WHERE url IS NOT NULL;
CREATE INDEX resources_tags_gin         ON resources USING gin (tags);
CREATE INDEX resources_metadata_gin     ON resources USING gin (metadata jsonb_path_ops);
CREATE INDEX resources_title_trgm       ON resources USING gin (title gin_trgm_ops);
CREATE INDEX resources_search_gin       ON resources USING gin (search);

-- Il vettore di testo si calcola con un trigger (array_to_string non e' immutabile,
-- quindi non puo' essere una colonna generata).
CREATE FUNCTION resources_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER resources_search_trg
  BEFORE INSERT OR UPDATE OF title, tags, summary ON resources
  FOR EACH ROW EXECUTE FUNCTION resources_search_update();

CREATE TABLE raw_files (
  id                       text PRIMARY KEY,
  user_id                  text NOT NULL,
  legacy_user_id           text,
  file_name                text NOT NULL,
  file_size                bigint NOT NULL DEFAULT 0,
  file_type                text NOT NULL DEFAULT '',
  mime_type                text NOT NULL DEFAULT '',
  status                   text NOT NULL DEFAULT 'raw'
                           CHECK (status IN ('raw', 'converting', 'converted_okf', 'error')),
  converted_resource_id    text,
  converted_resource_title text,
  content_preview          text,
  text_content             text,
  base64_data              text,              -- solo file piccoli; i grandi andranno a RustFS
  has_chunks               boolean NOT NULL DEFAULT false,
  total_chunks             integer,
  notes                    text,
  extra                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX raw_files_user_created_idx ON raw_files (user_id, created_at DESC);

CREATE TABLE raw_file_chunks (
  file_id  text NOT NULL REFERENCES raw_files (id) ON DELETE CASCADE,
  idx      integer NOT NULL,
  content  text NOT NULL DEFAULT '',
  PRIMARY KEY (file_id, idx)
);

-- Relazioni ricavate da resources.metadata.relations (derivate, non fonte di verita').
CREATE TABLE resource_relations (
  id             bigserial PRIMARY KEY,
  source_id      text NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
  target_id      text,
  target_title   text NOT NULL,
  relation_type  text NOT NULL,
  weight         numeric,
  description    text
);
CREATE INDEX resource_relations_source_idx ON resource_relations (source_id);
CREATE INDEX resource_relations_target_idx ON resource_relations (target_id) WHERE target_id IS NOT NULL;
