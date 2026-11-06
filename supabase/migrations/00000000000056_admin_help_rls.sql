ALTER TABLE public."AdminHelpProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminHelpFeedback" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."AdminHelpProgress" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AdminHelpFeedback" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."AdminHelpProgress" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."AdminHelpFeedback" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('AdminHelpProgress', 'AdminHelpFeedback')
    AND rowsecurity = false;
  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'Tablas de ayuda administrativa sin RLS habilitada';
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('AdminHelpProgress', 'AdminHelpFeedback')
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role' AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );
  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'Tablas de ayuda conservan % grants no autorizados', leaked_grants;
  END IF;
END $$;
