-- D-2 (ADR-211): snapshot inmutable del nombre del producto y SKU al confirmar
-- un pedido. Columnas anulables (100 % aditivas) para retrocompatibilidad con
-- órdenes históricas; las vistas y correos caen a variant.product.name / sku
-- cuando son NULL.

ALTER TABLE "OrderItem"
  ADD COLUMN "titleSnapshot" TEXT,
  ADD COLUMN "skuSnapshot" TEXT;
