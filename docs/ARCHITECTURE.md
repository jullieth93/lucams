# Arquitectura — Lucams_shop

## Visión general

Aplicación monolítica modular en **Next.js 16.3.3 (App Router)** desplegada en Vercel, con backend serverless integrado, persistencia en **Supabase Postgres** vía **Prisma**, autenticación con **Supabase Auth**, almacenamiento de imágenes en **Supabase Storage**, e integraciones externas con Wompi (pagos), Aveonline (logística), Gemini API (IA, ADR-058) y Resend (email).

```
┌──────────────────────────────────────────────────────────────────┐
│                         Vercel (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Storefront  │  │  Admin Panel │  │   API Routes         │  │
│  │  (RSC        │  │  (RBAC + MFA)│  │   (webhooks, cron,   │  │
│  │   dinámico)  │  │              │  │    catálogo, CMS)    │  │
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
   │   Wompi      │  │  Aveonline   │  │  Gemini API      │
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
│   └── web/                              # Next.js 16 (App Router)
│       ├── app/
│       │   ├── page.tsx                  # Home (force-dynamic)
│       │   ├── productos/                # Catálogo con filtros (SSR puro)
│       │   ├── producto/[slug]/          # PDP
│       │   ├── ocasion/[slug]/
│       │   ├── estudio/[slug]/           # Estudio de personalización (react-konva + three.js)
│       │   ├── carrito/
│       │   ├── checkout/                 # Multi-step: datos/ → envio/ → pago/ → gracias/
│       │   ├── pedido/[token]/           # Vista guest por token (hash en DB)
│       │   ├── cotizacion/               # Cotizador B2B
│       │   ├── mi-cuenta/                # Cuenta cliente (pedidos, perfil, direcciones…)
│       │   ├── (auth)/                   # login, registro, recuperar-password…
│       │   ├── legal/                    # terminos, privacidad, habeas-data…
│       │   ├── admin/
│       │   │   ├── login/                # Login + MFA challenge
│       │   │   └── (panel)/              # Backoffice (~35 secciones: productos,
│       │   │                             #   pedidos, inventario, contenido (CMS),
│       │   │                             #   cupones, clientes, seguridad…)
│       │   ├── api/
│       │   │   ├── webhooks/             # wompi/, aveonline/, resend/
│       │   │   ├── cron/                 # jobs pg_cron (x-cron-secret): alerts,
│       │   │   │                         #   cart-recovery, purge-event-logs…
│       │   │   ├── catalog/              # products, search, filters, categories…
│       │   │   ├── coupons/public/
│       │   │   ├── cms/
│       │   │   └── health/, vitals/, log-error/, unsubscribe/, admin/
│       │   ├── error.tsx                 # Error boundary global
│       │   ├── not-found.tsx             # 404
│       │   ├── global-error.tsx          # Catch-all (root)
│       │   ├── sitemap.ts / robots.ts / manifest.ts
│       │   └── layout.tsx
│       ├── components/                   # ui/ (shadcn), admin/, cms/, home/,
│       │                                 # product-detail/, address/, legal/ + sueltos
│       ├── features/                     # ~35 features: checkout, orders, cart,
│       │                                 # payments, shipping, personalization, cms,
│       │                                 # coupons, ai, emails, observability…
│       │                                 # (actions.ts + service.ts + schemas.ts)
│       ├── lib/
│       │   ├── supabase/
│       │   │   ├── server.ts             # Cliente con cookies (SSR)
│       │   │   ├── browser.ts            # Cliente browser — solo Auth (MFA login)
│       │   │   └── service.ts            # Cliente service_role (server-only)
│       │   ├── db.ts                     # Prisma client
│       │   ├── wompi.ts                  # Cliente Wompi (fetch + circuit breaker)
│       │   ├── resend.ts                 # Cliente Resend vía fetch
│       │   ├── cms.ts                    # Lectura CMS v2 (unstable_cache tag "cms")
│       │   ├── checkout-session.ts       # Cookie de checkout sellada AES-256-GCM
│       │   ├── cart-session.ts           # Cookie de sesión de carrito anónimo
│       │   ├── token-hash.ts             # SHA-256 de bearer tokens (F-11)
│       │   ├── admin-rbac-guard.ts       # Guard de rol + MFA obligatorio (B-1)
│       │   ├── error-capture.ts          # ErrorLog/ErrorReport con scrubPii (F-6)
│       │   ├── rate-limit.ts             # Postgres-based (ADR-016)
│       │   ├── errors.ts                 # AppError + ProblemDetails (RFC 7807)
│       │   ├── logger.ts                 # JSON estructurado con redact PII
│       │   ├── fetch-with-timeout.ts / retry.ts / circuit-breaker.ts
│       │   ├── security-headers.ts / turnstile.ts / storage.ts / format.ts…
│       ├── proxy.ts                      # Proxy (ex-middleware, Next 16): request ID,
│       │                                 #   CORS, security headers, gate /admin/*
│       ├── next.config.ts
│       └── package.json
├── packages/
│   └── db/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/               # prisma migrate (schema de dominio)
│       ├── scripts/                      # cms-site-map.mjs, migrate-cms-v2.mjs,
│       │                                 # audit-content-coverage.mjs, seeds…
│       └── package.json
├── supabase/
│   └── migrations/                       # SQL no-Prisma (RLS, grants, storage,
│                                         #   funciones, pg_cron) 00000000000002…29
├── .github/workflows/
│   ├── ci.yml                            # quality + unit-tests + lighthouse +
│   │                                     #   secrets-scan + format-check + dep-audit
│   ├── backup.yml                        # Backup DB → R2 cifrado gpg (A-3)
│   ├── nightly-full.yml                  # Tests que necesitan Supabase real
│   └── dr-drill.yml                      # DR drill — restore desde R2
├── docs/                                 # Documentación (este archivo entre otros)
├── README.md
├── CLAUDE.md
├── pnpm-workspace.yaml
└── package.json
```

