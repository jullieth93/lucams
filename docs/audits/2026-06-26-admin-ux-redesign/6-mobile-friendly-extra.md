I have sufficient information to produce the technical audit. Let me compile the analysis.

# Dimensión 6: Auditoría Técnica del Admin Actual

## ¿Hay design system admin actual?

**Sí, y está más maduro de lo que parece.** Hay dos archivos núcleo que ya hacen el 70% del trabajo:

### `components/admin-page.tsx` (423 LOC) — primitives reusables, no wrapper
Exporta **15 primitives** ya construidos sobre paleta brand:
- Layout: `AdminPage`, `AdminPageHeader`, `AdminPageBody`
- Atómicos: `AdminCard`, `AdminTable` (+ `Head`/`Body`/`Row`), `AdminBadge`, `AdminButton`, `AdminNotice`, `AdminEmpty`
- Dashboard: `OpsCard` (con urgent state pulsante), `KpiCard` (con trend), `QuickLink`

Características brand-aware ya implementadas:
- `card-hover` utility (`globals.css:223-228`) — elevación + ring brand-purple
- `text-gradient-brand`, `bg-gradient-brand`, `glow-brand` utilities (`globals.css:233-247`)
- `AdminNotice` ya tiene los emojis 🟢🟡🔴💡 que pide Lucy (`admin-page.tsx:123`)
- `AdminBadge` tiene 8 tonos brand-aware (purple/pink/turquoise/coral/etc)

### `components/admin-shell.tsx` (495 LOC) — shell premium ya implementado
- Sidebar gradient `brand-purple-dark → brand-purple` con blobs decorativos
- `NAV` agrupado en 11 áreas (importado desde `lib/admin-nav.ts:78` — **fuente única de verdad**)
- Drawer mobile con backdrop + slide-in
- TopBar con breadcrumb auto-resuelto desde `NAV` (`admin-shell.tsx:195-210`)
- Footer dropdown con avatar + role + badge "Free"
- Badges visuales `[Próximo / Fase 4 / Fase 5]` para items soon

### Adopción del design system
- **22 de 29 páginas** (`page.tsx`) ya importan algún primitive `Admin*` (76% cobertura).
- 7 páginas pendientes son las catch-all o no listadas (placeholder, resenas tiene 473 LOC todavía mezcla).

### Estilo CSS: dos mundos coexisten
Auditoría de uso de tokens en archivos clave:

| Archivo | `brand-*` hits | `slate-/gray-` hits | Veredicto |
|---|---|---|---|
| `dashboard/page.tsx` | 8 | 0 | ✅ 100% brand |
| `pedidos/page.tsx` | 21 | 0 | ✅ 100% brand |
| `productos/page.tsx` | 16 | 0 | ✅ 100% brand |
| `productos/product-form.tsx` | **0** | **28** | ❌ pre-rediseño, slate-only |

`product-form.tsx` (el archivo que Lucy reporta como "sobrecargado") es el outlier — usa `Card`/`CardHeader`/`CardDescription` de shadcn con `border-slate-200`, no `AdminCard`. Es el ÚNICO formulario de admin sin migrar al design system brand.

### Colores brand vs slate utilitario
- Páginas listing (pedidos, productos, dashboard, contenido) → brand-purple-dark consistente.
- Formularios shadcn (`Field`, `Label`, `Input`) → todavía text-slate-700, text-slate-500 (hint), text-red-600 (error).
- El `<Button>` de shadcn (`bg-slate-900` final en product-form.tsx:535) no usa `AdminButton` ni `bg-gradient-brand` — inconsistencia visual.

---

## Refactor cost analysis por sección del admin

Estimaciones asumiendo dev velocity típica con design system ya parcialmente construido. Una "hora" = sesión enfocada con review.

### Capa 0: Base / tokens (ya hecho — 0h)
`globals.css` ya tiene tokens brand, utilities y dark mode. No hay deuda aquí.

### Capa 1: Sidebar agrupada + layout shell (**2-4h**)
- El shell ya está en `admin-shell.tsx`. Solo requiere:
  - Reordenar grupos en `lib/admin-nav.ts` (1 archivo, ~317 LOC) — agrupar Ventas/Catálogo/Comercial/Producción/Mensajes mejor según Lucy.
  - Pulir spacings + reducir altura de sidebar items en mobile.
