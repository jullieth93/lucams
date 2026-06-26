I have enough. Now let me write the analysis.

# Dimensión 2: Duplicación conceptual y mental model

> Auditoría honesta. Tres veredictos claros al final.

---

## ¿Category vs OcasionTag — son lo mismo?

### Diferencias de schema (verificadas)

| Atributo | `Category` (schema.prisma:244-284) | `OcasionTag` (schema.prisma:1126-1153) |
|---|---|---|
| Estructura | Jerárquica con `parentId` (Subcategorías) | Plana, sin jerarquía |
| Relación con Product | 1:N obligatoria — `Product.categoryId` NOT NULL (schema.prisma:335) | N:M vía pivot `ProductOcasionTag` con `rationale` propio (schema.prisma:1158-1170) |
| Rich content para bot | `richDescription` + `useCase` + `featuredProductSlug` | `description` + `monthHint` + `suggestedQuantityRange` |
| Comportamiento URL/SEO | `/productos/<categoria>/<subcategoria>` (PLAN_CATALOG_V2 1.3) | `/productos?ocasion=matrimonio` querystring (decisión 6.8) |
| Filtros que controla | `visibleFilters[]`, `defaultSort` por categoría (PLAN_CATALOG_V2 7.6, 7.10) | Solo es filtro, no controla filtros |
| Estacionalidad | `activeFrom`/`activeUntil` (sub-cats estacionales, PLAN_CATALOG_V2 2.9) | `monthHint` (1-12) auto-rota menú header |
| Mecánica cupón | Cupones se restringen a `appliesToCategories[]` (slugs) — schema.prisma:571 | NO se referencian en `Coupon` (gap real) |

### Cuándo usar cada uno (intent del PLAN)

- **Categoría = qué ES el producto.** "Fotoimanes Polaroid" es un **tipo** de fotoimán. Es la familia merchandising — produce, cuesta, factura por categoría. PLAN_CATALOG_V2 decisión 1.5 lo dice: "tags transversales que **cruzan** categorías". La categoría es la columna vertebral de catálogo y se elige una sola al crear el producto.
- **Ocasión = para qué SIRVE el producto.** "Matrimonio" no es un tipo de producto; es un contexto de regalo. Un mismo Set Fotoimán sirve para matrimonio, aniversario y día del padre. Plan decisión 1.5: "aumenta discovery cruzado. Cliente buscando matrimonio ve productos relevantes de 4-5 categorías".

### Caso real — "Set Fotoimanes Polaroid"

- `Product.categoryId` = id de "Fotoimanes" (lo único razonable — es un fotoimán).
- `ProductOcasionTag` rows: { Aniversario, rationale: "12 fotos = 1 por mes del primer año juntos" }, { Cumpleaños, rationale: "perfecto para regalar momentos compartidos" }, { Día Madre, rationale: "..." }.

**¿Le hace clic mentalmente a Lucy?** Sí, **si la sidebar y la PDP refuerzan la metáfora**. Categoría = familia de producto (sustantivo). Ocasión = momento de uso (verbo / contexto). En `admin-nav.ts:121-145` ambos están dentro del grupo "Catálogo" con icons distintos (Layers vs Tag), lo cual ayuda. El riesgo no es conceptual, es de **vocabulario admin**: si Lucy ve "Categorías" y "Ocasiones" sin un sub-título explicativo en la pantalla ("¿Cuál uso?"), va a dudar la primera vez. Una vez entendido, no las confunde.

### Cómo lo resuelven los referentes del mercado

