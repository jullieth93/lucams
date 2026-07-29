# Integraciones — Lucams_shop

Detalle de cada integración externa: cómo se conecta, qué endpoints/webhooks involucra, variables de entorno necesarias y modos sandbox vs producción.

## Tabla resumen

| Integración    | Propósito                             | SDK / método            | Webhooks                   | Sandbox                 |
| -------------- | ------------------------------------- | ----------------------- | -------------------------- | ----------------------- |
| **Wompi**      | Pasarela de pago                      | REST + Web Checkout     | `transaction.updated`      | Sí                      |
| **Aveonline**  | Logística multi-carrier + COD         | REST API                | Tracking (webhook AveCRM)  | Cuenta DEMO pública     |
| **Supabase**   | DB + Auth + Storage + Realtime        | `@supabase/supabase-js` | —                          | Mismo proyecto Free     |
| **Resend**     | Email transaccional                   | `resend` SDK            | — (sin webhooks por ahora) | Subdominio `resend.dev` |
| **Claude API** | Asistente de diseño en estudio        | `@anthropic-ai/sdk`     | —                          | Mismo endpoint          |
| **WhatsApp**   | Botón flotante con mensaje pre-armado | `wa.me` URL scheme      | —                          | —                       |

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
// lib/payment/wompi.ts
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

### Estados de transacción

| Estado Wompi | OrderStatus interno | Acción                                                                                                          |
| ------------ | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `APPROVED`   | `PAID`              | Crear envío Aveonline, descontar stock, enviar email                                                            |
| `DECLINED`   | `PENDING_PAYMENT`   | Sin dinero movido: NO cancela (Wompi habilita reintento con la misma reference ~3 min — doc oficial 2026-07-28) |
| `VOIDED`     | `REFUNDED`          | Restaurar stock, email de reembolso                                                                             |
| `ERROR`      | `PENDING_PAYMENT`   | Igual que DECLINED: la orden espera el reintento del cliente                                                    |

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
AVEONLINE_USUARIO=xxxxxxxxxxxxxx
AVEONLINE_CLAVE=xxxxxxxxxxxxxx
```

### Puntos clave

- **Cotización:** `POST /api/shipping/quote` → `cotizarDoble` de Aveonline (multi-carrier); cache 5 min por destino + peso para no llamar a Aveonline en cada keystroke (`INTEGRATIONS_AVEONLINE.md` §3).
- **Guías:** se generan al pasar la orden a `PAID`; reintentos durables vía `pgmq` (`INTEGRATIONS_AVEONLINE.md` §4).
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

- Bucket `products`: imágenes de productos (público, lectura abierta).
- Bucket `customer-uploads`: imágenes que sube el cliente al estudio de personalización (privado, URL firmada con TTL 1h).
- Bucket `production-assets`: PNG alta resolución generados al confirmar orden (privado, solo admin con role `FULFILLMENT`).

### Realtime

Suscripción a cambios en `ProductVariant.stock` para alertar en checkout si se agotó:

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

# Dev (Free tier)
EMAIL_FROM=Lucams_shop <onboarding@resend.dev>
# Producción (Pro)
# EMAIL_FROM=Lucams_shop <hola@mail.lucamsshop.com>
```

### Plantillas a crear (`lib/email/templates/`)

| Template                 | Trigger                         | Plantilla react-email                |
| ------------------------ | ------------------------------- | ------------------------------------ |
| `welcome.tsx`            | Registro de cliente             | Mascota saludando                    |
| `order-confirmation.tsx` | Order pasa a `PAID`             | Items + total + tracking placeholder |
| `order-shipped.tsx`      | Webhook Aveonline `EN TRANSITO` | Tracking URL + ETA                   |
| `order-delivered.tsx`    | Webhook Aveonline `ENTREGADA`   | Pidiendo reseña                      |
| `cart-recovery-1h.tsx`   | Cron 1h después de abandono     | Cupón 5%                             |
| `cart-recovery-24h.tsx`  | Cron 24h después                | Recordatorio sin cupón               |
| `password-reset.tsx`     | Solicitud de reset              | Link con TTL 1h                      |

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

