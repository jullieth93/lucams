# Plan de Redesign Admin Lucams_shop — 2026-06-26

## Executive Summary

El admin **no está roto** — tiene un design system funcional (`admin-page.tsx` con 15 primitives + `admin-shell.tsx` con sidebar gradient brand) y **22 de 29 páginas (76%)** ya lo usan correctamente. La queja real de Lucy se concentra en **3 focos puntuales**: (1) `product-form.tsx` es un outlier de 647 LOC con 8 cards apiladas en paleta slate-negra fuera del brand — el verdadero "sobrecargado"; (2) sidebar con 11 áreas top-level mezclando lo diario con Fase 5+ viola Miller's law; (3) ~20 strings con voseo argentino + ~36 con jerga técnica ("soft-delete", "slug", "storefront", "webhook") que rompen el mandato no-técnico. El plan propone **strangler fig por capas** (no big bang): completar adopción del design system, partir product-form en tabs, agrupar sidebar por frecuencia operacional, normalizar copy es-CO, y agregar kanban opcional. **Total estimado: 60-85h sin kanban, 80-110h con kanban (~3-4 semanas de trabajo enfocado).**

## Diagnóstico HONESTO

### `/admin/productos/[id]` edición — el problema concreto

**Es real y medible**: ~28 inputs en 7 cards apiladas verticalmente, ~1300px de altura, paleta slate-200/slate-900 (negra) cuando todo el resto del admin es brand-purple. Lucy entra a cambiar UN precio y debe scrollear por 22 campos de setup.

Distribución actual de campos:
- **Diario (4)**: isActive, categoría, precio venta, imágenes
- **Ocasional (3)**: isFeatured, compareAtPrice, warrantyMonths
- **Setup una vez (15)**: slug, sku, description, richDescription, whyChooseThis, idealFor, productionDays, shippingDaysMin/Max, minQty/maxQty, premadeSurcharge, weight, width, height, depth
- **SEO (2)**: seoTitle, seoDescription
- **Costos internos (1)**: costCop
- **Flags técnicos (3)**: isPersonalizable, varios

**Propuesta de tabs** (1 visible al abrir, 4 ocultas):
- `?tab=resumen` (default): nombre + categoría + precio venta + imágenes + toggle "🟢 Visible" → 80% de las ediciones de Lucy
- `?tab=texto`: descripción corta + richDescription + whyChooseThis + idealFor (todo bot AI)
- `?tab=logistica`: warranty, productionDays, shippingDays, peso, dimensiones, min/max qty
- `?tab=seo`: seoTitle, seoDescription
- `?tab=avanzado`: slug, sku, isPersonalizable, premadeSurcharge, costCop

### Top 5 problemas reales del admin general

1. **Sidebar con 11 grupos top-level** (`admin-nav.ts:78-293`) mezcla lo diario (Pedidos) con Fase 5 (Materiales, Bot WhatsApp, Mayorista). 13 de 30+ entradas son placeholders no clickeables que ocupan línea visual. Violación clara de Miller's law (7±2).

2. **`product-form.tsx` + `product-images.tsx` están en paleta slate** (28 hits `slate-*`, 0 `brand-*`) cuando todas las demás páginas tienen 0 slate. Lucy literalmente "cambia de app" al entrar a editar producto — esto explica buena parte del "se siente incómodo".

3. **~20 strings con voseo argentino**: "Probá quitar", "Podés restaurarlo", "Acá va el contenido", "Generá un secret", "Registrá uno arriba". Concentrados en `/integraciones/aveonline` (6), `/finanzas` (4), `/clientes` (5).

4. **Toolbar + paginación + pickString duplicados 6 veces** (~600 líneas de boilerplate). No hay `<AdminCRUDListing>` primitive — cada CRUD reinventa el mismo patrón con pequeñas variaciones.

5. **Mobile: tabla con `min-w-[640px]` + scroll horizontal en TODOS los listings** + touch targets sub-AAA (32-36px en sidebar, 16×16px en checkboxes). Lucy abre admin desde celular cuando atiende WhatsApp — la UX se rompe ahí.

### Lo que SÍ funciona (NO tocar)

