# Auditoría 360° — Coherencia funcional, cableado cliente–admin y saneamiento productivo de LuCam's

> **Fecha:** 2026-09-11 (17:55–21:05 COT) · **Modo:** DIAGNÓSTICO EXHAUSTIVO + PLAN DE REMEDIACIÓN — **sin cambios funcionales, sin borrados, sin commits**.
> **Alcance:** totalidad del sistema (storefront, Estudio, admin, API, DB, integraciones, crons, scripts, tests, docs) en los 3 ambientes (LOCAL/STG/PRD), conforme a `docs/AUDITORIA_360.md`.
> **Reglas respetadas:** cero lectura de `.env*` (solo clasificación de destino por ref de proyecto, nunca valores), cero PII (conteos, claves de negocio y valores redactados), cero ejecución de seeds/migraciones/purgas, cero `git` mutante, consultas SQL exclusivamente de lectura.

---

## A. Baseline

| Ítem | Valor |
|---|---|
| Fecha y hora de la revisión | 2026-09-11, 17:55 COT (inicio) — 21:05 COT (cierre) |
| Rama | `develop` |
| SHA `develop` (local = origin) | `ddc8ce6be38abbcf46d1b364d1b2b078d56778f8` |
| SHA `production` (origin) | `8408440050981bdfbec48f0d687e2ab4485b2571` |
| Commits en `develop` no en `production` | **1** — `ddc8ce6 docs(handoff): release del saneamiento a PRD (8408440)` (solo docs) |
| Working tree | Limpio salvo 1 untracked: `docs/AUDITORIA_360.md` (el encargo). **Sin cambios locales que preservar** |
| Últimos commits | `ddc8ce6` docs handoff · `8408440` merge PR #45 (saneamiento info pública/legal/ayuda) · `346f3f7` fix literales /contacto · `ac161ac` saneamiento integral info pública · `6a5e928` docs handoff multi-unidad |
| Ambientes disponibles | LOCAL (stack Supabase local podman, :54322, sano 10h up) · STG (ref `mjbdiqdkykhsixvqlrrp`) · PRD (ref `zxkucphbsfygakgxcnik`) — los 3 accesibles y consultados read-only |
| Modo de tienda | PRD = `full` (desde 2026-09-03); LOCAL espejo en `catalog`; `STORE_MODE` fail-closed a `full` (`apps/web/lib/store-mode.ts:17-29`) |
| Limitaciones | ① No se ejecutaron probes en vivo contra PRD (los healthchecks son públicos pero apuntan a producción; estados reales de salud = UNKNOWN_NOT_PROBED salvo evidencia de código/datos). ② No hay dev server local corriendo; los E2E no se corrieron (suite full-mode es LOCAL-only y crea datos; se revisaron estáticamente). ③ El tráfico real de las rutas `/api/catalog/*`, `/api/cms/*`, `/api/coupons/public` no es verificable desde el repo (requeriría logs de Vercel). ④ La procedencia "aplicado" de one-shots se infiere de headers/fechas/STATE.md, no de auditoría de ejecución. ⑤ `.env.local.nube-backup` se usó solo como canal de conexión read-only a PRD (clasificado `prd` por ref antes de usarlo); nunca se leyó ni imprimió su contenido |

---

## B. Veredicto ejecutivo

# 🟡 PRODUCCIÓN OPERATIVA CON GAPS

El núcleo transaccional (carrito → checkout → Wompi/COD → saga → guía Aveonline → tracking → entrega) está cableado bidireccionalmente y es robusto: idempotencia en 5 capas, máquina de estados con transiciones gated, decremento de stock atómico, dedup de webhooks, re-validación de cupón dentro de la transacción, RLS en el 100 % de las tablas, MFA+RBAC con auditoría en las 33 pantallas admin operativas, 8/8 crons cruzados endpoint↔job (verificado en DB), 23/23 plantillas de email con emisor, 5/5 tipos de notificación con productor, 0 páginas placeholder en storefront y 0 en el panel.

Pero la operación productiva coherente **todavía no está demostrada** porque existen, verificados con evidencia:

1. **Un hueco de integridad de venta (CRÍTICO):** la creación de la orden no filtra items archivados/pausados del carrito crudo — un producto retirado entre la carga del checkout y el pago puede entrar a la orden con un total distinto al exhibido (CF-01).
2. **La suite de tests está roja en `develop`** de forma determinista (1/3638) y la CI no la ve por diseño (CF-02).
3. **Falsas alarmas y ciegos operativos en el panel de integraciones:** warnings fijos para Wompi/Aveonline con probes reales huérfanos; una caída real sería indistinguible (CF-03). Además: **rebote de email en PRD ~47–50 % sostenido dos meses sin ninguna alerta** (CF-04).
4. **Datos de test en producción:** 42 de 43 cupones de PRD son restos objetivos de tests de integración; **PRD no tiene ningún cupón real vigente** (CF-05). El drift `usedCount ≠ usos reales` afecta a 21 cupones en los 3 ambientes.
5. **Funcionalidades visibles que no cumplen lo que prometen:** el strip PREMADE del Estudio genera URLs que nadie consume (y hay 0 plantillas PREMADE en DB) (CF-07); `/admin/mensajes` es una duplicación exacta de `/admin/soporte` (CF-08); `/admin/email-templates` promete edición de 24 plantillas y solo 1 lee CMS (CF-14); `/status` dice "Wompi pendiente" con Wompi operando (CF-16); el "re-consent" afirmado en docs no re-muestra el banner (CF-15).
6. **Seeds que pueden pisar la operación:** `seed-products.mjs` sobrescribe precios/imágenes administrados, reactiva pausados, archiva productos creados a mano e inserta reseñas demo; 63/79 scripts sin env-guard y la guarda es fail-open ante hosts no-Supabase (CF-09).
7. **Deriva documental estructural:** ROADMAP marca "pendiente" una fase ~80 % construida; QA_CHECKLIST describe una CTA de personalización que ya no existe (CF-18).

Nada de esto impide vender hoy (PRD lleva 8 días en `full` con 0 pedidos reales), pero varios ítems mienten al operador o al cliente, y el primero puede cobrar de más.

---

## C. Cobertura

| Superficie | Revisados | Total | Cobertura | Sin clasificar |
|---|---|---|---|---|
| Páginas públicas | 37 | 37 (34 visibles + 3 `/internal/*` dev-only) | 100 % | 0 |
| Páginas autenticadas de cliente (`/mi-cuenta/*`) | 10 | 10 | 100 % | 0 |
| Páginas administrativas (`page.tsx` bajo `/admin`) | 62 | 62 (35 módulos: 33 UI real + 2 redirects estructurales + login/MFA/subpáginas) | 100 % | 0 |
| Entradas del menú admin (`getAdminNav`) | 39 | 39 | 100 % | 0 |
| Rutas resueltas por el catch-all `[...placeholder]` | 2 | 2 (`/admin/bot`, `/admin/canales/mercadolibre`, ambas ocultas) | 100 % | 0 |
| API routes | 37 | 37 (+3 route handlers fuera de `/api`) | 100 % | 0 |
| Webhooks | 3 | 3 (Wompi, Aveonline, Resend) | 100 % | 0 |
| Endpoints cron | 8 | 8 (cruzados 8/8 con jobs pg_cron) | 100 % | 0 |
| Jobs programados | 13 | 13 (10 pg_cron — verificados en DB — + backup diario GHA + DR drill mensual GHA + nightly GHA) | 100 % | 0 |
| Server Actions | 64/64 archivos, 169/169 exports | 64 / 169 | 100 % | 0 (2 exports huérfanos identificados: CF-06) |
| Feature folders | 34 | 34 | 100 % | 0 |
| Servicios y repositories | 62 | 62 | 100 % | 0 |
| Modelos Prisma | 57 | 57 | 100 % | 0 |
| Tablas SQL no Prisma | 1 | 1 (`rate_limit_buckets`) | 100 % | 0 |
| Migraciones | 83 | 83 (53 Prisma + 30 Supabase) | 100 % | 0 |
| Buckets de Storage | 5 | 5 | 100 % | 0 |
| Plantillas de email | 23 | 23 | 100 % | 0 |
| Tipos de notificación | 5 | 5 | 100 % | 0 |
| Integraciones externas | 10 | 10 | 100 % | 0 |
| Variables de entorno | 59 | 59 documentadas (+11 consumidas ausentes del example, 10 test/CI + `PRISMA_LOG`) | 100 % | 0 |
| Scripts DB (`packages/db/scripts`) | 79 | 79 (+2 archivos de datos) | 100 % | 0 |
| Scripts one-shot | 45 | 45 (dentro de los 79) | 100 % | 0 |
| Seeds | 13 | 13 (5 canónicos Makefile + 8 especializados) | 100 % | 0 |
| Scripts de limpieza | 7 | 7 | 100 % | 0 |
| Scripts operativos (raíz + `apps/web/scripts` + hooks) | 14 | 14 | 100 % | 0 |
| Workflows CI/CD | 4 | 4 | 100 % | 0 |
| Documentos canónicos | 27 | 27 (23 raíz + 2 audits + 1 design + 1 incidents) | 100 % | 0 |
| Suites de tests | 296 | 296 (228 vitest: 177 unit + 48 integración + 3 live · 67 E2E · 1 k6) | 100 % | 0 |

Cobertura total: **ningún elemento sin clasificar**. Los ambientes de datos se auditaron por separado (§G) con consultas read-only ejecutadas en los 3 (exit 0).

---

## D. Mapa de capacidades (matriz maestra)

Leyenda de evidencia: rutas relativas a `apps/web/` salvo indicación. Disposiciones según §7 del encargo. "✓" = existe y está cableado; "—" = no aplica/inexistente.

| Capacidad | Propósito de negocio | Entrada cliente | Entrada admin | API/Server Action | Servicio | Modelos/Storage | Integración | Cron/Webhook | Email/Notif | Caché/invalidación | Modo/Roles | Tests | Docs | Estado | Disposición |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Catálogo público (home, PLP, PDP, ocasiones, buscador) | Vender | `/`, `/productos`, `/producto/[slug]`, `/ocasion/[slug]` | `/admin/productos|categorias|ocasiones` | `app/actions/search.ts`, actions catálogo | `features/products/*`, `lib/catalog.ts` | Product/Variant/Category/OcasionTag + `product-images` | — | — | — | tag `catalog` TTL 1h (`lib/catalog.ts:19`) | ambos modos / CATALOG | unit+int+e2e | ARCHITECTURE, PLAN_CATALOG_V2 | PRODUCTIVO | MANTENER |
| Sitemap/robots/SEO | Descubribilidad | `sitemap.ts`, `robots.ts` | — | — | `lib/catalog` | ídem | — | — | — | dinámico | ambos | `manifest.test.ts`, e2e seo | — | PRODUCTIVO | MANTENER |
| Redirects 301/302 | SEO + migraciones de slug | proxy aplica en GET (`proxy.ts:167-193`) | `/admin/redirects` | CRUD actions | `features/redirects/service.ts` | UrlRedirect | — | hits counter | — | cache 60 s en proxy | SUPER | unit+e2e | CONVENTIONS | PRODUCTIVO | MANTENER |
| Recomendador | Venta asistida | `/recomendador` | — | `GET /api/catalog/recommend` | `lib/catalog` | — | — | — | — | — | ambos | e2e homolog | — | PRODUCTIVO | MANTENER |
| Estudio (editor Konva/3D) | Diferenciador #1 | `/estudio/[slug]` | `/admin/plantillas`, `/admin/disenos`, `/admin/fichas` | actions `personalization` (7) | `features/personalization/*` | Design/DesignAsset/Template/LetterTile*/Gallery + 3 buckets | Gemini (IA) | — | moderación emails | sin caché (fresco) | ambos / CATALOG | 43+17 unit, int, e2e | README estudio | PRODUCTIVO_CON_GAP (CF-07) | CORREGIR_CABLEADO |
| Strip de plantillas PDP | Atajo de diseño | `TemplatesStrip` en PDP | — | `listTemplatesByProduct` | `lib/catalog.ts:927` | Template | — | — | — | tag `catalog` | ambos | int | — | PRODUCTIVO_CON_GAP (CF-07: `?template=`/`?templateId=` sin consumidor) | CORREGIR_CABLEADO |
| Carrito (anon/auth/fusión) | Venta | `/carrito` | — | actions carrito (4) | `features/cart/service.ts` | Cart/CartItem | — | — | — | dinámico | ambos / público | unit+int+e2e | — | PRODUCTIVO | MANTENER |
| Recuperación de carrito | Revenue | link email `/carrito/recuperar/[token]` | resumen diario | cron `cart-recovery` | `features/cart/recovery-service.ts` | AbandonedCart | Resend | pg_cron 1h ✓ | cart-recovery | — | full | int+e2e | OPERATIONS | PRODUCTIVO | MANTENER |
| Checkout 3 pasos | Venta | `/checkout/{datos,envio,pago,gracias}` | — | actions checkout (8) | `features/checkout/service.ts` | cookie HMAC `checkout_state` | Aveonline cotización, Wompi | — | — | revalidate por paso | full (redirect duro en catalog) | int+e2e fullmode | RUNBOOK | PRODUCTIVO | MANTENER |
| Pago Wompi | Cobro | `/checkout/pago` → hosted | `/admin/pedidos` | `payWompiAction`, webhook | `features/payments/wompi.ts`, `orders/saga.ts` | Order/WebhookEvent/InventoryLog | Wompi | webhook ✓ dedup | confirmation/admin/failed | — | full | int+e2e+live | INTEGRATIONS | PRODUCTIVO | MANTENER |
| Contraentrega (COD) | Cobro alterno | `/checkout/pago` | `/admin/finanzas/{conciliacion,bloqueos}` | `payCodAction` | `checkout/cod-risk.ts`, `orders/cod-reconciliation.ts` | CodReconciliation/BlockedIdentity | Aveonline recaudo | — | confirmation | — | full / SUPER | int+e2e | ADR-064/065 | PRODUCTIVO | MANTENER |
| Pedidos (ciclo de vida) | Operación | `/mi-cuenta/pedidos*`, `/pedido/[token]`, `/rastrear` | `/admin/pedidos` + detalle | 5 actions admin + saga | `features/orders/*` | Order/OrderItem/InventoryLog | Wompi/Aveonline | webhooks ✓ | 7 transaccionales | — | full / ALL | 55+ int, e2e | OPERATIONS | PRODUCTIVO_CON_GAP (CF-01, CF-11, CF-27) | CORREGIR_CABLEADO |
| Reservas de stock | Anti-oversold | — | — | — | — | StockReservation (0 filas, 0 consumidores) | — | cron SQL 1/min limpia tabla vacía | — | — | — | — | ADR-014 (diferida) | LEGACY_NO_REFERENCIADO | RETIRAR_CÓDIGO o POSPONER_CON_ADR (CF-13) |
| Stock e inventario | Disponibilidad | PDP badge | `/admin/inventario`, editor en `/admin/productos` | `setVariantStockAction` | `features/orders/stock.ts`, `products/stock-admin.ts` | ProductVariant/InventoryLog | — | — | back-in-stock reacciona | **PLP no se invalida** (CF-17) | CATALOG / MANAGER_UP | int+e2e | — | PRODUCTIVO_CON_GAP | CORREGIR_CABLEADO |
| Back-in-stock | Recuperar demanda | botón PDP agotado | — | action + cron | `features/back-in-stock/service.ts` | BackInStockSubscription/Consent | Resend | pg_cron 30 min ✓ | back-in-stock | — | ambos | int+e2e | — | PRODUCTIVO | MANTENER |
| Cupones | Promoción | campo en `/checkout/pago` | `/admin/cupones` | 5 actions admin + apply/remove | `features/coupons/*` | Coupon/CouponUsage | — | — | — | tags `coupons`✓ / `catalog` parcial; revalidate admin erróneo | full / SUPER | 4 suites+e2e | — | PRODUCTIVO_CON_GAP (CF-05, CF-06) | CORREGIR_CABLEADO |
| Envíos y tracking | Entrega | `/rastrear`, `/pedido/[token]` | `/admin/pedidos`, `/admin/integraciones/aveonline` | webhook aveonline | `features/shipping/aveonline.ts` | Order.tracking*/WebhookEvent | Aveonline | webhook ✓ | shipped/delivered | — | full | int+live+e2e | INTEGRATIONS_AVEONLINE | PRODUCTIVO_CON_GAP (CF-27) | CORREGIR_CABLEADO |
| Reembolsos | Post-venta | — | `/admin/pedidos/[number]` | `refundOrderAction` | `features/orders/service.ts:657` | Order.refunded* | **Wompi manual** | — | refund-issued | — | SUPER+MFA | int | — | PRODUCTIVO_CON_GAP (CF-20) | POSPONER_CON_ADR |
| Retracto (Ley 2439) | Cumplimiento | `/mi-cuenta/pedidos/[number]` | `/admin/retractos` | 2+4 actions | `features/retract/service.ts` | RetractRequest | — | — | 4 retract-* | — | full / SUPER | int+e2e | COMPLIANCE | PRODUCTIVO | MANTENER |
| Garantías (Ley 1480) | Cumplimiento | `/mi-cuenta/pedidos/[number]` | `/admin/garantias` | 2+4 actions | `features/warranty/service.ts` | WarrantyClaim | — | — | 2 warranty-* | — | full / MANAGER_UP | int | COMPLIANCE | PRODUCTIVO (RBAC CF-24) | CORREGIR_CABLEADO |
| Reclamos | Cierre rápido de garantías | (mismo origen) | `/admin/reclamos` | 2 actions | mismos servicios | WarrantyClaim | — | — | — | — | MANAGER_UP | int | decisión documentada | DUPLICADO parcial justificado | MANTENER |
| Soporte/contacto | Atención | `/contacto` | `/admin/soporte` ≡ `/admin/mensajes` | `submitContactAction` + 2 actions gemelas | `features/support/*` | SupportTicket | Turnstile | — | 2 support-* | — | ambos / MANAGER_UP | int+e2e | — | PRODUCTIVO_CON_GAP (CF-08, CF-12) | CONSOLIDAR |
| Cotizaciones (modo catálogo) | Venta por WhatsApp | `/checkout/datos` (catalog), `/cotizacion/[token]` | `/admin/cotizaciones` + taller | actions quotes | `features/quotes/*` | Quote/QuoteItem | wa.me | — | quote emails | — | catalog / MANAGER_UP | int+e2e | — | OCULTO_POR_MODO (PRD=full) | MANTENER |
| Auth cliente (OTP) | Cuentas | `(auth)/*` | — | 7 actions | Supabase Auth + HIBP + Turnstile | Customer | Supabase/Resend/HIBP | — | OTP + account-exists | — | público | int+e2e homolog | SECURITY | PRODUCTIVO | MANTENER |
| Cuenta y perfil | Self-service | `/mi-cuenta/*` (10) | `/admin/clientes` | 12 actions | `features/account/*`, `addresses`, `customers` | Customer/Address | — | — | — | — | autenticado | int+e2e | — | PRODUCTIVO | MANTENER |
| Eliminación de cuenta (Ley 1581) | Cumplimiento | `/mi-cuenta/eliminar` | — | `deleteAccountAction` | `features/account/delete-service.ts` | anonimiza 12 modelos | — | — | (sin email de cierre — menor) | — | autenticado | int | COMPLIANCE | PRODUCTIVO_CON_GAP menor | MANTENER |
| Reseñas | Prueba social | PDP form + `/mi-cuenta/resenas` | `/admin/resenas` | 2+7 actions | `features/reviews/*` | Review | Turnstile | cron review-request ✓ | review-request | — | ambos / MANAGER_UP | int+e2e | — | PRODUCTIVO | MANTENER |
| Referidos | Crecimiento | `/mi-cuenta`, `/registro?ref=` | `/admin/clientes/[id]` | saga recompensa | `features/referrals/service.ts` | Referral/Coupon | — | — | referral-reward | — | ambos | int | — | PRODUCTIVO_CON_GAP menor (cupón invisible en cuenta) | MANTENER |
| Puntos de fidelidad | Fidelización (Fase 5) | UI oculta a propósito | display en `/admin/clientes` (siempre 0) | — | **sin productor** | LoyaltyTxn (0 filas) | — | — | — | — | — | — | ROADMAP F5 | FUTURO_APROBADO vestigial | POSPONER_CON_ADR (CF-19) |
| Wishlist | Intención | corazón PDP/PLP, `/mi-cuenta/favoritos` | — | `toggleWishlistAction` | `features/wishlist/service.ts` | WishlistItem (0 filas en los 3 ambientes) | — | — | — | — | autenticado | e2e | — | CLIENT_ONLY_SIN_OPERACIÓN (CF-21) | REQUIERE_DECISIÓN_DE_NEGOCIO |
| Newsletter | Marketing | footer form, `/unsubscribe` | — | action + RFC 8058 | `features/newsletter/*` | Consent + Resend contacts | Resend/Turnstile | — | welcome + supresión bounce | — | público | int+e2e | — | PRODUCTIVO | MANTENER |
| CMS v2 (páginas/secciones/campos) | Contenido no-técnico | todo el sitio | `/admin/contenido*` | 16 actions | `features/cms/service.ts`, `lib/cms.ts` | CmsPage/Section/Field/Version/ListItem/Media + `cms-media` | — | cron publish ✓ | — | tag `cms` + `updateTag` en todas las mutaciones ✓ | CONTENT | int+e2e | CMS_ROADMAP | PRODUCTIVO | MANTENER |
| Edición visual in-place | UX de edición | overlay con sesión admin | botón en `/admin/contenido` | `POST /api/admin/cms/edit-mode` | `lib/cms-edit-mode.ts` | cookie 8h + re-verificación | — | — | — | — | CONTENT+aal2 | e2e | — | PRODUCTIVO | MANTENER |
| Emails transaccionales | Comunicación | — | `/admin/email-templates` (redirect) | — | `features/emails/*` | 23 plantillas en código | Resend | webhook bounces ✓ | 23/23 con emisor | — | — | templates.test | EMAIL_TEMPLATES | PRODUCTIVO_CON_GAP (CF-14) | DOCUMENTAR/CORREGIR |
| Contenido legal | Cumplimiento | `/legal/*` (8) | `/admin/contenido` página legales | — | `legal-content/*.md` ↔ fallback ↔ CMS | CmsField legal.* | — | — | — | tag `cms` | CONTENT | sync test 8/8 | COMPLIANCE | PRODUCTIVO | MANTENER |
| Consentimientos | Ley 1581 | banner cookies + checkboxes | versión editable en settings | `persistCookieConsentAction` | `features/consent/service.ts` | Consent (ledger) | — | — | — | — | público | unit+e2e | COMPLIANCE | PRODUCTIVO_CON_GAP (CF-15) | CORREGIR_CABLEADO |
| Admin RBAC/MFA/auditoría | Gobierno | — | todo `/admin` | `requireAdminAction` ×33 archivos | `lib/admin-rbac*`, `admin-audit.ts` | AdminUser/AdminActionLog/AdminRecoveryCode | Supabase TOTP | — | — | — | 4 roles | 6 suites | SECURITY | PRODUCTIVO_CON_GAP menor (CF-24) | CORREGIR_CABLEADO |
| Observabilidad/alertas | Operación sana | — | `/admin/observability|metricas|performance|notificaciones` | `/api/cron/alerts`, `/api/log-error`, `/api/vitals` | `features/observability/*` | ErrorLog/ErrorReport/WebVital/AlertState/Notification/EmailEvent | — | cron 5 min ✓ | alertas email críticas | — | SUPER | 4 suites | OBSERVABILITY | PRODUCTIVO_CON_GAP (CF-04, CF-10, CF-11, CF-22, CF-25, CF-26) | CORREGIR_CABLEADO |
| Healthchecks | Monitoreo | `/status` | `/admin/integraciones` | `/api/health/*` ×8 | probes reales 6/8 | — | todos | — | — | — | público rate-limited | int+e2e | OBSERVABILITY | PRODUCTIVO_CON_GAP (CF-03, CF-16) | CORREGIR_CABLEADO |
| Mayorista (B2B tiers) | Venta corporativa | — | `/admin/mayorista` | 3 actions | prisma directo | WholesaleTier (0 filas) | — | — | — | — | full / SUPER | — | ROADMAP F6 | FUTURO_APROBADO sin consumidor | MANTENER (oculto en catalog) |
| Materiales/costos | Costeo (Fase 5) | — | `/admin/materiales`, `/admin/costos` | 6 actions | prisma directo | Material (0 filas)/Product.cost | — | — | — | — | SUPER | — | — | ADMIN_ONLY_JUSTIFICADO | MANTENER |
| API pública bot (futura) | Canal WhatsApp Fase 5+ | — | — | `/api/catalog/*` (7), `/api/cms/*` (4), `/api/coupons/public` | `lib/catalog`, `lib/cms` | — | — | — | — | cache HTTP | público rate-limited | e2e parcial | ADR-038 | PRODUCTIVO sin consumidor actual (CF-30) | POSPONER_CON_ADR |
| Backups y DR | Continuidad | — | — | — | `apps/web/scripts/backup-*`, `dr-drill*` | dump + buckets → R2 cifrado | R2 | GHA diario/mensual | — | — | ops | 3 tests lib | OPERATIONS | CONFIGURADO_NO_PROBADO en señal in-app (CF-25) | CORREGIR_CABLEADO |

