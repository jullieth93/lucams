-- Referidos v2 (2026-10-05) — Coupon.customerId: dueño de un cupón PERSONAL
-- (bienvenida del referido al registrarse, premio del referente tras la
-- primera compra). Alimenta la sección "Mis cupones" de /mi-cuenta.
-- Null = cupón general (público o de campaña), comportamiento de siempre.

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE INDEX "Coupon_customerId_idx" ON "Coupon"("customerId");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: los cupones de referidos v1 (createdBy='referrals-v1') ligaban al
-- cliente solo por TEXTO en description ("Referidos: regalo para <email> (...").
-- El prefijo es fijo y lo emite una sola ruta de código (features/referrals/
-- service.ts), así que el match por email exacto es seguro: starts_with evita
-- comodines LIKE. Los que no hagan match (email cambiado/borrado) quedan con
-- customerId NULL y se siguen entregando solo por email, como hasta hoy.
UPDATE "Coupon" c
SET "customerId" = cu.id
FROM "Customer" cu
WHERE c."createdBy" = 'referrals-v1'
  AND c."customerId" IS NULL
  AND c."deletedAt" IS NULL
  AND starts_with(c."description", 'Referidos: regalo para ' || cu.email || ' (');
