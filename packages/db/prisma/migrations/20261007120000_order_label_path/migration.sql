-- Fix 1.8 (2026-10-07) — copia propia de la etiqueta de envío en Storage.
--
-- Las URLs de guía/etiqueta que devuelve Aveonline (labelUrl/trackingUrl) son
-- hosteadas por ellos: pueden expirar, requerir sesión o responder no-PDF según
-- transportadora (reportado en STG: servientrega OK intermitente, tcc-sa sin URL).
-- Esta columna guarda el path de la copia archivada server-side en el bucket
-- PRIVADO production-assets ("shipping-labels/<orderId>.pdf"), que el admin
-- descarga via signed URL. Null = no se pudo archivar (fallback: URLs externas).
--
-- Nullable: órdenes anteriores a esta ola quedan en null. Aditiva y reversible
-- (DROP COLUMN), sin backfill ni locks largos (Postgres añade columnas nullable
-- sin default como metadata-only). Escrita a mano y aplicada con
-- `migrate deploy` — `migrate dev` no funciona contra esta DB (shadow DB en
-- Supabase, convención del repo).

ALTER TABLE "Order" ADD COLUMN "labelPath" TEXT;