- **Shopify** — Una sola entidad: **Collection** (manual o smart). No diferencia "categoría" de "ocasión". Lo resuelve con dos *tipos* de collection: `manual` (Lucy elige productos) y `automated` con reglas (cualquier producto con tag `matrimonio` entra). El producto tiene un campo libre `product_type` (string) + `tags[]` libres. Resultado: simple para arrancar, frágil a largo plazo (un typo en el tag rompe el filtro).
- **Etsy** — Dos entidades separadas y distintas: **Sections** (la tienda las gestiona, jerárquica simple, es la "categoría" del shop) + **Tags** transversales (palabras clave que el algoritmo de búsqueda usa, no aparecen en navegación). Más cercano a Lucams_shop: sección = qué es, tags = para qué.
- **Magneticas.cl** — Solo categorías planas + filtro por temática como tags ocultos. No tienen "ocasiones" como entidad navegable. Lucams_shop ya supera a magneticas en esta dimensión (decisión 6.8 hace `/productos?ocasion=matrimonio` first-class en el mega-menú).

### Veredicto honesto

**Son entidades distintas, NO duplicadas.** El schema actual está bien modelado y refleja una decisión consciente del PLAN_CATALOG_V2 (decisiones 1.5, 2.10, 6.8). La diferencia es real:

- Categoría responde "¿en qué stand está esto en mi tienda física?" — produce, cuesta, factura, decide flujo de personalización.
- Ocasión responde "¿cuándo lo regalo?" — pura ayuda al discovery + recomendación bot.

**NO** son "la misma con campo es estacional". `activeFrom`/`activeUntil` en `Category` (schema.prisma:265-266) ya cubre estacionalidad de la sub-cat (ej. "Sub-categoría Día del Padre solo activa junio"). Las ocasiones existen para que un producto **permanente** (Set Fotoimanes) aparezca filtrable en N momentos distintos del año sin duplicar el producto.

**El problema NO es el modelo. Es la pedagogía dentro del admin.** Recomendación: header en `/admin/ocasiones` con copy *"Las ocasiones son etiquetas transversales. Un producto puede estar en N ocasiones a la vez (Set Fotoimanes = Aniversario + Día Madre + Cumple). Distinto a Categoría, que define qué tipo de producto es."*

---

## ¿Producto vs ProductVariant — Lucy entiende esta capa?

### Caso real — "Set Fotoimanes Polaroid"

El schema actual modela 1 producto + N variantes:

- `Product` ("Set Fotoimanes Polaroid", schema.prisma:286-359) — slug único, basePrice, richDescription, ocasionTags, templates compartidos.
- `ProductVariant` (schema.prisma:361-390) — `name: "Set 6"`, `sku`, `price` override nullable, `stock`, `attributes` Json (`{ size: 6, shape: "polaroid" }`).

### ¿1 producto con 4 variants o 4 productos hermanos?

**1 producto con 4 variants es correcto.** Razones:

1. **SEO + URL** — Una sola PDP `/productos/set-fotoimanes-polaroid` concentra reseñas, autoridad y backlinks. Si fueran 4 productos, dividen ranking y duplican content.
2. **Cart UX** — Cliente personaliza UNA vez y elige cantidad. No quiere navegar 4 PDPs distintas.
3. **Reviews semánticas** — `Review.productId` apunta a Product. Si fueran 4 productos, una reseña "el imán quedó perfecto" no es compartible entre tamaños del mismo set.
4. **Plantillas compartidas** — `PersonalizationTemplate.productId` (schema.prisma:1089) apunta a Product, no a variant. La plantilla "Marco corazón" aplica a Set 6/9/12 igual.
5. **Coleccionables uniformes** (PLAN_CATALOG_V2 decisión 3.4) — todos los Universos son x4/x6/x9. Si fueran productos hermanos, multiplicaría el catálogo por 3.

**Decisión 3.x del PLAN_CATALOG_V2 ya lo formalizó:** pricing `LINEAR` (precio absoluto por variant) + `Polaroid refactoreado a multi-dim 9 variants`.

### ¿UX actual lo expone bien? — Honestidad

Mirando `apps/web/app/admin/(panel)/productos/`:

- `productos/page.tsx` — lista
- `productos/[id]/page.tsx` — editor 5 tabs
- `productos/[id]/variants/` — **ruta separada** ← acá está el problema

