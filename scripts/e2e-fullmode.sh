#!/usr/bin/env bash
# Suite E2E modo FULL (Etapa 2 — docs/PROMPT_E2E_HOMOLOGACION.md §7.5). LOCAL only.
#
# Levanta un dev server DEDICADO en :4100 con NEXT_PUBLIC_STORE_MODE=full (el
# stack catálogo de :4000 no se toca — Next 16 dev permite UN solo servidor por
# proyecto, así que el script baja el web-dev del repo si está arriba) y corre
# los specs `fullmode-*` contra él con PLAYWRIGHT_BASE_URL.
#
#   scripts/e2e-fullmode.sh [args extra de playwright…]
#
# Decisiones documentadas:
#  - RESEND_API_KEY= vacío en el server full A PROPÓSITO: los emails
#    transaccionales se certifican por su contrato best-effort (la orden
#    completa aunque el envío se salte) sin mandar correos reales a
#    direcciones sintéticas. La vía live (4242 sandbox + correo real) la cubre
#    tests/e2e/wompi-sandbox.spec.ts.
#  - Wompi/Aveonline usan las llaves sandbox/test de .env.local (WOMPI_ENV=sandbox,
#    AVEONLINE_ENV=test): la cotización y la guía contraentrega pegan al sandbox
#    real (NO facturable: bloquegenerarguia=1, doble gate en aveonline.ts).
#  - E2E_AUTH=1: el global.setup crea admin+cliente efímeros (service role del
#    stack local) y los storageState aplican a :4100 (cookies por dominio).
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${FULLMODE_PORT:-4100}"
PID_FILE="tmp/pids/web-fullmode.pid"
LOG="tmp/logs/web-fullmode-dev.log"
mkdir -p tmp/pids tmp/logs

# Un solo `next dev` por proyecto: si el web-dev del repo está arriba, se baja
# (es un servidor de desarrollo trivialmente reiniciable con `make web-start`).
if [ -f tmp/pids/web-dev.pid ] && kill -0 "$(cat tmp/pids/web-dev.pid)" 2>/dev/null; then
  echo "fullmode: bajando el web-dev de :4000 (lock de next dev; `make web-start` lo restaura)"
  make -s web-stop >/dev/null
fi

STARTED=""
if curl -sf -o /dev/null --max-time 3 "http://localhost:${PORT}/api/health"; then
  echo "fullmode: reutilizando el server ya activo en :${PORT}"
else
  echo "fullmode: levantando dev server en :${PORT} (NEXT_PUBLIC_STORE_MODE=full) — log: ${LOG}"
  nohup setsid bash -c "cd apps/web && exec env NEXT_PUBLIC_STORE_MODE=full RESEND_API_KEY= PORT=${PORT} pnpm dev" >"${LOG}" 2>&1 &
  echo $! >"${PID_FILE}"
  STARTED=1
  for i in $(seq 1 60); do
    if curl -sf -o /dev/null --max-time 3 "http://localhost:${PORT}/api/health"; then break; fi
    if [ "$i" = 60 ]; then
      echo "fullmode: el server no respondió en 120 s — revisa ${LOG}" >&2
      exit 1
    fi
    sleep 2
  done
fi

cleanup() {
  if [ -n "$STARTED" ]; then
    if [ -f "${PID_FILE}" ]; then
      kill -- -"$(cat "${PID_FILE}")" 2>/dev/null || kill "$(cat "${PID_FILE}")" 2>/dev/null || true
      rm -f "${PID_FILE}"
    fi
    # Fallback por puerto: si la corrida murió por timeout/señal el grupo no se
    # mató y el server quedó escuchando (reproducido 2026-08-07: un timeout dejó
    # el dev server vivo y el lock de next dev bloqueó la corrida siguiente).
    sleep 1
    PIDS=$(ss -tlnHp "sport = :${PORT}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
    if [ -n "${PIDS}" ]; then kill ${PIDS} 2>/dev/null || true; fi
    echo "fullmode: server :${PORT} detenido"
  fi
}
trap cleanup EXIT

cd apps/web
# Sin args: la suite fullmode-* completa. Con args: los filtros dados (p.ej.
# `scripts/e2e-fullmode.sh wompi-sandbox` para la certificación live 4242).
if [ "$#" -gt 0 ]; then
  FILTERS=("$@")
else
  FILTERS=("fullmode-")
fi
NEXT_PUBLIC_STORE_MODE=full \
PLAYWRIGHT_BASE_URL="http://localhost:${PORT}" \
E2E_ENV=local E2E_AUTH=1 \
  pnpm exec playwright test "${FILTERS[@]}"
