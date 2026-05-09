# Lucams_shop

E-commerce colombiano de productos magnéticos personalizados. Inspirado en [magneticas.cl](https://www.magneticas.cl) pero con valor agregado fuerte (estudio de personalización en vivo, vista 3D, IA, contraentrega).

- **Sitio en producción:** _(pendiente, dominio `lucamsshop.co` se compra al lanzar)_
- **Instagram:** [@lucams_shop](https://www.instagram.com/lucams_shop)
- **Linktree actual:** [linktr.ee/Lucams_shop](https://linktr.ee/Lucams_shop)
- **WhatsApp (temporal):** +57 315 071 8723

## Estado del proyecto

Fase 0a en curso: estructura de documentación. **Aún no hay código.** Las fases siguientes (cuentas externas, scaffolding, etc.) están definidas en [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack (cuando se implemente)

- **Frontend / Backend**: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **DB / Auth / Storage**: Supabase (Postgres + Auth + Storage + Realtime)
- **ORM**: Prisma
- **Pasarela de pago**: Wompi (con adaptador `PaymentProvider` para sumar Mercado Pago después)
- **Logística**: Venndelo (Coordinadora + contraentrega + 1100 destinos)
- **Email**: Resend
- **Hosting**: Vercel (Hobby/Free durante dev → Pro al lanzar)
- **Dominio**: mi.com.co (al lanzar)

## Documentación

| Archivo | Contenido |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Plan maestro del proyecto (fuente de verdad) |
| [docs/BRANDING.md](docs/BRANDING.md) | Logo, paleta, mascota, tipografías, tono |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, estructura de carpetas, modelo de datos, RLS |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Wompi, Venndelo, Claude API, Resend, WhatsApp |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases de implementación con checklist |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Log cronológico de decisiones |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Variables de entorno, despliegue, runbook |
| [CLAUDE.md](CLAUDE.md) | Contexto persistente para futuras sesiones de Claude Code |

## Cómo correr (cuando exista código)

> **TBD** — se documenta cuando arranque la Fase 1.

## Costos operativos

- **Durante desarrollo:** $0/mes (todo en Free).
- **Al lanzar a producción:** ~$68 USD/mes (~$272.000 COP/mes) + comisiones por venta.

Detalle en [docs/PLAN.md](docs/PLAN.md#stack-free-durante-dev--pro-al-lanzar).