---

## E. Matriz cliente–admin (prueba de cableado bidireccional §9)

| ID | Capacidad | Flujo cliente→admin | Flujo admin→cliente | Persistencia | Invalidación | Auditoría | Tests | Estado |
|---|---|---|---|---|---|---|---|---|
| B-01 | Contacto/soporte | `/contacto` → `submitContactAction` → SupportTicket OPEN + email acuse/interno (`features/support/actions.ts:42-165`) → visible en `/admin/soporte` **y** `/admin/mensajes` → operador cambia estado (`setSupportTicketStatus`) | **ROTO**: respuesta = `mailto:` (`soporte/ticket-actions.tsx:62`); cambio de estado NO notifica al cliente; cliente no ve sus tickets en `/mi-cuenta` (grep=0) | SupportTicket ✓ | revalidate ambas rutas ✓ | `support.status` ✓ | int+e2e | **PRODUCTIVO_CON_GAP** |
| B-02 | Pedido (compra) | PDP → carrito → checkout → `createOrderFromCart` (re-valida cupón/stock en tx) → saga PAID → guía → notificación ORDER in-app + email admin (`features/orders/emails.ts:437`) | admin transiciona/reembolsa/marca no-show con MFA → emails cancelled/refunded/shipped/delivered al cliente; vistas `/mi-cuenta/pedidos`, `/pedido/[token]` actualizadas | Order/OrderItem snapshot ✓ | n/a (dinámico) | `AdminActionLog` + saga events ✓ | 55 int + e2e fullmode | PRODUCTIVO (con CF-01) |
| B-03 | Archivar producto | (invariante §9) catálogo ✓ (`deletedAt:null` en queries) · búsqueda ✓ · sitemap ✓ (`sitemap.ts:83-86`) · relacionados ✓ · Estudio ✓ (PDP notFound) · checkout ⚠️ **la orden en vuelo NO lo filtra** (CF-01) · pedidos históricos ✓ (snapshot + `onDelete: Restrict`) | admin archiva (`products/service.ts:341`) → `updateTag("catalog")` → desaparece de PLP/PDP | soft-delete | tag `catalog` ✓ | ✓ | int | **PRODUCTIVO_CON_GAP** (CF-01) |
| B-04 | Cupón: pausar/expirar/archivar | aplicar bloqueado (`priceCouponForCart` valida) ✓ · usos históricos conservados ✓ (no hay hard delete) · checkout actualizado ✓ (re-tarifica por render) · totales cacheados: ninguno ✓ | admin pausa/reactiva/crea → `updateTag("coupons")` ✓ pero `revalidatePath("/carrito")` erróneo y copy "carrito" (CF-06); **no hay UI de edición ni de archivo** (actions huérfanas) | Coupon soft-delete ✓ | tags ✓ / path ✗ | `coupon.*` ×5 ✓ | 4 suites | **PRODUCTIVO_CON_GAP** |
| B-05 | Plantilla: aprobar/ocultar/descartar | (invariante §9) PDP strip ✓ (`isActive+deletedAt`) · Estudio ✓ (`listTemplatesForKind`) · respeta producto/kind parcial (PDP no filtra kind ni incluye globales) · diseños/pedidos históricos ✓ (snapshot `canvasData` + FK SetNull) · enlaces muertos: ninguno (strip solo activas) | admin aprueba/oculta (`setTemplateApproval`) → `updateTag("catalog")` ✓ llega a PDP y Estudio · **descartar NO existe en admin** (solo seeds lo producen) | Template soft-delete | tag `catalog` ✓ (CDN de `/api/catalog/templates` no se purga — menor) | ✓ | int | **PRODUCTIVO_CON_GAP** (CF-07) |
| B-06 | Cambio de stock | PDP fresco por request ✓ · carrito/checkout re-validan ✓ · admin edita con ledger ✓ · back-in-stock reacciona ✓ · **PLP/badge "Agotado" stale ≤1 h** (tag `catalog` no se invalida — CF-17) · reservas: N/A (CF-13) | admin ajusta (`stock-admin.ts:131`) con `InventoryLog` + audit | InventoryLog append-only | ✗ parcial | ✓ | int+e2e | **PRODUCTIVO_CON_GAP** |
| B-07 | Pago o envío | webhook → dedup → saga → aparece en admin (filtro + notify) ✓ · actualiza cliente (vistas + email) ✓ · transición válida gated ✓ · idempotente 5 capas ✓ · **DECLINED/RETURNED no notifican al cliente** (CF-27) | admin reintenta guía / reembolsa con MFA | WebhookEvent/Order ✓ | n/a | ✓ | int+live | PRODUCTIVO (con CF-27) |
| B-08 | Cambio CMS | (invariante §9, validado paso a paso) admin edita → versión append-only → publica → `updateTag("cms")` → página dinámica sirve el texto nuevo → fallback si no publicado → modo decide en render para textos sensibles | idem | CmsFieldVersion ✓ | tag `cms` en TODAS las mutaciones ✓ | ✓ | int+e2e | **PRODUCTIVO** ✓ |
| B-09 | Integración caída | health endpoints con probes reales ✓ · `/api/health/all` agrega ✓ · panel: **semántica rota** (Wompi/Aveonline warn fijo — CF-03) · alertas: 100 % derivadas de DB, no consumen probes · servicios deshabilitados deliberadamente NO generan falsos fallos ✓ (`skipped`/`CRON_JOBS_DISABLED`) | — | — | — | — | int | **PRODUCTIVO_CON_GAP** |
| B-10 | Reseña | cliente post-compra verificada → entra pendiente → admin modera → visible en PDP/home | admin aprueba/rechaza/destaca → `updateTag` PDP | Review ✓ | tag `catalog` ✓ | ✓ | int+e2e | PRODUCTIVO |
| B-11 | Referido | link `?ref=` → signup → primer pedido pago → saga emite cupón 10 % a ambos + email | admin ve referidos en `/admin/clientes/[id]`; cupón visible solo en email (no en `/mi-cuenta`) | Referral/Coupon ✓ | — | ✓ | int | PRODUCTIVO (gap menor) |
| B-12 | Back-in-stock | cliente se suscribe en PDP agotada (con Consent) → cron FIFO con tope=stock real → email | sin pantalla admin (solo conteos) | BackInStockSubscription ✓ | — | — | int+e2e | PRODUCTIVO (gap menor) |

---

## F. Hallazgos

Severidades: CRÍTICA / ALTA / MEDIA / BAJA / INFORMATIVA. Confianza: ALTA = verificado en código y/o datos por el auditor; MEDIA = evidencia fuerte con alguna premisa externa. Cada hallazgo cita archivo:línea o consulta (§G).