**Monorepo con pnpm workspaces.** No usar Turborepo todavía (innecesario al inicio).

## Stack y versiones objetivo

| Capa            | Tecnología                    | Versión objetivo                                                       |
| --------------- | ----------------------------- | ---------------------------------------------------------------------- |
| Runtime         | Node.js                       | 22 LTS (`engines.node >= 22`)                                          |
| Package manager | pnpm                          | 11.x (`packageManager: pnpm@11.0.9`)                                   |
| Framework       | Next.js                       | **16.3.3 (App Router, RSC, Server Actions, Turbopack)**                |
| UI runtime      | React                         | 19.x                                                                   |
| Lenguaje        | TypeScript                    | 5.x estricto                                                           |
| UI              | Tailwind CSS                  | **4.x (sintaxis CSS-first con `@theme`, sin `tailwind.config`)**       |
| Componentes     | shadcn/ui                     | latest (style `radix-nova`, soporte oficial v4)                        |
| Animaciones     | `tw-animate-css`              | latest (reemplaza `tailwindcss-animate` deprecado en v4)               |
| Toast/notif     | `sonner`                      | latest (reemplaza `toast` deprecado en v4)                             |
| State (cliente) | Zustand                       | 5.x                                                                    |
| Validación      | Zod                           | 4.x                                                                    |
| ORM             | Prisma                        | 6.x                                                                    |
| DB              | Postgres                      | Supabase managed                                                       |
| Auth            | Supabase Auth                 | latest (MFA TOTP obligatorio en /admin)                                |
| Editor canvas   | react-konva                   | 19.x                                                                   |
| 3D              | three.js + react-three-fiber  | latest                                                                 |
| Email           | Resend                        | API REST vía fetch server-side (`lib/resend.ts`, sin SDK)              |
| IA              | Gemini API                    | REST vía fetch server-side (`features/ai/gemini-provider.ts`, ADR-058) |
| Tests unit      | Vitest                        | 4.x                                                                    |
| Tests E2E       | Playwright                    | latest                                                                 |
| Lint            | ESLint + `eslint-config-next` | 9.x / 16.x (flat config)                                               |
| Format          | Prettier                      | 3.x                                                                    |

