-- RLS deny-by-default + REVOKE explícito para `ContactActivity` y `Task` (`Fase 10 · S22`).
-- Espejo de seguridad de 20261104190000_add_crm_activities_and_tasks: cero exposición en PostgREST.

ALTER TABLE public."ContactActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."ContactActivity" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Task" FROM anon, authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."ContactActivity" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."Task" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('ContactActivity', 'Task')
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION '% tabla(s) CRM sin RLS habilitada', unprotected_count;
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('ContactActivity', 'Task')
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'Tablas CRM conservan % grants no autorizados en PostgREST', leaked_grants;
  END IF;

  RAISE NOTICE 'OK: ContactActivity y Task con RLS activa y 0 grants en PostgREST.';
END $$;
