.PHONY: help install build typecheck lint format migrate seed-products seed-templates test test-unit test-e2e test-rls test-load test-coverage clean

# Makefile en repo — targets primitivos para CI y devs locales.
# El Makefile completo de runtime (con state/log/pid management,
# health checks, etc.) vive fuera del repo en
# /home/ansible/workspaces/lucams-shop-local/Makefile.

help:
	@echo "Lucams_shop — targets de build/test (no runtime)"
	@echo ""
	@echo "  make install      pnpm install --frozen-lockfile"
	@echo "  make build        Next.js production build"
	@echo "  make typecheck    tsc --noEmit en apps/web"
	@echo "  make lint         ESLint"
	@echo "  make format       Prettier --write"
	@echo "  make migrate      pnpm prisma migrate deploy"
	@echo "  make seed-products  Pobla catálogo demo (idempotente)"
	@echo "  make seed-templates Pobla plantillas Estudio Personalización"
	@echo ""
	@echo "  Tests (Vitest/Playwright se setean en sub-bloques siguientes):"
	@echo "    make test         Todos los tests"
	@echo "    make test-unit    Vitest"
	@echo "    make test-e2e     Playwright"
	@echo "    make test-rls     RLS impostor"

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

seed-products:
	pnpm --filter @lucams/db exec node scripts/seed-products.mjs

seed-templates:
	pnpm --filter @lucams/db exec node scripts/seed-templates.mjs

test: test-unit test-e2e

test-unit:
	pnpm --filter web test

test-e2e:
	pnpm --filter web test:e2e

test-coverage:
	pnpm --filter web test:coverage

test-rls:
	@echo "RLS automated tests pendientes — sub-bloque L (QA exhaustivo)"

test-load:
	@command -v k6 >/dev/null 2>&1 || { echo "k6 no instalado. https://k6.io/docs/get-started/installation/"; exit 1; }
	k6 run tests/load/storefront-browsing.js

clean:
	rm -rf apps/web/.next apps/web/node_modules/.cache
