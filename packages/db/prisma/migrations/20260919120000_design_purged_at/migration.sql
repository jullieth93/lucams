-- Retención post-entrega de fotos del Estudio (feedback Lucy 2026-09-18; Ley 1581, art. 4 lit. f —
-- temporalidad/minimización). Plan Free de Supabase = 1 GB de Storage y un pedido puede dejar ~57 MB
-- entre fotos crudas (customer-uploads) y renders 300 DPI (production-assets): conservarlos para
-- siempre tras la entrega no tiene finalidad vigente.
--
--   `Design.purgedAt` marca que el cron `/api/cron/purge-delivered-designs` YA borró los bytes
--   pesados de un diseño USED_IN_ORDER cuya orden lleva ≥ 90 días DELIVERED (sin retracto ni
--   garantía abierta). Se conservan previewUrl, canvasData y la fila (historial del pedido);
--   el snapshot del OrderItem no se toca. La marca hace la purga idempotente: si el borrado de
--   bytes falla, purgedAt queda null y el próximo ciclo reintenta.
--
-- El índice (status, purgedAt) cubre la búsqueda de candidatos del cron
-- (status = USED_IN_ORDER AND purgedAt IS NULL).
--
-- Aditiva y reversible (DROP COLUMN / DROP INDEX), sin backfill ni locks largos (Postgres añade
-- columnas nullable sin default como metadata-only; el índice se crea CONCURRENTLY-free porque la
-- tabla es chica y migrate deploy corre en ventana controlada). Escrita a mano y aplicada con
-- `migrate deploy` — `migrate dev` no funciona contra esta DB (shadow DB en Supabase, convención
-- del repo).

ALTER TABLE "Design" ADD COLUMN "purgedAt" TIMESTAMP(3);

CREATE INDEX "Design_status_purgedAt_idx" ON "Design"("status", "purgedAt");
