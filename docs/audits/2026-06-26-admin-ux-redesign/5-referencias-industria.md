# Dimensión 5: Referencias Industria

## Qué tomar de cada uno

### Shopify Admin → aplicable a Lucams

- **"Home" del admin como vista del día operativa.** Hoy `/admin/dashboard` es genérico (KPIs sueltos). Shopify abre con "qué necesita tu atención hoy": pedidos sin procesar, stock crítico, mensajes sin responder, reseñas pendientes de moderar. Para Lucams: pedidos en `PENDING_PAYMENT` >24h, pedidos pagados sin enviar, productos con stock <5, reseñas en `PENDING`. Lucy entra en la mañana y sabe qué hacer sin pensar.
- **Sidebar agrupada por intención, no por entidad.** Hoy las 29 páginas están planas en `/admin/(panel)/layout.tsx` (26 líneas → sidebar simple sin jerarquía). Shopify agrupa: Orders / Products / Customers / Marketing / Analytics. Para Lucams: **Operaciones** (Hoy, Pedidos, Reclamos, Mensajes) / **Catálogo** (Productos, Categorías, Ocasiones, Cupones) / **Clientes** (Clientes, Reseñas) / **Contenido** (Bloques, Email-templates, Redirects) / **Análisis** (Finanzas, Auditoría, Performance, Errores) / **Configuración** (Integraciones, Usuarios).
- **Kanban de pedidos drag-drop.** ROADMAP prometió kanban, hoy hay tabla. Shopify usa "Unfulfilled / Fulfilled / Archived" como tabs+filtros, pero para una operadora solo de medio tiempo como Lucy, **columnas literales arrastrables** funcionan mejor: `Pendiente pago` → `Pago confirmado` → `En producción` → `Empacado` → `Despachado` → `Entregado`. Cada card muestra: número, cliente, total, fecha humana, badge de pasarela.
- **Customer 360 en un solo panel.** Hoy `/admin/clientes/[id]` está incompleto. Shopify muestra en un solo screen: timeline de pedidos + valor lifetime + notas internas + último contacto + segmento. Para Lucams añadir: cupones canjeados, diseños guardados en el Estudio, link directo a abrir WhatsApp con contexto pre-armado.
- **Mobile-first real con bottom sheet.** Lucy abre admin desde móvil mientras atiende WhatsApp. Shopify mobile usa bottom nav + sheet drawers en vez de modals fullscreen. Crítico porque mandato #10 + feedback dicen que Lucy alterna desktop/móvil.

### Stripe Dashboard → aplicable

- **Empty states informativos con CTA.** Hoy probablemente los empty states son "Sin productos" genéricos. Stripe en empty states explica **qué es** la entidad + **por qué importa** + **CTA clarísimo**. Para Lucams: empty de Cupones → "Aún no tienes cupones. Los cupones te ayudan a fidelizar clientes con descuentos por código. [Crear primer cupón]" + mascote curioso.
- **Sidebar colapsable a iconos.** Stripe permite colapsar la sidebar para ganar espacio en tablet/laptop chico. Lucams sidebar agrupada debe poder colapsar a iconos lucide con tooltip al hover. En móvil se vuelve drawer.
- **Command palette Cmd+K global.** Stripe Cmd+K busca: customers, payments, productos, settings. Para Lucy aunque no sea keyboard-first, un buscador grande accesible desde topbar con `/` o botón "Buscar" cumple el mismo rol: "buscar pedido #1234", "buscar cliente María", "ir a productos".
- **Topbar minimal.** Avatar + buscador + notificaciones + nada más. Hoy admin no tiene topbar definida claro. Reservar topbar slim (48px) para: buscador centro, badge de notificaciones (pedidos nuevos), avatar Lucy con menú compacto.
- **Detail pages con tabs internas, no acordeones.** Stripe `/customers/[id]` tiene tabs "Payments / Subscriptions / Events / Metadata". Para Lucams resolver el "sobrecargado" de `/admin/productos/[id]`: tabs **General / Variantes / Imágenes / SEO / Inventario** en vez de un scroll infinito con todo abierto.

### Linear → aplicable

