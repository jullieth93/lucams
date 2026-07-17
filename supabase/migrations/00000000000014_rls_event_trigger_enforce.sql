-- ADR-062 P1 — Cerrar el gap de RLS ante deploys INCREMENTALES.
--
-- Problema: el sweep de la migración 10 es DINÁMICO (habilita RLS en todas las tablas
-- públicas sin ella). En un build DESDE CERO (CI por-PR) re-corre y cubre cualquier tabla
-- nueva → el gate rls-coverage siempre pasa (verde). Pero en un deploy INCREMENTAL (prod) el
-- sweep 10 ya se aplicó y NO se re-ejecuta, así que una tabla creada por una futura migración
-- Prisma nacería SIN RLS en prod mientras el CI queda verde → falso verde.
--
-- Fix estructural: un EVENT TRIGGER que, al final de CADA `CREATE TABLE`, habilita RLS sobre
-- la tabla nueva del schema public. Corre en DDL-time en AMBOS caminos (from-scratch e
-- incremental) y no depende de que nadie recuerde actualizar el sweep. Es el mandato #12
-- (deny-by-default) hecho garantía estructural. En Supabase el rol `postgres` (no-superuser)
-- tiene permitido crear event triggers (verificado 2026-07-16).
--
-- La app opera vía Prisma con el rol dueño (bypassa RLS) → no rompe nada; el cliente anon
-- (publishable key vía PostgREST) queda sin acceso salvo policy SELECT explícita.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP/CREATE del trigger + sweep del estado actual.

-- 1) Función del event trigger: habilita RLS en cada tabla nueva de public.
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
       -- La tabla de tracking de Prisma no necesita RLS (solo la toca el rol dueño).
       AND split_part(obj.object_identity, '.', 2) NOT LIKE '\_prisma%'
    THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);
      RAISE NOTICE 'RLS habilitada (event trigger) en %', obj.object_identity;
    END IF;
  END LOOP;
END;
$$;

-- 2) Instalar el trigger (re-ejecutable).
DROP EVENT TRIGGER IF EXISTS enforce_rls_on_new_table_trg;
CREATE EVENT TRIGGER enforce_rls_on_new_table_trg
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
  EXECUTE FUNCTION public.enforce_rls_on_new_table();

-- 3) Sweep del estado ACTUAL (belt-and-suspenders): garantiza que en el momento de instalar el
--    trigger todo esté cubierto, aunque alguna tabla se hubiera creado antes.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = false AND tablename NOT LIKE '\_prisma%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 4) Verificación inline: si queda alguna tabla pública sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = false AND tablename NOT LIKE '\_prisma%';
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas públicas sin RLS tras instalar el event trigger', n;
  END IF;
  RAISE NOTICE 'OK: RLS garantizada + event trigger instalado para tablas futuras.';
END $$;
