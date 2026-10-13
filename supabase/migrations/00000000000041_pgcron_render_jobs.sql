-- ADR-131 (2026-10-13) — agenda el job HTTP `lucams-process-render-jobs` →
-- `/api/cron/process-render-jobs`: el worker que procesa la cola de renders de producción
-- 300 DPI (tabla RenderJob, migración prisma 20261013120000). Saca el render del request
-- síncrono de "Agregar al carrito": un set de calendario ×3 = 36 páginas mataban la Server
-- Action (maxDuration=60 → 500/504, incidente STG 2026-10).
--
-- CADA MINUTO: el render corre en background y el cliente puede pagar apenas el finalize
-- responde; la ventana de "archivos en preparación" la absorbe el SLA de producción. El job
-- es barato cuando no hay trabajo (un SELECT sobre RenderJob indexado por status).
--
-- Mismo patrón que 015/016/021/023/032/035: SIN secreto en el SQL (lee `cron_base_url` y
-- `cron_secret` del Vault en runtime y manda el secreto por header `x-cron-secret`), header
-- `x-vercel-protection-bypass` SOLO si existe el secreto `cron_vercel_bypass` (previews STG),
-- GUARDADO si pg_cron/pg_net no están instalados (skip limpio con NOTICE) e IDEMPOTENTE
-- (unschedule-si-existe → schedule).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite lucams-process-render-jobs (habilitar pg_cron + pg_net en el dashboard de Supabase y re-aplicar).';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite lucams-process-render-jobs (habilitar pg_net en el dashboard de Supabase y re-aplicar).';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-process-render-jobs') FROM cron.job WHERE jobname = 'lucams-process-render-jobs';
  PERFORM cron.schedule(
    'lucams-process-render-jobs',
    '* * * * *',
    $cmd$SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || '/api/cron/process-render-jobs',
  headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
    -- Bypass de Vercel Authentication (previews STG): se agrega SOLO si el secreto existe.
    || COALESCE(
         (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
          FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
         '{}'::jsonb)
);$cmd$
  );

  RAISE NOTICE 'pg_cron: lucams-process-render-jobs agendado (* * * * *). Requiere los secretos cron_base_url y cron_secret en el Vault (los mismos de los jobs de 015).';
END $$;

-- Siembra del latido inicial (convención F-04, migraciones 037/039): todo job de CRON_JOBS
-- nace con su fila `cron:<job>` en AlertState para que el dead-man switch lo detecte si NUNCA
-- corre (a los 2× intervalo = 2 min acá) sin que el health dé 503 en falso mientras tanto.
INSERT INTO public."AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
VALUES
  ('cron:process-render-jobs', now(), 'latido sembrado al agendar (migración 041) — aún sin ejecución real', now())
ON CONFLICT ("key") DO NOTHING;
