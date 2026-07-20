-- Auditoría 2026-07-17: versionar el agendamiento pg_cron de los jobs HTTP (/api/cron/*). Antes
-- vivían SOLO como comandos manuales en OPERATIONS.md → en un `supabase db reset`, un proyecto nuevo
-- o un DR desaparecían silenciosamente (el sitio sigue arriba pero se pierden alertas, resumen diario,
-- las palancas de ingreso y la purga de retención). Mandato #11: background jobs versionados.
--
-- SIN SECRETO EN EL SQL (mandato #12): el comando de cada job lee en RUNTIME la base URL y el
-- CRON_SECRET desde **Supabase Vault** (`vault.decrypted_secrets`), y manda el secreto por el header
-- `x-cron-secret` (no en la URL → no queda en logs de net). El texto del job solo contiene la BÚSQUEDA
-- en el vault, nunca el valor → seguro de commitear.
--
-- ACCIÓN HUMANA (Lucy, al configurar prod): crear los dos secretos en el Vault (una sola vez):
--   select vault.create_secret('https://lucamsshop.com', 'cron_base_url');
--   select vault.create_secret('<CRON_SECRET real>',    'cron_secret');
-- (ver docs/OPERATIONS.md). Sin ellos los jobs quedan agendados pero fallan en runtime hasta setearlos.
--
-- GUARDADO: si pg_cron o pg_net no están instalados (ej. el Postgres de CI, o un proyecto Supabase sin
-- las extensiones) el bloque se salta limpio con un NOTICE — no rompe la migración.
-- IDEMPOTENTE: re-agenda por nombre (unschedule-si-existe → schedule).

DO $$
DECLARE
  j record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omiten los jobs HTTP (habilitar pg_cron + pg_net en el dashboard de Supabase y re-aplicar).';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omiten los jobs HTTP (habilitar pg_net en el dashboard de Supabase y re-aplicar).';
    RETURN;
  END IF;

  FOR j IN
    SELECT * FROM (VALUES
      ('lucams-alerts',             '*/5 * * * *',  '/api/cron/alerts'),
      ('lucams-daily-summary',      '0 13 * * *',   '/api/cron/daily-summary'),
      ('lucams-review-request',     '0 17 * * *',   '/api/cron/review-request'),
      ('lucams-cart-recovery',      '0 * * * *',    '/api/cron/cart-recovery'),
      ('lucams-back-in-stock',      '*/30 * * * *', '/api/cron/back-in-stock'),
      ('lucams-purge-anon-designs', '0 8 * * *',    '/api/cron/purge-anon-designs')
    ) AS t(jobname, sched, path)
  LOOP
    PERFORM cron.unschedule(j.jobname) FROM cron.job WHERE jobname = j.jobname;
    PERFORM cron.schedule(
      j.jobname,
      j.sched,
      format(
        $cmd$SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || %L,
  headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
);$cmd$,
        j.path
      )
    );
  END LOOP;

  RAISE NOTICE 'pg_cron: 6 jobs HTTP agendados (leen base URL + secret del Vault). Recordar crear los secretos cron_base_url y cron_secret en Supabase Vault.';
END $$;
