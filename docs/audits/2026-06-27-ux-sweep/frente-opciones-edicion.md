Confirmed. The model mismatch is real: `displayPrice` is per-variant (line 85), but `hasDiscount`/strikethrough compares against `product.basePrice` and shows `product.compareAtPrice` (product-level). When a non-cheapest variant is selected, the strikethrough is wrong/misleading. `ProductVariant` has no `compareAtPrice` field. I have everything needed.

# Frente 2 — Opciones (edición de una opción)

Verifiqué cada punto contra el código real. Server en `localhost:4000`. Distingo 🐛 BUG / ✨ MEJORA / 🤔 DECISIÓN, con file:line, fix concreto y esfuerzo (S/M/L).

---

## Punto 1 — El form de edición vive DENTRO de la tabla con el encabezado visible

**Veredicto: 🐛 BUG de UI (confirmado, Lucy tiene razón).**

`product-variants-panel.tsx:115-126` renderiza siempre el `<thead>` con las 7 columnas (Opción · Código · Características · Precio · Stock · Estado · Acción). Cuando `editingId === v.id` (línea 136-174), el form se inyecta como un `<tr><td colSpan={7}>` **debajo de ese mismo encabezado**, que sigue ahí arriba. Resultado: la vendedora ve los títulos de columna de tabla flotando sobre un formulario que no es una tabla → exactamente el "error de UI" que reportó. Peor aún: las demás filas de opciones siguen renderizándose debajo (el `map` no filtra al resto), así que el form queda *intercalado* entre filas de tabla.

Esto rompe el patrón mental "estoy en una tabla" vs "estoy editando un registro".

**Fix concreto:** cuando `editingId` (o `newOpen`) esté activo, **no renderizar la tabla en absoluto**. Mostrar SOLO el form, full-width, fuera de `<AdminTable>`, envuelto en un `<AdminCard>` igual que ya se hace para "Nueva opción" (líneas 90-105 — ese caso ya está bien resuelto, el de editar no). El header "Editando: {visibleName}" + botón Cancelar ya existen (líneas 140-150) y se reaprovechan tal cual; solo cambia el contenedor.

Estructura propuesta:
- Si `newOpen` → `<AdminCard>` con `<VariantForm>` create (ya existe).
- Si `editingId` → buscar la variant (`variants.find(v => v.id === editingId)`), renderizar **un solo** `<AdminCard>` con título "Editando: X", `<VariantForm>` + `<VariantImages>`, fuera de la tabla. **No** mapear la tabla.
- Si ninguno → tabla normal.

Esto elimina el `<tr colSpan={7}>` y el bloque `if (isEditing)` dentro del `map` (líneas 136-175 se borran; la lógica sube a un bloque hermano del listado, como ya está `newOpen`).

**Esfuerzo: S** (reestructurar el render, ~30 líneas; no toca server actions ni schema).

Nota GUI para Lucy: tras el cambio, probar en navegador `…/productos/<id>?section=opciones&edit=<id>` — verificar que (a) la tabla desaparece, (b) se ve solo el form con "Editando: X", (c) Cancelar vuelve al listado completo, (d) el botón "Nueva opción" y el form crear siguen bien.

---

## Punto 2 — "Precio de esta opción": afford. de pesos COP

**Veredicto: parte ✨ MEJORA + 🐛 BUG menor de consistencia.**

Verificación del fix de hoy (pesos vs centavos):
- **Lectura**: `variant-form.tsx:77` hace `Math.round(variant.price / 100)` → muestra pesos. Correcto.
- **Hint**: línea 81 dice "En pesos (ej. 45000 = $45.000)". Bien.
- **Pero**: el input es un `<Input type="number">` crudo (línea 74-82) **sin el prefijo `$`** y **sin formateo de miles**. En `product-form.tsx` el `PriceField` (líneas 747-786) SÍ tiene prefijo `$` visual y conversión pesos→centavos en hidden input. El `variant-form` no reusa ese patrón → inconsistencia visual entre los dos formularios de precio del admin.

🐛 **Bug de conversión:** confirmá la ida (escritura). El form envía el valor del input tal cual (pesos) en `name="price"`. Hay que verificar que `actions.ts` del variant **multiplica ×100** al guardar. Si la lectura divide /100 pero la escritura NO multiplica ×100, cada guardado divide el precio por 100. Esto NO lo pude cerrar en este barrido — **revisar `…/variants/actions.ts` (parse de `price`)** antes de tocar nada. Si efectivamente no multiplica, es 🐛 crítico (corrompe precios al editar).

**Fix concreto (mejora):**
1. Añadir prefijo `$` al campo (igual que `PriceField`): `<span>$</span>` absoluto + `pl-6`.
2. Cambiar label a "Precio de esta opción (COP)" o dejar "$" como afford. visual; el hint actual ya aclara.
3. Idealmente extraer el `PriceField` de `product-form.tsx` a un primitive compartido (`components/admin/price-field.tsx`) y usarlo en ambos lados → conversión pesos↔centavos centralizada y a prueba del bug de arriba.

