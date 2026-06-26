OK 5 test files, not "essentially empty". The scout count was outdated. Now I have all the info needed. Let me write the final markdown report.

# Dimensión: CATÁLOGO + PDP + SEARCH + ESTUDIO PERSONALIZACIÓN

## Estado actual real
El catálogo público corre sobre Prisma directo (sin caching) con 8 productos activos (no 9 — uno está inactivo: `separadores-personalizables`), 138 variantes con `attributes` productivos (shape/sizeCm/photoSlots/quantity, no "Default" salvo `calendario-mes-a-mes-fotos` que sí queda con 1 variant `{}`), y 36 reviews 100% demo (todas con `customerId: null` y autores ficticios). El PDP renderiza galería, breadcrumbs, JSON-LD `Product`, variant-selector multi-dimensión, CTA "Personalizar" para `personalizationKind != NONE`, y `<RelatedProducts>` con scoring de 3 capas (ocasión + categoría + parent). El Estudio v2 está sofisticadísimo (~7k líneas, paradigma slot-por-imán, V2 canvasData, mobile sheet drawer + pinch-zoom + wheel-zoom + onboarding + realismo shape-aware + auto-save 2s debounce + finalize en 2 fases) pero opera con solo **9 plantillas activas** (vs target "10 premium + 20 soft-deleted" — en DB hay 42 soft-deleted) y **2 SVG en `public/templates/`** (vs target ~11). El directorio `public/scenes/` no existe. La ruta `/d/[token]` no existe (M.3.b.E share no implementado).

## Fortalezas
- Variantes verdaderamente productivas: `attributes` con shape/sizeCm/photoSlots/aspectRatio/qty reales; el `VariantSelector` (355 LOC) maneja modos single-dim y multi-dim con chips por dimensión.
- Búsqueda fuzzy completa: `searchStorefrontProducts` usa `pg_trgm` + `immutable_unaccent`, scoring híbrido (exact > prefix > similarity > sku > description) + fallback "¿querías decir...?" con threshold 0.1, GIN trigram index en DB. Soporta typos colombianos.
- Filtros `/productos` extensos: q, categoria (jerárquica con sub-cats expandidas), ocasion, minPrice/maxPrice, personalizable, descuento, destacados, orden (5 modos), paginación windowed con SEO `rel="prev/next"`.
- PDP con JSON-LD `Product` cumple básicos schema.org: name, sku, image, basePrice, priceCurrency=COP, availability=InStock, brand. `priceValidUntil` derivado de `updatedAt + 1 año` (impuro evitado correctamente).
- ProductCard muestra "X opciones" + "desde $X" cuando `variantCount > 1 && minVariantPrice < basePrice`, descubribilidad real.
- Estudio v2 con paradigma slot-por-imán: N stages Konva independientes, N PNGs 300 DPI separados al finalize, mobile sheet drawer, FAB, pinch-zoom (touch nativo en Konva Stage), wheel-zoom (native listener `passive: false` para `preventDefault`), realismo shape-aware (heart/circle/rect siluetas reales + safe-area dashed + finish glossy/matte/glass/soft-touch).
- Studio finalize en 2 fases (Lucy 2026-05-21 PR A.3): preview client-side primero, upload solo si cliente confirma. Buena UX e impide uploads abandonados.
- `FormData` binary upload bypasea el bug "Maximum array nesting exceeded" del React Flight protocol de Next 16 — patrón correcto y documentado.
- Sitemap dinámico incluye categorías + productos con `updatedAt`, robots.txt bloquea `/admin/`, `/api/`, `/auth/`, `/mi-cuenta/`, manifest.json con brand colors.
- `listRelatedProducts` con scoring de 3 capas + fallback a featured globales si pool insuficiente.
- Onboarding lightbox 3 pasos + `localStorage['lucams_studio_onboarded']="v1"` versioneado.

