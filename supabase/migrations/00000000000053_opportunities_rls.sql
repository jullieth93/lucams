-- RLS deny-by-default + REVOKE explícito para `Opportunity` (`Fase 12 · S24`).
-- Espejo de seguridad de 20261104200000_add_b2b_opportunities: cero exposición en PostgREST.

ALTER TABLE public."Opportunity" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."Opportunity" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."Opportunity" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename = 'Opportunity'
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'Opportunity sin RLS habilitada';
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'Opportunity'
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'Opportunity conserva % grants no autorizados en PostgREST', leaked_grants;
  END IF;

  RAISE NOTICE 'OK: Opportunity con RLS activa y 0 grants en PostgREST.';
END $$;
