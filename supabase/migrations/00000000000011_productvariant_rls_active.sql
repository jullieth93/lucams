-- Auditoría 2026-07-13: la policy public-read de ProductVariant solo filtraba deletedAt →
-- vía PostgREST/anon un cliente podía leer variantes de productos PAUSADOS (isActive=false)
-- o de productos inactivos/borrados. Se alinea con la policy de Product: la variante solo es
-- pública si está activa, no borrada, Y su Product padre está activo y no borrado.

DROP POLICY IF EXISTS "public read product variants" ON "ProductVariant";
CREATE POLICY "public read product variants" ON "ProductVariant"
  FOR SELECT TO anon, authenticated
  USING (
    "deletedAt" IS NULL
    AND "isActive" = true
    AND EXISTS (
      SELECT 1 FROM "Product" p
      WHERE p.id = "ProductVariant"."productId"
        AND p."isActive" = true
        AND p."deletedAt" IS NULL
    )
  );
