# Plan de Trabajo Lucams_shop — 2026-05-28

## Executive Summary

Lucams_shop tiene un esqueleto sorprendentemente sólido para pre-launch: catálogo storefront real, checkout multi-step funcionando contra Wompi Hosted, saga POST-PAID que genera guías Aveonline reales, CMS con versionado, audit trail cableado y baseline de seguridad serio (rate-limit doble, OTP, HIBP, HMAC verificado, CSP con allowlist). Sin embargo, la auditoría 8-dimensiones expone **brechas críticas que impiden cobrar y entregar correctamente hoy**: el carrito NO se vacía tras Order PAID (riesgo doble cobro), el stock NO se decrementa (oversell silencioso), el default Aveonline `bloquegenerarguia=0` con cuenta real genera cartera, los emails transaccionales NO llegan al cliente (`EMAIL_FROM=onboarding@resend.dev`), la ruta `/unsubscribe` enlazada en el welcome viola Ley 1581, y el RBAC granular (MANAGER/FULFILLMENT) solo se enforce en `/admin/usuarios`. Cobertura de tests cubre 5 archivos sobre flujos sin red de seguridad (webhook Wompi, saga, RLS, idempotency — todo sin tests). Hay además ~14 fallbacks y copy customer-facing en voseo argentino que violan el mandato es-CO tuteo de Lucy. Docs `STATE.md`/`ROADMAP.md`/`INTEGRATIONS.md`/`COMPLIANCE.md` desfasados ~17 días y siguen citando Venndelo cuando el código corre Aveonline (riesgo legal subprocesadores). Estimación realista pre-launch: **~165 horas Claude + 11 acciones humanas Lucy** (Resend domain, Turnstile keys, MFA Supabase, fotos productos, anular guías probe Aveonline, validación legal abogada).

## Madurez por Fase ROADMAP

- **Fase 2 Catálogo+Carrito**: **partial** — 8 productos activos (uno inactivo), 4 de 8 sin imágenes, `calendario-mes-a-mes-fotos` con variant Default `{}`, `TemplatesStrip` vacío en 7/8 PDPs por bug `listTemplatesByProduct`, sin caching público, sin rating display. Cart funciona pero no se vacía tras PAID.
- **Fase 3 Estudio Personalización**: **partial** — paradigma slot-por-imán bien construido (~7k LOC, mobile sheet drawer, pinch/wheel zoom, realismo shape-aware, onboarding), pero solo 2 SVGs en `public/templates/` (vs 9+ referenciados), `/d/[token]` no existe (share roto), `public/scenes/` no existe (vista 3D nevera no implementada), 0% test coverage del módulo más complejo del repo, voseo en copy.
- **Fase 4 Checkout+Pagos+Envíos**: **partial** — checkout multi-step + Wompi Hosted + saga POST-PAID + Aveonline real con guías emitidas funcionan, pero: cart no se vacía tras PAID, stock no se decrementa, `bloquegenerarguia=0` genera cartera, cupones sin redención en checkout, refund/cancel desde admin no existe, race condition en `generateOrderNumber`, webhook Wompi sin anti-replay timestamp, página `/admin/integraciones` sigue pidiendo envs Venndelo.
- **Fase 5 Marketing engine**: **not-started** — newsletter cableado a Resend (pero `EMAIL_FROM` en sandbox), `/unsubscribe` roto, `RecommendationLog` schema sin escritura, sin abandoned cart, sin loyalty/referrals.
- **Fase 6 Backoffice**: **partial** — admin sub-fases A/B/C cerradas (CMS, productos, catálogo modular, audit trail, /admin/auditoria, /admin/pedidos como **tabla** no kanban), pero RBAC granular solo en /admin/usuarios, sin MFA, sin inactivity timeout, `/admin/errores`, `/admin/performance`, `/admin/reclamos`, `/admin/mensajes` no existen (caen al placeholder), Visual In-Place Editor (sub-bloque K) declarado pero ausente.
- **Fase 7 Compliance + Launch**: **partial** — banner Ley 1581 con 4 switches OK, 8 páginas legales con CmsMarkdown OK, pero fallback `/legal/privacidad` y `/legal/terminos` son stubs ("documento en revisión"), plazo retracto en fallback aún 5 días hábiles (vs Ley 2439/2024 = 15 calendario), subprocesadores listan Venndelo no Aveonline, sin DIAN, sin uptime monitor externo, sin alertas operacionales, `ErrorReport` sin cablear (mandato "alternativa a Sentry" no cumplido), 5 archivos de tests reales.

