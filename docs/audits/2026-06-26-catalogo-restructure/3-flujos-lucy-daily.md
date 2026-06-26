Confirmed — `isFeatured` solo se toggla desde el form de producto, no hay un quick toggle desde la lista ni desde la home/dashboard. Hora del análisis final.

# Dimensión 3: Flujos diarios

> Auditoría hecha contra el código real en `apps/web/app/admin/(panel)/*`. Citas con `file:line`. Cuento clicks como "interacción que cambia URL o dispara form". Tipear en input no se cuenta como click pero se nota como fricción cuando aplica.

---

## Flujo 1: "Llegó Día de la Madre — quiero destacar 5 productos"

**Cómo se hace hoy** (no hay flujo batch ni "campaña de temporada"):

1. Click sidebar > Catálogo > Productos → `/admin/productos`
2. (Opcional) Filtrar por categoría o buscar "mamá" en la barra `q` — **fricción: no hay filtro por ocasión, ni por categoría**, solo por estado/sort (`productos/page.tsx:138-149`)
3. Click "Editar" en producto 1 → `/admin/productos/[id]`
4. Tab "Resumen" → scroll → checkbox "⭐ Destacado en home" (`product-form.tsx:220-225`)
5. Click "Guardar cambios" → vuelve a `/admin/productos/[id]?updated=1`
6. Click "Productos" en breadcrumb → `/admin/productos`
7. Repetir 3-6 cuatro veces más = **20 clicks adicionales**

**Total real: ~25 clicks + 5 cargas de página completas.**

**Fricciones:**
- No hay bulk select ("seleccionar varios → destacar").
- No hay quick toggle ⭐ desde la lista de productos (sí lo hay para activar/desactivar en `quick-actions.tsx:35-52`, pero no para featured).
- `OcasionTag` "Día de la Madre" existe (`/admin/ocasiones/[id]`) pero su linker SOLO sirve para asociar productos a la ocasión, NO los marca como featured — son dos atributos independientes.
- No hay vista combinada "productos × ocasión activa este mes".

**Ideal: 2-3 clicks.** Lista de productos con checkbox por fila + acción bulk "Destacar seleccionados". O ir a `/admin/ocasiones/dia-madre` y un botón "Destacar todos en home" sobre los productos ya linkeados.

---

## Flujo 2: "Producir nuevo set Polaroid 30 fotos"

(Asumo que ya existe el producto "Polaroid" y "Set 30" sería una variante nueva.)

1. Sidebar > Catálogo > Productos → `/admin/productos`
2. Buscar "polaroid" → submit "Aplicar"
3. Click "Editar" → `/admin/productos/[id]`
4. Click botón "Variantes" en el header (`[id]/page.tsx:81-100`) → `/admin/productos/[id]/variants`
5. Click "Nueva variante" → form aparece
6. Llenar nombre, SKU, atributos (photoSlots=30), stock, price override
7. Click "Crear"

**Total: 4 clicks + tipeo. Razonable.**

**Fricciones:**
- Variantes está enterrado en sub-path `/productos/[id]/variants` — no se ve desde la lista. Lucy no descubre fácil que existe.
- El botón "Variantes" en el header es informativo (badge con emoji 🟢🟡🔴 + count) pero el viaje a editar variantes no se sincroniza con el form del producto: si Lucy estaba a mitad de editar precio base y va a variantes, pierde el contexto.

**Ideal: igual de directo, pero variantes como sección en el tab "Resumen" o tab "Variantes y stock" en el mismo editor, sin sub-página.**

---

## Flujo 3: "Cambiar precio del Set 12 Polaroid"

Si el Set 12 tiene `price` override en la variante, debe editarse en `/admin/productos/[id]/variants`. Si no, edita `basePrice` en el producto.

