-- Fase 4 (2026-10-13) — módulo admin de carritos abandonados configurable
-- (/admin/carritos). AbandonedCart.reminderCount soporta el setting
-- CART_RECOVERY_MAX_REMINDERS > 1: antes el gate de "un solo recordatorio"
-- era lastReminderSentAt NOT NULL; con N recordatorios hace falta el conteo.
--
--   - Backfill: las filas YA recordadas (lastReminderSentAt NOT NULL) quedan
--     con reminderCount = 1 → el default CART_RECOVERY_MAX_REMINDERS = 1 les
--     mantiene el comportamiento histórico (no se les reenvía).
--   - CHECK >= 0 siguiendo la convención F-24 (20260904144657): NOT VALID +
--     VALIDATE back to back (sin table scan bloqueante; enforced para
--     escrituras nuevas desde el ADD).
--
-- Aditiva y reversible (DROP COLUMN / DROP CONSTRAINT). Escrita a mano y
-- aplicada con `migrate deploy` — `migrate dev` no funciona contra esta DB
-- (shadow DB en Supabase, convención del repo).

ALTER TABLE "AbandonedCart" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "AbandonedCart" SET "reminderCount" = 1 WHERE "lastReminderSentAt" IS NOT NULL;

ALTER TABLE "AbandonedCart" ADD CONSTRAINT "AbandonedCart_reminderCount_nonnegative_check" CHECK ("reminderCount" >= 0) NOT VALID;
ALTER TABLE "AbandonedCart" VALIDATE CONSTRAINT "AbandonedCart_reminderCount_nonnegative_check";
