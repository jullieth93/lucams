# Integraciones — Lucams_shop

Detalle de cada integración externa: cómo se conecta, qué endpoints/webhooks involucra, variables de entorno necesarias y modos sandbox vs producción.

## Tabla resumen

| Integración              | Propósito                                      | SDK / método                                | Webhooks                        | Sandbox                    |
| ------------------------ | ---------------------------------------------- | ------------------------------------------- | ------------------------------- | -------------------------- |
| **Wompi**                | Pasarela de pago                               | REST + Web Checkout                         | `transaction.updated`           | Sí                         |
| **Aveonline**            | Logística multi-carrier + COD                  | REST API                                    | Tracking (webhook AveCRM)       | Cuenta DEMO pública        |
| **Supabase**             | DB + Auth + Storage                            | `@supabase/supabase-js`                     | —                               | Mismo proyecto Free        |
| **Resend**               | Email transaccional                            | REST por `fetch` (`lib/resend.ts`, sin SDK) | Eventos de email (Svix, activo) | Subdominio `resend.dev`    |
| **Gemini**               | Asistente IA de ideas del estudio              | REST `generateContent` (sin SDK)            | —                               | Free tier de AI Studio     |
| **WhatsApp**             | CTAs con mensaje pre-armado (sin API)          | `wa.me` URL scheme                          | —                               | —                          |
| **Cloudflare Turnstile** | Anti-bot en formularios públicos               | REST `siteverify` (sin SDK)                 | —                               | Keys de test de Cloudflare |
| **HIBP Pwned Passwords** | Rechazo de contraseñas filtradas (k-anonymity) | REST `api.pwnedpasswords.com` (sin SDK)     | —                               | Gratis, sin key            |
| **Cloudflare R2**        | Backups diarios de DB, cifrados gpg (ADR-059)  | S3 API vía GitHub Actions                   | —                               | Bucket propio              |
| **Vercel**               | Hosting/deploy de `apps/web` (sin Vercel Cron) | Git integration                             | —                               | Preview deployments        |

---

## 1. Wompi (pasarela de pago) — proveedor principal

> Decisión: Wompi sobre Mercado Pago por costo (~0.84% menos) y dominio de métodos colombianos (Nequi, Bancolombia transferencia directa).

### Variables de entorno

```bash
# Modo
WOMPI_ENV=sandbox    # sandbox | production

# Sandbox (para dev)
WOMPI_PUBLIC_KEY=pub_test_xxxxxxxxxxxxxx
WOMPI_PRIVATE_KEY=prv_test_xxxxxxxxxxxxxx
WOMPI_INTEGRITY_SECRET=test_integrity_xxxxxxxxxxxxxx
WOMPI_EVENTS_SECRET=test_events_xxxxxxxxxxxxxx

# Producción (al lanzar)
# WOMPI_PUBLIC_KEY=pub_prod_xxx
# WOMPI_PRIVATE_KEY=prv_prod_xxx
# etc.

NEXT_PUBLIC_WOMPI_PUBLIC_KEY=$WOMPI_PUBLIC_KEY  # Para el widget en cliente
```

### Flujo de pago (Web Checkout — redirección)

```
Cliente               Lucams_shop                   Wompi                 Aveonline
   │                      │                            │                      │
   │ 1. Click "Pagar"     │                            │                      │
   ├─────────────────────>│                            │                      │
   │                      │ 2. Crea Order (PENDING)    │                      │
   │                      │ 3. Calcula firma SHA256    │                      │
   │                      │ 4. Redirect a Wompi        │                      │
   │ 5. Redirige          │                            │                      │
   │<─────────────────────┤                            │                      │
   │                                                   │                      │
   │ 6. Llena tarjeta/PSE/Nequi                        │                      │
   ├─────────────────────────────────────────────────>│                      │
   │                                                   │                      │
   │             7. Wompi procesa                      │                      │
   │                                                   │                      │
   │                      │ 8. Webhook transaction.updated                    │
   │                      │<──────────────────────────┤                      │
   │                      │ 9. Verifica firma         │                      │
   │                      │ 10. Inserta WebhookEvent (idempotente)           │
   │                      │ 11. Update Order=PAID     │                      │
   │                      │ 12. Crea envío Aveonline │                      │
   │                      │     ───────────────────────────────────────────>│
   │                      │ 13. Envía email + log     │                      │
   │ 14. Redirect a /orden/[id]                        │                      │
   │<──────────────────────────────────────────────────┤                      │
```

### Cálculo de firma de integridad

```ts
// lib/wompi.ts
import { createHash } from "crypto";

function generateIntegritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string,
): string {
  const concatenated = `${reference}${amountInCents}${currency}${integritySecret}`;
  return createHash("sha256").update(concatenated).digest("hex");
}
```

### Verificación de firma del webhook

Wompi envía cada evento con un `signature.checksum` que es:
`SHA256(properties_concatenadas + timestamp + events_secret)`

```ts
async function verifyWebhook(req: Request): Promise<boolean> {
  const body = await req.json();
  const { signature, timestamp } = body;
  const properties = signature.properties
    .map((path: string) => getValueByPath(body.data, path))
    .join("");
  const expected = createHash("sha256")
    .update(`${properties}${timestamp}${process.env.WOMPI_EVENTS_SECRET}`)
    .digest("hex");
  return expected === signature.checksum;
}
```

### Defensas del endpoint de webhook (`app/api/webhooks/wompi/route.ts`)

La verificación real (`verifyWebhookSignature` en `lib/wompi.ts`) compara con `crypto.timingSafeEqual` (anti timing-attack). Encima de la firma, el route aplica:

