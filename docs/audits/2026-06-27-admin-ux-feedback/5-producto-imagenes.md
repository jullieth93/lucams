Confirmed: no image field anywhere on `ProductVariant` — not in schema, not in attributes Json, not in public-service, not in variant-form. Images are 100% product-level. I have all the evidence needed.

# Cluster 5: Imágenes — portada + por opción (admin + storefront)

## 1. Estado actual (qué hay hoy, verificado en código)

**Las imágenes son SOLO a nivel producto.** No existe imagen por opción/variante en ninguna capa:

- **Schema** — `Product.images String[]` (`schema.prisma:334`). `ProductVariant` **no tiene** ni `image` ni `images` (`schema.prisma:361-390`). El Json `attributes` tampoco contempla imagen: las keys válidas son `sizeCm`, `photoSlots`, `quantity`, `shape`, `finish`, `color`, `aspectRatio` (`variant-schemas.ts:22-46`) — ninguna es imagen.
- **Admin** — `ProductImages` (`product-images.tsx`) sube/reordena/borra contra `Product.images[]` vía server actions. Se renderiza una sola vez, al final del tab "Editar" (`[id]/page.tsx:210`), **debajo** del `ProductForm`. La pestaña "Opciones" (`ProductVariantsPanel`) **no tiene** ningún control de imagen.
- **"Portada" = convención implícita, no campo.** La portada es simplemente `images[0]`. La UI lo comunica con un badge "⭐ Principal" sobre la primera celda (`product-images.tsx:137-141`) y el hint "La primera imagen es la principal" (`product-images.tsx:81, 123`). Para cambiar portada, Lucy reordena con las flechas ↑/↓ (`product-images.tsx:146`). **No hay un "slot de portada" visualmente separado** — es la primera de una grilla homogénea de 2-3 columnas.
- **Storefront PDP** — `ProductGallery` (`product-gallery.tsx`) recibe `product.images` (`producto/[slug]/page.tsx:164`) y muestra hero + hasta 5 thumbnails. El hero arranca en `activeIdx=0` (= `images[0]` = portada). **La galería es totalmente independiente del `VariantSelector`**: al elegir una opción NO cambia la foto. `VariantSelector` (`variant-selector.tsx`) sólo actualiza precio + URL `?variant=id` + link al Estudio; nunca toca `activeIdx` ni las imágenes. El metadata OG y el JSON-LD también usan `images[0]` / `images` a nivel producto (`page.tsx:43, 120`).

**Resumen:** hoy hay una sola galería compartida por toda la familia. El Set 6 y el Set 12 muestran exactamente las mismas fotos.

## 2. Lo que pide Lucy, mapeado a la realidad

Lucy pide dos cosas distintas que conviene separar:

- **(A) Una foto de PORTADA clara y explícita** — "¿dónde cargo la principal?". Hoy existe pero está disimulada: es "la primera de la grilla", no un slot dedicado. Esto es **MEJORA UX pura, sin schema** (S).
- **(B) Fotos POR OPCIÓN** — "el Set 6 se ve distinto al Set 12". Esto **NO está soportado** por el modelo. Requiere campo nuevo en `ProductVariant` + UI admin nueva + cambios en storefront para que la galería reaccione a la opción elegida. Es **L** y toca admin + storefront + migración.

## 3. Storefront: ¿debería cambiar la foto al elegir opción?

Sí, es el comportamiento esperado de e-commerce (elegir "Set 12" muestra el Set 12). **Hoy no ocurre** porque galería y selector están desacoplados. Para lograrlo hace falta:
- imagen(es) asociadas a la variante (depende de B),
- subir el estado de "variante seleccionada" desde `VariantSelector` (client) a un nivel donde también viva la galería, o consolidar ambos en un client component padre. Hoy `VariantSelector` y `ProductGallery` son hermanos sin estado compartido; el `selectedVariant` "real" se resuelve server-side vía `?variant=` (`page.tsx:81-83`) pero la galería no lo lee.

Matiz importante para no sobre-ingenierizar: para productos **personalizables** (la mayoría del catálogo, `personalizationKind != NONE`), la foto "del producto final" la genera el cliente en el Estudio; las fotos por opción son más bien **ejemplos/mockups** del formato. Para **coleccionables** (`kind=NONE`, productos con SKU físico real distinto por opción) el cambio de foto por opción aporta más. Vale la pena que Lucy decida si lo quiere para todo el catálogo o solo coleccionables.

