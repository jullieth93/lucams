-- Migration PLAN_CATALOG_V2 — consolidada (2026-05-15)
--
-- Cubre los cambios derivados de las 8 áreas cerradas en docs/PLAN_CATALOG_V2.md:
--   Área 1 — Categorías:        Category enriquecida + sub-cats activación programada
--   Área 2 — Productos:         Product enriquecido (richDescription, idealFor, etc.)
--   Área 3 — Cantidad/Cupones:  Product min/maxQuantity, premadeSurcharge, Coupon +
--                                CouponUsage + restricciones avanzadas
--   Área 4 — Producto físico:   Product.physicalSpecs, warranty, productionDays,
--                                shippingDaysMin/Max + Order.shippingCarrier/tracking
--   Área 5 — Pool prediseñado:  PersonalizationTemplate.mode + CartItem/OrderItem.templateId
--   Área 6 — Recomendaciones:   RecommendationLog
--   Área 7 — Filtros:           Category.visibleFilters + defaultSort
--   Área 8 — Admin:             ProductVariant.isActive + ProductVariant.description
--
-- Tablas nuevas: OcasionTag, ProductOcasionTag, CouponUsage, RecommendationLog
-- Enum nuevo: TemplateMode

BEGIN;

-- ─────────── ENUM NUEVO ───────────
CREATE TYPE "TemplateMode" AS ENUM ('EDITABLE', 'PREMADE');

-- ─────────── CATEGORY (Área 1 + 7) ───────────
ALTER TABLE "Category"
  ADD COLUMN "richDescription"     TEXT,
  ADD COLUMN "useCase"             TEXT,
  ADD COLUMN "visibleFilters"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "defaultSort"         TEXT DEFAULT 'recent',
  ADD COLUMN "featuredProductSlug" TEXT,
  ADD COLUMN "activeFrom"          TIMESTAMP(3),
  ADD COLUMN "activeUntil"         TIMESTAMP(3);

CREATE INDEX "Category_isActive_parentId_order_idx"
  ON "Category"("isActive", "parentId", "order");

-- ─────────── PRODUCT (Áreas 2 + 3 + 4 + 5) ───────────
ALTER TABLE "Product"
  ADD COLUMN "richDescription"   TEXT,
  ADD COLUMN "whyChooseThis"     TEXT,
  ADD COLUMN "idealFor"          JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN "physicalSpecs"     JSONB,
  ADD COLUMN "warrantyMonths"    INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "productionDays"    INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "shippingDaysMin"   INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "shippingDaysMax"   INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "minimumQuantity"   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "maximumQuantity"   INTEGER,
  ADD COLUMN "premadeSurcharge"  INTEGER NOT NULL DEFAULT 0;

-- ─────────── PRODUCT VARIANT (Áreas 2 + 8) ───────────
ALTER TABLE "ProductVariant"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isActive"    BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX "ProductVariant_productId_isActive_idx"
  ON "ProductVariant"("productId", "isActive");

-- ─────────── COUPON (Área 3) ───────────
ALTER TABLE "Coupon"
  ADD COLUMN "appliesToCategories"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "appliesToProductSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "maxUsesPerCustomer"    INTEGER,
  ADD COLUMN "isPublic"              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "description"           TEXT,
  ADD COLUMN "requiresMinQuantity"   INTEGER;

CREATE INDEX "Coupon_isPublic_isActive_deletedAt_idx"
  ON "Coupon"("isPublic", "isActive", "deletedAt");

