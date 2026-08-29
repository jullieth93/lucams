-- Auditoría de seguridad (docs/audits/auditoria_seguridad_lucams.md) — cierra
-- el hallazgo V2-7 [A05]: `pg_net` quedó instalada en el schema `public` en STG
-- (instalación manual divergente, no versionada) mientras que en PROD vive en
-- `extensions`. La convención de Supabase es extensions fuera de public (el
-- schema public queda expuesto al search_path de la API — ver G-8).
--
-- Esta migración converge ambos ambientes: solo mueve la extensión cuando
-- (a) pg_net existe, (b) está registrada en public y (c) el schema extensions
-- existe. En cualquier otro caso (prod: ya en extensions; proyecto sin pg_net;
-- sin schema extensions) es no-op con NOTICE. Idempotente por construcción.
--
-- NOTA operador (corregida al aplicar en stg 2026-08-29): pg_net NO soporta
-- `ALTER EXTENSION ... SET SCHEMA` (relocatable=false) — se mueve con
-- DROP + CREATE SCHEMA dentro de la misma transacción. Las funciones quedan
-- recreadas en el schema `net` (las 12 net.* — verificado en stg), así que los
-- jobs pg_cron que llaman `net.http_get` (migraciones 015/016/021/023) siguen
-- funcionando. Si el CREATE fallara, la transacción aborta y el DROP se
-- revierte (correr con ON_ERROR_STOP, como hace scripts/db-stg-setup.sh).

BEGIN;

DO $$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM pg_extension e
       JOIN pg_namespace n ON n.oid = e.extnamespace
       WHERE e.extname = 'pg_net' AND n.nspname = 'public'
     )
     AND EXISTS (
       SELECT 1 FROM pg_namespace WHERE nspname = 'extensions'
     )
  THEN
    DROP EXTENSION pg_net;
    CREATE EXTENSION pg_net SCHEMA extensions;
    RAISE NOTICE 'pg_net movida de public a extensions (drop+create; convergencia stg↔prod).';
  ELSE
    RAISE NOTICE 'pg_net ausente, ya fuera de public, o schema extensions inexistente — no-op.';
  END IF;
END $$;

COMMIT;