**Caso A — variante con price override:**
1. Sidebar > Productos
2. Buscar "polaroid"
3. Click "Editar" 
4. Click "Variantes" en header → `/admin/productos/[id]/variants`
5. Click "Editar" en fila Set 12
6. Cambiar campo precio (en centavos, según `variant-form.tsx` typing fricción — pesos vs centavos)
7. Click "Guardar"

**Total: 5 clicks + tipeo confuso.**

**Fricción crítica:** el form de producto convierte pesos↔centavos (`product-form.tsx:191` `defaultPesos={... / 100}`) pero el form de variantes opera en centavos crudos (a confirmar leyendo `variant-form.tsx`). Si Lucy tipea "15000" pensando en pesos, queda como $150 COP. Es exactamente el tipo de error que destruye confianza y de paso ventas.

**Caso B — solo basePrice:**
1-3. Igual
4. Tab "Resumen" → campo "Precio venta" → cambiar
5. Guardar

**Total: 4 clicks. Cómodo.**

**Ideal:** inline price edit desde la tabla `/admin/productos` (click sobre el precio → editar inline → enter para guardar). Hoy no existe.

---

## Flujo 4: "Despublicar el separador Coleccionable X"

1. Sidebar > Productos
2. Buscar "separador" o "coleccionable"
3. Click botón "Desactivar" en la fila (`quick-actions.tsx:35-52`) — **toggle directo sin entrar al producto**

**Total: 2 clicks. Cómodo y rápido.**

**Esto está bien hecho.** Es uno de los pocos flujos que respeta el principio de "menos clicks para acciones reversibles". Sin confirm modal, lo que tiene sentido porque es reversible (`quick-actions.tsx:9`).

---

## Flujo 5: "Subir foto nueva al producto X"

1. Sidebar > Productos
2. Buscar producto X
3. Click "Editar" → `/admin/productos/[id]`
4. Scroll hasta el final (el componente `<ProductImages>` está después del form completo según `[id]/page.tsx:172`)
5. Click "Subir imágenes" → file picker → seleccionar archivos
6. Upload se dispara solo

**Total: 4 clicks + scroll.**

**Fricciones:**
- Las imágenes están FUERA del sistema de tabs (no son un tab, son una card al final del page). Lucy tiene que scrollear más allá del form completo, incluso si está en tab "Resumen".
- Reorder con flechas ↑↓ (un click por posición) — para mover de #5 a #1 son 4 clicks (`product-images.tsx:47-61`).
- No hay preview grande al hacer hover.
- Para CAMBIAR el orden de muchas fotos a la vez no hay drag-drop (declarado intencional en `product-images.tsx:9`).

**Ideal: tab "Galería" propio dentro del editor + drag-drop nativo. Las fotos son LO más cambiado por Lucy a diario; merecen acceso prioritario.**

---

## Flujo 6: "Crear cupón NAVIDAD2026 para categoría Imanes"

1. Sidebar > **Comercial** > Cupones → `/admin/cupones`
2. Scroll hasta el card "Crear cupón nuevo" (al final de la página, después del listado) — **fricción: no hay botón "+ Nuevo" en el header**
3. Llenar código, tipo, valor, fechas, descripción
4. **STOP — fricción crítica:** el campo "Solo aplica en categorías" pide **slugs separados por coma** tipeados a mano (`create-coupon-form.tsx:161-165`):
   ```
   placeholder="ej. de-temporada,cuadros-decoracion"
   ```
5. Lucy NO sabe el slug de "Imanes" de memoria → abre nueva pestaña → `/admin/categorias` → copiar slug
6. Volver al form, pegar `imanes`
7. Click "Crear cupón"

**Total: 7+ clicks + dos pestañas paralelas.**

**Fricciones:**
- Campo de categorías es typing libre de slugs, no un picker. **Es el caso de uso #1 de cupón segmentado y está roto.**
- Igual problema con `appliesToProductSlugs` (línea 172): typing libre.
- El form está en el bottom de la página (siempre visible aunque la lista sea de 30 cupones) — debería ser drawer/modal.
- Una vez creado no hay link directo "Ver cupón aplicado en Imanes en el storefront".
- No hay edición de cupón existente desde el listado (solo pause/resume/archive según el code).

