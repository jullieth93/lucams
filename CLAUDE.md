# CLAUDE.md — Contexto para Claude Code

> Se carga automáticamente en cada sesión. Mandatos, decisiones y referencias para trabajar sin re-explicar el contexto. **Optimizado para consumo de tokens (2026-07-23):** lee solo lo que la tarea necesite.

## Lectura mínima al iniciar (siempre)

- `docs/STATE.md` — qué se hizo, dónde estamos, próximo paso.

## Lectura condicional (según la tarea)

> El mapa completo de la documentación (qué doc cubre qué dominio) está en `docs/README.md`.

| Tarea                                                                          | Lee                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| UI, componentes, colores, tipografías, copy                                    | `docs/BRANDING.md`                                        |
| Schema Prisma, RLS, estructura de carpetas, `PaymentProvider`                  | `docs/ARCHITECTURE.md`                                    |
| Wompi, Aveonline, Resend, IA (Gemini), WhatsApp, DIAN, webhooks                | `docs/INTEGRATIONS.md`                                    |
| Env vars, despliegue, runbook, costos, branching                               | `docs/OPERATIONS.md`                                      |
| Auth, autorización, RLS, headers, CORS, rate limit, secrets, RBAC              | `docs/SECURITY.md`                                        |
| Patrones de código (naming, RFC 7807, saga, idempotency, migrations, retry/CB) | `docs/CONVENTIONS.md`                                     |
| SLOs/SLIs, dashboards, alertas, postmortem                                     | `docs/OBSERVABILITY.md`                                   |
| Compliance colombiano (Ley 1581/1480, DIAN, IVA, retracto)                     | `docs/COMPLIANCE.md`                                      |
| Estrategia de testing                                                          | `docs/TESTING.md`                                         |
| Decisiones previas (el "por qué" de algo)                                      | `docs/DECISIONS.md`                                       |
| Alcance global / fase nueva                                                    | `docs/ROADMAP.md`                                         |
| Auditorías                                                                     | efímeras: se trabajan en `tmp/` y se eliminan al cerrarse |

### Reglas

- **No releer** un archivo ya cargado en la sesión.
- Si el usuario pide algo que **contradice un mandato o una decisión vigente**, señala el conflicto y pide confirmación.
- Lee todo de una vez solo si: el usuario lo pide, el cambio toca 4+ áreas, o auditas coherencia entre docs.

## Política de documentación (directriz permanente del dueño, 2026-10-13)

**Objetivo: ahorro de créditos/tokens en futuras sesiones y repo limpio. Aplica siempre, sin que el usuario la repita.**

1. **Los docs son documentos VIVOS, no historiales.** Cada `docs/*.md` describe lo VIGENTE (objetivo, arquitectura, procedimientos actuales). Al cambiar algo se ACTUALIZA el contenido en el sitio — prohibido apilar entradas por fecha/bitácora/sesión. Git conserva la historia; el doc no.
2. **`docs/DECISIONS.md` = decisiones vigentes** por dominio, con su razón actual. Una decisión reemplazada se reescribe (marcar SUPERSEDED inline si el número se referencia desde código), nunca se acumula una entrada fechada sobre la vieja. Los números ADR referenciados desde código/comentarios se conservan como anclas estables.
3. **`docs/STATE.md` = estado actual** (qué existe, qué corre, qué falta). Sin bitácora de sesiones.
4. **Auditorías e incidentes son EFÍMEROS:** se trabajan en `tmp/` (gitignored) y al resolverse se consolidan sus aprendizajes en el doc vivo que corresponda (SECURITY, OPERATIONS…) y se borran. No se commitean.
5. **Nada temporal o regenerable se versiona:** reportes, screenshots, artefactos de QA, dumps, prompts de marketing. Antes de commitear, revisar que el diff no incluya basura local.
6. **Mínimo costo de contexto:** docs cortos y densos; un doc que supera ~1500 líneas está acumulando historia y toca podar.

## Qué es este proyecto

**Lucams Shop** — e-commerce colombiano de productos magnéticos personalizados (imanes, separadores, calendarios, tiras, letras). Venta actual: tienda full con pagos Wompi + envíos Aveonline (PRD en modo `full` desde 2026-09-03). Referencia funcional: magneticas.cl, con mandato de superarla.

## Mandatos no negociables

