-- Visuales de categoría (roadmap B3): Category.icon + Category.gradient.
-- Decisión de dominio: el icono/gradiente de una categoría es dato de
-- CATÁLOGO (cómo se muestra en home grid / mega-menú), NO contenido editorial
-- → columnas del modelo Category, editables desde /admin/categorias. NO va en
-- el CMS. Antes estaban quemados por slug en código (CATEGORY_STYLES de
-- category-grid.tsx e ICONS de shop-mega-menu.tsx); esos mapas quedan como
-- fallback cuando la columna es NULL.
-- Escrita a mano (migrate dev no puede levantar shadow DB en Supabase por la
-- extensión pg_trgm de una migración vieja). Aplicar con `make migrate`.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "icon" TEXT,
ADD COLUMN "gradient" TEXT;
