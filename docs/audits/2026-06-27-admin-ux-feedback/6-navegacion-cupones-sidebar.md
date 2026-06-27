I have everything needed. Here is my analysis.

# Cluster 6: Navegación (sidebar / cancelar-volver / bug "todos los productos") — hallazgos + fix + esfuerzo

Verifiqué leyendo el código real. Resumen: **2 hallazgos reales** (sidebar y el "bug #11"), **1 cuasi-no-problema** (cupones ya tiene salida natural pero falta un "Volver" explícito tras crear). Distingo BUG / MEJORA UX / DECISIÓN-DE-LUCY abajo.

---

## 6.1 — Sidebar que se desliza al scrollear · **BUG real (de layout) · S**

**Diagnóstico (código real):** El `<aside>` desktop NO es sticky ni fixed.

- `admin-shell.tsx:74` — contenedor raíz: `<div className="bg-brand-cream/40 flex min-h-screen">`. Es un flex row de altura `min-h-screen` (crece con el contenido), **sin `h-screen` fijo**.
- `admin-shell.tsx:76` — el aside: `className="... relative hidden overflow-hidden ... lg:flex lg:w-64 lg:flex-shrink-0 lg:flex-col"`. **No tiene `sticky`, `fixed`, `top-0`, ni `h-screen`/`overflow-y-auto` propio.**
- `admin-shell.tsx:234` — `SidebarContent` sí tiene `overflow-y-auto`, pero su contenedor padre (el aside) no tiene altura acotada, así que ese overflow nunca se activa: el aside simplemente se estira a la altura total de la página y se va con el scroll.

Resultado: en páginas largas (lista de productos, cupones, inventario) el morado del sidebar termina y aparece el `bg-brand-cream/40` debajo; el footer de usuario (Cerrar sesión / Cambiar contraseña) queda fuera de viewport. Exactamente lo que reporta Lucy.

**Fix concreto:** acotar el aside a la altura del viewport y darle scroll propio. Dos opciones:

- **Opción A (mínima, recomendada):** en el `<aside>` (`admin-shell.tsx:76`) agregar `lg:sticky lg:top-0 lg:h-screen` (con `flex-col` ya presente, el `SidebarContent` con su `overflow-y-auto` interno toma el sobrante y el footer queda anclado abajo). `sticky top-0` dentro de un flex item funciona porque el contenedor raíz es `min-h-screen`.
- **Opción B:** raíz `h-screen overflow-hidden` + aside `h-full` + `<main>` propio `overflow-y-auto` (patrón "app shell" clásico). Más limpio pero toca también el `<div className="flex flex-1 flex-col overflow-x-hidden">` de `admin-shell.tsx:134` y el `<main>` de `:136`. Mayor superficie de regresión.

Recomiendo **A**.

**¿Rompe mobile (drawer)?** No. El drawer (`admin-shell.tsx:105-131`) es un `<aside>` independiente con `fixed inset-0 ... absolute top-0 left-0 ... h-full` y `overflow-hidden`, sólo bajo `lg:hidden`. El fix va en clases `lg:*` del aside desktop, que el drawer no usa. El topbar mobile (`:82`) ya es `sticky top-0`. Sin colisión.

**Storefront:** No toca. Es exclusivo del shell admin.

---

## 6.2 — En Cupones "no veo cómo volver o cancelar" · **MEJORA UX · S** (y una **DECISIÓN-DE-LUCY** menor)

**Diagnóstico (código real):** `/admin/cupones` NO es un flujo crear→detalle con pantalla separada. Es **una sola página**: lista + un formulario inline `CreateCouponForm` embebido al final (`page.tsx:288-293`, dentro de un `AdminCard` "Crear cupón nuevo"). No existe subruta `/cupones/[id]` ni `/cupones/new` (confirmado: `find` no devuelve subdirectorios; el único `<Link href="/admin/cupones">` es el de "Limpiar filtros", `page.tsx:193`).

Por eso "no hay botón volver": técnicamente nunca te fuiste de la lista. Pero **la percepción de Lucy es válida**: el form es largo (código, tipo, valor, descripción, 2 fechas, fieldset de 6 restricciones, 2 checkboxes — `create-coupon-form.tsx:18-211`) y su único botón es **"Crear cupón"** (`:204-210`). No hay:
- Un "**Cancelar / Limpiar**" que resetee el form sin enviarlo.
- Tras crear (vuelve con `?created=1`, muestra `AdminNotice` success en `page.tsx:115`), no hay un "**← Volver al listado**" ni scroll-to-top: queda parada al fondo, junto al form vacío otra vez, sin señal clara de "ya quedó".

**Fix concreto:**
1. Agregar junto a "Crear cupón" un botón secundario **"Cancelar"** que haga `type="reset"` (limpia el form inline; cero lógica de servidor). `create-coupon-form.tsx:180` o `:204` zona de botones.
2. **Anclar el formulario** con un encabezado/ancla y, en el `AdminNotice` success (`page.tsx:115`), añadir un texto/Link "Ver en el listado de arriba ↑" o un `id` de scroll. Alternativamente, mover el botón "Crear cupón nuevo" como acción del `AdminPageHeader` (arriba) que haga focus/scroll al form — más consistente con el resto del admin donde el CTA primario vive en el header.

**DECISIÓN-DE-LUCY (no la decido yo):** ¿El form inline al fondo es el patrón deseado, o prefiere el patrón "lista con botón **Crear cupón** arriba → form en pantalla aparte (`/cupones/nuevo`) con su propio **← Volver**"? Esto último es más "amigable/simple" y consistente con cómo Lucy mentalmente espera "entrar a crear → volver". Pero es refactor **M** (nueva ruta + mover form + page edit). Recomiendo arrancar con el fix S (botón Cancelar + ancla) y dejar el refactor de ruta como decisión suya.

