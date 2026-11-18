# Meta Catalog, Instagram y Facebook — Especificación funcional y técnica

> **Estado: diseño aprobado y en pausa deliberada (`ADR-207` + `ADR-208`). No existe integración activa ni activos de Meta conectados aún.** Documenta la arquitectura productiva completa para retomarla sin retrabajo sobre el núcleo omnicanal `ADR-208` ya implementado. Fuentes y vigencias para Colombia verificadas el **17 de noviembre de 2026**.

---

## 1. Objetivo comercial y alcance real en Colombia (`CO`)

Meta operará como canal de **adquisición, catálogo publicitario y medición de conversiones** hacia `lucamsshop.com`, nunca como pasarela ni checkout externo:

```text
Productos prediseñados terminados (PHYSICAL_STOCK en /admin/inventario)
  ──► Meta Catalog (/feeds/meta.xml + push rápido Batch API)
        ──► Advantage+ Catalog Ads (Instagram / Facebook) + Enlaces UTM + Catálogo WhatsApp Business
              ──► lucamsshop.com/producto/{slug}?variant={id} (compra en 1 clic con Wompi / COD)
                    ──► Medición exacta Pixel + CAPI deduplicada 1:1 (purchase:LCM-YYYY-NNNN)
```

### Reglas rectoras del modelo de negocio

1. **Catálogo exclusivo para prediseñados terminados con stock físico real (`fulfillmentMode = PHYSICAL_STOCK`):**
   - Al igual que en Mercado Libre (`ADR-205`), **al `Meta Catalog` solo entran productos físicos pre-fabricados y listos para despachar** que comparten el **mismo inventario único consolidado** de `/admin/inventario` (`disponible neto = max(0, stock - safetyStock)`) con `lucamsshop.com`, Mercado Libre y Google Merchant.
   - Los productos personalizables del Estudio (`MADE_TO_ORDER`) y las ilustraciones digitales internas (`DesignGalleryImage` en `/admin/disenos`) **no** se publican en `Meta Catalog`. Si el negocio promociona el Estudio en Reels o historias, lo hace con anuncios de tráfico/conversión directos a la web, nunca como SKU de inventario.
   - Tampoco se mezcla el embudo consultivo B2B (`/empresas-y-eventos`); el alcance es 100 % venta directa de catálogo.
2. **Paridad obligatoria de precios con `lucamsshop.com` (`ADR-207`):**
   - A diferencia de Mercado Libre (donde `ChannelOffer` infla precios para absorber comisiones del marketplace), en Meta el comprador aterriza y paga en `lucamsshop.com`. El precio del catálogo (`<g:price>` y `<g:sale_price>`) coincide al peso con el precio vigente de la variante en la tienda (`publishedOnStorefront = true`); cualquier divergencia provoca rechazo en Commerce Manager.
3. **Realidad vigente de superficies Meta en Colombia (`CO`):**
   - Meta **deshabilitó oficialmente las Tiendas nativas (_Facebook & Instagram Shops_) y el etiquetado orgánico de productos (_Instagram Shopping_) en Colombia** desde el 10 de agosto de 2023 (vigente en 2025–2026).
   - Por tanto, no se promete ni diseña automatización sobre _Shops_ orgánicos inexistentes en el país. El catálogo alimenta las superficies efectivamente activas en Colombia: **Advantage+ Catalog Ads** (carruseles dinámicos, colecciones, Reels/Stories promocionados con fichas vivas y retargeting), **enlaces orgánicos con UTM** (Bio, _stickers_ de historias, DM) y vinculación opcional del mismo catálogo al perfil de **WhatsApp Business** desde Commerce Manager (sin alterar `ADR-006`: cero Twilio y cero API paga de mensajería).

---

## 2. Estado verificado en el código actual de Lucams Shop

