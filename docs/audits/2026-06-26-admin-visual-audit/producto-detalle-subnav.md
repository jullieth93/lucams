Now I have all the context needed. Let me analyze the findings.

# Audit /admin/productos/[id]

## Findings P0

### P0-1 — `ProductReviewsPanel` ReviewCard: archivar SOLO aparece en tab "Aprobadas", no en "Pendientes"
**Archivo:** `product-reviews-panel.tsx` líneas 313-326
**Problema:** El bloque del botón "Archivar" está envuelto en `{showFeatureToggle && (...)}` — es la misma flag que controla "Destacar". Como `showFeatureToggle` solo es `true` cuando `subTab === "approved"`, Lucy NO puede archivar una reseña desde el tab "Pendientes". Si una reseña es spam, lo único que tiene es "Rechazar". Esto contradice la docstring del archivo (líneas 17-18) que dice "Acciones inline por reseña: Aprobar / Destacar / Archivar". Es un bug funcional, no solo visual, pero se manifiesta como "el botón Archivar desaparece donde se necesita".

### P0-2 — `ProductReviewsPanel` ReviewCard: header se rompe con muchos elementos en línea
**Archivo:** `product-reviews-panel.tsx` líneas 238-255
**Problema:** En la línea de cabecera del review, hay 5 elementos in-line con `flex items-center gap-2`: Stars + nombre autor + "ciudad · fecha" + AdminBadge "Destacada" + "📷 N fotos". Cuando el autor tiene un nombre largo + ciudad + es destacada + tiene fotos, no hay `flex-wrap`, solo `flex items-center`. El nombre del autor no tiene `truncate` ni `min-w-0`. En desktop angosto (~900px panel con sidebar) o un nombre largo van a empujar elementos fuera del card. El padre tiene `min-w-0 flex-1` pero los hijos in-line no tienen escape válvula.

### P0-3 — `ProductReviewsPanel` "Restaurar": link apunta a URL incorrecta
**Archivo:** `product-reviews-panel.tsx` líneas 327-336
**Problema:** El href del botón "Restaurar" es `/admin/resenas?productId=${review.id}` — pasa el `review.id` como `productId`, no el `productId` real. Bug funcional con consecuencia visual (la página de destino mostrará lista vacía o filtro raro). Debería ser `?productId=${productId}` (el prop del panel) o un parámetro de restoreId.

### P0-4 — `ProductStockPanel` modo múltiple: link "Editar todas las variantes" apunta a sub-ruta vieja
**Archivo:** `product-stock-panel.tsx` líneas 164-171 (y también líneas 71-77 para el caso sin variants)
**Problema:** El link va a `/admin/productos/${productId}/variants` — pero según `page.tsx` y la docstring del propio `ProductVariantsPanel`, las versiones ahora viven en `/admin/productos/${productId}?section=versiones`. La sub-ruta vieja /variants quedó migrada. Lucy va a llegar a 404 o a la ruta legacy (depende de qué quedó en disco). Bug visual = botón visible que rompe el flujo.

### P0-5 — `SimpleVariantStockEditor`: grid colapsa en mobile bajo `sm`
**Archivo:** `product-stock-editor.tsx` línea 53
**Problema:** `grid-cols-[1fr_auto] gap-2 sm:max-w-md`. La grid `[1fr_auto]` aplica desde mobile. En <360px el botón "Actualizar" + input compiten por espacio: el Input ocupa `1fr` (mínimo limitado por el `placeholder` y `min-content` del number), pero el Button con texto "Guardando…" + icono más el padding del Button `size=lg` mide ~150px. En un container de ~340px (mobile chico) queda input de ~180px sin reserva visual. Además, ninguno tiene `min-w-0` por defecto, lo que en grids causa que children del grid no se compriman bien (default min-width: auto). Riesgo de overflow horizontal. Sugiero `grid-cols-1 sm:grid-cols-[1fr_auto]` o flex-wrap.

## Findings P1

### P1-1 — `ProductSectionNav` badge color: en estado active+amber confunde
**Archivo:** `product-section-nav.tsx` líneas 81-84
**Problema:** Cuando el tab "Reseñas" está activo Y hay reseñas pendientes, badge usa `bg-amber-300/30 text-white`. El amber-300 al 30% sobre `bg-brand-purple` (mucho contraste de fondo púrpura) produce un beige apagado. El badge pierde el "tono urgente" que tenía cuando estaba inactivo (`bg-amber-100 text-amber-900`). El usuario que ya está en la tab activa pierde el signal de urgencia. Mejor mantener amber-100 + texto amber-900 incluso en active.

