I have everything I need. Confirmed: storefront `getCategoryTree` and `getCategoryBySlug.children` order by `{ order: "asc" }` with **no secondary tiebreaker**, so ties produce non-deterministic ordering on the client side. Here's my analysis.

# Cluster 2: Categorías (orden + crear) — bug/mejora/decisión

## Resumen ejecutivo

El flujo de "Crear categoría" funciona y tiene buenas decisiones (slug auto, soft-delete, toggle inline, bloqueo de borrado con productos). Pero el campo **"orden" es el punto débil real** y exactamente lo que Lucy intuyó: **no hay nada que impida colisiones de `order`, y cuando colisionan el storefront queda en orden indeterminado** (bug confirmado). Además se le pide a una usuaria no-técnica que escriba un número arbitrario, lo cual contradice la premisa "simple y amigable". Las sub-categorías (`parentId`) existen en el schema y el storefront SÍ las renderiza, pero **no hay forma de crearlas ni asignarlas desde el form** (inconsistencia funcional).

---

## Punto 1 — Colisión de `order` (mismo número en dos categorías)

**Clasificación: BUG (real, afecta storefront) + raíz del feedback de Lucy.**

Qué pasa hoy:

- El default de `order` es `0` tanto en el schema (`schema.prisma:271`) como en el form (`category-form.tsx:124` → `defaultValue={initialCategory?.order ?? 0}`) y en el parseo (`actions.ts:31` → `Number(formData.get("order") ?? 0)`).
- **Consecuencia directa:** si Lucy crea 3 categorías sin tocar el campo, las tres quedan con `order = 0`. No hay auto-asignación de "último + 1" ni validación de unicidad. `order` no es `@unique` en el schema (correcto que no lo sea, pero entonces hay que desempatar).

Comportamiento del ordenamiento ante empate:

- **Admin (listado):** desempata bien. `listCategories` usa `orderBy: [{ order: "asc" }, { name: "asc" }]` (`service.ts:34`). Con `order` igual, ordena por nombre → **determinista**.
- **Storefront (el que ve el cliente):** **NO desempata.** Ambos consumidores usan solo `orderBy: { order: "asc" }` sin tiebreaker:
  - `lib/catalog.ts:133` (`getCategoryTree` — nav/menú/home grid).
  - `lib/catalog.ts:187` (`getCategoryBySlug.children` — sub-cats en página de categoría).
  - Postgres con ties devuelve orden **no determinista** (depende del plan de ejecución). Resultado: el menú del cliente puede reordenarse entre requests, y peor: `getCategoryTree` está cacheado con `unstable_cache` → el orden "congelado" puede quedar fijado en una secuencia arbitraria hasta el siguiente revalidate.

**Propuesta:**
1. (Fix mínimo, **S**) Agregar tiebreaker `{ name: "asc" }` en los dos `orderBy` de `lib/catalog.ts` (líneas 133 y 187) para igualar al admin → elimina el indeterminismo aunque haya empates.
2. (Fix de raíz, ver Punto 2) Auto-asignar `order = max(order)+1` al crear, para que **nunca** colisionen de entrada.

**Toca storefront: SÍ** (es el lado donde el bug se manifiesta visualmente).

---

## Punto 2 — Pedir "order" manual a una usuaria no-técnica

**Clasificación: MEJORA UX (alta prioridad) — choca con la premisa "simple y amigable".**

Hoy el form muestra un `<input type="number">` "Orden" con hint "Menor número = aparece primero en el menú" (`category-form.tsx:113-128`). Para Lucy esto es ruido: tiene que inventar un número y entender una convención inversa ("menor = primero").

**Propuesta (recomendada, esfuerzo M):**
- **Al crear:** ocultar el campo `order` del form. Auto-asignar en el service: `order = (max order actual) + 1` (o entre hermanos del mismo `parentId`). Así la nueva categoría siempre cae al final, sin colisión. Cambio en `createCategory` (`service.ts:68`) + quitar el bloque del form (`category-form.tsx:108-130`) + quitar `order` del `parsePayload` create (`actions.ts:31`).
- **Para reordenar:** reemplazar la columna numérica "Orden" del listado (`page.tsx:195,206`) por **flechas ↑/↓** por fila (server action que swapea el `order` con el vecino). Es más simple de implementar que drag&drop, accesible, y suficiente para ~5-10 categorías. Drag&drop (dnd-kit) sería el ideal "bonito" pero es **L** y agrega dependencia; las flechas son **M** y cubren el 100% del caso real.

**Decisión-de-Lucy:** elegir entre (a) flechas ↑/↓ [recomendado, M] vs (b) drag&drop [L]. Mientras tanto, el campo manual puede **quedarse solo en el form de Editar** como "modo avanzado" para no bloquear nada.

**Toca storefront: NO** (solo cambia cómo se setea `order`; el consumo no cambia, salvo el fix del Punto 1).

---

## Punto 3 — Otras consideraciones del "crear"

**3a. Slug auto desde nombre — YA RESUELTO (bien).**
`category-form.tsx:42-45` (`onNameChange` → `slugify`) genera el slug en vivo y deja de auto-generar si la usuaria lo toca. `slugify` normaliza tildes y caracteres (`category-form.tsx:166-174`). Sin observaciones.

**3b. Colisión de nombre/slug — PARCIAL (bug menor de UX).**
- Slug: hay validación de unicidad real (`service.ts:69-73`, `CategoryValidationError`), y el error se muestra en el campo. Bien.
- **Nombre: NO se valida unicidad.** Se pueden crear dos categorías "Magnéticos" con slugs `magneticos` y `magneticos-2`. En el storefront el cliente vería dos entradas con el mismo texto. No es crítico, pero conviene al menos un **warning suave** ("Ya existe una categoría con un nombre parecido"). Clasificación: MEJORA UX, esfuerzo **S**. Decisión-de-Lucy si se quiere bloquear o solo advertir.