**Esfuerzo: S** (solo afford. visual) / **M** (si se extrae el primitive compartido — recomendado, mata el bug de raíz).

---

## Punto 3 — "Atributos diferenciadores" (7 campos crípticos)

**Veredicto: ✨ MEJORA grande + 🤔 DECISIÓN.**

`variant-form.tsx:96-165` muestra una caja "Atributos diferenciadores (qué hace que esta variante sea distinta)" con 7 campos: `photoSlots`, `quantity`, `sizeCm`, `color`, `shape`, `finish`, `aspectRatio`. Para una vendedora no técnica, "atributos diferenciadores", "aspect ratio", "soft touch", "override del producto" son jerga. Confirmado: es demasiado.

**Cuáles se usan de verdad** (cruzando con `variant-schemas.ts:66-74` `generateVariantLabel`, que es lo único que el cliente VE en la tienda como "Características"):
- El label visible solo usa **`quantity`, `photoSlots`, `sizeCm`, `color`** (líneas 68-71).
- `shape`, `finish`, `aspectRatio`, `cornerRadiusPx` **NO aparecen** en el label ni se ven en la tabla (`generateVariantLabel`). Son overrides técnicos del schema de personalización que hoy **no tienen impacto visible** para Lucy. `cornerRadiusPx` ni siquiera tiene campo en el form (existe en el schema pero no se edita) — campo muerto en UI.

**Diseño propuesto (concreto, lenguaje de vendedora):**

Renombrar la caja a **"¿En qué se diferencia esta opción?"** y partir en dos:

1. **Lo que el cliente ve** (siempre visible, los 4 que alimentan el label):
   - "Cantidad de fotos" → mantener, ya está claro (hint: "Cuántas fotos sube el cliente").
   - "Cuántas vienen en el paquete" (rename de `quantity`; hint: "Para sets/packs, ej. 12 imanes").
   - "Tamaño" (rename de `sizeCm`; placeholder `7×9 cm`).
   - "Color" → ya está claro.
   - Añadir un **preview en vivo** del label: "Así se verá: *12 fotos · 7×9 cm*" usando `generateVariantLabel` (ya existe la función) — feedback inmediato, patrón que Lucy valora.

2. **Ajustes técnicos (opcional)** → colapsar en un `<details>` (mismo `CollapsibleDetails` de `product-form.tsx:702`) titulado "Ajustes avanzados (normalmente no hace falta)": `shape`, `finish`, `aspectRatio`. Arrancan plegados. Quitar `aspectRatio` del primer plano. Considerar **eliminar `aspectRatio`/`cornerRadiusPx` del form** si no se está usando (decisión de Lucy: ¿alguna opción difiere en forma/acabado del producto base? Si nunca, son ruido).

**🤔 DECISIÓN para Lucy:**
- (a) ¿Auto-generar el **nombre de la opción** desde estos campos? Hoy "Nombre de la variante" (`variant-form.tsx:55`) se escribe a mano Y existe `generateVariantLabel` que ya produce "12 fotos · 7×9 cm". Hay duplicación: Lucy escribe "Set 12 unidades" y aparte llena `quantity=12`. Propuesta: pre-rellenar el nombre con el label generado (editable), o mostrar el label como sugerencia bajo el campo nombre. Necesita decisión: ¿el nombre es libre (marketing) o derivado (técnico)?
- (b) ¿`shape`/`finish`/`aspectRatio` siguen existiendo? Si Lucy no los usa, eliminarlos del form (quedan en schema para uso futuro, sin estorbar).

**Esfuerzo: M** (reorganizar la caja + colapsable + preview de label; sin migración, `attributes` sigue siendo el mismo Json).

---

## Punto 4 — "Precio tachado (promoción)" junto al precio normal

**Veredicto: 🐛 BUG de modelo + 🤔 DECISIÓN (requiere migración).**

Esto es lo más serio del frente. Hay una **incoherencia de modelo** que ya produce un bug visible en la tienda:

- El **precio normal vive en la OPCIÓN** (`ProductVariant.price`, schema confirmado; `variant-selector` y PDP usan `displayPrice = selectedVariant.price ?? basePrice`, `page.tsx:85`).
- El **precio tachado vive en el PRODUCTO** (`Product.compareAtPrice`, schema línea 292; editado en Avanzado, `product-form.tsx:569-592`).
- En el PDP (`producto/[slug]/page.tsx:102`): `hasDiscount = product.compareAtPrice != null && product.compareAtPrice > product.basePrice`, y la línea tachada (199-203) muestra `product.compareAtPrice` **al lado de `displayPrice` (que es por opción)**.

