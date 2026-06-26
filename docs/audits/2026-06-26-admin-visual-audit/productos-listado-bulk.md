Now I have enough context to provide a thorough audit.

# Audit /admin/productos + dashboard + sidebar

## Findings P0

### 1. `quick-actions.tsx` — Botón Activar/Desactivar/Restaurar tiene touch target < 32px, muy por debajo de 44px mínimo
**Archivo:** `apps/web/app/admin/(panel)/productos/quick-actions.tsx:23-30` y `:39-50`
**Problema:** Los botones usan `px-2 py-1 text-[10px]` con icono `h-3 w-3`. Eso da una altura efectiva de ~22-24px. Para Lucy operando catálogo (probablemente desktop pero también en celular para pausas rápidas) es muy chico. Comparado con el botón "Editar" al lado (`text-xs` = 12px sin px/py declarado), la fila queda con dos micro-botones desalineados visualmente entre sí (uno tiene borde+bg, el otro no).
**Además:** font-size `text-[10px]` está debajo del mínimo recomendado del propio design system (todo el resto del admin usa `text-xs` = 12px como mínimo en textos accionables — ver bulk-action-bar `text-xs`, badges `text-xs`).

### 2. `productos/page.tsx` — Columna "Acciones" sin header pero con dos elementos heterogéneos sin separador visual
**Archivo:** `productos/page.tsx:257-272`
**Problema:** La celda concentra `<ProductQuickActions>` (botón con borde+fondo coloreado) + link "Editar" (texto plano sin borde, solo color). Con `gap-2` y `justify-end`, en filas con producto archivado se ve **Restaurar** (botón amber con borde) seguido de "Editar" (texto plano) sin separador — leen como dos cosas distintas y el link "Editar" parece secundario/perdido. Inconsistencia con el resto del admin donde acciones inline tienen el mismo tratamiento visual.

### 3. `bulk-action-bar.tsx` — Sticky bottom 0 puede tapar el último row de la tabla cuando hay paginación visible
**Archivo:** `bulk-action-bar.tsx:69-71`
**Problema:** El bar es `fixed inset-x-0 bottom-0 z-30 ... pb-4 pt-2` (~64-72px de alto). Cuando aparece, **no hay padding-bottom compensatorio en el `<AdminPageBody>`**. Resultado: el bloque de paginación (`productos/page.tsx:279-297`) y el último row de la tabla quedan tapados. Lucy va a tener que hacer scroll extra o no va a poder ver "Siguiente →".

### 4. `bulk-action-bar.tsx` — `flex-wrap` en mobile rompe el balance "selección | acciones"
**Archivo:** `bulk-action-bar.tsx:71`
**Problema:** El contenedor es `flex flex-wrap items-center gap-3`. En mobile (< 640px), con count="X productos seleccionados" + 4 botones de acción + "Limpiar", el bar se vuelve de 3-4 líneas de alto y el contador queda separado del clúster de acciones. El `flex-1` del contador (`:72`) más wrap empuja al wrap a hacer el contador full-width en la primera línea — viable, pero los 5 botones agrupados (`:79`) no caben en una sola línea en pantallas chicas (5 × ~90px + gaps ≈ 500px). El bar termina ocupando ~140-180px de alto en mobile — invasivo.

### 5. `dashboard/page.tsx` — Saludo con `<span className="inline-block">👋</span>` rompe layout cuando el firstName es largo
**Archivo:** `dashboard/page.tsx:107-111`
**Problema:** `firstName = session.admin.email.split("@")[0]`. Para emails tipo `crittan01@gmail.com` (la cuenta de Lucy), firstName = "crittan01" → muestra "Hola, crittan01 👋". El nombre con números no se ve cordial. Además, con emails como `admin.lucamsshop+test@gmail.com` puede romper o desbordar `AdminPageHeader` en mobile. Más importante: contradice el mandato de "admin para no-técnico" — Lucy no quiere ver su email como nombre.

## Findings P1

### 6. `productos/page.tsx` — Productos archivados sin checkbox crean huecos vacíos en columna
**Archivo:** `productos/page.tsx:230-240`
**Problema:** El checkbox solo se renderea si `p.deletedAt === null`. Cuando el filtro es `status=archived`, **todas** las filas tienen la columna w-10 vacía. La columna se ve como un margen izquierdo extraño. Mejor: ocultar la columna completa cuando todos los visibles son archivados, o renderizar un dash/lock icon para señalar "no seleccionable".

