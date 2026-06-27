I have everything I need. Here is the analysis.

# Cluster 1: Ordenar por clic en columna

## Resumen ejecutivo

Lucy tiene razón: el dropdown "Ordenar por" es un patrón de admin "técnico" (elegís de una lista, apretás "Aplicar", se recarga). El estándar de mercado para tablas —y lo que Lucy reconoce de cualquier app— es **clic en el encabezado de columna → ordena, otro clic → invierte**. Es **MEJORA UX legítima**, no bug. La buena noticia: hoy todo el orden es **server-side vía searchParam**, así que migrar a headers clickeables es 100% compatible (siguen siendo `<Link>` que cambian el query param, sin JS de cliente). El esfuerzo se concentra en **un primitive nuevo + migrar las tablas**.

Aclaración de alcance: el feedback dice "4 pantallas", pero el patrón `sort=`/dropdown "Ordenar por" existe en **8 listings admin** (productos, inventario, categorias, cupones + clientes, resenas, usuarios, redirects, pedidos). Conviene saberlo para no construir el primitive a medida de 4 y rehacerlo después. Storefront **no se toca** (su orden lo maneja el cliente con su propia UI de catálogo; este cluster es solo admin).

---

## Findings por pantalla

### 1. Productos — `productos/page.tsx:165-183` (dropdown), `service.ts:67-79` (orderBy)
- Dropdown `name="sort"` con 4 opciones: `recent` (default, `updatedAt desc`), `name` (`name asc`), `price-asc`/`price-desc` (`basePrice`).
- Columnas de la tabla (`:232-237`): Producto · Código · Categoría · Precio · Estado.
- **Mapeo columna→sort:** Producto↔`name`, Precio↔`price-asc/desc`. **Sin** sort para Código, Categoría, Estado.
- Nota: la columna Precio muestra `priceFrom` (mínimo de variantes) pero el sort usa `basePrice` del producto — pueden divergir cuando hay opciones con override. Es una inconsistencia menor preexistente, no la introduce este cluster, pero conviene anotarla (el ▲▼ ordenaría por un valor distinto al mostrado).

### 2. Inventario — `inventario/page.tsx:449-461` (dropdown), `inventory-service.ts:115-126`
- Dropdown `name="orden"` (ojo: aquí el param se llama **`orden`**, en productos/categorias/cupones se llama **`sort`** — inconsistencia de naming que el primitive debe absorber por config).
- 4 opciones: `product-asc` (default, agrupado), `stock-asc`, `stock-desc`, `recent`.
- Columnas (`:163-168`): Producto · Opción · Código · Estado · Stock · Ajustar.
- **Caso especial:** el orden default `product-asc` **agrupa visualmente** las opciones de cada producto (lógica de "misma familia" en `:92-101`). Si el usuario hace clic en "Stock" para ordenar por stock, **se rompe la agrupación** (las filas dejan de estar contiguas por producto y el "↳ misma familia" pierde sentido). Esto es un **conflicto de diseño real**: la columna clickeable y la agrupación visual no conviven bien. → es **DECISIÓN-DE-LUCY** (ver más abajo).

### 3. Categorías — `categorias/page.tsx:149-158` (dropdown), `service.ts:26-36`
- Dropdown `name="sort"`: `order` (default, orden manual `order asc`), `name`, `recent`.
- Columnas (`:195-200`): Orden · Nombre · Slug · Productos · Estado · Acciones.
- **Conflicto similar:** el default es **"Orden manual"** (`order` numérico que Lucy edita a mano para controlar el orden en la tienda). Si clickea "Nombre" para ver alfabético, sale del orden manual — está bien, pero hay que poder **volver** al orden manual. La columna "Orden" puede ser el header clickeable que restaura `sort=order`. "Productos" (`_count.products`) **no** tiene sort hoy y sería útil ("¿qué categoría tiene más productos?").

### 4. Cupones — `cupones/page.tsx:169-179` (dropdown), `service.ts:31-43`
- Dropdown `name="sort"`: `recent` (default, `validTo desc`), `expiry-asc` (`validTo asc`), `code` (`code asc`), `uses` (`usedCount desc`).
- Columnas (`:216-221`): Código · Tipo · Valor · Estado · Vigencia · Usos.
- **Mapeo:** Código↔`code`, Vigencia↔`recent`/`expiry-asc` (esa columna ya tiene asc Y desc — calza perfecto con el toggle de dirección), Usos↔`uses`. **Sin** sort para Tipo, Valor, Estado.
- Es la tabla que **mejor** mapea al patrón header-clickeable (3 de 6 columnas ya ordenables, y Vigencia ya tiene ambas direcciones).

### 5. Primitive compartido — `admin-page.tsx`
- **No existe** soporte de header clickeable. `AdminTableHead` (`:180-186`) es un `<thead>` tonto; los `<th>` se escriben a mano en cada page. **Hay que crear el primitive nuevo.**

---

## Propuesta

### A. Nuevo primitive `<SortableHeader>` en `admin-page.tsx`

Server-component puro (RSC), renderiza un `<th>` con `<Link>` adentro. Sin JS de cliente. Firma propuesta:

```
<SortableHeader
  label="Precio"
  sortKey="price"          // identidad lógica de la columna
  current={{ key, dir }}   // estado activo leído del searchParam
  basePath="/admin/productos"
  paramName="sort"         // "sort" o "orden" según la pantalla
  preserve={{ q, status }} // otros params a conservar
  align="right"
/>
```

