# Lucams_shop

E-commerce colombiano de productos magnéticos personalizados. Inspirado en [magneticas.cl](https://www.magneticas.cl) pero con valor agregado fuerte (estudio de personalización en vivo, vista 3D, IA, contraentrega).

- **Sitio en producción:** _(pendiente, dominio `lucamsshop.co` se compra al lanzar)_
- **Instagram:** [@lucams_shop](https://www.instagram.com/lucams_shop)
- **Linktree actual:** [linktr.ee/Lucams_shop](https://linktr.ee/Lucams_shop)
- **WhatsApp (temporal):** +57 315 071 8723

## Estado del proyecto

**Fase 0a completada (2026-05-09).** Documentación auditada y reforzada con base de seguridad/traceability/entorno de desarrollo. **Aún no hay código.** El estado actual y la bitácora siempre están en [docs/STATE.md](docs/STATE.md). Las fases siguientes (cuentas externas, scaffolding, etc.) están definidas en [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack (cuando se implemente)

- **Repo**: monorepo `pnpm` con `apps/web` + `packages/db` + `packages/ui`
- **Frontend / Backend**: Next.js 15 (App Router) + TypeScript + **Tailwind v4** + shadcn/ui (style `new-york`)
- **DB / Auth / Storage**: Supabase (Postgres + Auth + Storage + Realtime + `pgmq` + `pg_cron`)
- **ORM**: Prisma
- **Background jobs**: Supabase Queues (`pgmq`) + `pg_cron` (no Vercel Cron — ADR-017)
- **Rate limit + cache**: Postgres + `pg_cron` (no Redis externo — ADR-016)
- **Pasarela de pago**: Wompi (con adaptador `PaymentProvider` para sumar Mercado Pago después)
- **Logística**: Venndelo (Coordinadora + contraentrega + 1.100+ destinos)
- **Email**: Resend
- **CAPTCHA**: Cloudflare Turnstile (en checkout y registro)
- **Hosting**: Vercel (Hobby/Free durante dev → Pro al lanzar)
- **Dominio**: mi.com.co (al lanzar)

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
