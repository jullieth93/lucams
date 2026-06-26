Now I have enough context. Let me produce the audit.

# Dimensión 2: Patrones Repetidos + Design System Gap

## Patrones detectados en CRUDs (¿cuántas veces se duplica?)

### Search bar + filter form (Toolbar GET)
**Duplicado palabra-por-palabra en 6 archivos** (productos / categorias / clientes / pedidos / cupones / resenas). El bloque es prácticamente idéntico: `<form method="GET">` con grid `sm:grid-cols-12`, input `f-q` 5 cols, `f-status` 3 cols, `f-sort` 3 cols, botón Aplicar 1 col, link "Limpiar filtros" condicional.

- `productos/page.tsx:111-189` (78 líneas)
- `categorias/page.tsx:103-179` (76 líneas)
- `clientes/page.tsx:86-161` (75 líneas)
- `pedidos/page.tsx:118-198` (80 líneas)
- `cupones/page.tsx:124-200` (76 líneas)
- `resenas/page.tsx:149-249` (100 líneas — variante con 4 selects)

**Total: ~485 líneas de toolbar duplicadas** que podrían vivir en un solo `<AdminToolbar>`.

### Pagination footer
**Duplicado en 4 archivos** (productos, clientes, pedidos, resenas). Función `<PaginationLink>` local re-declarada en cada uno:
- `productos/page.tsx:286-312`
- `clientes/page.tsx:261-287`
- `pedidos/page.tsx:318-344`
- `resenas/page.tsx:444-473`

Wrapper "{n} items · página X de Y · Anterior/Siguiente" también copy-pasted. ~28 líneas × 4 = ~112 líneas.

### Helper `pickString(sp, key)`
**Definido localmente en 6 archivos** (productos / categorias / clientes / pedidos / cupones / resenas) — mismo código exacto:
```
function pickString(sp, key) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}
```
Debería vivir en `lib/admin/search-params.ts`.

### Parsing de filtros + status/sort whitelist
Cada page hace su propio `if (["a","b","c"].includes(raw) ? raw : "default")` con cast `as`. Cinco implementaciones distintas con la misma forma. No existe primitive.

### Empty states
**Sí hay primitive** (`AdminEmpty` en `admin-page.tsx:229-252`), usado consistentemente — esto es lo único bien resuelto. Único patrón compartido sólido del CRUD.

### Tabla vs cards listing
**Todas las listas son tabla** (`AdminTable`), nadie usa cards. En mobile la tabla hace `overflow-x-auto` con `min-w-[640px]` (admin-page.tsx:168) — Lucy abriendo desde celular ve scroll horizontal en todas las listas, que NO es la UX cómoda que pidió.

### Notices "?created=1" / "?updated=1" / "?archived=1"
Cada page lee `sp.created === "1"` y renderiza un `<AdminNotice>`. Productos: 3 notices. Cupones: 5 notices (`created`, `updated`, `paused`, `resumed`, `archived`). Categorías: 3+error. Reseñas: 6+error. Pattern repetido. **No hay `<AdminFlashNotices searchParams={sp} />` que centralice.**

### Inconsistencia paleta slate vs brand
- `product-form.tsx:90, 191, 230, 256, 293, 357, 451` → `border-slate-200` + `text-slate-900` + `text-slate-600` + `text-slate-500` + `bg-slate-900 text-white`. El form de producto está en paleta **slate** mientras que el resto del admin está en paleta **brand-purple**. Roto.
- `product-images.tsx:76, 79, 80, 97, 119, 122, 131, 134, 145, 153` → idem: `border-slate-200`, `text-slate-900`, `bg-slate-900 hover:bg-slate-800` (botón "Subir imágenes" es negro).
- `quick-actions.tsx:25, 43-44` → mezcla `border-amber-200`, `border-slate-200`, `border-emerald-200` directos — no usa tokens brand.

Es decir: `/admin/productos/[id]` y `/admin/productos/nuevo` son visualmente una página **distinta** al resto del admin. Lucy abre productos → siente que cambió de app.

## Forms repetidos

### Validación Zod compartida
Sí, ambos forms (create + edit) usan el mismo `<ProductForm>` y el mismo `productSchema` en `actions.ts`. ✅ Único bien resuelto.

### Inputs
- `<Input>` shadcn se usa en toolbars y en formularios — bien.
- Pero `product-form.tsx:138` mezcla `<Textarea>` shadcn con un `<select>` HTML nativo crudo (`product-form.tsx:162-179`) con clases manuales `border-input focus-visible:border-ring …`. Los selects de toolbars (5 archivos) también son `<select>` nativos con clases manuales `border-brand-purple/20 focus:border-brand-purple …`. **No hay `<AdminSelect>` primitive** — cada uno se reinventa.

