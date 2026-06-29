Now I have enough. Let me verify the Link cursor behavior — Next.js `<Link>` renders an `<a href>`, which is cursor-pointer by default in browsers, but the SortableHeader and pagination links should be checked. Note the SortableHeader `<Link>` has no explicit cursor class. Let me confirm the sort param whitelist gap (the page only accepts `name/price-asc/price-desc`, so new sort values would be silently dropped).

I have everything needed for a precise analysis.

# Frente 1 — Productos listado (ordenar + paginar)

Verifiqué el código real de los 3 archivos. Resumen ejecutivo: el listado hoy ordena solo por **Producto (name)** y **Precio (basePrice)** porque el `service.ts` solo mapea esos casos en su `orderBy`, y además el `page.tsx` tiene un **whitelist que descarta silenciosamente** cualquier otro valor de `sort`. La paginación es prev/next pura, sin primera/última, sin "ir a página N". Detallo cada punto con fix concreto.

---

## 1. ¿Por qué solo Producto + Precio son ordenables?

Dos capas lo limitan, y las dos hay que tocar:

**Capa A — el whitelist del page** (`productos/page.tsx:61-64`):
```ts
const sort = (
  ["name", "price-asc", "price-desc"].includes(sortRaw ?? "") ? sortRaw : "recent"
) as "recent" | "name" | "price-asc" | "price-desc";
```
Si llegara `?sort=sku-asc`, **se descarta y cae a `recent`**. O sea, aunque agregaras el `<SortableHeader>` en Código, el clic no haría nada hasta ampliar este array y el tipo.

**Capa B — el `orderBy` del service** (`service.ts:67-79`): solo tiene `case "name" | "price-asc" | "price-desc" | default(recent)`. No conoce sku, categoría ni estado.

### ¿Es viable agregar Código, Categoría, Estado? Sí, las tres, con matices

- **Código (sku)** — trivial. `sku` es columna directa de `Product`. `orderBy: { sku: "asc" }`. Útil para Lucy si codifica productos por familia (ej. `IMAN-001`, `IMAN-002`). 🟢 Vale la pena.
- **Categoría (category.name)** — viable. Prisma soporta ordenar por relación 1-1: `orderBy: { category: { name: "asc" } }`. Útil para agrupar visualmente productos de la misma categoría. 🟢 Vale la pena.
- **Estado (isActive)** — viable pero con UX pobre si se ordena solo por `isActive` (bool): agrupa activos/inactivos pero **no ve los archivados** (`deletedAt`) como grupo aparte, que es lo que el badge muestra. Ordenar por un bool da un agrupado binario tosco. 🤔 **DECISIÓN**: en vez de "ordenar por estado", el **filtro de Estado ya existente** (dropdown con activos/inactivos/archivados/destacados) cumple mejor ese trabajo. Recomiendo **NO** hacer la columna Estado ordenable y en su lugar dejar claro que el filtro es la herramienta para eso. Menos botones, más simple (mandato de Lucy).

### Set final propuesto de columnas ordenables

| Columna | ¿Ordenable? | Valores sort | Justificación |
|---|---|---|---|
| Producto | ✅ ya | `name` | — |
| Código | ✅ **agregar** | `sku-asc` / `sku-desc` | columna directa, barato |
| Categoría | ✅ **agregar** | `category-asc` / `category-desc` | relación 1-1, agrupa visualmente |
| Precio | ✅ ya | `price-asc` / `price-desc` | — |
| Estado | ❌ no | — | el filtro Estado ya cubre esto mejor |

Nota de coherencia: el "Precio" ordena por `basePrice` (que D4 auto-deriva = precio mínimo de las opciones), así que el orden coincide con el "desde $X" que se muestra. ✅ Correcto, no tocar.

### Cambio concreto en el service (`service.ts:67-79`)

Ampliar el tipo del param y el switch:
```ts
sort?: "recent" | "name" | "price-asc" | "price-desc"
      | "sku-asc" | "sku-desc" | "category-asc" | "category-desc";
...
switch (opts.sort) {
  case "name":          return { name: "asc" };
  case "price-asc":     return { basePrice: "asc" };
  case "price-desc":    return { basePrice: "desc" };
  case "sku-asc":       return { sku: "asc" };
  case "sku-desc":      return { sku: "desc" };
  case "category-asc":  return { category: { name: "asc" } };
  case "category-desc": return { category: { name: "desc" } };
  case "recent":
  default:              return { updatedAt: "desc" };
}
```

### Cambio en el page

1. Ampliar el whitelist + tipo (`page.tsx:61-64`) con los 4 nuevos valores.
2. Reemplazar los `<th>` planos de Código y Categoría (`page.tsx:243-244`) por `<SortableHeader>` con `ascValue`/`descValue` (mismo patrón que Precio, con `preserve={{ q, status }}`).
3. Propagar el dropdown mobile (`page.tsx:176-187`): hoy solo tiene 4 opciones; agregar "Código A-Z / Z-A" y "Categoría A-Z / Z-A" para que mobile no quede sin paridad con desktop.

**Esfuerzo total punto 1: S** (cambios mecánicos, sin migración de DB ni lógica nueva).

---

## 2. Paginación: "ir más lejos"

Hoy (`page.tsx:324-342`) solo hay `← Anterior` / `Siguiente →` y un texto "página X de Y". Para catálogos de 100+ productos (20 por página → 5+ páginas) saltar de a una es tedioso. Mejoras concretas, **todas server-side, sin JS de cliente** (coherente con el resto del listado RSC):

