# Catálogo y Sistema de Contenidos (CMS v2) — Lucams Shop

> **Documento vivo.** Describe el modelo de datos del catálogo comercial, las variantes gemelas sin imán (`-NOMAG`), las escalas por volumen, la arquitectura CMS v2 de 3 capas, las APIs públicas preparadas para RAG/CDN y el flujo de sincronización segura entre STG y PRD.

---

## 1. Modelo de Datos del Catálogo (`packages/db/prisma/schema.prisma`)

El catálogo se distribuye en módulos especializados dentro de `apps/web/features/{products,categories,ocasiones,wishlist,back-in-stock,cart}/` y expone dos capas de lectura que comparten los predicados canónicos de visibilidad (`apps/web/features/products/storefront-visibility.ts`): una capa SSR para la tienda (`public-service.ts`, que consulta stock en vivo en listados y PDP deduplicado con `React.cache()`) y una capa cacheada para APIs y asistentes (`apps/web/lib/catalog.ts`, con `unstable_cache` y tag `"catalog"`).

```mermaid
flowchart TD
  CAT["Category (Raíz -> Subcategoría)"] --> PROD["Product (centavos COP, warrantyMonths)"]
  OC["OcasionTag"] <-->|"ProductOcasionTag (rationale)"| PROD
  PROD --> VAR["ProductVariant (SKU, stock, attributes JSON)"]
  PROD --> WT["WholesaleTier (escalas por volumen)"]
  PROD --> TPL["PersonalizationTemplate (EDITABLE / PREMADE)"]
  PROD --> BIS["BackInStockSubscription"]
  PROD --> WL["WishlistItem"]
  DGI["DesignGalleryImage (tag + variantFilter)"] -.->|"Arte prediseñado"| PROD
```

### Entidades principales

- **`Category` (`features/categories/`)**:
  - **Jerarquía de 2 niveles**: relación padre-hija (`parentId` con `onDelete: Restrict`). `assertValidParent` impide ciclos, referencias a categorías eliminadas y niveles nietos (máximo raíz -> subcategoría). En tienda, las subcategorías sin productos activos y las raíces vacías se podan automáticamente del árbol de navegación y el conteo del padre consolida los productos de sus hijas.
  - **Contenido editorial SEO y visual**: `richDescription` (Markdown extendido renderizado en `/productos?categoria=X` y subcategorías), `useCase` (casos de uso semánticos), `icon` (resuelto contra 17 iconos curados de `lucide-react` en `lib/category-visuals.ts`) y `gradient` (8 gradientes Tailwind de marca).
  - **Curaduría de grilla y redirecciones**: `visibleFilters` (arreglo de hasta 9 claves canónicas definidas en `lib/visible-filters.ts`; vacío muestra todos los filtros), `featuredProductSlug` (fija un producto destacado en primera posición sin duplicarlo en la paginación) y `defaultSort` (`recent`, `price_asc`, `price_desc`, `featured`). Renombrar `slug` desde `/admin/categorias` crea automáticamente reglas `UrlRedirect` `301` para la raíz y sus subcategorías. _(Las columnas `activeFrom` y `activeUntil` existen en esquema como reserva futura sin filtro activo en tiempo de ejecución)._
- **`OcasionTag` y `ProductOcasionTag` (`features/ocasiones/`)**:
  - Etiquetas transversales que cruzan categorías (por ejemplo, bodas, grados, Día de la Madre o aniversarios), con `description` semántica, `monthHint` (`1..12` para rotación estacional) y `suggestedQuantityRange` (`{ min, ideal, max }`).
  - La tabla pivote `ProductOcasionTag` añade `rationale` (justificación comercial por par producto-ocasión), alimentando el índice `/ocasion`, las páginas `/ocasion/[slug]`, el filtro combinado `/productos?ocasion=...&q=...` y el motor de recomendación.
