.PHONY: help install build typecheck lint format migrate seed-products seed-templates seed-ocasiones seed-catalog-v2 seed-cms consolidate-product-families fix-voseo-cms rename-family-base-slugs backfill-variant-prices cleanup-slugs audit-slugs test test-unit test-e2e test-rls test-load test-coverage clean

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
	@echo "  make seed-products    Pobla catálogo demo base (idempotente)"
	@echo "  make seed-templates   Pobla plantillas Estudio Personalización"
	@echo "  make seed-ocasiones   Pobla 15 OcasionTag (PLAN_CATALOG_V2 1.5)"
	@echo "  make seed-catalog-v2  Delta PLAN_CATALOG_V2 (sub-cats + placeholders + links)"
	@echo "  make seed-cms         Pobla CmsBlocks + SiteSettings (J.1+)"
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

# PLAN_CATALOG_V2 decisión 1.5 + 2.10 + 3.4 — 15 OcasionTag.
seed-ocasiones:
	pnpm --filter @lucams/db exec node scripts/seed-ocasiones.mjs

# PLAN_CATALOG_V2 delta — sub-categorías jerárquicas + categoría Separadores +
# productos placeholder + ProductOcasionTag default links + enriquecimiento
# productos existentes (physicalSpecs / idealFor / productionDays). Idempotente.
seed-catalog-v2:
	pnpm --filter @lucams/db exec node scripts/seed-catalog-v2.mjs

seed-cms:
	pnpm --filter @lucams/db exec node scripts/seed-cms.mjs

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