### P1-2 — `ProductReviewsPanel`: sub-tabs no tienen el contenedor `border rounded` del nav principal
**Archivo:** `product-reviews-panel.tsx` líneas 99-126
**Problema:** Los sub-tabs (Pendientes/Aprobadas/Archivadas) tienen `flex gap-1 overflow-x-auto` SIN contenedor `bg-white rounded border` como sí tiene el `ProductSectionNav` superior. Visualmente flotan sobre el fondo de la página. Inconsistencia con el nav padre (que SÍ tiene `rounded-xl border bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur`). Crea una jerarquía visual confusa: nav padre se ve "card-ish" y sub-nav se ve "raw text".

### P1-3 — `ProductSectionNav` y `SubTab` reviews: alturas distintas (h-11 vs h-10)
**Archivo:** `product-section-nav.tsx` línea 74 (`h-11`) vs `product-reviews-panel.tsx` línea 181 (`h-10`)
**Problema:** El sub-nav principal usa `h-11` (44px touch target). Los sub-tabs de reviews usan `h-10` (40px) → no llega al mínimo de 44px de touch target en mobile. Además es inconsistente visualmente: ambos son tabs.

### P1-4 — `ProductVariantsPanel` acciones de fila: touch targets <44px
**Archivo:** `product-variants-panel.tsx` líneas 194-214
**Problema:** Botón "Editar" e "Archivar" tienen `px-2 py-1 text-xs` con icono `h-3.5 w-3.5` → altura efectiva ~28-30px. <44px touch target. Especialmente el botón "Archivar" que solo tiene icono sin label visible (`title="Archivar"` no es accesible en touch). Lucy puede mistapear.

### P1-5 — `ProductVariantsPanel` botón "Nueva versión" alineación dentro/fuera del card
**Archivo:** `product-variants-panel.tsx` líneas 64-74
**Problema:** El botón "Nueva versión" vive en un `<div className="flex justify-end">` SIN card padre. Pero el `AdminNotice` arriba y la `AdminTable` abajo SÍ son contenedores con bordes/padding. Al renderear, el botón "flota" en el espacio sin alineación visual con los containers adyacentes. Inconsistencia de altura con el rest del flow.

### P1-6 — `ProductReviewsPanel` Stars + AdminBadge mezclan tipografías
**Archivo:** `product-reviews-panel.tsx` líneas 238-255
**Problema:** En la línea inline tenemos `text-sm font-semibold` (autor), `text-xs` (ciudad/fecha), badge interno con su propio size, `text-xs` (fotos). 4 tamaños de texto en una sola línea. Visualmente ruidoso. Sugiero estandarizar fechas+ciudad+fotos en el mismo size+color y separar nombre+stars con jerarquía clara.

### P1-7 — `ProductVariantsPanel` columna "Características" badge sin truncate
**Archivo:** `product-variants-panel.tsx` líneas 169-173
**Problema:** El badge `<span class="bg-brand-purple/8 inline-block rounded px-2 py-0.5">{label}</span>` muestra `generateVariantLabel(attrs)`. Si los attributes son múltiples (ej. "Tamaño M · Color azul · Acabado mate · Cantidad 12"), el badge se expande y empuja la columna. Sin `max-w-[Xch] truncate`, rompe el grid de la tabla. La tabla no es `table-fixed` así que reflowea cada columna.

### P1-8 — `ProductCouponsWidget` empty state: layout colapsa en mobile angosto
**Archivo:** `product-coupons-widget.tsx` líneas 75-97
**Problema:** El bloque empty tiene `flex items-center justify-between gap-3` SIN `flex-wrap`. A la izquierda: icono + dos `<p>`. A la derecha: link "Crear cupón". En mobile angosto los dos `<p>` ("Sin promociones activas para este producto" + "Crea un cupón desde Promociones...") pueden quedar muy comprimidos contra el botón. Sin `min-w-0` en el lado izquierdo, las descripciones no se cortan limpiamente.

### P1-9 — Stock panel "Sin variantes": link va a sub-ruta legacy
**Archivo:** `product-stock-panel.tsx` línea 72
**Problema:** Mismo bug que P0-4 pero en branch de error. `href={\`/admin/productos/${productId}/variants\`}` apunta a la sub-ruta que ahora es `?section=versiones`.

### P1-10 — Header del producto: subtitle se rompe sin wrap controlado
**Archivo:** `page.tsx` líneas 95-102
**Problema:** El subtitle tiene Código + URL + emoji + N unidades, todo separado por " · ". Para un producto con slug largo (`/productos/cuadros-magneticos-personalizables-premium`) en una pantalla angosta no hay wrap controlado: el JSX usa fragmento con `code` inline. Depende del CSS del `AdminPageHeader` aplicar wrap, pero los `<code>` con `font-mono` suelen romper de forma fea. Si el header no aplica `flex-wrap` o `break-words` en el subtitle, queda truncado o desbordado.

