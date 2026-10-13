-- Artefactos WATERMARK del preview de diseños (2026-10-13).
--
-- Las superficies de visualización servidas (carrito, "Ver diseño", Mis
-- diseños, /d/<token> + OG, cotización, gracias, pedidos) exhiben el diseño
-- del cliente CON marca de agua en tiling "LUCAMS" (anti-copia; la impresión
-- final nunca la lleva — producción sigue limpia en production-assets). Las
-- versiones watermark viven por convención de paths en el bucket público
-- design-previews ("<designId>/preview-wm.webp", "<designId>/thumb.webp",
-- "<designId>/pages/NN.webp" + "<designId>/wm/pages/NN.webp") y estas dos
-- columnas sellan su EXISTENCIA para no tener que listar Storage por lectura:
--
--   - previewWatermarkedAt: el finalize generó preview-wm.webp + thumb.webp
--     (best-effort: si sharp/Storage fallan queda null y las superficies caen
--     al preview limpio). El backfill one-shot
--     (design-preview-watermarks-20261013.mjs) sella los diseños históricos.
--   - previewPagesCount: páginas por unidad subidas por el Estudio tras el
--     finalize (uploadDesignPreviewPagesAction). null/≤1 = sin pager: el "Ver"
--     del carrito muestra el preview global watermarked.
--
-- Nullable, aditivas y reversibles (DROP COLUMN), sin locks largos (Postgres
-- añade columnas nullable sin default como metadata-only). Escrita a mano y
-- aplicada con `migrate deploy` — `migrate dev` no funciona contra esta DB
-- (shadow DB en Supabase, convención del repo).

ALTER TABLE "Design" ADD COLUMN "previewWatermarkedAt" TIMESTAMP(3);
ALTER TABLE "Design" ADD COLUMN "previewPagesCount" INTEGER;
