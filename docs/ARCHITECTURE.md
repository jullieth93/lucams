# Arquitectura — Lucams_shop

## Visión general

Aplicación monolítica modular en **Next.js 15 (App Router)** desplegada en Vercel, con backend serverless integrado, persistencia en **Supabase Postgres** vía **Prisma**, autenticación con **Supabase Auth**, almacenamiento de imágenes en **Supabase Storage**, e integraciones externas con Wompi (pagos), Aveonline (logística) y Claude API (IA).

```
┌──────────────────────────────────────────────────────────────────┐
│                         Vercel (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Storefront  │  │  Admin Panel │  │   API Routes         │  │
│  │  (RSC + ISR) │  │  (RBAC)      │  │   (webhooks, cart,   │  │
│  │              │  │              │  │    checkout, AI)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
   ┌──────────────────────────────────────────────────────┐
   │                     Supabase                          │
   │  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │
   │  │ Postgres   │  │   Auth     │  │   Storage      │ │
   │  │ (Prisma)   │  │ (RLS)      │  │ (firmadas)     │ │
   │  └────────────┘  └────────────┘  └────────────────┘ │
   └──────────────────────────────────────────────────────┘
          │                                    ▲
          ▼                                    │
   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
   │   Wompi      │  │  Aveonline   │  │  Claude API      │
   │ (pagos)      │  │ (logística)  │  │  (IA diseño)     │
   └──────────────┘  └──────────────┘  └──────────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │   Resend     │
                       │  (email)     │
                       └──────────────┘
```

## Estructura de carpetas

```
lucams_shop/
├── apps/
│   └── web/                              # Next.js 15 (App Router)
│       ├── app/
│       │   ├── (storefront)/             # Tienda pública
│       │   │   ├── layout.tsx            # Header + Footer + WhatsApp flotante
│       │   │   ├── page.tsx              # Home
│       │   │   ├── catalogo/
│       │   │   ├── categoria/[slug]/
│       │   │   ├── producto/[slug]/
│       │   │   ├── personalizar/[slug]/  # Estudio de personalización
│       │   │   ├── bundle/               # Bundle creator
│       │   │   ├── carrito/
│       │   │   ├── checkout/
│       │   │   ├── orden/[id]/
│       │   │   ├── cuenta/               # Mi cuenta (Supabase Auth)
│       │   │   ├── mayorista/            # Portal B2B
│       │   │   └── blog/[slug]/
│       │   ├── admin/                    # Backoffice
│       │   │   ├── layout.tsx            # Guard de auth + rol
│       │   │   ├── productos/
│       │   │   ├── inventario/
│       │   │   ├── ordenes/
│       │   │   ├── clientes/
│       │   │   ├── envios/
│       │   │   ├── cupones/
│       │   │   ├── reseñas/
│       │   │   ├── blog/
│       │   │   └── analytics/
│       │   └── api/
│       │       ├── wompi/webhook/route.ts
│       │       ├── checkout/create/route.ts
│       │       ├── shipping/quote/route.ts
│       │       ├── ai/design-suggest/route.ts
│       │       └── upload/sign/route.ts
│       ├── components/
│       │   ├── storefront/
│       │   ├── studio/                   # Editor react-konva
│       │   ├── preview3d/                # Three.js
│       │   └── admin/
│       ├── lib/
│       │   ├── supabase/
│       │   │   ├── server.ts             # Cliente con cookies (SSR)
│       │   │   ├── browser.ts            # Cliente con publishable key (rol Postgres `anon`)
│       │   │   └── service.ts            # Cliente con secret key (rol Postgres `service_role`, admin only)
│       │   ├── payment/
│       │   │   ├── types.ts              # Interface PaymentProvider
│       │   │   ├── wompi.ts              # WompiProvider
│       │   │   └── index.ts              # getProvider()
│       │   ├── whatsapp.ts
│       │   ├── ai.ts
│       │   ├── cart.ts                   # Zustand persistido
│       │   ├── i18n.ts
│       │   └── format.ts                 # formatCOP, fechas
│       ├── messages/                     # i18n
│       │   ├── es-CO.json
│       │   └── en.json
│       ├── middleware.ts                 # Auth guard /admin/*
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       └── package.json
├── packages/
│   ├── db/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── package.json
│   └── ui/                               # Componentes compartidos shadcn
│       └── package.json
├── supabase/
│   ├── migrations/                       # SQL adicional (RLS, funciones)
│   └── functions/                        # Edge functions (cron, webhooks alternos)
├── .github/workflows/
│   ├── ci.yml                            # typecheck + lint + tests
│   └── lighthouse.yml
├── docs/                                 # Documentación (este archivo entre otros)
├── README.md
├── CLAUDE.md
├── pnpm-workspace.yaml
└── package.json
```

