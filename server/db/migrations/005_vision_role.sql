-- 005_vision_role.sql - M2b: ruolo `vision` per PDF e immagini (sempre GPT 6 Luna per scelta dell'utente), acceso, con tetto di 1 $ al giorno.
-- I PDF si mandano sempre al modello (motore "native": solo token). Tetti sui file in params: max_media_bytes, max_images, max_pdf_pages.
SET LOCAL search_path TO public;

UPDATE llm_roles SET
  description     = 'Lettura di PDF e immagini (sempre inviati al modello)',
  enabled         = true,
  model           = 'openai/gpt-6-luna',
  fallbacks       = ARRAY['z-ai/glm-5.3-flash'],
  params          = '{"max_tokens": 8000, "temperature": 0.2, "reasoning": {"effort": "low"}, "timeout_ms": 150000, "structured": "json_object",
                      "max_media_bytes": 20000000, "max_images": 10, "max_pdf_pages": 100}'::jsonb,
  per_request_usd = 0.05,
  daily_usd       = 1,
  monthly_usd     = 10,
  max_per_minute  = 20,
  updated_at      = now()
WHERE role = 'vision';
