I have enough. Now I'll provide the honest analysis.

# Dimensión 5: Cambios al modelo de datos

## Mapa de acoplamientos actuales (verificado en código)

Antes de evaluar opciones, esto es lo que el schema y la app tienen hoy:

- `Product.categoryId` es **obligatorio** (1:N, `onDelete: Restrict`) — `schema.prisma:335-336`. Un producto vive en exactamente UNA categoría.
- `Category` es jerárquica (parent → children, self-relation), con `activeFrom`/`activeUntil`, `richDescription`, `visibleFilters`, `defaultSort`, `featuredProductSlug` — `schema.prisma:244-284`. Lleva mucho metadata de presentación de grid.
- `ProductOcasionTag` es N:N con `rationale` extra por par — `schema.prisma:1158-1170`. Tiene `@@id([productId, ocasionTagId])` como PK compuesta.
- `OcasionTag` lleva `monthHint`, `suggestedQuantityRange`, `description` — `schema.prisma:1126-1153`. Pensado para el bot AI Fase 5+.
- `Coupon.appliesToCategories: String[]` y `appliesToProductSlugs: String[]` — slugs sueltos, NO FK — `schema.prisma:571-574`. Si renombrás un slug se rompe (silenciosamente).
- `Review.productId` FK directa con `onDelete: Cascade` — `schema.prisma:622-623`.
- Frontend público usa rutas `/productos/[categoria]/[subcategoria]` (jerárquico) y `/ocasion/[slug]` (transversal) — verificado en `app/productos/[categoria]/` y `app/ocasion/[slug]/`. Son experiencias distintas.
- `lib/catalog.ts:299-320` filtra por `categorySlug` (con fallback a `parent.slug`) y por `ocasionSlug` por separado. La query une ambos campos del producto con AND.
- Seeds existen para ambos (`seed-catalog-v2.mjs`, `seed-ocasiones.mjs`) y hay 9 productos productivos hoy.

Conclusión del mapa: **categoría y ocasión NO son sinónimos en el código**. Categoría = navegación jerárquica + presentación (cómo se ve el grid). Ocasión = tag transversal con intención (para qué sirve, qué mes, qué cantidad sugerida). Lo que se solapa en la **UI admin** (Lucy ve dos páginas que dicen "etiquetá productos") NO se solapa en datos.

---

## Opción A: Mantener Category + OcasionTag separados (status quo)

- **Schema:** sin cambios.
- **Migración:** ninguna.
- **Pros:**
  - Cero riesgo, cero downtime, cero rewrite de queries en `lib/catalog.ts`, `features/products/*`, `app/productos/[categoria]/`.
  - Los seeds, redirects 301 productivos, sitemap (`app/sitemap.ts:56`) siguen funcionando.
  - Conceptualmente correcto a nivel de datos (son cosas distintas).
- **Contras:**
  - La confusión NO está en datos, está en la sidebar admin: dos páginas que para Lucy se parecen.
  - El "trabajo cognitivo" de Lucy se queda igual: ¿esto va de categoría o de ocasión?
- **Esfuerzo:** 0h.

---

## Opción B: Unificar Category + OcasionTag en `Collection`

Schema propuesto (boceto):

```
enum CollectionType { HIERARCHICAL, SEASONAL, MANUAL, OCCASION }
model Collection {
  id, slug, name, type, parentId, monthHint, activeFrom, activeUntil,
  richDescription, visibleFilters, defaultSort, suggestedQuantityRange, ...
}
model ProductCollection { productId, collectionId, rationale }
```

- **Migración:**
  - 1 migration que crea `Collection` + `ProductCollection`.
  - Backfill: `INSERT INTO Collection SELECT ... FROM Category` (con `type=HIERARCHICAL`) y `... FROM OcasionTag` (con `type=OCCASION`).
  - Re-mapear `Product.categoryId` a `ProductCollection` (esto cambia la cardinalidad: Product pasa de 1-N a N-N con colecciones). O dejar `Product.primaryCollectionId` para preservar "categoría principal".
  - Drop `Category`, `OcasionTag`, `ProductOcasionTag` (DESTRUCTIVO — irreversible sin backup).
