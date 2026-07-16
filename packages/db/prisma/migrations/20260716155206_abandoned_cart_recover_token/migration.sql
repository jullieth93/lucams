-- Recuperación de carrito (auditoría 2026-07-13): token del link de recuperación (restaura la
-- sesión del carrito anónimo desde el email).
ALTER TABLE "AbandonedCart" ADD COLUMN IF NOT EXISTS "recoverToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "AbandonedCart_recoverToken_key" ON "AbandonedCart"("recoverToken");
