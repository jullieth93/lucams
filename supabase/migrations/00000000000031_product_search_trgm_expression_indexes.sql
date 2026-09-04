-- Auditoría pre-lanzamiento 2026-09-04 — cierra el hallazgo F-13: los índices
-- GIN trigram creados para la búsqueda de productos NO aplican a las queries
-- reales → cada búsqueda del storefront resuelve con seq scan sobre "Product".
--
-- Evidencia — expresiones textuales copiadas de los predicados reales:
--
--   apps/web/lib/catalog.ts (searchCatalog, /api/catalog/search):
--     unaccent(lower(name)) % unaccent(lower(${q}))
--     OR unaccent(lower(COALESCE("richDescription", ''))) % unaccent(lower(${q}))
--     OR unaccent(lower(COALESCE("description", ''))) % unaccent(lower(${q}))
--
--   apps/web/features/products/public-service.ts (searchProducts, header search):
--     immutable_unaccent(LOWER(p.name)) LIKE immutable_unaccent(LOWER(${pattern}))
--     OR immutable_unaccent(LOWER(p.description)) LIKE ...
--     OR LOWER(p.sku) LIKE ... OR LOWER(p.slug) LIKE ...
--     OR similarity(immutable_unaccent(p.name), immutable_unaccent(${safe})) > 0.25
--
--   apps/web/lib/cms.ts (searchCmsBlocks, /api/cms/search — autocomplete admin):
--     unaccent(COALESCE(v.title, f.label, '')) % unaccent(${q})
--     OR unaccent(v.body) % unaccent(${q})
--     OR unaccent(f.key) % unaccent(${q})
--
-- Por qué los índices viejos no muerden:
--   (1) catalog.ts y cms.ts usan unaccent() a secas, que es STABLE → Postgres
--       ni siquiera permite indexar esa expresión (por eso la 00000000000005
--       creó el wrapper IMMUTABLE immutable_unaccent), y un índice sobre
--       immutable_unaccent(col) NO matchea un predicado con unaccent(col):
--       el planner exige igualdad estructural de la expresión.
--   (2) Donde el código ya usa immutable_unaccent (public-service.ts), los
--       predicados envuelven con LOWER(...) → tampoco matchean
--       immutable_unaccent("name") a secas.
--   (3) similarity(...) > t en forma FUNCIÓN no es indexable: pg_trgm solo
--       soporta índice vía operadores (%, <%, ~~, …).
--
-- Corrección elegida (menor riesgo): índices de expresión nuevos que matchean
-- EXACTAMENTE los predicados + swap en catalog.ts de unaccent() →
-- public.immutable_unaccent(). El wrapper es semánticamente IDÉNTICO (su
-- cuerpo es `SELECT public.unaccent($1)`: misma normalización de acentos,
-- mismo caso) — la búsqueda insensible a acentos ("corazon" ↔ "Corazón",
-- apps/web/lib/catalog.integration.test.ts) sigue pasando. Sin ese swap no
-- existe índice posible para esos predicados (STABLE no es indexable), así
-- que la alternativa "solo crear índices" no estaba disponible para
-- searchCatalog. La opción de reescribir las queries para usar la expresión
-- indexada vieja (sin lower) fue descartada: cambiaría la semántica
-- case-insensitive que los tests cubren.
--
-- Qué queda FUERA (decisión documentada, no regresión):
--   - public-service.ts (header search): su OR incluye similarity(...) > 0.25
--     en forma función → el planner no puede armar BitmapOr → seq scan
--     permanece AUNQUE exista índice para sus ramas LIKE. Convertirlo al
--     operador % cambiaría el threshold efectivo (0.25 → GUC
--     pg_trgm.similarity_threshold, default 0.3) = cambio de comportamiento;
--     NO se hace acá. Follow-up: reescribir con set_limit() en transacción o
--     reordenar el OR. El índice nuevo sobre name SÍ matchea estructuralmente
--     su rama `immutable_unaccent(LOWER(p.name)) LIKE …` para cuando eso pase.
--   - cms.ts (searchCmsBlocks): el predicado COALESCE(v.title, f.label, '')
--     referencia DOS tablas del join (CmsField × CmsFieldVersion) → no existe
--     índice de expresión single-table que lo sirva; indexar body/key por
--     separado dejaría el OR con una rama no indexable → seq scan igual.
--     Endpoint admin de bajo tráfico sobre tablas chicas: queda como
--     follow-up (reescritura de query), y por eso NO se crean índices sobre
--     CmsField/CmsFieldVersion aquí (serían índices muertos — anti-patrón
--     según docs/CONVENTIONS.md § indexing).
--
-- Índices viejos: se DROPEAN en la misma migración. Evidencia de desuso
-- (grep repo-wide, 2026-09-04): ninguna query usa immutable_unaccent("name")
-- / immutable_unaccent("description") a secas ni "slug"/"sku" crudos con un
-- operador soportado por pg_trgm (%, ~~, similarity vía operador) — los 4 de
-- la 00000000000005 y Product_richDescription_trgm_idx (Prisma
-- 20260515_catalog_v2_consolidated, sobre COALESCE("richDescription", '')
-- sin unaccent/lower) son dead weight: 5 GIN que penalizan cada write en
-- "Product" sin servir ningún plan. Recreables desde esas migraciones si
-- algún día hicieran falta (DROP de índice no toca datos).
--
-- CONCURRENTLY: sí, por docs/CONVENTIONS.md § indexing (producción). El
-- runner del proyecto aplica supabase/migrations con `psql -f` statement a
-- statement (scripts/db-stg-setup.sh, scripts/db-local-setup.sh, CI y Nightly
-- en .github/workflows) — SIN --single-transaction — así que CONCURRENTLY es
-- válido en este archivo; por eso NO debe envolverse en BEGIN/COMMIT.
-- Riesgo residual: si un CREATE INDEX CONCURRENTLY se aborta a mitad queda un
-- índice INVALID que IF NOT EXISTS saltaría en un re-run → la verificación
-- final detecta índices inválidos/faltantes y avisa cómo recuperar.
--
-- Requiere pg_trgm + unaccent + public.immutable_unaccent (00000000000005) —
-- garantizado por el orden de aplicación de los scripts de setup.
--
-- Orden de deploy indiferente: la query vieja (unaccent a secas) nunca usó
-- los índices viejos, así que dropearlos no degrada nada; y los índices
-- nuevos son inertes hasta que llegue el código con immutable_unaccent.
-- Migración y deploy de apps/web pueden ir en cualquier orden.

