.PHONY: help install build typecheck lint format migrate db-local-start db-local-stop db-local-restart db-local-reset db-local-status db-local-setup db-local-on db-local-off db-local-seed web-start web-stop web-restart local-up local-down local-restart local-status test-local db-stg-setup db-stg-seed seed-products seed-templates seed-ocasiones seed-catalog-v2 migrate-cms-v2 seed-abecedario seed-letter-sets cleanup-test-junk seed-separadores consolidate-product-families update-legal-ley-2439 seed-legal-2026-07 fix-voseo-cms rename-family-base-slugs backfill-variant-prices cleanup-slugs audit-slugs audit-content test test-unit test-e2e test-rls test-load test-coverage clean fix-fotoimanes

# Makefile del repo — build/test para CI y devs, más el runtime del entorno
# local completo: Supabase local en podman (grupo db-local-*) y app Next
# (grupos web-* / local-*), con state/log/pid en tmp/ (gitignored).

help:
	@echo "Lucams_shop — build/test + entorno local (DB podman + app Next)"
	@echo ""
	@echo "  make install      pnpm install --frozen-lockfile"
	@echo "  make build        Next.js production build"
	@echo "  make typecheck    tsc --noEmit en apps/web"
	@echo "  make lint         ESLint"
	@echo "  make format       Prettier --write"
	@echo "  make migrate      pnpm prisma migrate deploy"
	@echo "  make seed-products    Pobla catálogo demo base (idempotente)"
	@echo "  make seed-templates   Pobla plantillas Estudio Personalización"
	@echo "  make seed-ocasiones   Pobla 15 OcasionTag (PLAN_CATALOG_V2 1.5)"
	@echo "  make seed-catalog-v2  Delta PLAN_CATALOG_V2 (sub-cats + placeholders + links)"
	@echo "  make migrate-cms-v2   Upsert del site map CMS v2 (idempotente)"
	@echo "  make seed-abecedario  Abecedario a 3 productos (ADR-057, idempotente)"
	@echo ""
	@echo "  Entorno local (Supabase local en podman, espejo de la nube):"
	@echo "    make db-local-start   Levanta el stack (reanuda si ya existe)"
	@echo "    make db-local-stop    Apaga conservando contenedores y datos"
	@echo "    make db-local-reset   Reset TOTAL: borra volúmenes y rehace todo"
	@echo "    make db-local-status  Estado y keys del stack local"
	@echo "    make db-local-setup   Extensiones + migraciones en el stack local"
	@echo "    make db-local-on/off  .env.local ↔ stack local / nube compartida"
	@echo "    make db-local-seed    Catálogo + plantillas + CMS en el stack local"
	@echo ""
	@echo "  App Next y entorno completo:"
	@echo "    make web-start/stop   App en :4000 (nohup; log en tmp/logs/)"
	@echo "    make local-up/down    Sube/baja TODO (DB + GUIs + app)"
	@echo "    make local-status     Estado del entorno completo"
	@echo "    make test-local       Suite vitest contra el stack local"
	@echo ""
	@echo "  Staging (nube Free — requiere .env.stg):"
	@echo "    make db-stg-setup     Esquema completo en lucams-stg"
	@echo "    make db-stg-seed      Catálogo + plantillas + CMS en lucams-stg"
	@echo ""
	@echo "  Tests (Vitest/Playwright se setean en sub-bloques siguientes):"
	@echo "    make test         Todos los tests"
	@echo "    make test-unit    Vitest"
	@echo "    make test-e2e     Playwright"
	@echo "    make test-rls     Tests RLS (rls-coverage + rls-matrix, vía vitest)"

install:
	pnpm install --frozen-lockfile

build:
	pnpm --filter web build

typecheck:
	pnpm --filter web typecheck

lint:
	pnpm --filter web lint

format:
	pnpm format

migrate:
	pnpm --filter @lucams/db db:migrate:deploy

# ─── Supabase LOCAL para dev diario (espejo de la nube, podman rootless) ───
# Flujo: make db-local-start → make db-local-setup → make db-local-on →
#        make db-local-seed → (trabajar) → make db-local-off / db-local-stop.
# El CLI (2.111.0, la misma de CI) vive en tmp/bin/supabase (herramienta local
# gitignored); el socket es el de podman del usuario.

SB_LOCAL_SOCK := unix:///run/user/$(shell id -u)/podman/podman.sock