## Críticos Bloqueantes (sin esto NO lanzamos)

1. **Cart no se vacía tras Order PAID** — `apps/web/features/orders/service.ts:7-9` promete pero no implementa; riesgo doble cobro real.
2. **Stock no se decrementa en createOrderFromCart** — `apps/web/features/orders/service.ts:6` solo es comentario; oversell silencioso.
3. **Aveonline default `bloquegenerarguia=0` con cuenta real genera cartera** — `apps/web/features/shipping/aveonline.ts:607`; 2 guías probe vivas pendientes anular (86732744650, 535738810).
4. **`EMAIL_FROM=onboarding@resend.dev` (sandbox)** — `apps/web/lib/resend.ts:112`; clientes NO reciben emails transaccionales en producción.
5. **Webhook Wompi sandbox URL no registrada en dashboard** — saga PAID no se cierra automáticamente; workaround manual con `simulate-wompi-webhook.mjs`.
6. **Ruta `/unsubscribe` no existe pero el welcome email la enlaza** — viola Ley 1581 art. 8 lit. d (revocación de consentimiento).
7. **Fallbacks hardcoded de `/legal/privacidad` y `/legal/terminos` son stubs legalmente insuficientes** — si DB no tiene el seed, sitio publica texto inválido.
8. **Plazo de retracto fallback obsoleto (5 días hábiles vs Ley 2439/2024 = 15 calendario)** — `app/legal/devoluciones/page.tsx:11`, `app/ayuda/page.tsx:65`.
9. **Subprocesadores en COMPLIANCE.md + `/legal/subprocesadores` listan Venndelo, no Aveonline + 7 carriers** — Ley 1581 art. 26 (transferencias a terceros).
10. **Templates Aveonline + verificación dominio Resend NO configurados en cuentas externas** — bloqueante operativo.
11. **RBAC granular MANAGER/FULFILLMENT solo en `/admin/usuarios`** — cualquier admin activo puede tocar finanzas/integraciones/email-templates.
12. **`ErrorReport` schema sin escritura + `/api/log-error` no existe** — promesa "alternativa a Sentry" (mandato #7 CLAUDE.md) no cumplida.
13. **Turnstile NO cableado en signup/login/admin-login/recuperar/restablecer/confirmar** — solo newsletter + contacto; SECURITY.md promete coverage completa.
14. **Comparación HMAC Wompi no timing-safe** — `apps/web/lib/wompi.ts:207` (`!==` en vez de `timingSafeEqual`).

## Plan de Trabajo Priorizado

### 🔴 P0 — INMEDIATO (bugs + bloqueantes funcionales)

| ID | Título | Horas | Dependencias | Acción Humana |
|----|--------|-------|--------------|----------------|
| P0-001 | Cart se vacía tras Order PAID (saga clearCart) | 2 | - | no |
| P0-002 | Decremento de stock en createOrderFromCart + revert en CANCELLED | 6 | - | no |
| P0-003 | Aveonline `bloquegenerarguia` default `1` + gate doble flag prod | 1.5 | - | sí (anular guías probe) |
| P0-004 | Verificar dominio `mail.lucamsshop.co` en Resend + `EMAIL_FROM` prod | 2 | acción Lucy DNS | sí (SPF/DKIM/DMARC) |
| P0-005 | Crear ruta `/unsubscribe?token=...` (Ley 1581 revocación) | 3 | - | no |
| P0-006 | Reemplazar fallbacks `/legal/privacidad` y `/legal/terminos` por texto real del seed | 2 | - | sí (validación abogada) |
| P0-007 | Actualizar plazo retracto Ley 2439/2024 (15 días calendario) en fallbacks `/legal/devoluciones`, `/ayuda` y 6 otros | 1 | - | no |
| P0-008 | Subprocesadores: actualizar COMPLIANCE.md tabla 459-470 + fallback `/legal/subprocesadores` → Aveonline + 7 carriers | 1 | - | sí (DPA Aveonline) |
| P0-009 | Turnstile cableado en signup, login, admin-login, recuperar, restablecer, confirmar-codigo | 4 | acción Lucy crear sitio | sí (Cloudflare keys) |
| P0-010 | RBAC matriz `requireRole` + `requirePermission` en finanzas/integraciones/email-templates/usuarios | 10 | - | sí (confirmar matriz) |
| P0-011 | Comparación HMAC Wompi con `timingSafeEqual` | 0.5 | - | no |
| P0-012 | Webhook Wompi sandbox URL fallback: `/checkout/gracias` ejecuta `processPaidOrder` idempotente si tx APPROVED y order PENDING | 2 | - | sí (registrar URL en prod) |
| P0-013 | Bug `listTemplatesByProduct`: agregar `OR: [{productId:null}]` (PDP TemplatesStrip vuelve a poblarse) | 1 | - | no |
| P0-014 | Reemplazo global voseo→tuteo (~14 archivos UI + email templates) | 4 | - | no |
| P0-015 | Reviews PDP: `<ProductReviews>` + `aggregateRating` JSON-LD + estrellas en `<ProductCard>` | 10 | - | sí (decidir seed demo) |
| P0-016 | Implementar `ErrorReport` end-to-end (`lib/error-reporter.ts` + `/api/log-error` + `/admin/errores`) | 8 | - | no |
| P0-017 | RLS habilitada en 18 tablas faltantes (Design, DesignAsset, Consent, CmsBlock, SiteSetting, etc.) + policies owner-only/public-read | 6 | - | sí (apply migration) |
| P0-018 | Página `/admin/integraciones` reemplazar envs Venndelo → Aveonline + healthcheck Aveonline real | 1.5 | - | no |
| P0-019 | STATE.md + ROADMAP.md actualizar bitácora 2026-05-12→2026-05-27 + fases reales | 4.5 | - | sí (confirmar redacción) |
| P0-020 | Idempotency cart→order: agregar `Order.cartId` + lookup por cartId | 3 | - | no |
| P0-021 | Voseo en checkout/datos/datos-form, contacto, ayuda, mi-cuenta, email order-delivered | 4 | - | no |
| P0-022 | Decidir scope Visual In-Place Editor (CMS-01): implementar K o remover docstrings que mienten | 1 (remover) / 16 (implementar) | - | sí (decisión) |
| P0-023 | Fotos faltantes 4 productos (abecedario-magnetico-espanol/ingles, separadores-predisenados, calendario variantes) | 2 | acción Lucy fotos | sí (subir imágenes) |
| P0-024 | SVGs faltantes templates Estudio (9+ referenciados, solo 2 en `public/templates/`) | 16 | acción Lucy assets | sí (diseñar/contratar SVGs) |

**Total P0: ~95 horas Claude**

### 🟠 P1 — ALTO PRE-LAUNCH (testing, compliance, emails productivos, observabilidad)

| ID | Título | Horas | Dependencias | Acción Humana |
|----|--------|-------|--------------|----------------|
| P1-001 | Tests RLS automatizados (Customer/Cart/Order isolation impostor) | 8 | - | sí (decidir Supabase target) |
| P1-002 | Tests unit: verifyWebhookSignature (Wompi+Aveonline), canTransition, formatAveonlineCity, generateIntegritySignature, processPaidOrder | 12 | - | no |
| P1-003 | Test E2E Playwright happy path: storefront → checkout → Wompi sandbox 4242 → /gracias | 6 | - | no |
| P1-004 | Helper `lib/idempotency.ts` (centralizado) + integrar en webhooks Wompi/Aveonline | 4 | - | no |
| P1-005 | CI corre Playwright smoke + `pnpm audit --audit-level=high` + format check unificado | 3 | - | no |
| P1-006 | Cupones: validateCoupon + redención en `/checkout/pago` + recordCouponUsage | 12 | - | no |
| P1-007 | Refund/cancel desde admin: voidTransaction + createRefund + cancelar guía Aveonline + email order-refunded | 16 | - | sí (política retracto) |
| P1-008 | MFA admin TOTP (Supabase factors) | 8 | acción Lucy Supabase | sí (habilitar en dashboard) |
| P1-009 | Inactivity timeout admin 30 min (`lastActivityAt` en AdminUser) | 3 | - | no |
| P1-010 | Webhook Aveonline HMAC real + `timingSafeEqual` + secret SIEMPRE required | 2 | - | sí (.env documentar) |
| P1-011 | Webhook Wompi anti-replay timestamp + environment match | 1 | - | no |
| P1-012 | OTP confirmar-codigo: agregar bucket `emailKey` además de IP | 0.5 | - | no |
| P1-013 | `x-forwarded-for` helper `getClientIp` Vercel-specific (no spoofable) | 2 | - | no |
| P1-014 | StockReservation (ADR-014) implementar en cart.addItem + cleanup pg_cron | 16 | dep P1-022 | no |
| P1-015 | Race condition `generateOrderNumber` con Postgres sequence | 3 | - | no |
| P1-016 | Saga outbox/retry: pg_cron escanea Order PAID sin trackingNumber > 5 min y re-ejecuta processPaidOrder | 8 | dep P1-022 | no |
| P1-017 | Alertas operacionales (errores >10/h, payment stuck, stock bajo) via Resend + pg_cron | 10 | dep P1-022 | sí (`OPS_ALERT_EMAIL`) |
| P1-018 | `/admin/performance` con p50/p75/p95 por route (consume WebVital) | 6 | - | no |
| P1-019 | Trigger auth.users → Customer reemplazo: pg_cron job 24h reconcilia huérfanos | 3 | dep P1-022 | no |
| P1-020 | Mobile nav real en site-header (Sheet con Catálogo, Mi cuenta, Login/Logout) | 3 | - | no |
| P1-021 | Endpoint `/api/cms/settings/[key]` (espejo de blocks/[key]) | 1 | - | no |
| P1-022 | Habilitar pgmq + pg_cron + tabla cache_entries (mandato #11, ADR-016/017) | 6 | - | sí (extensions Supabase) |
| P1-023 | Vercel.json con framework/installCommand/regions explícito | 1 | - | sí (confirmar región) |
| P1-024 | Audit fields: agregar `deletedAt/deletedBy` a Design, DesignAsset, SupportTicket | 2 | - | no |
| P1-025 | Búsqueda `productos?q=` con filtros pasados al SQL (no client-side post-fetch) + ocasion + destacados respetados | 3 | - | no |
| P1-026 | INTEGRATIONS.md reescribir sección Venndelo → Aveonline + ref a INTEGRATIONS_AVEONLINE.md | 3 | - | no |
| P1-027 | ARCHITECTURE.md + PLAN.md: Next.js 15 → 16, lib/cart.ts→cart-session, middleware.ts→proxy.ts, árbol carpetas real | 2.5 | - | no |
| P1-028 | OPERATIONS.md + SECURITY.md: env vars + CSP + runbook Aveonline (no Venndelo) | 3 | - | no |
| P1-029 | ADR-040..043: Aveonline test/prod + business data SiteSettings, link mágico /pedido/<token>, COD diferido superseded ADR-009, FormData server actions 50mb | 4 | - | sí (confirmar TTL token) |
| P1-030 | Caching `unstable_cache` en queries públicas catálogo + sitemap revalidate 3600 | 4 | - | no |
| P1-031 | Newsletter soft-fail: en prod si RESEND_API_KEY falta → ok:false + reconciliation job | 2 | - | no |
| P1-032 | Plantillas PREMADE para `kind=NONE` (separadores predisenados) | 4 | acción Lucy assets | sí (4-8 diseños) |
| P1-033 | Reportar al servidor desde `global-error.tsx` con sendBeacon | 1 | dep P0-016 | no |
| P1-034 | `RecommendationLog` persist en `/api/catalog/recommend` (decisión 6.10) | 2 | - | no |
| P1-035 | Robots.txt + sitemap.xml consistencia: rutas amigables `/productos/[categoria]` o robots ajustado | 4 | - | no |
| P1-036 | Coverage thresholds en `vitest.config.ts` (tras P1-001/002/003) | 0.5 | dep P1-001/002 | no |
| P1-037 | BetterStack uptime monitor → `/api/health/all` cada 1 min | 1 | acción Lucy cuenta | sí (BetterStack) |
| P1-038 | Email-templates: importar `escapeHtml` desde layout (DRY) + actualizar to es-CO tuteo | 1 | dep P0-021 | no |
| P1-039 | RESEND_WEBHOOK_SECRET + AVEONLINE_WEBHOOK_SECRET documentar en `.env.example` + OPERATIONS.md | 0.5 | - | sí (rotar y setear) |

**Total P1: ~172 horas Claude**

### 🟡 P2 — POST-LAUNCH (mejoras importantes pero no bloqueantes v1)

| ID | Título | Horas | Dependencias | Acción Humana |
|----|--------|-------|--------------|----------------|
| P2-001 | Circuit breaker extraído a `lib/circuit-breaker.ts` + Wompi/Aveonline | 4 | - | no |
| P2-002 | DIAN factura electrónica (Alegra/Siigo/Facture integración real) | 24 | - | sí (elegir proveedor) |
| P2-003 | `proxy.ts` skip Supabase auth para hot paths `/api/health`, `/api/vitals`, `/api/cms/blocks` | 2 | - | no |
| P2-004 | CSP nonces + `frame-ancestors 'none'` + gate `unsafe-eval` solo dev | 5 | - | no |
| P2-005 | Bucket "unknown" XFF fallback fail-open con log | 0.5 | - | no |
| P2-006 | quoteShipping cache por hash(cart+destino) TTL 30 min | 4 | dep P1-022 | no |
| P2-007 | Reorganizar `packages/db/scripts/` en `seed/probe/simulate/maintenance/archive` | 2 | - | no |
| P2-008 | Drift docs: CLAUDE.md table-of-contents agregar PLAN_CATALOG_V2 / INTEGRATIONS_AVEONLINE / QA_CHECKLIST / etc | 0.5 | - | no |
| P2-009 | `loading.tsx` en home, ayuda, contacto, mi-cuenta, legal/* | 3 | - | no |
| P2-010 | Skeletons reusables `components/skeletons/*` + empty states `components/empty-states/*` | 5 | - | no |
| P2-011 | Three.js / vista nevera escenas reales (o mockup simple con overlays) | 16 (simple) / 60 (Three.js) | - | sí (decidir alcance) |
| P2-012 | `/d/[token]` share design público (M.3.b.E) | 6 | - | no |
| P2-013 | Studio tests: unit canvas-migrate, grid-layout, parsePhotoProductConfig + E2E happy path | 16 | - | no |
| P2-014 | Search dropdown muestra `minVariantPrice + variantCount` ("desde X") | 2 | - | no |
| P2-015 | Rating display en `<ProductCard>` (estrellas + count) | 4 | dep P0-015 | no |
| P2-016 | Site-header: getCurrentAdmin → AdminChip client con cache | 1 | - | no |
| P2-017 | searchCmsBlocks con unstable_cache | 1 | - | no |
| P2-018 | Cobertura `<CmsMarkdown>` fallback testeable (DB mock vacía) | 4 | - | no |
| P2-019 | Maintenance gate verificar `proxy.ts` redirige cuando flag activo | 1.5 | - | no |
| P2-020 | `.well-known/security.txt` crear | 0.25 | - | no |
| P2-021 | StockReservation + InventoryLog cableado completo (write desde createOrder) | 8 | dep P1-014 | no |
| P2-022 | Dependabot/Renovate + gitleaks baseline | 1.5 | - | no |
| P2-023 | Logger child + sampling + LOG_LEVEL_MODULE override | 3 | - | no |
| P2-024 | Filter sidebar: reemplazar `<select>` orden por shadcn Select/radiogroup | 1 | - | no |
| P2-025 | Webhook Resend: retornar 500 en errores DB transient (no 200) | 0.5 | - | no |
| P2-026 | `legal/layout.tsx` clase `prose` aplicar al CmsMarkdown correctamente | 1 | - | no |
| P2-027 | `taxes` IVA breakdown pasado a Wompi (preparación DIAN) | 2 | - | no |
| P2-028 | `processFailedPaymentOrder` email con métodos alternativos + link carrito | 2 | - | no |
| P2-029 | Banner cookies mencionar Cloudflare Turnstile en "Necesarias" | 0.5 | - | sí (DPA Cloudflare) |
| P2-030 | PLAN.md árbol carpetas: congelar como histórico o reescribir | 1 | - | sí (decidir) |
| P2-031 | TTL `WebVital` 90 días + `SiteEvent` purge job pg_cron | 1 | dep P1-022 | no |
| P2-032 | ADR numeración limpiar (eliminar reservas usadas, dejar "siguiente libre: 044") | 0.5 | - | no |

**Total P2: ~129 horas Claude**

### 🟢 P3 — POLISH (nice-to-have)

| ID | Título | Horas | Dependencias | Acción Humana |
|----|--------|-------|--------------|----------------|
| P3-001 | Logger redact email→hashedDomain (preservar utilidad diagnóstico) | 1 | - | no |
| P3-002 | Password strength server-side reject score<=1 | 0.5 | - | no |
| P3-003 | CSRF_SECRET fail-closed en prod | 0.5 | - | sí (confirmar valor real) |
| P3-004 | Smoke E2E selectores con `data-testid` no role+level | 0.5 | - | no |
| P3-005 | Workflow `post-deploy-smoke.yml` con notificación email/WhatsApp | 2 | - | sí (canal) |
| P3-006 | Connection pool tuning DATABASE_URL `?connection_limit=5&pool_timeout=20` | 0.5 | - | sí (editar .env via sed) |
| P3-007 | Smoke spec selectores frágiles refactor | 0.5 | - | no |
| P3-008 | `SANDBOX_CHECKOUT` rename a `CHECKOUT_URL` con comentario | 0.25 | - | no |
| P3-009 | Verificar ruta `/contacto` referenciada desde checkout | 0.5 | - | no |
| P3-010 | Prettier 3.8.3 → 3.8.4 | 0.1 | - | no |
| P3-011 | `next-themes` remove si no se usa | 0.25 | - | no |
| P3-012 | Catch-all placeholder textos sincronizar con ROADMAP actualizado | 1 | dep P0-019 | no |
| P3-013 | Sitemap `revalidate: 3600` en vez de force-dynamic | 0.5 | - | no |
| P3-014 | README Estudio sincronizar con realidad (no afirmar tests ≥80% ni 30 SVGs) | 0.5 | - | no |
| P3-015 | TESTING.md agregar bloque "Tests ya implementados" | 0.25 | - | no |
| P3-016 | `lib/admin-audit.ts` fallback a pgmq si falla DB | 3 | dep P1-022 | no |
| P3-017 | Webhook Aveonline en dev requerir secret (no permit-all) | 0.25 | - | no |
| P3-018 | TESTING.md sincronizar coverage targets con realidad | 0.5 | - | no |
| P3-019 | Order.publicAccessToken index compuesto `[publicAccessToken, deletedAt]` | 0.5 | - | no |
| P3-020 | Migration enum AVEONLINE: verificar `--without-transactions` no rompe deploy | 1 | - | no |

**Total P3: ~13 horas Claude**

## Acciones Humanas Requeridas (Lucy)

1. **Configurar dominio `mail.lucamsshop.co` + verificar SPF/DKIM/DMARC en Resend** — `EMAIL_FROM` en sandbox bloquea TODOS los emails al cliente. Bloquea Fase 4 cierre.
2. **Anular las 2 guías probe Aveonline (86732744650, 535738810) en dashboard** — cartera real pendiente; bloquea launch.
3. **Registrar webhook Wompi sandbox URL en dashboard** — sin esto la saga no cierra automáticamente; bloquea testing E2E sin workaround.
4. **Crear sitio Cloudflare Turnstile + setear keys en Vercel (prod+preview) y `.env.local`** — bloquea P0-009 (Turnstile en flujos auth).
5. **Habilitar MFA factors en Supabase Auth dashboard + enrollar TOTP la primera vez** — bloquea P1-008 (mandato SECURITY.md MFA admin).
6. **Subir fotos de 4 productos sin imagen** (abecedario-magnetico-espanol/ingles, separadores-predisenados, definir variantes calendario) — bloquea Fase 2 cierre.
7. **Diseñar/contratar 9-30 SVG mockups para Estudio (o aprobar simplificar a 3-5 reales)** — bloquea Fase 3 cierre + diferenciador #1.
8. **Aprobar texto legal final** (privacidad, términos, devoluciones Ley 2439/2024, subprocesadores Aveonline) con abogado — bloquea Fase 7 launch.
9. **Confirmar DPA con Aveonline + 7 carriers** — bloquea cumplimiento Ley 1581 art. 26.
10. **Setear `OPS_ALERT_EMAIL`, `RESEND_WEBHOOK_SECRET`, `AVEONLINE_WEBHOOK_SECRET`, `CSRF_SECRET` reales en Vercel env prod** — bloquea P1-017/039.
11. **Crear cuenta BetterStack + monitor a `/api/health/all`** — uptime SLI sin telemetría real, bloquea P1-037.

## Estimación Horas Totales

- **P0**: ~95 horas (rango 95-110 si Visual In-Place Editor se implementa en vez de remover)
- **P1**: ~172 horas
- **P2**: ~129 horas (rango 129-173 si Three.js elegido)
- **P3**: ~13 horas
- **TOTAL: ~409 horas Claude pre-launch + post-launch v1.x**
  - **Solo P0 + P1 (pre-launch hard-block)**: ~267 horas
  - **Costos externos estimados**: $0/mes (Vercel/Supabase/Resend/Cloudflare Free) hasta launch + ~$68 USD/mes prod + comisiones Wompi/Aveonline

## Secuencia Recomendada de Ataque

1. **Bloque A — Saga + Pagos sin escapes** (~13h): P0-001, P0-002, P0-003, P0-011, P0-012, P0-020, P1-011. **Razón**: cerrar el agujero de doble cobro, oversell, cartera Aveonline, y HMAC timing-safe antes de que llegue un cliente real. Es el core de "no perdemos plata".
2. **Bloque B — Emails productivos + Compliance Ley 1581** (~12h): P0-004, P0-005, P0-006, P0-007, P0-008, P1-038, P1-039. **Razón**: Lucy necesita iniciar DNS/DPA hoy (acciones humanas en paralelo); este bloque desbloquea el cliente recibiendo confirmación de pago + cumplimiento Ley 2439/2024 + subprocesadores correctos.
3. **Bloque C — Seguridad: RBAC + Turnstile + RLS** (~22h): P0-009, P0-010, P0-017, P1-008, P1-009, P1-010, P1-012, P1-013. **Razón**: cierra los huecos auth/authz documentados en SECURITY.md como ya cumplidos pero ausentes en código. MFA admin + RBAC granular son condición pre-launch real.
4. **Bloque D — Voseo + UX Colombia + Catálogo display bugs** (~13h): P0-013, P0-014, P0-021, P0-015, P1-020, P1-025. **Razón**: identidad de marca colombiana coherente + TemplatesStrip se vuelve visible + reviews en PDP + mobile nav real. Conversión storefront depende de esto.
5. **Bloque E — Observabilidad sin Sentry** (~28h): P0-016, P1-017, P1-018, P1-022, P1-033, P1-037. **Razón**: cumplir mandato #7 (sin Sentry → alternativa propia). pgmq+pg_cron es prerequisito de alertas + saga retry + cron limpieza.
6. **Bloque F — Testing red de seguridad mínima** (~30h): P1-001, P1-002, P1-003, P1-004, P1-005, P1-036. **Razón**: con saga POST-PAID y webhooks en prod, sin tests cada cambio puede romper ventas en silencio. Esto baja el riesgo de regresiones futuras.
7. **Bloque G — Refund/Cancel + Cupones + Race conditions** (~33h): P1-006, P1-007, P1-014, P1-015, P1-016, P1-019. **Razón**: Ley 1480 retracto requiere botón admin. Cupones es feature anunciada en admin que cliente no puede usar. Reservation + outbox saga preparan launch con tráfico real.
8. **Bloque H — Docs sincronizadas** (~17h): P0-019, P1-026, P1-027, P1-028, P1-029, P1-031, P1-032, P1-034, P1-035. **Razón**: actualizar STATE/ROADMAP/INTEGRATIONS/ARCHITECTURE/OPERATIONS/SECURITY/COMPLIANCE evita que la próxima sesión Claude o auditoría externa parta de información obsoleta. Después de cerrar P0+P1 técnico hay claridad de qué documentar.
9. **Bloque I — Assets externos coordinados con Lucy** (~18h en paralelo): P0-023, P0-024, P1-032. **Razón**: depende de Lucy + diseñador externo; arrancar en paralelo al resto.
10. **Bloque J — Decisiones de scope con Lucy** (~variable): P0-022 (Visual In-Place Editor), P1-007 (política retracto), P2-002 (DIAN proveedor), P2-011 (Three.js sí/no). **Razón**: bloqueos de decisión que no son trabajo Claude.
11. **Bloque K — Post-launch hardening** (P2 entero, ~129h): atacar progresivamente tras launch v1 con métricas reales.

## Riesgos y Watchouts

- **Doble cobro inminente**: si se abre tráfico antes de P0-001, un cliente que refresque tras pagar puede pagar dos veces. Bug confirmado por inspección, no teórico.
- **Oversell silencioso**: P0-002 + P1-014 deben ir juntos antes de publicar stock real; abrir con stock infinito (Lucy lo controla manualmente) mientras tanto es válido como mitigación temporal.
- **Cartera Aveonline corre desde hoy**: cada test sin `AVEONLINE_GENERATE_REAL=false` emite guía facturable; P0-003 + acción humana #2 son lo primero a hacer hoy.
- **Voseo + textos legales obsoletos visibles**: Lucy probablemente esté navegando el sitio y reportando estos textos como "raros"; consolidar P0-014 + P0-021 + P0-006/007 reduce ruido reportado.
- **Tests ausentes amplifican riesgo de cada cambio futuro**: cualquier refactor en saga/Wompi/Aveonline puede romper ventas. P1-001/002/003 deben preceder cualquier sprint grande post-launch.
- **Docs desincronizados confunden futuras sesiones**: cada nueva sesión Claude que parta de STATE.md viejo reinventa la rueda o repite trabajo; P0-019 paga dividendos compuestos.
- **Mandato #11 pgmq/pg_cron sin cumplir**: alertas, retry de saga, cleanup `rate_limit_buckets`, reconciliation auth.users, expiración StockReservation, TTL WebVital — todo depende de P1-022. Sin esto, varias features quedan deadcode o crecen sin control.
- **Visual In-Place Editor declarado pero ausente** confunde a quien lee el código y promete a Lucy una feature que no existe; decidir hoy (P0-022) limita expectativas mal seteadas.
- **`/admin/pedidos` es tabla no kanban**: contexto inicial decía kanban; verificar con Lucy si la tabla actual le funciona o si esperaba kanban (drift de información).
- **COD oculto al cliente** (commit a96d5b4) contradice ADR-009 ("contraentrega activa desde día 1"); ADR-042 (superseded) debe documentar el porqué + cuándo se reactiva.
- **Branch develop con cambios sin merge a main**: este plan asume develop como source of truth pre-launch; verificar antes de merge final.

## Acciones Humanas para Hoy / Esta Semana

1. **Lucy hoy mismo**: Entrar a dashboard Aveonline y anular guías 86732744650 + 535738810 antes de que generen factura. Confirmar a soporte Aveonline que no se facturen. (5 minutos, evita cartera.)
2. **Lucy esta semana**: Comprar/configurar subdominio `mail.lucamsshop.co` en proveedor DNS, agregar registros SPF + DKIM + DMARC siguiendo el wizard de Resend dashboard, esperar verificación (~24-48h propagación). Sin esto el cliente NO recibe ningún email. (1h trabajo + espera DNS.)
3. **Lucy esta semana**: Crear sitio Turnstile en Cloudflare (Free tier), copiar site key + secret key, setear en Vercel env (prod + preview). Bloquea P0-009 que es ~4h de trabajo Claude. (15 minutos.)
4. **Lucy esta semana**: Habilitar MFA factors en Supabase Auth → Providers (toggle), enrollar TOTP en su propia cuenta admin con Google Authenticator/Authy. Bloquea P1-008. (10 minutos.)
5. **Lucy esta semana**: Subir las fotos faltantes de los 4 productos (abecedario-magnetico-espanol, abecedario-magnetico-ingles, separadores-predisenados, y definir variantes del calendario). Mientras tanto Claude no puede cerrar Fase 2 madurez. (1-2h.)