-- Extensiones para búsqueda fuzzy + acentos en Postgres + bucket
-- product-images en Supabase Storage con RLS write=admin.
--
-- Aplicado el 2026-05-12 vía psql directo (Supabase Free no tiene
-- shadow DB). Marcado como aplicado en _prisma_migrations via
-- `prisma migrate resolve --applied`.

-- ──────────────────────── pg_trgm + unaccent ────────────────────────
-- pg_trgm habilita búsqueda fuzzy con operador % y similarity().
-- unaccent normaliza tildes/diéresis para que "fotoiman" matchee
-- "fotoimán". Lo usamos en header search + filtros /productos.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Función immutable para usar unaccent en índices (unaccent default
-- es STABLE, no IMMUTABLE → no se puede indexar). Wrapper común:
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent($1); $$;

-- Índices GIN trigram para búsqueda fuzzy de productos.
CREATE INDEX IF NOT EXISTS product_name_trgm_idx
  ON "Product" USING GIN (immutable_unaccent("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS product_description_trgm_idx
  ON "Product" USING GIN (immutable_unaccent("description") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS product_slug_trgm_idx
  ON "Product" USING GIN ("slug" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS product_sku_trgm_idx
  ON "Product" USING GIN ("sku" gin_trgm_ops);

-- ──────────────────────── Storage bucket product-images ────────────────────────
-- Bucket público para que next/image (Vercel optimizer) pueda servir
-- WebP optimizadas sin pasarnos por proxy server-side. RLS de write
-- solo para AdminUser activos.
--
-- Idempotente: el INSERT usa ON CONFLICT DO NOTHING.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB por archivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Helper: ¿el auth.uid() actual corresponde a un AdminUser activo?
CREATE OR REPLACE FUNCTION is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "AdminUser"
    WHERE "supabaseUserId" = auth.uid()::text
      AND "isActive" = true
      AND "deletedAt" IS NULL
  );
$$;

-- Policies sobre storage.objects para el bucket product-images.
-- SELECT: público (bucket.public = true ya permite anon read).
-- INSERT/UPDATE/DELETE: solo AdminUser activos.

DROP POLICY IF EXISTS "product_images_admin_insert" ON storage.objects;
CREATE POLICY "product_images_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images' AND is_active_admin());

DROP POLICY IF EXISTS "product_images_admin_update" ON storage.objects;
CREATE POLICY "product_images_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images' AND is_active_admin())
WITH CHECK (bucket_id = 'product-images' AND is_active_admin());

DROP POLICY IF EXISTS "product_images_admin_delete" ON storage.objects;
CREATE POLICY "product_images_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images' AND is_active_admin());