### Submit buttons
**Caos total. Tres variantes coexistiendo:**

| Archivo | Componente usado | Color |
|---|---|---|
| `product-form.tsx:533-539` | `<Button>` shadcn con className manual `bg-slate-900 text-white hover:bg-slate-800` | NEGRO (slate-900) |
| Toolbars (5 archivos) | `<Button className="bg-gradient-brand h-9 …">` | gradient brand |
| `product-images.tsx:94-108` | `<Button className="bg-slate-900 text-white">` | NEGRO |
| `categorias/[id]/page.tsx:130-144`, `productos/[id]/page.tsx:71-79` | `<Button variant="ghost">` con `text-red-700` o `text-rose-600` | rojo plano |
| `quick-actions.tsx`, `pause/resume cupones` | `<button>` HTML crudo con className manual | varios |
| `admin-page.tsx:380-422` | `<AdminButton variant="primary">` con `bg-gradient-brand` | gradient brand |
| `admin/submit-button.tsx` | `<SubmitButton variant="primary">` con `bg-gradient-brand` | gradient brand |

**El branding manda gradient brand para acción primaria** (mandato Lucy: botones grandes con colores semánticos verde/gris/rojo). Pero `product-form.tsx` y `product-images.tsx` usan slate-900 (negro). Inconsistente y rompe brand.

Además existen DOS componentes con la misma misión (`<AdminButton>` y `<SubmitButton>`) → confusión.

### Error handling
- `product-form.tsx:66-69` usa `useActionState<ProductActionState>` con `state.fieldErrors` y `state.error` → patrón formal.
- `product-images.tsx:30, 43, 60, 71, 111` usa `useState<error>` + `useTransition` → patrón distinto.
- Toolbars (GET forms) no tienen error handling porque son navegación pura.
- Reseñas, cupones, categorías usan server actions con redirect+searchParam (`?error=…`) sin `useActionState`.

**Tres patrones de error en el mismo módulo.** No hay convención.

### Toast vs notice banner
No hay toast en absoluto. Toda señalización va vía `<AdminNotice>` (banner) leyendo `searchParams`. Funciona pero al recargar la página el banner queda fijo hasta que el usuario navegue de nuevo. Toast efímero (sonner) para acciones reversibles sería más cómodo que un banner permanente.

## `/admin/productos/[id]` — análisis ESPECÍFICO (Lucy reportó sobrecarga)

### Inventario de TODOS los campos visibles en la pantalla de edición
Source: `product-form.tsx` + el page `[id]/page.tsx`. **30+ inputs en una sola scroll vertical**, agrupados en 7 cards apiladas + un componente `<ProductImages>` apilado debajo + acciones del header (Variantes, Archivar).

| # | Sección (Card) | Campo | Uso real (diario / setup / SEO) | Línea |
|---|---|---|---|---|
| 1 | Información básica | Nombre | Setup | 98-108 |
| 2 | Información básica | Slug (URL) | Setup (auto) | 110-129 |
| 3 | Información básica | Descripción | Setup | 131-141 |
| 4 | Información básica | SKU | Setup | 144-159 |
| 5 | Información básica | Categoría | Diario | 161-186 |
| 6 | Precio | Precio venta | Diario | 200-207 |
| 7 | Precio | Precio antes (compareAt) | Promo ocasional | 208-217 |
| 8 | Precio | Costo interno | Setup | 218-225 |
| 9 | Visibilidad/flags | isActive | Diario (toggle) | 235-240 |
| 10 | Visibilidad/flags | isFeatured | Ocasional | 241-246 |
| 11 | Visibilidad/flags | isPersonalizable | Setup | 247-252 |
| 12 | SEO | seoTitle | SEO ocasional | 264-273 |
| 13 | SEO | seoDescription | SEO ocasional | 274-288 |
| 14 | Contenido enriquecido bot AI | richDescription (markdown 300-800 palabras) | Setup (bot futuro) | 302-316 |
| 15 | Contenido enriquecido bot AI | whyChooseThis (bullets) | Setup (bot futuro) | 317-333 |
| 16 | Contenido enriquecido bot AI | idealFor | Setup (bot futuro) | 334-354 |
| 17 | Comercial + Logística | warrantyMonths | Setup | 365-374 |
| 18 | Comercial + Logística | productionDays | Setup | 376-385 |
| 19 | Comercial + Logística | shippingDaysMin | Setup | 388-397 |
| 20 | Comercial + Logística | shippingDaysMax | Setup | 399-408 |
| 21 | Comercial + Logística | minimumQuantity | Setup | 411-419 |
| 22 | Comercial + Logística | maximumQuantity | Setup | 421-430 |
| 23 | Comercial + Logística | premadeSurcharge | Setup | 432-446 |
| 24 | Envío y empaque | weightGrams | Setup (Aveonline) | 460-472 |
| 25 | Envío y empaque | widthCm | Setup | 474-485 |
| 26 | Envío y empaque | heightCm | Setup | 487-498 |
| 27 | Envío y empaque | depthCm | Setup | 500-512 |
| 28 | (fuera del form) ProductImages | Upload + reorder + delete | Diario | product-images.tsx |
| 29 | Header action | Variantes | Diario (link) | [id]/page.tsx:56 |
| 30 | Header action | Archivar | Ocasional | [id]/page.tsx:66 |

