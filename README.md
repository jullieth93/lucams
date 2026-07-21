# Lucams_shop

E-commerce colombiano de productos magnéticos personalizados. Inspirado en [magneticas.cl](https://www.magneticas.cl) pero con valor agregado fuerte (estudio de personalización en vivo, vista 3D, IA, contraentrega).

- **Sitio en producción:** _(pendiente de apuntar DNS — dominio `lucamsshop.com` ya adquirido en mi.com.co, ver [docs/RUNBOOK_GO_LIVE.md](docs/RUNBOOK_GO_LIVE.md))_
- **Instagram:** [@lucams_shop](https://www.instagram.com/lucams_shop)
- **Linktree actual:** [linktr.ee/Lucams_shop](https://linktr.ee/Lucams_shop)
- **WhatsApp (temporal):** +57 320 887 3826

## Estado del proyecto

**Salida en 2 etapas (2026-07-21).** La aplicación está construida y desplegada en `lucamsshop.com`. **Etapa 1 (en curso):** modo catálogo + cotización por WhatsApp (rama `catalogo-whatsapp`, sin pagos en línea ni envíos integrados). **Etapa 2:** tienda full con Wompi + Aveonline reales — espera trámites (NIT, abogado, DIAN). El estado detallado y la bitácora siempre están en [docs/STATE.md](docs/STATE.md), el plan de salida en [docs/PLAN_SALIDA_PRODUCCION.md](docs/PLAN_SALIDA_PRODUCCION.md) y la auditoría fullstack en [docs/audits/2026-07-21-fullstack-prelaunch-audit.md](docs/audits/2026-07-21-fullstack-prelaunch-audit.md).

## Stack

- **Repo**: monorepo `pnpm` con `apps/web` + `packages/db`
- **Frontend / Backend**: Next.js 16 (App Router) + TypeScript + **Tailwind v4** + shadcn/ui
- **DB / Auth / Storage**: Supabase (Postgres + Auth + Storage + `pgmq` + `pg_cron`)
- **ORM**: Prisma
- **Background jobs**: Supabase Queues (`pgmq`) + `pg_cron` (no Vercel Cron — ADR-017)
- **Rate limit + cache**: Postgres + `pg_cron` (no Redis externo — ADR-016)
- **Pasarela de pago**: Wompi (Etapa 2; con adaptador `PaymentProvider` para sumar Mercado Pago después)
- **Logística**: Aveonline (Etapa 2, ADR-039; Venndelo queda como Plan B)
- **Email**: Resend
- **CAPTCHA**: Cloudflare Turnstile (en checkout y registro)
- **Hosting**: Vercel (Hobby/Free durante dev → Pro al lanzar)
- **Dominio**: `lucamsshop.com` (adquirido 2026-07-20, registrado en **mi.com.co** — ADR-076)

## Documentación

| Archivo                                                      | Contenido                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [docs/PLAN.md](docs/PLAN.md)                                 | Plan maestro del proyecto (fuente de verdad)                                               |
| [docs/BRANDING.md](docs/BRANDING.md)                         | Logo, paleta, mascota, tipografías, tono                                                   |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | Stack, estructura de carpetas, modelo de datos, RLS, extensiones Postgres, background jobs |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)                 | Wompi, Venndelo, Claude API, Resend, WhatsApp, pgmq                                        |
| [docs/SECURITY.md](docs/SECURITY.md)                         | RLS, CORS, headers, rate limit, secrets, auth, RBAC, CSP, validación, file upload, PII     |
| [docs/ROADMAP.md](docs/ROADMAP.md)                           | Fases de implementación con checklist                                                      |
| [docs/DECISIONS.md](docs/DECISIONS.md)                       | Log cronológico de decisiones (ADRs)                                                       |
| [docs/OPERATIONS.md](docs/OPERATIONS.md)                     | Variables de entorno, despliegue, runbook, entorno de desarrollo VM (símil Vercel local)   |
| [docs/RUNBOOK_GO_LIVE.md](docs/RUNBOOK_GO_LIVE.md)           | Runbook de go-live paso a paso (dominio, DNS, Vercel, correo, pagos, envíos)               |
| [docs/STATE.md](docs/STATE.md)                               | Estado actual + bitácora inter-sesión (índice narrativo)                                   |
| [docs/CATALOG_SEED.md](docs/CATALOG_SEED.md)                 | Catálogo seed (37 productos paritarios con magneticas.cl, adaptados a Lucams)              |
| [docs/COMPETITIVE_ANALYSIS.md](docs/COMPETITIVE_ANALYSIS.md) | Análisis competitivo vs magneticas.cl (qué copiamos, mejoramos, descartamos)               |
| [docs/audits/](docs/audits/)                                 | Auditorías históricas (coherencia, seguridad, performance) — `YYYY-MM-DD-<slug>.md`        |
| [CLAUDE.md](CLAUDE.md)                                       | Contexto persistente para futuras sesiones de Claude Code                                  |

## Cómo correr (cuando exista código)

> **TBD** — se documenta cuando arranque la Fase 1.

## Costos operativos

- **Durante desarrollo:** $0/mes (todo en Free).
- **Al lanzar a producción:** ~$68 USD/mes (~$272.000 COP/mes) + comisiones por venta.

Detalle en [docs/PLAN.md](docs/PLAN.md#stack-free-durante-dev--pro-al-lanzar).
