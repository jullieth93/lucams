I have everything needed. The add-to-cart button is a server-component plain submit with no pending feedback. I now have a full, verified inventory.

# Frente 3 — Patrones globales (cursor + loading)

## Resumen ejecutivo

Dos defectos sistémicos confirmados leyendo el código real:

1. **CURSOR:** NO existe regla global `button { cursor: pointer }`. Tailwind v4 Preflight **no** la aporta, y la shadcn `Button` (`components/ui/button.tsx:8`) **no** incluye `cursor-pointer` en su base. Resultado: la mayoría de los ~129 `<button>` y elementos clicables muestran cursor `default`. Solo 17 archivos lo agregan a mano (parche inconsistente). El fix correcto es **UNA regla en `globals.css`** — no tocar 100 sitios.

2. **LOADING:** Existe un primitive `<SubmitButton>` (`components/admin/submit-button.tsx`) bien hecho (useFormStatus + spinner + disabled)… **pero está importado en CERO call sites** (grep `import.*SubmitButton` = vacío). Decenas de `<form action>` con `<button type="submit">` plano no dan ningún feedback al enviar. Las páginas server-component (resenas, usuarios, redirects, ocasiones, aveonline) son las peores: ni siquiera pueden usar `useFormStatus` sin envolver el botón en un client component.

---

## (a) FIX GLOBAL DE CURSOR — esfuerzo S

**Causa raíz verificada:** `apps/web/app/globals.css` (leído completo, 276 líneas) no tiene ninguna regla de cursor. El navegador aplica `cursor: default` a `<button>` por defecto y nada lo sobreescribe.

**Fix concreto** — agregar dentro de `@layer base` en `globals.css` (junto al bloque `* { border-color }` existente en líneas 186-190):

```css
@layer base {
  button:not(:disabled),
  [role="button"]:not([aria-disabled="true"]),
  label[for],
  summary,
  select:not(:disabled),
  a[href] {
    cursor: pointer;
  }

  button:disabled,
  [role="button"][aria-disabled="true"],
  [aria-disabled="true"] {
    cursor: not-allowed;
  }
}
```

Notas de implementación:
- Va **dentro de `@layer base`** para no ganarle a las utilities (mismo razonamiento documentado en el comentario de líneas 181-185 sobre el bug del Slider 2026-05-18).
- `:not(:disabled)` cubre el caso de la shadcn `Button`, que usa `disabled:pointer-events-none` (button.tsx:8) — con pointer-events:none el cursor ni se evalúa, así que no hay conflicto; igual excluimos disabled por claridad.
- Una vez aplicado, se pueden **eliminar** los `cursor-pointer` manuales dispersos en estos 17 archivos (limpieza opcional, no bloqueante): `auditoria/page.tsx`, `categorias/page.tsx`, `block-editor-form.tsx`, `cupones/page.tsx`, `ocasiones/page.tsx`, `product-form.tsx`, `productos/page.tsx`, `bulk-action-bar.tsx`, `bulk-review-bar.tsx`, `resenas/page.tsx`, `integraciones/page.tsx`, `variant-selector.tsx`, `ayuda/page.tsx`, `quote-list.tsx`, `studio-slot.tsx`, `markdown-editor.tsx`, `products-filters.tsx`.

**Dimensión del problema:** 129 `<button>` + 145 `onClick` en `app`/`components`; solo 22 ocurrencias de `cursor-pointer` → la gran mayoría hoy sin manito.

---

## (b) BOTONES/FORMS SIN FEEDBACK DE CARGA

Patrón recomendado: **adoptar el `<SubmitButton>` ya existente** (`components/admin/submit-button.tsx`) en todos los `<form action>` cuyo submit hoy es plano. Para los forms en **server components** (no pueden usar `useFormStatus` directo), envolver solo el botón en `<SubmitButton>` (que es `"use client"`) — no hace falta convertir toda la página.

### YA tienen feedback correcto (no tocar)
- `categorias/category-form.tsx:162` (Loader2 + disabled) ✓
- `productos/product-form.tsx`, `variants/variant-form.tsx` (Loader2 + disabled) ✓
- `contenido/configuracion/setting-row.tsx:93` (Loader2) ✓
- `contenido/bloques/nuevo/create-block-form.tsx`, `block-editor-form.tsx` (pending) ✓
- `integraciones/aveonline/webhook-form.tsx:38` (Loader2) ✓
- `productos/bulk-action-bar.tsx` (BulkSubmitButton local con spinner) ✓
- `resenas/bulk-review-bar.tsx` (useTransition) ✓
- `checkout/pago/pay-button.tsx` (useFormStatus + Loader2) ✓
- `components/admin/compact-stock-editor.tsx`, `product-images.tsx`, `variant-images.tsx` (pending/useTransition) ✓

### SIN feedback — necesitan `<SubmitButton>` o spinner

**🐛 BUG — server components, submit plano sin ningún estado (los más graves, no se puede ni clickear dos veces de forma segura):**

