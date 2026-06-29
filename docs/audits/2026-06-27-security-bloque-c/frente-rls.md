The browser client factory exists but is **not currently called anywhere** in client components — so today the anon client only ships via `@supabase/ssr` for auth. However, the **publishable (anon) key is exposed as `NEXT_PUBLIC_*`**, meaning anyone can hit the project's PostgREST endpoint (`<url>/rest/v1/<Table>`) directly with that key. PostgREST exposure does NOT depend on the app calling `.from()` — it depends solely on RLS + grants on the table. That's the real risk surface. I have enough to write the report.

# Frente 2 — RLS (Row Level Security)

**Veredicto:** 🟡 PARCIAL con un hueco **P0 bloqueante**. La base de RLS existe y está bien diseñada para las 20 tablas originales, pero **16 tablas creadas después del 2026-05-12 nunca recibieron `ENABLE ROW LEVEL SECURITY`** y varias contienen PII. Además **no existe ni un solo test RLS automatizado**, pese a ser criterio de aceptación de Fase 1 (SECURITY.md:151) y mandato del proyecto. Este gap ya fue documentado como **P0-017** en la mega-audit del 2026-05-28 y sigue **sin cerrar**.

## Contexto de exposición (por qué importa)

- La `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (rol `anon`) se expone al navegador por diseño (`lib/supabase/browser.ts:18`, `lib/supabase/server.ts:32`). Cualquiera con esa llave puede pegarle directo a PostgREST (`<SUPABASE_URL>/rest/v1/<Tabla>`), **independientemente de que el código de la app consulte o no esa tabla**. La protección es **exclusivamente** RLS + grants. Sin RLS habilitada, la tabla queda legible/escribible por `anon`.
- Todo el acceso a datos de la app va por **Prisma con `service_role`/rol privilegiado** (`schema.prisma:27` `DATABASE_URL`), que bypassa RLS — esperado y correcto. El cliente `anon` hoy solo se usa para Auth/Storage; **no hay ni un `.from('<tabla>').select()`** contra tablas de datos vía cliente anon (confirmado por barrido). Esto **reduce** el riesgo desde la app, pero **no lo elimina**: el endpoint PostgREST sigue abierto a quien tenga la publishable key.

## 1–2. Matriz Tabla → RLS habilitada → Política → Riesgo

Evidencia RLS: `supabase/migrations/00000000000002_rls_policies.sql` (única fuente de RLS sobre tablas; las migraciones Prisma en `packages/db/prisma/migrations/` **no contienen RLS** — confirmado con grep).

### Tablas CON RLS (20) — ✅ correctas

| Tabla | RLS | Política | Evidencia | Riesgo |
|---|---|---|---|---|
| Category | ✅ | SELECT público `isActive AND deletedAt IS NULL` | `:51-53` | OK |
| Product | ✅ | SELECT público `isActive AND deletedAt IS NULL` | `:56-58` | OK |
| ProductVariant | ✅ | SELECT público `deletedAt IS NULL` | `:61-63` | OK |
| Review | ✅ | SELECT `isApproved`; INSERT propio | `:66-68`, `:171-177` | OK |
| BlogPost | ✅ | SELECT `isPublished AND publishedAt<=NOW()` | `:71-73` | OK |
| Customer | ✅ | SELECT/UPDATE solo dueño (`supabaseUserId=auth.uid()`) | `:80-88` | OK |
| Address | ✅ | ALL solo dueño vía join Customer | `:92-103` | OK |
| Cart / CartItem | ✅ | ALL solo dueño; anon carts vía service_role | `:108-135` | OK |
| Order | ✅ | SELECT solo dueño | `:140-146` | OK — un cliente **no** puede leer pedidos de otro |
| OrderItem | ✅ | SELECT vía join Order→Customer | `:149-156` | OK |
| LoyaltyTxn | ✅ | SELECT solo dueño | `:160-166` | OK |
| AdminUser, InventoryLog, Coupon, AbandonedCart, Referral, WebhookEvent, StockReservation, AdminActionLog | ✅ | deny-by-default (RLS sin policy) | `:179-193` | OK — solo service_role |

Las políticas **no son demasiado permisivas**: catálogo filtra `isActive/isApproved/isPublished + deletedAt`; datos de cliente usan `auth.uid()::text = Customer.supabaseUserId`; tablas internas son deny-all. El patrón es sólido.

### Tablas SIN RLS (16) — ❌ P0 (cumple mandato #12 incumplido)

Modelos en `schema.prisma` que **NO aparecen** en ningún `ENABLE ROW LEVEL SECURITY` (diff verificado):

| Tabla | RLS | PII / sensibilidad | Evidencia modelo | Riesgo si `anon` le pega a PostgREST |
|---|---|---|---|---|
| **Consent** | ❌ | **Alta** — email, ipAddress, userAgent, scope legal | `schema.prisma:802` | Lectura/escritura de consentimientos legales de cualquier titular (Ley 1581) |
| **SupportTicket** | ❌ | **Alta** — email, name, subject, message, ip | `schema.prisma:915` | Fuga de tickets de soporte con PII y contenido del mensaje |
| **Design** | ❌ | **Alta** — `previewUrl`, `productionUrls[]`, `shareToken`, customerId/sessionId | `schema.prisma:1051` | Enumeración de diseños/fotos de clientes; lectura de shareTokens |
| **DesignAsset** | ❌ | **Alta** — `storageUrl` de fotos crudas del cliente | `schema.prisma:1097` | Mapeo de assets privados a customerId |
| **EmailEvent** | ❌ | Media — eventos de email (probable destinatario) | `schema.prisma:898` | Fuga de actividad de email |
| **SiteEvent** | ❌ | Media — analítica/eventos | `schema.prisma:853` | Telemetría expuesta/escribible |
| **WebVital** | ❌ | Baja-Media — RUM por route | `schema.prisma:832` | Inyección de métricas falsas |
| **ErrorReport** | ❌ | Media — stack traces / contexto | `schema.prisma:871` | Fuga de detalles internos de errores |
| **CmsBlock / CmsBlockVersion** | ❌ | Media — contenido + borradores no publicados | `schema.prisma:942`, `:971` | **Escritura** posible → defacement de contenido legal/home; lectura de borradores |
| **SiteSetting** | ❌ | Media — config (email, WA, plazos legales) | `schema.prisma:995` | **Escritura** posible → alterar config del sitio |
| **PersonalizationTemplate** | ❌ | Baja | `schema.prisma:1121` | Escritura de plantillas |
| **OcasionTag / ProductOcasionTag** | ❌ | Baja | `schema.prisma:1162`, `:1194` | Manipulación de taxonomía |
| **RecommendationLog** | ❌ | Media — comportamiento usuario | `schema.prisma:1247` | Fuga de patrones de navegación |
| **CouponUsage** | ❌ | Media — uso de cupones por customer | `schema.prisma:639` | Enumeración de uso de cupones |
| **UrlRedirect** | ❌ | Baja | `schema.prisma:1247` | Manipulación de redirects (open-redirect potencial) |

**Severidad: P0.** Sin RLS, estas tablas dependen únicamente de los grants por defecto de Supabase, que conceden a `anon`/`authenticated` acceso a tablas del schema `public`. No hay `REVOKE`/`ALTER DEFAULT PRIVILEGES` que mitigue (grep confirmó cero). Para `CmsBlock`, `SiteSetting`, `UrlRedirect` el riesgo incluye **escritura** (tampering), no solo lectura. **Bloqueante de launch.**

> Nota honesta: el impacto exacto (lectura vs lectura+escritura) por tabla depende de los grants reales en la DB viva, que **no puedo consultar desde el repo** → `[pendiente verificación]` con `psql`/Supabase Studio. Pero la ausencia de `ENABLE ROW LEVEL SECURITY` es certera y, bajo el comportamiento por defecto de Supabase + el mandato #12, es P0 de todas formas.

**Fix (P0):** Crear `supabase/migrations/00000000000007_rls_remaining_tables.sql`:
- `ENABLE ROW LEVEL SECURITY` en las 16 tablas.
- Políticas: `Design`/`DesignAsset` → owner-only por `customerId=auth.uid` o por `sessionId` (cuidado: sessionId no es verificable por RLS, dejar mutaciones a service_role); `CmsBlock`(publicado)/`SiteSetting`/`PersonalizationTemplate`/`OcasionTag`/`ProductOcasionTag`/`UrlRedirect` → SELECT público de filas publicadas/activas, mutaciones deny-by-default (service_role); `Consent`/`SupportTicket`/`EmailEvent`/`SiteEvent`/`WebVital`/`ErrorReport`/`RecommendationLog`/`CmsBlockVersion`/`CouponUsage` → deny-by-default total (solo service_role).
- Aplicar igual que el original: `prisma db execute --file ...` (STATE.md:441) o `supabase db push`.
- **Esfuerzo: M.** **AUTÓNOMO** la escritura del SQL; **NECESITA-LUCY** la aplicación a la DB viva + verificación en Supabase Studio (acción humana, ya tipificada como P0-017).

## 3. Tests RLS automatizados — ❌ FALTAN (P0/P1, gap de Bloque E)

- **No existe ningún test RLS.** Barrido de `apps/web` y `packages/db`: hay `vitest` configurado (`apps/web/package.json:11`) y tests unit/integration (`format.test.ts`, `order-transitions.test.ts`, `stock.integration.test.ts`, e2e `smoke.spec.ts`), pero **cero** archivos `rls`/`row level`.
- **No existe script `test:rls`** pese a que SECURITY.md:1323 (`pnpm test:rls`) y SECURITY.md:151-170 lo definen como criterio de aceptación de Fase 1. La mega-audit (`db-schema-rls.md:154`) ya lo había marcado.
- **Severidad: P0** para el criterio de aceptación del proyecto; como mínimo P1 bloqueante de "Bloque C/E certificado". Sin tests, cualquier tabla nueva volverá a quedar sin RLS sin que nadie lo note (precisamente lo que pasó con estas 16 tablas).

**Matriz de tests requerida (rol × tabla × operación)** con cliente impostor (publishable key + sesión fabricada):
- **Customer A no lee Order/OrderItem/Address/Cart/LoyaltyTxn de Customer B** (esperado: `data: []`, `error: null`).
- **anon no lee** tablas deny-by-default (AdminUser, AdminActionLog, InventoryLog, Coupon, WebhookEvent, StockReservation, Consent, SupportTicket, EmailEvent, ErrorReport, RecommendationLog, CmsBlockVersion).
- **anon SÍ lee** catálogo publicado (Product/Category/ProductVariant `isActive`, Review `isApproved`, BlogPost `isPublished`) y **NO** filas con `deletedAt`/no publicadas.
- **anon/authenticated no escribe** CmsBlock/SiteSetting/UrlRedirect/PersonalizationTemplate (regresión del fix P0).
- **Customer A no lee Design/DesignAsset de B**.
- Test de **smoke "RLS habilitada en toda tabla pública"**: query a `pg_tables`/`pg_class.relrowsecurity` que falle si alguna tabla de `public` no tiene `rowsecurity=true` (previene futura reincidencia).

**Esfuerzo: L.** **AUTÓNOMO** (dev escribe el harness con `@supabase/supabase-js` + un proyecto Supabase de test o branch); **NECESITA-LUCY** solo si hay que aprovisionar un proyecto/branch Supabase dedicado para CI.

## 4. service_role nunca en cliente — ✅ correcto

- `lib/supabase/service.ts:23` tiene `import "server-only"` y usa `SUPABASE_SECRET_KEY` (no `NEXT_PUBLIC_*`). Documentado como "bypassa RLS, server-only" (`service.ts:1-21`).
- Barrido confirmó: **ningún componente `'use client'` importa `supabaseService`/`lib/supabase/service`**. Las únicas referencias a `SUPABASE_SECRET_KEY` en `.tsx` son strings en `admin/(panel)/integraciones/page.tsx:145,172` para mostrar el **nombre** de la env-var en el panel de salud (no el valor) — sin fuga.
- El cliente anon (`browser.ts`) solo se usa vía `@supabase/ssr`; su factory `createSupabaseBrowserClient` **no se invoca en ningún componente** hoy (la exposición real es la publishable key como `NEXT_PUBLIC_*`, no llamadas `.from()`).

## Resumen de gaps

| Gap | Sev | Esfuerzo | Autonomía |
|---|---|---|---|
| 16 tablas sin `ENABLE ROW LEVEL SECURITY` (PII: Consent, SupportTicket, Design, DesignAsset…) | **P0** | M | SQL AUTÓNOMO / aplicar NECESITA-LUCY |
| Cero tests RLS automatizados (criterio de aceptación Fase 1; sin `test:rls`) | **P0/P1** | L | AUTÓNOMO (CI Supabase puede NECESITAR-LUCY) |
| Sin guard anti-reincidencia (test que verifique `relrowsecurity` en toda tabla `public`) | P1 | S | AUTÓNOMO |
| Impacto exacto lectura-vs-escritura por tabla en DB viva | — | — | `[pendiente verificación]` vía psql/Studio (NECESITA-LUCY) |

**Lo que está bien:** las 20 tablas core tienen RLS correcta y no-permisiva; service_role está aislado server-only sin fugas; el modelo de políticas (owner-only + deny-by-default) es el adecuado. El problema es de **cobertura incompleta** (tablas nuevas) y **falta total de verificación automatizada** — ambos ya conocidos desde 2026-05-28 (P0-017) y aún abiertos.

Archivos clave: `/home/ansible/workspaces/lucams_shop/supabase/migrations/00000000000002_rls_policies.sql`, `/home/ansible/workspaces/lucams_shop/packages/db/prisma/schema.prisma`, `/home/ansible/workspaces/lucams_shop/apps/web/lib/supabase/service.ts`, `/home/ansible/workspaces/lucams_shop/docs/audits/2026-05-28-mega-audit/db-schema-rls.md`.