## Findings P2

### P2-1 — `ProductSectionNav`: nav tiene `-mt-2` negativo que puede colisionar con padding del padre
**Archivo:** `product-section-nav.tsx` línea 36
**Problema:** `-mt-2 mb-6` — un margen negativo superior asume que el padre `AdminPageBody` tiene padding-top exacto. Si el padding cambia o se renderiza con un notice arriba (`justCreated`), el `-mt-2` puede comerse el espacio del notice. Frágil acoplamiento.

### P2-2 — `ProductReviewsPanel`: emojis hardcoded en strings no localizados
**Archivo:** `product-reviews-panel.tsx` línea 134, líneas 252-253
**Problema:** "Sin reseñas pendientes ✨" y "📷 N fotos" tienen emojis directos en el JSX. Inconsistente con el resto del admin que usa lucide icons. Riesgo de inconsistencia visual entre browsers (Windows + macOS + Android renderean estos emojis muy distintos).

### P2-3 — `ProductCouponsWidget` `aria-label`s faltan en los `<Link>` decorativos
**Archivo:** `product-coupons-widget.tsx` líneas 88-94, 108-114
**Problema:** Links "Crear cupón", "Editar promociones", "Ver todas en el moderador →" usan icon + label visible. Bien para sighted, pero el icono se podría marcar `aria-hidden` para evitar lectura doble del lector de pantalla. Detalle de accesibilidad.

### P2-4 — `ProductVariantsPanel` tabla: scroll horizontal en mobile sin envoltorio
**Archivo:** `product-variants-panel.tsx` líneas 102-222
**Problema:** La tabla tiene 7 columnas. Depende de `AdminTable` aplicar overflow. Si `AdminTable` no envuelve en `overflow-x-auto`, los anchos fijos `px-4 py-3` rompen el viewport mobile. No verificado el componente AdminTable. Riesgo conocido.

### P2-5 — `ProductReviewsPanel` ReviewCard: `flex-wrap items-start justify-between` en header crea jerarquía rota cuando wrap
**Archivo:** `product-reviews-panel.tsx` línea 236
**Problema:** Cuando hace wrap, los botones de acción caen DEBAJO del comentario completo en lugar de quedar a la derecha del nombre. UX OK pero no obvio que es intencional. Sugiero usar grid `md:grid-cols-[1fr_auto]` para control explícito del breakpoint.

### P2-6 — `ProductVariantsPanel` editing row uses `bg-brand-purple/[0.03]` muy sutil
**Archivo:** `product-variants-panel.tsx` línea 125
**Problema:** Cuando el user hace clic en "Editar" en una fila, la fila se transforma a edición pero el highlight `bg-brand-purple/[0.03]` es casi imperceptible. La fila ocupa todo el ancho (colSpan=7) pero falta señal visual fuerte de "estás en modo edición". Considerar un border-left más fuerte o un `bg-brand-purple/8`.

### P2-7 — `ProductReviewsPanel` SubTab badge cuando count=0 muestra `0` sobre fondo púrpura
**Archivo:** `product-reviews-panel.tsx` línea 196
**Problema:** El badge se renderea SIEMPRE (`<span>{count}</span>`), incluso con count=0. Visualmente esto pinta un `0` apagado al lado de "Aprobadas" o "Archivadas" si Lucy aún no tiene de esas. Comparado con `ProductSectionNav` (líneas 47-48, 53) que SOLO renderea badge si count > 0. Inconsistencia.

### P2-8 — `ProductStockPanel` modo múltiple: alertas globales son `<p>` con texto largo sin truncar
**Archivo:** `product-stock-panel.tsx` líneas 110-121
**Problema:** Los notices "🔴 N variantes agotadas..." y "🟡 N variantes con stock bajo..." son `<p>` simples. OK para texto corto, pero si Lucy tiene MUCHAS variantes (set polaroid con 12 versiones), el contador puede hacer que el texto sea más largo. Aceptable, sólo polish.

## Aprobado: NO

Hay 5 hallazgos P0, principalmente el bug de archivar reseña que NO aparece en pestaña Pendientes (P0-1), el link "Restaurar" con productId equivocado (P0-3), y dos links a la sub-ruta `/variants` legacy ya migrada a `?section=versiones` (P0-4 y P1-9). El editor de stock del modo simple también tiene riesgo de colapso en mobile angosto (P0-5).

Archivos con bugs P0:
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/product-reviews-panel.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/product-stock-panel.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/product-stock-editor.tsx`