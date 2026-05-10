# CLAUDE.md — Contexto para Claude Code

> Este archivo se carga automáticamente por Claude Code en cada sesión sobre este repo. Contiene los mandatos, decisiones y referencias necesarias para trabajar sin re-explicar el contexto cada vez.

## 📚 Carga de contexto (modular, bajo demanda)

Este `CLAUDE.md` ya se carga automáticamente y te da la mayoría del contexto. Para detalle profundo, **lee solo lo que la tarea necesite** — no leas todo siempre, gasta tokens.

### Lectura mínima al iniciar sesión (siempre)

- `docs/STATE.md` — qué se hizo en la última sesión, dónde estamos parados ahora, próximo paso. Es el índice narrativo.
- `docs/ROADMAP.md` — para saber en qué fase estamos y qué está autorizado o no. Son pocas líneas.

### Lectura condicional (según la tarea)

| Si vas a... | Lee primero |
|---|---|
| Tocar UI, componentes, colores, tipografías, copy | `docs/BRANDING.md` |
| Crear/editar schema Prisma, RLS, estructura de carpetas, `PaymentProvider` | `docs/ARCHITECTURE.md` |
| Implementar o depurar Wompi, Venndelo, Resend, Claude API, WhatsApp, DIAN, webhooks | `docs/INTEGRATIONS.md` |
| Tocar variables de entorno, despliegue, runbook, incidentes, costos, entorno de desarrollo, branching/releases, DR | `docs/OPERATIONS.md` |
| Tocar autenticación, autorización, RLS, headers, CORS, rate limit, secrets, validación, RBAC, STRIDE, IRP | `docs/SECURITY.md` |
| **Patrones de código** (naming, error format RFC 7807, capa de servicio, saga, idempotency, audit fields, migrations, retry/circuit breaker) | `docs/CONVENTIONS.md` |
| **SLOs/SLIs, dashboards, alertas, postmortem** | `docs/OBSERVABILITY.md` |
| **Compliance colombiano** (Ley 1581, Ley 1480, DIAN, IVA, retracto, garantías, subprocesadores) | `docs/COMPLIANCE.md` |
| **Estrategia de testing** (pirámide, RLS automatizado, E2E, visual regression, load) | `docs/TESTING.md` |
| Cuestionar o cambiar una decisión previa, o entender el "por qué" de algo | `docs/DECISIONS.md` |
| Planear una fase nueva o tienes duda de alcance global | `docs/PLAN.md` |
| Buscar el contenido seed, productos, categorías iniciales | `docs/CATALOG_SEED.md` (37 productos paritarios) |
| Entender qué copiamos / mejoramos / descartamos vs magneticas.cl | `docs/COMPETITIVE_ANALYSIS.md` |
| Revisar auditorías previas (coherencia, seguridad, performance, productive readiness) | `docs/audits/` (formato `YYYY-MM-DD-<slug>.md`) |

Si una tarea cruza varias áreas, lee los archivos relevantes en paralelo. Si no estás seguro, **lee `docs/PLAN.md` y luego decides**.

### Reglas

- **No releer** en cada turno: una vez cargado un archivo en la sesión, ya está en contexto.
- Si el usuario pide algo que **contradice un mandato de este `CLAUDE.md` o un ADR de `docs/DECISIONS.md`**, señala el conflicto antes de actuar y pide confirmación explícita para sobrescribir.
- Si una **decisión nueva** sale en la sesión, agrégala como ADR en `docs/DECISIONS.md` con fecha (YYYY-MM-DD) y razón.
- Si una **fase avanza** (de pendiente a en curso, o de en curso a completada), actualiza el checklist correspondiente en `docs/ROADMAP.md`.

### Cuándo SÍ leer todo de una vez

- El usuario te pide explícitamente "lee toda la documentación" o "necesito que tengas contexto completo".
- Vas a hacer un cambio que toca 4+ áreas (ej. lanzamiento productivo).
- Estás auditando coherencia entre documentos.

## Qué es este proyecto

