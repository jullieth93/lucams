-- Módulo admin de plantillas de correo (2026-09-18 — Fase 4):
-- RLS deny-by-default para la tabla EmailTemplateOverride.
--
-- Misma estrategia que 00000000000024 (Notification): ENABLE RLS sin
-- policies. La app accede vía Prisma con el rol privilegiado (DATABASE_URL),
-- que bypassa RLS; el cliente anon (publishable key) queda sin acceso vía
-- PostgREST — los overrides solo los lee/escribe el admin (SUPERADMIN), nada
-- debe filtrarse al storefront.

ALTER TABLE public."EmailTemplateOverride" ENABLE ROW LEVEL SECURITY;

-- Verificación inline: si quedó sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('EmailTemplateOverride')
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas de overrides de email sin RLS', n;
  END IF;
  RAISE NOTICE 'OK: tabla EmailTemplateOverride con RLS habilitada (deny-by-default).';
END $$;