- **Riesgo: bajo.** Cambio aislado en `admin-nav.ts`.

### Capa 2: Dashboard "Hoy" rediseño (**4-6h**)
- `dashboard/page.tsx` (244 LOC) ya usa primitives.
- Trabajo: agregar widgets nuevos (Hoy: pedidos del día, ingresos hoy, alertas operacionales reales), reemplazar valores dummy (`value={0}` en reclamos/stock — `dashboard/page.tsx:139,146`) con queries reales.
- **Riesgo: medio.** Hay queries Prisma faltantes (no urgentes ahora) — se puede mockear hoy y conectar después.

### Capa 3: `/productos` refactor con tabs/accordion (**8-12h**) — LA SOBRECARGA
- `product-form.tsx` (647 LOC, el más grande del admin) tiene **8 secciones Card secuenciales**:
  1. Información básica (name, slug, description, sku, categoría)
  2. Precio (3 PriceField)
  3. Visibilidad y flags (3 checkboxes)
  4. SEO (2 textareas)
  5. Contenido enriquecido bot AI (3 textareas con markdown)
  6. Comercial + Logística (7 inputs numéricos)
  7. Envío y empaque (4 inputs + warning amber)
  8. (fuera de form) `<ProductImages />`
- Trabajo:
  - Convertir a tabs verticales o accordion: "Básico" / "Precio" / "Contenido bot" / "Logística" / "Envío" / "SEO" / "Imágenes" / "Variantes".
  - Migrar `Card` slate → `AdminCard` brand.
  - Reemplazar `Field`/`Label` slate por componentes brand-aware (extraer a `components/admin/form.tsx` reutilizable).
  - Migrar `<Button bg-slate-900>` (línea 535) a `AdminButton variant="primary"`.
  - Sticky CTA "Guardar cambios" arriba/abajo para que no obligue scroll.
- **Riesgo: medio.** El form usa `useActionState` server action — tabs no rompen eso si todo el form sigue siendo un solo `<form>`.

### Capa 4: `/pedidos` kanban (**16-24h**) — ESCRATCH
- Hoy es tabla pura (`pedidos/page.tsx`, 344 LOC) con filtros + paginación.
- Kanban requiere:
  - Componente nuevo `<OrderKanban />` con columns por status (PENDING_PAYMENT, PAID, FULFILLING, SHIPPED, DELIVERED).
  - Drag-and-drop (recomendado `@dnd-kit` — no instalado).
  - Server action `moveOrderStatusAction` con saga (notify, audit, email).
  - Detail drawer side-sheet en vez de full-page navegación a `/admin/pedidos/[number]`.
- Mantener `/admin/pedidos?view=table` como fallback con toggle.
- **Riesgo: alto.** Es funcionalidad nueva, no refactor — hay que validar la "Operacional" promise del ROADMAP.

### Capa 5: CRUDs estandarizados a `<AdminCRUDListing>` (**6-10h**)
- 7 CRUDs candidatos: categorias, cupones, ocasiones, redirects, usuarios, email-templates, resenas.
- Cada uno hoy es ~300 LOC página + ~150 LOC form + actions. Mucho boilerplate.
- Crear primitive nuevo `<AdminCRUDListing columns rows filters bulkActions />` consume 4-6h, después cada CRUD se refactorea en ~30min.
- **Riesgo: bajo.** Strangler fig perfecto — refactorear uno por uno sin tocar el resto.

### Capa 6: Empty states + mascote mapache (**2-3h**)
- `AdminEmpty` (`admin-page.tsx:229-252`) ya existe con Sparkles fallback.
- Reemplazar Sparkles por SVG/PNG del mapache.
- Añadir 1 prop `personality?: "encouraging" | "celebratory" | "calm"` que ajusta copy + emoji.
- Aplicar en ~10 listings.

### Capa 7: Mobile sheet drawer + bottom nav (**6-10h**)
- Drawer mobile ya existe (`admin-shell.tsx:104-131`).
- Faltaría bottom-nav opcional con 4-5 atajos (Pedidos / Productos / Mensajes / Dashboard) para uso desde WhatsApp.
- Sheet/Drawer para detalle de pedido en vista kanban.
- **Riesgo: bajo.** Aditivo.

