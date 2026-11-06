DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite lucams-lifecycle.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite lucams-lifecycle.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-lifecycle') FROM cron.job WHERE jobname = 'lucams-lifecycle';
  PERFORM cron.schedule(
    'lucams-lifecycle',
    '*/15 * * * *',
    $cmd$SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || '/api/cron/lifecycle',
      headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
        || COALESCE(
          (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
           FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
          '{}'::jsonb)
    );$cmd$
  );

  RAISE NOTICE 'pg_cron: job lucams-lifecycle agendado cada 15 minutos.';
END $$;

INSERT INTO public."AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
VALUES
  ('cron:lifecycle', now(), 'latido sembrado al agendar (migración 058) — aún sin ejecución real', now())
ON CONFLICT ("key") DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."AlertState" WHERE "key" = 'cron:lifecycle') THEN
    RAISE EXCEPTION 'Falta el latido sembrado de cron:lifecycle en AlertState';
  END IF;
  RAISE NOTICE 'OK: cron:lifecycle tiene latido en AlertState (sembrado o real).';
END $$;
