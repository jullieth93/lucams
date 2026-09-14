-- ═════════════════════════════════════════════════════════════════════════════
-- Monitor externo de uptime de PRD — job pg_cron en el proyecto SUPABASE DE STG
-- (decisión Lucy 2026-09-13: sin SaaS, sin GitHub Actions, sin depender de la VM
-- de desarrollo — que no siempre está encendida).
--
-- Arquitectura: pg_cron + pg_net dentro del proyecto Supabase de STG (infra
-- administrada 24/7, dominio de fallo independiente de Vercel/PRD). Este pg_net
-- es ASÍNCRONO: net.http_get encola y la respuesta llega a net._http_response en
-- otra transacción — por eso cada corrida del job hace DOS fases:
--   1) COLECTA: evalúa el lote sondeado en la corrida ANTERIOR (hace 10 min,
--      ya procesado de sobra). Un path solo cuenta como falla si falla en 2
--      corridas SEGUIDAS (~20 min sostenidos) — una transitoria no alerta.
--   2) DISPARO: encola el sondeo nuevo de los 5 healthchecks de PRD
--      (/api/health/{all,crons,resend,wompi,aveonline}).
-- Con falla persistente → email vía Resend (anti-spam 30 min). Siempre → POST
-- del resumen a PRD /api/cron/monitor-heartbeat (tile + reglas de la app).
--
-- Se aplica SOLO en STG (psql "$DIRECT_URL" de .env.stg — NUNCA en PRD: el job no
-- debe existir en el proyecto que monitorea). No forma parte de
-- supabase/migrations/* precisamente para no replicarse en todos los ambientes.
--
-- Secretos requeridos en el Vault de STG (vault.create_secret, nunca en el SQL):
--   monitor_prd_base_url   = https://lucamsshop.com
--   monitor_resend_api_key = <RESEND_API_KEY de PRD>
--   monitor_email_from     = <EMAIL_FROM verificado en Resend>
--   monitor_alert_email    = <ALERT_EMAIL del CMS>
--   monitor_cron_secret    = <CRON_SECRET de PRD>  (para el POST del reporte)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Lote en vuelo: el path sondeado, su request id y las fallas seguidas que lleva.
CREATE TABLE IF NOT EXISTS uptime_monitor_requests (
  path text PRIMARY KEY,
  request_id bigint NOT NULL,
  consecutive_failures int NOT NULL DEFAULT 0
);

-- Estado del monitor (anti-spam del email).
CREATE TABLE IF NOT EXISTS uptime_monitor_state (
  key text PRIMARY KEY,
  last_alert_at timestamptz,
  last_detail text
);

-- Función principal. `test_paths` permite certificar con un endpoint forzado a
-- fallar (NULL = los 5 reales; con test_paths, una sola falla basta para el
-- email — en producción se exigen 2 corridas seguidas).
CREATE OR REPLACE FUNCTION monitor_uptime_prd(test_paths text[] DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault, net
AS $$
DECLARE
  base_url text;
  resend_key text;
  email_from text;
  alert_email text;
  cron_secret text;
  paths text[] := COALESCE(test_paths, ARRAY[
    '/api/health/all',
    '/api/health/crons',
    '/api/health/resend',
    '/api/health/wompi',
    '/api/health/aveonline'
  ]);
  p text;
  req_id bigint;
  r record;
  consec int;
  code int;
  failures text[] := '{}';
  transitorias text[] := '{}';
  oks int := 0;
  total_eval int := 0;
  detail text;
  last_alert timestamptz;
  resend_body text;
  listado text;
  is_test boolean := test_paths IS NOT NULL;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'monitor_prd_base_url';
  SELECT decrypted_secret INTO resend_key FROM vault.decrypted_secrets WHERE name = 'monitor_resend_api_key';
  SELECT decrypted_secret INTO email_from FROM vault.decrypted_secrets WHERE name = 'monitor_email_from';
  SELECT decrypted_secret INTO alert_email FROM vault.decrypted_secrets WHERE name = 'monitor_alert_email';
  SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets WHERE name = 'monitor_cron_secret';

  IF base_url IS NULL THEN
    RAISE EXCEPTION 'monitor_uptime_prd: falta monitor_prd_base_url en el Vault de STG';
  END IF;
  base_url := rtrim(base_url, '/');

  -- ── FASE 1 — COLECTA del lote anterior (respuestas ya procesadas) ──
  FOR r IN SELECT * FROM uptime_monitor_requests LOOP
    total_eval := total_eval + 1;
    SELECT rs.status_code INTO code FROM net._http_response rs WHERE rs.id = r.request_id;
    IF code IS NOT NULL AND code >= 200 AND code < 300 THEN
      UPDATE uptime_monitor_requests SET consecutive_failures = 0 WHERE path = r.path;
      oks := oks + 1;
    ELSE
      UPDATE uptime_monitor_requests
      SET consecutive_failures = consecutive_failures + 1
      WHERE path = r.path
      RETURNING consecutive_failures INTO consec;
      IF consec >= 2 OR is_test THEN
        failures := failures || (
          r.path || ' (' || COALESCE('HTTP ' || code, 'sin respuesta') ||
          CASE WHEN is_test THEN '' ELSE ', x' || consec || ' corridas' END || ')'
        );
      ELSE
        transitorias := transitorias || r.path;
      END IF;
    END IF;
  END LOOP;

  -- Detalle de la corrida (lo leen el tile y las reglas de la app).
  IF failures IS NOT NULL AND array_length(failures, 1) IS NOT NULL THEN
    detail := 'FALLA ' || array_length(failures, 1) || '/' || GREATEST(total_eval, 1) || ': ' ||
              (SELECT string_agg(split_part(f, ' ', 1), ', ') FROM unnest(failures) AS f);
  ELSIF transitorias IS NOT NULL AND array_length(transitorias, 1) IS NOT NULL THEN
    detail := 'OK-TRANSITORIA ' || array_length(transitorias, 1) || '/' || GREATEST(total_eval, 1) ||
              ': ' || array_to_string(transitorias, ', ');
  ELSIF total_eval > 0 THEN
    detail := 'OK ' || oks || '/' || total_eval;
  ELSE
    detail := 'ARRANQUE (primer lote disparado)';
  END IF;

  -- Email de alerta: fallas persistentes + anti-spam 30 min.
  SELECT last_alert_at INTO last_alert FROM uptime_monitor_state WHERE key = 'alert';
  IF failures IS NOT NULL AND array_length(failures, 1) IS NOT NULL
     AND resend_key IS NOT NULL AND email_from IS NOT NULL AND alert_email IS NOT NULL
     AND (last_alert IS NULL OR now() - last_alert >= interval '30 minutes') THEN
    listado := (SELECT string_agg('  ✗ ' || f, E'\n') FROM unnest(failures) AS f);
    resend_body := format(
      'El monitor externo (Supabase STG) detectó %s healthcheck(s) fallando de forma PERSISTENTE (2+ corridas seguidas) en %s:' ||
      E'\n\n%s\n\nCuándo: %s\n\nQué mirar:\n' ||
      '  - /api/health/all caído → Vercel, Postgres o Storage de PRD.\n' ||
      '  - /api/health/crons caído → un job pg_cron lleva 2× su intervalo sin latido.\n' ||
      '  - /api/health/wompi|aveonline|resend → llaves/ambiente del proveedor (o el proveedor caído).\n\n' ||
      'Este correo no se repite dentro de 30 min aunque la falla persista (anti-spam).',
      array_length(failures, 1), base_url, listado, now());
    BEGIN
      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || resend_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', email_from,
          'to', jsonb_build_array(alert_email),
          'subject', '🔴 Uptime monitor: ' || array_length(failures, 1) || ' healthcheck(s) caídos en PRD',
          'text', resend_body
        ),
        timeout_milliseconds := 20000
      );
      INSERT INTO uptime_monitor_state (key, last_alert_at, last_detail)
      VALUES ('alert', now(), detail)
      ON CONFLICT (key) DO UPDATE SET last_alert_at = now(), last_detail = EXCLUDED.last_detail;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'monitor_uptime_prd: el email de alerta falló: %', SQLERRM;
    END;
  END IF;

  -- Reporte a la app (best-effort: alimenta el tile y las reglas; si la app está
  -- caída, el email de arriba ya hizo su trabajo).
  IF cron_secret IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := base_url || '/api/cron/monitor-heartbeat',
        headers := jsonb_build_object('x-cron-secret', cron_secret, 'Content-Type', 'application/json'),
        body := jsonb_build_object('detail', detail),
        timeout_milliseconds := 20000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'monitor_uptime_prd: el reporte a la app falló (best-effort): %', SQLERRM;
    END;
  END IF;

  -- ── FASE 2 — DISPARO del lote nuevo (se evalúa en la próxima corrida) ──
  -- Limpieza: filas de lotes viejos cuyo path ya no está en el lote actual
  -- (p.ej. endpoints de pruebas de certificación) — si quedaran, se
  -- re-evaluarían para siempre como falla fantasma.
  DELETE FROM uptime_monitor_requests WHERE NOT (path = ANY(paths));

  FOREACH p IN ARRAY paths LOOP
    BEGIN
      SELECT net.http_get(url := base_url || p, timeout_milliseconds := 20000) INTO req_id;
      INSERT INTO uptime_monitor_requests (path, request_id, consecutive_failures)
      VALUES (p, req_id, 0)
      ON CONFLICT (path) DO UPDATE SET request_id = EXCLUDED.request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'monitor_uptime_prd: no se pudo encolar %: %', p, SQLERRM;
    END;
  END LOOP;

  RETURN detail;
END;
$$;

-- Job cada 10 min (idempotente: re-agenda solo si existe).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'uptime-monitor-prd') THEN
    PERFORM cron.unschedule('uptime-monitor-prd');
  END IF;
  PERFORM cron.schedule('uptime-monitor-prd', '*/10 * * * *', $cmd$SELECT monitor_uptime_prd()$cmd$);
  RAISE NOTICE 'pg_cron: job uptime-monitor-prd agendado (cada 10 min, sondea PRD desde STG)';
END $$;
