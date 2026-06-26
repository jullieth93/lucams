I have enough evidence. Producing the final analysis now.

# Dimensión 6: Mental model no-técnico

> Auditoría de terminología sobre Lucams_shop admin (commit `f3a64ef`, branch `develop`, 2026-06-26). Strings verificados leyendo `apps/web/lib/admin-nav.ts`, `apps/web/app/admin/(panel)/productos/**`, `apps/web/app/admin/(panel)/categorias/**`, `apps/web/app/admin/(panel)/ocasiones/**`, `apps/web/components/admin/**`.

---

## TL;DR honesto

El admin actual está **a medio camino**: hay aciertos reales (badges de estado con emoji 🟢/⚫/⭐, `"Código interno (SKU)"`, hint inline `"50 – 50.000 g"`, copy de confirmación tono cálido como `"¿Archivar la categoría "X"? Quedará oculta del storefront."`), pero también **jerga técnica cruda visible** que Lucy va a tener que descifrar todos los días: `Variantes`, `SKU` solo, `slug`, `(soft-delete)`, `override`, `aspect ratio`, `Heredar del producto`, `Atributos`, `markdown`.

El bigger problem **no es la terminología palabra por palabra** — es que el **modelo mental del sidebar no coincide con cómo Lucy piensa su negocio**. Categorías y Ocasiones conviven como hermanos cuando para Lucy son cosas muy distintas (una es "cómo organizo mi tienda", la otra es "para qué sirve cada cosa"). Y "Plantillas" en sidebar de Catálogo va a chocar con "Plantillas de correo" en Configuración cuando ambas existan.

---

## Glosario Lucy → schema → recomendación UI

