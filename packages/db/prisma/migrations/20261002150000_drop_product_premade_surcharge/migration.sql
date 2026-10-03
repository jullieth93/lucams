-- Retiro de `Product.premadeSurcharge` (2026-10-02) — funcionalidad falsa.
--
-- El campo era el "recargo %" por elegir una plantilla premium PREMADE
-- (PLAN_CATALOG_V2 5.5), pero el flujo PREMADE fue retirado del storefront el
-- 2026-09-11 (ADR-090: 0 plantillas PREMADE, 0 consumidores) y el recargo
-- JAMÁS se aplicó en carrito/checkout — se editaba en el admin, se persistía y
-- se exponía en el API de catálogo sin efecto alguno (hallazgo A-2 de la
-- auditoría cableado cliente↔admin 2026-10-02). Decisión del owner: eliminar
-- el campo; si la venta de diseños prediseñados vuelve, se diseña como feature
-- nueva completa (pricing incluido).
--
-- También se retira el CHECK `Product_premadeSurcharge_nonnegative_check`
-- (creado en 20260904144657_money_stock_nonnegative_checks). Irreversible
-- sin backup: la columna desaparece con su dato (a la fecha, todo el catálogo
-- está en 0 salvo seeds históricos de Universos con 15 — dato sin efecto).
-- Escrita a mano y aplicada con `migrate deploy` — `migrate dev` no funciona
-- contra esta DB (shadow DB en Supabase, convención del repo).

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_premadeSurcharge_nonnegative_check";
ALTER TABLE "Product" DROP COLUMN "premadeSurcharge";
