-- Etapa 1 (catálogo + WhatsApp, 2026-07-21): RLS para las tablas de cotización
-- creadas por la migración Prisma 20260721120000_quotes.
--
-- DENY-BY-DEFAULT (mismo patrón que Order y la migración 10): ENABLE ROW LEVEL
-- SECURITY SIN policies. La app escribe/lee vía Prisma con el rol privilegiado
-- (bypassa RLS); el cliente anon (publishable key vía PostgREST) queda sin acceso.
-- La vista pública de una cotización se hace server-side por publicAccessToken
-- (features/quotes/service.ts), NUNCA directa desde el navegador.
--
-- En la práctica la migración 14 (event trigger enforce_rls_on_new_table) ya
-- habilitó RLS al momento del CREATE TABLE; este archivo es la garantía
-- declarativa/idempotente (y cubre el caso de que el trigger se dropee).
--
-- Idempotente: ENABLE ROW LEVEL SECURITY es no-op si ya está habilitada.

ALTER TABLE public."Quote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QuoteItem" ENABLE ROW LEVEL SECURITY;

-- Verificación inline (patrón migración 10): si alguna quedó sin RLS, falla.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('Quote', 'QuoteItem')
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'Quote/QuoteItem sin RLS habilitada (% tablas)', n;
  END IF;
  RAISE NOTICE 'OK: Quote y QuoteItem con RLS habilitada (deny-by-default, sin policies).';
END $$;