| ID | Área | Severidad | Confianza | Evidencia | Comportamiento actual | Comportamiento correcto | Impacto | Disposición | Prueba de cierre |
|---|---|---|---|---|---|---|---|---|---|
| CF-01 | Pedidos/checkout | **CRÍTICA** | ALTA (verificado) | `features/orders/service.ts:225-247` carga `cart.items` crudos (solo `deletedAt:null` en el Cart); el filtro `isActive && deletedAt` vive solo en el DTO (`features/cart/service.ts:260`) | Si el admin archiva/pausa un producto entre la carga del checkout y el pago (y el `offersToken` se selló después), la orden se crea con el item retirado y un subtotal mayor que el exhibido | `createOrderFromCartTx` debe excluir (o rechazar) items cuyo producto/variante esté inactivo o archivado, recalculando el total antes de cobrar | Cobro distinto al exhibido; venta de producto retirado; reclamo Ley 1480 | CORREGIR_CABLEADO | Test de integración: archivar entre checkout y pago → orden sin el item o error explícito; E2E compra |
| CF-02 | Tests/personalización | **ALTA** | ALTA (reproducido 4/4) | `features/personalization/finalize-server-render.integration.test.ts:190` espera `NEEDS_CLIENT_SLOTS` clonando `set-fotoimanes-polaroid`; el header del propio test (:14-16) declara "hoy solo la Polaroid no se renderiza en servidor"; `service.ts:209` ahora entra "con marco" directo al tier canvas → el finalize **resuelve** en vez de rechazar. Falla 3/3 local + 1/1 en suite completa. En CI se salta por diseño (`SKIP = !HAS_SUPABASE && CI`, :33-35; `vitest.config.ts:33-44` en nightly) | `pnpm test` rojo en develop (1/3638); la premisa del fixture quedó obsoleta tras las olas 26-29 (el tier canvas "con marco" sí renderiza Polaroid) | El test debe forzar el fallo de TODOS los tiers (mock) o usar un fixture realmente no renderizable; la suite debe quedar verde en local | Gate rojo normaliza el rojo; el camino de fallback (URLs firmadas al cliente) queda sin prueba real | CORREGIR_CABLEADO (test) | `vitest run features/personalization/finalize-server-render.integration.test.ts` verde; `pnpm test` verde |
| CF-03 | Integraciones/panel | **ALTA** | ALTA (verificado) | `/admin/integraciones` ejecuta solo 3 probes (`integraciones/page.tsx:139-143`); Wompi y Aveonline tienen `healthStatus` **hardcodeado** `"warn"` (`page.tsx:200,222`) con textos fijos — el de Wompi además obsoleto ("se cablea en Fase 2", `page.tsx:202`). Los probes reales existen (`api/health/wompi/route.ts:49`, `api/health/aveonline/route.ts:37`) y el agregador los consume (`api/health/all/route.ts:126-127`). Config Wompi: panel chequea 3 vars (`page.tsx:150-154`), el código exige 4 (`lib/wompi.ts:67-71`) | Panel muestra "Revisar" ámbar permanente para Wompi/Aveonline; una caída real de pagos/envíos es indistinguible del estado normal; WhatsApp y Turnstile muestran `ok` estático por presencia de env vars | El panel debe consumir los probes reales con la misma semántica (`ok/warn/fail/skipped` + sandbox/production/cuenta-demo) que `/api/health/all`; config check debe cubrir las 4 vars | Hipótesis 1 del encargo: **CONFIRMADA**. Ciego operativo en las 2 integraciones de dinero | CORREGIR_CABLEADO | Tests: deshabilitado ≠ alarma; sandbox ≠ producción; no-probado ≠ caído; probes consumidos; recuperación limpia estado |
| CF-04 | Email/observabilidad | **ALTA** | ALTA (datos PRD) | `EmailEvent` PRD: Ago 157 bounced/168 delivered; Sep 55 bounced/53 delivered (+13/21 delayed). Bounce rate ~47-50 % sostenido. Cero alertas/pantallas lo cubren (SLO "bounce >5 %" solo existe en `docs/OBSERVABILITY.md:181`); el webhook Resend persiste y solo se usa para supresión (`api/webhooks/resend/route.ts:133-159`, `lib/resend.ts:146-154`) | ~1 de cada 2 emails que la app envía vía Resend en PRD rebota, sin visibilidad; origen no determinable sin revisar destinatarios (PII) — candidatos: `account-exists-notice` y newsletter welcome a correos inexistentes | Alerta de bounce rate + pantalla de `EmailEvent`; investigación del origen; riesgo de suspensión del dominio por reputación Resend | El canal transaccional (OTP, confirmaciones de pedido) puede degradarse o suspenderse en plena operación | CORREGIR_CABLEADO (alerta+vista) + REQUIERE_EVIDENCIA_DEL_OPERADOR (origen) | Alerta dispara con tasa >5 % en ventana; vista admin de eventos; tasa PRD <5 % |
| CF-05 | Datos/cupones | **ALTA** | ALTA (datos, los 3 ambientes) | 43 cupones idénticos en LOCAL=STG=PRD. Señales objetivas de test: 12 × `CAT<runId>-PUBLIC10/EXPIRED/FUTURE/INACTIVE` (run IDs de suites de integración, timestamps 2026-07), 22 × `SAG***` (saga tests), 7 × `ord***`/`CAT***` (orders/catalog tests). `pedidos=0` en los 43. Drift: 21 con `usedCount>0` y 0 `CouponUsage` (residuo de purgas de pedidos de test). Único vigente en PRD: un `SAG***` (test). Único plausible-real: `LUC***` expirado, 0 usos — ORIGEN_DESCONOCIDO | Producción contiene 42 artefactos de test (tests de integración corrieron contra la DB de PRD en julio); **no existe ningún cupón real operativo**; el admin lista basura mezclada con lo real | PRD sin datos de test; cupones de negocio definidos por la operadora; drift corregido (`usedCount` = usos reales) | Catálogo de promociones inoperante en el lanzamiento; métricas de `usedCount` falsas | ELIMINAR_DATOS (script scoped, §N-05) + REQUIERE_DECISIÓN_DE_NEGOCIO (cupones reales) | Script dry-run lista 42 IDs por patrón+0 referencias; tras `--apply`: 0 cupones test en PRD; `usedCount==count(CouponUsage)` |
| CF-06 | Cupones/cableado | **ALTA** | ALTA (verificado) | ① Sin UI de edición ni archivo: `updateCouponAction` (`admin/(panel)/cupones/actions.ts:119`) y `archiveCouponAction` (:197) sin un solo importador; notices `?updated=1`/`?archived=1` inalcanzables (`page.tsx:131,136`). ② Copy: "el cliente escribe en el carrito" (`page.tsx:122-123`) — el campo real está en `/checkout/pago` (`checkout/pago/coupon-field.tsx:43`). ③ 5 × `revalidatePath("/carrito")` (`actions.ts:97,145,178,193,208`, con comentario falso "totales en cart"); 0 × `/checkout/pago` desde admin. ④ Comentario stale `page.tsx:110-114` ("applyCouponAction aún no existe" — existe en `checkout/pago/actions.ts:257`) | Hipótesis 2 del encargo: **CONFIRMADA en sus 3 componentes**. Un typo en un cupón obliga a pausar y recrear; copy y rutas de invalidación hablan de una realidad vieja | UI de edición/archivo cableada a las actions (ya auditadas y testeadas); copy alineado a `/checkout/pago`; revalidate a la ruta real; comentario corregido | Operadora no puede corregir cupones; deriva conceptual que ya produjo un comentario falso | CORREGIR_CABLEADO | UI edita y archiva con audit; `grep revalidatePath` apunta a `/checkout/pago`; e2e `fullmode-cupones` verde |
| CF-07 | Estudio/plantillas | **ALTA** | ALTA (verificado + datos) | ① `?templateId=` generado por `templates-strip.tsx:46` — **0 consumidores** (PDP solo lee `sp.variant`, `producto/[slug]/page.tsx:111`; `CartItem.templateId` nadie lo escribe; `OrderItem.templateId` siempre null — verificado en DB: 0/0/0 en los 3 ambientes). ② `?template=` generado (:45) — declarado en `estudio/[slug]/page.tsx:49` y **nunca leído**; el boot arranca con `templates[0]` (`studio-editor.tsx:572-643`). ③ Comentario falso `templates-strip.tsx:6` ("navega al estudio"). ④ `listTemplatesForKind` sin filtro `mode` (`service.ts:1249-1288`). ⑤ `Design.templateId` fijado server sin filtro aspect y jamás actualizado al cambiar de plantilla (`saveCanvas` solo escribe `canvasData`, `service.ts:856`). ⑥ `listTemplatesByProduct` excluye globales y no filtra kind — PDP y Estudio pueden discrepar. ⑦ Datos: **0 plantillas PREMADE** en los 3 ambientes; strip PREMADE nunca renderiza | Hipótesis 3 del encargo: **CONFIRMADA Y AMPLIADA** — ambos parámetros son callejones sin salida; elegir plantilla X en PDP aterriza en la plantilla 0 del Estudio; la referencia relacional `Design.templateId` no es confiable | Definir si PREMADE existe como concepto (decisión de negocio). Si sí: cablear `?templateId=`→carrito directo. Si no: retirar el strip PREMADE y el parámetro muerto; hacer que `?template=` precargue la plantilla elegida; filtrar `mode`; persistir cambio de plantilla en el Design | Funcionalidad visible que no cumple lo que promete; cliente confundido al no ver su plantilla elegida | CORREGIR_CABLEADO + REQUIERE_DECISIÓN_DE_NEGOCIO | E2E: click en plantilla X del strip → Estudio abre con X; `Design.templateId` coincide; strip PREMADE ausente o funcional |
| CF-08 | Admin/soporte | **ALTA** | ALTA (verificado) | `/admin/mensajes` y `/admin/soporte` importan el mismo `listSupportTickets` (`mensajes/page.tsx:29`, `soporte/page.tsx:10`); actions gemelas casi idénticas (`setMessageStatusAction` vs `setTicketStatusAction` → mismo `setSupportTicketStatus`, mismo rol, misma auditoría); misma matriz RBAC (`admin-rbac.ts:58,64`); el propio header de mensajes lo admite (`mensajes/page.tsx:5-10`). La decisión documentada de no fusionar (`admin-nav.ts:143-148`) **no menciona este par** | Hipótesis 4 del encargo: **CONFIRMADA — duplicación real**. Dos pantallas de la misma bandeja con costo doble de mantenimiento (solo difieren presentación) | Una sola bandeja operativa (soporte, dentro de su grupo) y la otra como redirect — o diferenciación real (mensajes = inbox solo-lectura) con justificación registrada | Doble mantenimiento; riesgo de divergencia de reglas entre pantallas | CONSOLIDAR | Un solo módulo + redirect 301 `/admin/mensajes`→`/admin/soporte`; admin e2e verde; sin pérdida de filtros/acciones |
| CF-09 | Scripts/seeds | **ALTA** | ALTA (verificado) | `seed-products.mjs`: upsert pisa precios e imágenes admin (`:1440-1447`, `:1464-1472`, imágenes Unsplash `:195`), pre-cleanup archiva productos/categorías/variantes no declarados (`:1362-1505`), 24 reseñas demo aprobadas que resucitan (`:1541-1797`), fuerza `isActive:true, deletedAt:null` en todo. `seed-templates.mjs` soft-deletea toda plantilla no declarada (`:757-773`) y resetea estados admin (`:790-807`). **63/79 scripts sin env-guard**, incluidos los 5 canónicos del Makefile, `seed-admin.mjs` y `admin-mfa-reset.mjs`. `env-guard.mjs:20` es **fail-open** ante hosts remotos no-Supabase y URLs no parseables (`:49-51`). Hipótesis 7 y 8: **CONFIRMADAS** | Un `make seed-products` con el env equivocado pisa la operación de PRD; si PRD migra a un host no-Supabase la guarda no bloquea nada; ~45 one-shots aplicados siguen ejecutables | Separación canónico/demo; fail-closed en PRD para TODO script que escribe; dry-run por defecto + `--apply`; allowlist de entorno por script; conteos antes/después; transacciones; sin resurrección de `isActive/deletedAt/price/images` | Riesgo de incidente de datos en PRD (archivado masivo, reseñas ficticias republicadas) | CORREGIR (endurecer, §N-06) | Lint CI: script que escribe sin guard falla; dry-run default; corrida contra PRD bloqueada sin doble gate |
| CF-10 | Alertas/webhooks | **MEDIA** | ALTA (código+datos) | `WebhookEvent.processedAt` solo se sella en los handlers (`wompi/route.ts:209,234,309`, `aveonline/route.ts:196`); el retry manual (`retryShipmentAction`) no lo sella; la purga excluye `processedAt:null` (`event-log-retention.ts:55`). Datos: PRD conserva `AlertState` de `reconciliation` y `pending_payment_wompi_stale` con **0 órdenes** — nada limpia el estado al recuperarse | Evento "stuck" eterno tras resolución manual → alerta `webhooks_stuck` permanente y SLO `webhook_processing` dañado para siempre | Sellar `processedAt` (o estado RESOLVED) al resolver manualmente; alerta que se auto-limpia al recuperarse | Falsa alarma inmortal; fatiga; métrica SLO falsa | CORREGIR_CABLEADO | Test: resolver manualmente → alerta desaparece en el siguiente ciclo y el SLO se recupera |
| CF-11 | Alertas/pedidos | **MEDIA** | ALTA (código) | `pending_payment_wompi_stale` (crítica+email) dispara ante cualquier checkout Wompi abandonado >2 h (`alerts.ts:101-111`) — abandono esperado 30-40 % (`features/orders/stock.ts:6-8`); no existe expiración/auto-cancelación de `PENDING_PAYMENT` ni purga (datos STG: 1 orden PENDING de 2026-08-12); el email se re-envía cada 30 min mientras exista | Alerta crítica estructuralmente ruidosa en el único canal de email; basura de órdenes acumulada | Expiración automática de órdenes `PENDING_PAYMENT` (cancel + liberar) con ventana de gracia, o degradar la alerta a digest diario | Fatiga de alertas; inflación de la tabla Order | CORREGIR_CABLEADO | Test: orden abandonada >umbral se auto-cancela; la alerta deja de disparar por abandono puro |
| CF-12 | Soporte | **MEDIA** | ALTA (verificado) | Responder = `mailto:` (`soporte/ticket-actions.tsx:62,72-77`); `setSupportTicketStatus` no emite email (`features/support/admin-service.ts:40-53`); `/mi-cuenta` no muestra tickets (grep=0) pese al acuse que promete "te responderemos en 24 h" (`support-ticket-received.ts:23`) | El ciclo prometido al cliente se cumple por fuera del sistema (buzón de la operadora) y el cliente no puede consultar estado | Declarar explícitamente "respuesta por email" (copy honesto) o cablear respuesta in-app con email al cliente + vista en `/mi-cuenta` | Promesa al cliente sin soporte sistémico; doble registro manual | CORREGIR_CABLEADO o POSPONER_CON_ADR | E2E: ticket → respuesta → email al cliente + estado visible en su cuenta |
| CF-13 | Datos/código muerto | **MEDIA** | ALTA (código+datos) | `StockReservation` (`schema.prisma:1018`) sin productor ni lector (`features/orders/stock.ts:25-27` decisión ADR-014 diferida); job pg_cron `stock_reservation_cleanup` cada 1 min **verificado activo en LOCAL/PRD/STG** limpiando una tabla con 0 filas (los 3 ambientes) | Recurso muerto ejecutándose 1440 veces/día en producción | Decidir ADR-014: implementar reservas o retirar modelo+job (`cron.unschedule` + migración) | Ruido operativo y conceptual | RETIRAR_CÓDIGO o POSPONER_CON_ADR | `SELECT count(*)=0`; job desagendado; suite verde |
| CF-14 | CMS/emails | **MEDIA** | ALTA (verificado) | Nav promete "CmsBlocks tipo EMAIL (asunto+cuerpo+CTA)" (`admin-nav.ts:373-379`); realidad: solo `newsletter-welcome.ts:27-31` lee CMS (`email.welcome.subject|preview`, ni siquiera en el site map); las otras 22 plantillas son 100 % código (`features/emails/templates/*`); `/admin/email-templates` es redirect a una página que muestra ~2 campos de 23 plantillas | La operadora puede creer que edita correos que en realidad requieren deploy | Corregir la promesa (nav/página: "las plantillas viven en código; aquí se previsualizan") o extender el patrón CMS al resto (trabajo grande, decisión) | Expectativa falsa del operador | DOCUMENTAR o REQUIERE_DECISIÓN_DE_NEGOCIO | Copy corregido o plantillas editables con test de sync |
| CF-15 | Consent/docs | **MEDIA** | ALTA (verificado) | `PRIVACY_POLICY_VERSION` solo se estampa en filas nuevas (`features/consent/service.ts:30`); el banner decide por cookie `cookie_consent_v1` con versión **hardcoded** `COOKIE_CONSENT_VERSION=1` (`lib/cookie-consent.ts:22-23,79`; `cookies-banner.tsx:64-73`). `docs/STATE.md` y `consent/service.ts:13-14` afirman "re-consent activo" | Cambiar la versión en CMS NO re-muestra el banner a visitantes recurrentes | Cablear el setting CMS a la versión del banner (re-consent real) o corregir los docs a lo que existe | Brecha de cumplimiento Ley 1581 si se asume re-consentimiento efectivo | CORREGIR_CABLEADO o DOCUMENTAR | E2E: subir versión → recurrente ve el banner de nuevo |
| CF-16 | Status page | **MEDIA** | ALTA (verificado) | `/status` muestra "Pagos (Wompi): Pendiente — Integración completa en Fase 3" (`app/status/page.tsx:85-94`) con Wompi operando en PRD; no consume `/api/health/wompi` (existe) | Página pública de estado desactualizada — miente a clientes sobre la capacidad de pago | Consumir el probe real o retirar la sección de pagos | Desinformación pública | CORREGIR | `/status` refleja el probe; snapshot test |
| CF-17 | Caché/stock | **MEDIA** | ALTA (verificado) | Listados con tag `catalog` TTL 1 h (`lib/catalog.ts:19-20`); ni la saga ni `stock-admin.ts` llaman `updateTag("catalog")` al cambiar stock. Datos: LOCAL tiene 53 variantes activas agotadas | Badge "Agotado" del PLP puede mentir ≤1 h (la compra está protegida server-side: add-to-cart, checkout y saga validan) | Invalidar `catalog` (o un tag `stock` granular) en decremento/reverso/ajuste de stock | UX engañosa; suscripciones back-in-stock se protegen por FIFO | CORREGIR_CABLEADO | Test: stock→0 invalida listado; badge correcto tras compra |
| CF-18 | Docs (ROADMAP/QA) | **MEDIA** | ALTA (verificado) | `ROADMAP.md` Fase 6 "⏸️ Pendiente" con ~80 % construido (pedidos, inventario, clientes, moderación, auditoría, MFA, garantías, retractos); Fase 7 sin marcar: 67 specs E2E, k6, cookie banner, DR drill. `QA_CHECKLIST.md:68`: CTA "Personalizar → wa.me" — el CTA real es `<Link>` a `/estudio/[slug]?variant=&copies=` (`variant-actions.tsx:122-171`); `lib/wa.ts:45` (`kind:"personalize"`) sin llamadores. QA J: botón "✏️ Editar este sitio bottom-right" y "CmsBlockVersion" — realidad: botón en `/admin/contenido`, barra superior, `CmsFieldVersion`. README estudio: "Claude API" ×2 → el proveedor es Gemini (`features/ai/gemini-provider.ts:14`) | Hipótesis 6 y 10 del encargo: **CONFIRMADAS**. Los gates pre-launch describen flujos inexistentes y una fase construida como pendiente | Actualizar ROADMAP (estado real), QA_CHECKLIST (flujos reales), README estudio (Gemini), retirar la rama muerta de `lib/wa.ts` | Checklist inválida como gate; planificación distorsionada | DOCUMENTAR | Docs diffs revisados; checklist recorrida contra la app |
| CF-19 | Modelos/datos muertos | **MEDIA** | ALTA (código+datos) | Sin lecturas ni escrituras en código y 0 filas en los 3 ambientes: `BlogPost` (policy RLS huérfana incluida), `SiteEvent`, `RecommendationLog` (solo anonimiza delete-service; comentario stale `admin-nav.ts:216` "dashboard Fase 4"), `LoyaltyTxn` (lector admin, sin productor; UI cliente oculta por mandato). 14 settings CMS zombi editables sin lector (`WARRANTY_DURATION_YEARS`, `HABEAS_DATA_CLAIM_DAYS`, `DPA_*_URL`…) | Esquema y pantallas que sugieren capacidades inexistentes; settings editables sin efecto (falsa configuración) | ADR por modelo: retirar (migración drop) o declarar FUTURO_APROBADO y ocultar del admin; settings zombi: ocultar o cablear | Deriva esquema↔código↔docs | RETIRAR_CÓDIGO o POSPONER_CON_ADR | Migración drop + suite verde + RLS suite verde; o ADR registrado y UI oculta |
| CF-20 | Pagos/post-venta | **MEDIA** | ALTA (verificado) | `refundOrderAction` marca REFUNDED + email `refund-issued` y solo *recuerda* mover el dinero a mano (`pedidos/[number]/actions.ts:179`); nada verifica el reembolso real. Conciliación Wompi↔pedidos: sin cruce automático contra la API (declarado "Próximamente" en finanzas); detección solo por flags reactivos | Un REFUNDED puede quedar sin dinero devuelto sin que nadie lo detecte | Checklist operativo con verificación (o integración de refund de Wompi cuando la API lo permita) + estado "reembolso confirmado en Wompi" | Riesgo financiero y de reclamo | POSPONER_CON_ADR (proceso manual documentado) o CORREGIR_CABLEADO | Campo de confirmación manual obligatorio antes del email; o prueba de integración refund |
| CF-21 | Wishlist | **MEDIA** | ALTA (verificado) | `features/wishlist` completo pero sin consumidor operativo (0 emails, 0 admin, 0 analytics; cabecera `service.ts:6` la declara "palanca de ingreso" sin palanca); `delete-service.ts` no la anonimiza; 0 filas en los 3 ambientes | Acumula datos sin uso; sobrevive a la eliminación de cuenta ligada al customer anonimizado | Decisión: operarla (sugerir reposición/ofertas, vista admin) o retirarla; en cualquier caso incluirla en `delete-service` | Datos sin propósito (Ley 1581: finalidad) | REQUIERE_DECISIÓN_DE_NEGOCIO + CORREGIR (delete-service) | Decisión registrada; delete-service cubre WishlistItem con test |
| CF-22 | Observabilidad/ciegos | **MEDIA** | ALTA (verificado) | `/api/health/all` y `/api/health/crons` sin consumidor interno; monitor externo (UptimeRobot/BetterStack) **pendiente desde 2026-08-01** (`docs/STATE.md`); el cron `lucams-alerts` se auto-excluye (`alerts.ts:119`) → su caída es invisible hoy. Gemini: consumidor real (`studio-ai-panel.tsx`) sin probe/card/alerta (fail-open silencioso). R2/backups: señal solo en GitHub Actions; DR drill no verifica frescura del dump (`dr-drill.mjs:87-97`) | Si el sistema de alertas muere, nadie se entera; caídas de Gemini/backups son silenciosas | Monitor externo sobre `/api/health/all`+`/api/health/crons` (decisión de costo) o dead-man interno independiente; cards/probes para Gemini; heartbeat de backups | Ciego total ante el fallo del propio sistema de alertas | CORREGIR_CABLEADO + REQUIERE_DECISIÓN_DE_NEGOCIO | Simular cron caído → señal recibida; card Gemini con estado real |
| CF-23 | Datos/catálogo | **MEDIA** | ALTA (datos) | Variantes: LOCAL 140 (140 activas) / STG 115 (82) / PRD 85 (52). Por producto: `separadores-*` 24 vs 24 vs 12; `set-fotoimanes-cuadrados` 36/19/18 (activas 36/2/1); `polaroid` 20/12/10 (activas 20/4/2); `tiras` 4/4/2; `calendario` 2/2/1. NOMAG: completas en LOCAL/STG, parciales en PRD (solo letras). `nombre-personalizado` **pausado en PRD, activo en LOCAL/STG** | Tres catálogos distintos: LOCAL superset todo-activo, STG con rollout multi-unidad/NOMAG, PRD curado a mano. Parte es deriva intencional documentada (precios NOMAG STG, validación owner antes de PRD); parte no tiene criterio registrado (pausas divergentes, conteos por producto) | Matriz de homologación con dueño y criterio de cierre por producto; dirección de sincronización declarada (PRD→espejos tras release) | Lo que se valida en STG no es exactamente lo que vende PRD | REQUIERE_EVIDENCIA_DEL_OPERADOR + homologar | Tabla de decisión por producto; conteos iguales o divergencia documentada con dueño |
| CF-24 | RBAC admin | **MEDIA** | ALTA (verificado) | `/admin/garantias`: ruta ALL (visible a FULFILLMENT) pero página exige SUPER+MANAGER → rebote `?denied=1`. `/admin/retractos`: ruta ALL, página y actions SUPER. `/admin/costos`: ruta SUPER (menú oculta a MANAGER) pero actions MANAGER_UP. Comentario stale `admin-rbac.ts:30-32` | Menú muestra módulos que el rol no puede operar (rebote feo) y una action es más permisiva que su pantalla | Alinear matriz ruta↔página↔actions por módulo; comentario al día | UX admin rota por rol; superficie de action más amplia que la UI | CORREGIR_CABLEADO | Test de matriz: para cada rol, nav ⊆ páginas accesibles; e2e por rol |
| CF-25 | Backups/DR | **MEDIA** | ALTA (verificado) | `backup.yml` salta limpio si faltan secrets (solo `::warning`); DR drill elige el `.gpg` más nuevo por nombre sin verificar frescura (`dr-drill.mjs:87-97`); sin heartbeat in-app ni alerta | Un backup detenido hace semanas pasaría desapercibido y el drill mensual restauraría un dump viejo en verde | Verificación de frescura en el drill (falla si el dump >36 h) + señal in-app (AlertState) del último backup exitoso | Falsa sensación de continuidad | CORREGIR_CABLEADO | Drill falla con dump viejo; tile/alerta de backup en `/admin/observability` |
| CF-26 | Retención | **MEDIA** | ALTA (código+datos) | `Notification` y `WebVital` sin purga (únicos `deleteMany` en tests). Datos: STG 13 890 WebVital, LOCAL 4 139, PRD 2 548; LOCAL conserva 169 notificaciones históricas (125 ALERT + 44 ORDER) con **0 pedidos** (las purgas de pedidos no las tocan) | Crecimiento unbounded; notificaciones huérfanas de entidades eliminadas | Extender `purge-event-logs` a Notification (p.ej. >90 d y leídas) y WebVital (>35 d, conservando agregados) | Tablas infladas; señal degradada | CORREGIR_CABLEADO | Test de retención; conteos acotados tras purga |
| CF-27 | Notificaciones de comercio | **MEDIA** | ALTA (verificado) | Wompi DECLINED/ERROR → noop deliberado (`wompi/route.ts:261-275`) y `sendOrderPaymentFailed` solo corre con transición a CANCELLED → el cliente nunca es notificado. Courier RETURNED/EXCEPTION → solo flag admin (`saga.ts:767-792`): sin email al cliente, sin reposición de stock (R6: inventario fantasma COD) | El cliente con pago rechazado o devolución logística no recibe comunicación; stock COD devuelto no se repone solo | Email de pago fallido al detectar DECLINED final (con guardia anti-spam); flujo definido para RETURNED (notificar + reponer/reembolsar manual asistido) | Experiencia de cliente rota en dos caminos frecuentes de fallo | CORREGIR_CABLEADO | E2E: DECLINED → email; RETURNED → alerta + acción guiada |
| CF-28 | Código sobrante | **BAJA** | ALTA (búsquedas documentadas) | Exports sin consumidor (búsqueda `grep -w` repo-wide, sin imports dinámicos ni CMS): `getCoupon`/`getCouponMetrics` (`coupons/service.ts:69,168`), `toggleCategoryActive` (sin auditoría, `categories/service.ts:291`), `countPendingModeration`, `getBreachedSlos`, `getProductsForOcasion`, `getVariantById`, `listVariantStockHistory` (doc "futuro no en P0-004"), `updateGalleryImage`, `getGalleryImageUrl`, `getCmsImage`, `calculateTotals` (solo-test). Schemas/tipos duplicados en `orders/schemas.ts` (`ShippingAddressSchema`, `BillingSchema`, `ShippingSelectionSchema`, `CreateOrderInputSchema`, `TERMINAL_ORDER_STATUSES`) vs los vivos en `checkout/schemas.ts:145,170`. `PaymentMethodSchema` sin uso. `SHIPPING_PROVIDER` seam muerto (solo lo setea un test). Rama `mercadopago` imposible (`payments/provider.ts:96-110`) | Código mantenido (y testeado) que producción nunca ejecuta; contratos duplicados que pueden derivar | Retiro con prueba de cierre por símbolo (tsc + suite del feature + e2e afectado) | Deuda y falsa confianza de cobertura | RETIRAR_CÓDIGO | tsc + `vitest run` por feature + e2e compra verdes tras retiro |
| CF-29 | Admin/nav | **BAJA** | ALTA | `/admin/disenos` y `/admin/fichas`: módulos completos **sin entrada de menú** (solo QuickLinks del dashboard). `/cotizacion/[token]` dormida en modo full (solo tokens históricos). `/checkout/gracias` sin gate de modo (sus hermanas sí: `envio/page.tsx:50`, `pago/page.tsx:46`). `/auth/callback` documentado como no-disparado (flujos OTP). `/mi-cuenta/eliminar` redirect `?next=` a página equivocada (:26) | Inconsistencias menores de navegación y gating | Entradas de menú para disenos/fichas (o declararlas sub-herramientas); gate de modo en gracias por simetría; corregir `?next=` | Descubribilidad y coherencia | CORREGIR / DOCUMENTAR | Nav incluye módulos o ADR; e2e nav |
| CF-30 | API pública futura | **BAJA** | ALTA | 10 rutas sin consumidor productivo actual: `/api/catalog/*` (6 de 7 — `recommend` sí lo usa el wizard), `/api/cms/*` (4), `/api/coupons/public`; consumidor declarado: bot WhatsApp "Fase 5+" / chatbot RAG (ausentes del repo). Endurecidas y con tests | Superficie pública mantenida adelantada al roadmap | Verificar tráfico real en logs de Vercel; si es cero y el bot no entra en plan: archivar detrás de flag o mantener con ADR explícito | Costo de mantenimiento y superficie de ataque | POSPONER_CON_ADR | ADR + evidencia de tráfico (o retiro) |
| CF-31 | Comentarios/docs inline | **BAJA** | ALTA | `cupones/page.tsx:112` ("applyCouponAction aún no existe" — existe); `templates-strip.tsx:6` ("navega al estudio" — navega a la PDP); `admin-rbac.ts:30-32` (matriz vieja); `ayuda/page.tsx:36-39` ("auto-crea el CmsBlock" — no existe); `moderation/service.ts:99` y `observability/slos.ts:124` (consumidores inexistentes); `stock-admin.ts:164` ("futuro — no en P0-004"); `payments/provider.ts:9,106` ("Solo wompi en Fase 2" — fase completada); `admin-nav.ts:216` ("dashboard Fase 4" — completada); `integraciones/page.tsx:202` ("se cablea en Fase 2"); headers cron `route.ts:3-4` (mencionan `?secret=` — no aceptado) | Comentarios que describen una realidad vieja — algunos ya indujeron decisiones erróneas en esta misma auditoría | Barrido de comentarios en el PR del módulo correspondiente | Deriva conceptual acumulada | DOCUMENTAR | Grep de las citas: 0 restantes |
| CF-32 | Datos test LOCAL/STG | **BAJA** | ALTA (datos) | LOCAL: 282 diseños DRAFT anónimos, 4 customers señal-test, 29 ErrorLog/7 d. STG: 4 pedidos WOMPI (2026-08-11/12 y 2026-09-05 — smokes documentados en STATE.md), 45 cotizaciones era-catálogo, 86 diseños, 2 admins (1 con señal test). PRD limpio de pedidos/cotizaciones/reseñas (0) | Datos de prueba esperados en ambientes no productivos; ninguno tiene señal en PRD salvo cupones (CF-05) | Limpieza periódica con `cleanup-test-junk`/`purge-test-orders` (ya existen, dry-run); decisión sobre los 4 pedidos smoke de STG (conservar como evidencia o purgar) | Higiene | ARCHIVAR_DATOS / ELIMINAR_DATOS (LOCAL/STG) | Dry-run de los scripts existentes; conteos finales reportados |
| CF-33 | Alertas semántica | **BAJA** | ALTA | `errors_spike`: doc "5+ errores 500 en una misma ruta" (`OBSERVABILITY.md:174`) vs código cuenta global cualquier tipo (`alerts.ts:50-53`); detalle dice "5xx" impreciso. Jobs disabled se muestran "Al día" en `/admin/observability` aunque nunca hayan corrido (`observability/page.tsx:210-221`). Doble señal misma causa: saga fallida → `reconciliation` (crítica+email) + `webhooks_stuck` (media) | Semántica doc/código divergente y ruido duplicado | Alinear doc o código; tile de disabled distinto de "al día"; agrupar señales por causa | Confusión operativa menor | CORREGIR / DOCUMENTAR | Doc y código con la misma regla; test |
| CF-34 | Checkout/privacidad | **BAJA** | MEDIA | `/checkout/gracias?id=<txId>` muestra datos del comprador sin autenticación (`gracias/page.tsx:353-391`); mitigaciones: txId de alta entropía + rate-limit (:82) | PII accesible con el txId (filtrable por logs del navegador/red si se comparte el link) | Aceptable como está (decisión registrada) o rotar a token de orden de un solo uso | Exposición acotada de PII | POSPONER_CON_ADR | ADR con evaluación; si se decide, test de acceso |
| CF-35 | Config/fallbacks | **BAJA** | ALTA | `getSettingValue("COD_ENABLED","true")` fail-open (`checkout/service.ts:471`, `pago/page.tsx:80`): si la setting falta o se despublica, COD queda habilitado silenciosamente | Un método de pago se activa por ausencia de configuración | Fail-closed: default `"false"` para métodos de pago | Riesgo operativo menor | CORREGIR | Test: setting ausente → COD oculto |
| CF-36 | Módulos futuros nav | **INFORMATIVA** | ALTA | `/admin/bot` y `/admin/canales/mercadolibre`: entradas con badge, **ocultas en todos los modos** (`admin-nav.ts:420-431`), resueltas por el catch-all `[...placeholder]`. Hipótesis "el catch-all esconde módulos no implementados": **REFUTADA** — solo estas 2 rutas futuras lo usan; los 35 módulos del menú tienen página real | Correcto como FUTURO_APROBADO | Sin acción (documentar en ROADMAP su criterio de activación) | — | MANTENER | — |

