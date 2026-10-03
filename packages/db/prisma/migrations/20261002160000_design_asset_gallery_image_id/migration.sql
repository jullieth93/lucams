-- Dedupe de diseños prediseñados (2026-10-02) — "Mis fotos" duplicaba fotos.
--
-- `assignPredesignedToDesignAction` (apps/web/features/personalization/actions.ts)
-- creaba un DesignAsset NUEVO por cada aplicación de un diseño prediseñado: aplicar
-- el mismo diseño 3 veces dejaba 3 filas idénticas (y 3 miniaturas repetidas en el
-- Estudio). El dedupe en memoria del cliente (`predesignedAssetsByGalleryId`) muere
-- al recargar la página, así que la deduplicación tiene que vivir en DB.
--
-- `galleryImageId` marca el DesignGalleryImage de origen: la acción consulta
-- (designId, galleryImageId) antes de crear y reusa el asset existente (cara A y
-- cara B de separadores 2 caras). Nullable: las fotos subidas por el cliente
-- (uploadDesignAssetAction) no llevan marca y su flujo no cambia. Sin backfill — los
-- duplicados ya creados se limpian aparte; a partir de aquí no se generan nuevos.
--
-- Índice (designId, galleryImageId) para el lookup del dedupe (índice simple;
-- Prisma no expresa índices parciales en el schema — convención del repo).
-- Aditiva y reversible (DROP COLUMN + DROP INDEX), sin locks largos (columna
-- nullable sin default = metadata-only). Escrita a mano y aplicada con
-- `migrate deploy` — `migrate dev` no funciona contra esta DB (shadow DB en
-- Supabase, convención del repo).

ALTER TABLE "DesignAsset" ADD COLUMN "galleryImageId" TEXT;

CREATE INDEX "DesignAsset_designId_galleryImageId_idx" ON "DesignAsset"("designId", "galleryImageId");