Sub-path `/productos/[id]/variants` esconde la única decisión recurrente de operación. Lucy todos los días va a tocar stock por variante, no `richDescription`. Que esté en un sub-path y no en una tab del form principal **invierte la frecuencia de uso**. El comentario del schema (línea 366-368) lo confirma: `description` de variant ("Set 12 ideal para baby shower con muchos invitados") es contenido que Lucy escribe seguido — debería editarse junto al producto, no en otro screen.

### ¿A2.1 ProductStockPanel cierra el gap?

No lo verifiqué en este pasaje (no está en el set de archivos que abrí), pero la presencia del archivo `stock-actions.ts` y `quick-actions.tsx` dentro de `/productos/` sugiere que ya hay un quick-edit de stock en la lista. Eso es **parche, no solución**. El gap mental es: "edito el producto → veo las variantes → toco stock/precio inline". Hoy: "edito el producto → recuerdo que stock está en otra URL → navego → cambio → vuelvo".

**Veredicto:** El modelo es correcto. La UX actual fragmenta lo que debería ser una sola pantalla. Recomendación de reestructura (no fix puntual): la PDP admin debe ser **un editor maestro/detalle** — encabezado con campos del Product + sección lateral o pestaña "Variantes" con tabla editable inline (stock, price, name, isActive). El `/variants` sub-path se elimina.

---

## ¿Cupones son "Comercial" o "Catálogo"?

### Mental model — los dos a la vez

- **Argumento "Catálogo":** un cupón restringe a categorías (`appliesToCategories`, schema.prisma:571) y productos (`appliesToProductSlugs`, schema.prisma:574). Cambia el precio efectivo del catálogo. Cuando Lucy crea "MAMA2026 -15% en Fotoimanes Corazón", está modificando la oferta del catálogo.
- **Argumento "Comercial":** un cupón también es una palanca de marketing (envío gratis genérico, código en flyer Instagram, welcome coupon). Tiene vigencia, usos máximos, distribución — es una **campaña**, no un dato del producto. PLAN_CATALOG_V2 decisión 8.1 lo agrupa en Comercial junto a Mayorista B2B.

### Honestidad

Esta NO es una duplicación, es una **decisión de taxonomía discutible pero ya tomada y razonable**. Catálogo = datos estables del producto; Comercial = acciones temporales de venta. Cupón encaja mejor en Comercial **siempre y cuando Lucy entienda que "Comercial" significa "campañas y promociones"**. Hoy el grupo Comercial tiene solo Cupones + Mayorista B2B (admin-nav.ts:147-167) — funciona.

**El gap real está en otro lado:** desde el editor de producto NO hay forma de ver qué cupones le aplican hoy. Lucy entra a "Set Fotoimanes Polaroid", pregunta "¿está con descuento?" — tendría que ir a `/admin/cupones`, filtrar manualmente. Eso es lo que dispara la sensación de "hay cosas mal organizadas". No es solapamiento de módulos: es falta de cross-referencing en la PDP admin.

**Veredicto:** El sidebar está bien. La pantalla de producto necesita un widget "Cupones activos sobre este producto" (read-only, link a `/admin/cupones?productSlug=X`).

---

## ¿Reseñas son "Ventas" o "Catálogo"?

### Schema — `Review` (schema.prisma:620-648)

- FK `productId` obligatoria, `customerId` opcional.
- Estado: `isApproved` (moderación) + `featured` (destacar en home).
- Snapshot `authorName`, `authorCity` para sobrevivir delete de cliente.

### Mental model

- **"Catálogo":** una reseña es contenido **de la ficha del producto**. Sin reseñas la PDP queda muda, sin social proof. Para Lucy, moderar reseñas = curar catálogo.
- **"Ventas":** una reseña es contenido **de una transacción real**. Cliente compró, cliente reseña. Es output del flujo de Ventas.

### Verdad

`admin-nav.ts:112-118` las ubica en **Ventas** junto a Pedidos, Clientes, Reclamos. Es defendible — el ciclo es post-compra. Pero operativamente, **Lucy modera reseñas cuando está pensando "qué muestro en este producto"**, no cuando está pensando "qué pedidos enviar hoy".

