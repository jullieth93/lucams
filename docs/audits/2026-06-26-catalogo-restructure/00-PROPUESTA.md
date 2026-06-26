# Propuesta Restructuración Módulo Catálogo Admin — 2026-06-26

## Executive Summary

**Veredicto honesto:** Lucy percibe complejidad real, pero la causa NO es duplicación de modelos ni mala arquitectura conceptual — es **sobrecarga visual del sidebar con placeholders vacíos**, **variantes escondidas en sub-ruta** cuando son la operación más frecuente, **stock invisible al admin de un golpe** (dashboard miente con `0` hardcoded en `dashboard/page.tsx:146`), y **jerga técnica en copy** (variantes, slug, override, soft-delete). De los 6 pares evaluados (Category↔OcasionTag, Product↔Variant, Cupones↔Comercial, Reseñas↔Ventas, Plantillas placeholder↔PersonalizationTemplate, Recomendaciones), **ninguno es duplicación de modelo de datos** — todos son problemas de UI admin resolvibles sin tocar schema.

**Top 3 problemas reales:**
1. **Inventario invisible** — `/admin/productos` no permite filtrar por stock bajo (`productos/page.tsx:144-149`); dashboard hardcodea `0` (`dashboard/page.tsx:144-149`); para saber qué se está agotando hay que abrir 9 productos uno por uno.
2. **Variantes en sub-ruta separada** (`/admin/productos/[id]/variants`) cuando contienen el dato más operativo del día a día (stock real + precio efectivo). Inversión de frecuencia de uso.
3. **Placeholders ruidosos en sidebar Catálogo** (`Plantillas` y `Recomendaciones`, `admin-nav.ts:129-143`) — 40% del grupo no hace nada al hacer clic, y "Plantillas" colisiona nominalmente con `PersonalizationTemplate` ya seedeado en BD + con `/admin/email-templates`.

**Propuesta:** **Opción C** (restructuración UI moderada, sin migration de schema) + crear `/admin/inventario` como módulo top + cleanup de copy + cross-links contextuales en editor de producto.

**Costo total:** 18–28h de desarrollo + ~2h de acciones humanas Lucy (decisiones de naming + QA visual). Cero migration de datos, cero riesgo SEO, reversible.

---

## Diagnóstico HONESTO

### Lo que ESTÁ duplicado / mal organizado (con evidencia)

**1. Placeholders vacíos en sidebar Catálogo generan ruido cognitivo y nominal**
- `admin-nav.ts:129-133` declara `Plantillas` con badge "Próximo" → URL `/admin/plantillas` no existe (cae a `[...placeholder]`).
- `admin-nav.ts:137-141` declara `Recomendaciones` con badge "Fase 4" → URL `/admin/recomendaciones` no existe.
- **Colisión nominal real:** "Plantillas" del sidebar Catálogo apunta conceptualmente a `PersonalizationTemplate` (schema.prisma:1085-1119, ya seedeado en BD sin admin) PERO también existe `/admin/email-templates` (admin-nav.ts:277) — dos "Plantillas" en sidebar = confusión garantizada cuando ambas se implementen.

**2. Variantes escondidas en sub-ruta invierte frecuencia de uso real**
- `productos/[id]/variants/page.tsx` es la única forma de gestionar `ProductVariant.stock` + `ProductVariant.priceOverrideCents`, que es la operación diaria de Lucy.
- Sin entrada en sidebar, sin descubrimiento desde la lista. Botón "Variantes" solo aparece en header del editor de producto (`[id]/page.tsx:81-100`).
- AdminNotice `"¿Qué son las variantes?"` (variants/page.tsx:109) es señal directa de que el nombre + ubicación fallan.

**3. Stock invisible al admin de un golpe (flujo roto)**
- Dashboard KPI "Productos sin stock" = `0` **hardcoded** en `dashboard/page.tsx:144-149`. Mentira pedagógica que entrena a Lucy a NO confiar.
- `/admin/productos` filtros no incluyen "stock bajo" ni "agotado" (`productos/page.tsx:144-149`) — solo activo/inactivo/archivado/destacado.
- El modelo `ProductVariant.stock` + estados visuales 🟢🟡🔴 ya existen en `stock-constants.ts`. Falta query agregada + exposición UI.

