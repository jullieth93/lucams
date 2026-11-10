-- Auditoría 2026-11-08 — ZIP de taller fuera del response de la función.
--
-- GET /admin/pedidos/<n>/produccion armaba el ZIP de imprenta en memoria y lo
-- devolvía en el RESPONSE de la función: Vercel corta cualquier response de
-- ~4.5 MB y un pedido real (12+ PNG 300 DPI de 5-10 MB) nunca llegaba al
-- taller. Ahora la ruta sube el ZIP a `production-assets` (`_bundles/`) y
-- redirige (302) a una URL firmada de TTL corto.
--
-- Para que el bucket acepte esos objetos:
--   - allowed_mime_types += 'application/zip' (los PNG/TIFF/PDF no cambian).
--   - file_size_limit 30 MB → 200 MB: un ZIP de pedido grande (p. ej. un
--     calendario de 12 PNG ×2 copias con hoja de armado) supera los 30 MB.
--     200 MB sigue siendo un tope defensivo razonable frente a un runaway.

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/png', 'image/tiff', 'application/pdf', 'application/zip']::text[],
  file_size_limit = 209715200 -- 200 MB
WHERE id = 'production-assets';
