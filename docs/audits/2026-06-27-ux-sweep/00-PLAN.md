Confirmed: the variant actions DO multiply ×100 (`Math.round(Number(priceStr) * 100)`). So Frente 2's flagged "possible critical bug 2b" is NOT a bug — the round-trip is correct (input pesos → ×100 store, /100 read). I'll mark that in the plan as verified-OK so the dev doesn't chase a ghost. Now I have everything. Producing the consolidated plan.

# Plan UX/UI integral del admin — feedback de Lucy + barrido (2026-06-27)

## Resumen para Lucy (llano)

Lucy, recorrí TODO el panel y la tienda, no solo lo que marcaste. Buenas noticias primero: **dos de tus tres molestias grandes ya están casi resueltas en el código** — la regla del "cursor manito" ya existe (solo falta guardarla en un commit) y el botón con ruedita giratoria ya está construido (solo falta usarlo en más sitios). De tus comentarios, lo que reportaste son **mayormente bugs reales y confirmados**: el formulario de editar una opción aparece encajado dentro de la tabla con los títulos de columna flotando encima (bug feo, arreglo rápido), y varios textos en "voseo" ("Probá", "Diseñá") que rompen el tuteo colombiano. El **único tema que necesita tu decisión y es delicado** es el "precio tachado" de promoción: hoy vive a nivel producto pero el precio real vive en cada opción, así que en la tienda el descuento puede mostrarse mal — arreglarlo bien implica un cambio en la base de datos (te lo explico abajo en lenguaje claro).

Los 3 fixes globales de mayor impacto, que van primero porque tocan todo el panel: **(1)** guardar la regla del cursor, **(2)** poner la ruedita de "guardando…" en todos los botones que hoy no dan señal, **(3)** sacar el formulario de editar opción fuera de la tabla.

---

## Sus comentarios, aterrizados

| Comentario de Lucy (sus palabras) | Veredicto (confirmado en código) | Tipo | Fix concreto | Esf. |
|---|---|---|---|---|
| "El cursor no es manito en los clicables" | ✅ Ya resuelto en `globals.css:191-209` **pero sin commitear** (está en working tree, no en HEAD) | 🐛→✅ | Commitear la regla. Cubre admin + tienda completa | S |
| "Quiero ruedita giratoria al guardar" | Confirmado: `SubmitButton` ya existe (`components/admin/submit-button.tsx`) pero solo se usa en 1-2 sitios; ~60 botones submit sin feedback | 🐛 | Propagar `<SubmitButton>` a los forms; agregar `Loader2` a los 5 forms que ya cambian texto pero sin spinner | M |
| "El form de editar una opción se ve como un error de UI" | Confirmado: `product-variants-panel.tsx:115-174` inyecta el form como `<tr colSpan=7>` debajo del `<thead>` visible, intercalado entre filas | 🐛 | Ocultar la tabla al editar; mostrar solo el form en `<AdminCard>` full-width | S |
| "El precio que se pide debe ser en pesos, no centavos" | ✅ Verificado OK: `variant-form.tsx:77` lee `/100`, `variants/actions.ts:83,140` guarda `×100`. **El round-trip es correcto, NO hay bug de conversión** | ✅ | Solo falta el afford. visual: prefijo `$` + formato de miles (como el `PriceField` del producto) | S |
| "Los 7 'atributos diferenciadores' son crípticos" | Confirmado: `variant-form.tsx:96-165`. Solo 4 (`quantity/photoSlots/sizeCm/color`) alimentan lo que el cliente ve; `shape/finish/aspectRatio` no se ven y `cornerRadiusPx` es campo muerto | ✨ | Renombrar a "¿En qué se diferencia esta opción?", 4 campos visibles + preview en vivo del label, resto en "Ajustes avanzados" plegado | M |
| "El precio tachado debería ir junto al precio normal" | Confirmado bug de modelo: precio normal por opción (`ProductVariant.price`), tachado por producto (`Product.compareAtPrice`). En PDP `producto/[slug]/page.tsx:102,199` el tachado puede dar descuento negativo | 🐛+🤔 | Mover `compareAtPrice` a la opción → **requiere migración + ADR + tu aprobación** | L |
| "Quiero ordenar el listado por más columnas" | Confirmado limitado: `productos/page.tsx:61` solo acepta `name/price`; `service.ts:67` solo mapea esos | ✨ | Agregar Código y Categoría ordenables (Estado mejor por filtro) | S |
| "Quiero ir más lejos en la paginación" | Confirmado: `productos/page.tsx:324` solo prev/next | ✨ | Botones Primera/Última + input "ir a página N" | M |

