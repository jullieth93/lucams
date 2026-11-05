# Estado Actual del Proyecto — Lucams Shop

> **Documento vivo de Nivel 0 (≤ 10 KB).** Resume qué opera hoy, la homologación entre ambientes y
> los pendientes abiertos vigentes, sin bitácoras fechadas. Mapa completo en [`docs/README.md`](README.md).

## Fotografía ejecutiva

- **Tienda activa (`ADR-077`):** `lucamsshop.com` vende en producción en modo **`full`**
  (`NEXT_PUBLIC_STORE_MODE=full`) con pagos Wompi, contraentrega y envíos Aveonline + Envío Lucams Bogotá.
- **Base técnica:** monorepo `pnpm` con `apps/web` (Next.js 16, TS strict, Tailwind v4, shadcn/ui) y
  `packages/db` (**71 modelos Prisma**, **26 enums**, **94 migraciones Prisma** + **53 SQL Supabase**
  con RLS y event trigger `REVOKE` automático `049` en el 100 % de las tablas).
- **Ramas protegidas (`ADR-105`):** `develop` (STG) y `production` (PRD) bajo el ruleset
  `protect-ramas-criticas` con PR obligatorio y **5 checks requeridos** (`Typecheck + Lint + Build`,
  `Vitest`, `RLS behavior`, `E2E + a11y + Lighthouse — Playwright` y `Gitleaks secret scan`).
- **Paquete legal vigente:** **Versión 3 (`2026-11-05`)** sincronizada en los 8 archivos de
  `packages/db/legal-content/*.md`, sus `FALLBACK` en `app/legal/*/page.tsx` y `cms-site-map.mjs`
  (`PRIVACY_POLICY_VERSION = "v3 · 2026-11-05"`).

## Topología de ambientes y homologación STG ↔ PRD

| Ambiente  | Infraestructura                                                                                | Estado operativo actual                                                                      |
| --------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **LOCAL** | Supabase en Podman (`:54321`/`:54322`/`:54324`) + Next dev (`:4000` vía `make local-up`)       | Operativo; `make db-local-seed` 100 % idempotente; 3 crons SQL activos                       |
| **STG**   | `develop` → Vercel Preview (`VERCEL_BYPASS_TOKEN`) + Supabase STG (`mjbdiqdkykhsixvqlrrp`)     | Operativo; aloja `uptime-monitor-prd` (11 jobs `pg_cron`); reset limpio vía `make stg-reset` |
| **PRD**   | `production` → `lucamsshop.com` en Vercel Pro (`iad1`) + Supabase PRD (`zxkucphbsfygakgxcnik`) | **En producción (`full`)**; 15 jobs `pg_cron` + backups diarios GPG (DB + Storage) en R2     |

### Excepciones deliberadas de homologación (`ADR-099`, `ADR-121`, `ADR-126`)

- **Catálogo y esquema (`scripts/diag-stg/homologacion.sh`):**
  migraciones, categorías, ocasiones, plantillas, lettersets, redirects y los `166/166` campos CMS
  están homologados, incluidas las 22 variantes sin imán (`-NOMAG`) de productos activos.
  - `nombre-personalizado` permanece archivado en PRD (`set-fotoimanes-circulares` y
    `set-fotoimanes-corazon` están archivados en los 3 ambientes).
  - El stock real de bodega no se sincroniza por rutina entre ambientes.
- **Crons y secretos por ambiente:**
  - `uptime-monitor-prd` (cada 10 min) corre **solo en STG** (monitorea externamente a PRD).
  - Los **5 crons de correo** (`alerts`, `back-in-stock`, `cart-recovery`, `daily-summary`,
    `review-request`) están apagados en STG por `CRON_JOBS_DISABLED` y activos **solo en PRD**.
  - `AVEONLINE_WEBHOOK_SECRET` existe solo en PRD; `CRON_JOBS_DISABLED` y `VERCEL_BYPASS_TOKEN`
    existen solo en STG.
- **Datos exclusivos de prueba:** el cupón `LOCURA` vive únicamente en STG y nunca pasa a PRD.

## Capacidades operativas por dominio

### Catálogo, SEO y CMS v2 ([`domains/catalog-and-cms.md`](domains/catalog-and-cms.md))

- Categorías padre/hijas con intro colapsable (`CategoryIntro`), facetas configurables por categoría
  (`Category.visibleFilters` en `lib/visible-filters.ts`) y fijado de producto insignia
  (`Category.featuredProductSlug` con badge «Destacado»).
- 16 ocasiones dinámicas, `GlobalSearch` difuso (`shouldFilter={false}`), PDP con escalas mayoristas
  (`WholesaleTier`) y lightbox con zoom compartido (`components/preview-zoom.ts`), 404 HTTP real
  sobre slugs cacheados, feed `GET /feeds/google-merchant.xml` y APIs `/api/catalog|cms`.
- **CMS v2 de 3 capas (`ADR-187`):** `9` contenedores, `29` secciones y `166` campos
  (`105 BLOCK + 61 SETTING`) con paridad AST `166/166` en CI y tokens legales `{{*}}`
  (`lib/consumer-law.ts`).

### Estudio 2D/3D y Producción 300 DPI ([`domains/studio-and-production.md`](domains/studio-and-production.md))

- Lienzo Konva multi-unidad con elección explícita cuando hay >1 plantilla (`ADR-167`), slider
  `borderWidth` (`ADR-173`), derivados WebP ≤800 px (`DesignAsset.canvasPath`,
  `Konva.pixelRatio <= 2`), biblioteca «Mis fotos» (`deleteDesignAssetAction`), auto-fill priorizado
  (`orderAssetsForAutoFill`) y superficies `LetterSetEditor` / `NameEditor` multi-set + IA Gemini.