| Cómo Lucy lo llama (Instagram, WhatsApp, conversación) | Cómo se llama en schema | Cómo aparece HOY en admin | Recomendación |
|---|---|---|---|
| "mi catálogo", "lo que vendo", "mis productos" | `Product` | `Productos` (sidebar), `Producto` (tabla) | **Mantener `Productos`.** Es la palabra que ella ya usa cuando le preguntan "¿qué tienes?". |
| "lo que tengo listo para enviar", "lo que me queda" | `ProductVariant.stock` | `Stock` (col tabla variants), `Inventario` (aria-label) | Usar **`Inventario`** consistente en columnas y badges. `Stock` es jerga retail-tech; `Inventario` es palabra colombiana cotidiana. |
| "las versiones", "los tamaños", "el set de 6 vs el de 12" | `ProductVariant` | `Variantes` (sub-página + tabla + form) | **`Versiones` o `Presentaciones`.** "Variante" es palabra de manual técnico — ningún cliente, ningún vendedor, ningún Instagram-post de Lucy dice "variantes". El propio AdminNotice ya tiene que explicar `"¿Qué son las variantes?"` (variants/page.tsx:109) — eso es señal de que el nombre falla. |
| "Polaroid clásico", "fondo corazón rosa" (plantilla del Estudio) | `PersonalizationTemplate` | Sidebar Catálogo › `Plantillas` (placeholder "Próximo") | **`Plantillas del Estudio`** o **`Diseños base`**. Diferenciar explícitamente porque ya existe `Plantillas de correo` en Configuración (admin-nav.ts:277). Dos "Plantillas" en sidebar = confusión garantizada. |
| "las categorías de mi tienda", "la sección de aniversarios" | `Category` | `Categorías` | **Mantener `Categorías`.** Esta sí es palabra de su lenguaje (Instagram tiene "Highlights por categoría"). |
| "para Día de la Madre", "para aniversario", "para cumpleaños" | `OcasionTag` | `Ocasiones` | **Mantener `Ocasiones`**, es buen naming. Es exactamente como ella habla con clientes ("¿para qué ocasión es?"). |
| "los descuentos", "el código promo", "los cupones del Black Friday" | `Coupon` | `Cupones` | **Mantener `Cupones`** — es palabra colombiana usada. `Promociones` sería válido también pero `Cupones` es más específico y ya está en uso. |
| "las calificaciones", "las opiniones", "las estrellas que dejaron" | `Review` | `Reseñas` | **Mantener `Reseñas`**. Lucy probablemente dice "reseñas" o "opiniones" indistinto; `Reseñas` ya está bien. |
| "lo que va junto", "el combo", "lo que también compran" | `Recomendaciones` (placeholder) | Sidebar Catálogo › `Recomendaciones` (Fase 4) | **`Combos y sugerencias`** o **`Lo que va junto`**. "Recomendaciones" suena a Netflix/Spotify, no a vendedora de fotoimanes en Instagram. |
| "el código del producto", "lo que uso para diferenciar" | `Product.sku` / `ProductVariant.sku` | `SKU` solo (columnas tabla, hints, búsqueda) | **`Código interno`** en columnas y filtros. En product-form.tsx:64 ya está bien: `"Código interno (SKU)"`. Aplicar el mismo patrón en `productos/page.tsx:127` (búsqueda) y `productos/page.tsx:214` (header tabla). |
| "el link bonito", "la dirección de la página" | `slug` | `slug:` debajo del nombre (productos/[id]/page.tsx:subtitle), `/slug` debajo del nombre (lista) | **`URL`** o **`Dirección web`**. Lucy nunca va a decir "slug" en su vida. |
| "lo guardé borrador", "lo dejé en pausa" | `isActive=false` | `Inactivo`, `Solo inactivos (ocultos pero recuperables)` | **`Pausados`** o **`Borradores`**. "Inactivo" suena a cuenta bancaria sancionada. |
| "lo borré", "lo archivé porque ya no lo vendo" | `archivedAt != null` | `Archivado`, `Solo archivados (papelera)`, `(soft-delete)` | **`En la papelera`** unificado. La `papelera` (productos/page.tsx:147) está bien — pero después aparece `archivado (soft-delete)` (page.tsx:102) — paréntesis técnico **eliminar**. |
| "el precio que dejé escrito antes" (precio promo tachado) | `priceCompareCents` | `Precio antes (promo)` | OK como está. |
| "ese precio especial solo para el set grande" | `ProductVariant.priceOverrideCents` | `Precio override (COP)` + `"Dejar vacío para heredar del producto"` | **`Precio especial para esta versión`** + hint `"Si lo dejas vacío, usamos el precio del producto."`. "Override" y "heredar" son palabras de programación. |
| "el tamaño", "lo grande que viene cada foto" | `physicalSize` (variant) | `Tamaño físico` + placeholder `7×9` | OK, mantener. |
| "rectángulo / corazón / círculo" | `ProductVariant.shape` | `Forma` con `"— Heredar del producto —"` | **`"— Igual que el producto base —"`**. |
| "mate / brillante / vidrio" | `ProductVariant.finish` | `Acabado` con `"— Heredar del producto —"` | Igual. |
| "la proporción / cuadrada / panorámica" | `aspectRatio` | `Aspect ratio` con placeholder `"1:1, 4:5"` | **`Proporción de la foto`** + hint humano `"Cuadrada (1:1) o vertical (4:5)"`. |

---

## Naming guidelines para sidebar (Catálogo)

**Evitar:**
- `Variantes` → técnico, requiere explicación inline (ya la tienes en variants/page.tsx:109).
- `Plantillas` solo → colisiona con `Plantillas de correo` cuando ambas existan.
- `Recomendaciones` → vocabulario de plataformas grandes, no de vendedora artesanal.
- `Tags`, `SKU` solos → anglicismo técnico.
- `Slug`, `Override`, `Heredar`, `Atributos`, `Markdown` → 100% jerga programador.
- `(soft-delete)`, `(papelera)` con paréntesis explicativos → si necesitan paréntesis, el nombre está mal.

**Preferir:**
- `Productos` ✓ (ya está).
- `Categorías` ✓ (ya está).
- `Ocasiones` ✓ (ya está, excelente).
- `Plantillas del Estudio` (cuando se active el sub-módulo).
- `Combos y sugerencias` (en lugar de Recomendaciones, cuando se active).
- `Versiones del producto` o `Presentaciones` (sub-página oculta hoy en `/productos/[id]/variants`).
- `Código interno` (en columnas/búsqueda; el `(SKU)` opcional entre paréntesis).
- `Inventario` consistente (no mezclar con `Stock`).
- `URL` en lugar de `slug`.

