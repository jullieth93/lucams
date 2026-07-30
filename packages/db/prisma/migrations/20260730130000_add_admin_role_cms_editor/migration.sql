-- Rol CMS_EDITOR: puede editar el contenido del sitio (CMS v2 + plantillas
-- de correo), nada más. Nace para que quien edita textos no necesite el rol
-- SUPERADMIN (antes TODO el contenido era SUPER-only).
-- Escrita a mano (migrate dev no puede levantar shadow DB en Supabase por la
-- extensión pg_trgm de una migración vieja). Aplicar con `make migrate`.

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'CMS_EDITOR';
