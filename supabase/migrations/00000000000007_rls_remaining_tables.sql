-- Bloque C / R2 (Lucy 2026-06-27, autorizado): habilitar RLS en TODA tabla pública
-- que quedó sin candado. 16-17 tablas creadas después del 2026-05-12 nunca recibieron
-- ENABLE ROW LEVEL SECURITY (Consent, SupportTicket, Design, DesignAsset, EmailEvent,
-- SiteEvent, WebVital, ErrorReport, CmsBlock, CmsBlockVersion, SiteSetting,
-- PersonalizationTemplate, OcasionTag, ProductOcasionTag, RecommendationLog,
-- CouponUsage, UrlRedirect) — varias con PII. Mandato #12.
--
-- Estrategia: DENY-BY-DEFAULT (ENABLE RLS sin políticas). La app lee/escribe TODO vía
-- Prisma con el rol privilegiado (DATABASE_URL), que bypassa RLS → no rompe nada. El
-- cliente anon (publishable key) queda sin acceso a estas tablas vía PostgREST.
-- Si en el futuro alguna necesita lectura pública por el cliente anon, se le agrega una
-- policy SELECT específica entonces.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = false
      AND tablename NOT LIKE '_prisma%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    RAISE NOTICE 'RLS habilitada en public.%', r.tablename;
  END LOOP;
END $$;

-- Verificación inline: si queda alguna tabla pública sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = false AND tablename NOT LIKE '_prisma%';
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas públicas sin RLS', n;
  END IF;
  RAISE NOTICE 'OK: todas las tablas públicas tienen RLS habilitada.';
END $$;