---

## Confirmaciones destructivas — copy es-CO tuteo

Strings actuales verificadas en el repo:

| Archivo:línea | Copy actual | Diagnóstico | Propuesta |
|---|---|---|---|
| `productos/[id]/page.tsx:103` | `¿Archivar "X"? Quedará oculto del storefront. Puedes restaurarlo después editando el producto.` | "storefront" es jerga | `¿Archivar "X"? Va a quedar oculto en tu tienda. Lo puedes traer de vuelta después desde la papelera.` |
| `categorias/page.tsx:283` | `¿Archivar la categoría "X"? Quedará oculta del storefront.` | "storefront" | `¿Archivar la categoría "X"? Va a quedar oculta en tu tienda. La puedes traer de vuelta después.` |
| `categorias/[id]/page.tsx:127` | `¿Archivar la categoría "X"? Quedará oculta del storefront. Acción reversible (podés reactivarla después).` | **VOSEO ARGENTINO** (`podés`, `reactivarla`) viola memoria es-CO tuteo. También "storefront" + "reversible" jerga. | `¿Archivar la categoría "X"? Va a quedar oculta en tu tienda. Puedes traerla de vuelta cuando quieras.` |
| `productos/[id]/variants/page.tsx:241` | `¿Archivar la variante "X"? Los pedidos que la referencian seguirán válidos, pero clientes nuevos no podrán seleccionarla.` | "que la referencian" es jerga DB | `¿Archivar la versión "X"? Los pedidos que ya la tienen siguen normales. Los clientes nuevos ya no van a poder elegirla.` |
| `ocasiones/[id]/edit-ocasion-form.tsx:161` | `¿Archivar esta ocasión? Los productos asociados pierden el tag.` | "asociados", "tag" | `¿Archivar esta ocasión? Los productos que la tenían marcada van a perder esa etiqueta.` |
| `ocasiones/[id]/product-ocasion-linker.tsx:65` | `¿Desasociar este producto de la ocasión?` | "Desasociar" es palabra de manual | `¿Quitar este producto de esta ocasión?` |
| `productos/product-images.tsx:64` | `¿Borrar esta imagen? Esta acción no se puede deshacer.` | OK pero impersonal | `¿Borrar esta imagen? No la vamos a poder recuperar después.` |

**Patrón propuesto para futuras confirmaciones destructivas:**
> `¿[Verbo en tuteo] [qué cosa con nombre]? [Qué pasa en lenguaje de Lucy]. [Si es reversible, decir cómo recuperarlo].`

---

## Quick wins de copy (sin restructuración del sidebar)

Cambios que se pueden hacer en una sesión sin tocar arquitectura. Verificados línea por línea:

### Sub-página Variantes (`productos/[id]/variants/page.tsx`)
- **L76, L109, L120, L137, L144, L150 (botones+títulos+tabla):** `Variantes` → `Versiones`. Y eliminar el `AdminNotice` "¿Qué son las variantes?" porque con el nuevo nombre se entiende solo (o simplificar a `"Si tu producto se vende en distintos tamaños/cantidades/colores, créalas acá."`).
- **L137:** `"Este producto no tiene variantes"` → `"Este producto no tiene versiones todavía"`.
- **L138:** `"Algo raro — todo producto debería tener al menos la variante Default."` → es un mensaje para programador, no para Lucy. Cambiar a `"Crea al menos una versión para empezar a vender este producto."` o esconderlo si es un caso imposible.

