-- Auditoría del flujo de cupones (#4) — anclar maxUsesPerCustomer también al checkout de INVITADO.
-- CouponUsage guardaba solo customerId (null para invitados) → un cupón "1 por persona" era
-- farmeable sin límite comprando como invitado. Agregamos el email normalizado (lower+trim) del
-- pedido; priceCouponForCart cuenta usos previos por (customerId OR email). Best-effort: evadible
-- con correos distintos, pero cierra la evasión trivial (invitado sin identidad / logueado→invitado).
--
-- NO se hace backfill de fechas de cupón aquí: el fix de zona horaria (COT) vive en la capa de
-- ingesta (admin parsePayload) y se despliega junto con este cambio. No existen cupones reales de
-- admin en la base (pre-lanzamiento; los presentes son fixtures de test), así que ninguno quedó mal
-- almacenado que rescatar. Ver docs/DECISIONS.md (ADR del flujo de cupones).

-- AlterTable
ALTER TABLE "CouponUsage" ADD COLUMN "email" TEXT;

-- CreateIndex
CREATE INDEX "CouponUsage_couponId_email_idx" ON "CouponUsage"("couponId", "email");