---

## Fixes globales (aplican a todo el panel) — van PRIMERO

Estos tocan todo, así que se hacen antes que los módulos para no repetir trabajo.

### G1 — Cursor manito (🐛→✅ casi listo · S)
La regla ya está en `apps/web/app/globals.css:191-209`, dentro de `@layer base` (correcto, no le gana a las utilities). **Solo falta commitearla.** Verificado: NO está en HEAD, está en working tree. Cubre `button`, `[role=button]`, `a[href]`, `label[for]`, `summary`, `select`, y `not-allowed` en disabled. No escribir nada nuevo.
- Commit sugerido: `fix(ui): cursor pointer global en clicables (Lucy 2026-06-27)`.

### G2 — Ruedita de "guardando…" centralizada (🐛 · M)
El primitive `SubmitButton` (`components/admin/submit-button.tsx`) ya hace spinner + disabled automático con `useFormStatus`. Plan:
1. **Mover** `submit-button.tsx` de `components/admin/` a `components/ui/` (lo usarán admin Y tienda).
2. **Agregar al `<Button>` base** (`components/ui/button.tsx`): prop `loading` (spinner `Loader2` + disabled + sin layout-shift) y variantes brand (`brand`/`brand-outline`/`brand-danger`/`brand-ghost`) — hoy 17 archivos copian `bg-gradient-brand` a mano. Reescribir `SubmitButton` como wrapper fino de `<Button loading={pending}>`.
3. **Unificar `danger`**: shadcn usa rojo pastel (`button.tsx:19`), AdminButton/SubmitButton usan rojo sólido. Quedarse con el **sólido** (más claro para acción destructiva).
4. **Propagar** a los ~60 submits sin feedback, priorizando los que Lucy más usa.
5. **`ConfirmAction`** (`components/admin/confirm-action.tsx`): darle soporte interno de `SubmitButton` → cubre ~8 páginas destructivas de un golpe.
6. Quick wins inmediatos: `ProductQuickActions` (`quick-actions.tsx`, aparece en cada fila) y los 5 forms que ya cambian texto pero les falta `Loader2` (cupones, ocasiones×2, usuarios, redirects).

### G3 — Tuteo (eliminar voseo) (🐛 · S)
Viola el mandato durable es-CO. Reemplazo dirigido de strings (sin lógica) en **~18 strings** de admin + storefront: "Probá"→"Prueba", "Diseñá"→"Diseña", "Elegí"→"Elige", "Contanos"→"Cuéntanos", "querés/completá/seleccioná", etc. (lista exacta con file:line en frentes 4 y 6). Recomiendo además un grep de regresión en CI con patrón de conjugaciones voseo.

### G4 — Sacar jerga de dev de la UI (🐛 · S)
Quitar comandos de terminal y rutas internas del copy visible: `make seed-products` (`productos/page.tsx:216`), `make seed-ocasiones` (`ocasiones/page.tsx:198`), bloque `lib/product-redirects.ts` (`redirects/page.tsx:121`), `/api/coupons/public` (`cupones`). Lucy nunca corre eso.

### G5 — Accesibilidad rápida del primitive (🐛 · S)
`focus-visible` en `AdminButton` (no tiene anillo de foco — `admin-page.tsx:496`); `aria-label` en botones icon-only (variant-images, product-images, flechas reorden); subir contraste de descripciones `/55`→`/70` (`admin-page.tsx:453`).

---

## Plan por módulo (empezando por PRODUCTOS, como pidió Lucy)

Agrupado en commits lógicos, en orden de ejecución.

### Commit 1 — Globales (G1+G3+G4)
Cursor commiteado, voseo→tuteo, jerga dev fuera. Barato, toca todo, base para el resto.

