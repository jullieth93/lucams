# Lucams Shop

E-commerce colombiano de productos magnéticos personalizados (fotoimanes, separadores de libros,
calendarios, tiras fotográficas y sets de letras/abecedario), con **Estudio de Personalización 2D/3D
en vivo**, renderizado de imprenta a 300 DPI, asistente IA, pagos en línea con Wompi, contraentrega
y logística multi-transportadora.

- **Sitio en producción:** [lucamsshop.com](https://lucamsshop.com) — vendiendo en modo `full`
- **Instagram:** [`@lucams_shop`](https://www.instagram.com/lucams_shop) (handle de red social)
- **Linktree comercial:** [`linktr.ee/Lucams_shop`](https://linktr.ee/Lucams_shop)
- **WhatsApp comercial:** +57 320 887 3826

## Estado del proyecto

**Salida en 2 etapas (`ADR-077`)** sobre una única base de código gobernada por `NEXT_PUBLIC_STORE_MODE`:

- **Etapa 1 (superada):** modo `catalog` + cotización asistida por WhatsApp.
- **Etapa 2 (activa en PRD):** tienda `full` operando con cobros Wompi, contraentrega y envíos
  reales con Aveonline + Envío Lucams Bogotá. El pendiente externo no técnico es el trámite de
  facturación electrónica ante la DIAN (NIT/RUT, revisión contable y proveedor tecnológico).

El estado operativo actual y todos los pendientes abiertos viven en [`docs/STATE.md`](docs/STATE.md).

## Stack principal

- **Monorepo:** `pnpm` (`apps/web` + `packages/db`) sobre Node.js ≥ 22
- **Aplicación:** Next.js **16** (App Router, RSC, Server Actions) + TypeScript strict + **Tailwind v4** + shadcn/ui
- **Estudio e imprenta:** Konva 2D + React Three Fiber (Three.js, 7 escenas 3D) + pipeline 300 DPI (`sharp@0.35.5` + `@napi-rs/canvas`)
- **Datos, Auth y Storage:** Prisma + Supabase (Postgres con RLS en el 100 % de las tablas, Auth OTP + MFA TOTP `aal2`, 5 buckets de Storage)
- **Background jobs:** `pg_cron` + `pg_net` → `HTTP GET` a `/api/cron/*` con secretos en Supabase Vault (no Vercel Cron — `ADR-017` `SUPERSEDED`; `pgmq` descartado)
- **Rate limit y caché:** Postgres (`rate_limit_check`) + `unstable_cache` por tags + limpieza `pg_cron` (sin Redis externo — `ADR-016`)
- **Pagos:** Wompi (`PaymentProvider`, preparado para sumar pasarelas adicionales) + contraentrega (COD) con conciliación
- **Logística:** Aveonline (`ShippingProvider`, `ADR-039`) + mensajería propia «Envío Lucams» por localidades en Bogotá
- **Comunicaciones, IA y seguridad:** Resend (correos y boletín), Google Gemini (IA cero-PII), GA4 + Merchant Center + Search Console, Cloudflare (DNS, Email Routing, Turnstile y backups GPG en R2)
- **Hosting y dominio:** Vercel Pro (`iad1`, requerido para uso comercial) + GitHub Actions; dominio `lucamsshop.com` registrado en **mi.com.co** (`ADR-076`)

## Mapa de documentación

Toda la documentación del repositorio sigue una arquitectura viva de **3 niveles** sin bitácoras
fechadas. El índice maestro único está en **[`docs/README.md`](docs/README.md)**:

| Punto de entrada                                                            | Propósito                                                                                                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/STATE.md`](docs/STATE.md)                                            | Estado operativo actual, topología LOCAL/STG/PRD y pendientes reales                                                                |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                              | Arquitectura general, 71 modelos Prisma, RBAC y seguridad de datos                                                                  |
| [`docs/domains/`](docs/README.md#nivel-2a--dominios-de-negocio-docsdomains) | Especificaciones al detalle de Catálogo/CMS, Estudio 300 DPI, Checkout/Órdenes, CRM/B2B y Posventa                                  |
| [`docs/integrations/README.md`](docs/integrations/README.md)                | Guías exhaustivas de código y configuración de consola para Vercel, Supabase, Wompi, Aveonline, Resend, Cloudflare, Google y GitHub |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)                                    | Decisiones arquitectónicas vigentes por dominio con anclas `ADR-001`…`ADR-195`                                                      |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md)                                  | Matriz maestra de variables de entorno, flujo de ramas, backups y runbooks                                                          |

Para agentes de programación e IA: lee [`AGENTS.md`](AGENTS.md) (entrada multi-herramienta) y
[`CLAUDE.md`](CLAUDE.md) (mandatos completos).

## Desarrollo local rápido

**Requisitos:** Node.js ≥ 22, `pnpm` ≥ 11 y (solo para levantar la DB local) Podman rootless.
Detalle completo en [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

```bash
pnpm install

# Primera vez: preparar el espejo local de Supabase en Podman
make db-local-start     # inicia contenedores locales con volúmenes persistentes
make db-local-setup     # extensiones + migraciones Prisma (94) + migraciones SQL RLS (53)
make db-local-on        # apunta .env.local al stack local
make db-local-seed      # catálogo canónico + plantillas + ocasiones + fichas + CMS v2 + Contact backfill

# Flujo diario (DB local + servidor Next en http://localhost:4000)
make local-up
make local-status
make local-down

# Puertas de calidad antes de abrir PR
make check              # format:check + typecheck + lint + db tests + script guards + paridad CMS
make verify-db          # 0 drift Prisma↔SQL + 5/5 invariantes de postura RLS y grants
make test-local         # suite Vitest completa contra el stack local
make test-rls           # pruebas reales de aislamiento RLS contra Supabase local
```

Sin stack local, `pnpm dev` corre contra la base de datos compartida en la nube si `.env.local`
apunta a ella (`make db-local-off` restaura ese estado). Ejecuta `make help` para listar todos los
targets disponibles.

## Costos operativos

- **Operación actual en producción:** ~$20 USD/mes fijos (Vercel Pro) + comisiones variables por
  venta (Wompi / guías Aveonline); Supabase, Resend y Cloudflare siguen en plan Free.
- Detalle de planes y umbrales en [`docs/ROADMAP.md`](docs/ROADMAP.md#stack-y-costos).
