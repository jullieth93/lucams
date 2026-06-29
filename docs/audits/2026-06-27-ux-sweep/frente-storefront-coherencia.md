Product cards just link to the detail page — no inline add-to-cart, so the only add-to-cart entry point is the product detail page. My analysis is complete. Let me compile the findings.

# Frente 6 — Storefront (patrones globales + roturas evidentes)

Barrido ligero del storefront verificando los tres patrones que Lucy marca como globales (cursor manito, loading en CTAs, tuteo/COP) + roturas UX evidentes que frenen una venta. No rediseño, solo pulido. Leí el código real, cada hallazgo cita `file:line`.

## Veredicto rápido de los patrones globales

| Patrón | Estado en storefront | Detalle |
|---|---|---|
| Cursor manito | ✅ Resuelto globalmente | `app/globals.css:196-209` ya aplica `cursor: pointer` a `button`, `[role=button]`, `a[href]`, `label[for]`, `summary`, `select` (y `not-allowed` a disabled). Cubre TODO el storefront. No hay deuda aquí. |
| Loading en CTAs | ⚠️ Parcial | Checkout (pago, datos, envío) sí tiene `useFormStatus`/`pending`. **Faltan los CTAs de compra tempranos: "Añadir al carrito" y los controles del carrito.** |
| Tuteo + COP | ⚠️ COP ok, tuteo roto | Precios usan `formatCOP` consistente. **Hay voseo suelto en ~10 strings visibles al cliente.** |

---

## 🐛 BUG 1 — Voseo suelto en copy del cliente (viola mandato tuteo)

El mandato es tuteo es-CO estricto. Estos strings son todos visibles al cliente (no comentarios). En orden de impacto (los primeros están en el flujo de compra):

- `app/producto/[slug]/page.tsx:227` — `"Diseñá en vivo • Vista previa al instante"` → **"Diseña en vivo"**. (CTA principal de producto personalizable, alto tráfico.)
- `components/cart-cross-sell.tsx:81` — `"Completá tu regalo de {ocasión}"` → **"Completa tu regalo"**. (En el carrito, momento de upsell.)
- `app/checkout/envio/envio-step.tsx:46` y `app/checkout/envio/page.tsx:68` — `"Elegí cómo te lo enviamos"` → **"Elige cómo te lo enviamos"**. (Paso de checkout.)
- `app/checkout/datos/actions.ts:47` — `"...Por favor seleccioná de la lista."` → **"selecciona"**.
- `app/checkout/datos/actions.ts:108` — `"Si querés factura electrónica, completá los datos..."` → **"Si quieres... completa"**.
- `app/checkout/datos/datos-form.tsx:341` — `"...requerido si querés factura"` → **"si quieres"**.
- `app/checkout/datos/datos-form.tsx:363,403,431` — `"Elegí tipo primero"`, `"Elegí departamento..."`, `"Elegí ciudad..."` / `"Primero elegí depto"` → **"Elige / Primero elige"**.
- `app/mi-cuenta/pedidos/[number]/page.tsx:163` — `"Si tenés dudas, escribinos por WhatsApp o respondé el email..."` → **"Si tienes dudas, escríbenos... o responde el email"**.
- `app/estudio/[slug]/studio-photo-adjust-modal.tsx:89` — `"Elegí un filtro abajo"` → **"Elige un filtro abajo"**.
- `app/layout.tsx:54` (metadata/SEO description) — `"Diseñá el tuyo en vivo o elegí entre nuestros packs..."` → **"Diseña el tuyo... o elige"**.
- `app/estudio/[slug]/page.tsx:36` (metadata) — `"Diseñá tu {producto} en vivo..."` → **"Diseña tu..."**.
- `app/contacto/contact-form.tsx:128` — `placeholder="Contanos en qué te podemos ayudar..."` → **"Cuéntanos en qué te podemos ayudar..."**.

Fix: reemplazo de strings (find/replace dirigido, sin lógica). **Esfuerzo: S.** Vale la pena un grep de regresión en CI con el patrón de conjugaciones voseo para que no se vuelva a colar.

---

## ✨ MEJORA 2 — "Añadir al carrito" sin estado de carga (CTA crítico de compra)

