-- F-04 (auditoría 2026-09-19) — siembra del latido inicial de los crons HTTP.
--
-- Problema: `getCronHealth` marcaba `overdue` a cualquier cron sin latido, así
-- que un cron RECIÉN agendado dejaba /api/health/crons en 503 y disparaba la
-- alerta `cron_stale_*` en falso hasta su primera corrida (hasta 24h en crons
-- diarios — pasó en PRD con `lucams-purge-delivered-designs`, migración 035).
--
-- Fix en dos piezas:
--   1. Código (cron-heartbeat.ts): un job sin latido queda `pending` (visible,
--      NO overdue) — un cron nuevo jamás degrada el health.
--   2. Esta siembra: inserta el latido inicial de cada job con
--      `ON CONFLICT DO NOTHING` (no pisa latidos reales). Si el cron nuevo
--      NUNCA corre, el latido sembrado se vence a los 2× intervalo y el
--      dead-man switch alerta como siempre — la detección no se pierde.
--
-- CONVENCIÓN a partir de hoy (la hace cumplir el test "siembra de latido
-- inicial" en cron-heartbeat.test.ts): TODA migración que agende un job nuevo
-- en pg_cron debe sembrar su `cron:<job>` acá mismo, en la misma migración.
--
-- lastDetail documenta que el latido es sembrado (no una ejecución real), para
-- que el detalle de la alerta cron_stale_* no mienta sobre la "última corrida".

INSERT INTO public."AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
VALUES
  ('cron:alerts',                  now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:daily-summary',           now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:review-request',          now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:cart-recovery',           now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:back-in-stock',           now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:purge-anon-designs',      now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:purge-delivered-designs', now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:purge-event-logs',        now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:cms-publish-scheduled',   now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now()),
  ('cron:expire-pending-orders',   now(), 'latido sembrado al agendar (F-04, migración 037) — aún sin ejecución real', now())
ON CONFLICT ("key") DO NOTHING;

-- Verificación inline: tras la siembra, todo cron versionado tiene su fila.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM (VALUES
    ('cron:alerts'), ('cron:daily-summary'), ('cron:review-request'),
    ('cron:cart-recovery'), ('cron:back-in-stock'), ('cron:purge-anon-designs'),
    ('cron:purge-delivered-designs'), ('cron:purge-event-logs'),
    ('cron:cms-publish-scheduled'), ('cron:expire-pending-orders')
  ) AS esperados(k)
  WHERE NOT EXISTS (SELECT 1 FROM public."AlertState" a WHERE a."key" = esperados.k);
  IF n > 0 THEN
    RAISE EXCEPTION 'Faltan % latidos sembrados de crons en AlertState', n;
  END IF;
  RAISE NOTICE 'OK: los 10 crons versionados tienen latido en AlertState (sembrado o real).';
END $$;
