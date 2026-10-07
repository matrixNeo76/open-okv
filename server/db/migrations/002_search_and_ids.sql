-- 002_search_and_ids.sql
-- 1) Nuovi id: uuidv7() di PostgreSQL 18 (UUID ordinato per tempo). Gli id gia' presenti (Firestore) non cambiano.
-- 2) Ricerca testuale bilingue: i contenuti del Vault sono in italiano e in inglese, mentre la configurazione
--    predefinita del server e' 'english'. Il vettore unisce 'italian' e 'english'.
-- 3) vault_tsquery(): costruisce la query nelle due lingue con websearch_to_tsquery (sintassi "frase", -escludi, OR).
SET LOCAL search_path TO public;

ALTER TABLE resources ALTER COLUMN id SET DEFAULT uuidv7()::text;
ALTER TABLE raw_files ALTER COLUMN id SET DEFAULT uuidv7()::text;

CREATE OR REPLACE FUNCTION resources_search_update() RETURNS trigger AS $$
DECLARE
  t text := coalesce(NEW.title, '');
  g text := coalesce(array_to_string(NEW.tags, ' '), '');
  s text := coalesce(NEW.summary, '');
BEGIN
  NEW.search :=
    setweight(to_tsvector('italian', t), 'A') || setweight(to_tsvector('english', t), 'A') ||
    setweight(to_tsvector('italian', g), 'B') || setweight(to_tsvector('english', g), 'B') ||
    setweight(to_tsvector('italian', s), 'C') || setweight(to_tsvector('english', s), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE FUNCTION vault_tsquery(q text) RETURNS tsquery AS $$
  SELECT websearch_to_tsquery('italian', q) || websearch_to_tsquery('english', q)
$$ LANGUAGE sql STABLE;

-- Ricalcola il vettore delle risorse gia' importate (fa scattare il trigger).
UPDATE resources SET title = title;