**4. Schema Category prometen features que la UI no expone**
- `Category` tiene `parentId`, `richDescription`, `visibleFilters`, `defaultSort`, `featuredProductSlug`, `activeFrom/Until` (schema.prisma:244-284).
- `category-form.tsx:22-29` SOLO expone `name`, `slug`, `description`, `order`, `isActive`. **Lucy NO puede crear sub-categorías ni categorías estacionales desde el admin.** Desconexión gigante entre ambición del modelo y capacidad real.

**5. Voseo argentino detectado (viola memoria es-CO tuteo)**
- `categorias/[id]/page.tsx:127`: `"podés reactivarla"` — debe ser `"puedes traerla de vuelta"`.

**6. Copy con jerga técnica visible**
- `(soft-delete)` en `productos/page.tsx:102`.
- `slug:` como label en subtitle de editor.
- `Aspect ratio` con placeholder `1:1, 4:5` (variant-form.tsx).
- `"— Heredar del producto —"` (variant-form.tsx:144,156).
- `"Override (COP)"` (variant-form.tsx:74).
- `"Desasociar este producto"` (ocasiones/[id]/product-ocasion-linker.tsx:65).

### Lo que NO está duplicado (siendo honestos)

**Category vs OcasionTag — NO son lo mismo.**
- `Category` es jerárquica + obligatoria (`Product.categoryId` NOT NULL, schema.prisma:335) + lleva metadata de presentación de grid + responde "¿qué tipo de producto es?".
- `OcasionTag` es N:N opcional con `rationale` propio + `monthHint` + `suggestedQuantityRange` + responde "¿para qué momento sirve?".
- PLAN_CATALOG_V2 decisiones 1.5, 2.10, 6.8 ya formalizan la distinción. Un mismo Set Polaroid es categoría "Fotoimanes" + ocasiones {Aniversario, Cumple, Día Madre} con rationale distinto por par.
- **Falsa duplicación percibida** — se resuelve con copy pedagógico (`"Categoría = qué ES. Ocasión = para qué SIRVE."`) en headers de ambas páginas, NO con merge de modelos.

**Product vs ProductVariant — modelo correcto.**
- 1 producto + N variants es lo correcto para SEO (1 PDP), reviews compartidas, plantillas compartidas, cart UX. Si fueran 4 productos hermanos, divide ranking + multiplica catálogo x3.
- Problema es UX (sub-ruta separada), NO modelo.

**Cupones en "Comercial" — taxonomía razonable.**
- Cupón = campaña temporal con vigencia + usos máximos, no propiedad permanente del producto.
- Etsy/BigCartel ponen cupones en "Marketing/Promociones" — Lucams ya lo hace bien.
- Gap real: falta widget "Cupones que aplican a este producto" en editor de producto (cross-link, NO mover de módulo).

**Reseñas en "Ventas" — defendible aunque subóptimo.**
- Razonable por origen (nacen de un pedido).
- Mejorable: agregar tab "Reseñas" inline en editor de producto SIN mover el módulo global. Pattern Shopify/Etsy.

**Plantillas placeholder vs PersonalizationTemplate — mismo concepto, página pendiente.**
- No es duplicación, es deuda de implementación de PLAN_CATALOG_V2 decisión 5.9. Solo necesita renombrar a "Plantillas del Estudio" para no chocar con email templates.

**Recomendaciones placeholder — es dashboard, no editor.**
- PLAN_CATALOG_V2 decisión 6.10 define que es analítica sobre `RecommendationLog` (schema.prisma:1175-1196), no CRUD. Mejor mover a grupo "Analítica" cuando se implemente.

### Lo que está MAL UBICADO en sidebar (no duplicado pero confuso)

