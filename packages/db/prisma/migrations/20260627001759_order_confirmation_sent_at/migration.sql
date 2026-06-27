-- #2 (post-launch Bloque A 2026-06-26) — email de confirmación idempotente
-- y recuperable. Si la saga crashea entre el commit de PAID y el envío del
-- email, un reintento de processPaidOrder lo manda (confirmationSentAt null)
-- sin duplicar (se setea al enviar).
ALTER TABLE "Order" ADD COLUMN "confirmationSentAt" TIMESTAMP(3);