- **Núcleo de stock omnicanal (`ADR-208`):** activo en esquema y aplicación (`Product.fulfillmentMode`, `Product.publishedOnStorefront`, `ProductVariant.safetyStock` e `InventoryLog.channel`).
- **Redes y atribución base:** existen enlaces CMS para Instagram (`@lucams_shop`) y Facebook (`lucamsshop`), captura de `utm_*` bajo consentimiento analítico (`apps/web/lib/utm-attribution.ts`) y preservación de `fbclid` en la lista blanca de `sanitizeAnalyticsUrl` (`apps/web/lib/analytics.ts`).
- **Base modular de integraciones (`ADR-206`):** `/admin/integraciones` está desacoplado en `features/integrations/registry.ts`; Meta solo se registrará cuando exista sonda real y módulo operativo.
- **Brecha legal identificada para antes de encender Pixel/CAPI:** hoy `packages/db/legal-content/legal.cookies.md` declara textualmente _«Marketing — hoy no cargamos cookies en esta categoría»_ y `legal.subprocesadores.md` solo lista a Meta/WhatsApp para atención al cliente. Activar Pixel o CAPI exige actualizar primero el paquete legal en paridad total (Ley 1581 + mandato #9 de `CLAUDE.md`).

---

## 3. Autenticación _in-house_, activos requeridos y permisos

### 3.1 Activos externos en `business.facebook.com`

1. **Meta Business Portfolio** titular de Lucams Shop.
2. **Página oficial de Facebook** y **Cuenta Profesional de Instagram** (`@lucams_shop`) vinculadas al mismo portafolio.
3. **Dominio `lucamsshop.com` verificado** mediante registro DNS `TXT` en Cloudflare.
4. **Catálogo de comercio electrónico** en _Meta Commerce Manager_ y **Dataset (Pixel)** en _Meta Events Manager_.
5. **Cuenta publicitaria** en `COP` con límite de gasto de cuenta (_Account Spending Limit_) configurado cuando se habilite pauta.

### 3.2 `System User` servidor-a-servidor (en lugar de OAuth de usuario)

Para un comercio _in-house_ que opera exclusivamente sus propios activos empresariales, **no se usa Facebook Login OAuth de usuario** (cuyos tokens expiran cada 60 días, se invalidan al cambiar contraseña personal y exigen _App Review_ externo para salir de desarrollo):

- Se crea un **`System User` (`Usuario del sistema`, rol Admin)** dentro de _Configuración del negocio → Usuarios → Usuarios del sistema_, asignándole explícitamente únicamente el Catálogo, el Dataset/Pixel y (en su fase) la Cuenta Publicitaria de Lucams Shop.
- Se genera un **System User Access Token** de servidor con privilegio mínimo (`catalog_management`, más `ads_read` / `ads_management` solo al activar la fase de campañas), cifrado en reposo con **`AES-256-GCM`** (`META_TOKEN_ENCRYPTION_KEY` independiente de `CSRF_SECRET` + `keyVersion`).
- La versión de **Meta Graph API** se parametriza explícitamente (`META_GRAPH_API_VERSION`, base **`v25.0`**, con soporte oficial hasta julio de 2028) y nunca queda dispersa en URLs quemadas.

---

## 4. Arquitectura técnica detallada por subsistema

### 4.1 Catálogo dedicado `GET /feeds/meta.xml` + Fast-Path `Catalog Batch API`

En vez de reutilizar `/feeds/google-merchant.xml` (que incluye `MADE_TO_ORDER` y carece de `<g:sale_price>` y etiquetas de conjuntos), se implementa `apps/web/lib/feeds/meta-catalog.ts` servido en `GET /feeds/meta.xml` (`force-dynamic`, `s-maxage=900, stale-while-revalidate=1800` y `no-store` en `503`):

1. **Filtro estricto de elegibilidad:** `STOREFRONT_PRODUCT_WHERE` (`isActive = true`, `publishedOnStorefront = true`, `deletedAt = null`, categoría activa) **más `fulfillmentMode = "PHYSICAL_STOCK"`** y presencia obligatoria de al menos una imagen pública válida (`>= 500 × 500 px`, sin marcas de agua de galería).
2. **Invariante universal de identidad:** `<g:id>` = `ProductVariant.sku` (idéntico a `content_ids` en Pixel y CAPI) y `<g:item_group_id>` = `Product.slug`.
3. **Precios y ofertas exactas en `COP` (`ADR-202`):**
   - Con promoción vigente (`effectiveCompareAt > effectivePrice`): `<g:price>{compareAtCop} COP</g:price>` + `<g:sale_price>{effectivePriceCop} COP</g:sale_price>` (habilita insignias dinámicas de descuento en anuncios sin discrepancia con la PDP).
   - Sin promoción: `<g:price>{effectivePriceCop} COP</g:price>`.
4. **Disponibilidad multilateral real:** `netAvailableStock(variant.stock, variant.safetyStock) > 0 ? "in stock" : "out of stock"`.
5. **Galería y segmentación (`custom_label_0..4`):** `<g:image_link>` + hasta 9 `<g:additional_image_link>`, y etiquetas internas para armar _Product Sets_ automáticos en Commerce Manager (`custom_label_0 = category.slug`, `custom_label_1 = tramo_precio_cop`, `custom_label_2 = "en_oferta" | "regular"`, `custom_label_3 = "destacado" | "catalogo"`, `custom_label_4 = "con_iman" | "sin_iman"`).
6. **Sincronización híbrida anti-gasto en agotados:** además del _Scheduled Fetch_ horario del XML, cuando una variante `PHYSICAL_STOCK` cruza el umbral `in stock ↔ out of stock` o cambia de precio (por venta web, venta en Mercado Libre o ajuste en `/admin/inventario`), un _fast-path_ asíncrono envía `POST /{catalog_id}/items_batch` (`method = UPDATE`, `retailer_id = variant.sku`) para actualizar Meta en segundos.

### 4.2 Meta Pixel (`<AnalyticsMetaPixel />`), CSP con Nonce y bloqueo de raspado DOM

Espeja exactamente el patrón probado de GA4 (`components/analytics-ga4.tsx` y `lib/security-headers.ts`):

1. **Doble gate `COOKIES_MARKETING`:** helper `hasMarketingConsent()` en `lib/cookie-consent.ts` suscrito a `cookie-consent-changed`. Sin `NEXT_PUBLIC_META_PIXEL_ID` válido (`/^\d{10,20}$/`) o sin aceptación explícita de la categoría **Marketing**, **no se descarga `fbevents.js`, no se crean `_fbp`/`_fbc` y no se ensancha la CSP**.
2. **Revocación efectiva:** si el visitante desactiva **Marketing**, `trackMetaEvent()` queda en no-op inmediato y se expiran activamente las cookies `_fbp` y `_fbc` en el navegador.
3. **CSP mínima condicionada:** solo con `NEXT_PUBLIC_META_PIXEL_ID` configurado y fuera de `/admin/*` y vistas `sandbox`:
   - `script-src`: `+ https://connect.facebook.net`
   - `connect-src`: `+ https://www.facebook.com https://connect.facebook.net`
   - `img-src`: `+ https://www.facebook.com`
4. **Prohibición de raspado automático (`autoConfig: false`):** la cola programática en TypeScript (sin `<script>` inline) ejecuta `fbq("set", "autoConfig", false, PIXEL_ID)` antes de `fbq("init", PIXEL_ID)`, impidiendo que `fbevents.js` inspeccione inputs de formularios, botones o textos del Estudio.

### 4.3 Conversions API (`CAPI`), atribución de invitados y deduplicación 1:1

Resuelve los dos problemas clásicos de un checkout híbrido (invitados sin cuenta + confirmación asíncrona por webhook de Wompi o ruta privada COD):

1. **Captura de consentimiento y atribución en `/checkout` (`MetaOrderAttribution`):**
   - Cuando un invitado acepta el banner de cookies al aterrizar desde Instagram, `recordCookieConsent` aún no conoce su correo (`contactId = null`). Si el worker de CAPI buscara después en `Consent` por `contactId`, perdería todas las ventas de invitados, y el webhook de Wompi no trae ni cookies `_fbp`/`_fbc` ni la IP/User-Agent del comprador.
   - Al ejecutar `createOrderFromCart` (donde **sí** llegan las cookies y cabeceras del navegador del comprador), el servidor valida `cookie_consent_v1`: si `marketing === true` y coincide con `PRIVACY_POLICY_VERSION`, registra una fila auditable `Consent(scope = COOKIES_MARKETING, accepted = true)` vinculada al `contactId` de la orden y persiste `MetaOrderAttribution` (`orderId @unique`, `marketingConsented = true`, `fbp`, `fbc` —leído de `_fbc` o formado `fb.1.<ts>.<fbclid>`—, `clientIp`, `clientUserAgent`, `expiresAt = +45 días`). Si `marketing === false`, registra `marketingConsented = false` sin datos de rastreo.
2. **Encolado transaccional y deduplicación exacta (`event_id = "purchase:" + order.number`):**
   - Al confirmarse el pedido —tanto en **`processPaidOrder` (Wompi `PAID`)** como al confirmar **Contraentrega (`COD`)**—, si `marketingConsented === true` y no media revocación posterior en `Consent`, la misma `$transaction` inserta en `MetaEventOutbox` el evento `Purchase` con `eventId = "purchase:" + order.number` (`@unique`).
   - En navegador, `/checkout/gracias` (Wompi) y `/pedido/[token]?nueva=1` (COD, pasando siempre la URL sanitizada `/pedido/[token]` para **jamás exponer el bearer token** a Meta) emiten `fbq("track", "Purchase", ..., { eventID: "purchase:" + order.number })`.
   - Así, dentro de la ventana de 48 h de Meta, si llegan navegador y servidor se cuenta **una sola venta**, y si Safari/bloqueadores/cierre de pestaña pierden el evento del navegador, CAPI garantiza el registro exacto.
   - _(Nota: aunque `Meta Catalog` solo publica `PHYSICAL_STOCK`, Pixel + CAPI miden el 100 % de las compras consentidas en `lucamsshop.com` para atribuir correctamente cualquier tráfico pagado u orgánico desde Instagram/Facebook)._
3. **Despacho y minimización Ley 1581:** despacho inmediato no bloqueante con `after()` de Next.js 16 + barrido de respaldo en `pg_cron` con backoff exponencial; hashes **SHA-256 normalizados** únicamente de `em`, `ph` (`57...`) y `country` (`co`), cero fotos, cero direcciones postales exactas y purga automática de `MetaOrderAttribution` a los 45 días.

### 4.4 Modelo de datos (`packages/db/prisma/schema.prisma` + RLS deny-by-default)

Cuatro modelos compactos sin duplicar el catálogo vivo de `ProductVariant`, todos con RLS activa y `REVOKE ALL` para `anon`, `authenticated` y DML de `service_role`:

| Modelo                  | Responsabilidad exacta                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MetaIntegrationConfig` | Configuración singleton (`businessId`, `pageId`, `instagramAccountId`, `catalogId`, `datasetId`, `adAccountId`, `graphApiVersion`, token `System User` cifrado, topes y switches) |
| `MetaOrderAttribution`  | Evidencia efímera (TTL 45 días) capturada en checkout: `orderId @unique`, `marketingConsented`, `consentVersion`, `fbp`, `fbc`, `clientIp` y `clientUserAgent`                    |
| `MetaEventOutbox`       | Cola durable idempotente hacia `POST /{dataset_id}/events` (`eventId @unique`, `orderId`, payload con hashes, `status`, `attempts`, `lockedUntil`, `fbtraceId` y `lastError`)     |
| `MetaAdInsightDaily`    | Gasto diario en centavos COP (`spendCents`), impresiones, clics y conversiones reportadas por campaña (`@@unique([day, adAccountId, campaignId])`) para cruce financiero interno  |

---

## 5. Módulo administrativo `/admin/marketing/meta` y RBAC

Ubicado bajo **Marketing → Meta** (`/admin/marketing/meta`) y enlazado técnicamente desde `/admin/integraciones` (`ADR-206`) con sonda dedicada `GET /api/health/meta`:

| Vista                    | Responsabilidad operativa                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Resumen**              | Salud de conexión `System User`, estado del feed y `Catalog Batch API`, tasa de entrega/deduplicación Pixel+CAPI y pulso de gasto vs ventas reales                             |
| **Catálogo y UTM**       | Auditor pre-vuelo de variantes `PHYSICAL_STOCK` (detecta faltantes de imagen o rechazos de Commerce Manager antes de pautar) y constructor oficial de enlaces `utm_*` limpios  |
| **Eventos (Pixel/CAPI)** | Monitor de `MetaEventOutbox`, reintentos, código de prueba `test_event_code` para Events Manager y verificación de `0` emisiones sin consentimiento                            |
| **Campañas y Margen**    | Tabla comparativa **Atribución Meta (`7d_click`/`1d_view`) vs Verdad Lucams (`Order` cobradas − costo BOM − pasarela − flete)**, más pausa de emergencia y tope diario con MFA |

- **RBAC (`N-21`) y MFA:** conexión, credenciales, switches CAPI y topes/pausas de presupuesto exigen `SUPERADMIN` + step-up MFA reciente (`requireRecentMfa`) + `AdminActionLog`; consulta operativa de catálogo/UTM para `SUPERADMIN`, `OPERATIONS_MANAGER` y `MANAGER`; lectura financiera de campañas para `SUPERADMIN` y `FINANCE_ANALYST`. La creación visual de anuncios/Reels permanece en Meta Ads Manager.

---

## 6. Secuencia de implementación por cortes verticales al retomar

Ningún corte deja vistas simuladas ni botones muertos; la Fase 1 de stock físico (`ADR-208`) ya está implementada:

1. **Fase M0 — Alistamiento humano externo en Meta Colombia:** verificar Portafolio Empresarial, Instagram Profesional `@lucams_shop`, Página Facebook, verificación DNS `TXT` de `lucamsshop.com` en Cloudflare, creación de Catálogo + Dataset (Pixel) y `System User` con token servidor.
2. **Corte `PR-M1` — Feed `/feeds/meta.xml` (`PHYSICAL_STOCK`) + Auditor pre-vuelo + Constructor UTM:** entrega catálogo XML con `<g:sale_price>` y `custom_label_0..4` listo para _Scheduled Fetch_ en Commerce Manager y herramientas de enlaces UTM sin tocar PII.
3. **Corte `PR-M2` — `MetaProvider` (`v25.0`), Sonda `/admin/integraciones`, Diagnósticos de Catálogo y Push `Batch API`:** conecta el `System User` cifrado, muestra rechazos remotos de ítems y actualiza stock/precio en segundos cuando cambia un SKU `PHYSICAL_STOCK`.
4. **Corte `PR-M3` — Sincronización Legal Ley 1581 + Meta Pixel (`COOKIES_MARKETING`, CSP y `autoConfig: false`):** actualiza `legal.cookies.md`, `legal.privacidad.md`, `legal.subprocesadores.md`, `FALLBACK`s, `PRIVACY_POLICY_VERSION` y `docs/COMPLIANCE.md` en el mismo corte que activa `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout` y `Purchase` (Wompi + COD sanitizado).
5. **Corte `PR-M4` — Conversions API (`CAPI`) con `MetaOrderAttribution` y `MetaEventOutbox`:** cierra el ciclo servidor con deduplicación exacta `purchase:LCM-YYYY-NNNN`, `after()` + `pg_cron` y purga de atribución a 45 días.
6. **Corte `PR-M5` — `Insights API`, Rentabilidad Real contra BOM y Controles Seguros de Presupuesto/Pausa:** integra `MetaAdInsightDaily`, cruce financiero honesto y pausa/tope diario bajo MFA.
