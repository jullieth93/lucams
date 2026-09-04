# Lucams_shop

E-commerce colombiano de productos magnéticos personalizados. Inspirado en [magneticas.cl](https://www.magneticas.cl) pero con valor agregado fuerte (estudio de personalización en vivo, vista 3D, IA, contraentrega).

- **Sitio en producción:** [lucamsshop.com](https://lucamsshop.com) — en vivo desde 2026-07-22 y vendiendo en modo `full` (pagos reales Wompi + envíos Aveonline) desde 2026-09-03 (ver [docs/RUNBOOK_GO_LIVE.md](docs/RUNBOOK_GO_LIVE.md))
- **Instagram:** [@lucams_shop](https://www.instagram.com/lucams_shop)
- **Linktree actual:** [linktr.ee/Lucams_shop](https://linktr.ee/Lucams_shop)
- **WhatsApp (temporal):** +57 320 887 3826

## Estado del proyecto

**Salida en 2 etapas (2026-07-21).** La aplicación está construida y desplegada en `lucamsshop.com`. **Etapa 1 (superada):** modo catálogo + cotización por WhatsApp (sin pagos en línea ni envíos integrados). **Etapa 2 (activa en PRD desde 2026-09-03, decisión de Lucy):** tienda full con Wompi + Aveonline reales — lo pendiente son los trámites de facturación electrónica (NIT, abogado, DIAN). El estado detallado y la bitácora siempre están en [docs/STATE.md](docs/STATE.md), el runbook de go-live en [docs/RUNBOOK_GO_LIVE.md](docs/RUNBOOK_GO_LIVE.md) y la auditoría de seguridad (cerrada y homologada) en [docs/audits/auditoria_seguridad_lucams.md](docs/audits/auditoria_seguridad_lucams.md).

## Stack

- **Repo**: monorepo `pnpm` con `apps/web` + `packages/db`
- **Frontend / Backend**: Next.js 16 (App Router) + TypeScript + **Tailwind v4** + shadcn/ui
- **DB / Auth / Storage**: Supabase (Postgres + Auth + Storage + `pg_cron` + `pg_net`)
- **ORM**: Prisma
- **Background jobs**: `pg_cron` + `pg_net` → HTTP GET a `/api/cron/*` con secreto en Vault (no Vercel Cron — ADR-017 SUPERSEDED; pgmq descartado)
- **Rate limit + cache**: Postgres + `pg_cron` (no Redis externo — ADR-016)
- **Pasarela de pago**: Wompi (Etapa 2; con adaptador `PaymentProvider` para sumar Mercado Pago después)
- **Logística**: Aveonline (Etapa 2, ADR-039)
- **Email**: Resend
- **CAPTCHA**: Cloudflare Turnstile (en checkout y registro)
- **Hosting**: Vercel (Hobby/Free durante dev → Pro al lanzar)
- **Dominio**: `lucamsshop.com` (adquirido 2026-07-20, registrado en **mi.com.co** — ADR-076)

## Documentación

| Archivo                                                          | Contenido                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [docs/PLAN.md](docs/PLAN.md)                                     | Plan maestro del proyecto (fuente de verdad)                                               |
| [docs/STATE.md](docs/STATE.md)                                   | Estado actual + bitácora inter-sesión (índice narrativo)                                   |
| [docs/ROADMAP.md](docs/ROADMAP.md)                               | Fases de implementación con checklist                                                      |
| [docs/DECISIONS.md](docs/DECISIONS.md)                           | Log cronológico de decisiones (ADRs)                                                       |
| [docs/BRANDING.md](docs/BRANDING.md)                             | Logo, paleta, mascota, tipografías, tono                                                   |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                     | Stack, estructura de carpetas, modelo de datos, RLS, extensiones Postgres, background jobs |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md)                       | Convenciones de código y de trabajo (incl. cómo agregar un campo CMS)                      |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)                     | Wompi, Aveonline, Gemini API, Resend, WhatsApp, pg_cron + pg_net                           |
| [docs/INTEGRATIONS_AVEONLINE.md](docs/INTEGRATIONS_AVEONLINE.md) | Integración Aveonline en detalle (Etapa 2)                                                 |
| [docs/SECURITY.md](docs/SECURITY.md)                             | RLS, CORS, headers, rate limit, secrets, auth, RBAC, CSP, validación, file upload, PII     |
| [docs/COMPLIANCE.md](docs/COMPLIANCE.md)                         | Cumplimiento legal colombiano (Ley 1581, Ley 1480, DIAN, retracto)                         |
| [docs/OPERATIONS.md](docs/OPERATIONS.md)                         | Variables de entorno, despliegue, runbook, entorno de desarrollo VM (símil Vercel local)   |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)                   | SLOs, alertas, métricas, postmortems                                                       |
| [docs/TESTING.md](docs/TESTING.md)                               | Estrategia de testing (unit, integration, E2E, RLS, carga)                                 |
| [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md)                     | Checklist de QA manual pre-release                                                         |
| [docs/RUNBOOK_GO_LIVE.md](docs/RUNBOOK_GO_LIVE.md)               | Runbook de go-live paso a paso (dominio, DNS, Vercel, correo, pagos, envíos)               |
| [docs/PLAN_CATALOG_V2.md](docs/PLAN_CATALOG_V2.md)               | Diseño del modelo de catálogo v2 (80 decisiones; ADR-038)                                  |
| [docs/CMS_ROADMAP.md](docs/CMS_ROADMAP.md)                       | Roadmap del CMS v2 (completado y certificado 2026-08-01)                                   |
| [docs/CATALOG_SEED.md](docs/CATALOG_SEED.md)                     | Catálogo seed inicial (37 productos paritarios con magneticas.cl) — documento histórico    |
| [docs/COMPETITIVE_ANALYSIS.md](docs/COMPETITIVE_ANALYSIS.md)     | Análisis competitivo vs magneticas.cl (2026-05-09) — documento histórico                   |
| [docs/EMAIL_TEMPLATES.md](docs/EMAIL_TEMPLATES.md)               | Templates de emails transaccionales                                                        |
| [docs/audits/](docs/audits/)                                     | Auditorías históricas (coherencia, seguridad, performance) — `YYYY-MM-DD-<slug>.md`        |
| [CLAUDE.md](CLAUDE.md)                                           | Contexto persistente para futuras sesiones de Claude Code                                  |

## Cómo correr

**Requisitos:** Node ≥ 22, pnpm ≥ 11 y (solo para la DB local) podman rootless. Detalle completo en [docs/OPERATIONS.md](docs/OPERATIONS.md).

```bash
pnpm install            # o `make install`

# Base de datos local (Supabase en podman, espejo de la nube)
make db-local-start     # levanta el stack (los datos persisten en volúmenes)
make db-local-setup     # extensiones + migraciones (mismo orden que CI)
make db-local-on        # apunta .env.local al stack local
make db-local-seed      # catálogo + plantillas Estudio + ocasiones + CMS

# App
make web-start          # Next dev en http://localhost:4000 (log en tmp/logs/)
# o en primer plano:    pnpm dev

# Tests
make test               # unit (vitest) + e2e (playwright)
make test-local         # suite vitest contra el stack local
make test-rls           # tests RLS reales (requieren Supabase)
```

Sin stack local, `pnpm dev` corre contra la DB compartida de la nube si `.env.local` apunta allá (`make db-local-off` restaura ese estado). `make help` lista todos los targets.

## Costos operativos

- **Durante desarrollo:** $0/mes (todo en Free).
- **Al lanzar a producción:** ~$68 USD/mes (~$272.000 COP/mes) + comisiones por venta.

Detalle en [docs/PLAN.md](docs/PLAN.md#stack-free-durante-dev--pro-al-lanzar).
