-- CreateEnum
CREATE TYPE "BlockFormat" AS ENUM ('MARKDOWN', 'HTML', 'TEXT', 'JSON');

-- CreateEnum
CREATE TYPE "BlockCategory" AS ENUM ('LEGAL', 'HOME', 'FOOTER', 'EMPTY_STATE', 'COOKIES', 'FAQ', 'SUPPORT', 'MAINTENANCE', 'EMAIL', 'MARKETING');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('TEXT', 'EMAIL', 'URL', 'NUMBER', 'PHONE', 'COLOR', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "SettingCategory" AS ENUM ('CONTACT', 'BUSINESS', 'LEGAL', 'COMMERCE', 'SOCIAL', 'EXTERNAL', 'WHATSAPP', 'COPYRIGHT', 'SEO');

-- DropIndex

-- DropIndex

-- DropTable

-- CreateTable
CREATE TABLE "CmsBlock" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "format" "BlockFormat" NOT NULL DEFAULT 'MARKDOWN',
    "category" "BlockCategory" NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "CmsBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsBlockVersion" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "format" "BlockFormat" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CmsBlockVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" "SettingType" NOT NULL DEFAULT 'TEXT',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" "SettingCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmsBlock_key_key" ON "CmsBlock"("key");

-- CreateIndex
CREATE INDEX "CmsBlock_category_isPublished_idx" ON "CmsBlock"("category", "isPublished");

-- CreateIndex
CREATE INDEX "CmsBlock_key_idx" ON "CmsBlock"("key");

-- CreateIndex
CREATE INDEX "CmsBlock_deletedAt_idx" ON "CmsBlock"("deletedAt");

-- CreateIndex
CREATE INDEX "CmsBlockVersion_blockId_createdAt_idx" ON "CmsBlockVersion"("blockId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CmsBlockVersion_blockId_version_key" ON "CmsBlockVersion"("blockId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSetting_key_key" ON "SiteSetting"("key");

-- CreateIndex
CREATE INDEX "SiteSetting_category_idx" ON "SiteSetting"("category");

-- AddForeignKey
ALTER TABLE "CmsBlock" ADD CONSTRAINT "CmsBlock_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "CmsBlockVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsBlockVersion" ADD CONSTRAINT "CmsBlockVersion_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "CmsBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