- **`components/admin-page.tsx`** (423 LOC, 15 primitives) — base sólida. Extender, no reescribir.
- **`components/admin-shell.tsx`** (495 LOC) — sidebar gradient, drawer mobile, breadcrumb auto, dropdown user. Solo necesita reordenar grupos + pulir touch targets.
- **`/admin/contenido/bloques/[id]` editor** (`block-editor-form.tsx`) — es la referencia de cómo se debe sentir el admin: preview side-by-side, toolbar visual, status chips con emojis 🟢🟡, confirmaciones contextuales, sticky bottom bar. Sirve como modelo para refactorizar product-form.
- **Server actions con `useActionState` + redirect+searchParam** — patrón establecido, funciona.
- **Listings (`pedidos/page.tsx`, `productos/page.tsx`, `clientes/page.tsx`)** ya 100% brand. Solo pulir copy + fechas humanas.
- **`AdminNotice` ya tiene emojis 🟢🟡🔴💡** — no reinventarlo.
- **`AdminBadge` con 8 tonos brand** — usar más, no rehacer.
- **Dashboard estructura** (OpsCards + KpiCards + QuickLinks) — buena base, solo necesita queries reales + renombres.

## Design System Admin propuesto

### Primitives a EXTRAER (nuevos, en `components/admin/`)

```tsx
// 1. Reemplaza ~485 líneas de toolbar duplicada en 6 páginas
<AdminToolbar
  searchParams={sp}
  searchPlaceholder="Buscar por nombre o código…"
  statusOptions={[{value:"active", label:"Solo activos (visibles)"}, ...]}
  sortOptions={[{value:"recent", label:"Más recientes"}, ...]}
/>

// 2. Reemplaza ~112 líneas de pagination duplicada en 4 páginas
<AdminPagination total={total} page={page} totalPages={tp} basePath="/admin/productos" params={sp} />

// 3. Wrapper de alto nivel — CRUD page declarativa
<AdminCRUDListing
  toolbar={<AdminToolbar ... />}
  columns={[...]}
  rows={items}
  emptyState={<AdminEmpty ... />}
  pagination={...}
  mobileCardView // renderiza cards en lugar de tabla en < sm
/>

// 4. Tabs server-rendered con searchParam
<AdminTabs param="tab" defaultTab="resumen" tabs={[
  {key:"resumen", label:"Resumen", content: <ResumenSection/>},
  {key:"texto", label:"Texto y bot", content: <TextoSection/>},
  ...
]}/>

// 5. Sección colapsable con título + descripción
<AdminFormSection title="Precio" description="Precio venta + comparación + costo">
  ...
</AdminFormSection>

// 6. Status chip toggleable (reemplaza 3 reinvenciones)
<AdminStatusChip
  tone="published" // | "draft" | "archived" | "paused"
  label="Activo"
  action={<SubmitButton formAction={toggle}>...</SubmitButton>}
/>

// 7. Fecha humana es-CO con tooltip absoluto
<AdminDateHuman value={createdAt} mode="relative" />
// → "hace 2 horas" + title="12 jun 2026, 3:45 p.m."

// 8. Confirm dialog Radix (reemplaza window.confirm nativo)
<AdminConfirmDialog
  trigger={<Button variant="danger">Archivar</Button>}
  title='¿Archivar "Imán Polaroid Lucams"?'
  description="Dejará de mostrarse en la tienda. Puedes restaurarlo cuando quieras."
  destructive
/>

// 9. Flash notices centralizado (lee searchParams)
<AdminFlashNotices searchParams={sp} />

// 10. Quick action button (toggle en row)
<AdminQuickAction action={toggleActive} variant="warning">Desactivar</AdminQuickAction>

// 11. Price input pesos↔centavos (ya existe inline como PriceField, extraer)
<AdminPriceInput name="priceCop" label="Precio venta" valueCop={priceCop} />

// 12. Bottom-nav mobile (nuevo)
<AdminBottomNav items={[
  {href:"/admin/dashboard", icon:Home, label:"Hoy"},
  {href:"/admin/pedidos", icon:ShoppingBag, label:"Pedidos", badge:3},
  {href:"/admin/productos", icon:Package, label:"Catálogo"},
  {href:"/admin/clientes", icon:Users, label:"Clientes"},
]}/>

// 13. Helper utilities
// lib/admin/search-params.ts → pickString, pickEnum<T>, pickInt, buildQuery
// lib/format.ts → formatRelativeES(date)
```

