-- Migración 100% ADITIVA (DB compartida dev/prod): solo CREATE de enum, tablas,
-- índices y FKs nuevos para cotizaciones Etapa 1 (catálogo + WhatsApp).
-- NO toca ninguna tabla/índice existente.
--
-- Generada con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel`
-- y FILTRADA a mano: el diff completo incluía DROPs por drift preexistente
-- (índices trgm de Product, PersonalizationTemplate_*_idx y la tabla nativa
-- rate_limit_buckets, que viven fuera del schema Prisma). Esos objetos NO se
-- tocan acá — pertenecen a migraciones SQL nativas de supabase/migrations.

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'CONTACTED', 'CLOSED', 'DISCARDED');

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT NOT NULL,
    "customerWhatsapp" TEXT NOT NULL,
    "customerEmail" TEXT,
    "city" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "notes" TEXT,
    "internalNotes" TEXT,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "publicAccessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "designId" TEXT,
    "productName" TEXT NOT NULL,
    "variantName" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previewUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_publicAccessToken_key" ON "Quote"("publicAccessToken");

-- CreateIndex
CREATE INDEX "Quote_status_createdAt_idx" ON "Quote"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_deletedAt_idx" ON "Quote"("deletedAt");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;
