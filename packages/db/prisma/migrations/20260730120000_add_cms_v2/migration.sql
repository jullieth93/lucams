-- CMS v2: Página → Sección → Campo (+ versiones append-only).
-- Escrita a mano (migrate dev no puede levantar shadow DB en Supabase por la
-- extensión pg_trgm de una migración vieja). Aplicar con `make migrate`.
-- CmsBlock/CmsBlockVersion/SiteSetting NO se tocan: quedan como respaldo
-- hasta verificar la migración de datos en producción (ver HANDOFF).

-- CreateEnum
CREATE TYPE "CmsFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'MARKDOWN', 'HTML', 'JSON', 'EMAIL', 'URL', 'NUMBER', 'PHONE', 'COLOR', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "CmsFieldKind" AS ENUM ('BLOCK', 'SETTING');

-- CreateTable
CREATE TABLE "CmsPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsSection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsField" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "CmsFieldKind" NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "type" "CmsFieldType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "CmsField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsFieldVersion" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CmsFieldVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmsPage_slug_key" ON "CmsPage"("slug");

-- CreateIndex
CREATE INDEX "CmsPage_sortOrder_idx" ON "CmsPage"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CmsSection_pageId_key_key" ON "CmsSection"("pageId", "key");

-- CreateIndex
CREATE INDEX "CmsSection_pageId_sortOrder_idx" ON "CmsSection"("pageId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CmsField_key_key" ON "CmsField"("key");

-- CreateIndex
CREATE INDEX "CmsField_sectionId_sortOrder_idx" ON "CmsField"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CmsField_kind_category_isPublished_idx" ON "CmsField"("kind", "category", "isPublished");

-- CreateIndex
CREATE INDEX "CmsField_key_idx" ON "CmsField"("key");

-- CreateIndex
CREATE INDEX "CmsField_deletedAt_idx" ON "CmsField"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CmsFieldVersion_fieldId_version_key" ON "CmsFieldVersion"("fieldId", "version");

-- CreateIndex
CREATE INDEX "CmsFieldVersion_fieldId_createdAt_idx" ON "CmsFieldVersion"("fieldId", "createdAt");

-- AddForeignKey
ALTER TABLE "CmsSection" ADD CONSTRAINT "CmsSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CmsPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsField" ADD CONSTRAINT "CmsField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CmsSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsField" ADD CONSTRAINT "CmsField_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "CmsFieldVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsFieldVersion" ADD CONSTRAINT "CmsFieldVersion_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CmsField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
