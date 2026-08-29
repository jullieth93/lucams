-- Auditoría de seguridad (docs/audits/auditoria_seguridad_lucams.md) — cierra
-- los hallazgos G-2 [A05] y V2-5 [A05]:
--
--   - En PROD persisten grants REFERENCES/TRIGGER/TRUNCATE sobre las 59 tablas
--     de public para `anon` y `authenticated` (la migración 022 nunca mordió
--     allí: grants hechos por otro grantor o re-creados después). No son DML y
--     no son alcanzables vía API (PostgREST no tiene verbo TRUNCATE/REFERENCES/
--     TRIGGER — V2-5 refutado como vector explotable), pero son drift y falsa
--     sensación de postura uniforme.
--   - En prod `service_role` fue endurecido A MANO (sin SELECT/INSERT/UPDATE/
--     DELETE) y ese endurecimiento no está versionado: un `db reset` o DR
--     reconstruido desde el repo lo dejaría con DML completo vía API. La app
--     accede a datos vía Prisma con el rol `postgres` y vía PostgREST solo como
--     `anon`/`authenticated` → `service_role` no necesita DML de tablas (opera
--     por bypass de RLS donde aplique).
--
-- Idempotente: revocar lo no otorgado es no-op. ADVERTENCIA de grantor: REVOKE
-- solo quita los grants hechos por el rol ejecutor (postgres); si en prod algún
-- grant lo hizo otro rol (p.ej. supabase_admin) sobrevivirá — por eso la
-- verificación final solo hace RAISE WARNING y NO rompe el deploy.

REVOKE REFERENCES, TRIGGER, TRUNCATE ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  FROM service_role;

-- Que las tablas FUTURAS creadas por el rol postgres hereden la misma postura
-- para service_role (anon/authenticated ya quedaron cubiertos en la 022).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM service_role;

-- Verificación inline (WARNING, nunca EXCEPTION): lista los grants residuales
-- que no se pudieron revocar por diferencia de grantor. anon/authenticated no
-- deben conservar NADA; de service_role solo importa que no conserve DML (sus
-- REFERENCES/TRIGGER/TRUNCATE residuales son aceptados — ver G-2).
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND (
        grantee IN ('anon', 'authenticated')
        OR (grantee = 'service_role'
            AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
      )
    ORDER BY grantee, table_name, privilege_type
  LOOP
    n := n + 1;
    RAISE WARNING 'grant residual: rol=% privilegio=% tabla=%',
      r.grantee, r.privilege_type, r.table_name;
  END LOOP;
  IF n = 0 THEN
    RAISE NOTICE 'OK: public sin grants para anon/authenticated y sin DML para service_role.';
  ELSE
    RAISE WARNING '% grants residuales tras la migración (probable grantor distinto a postgres) — revisar manualmente y revocar con el grantor correcto', n;
  END IF;
END $$;
