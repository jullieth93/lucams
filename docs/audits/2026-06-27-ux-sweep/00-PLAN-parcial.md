All verified. The Frente 3 findings hold (line refs slightly shifted but the patterns are exactly as described). I have enough verified ground truth to consolidate the full plan.

# Plan UX/UI integral del admin — feedback de Lucy + barrido (2026-06-27)

## Resumen para Lucy (llano)

Revisé el panel de punta a punta leyendo el código real, no solo tus comentarios. La buena noticia: lo grande que pediste hace poco ya está bien hecho (ordenar por clic, precio en pesos en la UI, fotos por opción, precio tachado en "Avanzado"). Lo que queda son **dos arreglos globales que se sienten en TODO el panel** y un par de pulidos.

El **#1 más importante: la "manito" (cursor pointer)**. Hoy, cuando pasas el mouse por casi cualquier botón, NO aparece la manito — se siente "muerto", como si no fuera clicable. Esto se arregla con **una sola línea de CSS** y mejora cada pantalla de una.

El **#2: la "ruedita giratoria" al guardar**. En muchos botones (aprobar reseña, cambiar rol, eliminar item del carrito, "Añadir al carrito") cuando haces clic NO pasa nada visible hasta que recarga. Eso te hace dudar y a veces clickear dos veces (y en el carrito eso puede duplicar una compra). Ya existe en el código una pieza lista para esto (`SubmitButton`) que casi no se usa — solo hay que enchufarla.

El **#3 que mencionaste: el formulario de opciones confunde**. El precio y la foto ya están bien; lo confuso es el bloque "Atributos diferenciadores" lleno de jerga técnica ("aspect ratio", "SKU", "heredar del producto"). Eso es una **mejora de redacción**, no un bug. Más abajo te dejo las decisiones que necesito de ti para ese bloque.

---

## Sus comentarios, aterrizados

| Comentario de Lucy (sus palabras) | Veredicto (confirmado en código) | Tipo | Fix concreto | Esfuerzo |
|---|---|---|---|---|
| "No aparece la manito al pasar por los botones" | **Confirmado.** `globals.css` (leído completo, 276 líneas) no tiene ninguna regla de cursor; la base de shadcn `Button` (`components/ui/button.tsx:8`) tampoco. Solo ~17 archivos la parchean a mano | 🐛 BUG | 1 regla en `@layer base` de `globals.css` (ver Fixes globales) | S |
| "Al guardar no veo que esté cargando / a veces clickeo dos veces" | **Confirmado.** Existe `components/admin/submit-button.tsx` (spinner + disabled, bien hecho) pero solo se importa en **2 archivos** (`bulk-action-bar.tsx`, `checkout/pago/pay-button.tsx`). Decenas de forms con `<button type="submit">` plano sin feedback | 🐛 BUG | Enchufar `<SubmitButton>` en los forms sin feedback | M |
| "El formulario de la opción confunde" | **Confirmado parcialmente.** Precio YA está en pesos (`variant-form.tsx:77` divide /100) y foto YA existe. Lo confuso es el bloque "Atributos diferenciadores" (`variant-form.tsx:96-165`): "aspect ratio", "SKU", "Heredar del producto", "uso futuro bot AI" — jerga | ✨ MEJORA + 🤔 DECISIÓN | Reescribir labels/hints en lenguaje llano; decidir qué atributos esconder (ver Decisiones) | M |
| "Precio tachado por opción" (implícito en D4) | **Ya resuelto a nivel producto**, no por opción. Vive en "Avanzado" (`product-form.tsx:569-592`). El precio normal sale de cada opción; el tachado es uno solo del producto | 🤔 DECISIÓN | Confirmar si quieres tachado POR opción o el actual basta (ver Decisiones) | — |
| "Ordenar productos" | **Ya hecho (D6).** `productos/page.tsx:236-253` usa `<SortableHeader>` con clic en encabezados + dropdown solo mobile | ✓ Cerrado | — | — |
| "Paginar productos" | **Ya hecho.** `productos/page.tsx:324-342` pagina con `pageSize` del service | ✓ Cerrado | — | — |

---

## Fixes globales (aplican a todo el panel) — HACER PRIMERO

### G1 — Manito (cursor pointer) · esfuerzo S · 🐛

