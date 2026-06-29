I have full coverage of every admin module. Here is my analysis.

# Frente 4 — Barrido de módulos admin

Recorrí los **20 módulos** reales bajo `apps/web/app/admin/(panel)/` (más que los 11 listados en el brief): dashboard, productos, inventario, categorias, cupones, pedidos, resenas, ocasiones, clientes, usuarios, redirects, finanzas, integraciones, email-templates, contenido (bloques + configuracion), auditoria, y el catch-all `[...placeholder]`. Abajo, por módulo, los hallazgos de **claridad / copy / flujo / consistencia** que de verdad frenan a una vendedora no-técnica. (No repito el barrido de cursor/loading — eso es Frente 3.)

---

## 🔴 Hallazgos transversales (afectan varios módulos)

### T1 — 🐛 Voseo regado por todo el admin (viola mandato tuteo es-CO)
`feedback_es_co_tuteo_no_voseo.md` es mandato durable y hay **voseo en 8 archivos**. La mayoría son empty states con `"Probá quitar algún filtro"`:
- `categorias/page.tsx:229`, `ocasiones/page.tsx:197`, `clientes/page.tsx:169`, `usuarios/page.tsx:284`, `redirects/page.tsx:232-233`, `pedidos/page.tsx:248`, `resenas/page.tsx:266` → `"Probá"` debe ser **"Prueba"**; `"Usá"` → **"Usa"**.
- `redirects/page.tsx:113` `"Si renombrás una URL"` → **"Si renombras"**.
- `finanzas/page.tsx:130` `"Revisalo"` → **"Revísalo"**; `:92` y `[...placeholder]:58` `"avísame"` (1ª persona, choca con tono institucional — preferible **"escríbele a soporte"** o quitar).
- `contenido/bloques/nuevo/create-block-form.tsx:173` `"Usá los botones"` → **"Usa"**.
- `integraciones/page.tsx:415` `"apuntá a"` → **"apunta a"**.
- `productos/stock-actions.ts:127` `"Probá de nuevo"` → **"Prueba de nuevo"**.

**Fix:** reemplazo global de las formas voseo por tuteo. La inconsistencia es notoria porque *otros* mensajes en los mismos archivos ya están en tuteo ("Crea el primero", "Prueba con otro término"). **Esfuerzo: S.**

### T2 — 🐛 Jerga de desarrollador filtrada a la UI de Lucy
Comandos de terminal y rutas internas que Lucy nunca va a ejecutar, presentados como si fueran instrucciones para ella:
- `productos/page.tsx:216` → `"usa make seed-products para poblar el catálogo demo"`.
- `ocasiones/page.tsx:198` → `"Corre make seed-ocasiones para poblar las 15 ocasiones base"`.
- `redirects/page.tsx:121-124` → bloque entero sobre `lib/product-redirects.ts` y `make consolidate-product-families`.
- `cupones/page.tsx:112` y `create-coupon-form.tsx:193` → `"consumidos por /api/coupons/public"`.

**Fix:** quitar estos comandos del copy visible (o moverlos a un comentario de código). El empty state de productos debería decir solo "Crea tu primer producto" sin el `make seed`. **Esfuerzo: S.**

### T3 — ✨ Inconsistencia de orden por columna (SortableHeader) entre módulos
D6 introdujo `SortableHeader` (clic en encabezado en desktop, dropdown solo mobile) y se aplicó a **productos, inventario, categorias, cupones**. Pero **pedidos, clientes, usuarios, resenas, redirects** siguen con el dropdown "Ordenar" *siempre visible en desktop*. Para Lucy es una inconsistencia confusa: en unas tablas ordena clicando la columna, en otras no.

**Fix:** extender `SortableHeader` a las 5 tablas restantes (al menos pedidos y clientes, que son las que más usa). `pedidos/page.tsx:203-220`, `clientes/page.tsx:124-141`. **Esfuerzo: M.**

