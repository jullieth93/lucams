# Audit Visual Final Admin Lucams_shop — 2026-06-26

## Resumen

Se auditaron 3 paneles del admin (inventario post-fix, producto-detalle sub-nav, productos-listado + dashboard + sidebar) cubriendo ~12 archivos. Total: **41 hallazgos** — 14 P0, 17 P1, 10 P2. Los P0 incluyen 2 bugs funcionales disfrazados de UI (archivar reseña no aparece en Pendientes, link Restaurar con productId incorrecto), 2 links a sub-ruta legacy `/variants` ya migrada, touch targets <30px en quick-actions, BulkActionBar tapando paginación, y un saludo "Hola, crittan01" que viola el mandato admin-no-técnico. **NO aprobado para mostrarle a Lucy sin fixes** — hay bugs que ella va a notar en los primeros 30 segundos de uso (doble borde en tabla inventario, saludo con username de email, botones Activar/Pausar enanos).

## P0 — bugs visibles que Lucy notará (URGENTE)

| ID | Ubicación | Descripción | Fix sugerido |
|---|---|---|---|
| P0-1 | `inventario/page.tsx:136` | `AdminCard` envuelve `AdminTable` duplicando border + rounded-xl + shadow → doble outline visible | Quitar wrapper `AdminCard`, `AdminTable` ya es card |
| P0-2 | `inventario/page.tsx:139` | `<tr>` con `text-brand-purple-dark` sólido sobrescribe el `/70` global de `AdminTableHead` → header más oscuro que el resto del admin | Eliminar clases redundantes del `<tr>`, dejar que `AdminTableHead` mande |
| P0-3 | `inventario/page.tsx:48` | Hint delta (`+5`/`-3`) aparece condicionalmente bajo el editor → fila crece ~14px al editar, salto visual jarring | Reservar altura con `min-h-[Xpx]` en el form o mover hint a tooltip |
| P0-4 | `inventario/page.tsx:152-169` | Badge "Pausado" fuera del link inline-flex puede caer en línea sola con nombres largos | Envolver nombre+badge en `flex flex-wrap items-center gap-2` controlado |
| P0-5 | `product-reviews-panel.tsx:313-326` | Botón "Archivar" envuelto en `showFeatureToggle` → NO aparece en tab Pendientes (único lugar donde se necesita para spam) | Sacar Archivar del condicional `showFeatureToggle` |
| P0-6 | `product-reviews-panel.tsx:327-336` | Link Restaurar usa `?productId=${review.id}` (id del review, no del producto) → destino con filtro roto | Cambiar a `?productId=${productId}` (prop del panel) |
| P0-7 | `product-stock-panel.tsx:164-171` y `:71-77` | Link "Editar todas las variantes" apunta a `/admin/productos/${id}/variants` (sub-ruta legacy migrada a `?section=versiones`) | Cambiar href a `?section=versiones` |
| P0-8 | `product-stock-editor.tsx:53` | Grid `[1fr_auto]` sin `min-w-0` ni `grid-cols-1` mobile → riesgo overflow horizontal <360px | Cambiar a `grid-cols-1 sm:grid-cols-[1fr_auto]` + `min-w-0` en input |
| P0-9 | `quick-actions.tsx:23-30, 39-50` | Botones Activar/Pausar/Restaurar con `px-2 py-1 text-[10px]` → altura ~22-24px, muy lejos de 44px touch target | Subir a `text-xs px-3 py-1.5` mínimo, icono `h-3.5 w-3.5` |
| P0-10 | `productos/page.tsx:257-272` | Celda Acciones mezcla botón con borde (QuickActions) + link "Editar" plano sin tratamiento visual común | Igualar estilo (ambos botones outline o ambos link) |
| P0-11 | `bulk-action-bar.tsx:69-71` | Bar `fixed bottom-0` sin padding-bottom compensatorio en `AdminPageBody` → tapa paginación y última fila | Agregar `pb-24` condicional al body cuando hay selección, o spacer al final del listado |
| P0-12 | `dashboard/page.tsx:107-111` | `firstName = email.split("@")[0]` muestra "Hola, crittan01 👋" → contradice mandato admin-no-técnico | Usar nombre real del admin (campo `name` en sesión) con fallback genérico "Hola 👋" |
| P0-13 | `product-reviews-panel.tsx:238-255` | Header review: 5 elementos inline sin `flex-wrap` ni `truncate` en nombre autor → desborda con nombres largos | Agregar `flex-wrap` + `truncate min-w-0` en nombre |
| P0-14 | `inventario/page.tsx` (tabla 6 cols) | `min-w-[640px]` con 6 columnas reparte ~107px/col → editor stock (154px mínimo) fuerza scroll horizontal en breakpoint angosto | Subir `min-w` a `[800px]` o dar ancho explícito a col "Ajustar" |

