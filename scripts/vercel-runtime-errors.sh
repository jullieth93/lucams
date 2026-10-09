#!/usr/bin/env bash
# scripts/vercel-runtime-errors.sh — escaneo de errores de runtime de Vercel SIN depender de la DB.
#
# Por qué existe (incidente 2026-10-08): ErrorLog/ErrorReport viven en la misma DB que
# monitorean — cuando el pooler de Supabase flapea (P1001) o el pool Prisma se satura
# (P2024), el registro de errores muere junto con la falla y /admin/observability queda
# ciego (ErrorLog estuvo vacío 18 días mientras los errores ocurrían). La verdad residual
# está en el stdout de las lambdas → logs de Vercel (sin drain; retención corta).
#
# Uso:
#   bash scripts/vercel-runtime-errors.sh [alias] [segundos]
#     alias    default lucamsshop.com (PRD); para STG:
#              bash scripts/vercel-runtime-errors.sh lucams-shop-git-develop-jullieth93s-projects.vercel.app 300
#     segundos ventana de captura (default 180) — el CLI solo STREAMEA logs nuevos,
#              así que la ventana debe cubrir tráfico real (o generarlo).
#
# Salida: conteos por patrón + las primeras ocurrencias de cada uno. Read-only.
set -euo pipefail

ALIAS="${1:-lucamsshop.com}"
SECS="${2:-180}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "→ Capturando logs de $ALIAS durante ${SECS}s…"
timeout "$SECS" vercel logs "$ALIAS" > "$TMP/logs.txt" 2>&1 || true

LINES=$(wc -l < "$TMP/logs.txt")
echo "→ Captura: $LINES líneas"

report() {
  local label="$1" pattern="$2"
  local n
  n=$(grep -cE "$pattern" "$TMP/logs.txt" || true)
  printf "%-58s %s\n" "$label" "$n"
  if [ "$n" -gt 0 ]; then
    grep -E "$pattern" "$TMP/logs.txt" | head -3 | sed 's/^/    /'
  fi
}

echo
echo "=== Patrones de error (incidente 2026-10-08) ==="
report "P1001 pooler inalcanzable (Can't reach database)" "Can't reach database server"
report "P2024 pool Prisma agotado (connection pool timeout)" "Timed out fetching a new connection"
report "P1017 server closed connection" "P1017|server closed the connection"
report "server.error (onRequestError)" '"event":"server.error"'
report "observability.capture_fail (ErrorLog no pudo escribir)" "observability.capture_fail"
report "Invalid Server Actions request (deploy skew)" "Invalid Server Actions request"
report "5xx explícitos en el stream" "🚫"

echo
echo "=== Requests por minuto (muestra de volumen) ==="
grep -oE '^[0-9]{2}:[0-9]{2}' "$TMP/logs.txt" | sort | uniq -c | tail -10 || true

echo
echo "Nota: si los conteos salen en 0 con tráfico real, la ventana está sana."
echo "Para correlación fina usa los request IDs (x-vercel-id) de los probes curl."