- **Anti-replay:** ventana de **25 h** sobre `event.timestamp` (Wompi reintenta con el MISMO timestamp a los 30 min / 3 h / 24 h si no recibe 200 — una ventana de 5 min mataba los reintentos legítimos; auditoría doc 2026-07-28). Escape hatch para tests locales: `WOMPI_DISABLE_TIMESTAMP_CHECK=true`.
- **Environment match:** `event.environment` ("test"/"prod") debe coincidir con `WOMPI_ENV` (rechaza un webhook prod en sandbox y viceversa, aunque las keys estén cruzadas). SIEMPRE aplica, independiente del escape hatch.
- **Idempotencia:** dedup en `WebhookEvent (source=WOMPI, externalId)` con clave `${transaction.id}-${status}-${timestamp}`; si ya tiene `processedAt` → 200 sin reprocesar. Carrera de entregas concurrentes resuelta por el unique de DB (P2002 → 200 "concurrent duplicate").
- **Validación de monto:** si `transaction.amount_in_cents !== order.total` NO se procesa; la orden queda marcada `needsReconciliation` con el motivo (visible en /admin/pedidos) y se devuelve 200.
- **Fallas de la saga:** se devuelve 200 igual (Wompi no reintenta en vano) pero la orden queda flagueada `needsReconciliation` y el evento SIN `processedAt` para que la alerta `webhooks_stuck` lo levante.
- Sin `WOMPI_*` configuradas (ej. modo catálogo) → `503` limpio ("webhook not configured"), no un 500.

### Estados de transacción

| Estado Wompi | OrderStatus interno      | Acción                                                                                                                                                                                                  |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APPROVED`   | `PAID` → `FULFILLING`    | Saga `processPaidOrder`: descuenta stock (atómico con la transición), email de confirmación, crea envío Aveonline (claim `shipmentClaimedAt` anti doble-guía)                                           |
| `DECLINED`   | `PENDING_PAYMENT`        | Sin dinero movido: NO cancela (Wompi habilita reintento con la misma reference ~3 min — doc oficial 2026-07-28)                                                                                         |
| `VOIDED`     | `REFUNDED` o `CANCELLED` | `REFUNDED` si estaba PAID/DELIVERED (email de reembolso); `CANCELLED` desde DRAFT/PENDING_PAYMENT/FULFILLING/SHIPPED; ambos restauran stock. Solo si la tx coincide con la que pagó la orden (guard B2) |
| `ERROR`      | `PENDING_PAYMENT`        | Igual que DECLINED: la orden espera el reintento del cliente                                                                                                                                            |
| `PENDING`    | (sin cambio)             | Solo log; Wompi enviará otro evento al finalizar                                                                                                                                                        |

### Pago contraentrega (COD)

No pasa por Wompi. Flujo:

1. Cliente elige "Pago contraentrega" en checkout.
2. Order se crea directo con `paymentMethod=COD` y `status=PAID`.
3. Se crea guía Aveonline COD (el carrier cobra al entregar).
4. Aveonline recauda el COD y lo remite a la cuenta del usuario tras la entrega (conciliación manual — ver [`INTEGRATIONS_AVEONLINE.md`](./INTEGRATIONS_AVEONLINE.md) §7).

---

## 2. Aveonline (logística)

> **Fuente de verdad:** [`INTEGRATIONS_AVEONLINE.md`](./INTEGRATIONS_AVEONLINE.md) — investigación completa de la API (auth, cotización, guías, recogidas, tracking webhook, COD, cobertura, tarifas, sandbox). Decisión: [ADR-039](./DECISIONS.md).

Agregador **multi-carrier** colombiano (Servientrega, Envía, TCC, Coordinadora, Domina, Interrapidísimo, Saferbo): al cotizar, el cliente elige carrier en checkout. Soporta contraentrega (COD).

### Variables de entorno

```bash
AVEONLINE_ENV=test  # test | production (default test — fail-safe)
AVEONLINE_USUARIO=xxxxxxxxxxxxxx   # Requeridas en TODOS los ambientes; fuera de prod
AVEONLINE_CLAVE=xxxxxxxxxxxxxx     # van las credenciales de la cuenta DEMO pública
AVEONLINE_GENERATE_REAL=false      # Doble gate con NODE_ENV=production: guía facturable.
                                   # Default seguro: genera numguia+PDF sin facturar
AVEONLINE_WEBHOOK_SECRET=xxxxxxxx  # Credencial compartida del webhook de tracking
                                   # (header x-aveonline-secret o payload.token)
# AVEONLINE_ALLOW_QUERY_SECRET=true  # SOLO transición: habilita la vía ?secret=
                                   # (default OFF — auditoría D-1, ver §6.2 del dossier)
```

### Puntos clave

- **Cotización:** server-side en `/checkout/envio` vía `quoteShipping()` (`features/checkout/service.ts`) → `cotizarDoble` de Aveonline (multi-carrier). Caché en memoria de la última cotización buena (TTL 10 min, clave origen→destino + COD + items) SOLO como fallback ante fallo transitorio — la UI la anuncia como "tarifa estimada" (`INTEGRATIONS_AVEONLINE.md` §3).
- **Guías:** se generan inline en la saga post-PAID (`features/orders/saga.ts`), con claim atómico `Order.shipmentClaimedAt` anti doble-guía. Reintentos: re-delivery del webhook de Wompi o retry manual admin desde `/admin/pedidos/[id]` (no hay cola pgmq — ver §9) (`INTEGRATIONS_AVEONLINE.md` §4).
- **Tracking:** webhook AveCRM en `/api/webhooks/aveonline` → mapea estado del carrier a `OrderStatus` (`INTEGRATIONS_AVEONLINE.md` §6).
- **Implementación:** `features/shipping/aveonline.ts` detrás de la interface `ShippingProvider` (`features/shipping/provider.ts`).

---

## 3. Supabase

> **Nota sobre API keys (verificado: [supabase.com/docs/guides/api/api-keys](https://supabase.com/docs/guides/api/api-keys) a 2026-05-09):** Supabase reemplazó las legacy `anon` y `service_role` keys (formato JWT) por las nuevas **Publishable** (`sb_publishable_*`) y **Secret** (`sb_secret_*`) keys. _"New projects no longer have anon and service_role available for use."_ Las publishable mapean al rol Postgres `anon`; las secret mapean al rol Postgres `service_role` — el modelo de seguridad es idéntico, solo cambian los nombres y el formato del token. Las legacy funcionan hasta fin de 2026 en proyectos viejos. **Lucams_shop usa las nuevas.**

> **Cambio de comportamiento descubierto al testear (2026-05-09):** el endpoint `/rest/v1/` (introspección OpenAPI del schema) ahora **requiere secret key** — la publishable no lo puede leer. Mensaje de error: _"Only secret API keys can be used for this endpoint."_ Esto es **mejor postura de seguridad**: el schema completo de la DB ya no es leakeable a cualquiera con la publishable. La publishable sigue válida para queries específicas (`/rest/v1/<tabla>`) bajo RLS, Auth, Storage, Realtime.

### Variables de entorno

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx     # Pública, mapea a rol Postgres `anon`
SUPABASE_SECRET_KEY=sb_secret_xxxxx                            # Server-only, mapea a rol Postgres `service_role`, NUNCA al cliente
DATABASE_URL=postgresql://postgres:[password]@xxx.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:[password]@xxx.supabase.com:5432/postgres
```