- **`Product` y `ProductVariant` (`features/products/`)**:
  - **Importes enteros**: `basePrice`, `compareAtPrice`, `cost` y `ProductVariant.price` / `compareAtPrice` se almacenan siempre en **centavos COP (`Int`)** con restricciones SQL `CHECK >= 0`.
  - **Herencia de precio, promoción y galería**: el precio efectivo de una opción es `variant.price ?? product.basePrice` (cada escritura de variantes recalcula `syncProductBasePrice` con el menor precio activo). El precio tachado promocional se evalúa por variante (`resolvePromoDisplay`). No existe una tabla separada de imágenes: `Product.images` y `ProductVariant.images` son arreglos `String[]` en Supabase Storage; si `variant.images` está vacío, la opción hereda la galería del producto.
  - **Dimensiones físicas y compuerta logística (`shipping-schemas.ts`)**: `Product.physicalSpecs` almacena material, espesor (`thicknessMm`), gramaje (`weightGrams`), dimensiones de empaque (`widthCm`, `heightCm`, `depthCm`), contenido (`includes[]`) y origen (`"CO"`). Una variante puede sobrescribir dimensiones logísticas en `attributes._shipping`. `assertProductsQuotable` **impide activar (`isActive = true`) cualquier producto en `/admin/productos` si carece de peso y dimensiones válidas** para cotizar en Aveonline.
  - **Atributos tipados de variante (`variant-schemas.ts`)**: `ProductVariant.attributes` modela la geometría de corte y renderizado 300 DPI (`sizeCm`, `aspectRatio`, `shape`, `cornerRadiusPx`, `noFold`, `facesPerUnit`), la capacidad del pack (`photoSlots` de `1..50`, `quantity` de `1..500`), el soporte magnético (`magnet: boolean`) y parámetros de sets de letras (`language`, `letterCount`, `pricePerTile`). Al guardar en admin, `mergePreservingUnmanagedAttributes` preserva intactas las llaves técnicas internas.
  - **Garantía modular y tiempos operativos**: `Product.warrantyMonths` (`1..120`, con restricción SQL `CHECK` y base `1 mes`) se congela de forma inmutable en `OrderItem.warrantyMonths` al comprar (`ADR-106`, ver [`./post-sale-and-support.md`](./post-sale-and-support.md)). `productionDays`, `shippingDaysMin` y `shippingDaysMax` alimentan los estimados operativos de preparación y tránsito. _(Las columnas `minimumQuantity` y `maximumQuantity` se persisten y exponen en APIs de catálogo; el carrito aplica actualmente el rango operativo `1..min(99, stock)`)._
- **`WholesaleTier` (`features/cart/volume-pricing.ts`)**:
  - Escalas públicas de descuento por volumen gestionadas en `/admin/mayorista` (exclusivo `SUPERADMIN`), abiertas tanto a compradores invitados como autenticados (`ADR-124`).
  - Cada tramo define `minQty` y `unitPrice` (precio unitario absoluto en centavos COP). Si un producto tiene al menos un tramo propio (`productId != null`), sus tramos hacen **sombra estricta** sobre los tramos globales (`productId = null`). Además, aplica garantía de no-recargo (`tier.unitPrice < baseUnitPrice`).
  - Se exhiben en la PDP, se calculan automáticamente sobre `CartItem.unitPrice` al agregar o cambiar cantidades en el carrito y viajan selladas al checkout antes de aplicar cupones o Puntos Lucams.
- **Modelado de packs, sets y kits (sin tablas `Combo` / `ComboItem`)**:
  - El esquema no utiliza tablas `Combo` ni `ComboItem`. Los paquetes comerciales se modelan sobre `Product` + `ProductVariant` mediante tres patrones:
    1. **Variantes por tamaño de pack**: `attributes.photoSlots` (packs de 6, 12, 18 o 24 fotoimanes resueltos en servidor por `photo-pack-resolve.ts`) o `attributes.quantity` (packs de separadores o recordatorios).
    2. **Diseños multi-unidad en una sola línea**: múltiples tiras, calendarios o sets de letras diseñados dentro de un mismo `Design` (`qty = 1` en carrito, precio multiplicado en servidor por `designUnitPriceMultiplier` o `letterSetUnitCount`).
    3. **Cajas de regalo compuestas**: un `Product` cuyo arreglo `physicalSpecs.includes` detalla las piezas incluidas.