### Tokens brand admin (consolidar)

**Paleta restringida (lo que ya hay en `globals.css`):**
- Principal: `brand-purple` (`#7C6AAD`), `brand-purple-dark` (`#3D2E5C`)
- Secundarios: `brand-turquoise`, `brand-pink`, `brand-coral`, `brand-yellow`
- Neutros: `brand-cream` (`#FFF8F0`) como fondo del admin
- **PROHIBIDO**: `slate-*`, `gray-*` en código nuevo del admin. Auditar product-form y product-images como deuda.

**Espaciado uniforme:**
- Cards interiores: `p-5` (no `p-4` o `p-6` mezclados)
- Gap entre secciones: `space-y-6`
- Padding sidebar items: `min-h-[44px]` para tocar AAA en mobile
- Inputs: `h-10` en mobile (no `h-8` actual)

**Tipografía:**
- Headings admin: `Fredoka` (display) — solo en H1/H2 de páginas
- Cuerpo: `Inter` — todo el resto
- Mono solo para códigos identificadores (SKU, tracking number, order number)

### Patterns establecidos

**Status chips con emoji** (ya parcialmente en `AdminNotice`, extender):
- 🟢 Activo / Publicado / Pagado / Entregado
- 🟡 Borrador / Inactivo / Esperando pago / En preparación
- ⚫ Archivado / Cancelado
- 🔴 Reclamo abierto / Error / Vencido
- 🟠 Pausado
- ⭐ Destacado
- 🆕 Nuevo
- 🔁 Recurrente

**Fechas humanas** (helper único `formatRelativeES`):
- < 1 min: "ahora mismo"
- < 1 h: "hace N minutos"
- < 24 h: "hace N horas"
- < 7 días: "ayer" / "hace N días"
- ≥ 7 días: "el 12 de junio a las 3:45 p.m."
- Siempre con `<time dateTime={iso} title={full}>` para tooltip absoluto

**Confirmaciones destructivas** (Radix AlertDialog vía `AdminConfirmDialog`):
- Título es-CO tuteo: "¿Archivar este producto?"
- Descripción explica consecuencia + reversibilidad: "Dejará de mostrarse en la tienda. Puedes restaurarlo en 30 días desde la papelera."
- Botón confirmar rojo solo si destructivo irreversible
- Para publicar/despublicar: brand-purple, no rojo (no es destructivo)

### Mascote mapache en empty states

**Cuándo SÍ:**
- Empty states de listings principales (productos, pedidos, clientes, reseñas, cupones) — pose "saludando"
- Cuando todo está "Al día" en dashboard — pose "feliz/relajado"
- 404 catch-all `[...placeholder]` — pose "buscando con linterna"
- Toast de éxito post-publicar — mini mascote en esquina (opcional)

**Cuándo NO:**
- Empty states de filtros (búsqueda sin resultados) — solo copy + CTA "Limpiar filtros"
- Errores de formulario (campo inválido) — mensaje técnico solo
- Confirmaciones destructivas — no aliviar gravedad con mascote
- Tablas con 1-2 filas — mascote es para "0 filas" no "pocas filas"

**Acción humana requerida**: Lucy debe confirmar que tiene variantes del mascote para: saludando / feliz / buscando / curioso. Hoy solo conocemos la pose "front insignia".

## Jerarquía Sidebar propuesta (agrupada)

Reducir de 11 grupos top-level a **5 secciones** separadas con divider + eyebrow label. Items "Próximo/Fase X" colapsados al final de cada sección, no en grupo aparte.

