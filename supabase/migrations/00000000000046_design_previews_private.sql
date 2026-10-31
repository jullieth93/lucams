-- LUC-SEC-001 (auditoría 2026-10-30) — design-previews deja de ser PÚBLICO.
--
-- El bucket mezclaba previews limpios, variantes watermark y miniaturas de
-- borrador (fotos personales de clientes) accesibles por URL pública sin
-- sesión: un identificador opaco no es autorización. Desde hoy toda lectura
-- pasa por el Route Handler autorizado /api/design-preview/* (dueño por
-- sesión/cuenta, admin, o token de compartir/cotización/pedido que solo
-- habilita las variantes watermark).
--
-- Escritura: sin cambios — las policies admin de la migración 006 se conservan
-- (y el service role server-side bypasea RLS, como en customer-uploads).
-- Lectura directa anónima: muerta (public=false; no existe policy SELECT para
-- anon/authenticated no-admin).
--
-- Idempotente. Aplicar DESPUÉS o junto con el deploy del Route Handler: sin él,
-- las imágenes de diseños dejan de cargar en el storefront.

UPDATE storage.buckets
SET public = false
WHERE id = 'design-previews';
