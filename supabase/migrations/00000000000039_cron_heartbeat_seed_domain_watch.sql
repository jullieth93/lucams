-- Vigilante del dominio (2026-09-20 — L-H3/L-N1 de la auditoría 2026-09-19):
-- siembra del latido inicial de `domain-watch`, siguiendo la convención F-04
-- (migración 037): todo job de CRON_JOBS nace con su fila `cron:<job>` en
-- AlertState para que el dead-man switch lo detecte si NUNCA corre (a los
-- 2× intervalo = 48 h) sin que el health dé 503 en falso mientras tanto.
--
-- OJO: `domain-watch` NO es un job pg_cron — su productor es el workflow
-- domain-watch.yml de GitHub Actions (RDAP de Verisign rechaza las conexiones
-- HTTPS salientes de pg_net, verificado en vivo 2026-09-20); la ruta
-- /api/cron/domain-watch hace upsert de este latido tras cada observación.

INSERT INTO public."AlertState" ("key", "lastSentAt", "lastDetail", "updatedAt")
VALUES
  ('cron:domain-watch', now(), 'latido sembrado al agendar (migración 039) — aún sin ejecución real', now())
ON CONFLICT ("key") DO NOTHING;

-- Verificación inline: el latido sembrado (o uno real) debe quedar presente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."AlertState" WHERE "key" = 'cron:domain-watch') THEN
    RAISE EXCEPTION 'Falta el latido sembrado de cron:domain-watch en AlertState';
  END IF;
  RAISE NOTICE 'OK: cron:domain-watch tiene latido en AlertState (sembrado o real).';
END $$;