## Debilidades
- Reviews 100% demo (36 con `customerId: null`, autores "María C." "Ana S." etc., texto incluye `[DEMO]`) y NO hay bloque de reviews en el PDP — el código las consume solo en home carousel. Falta `aggregateRating` en JSON-LD por completo.
- Solo 8 productos activos en DB (no 9 como afirma el contexto). `separadores-personalizables` está `isActive: false`. Productos con `images: []`: `abecedario-magnetico-espanol`, `separadores-personalizables`, `separadores-predisenados`, `abecedario-magnetico-ingles`. 4 de 8 productos no tienen ninguna imagen.
- Solo **2 SVGs en `public/templates/`** (`ig_post.svg`, `personalizacion-libre.svg`); todos los demás `previewUrl` de templates (incluso los activos) apuntan a SVGs inexistentes → 404 en `<Image>` del sidebar y del PDP `TemplatesStrip`. README del estudio dice "30 SVG mockups custom diseñados a mano" — falso.
- Solo 9 plantillas activas (vs target 10) y **42 soft-deleted** (vs target ~20 — el doble del esperado). 0 templates `mode: PREMADE` → `<TemplatesStrip>` para productos `kind=NONE` siempre devuelve vacío.
- `lib/catalog.ts:listTemplatesByProduct` filtra por `productId: product.id` exclusivo (sin `OR: [{productId: null}]`). Solo el template `photo-pack-polaroid-instagram` está asociado a un product específico; los demás 8 activos son `productId: null`. Resultado: **`<TemplatesStrip>` del PDP es vacío para 7 de 8 productos**.
- `calendario-mes-a-mes-fotos` tiene 1 variant `name: "Default"` con `attributes: {}` — viola el mandato "no solo Default". El selector multi-dimensión no se mostrará (vCount=1).
- Voseo argentino en copy customer-facing — viola mandato MEMORY "tuteo NO voseo":
  - `app/estudio/[slug]/page.tsx:36` "Diseñá tu..."
  - `app/estudio/[slug]/studio-onboarding.tsx:47` "Asigná a cada imán"
  - `app/estudio/[slug]/studio-photo-adjust-modal.tsx:89` "Elegí un filtro"
  - `app/producto/[slug]/page.tsx:213` "Diseñá en vivo • Vista previa al instante"
  - `app/layout.tsx:54` "Diseñá el tuyo en vivo o elegí entre nuestros packs kawaii"
  - `app/checkout/datos/datos-form.tsx:363,403,431` "Elegí tipo/depto/ciudad"
  - `app/checkout/envio/page.tsx:68` y `envio-step.tsx:46` "Elegí cómo te lo enviamos"
  - `app/contacto/contact-form.tsx:128` "Contanos en qué te podemos ayudar"
  - `features/emails/templates/order-payment-failed.ts:45,62` "Probá con otro medio de pago"