**El form está estimado en ~1300 px de altura vertical en desktop, con ~28 inputs concentrados en 7 cards apiladas.** Lucy abre para cambiar el precio o desactivar el producto y tiene que hacer scroll por 22 campos de setup que no toca nunca.

### Qué usa Lucy día-a-día vs setup ocasional vs SEO

**Diario** (debería estar arriba o accesible 1-click):
- isActive toggle (ya está como quick-action en el listado ✅)
- Categoría (cambio de catálogo)
- Precio venta
- Imágenes (subir/reordenar)
- Stock por variant (vive en `/variants`)

**Ocasional** (puede vivir tras un tab):
- isFeatured, compareAtPrice (promo), warrantyMonths

**Setup inicial** (se hace 1 vez por producto, esconder por defecto):
- Slug (auto), SKU, description (markdown), richDescription, whyChooseThis, idealFor
- productionDays, shippingDaysMin/Max, minimumQuantity, maximumQuantity, premadeSurcharge
- weightGrams, widthCm, heightCm, depthCm

**SEO** (se hace al lanzar o ocasionalmente):
- seoTitle, seoDescription

### Propuesta de TABS (estructura simplificada)

5 tabs reemplazando los 7 cards. La pestaña `Resumen` es lo único visible al abrir.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Productos  ›  Fotoiman Polaroid Lucams                            │
│                                                                      │
│ 🟢 Activo  ·  COP $25.000  ·  SKU IMAN-FOTO-A4  ·  Hace 2 días      │
│                                                                      │
│ [Ver en tienda]  [Variantes (3)]  [Imágenes (5)]  [Archivar ⚠️]    │
└─────────────────────────────────────────────────────────────────────┘

