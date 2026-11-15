#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOMAIN="kebab-late-batting.ngrok-free.dev"
PUBLIC_URL="https://${DOMAIN}"
NGROK_PID="tmp/pids/ngrok.pid"
PROXY_PID="tmp/pids/public-proxy.pid"
NGROK_LOG="tmp/logs/ngrok.log"
PROXY_LOG="tmp/logs/public-proxy.log"
AUTH_FILE="tmp/ngrok-auth"
POLICY_FILE="tmp/ngrok-policy.yml"

mkdir -p tmp/pids tmp/logs

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

stop_process() {
  local pid_file="$1"
  local name="$2"
  if is_running "$pid_file"; then
    local pid
    pid="$(cat "$pid_file")"
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    echo "$name: detenido"
  fi
  rm -f "$pid_file"
}

print_access() {
  if [[ -f "$AUTH_FILE" ]]; then
    source "$AUTH_FILE"
    echo "URL pública: $PUBLIC_URL"
    echo "Usuario: ${TUNNEL_USER}"
    echo "Contraseña: ${TUNNEL_PASSWORD}"
    echo "Mini libro: ${PUBLIC_URL}/producto/mini-libros-magneticos"
  else
    echo "URL pública: $PUBLIC_URL"
  fi
}

start_tunnel() {
  command -v ngrok >/dev/null 2>&1 || {
    echo "ngrok no está instalado."
    exit 1
  }
  ngrok config check >/dev/null

  if is_running "$NGROK_PID"; then
    print_access
    exit 0
  fi

  local supabase_status
  supabase_status="$(curl --max-time 5 --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:54321/storage/v1/ || true)"
  if [[ "$supabase_status" == "000" ]]; then
    echo "Supabase LOCAL no responde. Ejecuta primero: make db-local-start"
    exit 1
  fi

  make web-stop >/dev/null || true
  if curl --max-time 2 --silent --output /dev/null http://127.0.0.1:4000/api/health; then
    echo "Hay otro proceso usando el puerto 4000. Deténlo antes de abrir el túnel."
    exit 1
  fi

  if [[ ! -f "$AUTH_FILE" ]]; then
    umask 077
    printf 'TUNNEL_USER=%s\nTUNNEL_PASSWORD=%s\n' \
      "${TUNNEL_USER:-lucams}" \
      "${TUNNEL_PASSWORD:-$(openssl rand -hex 6)}" >"$AUTH_FILE"
  fi
  source "$AUTH_FILE"

  cat >"$POLICY_FILE" <<EOF
on_http_request:
  - expressions:
      - "!(req.url.path.startsWith('/storage/v1/') || req.url.path.startsWith('/auth/v1/') || req.url.path.startsWith('/rest/v1/'))"
    actions:
      - type: basic-auth
        config:
          realm: "Lucams LOCAL"
          credentials:
            - "${TUNNEL_USER}:${TUNNEL_PASSWORD}"
EOF

  echo "Compilando LOCAL con la URL pública…"
  (
    set -a
    source .env.local
    set +a
    export NODE_ENV=production
    export NEXT_PUBLIC_SUPABASE_URL="$PUBLIC_URL"
    export NEXT_PUBLIC_SITE_URL="$PUBLIC_URL"
    pnpm build
  )

  nohup setsid bash -c "
    set -a
    source '$ROOT_DIR/.env.local'
    set +a
    export NODE_ENV=production
    export NEXT_PUBLIC_SUPABASE_URL='$PUBLIC_URL'
    export NEXT_PUBLIC_SITE_URL='$PUBLIC_URL'
    exec pnpm --filter web start
  " >tmp/logs/web-dev.log 2>&1 &
  echo $! >tmp/pids/web-dev.pid

  nohup setsid node scripts/dev-public-proxy.mjs >"$PROXY_LOG" 2>&1 &
  echo $! >"$PROXY_PID"

  nohup setsid ngrok http 4100 \
    --url="$PUBLIC_URL" \
    --traffic-policy-file="$POLICY_FILE" \
    --log=stdout >"$NGROK_LOG" 2>&1 &
  echo $! >"$NGROK_PID"

  local ready=false
  for _ in $(seq 1 45); do
    if ! is_running "$NGROK_PID"; then
      break
    fi
    if curl --max-time 5 --silent --fail --user "${TUNNEL_USER}:${TUNNEL_PASSWORD}" \
      --header "ngrok-skip-browser-warning: true" \
      --output /dev/null "$PUBLIC_URL/api/health"; then
      ready=true
      break
    fi
    sleep 1
  done

  if [[ "$ready" != "true" ]]; then
    echo "El túnel no respondió a tiempo. Revisa tmp/logs/ngrok.log."
    stop_process "$NGROK_PID" "ngrok"
    stop_process "$PROXY_PID" "proxy"
    make web-stop >/dev/null || true
    exit 1
  fi

  print_access
}

stop_tunnel() {
  stop_process "$NGROK_PID" "ngrok"
  stop_process "$PROXY_PID" "proxy"
  make web-stop >/dev/null || true
  rm -f "$POLICY_FILE"
  echo "Túnel detenido. Para volver a LOCAL normal ejecuta: make local-up"
}

status_tunnel() {
  if is_running "$NGROK_PID"; then
    source "$AUTH_FILE"
    if curl --max-time 5 --silent --fail --user "${TUNNEL_USER}:${TUNNEL_PASSWORD}" \
      --header "ngrok-skip-browser-warning: true" \
      --output /dev/null "$PUBLIC_URL/api/health"; then
      echo "Túnel: activo y aplicación saludable"
    else
      echo "Túnel: proceso activo; la aplicación no responde"
    fi
    print_access
  else
    rm -f "$NGROK_PID"
    echo "Túnel: detenido"
  fi
}

case "${1:-}" in
  start) start_tunnel ;;
  stop) stop_tunnel ;;
  status) status_tunnel ;;
  *)
    echo "Uso: bash scripts/dev-tunnel.sh {start|stop|status}"
    exit 1
    ;;
esac
