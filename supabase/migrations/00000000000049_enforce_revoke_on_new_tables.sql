-- Auditoría 2026-11 ([SEC-03]) — Endurecer el event trigger `enforce_rls_on_new_table`
-- para que CADA tabla nueva en `public` nazca no solo con RLS habilitada, sino también
-- con `REVOKE ALL` para `anon, authenticated` y `REVOKE SELECT, INSERT, UPDATE, DELETE`
-- para `service_role` en el mismo instante DDL.
--
-- Contexto:
--   - La migración 014 instaló `enforce_rls_on_new_table_trg` para habilitar RLS
--     automáticamente en tablas creadas por migraciones Prisma incrementales.
--   - Sin embargo, los privilegios administrados por Supabase volvían a dejar
--     grants residuales en tablas creadas después de las migraciones 022/026,
--     obligando a barridos manuales posteriores (como la migración 038).
--   - Incorporar el REVOKE dentro del propio event trigger + un barrido idempotente
--     elimina estructuralmente la reaparición de grants residuales en futuras fases
--     (p.ej. Contact / ContactIdentity / Activity).

-- 1) Actualizar la función del event trigger (RLS + REVOKE automático en DDL-time).
CREATE OR REPLACE FUNCTION public.enforce_rls_on_new_table()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF obj.object_type = 'table'
       AND obj.schema_name = 'public'
       AND split_part(obj.object_identity, '.', 2) NOT LIKE '\_prisma%'
    THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', obj.object_identity);
      EXECUTE format(
        'REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE %s FROM service_role',
        obj.object_identity
      );
      RAISE NOTICE 'RLS + REVOKE aplicados automáticamente (event trigger) en %', obj.object_identity;
    END IF;
  END LOOP;
END;
$$;

-- 2) Re-asegurar que el event trigger esté instalado y activo.
DROP EVENT TRIGGER IF EXISTS enforce_rls_on_new_table_trg;
CREATE EVENT TRIGGER enforce_rls_on_new_table_trg
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
  EXECUTE FUNCTION public.enforce_rls_on_new_table();

-- 3) Barrido idempotente sobre todas las tablas actuales de `public` (cubre tablas
--    creadas entre la 038 y la 048: SupportTicketMessage, RenderJob, WompiPayment*,
--    OrderStatusEvent, etc.).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM service_role;

-- 4) Verificación inline (misma convención que 026: WARNING si algún grant residual
--    proviene de un grantor distinto a postgres; NOTICE si todo quedó en cero).
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND (
        grantee IN ('anon', 'authenticated')
        OR (grantee = 'service_role'
            AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
      )
    ORDER BY grantee, table_name, privilege_type
  LOOP
    n := n + 1;
    RAISE WARNING 'grant residual: rol=% privilegio=% tabla=%',
      r.grantee, r.privilege_type, r.table_name;
  END LOOP;
  IF n = 0 THEN
    RAISE NOTICE 'OK: event trigger endurecido (RLS + REVOKE) y 0 grants residuales en public.';
  ELSE
    RAISE WARNING '% grants residuales tras la migración 049 (probable grantor distinto a postgres)', n;
  END IF;
END $$;