-- ─────────── COUPON USAGE (Área 3 — tabla nueva) ───────────
CREATE TABLE "CouponUsage" (
  "id"         TEXT NOT NULL,
  "couponId"   TEXT NOT NULL,
  "customerId" TEXT,
  "orderId"    TEXT NOT NULL,
  "appliedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount"     INTEGER NOT NULL,

  CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CouponUsage_orderId_key"           ON "CouponUsage"("orderId");
CREATE INDEX        "CouponUsage_customerId_couponId_idx" ON "CouponUsage"("customerId", "couponId");
CREATE INDEX        "CouponUsage_couponId_appliedAt_idx"  ON "CouponUsage"("couponId", "appliedAt");

ALTER TABLE "CouponUsage"
  ADD CONSTRAINT "CouponUsage_couponId_fkey"   FOREIGN KEY ("couponId")   REFERENCES "Coupon"("id")   ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CouponUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CouponUsage_orderId_fkey"    FOREIGN KEY ("orderId")    REFERENCES "Order"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────── ORDER (Área 4) ───────────
ALTER TABLE "Order"
  ADD COLUMN "shippingCarrier" TEXT,
  ADD COLUMN "trackingNumber"  TEXT,
  ADD COLUMN "labelUrl"        TEXT;

CREATE INDEX "Order_trackingNumber_idx" ON "Order"("trackingNumber");

-- ─────────── CART ITEM (Área 5) ───────────
ALTER TABLE "CartItem"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "metadata"   JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX "CartItem_templateId_idx" ON "CartItem"("templateId");

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "PersonalizationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────── ORDER ITEM (Área 5) ───────────
ALTER TABLE "OrderItem"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "metadata"   JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX "OrderItem_templateId_idx" ON "OrderItem"("templateId");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "PersonalizationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────── PERSONALIZATION TEMPLATE (Área 5) ───────────
ALTER TABLE "PersonalizationTemplate"
  ADD COLUMN "mode"        "TemplateMode" NOT NULL DEFAULT 'EDITABLE',
  ADD COLUMN "description" TEXT;

-- Reindex con mode incluido (sin borrar índice viejo — Prisma puede esperarlo)
CREATE INDEX "PersonalizationTemplate_kind_mode_isActive_order_idx"
  ON "PersonalizationTemplate"("kind", "mode", "isActive", "order");
CREATE INDEX "PersonalizationTemplate_productId_mode_isActive_idx"
  ON "PersonalizationTemplate"("productId", "mode", "isActive");
CREATE INDEX "PersonalizationTemplate_mode_isActive_idx"
  ON "PersonalizationTemplate"("mode", "isActive");

-- ─────────── OCASION TAG (Áreas 1 + 2 + 3 — tabla nueva) ───────────
CREATE TABLE "OcasionTag" (
  "id"                     TEXT NOT NULL,
  "slug"                   TEXT NOT NULL,
  "name"                   TEXT NOT NULL,
  "description"            TEXT NOT NULL,
  "monthHint"              INTEGER,
  "suggestedQuantityRange" JSONB,
  "isActive"               BOOLEAN NOT NULL DEFAULT TRUE,
  "order"                  INTEGER NOT NULL DEFAULT 0,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  "createdBy"              TEXT,
  "updatedBy"              TEXT,
  "deletedAt"              TIMESTAMP(3),
  "deletedBy"              TEXT,

  CONSTRAINT "OcasionTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OcasionTag_slug_key"            ON "OcasionTag"("slug");
CREATE INDEX        "OcasionTag_deletedAt_idx"       ON "OcasionTag"("deletedAt");
CREATE INDEX        "OcasionTag_isActive_order_idx"  ON "OcasionTag"("isActive", "order");
CREATE INDEX        "OcasionTag_monthHint_idx"       ON "OcasionTag"("monthHint");

-- ─────────── PRODUCT OCASION TAG (pivot) ───────────
CREATE TABLE "ProductOcasionTag" (
  "productId"    TEXT NOT NULL,
  "ocasionTagId" TEXT NOT NULL,
  "rationale"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductOcasionTag_pkey" PRIMARY KEY ("productId", "ocasionTagId")
);
CREATE INDEX "ProductOcasionTag_ocasionTagId_idx" ON "ProductOcasionTag"("ocasionTagId");

ALTER TABLE "ProductOcasionTag"
  ADD CONSTRAINT "ProductOcasionTag_productId_fkey"    FOREIGN KEY ("productId")    REFERENCES "Product"("id")    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductOcasionTag_ocasionTagId_fkey" FOREIGN KEY ("ocasionTagId") REFERENCES "OcasionTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────── RECOMMENDATION LOG (Área 6 — tabla nueva) ───────────
CREATE TABLE "RecommendationLog" (
  "id"               TEXT NOT NULL,
  "sessionId"        TEXT NOT NULL,
  "customerId"       TEXT,
  "queryType"        TEXT NOT NULL,
  "queryParams"      JSONB NOT NULL,
  "recommendedSlugs" TEXT[] NOT NULL,
  "clickedSlugs"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "purchasedSlugs"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecommendationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecommendationLog_sessionId_createdAt_idx"   ON "RecommendationLog"("sessionId", "createdAt");
CREATE INDEX "RecommendationLog_customerId_createdAt_idx"  ON "RecommendationLog"("customerId", "createdAt");
CREATE INDEX "RecommendationLog_queryType_createdAt_idx"   ON "RecommendationLog"("queryType", "createdAt");

ALTER TABLE "RecommendationLog"
  ADD CONSTRAINT "RecommendationLog_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────── ÍNDICES GIN PARA SEARCH RICA (Área 7.8) ───────────
-- Búsqueda fuzzy pg_trgm sobre richDescription + idealFor concatenados (cuando aplique).
-- Extensión pg_trgm + unaccent ya está habilitada (migration 00000000000004).
CREATE INDEX "Product_richDescription_trgm_idx"
  ON "Product" USING GIN ((COALESCE("richDescription", '')) gin_trgm_ops);

COMMIT;
