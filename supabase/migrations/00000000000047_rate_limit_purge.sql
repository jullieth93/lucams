-- LUC-SEC-010 (auditoría 2026-10-30) — purga programada de rate_limit_buckets.
--
-- La tabla crece monotónicamente por diseño (migración 003 lo declaraba TODO
-- manual): cada clave nueva (IP, email hasheado, usuario, ruta) crea un bucket
-- y nada lo borra — el propio sistema de defensa se vuelve vector de bloat,
-- backups mayores y degradación progresiva.
--
-- Diseño: la ventana más larga en uso en la app es 3600 s (rateLimit() de
-- lib/rate-limit.ts — verificado por barrido de call sites). Un bucket con
-- window_start viejo se REINICIA solo al próximo acceso (la función
-- rate_limit_check ya lo hace), así que borrar claves inactivas es seguro.
-- Margen: 7 días (168× la ventana máxima) — nunca corta una ventana viva.
--
-- Métricas + alarma: la función escribe su latido en AlertState
-- (cron:purge-rate-limits) con el detalle "borradas N, quedan M" — visible en
-- /admin/observability vía getCronHealth, y si el job deja de correr salta el
-- dead-man como cualquier otro cron. El historial de pg_cron lo limpia la 043.

-- Función idempotente y re-ejecutable sin carreras (DELETE concurrente es
-- seguro: dos corridas traslapadas borran el mismo conjunto o subconjunto).
CREATE OR REPLACE FUNCTION purge_rate_limit_buckets()
RETURNS bigint AS $$
DECLARE
  v_deleted bigint;
  v_remaining bigint;
BEGIN
  DELETE FROM rate_limit_buckets
  WHERE window_start < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_remaining FROM rate_limit_buckets;

  -- Latido con métrica de cardinalidad (mismo modelo AlertState que los crons
  -- HTTP; updatedAt se setea a mano porque Prisma @updatedAt no tiene default SQL).
  INSERT INTO "AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
  VALUES (
    'cron:purge-rate-limits',
    now(),
    format('borradas %s, quedan %s', v_deleted, v_remaining),
    now()
  )
  ON CONFLICT ("key") DO UPDATE SET
    "lastSentAt" = EXCLUDED."lastSentAt",
    "lastDetail" = EXCLUDED."lastDetail",
    "updatedAt" = EXCLUDED."updatedAt";

  RAISE NOTICE 'purge_rate_limit_buckets: borradas %, quedan %', v_deleted, v_remaining;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Agenda diaria (mismo patrón guardado de la 043: solo si pg_cron existe).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('lucams-purge-rate-limits')
      FROM cron.job WHERE jobname = 'lucams-purge-rate-limits';
    PERFORM cron.schedule(
      'lucams-purge-rate-limits',
      '29 5 * * *',
      $cmd$SELECT purge_rate_limit_buckets();$cmd$
    );
    RAISE NOTICE 'pg_cron: lucams-purge-rate-limits agendado (diario 05:29).';
  ELSE
    RAISE NOTICE 'pg_cron no instalado — se omite lucams-purge-rate-limits.';
  END IF;
END $$;