1. **No es MVP.** El sitio nace 100% productivo.
2. **Stack fijo:** Next.js **16** (App Router, RSC, Server Actions, Turbopack) + TypeScript + **Tailwind v4** + shadcn/ui, monorepo pnpm (`apps/web` + `packages/db`), Supabase (DB+Auth+Storage), Vercel. Next 16 tiene breaking changes vs 15 — ver `apps/web/AGENTS.md`.
3. **Modo de tienda por flag:** `NEXT_PUBLIC_STORE_MODE` = `catalog` (Etapa 1, sin pagos/envíos/IA en UI) | `full` (Etapa 2, Wompi + Aveonline). Una sola base de código — ADR-077. **PRD opera en `full`** por decisión de Lucy del 2026-09-03.
4. **Pasarela:** Wompi (adaptador `PaymentProvider`; Mercado Pago después).
5. **Logística:** Aveonline (ADR-039).
6. **WhatsApp:** solo `wa.me` con mensaje pre-armado contextual; sin Twilio.
7. **Sin Sentry** ni monitoreo de errores de pago por ahora.
8. **Documentación dentro del repo** como documentos vivos (ver «Política de documentación»); auditorías/incidentes son efímeros en `tmp/`.
9. **Argumentación obligatoria:** toda afirmación técnica (cifras, límites, defaults, costos) cita fuente oficial con fecha; si no se puede verificar, marcar `[pendiente verificación]`.
10. **VM dedicada como dev.** Sin venvs Python ni Docker en dev salvo necesidad justificada.
11. **Background jobs:** pg_cron + pg_net → `/api/cron/*` con secreto en Vault (no Vercel Cron; pgmq descartado — ADR-017 SUPERSEDED). Rate limit y cache en Postgres.
12. **Seguridad por defecto:** RLS en toda tabla vía `anon_key`; `/admin/*` valida rol; secretos solo en `.env*` (gitignored) — `docs/SECURITY.md`.

## Branding (resumen — detalle en docs/BRANDING.md)

- **Nombre de marca (2026-10-12, ADR-138):** «Lucams» / «Lucams Shop» — nunca «Lucam's» ni «Lucams_shop» en textos visibles; constante central `SITE_NAME` en `apps/web/lib/site.ts`. El underscore solo en identificadores técnicos (handles, tenant Aveonline, cookies).
- Paleta: `#7C6AAD` purple, `#3D2E5C` purple-dark, `#5DD9D1` turquoise, `#E85B9F` pink, `#F58A6F` coral, `#FFD93D` yellow, `#FFF8F0` cream.
- Tipografía: Fredoka/Baloo 2 (display) + Inter/Nunito (cuerpo). Tono kawaii, mascota mapache recurrente.
- Diferenciador #1: **Estudio de personalización** (Konva + vistas 3D con three.js) — el plus de venta.

## Datos clave

- **Dominio:** `lucamsshop.com` (mi.com.co). **WhatsApp:** +57 320 887 3826 (`NEXT_PUBLIC_WA_NUMBER`).
- **Costo:** ~$20 USD/mes Vercel Pro (requerido para uso comercial; Supabase Free sí permite comercial).

## Estado actual

Ver `docs/STATE.md` (fuente narrativa). En corto: **Etapa 2 / modo `full` activo en PRD** (venta con pagos reales Wompi + envíos Aveonline, olas de pulido 1-4 desplegadas). Lo pendiente son los trámites de facturación electrónica (NIT, abogado, DIAN) — no los pagos.

## Convenciones

- UI: español (Colombia, tuteo). Código y commits: inglés. Docs: español.
- Precios: **enteros (centavos COP)** — nunca floats. Slugs: kebab-case.
- Commits: convencionales (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

## Reglas para Claude Code en este repo

- **No instalar dependencias ni crear archivos de proyecto** sin aprobación explícita.
- **No modificar la paleta** sin ADR. **No agregar Sentry/Twilio** hasta que el usuario lo pida.
- Decisión arquitectónica nueva → actualizar `docs/DECISIONS.md` en el sitio (documento vivo). Contradicción con un mandato → **actualizar este CLAUDE.md primero**.
- **Al cerrar la sesión con cambios:** actualizar `docs/STATE.md` (estado actual, en el sitio — sin bitácora).
- **Antes de citar una cifra técnica nueva**, verificar contra doc oficial (mandato #9).
- **Información pública, contenido legal y centro de ayuda — documentación SIEMPRE al día (mandato Lucy 2026-09-11):** cualquier cambio que toque lo que el público lee (textos CMS y sus fallbacks, FAQs, `/contacto`, `/rastrear`, `/legal/*` y su canónico `packages/db/legal-content/*.md`, datos de contacto/identidad, tiempos de entrega, medios de pago, versiones de políticas, emails transaccionales) debe dejar actualizado **en la misma sesión**: ① `docs/STATE.md`, ② `docs/COMPLIANCE.md` si cambia algo legal (versiones, buzones, documentos), ③ `docs/OPERATIONS.md` si hubo scripts/seed/cambios en DB o infra. Regla de oro asociada: **ningún texto público promete lo que la tienda no opera hoy** (Ley 1480 arts. 23/29) y los textos sensibles al modo (`STORE_MODE`) se gatean en código, no solo en DB.