```
┌─────────────────────────────────┐
│ 🦝 Panel admin                  │
│    Lucams_shop                  │
├─────────────────────────────────┤
│                                 │
│ ─── HOY ───                     │
│ 🏠 Inicio                       │
│ 🛒 Pedidos              🟡 3    │
│ 💬 Mensajes             🔴 2    │
│ ⭐ Reseñas              🟡 1    │
│ ⚠️ Stock bajo                   │
│                                 │
│ ─── CATÁLOGO ───                │
│ 📦 Productos                    │
│ 🗂️ Categorías                   │
│ 🎁 Ocasiones                    │
│ 🏷️ Cupones                      │
│ ✨ Plantillas Estudio  [Próximo]│
│                                 │
│ ─── PERSONAS ───                │
│ 👥 Clientes                     │
│ 🛟 Reclamos           [Fase 4]  │
│ 🔑 Admins (super)               │
│                                 │
│ ─── REPORTES ───                │
│ 💰 Finanzas                     │
│ 🧾 Auditoría                    │
│ 📈 Métricas          [Fase 4]   │
│ 📊 Performance       [Próximo]  │
│ 🚨 Errores           [Próximo]  │
│                                 │
│ ─── CONFIGURACIÓN ───           │
│ ⚙️ Ajustes del negocio          │
│ 📝 Bloques de contenido         │
│ ✉️ Plantillas de correo         │
│ 🔌 Integraciones                │
│ ↪️ Redirects 301                │
│ 🏭 Producción        [Fase 5]   │
│ 🛍️ Canales extra     [Próximo]  │
│ 🤝 Mayorista B2B     [Próximo]  │
│ 🤖 Bot WhatsApp      [Fase 5+]  │
│                                 │
├─────────────────────────────────┤
│ 🦝 Lucy Hurtado                 │
│    Administradora    [▼]        │
└─────────────────────────────────┘
```

**Reglas:**
- "Inicio" reemplaza "Dashboard" (palabra más cálida)
- Items con badge dinámico de count (queries cacheadas con `unstable_cache` tag `admin-nav-counts`)
- "Mensajes" y "Stock bajo" se ocultan hasta que tengan contenido real
- Quita el badge "Free" (del footer) — confunde porque mandato #2 dice "Pro al lanzar" y eso es info de pricing/dev
- Mobile: drawer slide-in mantiene la misma estructura, pero las 5 secciones HOY se duplican como **bottom-nav** persistente

## Páginas críticas — Mockups ASCII

### Dashboard "Hoy" (nuevo home admin)

```
┌────────────────────────────────────────────────────────────────────┐
│ ¡Hola, Lucy! 👋  Hoy es jueves 26 de junio, 9:32 a.m.             │
│                                                                    │
│ 🟢 Todo al día · Tu tienda funciona bien                          │
└────────────────────────────────────────────────────────────────────┘

┌─ NECESITA TU ATENCIÓN ─────────────────────────────────────────────┐
│                                                                    │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│ │ 🟡 3 pedidos    │ │ 🔴 2 mensajes   │ │ ⭐ 1 reseña     │       │
│ │ esperando pago  │ │ sin responder   │ │ por moderar     │       │
│ │ → Ver pedidos   │ │ → Ver mensajes  │ │ → Revisar       │       │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

┌─ TU NEGOCIO HOY ───────────────────────────────────────────────────┐
│                                                                    │
│  Ingresos hoy         Pedidos hoy        Clientes nuevos          │
│  $245.000  ↑ 12%      8  ↑ 3 vs ayer    2  esta semana            │
│  ────────────────     ─────────────     ─────────────             │
│  [sparkline 7d]       [sparkline 7d]    [sparkline 7d]            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

┌─ ACCESO RÁPIDO ────────────────────────────────────────────────────┐
│                                                                    │
│ [📦 Nuevo producto] [🏷️ Nuevo cupón] [📝 Editar legales]          │
│ [✉️ Editar email]   [🔌 Integraciones]                            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### `/admin/productos/[id]` simplificado (TABS)

```
┌────────────────────────────────────────────────────────────────────┐
│ ← Productos  ›  Imán Polaroid Lucams                              │
│                                                                    │
│ 🟢 Visible · COP $25.000 · IMAN-FOTO-A4 · Editado hace 2 días     │
│                                                                    │
│      [Ver en tienda]  [Variantes (3)]  [Despublicar]  [Archivar]  │
└────────────────────────────────────────────────────────────────────┘

