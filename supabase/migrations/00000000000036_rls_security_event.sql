-- F-07 (auditoría 2026-09-19) — RLS deny-by-default para SecurityEvent.
--
-- Misma estrategia que 00000000000034 (EmailTemplateOverride) y que la propia
-- AdminActionLog (00000000000002): ENABLE RLS sin policies. La app escribe/lee
-- vía Prisma con el rol privilegiado (DATABASE_URL), que bypassa RLS; el
-- cliente anon (publishable key) queda sin acceso vía PostgREST — estos
-- eventos son rastro forense interno, nada debe filtrarse al storefront.
-- (Redundante a propósito con el event trigger enforce_rls_on_new_table de la
-- 014: la verificación inline de abajo convierte el gate en explícito.)

ALTER TABLE public."SecurityEvent" ENABLE ROW LEVEL SECURITY;

-- Verificación inline: si quedó sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('SecurityEvent')
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas de eventos de seguridad sin RLS', n;
  END IF;
  RAISE NOTICE 'OK: tabla SecurityEvent con RLS habilitada (deny-by-default).';
END $$;
