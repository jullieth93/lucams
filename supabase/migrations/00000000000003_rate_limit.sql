-- supabase/migrations/00000000000003_rate_limit.sql
--
-- Implementa rate limiting per ADR-016 (Postgres como rate-limit store
-- durante dev y arranque productivo; migrar a Redis solo si p95 > 50 ms
-- o el volumen lo exige).
--
-- Esquema:
--   - rate_limit_buckets (key, count, window_start): un bucket por
--     identifier (IP, user_id, ruta+IP, etc.). El "key" es opaco al SQL —
--     la lógica de construirlo (ej. 'login:1.2.3.4', 'checkout:cust-abc')
--     vive en lib/rate-limit.ts.
--   - Función rate_limit_check(key, limit, window_seconds): increment +
--     verificación atómica. Reinicia el contador si la ventana expiró.
--     Devuelve (allowed, count, reset_at).
--
-- Snake_case porque es SQL nativo, no Prisma (per docs/CONVENTIONS.md
-- § Naming: "Tablas creadas por SQL nativo (migrations no-Prisma)" →
-- snake_case plural).
--
-- RLS: la tabla NO se expone a anon/authenticated. Solo service_role
-- (server-side, vía Prisma con DATABASE_URL) la toca. Por completitud
-- habilito RLS sin policies → deny-by-default.

-- ════════════════════════ TABLA ════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key          TEXT        PRIMARY KEY,
  count        INT         NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_window_idx
  ON rate_limit_buckets (window_start);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- ════════════════════════ FUNCIÓN ════════════════════════

-- Atomic increment + check. Si la ventana expiró, reinicia.
-- Devuelve si la operación está permitida y cuándo se resetea.
CREATE OR REPLACE FUNCTION rate_limit_check(
  p_key            TEXT,
  p_limit          INT,
  p_window_seconds INT
) RETURNS TABLE (
  allowed   BOOLEAN,
  count     INT,
  reset_at  TIMESTAMPTZ
) AS $$
DECLARE
  v_count        INT;
  v_window_start TIMESTAMPTZ;
BEGIN
  INSERT INTO rate_limit_buckets (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_limit_buckets.window_start + (p_window_seconds * INTERVAL '1 second') < NOW()
        THEN 1
      ELSE rate_limit_buckets.count + 1
    END,
    window_start = CASE
      WHEN rate_limit_buckets.window_start + (p_window_seconds * INTERVAL '1 second') < NOW()
        THEN NOW()
      ELSE rate_limit_buckets.window_start
    END
  RETURNING rate_limit_buckets.count, rate_limit_buckets.window_start
    INTO v_count, v_window_start;

  RETURN QUERY SELECT
    (v_count <= p_limit)::BOOLEAN,
    v_count,
    (v_window_start + (p_window_seconds * INTERVAL '1 second'))::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════ CLEANUP (manual por ahora) ════════════════════════
-- TODO Phase 1 follow-up: cuando se configure pg_cron, agendar borrado
-- de buckets cuya window_start + 24h < NOW(). Ejemplo:
--
--   SELECT cron.schedule(
--     'rate-limit-cleanup',
--     '*/15 * * * *',
--     $$DELETE FROM rate_limit_buckets
--       WHERE window_start < NOW() - INTERVAL '24 hours'$$
--   );
--
-- Mientras tanto la tabla crece monotónicamente — aceptable durante dev.
