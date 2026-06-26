-- P0-020 (Lucy 2026-06-26) — Order.cartId para idempotency cart→order.
-- NO FK porque Cart se soft-deletea tras PAID y debemos preservar la referencia
-- aunque el Cart pase a estado deletedAt (auditoría + historical lookup).
-- Nullable: orders pre-existentes (LCM-2026-0001/0002) no tienen cartId.

ALTER TABLE "Order" ADD COLUMN "cartId" TEXT;
CREATE INDEX "Order_cartId_status_idx" ON "Order"("cartId", "status");
