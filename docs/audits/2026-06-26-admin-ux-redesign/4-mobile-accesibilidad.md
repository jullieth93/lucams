I have enough evidence now. Returning the audit.

# Dimensión 4: Mobile + Accesibilidad

## Sidebar/navegación mobile

**Hallazgo positivo:** existe drawer slide-in con backdrop blur, no sidebar permanente.

- `admin-shell.tsx:76` — sidebar desktop es `hidden ... lg:flex` (oculto < 1024px). Correcto.
- `admin-shell.tsx:82-102` — **topbar mobile sticky** (`sticky top-0 z-30`) con brand + botón hamburguesa. Bien.
- `admin-shell.tsx:94-101` — hamburger es `<button>` con `aria-label="Abrir menú"`, `Menu` icon `h-5 w-5` (20px). Padding `p-2` → touch target real ≈ 36×36px. **Debajo del mínimo WCAG 44×44px**.
- `admin-shell.tsx:106-131` — drawer correcto: backdrop clickeable + botón `X` con `aria-label="Cerrar"`. Padding `p-1.5` en el close → ≈ 32×32px, **aún más chico**.
- `admin-shell.tsx:69-71` — drawer cierra al navegar (`useEffect` + `pathname` dep). Bien.
- `admin-shell.tsx:155-186` — **`AdminTopBar` (breadcrumb desktop) está `hidden ... lg:flex`** → en mobile **no hay breadcrumb ni indicador de en qué página estás** una vez entras a un detalle. Solo el brand "Panel admin / Lucams_shop" sticky, que no cambia. Lucy pierde contexto.
- **No hay back-button** en topbar mobile cuando entras a `/admin/productos/[id]` o `/admin/pedidos/[number]`. El usuario debe abrir drawer + buscar el item padre.

## Tablas en mobile

- `admin-page.tsx:165-171` — `AdminTable` wrappea en `overflow-x-auto` + `<table className="w-full min-w-[640px]">`. **Decisión: scroll horizontal en mobile, no cards.** Comentario explícito en línea 162-164.
- En `/admin/productos/page.tsx:210-260` la tabla tiene 6 columnas (Producto, SKU, Categoría, Precio, Estado, Acciones). En pantalla 375px (iPhone SE) → scroll horizontal de ~265px. Lucy debe deslizar para ver Estado + Acciones.
- **Quick-actions inline en última columna** (`productos/page.tsx:241-254`): "Desactivar/Activar" + "Editar" lado a lado. Ambos fuera del viewport sin scroll.
- `/admin/pedidos` (asumido similar — no leído pero usa los mismos primitives) hereda el mismo patrón.
- **No hay vista alternativa "cards" para mobile**. El comentario del autor reconoce el problema pero la solución elegida (scroll-x) sacrifica discoverabilidad de columnas críticas como Estado y Acciones.

## Forms en mobile

- `product-form.tsx` tiene **647 líneas** — la queja de Lucy "se siente SOBRECARGADO" es literal: una sola pantalla muy larga.
- `product-form.tsx:90-95` — Cards de shadcn con `CardHeader/CardContent`. Stack vertical natural (no grid horizontal en mobile, bien).
- `product-form.tsx:562-565` — `<Field>` apila `Label` arriba de `children`. Bien para mobile.
- `components/ui/input.tsx:11` — **`text-base` por defecto + `md:text-sm`**. En mobile `text-base` = 16px → evita zoom iOS. **Correcto**. PERO la `h-8` (32px de alto) es **muy bajo para touch en mobile**; recomendado ≥40-44px.
- `product-form.tsx:138-149` (filtros) — `select` nativos con `py-1.5 px-2`. **Altura efectiva ~32px**, mismo problema de touch target.
- **No hay sticky bottom bar con botón "Guardar"** en `product-form.tsx`. En un form de 647 líneas, Lucy debe scrollear hasta el final para guardar. En mobile esto es muy incómodo (y si comete error de validación, vuelve arriba sin estado visible).
- `product-form.tsx:614-637` — checkboxes 4×4 (16px) con `mt-0.5 h-4 w-4`. **Touch target real ≈ 16×16px del input + el `<label>` alrededor lo extiende**, pero solo si el label tiene padding. Aquí no tiene → real ≈ 20×16px. Bajo el umbral.

## Touch targets

Resumen, todos comparados contra WCAG 2.5.5 (Target Size AAA = 44×44px, Level AA Enhanced = 24×24px):