- Sin caching en lectura pública: `listStorefrontProducts`, `listStorefrontCategories`, `getStorefrontPriceRange`, `searchStorefrontProducts`, `getStorefrontProductBySlug` van directo a Prisma. Comentarios prometen `unstable_cache` pero no se implementó. Cada visita al catálogo dispara 3 queries paralelas (categories + priceRange + ocasiones) + 1-2 query principal.
- No hay rating display (estrellas) en PDP ni ProductCard. No hay `aggregateRating` en JSON-LD aunque hay 36 reviews aprobadas — Google rich snippets quedan sin estrellas, los CTRs sufren.
- `/d/[token]` (share design por link público) no existe. M.3.b.E "share" del Estudio no implementado. No hay `navigator.share`, ni copyLink, ni publicShareToken en `Design`.
- `public/scenes/` directorio NO existe. M.3.b.B "vista previa en nevera/escena" no se construyó como assets. Solo hay `<RealismShadowLayer>` (sombra del imán flotando) y `<RealismOverlayLayer>` (glossy + safe-area) — no escenas reales.
- No hay Three.js / react-three-fiber en uso. El "diferenciador #1" del CLAUDE.md menciona "vista 3D en nevera (Three.js)" — no implementado.
- Robots.txt `disallow: /productos?*` — los crawlers no indexarán ninguna combinación de filtros (¿por diseño?), pero también las URLs amigables como `?categoria=fotoimanes` que pueden ser landing pages valiosas para SEO de cola larga. El sitemap igual incluye `productos?categoria=` como entradas → conflicto.
- `searchStorefrontProducts` no se beneficia de los filtros estructurados a nivel SQL: en `productos/page.tsx:104-115` aplica filtros (categoria, personalizable, descuento, minPrice, maxPrice) **client-side post-fetch** sobre el array completo. Si la búsqueda devuelve 100 rows y el usuario filtra `categoria`, recorre 100 en JS en server. No usa `ocasionSlug` ni `destacados` en este path (omitidos silenciosamente).
- `Robots.txt + sitemap.xml` ambos `dynamic = "force-dynamic"` — sin cache, cada crawler hit dispara DB queries.
- `RecommendationLog` tabla existe pero `/api/catalog/recommend` no parece loguear (el route.ts solo lee `recommendProducts` y devuelve, no persiste). Decisión 6.10 dice "cada call... crea un log" — no se cumple.
- `prisma.product.findMany` en `searchStorefrontProducts` no incluye `variantCount` ni `minVariantPrice` — los results del search dropdown (CommandPalette) muestran solo `basePrice`, divergente del listing donde sí se muestra "desde". UX inconsistente.
- Tests del catálogo: solo `lib/format.test.ts`, `lib/rate-limit-keys.test.ts`, `lib/cookie-consent.test.ts`, `features/support/schemas.test.ts` + 1 e2e smoke. **0 tests** del Estudio (7k LOC), de `public-service.ts`, `searchStorefrontProducts`, variant-selector, ni del realismo. Si Lucy edita el canvas-migrate, no hay safety net.
- README del estudio dice "tests rigurosos — unit cobertura ≥ 80%, integration, E2E playwright, visual regression, axe a11y, Lighthouse CI" — falso (0 tests del módulo).

## Findings detallados

### [P0] CAT-001 — Templates assets missing causa SVGs 404 en PDP, sidebar Estudio y home
- **Categoría**: bug
- **Evidencia**: `apps/web/public/templates/` solo contiene `ig_post.svg` y `personalizacion-libre.svg`. Sin embargo en DB hay 9 templates activos cuyos `previewUrl` apuntan a archivos como `/templates/cuadrado-minimal-art.svg`, `/templates/corazon-vintage.svg`, `/templates/polaroid-romantica.svg`, `/templates/mama-dia-frase.svg`, `/templates/cumpleanos-kawaii-pop.svg`, `/templates/matrimonio-elegante.svg`, `/templates/business-corporativo.svg` (todos soft-deleted, pero el seed los re-crearía); y de los activos `libre-photo-pack` y `libre-event-favor` reutilizan `/templates/personalizacion-libre.svg`. Productos `kind=NONE` cargan `TemplatesStrip` apuntando a previewUrls 404.
- **Impacto**: Empty states feos en producción, broken images visibles al cliente. Lucy 2026-05-13 README dice "30 SVG mockups custom" — Google Lighthouse va a flaggear "Image elements do not have explicit width and height" y "Document does not use legible font sizes". Daña confianza en la marca.
- **Recomendación**: Decidir si quitar templates del DB cuyo SVG no exista (soft-delete o `isActive: false`), o regenerar los 9+ SVGs faltantes. La ruta sostenible es generar los SVGs reales antes de lanzar — son el diferenciador #1.
- **Horas estimadas**: 16 (diseñar/contratar SVGs + verificar viewport/aspect)
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — Lucy debe decidir/contratar 9-30 plantillas SVG mockup (o aprobar simplificar a 3-5 SVGs reales bien hechos). Sin esto, el "diferenciador #1" se ve roto.