---

## 5. Claude API (asistente de diseño en el estudio)

### Variables de entorno

```bash
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-6  # Bueno-rápido-económico para sugerencias
```

### Endpoint: `app/api/ai/design-suggest/route.ts`

```ts
export async function POST(req: Request) {
  // 1. Rate limit por IP via lib/rate-limit.ts (Postgres + pg_cron, ADR-016)
  // 2. Validar body con Zod: { occasion, palette, productType, photosCount }
  // 3. Buscar en cache_entries (Postgres) por (occasion, productType, photosCount); TTL 24h
  // 4. Si miss: construir system prompt con few-shot de plantillas existentes
  // 5. Llamar a Claude con stream
  // 6. Parsear respuesta JSON estructurada
  // 7. Cachear resultado en cache_entries con expires_at = now() + 24h
  // 8. Devolver 3 sugerencias { layout, colors, copy, templateId }
  // 9. Loggear costo aproximado (input_tokens, output_tokens) para tracking sin PII
}
```

### Prompt structure (boceto)

```
SYSTEM:
Eres un asistente de diseño para Lucams_shop, una tienda de imanes personalizados.
Cuando el cliente describe una ocasión, propones 3 plantillas de diseño que pueden
adaptar usando nuestro editor.

Cada sugerencia debe tener:
- templateId: uno de [photo-grid-3, polaroid-stack, calendar-month, ...]
- colors: paleta de 3 HEX coherente con la ocasión
- copy: texto sugerido (máx 30 chars)
- rationale: 1 frase de por qué encaja

Devuelve JSON: { suggestions: Suggestion[] }

USER:
Ocasión: {occasion}
Cantidad de fotos: {photosCount}
Tipo de producto: {productType}
```

### Costo aproximado

Claude Sonnet 4.6: ~$3/MTok input, $15/MTok output. Cada sugerencia consume ~500 tokens input + 300 output ≈ $0.006. Manejable.

### Caching

Las respuestas a la misma combinación `(occasion, productType, photosCount)` se cachean 24h en la tabla Postgres `cache_entries` (ADR-016), con limpieza vía `pg_cron`. Reduce costo y latencia. Si en producción la latencia de Postgres se vuelve un cuello de botella (p95 > 50 ms), se evalúa Redis externo (ADR-023 reservado).

---

## 6. WhatsApp (`wa.me` link, sin API)

### Decisión

Sin Twilio API por ahora. Solo botón flotante con mensaje pre-armado contextual. Upgrade futuro: Twilio WhatsApp Business API cuando el volumen lo justifique.

### Variables de entorno

```bash
NEXT_PUBLIC_WA_NUMBER=573208873826   # Sin + ni espacios, formato wa.me
```

### Implementación

```ts
// lib/whatsapp.ts
const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER!;

export function buildWhatsAppLink(message: string): string {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function whatsappForProduct(productName: string): string {
  return buildWhatsAppLink(`Hola, me interesa el producto *${productName}*, ¿está disponible?`);
}

export function whatsappForCart(items: { name: string; qty: number }[], totalCOP: number): string {
  const lines = items.map((i) => `- ${i.qty}× ${i.name}`).join("\n");
  return buildWhatsAppLink(
    `Hola, quiero confirmar este pedido:\n\n${lines}\n\nTotal: $${totalCOP.toLocaleString("es-CO")}`,
  );
}

export function whatsappForOrder(orderNumber: string): string {
  return buildWhatsAppLink(`Hola, ¿podrían darme info sobre mi orden #${orderNumber}?`);
}
```

### Botón flotante

Componente `<WhatsAppFAB />` en `components/storefront/`, presente en `(storefront)/layout.tsx`. Posición: `fixed bottom-4 right-4`, ícono de la mascota o el ícono oficial de WhatsApp con paleta de la marca.

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
   ↓ enqueue("invoice_emit", { orderId })  →  pgmq
                                              ↓
                                    Edge Function consumer
                                              ↓
                                    Llama a InvoiceProvider.emitInvoice()
                                              ↓ (con retry + circuit breaker)
                                    Guarda Invoice(orderId, cufe, pdfUrl, ...)
                                              ↓
                                    enqueue("email_send", { template: 'invoice', ... })
```

