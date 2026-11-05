.PHONY: help local-up local-down local-status db-local-start db-local-stop db-local-setup db-local-on db-local-off db-local-seed db-local-reset web-start web-stop check verify-db audit-script-guards audit-content test-local test-rls test-e2e test-e2e-fullmode test-load build migrate-cms-v2 seed-products seed-letter-sets seed-admin admin-mfa-reset db-stg-setup db-stg-seed stg-reset stg-reset-apply clean clean-tmp

# Makefile operativo — Lucams Shop
# Orquesta únicamente lo que aporta valor real sobre `pnpm`:
#   1. Entorno local en Podman rootless + Next.js en :4000 (protegiendo volúmenes).
#   2. Gates compuestos de calidad, esquema/RLS y suites contra el stack local.
#   3. Operaciones puntuales de datos/break-glass con carga explícita de .env.local / .env.stg.

SB_LOCAL_SOCK := unix:///run/user/$(shell id -u)/podman/podman.sock
WEB_PID := tmp/pids/web-dev.pid
WEB_LOG := tmp/logs/web-dev.log

help:
	@echo "Lucams Shop — Comandos operativos reales"
	@echo ""
	@echo "  1. Día a día en LOCAL (Podman + Next :4000):"
	@echo "    make local-up         Sube DB local + app Next (:4000)"
	@echo "    make local-down       Baja app + DB local (conserva datos)"
	@echo "    make local-status     Estado de contenedores, keys y PID de :4000"
	@echo "    make web-start/stop   Arranca o detiene solo Next dev (:4000)"
	@echo ""
	@echo "  2. Base de datos LOCAL (Supabase en Podman):"
	@echo "    make db-local-start   Levanta/reanuda contenedores sin perder volúmenes"
	@echo "    make db-local-stop    Apaga contenedores con podman stop nativo"
	@echo "    make db-local-setup   Extensiones + migraciones Prisma y SQL RLS"
	@echo "    make db-local-on/off  Apunta .env.local al stack local o restaura nube"
	@echo "    make db-local-seed    Catálogo + plantillas + ocasiones + fichas + CMS + Contact backfill"
	@echo "    make db-local-reset   Reset TOTAL: borra volúmenes y rehace start+setup+seed"
	@echo ""
	@echo "  3. Verificación, Seguridad y Build:"
	@echo "    make check            Gate rápido pre-push (format:check + typecheck + lint + db tests + guards + CMS)"
	@echo "    make verify-db        Verifica 0 drift Prisma↔SQL y 5/5 invariantes RLS/grants"
	@echo "    make test-local       Suite Vitest completa contra el stack local"
	@echo "    make test-rls         Suite RLS real (rls-coverage + rls-matrix)"
	@echo "    make test-e2e         Playwright E2E"
	@echo "    make test-e2e-fullmode Suite E2E modo full aislada en :4100 (solo LOCAL)"
	@echo "    make test-load        Carga k6 del storefront contra BASE_URL (default :4000)"
	@echo "    make build            Build de producción Next.js (en 4 GB RAM: correr antes make db-local-stop)"
	@echo ""
	@echo "  4. Operaciones puntuales y Staging:"
	@echo "    make migrate-cms-v2   Upsert aditivo del site map CMS v2 en LOCAL"
	@echo "    make seed-products    Catálogo canónico idempotente (seed-catalog-canonical --apply) en LOCAL"
	@echo "    make seed-letter-sets Sets base de fichas (es/en) en LOCAL"
	@echo "    make seed-admin       Alta/reactivación break-glass de AdminUser (EMAIL=...)"
	@echo "    make admin-mfa-reset  Reset MFA break-glass de un admin (EMAIL=...)"
	@echo "    make db-stg-setup     Aplica esquema completo en lucams-stg (.env.stg)"
	@echo "    make db-stg-seed      Siembra catálogo + plantillas + CMS + backfill en lucams-stg"
	@echo "    make stg-reset        Reset TRANSACCIONAL de STG (borra pedidos/clientes/pruebas; conserva catálogo, CMS y superadmin)"
	@echo ""
	@echo "  5. Higiene:"
	@echo "    make clean            Borra .next y cachés de compilación"
	@echo "    make clean-tmp        Depura tmp/ conservando solo bin/, pids/ y logs/"

# ─── 1. Entorno local completo (Podman rootless + Next dev :4000) ───────────

db-local-start:
	systemctl --user enable --now podman.socket
	# Si los contenedores ya existen (apagados con `db-local-stop`), los reanuda
	# con podman nativo CONSERVANDO los datos. Solo si no existen los crea con CLI.
	@N=$$(podman ps -aq --filter name=supabase_ | wc -l); \
	if [ "$$N" -ge 10 ]; then \
		echo "→ Contenedores existentes: reanudando con podman start (datos conservados)"; \
		podman start $$(podman ps -aq --filter name=supabase_); \
	elif [ "$$N" -gt 0 ]; then \
		echo "✗ Stack INCOMPLETO ($$N contenedores). El CLI no puede recrearlo sobre volumen existente en podman."; \
		echo "  Solución: make db-local-reset (rehace el esquema y resiembra datos)."; \
		exit 1; \
	else \
		DOCKER_HOST=$(SB_LOCAL_SOCK) tmp/bin/supabase start --workdir supabase-local -x imgproxy,edge-runtime,realtime; \
	fi

db-local-stop:
	# NO usar `supabase stop`: borra contenedores y choca con volúmenes existentes en podman.
	podman stop $$(podman ps -q --filter name=supabase_) || true

db-local-setup:
	bash scripts/db-local-setup.sh