**Hallazgos no confirmados como problema (consta para el registro):** el fallback global de FAQs todo-o-nada (`ayuda/page.tsx:148-167`) es intencional pero no evidente; la API `/api/catalog/templates` con `s-maxage=3600` no se purga por `updateTag` (menor, sin consumidor productivo hoy); `maxUsesPerCustomer` evadible cambiando de correo (best-effort documentado); `OrderItem` no snapshotea el nombre del producto (renombrar reescribe la historia visible — diseño, registrar); la alerta `pending_payment_wompi_stale` de PRD tiene `AlertState` histórico con 0 órdenes (residuo de CF-10, no un pago real).

---

## G. Datos por ambiente (conteos read-only, sin PII)

Método: `tmp/audit-20260911/data-counts.mjs` (agregados `SELECT count(*)`) ejecutado con cada env clasificado previamente por ref de proyecto (`.env.local`→LOCAL, `.env.stg`→STG, `.env.local.nube-backup`→PRD), exit 0 en los 3. Ningún email, teléfono, dirección, cuerpo de pedido, contenido de diseño ni URL firmada fue consultado ni impreso. Artefactos completos: `tmp/audit-20260911/data-{LOCAL,STG,PRD}.json`.

### G.1 Matriz de entidades

| Entidad | LOCAL | STG | PRD | Debe coincidir | Divergencia permitida | Evidencia | Acción |
|---|---|---|---|---|---|---|---|
| Categorías (total/activas/archivadas) | 84/4/80 | 84/4/80 | 84/4/80 | Sí | — | G.2 | Ninguna |
| Productos (total/activos/pausados/archivados) | 11/9/0/2 | 11/9/0/2 | 11/**8/1**/2 | Sí | **NO documentada para `nombre-personalizado`** (pausado solo en PRD) | G.2/G.4 | REQUIERE_EVIDENCIA_DEL_OPERADOR (CF-23) |
| Variantes (total/activas) | 140/140 | 115/82 | 85/52 | Sí | Parcial documentada (rollout NOMAG/multi-unidad en STG; precios NOMAG STG) | G.4 | Homologar con criterio (CF-23) |
| Variantes agotadas activas | 53 | 0 | 0 | n/a | Ambiental (stock de prueba) | G.2 | Ninguna (LOCAL) |
| Ocasiones activas | 16 | 16 | 16 | Sí | — | G.2 | Ninguna |
| Plantillas (total/activas/ocultas/descartadas) | 19/7/7/5 | 19/7/7/5 | 19/7/7/5 | Sí | — | §H | Ninguna (homologadas) |
| Cupones (total) | 43 | 43 | 43 | Sí | — | §I | **ELIMINAR_DATOS test (CF-05)** |
| Cupones: vigentes reales | 0 | 1 (test) | 1 (test) | Sí | — | §I | Decisión de negocio (CF-05) |
| Reseñas (total) | 0 | 0 | 0 | Sí | — | G.2 | Ninguna (las 24 demo del seed no existen en ningún ambiente) |
| Customers (total/señal test) | 4/4 | 3/2 | 1/0 | No | Ambiental ✓ | G.2 | Limpieza LOCAL/STG (CF-32) |
| AdminUsers (total/activos) | 1/1 | 2/2 | 1/1 | No | Ambiental ✓ (1 admin STG con señal test) | G.2 | Revisar admin test STG |
| Pedidos (total/señal test) | 0/0 | 4/0* | 0/0 | No | Ambiental ✓ — *los 4 de STG son smokes documentados (STATE.md 2026-08-11/09-05) | G.3 | Decisión conservar/purgar STG (CF-32) |
| WebhookEvent | 0 | 2 (AVEONLINE, procesados) | 1 (AVEONLINE, procesado) | No | Ambiental ✓ | G.2 | Ninguna |
| EmailEvent (delivered/bounced/delayed) | 0/0/0 | 0/0/0 | 221/212/21 | n/a | — | G.5 | **CF-04** |
| Diseños (total/anónimos) | 282/282 | 86/54 | 7/4 | No | Ambiental (fixtures + validación owner) | G.2 | Purga cron ya existe; limpieza LOCAL (CF-32) |
| DesignAsset | 75 | 66 | 0 | No | Ambiental | G.2 | — |
| DesignGalleryImage / LetterTileSet | 20/6 | 12/6 | 12/6 | Parcial | Galería diverge (20 vs 12) — sin criterio registrado | G.2 | Homologar o documentar |
| CMS (páginas/campos/settings/versiones) | 22/1064/51/1149 | 22/1064/51/1160 | 22/1064/51/1149 | Sí | STG +11 versiones (ediciones de prueba) — aceptable | G.2 | Ninguna (homologado, hash-verificado el mismo día) |
| CmsMedia / CmsListItem | 0/8 | 0/8 | 0/8 | Sí | — | G.2 | Mediateca vacía en los 3 (nota §K) |
| Crons pg_cron (activos) | 10 | 5 | 10 | Parcial | **Sí, documentada** (5 jobs de email desagendados en STG 2026-08-05, OPERATIONS.md:952) | G.6 | Ninguna (no re-aplicar migraciones 015/023 en STG) |
| Settings clave (7 verificadas, todas con valor) | ✓ | ✓ | ✓ | Sí | — | G.2 | Ninguna |
| Redirects (total/activos) | 130/107 | 130/107 | 130/107 | Sí | — | G.2 | Ninguna |
| Notificaciones (total) | 169 | 3 | 1 | No | Ambiental | G.2 | CF-26 (retención) |
| AlertState | 4 (3 stale crons locales + reconciliation) | 8 (heartbeats) | 17 (8 heartbeats + 6 `cron_stale_*` + `pending_payment_wompi_stale` + `reconciliation` + `daily_summary`) | No | Ambiental | G.2 | CF-10 (los estados no se limpian al recuperarse) |
| Tablas cuestionadas (BlogPost/SiteEvent/StockReservation/RecommendationLog/LoyaltyTxn) | 0/0/0/0/0 | 0/0/0/0/0 | 0/0/0/0/0 | Sí | — | G.2 | CF-13/CF-19 |
| ErrorLog 7 d / ErrorReport abierto | 29/2 | 0/1 | 1/1 | No | Ambiental | G.2 | — |
| WebVital | 4 139 | 13 890 | 2 548 | No | Ambiental | G.2 | CF-26 |

### G.2 Notas de homologación

- **Contenido CMS homologado**: 22 páginas, 1064 campos, 51 settings, `PRIVACY_POLICY_VERSION = "v5 · 2026-09-04"` en los 3 — consistente con la verificación por hash registrada en STATE.md del mismo día.
- **Catálogo NO homologado** (variantes y 1 producto pausado): detalle por producto en G.4. La última resincronización PRD→LOCAL fue 2026-08-11 (`tmp/backups/catalogo-prd-20260811.dump`); desde entonces las olas 16-29 tocaron variantes por separado en cada ambiente.
- **Reseñas**: 0 en los 3 ambientes — las 24 reseñas demo de `seed-products.mjs` no existen en ningún lado (fueron purgadas); el seed las reinsertaría si se corre (CF-09).
- **Wishlist, Referidos, WholesaleTier, Material, StockReservation, LoyaltyTxn, RetractRequest, WarrantyClaim, SupportTicket, CodReconciliation**: 0 filas en los 3 ambientes.

### G.3 Pedidos STG (claves de negocio, sin PII)

| Número | Estado | Método | Creado | Cupón |
|---|---|---|---|---|
| LCM-2026-0001 | CANCELLED | WOMPI | 2026-08-11 | no |
| LCM-2026-0002 | FULFILLING | WOMPI | 2026-08-12 | sí (único CouponUsage de STG) |
| LCM-2026-0003 | PENDING_PAYMENT | WOMPI | 2026-08-12 | no |
| LCM-2026-0004 | FULFILLING | WOMPI | 2026-09-05 | no |

Origen trazable a los smokes documentados en STATE.md (2026-08-11/12 y 2026-09-05). **Clasificación: datos de prueba con procedencia demostrable** — conservar o purgar es decisión del operador (CF-32). La orden PENDING de 2026-08-12 evidencia CF-11 (nunca expira).

### G.4 Divergencia de catálogo por producto (variantes total/activas; NOMAG)

| Producto | LOCAL | STG | PRD | Lectura |
|---|---|---|---|---|
| abecedario-completo | 12/12 (6 NM) | 12/8 (6 NM) | 12/8 (6 NM) | STG≡PRD; LOCAL todo activo |
| calendario-mes-a-mes-fotos | 2/2 (1 NM) | 2/2 (1 NM) | 1/1 (0 NM) | PRD sin la 2ª variante ni NOMAG |
| nombre-personalizado | 6/6 **activo** | 6/6 **activo** | 6/6 **PAUSADO** | **Divergencia no documentada** |
| pack-vocales | 12/12 | 12/8 | 12/8 | STG≡PRD |
| separadores-alargados | 24/24 (12 NM) | 24/24 (12 NM) | 12/12 (0 NM) | PRD sin gemelas NOMAG |
| separadores-magneticos | 24/24 (12 NM) | 24/24 (12 NM) | 12/12 (0 NM) | ídem |
| set-fotoimanes-cuadrados | 36/36 (18 NM) | 19/2 (1 NM) | 18/1 (0 NM) | 3 versiones distintas; activas 36/2/1 |
| set-fotoimanes-polaroid | 20/20 (10 NM) | 12/4 (2 NM) | 10/2 (0 NM) | ídem |
| tiras-magneticas-fotos | 4/4 (2 NM) | 4/4 (2 NM) | 2/2 (0 NM) | PRD sin gemelas |
| set-fotoimanes-circulares / -corazon | archivados | archivados | archivados | ✓ consistente |

### G.5 EmailEvent PRD por mes (CF-04)

| Mes | delivered | bounced | delivery_delayed | Bounce rate |
|---|---|---|---|---|
| 2026-08 | 168 | 157 | 13 | ~48 % |
| 2026-09 (al 11) | 53 | 55 | 8 | ~51 % |

### G.6 Jobs pg_cron verificados en DB

- **LOCAL y PRD (10/10 activos)**: lucams-alerts */5m, lucams-back-in-stock */30m, lucams-cart-recovery 1h, lucams-cms-publish-scheduled */5m, lucams-daily-summary 13:00, lucams-purge-anon-designs 08:00, lucams-purge-event-logs 03:00, lucams-review-request 17:00, rate_limit_cleanup */15m, stock_reservation_cleanup 1m.
- **STG (5/10)**: solo cms-publish-scheduled, purge-anon-designs, purge-event-logs, rate_limit_cleanup, stock_reservation_cleanup — los 5 jobs de email/alertas desagendados deliberadamente (documentado). Consistente con `CRON_JOBS_DISABLED` esperado en STG.
- **Sin jobs huérfanos ni endpoints sin job** en ningún ambiente.

---

## H. Plantillas (19/19, idénticas en los 3 ambientes)

Todas `EDITABLE`; **0 PREMADE en cualquier ambiente** (el strip PREMADE nunca renderiza — CF-07). Sin inconsistencias `isActive`×`deletedAt` (0 activas-borradas). Todas con preview y canvas. Ninguna asociada a producto archivado. Ningún `CartItem`/`OrderItem` referencia plantilla en ningún ambiente (0/0/0 — pipeline vestigial, CF-07⑤).

| Plantilla/grupo | Estado | Producto | Referencias históricas | Visible cliente | Origen | Ambiente | Disposición |
|---|---|---|---|---|---|---|---|
| calendario-mes-lateral | activa | calendario-mes-a-mes-fotos | 0 designs | Sí (Estudio) | seed | los 3 | MANTENER |
| libre-calendar-photo-month | activa | calendario-mes-a-mes-fotos | 0 | Sí | seed | los 3 | MANTENER |
| libre-photo-pack | activa | set-fotoimanes-cuadrados | 0 | Sí | seed | los 3 | MANTENER |
| photo-pack-polaroid-clasica | activa | set-fotoimanes-polaroid | 0 | Sí | seed | los 3 | MANTENER |
| photo-pack-polaroid-instagram | activa | set-fotoimanes-polaroid | 0 | Sí | seed (olas 8/9/17) | los 3 | MANTENER |
| photo-strip-3-fotos | activa | tiras-magneticas-fotos | **7 designs PRD** (último uso 2026-09-11, validación owner) | Sí | seed | los 3 | MANTENER (en uso real) |
| photo-strip-4-fotos | activa | tiras-magneticas-fotos | 0 | Sí | seed (ola18b) | los 3 | MANTENER |
| foto-rectangular-simple | oculta | set-fotoimanes-cuadrados | 0 | No | seed | los 3 | MANTENER (curaduría) |
| libre-business-logo | oculta | global (BUSINESS_LOGO) | 0 | No | seed | los 3 | MANTENER |
| libre-calendar-photo-hero | oculta | global (CALENDAR_PHOTO_HERO) | 0 | No | seed | los 3 | MANTENER |
| libre-custom-decor | oculta | global (CUSTOM_DECOR) | 0 | No | seed | los 3 | MANTENER |
| libre-event-favor | oculta | global (EVENT_FAVOR) | 0 | No | seed | los 3 | MANTENER |
| libre-photo-grid | oculta | global (PHOTO_GRID) | 0 | No | seed | los 3 | MANTENER |
| libre-text-only | oculta | global (TEXT_ONLY) | 0 | No | seed | los 3 | MANTENER |
| foto-cuadrado-simple | descartada | set-fotoimanes-cuadrados | 0 | No | soft-delete `system:M.3.b.CAT.11-2026-05-14` | los 3 | Purgable tras decisión (sin referencias) |
| sep-alr-4x12 / sep-alr-4x15 | descartadas | separadores-alargados | 0 | No | ídem | los 3 | ídem |
| sep-mag-2x6 / sep-mag-4x4-2 | descartadas | separadores-magneticos | 0 | No | ídem | los 3 | ídem |

**Determinaciones §10:** ① plantillas activas nunca alcanzables: ninguna estructural (las 7 activas tienen producto activo y entran por `listTemplatesForKind`; el strip PDP las topa a 8 por `slice(0,8)` — sin efecto hoy). ② Visibles con flujo incompleto: ninguna (todas EDITABLE con Estudio funcional). ③ Asociadas a productos archivados: 0. ④ Sin asset/asset huérfano: 0 (todas con preview). ⑤ Duplicadas: 0. ⑥ Históricas a preservar: `photo-strip-3-fotos` (7 designs reales). ⑦ Demo en PRD: 0 (todas provienen del seed canónico). ⑧ Descartadas purgables: las 5 de 2026-05-14 (0 referencias) — solo con script scoped y dry-run (§N). ⑨ Inconsistencias de estado: 0. **No se propone hard-delete de ninguna plantilla con referencias.**

---

## I. Cupones (43/43, idénticos en los 3 ambientes)

