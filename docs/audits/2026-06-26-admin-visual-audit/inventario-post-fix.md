I have enough context. Now I'll produce the static audit.

# Audit /admin/inventario (post-fix)

## Findings P0 (bugs visibles)

### P0-1 — `AdminCard` envuelve `AdminTable` y duplica el borde + esquinas redondeadas
En `page.tsx:136`:
```tsx
<AdminCard className="overflow-hidden p-0">
  <AdminTable>...</AdminTable>
</AdminCard>
```
`AdminCard` ya aplica `border-brand-purple/10 rounded-xl border bg-white shadow-sm` (admin-page.tsx:145). `AdminTable` aplica **exactamente lo mismo** otra vez (`border-brand-purple/10 overflow-x-auto rounded-xl border bg-white shadow-sm`, línea 166). Hay un borde redondeado dentro de otro borde redondeado con la misma sombra, lo que produce un doble outline visible (especialmente notable porque `AdminCard` tiene `overflow-hidden` que recorta las esquinas del child a un radio que no coincide perfectamente — el `rounded-xl` interno cae dentro del `rounded-xl` externo).

Solución sugerida (no aplico): usar solo `AdminTable` (ya es una tarjeta con scroll) y eliminar el `AdminCard` wrapper, o quitar el styling redundante.

### P0-2 — Header de la columna "Stock" usa `text-right` pero `AdminTableHead` aplica `tracking-wider uppercase` global que pelea con el inline
`AdminTableHead` ya impone `text-brand-purple-dark/70 text-xs tracking-wider uppercase` (admin-page.tsx:175). En `page.tsx:139` el `<tr>` también declara `text-brand-purple-dark text-xs uppercase` — el color del head queda sobrescrito a `text-brand-purple-dark` sólido (sin opacidad), inconsistente con el resto del admin que usa `/70`. **Resultado:** el header del inventario se ve más oscuro/agresivo que cualquier otra tabla del admin.

### P0-3 — Columna "Ajustar": header alineado a la derecha pero el contenido del editor también va a `items-end`, OK… pero el `p-3` de la celda + el `gap-1.5` interno + input `w-20` + botón `w-9` no respeta el ancho que dice el brief (~120-160px)
`CompactStockEditor` mide aproximadamente: `w-20 (80px) + gap-1.5 (6px) + w-9 (36px) = 122px` para el cluster, + padding de celda `px-4 py-3` (32px horizontales) = **~154px de ancho mínimo de columna**. Esto encaja dentro del rango anunciado, **pero el `min-w-[640px]` de la tabla** (admin-page.tsx:168) reparte los 6 columnas de manera flex/auto. Con 6 columnas y `min-w-[640px]`, cada columna tiene ~107px promedio si no hay contenido más largo. En desktop normal (>1024px) el espacio sobra; en breakpoint angosto (640–800px) la columna "Producto" se va a comer el espacio por el nombre largo y "Ajustar" puede quedar más estrecha de lo deseado, **forzando que el botón Save quede pegadísimo al input sin respiración o que aparezca scroll horizontal** ya que pasa el `min-w`.

### P0-4 — Hint delta (`+5`, `-3`) bajo el editor cambia el alto de la fila → "salto" visual al editar
`page.tsx:48` el form es `flex flex-col items-end gap-1`, con el hint apareciendo **solo cuando hay cambio**. Cuando Lucy escribe un número distinto, la celda crece ~14px de alto (tamaño del `<p text-[10px]>`), empujando toda la fila hacia abajo y desalineando visualmente el resto de las columnas de esa fila (StatusChip, stock number, etc. quedan flotando a media altura). Es jarring si la tabla tiene muchas filas y el usuario hace ajuste en una del medio.

### P0-5 — Badge "Pausado" inline después del nombre del producto puede colapsar con `ExternalLink` o saltar a línea sola
`page.tsx:152-169`: el link al producto contiene nombre + icono externalLink **dentro del mismo `inline-flex`**, y luego viene `<span className="ml-2 inline-block …">Pausado</span>` **fuera** del link. Si el nombre del producto es largo (ej. "Set imanes hexagonales con frase personalizada — pack 12"), el `inline-flex` del link se va a wrap (porque es inline-flex sin nowrap), y el badge "Pausado" queda en su propia línea con `ml-2` colgando — no se solapa físicamente pero produce layout descuajado. **Falta `whitespace-nowrap` o `flex-wrap` controlado**.

## Findings P1 (mejorables)

### P1-1 — Botón "Aplicar filtros" tiene texto + estado disabled implícito ambiguo
`page.tsx:415-430`: el contenedor `flex items-end gap-2 sm:col-span-2 lg:col-span-5` mete el botón "Aplicar filtros" + link "Limpiar" en su propia fila full-width abajo del grid. Cuando los filtros se aplican via GET y el usuario cambia un dropdown sin clickear "Aplicar", **no hay indicador visual de cambios pendientes** (los dropdowns muestran el nuevo valor pero la URL no refleja). Lucy podría pensar que ya aplicó.

### P1-2 — Filtros bar: `lg:grid-cols-5` con `lg:col-span-2` en búsqueda = ratio 1+1+2+1=5 columnas
OK matemáticamente, pero el `select` de "Categoría" puede tener nombres largos ("Imanes personalizados grandes") que se trunquen sin ellipsis porque los `<select>` nativos no manejan `truncate`. El `<select>` se cortará silenciosamente con `…` del browser o se desbordará. **Falta `max-width` con browser-controlled ellipsis no garantizada cross-browser.**

