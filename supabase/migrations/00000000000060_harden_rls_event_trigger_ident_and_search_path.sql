-- Remediación SEC-04: restaurar el endurecimiento de `public.enforce_rls_on_new_table()`
-- que la migración 027 había introducido (`search_path` fijo + identificadores `%I.%I`
-- resueltos desde `pg_catalog.pg_class`) y que la migración 049 regresionó al
-- reescribir la función con `%s` (`obj.object_identity`) y sin `SET search_path`,
-- conservando íntegros tanto `ENABLE ROW LEVEL SECURITY` como los dos `REVOKE`
-- automáticos en DDL-time introducidos por la 049.

-- 1) Recrear la función del event trigger con search_path vacío, catálogo calificado
--    y citado seguro `%I.%I` por separado para esquema y relación.
CREATE OR REPLACE FUNCTION public.enforce_rls_on_new_table()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  obj      record;
  tbl_name text;
BEGIN
  FOR obj IN SELECT * FROM pg_catalog.pg_event_trigger_ddl_commands()
  LOOP
    IF obj.object_type = 'table'
       AND obj.schema_name = 'public'
    THEN
      SELECT c.relname INTO tbl_name
      FROM pg_catalog.pg_class c
      WHERE c.oid = obj.objid;

      -- Excluir únicamente tablas internas de migraciones de Prisma (`_prisma*`).
      IF tbl_name IS NOT NULL AND tbl_name NOT LIKE '\_prisma%' THEN
        EXECUTE pg_catalog.format(
          'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
          obj.schema_name,
          tbl_name
        );
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON TABLE %I.%I FROM anon, authenticated',
          obj.schema_name,
          tbl_name
        );
        EXECUTE pg_catalog.format(
          'REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I FROM service_role',
          obj.schema_name,
          tbl_name
        );
        RAISE NOTICE 'RLS + REVOKE aplicados automáticamente (event trigger) en %.%',
          obj.schema_name, tbl_name;
      END IF;
    END IF;
  END LOOP;
END;
$fn$;

-- 2) Revocar EXECUTE a roles públicos / de API sobre la función DDL.
REVOKE ALL ON FUNCTION public.enforce_rls_on_new_table() FROM PUBLIC, anon, authenticated;

-- 3) Re-asegurar que el event trigger esté instalado y activo.
DROP EVENT TRIGGER IF EXISTS enforce_rls_on_new_table_trg;
CREATE EVENT TRIGGER enforce_rls_on_new_table_trg
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
  EXECUTE FUNCTION public.enforce_rls_on_new_table();

-- 4) Barrido idempotente de respaldo sobre tablas existentes en `public`.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM service_role;

-- 5) Verificación inline dura (falla con EXCEPTION si la postura de la función no quedó cerrada).
DO $$
DECLARE
  fn_config text[];
  fn_src    text;
BEGIN
  SELECT p.proconfig, p.prosrc
    INTO fn_config, fn_src
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'enforce_rls_on_new_table'
    AND p.pronargs = 0;

  IF fn_config IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(fn_config) AS cfg WHERE cfg IN ('search_path=""', 'search_path=''''')
  ) THEN
    RAISE EXCEPTION 'SEC-04 fallo de verificación: enforce_rls_on_new_table sin search_path vacío (%)', fn_config;
  END IF;

  IF fn_src ~* 'format\s*\([^)]*%s' THEN
    RAISE EXCEPTION 'SEC-04 fallo de verificación: enforce_rls_on_new_table conserva interpolación %%s';
  END IF;

  RAISE NOTICE 'OK: enforce_rls_on_new_table endurecida con search_path vacío, %%I.%%I y EXECUTE revocado.';
END $$;

