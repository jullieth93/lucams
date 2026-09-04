# apps/web — Storefront + admin Lucams_shop

Aplicación Next.js 16 (App Router) del e-commerce: storefront público, panel `/admin`,
Estudio de Personalización (`app/estudio/`), checkout y APIs. Parte del monorepo pnpm;
el ORM y los seeds viven en `packages/db`.

## Comandos

Desde la **raíz del repo** (recomendado — ver `Makefile`):

```bash
make web-start     # dev server en http://localhost:4000 (nohup; log en tmp/logs/)
make build         # build de producción (genera el cliente Prisma primero)
make test-unit     # vitest
make test-e2e      # playwright
make typecheck     # tsc --noEmit
make lint          # eslint --max-warnings 0
```

Equivalentes directos (desde la raíz con `--filter`, o parado en `apps/web`):

| Script          | Comando                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `dev`           | `pnpm --filter web dev` (arranca en :3000 — Next no lee `PORT` del .env; `make web-start` sí lo exporta y usa :4000) |
| `build`         | `pnpm --filter web build`                                                                                            |
| `start`         | `pnpm --filter web start`                                                                                            |
| `lint`          | `pnpm --filter web lint`                                                                                             |
| `typecheck`     | `pnpm --filter web typecheck`                                                                                        |
| `test`          | `pnpm --filter web test` (vitest run)                                                                                |
| `test:watch`    | vitest en modo watch                                                                                                 |
| `test:coverage` | vitest con cobertura                                                                                                 |
| `test:e2e`      | Playwright                                                                                                           |
| `test:e2e:ui`   | Playwright con UI interactiva                                                                                        |
| `db:backup`     | backup cifrado de la DB a R2 (`scripts/backup-db-to-r2.mjs`)                                                         |

La app necesita variables de entorno: `.env.local` en la **raíz del repo**
(ver [docs/OPERATIONS.md](../../docs/OPERATIONS.md)). Para la DB local:
`make db-local-start && make db-local-setup && make db-local-on && make db-local-seed`.

## Estructura

```
apps/web/
├── app/            # Rutas App Router: storefront, /admin, /estudio, /api, /legal…
├── assets/fonts/   # TTF de marca (Fredoka/Inter) para render server-side (canvas/sharp)
├── components/     # Componentes compartidos (ui/ shadcn + brand, header, home…)
├── features/       # Lógica de dominio por feature (cart, checkout, orders, cms,
│                   #   personalization, ai, payments, shipping, security…)
├── lib/            # Utilidades transversales (supabase clients, cms readers, seguridad)
├── public/         # Assets estáticos (brand/, icons/, templates/ del Estudio)
├── tests/          # e2e/ (Playwright) + fixtures/stubs; los unit/integration
│                   #   viven colocados junto al código (*.test.ts)
├── scripts/        # Utilidades operativas (backup DB → R2, DR drill)
├── proxy.ts        # Proxy de requests (redirects 301, guards)
└── types/          # Tipos compartidos
```

## Notas

- Tailwind v4 CSS-first: los tokens de marca están en `app/globals.css` (`@theme`),
  documentados en [docs/BRANDING.md](../../docs/BRANDING.md).
- Fuentes: Fredoka (display) + Inter (body) vía `next/font/google` en `app/layout.tsx`.
- El Estudio de Personalización tiene su propio README: `app/estudio/[slug]/README.md`.
- Este repo usa APIs nuevas de Next 16 — ver `AGENTS.md` de esta carpeta antes de codear.
