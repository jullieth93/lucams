-- RLS deny-by-default + REVOKE explícito para `ShipmentEvent` (historial granular del
-- carrier para el timeline de /pedido/[token], 2026-11-04). Espejo Supabase de la
-- migración Prisma 20261104220000_add_shipment_events (defensa en profundidad + el
-- orden de aplicación del pipeline aplica las migraciones Prisma y las SQL por separado).

ALTER TABLE public."ShipmentEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."ShipmentEvent" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."ShipmentEvent" FROM service_role;

DO $$
DECLARE
  unprotected_count int;
  leaked_grants int;
BEGIN
  SELECT count(*) INTO unprotected_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename = 'ShipmentEvent'
    AND rowsecurity = false;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION 'ShipmentEvent sin RLS habilitada';
  END IF;

  SELECT count(*) INTO leaked_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'ShipmentEvent'
    AND (
      grantee IN ('anon', 'authenticated')
      OR (grantee = 'service_role'
          AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    );

  IF leaked_grants > 0 THEN
    RAISE EXCEPTION 'ShipmentEvent conserva % grants no autorizados en PostgREST', leaked_grants;
  END IF;

  RAISE NOTICE 'OK: ShipmentEvent con RLS activa y 0 grants en PostgREST.';
END $$;