Comparación: Shopify pone Reseñas como app aparte (Judge.me) y eso refleja la realidad — flotan entre Productos y Clientes. Etsy las pone en cada item y NO permite una vista admin global de reseñas (cada item tiene las suyas, listadas en el editor del item).

**Veredicto:** Razonable como está, pero **subóptimo para el uso real de Lucy**. Dos mejoras posibles, en orden de impacto:

1. **Mantener "Reseñas" en Ventas para vista global** (queue de moderación, "tengo 14 sin aprobar"). Útil para sesión de admin "voy a barrer pendientes".
2. **Agregar sección "Reseñas" como tab del editor de Producto** (read-only summary + link "Ver todas las reseñas de este producto"). Permite moderar contextualizado.

Esto NO requiere mover el módulo. Solo agrega cross-link. La organización del sidebar queda. Es un fix de PDP admin, no de IA.

---

## ¿PersonalizationTemplate vs "Plantillas" placeholder?

### Lo que dice el schema

`PersonalizationTemplate` (schema.prisma:1085-1119) — modelo real con `kind` (PHOTO_PACK, etc.), `mode` (EDITABLE | PREMADE), `previewUrl`, `canvasData` (estructura Konva). Es la plantilla del Estudio de personalización: la base del canvas que el cliente edita o compra tal cual.

### Lo que dice el PLAN

- PLAN_CATALOG_V2 decisión **5.9** ("Admin `/admin/plantillas` con filtros + métricas"): "pantalla admin `/admin/plantillas` con filtros [EDITABLE / PREMADE] + métricas".
- PLAN_CATALOG_V2 decisión **8.1**: el grupo "Catálogo" del sidebar incluye **Plantillas** como pantalla.

### Lo que dice el sidebar hoy

`admin-nav.ts:129-133` — entrada "Plantillas" con badge `{ text: "Próximo", tone: "soon" }`. Es decir: **placeholder declarado en sidebar, página no implementada**. Esto es coherente con el `[...placeholder]` route group que vi en `app/admin/(panel)/[...placeholder]/`.

### Verdad

**NO hay duplicación.** El "placeholder Plantillas" del sidebar IS-A page futura para gestionar `PersonalizationTemplate`. Es el mismo concepto, solo que la página todavía no existe. No hay confusión semántica posible — solo deuda de implementación de la decisión 5.9.

Riesgo real: cuando Lucy lea "Plantillas" en el sidebar puede pensar que son **plantillas de email** (que sí existen en otra ruta: `/admin/email-templates`, admin-nav.ts:277). Mitigación trivial: renombrar la entrada del sidebar a **"Plantillas del Estudio"** o **"Diseños listos"** (más alineado a copy cliente que el PLAN llama "Camino 1 — Diseños listos" en decisión 1.9).

**Veredicto:** No es problema de IA, es problema de **label ambiguo + página inexistente**. Resolución: implementar `/admin/plantillas` según decisión 5.9 + renombrar entrada del sidebar a "Plantillas del Estudio".

---

## ¿Recomendaciones placeholder qué iba a ser?

### Verificación documental

PLAN_CATALOG_V2 decisión **6.10** (líneas 1119-1146) define qué es `/admin/recomendaciones`:

- Pantalla dashboard sobre la tabla `RecommendationLog` (schema.prisma:1175-1196, ya existe).
- Métricas: CTR por queryType (wizard / crosssell / related_pdp / api_bot), conversion rate, top búsquedas, gaps de data (productos sin ocasión asignada), efectividad del scoring.
- NO es un editor de productos relacionados. NO es bundles. NO es cross-sell manual.

**Es analítica del motor de recomendación**, alimentada por el wizard MVP (decisión 6.1) + cross-sell en cart (6.3) + related PDP (6.4) + bot futuro (6.7).

### Sidebar actual