### T4 — 🐛 Etiquetas de rol contradictorias entre sidebar y módulo de usuarios
`admin-shell.tsx:53-58` mapea roles `SUPERADMIN/ADMIN/EDITOR/OPERATOR` → "Administradora/Editor/Gestor", pero `usuarios/page.tsx:63-67` usa otro set: `SUPERADMIN/MANAGER/FULFILLMENT` → "Superadmin/Manager/Fulfillment". Los nombres de roles **no coinciden** (`EDITOR/OPERATOR` vs `MANAGER/FULFILLMENT`) y el de usuarios usa términos en inglés ("Manager", "Fulfillment") que el otro evita. Lucy ve "Administradora" en el footer pero "Superadmin" en la tabla de usuarios para la misma persona.

**Fix:** unificar a un único diccionario de roles + labels en español llano ("Dueña/Admin total", "Gestora", "Despachos"). Centralizar en `lib/`. **Esfuerzo: S.**

---

## Dashboard (`dashboard/page.tsx`)

- **✨ D1 — "Sub-categorías" como KPI de negocio es raro.** `:210` muestra "Sub-categorías" junto a Clientes/Productos/Cupones. Para una vendedora, el número de sub-categorías no es un KPI de "Estado del negocio"; es metadato de catálogo. **Fix:** reemplazar por algo accionable (ej. "Pedidos del mes" o "Reseñas aprobadas") y dejar el conteo de categorías dentro del módulo de categorías. Esfuerzo: S.
- **🤔 D2 — Dos QuickLinks a "Configuración".** `:251` ("Configuración general" → `/admin/contenido/configuracion`) y `:272` ("Ajustes del sitio" → la **misma** ruta). Dos cards distintas que van al mismo lugar con descripciones distintas confunde. **Fix:** dejar una sola, o que "Ajustes del sitio" apunte a otra cosa. Esfuerzo: S.
- **✨ D3 — El nombre derivado del email puede salir feo.** `deriveAdminDisplayName` (`:297`) convierte `crittan01` → "Crittan". Funciona, pero es frágil; el propio comentario admite que es backlog. Bajo impacto, ya está flagged en código.

## Productos (`productos/page.tsx`)

- **🐛 P1 — `make seed-products` en empty state** (`:216`) → ver **T2**.
- **✨ P2 — Filtro "Estado" mezcla 5 conceptos en un dropdown denso.** `:159-163` "Todos (activos + inactivos + archivados)", "Solo inactivos (ocultos pero recuperables)"… Los paréntesis explicativos son buenos, pero 5 opciones con texto largo en un `<select>` angosto (`sm:col-span-3`) se truncan. **Fix:** considerar chips/tabs de estado por encima de la tabla en vez de dropdown. Esfuerzo: M.
- **✨ P3 — "Código" = SKU en mono.** `:243` y `:278` el header dice "Código" (bien) pero el valor es el SKU en `font-mono`, que para Lucy parece técnico. Aceptable, pero si el SKU es autogenerado quizá no aporta a la vendedora. Esfuerzo: S (opcional).

## Inventario (`inventario/page.tsx`)

- **✨ I1 — "↳ misma familia" es críptico en filas de continuación.** `:244` las opciones 2…N de un producto muestran solo `"↳ misma familia"` sin el nombre del producto. Visualmente conecta, pero si Lucy ordena por stock o busca, una fila huérfana con "misma familia" sin contexto confunde. **Fix:** mostrar el nombre del producto atenuado en vez del texto genérico, o un tooltip. Esfuerzo: S.
- **🤔 I2 — "5 unidades o menos" hardcoded en 3 lugares.** `:184`, `:306`, KPI hint. Si el umbral de stock bajo cambia, hay copy desincronizado. Bajo impacto UX, deuda de mantenimiento. Esfuerzo: S.
- **✨ I3 — Header dice "opciones", dashboard dice "Opciones agotadas", PDP dice "variantes".** Buen esfuerzo de traducir variant→opción, pero verificar consistencia total con la tienda. Esfuerzo: S.

