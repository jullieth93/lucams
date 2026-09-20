-- Auditoría 2026-09-19 (L-C1, verificación en vivo PRD) — grants residuales
-- no-DML (REFERENCES/TRIGGER/TRUNCATE) sobre EmailTemplateOverride y
-- ProductMaterial para anon/authenticated.
--
-- Origen: esas dos tablas nacieron por migraciones Prisma POSTERIORES a la
-- 022 (que fijó la postura "anon/authenticated sin ningún privilegio en
-- public" + default privileges del rol postgres). Los defaults administrados
-- por Supabase re-otorgan los privilegios no-DML a las tablas nuevas; el
-- REVOKE de la 022 no los alcanzó porque no existían al correr.
--
-- No explotable vía PostgREST (la API no expone TRUNCATE ni REFERENCES; RLS
-- está habilitada en ambas tablas como backstop), pero la postura declarada
-- es "cero privilegios" y esta migración la deja cierta otra vez. El ALL de
-- abajo cubre también cualquier tabla futura/residual en el mismo estado al
-- momento de aplicarla (idempotente: revocar lo no otorgado es no-op).

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Verificación inline: si queda CUALQUIER grant a esos roles, falla.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated');
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % grants residuales a anon/authenticated en public', n;
  END IF;
  RAISE NOTICE 'OK: public sin grants a anon/authenticated (postura 022 restituida).';
END $$;