| Item | Ubicación actual | Problema | Recomendación |
|---|---|---|---|
| `Plantillas` (placeholder) | Catálogo | Colisiona con `email-templates`; no implementada | Eliminar del sidebar hasta implementar. Cuando se construya: `Plantillas del Estudio` bajo grupo "Estudio/Personalización", NO Catálogo. |
| `Recomendaciones` (placeholder) | Catálogo | Sugiere editor pero es analytics dashboard (decisión 6.10) | Eliminar del sidebar hasta Fase 4. Cuando se construya: `Métricas de recomendación` en grupo Analítica. |
| `/productos/[id]/variants` | Sub-ruta escondida del editor | Operación más frecuente, sin discoverability | Convertir en tab inline del editor + crear módulo top `/admin/inventario` para vista cross-product. |
| `Cupones` | Comercial | Label de grupo "Comercial" es opaco para Lucy | Renombrar grupo a `Promociones` (mantener Cupones + futuro Mayorista B2B + descuentos automáticos). |
| `Base de conocimiento` (`/admin/contenido/bloques`) | IA y Conocimiento | Aloja copy de PDP, FAQs del producto, hero | Mantener grupo, pero cross-link desde editor de producto a bloques PDP que le aplican. |

---

## Propuesta de Restructuración

### Opción recomendada: C con racional

**Opción A (no hacer nada):** Inaceptable. El stock invisible + dashboard mentiroso + variantes escondidas son problemas operativos reales que degradan el día a día.

**Opción B (unificar Category + OcasionTag en `Collection`):** **Rechazada.** Costo 14–22h + riesgo SEO real (URLs `/productos/[categoria]` están en sitemap y probablemente indexadas) + esconde una distinción semántica legítima detrás de un `type` enum. Lucy tiene 9 productos productivos. A esa escala la migration es desproporcionada vs el problema real, que es de UX admin no de datos. **Reevaluar en 6 meses si aparece la señal real:** Lucy pide "quiero una colección manual arbitraria que no sea ni categoría ni ocasión" (ej. "Lo nuevo de junio", "Selección Lucy").

**Opción C (UI reorganization sin migration):** **Recomendada.** Resuelve el 80% de la fricción real de Lucy en ~18-28h, sin riesgo de datos, sin riesgo SEO, sin breaking changes. Reversible. Habilita decisión informada de Opción B en el futuro si aparece la señal.

### Nueva estructura del sidebar (grupo Catálogo)

Texto plano del orden propuesto:

Catálogo (icono Package, abierto por defecto)
- Productos                  /admin/productos
- Inventario                 /admin/inventario                NUEVO
- Categorías                 /admin/categorias
- Ocasiones                  /admin/ocasiones
- Reseñas                    /admin/resenas                   MOVIDO desde Ventas

Promociones (icono Tag, renombrado desde "Comercial")
- Cupones                    /admin/cupones
- Mayorista B2B              /admin/mayorista

Estudio (grupo nuevo, futuro)
- Plantillas del Estudio     /admin/plantillas-estudio        FUTURO (Fase 4)
- Diseños guardados          /admin/disenos                   FUTURO

Analítica (existente)
- Métricas                   /admin/metricas
- Métricas de recomendación  /admin/recomendaciones-metricas  FUTURO (Fase 4)

Eliminar del sidebar hoy:
- "Plantillas" (placeholder Catálogo) — eliminar entrada hasta implementar como "Plantillas del Estudio" en grupo nuevo.
- "Recomendaciones" (placeholder Catálogo) — eliminar entrada hasta Fase 4.

### Páginas nuevas a crear

1. **`/admin/inventario`** — vista cross-product de stock por variante (tabla con filtros stock bajo / agotado / por categoría). Editable inline. ~5–7h.
2. **Tab "Reseñas" dentro de `/admin/productos/[id]`** — sub-page que lista reseñas del producto con acciones inline (aprobar/destacar/archivar). NO reemplaza `/admin/resenas` global. ~2–3h.
3. **Widget "Cupones que aplican"** en editor de producto — read-only listado de cupones activos cuyo `appliesToProductSlugs` o `appliesToCategories` matchea. Link a `/admin/cupones?productSlug=X`. ~1–2h.

### Páginas a modificar

1. **`/admin/productos`** (lista)
   - Agregar filtro estado "Stock bajo" + "Agotado" (reutiliza `stock-constants.ts`).
   - Agregar quick toggle ⭐ Destacado en cada fila (pattern existente del toggle activar/desactivar).
   - Agregar checkbox bulk select + acciones (activar/desactivar/destacar/archivar masivo).
   - Copy: `Solo activos (visibles en tienda)` → `Visibles en la tienda`. `Solo inactivos (ocultos pero recuperables)` → `Pausados`. `Solo archivados (papelera)` → `En la papelera`. `SKU` → `Código`. Eliminar `(soft-delete)`. Placeholder búsqueda: `Por nombre o código interno…`.

