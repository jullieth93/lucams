-- Campos LISTA (CMS v2, roadmap B4, 2026-07-30): RLS deny-by-default para
-- CmsListItem (filas editables de un campo lista, ej. footer.legal.links).
--
-- Misma estrategia que 00000000000018: ENABLE RLS sin policies. La app accede
-- vía Prisma con el rol privilegiado (DATABASE_URL), que bypassa RLS; el
-- cliente anon (publishable key) queda sin acceso vía PostgREST. Si algún día
-- se necesita lectura pública anon, se agrega una policy SELECT específica.

ALTER TABLE public."CmsListItem" ENABLE ROW LEVEL SECURITY;

-- Verificación inline: si quedó sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename = 'CmsListItem'
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'CmsListItem quedó sin RLS';
  END IF;
  RAISE NOTICE 'OK: CmsListItem con RLS habilitada (deny-by-default).';
END $$;