| Elemento | Tamaño real | Pasa AA (24px) | Pasa AAA (44px) |
|---|---|---|---|
| Hamburger menu | ~36px (`admin-shell.tsx:94`) | sí | no |
| Drawer close X | ~32px (`admin-shell.tsx:117`) | sí | no |
| Sidebar items nav | `py-2 px-2.5` ~36px alto (`admin-shell.tsx:388`) | sí | no |
| Sub-nav items | `py-1.5 px-2` ~30px alto (`admin-shell.tsx:459`) | sí | no |
| Topbar "Ver el sitio" | `py-1 px-2.5` ~28px (`admin-shell.tsx:171`) | sí | no |
| Botones quick-actions productos | `py-1 px-2` ~24px (`quick-actions.tsx:25,42`) | borderline | no |
| Botones admin `size="sm"` | `py-1.5 px-2.5` (`admin-page.tsx:398`) | sí | no |
| Input base | `h-8` = 32px (`ui/input.tsx:11`) | sí | no |
| Checkbox | `h-4 w-4` = 16px (`product-form.tsx:632`) | **NO** | no |
| Avatar dropdown user | `py-2 px-2` ~36px (`admin-shell.tsx:286`) | sí | no |
| Dropdown menu items | `py-2.5 px-3` ~40px (`admin-shell.tsx:326,335`) | sí | casi |

Spacing entre acciones inline en `/admin/productos`: `gap-2` (8px) entre "Desactivar" y "Editar". Tap-error probable en mobile.

## Accesibilidad

**Lo que SÍ está bien:**

- `admin-shell.tsx:98,120,290-291` — aria-labels en hamburger, X close, dropdown user button con `aria-expanded` + `aria-haspopup`.
- `admin-shell.tsx:424` — `aria-expanded` en grupos colapsables del nav.
- `admin-page.tsx:68` — `<nav aria-label="Breadcrumb">` correcto.
- `admin-shell.tsx:146,110` — `aria-hidden` en decoraciones puramente visuales y backdrop.
- `tabular-nums` usado **24 veces** en admin (precios, KPIs, qty) — correcto para columnas numéricas.
- `components/ui/input.tsx:11` — usa `focus-visible:ring-3` + `aria-invalid` ring → buen patrón.
- `components/ui/button.tsx:8` — `focus-visible:ring-3` consistente.

**Gaps de a11y:**

- **`admin-shell.tsx` no tiene ni un solo `focus-visible:` propio** (greps = 0). Todos los `<Link>` y `<button>` del sidebar dependen del estilo nativo del browser, que con el fondo gradient `brand-purple-dark` es **muy poco visible**. Lucy navegando con teclado en mobile/desktop pierde el foco.
- `admin-shell.tsx:107-111` — backdrop del drawer es `<div onClick>` sin `role="button"` ni `onKeyDown`. Cierre por click pero no por `Escape` (no hay handler global). WCAG 2.1.1 (Keyboard) parcialmente fallado.
- `admin-shell.tsx:317` — overlay del dropdown del user footer (`fixed inset-0 z-40`) es un `<div onClick>` sin role/keyboard handler. Mismo problema.
- `confirm-action.tsx:40` — usa `window.confirm()` nativo. Accesible en sí (browsers lo manejan bien) pero el comentario admite que `AlertDialog` Radix sería superior. En mobile el confirm nativo es chico y descontextualizado.
- `admin-page.tsx:332-335` — `<Row>` usa `<dt>`/`<dd>` correctamente. Bien.
- `pedidos/[number]/page.tsx:122` — `<Image alt="">` decorativa OK. Pero el badge de qty `absolute` sobre la imagen (`:132`) **no tiene texto accesible** — el qty visual solo. Screen reader no lo lee. Hay un duplicado en el texto descriptivo (`qty {it.qty}` línea 141), entonces aceptable, pero el badge per se está mudo.
- `pedidos/[number]/page.tsx:267` — texto `⚠️ Tracking simulado` usa emoji como única señal de warning. Sin `role="status"` ni clase distintiva más allá de color amber-700. Daltónicos pierden info.
- **Iconos lucide en botones de acción**: la mayoría tienen texto al lado (`Editar`, `Desactivar`, `Restaurar`). Cuando son **icon-only** (hamburger, X close) tienen aria-label. Audit: OK.
- **Contraste:**
  - `admin-shell.tsx:298` email del admin en `text-white/85` sobre `brand-purple-dark` gradient — ratio ~10:1, OK.
  - `admin-shell.tsx:447,460` — sub-items inactivos en `text-white/80` sobre gradient: borderline, depende del frame del gradient (más oscuro en arriba = OK, más claro en abajo = baja a ~3.5:1, falla AA).
  - `admin-shell.tsx:374-378` — items "Próximamente" en `text-white/55` → **ratio ~3:1, falla WCAG AA** (mínimo 4.5:1 texto normal).
  - `admin-page.tsx:118-122` — colores notice OK contra fondos respectivos.
  - `productos/page.tsx:226` — `text-brand-purple-dark/50` (slug) sobre blanco: ratio ~4:1, **borderline AA**.