2. **`/admin/productos/[id]`** (editor)
   - Convertir `/admin/productos/[id]/variants` en **tab inline "Versiones"** dentro del editor (mover el form completo, eliminar sub-ruta separada — redirect 301 interno).
   - Agregar tab "Reseñas" (ver páginas nuevas).
   - Agregar widget "Cupones que aplican" en tab Resumen.
   - Subtitle: `SKU: X · slug: Y` → `Código: X · URL: /productos/Y`.

3. **`/admin/dashboard`**
   - Reemplazar KPI hardcoded `Productos sin stock: 0` por query real `prisma.productVariant.count({ where: { stock: 0, archivedAt: null } })`.
   - Reemplazar `Reclamos abiertos: 0` igual.

4. **`/admin/categorias/[id]`** (editor)
   - Agregar selector `parentId` (sub-categorías).
   - Agregar campos `richDescription`, `activeFrom`, `activeUntil`, `featuredProductSlug` (controles que el modelo ya soporta pero la UI esconde).
   - **Fix voseo** en `categorias/[id]/page.tsx:127`.
   - Copy confirmaciones: eliminar "storefront" → "tu tienda".

5. **`/admin/ocasiones`** (lista)
   - Agregar header pedagógico: *"Las ocasiones son etiquetas transversales (Día de la Madre, Aniversario). Un producto puede tener varias a la vez. Distinto a Categoría, que define qué tipo de producto es."*

6. **`/admin/cupones`** (form crear)
   - Reemplazar typing libre de slugs (`appliesToCategories`, `appliesToProductSlugs` en `create-coupon-form.tsx:161-172`) por multi-select picker con auto-complete sobre `Category.slug` / `Product.slug`. **Crítico — hoy un typo invalida el cupón silenciosamente.**
   - Mover form a drawer/modal disparado por botón "+ Nuevo cupón" en header (en lugar de card al final del listado).

7. **`/admin/resenas`**
   - Agregar bulk select + acciones masivas (aprobar/archivar seleccionadas).
   - Mover el módulo del grupo "Ventas" al grupo "Catálogo" en `admin-nav.ts`.

8. **Sidebar `admin-nav.ts`**
   - Eliminar entries placeholder `Plantillas` y `Recomendaciones` de grupo Catálogo.
   - Renombrar grupo `Comercial` → `Promociones`.
   - Mover `Reseñas` del grupo Ventas al grupo Catálogo.
   - Agregar entry `Inventario` en Catálogo.

### Páginas a eliminar/redirect

- **`/admin/productos/[id]/variants`** — eliminar como ruta navegable, convertir en tab inline. Mantener redirect interno temporal (3-6 meses) para bookmarks viejos: `/productos/[id]/variants` → `/productos/[id]?tab=versiones`.
- **`/admin/plantillas`** placeholder — eliminar entry de NAV (la ruta sigue siendo placeholder hasta Fase 4).
- **`/admin/recomendaciones`** placeholder — eliminar entry de NAV.

---

## Mockups concretos

### /admin/inventario (nuevo)

Texto plano:

Inventario                                                    [+ Ajustar stock masivo]
─────────────────────────────────────────────────────────────────────────────
Filtros:  Estado [🔴 Agotado · 🟡 Bajo · 🟢 OK · Todos]   Categoría [Todas ▾]   Buscar: [_____]
Mostrar: ☐ Solo personalizables   ☐ Solo con variantes múltiples            Orden: [Stock asc ▾]

☐ │ Producto                          │ Versión       │ Código   │ Stock │ Estado     │ Acciones
─────────────────────────────────────────────────────────────────────────────
☐ │ Set Fotoimanes Polaroid           │ Set 6         │ FOT-P-06 │   0   │ 🔴 Agotado │ [Editar] [+10]
☐ │ Set Fotoimanes Polaroid           │ Set 9         │ FOT-P-09 │   3   │ 🟡 Bajo    │ [Editar] [+10]
☐ │ Set Fotoimanes Polaroid           │ Set 12        │ FOT-P-12 │  15   │ 🟢 OK      │ [Editar]
☐ │ Imán Corazón Rosa                 │ Único         │ IMA-CR   │   1   │ 🟡 Bajo    │ [Editar] [+10]
☐ │ Tarjeta Cumple Mascota            │ Único         │ TAR-CM   │  42   │ 🟢 OK      │ [Editar]
...

