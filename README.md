# Lucams Shop

E-commerce colombiano de productos magnéticos personalizados. Inspirado en [magneticas.cl](https://www.magneticas.cl) pero con valor agregado fuerte (estudio de personalización en vivo, vista 3D, IA, contraentrega).

- **Sitio en producción:** [lucamsshop.com](https://lucamsshop.com) — vendiendo en modo `full` (pagos reales Wompi + envíos Aveonline) desde 2026-09-03
- **Instagram:** [@lucams_shop](https://www.instagram.com/lucams_shop)
- **Linktree actual:** [linktr.ee/Lucams_shop](https://linktr.ee/Lucams_shop)
- **WhatsApp (temporal):** +57 320 887 3826

## Estado del proyecto

**Salida en 2 etapas (ADR-077).** La aplicación está construida y desplegada en `lucamsshop.com`. **Etapa 1 (superada):** modo catálogo + cotización por WhatsApp. **Etapa 2 (activa en PRD):** tienda full con Wompi + Aveonline reales — lo pendiente son los trámites de facturación electrónica (NIT, abogado, DIAN). El estado actual y los pendientes están en [docs/STATE.md](docs/STATE.md).

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
- **Hosting**: Vercel Pro (requerido para uso comercial)
- **Dominio**: `lucamsshop.com` (adquirido 2026-07-20, registrado en **mi.com.co** — ADR-076)

## Documentación

El mapa completo (qué doc cubre qué dominio) está en [docs/README.md](docs/README.md) — fuente única, no dupliques tablas aquí. Los tres de cabecera:

| Archivo                                  | Contenido                                    |
| ---------------------------------------- | -------------------------------------------- |
| [docs/STATE.md](docs/STATE.md)           | Estado actual del proyecto y pendientes      |
| [docs/DECISIONS.md](docs/DECISIONS.md)   | Decisiones vigentes por dominio (anclas ADR) |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Variables de entorno, despliegue, runbook    |

Para agentes LLM: [`AGENTS.md`](AGENTS.md) (entrada canónica multi-herramienta) y [`CLAUDE.md`](CLAUDE.md) (mandatos completos).

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

- **Hoy (PRD operando):** ~$20 USD/mes (Vercel Pro) + comisiones por venta; Supabase y Resend siguen en Free.

Detalle en [docs/ROADMAP.md](docs/ROADMAP.md#stack-y-costos).