### 7. `productos/page.tsx` — Toolbar filtros: botón "Aplicar" col-span-1 lo deja angosto en sm
**Archivo:** `productos/page.tsx:173-181`
**Problema:** En `sm:col-span-1` el botón solo tiene ~50px de ancho útil — "Aplicar" (7 chars) se ve ahogado contra los bordes del button. El padding interno del `Button size="sm"` es ~px-3, dejando casi nada de aire. En desktop ancho funciona, pero en tablet (640-768px) queda apretado contra los selects al lado.

### 8. `productos/page.tsx` — Notice de archivado tiene tono "warning" pero el copy es neutral
**Archivo:** `productos/page.tsx:103`
**Problema:** `{justDeleted && <AdminNotice tone="warning">Producto archivado.</AdminNotice>}` — el archivado es una acción intencional y reversible (papelera). "warning" sugiere algo malo; debería ser `tone="success"` con texto más afirmativo tipo "Producto enviado a la papelera. Puedes restaurarlo desde el filtro Archivados." Consistencia con el notice "Producto restaurado" justo abajo que sí es success.

### 9. `productos/page.tsx` — Header de tabla "Acciones" no tiene label, solo `<th className="px-4 py-3" />`
**Archivo:** `productos/page.tsx:224`
**Problema:** Header vacío sin `<span className="sr-only">Acciones</span>` perjudica accesibilidad (screen readers anuncian celda vacía). Resto de la fila tiene aria-labels OK; falta cerrar acá.

### 10. `bulk-action-bar.tsx` — `bg-brand-purple-dark/95` con backdrop-blur sobre cualquier fondo claro genera contraste raro sobre el cream del admin
**Archivo:** `bulk-action-bar.tsx:71`
**Problema:** El fondo púrpura oscuro (90% opacidad) flotando sobre el cream `#FFF8F0` del admin shell genera halo lila tenue en los edges. Tema visual, no funcional. Más relevante: el botón "Limpiar" (`bg-white/10 border border-white/20`) tiene contraste insuficiente con el fondo púrpura — apenas se distingue del bar mismo, parece un control desactivado.

### 11. `bulk-action-bar.tsx` — `aria-label` del Loader2 está mal ubicado
**Archivo:** `bulk-action-bar.tsx:137`
**Problema:** `<Loader2 ... aria-label="Procesando" />` — lucide-react renderea un `<svg>`. Para screen readers, mejor envolverlo en `<span role="status" aria-live="polite">Procesando…</span>` para que sea anunciado. El aria-label sobre svg es ignorado por varios readers.

### 12. `dashboard/page.tsx` — OpsCard con `urgent=true` usa `ring-2` + `bg-*` y queda visualmente similar a 4 cards activadas a la vez si hay 4 urgentes
**Archivo:** `dashboard/page.tsx:142-188`
**Problema:** Si las 4 OpsCards están en urgent (caso real: 2 pedidos + 1 versión agotada + 1 stock bajo + 3 reseñas), las 4 brillan con ring + bg coloreado y pierden jerarquía. No hay un "más urgente" visualmente. Sugerencia (no implementar): solo aplicar `urgent` visual a las 1-2 más críticas (ej: pedidos + agotadas), las otras como `compact-alert` con dot pero sin ring.

### 13. `admin-nav.ts` — Grupo "Promociones" tiene "Redirects 301" que es SEO/técnico, no promoción
**Archivo:** `admin-nav.ts:144-164`
**Problema:** El reagrupado pone "Cupones" + "Mayorista B2B" + "Redirects 301" bajo "Promociones". Redirects 301 NO es promocional, es plumbing SEO. Lucy no va a entender por qué la herramienta de redirects vive en promociones. Pertenece a "Configuración" o a un grupo "SEO".

