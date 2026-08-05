# Plan — Centro de notificaciones en el admin (adiós al spam de correo)

> **Objetivo (pedido de Lucy, 2026-08-05):** los eventos del sistema (alertas, crons, avisos) deben vivir en el **admin** de forma madura — no en su correo. Eliminar el spam de emails de fondo, conservando el canal in-app como fuente de verdad y el email solo para lo verdaderamente crítico.

## Contexto verificado en el código

- **Spam actual:** `features/observability/alerts.ts` (`dispatchAlerts`) evalúa reglas cada 5 min (cron) y manda UN email por lote a `ALERT_EMAIL` (dedup 30 min por key) — es el origen de "⚠️ N alertas Lucams" repetidos. `daily-summary.ts` manda 1 email/día. Ambos con fallback `hola@lucamsshop.com`.
- **Infra existente a reutilizar:** `SiteEvent` (funnel, consent-gated — NO sirve para esto), `AlertState` (dedup), `getCronHealth`, panel `/admin/observability`, `/admin/metricas`, patrones `requireRole`/`recordAdminAction`, componentes `AdminPage/AdminPageHeader/AdminPageBody`, nav declarativo en `lib/admin-nav.ts`.
- **Decisión de diseño:** tabla **nueva `Notification`** (dedicada, deny-by-default, con estado leído/no leído). Rechazado: reutilizar `SiteEvent` (mezclaría eventos de clientes con sistema) o feed "virtual" sin tabla (sin estado de lectura ni historial — menos maduro).

## Política de emails (lo que elimina el spam)

| Flujo                                                | Hoy            | Después                                                                                                  |
| ---------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| Alertas del sistema (cron 5 min)                     | Email por lote | **Notificación in-app siempre; email SOLO si alguna es severity "crítica"** (dedup `AlertState` intacto) |
| Resumen diario 8am                                   | Email          | **Notificación in-app (sin email)** con el mismo contenido resumido                                      |
| Nueva cotización                                     | Email admin    | **Notificación + se MANTIENE el email** (es el canal de venta que Lucy pidió)                            |
| Crons que fallan                                     | Solo logs      | **Notificación in-app por fallo** (los éxitos NO se registran — anti-ruido)                              |
| Emails a clientes (pedidos, carrito, stock, reseñas) | Sin cambio     | Sin cambio                                                                                               |

## Pasos

### 1. Modelo de datos

- `packages/db/prisma/schema.prisma`: modelo `Notification`:
  - `id` (cuid), `type` (enum o String: `ALERT`, `CRON`, `QUOTE`, `SYSTEM`), `severity` (`info`|`warning`|`critical`), `title` (String), `detail` (String), `actionUrl` (String? — deep link admin), `actionLabel` (String?), `metadata` (Json default {}), `dedupKey` (String?), `readAt` (DateTime?), `createdAt`.
  - Índices: `(readAt, createdAt)`, `(type, createdAt)`, `(dedupKey, createdAt)`.
- Migración Prisma a mano (como `add_cms_v2`, por el tema shadow DB/pg_trgm) + `supabase/migrations/00000000000024_rls_notifications.sql` con ENABLE RLS deny-by-default + verificación inline (patrón de la 018).

### 2. Servicio `apps/web/features/notifications/service.ts`

- `notify({ type, severity, title, detail, actionUrl?, actionLabel?, metadata?, dedupKey? })` — crea la fila; si `dedupKey` y existe no-leída con esa key → actualiza `createdAt`/detalle en vez de duplicar (anti-ruido en alertas que persisten).
- `listNotifications({ unreadOnly?, type?, limit })`, `getUnreadCount()`, `markRead(id)`, `markAllRead()`.
- `notifyAndMaybeEmail(...)` helper: crea notificación y, si `severity === "critical"`, también envía email a `ALERT_EMAIL` (mismo patrón `sendEmail` + try/catch que nunca rompe).

### 3. Writers (cambio de política)