| Archivo:línea | Botón(es) | Fix | Esf. |
|---|---|---|---|
| `resenas/page.tsx:361,374,386,398,421` | Restaurar / Aprobar / Volver a pendiente / Destacar / (etc.) | Reemplazar cada `<button type="submit">` por `<SubmitButton>` | M |
| `usuarios/page.tsx:339,358` | Cambiar rol / acción admin (form `changeAdminRoleAction`) | `<SubmitButton>` | S |
| `redirects/page.tsx:295,306,322` | Restaurar / toggle activo | `<SubmitButton>` | S |
| `ocasiones/page.tsx:243` | toggle activo (badge) | `<SubmitButton>` o spinner inline | S |
| `categorias/page.tsx:316,428` | toggle activo (badge) / mover orden (`moveCategoryAction`) | `<SubmitButton>` / icon spinner | S |
| `integraciones/aveonline/page.tsx:134` | Eliminar webhook | `<SubmitButton variant="danger">` | S |
| `contenido/bloques/[id]/page.tsx:103` + `version-history.tsx:79` | Publicar versión CMS | `<SubmitButton>` | S |
| `producto/[slug]/page.tsx:235` | **Añadir al carrito** (storefront) | `<SubmitButton>` (doble-click compra duplicada) | S |
| `carrito/page.tsx:98,196,211` | Eliminar item / actualizar cantidad | `<SubmitButton size="icon">` | S |
| `mi-cuenta/page.tsx:41` + `site-header.tsx:90` + `admin-shell.tsx:335` | Cerrar sesión | `<SubmitButton variant="ghost">` | S |

**🐛 BUG — client components con pending pero SIN spinner (solo cambian texto o disable; Lucy pidió "ruedita giratoria"):**

| Archivo:línea | Detalle | Fix | Esf. |
|---|---|---|---|
| `pedidos/[number]/order-actions.tsx:82,99,116` | "Marcar ENVIADO/ENTREGADO/Cancelar": disabled por `transPending` pero icono estático (ArrowRight/X), sin spin. Además los 3 comparten un solo `transPending` → al enviar uno, los 3 se deshabilitan sin indicar cuál procesa | Spin del icono cuando pending; idealmente trackear cuál form está activo | M |
| `usuarios/promote-form.tsx:64` | Cambia texto "Promoviendo…" pero sin Loader2 | Agregar `<Loader2 animate-spin>` o usar `<SubmitButton>` | S |
| `redirects/create-redirect-form.tsx:105` | `disabled={isPending}` sin spinner | `<SubmitButton>` | S |
| `cupones/create-coupon-form.tsx:205,213` | `disabled={isPending}` sin spinner visible | `<SubmitButton>` | S |
| `ocasiones/create-ocasion-form.tsx:185` + `ocasiones/[id]/edit-ocasion-form.tsx:147,158` | `disabled={isPending}` sin spinner; el `:158` es **eliminar** (destructivo) sin feedback | `<SubmitButton>` (el delete con `variant="danger"`) | S |
| `ocasiones/[id]/product-ocasion-linker.tsx:61,109` | Linkear/deslinkear producto, submit plano | `<SubmitButton size="sm">` | S |

**✨ MEJORA — quick-actions por fila (alto tráfico, Lucy las usa constantemente):**

| Archivo:línea | Detalle | Esf. |
|---|---|---|
| `productos/quick-actions.tsx:27,43` | "Pausar/Activar" y "Restaurar" por fila — `"use client"` pero submit plano sin pending. Cada clic recarga la tabla sin indicar que procesa | S |

### Nota sobre `<SubmitButton>` existente
Está bien construido y listo para reusar (variants primary/secondary/danger/ghost, sizes, icon, pendingLabel). **No hay que crear nada nuevo** — solo importarlo. Único gap: no expone `size="icon"` con aria-label para los botones-ícono del carrito; conviene verificar que `size` acepte el caso o añadir `aria-label`. Para los botones-badge (toggle activo en categorias/ocasiones) que tienen estilo propio inline, o se adapta `<SubmitButton>` con `className` override, o se crea una variante mínima `<PendingFieldset>` que envuelva el botón existente y lea `useFormStatus`.

---

## Orden sugerido de implementación
1. **Cursor global (S)** — 1 regla, impacto inmediato en todo el ecosistema. Hacer primero.
2. **Adoptar `<SubmitButton>` en server-component pages (M)** — resenas, usuarios, redirects, ocasiones, categorias, carrito, añadir-al-carrito, logout. Es el grueso del bug y el de mayor riesgo (doble submit en mutaciones).
3. **Spinners faltantes en client forms (S-M)** — order-actions (separar los 3 transPending), promote-form, cupones, ocasiones, quick-actions.

**Esfuerzo total estimado:** cursor S; loading global M (un patrón repetido ~25 call sites, mecánico una vez resuelto el caso badge/icon).

Archivos clave: `/home/ansible/workspaces/lucams_shop/apps/web/app/globals.css` (fix cursor), `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/submit-button.tsx` (primitive a reutilizar), `/home/ansible/workspaces/lucams_shop/apps/web/components/ui/button.tsx:8` (confirma ausencia de cursor en base shadcn).