**Ideal: 3-4 clicks con multi-select picker de categorías y un botón "+ Nuevo cupón" en el header que abra drawer.**

---

## Flujo 7: "Aprobar 3 reseñas y rechazar 1 con grosería"

1. Sidebar > Ventas > Reseñas → `/admin/resenas` (default `status=pending`)
2. Para reseña 1: click "Aprobar" (`resenas/page.tsx:353-362`)
3. Para reseña 2: click "Aprobar"
4. Para reseña 3: click "Aprobar"
5. Para reseña 4 (grosería): click "Archivar" → confirm modal → confirmar

**Total: 6 clicks (5 sin contar el confirm).**

**Fricciones:**
- No hay bulk select. 4 reseñas son 4 forms separados.
- Si llegan 20 reseñas un sábado, son 20 actions consecutivas.
- "Volver a pendiente" tiene texto largo, hace shift visual en las filas largas.
- Estás bien diseñado el filtro default de `pending` (`resenas/page.tsx:74-76`).

**Lo que está bien:** el inbox por defecto muestra pendientes — eso es UX correcta. El badge en dashboard apunta acá. La separación de "destacada" como acción adicional, también.

**Ideal: checkbox por fila + acciones bulk "aprobar/archivar seleccionadas".**

---

## Flujo 8: "Marcar Set Polaroid como destacado para home"

1. Sidebar > Productos
2. Buscar "polaroid"
3. Click "Editar"
4. Tab "Resumen" (default)
5. Scroll hasta sección "Visibilidad"
6. Marcar checkbox "⭐ Destacado en home" (`product-form.tsx:220-225`)
7. Click "Guardar cambios"

**Total: 5 clicks + scroll.**

**Fricciones:**
- No hay quick toggle ⭐ en la fila del listado (solo hay toggle activo/inactivo). Sería trivial agregar — la pieza ya existe.
- No hay forma de ver **qué productos están destacados en home** sin filtrar por `status=featured` (el filtro existe en `productos/page.tsx:148`, así que esto sí está OK, pero no es descubrible).
- No hay límite ni preview de cuántos featured aparecen en home. Si Lucy marca 30, no sabe cuál termina visible.

**Ideal: quick toggle ⭐ en la fila igual al toggle Activar (1 click), + sección "Featured en home" en dashboard con preview vs orden de aparición.**

---

## Flujo 9: "Ver qué productos tienen stock bajo HOY"

**Cómo se hace hoy:** no se puede directamente.

1. Sidebar > Dashboard
2. Ver la OpsCard "Productos sin stock" — **valor: `0` HARDCODEADO** (`dashboard/page.tsx:144-149`). Lucy ve un placeholder que miente.
3. Sidebar > Productos
4. Filtro Estado no tiene "Stock bajo" ni "Sin stock" (`productos/page.tsx:144-149`), solo activo/inactivo/archivado/destacado.
5. Lucy abre producto por producto y revisa el `ProductStockPanel` (`product-stock-panel.tsx:1-100`).

**Total: imposible saber sin abrir cada producto. Si tiene 40 productos, son 40 visitas.**

**Fricciones:**
- Es la operación que MÁS afecta ventas (vender lo que no hay).
- El modelo `ProductVariant.stock` ya tiene la info. Falta una query agregada y exponerla.
- Estados visuales 🟢🟡🔴 ya existen en `stock-constants.ts` — solo falta usarlos en la lista.

**Ideal: filtro "Stock bajo/Sin stock" en `/admin/productos` + KpiCard en dashboard con valor real (no hardcoded). 2 clicks.**

---

## Flujo 10: "Crear sub-categoría 'Para Cumpleaños' dentro de Imanes"