- **Vistas guardadas por filtro.** Linear permite guardar combos de filtros como "vistas". Para Lucams en `/admin/pedidos`: "Pedidos del día", "Pendientes de despacho", "Reclamos abiertos" como chips fijos arriba de la tabla/kanban. Reduce clics repetitivos de Lucy.
- **Animations sutiles, no rebotes.** Linear tiene microanimaciones (fade 150ms, slide 200ms ease-out) que dan sensación premium sin distraer. Para Lucams kawaii: igual de sutiles + algún detalle de mascote (parpadeo en empty state, sonrisa al guardar) pero sin confetti permanente ni rebotes infantiles.
- **"Quick add" floating button.** Linear tiene `C` para crear issue desde cualquier vista. Para Lucy mouse-first: FAB bottom-right con mascote saludando que abre menú "¿Qué quieres crear?" → Pedido manual / Producto / Cupón / Categoría / Reseña interna.
- **Inbox como concepto.** Linear "Inbox" agrupa todo lo que requiere tu atención. Para Lucams equivale a esa "Vista Hoy" + bandeja de mensajes/reclamos sin responder. Una sola página donde Lucy procesa en orden.

### Notion → aplicable

- **Edición inline en settings y CMS.** Hoy probablemente settings son forms con botón Guardar abajo. Notion: click en el valor → input aparece → blur guarda. Para Lucams configuración (`/admin/contenido/configuracion`, `/admin/integraciones`): valores editables inline con auto-save + spinner pequeño + checkmark verde tras guardar.
- **Side panel para metadata vs canvas para contenido.** Hoy `/admin/contenido/bloques/[id]` mete preview + form + metadata + cheatsheet en una sola columna larga. Patrón Notion: **canvas izquierda (lo que importa: editor markdown grande)** + **side panel derecha (metadata: slug, fecha, estado, SEO)**. Resuelve directamente la queja "sobrecargado".
- **Slash commands en CMS.** Sub-bloque K (Visual In-Place Editor) declarado pero ausente. Patrón Notion: `/` abre menú de bloques (heading, imagen, lista, callout, código). Aplicable al editor de bloques de contenido y a descripciones largas de producto.
- **"Sin chrome" — herramientas en hover/select.** Hoy admin probablemente muestra toolbars siempre visibles. Notion las oculta hasta que seleccionas/hover. Para Lucams: row actions (editar, archivar, duplicar) aparecen solo en hover de la fila; no botones permanentes que saturan.

## Lo que NO copiar

- **De Shopify:** la densidad de información. Shopify mete 4 columnas de stats arriba y tablas con 12 columnas. Lucams es marca cálida con catálogo chico (9 productos hoy, ~20 familias proyectadas). Mantener respiro: tipografía Fredoka/Baloo en headings, espaciado generoso, paleta cream/lavanda en vez de gris corporativo.
- **De Stripe:** el tono serio gris-azul. Stripe sirve a fintech, Lucams a clientes que compran imanes para su nevera. El admin debe seguir siendo cálido — Lucy pasa horas ahí. Aplicar patterns estructurales (sidebar colapsable, Cmd+K) pero conservar `#7C6AAD` purple, `#FFF8F0` cream, ilustraciones de mascote.
- **De Linear:** el keyboard-first dogmático. Lucy usa mouse y touch primariamente (móvil mientras WhatsApp). Los shortcuts son bonus, no requisito. Cada acción crítica debe ser alcanzable con clic/tap grande, no solo con `G+P`. Tampoco copiar el dark theme por defecto: Lucams es luminoso cream.
- **De Notion:** el "blank canvas" sin guías. Notion confía en usuarios power que descubren slash commands. Lucy es no-técnica. Aplicar inline edit + side panel, pero mantener labels visibles, placeholders ejemplares ("Ej: Imán personalizado redondo 5cm"), cheatsheet markdown siempre a la vista (memoria `feedback_admin_ux_no_tecnico`).

## Patterns destilados para Lucams admin

