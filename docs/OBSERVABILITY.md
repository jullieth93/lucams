# Observabilidad, Monitoreo y Alertas — Lucams Shop

> **Documento vivo (Nivel 1).** Especificación verificada contra el código real de la arquitectura de observabilidad sin SaaS externos de Lucams Shop: principios, desglose de los **7 tableros administrativos** y `/status`, sondas de salud (`/api/health/*`), monitor externo cruzado `uptime-monitor-prd` (Supabase STG → PRD), logging estructurado JSON (`lib/logger.ts` API-compatible con Pino + `scrubPii`), captura de errores (`ErrorLog` y `ErrorReport`), análisis del punto ciego de base de datos, monitoreo dead-man switch de los **14 crons** de `CRON_JOBS` (frente a los **18 procesos programados** totales), motor de **12 reglas de alerta** + alertas transaccionales inmediatas, **SLOs cuantitativos, SLIs y política de Error Budgets**, Web Vitals RUM (`ADR-135`), embudo sin cookies (`FunnelEventDaily`) vs GA4, inteligencia conductual CRM/RFM, políticas de retención de **12 fuentes** y proceso de postmortem _blameless_.
>
> **Documentos relacionados:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`OPERATIONS.md`](OPERATIONS.md) · [`SECURITY.md`](SECURITY.md) · [`COMPLIANCE.md`](COMPLIANCE.md) · [`CONVENTIONS.md`](CONVENTIONS.md) · [`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md) · [`integrations/supabase.md`](integrations/supabase.md) · [`integrations/github-and-ops.md`](integrations/github-and-ops.md)

---

## 1. Principios, arquitectura sin SaaS externos y los 7 tableros de `/admin`

### 1.1 Los 5 principios rectores

1. **Si no se mide, no existe:** toda capacidad crítica (checkout, pagos Wompi, envíos Aveonline, renders 300 DPI, entregabilidad de correo y crons) expone un indicador verificable (SLI).
2. **Pocas alertas, todas accionables:** cada regla de alerta describe **qué se rompió** y **qué acción concreta ejecutar**; una alerta sin acción genera fatiga y termina ignorándose.
3. **Logs estructurados en JSON, jamás cadenas sueltas:** todo evento de servidor pasa por `apps/web/lib/logger.ts` con `event`, nivel, `requestId` y redacción automática de PII y secretos.
4. **Correlación extremo a extremo:** cada petición recibe `X-Request-Id` en `proxy.ts`, y los errores de servidor guardan el `digest` de Next.js para cruzarlos con Vercel Runtime Logs.
5. **Cero SaaS externos costosos (cero Sentry, Datadog ni UptimeRobot):** toda telemetría vive con retención acotada en nuestra propia instancia Postgres (Supabase), respaldada por monitoreo cruzado entre proyectos (`STG → PRD`) y flujos en GitHub Actions.

### 1.2 Mapa y desglose detallado de las 8 superficies de monitoreo (`7` en `/admin` + `/status`)

| #   | Superficie                     | Ruta real en `apps/web/app/`                        | Acceso RBAC (`AdminCapability`) | Propósito principal                                                                                                |
| --- | ------------------------------ | --------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | **Resumen general**            | `/admin/dashboard` (`dashboard/page.tsx`)           | Todos los roles operativos      | Pulso comercial del día: órdenes nuevas, ingresos, pendientes de despacho, stock crítico y accesos rápidos         |
| 2   | **Bandeja operativa «Hoy»**    | `/admin/hoy` (`hoy/page.tsx`)                       | Filtrado por capacidad del rol  | Cola priorizada por semáforos SLA colombianos (PQR, garantías, retractos), reconciliaciones, moderación y CRM      |
| 3   | **Salud técnica**              | `/admin/observability` (`observability/page.tsx`)   | `SUPERADMIN` (`system:read`)    | `ErrorLog`, `ErrorReport`, webhooks recientes, SLOs, 14 crons, backups R2, monitor STG→PRD, Resend y cuotas DB     |
| 4   | **Rendimiento RUM**            | `/admin/performance` (`performance/page.tsx`)       | `SUPERADMIN` (`system:read`)    | Percentiles `p50`/`p75`/`p95` de 8 métricas Web Vitals, selectores CSS lentos y errores agrupados por `digest`     |
| 5   | **Centro de notificaciones**   | `/admin/notificaciones` (`notificaciones/page.tsx`) | Roles admin según alcance       | Fuente única in-app de alertas (`Notification` deduplicada por `dedupKey`), fallos de cron, stock y resumen 8 a.m. |
| 6   | **Estado de integraciones**    | `/admin/integraciones` (`integraciones/page.tsx`)   | `SUPERADMIN` (`system:read`)    | Diagnóstico interactivo de credenciales y conectividad de Supabase, Wompi, Aveonline, Resend, Cloudflare y Gemini  |
| 7   | **Métricas, Embudo y CRM/RFM** | `/admin/metricas` (`metricas/page.tsx`)             | `metrics:read`                  | Ingresos cobrados, cotizaciones, embudo de 11 etapas (`FunnelEventDaily`), matriz RFM (5 niveles) y LTV neto COP   |
| 8   | **Estado público**             | `/status` (`app/status/page.tsx`)                   | Público (`noindex`)             | Semáforo en tiempo real de servicios para compradores sin filtrar topología ni errores internos                    |

#### Detalle operativo de cada tablero administrativo

1. **`/admin/dashboard` (Operación comercial diaria):** muestra de un vistazo las órdenes creadas hoy, ingresos efectivamente cobrados, órdenes en `PENDING_PAYMENT`, pedidos pagados pendientes de despacho, variantes con stock crítico (`stock < 5`), cola de reseñas pendientes de moderación y carritos abandonados de las últimas 24 horas con su tasa de recuperación.
2. **`/admin/hoy` (`getTodayOperationalInbox`):** bandeja accionable de primera hora construida por rol: oculta cualquier bloque para el que el operador no posea `AdminCapability` y aplica enmascaramiento de PII (`lib/pii-mask.ts`) a roles no privilegiados. Ordena por urgencia: (a) tickets PQR, garantías y retractos con reloj SLA colombiano en estado `OVERDUE` o `DUE_SOON` (`lib/colombian-sla.ts`), (b) órdenes marcadas con `needsReconciliation = true`, (c) diseños personalizados pendientes de moderación antes de taller, y (d) tareas/seguimientos vencidos de `ContactActivity` y `Opportunity`.
3. **`/admin/observability` (Salud técnica — exclusivo `SUPERADMIN`):** consolida en una sola pantalla:
   - Resumen operativo 24h y los **3 SLOs cuantitativos** de `slos.ts` (`met`, `at_risk`, `breached`, `insufficient_data`).
   - Salud individual de los **14 crons** de `CRON_JOBS` (`getCronHealth`: último latido, detalle `idle (...)` y bandera `overdue`).
   - Tile del **backup diario cifrado a R2** (`AlertState["backup:last-success"]`) y tile del **monitor externo cruzado** (`AlertState["uptime-monitor:last-run"]`).
   - **Entregabilidad de correo a 7 días** (`features/observability/email-deliverability.ts`: enviados, entregados, rebotes y quejas sobre `EmailEvent`).
   - **Cuotas físicas reales:** tamaño de Postgres (`pg_database_size(current_database())` frente a 500 MB) y ocupación de Storage (`SUM(metadata->>'size')` en `storage.objects` frente a 1 GB).
   - Tabla **«Webhooks recientes»** (últimos 12 registros de `WebhookEvent` con proveedor, `externalId`, fecha y si ya tiene `processedAt`), conteo de órdenes a reconciliar, reversas de inventario y consola de triaje de **`ErrorLog`** (servidor) y **`ErrorReport`** (cliente deduplicado con cambio de estado `OPEN` / `RESOLVED` / `IGNORED`).
4. **`/admin/performance` (`ADR-135` — exclusivo `SUPERADMIN`):** agrega `WebVital` sobre ventana móvil de 7 días (`MAX_VITAL_ROWS = 200 000`) presentando tarjetas **`p75`** (estándar oficial de Core Web Vitals) junto con `p50` y `p95`, selectores por dispositivo (`mobile` / `desktop`) y tipo de navegación (`navigate` / `reload` / `back-forward`), tabla comparativa por ruta normalizada, **atribución por elemento DOM (`target` selector CSS)** para `INP`, `CLS` y `LCP` (con mínimo de 3 muestras para filtrar ruido) y listado de errores de servidor agrupados por `digest` con stack expandible (complementado por CLI con `scripts/diag-stg/07-errores-recientes.sql`).
5. **`/admin/notificaciones`:** bandeja persistente donde convergen las 12 reglas periódicas de `evaluateAlerts`, las alertas instantáneas (`notifyStockSaleLost`, `notifyCronFailure`), eventos relevantes de pedidos/cotizaciones y el resumen matutino de las 08:00 COT (`daily-summary`), cada una con severidad (`critical`, `warning`, `info`) y enlace directo a la pantalla que resuelve el problema.
6. **`/admin/integraciones`:** panel interactivo para probar en vivo configuración, variables requeridas, latencia y conectividad hacia Supabase (DB + Storage), Wompi, Aveonline, Resend, Cloudflare Turnstile/R2 y Google Gemini.
7. **`/admin/metricas` (Ventas, Embudo sin cookies e Inteligencia Conductual CRM / RFM):** combina tres módulos analíticos propios:
   - **Pulso de ingresos y cotizaciones:** ventas cobradas, ticket promedio y conversión de cotizaciones.
   - **`FunnelPanel` (11 etapas sin cookies):** cascada completa Tienda + Estudio sobre `FunnelEventDaily`, cuello de botella automático con recomendación accionable y salud de carga/exportación 300 DPI por código de fallo.
   - **Inteligencia Conductual CRM, Matriz RFM y LTV de Margen Neto (`apps/web/features/crm/intelligence-service.ts`):** cruza `Contact`, `Order` (con `utmSource`, `utmMedium`, `utmCampaign` y `landingPath`), `Design`, `AbandonedCart`, `WompiPaymentTransaction`, `Product.cost`, `ContactActivity` y `Opportunity` en centavos COP (`Int`):
     - **Fugas identificables (`dropOffs`):** diseños estancados en `DRAFT`, carritos no recuperados y su valor en centavos COP, órdenes en `PENDING_PAYMENT` sin pago y **transacciones Wompi rechazadas desglosadas por medio de pago** (`CARD`, `PSE`, `NEQUI`, etc.).
     - **Señales de intención vs inventario vivo (`intentSignals`):** puntaje combinado de `WishlistItem` + suscripciones `BackInStockSubscription` pendientes cruzado contra stock real, clasificando cada producto en `RESTOCK_READY_TO_NOTIFY`, `LOW_STOCK_HIGH_INTENT`, `OUT_OF_STOCK_DEMAND` u `OK`.
     - **Matriz RFM de 5 segmentos (`rfm`):** clasifica a todos los contactos con compras pagadas en **Campeones** (`3+` compras pagadas y última `≤ 90 d`), **Leales** (`2` compras pagadas y última `≤ 90 d`), **Nuevos prometedores** (`1.ª` compra en últimos `90 d`), **En riesgo** (`91–180 d` sin compra) e **Inactivos** (`> 180 d`), calculando ingresos brutos, **margen neto estimado en centavos COP** (descontando `Product.cost` e informando `productsWithCostConfiguredRatio`) y LTV promedio por contacto.
     - **Atribución por canal (`channelAttribution`) y venta asistida (`assistedRecovery`):** compara LTV y margen neto por canal UTM y mide cuánto ingreso proviene de carritos recuperados, oportunidades corporativas B2B ganadas (`Opportunity`), pedidos pagados precedidos por acompañamiento humano en CRM/soporte (`ContactActivity` dentro de `≤ 14 días`) y ocasiones anuales con consentimiento comercial vigente.

---

## 2. Sondas de salud (`/api/health/*`), `/status`, monitor `uptime-monitor-prd` y GitHub Actions

### 2.1 Inventario exacto de los 8 endpoints en `apps/web/app/api/health/`

Todos los endpoints declaran `export const dynamic = "force-dynamic"` y aplican rate limiting atómico en Postgres (`30 / 1 min` por IP hasheada) con cabecera `Retry-After` en respuestas `429`:

| Endpoint                    | Tipo de sonda                        | Semántica HTTP `200` vs `503` y controles de seguridad                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`           | **Liveness** de la app Next.js       | Devuelve `200 { status: "ok", service: "lucams-shop-web", timestamp }` en `< 1 s` sin tocar DB ni terceros. **No expone `version` ni `environment` en abierto** para impedir fingerprinting de commits                                                                                                                                                        |
| `GET /api/health/db`        | **Readiness** de Postgres (Prisma)   | Ejecuta `SELECT 1` vía Prisma y devuelve `latencyMs`; si lanza excepción responde `503` en formato RFC 7807 sin filtrar cadenas de conexión                                                                                                                                                                                                                   |
| `GET /api/health/storage`   | **Readiness** de Supabase Storage    | Verifica acceso a los buckets y devuelve `503` ante fallo                                                                                                                                                                                                                                                                                                     |
| `GET /api/health/resend`    | Sonda de correo transaccional        | Verifica API de Resend y verificación DNS del remitente (`ok`, `warn` si falta verificación o `skipped` si no aplica)                                                                                                                                                                                                                                         |
| `GET /api/health/wompi`     | Sonda de pasarela de pagos           | Consulta disponibilidad de `api.wompi.co` (timeout 5 s); distingue `skipped` si se operara en modo catálogo                                                                                                                                                                                                                                                   |
| `GET /api/health/aveonline` | Sonda de operador logístico          | Verifica disponibilidad del servicio de Aveonline (timeout 5 s)                                                                                                                                                                                                                                                                                               |
| `GET /api/health/crons`     | **Dead-man switch externo** de crons | Evalúa `getCronHealth()`: responde `200` si ningún job activo supera `2×` su intervalo (`pending` y `disabled` no degradan) y **`503`** si ≥ 1 cron está `overdue`. El desglose por job solo se entrega con header `x-cron-secret` válido                                                                                                                     |
| `GET /api/health/all`       | **Agregador compuesto de readiness** | Sondea en paralelo `db`, `storage`, `resend`, `aveonline` y `wompi` usando `getTrustedSelfBaseUrl()` (anti-SSRF, jamás `Host` del cliente) + `vercelBypassHeaders()`, `redirect: "manual"` y timeout de 6 s. Devuelve **`200`** si `db` + `storage` están `ok` y **`503`** si alguno crítico cae; expone `version`/`environment` **solo con `x-cron-secret`** |

```ts
// apps/web/app/api/health/route.ts — respuesta pública mínima sin SHA ni entorno
export async function GET() {
  return Response.json({
    status: "ok",
    service: "lucams-shop-web",
    timestamp: new Date().toISOString(),
  });
}

// apps/web/app/api/health/db/route.ts — readiness real contra Postgres
import { prisma } from "@/lib/db";
export async function GET() {
  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`; // ante fallo devuelve 503 RFC 7807 sin exponer credenciales
  return Response.json({
    status: "ok",
    service: "lucams-shop-web",
    check: "postgres",
    latencyMs: Date.now() - start,
  });
}
```

### 2.2 Página pública `/status` (`apps/web/app/status/page.tsx`)

- Consulta en vivo `/api/health`, `/api/health/db`, `/api/health/storage`, `/api/health/resend` y —en modo tienda completa (`!isCatalogMode()`)— `/api/health/wompi` y `/api/health/aveonline`.
- `apps/web/lib/public-status.ts` traduce estados técnicos internos (`rate_limited`, `skipped`, `warn`) a estados legibles (`ok`, `warn`, `down`, `pending`) para que alcanzar el rate limit de una sonda jamás simule una caída falsa del proveedor.
- Ante fallos de red muestra `"sin respuesta"` sin filtrar errores DNS ni hosts internos; el detalle técnico queda registrado server-side en `ErrorLog`.

### 2.3 Monitor externo cruzado `uptime-monitor-prd` (Supabase STG → PRD)

Ningún sistema puede alertar su propia caída total desde adentro. Para contar con vigilancia externa 24/7 sin depender de SaaS de terceros ni de máquinas de desarrollo, [`scripts/monitor-uptime-stg.sql`](../scripts/monitor-uptime-stg.sql) ejecuta el job `uptime-monitor-prd` en el `pg_cron` del **proyecto Supabase de STG** (dominio de fallo físicamente separado de Vercel PRD y Supabase PRD):

1. **Cadencia:** cada **10 minutos** (`*/10 * * * *`) ejecutando `SELECT monitor_uptime_prd()`.
2. **Arquitectura asíncrona de 2 fases sobre `pg_net`:** dado que `net.http_get` despacha peticiones en segundo plano cuyas respuestas se escriben en `net._http_response` fuera de la transacción llamante:
   - **Fase 1 (Colecta):** evalúa las respuestas HTTP del lote lanzado 10 minutos antes (`uptime_monitor_requests`). Para eliminar falsos positivos por hipos de red, un endpoint solo se declara caído tras **2 corridas fallidas consecutivas (~20 minutos sostenidos)**.
   - **Fase 2 (Disparo):** encola el nuevo lote contra los **5 endpoints de PRD** (`/api/health/all`, `/api/health/crons`, `/api/health/resend`, `/api/health/wompi` y `/api/health/aveonline`).
3. **Alerta directa vía Resend y latido recíproco:** cuando persiste falla en ≥ 2 corridas, la función PL/pgSQL en STG llama **directamente a la API de Resend** hacia `ALERT_EMAIL` (con anti-spam de 30 min en `uptime_monitor_state`), entregando el correo incluso si Vercel PRD y Postgres PRD están totalmente fuera de línea. Además, en cada ciclo notifica `POST /api/cron/monitor-heartbeat` a PRD (`AlertState["uptime-monitor:last-run"]`: `"OK 5/5"` o `"FALLA n/5: ..."`), vigilado desde PRD por `uptime_monitor_stale` (`> 30 min`) y `uptime_monitor_failing`. Como utilidad manual de respaldo existe `apps/web/scripts/uptime-monitor.mjs`.

```sql
-- scripts/monitor-uptime-stg.sql (aplicado SOLO en Supabase STG, nunca en PRD)
CREATE TABLE IF NOT EXISTS uptime_monitor_requests (
  path text PRIMARY KEY,
  request_id bigint NOT NULL,
  consecutive_failures int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS uptime_monitor_state (
  key text PRIMARY KEY,
  last_alert_at timestamptz,
  last_detail text
);
-- Secretos leídos en runtime desde vault.decrypted_secrets de STG:
-- monitor_prd_base_url, monitor_resend_api_key, monitor_email_from,
-- monitor_alert_email y monitor_cron_secret.
```

### 2.4 Verificaciones externas desde GitHub Actions (`.github/workflows/`)

- **`post-deploy-smoke.yml`:** prueba de humo automática tras cada despliegue verificando sondas de salud y rutas esenciales.
- **`nightly-full.yml` (`0 6 * * *` UTC):** suite nocturna integral de regresión contra entorno real.
- **`backup.yml` (`13 7 * * *` UTC):** respaldo diario cifrado con GPG `AES-256` de Postgres y Storage hacia Cloudflare R2; al concluir sella `POST /api/cron/backup-heartbeat` (`AlertState["backup:last-success"]`, fallando en HTTP `500` si no logra registrar el latido).
- **`dr-drill.yml` (`27 8 2 * *` UTC):** simulacro mensual automatizado el día 2 de cada mes que descarga el último backup desde R2, lo descifra con GPG y lo restaura en un Postgres limpio verificando frescura (`< 36 h`) y conteos de tablas críticas (`ADR-059`).
- **`domain-watch.yml` (`23 11 5 * *` UTC):** auditoría mensual RDAP del dominio `lucamsshop.com` reportada a `POST /api/cron/domain-watch` (alerta por correo si restan `≤ 45 días` de vigencia o cambian nameservers/estados EPP).

---

## 3. Logging estructurado JSON (`lib/logger.ts`), correlación, captura de errores y punto ciego de BD

### 3.1 Por qué `lib/logger.ts` implementa API Pino sobre `console`, redacción `scrubPii` y `X-Request-Id`

- **Compatibilidad con Next.js 16 Turbopack:** [`apps/web/lib/logger.ts`](../apps/web/lib/logger.ts) expone la misma interfaz estructurada de Pino (`logger.debug`, `logger.info`, `logger.warn`, `logger.error` recibiendo `{ event, ...contexto }`) implementada sobre `console.log`/`console.error` con una línea JSON por evento. Esto evita el fallo de empaquetado de `pino` con Turbopack en Next.js 16 manteniendo compatibilidad nativa con Vercel Runtime Logs.
- **Niveles (`LOG_LEVEL`):** `debug` (por defecto en desarrollo), `info` (por defecto en producción: transiciones normales de negocio, colas y webhooks), `warn` (condición anómala recuperada: rate limit alcanzado, firma inválida, reintento o fallback de caché) y `error` (fallo que requiere atención).
- **Doble capa de redacción (`redact` + `scrubPii`):**
  1. **Por nombre de clave (`REDACT_KEYS` y sufijos):** reemplaza por `"[REDACTED]"` cualquier propiedad o ruta que coincida con `password`, `token`, `secret`, `key`, `cookie`, `authorization`, `email`, `phone`, `documentNumber`, `to`, `ip`, `ipAddress`, `whatsapp` o sufijos `*Secret`, `*Token`, `*Key`, `*Email`, `*Phone`.
  2. **Por contenido en textos y trazas (`scrubPii`):** aplica expresiones regulares sobre `Error.message` y `Error.stack` reemplazando correos por `"[EMAIL]"` y teléfonos colombianos/genéricos por `"[PHONE]"` antes de escribir en stdout o insertar en `ErrorLog`/`ErrorReport` (evitando filtrar PII en errores SQL como `Key (email)=(...) already exists`).
- **Estado real de correlación (`X-Request-Id`) y trazado:** [`apps/web/proxy.ts`](../apps/web/proxy.ts) genera o propaga un UUID seguro en la cabecera `X-Request-Id` por cada petición HTTP para que los Route Handlers y Server Actions lo incluyan en sus logs. La propagación implícita mediante `AsyncLocalStorage`, el envío de `X-Lucams-Request-Id` hacia APIs externas y la adopción eventual de OpenTelemetry (`ADR-024`) se mantienen como evolución futura opcional cuando la escala lo justifique.

```ts
// apps/web/lib/logger.ts — redacción profunda de claves y PII embebida en errores
function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase();
  if (REDACT_KEYS.has(k)) return true;
  return /(secret|token|key|password|cookie|authorization|email|phone)$/i.test(k);
}

export function scrubPii(text: string): string {
  return text.replace(EMAIL_RE, "[EMAIL]").replace(PHONE_RE, "[PHONE]");
}
```

```json
{
  "timestamp": "2026-11-05T14:30:00.123Z",
  "level": "info",
  "event": "order.saga.paid.shipment_created",
  "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "orderId": "cm9xyz1234567890",
  "orderNumber": "LCM-2026-0142",
  "carrier": "ENVIA",
  "latencyMs": 412
}
```

### 3.2 Catálogo de eventos estructurados (`event`) por dominio en `apps/web/`

Todos los llamados siguen la convención `<dominio>.<acción>[.<resultado>]`:

| Dominio              | Eventos reales representativos en código                                                                                                                                                     | Nivel típico     | Qué permiten auditar o diagnosticar                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| **Auth cliente**     | `auth.signup.success`, `auth.login.fail`, `auth.login.rate_limited`, `auth.verify_otp.success`, `auth.reset.sent`, `account.delete.success`, `account.delete.auth_user_banned_fallback`      | `info` / `warn`  | Registro, OTP, bloqueos por tasa y cascada de supresión Hábeas Data                       |
| **Seguridad/Admin**  | `security.admin_login.success`, `security.admin_login.fail`, `security.admin_mfa_reauth.success`, `security.admin_recovery_code_used`, `security.pwned.signup_block`                         | `info` / `warn`  | Accesos `/admin`, step-up MFA `aal2`, uso de códigos de emergencia y contraseñas HIBP     |
| **Carrito/Checkout** | `cart.add_personalized.success`, `checkout.step.datos.saved`, `checkout.cod_risk.blocked`, `checkout.finalize.success`, `checkout.pago.redirect_wompi`, `checkout.gracias.amount_mismatch`   | `info` / `warn`  | Embudo transaccional, bloqueos antifraude COD y validaciones de integridad antes de pagar |
| **Pagos y Saga**     | `order.saga.paid.transitioned`, `order.saga.paid.no_stock`, `order.saga.flagged_reconciliation`, `order.expire_pending.healed`, `stock.decrement.applied`, `stock_sale_lost.notified`        | `info` / `error` | Transición `PAID`, descuento idempotente de stock, curación de pagos tardíos y colisiones |
| **Webhooks**         | `webhook.wompi.received`, `webhook.wompi.processed_approved`, `webhook.wompi.invalid_signature`, `webhook.wompi.replay_rejected`, `webhook.aveonline.processed`, `email.bounce`              | `info` / `warn`  | Verificación de firmas, ventana anti-replay de 25 h, idempotencia y rebotes en Resend     |
| **Envíos**           | `shipping.aveonline.quote.cache_fallback`, `shipping.aveonline.createshipment.success`, `shipping.aveonline.createshipment.fail`, `shipping.label_archive.ok`, `shipping.tracking_sync.done` | `info` / `warn`  | Cotizador multi-transportadora, archivo de guías PDF en Storage y convergencia logística  |
| **Estudio e IA**     | `design.asset.upload.success`, `design.finalize.success`, `design.finalize.async_render_enqueued`, `design.render_job.done`, `design.reorder_clone.success`, `ai.gemini.model_fail`          | `info` / `warn`  | Subida de fotos con `sharp`, cola de renders 300 DPI, clones de _reorder_ y Gemini        |
| **Crons y Purgas**   | `alerts.sent`, `daily_summary.sent`, `retention.purge_event_logs`, `retention.purge_anon_designs`, `retention.purge_delivered_designs`, `retention.orphan_sweep`, `cron.<job>.fail`          | `info` / `error` | Ejecución periódica de los 14 crons, conteos borrados por retención y fallos operativos   |
| **Observabilidad**   | `server.error`, `observability.capture_fail`, `observability.client_capture.new_row_capped`, `vitals.out_of_range`, `rate_limit.empty_row`, `health.all.degraded`                            | `warn` / `error` | Salud del propio subsistema de captura, topes anti-DoS y degradación de sondas            |

### 3.3 Captura de errores de servidor (`ErrorLog`) y de cliente (`ErrorReport`)

Implementada en [`apps/web/lib/error-capture.ts`](../apps/web/lib/error-capture.ts) bajo contrato _best-effort_ (nunca lanza excepciones secundarias):

1. **Servidor (`ErrorLog` ← `captureServerError`):** conectado al hook oficial `onRequestError` de `apps/web/instrumentation.ts` y a bloques `catch` de crons y sagas. Aplica `scrubPii` a `message` (`≤ 2 000` caracteres) y `stack` (`≤ 4 000` caracteres), almacena `digest`, `routePath`, `requestPath`, `method` y `routeType`, y alimenta la alerta `errors_spike`.
2. **Cliente (`ErrorReport` ← `POST /api/log-error` → `captureClientError`):** alimentado desde `app/error.tsx`, `app/global-error.tsx` y `app/admin/(panel)/error.tsx` con tope de cuerpo (`readBodyWithLimit`), esquema Zod y rate limit `20 / 1 min` por IP:
   - **Huella determinista (`fingerprint`):** ejecuta `scrubPii`, limpia partes volátiles (`normalizeForFingerprint`: query strings, `:línea:columna` minificadas y hashes de chunks) y calcula `SHA-1(message + top3StackLines + digest)`. Incluir `digest` impide que fallos distintos de Server Components en producción se mezclen bajo el texto genérico de React.
   - **Detección automática de regresiones:** en `/admin/observability` cada grupo se gestiona como `OPEN`, `RESOLVED` o `IGNORED`. Si reaparece un error marcado como `RESOLVED`, `captureClientError` incrementa `count`/`lastSeenAt` y lo **reabre automáticamente a `OPEN`**; si estaba `IGNORED`, solo incrementa su contador sin reabrirlo.
   - **Tope selectivo anti-inundación:** el bucket global `error-report:new` (`300` filas nuevas por cada `5 min`) limita exclusivamente _fingerprints_ inéditos; las ocurrencias adicionales de errores ya conocidos actualizan su contador siempre.

### 3.4 Análisis arquitectónico del punto ciego conocido: «la observabilidad depende de la DB que monitorea»

Por decisión de arquitectura sin SaaS externos, `ErrorLog`, `ErrorReport`, `WebVital`, `Notification` y los latidos `AlertState` residen en la **misma instancia Postgres de Supabase que el comercio utiliza para operar**. Cuando el pooler de Supabase sufre intermitencia (`P1001`) o el pool de conexiones de Prisma se agota (`P2024`), las escrituras _best-effort_ de `captureServerError` y `captureClientError` fallan de forma controlada y `/admin/observability` deja de recibir filas nuevas **justo durante la ventana del incidente de base de datos**.

Este punto ciego está mitigado de forma deliberada mediante **cuatro capas independientes de la BD de PRD**:

1. **`stdout` / `stderr` primero (antes de tocar Postgres):** `onRequestError` emite síncronamente `server.error` por el logger JSON antes de invocar Prisma, y si la inserción en `ErrorLog` falla emite además `observability.capture_fail`. Ambos registros quedan capturados en **Vercel Runtime Logs** aunque la base de datos esté caída al 100 %.
2. **Detección y alerta externa desde otro proyecto (`uptime-monitor-prd` en Supabase STG):** como STG posee su propio Postgres, `pg_cron` y salida `pg_net`, detecta que `/api/health/all` de PRD responde `503` y despacha el correo de alerta directo por la API de Resend sin pasar por la infraestructura caída de PRD.
3. **Sondas externas en GitHub Actions:** `post-deploy-smoke.yml` y `nightly-full.yml` verifican disponibilidad desde runners externos de GitHub.
4. **Escáner CLI de emergencia sin base de datos (`scripts/vercel-runtime-errors.sh`) + retry Prisma (`ADR-131`):** el cliente Prisma reintenta errores transitorios de conexión (`ADR-131`) reduciendo hipos breves, y cuando se investiga degradación o ausencia sospechosa de filas en `ErrorLog`, el operador ejecuta en modo solo lectura:

```bash
# Captura en vivo el stream de Vercel Logs sin depender de Postgres y contabiliza
# P1001, P2024, P1017, server.error, observability.capture_fail y respuestas 5xx:
bash scripts/vercel-runtime-errors.sh lucamsshop.com 180
```

---

## 4. Tareas programadas: 14 crons en `CRON_JOBS` vs 18 procesos totales

El proyecto **no usa Vercel Cron**; toda ejecución periódica corre sobre `pg_cron` + `pg_net` en Supabase leyendo secretos en tiempo de ejecución desde `vault.decrypted_secrets` (`cron_base_url`, `cron_secret` y, en STG, `cron_vercel_bypass`), más workflows específicos en GitHub Actions cuando se requiere CLI externo o protocolo RDAP.

### 4.1 Mecanismo dead-man switch (`features/observability/cron-heartbeat.ts`)

1. **Latido solo tras éxito:** cada cron llama a `recordCronHeartbeat(job)` únicamente al completar sin error, actualizando `AlertState["cron:<job>"]`.
2. **Doble vigilancia `2×` intervalo (`overdue`):** `getCronHealth(now)` declara `overdue: true` cuando `now - lastRunAt > 2 * intervalMs`. Internamente `evaluateAlerts` genera `cron_stale_<job>`, y externamente `GET /api/health/crons` devuelve **`503`** (vigilado cada 10 min desde STG por `uptime-monitor-prd`, cubriendo incluso una parada del propio cron `alerts`).
3. **Siembra inicial verificada por tests:** toda migración SQL que registra un cron nuevo inserta su semilla en `AlertState` (validado automáticamente en `cron-heartbeat.test.ts`); si jamás llega a correr, la semilla vence a `2×` su intervalo y alerta.
4. **Exclusión limpia en STG (`CRON_JOBS_DISABLED`):** los 5 crons que despachan correos comerciales/posventa se desactivan explícitamente en STG reportando `disabled: true` y `overdue: false`.
5. **Optimización _idle-skip_ en SQL (`00000000000048_pgcron_dedup_and_idle_skip.sql`):** `process-render-jobs` (cada 1 min) y `cms-publish-scheduled` (cada 5 min) consultan primero por índice SQL (`< 1 ms`) si hay filas pendientes en `RenderJob` o `CmsFieldVersion`. Si no hay trabajo, actualizan el latido `idle (...)` directamente en `AlertState` sin despertar funciones en Vercel (~103 680 invocaciones HTTP ahorradas al mes), saliendo _fail-closed_ sin latido si faltara algún secreto en Vault.

### 4.2 Los 14 crons monitoreados en `CRON_JOBS`

| #   | Clave en `CRON_JOBS`      | Job agendado / Productor                               | Expresión UTC        | Intervalo | Umbral `overdue` (`2×`) | Endpoint / Acción ejecutada                                                                       |
| --- | ------------------------- | ------------------------------------------------------ | -------------------- | --------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `process-render-jobs`     | `lucams-process-render-jobs` (`pg_cron` + idle-skip)   | `* * * * *`          | `1 min`   | **2 min**               | `GET /api/cron/process-render-jobs` (cola asíncrona de renders 300 DPI)                           |
| 2   | `alerts`                  | `lucams-alerts` (`pg_cron`)                            | `*/5 * * * *`        | `5 min`   | **10 min**              | `GET /api/cron/alerts` (`dispatchAlerts`)                                                         |
| 3   | `cms-publish-scheduled`   | `lucams-cms-publish-scheduled` (`pg_cron` + idle-skip) | `*/5 * * * *`        | `5 min`   | **10 min**              | `GET /api/cron/cms-publish-scheduled`                                                             |
| 4   | `tracking-sync`           | `lucams-tracking-sync` (`pg_cron`)                     | `4,19,34,49 * * * *` | `15 min`  | **30 min**              | `GET /api/cron/tracking-sync` (convergencia activa de guías con Aveonline)                        |
| 5   | `back-in-stock`           | `lucams-back-in-stock` (`pg_cron`)                     | `*/30 * * * *`       | `30 min`  | **60 min**              | `GET /api/cron/back-in-stock`                                                                     |
| 6   | `cart-recovery`           | `lucams-cart-recovery` (`pg_cron`)                     | `0 * * * *`          | `60 min`  | **2 h**                 | `GET /api/cron/cart-recovery`                                                                     |
| 7   | `expire-pending-orders`   | `lucams-expire-pending-orders` (`pg_cron`)             | `23 * * * *`         | `60 min`  | **2 h**                 | `GET /api/cron/expire-pending-orders` (`PENDING_PAYMENT` > 24 h tras consultar Wompi)             |
| 8   | `purge-event-logs`        | `lucams-purge-event-logs` (`pg_cron`)                  | `0 3 * * *`          | `24 h`    | **48 h**                | `GET /api/cron/purge-event-logs` (purga por retención de 8 tablas de observabilidad)              |
| 9   | `purge-rate-limits`       | `lucams-purge-rate-limits` (`pg_cron` SQL puro)        | `29 5 * * *`         | `24 h`    | **48 h**                | `SELECT public.purge_rate_limit_buckets()` (`> 7 días`, `LUC-SEC-010`)                            |
| 10  | `purge-anon-designs`      | `lucams-purge-anon-designs` (`pg_cron`)                | `0 8 * * *`          | `24 h`    | **48 h**                | `GET /api/cron/purge-anon-designs` (carritos + diseños idle/READY + barrido de huérfanos Storage) |
| 11  | `purge-delivered-designs` | `lucams-purge-delivered-designs` (`pg_cron`)           | `0 9 * * *`          | `24 h`    | **48 h**                | `GET /api/cron/purge-delivered-designs` (`DELIVERED` ≥ 90 d sin posventa abierta)                 |
| 12  | `daily-summary`           | `lucams-daily-summary` (`pg_cron`)                     | `0 13 * * *`         | `24 h`    | **48 h**                | `GET /api/cron/daily-summary` (`08:00` COT en `/admin/notificaciones`)                            |
| 13  | `review-request`          | `lucams-review-request` (`pg_cron`)                    | `0 17 * * *`         | `24 h`    | **48 h**                | `GET /api/cron/review-request` (`12:00` COT para órdenes `DELIVERED`)                             |
| 14  | `domain-watch`            | `.github/workflows/domain-watch.yml` (GitHub Actions)  | `23 11 5 * *`        | `31 d`    | **62 d**                | `POST /api/cron/domain-watch` (auditoría mensual RDAP del dominio)                                |

### 4.3 Conciliación exacta con los 18 procesos programados de la plataforma

En [`integrations/supabase.md`](integrations/supabase.md) se inventarían **18 procesos programados** totales. Los **4 restantes** operan fuera del arreglo `CRON_JOBS` porque limpian tablas internas de extensiones Postgres o cuentan con sus propias claves y reglas de severidad alta en `AlertState`:

| #   | Proceso programado                      | Ejecutor y horario UTC                                                                 | Por qué no va en `CRON_JOBS` y cómo se vigila                                                                                                                              |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | `lucams-internal-cron-history-purge`    | `pg_cron` PRD/STG · `17 4 * * *` (`00000000000043`)                                    | SQL puro sobre esquema interno: `DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days'`; cubierto por `capacity_db_high` (`> 400 MB`)               |
| 16  | `lucams-internal-net-response-purge`    | `pg_cron` PRD/STG · `43 4 * * *` (`00000000000043`)                                    | SQL puro sobre cola efímera: `DELETE FROM net._http_response WHERE created < now() - interval '1 day'`; cubierto por `capacity_db_high`                                    |
| 17  | `uptime-monitor-prd`                    | `pg_cron` **solo en Supabase STG** · `*/10 * * * *` (`scripts/monitor-uptime-stg.sql`) | Corre en otro proyecto y escribe `AlertState["uptime-monitor:last-run"]` vía `/api/cron/monitor-heartbeat`; vigilado por `uptime_monitor_stale` y `uptime_monitor_failing` |
| 18  | `backup.yml` (Backup DB + Storage → R2) | GitHub Actions · `13 7 * * *` (`.github/workflows/backup.yml`)                         | Sella `AlertState["backup:last-success"]` vía `/api/cron/backup-heartbeat`; vigilado por `backup_stale` (`> 36 h`) y por el simulacro mensual `dr-drill.yml`               |

_(Nota histórica: los jobs antiguos de migración `012` —`rate_limit_cleanup` y el extinto reservador temporal— fueron retirados definitivamente en las migraciones `033` y `048`)._

---

## 5. Motor de alertas (`alerts.ts`), alertas inmediatas y resumen matutino (`daily-summary.ts`)

### 5.1 Política de canales y deduplicación (`dispatchAlerts`)

[`apps/web/features/observability/alerts.ts`](../apps/web/features/observability/alerts.ts) corre cada **5 minutos** (`/api/cron/alerts`):

1. **In-app como fuente de verdad (`Notification`):** toda alerta activa inserta o refresca su notificación no leída en `/admin/notificaciones` usando `dedupKey = key` (`crítica` → `critical`, `alta` → `warning`, `media` → `info`) sin duplicar filas mientras persista el incidente.
2. **Email vía Resend reservado a severidad `crítica`:** `dispatchAlerts` solo despacha correo a `ALERT_EMAIL` (fallback `hola@lucamsshop.com`) cuando el lote contiene **al menos una alerta `crítica`** cuyo último envío en `AlertState` supere **`30 minutos`** (`DEDUP_WINDOW_MS = 30 min`). Si se abre ese correo crítico, adjunta las demás alertas activas no enviadas del mismo lote como contexto.
3. **Reintento garantizado ante fallo de envío:** si `sendEmail` falla, `AlertState.lastSentAt` **no se actualiza**, forzando el reintento en el siguiente tick de 5 minutos.

### 5.2 Las 12 reglas de `evaluateAlerts` y su acción operativa inmediata

| #   | Clave (`key`)                                     | Severidad     | Condición exacta en `alerts.ts`                                                                                                             | Canal de salida                  | Acción operativa inmediata (runbook corto)                                                                                                |
| --- | ------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `reconciliation`                                  | **`crítica`** | `Order.count({ needsReconciliation: true, deletedAt: null }) > 0`                                                                           | **In-app + Email (`30 m`)**      | Abrir `/admin/pedidos` (filtro «Necesitan atención»): reponer unidad o reembolsar en Wompi y limpiar bandera tras conciliar               |
| 2   | `pending_payment_wompi_stale`                     | **`crítica`** | `Order.count({ status: "PENDING_PAYMENT", paymentMethod: "WOMPI", deletedAt: null, createdAt < now - 24h }) > 0`                            | **In-app + Email (`30 m`)**      | Revisar el cron `expire-pending-orders` en `/admin/observability` y contrastar cada referencia `LCM-*` en el panel de Wompi               |
| 3   | `errors_spike`                                    | `alta`        | `ErrorLog.groupBy(["routePath"])` en últimos `5 min` con `count >= 5` en una misma ruta                                                     | Solo in-app                      | Inspeccionar stack y `digest` en `/admin/observability` + Vercel Logs; ejecutar `vercel rollback` si coincide con un deploy recién subido |
| 4   | `security_admin_login_fails`                      | `alta`        | `SecurityEvent` (`auth.admin_login.fail`) en últimos `15 min` con `SUM(count) >= 5` (`LUC-SEC-008`)                                         | Solo in-app                      | Revisar `ipHash` en `SecurityEvent`; si persiste campaña de password-spraying, bloquear en Cloudflare WAF y verificar cuentas `/admin`    |
| 5   | `email_bounce_rate`                               | `alta`        | `EmailEvent` en `7 d` (sin dominios `*.test` RFC 2606): `bounced / (delivered + bounced) >= 5 %` con `>= 20` eventos terminales             | Solo in-app                      | Revisar DKIM/SPF/DMARC en Resend y direcciones rebotadas antes de despachar campañas comerciales                                          |
| 6   | `backup_stale`                                    | `alta`        | `AlertState["backup:last-success"]` ausente o antigüedad `> 36 h` (`BACKUP_STALE_MS`)                                                       | Solo in-app                      | Abrir GitHub Actions → `backup.yml`, revisar credenciales `R2_*` / `BACKUP_GPG_PASSPHRASE` / `CRON_SECRET` y relanzar `workflow_dispatch` |
| 7   | `uptime_monitor_failing` / `uptime_monitor_stale` | `alta`        | `AlertState["uptime-monitor:last-run"]`: `failing` si inicia con `"FALLA"`; `else if stale` si falta o supera `30 min` (`MONITOR_STALE_MS`) | Solo in-app (STG ya envía email) | Verificar qué sub-probe cayó en `/api/health/all` o revisar `cron.job_run_details` en el proyecto Supabase de STG                         |
| 8   | `capacity_storage_high`                           | `alta`        | `getStorageQuota().measuredBytes > 800 MB` (80 % de 1 GB en `storage.objects`)                                                              | Solo in-app                      | Verificar corridas de `purge-anon-designs` y `purge-delivered-designs` o ampliar cuota del plan Supabase                                  |
| 9   | `capacity_db_high`                                | `alta`        | `pg_database_size(current_database()) > 400 MB` (80 % de 500 MB)                                                                            | Solo in-app                      | Inspeccionar crecimiento por tabla, verificar `purge-event-logs` / `purge-rate-limits` o escalar plan de base de datos                    |
| 10  | `webhooks_stuck`                                  | `media`       | `WebhookEvent.count({ processedAt: null, createdAt < now - 60 min }) > 0`                                                                   | Solo in-app                      | Revisar tabla «Webhooks recientes» en `/admin/observability` y errores de la saga correspondiente                                         |
| 11  | `security_webhook_invalid`                        | `media`       | `SecurityEvent` (`webhook.invalid_signature`) en últimos `5 min` con `SUM(count) >= 3`                                                      | Solo in-app                      | Verificar si rotó `WOMPI_EVENTS_SECRET` / `AVEONLINE_WEBHOOK_SECRET` / `RESEND_WEBHOOK_SECRET` o si hay sondeo externo                    |
| 12  | `cron_stale_<job>`                                | `media`       | Job activo de `CRON_JOBS` (excepto `alerts` y `CRON_JOBS_DISABLED`) con `lastRunAt != null` y `now - lastRunAt > 2 * intervalMs`            | Solo in-app                      | Revisar `cron.job_run_details`, secretos en `vault.decrypted_secrets` y logs del endpoint `/api/cron/<job>`                               |

_(Nota: la regla #7 evalúa `if (monitor.failing) ... else if (monitor.stale)`, conformando exactamente los 12 bloques de evaluación y 13 claves posibles en `alerts.ts`)._

### 5.3 Alertas transaccionales inmediatas y resumen diario de las 08:00 COT

1. **Venta frenada o colisión de stock (`notifyStockSaleLost` en `apps/web/features/orders/stock-alerts.ts`):** se dispara al instante cuando ocurre `InsufficientStockError` en cualquiera de los 4 puntos de compra: `checkout_step`, `order_create`, `cod_finalize` y **`saga_paid`** (Wompi aprobó el pago pero otra orden concurrente tomó la última unidad). Inserta de inmediato una `Notification` in-app (`critical` en `saga_paid`, `warning` en los demás, con cooldown de **6 horas por variante** en `AlertState["stock_sale_lost:<variantId>"]`); además, en `saga_paid` la saga activa `Order.needsReconciliation = true`, disparando el correo crítico de `reconciliation`.
2. **Fallo no controlado de cron (`notifyCronFailure`):** todo endpoint `/api/cron/*` que capture una excepción crea notificación inmediata en `/admin/notificaciones` además de persistir en `ErrorLog`.
3. **Resumen operativo diario (`apps/web/features/observability/daily-summary.ts`):** ejecutado a las **`08:00` `America/Bogota`** (`13:00 UTC`, guarda anti-duplicado de 12 h) y entregado como notificación consolidada en `/admin/notificaciones` (sin ruido diario por correo). Resume las últimas 24 horas: pedidos e ingresos cobrados (Wompi + COD entregado), recaudo COD pendiente de remesa, órdenes por despachar, stock crítico, reseñas pendientes, retractos con reloj legal activo, carritos abandonados/recuperados, errores 5xx con ruta principal, órdenes a reconciliar, **órdenes Wompi expiradas sin `transactionId` confirmado (`no_txid`)** para cruce preventivo contra el panel de Wompi, línea de entregabilidad de email (compartiendo `email-deliverability.ts` con `email_bounce_rate`) y SLOs incumplidos.

---

## 6. SLOs cuantitativos (`slos.ts`), catálogo de SLIs y política de Error Budgets

### 6.1 Los 3 SLOs calculados en vivo desde base de datos (`apps/web/features/observability/slos.ts`)

`getSloStatus()` evalúa en tiempo real sobre Postgres y clasifica cada objetivo con `evaluateSlo` en `met` (cumplido), `at_risk` (dentro del margen de advertencia de `+2 %` sobre el umbral), `breached` (incumplido) o `insufficient_data` (debajo de la muestra mínima):

| Clave SLO            | Indicador exacto (SLI)                                                                                                         | Meta (`targetPct`) | Ventana móvil | Muestra mínima |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------- | -------------- |
| `web_vitals_good`    | `%` de mediciones `WebVital` con calificación `rating = "good"`                                                                | **≥ 75 %**         | 7 días        | `30` muestras  |
| `checkout_success`   | Órdenes en `PAID`/`FULFILLING`/`SHIPPED`/`DELIVERED`/`REFUNDED` sobre órdenes no `DRAFT` (excluyendo la última hora de gracia) | **≥ 90 %**         | 30 días       | `20` órdenes   |
| `webhook_processing` | `%` de filas `WebhookEvent` con `processedAt != null` sobre el total recibido                                                  | **≥ 99 %**         | 30 días       | `20` eventos   |

### 6.2 Catálogo completo de SLIs y metas operativas de referencia

| Indicador / Compromiso operativo                          | Meta de referencia             | Cómo se mide hoy y fuente de verdad                                                                      |
| --------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Disponibilidad del storefront** (`/`, catálogo, fichas) | **≥ 99,5 %** (30 d)            | Sondeos cada 10 min de `uptime-monitor-prd` (STG → `/api/health/all`) + `post-deploy-smoke.yml`          |
| **Disponibilidad de checkout y receptores de webhooks**   | **≥ 99,9 %** (30 d)            | ~43 min/mes de presupuesto máximo; medido vía `uptime-monitor-prd`, `WebhookEvent` y `checkout_success`  |
| **Latencia `p75` / `p95` por superficie**                 | `LCP ≤ 2,5 s`, `TTFB ≤ 800 ms` | Tabla `WebVital` en `/admin/performance` + `latencyMs` en logs estructurados                             |
| **Tasa de errores 5xx y picos por ruta**                  | **`< 0,1 %`** (24 h)           | Tabla `ErrorLog`, alerta `errors_spike` (`>= 5` en 5 min por ruta) y Vercel Runtime Logs                 |
| **Órdenes sobrevendidas sin conciliar (`oversold`)**      | **`0`** permanente             | Bloqueo `FOR UPDATE` + ledger idempotente `InventoryLog` + alerta crítica `reconciliation`               |
| **Calidad en cada PR (Lighthouse Performance y A11y)**    | **≥ 95** por deploy            | Gate bloqueante `E2E + a11y + Lighthouse — Playwright` en CI sobre build de producción                   |
| **Entregabilidad de correo transaccional**                | **≥ 98 %** (7 d)               | `email-deliverability.ts` sobre `EmailEvent` (alerta `email_bounce_rate` al llegar a `>= 5 %` de rebote) |
| **Rezago de tareas programadas (`cron lag`)**             | **`< 2×` intervalo**           | `getCronHealth()` sobre `AlertState["cron:*"]` + `/api/health/crons` + `cron.job_run_details`            |

_(Nota de hoja de ruta — diseño objetivo futuro de `/api/metrics`: hoy no existe `app/api/metrics` en el código; cuando la escala justifique conectar un scraper externo como Grafana Cloud o Prometheus, se expondrá protegido con `Authorization: Bearer <METRICS_TOKEN>` bajo este contrato mínimo):_

```text
# HELP lucams_orders_total Total de órdenes por estado
# TYPE lucams_orders_total counter
lucams_orders_total{status="paid"} 1234
lucams_orders_total{status="cancelled"} 56

# HELP lucams_request_duration_ms Histograma de latencia por ruta
# TYPE lucams_request_duration_ms histogram
lucams_request_duration_ms_bucket{route="/api/checkout/create",le="100"} 100
lucams_request_duration_ms_bucket{route="/api/checkout/create",le="500"} 500

# HELP lucams_cron_overdue Crons en CRON_JOBS sin latido en 2x su intervalo
# TYPE lucams_cron_overdue gauge
lucams_cron_overdue{job="daily-summary"} 0
```

```ts
// apps/web/features/observability/slos.ts — clasificador puro con guarda estadística
const AT_RISK_MARGIN_PCT = 2;

export function evaluateSlo(
  sliPct: number | null,
  targetPct: number,
  sampleSize: number,
  minSample: number,
): SloStatus {
  if (sliPct === null || sampleSize < minSample) return "insufficient_data";
  if (sliPct < targetPct) return "breached";
  if (sliPct < targetPct + AT_RISK_MARGIN_PCT && sliPct < 100) return "at_risk";
  return "met";
}
```

### 6.3 Política formal de Error Budgets y congelación de despliegues (_deployment freeze_)

Un SLO del `99,9 %` a 30 días equivale a un **presupuesto de error (_error budget_) del `0,1 %` (~43 minutos acumulados de indisponibilidad o degradación en el mes)**. La velocidad de cambios se gobierna por tres umbrales estrictos:

1. **Presupuesto consumido `< 50 %` (Verde):** velocidad normal de entrega de funcionalidades y mejoras de producto.
2. **Presupuesto consumido entre `50 %` y `100 %` (Amarillo — _Feature Freeze_ parcial):** **se congelan los despliegues de nuevas funcionalidades** que toquen la capa o flujo afectado (checkout, Estudio, pagos o base de datos). Solo se fusionan correcciones de errores, parches de seguridad y mejoras de estabilidad/observabilidad hasta recuperar margen.
3. **Presupuesto agotado `100 %` o SLO `breached` sostenido (Rojo):** **rollback inmediato** al último deployment estable conocido (`vercel rollback`, seguro gracias a migraciones _expand-then-contract_), redacción obligatoria de **postmortem** y cierre de las acciones correctivas antes de retomar cualquier trabajo de features.

> **Estado actual del seguimiento:** `slos.ts` automatiza hoy la detección `at_risk` / `breached` de los 3 SLOs de base de datos en `/admin/observability` y en el resumen diario; la evaluación del presupuesto mensual de disponibilidad HTTP y la activación del _feature freeze_ se aplican por gobierno operativo directo de la titular/equipo (sin subruta separada `/admin/observability/slos` ni cron mensual dedicado).

---

## 7. Rendimiento real de usuarios — RUM (`WebVital` y `/api/vitals`, `ADR-135`)

`apps/web/components/web-vitals.tsx` registra una única vez los recolectores del paquete **`next/dist/compiled/web-vitals-attribution`** (evitando el flag inerte `experimental.webVitalsAttribution` y eliminando beacons duplicados por re-render) exclusivamente cuando el visitante ha otorgado consentimiento en **`COOKIES_ANALYTICS`**, enviando los datos a [`apps/web/app/api/vitals/route.ts`](../apps/web/app/api/vitals/route.ts):

- **Blindaje de ingesta:** límite de cuerpo de **16 KB** (`readBodyWithLimit`), rate limit `120 / 1 min` por IP hasheada más tope global `vitals:new-row:global` (`3 000 / 5 min`), normalización de ruta por expresión regular (`/producto/[slug]`, sin tokens ni PII) y correlación por visita leyendo server-side el UUID de `cart_session` cuando existe.
- **Las 8 métricas aceptadas, umbrales `good`/`poor` y techos de descarte (`MAX_VALUE_BY_METRIC`):**

| Métrica      | Qué mide en navegador real                                                                                               | Umbral `good`   | Umbral `poor`   | Techo fail-closed (`MAX_VALUE_BY_METRIC`) |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------- | --------------- | ----------------------------------------- |
| `LCP`        | Pintado del elemento principal de contenido (incluye selector CSS `target`)                                              | `≤ 2 500 ms`    | `> 4 000 ms`    | `60 000 ms`                               |
| `INP`        | Latencia de interacción a siguiente pintado (incluye selector CSS `target`)                                              | `≤ 200 ms`      | `> 500 ms`      | `10 000 ms`                               |
| `CLS`        | Desplazamiento acumulado de diseño (incluye `largestShiftTarget` en `target`)                                            | `≤ 0.1`         | `> 0.25`        | `100`                                     |
| `FCP`        | Primer pintado con contenido                                                                                             | `≤ 1 800 ms`    | `> 3 000 ms`    | `60 000 ms`                               |
| `TTFB`       | Tiempo hasta el primer byte desde el borde/servidor                                                                      | `≤ 800 ms`      | `> 1 800 ms`    | `60 000 ms`                               |
| `FID`        | Demora de primera entrada (aceptada en servidor por compatibilidad histórica)                                            | `≤ 100 ms`      | `> 300 ms`      | `60 000 ms`                               |
| `LONGTASK`   | Suma de bloqueo del hilo principal (`> 50 ms`) por vista (solo si el navegador soporta `PerformanceObserver` `longtask`) | `≤ 200 ms`      | `> 600 ms`      | `300 000 ms`                              |
| `PAGEWEIGHT` | Bytes transferidos totales (`value`) y conteo de recursos (`delta`) por vista                                            | `≤ 2 MB` (ref.) | `> 5 MB` (ref.) | `500 000 000 bytes`                       |

Cualquier valor por encima de `MAX_VALUE_BY_METRIC` (típico de pestañas congeladas en segundo plano) se descarta registrando `vitals.out_of_range` y respondiendo HTTP `200 { ok: false }` para que `navigator.sendBeacon` no reintente en bucle.

---

## 8. Analítica propia del embudo (`FunnelEventDaily`) vs Google Analytics 4

| Dimensión                     | Embudo operativo propio (`FunnelEventDaily` ← `POST /api/funnel`)                                                                                                                                                                                                                                                                                                                                                                                         | Google Analytics 4 (`apps/web/lib/analytics.ts`)                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Consentimiento de cookies** | **No requiere** (`credentials: "omit"`, cero cookies, cero IP, cero `sessionId`)                                                                                                                                                                                                                                                                                                                                                                          | **Obligatorio** (`COOKIES_ANALYTICS = true` en el banner)                                                                                    |
| **Granularidad almacenada**   | Contadores enteros diarios `ON CONFLICT DO UPDATE` por `(day, step, productSlug, surface, deviceCategory, errorCode)` en Postgres                                                                                                                                                                                                                                                                                                                         | Eventos `gtag` (`view_item`, `begin_checkout`, `purchase`, etc.) enviados a Google                                                           |
| **Límites y sanitización**    | Cuerpo máx. **4 KB**, rate limit `180 / 1 min` por IP hasheada + `6 000 / 5 min` global, esquema cerrado Zod `FunnelPayloadSchema`                                                                                                                                                                                                                                                                                                                        | Excluye `/admin*`; `sanitizeAnalyticsUrl` enmascara `/pedido/*`, `/cotizacion/*`, `/resena/*`, `/d/*`, `/carrito/recuperar/*` y `/soporte/*` |
| **Etapas y fallos medidos**   | **11 etapas:** `product_view` → `studio_open` → `studio_template_select` → `studio_asset_upload_succeeded` → `studio_preview_open` → `studio_finalize_succeeded` → `cart_add` → `checkout_begin` → `checkout_shipping_selected` → `checkout_payment_submitted` → `purchase_completed`, más **8 códigos de fallo del Estudio** (`too_big`, `network`, `server_rejected`, `low_quality`, `master_expired`, `server_crash`, `validation`, `cart_add_failed`) | Eventos estándar de comercio electrónico de GA4                                                                                              |
| **Consulta y retención**      | `/admin/metricas` (`FunnelPanel`) · **365 días** (`FUNNEL_EVENT_DAILY_RETENTION_DAYS`)                                                                                                                                                                                                                                                                                                                                                                    | Propiedad externa de GA4 (al revocar consentimiento se purgan `_ga*` y `lucams_utm`)                                                         |

---

## 9. Retención maestra de 12 fuentes, guardia on-call y proceso de postmortem _blameless_

### 9.1 Tabla maestra de retención y purga automática de las 12 fuentes de observabilidad

Ejecutada diariamente por `purgeExpiredEventLogs` ([`apps/web/features/observability/event-log-retention.ts`](../apps/web/features/observability/event-log-retention.ts) a las `03:00 UTC`), `purge_rate_limit_buckets()` (`05:29 UTC`) y los dos jobs SQL internos (`04:17` y `04:43 UTC`):

| #   | Tabla / Almacén        | Plazo de retención                                 | Condición exacta de borrado                                                                          | Proceso responsable                  |
| --- | ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `ErrorLog`             | **90 días** (`ERROR_LOG_RETENTION_DAYS`)           | `createdAt < cutoff`                                                                                 | `lucams-purge-event-logs`            |
| 2   | `ErrorReport`          | **90 días** (`ERROR_REPORT_RETENTION_DAYS`)        | `lastSeenAt < cutoff` (un error recurrente hoy **jamás** se purga aunque `firstSeenAt` sea antiguo)  | `lucams-purge-event-logs`            |
| 3   | `WebVital`             | **35 días** (`WEB_VITAL_RETENTION_DAYS`)           | `createdAt < cutoff`                                                                                 | `lucams-purge-event-logs`            |
| 4   | `WebhookEvent`         | **180 días** (`WEBHOOK_EVENT_RETENTION_DAYS`)      | `createdAt < cutoff AND processedAt IS NOT NULL` (nunca borra eventos pendientes)                    | `lucams-purge-event-logs`            |
| 5   | `EmailEvent`           | **180 días** (`EMAIL_EVENT_RETENTION_DAYS`)        | `createdAt < cutoff`                                                                                 | `lucams-purge-event-logs`            |
| 6   | `SecurityEvent`        | **180 días** (`SECURITY_EVENT_RETENTION_DAYS`)     | `createdAt < cutoff` (`ipHash` truncado, cero IP en claro)                                           | `lucams-purge-event-logs`            |
| 7   | `FunnelEventDaily`     | **365 días** (`FUNNEL_EVENT_DAILY_RETENTION_DAYS`) | `day < cutoff`                                                                                       | `lucams-purge-event-logs`            |
| 8   | `Notification`         | **90 días** (`NOTIFICATION_RETENTION_DAYS`)        | `createdAt < cutoff AND readAt IS NOT NULL` (las alertas **no leídas** se conservan siempre)         | `lucams-purge-event-logs`            |
| 9   | `rate_limit_buckets`   | **7 días**                                         | `window_start < now() - interval '7 days'`                                                           | `lucams-purge-rate-limits`           |
| 10  | `cron.job_run_details` | **14 días**                                        | `end_time < now() - interval '14 days'`                                                              | `lucams-internal-cron-history-purge` |
| 11  | `net._http_response`   | **24 horas**                                       | `created < now() - interval '1 day'`                                                                 | `lucams-internal-net-response-purge` |
| 12  | `AdminActionLog`       | **Conservación de auditoría**                      | Sin purga automática por tiempo; solo redacción puntual de correos al ejecutar supresión Hábeas Data | Conservación legal y de seguridad    |

### 9.2 Guardia operativa (_on-call_) y modo mantenimiento

Mientras la operación recae en un equipo compacto liderado por la titular, no existe rotación de turnos, pero rigen tres salvaguardas operativas documentadas en [`OPERATIONS.md`](OPERATIONS.md):

1. **Matriz de escalamiento a proveedores** (Wompi, Aveonline, Supabase, Vercel, Resend y Cloudflare) lista en `OPERATIONS.md`.
2. **Alertas activas 24/7 por dos vías independientes:** correo inmediato desde `dispatchAlerts` en PRD para anomalías críticas de negocio (`reconciliation`, `pending_payment_wompi_stale`) y correo directo desde `uptime-monitor-prd` en STG si cae la salud de PRD por ≥ 20 minutos.
3. **Cortafuegos de emergencia (`NEXT_PUBLIC_MAINTENANCE_MODE=1`):** redirige en `proxy.ts` todo el tráfico público hacia `/maintenance` preservando `/admin/*` y `/api/health/*` para que el equipo opere y valide la recuperación antes de reabrir (al ser `NEXT_PUBLIC_*` requiere redespliegue en Vercel).

### 9.3 Proceso formal de postmortem _blameless_

Obligatorio tras cualquier incidente de severidad **`crítica` (`P0`)** o **`alta` (`P1`)**:

1. **Plazos:** borrador inicial dentro de las **24 horas** posteriores a la mitigación en `tmp/incidentes/YYYY-MM-DD-<slug>.md` (directorio local gitignored — **jamás se versionan bitácoras de incidentes en el repositorio**); revisión definitiva a las **48 horas**.
2. **Consolidación en documentación viva y limpieza:** las invariantes nuevas, tests de regresión o ajustes de runbook derivados del incidente se incorporan directamente en el documento vivo correspondiente (`SECURITY.md`, `OBSERVABILITY.md`, `OPERATIONS.md` o `domains/*.md`) y al cerrar se limpia el borrador con `make clean-tmp`.
3. **Cultura sin culpas (_blameless_) y acciones verificables:** el análisis nunca señala personas («alguien olvidó revisar»), sino brechas de diseño o automatización («faltaba un check en CI o una guarda idempotente»), cerrando con tareas concretas con responsable y fecha.

```markdown
# Incidente — YYYY-MM-DD — <título corto>

## Resumen ejecutivo

Una oración clara describiendo qué ocurrió, qué superficie afectó y cómo se resolvió.

## Impacto medido

- Usuarios o pedidos afectados: <cantidad exacta>
- Ventana del incidente (COT): HH:MM – HH:MM (<duración en minutos>)
- Integridad de datos / pagos comprometida: sí / no (detalle de reconciliación)
- Ingresos afectados estimados: $<monto> COP

## Cronología (America/Bogota)

- HH:MM — Detección inicial (alerta automática / monitor STG / reporte de usuario)
- HH:MM — Contención aplicada (rollback / modo mantenimiento / rotación de credencial)
- HH:MM — Causa raíz identificada y corrección desplegada
- HH:MM — Verificación en `/api/health/all` y cierre del incidente

## Causa raíz (enfoque sistémico, cero culpas)

Explicación técnica de la condición que permitió el fallo y por qué las defensas previas no la detuvieron.

## Qué funcionó bien / Qué falló en detección o respuesta

- Funcionó: ...
- Falló o tardó: ...

## Plan de acción preventivo (con entregable verificable)

- [ ] Test o invariante en código/CI que impide la recurrencia — Responsable — Fecha
- [ ] Ajuste de alerta, runbook o documento vivo — Responsable — Fecha
```