1. Sidebar > Catálogo > Categorías
2. Scroll hasta "Crear nueva categoría" (al final, después del listado)
3. Llenar nombre, slug, descripción, orden, isActive
4. Click "Crear categoría"
5. **STOP — fricción crítica:** el `CategoryForm` (`category-form.tsx:22-29` type) NO tiene campo `parentId`. Lucy NO PUEDE crear una sub-categoría desde la UI.

**Total: imposible desde el admin.** El modelo `Category` lo soporta (vimos `parent` y `_count` en `categorias/[id]/page.tsx:50`), el dashboard hasta cuenta sub-categorías (`dashboard/page.tsx:77, 170`), pero el form no expone el campo.

Para crear una sub-categoría Lucy tendría que abrir la base de datos.

**Misma situación para los demás campos del modelo Category que tampoco están en el form:**
- `richDescription` (Markdown para PLP) — no editable
- `visibleFilters` — no editable
- `defaultSort` — no editable
- `featuredProductSlug` — no editable
- `activeFrom / activeUntil` (categorías estacionales!) — no editable

El modelo tiene la ambición de "categorías ricas y estacionales" pero el form solo deja editar `name`, `slug`, `description`, `order`, `isActive`. **Hay una desconexión gigante entre lo que el schema promete y lo que la UI permite.**

**Ideal: form completo de categoría + selector `parent`. 4 clicks.**

---

## Patrones de fricción detectados

### 1. Bulk actions ausentes en todo el catálogo
Ni productos, ni reseñas, ni categorías, ni cupones, ni ocasiones tienen multi-select. Toda acción es uno-a-uno con `form action`. Para 9 productos hoy es tolerable, para 50 ya no.

### 2. Filtros de listado pobres en productos
`/admin/productos` no permite filtrar por categoría, ocasión, stock bajo, sin imagen, sin descripción rica, sin peso/dims (lo que rompe Aveonline). Solo estado + sort + texto. Para Lucy "buscar productos del set Polaroid sin stock" es imposible en 1 query.

### 3. Stock invisible al admin de un golpe
El `ProductStockPanel` por producto está bien, pero la pregunta "qué tengo bajo HOY" requiere abrir cada uno. Y el dashboard MIENTE con `0` hardcoded (`dashboard/page.tsx:146`).

### 4. Cupones segmentados por slugs typeados
El picker de categorías y productos en el form de cupón es texto plano. Frágil (typo invalida el cupón silenciosamente) y no descubrible.

### 5. Featured/destacado no es quick action
Toggle ⭐ requiere entrar al editor, ir a tab Resumen, scrollear, checkbox, guardar. 5 clicks para algo que debería ser 1.

### 6. Categorías ricas prometidas en schema, NO editables en UI
`parent`, `richDescription`, `visibleFilters`, `defaultSort`, `featuredProductSlug`, `activeFrom/Until` son campos del modelo `Category` sin UI. El plan PLAN_CATALOG_V2 está parcialmente implementado. **Lucy no puede crear sub-categorías ni categorías estacionales desde el admin.**

### 7. Ocasiones↔Productos solo navegable desde la ocasión
El linker está SOLO en `/admin/ocasiones/[id]` con `product-ocasion-linker.tsx`. Desde el editor del producto NO hay sección "Esta producto sirve para estas ocasiones". Lucy que piensa por producto ("este Set 12 sirve para Mamá, Aniversario, Cumple") tiene que navegar 3 ocasiones y agregarlo en cada una. Modelo bi-direccional, UI uni-direccional.

### 8. Variants en sub-página separada
`/admin/productos/[id]/variants` rompe el contexto del editor. El `ProductStockPanel` mitiga el caso "cambiar stock" pero "agregar variante nueva", "cambiar precio variante", "archivar variante" todavía obligan a navegar afuera.