### 14. `admin-nav.ts` — Item "Mensajes" como top-level con badge `"Opcional"` rompe el patrón de 1 sola palabra
**Archivo:** `admin-nav.ts:282-289`
**Problema:** Es el único grupo con `href` directo + badge a nivel grupo + `tone:"soon"`. El badge "Opcional" no está en el enum `tone: "soon" | "phase4" | "phase5"` semánticamente correcto — "soon" tipográficamente dice "Próximo", no "Opcional". Va a renderizar con la pill de "Próximo" pero texto "Opcional", confuso.

## Findings P2

### 15. `productos/page.tsx` — Loading state ausente en submit del form de filtros
**Archivo:** `productos/page.tsx:114-192`
**Problema:** Es GET form, no client component, pero el botón "Aplicar" no tiene `aria-busy` ni feedback durante la navegación. En conexiones lentas Lucy va a click-spam. Polish.

### 16. `productos/page.tsx` — Slug `/{p.slug}` mostrado como subtítulo en celda producto pierde scope
**Archivo:** `productos/page.tsx:243`
**Problema:** `<div className="text-brand-purple-dark/50 text-xs">/{p.slug}</div>` — opacidad 50% lo deja casi ilegible (~AA contrast fail en `#FFF8F0`). Si Lucy necesita copiar el slug para compartir el link, el contraste bajo molesta. Subir a `/65` o `/70`.

### 17. `bulk-action-bar.tsx` — 4 forms anidados con HTML duplicado por cada bulk action
**Archivo:** `bulk-action-bar.tsx:144-193`
**Problema:** Comentario del código (`:81-86`) admite que es "verboso pero confiable". Cada submit recolecta checkboxes vía `document.querySelectorAll` — funciona pero hace 4 micro-snapshots del DOM en paralelo si el usuario hace doble-click. No es bug visual per se, pero impacta perceived performance.

### 18. `dashboard/page.tsx` — KpiCard "Sub-categorías" suena más técnico que de negocio
**Archivo:** `dashboard/page.tsx:199`
**Problema:** El bloque se llama "Estado del negocio" pero "Sub-categorías" no es métrica de negocio, es métrica de configuración. Lucy probablemente prefiere ver "Pedidos del mes" o "Ticket promedio" ahí. Mismo cuadrante reemplazable.

### 19. `admin-nav.ts` — Inconsistencia tipográfica de labels: "IA y Conocimiento" vs "Bot WhatsApp"
**Archivo:** `admin-nav.ts:217-230`
**Problema:** "IA y Conocimiento" usa la conjunción "y" (estilo título largo), mientras los demás grupos son sustantivos cortos ("Ventas", "Catálogo", "Finanzas"). Disonancia menor.

### 20. `productos/page.tsx` — `text-[10px]` en quick-actions no escalable con preferencias del usuario
**Archivo:** `quick-actions.tsx:25,43`
**Problema:** Tamaños arbitrarios via `text-[10px]` ignoran el sistema de design tokens. Toda la app usa `text-xs/sm/base/lg`. Romper la escala dificulta i18n y zoom del navegador.

### 21. `dashboard/page.tsx` — Hero subtitle largo con 3 strongs puede wrappear feo en tablets
**Archivo:** `dashboard/page.tsx:113-119`
**Problema:** "Aquí puedes gestionar todo el negocio: **N** productos, **N** ocasiones, **N** cupones vigentes." Con 3 valores numéricos en línea, en breakpoint ~700-900px wrappea entre coma y número, dejando "ocasiones," al final de una línea solo. Polish.

### 22. `admin-nav.ts` — Ningún item del NAV expone `aria-current` (depende de admin-shell.tsx, no auditado)
No verificable desde admin-nav.ts solo. Si el sidebar no marca `aria-current="page"` en el item activo, screen readers no anuncian ubicación. Lucy pidió "estilo del item activo distinguible" — incluir aria es necesario.

## Aprobado: NO

Los P0 #1 (touch targets de quick-actions ~22px de alto) y #3 (BulkActionBar tapa paginación/última row sin padding compensatorio) son visibles y molestos en el flujo real. P0 #5 (saludo "Hola, crittan01") es contradicción directa con el mandato de "admin para no-técnico". Requieren fix antes de cerrar el sprint.

Archivos auditados:
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/bulk-action-bar.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/quick-actions.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/dashboard/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/admin-nav.ts`
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-page.tsx` (primitives de referencia)