| Grupo | Ambiente | Cantidad | Usos (usedCount / reales / pedidos) | Referencias | Clasificación | Disposición |
|---|---|---|---|---|---|---|
| `CAT<runId>-PUBLIC10/-EXPIRED/-FUTURE/-INACTIVE` (3 tandas: …2972990553393, …3656297696850, …5382604625868) | LOCAL=STG=PRD | 12 | 0/0/0 | ninguna | **TEST_ONLY** (señal objetiva: run ID de suite de integración, timestamps 2026-07; nacen `isActive:false`/ventanas imposibles) | ELIMINAR_DATOS (§N-05) |
| `SAG***` FIXED (pausados, 1 vigente) | LOCAL=STG=PRD | 22 | 21 con usedCount=1-2 / **0 reales** / 0 pedidos | ninguna | **TEST_ONLY** (saga tests; drift de purga) | ELIMINAR_DATOS + corregir drift |
| `ord***` PERCENT | LOCAL=STG=PRD | 7 | 0/0/0 | ninguna | **TEST_ONLY** (orders tests) | ELIMINAR_DATOS |
| `LUC***` PERCENT expirado | LOCAL=STG=PRD | 1 | 0/0/0 | ninguna | **ORIGEN_DESCONOCIDO** — único sin señal de test; plausible cupón real viejo | REQUIERE DECISIÓN DEL OPERADOR |
| `SAG***` PERCENT pausados (patrón saga) | LOCAL=STG=PRD | 1 | 0/0/0 | ninguna | TEST_ONLY | ELIMINAR_DATOS |
| **Totales** | los 3 | **43** | **21 con drift usedCount** | 0 pedidos, 0-1 CouponUsage | 42/43 test, 1 desconocido | **0 cupones reales vigentes en PRD** |

Cableado del módulo: **demostrado completo** (admin CRUD parcial + aplicación en `/checkout/pago` + validación atómica en tx + redención gated al pagar + reversa simétrica + trigger per-customer + tests unit/int/e2e) — el módulo NO se juzga por la cantidad de registros sino por el cableado (§11): los gaps son CF-06 (UI/copy/revalidate) y CF-05 (datos). Invariantes §11: aplicar ✓, eliminar de sesión ✓, recálculo ✓, atómico al pagar ✓, límites ✓, FREE_SHIPPING ✓, invalidación ⚠️ parcial, copy ✗, rutas revalidadas ✗ (admin), auditoría ✓.

---

## J. Integraciones (tabla de verdad)

Estados según §14. "Probe real" verificado en código; ningún probe genera pagos, guías ni emails (verificado). Estados actuales en vivo: UNKNOWN_NOT_PROBED (no se ejecutaron probes contra PRD en esta fase).

| Integración | Propósito | Modo | Variables requeridas (NOMBRES) | Configurada (cómo lo decide el código) | Probe real | Qué prueba el probe | Criticidad | Panel admin | Alertas | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| Supabase (DB/Auth/Storage) | Núcleo | PRODUCTION | DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY | Zod fail-fast al boot (`lib/env.ts:25-32`) | Sí: `/api/health/db` (SELECT 1), `/api/health/storage` (list 1 objeto) | Conectividad Postgres + bucket accesible | Crítica (única bloqueante en `/api/health/all`) | Sí, consume probes ✓ | Indirecta (errors_spike, crons) | PRODUCTION |
| Wompi | Pagos | SANDBOX \| PRODUCTION según WOMPI_ENV | WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY, WOMPI_EVENTS_SECRET, **WOMPI_INTEGRITY_SECRET** (+WOMPI_ENV) | `getWompiConfig()` exige 4 y lanza (`lib/wompi.ts:61-71`); **panel chequea 3** (CF-03) | Sí: `GET /merchants/{pubKey}`, sin efectos | Coherencia llaves+ambiente; `skipped` si falta config | Alta | **warn fijo** (CF-03) | Indirectas DB (reconciliation, pending_stale) | PRODUCTION / panel DEGRADED artificial |
| Aveonline | Envíos | test \| production; cuenta demo≠real distinguida por probe (`idempresa` 15289) | AVEONLINE_USUARIO, AVEONLINE_CLAVE, AVEONLINE_WEBHOOK_SECRET (+AVEONLINE_ENV, AVEONLINE_GENERATE_REAL) | `getAuthToken()` exige 2 (`aveonline.ts:571-578`); doble gate de facturación (:1026-1031) | Sí: autenticación, sin guías; prod+demo→warn explícito | Solo auth, no flujo transaccional | Alta | **warn fijo** (CF-03) | webhooks_stuck | PRODUCTION / panel DEGRADED artificial |
| Resend | Email transaccional | PRODUCTION | RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, RESEND_WEBHOOK_SECRET | Boot Zod + dominio verificado | Sí: `GET /domains` + verificación remitente | Key válida + dominio verificado; sin envíos | Alta | Sí, consume probe ✓ | **Ninguna de bounce rate (CF-04)** | PRODUCTION / DEGRADED real según datos (CF-04) |
| Gemini (IA) | Sugerencias de diseño | PRODUCTION (full), fail-open a "sin ideas" | GEMINI_API_KEY, GEMINI_MODEL_PRIMARY, GEMINI_MODEL_FALLBACK | Runtime lanza `AiUnavailableError` sin key | **No existe** | — | Media | **No** | **No** | UNKNOWN_NOT_PROBED — ciego (CF-22) |
| WhatsApp (wa.me) | Deeplinks de contacto/venta | Siempre activo | NEXT_PUBLIC_WA_NUMBER (fuente real: setting CMS WA_NUMBER) | CMS→env→fallback (`lib/wa.ts:25-38`) | No posible (solo links) | — | Media | ok **estático** | No | UNKNOWN_NOT_PROBED |
| Cloudflare Turnstile | Anti-bot formularios | PRODUCTION, fail-closed sin secret | NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY | Boot Zod | No (siteverify ocurre por-request) | — | Alta | ok **estático** | No | UNKNOWN_NOT_PROBED |
| HIBP | Passwords comprometidas | Sin config (API gratuita), fail-open deliberado | Ninguna | n/a | No | — | Media | **No** | No | UNKNOWN_NOT_PROBED (invisibilidad deliberada) |
| Cloudflare R2 | Backups cifrados DB+Storage | PRODUCTION vía GitHub Actions | R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (+BACKUP_*) | Gate `HAS_R2` en workflow | DR drill mensual (restore real) | Restaurabilidad del dump | Alta | **No** | **No in-app (CF-25)** | PRODUCTION / visibilidad solo-CI |
| Vercel | Plataforma deploy | PRODUCTION | VERCEL_ENV/VERCEL_URL (auto), VERCEL_BYPASS_TOKEN (CI) | `getTrustedSelfBaseUrl()` + detección de Deployment Protection en `/api/health/all` | `/api/health` (liveness) | Runtime responde | Crítica | **No** | No | PRODUCTION |

**Reglas §14 verificadas:** "variable presente"≠"sana" (el panel viola esto para Wompi/Aveonline/WhatsApp/Turnstile — CF-03); "no probada"≠"caída" ✓ (`skipped` no bloquea); "deshabilitada"≠"degradada" ✓ (CRON_JOBS_DISABLED nunca overdue); "sandbox"≠"error" ✓ en código, invisible en panel; probe de auth ≠ flujo transaccional ✓ (documentado en headers); healthchecks sin efectos laterales ✓; UI/`/api/health/all`/alertas comparten semántica **parcialmente** (CF-03). **Inventario documentado vs panel (hipótesis 9): CONFIRMADA** — Gemini, HIBP, R2, Vercel fuera del panel; Turnstile/WhatsApp dentro pero estáticos. Ninguna integración mostrada como activa carece de consumidor real.

---

## K. Módulos y rutas (35/35 módulos admin + storefront)

Sidebar efectivo: **0 links rotos** (las 2 entradas futuras están ocultas). Páginas reales sin entrada de menú: `disenos`, `fichas` (módulos completos — CF-29), más sub-vistas legítimas (borradores, editores, aveonline, taller, detalles).

| Módulo | Nav | Ruta real | Placeholder | Servicio | Acción operativa | Estado | Disposición |
|---|---|---|---|---|---|---|---|
| dashboard | ✓ | real | no | prisma directo (conteos reales) | cards/links | PRODUCTIVO | MANTENER |
| pedidos (+[number]) | ✓ | real | no | `features/orders/*` | retry guía, transición, refund (SUPER+MFA), no-show, bloqueo dirección | PRODUCTIVO | MANTENER |
| clientes (+[id]) | ✓ | real | no | `features/customers/service` | solo lectura (Ley 1581) | PRODUCTIVO | MANTENER |
| cotizaciones (+[id], taller) | ✓ | real | no | `features/quotes/admin-service` | estados, notas | PRODUCTIVO (OCULTO_POR_MODO en full) | MANTENER |
| productos (+nuevo/[id]/variants) | ✓ | real | no | `features/products/*` | CRUD, imágenes, bulk, stock | PRODUCTIVO | MANTENER |
| inventario | ✓ | real | no | `features/products/inventory-service` | ajuste stock con razón | PRODUCTIVO | MANTENER |
| categorias (+[id]) | ✓ | real | no | `features/categories/service` | CRUD, mover, restaurar | PRODUCTIVO | MANTENER |
| ocasiones (+[id]) | ✓ | real | no | `features/ocasiones/service` | CRUD, link productos | PRODUCTIVO | MANTENER |
| cupones | ✓ | real | no | `features/coupons/service` | crear/pausar/reactivar (**sin editar/archivar UI** — CF-06) | PRODUCTIVO_CON_GAP | CORREGIR_CABLEADO |
| plantillas | ✓ | real | no | `features/personalization/admin-templates` | aprobar/ocultar (**sin descartar** — CF-07) | PRODUCTIVO_CON_GAP | CORREGIR_CABLEADO |
| moderacion | ✓ | real | no | `features/moderation/service` | aprobar/rechazar diseños | PRODUCTIVO | MANTENER |
| resenas | ✓ | real | no | `features/reviews/admin-service` | moderar, destacar, bulk | PRODUCTIVO | MANTENER |
| soporte | ✓ | real | no | `features/support/admin-service` | estados (respuesta=mailto, CF-12) | PRODUCTIVO_CON_GAP | CONSOLIDAR (con mensajes) |
| mensajes | ✓ | real | no | **mismo servicio** | **misma acción** (CF-08) | DUPLICADO | CONSOLIDAR |
| retractos | ✓ | real | no | `features/retract/service` | aprobar/rechazar/recibir/reembolsar | PRODUCTIVO (RBAC CF-24) | CORREGIR_CABLEADO |
| garantias | ✓ | real | no | `features/warranty/service` | flujo largo Ley 1480 | PRODUCTIVO (RBAC CF-24) | CORREGIR_CABLEADO |
| reclamos (+[id]) | ✓ | real | no | mismo WarrantyClaim | cierre rápido (decisión documentada) | PRODUCTIVO (duplicado parcial justificado) | MANTENER |
| usuarios | ✓ | real | no | `features/admin-users/service` | roles, activar/desactivar (anti-lockout) | PRODUCTIVO | MANTENER |
| seguridad | ✓ | real | no | `features/admin-mfa/*` | MFA, recovery codes, reauth | PRODUCTIVO | MANTENER |
| auditoria | ✓ | real | no | AdminActionLog | solo lectura + filtros | PRODUCTIVO | MANTENER |
| contenido (+subpáginas) | ✓ | real | no | `features/cms/service` | 16 actions, versionado, programación | PRODUCTIVO | MANTENER |
| contenido/mediateca | ✓ | real | no | `lib/cms-media` | upload con guardas (0 assets en los 3 ambientes) | PRODUCTIVO | MANTENER |
| email-templates | ✓ | redirect → contenido/paginas/emails | n/a | (CMS; solo 1/23 plantillas lee CMS — CF-14) | — | PRODUCTIVO_CON_GAP | DOCUMENTAR/CORREGIR |
| canales (redirect) + canales/tienda | ✓ | real | no | env/store-mode | solo estado | PRODUCTIVO | MANTENER |
| canales/mercadolibre | oculto | **catch-all** | sí | — | — | FUTURO_APROBADO | MANTENER |
| /admin/bot | oculto | **catch-all** | sí | — | — | FUTURO_APROBADO | MANTENER |
| integraciones (+aveonline) | ✓ | real | no | env + 3 probes (CF-03) | registrar/eliminar webhook Aveonline | PRODUCTIVO_CON_GAP | CORREGIR_CABLEADO |
| finanzas (+conciliacion, bloqueos) | ✓ | real | no | Order + `cod-reconciliation` + BlockedIdentity | remesa/discrepancia, bloqueos (DIAN/IVA = tarjetas "Próximamente" declaradas) | PRODUCTIVO parcial | MANTENER |
| mayorista | ✓ (oculto en catalog) | real | no | WholesaleTier (sin consumidor storefront) | CRUD tiers | FUTURO_APROBADO de facto | MANTENER |
| materiales / costos | ✓ | real | no | prisma directo | CRUD materiales, costos (0 filas Material) | ADMIN_ONLY_JUSTIFICADO | MANTENER |
| metricas | ✓ | real | no | agregados Order/Quote en vuelo | solo lectura | PRODUCTIVO | MANTENER |
| observability | ✓ | real | no | ErrorLog/ErrorReport/Webhook/WebVital/crons | triage errores cliente | PRODUCTIVO | MANTENER |
| performance | ✓ | real | no | ErrorLog+WebVital 7 d (≈subconjunto de observability) | solo lectura | PRODUCTIVO (solapamiento leve) | MANTENER |
| notificaciones | ✓ | real | no | `features/notifications/service` | markRead/markAll (badge solo SUPERADMIN) | PRODUCTIVO | MANTENER |
| redirects | ✓ | real | no | `features/redirects/service` | CRUD 301/302 | PRODUCTIVO | MANTENER |
| disenos | **✗** | real | no | `features/personalization/design-gallery` | galería prediseñada | PRODUCTIVO, huérfano de menú (CF-29) | CORREGIR (nav) |
| fichas | **✗** | real | no | `features/personalization/letter-tiles` | sets y fichas abecedario | PRODUCTIVO, huérfano de menú (CF-29) | CORREGIR (nav) |

Storefront (47/47 páginas): 44 PRODUCTIVO · 2 PRODUCTIVO_CON_GAP (`/status` CF-16, `/auth/callback` dormido documentado) · 2 OCULTO_POR_MODO en catalog (`/checkout/envio|pago`, PRODUCTIVO en full) · 3 TEST_ONLY (`/internal/*`, dev-only con guard `VERCEL_ENV`). Cero PLACEHOLDER/HUÉRFANO/DUPLICADO.

---

## L. Scripts y seeds (79/79 + datos + Makefile + CI)

Inventario real: **79 `.mjs` + 2 archivos de datos** en `packages/db/scripts/` (el "~85" del encargo), + 4 shell en `scripts/`, 1 git-hook, 9 en `apps/web/scripts/`, 4 workflows. Guard: ✓=env-guard · ◐=guard propio · ✗=sin guard. DR: ✓=dry-run por defecto.

### L.1 Seeds canónicos y bootstrap

| Script | Tipo | Guard | DR | Entorno permitido | Riesgo | Consumidor | Sigue vigente | Disposición |
|---|---|---|---|---|---|---|---|---|
| seed-products.mjs | seed demo+bootstrap mezclado | ✗ | ✗ | cualquiera (PRD incl.) | **CRÍTICO** (pisa precios/imágenes, archiva ajenos, reactiva, 24 reseñas demo — CF-09) | `make seed-products`, db-local/stg-seed | sí | **Refactorizar urgente** (separar canónico/demo + guard + transacción) |
| seed-templates.mjs | seed canónico plantillas | ✗ | ✗ | cualquiera | alto (barrido soft-delete de plantillas ajenas `:757-773`; resetea estados admin) | `make seed-templates`, db-local/stg-seed | sí | Refactorizar (gatear barrido) |
| seed-ocasiones.mjs | seed canónico | ✗ | ✗ | cualquiera | medio (pisa name/description editadas) | Makefile | sí | Mantener + guard |
| seed-catalog-v2.mjs | seed canónico delta | ✗ | ✗ | cualquiera | bajo-medio (solo campos vacíos) | Makefile + **CI e2e/lighthouse/nightly** | sí | Mantener + guard |
| migrate-cms-v2.mjs | bootstrap CMS (site map) | ✗ | ✗ | cualquiera | bajo (nunca pisa editados) | Makefile + nightly | sí | Mantener + guard |
| cms-site-map.mjs | dato canónico (938 campos inline) | — | — | — | n/a | importado por migrate-cms-v2 | sí | Mantener |
| seed-letter-sets.mjs | bootstrap (ADR-057) | ✗ | ✗ | cualquiera | bajo | `make seed-letter-sets` | sí | Mantener + guard |
| restructure-abecedario.mjs / restructure-separadores.mjs | bootstrap one-shot reproducible | ✗ | ✗ | cualquiera | medio (archivan productos viejos; no pisan precios) | `make seed-abecedario` / `seed-separadores` | sí | Candidato a canónico o archivar |
| seed-product-dims.mjs | backfill 2026-05 | ✗ | ✗ | cualquiera | bajo | **header invoca target inexistente** | dudosa | Archivar o crear target |
| seed-gallery-separadores.mjs | seed demo | ◐ solo-local | ✗ | **solo local** | bajo | uso directo | sí (local) | Mantener |

### L.2 Seeds demo y fixtures de test

| Script | Tipo | Guard | DR | Riesgo | Consumidor | Vigente | Disposición |
|---|---|---|---|---|---|---|---|
| seed-reviews-demo.mjs | seed demo | ✗ | ✗ | **alto** (ficticias aprobadas sin guard) | ninguno | **no** (reemplazado por curated) | **Añadir guard o borrar** |
| seed-reviews-circle.mjs / seed-reviews-curated.mjs | seed demo one-shot | ✓ | ✗ | bajo-medio | docs | aplicados | Archivar |
| seed-test-customer.mjs | fixture | ✓ + check PRD extra | ✗ | bajo | docs/STATE | sí | Mantener |
| seed-fixture-polaroid-design.mjs | fixture | ✗ | ✗ | medio (assets reales al bucket) | finalize-server-render.integration.test | sí | Mantener + guard |
| create-test-design-polaroid-ig.mjs / create-test-design-separadores.mjs | fixture | ✗ | ✗ | medio | **ninguno encontrado** (tests usan seed-fixture-*) | dudosa | Verificar y archivar |
| make-test-designs-clonable.mjs | fixture one-shot | ✗ | ✗ | bajo | ninguno | **no** (sessionIds que el teardown borra) | **Borrar** |

### L.3 Administración y break-glass

| Script | Tipo | Guard | DR | Riesgo | Consumidor | Vigente | Disposición |
|---|---|---|---|---|---|---|---|
| seed-admin.mjs | bootstrap/reparación | ✗ | ✗ | **alto** (crea/reactiva SUPERADMIN donde apunte el env; header invoca `make seed-admin` inexistente) | docs (usado en STG) | sí | Mantener + **guard/confirmación** |
| admin-mfa-reset.mjs | reparación break-glass | ✗ | ✗ | alto por diseño (borra TOTP; header invoca target inexistente) | DECISIONS.md | sí | Mantener + confirmación interactiva + log |
| seed-clean.mjs | limpieza total usuarios | ✓ | ◐ `FORCE=1` | alto acotado | reset local | sí | Mantener |

### L.4 Limpieza y mantenimiento (modelo a imitar)

| Script | Tipo | Guard | DR | Riesgo | Consumidor | Vigente | Disposición |
|---|---|---|---|---|---|---|---|
| cleanup-test-junk.mjs | limpieza recurrente | ✓ | ✓ | bajo (scoped fixtures, soft-delete si hay OrderItem) | `make cleanup-test-junk` | sí | Mantener |
| purge-test-orders.mjs | limpieza | ✓ | ✓ | bajo (transacción única, guardarraíl >$10.000 COP) | docs | sí | Mantener (ojo: no decrementa `Coupon.usedCount` — origen del drift CF-05) |
| purge-archived-test-junk.mjs | limpieza | ✓ | ✓ (+flag) | medio (hard delete transaccional) | docs | sí | Mantener |
| cleanup-legacy-paused-variants.mjs / cleanup-junk-categories.mjs / ola16-cleanup-test-data.mjs | limpieza one-shot | ✓ | mixto | bajo-medio | ninguno | aplicados/superseded | Archivar (junk-categories: **borrar**) |
| cleanup-empty-categories.mjs | limpieza one-shot | ✗ | ✗ | medio-alto (soft-delete masivo, whitelist quemada) | ninguno | no | Archivar |

### L.5 Migraciones/reparaciones de datos vigentes o recientes

| Script | Tipo | Guard | DR | Riesgo | Consumidor | Vigente | Disposición |
|---|---|---|---|---|---|---|---|
| seed-magnet-variants.mjs (2026-09-08) | migración datos (gemelas -NOMAG) | ✓ | ✓ | medio | ninguno | aplicado LOCAL/STG; PRD parcial (G.4) | Archivar tras homologar (CF-23) |
| normalize-letterset-quantity.mjs / normalize-variant-pack-size.mjs | reparación | ✓ | ✓ | bajo | ninguno | vigente | Archivar tras aplicar |
| ola19-separadores-libros.mjs (tocado 2026-09-11) | one-shot | ✗ | ✗ | medio ("resetea precios a 0 al canónico") | ninguno | vigente hoy | Archivar tras aplicar |
| update-public-content-20260911.mjs / update-production-days-20260911.mjs / publish-legal-v5-20260911.mjs | one-shot contenido (aplicados en los 3 ambientes el 2026-09-11) | ✗ (deliberado: caso de uso PRD) | ✓ | bajo-medio (legal-v5 invalida consentimientos — irreversible en la práctica) | docs | vigente hoy | Archivar tras validación en vivo |
| ola17-polaroid-instagram-profile-photo.mjs / fix-tiras-stg-2026-09-07.mjs (◐ STG-only) | one-shot | ✓/◐ | ✓ | bajo | ninguno | aplicados | Archivar |

