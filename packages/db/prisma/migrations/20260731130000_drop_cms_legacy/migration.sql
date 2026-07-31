-- Fase A2 (2026-07-31) — Drop de las tablas legacy del CMS viejo.
-- CmsBlock/CmsBlockVersion/SiteSetting quedaron DEPRECATED con CMS v2
-- (20260730120000_add_cms_v2) como respaldo hasta verificar la migración en
-- producción (A1 certificada 2026-07-31: smoke edit→publish→ver en / OK).
-- Respaldo previo al drop: volcado JSON completo (330 filas) en
-- tmp/backups/cms-legacy-20260731.json (fuera del repo, en la VM).
-- Escrita a mano (migrate dev no levanta shadow DB en Supabase por pg_trgm).

-- DropTable (la FK circular CmsBlock.publishedVersionId → CmsBlockVersion
-- exige soltar la constraint antes de dropear).
ALTER TABLE "CmsBlock" DROP CONSTRAINT IF EXISTS "CmsBlock_publishedVersionId_fkey";
DROP TABLE IF EXISTS "CmsBlockVersion";
DROP TABLE IF EXISTS "CmsBlock";
DROP TABLE IF EXISTS "SiteSetting";

-- DropEnum
DROP TYPE IF EXISTS "BlockFormat";
DROP TYPE IF EXISTS "BlockCategory";
DROP TYPE IF EXISTS "SettingType";
DROP TYPE IF EXISTS "SettingCategory";