### Commit 2 — PRODUCTOS · ordenar + paginar
`apps/web/features/products/service.ts` + `apps/web/app/admin/(panel)/productos/page.tsx`
- **Ordenar por Código y Categoría**: ampliar el tipo y el switch del `orderBy` en `service.ts:67` (`sku-asc/desc`, `category-asc/desc` vía `{ category: { name } }`); ampliar el whitelist en `page.tsx:61` (hoy descarta silenciosamente cualquier sort nuevo); poner `<SortableHeader>` en los `<th>` de Código y Categoría; agregar esas opciones al dropdown mobile. **Estado NO ordenable** (el filtro ya lo cubre mejor).
- **Paginación**: botones Primera/Última (reusar `PaginationLink`) + input "ir a página N" (form GET con `q/status/sort` como hidden inputs) + `<nav aria-label>` + `aria-current`.
- **Bug clamp**: `page.tsx:55` no limita `page` por arriba → `?page=999` muestra tabla vacía con empty state engañoso. Clampear a `[1, totalPages]`. **Imprescindible** si se agrega el input de salto.

### Commit 3 — OPCIONES · form de edición + atributos + precio
`components/admin/product-variants-panel.tsx` + `…/variants/variant-form.tsx`
- **Form fuera de la tabla** (el bug que reportó Lucy): cuando `editingId`/`newOpen`, no renderizar la tabla; mostrar solo el form en `<AdminCard>` full-width. Borrar el `<tr colSpan=7>` (líneas 136-175).
- **Precio en pesos**: agregar prefijo `$` + formato de miles. Ideal: extraer el `PriceField` de `product-form.tsx:747` a un primitive compartido y usarlo en ambos. (Conversión ya verificada correcta, no es bug.)
- **Reframe atributos**: "¿En qué se diferencia esta opción?" → 4 campos visibles (cantidad de fotos, cuántas vienen, tamaño, color) + preview en vivo del label (`generateVariantLabel` ya existe) + "Ajustes avanzados" plegado para shape/finish/aspectRatio. (Sujeto a Decisión D2.)

### Commit 4 — OPCIONES · precio tachado por opción (SOLO con aprobación de Lucy — ver Decisión D1)
Schema + migración + backfill + PDP + 2 cards + filtro listado + ADR. Es el único bloque que toca la base de datos y la tienda pública.

### Commit 5 — Loading transversal (G2)
Mover `SubmitButton` a `components/ui/`, mejorar `<Button>` base (loading + variantes brand + danger unificado), `ConfirmAction` con SubmitButton interno, propagar a forms + `ProductQuickActions` + storefront ("Añadir al carrito" en `producto/[slug]/page.tsx:231`, controles del carrito qty/quitar).

### Commit 6 — Resto de módulos (consistencia + copy)
- **Cupones**: columna Tipo muestra enum crudo `PERCENT/FIXED/FREE_SHIPPING` (`cupones/page.tsx:264`) → diccionario español ("Porcentaje"/"Monto fijo"/"Envío gratis"). 🐛 alto impacto.
- **Finanzas**: bug de pluralización + voseo en notice de reembolsos (`finanzas/page.tsx:127-136`, "Revisalo{s}" sale roto) → reescribir frase. Quitar códigos de roadmap "Fase 2 + Q.6" (`:150`).
- **Roles unificados**: sidebar (`admin-shell.tsx:53`) y usuarios (`usuarios/page.tsx:63`) usan diccionarios distintos y contradictorios → un único diccionario en `lib/` con labels en español llano.
- **SortableHeader a pedidos y clientes** (los más operativos sin él) — consistencia con productos/inventario.
- **Reseñas**: dar chrome (borde) a los botones de acción que hoy son texto plano (`resenas/page.tsx:362`).
- **Columnas técnicas a tooltip**: Slug (categorias, ocasiones), Clave/Identificador (email-templates, bloques) → el nombre/propósito ya basta.
- **Dashboard**: "Sub-categorías" no es KPI de negocio (`:210`) → cambiar por "Pedidos del mes"; dos QuickLinks a la misma config (`:251`,`:272`) → dejar una.
- **Inventario**: "↳ misma familia" (`:244`) → nombre del producto atenuado.
- **Ocasiones**: "2 / 5 / 10" sin explicar (`:233`) → "min 2 · ideal 5 · máx 10".

### Commit 7 (decisión de producto) — módulos técnicos
Auditoría (`auditoria/page.tsx`: jerga total, JSON crudo), Redirects e Integraciones son casi inusables para no-técnica → rol-gate a superadmin o colapsar detalle técnico. Ver Decisión D4.