### L.6 One-shots históricos aplicados (45 en total)

Aplicados (candidatos a `scripts/one-shot/` o borrado según §N-06): `activate-lucy-catalog` (**alto**: setea precios + soft-deletea "todo lo demás"), `activate-tiras-magneticas`, `consolidate-product-families` (tiene target Makefile), `rename-family-base-slugs` (target), `backfill-variant-prices` (target), `backfill-category-visuals`, `cleanup-slugs` (target), `migrate-cms-list-items`, `refactor-abecedario-separadores` (**borrar**: superseded), `fix-fotoimanes-aspects` (target), `ola2a-*` (3), `ola3-templates-2caras-polaroid`, `ola4-depura-plantillas-2026-07-23`, `ola4-tira-continua-2026-07-23`, `ola8-*`, `ola9-*`, `ola16-fix-separadores-libros-schema`, `ola17-separadores-alargados`, `ola18-alargados-cantidades`, `ola18b-cuadrados-tiras-fix`, `polaroid-qty-libre-2026-07-22`, `tiras-magneticas-6-5x20-2026-07-22`, `extend-variant-dims-2026-07-22`, `fotoimanes-cuadrados-8x8-10x10-2026-07-22`, `apply-tira-template-2026-07-22`, `update-delivery-copy-20260801`, `reassign-separadores-gallery-tags` (**borrar**), `update-separadores-gallery-tags`, `tag-recommender-coverage` (dudosa), `ola16-check-remote-db` (diagnóstico), `lib/verify-tiras-catalog`. **Hipótesis "scripts históricos siguen ejecutables sin operación vigente": CONFIRMADA** — todos corren hoy contra lo que apunte el env (la mayoría sin guard).

### L.7 Diagnóstico y CI

| Script | Tipo | Consumidor | Disposición |
|---|---|---|---|
| audit-content-coverage.mjs (+ baseline.json) | diagnóstico / **gate CI** (`--check`) | ci.yml quality, `make audit-content` | Mantener |
| audit-slugs.mjs / audit-variants.mjs | diagnóstico | Makefile / directo | Mantener |
| verify-cms-v2-integrity.mjs | diagnóstico | directo | Mantener (candidato a gate CI) |
| certify-fase2.mjs | certificación pagos/envíos sandbox | manual | Mantener |
| simulate-wompi-webhook.mjs / simulate-aveonline-webhook.mjs | test manual webhook | dev | Mantener |

### L.8 env-guard: cobertura y limitación

- **Con guard (15)**: cleanup-junk-categories, cleanup-legacy-paused-variants, cleanup-test-junk, fix-tiras-stg (◐ STG-only), normalize-letterset-quantity, normalize-variant-pack-size, ola16-cleanup-test-data, ola17-profile-photo, purge-archived-test-junk, purge-test-orders, seed-clean, seed-magnet-variants, seed-reviews-circle, seed-reviews-curated, seed-test-customer (+◐ seed-gallery-separadores solo-local). Los teardowns de vitest/e2e también la usan.
- **Sin guard (63/79)**, los más sensibles: los 5 canónicos del Makefile, seed-admin, admin-mfa-reset, seed-reviews-demo, activate-lucy-catalog, cleanup-empty-categories y todos los one-shots.
- **Limitación declarada (`env-guard.mjs:20`)**: hosts remotos ajenos a Supabase y URLs no parseables → clase `"other"` → **no se bloquean (fail-open)**. Tampoco valida el ref STG más allá del substring. Propuesta en §N-06 (invertir a fail-closed).

### L.9 Makefile (targets ↔ scripts)

`db-local-seed`/`db-stg-seed` ejecutan los 5 canónicos con `.env.local`/`.env.stg`; targets individuales para los mismos 5 + seed-abecedario/seed-separadores/seed-letter-sets/cleanup-test-junk (APPLY=1)/one-shots 2026-05 (4 targets candidatos a retirar)/fix-fotoimanes/audit-slugs/audit-content. **Scripts referenciados por Makefile y ausentes: 0. Headers que invocan targets inexistentes: 4** (`seed-admin`, `admin-mfa-reset`, `seed-clean`, `seed-product-dims`). Targets de infra (`db-local-*`, `web-*`, `test-*`) y `e2e-fullmode.sh` revisados: vigentes.

### L.10 CI/CD y scripts web

`ci.yml` (push/PR develop+production): quality (typecheck+lint+audit-content+voseo+build), unit-tests (vitest coverage gate + Postgres service), e2e (seed **solo seed-catalog-v2** + Playwright), lighthouse, gitleaks, format, dep-audit. `nightly-full.yml` (06:00 UTC): localstack + vitest completo + E2E full + cross-browser (seeds: catalog-v2 + migrate-cms-v2). `backup.yml` diario y `dr-drill.yml` mensual (día 2) usan `apps/web/scripts/backup-*` y `dr-drill*` (vigentes, con libs testeadas; gaps de señal en CF-25). Nota: CI siembra un catálogo parcial distinto del de local/STG (divergencia estructural de fixtures — CF-09).

---

## M. Deriva documental

