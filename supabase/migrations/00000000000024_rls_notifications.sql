-- Centro de notificaciones del admin (2026-08-05 — docs/PLAN_CENTRO_NOTIFICACIONES.md):
-- RLS deny-by-default para la tabla Notification.
--
-- Misma estrategia que 00000000000018 (CMS v2): ENABLE RLS sin policies. La app
-- accede vía Prisma con el rol privilegiado (DATABASE_URL), que bypassa RLS; el
-- cliente anon (publishable key) queda sin acceso vía PostgREST — el feed es
-- SOLO para el admin (SUPERADMIN), nada debe filtrarse al storefront.

ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;

-- Verificación inline: si quedó sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('Notification')
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas de notificaciones sin RLS', n;
  END IF;
  RAISE NOTICE 'OK: tabla Notification con RLS habilitada (deny-by-default).';
END $$;