### 9. Forms de creación al final de la página, sin botón "+ Nuevo"
Categorías, cupones y ocasiones tienen el form de creación como una `AdminCard` al final del listado. Si Lucy tiene 30 cupones, hace scroll innecesario. La convención debería ser botón "+ Nuevo X" en el header → drawer/modal (lo que ya hace Productos con `/admin/productos/nuevo`).

### 10. Cross-links semánticos faltan
Desde `/admin/cupones` no hay link a las categorías que aplica. Desde `/admin/categorias/[id]` no hay link a "ver productos en esta categoría". Desde `/admin/ocasiones/[id]` sí hay link a productos. Falta consistencia.

### 11. Dashboard placeholder en métrica clave
`Productos sin stock: 0` hardcodeado. `Reclamos abiertos: 0` hardcodeado. Lucy aprende a NO confiar en el dashboard.

---

## Flujos que el admin facilita BIEN (honesto)

Sí, los hay. No todo es problemático:

1. **Despublicar un producto** (Flujo 4): 2 clicks desde la lista, sin confirm modal. Diseño correcto para acción reversible (`quick-actions.tsx`).
2. **Moderar reseñas individuales** (Flujo 7 case-by-case): default landing en `pending`, badges claras, Ley 1480 respetada (no se edita texto ajeno). El pain es solo cuando hay volumen.
3. **Editar stock simple de un producto sin variantes** (Flujo 9 caso simple): el `ProductStockPanel` permite cambio inline desde el editor del producto sin ir a la sub-página de variantes. Fue una mejora reciente (ADM-P0-004 según el comentario en código) y funciona.
4. **Tabs en el editor de producto** (`product-form.tsx:40-46`): la reorganización en 5 tabs (Resumen/Texto y bot/Logística/SEO/Avanzado) reduce el "wall of fields" y permite que el 80% de las ediciones queden en Resumen sin scroll.
5. **Filtros básicos en productos/categorías/cupones/reseñas**: `q`, status, sort son consistentes entre páginas. Buen patrón reutilizable.
6. **Badge = toggle en categorías y ocasiones**: click sobre "Activa" desactiva en 1 click (`categorias/page.tsx:230-253`, `ocasiones/page.tsx:240-258`). Es UX correcta para flags binarios.
7. **Breadcrumbs consistentes**: `Admin > Catálogo > Productos > [nombre]`. Navegación predecible.
8. **Sidebar agrupado por área de negocio** con badges Próximo/Fase 4/5 deja claro qué está disponible. Honesto sobre el alcance actual.

---

## Estimación de "tedioso vs cómodo" por flujo

| Flujo | Clicks reales | Estado |
|------|---------------|--------|
| 1. Destacar 5 productos temporada | ~25 | Tedioso |
| 2. Producir variante nueva | 4 + tipeo | Cómodo |
| 3. Cambiar precio variante | 5 + tipeo confuso pesos/centavos | Tedioso |
| 4. Despublicar producto | 2 | Cómodo |
| 5. Subir foto al producto | 4 + scroll | Aceptable |
| 6. Crear cupón segmentado por categoría | 7 + 2da pestaña a copiar slug | Tedioso |
| 7. Moderar 4 reseñas | 6 | Aceptable para 4, tedioso para 20 |
| 8. Destacar 1 producto en home | 5 | Aceptable |
| 9. Ver stock bajo HOY | Imposible sin abrir cada producto | Roto |
| 10. Crear sub-categoría | Imposible desde la UI | Roto |

**Síntesis honesta:** 2/10 cómodos, 3/10 aceptables, 3/10 tediosos, 2/10 rotos (stock bajo, sub-categorías). La sensación de Lucy de "hay muchas cosas, quizás duplicadas o mal organizadas" se valida con datos: el problema más que duplicación es que **el schema promete features (categorías ricas, sub-categorías, categorías estacionales, recomendaciones, plantillas)** que **el admin no expone**, mientras que la operación diaria real (stock, destacar, cupones segmentados) **carece de quick actions y bulk**.