> **Importante:** la emisión de factura no es bloqueante para confirmar la orden al cliente. Si DIAN está caído, la orden se confirma igual y la factura se emite cuando DIAN vuelva (queue + retries).

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

| Integración            | Timeout | Retry                               | Circuit breaker             |
| ---------------------- | ------- | ----------------------------------- | --------------------------- |
| Wompi GET status       | 5 s     | 3 intentos, backoff exp. base 200ms | threshold=5, resetMs=30000  |
| Wompi POST transaction | 10 s    | 1 intento (no idempotente)          | Idem                        |
| Aveonline cotización   | 5 s     | 3 intentos                          | threshold=5, resetMs=30000  |
| Aveonline generar guía | 15 s    | 3 intentos vía pgmq (durables)      | threshold=3, resetMs=60000  |
| Anthropic              | 30 s    | 2 intentos para 5xx, 0 para 4xx     | threshold=10, resetMs=60000 |
| Resend                 | 10 s    | 3 intentos vía pgmq                 | threshold=5, resetMs=30000  |
| Proveedor DIAN         | 15 s    | 5 intentos vía pgmq                 | threshold=3, resetMs=120000 |

### Request ID correlation

Toda llamada outbound incluye header `X-Lucams-Request-Id: <uuid>`. Algunos vendors lo aceptan/loggean (ayuda al soporte a correlacionar); otros lo ignoran (sin efecto adverso).

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

## 9. Background jobs (Supabase Queues + pg_cron) — ADR-017

### Por qué este modelo

Los jobs durables (recuperación de carrito, reconciliación de órdenes, retry de envíos, send de emails) viven en `pgmq` + `pg_cron`, no en Vercel Cron. Razones detalladas en [ADR-017](./DECISIONS.md). Verificación oficial: [supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues) (consultada 2026-05-09): _"Postgres-native durable Message Queue system with guaranteed delivery"_.

### Variables de entorno

No se necesitan vars dedicadas: el acceso a `pgmq` usa `SUPABASE_SECRET_KEY` que ya existe.

### Colas previstas

| Cola                      | Productor                                    | Consumidor    | Frecuencia                         |
| ------------------------- | -------------------------------------------- | ------------- | ---------------------------------- |
| `cart_recovery_1h`        | `pg_cron` cada 5 min                         | Edge Function | A 1h del abandono                  |
| `cart_recovery_24h`       | `pg_cron` cada 5 min                         | Edge Function | A 24h del abandono                 |
| `order_reconciliation`    | `pg_cron` cada 15 min                        | Edge Function | Órdenes en `PENDING_PAYMENT` >1h   |
| `shipment_creation_retry` | Webhook handler de Wompi al fallar Aveonline | Edge Function | Inmediato + reintentos con backoff |
| `email_send`              | Cualquier flujo que mande email              | Edge Function | Inmediato                          |

### Patrón de productor (en server-side)

```ts
// lib/queue.ts
import { supabaseAdmin } from "@/lib/supabase/service";

export async function enqueue<T>(queueName: string, payload: T): Promise<void> {
  const { error } = await supabaseAdmin
    .schema("pgmq_public")
    .rpc("send", { queue_name: queueName, message: payload });
  if (error) throw new Error(`Failed to enqueue to ${queueName}: ${error.message}`);
}

// Uso en webhook de Wompi
await enqueue("email_send", {
  template: "order-confirmation",
  to: order.email,
  data: { orderNumber: order.number, items, total },
});
```

