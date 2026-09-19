-- Feedback Lucy 2026-09-18 — retención POST-ENTREGA de fotos del Estudio (Ley 1581, art. 4 lit. f):
-- agenda el job HTTP `lucams-purge-delivered-designs` → `/api/cron/purge-delivered-designs`, que
-- borra las fotos crudas (customer-uploads) y los renders de producción (production-assets) de los
-- diseños cuya orden lleva ≥90 días entregada y sin retracto/garantía abierto. Libera Storage del
-- plan Free (1 GB): un pedido puede dejar ~57 MB que hoy se retenían para siempre.
--
-- Diario 09:00 UTC (una hora después de lucams-purge-anon-designs, para no solapar el barrido de
-- Storage). Mismo patrón que 015/016/021/023: SIN secreto en el SQL (lee `cron_base_url` y
-- `cron_secret` del Vault en runtime y manda el secreto por header `x-cron-secret`), header
-- `x-vercel-protection-bypass` SOLO si existe el secreto `cron_vercel_bypass` (previews STG),
-- GUARDADO si pg_cron/pg_net no están instalados (skip limpio con NOTICE) e IDEMPOTENTE
-- (unschedule-si-existe → schedule).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — se omite lucams-purge-delivered-designs (habilitar pg_cron + pg_net en el dashboard de Supabase y re-aplicar).';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net no instalado — se omite lucams-purge-delivered-designs (habilitar pg_net en el dashboard de Supabase y re-aplicar).';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lucams-purge-delivered-designs') FROM cron.job WHERE jobname = 'lucams-purge-delivered-designs';
  PERFORM cron.schedule(
    'lucams-purge-delivered-designs',
    '0 9 * * *',
    $cmd$SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_base_url') || '/api/cron/purge-delivered-designs',
  headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'))
    -- Bypass de Vercel Authentication (previews STG): se agrega SOLO si el secreto existe.
    || COALESCE(
         (SELECT jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
          FROM vault.decrypted_secrets WHERE name = 'cron_vercel_bypass'),
         '{}'::jsonb)
);$cmd$
  );

  RAISE NOTICE 'pg_cron: lucams-purge-delivered-designs agendado (0 9 * * *). Requiere los secretos cron_base_url y cron_secret en el Vault (ya creados para los jobs de 015).';
END $$;
