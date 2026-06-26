Tengo suficiente contexto. Genero el informe de Dimensión 1.

# Dimensión 1: Inventario

## Tabla maestra sub-módulos

| Sub-módulo | URL | Qué hace | CTA primaria | DB tablas | Frecuencia uso Lucy |
|---|---|---|---|---|---|
| Productos (listado) | `/admin/productos` | Lista paginada de productos del catálogo con filtros (búsqueda, estado activo/inactivo/archivado/destacado, orden). Cada fila ofrece Activar/Desactivar (quick-actions) + Editar. | "Nuevo producto" | `Product`, `Category` (join read) | Alta — diaria |
| Producto nuevo | `/admin/productos/nuevo` | Formulario para crear un producto desde cero (luego cae al editor). | "Crear" | `Product`, `ProductVariant` (crea Default) | Media — semanal al inicio |
| Producto editor | `/admin/productos/[id]` | Editor del producto (form con campos básicos + enriquecidos: `richDescription`, `whyChooseThis`, `idealFor`, garantía, producción, envío, peso/dims), panel de stock arriba, gestión de imágenes abajo, botón "Variantes", botón "Archivar". | "Guardar cambios" | `Product`, `ProductImage`, `ProductVariant` (read para stock summary) | Alta — diaria |
| Variantes del producto | `/admin/productos/[id]/variants` | CRUD de variantes (Set 6/9/12, color, forma) con stock + precio override + atributos. Form inline para crear/editar, archivar con confirmación. | "Nueva variante" | `ProductVariant` | Media — al crear producto o reponer stock |
| Categorías (listado + crear) | `/admin/categorias` | Lista de categorías con orden manual, búsqueda, estado activa/inactiva/archivada, conteo de productos. Form de creación inline abajo. Toggle estado clickeando el badge. | "Crear" (inline) | `Category` | Baja — esporádica |
| Categoría editor | `/admin/categorias/[id]` | Form de edición simple (name, slug, description, isActive, order). Zona de peligro con archivar (bloqueado si tiene productos). | "Guardar" | `Category` | Baja |
| Ocasiones (listado + crear) | `/admin/ocasiones` | Lista de tags transversales (Día Madre, Aniversario, Matrimonio…) con mes destacado, cantidad sugerida (min/ideal/max), conteo de productos. Form crear inline abajo. Toggle por badge. | "Crear" (inline) | `OcasionTag` | Baja — esporádica |
| Ocasión editor + linker | `/admin/ocasiones/[id]` | Form edición de la ocasión + linker para asociar/desasociar productos con `rationale` propio por vínculo. | "Guardar" + "Asociar producto" | `OcasionTag`, `ProductOcasionTag`, `Product` (read) | Media — al curar contenido |
| Plantillas (placeholder) | `/admin/plantillas` | No implementado. Cae al catch-all que muestra "En desarrollo" con la `description` del NAV: "Editor de plantillas pre-armadas para el Estudio". | — (no hay) | (intencionalmente vacía hoy) | Nula |
| Recomendaciones (placeholder) | `/admin/recomendaciones` | No implementado, badge "Fase 4". Cae al catch-all. | — | (vacía) | Nula |
| Cupones | `/admin/cupones` | Lista de cupones con estados derivados (Activo/Pausado/Expirado/Programado/Agotado/Archivado), filtros, form crear inline, pause/resume con audit. Marca pública para `/api/coupons/public`. | "Crear" (inline) | `Coupon`, `CouponUsage` | Media — campañas |
| Reseñas | `/admin/resenas` | Inbox de moderación: aprobar/rechazar/destacar/archivar/restaurar con foco en pendientes. Sin editor de texto (Ley 1480). | "Aprobar" / "Destacar" / "Archivar" | `Review`, `Product` (read) | Alta — diaria |
| Plantillas de correo | `/admin/email-templates` | Atajo al CMS filtrado por `category=EMAIL`. Crea/edita CmsBlocks tipo email (asunto + cuerpo + variables). | "Nueva plantilla" | `CmsBlock` (subset `category=EMAIL`) | Baja |

> Nota frecuencias: estimación inferida del rol de Lucy (operación diaria del catálogo con 9 productos, sin equipo). No hay telemetría en el repo que confirme uso real.

## Forma actual del grupo "Catálogo" en sidebar

Catálogo (icono Package, abierto por defecto)
  - Productos             (`/admin/productos`)          ACTIVO
  - Categorías            (`/admin/categorias`)         ACTIVO
  - Ocasiones             (`/admin/ocasiones`)          ACTIVO
  - Plantillas            (`/admin/plantillas`)         PLACEHOLDER (badge "Próximo")
  - Recomendaciones       (`/admin/recomendaciones`)    PLACEHOLDER (badge "Fase 4")

Fuente: `apps/web/lib/admin-nav.ts:121-145`.

De los 5 ítems visibles en el grupo "Catálogo", **3 funcionan, 2 son placeholders** — Lucy ve un grupo aparentemente lleno donde el 40% no hace nada al hacer clic.

