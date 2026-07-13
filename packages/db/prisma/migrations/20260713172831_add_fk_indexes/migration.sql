-- Auditoría 2026-07-13: índices en columnas FK de alto tráfico. Postgres NO indexa
-- automáticamente las FKs → joins/filtros por estas columnas hacían seq scan.
CREATE INDEX IF NOT EXISTS "OrderItem_variantId_idx" ON "OrderItem"("variantId");
CREATE INDEX IF NOT EXISTS "CartItem_variantId_idx" ON "CartItem"("variantId");
CREATE INDEX IF NOT EXISTS "StockReservation_variantId_idx" ON "StockReservation"("variantId");
CREATE INDEX IF NOT EXISTS "Design_templateId_idx" ON "Design"("templateId");
CREATE INDEX IF NOT EXISTS "Order_couponId_idx" ON "Order"("couponId");
CREATE INDEX IF NOT EXISTS "Customer_referredById_idx" ON "Customer"("referredById");