Comportamiento:
- Construye el `href` con `URLSearchParams`: si la columna **no** está activa → `?sort=price-asc`; si está activa asc → invierte a `price-desc`; si está desc → vuelve a asc (o a default — decisión de Lucy abajo). Siempre preserva `q`, `status`, `categoria`, y **resetea `page=1`** (importante: ordenar debe volver a página 1).
- Flechita: `▲` (asc) / `▼` (desc) solo en la columna activa; columnas ordenables inactivas muestran un `⇅` tenue (`text-brand-purple-dark/25`) para señalar que **se pueden** clickear; columnas no-ordenables (Tipo, Valor, Estado, Acciones) se renderizan con el `<th>` normal de siempre.
- Accesibilidad: `aria-sort="ascending|descending|none"` en el `<th>`, y el `<Link>` con `title="Ordenar por precio"`.

Detalle de naming que el primitive resuelve: el param actual es `sort` en 3 de las 4 (y en clientes/resenas/usuarios/etc.) pero `orden` en inventario. El primitive recibe `paramName` para no forzar un rename masivo de URLs ya existentes; si se quiere unificar a `sort`, es un cambio aparte (rompe bookmarks de inventario — anotarlo como deuda menor).

Una sub-pieza: las pages necesitan parsear el searchParam a `{ key, dir }`. Conviene un helper `parseSort(raw, allowed, default)` co-ubicado en `admin-page.tsx` o en un `lib/admin-sort.ts`, para que las 4 (8) pages no repitan el `switch`/validación. Esto además **mantiene la validación** que ya existe (las pages hoy validan contra una lista blanca; el helper la centraliza).

### B. ¿Se elimina el dropdown?

**Recomendación: dropdown se elimina en desktop, se conserva como fallback en mobile.** Razón concreta de UX (no teórica): las tablas tienen `minWidth` 640–800px (`admin-page.tsx:154-178`) y en mobile están dentro de `overflow-x-auto` — los headers quedan fuera de viewport o requieren scroll horizontal para alcanzarlos, y son targets táctiles chicos. El dropdown sigue siendo el mejor control de orden en pantalla angosta.

Implementación: el `<form>` con el `<select name="sort">` se envuelve en `className="sm:hidden"` (solo mobile), y los `<SortableHeader>` ya viven en el `<thead>` (visibles siempre, pero útiles en desktop). Costo casi nulo, y resuelve la objeción de Lucy ("clic en columna") sin perder usabilidad mobile.

### C. Conflictos que requieren DECISIÓN-DE-LUCY

1. **Inventario — agrupación vs. orden libre.** Si Lucy clickea "Stock", ¿acepta perder la agrupación por producto (filas de stock bajo juntas, sin "misma familia")? Opciones: (a) permitir el sort y desactivar la agrupación cuando el orden no es `product-asc`; (b) dejar "Producto" como única columna clickeable + mantener stock-asc/desc solo en el dropdown/KPI chips. Recomiendo (a): es lo que Lucy espera de "clic ordena".
2. **Categorías — volver al orden manual.** ¿La columna "Orden" clickeable restaura `sort=order`? (Recomiendo sí — es el affordance natural.)
3. **3er clic.** ¿El tercer clic en una columna activa vuelve a asc (toggle binario asc↔desc) o limpia el orden y vuelve al default de la pantalla? Recomiendo **toggle binario** (más simple y predecible para Lucy no-técnica).

Estas 3 las dejo marcadas para que Lucy elija; no las decido yo.

---

## Esfuerzo

| Ítem | Tamaño | Detalle |
|------|--------|---------|
| Primitive `<SortableHeader>` + helper `parseSort` en `admin-page.tsx` | **S–M** | Componente RSC + construcción de href + flechitas + a11y. ~80–120 líneas, una sola vez. |
| Migrar **Cupones** | **S** | Mejor mapeo (3/6 ya ordenables, Vigencia ya bi-direccional). Plantilla de referencia. |
| Migrar **Productos** | **S** | Producto + Precio. Anotar la divergencia `priceFrom` vs `basePrice`. |
| Migrar **Categorías** | **S–M** | Requiere decisión "volver a orden manual" + agregar sort por `_count.products` (toca `service.ts`). |
| Migrar **Inventario** | **M** | Param es `orden` no `sort`; requiere decisión sobre agrupación; es la más delicada. |
| Fallback dropdown mobile (`sm:hidden`) en las 4 | **S** | Envolver el form existente, no se reescribe. |

**Total para las 4 pantallas: M** (≈ 1 primitive + 4 migraciones, la mayoría S). Si después se extiende a las otras ~4 listings (clientes/resenas/usuarios/redirects/pedidos) el primitive ya está hecho y cada una es **S**.

## Recomendación de prioridad

Es **pulido UX puro**, no bloquea launch. Frente a los bloques pendientes (C Seguridad RBAC/Turnstile/RLS, D Observabilidad, E Testing, F Refund+Cupones), va **después** de Seguridad y Testing. Pero como es bajo riesgo (server-side, sin tocar lógica de negocio, reversible) y mejora notablemente la experiencia diaria de Lucy, es buen candidato para agrupar con el resto del pulido UX de esta tanda de feedback en un sprint cosmético único — construir el primitive una vez y aplicarlo a las 4 (idealmente 8) tablas de corrido.

**Recordatorio prueba GUI:** cuando se implemente, probar en navegador (no solo curl) en `/admin/productos`, `/admin/inventario`, `/admin/categorias`, `/admin/cupones`: (1) clic en header ordena + aparece ▲, segundo clic ▼; (2) ordenar resetea a página 1; (3) el orden preserva `q`/`status` activos; (4) en viewport mobile (<640px) el dropdown fallback aparece y los headers no son la única vía; (5) caso inventario: verificar qué pasa con la agrupación "misma familia" al ordenar por stock.