## Categorías (`categorias/page.tsx`)

- **🐛 C1 — Voseo en empty state** (`:229`) → **T1**.
- **✨ C2 — Columna "Slug" técnica visible siempre.** `:251`, `:298` muestra `/electrodomesticos` en mono. Para una vendedora el slug es jerga; ya está el nombre. **Fix:** mover slug a la página de edición (o tooltip), no como columna principal. Esfuerzo: S.
- **✨ C3 — Botón archivar deshabilitado sin explicación visible.** `:376` el botón se deshabilita si `_count.products > 0` con `title="Tiene productos asociados — moverlos primero"`, pero el `title` solo aparece al hacer hover y el ícono gris no comunica *por qué*. Lucy puede pensar que está roto. **Fix:** mostrar el motivo inline o un mini-texto. Esfuerzo: S.

## Cupones (`cupones/page.tsx`)

- **🐛 CU1 — Columna "Tipo" muestra el enum crudo.** `:264` renderiza `{c.type}` directo → Lucy ve **"PERCENT"**, **"FIXED"**, **"FREE_SHIPPING"** (confirmado en `schema.prisma:55-58`). Es jerga pura en mayúsculas. **Fix:** diccionario `{ PERCENT: "Porcentaje", FIXED: "Monto fijo", FREE_SHIPPING: "Envío gratis" }`. Esfuerzo: S. **Alto impacto** (es la columna principal del cupón).
- **🐛 CU2 — Jerga `/api/coupons/public` en notice y form** (`:112`, `create-coupon-form.tsx:193`) → **T2**.
- **✨ CU3 — Vigencia con fechas no-humanas.** `:296` `validFrom.toLocaleDateString("es-CO")` da "27/06/2026". Aceptable, pero el resto del admin usa formato "27 jun 2026" (Intl con `month:"short"`). Inconsistencia de formato de fecha entre módulos. Esfuerzo: S.

## Pedidos (`pedidos/page.tsx`)

- **✨ PE1 — Columna "Número" expone el ID de transacción Wompi.** `:278-281` muestra `wompi · 4912abcd…` bajo cada número. Es ruido técnico para Lucy en el listado; útil solo en el detalle. **Fix:** quitar del listado, dejarlo en `/admin/pedidos/[number]`. Esfuerzo: S.
- **✨ PE2 — No usa SortableHeader** → **T3**. Pedidos es el módulo más operativo; ordenar por monto/fecha clicando la columna sería natural.
- **🤔 PE3 — Filtro de estado en el dropdown ≠ banner de reconciliación.** El banner (`:140`) es excelente UX. Pero `needsReconciliation` no está en el `<select>` de estado, solo se llega vía link del banner; si Lucy limpia filtros pierde la vista. Aceptable, bajo impacto.

## Reseñas (`resenas/page.tsx`)

- **🐛 R1 — Copy/tono del notice no coincide con la acción.** `:137` al pasar reseña aprobada de nuevo a pendiente, el mensaje es `"Reseña marcada como pendiente"` con tono **warning** (🟡), pero el botón se llama **"Volver a pendiente"** (`:390`). El resultado está bien; el mismatch botón↔notice es menor. Esfuerzo: S.
- **✨ R2 — Muchos botones de texto plano sin affordance de botón.** `:362-426` "Restaurar", "Volver a pendiente", "Destacar", "Archivar" son `<button>` con solo color de texto, sin borde/fondo (salvo "Aprobar"). En una fila con 3-4 acciones, Lucy no distingue qué es clicable. **Fix:** dar chrome consistente (borde sutil) como en otros módulos. Esfuerzo: M.
- **✨ R3 — No usa SortableHeader** → **T3**.

## Ocasiones (`ocasiones/page.tsx`)