db-local-on:
	bash scripts/db-local-env.sh on

db-local-off:
	bash scripts/db-local-env.sh off

# Todos los scripts de DB se ejecutan desde packages/db inyectando .env.local explícitamente.
db-local-seed:
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-catalog-canonical.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-templates.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-ocasiones.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-catalog-v2.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-letter-sets.mjs
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/migrate-cms-v2.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/backfill-contacts.mjs --apply

db-local-reset:
	podman stop $$(podman ps -q --filter name=supabase_) || true
	podman rm $$(podman ps -aq --filter name=supabase_) || true
	podman volume rm -f supabase_db_lucams-local supabase_storage_lucams-local || true
	$(MAKE) db-local-start
	$(MAKE) db-local-setup
	$(MAKE) db-local-seed

web-start:
	@mkdir -p tmp/pids tmp/logs
	@if [ -f "$(WEB_PID)" ] && kill -0 $$(cat $(WEB_PID)) 2>/dev/null; then \
		echo "web: ya corriendo (pid $$(cat $(WEB_PID))) → http://localhost:4000"; \
	else \
		rm -f $(WEB_PID); \
		nohup setsid bash -c 'set -a && source .env.local && set +a && exec pnpm --filter web dev' > "$(WEB_LOG)" 2>&1 & echo $$! > $(WEB_PID); \
		echo "web: arrancando (pid $$(cat $(WEB_PID))) — log: $(WEB_LOG)"; \
	fi

web-stop:
	@if [ -f "$(WEB_PID)" ] && kill -0 $$(cat $(WEB_PID)) 2>/dev/null; then \
		kill -- -$$(cat $(WEB_PID)) 2>/dev/null || kill $$(cat $(WEB_PID)); \
		echo "web: detenida"; \
	else \
		echo "web: no estaba corriendo"; \
	fi
	@rm -f $(WEB_PID)

local-up: db-local-start web-start
	@echo "✓ Entorno completo arriba: app http://localhost:4000 · Studio :54323 · Mailpit :54324"

local-down: web-stop db-local-stop
	@echo "✓ Entorno local abajo (los datos de la DB persisten)"

local-status:
	@DOCKER_HOST=$(SB_LOCAL_SOCK) tmp/bin/supabase status --workdir supabase-local || true
	@if [ -f "$(WEB_PID)" ] && kill -0 $$(cat $(WEB_PID)) 2>/dev/null; then \
		echo "web: corriendo (pid $$(cat $(WEB_PID))) → http://localhost:4000"; \
	else \
		rm -f $(WEB_PID); \
		echo "web: detenida"; \
	fi

# ─── 2. Verificación, Seguridad y Build ─────────────────────────────────────

audit-script-guards:
	pnpm --filter @lucams/db exec node scripts/lib/check-script-guards.mjs

audit-content:
	pnpm --filter web exec vitest run lib/cms-sitemap-parity.test.ts

check:
	pnpm format:check
	pnpm -r typecheck
	pnpm -r lint
	pnpm --filter @lucams/db test
	$(MAKE) audit-script-guards
	$(MAKE) audit-content
	@if git grep -niE '\b(para vos|a vos|con vos|tenés|podés|querés|hacés|respondé|escribinos|mandanos|elegí|contá|contanos|contás|usás|generá|creá|marcá|completá|dejala|registrate|corré|ingresá|revisá|configurá|seleccioná)\b' -- 'apps/web/**/*.ts' 'apps/web/**/*.tsx' 'packages/db/scripts/**/*.mjs' | grep -vE '\.test\.|\.integration\.|fix-voseo|check-voseo'; then echo "✗ Se encontró VOSEO en el copy (mandato es-CO tuteo)"; exit 1; fi

verify-db:
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/audit-schema-drift.mjs check
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/verify-security-posture.mjs

test-local:
	pnpm --filter web test

test-rls:
	pnpm --filter web exec vitest run features/security/rls-coverage.integration.test.ts features/security/rls-matrix.integration.test.ts

test-e2e:
	pnpm --filter web test:e2e

test-e2e-fullmode:
	scripts/e2e-fullmode.sh

test-load:
	@command -v k6 >/dev/null 2>&1 || { echo "k6 no instalado. https://k6.io/docs/get-started/installation/"; exit 1; }
	k6 run -e BASE_URL=$${BASE_URL:-http://localhost:4000} tests/load/storefront-browsing.js

build:
	pnpm --filter web build

# ─── 3. Operaciones puntuales y Staging ─────────────────────────────────────

migrate-cms-v2:
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/migrate-cms-v2.mjs --apply

seed-products:
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-catalog-canonical.mjs --apply

seed-letter-sets:
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-letter-sets.mjs

seed-admin:
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-admin.mjs --apply

admin-mfa-reset:
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/admin-mfa-reset.mjs --apply

db-stg-setup:
	bash scripts/db-stg-setup.sh

stg-reset:
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/stg-reset-transactional.mjs

stg-reset-apply:
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/stg-reset-transactional.mjs --apply

db-stg-seed:
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-catalog-canonical.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-templates.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-ocasiones.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-catalog-v2.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-letter-sets.mjs
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/migrate-cms-v2.mjs --apply
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/backfill-contacts.mjs --apply

# ─── 4. Higiene ─────────────────────────────────────────────────────────────

clean:
	rm -rf apps/web/.next apps/web/node_modules/.cache

clean-tmp:
	@du -sh tmp 2>/dev/null || true
	cd tmp && ls -A | grep -vE '^(bin|pids|logs)$$' | xargs rm -rf
	@echo "✓ tmp/ depurado (conservados: bin/, pids/, logs/)"