db-local-start: ## Levanta el stack Supabase local (reanuda si ya existe; lo crea si no)
	systemctl --user enable --now podman.socket
	# Si los contenedores ya existen (apagados con `db-local-stop`), los reanuda
	# con podman nativo CONSERVANDO los datos. Solo si no existen crea el stack
	# con el CLI (que en podman falla si el volumen ya existe — ver db-local-stop).
	# Si faltan contenedores (ej. uno borrado a mano), el CLI tampoco puede
	# recrearlo sin chocar con el bug del volumen → toca db-local-reset.
	@N=$$(podman ps -aq --filter name=supabase_ | wc -l); \
	if [ "$$N" -ge 10 ]; then \
		echo "→ Contenedores existentes: reanudando con podman start (datos conservados)"; \
		podman start $$(podman ps -aq --filter name=supabase_); \
	elif [ "$$N" -gt 0 ]; then \
		echo "✗ Stack INCOMPLETO ($$N contenedores — falta alguno). El CLI no puede recrearlo en podman (bug del volumen)."; \
		echo "  Solución: make db-local-reset (rehace todo conservando el esquema del repo; los datos se resiembran)."; \
		exit 1; \
	else \
		DOCKER_HOST=$(SB_LOCAL_SOCK) tmp/bin/supabase start --workdir supabase-local -x imgproxy,edge-runtime,realtime; \
	fi

db-local-stop: ## Apaga el stack CONSERVANDO contenedores y datos (podman stop nativo)
	# OJO: NO usar `supabase stop` (CLI) para el apagado diario — esa vía BORRA los
	# contenedores, y al volver (`db-local-start`) el CLI intenta crear el volumen
	# ya existente y falla en podman ("volume already exists") → fuerza un reset
	# con pérdida de datos. Con `podman stop` los contenedores quedan y
	# `db-local-start` los reanuda tal cual.
	podman stop $$(podman ps -q --filter name=supabase_) || true

db-local-restart: ## Reinicia el stack CONSERVANDO datos (podman stop/start nativo)
	podman stop $$(podman ps -q --filter name=supabase_) || true
	podman start $$(podman ps -aq --filter name=supabase_)

db-local-reset: ## Reset TOTAL: borra los volúmenes y rehace todo (start+setup+seed)
	podman stop $$(podman ps -q --filter name=supabase_) || true
	podman rm $$(podman ps -aq --filter name=supabase_) || true
	podman volume rm -f supabase_db_lucams-local supabase_storage_lucams-local || true
	$(MAKE) db-local-start
	$(MAKE) db-local-setup
	$(MAKE) db-local-seed

db-local-status: ## Estado y keys del stack local
	DOCKER_HOST=$(SB_LOCAL_SOCK) tmp/bin/supabase status --workdir supabase-local

# ─── App web (Next dev) y entorno local COMPLETO (DB + app) ─────────────────
# La app corre con nohup + setsid (grupo de procesos propio → el stop mata el
# grupo entero: pnpm → next → workers). PID en tmp/pids, log en tmp/logs
# (tmp/ está gitignored). El PORT sale de .env.local exportado al shell (un
# `pnpm dev` pelado arranca en :3000 — Next NO lee PORT del .env).

WEB_PID := tmp/pids/web-dev.pid
WEB_LOG := tmp/logs/web-dev.log

web-start: ## Levanta la app Next en :4000 (nohup; log en tmp/logs/web-dev.log)
	@mkdir -p tmp/pids tmp/logs
	@if [ -f "$(WEB_PID)" ] && kill -0 $$(cat $(WEB_PID)) 2>/dev/null; then \
		echo "web: ya corriendo (pid $$(cat $(WEB_PID))) → http://localhost:4000"; \
	else \
		nohup setsid bash -c 'set -a && source .env.local && set +a && exec pnpm --filter web dev' > "$(WEB_LOG)" 2>&1 & echo $$! > $(WEB_PID); \
		echo "web: arrancando (pid $$(cat $(WEB_PID))) — log: $(WEB_LOG)"; \
	fi

web-stop: ## Apaga la app Next (mata el grupo de procesos completo)
	@if [ -f "$(WEB_PID)" ] && kill -0 $$(cat $(WEB_PID)) 2>/dev/null; then \
		kill -- -$$(cat $(WEB_PID)) 2>/dev/null || kill $$(cat $(WEB_PID)); \
		echo "web: detenida"; \
	else \
		echo "web: no estaba corriendo"; \
	fi
	@rm -f $(WEB_PID)