┌─[●Resumen]─[Texto y bot]─[Logística]─[SEO]─[Avanzado]──────────────┐
│                                                                    │
│  ┌─────────────────────────┬──────────────────────────┐           │
│  │ IDENTIDAD               │ IMÁGENES (5)             │           │
│  │                         │                          │           │
│  │ Nombre                  │ [📷][📷][📷][📷][📷] +  │           │
│  │ ┌─────────────────────┐ │                          │           │
│  │ │ Imán Polaroid       │ │ Arrastra para reordenar  │           │
│  │ └─────────────────────┘ │                          │           │
│  │                         └──────────────────────────┘           │
│  │ Categoría               ┌──────────────────────────┐           │
│  │ [Magnéticos foto    ▼]  │ VISIBILIDAD              │           │
│  │                         │                          │           │
│  │ Descripción corta       │ 🟢 Visible en la tienda  │           │
│  │ ┌─────────────────────┐ │ ⭐ Destacado en home     │           │
│  │ │ Imán polaroid 5x5   │ │ 🎨 Personalizable        │           │
│  │ │ con tu foto...      │ └──────────────────────────┘           │
│  │ └─────────────────────┘                                        │
│  │ ┌─ PRECIO ──────────────────────────────────────────┐         │
│  │ │ Precio venta:    $ 25.000                         │         │
│  │ │ Precio antes:    $ 30.000  (promo)                │         │
│  │ │ Costo interno:   $ 12.000  (no se muestra)        │         │
│  │ └────────────────────────────────────────────────────┘         │
│  │                                                                │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ STICKY:  [Cancelar]              [💾 Guardar cambios]       │ │
│ └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

Tabs adicionales (perezosas):
- **Texto y bot**: descripción larga + "Por qué elegir este" + "Ideal para"
- **Logística**: garantía, días producción, días envío, peso, dimensiones, min/max
- **SEO**: título Google, descripción Google
- **Avanzado**: dirección web (slug), código interno (sku), recargo plantillas premium

### `/admin/pedidos` KANBAN

```
┌────────────────────────────────────────────────────────────────────┐
│ Pedidos                                  [Vista: Kanban ▼] [Tabla] │
│                                                                    │
│ Filtros rápidos: [Hoy] [Esta semana] [Atrasados] [Todos]          │
│ Buscar: [_______________________]                                  │
└────────────────────────────────────────────────────────────────────┘

┌─🟡 Pago─┬─🟢 Pagado─┬─🎨 Producción─┬─📦 Empacado─┬─🚚 Despachado┐
│  (3)    │   (5)     │    (2)         │    (1)      │    (4)        │
├─────────┼───────────┼────────────────┼─────────────┼───────────────┤
│         │           │                │             │               │
│ ┌─────┐ │ ┌───────┐ │ ┌───────────┐ │ ┌─────────┐ │ ┌───────────┐ │
│ │#1234│ │ │#1230  │ │ │#1228      │ │ │#1225    │ │ │#1220      │ │
│ │María│ │ │Juan   │ │ │Sofía      │ │ │Carlos   │ │ │Andrea     │ │
│ │$45k │ │ │$120k  │ │ │$80k       │ │ │$35k     │ │ │$95k       │ │
│ │5min │ │ │1h     │ │ │ayer       │ │ │ayer     │ │ │hace 2 días│ │
│ │💳   │ │ │💳 ✓   │ │ │🎨 estudio │ │ │📦 listo │ │ │🚚 SER123  │ │
│ └─────┘ │ └───────┘ │ └───────────┘ │ └─────────┘ │ └───────────┘ │
│ ┌─────┐ │ ┌───────┐ │ ┌───────────┐ │             │ ┌───────────┐ │
│ │#1235│ │ │#1231  │ │ │#1227      │ │             │ │#1218      │ │
│ │ ... │ │ │ ...   │ │ │ ...       │ │             │ │ ...       │ │
│ └─────┘ │ └───────┘ │ └───────────┘ │             │ └───────────┘ │
│         │           │                │             │               │
│ ⏰ #1233│           │                │             │ ✅ #1219      │
│ atrasado│           │                │             │ entregado     │
│         │           │                │             │               │
└─────────┴───────────┴────────────────┴─────────────┴───────────────┘

[Arrastra cards entre columnas para cambiar estado]
[Click en card para abrir detalle en panel lateral →]
```

### Quick add FAB (con mascote)

```
                                              ┌────────────────────┐
                                              │ ¿Qué quieres crear?│
                                              │                    │
                                              │ 🛒 Pedido manual   │
                                              │ 📦 Producto        │
                                              │ 🏷️ Cupón           │
                                              │ 🗂️ Categoría       │
                                              │ 📝 Bloque contenido│
                                              └────────────────────┘
                                                         ↑
                                                    ┌─────────┐
                                                    │   🦝    │
                                                    │  (+)    │
                                                    └─────────┘
                                                  bottom: 24px
                                                  right:  24px
                                                  size:   56×56
                                                  color:  pink #E85B9F
```

