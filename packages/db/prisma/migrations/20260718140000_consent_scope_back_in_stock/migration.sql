-- Auditoría v3 · #9 — nuevo valor de enum para registrar el consentimiento del "Avísame cuando vuelva"
-- (Ley 1581). Notificación transaccional pedida por el titular; se registra un Consent scope
-- BACK_IN_STOCK al suscribirse.
ALTER TYPE "ConsentScope" ADD VALUE 'BACK_IN_STOCK';