**3c. Sub-categorías (`parentId`) — INCONSISTENCIA FUNCIONAL (gap real).**
- El schema soporta jerarquía (`schema.prisma:267-269`), el dashboard las cuenta (`dashboard/page.tsx:87`), el storefront las **renderiza** (`lib/catalog.ts` árbol, `productos/[categoria]/[subcategoria]/page.tsx`), el select de productos las indenta (`service.ts:370-400`), y la página de Editar **muestra** el padre (`categorias/[id]/page.tsx:50,68`).
- **Pero el `CategoryForm` no expone `parentId` en ningún lado** — ni al crear ni al editar. No hay `<select>` de categoría padre. `parsePayload` (`actions.ts:23-33`) ni siquiera lee `parentId`, y `CategoryCreateSchema` (`schemas.ts:5-11`) no lo incluye.
- **Consecuencia:** Lucy **no puede crear ni asignar sub-categorías desde la UI**, pese a que todo el resto del sistema las espera. Solo existirían si se insertan por seed/SQL.

Propuesta: **decisión-de-Lucy primero.** ¿Quiere gestionar sub-categorías o el catálogo es plano por ahora?
- Si SÍ → agregar `<select>` "Categoría padre (opcional)" al form (excluyendo la propia categoría y evitando ciclos de 2 niveles), `parentId` al schema/parsePayload/service. Esfuerzo **M**. El reordenamiento del Punto 2 debería operar **entre hermanos** (mismo `parentId`).
- Si NO (catálogo plano por ahora) → dejar como está y documentarlo; el campo `parentId` queda como capacidad latente. Recomendado dado el mandato "simple y amigable" y que hay ~5-8 categorías reales.

**3d. Campos confusos en el form.** Más allá de "Orden" (Punto 2): el checkbox dice "Visible en la tienda" (claro), Descripción tiene buen placeholder. El schema tiene campos ricos (`richDescription`, `useCase`, `image`, `visibleFilters`, `defaultSort`, `featuredProductSlug`, `activeFrom/Until`) que **el form NO expone** — bien para "simple", pero vale confirmar con Lucy si quiere editar al menos `image` (las categorías sin imagen se ven pobres en el home grid). MEJORA UX opcional, esfuerzo **M**, decisión-de-Lucy.

---

## Punto 4 — ¿Debería la usuaria VER el campo "orden"?

**Clasificación: DECISIÓN-DE-LUCY, con recomendación clara.**

Recomendación: **no**, en línea con el Punto 2. El número crudo no le aporta a una editora no-técnica y es la fuente de las colisiones. Gestionarlo visualmente (flechas ↑/↓ en el listado) es más amigable y elimina el bug de raíz porque el `order` lo controla el sistema, no la persona. La columna "Orden" del listado (`page.tsx:195,206`) pasaría de ser un número informativo a ser los controles de reordenamiento.

---

## Punto 5 — ¿Toca el storefront?

**SÍ, en dos formas:**

1. **El bug de orden (Punto 1) se manifiesta en el cliente:** menú/nav, home grid (`components/home/category-grid.tsx` vía `getCategoryTree`), y el listado de sub-categorías en la página de categoría — todos pueden mostrar orden indeterminado ante empates de `order`. El fix de tiebreaker es en `lib/catalog.ts` (storefront), no en admin.
2. **Sub-categorías (Punto 3c):** el storefront ya tiene rutas y render para ellas (`app/productos/[categoria]/[subcategoria]/page.tsx`), así que cualquier decisión sobre exponerlas en admin tiene efecto directo en la navegación del cliente.

El **slug** también conecta: cambiarlo rompe URLs públicas (el form ya advierte en edit, `category-form.tsx:97-101`), pero **no genera redirect 301 automático** — gap conocido, fuera de alcance de este cluster.

---

## Tabla de prioridad realista (pre-launch)

| # | Item | Tipo | Esfuerzo | Toca storefront |
|---|------|------|----------|-----------------|
| 1 | Tiebreaker `name` en `orderBy` de `lib/catalog.ts:133,187` | BUG | **S** | Sí |
| 2 | Auto-asignar `order = max+1` al crear + flechas ↑/↓ en listado; ocultar campo numérico en crear | MEJORA UX | **M** | No (consumo igual) |
| 3c | Decidir si exponer sub-categorías (`parentId`) en el form | DECISIÓN + (M si sí) | M | Sí (ya hay rutas) |
| 3b | Warning de nombre duplicado | MEJORA UX | **S** | No |
| 3d | Exponer `image` de categoría (home grid) | MEJORA UX | M | Sí |

**Quick win inmediato y seguro:** Punto 1 (tiebreaker, **S**) — corrige el bug que Lucy intuyó sin cambiar UX. **Mejora de raíz recomendada:** Punto 2 (auto-order + flechas, **M**) — elimina la causa y cumple "simple y amigable". El Punto 3c requiere que **Lucy decida** si el catálogo es plano o jerárquico antes de invertir esfuerzo.

Archivos clave: `apps/web/app/admin/(panel)/categorias/category-form.tsx`, `apps/web/app/admin/(panel)/categorias/actions.ts`, `apps/web/features/categories/service.ts`, `apps/web/features/categories/schemas.ts`, `apps/web/lib/catalog.ts` (líneas 133 y 187), `apps/web/app/admin/(panel)/categorias/page.tsx`.