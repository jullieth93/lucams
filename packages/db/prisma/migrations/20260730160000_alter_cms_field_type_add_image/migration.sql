-- Campos de IMAGEN (CMS v2, roadmap B5): nuevo valor 'IMAGE' en CmsFieldType
-- (el body del campo guarda el CmsMedia.id) + tabla CmsMedia (metadata del
-- asset subido al bucket público `cms-media` — ver supabase/migrations/
-- 00000000000020_storage_cms_media.sql para bucket + policies + RLS).
-- Escrita a mano (migrate dev no puede levantar shadow DB en Supabase por la
-- extensión pg_trgm de una migración vieja). Aplicar con `make migrate`.
-- Nota: ADD VALUE dentro de transacción es válido en PG ≥ 12 y acá no se USA
-- el valor nuevo en la misma migración (solo se crea la tabla), así que es
-- seguro correr con `prisma migrate deploy`.

-- AlterEnum
ALTER TYPE "CmsFieldType" ADD VALUE 'IMAGE';

-- CreateTable
CREATE TABLE "CmsMedia" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmsMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmsMedia_path_key" ON "CmsMedia"("path");

-- CreateIndex
CREATE INDEX "CmsMedia_createdAt_idx" ON "CmsMedia"("createdAt");