Seleccionados: 0     [Bulk: Ajustar +10] [Bulk: Marcar agotado] [Bulk: Pausar]

KPI strip arriba: "🔴 3 agotados  ·  🟡 5 bajos (≤5 unidades)  ·  🟢 14 OK  ·  Total: 22 versiones"

Click en fila → drawer lateral edita esa variante sin perder contexto de lista.

### /admin/colecciones (si Opción B)

NO APLICA — Opción B rechazada. Se queda con Categorías + Ocasiones separadas con copy pedagógico en headers.

### /admin/productos/[id] tab "Reseñas"

Texto plano:

Producto: Set Fotoimanes Polaroid
[Resumen] [Texto y bot] [Logística] [Versiones] [Reseñas (3 pendientes)] [SEO] [Avanzado]
─────────────────────────────────────────────────────────────────────────────
RESEÑAS DE ESTE PRODUCTO

Resumen rápido:  ⭐ 4.7 promedio (23 reseñas)   🟡 3 pendientes de moderar

Pendientes (3)
┌──────────────────────────────────────────────────────────────────────┐
│ ⭐⭐⭐⭐⭐  María C. (Bogotá) · hace 2h                                  │
│ "Quedaron lindísimos los fotoimanes de mi bebé, súper recomendado."   │
│ [📷 1 foto]                          [✓ Aprobar] [⭐ Destacar] [Archivar]│
└──────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────┐
│ ⭐⭐⭐⭐  Andrés P. (Medellín) · hace 5h                                 │
│ "Buen producto, llegó un poco tarde pero la calidad excelente."       │
│                                      [✓ Aprobar] [⭐ Destacar] [Archivar]│
└──────────────────────────────────────────────────────────────────────┘

Aprobadas recientes (mostrar últimas 5)
⭐⭐⭐⭐⭐ Camila V. · "Hermosos" · hace 3 días                  [Destacar] [Archivar]
⭐⭐⭐⭐⭐ Juan M.   · "Mi mamá lloró..." · hace 1 sem  ⭐destacada [Quitar destacar]
...

[Ver todas las reseñas →]  →  /admin/resenas?productId=X

---

## Plan de Migración (si Opción B)

**Opción B rechazada — esta sección documenta lo que costaría si se elige en el futuro.**

### Fase 1 — Sin breaking changes (~6h)
- Crear modelo `Collection` + `ProductCollection` en schema sin eliminar `Category`/`OcasionTag`.
- Crear service `features/collections/service.ts` paralelo.
- Crear página `/admin/colecciones` con tabs Permanentes / Ocasión / Manual leyendo de ambas tablas viejas.

### Fase 2 — Migration schema (~8h)
- Backfill: `INSERT INTO Collection SELECT ... FROM Category` (type=HIERARCHICAL) + `... FROM OcasionTag` (type=OCCASION).
- Re-mapear `Product.categoryId` → `Product.primaryCollectionId` + crear rows en `ProductCollection`.
- Migrar `ProductOcasionTag` → `ProductCollection` con preservación de `rationale`.
- Migrar `Coupon.appliesToCategories` → `Coupon.appliesToCollections` (semántica cambia).

### Fase 3 — Cutover (~8h + QA)
- Reescribir queries en `lib/catalog.ts:128-320,638-732` (categoryTree, getCategoryBySlug, filtros).
- Reescribir `app/productos/[categoria]/` y `app/ocasion/[slug]/` o mantener URLs públicas con adapter al modelo nuevo.
- Generar redirects 301 masivos en `UrlRedirect` si se unifican URLs públicas.
- Actualizar `sitemap.ts:56`, seeds (`seed-catalog-v2.mjs`, `seed-ocasiones.mjs`), dashboard métricas.
- Drop tablas viejas (DESTRUCTIVO).

**Total Opción B:** 22h + monitoreo SEO 30-90 días. **No recomendado para Lucams hoy.**

---

## Acciones humanas Lucy requeridas