## Sub-páginas escondidas (no en sidebar)

Páginas reales del catálogo que NO aparecen en el sidebar y solo se alcanzan por navegación lateral desde otra página:

| Ruta | Cómo se llega hoy | Por qué importa |
|---|---|---|
| `/admin/productos/nuevo` | Botón "Nuevo producto" en `/admin/productos` (`page.tsx:93-96`) | OK que esté escondida (CTA del listado) |
| `/admin/productos/[id]` | Click "Editar" en cada fila del listado o redirect post-crear | OK que esté escondida (es detalle de un item) |
| `/admin/productos/[id]/variants` | **Solo** vía botón "Variantes" en el header del editor de producto (`[id]/page.tsx:81-100`). Sin entrada en el sidebar. | **PROBLEMÁTICA**: variantes es donde vive el **stock real y el precio efectivo**. Está enterrada a 2 clics y sin pista de existencia desde el listado de productos. Lucy tiene que: entrar al producto → ver el botón "Variantes" en la esquina → clickear. Si quiere comparar stock de varios productos rápido, no hay un atajo. |
| Breadcrumb roto en `/variants` | `[id]/variants/page.tsx:85-91` arma el breadcrumb `Admin > Catálogo > Productos > [nombre] > Variantes` — el segmento "Catálogo" es texto sin link y el segmento "Productos" sí linkea, pero el segmento del producto vuelve a `/admin/productos/[id]` correctamente. Funcional pero inconsistente con `[id]/page.tsx` que NO incluye "Catálogo" en sus breadcrumbs. | Inconsistencia menor de IA. |

## Páginas que TOCAN catálogo pero están en otros grupos

| Página | Grupo donde vive hoy | Por qué está fuera de Catálogo (intención) | Por qué Lucy puede sentirla "del catálogo" |
|---|---|---|---|
| `/admin/cupones` | Comercial (`admin-nav.ts:149-150`) | Modela campañas/descuentos, separable del catálogo per se. | Para Lucy es "¿qué oferta tiene tal producto?". Los cupones afectan precio efectivo del catálogo → mentalmente se asocia con producto. |
| `/admin/resenas` | Ventas (`admin-nav.ts:112-117`) | Las reseñas nacen de un pedido; el flujo es post-venta. | Aparecen en la PDP del producto. Si Lucy está editando un producto y quiere ver sus reseñas, hoy debe ir a otro grupo del sidebar y filtrar por nombre del producto. |
| `/admin/contenido/bloques` | IA y Conocimiento (`admin-nav.ts:223`) | CMS genérico (también hosting de email templates, FAQs, copy hero…). | Aquí viven los copys de PDP genéricos, hero del home, FAQs del producto. Editar la ficha de un producto vs editar el "Por qué elegirnos" son dos páginas distintas en grupos distintos. |
| `/admin/email-templates` | Configuración (`admin-nav.ts:277-282`) | Es atajo al CMS filtrado por `category=EMAIL` → razonable que viva en Configuración. | Sin relación directa con catálogo. **No es un problema** — anotado solo para completitud del scout. |
| `/admin/contenido/configuracion` (General) | Configuración (`admin-nav.ts:261`) | Configuración global del sitio. | Sin relación directa con catálogo. Mismo caso anterior. |

Páginas relacionadas que NO son del catálogo y NO confunden — no incluidas arriba para no inflar la tabla: Pedidos, Clientes, Reclamos, Mayorista B2B, Redirects, Materiales, Costos, canales, Finanzas, Bot, Métricas, Performance, Auditoría, Usuarios, Integraciones, Mensajes.

## Concepto vs Entidad DB — mapeo de confusión

