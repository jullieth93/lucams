-- Thumbnails de BORRADOR en "Mis diseños" (2026-10-13).
--
-- Los DRAFT no tienen preview (el snapshot compositado solo se genera en el
-- finalize), así que su tarjeta en /mi-cuenta/disenos era un placeholder fijo.
-- El auto-save del Estudio ahora sube una miniatura ligera (≤400 px, WebP/JPEG)
-- al bucket público design-previews (path fijo "<designId>/draft-preview.<ext>",
-- upsert — sobreescribe la anterior, no acumula archivos) y guarda su URL aquí.
--
-- Columna separada de previewUrl a propósito: previewUrl es el snapshot FINAL
-- y hay invariantes "READY requiere previewUrl" (Mis diseños, /d/<token>,
-- vistas de pedido) que un preview de borrador no debe romper.
--
-- Nullable, aditiva y reversible (DROP COLUMN), sin backfill ni locks largos
-- (Postgres añade columnas nullable sin default como metadata-only). Escrita a
-- mano y aplicada con `migrate deploy` — `migrate dev` no funciona contra esta
-- DB (shadow DB en Supabase, convención del repo).

ALTER TABLE "Design" ADD COLUMN "draftPreviewUrl" TEXT;
