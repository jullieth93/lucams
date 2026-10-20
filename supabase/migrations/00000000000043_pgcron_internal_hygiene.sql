-- Auditoría integral 2026-10-20 — higiene de las tablas INTERNAS de pg_cron/pg_net, que crecen
-- sin límite y ya son el consumidor #1 de la base (PRD: cron.job_run_details 93 MB + net
-- ._http_response 120 MB de 245 MB totales; el schema public de negocio son solo 16 MB).
--
--   * cron.job_run_details: historial de corridas de pg_cron. pg_cron NO lo purga solo
--     (documentado: hay que agendar su limpieza). Se conservan 14 días — suficiente para
--     diagnosticar jobs fallidos (docs/OBSERVABILITY.md lo usa solo como consulta manual
--     reciente; el dead-man switch usa AlertState, no esta tabla).
--   * net._http_response: respuestas de los net.http_get de los crons. La app nunca las lee
--     (fire-and-forget); la ÚNICA lectora es monitor_uptime_prd() de STG, que consume la
--     respuesta del lote ANTERIOR (~10 min después — scripts/monitor-uptime-stg.sql).
--     24 h de retención cubre ese consumo con holgura.
--
-- Ambos deletes son idempotentes y baratos; corren a diario vía pg_cron (mandato #11) sin
-- secretos ni HTTP. Guardado si pg_cron/pg_net no están; idempotente (unschedule → schedule).
--
-- ACCIÓN HUMANA (Lucy, al desplegar): verificar en Supabase que quedaron agendados
--   SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'lucams-internal-%';
-- La reclamación del bloat HISTÓRICO (VACUUM FULL de ambas tablas) es una operación one-shot
-- manual, no va en la migración: VACUUM FULL no corre dentro de una transacción.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omiten los jobs de higiene interna.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-internal-cron-history-purge')
    FROM cron.job WHERE jobname = 'lucams-internal-cron-history-purge';
  PERFORM cron.schedule(
    'lucams-internal-cron-history-purge',
    '17 4 * * *',
    $cmd$DELETE FROM cron.job_run_details WHERE end_time < now() - INTERVAL '14 days';$cmd$
  );

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('lucams-internal-net-response-purge')
      FROM cron.job WHERE jobname = 'lucams-internal-net-response-purge';
    PERFORM cron.schedule(
      'lucams-internal-net-response-purge',
      '43 4 * * *',
      $cmd$DELETE FROM net._http_response WHERE created < now() - INTERVAL '1 day';$cmd$
    );
  ELSE
    RAISE NOTICE 'pg_net no instalado — se omite lucams-internal-net-response-purge.';
  END IF;

  RAISE NOTICE 'pg_cron: jobs de higiene interna agendados (cron history 14d, net responses 24h).';
END $$;
