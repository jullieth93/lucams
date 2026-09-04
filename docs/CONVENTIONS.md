# Convenciones — Lucams_shop

> Patrones obligatorios para que el código sea coherente entre frontend, backend y base de datos. Toda discusión sobre "¿cómo hacemos X?" debería resolverse leyendo esto antes de escribir código nuevo.

## Tabla de contenido

1. [Principios](#principios)
2. [Naming](#naming)
3. [Estructura de carpetas detallada](#estructura-de-carpetas-detallada)
4. [Frontend — Server Components vs Client Components](#frontend--server-components-vs-client-components)
5. [Frontend — formularios y validación](#frontend--formularios-y-validación)
6. [Frontend — estados de UI (loading, error, empty)](#frontend--estados-de-ui-loading-error-empty)
7. [Backend — APIs (REST + Server Actions)](#backend--apis-rest--server-actions)
8. [Backend — formato estándar de errores (RFC 7807)](#backend--formato-estándar-de-errores-rfc-7807)
9. [Backend — capa de servicio](#backend--capa-de-servicio)
10. [Backend — saga pattern para flujos distribuidos](#backend--saga-pattern-para-flujos-distribuidos)
11. [Backend — idempotencia](#backend--idempotencia)
12. [DB — naming SQL](#db--naming-sql)
13. [DB — migration strategy (expand-then-contract)](#db--migration-strategy-expand-then-contract)
14. [DB — indexing strategy](#db--indexing-strategy)
15. [DB — soft delete + audit fields](#db--soft-delete--audit-fields)
16. [DB — foreign keys cascade explícito](#db--foreign-keys-cascade-explícito)
17. [DB — retention y archival](#db--retention-y-archival)
18. [Resiliencia — timeouts, retries, circuit breakers](#resiliencia--timeouts-retries-circuit-breakers)
19. [Logging y request ID correlation](#logging-y-request-id-correlation)
20. [Code style](#code-style)
21. [CMS — agregar un campo de contenido administrable](#cms--agregar-un-campo-de-contenido-administrable)

---

## Principios

1. **Coherencia > novedad.** Si ya existe un patrón en la base de código, úsalo. No introduzcas otro porque lo viste en un blog ayer.
2. **Explícito > implícito.** Nombres claros, defaults visibles, errores hablados. Magia no.
3. **Server-first cuando aplique.** RSC por defecto; client components solo cuando hay interactividad real.
4. **Validación en el límite.** Datos externos se validan al entrar (Zod). Datos internos asumen tipos correctos.
5. **Falla rápido, falla con info.** Errores con código, contexto y `requestId`.
6. **Idempotencia donde el cliente puede reintentar.** Pago, envío, email — todos con dedupe.

---

## Naming

| Elemento                       | Convención                                                                   | Ejemplo                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Archivos TS/TSX                | `kebab-case.tsx` o nombre del componente PascalCase                          | `product-card.tsx`, `ProductCard.tsx` (mantener una convención por carpeta) |
| Componentes React              | `PascalCase`                                                                 | `ProductCard`, `CheckoutStepper`                                            |
| Hooks                          | `useXxx` camelCase                                                           | `useSubmitPending`, `useDebounce`                                           |
| Funciones / variables          | `camelCase`                                                                  | `formatCOP`, `currentUser`                                                  |
| Constantes globales            | `SCREAMING_SNAKE_CASE`                                                       | `MAX_UPLOAD_BYTES`, `WA_NUMBER`                                             |
| Tipos / Interfaces             | `PascalCase` (sin prefijo `I`)                                               | `Order`, `CheckoutPayload`                                                  |
| Enums                          | `PascalCase` con valores `SCREAMING_SNAKE_CASE`                              | `OrderStatus.PENDING_PAYMENT`                                               |
| Tablas Prisma (modelos)        | `PascalCase` singular                                                        | `Customer`, `OrderItem`                                                     |
| Columnas Prisma                | `camelCase`                                                                  | `firstName`, `createdAt`                                                    |
| Tablas SQL nativas (no-Prisma) | `snake_case` plural                                                          | `rate_limit_buckets`                                                        |
| Funciones SQL                  | `snake_case`                                                                 | `rate_limit_check`                                                          |
| Variables de entorno           | `SCREAMING_SNAKE_CASE` con prefijo `NEXT_PUBLIC_` solo si visible en cliente | `WOMPI_PRIVATE_KEY`, `NEXT_PUBLIC_SITE_URL`                                 |
| Slugs (URLs)                   | `kebab-case`                                                                 | `/ocasion/dia-de-la-madre`                                                  |
| Branches Git                   | `tipo/descripcion-corta`                                                     | `feat/checkout-multi-step`, `fix/wompi-webhook-replay`                      |
| Commits                        | Conventional Commits                                                         | `feat(checkout): add COD as payment method`                                 |
| Tags Git                       | `v<semver>`                                                                  | `v0.3.1`                                                                    |
| Imports absolutos              | `@/...` apuntando a `apps/web/`                                              | `import { cn } from '@/lib/utils'`                                          |

---

## Estructura de carpetas detallada

```
apps/web/
├── app/
│   ├── page.tsx                         # Home
│   ├── productos/                       # Catálogo (SSR puro, filtros por query param)
│   ├── producto/[slug]/
│   ├── estudio/[slug]/                  # Estudio: studio-editor.tsx (react-konva),
│   │   │                                #   *-3d-view.tsx (react-three-fiber),
│   │   │                                #   lib/store.ts (Zustand)
│   │   └── ...
│   ├── checkout/                        # Multi-step: datos/ envio/ pago/ gracias/
│   │   └── pago/actions.ts              # Server Actions del paso (junto a la ruta)
│   ├── mi-cuenta/                       # pedidos/, perfil/, direcciones/, seguridad/…
│   ├── (auth)/                          # login/, registro/, recuperar-password/…
│   ├── admin/
│   │   ├── login/                       # + mfa/ (challenge TOTP)
│   │   └── (panel)/                     # Backoffice protegido (layout + admin-rbac-guard)
│   ├── api/                             # Solo endpoints REST
│   │   ├── webhooks/                    # wompi/, aveonline/, resend/
│   │   ├── cron/                        # jobs pg_cron protegidos con x-cron-secret
│   │   ├── catalog/ · coupons/ · cms/
│   │   └── ...
│   ├── error.tsx                        # Error boundary global
│   ├── not-found.tsx                    # 404 con mascota
│   └── global-error.tsx                 # Catch-all (root)
├── components/
│   ├── ui/                              # shadcn/ui generado
│   ├── admin/ · cms/ · home/ · product-detail/ · address/ · legal/
│   ├── product-card.tsx
│   ├── site-header.tsx / site-footer.tsx
│   └── ...
├── features/                            # Feature folders (lógica por feature)
│   ├── checkout/
│   │   ├── service.ts                   # Lógica de dominio + acceso DB (vía @/lib/db)
│   │   ├── schemas.ts                   # Zod schemas
│   │   └── cod-risk.ts · address-key.ts · …
│   ├── orders/                          # service.ts · saga.ts · stock.ts · emails.ts…
│   ├── payments/                        # provider.ts (interface) + wompi.ts
│   ├── shipping/                        # provider.ts + aveonline.ts
│   └── ... (~35 features)
├── lib/                                 # Utilidades cross-feature
│   ├── supabase/                        # server.ts · browser.ts · service.ts
│   ├── db.ts                            # Prisma client
│   ├── wompi.ts · resend.ts             # Clientes HTTP de terceros (fetch)
│   ├── cms.ts                           # Lectura CMS v2 con fallback
│   ├── cart-session.ts · checkout-session.ts   # Cookies selladas de sesión
│   ├── token-hash.ts                    # SHA-256 de bearer tokens
│   ├── admin-rbac-guard.ts · admin-rbac.ts · admin-roles.ts
│   ├── error-capture.ts · errors.ts     # RFC 7807 + ErrorLog/ErrorReport
│   ├── logger.ts                        # JSON estructurado con redact PII
│   ├── rate-limit.ts · rate-limit-keys.ts      # Postgres-based (ADR-016)
│   ├── fetch-with-timeout.ts · retry.ts · circuit-breaker.ts
│   ├── security-headers.ts · turnstile.ts · origin.ts · client-ip.ts
│   ├── storage.ts · photo-validation.ts
│   └── format.ts · money.ts · utils.ts…
├── proxy.ts                             # Proxy (ex-middleware, Next 16): request ID,
│                                        #   sesión Supabase, CORS, security headers,
│                                        #   gate /admin/*, redirects, idle-timeout admin
└── ...
```

> **Regla:** lógica que pertenece a una feature vive en `features/<feature>/`. Solo lo verdaderamente compartido va a `lib/`. Esto evita el "dios `lib/` con 200 archivos". Las Server Actions viven en `features/<feature>/actions.ts` cuando son reusables, o `app/<ruta>/actions.ts` cuando pertenecen a una sola pantalla.

---

## Frontend — Server Components vs Client Components

**Default: Server Component (RSC).** Solo declarar `'use client'` cuando se necesita una de:

- Estado local (`useState`, `useReducer`).
- Hooks de efecto (`useEffect`, `useLayoutEffect`).
- Eventos del navegador (`onClick`, `onChange`, etc.) — excepto en form actions.
- APIs del navegador (`localStorage`, `IntersectionObserver`, etc.).
- Librerías que solo corren en cliente (react-konva, three.js).

### Patrón "thin client wrapper"

Cuando una página es mayormente server pero tiene una isla interactiva: el server component renderiza el árbol y solo la isla es client.

```tsx
// app/producto/[slug]/page.tsx — Server Component
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; // En Next 16 params/searchParams son Promise
  const product = await getProductBySlug(slug); // Server-side fetch
  if (!product) notFound();
  return (
    <article>
      <ProductGallery images={product.images} /> {/* Server */}
      <ProductInfo product={product} /> {/* Server */}
      <AddToCartButton /> {/* Client island (Context + Server Action) */}
    </article>
  );
}
```

```tsx
// app/producto/[slug]/variant-actions.tsx — client island (ejemplo real: el
// buy-box de la PDP comparte la variante elegida vía Context y agrega al
// carrito con una Server Action en un <form action={...}>)
"use client";
export function AddToCartButton() {
  const { selectedId } = useSelectedVariant();
  return (
    <form action={addToCartAction}>
      <input type="hidden" name="variantId" value={selectedId ?? ""} />
      <SubmitButton>Agregar al carrito</SubmitButton>
    </form>
  );
}
```

### Datos: cuándo `fetch` vs Server Action vs API route

| Escenario                                       | Patrón                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Lectura inicial en SSR/RSC                      | Server Component con Prisma directo (service de la feature)       |
| Mutación de cliente (form submit, button click) | **Server Action** (preferido)                                     |
| Mutación llamada por terceros (webhooks)        | **API route** (`app/api/.../route.ts`)                            |
| Lectura desde cliente (búsqueda, autocomplete)  | Server Action si autenticado, API route con rate limit si público |
| IA (sugerencias de diseño)                      | Server Action que delega a `features/ai/service.ts`               |

### Hidratación selectiva

Imágenes pesadas no entran en client bundle: usar `next/image` con `priority` solo en LCP.

---

## Frontend — formularios y validación

### Stack

- **Server Actions + `useActionState`** (React 19) para el submit — no usamos react-hook-form: los forms son `<form action={formAction}>` nativos progresivamente mejorados.
- **Zod** para schemas, compartidos entre cliente (UX inmediata, validación ligera opcional) y servidor (validación final obligatoria).

### Patrón

```tsx
// app/checkout/pago/coupon-form.tsx
"use client";
import { useActionState } from "react";
import { applyCouponAction, type CouponActionState } from "./actions";

export function CouponForm() {
  const [state, formAction, pending] = useActionState<CouponActionState | null, FormData>(
    applyCouponAction,
    null,
  );

  return (
    <form action={formAction}>
      <Input name="code" aria-invalid={!!state?.error} aria-describedby="coupon-error" />
      {state?.error && <p id="coupon-error">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        Aplicar
      </Button>
    </form>
  );
}
```

```ts
// app/checkout/pago/actions.ts
"use server";
export async function applyCouponAction(
  _prev: CouponActionState | null,
  formData: FormData,
): Promise<CouponActionState> {
  const parsed = ApplyCouponSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: "Cupón inválido." };
  // ...delega a features/coupons; redirect() o devuelve state
}
```

### Reglas

- **Errores accesibles:** `aria-invalid`, `aria-describedby` apuntando al mensaje.
- **No deshabilitar el botón "submit"** hasta que el usuario intentó submit la primera vez (deshabilitar antes oculta el motivo del error); durante el submit, `pending` de `useActionState` (o `useSubmitPending`) lo deshabilita.
- **Server Action SIEMPRE re-valida con Zod**, no confía en lo que vino del cliente.
- **Mensajes en español:** centralizados en el schema Zod (no en el componente).
- **Anti-bot:** forms públicos (newsletter, contacto, auth) verifican Turnstile (`lib/turnstile.ts`) antes de procesar.

---

## Frontend — estados de UI (loading, error, empty)

### Mandato: cada vista tiene 4 estados explícitos

1. **Loading** — skeleton screen visible inmediatamente (no spinner ciego).
2. **Empty** — mascota mapache + copy guía ("¿Qué imán vamos a crear hoy?").
3. **Error** — mensaje claro + acción de recuperación + `requestId` visible si es 5xx.
4. **Success** — el contenido real.

### Patrón con Suspense + error boundaries

Next.js App Router ya provee los boundaries por convención de archivo: `loading.tsx` (Suspense) y `error.tsx` (error boundary) por segmento de ruta — p.ej. `app/productos/loading.tsx`, `app/admin/(panel)/error.tsx`, `app/error.tsx` y `app/global-error.tsx` para el catch-all.

```tsx
// app/productos/loading.tsx — skeleton con el MISMO layout que la página real
export default function Loading() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-muted h-64 animate-pulse rounded-xl" />
      ))}
    </div>
  );
}
```

### Skeleton screens

- Mismo layout que el contenido real (no rectángulos genéricos).
- Animación `pulse` (no spinner).
- Respeta `prefers-reduced-motion`: estático si el usuario lo pide.

### Toasts y notificaciones

- **Sonner** (default v4 de shadcn/ui).
- **No usar para errores críticos** (esos van inline en el form o página).
- **Auto-dismiss 5s** para success; **persistente con dismiss explícito** para errores.
- **Live region `aria-live="polite"`** para que lector de pantalla los anuncie.

---

## Backend — APIs (REST + Server Actions)

### Cuándo cada una

| Patrón                                 | Usar para                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Server Action**                      | 90% de mutaciones desde la UI (forms, botones de "marcar leído", etc.)                    |
| **API route** (`app/api/.../route.ts`) | Webhooks de terceros · endpoints públicos para mobile/integraciones · streaming · uploads |

### Server Actions — convención

- Una Server Action = una función exportada de un módulo con `'use server'` en la primera línea.
- Vive en `features/<feature>/actions.ts` (reusable entre pantallas) o `app/<ruta>/actions.ts` (de una sola pantalla, p.ej. `app/checkout/pago/actions.ts`).
- **Nunca expone Prisma directo;** delega al `service.ts` de la feature.
- Para forms devuelve un **state tipado** consumido por `useActionState` (`{ error?: string; ... }`); para flujos que terminan en navegación, `redirect()` de Next. Ejemplo real: `features/newsletter/actions.ts`.

```ts
// features/newsletter/actions.ts
"use server";
import { SubscribeSchema } from "@/features/newsletter/schemas";
import * as service from "@/features/newsletter/service";
import { rateLimit } from "@/lib/rate-limit";
import { emailKey, ipKey } from "@/lib/rate-limit-keys";

export type NewsletterFormState = { ok?: boolean; error?: string; message?: string };

export async function subscribeNewsletterAction(
  _prev: NewsletterFormState | null,
  formData: FormData,
): Promise<NewsletterFormState> {
  const parsed = SubscribeSchema.safeParse({
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    consent: formData.get("consent"),
  });
  if (!parsed.success) return { error: "Datos inválidos." };

  const ip = getClientIp(await headers());
  const rl = await rateLimit(ipKey("newsletter", ip), 5, 3600);
  if (!rl.allowed) return { error: "Demasiados intentos. Intenta más tarde." };

  await service.subscribeNewsletter(parsed.data /* ... */);
  return { ok: true, message: "¡Listo! Revisa tu correo." };
}
```

### API routes — convención

- Validar con Zod en el límite.
- CORS aplicado por `proxy.ts` (allowlist de orígenes en `/api/*`).
- Devuelve siempre JSON, content-type correcto.
- En errores: `application/problem+json` (RFC 7807) vía `problemResponse(err, requestId)` de `lib/errors.ts`.
- Rate limit explícito si es público (`lib/rate-limit.ts`, con keys de `lib/rate-limit-keys.ts`).
- **Webhooks: verificación de firma/secreto antes de procesar, fail-closed en producción.** Wompi: firma de eventos (sha256 de propiedades + timestamp + `WOMPI_EVENTS_SECRET`) + ventana de timestamp (~25 h, cubre los reintentos legítimos). Resend: firma `svix-signature` (HMAC sobre `svix-id.svix-timestamp.rawBody` con `RESEND_WEBHOOK_SECRET`). Aveonline: secreto compartido por header `x-aveonline-secret` o `payload.token`; la vía `?secret=` por query-string está **deshabilitada por defecto** (`AVEONLINE_ALLOW_QUERY_SECRET=true` solo durante la transición — el secreto en URL viaja en logs de infraestructura, D-1).

---

## Backend — formato estándar de errores (RFC 7807)

> Verificado contra [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) a 2026-05-09.

### Schema base

```ts
// lib/errors.ts
export type ProblemDetails = {
  type: string; // URI identificador del tipo: https://lucamsshop.com/problems/<slug>
  title: string; // Título legible corto
  status: number; // Código HTTP
  detail?: string; // Detalle específico de esta ocurrencia (sin PII)
  instance?: string; // URI de esta ocurrencia (puede incluir requestId)
  requestId?: string; // Extension propia para correlación
  errors?: Record<string, string[]>; // Para validation errors (extensión típica)
};
```

El patrón implementado: la capa de servicio lanza subclases de `AppError` (`ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `UnprocessableError`, `TooManyRequestsError`, `InternalError`) sin saber de HTTP; la capa HTTP las convierte con `problemResponse`:

```ts
// lib/errors.ts (forma real)
export class AppError extends Error {
  constructor(
    public readonly slug: ProblemSlug,
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: Record<string, string[]>,
  ) { /* ... */ }
  toProblem(requestId?: string): ProblemDetails { /* ... */ }
}

export class ValidationError extends AppError {
  constructor(zodErr: z.ZodError) {
    const flat = z.flattenError(zodErr);
    super("validation", 400, "Datos de entrada inválidos", "...", flat.fieldErrors as ...);
  }
}

export function problemResponse(err: AppError | ProblemDetails, requestId?: string): Response {
  // Content-Type: application/problem+json + header X-Request-Id
}
```

### Catálogo de tipos `https://lucamsshop.com/problems/<slug>`

> Los URIs serán dereferenceables cuando se cree `app/(legal)/problems/[slug]/page.tsx` (**pendiente** — ver comentario en `lib/errors.ts`). Los slugs implementados hoy (`ProblemSlug` en `lib/errors.ts`):

| Slug                | Status | Cuándo                                    |
| ------------------- | ------ | ----------------------------------------- |
| `validation`        | 400    | Body no pasa Zod                          |
| `unauthorized`      | 401    | No autenticado                            |
| `forbidden`         | 403    | Autenticado pero sin permiso              |
| `not-found`         | 404    | Recurso inexistente                       |
| `conflict`          | 409    | Idempotency conflict, stock agotado, etc. |
| `unprocessable`     | 422    | Estado inválido para la operación         |
| `too-many-requests` | 429    | Rate limit                                |
| `internal-error`    | 500    | Catch-all (con requestId)                 |

> Los webhooks con firma inválida responden 401 genérico sin ProblemDetails (no revelar detalles al atacante) — ver `app/api/webhooks/*/route.ts`.

---

## Backend — capa de servicio

### Estructura

```
features/orders/
├── service.ts            # Lógica de dominio + acceso a DB (Prisma vía @/lib/db).
├── actions.ts            # Server Actions ('use server'). Delgada: valida → llama service.
├── schemas.ts            # Zod schemas
├── saga.ts               # Orquestación post-PAID (ver § Saga pattern)
├── stock.ts · emails.ts · errors.ts   # Submódulos de la feature
└── *.test.ts             # Tests al lado del archivo
```

### Reglas

- **`service.ts`** concentra la lógica de dominio y el acceso a DB con el cliente `prisma` de `@/lib/db`. No importa `next/*` salvo en casos justificados (p.ej. `unstable_cache`). Si una feature crece, se subdivide en submódulos (`stock.ts`, `emails.ts`, `cod-reconciliation.ts`).
- **No hay capa `repository.ts` separada**: la indirección no se justificó a esta escala; Prisma solo se importa en `service.ts` de features y en `lib/*` de infra (nunca en components ni pages).
- **`actions.ts`** es delgado: valida con Zod → rate limit si es público → llama service → devuelve state tipado o `redirect()`.
- **Tests:** `service.test.ts` unitarios con Prisma mockeado; `service.integration.test.ts` contra Supabase local (corren en nightly).

### Ejemplo

```ts
// features/checkout/service.ts (forma real)
import { prisma } from "@/lib/db";

export async function createOrderFromCart(cartId: string, payload: CheckoutPayload) {
  return await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { id: cartId }, include: { items: true } });
    if (!cart) throw new NotFoundError("cart");

    // Idempotencia cart→order (P0-020): si el cart ya tiene una Order
    // PENDING_PAYMENT activa, se retorna esa en vez de crear otra.
    const existing = await tx.order.findFirst({
      where: { cartId, status: "PENDING_PAYMENT", deletedAt: null },
    });
    if (existing) return { orderId: existing.id, reused: true };

    const order = await tx.order.create({ data: { /* ... */ cartId } });
    return { orderId: order.id, reused: false };
  });
}
```

---

## Backend — saga pattern para flujos distribuidos

> El flujo `Wompi APPROVED → descontar stock → crear guía Aveonline → enviar email` toca tres sistemas externos. Si falla a la mitad, no podemos dejar la base inconsistente.

### Estrategia: orquestador con pasos idempotentes y compensación explícita

La saga real es `processPaidOrder` en `features/orders/saga.ts`, disparada por el webhook de Wompi (y reintentable desde `/admin/pedidos/[id]`). En vez de un motor genérico de compensaciones, cada paso es **idempotente por diseño** y las compensaciones son decisiones explícitas de negocio:

1. `transitionOrder(orderId, "PAID")` + guardar `wompiTransactionId`. Si ya está PAID → no-op.
2. `decrementStockForOrder` — ledger `InventoryLog` con índice parcial único `(orderId, reason, variantId)`: el mismo decremento no se aplica dos veces ni bajo carrera. Si el stock se agotó en el gap PENDING→PAID, la orden queda `PENDING_PAYMENT` + `needsReconciliation=true` (visible en admin) — ACCIÓN HUMANA: refund o producir stock.
3. `createShipment` (Aveonline) protegido por **claim atómico** `shipmentClaimedAt` (`updateMany` condicional `WHERE trackingNumber null AND (claim null OR stale)`) — imposible crear dos guías para la misma orden. Si la guía falla, la orden **queda PAID** (no se revierte el pago) y el admin reintenta manualmente; el claim se libera y expira a los 10 min.
4. Emails transaccionales inline con sellos idempotentes: `confirmationSentAt` se setea al enviar la confirmación — si la saga crashea entre el commit de PAID y el envío, un reintento la manda sin duplicar (`sendOrderConfirmationOnce` en `features/orders/emails.ts`).

### Compensaciones

- **Stock:** revert solo al transicionar a `CANCELLED`/`REFUNDED` y solo si existe `InventoryLog` con `reason=ORDER_PAID` para la orden (la verdad la marca el ledger, no el estado origen).
- **Guía Aveonline:** no hay `cancelShipment` automático — el fallo deja la orden PAID con alerta; la resolución es manual.
- **Emails:** no se compensan; el consumer con retry es el propio reintento de la saga (los sellos `confirmationSentAt`/`reviewRequestedAt` evitan duplicados).

### Cuándo NO usar saga

- Operaciones puramente locales (una transacción de Postgres alcanza).
- Operaciones idempotentes sin orden estricto (eg. enviar 3 emails distintos).

### Observabilidad de sagas

- Cada paso loggea evento estructurado (`order.paid`, `order.shipment_created`, etc.) con `orderId` y `requestId` — no hay tabla `SagaLog`; el rastro forense son los logs + `AdminActionLog` + los timestamps de la propia `Order`.
- Fallos técnicos se capturan en `ErrorLog` (`lib/error-capture.ts`, PII scrubbed) y disparan alerta al centro de notificaciones del admin.

---

## Backend — idempotencia

> Mandato para mutaciones críticas: el cliente (o el proveedor, en webhooks) puede reintentar sin duplicar.

No hay una infraestructura genérica de `Idempotency-Key` headers ni tabla `idempotency_keys`: la idempotencia se construye **por flujo**, con anclas en la base de datos. Mecanismos vigentes:

| Flujo                               | Mecanismo                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhooks Wompi / Aveonline / Resend | `WebhookEvent @@unique([source, externalId])` — dedup físico ante reintentos (P2002 = ya procesado)                                                         |
| Dedup Wompi                         | `externalId = txId-status-timestamp` (el timestamp va firmado: forjarlo rompe la firma; cubre los reintentos a 30 min / 3 h / 24 h)                         |
| Dedup Aveonline                     | `externalId = guia-status-timestamp`; si el payload no trae fecha del carrier, clave estable `"no-ts"` (D-4 — sin ella cada reintento re-procesaría)        |
| Webhook Resend                      | `upsert` last-write-wins sobre `EmailEvent`, protegiendo `email.bounced`/`email.complained` de eventos reordenados (D-2 — la supresión no se pisa)          |
| Checkout (cart → order)             | `Order.cartId` (P0-020): si el cart ya tiene Order `PENDING_PAYMENT` activa se retorna esa — doble click en "Pagar" no crea dos órdenes                     |
| Email de confirmación               | `Order.confirmationSentAt` — sello que hace el envío idempotente y recuperable tras crash                                                                   |
| Creación de guía                    | `Order.shipmentClaimedAt` — claim atómico por `updateMany` condicional (stale tras 10 min)                                                                  |
| Ledger de inventario                | Índice parcial único `InventoryLog(orderId, reason, variantId)` — no se descuenta/revierte el mismo variant 2× por orden                                    |
| Cupón por cliente                   | Trigger `coupon_usage_per_customer_limit` con `pg_advisory_xact_lock` por (couponId, identidad) — dos checkouts concurrentes no pasan ambos el conteo (G-5) |
| Transiciones de estado              | `transitionOrder` trata transición al mismo estado como no-op                                                                                               |

### Reglas

- **Toda mutación reintentable necesita un ancla de idempotencia en DB** (columna única, sello timestamp o claim) — la deduplicación solo en memoria no sobrevive al serverless.
- El reintento con la misma clave y el mismo efecto es **no-op silencioso**; la misma clave con efecto distinto es `409 conflict`.
- Los sellos se escriben **en la misma transacción** del efecto cuando es posible (`confirmationSentAt` al enviar, `shipmentClaimedAt` antes de llamar a Aveonline).

---

## DB — naming SQL

| Elemento                                             | Convención                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Tablas creadas por Prisma                            | `PascalCase` (lo que Prisma genera por defecto) — preservar      |
| Tablas creadas por SQL nativo (migrations no-Prisma) | `snake_case` plural                                              |
| Columnas Prisma                                      | `camelCase`                                                      |
| Columnas SQL nativas                                 | `snake_case`                                                     |
| Índices                                              | `<table>_<columns>_idx`                                          |
| Foreign keys                                         | `<from_table>_<column>_fkey`                                     |
| Constraints check                                    | `<table>_<column>_check`                                         |
| Funciones                                            | `snake_case` con namespace si aplica (`public.rate_limit_check`) |
| Triggers                                             | `<table>_<event>_<action>`                                       |

> Mezcla intencional: las tablas de modelo de dominio (gestionadas por Prisma) usan PascalCase. Las tablas auxiliares de infra (rate limit) usan snake_case porque las creamos manualmente con SQL.

---

## DB — migration strategy (expand-then-contract)

> Toda migración debe poder aplicarse y revertirse sin tirar el sitio. Nunca un cambio destructivo en una sola release.

### Patrón

1. **Expand:** agregar nueva columna/tabla/índice (nullable o con default). Deploy. La app sigue funcionando con el esquema viejo y el nuevo.
2. **Migrate:** backfill de datos. Idealmente en un script one-off (`packages/db/scripts/`) o un job `pg_cron` para no bloquear.
3. **Cutover:** la app empieza a usar la nueva forma. Deploy.
4. **Contract:** eliminar la forma vieja en una release posterior (días/semanas después). Deploy.

### Ejemplo: renombrar `Customer.fullName` → `Customer.firstName + lastName`

| Release       | Acción                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| R1 (expand)   | Agregar `firstName`, `lastName` como nullables. Trigger que sincroniza `fullName ↔ firstName/lastName`. |
| R2 (backfill) | Job que llena `firstName`/`lastName` desde `fullName` para registros viejos.                            |
| R3 (cutover)  | App lee/escribe `firstName`/`lastName` directo. Trigger sigue por seguridad.                            |
| R4 (contract) | Eliminar `fullName`, eliminar trigger.                                                                  |

### Reglas

- **Nunca `DROP COLUMN`/`DROP TABLE`** en la misma release que cambia la app.
- **Nunca `ALTER COLUMN ... NOT NULL`** sin backfill previo.
- **Renombrar:** crear nueva, copiar, deprecar vieja, eliminar después.
- **Foreign keys nuevas:** `NOT VALID` primero, luego `VALIDATE CONSTRAINT` para no bloquear escrituras. Mismo patrón para CHECK constraints SQL-only (precedente: `20260904144657_money_stock_nonnegative_checks`, F-24).
- **Índices grandes:** `CREATE INDEX CONCURRENTLY` (Postgres lo soporta).

### Archivos

- **Schema de dominio (Prisma):** `packages/db/prisma/migrations/YYYYMMDDHHMMSS_<slug>/migration.sql` — generadas con `pnpm --filter @lucams/db db:migrate` / aplicadas con `db:migrate:deploy` en el deploy.
- **SQL no-Prisma (RLS, grants, storage, funciones, pg_cron):** `supabase/migrations/000000000000NN_<slug>.sql` — correlativo de 14 dígitos, orden cronológico.
- Las migraciones de `supabase/migrations/` son **idempotentes** (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `unschedule` → `schedule`, guardas si la extensión no está instalada) — re-ejecutables sin error en cualquier ambiente.
- Un archivo separado de "down migration" si la operación es reversible.

---

## DB — indexing strategy

### Principios

1. **Cubre los WHERE más frecuentes.** Mira `pg_stat_statements` antes de adivinar.
2. **Compuesto cuando hay AND típico.** `(customerId, createdAt DESC)` para "mis órdenes recientes".
3. **Cubre joins.** Las foreign keys necesitan índice del lado del FK (no automático en Postgres).
4. **Parcial cuando hay filtro fijo.** `WHERE isActive = TRUE` para `Product`.
5. **Concurrentemente en producción.** `CREATE INDEX CONCURRENTLY` no bloquea escrituras.

### Índices vigentes (muestra representativa)

Los índices de tablas Prisma viven como `@@index` en `schema.prisma`; los que Prisma no puede expresar (parciales, trigram) viven en migraciones SQL:

```sql
-- Búsqueda fuzzy de productos con pg_trgm (supabase/migrations/00000000000031)
CREATE INDEX CONCURRENTLY IF NOT EXISTS product_search_name_trgm_idx
  ON "Product" USING GIN ((public.immutable_unaccent(lower("name"))) gin_trgm_ops);
-- (también description y richDescription con la MISMA expresión textual que
-- usan las queries de apps/web/lib/catalog.ts — el planner exige match
-- estructural. Los índices originales de la 00000000000005 no matcheaban los
-- predicados reales y fueron dropeados en la 00000000000031 — F-13.)
```

```prisma
// schema.prisma — ejemplos reales
@@index([customerId, deletedAt])          // Order: "mis pedidos" sin soft-deleted
@@index([status, createdAt])              // Order: pendientes para reconciliación
@@index([cartId, status])                 // Order: idempotencia cart→order (P0-020)
@@index([isActive, isFeatured])           // Product: home/destacados
@@index([productId, isApproved, deletedAt]) // Review: visibles por producto
```

- **Índice parcial único** (idempotencia del ledger de inventario): `UNIQUE (orderId, reason, variantId) WHERE reason IN ('ORDER_PAID','ORDER_CANCELLED','ORDER_REFUNDED')` — migración `20260626224910_fix_inventory_log_unique_per_variant` (Prisma no soporta `@@unique` condicional; está documentado inline en el modelo `InventoryLog`).

### Antipatrones a evitar

- **Index sobre columna baja cardinalidad** (`isActive` solo, sin combinarse): inútil. Usar índice parcial.
- **Demasiados índices en tabla con muchas escrituras** (`InventoryLog`, `WebhookEvent`): cada índice ralentiza inserts.
- **Índice sin EXPLAIN ANALYZE** que demuestre que se usa.

---

## DB — soft delete + audit fields

### Soft delete

- **Columnas estándar** en entidades que requieren histórico:
  - `deletedAt: DateTime?` (soft delete con timestamp).
  - **No** usar `isActive: Boolean` cuando hay borrado real (`deletedAt` es más expresivo). `isActive` solo para "publicado/no publicado" semántico.
- **Vista o filtro** `WHERE "deletedAt" IS NULL` por defecto en los services.
- **Cuenta borrada = anonimizar + soft-delete** (no borrado físico — preserva el histórico de órdenes sin PII): `features/account/delete-service.ts` nulea nombre/teléfono/documento, placeholder en email/supabaseUserId, scrub de `Address`, y borra el usuario de Supabase Auth.

### Audit fields

Toda entidad mutable de dominio incluye:

```prisma
model SomeEntity {
  id          String    @id @default(cuid())
  // ... campos del dominio ...
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  createdBy   String?   // userId del Customer o AdminUser que la creó
  updatedBy   String?   // userId que la modificó por última vez
  deletedAt   DateTime?
  deletedBy   String?
}
```

- `createdBy/updatedBy` se pasan desde la Server Action (que conoce el actor) al service, que los persiste al crear/actualizar (p.ej. `createProduct(input, createdBy)`).
- `deletedAt/deletedBy` se llenan en el soft-delete del service correspondiente.
- Para entidades del cliente final (`Order`, `Cart`, `Review`): `createdBy = customerId`. Para admin: `adminUserId`.

---

## DB — foreign keys cascade explícito

| Relación                                    | `ON DELETE` | Razón                                                                                          |
| ------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `OrderItem.orderId` → `Order`               | `CASCADE`   | Si se borra una orden (caso raro), sus items también                                           |
| `CartItem.cartId` → `Cart`                  | `CASCADE`   | Idem                                                                                           |
| `Address.customerId` → `Customer`           | `CASCADE`   | Si el cliente se borra, sus direcciones también                                                |
| `Order.customerId` → `Customer`             | `SET NULL`  | Preservar histórico de ventas aunque el cliente se borre (PII removida pero analítica intacta) |
| `Review.customerId` → `Customer`            | `SET NULL`  | Idem                                                                                           |
| `InventoryLog.variantId` → `ProductVariant` | `RESTRICT`  | Nunca permitir borrar un variant que tiene historial                                           |
| `OrderItem.variantId` → `ProductVariant`    | `RESTRICT`  | Idem                                                                                           |
| `LoyaltyTxn.customerId` → `Customer`        | `SET NULL`  | Preservar histórico contable                                                                   |

> **Default que NO usamos:** Prisma no fuerza `ON DELETE CASCADE` por defecto (`Restrict`). Toda relación debe declarar explícitamente con `onDelete: Cascade | SetNull | Restrict`.

```prisma
model OrderItem {
  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
}
```

---

## DB — retention y archival

Implementado hoy (cron `/api/cron/purge-event-logs` diario 03:00 y `/api/cron/purge-anon-designs` 08:00, más los cleanups SQL puros de la migración `00000000000012`):

| Datos                                     | Retención             | Mecanismo                                                                                                            |
| ----------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `EmailEvent` (contiene email del cliente) | 180 días              | `purgeExpiredEventLogs` (`features/observability/event-log-retention.ts`) — Ley 1581 minimización                    |
| `WebhookEvent` (payload crudo con PII)    | 180 días              | Ídem                                                                                                                 |
| `ErrorLog` / `ErrorReport`                | 90 días               | Ídem (F-6, auditoría 2026-08-24; `ErrorReport` se purga por `lastSeenAt`: un error que sigue ocurriendo NO se borra) |
| `Design` anónimo abandonado               | 30 días               | `purgeAbandonedAnonymousDesigns` (`features/personalization/retention-service.ts`)                                   |
| `Quote` cerrada                           | 90 días de gracia     | Ídem (`PURGE_AFTER_QUOTE_CLOSED_DAYS`)                                                                               |
| `Quote` abierta sin movimiento            | 365 días              | Ídem (`PURGE_STALE_QUOTE_AFTER_DAYS`)                                                                                |
| `rate_limit_buckets`                      | 1 día tras la ventana | `rate_limit_cleanup` (pg_cron, SQL puro)                                                                             |
| `StockReservation` expiradas              | Inmediato             | `stock_reservation_cleanup` (pg_cron, SQL puro) — sin consumidores hoy (ADR-014 diferida)                            |
| `Customer` borrado (PII)                  | Inmediato             | Anonimización + soft-delete al solicitar la baja (`features/account/delete-service.ts`)                              |
| Logs Vercel                               | Lo que cubre el plan  | Sin acción (Vercel maneja)                                                                                           |

> **Política no implementada todavía** (sin cron ni script): archivo de `Order` (5 años, obligación legal) y de `AdminActionLog` (2 años) a storage frío, y particionado de `InventoryLog` si crece. Cuando se implemente, actualizar esta tabla con el mecanismo real.

---

## Resiliencia — timeouts, retries, circuit breakers

### Timeouts (mandato: nunca un fetch sin timeout)

```ts
// lib/fetch-with-timeout.ts
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 5000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

| Llamada                           | Timeout                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Wompi `GET /v1/transactions/<id>` | 5 s (con retry + circuit breaker; solo hay consulta GET — el pago es redirect al checkout hosted) |
| Aveonline quote (cotizarDoble)    | 15 s (multi-carrier lento: medido 7–11 s; retry 2×; ADR-053)                                      |
| Aveonline create shipment         | 20 s (endpoint lento + no-reintentable; ADR-048)                                                  |
| Gemini `generateContent`          | 12 s (por modelo; fallback a modelo secundario si falla — `features/ai/gemini-provider.ts`)       |
| Resend `/emails`                  | 15 s (`RESEND_TIMEOUT_MS` en `lib/resend.ts`)                                                     |

### Retries con backoff exponencial

```ts
// lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; maxMs?: number } = {},
): Promise<T> {
  const { attempts = 3, baseMs = 200, maxMs = 5000 } = opts;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      if (!isRetryable(err)) throw err; // 4xx no se reintenta
      const delay = Math.min(baseMs * 2 ** i + Math.random() * 100, maxMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}
```

`isRetryable`: 5xx, network errors, timeouts. **NO 4xx** (excepto 408, 429).

### Circuit breakers

Para llamadas críticas (Wompi, Aveonline):

```ts
// lib/circuit-breaker.ts (simplificado)
class CircuitBreaker {
  private failures = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private lastFailureAt = 0;

  constructor(private opts: { name: string; threshold: number; resetMs: number }) {}

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureAt > this.opts.resetMs) {
        this.state = "half-open";
      } else {
        throw new CircuitOpenError(this.opts.name);
      }
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.state = "closed";
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailureAt = Date.now();
      if (this.failures >= this.opts.threshold) this.state = "open";
      throw err;
    }
  }
}

// Uso real: `wompiCB` en lib/wompi.ts y `aveonlineCB`/`aveonlineQuoteCB` en
// features/shipping/aveonline.ts — todos { threshold: 5, resetMs: 30_000 }.
// El retry va por FUERA del breaker (withRetry(() => cb.exec(fetch))) para que
// cada intento cuente y, abierto, corte de una.
```

> **Nota:** el estado del circuit breaker en serverless es per-instancia. Para coordinación global se necesitaría Redis o Postgres. Para nuestra escala, per-instancia es suficiente al inicio.

---

## Logging y request ID correlation

### Request ID

Cada request entrante recibe un `requestId` (UUID v4) generado en **`proxy.ts`** (Next 16 renombró `middleware.ts` → `proxy.ts`, ADR-024). Se propaga:

- Header de respuesta `X-Request-Id` (correlación cliente ↔ logs de plataforma; el proxy no lo inyecta en los request headers aguas abajo).
- Los errores capturados con `captureServerError` (`lib/error-capture.ts`) persisten `routePath`/`routeType` (p.ej. `/api/cron/purge-event-logs`, `cron`) para correlación.

### Logger

`lib/logger.ts` es un logger JSON estructurado sobre `console.log` nativo (**no pino**: pino + Turbopack de Next 16 rompe `next build`; la API pública es compatible: `info` / `warn` / `error` / `debug`). Salida JSON una-línea-por-evento a stdout/stderr — Vercel la parsea automático. Nivel por `LOG_LEVEL` (default `debug` en dev, `info` en prod).

Redacción automática:

- **Por key name** (case-insensitive): `password`, `token`, `secret`, `key`, `cookie`, `authorization`, `email`, `phone`, `document` → valor reemplazado por `[REDACTED]`.
- **Por path absoluto:** `req.headers.authorization`, `req.headers.cookie`.
- **`scrubPii(text)`** para texto libre (mensajes de error, stacks) antes de persistir en `ErrorLog`/`ErrorReport` — un error de DB puede traer PII embebida (F-6).

Uso:

```ts
logger.info({ event: "order.created", orderId, customerId });
```

> **Nunca** `logger.info('User ' + email + ' did X')`. Usar siempre objeto estructurado con campos: `logger.info({ event, userId })`.

---

## Code style

- **Prettier** (`pnpm format` / `format:check`, gate `format-check` en CI) + **ESLint** flat config (`eslint-config-next` core-web-vitals + typescript, más `no-restricted-imports` para sharp — F-4). Pre-commit hook versionado en `scripts/git-hooks/pre-commit` = scan de secretos con **gitleaks** (activar una vez por clone: `git config core.hooksPath scripts/git-hooks`); la capa forzosa es GitHub Push Protection + el job `secrets-scan` de CI.
- **TypeScript estricto:** `"strict": true` en `apps/web/tsconfig.json`.
- **No usar `any`.** Si no hay tipo, usar `unknown` y narrow.
- **Archivos < 400 líneas** (split en submódulos si crece).
- **Funciones < 50 líneas** salvo casos justificados (saga orchestrators, etc.).
- **Comentarios solo cuando el WHY no es obvio.** Ver mandato de CLAUDE.md.
- **Tests al lado del archivo:** `service.ts` + `service.test.ts` en la misma carpeta (integración: `service.integration.test.ts`, corren contra Supabase real en nightly).

---

## CMS — agregar un campo de contenido administrable

El contenido visible del storefront NO va hardcodeado: vive en el CMS v2 (ver
`docs/ARCHITECTURE.md` § CMS v2) y se edita desde `/admin/contenido`. Flujo para un campo nuevo:

1. **Declararlo en el site map** (`packages/db/scripts/cms-site-map.mjs`): en la sección de la
   página que corresponda, con `key` única (convención `pagina.seccion.nombre`, o `SCREAMING_SNAKE`
   para ajustes globales), `kind` (BLOCK si tiene flujo borrador→publicar · SETTING si aplica al
   guardar), `type`, `label` y `helpText` pensados para una persona no técnica, y `body` =
   **el texto exacto que hoy está hardcodeado** (el fallback).
2. **Aplicarlo:** `make migrate-cms-v2` (idempotente; crea el campo publicado con v1 si no existe,
   nunca pisa ediciones). En producción se aplica en el deploy como cualquier script de contenido.
3. **Consumirlo** con la API de `apps/web/lib/cms.ts` conservando el fallback hardcoded:
   - JSX: `<CmsText blockKey="home.ejemplo" fallback="Texto actual" />` (o `CmsMarkdown`).
   - Server: `getSettingValue("MI_SETTING", "valor actual")`, `getCmsList(key, validate, fallback)`
     para listas (B4), `getCmsImage(key)` para imágenes (B5), `getCmsBanners(key)` para banners (B6).
4. **Invalidar el caché:** las ediciones desde el admin invalidan solas (`updateTag("cms")`); tras
   correr scripts que escriben directo en DB, botón «Actualizar caché de contenido» en
   `/admin/contenido` (runbook: `docs/OPERATIONS.md`).

Reglas asociadas:

- **Regla de oro:** todo fallback es el texto exacto pre-CMS — si la DB cae, el sitio se ve igual.
- **Ratchet de cobertura (D1):** CI falla si aparece un literal nuevo en español en el JSX del
  storefront fuera del CMS. Si el hardcode es legítimo (dato de diseño, copy de infraestructura),
  regenerar el baseline: `pnpm --filter @lucams/db exec node scripts/audit-content-coverage.mjs
--write-baseline` y commitearlo en el mismo PR, con la justificación en el mensaje del commit.
- **Campos lista** (B4): declarar `metadata.listSchema` en el site map (subcampos TEXT/URL/
  TEXTAREA/BOOLEAN/IMAGE); el admin los edita como filas y el body público sigue siendo el JSON
  serializado — la lectura no cambia.
- **Imágenes** (B5): `type: IMAGE` guarda el `CmsMedia.id`; el admin sube al bucket `cms-media`
  desde el editor del campo o la mediateca. `alt` siempre obligatorio (WCAG 1.1.1).
- **Publicación programada** (C3): cualquier versión borrador puede programarse con «Programar»
  en el editor del campo (hora de Colombia); la publica el cron `lucams-cms-publish-scheduled`.