### [P0] CAT-002 — TemplatesStrip del PDP devuelve vacío para 7 de 8 productos
- **Categoría**: bug
- **Evidencia**: `apps/web/lib/catalog.ts:822` `listTemplatesByProduct` filtra `productId: product.id` exclusivo. Solo `photo-pack-polaroid-instagram` (en DB) tiene `productId` set (a `cmp2j28eq000hjywuyjb8k3t5`). Los otros 8 templates activos son `productId: null` (globales por kind). Comparar con `features/personalization/service.ts:listTemplatesForKind` que sí usa `OR: [{productId: product.id}, {productId: null}]` correcto.
- **Impacto**: La sección `<TemplatesStrip>` "Empieza desde una plantilla" / "Diseños disponibles" no aparece en 7 de 8 productos públicos. Cliente que entra al PDP no ve las plantillas disponibles del kind — solo las descubre cuando ya entró al Estudio. Lucy pierde un punto de conversión visual.
- **Recomendación**: Ajustar `listTemplatesByProduct` para incluir templates globales: `where: { kind: product.personalizationKind, isActive: true, deletedAt: null, OR: [{ productId: product.id }, { productId: null }], ...(mode ? { mode } : {}) }`.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ninguna

### [P0] CAT-003 — Voseo argentino en copy customer-facing viola mandato MEMORY tuteo Colombia
- **Categoría**: bug
- **Evidencia**: ver bullet "Debilidades" — 12+ ocurrencias en estudio, PDP, layout, checkout, contacto, email templates. Lucy es Colombia, tuteo no voseo.
- **Impacto**: Lucy reportó este patrón ya en `feedback_es_co_tuteo_no_voseo.md` (memoria). Cliente colombiano lee "Diseñá", "Elegí", "Contanos", "Probá" como acento argentino. Reduce identidad local + confianza.
- **Recomendación**: Reemplazar globalmente con tuteo: "Diseñá"→"Diseña", "Elegí"→"Elige", "Asigná"→"Asigna", "Contanos"→"Cuéntanos", "Probá"→"Prueba", "Llená"→"Llena". Hacer pass grep `[áéíó]$|tenés|querés|sabés` en todo `apps/web/` (excluir `node_modules`/`.next`) — generar PR de corrección. Considerar un test lint que falle el build si encuentra voseo en copy.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna (Claude puede ejecutar el reemplazo y Lucy revisar el diff)

### [P0] CAT-004 — Reviews 100% demo + PDP sin sección de reviews + sin aggregateRating JSON-LD
- **Categoría**: gap
- **Evidencia**: 36 reseñas en DB todas con `customerId: null` y nombres ficticios; `app/producto/[slug]/page.tsx` no importa nada de `features/reviews/`; `features/reviews/public-service.ts` solo expone `listFeaturedReviews` para home; JSON-LD del PDP no incluye `aggregateRating` ni `review`.
- **Impacto**: Customer en PDP no ve reseñas del producto que está mirando. Google rich results sin estrellas en SERP → CTR ~30% menor (estudio Search Engine Land 2023). Cuando lleguen ventas reales, no hay UI para mostrar reseñas reales — necesita ser construido antes del lanzamiento.
- **Recomendación**: 1) Crear `<ProductReviews>` componente para PDP (lista paginada + form para clientes con `OrderItem` de este product). 2) Agregar `listReviewsByProduct` + `getProductAggregateRating(productId): { avg, count }` en `features/reviews/public-service.ts`. 3) Inyectar `aggregateRating` en JSON-LD del PDP cuando `count >= 3`. 4) Mostrar estrellas en `<ProductCard>` (compact). 5) Decidir si dejar los 36 demo (Lucy los puede borrar con `DELETE WHERE comment LIKE '%[DEMO]%'` como dice el seed) o reemplazarlos.
- **Horas estimadas**: 10
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — decidir política de seed demo (limpiar todo, o etiquetar UI cuando son demo, o dejar y esperar reales). Y si quiere que se acepten reviews con foto (ya soportado en schema `Review.images String[]`).