- **`DesignGalleryImage`, `WishlistItem` y `BackInStockSubscription`**:
  - `DesignGalleryImage`: arte prediseñado administrable en `/admin/disenos` por `tag`, con soporte de doble cara (`imageUrl`, `imageUrlB`), filtro por atributos de variante (`variantFilter`) y miniaturas públicas con marca de agua cacheadas bajo el tag `"gallery-thumbs"`.
  - `WishlistItem`: lista de favoritos por cliente autenticado (`/mi-cuenta/favoritos`, única por `(customerId, productId)`).
  - `BackInStockSubscription`: suscripción «Avísame cuando vuelva» para invitados o autenticados cuando todas las variantes activas tienen `stock = 0` (`20 req/h/IP`), registrando consentimiento `ConsentScope.BACK_IN_STOCK`. El cron `GET /api/cron/back-in-stock` notifica en orden FIFO y **limita el número de correos enviados al stock total repuesto** (`sum(variants.stock)`) para no avisar en exceso cuando entran pocas unidades.

---

## 2. Variantes Gemelas sin Imán (`-NOMAG`)

Varios productos del catálogo (fotoimanes, tiras, separadores y calendarios) se ofrecen tanto imantados como en acabado tarjeta/papel sin imán sobre la misma ficha `Product`:

- **Convención de SKU y atributos**: la variante sin imán comparte producto con su par magnético, utiliza sufijo `-NOMAG` en su SKU (por ejemplo, `FI-TIRA-4FOTOS-NOMAG` o `SEP-ALR-2X6-1-NOMAG`) y declara explícitamente `attributes.magnet = false` (frente a `attributes.magnet = true` en su gemela con imán). Ambas comparten imágenes de portada en el administrador (`COVER_SIGNATURE_IGNORED_KEYS` ignora `magnet`).
- **Comportamiento en PDP y catálogo**: `VariantSelector` (`app/producto/[slug]/variant-selector.tsx`) expone la dimensión «¿Con imán?» (`Con imán` / `Sin imán`) y **preselecciona siempre «Con imán» por defecto**, salvo enlace directo `?variant=` o agotamiento exclusivo de la opción imantada.
- **Comportamiento en Estudio y carrito**: `magnet` se guarda en la raíz de `canvasData` y `Design.metadata.variantId`. Si `magnet === false`, el Estudio adapta el sustantivo de la pieza (`resolveSlotNoun` nunca la llama «imán»), oculta las escenas 3D magnéticas (`fridge`, `board`, `memo`) y elimina el dorso negro de ferrita (`ADR-180`). Al agregar al carrito, el servidor resuelve sin ambigüedad la tupla `photoSlots + sizeCm + magnet`.
- **Comportamiento en taller y producción**: en `features/personalization/production-spec.ts`, cuando `attrs.magnet === false`, la orden de trabajo y el archivo `LEEME.txt` omiten el paso de laminado magnético e imprimen la advertencia explícita `SIN imán (esta variante no lo lleva)`.

---

## 3. Arquitectura CMS v2 de 3 Capas (`ADR-082`, `ADR-187`)

Lucams separa estrictamente el contenido administrable, los encabezados de correos y el microcopy funcional de interfaz en tres capas para evitar claves rotas, consultas redundantes y riesgos de seguridad:

```mermaid
flowchart LR
  subgraph L1["Capa 1: Contenido y Ajustes en BD (166 campos)"]
    P["CmsPage (9) -> CmsSection (29)"] --> F["CmsField (105 BLOCK + 61 SETTING)"]
    F --> V["CmsFieldVersion (inmutable + publishAt)"]
    F --> LI["CmsListItem + CmsMedia"]
  end
  subgraph L2["Capa 2: Correos Transaccionales"]
    EM["EmailTemplateOverride (30 plantillas)"]
  end
  subgraph L3["Capa 3: Microcopy Funcional"]
    TS["Diccionarios tipados TS (Estudio, Auth, Cuenta)"]
  end
  L1 -->|"Snapshot único unstable_cache (tag: cms)"| SF["Storefront + APIs /api/cms/*"]
  L2 -->|"withOverrides (tag: email-overrides)"| RS["Resend (envío de emails)"]
  L3 -->|"0 queries BD"| SF
```

### Capa 1 — Contenido editorial, páginas legales y ajustes (`CmsPage` -> `CmsSection` -> `CmsField`)