- **🐛 O1 — `make seed-ocasiones` en empty state** (`:198`) → **T2**.
- **✨ O2 — "Cantidad sugerida" muestra "2 / 5 / 10" sin explicar.** `:233` renderiza `${min} / ${ideal} / ${max}` crudo. Lucy no sabe qué significan los 3 números ni el orden. **Fix:** header con tooltip "mínimo / ideal / máximo" o etiquetar ("min 2 · ideal 5 · máx 10"). Esfuerzo: S.
- **✨ O3 — Slug en columna principal** (`:227`) → mismo patrón que C2.

## Clientes (`clientes/page.tsx`)

- **✨ CL1 — "Puntos" (loyalty) prominente pero sin contexto de programa.** `:182`, `:216` columna "Puntos" con `loyaltyPoints`. Si el programa de fidelidad no está activo/explicado, Lucy ve una columna que no entiende. **Fix:** ocultar si la feature no está viva, o tooltip. Esfuerzo: S.
- **✨ CL2 — No usa SortableHeader** → **T3**.

## Usuarios (`usuarios/page.tsx`)

- **🐛 U1 — Roles inconsistentes con sidebar** → **T4**.
- **✨ U2 — Flujo "promover" obliga registro previo en /signup, explicado en bloque de texto.** `:170-178` el notice describe el flujo de 2 pasos (registrarse en `/signup` y luego promover) en prosa. Es jerga de flujo. Bajo impacto (módulo solo-superadmin, poco usado), pero el link `/signup` (`:172`) abriendo en nueva pestaña podría dejar a Lucy perdida. Esfuerzo: S.

## Redirects (`redirects/page.tsx`)

- **🤔 RD1 — Módulo entero es jargon-heavy para una vendedora.** "Redirects 301", "Origen/Destino", "Hits", `lib/product-redirects.ts`, "transfieren la autoridad de la URL". Está bien explicado *para alguien técnico*, pero Lucy probablemente no debería operar esto. **Fix:** considerar ocultarlo del nav principal de Lucy (rol-gated a superadmin) o simplificar radicalmente el copy. Esfuerzo: M (decisión de producto).
- **🐛 RD2 — Voseo + comandos `make`** (`:113`, `:121-124`, `:232-233`) → **T1/T2**.

## Finanzas (`finanzas/page.tsx`)

- **🐛 F1 — Bug de pluralización en notice de reembolsos.** `:127-136` el texto sale roto: `"Revisalo{s}"` se renderiza como dos fragmentos separados (`"Revisalo"` + condicional `"s"`), y además **"Revisalo"** es voseo. Resultado visible: "Revísalos en /admin/pedidos con filtro estado = Reembolsada" pero ensamblado de forma frágil que para n=1 da "Revisalo en". **Fix:** reescribir la frase completa con tuteo y pluralización limpia. Esfuerzo: S.
- **✨ F2 — Jerga de fases/sub-bloques visible.** `:150` "Fase 2 + Q.6", "N.5 (Wompi reconcile)", "W (DIAN)". Estos códigos internos de roadmap no significan nada para Lucy. **Fix:** etiquetas humanas ("Cuando se active el pago"). Esfuerzo: S.
- **✨ F3 — Función `BlocoFuturo` (portugués/typo).** `:145`, `:256` nombre de componente "Bloco" — no es UI visible pero delata copy-paste; cosmético. Esfuerzo: S.

## Integraciones (`integraciones/page.tsx`)

- **🤔 IN1 — Módulo técnico expuesto a Lucy.** Muestra env vars (`DATABASE_URL`, `WOMPI_EVENTS_SECRET`), "DKIM/SPF/DMARC", "healthcheck 503". El patrón "ACCIÓN HUMANA" está bien usado, pero el grueso es para un dev. **Fix:** rol-gate a superadmin o colapsar todo el detalle técnico tras "Ver detalle técnico". Esfuerzo: M.
- **✨ IN2 — Voseo** `:415` "apuntá a" → **T1**.