**Storefront:** No toca.

---

## 6.3 — BUG #11: "en la parte inferior del producto específico muestra información de TODOS los productos" · **identificado**

Investigué qué se renderiza al final de `/admin/productos/[id]`. Orden de render en la sección **editar** (`page.tsx:145-211`): `ProductStockSummaryReadonly` → **`ProductCouponsWidget`** (`:169`) → `ProductForm` → `ProductImages` (último, `:210`). En la sección **opciones**: `ProductVariantsPanel`.

Descarté candidatos:
- **`ProductImages`** (último en el DOM, `product-images.tsx`): solo muestra imágenes de **este** producto (recibe `images={product.images}`). No es.
- **`<select>` de categoría** (`product-form.tsx:142-159`): lista **categorías**, no productos. No es.
- **`getProductById`** (`service.ts:140`): `include: { category, variants }` — no trae otros productos. No es.

**Culpable identificado — hay 2 superficies que dicen literalmente "todos los productos", según en qué pestaña esté Lucy:**

### (a) Pestaña **Opciones** — el más literal · `product-variants-panel.tsx:68-74`
Un `<Link href="/admin/inventario">` con el texto **"Ver el inventario de todos los productos →"**. Está al inicio del bloque de opciones, no "al fondo", y es **solo un enlace de navegación** (no vuelca data de otros productos). Si Lucy estaba en la pestaña Opciones, esto es lo que vio. **Correcto en intención, confuso en copy** dentro de la página de UN producto. Fix S: reformular a algo menos "globalizante", p.ej. "Ver inventario completo →" o moverlo al header/breadcrumb. Mantener — no sobra, pero el copy "todos los productos" dentro del detalle de un producto desorienta.

### (b) Pestaña **Editar** — el más probable como "información" real · `ProductCouponsWidget` (`product-coupons-widget.tsx`)
Este widget (renderizado en `page.tsx:169`) tiene el título **"N promociones activas para este producto"** (`:104-107`) PERO su filtro de aplicabilidad incluye los cupones **store-wide**: `if (appliesToProductSlugs.length === 0 && appliesToCategories.length === 0) return true;` (`:61`), y cada fila los etiqueta **"Aplica a toda la tienda"** (`:145`). Es decir: en CADA producto aparecen los cupones globales y los de su categoría, no solo los que apuntan a ese slug. Para Lucy, "este widget me muestra cupones que no son específicos de este producto" = "información de todos los productos". **Es un BUG de claridad (no de cálculo): el título promete "para este producto" y el contenido mezcla scope global.**

**Fix concreto (b):**
- **Mínimo (S):** dejar el filtro como está (es correcto a nivel negocio — esos cupones SÍ aplican aquí) pero **separar visualmente**: agrupar "Específicos de este producto" vs "Generales de la tienda", o cambiar el título de `:105` a algo honesto: "Promociones que aplican aquí (incluye las de toda la tienda)". Y los store-wide con un badge gris "General" para que se entienda que no son exclusivos de este producto.
- Esto resuelve la confusión sin perder la utilidad (Lucy SÍ quiere saber qué descuentos ve el cliente en ese producto).

**Decisión sobre cuál es "el" bug #11:** ambos son reales, pero apuesto a **(a)** como lo que Lucy verbalizó ("muestra... TODOS los productos" ≈ el texto literal del link), con **(b)** como el problema de fondo más valioso de arreglar. Recomiendo confirmar con Lucy **en qué pestaña estaba** antes de tocar; si fue Editar, es (b); si fue Opciones, es (a). **ACCIÓN HUMANA: confirmar pestaña** (Editar vs Opciones) para no arreglar el componente equivocado.

**Storefront:** (a) y (b) son admin-only. Nota lateral: existe `components/product-detail/related-products.tsx` ("También te puede gustar", `:2,:16`) que SÍ muestra otros productos, pero eso es el **PDP público del storefront**, no el admin — no es lo que Lucy describe.

---

## Resumen ejecutivo (prioridad / esfuerzo)

| # | Qué | Tipo | Esfuerzo | ¿Storefront? | Acción |
|---|-----|------|----------|--------------|--------|
| 6.1 | Sidebar no sticky → se va con el scroll | BUG layout | **S** | No | Aside: `lg:sticky lg:top-0 lg:h-screen` (`admin-shell.tsx:76`) |
| 6.2 | Cupones sin "Cancelar/Volver" claro | MEJORA UX (+ DECISIÓN ruta) | **S** (M si ruta aparte) | No | Botón `reset` "Cancelar" + ancla/CTA en header; preguntar a Lucy si quiere ruta `/cupones/nuevo` |
| 6.3a | "Ver inventario de todos los productos →" en pestaña Opciones | MEJORA UX (copy) | **S** | No | Reformular copy (`product-variants-panel.tsx:73`) |
| 6.3b | Widget cupones dice "para este producto" pero incluye store-wide | BUG de claridad | **S** | No | Separar/etiquetar scope global; ajustar título (`product-coupons-widget.tsx:105,145`) |

Todo el cluster es **S**, alineado con la premisa "simple y amigable". 6.1 es el más impactante (toca toda navegación admin) y el de mejor relación valor/esfuerzo. Antes de tocar 6.3 conviene **confirmar con Lucy la pestaña** donde vio el problema.

Archivos relevantes (paths absolutos):
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-shell.tsx` (sidebar, líneas 74, 76, 134, 234)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/cupones/page.tsx` (115, 193, 288-293)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/cupones/create-coupon-form.tsx` (180, 204-210)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/page.tsx` (145-211, 169, 210)
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/product-coupons-widget.tsx` (61, 104-107, 145)
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/product-variants-panel.tsx` (68-74)