-- Revalidación integraciones 2026-10-20 (brecha Aveonline #1) — job pg_cron que
-- cada 15 min llama GET /api/cron/tracking-sync: polling de respaldo del estado
-- de guías activas (FULFILLING/SHIPPED) vía obtenerEstadoAuth, alimentando el
-- mismo pipeline del webhook AveCRM. Si el webhook no llega o se pierde, las
-- órdenes igual convergen a SHIPPED/DELIVERED (email de entrega + deliveredAt,
-- ancla del retracto Ley 1480). Caso origen: LCM-2026-0001 quedó FULFILLING con
-- la guía EN REPARTO porque el evento del carrier llegó sin ceros a la izquierda
-- y no matcheó; el polling hubiera sanado la orden aunque el match fallara.
--
-- Mismo patrón que las migraciones 015/016/021/023/032: lee base URL +
-- CRON_SECRET del Vault en runtime (sin secreto en el SQL), header x-cron-secret
-- (no en la URL), bypass de Vercel Authentication SOLO si existe el secreto
-- cron_vercel_bypass (previews STG; en PRD no existe).
--
-- Minutos 4/19/34/49 (no los marcas 0/15/30/45): esparce la carga — alerts corre
-- cada 5 min, back-in-stock cada 30, cart-recovery al minuto 0.
--
-- SEGURA DE APLICAR EN STG: agenda ÚNICAMENTE el job nuevo
-- 'lucams-tracking-sync'; NO re-agenda ni toca ninguno de los jobs existentes.
-- El endpoint es aditivo e idempotente (en modo catálogo o sin credenciales
-- Aveonline responde ok con skippedReason y no llama al proveedor).
--
-- ACCIÓN HUMANA (Lucy, al desplegar): verificar en Supabase que el job quedó
-- agendado (SELECT * FROM cron.job WHERE jobname = 'lucams-tracking-sync';).
-- Reusa los secretos cron_base_url y cron_secret ya creados para la 015.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite el job tracking-sync.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite el job tracking-sync.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-tracking-sync') FROM cron.job WHERE jobname = 'lucams-tracking-sync';
  PERFORM cron.schedule(
    'lucams-tracking-sync',
    '4,19,34,49 * * * *',
    $cmd$SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || '/api/cron/tracking-sync',
  headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
    -- Bypass de Vercel Authentication (previews STG): se agrega SOLO si el secreto existe.
    || COALESCE(
         (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
          FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
         '{}'::jsonb)
);$cmd$
  );

  RAISE NOTICE 'pg_cron: job lucams-tracking-sync agendado (cada 15 min, minutos 4/19/34/49; lee base URL + secret del Vault). Sin tocar los demás jobs.';
END $$;

-- Convención F-04 (migración 037): siembra del latido inicial de `tracking-sync`
-- para que el dead-man switch lo detecte si NUNCA corre (a los 2× intervalo =
-- 30 min) sin falsos 503 del health mientras tanto.
INSERT INTO public."AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
VALUES
  ('cron:tracking-sync', now(), 'latido sembrado al agendar (migración 044) — aún sin ejecución real', now())
ON CONFLICT ("key") DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."AlertState" WHERE "key" = 'cron:tracking-sync') THEN
    RAISE EXCEPTION 'Falta el latido sembrado de cron:tracking-sync en AlertState';
  END IF;
  RAISE NOTICE 'OK: cron:tracking-sync tiene latido en AlertState (sembrado o real).';
END $$;