web-restart: web-stop web-start ## Reinicia la app Next

local-up: db-local-start web-start ## Sube TODO el entorno local (DB + GUIs + app)
	@echo "✓ Entorno completo: app http://localhost:4000 · Studio :54323 · Mailpit :54324"

local-down: web-stop db-local-stop ## Baja TODO el entorno local (los datos de la DB persisten)
	@echo "✓ Entorno local abajo (los datos de la DB persisten)"

local-restart: db-local-restart web-restart ## Reinicia TODO el entorno local conservando datos

local-status: ## Estado del entorno completo (DB + app)
	@$(MAKE) db-local-status || true
	@if [ -f "$(WEB_PID)" ] && kill -0 $$(cat $(WEB_PID)) 2>/dev/null; then \
		echo "web: corriendo (pid $$(cat $(WEB_PID))) → http://localhost:4000"; \
	else \
		echo "web: detenida"; \
	fi

db-local-setup: ## Extensiones + prisma migrate + supabase/migrations (orden CI)
	bash scripts/db-local-setup.sh

db-local-on: ## .env.local → stack local (respaldo en .env.local.nube-backup)
	bash scripts/db-local-env.sh on

db-local-off: ## .env.local → nube compartida (restaura el respaldo)
	bash scripts/db-local-env.sh off

db-local-seed: ## Catálogo + plantillas + ocasiones + CMS en el stack local
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-products.mjs
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-templates.mjs
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-ocasiones.mjs
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/seed-catalog-v2.mjs
	cd packages/db && npx dotenv -e ../../.env.local -- node scripts/migrate-cms-v2.mjs

db-stg-setup: ## Esquema completo en lucams-stg (nube Free) — requiere .env.stg
	bash scripts/db-stg-setup.sh

db-stg-seed: ## Catálogo + plantillas + ocasiones + CMS en lucams-stg
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-products.mjs
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-templates.mjs
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-ocasiones.mjs
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/seed-catalog-v2.mjs
	cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/migrate-cms-v2.mjs

test-local: ## Suite vitest contra el stack local (excluye las 2 suites de la DB compartida)
	NIGHTLY_LOCALSTACK=1 pnpm --filter web test

seed-products:
	pnpm --filter @lucams/db exec node scripts/seed-products.mjs

seed-templates:
	pnpm --filter @lucams/db exec node scripts/seed-templates.mjs

# PLAN_CATALOG_V2 decisión 1.5 + 2.10 + 3.4 — 15 OcasionTag.
seed-ocasiones:
	pnpm --filter @lucams/db exec node scripts/seed-ocasiones.mjs

# PLAN_CATALOG_V2 delta — sub-categorías jerárquicas + categoría Separadores +
# productos placeholder + ProductOcasionTag default links + enriquecimiento
# productos existentes (physicalSpecs / idealFor / productionDays). Idempotente.
seed-catalog-v2:
	pnpm --filter @lucams/db exec node scripts/seed-catalog-v2.mjs

# CMS v2 — upsert del site map (páginas/secciones/campos nuevos) al modelo
# Página→Sección→Campo. Idempotente; no pisa ediciones hechas en v2.
# (Tras A2 las tablas legacy ya no existen: el paso de migración vieja→nueva
# se salta solo — solo queda el upsert del mapa.)
migrate-cms-v2:
	pnpm --filter @lucams/db exec node scripts/migrate-cms-v2.mjs

# ADR-057 — Abecedario a 3 productos (Completo / Pack Vocales / Nombre Personalizado)
# con variantes idioma × tamaño × imantado. Reproducible; no pisa precios editados en
# admin; archiva los productos viejos. Idempotente.
seed-abecedario:
	pnpm --filter @lucams/db exec node scripts/restructure-abecedario.mjs

# Limpieza de fixtures de tests filtrados a la BD (categorías "Cat …" etc.). Dry-run por
# defecto; APPLY=1 ejecuta. Seguro y scoped: nunca toca categorías reales; soft-delete si
# hay órdenes de por medio.
cleanup-test-junk:
	pnpm --filter @lucams/db exec node scripts/cleanup-test-junk.mjs $(if $(APPLY),--apply,)

