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
    grep -v -E "$VARS" "$ENV" | grep -v -E '^# ─── Supabase ───' > "$TMP" || true
    # Las 5 vars van en su sección con comentarios (antes quedaban sueltas al
    # final del archivo, bajo la sección equivocada). La URL pública usa la IP
    # de red: el navegador (de este u otro dispositivo) llama DIRECTO a la API
    # de Supabase — con `localhost` solo funcionaría navegando en la propia VM.
    # Las URLs de DB quedan en localhost: las consumen procesos EN la VM
    # (prisma/scripts) y así no dependen de la IP, que puede cambiar.
    LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    SB_URL="http://${LAN_IP:-localhost}:54321"
    {
      echo "# ─── Supabase ───"
      echo "DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres  # conexión app (Prisma) — SOLO servidor"
      echo "DIRECT_URL=postgresql://postgres:postgres@localhost:54322/postgres    # conexión directa DDL (prisma migrate, scripts) — SOLO servidor"
      echo "NEXT_PUBLIC_SUPABASE_URL=$SB_URL  # URL base APIs Supabase (auth/rest/storage). IP de red = navegas desde cualquier dispositivo de tu LAN"
      echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON  # llave pública (rol anon) — puede ir al navegador; RLS/grants protegen la data"
      echo "SUPABASE_SECRET_KEY=$SERVICE  # llave secreta (service_role, bypass RLS) — SOLO servidor, jamás NEXT_PUBLIC"
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
