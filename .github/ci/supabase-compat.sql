-- Compat mínimo de Supabase para correr las migraciones en un Postgres pelado
-- (CI service container / local). Supabase provee esto pre-instalado; acá lo
-- stubeamos para que las migraciones (RLS + índices trigram + storage) apliquen.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles de Supabase (referenciados por las políticas RLS).
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;              EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticator NOINHERIT LOGIN;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO authenticator;

-- Esquema auth + auth.uid() (usado por políticas RLS owner-scoped).
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $fn$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;

-- Esquema storage (migraciones de storage/personalización lo referencian).
CREATE SCHEMA IF NOT EXISTS storage;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Stub de tablas de Supabase Storage (los tests mockean el cliente de storage;
-- esto solo permite que las migraciones de buckets/objects apliquen).
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL,
  owner uuid, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text, owner uuid, owner_id text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(), metadata jsonb, path_tokens text[]
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