| Lo que Lucy llama (sidebar / vocabulario) | Lo que es en schema Prisma | Confusión potencial |
|---|---|---|
| "Categorías" | `Category` con jerarquía (`parent` self-relation), `order`, `richDescription`, `visibleFilters`, `defaultSort`, `featuredProductSlug`, `activeFrom`/`activeUntil` estacionales | Lucy ve "Categorías" simple pero el modelo carga muchísimo (jerarquía + estacionalidad + filtros visibles + producto destacado). El form de edición actual (`categorias/[id]/page.tsx:104-113`) solo expone name/slug/description/isActive/order — **el resto de campos del modelo no son editables desde admin**. Hay potencia oculta en la tabla que Lucy no puede tocar. |
| "Ocasiones" | `OcasionTag` (tag transversal con `monthHint`, `suggestedQuantityRange`, `description` semántica para bot) + `ProductOcasionTag` (pivot con `rationale` propio por par producto-ocasión) | Para Lucy "Ocasión" suena a "categoría temporal" o "etiqueta de marketing". Conceptualmente es un **segundo eje de taxonomía paralelo a Category**. No queda obvio cuándo crear una Categoría vs una Ocasión: ¿"Día de la Madre" es categoría o ocasión? Hoy es ocasión, pero el sidebar no lo justifica. |
| "Plantillas" (placeholder en sidebar Catálogo) | **No existe ese modelo en BD.** Quería ser "plantillas pre-armadas para el Estudio" según la `description` del NAV (`admin-nav.ts:133-135`). | **Colisión nominal grave**: ya existe `PersonalizationTemplate` en el schema (Polaroid clásico, Corazón rosa, …) — el modelo real de plantillas del Estudio. El placeholder "Plantillas" del sidebar Catálogo apunta a `/admin/plantillas` que no existe, pero `PersonalizationTemplate` ya vive en BD seedeado y no tiene admin. Lucy puede pensar que "Plantillas" del catálogo y "plantillas del Estudio que ve el cliente al personalizar" son lo mismo — y de hecho **deberían serlo**. |
| "Recomendaciones" (placeholder) | **No existe modelo en BD.** Intención según `admin-nav.ts:141-143`: cross-sell + bestsellers + "compran junto". | Tres cosas distintas en un solo nombre: (a) **bestsellers** = ranking automático por ventas; (b) **cross-sell manual** = "este combina con eso" curado por Lucy; (c) **bundles** = pack de varios productos vendidos juntos. Hoy "Recomendaciones" es un sobre vacío que mezcla los tres. |
| "Productos" | `Product` (entidad core) + `ProductVariant` (variaciones) + `ProductImage` (galería) | Conceptualmente Lucy piensa "un producto = lo que el cliente compra". El schema modela "una familia de productos con N variantes que son lo realmente comprable". El listado `/admin/productos` muestra **solo el producto padre** y oculta variantes detrás de un sub-path. Si Lucy busca "¿cuántas unidades del Set 9 fotos magnéticas tengo?" no lo ve en el listado — solo el `Product` agregado. El badge de stock en el editor (`[id]/page.tsx:62-67`) ayuda pero **solo después de entrar al detalle**. |
| "Cupones" | `Coupon` + `CouponUsage` | OK conceptualmente, pero `Coupon` tiene relación opcional a `applicableProductIds`/`applicableCategoryIds` (revisar schema) — la regla "10% en categoría X" hace que Cupones sea **una propiedad del catálogo proyectada como entidad comercial**. La frontera es legítimamente difusa. |
| "Reseñas" | `Review` + `ReviewImage` con `productId` requerido | El nombre del grupo "Ventas" sugiere "cosas que pasan en una venta". Las reseñas son **contenido del catálogo que el cliente genera post-venta**. Encajan tanto en Ventas (origen) como en Catálogo (destino donde se muestran). |
| "Base de conocimiento" (`/admin/contenido/bloques`) | `CmsBlock` (categorías: PRODUCT_PDP, HERO, FAQ, EMAIL, …) | Lucy puede no saber que el "Por qué elegirnos" de la PDP de un producto, las FAQs del producto, y el subject del email "Pedido confirmado" viven todos en la misma tabla bajo "Base de conocimiento" en el grupo "IA y Conocimiento". El nombre es opaco para una editora no técnica. |
| "Plantillas de correo" | `CmsBlock` con `category=EMAIL` (mismo modelo que arriba) | Vive en Configuración pero conceptualmente es contenido. Es un atajo al CMS, no una entidad nueva. **OK**, solo importa para entender que "Plantillas" (Catálogo) y "Plantillas de correo" (Configuración) **NO son lo mismo** aunque comparten palabra. |
| Botón "Variantes" en editor producto | `ProductVariant` con `attributes` JSON (`photoSlots`, `sizeCm`, `color`, `shape`, `finish`, `quantity`), `price` override nullable, `stock` propio | Las variantes son **donde vive el stock real** (`Product` no tiene campo stock — está agregado). Sin embargo en el sidebar no hay nada de stock ni variantes. La operación "ajustar stock" requiere: 1) acordarse del producto, 2) entrar al editor, 3) ver el `ProductStockPanel` arriba, o 4) entrar a Variantes. No hay vista global "stock por variante de todo el catálogo". |

---

Observaciones honestas para Dimensión 2 (no parte del entregable de esta dimensión, pero quedan flotando):

1. El grupo "Catálogo" tiene 40% de placeholders visibles — **ruido cognitivo** para Lucy.
2. "Plantillas" del sidebar vs `PersonalizationTemplate` del schema es una **colisión nominal real** que ya debería resolverse antes de implementar la página.
3. Variantes vive escondida pero contiene el dato más operativo del día a día (stock + precio efectivo).
4. Reseñas en "Ventas" cuando son contenido de PDP es un caso defendible (origen vs destino), pero contra el flujo mental "estoy mirando un producto → quiero ver sus reseñas" cuesta dos viajes por el sidebar.
5. Categoría como modelo es mucho más rico de lo que el form admin permite editar — hay capacidad oculta no expuesta.
6. "Recomendaciones" como concepto mezcla 3 cosas distintas (bestsellers automáticos, cross-sell curado, bundles).

Archivos consultados (referencia):
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/admin-nav.ts`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/[id]/variants/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/categorias/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/categorias/[id]/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/ocasiones/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/ocasiones/[id]/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/cupones/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/resenas/page.tsx`
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/email-templates/page.tsx`