┌─[Resumen]─[Texto y bot]─[Logística]─[SEO]─[Avanzado]─────────────────┐
│                                                                       │
│  RESUMEN  (lo único visible al abrir)                                 │
│                                                                       │
│  ┌── Precio ────────────┐  ┌── Visibilidad ─────────┐                │
│  │ Precio venta  $25.000│  │ 🟢 Activo (toggle)     │                │
│  │ Precio antes  $30.000│  │ ⭐ Destacado          │                │
│  │ Costo interno $12.000│  │ ✨ Personalizable      │                │
│  └──────────────────────┘  └────────────────────────┘                │
│                                                                       │
│  ┌── Identidad ─────────────────────────────────────┐                │
│  │ Nombre:       Fotoiman Polaroid Lucams           │                │
│  │ Categoría:    Magnéticos foto             [▼]    │                │
│  │ Descripción:  [...textarea 3 líneas, link "más"] │                │
│  │ Imágenes:     [thumb][thumb][thumb] + Subir más  │                │
│  └──────────────────────────────────────────────────┘                │
│                                                                       │
│  [Guardar cambios]   [Cancelar]                                       │
└──────────────────────────────────────────────────────────────────────┘
```

Tabs adicionales (perezosos, no se renderizan si no se abren):
- **Texto y bot**: richDescription, whyChooseThis, idealFor
- **Logística**: warrantyMonths, productionDays, shippingDays, peso/dims, min/max qty, premadeSurcharge
- **SEO**: seoTitle, seoDescription, slug, SKU
- **Avanzado**: slug, SKU, isPersonalizable (raro tocar), premadeSurcharge

Las imágenes pasan a vivir DENTRO del tab Resumen (ya las usa Lucy día-a-día), no apiladas debajo.

Las variantes ya viven en `/variants` (link en header) — bien.

## Primitives a EXTRAER (DRY)

Componentes que faltan y deberían vivir en `apps/web/components/admin/`:

1. **`<AdminToolbar>`** — Encapsula la 6× toolbar GET (search + status select + sort select + Aplicar + Limpiar). Props: `searchParams`, `searchPlaceholder`, `statusOptions`, `sortOptions`. Ahorraría ~485 líneas.

2. **`<AdminSelect>`** — Reemplaza los `<select>` nativos con clases manuales. Tokens brand-purple/20 consistentes.

3. **`<AdminPagination>`** — Encapsula footer "n · página X de Y · Anterior/Siguiente". Props: `total, page, totalPages, basePath, params`. Ahorraría ~112 líneas.

4. **`<AdminCRUDListing>`** — Wrapper de alto nivel = toolbar + tabla + empty + paginación. Casi todo `/admin/*/page.tsx` se vuelve config declarativa.

5. **`<AdminFormSection>`** — Sección colapsable con título + descripción para usar dentro de tabs/accordions de forms largos. Reemplaza los 7 `<Card>` apilados en product-form.

6. **`<AdminTabs>`** — Tabs server-rendered (vía searchParam `?tab=`) o client (Radix Tabs). Para divide-y-vencerás del form de producto.

7. **`<AdminStatusChip>` (también toggleable)** — Lucy ya tiene la idea en 3 lugares (`categorias/page.tsx:230-252`, `cupones/page.tsx:247-272`, badges en `pedidos/page.tsx:255-258`). Falta extraer:
   - prop `tone`: `published` (🟢) / `draft` (🟡) / `archived` (⚫) / `paused` (🟠)
   - prop opcional `action`: si se pasa, el chip se vuelve un botón submit dentro de un form
   - prop `tooltip`

8. **`<AdminDateHuman>`** — Fecha humana es-CO ("hace 2 horas" / "12 jun 3:45 p.m."), con `<time dateTime={iso} title={full}>` para tooltip absoluto. Hoy cada page define su propio `Intl.DateTimeFormat`:
   - `clientes/page.tsx:60-64`
   - `pedidos/page.tsx:91-97`
   - `resenas/page.tsx:94-98`
   - cupones usa `c.validFrom.toLocaleDateString("es-CO")` inline (`cupones/page.tsx:274-275`)

9. **`<AdminConfirmDialog>`** — Reemplazo de `<ConfirmAction>` con Radix AlertDialog en lugar de `window.confirm()`. Hoy `confirm-action.tsx:40` usa el confirm nativo del navegador (feo, no brand, no labels en es-CO custom). Lucy se ve un cuadro de Chrome blanco.

10. **`<AdminFlashNotices>`** — Lee searchParams (`created=1`, `updated=1`, `archived=1`, `error=...`) y renderiza los notices correctos. Centraliza el patrón duplicado en 6 archivos.

11. **`<AdminQuickAction>`** — Encapsula los botones "toggle activar/desactivar/restaurar" en filas de tabla. Hoy `quick-actions.tsx` (productos) y los inline-forms en `categorias/page.tsx:230-303` y `cupones/page.tsx:248-272` y `resenas/page.tsx:338-411` reescriben el mismo patrón.

12. **`<AdminPriceInput>`** — Conversión pesos↔centavos con prefix `$`. Hoy es función local `<PriceField>` en `product-form.tsx:573-612`. Va a necesitarse en cupones (fixed amount), pedidos (descuento manual), shipping rates.

13. **`<AdminMarkdownTextarea>` (extender el existente `markdown-editor.tsx`)** — Lucy ya tiene `markdown-editor.tsx` pero `product-form.tsx:132-141` y `product-form.tsx:307-316` usan `<Textarea>` plano para campos que se renderizan como markdown en storefront. Inconsistencia: el editor pro vive solo en bloques CMS.

14. **`lib/admin/search-params.ts`** — `pickString`, `pickEnum<T>`, `pickInt`, `buildQuery` para no reescribir parsing en cada page.

## Findings principales

### Toolbar GET duplicada en 6 archivos (~485 líneas)
- `productos/page.tsx:111-189`
- `categorias/page.tsx:103-179`
- `clientes/page.tsx:86-161`
- `pedidos/page.tsx:118-198`
- `cupones/page.tsx:124-200`
- `resenas/page.tsx:149-249`

### Pagination + `PaginationLink` duplicado en 4 archivos
- `productos/page.tsx:286-312`
- `clientes/page.tsx:261-287`
- `pedidos/page.tsx:318-344`
- `resenas/page.tsx:444-473`

### Helper `pickString` duplicado en 6 archivos
Mismo cuerpo exacto.

### Paleta rota: product-form y product-images usan slate (negro), resto del admin usa brand-purple
- `product-form.tsx:90, 92, 191, 193, 230, 232, 256, 258, 293, 295, 357, 359, 451, 453, 533, 535, 539, 542, 562, 567` → slate everywhere, botón submit **bg-slate-900** (negro)
- `product-images.tsx:76, 79, 80, 97, 119, 122, 131, 134, 145, 153, 167` → slate everywhere, botón **bg-slate-900**
- vs resto del admin (toolbars, tablas): `border-brand-purple/10`, `text-brand-purple-dark`, `bg-gradient-brand`

**Esto es probablemente el principal disparador del "se siente sobrecargado e incómodo" de Lucy** — el editor del producto LOOKS LIKE ANOTHER APP. Cambia de paleta brand a paleta admin-genérico al entrar a editar producto.

### Tres patrones distintos de submit button conviviendo
- `<AdminButton variant="primary">` (admin-page.tsx) → gradient brand ✅
- `<SubmitButton variant="primary">` (admin/submit-button.tsx) → gradient brand ✅ pero duplica AdminButton
- `<Button>` shadcn con className manual `bg-slate-900` en product-form/product-images → NEGRO ❌

Hay que **eliminar `<AdminButton>` o `<SubmitButton>`** (uno de los dos) y migrar product-form/product-images a la primitive única.

### Form de producto con 7 cards apiladas y ~28 inputs sin tabs/accordion
`product-form.tsx` líneas 86-545 → 459 líneas de form lineal. No hay agrupación visual progresiva (todo está siempre abierto). Es lo que Lucy llama "sobrecargado". Recomendación: tabs `?tab=resumen|texto|logistica|seo|avanzado`.

### `<select>` HTML crudos en lugar de Radix Select
- Toolbars: 12 `<select>` nativos con clases brand.
- `product-form.tsx:162-179`: el dropdown de categoría es nativo con un className de 200 caracteres copiado de shadcn.
- Sin `<AdminSelect>` primitive. shadcn ya tiene `Select` Radix → usarlo.

### Toggle/badge clickeable reinventado 3 veces
- Categorías badge-toggle (`categorias/page.tsx:230-252`)
- Cupones badge-toggle pausar/reactivar (`cupones/page.tsx:247-272`)
- Reseñas (acciones más granulares — múltiples botones)

Patrón está claro pero no extraído.

### `confirm-action.tsx` usa `window.confirm()` nativo del navegador
`confirm-action.tsx:40` → diálogo blanco del browser, sin brand, sin íconos, sin nuance "destructivo vs informativo". Para Lucy es el momento más jarring del admin (sale del kawaii brand al diálogo de Chrome). Falta `<AdminConfirmDialog>` Radix AlertDialog.

### Notices via searchParam (`?created=1`) sin toast — banner permanente hasta navegar
Funciona pero al recargar/volver atrás los notices vuelven a aparecer. Hoy también se acumulan (productos puede mostrar 3 notices simultáneos). Lucy lo lee 1 vez → debería desaparecer. Recomendación: sonner toast + searchParam transitorio.

### Fechas en es-CO reinventadas en cada page
4 declaraciones de `Intl.DateTimeFormat("es-CO", …)` con formatos ligeramente distintos. Lucy ve "12 jun 2026" en clientes pero "12 jun 2026 14:35" en pedidos y "12/06/2026" inline en cupones. Inconsistencia visual. Falta `<AdminDateHuman value={createdAt} mode="short|long|relative" />`.

### El form de producto NO tiene barra sticky de Guardar/Cancelar
`product-form.tsx:532-543`: el `[Guardar cambios] / Cancelar` está al final del form, después de scroll de ~28 campos. Si Lucy edita el precio (campo 6) tiene que scrollear hasta abajo para guardar. **Falta sticky bottom-bar** en edición — patrón común en admin de productos (Shopify, Linear, etc.).

### Mobile UX: tabla con scroll horizontal
`admin-page.tsx:165-168`: `AdminTable` tiene `overflow-x-auto min-w-[640px]`. Lucy abre admin desde celular cuando atiende WhatsApp → ve scroll horizontal en TODAS las listas. No hay variante mobile-card view. Mandato Lucy: "abre desde móvil cuando atiende WhatsApp". Acá la UX se rompe.

### Falta primitive para "header con quick-stats arriba de la lista"
Sería útil mostrar (en `/admin/pedidos`, p.ej.) un strip de KPIs (Pendientes pago: 3, En preparación: 5, Enviados hoy: 12) clickeable como filtros — pattern típico de admin operacional. Hoy solo hay subtitle "N pedidos · con filtros aplicados".