🐛 **Bug confirmado:** si una opción cuesta más que `basePrice` (la opción más cara), o si hay varias opciones, el tachado compara el precio de UNA opción contra un `compareAtPrice` global del producto → el "antes/ahora" puede quedar incoherente (ej. precio actual $60.000, tachado $50.000 → tachado MENOR que el actual, descuento negativo). El mismo patrón roto está en `product-card.tsx:16` y `product-from-catalog-card.tsx:22` (comparan `compareAtPrice` vs `basePrice`, que es solo la opción más barata).

Por eso poner "precio tachado" en Avanzado a nivel producto **no puede** lograr la visual "precio normal + promoción juntos" que pide Lucy de forma correcta: el precio normal es por opción y el tachado es global.

**Fix concreto correcto: mover `compareAtPrice` a la OPCIÓN.**
- Añadir `compareAtPrice Int?` a `ProductVariant` en `schema.prisma` (junto a `price`, línea ~donde está `price Int?`).
- En `variant-form.tsx`: poner el campo "Precio antes (promoción)" **inmediatamente debajo de "Precio de esta opción"**, en pesos COP, con el mismo `PriceField`. Hint: "Déjalo vacío si esta opción no está en promo. Se muestra tachado al lado del precio."
- En el PDP/cards: cambiar `hasDiscount` y el tachado para leer `selectedVariant.compareAtPrice` vs `selectedVariant.price` (con fallback al producto para backward-compat durante transición).
- Quitar la `SectionCard` "Precio tachado" de Avanzado en `product-form.tsx:569-592`.

**🤔 DECISIÓN / migración requerida (marcar para Lucy):**
1. Esto es una **decisión de arquitectura** → registrar ADR en `docs/DECISIONS.md` (mover `compareAtPrice` de Product a ProductVariant; razón: el precio es por opción desde el refactor D4, el descuento debe seguirlo).
2. **Migración Prisma** necesaria (nueva columna en `ProductVariant`). Tras migrar: `prisma generate` + `make restart` (mandato de memoria — sin esto, `prisma.productVariant` sirve client viejo).
3. **Backfill**: copiar el `compareAtPrice` actual del producto a su opción más barata (la que define `basePrice`), para no perder promos existentes. Las cards públicas (`product-card`, `product-from-catalog-card`, `productos/page.tsx:108` filtro "descuento") deben pasar a derivar el descuento de la opción "desde" (la más barata) para coherencia.
4. ¿Mantener `Product.compareAtPrice` como deprecated temporal o eliminarlo? Recomiendo dejarlo nullable un release, leer del variant con fallback al producto, y limpiar después.

**Esfuerzo: L** (schema + migración + backfill + actualizar variant-form + PDP + 2 cards + filtro de listado + ADR). Es el único ítem del frente que **no** es seguro hacer sin aprobación explícita de Lucy (toca DB y storefront público).

---

## Resumen accionable

| # | Tema | Tipo | Esfuerzo | Bloqueante de Lucy |
|---|------|------|----------|--------------------|
| 1 | Form de edición fuera de la tabla (ocultar tabla al editar) | 🐛 BUG | S | No |
| 2a | Prefijo `$` + formato en "Precio de esta opción" | ✨ MEJORA | S | No |
| 2b | Verificar que `actions.ts` del variant multiplica ×100 al guardar | 🐛 (posible) | S | No — **revisar primero** |
| 2c | Extraer `PriceField` a primitive compartido | ✨ MEJORA | M | No |
| 3 | Reframe "Atributos diferenciadores": 4 campos visibles + colapsar técnicos + preview de label | ✨ MEJORA | M | Decisión (auto-nombre, eliminar shape/finish/aspectRatio) |
| 4 | Mover `compareAtPrice` de Product a ProductVariant; tachado junto al precio por opción | 🐛 BUG modelo + 🤔 | L | **SÍ — requiere ADR + migración + aprobación** |

**Prioridad sugerida:** 2b (verificar bug de conversión) → 1 (bug UI rápido, alto impacto en la queja principal) → 3 (mejora de claridad) → 4 (requiere decisión + migración; el bug del tachado ya está en producción, conviene cerrarlo, pero con aprobación).

**Archivos tocados por frente:**
- P1: `apps/web/components/admin/product-variants-panel.tsx`
- P2: `apps/web/app/admin/(panel)/productos/[id]/variants/variant-form.tsx` (+ `…/variants/actions.ts` a verificar; opcional nuevo `apps/web/components/admin/price-field.tsx`)
- P3: `apps/web/app/admin/(panel)/productos/[id]/variants/variant-form.tsx` (+ `apps/web/features/products/variant-schemas.ts` si se elimina algún attr)
- P4: `packages/db/prisma/schema.prisma`, `apps/web/app/admin/(panel)/productos/[id]/variants/variant-form.tsx`, `apps/web/app/admin/(panel)/productos/product-form.tsx`, `apps/web/app/producto/[slug]/page.tsx`, `apps/web/components/product-card.tsx`, `apps/web/components/product-from-catalog-card.tsx`, `apps/web/app/productos/page.tsx`, `apps/web/features/products/*`, `docs/DECISIONS.md`