- **7 escenas 3D en React Three Fiber** (`fridge`, `polaroid`, `board`, `memo` con pager por set,
  `book` con `flatBookmarkFit`, `shelf-3d-view` y `gift-3d-view` con `leaning-scene-layout.ts`) +
  `CalendarCardFocus` de 2 niveles, filtrado `-NOMAG` y reverso «Lucams» (`ADR-190`).
- Auto-save serial con `clientRev` (`STALE_REVISION`), retomador `[STU-02]` para clientes e
  invitados, previews limpios (`ADR-191`) en bucket privado `design-previews` vía
  `/api/design-preview/*` (`LUC-SEC-001`) con `DesignPreviewDialog` paginado (`PagedPreviewThumb`,
  `pageLabels`, zoom `preview-zoom.ts`), y cola `RenderJob` 300 DPI a sangre + ZIP de taller.

### Carrito, Checkout, Pagos y Logística ([`domains/checkout-payments-shipping.md`](domains/checkout-payments-shipping.md))

- Carrito con auto-sanado `rotateCartSession` y recuperación al re-login (`ADR-171`), checkout en 3
  pasos con identidad de sesión (`ADR-155`), direcciones estructuradas (`destinationType` DANE + CP
  MinTIC 171/171 ciudades) y modo regalo (`isGift`).
- Fletes sellados con HMAC y filtrados por peso (`SHIPPING_CARRIER_RULES`), ledger Wompi por intento
  - webhook 25 h ([`integrations/wompi.md`](integrations/wompi.md)), COD con blocklist y
    conciliación, alertas de venta perdida por stock (`notifyStockSaleLost`), Aveonline con PDFs en
    Storage + historial `ShipmentEvent` ([`integrations/aveonline.md`](integrations/aveonline.md)),
    «Envío Lucams» Bogotá y costeo por receta.

### CRM 360°, B2B, Posventa y Operación ([`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md), [`domains/post-sale-and-support.md`](domains/post-sale-and-support.md))

- Grafo `Contact` 360° (`isStaff`, `selfDealing`, fusión asistida), `/admin/hoy`, RFM/LTV en
  `/admin/metricas`, embudo `/empresas-y-eventos` → `Opportunity` → `/cotizacion/[token]`, **Puntos
  Lucams** (incentivo invitado, retrocrédito al verificar correo, reversión en retractos) y `/r/[codigo]`.
- Seguimiento `/pedido/[token]` con autoservicio posventa para invitados (`GuestOrderSupportCard`,
  doble factor token + email), retractos Ley 1480, garantías selladas `OrderItem.warrantyMonths`
  (`1..120` m), soporte PQR con SLAs + copiloto IA 0-PII y reseñas exclusivas en `DELIVERED`.
- Panel `/admin` (8 roles × 34 capacidades, MFA `aal2`, `useAdminConfirm`), 30 plantillas React Email
  - 2 Auth OTP, fechas en `America/Bogota` (`lib/datetime.ts`), GA4 + `lucams_utm` bajo
    consentimiento + embudo `FunnelEventDaily`, **18 procesos programados** y **backups diarios GPG de
    DB + Storage (`HAS_STORAGE=true`) en Cloudflare R2** con DR drill mensual.

## Pendientes abiertos reales

### Negocio y operación externa

1. **Facturación electrónica DIAN (no técnico):** NIT/RUT de facturador, contador/abogado y
   proveedor tecnológico (`BILLING_DOCUMENT_ENABLED = false` en `features/checkout/billing-document.ts`).
2. **Checklist del próximo release `develop → production`:**
   - Verificar aplicación en PRD de migraciones Prisma (hasta `094`) y SQL Supabase (hasta `054`), y
     ejecutar `packages/db/scripts/backfill-contacts.mjs` (`--dry-run` → `--apply`) si aplica.
   - Correr `packages/db/scripts/sync-and-prune-cms-v2.mjs` e invalidar caché en `/admin/contenido`
     para reflejar el **paquete legal Versión 3 (`2026-11-05`)** y `PRIVACY_POLICY_VERSION`.
   - Opcional: correr `node scripts/supabase-auth-email-config.mjs` en STG/PRD si cambian plantillas Auth.
3. **SEO post-indexación:** revisar consultas e indexación reales en Google Search Console para
   eventuales redirecciones 301 adicionales y confirmar aprobación del feed en Merchant Center.

### Higiene técnica diferida (no bloqueante)

1. **Recovery codes MFA admin:** regenerar códigos de cuentas antiguas para retirar el fallback
   legacy SHA-256 en `apps/web/features/admin-mfa/recovery-codes.ts`.
2. **Leaked Password Protection nativo:** activar en Supabase Auth al pasar a plan Pro (hoy cubierto
   por `apps/web/lib/pwned-passwords.ts` con HIBP k-anonymity).
3. **Mejoras opcionales:** evaluar `ADR-118` (unificar preview cliente con renderer servidor),
   conectar `lib/texture-resolution.ts` en `buildMagnetTextures`, aplicar `Category.visibleFilters`
   en `GET /api/catalog/filters` y sumar vectores `.svg` en `apps/web/public/brand/`.
4. **DR drill extendido:** documentar/validar restauración de `auth.users` y ajustes de proyecto
   Supabase junto al simulacro mensual de DB + Storage desde R2.