### Capa 8: Fechas humanas es-CO (**1-2h**)
- Crear helper `formatRelativeES(date): "hace 2 minutos" | "el 12 de junio a las 3:45 p.m."` en `lib/format.ts`.
- Reemplazar `Intl.DateTimeFormat("es-CO")` directos (ej. `pedidos/page.tsx:91-97`) por el helper.

### Capa 9: Páginas placeholder a real (**fuera de scope del redesign**)
- `/admin/errores`, `/admin/performance`, `/admin/reclamos`, `/admin/mensajes` caen al catch-all.
- Visual In-Place Editor (sub-bloque K) ausente.
- No es refactor — es scope nuevo. ~40-80h cada una; no incluir en presupuesto de redesign.

### Total estimado (redesign UX puro, sin features nuevas)
| Capa | Horas |
|---|---|
| Sidebar pulido | 2-4 |
| Dashboard "Hoy" | 4-6 |
| **product-form** tabs/accordion | **8-12** |
| Kanban pedidos (feature nueva) | 16-24 |
| CRUDs estandarizados (7 páginas) | 6-10 |
| Empty + mascote | 2-3 |
| Mobile bottom-nav + sheets | 6-10 |
| Fechas humanas helper | 1-2 |
| **TOTAL si excluimos kanban** | **29-47h** (~1-1.5 semanas) |
| **TOTAL con kanban** | **45-71h** (~1.5-2.5 semanas) |

---

## Riesgos técnicos del refactor

### 1. Server actions atadas al layout — **bajo riesgo**
El `layout.tsx` (`admin/(panel)/layout.tsx:17-26`) solo verifica sesión con `getCurrentAdmin()` y renderiza `<AdminShell>`. **No tiene server actions ni state propio.** Refactor del layout no afecta páginas.

### 2. Sidebar con `useState` client-side — **bajo riesgo, ya manejado**
`AdminShell` es `"use client"` (`admin-shell.tsx:21`) entera, por necesidad de `usePathname()` + drawer mobile + dropdown menu. Esto es correcto en Next 16 — el shell client envuelve `{children}` que son RSC. **No rompe streaming porque los children renderizan en server y se envían como payload separado del shell client.**

Riesgo emergente: si querés mover lógica de NAV (badges dinámicos según conteos en DB tipo "Pedidos · 3") al sidebar, vas a tener que:
- Pasar conteos como prop desde layout (server) → AdminShell (client).
- Layout hoy NO consulta DB para nav badges — tendrías que añadir queries Prisma al layout, lo cual ejecuta en cada navegación admin. Sugerido: `unstable_cache` con tag `admin-nav-counts`.

### 3. `"use client"` nested — **medio riesgo**
16 archivos en `admin/(panel)/` tienen `"use client"`. Mayoría son sub-forms (product-form, image-uploader, version-history, quick-actions). El refactor a tabs accordion en product-form **no requiere subir el boundary** porque ya es client entera.

Cuidado: si dividís product-form en 8 sub-componentes por tab, asegurate de que el `<form action={formAction}>` los englobe a todos — tabs ocultas con `display:none`/CSS están bien para que server action reciba todo el FormData. Si las desmonteás del DOM, perdés valores.

### 4. Auth gate en layout — **debe preservarse**
`layout.tsx:18-19` hace `redirect("/admin/login")` si no hay sesión. **No tocar este pattern** — middleware ya hace el check pero esto es defense-in-depth. Cualquier refactor del layout debe mantener este short-circuit antes del shell.

### 5. shadcn `Card` vs `AdminCard` — **deuda visual a saldar**
`product-form.tsx` importa `Card, CardContent, CardDescription, CardHeader, CardTitle` desde `@/components/ui/card` (shadcn). El resto del admin usa `AdminCard`. Esto explica el "feels off" — borders slate-200 vs brand-purple/10, sin `card-hover`. Migrarlo no rompe nada pero es ~20 sites en este archivo.

