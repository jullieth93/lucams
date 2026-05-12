.PHONY: help install build typecheck lint format migrate seed-products test test-unit test-e2e test-rls clean

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

test: test-unit test-e2e test-rls

test-unit:
	@if pnpm --filter web run 2>&1 | grep -q "test:unit"; then \
		pnpm --filter web test:unit; \
	else \
		echo "test:unit no configurado todavía (sub-bloque H)"; \
	fi

test-e2e:
	@if pnpm --filter web run 2>&1 | grep -q "test:e2e"; then \
		pnpm --filter web test:e2e; \
	else \
		echo "test:e2e no configurado todavía (sub-bloque H)"; \
	fi

test-rls:
	@if pnpm --filter web run 2>&1 | grep -q "test:rls"; then \
		pnpm --filter web test:rls; \
	else \
		echo "test:rls no configurado todavía (sub-bloque H)"; \
	fi

clean:
	rm -rf apps/web/.next apps/web/node_modules/.cache
