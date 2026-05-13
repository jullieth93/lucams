-- Sub-bloque M (Estudio de Personalización — diferenciador #1)
--
-- Esta migración agrega:
--   - 2 enums: PersonalizationKind, DesignStatus
--   - 3 tablas: Design, DesignAsset, PersonalizationTemplate
--   - Columnas: Product.personalizationKind, CartItem.designId, OrderItem.designId
--
-- NO toca:
--   - rate_limit_buckets (creada vía supabase/migrations/00000000000003_rate_limit.sql)
--   - product_sku_trgm_idx + product_slug_trgm_idx (creados vía
--     supabase/migrations/00000000000005_search_and_storage.sql)
--   - Esas tablas/índices viven fuera de Prisma; Prisma migrate diff los reporta
--     pero NO los gestionamos via Prisma.
--
-- Fuente: docs/DECISIONS.md ADR-035 (pendiente al cerrar sub-bloque M)

-- ──────────────────────── ENUMS ────────────────────────

CREATE TYPE "PersonalizationKind" AS ENUM (
  'PHOTO_PACK',
  'PHOTO_GRID',
  'CALENDAR_PHOTO_MONTH',
  'CALENDAR_PHOTO_HERO',
  'EVENT_FAVOR',
  'BUSINESS_LOGO',
  'CUSTOM_DECOR',
  'TEXT_ONLY',
  'NONE'
);

CREATE TYPE "DesignStatus" AS ENUM (
  'DRAFT',
  'READY',
  'USED_IN_ORDER',
  'ARCHIVED'
);

-- ──────────────────────── PRODUCT ────────────────────────

ALTER TABLE "Product"
  ADD COLUMN "personalizationKind" "PersonalizationKind" NOT NULL DEFAULT 'NONE';

CREATE INDEX "Product_personalizationKind_isActive_idx"
  ON "Product"("personalizationKind", "isActive");

-- ──────────────────────── DESIGN ────────────────────────

CREATE TABLE "Design" (
  "id"            TEXT NOT NULL,
  "customerId"    TEXT,
  "sessionId"     TEXT,
  "productId"     TEXT NOT NULL,
  "templateId"    TEXT,
  "status"        "DesignStatus" NOT NULL DEFAULT 'DRAFT',
  "canvasData"    JSONB NOT NULL,
  "previewUrl"    TEXT,
  "productionUrl" TEXT,
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "shareToken"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "createdBy"     TEXT,
  "updatedBy"     TEXT,
  CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Design_shareToken_key" ON "Design"("shareToken");
CREATE INDEX "Design_customerId_status_idx" ON "Design"("customerId", "status");
CREATE INDEX "Design_sessionId_status_idx" ON "Design"("sessionId", "status");
CREATE INDEX "Design_productId_idx" ON "Design"("productId");
CREATE INDEX "Design_status_updatedAt_idx" ON "Design"("status", "updatedAt");

ALTER TABLE "Design" ADD CONSTRAINT "Design_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Design" ADD CONSTRAINT "Design_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- templateId FK se agrega después de crear PersonalizationTemplate (forward ref)

-- ──────────────────────── DESIGN ASSET ────────────────────────

CREATE TABLE "DesignAsset" (
  "id"             TEXT NOT NULL,
  "designId"       TEXT,
  "customerId"     TEXT,
  "sessionId"      TEXT,
  "storageUrl"     TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "sizeBytes"      INTEGER NOT NULL,
  "width"          INTEGER NOT NULL,
  "height"         INTEGER NOT NULL,
  "exifStripped"   BOOLEAN NOT NULL DEFAULT false,
  "malwareScanned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DesignAsset_designId_idx" ON "DesignAsset"("designId");
CREATE INDEX "DesignAsset_customerId_createdAt_idx" ON "DesignAsset"("customerId", "createdAt");
CREATE INDEX "DesignAsset_sessionId_createdAt_idx" ON "DesignAsset"("sessionId", "createdAt");

ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────── PERSONALIZATION TEMPLATE ────────────────────────

CREATE TABLE "PersonalizationTemplate" (
  "id"         TEXT NOT NULL,
  "productId"  TEXT,
  "kind"       "PersonalizationKind" NOT NULL,
  "name"       TEXT NOT NULL,
  "slug"       TEXT NOT NULL,
  "previewUrl" TEXT NOT NULL,
  "canvasData" JSONB NOT NULL,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "order"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "createdBy"  TEXT,
  "updatedBy"  TEXT,
  "deletedAt"  TIMESTAMP(3),
  "deletedBy"  TEXT,
  CONSTRAINT "PersonalizationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalizationTemplate_slug_key" ON "PersonalizationTemplate"("slug");
CREATE INDEX "PersonalizationTemplate_kind_isActive_order_idx"
  ON "PersonalizationTemplate"("kind", "isActive", "order");
CREATE INDEX "PersonalizationTemplate_productId_isActive_idx"
  ON "PersonalizationTemplate"("productId", "isActive");

ALTER TABLE "PersonalizationTemplate" ADD CONSTRAINT "PersonalizationTemplate_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────── DESIGN ↔ TEMPLATE FK (forward ref resolved) ────────────────────────

ALTER TABLE "Design" ADD CONSTRAINT "Design_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "PersonalizationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────── CART ITEM ────────────────────────

ALTER TABLE "CartItem" ADD COLUMN "designId" TEXT;

CREATE INDEX "CartItem_designId_idx" ON "CartItem"("designId");

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────── ORDER ITEM ────────────────────────

ALTER TABLE "OrderItem" ADD COLUMN "designId" TEXT;

CREATE INDEX "OrderItem_designId_idx" ON "OrderItem"("designId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;