**Monorepo con pnpm workspaces.** No usar Turborepo todavía (innecesario al inicio).

## Stack y versiones objetivo

| Capa            | Tecnología                    | Versión objetivo                                                                                          |
| --------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js                       | 22 LTS                                                                                                    |
| Package manager | pnpm                          | 9.x                                                                                                       |
| Framework       | Next.js                       | **16.x (App Router, RSC, Server Actions, Turbopack default)** — actualizado al hacer scaffolding (Fase 1) |
| Lenguaje        | TypeScript                    | 5.x estricto                                                                                              |
| UI              | Tailwind CSS                  | **4.x (sintaxis CSS-first con `@theme`)**                                                                 |
| Componentes     | shadcn/ui                     | latest (style `new-york`, soporte oficial v4)                                                             |
| Animaciones     | `tw-animate-css`              | latest (reemplaza `tailwindcss-animate` deprecado en v4)                                                  |
| Toast/notif     | `sonner`                      | latest (reemplaza `toast` deprecado en v4)                                                                |
| State (cliente) | Zustand                       | 5.x                                                                                                       |
| Validación      | Zod                           | 3.x                                                                                                       |
| ORM             | Prisma                        | 6.x                                                                                                       |
| DB              | Postgres                      | Supabase managed                                                                                          |
| Auth            | Supabase Auth                 | latest                                                                                                    |
| Editor canvas   | react-konva                   | 18.x                                                                                                      |
| 3D              | three.js + react-three-fiber  | latest                                                                                                    |
| Email           | Resend SDK                    | latest                                                                                                    |
| IA              | `@anthropic-ai/sdk`           | latest                                                                                                    |
| Tests unit      | Vitest                        | 2.x                                                                                                       |
| Tests E2E       | Playwright                    | latest                                                                                                    |
| Lint            | ESLint + `eslint-config-next` | latest                                                                                                    |
| Format          | Prettier                      | 3.x                                                                                                       |

## Modelo de datos (Prisma)

> **Nota:** el schema mostrado abajo es la base lógica del dominio. Cada modelo de dominio (no auxiliares de infra como `rate_limit_buckets`) además gana los **audit fields estándar** (`createdAt`, `updatedAt`, `createdBy?`, `updatedBy?`, `deletedAt?`, `deletedBy?`) per [`CONVENTIONS.md` § Soft delete + audit fields](./CONVENTIONS.md#db--soft-delete--audit-fields). Para no inflar el schema visual, esos campos no se repiten en cada modelo aquí — pero el repository llena `createdBy/updatedBy` automáticamente y los queries por defecto filtran `WHERE "deletedAt" IS NULL`.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // Para migraciones, sin pgBouncer (convención oficial Supabase+Prisma)
}

// ──────────────── IDENTIDAD ────────────────