-- ──────────────────────── 1) Índices nuevos (expresiones EXACTAS de las queries) ────────────────────────

-- searchCatalog (tras el swap de esta misma remediación) y la rama LIKE de
-- searchProducts comparten esta expresión sobre name.
CREATE INDEX CONCURRENTLY IF NOT EXISTS product_search_name_trgm_idx
  ON "Product" USING GIN ((public.immutable_unaccent(lower("name"))) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS product_search_description_trgm_idx
  ON "Product" USING GIN ((public.immutable_unaccent(lower(COALESCE("description", '')))) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS product_search_rich_description_trgm_idx
  ON "Product" USING GIN ((public.immutable_unaccent(lower(COALESCE("richDescription", '')))) gin_trgm_ops);

-- ──────────────────────── 2) Drop de los índices viejos (dead weight) ────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS product_name_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS product_description_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS product_slug_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS product_sku_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS "Product_richDescription_trgm_idx";

-- ──────────────────────── Verificación inline ────────────────────────
-- WARNING (nunca EXCEPTION): un índice INVALID o faltante no rompe el sitio
-- (la query cae a seq scan, como hoy) y se recupera con DROP + re-run.

DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  -- Nuevos: deben existir, válidos y listos.
  FOR r IN
    SELECT c.relname AS idx, i.indisvalid, i.indisready
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relname IN (
        'product_search_name_trgm_idx',
        'product_search_description_trgm_idx',
        'product_search_rich_description_trgm_idx'
      )
  LOOP
    IF NOT (r.indisvalid AND r.indisready) THEN
      n := n + 1;
      RAISE WARNING 'índice % quedó INVALID/not-ready (CREATE CONCURRENTLY abortado) — DROP INDEX CONCURRENTLY % y re-ejecutar esta migración', r.idx, r.idx;
    END IF;
  END LOOP;

  FOR r IN
    SELECT v.idx
    FROM (VALUES
      ('product_search_name_trgm_idx'),
      ('product_search_description_trgm_idx'),
      ('product_search_rich_description_trgm_idx')
    ) AS v(idx)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relname = v.idx AND c.relkind = 'i'
    )
  LOOP
    n := n + 1;
    RAISE WARNING 'índice % falta — re-ejecutar esta migración (IF NOT EXISTS lo crea)', r.idx;
  END LOOP;

  -- Viejos: no deben seguir presentes.
  FOR r IN
    SELECT c.relname AS idx
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'i'
      AND c.relname IN (
        'product_name_trgm_idx',
        'product_description_trgm_idx',
        'product_slug_trgm_idx',
        'product_sku_trgm_idx',
        'Product_richDescription_trgm_idx'
      )
  LOOP
    n := n + 1;
    RAISE WARNING 'índice viejo % sigue presente — DROP INDEX CONCURRENTLY %', r.idx, r.idx;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'OK: 3 índices GIN de expresión (name/description/richDescription) válidos; 5 índices trigram viejos eliminados.';
  END IF;
END $$;
