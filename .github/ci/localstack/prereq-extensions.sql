-- Prerequisitos de extensiones para el Nightly (A3, stack Supabase local).
-- Migraciones prisma VIEJAS crean índices GIN con gin_trgm_ops
-- (20260515_catalog_v2_consolidated) asumiendo pg_trgm/unaccent habilitados —
-- en el CI por-PR los provee .github/ci/supabase-compat.sql (que acá NO se
-- puede usar: también stubea auth.uid()/roles del stack real). El stack local
-- de Supabase tiene las extensiones disponibles pero NO habilitadas → sin este
-- paso, `prisma migrate deploy` aborta en la migración del índice trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
