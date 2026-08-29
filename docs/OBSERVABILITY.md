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

---

## SLIs (Service Level Indicators)

Las señales que medimos. Cada SLO se calcula a partir de SLIs.

| SLI                         | Cómo se mide                                                         | Fuente                                                    |
| --------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Request count               | Total de requests por ruta y status                                  | Vercel Logs (parsing) o métricas custom en `/api/metrics` |
| Latency p50/p95/p99         | Histograma por ruta                                                  | Logs estructurados con `latencyMs`                        |
| 5xx rate                    | `count(status>=500) / count(*)`                                      | Logs                                                      |
| Webhook signature failures  | `count(WebhookEvent where signatureValid=false)`                     | Tabla `WebhookEvent`                                      |
| Saga compensations          | `count(SagaLog where status='compensation-failed')`                  | Tabla `SagaLog`                                           |
| Stock oversold events       | Incidencias detectadas + `inventoryLog.reason='OVERSOLD_RECONCILED'` | Tabla `InventoryLog`                                      |
| Cart-to-checkout conversion | `count(orders) / count(carts created last 7 days)`                   | Reporte diario                                            |
| AbandonedCart recovery rate | `count(abandonedCart.recovered) / count(abandonedCart created)`      | Tabla `AbandonedCart`                                     |
| Resend bounce rate          | Resend dashboard                                                     | Panel oficial                                             |
| pgmq lag                    | `MAX(NOW() - enqueuedAt)` por cola                                   | Query SQL sobre `pgmq.q_<name>`                           |
| pg_cron lag                 | Diferencia entre próximo run programado y ejecutado                  | `cron.job_run_details`                                    |

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
- **pgmq lag** por cola.
- **`pg_cron` últimos runs:** ¿están corriendo a tiempo?
- **Saga compensations last 7 days:** count + razón.
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

- **Pre-Sentry (Fase 0–6):** email vía Resend al operador (`alertas@lucamsshop.com`).
- **Post-lanzamiento:** evaluar Discord webhook o Telegram bot — más inmediato que email.

### Reglas de alerta iniciales