- **Código a tocar (lo que detecté):**
  - `lib/catalog.ts` — `getCategoryTree`, `getCategoryBySlug`, queries con `where.category` (líneas 128, 179, 299-320, 638-732). **Reescribir.**
  - `features/categories/service.ts` + `features/ocasiones/service.ts` — borrar ambos, crear `features/collections/service.ts`.
  - `features/products/service.ts:325` + `public-service.ts:90` — listado de categorías. **Reescribir.**
  - `features/products/schemas.ts` — `categoryId` en input de creación de producto. **Reescribir.**
  - `app/admin/(panel)/productos/product-form.tsx` — selector de categoría. **Reescribir.**
  - `app/productos/[categoria]/[subcategoria]/` y `app/ocasion/[slug]/` — decidir si se mantienen las URLs públicas separadas (para SEO + UX) o se unifican en `/coleccion/[slug]`. Si se unifican: redirects 301 masivos.
  - `app/sitemap.ts:56` — cambiar fuente.
  - `Coupon.appliesToCategories: String[]` — semántica cambia (¿ahora es `appliesToCollections`?).
  - `app/admin/(panel)/dashboard/page.tsx:68,77` — métricas.
  - `components/shop-mega-menu.tsx`, `components/cart-cross-sell.tsx`.
  - 2 routes API: `/api/catalog/ocasiones/route.ts`, `/api/catalog/ocasiones/[slug]/route.ts`.
  - Seeds: `seed-catalog-v2.mjs`, `seed-ocasiones.mjs` — reescribir.
- **Pros:**
  - 1 sola página admin "Colecciones" con filtros por tipo.
  - Mental model unificado para Lucy desde el primer click.
  - Habilita ideas futuras (ej. "Colección manual: Lo nuevo de junio") sin schema nuevo.
- **Contras:**
  - Migración GRANDE en datos + código + URLs públicas.
  - Pierde tipado: hoy un cupón sabe que aplica a "category slug" (concepto navegacional). Con Collection unificada, ¿un cupón "Día de la Madre" aplica al producto solo si está en la ocasión, o también si está en una categoría hermana? Hay que decidir reglas de negocio nuevas.
  - Pierde la limpieza de tener tablas con responsabilidades claras (hoy `Category` es ALTO acoplamiento al render del grid; `OcasionTag` es ALTO acoplamiento al bot AI).
  - Riesgo SEO real: 30+ URLs `/productos/[cat]` ya están en Google. Si las cambiás a `/coleccion/...`, necesitás redirects 301 (el sistema `UrlRedirect` existe, pero hay que poblarlo y monitorear ranking 30-90 días).
- **Esfuerzo realista:** 14–22h (schema + backfill verificado + reescribir 4 services + 2 routes API + 6 componentes + seeds + tests RLS + redirects + QA manual). Sumá 2–4h más si querés mantener URLs públicas separadas (más complejo en código pero más seguro SEO).

---

## Opción C: Mantener separados pero unificar UI ("Colecciones" como contenedor visual)

- **Schema:** sin cambios.
- **UI:**
  - Sidebar muestra UN solo item "Colecciones" en lugar de dos.
  - Página `/admin/colecciones` con 2 tabs: "Permanentes (jerarquía)" y "Por ocasión".
  - Cada tab usa el service existente (`listCategories`, `listOcasionTags`) sin cambios.
  - Form de producto sigue teniendo dos campos pero agrupados visualmente bajo "Colecciones" con copy explicativo (tooltip "Permanente = dónde vive el producto. Ocasión = para qué momento sirve").
- **Pros:**
  - Cero migración, cero riesgo SEO, código intacto.
  - Lucy ve UN concepto en la sidebar.
  - Si después la diferencia conceptual molesta más de lo que ayuda, se puede hacer Opción B con la decisión ya tomada (no es excluyente).
- **Contras:**
  - La distinción interna sigue: Lucy aprende que hay 2 tipos. Es la verdad del negocio (mes/cantidad VS jerarquía), pero ella la ve.
  - No habilita "colección manual arbitraria" sin schema nuevo.
- **Esfuerzo realista:** 4–6h (sidebar + página tab + copy + form rediseño visual). Reversible en cualquier momento.

---

## Reviews — migración para tab contextual en Producto

- **Schema:** sin cambios. `Review.productId` ya es FK directa (`schema.prisma:622-623`).
- **UI:**
  - Agregar tab "Reseñas" dentro de `/admin/productos/[id]` (sub-page) con `prisma.review.findMany({ where: { productId } })`.
  - Mantener `/admin/resenas` como **bandeja global de moderación** (filtros por estado, featured toggle, búsqueda).
  - Razón para mantener ambos: cuando una reseña entra nueva, Lucy quiere ver TODAS las pendientes en un lugar — no entrar producto por producto. Reviews tiene flujo de moderación propio.
