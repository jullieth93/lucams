# Observabilidad — Lucams_shop

> Cómo sabemos si el sitio está bien. Qué medimos, qué alertamos, qué hacemos cuando algo falla. Sin observabilidad no hay operación productiva — solo esperanza.

## Tabla de contenido

1. [Principios](#principios)
2. [SLOs (Service Level Objectives)](#slos-service-level-objectives)
3. [SLIs (Service Level Indicators)](#slis-service-level-indicators)
4. [Error budgets](#error-budgets)
5. [Dashboards](#dashboards)
6. [Alertas](#alertas)
7. [Logs estructurados](#logs-estructurados)
8. [Métricas custom](#métricas-custom)
9. [Tracing y correlation](#tracing-y-correlation)
10. [Healthchecks](#healthchecks)
11. [On-call (post-lanzamiento)](#on-call-post-lanzamiento)
12. [Process de postmortem](#process-de-postmortem)
13. [Pre-lanzamiento vs post-lanzamiento](#pre-lanzamiento-vs-post-lanzamiento)

---

## Principios

1. **Si no se mide, no existe.** Toda capacidad crítica (checkout, pago, envío) tiene SLI.
2. **Pocas alertas, todas accionables.** Alerta que no se actúa = ruido = se ignora la próxima.
3. **Logs estructurados, no strings.** Todo loggear es JSON con campos.
4. **Correlación obligatoria.** `requestId` propaga de HTTP → DB → jobs → emails.
5. **Free-tier-first** (mandato #2). Vercel Logs + Supabase dashboard alcanza para arrancar; Sentry/BetterStack en Fase 7 si hace falta.

---

## SLOs (Service Level Objectives)

> Compromisos cuantitativos. Si los rompemos, pausamos features y arreglamos.

| SLO                                                                           | Objetivo | Ventana         | Aplicable desde |
| ----------------------------------------------------------------------------- | -------- | --------------- | --------------- |
| **Disponibilidad storefront** (home, catálogo, PDP)                           | 99.5%    | 30 días rolling | Lanzamiento     |
| **Disponibilidad checkout** (`/checkout`, `/api/checkout/create`)             | 99.9%    | 30 días         | Lanzamiento     |
| **Disponibilidad webhooks** (`/api/wompi/webhook`, `/api/webhooks/aveonline`) | 99.9%    | 30 días         | Lanzamiento     |
| **Latencia p95 home (TTFB)**                                                  | < 500 ms | 7 días          | Fase 1          |
| **Latencia p95 PDP**                                                          | < 800 ms | 7 días          | Fase 2          |
| **Latencia p95 `/api/checkout/create`**                                       | < 2 s    | 7 días          | Fase 4          |
| **Latencia p95 `/api/ai/design-suggest`**                                     | < 5 s    | 7 días          | Fase 3          |
| **Tasa de error 5xx global**                                                  | < 0.1%   | 24 h            | Fase 1          |
| **Tasa de webhook fallido (Wompi/Aveonline)**                                 | < 0.5%   | 30 días         | Fase 4          |
| **Tasa de saga fallida** (compensación ejecutada)                             | < 0.2%   | 30 días         | Fase 4          |
| **Tasa de stock oversold**                                                    | 0        | siempre         | Fase 4          |
| **Lighthouse Performance home**                                               | ≥ 95     | cada deploy     | Fase 1          |
| **Lighthouse A11y**                                                           | ≥ 95     | cada deploy     | Fase 1          |
| **Email transactional delivery rate**                                         | ≥ 98%    | 7 días          | Fase 4          |

> **Nota:** estos SLOs son iniciales. Tras 90 días de producción se revisan con datos reales y se ajustan.

> **Medidos hoy (ADR-066, verificado 2026-09-03):** los SLOs de infra (disponibilidad, latencia
> p95 por ruta) se miden con el monitor externo + instrumentación de tráfico post-lanzamiento. Lo
> que SÍ se calcula hoy desde la DB (`features/observability/slos.ts`, visible en
> `/admin/observability` y alertado en el resumen diario): **Web Vitals "good" ≥ 75%** (7 días),
> **éxito de checkout ≥ 90%** (30 días) y **procesamiento de webhooks ≥ 99%** (30 días) — con
> clasificación cumplido / en riesgo / incumplido, o "sin datos suficientes" si la muestra es
> chica (pre-lanzamiento).

---

## SLIs (Service Level Indicators)

Las señales que medimos. Cada SLO se calcula a partir de SLIs.

| SLI                         | Cómo se mide                                                                                                                | Fuente                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Request count               | Total de requests por ruta y status                                                                                         | Vercel Logs (parsing); `/api/metrics` es objetivo (aún no implementado) |
| Latency p50/p95/p99         | Histograma por ruta                                                                                                         | Logs estructurados con `latencyMs`                                      |
| 5xx rate                    | `count(status>=500) / count(*)`                                                                                             | Logs + tabla `ErrorLog` (conteo por ventana en `evaluateAlerts`)        |
| Webhooks estancados         | `count(WebhookEvent where processedAt is null y createdAt < hace 1h)`                                                       | Tabla `WebhookEvent` (alerta `webhooks_stuck`)                          |
| Órdenes a reconciliar       | `count(Order where needsReconciliation)`                                                                                    | Tabla `Order` (alerta `reconciliation`)                                 |
| Stock oversold events       | Incidencias detectadas vía reconciliación + ledger `InventoryLog` (reasons `ORDER_PAID`/`ORDER_CANCELLED`/`ORDER_REFUNDED`) | Tabla `InventoryLog`                                                    |
| Cart-to-checkout conversion | `count(orders) / count(carts created last 7 days)`                                                                          | Reporte diario                                                          |
| AbandonedCart recovery rate | `count(abandonedCart.recovered) / count(abandonedCart created)`                                                             | Tabla `AbandonedCart`                                                   |
| Resend bounce rate          | Resend dashboard                                                                                                            | Panel oficial                                                           |
| Cron lag (dead-man switch)  | Latido `recordCronHeartbeat` por job (clave `cron:<job>` en `AlertState`); overdue si no corrió en 2× su intervalo          | `getCronHealth` → `/api/health/crons`                                   |
| pg_cron ejecuciones         | Historial de corridas de los jobs                                                                                           | `cron.job_run_details` (Supabase)                                       |

---

## Error budgets

> Si el SLO es 99.9%, el error budget es 0.1% — para 30 días, ~43 minutos de downtime tolerados.

### Política

- **Budget consumido < 50%:** velocidad normal de features.
- **Budget consumido 50-100%:** **freeze de features** que tocan la capa afectada. Solo bugfixes y mejoras de fiabilidad.
- **Budget agotado:** rollback a estado estable conocido + postmortem obligatorio + plan de remediación antes de cualquier feature.

### Tracking

> **Pendiente — NO implementado (verificado 2026-08-01).** Lo de abajo es el diseño objetivo: hoy
> no existe el cron de error budgets (ninguna migración en `supabase/migrations/` ni endpoint en
> `app/api/cron/` lo calcula) ni la página `/admin/observability/slos`. El seguimiento del budget
> es manual.

- (Objetivo) Cron mensual (`pg_cron`) calcula error budgets a partir de los SLIs de los últimos 30 días.
- (Objetivo) Resultado se publica en `/admin/observability/slos`.
- (Objetivo) Cuando un budget consume > 50%, alerta automática (Resend al usuario operador).

---

## Dashboards

> Pre-lanzamiento: tabla simple en `/admin/observability`. Post-lanzamiento: evaluar Grafana Cloud Free, BetterStack, o Vercel Web Analytics (Pro).

> **Estado real (verificado 2026-09-03):** `/admin/observability` YA existe (solo rol SUPERADMIN)
> y muestra la salud técnica (ErrorLog de servidor + ErrorReport de cliente deduplicados,
> webhooks, órdenes a reconciliar, reversas de stock, Web Vitals), el resumen de operación diaria,
> los 3 SLOs medibles y la salud de los 8 crons. Las alertas y el resumen diario aterrizan en el
> centro de notificaciones `/admin/notificaciones`.

### Dashboard "Operación diaria"

Panel que el operador del negocio mira cada mañana:

- **Hoy:** órdenes nuevas, ingresos, órdenes en `PENDING_PAYMENT`, órdenes pendientes de envío.
- **Stock crítico:** variantes con `stock < 5`.
- **Reseñas pendientes de aprobación:** queue size.
- **Carritos abandonados últimas 24h:** count + tasa de recuperación.
- **Errores 5xx últimas 24h:** count + ruta principal.

### Dashboard "Salud técnica"

Panel para el dev/Claude:

- **Latencia p50/p95/p99** por ruta (top 10 rutas).
- **5xx rate** por ruta.
- **Salud de crons:** latido por job (`getCronHealth` — ya visible en `/admin/observability`).
- **`pg_cron` últimos runs:** ¿están corriendo a tiempo?
- **Órdenes a reconciliar** (pago vs stock inconsistente): count.
- **Webhook events processed/failed last 7 days.**
- **DB connection pool saturation.**
- **Storage usage:** % del free tier consumido.

### Dashboard "SLOs"

- Cada SLO con: % cumplimiento ventana actual, error budget remaining, tendencia 30 días.
- Cuando un SLO se rompe: badge rojo + link al postmortem si existe.

---

## Alertas

> Mandato: cada alerta debe describir **qué se rompió + qué hay que hacer**. Si la alerta es solo "algo está mal", se mejora antes de habilitarse.

### Canal

- **Hoy (política 2026-08-05, verificado 2026-09-03):** el **centro de notificaciones in-app**
  (`/admin/notificaciones`) es la fuente de verdad — TODA alerta que dispara deja notificación
  ahí (dedup por `dedupKey`: una alerta que persiste actualiza la misma fila, no duplica). El
  **email** vía Resend (al setting `ALERT_EMAIL`, default `hola@lucamsshop.com`) **solo sale si
  alguna alerta del lote es crítica**; anti-spam de 30 min por key (`AlertState`). Si el envío
  falla, no se sella `lastSentAt` → la alerta se reintenta en el próximo ciclo.
- **Post-lanzamiento:** evaluar Discord webhook o Telegram bot — más inmediato que email.

### Reglas de alerta

> **Implementadas hoy** (`evaluateAlerts` en `features/observability/alerts.ts`, corre cada 5 min
> vía pg_cron → `/api/cron/alerts`): `errors_spike` (5+ `ErrorLog` en 5 min), `reconciliation`
> (órdenes con `needsReconciliation`), `webhooks_stuck` (WebhookEvent sin procesar > 1h),
> `pending_payment_wompi_stale` (orden Wompi > 2h en PENDING_PAYMENT) y `cron_stale_<job>`
> (dead-man switch — ver la fila pg_cron de la tabla). **El resto de la tabla es objetivo** — se
> activa con el monitor externo y la instrumentación post-lanzamiento. Nota: hoy no hay pgmq ni
> Edge Functions consumer; los jobs son crons HTTP + tablas.

| Disparador (objetivo salvo las 5 implementadas)                                          | Canal | Severidad | Acción inmediata                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5+ errores 500 en 5 min en una misma ruta                                                | Email | Alta      | Ver Vercel Logs ruta afectada; rollback si reciente                                                                                                                                                                                                                                                                                        |
| Webhook handler fallando > 3 veces consecutivas                                          | Email | Alta      | Verificar payload + firma + Wompi/Aveonline status                                                                                                                                                                                                                                                                                         |
| Saga compensation fallida (estado inconsistente)                                         | Email | Crítica   | Intervención manual; revisar órdenes `needsReconciliation` y reconciliar (no existe tabla `SagaLog` — la señal real vive en `Order`)                                                                                                                                                                                                       |
| `/api/health` devuelve 503 por > 3 min                                                   | Email | Crítica   | Verificar Supabase status, Vercel status                                                                                                                                                                                                                                                                                                   |
| Stock oversold detectado                                                                 | Email | Crítica   | Contactar cliente afectado, ofrecer reembolso/sustituto                                                                                                                                                                                                                                                                                    |
| Wompi webhook signature inválida (3+ en 5 min)                                           | Email | Media     | Posible ataque de replay, revisar `WebhookEvent`                                                                                                                                                                                                                                                                                           |
| Resend bounce rate > 5%                                                                  | Email | Media     | Revisar SPF/DKIM/DMARC, posible problema reputacional                                                                                                                                                                                                                                                                                      |
| Supabase Free DB > 80% capacity                                                          | Email | Media     | Migrar a Pro                                                                                                                                                                                                                                                                                                                               |
| (Objetivo) Lag de cola de jobs > 30 min (hoy los jobs son crons HTTP + tablas, sin pgmq) | Email | Media     | Verificar `/api/health/crons` y `cron.job_run_details`                                                                                                                                                                                                                                                                                     |
| `pg_cron` job no ejecutado en su ventana (2× intervalo)                                  | Email | Media     | **Implementado (v3 #15):** dead-man switch. Capa interna: `evaluateAlerts` marca `cron_stale_<job>` vía `getCronHealth` (latido `recordCronHeartbeat` en cada cron). Capa externa: `GET /api/health/crons` → 503 → monitor de uptime externo (cubre la caída del propio cron de alertas). Revisar `cron.job_run_details` + secretos Vault. |
| Lighthouse Performance < 90 en deploy a producción                                       | Email | Baja      | Revisar bundle size diff                                                                                                                                                                                                                                                                                                                   |
| Error budget > 50% consumido en SLO crítico                                              | Email | Alta      | Activar feature freeze                                                                                                                                                                                                                                                                                                                     |

### Anti-spam

- **Deduplicación:** in-app por `dedupKey` (la alerta que persiste actualiza la misma notificación no leída); el email no se reenvía si salió hace < 30 min (`AlertState`).
- **Resumen diario:** desde 2026-08-05 ya NO va por email — se publica SIEMPRE una vez al día como notificación in-app en `/admin/notificaciones` (cron `daily-summary` vía pg_cron → `/api/cron/daily-summary`, 8am America/Bogota; guarda anti-duplicado de 12h). Contenido de las últimas 24h: pedidos e ingresos cobrados (Wompi + COD entregado), COD por cobrar/remitir, por despachar, stock crítico, reseñas pendientes, retractos con reloj legal, carritos abandonados/recuperados, errores con ruta principal, órdenes a reconciliar y SLOs incumplidos (`features/observability/daily-summary.ts`).

### Retención y purga (Ley 1581 — minimización)

El cron diario `purge-event-logs` (pg_cron → `/api/cron/purge-event-logs`, código en
`features/observability/event-log-retention.ts`) borra:

| Tabla          | Retención | Criterio de borrado                                                                |
| -------------- | --------- | ---------------------------------------------------------------------------------- |
| `EmailEvent`   | 180 días  | `createdAt` (deliverability)                                                       |
| `WebhookEvent` | 180 días  | `createdAt` y ya procesado (`processedAt` no nulo — no borra eventos en reintento) |
| `ErrorLog`     | 90 días   | `createdAt` (auditoría 2026-08-24 · F-6)                                           |
| `ErrorReport`  | 90 días   | `lastSeenAt` — un error que sigue ocurriendo NO se borra aunque sea viejo          |

Todo message/stack pasa por `scrubPii` (emails → `[EMAIL]`, teléfonos → `[PHONE]`) ANTES del
insert (F-6): la PII no queda en claro ni en DB. Además el cron `purge-anon-designs` borra los
diseños DRAFT anónimos abandonados y sus fotos del bucket privado.

---

## Logs estructurados

Definidos en [`CONVENTIONS.md` § Logging](./CONVENTIONS.md#logging-y-request-id-correlation). Resumen:

- JSON con `timestamp`, `level`, `requestId`, `event`, contexto.
- PII redactada por key (`redact`: password/token/secret/email/phone/... → `[REDACTED]`) y por contenido (`scrubPii`: emails → `[EMAIL]`, teléfonos → `[PHONE]`).
- Niveles: `debug` (default en dev), `info` (default en prod), `warn` (anómalo no roto), `error` (atención).

> **Implementación real (verificado 2026-09-03):** `lib/logger.ts` es un logger PROPIO sobre
> `console.log` con API compatible con pino (NO pino instalado — bug de bundling con turbopack de
> Next 16). Los nombres de evento concretos en código siguen el namespace
> `<dominio>.<evento>[.fail]` (ej. `security.admin_login.fail`, `alerts.sent`,
> `retention.purge_event_logs`); la tabla de abajo es la convención de diseño de qué eventos
> importan.

### Eventos importantes a loggear

| Evento                      | Campos                                                | Nivel         |
| --------------------------- | ----------------------------------------------------- | ------------- |
| `request.start`             | `method`, `path`, `requestId`, `userId?`              | `info`        |
| `request.end`               | `method`, `path`, `status`, `latencyMs`, `requestId`  | `info`        |
| `auth.login.success`        | `userId`, `requestId`                                 | `info`        |
| `auth.login.fail`           | `email_hash`, `requestId`, `reason`                   | `warn`        |
| `order.created`             | `orderId`, `customerId`, `total`, `requestId`         | `info`        |
| `payment.approved`          | `orderId`, `wompiTransactionId`, `requestId`          | `info`        |
| `payment.declined`          | `orderId`, `reason`, `requestId`                      | `warn`        |
| `saga.start`                | `sagaName`, `sagaId`, `requestId`                     | `info`        |
| `saga.step`                 | `sagaName`, `step`, `status`, `requestId`             | `info`/`warn` |
| `saga.compensation`         | `sagaName`, `step`, `status`, `requestId`             | `error`       |
| `webhook.received`          | `source`, `externalId`, `requestId`                   | `info`        |
| `webhook.signature.invalid` | `source`, `requestId`, `reason`                       | `warn`        |
| `rate_limit.exceeded`       | `key`, `limit`, `requestId`                           | `warn`        |
| `circuit_breaker.open`      | `service` (`wompi`/`aveonline`), `failures`           | `warn`        |
| `error.unhandled`           | `requestId`, `error.message`, `error.stack` (sin PII) | `error`       |

---

## Métricas custom

> **Pendiente — NO implementado (verificado 2026-09-03):** no existe `app/api/metrics` en el
> código. Lo de abajo es el diseño objetivo (la sección § Pre-lanzamiento vs post-lanzamiento ya
> lo ubica en Fase 7+).

Endpoint `/api/metrics` (objetivo) que devuelve métricas mínimas en formato Prometheus o JSON simple:

```
# HELP lucams_orders_total Total de órdenes creadas
# TYPE lucams_orders_total counter
lucams_orders_total{status="paid"} 1234
lucams_orders_total{status="cancelled"} 56

# HELP lucams_request_duration_ms Histograma de latencia
# TYPE lucams_request_duration_ms histogram
lucams_request_duration_ms_bucket{route="/api/checkout/create",le="100"} 100
lucams_request_duration_ms_bucket{route="/api/checkout/create",le="500"} 500
...

# HELP lucams_cron_overdue Crons pg_cron sin latido en 2× su intervalo (dead-man switch)
# TYPE lucams_cron_overdue gauge
lucams_cron_overdue{job="daily_summary"} 0
```

> **Acceso:** `/api/metrics` protegido por header `Authorization: Bearer <METRICS_TOKEN>` (token en env). Para que en el futuro Grafana o un scraper lo pueda consumir.

---

## Tracing y correlation

### Pre-lanzamiento (Fase 0–6)

> **Estado real (verificado 2026-09-03):** hoy el `requestId` lo genera el proxy
> (`crypto.randomUUID()` por request) y viaja en el response header `X-Request-Id`; un handler
> puede loguearlo leyéndolo de los headers. La propagación server-side por `AsyncLocalStorage`
> (`lib/request-id.ts`) y los headers salientes `X-Lucams-Request-Id` de abajo son OBJETIVO — no
> implementados.

- **`requestId`** propagado vía `AsyncLocalStorage` en server-side (`lib/request-id.ts`).
- En logs: `requestId` en cada entry.
- En jobs/colas: incluir `requestId` en el payload o detalle del job para que el consumer/cron lo loggee.
- En emails: incluir `X-Lucams-Request-Id` header al enviar a Resend.
- En llamadas a Wompi/Aveonline: incluir `X-Lucams-Request-Id` en el header (no es estándar; algunos APIs lo aceptan, otros lo ignoran — sin efecto adverso).

### Post-lanzamiento (Fase 7+)

Evaluar OpenTelemetry SDK con exporter a un backend gratuito (Honeycomb Free, Grafana Tempo). Decisión en ADR-024 cuando se tome.

---

## Healthchecks

| Endpoint                                                        | Qué verifica                                                                                                                                           | Timeout |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `GET /api/health`                                               | App viva (devuelve `200 OK`; respuesta pública mínima, sin version/entorno)                                                                            | 1 s     |
| `GET /api/health/db`                                            | Postgres responde un `SELECT 1` (Prisma)                                                                                                               | 2 s     |
| `GET /api/health/wompi` · `/aveonline` · `/resend` · `/storage` | Cada integración por separado (bajo `/api/health/`)                                                                                                    | 5 s     |
| `GET /api/health/all`                                           | Agrega todos los checks: 503 si falla uno crítico (db + storage); el resto warn/fail no tumba. `version`/`environment` solo con header `x-cron-secret` | 6 s     |
| `GET /api/health/crons`                                         | Dead-man switch de los 8 crons pg_cron: 503 si alguno no corrió en 2× su intervalo. Detalle (jobs/lastRunAt/disabled) solo con `x-cron-secret`         | 2 s     |

### Implementación

```ts
// app/api/health/route.ts — respuesta pública mínima (auditoría 2026-08-24, C-3):
// sin version/entorno (el repo es público; el SHA exacto es reconocimiento gratis).
// Rate-limit 30/min por IP (misma auditoría). force-dynamic.
export async function GET() {
  return Response.json({
    status: "ok",
    service: "lucams-shop-web",
    timestamp: new Date().toISOString(),
  });
}
```

```ts
// app/api/health/db/route.ts — real: Prisma directo, RFC 7807 si falla, rate-limit 30/min/IP
import { prisma } from "@/lib/db";
export async function GET() {
  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`; // si lanza → 503 problemResponse (sin exponer creds)
  return Response.json({
    status: "ok",
    service: "lucams-shop-web",
    check: "postgres",
    latencyMs: Date.now() - start,
  });
}
```

### Monitoreo externo

Post-lanzamiento: configurar **UptimeRobot** o **BetterStack** (Free) para pingear `/api/health` cada 5 min y alertar si cae > 3 min. Detalle de jobs en `/api/health/crons` y de versión/entorno en `/api/health/all` requieren el header `x-cron-secret` (auditoría 2026-08-24, C-3/C-4) — ambos monitores soportan headers custom; la respuesta pública queda mínima (`status` + `timestamp`, 503 si degradado).

---

## On-call (post-lanzamiento)

Mientras el equipo es 1 persona, no hay rotación formal. Pero:

- **Escalamiento documentado** en OPERATIONS.md (a quién avisar para Wompi caído, Aveonline caído, Vercel caído, Supabase caído).
- **Runbook por incidente** en `OPERATIONS.md` (ya existe la base — expandir con cada incidente).
- **Modo mantenimiento** activable con env var `NEXT_PUBLIC_MAINTENANCE_MODE=1` (ver `SECURITY.md` § Otros vectores y el runbook en `OPERATIONS.md`; al ser `NEXT_PUBLIC_*` se inliniza en build → **requiere redeploy**).

---

## Process de postmortem

Para todo incidente de severidad alta o crítica.

### Timing

- **24 h post-resolución:** primera versión del postmortem en `docs/incidents/YYYY-MM-DD-<slug>.md`.
- **48 h post-resolución:** revisión y publicación final.

### Plantilla

```markdown
# Incidente — YYYY-MM-DD — <título corto>

## Resumen

Una frase ejecutiva.

## Impacto

- Usuarios afectados: ~X
- Duración: HH:MM – HH:MM (Z minutos)
- Pérdida de datos: sí/no
- Pérdida de ingresos: ~$X COP estimados

## Cronología

- HH:MM — síntoma reportado por...
- HH:MM — Claude/operador identificó causa...
- HH:MM — fix aplicado...
- HH:MM — verificación...

## Causa raíz

Sin culpas. Sin "el dev se equivocó". Foco en sistema.

## Lo que estuvo bien

- ...

## Lo que estuvo mal

- ...

## Acciones (con responsable y fecha límite)

- [ ] Acción 1 — [responsable] — fecha
- [ ] Acción 2 — [responsable] — fecha

## Lecciones aprendidas

- ...
```

### Cultura

- **Blameless.** Postmortem cero culpas.
- **Acciones concretas.** "Mejorar tests" no, "agregar test E2E para caso X" sí.
- **Compartir.** Al equipo, eventualmente al público (transparencia).

---

## Pre-lanzamiento vs post-lanzamiento

### Fase 0–6: lo mínimo viable

- Logs estructurados (logger propio API-compatible con pino + `X-Request-Id` del proxy).
- Vercel Logs como única vista.
- Supabase dashboard para DB.
- Alertas en el centro de notificaciones in-app (`/admin/notificaciones`); email vía Resend solo si hay crítica.
- Healthchecks `/api/health/*`.
- Dashboards en `/admin/observability` (queries SQL contra logs y tablas).

### Fase 7+: upgrade

- Decisión de monitoreo de errores (ADR-022): Sentry Free o alternativa.
- Métricas custom expuestas (`/api/metrics`).
- UptimeRobot/BetterStack para healthchecks externos.
- Eventualmente: distributed tracing si la arquitectura crece.
