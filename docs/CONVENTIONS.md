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
11. [Backend — idempotency keys](#backend--idempotency-keys)
12. [DB — naming SQL](#db--naming-sql)
13. [DB — migration strategy (expand-then-contract)](#db--migration-strategy-expand-then-contract)
14. [DB — indexing strategy](#db--indexing-strategy)
15. [DB — soft delete + audit fields](#db--soft-delete--audit-fields)
16. [DB — foreign keys cascade explícito](#db--foreign-keys-cascade-explícito)
17. [DB — retention y archival](#db--retention-y-archival)
18. [Resiliencia — timeouts, retries, circuit breakers](#resiliencia--timeouts-retries-circuit-breakers)
19. [Logging y request ID correlation](#logging-y-request-id-correlation)
20. [Code style](#code-style)

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

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos TS/TSX | `kebab-case.tsx` o nombre del componente PascalCase | `product-card.tsx`, `ProductCard.tsx` (mantener una convención por carpeta) |
| Componentes React | `PascalCase` | `ProductCard`, `CheckoutStepper` |
| Hooks | `useXxx` camelCase | `useCart`, `useDebounce` |
| Funciones / variables | `camelCase` | `formatCOP`, `currentUser` |
| Constantes globales | `SCREAMING_SNAKE_CASE` | `MAX_UPLOAD_BYTES`, `WA_NUMBER` |
| Tipos / Interfaces | `PascalCase` (sin prefijo `I`) | `Order`, `CheckoutPayload` |
| Enums | `PascalCase` con valores `SCREAMING_SNAKE_CASE` | `OrderStatus.PENDING_PAYMENT` |
| Tablas Prisma (modelos) | `PascalCase` singular | `Customer`, `OrderItem` |
| Columnas Prisma | `camelCase` | `firstName`, `createdAt` |
| Tablas SQL nativas (no-Prisma) | `snake_case` plural | `rate_limit_buckets`, `cache_entries` |
| Funciones SQL | `snake_case` con prefijo | `rate_limit_increment` |
| Variables de entorno | `SCREAMING_SNAKE_CASE` con prefijo `NEXT_PUBLIC_` solo si visible en cliente | `WOMPI_PRIVATE_KEY`, `NEXT_PUBLIC_SITE_URL` |
| Slugs (URLs) | `kebab-case` | `/categoria/dia-de-la-madre` |
| Branches Git | `tipo/descripcion-corta` | `feat/checkout-multi-step`, `fix/wompi-webhook-replay` |
| Commits | Conventional Commits | `feat(checkout): add COD as payment method` |
| Tags Git | `v<semver>` | `v0.3.1` |
| Imports absolutos | `@/...` apuntando a `apps/web/` | `import { cn } from '@/lib/utils'` |

---

## Estructura de carpetas detallada

```
apps/web/
├── app/
│   ├── (storefront)/                    # Group route público
│   │   ├── layout.tsx                   # Header/Footer/WhatsApp FAB
│   │   ├── page.tsx                     # Home
│   │   ├── catalogo/
│   │   ├── producto/[slug]/
│   │   └── ...
│   ├── (admin)/                         # Group route protegido por middleware
│   │   ├── layout.tsx
│   │   └── admin/
│   │       └── ...
│   ├── api/                             # Solo endpoints REST
│   │   ├── wompi/webhook/
│   │   ├── venndelo/webhook/
│   │   ├── checkout/create/
│   │   └── ...
│   ├── error.tsx                        # Error boundary global
│   ├── not-found.tsx                    # 404 con mascota
│   └── global-error.tsx                 # Catch-all (root)
├── components/
│   ├── ui/                              # shadcn/ui generado
│   ├── storefront/                      # Componentes del storefront
│   │   ├── product-card.tsx
│   │   ├── cart-drawer.tsx
│   │   └── ...
│   ├── studio/                          # Editor react-konva
│   ├── preview3d/                       # Three.js
│   └── admin/
├── features/                            # Feature folders (lógica + UI por feature)
│   ├── checkout/
│   │   ├── server-actions.ts
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── schemas.ts                   # Zod schemas
│   │   └── service.ts                   # Lógica de dominio
│   ├── cart/
│   ├── personalization/
│   └── ...
├── lib/                                 # Utilidades cross-feature
│   ├── supabase/
│   ├── payment/                         # Adaptador PaymentProvider
│   ├── venndelo.ts
│   ├── whatsapp.ts
│   ├── ai.ts
│   ├── cart.ts                          # Zustand store
│   ├── i18n.ts
│   ├── format.ts
│   ├── rate-limit.ts                    # Postgres-based (ADR-016)
│   ├── cache.ts                         # Postgres-based (ADR-016)
│   ├── queue.ts                         # pgmq enqueue helpers (ADR-017)
│   ├── errors.ts                        # ProblemDetails helpers (RFC 7807)
│   ├── logger.ts                        # Pino con redact PII
│   ├── request-id.ts                    # Generación + propagación
│   ├── csrf.ts
│   ├── idempotency.ts
│   ├── circuit-breaker.ts
│   └── validation/                      # Schemas Zod cross-feature
├── messages/                            # i18n
├── middleware.ts                        # Auth + CORS + headers + request ID
└── ...
```

> **Regla:** lógica que pertenece a una feature vive en `features/<feature>/`. Solo lo verdaderamente compartido va a `lib/`. Esto evita el "dios `lib/` con 200 archivos".

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
// app/(storefront)/producto/[slug]/page.tsx — Server Component
export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getProductBySlug(params.slug);  // Server-side fetch
  if (!product) notFound();
  return (
    <article>
      <ProductGallery images={product.images} />        {/* Server */}
      <ProductInfo product={product} />                 {/* Server */}
      <AddToCartButton variantId={product.variants[0].id} />  {/* Client island */}
    </article>
  );
}
```

```tsx
// components/storefront/add-to-cart-button.tsx
'use client';
export function AddToCartButton({ variantId }: { variantId: string }) {
  const addItem = useCart(s => s.addItem);
  return <Button onClick={() => addItem(variantId)}>Agregar al carrito</Button>;
}
```

### Datos: cuándo `fetch` vs Server Action vs API route

| Escenario | Patrón |
|---|---|
| Lectura inicial en SSR/RSC | Server Component con `await fetch()` o Prisma directo |
| Mutación de cliente (form submit, button click) | **Server Action** (preferido) |
| Mutación llamada por terceros (webhooks) | **API route** (`app/api/.../route.ts`) |
| Lectura desde cliente (búsqueda, autocomplete) | Server Action si autenticado, API route con rate limit si público |
| Streaming de IA | API route con Edge runtime |

### Hidratación selectiva

Imágenes pesadas no entran en client bundle: usar `next/image` con `priority` solo en LCP.

---

## Frontend — formularios y validación

### Stack

- **react-hook-form** para state del form.
- **Zod** para schemas, compartidos entre cliente (UX inmediata) y servidor (validación final).
- **`@hookform/resolvers/zod`** como puente.

### Patrón

```tsx
// features/checkout/components/checkout-form.tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckoutPayloadSchema, CheckoutPayload } from '../schemas';
import { createOrder } from '../server-actions';

export function CheckoutForm() {
  const form = useForm<CheckoutPayload>({
    resolver: zodResolver(CheckoutPayloadSchema),
    defaultValues: { paymentMethod: 'WOMPI' },
    mode: 'onBlur',  // Valida en blur, no en cada keystroke (mejor UX)
  });

  async function onSubmit(values: CheckoutPayload) {
    const result = await createOrder(values);
    if (!result.ok) {
      // Mapear errores de servidor a campos del form si aplica
      if (result.problem.type === 'https://lucamsshop.co/problems/invalid-coupon') {
        form.setError('couponCode', { message: result.problem.detail });
      }
      return;
    }
    // redirect al pago
  }

  return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>;
}
```

### Reglas

- **`mode: 'onBlur'`** para campos normales; `'onChange'` solo en autocompletes y debounced search.
- **Errores accesibles:** `aria-invalid`, `aria-describedby` apuntando al mensaje.
- **No deshabilitar el botón "submit"** hasta que el usuario intentó submit la primera vez (deshabilitar antes oculta el motivo del error).
- **Server Action SIEMPRE re-valida con Zod**, no confía en lo que vino del cliente.
- **Mensajes en español:** centralizados en el schema Zod (no en el componente).

---

## Frontend — estados de UI (loading, error, empty)

### Mandato: cada vista tiene 4 estados explícitos

1. **Loading** — skeleton screen visible inmediatamente (no spinner ciego).
2. **Empty** — mascota mapache + copy guía ("¿Qué imán vamos a crear hoy?").
3. **Error** — mensaje claro + acción de recuperación + `requestId` visible si es 5xx.
4. **Success** — el contenido real.

### Patrón con Suspense + error boundaries

```tsx
// app/(storefront)/cuenta/ordenes/page.tsx
import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { OrderListSkeleton } from '@/components/skeletons/order-list-skeleton';
import { OrderList } from './order-list';

export default function OrdersPage() {
  return (
    <ErrorBoundary fallback={<OrderListError />}>
      <Suspense fallback={<OrderListSkeleton />}>
        <OrderList />
      </Suspense>
    </ErrorBoundary>
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

| Patrón | Usar para |
|---|---|
| **Server Action** | 90% de mutaciones desde la UI (forms, botones de "marcar leído", etc.) |
| **API route** (`app/api/.../route.ts`) | Webhooks de terceros · endpoints públicos para mobile/integraciones · streaming · uploads |

### Server Actions — convención

- Una Server Action = una función exportada con `'use server'`.
- Vive en `features/<feature>/server-actions.ts`.
- **Nunca expone Prisma directo;** delega a `service.ts` de la feature.
- Devuelve `Result<T>` discriminado:

```ts
type Ok<T> = { ok: true; data: T };
type Err = { ok: false; problem: ProblemDetails };
type Result<T> = Ok<T> | Err;
```

```ts
// features/checkout/server-actions.ts
'use server';
import { CheckoutPayloadSchema, type CheckoutPayload } from './schemas';
import * as service from './service';
import { problemFromError, problem } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { getRequestId } from '@/lib/request-id';

export async function createOrder(input: CheckoutPayload): Promise<Result<{ orderId: string; redirectUrl?: string }>> {
  const requestId = getRequestId();
  const parsed = CheckoutPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problem: problem.validation(parsed.error, requestId) };

  const allowed = await rateLimit(`checkout:${parsed.data.email}`, 10, 600);
  if (!allowed) return { ok: false, problem: problem.tooManyRequests(requestId) };

  try {
    const result = await service.createOrder(parsed.data, requestId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, problem: problemFromError(err, requestId) };
  }
}
```

### API routes — convención

- Validar con Zod en el límite.
- CORS aplicado por middleware.
- Devuelve siempre JSON, content-type correcto.
- En errores: `application/problem+json` (RFC 7807).
- Rate limit explícito si es público.

---

## Backend — formato estándar de errores (RFC 7807)

> Verificado contra [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) a 2026-05-09.

### Schema base

```ts
// lib/errors.ts
export type ProblemDetails = {
  type: string;          // URI identificador del tipo: https://lucamsshop.co/problems/<slug>
  title: string;         // Título legible corto
  status: number;        // Código HTTP
  detail?: string;       // Detalle específico de esta ocurrencia (sin PII)
  instance?: string;     // URI de esta ocurrencia (puede incluir requestId)
  requestId?: string;    // Extension propia para correlación
  errors?: Record<string, string[]>;  // Para validation errors (extensión típica)
};

export const problem = {
  validation(zodErr: ZodError, requestId: string): ProblemDetails {
    return {
      type: 'https://lucamsshop.co/problems/validation',
      title: 'Datos de entrada inválidos',
      status: 400,
      detail: 'Uno o más campos no cumplen el formato requerido.',
      requestId,
      errors: zodErr.flatten().fieldErrors as Record<string, string[]>,
    };
  },
  notFound(resource: string, requestId: string): ProblemDetails {
    return {
      type: 'https://lucamsshop.co/problems/not-found',
      title: 'Recurso no encontrado',
      status: 404,
      detail: `No se encontró ${resource}.`,
      requestId,
    };
  },
  tooManyRequests(requestId: string): ProblemDetails {
    return {
      type: 'https://lucamsshop.co/problems/too-many-requests',
      title: 'Demasiadas solicitudes',
      status: 429,
      detail: 'Por favor espera unos momentos antes de reintentar.',
      requestId,
    };
  },
  // ...etc por dominio
};

export function problemResponse(p: ProblemDetails): Response {
  return new Response(JSON.stringify(p), {
    status: p.status,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Request-Id': p.requestId ?? '',
    },
  });
}
```

### Catálogo de tipos `https://lucamsshop.co/problems/<slug>`

> Cada tipo se documenta en `app/(legal)/problems/[slug]/page.tsx` para que los URIs sean dereferenceables (per RFC 7807).

| Slug | Status | Cuándo |
|---|---|---|
| `validation` | 400 | Body no pasa Zod |
| `unauthorized` | 401 | No autenticado |
| `forbidden` | 403 | Autenticado pero sin permiso |
| `not-found` | 404 | Recurso inexistente |
| `conflict` | 409 | Idempotency key conflict, stock agotado, etc. |
| `unprocessable` | 422 | Estado inválido para la operación |
| `too-many-requests` | 429 | Rate limit |
| `payment-declined` | 402 | Wompi declinó |
| `shipping-unavailable` | 503 | Venndelo no responde |
| `webhook-signature-invalid` | 401 | Firma incorrecta (no revelar detalles) |
| `internal-error` | 500 | Catch-all (con requestId) |

---

## Backend — capa de servicio

### Estructura

```
features/checkout/
├── service.ts            # Lógica de dominio. Pura. Testeable sin HTTP.
├── repository.ts         # Acceso a DB (Prisma). Solo aquí entra Prisma.
├── server-actions.ts     # Capa HTTP/Server Actions. Llama a service.ts.
├── schemas.ts            # Zod schemas
└── components/
```

### Reglas

- **`service.ts`** no importa `next/*` ni `@/lib/supabase/*` directo. Solo tipos puros + repository.
- **`repository.ts`** es el único que importa Prisma. Si una feature crece, se subdivide.
- **`server-actions.ts`** es delgado: valida → llama service → mapea result a `ProblemDetails` o respuesta.
- **Tests:** `service.test.ts` con repository mockeado. Tests rápidos, sin DB.

### Ejemplo

```ts
// features/checkout/service.ts
import * as repo from './repository';
import { reserveStock, releaseStock } from '@/features/inventory/service';
import { getPaymentProvider } from '@/lib/payment';

export async function createOrder(payload: CheckoutPayload, requestId: string) {
  return await repo.transaction(async (tx) => {
    const cart = await repo.findCartById(tx, payload.cartId);
    if (!cart) throw new NotFoundError('cart');

    const order = await repo.createOrder(tx, { /* ... */ });
    await reserveStock(tx, order.id, cart.items, requestId);

    if (payload.paymentMethod === 'WOMPI') {
      const provider = getPaymentProvider('wompi');
      const checkout = await provider.createCheckout(order);
      await repo.attachPaymentReference(tx, order.id, checkout.externalId);
      return { orderId: order.id, redirectUrl: checkout.redirectUrl };
    }

    if (payload.paymentMethod === 'COD') {
      await repo.markOrderPaid(tx, order.id, 'COD');
      return { orderId: order.id };
    }

    throw new UnprocessableError('payment-method');
  });
}
```

---

## Backend — saga pattern para flujos distribuidos

> El flujo `Wompi APPROVED → reservar stock → crear envío Venndelo → enviar email` toca tres sistemas externos. Si falla a la mitad, no podemos dejar la base inconsistente.

### Estrategia: orchestrator-based saga con compensaciones

Un orquestador (en webhook handler de Wompi) ejecuta pasos en orden. Cada paso tiene una **acción** y una **compensación**. Si un paso falla, se ejecutan las compensaciones de los pasos anteriores en orden inverso.

```ts
// features/orders/saga.ts
type Step<TCtx> = {
  name: string;
  forward: (ctx: TCtx) => Promise<TCtx>;
  compensate: (ctx: TCtx) => Promise<void>;
};

export async function runSaga<TCtx>(steps: Step<TCtx>[], initial: TCtx, requestId: string): Promise<TCtx> {
  let ctx = initial;
  const completed: Step<TCtx>[] = [];

  for (const step of steps) {
    try {
      logger.info({ saga: 'order-fulfillment', step: step.name, status: 'start', requestId });
      ctx = await step.forward(ctx);
      completed.push(step);
      logger.info({ saga: 'order-fulfillment', step: step.name, status: 'ok', requestId });
    } catch (err) {
      logger.error({ saga: 'order-fulfillment', step: step.name, status: 'fail', err, requestId });
      // Compensar en orden inverso
      for (const done of completed.reverse()) {
        try {
          await done.compensate(ctx);
        } catch (compErr) {
          // Si la compensación falla, ALERTA al operador (audit + email).
          logger.fatal({ saga: 'order-fulfillment', step: done.name, status: 'compensation-failed', compErr, requestId });
          await alertOperator(`Compensación falló en saga ${requestId}, paso ${done.name}`);
        }
      }
      throw err;
    }
  }
  return ctx;
}
```

### Ejemplo concreto: `processPaidOrder`

```ts
// features/orders/saga-process-paid.ts
const stockStep: Step<Ctx> = {
  name: 'commit-stock',
  forward: async (ctx) => ({ ...ctx, inventoryDelta: await commitReservedStock(ctx.orderId) }),
  compensate: async (ctx) => { await rollbackInventoryDelta(ctx.inventoryDelta); },
};

const shipmentStep: Step<Ctx> = {
  name: 'create-shipment',
  forward: async (ctx) => ({ ...ctx, shipment: await venndelo.createShipment(ctx.order) }),
  compensate: async (ctx) => { if (ctx.shipment) await venndelo.cancelShipment(ctx.shipment.id); },
};

const emailStep: Step<Ctx> = {
  name: 'send-confirmation-email',
  forward: async (ctx) => {
    await enqueue('email_send', { template: 'order-confirmation', to: ctx.order.email, data: ctx });
    return ctx;
  },
  compensate: async () => { /* email falló al enqueue es raro; el consumer pgmq tiene retries */ },
};

await runSaga([stockStep, shipmentStep, emailStep], { orderId, order }, requestId);
```

### Cuándo NO usar saga

- Operaciones puramente locales (una transacción de Postgres alcanza).
- Operaciones idempotentes sin orden estricto (eg. enviar 3 emails distintos).

### Observabilidad de sagas

- Cada paso loggea `start`/`ok`/`fail` con `requestId` y `saga` name.
- Tabla `SagaLog(sagaId, step, status, ctx, error?, createdAt)` para forensics.
- Alerta cuando una compensación falla (estado inconsistente; requiere intervención).

---

## Backend — idempotency keys

> Mandato para mutaciones críticas: el cliente puede reintentar sin duplicar.

### Endpoints que requieren idempotency

- `POST /api/checkout/create` (doble click en "Pagar" no crea dos órdenes)
- `POST /api/cart/coupon` (aplicar el mismo cupón dos veces)
- Cualquier API pública que mute estado y pueda ser reintentada por red

### Patrón

```ts
// lib/idempotency.ts
import { supabaseAdmin } from './supabase/service';
import { createHash } from 'crypto';

export async function withIdempotency<T>(
  key: string,
  requestBody: unknown,
  fn: () => Promise<T>,
  ttlSec = 86400  // 24h
): Promise<{ cached: boolean; result: T }> {
  const requestHash = createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
  const existing = await supabaseAdmin
    .from('IdempotencyKeys')
    .select('requestHash, response, expiresAt')
    .eq('key', key)
    .maybeSingle();

  if (existing.data) {
    if (existing.data.requestHash !== requestHash) {
      throw new ConflictError('idempotency-mismatch');  // Mismo key, distinto body → 409
    }
    return { cached: true, result: existing.data.response as T };
  }

  const result = await fn();
  await supabaseAdmin.from('IdempotencyKeys').insert({
    key,
    requestHash,
    response: result,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
  });
  return { cached: false, result };
}
```

```sql
-- migration
CREATE TABLE public.idempotency_keys (
  key         TEXT        PRIMARY KEY,
  request_hash TEXT       NOT NULL,
  response    JSONB       NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idempotency_keys_expires_idx ON public.idempotency_keys(expires_at);

-- Cleanup
SELECT cron.schedule(
  'cleanup-idempotency-keys',
  '*/15 * * * *',
  $$ DELETE FROM public.idempotency_keys WHERE expires_at < NOW() $$
);
```

### Header convention

Cliente envía `Idempotency-Key: <uuid>`. Server lo valida (UUID v4) y lo usa.

---

## DB — naming SQL

| Elemento | Convención |
|---|---|
| Tablas creadas por Prisma | `PascalCase` (lo que Prisma genera por defecto) — preservar |
| Tablas creadas por SQL nativo (migrations no-Prisma) | `snake_case` plural |
| Columnas Prisma | `camelCase` |
| Columnas SQL nativas | `snake_case` |
| Índices | `<table>_<columns>_idx` |
| Foreign keys | `<from_table>_<column>_fkey` |
| Constraints check | `<table>_<column>_check` |
| Funciones | `snake_case` con namespace si aplica (`public.rate_limit_increment`) |
| Triggers | `<table>_<event>_<action>` |

> Mezcla intencional: las tablas de modelo de dominio (gestionadas por Prisma) usan PascalCase. Las tablas auxiliares de infra (rate limit, cache, idempotency, queues) usan snake_case porque las creamos manualmente con SQL.

---

## DB — migration strategy (expand-then-contract)

> Toda migración debe poder aplicarse y revertirse sin tirar el sitio. Nunca un cambio destructivo en una sola release.

### Patrón

1. **Expand:** agregar nueva columna/tabla/índice (nullable o con default). Deploy. La app sigue funcionando con el esquema viejo y el nuevo.
2. **Migrate:** backfill de datos. Idealmente en un job (`pgmq` + `pg_cron`) para no bloquear.
3. **Cutover:** la app empieza a usar la nueva forma. Deploy.
4. **Contract:** eliminar la forma vieja en una release posterior (días/semanas después). Deploy.

### Ejemplo: renombrar `Customer.fullName` → `Customer.firstName + lastName`

| Release | Acción |
|---|---|
| R1 (expand) | Agregar `firstName`, `lastName` como nullables. Trigger que sincroniza `fullName ↔ firstName/lastName`. |
| R2 (backfill) | Job que llena `firstName`/`lastName` desde `fullName` para registros viejos. |
| R3 (cutover) | App lee/escribe `firstName`/`lastName` directo. Trigger sigue por seguridad. |
| R4 (contract) | Eliminar `fullName`, eliminar trigger. |

### Reglas

- **Nunca `DROP COLUMN`/`DROP TABLE`** en la misma release que cambia la app.
- **Nunca `ALTER COLUMN ... NOT NULL`** sin backfill previo.
- **Renombrar:** crear nueva, copiar, deprecar vieja, eliminar después.
- **Foreign keys nuevas:** `NOT VALID` primero, luego `VALIDATE CONSTRAINT` para no bloquear escrituras.
- **Índices grandes:** `CREATE INDEX CONCURRENTLY` (Postgres lo soporta).

### Archivos

- `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql` — orden cronológico.
- Cada migración es **idempotente** (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- Un archivo separado de "down migration" si la operación es reversible.

---

## DB — indexing strategy

### Principios

1. **Cubre los WHERE más frecuentes.** Mira `pg_stat_statements` antes de adivinar.
2. **Compuesto cuando hay AND típico.** `(customerId, createdAt DESC)` para "mis órdenes recientes".
3. **Cubre joins.** Las foreign keys necesitan índice del lado del FK (no automático en Postgres).
4. **Parcial cuando hay filtro fijo.** `WHERE isActive = TRUE` para `Product`.
5. **Concurrentemente en producción.** `CREATE INDEX CONCURRENTLY` no bloquea escrituras.

### Índices iniciales (Fase 1)

```sql
-- Productos activos por categoría (lookups frecuentes en /catalogo)
CREATE INDEX product_active_category_idx ON "Product" ("categoryId") WHERE "isActive" = TRUE;

-- Órdenes por cliente, recientes primero
CREATE INDEX order_customer_recent_idx ON "Order" ("customerId", "createdAt" DESC);

-- Órdenes en estado pendiente para reconciliación
CREATE INDEX order_pending_idx ON "Order" ("createdAt") WHERE "status" = 'PENDING_PAYMENT';

-- Búsqueda full-text de productos (Fase 2)
CREATE INDEX product_search_idx ON "Product" USING gin(to_tsvector('spanish', "name" || ' ' || "description"));

-- Stock bajo para alertas
CREATE INDEX variant_low_stock_idx ON "ProductVariant" ("stock") WHERE "stock" < 5;
```

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
- **Vista o filtro** `WHERE "deletedAt" IS NULL` por defecto en repositories.
- **Hard delete** solo cuando legal lo exige (ej. PII tras 30 días post-cuenta-borrada — ver SECURITY § PII).

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

- `createdBy/updatedBy` se llenan en el repository (transparente al service).
- `deletedAt/deletedBy` se llenan en `softDelete()` del repository.
- Para entidades del cliente final (`Order`, `Cart`, `Review`): `createdBy = customerId`. Para admin: `adminUserId`.

---

## DB — foreign keys cascade explícito

| Relación | `ON DELETE` | Razón |
|---|---|---|
| `OrderItem.orderId` → `Order` | `CASCADE` | Si se borra una orden (caso raro), sus items también |
| `CartItem.cartId` → `Cart` | `CASCADE` | Idem |
| `Address.customerId` → `Customer` | `CASCADE` | Si el cliente se borra, sus direcciones también |
| `Order.customerId` → `Customer` | `SET NULL` | Preservar histórico de ventas aunque el cliente se borre (PII removida pero analítica intacta) |
| `Review.customerId` → `Customer` | `SET NULL` | Idem |
| `InventoryLog.variantId` → `ProductVariant` | `RESTRICT` | Nunca permitir borrar un variant que tiene historial |
| `OrderItem.variantId` → `ProductVariant` | `RESTRICT` | Idem |
| `LoyaltyTxn.customerId` → `Customer` | `SET NULL` | Preservar histórico contable |

> **Default que NO usamos:** Prisma no fuerza `ON DELETE CASCADE` por defecto (`Restrict`). Toda relación debe declarar explícitamente con `onDelete: Cascade | SetNull | Restrict`.

```prisma
model OrderItem {
  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
}
```

---

## DB — retention y archival

| Datos | Retención online | Después | Mecanismo |
|---|---|---|---|
| `Customer` (PII directa) activos | Mientras la cuenta exista | — | — |
| `Customer` borrados | 30 días post-`deletedAt` | Hard delete + anonimización en logs/backups | Cron `pg_cron` |
| `Order` | 5 años (legal) | Archivo a R2 (parquet) + delete | Cron mensual |
| `Cart` abandonado | 90 días | Hard delete | Cron diario |
| `WebhookEvent` | 90 días | Archivo a R2 + delete | Cron mensual |
| `AdminActionLog` | 2 años | Archivo a R2 + delete | Cron mensual |
| `InventoryLog` | Indefinido | Particionar por año si crece mucho | Manual cuando se necesite |
| `LoyaltyTxn` | Vigencia del programa | Hard delete cuando programa se cierra | Manual |
| Logs Vercel | Lo que cubre el plan | Sin acción (Vercel maneja) | — |

> **Archivado a R2:** formato Parquet comprimido. Script en `supabase/functions/archive-monthly/`. Se prueba la restauración cada trimestre.

---

## Resiliencia — timeouts, retries, circuit breakers

### Timeouts (mandato: nunca un fetch sin timeout)

```ts
// lib/fetch-with-timeout.ts
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
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

| Llamada | Timeout |
|---|---|
| Wompi `/v1/transactions/<id>` | 5 s |
| Wompi `/v1/transactions` (POST) | 10 s |
| Venndelo quote | 5 s |
| Venndelo create shipment | 15 s |
| Anthropic `/v1/messages` | 30 s (modelo puede tardar) |
| Resend `/emails` | 10 s |

### Retries con backoff exponencial

```ts
// lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; maxMs?: number } = {}
): Promise<T> {
  const { attempts = 3, baseMs = 200, maxMs = 5000 } = opts;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      if (!isRetryable(err)) throw err;  // 4xx no se reintenta
      const delay = Math.min(baseMs * 2 ** i + Math.random() * 100, maxMs);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('unreachable');
}
```

`isRetryable`: 5xx, network errors, timeouts. **NO 4xx** (excepto 408, 429).

### Circuit breakers

Para llamadas críticas (Wompi, Venndelo):

```ts
// lib/circuit-breaker.ts (simplificado)
class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private lastFailureAt = 0;

  constructor(private opts: { threshold: number; resetMs: number }) {}

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureAt > this.opts.resetMs) {
        this.state = 'half-open';
      } else {
        throw new Error('CIRCUIT_OPEN');
      }
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'closed';
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailureAt = Date.now();
      if (this.failures >= this.opts.threshold) this.state = 'open';
      throw err;
    }
  }
}

// Uso
export const wompiCB = new CircuitBreaker({ threshold: 5, resetMs: 30000 });
```

> **Nota:** el estado del circuit breaker en serverless es per-instancia. Para coordinación global se necesitaría Redis o Postgres. Para nuestra escala, per-instancia es suficiente al inicio.

---

## Logging y request ID correlation

### Request ID

Cada request entrante recibe un `requestId` (UUID v4) generado en `middleware.ts`. Se propaga:
- Header de respuesta `X-Request-Id`.
- Cookie `__rid` para correlación entre páginas (opcional).
- Argumento implícito en logger, jobs pgmq, emails.

```ts
// lib/request-id.ts (simplificado, real impl con AsyncLocalStorage)
import { AsyncLocalStorage } from 'async_hooks';
const als = new AsyncLocalStorage<string>();

export function withRequestId<T>(id: string, fn: () => T): T {
  return als.run(id, fn);
}

export function getRequestId(): string {
  return als.getStore() ?? 'no-request-id';
}
```

### Logger

```ts
// lib/logger.ts
import pino from 'pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.email',     // emails parciales
  '*.phone',     // teléfonos parciales
  '*.password',
  '*.*Secret',
  '*.*Key',
  '*.*Token',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  formatters: {
    bindings: () => ({ env: process.env.NODE_ENV, app: 'lucams-shop' }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

Uso:

```ts
logger.info({ event: 'order.created', orderId, customerId, requestId: getRequestId() });
```

> **Nunca** `logger.info('User ' + email + ' did X')`. Usar siempre objeto estructurado con campos: `logger.info({ event, userId, requestId })`.

---

## Code style

- **Prettier** + **ESLint** (`eslint-config-next` + `@typescript-eslint`) en pre-commit con `lint-staged`.
- **TypeScript estricto:** `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`.
- **No usar `any`.** Si no hay tipo, usar `unknown` y narrow.
- **Imports ordenados:** node → externos → `@/...` → relativos. ESLint plugin `import/order`.
- **Archivos < 400 líneas** (split en submódulos si crece).
- **Funciones < 50 líneas** salvo casos justificados (saga orchestrators, etc.).
- **Comentarios solo cuando el WHY no es obvio.** Ver mandato de CLAUDE.md.
- **Tests al lado del archivo:** `service.ts` + `service.test.ts` en la misma carpeta.
- **`.editorconfig`** versionado para consistencia entre IDEs.
