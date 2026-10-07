-- 003_search_prefix.sql
-- vault_tsquery_prefix(q): come vault_tsquery(q), ma l'ULTIMA parola digitata vale anche come inizio di parola
-- (come l'autocompletamento): "postgres" trova "PostgreSQL". Manuale PostgreSQL 18, 8.11.2: to_tsquery('postgres:*').
-- Il prefisso non si applica se la ricerca finisce con virgolette, se la parola e' preceduta da "-" o da una
-- virgoletta, se e' lunga meno di 2 caratteri o se e' "OR".
SET LOCAL search_path TO public;

CREATE OR REPLACE FUNCTION vault_tsquery_prefix(q text) RETURNS tsquery AS $$
DECLARE
  full_q   tsquery := vault_tsquery(q);
  last_tok text;
  head     text;
  pref     tsquery;
BEGIN
  last_tok := substring(q FROM '([[:alnum:]]+)\s*$');
  IF last_tok IS NULL OR length(last_tok) < 2 OR upper(last_tok) = 'OR' THEN
    RETURN full_q;
  END IF;
  head := regexp_replace(q, '[[:alnum:]]+\s*$', '');
  IF head ~ '[-"]$' THEN
    RETURN full_q;
  END IF;
  pref := to_tsquery('italian', last_tok || ':*') || to_tsquery('english', last_tok || ':*');
  IF numnode(pref) = 0 THEN
    RETURN full_q;
  END IF;
  IF btrim(head) <> '' THEN
    pref := vault_tsquery(head) && pref;
  END IF;
  RETURN full_q || pref;
END
$$ LANGUAGE plpgsql STABLE;
