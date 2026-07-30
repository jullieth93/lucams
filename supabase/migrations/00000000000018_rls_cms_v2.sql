-- CMS v2 (2026-07-30): RLS deny-by-default para las tablas nuevas del modelo
-- Página → Sección → Campo (CmsPage, CmsSection, CmsField, CmsFieldVersion).
--
-- Misma estrategia que 00000000000007: ENABLE RLS sin policies. La app accede
-- vía Prisma con el rol privilegiado (DATABASE_URL), que bypassa RLS; el
-- cliente anon (publishable key) queda sin acceso vía PostgREST. Si algún día
-- se necesita lectura pública anon, se agrega una policy SELECT específica.

ALTER TABLE public."CmsPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CmsSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CmsField" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CmsFieldVersion" ENABLE ROW LEVEL SECURITY;

-- Verificación inline: si alguna quedó sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('CmsPage', 'CmsSection', 'CmsField', 'CmsFieldVersion')
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % tablas CMS v2 sin RLS', n;
  END IF;
  RAISE NOTICE 'OK: tablas CMS v2 con RLS habilitada (deny-by-default).';
END $$;
