-- Auditoría 2026-07-13: versionar el agendamiento pg_cron de los jobs de LIMPIEZA internos
-- (solo SQL, sin secret ni URL → seguros de commitear). Antes vivían solo como comandos
-- manuales en OPERATIONS.md.
--
-- GUARDADO: si pg_cron no está instalado (ej. el Postgres de CI, o un proyecto Supabase donde
-- aún no se habilitó la extensión) el bloque se salta limpio con un NOTICE — no rompe la
-- migración. PL/pgSQL resuelve las referencias a cron.* en runtime, así que en CI (sin la
-- extensión) nunca se tocan.
--
-- IDEMPOTENTE: re-agenda por nombre (unschedule-si-existe → schedule).
--
-- Los jobs que llaman por HTTP (alertas, resumen diario) NO se versionan aquí: necesitan el
-- CRON_SECRET real y la URL de prod → siguen como ACCIÓN HUMANA documentada en OPERATIONS.md.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite el agendamiento de limpieza (habilitar la extensión en el dashboard de Supabase y re-aplicar esta migración).';
    RETURN;
  END IF;

  -- rate_limit_buckets: borra buckets muy pasados de su ventana (housekeeping). Cada 15 min.
  PERFORM cron.unschedule('rate_limit_cleanup') FROM cron.job WHERE jobname = 'rate_limit_cleanup';
  PERFORM cron.schedule(
    'rate_limit_cleanup',
    '*/15 * * * *',
    $job$ DELETE FROM public.rate_limit_buckets WHERE window_start < NOW() - INTERVAL '1 day'; $job$
  );

  -- StockReservation expiradas: libera la reserva de stock de carritos que no pagaron. Cada minuto.
  PERFORM cron.unschedule('stock_reservation_cleanup') FROM cron.job WHERE jobname = 'stock_reservation_cleanup';
  PERFORM cron.schedule(
    'stock_reservation_cleanup',
    '* * * * *',
    $job$ DELETE FROM public."StockReservation" WHERE "expiresAt" < NOW(); $job$
  );

  RAISE NOTICE 'pg_cron: jobs de limpieza agendados (rate_limit_cleanup */15min, stock_reservation_cleanup */1min).';
END $$;