### Formulario de variante (`productos/[id]/variants/variant-form.tsx`)
- **L55:** `Nombre de la variante` → `Nombre de esta versión` (`placeholder` "Ej. Set 12 unidades" está bien).
- **L64:** `SKU` solo → `Código interno (SKU)` (mismo patrón que productos).
- **L74:** `Precio override (COP)` → `Precio especial para esta versión`. **L78:** `"Dejar vacío para heredar del producto"` → `"Si lo dejas vacío, usamos el precio del producto."`.
- **L94, L97:** `Descripción interna` + `"¿Por qué elegir esta variante vs otras? (uso futuro bot AI)"` → `Notas internas` + `"Para tu referencia o para el bot de WhatsApp (uso futuro)."`.
- **L144, L156:** `"— Heredar del producto —"` → `"— Igual que el producto base —"`.
- **L164, L167:** `Aspect ratio` + placeholder `1:1, 4:5` → `Proporción de la foto` + hint `"Cuadrada (1:1) o vertical estilo Polaroid (4:5)"`.

### Lista de productos (`productos/page.tsx`)
- **L102:** `"Producto archivado (soft-delete)."` → `"Producto enviado a la papelera. Lo puedes recuperar cuando quieras."`. Eliminar `(soft-delete)`.
- **L127:** placeholder búsqueda `"Por nombre, SKU o slug…"` → `"Por nombre o código interno…"`.
- **L144-147:** filtros estado activos pero términos crudos:
  - `Todos (activos + inactivos + archivados)` → `Todos`
  - `Solo activos (visibles en tienda)` → `Visibles en la tienda`
  - `Solo inactivos (ocultos pero recuperables)` → `Pausados (ocultos pero recuperables)`
  - `Solo archivados (papelera)` → `En la papelera`
- **L214:** columna tabla `SKU` → `Código`.
- **L226:** mostrar `/p.slug` debajo del nombre = "URL de la página" sin label — agregar prefijo visual o tooltip `"URL: /productos/{slug}"`.

### Editor de producto (`productos/product-form.tsx`)
- Ya tiene aciertos: emojis en checkboxes (🟢 Visible / ⭐ Destacado / 🎨 Personalizable), hint Ley 1480 en garantía, hint humano "Estos son los datos del paquete final, no del producto suelto". **Mantener este nivel**.
- **L239:** `Descripción larga (markdown)` → `Descripción larga` y mover `(formato markdown)` a un hint inline pequeño con un link "¿qué es markdown?" → preview pestaña. Lucy NO sabe markdown.
- **L244:** `"Descripción rica (300-800 palabras)"` → `"Descripción completa del producto"` + hint `"Entre 300 y 800 palabras ayuda al SEO."`.
- Subtitle del header de detail (`productos/[id]/page.tsx`): `SKU: X · slug: Y` → `Código: X · URL: /productos/Y`.

### Editor de categoría / ocasión
- Misma campaña: revisar labels `slug`, `Archivar (soft-delete)`, `asociar/desasociar`, `tag` y reemplazar por equivalentes humanos.

---

## Lo que SÍ está bien (mantener)

Para no romper lo que ya funciona:
- Badges con emoji: `🟢 Visible en la tienda`, `⭐ Destacado en home`, `🎨 Personalizable` (product-form.tsx:214-228) — patrón excelente, replicar.
- Confirmaciones con tono cálido (cuando no tienen voseo): mantener estructura "¿Acción "nombre"? Qué pasa después."
- `Código interno (SKU)` en product-form.tsx:64 — patrón correcto (palabra humana + jerga entre paréntesis).
- Hints inline: `Ley 1480 mínimo 12.`, `50 – 50.000 g`, `Estos son los datos del paquete final…` — el tono educativo es exactamente lo que Lucy necesita.
- Subtitle de `Ocasiones` y `Categorías` en el sidebar — naming correcto, no tocar.

---

## Nota crítica: voseo argentino detectado

Hay **una violación durable** de memoria es-CO tuteo:
- `categorias/[id]/page.tsx:127` → `"podés reactivarla"` debe ser `"puedes reactivarla"` o (mejor) `"la puedes traer de vuelta"`.

Vale la pena un grep global del repo por `podés|querés|tenés|sabés|hacés|decís|recibís|tomás` antes de cerrar la auditoría para no dejar más sueltos.

Archivos relevantes (rutas absolutas):
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/admin-nav.ts`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/product-form.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/variants/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/variants/variant-form.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/categorias/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/categorias/[id]/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/ocasiones/[id]/edit-ocasion-form.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/ocasiones/[id]/product-ocasion-linker.tsx`