-- Palanca de reseñas (auditoría 2026-07-13): timestamp del email de solicitud de reseña demorado.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reviewRequestedAt" TIMESTAMP(3);