- `features/observability/alerts.ts` (`dispatchAlerts`): por cada alerta que dispara → `notify(ALERT, severity mapeada crítica→critical/alta→warning/media→info, actionUrl del módulo)`. Email del lote SOLO si alguna es `crítica` (conservar `AlertState` dedup tal cual).
- `features/observability/daily-summary.ts`: reemplazar el `sendEmail` por `notify(SYSTEM, info, "☀️ Resumen Lucams", resumen en texto, actionUrl: "/admin/metricas")`.
- `features/quotes/emails.ts`: tras crear la cotización, además del email → `notify(QUOTE, info, "Nueva cotización COT-XXXX — {nombre} ({ciudad})", actionUrl: "/admin/cotizaciones/{id}")`.
- Endpoints cron `apps/web/app/api/cron/*/route.ts`: en sus ramas de error (ya tienen try/catch + logger) agregar `notify(CRON, warning, 'Cron "{job}" falló', detalle del error, actionUrl: "/admin/observability")`. Solo fallos.

### 4. Admin UI

- `app/admin/(panel)/notificaciones/page.tsx`: feed con icono por tipo (Bell/AlertTriangle/Clock/ShoppingBag/Info), badge de severidad (colores de marca), título, detalle, botón de acción (deep link), fecha `es-CO`, estado leída/no leída (no leída con acento visual), "Marcar leída" por fila, "Marcar todas" arriba, filtro No leídas/Todas, filtro por tipo. Últimas 100 (índice lo cubre).
- `app/admin/(panel)/notificaciones/actions.ts`: `markReadAction`, `markAllReadAction` — patrón `requireAdminAction({ roles: SUPER })` + `recordAdminAction` (sin `updateTag` — lectura directa, nada cacheado).
- **Badge de no leídas:** en el layout del panel admin (`app/admin/(panel)/layout.tsx`) o en el item de nav: conteo con `getUnreadCount()` (query barata con índice `(readAt, createdAt)`) mostrado en el item "Notificaciones" de `lib/admin-nav.ts` (badge numérico estilo "N sin leer") y/o campana en `components/admin-shell.tsx` — elegir el más simple que encaje en el shell actual (leer ambos antes de decidir).
- RBAC: `SUPERADMIN` (como observability).

### 5. Tests (convención del repo: RUN-scoped + afterAll)

- `features/notifications/service.integration.test.ts`: create (dedup por key actualiza en vez de duplicar), list con filtros, unreadCount, markRead/markAllRead.
- Actualizar `alerts.integration.test.ts`: antes asertaba emails; ahora notificaciones creadas + email SOLO con crítica.
- Actualizar `daily-summary.integration.test.ts`: notificación creada, NO email.
- Smoke del page: render con datos sembrados por RUN (filtros + acciones con `requireAdminAction` mockeado como hacen los tests vecinos de admin).

### 6. Migraciones en los 3 ambientes (orden: LOCAL → STG → PRD)

- `prisma migrate deploy` + SQL 024 en LOCAL primero; verificar con la suite.
- STG y PRD: aplicar migraciones vía scripts documentados (mismo orden CI: prisma → supabase/migrations) y verificar con query.

### 7. Docs (memoria/contexto — el plan vive en el repo)

- `docs/PLAN_CENTRO_NOTIFICACIONES.md`: copia del plan de trabajo (este documento) para que cualquier sesión futura retome sin re-explicar (convención del repo: `docs/PLAN_*.md`).
- `docs/OPERATIONS.md` changelog (política nueva de emails + dónde vive el centro).
- `docs/OBSERVABILITY.md`: sección del centro de notificaciones.
- `docs/STATE.md` resumen al cerrar.

### 8. Verificación (gates del repo)

`pnpm --filter web typecheck` · `eslint` · `prettier --check` (OBLIGATORIO que pase — la CI estuvo roja por esto) · `make test-local` verde · `next build` · smoke local en `/admin/notificaciones` con datos sembrados (crear 2-3 notificaciones por seed de prueba, marcar leída, filtro, badge en nav).

## No-objetivos (v1)

- Push/deploy/CI notifications (GitHub/Vercel los manda aparte; se apagan en settings de cada plataforma — eso es humano, fuera del código).
- Reintentos persistidos de email (el aviso in-app ya no se pierde: vive en la tabla).
- Realtime/websockets (el feed se refresca al navegar — suficiente para ops diarias).
- Notificaciones por eventos de pedidos (Etapa 2 aún no vende por canal transaccional; queda el tipo `SYSTEM`/`ORDER` listo para agregar).

## Estimado

1 migración Prisma + 1 SQL RLS + ~6 archivos nuevos (service, page, actions, nav-badge) + ~5 modificados (alerts, daily-summary, quotes/emails, admin-nav, admin-shell o layout) + 2-3 archivos de test. Mitad de la jornada con verificación incluida.