## P1 — mejorables (próximo sprint)

| ID | Ubicación | Descripción | Fix sugerido |
|---|---|---|---|
| P1-1 | `inventario/page.tsx:415-430` | Sin indicador de cambios pendientes en filtros antes de clickear "Aplicar" | Highlight visual del botón Aplicar cuando difiere de URL actual |
| P1-2 | `inventario/page.tsx` filtros | `<select>` Categoría con nombres largos no trunca (limitación browser) | Agregar `max-w-[200px]` y truncate por CSS |
| P1-3 | `compact-stock-editor.tsx` | Input `h-9 w-20` (36×80px) + botón Save 36×36px < 44px touch | Subir a `h-11` en mobile o usar `sm:h-9` |
| P1-4 | `inventario/page.tsx:273` | KPI tile clickable sin `cursor-pointer` visible en hover | Agregar `cursor-pointer` al div interno cuando hay href |
| P1-5 | `inventario/page.tsx:464-481` | Paginación sin saltos a primera/última ni indicador de página actual | Añadir números de página o "X de Y" |
| P1-6 | `inventario/page.tsx` empty state | Empty no tiene CTA "Limpiar filtros" cuando aplica | Pasar `action` al `AdminEmpty` con link a la página sin params |
| P1-7 | `product-section-nav.tsx:81-84` | Badge amber pierde tono urgente en estado active (amber-300/30 sobre púrpura = beige apagado) | Mantener `bg-amber-100 text-amber-900` incluso en active |
| P1-8 | `product-reviews-panel.tsx:99-126` | Sub-tabs sin contenedor `rounded border bg-white` → flotan vs nav padre que sí lo tiene | Envolver en wrapper con mismo tratamiento que ProductSectionNav |
| P1-9 | `product-reviews-panel.tsx:181` vs `product-section-nav.tsx:74` | Sub-tabs `h-10` (40px) vs nav principal `h-11` (44px) → inconsistente y bajo touch target | Estandarizar ambos a `h-11` |
| P1-10 | `product-variants-panel.tsx:194-214` | Botones Editar/Archivar con `px-2 py-1 text-xs` h-~28px + Archivar sin label visible (solo title) | Subir padding y agregar `<span class="sr-only">Archivar</span>` |
| P1-11 | `product-variants-panel.tsx:64-74` | Botón "Nueva versión" en div suelto sin card padre → "flota" entre AdminNotice y AdminTable | Meter en barra de acciones con misma anchura que tabla |
| P1-12 | `product-reviews-panel.tsx:238-255` | 4 tamaños de texto en una línea (autor sm, ciudad xs, badge propio, fotos xs) → ruido visual | Estandarizar metadata secundaria en `text-xs text-brand-purple-dark/60` |
| P1-13 | `product-variants-panel.tsx:169-173` | Badge "Características" sin `max-w` ni truncate → rompe grid con muchos attrs | Aplicar `max-w-[28ch] truncate` al label |
| P1-14 | `product-coupons-widget.tsx:75-97` | Empty state sin `flex-wrap` ni `min-w-0` → colapsa en mobile angosto | Agregar `flex-wrap` + `min-w-0` en lado izquierdo |
| P1-15 | `productos/page.tsx:230-240` | Filtro `status=archived`: columna checkbox queda vacía como margen fantasma | Ocultar columna checkbox cuando todos los visibles son archivados |
| P1-16 | `productos/page.tsx:103` | Notice "Producto archivado" con `tone="warning"` (alarmante) cuando es acción intencional reversible | Cambiar a `tone="success"` con copy explicativo de recuperación |
| P1-17 | `admin-nav.ts:144-164` | "Redirects 301" agrupado bajo "Promociones" → no es promocional, es plumbing SEO | Mover a "Configuración" o crear grupo "SEO" |

