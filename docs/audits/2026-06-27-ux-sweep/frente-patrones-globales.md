I now have a complete inventory. Writing the final report.

# Frente 3 — Patrones globales (cursor + loading)

Recorrí todo `apps/web` (admin + storefront + auth + checkout) con grep sistemático y leí los componentes clave. Resumen ejecutivo: **el fix de cursor YA está hecho** (regla global en `globals.css`, pero sin commitear) y **el `<SubmitButton>` reutilizable YA existe** (`components/admin/submit-button.tsx`) — pero está infrautilizado: solo se usa en 2 sitios. El grueso del trabajo restante es feedback de carga en los muchos `<form action>` de Server Components que renderizan un `<button type="submit">` nativo sin estado pending.

---

## (a) Cursor "manito" — YA RESUELTO (falta commitear)

🐛→✅ La regla global que Lucy pidió **ya existe** en `apps/web/app/globals.css:191-209`, dentro de `@layer base` (correcto: no le gana a las utilities). Cubre `button:not(:disabled)`, `[role="button"]`, `label[for]`, `summary`, `select`, `a[href]`, y pone `cursor: not-allowed` en disabled.

Verificado:
- Tailwind v4 confirmado (`package.json`: `tailwindcss: "^4"`). El Preflight de v4 **no** setea `cursor: pointer` en `<button>` (los browsers ponen `default`), así que la regla era necesaria — el diagnóstico de Lucy es correcto.
- El snippet propuesto en el prompt es exactamente el que ya está aplicado. **No hay que escribir nada nuevo.**

**Acción pendiente (S):** la regla está **uncommitted** (`git diff HEAD -- app/globals.css` la muestra como cambio en working tree, no en ningún commit). Solo falta commitearla. Sugerencia de mensaje: `fix(ui): cursor pointer global en clicables (Lucy 2026-06-27)`.

**Gap menor opcional (S):** la regla no cubre elementos con handler de teclado/click que no son `<button>` ni `[role="button"]` (p.ej. `<div onClick>`). En el código vi que las acciones clicables sí usan `<button>`/`<a>`/`[role]`, así que **no hay violaciones reales** detectadas. No agregar nada salvo que aparezca un caso.

---

## (b) Loading / pending — inventario de violaciones

Patrón recomendado y **ya disponible**: `SubmitButton` en `apps/web/components/admin/submit-button.tsx` (usa `useFormStatus()` → `Loader2` spinner + `disabled` + `cursor-not-allowed`). Hoy solo lo importan `bulk-action-bar.tsx` y `checkout/pago/pay-button.tsx`. **El fix transversal es propagarlo.**

### B1. 🐛 Server Components con `<form action>` + `<button type="submit">` nativo SIN pending (mayor impacto)

Son RSC (no `"use client"`), por lo que no pueden usar `useFormStatus` directamente: la celda del botón submit debe extraerse a `<SubmitButton>` (client). Al hacer clic la acción tarda (server action + revalidate) y **no hay ningún feedback** — Lucy puede doble-clickear o pensar que no pasó nada.

| Archivo | Botones afectados | Esfuerzo |
|---|---|---|
| `app/admin/(panel)/categorias/page.tsx:204,316,344,371,428` | toggle activar/pausar, restaurar, mover orden, eliminar (5 submit nativos) | M |
| `app/admin/(panel)/resenas/page.tsx:235,361,374,387` (6 submit) | aprobar / rechazar / restaurar / archivar reseñas | M |
| `app/admin/(panel)/ocasiones/page.tsx:172,243` | crear-rápido + toggle activa | S |
| `app/admin/(panel)/redirects/page.tsx` (2 forms) | acciones de fila | S |
| `app/admin/(panel)/integraciones/aveonline/page.tsx:137` | eliminar webhook | S |
| `app/admin/(panel)/contenido/bloques/[id]/version-history.tsx:79-83` | publicar versión (acción pública, prioritario) | S |
| `app/admin/(panel)/usuarios/page.tsx` (1 form vía ConfirmAction) | ver B3 | — |

### B2. 🐛 `ProductQuickActions` — client component, `<form action>` nativo SIN pending

`app/admin/(panel)/productos/quick-actions.tsx:25-55`. Es `"use client"` con dos `<form action>` (`toggleProductActiveAction`, `restoreProductAction`) y `<button type="submit">` plano (líneas 27, 43). Al ser client, el fix es trivial: envolver el submit en `<SubmitButton>` o un `useFormStatus`. Aparece en **cada fila** de la tabla de productos → muy visible. **Esfuerzo S.**

### B3. 🐛 `ConfirmAction` — sus children son `<Button type="submit">` planos sin pending

`components/admin/confirm-action.tsx` envuelve un `<form>` pero deja al consumidor poner el botón, y **todos** los consumidores usan `<Button type="submit">` plano:
- `categorias/page.tsx`, `categorias/[id]/page.tsx`, `contenido/bloques/[id]/page.tsx`, `productos/[id]/page.tsx`, `resenas/page.tsx`, `usuarios/page.tsx`, `redirects/page.tsx`, `components/admin/product-variants-panel.tsx`.

