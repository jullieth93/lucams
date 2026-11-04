-- RLS deny-by-default + REVOKE explícito para las 4 tablas del Grafo de Identidad Canónica
-- (`Organization`, `Contact`, `ContactIdentity`, `IdentityMergeCandidate` — Fase 6 · ADR-193).
-- Defensa en profundidad junto con la migración Prisma 20261104160000_expand_contact_identity_graph:
-- cero acceso vía PostgREST (`anon` / `authenticated` / `service_role`); solo accede el backend
-- privilegiado vía Prisma en servidor bajo RBAC + MFA `aal2`.

ALTER TABLE public."Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ContactIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IdentityMergeCandidate" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."Organization" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Contact" FROM anon, authenticated;
REVOKE ALL ON TABLE public."ContactIdentity" FROM anon, authenticated;
REVOKE ALL ON TABLE public."IdentityMergeCandidate" FROM anon, authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."Organization" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."Contact" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."ContactIdentity" FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."IdentityMergeCandidate" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('Organization', 'Contact', 'ContactIdentity', 'IdentityMergeCandidate')
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION '% tabla(s) de identidad sin RLS habilitada', unprotected_count;
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('Organization', 'Contact', 'ContactIdentity', 'IdentityMergeCandidate')
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'Tablas de identidad conservan % grants no autorizados en PostgREST', leaked_grants;
  END IF;

  RAISE NOTICE 'OK: Organization, Contact, ContactIdentity e IdentityMergeCandidate con RLS activa y 0 grants en PostgREST.';
END $$;