---

## Decisiones que necesito de Lucy

**D1 — Precio tachado: ¿migración para arreglarlo bien? (recomiendo SÍ)**
Hoy el "precio antes/promoción" está guardado en el producto, pero el precio real está en cada opción. Por eso en la tienda el descuento puede salir mal (ej. mostrar tachado $50.000 cuando la opción cuesta $60.000 → descuento negativo). Para arreglarlo de verdad hay que mover el "precio tachado" a cada opción. Eso es un cambio en la base de datos (migración) + copiar las promos actuales a la opción más barata para no perderlas + ADR documentado.
- **Opción A (recomendada):** hacer la migración. El bug ya está en producción; lo correcto es cerrarlo.
- **Opción B:** dejarlo como está por ahora (asumiendo que el descuento puede verse mal en algunos casos).
- Necesito tu OK explícito porque toca DB + tienda pública.

**D2 — Atributos de opción: ¿auto-generar el nombre y eliminar campos sin uso?**
- ¿El "nombre de la opción" debe ser libre (marketing, ej. "Set premium") o derivarse de los campos (ej. "12 fotos · 7×9 cm")? Recomiendo: nombre libre, con el label técnico como sugerencia debajo.
- ¿Usás `shape`/`finish`/`aspectRatio` alguna vez (que una opción cambie de forma/acabado respecto al producto)? Si nunca, los elimino del form (quedan en el schema para el futuro, sin estorbar). Recomiendo eliminarlos del form.

**D3 — Columnas ordenables en productos:** confirmo Código + Categoría sí, Estado no (lo cubre el filtro). ¿De acuerdo? (es la recomendación, esfuerzo S).

**D4 — Módulos técnicos (Auditoría, Redirects, Integraciones):** ¿los ocultamos de tu menú (solo visibles para superadmin) o los dejamos pero con el detalle técnico colapsado? Recomiendo ocultarlos de tu vista diaria — no son cosas que operes tú.

---

## Certificación

Al cerrar cada commit, el dev verifica así (Lucy mira localhost:4000 — confirmar antes si mira preview o producción):

1. **Build + typecheck limpios** (`pnpm build` / typecheck) — sin errores TS. Tras cualquier cambio de schema: `prisma generate` + `make restart` (sin esto el dev server sirve el client viejo).
2. **Smoke navegador por módulo:**
   - **Cursor (G1):** pasar el mouse por botones/links/encabezados ordenables en cualquier página admin → manito; disabled → prohibido.
   - **Loading (G2):** en `/admin/productos` con throttling de red (DevTools), clic en guardar/toggle/archivar → ruedita + botón deshabilitado, sin doble-submit. Igual en "Añadir al carrito" en `/producto/<slug>`.
   - **Productos (Commit 2):** clic en encabezados Código y Categoría → flecha alterna asc/desc y preserva `?q=` y `?status=`; input "ir a página" con 999 → no rompe (clamp); en mobile <640px el dropdown "Ordenar por" tiene las nuevas opciones.
   - **Opciones (Commit 3):** abrir `…/productos/<id>?section=opciones&edit=<id>` → la tabla desaparece, se ve solo el form "Editando: X", Cancelar vuelve al listado; precio muestra `$` y miles; preview del label se actualiza al tipear.
   - **Precio tachado (Commit 4, si se aprueba):** en la tienda, elegir distintas opciones → el tachado corresponde SIEMPRE a la opción elegida y nunca da descuento negativo; cards de listado muestran el descuento de la opción "desde".
   - **Tuteo (G3):** recorrer empty states de cada módulo + checkout completo → cero voseo. Grep de regresión en CI.
   - **Cupones/Finanzas/Roles (Commit 6):** columna Tipo en español; notice de reembolsos sin "Revisalo{s}" roto; mismo rol se llama igual en sidebar y en usuarios.
3. **Accesibilidad (G5):** navegar con Tab → anillo de foco visible en todos los botones; lector de pantalla anuncia los botones icon-only.

Archivos pendientes de verificar por el dev antes de tocar: ninguno crítico — las dos dudas abiertas (conversión de precio de opción y estado del commit de cursor) **ya las verifiqué**: conversión ×100 correcta (`variants/actions.ts:83,140`), cursor uncommitted (no está en HEAD).