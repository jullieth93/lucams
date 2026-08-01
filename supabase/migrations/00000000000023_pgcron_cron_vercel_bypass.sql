-- Auditoría pre-producción 2026-08-01: los jobs HTTP de pg_cron en STG devolvían 200 con la página
-- de LOGIN de Vercel (SSO de Deployment Protection en los previews) en vez de ejecutar el endpoint —
-- los 7 crons lucams-* estaban "corriendo" pero sin efecto (health/crons reportaba lastRunAt null).
--
-- Fix: re-agenda los 8 jobs HTTP añadiendo el header `x-vercel-protection-bypass` SOLO si existe el
-- secreto `cron_vercel_bypass` en el Vault (ambientes detrás de Vercel Authentication = previews STG).
-- En PRD (dominio público, sin Deployment Protection) el secreto NO se crea → headers idénticos a
-- antes (solo x-cron-secret) → comportamiento sin cambios.
--
-- ACCIÓN HUMANA por ambiente detrás de SSO (STG): crear el secreto UNA vez con el "protection bypass
-- for automation" del proyecto Vercel (Settings → Deployment Protection, o PATCH
-- /v1/projects/{id}/protection-bypass — el valor vive también en .env.stg como VERCEL_BYPASS_TOKEN):
--   select vault.create_secret('<bypass>', 'cron_vercel_bypass');
--
-- GUARDADO (pg_cron/pg_net ausentes → skip limpio) e IDEMPOTENTE (unschedule → schedule), mismo
-- patrón que 015/016/021. SIN secreto en el SQL (solo búsquedas en vault).
--
-- Re-agenda los 8 jobs HTTP: los 6 de 015 + purge-event-logs (016) + cms-publish-scheduled (021).
-- Los 2 jobs SQL puros (rate_limit_cleanup, stock_reservation_cleanup — 012) no se tocan.

DO $$
DECLARE
  j record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite el re-agendamiento con bypass (habilitar pg_cron + pg_net y re-aplicar).';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite el re-agendamiento con bypass (habilitar pg_cron + pg_net y re-aplicar).';
    RETURN;
  END IF;

  FOR j IN
    SELECT * FROM (VALUES
      ('lucams-alerts',               '*/5 * * * *',  '/api/cron/alerts'),
      ('lucams-daily-summary',        '0 13 * * *',   '/api/cron/daily-summary'),
      ('lucams-review-request',       '0 17 * * *',   '/api/cron/review-request'),
      ('lucams-cart-recovery',        '0 * * * *',    '/api/cron/cart-recovery'),
      ('lucams-back-in-stock',        '*/30 * * * *', '/api/cron/back-in-stock'),
      ('lucams-purge-anon-designs',   '0 8 * * *',    '/api/cron/purge-anon-designs'),
      ('lucams-purge-event-logs',     '0 3 * * *',    '/api/cron/purge-event-logs'),
      ('lucams-cms-publish-scheduled','*/5 * * * *',  '/api/cron/cms-publish-scheduled')
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
    -- Bypass de Vercel Authentication (previews STG): se agrega SOLO si el secreto existe.
    || COALESCE(
         (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
          FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
         '{}'::jsonb)
);$cmd$,
        j.path
      )
    );
  END LOOP;

  RAISE NOTICE 'pg_cron: 8 jobs HTTP re-agendados con bypass opcional de Vercel (secreto cron_vercel_bypass en Vault, solo ambientes con SSO).';
END $$;