- **Esfuerzo:** 2–3h.

---

## Cupones — migración para "Promociones"

- **Schema:** sin cambios.
- **UI:** solo cambio de label en sidebar (`Cupones` → `Promociones`) o reagrupación dentro de nuevo grupo "Promociones". Trivial.
- **Caveat:** si se elige Opción B (Collection unificada), `Coupon.appliesToCategories` cambia semántica y hay que migrar también los registros existentes (hoy 0 cupones productivos según contexto, verificar antes).
- **Esfuerzo:** 0.5h (sin Opción B) o +1h (con Opción B).

---

## Inventory como módulo top

- **Schema:** sin cambios. `ProductVariant.stock` + `InventoryLog` ya existen (`schema.prisma:361-403`).
- **Migración del sub-path:** mover `/admin/productos/[id]/variants` a `/admin/inventario/[productId]` o crear `/admin/inventario` con vista agregada cross-product.
- **Service nuevo:** `listVariantsAcrossProducts({ lowStock?, search?, sortByStock? })` — pega `prisma.productVariant.findMany({ include: { product: true } })` con filtros.
- **Beneficio claro para Lucy:** hoy si quiere ver "qué hay con stock bajo" tiene que abrir cada producto. Una página inventario lo resuelve en 1 click.
- **Esfuerzo:** 3–5h (página listado + filtros + edición rápida inline + breadcrumb desde producto).

---

## Recomendación honesta

**Opción C + Reviews contextual + Inventario top + Cupones rename = el plan correcto para Lucy hoy.**

Razones:

1. **Lucy tiene 9 productos productivos y crece a ~40-50 al lanzar.** A esa escala, la migración B es desproporcionada vs el problema real (que es de UX admin, no de datos). El schema separado es técnicamente correcto.

2. **El "problema de duplicación" que Lucy siente es de UI, no de modelo.** Categoría y Ocasión miden cosas distintas en el negocio:
   - Categoría responde "¿dónde lo busca el cliente?" (jerarquía navegacional).
   - Ocasión responde "¿para qué evento sirve?" (intención + mes + cantidad sugerida para bot AI).
   - Unificar en una tabla `Collection` con `type` enum esconde esa distinción con tipos, pero no la elimina — Lucy igual va a tener que decidir el tipo al crear.

3. **Riesgo SEO real con Opción B.** Las URLs `/productos/[categoria]` están en sitemap.xml y probablemente indexadas. Romperlas para ahorrarle a Lucy un click en sidebar no compensa.

4. **Opción C es reversible.** Si después de 2-3 meses de uso real Lucy sigue sintiendo fricción, hacemos B con datos reales de cómo la usó (qué tipos creó más, qué solapamientos reales aparecieron). Hoy estamos decidiendo a ciegas.

5. **Reviews contextual + Inventario top + Cupones → "Promociones" son ganancias claras sin migration.** Cada uno simplifica un flujo cotidiano de Lucy.

**Esfuerzo total Opción C completa:** 10–15h, sin migration, sin riesgo SEO, reversible.

**Cuándo SÍ ir por Opción B:** si Lucy en 3-6 meses pide "quiero una colección manual arbitraria que no sea ni categoría ni ocasión" (ej. "Lo nuevo de junio", "Selección Lucy", "Sale flash") — eso es señal real de que `Collection` con `type` agrega valor. Hoy no hay esa señal.

**Decisión que Lucy tiene que tomar antes de avanzar:**

- ¿Aprueba Opción C como ruta (no migration, solo UI + reorg sidebar)?
- ¿Querés conservar `/admin/resenas` como bandeja global ADEMÁS del tab por producto, o reemplazar?
- ¿Cupones se renombran a "Promociones" o se agrupan junto con un futuro módulo de marketing más amplio?

Archivos relevantes verificados: `/home/ansible/workspaces/lucams_shop/packages/db/prisma/schema.prisma:244-403,558-648,1126-1170`; `/home/ansible/workspaces/lucams_shop/apps/web/features/categories/service.ts`; `/home/ansible/workspaces/lucams_shop/apps/web/features/ocasiones/service.ts`; `/home/ansible/workspaces/lucams_shop/apps/web/lib/catalog.ts:128-320,638-732,859-885`; `/home/ansible/workspaces/lucams_shop/apps/web/app/productos/[categoria]/`; `/home/ansible/workspaces/lucams_shop/apps/web/app/ocasion/[slug]/`; `/home/ansible/workspaces/lucams_shop/apps/web/app/sitemap.ts:56`.