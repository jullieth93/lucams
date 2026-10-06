-- Cierre manual de reconciliación (2026-10-05) — acción admin "Marcar como
-- gestionado" en /admin/pedidos/[number].
--
-- Hoy needsReconciliation solo lo apagan flujos automáticos (cod-reconciliation,
-- cancelaciones COD) y no hay forma humana de cerrar un caso gestionado por
-- fuera del sistema (ej. refund emitido a mano en Wompi). Estas columnas
-- persisten la resolución: nota OBLIGATORIA de qué se hizo + quién y cuándo.
-- Order.notes NO se reusó: es la nota de entrega del cliente (checkout).
--
-- Nullable: órdenes sin reconciliación gestionada quedan en null. Aditiva y
-- reversible (DROP COLUMN), sin backfill ni locks largos (Postgres añade
-- columnas nullable sin default como metadata-only). Escrita a mano y aplicada
-- con `migrate deploy` — `migrate dev` no funciona contra esta DB (shadow DB
-- en Supabase, convención del repo).

ALTER TABLE "Order" ADD COLUMN "reconciliationNote" TEXT;
ALTER TABLE "Order" ADD COLUMN "reconciledAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "reconciledBy" TEXT;