### [P1] CAT-005 — `calendario-mes-a-mes-fotos` tiene 1 variant `Default {}` — viola mandato variantes productivas
- **Categoría**: gap
- **Evidencia**: query a DB muestra `slug: "calendario-mes-a-mes-fotos", kind: "CALENDAR_PHOTO_MONTH", vCount: 1, attributes: {}`. Variant `name: "Default"`. Es el único de los 8 activos así.
- **Impacto**: Producto vendible sin opciones de cantidad/tamaño. El `personalizationSchema` debería decir cuántos slots tiene (12 meses + 1 hero) y las attributes deberían reflejar el kind. Inconsistente con el resto del catálogo.
- **Recomendación**: Lucy decide si el calendario tiene N variantes (ej. cantidad de meses, formato A4 vs A5, magnético vs adhesivo). Si solo hay una opción real, dejar `vCount=1` pero darle un `name` significativo y `attributes` no-vacío.
- **Horas estimadas**: 1
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — definir si el calendario tiene variantes o es producto fijo.

### [P1] CAT-006 — 4 de 8 productos sin imágenes en producción
- **Categoría**: gap
- **Evidencia**: `abecedario-magnetico-espanol` (0 imgs), `abecedario-magnetico-ingles` (0), `separadores-predisenados` (0) y `separadores-personalizables` (inactivo, 0). El resto tienen 1-2 imgs.
- **Impacto**: ProductCard y PDP renderizan empty state (gradient + Sparkles icon). Para `personalizationKind=NONE` (separadores-predisenados) el cliente no ve qué compra. SEO image alt vacío daña indexación visual.
- **Recomendación**: ACCIÓN HUMANA REQUERIDA — Lucy sube las fotos pendientes. Bloqueante de lanzamiento.
- **Horas estimadas**: 2 (procesar imágenes + subir a Supabase + actualizar DB)
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — fotografiar/encontrar y subir imágenes de los 4 productos.

### [P1] CAT-007 — Búsqueda con filtros aplica filtros client-side post-fetch + ignora ocasion+destacados
- **Categoría**: bug
- **Evidencia**: `apps/web/app/productos/page.tsx:92-115`. Cuando `q.length >= 2`, llama `searchStorefrontProducts(q)` (top 8 SQL) y luego `.filter(...)` en JS sobre `categoria`, `personalizable`, `descuento`, `minPrice`, `maxPrice` — pero `ocasion` y `destacados` quedan fuera. Y el límite de 8 results del SQL significa que el filtrado por precio puede dejar 0-1 resultados.
- **Impacto**: Si el cliente busca "fotoiman" + filtra por ocasion "matrimonio", el filtro de ocasion se ignora. Y si busca con filtro de precio en algo que matchea 50 productos, ve top-8 luego filtrados.
- **Recomendación**: Pasar los filtros estructurados al SQL de búsqueda (extender `searchStorefrontProducts` con un `filters` arg que añada `AND p."isPersonalizable"=true` etc. al WHERE) o, alternativamente, subir el LIMIT a 50-100 y filtrar en JS con paginación correcta.
- **Horas estimadas**: 3
- **Acción humana Lucy**: ninguna

