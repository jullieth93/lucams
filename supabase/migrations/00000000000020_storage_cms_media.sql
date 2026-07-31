-- Campos de IMAGEN (CMS v2, roadmap B5): bucket público `cms-media` para los
-- assets de la mediateca + policies de escritura solo-admin + RLS
-- deny-by-default en la tabla CmsMedia (misma estrategia que 00000000000018/19:
-- la app accede vía Prisma / service role, que bypassa RLS; el cliente anon
-- queda sin acceso vía PostgREST).
--
-- El bucket es PÚBLICO: las imágenes del sitio (banners, hero, logos) se
-- sirven con URL pública inmutable (path con UUID, cache 1 año). No hace
-- falta policy SELECT: bucket.public = true ya permite lectura anon.
-- Los límites (5 MB, jpg/png/webp/avif) viven en la fila del bucket, como en
-- 00000000000005_search_and_storage.sql.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cms-media',
  'cms-media',
  true,
  5242880, -- 5 MB por archivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Escritura solo para admins activos (defensa en profundidad: la app sube con
-- el service role, que bypassa RLS — estas policies cubren cualquier acceso
-- autenticado directo, mismo patrón que product-images en la 005).
DROP POLICY IF EXISTS "cms_media_admin_insert" ON storage.objects;
CREATE POLICY "cms_media_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cms-media' AND is_active_admin());

DROP POLICY IF EXISTS "cms_media_admin_update" ON storage.objects;
CREATE POLICY "cms_media_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'cms-media' AND is_active_admin())
WITH CHECK (bucket_id = 'cms-media' AND is_active_admin());

DROP POLICY IF EXISTS "cms_media_admin_delete" ON storage.objects;
CREATE POLICY "cms_media_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'cms-media' AND is_active_admin());

ALTER TABLE public."CmsMedia" ENABLE ROW LEVEL SECURITY;

-- Verificación inline: si quedó sin RLS, falla la migración.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename = 'CmsMedia'
    AND rowsecurity = false;
  IF n > 0 THEN
    RAISE EXCEPTION 'CmsMedia quedó sin RLS';
  END IF;
  RAISE NOTICE 'OK: CmsMedia con RLS habilitada (deny-by-default).';
END $$;
