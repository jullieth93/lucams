-- RLS deny-by-default + REVOKE explícito para `FunnelEventDaily` ([ANA-01], Fase 2).
-- Aunque la tabla solo almacena contadores diarios anónimos sin PII, las métricas
-- internas de conversión del negocio jamás deben ser legibles ni escribibles vía
-- PostgREST (`anon` / `authenticated` / `service_role`). Solo accede el backend
-- privilegiado vía conexión directa Prisma.

ALTER TABLE public."FunnelEventDaily" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."FunnelEventDaily" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."FunnelEventDaily" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename = 'FunnelEventDaily'
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'FunnelEventDaily sin RLS habilitada';
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'FunnelEventDaily'
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'FunnelEventDaily conserva % grants no autorizados en PostgREST', leaked_grants;
  END IF;

  RAISE NOTICE 'OK: FunnelEventDaily con RLS activa y 0 grants en PostgREST.';
END $$;

