ALTER TABLE public."LifecycleJourney" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LifecycleJourneyStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LifecycleEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LifecycleMessage" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."LifecycleJourney" FROM anon, authenticated;
REVOKE ALL ON TABLE public."LifecycleJourneyStep" FROM anon, authenticated;
REVOKE ALL ON TABLE public."LifecycleEnrollment" FROM anon, authenticated;
REVOKE ALL ON TABLE public."LifecycleMessage" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."LifecycleJourney" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."LifecycleJourneyStep" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."LifecycleEnrollment" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."LifecycleMessage" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('LifecycleJourney', 'LifecycleJourneyStep', 'LifecycleEnrollment', 'LifecycleMessage')
    AND rowsecurity = false;
  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'Tablas Lifecycle sin RLS habilitada';
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('LifecycleJourney', 'LifecycleJourneyStep', 'LifecycleEnrollment', 'LifecycleMessage')
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role' AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );
  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'Tablas Lifecycle conservan % grants no autorizados', leaked_grants;
  END IF;
END $$;
