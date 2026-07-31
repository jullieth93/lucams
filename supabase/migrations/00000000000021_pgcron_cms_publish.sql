-- Roadmap C3 — publicación programada del CMS: job pg_cron que cada 5 minutos
-- llama GET /api/cron/cms-publish-scheduled (publica las CmsFieldVersion con
-- publishAt <= now()). Mismo patrón que la migración 015/016: lee base URL +
-- CRON_SECRET del Vault en runtime (mandato #12, sin secreto en el SQL),
-- header x-cron-secret (no en la URL). Guardado si pg_cron/pg_net no están;
-- idempotente (unschedule → schedule).
--
-- ACCIÓN HUMANA (Lucy, al desplegar): verificar en Supabase que el job
-- 'lucams-cms-publish-scheduled' quedó agendado
-- (SELECT * FROM cron.job WHERE jobname = 'lucams-cms-publish-scheduled';).
-- Reusa los secretos cron_base_url y cron_secret ya creados para la 015.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite el job cms-publish-scheduled.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite el job cms-publish-scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-cms-publish-scheduled') FROM cron.job WHERE jobname = 'lucams-cms-publish-scheduled';
  PERFORM cron.schedule(
    'lucams-cms-publish-scheduled',
    '*/5 * * * *',
    $cmd$SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || '/api/cron/cms-publish-scheduled',
  headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
);$cmd$
  );

  RAISE NOTICE 'pg_cron: job lucams-cms-publish-scheduled agendado (cada 5 min, lee base URL + secret del Vault).';
END $$;
