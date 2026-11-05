# `apps/web` — Storefront, Estudio y Panel Admin de Lucams Shop

Aplicación Next.js 16 (App Router) del monorepo `lucams_shop`: tienda pública, Estudio de
Personalización 2D/3D (`app/estudio/[slug]`), checkout transaccional, portales posventa por token,
panel operativo `/admin` y Route Handlers `/api/*`. El cliente Prisma, las migraciones y las
semillas viven en `packages/db`.

## Comandos habituales

Ejecuta preferiblemente desde la **raíz del repositorio** mediante `Makefile`:

```bash
make local-up      # levanta Supabase local + dev server en http://localhost:4000
make web-start     # arranca solo el dev server en :4000 (nohup gestionado; log en tmp/logs/)
make check         # gate pre-push: format:check + typecheck + lint + db tests + guards + CMS
make test-local    # suite Vitest completa contra el stack local
make test-rls      # suite real de aislamiento RLS contra Supabase local
make test-e2e      # suite Playwright E2E
make build         # build de producción (en hosts con ≤4 GB RAM: correr antes make db-local-stop)
```

Scripts directos en `apps/web/package.json` (`pnpm --filter web <script>` desde la raíz, o parado en
`apps/web`):

| Script                  | Comando / Acción                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `dev`                   | `pnpm --filter web dev` — arranca en `:3000` (Next.js no lee `PORT` de `.env`; `make web-start` exporta `PORT=4000` explícito) |
| `build`                 | `pnpm --filter web build` (`prisma generate && next build`)                                                                    |
| `start`                 | `pnpm --filter web start` — servidor Node de producción                                                                        |
| `lint`                  | `pnpm --filter web lint` (`eslint --max-warnings 0`)                                                                           |
| `typecheck`             | `pnpm --filter web typecheck` (`tsc --noEmit`)                                                                                 |
| `test`                  | `pnpm --filter web test` (`vitest run`: unitarios e integración colocados junto al código `*.test.ts(x)`)                      |
| `test:watch`            | `pnpm --filter web test:watch` — Vitest en modo interactivo                                                                    |
| `test:coverage`         | `pnpm --filter web test:coverage` — Vitest con umbrales V8 de cobertura                                                        |
| `test:e2e`              | `pnpm --filter web test:e2e` — suite Playwright (`apps/web/tests/e2e/`)                                                        |
| `test:e2e:ui`           | `pnpm --filter web test:e2e:ui` — Playwright con interfaz interactiva                                                          |
| `test:audit-responsive` | Auditoría responsive en 6 perfiles de viewport (`desktop`, `tablet`, `mobile` × portrait/landscape)                            |
| `db:backup`             | Respaldo cifrado GPG de Postgres hacia Cloudflare R2 (`scripts/backup-db-to-r2.mjs`)                                           |
| `storage:backup`        | Respaldo cifrado GPG de buckets de Storage hacia Cloudflare R2 (`scripts/backup-storage-to-r2.mjs`)                            |

La aplicación requiere `.env.local` en la **raíz del monorepo** (puedes copiar
`apps/web/.env.example`; matriz completa en [`docs/OPERATIONS.md`](../../docs/OPERATIONS.md)). Para
preparar la base de datos local por primera vez:

```bash
make db-local-start && make db-local-setup && make db-local-on && make db-local-seed
```

## Estructura del paquete

```text
apps/web/
├── app/            # App Router: storefront, /estudio/[slug], /checkout, /pedido, /cotizacion, /soporte, /legal, /admin, /api
├── assets/fonts/   # Fuentes vendorizadas: .subset.woff2 (next/font/local storefront) + 8 .ttf (Estudio y @napi-rs/canvas 300 DPI)
├── components/     # Sistema de diseño compartido (ui/ shadcn + marca, admin/, auth/, cms/, legal/, storefront)
├── features/       # Módulos de dominio (ai, analytics, catalog, cart, checkout, cms, contacts, costing, crm, emails,
│                   #   loyalty, observability, opportunities, orders, payments, personalization, products, quotes,
│                   #   referrals, reviews, security, shipping, support)
├── lib/            # Utilidades transversales (clientes Supabase, CSP/headers, env fail-fast, datetime America/Bogota,
│                   #   sharp-safe, circuit-breaker, rate-limit, pii-mask, analytics/funnel)
├── public/         # Activos estáticos servidos directo (brand/, carriers/, icons/, payments/, templates/*.svg del Estudio)
├── scripts/        # Scripts operativos de app (backups DB/Storage → R2, simulacros DR, profile-studio-entry.mjs)
├── tests/          # Specs Playwright E2E (tests/e2e/), auditoría responsive, setup y stubs; unit tests viven junto al código
├── types/          # Declaraciones y tipos TypeScript compartidos en toda la app
├── proxy.ts        # Proxy HTTP de Next 16 (mantenimiento, nonce CSP, CORS, redirects DB, 404 PDP real, refresh Auth + MFA admin)
├── next.config.ts  # Configuración Next 16 (serverExternalPackages sharp/@napi-rs/canvas, imágenes remotas)
└── vercel.json     # Región iad1 y maxDuration por ruta serverless
```

## Notas técnicas y referencias

- **Next.js 16 (breaking changes):** revisa [`apps/web/AGENTS.md`](AGENTS.md) antes de tocar rutas,
  `params`/`searchParams` asíncronos, caché o `proxy.ts`.
- **Tokens visuales y Tailwind v4 CSS-first:** definidos bajo `@theme` en `app/globals.css` y
  documentados en [`docs/BRANDING.md`](../../docs/BRANDING.md).
- **Estrategia tipográfica dual:** `app/layout.tsx` carga `Fredoka.subset.woff2` e
  `Inter.subset.woff2` vía `next/font/local` para proteger el LCP; `app/estudio/fonts.ts` expone 6
  fuentes `.ttf` extra con `preload: false` y el renderizador servidor `@napi-rs/canvas` registra las
  8 fuentes `.ttf` desde `assets/fonts/` (nota: no existe carpeta `public/fonts/`; todas las fuentes
  locales viven unificadas en `apps/web/assets/fonts/`).
- **Estudio de Personalización:** guía local en
  [`app/estudio/[slug]/README.md`](app/estudio/%5Bslug%5D/README.md) y dominio completo en
  [`docs/domains/studio-and-production.md`](../../docs/domains/studio-and-production.md).
- **Arquitectura y operación:** [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) y
  [`docs/OPERATIONS.md`](../../docs/OPERATIONS.md).