### Tres clientes en `lib/supabase/`

```ts
// browser.ts — usa publishable key, mapea a rol Postgres `anon`, RLS aplica
import { createBrowserClient } from "@supabase/ssr";
export const supabase = createBrowserClient(url, publishableKey);

// server.ts — usa cookies del request, RLS aplica con la sesión del user
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export const getSupabaseServer = () => createServerClient(url, publishableKey, { cookies });

// service.ts — usa secret key, mapea a rol Postgres `service_role`, bypassa RLS, SOLO server-side
import { createClient } from "@supabase/supabase-js";
export const supabaseAdmin = createClient(url, secretKey, {
  auth: { persistSession: false },
});
```

### Storage

- Bucket `product-images`: imágenes de productos (público, lectura abierta; escritura solo admin).
- Bucket `customer-uploads`: imágenes que sube el cliente al estudio de personalización (privado, URL firmada con TTL 1h).
- Bucket `production-assets`: PNG alta resolución generados al confirmar orden (privado, solo admin con role `FULFILLMENT`).

### Realtime

**No implementado.** El plan original era suscribirse a cambios en `ProductVariant.stock` para alertar en checkout si se agotó, pero hoy ningún código usa `postgres_changes`/Realtime (verificado 2026-09-03). El control de stock real es server-side: reserva en checkout + decremento atómico en la saga post-PAID. Si se retoma la idea, el snippet de referencia era:

```ts
const channel = supabase
  .channel("stock-changes")
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "ProductVariant" },
    (payload) => updateLocalStock(payload.new),
  )
  .subscribe();
```

### Limitaciones Free a recordar

- **Pausa tras 1 semana sin actividad.** Si pasas tiempo sin trabajar en el proyecto, vuelve a despertarse manualmente desde el dashboard.
- **500 MB DB.** Suficiente para todo el dev.
- **1 GB Storage.** Suficiente para imágenes de prueba; al lanzar migrar a Pro (100 GB).

---

## 4. Resend (email)

### Variables de entorno

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxx   # Firma Svix del webhook (dashboard → Webhooks)

# Dev (Free tier)
EMAIL_FROM=Lucams_shop <onboarding@resend.dev>
# Producción (Pro)
# EMAIL_FROM=Lucams_shop <hola@mail.lucamsshop.com>

EMAIL_REPLY_TO=hola@lucamsshop.com   # Reply-To real: el subdominio de envío no recibe correo
```

### Plantillas (código, `apps/web/features/emails/templates/`)

Los templates son funciones TS que devuelven `{ subject, html, text }` con inline CSS (SIN react-email — decisión J; layout base en `features/emails/layout.ts`). **Inventario completo con triggers y estado: [`EMAIL_TEMPLATES.md`](./EMAIL_TEMPLATES.md).**

Emisión centralizada en `lib/resend.ts` (REST por `fetch`, sin SDK): retry de hasta 4 intentos con backoff 1s/2s/4s (nunca reintenta 4xx), circuit breaker propio (>50% de fallos en los últimos 10 envíos → abre 30 s), `Idempotency-Key` por orden/evento (con fallback determinista `:r2` si el body cambió entre reintentos) y supresión de destinatarios con `email.bounced`/`email.complained` registrado — solo para correos **comerciales** (flag `commercial`); los transaccionales siempre se intentan.

### Limitaciones Free a recordar

- **3.000 emails/mes**, **100/día**. Suficiente para dev y soft launch.
- Solo desde `*.resend.dev` (no dominio propio). Al lanzar, configurar DNS de `mail.lucamsshop.com` con SPF/DKIM/DMARC y migrar a Pro.

> **Pendiente de verificación (mandato #9):** confirmar cifras del Free tier contra `resend.com/pricing` antes de Fase 0b.

### DNS records al pasar a producción (subdomain `mail.lucamsshop.com`)

Resend genera estos valores en el panel cuando se agrega el dominio. Configurarlos en Cloudflare DNS:

| Tipo  | Nombre                   | Valor (ejemplo, Resend genera el real)                                  | Propósito                                                       |
| ----- | ------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `TXT` | `mail`                   | `v=spf1 include:amazonses.com ~all`                                     | SPF — autoriza a Resend a enviar como `@mail.lucamsshop.com`    |
| `TXT` | `resend._domainkey.mail` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...`                           | DKIM — firma criptográfica de los emails                        |
| `TXT` | `_dmarc.mail`            | `v=DMARC1; p=quarantine; rua=mailto:dmarc@mail.lucamsshop.com; pct=100` | DMARC — política de tratamiento de mensajes que fallen SPF/DKIM |
| `MX`  | `mail`                   | `feedback-smtp.us-east-1.amazonses.com` (priority 10)                   | Bounces y feedback                                              |

> **Política DMARC inicial:** `quarantine` (los falsificados van a SPAM). A los 30 días sin problemas, subir a `reject` (los falsificados se descartan).

### Anti-phishing y reputación de IP