Las tablas legadas (`CmsBlock` y `SiteSetting`) fueron consolidadas en un único modelo jerárquico relacional manteniendo intacta la interfaz de lectura en `apps/web/lib/cms.ts` (`getCmsBlock`, `getSiteSetting`, `getSettingValue`, `getCmsList`, `getCmsImage`). El mapa canónico en `packages/db/scripts/cms-site-map.mjs` declara exactamente **9 contenedores (`CmsPage`), 29 secciones (`CmsSection`) y 166 campos (`CmsField`: 105 `BLOCK` + 61 `SETTING`)**:

| #   | Slug (`CmsPage`) | Título en Admin                  | Ruta pública   | Secciones |  Campos | `BLOCK` | `SETTING` |
| --- | ---------------- | -------------------------------- | -------------- | --------: | ------: | ------: | --------: |
| 1   | `inicio`         | Página principal                 | `/`            |         7 |      35 |      33 |         2 |
| 2   | `navegacion`     | Encabezado y pie de página       | —              |         2 |       5 |       5 |         0 |
| 3   | `ayuda`          | Centro de ayuda                  | `/ayuda`       |         2 |      16 |      16 |         0 |
| 4   | `contacto`       | Contacto                         | `/contacto`    |         2 |       8 |       8 |         0 |
| 5   | `legales`        | Páginas legales                  | —              |         2 |      17 |      17 |         0 |
| 6   | `checkout`       | Checkout                         | —              |         3 |      18 |      18 |         0 |
| 7   | `sistema`        | Modo mantenimiento               | `/maintenance` |         1 |       2 |       2 |         0 |
| 8   | `seo`            | SEO (Google)                     | —              |         1 |       6 |       6 |         0 |
| 9   | `global`         | Ajustes del sitio (`SUPERADMIN`) | —              |         9 |      59 |       0 |        59 |
|     | **Total**        |                                  |                |    **29** | **166** | **105** |    **61** |

- **Snapshot único cacheado (`cms-snapshot-v2`)**: `apps/web/lib/cms.ts` descarga los 166 campos activos y su `publishedVersion` en **una sola consulta Prisma** cacheada con `unstable_cache` (`tags: ["cms"]`, `revalidate: 3600`). Los errores de red se capturan fuera de la caché para jamás memorizar respuestas vacías, cayendo siempre al `fallback` en código (_Regla de Oro_).
- **Versionado inmutable y publicación programada**:
  - Toda edición inserta una fila append-only en `CmsFieldVersion` (`version = max + 1`). En campos `BLOCK`, guardar borrador no altera `publishedVersionId` hasta publicar explícitamente; en campos `SETTING`, el guardado crea versión y publica en el acto.
  - `scheduleCmsFieldPublish` permite fijar `CmsFieldVersion.publishAt` en hora de Bogotá (`UTC-5`, mínimo 1 minuto en el futuro). El cron `GET /api/cron/cms-publish-scheduled` (cada 5 minutos, con omisión en SQL si no hay pendientes) publica las versiones vencidas e invoca `revalidateTag("cms", "max")`. Las acciones del panel invalidan al instante mediante `updateTag("cms")` (además del botón manual «Actualizar caché» en `/admin/contenido`).
- **Listas tipadas (`CmsListItem`) y Mediateca (`CmsMedia`)**:
  - Los campos con `metadata.listSchema` se editan como filas de formulario sin manipular JSON crudo y se serializan en una nueva `CmsFieldVersion`.
  - `CmsMedia` gestiona activos en el bucket público `cms-media` (máx. `5 MB`, validación por magic bytes, conversión a WebP `<= 2000 px` y `alt` obligatorio WCAG 1.1.1). `deleteCmsMedia` **bloquea el borrado si el ID está referenciado en cualquier versión actual o histórica** (`CmsFieldVersion.body`), evitando enlaces rotos al revertir versiones.
- **Delegación de 21 parámetros operativos**: aunque residen en `CmsField` (`global`), 21 ajustes con reglas de negocio complejas están bloqueados en `/admin/contenido/paginas/global` y delegados a sus módulos dueños (todos exclusivos `SUPERADMIN`):
  - `/admin/envios` (6 claves de Envío Lucams y reglas de peso por transportadora).
  - `/admin/fidelizacion` (10 claves de Puntos Lucams e Invita y gana).
  - `/admin/carritos/configuracion` (5 claves de recuperación de carritos abandonados).

