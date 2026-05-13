-- Sub-bloque M.3.b — Estudio v2 multi-slot. Schema migration.
--
-- Agrega `Design.productionUrls: String[]` (default empty array) para
-- soportar el paradigma slot-por-imán: cada Design genera N PNGs 300 DPI
-- separados (uno por imán físico del pack) en lugar de 1 PNG monolítico.
--
-- `productionUrl` legacy (single) queda nullable para retro-compat. Designs
-- V1 (M.3) ya creados antes de hoy lo siguen usando hasta que migren al
-- abrirlos en el editor (auto-migra V1→V2 client-side).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS para soportar re-aplicar.

ALTER TABLE "Design"
  ADD COLUMN IF NOT EXISTS "productionUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: para designs existentes con productionUrl no-null (M.3 legacy),
-- copiarlo a productionUrls[0] para que el admin pueda seguir descargando.
-- Idempotente: solo backfill si productionUrls está vacío y productionUrl existe.
UPDATE "Design"
SET "productionUrls" = ARRAY["productionUrl"]
WHERE "productionUrl" IS NOT NULL
  AND ("productionUrls" IS NULL OR cardinality("productionUrls") = 0);