### 2a. Botones Primera / Última + bloque de navegación completo

```
[« Primera] [← Anterior]   Página [N] de Y   [Siguiente →] [Última »]
```
- `« Primera` → link a `page=1`, deshabilitado (no renderizado o gris) cuando `page === 1`.
- `Última »` → link a `page=totalPages`, deshabilitado cuando `page === totalPages`.
- Reusar el `PaginationLink` ya existente (`page.tsx:355-381`) que ya preserva `q/status/sort`. Solo agregar 2 instancias más.

### 2b. Input para saltar a página (form GET anidado)

Un mini-form GET con `<input type="number" min=1 max={totalPages}>` + botón "Ir":
```
Ir a página [ ___ ] / Y   [Ir]
```
Detalle crítico de implementación: como es un `<form>` GET aparte, **debe re-emitir `q`, `status`, `sort` como `<input type="hidden">`** para no perder los filtros al saltar (el navegador solo manda los campos del form que se envía). Atributos en el input numérico: `min={1}`, `max={totalPages}`, `defaultValue={page}`, `aria-label="Número de página"`. Validar server-side igual que ya se hace con `Number(sp.page) || 1` + clamp a `[1, totalPages]` (hoy NO hay clamp superior — ver bug abajo).

### 2c. Accesibilidad

- Envolver el bloque en `<nav aria-label="Paginación">`.
- Página actual con `aria-current="page"`.
- Botones deshabilitados: usar `<span aria-disabled>` gris en vez de `<Link>` (no renderizar un link muerto).

**Esfuerzo punto 2: M** (es UI nueva + un form GET con hidden inputs + clamp server-side; nada complejo pero son varias piezas).

---

## 3. cursor-pointer + estado visual (coordinado con Frente 3)

Verifiqué `admin-page.tsx` y `globals.css`: **no hay regla global `cursor-pointer`** y el `<Link>` del `SortableHeader` (`admin-page.tsx:266-270`) **no lleva `cursor-pointer` explícito**.

- 🐛 **BUG menor (afecta los 4 listados que usan SortableHeader: productos, cupones, categorías, inventario)**: el `<th>` con `<Link>` renderiza un `<a href>`, que en navegador *sí* muestra puntero por default… **pero** el texto del `<span>{label}</span>` dentro del link puede heredar cursor de texto en algunos resets de Tailwind. No es 100% garantizado el feedback de "clickeable". Fix de 1 línea en `admin-page.tsx:269`: agregar `cursor-pointer` a la className del `<Link>`. Como es el primitive compartido, **arregla las 4 tablas de una** — esto pertenece al barrido global del Frente 3, **no lo dupliques aquí**; solo lo señalo para que el Frente 3 lo recoja.
- Los `PaginationLink` (`page.tsx:373-380`) son `<Link>` → `<a href>`, puntero OK por default, pero por consistencia conviene también `cursor-pointer` explícito cuando el Frente 3 normalice.
- **Estado visual del SortableHeader**: ya está bien resuelto (ícono `ChevronUp/Down` activo en `text-brand-purple`, inactivo en `/25` con hover `/50`, y `aria-sort`). ✅ No tocar la lógica, solo sumar `cursor-pointer`.

**Esfuerzo punto 3: S** (1 línea en el primitive, ejecutado por Frente 3).

---

## 🐛 Bug adicional encontrado (fuera del pedido literal, pero del mismo frente)

`page.tsx:55` → `const page = Number(sp.page) || 1;` **no tiene clamp superior**. Si alguien pone `?page=999` con solo 3 páginas, el service hace `skip = (999-1)*20` → devuelve `items: []` y la UI muestra "página 999 de 3" con tabla vacía y empty state engañoso ("Sin resultados / prueba otro término"). Con el input de salto a página (punto 2b) esto se vuelve **fácil de disparar**. Fix: clampear `page` a `[1, totalPages]` después de calcular `totalPages` (o validar antes en el service). **Esfuerzo: S.** Imprescindible si se implementa 2b.

---

## Resumen de esfuerzos

| Item | Tipo | Esfuerzo |
|---|---|---|
| 1. Código + Categoría ordenables (service + page + dropdown mobile) | ✨ MEJORA | S |
| 1bis. NO hacer Estado ordenable (usar el filtro) | 🤔 DECISIÓN | — |
| 2a. Primera / Última | ✨ MEJORA | S |
| 2b. Input "ir a página N" (form GET con hidden q/status/sort) | ✨ MEJORA | M |
| 2c. Accesibilidad paginación (`nav`, `aria-current`, spans deshabilitados) | ✨ MEJORA | S |
| 3. `cursor-pointer` en SortableHeader/PaginationLink | 🐛 BUG | S (→ Frente 3) |
| Extra. Clamp de `page` a `[1, totalPages]` | 🐛 BUG | S |

Archivos a tocar: `apps/web/features/products/service.ts` (orderBy + tipo), `apps/web/app/admin/(panel)/productos/page.tsx` (whitelist, headers, paginación, clamp), `apps/web/components/admin-page.tsx` (cursor-pointer del primitive — coordinar con Frente 3, no duplicar).

Recordatorio GUI: tras implementar, probar visualmente en `http://localhost:4000/admin/productos` — clic en cada encabezado nuevo (Código, Categoría) y verificar que la flecha alterna asc/desc y preserva `?q=` y `?status=`; probar el input "ir a página" con un valor fuera de rango (ej. 999) para confirmar el clamp; y revisar en mobile (<640px) que el dropdown "Ordenar por" tenga las nuevas opciones.