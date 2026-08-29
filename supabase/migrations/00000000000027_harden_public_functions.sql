-- Auditoría de seguridad (docs/audits/auditoria_seguridad_lucams.md) — cierra
-- los hallazgos G-8 [A05] y B-9 [A01/A07]:
--
--   G-8: `rate_limit_check`, `immutable_unaccent` y `enforce_rls_on_new_table`
--   tienen search_path mutable (WARN advisor lint 0011 — vector clásico de
--   secuestro de esquema) y EXECUTE por defecto a PUBLIC.
--   B-9: `is_active_admin()` es SECURITY DEFINER ejecutable por `anon`
--   (WARN advisor lints 0028/0029). Impacto real nulo (para anon auth.uid() es
--   NULL → siempre false), pero se endurece por higiene: se recrea con
--   search_path = '' y nombres calificados, y se limita EXECUTE a authenticated
--   (las policies de storage que la usan corren como authenticated).
--
-- Callers verificados en repo (grep): `rate_limit_check` solo se invoca desde
-- `apps/web/lib/rate-limit.ts` vía Prisma `$queryRaw` (conexión directa con rol
-- postgres = dueño, sin grants de función necesarios) y desde tests de
-- integración/e2e con el mismo cliente. NINGÚN caller la invoca vía RPC de
-- PostgREST como anon/authenticated → revocar EXECUTE a esos roles no rompe
-- nada.
--
-- Idempotencia: cada objeto va envuelto en un guarda DO $$ ... IF EXISTS sobre
-- pg_proc, de modo que el archivo es no-op donde la función no exista; ALTER/
-- REVOKE/GRANT y CREATE OR REPLACE son naturalmente re-ejecutables.

-- ──────────────────────── 1) search_path fijo (G-8) ────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    -- pronargs cuenta solo args de entrada: robusto aunque la versión de PG
    -- incluya los nombres en pg_get_function_identity_arguments().
    WHERE n.nspname = 'public' AND p.proname = 'rate_limit_check'
      AND p.pronargs = 3
  ) THEN
    ALTER FUNCTION public.rate_limit_check(text, int, int)
      SET search_path = public, pg_catalog;
    RAISE NOTICE 'rate_limit_check: search_path fijado.';
  ELSE
    RAISE NOTICE 'rate_limit_check(text,int,int) ausente en public — no-op.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'immutable_unaccent'
      AND p.pronargs = 1
  ) THEN
    ALTER FUNCTION public.immutable_unaccent(text)
      SET search_path = public, pg_catalog;
    RAISE NOTICE 'immutable_unaccent: search_path fijado.';
  ELSE
    RAISE NOTICE 'immutable_unaccent(text) ausente en public — no-op.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_rls_on_new_table'
      AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION public.enforce_rls_on_new_table()
      SET search_path = public, pg_catalog;
    RAISE NOTICE 'enforce_rls_on_new_table: search_path fijado.';
  ELSE
    RAISE NOTICE 'enforce_rls_on_new_table() ausente en public — no-op.';
  END IF;
END $$;

-- ──────────────── 2) is_active_admin endurecida (B-9) ────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_admin'
      AND p.pronargs = 0
  ) THEN
    -- Recreada con search_path = '' (vacío) y tabla totalmente calificada:
    -- imposible secuestrar objetos vía search_path en una SECURITY DEFINER.
    -- (SELECT auth.uid())::text: estable para el planificador y cast explícito
    -- uuid → text (supabaseUserId es text).
    CREATE OR REPLACE FUNCTION public.is_active_admin()
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = ''
    AS $fn$
      SELECT EXISTS (
        SELECT 1 FROM public."AdminUser"
        WHERE "supabaseUserId" = (SELECT auth.uid())::text
          AND "isActive" = true
          AND "deletedAt" IS NULL
      );
    $fn$;
    REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;
    RAISE NOTICE 'is_active_admin: recreada (search_path vacío) + EXECUTE solo para authenticated.';
  ELSE
    RAISE NOTICE 'is_active_admin() ausente en public — no-op.';
  END IF;
END $$;

-- ──────────────── 3) rate_limit_check sin EXECUTE vía API (G-8) ────────────────
-- Ver nota de callers en el header: solo la usa la app vía Prisma (rol
-- postgres). Anon/authenticated no tienen camino legítimo a esta función.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rate_limit_check'
      AND p.pronargs = 3
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rate_limit_check(text, int, int)
      FROM PUBLIC, anon, authenticated;
    RAISE NOTICE 'rate_limit_check: EXECUTE revocado a PUBLIC/anon/authenticated.';
  ELSE
    RAISE NOTICE 'rate_limit_check(text,int,int) ausente en public — no-op.';
  END IF;
END $$;

-- ──────────────── 4) enforce_rls_on_new_table con %I (G-8) ────────────────
-- Cuerpo idéntico al de la migración 00000000000014 salvo el format() del
-- EXECUTE, que pasa de %s a identificadores citados con %I (recomendación del
-- hallazgo). OJO: obj.object_identity ya viene calificada y citada por PG
-- (p.ej. public."CartItem"), así que %I directo sobre ella produciría un
-- identificador único inválido ("public.""CartItem""") para las tablas Prisma
-- con mayúsculas. Se cita por partes: schema + relname (resuelto desde
-- pg_class vía obj.objid) — %I.%I es el patrón correcto y funciona con nombres
-- mix-case. El event trigger enforce_rls_on_new_table_trg sigue apuntando a la
-- función (CREATE OR REPLACE conserva la dependencia).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_rls_on_new_table'
      AND p.pronargs = 0
  ) THEN
    CREATE OR REPLACE FUNCTION public.enforce_rls_on_new_table()
    RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_catalog
    AS $fn$
    DECLARE
      obj      record;
      tbl_name text;
    BEGIN
      FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
      LOOP
        IF obj.object_type = 'table'
           AND obj.schema_name = 'public'
           -- La tabla de tracking de Prisma no necesita RLS (solo la toca el rol dueño).
           AND split_part(obj.object_identity, '.', 2) NOT LIKE '\_prisma%'
        THEN
          SELECT c.relname INTO tbl_name
          FROM pg_catalog.pg_class c
          WHERE c.oid = obj.objid;
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
                         obj.schema_name, tbl_name);
          RAISE NOTICE 'RLS habilitada (event trigger) en %', obj.object_identity;
        END IF;
      END LOOP;
    END;
    $fn$;
    RAISE NOTICE 'enforce_rls_on_new_table: recreada con format %%I.%%I.';
  ELSE
    RAISE NOTICE 'enforce_rls_on_new_table() ausente en public — no-op.';
  END IF;
END $$;