### [P1] CAT-008 — Sin caching en queries públicas — riesgo de N+1 y latencia con tráfico real
- **Categoría**: risk
- **Evidencia**: `features/products/public-service.ts:12` comenta "acá es donde se mete cache con unstable_cache + revalidateTag('products')" pero NO está implementado. `productos/page.tsx`, `producto/[slug]/page.tsx`, `sitemap.ts`, `robots.ts` son `dynamic = "force-dynamic"`. Cada visita al storefront = 1-3 queries Prisma. Cada crawler hit al sitemap = full table scan.
- **Impacto**: Costo de DB en producción + p95 alto en arranque productivo. Doc dice "rate limit y cache en Postgres durante dev y arranque productivo" (CLAUDE.md mandato #11).
- **Recomendación**: Envolver `listStorefrontCategories`, `getStorefrontPriceRange`, `listStorefrontProducts(limit-mode)` con `unstable_cache(..., ['storefront-products'], { tags: ['products'], revalidate: 60 })` y agregar `revalidateTag('products')` en createProduct/updateProduct/softDeleteProduct/restoreProduct del admin service. Same para `listOcasiones` (ya lo hace) y `listTemplatesByProduct` (ya). Sitemap puede ser `revalidate: 3600`.
- **Horas estimadas**: 4
- **Acción humana Lucy**: ninguna

### [P1] CAT-009 — `/d/[token]` (share design público) no existe — M.3.b.E no implementado
- **Categoría**: gap
- **Evidencia**: `find apps/web/app -type d -name "d"` retorna vacío. No hay `publicShareToken` en `Design` schema. No hay `navigator.share` ni copy-link ni botón Share en `studio-toolbar.tsx`. README dice "M.3.b.E share" como roadmap.
- **Impacto**: El Estudio no tiene viralidad: cliente no puede mandar "mira mi diseño antes de comprarlo" a su pareja por WhatsApp para validación. Pérdida de growth loop.
- **Recomendación**: Para post-launch (P1 está bien). Crear `Design.publicShareToken String? @unique`, route `app/d/[token]/page.tsx` que renderiza preview readonly + CTA "personalizar el tuyo".
- **Horas estimadas**: 6
- **Acción humana Lucy**: ninguna

### [P1] CAT-010 — Robots disallow `/productos?*` choca con sitemap que incluye `productos?categoria=`
- **Categoría**: bug
- **Evidencia**: `app/robots.ts:38` `disallow: "/productos?*"`. `app/sitemap.ts:69-74` incluye `${baseUrl}/productos?categoria=${c.slug}` como entradas.
- **Impacto**: Conflicto de señales SEO. Google verá la URL en el sitemap pero disallow en robots → no la indexa. Lucy pierde landing pages de cola larga ("imanes para boda", "imanes para baby shower" etc.).
- **Recomendación**: Decidir estrategia: (a) crear rutas amigables `app/productos/[categoria]/page.tsx` (parcialmente existe `[categoria]/[subcategoria]`) y remover el sitemap de query strings, o (b) permitir `categoria` en robots con `disallow: ["/productos?q=*", "/productos?orden=*", "/productos?minPrice=*"]` específico.
- **Horas estimadas**: 4 (opción a, más sólida)
- **Acción humana Lucy**: ninguna

### [P1] CAT-011 — Plantillas premade (mode=PREMADE) no existen — productos kind=NONE muestran TemplatesStrip vacío
- **Categoría**: gap
- **Evidencia**: DB count `tplPremade: 0`. `<TemplatesStrip>` con `mode="PREMADE"` (para productos `kind=NONE`, ej. `separadores-predisenados`) devuelve [] y se render como `return null`. Decisión PLAN_CATALOG_V2 5.2 / 5.7 prometía templates premade compra-tal-cual.
- **Impacto**: Para los productos no-personalizables, el cliente entra al PDP y solo ve "Añadir al carrito" sin opción de elegir entre 4-8 diseños listos. Esto es el camino #1 de la decisión 5.1 (PREMADE = comprar diseño listo).
- **Recomendación**: Seedear plantillas PREMADE para los productos `kind=NONE` (separadores predisenados al menos 4-8 diseños). O reformular UI cuando no hay premade.
- **Horas estimadas**: 4 + assets
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — Lucy define los 4-8 diseños premade visibles para separadores.

### [P2] CAT-012 — Sin rating estrellas en ProductCard ni PDP — pierde conversión visual
- **Categoría**: improvement
- **Evidencia**: grep `rating|stars|aggregateRating` retorna vacío en `app/producto/`, `components/product-detail/`, `components/product-card.tsx`. Solo `reviews-carousel.tsx` renderiza estrellas en el home.
- **Impacto**: Cliente en listing no ve cuál producto está mejor reseñado. Patrón industria (Mercado Libre, Amazon, Shopify) — estrellas en card son P1 para conversión.
- **Recomendación**: Agregar `avgRating`/`reviewCount` al `StorefrontProductCard` (precalculado en query). Renderizar `<RatingStars value={rating} count={count} />` en ProductCard y al inicio del PDP. Incluir `aggregateRating` en JSON-LD del PDP.
- **Horas estimadas**: 6
- **Acción humana Lucy**: ninguna (después de tener reviews reales)

### [P2] CAT-013 — No hay 3D fridge preview ni escenas reales (M.3.b.B incompleto)
- **Categoría**: gap
- **Evidencia**: `find public/scenes` no existe. `grep three\|Three.js` no encuentra dependencia. README del estudio menciona el roadmap pero no se construyó. CLAUDE.md mandato dice "vista 3D en nevera (Three.js)" como diferenciador.
- **Impacto**: El Estudio tiene realismo shape-aware (sombra + finish + safe-area) pero no la vista "tu imán en una nevera real" — pérdida de wow factor vs magneticas.cl que no lo tiene tampoco.
- **Recomendación**: Post-launch. Opción simple: 4 fotos JPG de neveras reales en `/public/scenes/`, overlay del PNG del imán con `mix-blend-mode` + sombra. Opción premium: Three.js con plano nevera + textura imán como decal.
- **Horas estimadas**: 16 (simple) / 60 (Three.js)
- **Acción humana Lucy**: ACCIÓN HUMANA REQUERIDA — Lucy decide si vale Three.js (60h) o se hace mockup simple.

### [P2] CAT-014 — RecommendationLog no se persiste — decisión 6.10 no cumplida
- **Categoría**: tech-debt
- **Evidencia**: tabla `RecommendationLog` existe en schema. `app/api/catalog/recommend/route.ts:46` llama `recommendProducts(...)` y devuelve. No hay `prisma.recommendationLog.create(...)` en ese path. Decisión PLAN_CATALOG_V2 6.10 dice "cada call... crea un log".
- **Impacto**: Cuando Lucy quiera evolucionar el scoring (decisión 6.2 dice "tunear pesos"), no tendrá datos de CTR ni conversión. La tabla es deadcode.
- **Recomendación**: Agregar `await prisma.recommendationLog.create({ data: { sessionId, customerId, queryType: 'wizard', queryParams: ..., suggestedSlugs: results.map(r => r.slug), shownAt: new Date() } })` antes del `return NextResponse.json(...)`. Loguear async (no await) para no bloquear respuesta.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P2] CAT-015 — Search dropdown muestra `basePrice` sin "desde" cuando producto tiene variants
- **Categoría**: bug
- **Evidencia**: `features/products/public-service.ts:336-414` `searchStorefrontProducts` no devuelve `variantCount` ni `minVariantPrice`. `components/global-search.tsx:137` muestra `formatCOP(p.basePrice)`. ProductCard del listing sí muestra "desde $X" cuando `minVariantPrice < basePrice`.
- **Impacto**: UX inconsistente. Producto que en listing dice "desde $15000" en search dice "$20000".
- **Recomendación**: Agregar al SQL `( SELECT MIN(v.price) FROM "ProductVariant" v WHERE v."productId" = p.id AND v."deletedAt" IS NULL AND v.price IS NOT NULL ) AS "minVariantPrice"`, `( SELECT COUNT(*) FROM "ProductVariant" v WHERE v."productId" = p.id AND v."deletedAt" IS NULL ) AS "variantCount"` y propagar a `SearchResult`.
- **Horas estimadas**: 2
- **Acción humana Lucy**: ninguna