**Decisiones de naming (necesarias antes de empezar):**
1. ¿Aprueba renombrar `Variantes` → `Versiones del producto` en toda la UI? Alternativa: `Presentaciones`.
2. ¿Aprueba renombrar grupo sidebar `Comercial` → `Promociones`?
3. ¿Aprueba mover `Reseñas` del grupo `Ventas` al grupo `Catálogo`? (Defendible quedarse — pide su preferencia.)
4. ¿Aprueba eliminar entries placeholder `Plantillas` y `Recomendaciones` del sidebar hasta implementar?
5. Confirmar terminología: `Inventario` (no "Stock"), `Código` (no "SKU" suelto), `URL` (no "slug"), `Pausados` (no "Inactivos"), `En la papelera` (no "Archivados").

**QA visual (después del cambio):**
6. Probar `/admin/inventario` con datos reales: filtros stock bajo / agotado / por categoría.
7. Probar bulk actions en `/admin/productos` y `/admin/resenas` con 3-5 items seleccionados.
8. Probar editor de producto con tab "Versiones" inline (que reemplaza la sub-ruta).
9. Probar form de cupón con multi-select picker (verificar que no se rompe creación de cupón existente).
10. Validar que dashboard ahora muestra stock real (no `0` hardcoded) — pedir si los números cuadran con su realidad.

**Acciones de contenido (Lucy escribe el copy final):**
11. Aprobar/ajustar copy pedagógico de `/admin/ocasiones` y `/admin/categorias` (versión propuesta arriba).
12. Aprobar/ajustar copy de confirmaciones destructivas (versiones propuestas en DIM 6).

Tiempo estimado Lucy: ~2h totales (decisiones rápidas + QA visual).

---

## Estimación horas

| Opción / Componente | Horas |
|---|---|
| **Opción A** (status quo) | 0h — pero deja problemas reales sin resolver |
| **Opción B** (migration `Collection` unificada) | 22h + monitoreo SEO 30-90 días + riesgo de breaking en storefront |
| **Opción C** (UI reorganization, recomendada) | **14–20h** |
| └─ Sidebar reorganization + eliminar placeholders | 1h |
| └─ Renombrar grupo `Comercial` → `Promociones`, mover Reseñas | 1h |
| └─ Tab "Versiones" inline en editor producto (eliminar sub-ruta) | 4–5h |
| └─ Tab "Reseñas" inline + widget "Cupones que aplican" | 3–4h |
| └─ Filtros stock bajo + bulk actions en `/admin/productos` | 2–3h |
| └─ Bulk actions en `/admin/resenas` | 1h |
| └─ Multi-select picker en form de cupón (slugs → picker) | 2h |
| └─ Cleanup de copy (jerga + fix voseo + confirmaciones) | 2–3h |
| └─ Fix dashboard KPIs hardcoded | 1h |
| └─ Expandir `category-form.tsx` (parentId + campos ricos) | 2–3h |
| **`/admin/inventario` nuevo (independiente)** | **5–7h** |
| └─ Service `listVariantsAcrossProducts` + query stock bajo | 2h |
| └─ Página listado + filtros + tabla + KPI strip | 3h |
| └─ Drawer edit inline + bulk adjust | 1–2h |
| **Total Opción C + Inventario** | **19–27h** |

---

## Riesgos

**De Opción C (recomendada):**
- **Bajo:** convertir sub-ruta `/variants` en tab puede romper bookmarks viejos de Lucy. Mitigación: redirect 301 interno temporal (`/productos/[id]/variants` → `/productos/[id]?tab=versiones`) por 3-6 meses.
- **Bajo:** mover Reseñas del grupo Ventas al grupo Catálogo cambia el ítem en sidebar — Lucy necesita un onboarding de 30 segundos.
- **Medio:** expandir `category-form.tsx` con `parentId` y campos ricos (`activeFrom/Until`, etc.) sin validación de jerarquía puede crear loops o estados inválidos. Mitigación: validación server-side estricta + tests.
- **Bajo:** multi-select picker en cupones requiere endpoint `/api/admin/categories/search` + `/api/admin/products/search` con auto-complete. Trabajo extra pero estándar.

