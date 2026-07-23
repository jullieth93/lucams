# CLAUDE.md — Contexto para Claude Code

> Se carga automáticamente en cada sesión. Mandatos, decisiones y referencias para trabajar sin re-explicar el contexto. **Optimizado para consumo de tokens (2026-07-23):** lee solo lo que la tarea necesite.

## Lectura mínima al iniciar (siempre)

- `docs/STATE.md` — qué se hizo, dónde estamos, próximo paso.

## Lectura condicional (según la tarea)

| Tarea | Lee |
|---|---|
| UI, componentes, colores, tipografías, copy | `docs/BRANDING.md` |
| Schema Prisma, RLS, estructura de carpetas, `PaymentProvider` | `docs/ARCHITECTURE.md` |
| Wompi, Aveonline, Resend, IA (Gemini), WhatsApp, DIAN, webhooks | `docs/INTEGRATIONS.md` |
| Env vars, despliegue, runbook, costos, branching | `docs/OPERATIONS.md` |
| Auth, autorización, RLS, headers, CORS, rate limit, secrets, RBAC | `docs/SECURITY.md` |
| Patrones de código (naming, RFC 7807, saga, idempotency, migrations, retry/CB) | `docs/CONVENTIONS.md` |
| SLOs/SLIs, dashboards, alertas, postmortem | `docs/OBSERVABILITY.md` |
| Compliance colombiano (Ley 1581/1480, DIAN, IVA, retracto) | `docs/COMPLIANCE.md` |
| Estrategia de testing | `docs/TESTING.md` |
| Decisiones previas (el "por qué" de algo) | `docs/DECISIONS.md` |
| Alcance global / fase nueva | `docs/PLAN.md` |
| Auditorías previas | `docs/audits/` (formato `YYYY-MM-DD-<slug>.md`) |

### Reglas

- **No releer** un archivo ya cargado en la sesión.
- Si el usuario pide algo que **contradice un mandato o un ADR**, señala el conflicto y pide confirmación.
- Decisión nueva → ADR en `docs/DECISIONS.md` (fecha + razón). Fase que avanza → actualizar `docs/ROADMAP.md`.
- Lee todo de una vez solo si: el usuario lo pide, el cambio toca 4+ áreas, o auditas coherencia entre docs.

## Qué es este proyecto

**Lucams_shop** — e-commerce colombiano de productos magnéticos personalizados (imanes, separadores, calendarios, tiras, letras). Venta actual: catálogo + cotización por WhatsApp (Etapa 1). Referencia funcional: magneticas.cl, con mandato de superarla.

## Mandatos no negociables

1. **No es MVP.** El sitio nace 100% productivo.
2. **Stack fijo:** Next.js **16** (App Router, RSC, Server Actions, Turbopack) + TypeScript + **Tailwind v4** + shadcn/ui, monorepo pnpm (`apps/web` + `packages/db`), Supabase (DB+Auth+Storage), Vercel. Next 16 tiene breaking changes vs 15 — ver `apps/web/AGENTS.md`.
3. **Modo de tienda por flag:** `NEXT_PUBLIC_STORE_MODE` = `catalog` (Etapa 1, sin pagos/envíos/IA en UI) | `full` (Etapa 2, Wompi + Aveonline). Una sola base de código — ADR-077.
4. **Pasarela:** Wompi (adaptador `PaymentProvider`; Mercado Pago después).
5. **Logística:** Aveonline (ADR-039; Venndelo = Plan B stub).
6. **WhatsApp:** solo `wa.me` con mensaje pre-armado contextual; sin Twilio.
7. **Sin Sentry** ni monitoreo de errores de pago por ahora.
8. **Documentación dentro del repo** (auditorías en `docs/audits/`, decisiones en `docs/DECISIONS.md`).
9. **Argumentación obligatoria:** toda afirmación técnica (cifras, límites, defaults, costos) cita fuente oficial con fecha; si no se puede verificar, marcar `[pendiente verificación]`.
10. **VM dedicada como dev.** Sin venvs Python ni Docker en dev salvo necesidad justificada.
11. **Background jobs en Supabase** (`pgmq` + `pg_cron`; no Vercel Cron). Rate limit y cache en Postgres.
12. **Seguridad por defecto:** RLS en toda tabla vía `anon_key`; `/admin/*` valida rol; secretos solo en `.env*` (gitignored) — `docs/SECURITY.md`.

## Branding (resumen — detalle en docs/BRANDING.md)

- Paleta: `#7C6AAD` purple, `#3D2E5C` purple-dark, `#5DD9D1` turquoise, `#E85B9F` pink, `#F58A6F` coral, `#FFD93D` yellow, `#FFF8F0` cream.
- Tipografía: Fredoka/Baloo 2 (display) + Inter/Nunito (cuerpo). Tono kawaii, mascota mapache recurrente.
- Diferenciador #1: **Estudio de personalización** (Konva + vistas 3D con three.js) — el plus de venta.

## Datos clave

- **Dominio:** `lucamsshop.com` (mi.com.co). **WhatsApp:** +57 320 887 3826 (`NEXT_PUBLIC_WA_NUMBER`).
- **Costo:** ~$20 USD/mes Vercel Pro (requerido para uso comercial; Supabase Free sí permite comercial).

## Estado actual

Ver `docs/STATE.md` (fuente narrativa). En corto: **Etapa 1 en vivo** (catálogo + cotización WhatsApp, olas de pulido 1-4 desplegadas). Etapa 2 (pagos/envíos reales) espera trámites humanos (NIT, abogado, DIAN).

## Convenciones

- UI: español (Colombia, tuteo). Código y commits: inglés. Docs: español.
- Precios: **enteros (centavos COP)** — nunca floats. Slugs: kebab-case.
- Commits: convencionales (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

## Reglas para Claude Code en este repo

- **No instalar dependencias ni crear archivos de proyecto** sin aprobación explícita.
- **No modificar la paleta** sin ADR. **No agregar Sentry/Twilio** hasta que el usuario lo pida.
- Decisión arquitectónica nueva → `docs/DECISIONS.md`. Contradicción con un mandato → **actualizar este CLAUDE.md primero**.
- **Al cerrar la sesión con cambios:** actualizar `docs/STATE.md` (resumen + última sesión + bitácora).
- **Antes de citar una cifra técnica nueva**, verificar contra doc oficial (mandato #9).