1. **Vista "Hoy" como home del admin.** Reemplaza `/admin/dashboard` actual. Secciones: "Pedidos que necesitan tu atención" (PENDING_PAYMENT >24h, pagados sin enviar), "Mensajes sin responder" (cuando exista `/admin/mensajes`), "Stock crítico" (variantes <5), "Reseñas para moderar" (PENDING). Cada item linkea directo a la acción. Copy en es-CO tuteo con mascote arriba: "¡Hola Lucy! Hoy tienes 3 pedidos por revisar."

2. **Sidebar agrupada con iconos lucide pastel + colapsable.** 6 grupos (Operaciones / Catálogo / Clientes / Contenido / Análisis / Configuración) con header en mayúscula tenue, items con icono pastel (`Package`, `ShoppingBag`, `Users`, etc.) tintados en `#7C6AAD` lavanda. Colapsa a iconos en tablet (<1280px), drawer en móvil (<768px). Item activo con fondo `#7C6AAD/10` y barra izquierda `#7C6AAD`.

3. **Topbar slim con buscador + Cmd+K + avatar.** 48px alto, fondo `#FFF8F0` cream, buscador centro con `/` shortcut hint, badge notificaciones con contador (pedidos nuevos último día), avatar Lucy con menú "Mi cuenta / Cerrar sesión".

4. **Kanban pedidos drag-drop con mascote en empty state por columna.** Sustituye tabla actual `/admin/pedidos`. 6 columnas (Pendiente pago → Pago confirmado → En producción → Empacado → Despachado → Entregado). Cards con número, cliente, total, fecha humana, badge pasarela. Empty state por columna: mascote en pose distinta + microcopy ("Nada en producción todavía 🎨"). Filtros guardados como chips arriba ("Hoy", "Esta semana", "Atrasados").

5. **Detail pages con tabs internas (resuelve "sobrecargado").** `/admin/productos/[id]` y `/admin/pedidos/[number]` con tabs: **Producto** → General / Variantes / Imágenes / Inventario / SEO. **Pedido** → Resumen / Items / Cliente / Envío / Historial. Solo una tab visible a la vez, no scroll infinito. Tab activa en color brand.

6. **Quick Add FAB con mascote saludando.** Bottom-right `#E85B9F` pink, mascote en burbuja al hover. Click abre popover con 5 acciones (Pedido manual / Producto / Cupón / Categoría / Bloque contenido). Atajo `N` opcional.

7. **Empty states siempre con mascote + microcopy es-CO tuteo + CTA.** Patrón único reutilizable: ilustración mascote (variante por contexto) + título amable ("Aún no tienes cupones") + explicación 1 línea ("Los cupones fidelizan clientes con códigos de descuento") + botón primario brand-purple ("Crear primer cupón").

8. **Status chips con emoji + color brand.** 🟢 Publicado / 🟡 Borrador / ⚫ Archivado / 🔴 Reclamo abierto / 🟣 En producción. Reutilizables como primitive en `packages/ui` o `components/admin/status-chip.tsx`. Pastel backgrounds (`bg-green-100`, `bg-amber-100`) con texto oscuro legible.

9. **Fechas humanas en es-CO siempre.** `Intl.RelativeTimeFormat('es-CO')` para <7 días ("hace 2 minutos", "ayer"), formato largo legible para >7 días ("el 12 de junio a las 3:45 p.m."). Utility en `apps/web/lib/date-human.ts`. Tooltip al hover muestra fecha ISO completa.

10. **Edición inline con auto-save.** Settings, descripciones cortas, precios, slugs: click en valor → input → blur guarda + spinner mini → checkmark verde 2s. Side panel patrón Notion para metadata (slug, estado, SEO) separado del canvas principal (editor markdown grande + preview live side-by-side, no tabs separadas).

11. **Row actions en hover (no toolbars permanentes).** Tablas/listas con iconos editar/duplicar/archivar visibles solo en hover de fila. Reduce ruido visual. Mantener una acción primaria siempre visible (ej. "Ver pedido") para touch en móvil.

12. **Confirmaciones suaves para acciones públicas/destructivas.** Patrón shadcn AlertDialog reutilizable con copy es-CO tuteo: "¿Seguro quieres archivar este producto? Dejará de mostrarse en la tienda pero podrás restaurarlo después." Botón confirmar en rojo solo para destructivas, en brand-purple para publicar.