| Documento | Afirmación | Realidad observada | Riesgo | Corrección requerida |
|---|---|---|---|---|
| docs/ROADMAP.md | Fase 6 (Backoffice) "⏸️ Pendiente" con checklist íntegro sin marcar | ~80 % construido: pedidos con transiciones/guía, inventario con razón, clientes 360, moderación reseñas, auditoría, MFA, garantías, retractos, dashboard/métricas | Planificación distorsionada | Actualizar tabla + checklist al estado real (pendientes reales: portal `/mayorista` público, blog, B2B DIAN) |
| docs/ROADMAP.md | Fase 7: E2E, k6, cookie banner, DR drill sin marcar | 67 specs E2E, `tests/load/`, `features/consent`, `dr-drill.yml` verde 2026-09-04 | Ídem | Marcar hechos |
| docs/QA_CHECKLIST.md:68 | "«Personalizar» → abre wa.me con mensaje pre-armado" | CTA = `<Link>` a `/estudio/[slug]?variant=&copies=` (`variant-actions.tsx:122-171`); `lib/wa.ts:45` (`kind:"personalize"`) sin llamadores | Gate pre-launch inválido | Reescribir el flujo; retirar rama muerta de wa.ts |
| docs/QA_CHECKLIST.md:150-159 | Botón "✏️ Editar este sitio bottom-right"; versionado "CmsBlockVersion" | Entrada por `/admin/contenido`, barra superior fija; `CmsFieldVersion` | Confusión operativa | Actualizar sección J |
| docs/STATE.md (resumen) + features/consent/service.ts:13-14 | "re-consent activo" con `PRIVACY_POLICY_VERSION` | El banner usa versión hardcoded `COOKIE_CONSENT_VERSION=1`; no se re-muestra (CF-15) | Cumplimiento | Cablear re-consent o corregir docs |
| apps/web/app/estudio/[slug]/README.md:185,568 | "suggestDesignAction (Claude API, ADR-058)" | Proveedor Gemini (`features/ai/gemini-provider.ts:14`) | Deriva | Claude→Gemini ×2; corregir ruta `canvas-migrate` y umbral de cobertura citado |
| docs/OBSERVABILITY.md:174 | errors_spike: "5+ errores 500 en una misma ruta" | Cuenta global cualquier tipo (`alerts.ts:50-53`) | Semántica | Alinear (CF-33) |
| docs/OBSERVABILITY.md:51,180-181 | SLO bounce ≥98 % + alerta bounce >5 % + alerta firma inválida | No existen en código; bounce PRD real ~50 % (CF-04) | Doc aspiracional sin cablear | Implementar o marcar como objetivo |
| docs/INTEGRATIONS.md vs panel | Inventario completo | Panel: 6 cards (2 con warn fijo, 2 estáticas); Gemini/HIBP/R2/Vercel ausentes | Hipótesis 9 CONFIRMADA | Unificar fuente de verdad (CF-03) |
| docs/PLAN.md / ARCHITECTURE.md | Blog (`BlogPost`) en árbol y modelo | 0 código, 0 filas | Deriva esquema | ADR (CF-19) |
| Comentarios de código (9 citas) | varias | ver CF-31 | Deriva conceptual | Barrido en PRs del módulo |
| docs/* (Venndelo, Twilio/bot, chatbot RAG, catalog vs full) | histórico | SUPERSEDED/honesto/etiquetado futuro ✓ | — | Ninguna (bien documentado) |
| docs/CMS_ROADMAP.md / CONVENTIONS.md | "site map = fuente de verdad" | ~100 keys leídas en código ausentes del site map (legacy); 1 key sembrada sin lector; 14 settings zombi | DB fresca con fallbacks permanentes y contenido no editable | Completar site map o declarar excepción (CF-19/G4-CMS) |

---

## N. Manifiesto de saneamiento (propuesta — NADA aplicado)

Cada cambio requiere aprobación explícita por ID. Tipos: CÓDIGO / DATOS / DOCS / SCRIPT. Todos los de DATOS con script scoped: dry-run por defecto, `--apply` explícito, transacción, conteos antes/después, sin PII en salida, LOCAL→STG antes que PRD (PRD solo con la frase ceremonial del encargo).

| ID | Tipo | Entidad/archivos | Selector exacto | Ambiente | Referencias comprobadas | Acción | Dry-run | Backup/rollback | Riesgo | Aprobación requerida |
|---|---|---|---|---|---|---|---|---|---|---|
| N-01 (CF-01) | CÓDIGO | `features/orders/service.ts` (`createOrderFromCartTx`) | filtro `variant.isActive && variant.deletedAt:null && variant.product.isActive && product.deletedAt:null` al cargar `cart.items`; rechazo o exclusión con recálculo | código | Pedidos históricos: intocados (solo lectura de creación) | Excluir/rechazar items retirados al crear la orden | n/a | git revert | Medio (cambia totales en carreras — es el punto) | Sí |
| N-02 (CF-02) | CÓDIGO (test) | `finalize-server-render.integration.test.ts` | forzar fallo de TODOS los tiers (mock de `tryServerRenderProduction`) en lugar del fixture Polaroid | código | El camino productivo no cambia | Reescribir el test del fallback | n/a | git revert | Bajo | Sí |
| N-03 (CF-03) | CÓDIGO | `admin/(panel)/integraciones/page.tsx` (+tests) | consumir `/api/health/wompi` + `/api/health/aveonline` (misma semántica que `/api/health/all`); config Wompi = 4 vars; textos sandbox/production/cuenta-demo | código | Probes ya existentes sin efectos laterales | Cablear probes reales al panel; estados DISABLED_BY_MODE/SANDBOX distinguibles | n/a | git revert | Bajo | Sí |
| N-04 (CF-04) | CÓDIGO + DATOS | `features/observability/alerts.ts` + vista `EmailEvent` | nueva alerta `email_bounce_rate` (ventana 7 d, umbral 5 %); tile en `/admin/observability` | código + PRD (lectura) | EmailEvent ya persistido por webhook | Alerta + pantalla; investigación del origen (operador) | n/a | git revert | Bajo | Sí (+ decisión origen bounces) |
| N-05 (CF-05) | DATOS | tabla `Coupon` | `code ~ '^(CAT[0-9]{13,}-|SAG|ord)'` (verificación individual de los 42) + `pedidos=0 AND usos=0`; excluir `LUC***` (decisión aparte) | LOCAL→STG→PRD | 0 pedidos, 0 CouponUsage en los 42 (verificado los 3 ambientes) | Hard delete scoped + corrección de drift en sobrevivientes (ninguno con usos reales) | sí (lista slugs/códigos, conteos) | dump de las 42 filas a `tmp/backups/` antes de borrar; transacción única | Bajo (0 referencias) | Sí, por ambiente |
| N-06 (CF-09) | SCRIPT | `packages/db/scripts/*` | ① todo script que escribe importa env-guard; ② guard fail-closed (`other`/no-parseable = bloqueado; PRD exige doble gate); ③ dry-run default + `--apply`; ④ split `seed-products` canónico/demo (sin pisar `price/images/isActive/deletedAt`); ⑤ gatear barrido de `seed-templates`; ⑥ mover 45 one-shots a `scripts/one-shot/`; ⑦ borrar 4 scripts marcados; ⑧ lint CI de guards | repo | Seeds no se ejecutaron en esta fase (prohibido) | Endurecimiento + higiene | sí | git revert | Medio | Sí |
| N-07 (CF-06) | CÓDIGO | `admin/(panel)/cupones/*` | UI edición/archivo cableada a `updateCouponAction`/`archiveCouponAction` (ya auditadas); copy → `/checkout/pago`; `revalidatePath("/checkout/pago")` ×5; comentario `page.tsx:112` | código | Actions existentes con tests; sin cambio de modelo | Cablear UI + copy + rutas | n/a | git revert | Bajo | Sí |
| N-08 (CF-07) | CÓDIGO (+decisión) | `templates-strip.tsx`, `estudio/[slug]/page.tsx`, `studio-editor.tsx`, `features/personalization/service.ts` | ① consumir `?template=` (precargar slug elegido) o retirar parámetro; ② decidir PREMADE (negocio): cablear `?templateId=`→carrito o retirar strip PREMADE; ③ filtro `mode` en `listTemplatesForKind`; ④ persistir `templateId` al cambiar en sidebar | código + datos (0 PREMADE en DB) | 0 CartItem/OrderItem con templateId (0 históricos que romper) | Corrección de cableado | n/a | git revert | Medio (UX del Estudio) | Sí + decisión PREMADE |
| N-09 (CF-08) | CÓDIGO | `admin/(panel)/mensajes` | redirect 301 `/admin/mensajes`→`/admin/soporte`; retirar actions gemelas; nav actualizado | código | Mismo servicio/modelo/permisos (verificado) | Consolidar | n/a | git revert | Bajo | Sí |
| N-10 (CF-13/19) | CÓDIGO+DATOS | `StockReservation`, `BlogPost`, `SiteEvent`, `RecommendationLog`, `LoyaltyTxn`, 14 settings zombi | ADR por modelo: drop (migración) o FUTURO_APROBADO oculto; `cron.unschedule('stock_reservation_cleanup')` si se retira | código + 3 ambientes | 0 filas en todas (verificado); delete-service referencia LoyaltyTxn/RecommendationLog (ajustar) | Retiro u ocultamiento con ADR | n/a | migración inversa / backup R2 | Medio | Sí, por modelo |
| N-11 (CF-17) | CÓDIGO | `features/orders/stock.ts`, `features/orders/saga.ts`, `features/products/stock-admin.ts` | `updateTag("catalog")` (o tag `stock` granular) tras decremento/reverso/ajuste | código | Compra protegida server-side (sin riesgo de sobreventa) | Invalidación de listados | n/a | git revert | Bajo | Sí |
| N-12 (CF-11) | CÓDIGO | `features/orders/*` + `alerts.ts` | expiración de `PENDING_PAYMENT` (cancel+liberar, ventana p.ej. 24 h) vía cron existente o degradar alerta a digest | código + datos (1 orden STG afectada) | Orden LCM-2026-0003 STG identificada (test) | Auto-cancelación | n/a | git revert | Medio | Sí |
| N-13 (CF-10/26) | CÓDIGO | `retryShipmentAction`, `event-log-retention.ts` | sellar `processedAt` al resolver manualmente; purga Notification (>90 d leídas) y WebVital (>35 d con agregado) | código + datos | Conteos actuales en G.2 | Cierre de estados + retención | sí (conteos) | git revert | Bajo | Sí |
| N-14 (CF-12) | CÓDIGO (+ADR) | `features/support/*`, `/mi-cuenta` | email al cliente en cambio de estado + (opcional) vista de tickets; o ADR "respuesta por email" con copy honesto | código | Acuse actual promete 24 h | Cerrar el ciclo o declararlo | n/a | git revert | Medio | Sí + decisión |
| N-15 (CF-15) | CÓDIGO o DOCS | `lib/cookie-consent.ts`, `features/consent/service.ts` | enlazar `COOKIE_CONSENT_VERSION` al setting CMS (re-banner real) o corregir STATE/docs | código | Ledger Consent intacto | Re-consent real o doc honesta | n/a | git revert | Bajo | Sí |
| N-16 (CF-16/29/31/33/35) | CÓDIGO | `/status`, `gracias` gate, nav disenos/fichas, `?next=` eliminar, comentarios (9 citas), `COD_ENABLED` fail-closed, errors_spike semántica | cambios puntuales por archivo | código | — | Correcciones menores | n/a | git revert | Bajo | Sí |
| N-17 (CF-20) | CÓDIGO+ADR | `refundOrderAction` + `features/payments` | confirmación "reembolso emitido en Wompi" (checkbox bloqueante con actor+fecha) antes del email; ADR si se difiere integración API | código | Flujo manual actual documentado | Verificación de refund | n/a | git revert | Medio | Sí |
| N-18 (CF-21) | CÓDIGO+DATOS | `features/wishlist`, `delete-service.ts` | incluir `WishlistItem` en anonimizado; decisión operar/retirar | código + 0 filas en ambientes | 0 filas (sin datos que migrar) | Decisión + fix delete-service | n/a | git revert | Bajo | Sí + decisión negocio |
| N-19 (CF-22/25) | CÓDIGO+OPS | monitor externo o dead-man; cards Gemini; heartbeat backups; frescura en dr-drill | `/api/health/all`+`/api/health/crons` monitoreados; `dr-drill.mjs` falla si dump >36 h | código + ops | — | Visibilidad operativa | n/a | git revert | Bajo | Sí + decisión costo monitor |
| N-20 (CF-23) | DATOS | `Product`/`ProductVariant` | matriz de homologación por producto (G.4): dirección PRD→espejos tras cada release; `nombre-personalizado` pausado PRD: confirmar intención | LOCAL/STG/PRD | Pedidos históricos: OrderItem snapshot + Restrict (archivar no rompe) | Homologar con criterio y dueño | sí (conteos por producto) | dump data-only previo (procedimiento OPERATIONS.md) | Medio | Sí, operador |
| N-21 (CF-24) | CÓDIGO | `lib/admin-rbac.ts`, páginas garantias/retractos/costos | alinear ruta↔página↔actions; comentario :30-32 | código | Sin cambio de permisos efectivos reales salvo alinear | Corrección RBAC | n/a | git revert | Bajo | Sí |
| N-22 (CF-27) | CÓDIGO | `wompi/route.ts`, `saga.ts` | email pago fallido en DECLINED terminal (guardia anti-spam); flujo RETURNED (notificación + guía de acción) | código | Sin cambio en transiciones | Notificaciones de fallo | n/a | git revert | Medio | Sí |
| N-23 (CF-28) | CÓDIGO | 11 exports huérfanos + schemas duplicados `orders/schemas.ts` + `PaymentMethodSchema` + `SHIPPING_PROVIDER` + rama mercadopago | retiro símbolo a símbolo con prueba de cierre | código | Búsquedas documentadas (CF-28); sin consumidores dinámicos ni CMS | Retiro de código muerto | n/a | git revert | Bajo | Sí |
| N-24 (CF-30) | CÓDIGO+ADR | 10 rutas `/api/catalog/*`, `/api/cms/*`, `/api/coupons/public` | evidencia de tráfico (logs Vercel) → ADR mantener/archivar con flag | código | E2E `ola18b-verify` usa una ruta (reescribir) | Decisión API pública | n/a | git revert | Bajo | Sí |
| N-25 (CF-14) | DOCS o CÓDIGO | `admin-nav.ts:373-379` + página emails | corregir promesa del nav ("plantillas en código, previsualización") o proyecto de edición CMS | código/docs | Solo newsletter-welcome lee CMS | Honestidad de panel | n/a | git revert | Bajo | Sí + decisión |
| N-26 (CF-18/31-M) | DOCS | ROADMAP (F6/F7), QA_CHECKLIST (CTA+J), README estudio (Gemini), OBSERVABILITY (SLOs aspiracionales marcados), PLAN/ARCHITECTURE (blog), comentarios CF-31 | diffs puntuales citados en §M | docs | — | Actualización documental | n/a | git revert | Bajo | Sí |
| N-27 (CF-32) | DATOS | LOCAL: 282 diseños DRAFT anon, 4 customers test; STG: 4 pedidos smoke, 45 cotizaciones, 86 diseños | scripts existentes `cleanup-test-junk`/`purge-test-orders` (dry-run primero); decisión sobre pedidos smoke STG | LOCAL, STG | Procedencia demostrada (fixtures/smokes documentados) | Limpieza ambientes no productivos | sí (ya es su default) | dump previo | Bajo | Sí |
| N-28 (CF-34) | ADR | `/checkout/gracias` | evaluar token de un solo uso o aceptar con ADR | código | Rate-limit existente | Decisión documentada | n/a | — | Bajo | Sí |

---

## O. Plan de implementación (lotes propuestos — nada ejecutado)

**Lote 1 — Semántica y fuente de verdad (código, sin datos):** N-03 (integraciones), N-07 (cupones cableado), N-16 (status/nav/comentarios/fail-closed COD/errors_spike), N-15 (re-consent o doc), N-25 (nav emails). Gate: tests específicos de cada módulo + `pnpm lint && pnpm typecheck && pnpm test`.

**Lote 2 — Cableado cliente–admin (código):** N-01 (archivado en orden) + N-11 (invalidación stock) + N-12 (expiración PENDING_PAYMENT) + N-22 (notificaciones de fallo) + N-13 (estados/retención) + N-04 (alerta bounce) + N-17 (refund verificado) + N-21 (RBAC). Gate: suites orders/checkout/coupons/alerts + E2E fullmode local.

**Lote 3 — Estudio:** N-08 (template params/mode/templateId) + N-02 (test rojo). Gate: suite personalization completa + E2E estudio.

**Lote 4 — Consolidación admin:** N-09 (mensajes→soporte) + N-14 (ciclo soporte, según decisión) + nav disenos/fichas. Gate: E2E admin.

**Lote 5 — Limpieza de código:** N-10 (modelos muertos con ADR) + N-23 (exports/schemas) + N-24 (API futura con ADR). Gate: tsc + suite completa + RLS suite + build.

**Lote 6 — Endurecimiento de seeds y scripts:** N-06. Gate: lint de guards en CI + dry-runs de los 5 canónicos en LOCAL.

**Lote 7 — Saneamiento LOCAL:** N-27 + N-05 (LOCAL). Gate: conteos antes/después + suite completa verde.

**Lote 8 — Saneamiento STG:** N-27 (STG, con decisión pedidos smoke) + N-05 (STG). Gate: smoke STG + healthchecks.

**Lote 9 — Validación:** `pnpm lint/typecheck/test/build/format:check` + E2E cliente + E2E admin + comprobación de caché + dry-runs de datos + verificación de rutas.

**Lote 10 — Propuesta separada para PRD (NO ejecutar sin la frase ceremonial):** N-05 (PRD) + N-20 (homologación catálogo) + verificación post-deploy de Lotes 1-5. Con dry-run, backup y ventana de rollback.

**Docs (transversal, en el PR de cada lote):** N-26 + STATE.md/ROADMAP/OPERATIONS/OBSERVABILITY según corresponda. **Ningún lote mezcla cambio de código con borrado productivo.**

---

## P. Decisiones requeridas (solo lo que el repo no puede responder)

1. **PREMADE como concepto de negocio** (CF-07): ¿existe la venta "diseño tal-cual" (cablear `?templateId=`→compra directa) o se retira el strip PREMADE? Hoy hay 0 plantillas PREMADE en los 3 ambientes.
2. **Cupones de lanzamiento** (CF-05): ¿qué cupones reales deben existir en PRD (bienvenida, referidos ya automáticos, campañas)? Hoy: 0 reales vigentes. Y ¿qué hacer con `LUC***` expirado (ORIGEN_DESCONOCIDO)?
3. **Soporte** (CF-12): ¿se declara "respuesta por email" (copy honesto, sin desarrollo) o se cablea respuesta in-app + visibilidad del cliente?
4. **Wishlist** (CF-21): ¿se opera (palanca de ingreso: alertas, vista admin) o se retira?
5. **Monitor externo** (CF-22): ¿UptimeRobot/BetterStack sobre `/api/health/all`+`/api/health/crons` (costo) o dead-man interno? Pendiente desde 2026-08-01; sin esto la caída del sistema de alertas es invisible.
6. **Homologación de catálogo** (CF-23): confirmar que las pausas de PRD (`nombre-personalizado`, variantes 1-2 activas en fotoimanes) son curaduría intencional y declarar la dirección de sincronización (¿PRD→STG→LOCAL tras cada release?).
7. **Origen de los bounces PRD** (CF-04): requiere revisar destinatarios (PII) con la operadora — ¿newsletter/registro a correos falsos, o remitente mal configurado en alguna plantilla?
8. **Modelos muertos** (CF-13/CF-19): ADR por modelo — ¿BlogPost/SiteEvent/RecommendationLog/LoyaltyTxn/StockReservation se retiran o quedan FUTURO_APROBADO? (Blog/loyalty figuran en PLAN/ROADMAP como fases futuras.)
9. **Emails al CMS** (CF-14): ¿proyecto de edición CMS de plantillas o corrección de la promesa del panel?
10. **Pedidos smoke de STG** (CF-32): ¿conservar LCM-2026-0001…0004 como evidencia de certificación o purgar con `purge-test-orders`?

---

## Anexo — Pruebas y comandos ejecutados (§19)

| Comando exacto | Ambiente | Código de salida | Total | Omitidas | Motivo de omisión |
|---|---|---|---|---|---|
| `pnpm lint` | LOCAL | **0** | — | — | — |
| `pnpm typecheck` | LOCAL | **0** | — | — | — |
| `pnpm format:check` | LOCAL | **0** | — | — | — |
| `pnpm test` (vitest run, apps/web + packages/db) | LOCAL | **1** | 228 archivos / 3 638 tests | 2 archivos / 8 tests | skip condicional de suites que exigen credenciales live (diseño) |
| ↳ detalle | LOCAL | — | 3 629 passed · **1 failed** · 8 skipped | — | fallo: `finalize-server-render.integration.test.ts > fallback` (CF-02) |
| `pnpm build` (next build) | LOCAL | **0** | — | — | — |
| `vitest run features/personalization/finalize-server-render.integration.test.ts` ×3 | LOCAL | 1, 1, 1 | 5 tests c/u | 0 | fallo determinista 3/3 (descarta flake) |
| `node tmp/audit-20260911/classify-env.mjs` ×3 (vía dotenv, sin imprimir valores) | LOCAL/STG/PRD | 0 | — | — | clasificación de destino por ref: local/stg/prd |
| `node tmp/audit-20260911/data-counts.mjs LOCAL` (read-only) | LOCAL | 0 | ~40 agregados | — | — |
| ídem STG | STG | 0 | ídem | — | — |
| ídem PRD | PRD | 0 | ídem | — | — |
| `node spot-queries.mjs STG` / `PRD` (read-only) | STG/PRD | 0 | pedidos STG (claves) + EmailEvent/mes PRD | — | — |
| `node products-by-env.mjs` ×3 (read-only) | los 3 | 0 | 11 productos ×3 | — | — |

**Prohibiciones §19 respetadas:** no se ejecutaron seeds, migraciones, `--apply`, borrados ni archivados; no se modificaron variables; no se enviaron emails; no se crearon pagos ni guías; no se invocaron webhooks externos; no se hizo load testing; no se usó `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`; no se corrigió código durante la auditoría. Los únicos archivos nuevos: este informe y scripts scratch en `tmp/` (gitignored), más la actualización mínima de `docs/STATE.md`.

**Salud de gates:** lint ✅ · typecheck ✅ · format ✅ · build ✅ · **test ❌ (1/3638 — preexistente en develop, CF-02)**.

---

## Q. Remediación ejecutada (2026-09-12)

> Ejecutada con aprobación total del manifiesto (N-01…N-28), en los lotes del §O, con gates después de cada lote. **Sin commits, sin push, sin despliegue, sin aplicación en PRD.** Los cambios de código viven en el working tree de `develop` junto a los archivos ya presentes (preservados). Migraciones aplicadas solo en LOCAL; datos saneados en LOCAL y STG; PRD intacto (propuesta en Q.6).

### Q.1 Cambios

| ID | Archivos (principales) | Datos | Comportamiento anterior | Comportamiento nuevo |
|---|---|---|---|---|
| N-01 | `features/orders/service.ts:235-292`, `errors.ts:10-29`, `features/checkout/service.ts:475-487`, `checkout/pago/actions.ts:136-141,237-242` | — | Orden en vuelo podía incluir items archivados/pausados con total distinto al exhibido | `OrderUnavailableItemsError` si CUALQUIER item quedó no-vendible (producto o variante, inactivo o archivado) → cliente redirigido a `/carrito` con aviso y re-confirmación; jamás se cobra un total no exhibido |
| N-02 | `features/personalization/finalize-server-render.integration.test.ts` | — | Test del fallback rojo 3/3 (premisa obsoleta: la Polaroid ya es renderizable server-side) | El test fuerza el fallo de TODOS los tiers con `vi.mock` y ejerce el camino real: NEEDS_CLIENT_SLOTS → DRAFT intacto → tickets → subida directa → READY. Verde 3/3 |
| N-03 | `lib/integration-health.ts` (nuevo), `lib/wompi.ts` (`probeWompiHealth`), `api/health/wompi/route.ts`, `admin/(panel)/integraciones/page.tsx`, `lib/public-status.ts` (nuevo), `app/status/page.tsx` + 40 tests | — | Panel con `warn` fijo en Wompi/Aveonline (caída real indistinguible); config chequeaba 3/4 vars; WhatsApp/Turnstile `ok` estático; `/status` decía "Wompi pendiente Fase 3" | Panel consume los probes reales (ok/warn/fail/skipped + badge sandbox/production/test + cuenta-demo Aveonline); config Wompi = 4 vars; WhatsApp/Turnstile = "sin verificación remota" (honesto); `/status` refleja probes reales en modo full |
| N-04 | `features/observability/email-deliverability.ts` (nuevo), `alerts.ts:160-177`, `admin/(panel)/observability/page.tsx:146-190`, `daily-summary.ts` + tests | — | Bounce rate PRD ~50 % sin ninguna señal | Regla `email_bounce_rate` (7 d, >5 %, ≥20 eventos, severidad alta) + sección "Entregabilidad de email" en /admin/observability + línea en el resumen diario |
| N-05 | `packages/db/scripts/purge-test-coupons.mjs` (nuevo) + `lib/test-coupon-signal.mjs` + tests | LOCAL: 42 cupones test borrados (backup `tmp/backups/coupons-local-*.json`). STG: 41 borrados + 1 preservado con referencia de pedido smoke | 42/43 cupones de cada ambiente eran restos de tests; drift `usedCount` en 21 | LOCAL: Coupon 43→1 (solo `LUCAMS_10`, 0 drift). STG: 43→2 (LUCAMS_10 + SAGA-CPN preservado por pedido LCM-2026-0002, drift corregido 2→1). PRD: pendiente (Q.6) |
| N-06 | `packages/db/scripts/lib/env-guard.mjs`, 63 scripts con guard añadida, `seed-catalog-canonical.mjs` + `seed-demo-reviews.mjs` (nuevos, split), `seed-templates.mjs`, `confirm-target.mjs` (nuevo), `check-script-guards.mjs` (nuevo), ~40 one-shots → `scripts/one-shot/`, 5 scripts borrados, `Makefile`, `ci.yml`/`nightly-full.yml` | — | env-guard fail-open a hosts no-Supabase; 63/79 scripts sin guard; seed-products pisaba precios/imágenes/reactivaba/archivaba ajenos/reinsertaba reseñas demo | Guard FAIL-CLOSED (todo destino no reconocido bloquea); 63/63 scripts con escritura guardados (lint en CI); seeds canónicos dry-run default + `--apply`; canónico nunca pisa `price/images/isActive/deletedAt`; barridos opt-in `--prune`; confirmación interactiva en seed-admin/admin-mfa-reset |
| N-07 | `admin/(panel)/cupones/[id]/page.tsx` + `edit-coupon-form.tsx` (nuevos), `cupones/page.tsx`, `cupones/actions.ts`, `features/coupons/service.ts` | — | Sin UI de edición ni archivo (actions huérfanas); copy "carrito"; 5× `revalidatePath("/carrito")` | Página de edición (todos los campos, notice `?updated=1`), acción Archivar con confirmación + vista de archivados (notice `?archived=1`), copy "paso de pago del checkout", 5× `revalidatePath("/checkout/pago")` |
| N-08 | `templates-strip.tsx` (reescrito), `estudio/[slug]/page.tsx:389-399`, `studio-editor.tsx`, `features/personalization/service.ts`, `template-visibility.ts` (nuevo), `lib/catalog.ts:929-968`, `api/catalog/templates/route.ts` | — | `?templateId=` y `?template=` sin consumidor; boot siempre con `templates[0]`; `Design.templateId` inconsistente y nunca actualizado; `listTemplatesForKind` sin filtro mode | Rama PREMADE/`?templateId=` retirada (ADR-090); `?template=` precarga la plantilla elegida (validada); `Design.templateId` se persiste al cambiar de plantilla (validación server); filtro `mode=EDITABLE` por defecto; bug `take`-antes-de-filtro-aspect corregido |
| N-09 | `admin/(panel)/mensajes/page.tsx` (redirect 308), `mensajes/actions.ts` + `message-actions.tsx` (borrados), `lib/admin-nav.ts`, `lib/admin-rbac.ts`, tests e2e admin | — | `/admin/mensajes` ≡ `/admin/soporte` (mismo servicio, actions gemelas) | Única bandeja `/admin/soporte`; `/admin/mensajes` redirige 308 conservando `?status=`; prefix RBAC conservado para no rebotar el redirect (ADR-097) |
| N-10 | `schema.prisma` (−3 modelos), migración `20260912120000_drop_*`, `supabase/migrations/00000000000033`, `features/account/delete-service.ts`, `features/orders/stock.ts`, `lib/admin-nav.ts`, `purge-test-orders.mjs` | 3 tablas eliminadas (0 filas en los 3 ambientes); job `stock_reservation_cleanup` des-agendado | `SiteEvent`, `RecommendationLog`, `StockReservation` sin productores ni lectores; cron limpiando tabla vacía cada minuto | Modelos retirados (ADR-091; ADR-014 SUPERSEDED); `BlogPost`/`LoyaltyTxn` conservados FUTURO_APROBADO; protección anti-oversold = UPDATE atómico + needsReconciliation |
| N-11 | `lib/catalog.ts` (`invalidateCatalogListings`), `features/orders/saga.ts`, `features/orders/service.ts`, `features/products/stock-admin.ts` | — | Badge "Agotado" del PLP podía mentir ≤1 h (tag catalog no invalidado) | Invalidación post-commit tras decremento (saga), reversa (CANCELLED/REFUNDED) y ajuste admin; `revalidateTag("catalog","max")` en route handlers/actions, `updateTag` en Server Actions, best-effort en render RSC (doc Next 16 local) |
| N-12 | `features/orders/constants.ts` (`PENDING_PAYMENT_EXPIRY_HOURS=24`), `expire-pending.ts` (nuevo), `api/cron/expire-pending-orders/route.ts` (nuevo), `cron-heartbeat.ts`, `supabase/migrations/00000000000032`, `alerts.ts:72-88,125-138` | 1 orden PENDING de STG (2026-08-12) quedará auto-cancelada cuando el cron corra en STG | Órdenes `PENDING_PAYMENT` nunca expiraban; alerta crítica+email por abandono esperado (>2h, ruido estructural) | Cron horario (min 23) auto-cancela WOMPI PENDING >24 h (idempotente, needsRevert no-op); la alerta solo dispara si la expiración NO corrió (= fallo real del cron), acción → /admin/observability |
| N-13 | `features/orders/webhook-seal.ts` (nuevo), `admin/(panel)/pedidos/[number]/actions.ts`, `event-log-retention.ts` | — | `webhooks_stuck` nunca se limpiaba (falsa alarma inmortal); Notification/WebVital sin retención | `retryShipmentAction` exitoso sella `processedAt` de eventos relacionados (por txId/tracking); purga Notification leídas >90 d y WebVital >35 d |
| N-14 | `features/emails/templates/support-ticket-closed.ts` (nuevo), `features/support/admin-service.ts:95-119`, `support-ticket-received.ts` (copy) | — | Cambio de estado de ticket no notificaba al cliente; acuse prometía 24 h sin cierre sistémico | Email transaccional al cliente al cerrar (idempotente por transición + `support:closed:<id>`); acuse y cierre coherentes ("te respondemos por correo"); respuesta humana por email declarada (ADR-092) |
| N-15 | `lib/cookie-consent.ts`, `components/cookies-banner.tsx`, `app/layout.tsx`, `features/consent/service.ts` + 11 tests nuevos | — | "Re-consent activo" afirmado en docs pero el banner usaba versión hardcoded (nunca se re-mostraba) | Cambiar `PRIVACY_POLICY_VERSION` en CMS re-muestra el banner a recurrentes (cookie guarda `policyVersion`; cookies legacy se sanan en silencio sin re-banner ni filas nuevas) |
| N-16 | `lib/admin-nav.ts` (disenos/fichas + copy emails honesto), `checkout/gracias/page.tsx` (gate catálogo), `mi-cuenta/eliminar/page.tsx` (`?next=`), `features/checkout/service.ts` + `checkout/pago/page.tsx` + `how-it-works.tsx` + `ayuda` + `hero.tsx` (COD fail-closed), comentarios stale (9 citas) | — | Módulos huérfanos de menú; gracias sin gate de modo; `?next=` errado; COD habilitado si la setting faltaba; comentarios falsos | Nav completa; gate `isCatalogMode()` en gracias; `?next=/mi-cuenta/eliminar`; COD_ENABLED fail-closed en capacidad y marketing; comentarios al día |
| N-17 | `admin/(panel)/pedidos/[number]/order-actions.tsx`, `actions.ts:190-198`, `features/orders/service.ts:695-740`, `errors.ts:31-44`, migración `20260911120000` | 3 columnas nuevas en Order (LOCAL) | REFUNDED + email con el dinero como paso manual sin verificación | Checkbox bloqueante "dinero ya devuelto" (SUPERADMIN+MFA intactos); sin él la action rechaza; `refundMoneyConfirmedAt/By` persistidos y auditados; email solo tras confirmar |
| N-18 | `features/account/delete-service.ts:228` + test | — | WishlistItem sobrevivía a la eliminación de cuenta (FK huérfana semántica) | Borrado dentro de la tx de supresión (historial de interés sin retención legal) |
| N-19 | `api/cron/backup-heartbeat/route.ts` (nuevo), `cron-heartbeat.ts:101-154`, `alerts.ts:179-199`, `observability/page.tsx:228-256`, `backup.yml:174-221`, `dr-drill-lib.mjs` (+frescura 36 h), `features/ai/gemini-provider.ts` (`probeGeminiHealth`), card Gemini en integraciones | — | Backups sin señal in-app; DR drill podía restaurar dump viejo en verde; Gemini ciego | Heartbeat post-backup desde GHA (fallo → workflow rojo); regla `backup_stale` >36 h + tile; drill falla si el dump >36 h; card Gemini con probe real (listar modelos, sin generación) |
| N-20 | (propuesta Q.6 — sin cambios) | — | — | — |
| N-21 | `lib/admin-rbac.ts:59-65`, `costos/actions.ts:15-19`, tests | — | Garantías/retractos visibles a roles que la página rebota; costos actions más permisivas que su pantalla | Ruta garantías = SUPER+MANAGER, retractos = SUPER; costos actions = SUPER; nav ⊆ páginas por rol con tests |
| N-22 | `features/orders/emails.ts:263-380,638-714`, `api/webhooks/wompi/route.ts:277-289`, `saga.ts:792-799`, templates `order-payment-declined` + `order-returned` (nuevas) | 1 columna `paymentFailedNotifiedAt` (LOCAL) | DECLINED/RETURNED nunca notificaban al cliente; stock COD devuelto sin reponer | Email de pago no aprobado (idempotente por tx, cooldown 6 h con claim atómico, invita a reintentar); RETURNED/EXCEPTION → email al cliente + notificación admin con acción esperada (sin automatizar stock/reembolso) |
| N-23 | 12 exports muertos retirados (`getCouponMetrics`, `toggleCategoryActive`, `countPendingModeration`, `getBreachedSlos`, `getProductsForOcasion`, `getVariantById`, `listVariantStockHistory`, `updateGalleryImage`, `getGalleryImageUrl`, `calculateTotals`, schemas duplicados de `orders/schemas.ts`, `PaymentMethodSchema`), seam `SHIPPING_PROVIDER`, rama muerta `lib/wa.ts:45` | — | Código mantenido y testeado que producción nunca ejecuta; contratos duplicados | Retirado con suite verde; `getCoupon` conservado (lo usa la nueva página de edición); `getCmsImage` conservado y documentado (campos IMAGE sueltos son capacidad viva del admin CMS) |
| N-24 | ADR-093 (`docs/DECISIONS.md`) | — | 10 rutas públicas sin consumidor productivo (bot futuro) | Se mantienen como API versionada (ADR-038); criterio de retiro = tráfico real en Vercel |
| N-25 | `lib/admin-nav.ts:396`, `cms-site-map.mjs:3569-3570` | — | Nav prometía "CmsBlocks tipo EMAIL" (23 plantillas) | Copy honesto: 1 plantilla con subject/preview CMS; las transaccionales viven en código (nota: la descripción de la página en DBs existentes se actualiza por CMS o re-seed) |
| N-26 | 15 docs actualizados (ROADMAP, QA_CHECKLIST, README estudio, OBSERVABILITY, OPERATIONS, INTEGRATIONS, EMAIL_TEMPLATES, TESTING, ARCHITECTURE, PLAN, COMPLIANCE, CMS_ROADMAP, RUNBOOK_GO_LIVE, DECISIONS +8 ADRs, audits/README) | — | Deriva documental estructural (Fase 6 "pendiente" construida, CTA inexistente, etc.) | Docs al día con la realidad post-remediación (ADR-090…097) |
| N-27 | `cleanup-test-junk.mjs` (dry-run ejecutado) | LOCAL/STG verificados: "Nada que limpiar" (los datos restantes son era-operador, no test-junk objetivo); pedidos smoke STG conservados (decisión documentada) | Datos de prueba potenciales en LOCAL/STG | Sin acción necesaria — la higiene de teardowns ya los mantiene limpios; los 4 pedidos smoke STG se conservan como evidencia de certificación |
| N-28 | ADR-094 (`docs/DECISIONS.md`) | — | `/checkout/gracias?id=<txId>` muestra PII sin auth | Aceptado con mitigaciones (entropía del txId + rate-limit 20/5min + noindex); re-evaluar con evidencia de filtración |

### Q.2 Evidencia

| ID | Test/comando | Resultado | Ambiente |
|---|---|---|---|
| todos | `pnpm lint` | exit 0 | LOCAL |
| todos | `pnpm typecheck` | exit 0 | LOCAL |
| todos | `pnpm format:check` | exit 0 | LOCAL |
| todos | `pnpm test` (vitest) | **exit 0 — 237 archivos passed, 2 skipped; 3 808 tests passed, 8 skipped** (baseline pre-remediación: 1 failed/3 638) | LOCAL |
| todos | `pnpm build` (next build) | exit 0 | LOCAL |
| todos | `npx playwright test smoke.spec.ts admin-inventory.spec.ts homolog-cookies.spec.ts --project=desktop-chrome` | exit 0 — 10 passed + 1 flaky (warmup de dev server; re-run del spec: verde 1/1) | LOCAL |
| N-01 | `vitest run features/orders` (6 tests nuevos de carrera) | exit 0 | LOCAL |
| N-02 | `vitest run finalize-server-render.integration.test.ts` ×3 | 5/5 verde en las 3 corridas | LOCAL |
| N-03 | `vitest run` suites integration-health/wompi-health/public-status + relacionadas | 88/88 | LOCAL |
| N-04/N-12b/N-13b/N-19/N-21 | `vitest run features/observability lib/admin-rbac lib/admin-nav lib/admin-roles` + scripts | 317/317 | LOCAL |
| N-05 | `purge-test-coupons.mjs` dry-run + `--apply` | LOCAL: 43→1, drift 0. STG: aborto correcto (1 referenciado) → `--skip-referenced`: 43→2, drift 0 | LOCAL, STG |
| N-06 | `node scripts/lib/check-script-guards.mjs` | 63/63 ✓ | repo |
| N-06 | `pnpm --filter @lucams/db test` (node --test, 3 suites lib) | 24/24 | repo |
| N-07 | `vitest run features/coupons features/checkout` + suites extra | 129/129 + 91/91 | LOCAL |
| N-08 | `vitest run features/personalization lib/catalog.integration.test.ts` | 490/490 | LOCAL |
| N-09/N-14 | `vitest run features/support features/emails lib/admin-nav` | 264/264 | LOCAL |
| N-10 | `vitest run` dominios tocados (incl. `features/security` RLS post-DROP) | 1 955/1 955 | LOCAL |
| N-11 | `vitest run features/orders features/products lib/catalog.integration.test.ts` (incl. assert `revalidateTag("catalog","max")`) | 331/331 | LOCAL |
| N-12 | `vitest run features/orders/expire-pending.integration.test.ts` (8 tests) | verde; migración 032 aplicada: job `lucams-expire-pending-orders` activo en cron.job | LOCAL |
| N-15 | `vitest run` cookie-consent/banner/consent/observability | 124/124 + 240/240 | LOCAL |
| N-19 | `node --check` en 85 `.mjs` de packages/db/scripts | 0 fallos | repo |
| datos | `data-counts.mjs` post-saneamiento | LOCAL: Coupon=1, drift=0, settings=37, cron.jobs=10. STG: Coupon=2, drift=0, settings=37 | LOCAL, STG |

### Q.3 Saneamiento

| Entidad | Ambiente | Antes | Acción | Después | Referencias preservadas |
|---|---|---|---|---|---|
| Cupones test (señal objetiva `CAT<runId>-*`, `SAGA<runId>-*`, `ord<runId>-*`) | LOCAL | 42 | `purge-test-coupons --apply` (backup previo, transacción, drift corregido) | 0 (queda `LUCAMS_10`, ORIGEN_DESCONOCIDO — decisión del operador) | 0 pedidos, 0 usos en los 42 (verificado) |
| ídem | STG | 42 | 1.ª corrida: aborto fail-closed (1 con referencia); 2.ª con `--skip-referenced` | 0 (quedan `LUCAMS_10` + `SAGA…-CPN`) | `SAGA…-CPN` conservado: pedido smoke documentado LCM-2026-0002 (drift corregido 2→1 = su uso real) |
| CmsField SETTING zombi (14 keys sin lector) | LOCAL + STG | 51 | `remove-zombie-settings --apply` (transacción, conteos) | 37 | Las 7 settings clave verificadas intactas; site map sin esas keys (no re-siembra) |
| Tablas `SiteEvent`/`RecommendationLog`/`StockReservation` | LOCAL | 0 filas | migración `20260912120000` (DROP … IF EXISTS) | eliminadas | 0 filas en los 3 ambientes (verificado pre-drop) |
| Job `stock_reservation_cleanup` | LOCAL | activo (1/min) | migración `00000000000033` (unschedule idempotente) | des-agendado | `rate_limit_cleanup` intacto |
| Job `lucams-expire-pending-orders` | LOCAL | — | migración `00000000000032` | agendado (`23 * * * *`) | no re-agenda ningún otro job |
| Fixtures/test junk | LOCAL + STG | — | `cleanup-test-junk` dry-run | "Nada que limpiar" | pedidos smoke STG conservados (LCM-2026-0001…0004) |

### Q.4 Riesgos residuales

1. **PRD sin aplicar** (por diseño): cupones test (42), settings zombi (14), tablas muertas (3), jobs (032 agendar / 033 des-agendar) y TODO el código de esta remediación siguen solo en LOCAL/STG y working tree. PRD opera con los hallazgos CF-01/CF-03/CF-05/CF-06/CF-07/CF-17 abiertos hasta el próximo despliegue + saneamiento aprobado.
2. **Bounce rate PRD ~50 %**: la visibilidad ya existe (regla + tile + resumen); la CAUSA RAÍZ sigue abierta y requiere revisar destinatarios con la operadora (PII fuera de alcance). Mientras no se resuelva, el canal transaccional de PRD sigue en riesgo de reputación.
3. **Monitor externo sin configurar** (decisión pendiente desde 2026-08-01): la caída del propio sistema de alertas solo la cubre un monitor sobre `/api/health/all` + `/api/health/crons`. Mitigado parcialmente por `backup_stale` y la nueva semántica de `pending_payment_wompi_stale`, pero el ciego estructural persiste hasta decidir.
4. **Homologación de catálogo** (CF-23): LOCAL/STG/PRD mantienen variantes divergentes (140/115/85); falta la decisión del operador por producto y la dirección de sincronización.
5. **`LUCAMS_10`** (ORIGEN_DESCONOCIDO, expirado, 0 usos) se conserva en los 3 ambientes a la espera de decisión; y en STG queda 1 cupón test vigente (`SAGA…-CPN`) preservado por su pedido smoke — archivable desde la nueva UI si el operador decide.
6. **Bandeja de tickets en `/mi-cuenta`** diferida (ADR-092) y **operación de wishlist** como palanca pendiente de decisión de negocio (CF-21).
7. **Descripción CMS de la página "Correos automáticos"** en DBs existentes: el site map quedó honesto, pero la fila en DB se actualiza editándola en el admin o re-sembrando (N-25).
8. **Conciliación Wompi↔pedidos automática** sigue sin existir (reactiva por flags/alertas — ADR-094 y proceso manual documentado).

### Q.5 Despliegue (propuesta — nada desplegado)

1. **Orden**: ① merge del working tree a `develop` (PR con esta remediación) → ② aplicar migraciones en STG en este orden: `supabase/migrations/00000000000032` (agenda expire-pending) → `prisma migrate deploy` (incluye `20260911120000` columnas Order + `20260912120000` drops) → `supabase/migrations/00000000000033` (des-agenda stock_reservation_cleanup) → ③ deploy Vercel STG → ④ validación STG (abajo) → ⑤ mismo orden en PRD con ventana de rollback → ⑥ saneamiento de datos PRD (Q.6, frase ceremonial).
2. **Migraciones**: 2 Prisma (aditiva la 1.ª; drops de tablas vacías la 2.ª) + 2 Supabase (032 segura en STG — no re-agenda jobs viejos; 033 idempotente). NO re-aplicar 015/016/021/023 en STG (re-agendan los 5 jobs de email desagendados a propósito).
3. **Scripts**: ninguno obligatorio post-deploy. Recomendado tras el deploy de STG: `purge-test-coupons --apply` (STG ya hecho), verificación del primer run de `lucams-expire-pending-orders` en `cron.job_run_details` y heartbeat en `/api/health/crons`.
4. **Variables**: ninguna nueva de aplicación. `backup.yml` usa los secrets existentes (`CRON_SECRET`; `VERCEL_BYPASS_TOKEN` opcional). `CRON_JOBS_DISABLED` en STG debe revisarse para incluir `expire-pending-orders` si se quiere el mismo enmascaramiento que los demás jobs de STG (allí el job corre pero sus faltas no alertan — coherente con la postura STG).
5. **Caché**: sin acción manual; la invalidación de catálogo/CMS quedó cableada en las mutaciones.
6. **Validación post-deploy**: `/api/health/all` → 200; `/admin/integraciones` muestra Wompi/Aveonline/Gemini con probes reales (warn ámbar fijo eliminado); `/status` coherente; panel cupones con edición/archivo; `/admin/mensajes` → 308 a `/admin/soporte`; primer `EmailEvent` tras deploy alimenta el tile de entregabilidad; E2E `release-check-a1` en PRD.
7. **Rollback**: código: `git revert` del PR. Datos: restaurar cupones desde `tmp/backups/coupons-<env>-*.json`; settings zombi se re-crean vacías desde el CMS si se necesitaran; tablas eliminadas: restaurables desde backup R2 (0 filas — no había datos); job 033: re-aplicar migración 012 si se quisiera re-agendar (no recomendado — la tabla ya no existe).

### Q.6 Propuesta para PRD (dry-run — NO aplicado; requiere la frase ceremonial "APLICAR EN PRD LOS IDS: [lista]")

Estado verificado de PRD (read-only, 2026-09-11): cupones 43 (42 con señal test idéntica a LOCAL/STG + `LUCAMS_10`), settings 51, tablas muertas con 0 filas, 10 jobs activos. Al estar el guard fail-closed, el dry-run contra PRD queda bloqueado por diseño hasta la aprobación expresa; las corridas de LOCAL/STG (sets idénticos verificados) son la evidencia del plan:

| Acción PRD | Comando exacto (cuando se apruebe) | Evidencia del dry-run (LOCAL/STG, sets idénticos) |
|---|---|---|
| Purgar 42 cupones test + corregir drift | `cd packages/db && LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 npx dotenv -e ../../.env.local.nube-backup -- node scripts/purge-test-coupons.mjs` (dry-run) → `--apply` | LOCAL: 43→1, backup `coupons-local-2026-09-12T1401Z.json`, drift 0. STG: 43→2 con `--skip-referenced` (en PRD no hay pedidos → la guarda 0/0 aplica sin skip) |
| Eliminar 14 settings zombi | …`-- node scripts/remove-zombie-settings.mjs` → `--apply` | LOCAL/STG: SETTING 51→37, transacción única |
| Migraciones de schema/crons | seguir Q.5 paso ⑤ | 032/033 verificadas idempotentes en LOCAL |
| Homologación de catálogo (N-20) | **Requiere decisión del operador primero** (¿pausas de PRD son curaduría? ¿dirección PRD→espejos tras release?) — propuesta: tras cada release, resincronización PRD→LOCAL/STG con el procedimiento documentado de OPERATIONS.md (dump data-only de las tablas de catálogo) | Matriz por producto en §G.4 |

**Detenido antes de PRD** según la regla de salida: ninguna acción de escritura se ejecutó ni ejecutará contra PRD sin la frase ceremonial en sesión separada.

### Q.7 Estado de cada ID

| Estado | IDs |
|---|---|
| **CERRADO** | N-01, N-02, N-03, N-06, N-07, N-08, N-09, N-10, N-11, N-12, N-13, N-14, N-15, N-16, N-17, N-18, N-19, N-21, N-22, N-23, N-24, N-25, N-26, N-27, N-28 |
| **PARCIAL** | N-04 (visibilidad implementada; causa raíz de bounces = decisión del operador), N-05 (LOCAL+STG hechos; **PRD pendiente**), N-12 (código+cron LOCAL; STG/PRD van con el despliegue) |
| **BLOQUEADO POR DECISIÓN** | N-20 (homologación de catálogo — matriz lista, falta decisión por producto) |
| **NO REPRODUCIBLE** | — |
| **PENDIENTE DE PRD** | N-05-PRD, saneamiento de tablas/jobs PRD (Q.6), validación en vivo post-despliegue |

Hallazgos asociados cerrados con estos IDs: CF-01, CF-02, CF-03, CF-05(código+LOCAL/STG), CF-06, CF-07, CF-08, CF-09, CF-10, CF-11, CF-13, CF-14, CF-15, CF-16, CF-17, CF-18, CF-19, CF-20, CF-22(código), CF-23(propuesta), CF-24, CF-25, CF-26, CF-27, CF-28, CF-29, CF-30, CF-31, CF-32, CF-33, CF-34, CF-35. Parciales/por decisión del operador: CF-04 (causa raíz), CF-12 (bandeja cliente, ADR-092), CF-21 (operación wishlist), CF-22 (monitor externo).

---

## R. Seguimiento 2026-09-13 — despliegue a STG y cierre de riesgos residuales

> Con la aprobación de Lucy ("procede como consideres" sobre los 5 puntos abiertos), la remediación se desplegó a STG y cada riesgo residual de §Q.4 quedó acotado. PRD sigue intacto (solo lecturas).

### R.1 Bounce rate PRD (CF-04) — causa raíz CONFIRMADA: 100 % suites, tasa real 0 %

Consulta agregada por dominio sobre `EmailEvent` de PRD (sin PII individual, 2026-09-13):

| Dominio | bounced | delivered |
|---|---|---|
| `lucams.test` | 131 | 0 |
| `e2e.test` | 109 | 0 |
| `lucamsshop.com` | 0 | 224 |
| `gmail.com` | 0 | 7 |
| `resend.dev` | 0 | 1 |

El 100 % de los rebotes son a dominios `.test` (RFC 2606, indeliverables por diseño) generados por las corridas de integración/E2E que enviaron correos reales con la key de PRD (subjects tipo "Reembolso procesado — pedido LCM-TEST-VOID-…", "Pedido LCM-2026-000X confirmado"). **No hay bots, ni typos, ni problema de reputación real: la tasa de rebote de clientes reales es 0 %.** Acción tomada: `getEmailDeliverabilityStats` excluye el TLD `.test` de la tasa (lo medido antes fingía una crisis inexistente) y el tile de `/admin/observability` muestra los excluidos aparte. La regla `email_bounce_rate` ahora mide solo tráfico real. **CF-04 queda cerrada en causa y en visibilidad.**

### R.2 Despliegue a STG y validación en vivo

- Commits: `45f3e88` (remediación integral, 240 archivos), `8c6e604` (bypass self-fetches), `91fade4` (fix CI setup en frío + ratchet CMS), `f6eb629` (tuteo + docs monitor).
- Migraciones STG en orden Q.5: `00000000000032` → `prisma migrate deploy` (2) → `00000000000033`. Jobs resultantes: 5 (cms-publish, purge-anon-designs, purge-event-logs, expire-pending-orders, rate_limit_cleanup); los 5 de email siguen desagendados por diseño.
- Verificado en vivo: `/api/health/all` → **ok (5/5)**; `/api/health/crons` → ok; `/status` → 14/14 tiles verdes; `/admin/mensajes` → redirect a login/soporte; `/mi-cuenta/soporte` → guard correcto; E2E `smoke + admin-inventory + homolog-cookies` → **11/11 contra STG**; el cron `expire-pending-orders` corrió manualmente (primer latido) y auto-canceló la orden smoke LCM-2026-0003 (abandonada 2026-08-12) — comportamiento diseñado.
- Incidencia resuelta: los self-fetches de `/api/health/all` y `/status` leían el 302 de Deployment Protection como caída en previews (falsa alarma en el ambiente de validación) → `vercelBypassHeaders()` + `VERCEL_BYPASS_TOKEN` creada en el runtime de preview (Vercel CLI) + redeploy. Producción no se afecta (la var no existe allí).
- Incidencia CI: setup en frío roto por la referencia a `StockReservation` en `00000000000002` (la migración Prisma de drop corre antes) → guard de existencia, verificado con la secuencia exacta del CI contra una DB scratch; y el ratchet de contenido detectó 4 literales nuevos → pasaron por `CmsText` con sus 11 claves declaradas en el site map (sembradas en LOCAL+STG: BLOCK 1013→1024). Voseo "revisá" → "revisa" (el lint de voseo es paso solo-CI; queda en la checklist local).

### R.3 Residuales resueltos

| Ítem | Resolución |
|---|---|
| Monitor externo (CF-22) | **Workflow propio** `.github/workflows/uptime-monitor.yml` (cada 30 min desde GHA, retry 60 s, email de Actions si algún health de PRD no responde 2xx). Sin SaaS ni tiers — decisión de Lucy. OPERATIONS § Plan de monitoreo actualizado; UptimeRobot/BetterStack descartados |
| `LUCAMS_10` | Archivado en LOCAL+STG (`one-shot/archive-lucams10-20260913.mjs`, soft-delete reversible). Lucy confirmó que todo cupón existente era de pruebas |
| Wishlist (CF-21) | Aceptada como feature de cliente (ADR-098): finalidad propia visible en `/mi-cuenta/favoritos`, cubierta por la supresión de cuenta. Palanca de marketing diferida post-lanzamiento |
| Bandeja de tickets (ADR-092) | Implementada: `/mi-cuenta/soporte` lista los tickets del cliente (estado, fechas, mensaje propio; respuesta humana por correo declarada) + tarjeta en el hub |
| Conciliación Wompi (5.4) | El cron de expiración ahora **verifica la transacción en Wompi antes de cancelar**: APPROVED + monto exacto → corre la saga (auto-sanación del webhook perdido); monto desfasado → `needsReconciliation`; resto → cancela. Cobertura completa sin endpoint de listado de Wompi |

### R.4 Lo que sigue pendiente (solo con Lucy)

1. **Frase ceremonial para PRD**: cupones test (42), settings zombi (14), migraciones `00000000000032/33` + deploy a producción. Comandos exactos en Q.6.
2. **Homologación de catálogo (N-20)**: decisión por producto sobre las pausas de PRD y la dirección de sincronización (propuesta: PRD como fuente tras cada release).
3. **`CRON_JOBS_DISABLED` de STG (Vercel preview)**: añadir `expire-pending-orders` si se quiere el mismo enmascaramiento que los demás jobs no agendados (hoy el job corre y latía OK; sin la var, un fallo suyo degradaría el health de STG — coherente pero ruidoso en previews).