### Capa 2 — Plantillas de correo transaccional (`/admin/email-templates`)

El módulo `/admin/email-templates` (`SUPERADMIN`) administra `EmailTemplateOverride` sobre las **30 plantillas registradas** en `apps/web/features/emails/registry.ts`, permitiendo personalizar `SUBJECT`, `PREHEADER` y `HEADING` con interpolación segura de variables `{campo}`, vista previa HTML aislada con CSP sandbox y envío de correo de prueba `[PRUEBA]`, cacheado bajo el tag `"email-overrides"`. Para el inventario completo de plantillas y webhooks de entrega, consulta [`../integrations/resend-and-emails.md`](../integrations/resend-and-emails.md).

### Capa 3 — Microcopy funcional en código TypeScript

Los textos puramente operativos de controles, validaciones y accesibilidad viven tipados en código sin viajes a base de datos: Estudio (`app/estudio/[slug]/studio-texts.ts`), Autenticación (`app/(auth)/auth-texts.ts`), Mi Cuenta (`app/mi-cuenta/account-texts.ts`) y la base estructural del Checkout (`app/checkout/checkout-texts.ts`, que hidrata únicamente 10 claves comerciales desde el CMS).

### Guarda AST de paridad, tokens dinámicos y edición visual en vivo

- **Gate AST en CI (`apps/web/lib/cms-sitemap-parity.test.ts`)**: recorre el árbol sintáctico TypeScript de todo `apps/web` y falla el build si: (a) cualquier llamada o componente JSX (`<CmsText>`, `<CmsMarkdown>`, `<CmsSetting>`, `getCmsBlock`, `getSettingValue`, `getPageSeo`, etc.) consume una clave ausente de `cms-site-map.mjs`, (b) existe cualquier campo en `cms-site-map.mjs` sin consumidor real en código, o (c) el conteo difiere de `9` páginas / `166` campos o aparece una variante inválida de marca.
- **Resolución de tokens legales y operativos (`resolveCmsTokens` en `lib/cms-tokens.ts` + `lib/consumer-law.ts`)**: interpola **17 tokens dinámicos** para que las páginas legales, FAQs y avisos nunca queden desfasados frente a los parámetros reales:
  - _Buzones oficiales_: `{{email_contacto}}`, `{{email_habeas_data}}`, `{{email_retracto}}`, `{{email_security}}` (`security@lucamsshop.com`).
  - _Tiempos y operación_: `{{fab}}` (`PRODUCTION_DAYS_DEFAULT`), `{{entrega}}` (`DELIVERY_DAYS_ESTIMATE`), `{{total}}`, `{{cobertura}}`, `{{cutoff_lucams}}`, `{{ciudad}}` (contextual).
  - _Constantes legales (`lib/consumer-law.ts`)_: `{{garantia_base}}` (`1 mes`), `{{garantia_respuesta_dias}}` (`15` días hábiles), `{{retracto_dias}}` (`5` días hábiles), `{{retracto_reembolso_dias}}` (`15` días calendario), `{{entrega_max_legal_dias}}` (`30` días calendario), `{{habeas_consulta_dias}}` (`10` días hábiles) y `{{habeas_reclamo_dias}}` (`15` días hábiles).
- **Visual Live Edit Overlay y vista previa SERP (`apps/web/components/cms/`)**:
  - `<CmsText>` y `<CmsMarkdown>` (este último blindado con `ReactMarkdown` + `remarkGfm` + `rehypeSanitize`, sin HTML crudo) son Server Components de costo cero en el navegador público.
  - Cuando un administrador con rol `SUPERADMIN` o `CMS_EDITOR` y MFA `aal2` activa `POST /api/admin/cms/edit-mode` (cookie `HttpOnly` `lucams_cms_edit=1` por 8 h, revalidada en servidor en cada request mediante `isCmsEditMode()`), los bloques emiten `data-cms-key` y `<CmsEditOverlay>` resalta cada texto en la tienda real para saltar con un clic a su editor en `/admin/contenido`.
  - Además, `/admin/contenido` ofrece `<PagePreviewPanel>` (iframe en vivo para rutas 1:1) y tarjeta interactiva de **vista previa Google SERP** al editar `<title>` y `meta description` en `seo.page.*`.

