-- Auditoría pre-lanzamiento 2026-09-04 — cierra el hallazgo F-23 [A05]:
-- tres funciones de `public` conservan EXECUTE para PUBLIC (el default de
-- Postgres al crear una función) porque la migración 00000000000027 endureció
-- el search_path de las 4 funciones del hallazgo G-8 pero solo revocó EXECUTE
-- de `rate_limit_check` e `is_active_admin`:
--
--   - public.immutable_unaccent(text)            (00000000000005:18-22)
--   - public.enforce_rls_on_new_table()          (event trigger,
--                                                 00000000000014:21-47,
--                                                 recreada en 00000000000027)
--   - public.coupon_usage_enforce_per_customer() (trigger BEFORE INSERT en
--                                                 "CouponUsage", migración
--                                                 Prisma 20260829150300:22-70)
--
-- Explotabilidad real: baja. `immutable_unaccent` es IMMUTABLE pura (solo
-- normaliza texto) y las otras dos devuelven pseudo-tipos
-- (trigger/event_trigger) que PostgREST no puede serializar: invocarlas vía
-- RPC como anon produce error, no daño. Aun así quedan listadas en el schema
-- cache de la API y el advisor las sigue marcando — se revoca por higiene y
-- para cerrar del todo la superficie RPC.
--
-- Por qué el REVOKE es seguro:
--   - Las funciones de trigger y event trigger NO necesitan EXECUTE para
--     dispararse: Postgres no verifica ese privilegio cuando la invoca un
--     (event) trigger; el grant solo aplica a llamadas directas
--     (SELECT f() / RPC). Los triggers coupon_usage_per_customer_limit y
--     enforce_rls_on_new_table_trg siguen funcionando igual.
--   - `immutable_unaccent` la invoca la app vía Prisma `$queryRaw` con
--     conexión directa (rol postgres = owner/superuser del proyecto — ver
--     nota de callers en 00000000000027): el owner conserva EXECUTE siempre.
--     Los índices GIN que la referencian (00000000000031) tampoco exigen
--     EXECUTE al rol que consulta.
--   - is_active_admin NO se toca: debe SEGUIR ejecutable por authenticated
--     (policies de storage la usan como authenticated — 00000000000027).
--
-- Idempotencia: guardas IF EXISTS sobre pg_proc (el archivo es no-op donde
-- la función no exista — p.ej. coupon_usage_enforce_per_customer viene de una
-- migración Prisma y un entorno roto podría no tenerla) y REVOKE de lo no
-- otorgado es no-op. El EXECUTE de PUBLIC es el DEFAULT ACL de creación, no
-- un grant con grantor propio, así que REVOKE ... FROM PUBLIC siempre muerde
-- cuando lo ejecuta el owner; la verificación final hace RAISE WARNING y NO
-- rompe el deploy (mismo criterio que 00000000000026).

-- ──────────────────────── 1) immutable_unaccent ────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'immutable_unaccent'
      AND p.pronargs = 1
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.immutable_unaccent(text)
      FROM PUBLIC, anon, authenticated;
    RAISE NOTICE 'immutable_unaccent: EXECUTE revocado a PUBLIC/anon/authenticated.';
  ELSE
    RAISE NOTICE 'immutable_unaccent(text) ausente en public — no-op.';
  END IF;
END $$;

-- ──────────────────────── 2) enforce_rls_on_new_table ────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_rls_on_new_table'
      AND p.pronargs = 0
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.enforce_rls_on_new_table()
      FROM PUBLIC, anon, authenticated;
    RAISE NOTICE 'enforce_rls_on_new_table: EXECUTE revocado a PUBLIC/anon/authenticated.';
  ELSE
    RAISE NOTICE 'enforce_rls_on_new_table() ausente en public — no-op.';
  END IF;
END $$;

-- ──────────────────────── 3) coupon_usage_enforce_per_customer ────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'coupon_usage_enforce_per_customer'
      AND p.pronargs = 0
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.coupon_usage_enforce_per_customer()
      FROM PUBLIC, anon, authenticated;
    RAISE NOTICE 'coupon_usage_enforce_per_customer: EXECUTE revocado a PUBLIC/anon/authenticated.';
  ELSE
    RAISE NOTICE 'coupon_usage_enforce_per_customer() ausente en public — no-op.';
  END IF;
END $$;

-- ──────────────────────── Verificación inline ────────────────────────
-- has_function_privilege contempla TODA vía de acceso (PUBLIC implícito,
-- grant directo, membresía de rol): si anon/authenticated salen limpios, no
-- queda camino de EXECUTE vía API. Incluye guarda anti-regresión sobre
-- is_active_admin, que debe conservar EXECUTE para authenticated.

DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS fn
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND (
        (p.proname = 'immutable_unaccent' AND p.pronargs = 1)
        OR (p.proname = 'enforce_rls_on_new_table' AND p.pronargs = 0)
        OR (p.proname = 'coupon_usage_enforce_per_customer' AND p.pronargs = 0)
      )
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
    ORDER BY 1
  LOOP
    n := n + 1;
    RAISE WARNING 'EXECUTE residual vía API en %', r.fn;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'OK: immutable_unaccent / enforce_rls_on_new_table / coupon_usage_enforce_per_customer sin EXECUTE para PUBLIC/anon/authenticated.';
  ELSE
    RAISE WARNING '% función(es) conservan EXECUTE para anon/authenticated — revisar manualmente con el rol owner', n;
  END IF;

  -- Guarda anti-regresión: is_active_admin debe seguir ejecutable por
  -- authenticated (la endureció la 00000000000027; esta migración NO la toca).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.proname = 'is_active_admin'
      AND p.pronargs = 0
  ) AND NOT has_function_privilege('authenticated', 'public.is_active_admin()', 'EXECUTE') THEN
    RAISE WARNING 'is_active_admin perdió EXECUTE para authenticated — restaurar con GRANT según 00000000000027 (las policies de storage la necesitan).';
  END IF;
END $$;
