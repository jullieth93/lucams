# Plan Catálogo V2 — Consensos de Diseño del Catálogo

> **Registro canónico de los consensos de diseño del catálogo (80 decisiones, numeración estable `[1.1]`–`[8.10]`).** El plan está cerrado e implementado: múltiples cabeceras y módulos del código referencian estas decisiones por número (`PLAN_CATALOG_V2 2.10`, etc.) junto con `ADR-038` y `ADR-039`. Ante cualquier divergencia posterior, la fuente de verdad del modelo de datos es [`../packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma), la especificación viva del subsistema vive en [`domains/catalog-and-cms.md`](domains/catalog-and-cms.md) y [`ARCHITECTURE.md`](ARCHITECTURE.md), y las reglas transversales vigentes viven en [`DECISIONS.md`](DECISIONS.md).
>
> **Resumen de evoluciones vigentes en código respecto al texto fundacional:** el control de acceso administrativo evolucionó a la matriz de **8 roles × 34 capacidades** (`SUPERADMIN`, `OPERATIONS_MANAGER`, `CUSTOMER_SUPPORT`, `PRINT_WORKSHOP`, `FINANCE_ANALYST`, `MANAGER`, `FULFILLMENT`, `CMS_EDITOR`); la captura tributaria DIAN vive estructurada en `Order` detrás de `BILLING_DOCUMENT_ENABLED = false` (`ADR-160`, sin filas legacy en `SiteSetting`); el canal corporativo B2B y de eventos opera en `/empresas-y-eventos` → `Opportunity` → `/cotizacion/[token]` (`ADR-193`); las redirecciones 301 viven en la tabla administrable `UrlRedirect`; el precio lineal de `ProductVariant.price` se complementa con `WholesaleTier` y variantes gemelas `-NOMAG` (`ADR-099`); el flujo `PREMADE` sin Estudio y `premadeSurcharge` se retiraron en `ADR-090`/`ADR-125` (cubiertos por la galería curada `DesignGalleryImage`); la telemetría agregada vive en `FunnelEventDaily` sin `RecommendationLog`; los respaldos fuera del sitio corren automatizados y cifrados en Cloudflare R2; y las alertas operativas confluyen en `/admin/hoy` y `Notification`.

## Decisiones cerradas

> Cada decisión conserva su contexto, justificación, tablas, esquemas e **Implicación admin** originales, acompañados de una nota `Estado vigente en código` allí donde la arquitectura productiva evolucionó.

---

### [1.1] Naming "Fotoimanes" (2026-05-15)

- **Decisión**: display oficial **"Fotoimanes"** (junto, sin guion, mayúscula inicial). Slug `foto-imanes` se mantiene por SEO. Resto de categorías mantienen naming actual.
- **Rationale**: hoy aparece inconsistente ("Fotoimanes" / "Foto-imanes" / "Imanes con foto") en distintas partes del sitio. Unificar lee como marca, es más corto, no rompe SEO.
- **Implica**:
  - Update consistente en `Category.name` + descripciones + emails + CMS blocks.
  - Slug `foto-imanes` se conserva → no hay redirect.
- **Admin**: edita display name desde `/admin/categorias/[id]` (CRUD existente). No requiere feature nueva.

---

### [1.2] Once categorías (Separadores como categoría propia) (2026-05-15)

- **Decisión**: el catálogo Lucams tiene **11 categorías permanentes** (orden listado).
  1. Fotoimanes
  2. Recuerdos Magnéticos
  3. Calendarios Magnéticos
  4. Publicitarios B2B
  5. Organización
  6. Cajas Regalo
  7. De Temporada
  8. Cuadros y Decoración
  9. **Separadores Magnéticos** (nueva — sube de sub-cat a categoría propia)
  10. Coleccionables
  11. Juegos y Aprendizaje
- **Rationale**: Separadores tiene alto volumen de búsqueda en mercado colombiano (TikTok / Instagram lo mueve mucho). Como sub-cat dentro de Organización quedaba invisible. Resto de categorías sin solapamiento real desde la visión del negocio — son opciones distintas, no redundantes.
- **Implica**:
  - Crear `Category(slug='separadores', name='Separadores Magnéticos', isActive=true, isFeatured=true)`.
  - Producto existente `pack-separadores-libros` migra de `organizate` → `separadores`.
  - Redirect 301: `/productos/organizate/separadores` → `/productos/separadores`.
- **Admin**: crear/archivar/reordenar categorías desde `/admin/categorias` (CRUD existente). Posición display se controla con campo `Category.order` (verificar si existe; si no, sumar).

---

### [1.3] Sub-categorías jerárquicas reales por categoría (2026-05-15)

- **Decisión**: usar `Category.parentId` para sub-categorías reales con URLs propias `/productos/<categoria>/<subcategoria>`. Tabla:

| #   | Categoría              | Sub-categorías                                                                                                                                                                                                 | Criterio                 |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | Fotoimanes             | Polaroid · Cuadrados · Circulares · Corazón · Vidrio                                                                                                                                                           | Forma física             |
| 2   | Recuerdos Magnéticos   | Cumpleaños · Bautizo · Grado · Matrimonio · Quinceañera · Primer Año · Baby Shower                                                                                                                             | Evento                   |
| 3   | Calendarios Magnéticos | Foto-Mes · Foto + Planner · Floral · Mini para regalar                                                                                                                                                         | Tipo                     |
| 4   | Publicitarios B2B      | Rectangulares · Circulares · Troquelados · Tarjeta Presentación · Pack Mixto + Pedido grande¹                                                                                                                  | Forma + flujo B2B        |
| 5   | Organización           | Planners · Notas                                                                                                                                                                                               | Uso                      |
| 6   | Cajas Regalo           | Pareja · Recién Nacido · Sorpresa                                                                                                                                                                              | Destinatario             |
| 7   | De Temporada           | Día Madre · Día Padre · Amor y Amistad · Halloween · Navidad · Año Nuevo                                                                                                                                       | Evento estacional (rota) |
| 8   | Cuadros y Decoración   | Cuadros con Foto · Cuadros con Frase · Triple Foto · Marcos                                                                                                                                                    | Tipo                     |
| 9   | Separadores Magnéticos | Diseños Lucams (Frases · Animalitos · Plantas · Comida) · Universos² · Personalizables (con foto / con frase)                                                                                                  | Temática                 |
| 10  | Coleccionables         | Diseños Lucams (Ciudades Colombia · Comida Colombiana · Frases · Animalitos · Viajes LATAM · Mood) · Universos² (Harry Potter · Pokémon · Star Wars · Marvel · DC · Disney/Pixar · Anime Retro · Cartoons 90s) | Temática                 |
| 11  | Juegos y Aprendizaje   | Abecedario · Números · Rutina diaria · Emociones                                                                                                                                                               | Propósito infantil       |

¹ Flujo B2B consultivo (ver `[1.6]`).
² Universos: asumiendo criterio de propiedad intelectual según decisión `[1.7]`.

- **Rationale**: sub-cats jerárquicas dan SEO específico por slug (ej. "imán polaroid colombia" indexa `/productos/fotoimanes/polaroid`). Reducen fricción navegacional.
- **Implica**:
  - Migración Prisma: poblar filas en `Category` con `parentId` apuntando a la categoría padre.
  - Productos hoy se migran a `subCategoryId` (nuevo campo o usar `Category.parentId` del `producto.categoryId` actual).
  - Rutas: `app/productos/[categoria]/[subcategoria]/page.tsx`.
  - Redirects 301 si algún slug cambia.
- **Admin**: CRUD jerárquico de categorías → admin elige `parentId` al crear sub-cat. UI muestra árbol categoría → sub-categoría. Reorder drag-drop.

---

### [1.4] UX mega-menú visual en header (opción 7.α) (2026-05-15)

- **Decisión**: navegación de categorías con **mega-menú visual** en el header (estilo Casetify / Vistaprint). Al hover/click en una categoría, se despliega panel ancho con grid 2 columnas mostrando todas las sub-categorías con thumbnail curado.
- **Rationale**: 1 click desde cualquier página. Cliente ve todas las opciones visualmente. Diferencia Lucams como tienda kawaii premium vs e-commerce genérico.
- **Implica**:
  - Update `components/site-header.tsx` para mega-menú anidado (Radix NavigationMenu ya instalado).
  - Cada sub-cat necesita `thumbnailUrl` curado.
  - En `/productos/<categoria>` también aparecen chips de sub-cat arriba del grid para selección rápida.
  - URLs: `/productos/<categoria>` (todo) + `/productos/<categoria>/<subcategoria>` (filtrado).
- **Admin**: subir thumbnail por sub-categoría desde `/admin/categorias/[id]` + setear orden de aparición + toggle "visible en mega-menú".

---

### [1.5] Tags transversales por OCASIÓN (2026-05-15)

> **Estado vigente en código:** hoy operan **16 ocasiones activas** en `OcasionTag` (relación muchos-a-muchos `ProductOcasionTag`), servidas tanto en el filtro combinable `?ocasion=` como en las páginas SEO dedicadas `/ocasion/[slug]` (ver [`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

- **Decisión**: 15 tags transversales iniciales que cruzan categorías para facilitar discovery por evento/ocasión.
- **Lista inicial**: Cumpleaños · Matrimonio · Bautizo · Baby Shower · Grado · Quinceañera · Aniversario · Día Madre · Día Padre · Amor y Amistad · Halloween · Navidad · Año Nuevo · Empresarial · Para mí mismo.
- **UX**:
  - Chips horizontales scroll arriba del grid en `/productos` (multi-select, combinables con categoría).
  - Menú "Por ocasión ▾" en header (dropdown rotando según mes destacado).
  - Chip "Ideal para: X" en PDP debajo del precio.
  - URLs: `/productos?ocasion=matrimonio` o `/productos/fotoimanes?ocasion=matrimonio`.
- **Rationale**: aumenta discovery cruzado. Cliente buscando "matrimonio" ve productos relevantes de 4-5 categorías sin tener que navegarlas todas. Tags también informan filtros y recomendaciones (Áreas 6 y 7).
- **Implica**:
  - Tabla nueva `OcasionTag(id, name, slug, isActive, order)`.
  - Tabla pivot `ProductOcasionTag(productId, ocasionTagId)`.
  - Server action de listado acepta filtro `ocasion[]`.
  - Cada producto se asocia a 0-N ocasiones desde admin.
- **Admin**: CRUD de ocasiones + asociación múltiple por producto (checkboxes en el form del producto). Reorder. Toggle activo.

---

### [1.6] B2B Publicitarios con flujo `/mayorista` (2026-05-15)

> **Estado vigente en código:** los productos publicitarios siguen públicos en `/productos/publicitarios` (con tramos por volumen en `WholesaleTier`) y el embudo consultivo B2B y de eventos vive hoy en **`/empresas-y-eventos`** → pipeline `Opportunity` (`/admin/oportunidades`) → cotizador **`/cotizacion/[token]`** con hoja de taller propia (`ADR-193`, ver [`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md)), manteniendo inalterada la regla de no prometer factura electrónica DIAN mientras no aplique obligatoriedad.

- **Decisión**: la categoría Publicitarios opera como categoría pública normal + se complementa con página `/mayorista` para pedidos corporativos grandes.
- **Aterrizado**:
  - `/productos/publicitarios` con 5 productos visibles, variants quantity x50/100/200 con precios públicos.
  - Banner arriba de la categoría: _"¿Pedido grande? Cotizamos pedidos desde 300 unidades con descuento por volumen + soporte de documentación tributaria → [Cotizar por WhatsApp] [Ir a /empresas-y-eventos]"_.
  - **Página B2B** con: hero kawaii corporativo · beneficios (descuentos volumen, asesoría, documentación tributaria, plazos pago) · formulario (empresa + NIT + email + tipo producto + cantidad + descripción) · WhatsApp CTA secundario.
  - Server action inicial: crea `SupportTicket(kind=B2B_INQUIRY)` + email de notificación + auto-respuesta al cliente.
- **Copy obligatorio**: NO mencionar "factura electrónica DIAN obligatoria" en banner ni en páginas B2B hasta que Lucams efectivamente esté en régimen como facturador electrónico (ver `[1.8]`). Usar "documentación tributaria (cuenta de cobro o factura electrónica según corresponda)".
- **Rationale**: cliente individual y empresa chica compran directo; empresa grande necesita cotización personalizada. Mantener visibilidad pública del catálogo B2B sin obligar flujo aparte para todos.
- **Implica**:
  - Nuevo modelo inicial: `SupportTicket.kind` enum suma `B2B_INQUIRY` (hoy evolucionado a `Contact` + `Opportunity` + `Quote`).
  - Página de captación corporativa + form server action.
  - Banner condicional en `/productos/publicitarios`.
- **Admin**: gestión comercial desde `/admin/oportunidades` y `/admin/cotizaciones` (además de `/admin/soporte`).

---

### [1.7] Riesgo legal Coleccionables Universos asumido (2026-05-15)

- **Decisión**: Lucams comercializa diseños inspirados en propiedad intelectual de terceros (Harry Potter / Pokémon / Star Wars / Marvel / DC / Disney/Pixar / Anime Retro / Cartoons 90s) en sub-categorías Universos de Coleccionables y Separadores.
- **Asunción**: riesgo legal aceptado por dirección. Lucams opera como e-commerce pequeño en arranque; práctica común en mercado colombiano e internacional; filtrar al cliente sería demasiada fricción.
- **Trigger de reapertura**:
  - Si llega cease & desist o demanda formal de algún titular → retirar inmediatamente sub-cat afectada + reabrir esta decisión.
  - Si volumen anual de Universos justifica licencia oficial ($5k-50k USD/año + royalty 8-15%) → evaluar licenciar antes del próximo año fiscal.
- **Diferenciación con casos previos**: la decisión Snoopy del 2026-05-12 fue DESCARTAR. Acá se INVIERTE esa lógica para el resto: si dirección lo decide y asume el riesgo, se opera.
- **Implica**:
  - Sub-categorías Universos en `coleccionables` y `separadores` con productos asociados.
  - Nota interna en [`COMPLIANCE.md`](COMPLIANCE.md) documentando la decisión + trigger de reapertura.
  - Cuando llegue cease & desist: soft-delete inmediato de productos afectados + ocultar sub-cat + ADR de cierre.
- **Admin**: capacidad de archivar sub-cat completa + todos sus productos en 1 click (Área 8) para reaccionar rápido si llega notificación legal.

---

### [1.8] Control DIAN proactivo en admin (2026-05-15)

> **Estado vigente en código:** las filas propuestas en `SiteSetting` no se crearon; la preparación tributaria DIAN vive estructurada directamente en `Order` (`DocumentType`, `TaxResponsibility`, `DianStatus`) detrás de la bandera `BILLING_DOCUMENT_ENABLED = false` en `apps/web/features/checkout/billing-document.ts` (`ADR-160`, ver [`COMPLIANCE.md`](COMPLIANCE.md)).

- **Decisión**: admin Lucams contempla control tributario con alerta proactiva basada en umbral DIAN.
- **Settings originales previstos** (categoría `FACTURACION` en `SiteSetting`):

| Setting                             | Tipo    | Default                              | Descripción                                                  |
| ----------------------------------- | ------- | ------------------------------------ | ------------------------------------------------------------ |
| `DIAN_FACTURADOR_ELECTRONICO`       | BOOLEAN | `false`                              | ¿Lucams registrada como facturador electrónico?              |
| `DIAN_REGIMEN`                      | TEXT    | `persona_natural_no_responsable_iva` | Régimen tributario actual                                    |
| `DIAN_UMBRAL_UVT_ANUAL`             | NUMBER  | `3500`                               | Umbral UVT obligatorio facturación (configurable)            |
| `DIAN_VALOR_UVT_COP`                | NUMBER  | `[UVT 2026 pendiente verificación]`  | Valor en COP de 1 UVT año fiscal actual                      |
| `DIAN_INGRESOS_ANUALES_REGISTRADOS` | NUMBER  | `0`                                  | Acumulado año fiscal (manual hoy, auto cuando exista Orders) |
| `DIAN_PROVEEDOR_FACTURACION`        | TEXT    | _vacío_                              | Alegra / Siigo / Facture / otro cuando activado              |

- **Card original prevista en `/admin/dashboard`**: "Estado tributario DIAN" con 4 niveles de alerta:

| % vs umbral | Color       | Acción                          |
| ----------- | ----------- | ------------------------------- |
| < 60%       | 🟢 verde    | Operación bajo umbral           |
| 60-80%      | 🟡 amarillo | Empieza a planear registro DIAN |
| 80-100%     | 🟠 naranja  | Crítico, activa este trimestre  |
| > 100%      | 🔴 rojo     | OBLIGATORIO, contacta contador  |

- **Email alerta mensual previsto**: `pg_cron` día 1 a las 8am COT manda email cuando `ingresos ≥ 60% × umbral`.
- **Auto-cálculo**: sobre `Order.status IN (PAID, AWAITING_FULFILLMENT, SHIPPED, DELIVERED)` sumando `Order.total` del año fiscal.
- **Rationale**: el sitio público no debe prometer "factura electrónica DIAN" hasta que Lucams esté efectivamente obligada o decida operativizarlo.
- **Implica**:
  - Documentar régimen y umbrales DIAN en [`COMPLIANCE.md`](COMPLIANCE.md).
  - Mantener `BILLING_DOCUMENT_ENABLED = false` hasta contar con resolución DIAN y proveedor tecnológico activo.
- **Admin**: monitoreo de ingresos reales en `/admin/finanzas` y `/admin/metricas`.

---

### [1.9] Principio rector — Dos caminos visibles en cada categoría (2026-05-15)

- **Decisión**: cada categoría del catálogo presenta DOS caminos visibles al cliente desde el primer momento.
  - **Camino 1 — Diseños listos**: grid visual de plantillas / packs prediseñados disponibles. Cliente compra tal cual (Coleccionables, Juegos) o elige como base (Fotoimanes, Recuerdos) y completa solo datos mínimos.
  - **Camino 2 — Personaliza tu propio**: CTA "Personaliza desde cero" → estudio canvas vacío.
- **Distribución por categoría**:
  - Categorías 100% Camino 1: Coleccionables, Juegos y Aprendizaje (sin estudio).
  - Categorías mixtas: Fotoimanes, Recuerdos, Calendarios, Publicitarios, Organización, Cajas Regalo, De Temporada, Cuadros, Separadores.
- **Rationale**: la tienda no es solo "personalización" — es también catálogo de diseños listos para clientes que no quieren personalizar (mayor conversión, menor fricción). El editor es opción premium, no obligación.
- **Implica**:
  - PDP rediseñado (Área 2-4): sección "Plantillas disponibles" con grid + click aplica plantilla pre-cargada en `/estudio/[slug]?template=<slug>`.
  - Pool prediseñado (Área 5): para categorías 100% Camino 1, flujo "Agregar al carrito" directo sin pasar por estudio.
  - Editor (existente): recibe `?template=<slug>` query y arranca con plantilla pre-aplicada.
  - Cada plantilla necesita thumbnail real curado.
- **Acción creativa de activos (Área 5 / 8)**: generación curada de ilustraciones y miniaturas:
  - Prompts kawaii curados por categoría / sub-categoría / temática.
  - Estructura del `canvasData` JSON por plantilla: qué áreas quedan **editables** (slot foto, texto del cliente, campos del evento) vs **fijas** (decoraciones, frame, background).
  - Convenciones de tamaño / aspect ratio / resolución para Konva.
- **Admin**:
  - Gestión de plantillas desde `/admin/plantillas` (`PersonalizationTemplate`) y galería `/admin/disenos` (`DesignGalleryImage`).
  - Reorder de plantillas y subida de thumbnail.

---

### [2.1] Slugs modulares agnósticos de cantidad/tamaño (2026-05-15)

> **Estado vigente en código:** las redirecciones 301 viven centralizadas y administrables en la tabla `UrlRedirect` (`/admin/redirects`) y se resuelven en `apps/web/proxy.ts`.

- **Decisión**: los slugs de productos NO contienen cantidad ni tamaño hardcoded. Esos atributos viven en variants (multi-dim ya cerrado Fase B).
- **Renombres**:

| Slug actual                           | Slug nuevo                    |
| ------------------------------------- | ----------------------------- |
| `set-12-fotoimanes-polaroid`          | `fotoimanes-polaroid`         |
| `set-12-fotoimanes-cuadrados`         | `fotoimanes-cuadrados`        |
| `set-fotoimanes-circulares`           | `fotoimanes-circulares`       |
| `set-fotoimanes-corazon`              | `fotoimanes-corazon`          |
| `set-glass-magnets-personalizados`    | `fotoimanes-vidrio`           |
| `recuerdos-cumpleanos-x20`            | `recuerdos-cumpleanos`        |
| `recuerdos-bautizo-x12`               | `recuerdos-bautizo`           |
| `recuerdos-graduacion-x20`            | `recuerdos-graduacion`        |
| `imanes-publicitarios-rectos-7x5`     | `publicitarios-rectangulares` |
| `imanes-publicitarios-circulares-6cm` | `publicitarios-circulares`    |
| `pack-empresarial-mixto-100`          | `publicitarios-pack-mixto`    |
| `cuadro-15x15-con-foto`               | `cuadro-con-foto`             |
| `cuadro-frase-personalizada-20x20`    | `cuadro-con-frase`            |
| `mini-calendarios-x10`                | `mini-calendarios`            |
| `pack-separadores-libros`             | (soft-deleted, ver `[2.7]`)   |

- **Implica**: 15 redirects 301 desde slug viejo → nuevo en `proxy.ts` + `UrlRedirect`. Preserva SEO y enlaces compartidos.
- **Admin**: cuando admin renombra un producto, registra el redirect 301 en `/admin/redirects`.

---

### [2.2] Vidrio se mantiene como sub-categoría de Fotoimanes (2026-05-15)

- **Decisión**: "Vidrio" (Glass Magnets) sigue siendo sub-cat propia dentro de Fotoimanes. Slug `fotoimanes-vidrio`.
- **Rationale**: material físicamente distinto (cristal con magnificación natural vs PET laminado), precio sustancialmente más alto, segmento premium tiene búsqueda específica.
- **Implica**: Naming en español unificado (`fotoimanes-vidrio` en lugar de `glass-magnets`).
- **Admin**: gestión normal de sub-cat.

---

### [2.3] Día del Niño en De Temporada (2026-05-15)

- **Decisión**: agregar **Día del Niño** (Abril, último sábado en Colombia) como sub-cat de De Temporada. Total 7 sub-cats estacionales: Día Madre · Día Padre · **Día del Niño** · Amor y Amistad · Halloween · Navidad · Año Nuevo.
- **Rationale**: fecha relevante mercado colombiano, oportunidad de productos infantiles temáticos.
- **Implica**: 1 sub-cat más en seed con `isActive: false` hasta tener producto.
- **Admin**: activa cuando arme producto Día del Niño.

---

### [2.4] Productos faltantes se crean como placeholders inactivos (2026-05-15)

- **Decisión**: los **12 productos faltantes** (Baby Shower + 4 De Temporada nuevas + 7 Separadores temáticos + 8 Coleccionables Universos — restando los que aplican según decisiones siguientes) se crean en seed con `isActive: false`, descripción mínima, imagen provisional.
- **Rationale**: estructura del catálogo queda definida desde día 1. Una sola migración seed = menos riesgo. Se activa producto a producto cuando tenga arte definitivo.
- **Implica**: seed expandido + flag activación incremental.
- **Admin**: toggle `isActive` por producto desde `/admin/productos/[id]`.

---

### [2.5] Caja Sorpresa descartada (2026-05-15)

- **Decisión**: el tratamiento especial de mystery box para `caja-lucams-sorpresa` **se descarta**. Producto se mantiene como variant normal de Cajas Regalo sin composición temática fija.
- **Rationale**: no aporta valor estratégico diferencial hoy. Reabrir si en el futuro se decide explorar fidelización por mystery boxes.
- **Implica**: producto sigue en catálogo, sin renombre, sin tratamiento especial.

---

### [2.6] Universos Coleccionables — 1 producto por universo (2026-05-15)

- **Decisión**: cada universo (Harry Potter, Pokémon, Star Wars, Marvel, DC, Disney/Pixar, Anime Retro, Cartoons 90s) arranca con **1 producto** con variants quantity x4/x6/x9.
- **Rationale**: 24+ productos al inicio sin tracción = inventario muerto. Si universo demuestra demanda, se divide en sub-temas (Casas Hogwarts / Criaturas / Objetos) como productos hermanos.
- **Slug pattern**: `coleccionables-harry-potter`, `coleccionables-pokemon`, etc.
- **Implica**: 8 productos nuevos placeholder `isActive: false` en sub-cats Universos de Coleccionables.
- **Admin**: cuando se decida granularidad, se crean productos hermanos desde `/admin/productos`.

---

### [2.7] Separadores temáticos — `pack-separadores-libros` se divide (2026-05-15)

- **Decisión**: producto genérico actual `pack-separadores-libros` se **soft-deletea**. En su lugar 9 productos temáticos uno por sub-cat:

| Sub-cat                   | Slug nuevo                          |
| ------------------------- | ----------------------------------- |
| Frases Lucams             | `separadores-frases`                |
| Animalitos                | `separadores-animalitos`            |
| Plantas y naturaleza      | `separadores-plantas-y-naturaleza`  |
| Comida bonita             | `separadores-comida`                |
| Universo HP               | `separadores-harry-potter`          |
| Universo Anime            | `separadores-anime`                 |
| Universo Disney           | `separadores-disney`                |
| Personalizables con foto  | `separadores-personalizables-foto`  |
| Personalizables con frase | `separadores-personalizables-frase` |

- **Rationale**: las sub-cats son por TEMÁTICA. Un genérico sin temática no encaja en ninguna. Cada producto temático tendrá sus propias plantillas.
- **Variants**: cada uno con quantity x4 / x6 / x10.
- **Implica**: redirect 301 de `/producto/pack-separadores-libros` → `/productos/separadores`. Seed crea 9 placeholders `isActive: false`.
- **Admin**: gestión normal por producto.

---

### [2.8] Marcos magnéticos — vacíos, no personalizables (2026-05-15)

- **Decisión**: `marcos-magneticos-cuadrados` se renombra a `marcos-magneticos`. Mantiene `personalizationKind = NONE` — son marcos físicos vacíos que el cliente pega al refrigerador e inserta sus propias fotos manualmente.
- **Rationale**: si lo hacemos personalizable con foto subida, se solapa con Fotoimanes. Mantenerlo como producto utilitario (marco físico, sin print) tiene sentido propio.
- **Variants futuros**: forma (cuadrado / corazón / circular) + cantidad (x2 / x4 / x6).
- **Implica**: renombre slug + redirect 301.
- **Admin**: gestión normal.

---

### [2.9] Sub-categorías estacionales vacías con `isActive: false` (2026-05-15)

- **Decisión**: las sub-cats de De Temporada que aún no tienen producto (Día del Niño, Amor y Amistad, Halloween, Año Nuevo) **se crean en DB con `isActive: false`**. No se exponen al cliente hasta que se activen.
- **Rationale**: esqueleto del catálogo definido desde día 1. Evita migraciones futuras. Cliente nunca ve sub-cat vacía.
- **Mejora futura opcional**: campo `Category.activeFrom` + `Category.activeUntil` para auto-toggle por fecha (Área 8).
- **Admin**: activa/desactiva sub-cat desde `/admin/categorias/[id]`.

---

### [2.10] API Catálogo RAG-ready (2026-05-15)

- **Decisión**: replicar patrón de CMS API (`ADR-033`) para catálogo. 5 endpoints públicos + 6 campos nuevos schema + tabla `OcasionTag` + `ADR-038`.

#### Endpoints `/api/catalog/*`

| Endpoint                           | Devuelve                                                                                                                  | Uso esperado bot                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `GET /api/catalog/categories`      | Árbol jerárquico cat → sub-cats con `richDescription`, `useCase`, count productos                                         | "¿Qué categorías tienen?"                   |
| `GET /api/catalog/products`        | Lista paginada filtrable (`?categoria=`, `?subcategoria=`, `?ocasion=`, `?priceMin=`, `?priceMax=`, `?isPersonalizable=`) | "¿Qué tienen para matrimonio bajo 50k COP?" |
| `GET /api/catalog/products/[slug]` | Detalle completo: `richDescription`, `whyChooseThis`, `idealFor`, variants con `description`, plantillas, ocasiones       | "Cuéntame del producto X"                   |
| `GET /api/catalog/ocasiones`       | Ocasiones activas con descripción + productos asociados con `rationale`                                                   | "¿Qué le regalo a mi mamá?"                 |
| `GET /api/catalog/search?q=`       | Búsqueda fuzzy `pg_trgm` sobre nombre + descripción + tags                                                                | "Quiero algo con corazones"                 |

- Cache HTTP `public, max-age=3600`.
- Rate-limit 30/min por IP (patrón CMS).
- Sin auth (público).
- Excluyen datos sensibles: NO se expone `cost`, `margin`, ni datos internos admin.

#### Enriquecimientos schema

**`Product` agrega**:

| Campo             | Tipo                  | Para qué                                                                                  |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| `richDescription` | `String? @db.Text`    | Markdown semántico extenso (300-800 palabras) que el bot usa como contexto                |
| `whyChooseThis`   | `String? @db.Text`    | "¿Por qué elegir este producto?" — bullets cortos                                         |
| `idealFor`        | `Json @default("[]")` | Array de escenarios ideales ("regalo aniversario novia", "decoración cuarto adolescente") |

**`Category` agrega**:

| Campo             | Tipo      | Para qué                                             |
| ----------------- | --------- | ---------------------------------------------------- |
| `richDescription` | `String?` | "¿Qué es esta categoría? ¿Qué incluye? ¿Para quién?" |
| `useCase`         | `String?` | Casos de uso típicos en 2-3 frases                   |

**`ProductVariant` agrega**:

| Campo         | Tipo      | Para qué                                                                                          |
| ------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `description` | `String?` | "¿Por qué elegir esta variante vs otra?" Ej: "Set 12 ideal para baby shower con muchos invitados" |

**Tabla nueva `OcasionTag` + pivot `ProductOcasionTag`** (concretiza decisión `[1.5]`):

```prisma
model OcasionTag {
  id              String   @id @default(cuid())
  slug            String   @unique
  name            String
  description     String   @db.Text  // "Día de la Madre se celebra el 2do domingo de mayo en Colombia..."
  monthHint       Int?     // 1-12, para destacar según mes actual
  isActive        Boolean  @default(true)
  order           Int      @default(0)
  products        ProductOcasionTag[]
}

model ProductOcasionTag {
  productId    String
  ocasionTagId String
  rationale    String?  // "Ideal por X razón" — el bot lo usa para justificar
  @@id([productId, ocasionTagId])
}
```

- **`ADR-038`** documenta arquitectura completa (endpoints, cache, rate-limit, exclusiones, plan futuro `pgvector` con `ADR-036`).
- **Implica**: migración Prisma con 6 campos + 2 tablas + 5 endpoints + 1 ADR.
- **Admin**:
  - `/admin/productos/[id]`: nuevos campos `richDescription` + `whyChooseThis` + `idealFor` con textarea markdown + preview live.
  - `/admin/categorias/[id]`: campos `richDescription` + `useCase`.
  - `/admin/productos/[id]/variants`: campo `description` por variant.
  - `/admin/ocasiones` (nueva pantalla): CRUD tags + asociación múltiple a productos con `rationale`.

---

### [2.11] Principio transversal AI-ready (2026-05-15)

- **Decisión**: principio rector para Áreas 3-8.
- **Enunciado**: "DB es la fuente de verdad. LLM (chatbot futuro Fase 5+) es consumidor que consulta API estructurada — nunca inventa, nunca usa training data como fuente. Cada decisión de catálogo/admin/UX debe responder: ¿puede el bot responder esto correctamente consultando DB sin alucinar?"
- **Implicaciones por área**:
  - **Área 3 (cantidad/tamaño)**: precios y reglas en DB (no en código). Bot consulta "¿cuánto cuesta variant X?"
  - **Área 4 (producto final)**: empaque/material/garantía como campos estructurados. Bot responde "¿qué incluye el Box Día Madre?"
  - **Área 5 (pool prediseñado)**: cada plantilla con descripción + tags + caso de uso. Bot recomienda plantillas.
  - **Área 6 (selección/recomendación)**: lógica se apoya en `ocasiones` + `idealFor` + variant `description`. Bot usa mismas reglas vía API.
  - **Área 7 (filtros)**: filtros disponibles vía API. Bot sugiere "puedes filtrar por X" o ejecuta filtro y devuelve resultados.
  - **Área 8 (admin)**: admin edita datos → DB se actualiza → bot ve cambio en máx 1h (cache TTL).
- **Criterio de validación**: ninguna decisión futura cierra sin haber respondido "¿esto es queryable por bot vía API estructurada?".

---

### [3.1] Polaroid refactor a multi-dim limpio (2026-05-15)

> **Estado vigente en código:** además de las combinaciones multidimensionales de cantidad × tamaño, operan en producción las variantes gemelas **«Sin imán» (`-NOMAG`, `ADR-099`)** en referencias fotográficas seleccionadas (ver [`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

- **Decisión**: `fotoimanes-polaroid` refactoreado a **9 variants** = 3 cantidades (6 / 12 / 20) × 3 tamaños (6×8 / 7×9 / 4×5 mini). Combinaciones no producibles físicamente quedan con `isActive: false`.
- **Rationale**: hoy son 4 variants con cantidad y tamaño acoplados (Set 6 → 7×9, Set 12 → 6×8, Set 20 → 4×5 mini). Va contra el principio modular cerrado en `[2.1]`. Cliente debe poder pedir "6 unidades 6×8".
- **Implica**: refactor del seed + decidir qué combinaciones quedan activas (ej. probable que Set 20 mini solo en 4×5 por economía de producción).
- **Admin**: activa/desactiva combinaciones desde el editor de variantes.

---

### [3.2] Pricing único `LINEAR` (2026-05-15)

> **Estado vigente en código:** el precio retail base sigue directo en `ProductVariant.price` (centavos COP enteros `Int`), complementado hoy con escalas de descuento por volumen en **`WholesaleTier`** (`/admin/mayorista`) cuando el producto las define (ver [`domains/catalog-and-cms.md`](domains/catalog-and-cms.md)).

- **Decisión**: precios viven directos en `ProductVariant.price` (COP centavos). Sin fórmulas arbitrarias en runtime.
- **Rationale**: arranque simple. Cuando B2B exige tiers (ej. 50u = -5%, 100u = -10%, 200u = -15%), se suma el modelo explícito de tramos por volumen (`WholesaleTier`).
- **Implica**: `ProductVariant.price` declara el precio base absoluto por variante en centavos COP.
- **Admin**: edita precio por variant desde `/admin/productos/[id]/variants` y tramos por volumen desde `/admin/mayorista`.

---

### [3.3] `Product.minimumQuantity` y `maximumQuantity` en schema (2026-05-15)

- **Decisión**: sumar 2 campos a `Product`:
  - `minimumQuantity: Int? @default(1)` — mínimo de unidades (línea de cart) que un cliente puede pedir.
  - `maximumQuantity: Int?` — máximo opcional (null = sin tope).
- **Rationale**: hoy `personalizationSchema.minQuantity` existe pero embebido en JSON arbitrario. Para que sea consultable por bot + validable cart-side, debe ser columna estructurada.
- **Implica**: migración Prisma. Validación cart action `addToCartAction` rechaza si `qty < minimumQuantity` con mensaje claro. Bot puede responder "Recuerdos Matrimonio requiere mínimo 30 unidades".
- **Admin**: edita ambos desde `/admin/productos/[id]`.

---

### [3.4] Sugerencias de cantidad por ocasión (2026-05-15)

- **Decisión**: agregar a `OcasionTag` (creada en `[2.10]`) el campo `suggestedQuantityRange: Json` con shape `{ min: int, ideal: int, max: int }`.
- **Rationale**: bot puede responder "Para matrimonio promedio (~80 invitados) recomendamos variant x80, o aumentar a x100". Se cargan rangos típicos por ocasión.
- **Ejemplos** (cargados en seed inicial):
  - Cumpleaños: `{ min: 10, ideal: 20, max: 40 }`
  - Matrimonio: `{ min: 30, ideal: 80, max: 150 }`
  - Baby Shower: `{ min: 12, ideal: 25, max: 50 }`
  - Empresarial: `{ min: 50, ideal: 100, max: 500 }`
- **Implica**: 1 campo más en migration de `OcasionTag` (decisión `[2.10]` lo absorbe).
- **Admin**: edita rangos desde `/admin/ocasiones`.

---

### [3.5] Coleccionables uniformes con variants x4/x6/x9 (2026-05-15)

- **Decisión**: TODOS los productos de Coleccionables (6 Lucams + 8 Universos = 14 productos) tienen el mismo set de variants quantity x4 / x6 / x9 unidades.
- **Rationale**: uniformiza UX (cliente entiende: "siempre puedo elegir entre 4, 6 o 9 imanes del pack"). Permite comprar Coleccionables como regalo pequeño (x4) o set completo (x9).
- **Implica**: refactor seed de los 6 packs Lucams existentes + 8 Universos nuevos con variants desde el inicio.
- **Admin**: variants estándar gestionables desde `/admin/productos`.

---

### [3.6] Planners sin variants (2026-05-15)

- **Decisión**: planners (semanal, mensual, diario) son producto unitario sin variants múltiples.
- **Rationale**: comprar 2 planners semanales iguales tiene poco sentido funcional. Si se solicitan packs ("regalo set 3 planners distintos a una colega"), se suma después como producto bundle separado.
- **Implica**: ningún cambio. Permanecen como producto único.
- **Admin**: sin tratamiento especial.

---

### [3.7] Sin `ProductVariant.surcharge` separado (2026-05-15)

- **Decisión**: `ProductVariant.price` es precio absoluto del variant. Sin campos extra de upcharge / surcharge / multiplicador.
- **Rationale**: KISS. Cualquier diferencial de acabado se refleja directo en `price`. Si más adelante se complejiza (descuentos cruzados, bundles), se evalúa `PricingRule` separado (decisión `[3.8]`).
- **Implica**: ningún cambio de schema.
- **Admin**: edita `price` por variant.

---

### [3.8] `PricingRule` reservada como concepto futuro (2026-05-15)

- **Decisión**: tabla `PricingRule` (descuentos cruzados, bundle pricing complejo) NO se implementa hoy. Se mantiene reservada para retomar solo si el volumen real lo justifica.
- **Rationale**: principio YAGNI ("You Aren't Gonna Need It"). El pricing promocional y por volumen actual se resuelve limpiamente con `Coupon` (`[3.9]`) y `WholesaleTier` (`[3.2]`).
- **Implica**: ningún cambio hoy.

---

### [3.9] Cupones Fase 1 productivos (2026-05-15)

> **Estado vigente en código:** operativo en producción; en el storefront el campo de código promocional se valida y aplica en **`/checkout/pago`** (no en `/carrito`), reforzado con trigger SQL para `maxUsesPerCustomer` y trazabilidad en `CouponUsage` (ver [`domains/checkout-payments-shipping.md`](domains/checkout-payments-shipping.md)).

- **Decisión**: sumar al `Coupon` model existente 6 campos + tabla `CouponUsage` + endpoint `/api/coupons/public` + admin `/admin/cupones`.

#### Campos nuevos en `Coupon`

| Campo                   | Tipo                      | Para qué                                         |
| ----------------------- | ------------------------- | ------------------------------------------------ |
| `appliesToCategories`   | `String[]`                | Slugs de categorías; vacío = todas               |
| `appliesToProductSlugs` | `String[]`                | Slugs de productos específicos; vacío = todos    |
| `maxUsesPerCustomer`    | `Int?`                    | Null = ilimitado por cliente                     |
| `isPublic`              | `Boolean @default(false)` | Visible en API pública / bot informa             |
| `description`           | `String?`                 | Texto público "10% off Día Madre, vence 12 mayo" |
| `requiresMinQuantity`   | `Int?`                    | "Compra 6+ unidades y 10% off"                   |

#### Tabla nueva `CouponUsage`

```prisma
model CouponUsage {
  id          String    @id @default(cuid())
  couponId    String
  coupon      Coupon    @relation(fields: [couponId], references: [id])
  customerId  String?
  customer    Customer? @relation(fields: [customerId], references: [id])
  orderId     String    @unique
  order       Order     @relation(fields: [orderId], references: [id])
  appliedAt   DateTime  @default(now())
  amount      Int       // descuento aplicado en COP centavos
  @@index([customerId, couponId])
}
```

#### Tipos soportados (Fase 1)

- `PERCENT` — descuento porcentual sobre subtotal
- `FIXED` — descuento monto fijo en COP
- `FREE_SHIPPING` — envío gratis

#### Restricciones soportadas (Fase 1)

- Por categoría / sub-categoría (string match slug)
- Por producto específico (slug match)
- Mínimo orden COP (`minOrder`)
- Mínimo cantidad unidades en cart (`requiresMinQuantity`)
- Vigencia fecha desde/hasta (`validFrom` / `validTo`)
- Max usos totales (`maxUses`)
- Max usos por cliente (`maxUsesPerCustomer`)

#### Endpoint AI-ready

`GET /api/coupons/public` retorna cupones `isPublic=true && isActive && now BETWEEN validFrom AND validTo`. Bot consulta y responde "Hay descuento MAMA2026 -15% vigente hasta 12 mayo".

**Bot NUNCA inventa códigos** — solo informa los que ve en DB.

#### UI cliente

- Input "¿Tienes un código?" en `/checkout/pago`
- Server action valida + aplica + crea `CouponUsage` al confirmar order
- Resumen del pedido muestra descuento aplicado
- Auto-apply opcional vía URL `?promo=CODE` (futuro)

#### Admin `/admin/cupones`

- Lista paginada con filtros (activo / expirado / pausado / agotado)
- Form crear / editar: code (auto uppercase + slug-safe), tipo, valor, restricciones (multi-select categorías + productos), mínimos, vigencia, max usos
- Métricas básicas por cupón: % utilización, total descontado COP, top clientes que lo usaron
- Botón "Pausar" (sin eliminar)

#### NO incluido en Fase 1 (futuro)

- Bundle 2x1 / 3x2 (requiere lógica compleja de combinación de ítems)
- Welcome coupon automático al signup (`ADR-031`)
- Códigos únicos one-time personalizados por cliente
- QR en empaque físico
- Cupones encadenados / multi-uso simultáneo

- **Implica**:
  - Migración Prisma: 6 campos + 1 tabla.
  - Endpoint público + admin CRUD + UI en checkout.
  - Validación + creación de `CouponUsage` al confirmar order (cruza con Fase 4 checkout).
- **Admin**: pantalla completa `/admin/cupones`.

---

### [4.1] `Product.physicalSpecs` Json estructurado (2026-05-15)

- **Decisión**: sumar a `Product` campo `physicalSpecs: Json` validado con Zod schema.
- **Shape**:
  ```ts
  {
    material: string;           // "PET laminado mate" / "Vidrio premium 3mm" / "Cartón rígido"
    thicknessMm: number;        // grosor físico imán
    magnetType: "FRIDGE" | "POSTER" | "WHITEBOARD";
    weightGrams: number;        // para cálculo envío
    packaging: "STANDARD_BAG" | "GIFT_BOX" | "BULK_BOX";  // ver [4.4]
    includes: string[];         // ["6 imanes 5×5cm", "Tarjeta personalizada", "Sticker Lucams"]
    careInstructions?: string;  // microcopy cuidado
    countryOfOrigin: "CO";      // siempre Colombia
  }
  ```
- **Rationale**: hoy información dispersa en `description` + `personalizationSchema`. Estructurarla permite (a) cumplir Ley 1480 art. 23 con datos completos, (b) que el bot AI-ready responda exacto, (c) que el cliente vea ficha técnica clara.
- **Implica**: migración Prisma + Zod schema en `features/products/physical-specs-schemas.ts`. Render en PDP como sección "Ficha técnica".
- **Admin**: edita campos individuales desde `/admin/productos/[id]` con UI tipada (no JSON crudo).

---

### [4.2] Garantía + tiempos directo en `Product`

- **Decisión**: sumar 3 campos a `Product`:
  - `warrantyMonths: Int @default(1)` — término informado para ese producto (1..120 meses)
  - `productionDays: Int @default(3)` — días hábiles producción
  - `shippingDaysMin: Int @default(2)` y `shippingDaysMax: Int @default(5)` — días hábiles envío
- **Rationale**: campos estructurados queryables por bot + visibles al cliente en PDP. La garantía se comunica antes de comprar y el plazo de cada venta se sella en `OrderItem.warrantyMonths`, para que una edición posterior no reduzca derechos adquiridos.
- **Implica**: migración Prisma; render PDP muestra el plazo de garantía configurado. El bot responde el valor de la ficha vigente; los reclamos usan el snapshot de la orden. Los tiempos de preparación y tránsito se informan como estimaciones separadas, no como fecha garantizada.
- **Admin**: edita por producto desde `/admin/productos/[id]`, con mínimo 1 mes y máximo 120.

---

### [4.3] `physicalSpecs.includes` como array estructurado (2026-05-15)

- **Decisión**: `physicalSpecs.includes` es array de strings, no markdown libre.
- **Rationale**: bot puede listar exacto. PDP renderiza como bullets visuales con check verde. Cliente no se sorprende al recibir.
- **Implica**: Zod valida `z.array(z.string().max(80)).min(1)`. UI admin con add/remove items.
- **Admin**: input dinámico tipo "tags" desde `/admin/productos/[id]`.

---

### [4.4] 3 tipos de empaque estandarizados (2026-05-15)

- **Decisión**: enum `PackagingType` con 3 valores:
  - `STANDARD_BAG` — Bolsa kraft + sticker Lucams. Para Fotoimanes simples, packs chicos, Coleccionables, Separadores.
  - `GIFT_BOX` — Caja regalo kawaii con cinta. Para Cajas Regalo, De Temporada, Cuadros, Box Día Madre/Padre.
  - `BULK_BOX` — Caja grande sin decoración. Para Publicitarios B2B, Recuerdos x50+, Pack Empresarial.
- **Rationale**: simplifica producción + comunicación. Cliente ve tipo de empaque en PDP (y puede marcar `Order.isGift` en checkout). Bot responde "Llega en bolsa kraft con sticker Lucams" o "Llega en caja regalo kawaii con cinta".
- **Implica**: enum Prisma + representación estructurada en ficha técnica.
- **Admin**: select del enum por producto desde `/admin/productos/[id]`.

---

### [4.5] Información impresa física al cliente (proceso operativo) (2026-05-15)

- **Decisión**: cada paquete físico incluye estándar:
  - Tarjeta de agradecimiento Lucams kawaii.
  - Acceso a `/pedido/[token]` / `/rastrear` para seguimiento y posventa.
  - Sticker exclusivo Lucams (uno aleatorio de la línea Coleccionables).
  - Microcopy: "Si algo no te llegó perfecto, te respondemos en hola@lucamsshop.com · WhatsApp oficial".
- **Rationale**: experiencia de unboxing diferencial. Trust building + retención. Sticker fomenta colección.
- **Implica**: NO es schema. Es proceso operativo de empaque y despacho (ver [`OPERATIONS.md`](OPERATIONS.md)).
- **Admin**: configura microcopy y canales desde `/admin/contenido/configuracion`.

---

### [4.6] Garantía por producto

- **Decisión**: el catálogo inicia con 1 mes y Admin puede configurar un plazo mayor por producto. La Ley 1480 art. 8 exige informar el término anunciado; si no se anunciara, aplicaría el supletorio de 1 año. Personalizar el producto no elimina la garantía por defecto.
- **Rationale**: ofrece flexibilidad comercial sin promesas ambiguas ni reducción retroactiva: el plazo informado en la compra queda guardado por ítem (`OrderItem.warrantyMonths`).
- **Implica**: `/legal/garantias` describe la regla; la ficha y el email de confirmación muestran el término aplicable. La garantía cubre defectos de fabricación, materiales o impresión.
- **Admin**: puede ajustar `warrantyMonths` entre 1 y 120 para ventas futuras; por ejemplo, 18 meses para un producto premium.

---

### [4.7] Tracking visible al cliente — dependencia Fase 4 (2026-05-15)

> **Estado vigente en código:** el seguimiento granular (`ShipmentEvent` alimentado por webhook + `tracking-sync`) está activo tanto en `/mi-cuenta/pedidos/[number]` como sin cuenta en **`/pedido/[token]`** y **`/rastrear`** (ver [`domains/post-sale-and-support.md`](domains/post-sale-and-support.md)).

- **Decisión**: cuando exista `Order` (Fase 4) + Aveonline integrado (`[4.10]`), cada order tiene `trackingUrl` e historial de transporte que se envía por email + visible en `/mi-cuenta/pedidos/[number]` y `/pedido/[token]`.
- **Rationale**: cliente puede consultar status sin pedir por WhatsApp. Reduce carga soporte. Cumple Ley 1480 (transparencia entrega).
- **Implica**: articulado con `Order` y el adaptador logístico de `[4.10]`.
- **Admin**: ve tracking status desde `/admin/pedidos/[number]` con enlace directo a la guía y eventos `ShipmentEvent`.

---

### [4.8] Productos NONE con `productionDays: 1` (2026-05-15)

- **Decisión**: productos con `personalizationKind = NONE` (Coleccionables, Juegos, referencias en stock sin personalización) tienen `productionDays: 1` (listos para despachar al siguiente día hábil).
- **Rationale**: diferenciador comercial real. Cliente prefiere "llega rápido" en productos listos. Empuja conversión hacia referencias estándar.
- **Implica**: seed declara `productionDays: 1` para Coleccionables + Juegos.
- **Admin**: si se agota stock inmediato, puede ajustar `productionDays` a 3-5 días desde `/admin/productos/[id]` hasta reabastecer.

---

### [4.9] AI-ready: `physicalSpecs` queryable por bot (2026-05-15)

- **Decisión**: API `/api/catalog/products/[slug]` (decisión `[2.10]`) incluye en su payload el `physicalSpecs` completo + `warrantyMonths` + `productionDays` + `shippingDaysMin/Max`.
- **Rationale**: cumple principio `[2.11]` (DB = fuente de verdad). Bot responde:
  - "¿De qué material es el Fotoimán Polaroid?" → lee `physicalSpecs.material`.
  - "¿Cuánto demora en llegar?" → calcula `productionDays + shippingDaysMin/Max`.
  - "¿Qué incluye el Box Día Madre?" → lista `physicalSpecs.includes`.
  - "¿Tiene garantía?" → lee `warrantyMonths`.
- **Implica**: endpoint de `[2.10]` enriquecido con los campos físicos y de garantía.
- **Admin**: edita en `/admin/productos/[id]`.

---

### [4.10] Logística Aveonline como proveedor primario + interface `ShippingProvider` (2026-05-15)

> **Estado vigente en código:** implementado en `apps/web/features/shipping/` junto con la mensajería interna para Bogotá **«Envío Lucams» (`LUCAMS`)**, reglas de peso real vs volumétrico por transportadora, ofertas de flete selladas con HMAC, doble compuerta `AVEONLINE_GENERATE_REAL` en `generarGuia2`, archivo propio de rótulos PDF en el bucket privado `production-assets`, webhook en **`/api/webhooks/aveonline`** y sincronización activa cada 15 min vía **`/api/cron/tracking-sync`** (ver [`integrations/aveonline.md`](integrations/aveonline.md)).

- **Decisión**: operar con **Aveonline** (agregador multi-carrier colombiano: Servientrega, Envia, TCC, Coordinadora, Domina, Interrapidísimo, Saferbo) detrás de interface `ShippingProvider` (`ADR-039`) para permitir coexistencia con mensajería propia o swap futuro.
- **Rationale**:
  - **Multi-carrier permite al cliente elegir flete más barato** → conversión sube en mercado colombiano sensible al precio del envío.
  - **Cobertura nacional amplia con COD** (contraentrega).
  - **Resiliencia**: si un carrier tiene contingencia operativa, Lucams sigue despachando con otro.
  - **Oferta curada** desde admin (qué transportadoras habilitar).
- **API design verificado**:
  - Base URL `https://app.aveonline.co/api`.
  - Auth JWT con caché y refresco server-side.
  - Endpoints: autenticación, cotización multi-carrier (`cotizarDoble`), generación de guía (`generarGuia2`), tracking, solicitud de recogida y webhook de estados.
  - Estilo RPC POST encapsulado detrás de `ShippingProvider`.
- **Riesgos mitigados**:
  - Token temporal → caché + auto-refresh.
  - Webhook → validación de token/secreto + verificación de existencia de guía + avance de estados registrado en `ShipmentEvent` + reconciliación activa por `tracking-sync`.
  - Rótulos PDF efímeros en Aveonline → copia archivada en Storage propio (`production-assets`).
- **`ADR-039`** y [`integrations/aveonline.md`](integrations/aveonline.md) documentan la arquitectura completa (interface, pesos, empaque apilado, caché, circuit breaker, manejo de errores y fallback).
- **Implica**:
  - `features/shipping/` con `ShippingProvider` interface (`quote`, `createShipment`, `getTracking`, `getLabel`, `handleWebhook`).
  - Campos logísticos en `Order` + historial granular en `ShipmentEvent`.
  - Webhook `/api/webhooks/aveonline` + cron `/api/cron/tracking-sync` cada 15 min.
- **Admin**:
  - `/admin/envios` y `/admin/integraciones`: configuración de transportadoras habilitadas, origen y parámetros logísticos.
  - `/admin/pedidos/[number]`: ver transportadora elegida, estados de guía y descargar rótulo PDF.

---

### [5.1] `PersonalizationTemplate.kind` flag (EDITABLE | PREMADE) (2026-05-15)

> **Estado vigente en código:** el modo `PREMADE` sin paso por el Estudio fue retirado del storefront en `ADR-090` (0 plantillas activas, 0 consumidores); hoy `PersonalizationTemplate` opera como plantilla editable en el Estudio (`TemplateMode`) y el repertorio de artes listos se sirve mediante la galería curada **`DesignGalleryImage`** (`/admin/disenos`, `ADR-158`, ver [`domains/studio-and-production.md`](domains/studio-and-production.md)).

- **Decisión**: extender `PersonalizationTemplate` con distinción inicial `EDITABLE` vs `PREMADE`:
  - `EDITABLE` — base de diseño que el cliente selecciona en el estudio y completa con sus datos (foto, texto). Camino 1 con plantilla pre-cargada (decisión `[1.9]`).
  - `PREMADE` — diseño ya cerrado pensado originalmente para compra sin estudio.
- **Rationale**: schema unificado bajo un mismo CRUD administrativo; la diferencia era el comportamiento de entrada al Estudio.
- **Implica**: queries del Estudio filtran plantillas activas aplicables al producto.
- **Admin**: gestión desde `/admin/plantillas` y `/admin/disenos`.

---

### [5.2] Producto NONE ↔ N templates PREMADE asociados (2026-05-15)

> **Estado vigente en código:** retirado junto con el flujo `PREMADE` en `ADR-090`; los productos con `personalizationKind = NONE` se agregan directamente al carrito por `ProductVariant` estándar, mientras que en los productos personalizables el cliente puede elegir ilustraciones de `DesignGalleryImage` dentro del Estudio.

- **Decisión original**: cada producto con `personalizationKind = NONE` podía asociar `N` plantillas `PREMADE` seleccionables en PDP sin abrir el Estudio.
- **UX original**:
  - Cliente entra a la ficha del producto temático.
  - Elige diseño + selector de cantidad `x4/x6/x9`.
  - Clic en "Agregar al carrito" directo sin pasar por estudio.
- **Rationale**: buscaba agrupar varios artes bajo un único producto temático.
- **Admin**: hoy gestiona variantes directas en `/admin/productos/[id]` y artes de galería en `/admin/disenos`.

---

### [5.3] Diseño en línea de carrito — NO en `ProductVariant` (2026-05-15)

> **Estado vigente en código:** `ProductVariant` permanece 100 % agnóstico del arte y cada línea personalizada en `CartItem` / `OrderItem` referencia directamente su entidad `Design` (`designId`).

- **Decisión**: `ProductVariant` lleva solo dimensiones agnósticas (cantidad, tamaño, forma, acabado, soporte con/sin imán). El diseño creado o elegido por el cliente vive referenciado en la línea del carrito (`CartItem`), nunca multiplicando variantes.
- **Rationale**: evita explosión combinatoria de variantes (p. ej. 9 diseños × 3 cantidades siguen siendo solo 3 `ProductVariant`).
- **Implica**: `CartItem` muestra la vista previa del diseño asociado (`/api/design-preview/*`).
- **Admin**: en `/admin/pedidos/[number]` visualiza exactamente el diseño comprado y descarga su render 300 DPI.

---

### [5.4] Arranque ~30 prediseñados, escalar según tracción (2026-05-15)

- **Decisión**: NO lanzar con 100+ diseños de golpe; arrancar con un lote curado y escalar según demanda real:
  - **Coleccionables Lucams** (6 productos): ~3 diseños cada uno.
  - **Coleccionables Universos** (8 productos): ~1 diseño base cada uno.
  - **Separadores Lucams** (4 productos): ~2 diseños cada uno.
  - **Separadores Universos** (3 productos): ~1 diseño cada uno.
  - **Plantillas editables Camino 1** (Fotoimanes, Recuerdos, Calendarios): ~2 por sub-categoría.
- **Rationale**: validar conversión antes de producir centenares de activos; las ventas reales guían qué líneas expandir.
- **Implica**: curaduría incremental sincronizable entre STG y PRD (`packages/db/scripts/sync-gallery-stg-to-prd.mjs`).
- **Admin**: gestión en `/admin/plantillas` y `/admin/disenos`.

---

### [5.5] Pricing prediseñado igual a personalizable con upcharge configurable (2026-05-15)

> **Estado vigente en código (RETIRADO en `ADR-090` y `ADR-125`):** el flujo `PREMADE` salió del storefront el `2026-09-11` (`ADR-090`) y el recargo porcentual nunca llegó a aplicarse en el cálculo de precios. La columna huérfana `Product.premadeSurcharge` se eliminó del schema, admin, API y seeds en la migración `20261002150000_drop_product_premade_surcharge` (`ADR-125`). Se conserva debajo el consenso original solo por trazabilidad numérica.

- **Decisión original**: por default, precio prediseñado = precio personalizable, contemplando un campo `Product.premadeSurcharge: Int @default(0)` en porcentaje.
- **Rationale original**: no penalizar la comodidad del cliente salvo colecciones especiales con recargo explícito.
- **Implica**: eliminado en `ADR-125`; todo precio vigente proviene de `ProductVariant.price` y `WholesaleTier`.
- **Admin**: sin slider de recargo separado; edita precios directos por variante.

---

### [5.6] Combinar prediseñado + personalizado en mismo cart (2026-05-15)

- **Decisión**: cliente puede agregar al mismo carrito ítems personalizados (con Estudio) + productos estándar (sin Estudio) + variantes distintas sin restricciones.
- **Rationale**: máxima flexibilidad UX. Cliente puede comprar un producto físico directo + unos Fotoimanes Polaroid personalizados con sus fotos en un único checkout.
- **Implica**: `CartItem` soporta coexistencia limpia de líneas con `designId` y líneas estándar (`designId = null`).

---

### [5.7] Canvas PREMADE = 1 capa image simple (2026-05-15)

> **Estado vigente en código:** cubierto hoy mediante **`DesignGalleryImage`** (`ADR-158`), cuyas ilustraciones curadas se aplican con un clic sobre la cara o lienzo deseado dentro del Estudio.

- **Decisión original**: para artes listos, representar el contenido como una capa de imagen directa sin exigir edición compleja de sub-capas.
- **Rationale**: simplificar tanto la elección del cliente como el render de producción a 300 DPI.
- **Implica**: integrado en el selector «Diseños prediseñados» del Estudio (`ADR-158`).

---

### [5.8] UX dos flujos diferenciados visualmente (2026-05-15)

- **Decisión**: la PDP diferencia con claridad la acción principal según `personalizationKind`:
  - **Producto estándar (`personalizationKind = NONE`)**: selector de variante + botón directo **"Agregar al carrito"**.
  - **Producto personalizable (`personalizationKind ≠ NONE`)**: selector de variante y unidades + CTA **"Personalizar"** hacia `/estudio/[slug]?variant=<id>&copies=<n>` (donde puede elegir plantilla/arte prediseñado o crear desde cero).
- **Rationale**: el cliente entiende de inmediato si el producto se compra directo o se diseña en el Estudio.
- **Implica**: renderizado condicional limpio en la PDP según `personalizationKind`.
- **Admin**: ningún cambio manual adicional (la PDP responde a la configuración del producto).

---

### [5.9] Admin `/admin/plantillas` con filtros + gestión (2026-05-15)

- **Decisión**: consola administrativa en `/admin/plantillas` (complementada por `/admin/disenos` para galería) con:
  - Filtro por modo / tipo de plantilla.
  - Filtro por producto asociado (o globales).
  - Filtro por estado (activo / inactivo).
  - CRUD completo: crear / editar / activar-desactivar / reordenar.
  - Subida de miniatura (`previewUrl`).
- **Rationale**: permite curar, ordenar y depurar el catálogo de plantillas y diseños sin tocar código.
- **Implica**: pantallas operativas en `/admin/plantillas` y `/admin/disenos`.

---

### [5.10] API AI-ready expone templates (2026-05-15)

- **Decisión**: el endpoint `GET /api/catalog/products/[slug]` (decisión `[2.10]`) incluye en su respuesta el arreglo de `templates` activas asociadas al producto (`{ id, slug, name, previewUrl, description, ... }`).
- **Rationale**: cumple el principio `[2.11]` para que cualquier consumidor estructurado conozca las plantillas disponibles de cada producto.
- **Implica**: incluido en `ADR-038` (decisión `[2.10]`).
- **Admin**: ningún paso extra (refleja lo configurado en `/admin/plantillas`).

---

### [6.1] Wizard "ayúdame a elegir" MVP (2026-05-15)

- **Decisión**: flujo guiado de recomendación basado en 4 preguntas clave:
  1. **¿Para qué ocasión?** — selección de tags de ocasión (Cumpleaños, Matrimonio, Día Madre, Empresarial, Para mí mismo, etc.).
  2. **¿Para quién?** — destinatario: mí · pareja · familia · amigo · cliente empresa · niño · adolescente. Filtra `Product.idealFor`.
  3. **¿Cuánto quieres gastar?** — rangos COP: Menos de $30k / $30k-$80k / $80k-$200k / $200k+. Cruza contra el precio de la variante más baja activa del producto.
  4. **¿Personalizable o ya listo?** — personalizable (Estudio) / listo para llevar (`NONE`) / cualquiera. Cruza `personalizationKind`.
- **Output**: grilla de 6-12 productos recomendados ordenados por puntaje. Si hay 0 resultados exactos, invita a relajar el filtro más restrictivo.
- **Rationale**: un visitante indeciso no necesita recorrer las 11 categorías; la guía reduce fricción y orienta el regalo.
- **Implica**: servicio de recomendación en `features/recommendations/` consumiendo `/api/catalog/recommend`.
- **Admin**: alimentado automáticamente por las ocasiones, precios e `idealFor` configurados en catálogo.

---

### [6.2] Algoritmo scoring simple sin ML / embeddings (2026-05-15)

- **Decisión**: puntuación determinista de productos basada en coincidencias explícitas (sin ML opaco ni embeddings externos).
- **Pesos del scoring**:
  - **+3** por coincidencia de tag de ocasión.
  - **+2** por coincidencia de destinatario en `Product.idealFor`.
  - **+1** por coincidencia de rango de precio (`ProductVariant.price` mínimo dentro del rango).
  - **+1** si `Product.isPersonalizable` coincide con la preferencia (o "cualquiera" suma sin penalizar).
  - **+0.5** impulso discreto si `Product.isFeatured = true`.
- **Cutoff**: productos con `score > 2` entran, ordenados descendentemente por `score` y desempate por `createdAt`.
- **Rationale**: simple, transparente, auditable y libre de costos de inferencia.
- **Implica**: módulo puro en `features/recommendations/`.
- **Admin**: controlable mediante curaduría de ocasiones, `idealFor` e `isFeatured`.

---

### [6.3] Cross-sell en cart por ocasión dominante (2026-05-15)

- **Decisión**: bloque **"Completa tu regalo con..."** en el flujo de carrito antes de pasar a pago.
- **Algoritmo**:
  - Detecta la **ocasión dominante** sumando los tags de los productos presentes en el carrito.
  - Sugiere 3-4 productos de **OTRA categoría** que compartan esa ocasión.
  - Excluye productos que ya están en el carrito.
  - Ordena por `isFeatured` y calificación.
- **Ejemplo**: carrito con Recuerdos Matrimonio → sugiere Box Pareja + Cuadro con Foto + Fotoimanes Vidrio.
- **Rationale**: incrementa el ticket promedio (AOV) ayudando a armar un detalle completo.
- **Implica**: sugerencias cruzadas calculadas server-side sobre los ítems actuales del carrito.
- **Admin**: gestionado vía asociación de ocasiones y productos destacados.

---

### [6.4] Productos relacionados PDP con scoring 3 capas (2026-05-15)

- **Decisión**: algoritmo multicapa en la sección **"También te puede gustar"** de la PDP:
  - **Capa 1**: mismas ocasiones (peso 3). "Otros productos para matrimonio".
  - **Capa 2**: misma sub-categoría (peso 2). "Más en Fotoimanes Polaroid".
  - **Capa 3**: misma categoría padre (peso 1). Respaldo general.
- **Excluye**: el producto actual (y productos ya en el carrito cuando aplica).
- **Mostrar**: 4 productos activos.
- **Rationale**: descubrimiento cruzado mucho más relevante que listar solo la misma categoría.
- **Implica**: implementado en `features/products/public-service.ts` (`listRelatedProducts`).
- **Admin**: sin configuración adicional.

---

### [6.5] Recomendaciones por historia cliente — dependencia Fase 4 (2026-05-15)

> **Estado vigente en código:** la recurrencia, segmentación RFM y LTV de margen neto operan hoy sobre el grafo unificado `Contact` en **`/admin/metricas`** y en los segmentos comerciales con consentimiento `MARKETING` Ley 1581 de **`/admin/marketing/segmentos`** (`ADR-193`, ver [`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md)).

- **Decisión**: aprovechar el historial de órdenes confirmadas para sugerencias de recompra y retención:
  - Compraste Fotoimanes Polaroid → afinidad con Cuadro con Foto.
  - Compraste Recuerdos Bautizo → afinidad futura con Recuerdos Primer Año / Cumpleaños.
- **Rationale**: retención y mayor valor de vida del cliente (LTV).
- **Implica**: articulado con `Order`, `Contact` y consentimiento expreso cuando involucra comunicaciones comerciales.
- **Admin**: métricas de recurrencia, cohortes RFM y LTV disponibles en `/admin/metricas` y `/admin/clientes`.

---

### [6.6] Bundles NO en Fase 1 — modelar con cupones y packs (2026-05-15)

- **Decisión**: un armador dinámico de combos (`Bundle Creator`) NO se implementa con tablas complejas separadas en esta etapa.
- **Solución operativa**: se resuelve combinando productos pack dedicados (Cajas Regalo), escalas `WholesaleTier` y cupones segmentados (`Coupon` con `appliesToProductSlugs` / `requiresMinQuantity`, decisión `[3.9]`).
- **Rationale**: KISS + YAGNI; el Bundle Creator interactivo queda agendado en [`ROADMAP.md`](ROADMAP.md) como evolución futura de producto.
- **Implica**: cero complejidad extra en el motor transaccional de carrito hoy.

---

### [6.7] Endpoint `/api/catalog/recommend` AI-ready compartido (2026-05-15)

- **Decisión**: endpoint público que expone el motor determinista de recomendación (`[6.2]`).
- **URL**: `GET /api/catalog/recommend?ocasion=X&destinatario=Y&precioMin=Z&precioMax=W&personalizable=B`.
- **Output**: arreglo de productos recomendados con su `score` y justificación legible ("Coincide por ocasión: matrimonio + rango de precio").
- **Cache HTTP**: `public, max-age=600` (10 min).
- **Rate-limit**: 30/min por IP.
- **Rationale**: principio `[2.11]` — una única lógica en servidor reutilizable por interfaz web y asistentes.
- **Implica**: route handler público + módulo compartido en `features/recommendations/`.
- **Admin**: sin carga operativa adicional.

---

### [6.8] Selección por OCASIÓN desde header (formalización de `[1.5]`) (2026-05-15)

- **Decisión**: la navegación **"Por ocasión"** lleva tanto al listado filtrado `/productos?ocasion=<slug>` como a aterrizajes SEO propios por ocasión.
- **Página dedicada `/ocasion/<slug>`**:
  - Descripción editorial de la ocasión (`OcasionTag.description`).
  - Rango orientativo de unidades (`OcasionTag.suggestedQuantityRange`).
  - Grilla de productos asociados activos.
  - Encabezado semántico optimizado ("Lo mejor para [ocasión]").
- **Rationale**: SEO orgánico de cola larga en Colombia (ej. "recordatorios matrimonio magnéticos Colombia" indexa `/ocasion/matrimonio`) + mejor experiencia de compra temática.
- **Implica**: ruta `app/ocasion/[slug]/page.tsx` con metadatos SEO dinámicos y canonical propio.
- **Admin**: edita descripción, orden y `suggestedQuantityRange` desde `/admin/ocasiones`.

---

### [6.9] `Category.featuredProductSlug` para destacar 1 producto por categoría (2026-05-15)

- **Decisión**: sumar campo `Category.featuredProductSlug: String?` para destacar editorialmente 1 producto insignia por categoría o sub-categoría.
- **UX**: en `/productos/<cat>` y `/productos/<cat>/<subcat>`, el producto destacado recibe prioridad visual con insignia "Destacado".
- **Boost en scoring**: cuando una recomendación incluye varios productos empatados de una categoría, `featuredProductSlug` prioriza el elegido editorialmente.
- **Rationale**: combina criterio comercial humano con el orden automático del catálogo.
- **Implica**: columna en `Category` + selector en el formulario administrativo de categorías.
- **Admin**: selecciona el producto destacado desde `/admin/categorias/[id]`.

---

### [6.10] Analítica de conversión y recomendaciones (2026-05-15)

> **Estado vigente en código:** la tabla individual `RecommendationLog` no se creó; la medición agregada de embudo y conversión libre de cookies y con **cero PII** opera hoy en **`FunnelEventDaily`** (`/api/funnel`) y se consulta en **`/admin/metricas`** (ver [`OBSERVABILITY.md`](OBSERVABILITY.md)).

- **Decisión original**: contemplaba una pantalla `/admin/recomendaciones` respaldada por un modelo `RecommendationLog`:
  ```prisma
  model RecommendationLog {
    id               String    @id @default(cuid())
    sessionId        String    // anon cart session
    customerId       String?
    customer         Customer? @relation(fields: [customerId], references: [id])
    queryType        String    // "wizard" | "crosssell" | "related_pdp" | "api_bot"
    queryParams      Json      // filtros usados
    recommendedSlugs String[]  // productos sugeridos
    clickedSlugs     String[]  // los que recibieron clic
    purchasedSlugs   String[]  // los que terminaron en orden
    createdAt        DateTime  @default(now())
    @@index([sessionId, createdAt])
  }
  ```
- **Métricas objetivo**:
  - Tasa de avance y conversión a lo largo del embudo de compra (`view_product` → `open_studio` → `add_to_cart` → `begin_checkout` → `purchase`).
  - Identificación de productos sin ocasiones asignadas (brechas de catalogación).
  - Desempeño real de productos comprados vs visitados.
- **Rationale**: medir conversión real sin rastreo invasivo ni sobrecarga de filas por sesión.
- **Implica**: implementado de forma agregada y privada por diseño mediante `FunnelEventDaily` + tableros en `/admin/metricas`.

---

### [7.1] Sidebar de filtros con dimensiones combinables + orden (2026-05-15)

- **Decisión**: layout de `/productos` con barra lateral izquierda de `280px` en escritorio y cajón deslizable `<Sheet>` en móvil.
- **Dimensiones de filtro contempladas**:
  1. Categoría (chips)
  2. Sub-categoría (condicional a la categoría activa)
  3. Ocasión (chips multi-selección sobre `OcasionTag`)
  4. Precio (rango COP min-max calculado sobre variantes activas reales)
  5. Personalización (Personalizable / Estándar / Todos)
  6. Forma (Rectangular / Circular / Corazón — cuando aplica al contexto)
  7. Solo con descuento (`compareAtPrice`, toggle)
  8. Destacados (`isFeatured`, toggle)
  9. Disponibilidad en inventario (cuando aplica control de stock)
- **Selector de ordenamiento** sobre la grilla: Recientes / Precio ↑ / Precio ↓ / Más comprados / Destacados.
- **Implica**: componentes de filtrado sincronizados con `searchParams` en `/productos`.

---

### [7.2] Filtros condicionales según contexto (2026-05-15)

- **Decisión**: las facetas disponibles se calculan dinámicamente según las variantes y atributos reales de los productos presentes en el contexto actual (nunca quemadas en código fijo).
- **Ejemplos**:
  - `/productos` global: expone todas las dimensiones con datos.
  - `/productos/foto-imanes`: expone formas variadas porque coexisten Polaroid, Cuadrados, Circulares y Corazón.
  - `/productos/foto-imanes/circulares`: omite "Forma" (todos son circulares) y prioriza tamaño/cantidad.
  - `/productos/recuerdos`: prioriza filtro de cantidad y ocasión del evento.
- **Implica**: cálculo dinámico de facetas complementado por el control manual de `[7.6]`.
- **Admin**: puede refinar visibilidad por categoría según `[7.6]`.

---

### [7.3] URL sync con `searchParams` Next.js (2026-05-15)

- **Decisión**: todo el estado de filtrado y ordenamiento vive sincronizado en la URL vía `searchParams` (compatible con Server Components asíncronos de Next.js 16).
- **Ejemplo**: `?categoria=foto-imanes&ocasion=matrimonio&precioMin=20000&precioMax=80000&order=price_asc`.
- **Rationale**: enlaces 100 % compartibles por WhatsApp/redes, indexación limpia y soporte nativo de navegación atrás/adelante del navegador.
- **Implica**: lectura tipada de `await searchParams` en RSC y actualización con `router.replace()` sin recarga completa.

---

### [7.4] Chips de filtros activos arriba del grid + Limpiar todos (2026-05-15)

- **Decisión**: barra de chips activos encima de la grilla mostrando cada filtro aplicado con botón `×` para quitarlo individualmente, más acción **"Limpiar filtros"** para restablecer de un toque.
- **Implica**: componente de chips activos integrado sobre el listado de `/productos`.

---

### [7.5] Empty state kawaii cuando hay 0 resultados (2026-05-15)

- **Decisión**: cuando la combinación de filtros devuelve 0 productos, mostrar estado vacío ilustrado con la **mascota Lucams** y microcopy en tuteo colombiano: _"No encontramos resultados exactos, ¿pruebas relajar algún filtro?"_ acompañado de acción directa para limpiar o suavizar la búsqueda.
- **Implica**: estado vacío amigable en `/productos` sin callejones sin salida.

---

### [7.6] `Category.visibleFilters` configurable por admin (2026-05-15)

- **Decisión**: columna `Category.visibleFilters: String[] @default([])` con las claves de filtros habilitados manualmente. Arreglo vacío = aplican automáticamente todos los filtros con datos reales (`[7.2]`); arreglo con valores = acota explícitamente qué filtros mostrar en esa categoría.
- **Ejemplo**: en Coleccionables se puede ocultar el filtro "Personalización" si toda la categoría es estándar.
- **Implica**: columna en Prisma + selección múltiple en `/admin/categorias/[id]`.
- **Admin**: sección "Filtros visibles" dentro de `/admin/categorias/[id]`.

---

### [7.7] Endpoint `/api/catalog/filters` AI-ready compartido (2026-05-15)

- **Decisión**: endpoint público `GET /api/catalog/filters?categoria=X&subcategoria=Y` que retorna:
  - Filtros disponibles en ese contexto (calculados por `[7.2]` + override `[7.6]`).
  - Rangos válidos reales en centavos COP (precio mínimo/máximo, formas/tamaños/cantidades activas).
  - Conteo por faceta (cantidad de productos activos por opción).
- **Cache HTTP**: `public, max-age=3600`.
- **Implica**: route handler compartido con la lógica del storefront.

---

### [7.8] Search bar extendida (`pg_trgm` + `unaccent`) (2026-05-15)

- **Decisión**: la búsqueda difusa con `pg_trgm` y `unaccent` abarca `Product.name`, `description`, `richDescription`, `idealFor` y tags de ocasión (`[2.10]`), ignorando tildes y tolerando errores tipográficos (`"calenadrio"` → `"calendario"`, `"fotoiman"` → `"fotoimanes"`).
- **Rationale**: si un comprador busca `"regalo aniversario"`, encuentra productos cuyo `idealFor` u ocasión incluye aniversario aunque el título comercial no repita esa palabra.
- **Implica**: índices GIN trigram en PostgreSQL + servicio de búsqueda pública.

---

### [7.9] Performance — índices compuestos + caché por tags (2026-05-15)

- **Decisión**: medidas estructurales de rendimiento en catálogo:
  - **Índices compuestos en Prisma / PostgreSQL** para consultas frecuentes:
    - `@@index([categoryId, isActive, deletedAt])` en `Product`
    - `@@index([categoryId, isPersonalizable, isActive, deletedAt])` en `Product`
    - Índices GIN sobre texto buscable (`[7.8]`)
  - **Caché HTTP y caché de datos con invalidación por tag (`catalog`)** al editar productos, variantes, categorías u ocasiones en `/admin`.
- **Rationale**: mantiene tiempos `p95` bajos en `/productos` y PDP incluso combinando múltiples facetas.
- **Implica**: migraciones de índices + invalidación selectiva con `updateTag` / `revalidateTag`.

---

### [7.10] `Category.defaultSort` configurable por admin (2026-05-15)

- **Decisión**: campo `Category.defaultSort: String? @default("recent")` con valores `"recent" | "price_asc" | "price_desc" | "most_purchased" | "featured"`.
- **Rationale**: permite definir la primera impresión comercial de cada categoría (p. ej. `"featured"` en Coleccionables para resaltar los sets insignia, o `"price_asc"` en Recuerdos por volumen).
- **Implica**: columna en `Category` + selector en `/admin/categorias/[id]`.
- **Admin**: desplegable "Orden predeterminado" en `/admin/categorias/[id]`.

---

### [7.11] Filtros AI-suggested vía asistente conversacional — diferido (2026-05-15)

- **Decisión**: la sugerencia conversacional interactiva de filtros desde un chat de preventa queda diferida para evolución futura.
- **Rationale**: el buscador difuso (`[7.8]`), las páginas por ocasión (`[6.8]`) y los filtros dinámicos (`[7.1]`–`[7.7]`) resuelven hoy el descubrimiento directo sin latencia de LLM.
- **Implica**: ningún cambio requerido hoy; la API estructurada ya está lista cuando se active.

---

### [8.1] Sidebar admin permanente agrupada (2026-05-15)

- **Decisión**: la navegación de `/admin` utiliza barra lateral persistente en escritorio (y drawer en móvil) organizada por dominios funcionales:
  - **Operación diaria**: Bandeja Hoy (`/admin/hoy`) · Dashboard · Pedidos · Envíos · Carritos · Inventario · Materiales/Costos
  - **Catálogo y Estudio**: Categorías · Productos · Mayorista · Plantillas · Diseños · Fichas · Ocasiones · Moderación
  - **CRM, Comercial y Posventa**: Clientes (`Contacto 360°` + Duplicados) · Oportunidades B2B · Cotizaciones · Cupones · Fidelización · Marketing/Segmentos · Soporte PQR · Retractos · Garantías · Reclamos · Reseñas
  - **Contenido y Comunicaciones**: CMS (`/admin/contenido`) · Plantillas de Email (`/admin/email-templates`) · Redirecciones
  - **Sistema y Seguridad**: Usuarios/Roles · Auditoría · Observabilidad · Performance · Integraciones · Seguridad MFA
- **Rationale**: con más de 30 módulos operativos, la barra lateral agrupada filtrada según las capacidades del rol activo permite acceso inmediato sin ruido.
- **Implica**: implementado en `apps/web/app/admin/(panel)/layout.tsx`.

---

### [8.2] Multi-admin con roles `AdminRole` y matriz de capacidades (2026-05-15)

> **Estado vigente en código:** evolucionó en `ADR-193` desde los 3 roles iniciales a la matriz RBAC productiva de **8 roles (`SUPERADMIN`, `OPERATIONS_MANAGER`, `CUSTOMER_SUPPORT`, `PRINT_WORKSHOP`, `FINANCE_ANALYST`, `MANAGER`, `FULFILLMENT`, `CMS_EDITOR`) × 34 capacidades granulares**, protegida con MFA TOTP `aal2` obligatorio para todo rol y enmascaramiento server-side de PII en taller (`PRINT_WORKSHOP`, sin guía física) y despacho (`FULFILLMENT`, con guía física). Ver detalle íntegro en [`ARCHITECTURE.md`](ARCHITECTURE.md) y [`SECURITY.md`](SECURITY.md).

- **Decisión original**: incorporar `AdminUser.role: AdminRole` para separar administración total (`SUPERADMIN`), edición de contenido y operación diaria, verificando permisos server-side en cada ruta y Server Action sensible.
- **Rationale**: mínimo privilegio estricto conforme crece el equipo de taller, empaque, soporte, diseño y contabilidad.
- **Implica**: `AdminRole` en Prisma + guardas por capacidad (`requireAdminCapability`) + gestión de cuentas en `/admin/usuarios` (exclusivo de `SUPERADMIN`).

---

### [8.3] Operaciones masivas — exportaciones seguras acotadas por capacidad (2026-05-15)

- **Decisión**: habilitar exportaciones estructuradas (CSV / JSON) acotadas por rol, evitando importaciones masivas destructivas sin validación.
- **Salvaguardas vigentes**:
  - Las exportaciones financieras y contables exigen capacidad explícita (`finance:export_csv`).
  - Las exportaciones comerciales de marketing exigen capacidad `marketing:export_csv` y aplican **filtro duro ineludible de consentimiento `MARKETING` Ley 1581**.
  - Toda exportación sensible queda registrada en `AdminActionLog`.
- **Rationale**: permite análisis externo y contabilidad sin exponer la base de datos a corrupciones masivas ni fugas de PII.

---

### [8.4] Respaldo y recuperación de datos críticos (2026-05-15)

> **Estado vigente en código:** cubierto de forma integral, diaria y automatizada mediante `.github/workflows/backup.yml` (dumps cifrados GPG `.sql.gz.gpg` de PostgreSQL + `.tar.gz.gpg` de los 5 buckets de Storage enviados a **Cloudflare R2**) y verificado cada mes por el simulacro automático `.github/workflows/dr-drill.yml` (ver [`OPERATIONS.md`](OPERATIONS.md) e [`integrations/cloudflare.md`](integrations/cloudflare.md)).

- **Decisión original**: asegurar respaldos periódicos independientes del proveedor primario para proteger catálogo, configuración y continuidad del negocio.
- **Rationale**: resiliencia ante fallos o incidentes operativos sin depender exclusivamente de un único panel cloud.
- **Implica**: respaldos cifrados fuera de Supabase (en Cloudflare R2) + prueba mensual automatizada de restauración real.

---

### [8.5] Bandeja operativa de atención inmediata y notificaciones (2026-05-15)

> **Estado vigente en código:** materializado en **`/admin/dashboard`**, el centro de notificaciones **`Notification`** (`/admin/notificaciones`) y la **Bandeja Hoy (`/admin/hoy`)**, que prioriza en una sola vista pedidos por despachar, tickets PQR con relojes SLA en días hábiles colombianos, retractos/garantías abiertos y oportunidades B2B pendientes (`ADR-193`, ver [`domains/crm-b2b-and-loyalty.md`](domains/crm-b2b-and-loyalty.md)).

- **Decisión**: concentrar en la entrada del panel administrativo contadores y alertas accionables de todo lo que requiere respuesta humana inmediata:
  - Solicitudes B2B y tickets PQR abiertos o próximos a vencer SLA.
  - Productos o materiales con inventario bajo.
  - Cupones próximos a expirar.
  - Pedidos pendientes de pago, render o despacho.
  - Alertas operativas y de integraciones últimas 24 h.
- **Rationale**: el equipo ve al instante qué atender primero sin recorrer pantalla por pantalla.
- **UX**: indicadores semánticos de urgencia con navegación directa a la entidad afectada.

---

### [8.6] Audit log visible en `/admin/auditoria` (2026-05-15)

- **Decisión**: consola de auditoría paginada sobre `AdminActionLog` en **`/admin/auditoria`**.
- **Columnas**: marca de tiempo (`America/Bogota`) · actor (`adminEmail`) · acción (`product.create`, `cms.block.publish`, `order.status_change`, etc.) · `entityType` · `entityId` · IP · payload sanitizado expandible.
- **Filtros**: por administrador, prefijo de acción, entidad y rango de fechas.
- **Rationale**: trazabilidad forense completa y gobierno interno sobre los 8 roles administrativos.
- **Admin**: restringido exclusivamente a `SUPERADMIN` (`audit:read`).

---

### [8.7] Admin mobile responsive (2026-05-15)

- **Decisión**: TODAS las pantallas de `/admin` son responsivas con navegación lateral en drawer móvil (`375px` mínimo).
- **Operaciones móviles prioritarias**:
  - Atender la Bandeja Hoy (`/admin/hoy`), tickets PQR y oportunidades B2B.
  - Consultar y avanzar estados de pedidos.
  - Activar/pausar disponibilidad de productos o cupones.
  - Revisar alertas operativas en `/admin/observability`.
- **Rationale**: permite operar y supervisar la tienda desde el teléfono móvil en taller o en desplazamiento.
- **Implica**: layout administrativo adaptable con `<Sheet>` móvil y tablas con desplazamiento controlado.

---

### [8.8] Consultas e inteligencia operativa en `/admin` (2026-05-15)

> **Estado vigente en código:** resuelto de forma nativa y determinista en **`/admin/metricas`** (embudo de conversión, ingresos, matriz conductual RFM y LTV de margen neto real descontando costo de receta) y **`/admin/observability`** (salud de crons, webhooks, colas y alertas), sin necesidad de un chatbot interno aparte.

- **Decisión original**: diferir endpoints conversacionales `/api/admin/insights/*` hasta contar con métricas operativas consolidadas.
- **Rationale**: los tableros directos sobre PostgreSQL entregan respuestas exactas al instante sin costo ni latencia de LLM.

---

### [8.9] Sin vista de calendario rígida; operación por colas priorizadas (2026-05-15)

- **Decisión**: NO construir una vista de calendario mensual rígida en el backoffice; operar mediante colas vivas ordenadas por vencimiento y prioridad.
- **Implementación vigente**: la **Bandeja Hoy (`/admin/hoy`)**, las tareas CRM (`Task` con `dueAt`) y los relojes SLA en días hábiles colombianos reemplazan con ventaja cualquier recordatorio manual estático.
- **Rationale**: foco directo en la siguiente acción crítica a ejecutar.

---

### [8.10] Estándar UX no-técnico en todas las pantallas `/admin` (2026-05-15)

> **Estado vigente en código:** reforzado en todo `/admin` con formateo canónico de fechas en `America/Bogota` (`apps/web/lib/datetime.ts`), confirmaciones unificadas de marca (`useAdminConfirm`), edición visual en el sitio del CMS v2 (`168` campos) y previsualización aislada en `/admin/email-templates`.

- **Decisión**: TODAS las pantallas administrativas aplican de forma consistente el estándar de claridad para perfiles no programadores:
  - **Etiquetas en español llano** (cero jerga cruda): "Cuerpo del texto" en lugar de "MD body"; "Volver a esta versión" en lugar de "Revert".
  - **Guía rápida siempre visible** donde aplique formato enriquecido o tokens `{{*}}`.
  - **Vista previa en vivo** al editar contenido CMS o plantillas de correo.
  - **Botones claros con jerarquía semántica**: publicar, guardar borrador, archivar y cancelar inequívocos.
  - **Indicadores visuales inmediatos** de estado (activo, pendiente, alerta, error).
  - **Diálogo de confirmación explícito (`useAdminConfirm`)** antes de cualquier acción sensible (publicar, archivar, eliminar, fusionar contactos, enviar recordatorios masivos).
  - **Edición ágil en línea** donde resulta natural.
  - **Fechas humanas en español de Colombia (`es-CO`, `America/Bogota`)**: vía `lib/datetime.ts`.
  - **Tuteo colombiano consistente (cero voseo)**: _"Eliges"_, _"Personalizas"_, _"Cuéntanos"_ (prohibido el voseo y el trato distante de «usted»).
- **Rationale**: reduce errores humanos, acelera la operación diaria y hace que cualquier integrante del equipo pueda administrar Lucams Shop con autonomía y seguridad.
- **Implica**: criterio transversal obligatorio en cada componente de `apps/web/components/admin/*` y `apps/web/app/admin/*`.
- **Admin**: estándar permanente en todo el backoffice.