| Disparador                                                | Canal | Severidad | Acción inmediata                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5+ errores 500 en 5 min en una misma ruta                 | Email | Alta      | Ver Vercel Logs ruta afectada; rollback si reciente                                                                                                                                                                                                                                                                                        |
| Webhook handler fallando > 3 veces consecutivas           | Email | Alta      | Verificar payload + firma + Wompi/Aveonline status                                                                                                                                                                                                                                                                                         |
| Saga compensation fallida (estado inconsistente)          | Email | Crítica   | Intervención manual; revisar `SagaLog` y reconciliar                                                                                                                                                                                                                                                                                       |
| `/api/health` devuelve 503 por > 3 min                    | Email | Crítica   | Verificar Supabase status, Vercel status                                                                                                                                                                                                                                                                                                   |
| Stock oversold detectado                                  | Email | Crítica   | Contactar cliente afectado, ofrecer reembolso/sustituto                                                                                                                                                                                                                                                                                    |
| Wompi webhook signature inválida (3+ en 5 min)            | Email | Media     | Posible ataque de replay, revisar `WebhookEvent`                                                                                                                                                                                                                                                                                           |
| Resend bounce rate > 5%                                   | Email | Media     | Revisar SPF/DKIM/DMARC, posible problema reputacional                                                                                                                                                                                                                                                                                      |
| Supabase Free DB > 80% capacity                           | Email | Media     | Migrar a Pro                                                                                                                                                                                                                                                                                                                               |
| pgmq queue lag > 30 min en `email_send` o `cart_recovery` | Email | Media     | Verificar consumer Edge Function                                                                                                                                                                                                                                                                                                           |
| `pg_cron` job no ejecutado en su ventana (2× intervalo)   | Email | Media     | **Implementado (v3 #15):** dead-man switch. Capa interna: `evaluateAlerts` marca `cron_stale_<job>` vía `getCronHealth` (latido `recordCronHeartbeat` en cada cron). Capa externa: `GET /api/health/crons` → 503 → monitor de uptime externo (cubre la caída del propio cron de alertas). Revisar `cron.job_run_details` + secretos Vault. |
| Lighthouse Performance < 90 en deploy a producción        | Email | Baja      | Revisar bundle size diff                                                                                                                                                                                                                                                                                                                   |
| Error budget > 50% consumido en SLO crítico               | Email | Alta      | Activar feature freeze                                                                                                                                                                                                                                                                                                                     |

### Anti-spam

- **Deduplicación:** misma alerta no se reenvía si llegó hace < 30 min.
- **Resumen diario:** un email a las 8am con todo lo de las últimas 24h (alertas que no son críticas).

---

## Logs estructurados

Definidos en [`CONVENTIONS.md` § Logging](./CONVENTIONS.md#logging-y-request-id-correlation). Resumen:

- JSON con `timestamp`, `level`, `requestId`, `event`, contexto.
- PII redactada vía pino `redact`.
- Niveles: `debug` (dev only), `info` (eventos normales), `warn` (anómalo no roto), `error` (atención), `fatal` (proceso muerto).

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

Endpoint `/api/metrics` (Fase 1) que devuelve métricas mínimas en formato Prometheus o JSON simple:

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

# HELP lucams_pgmq_lag_seconds Lag de la cola
# TYPE lucams_pgmq_lag_seconds gauge
lucams_pgmq_lag_seconds{queue="email_send"} 12
```

> **Acceso:** `/api/metrics` protegido por header `Authorization: Bearer <METRICS_TOKEN>` (token en env). Para que en el futuro Grafana o un scraper lo pueda consumir.

---

## Tracing y correlation

### Pre-lanzamiento (Fase 0–6)

- **`requestId`** propagado vía `AsyncLocalStorage` en server-side (`lib/request-id.ts`).
- En logs: `requestId` en cada entry.
- En `pgmq` mensajes: incluir `requestId` en el payload del mensaje para que el consumer lo loggee.
- En emails: incluir `X-Lucams-Request-Id` header al enviar a Resend.
- En llamadas a Wompi/Aveonline: incluir `X-Lucams-Request-Id` en el header (no es estándar; algunos APIs lo aceptan, otros lo ignoran — sin efecto adverso).

### Post-lanzamiento (Fase 7+)

Evaluar OpenTelemetry SDK con exporter a un backend gratuito (Honeycomb Free, Grafana Tempo). Decisión en ADR-024 cuando se tome.

---

## Healthchecks

| Endpoint                       | Qué verifica                                                                   | Timeout |
| ------------------------------ | ------------------------------------------------------------------------------ | ------- |
| `GET /api/health`              | App viva (devuelve `200 OK`)                                                   | 1 s     |
| `GET /api/health/db`           | Postgres responde un `SELECT 1`                                                | 2 s     |
| `GET /api/health/integrations` | Wompi, Aveonline, Resend respondieron a `/health` o equivalente en último ping | 5 s     |

### Implementación

```ts
// app/api/health/route.ts — respuesta pública mínima (auditoría 2026-08-24, C-3):
// sin version/entorno (el repo es público; el SHA exacto es reconocimiento gratis).
export async function GET() {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
```

```ts
// app/api/health/db/route.ts
import { supabaseAdmin } from "@/lib/supabase/service";
export async function GET() {
  const start = Date.now();
  const { error } = await supabaseAdmin.rpc("health_check"); // función SQL que hace SELECT 1
  const latencyMs = Date.now() - start;
  if (error) {
    return Response.json({ status: "error", error: error.message }, { status: 503 });
  }
  return Response.json({ status: "ok", latencyMs });
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

- Logs estructurados (`pino` + `requestId`).
- Vercel Logs como única vista.
- Supabase dashboard para DB.
- Alertas vía Resend cuando se cumplan umbrales.
- Healthchecks `/api/health/*`.
- Dashboards en `/admin/observability` (queries SQL contra logs y tablas).

### Fase 7+: upgrade

- Decisión de monitoreo de errores (ADR-022): Sentry Free o alternativa.
- Métricas custom expuestas (`/api/metrics`).
- UptimeRobot/BetterStack para healthchecks externos.
- Eventualmente: distributed tracing si la arquitectura crece.
