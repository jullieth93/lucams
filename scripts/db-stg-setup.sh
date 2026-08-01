#!/usr/bin/env bash
# Aplica TODO el esquema al proyecto Supabase CLOUD de staging (lucams-stg),
# en el mismo orden que el Nightly CI y db-local-setup.sh:
#   1. Extensiones Postgres prerequisito (pg_trgm/unaccent — las exigen
#      migraciones viejas de Prisma).
#   2. prisma migrate deploy (esquema de la app).
#   3. supabase/migrations/*.sql en orden (RLS, storage buckets, pg_cron,
#      postura de grants) con el rol postgres del proyecto (superuser en
#      Supabase cloud — el event trigger de la 014 lo exige).
#
# Pre-requisito: `.env.stg` en la raíz del repo (gitignored por `.env.*`) con
# las 5 vars del proyecto stg (mismo formato que .env.local.nube-backup):
#   DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL,
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
# Las URLs deben ser las del pooler del proyecto stg (6543 pgbouncer / 5432
# directo), como en la nube de prod.
#
# NO corre seeds (después: `make db-stg-seed`).
#
# PASO MANUAL POSTERIOR (pg_cron HTTP jobs, migraciones 015/016/021): los jobs
# leen `cron_base_url` y `cron_secret` del Vault EN RUNTIME; en un proyecto
# nuevo no existen y los jobs fallarían en cada corrida. Crearlos apuntando a
# la URL estable del preview de develop con el MISMO valor de CRON_SECRET que
# quede scope Preview en Vercel:
#   psql "$DIRECT_URL" -c "select vault.create_secret('https://<alias-preview-develop>.vercel.app', 'cron_base_url');"
#   psql "$DIRECT_URL" -c "select vault.create_secret('<CRON_SECRET preview>', 'cron_secret');"
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.stg ]]; then
  echo "✗ falta .env.stg — crea el proyecto lucams-stg en Supabase y copia sus 5 vars" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.stg
set +a

: "${DIRECT_URL:?DIRECT_URL no está en .env.stg}"

echo "→ 1/3 extensiones prerequisito"
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f .github/ci/localstack/prereq-extensions.sql

echo "→ 2/3 prisma migrate deploy"
pnpm --filter @lucams/db exec prisma migrate deploy

echo "→ 3/3 supabase/migrations (RLS, storage, cron)"
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "  · $f"
  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "✓ esquema completo aplicado a lucams-stg"
echo "  Siguiente: make db-stg-seed · y crear los secretos Vault cron_base_url/cron_secret (ver header del script)"
