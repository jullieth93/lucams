I now have everything confirmed. The price bug is verified: the variant form sends raw centavos while the schema and DB store centavos, so editing shows raw centavos and a typed value of "5000" is stored as 5000 centavos = $50, while the product form's PriceField multiplies pesos×100. Here is my analysis.

# Cluster 3: Producto — editar + gestionar opciones

Premisa de calidad respetada: cada hallazgo cita `file:line`, distingue BUG / MEJORA UX / DECISIÓN-DE-LUCY, propone fix concreto, esfuerzo (S/M/L) y si toca storefront. No escribí código.

---

## Punto 1 — Resumen de stock en EDITAR ("XXX unidades · X opciones" da poco valor)

**Veredicto: MEJORA UX (no es bug).**

Qué hace hoy:
- `ProductStockSummaryReadonly` (`productos/[id]/page.tsx:241-292`) renderiza una sola tira: emoji + total de unidades + nº de opciones, y si hay agotadas/bajas, una segunda línea con conteos (`:274-280`).
- El botón "Gestionar stock" (`:283-289`) linkea a `/admin/productos/${productId}?section=opciones`. **Linkea bien** — confirmado: la sección `opciones` existe y es válida (`:44`, `:215-221`). No hay bug de routing.

Por qué Lucy ve poco valor: el resumen agrega todo a un número ("87 unidades · 3 opciones") sin decir *cuál* opción está bien o mal. Para una operadora, "¿qué opción se está agotando?" es la pregunta real, y hoy no la responde — hay que clicar e irse a otra pestaña.

Fix propuesto (la "otra visual" que pide): convertir la tira en un **mini-desglose por opción, solo lectura**, dentro del mismo card:
- Una fila compacta por opción activa: nombre (`v.name`, mapeando `"Default"`→`"Única"` como ya hace el panel en `product-variants-panel.tsx:130`) · su stock con emoji de estado · su precio efectivo. Máx 3-4 filas; si hay más, "+N opciones más".
- Mantener el total como encabezado del card y el botón "Gestionar stock" como única acción.
- Los datos ya están disponibles en la página: `product.variants` con `stock`, `price`, `attributes` (`:79-87`), y helpers `getStockEmoji`/`summarizeStock` (`:30-31`). No requiere nueva query.

Esto le da a Lucy "de un vistazo qué opción está roja" sin abrir otra pestaña — alineado con la premisa simple+amigable.

- **Esfuerzo: S** (es presentación, datos ya cargados).
- **Storefront: no.**

---

## Punto 2a — Precio override en CENTAVOS crudos

**Veredicto: BUG REAL confirmado.** Es el bug más serio del cluster.

Evidencia:
- `variant-form.tsx:73-82`: campo `name="price"`, `defaultValue={variant?.price?.toString() ?? ""}` (valor crudo de DB, que está en centavos), hint *"En centavos de peso"*.
- `variant/actions.ts:82` y `:138`: `price: priceStr === "" ? null : Number(priceStr)` — toma el número tal cual, **sin multiplicar ×100**.
- `variant-schemas.ts:99`: `price` documentado como "Precio override en **centavos** COP".

Contraste con el producto: `product-form.tsx` → `PriceField` mantiene `pesos` en el input visible y emite un `<input hidden name=...>` con `Math.round(Number(pesos) * 100)` centavos (`:722-740`). El producto habla pesos; la opción habla centavos crudos.

Consecuencias (dos bugs en uno):
1. **Display al editar**: una opción que vale $5.000 (guardada como 500000 centavos) se muestra como "500000" en el input → confunde, exactamente lo que reportó Lucy.
2. **Captura al crear/editar**: si Lucy escribe "5000" pensando $5.000, se guarda como 5000 centavos = **$50**. Precio 100× menor. Esto puede llegar al **storefront y al carrito** con un precio equivocado → riesgo de venta a precio errado.

Fix propuesto: **unificar con el producto — la opción debe hablar PESOS**. Reusar el patrón `PriceField` (pesos visibles → hidden centavos ×100), o al menos: input en pesos + conversión ×100 en la action + `defaultValue={variant.price / 100}`. Cambiar hint a "Déjalo vacío para usar el precio del producto" y quitar la jerga "centavos de peso" (Lucy no es técnica).

Ojo de simetría inversa al leer: hoy `defaultValue` pasa centavos crudos; al migrar a pesos hay que dividir `/100` en el form y multiplicar `×100` en la action — alinear ambos lados o el bug se invierte.

- **Esfuerzo: S** (campo único, patrón ya existe en `PriceField`; idealmente extraerlo a componente compartido — eso lo hace M).
- **Storefront: indirecto** — corrige precios que sí se muestran al cliente; no cambia código de storefront pero elimina datos corruptos que lo alimentan.

---