## Plan de Trabajo Priorizado

### 🔴 P0 — Sobrecarga visible inmediata (~24h)

Lo que duele YA a Lucy según su feedback directo:

| ID | Título | Horas | Dependencias |
|---|---|---|---|
| ADM-P0-001 | Partir `product-form.tsx` en 5 tabs (Resumen/Texto/Logística/SEO/Avanzado) | 8 | - |
| ADM-P0-002 | Migrar `product-form.tsx` + `product-images.tsx` de paleta slate a brand (28 sites) | 3 | ADM-P0-001 |
| ADM-P0-003 | Sticky bottom bar "Guardar cambios" en product-form | 1 | ADM-P0-001 |
| ADM-P0-004 | Sidebar reagrupada a 5 secciones (`admin-nav.ts`) + remover badge "Free" | 3 | - |
| ADM-P0-005 | Voseo → tuteo: ~20 strings en pedidos/clientes/cupones/integraciones/aveonline | 2 | - |
| ADM-P0-006 | Renombres jerga técnica: 36 strings ("soft-delete", "slug", "storefront", "flags", "Surcharge templates PREMADE") | 4 | - |
| ADM-P0-007 | Quitar `make seed-products` y comandos terminal de empty states UI | 1 | - |
| ADM-P0-008 | Helper `formatRelativeES` + aplicar en pedidos/clientes/auditoría | 2 | - |

### 🟠 P1 — Design system + páginas críticas (~32h)

| ID | Título | Horas | Dependencias |
|---|---|---|---|
| ADM-P1-001 | Extraer `<AdminToolbar>` primitive + migrar 6 CRUDs | 5 | - |
| ADM-P1-002 | Extraer `<AdminPagination>` primitive + migrar 4 CRUDs | 2 | - |
| ADM-P1-003 | Extraer `<AdminSelect>` primitive (Radix Select brand-aware) | 2 | - |
| ADM-P1-004 | Extraer `<AdminCRUDListing>` wrapper de alto nivel | 4 | P1-001, P1-002 |
| ADM-P1-005 | Extraer `<AdminConfirmDialog>` (Radix AlertDialog) + migrar todos los `confirm-action.tsx` | 3 | - |
| ADM-P1-006 | Extraer `<AdminFlashNotices>` + centralizar lectura de searchParams | 2 | - |
| ADM-P1-007 | Extraer `<AdminStatusChip>` con emojis 🟢🟡⚫ + migrar productos/cupones/categorías | 3 | - |
| ADM-P1-008 | Dashboard "Hoy" — queries reales (pedidos pendientes, ingresos hoy, alertas) | 5 | - |
| ADM-P1-009 | `lib/admin/search-params.ts` helpers (pickString, pickEnum, pickInt, buildQuery) | 1 | - |
| ADM-P1-010 | Touch targets ≥44px en sidebar nav, drawer close, checkboxes | 2 | - |
| ADM-P1-011 | `focus-visible:ring-3` consistente en admin-shell.tsx (sidebar nav) | 1 | - |
| ADM-P1-012 | Escape key cierra drawer + dropdowns (a11y WCAG 2.1.1) | 2 | - |

### 🟡 P2 — Páginas secundarias + polish (~24h)

| ID | Título | Horas | Dependencias |
|---|---|---|---|
| ADM-P2-001 | Empty states con mascote en 10 listings | 4 | (asset mascote variantes) |
| ADM-P2-002 | Mobile bottom-nav con 4 atajos (Hoy/Pedidos/Catálogo/Clientes) | 4 | P0-004 |
| ADM-P2-003 | Mobile: vista cards alternativa en listings (`< sm:`) | 5 | - |
| ADM-P2-004 | Back-button mobile en topbar cuando hay breadcrumb deep | 1 | - |
| ADM-P2-005 | Cmd+K / botón buscador global (pedidos por número, clientes, productos) | 6 | - |
| ADM-P2-006 | Quick Add FAB con mascote (bottom-right, popover 5 acciones) | 3 | (asset mascote saludando) |
| ADM-P2-007 | Toast efímero (sonner) reemplazando `?created=1` banner que queda fijo | 2 | - |
| ADM-P2-008 | Refactor `/admin/integraciones/aveonline` a copy no-técnico + esconder bloque devops | 3 | - |
| ADM-P2-009 | Customer 360 con tabs (Pedidos / Reseñas / Diseños / Notas / WhatsApp) | 6 | - |
| ADM-P2-010 | "Vistas guardadas" como chips en `/admin/pedidos` ("Hoy", "Atrasados", "Pendientes pago") | 2 | - |

