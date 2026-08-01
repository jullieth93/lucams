#!/usr/bin/env bash
# Activa/desactiva el entorno Supabase LOCAL en .env.local (dev diario).
#
#   scripts/db-local-env.sh on   → respalda .env.local → .env.local.nube-backup
#                                  (una sola vez) y escribe las 5 vars del
#                                  stack local (el resto del archivo intacto).
#   scripts/db-local-env.sh off  → restaura el respaldo (vuelve a la nube).
#
# Las keys salen de `supabase status -o env` (deterministas de dev, no
# secretos reales). Nunca imprime valores del archivo original.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
ENV=.env.local
BACKUP=.env.local.nube-backup
SOCKET="unix:///run/user/$(id -u)/podman/podman.sock"
SB=tmp/bin/supabase
VARS='^(DATABASE_URL|DIRECT_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY)='

case "$MODE" in
  on)
    [ -f "$ENV" ] || { echo "✗ no existe $ENV"; exit 1; }
    [ -f "$BACKUP" ] || cp "$ENV" "$BACKUP"
    OUT=$(DOCKER_HOST=$SOCKET "$SB" status --workdir supabase-local -o env)
    ANON=$(echo "$OUT" | grep -E '^(ANON_KEY|PUBLISHABLE_KEY|SUPABASE_ANON_KEY)=' | head -1 | cut -d'=' -f2- | tr -d '"')
    SERVICE=$(echo "$OUT" | grep -E '^(SERVICE_ROLE_KEY|SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)=' | head -1 | cut -d'=' -f2- | tr -d '"')
    if [ -z "$ANON" ] || [ -z "$SERVICE" ]; then
      echo "✗ no se pudieron extraer las keys (¿stack abajo? corre: make db-local-start)"
      exit 1
    fi
    TMP=$(mktemp)
    grep -v -E "$VARS" "$ENV" > "$TMP" || true
    {
      echo "DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres"
      echo "DIRECT_URL=postgresql://postgres:postgres@localhost:54322/postgres"
      echo "NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321"
      echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON"
      echo "SUPABASE_SECRET_KEY=$SERVICE"
    } >> "$TMP"
    mv "$TMP" "$ENV"
    chmod 600 "$ENV" 2>/dev/null || true
    echo "✓ .env.local → Supabase LOCAL (respaldo de la nube en $BACKUP)"
    ;;
  off)
    [ -f "$BACKUP" ] || { echo "✗ no hay respaldo $BACKUP (nunca se hizo on)"; exit 1; }
    cp "$BACKUP" "$ENV"
    echo "✓ .env.local restaurado → Supabase nube (compartida)"
    ;;
  *)
    echo "uso: $0 on|off"
    exit 1
    ;;
esac
