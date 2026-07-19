-- Auditoría v3 · #10 — agendar el cron de purga de logs con PII (EmailEvent + WebhookEvent > 180d,
-- Ley 1581 minimización/retención). Mismo patrón que la migración 015: lee base URL + CRON_SECRET del
-- Vault en runtime (mandato #12, sin secreto en el SQL), header x-cron-secret (no en la URL). Corre
-- diario a las 3am. Guardado si pg_cron/pg_net no están; idempotente (unschedule → schedule).
--
-- ACCIÓN HUMANA (Lucy, al desplegar): verificar en Supabase que el job 'lucams-purge-event-logs'
-- quedó agendado (SELECT * FROM cron.job WHERE jobname = 'lucams-purge-event-logs';). Reusa los
-- secretos cron_base_url y cron_secret ya creados para la migración 015.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite el job purge-event-logs.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite el job purge-event-logs.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-purge-event-logs') FROM cron.job WHERE jobname = 'lucams-purge-event-logs';
  PERFORM cron.schedule(
    'lucams-purge-event-logs',
    '0 3 * * *',
    $cmd$SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || '/api/cron/purge-event-logs',
  headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
);$cmd$
  );

  RAISE NOTICE 'pg_cron: job lucams-purge-event-logs agendado (diario 3am, lee base URL + secret del Vault).';
END $$;