- **Tab order en `product-form.tsx`**: form natural top-down, no se usa `tabIndex`. Buen patrón. Pero al ser 647 líneas en una sola columna, llegar al submit con Tab es agotador y no hay landmarks `<section>` con `aria-labelledby`.
- `admin-shell.tsx:281-348` — el `UserFooter` no usa `<DropdownMenu>` de Radix sino un `<button>` + state. **Falta `role="menu"`** en el panel desplegado y `role="menuitem"` en los items. Screen reader anuncia "button expanded" pero el contenido del dropdown solo se anuncia como un grupo de links sueltos.

## Findings con file:line refs

### Bloqueantes para Lucy (touch / mobile)

1. **Sin sticky submit bar en `product-form.tsx`** — form de 647 líneas (`product-form.tsx:1-647`). Lucy debe scrollear al fondo para guardar. En mobile = doloroso. Sugerencia: agregar `<div className="sticky bottom-0 ...">` con CTA.
2. **Sin back-button mobile** — `admin-shell.tsx:82-102` topbar mobile solo muestra brand + hamburger. Una vez en `/admin/productos/abc-123`, no hay forma rápida de volver. Breadcrumb (`admin-page.tsx:67-82`) existe pero queda dentro del scroll del body, no en topbar.
3. **Tablas con scroll-x ocultan acciones críticas** — `admin-page.tsx:162-171` + `productos/page.tsx:210-260`. La columna "Estado" + "Editar/Desactivar" queda fuera del viewport mobile. Considerar transformar a cards stack `< sm:`.
4. **Touch targets sub-AAA en sidebar/nav** — toda la nav cae en 28-36px. Para Lucy operando con pulgar en móvil mientras atiende WhatsApp, esto causa misclicks. Aumentar padding mínimo a `py-2.5` o `min-h-[44px]`.
5. **Checkbox 16×16px** — `product-form.tsx:632`. Casi imposible de tocar en mobile sin zoom. shadcn tiene `<Checkbox>` Radix que se puede agrandar.

### Bloqueantes para a11y

6. **Sin focus-visible custom en sidebar** — `admin-shell.tsx:1-495` no define un solo `focus-visible:ring`. Sobre gradient morado, el outline default del browser desaparece. Falla WCAG 2.4.7 (Focus Visible).
7. **Escape no cierra drawer ni dropdown** — `admin-shell.tsx:104-131,283-348`. Falla WCAG 2.1.1 (Keyboard) parcial.
8. **Items "Próximamente" con contraste 3:1** — `admin-shell.tsx:374-378,448-454`. Falla WCAG 1.4.3 (Contrast AA). Aunque sean disabled, deberían cumplir 3:1 mínimo (AAA non-text) y se quedan en el límite.
9. **Dropdown user footer sin semántica menu** — `admin-shell.tsx:281-348`. No usa Radix `DropdownMenu`. Migrar a primitive shadcn cierra varios gaps de a11y de una.

### Mejoras de altitud (no bloqueantes)

10. **Mobile topbar sin breadcrumb** — `admin-shell.tsx:155-186` el AdminTopBar es `hidden lg:flex`. Mostrar al menos el `crumb` actual + back arrow en mobile.
11. **`overflow-x-auto` sin scroll indicator** — `admin-page.tsx:165-171`. En mobile, sin hint visual, Lucy no descubre que la tabla scrollea horizontal. Agregar fade en bordes o shadow.
12. **Sin "skip to content" link** — toda navegación con teclado pasa por toda la sidebar antes de llegar al contenido. Agregar `<a href="#main-content">` invisible en focus.
13. **`<select>` nativos vs Radix Select** — `productos/page.tsx:138-149,158-168`. Nativos son los más accesibles en mobile (rueda nativa), entonces aceptable. Mantener.
14. **Mobile-only "Ver el sitio" oculto** — `admin-shell.tsx:167-175` solo en lg+. En mobile Lucy no tiene acceso rápido al storefront. Mover al drawer.
15. **`window.confirm` para acciones destructivas** — `confirm-action.tsx:40` reconoce que AlertDialog Radix sería superior. En mobile, el confirm nativo no permite preview de qué se va a borrar.

Archivos relevantes:
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-shell.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/confirm-action.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/ui/input.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/ui/button.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/product-form.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/quick-actions.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/pedidos/[number]/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/dashboard/page.tsx`