Una sola regla, dentro de `@layer base` de `apps/web/app/globals.css` (junto al bloque `* { border-color }` de líneas 186-190, mismo razonamiento de capas documentado ahí para no ganarle a las utilities):

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
  [aria-disabled="true"] {
    cursor: not-allowed;
  }
}
```

- Va **dentro de `@layer base`** sí o sí (si no, gana sobre utilities — bug del Slider 2026-05-18 documentado en el CSS).
- Tras aplicar, los `cursor-pointer` manuales de ~17 archivos quedan redundantes. **Limpiarlos es opcional y NO bloqueante** — dejarlo para un commit de limpieza aparte para no inflar el diff del fix.
- **Certificación:** pasar el mouse por botones de 3 pantallas distintas (productos, reseñas, carrito) y confirmar manito; en un botón deshabilitado confirmar "prohibido".

### G2 — Ruedita de carga (SubmitButton) · esfuerzo M · 🐛

Adoptar el primitive **ya existente** `components/admin/submit-button.tsx` (no crear nada nuevo; tiene variants primary/secondary/danger/ghost, sizes, icon, pendingLabel). Para forms en server components, basta envolver el botón en `<SubmitButton>` (es `"use client"`) — **no hay que convertir la página entera**.

**Gaps a resolver una vez (afectan el resto):**
- Botones-ícono del carrito (eliminar item): verificar que `size="icon"` del SubmitButton lleve `aria-label`. Si no lo soporta, añadir prop.
- Botones-badge (toggle activo en categorías/ocasiones) con estilo inline propio: o se le pasa `className` override, o se crea un mini-wrapper `<PendingFieldset>` que lea `useFormStatus` y deshabilite el badge existente. **Decisión menor del dev**, recomiendo el override de `className` para no crear otra pieza.

Lista completa de call sites por módulo abajo.

---

## Plan por módulo (orden de ejecución en commits lógicos)

### Commit 1 — `fix(ui): cursor pointer global`
Solo G1. Impacto inmediato en todo. Aislado para revertir fácil si algo raro.

### Commit 2 — `feat(ui): loading feedback en mutaciones críticas (carrito + storefront)`
Las de mayor riesgo (doble submit = compra/acción duplicada). Todas 🐛:
- `app/producto/[slug]/page.tsx:235` — **Añadir al carrito** (doble clic = ítem duplicado). Confirmado: form plano.
- `app/carrito/page.tsx:101,199,214` — eliminar ítem / actualizar cantidad (botones-ícono → `size="icon"` + aria-label).
- `app/mi-cuenta/page.tsx`, `components/site-header.tsx`, `admin-shell.tsx` — cerrar sesión (`variant="ghost"`).

### Commit 3 — `feat(admin): loading feedback en acciones de moderación (server components)`
🐛, server components sin ningún estado hoy (confirmados por grep de `type="submit"`):
- `resenas/page.tsx:362,375,386…` — restaurar / aprobar / volver a pendiente / destacar.
- `usuarios/page.tsx:340,359` — cambiar rol / acción admin.
- `redirects/page.tsx` — restaurar / toggle activo.
- `ocasiones/page.tsx`, `categorias/page.tsx` — toggle activo (badge) / mover orden.
- `integraciones/aveonline/page.tsx` — eliminar webhook (`variant="danger"`).
- `contenido/bloques/[id]/page.tsx` + `version-history.tsx` — publicar versión CMS.

### Commit 4 — `feat(admin): spinner en client forms (cambiar texto ≠ ruedita)`
🐛, tienen `pending` pero sin spinner visible (Lucy pidió ruedita, no solo texto):
- `pedidos/[number]/order-actions.tsx` — "Marcar ENVIADO/ENTREGADO/Cancelar": icono estático + un solo `transPending` compartido entre los 3 (al enviar uno se deshabilitan los 3 sin indicar cuál). Spin del icono del form activo. **Esfuerzo M** (hay que separar el estado por acción).
- `usuarios/promote-form.tsx`, `redirects/create-redirect-form.tsx`, `cupones/create-coupon-form.tsx`, `ocasiones/create-ocasion-form.tsx` + `[id]/edit-ocasion-form.tsx` (el delete sin feedback → `variant="danger"`), `ocasiones/[id]/product-ocasion-linker.tsx`.
- `productos/quick-actions.tsx:28,44` — Pausar/Activar/Restaurar por fila (alto tráfico, las usas seguido).

### Commit 5 — `feat(admin): formulario de opciones en lenguaje llano`
✨ MEJORA sobre `variant-form.tsx` (depende de las decisiones de abajo):
- Reescribir labels/hints del bloque "Atributos diferenciadores" (líneas 96-165) en tuteo llano.
- Quitar jerga: "aspect ratio" → esconder o renombrar "Proporción de la foto"; "SKU" → "Código interno (opcional)"; "— Heredar del producto —" → "Igual que el producto"; quitar "(uso futuro bot AI)" de la descripción interna (`:91`).
- Mover atributos avanzados (aspect ratio, forma, acabado override) a un desplegable "Opciones avanzadas" colapsado por defecto, dejando arriba solo lo que usas siempre (nombre, precio, cantidad de fotos, cantidad unidades).

---

## Decisiones que necesito de Lucy

1. **Precio tachado: ¿por producto (como está) o por opción?** Hoy el tachado es uno solo del producto (`product-form.tsx:569`), mientras el precio normal sale de cada opción. Si dos opciones tienen promo distinta, el tachado actual no lo refleja.
   - **Recomendación:** dejarlo como está (por producto). Es más simple y el 90% de las promos son "todo el producto en descuento". Migrar a tachado-por-opción es L (schema + UI + cálculo "desde") y agrega complejidad que probablemente no necesitas. ¿De acuerdo?

2. **Bloque "Atributos diferenciadores": ¿cuáles ves siempre y cuáles esconder?** Hoy muestra 7 campos por igual (fotos, unidades, tamaño, color, forma, acabado, aspect ratio).
   - **Recomendación:** dejar visibles arriba solo **cantidad de fotos, cantidad de unidades, tamaño, color**; mandar **forma, acabado, aspect ratio** a un "Opciones avanzadas" colapsado. ¿Te sirve ese corte o hay alguno que uses siempre?

3. **"SKU" / "Código interno": ¿lo necesitas visible?** Es obligatorio en el form (`variant-form.tsx:64`). Para una vendedora no técnica suele ser ruido.
   - **Recomendación:** mantenerlo pero auto-generarlo desde el nombre y esconderlo bajo "avanzado" (editable si quieres). ¿O lo dejamos visible?

4. **Limpieza de los `cursor-pointer` manuales (17 archivos):** ¿commit de limpieza ahora o lo dejamos para después? Recomiendo **después** — no aporta nada visible y solo agranda el diff del fix global.

---

## Certificación (qué mirar al final)

**Build/smoke (yo, dev):**
- `pnpm build` sin errores de tipo (los `<SubmitButton>` nuevos compilan).
- Server local `localhost:4000` levanta; smoke de las rutas tocadas (productos, reseñas, usuarios, carrito, producto/[slug], pedidos/[number]).

**En navegador (recordatorio para Lucy — esto SÍ requiere mirar):**
- **Cursor:** pasar el mouse por botones en productos, reseñas y carrito → manito en todos; en un botón deshabilitado → "prohibido".
- **Loading carrito/storefront:** clic en "Añadir al carrito" y en eliminar ítem → ruedita gira y el botón se bloquea; intentar doble clic rápido → no duplica.
- **Loading moderación:** aprobar/destacar una reseña, cambiar un rol → ruedita en ESE botón, no en toda la fila.
- **Pedidos:** marcar ENVIADO en un pedido con varias acciones → solo gira el botón que tocaste (no los 3).
- **Form de opciones:** abrir editar opción → el bloque de atributos se lee en español llano, lo avanzado está colapsado, el precio sigue en pesos.

**Esfuerzo total:** G1 (S) + G2 global (M, ~25 call sites mecánicos una vez resuelto el caso badge/icon) + Commit 5 form opciones (M, depende de decisiones). Sin tocar schema salvo que decidas tachado-por-opción (L, no recomendado).

Archivos clave verificados: `/home/ansible/workspaces/lucams_shop/apps/web/app/globals.css` (fix cursor, sin regla hoy), `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/submit-button.tsx` (primitive a reutilizar, solo 2 imports hoy), `/home/ansible/workspaces/lucams_shop/apps/web/components/ui/button.tsx:8` (base sin cursor), `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/variants/variant-form.tsx:96-165` (bloque a reescribir), `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/product-form.tsx:569-592` (precio tachado actual), `/home/ansible/workspaces/lucams_shop/apps/web/app/producto/[slug]/page.tsx:231-242` (add-to-cart sin feedback).