## Email-templates (`email-templates/page.tsx`)

- **✨ ET1 — Columnas "Clave" + "Nombre interno" ambas técnicas.** `:102-103` "Clave" muestra `b.key` en mono y "Nombre interno" el título. Para Lucy "Clave" es jerga; lo que importa es para qué email sirve. **Fix:** columna principal = propósito legible ("Confirmación de pedido"), clave a tooltip. Esfuerzo: S.
- **✨ ET2 — Variables `{{customerName}}` bien documentadas** (`:155-192`) — esto está bien hecho, lo dejo como referencia positiva.

## Contenido › Bloques (`contenido/bloques/page.tsx`)

- **✨ CB1 — Columna "Identificador" (`b.key`) técnica.** `:128`, `:150` igual que email-templates: el `key` en mono es jerga. El título + descripción ya bastan. **Fix:** mover a tooltip o quitar. Esfuerzo: S.
- **Positivo:** los `CATEGORY_LABELS` con emoji (`:32-43`, "🦝 Mensajes cuando no hay contenido") son excelente UX amigable.

## Contenido › Configuración (`contenido/configuracion/page.tsx`)

- **✨ CC1 — Empty state manda a "soporte técnico".** `:119` "Pídele a soporte técnico que las cargue desde el seed". Jerga ("seed") + asume que Lucy contacta a alguien. Bajo impacto (raro que esté vacío). Esfuerzo: S.
- **Positivo:** categorías con emoji + descripción (`:37-83`) muy claras.

## Auditoría (`auditoria/page.tsx`)

- **🤔 A1 — Módulo casi inusable para no-técnico.** Filtros "Acción (prefix)" con placeholder `"ej. cms.block"` (`:144-151`), "Entidad" `"ej. Product"`, columna "Metadata" con `JSON.stringify` crudo (`:265`), acciones tipo `cms.block.inline_publish` (`:250`), entityId truncado en mono (`:256`). Todo en inglés técnico. **Fix:** diccionario de acciones legibles ("Publicó un bloque", "Editó un producto"), ocultar metadata cruda tras "ver detalle técnico", traducir entityType. Es el módulo más alejado del mandato "simple y amigable". Esfuerzo: L.
- **✨ A2 — "N campos" como resumen de metadata** (`:262`) no dice nada útil. Esfuerzo: S (parte de A1).

## Placeholder (`[...placeholder]/page.tsx`)

- **✨ PL1 — Voseo/1ª persona** `:58` "avísame y se prioriza" → **T1**. Por lo demás, página de "en desarrollo" bien resuelta y amigable.

---

## Top 8 priorizados (alto impacto, bajo esfuerzo)

1. **CU1** — Cupones muestra `PERCENT/FIXED/FREE_SHIPPING` crudo en la columna principal. 🐛 S.
2. **F1** — Bug de pluralización + voseo en notice de reembolsos en Finanzas. 🐛 S.
3. **T1** — Voseo en 8 archivos (viola mandato durable). 🐛 S.
4. **T2** — Comandos `make seed-*` y rutas `/api/*` en copy visible. 🐛 S.
5. **T4/U1** — Roles contradictorios sidebar vs usuarios. 🐛 S.
6. **A1** — Auditoría es ininteligible para Lucy (jerga total). 🤔 L.
7. **T3** — SortableHeader inconsistente (pedidos/clientes sin él). ✨ M.
8. **R2** — Botones de acción en reseñas sin affordance visual. ✨ M.

Archivos clave: `apps/web/app/admin/(panel)/cupones/page.tsx:264`, `apps/web/app/admin/(panel)/finanzas/page.tsx:127-136`, `apps/web/components/admin-shell.tsx:53-58` + `apps/web/app/admin/(panel)/usuarios/page.tsx:63-67`, `apps/web/app/admin/(panel)/auditoria/page.tsx:144-265`.