---

## 4. APIs Públicas de Catálogo, Cupones y CMS

Todas las rutas son `GET`, aplican limitación de tasa por hash de IP (`ipKey`, sin guardar IPs en claro por Ley 1581), respetan el filtro CORS central de `apps/web/proxy.ts` y operan de forma idéntica en modo `"catalog"` y `"full"`.

### 4.1 Endpoints de catálogo (`/api/catalog/*` — 9 rutas) y cupones públicos (1 ruta)

| Endpoint                            | Parámetros principales                                                                                        | `Cache-Control` HTTP                  | Data Cache / Tag             | Rate limit (IP) |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------- | --------------- |
| `GET /api/catalog/categories`       | —                                                                                                             | `public, max-age=3600, s-maxage=3600` | Tag `"catalog"` (`3600 s`)   | `30 req / 60 s` |
| `GET /api/catalog/products`         | `categoria`, `subcategoria`, `ocasion`, `priceMin`, `priceMax`, `isPersonalizable`, `sort`, `limit`, `offset` | `public, max-age=300, s-maxage=300`   | Tag `"catalog"` (`300 s`)    | `30 req / 60 s` |
| `GET /api/catalog/products/[slug]`  | Path: `slug` (`404` si no existe o está pausado)                                                              | `public, max-age=3600, s-maxage=3600` | Tag `"catalog"` (`3600 s`)   | `60 req / 60 s` |
| `GET /api/catalog/ocasiones`        | —                                                                                                             | `public, max-age=3600, s-maxage=3600` | Tag `"catalog"` (`3600 s`)   | `30 req / 60 s` |
| `GET /api/catalog/ocasiones/[slug]` | Path: `slug` (incluye hasta 12 productos asociados)                                                           | `public, max-age=3600, s-maxage=3600` | Tag `"catalog"` (`3600/300`) | `30 req / 60 s` |
| `GET /api/catalog/search`           | `q` (mín. 2, máx. 120 chars; búsqueda difusa `pg_trgm` + `unaccent`), `limit` (`1..50`)                       | `public, max-age=300, s-maxage=300`   | Directo PostgreSQL           | `60 req / 60 s` |
| `GET /api/catalog/recommend`        | `ocasion[]`, `destinatario`, `precioMin`, `precioMax`, `personalizable`, `exclude[]`, `limit` (`1..30`)       | `public, max-age=600, s-maxage=600`   | Tag `"catalog"` (`300 s`)    | `60 req / 60 s` |
| `GET /api/catalog/filters`          | `categoria` (opc.), `subcategoria` (opc.) — devuelve facetas y rango real de precios                          | `public, max-age=3600, s-maxage=3600` | Tag `"catalog"` (`3600 s`)   | `30 req / 60 s` |
| `GET /api/catalog/templates`        | `productSlug` (**requerido**), `mode` (`EDITABLE` \| `PREMADE`)                                               | `public, max-age=3600, s-maxage=3600` | Tag `"catalog"` (`3600 s`)   | `60 req / 60 s` |
| `GET /api/coupons/public`           | — (solo cupones con `isPublic = true`, activos y dentro de vigencia `validFrom..validTo`)                     | `public, max-age=600, s-maxage=600`   | Tags `["catalog","coupons"]` | `30 req / 60 s` |

### 4.2 Endpoints de CMS (`/api/cms/*` — 4 rutas, errores RFC 7807 `application/problem+json`)

Las 4 rutas comparten el bucket de tasa `api-cms` (**`30 req / 60 s` por IP**):