## 4. Propuesta concreta

### Parte A — Portada explícita (recomendado hacer ya, S)
En `product-images.tsx`, sin tocar schema:
- Renderizar la **primera imagen en grande y aislada** ("Foto de portada") y el resto en una grilla aparte ("Más fotos"). Sigue siendo `images[0]`, pero deja de parecer una celda más.
- Botón directo **"Usar como portada"** en cada celda no-principal (atajo de un click a `handleReorder(idx, 0)`), en vez de obligar a subir de a uno con ↑. El badge "⭐ Principal" ya existe y se conserva.
- **Mover `ProductImages` arriba** dentro del tab "Editar" (hoy va último, `[id]/page.tsx:210`): las imágenes son lo primero que Lucy quiere tocar. Ponerlo justo bajo el resumen de stock o entre el form y este. Cambio de orden de JSX, trivial.

### Parte B — Foto por opción (decisión de Lucy + L)
Si Lucy lo aprueba:
- **Schema:** agregar `ProductVariant.images String[] @default([])` (mismo patrón que `Product.images`; más flexible que `image String?` y reutiliza el storage que ya existe). Migración Prisma + `prisma generate` + `make restart` (mandato de memoria).
- **Admin:** dentro de cada opción en `ProductVariantsPanel`, un mini-uploader (reutilizar la lógica de `image-actions.ts` parametrizada por variantId). Mensaje claro: "Fotos de esta opción (si las dejas vacías, se usan las del producto)". Herencia = sin fricción para Lucy: solo sube fotos por opción cuando de verdad difieren.
- **Storefront:** en el PDP, resolver `galleryImages = selectedVariant.images.length ? selectedVariant.images : product.images`. Como el cambio de opción debe reflejarse en la galería sin recargar, hay que **compartir el `selectedId`** entre `VariantSelector` y `ProductGallery` (consolidarlos bajo un client wrapper, o pasar las imágenes de la variante y un callback). También actualizar OG/JSON-LD si se quiere (opcional, menor).

**Patrón de herencia recomendado** (coincide con cómo ya funciona `price`: `variant.price ?? basePrice`, `variant-selector.tsx:230`): variante hereda las imágenes del producto si las suyas están vacías. Es coherente con el modelo mental que Lucy ya maneja.

## 5. Esfuerzo y clasificación

| Parte | Tipo | Esfuerzo | ¿Toca storefront? |
|---|---|---|---|
| A — Portada explícita + "Usar como portada" + reordenar JSX | MEJORA UX | **S** | No (ya usa `images[0]`) |
| B — Foto por opción (schema + admin uploader + galería reactiva) | DECISIÓN-DE-LUCY → si aprueba, feature | **L** | Sí (galería + selector acoplados; opcional OG/JSON-LD) |

**No hay bug** en este cluster — todo es comportamiento de diseño actual; la confusión de Lucy ("¿dónde cargo portada / por opción?") es real pero por **ausencia de feature (B)** y **portada poco explícita (A)**, no por algo roto.

## Recomendación de prioridad (frente a pre-launch)
- **A ahora**: barato, alto retorno de claridad para Lucy, cero riesgo, alineado con "simple y amigable". Hacerlo en este pulido.
- **B después**: es feature con migración + cambio storefront, compite con Bloques C/D/E pre-launch. Sugerir a Lucy diferirlo y, si lo quiere, acotarlo a coleccionables (`kind=NONE`) donde la foto por opción aporta de verdad — no a todo el catálogo personalizable. Requiere que **Lucy decida** alcance antes de invertir el esfuerzo L.

**ACCIÓN HUMANA REQUERIDA:** Lucy debe decidir si quiere la Parte B (foto por opción) y, en tal caso, si aplica a todo el catálogo o solo a coleccionables. La Parte A se puede ejecutar sin su decisión.

Archivos relevantes: `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/product-images.tsx`, `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/page.tsx:210`, `/home/ansible/workspaces/lucams_shop/packages/db/prisma/schema.prisma:334,361`, `/home/ansible/workspaces/lucams_shop/apps/web/app/producto/[slug]/page.tsx:164`, `/home/ansible/workspaces/lucams_shop/apps/web/app/producto/[slug]/variant-selector.tsx`, `/home/ansible/workspaces/lucams_shop/apps/web/components/product-detail/product-gallery.tsx`, `/home/ansible/workspaces/lucams_shop/apps/web/features/products/variant-schemas.ts`.