`app/producto/[slug]/page.tsx:231-242`: el form usa `<form action={addToCartAction}>` con un `<Button type="submit">` plano dentro de un Server Component. No hay `useFormStatus`, así que al hacer clic el botón queda clickeable y mudo durante el round-trip del server action; el feedback solo llega después vía toast `?added=1` (`components/route-toasts.tsx`). En conexiones lentas el cliente puede dar doble clic (doble add) o pensar que no pasó nada.

Contraste: el checkout sí lo hace bien (`app/checkout/pago/pay-button.tsx:8-29` con spinner "Redirigiendo a Wompi…", y `datos-form.tsx:843-849`). El patrón ya existe en el repo; solo falta aplicarlo al primer CTA de compra.

Fix: extraer un `<AddToCartButton>` client con `useFormStatus` (spinner + `disabled={pending}` + texto "Agregando…"), idéntico al patrón de `pay-button.tsx`. **Esfuerzo: S.**

---

## ✨ MEJORA 3 — Controles del carrito sin pending (qty +/- y quitar ítem)

`app/carrito/page.tsx:98-109` (botón quitar) y `:193-225` (`QtyControls` con +/-): cada uno es un `<form action={...}>` server-action con `<button>`/`<Button>` plano, sin `useFormStatus`. Al cambiar cantidad o quitar, no hay indicación visual mientras el server recalcula el subtotal; en latencia alta se puede disparar +1 varias veces (race de qty) o doble-quitar. El cursor manito ya está (globals.css), pero falta el affordance de "procesando".

Fix: client wrappers con `useFormStatus` que deshabiliten el botón y muestren un mini-spinner/opacidad durante `pending`. Mismo patrón que MEJORA 2. **Esfuerzo: S-M** (son 3 botones: −, +, quitar).

---

## 🤔 DECISIÓN 4 — "Ir a pagar" navega con `<Link>`, sin feedback de transición

`app/carrito/page.tsx:140-148`: "Ir a pagar →" es un `<Link href="/checkout/datos">` envolviendo un `<Button>`. Funciona y tiene cursor, pero al ser navegación RSC el usuario no ve estado de carga si `/checkout/datos` tarda (la página hace queries de departamentos/ciudades). No es bug. Decisión para Lucy: ¿agregar un `loading.tsx` en `/checkout/datos` (skeleton) para que la transición no se sienta colgada? Es coherente con "simple y amigable". **Esfuerzo: S** si se decide hacerlo.

---

## Lo que NO es problema (verificado, para no re-proponer)

- **Cursor manito**: cubierto globalmente en `globals.css:196-209`. No hay deuda en storefront.
- **VariantSelector** (`app/producto/[slug]/variant-selector.tsx`): selección de opción ya es instantánea (single source of truth local state), chips con `cursor-pointer`/`cursor-not-allowed` explícitos (`:319-322`), combinaciones no disponibles deshabilitadas con `title` explicativo. Copy en tuteo. Sólido.
- **Checkout pago/datos/envío**: ya tienen pending states correctos (`pay-button.tsx`, `datos-form.tsx:843`, `quote-list.tsx:113`).
- **Precios**: `formatCOP` consistente en producto, carrito, resumen. COP correcto.
- **Product cards** (`components/product-card.tsx:23`, `product-from-catalog-card.tsx:33`): solo enlazan al detalle, sin add-to-cart inline → no hay gap de loading ahí; el único punto de "añadir" es el detalle (MEJORA 2).

## Prioridad sugerida para una venta sin fricción
1. BUG 1 (voseo) — barato y viola mandato explícito. Empezar por `page.tsx:227`, `cart-cross-sell.tsx:81` y los del checkout.
2. MEJORA 2 (loading add-to-cart) — el CTA de compra más temprano; evita doble-add.
3. MEJORA 3 (loading controles carrito).
4. DECISIÓN 4 (skeleton checkout) — opcional, confirmar con Lucy.

Recordatorio GUI: estos toques son visuales/de flujo de compra. Conviene probarlos en navegador (no curl): URL `localhost:4000/producto/<slug>` (clic "Añadir al carrito" en red lenta, throttling DevTools), `localhost:4000/carrito` (cambiar qty rápido, quitar ítem) y recorrer checkout mirando que ningún copy quede en voseo. Confirmar con Lucy si mira localhost, preview de Vercel o producción antes de dar por cerrado.