**De Opción B (rechazada):**
- **Alto:** URLs públicas `/productos/[categoria]` indexadas en Google — romperlas exige redirects 301 + monitoreo SEO 30-90 días.
- **Alto:** semántica de `Coupon.appliesToCategories` cambia → revisar cupones productivos antes de migrar (hoy 0 según contexto, verificar).
- **Medio:** pierde tipado fuerte de Category (jerarquía + render grid) vs OcasionTag (bot AI metadata) — esconder con enum `type` introduce condicionales en queries.
- **Bajo pero real:** migration de datos requiere backup verificado + rollback testeado. 1 noche de bajo tráfico.

**De NO hacer nada (Opción A):**
- **Alto:** Lucy sigue perdiendo tiempo en flujos rotos (stock invisible, destacar 5 productos = 25 clicks). Frustración acumulada degrada uso del admin.
- **Alto:** Dashboard hardcoded a `0` entrena a Lucy a no confiar en métricas — efecto contagioso al resto del admin.
- **Medio:** typos en slugs de cupones siguen invalidando cupones en silencio.

---

## Recomendación FINAL (honesta)

**Voto técnico: Opción C + crear `/admin/inventario` como módulo top + cleanup de copy + cross-links en editor de producto.**

**Por qué:**

1. **El problema real de Lucy NO es duplicación de modelos.** Es ruido de sidebar (placeholders), variantes escondidas, stock invisible, jerga técnica. Confirmado en las 6 dimensiones. Las 6 sospechas iniciales se evaluaron y ninguna es duplicación real — son problemas de UI.

2. **Opción B es desproporcionada para la escala actual** (9 productos productivos, 40-50 al lanzar). Costo 22h + riesgo SEO + breaking de URLs públicas para resolver una distinción que en datos es legítima (Category = qué es, Ocasión = para qué sirve). El PLAN_CATALOG_V2 ya la formaliza como decisión consciente (1.5, 2.10, 6.8).

3. **Opción C es reversible.** Si en 6 meses Lucy pide "quiero colecciones manuales arbitrarias" (señal real de Opción B), el cambio sigue siendo viable con datos de uso real informando la decisión. Hoy estaríamos migrando a ciegas.

4. **Las ganancias de Opción C son inmediatas y operativas:**
   - `/admin/inventario` resuelve el flujo más roto (stock invisible).
   - Tab "Versiones" inline corrige la inversión de frecuencia de uso de variantes.
   - Bulk actions desbloquean operación a 50+ productos sin clicks lineales.
   - Multi-select picker en cupones elimina bug silencioso de typos en slugs.
   - Eliminar placeholders en sidebar reduce ruido cognitivo 40% en grupo Catálogo.
   - Copy cleanup quita 8-10 piezas de jerga técnica visible diariamente.

5. **Esfuerzo total 19-27h es ejecutable en 2-3 sprints sin riesgo de datos.** Cero migration, cero downtime, cero breaking en storefront público.

**Lo que NO recomiendo y por qué:**
- No tocar el modelo `Category`/`OcasionTag` separados — son correctos.
- No mover Cupones — están bien en grupo de promociones (solo renombrar el grupo).
- No eliminar `/admin/resenas` global — la moderación batch necesita vista cross-product. Solo agregar tab contextual en editor.

**Próxima decisión humana de Lucy:** aprobar Opción C + naming + permitir ejecución en sprints de 4-6h por sesión, priorizando `/admin/inventario` y tab "Versiones" en la primera sesión (mayor impacto operativo diario).

Archivos clave a tocar:
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/admin-nav.ts` (sidebar reorg)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/page.tsx` (filtros + bulk + copy)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/page.tsx` (tabs Versiones + Reseñas + widget Cupones)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/variants/page.tsx` (eliminar, migrar contenido a tab)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/inventario/page.tsx` (nuevo)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/dashboard/page.tsx` (KPIs reales)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/cupones/create-coupon-form.tsx` (multi-select picker)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/categorias/[id]/page.tsx` (fix voseo + campos ricos)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/resenas/page.tsx` (bulk actions)
- `/home/ansible/workspaces/lucams_shop/apps/web/features/products/service.ts` (filtros stock bajo)
- `/home/ansible/workspaces/lucams_shop/apps/web/features/variants/service.ts` (nuevo o extender: `listVariantsAcrossProducts`)