# ADR-057 — Sets de fichas por defecto (es/en), vacíos y listos para subir en el admin.
seed-letter-sets:
	pnpm --filter @lucams/db exec node scripts/seed-letter-sets.mjs

# M.3.b.CAT.2 (2026-05-14): consolida familias de productos fragmentados
# en variants del producto base. Soft-deletea hermanos + migra reviews +
# genera apps/web/lib/product-redirects.ts. Idempotente.
consolidate-product-families:
	pnpm --filter @lucams/db exec node scripts/consolidate-product-families.mjs

# ONE-SHOT (2026-05-13): actualiza /legal/* con texto Ley 2439/2024.
# Preserva ediciones manuales (heurística: solo actualiza body que matchea seed v1).
# Después de correr una vez, este target queda para histórico.
update-legal-ley-2439:
	pnpm --filter @lucams/db exec node scripts/update-legal-ley-2439.mjs

# Barrido legal 2026-07 (ADR-072): publica los 8 bloques legal.* compliant desde
# packages/db/legal-content/*.md (persona natural, Ley 1581/1480/2439, IVA régimen-agnóstico,
# subprocesadores reales). Reproducible: correr contra la BD de PROD al lanzar.
seed-legal-2026-07:
	pnpm --filter @lucams/db exec node scripts/seed-legal-content-2026-07.mjs

# ONE-SHOT (2026-05-18): elimina voseo (argentino/uruguayo) de CmsBlock,
# CmsBlockVersion, SiteSetting, Product.description y OcasionTag.description.
# Idempotente — si no hay voseo, no escribe nada. Aplica word-boundary
# regex para no tocar palabras como "automáticamente". Tras correr,
# reiniciar dev o publicar cualquier bloque para invalidar cache CMS.
fix-voseo-cms:
	pnpm --filter @lucams/db exec node scripts/fix-voseo-cms.mjs

# ONE-SHOT (2026-05-18): renombra los slugs base de familias consolidadas
# para que queden limpios (sin sufijos numéricos del producto inicial).
# Agrega redirect 301 del slug viejo al nuevo. Idempotente.
rename-family-base-slugs:
	pnpm --filter @lucams/db exec node scripts/rename-family-base-slugs.mjs

# ONE-SHOT (2026-05-18): rescata el price de los siblings soft-deleted
# y lo aplica a las variants creadas por consolidate-product-families.
# Sin esto las variants heredan basePrice → selector no muestra cambio
# de precio. Idempotente: no toca variants con price ya seteado.
backfill-variant-prices:
	pnpm --filter @lucams/db exec node scripts/backfill-variant-prices.mjs

# ONE-SHOT (2026-05-18): limpia slugs sucios del catálogo (sufijos
# numéricos -x12 / -100 / -20x20 / -6cm, anglicismos glass→vidrio).
# Auto-genera redirects 301. Idempotente.
cleanup-slugs:
	pnpm --filter @lucams/db exec node scripts/cleanup-slugs.mjs

# Dump de slugs activos (productos + categorías) para auditoría.
audit-slugs:
	pnpm --filter @lucams/db exec node scripts/audit-slugs.mjs

# Auditoría de cobertura de contenido (roadmap D1): reporte local.
# El gate vive en CI (job quality) corriendo el script con --check.
audit-content:
	pnpm --filter @lucams/db exec node scripts/audit-content-coverage.mjs

test: test-unit test-e2e

test-unit:
	pnpm --filter web test

test-e2e:
	pnpm --filter web test:e2e

test-coverage:
	pnpm --filter web test:coverage

# Tests RLS reales vía vitest: rls-coverage (toda tabla de public con RLS — gate por-PR)
# + rls-matrix (comportamiento de las policies — nightly; se salta limpio sin Supabase real).
test-rls:
	pnpm --filter web exec vitest run features/security/rls-coverage.integration.test.ts features/security/rls-matrix.integration.test.ts

test-load:
	@command -v k6 >/dev/null 2>&1 || { echo "k6 no instalado. https://k6.io/docs/get-started/installation/"; exit 1; }
	k6 run tests/load/storefront-browsing.js

clean:
	rm -rf apps/web/.next apps/web/node_modules/.cache

seed-separadores:
	pnpm --filter @lucams/db exec node scripts/restructure-separadores.mjs

fix-fotoimanes:
	pnpm --filter @lucams/db exec node scripts/fix-fotoimanes-aspects.mjs