**Lucams_shop** — e-commerce colombiano de productos magnéticos personalizados. Negocio con presencia actual solo en Instagram ([@lucams_shop](https://www.instagram.com/lucams_shop)) y Linktree. Toma como referencia funcional a [magneticas.cl](https://www.magneticas.cl) pero con mandato de **superarla en valor agregado**.

## Mandatos no negociables

1. **No es MVP.** El sitio debe nacer 100% productivo, listo para vender desde el día 1.
2. **Free durante desarrollo, Pro al lanzar.** Nunca activar tiers de pago hasta el lanzamiento productivo.
3. **Stack fijo:** Next.js **16** (App Router, RSC, Server Actions, Turbopack default) + TypeScript + **Tailwind v4** + shadcn/ui (style `radix-nova`) sobre **monorepo pnpm** (`apps/web` + `packages/db` + `packages/ui`), Supabase (DB+Auth+Storage+Realtime), Vercel. **Next.js 16 tiene breaking changes vs 15** — ver `apps/web/AGENTS.md` y la guía local `apps/web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` antes de escribir código nuevo.
4. **Pasarela:** Wompi (con adaptador `PaymentProvider` que permite sumar Mercado Pago después).
5. **Logística:** Venndelo (Coordinadora + contraentrega activa desde día 1).
6. **WhatsApp:** solo `wa.me` con mensaje pre-armado contextual; sin Twilio API por ahora.
7. **Sin Sentry** ni monitoreo de errores en el plan actual; se decide alternativa gratuita en Fase 7.
8. **Documentación dentro del repo.** Nada de archivos en `~/.claude/plans/` (auditorías en `docs/audits/`, decisiones en `docs/DECISIONS.md`).
9. **Argumentación obligatoria — sin suposiciones.** Toda afirmación técnica (cifras, sintaxis, comportamientos, límites de tier, defaults, costos) debe citar la fuente oficial de la tecnología correspondiente con fecha de verificación. Si la doc oficial no se puede consultar, marcar como `[pendiente verificación]` en lugar de aseverar. Las afirmaciones que ya están en docs sin cita se tratan como deuda y se verifican antes de usarlas para decisiones.
10. **VM dedicada como Ambiente de Desarrollo.** Usuario con `sudo`, persistencia local, instalación global permitida. **No usar venvs Python ni contenedores Docker en dev** salvo necesidad explícita y justificada. La VM funciona como símil local de Vercel (logs, env vars, Supabase local cuando aplica).
11. **Background jobs en Supabase.** `pgmq` + `pg_cron` para jobs durables; **no Vercel Cron**. Rate limit y cache en Postgres durante dev y arranque productivo; migrar a Redis externo solo si métricas justifican (p95 > 50 ms o volumen real lo exige).
12. **Seguridad por defecto.** Toda tabla con acceso vía `anon_key` debe tener RLS habilitada. Toda ruta `/admin/*` valida rol vía middleware. Toda variable secreta vive solo en `.env*` (gitignored) y nunca en cliente. Detalle en `docs/SECURITY.md`.

## Branding

- Logo: insignia circular, mapache kawaii sobre lavanda, "LUCAMS" bubble multicolor + "SHOP".
- Paleta principal: `#7C6AAD` (purple), `#3D2E5C` (purple-dark), `#5DD9D1` (turquoise), `#E85B9F` (pink), `#F58A6F` (coral), `#FFD93D` (yellow), `#FFF8F0` (cream).
- Tipografía: `Fredoka`/`Baloo 2` (display) + `Inter`/`Nunito` (cuerpo).
- Tono: kawaii, lúdico, cercano. Opuesto al minimalismo blanco de magneticas.cl.
- Mascota mapache es personaje recurrente (loader, empty states, 404, badges, emails).

> Detalle en [docs/BRANDING.md](docs/BRANDING.md).

## Diferenciador #1

**Estudio de Personalización en vivo** (react-konva): editor canvas con plantillas, fotos, texto. Guarda JSON del diseño + PNG alta resolución para producción. Es el "plus" real frente a magneticas.cl. Acompañado de vista 3D en nevera (Three.js) y asistente IA (Claude API).

## Datos clave

- **Dominio:** `lucamsshop.co` en mi.com.co (al lanzar).
- **WhatsApp temporal:** +57 315 071 8723 (centralizado en `NEXT_PUBLIC_WA_NUMBER`).
- **Productos iniciales:** 30+ espejo de magneticas.cl con placeholders (cliente reemplaza fotos/precios).
- **Pago contraentrega:** activo desde el lanzamiento.
- **Costo dev:** $0/mes. **Costo prod:** ~$68 USD/mes + comisiones.

## Cómo navegar la documentación

| Si necesitas... | Lee... |
|---|---|
| El plan completo | [docs/PLAN.md](docs/PLAN.md) |
| Paleta, logo, mascota, tipografías | [docs/BRANDING.md](docs/BRANDING.md) |
| Estructura de carpetas, modelo Prisma, RLS | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Cómo se integran Wompi/Venndelo/Claude/Resend | [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |
| Fases con checklist y criterios de aceptación | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Por qué se tomó tal decisión | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Variables de entorno, despliegue, runbook, dev local, DevOps, DR | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| Estado actual + bitácora inter-sesión | [docs/STATE.md](docs/STATE.md) |
| Seguridad (RLS, CORS, headers, rate limit, RBAC, CSP, validación, STRIDE, IRP) | [docs/SECURITY.md](docs/SECURITY.md) |
| Patrones de código (naming, errores RFC 7807, saga, idempotency, audit fields) | [docs/CONVENTIONS.md](docs/CONVENTIONS.md) |
| Observabilidad (SLOs, dashboards, alertas, postmortem) | [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) |
| Compliance Colombia (Ley 1581, Ley 1480, DIAN, retracto, garantías) | [docs/COMPLIANCE.md](docs/COMPLIANCE.md) |
| Estrategia de testing (pirámide, RLS, E2E, load) | [docs/TESTING.md](docs/TESTING.md) |
| Auditorías históricas | [docs/audits/](docs/audits/) |

## Estado actual

**Fase 0a completada (2026-05-09) — productive readiness baseline.** Dos auditorías ejecutadas (coherencia + productive readiness, 21 + 43 hallazgos). 4 docs nuevos: `CONVENTIONS.md`, `OBSERVABILITY.md`, `COMPLIANCE.md`, `TESTING.md`. Compliance colombiano operativizado (Ley 1581, Ley 1480 retracto + garantías, DIAN facturación electrónica). Threat model STRIDE por flujo. IRP con runbooks. SLOs cuantitativos. DR drills cuatrimestrales programados. Esperando autorización del usuario para Fase 0b (cuentas externas en Free).

**Sigue sin haber código.** No intentar `npm install`, `npx create-next-app`, `pnpm create`, ni similares hasta que el usuario apruebe explícitamente la Fase 0b/1.

> Detalle siempre en [docs/STATE.md](docs/STATE.md) — fuente narrativa de la última sesión.

## Convenciones

- Idioma de UI: español (Colombia).
- Idioma de código y commits: inglés.
- Idioma de documentación: español.
- Precios siempre en **enteros (centavos COP)** — nunca floats.
- Slugs en `kebab-case`.
- Identificadores en código `camelCase`/`PascalCase`.
- Commits: convencionales (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

## Reglas para Claude Code en este repo

- **No instalar dependencias ni crear archivos de proyecto** sin pedir aprobación explícita al usuario primero.
- **No modificar la paleta** sin documentarlo en `DECISIONS.md`.
- **No agregar Sentry/Twilio** hasta que el usuario lo pida (están explícitamente fuera del alcance).
- **Toda decisión arquitectónica nueva** se documenta en `DECISIONS.md` con fecha y razón.
- Si una decisión del usuario contradice un mandato de este archivo, **actualizar este `CLAUDE.md` primero**, después implementar.
- **Free tiers obligatorios durante desarrollo** — no sugerir pagos antes del lanzamiento.
- **Al cerrar la sesión con cambios**, actualizar `docs/STATE.md` (resumen actual + última sesión + bitácora) para que la próxima sesión arranque con contexto.
- **Antes de citar una cifra técnica nueva** (límite de tier, costo, comportamiento de API), verificar contra la doc oficial; si no se puede, marcar `[pendiente verificación]` (mandato #9).