### P1-3 — Touch target del input `w-20` (80px) en mobile es estrecho
`CompactStockEditor` input `h-9 w-20` = 36×80px. Altura 36px está por debajo del estándar 44px de touch target WCAG. En desktop no es problema (click con mouse), pero si Lucy edita desde celular/tablet (la admin es responsive según el brief), tocar el input requiere precisión. Mismo problema con el botón `h-9 w-9` (36×36px).

### P1-4 — KPI tiles con `href` cuando `out=0` ya quita el link, pero el `tone="muted"` mantiene `hover:brightness-95` igual
`page.tsx:273`: `${href ? "hover:brightness-95" : ""}` — OK, lógica correcta. Pero el `cursor` no cambia: cuando `out > 0`, el tile completo es clickable, pero **el cursor sigue siendo default** porque el `<Link>` solo envuelve el contenido, no fuerza `cursor-pointer` en el div interno. Usuario podría no darse cuenta de que es clickable.

### P1-5 — Paginación "← Anterior" y "Siguiente →" solo aparecen condicionalmente
`page.tsx:464-481`: si el usuario está en página 5 de 10, ambos botones aparecen. Pero **no hay indicador de "página intermedia"** ni saltos a primera/última. Para un admin que filtra "agotadas" y obtiene 200 versiones, saltar a página 4 directo no es posible — debe hacer clic Siguiente 3 veces.

### P1-6 — Empty state usa `AdminEmpty` con `icon={<Boxes className="h-5 w-5" />}`
Coherente, pero el copy varía según filtro. Bien. **Pero no hay CTA** para limpiar filtros desde el empty state (ej. cuando dice "Quita los filtros para ver todo el inventario", no hay botón "Limpiar filtros"). Lucy tiene que hacer scroll arriba a la barra de filtros.

## Findings P2 (polish)

### P2-1 — `tabular-nums` aplicado en stock (col 5), input (CompactStockEditor) y delta hint, pero NO en KPI tiles (`text-3xl font-bold tabular-nums leading-none` SÍ está). OK consistente.

### P2-2 — `getStockEmoji()` y `getStockLabel()` se importan pero el `<StatusChip>` los renderiza siempre — si el helper devuelve string vacío, el chip queda con padding fantasma.
No verifiqué el helper, pero asumiendo que siempre devuelve algo, OK.

### P2-3 — Breadcrumb `{ label: "Catálogo" }` sin `href`
Convención dispar: si "Admin" tiene href y "Inventario" (current) no, "Catálogo" sin href en el medio queda como "section header" sin acción. ¿Es deliberado? Otros breadcrumbs del admin pueden manejarlo diferente.

### P2-4 — `text-[10px]` y `text-[11px]` son hardcoded fuera del escalón de Tailwind
Aparecen en `page.tsx:164` (`text-[10px]` del badge Pausado), línea 170 (`text-[11px]` del categoría), y `compact-stock-editor.tsx:89, 99` (hint y error a `text-[10px]`). El design system del admin debería estandarizar `text-xs` (12px) como mínimo legible; tipografías <12px son borderline ilegibles según WCAG AA para texto no decorativo.

### P2-5 — `aria-label="Abrir producto"` en el `ExternalLink` icon es semánticamente raro
El icono está **dentro** del `<Link>` que ya tiene texto. El `aria-label` en el ícono lo lee dos veces el screen reader: nombre del producto + "Abrir producto". Debería ser `aria-hidden="true"` para que el link entero solo anuncie el nombre.

### P2-6 — Toast/feedback de éxito ausente intencionalmente
El comentario dice "éxito = revalidatePath refresca el value mostrado en la columna stock = self-evident". Razonable, **pero** si el `revalidatePath` falla silenciosamente o el caché del browser no se invalida instantáneamente, el usuario no sabe si guardó. Sin pulso visual (un flash verde por 1s, por ejemplo), el botón Save vuelve a estar disabled (porque ya no hay cambio) y eso es la única señal.

### P2-7 — Form GET de filtros no tiene `<label htmlFor>` apareados
Los `<label>` envuelven el `<span>` + `<select>`, lo que es válido HTML (implicit association), pero algunos lectores de pantalla viejos no lo manejan bien. Más portable usar `<label htmlFor="filter-estado">` + `id="filter-estado"` en el select.

### P2-8 — Botón Save en `CompactStockEditor` usa `bg-brand-purple` mientras que el botón "Aplicar filtros" usa la misma clase
Coherente con design system, pero el botón Save es 36×36px (icon-only) y "Aplicar filtros" es `h-10 px-4` (40×~110px). Dos tamaños distintos de "primary action" en la misma página podría confundir jerarquía visual.

## Aprobado para producción: NO

**Razones bloqueantes (P0):**
- P0-1: doble borde redondeado por wrapping innecesario de `AdminCard` sobre `AdminTable` — visible inmediatamente al cargar la página.
- P0-4: salto de altura de fila al editar stock — UX rota cada vez que Lucy ajuste inventario (que es el caso de uso PRINCIPAL de esta página).
- P0-5: badge "Pausado" puede caer en línea separada con nombres largos — Lucy reportó EXACTAMENTE este tipo de bug visual en el original.

Los P0-2 y P0-3 son menos urgentes pero merecen corrección antes del merge.

**Archivos auditados:**
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/inventario/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin/compact-stock-editor.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-page.tsx` (primitives, referencia)