`admin-nav.ts:137-141` — "Recomendaciones" con badge `{ text: "Fase 4", tone: "phase4" }`. Coherente: la tabla `RecommendationLog` solo se llena cuando el wizard + cross-sell estén en producción (Fase 4).

### Riesgo de confusión

"Recomendaciones" + estar en grupo "Catálogo" sugiere a Lucy "yo decido qué productos recomendar". Pero según decisión 6.2 el scoring es algorítmico (sin ML), Lucy NO edita pesos hasta Fase 5+ ("settings de pesos del scoring desde `/admin/recomendaciones`"). Mientras tanto la pantalla es **read-only analytics**.

**Veredicto:** No es duplicación. Es una pantalla de **observabilidad del motor de recomendación**, ya planeada con propósito claro, pendiente de implementación porque depende de Fase 4. El label "Recomendaciones" en el sidebar es ambiguo (sugiere editor cuando es dashboard). Cuando se implemente, considerar label más preciso como **"Métricas de recomendación"** o moverla al grupo **"Analítica"** (admin-nav.ts:235), porque es más analítica que catálogo.

---

## Resumen ejecutivo de duplicación conceptual

| Par evaluado | ¿Duplicación real? | Acción |
|---|---|---|
| Category vs OcasionTag | **No.** Entidades distintas, schema correcto, intent del PLAN claro. | Agregar copy pedagógico en `/admin/ocasiones` ("para qué sirve esto vs Categorías"). |
| Product vs ProductVariant | **No.** Modelo correcto. UX fragmentada. | Eliminar sub-path `/productos/[id]/variants` y meter variantes como sección inline del editor. |
| Cupones en "Comercial" | **No.** Taxonomía correcta. | Agregar widget "Cupones que aplican" en editor de Producto (cross-link). |
| Reseñas en "Ventas" | **No.** Taxonomía razonable. | Agregar tab/widget "Reseñas" en editor de Producto (sin mover el módulo). |
| PersonalizationTemplate vs "Plantillas" placeholder | **No** (mismo concepto, página pendiente). | Implementar decisión 5.9 + renombrar sidebar a "Plantillas del Estudio" para no chocar con `/admin/email-templates`. |
| "Recomendaciones" placeholder | **No.** Es dashboard de `RecommendationLog`. | Cuando se construya, considerar mover al grupo "Analítica" y label "Métricas de recomendación". |

**Veredicto global de Dimensión 2:** la información architecture conceptual del catálogo está **bien diseñada** y está alineada con PLAN_CATALOG_V2 (decisiones 1.5, 2.10, 5.9, 6.10, 8.1). No hay duplicación de modelos ni de pantallas. Lo que Lucy percibe como "muchas cosas y quizás duplicadas" es:

1. **Páginas placeholder en el sidebar** (Plantillas, Recomendaciones) que generan ruido visual sin entregar valor.
2. **Variantes escondidas en sub-path** que invierte la frecuencia de uso real.
3. **Falta de cross-referencing en la PDP admin** (cupones aplicables, reseñas, plantillas asociadas no aparecen en el editor de Producto).
4. **Labels ambiguos** ("Plantillas" choca con plantillas de email; "Recomendaciones" sugiere editor pero es dashboard).

Ninguno de estos requiere restructura de modelos ni de schema. Son refinamientos de UX admin: copy, layout del editor, eliminación de placeholders ruidosos hasta que tengan página, y un widget de cross-links.

Archivos relevantes verificados:
- `/home/ansible/workspaces/lucams_shop/packages/db/prisma/schema.prisma` (Category 244-284, Product 286-359, ProductVariant 361-390, Coupon 558-598, Review 620-648, PersonalizationTemplate 1085-1119, OcasionTag 1126-1153, ProductOcasionTag 1158-1170, RecommendationLog 1175-1196)
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/admin-nav.ts` (NAV grupos 80-289)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/` (carpeta — variants en sub-path)
- `/home/ansible/workspaces/lucams_shop/docs/PLAN_CATALOG_V2.md` (decisiones 1.5, 2.10, 5.9, 6.10, 8.1)