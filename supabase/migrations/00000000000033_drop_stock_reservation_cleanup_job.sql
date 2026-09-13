-- N-10a (2026-09-12): des-agenda el job pg_cron `stock_reservation_cleanup`.
--
-- El job borraba reservas expiradas de public."StockReservation" cada minuto
-- (agendado en la migración 00000000000012_pgcron_cleanup_jobs). La tabla se
-- ELIMINA en la migración Prisma
-- 20260912120000_drop_site_event_recommendation_log_stock_reservation: el modelo
-- nunca tuvo consumidores productivos (la protección contra oversold es el
-- UPDATE atómico + needsReconciliation, ver apps/web/features/orders/stock.ts).
-- Sin la tabla, cada corrida del job fallaría para siempre (ruido y falsas
-- alarmas en cron.job_run_details) — por eso se retira el agendamiento.
--
-- GUARDADO: si pg_cron no está instalado (ej. el Postgres de CI) el bloque se
-- salta limpio con un NOTICE — no rompe la migración (mismo patrón que la 012).
-- IDEMPOTENTE: solo des-agenda si el job existe; re-aplicar es no-op.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — nada que des-agendar (stock_reservation_cleanup).';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stock_reservation_cleanup') THEN
    PERFORM cron.unschedule('stock_reservation_cleanup');
    RAISE NOTICE 'pg_cron: job stock_reservation_cleanup des-agendado (la tabla StockReservation ya no existe).';
  ELSE
    RAISE NOTICE 'pg_cron: stock_reservation_cleanup no estaba agendado — nada que hacer.';
  END IF;
END $$;