| Endpoint                    | Parámetros principales                                              | `Cache-Control` HTTP                                               | Comportamiento clave                                                                                  |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `GET /api/cms/blocks`       | `category` (opc.: `LEGAL`, `HOME`, `FAQ`, `SUPPORT`, etc.)          | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` | Lee `cms-snapshot-v2` e interpola `resolveCmsTokens` en título y cuerpo.                              |
| `GET /api/cms/blocks/[key]` | Path: `key` (`404` si no existe o no está publicado)                | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` | Devuelve un bloque publicado individual con tokens resueltos.                                         |
| `GET /api/cms/settings`     | `category` (opc.: `CONTACT`, `BUSINESS`, `LEGAL`, `COMMERCE`, etc.) | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` | Filtrado por lista blanca estricta `PUBLIC_SETTING_KEYS` (26 claves; oculta NIT, alertas y internos). |
| `GET /api/cms/search`       | `q` (**requerido**, `2..120` chars)                                 | `public, max-age=60, s-maxage=300, stale-while-revalidate=3600`    | Búsqueda `pg_trgm` + `unaccent` sobre bloques publicados (`LIMIT 20`).                                |

---

## 5. Sincronización Operativa STG -> PRD (`ADR-126`)

Dado que los IDs `cuid()` pueden diferir entre ambientes y la curaduría editorial/visual se valida primero en STG, `packages/db/scripts/` provee herramientas idempotentes basadas en claves naturales y protegidas por `scripts/lib/env-guard.mjs`:

1. **`sync-catalog-stg-to-prd.mjs`**:
   - Sincroniza en orden estricto de claves foráneas: `Category` (por `slug`, padres antes que hijas) -> `Product` (por `slug`) -> `ProductVariant` (por `sku`) -> `CmsPage` (`slug`) -> `CmsSection` (`pageSlug|key`) -> `CmsField` (`key`, incluyendo nueva `CmsFieldVersion` publicada append-only, `CmsListItem` y remapeo de `CmsMedia` por `bucket/path`) -> `PersonalizationTemplate` (`slug`).
   - **Copia previa de Storage y reescritura de host**: antes de tocar PostgreSQL, verifica con `HEAD` cada imagen referenciada en el bucket destino, copia desde STG únicamente los objetos faltantes (`upsert: false`) y reescribe las URLs del proyecto Supabase STG al host de PRD.
   - **Regla de oro sobre el inventario**: **`ProductVariant.stock` jamás se sincroniza**. El stock de PRD refleja el inventario físico real descontado por ventas; las variantes nuevas insertadas entran con `stock = 0` y se listan en consola para carga manual en `/admin/productos/stock`. Tampoco toca `Coupon` ni `AdminUser`.
2. **`sync-gallery-stg-to-prd.mjs`**:
   - Sincroniza `DesignGalleryImage` cruzando primero por `id` y luego por clave natural `(tag, name)` para conservar las FKs existentes en PRD (`DesignAsset.galleryImageId`).
   - Verifica precondiciones de esquema (`information_schema.columns`), copia los masters `imageUrl` / `imageUrlB` faltantes al bucket de PRD y reescribe el host público para satisfacer la validación anti-SSRF del Estudio.
3. **Guardarraíles de ejecución (`--apply` y `env-guard.mjs`)**:
   - Ambos scripts corren en **modo `DRY-RUN` de solo lectura por defecto** (imprimen el plan completo de inserciones, actualizaciones, filas exclusivas de PRD que se conservan intactas y objetos a copiar).
   - Validan con `classifyUrl` que las credenciales de origen y destino no estén cruzadas y bloquean cualquier escritura sobre PRD salvo invocación explícita con `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1` y `--apply` (soportan también `--to=local` para homologar el entorno de desarrollo). Tras aplicar cambios en PRD, se debe refrescar la caché en `/admin/contenido` o esperar el TTL de 1 hora (ver [`../OPERATIONS.md`](../OPERATIONS.md)).

---

## Documentos Relacionados

- Arquitectura general, RLS y caché: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- Estudio de Personalización y plantillas 300 DPI: [`./studio-and-production.md`](./studio-and-production.md)
- Carrito, precios por volumen, cupones y checkout: [`./checkout-payments-shipping.md`](./checkout-payments-shipping.md)
- Garantías modulares (`warrantyMonths`) y derecho de retracto: [`./post-sale-and-support.md`](./post-sale-and-support.md)
- Plantillas de correo y proveedor Resend: [`../integrations/resend-and-emails.md`](../integrations/resend-and-emails.md)
- Procedimientos operativos y sincronización entre ambientes: [`../OPERATIONS.md`](../OPERATIONS.md)
- Marco legal de información pública y Ley 1480 / Ley 1581: [`../COMPLIANCE.md`](../COMPLIANCE.md)