### 🔵 P3 — Feature nueva opcional (~24h)

| ID | Título | Horas | Dependencias |
|---|---|---|---|
| ADM-P3-001 | Kanban pedidos con drag-drop (@dnd-kit) | 12 | - |
| ADM-P3-002 | Server action `moveOrderStatusAction` con saga (notify + audit + email) | 6 | P3-001 |
| ADM-P3-003 | Side panel detalle pedido (sheet drawer Radix) | 4 | P3-001 |
| ADM-P3-004 | Toggle tabla/kanban con `?view=` para fallback | 2 | P3-001 |

## Estimación horas totales

- **P0 — Sobrecarga inmediata**: 24h
- **P1 — Design system + páginas críticas**: 32h
- **P2 — Páginas secundarias + polish**: 24h
- **P3 — Kanban (opcional, feature nueva)**: 24h

| Escenario | Total | Equivalente |
|---|---|---|
| Solo P0 (lo que duele ya) | **24h** | ~1 semana enfocada |
| P0 + P1 (sobrecarga + design system completo) | **56h** | ~2 semanas |
| P0 + P1 + P2 (todo el redesign UX) | **80h** | ~3 semanas |
| Todo incluido (con kanban) | **104h** | ~4 semanas |

## Secuencia recomendada de ataque (bloques coherentes)

1. **Bloque 1 — Sobrecarga product-form** (~12h)
   - ADM-P0-001 (tabs) + P0-002 (slate→brand) + P0-003 (sticky bar)
   - Lucy ve el cambio en su zona de mayor dolor en la primera semana
   - **Validar con Lucy antes de seguir**

2. **Bloque 2 — Copy es-CO + sidebar reagrupada** (~10h)
   - ADM-P0-004 (sidebar) + P0-005 (voseo) + P0-006 (jerga) + P0-007 (terminal)
   - Cambios chicos, visibles, valor alto — bajan fricción cognitiva
   - Refactor 360° del copy en una sola pasada

3. **Bloque 3 — Design system primitives** (~20h)
   - ADM-P1-001 a P1-007 (Toolbar, Pagination, Select, CRUDListing, ConfirmDialog, FlashNotices, StatusChip)
   - Pagar deuda DRY: ~600 líneas duplicadas → primitives
   - Habilita todo lo siguiente

4. **Bloque 4 — Dashboard "Hoy" + fechas humanas + a11y mobile** (~12h)
   - ADM-P0-008 (fechas) + P1-008 (dashboard) + P1-010/P1-011/P1-012 (a11y)
   - Lucy entra a admin y ve "qué tengo que hacer hoy" sin pensar

5. **Bloque 5 — Mobile cómodo** (~14h)
   - ADM-P2-002 (bottom-nav) + P2-003 (cards mobile) + P2-004 (back) + P2-007 (toast)
   - Cumple mandato "Lucy abre desde móvil mientras atiende WhatsApp"

6. **Bloque 6 — Páginas secundarias + Customer 360 + Aveonline** (~18h)
   - ADM-P2-001 (mascote) + P2-005 (Cmd+K) + P2-006 (FAB) + P2-008 (Aveonline) + P2-009 (Customer 360) + P2-010 (vistas guardadas)
   - Polish que eleva el sentir general

7. **Bloque 7 — Kanban pedidos (opcional)** (~24h)
   - ADM-P3-001 a P3-004
   - Decisión separada — feature nueva del ROADMAP, no refactor UX
   - Si Lucy puede vivir con tabla mejorada (filtros + vistas guardadas + fechas humanas), posponer

## Riesgos

- **Tabs en product-form pueden romper `useActionState`**: si las tabs ocultas se desmontan del DOM, `FormData` pierde los valores no visibles. **Mitigación**: usar `display:none` CSS (no `unmount`) o keep all rendered y solo togglear visibilidad. Validar con prueba E2E antes de mergear.

