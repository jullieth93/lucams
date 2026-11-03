-- Optimización y deduplicación de jobs pg_cron (2026-11-03):
--
-- 1. Retira `rate_limit_cleanup` (*/15 * * * *, migración 012): duplicaba a
--    `lucams-purge-rate-limits` (diario 05:29 UTC, migración 047 — LUC-SEC-010).
--    Al correr cada 15 min borrando >1 día, dejaba siempre en 0 a la función
--    oficial con latido (`purge_rate_limit_buckets()`, margen de 7 días y
--    telemetría en AlertState['cron:purge-rate-limits']).
--
-- 2. Idle-skip en SQL para las 2 colas de alta frecuencia (`lucams-process-render-jobs`
--    cada minuto = 1.440/día y `lucams-cms-publish-scheduled` cada 5 min = 288/día):
--    antes cada tick despertaba una Vercel Function solo para consultar una cola vacía
--    (~103.680 invocaciones HTTP/mes entre STG y PRD). Ahora el propio bloque PL/pgSQL
--    verifica por índice (<1 ms) si hay trabajo pendiente:
--      - Con trabajo pendiente → dispara el `net.http_get` habitual hacia Vercel
--        (el endpoint procesa y registra el latido real; si falla o da 401, no hay
--        latido y el dead-man switch alerta igual).
--      - Sin trabajo pendiente → actualiza `AlertState` localmente con detalle
--        `idle (...)` sin invocar Vercel ni abrir conexiones de pooler.
--      - Fail-closed: si faltan `cron_base_url` o `cron_secret` en Vault, sale sin
--        escribir latido falso (en STG/PRD el dead-man switch detecta la ausencia;
--        en stacks locales sin Vault evita errores NOT NULL en `net.http_request_queue`).
--
-- NO toca los 5 crons de email (`alerts`, `daily-summary`, `review-request`,
-- `cart-recovery`, `back-in-stock`), preservando su estado desagendado en STG.
-- GUARDADO (skip limpio sin pg_cron/pg_net, ej. Postgres pelado de CI) e IDEMPOTENTE.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite migración 048.';
    RETURN;
  END IF;

  -- 1. Des-agendar el duplicado legacy de la migración 012.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rate_limit_cleanup') THEN
    PERFORM cron.unschedule('rate_limit_cleanup');
    RAISE NOTICE 'pg_cron: rate_limit_cleanup des-agendado (queda lucams-purge-rate-limits de la 047).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite re-agendamiento HTTP con idle-skip (048).';
    RETURN;
  END IF;

  -- 2. Cola de renders 300 DPI (cada minuto): HTTP solo si hay PENDING o lease PROCESSING vencido (5 min).
  PERFORM cron.unschedule('lucams-process-render-jobs')
    FROM cron.job WHERE jobname = 'lucams-process-render-jobs';
  PERFORM cron.schedule(
    'lucams-process-render-jobs',
    '* * * * *',
    $cmd$DO $tick$
DECLARE
  v_base_url text;
  v_secret text;
  v_bypass jsonb;
BEGIN
  SELECT decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets WHERE name = 'cron_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  IF v_base_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."RenderJob"
    WHERE "status" = 'PENDING'
       OR ("status" = 'PROCESSING' AND "updatedAt" < now() - INTERVAL '5 minutes')
  ) THEN
    SELECT COALESCE(
      (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
       FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
      '{}'::jsonb
    ) INTO v_bypass;

    PERFORM net.http_get(
      url := v_base_url || '/api/cron/process-render-jobs',
      headers := jsonb_build_object('x-cron-secret', v_secret) || v_bypass
    );
  ELSE
    INSERT INTO public."AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
    VALUES ('cron:process-render-jobs', now(), 'idle (cola vacía)', now())
    ON CONFLICT ("key") DO UPDATE SET
      "lastSentAt" = EXCLUDED."lastSentAt",
      "lastDetail" = EXCLUDED."lastDetail",
      "updatedAt" = EXCLUDED."updatedAt";
  END IF;
END $tick$;$cmd$
  );

  -- 3. Publicación programada CMS (cada 5 min): HTTP solo si hay CmsFieldVersion vencida sin publicar.
  PERFORM cron.unschedule('lucams-cms-publish-scheduled')
    FROM cron.job WHERE jobname = 'lucams-cms-publish-scheduled';
  PERFORM cron.schedule(
    'lucams-cms-publish-scheduled',
    '*/5 * * * *',
    $cmd$DO $tick$
DECLARE
  v_base_url text;
  v_secret text;
  v_bypass jsonb;
BEGIN
  SELECT decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets WHERE name = 'cron_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  IF v_base_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."CmsFieldVersion" v
    JOIN public."CmsField" f ON f."id" = v."fieldId"
    WHERE v."publishAt" <= now()
      AND v."publishedAt" IS NULL
      AND f."deletedAt" IS NULL
  ) THEN
    SELECT COALESCE(
      (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
       FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
      '{}'::jsonb
    ) INTO v_bypass;

    PERFORM net.http_get(
      url := v_base_url || '/api/cron/cms-publish-scheduled',
      headers := jsonb_build_object('x-cron-secret', v_secret) || v_bypass
    );
  ELSE
    INSERT INTO public."AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
    VALUES ('cron:cms-publish-scheduled', now(), 'idle (sin versiones vencidas)', now())
    ON CONFLICT ("key") DO UPDATE SET
      "lastSentAt" = EXCLUDED."lastSentAt",
      "lastDetail" = EXCLUDED."lastDetail",
      "updatedAt" = EXCLUDED."updatedAt";
  END IF;
END $tick$;$cmd$
  );

  RAISE NOTICE 'pg_cron: migración 048 aplicada (rate_limit_cleanup retirado + idle-skip en process-render-jobs y cms-publish-scheduled).';
END $$;

