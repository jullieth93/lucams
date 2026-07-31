-- Publicación programada (CMS v2, roadmap C3): CmsFieldVersion.publishAt =
-- fecha futura a la que el cron `lucams-cms-publish-scheduled` (job pg_cron
-- que llama GET /api/cron/cms-publish-scheduled — ver supabase/migrations/
-- 00000000000021_pgcron_cms_publish.sql) publicará la versión. Índice
-- PARCIAL: solo interesan las filas programadas (poquísimas); Prisma no
-- expresa índices parciales, así que vive solo acá (comentario en el schema).
-- Escrita a mano (migrate dev no puede levantar shadow DB en Supabase por la
-- extensión pg_trgm de una migración vieja). Aplicar con `make migrate`.

-- AlterTable
ALTER TABLE "CmsFieldVersion" ADD COLUMN "publishAt" TIMESTAMP(3);

-- CreateIndex (parcial: WHERE "publishAt" IS NOT NULL)
CREATE INDEX "CmsFieldVersion_publishAt_idx" ON "CmsFieldVersion" ("publishAt") WHERE "publishAt" IS NOT NULL;
