# Convenciones de Ingeniería — Lucams Shop

> **Documento vivo de Nivel 1 ([`README.md`](README.md)).** Fija los patrones obligatorios de arquitectura, código, interfaz, dinero, fechas, errores, imágenes, CMS, base de datos, scripts operativos y flujo Git en el monorepo de **Lucams Shop**. Toda duda sobre «¿cómo implementamos X?» se resuelve aplicando los contratos de este documento antes de introducir cualquier abstracción nueva.

## Tabla de contenido

1. [Principios rectores](#1-principios-rectores)
2. [Idioma, marca y convenciones de nomenclatura](#2-idioma-marca-y-convenciones-de-nomenclatura)
3. [Arquitectura de módulos y separación Prisma vs Supabase](#3-arquitectura-de-módulos-y-separación-prisma-vs-supabase)
4. [Frontend en Next.js 16 y React 19 (RSC, `proxy.ts`, formularios y caché)](#4-frontend-en-nextjs-16-y-react-19-rsc-proxyts-formularios-y-caché)
5. [Estados explícitos de UI y controles transversales de interfaz](#5-estados-explícitos-de-ui-y-controles-transversales-de-interfaz)
6. [Dinero en centavos COP (`Int`) y fechas en `America/Bogota`](#6-dinero-en-centavos-cop-int-y-fechas-en-americabogota)
7. [Errores estándar RFC 7807, sanitización, logging y resiliencia HTTP](#7-errores-estándar-rfc-7807-sanitización-logging-y-resiliencia-http)
8. [Procesamiento seguro de imágenes server-side (`sharp-safe.ts`)](#8-procesamiento-seguro-de-imágenes-server-side-sharp-safets)
9. [CMS v2 de 3 capas y sincronización del paquete legal](#9-cms-v2-de-3-capas-y-sincronización-del-paquete-legal)
10. [Base de datos, idempotencia, patrón Saga y migraciones duales](#10-base-de-datos-idempotencia-patrón-saga-y-migraciones-duales)
11. [Guardas obligatorias en scripts (`packages/db/scripts/`)](#11-guardas-obligatorias-en-scripts-packagesdbscripts)
12. [Calidad estática, ESLint, Prettier, `gitleaks` y flujo Git](#12-calidad-estática-eslint-prettier-gitleaks-y-flujo-git)

---

## 1. Principios rectores

1. **Coherencia sobre novedad:** si ya existe un helper, guarda o componente compartido en la base de código, reutilízalo. Está prohibido introducir librerías o abstracciones paralelas para problemas ya resueltos.
2. **Explícito sobre implícito:** nombres claros, valores por defecto visibles, relaciones de borrado declaradas y errores tipados con causa legible. Cero magia oculta.
3. **Servidor por defecto (_Server-first_):** toda ruta y componente en Next.js 16 nace como React Server Component (RSC); `"use client"` se reserva exclusivamente para hojas interactivas que requieren estado o APIs del navegador.
4. **Validación estricta en la frontera:** todo dato externo (formularios, `searchParams`, route handlers, webhooks, respuestas de terceros) se valida al entrar al servidor con **Zod v4** (`zod@^4.6.7`). El código interno de dominio trabaja sobre tipos ya validados.
5. **Falla cerrada y sin filtraciones (_fail-closed_):** los errores hacia el cliente usan contratos controlados (estado tipado en Server Actions o `ProblemDetails` RFC 7807 en `/api/*` con `X-Request-Id`), sin exponer jamás trazas internas, errores crudos de Prisma (`P2002`, nombres de tablas) ni respuestas sin sanitizar de terceros.
6. **Idempotencia anclada en PostgreSQL:** pagos, guías logísticas, descuentos de stock, cupones y correos transaccionales toleran reintentos mediante claves únicas, claims condicionales o sellos de tiempo persistidos en base de datos; la memoria de una instancia serverless nunca es fuente de deduplicación.

---

## 2. Idioma, marca y convenciones de nomenclatura

### Regla trilingüe de contexto

| Ámbito                                                                                | Idioma y regla obligatoria                          | Ejemplo real                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Código fuente, tipos, funciones, modelos Prisma, columnas y commits                   | **Inglés**                                          | `OrderItem`, `createOrderFromCart`, `feat(cart): recover active session`  |
| Interfaz de usuario (storefront, Estudio, `/admin`) y correos                         | **Español de Colombia (`es-CO`) en tuteo estricto** | «Elige tu plantilla», «Revisa tu correo», «Configura el envío», «Para ti» |
| Documentación canónica (`docs/`, `CLAUDE.md`, `AGENTS.md`) y comentarios de _por qué_ | **Español** (tuteo)                                 | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`TESTING.md`](TESTING.md)          |

- **Prohibición absoluta de voseo:** cualquier pronombre o conjugación verbal voseante (imperativos agudos sin _-d_ final o presentes agudos de segunda persona, frente al tuteo colombiano obligatorio _tú_, _contigo_, _para ti_, _elige_, _tienes_, _puedes_, _quieres_, _ingresa_, _revisa_, _configura_, _escríbenos_) rompe de inmediato `make check` y el job `quality` de CI.
- **Identidad de marca (`ADR-138`):** escribe siempre **«Lucams»** o **«Lucams Shop»** consumiendo `SITE_NAME` desde `apps/web/lib/site.ts`. Está prohibido usar apóstrofos o guiones bajos en textos visibles, asuntos de correo o prosa documental ([`BRANDING.md`](BRANDING.md)).
- **Identificadores canónicos del negocio:**
  - Numeración de órdenes: `LCM-YYYY-NNNN` (p. ej. `LCM-2026-0004`).
  - Buzón general de atención: `hola@lucamsshop.com`.
  - Buzón único de seguridad: `security@lucamsshop.com`.

### Tabla maestra de convenciones de naming

| Elemento                                 | Convención obligatoria                                             | Ejemplo real                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Archivos TS / TSX                        | `kebab-case.ts` / `kebab-case.tsx`                                 | `product-card.tsx`, `use-admin-confirm.tsx`, `sharp-safe.ts`                 |
| Rutas App Router y slugs URL             | `kebab-case` en español                                            | `/empresas-y-eventos`, `/mi-cuenta/pedidos`, `/ocasion/dia-de-la-madre`      |
| Componentes React                        | `PascalCase`                                                       | `ProductCard`, `DesignPreviewDialog`, `CloseXButton`                         |
| Hooks personalizados                     | `useXxx` en `camelCase`                                            | `useAdminConfirm`, `useSelectedVariant`                                      |
| Funciones y variables locales            | `camelCase`                                                        | `formatCOP`, `resolveCmsTokens`, `currentAdmin`                              |
| Server Actions                           | `camelCase` con sufijo `*Action`                                   | `applyCouponAction`, `subscribeNewsletterAction`, `finalizeDesignAction`     |
| Esquemas de validación Zod v4            | `PascalCase` con sufijo `*Schema`                                  | `ApplyCouponSchema`, `SubscribeSchema`, `AddToCartSchema`                    |
| Tipos e interfaces TypeScript            | `PascalCase` (prohibido el prefijo `I`)                            | `ProblemDetails`, `AdminConfirmOptions`, `ShipmentLastError`                 |
| Constantes globales y de módulo          | `UPPER_SNAKE_CASE`                                                 | `COLOMBIA_TIME_ZONE`, `MAX_MONEY_CENTS`, `PREVIEW_TARGET_BYTES`              |
| Variables de entorno                     | `UPPER_SNAKE_CASE` (`NEXT_PUBLIC_` **solo** si viaja al navegador) | `WOMPI_EVENTS_SECRET`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`        |
| Modelos Prisma                           | `PascalCase` singular                                              | `Customer`, `Order`, `OrderItem`, `WompiPaymentAttempt`                      |
| Enums Prisma                             | Nombre `PascalCase`; valores en `UPPER_SNAKE_CASE`                 | `OrderStatus.PENDING_PAYMENT`, `AdminRole.SUPERADMIN`                        |
| Columnas en modelos Prisma               | `camelCase`                                                        | `shipmentLastError`, `confirmationSentAt`, `previewPagesCount`               |
| Tablas, columnas y funciones SQL nativas | `snake_case` (tablas en plural)                                    | `rate_limit_buckets`, `public.rate_limit_check`, `public.immutable_unaccent` |
| Índices, FKs y CHECK constraints SQL     | `<table>_<cols>_idx`, `<table>_<col>_fkey`, `<table>_<col>_check`  | `product_search_name_trgm_idx`, `OrderItem_orderId_fkey`                     |
| Alias de importación en `apps/web`       | `@/...` apuntando a `apps/web/`                                    | `import { prisma } from "@/lib/db"`                                          |
| Ramas Git y commits                      | `<tipo>/<slug>` + Conventional Commits en inglés                   | `feat/checkout-gift-mode`, `fix(wompi): enforce 25h replay window`           |

---

## 3. Arquitectura de módulos y separación Prisma vs Supabase

### Estructura del monorepo

```text
./ (raíz del monorepo pnpm)
├── apps/web/                              # Aplicación Next.js 16 (App Router)
│   ├── app/                               # Enrutamiento, layouts, RSC y estados loading/error
│   │   ├── (auth)/                        # /login, /registro, /confirmar-codigo, /recuperar-password
│   │   ├── productos/ · producto/[slug]/  # Catálogo SSR y PDP con buy-box modular
│   │   ├── estudio/[slug]/                # Editor Konva 2D, 7 escenas 3D (R3F) y store Zustand local
│   │   ├── checkout/                      # Flujo en 3 pasos: datos/ → envio/ → pago/ → gracias/
│   │   ├── mi-cuenta/                     # Autoservicio autenticado (pedidos, diseños, soporte…)
│   │   ├── pedido/[token]/                # Seguimiento y posventa 2FA para invitados
│   │   ├── legal/<doc>/                   # Los 8 documentos legales públicos con FALLBACK sincronizado
│   │   ├── admin/
│   │   │   ├── login/                     # Login separado de staff + reto TOTP (/admin/login/mfa)
│   │   │   └── (panel)/                   # Backoffice protegido por RBAC (8 roles × 35 caps) + MFA aal2
│   │   ├── api/                           # Route Handlers HTTP: webhooks/, cron/, catalog/, cms/, health/
│   │   ├── error.tsx · global-error.tsx   # Error boundaries con reporte a /api/log-error
│   │   └── not-found.tsx                  # 404 de marca
│   ├── features/<dominio>/                # ~35 módulos verticales de dominio
│   │   ├── service.ts                     # Reglas de negocio y acceso tipado a DB (@/lib/db)
│   │   ├── actions.ts                     # Server Actions reutilizables ("use server")
│   │   ├── schemas.ts                     # Esquemas Zod v4 compartidos cliente/servidor
│   │   ├── <submodulo>.ts                 # Submódulos cohesivos (saga.ts, stock.ts, emails.ts…)
│   │   └── *.test.ts · *.integration.test.ts
│   ├── components/                        # Primitivos shadcn/ui (ui/) y bloques transversales (admin/, cms/, legal/)
│   ├── lib/                               # Infraestructura transversal (db, datetime, money, cms, errors, logger…)
│   └── proxy.ts                           # Proxy HTTP de Next.js 16 (reemplaza middleware.ts)
├── packages/db/                           # Paquete workspace @lucams/db
│   ├── prisma/schema.prisma               # 77 modelos y 31 enums + migrations/
│   ├── legal-content/                     # Fuentes Markdown canónicas del paquete legal (Versión 3)
│   ├── src/index.ts                       # Singleton PrismaClient con pool acotado + runWithDbRetry
│   └── scripts/                           # Semillas, auditorías y guardas en scripts/lib/
└── supabase/migrations/                   # 56 migraciones SQL idempotentes (RLS, REVOKE, Storage, pg_cron)
```

### Anatomía de `apps/web/features/<dominio>/`

- **`service.ts` concentra la lógica de dominio y las consultas Prisma (`@/lib/db`):** no existe una capa `repository.ts` intermedia artificial. Cuando una feature crece (como `orders` o `personalization`), se divide en submódulos cohesivos (`saga.ts`, `stock.ts`, `emails.ts`, `shipment-error.ts`, `retention-service.ts`) evitando superar ~400 líneas por archivo.
- **`actions.ts` es una frontera delgada:** nunca consulta Prisma directamente; valida entradas con Zod v4, aplica rate-limit / Turnstile / RBAC, invoca `service.ts`, invalida tags de caché y devuelve un estado tipado o llama a `redirect()`. Si una Server Action pertenece a una única pantalla, puede vivir junto a su ruta (p. ej. `app/checkout/pago/actions.ts`).
- **Qué entra en `apps/web/lib/`:** únicamente utilidades genuinamente transversales a múltiples dominios (`db.ts`, `datetime.ts`, `money.ts`, `format.ts`, `errors.ts`, `logger.ts`, `rate-limit.ts`, `cms.ts`, `admin-rbac-guard.ts`).
- **Ayuda administrativa obligatoria (`ADR-197`):** toda página nueva de `app/admin/(panel)` debe resolver una guía en `features/admin-help/content/` y superar `registry.test.ts`. Al cambiar campos, métricas, estados, permisos o procedimientos se actualiza en la misma entrega su guía, procedimientos interactivos y `version`; el contenido operativo no se delega a CMS ni se deja para una fase posterior.

### Singleton `prisma`, pool acotado y `runWithDbRetry` (`@lucams/db`)

`packages/db/src/index.ts` construye un único `PrismaClient` re-exportado en la web por `apps/web/lib/db.ts` (protegido con `import "server-only"`):

- **Pool por proceso adaptado a Vercel + Supavisor (`ADR-131`):** fija `connection_limit=5` (`PRISMA_CONNECTION_LIMIT`) y `pool_timeout=20` segundos (`PRISMA_POOL_TIMEOUT`) únicamente sobre `DATABASE_URL` (puerto `:6543` PgBouncer transaction mode), sin alterar `DIRECT_URL` (`:5432`, usado por `prisma migrate`).
- **Reintento automático ante fallos de adquisición de conexión (`runWithDbRetry`):** envuelve `$allOperations` reintentando hasta 3 intentos (backoff lineal `300 ms × intento`) exclusivamente cuando la consulta **nunca llegó a ejecutarse** (`P1001`, `P1017`, `P2024` o sus equivalentes de `PrismaClientInitializationError` en cold start). Errores de constraint (`P2002`), sintaxis o lógica jamás se reintentan.

```ts
// apps/web/features/checkout/service.ts — patrón real en capa de servicio
import "server-only";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { CheckoutPayload } from "./schemas";

export async function createOrderFromCart(cartId: string, payload: CheckoutPayload) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { id: cartId },
      include: { items: true },
    });
    if (!cart) throw new NotFoundError("el carrito");

    // Idempotencia cart → order: reutiliza una orden PENDING_PAYMENT viva ante doble clic.
    const existing = await tx.order.findFirst({
      where: { cartId, status: "PENDING_PAYMENT", deletedAt: null },
    });
    if (existing) return { orderId: existing.id, reused: true };

    const order = await tx.order.create({
      data: {
        cartId,
        email: payload.email,
        total: payload.totalCents,
        // ...
      },
    });
    return { orderId: order.id, reused: false };
  });
}
```

### Separación estricta: cuándo usar Prisma vs clientes Supabase

PostgREST está **cerrado por diseño** en el 100 % de las tablas públicas (`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` + event trigger `049`). Por lo tanto, **está prohibido usar `supabase.from("<Tabla>")` para lógica de negocio en la aplicación**.

| Cliente                                       | Módulo                    | Dónde se permite importar                                    | Uso exclusivo permitido                                                                                                                           |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma` (`PrismaClient` extendido)           | `@/lib/db` (`@lucams/db`) | RSC, `features/*/service.ts`, Route Handlers (`server-only`) | **100 % de lecturas, escrituras y transacciones SQL** sobre los 77 modelos                                                                        |
| `createSupabaseServerClient()`                | `@/lib/supabase/server`   | RSC, Server Actions, Route Handlers, `proxy.ts`              | **Supabase Auth SSR** bajo cookies del usuario: `auth.getUser()`, OTP, cambio de clave y verificación MFA TOTP (`auth.mfa.*`, `aal2`)             |
| `createSupabaseBrowserClient()`               | `@/lib/supabase/browser`  | Client Components (`"use client"`) puntuales de Auth/MFA     | **Supabase Auth en navegador** (enrolamiento/reto interactivo TOTP sobre `document.cookie`, protegido por CSP con nonce)                          |
| `supabaseService` (Proxy lazy `service_role`) | `@/lib/supabase/service`  | Solo servidor (`import "server-only"`)                       | **Supabase Storage** (URLs firmadas, subida y purga en los 5 buckets) y **Auth Admin API** (`auth.admin.*` en borrado de cuenta Ley 1581 o tests) |

```ts
// Correcto: Auth + MFA por Supabase SSR; datos de negocio por Prisma tipado
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { prisma } from "@/lib/db";

const supabase = await createSupabaseServerClient();
const {
  data: { user },
} = await supabase.auth.getUser();

const customer = user
  ? await prisma.customer.findUnique({ where: { supabaseUserId: user.id } })
  : null;

const { data: signed } = await supabaseService.storage
  .from("design-previews")
  .createSignedUrl(previewPath, 300);
```

---

## 4. Frontend en Next.js 16 y React 19 (RSC, `proxy.ts`, formularios y caché)

> Antes de usar APIs nuevas del framework, consulta [`../apps/web/AGENTS.md`](../apps/web/AGENTS.md) y `apps/web/node_modules/next/dist/docs/`.

### RSC por defecto y patrón _"thin client wrapper"_

Solo declara `"use client"` en la hoja mínima del árbol cuando necesites `useState`/`useReducer`, `useEffect`, `useActionState`, manejadores imperativos (`onClick`, `onPointerMove`), APIs del DOM (`localStorage`, `ResizeObserver`) o librerías exclusivas de navegador (`react-konva`, `@react-three/fiber`). Además, pasa las lecturas de `<CmsText>` ya resueltas desde el Server Component como `ReactNode` props al componente cliente.

### APIs dinámicas asíncronas (`await params`, `searchParams`, `cookies`, `headers`)

En Next.js 16, `params`, `searchParams`, `cookies()` y `headers()` son **asíncronos** y devuelven `Promise`:

```tsx
// apps/web/app/producto/[slug]/page.tsx — Server Component (RSC)
import { notFound } from "next/navigation";
import { getCatalogProductDetail } from "@/lib/catalog";
import { CmsText } from "@/components/cms/cms-text";
import { ProductGallery } from "@/components/product-detail/product-gallery";
import { SelectedVariantProvider, AddToCartButton } from "./variant-actions";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { slug } = await params;
  const { variant } = await searchParams;

  const product = await getCatalogProductDetail(slug);
  if (!product) notFound();

  const initialId =
    product.variants.find((v) => v.id === variant)?.id ?? product.variants[0]?.id ?? null;

  return (
    <article className="mx-auto max-w-6xl px-4 py-8">
      <ProductGallery images={product.images} productName={product.name} />
      <SelectedVariantProvider variantIds={product.variants.map((v) => v.id)} initialId={initialId}>
        {/* Solo la hoja interactiva viaja al bundle de cliente */}
        <AddToCartButton
          ctaLabel={<CmsText blockKey="pdp.buybox.add_cta" fallback="Agregar al carrito" />}
        />
      </SelectedVariantProvider>
    </article>
  );
}
```

```tsx
// apps/web/app/producto/[slug]/variant-actions.tsx — hoja interactiva ("use client")
"use client";

import type { ReactNode } from "react";
import { addToCartAction } from "@/features/cart/actions";
import { useSelectedVariant } from "./selected-variant-context";
import { Button } from "@/components/ui/button";

export function AddToCartButton({ ctaLabel }: { ctaLabel: ReactNode }) {
  const { selectedId } = useSelectedVariant();
  return (
    <form action={addToCartAction}>
      <input type="hidden" name="variantId" value={selectedId ?? ""} />
      <Button type="submit">{ctaLabel}</Button>
    </form>
  );
}
```

### Reglas de `apps/web/proxy.ts` e IP real del cliente

1. **`proxy.ts` reemplaza a `middleware.ts` (`ADR-024`, `ADR-162`, `ADR-183`):** genera `X-Request-Id` (UUID v4), inyecta CSP con nonce por request y cabeceras de seguridad, valida CORS por allowlist en `/api/*`, resuelve redirecciones CMS cacheadas y aplica el gate HTTP de sesión, timeout de inactividad (30 min admin / 30 días cliente) y MFA `aal2` sobre `/admin/*`.
2. **Aislamiento de `/api/*` y links hacia `/admin`:** `proxy.ts` jamás instancia sesión Supabase en `/api/*` (evita carreras de rotación de refresh token). Todo `<Link>` que apunte desde el storefront a `/admin/*` debe declarar **`prefetch={false}`** para no disparar controles de sesión administrativa en segundo plano.
3. **Obtención obligatoria de IP con `getClientIp`:** está prohibido leer `headers.get("x-forwarded-for")`, `x-real-ip` o `x-vercel-forwarded-for` directamente (bloqueado con error por `no-restricted-syntax` en `eslint.config.mjs`). Usa siempre `getClientIp(await headers())` de `@/lib/client-ip`.

### Tabla de decisión: RSC directo vs Server Action vs Route Handler `/api/*`

| Escenario                                                                         | Patrón obligatorio                                                                                        | Motivo técnico                                                                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Lectura inicial de una página o layout                                            | **RSC directo** llamando a `features/<dom>/service.ts` o helper cacheado (`lib/catalog.ts`, `lib/cms.ts`) | Cero salto HTTP extra, tipado directo y streaming con `Suspense`                                                          |
| Mutaciones iniciadas desde la UI (formularios, botones cliente o `/admin`)        | **Server Action** (`"use server"`) + `useActionState`                                                     | Protección CSRF nativa (`SameSite=Lax` + Origin check de Next), tipado end-to-end e invalidación síncrona con `updateTag` |
| Sugerencias IA del Estudio o Copiloto cero-PII de soporte                         | **Server Action** que delega a `features/ai/*`                                                            | Valida sesión/capacidad y mantiene las llaves de Gemini ocultas en servidor                                               |
| Webhooks entrantes de terceros (`/api/webhooks/{wompi,aveonline,resend}`)         | **Route Handler** (`app/api/.../route.ts`)                                                                | Requiere acceso al `rawBody`, cabeceras de firma criptográfica y códigos HTTP exactos                                     |
| Tareas programadas desde Supabase `pg_cron` + `pg_net` (`/api/cron/*`)            | **Route Handler** autenticado con `x-cron-secret` desde Vault                                             | Ejecución desatendida fuera de sesión de navegador y `maxDuration` dedicado en `vercel.json`                              |
| Descargas binarias, feeds XML, previews firmados o lecturas públicas desacopladas | **Route Handler** (`/api/catalog/*`, `/api/cms/*`, `/api/design-preview/*`, `/merchant.xml`)              | Control explícito de `Content-Type`, `Cache-Control` y errores RFC 7807                                                   |

### Patrón completo de formularios, Server Actions con Zod v4 e invalidación de caché

- **Sin `react-hook-form`:** todos los formularios usan `<form action={formAction}>` nativo conectado a `useActionState` de React 19.
- **No deshabilites el botón antes del primer intento:** deshabilitar el submit en reposo oculta por qué falta un dato; deshabilítalo únicamente mientras `pending === true`.
- **Orden de guardas en toda Server Action:**
  1. Si es acción administrativa: `await requireCapability("...")` (o `requireAdminAction`) de `@/lib/admin-rbac-guard` al inicio (verifica sesión activa, factor TOTP verificado, nivel `aal2` y capacidad RBAC).
  2. Si es acción transaccional de tienda: `assertTransactionalAllowed()` / `guardTransactionalAction()` de `@/lib/stage-guard` (`ADR-078`).
  3. Si es formulario público expuesto a abuso (los 10 flujos protegidos): `getClientIp(await headers())` → `rateLimit(...)` (`@/lib/rate-limit`) → `verifyTurnstileToken(token, ip)` (`@/lib/turnstile`).
  4. Validación server-side con `Schema.safeParse(...)` (Zod v4).
  5. Ejecución en `service.ts` e invalidación de caché:
     - **Dentro de Server Actions:** usa **`updateTag("cms")`** o **`updateTag("catalog")`** (`next/cache`) para garantizar _read-your-own-writes_ inmediato al operador o cliente.
     - **Dentro de Route Handlers o jobs de background (`/api/cron/*`):** usa **`revalidateTag(tag, "max")`** pasando siempre el segundo argumento exigido por Next.js 16.

```ts
// apps/web/features/contact/schemas.ts — esquema compartido en Zod v4
import { z } from "zod";

export const PublicSupportSchema = z.object({
  email: z.email("Ingresa un correo electrónico válido.").transform((v) => v.trim().toLowerCase()),
  subject: z.string().trim().min(4, "Escribe un asunto de al menos 4 caracteres.").max(120),
  message: z
    .string()
    .trim()
    .min(15, "Cuéntanos un poco más de detalle (mínimo 15 caracteres).")
    .max(2000),
});
```

```ts
// apps/web/features/contact/actions.ts — Server Action pública (Turnstile + Rate Limit + Zod v4)
"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { PublicSupportSchema } from "./schemas";
import * as supportService from "./service";

export type SupportFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createPublicTicketAction(
  _prev: SupportFormState | null,
  formData: FormData,
): Promise<SupportFormState> {
  const ip = getClientIp(await headers());
  const rl = await rateLimit(ipKey("public-support", ip), 5, 3600);
  if (!rl.allowed) {
    return { error: "Has enviado demasiadas solicitudes seguidas. Intenta de nuevo más tarde." };
  }

  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const turnstile = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstile.success) {
    return { error: "No pudimos verificar la validación anti-bots. Recarga e inténtalo de nuevo." };
  }

  const parsed = PublicSupportSchema.safeParse({
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Revisa los campos marcados antes de continuar.",
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  await supportService.createTicket(parsed.data);
  return { ok: true };
}
```

```ts
// Ejemplo de Server Action administrativa con RBAC + MFA aal2 + updateTag
"use server";

import { updateTag } from "next/cache";
import { requireCapability } from "@/lib/admin-rbac-guard";
import * as categoryService from "@/features/categories/service";
import { UpdateCategorySchema } from "@/features/categories/schemas";

export async function updateCategoryAction(formData: FormData) {
  const { admin } = await requireCapability("catalog.write");
  const parsed = UpdateCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los datos de la categoría." };

  await categoryService.updateCategory(parsed.data, admin.id);
  updateTag("catalog"); // Read-your-own-writes inmediato en Server Actions de Next 16
  return { ok: true };
}
```

```tsx
// Componente cliente consumiendo la Server Action con atributos ARIA accesibles
"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPublicTicketAction, type SupportFormState } from "@/features/contact/actions";

export function PublicSupportForm() {
  const [state, formAction, pending] = useActionState<SupportFormState | null, FormData>(
    createPublicTicketAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast.success("Recibimos tu mensaje. Te responderemos al correo.");
  }, [state?.ok]);

  const emailErr = state?.fieldErrors?.email?.[0];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}
      <div>
        <label htmlFor="support-email" className="block text-sm font-medium">
          Tu correo electrónico
        </label>
        <Input
          id="support-email"
          name="email"
          type="email"
          aria-invalid={Boolean(emailErr)}
          aria-describedby={emailErr ? "support-email-error" : undefined}
        />
        {emailErr && (
          <p id="support-email-error" className="mt-1 text-xs text-red-600">
            {emailErr}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar solicitud"}
      </Button>
    </form>
  );
}
```

---

## 5. Estados explícitos de UI y controles transversales de interfaz

### Mandato de los 4 estados explícitos por vista

Toda ruta o bloque asíncrono en tienda y `/admin` debe contemplar explícitamente cuatro estados visuales y accesibles:

| Estado         | Implementación canónica                                                              | Reglas obligatorias                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Loading** | `loading.tsx` por segmento o `<Suspense fallback={<Skeleton />}>`                    | Skeleton con la **misma geometría** de la vista real (nunca un spinner suelto en blanco), animación `animate-pulse` respetando `prefers-reduced-motion`  |
| **2. Error**   | `app/error.tsx`, `app/admin/(panel)/error.tsx` y `app/global-error.tsx`              | Mensaje claro sin stack trace, reporte `keepalive` hacia `/api/log-error`, exhibición de `error.digest` / `requestId` para soporte y botón `reset()`     |
| **3. Empty**   | Ilustración/mascota (`LucamsLogo` / `lucams-mascot`) + copy guía + CTA primario      | Orienta la siguiente acción («¿Qué imán quieres crear hoy?» → enlace a `/productos`), textos en CMS si es storefront                                     |
| **4. Success** | Renderizado del contenido + confirmación inline o `toast.success(...)` de **Sonner** | Toasts en `aria-live="polite"` con auto-cierre (~5 s) solo para avisos no bloqueantes; los errores de validación van **siempre inline** en el formulario |

```tsx
// 1) Loading state — app/productos/loading.tsx (misma grilla que el catálogo real)
export default function CatalogLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando productos"
      className="grid grid-cols-2 gap-4 md:grid-cols-4"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-muted h-72 rounded-2xl motion-safe:animate-pulse" />
      ))}
    </div>
  );
}
```

```tsx
// 2) Empty state — patrón con mascota de marca y CTA claro
import Link from "next/link";
import { LucamsLogo } from "@/components/lucams-logo";
import { CmsText } from "@/components/cms/cms-text";

export function EmptyDesignsState() {
  return (
    <section className="border-brand-purple/15 bg-brand-cream/50 flex flex-col items-center rounded-2xl border px-6 py-12 text-center">
      <LucamsLogo variant="mascot" size={96} />
      <h2 className="font-display text-brand-purple-dark mt-4 text-xl">
        <CmsText
          blockKey="account.designs.empty_title"
          fallback="Aún no tienes diseños guardados"
        />
      </h2>
      <p className="text-brand-purple-dark/70 mt-1 max-w-sm text-sm">
        <CmsText
          blockKey="account.designs.empty_body"
          fallback="Elige tu producto favorito en el catálogo y personalízalo a tu gusto en el Estudio."
        />
      </p>
      <Link
        href="/productos"
        className="bg-brand-purple hover:bg-brand-purple-dark mt-6 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-colors"
      >
        Explorar catálogo
      </Link>
    </section>
  );
}
```

### Confirmaciones administrativas con `useAdminConfirm` (`ADR-192`)

En todo `/admin/*` está **prohibido** invocar `window.confirm()` o `window.prompt()` (bloquean el hilo principal, carecen de identidad visual y no son testeables en RTL). Toda acción sensible o destructiva usa `useAdminConfirm` (`apps/web/components/admin/use-admin-confirm.tsx`), `ConfirmAction` o `ReauthForm`:

```tsx
"use client";

import { toast } from "sonner";
import { useAdminConfirm } from "@/components/admin/use-admin-confirm";
import { Button } from "@/components/ui/button";
import { deleteTemplateAction } from "./actions";

export function DeleteTemplateButton({ templateId, name }: { templateId: string; name: string }) {
  const { confirm, confirmDialog } = useAdminConfirm();

  async function handleDelete() {
    const accepted = await confirm(
      `Vas a eliminar permanentemente la plantilla «${name}». Esta acción no se puede deshacer.`,
      {
        title: "Eliminar plantilla",
        confirmLabel: "Sí, eliminar",
        requireTyped: "ELIMINAR", // Exige teclear la palabra exacta en borrados irreversibles
      },
    );
    if (!accepted) return;

    const res = await deleteTemplateAction(templateId);
    if (res.ok) toast.success("Plantilla eliminada.");
    else toast.error(res.error);
  }

  return (
    <>
      <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
        Eliminar
      </Button>
      {confirmDialog}
    </>
  );
}
```

### Controles compartidos obligatorios de interfaz

1. **Botón de cierre `CloseXButton` (`apps/web/components/ui/close-x-button.tsx`, `ADR-178`):** todos los modales, diálogos, lightboxes, popovers y sheets usan `CloseXButton` (o `CLOSE_X_CLASS` cuando el contenedor posiciona el botón), garantizando círculo morado de marca con icono blanco visible sobre fotografías oscuras o claras y `aria-label="Cerrar"`.
2. **Tooltips accesibles (`ADR-122`):** usa siempre el primitivo Radix de `components/ui/tooltip.tsx`; está prohibido el atributo nativo `title=` (inaccesible en teclado y pantallas táctiles).
3. **Bottom-sheet móvil «resumen + Listo» (`ADR-151`):** cuando una barra de opciones densa (colores, bordes, estilos del Estudio como `StudioStyleToolbar`) no cabe en `< 640 px` (`< sm`), **nunca** uses `overflow-x-auto` horizontal:
   - En `< sm`, muestra un botón resumen con el valor activo (`swatch` + nombre + `aria-label`) que abre un `Sheet` con `side="bottom"`.
   - Dentro del `Sheet`, presenta una grilla con salto de línea (`grid-cols-4`), aplica los cambios **en vivo** y cierra con un botón primario fijo «Listo» en el pie. En `≥ sm`, la barra de escritorio permanece intacta.
4. **Visor paginado único de diseños (`ADR-150`):** toda vista que muestre miniaturas de diseños personalizados (`/carrito`, `/checkout/gracias`, `/mi-cuenta/pedidos/[number]`, `/pedido/[token]`) reutiliza `components/design-preview-dialog.tsx` + `components/preview-zoom.ts` + `components/design-units-badge.tsx`:
   - Incluye siempre `previewPagesCount` en el `select` Prisma de `Design` para habilitar la paginación vía `designPreviewDisplay()`.
   - Como Radix admite un solo trigger por instancia de `Dialog`, si ofreces miniatura clicable **y** botón «Ver diseño», monta dos instancias separadas con su respectivo `trigger`.

---

## 6. Dinero en centavos COP (`Int`) y fechas en `America/Bogota`

### Dinero siempre en centavos COP enteros (`lib/money.ts` y `lib/format.ts`)

- **Prohibición total de floats monetarios:** todo precio unitario, escala mayorista, descuento, flete, comisión y reembolso se almacena en PostgreSQL como `INT4` (`Int` en Prisma) representando **centavos enteros de peso colombiano**:
  - `$15.000 COP` → `1_500_000` centavos.
  - `$26.410,50 COP` (conciliación de comisión Wompi) → `2_641_050` centavos.
- **Guarda de rango `INT4` (`apps/web/lib/money.ts`):** el máximo de una columna `INT4` es `MAX_MONEY_CENTS = 2_147_483_647` (≈ `$21.474.836,47 COP`). Antes de insertar o actualizar montos calculados (cantidad × precio, subtotales B2B o cotizaciones), valida con `fitsMoneyInt4(cents)` para responder un error de validación amigable en vez de un crash SQL `integer out of range`.
- **Conversión, formateo y prorrateo exacto con `BigInt`:**
  - `pesosToCents(raw)` (`lib/format.ts`): convierte la entrada humana en pesos del operador a centavos enteros (`"15.000"` → `1500000`).
  - `formatCOP(centavos)`: formato comercial de vitrina y correos sin decimales (`"$ 15.000"`).
  - `formatCOPExact(centavos)`: formato financiero para conciliación cuando existen fracciones de peso (`"$ 26.410,50"`).
  - **Prorrateos sin coma flotante:** al repartir descuentos de cupones o Puntos Lucams entre líneas de un pedido (p. ej. en retractos parciales `features/retract/service.ts`), usa aritmética entera _half-up_ con `BigInt` para evitar errores de redondeo IEEE 754 y cualquier desbordamiento al multiplicar montos grandes:

```ts
import { fitsMoneyInt4, MAX_MONEY_CENTS } from "@/lib/money";
import { formatCOP, formatCOPExact, pesosToCents } from "@/lib/format";

/** División entera half-up (a * b / denom) sin floats ni overflow (features/retract/service.ts). */
export function roundMulDiv(a: number, b: number, denom: number): number {
  if (a <= 0 || b <= 0 || denom <= 0) return 0;
  const num = BigInt(a) * BigInt(b);
  const d = BigInt(denom);
  return Number((num + d / BigInt(2)) / d);
}

// Ejemplo: línea de $45.000 (4_500_000) sobre subtotal de $120.000 (12_000_000)
// con descuento total de $10.000 (1_000_000):
const shareCents = roundMulDiv(1_000_000, 4_500_000, 12_000_000); // 375_000 ($ 3.750)
if (!fitsMoneyInt4(shareCents)) {
  throw new Error(`El monto supera el límite permitido (${formatCOP(MAX_MONEY_CENTS)}).`);
}
```

### Fechas y horas obligatorias en `America/Bogota` (`lib/datetime.ts`, `ADR-194`)

Las funciones serverless en Vercel corren con reloj en `UTC`; formatear una fecha sin `timeZone: "America/Bogota"` desplaza +5 horas las compras hechas después de las `7:00 p. m.` de Colombia al día siguiente. Por ello, **toda fecha u hora visible para humanos en tienda, correos y `/admin` sale exclusivamente de `@/lib/datetime`**:

| Helper en `@/lib/datetime`  | Salida de ejemplo (`es-CO`, `UTC-5`) | Caso de uso canónico                                                      |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `formatDateCO(d)`           | `04 nov 2026`                        | Tablas de pedidos, listados y tarjetas compactas                          |
| `formatDateLongCO(d)`       | `4 de noviembre de 2026`             | Confirmaciones de pedido, documentos y certificados                       |
| `formatDateTimeCO(d)`       | `04 nov 2026, 8:22 p. m.`            | Timelines de estado, auditoría admin y detalle de orden                   |
| `formatDateTimeLongCO(d)`   | `4 de noviembre de 2026, 8:22 p. m.` | Encabezados detallados de tickets PQR, retractos y garantías              |
| `formatDateTimeNoYearCO(d)` | `04 nov, 8:22 p. m.`                 | Eventos recientes del año en curso (`ShipmentEvent`, logs)                |
| `formatMonthYearCO(d)`      | `noviembre de 2026`                  | Cohortes RFM/LTV y agrupaciones mensuales en `/admin/metricas`            |
| `formatDayMonthCO(d)`       | `4 nov`                              | Chips de vigencia de cupones y badges breves                              |
| `formatTimeCO(d)`           | `8:22 p. m.`                         | Actividad ocurrida hoy en `/admin/hoy`                                    |
| `formatIsoDateCO(d)`        | `2026-11-04`                         | Atributo `value` de `<input type="date">` y llaves diarias en hora Bogotá |

- **Gate automático en Vitest (`apps/web/lib/datetime-convention.test.ts`):** escanea recursivamente todos los `.ts` y `.tsx` de `apps/web/app/` y `apps/web/components/` y **falla el PR** con la lista exacta de archivos infractores si detecta `new Intl.DateTimeFormat(`, `.toLocaleDateString(` o `.toLocaleTimeString(`.
- **Tiempo relativo y calendario hábil colombiano:** para etiquetas relativas breves («hace 5 min», «ayer») usa `formatRelativeTime` de `@/lib/format`; para cómputo de días hábiles, festivos de Colombia (incluida la Ley 2578) y SLAs legales de retracto, garantía y PQR, usa `apps/web/lib/colombian-sla.ts`.

---

## 7. Errores estándar RFC 7807, sanitización, logging y resiliencia HTTP

### Contrato HTTP Problem Details (`apps/web/lib/errors.ts`)

Todos los Route Handlers en `apps/web/app/api/**` devuelven errores estructurados conforme a **[RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807)** (`Content-Type: application/problem+json` + cabecera `X-Request-Id`) mediante `AppError` y `problemResponse(err, requestId)`:

```ts
// apps/web/lib/errors.ts — contrato real
export type ProblemSlug =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "unprocessable"
  | "too-many-requests"
  | "internal-error";

export type ProblemDetails = {
  type: string; // https://lucamsshop.com/problems/<slug>
  title: string; // Resumen corto en español sin PII
  status: number; // Código HTTP (400..500)
  detail?: string; // Explicación específica segura para el cliente
  instance?: string; // URI opcional de la ocurrencia
  requestId?: string; // UUID v4 correlacionado con X-Request-Id y logs
  errors?: Record<string, string[]>; // Errores por campo (z.flattenError en Zod v4)
};
```

```json
// Ejemplo real de respuesta 400 application/problem+json
{
  "type": "https://lucamsshop.com/problems/validation",
  "title": "Datos de entrada inválidos",
  "status": 400,
  "detail": "Uno o más campos no cumplen el formato requerido.",
  "requestId": "6c84fb90-12c4-11e1-840d-7b25c5ee775a",
  "errors": {
    "email": ["Ingresa un correo electrónico válido."]
  }
}
```

### Catálogo de tipos `https://lucamsshop.com/problems/<slug>`

| Slug (`ProblemSlug`) | HTTP  | Clase / origen                    | Cuándo utilizarlo                                                              |
| -------------------- | ----- | --------------------------------- | ------------------------------------------------------------------------------ |
| `validation`         | `400` | `ValidationError(zodErr)`         | Body, query params o payload no superan `Schema.safeParse`                     |
| `unauthorized`       | `401` | `ProblemDetails` / guard HTTP     | Falta sesión válida, token expirado o `IDLE_EXPIRED`                           |
| `forbidden`          | `403` | `verifyAdminRouteAccess`          | Autenticado pero sin capacidad RBAC, sin TOTP enrolado o sin `aal2`            |
| `not-found`          | `404` | `NotFoundError(resource)`         | Recurso inexistente, inactivo o soft-deleted (y anti-IDOR cuando aplica)       |
| `conflict`           | `409` | `ProblemDetails` de dominio       | Colisión de revisión optimista (`STALE_REVISION`), stock agotado o duplicado   |
| `unprocessable`      | `422` | `ProblemDetails` de dominio       | Regla semántica o transición de estado inválida para la entidad                |
| `too-many-requests`  | `429` | `rateLimit` (`lib/rate-limit.ts`) | Cuota excedida en `rate_limit_buckets` (acompañar con `Retry-After` si aplica) |
| `internal-error`     | `500` | `InternalError(detail)`           | Falla inesperada capturada en frontera con `requestId` para soporte            |

> **Excepción deliberada en webhooks (`/api/webhooks/{wompi,aveonline,resend}`):** si falla la verificación criptográfica de firma (`WOMPI_EVENTS_SECRET`, `svix-signature` o `x-aveonline-secret`), el endpoint responde `401` plano sin cuerpo `ProblemDetails` para no dar oráculos de validación a un atacante.

### Sanitización obligatoria de errores de Prisma y de terceros

1. **Prisma y base de datos:** jamás devuelvas `err.message` de `PrismaClientKnownRequestError` al navegador (filtra estructura SQL y valores). Captura códigos esperados (`err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"`) en `service.ts` y tradúcelos a errores de dominio claros (p. ej. `STOCK_UNAVAILABLE` indicando el nombre comercial del producto agotado, `ADR-174`).
2. **Aveonline (`apps/web/features/orders/shipment-error.ts`):** cuando falla `createShipment`, la saga construye un resumen libre de PII con `buildShipmentLastError` (`scrubPii(raw).slice(0, 500)`, guardando solo `city`/`department` sin dirección ni teléfono) en `Order.shipmentLastError`. En `/admin/pedidos/[number]`, se lee con `parseShipmentLastError` y se acompaña de diagnóstico accionable mediante `suggestShipmentFailureCause` (distinguiendo timeouts `> 20 s` donde hay que verificar primero en Aveonline para no duplicar guía, pesos mínimos de transportadora, destinos sin cobertura o datos de empaque faltantes — [`integrations/aveonline.md`](integrations/aveonline.md)).
3. **Wompi y pasarela:** los motivos técnicos de rechazo bancario se normalizan a estados y mensajes seguros para el comprador; el payload completo queda únicamente en `WebhookEvent` / `WompiPaymentAttempt` bajo acceso administrativo ([`integrations/wompi.md`](integrations/wompi.md)).

### Logging estructurado (`lib/logger.ts`) y resiliencia HTTP saliente

- **Logger JSON sobre `console` nativo (`apps/web/lib/logger.ts`):** compatible con Turbopack de Next 16 y parseado automáticamente por Vercel. Siempre registra un objeto estructurado con `event`, nunca strings concatenados:
  ```ts
  logger.info({ event: "order.paid", orderId, requestId });
  ```
  El logger redacta automáticamente a `[REDACTED]` cualquier clave sensible (`password`, `token`, `secret`, `key`, `cookie`, `authorization`, `email`, `phone`, `document`), y `captureServerError` (`lib/error-capture.ts`) aplica `scrubPii` sobre mensajes y stacks antes de persistir en `ErrorLog` / `ErrorReport`.
- **Llamadas HTTP externas siempre protegidas (`fetchWithTimeout` + `withRetry` + `CircuitBreaker`):** está prohibido llamar `fetch()` sin timeout hacia proveedores externos. El retry envuelve por fuera al circuit breaker (`withRetry(() => cb.exec(() => fetchWithTimeout(...)))`) sin reintentar jamás `4xx` (salvo `408` y `429`):

| Integración / operación                        | Timeout (`fetchWithTimeout`) | Reintentos (`withRetry`)                        | Circuit Breaker (`lib/circuit-breaker.ts`)             |
| ---------------------------------------------- | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Wompi `GET /v1/transactions/<id>`              | `5 000 ms`                   | Sí (backoff exponencial + jitter)               | `wompiCB` (`threshold: 5`, `resetMs: 30_000`)          |
| Aveonline `cotizarDoble` (cotización checkout) | `15 000 ms`                  | `2` intentos (`ADR-053`)                        | `aveonlineQuoteCB` (`threshold: 5`, `resetMs: 30_000`) |
| Aveonline `generarGuia2` (creación de guía)    | `20 000 ms`                  | **No reintentable** automáticamente (`ADR-048`) | `aveonlineCB` (`threshold: 5`, `resetMs: 30_000`)      |
| Google Gemini `generateContent` (`v1beta`)     | `12 000 ms`                  | Fallback a modelo secundario                    | Por proveedor en `features/ai/gemini-provider.ts`      |
| Resend `POST /emails`                          | `15 000 ms`                  | Manejado por sello idempotente / saga           | Kill-switch `EMAIL_SEND_DISABLED=1` en pruebas         |

---

## 8. Procesamiento seguro de imágenes server-side (`sharp-safe.ts`)

1. **Versión única fijada en todo el workspace (`LUC-SEC-011`):** `sharp` está anclado exactamente en **`0.35.5`** tanto en dependencias como en `overrides` de `pnpm-workspace.yaml`, incorporando los parches de seguridad de `libvips` y `librsvg`.
2. **Puerta de entrada única (`apps/web/features/personalization/sharp-safe.ts`):**
   - Está **prohibido** escribir `import sharp from "sharp"` en cualquier archivo de runtime de `apps/web` (la regla `no-restricted-imports` de `apps/web/eslint.config.mjs` rompe `pnpm lint`).
   - Importa siempre desde `@/features/personalization/sharp-safe`, que al inicializarse desactiva como defensa en profundidad los decodificadores que la tienda no admite (`VipsForeignLoadNsgif`, `VipsForeignLoadTiff`, `VipsForeignLoadVips`).
3. **Presupuesto estricto de píxeles en buffers no confiables (`LUC-SEC-005`):** todo buffer recibido desde el cliente debe abrirse pasando límites explícitos contra bombas de descompresión antes de leer metadatos o redimensionar ([`domains/studio-and-production.md`](domains/studio-and-production.md)):

```ts
// Patrón obligatorio al procesar buffers de imagen en el servidor
import sharp, { type ResizeOptions } from "@/features/personalization/sharp-safe";

const SAFE_DECODE_LIMITS = {
  limitInputPixels: 25_000_000, // Máx. 25 MP en previews / normalización de entrada
  limitInputChannels: 4,
  pages: 1, // Ignora frames múltiples
  failOn: "warning" as const,
};

export async function buildCanvasDerivative(input: Buffer, resize: ResizeOptions): Promise<Buffer> {
  return sharp(input, SAFE_DECODE_LIMITS)
    .rotate() // Respeta orientación EXIF de cámaras móviles
    .resize({ ...resize, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}
```

---

## 9. CMS v2 de 3 capas y sincronización del paquete legal

### Arquitectura de las 3 capas (`ADR-187`)

| Capa                                                     | Propósito y alcance                                                                                                                                                    | Dónde vive y cómo se gobierna                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capa 1 — Parámetros maestros y ley**                   | Settings globales `UPPER_SNAKE_CASE` (correos, tiempos de despacho, cobertura, versión legal), garantía por producto y plazos normativos interpolados con `{{tokens}}` | Configuración global (`SUPERADMIN`), `/admin/{envios,fidelizacion,carritos}` + `apps/web/lib/consumer-law.ts` y `apps/web/lib/cms-tokens.ts` |
| **Capa 2 — Contenido editorial, comercial, SEO y legal** | **9 contenedores, 29 secciones y 166 campos** (`105 BLOCK` con flujo borrador/publicación/programación + `61 SETTING` de aplicación inmediata) y listas `CmsListItem`  | `/admin/contenido` definido declarativamente en `packages/db/scripts/cms-site-map.mjs` (más las 32 plantillas en `/admin/email-templates`)   |
| **Capa 3 — Micro-UI funcional**                          | Labels de botones, `aria-label`, `placeholder`, mensajes de validación Zod y textos interactivos de Estudio, Auth, Checkout y Mi Cuenta                                | Tipados directamente en código (`studio-texts.ts`, `auth-texts.ts`, `account-texts.ts`) — **prohibido crear claves CMS para micro-UI**       |

> **Allowlist fail-closed en `/api/cms/settings`:** `PUBLIC_SETTING_KEYS` en `apps/web/lib/cms.ts` expone al navegador únicamente las claves públicas explícitamente autorizadas; ajustes internos como `PICKUP_*`, `BUSINESS_NIT`, `ALERT_EMAIL` o `PRIVACY_POLICY_VERSION` jamás salen por HTTP público.

### Guía paso a paso para agregar o modificar un campo del CMS

1. **Paso 1 — Declarar el campo en `packages/db/scripts/cms-site-map.mjs`:** ubícalo dentro de su `page` y `section` con `key` única (`pagina.seccion.campo` para `BLOCK` o `UPPER_SNAKE_CASE` para `SETTING`), `label` y `helpText` claros para operación no técnica, y `body` **idéntico carácter por carácter** al `fallback` del código:
   ```js
   // packages/db/scripts/cms-site-map.mjs
   {
     key: "home.hero.badge",
     kind: "BLOCK",
     type: "TEXT",
     label: "Badge sobre el título",
     helpText: "Aparece arriba del título principal de la portada.",
     category: "HOME",
     body: "✨ Hecho a mano en Bogotá",
     sortOrder: 10,
   }
   ```
   - Para listas editables por filas (`type: "LIST"`), define `metadata: { listSchema: [...] }` y `defaultListItems`.
   - Para imágenes (`type: "IMAGE"`), el valor almacena `CmsMedia.id` en el bucket `cms-media` con texto `alt` obligatorio (WCAG 1.1.1).
2. **Paso 2 — Consumir en `apps/web` con `fallback` literal exacto (`apps/web/lib/cms.ts`):**
   ```tsx
   // En JSX de un Server Component (resuelve automáticamente {{tokens}})
   import { CmsText } from "@/components/cms/cms-text";
   import { DesignUnitsBadge } from "@/components/design-units-badge";

   // Regla de oro: el fallback coincide exactamente con body en cms-site-map.mjs.
   // Los contadores dinámicos ({count}) van SIEMPRE fuera de <CmsText> (ADR-150):
   <span className="badge">
     <CmsText blockKey="home.hero.badge" fallback="✨ Hecho a mano en Bogotá" />
   </span>

   <DesignUnitsBadge
     count={item.design.previewPagesCount}
     label={<CmsText blockKey="cart.item.units_label" fallback="unidades" />}
   />
   ```
   Para metadatos SEO de páginas estáticas, usa `getPageSeo("seo.page.<slug>", { title, description })` de `@/lib/cms-tokens`.
3. **Paso 3 — Verificar paridad AST (`166/166`):** ejecuta **`make audit-content`** (`apps/web/lib/cms-sitemap-parity.test.ts`). El test analiza el AST TypeScript de `apps/web` y falla si una clave se lee sin existir en `SITE_MAP` o si se declara en `SITE_MAP` sin lector en `apps/web` (única excepción legacy de solo lectura: `LUCAMS_SHIPPING_LOCALITIES`).
4. **Paso 4 — Sincronizar base de datos e invalidar caché:** ejecuta `make migrate-cms-v2` (upsert aditivo que nunca pisa ediciones publicadas en DB) o `node scripts/sync-and-prune-cms-v2.mjs --apply` cuando también retiras claves obsoletas. Si corriste scripts directos contra una base remota, pulsa «Actualizar caché de contenido» en `/admin/contenido` ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

### Sincronización obligatoria de los 8 documentos legales (`ADR-080`)

Los **8 documentos legales públicos** (`terminos`, `devoluciones`, `garantias`, `privacidad`, `habeas-data`, `subprocesadores`, `cookies`, `security`) operan hoy en **Versión 3 (`2026-11-05`)**. Su fuente canónica vive en `packages/db/legal-content/legal.<doc>.md` y cada página `apps/web/app/legal/<doc>/page.tsx` mantiene una copia exacta en `const FALLBACK` para garantizar información veraz (Ley 1480 arts. 23 y 29) incluso ante caída total de la base de datos.

**Tokens obligatorios en textos legales (`apps/web/lib/cms-tokens.ts` — prohibido escribir correos o plazos fijos literales):**

| Token en Markdown y `FALLBACK`                                 | Origen de resolución                                  | Valor canónico actual                      |
| -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| `{{email_contacto}}`                                           | Setting `CONTACT_EMAIL`                               | `hola@lucamsshop.com`                      |
| `{{email_habeas_data}}`                                        | Setting `HABEAS_DATA_EMAIL`                           | `habeas-data@lucamsshop.com`               |
| `{{email_retracto}}`                                           | Setting `RETRACTO_EMAIL`                              | `retracto@lucamsshop.com`                  |
| `{{email_security}}`                                           | Setting `SECURITY_EMAIL`                              | `security@lucamsshop.com`                  |
| `{{garantia_base}}`                                            | `DEFAULT_CATALOG_WARRANTY_MONTHS` (`consumer-law.ts`) | `1 mes` (salvo término mayor por producto) |
| `{{garantia_respuesta_dias}}`                                  | `WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS`               | `15` (días hábiles)                        |
| `{{retracto_dias}}`                                            | `RETRACT_WINDOW_BUSINESS_DAYS`                        | `5` (días hábiles, Ley 1480 art. 47)       |
| `{{retracto_reembolso_dias}}`                                  | `RETRACT_REFUND_MAX_CALENDAR_DAYS`                    | `15` (días calendario, Ley 2439)           |
| `{{entrega_max_legal_dias}}`                                   | `MAX_LEGAL_DELIVERY_CALENDAR_DAYS`                    | `30` (días calendario)                     |
| `{{habeas_consulta_dias}}` / `{{habeas_reclamo_dias}}`         | `HABEAS_DATA_*_BUSINESS_DAYS`                         | `10` / `15` (días hábiles, Ley 1581)       |
| `{{fab}}`, `{{entrega}}`, `{{cobertura}}`, `{{cutoff_lucams}}` | Settings operativos de despacho                       | `2`, `2 a 5`, `1.100+`, `12`               |

**Procedimiento exacto al editar cualquier documento legal:**

1. Edita primero `packages/db/legal-content/legal.<doc>.md` empleando los `{{tokens}}` de la tabla anterior.
2. Ejecuta **`pnpm format`** antes de copiar: Prettier realinea tablas Markdown en el `.md`, pero no toca el interior del template literal TS; copiar antes de formatear rompe la paridad.
3. Copia el contenido ya formateado dentro de ``const FALLBACK = `\n...\n`;`` en `apps/web/app/legal/<doc>/page.tsx`, escapando únicamente `` \` `` y `\${` cuando aparezcan en el Markdown (como ocurre en `cookies` y `security`).
4. Si cambia la versión del paquete legal, actualiza el pie `_Versión N · vigente desde YYYY-MM-DD_` en los 8 archivos, `components/legal/legal-page-header.tsx`, `PRIVACY_POLICY_VERSION` en `cms-site-map.mjs`, [`STATE.md`](STATE.md) y [`COMPLIANCE.md`](COMPLIANCE.md).
5. Ejecuta `pnpm --filter web exec vitest run app/legal/legal-content-sync.test.ts` y verifica `0` diferencias.

```tsx
// apps/web/app/legal/terminos/page.tsx — estructura canónica de página legal
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

const FALLBACK = `
Al comprar en **lucamsshop.com** aceptas estos Términos y Condiciones...
- Correo de contacto: **{{email_contacto}}**
...
_Versión 3 · vigente desde 2026-11-05_
`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.terminos.heading" defaultTitle="Términos y Condiciones" />
      <CmsMarkdown blockKey="legal.terminos" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
```

---

## 10. Base de datos, idempotencia, patrón Saga y migraciones duales

### Reglas de modelado, `onDelete` explícito, soft-delete e índices

1. **`onDelete` explícito en el 100 % de las relaciones (`packages/db/prisma/schema.prisma`):**
   - `onDelete: Cascade` para hijos que carecen de sentido sin su padre (`OrderItem → Order`, `CartItem → Cart`, `Address → Customer`).
   - `onDelete: SetNull` para conservar trazabilidad contable y estadística sin PII tras la supresión de cuenta Ley 1581 (`Order.customerId`, `Order.contactId`, `Review.customerId`, `LoyaltyTxn.customerId`).
   - `onDelete: Restrict` para impedir borrar entidades maestras con historial financiero o de inventario (`OrderItem.variantId → ProductVariant`, `InventoryLog.variantId → ProductVariant`).
2. **Soft-delete, campos de auditoría y supresión Ley 1581:**
   - Usa `deletedAt: DateTime?` (+ `deletedBy: String?`, `createdBy: String?`, `updatedBy: String?`) para borrado lógico y filtra siempre `deletedAt: null` en lecturas activas. Reserva `isActive: Boolean` exclusivamente para visibilidad comercial publicado/oculto.
   - En baja de cuenta (`features/account/delete-service.ts`), anonimiza PII en `Customer`, `Contact` y `Address`, revoca `ContactIdentity` y elimina el usuario en Supabase Auth preservando los registros contables de `Order`.
3. **Estrategia de indexación:**
   - Índices compuestos frecuentes en `schema.prisma` (`@@index([customerId, deletedAt])`, `@@index([status, createdAt])`, `@@index([cartId, status])`).
   - Índices GIN trigram (`pg_trgm` + `public.immutable_unaccent(lower(...))`) e índices parciales únicos en `supabase/migrations/` o migraciones SQL con `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, asegurando coincidencia estructural exacta con el predicado de `apps/web/lib/catalog.ts`.
4. **Retención automatizada de datos (`pg_cron` → `/api/cron/*` y funciones SQL):** `EmailEvent` y `WebhookEvent` se purgan a los **180 días**; `ErrorLog`, `ErrorReport` (por `lastSeenAt`), borradores inactivos de clientes, activos de pedidos `DELIVERED` (sin retracto/garantía abierta) y cotizaciones cerradas a los **90 días**; diseños anónimos abandonados a los **30 días**; y `rate_limit_buckets` a los **7 días** ([`integrations/supabase.md`](integrations/supabase.md)).

### Matriz de idempotencia en PostgreSQL y patrón Saga (`features/orders/saga.ts`)

| Flujo crítico                           | Ancla de idempotencia en PostgreSQL                                                               | Comportamiento ante reintento o concurrencia                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Webhooks Wompi / Aveonline / Resend     | `WebhookEvent @@unique([source, externalId])`                                                     | Deduplicación física (`P2002` = evento ya procesado → respuesta `200` no-op)      |
| Clave `externalId` de Wompi y Aveonline | `txId-status-timestamp` (firmado) y `guia-status-(timestamp\|"no-ts")`                            | Cubre reintentos a 30 min / 3 h / 24 h y payloads de transportadora sin fecha     |
| Webhook de Resend (`EmailEvent`)        | `upsert` con protección de estados terminales                                                     | Eventos reordenados jamás pisan una supresión previa por `bounced` o `complained` |
| Checkout (`Cart` → `Order`)             | `Order.cartId` con búsqueda `PENDING_PAYMENT` viva                                                | Doble clic en «Pagar» reutiliza la misma orden sin duplicar pedido                |
| Ledger de intentos Wompi                | `WompiPaymentAttempt` con referencia UUID por intento                                             | Reconcilia contra Wompi antes de reutilizar o rotar referencia                    |
| Descuento y reversión de stock          | `UPDATE ... WHERE stock >= qty` + índice parcial único `InventoryLog(orderId, reason, variantId)` | Imposible descontar o revertir dos veces la misma variante para una orden         |
| Generación de guía en Aveonline         | Claim atómico `Order.shipmentClaimedAt` (`updateMany` si `null` o vencido > 10 min)               | Impide emitir dos guías concurrentes para el mismo pedido                         |
| Correos transaccionales de orden        | Sellos `Order.confirmationSentAt` y `Order.reviewRequestedAt`                                     | Reintentar la saga envía solo correos pendientes sin duplicar los ya emitidos     |
| Límite de cupón por cliente             | Trigger SQL `coupon_usage_per_customer_limit` con `pg_advisory_xact_lock`                         | Serializa checkouts simultáneos de la misma identidad sobre el mismo cupón        |

**Orquestación en `processPaidOrder` (`apps/web/features/orders/saga.ts`):**

1. **Transición a `PAID` y descuento atómico de stock:** guarda `wompiTransactionId` y ejecuta `decrementStockForOrder`. Si otra compra agotó la última unidad mientras el pago estaba en vuelo, hace rollback de la transición y persiste `needsReconciliation = true` sobre la orden (más alerta operativa en `/admin`) para reembolso o producción manual sin perder jamás el rastro del cobro.
2. **Emisión de guía protegida por claim (`shipmentClaimedAt`):** para transportadoras nacionales invoca Aveonline (`createShipment`), archiva copia propia del PDF en Storage (`labelPath`) y avanza a `FULFILLING`; para Bogotá directa asigna `LUCAMS`. Si Aveonline falla o vence el timeout de `20 s`, la orden **permanece en `PAID`** (jamás se revierte un cobro aprobado), persiste `shipmentLastError` sanitizado y habilita reintento manual desde `/admin/pedidos/[number]`.
3. **Efectos laterales idempotentes post-pago:** envía `sendOrderConfirmationOnce` y `notifyNewOrderToAdmin`, acredita Puntos Lucams (`awardLoyaltyPointsForPaidOrder`), liquida recompensas de referido en primera compra (`issueReferralRewardsIfFirstPaidOrder`) y limpia el carrito (`clearCartAfterPaid`).

### Estrategia _expand-then-contract_ (`ADR-105`) y migraciones duales obligatorias

`vercel rollback` revierte instantáneamente el código desplegado pero **no revierte PostgreSQL**. Por eso, toda evolución destructiva de esquema se divide en cuatro despliegues independientes:

1. **R1 — Expand:** agrega columnas nuevas como `NULL` (o con `DEFAULT` seguro) y tablas/índices nuevos (`CREATE INDEX CONCURRENTLY`). Añade FKs y CHECK constraints sobre tablas con tráfico usando `NOT VALID` seguido de `VALIDATE CONSTRAINT`.
2. **R2 — Migrate (Backfill):** pobla datos históricos con un script idempotente en `packages/db/scripts/` (`--dry-run` → `--apply`).
3. **R3 — Cutover:** el código pasa a leer y escribir las columnas nuevas manteniendo compatibilidad con un eventual rollback a R2.
4. **R4 — Contract:** elimina columnas o tablas obsoletas en una release posterior una vez estabilizada R3 en producción.

**Regla de migraciones duales (Prisma + espejo SQL en `supabase/migrations/`):**

Cada vez que creas una tabla o modificas permisos/índices SQL debes commitear en el mismo PR:

1. La migración de dominio en `packages/db/prisma/migrations/YYYYMMDDHHMMSS_<slug>/migration.sql` (`pnpm --filter @lucams/db db:migrate`).
2. La migración espejo **idempotente** en `supabase/migrations/000000000000NN_<slug>.sql` declarando explícitamente RLS, `REVOKE` y políticas (además del respaldo automático en DDL-time que provee el event trigger `enforce_rls_on_new_table_trg` de `00000000000049_enforce_revoke_on_new_tables.sql`):

```sql
-- supabase/migrations/000000000000NN_example_feature_rls.sql (idempotente)
ALTER TABLE public."ExampleEntity" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."ExampleEntity" FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public."ExampleEntity" FROM service_role;

-- Si la tabla requiere política explícita de lectura o aislamiento, siempre DROP IF EXISTS antes:
DROP POLICY IF EXISTS "example_entity_deny_public" ON public."ExampleEntity";
CREATE POLICY "example_entity_deny_public"
  ON public."ExampleEntity"
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
```

3. Antes de abrir PR, certifica localmente **`make verify-db`** (`audit-schema-drift.mjs check` + `verify-security-posture.mjs`) y **`make test-rls`** ([`TESTING.md`](TESTING.md)).

---

## 11. Guardas obligatorias en scripts (`packages/db/scripts/`)

Todo script `.mjs` en `packages/db/scripts/` que ejecute mutaciones (`prisma.<modelo>.create|update|delete|upsert|createMany|updateMany|deleteMany`, `$executeRaw` o `auth.admin.*`) está auditado en cada PR por **`make audit-script-guards`** (`packages/db/scripts/lib/check-script-guards.mjs`) y debe cumplir cinco reglas estrictas:

1. **Inyección explícita del entorno:** los scripts no cargan `.env` implícitos; se ejecutan desde `packages/db` con `dotenv-cli` explícito (`cd packages/db && npx dotenv -e ../../.env.local -- node scripts/<nombre>.mjs` o `../../.env.stg`).
2. **Modo `--dry-run` por defecto:** invocar el script sin banderas solo inspecciona e imprime el plan de cambios; escribir exige pasar **`--apply`** (y `--prune` si además elimina registros huérfanos).
3. **Guarda fail-closed obligatoria (`./lib/env-guard.mjs`):** invoca `assertDestructiveAllowed("<script>.mjs")` **antes** de instanciar `PrismaClient` o abrir conexiones. Esta guarda permite únicamente hosts locales (`127.0.0.1`, `localhost`, `::1`, `host.docker.internal`) y Staging (`mjbdiqdkykhsixvqlrrp`), bloqueando por defecto Producción (`zxkucphbsfygakgxcnik`), cualquier otro proyecto Supabase, hosts remotos ajenos (`other`) y URLs malformadas (`unknown`). Solo operaciones autorizadas de sincronización hacia PRD cruzan la barrera anteponiendo `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`.
4. **Confirmación humana por TTY en scripts _break-glass_ (`./lib/confirm-target.mjs`):** scripts sensibles de identidad/seguridad (`seed-admin.mjs`, `admin-mfa-reset.mjs`) invocan además `await confirmTargetInteractive(scriptName, descripcion)` en modo `--apply`, exigiendo terminal interactiva (`process.stdin.isTTY`) y que el operador escriba el hostname exacto del destino.
5. **Desconexión limpia y código de salida explícito:** cierra siempre `await prisma.$disconnect()` en un bloque `finally`.

```js
// packages/db/scripts/example-backfill.mjs — plantilla canónica que pasa make audit-script-guards
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";
import { confirmTargetInteractive } from "./lib/confirm-target.mjs";

const SCRIPT_NAME = "example-backfill.mjs";
const APPLY = process.argv.includes("--apply");

// 1) Guarda fail-closed ANTES de crear PrismaClient (bloquea PRD y remotos desconocidos)
assertDestructiveAllowed(SCRIPT_NAME);

const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.contact.count({ where: { normalizedEmail: null } });
  console.log(
    `[${SCRIPT_NAME}] Registros pendientes: ${pending} (modo: ${APPLY ? "APPLY" : "DRY-RUN"})`,
  );

  if (!APPLY || pending === 0) {
    if (!APPLY) console.log("Ejecuta con --apply para persistir los cambios.");
    return;
  }

  // 2) En operaciones sensibles/break-glass, exigir confirmación interactiva del host exacto
  await confirmTargetInteractive(
    SCRIPT_NAME,
    `Actualizar ${pending} contactos sin email normalizado`,
  );

  await prisma.$transaction(async (tx) => {
    // ... mutaciones idempotentes ...
    void tx;
  });
}

main()
  .catch((err) => {
    console.error(`[${SCRIPT_NAME}] Error:`, err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## 12. Calidad estática, ESLint, Prettier, `gitleaks` y flujo Git

### Reglas de calidad estática y secretos

- **TypeScript estricto (`strict: true`) y cero `any`:** usa `unknown` + _type narrowing_ o validación con Zod v4.
- **ESLint 9 flat config (`apps/web/eslint.config.mjs`) con `--max-warnings 0`:**
  - Extiende `eslint-config-next/core-web-vitals` y `eslint-config-next/typescript`.
  - Variables o parámetros intencionalmente descartados se prefijan con guion bajo (`_prev`, `_req`).
  - Bloquea con error la lectura directa de cabeceras `x-forwarded-for` / `x-real-ip` / `x-vercel-forwarded-for` fuera de `lib/client-ip.ts`.
  - Bloquea con error `import ... from "sharp"` fuera de `features/personalization/sharp-safe.ts` (salvo archivos de test).
- **Prettier (`pnpm format` / `pnpm format:check`):** formatea código y documentación (`**/*.{ts,tsx,md,json}`) incluyendo ordenamiento de clases Tailwind v4 (`prettier-plugin-tailwindcss`).
- **Escaneo de secretos con `gitleaks`:** activa una vez por clon el hook local versionado con:
  ```bash
  git config core.hooksPath scripts/git-hooks
  ```
  El hook `scripts/git-hooks/pre-commit` ejecuta `gitleaks git --staged --config .gitleaks.toml .` antes de cada commit, respaldado de forma obligatoria en remoto por GitHub Push Protection y el check `Gitleaks secret scan` de CI.
- **Higiene del árbol de trabajo:** `tmp/` es scratch local gitignored (nunca se lee como fuente de verdad ni se versiona; límpialo al cerrar diagnósticos con `make clean-tmp`). Está prohibido versionar capturas sueltas, volcados SQL o scripts temporales.

### Flujo Git, ramas protegidas y Conventional Commits

- **Topología de ramas (`ADR-101`):** solo existen dos ramas permanentes: **`develop`** (despliega Staging) y **`production`** (despliega Producción en `lucamsshop.com`). La rama `main` no existe ([`OPERATIONS.md`](OPERATIONS.md)).
- **Ramas blindadas (`protect-ramas-criticas`, `id: 26248226`):** tanto `develop` como `production` tienen `bypass_actors: []` y `strict: true` ([`integrations/github-and-ops.md`](integrations/github-and-ops.md)). Está bloqueado el push directo, el `force-push` y el borrado; todo cambio entra exclusivamente por Pull Request al día con los **5 checks obligatorios de `ci.yml` en verde** ([`TESTING.md`](TESTING.md)).
- **Ciclo estándar de entrega:**
  ```bash
  # 1. Crear rama efímera desde develop actualizado
  git checkout develop && git pull --ff-only
  git checkout -b feat/short-english-slug

  # 2. Validar todos los gates estáticos y suites locales antes de pushear
  make check && pnpm test
  # (Si tocaste rutas, layouts, next.config.ts o proxy.ts, corre además: pnpm build)

  # 3. Commits atómicos siguiendo Conventional Commits en inglés
  #    Prefijos válidos: feat:, fix:, docs:, chore:, refactor:, test:
  git commit -m "feat(shipping): add carrier min-weight hint in admin order detail"

  # 4. Publicar rama, abrir PR hacia develop y vigilar CI hasta ver los 5 checks en verde
  git push -u origin feat/short-english-slug
  gh pr create --base develop
  gh pr checks --watch
  ```
- Una vez fusionado el PR en `develop`, la rama de trabajo se elimina el mismo día. Para promover a producción, se homologa en Staging y se abre un PR de release `develop → production`, verificado automáticamente al terminar el despliegue por `post-deploy-smoke.yml`.