- **Sidebar reagrupada puede romper deep-links existentes**: si Lucy bookmarkeó `/admin/contenido/configuracion`, sigue funcionando (URL no cambia). Pero `findNavItem` en breadcrumb auto-resuelto puede fallar si renombramos slugs internos. **Mitigación**: cambios SOLO en `lib/admin-nav.ts` order/grouping/labels, no en `href`.

- **Server actions atadas a layout**: `layout.tsx:17-26` solo verifica auth con `getCurrentAdmin()`. No tocar este pattern. **Mitigación**: cualquier refactor mantiene `redirect("/admin/login")` short-circuit antes del shell.

- **Mobile sheet drawer Radix no instalado**: `package.json` tiene Radix primitives pero no verifiqué `@radix-ui/react-dialog` (necesario para Sheet/Drawer estilo Vaul). **Mitigación**: el drawer mobile actual (`admin-shell.tsx:104-131`) ya funciona con `useState` puro — puede mantenerse así si no queremos agregar dependencia. Para detalle de pedido en kanban (P3) sí requiere instalar `vaul` o equivalente.

- **`@dnd-kit` para kanban no instalado** (P3): agrega ~30KB gz. Acción humana requerida: Lucy aprueba antes de instalar.

- **Mascote variantes**: solo conocemos la insignia frontal. Si no hay variantes (saludando, feliz, buscando), los empty states quedan con SVG genérico hasta que existan. **Mitigación**: usar `Sparkles` actual como fallback durante P0/P1; pedir a Lucy variantes para P2.

- **Cambios masivos de copy**: tocar ~50 strings en una sola sesión puede romper algún test E2E o snapshot. **Mitigación**: hacer P0-005 + P0-006 + P0-007 en un solo commit con `git diff` legible para revisión rápida.

- **`unstable_cache` para badges dinámicos en sidebar**: si las queries de count fallan, el badge desaparece silenciosamente. **Mitigación**: fallback a "·" en lugar de count cuando query falla; alertar en logs.

## Acciones humanas Lucy

- **ACCIÓN HUMANA REQUERIDA: Validar mockups ASCII propuestos** antes de implementar Bloque 1 (sobrecarga product-form) — confirmar que la división en 5 tabs (Resumen / Texto y bot / Logística / SEO / Avanzado) refleja cómo Lucy mentalmente agrupa los campos.

- **ACCIÓN HUMANA REQUERIDA: Confirmar variantes del mascote mapache** — Bloque 6 (empty states + FAB) requiere al menos: saludando, feliz/relajado, buscando con linterna. Si solo existe la pose frontal, el FAB y empty states usan fallback Sparkles temporalmente.

- **ACCIÓN HUMANA REQUERIDA: Aprobar agrupación sidebar propuesta** — 5 secciones (HOY / CATÁLOGO / PERSONAS / REPORTES / CONFIGURACIÓN) reemplazan las 11 actuales. Revisar el ASCII y confirmar que "Inicio" (en vez de "Dashboard") y la posición de "Reseñas" en HOY (no en CATÁLOGO) son correctas.

- **ACCIÓN HUMANA REQUERIDA: Decisión sobre kanban (P3)** — feature nueva ~24h, no refactor UX. Si Lucy puede vivir con tabla mejorada (filtros + vistas guardadas + fechas humanas + Customer 360), posponer kanban para fase posterior. Si es bloqueador operacional, prioritizar como parte del redesign.

- **ACCIÓN HUMANA REQUERIDA: Aprobar instalación de dependencias nuevas** — si vamos por P3 kanban necesitamos `@dnd-kit/core` + `@dnd-kit/sortable`. Si vamos por P2 Cmd+K necesitamos `cmdk`. Si vamos por sheet drawer mobile necesitamos `vaul`. Total ~80-100KB gz adicionales.

- **ACCIÓN HUMANA REQUERIDA: Confirmar si Lucy quiere preservar fallback de tabla en `/admin/pedidos`** cuando se implemente kanban (toggle `?view=`), o reemplazar completamente.

- **Validar tras Bloque 1**: Lucy debe entrar a `/admin/productos/[id]` y confirmar que la sensación "sobrecargado" desapareció antes de avanzar a Bloque 2.