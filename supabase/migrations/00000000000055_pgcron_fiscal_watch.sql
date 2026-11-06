-- ADR-196 — job pg_cron que cada día a las 12:05 UTC (07:05 COT, antes del
-- resumen matutino de las 08:00) llama GET /api/cron/fiscal-watch: vigilancia
-- fiscal proactiva de los umbrales DIAN (tope de facturación electrónica
-- 3 500 UVT — art. 618-1 ET — y condición de IVA por ventas con tarjeta —
-- art. 437 par. 3 ET), con proyección de cierre de año y alertas 70/90/100 %
-- en /admin/notificaciones + email al owner en 90 %/100 %.
--
-- Mismo patrón que las migraciones 015/016/021/023/032/044: lee base URL +
-- CRON_SECRET del Vault en runtime (sin secreto en el SQL), header x-cron-secret
-- (no en la URL), bypass de Vercel Authentication SOLO si existe el secreto
-- cron_vercel_bypass (previews STG; en PRD no existe).
--
-- SEGURA DE APLICAR EN STG: agenda ÚNICAMENTE el job nuevo
-- 'lucams-fiscal-watch'; NO re-agenda ni toca ninguno de los jobs existentes.
-- El endpoint es de solo lectura + notificaciones idempotentes (dedupKey por
-- regla-año), así que correrlo en STG no altera la operación.
--
-- ACCIÓN HUMANA (Lucy, al desplegar): verificar en Supabase que el job quedó
-- agendado (SELECT * FROM cron.job WHERE jobname = 'lucams-fiscal-watch';).
-- Reusa los secretos cron_base_url y cron_secret ya creados para la 015.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite el job fiscal-watch.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite el job fiscal-watch.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-fiscal-watch') FROM cron.job WHERE jobname = 'lucams-fiscal-watch';
  PERFORM cron.schedule(
    'lucams-fiscal-watch',
    '5 12 * * *',
    $cmd$SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || '/api/cron/fiscal-watch',
  headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
    -- Bypass de Vercel Authentication (previews STG): se agrega SOLO si el secreto existe.
    || COALESCE(
         (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
          FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
         '{}'::jsonb)
);$cmd$
  );

  RAISE NOTICE 'pg_cron: job lucams-fiscal-watch agendado (diario 12:05 UTC = 07:05 COT; lee base URL + secret del Vault). Sin tocar los demás jobs.';
END $$;

-- Convención F-04 (migración 037): siembra del latido inicial de `fiscal-watch`
-- para que el dead-man switch lo detecte si NUNCA corre (a los 2× intervalo =
-- 48 h) sin falsos 503 del health mientras tanto. Lo gatea el test
-- "siembra de latido inicial" de cron-heartbeat.test.ts.
INSERT INTO public."AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
VALUES
  ('cron:fiscal-watch', now(), 'latido sembrado al agendar (migración 055) — aún sin ejecución real', now())
ON CONFLICT ("key") DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."AlertState" WHERE "key" = 'cron:fiscal-watch') THEN
    RAISE EXCEPTION 'Falta el latido sembrado de cron:fiscal-watch en AlertState';
  END IF;
  RAISE NOTICE 'OK: cron:fiscal-watch tiene latido en AlertState (sembrado o real).';
END $$;