## Punto 2b / 4 — "Atributos diferenciadores" sobrecargados (7 campos)

**Veredicto: MEJORA UX + una DECISIÓN-DE-LUCY.**

Qué hay hoy (`variant-form.tsx:101-171`): 7 inputs en grid — `photoSlots`, `quantity`, `sizeCm`, `color`, `shape` (select), `finish` (select), `aspectRatio`. Todos opcionales, todos siempre visibles. Para una operadora no técnica, "Aspect ratio 1:1, 4:5" y "Cantidad de fotos vs Cantidad unidades" son crípticos. Coincido con Lucy: está sobrecargado.

Análisis de cuáles importan de verdad hoy:
- **photoSlots** y **quantity**: son los que el storefront/estudio usa de verdad. `photoSlots` alimenta el editor de personalización (cuántas fotos pide). `quantity` es para packs. Son los dos que generan el label visible (`generateVariantLabel`, `variant-schemas.ts:66-74`) y los que el cliente percibe. **Mantener visibles.**
- **sizeCm**, **color**: aparecen en el label y son comprensibles. Mantener visibles pero secundarios.
- **shape, finish, aspectRatio**: son *overrides* técnicos del schema de personalización. Rara vez una opción difiere del producto en esto. **Candidatos a colapsar** detrás de un "Mostrar atributos avanzados".
- Nota: `cornerRadiusPx` existe en el schema (`variant-schemas.ts:43`) pero **no tiene campo en el form** — confirma que no todos los atributos necesitan UI.

Fix propuesto:
1. Dividir en **"Lo común"** (photoSlots, quantity, sizeCm, color — visibles) y **"Avanzado (overrides del producto)"** colapsado (shape, finish, aspectRatio), con `<details>` o toggle. Reduce de 7 a 4 campos visibles.
2. Renombrar labels a lenguaje llano: "Cantidad de fotos a personalizar", "Unidades por pack", "Tamaño (cm)". Quitar "Aspect ratio" / "Override" del texto visible o moverlo a hint.
3. **Auto-generar el nombre de la opción** desde los atributos: hoy Lucy llena `name` a mano (`:54-62`) Y los atributos por separado → doble trabajo y riesgo de inconsistencia ("Set 12" con photoSlots=6). `generateVariantLabel()` ya produce "12 fotos · 7×9 cm". Propuesta: pre-rellenar/sugerir `name` desde el label generado, dejando override manual. Esto es **DECISIÓN-DE-LUCY**: ¿quiere nombre 100% automático, o sugerido-editable? Recomiendo sugerido-editable (más amigable, menos mágico).

- **Esfuerzo: M** (reorganización + colapso + auto-nombre con estado cliente).
- **Storefront: no** (los atributos ya se consumen igual; solo cambia la captura en admin).

---

## Punto 3 — Stock duplicado (editor rápido en el listado + campo stock en el form full)

**Veredicto: MEJORA UX (inconsistencia que confunde), confirmada.**

Evidencia de la duplicación:
- En el **listado** de opciones: `CompactStockEditor` por fila (`product-variants-panel.tsx:191-199`) — edición rápida de stock, el mismo widget que en Inventario.
- En el **form full** de editar opción: campo `Stock` (`variant-form.tsx:83-90`), que también persiste vía `updateVariantAction` (`actions.ts:140`).

Esto es justo lo que Lucy describe: "el listado permite solo modificar la cantidad; si doy Editar me coloca a llenar múltiples datos". Hay **dos caminos para editar stock** con UX distinta, y peor: pueden divergir. Si Lucy ajusta stock con el editor rápido y luego abre "Editar opción", el form muestra el `defaultValue` del stock cargado en ese render — si la página no se revalidó, puede pisar el valor recién cambiado al guardar. Fuente de errores de inventario.

La decisión de diseño ya documentada en la propia página apunta a "un solo lugar para editar stock" (`page.tsx:155-159`, 236-240) — pero esa intención **no se cumplió dentro del form de la opción**, que todavía tiene el campo.

Fix propuesto: **quitar el campo Stock del `variant-form` full** y dejar el stock SOLO en `CompactStockEditor` (listado de opciones + Inventario). El form de editar opción pasa a ser para *atributos/precio/nombre/estado*, no cantidad. Coherente con el mandato "no tener lo mismo en 3 lados".
- Detalle técnico: hoy `updateVariantAction` lee `stock` del FormData (`actions.ts:140`); al quitar el input, `VariantUpdateSchema.stock` es `.optional()` (`variant-schemas.ts:128`) → se omite y no se pisa. Seguro. Verificar que `createVariant` tenga default 0 (sí: `VariantCreateSchema.stock` default 0, `:100`) para que al crear nazca en 0 y se ajuste luego con el editor rápido.

- **Esfuerzo: S** (quitar un campo + ajustar la action para no leer stock; o dejar la action intacta dado el `.optional()`).
- **Storefront: no.**