**Fix de máximo apalancamiento (M):** dar a `ConfirmAction` un prop opcional para renderizar internamente un `<SubmitButton>` (o documentar que el child sea `<SubmitButton>`), de modo que las ~8 páginas que archivan/eliminan obtengan spinner sin tocar cada una. Como son acciones destructivas, el feedback es especialmente importante.

### B4. ✨ Forms `useActionState` que cambian texto pero NO muestran spinner (Lucy pidió "ruedita giratoria")

Estos sí deshabilitan el botón (`disabled={isPending}`) y cambian el label ("Creando…"/"Guardando…"), pero **no tienen `Loader2`** — Lucy explícitamente pidió ruedita. Agregar `<Loader2 className="animate-spin">` antes del label:

| Archivo:línea | Botón |
|---|---|
| `app/admin/(panel)/cupones/create-coupon-form.tsx:207-216` | "Crear cupón" |
| `app/admin/(panel)/ocasiones/create-ocasion-form.tsx:187-190` | "Crear ocasión" |
| `app/admin/(panel)/ocasiones/[id]/edit-ocasion-form.tsx:149-152` | "Guardar cambios" |
| `app/admin/(panel)/usuarios/promote-form.tsx:66-69` | "Promover a admin" |
| `app/admin/(panel)/redirects/create-redirect-form.tsx:107-110` | "Crear redirect" |

**Esfuerzo S** (cada uno 1 línea). Ideal: migrarlos a `<SubmitButton>` para uniformidad, pero esos forms tienen `formAction` directo (no `<form action>` con useFormStatus contextual) — verificar que estén dentro de `<form action={formAction}>` antes de migrar; si no, basta añadir el `Loader2` inline con el `isPending` que ya tienen.

### B5. 🐛 Storefront — botones de acción sin pending (no es admin pero Lucy dijo "TODO el ecosistema")

| Archivo:línea | Botón | Nota |
|---|---|---|
| `app/producto/[slug]/page.tsx:231-242` | "Añadir al carrito" (RSC `<form action>`, `<Button>` plano) | alta visibilidad de venta |
| `app/carrito/page.tsx:98-101,196-216` | eliminar ítem, +/- cantidad (RSC, submit nativos) | M |
| `app/mi-cuenta/page.tsx:41-47` | "Cerrar sesión" (RSC, submit nativo) | S |
| `app/checkout/envio/quote-list.tsx` | selección de cotización (revisar) | S |

Todos resolubles extrayendo el submit a `<SubmitButton>` (mover el componente a una ubicación compartida, p.ej. `components/ui/submit-button.tsx`, ya que hoy vive en `components/admin/`).

### ✅ Lo que YA está bien (no re-proponer)

- `category-form.tsx`, `variant-form.tsx`, `webhook-form.tsx`, `setting-row.tsx`, `product-form.tsx`: `disabled={pending}` + `Loader2 animate-spin`. Correcto.
- `bulk-action-bar.tsx`, `bulk-review-bar.tsx`: `useTransition` + spinner + disabled. Correcto.
- `product-images.tsx`, `variant-images.tsx`: `useTransition`, todos los botones `disabled={pending}`. Correcto.
- `order-actions.tsx` (detalle pedido): `disabled={retryPending/transPending}` + `RefreshCw animate-spin`. Correcto.
- `contact-form.tsx`, `datos-form.tsx`, `newsletter-form.tsx`, todos los auth forms (`login`, `registro`, etc.): leen `pending`. Correcto.
- `pay-button.tsx`: ya usa `useFormStatus`/SubmitButton. Correcto.

---

## Recomendación de ejecución (orden por impacto / esfuerzo)

1. **(S) Commitear** la regla de cursor de `globals.css` — ya está, solo falta el commit.
2. **(S) Mover** `submit-button.tsx` de `components/admin/` a `components/ui/` (compartido admin+storefront) y exportarlo.
3. **(S) `ProductQuickActions`** (B2) y **B4** (5 forms, añadir `Loader2`) — quick wins muy visibles.
4. **(M) `ConfirmAction`** (B3): añadir soporte interno de `SubmitButton` → cubre ~8 páginas destructivas de un golpe.
5. **(M) RSC del admin** (B1): extraer `SubmitButton` en categorías, reseñas, ocasiones, redirects, aveonline, version-history.
6. **(M) Storefront** (B5): añadir al carrito, carrito qty/remove, cerrar sesión.

**Esfuerzo total estimado: M-L** (mecánico y repetitivo, sin riesgo arquitectónico — el primitive ya existe).

Archivos clave: `apps/web/app/globals.css` (cursor, uncommitted), `apps/web/components/admin/submit-button.tsx` (primitive a promover a `components/ui/`), `apps/web/components/admin/confirm-action.tsx` (B3, máximo apalancamiento), `apps/web/app/admin/(panel)/productos/quick-actions.tsx` (B2).