## Modelo de datos (Prisma)

> **Nota:** el schema mostrado abajo es la base lógica del dominio. Cada modelo de dominio (no auxiliares de infra como `rate_limit_buckets`) además gana los **audit fields estándar** (`createdAt`, `updatedAt`, `createdBy?`, `updatedBy?`, `deletedAt?`, `deletedBy?`) per [`CONVENTIONS.md` § Soft delete + audit fields](./CONVENTIONS.md#db--soft-delete--audit-fields). Para no inflar el schema visual, esos campos no se repiten en cada modelo aquí — pero la capa de servicio llena `createdBy/updatedBy` al crear/actualizar (p.ej. `features/products/service.ts`) y los queries por defecto filtran `WHERE "deletedAt" IS NULL`.

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
  CMS_EDITOR  // solo contenido del sitio
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
- Soft delete: `deletedAt`/`deletedBy` en lugar de borrar (`isActive` solo para publicado/no-publicado); nunca perder histórico.
- **Bearer tokens públicos hasheados en reposo** (F-11, auditoría 2026-08-24): `Order.publicAccessTokenHash`, `Quote.publicAccessTokenHash`, `Design.shareTokenHash` y `AbandonedCart.recoverTokenHash` guardan solo el digest SHA-256 (`lib/token-hash.ts`); el token en claro se entrega una vez (link/email) y los lookups hashean el token presentado. Mismo patrón que `AdminRecoveryCode.codeHash` (HMAC-SHA256 con pepper).
- **Stock: decremento atómico al transicionar a `PAID`** (no reserva en `PENDING_PAYMENT` — evita secuestrar stock de carritos abandonados): `updateMany` con `WHERE stock >= qty` (row-lock implícito, compatible con pgBouncer; sin `SELECT FOR UPDATE`), revert al `CANCELLED`/`REFUNDED` solo si hubo decremento previo, idempotencia física con índice parcial único en `InventoryLog(orderId, reason, variantId)`. `StockReservation` queda en el schema **sin consumidores** (ADR-014 diferida). Ver `features/orders/stock.ts`.
- **Tope de cupón por cliente en la DB** (G-5, auditoría 2026-08-24): `CouponUsage` registra cada redención (por `customerId` o email normalizado) y el trigger `coupon_usage_per_customer_limit` (migración Prisma `20260829120000_coupon_usage_per_customer_trigger`) toma un `pg_advisory_xact_lock` por (couponId, identidad) y re-cuenta bajo el lock, cerrando la carrera de checkouts concurrentes.
- **Audit log** (`AdminActionLog`): toda acción admin con `actorId`, `action`, `entityType`, `entityId`, `metadata`, `createdAt`.

### Modelos adicionales (ADR-014, ADR-016)

```prisma
// ──────────────── RESERVA DE STOCK (ADR-014, diferida) ────────────────
// Existe en el schema pero SIN consumidores: el decremento es directo al
// PAID (ver § Reglas). Se mantiene por si el volumen justifica reservas
// con TTL en el futuro.

model StockReservation {
  id          String         @id @default(cuid())
  orderId     String
  variantId   String
  variant     ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  qty         Int
  expiresAt   DateTime
  createdAt   DateTime       @default(now())

  @@index([expiresAt])
  @@index([orderId])
  @@index([variantId])
}

// ──────────────── RATE LIMIT EN POSTGRES (ADR-016) ────────────────
// Tabla + función creadas vía SQL migration (supabase/migrations/
// 00000000000003_rate_limit.sql), no vía Prisma. Se accede desde
// lib/rate-limit.ts, que llama la función rate_limit_check (increment +
// check atómico, sin race condition).

// CREATE TABLE rate_limit_buckets (
//   key          TEXT        PRIMARY KEY,
//   count        INT         NOT NULL DEFAULT 0,
//   window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
// CREATE FUNCTION rate_limit_check(p_key TEXT, p_limit INT, p_window_seconds INT) ...

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

## CMS v2 — contenido administrable (2026-07-30)

El 100% del contenido visible del sitio lo edita una persona NO técnica desde
`/admin/contenido`. El modelo viejo (`CmsBlock` + `SiteSetting`, dropeado en la fase A2 —
migración `20260731130000_drop_cms_legacy`) se reemplazó por una jerarquía de 4 tablas (migración
`20260730120000_add_cms_v2`, RLS deny-by-default en `supabase/migrations/00000000000018`):

```
CmsPage ─┬─ CmsSection ─┬─ CmsField ───── CmsFieldVersion (append-only)
         │              │                        └─ publishAt (C3: publicación programada,
         │              │                           job pg_cron lucams-cms-publish-scheduled)
         │              ├─ CmsListItem (B4: filas de campos LISTA; el body público
         │              │   sigue siendo el array serializado a JSON — lectura compatible)
         │              └─ fields type IMAGE (B5) → CmsMedia (metadata del asset;
         │                  el archivo vive en el bucket público `cms-media`)
         └─ path (ruta pública — alimenta la vista previa en vivo del editor, C1)
```

- **`CmsPage`**: una por sitio/página (`inicio`, `header`, `footer`, `estudio`, `emails`, `seo`,
  `global`…). **`CmsSection`**: zonas dentro de la página. **`CmsField`**: un texto/ajuste con
  `key` global única histórica (`home.hero.title`, `CONTACT_EMAIL`), `kind` (BLOCK = prosa con
  publicación explícita · SETTING = valor atómico que publica al guardar), `type`
  (TEXT…JSON, IMAGE desde B5), `label`/`helpText` para no-técnicos. **`CmsFieldVersion`**:
  historial inmutable (revert + auditoría legal).
- **Estructura declarativa**: `packages/db/scripts/cms-site-map.mjs` es la fuente de verdad de
  páginas/secciones/campos; `make migrate-cms-v2` la aplica idempotente (nunca pisa body ni
  publicación de campos existentes).
- **Lectura** (`apps/web/lib/cms.ts`): `getCmsBlock`, `getSettingValue`, `getCmsList` (listas B4),
  `getCmsImage` (B5), `getCmsBanners` (B6) — todas con `unstable_cache` tag `cms` (1h) y
  **fallback** al valor hardcoded pre-CMS (regla de oro: si la DB cae, el sitio se ve idéntico).
  Invalidación: `updateTag("cms")` desde las Server Actions del admin; tras scripts directos en
  DB, botón «Actualizar caché de contenido» en `/admin/contenido`.
- **Admin** (`app/admin/(panel)/contenido/`): índice por páginas con búsqueda global, editor de
  página con edición inline + vista previa en vivo (C1), editor de campo con versiones,
  date-picker de publicación programada (C3), editor de filas para listas (B4) con subcampos
  IMAGE/BOOLEAN (B6), mediateca (B5), vista «Solo borradores» con publicar en lote, renombrar /
  mover / duplicar (C4). Acceso: SUPERADMIN + CMS_EDITOR (C2, `ADMIN_ROLE_SETS.CONTENT`).
- **Anti-regresión (D1)**: `packages/db/scripts/audit-content-coverage.mjs` escanea el JSX del
  storefront con AST y gatea en CI que no aparezca copy nuevo en español fuera del CMS
  (baseline ratchet en `content-coverage-baseline.json`).
- ADRs: DECISIONS.md ADR-082 (modelo v2), ADR-083 (iconos en Category), ADR-084 (listas B4).

## Extensiones Postgres habilitadas

> Habilitadas en Supabase vía dashboard o migración SQL. Solo se listan las que el proyecto usa hoy.

| Extensión  | Propósito                                                                               | Dónde se habilita                                                         |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pg_trgm`  | Búsqueda fuzzy de productos (operador `%`, `similarity()`)                              | `supabase/migrations/00000000000005`                                      |
| `unaccent` | Búsqueda insensible a tildes                                                            | `supabase/migrations/00000000000005`                                      |
| `pg_cron`  | Schedule de jobs internos (cleanups DB-side y disparo de jobs HTTP hacia `/api/cron/*`) | dashboard + `supabase/migrations/00000000000012, 015, 016, 021, 023`      |
| `pg_net`   | `net.http_get` desde pg_cron hacia los endpoints `/api/cron/*` (schema `extensions`)    | `supabase/migrations/00000000000029`                                      |
| `pgcrypto` | Disponible para hashing en DB (los bearer tokens se hashean en app con SHA-256, F-11)   | `packages/db/prisma/migrations/20260829150200_bearer_tokens_hash_at_rest` |

> **No se usan** `pgmq` (los background jobs son HTTP vía pg_cron + pg_net, ver § Background jobs), ni `uuid-ossp`, ni `pg_stat_statements`.

### Jobs pg_cron versionados

Las migraciones `00000000000012/015/016/021/023` agendan los jobs (idempotentes: `unschedule` → `schedule`; leen `cron_base_url` y `cron_secret` del Vault de Supabase en runtime, sin secretos en el SQL; el header `x-cron-secret` viaja en headers, nunca en la URL). Son **guardados**: si `pg_cron`/`pg_net` no están instalados en el ambiente, el job se omite con `RAISE NOTICE` en vez de romper la migración.

---

## Background jobs

> ADR-017 decidió `pgmq` como cola durable; en la práctica **pgmq no se adoptó**: los jobs son endpoints HTTP `/api/cron/*` disparados por `pg_cron` + `pg_net` (migraciones `00000000000015/016/021/023`), y el reintento de guía Aveonline quedó manual con alerta (ADR posterior a ADR-060). No se usa Vercel Cron.

```
┌──────────────────────────────────────────────────────────┐
│  pg_cron (Supabase) — jobs versionados en migraciones     │
│  HTTP (015/016/021/023, header x-cron-secret desde Vault):│
│    lucams-alerts (*/5min)        → /api/cron/alerts       │
│    lucams-daily-summary (13:00)  → /api/cron/daily-summary│
│    lucams-review-request (17:00) → /api/cron/review-request│
│    lucams-cart-recovery (c/1h)   → /api/cron/cart-recovery│
│    lucams-back-in-stock (*/30min)→ /api/cron/back-in-stock│
│    lucams-purge-anon-designs (08:00) → /api/cron/purge-anon-designs│
│    lucams-purge-event-logs (03:00)   → /api/cron/purge-event-logs  │
│    lucams-cms-publish-scheduled (*/5min) → /api/cron/cms-publish-scheduled│
│  SQL puros (012):                                           │
│    rate_limit_cleanup (*/15min) — buckets > 1 día           │
│    stock_reservation_cleanup (c/1min) — reservas expiradas  │
└──────────────────────┬───────────────────────────────────┘
                       │  net.http_get(url = Vault:cron_base_url + path,
                       │              headers = x-cron-secret [+
                       │              x-vercel-protection-bypass en STG])
                       ▼
        ┌─────────────────────────────────────────────┐
        │  API routes /api/cron/* (Next.js, Vercel)    │
        │  - Validan x-cron-secret (timing-safe)       │
        │  - Procesan idempotentemente                 │
        │  - recordCronHeartbeat (dead-man switch)     │
        │  - En error: captureServerError +            │
        │    notifyCronFailure (centro de notific.)    │
        └─────────────────────────────────────────────┘
```

**Patrón de endpoint cron** (`apps/web/app/api/cron/*/route.ts`): handler `GET` con `force-dynamic`, valida el header `x-cron-secret` contra `CRON_SECRET` con comparación timing-safe, ejecuta la lógica delegando al feature (`features/observability/event-log-retention.ts`, `features/cart/cart-recovery.ts`, etc.), registra heartbeat en éxito y captura el error + notifica en fallo.

---

## Row-Level Security y grants (Supabase)

**Postura actual (verificada en prod 2026-06-29, endurecida en la auditoría 2026-08): los roles `anon` y `authenticated` NO tienen ningún privilegio de tabla en el schema `public`.** La API pública (PostgREST) responde `42501 permission denied` en todas las tablas — la publishable key (`sb_publishable_*`) no lee ni escribe datos de dominio. Todo el acceso a datos es server-side vía **Prisma** (conexión directa, rol `postgres`); el cliente Supabase del browser (`lib/supabase/browser.ts`) se usa **solo para Auth** (login MFA del admin). Migraciones al respecto:

- `00000000000022` — `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` (+ default privileges para tablas futuras).
- `00000000000026` — revoca los grants residuales `REFERENCES/TRIGGER/TRUNCATE` de anon/authenticated y el DML de `service_role` (la app no lo necesita: Prisma conecta como `postgres`).
- `00000000000028` — policies backstop y triggers de guarda menos permisivos, por si un GRANT reaparece: impiden auto-aprobar reseñas, que el cliente se toque `loyaltyPoints`/`referralCode`, o reescribir `CartItem.unitPrice` vía PostgREST.
- `00000000000027` — endurece las funciones de `public`: `search_path` fijo (anti schema-hijack), `EXECUTE` revocado a `PUBLIC`/anon/authenticated donde no hace falta, y `is_active_admin()` recreada con nombres calificados.
- `00000000000025` — elimina el event trigger que re-habilitaba RLS automáticamente (huérfano).

**RLS queda habilitada en todas las tablas como backstop (defensa en profundidad)**, con policies deny-by-default salvo las excepciones originales (`00000000000002/007/010/017/018/019/024`: p.ej. lectura pública de `Review` aprobadas o `Product` activos, hoy dormidas tras la revocación de grants). La matriz completa se prueba en CI nightly con un cliente impostor (`apps/web/features/security/rls-matrix.integration.test.ts`): falla si alguna tabla con PII empieza a responder vía API pública.

Las rutas `/api/*` y Server Actions que escriben tablas lo hacen vía Prisma; el cliente `service_role` de `lib/supabase/service.ts` (secret key `sb_secret_*`, server-only) se reserva para Auth admin y Storage.

## Abstracción `PaymentProvider`

Diseño desde el día 1 para no acoplarse a Wompi y permitir agregar Mercado Pago u otros sin reescribir el checkout (ADR-004). Vive en `apps/web/features/payments/`:

- `provider.ts` — la interface `PaymentProvider` y el singleton `getPaymentProvider()`; el provider activo se controla por env `PAYMENT_PROVIDER` (default `wompi`, el único soportado hoy).
- `wompi.ts` — `WompiPaymentProvider` (sandbox + producción).

La interface (simplificada; ver `provider.ts` para los tipos completos):

```ts
// features/payments/provider.ts
export interface PaymentProvider {
  readonly name: "wompi" | "mercadopago";

  /** Crea la URL hosted de pago (redirect inmediato; NO es un cargo todavía) */
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;

  /** Consulta estado real de una transacción (no confiar en query params del redirect) */
  getPaymentDetails(providerTransactionId: string): Promise<PaymentDetails>;

  /** Verifica firma del webhook entrante y normaliza el evento */
  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookVerificationResult;
}

export type PaymentStatus = "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";
```

El mismo patrón se usa para envíos: `features/shipping/provider.ts` (`getShippingProvider()`, Aveonline activa, ADR-039) e IA: `features/ai/provider.ts` (Gemini activa, ADR-058).

## Storage (Supabase)

Cinco buckets con políticas distintas (detalle exhaustivo en [`SECURITY.md` § File upload](./SECURITY.md#file-upload-y-storage); buckets creados en `supabase/migrations/00000000000005/006/020`):

| Bucket              | Visibilidad               | Uso                                                                                | TTL URL firmada       |
| ------------------- | ------------------------- | ---------------------------------------------------------------------------------- | --------------------- |
| `product-images`    | Público (lectura abierta) | Imágenes oficiales del catálogo (`<productId>/<uuid>.webp`, cacheControl 1 año)    | —                     |
| `customer-uploads`  | Privado                   | Fotos que sube el cliente al estudio de personalización (máx 10 MB)                | 1 hora                |
| `design-previews`   | Público                   | Previews renderizados de diseños (galería, compartir)                              | —                     |
| `production-assets` | Privado                   | PNG alta resolución generados al confirmar orden, descargables por admin (ADR-063) | 1 hora (configurable) |
| `cms-media`         | Público                   | Assets de campos IMAGE del CMS v2 (máx 5 MB)                                       | —                     |

**Reglas:**

- Validación de tipo MIME (sniffing real del archivo, no el header del cliente) + tamaño en server (no confiar en cliente) — `lib/storage.ts`.
- Nombres de archivo aleatorios (UUID) para evitar enumeración.
- Allowlist de extensiones: `jpg`, `png`, `webp`, `avif`; el bucket `customer-uploads` acepta además `heic`/`heif` (fotos de iPhone, decodificadas en server con `heic-decode`).
- Tamaño máximo: 10 MB por imagen original en `customer-uploads`; el render server-side a 300 DPI vive en `production-assets`.

---

## Caching y revalidación

- **SSR dinámico** en storefront: home `force-dynamic`, catálogo y PDP consultan DB por request (SSR puro). Si el catálogo crece y se vuelve lento, la mejora prevista es `unstable_cache` con tag `products` invalidado desde el admin.
- **CMS v2**: lecturas con `unstable_cache` tag `cms`, TTL 1h (`apps/web/lib/cms.ts`); invalidación on-demand con `updateTag("cms")` desde las Server Actions del admin al publicar.
- **Redirects**: cache in-memory 60 s en `proxy.ts` para `UrlRedirect` lookups.
- **Server Components** por defecto; client components solo donde haya interactividad real (carrito, editor, filtros).
- **Cache de imágenes** automático en Vercel (`next/image` con AVIF/WebP; `product-images` se sube con `cacheControl` de 1 año — nombres con UUID, inmutables).

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

| Métrica                                 | Objetivo    |
| --------------------------------------- | ----------- |
| Lighthouse Performance                  | ≥ 95        |
| Lighthouse SEO                          | ≥ 95        |
| Lighthouse A11y                         | ≥ 95        |
| Lighthouse Best Practices               | ≥ 95        |
| Largest Contentful Paint                | < 2.5 s     |
| Time to First Byte (home, SSR dinámico) | < 200 ms    |
| Cumulative Layout Shift                 | < 0.1       |
| First Input Delay / INP                 | < 200 ms    |
| Bundle JS (page)                        | < 200 KB gz |

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
| **Idempotencia**                                                       | [`CONVENTIONS.md` § Idempotencia](./CONVENTIONS.md#backend--idempotencia)                             |
| Naming SQL (snake_case vs PascalCase)                                  | [`CONVENTIONS.md` § DB naming](./CONVENTIONS.md#db--naming-sql)                                       |
| **Migration strategy** (expand-then-contract)                          | [`CONVENTIONS.md` § Migration strategy](./CONVENTIONS.md#db--migration-strategy-expand-then-contract) |
| **Indexing strategy**                                                  | [`CONVENTIONS.md` § Indexing](./CONVENTIONS.md#db--indexing-strategy)                                 |
| **Soft delete + audit fields** (`createdBy`, `updatedBy`, `deletedAt`) | [`CONVENTIONS.md` § Soft delete](./CONVENTIONS.md#db--soft-delete--audit-fields)                      |
| Foreign keys cascade explícito                                         | [`CONVENTIONS.md` § FK cascade](./CONVENTIONS.md#db--foreign-keys-cascade-explícito)                  |
| **Retention y archival**                                               | [`CONVENTIONS.md` § Retention](./CONVENTIONS.md#db--retention-y-archival)                             |
| **Timeouts, retries, circuit breakers**                                | [`CONVENTIONS.md` § Resiliencia](./CONVENTIONS.md#resiliencia--timeouts-retries-circuit-breakers)     |
| **Logging y request ID correlation**                                   | [`CONVENTIONS.md` § Logging](./CONVENTIONS.md#logging-y-request-id-correlation)                       |

> **Mandato:** cuando se introduce un patrón nuevo que aplica cross-cutting, vive en `CONVENTIONS.md`. ARCHITECTURE.md describe la **estructura** del sistema, no los **patrones de código**.
