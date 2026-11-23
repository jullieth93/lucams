#!/usr/bin/env bash
# Runner idempotente para las migraciones SQL de `supabase/migrations/*.sql` (Fase 4 · #18).
#
# Mantiene la tabla de control `public._lucams_sql_migrations` (con RLS activa y
# 0 grants a roles PostgREST) registrando:
#   - name       (basename del archivo .sql, PK)
#   - checksum   (SHA-256 hex del archivo)
#   - applied_at (timestamptz)
#
# Garantías:
#   1. Una migración ya aplicada con el mismo checksum se omite sin re-ejecutar.
#   2. Si un archivo ya aplicado cambia su checksum, falla en modo fail-closed
#      (evita mutar migraciones históricas en silencio; exige crear una nueva).
#   3. Elimina la necesidad de escribir DDL espejo en migraciones futuras: cada
#      archivo se ejecuta una única vez por base de datos.
#
# Uso:
#   bash scripts/apply-supabase-migrations.sh <POSTGRES_URL> [MIGRATIONS_DIR]
set -euo pipefail

if [[ $# -lt 1 || -z "${1:-}" ]]; then
  echo "Uso: $0 <POSTGRES_URL> [MIGRATIONS_DIR]" >&2
  exit 2
fi

DB_URL="$1"
MIGRATIONS_DIR="${2:-supabase/migrations}"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "✗ directorio de migraciones no encontrado: $MIGRATIONS_DIR" >&2
  exit 1
fi

# 1. Crear tabla de control de forma idempotente y endurecer RLS/grants.
#    (-X / --no-psqlrc evita que ~/.psqlrc inyecte banners o \timing en stdout.)
psql -X "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS public._lucams_sql_migrations (
  name       text PRIMARY KEY,
  checksum   text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._lucams_sql_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._lucams_sql_migrations FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public._lucams_sql_migrations FROM service_role;
SQL

applied=0
skipped=0

# 2. Aplicar en orden lexicográfico solo las migraciones pendientes.
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  name="$(basename "$file")"
  checksum="$(sha256sum "$file" | awk '{print $1}')"

  recorded="$(
    psql -X "$DB_URL" -v ON_ERROR_STOP=1 -v "mig_name=$name" -A -t -q <<'SQL'
SELECT checksum FROM public._lucams_sql_migrations WHERE name = :'mig_name';
SQL
  )"

  if [[ -n "$recorded" ]]; then
    if [[ "$recorded" != "$checksum" ]]; then
      echo "✗ checksum divergente en migración ya aplicada: $name" >&2
      echo "  registrado: $recorded" >&2
      echo "  actual:     $checksum" >&2
      echo "  Crea una nueva migración numerada en lugar de modificar una ya aplicada." >&2
      exit 1
    fi
    skipped=$((skipped + 1))
    continue
  fi

  echo "  · [apply] $file"
  psql -X "$DB_URL" -v ON_ERROR_STOP=1 -f "$file"

  # INSERT estricto (sin ON CONFLICT DO UPDATE): si dos runners compiten
  # concurrentemente sobre la misma migración, falla en voz alta en vez de
  # sobreescribir el checksum silenciosamente.
  psql -X "$DB_URL" -v ON_ERROR_STOP=1 -v "mig_name=$name" -v "mig_checksum=$checksum" -q <<'SQL'
INSERT INTO public._lucams_sql_migrations (name, checksum, applied_at)
VALUES (:'mig_name', :'mig_checksum', now());
SQL
  applied=$((applied + 1))
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort)

echo "✓ supabase/migrations sincronizadas (aplicadas: $applied, omitidas por tabla de control: $skipped)"