### [P2] CAT-016 — `Studio` 0% test coverage (7k LOC sin tests)
- **Categoría**: risk
- **Evidencia**: `find apps -name "*.test.*" -o -name "*.spec.*"` = 5 archivos, ninguno toca `app/estudio/`, `features/personalization/`, `features/products/public-service.ts` o `variant-schemas.ts`. README del estudio promete cobertura ≥80%.
- **Impacto**: El módulo más complejo del proyecto (paradigma slot-por-imán, V1→V2 canvas-migrate, finalize 2-fases, Konva ownership, FormData binary) no tiene safety net. Cada cambio en `lib/store.ts` o `canvas-migrate.ts` puede romper diseños guardados existentes.
- **Recomendación**: Mínimo viable pre-launch: unit tests de `canvas-migrate.ensureCanvasV2`, `grid-layout.generateGridLayout`, `parsePhotoProductConfig`, `parseVariantAttributes`. E2E playwright: 1 happy path "subir foto → asignar a slot → finalize → llega al carrito". P0 para sustentabilidad.
- **Horas estimadas**: 16
- **Acción humana Lucy**: ninguna

### [P3] CAT-017 — Sitemap/robots `force-dynamic` sin razón
- **Categoría**: improvement
- **Evidencia**: `app/sitemap.ts:36` y `app/robots.ts:20` ambos `export const dynamic = "force-dynamic"`. El sitemap puede ser ISR/cache 1h.
- **Impacto**: Cada crawler hit dispara DB query.
- **Recomendación**: `export const revalidate = 3600` en sitemap. Robots es estático en realidad, puede ser export const.
- **Horas estimadas**: 0.5

