# Auditoría E1 — Panel admin en móvil (375px)

**Fecha:** 2026-07-31 · **Fase:** E1 del roadmap CMS (`docs/CMS_ROADMAP.md`, Fase E — pedido del usuario: _"la versión móvil, sobre todo capa admin, está poco eficiente; Lucy opera desde el celular"_).
**Método:** tour automatizado con Playwright (`apps/web/tests/e2e/mobile-admin-audit.spec.ts`, viewport 375×812, admin temporal creado y borrado por la propia spec). Por pantalla: screenshot full-page + medición objetiva de overflow horizontal del documento. Screenshots en `tmp/screenshots/e1/` (gitignored); resumen máquina en `tmp/screenshots/e1/summary.json`.

**Resultado objetivo:** 0/9 pantallas con overflow horizontal **a nivel documento** — pero es porque el contenedor principal recorta (`overflow-x-hidden`): el problema no es que el contenido se salga, es que **el ancho útil es de ~147px de 375px (39%)** por el P0 de abajo.

## Hallazgos (orden de severidad)

### P0 — Shell móvil roto: la topbar queda como columna vertical y se come ~60% del ancho (TODAS las pantallas)

- **Síntoma:** una tira morada vacía ocupa el ~60% izquierdo de la pantalla en todo el admin; el contenido se comprime en una columna de ~147px a la derecha. El logo y el botón hamburguesa quedan perdidos a lo largo de la tira (visibles a media página, no fijos).
- **Causa raíz (única):** `apps/web/components/admin-shell.tsx` — el contenedor raíz es `flex min-h-screen` (fila) y la topbar móvil (`lg:hidden`) es hija directa, así que renderiza como **columna** en vez de barra superior. La estructura correcta es `flex-col lg:flex-row` (o sacar la topbar del flujo de fila).
- **Evidencia:** `dashboard.png`, `contenido-indice.png`, `pedidos.png` (logo + ≡ a media altura de la tira), crop de `contenido-editor-pagina.png` (columna útil de 147px con botón Guardar recortado).
- **Impacto:** el admin entero es inutilizable en celular. Es EL hallazgo de E1 y la primera pieza de E2. Lo bueno: el drawer hamburguesa y la topbar **ya existen** — solo está roto el layout que los contiene.

### P1 — Tablas admin solo muestran la primera columna (pedidos, productos, cotizaciones, borradores)

- **Síntoma:** la tabla queda cortada en la primera/segunda columna sin indicación visual de que hay más (scroll interno sin affordance, o recorte directo).
- **Evidencia:** `pedidos.png` (solo "NÚMERO"), `productos.png` (checkbox + nombre truncado), `cotizaciones.png` ("NÚMERO" + astillas de columnas), `contenido-borradores.png` (el botón **Publicar** de cada fila queda cortado → en móvil solo se puede «Publicar todo», no individual).
- **E2 sugerido:** patrón tarjetas apiladas en móvil (o scroll horizontal con indicador/sombra) para `AdminTable` o por pantalla prioritaria (pedidos, cotizaciones, productos).

### P2 — Sin contexto de navegación en móvil

- **Síntoma:** el topbar desktop (breadcrumb "Panel · <sección>") se oculta en móvil (`hidden lg:flex`) y no hay reemplazo: no se sabe en qué sección se está, y el hamburguesa no queda fijo visible (por P0).
- **E2 sugerido:** al arreglar el shell, dejar la topbar móvil fija (sticky) con hamburguesa + título de sección.

### P3 — Editores de contenido: apilan bien; quedan usables al arreglar P0

- Índice de contenido (tarjetas), editor de página (filas inline), editor de lista (filas con subcampos), mediateca y borradores **ya apilan correctamente** — el diseño interno es mobile-friendly; el problema es solo el ancho robado por P0. Detalles menores a verificar tras E2: botón Guardar de la edición inline (hoy recortado por el ancho), inputs de subcampos angostos.
- **Evidencia:** `contenido-indice.png`, `contenido-editor-lista.png`, `contenido-mediateca.png`, `contenido-borradores.png`.

### P4 — Dashboard apila bien

- Tarjetas en una columna, legibles; solo afectado por P0. **Evidencia:** `dashboard.png`.

### P5 — Vista previa en vivo (C1) apila debajo del editor, como se diseñó

- El panel con iframe va después de las secciones en pantallas < xl (decisión deliberada de C1). Sin acción; re-verificar tras E2.

## Inventario para E2 (propuesta de orden)

1. **Shell** (P0+P2): raíz `flex-col lg:flex-row`; topbar móvil sticky con hamburguesa + contexto; verificar drawer.
2. **Tablas** (P1): tarjetas apiladas en móvil para pedidos/cotizaciones/productos (y la acción individual de borradores visible).
3. **Barrido fino** (P3): re-correr la spec tras los fixes y comparar (queda como herramienta de regresión visual).

## Pantallas auditadas (9)

dashboard · contenido (índice) · editor de página (inicio) · editor de lista (footer.legal.links) · mediateca · borradores · pedidos · cotizaciones · productos. _(El editor de campo simple quedó fuera porque la key buscada no existía; el editor de lista cubre la misma pantalla.)_

---

## Verificación E2 (2026-07-31, mismo día)

Fixes aplicados y **verificados re-corriendo la misma spec** (screenshots "después" en `tmp/screenshots/e1/`, "antes" preservados en `tmp/screenshots/e1-antes/`):

- **P0+P2 — `admin-shell.tsx`:** raíz `flex` → `flex-col lg:flex-row`; la topbar móvil queda como **barra superior fija** (sticky) con logo, **sección actual** (`labelForPath`) y hamburguesa. El ancho útil pasó de ~147px a 375px en todas las pantallas; el editor de página bajó de 11.941px a 7.035px de alto (contenido denso, sin la tira vacía).
- **P1 — `admin-page.tsx` (`AdminTable`):** indicación de scroll horizontal solo en móvil (`sm:hidden`): degradado de borde derecho como affordance + pista «Desliza para ver más columnas →». Verificado en `pedidos.png` (se ven NÚMERO + CLIENTE y la pista).
- **P3 — verificado sin cambios adicionales:** con el ancho recuperado, la edición inline (input + Guardar), los filtros apilados y las tarjetas quedan completamente usables a 375px.

Pendiente deliberado para una iteración futura (no bloqueante): tablas como tarjetas apiladas en vez de scroll (pedidos/cotizaciones/productos son usables con scroll + pista; las tarjetas serían el salto de comodidad, esfuerzo M por pantalla).
