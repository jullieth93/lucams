#!/usr/bin/env bash
# Aplica TODO el esquema al stack Supabase LOCAL recién levantado, en el orden
# correcto (mismo orden que el Nightly CI):
#   1. Extensiones Postgres prerequisito (pg_trgm/unaccent — las exigen
#      migraciones viejas de Prisma).
#   2. prisma migrate deploy (esquema de la app).
#   3. supabase/migrations/*.sql en orden (RLS, storage buckets, pg_cron,
#      postura de grants) con el superuser del stack (supabase_admin — el
#      event trigger de la 014 lo exige).
#
# NO toca .env.local: las URLs locales van inline. El flip de entorno es paso
# aparte (scripts/db-local-env.sh on) y los seeds corren después de él.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_DB="postgresql://postgres:postgres@localhost:54322/postgres"
LOCAL_ADMIN="postgresql://supabase_admin:postgres@localhost:54322/postgres"

echo "→ 1/3 extensiones prerequisito"
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f .github/ci/localstack/prereq-extensions.sql
# pg_cron + pgmq: el stack local las trae DISPONIBLES pero no habilitadas, y los
# jobs de supabase/migrations 012/015/016/021/023 las necesitan (si faltan, esas
# migraciones se saltan con NOTICE y la paridad con la nube queda rota en silencio
# — detectado en la auditoría 2026-08-01). pgmq es mandato #11 (colas en Postgres).
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pgmq;"

echo "→ 2/3 prisma migrate deploy"
DATABASE_URL="$LOCAL_DB" DIRECT_URL="$LOCAL_DB" pnpm --filter @lucams/db exec prisma migrate deploy

echo "→ 3/3 supabase/migrations (RLS, storage, cron)"
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "  · $f"
  psql "$LOCAL_ADMIN" -v ON_ERROR_STOP=1 -f "$f"
done

echo "✓ esquema completo aplicado al stack local"
