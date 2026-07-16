-- Wishlist + "avísame cuando vuelva" (palancas de ingreso, auditoría 2026-07-13).
CREATE TABLE IF NOT EXISTS "WishlistItem" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WishlistItem_customerId_productId_key" ON "WishlistItem"("customerId","productId");
CREATE INDEX IF NOT EXISTS "WishlistItem_customerId_createdAt_idx" ON "WishlistItem"("customerId","createdAt");
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BackInStockSubscription" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "customerId" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackInStockSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BackInStockSubscription_productId_email_key" ON "BackInStockSubscription"("productId","email");
CREATE INDEX IF NOT EXISTS "BackInStockSubscription_productId_notifiedAt_idx" ON "BackInStockSubscription"("productId","notifiedAt");
ALTER TABLE "BackInStockSubscription" ADD CONSTRAINT "BackInStockSubscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackInStockSubscription" ADD CONSTRAINT "BackInStockSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS deny-by-default (mandato #12): la app opera vía Prisma (rol privilegiado, bypassa RLS).
ALTER TABLE "WishlistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BackInStockSubscription" ENABLE ROW LEVEL SECURITY;