### [P3] CAT-018 — Filter sidebar usa `select` HTML para orden — inconsistente con CategoryFilter custom
- **Categoría**: improvement
- **Evidencia**: `components/products-filters.tsx:280-294` usa `<select>` nativo para "Ordenar por". El comentario explica que reemplazaron el `<select>` de categoría por radiogroup para no capturar scroll. Mismo problema potencial.
- **Impacto**: Inconsistencia visual + el `<select>` rompe el lenguaje shadcn radix-nova. Lucy en mobile puede tener el mismo problema de scroll capture.
- **Recomendación**: Reemplazar por `<Select>` de shadcn o radiogroup similar a CategoryFilter.
- **Horas estimadas**: 1

### [P3] CAT-019 — README del Estudio dice afirmaciones falsas (30 SVGs, Lighthouse ≥95)
- **Categoría**: docs-drift
- **Evidencia**: `app/estudio/[slug]/README.md` dice "30 SVG mockups custom diseñados a mano, no placeholders" (real: 2 SVGs), "Lighthouse desktop ≥ 95, mobile ≥ 90" (sin medir), "unit cobertura ≥ 80%" (real: 0).
- **Impacto**: Documentation drift confunde a la próxima sesión y oculta gaps reales.
- **Recomendación**: Sincronizar README con realidad o marcar secciones como "objetivo no alcanzado todavía".
- **Horas estimadas**: 0.5

## Resumen final
El catálogo + PDP + Estudio están funcionalmente sofisticados (paradigma slot-por-imán es genuinamente innovador y bien implementado, búsqueda fuzzy es robusta, variantes son productivas), pero hay tres bloqueantes P0 puros antes del lanzamiento: (a) assets SVG faltantes que rompen visualmente la promesa de "Estudio premium", (b) bug en `listTemplatesByProduct` que vacía la sección TemplatesStrip en 7/8 productos, (c) voseo argentino diseminado contradice la identidad colombiana de la marca. El bloqueante P0 colateral es reviews 100% demo + cero UI de reviews en PDP — sin estrellas no hay rich snippets ni prueba social. Después de estos cuatro fixes (~32-40h + decisiones de Lucy sobre fotos faltantes/templates), el catálogo está listo. M.3.b.E (share) y vista 3D nevera son post-launch sin urgencia.