- **Subdominio dedicado** (`mail.lucamsshop.com`) — un envío masivo fallido no afecta la reputación del dominio raíz.
- **Reply-To diferente del From** si queremos que las respuestas lleguen a un buzón humano (`hola@lucamsshop.com`).
- **List-Unsubscribe header** en emails de marketing (carrito abandonado, reactivación).
- **Resend dashboard** muestra bounce rate, complaint rate, open/click rate. Alertar si bounce > 5%.

### Webhook de eventos (Svix) — ACTIVO

Resend notifica los eventos de cada email (`email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`) a `POST /api/webhooks/resend` (`apps/web/app/api/webhooks/resend/route.ts`). **Verificado E2E desde 2026-08-01.**

- **Firma:** HMAC-SHA256 con el esquema oficial de Svix — header `svix-signature`, contenido firmado `${svix-id}.${svix-timestamp}.${body}`, secreto `RESEND_WEBHOOK_SECRET` (formato `whsec_…`, lo genera el dashboard de Resend → Webhooks).
- **Anti-replay:** el timestamp Svix debe caer dentro de una ventana de 5 minutos.
- **Fail-closed en prod:** sin `RESEND_WEBHOOK_SECRET` configurado, el endpoint rechaza en producción (en dev permite sin verificar, para testing local con curl).
- **Idempotencia:** upsert de `EmailEvent` por `resendId` (`data.email_id`) — los reintentos de Resend no duplican filas.
- **Protección de supresión (D-2, auditoría 2026-08-24):** el upsert ya no es last-write-wins ciego — un `email.bounced`/`email.complained` registrado NUNCA se degrada por un evento posterior no-supresor, y un evento con `created_at` más viejo que el almacenado se ignora. Sin esto, un evento reordenado anulaba la supresión de `lib/resend.ts` y se re-escribía a direcciones rebotadas/quejadas.
- **Al pasar a producción:** crear el webhook en el dashboard apuntando a `https://lucamsshop.com/api/webhooks/resend` y copiar el signing secret a `RESEND_WEBHOOK_SECRET` en Vercel.

---

## 5. Gemini (asistente IA de ideas del Estudio) — ADR-058

> Decisión: Google Gemini como proveedor del asistente ([ADR-058](./DECISIONS.md), 2026-07-13), detrás de la interfaz `AiProvider` (`features/ai/provider.ts`) — la lógica del asistente (service, action, UI) depende solo de esa interfaz, así que cambiar de proveedor no toca nada más.

### Variables de entorno

```bash
GEMINI_API_KEY=xxxxxxxxxxxxxx               # Server-only, NUNCA al cliente
GEMINI_MODEL_PRIMARY=gemini-2.5-flash-lite  # default del código si falta
GEMINI_MODEL_FALLBACK=gemini-2.5-flash      # default del código si falta
```

### Implementación

- **Sin SDK npm:** `features/ai/gemini-provider.ts` llama por `fetch` server-side a `generateContent` (`https://generativelanguage.googleapis.com/v1beta/models`) con header `x-goog-api-key`. La key vive solo en el servidor — la llamada es servidor→Google, no toca la CSP del navegador.
- **Fallback entre modelos:** intenta el primario; si falla (429/5xx/timeout/respuesta inválida) reintenta con el de respaldo. Si ambos fallan → `AiUnavailableError`. El system prompt (español de Colombia, tuteo, tono cálido) y la respuesta JSON validada con Zod (`responseSchema`) viven en el mismo archivo.
- **Entry point:** la Server Action `suggestDesignAction` (`features/ai/actions.ts`) — valida la entrada con Zod y aplica rate-limit (20 sugerencias/hora por IP en prod + segunda capa por identidad contra rotación de IP; el asistente cuesta por llamada). En modo catálogo la action rechaza server-side (esconder la UI no es autorizar).
- **Filtro PII (auditoría E-2):** `sanitizeOccasion` (`features/ai/schemas.ts`) reemplaza `occasion` por un texto neutro ("ocasión especial") si el texto libre parece dato personal — corridas de 6-12 dígitos (cédula/NIT), emails, celulares colombianos 3XX — ANTES de llamar a Google. Nunca rechaza: el asistente sigue funcionando y la PII no sale del servidor.
- **Panel del Estudio:** `StudioAiPanel` (`app/estudio/[slug]/studio-ai-panel.tsx`) — el cliente cuenta la ocasión y recibe color de marca, frase (si el producto lleva texto), idea de composición y un tip. **Oculto en modo catálogo** (`aiEnabled = !isCatalogMode()` en `studio-editor.tsx`).
- **Degradación amable:** sin `GEMINI_API_KEY` (o si el proveedor falla) el panel muestra "El asistente no está disponible ahora. ¡Igual puedes personalizar tú!" — nunca rompe el editor.

### Costo

Gemini 2.5 Flash-Lite / Flash vía AI Studio tienen free tier generoso; con el rate-limit de arriba el costo a este volumen es despreciable. Verificar el pricing vigente en la doc oficial de Google antes del lanzamiento.

---

## 6. WhatsApp (`wa.me` link, sin API)

### Decisión

Sin Twilio API por ahora. Solo botón flotante con mensaje pre-armado contextual. Upgrade futuro: Twilio WhatsApp Business API cuando el volumen lo justifique.

### Variables de entorno

```bash
NEXT_PUBLIC_WA_NUMBER=573208873826   # Sin + ni espacios, formato wa.me
```

### Implementación

`apps/web/lib/wa.ts` (server-only, funciones async porque leen del CMS — solo usables en server components):

