-- Sub-bloque M.1.b — Storage buckets para el Estudio de Personalización.
--
-- 3 buckets nuevos:
--   1. customer-uploads (privado, RLS owner-only): fotos crudas subidas
--      por el cliente. URL firmada con TTL 1h al cliente; admin con service
--      role accede sin restricción.
--   2. design-previews (público): thumbnails 1080×1080 PNG visibles en
--      cart/order/product detail. Hot-link friendly para next/image.
--   3. production-assets (privado, RLS admin-only): PNG 300 DPI listos
--      para impresión. Solo admin descarga.
--
-- Idempotentes: INSERT con ON CONFLICT DO UPDATE.
-- Policies se DROP IF EXISTS y se recrean para soportar re-aplicar.

-- ──────────────────────── customer-uploads ────────────────────────
-- Privado. Cliente sube sus fotos crudas (raw, antes de strip EXIF).
-- 10 MB por archivo (fotos modernas de cel high-res suelen ser 3-8 MB).
-- MIME limitado a imágenes web estándar.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-uploads',
  'customer-uploads',
  false, -- privado: solo owner (vía RLS) o service_role (admin)
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies customer-uploads:
-- - INSERT: cualquier usuario autenticado puede subir SUS propios assets.
--   (sessionId anon flow se soporta vía service_role del server action).
-- - SELECT: solo si owner (objeto.metadata->>'owner_id' === auth.uid()) o admin.
-- - DELETE: solo owner o admin.

DROP POLICY IF EXISTS "customer_uploads_insert_authenticated" ON storage.objects;
CREATE POLICY "customer_uploads_insert_authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'customer-uploads');

DROP POLICY IF EXISTS "customer_uploads_select_owner_or_admin" ON storage.objects;
CREATE POLICY "customer_uploads_select_owner_or_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-uploads'
  AND (
    -- Owner: el objeto guardó metadata.owner_id == auth.uid() al subir
    (metadata->>'owner_id') = auth.uid()::text
    OR is_active_admin()
  )
);

DROP POLICY IF EXISTS "customer_uploads_delete_owner_or_admin" ON storage.objects;
CREATE POLICY "customer_uploads_delete_owner_or_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'customer-uploads'
  AND (
    (metadata->>'owner_id') = auth.uid()::text
    OR is_active_admin()
  )
);

-- ──────────────────────── design-previews ────────────────────────
-- Público. Thumbnails 1080×1080 generados al confirmar el design (status=READY).
-- Hot-link friendly para next/image Vercel optimizer.
-- Solo admin (vía service_role server-side) puede subir; cliente no escribe directo.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'design-previews',
  'design-previews',
  true,
  3145728, -- 3 MB (PNG 1080×1080 comprimido típicamente <1MB, holgura para WebP)
  ARRAY['image/png', 'image/webp', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "design_previews_admin_insert" ON storage.objects;
CREATE POLICY "design_previews_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'design-previews' AND is_active_admin());

DROP POLICY IF EXISTS "design_previews_admin_update" ON storage.objects;
CREATE POLICY "design_previews_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'design-previews' AND is_active_admin())
WITH CHECK (bucket_id = 'design-previews' AND is_active_admin());

DROP POLICY IF EXISTS "design_previews_admin_delete" ON storage.objects;
CREATE POLICY "design_previews_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'design-previews' AND is_active_admin());

-- (SELECT es público por bucket.public = true)

-- ──────────────────────── production-assets ────────────────────────
-- Privado, admin-only para read+write. PNG 300 DPI listo para impresión.
-- 30 MB por archivo (un PNG 300 DPI 30×30 cm sin compresión puede llegar
-- a 20+ MB; con compresión PNG suele ser ~5-10 MB).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'production-assets',
  'production-assets',
  false,
  31457280, -- 30 MB
  ARRAY['image/png', 'image/tiff', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "production_assets_admin_all" ON storage.objects;
CREATE POLICY "production_assets_admin_all"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'production-assets' AND is_active_admin())
WITH CHECK (bucket_id = 'production-assets' AND is_active_admin());
