-- Campos LISTA (CMS v2, roadmap B4): CmsListItem guarda las filas editables
-- de un CmsField con `metadata.listSchema` (ej. footer.legal.links). Los items
-- son la representación de EDICIÓN; al guardar, el service serializa el array
-- a JSON y ese JSON es el body/versión del CmsField (lectura pública intacta).
-- Escrita a mano (migrate dev no puede levantar shadow DB en Supabase por la
-- extensión pg_trgm de una migración vieja). Aplicar con `make migrate`.

-- CreateTable
CREATE TABLE "CmsListItem" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CmsListItem_fieldId_position_idx" ON "CmsListItem"("fieldId", "position");

-- AddForeignKey
ALTER TABLE "CmsListItem" ADD CONSTRAINT "CmsListItem_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CmsField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