## P2 — polish (post-launch)

| ID | Ubicación | Descripción | Fix sugerido |
|---|---|---|---|
| P2-1 | `inventario/page.tsx:164,170` y `compact-stock-editor.tsx` | `text-[10px]` y `text-[11px]` fuera de la escala Tailwind (mínimo design system es `text-xs`) | Reemplazar por `text-xs` |
| P2-2 | `inventario/page.tsx:152` | `aria-label="Abrir producto"` en ícono dentro de Link con texto → screen reader lee doble | Cambiar a `aria-hidden="true"` |
| P2-3 | `inventario/page.tsx` form filtros | `<label>` envuelve span+select (asociación implícita) en vez de `htmlFor` explícito | Migrar a `htmlFor` + `id` |
| P2-4 | `product-section-nav.tsx:36` | `-mt-2` negativo asume padding exacto del padre → frágil si aparece notice arriba | Eliminar margen negativo, dejar que el padre maneje spacing |
| P2-5 | `product-reviews-panel.tsx:134, 252-253` | Emojis hardcoded (`✨`, `📷`) vs resto del admin con lucide icons | Reemplazar por iconos lucide |
| P2-6 | `product-variants-panel.tsx:125` | Highlight modo edición `bg-brand-purple/[0.03]` casi imperceptible | Subir a `/8` + border-left |
| P2-7 | `product-reviews-panel.tsx:196` | Badge sub-tab renderea `0` cuando count=0 (inconsistente con ProductSectionNav que oculta) | Renderizar solo si `count > 0` |
| P2-8 | `productos/page.tsx:243` | Slug con `text-brand-purple-dark/50` → contraste borderline AA sobre cream | Subir a `/65` |
| P2-9 | `dashboard/page.tsx:142-188` | 4 OpsCard `urgent` simultáneas pierden jerarquía visual | Limitar a 2 urgentes máximo, resto como compact-alert |
| P2-10 | `bulk-action-bar.tsx:71` | Botón "Limpiar" `bg-white/10 border-white/20` sobre fondo púrpura → contraste insuficiente, parece deshabilitado | Subir a `bg-white/20 border-white/40` |

## Recomendación

**Fixear AHORA en commit hotfix (bloqueantes, alto ROI):**
- **P0-1** doble borde inventario — 1 línea, alto impacto visual
- **P0-3** salto de altura al editar stock — UX core de inventario
- **P0-5** archivar reseña en Pendientes — bug funcional crítico para moderar spam
- **P0-6** link Restaurar con productId roto — bug funcional
- **P0-7** dos links a `/variants` legacy — rompe navegación, ya migrado
- **P0-9** touch targets quick-actions 22px — visible en cada fila del listado
- **P0-11** BulkActionBar tapa paginación — bloquea flujo bulk
- **P0-12** "Hola, crittan01" — Lucy lo va a notar al login y duele identidad de marca

Esos 8 P0 son ~2-3 horas de trabajo y son los que rompen la sesión de Lucy.

**Dejar para próximo sprint (P0 menores + P1):**
- P0-2, P0-4, P0-8, P0-10, P0-13, P0-14 — bugs reales pero edge cases (nombres largos, mobile <360px, breakpoint angosto)
- Todos los P1 — mejoras de polish que no rompen flujo

**Dejar para post-launch (P2):**
- Toda la lista P2 — accesibilidad fina, contraste borderline, consistencia tipográfica. Importantes pero no bloquean.

**Honestidad:** los 3 panels NO están listos para mostrar tal cual. Los P0 funcionales (P0-5, P0-6, P0-7) son los más urgentes porque enrutan a páginas rotas o esconden acciones críticas — eso supera incluso a los visuales. Si solo hay tiempo para 4 fixes, priorizar: **P0-5, P0-6, P0-7, P0-12**.