### Patrón de consumidor (Edge Function)

```ts
// supabase/functions/email-send-consumer/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SECRET_KEY")!);

Deno.serve(async () => {
  const { data: messages } = await supabase.schema("pgmq_public").rpc("read", {
    queue_name: "email_send",
    vt: 30, // visibility timeout 30s
    qty: 5, // batch
  });

  for (const msg of messages ?? []) {
    try {
      await sendEmailViaResend(msg.message);
      await supabase
        .schema("pgmq_public")
        .rpc("delete", { queue_name: "email_send", msg_id: msg.msg_id });
    } catch (err) {
      console.error("Email send failed", { msg_id: msg.msg_id, err });
      // No borrar → VT expira → reintento automático
      // Si falla N veces, archivar manualmente o mover a dead-letter queue
    }
  }
  return new Response(JSON.stringify({ processed: messages?.length ?? 0 }));
});
```

### Schedule de productores con `pg_cron`

```sql
-- Encolar carritos abandonados a 1h
SELECT cron.schedule(
  'enqueue-cart-recovery-1h',
  '*/5 * * * *',  -- cada 5 min
  $$
    INSERT INTO pgmq.q_cart_recovery_1h (message)
    SELECT jsonb_build_object('cartId', "cartId", 'email', "email")
    FROM "AbandonedCart"
    WHERE "createdAt" < NOW() - INTERVAL '1 hour'
      AND "createdAt" > NOW() - INTERVAL '70 minutes'  -- ventana corta para evitar duplicados
      AND "lastReminderSentAt" IS NULL
      AND "recoveredAt" IS NULL
  $$
);

-- Reconciliar órdenes en PENDING_PAYMENT viejas
SELECT cron.schedule(
  'enqueue-order-reconciliation',
  '*/15 * * * *',
  $$
    INSERT INTO pgmq.q_order_reconciliation (message)
    SELECT jsonb_build_object('orderId', id, 'wompiTransactionId', "wompiTransactionId")
    FROM "Order"
    WHERE status = 'PENDING_PAYMENT'
      AND "createdAt" < NOW() - INTERVAL '1 hour'
      AND "wompiTransactionId" IS NOT NULL
  $$
);
```

### Idempotencia y retries

- **Idempotencia:** los consumers chequean estado antes de actuar (`AbandonedCart.lastReminderSentAt IS NULL`, `WebhookEvent` ya procesado, etc.). Nunca asumen que `pgmq` no entregó dos veces.
- **Retries:** dejar que el `vt` expire es el reintento natural. Tras N reintentos (configurable por cola), el operador investiga y archiva con `pgmq.archive()`.
- **Dead-letter:** colas archivadas viven en `pgmq.a_<queue_name>` para análisis post-mortem.

### Observabilidad

```sql
-- Ver mensajes pendientes en una cola
SELECT * FROM pgmq.q_email_send;

-- Ver mensajes archivados (fallidos)
SELECT * FROM pgmq.a_email_send;

-- Métricas básicas
SELECT pgmq.metrics('email_send');
```

> **Verificación pendiente (mandato #9):** confirmar antes de Fase 1 que `pgmq` está disponible en plan Free de Supabase y entender los límites de Edge Functions Free (invocaciones/mes, duración máxima).

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

## Checklist por integración (al pasar a producción)

### Wompi

- [ ] Cuenta de comercio aprobada (`comercios.wompi.co`)
- [ ] Llaves de producción configuradas en Vercel
- [ ] Webhook configurado en panel Wompi apuntando a `https://lucamsshop.com/api/wompi/webhook`
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

### Claude API

- [ ] API key con presupuesto mensual configurado
- [ ] Alertas de costo activas
- [ ] Rate limit en endpoint validado

### WhatsApp

- [ ] Número definitivo de WhatsApp Business configurado
- [ ] Estado/foto de WhatsApp Business actualizados
- [ ] Plantilla de respuestas frecuentes lista