### 6. `productos/[id]/page.tsx` pasa `unknown` a form — **tipo loose**
Línea 47 (en product-form.tsx) y línea 344 (idem) — `idealFor?: unknown` con check `Array.isArray()`. Refactor a Zod-validated input puede romper el SSR si Prisma devuelve `null`. Cuidado al migrar.

---

## Estrategia de migración recomendada

### Recomendación: **Strangler fig por capas, NO por páginas** (~3 semanas)

Razón: el design system ya existe (`admin-page.tsx`), el shell ya existe (`admin-shell.tsx`), 76% de páginas ya lo usan. Lo que falta es **profundidad selectiva**: tocar el outlier (product-form) y agregar capacidades faltantes (kanban, bottom-nav, mascote).

#### Fase A — Quick wins visibles (semana 1, ~8h)
1. `product-form.tsx` migrado a `AdminCard` + tabs verticales + `AdminButton` brand. **Resuelve el feedback principal de Lucy ("/admin/productos sobrecargado").**
2. Helper `formatRelativeES` aplicado en pedidos, clientes, auditoría.
3. Empty states con mascote en los 5 listings principales.

Lucy ve el cambio en su zona de mayor dolor en la primera semana. Validate con ella antes de seguir.

#### Fase B — Estandarización CRUDs (semana 2, ~10h)
4. Construir `<AdminCRUDListing>` primitive.
5. Migrar 3 CRUDs simples (cupones, ocasiones, redirects) para validar el primitive.
6. Migrar los 4 restantes (categorias, usuarios, email-templates, resenas).

#### Fase C — Mobile + dashboard (semana 3, ~12h)
7. Bottom-nav mobile para 4 atajos críticos.
8. Dashboard "Hoy" con queries reales (pedidos hoy, ingresos hoy, alertas reales).
9. Pulir sidebar (orden de grupos según feedback Lucy).

#### Fase D (opcional / feature nueva) — Kanban pedidos (~20h)
Decisión separada — no es refactor UX, es feature nueva del ROADMAP.

### Por qué NO big bang
- Lucy ya está usando el admin en producción (vende desde día 1). No podemos romper flow durante 3 semanas.
- El design system **ya está construido** — un big bang no agrega valor, solo riesgo.
- Cada capa (A, B, C) entrega valor independiente que Lucy puede usar inmediatamente.

### Feature flag / A/B testing
**Recomendado: NO usar feature flag general.** El admin es uso interno, Lucy es el único usuario crítico. Validar cada capa con ella en `develop` antes de merge a `main`.

Sí recomendado: para el kanban (Fase D), agregar query param `?view=table|kanban` en `/admin/pedidos` para mantener fallback hasta que el kanban tenga 2 semanas de uso real.

Alternativa más simple para A/B contigo: ramas paralelas (`feat/admin-redesign-fase-a`, `feat/admin-redesign-fase-b`) con previews en Vercel — Lucy abre `lucams-shop-git-feat-admin-redesign-fase-a.vercel.app` y compara contra prod.

---

## Hallazgos clave para presupuestar

1. **El design system ya existe.** No es "diseñar de cero" — es "completar adopción y profundizar". Esto baja el costo ~50%.
2. **El verdadero hot spot es `product-form.tsx`** (647 LOC, slate-only, 8 cards secuenciales). 8-12h ahí resuelve el feedback más fuerte de Lucy.
3. **El shell premium ya está construido** con sidebar gradient brand, drawer mobile, dropdown user menu, badges Próximo/Fase4/Fase5. Lucy probablemente lo siente "incómodo" más por densidad de items en NAV (11 áreas top-level) y por inconsistencia interna entre páginas, no por el shell.
4. **No hay primitives reusables para forms ni CRUD listings.** Es la deuda principal del design system — crear `<AdminCRUDListing>` y `<AdminForm>` paga dividendos en TODAS las siguientes páginas.
5. **El kanban es feature nueva, no refactor.** Si se incluye en el redesign, dobla el presupuesto.

### Archivos críticos a tocar
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-page.tsx` (extender con `AdminCRUDListing`, `AdminFormField`, `AdminFormSection`, `AdminTabs`)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/product-form.tsx` (refactor #1 prioridad)
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/admin-nav.ts` (reordenar grupos)
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/format.ts` (añadir `formatRelativeES`)
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-shell.tsx` (añadir bottom-nav mobile)