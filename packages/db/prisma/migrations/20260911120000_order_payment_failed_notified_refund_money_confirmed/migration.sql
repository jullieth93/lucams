-- Remediación N-22a + N-17 (2026-09-11): columnas ADITIVAS y NULLABLE del modelo Order.
--
--   N-22a — anti-spam del email "tu pago no fue aprobado" (webhook Wompi
--   DECLINED/ERROR con la orden aún PENDING_PAYMENT y reintentable):
--   `paymentFailedNotifiedAt` guarda el timestamp del último aviso al cliente
--   (null = nunca avisado). El sender hace un claim atómico (updateMany gateado
--   por cooldown) antes de enviar → máx. 1 email por orden cada N horas.
--
--   N-17 — confirmación obligatoria del dinero en el reembolso: el movimiento
--   en Wompi es manual; el admin debe confirmar (checkbox bloqueante) que YA lo
--   devolvió antes de marcar REFUNDED y de enviar el email refund-issued.
--   `refundMoneyConfirmedAt` / `refundMoneyConfirmedBy` (AdminUser.id) son la
--   evidencia persistida de quién confirmó y cuándo.
--
-- Aditiva y reversible (DROP COLUMN), sin backfill ni locks largos (Postgres
-- añade columnas nullable sin default como metadata-only). Escrita a mano y
-- aplicada con `migrate deploy` — `migrate dev` no funciona contra esta DB
-- (shadow DB sin pg_trgm, issue histórico documentado en docs/CMS_ROADMAP.md).

ALTER TABLE "Order" ADD COLUMN "paymentFailedNotifiedAt" TIMESTAMP(3),
                  ADD COLUMN "refundMoneyConfirmedAt" TIMESTAMP(3),
                  ADD COLUMN "refundMoneyConfirmedBy" TEXT;