model Customer {
  id              String   @id @default(cuid())
  email           String   @unique
  phone           String?
  firstName       String?
  lastName        String?
  supabaseUserId  String   @unique  // Vincula con auth.users
  loyaltyPoints   Int      @default(0)
  referralCode    String   @unique
  referredById    String?
  referredBy      Customer? @relation("Referrals", fields: [referredById], references: [id])
  referrals       Customer[] @relation("Referrals")
  addresses       Address[]
  orders          Order[]
  reviews         Review[]
  loyaltyTxns     LoyaltyTxn[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Address {
  id          String   @id @default(cuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  name        String
  line1       String
  line2       String?
  city        String
  department  String   // Departamento de Colombia
  zip         String?
  phone       String
  isDefault   Boolean  @default(false)
}

enum AdminRole {
  SUPERADMIN
  MANAGER
  FULFILLMENT
}

model AdminUser {
  id              String    @id @default(cuid())
  supabaseUserId  String    @unique
  email           String    @unique
  role            AdminRole
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
}

// ──────────────── CATÁLOGO ────────────────

model Category {
  id          String    @id @default(cuid())
  slug        String    @unique
  name        String
  description String?
  image       String?
  parentId    String?
  parent      Category? @relation("Subcategories", fields: [parentId], references: [id])
  children    Category[] @relation("Subcategories")
  products    Product[]
  order       Int       @default(0)
  isActive    Boolean   @default(true)
}

model Product {
  id                     String    @id @default(cuid())
  slug                   String    @unique
  name                   String
  description            String
  basePrice              Int       // En centavos COP
  compareAtPrice         Int?
  cost                   Int?
  sku                    String    @unique
  isPersonalizable       Boolean   @default(false)
  personalizationSchema  Json?     // Definición del editor (capas, plantillas)
  images                 String[]  // URLs de Supabase Storage
  categoryId             String
  category               Category  @relation(fields: [categoryId], references: [id])
  variants               ProductVariant[]
  reviews                Review[]
  isActive               Boolean   @default(true)
  isFeatured             Boolean   @default(false)
  seoTitle               String?
  seoDescription         String?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
}

model ProductVariant {
  id          String   @id @default(cuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  name        String   // ej. "10×15 cm, mate"
  sku         String   @unique
  price       Int?     // Override del basePrice
  stock       Int      @default(0)
  attributes  Json     // { size, finish, ... }
  inventoryLogs InventoryLog[]
  cartItems   CartItem[]
  orderItems  OrderItem[]
}

model InventoryLog {
  id        String         @id @default(cuid())
  variantId String
  variant   ProductVariant @relation(fields: [variantId], references: [id])
  delta     Int            // + o -
  reason    String         // "ORDER_PAID", "MANUAL_RESTOCK", "RETURN"
  orderId   String?
  createdAt DateTime       @default(now())
}

// ──────────────── CARRITO Y ÓRDENES ────────────────

model Cart {
  id          String     @id @default(cuid())
  customerId  String?
  sessionId   String     @unique
  currency    String     @default("COP")
  items       CartItem[]
  abandoned   AbandonedCart?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model CartItem {
  id            String         @id @default(cuid())
  cartId        String
  cart          Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variantId     String
  variant       ProductVariant @relation(fields: [variantId], references: [id])
  qty           Int
  customDesign  Json?          // Diseño del estudio de personalización
  unitPrice     Int            // Snapshot del precio al agregar
}

enum OrderStatus {
  DRAFT
  PENDING_PAYMENT
  PAID
  FULFILLING
  SHIPPED
  DELIVERED
  CANCELLED
  REFUNDED
}

enum PaymentMethod {
  WOMPI
  COD
}

model Order {
  id                  String        @id @default(cuid())
  number              String        @unique  // Human-readable: LCS-2026-0001
  customerId          String?
  customer            Customer?     @relation(fields: [customerId], references: [id])
  email               String
  phone               String
  shippingAddress     Json
  subtotal            Int
  discount            Int           @default(0)
  shipping            Int
  tax                 Int           @default(0)
  total               Int
  currency            String        @default("COP")
  status              OrderStatus   @default(DRAFT)
  paymentMethod       PaymentMethod
  wompiTransactionId  String?
  shippingCarrier     String?
  trackingNumber      String?
  trackingUrl         String?
  couponId            String?
  coupon              Coupon?       @relation(fields: [couponId], references: [id])
  notes               String?
  items               OrderItem[]
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
}

model OrderItem {
  id              String         @id @default(cuid())
  orderId         String
  order           Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variantId       String
  variant         ProductVariant @relation(fields: [variantId], references: [id])
  qty             Int
  unitPrice       Int
  customDesign    Json?
  designAssetUrl  String?        // PNG alta resolución para producción
}

enum CouponType {
  PERCENT
  FIXED
  FREE_SHIPPING
}

model Coupon {
  id         String     @id @default(cuid())
  code       String     @unique
  type       CouponType
  value      Int        // Porcentaje (1-100) o centavos COP
  minOrder   Int?
  maxUses    Int?
  usedCount  Int        @default(0)
  validFrom  DateTime
  validTo    DateTime
  isActive   Boolean    @default(true)
  orders     Order[]
}

model Review {
  id          String   @id @default(cuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])
  rating      Int      // 1-5
  comment     String
  images      String[] // URLs de Supabase Storage
  isApproved  Boolean  @default(false)
  createdAt   DateTime @default(now())
}

// ──────────────── MARKETING ────────────────

model AbandonedCart {
  id                  String    @id @default(cuid())
  cartId              String    @unique
  cart                Cart      @relation(fields: [cartId], references: [id])
  email               String
  lastReminderSentAt  DateTime?
  recoveredAt         DateTime?
  createdAt           DateTime  @default(now())
}

model LoyaltyTxn {
  id          String   @id @default(cuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])
  delta       Int
  reason      String   // "ORDER_PAID", "REVIEW_POSTED", "REFERRAL_CONVERTED"
  orderId     String?
  createdAt   DateTime @default(now())
}

model Referral {
  id            String    @id @default(cuid())
  referrerId    String
  referredEmail String
  status        String    // "PENDING", "REGISTERED", "CONVERTED"
  rewardedAt    DateTime?
  createdAt     DateTime  @default(now())
}

model BlogPost {
  id              String    @id @default(cuid())
  slug            String    @unique
  title           String
  content         String    // MDX
  coverImage      String?
  author          String
  publishedAt     DateTime?
  isPublished     Boolean   @default(false)
  seoTitle        String?
  seoDescription  String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

// ──────────────── IDEMPOTENCIA ────────────────

enum WebhookSource {
  WOMPI
  RESEND
  AVEONLINE
}

model WebhookEvent {
  id           String        @id @default(cuid())
  source       WebhookSource
  externalId   String
  payload      Json
  processedAt  DateTime?
  createdAt    DateTime      @default(now())

  @@unique([source, externalId])
}
```

### Reglas

- **Precios en enteros (centavos COP)** para evitar errores de coma flotante. Wompi también los maneja así.
- `WebhookEvent.@@unique([source, externalId])` garantiza idempotencia ante reintentos.
- `cuid()` para todos los IDs (compactos, ordenables, sin colisión).
- Soft delete: usar `isActive` o `deletedAt` en lugar de borrar; nunca perder histórico.
- **Reserva de stock al `PENDING_PAYMENT`** (TTL 15 min, transacción atómica con `SELECT FOR UPDATE`) y descuento al `PAID` (ADR-014).
- **Audit log** (`AdminActionLog`): toda acción admin con `actorId`, `action`, `entityType`, `entityId`, `metadata`, `createdAt`.

### Modelos adicionales (ADR-014, ADR-016, ADR-017)

```prisma
// ──────────────── RESERVA DE STOCK (ADR-014) ────────────────

model StockReservation {
  id          String         @id @default(cuid())
  orderId     String
  variantId   String
  variant     ProductVariant @relation(fields: [variantId], references: [id])
  qty         Int
  expiresAt   DateTime
  createdAt   DateTime       @default(now())

  @@index([expiresAt])  // Para cleanup vía pg_cron
  @@index([orderId])
}

// ──────────────── RATE LIMIT Y CACHE EN POSTGRES (ADR-016) ────────────────
// Estas tablas se crean vía SQL migration, no vía Prisma, por simplicidad.
// El cliente Prisma no las necesita: se acceden desde lib/rate-limit.ts y lib/cache.ts.

// CREATE TABLE rate_limit_buckets (
//   key         TEXT        PRIMARY KEY,
//   count       INT         NOT NULL DEFAULT 0,
//   window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
//
// CREATE TABLE cache_entries (
//   key         TEXT        PRIMARY KEY,
//   value       JSONB       NOT NULL,
//   expires_at  TIMESTAMPTZ NOT NULL
// );
// CREATE INDEX cache_entries_expires_idx ON cache_entries(expires_at);

// ──────────────── AUDIT LOG ADMIN ────────────────

model AdminActionLog {
  id          String   @id @default(cuid())
  actorId     String   // AdminUser.id
  action      String   // "ORDER_STATUS_CHANGED", "INVENTORY_ADJUSTED", "REVIEW_APPROVED", etc.
  entityType  String   // "Order", "ProductVariant", "Review"
  entityId    String
  metadata    Json     // Detalle según action: { from: ..., to: ..., reason: ... }
  ip          String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([actorId, createdAt])
  @@index([entityType, entityId])
}
```

## Extensiones Postgres habilitadas

> Configuradas en Supabase vía dashboard o migración SQL. Verificar disponibilidad en plan Free contra [supabase.com/docs/guides/database/extensions](https://supabase.com/docs/guides/database/extensions).

| Extensión            | Propósito                                                                    | ADR      |
| -------------------- | ---------------------------------------------------------------------------- | -------- |
| `uuid-ossp`          | Generación de UUIDs (alternativa a `cuid()` cuando aplique)                  | —        |
| `pgcrypto`           | Hashing de tokens internos, generación segura de slugs aleatorios            | —        |
| `pg_cron`            | Schedule de jobs internos (cleanup, enqueue de pgmq, expiración de reservas) | 016, 017 |
| `pgmq`               | Cola de mensajes durable con exactly-once delivery                           | 017      |
| `pg_stat_statements` | Observabilidad de queries (top consumidores) en producción                   | —        |

### Ejemplo de migración SQL para extensiones y jobs base

```sql
-- supabase/migrations/00000000000001_extensions_and_cron.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgmq";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Crear colas pgmq
SELECT pgmq.create('cart_recovery_1h');
SELECT pgmq.create('cart_recovery_24h');
SELECT pgmq.create('order_reconciliation');
SELECT pgmq.create('shipment_creation_retry');
SELECT pgmq.create('email_send');

-- Crear tablas de rate limit y cache
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key          TEXT        PRIMARY KEY,
  count        INT         NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cache_entries (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS cache_entries_expires_idx
  ON public.cache_entries(expires_at);

-- Cleanup horario de cache expirado y rate-limit windows viejos
SELECT cron.schedule(
  'cleanup-cache-and-ratelimit',
  '*/5 * * * *',  -- cada 5 minutos
  $$
    DELETE FROM public.cache_entries WHERE expires_at < NOW();
    DELETE FROM public.rate_limit_buckets WHERE window_start < NOW() - INTERVAL '1 hour';
  $$
);

-- Cleanup minutual de reservas de stock expiradas (ADR-014)
SELECT cron.schedule(
  'release-expired-stock-reservations',
  '* * * * *',  -- cada minuto
  $$
    DELETE FROM public."StockReservation" WHERE "expiresAt" < NOW();
  $$
);
```

> **Verificación pendiente (mandato #9):** confirmar que `pgmq` y `pg_cron` están disponibles en el plan Free de Supabase antes de Fase 1. Doc: [supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues).

---

## Background jobs (ADR-017)

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  Productor (pg_cron job)    │         │ Productor (Server Action /  │
│  - Detecta carritos         │         │ Webhook handler de Wompi/   │
│    abandonados              │  ──────►│ Aveonline)                  │
│  - Detecta órdenes en       │         │ - Encola "send_email"       │
│    PENDING > 1h             │         │ - Encola "shipment_retry"   │
└──────────┬──────────────────┘         └──────────┬──────────────────┘
           │                                       │
           ▼                                       ▼
        ┌─────────────────────────────────────────────┐
        │           Cola pgmq (Postgres)               │
        │  cart_recovery_1h | cart_recovery_24h |      │
        │  order_reconciliation | shipment_retry |     │
        │  email_send                                  │
        └──────────┬───────────────────────────────────┘
                   │
                   │  pgmq.read(queue, vt=30s, count=10)
                   ▼
        ┌─────────────────────────────────────────────┐
        │  Consumidor (Edge Function / API route)      │
        │  - Lee con visibility timeout                │
        │  - Procesa idempotentemente                  │
        │  - Borra (pgmq.delete) o archiva (pgmq.archive)│
        │  - En error: deja que el VT expire → reintento│
        └──────────────────────────────────────────────┘
```

**Patrón de consumer (pseudo-código):**

```ts
// supabase/functions/cart-recovery-consumer/index.ts
import { supabaseAdmin } from "@/lib/supabase/service";

export async function POST() {
  const { data: messages } = await supabaseAdmin
    .schema("pgmq_public")
    .rpc("read", { queue_name: "cart_recovery_1h", vt: 30, qty: 10 });

  for (const msg of messages) {
    try {
      await processCartRecovery(msg.message);
      await supabaseAdmin
        .schema("pgmq_public")
        .rpc("delete", { queue_name: "cart_recovery_1h", msg_id: msg.msg_id });
    } catch (err) {
      console.error("Error processing message", msg.msg_id, err);
      // Dejar que VT expire → reintento automático
    }
  }
  return Response.json({ processed: messages.length });
}
```

---

## Row-Level Security (Supabase)

Cuando una tabla se accede desde el cliente browser (con la **publishable key** `sb_publishable_*`, que mapea al rol Postgres `anon`), debe tener RLS habilitada.

| Tabla                                                                                       | Política                                                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Customer`                                                                                  | Un cliente solo puede leer/actualizar su propio registro (`auth.uid() = supabase_user_id`).                  |
| `Address`                                                                                   | Solo el dueño (`customer_id` corresponde al cliente autenticado).                                            |
| `Cart`                                                                                      | Cliente autenticado o cookie de sesión que coincida con `session_id`.                                        |
| `Order`                                                                                     | Cliente solo lee sus propias órdenes.                                                                        |
| `OrderItem`                                                                                 | Hereda permisos de `Order`.                                                                                  |
| `Review`                                                                                    | Lectura pública si `is_approved = true`. Escritura solo del autor.                                           |
| `Product`, `Category`, `BlogPost`                                                           | Lectura pública si `is_active`/`is_published`. Escritura solo admin.                                         |
| `Coupon`, `InventoryLog`, `StockReservation`, `WebhookEvent`, `AdminUser`, `AdminActionLog` | Sin acceso desde el rol `anon` (publishable key) — solo `service_role` (secret key, server-side).            |
| `rate_limit_buckets`, `cache_entries`                                                       | Sin acceso desde `anon` — solo `service_role`.                                                               |
| `pgmq.*`                                                                                    | Acceso solo vía `service_role` (secret key); los consumers viven en Edge Functions o API routes server-side. |

Las rutas `/api/*` que necesiten escribir tablas restringidas usan `lib/supabase/service.ts` (secret key `sb_secret_*` que mapea al rol `service_role`, server-only).

## Abstracción `PaymentProvider`

Diseño desde el día 1 para no acoplarse a Wompi y permitir agregar Mercado Pago u otros sin reescribir el checkout.

```ts
// lib/payment/types.ts
import type { Order } from "@prisma/client";

export interface PaymentProvider {
  readonly name: "wompi" | "mercadopago";

  /** Crea la sesión de pago y devuelve URL de redirección o config para widget */
  createCheckout(order: Order): Promise<{
    redirectUrl?: string;
    widgetConfig?: Record<string, unknown>;
    externalId: string;
  }>;

  /** Verifica firma del webhook entrante */
  verifyWebhook(req: Request): Promise<{
    isValid: boolean;
    event?: PaymentEvent;
  }>;

  /** Consulta estado actual de una transacción */
  getStatus(externalId: string): Promise<PaymentStatus>;
}

export type PaymentStatus =
  | { status: "PENDING" }
  | { status: "APPROVED"; paidAt: Date }
  | { status: "DECLINED"; reason: string }
  | { status: "VOIDED" };

export type PaymentEvent = {
  externalId: string;
  status: PaymentStatus["status"];
  amount: number;
  currency: string;
  raw: unknown;
};
```

```ts
// lib/payment/index.ts
import { WompiProvider } from "./wompi";

export function getPaymentProvider(name = "wompi"): PaymentProvider {
  switch (name) {
    case "wompi":
      return new WompiProvider();
    // case 'mercadopago':
    //   return new MercadoPagoProvider();
    default:
      throw new Error(`Unknown payment provider: ${name}`);
  }
}
```

## Storage (Supabase)

Tres buckets con políticas distintas (detalle exhaustivo en [`SECURITY.md` § File upload](./SECURITY.md#file-upload-y-storage)):

| Bucket              | Visibilidad               | Uso                                                                                                 | TTL URL firmada |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- | --------------- |
| `products`          | Público (lectura abierta) | Imágenes oficiales del catálogo                                                                     | —               |
| `customer-uploads`  | Privado                   | Fotos que sube el cliente al estudio de personalización                                             | 1 hora          |
| `production-assets` | Privado                   | PNG alta resolución generados al confirmar orden, descargables solo por admin con rol `FULFILLMENT` | 15 minutos      |

**Reglas:**

- Validación de tipo MIME + tamaño en server (no confiar en cliente).
- Nombres de archivo aleatorios (`pgcrypto`) para evitar enumeración.
- Allowlist de extensiones: `jpg`, `png`, `webp`, `heic` (convertido a webp en server).
- Tamaño máximo: 10 MB por imagen original; el render server-side a 300 DPI vive en `production-assets`.

---

## Caching y revalidación

- **ISR** (`revalidate: 60s`) en home y catálogo: balance entre frescura y costo.
- **On-demand revalidate** desde el admin cuando se actualiza producto, precio o stock significativo.
- **Server Components** por defecto; client components solo donde haya interactividad real (carrito, editor, filtros).
- **Cache de imágenes** automático en Vercel (`next/image` con AVIF/WebP).

## Accesibilidad (WCAG 2.1 AA)

> Lucams_shop debe ser usable por personas con discapacidades visuales, motrices o cognitivas. La paleta kawaii no es excusa para baja accesibilidad.

### Mínimos exigibles desde Fase 1

- **Contraste:** texto cuerpo ≥ 4.5:1 (AA), texto grande ≥ 3:1. Validado en `BRANDING.md`.
- **Navegación por teclado:** todos los flujos críticos (catálogo → PDP → carrito → checkout) usables solo con teclado.
- **Focus visible:** ring visible en `:focus-visible` para botones, links, inputs (no anular `outline`).
- **Skip link:** "Saltar al contenido" como primer elemento focuseable.
- **Landmarks:** `<header>`, `<main>`, `<nav>`, `<footer>` consistentes en todas las páginas.
- **`alt` en imágenes:** producto siempre con descripción significativa, no solo "imán".
- **Labels en formularios:** `<label htmlFor>` siempre. No usar `placeholder` como reemplazo.
- **`aria-live` regions** para feedback dinámico (toast, errores, agregar al carrito).
- **`prefers-reduced-motion`:** respetado en animaciones (Lottie, transiciones).
- **Idioma:** `<html lang="es-CO">` correcto.

### Tests automatizados

- **`@axe-core/react`** en dev mode (warns en consola).
- **Playwright + axe-playwright** en CI: fallar si nuevas violaciones AA aparecen.
- **Lighthouse A11y ≥ 95** como criterio de aceptación.

### Componentes shadcn/ui

shadcn/ui usa Radix primitives, que ya cumplen ARIA. Mantener `aria-*` props cuando se personalice. No reinventar componentes accesibles desde cero.

### Pendientes

- Auditoría manual con lector de pantalla (NVDA / VoiceOver) en Fase 7.
- Pruebas con usuarios con discapacidad visual (post-lanzamiento).

---

## Performance budget

| Métrica                           | Objetivo    |
| --------------------------------- | ----------- |
| Lighthouse Performance            | ≥ 95        |
| Lighthouse SEO                    | ≥ 95        |
| Lighthouse A11y                   | ≥ 95        |
| Lighthouse Best Practices         | ≥ 95        |
| Largest Contentful Paint          | < 2.5 s     |
| Time to First Byte (home con ISR) | < 200 ms    |
| Cumulative Layout Shift           | < 0.1       |
| First Input Delay / INP           | < 200 ms    |
| Bundle JS (page)                  | < 200 KB gz |

## Testing

> Estrategia completa en [`TESTING.md`](./TESTING.md). Resumen:

- **Vitest** unitarios + integración (con Supabase local).
- **Playwright** E2E para flujos críticos (compra Wompi/COD, personalización, admin, retracto).
- **Tests RLS automáticos** con cliente impostor (criterio de aceptación de Fase 1).
- **Lighthouse CI** en GitHub Actions sobre cada PR.
- **Visual regression** con screenshots de Playwright sobre páginas críticas.
- **Accesibilidad** automatizada con `@axe-core/playwright`.
- **Load testing** con k6 antes de cada release de Fase 7.

---

## Patrones cross-cutting (referencias)

Para no duplicar contenido, esta sección referencia las fuentes únicas de patrones que aplican a todo el código:

| Patrón                                                                 | Fuente única                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Naming (FE, BE, DB)                                                    | [`CONVENTIONS.md` § Naming](./CONVENTIONS.md#naming)                                                  |
| Server Component vs Client Component                                   | [`CONVENTIONS.md` § RSC vs Client](./CONVENTIONS.md#frontend--server-components-vs-client-components) |
| Formularios y validación                                               | [`CONVENTIONS.md` § Formularios](./CONVENTIONS.md#frontend--formularios-y-validación)                 |
| Estados de UI (loading, error, empty)                                  | [`CONVENTIONS.md` § Estados](./CONVENTIONS.md#frontend--estados-de-ui-loading-error-empty)            |
| API conventions (REST + Server Actions)                                | [`CONVENTIONS.md` § APIs](./CONVENTIONS.md#backend--apis-rest--server-actions)                        |
| Formato estándar de errores (RFC 7807)                                 | [`CONVENTIONS.md` § Errores RFC 7807](./CONVENTIONS.md#backend--formato-estándar-de-errores-rfc-7807) |
| Capa de servicio (service.ts / repository.ts)                          | [`CONVENTIONS.md` § Capa de servicio](./CONVENTIONS.md#backend--capa-de-servicio)                     |
| **Saga pattern** (Wompi → Aveonline → Email)                           | [`CONVENTIONS.md` § Saga pattern](./CONVENTIONS.md#backend--saga-pattern-para-flujos-distribuidos)    |
| **Idempotency keys**                                                   | [`CONVENTIONS.md` § Idempotency](./CONVENTIONS.md#backend--idempotency-keys)                          |
| Naming SQL (snake_case vs PascalCase)                                  | [`CONVENTIONS.md` § DB naming](./CONVENTIONS.md#db--naming-sql)                                       |
| **Migration strategy** (expand-then-contract)                          | [`CONVENTIONS.md` § Migration strategy](./CONVENTIONS.md#db--migration-strategy-expand-then-contract) |
| **Indexing strategy**                                                  | [`CONVENTIONS.md` § Indexing](./CONVENTIONS.md#db--indexing-strategy)                                 |
| **Soft delete + audit fields** (`createdBy`, `updatedBy`, `deletedAt`) | [`CONVENTIONS.md` § Soft delete](./CONVENTIONS.md#db--soft-delete--audit-fields)                      |
| Foreign keys cascade explícito                                         | [`CONVENTIONS.md` § FK cascade](./CONVENTIONS.md#db--foreign-keys-cascade-explícito)                  |
| **Retention y archival**                                               | [`CONVENTIONS.md` § Retention](./CONVENTIONS.md#db--retention-y-archival)                             |
| **Timeouts, retries, circuit breakers**                                | [`CONVENTIONS.md` § Resiliencia](./CONVENTIONS.md#resiliencia--timeouts-retries-circuit-breakers)     |
| **Logging y request ID correlation**                                   | [`CONVENTIONS.md` § Logging](./CONVENTIONS.md#logging-y-request-id-correlation)                       |

> **Mandato:** cuando se introduce un patrón nuevo que aplica cross-cutting, vive en `CONVENTIONS.md`. ARCHITECTURE.md describe la **estructura** del sistema, no los **patrones de código**.