---

## Punto 5 — "Precio base por defecto" en AVANZADO (¿residual confuso?)

**Veredicto: DECISIÓN-DE-LUCY (con recomendación técnica).**

Estado actual: con el modelo precio-por-opción, el producto muestra "Desde $X" solo lectura en Lo básico (`product-form.tsx:190-210`), y `basePrice` editable reaparece en Avanzado como "Precio base por defecto" (`:549-575`), descrito como respaldo si una opción no define precio.

Realidad técnica que ata las manos:
- `basePrice` es **columna requerida** en la DB y es el **fallback real**: `priceFrom` lo usa (`page.tsx:95`), el listado de opciones muestra "(hereda del producto)" cuando `v.price === null` (`product-variants-panel.tsx:128-129, 185-189`), y la opción puede tener `price=null` por diseño (`variant-schemas.ts:99`). **No se puede simplemente borrar.**

Pero Lucy tiene razón en que tener "precio" en tres lugares (Desde $X, Precio base en Avanzado, precio por opción) confunde.

Opciones a decidir (recomiendo B):

- **A — Dejarlo como está.** Es correcto técnicamente pero mantiene la confusión.
- **B (recomendada) — Ocultar `basePrice` de la UI y derivarlo automáticamente.** Lucy nunca edita "precio base"; el sistema setea `basePrice` = el precio de la primera/única opción al crearla, y lo deja como fallback invisible. Si toda opción define su `price`, el `basePrice` nunca se ve. Se elimina el campo de Avanzado → menos confusión, sin romper la columna requerida.
  - Riesgo a cubrir: una opción con `price=null` heredaría un `basePrice` que Lucy ya no controla. Mitigación: al guardar opción sin precio, mostrar "hereda $X (de la opción Y)" o forzar que la primera opción siempre tenga precio explícito.
- **C — Renombrar y mantener visible** como "Precio de respaldo (avanzado)" con hint clarísimo. Menos trabajo que B pero conserva un campo que Lucy probablemente no debería tocar.

Importante: **`compareAtPrice`** ("Precio antes (promo)", `product-form.tsx:563-572`) está agrupado en el mismo card. Si se mueve/oculta `basePrice`, decidir dónde queda la promo — probablemente debería vivir a nivel opción también, o quedarse como precio-tachado de familia. Esto es parte de la misma decisión de Lucy.

- **Esfuerzo: A = nulo · B = M** (auto-derivar basePrice al crear/editar opción + quitar campo + manejar caso null) · **C = S.**
- **Storefront: indirecto** — `basePrice` y `compareAtPrice` alimentan el precio "desde" y el tachado de promo en PDP/listado; cualquier cambio de semántica debe verificarse en el storefront (recordatorio de prueba GUI aplica).

---

## Resumen ejecutivo + prioridad realista (pre-launch)

| # | Punto | Tipo | Esfuerzo | Storefront | Prioridad |
|---|-------|------|----------|-----------|-----------|
| 2a | Precio opción en centavos crudos | **BUG (P0)** | S | indirecto (precios corruptos) | **Alta — arreglar ya** |
| 3 | Stock duplicado (form + editor rápido) | MEJORA (riesgo datos) | S | no | Alta |
| 1 | Resumen stock → mini-desglose por opción | MEJORA | S | no | Media |
| 2b/4 | 7 atributos → colapsar + auto-nombre | MEJORA + decisión | M | no | Media |
| 5 | `basePrice` en Avanzado | DECISIÓN Lucy | A:0 / B:M / C:S | indirecto | Media (requiere que Lucy elija A/B/C) |

**Único bug que rompe/confunde con riesgo de plata es el 2a** (precio en centavos) — encaja como fix P0 dentro del pulido UX antes de tocar los bloques de seguridad/observabilidad pendientes. El resto es pulido UX legítimo, barato (3 de 5 son S), y no toca el storefront salvo de forma indirecta vía datos.

**Decisiones que requieren a Lucy antes de implementar:** (a) punto 4 — ¿nombre de opción auto o sugerido-editable?; (b) punto 5 — ¿A, B o C para `basePrice`, y dónde queda `compareAtPrice`?

Paths relevantes:
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/page.tsx` (`ProductStockSummaryReadonly` :241-292)
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/product-variants-panel.tsx` (stock dup :191-199; "Única" map :130)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/variants/variant-form.tsx` (precio bug :73-82; atributos :101-171; stock :83-90)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/variants/actions.ts` (precio sin ×100 :82, :138)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/product-form.tsx` (`PriceField` patrón correcto :705-744; `basePrice` Avanzado :549-575)
- `/home/ansible/workspaces/lucams_shop/apps/web/features/products/variant-schemas.ts` (price en centavos :99; `generateVariantLabel` :66-74)