- **Número de destino:** setting `WA_NUMBER` del CMS (admin → Contenido → Ajustes del sitio → WhatsApp) → fallback `NEXT_PUBLIC_WA_NUMBER` → fallback hardcoded. Se sanitiza a solo dígitos (wa.me rompe con `+`, espacios o guiones).
- **Mensajes:** plantillas editables en CMS (`WA_MSG_PRODUCT`, `WA_MSG_PERSONALIZE`, `WA_MSG_SUPPORT`, `WA_MSG_SUPPORT_SUBJECT`, `WA_MSG_ORDER`, `WA_MSG_QUOTE`, `WA_MSG_WHOLESALE`) con placeholders `{varName}` y copias de respaldo hardcoded (misma copia que `seed-cms.mjs`).
- **API:** `buildWhatsAppUrl(ctx)` → `https://wa.me/<n>?text=<mensaje>`. Contextos: `product`, `personalize`, `support`, `order`, `quote` (cotización del modo catálogo), `wholesale`, `custom`.
- **Defensas del mensaje de cotización** (`features/quotes/service.ts`): `truncateForWhatsApp` (límite práctico de URL ~2083 chars — `INTERNET_MAX_URL_LENGTH`; si se corta, se pierde el total) y `neutralizeWhatsAppMarkup` (WhatsApp interpreta `*`, `_`, `~`, ` ``` ` como formato).

```ts
// lib/wa.ts — firma real
export async function getWhatsAppNumber(): Promise<string>;
export async function buildWhatsAppMessage(ctx: WhatsAppContext): Promise<string>;
export async function buildWhatsAppUrl(
  ctx: WhatsAppContext,
  opts?: { number?: string },
): Promise<string>;
```

### Dónde aparece

CTAs contextuales: home ("Háblanos por WhatsApp"), ficha de producto, confirmación de cotización ("Enviar por WhatsApp", modo catálogo), consulta de pedido y soporte. **No hay botón flotante global** (el `<WhatsAppFAB />` que esta sección describía nunca se implementó) ni API de Twilio.

---

## 7. Facturación electrónica DIAN (proveedor tecnológico autorizado)

> Marco regulatorio detallado en [`COMPLIANCE.md` § Facturación electrónica DIAN](./COMPLIANCE.md#facturación-electrónica-dian-resolución-165-de-2023). Aquí solo el hook técnico.

### Decisión

**Usar un proveedor tecnológico autorizado por DIAN** en lugar de software propio o software gratuito. Candidatos a evaluar antes de Fase 7 (ADR-025 a tomar):

| Proveedor | API             | Costo aprox.    | Verificar pre-elección                                                  |
| --------- | --------------- | --------------- | ----------------------------------------------------------------------- |
| Alegra    | REST + SDK Node | ~$25-50 USD/mes | `alegra.com/colombia` — confirmar plan, soporte de nota crédito vía API |
| Siigo     | REST            | Similar         | `siigo.com`                                                             |
| Facture   | REST API-first  | TBD             | `facture.co`                                                            |

### Variables de entorno (cuando se elija proveedor)

```bash
# Genéricas (mismo nombre independiente del proveedor; el adapter sabe cuál)
DIAN_PROVIDER=alegra              # alegra | siigo | facture
DIAN_API_URL=https://api.alegra.com/api/v1
DIAN_API_KEY=PLACEHOLDER          # API key del proveedor
DIAN_API_USER=PLACEHOLDER         # Si aplica (auth básica)
DIAN_RESOLUTION_NUMBER=18760000001  # Resolución de numeración DIAN
DIAN_PREFIX=LUCAMS                  # Prefijo de las facturas
```

### Adaptador `InvoiceProvider`

Patrón análogo a `PaymentProvider`: interfaz que permite cambiar de proveedor sin reescribir la lógica de negocio.

```ts
// lib/invoicing/types.ts
export interface InvoiceProvider {
  readonly name: "alegra" | "siigo" | "facture";

  /** Emite factura electrónica para una orden pagada */
  emitInvoice(order: OrderForInvoice): Promise<{
    invoiceNumber: string;
    cufe: string; // Código Único de Factura Electrónica
    pdfUrl: string;
    xmlUrl: string;
    emittedAt: Date;
  }>;

  /** Emite nota crédito para reembolsos/anulaciones */
  emitCreditNote(
    invoiceId: string,
    amount: number,
    reason: string,
  ): Promise<{
    creditNoteNumber: string;
    cufe: string;
    pdfUrl: string;
  }>;

  /** Consulta estado en DIAN */
  getInvoiceStatus(invoiceNumber: string): Promise<"ACCEPTED" | "REJECTED" | "PENDING">;
}
```

### Flujo de emisión

```
Order pasa a PAID
   ↓
saga step "emit-invoice":
   ↓ la orden queda marcada como pendiente de emitir
                                    ↓
                     pg_cron → /api/cron/invoice-emit (§9 — mismo modelo que los demás jobs)
                                    ↓
                                    Llama a InvoiceProvider.emitInvoice()
                                              ↓ (con retry + circuit breaker)
                                    Guarda Invoice(orderId, cufe, pdfUrl, ...)
                                              ↓
                                    sendEmail({ template: 'invoice', ... }) vía lib/resend.ts
```

> **Importante:** la emisión de factura no es bloqueante para confirmar la orden al cliente. Si DIAN está caído, la orden se confirma igual y la factura se emite cuando DIAN vuelva (job reintenta en el próximo tick + flag de reconciliación).

### Notas de crédito

Reembolsos parciales o totales requieren nota crédito electrónica. Se emite vía mismo `InvoiceProvider.emitCreditNote()`.

### Pendientes pre-Fase 7 (mandato #9)

- [ ] Confirmar costo, API y soporte de nota crédito de cada candidato.
- [ ] Decidir vía ADR-025.
- [ ] Tramitar resolución de numeración con DIAN (proceso del usuario).
- [ ] Integrar el `InvoiceProvider` elegido.

---

## 8. Resiliencia compartida (timeouts, retries, circuit breakers)

> **Patrones detallados en** [`CONVENTIONS.md` § Resiliencia](./CONVENTIONS.md#resiliencia--timeouts-retries-circuit-breakers).

### Aplicación por integración

| Integración            | Timeout | Retry                                      | Circuit breaker                                                 |
| ---------------------- | ------- | ------------------------------------------ | --------------------------------------------------------------- |
| Wompi GET status       | 5 s     | 3 intentos, backoff exp. base 200ms        | threshold=5, resetMs=30000                                      |
| Aveonline cotización   | 15 s    | 2 intentos                                 | Breaker separado `aveonline-quote` (threshold=5, resetMs=30000) |
| Aveonline generar guía | 20 s    | **Sin retry** (no idempotente: doble guía) | threshold=5, resetMs=30000                                      |
| Gemini                 | 12 s    | 1 reintento con el modelo fallback         | —                                                               |
| Resend                 | 15 s    | 4 intentos, backoff 1s/2s/4s (nunca 4xx)   | Propio: >50% de fallos en últimos 10 envíos → 30 s              |
| Proveedor DIAN         | 15 s    | 5 intentos                                 | threshold=3, resetMs=120000 (cuando se integre)                 |

> Wompi no tiene "POST transaction" server-side: el pago es Web Checkout por redirección (la única llamada API es el GET de estado). La cotización Aveonline tiene breaker separado para que una tormenta de cotizaciones lentas no bloquee la generación de guías de órdenes YA PAGADAS (revisión 2026-07-11). La guía NO se reintenta en código: un timeout pudo crear la guía server-side → se marca `needsReconciliation` y un humano verifica en el panel Aveonline antes de reintentar.

### Request ID correlation

**No implementado (propuesta).** `lib/external-call.ts` / `lib/request-id.ts` no existen y ninguna llamada outbound envía `X-Lucams-Request-Id` (verificado 2026-09-03); la correlación hoy es por logs estructurados (`event`, `orderNumber`, `trackingNumber`, `id` de Resend/Wompi). Si se retoma, el diseño propuesto era:

```ts
// lib/external-call.ts
import { fetchWithTimeout } from "./fetch-with-timeout";
import { getRequestId } from "./request-id";

export async function externalFetch(url: string, init: RequestInit & { timeoutMs: number }) {
  const requestId = getRequestId();
  return await fetchWithTimeout(url, {
    ...init,
    headers: {
      ...init.headers,
      "X-Lucams-Request-Id": requestId,
      "User-Agent": `Lucams_shop/1.0 (+https://lucamsshop.com)`,
    },
  });
}
```

---

## 9. Background jobs (pg_cron + pg_net → HTTP `/api/cron/*`) — ADR-017

### Modelo real (implementado)

ADR-017 (2026-05-09) decidió `pgmq` + `pg_cron` con consumidores Edge Function. En la implementación se pivotó a un modelo más simple, 100% Supabase + la misma app Next.js: **pg_cron dispara `net.http_get` (pg_net) contra endpoints `/api/cron/*`**, con el secreto en el header `x-cron-secret` leído en runtime desde Supabase Vault (nunca en el SQL ni en la URL). **No hay colas pgmq ni Edge Functions en uso** (pgmq queda habilitada como extensión pero sin colas activas — verificado 2026-09-03). No se usa Vercel Cron (mandato #11).

- **Agendamiento versionado en migraciones** (idempotentes, con guard limpio si faltan las extensiones): `supabase/migrations/00000000000015_pgcron_http_jobs.sql` (6 jobs), `00000000000016_pgcron_purge_event_logs.sql`, `00000000000021_pgcron_cms_publish.sql`, `00000000000023_pgcron_cron_vercel_bypass.sql` (re-agenda los 8 con bypass opcional del SSO de Vercel vía secreto `cron_vercel_bypass` en Vault, solo ambientes con protección).
- **Secretos en Vault (acción humana por ambiente):** `cron_base_url` y `cron_secret` (`select vault.create_secret(...)` — ver docs/OPERATIONS.md). Sin ellos los jobs quedan agendados pero fallan en runtime.
- **Auth del endpoint:** cada route compara el header `x-cron-secret` contra `CRON_SECRET` (env) con `timingSafeEqual`; 401 si falta o no coincide. No se acepta `?secret=` (queda en logs).
- **Observabilidad:** cada cron registra heartbeat (`recordCronHeartbeat` — dead-man switch supervisado por `/api/health/crons`), captura errores en `ErrorLog` y notifica el FALLO al centro de notificaciones admin (`notifyCronFailure`). Los éxitos no se registran (anti-ruido).

### Jobs activos (8)

| Job pg_cron                    | Endpoint                          | Schedule (UTC) | Qué hace                                                 |
| ------------------------------ | --------------------------------- | -------------- | -------------------------------------------------------- |
| `lucams-alerts`                | `/api/cron/alerts`                | `*/5 * * * *`  | Evalúa alertas operativas (webhooks stuck, SLO, errores) |
| `lucams-daily-summary`         | `/api/cron/daily-summary`         | `0 13 * * *`   | Resumen diario del negocio (8am Colombia)                |
| `lucams-review-request`        | `/api/cron/review-request`        | `0 17 * * *`   | Emails de solicitud de reseña (~7 días post-entrega)     |
| `lucams-cart-recovery`         | `/api/cron/cart-recovery`         | `0 * * * *`    | Recordatorio de carritos abandonados ≥4h (un solo envío) |
| `lucams-back-in-stock`         | `/api/cron/back-in-stock`         | `*/30 * * * *` | Avisos "avísame cuando vuelva"                           |
| `lucams-purge-anon-designs`    | `/api/cron/purge-anon-designs`    | `0 8 * * *`    | Purga de diseños anónimos vencidos (retención)           |
| `lucams-purge-event-logs`      | `/api/cron/purge-event-logs`      | `0 3 * * *`    | Purga diaria de EventLog (retención)                     |
| `lucams-cms-publish-scheduled` | `/api/cron/cms-publish-scheduled` | `*/5 * * * *`  | Publicación programada de contenido CMS                  |

### Variables de entorno

```bash
CRON_SECRET=xxxxxxxxxxxxxx   # Mismo valor que el secreto cron_secret del Vault, por ambiente
```

El acceso a DB de los crons usa las credenciales ya existentes; no hay vars dedicadas de colas.

### Idempotencia y retries

- **Idempotencia:** cada endpoint chequea estado antes de actuar (recordatorio ya enviado, reseña ya pedida, `WebhookEvent.processedAt`, etc.) — un disparo duplicado es no-op.
- **Retries:** pg_cron no reintenta; el "retry" es el próximo tick del schedule (los jobs son acotados e idempotentes). Los reintentos con backoff de integraciones externas viven inline en los clients (`lib/resend.ts`, `lib/wompi.ts`, `features/shipping/aveonline.ts`), y los casos patológicos quedan flagueados `needsReconciliation` para acción admin.
- **Verificar horarios:** `SELECT jobname, schedule, active FROM cron.job;` en el SQL Editor de Supabase.

---

## 10. CMS API (interno, preparado para RAG)

Endpoints públicos sin auth que exponen el contenido CMS publicado del sitio para consumo programático (integraciones externas, futuro chatbot Claude con RAG).

**Base URL.** `https://lucamsshop.com/api/cms/*` (prod) o `http://localhost:3000/api/cms/*` (dev).

**Auth.** Ninguna — el contenido publicado ya es público en el sitio. Si se agregan settings con info sensible en el futuro, filtrar en `/api/cms/settings/route.ts` antes de responder.

**Rate-limit.** 30 reqs/min por IP. Excedido devuelve `429` con `application/problem+json` y `Retry-After` header.

**Cache HTTP.** `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` en bloques + settings. Search más corto (60/300). Invalidación inmediata cuando admin publica via `updateTag("cms")` en Server Action.

### Endpoints

#### GET `/api/cms/blocks`

Lista todos los bloques publicados. Opcional `?category=X`.

```bash
curl https://lucamsshop.com/api/cms/blocks?category=legal
```

```json
{
  "count": 8,
  "category": "LEGAL",
  "blocks": [
    {
      "key": "legal.privacidad",
      "title": "Aviso de Privacidad",
      "body": "## Tratamiento de datos personales\n\n...",
      "format": "MARKDOWN",
      "category": "LEGAL",
      "description": "Aviso visible en /legal/privacidad",
      "version": 3,
      "updatedAt": "2026-05-12T01:23:45.000Z"
    }
  ]
}
```

Categorías válidas: `LEGAL`, `HOME`, `FOOTER`, `EMPTY_STATE`, `COOKIES`, `FAQ`, `SUPPORT`, `MAINTENANCE`, `EMAIL`, `MARKETING`.

#### GET `/api/cms/blocks/[key]`

Bloque individual por key. `404` si no existe o no está publicado.

```bash
curl https://lucamsshop.com/api/cms/blocks/legal.privacidad
```

#### GET `/api/cms/settings`

Lista todos los SiteSetting. Opcional `?category=X`.

Categorías válidas: `CONTACT`, `BUSINESS`, `LEGAL`, `COMMERCE`, `SOCIAL`, `EXTERNAL`, `WHATSAPP`, `COPYRIGHT`, `SEO`.

```bash
curl https://lucamsshop.com/api/cms/settings?category=contact
```

```json
{
  "count": 2,
  "category": "CONTACT",
  "settings": [
    {
      "key": "CONTACT_EMAIL",
      "value": "hola@lucamsshop.com",
      "valueType": "EMAIL",
      "category": "CONTACT",
      "label": "Email de contacto público",
      "description": "Aparece en footer + páginas legales"
    }
  ]
}
```

#### GET `/api/cms/search?q=texto`

Búsqueda full-text con `pg_trgm` + `unaccent`. Tolerante a typos y acentos. Top 20 ordenados por similarity DESC.

```bash
curl "https://lucamsshop.com/api/cms/search?q=garanti"
# matchea "Garantías", "garantía"
```

```json
{
  "query": "garanti",
  "count": 1,
  "results": [
    { "key": "legal.garantias", "title": "Garantías", "body": "...", "version": 1, ... }
  ]
}
```

`q` debe tener mínimo 2 chars. Sin `q` o `q.length < 2` devuelve `400`.

### Uso desde futuro chatbot Claude (RAG)

El chatbot embebe el body de los matches en el prompt:

```ts
// Pseudo-código del futuro chatbot Fase 5+
const userQuestion = "¿en cuántos días puedo devolver un producto?";

const r = await fetch(`/api/cms/search?q=${encodeURIComponent(userQuestion)}`);
const { results } = await r.json();

const context = results
  .slice(0, 3)
  .map((b) => `[${b.key} v${b.version}] ${b.body}`)
  .join("\n\n");

const prompt = `Contexto del sitio:\n${context}\n\nPregunta del usuario: ${userQuestion}\n\nResponde con base SOLO en el contexto. Cita el bloque (ej. "según [legal.devoluciones v3]").`;

const answer = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 500,
  messages: [{ role: "user", content: prompt }],
});
```

**Beneficio del versionado:** la respuesta incluye `v3` → auditable. Si el aviso cambia (`v4` publicada) y un usuario reporta una respuesta vieja, podemos rebobinar exactamente qué versión usó el chatbot.

**Cuando crezca el volumen:** migrar a embeddings con `pgvector` (Supabase tiene extension nativa) para similarity semántica además de la sintáctica de pg_trgm. Decisión en Fase 5+ cuando se justifique.

### Cómo agregar contenido nuevo desde admin

1. Login admin en `/admin/login`
2. Ir a `/admin/contenido` → tab "Bloques" o "Configuración"
3. Crear/editar → previsualización live en tiempo real
4. "Publicar" → cambio visible en sitio y en API en el próximo request (cache invalidado via tag `cms`)

### Referencias

- ADR-033 en `docs/DECISIONS.md`: arquitectura completa del CMS
- `apps/web/lib/cms.ts`: helpers + tipos
- `apps/web/app/api/cms/*`: endpoints implementados
- `packages/db/scripts/seed-cms.mjs`: seed idempotente

---

## 11. Cloudflare Turnstile (anti-bot)

### Variables de entorno

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAxxxxxxxxx   # Cliente (widget)
TURNSTILE_SECRET_KEY=xxxxxxxxxxxxxx                   # Server-only, NUNCA al cliente
```

### Implementación

- **Widget:** `components/turnstile-widget.tsx` carga `https://challenges.cloudflare.com/turnstile/v0/api.js` y renderiza con `window.turnstile.render` (NO `className="cf-turnstile"` — se evita el auto-detect de Cloudflare). Sin sitekey (dev local) renderiza el input hidden vacío.
- **Verificación:** `lib/turnstile.ts` → `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` (timeout 5 s). **Fail-closed en producción:** sin `TURNSTILE_SECRET_KEY` toda verificación falla y el form se bloquea; en dev sin keys pasa para no bloquear desarrollo. Fallo de red/HTTP → `success: false` (bloquea).
- **8 call sites en 7 server actions** (todas leen `cf-turnstile-response` del FormData): registro, recuperar-password, checkout/pago (×2: pago Wompi y COD), cotizaciones, reseñas, soporte y newsletter.

## 12. Have I Been Pwned (contraseñas filtradas)

- **`lib/pwned-passwords.ts`:** k-anonymity — SHA-1 de la contraseña, se envían SOLO los primeros 5 chars del hash a `GET https://api.pwnedpasswords.com/range/<prefijo>` y el match se hace local contra los ~500 suffixes devueltos. La API nunca recibe la contraseña ni el hash completo. Header `Add-Padding: true` (padding anti análisis de longitud). Sin API key, gratis.
- **Timeout 3 s; fail-open con log** (`security.pwned.*`) si la API cae — no se bloquea el signup por una dependencia externa.
- **3 call sites:** registro, restablecer-password y mi-cuenta/seguridad (cambio de contraseña). Si el hash está en breaches → se rechaza la contraseña con el conteo de apariciones.

## 13. Cloudflare R2 (backups DB off-site) — ADR-059

- **Workflow `.github/workflows/backup.yml`:** `pg_dump` DIARIO → bucket R2 (S3 API) vía `apps/web/scripts/backup-db-to-r2.mjs` (`pnpm db:backup`). **Cifrado gpg AES256 con passphrase desde 2026-08-29** (hallazgo A-3 de la auditoría 2026-08-24) — fail-closed: sin `BACKUP_GPG_PASSPHRASE` el backup no corre.
- **DR drill mensual** (`.github/workflows/dr-drill.yml` + `apps/web/scripts/dr-drill.mjs`): baja el backup más nuevo de R2, lo descifra con gpg y verifica restaurabilidad real.
- **Corre en GitHub Actions, NO en Vercel Cron** (mandato #11). Si faltan secrets, el job se salta con warning (gate `HAS_DB`/`HAS_R2`).
- **Secrets (GitHub → Actions):** `BACKUP_DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (`lucams-backups`), `BACKUP_GPG_PASSPHRASE`.

## 14. Vercel (plataforma de hosting)

- Hosting y CI de `apps/web` (Next.js 16). Preview deployments con protección SSO — por eso los crons pg_cron llevan bypass opcional vía Vault (migración `…023`).
- **`VERCEL_ENV`** es la fuente de "prod real" en los guards (rate-limits, etc.); `NODE_ENV=production` también aplica a previews — no confundir ambas (bug real certificación Bloque A con webhooks Wompi).
- El webhook de Wompi declara `maxDuration = 60` para contener el presupuesto de la saga (auth Aveonline + `createShipment` 20 s + escrituras).
- **No se usa Vercel Cron** (ADR-017, §9) ni Vercel KV/Upstash (ADR-016); backups en GitHub Actions (§13).

---

## Checklist por integración (al pasar a producción)

### Wompi

- [ ] Cuenta de comercio aprobada (`comercios.wompi.co`)
- [ ] Llaves de producción configuradas en Vercel
- [ ] Webhook configurado en panel Wompi apuntando a `https://lucamsshop.com/api/webhooks/wompi`
- [ ] Probar compra real con valor mínimo
- [ ] Cambiar `WOMPI_ENV=production`

### Aveonline

- [ ] Cuenta de producción activada (usuario + clave)
- [ ] Dirección de origen y recogidas configuradas
- [ ] `AVEONLINE_ENV=production` + `AVEONLINE_USUARIO`/`AVEONLINE_CLAVE` reales solo en Vercel production
- [ ] Webhook AveCRM configurado apuntando a `https://lucamsshop.com/api/webhooks/aveonline`
- [ ] Probar envío real con destino conocido

### Resend

- [ ] DNS de `mail.lucamsshop.com` configurado (SPF, DKIM, DMARC)
- [ ] Dominio verificado en Resend
- [ ] Plan Pro activado
- [ ] `EMAIL_FROM` actualizado a dominio propio
- [ ] Webhook Svix creado apuntando a `https://lucamsshop.com/api/webhooks/resend` + `RESEND_WEBHOOK_SECRET` en Vercel

### Gemini

- [ ] `GEMINI_API_KEY` con presupuesto mensual configurado
- [ ] Alertas de costo activas
- [ ] Rate limit de la Server Action validado (20 sugerencias/hora por IP en prod)

### WhatsApp

- [ ] Número definitivo de WhatsApp Business configurado (setting `WA_NUMBER` en el CMS o `NEXT_PUBLIC_WA_NUMBER`)
- [ ] Estado/foto de WhatsApp Business actualizados
- [ ] Plantilla de respuestas frecuentes lista

### Turnstile

- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` de producción en Vercel (sin la secret, prod bloquea TODOS los formularios — fail-closed)
- [ ] Widget verificado end-to-end en los 7 formularios (registro, recuperar, checkout Wompi/COD, cotización, reseña, soporte, newsletter)

### Cloudflare R2 (backups)

- [ ] Bucket `lucams-backups` creado + los 6 secrets en GitHub → Settings → Secrets and variables → Actions
- [ ] `BACKUP_GPG_PASSPHRASE` guardada también en el gestor de contraseñas del negocio (sin ella los backups son irrecuperables)
- [ ] DR drill mensual verde (restore real verificado, `.github/workflows/dr-drill.yml`)
