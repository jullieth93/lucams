-- N-12 — Expiración de pedidos WOMPI sin pagar: job pg_cron que cada hora llama
-- GET /api/cron/expire-pending-orders (cancela las órdenes paymentMethod=WOMPI en
-- PENDING_PAYMENT más viejas que PENDING_PAYMENT_EXPIRY_HOURS = 24, ver
-- apps/web/features/orders/constants.ts). Mismo patrón que las migraciones
-- 015/016/021/023: lee base URL + CRON_SECRET del Vault en runtime (sin secreto en
-- el SQL), header x-cron-secret (no en la URL), bypass de Vercel Authentication
-- SOLO si existe el secreto cron_vercel_bypass (ambientes detrás de SSO = previews
-- STG; en PRD no existe → headers idénticos a los demás crons).
--
-- SEGURA DE APLICAR EN STG: agenda ÚNICAMENTE el job nuevo
-- 'lucams-expire-pending-orders'; NO re-agenda ni toca ninguno de los 8 jobs
-- existentes (los 5 crons de email desagendados a propósito en STG el 2026-08-05
-- quedan como están). El endpoint es aditivo e idempotente (una corrida extra solo
-- cancela órdenes expiradas, que es lo deseado en cualquier ambiente transaccional).
--
-- Minuto 23 (no 0): esparce la carga — cart-recovery ya corre al minuto 0 y alerts
-- cada 5 min; el job es horario como cart-recovery.
--
-- ACCIÓN HUMANA (Lucy, al desplegar): verificar en Supabase que el job quedó agendado
-- (SELECT * FROM cron.job WHERE jobname = 'lucams-expire-pending-orders';). Reusa los
-- secretos cron_base_url y cron_secret ya creados para la 015.
--
-- GUARDADO (pg_cron/pg_net ausentes → skip limpio) e IDEMPOTENTE (unschedule → schedule
-- SOLO del job nuevo).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite el job expire-pending-orders.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite el job expire-pending-orders.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-expire-pending-orders') FROM cron.job WHERE jobname = 'lucams-expire-pending-orders';
  PERFORM cron.schedule(
    'lucams-expire-pending-orders',
    '23 * * * *',
    $cmd$SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || '/api/cron/expire-pending-orders',
  headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
    -- Bypass de Vercel Authentication (previews STG): se agrega SOLO si el secreto existe.
    || COALESCE(
         (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
          FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
         '{}'::jsonb)
);$cmd$
  );

  RAISE NOTICE 'pg_cron: job lucams-expire-pending-orders agendado (cada hora, minuto 23; lee base URL + secret del Vault). Sin tocar los demás jobs.';
END $$;
