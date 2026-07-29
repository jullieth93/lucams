# Plan Catálogo V2 — documento de consensos

> **Documento vivo**. La discusión ocurre en chat. Acá solo se documenta lo que **cerramos**.
> Iniciado: 2026-05-15. Última modificación: 2026-05-15.

## Cómo trabajamos

1. **Discusión en chat**, una área a la vez en orden de dependencia.
2. **Acá solo se escribe lo cerrado**: cada decisión consensuada se registra en "Decisiones cerradas" abajo, con fecha y rationale.
3. **No se codea hasta cerrar las 8 áreas**.
4. Si surge algo fuera del área actual, lo anoto en "Notas laterales".
5. Si una decisión cerrada entra en conflicto con una posterior, se reabre explícitamente.

## Índice

- [Inventario actual (snapshot factual)](#inventario-actual-snapshot-factual)
- [Mapa de dependencias entre áreas](#mapa-de-dependencias-entre-áreas)
- [Las 8 áreas](#las-8-áreas)
- [Decisiones cerradas](#decisiones-cerradas)
- [Notas laterales](#notas-laterales)
- [Próximas acciones](#próximas-acciones)

---

## Inventario actual (snapshot factual)

> Estado del catálogo HOY (commit `4271a25`). Sin opiniones, solo conteo. Base común.

### Categorías (10 totales)

| #   | Slug                     | Nombre display         | # Productos | isFeatured |
| --- | ------------------------ | ---------------------- | ----------- | ---------- |
| 1   | `foto-imanes`            | Fotoimanes             | 5           | sí         |
| 2   | `recuerdos`              | Recuerdos Magnéticos   | 6           | sí         |
| 3   | `calendarios`            | Calendarios Magnéticos | 4           | sí         |
| 4   | `publicitarios`          | Imanes Publicitarios   | 5           | no         |
| 5   | `organizate`             | Organización           | 6           | sí         |
| 6   | `regalos-personalizados` | Cajas Regalo           | 3           | sí         |
| 7   | `de-temporada`           | De Temporada           | 3           | sí         |
| 8   | `cuadros-decoracion`     | Cuadros y Decoración   | 4           | sí         |
| 9   | `coleccionables`         | Imanes Coleccionables  | 6           | no         |
| 10  | `juegos-aprendizaje`     | Juegos y Aprendizaje   | 4           | no         |

**Total productos**: 46.

### Distribución por tipo de personalización

| Kind                       | Cuántos | Notas                                                                                                             |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `NONE` (no personalizable) | 20      | 6 packs Coleccionables, planners genéricos, juegos, notas, separadores, marcos, mini calendarios, edición Navidad |
| `EVENT_FAVOR`              | 7       | 6 Recuerdos + Box Recién Nacido                                                                                   |
| `PHOTO_PACK`               | 5       | Fotoimanes Polaroid / Cuadrados / Circulares / Corazón / Glass                                                    |
| `BUSINESS_LOGO`            | 5       | 5 Publicitarios                                                                                                   |
| `CUSTOM_DECOR`             | 4       | Box Pareja, Box Día Madre, Box Día Padre, Cuadro con Foto                                                         |
| `CALENDAR_PHOTO_HERO`      | 2       | Calendario Foto+Planner, Planner Mensual con Foto                                                                 |
| `CALENDAR_PHOTO_MONTH`     | 1       | Calendario Foto-Mes                                                                                               |
| `PHOTO_GRID`               | 1       | Cuadro Triple Foto                                                                                                |
| `TEXT_ONLY`                | 1       | Cuadro con Frase                                                                                                  |

**43%** de los productos del seed son NO personalizables hoy.

### Productos del pool prediseñado que YA existen en seed

Categoría `coleccionables` (6 packs, kind `NONE`, no featured):

- `pack-imanes-ciudades-colombia`
- `pack-comida-colombiana`
- `pack-frases-motivacionales`
- `pack-animalitos-kawaii`
- `pack-viajes-latam`
- `pack-mood-emociones`

### Lo que NO existe hoy

- Sub-categorías (`Category.parentId` existe pero sin uso)
- Tags transversales (Ocasión, Público, Temática)
- Filtros más allá del chip de categoría en `/productos`
- Inventario por variant (StockReservation existe sin UI)
- Bundles / combos
- Reglas de precio (descuento por volumen, bundle, etc.)

---

## Mapa de dependencias entre áreas

```
Categorías (1)
    │
    ├──> Productos por categoría (2)
    │         │
    │         ├──> Cantidad/Tamaño por producto (3)
    │         │         │
    │         │         └──> Producto final físico (4)
    │         │
    │         └──> Pool prediseñado (5) ──┐
    │                                     ├──> Filtros (7)
    │                                     │
    └──> Selección/recomendación (6) ─────┘
                                          │
                                          └──> Admin (8) [transversal]
```

---

## Las 8 áreas

### Área 1 — Categorías

**Estado**: 🟢 **CERRADA** (2026-05-15). Ver decisiones 1.1 → 1.9 abajo.

**Resumen ejecutivo**: 11 categorías totales (sube Separadores de sub-cat a categoría propia). Sub-categorías reales jerárquicas. Mega-menú visual en header. 15 tags transversales por ocasión. B2B con flujo `/mayorista`. Riesgo legal Coleccionables Universos asumido. Control DIAN proactivo en admin. **Principio rector**: cada categoría muestra DOS caminos visibles (Diseños listos + Personaliza tu propio). Admin gestiona todo.

---

### Área 2 — Productos por categoría

**Estado**: 🟢 **CERRADA** (2026-05-15). Ver decisiones 2.1 → 2.11 abajo.

**Resumen ejecutivo**: slugs modulares agnósticos de cantidad/tamaño (15 renombrados con redirects 301). Vidrio mantiene sub-cat propia. Día del Niño suma a De Temporada (7 sub-cats estacionales). 12 productos faltantes se crean como placeholders `isActive: false`. Universos Coleccionables: 1 producto por universo. Separadores se divide en 9 productos temáticos. Marcos vacíos (no personalizables con foto). Caja Sorpresa descartada. **API Catálogo RAG-ready** (5 endpoints + 6 campos schema + tabla OcasionTag + ADR-038). **Principio transversal AI-ready**: DB = fuente de verdad, LLM = consumidor.

---

### Área 3 — Relación cantidad ↔ tamaño por producto

**Estado**: 🟢 **CERRADA** (2026-05-15). Ver decisiones 3.1 → 3.9 abajo.

**Resumen ejecutivo**: Polaroid refactoreado a multi-dim 9 variants. Pricing único `LINEAR` (precio absoluto por variant). Mínimos y máximos por producto en schema. Sugerencias de cantidad por ocasión vía `OcasionTag`. Coleccionables uniformes x4/x6/x9. Planners sin variants. Sin surcharge separado. `PricingRule` reservada como concepto. **Cupones Fase 1** completos: tipos PERCENT/FIXED/FREE_SHIPPING, restricciones por categoría/producto/mínimos/vigencia/usos, distribución manual, endpoint `/api/coupons/public` AI-ready.

---

### Área 4 — Producto final físico (qué recibe el cliente)

**Estado**: 🟢 **CERRADA** (2026-05-15). Ver decisiones 4.1 → 4.10 abajo.

**Resumen ejecutivo**: `Product.physicalSpecs` Json estructurado (material, grosor, peso, empaque, incluye, cuidado, país). Campos `warrantyMonths` (12 default Ley 1480) + `productionDays` + `shippingDaysMin/Max`. Empaque estandarizado en 3 tipos (STANDARD_BAG / GIFT_BOX / BULK_BOX). Información impresa física documentada en OPERATIONS.md. Tracking visible (dependencia Fase 4). **Logística: Aveonline como proveedor primario** + interface `ShippingProvider` para swap futuro + ADR-039.

---

### Área 5 — Pool de diseños prediseñados

**Estado**: 🟢 **CERRADA** (2026-05-15). Ver decisiones 5.1 → 5.10 abajo.

**Resumen ejecutivo**: `PersonalizationTemplate` extendida con flag `kind: EDITABLE | PREMADE` (mismo schema, comportamiento distinto). Cada producto NONE tiene N templates PREMADE; cliente elige diseño en PDP sin pasar por estudio. Variant lleva cantidad/tamaño; diseño se guarda en `CartItem.metadata.templateId`. Arranque con ~30 prediseñados, escalar según tracción. Pricing igual a personalizable con upcharge configurable per-producto (default 0%, excepción Universos hasta +15%). Cliente combina prediseñado + personalizado mismo cart. Canvas PREMADE = 1 capa image simple. Admin gestiona templates con filtro EDITABLE/PREMADE + métricas. API AI-ready expone templates vía `/api/catalog/products/[slug]`.

---

### Área 6 — Productos según selección / recomendación

**Estado**: 🟢 **CERRADA** (2026-05-15). Ver decisiones 6.1 → 6.10 abajo.

**Resumen ejecutivo**: Wizard MVP "ayudame a elegir" con 4 preguntas (ocasión / destinatario / precio / personalización). Algoritmo scoring simple por puntos (sin ML/embeddings hoy — pgvector reservado para ADR-036 Fase 5+). Cross-sell en cart por ocasión dominante. Productos relacionados PDP con scoring 3 capas (ocasión > sub-cat > cat). Bundles modelados con cupones (no schema separado). Endpoint `/api/catalog/recommend` AI-ready compartido entre wizard UI + bot futuro. `Category.featuredProductSlug` para destacar 1 producto por categoría. Tabla `RecommendationLog` + admin `/admin/recomendaciones` para métricas de efectividad.

---

### Área 7 — Filtros del catálogo

**Estado**: 🟢 **CERRADA** (2026-05-15). Ver decisiones 7.1 → 7.11 abajo.

**Resumen ejecutivo**: sidebar de filtros 280px desktop / drawer mobile con 9 dimensiones (categoría / sub-cat / ocasión / precio / personalización / forma / descuento / destacados / stock) + dropdown orden. Filtros condicionales se ajustan al contexto (cat/subcat). URL sync con searchParams. Chips activos + "Limpiar todos". Empty state kawaii. `Category.visibleFilters` y `Category.defaultSort` configurables por admin. Endpoint `/api/catalog/filters` AI-ready compartido UI + bot. Search extendida a `richDescription + idealFor + tags`. Performance con índices compuestos + cache HTTP. Filtros AI-suggested diferidos a Fase 5+.

---

### Área 8 — Panel de administración (control total)

**Estado**: 🟢 **CERRADA** (2026-05-15). Ver decisiones 8.1 → 8.10 abajo. **Esta es la última área — el plan está completo.**

**Resumen ejecutivo**: sidebar admin permanente con 5 grupos (Catálogo / Comercial / Operación / Contenido / Sistema). Multi-admin con roles `SUPERADMIN | EDITOR | OPERATOR` (schema hoy, único SUPERADMIN activo). Bulk operations solo exportar CSV/JSON. Backup snapshot manual. Card "Notificaciones" en dashboard. Audit log visible `/admin/sistema/auditoria`. Admin mobile responsive (drawer sidebar). Endpoints `/api/admin/insights/*` diferidos Fase 5+. Standard UX no-técnico aplicado en todas las pantallas (labels español, preview live, notices 🟢🟡🔴, edición inline, fechas humanas).

---

## Decisiones cerradas

> Cada decisión se registra acá cuando cerramos consenso. Cada decisión incluye **Implicación admin** porque admin es transversal a todas.

---

### [1.1] Naming "Fotoimanes" (2026-05-15)

- **Decisión**: display oficial **"Fotoimanes"** (junto, sin guión, mayúscula inicial). Slug `foto-imanes` se mantiene por SEO. Resto de categorías mantienen naming actual.
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

¹ Flujo B2B con página `/mayorista` (ver 1.6).
² Universos: asumiendo riesgo legal según decisión 1.7.

- **Rationale**: sub-cats jerárquicas dan SEO específico por slug (ej. "imán polaroid colombia" indexa `/productos/fotoimanes/polaroid`). Reducen fricción navegacional.
- **Implica**:
  - Migración Prisma: poblar filas en `Category` con `parentId` apuntando a la categoría padre.
  - Productos hoy se migran a `subCategoryId` (nuevo campo o usar `Category.parentId` del producto.categoryId actual).
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

- **Decisión**: 15 tags transversales que cruzan categorías para facilitar discovery por evento/ocasión.
- **Lista inicial**: Cumpleaños · Matrimonio · Bautizo · Baby Shower · Grado · Quinceañera · Aniversario · Día Madre · Día Padre · Amor y Amistad · Halloween · Navidad · Año Nuevo · Empresarial · Para mí mismo.
- **UX**:
  - Chips horizontales scroll arriba del grid en `/productos` (multi-select, combinables con categoría).
  - Menú "Por ocasión ▾" en header (dropdown rotando según mes destacado).
  - Chip "Ideal para: X" en PDP debajo del precio.
  - URLs: `/productos?ocasion=matrimonio` o `/productos/fotoimanes?ocasion=matrimonio`.
- **Rationale**: aumenta discovery cruzado. Cliente buscando "matrimonio" ve productos relevantes de 4-5 categorías sin tener que navegarlas todas. Tags también informan filtros y recomendaciones (Áreas 6 y 7).
- **Implica**:
  - Tabla nueva `OcasionTag(id, name, slug, isActive, order)`.
  - Tabla pivot `ProductOcasion(productId, ocasionTagId)`.
  - Server action de listado acepta filtro `ocasion[]`.
  - Cada producto se asocia a 0-N ocasiones desde admin.
- **Admin**: CRUD de ocasiones + asociación múltiple por producto (checkboxes en el form del producto). Reorder. Toggle activo.

---

### [1.6] B2B Publicitarios con flujo `/mayorista` (2026-05-15)

- **Decisión**: la categoría Publicitarios opera como categoría pública normal + se complementa con página `/mayorista` para pedidos corporativos grandes.
- **Aterrizado**:
  - `/productos/publicitarios` con 5 productos visibles, variants quantity x50/100/200 con precios públicos.
  - Banner arriba de la categoría: _"¿Pedido grande? Cotizamos pedidos desde 300 unidades con descuento por volumen + soporte de documentación tributaria → [Cotizar por WhatsApp] [Ir a /mayorista]"_.
  - **Página `/mayorista`** nueva con: hero kawaii corporativo · beneficios (descuentos volumen, asesoría, documentación tributaria, plazos pago) · formulario (empresa + NIT + email + tipo producto + cantidad + descripción) · WhatsApp CTA secundario.
  - Server action: crea `SupportTicket(kind=B2B_INQUIRY)` + email a `r.julliethhr@gmail.com` + auto-respuesta al cliente.
- **Copy obligatorio**: NO mencionar "factura electrónica DIAN obligatoria" en banner ni en `/mayorista` hasta que Lucy efectivamente esté en régimen como facturador electrónico (ver 1.8). Usar "documentación tributaria (cuenta de cobro o factura electrónica según corresponda)".
- **Rationale**: cliente individual y empresa chica compran directo; empresa grande necesita cotización personalizada. Mantener visibilidad pública del catálogo B2B sin obligar flujo aparte para todos.
- **Implica**:
  - Nuevo modelo: `SupportTicket.kind` enum suma `B2B_INQUIRY`.
  - Página `app/mayorista/page.tsx` + form server action.
  - Banner condicional en `/productos/publicitarios`.
- **Admin**: ver tickets B2B_INQUIRY desde `/admin/mensajes` (Área 8 — Centro mensajes). Filtro por `kind` para gestionar B2B aparte.

---

### [1.7] Riesgo legal Coleccionables Universos asumido (2026-05-15)

- **Decisión**: Lucams comercializa diseños inspirados en propiedad intelectual de terceros (Harry Potter / Pokémon / Star Wars / Marvel / DC / Disney/Pixar / Anime Retro / Cartoons 90s) en sub-categorías Universos de Coleccionables y Separadores.
- **Asunción**: riesgo legal aceptado por Lucy. Lucams opera como e-commerce pequeño en arranque; práctica común en mercado colombiano e internacional; filtrar al cliente sería demasiada fricción.
- **Trigger de reapertura**:
  - Si llega cease & desist o demanda formal de algún titular → retirar inmediatamente sub-cat afectada + reabrir esta decisión.
  - Si volumen anual de Universos justifica licencia oficial ($5k-50k USD/año + royalty 8-15%) → evaluar licenciar antes del próximo año fiscal.
- **Diferenciación con casos previos**: la decisión Snoopy del 2026-05-12 fue DESCARTAR. Acá se INVIERTE esa lógica para el resto: si Lucy lo decide y asume el riesgo, se opera.
- **Implica**:
  - Sub-categorías Universos en `coleccionables` y `separadores` con productos asociados.
  - Disclaimer interno en `docs/COMPLIANCE.md` documentando la decisión + trigger de reapertura.
  - Cuando llegue cease & desist: soft-delete inmediato de productos afectados + ocultar sub-cat + ADR de cierre.
- **Admin**: capacidad de archivar sub-cat completa + todos sus productos en 1 click (feature a sumar en Área 8) para reaccionar rápido si llega notificación legal.

---

### [1.8] Control DIAN proactivo en admin (2026-05-15)

- **Decisión**: admin Lucams tiene panel de control tributario con alerta proactiva basada en umbral DIAN.
- **Settings nuevos** (categoría `FACTURACION` en `SiteSetting`):

| Setting                             | Tipo    | Default                              | Descripción                                                  |
| ----------------------------------- | ------- | ------------------------------------ | ------------------------------------------------------------ |
| `DIAN_FACTURADOR_ELECTRONICO`       | BOOLEAN | `false`                              | ¿Lucams registrada como facturador electrónico?              |
| `DIAN_REGIMEN`                      | TEXT    | `persona_natural_no_responsable_iva` | Régimen tributario actual                                    |
| `DIAN_UMBRAL_UVT_ANUAL`             | NUMBER  | `3500`                               | Umbral UVT obligatorio facturación (configurable)            |
| `DIAN_VALOR_UVT_COP`                | NUMBER  | `[UVT 2026 pendiente verificación]`  | Valor en COP de 1 UVT año fiscal actual                      |
| `DIAN_INGRESOS_ANUALES_REGISTRADOS` | NUMBER  | `0`                                  | Acumulado año fiscal (manual hoy, auto cuando exista Orders) |
| `DIAN_PROVEEDOR_FACTURACION`        | TEXT    | _vacío_                              | Alegra / Siigo / Facture / otro cuando activado              |

- **Card en `/admin/dashboard`**: "Estado tributario DIAN" con 4 niveles de alerta:

| % vs umbral | Color       | Acción                          |
| ----------- | ----------- | ------------------------------- |
| < 60%       | 🟢 verde    | Operación bajo umbral           |
| 60-80%      | 🟡 amarillo | Empieza a planear registro DIAN |
| 80-100%     | 🟠 naranja  | Crítico, activá este trimestre  |
| > 100%      | 🔴 rojo     | OBLIGATORIO, contactá contador  |

- **Email alerta mensual**: `pg_cron` día 1 a las 8am COT manda email a `r.julliethhr@gmail.com` cuando `ingresos ≥ 60% × umbral`.
- **Auto-cálculo futuro**: cuando exista `Order.status IN (PAID, AWAITING_FULFILLMENT, SHIPPED, DELIVERED)` (Fase 4), `DIAN_INGRESOS_ANUALES_REGISTRADOS` se calcula automático sumando `Order.total` del año fiscal. Mientras tanto: Lucy actualiza manual.
- **Rationale**: el banner público no debe prometer "factura electrónica DIAN" hasta que Lucy esté efectivamente obligada o decida operativizarlo. Mientras tanto debe haber alerta proactiva en admin para no llegar tarde al umbral.
- **Implica**:
  - Migración: 6 filas nuevas en `SiteSetting`.
  - Update `/admin/contenido/configuracion` con nueva categoría `FACTURACION`.
  - Card nueva en dashboard.
  - Job `pg_cron` mensual.
  - Documentar umbrales DIAN en `docs/COMPLIANCE.md` (ver nota DIAN al final).
- **Admin**: edición desde `/admin/contenido/configuracion`. Card visible en `/admin/dashboard`.

---

### [1.9] Principio rector — Dos caminos visibles en cada categoría (2026-05-15)

- **Decisión**: cada categoría del catálogo presenta DOS caminos visibles al cliente desde el primer momento.
  - **Camino 1 — Diseños listos**: grid visual de plantillas / packs prediseñados disponibles. Cliente compra tal cual (Coleccionables, Juegos) o elige como base (Fotoimanes, Recuerdos) y completa solo datos mínimos.
  - **Camino 2 — Personaliza tu propio**: CTA "Personaliza desde cero" → estudio canvas vacío.
- **Distribución por categoría**: ver tabla en mensaje de chat (referencia). Sintéticamente:
  - Categorías 100% Camino 1: Coleccionables, Juegos y Aprendizaje (sin estudio).
  - Categorías mixtas: Fotoimanes, Recuerdos, Calendarios, Publicitarios, Organización, Cajas Regalo, De Temporada, Cuadros, Separadores.
- **Rationale**: la tienda no es solo "personalización" — es también catálogo de diseños listos para clientes que no quieren personalizar (mayor conversión, menor fricción). El editor es opción premium, no obligación.
- **Implica**:
  - PDP rediseñado (Área 2-4): sección "Plantillas disponibles" con grid + click aplica plantilla pre-cargada en `/estudio/[slug]?template=<slug>`.
  - Pool prediseñado (Área 5): para categorías 100% Camino 1, nuevo flujo "Add to cart" directo sin pasar por estudio.
  - Editor (existente): recibe `?template=<slug>` query y arranca con plantilla pre-aplicada.
  - Cada plantilla necesita thumbnail real curado.
- **Acción humana requerida (futuro Área 5 / 8)**: Lucy genera thumbnails con IA (Midjourney / DALL·E / Flux / SD). Claude entrega:
  - Prompts kawaii curados por categoría / sub-categoría / temática.
  - Estructura del `canvasData` JSON por plantilla: qué áreas quedan **editables** (slot foto, texto del cliente, campos del evento) vs **fijas** (decoraciones, frame, background).
  - Convenciones de tamaño / aspect ratio / resolución para Konva.
  - Iteración consola: Lucy genera → Claude revisa → ajustes al prompt → re-genera hasta cerrar.
- **Admin**:
  - Gestión de plantillas desde `/admin/plantillas` (CRUD existente `PersonalizationTemplate`).
  - Toggle por categoría: "Mostrar plantillas en PDP" / "Permitir personalizar desde cero".
  - Reorder de plantillas dentro de cada sub-categoría.
  - Subir thumbnail por plantilla.
  - Definir `canvasData` editable vs fijo (UI futura en Área 8 — admin editor visual de plantillas, o JSON manual inicial).

---

### [2.1] Slugs modulares agnósticos de cantidad/tamaño (2026-05-15)

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
| `pack-separadores-libros`             | (soft-deleted, ver 2.7)       |

- **Implica**: 15 redirects 301 desde slug viejo → nuevo en `proxy.ts` + `lib/product-redirects.ts`. Preserva SEO y enlaces compartidos.
- **Admin**: cuando admin renombra un producto, sistema sugiere automáticamente sumar redirect 301 al map.

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

- **Decisión**: los **12 productos faltantes** (Baby Shower + 4 De Temporada nuevas + 7 Separadores temáticos + 8 Coleccionables Universos — restando los que aplican según decisiones siguientes) se crean en seed con `isActive: false`, descripción mínima, imagen Unsplash temática provisional.
- **Rationale**: estructura del catálogo queda definida desde día 1. Una sola migración seed = menos riesgo. Lucy activa producto a producto cuando tenga plantilla IA real.
- **Implica**: seed expandido + flag activación incremental.
- **Admin**: toggle `isActive` por producto desde `/admin/productos/[id]`.

---

### [2.5] Caja Sorpresa descartada (2026-05-15)

- **Decisión**: el tratamiento especial de mystery box para `caja-lucams-sorpresa` **se descarta**. Producto se mantiene como variant normal de Cajas Regalo sin composición temática fija.
- **Rationale**: Lucy no le ve valor estratégico hoy. Reabrir si en el futuro decide explorar fidelización por mystery boxes.
- **Implica**: producto sigue en catálogo, sin renombre, sin tratamiento especial.

---

### [2.6] Universos Coleccionables — 1 producto por universo (2026-05-15)

- **Decisión**: cada universo (Harry Potter, Pokémon, Star Wars, Marvel, DC, Disney/Pixar, Anime Retro, Cartoons 90s) arranca con **1 producto** con variants quantity x4/x6/x9.
- **Rationale**: 24+ productos al inicio sin tracción = inventario muerto. Si universo demuestra demanda, Lucy divide en sub-temas (Casas Hogwarts / Criaturas / Objetos) como productos hermanos.
- **Slug pattern**: `coleccionables-harry-potter`, `coleccionables-pokemon`, etc.
- **Implica**: 8 productos nuevos placeholder `isActive: false` en sub-cats Universos de Coleccionables.
- **Admin**: cuando Lucy decida granularidad, crea productos hermanos desde `/admin/productos`.

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

- **Rationale**: las sub-cats son por TEMÁTICA. Un genérico sin temática no encaja en ninguna. Cada producto temático tendrá sus propias plantillas IA.
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

- **Decisión**: las sub-cats de De Temporada que aún no tienen producto (Día del Niño, Amor y Amistad, Halloween, Año Nuevo) **se crean en DB con `isActive: false`**. No se exponen al cliente hasta que Lucy active.
- **Rationale**: esqueleto del catálogo definido desde día 1. Evita migraciones futuras. Cliente nunca ve sub-cat vacía.
- **Mejora futura opcional**: campo `Category.activeFrom` + `Category.activeUntil` para auto-toggle por fecha (Área 8).
- **Admin**: activa/desactiva sub-cat desde `/admin/categorias/[id]`.

---

### [2.10] API Catálogo RAG-ready (2026-05-15)

- **Decisión**: replicar patrón de CMS API (ADR-033) para catálogo. 5 endpoints públicos + 6 campos nuevos schema + tabla OcasionTag + ADR-038.

#### Endpoints `/api/catalog/*`

| Endpoint                           | Devuelve                                                                                                                  | Uso esperado bot                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `GET /api/catalog/categories`      | Árbol jerárquico cat → sub-cats con `richDescription`, `useCase`, count productos                                         | "¿Qué categorías tienen?"                   |
| `GET /api/catalog/products`        | Lista paginada filtrable (`?categoria=`, `?subcategoria=`, `?ocasion=`, `?priceMin=`, `?priceMax=`, `?isPersonalizable=`) | "¿Qué tienen para matrimonio bajo 50k COP?" |
| `GET /api/catalog/products/[slug]` | Detalle completo: `richDescription`, `whyChooseThis`, `idealFor`, variants con `description`, plantillas, ocasiones       | "Contame del producto X"                    |
| `GET /api/catalog/ocasiones`       | 15 ocasiones con descripción + productos asociados con `rationale`                                                        | "¿Qué le regalo a mi mamá?"                 |
| `GET /api/catalog/search?q=`       | Búsqueda fuzzy pg_trgm sobre nombre + descripción + tags                                                                  | "Quiero algo con corazones"                 |

- Cache HTTP `public, max-age=3600`.
- Rate-limit 30/min por IP (patrón CMS).
- Sin auth (público).
- Excluyen datos sensibles: NO se expone `cost`, `margin`, `isFeatured` interno, ni datos admin.

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

**Tabla nueva `OcasionTag` + pivot `ProductOcasionTag`** (concretiza decisión 1.5):

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

- **ADR-038** documenta arquitectura completa (endpoints, cache, rate-limit, exclusiones, plan futuro pgvector con ADR-036).
- **Implica**: migración Prisma con 6 campos + 2 tablas + 5 endpoints + 1 ADR.
- **Admin**:
  - `/admin/productos/[id]`: nuevos campos `richDescription` + `whyChooseThis` + `idealFor` con textarea markdown + preview live.
  - `/admin/categorias/[id]`: campos `richDescription` + `useCase`.
  - `/admin/productos/[id]/variants`: campo `description` por variant.
  - `/admin/ocasiones` (nueva pantalla): CRUD tags + asociación múltiple a productos con `rationale`.

---

### [2.11] Principio transversal AI-ready (2026-05-15)

- **Decisión**: principio rector para Áreas 3-8.
- **Enunciado**: "DB es la fuente de verdad. LLM (chatbot futuro Fase 5+) es consumidor que consulta API estructurada — nunca inventa, nunca usa training data como fuente. Cada decisión de catálogo/admin/UX debe responder: ¿puede el bot responder esto correctamente consultando DB sin halucinar?"
- **Implicaciones por área**:
  - **Área 3 (cantidad/tamaño)**: precios y reglas en DB (no en código). Bot consulta "¿cuánto cuesta variant X?"
  - **Área 4 (producto final)**: empaque/material/garantía como campos estructurados. Bot responde "¿qué incluye el Box Día Madre?"
  - **Área 5 (pool prediseñado)**: cada plantilla con descripción + tags + caso de uso. Bot recomienda plantillas.
  - **Área 6 (selección/recomendación)**: lógica se apoya en `ocasiones` + `idealFor` + variant `description`. Bot usa mismas reglas vía API.
  - **Área 7 (filtros)**: filtros disponibles vía API. Bot sugiere "puedes filtrar por X" o ejecuta filtro y devuelve resultados.
  - **Área 8 (admin)**: admin edita datos → DB se actualiza → bot ve cambio en máx 1h (cache TTL).
- **Criterio de validación**: ninguna decisión futura cierra sin haber respondido "¿esto es queryable por bot vía API estructurada?".
- **Ver también**: Nota lateral N3.

---

### [3.1] Polaroid refactor a multi-dim limpio (2026-05-15)

- **Decisión**: `fotoimanes-polaroid` refactoreado a **9 variants** = 3 cantidades (6 / 12 / 20) × 3 tamaños (6×8 / 7×9 / 4×5 mini). Combinaciones no producibles físicamente quedan con `isActive: false`.
- **Rationale**: hoy son 4 variants con cantidad y tamaño acoplados (Set 6 → 7×9, Set 12 → 6×8, Set 20 → 4×5 mini). Va contra el principio modular cerrado en 2.1. Cliente debe poder pedir "6 unidades 6×8".
- **Implica**: refactor del seed + decidir qué combinaciones quedan activas (ej. probable que Set 20 mini solo en 4×5 por economía de producción).
- **Admin**: Lucy activa/desactiva combinaciones desde variant editor.

---

### [3.2] Pricing único `LINEAR` (2026-05-15)

- **Decisión**: precios viven directos en `ProductVariant.price` (COP centavos). Sin reglas escalonadas, sin volume tiers, sin fórmulas runtime.
- **Rationale**: arranque simple. Si B2B futuro exige tiers (ej. 50u = -5%, 100u = -10%, 200u = -15%), se evalúa sumar `VOLUME_TIER` como patrón opcional. Hoy no hay tracción que justifique complejidad.
- **Implica**: ningún cambio de schema (ya `ProductVariant.price` existe). Cada variant declara su precio absoluto.
- **Admin**: edita precio por variant desde `/admin/productos/[id]/variants`.

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

- **Decisión**: agregar a `OcasionTag` (creada en 2.10) el campo `suggestedQuantityRange: Json` con shape `{ min: int, ideal: int, max: int }`.
- **Rationale**: bot puede responder "Para matrimonio promedio (~80 invitados) recomendamos variant x80, o aumentar a x100". Lucy carga rangos típicos por ocasión.
- **Ejemplos** (cargados en seed inicial):
  - Cumpleaños: `{ min: 10, ideal: 20, max: 40 }`
  - Matrimonio: `{ min: 30, ideal: 80, max: 150 }`
  - Baby Shower: `{ min: 12, ideal: 25, max: 50 }`
  - Empresarial: `{ min: 50, ideal: 100, max: 500 }`
- **Implica**: 1 campo más en migration de `OcasionTag` (decisión 2.10 lo absorbe).
- **Admin**: edita rangos desde `/admin/ocasiones`.

---

### [3.5] Coleccionables uniformes con variants x4/x6/x9 (2026-05-15)

- **Decisión**: TODOS los productos de Coleccionables (6 Lucams + 8 Universos = 14 productos) tienen el mismo set de variants quantity x4 / x6 / x9 unidades.
- **Rationale**: uniformiza UX (cliente entiende: "siempre puedo elegir entre 4, 6 o 9 imanes del pack"). Permite comprar Coleccionables como regalo pequeño (x4) o set completo (x9).
- **Implica**: refactor seed de los 6 packs Lucams existentes (hoy sin variants) + 8 Universos nuevos con variants from start.
- **Admin**: variants estándar pueden replicarse vía "Clonar variants de producto X" futuro (Área 8).

---

### [3.6] Planners sin variants (2026-05-15)

- **Decisión**: planners (semanal, mensual, diario) son producto unitario sin variants.
- **Rationale**: comprar 2 planners semanales iguales tiene poco sentido funcional. Si Lucy reporta clientes pidiendo packs (ej. "regalo set 3 planners distintos a una colega"), se suma después como producto bundle separado.
- **Implica**: ningún cambio. Permanecen como producto único.
- **Admin**: sin tratamiento especial.

---

### [3.7] Sin `ProductVariant.surcharge` separado (2026-05-15)

- **Decisión**: `ProductVariant.price` es precio absoluto del variant. Sin campos extra de upcharge / surcharge / multiplicador.
- **Rationale**: KISS. Cualquier upcharge (ej. acabado glossy +20%) se refleja directo en `price`. Si más adelante se complejiza (descuentos cruzados, bundles), se suma como `PricingRule` separado (decisión 3.8).
- **Implica**: ningún cambio de schema.
- **Admin**: edita `price` por variant.

---

### [3.8] `PricingRule` reservada como concepto futuro (2026-05-15)

- **Decisión**: tabla `PricingRule` (descuentos cruzados, bundle pricing, tiered volume) NO se implementa hoy. Se documenta como concepto en Notas Laterales para retomar cuando volumen real lo justifique (probablemente Fase 6+ B2B avanzado).
- **Rationale**: principio YAGNI ("You Aren't Gonna Need It"). Cualquier pricing complejo hoy se puede modelar con cupones (decisión 3.9) sin tocar schema.
- **Implica**: ningún cambio hoy. Nota lateral N4 nueva.

---

### [3.9] Cupones Fase 1 productivos (2026-05-15)

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
  id          String   @id @default(cuid())
  couponId    String
  coupon      Coupon   @relation(fields: [couponId], references: [id])
  customerId  String?
  customer    Customer? @relation(fields: [customerId], references: [id])
  orderId     String   @unique
  order       Order    @relation(fields: [orderId], references: [id])
  appliedAt   DateTime @default(now())
  amount      Int      // descuento aplicado en COP centavos
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

- Input "¿Tienes un código?" en `/carrito`
- Server action valida + aplica + crea `CouponUsage` al completar order
- Breakdown del carrito muestra descuento aplicado
- Auto-apply opcional vía URL `?promo=CODE` (futuro)

#### Admin `/admin/cupones`

- Lista paginada con filtros (activo / expirado / pausado / agotado)
- Form crear / editar: code (auto uppercase + slug-safe), tipo, valor, restricciones (multi-select categorías + productos), mínimos, vigencia, max usos
- Métricas básicas por cupón: % utilización, total descontado COP, top clientes que lo usaron
- Botón "Pausar" (sin eliminar)

#### NO incluido en Fase 1 (futuro)

- Bundle 2x1 / 3x2 (requiere lógica compleja cart de items)
- Welcome coupon automático al signup (ADR-031 lo prevé Fase 5)
- Códigos únicos one-time personalizados por cliente
- QR en empaque físico
- Cupones encadenados / multi-uso simultáneo

- **Implica**:
  - Migración Prisma: 6 campos + 1 tabla.
  - Endpoint público + admin CRUD + UI cart.
  - Validación + creación de `CouponUsage` al confirmar order (cruza con Fase 4 checkout).
- **Admin**: pantalla completa nueva `/admin/cupones`.

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
    packaging: "STANDARD_BAG" | "GIFT_BOX" | "BULK_BOX";  // ver 4.4
    includes: string[];         // ["6 imanes 5×5cm", "Tarjeta personalizada", "Sticker Lucams"]
    careInstructions?: string;  // microcopy cuidado
    countryOfOrigin: "CO";      // siempre Colombia
  }
  ```
- **Rationale**: hoy información dispersa en `description` + `personalizationSchema`. Estructurarla permite (a) cumplir Ley 1480 art. 23 con datos completos, (b) que el bot AI-ready responda exacto, (c) que el cliente vea ficha técnica clara.
- **Implica**: migración Prisma + Zod schema en `features/products/physical-specs-schemas.ts`. Render en PDP como sección "Ficha técnica".
- **Admin**: edita campos individuales desde `/admin/productos/[id]` con UI tipada (no JSON crudo).

---

### [4.2] Garantía + tiempos directo en `Product` (2026-05-15)

- **Decisión**: sumar 3 campos a `Product`:
  - `warrantyMonths: Int @default(12)` — Ley 1480 art. 11 mínimo 12 meses
  - `productionDays: Int @default(3)` — días hábiles producción
  - `shippingDaysMin: Int @default(2)` y `shippingDaysMax: Int @default(5)` — días hábiles envío
- **Rationale**: campos estructurados queryables por bot + visibles al cliente en PDP. Cumplen requisito Ley 1480 art. 23 (plazos de entrega).
- **Implica**: migración Prisma. Render PDP: "Listo en X días + envío Y-Z días = recibís entre el {fecha_min} y el {fecha_max}". Bot responde "Tu pedido llega aproximadamente en X-Y días hábiles".
- **Admin**: edita por producto desde `/admin/productos/[id]`. Defaults razonables para que Lucy no tenga que tocar producto a producto.

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
- **Rationale**: simplifica producción + comunicación. Cliente ve thumbnail del empaque en PDP. Bot responde "Llega en bolsa kraft con sticker Lucams" o "Llega en caja regalo kawaii con cinta".
- **Implica**: enum Prisma + thumbnails curados de cada tipo (Lucy genera con IA, ver Nota N1).
- **Admin**: select del enum por producto desde `/admin/productos/[id]`.

---

### [4.5] Información impresa física al cliente (proceso operativo) (2026-05-15)

- **Decisión**: cada paquete físico incluye estándar:
  - Tarjeta de agradecimiento Lucams kawaii.
  - QR a `/garantia?orderId=X` (futuro Fase 4) para ejercer garantía.
  - Sticker exclusivo Lucams (uno random de la línea Coleccionables).
  - Microcopy: "Si algo no te llegó perfecto, te respondemos en hola@lucamsshop.com · WhatsApp X".
- **Rationale**: experiencia de unboxing diferencial. Trust building + retención. Sticker random fomenta colección.
- **Implica**: NO es schema. Es proceso operativo. Documentar en `docs/OPERATIONS.md` sección "Empaque y unboxing".
- **Admin**: configura microcopy y QR base desde `/admin/contenido/configuracion` (CmsSetting nuevo: `UNBOXING_MICROCOPY`).

---

### [4.6] Garantía 12 meses legal mínimo (2026-05-15)

- **Decisión**: `warrantyMonths` default 12 meses cumpliendo Ley 1480 art. 11. Sin extensiones por marketing.
- **Rationale**: cumple obligación legal. Cubre productos defectuosos por descascarado / decoloración / desimantación. Extender por marketing solo si Lucy lo decide explícitamente para un producto puntual (cambio admin per-producto).
- **Implica**: ninguna feature extra. Página `/legal/garantias` ya documenta proceso.
- **Admin**: Lucy puede override por producto (`warrantyMonths: 18` para vidrio premium por ejemplo) si quiere diferenciador comercial.

---

### [4.7] Tracking visible al cliente — dependencia Fase 4 (2026-05-15)

- **Decisión**: cuando exista `Order` (Fase 4) + Aveonline integrado (4.10), cada order tiene `trackingUrl` que se envía por email + visible en `/mi-cuenta/pedidos/[number]`.
- **Rationale**: cliente puede consultar status sin pedir por WhatsApp. Reduce carga soporte. Cumple Ley 1480 (transparencia entrega).
- **Implica**: dependencia bloqueante con Fase 4 (Orders) + decisión 4.10 (Aveonline). Documentado en Notas Laterales.
- **Admin**: ve tracking status desde `/admin/pedidos/[id]` con link directo al portal Aveonline.

---

### [4.8] Productos NONE con `productionDays: 1` (2026-05-15)

- **Decisión**: productos con `personalizationKind = NONE` (Coleccionables, Juegos, packs prediseñados sin personalización) tienen `productionDays: 1` (ya en stock, listo para despachar al día siguiente).
- **Rationale**: diferenciador comercial real. Cliente prefiere "llega en 3 días" vs "llega en 8 días". Empuja conversión hacia Coleccionables prediseñados.
- **Implica**: seed declara `productionDays: 1` para Coleccionables + Juegos.
- **Admin**: si Lucy se queda sin stock, manualmente cambia a 3-5 días desde admin hasta reabastecer.

---

### [4.9] AI-ready: `physicalSpecs` queryable por bot (2026-05-15)

- **Decisión**: API `/api/catalog/products/[slug]` (decisión 2.10) incluye en su payload el `physicalSpecs` completo + `warrantyMonths` + `productionDays` + `shippingDaysMin/Max`.
- **Rationale**: cumple principio 2.11 (DB = fuente de verdad). Bot Fase 5+ responde:
  - "¿De qué material es el Fotoimán Polaroid?" → lee `physicalSpecs.material`.
  - "¿Cuánto demora en llegar?" → calcula `productionDays + shippingDaysMin/Max`.
  - "¿Qué incluye el Box Día Madre?" → lista `physicalSpecs.includes`.
  - "¿Tiene garantía?" → lee `warrantyMonths`.
- **Implica**: endpoint ya planeado en 2.10. Payload se enriquece con los campos nuevos.
- **Admin**: edita en `/admin/productos/[id]`.

---

### [4.10] Logística Aveonline como proveedor primario + interface `ShippingProvider` (2026-05-15)

- **Decisión**: arrancar con **Aveonline** (agregador multi-carrier colombiano: Servientrega, Envia, TCC, Coordinadora, Domina, Interrapidísimo, Saferbo) detrás de interface `ShippingProvider` para permitir swap futuro.
- **Rationale**:
  - **Multi-carrier permite al cliente elegir flete más barato** → conversión sube en mercado colombiano sensible al precio del envío.
  - **Cobertura 90% nacional con COD** vs 1.100 destinos Coordinadora.
  - **Resiliencia**: si un carrier tiene problema operativo, Lucams sigue operando con otro.
  - **Lucy cura oferta** desde admin (qué transportadoras habilitar).
- **API design verificado**:
  - Base URL `https://app.aveonline.co/api`.
  - Auth JWT 1h vigencia (refresh server-side con cache).
  - Endpoints: autenticación, cotización multi-carrier, crear guía, tracking, solicitud recogida, webhook estados.
  - Estilo RPC POST con `tipo` discriminator (encapsulado en `lib/aveonline.ts`).
- **Riesgos mitigados**:
  - Token 1h → cache + auto-refresh.
  - Webhook sin HMAC documentado → IP whitelist + validación de existencia + estado monotónicamente avanza. Pedir HMAC a soporte.
  - Recogida hasta 11am → UI admin avisa "Confirmar antes de 11am = sale hoy".
  - API legacy PHP → encapsulado en `lib/aveonline.ts` con interface limpia.
- **Pendiente verificación** (`pendiente verificación`):
  - Costo plan mensual Aveonline más bajo.
  - SLA latencia API (p95).
  - Política de logística inversa (devoluciones).
  - HMAC en webhook (preguntar a soporte).
  - Política sandbox vs producción.
- **ADR-039 nuevo** documenta arquitectura completa (interface, endpoints, cache JWT, manejo errores, fallback).
- **Implica**:
  - `features/shipping/provider.ts` con `ShippingProvider` interface (quote / createShipment / getTracking / getLabel / handleWebhook).
  - `features/shipping/aveonline.ts` implementa la interface contra el API de Aveonline.
  - Migración Prisma: `Order.shippingCarrier: String` (qué carrier de Aveonline se usó), `Order.trackingNumber`, `Order.trackingUrl`, `Order.labelUrl`.
  - Cron job: refresh JWT cada 55 minutos.
  - Webhook endpoint `/api/shipping/aveonline/webhook`.
- **Admin**:
  - `/admin/configuracion/logistica`: toggle por carrier habilitado (Servientrega/Envia/TCC/etc.), credenciales Aveonline (encrypted), ciudad/depto origen.
  - `/admin/pedidos/[id]`: ver carrier seleccionado por cliente + tracking + descargar etiqueta PDF.
- **ACCIÓN HUMANA REQUERIDA (Lucy)**:
  1. Crear cuenta comercial en `aveonline.co` + completar onboarding.
  2. Consultar a comercial Aveonline: costo plan, carriers disponibles para Bogotá origen, SLA, política logística inversa, HMAC webhook, sandbox.

---

### [5.1] `PersonalizationTemplate.kind` flag (EDITABLE | PREMADE) (2026-05-15)

- **Decisión**: extender `PersonalizationTemplate` con campo `kind: TemplateKind` enum con valores:
  - `EDITABLE` — base de diseño que el cliente selecciona en el estudio y completa con sus datos (foto, texto). Camino 1 con plantilla pre-cargada (decisión 1.9).
  - `PREMADE` — diseño ya impreso, cliente lo compra tal cual sin pasar por estudio. Coleccionables, Universos, Separadores temáticos.
- **Rationale**: schema único, mismo CRUD admin. La diferencia es comportamiento (estudio vs no-estudio), no estructura.
- **Implica**: migración Prisma + enum nuevo + filtro en queries (estudio solo carga `EDITABLE`).
- **Admin**: edita `kind` desde `/admin/plantillas/[id]`.

---

### [5.2] Producto NONE ↔ N templates PREMADE asociados (2026-05-15)

- **Decisión**: cada producto con `personalizationKind = NONE` (Coleccionables, Juegos, packs prediseñados) tiene N `PersonalizationTemplate` con `kind=PREMADE` asociadas vía `templateId.productId`.
- **UX cliente**:
  - Cliente entra a `/productos/coleccionables/harry-potter`.
  - Ve grid de N diseños HP (Casas Hogwarts, Criaturas, Objetos).
  - Click en uno → modal detalle + selector cantidad x4/x6/x9.
  - Click "Agregar al carrito" → cart con item `producto + variant + templateId`.
  - **NO** pasa por estudio.
- **Rationale**: cliente entiende producto-temático con N diseños internos. Más claro que "8 productos HP".
- **Admin**: gestión templates por producto desde `/admin/productos/[id]/plantillas`.

---

### [5.3] Diseño en `CartItem.metadata.templateId` — NO en variant (2026-05-15)

- **Decisión**: `ProductVariant` lleva solo dimensiones agnósticas (cantidad, tamaño, forma, acabado, color). El diseño elegido por el cliente se guarda en `CartItem.metadata.templateId`.
- **Rationale**: evita explosión de variants. Producto Coleccionables HP con 9 diseños × 3 cantidades = solo 3 variants (no 27). Cliente elige diseño separado en PDP.
- **Implica**: `CartItem.metadata: Json` ya existe en schema. Sumar Zod schema validando `{ templateId?: string }`. UI cart muestra preview del diseño elegido.
- **Admin**: en `/admin/pedidos/[id]` ve qué diseño compró el cliente.

---

### [5.4] Arranque ~30 prediseñados, escalar según tracción (2026-05-15)

- **Decisión**: NO lanzar con 100+ diseños. Distribución mínima viable inicial:
  - **Coleccionables Lucams** (6 productos): 3 diseños cada uno = 18 templates PREMADE.
  - **Coleccionables Universos** (8 productos): 1 diseño cada uno = 8 templates PREMADE.
  - **Separadores Lucams** (4 productos): 2 diseños cada uno = 8 templates PREMADE.
  - **Separadores Universos** (3 productos): 1 diseño cada uno = 3 templates PREMADE.
  - **Plantillas EDITABLES Camino 1** (Fotoimanes, Recuerdos, Calendarios): 2 por sub-cat = ~30 templates EDITABLE.
  - **Total arranque**: ~67 templates (~37 PREMADE + ~30 EDITABLE).
- **Rationale**: validar conversión antes de invertir Lucy + IA en generar 100+ assets. Datos de venta guían qué diseños expandir.
- **Implica**: cronograma Lucy de generación con IA + entrega de prompts curados por Claude (ver Nota N1).
- **Admin**: `/admin/plantillas` con vista de "qué generamos primero" según prioridad.

---

### [5.5] Pricing prediseñado igual a personalizable con upcharge configurable (2026-05-15)

- **Decisión**: por default, precio prediseñado = precio personalizable. `Product.premadeSurcharge: Int @default(0)` permite upcharge per-producto en %.
- **Rationale**: cliente percibe valor por diseño/marca, no por trabajo del cliente. Diferenciar precio penalizaría comodidad. Excepción Universos puede tener +10-15% por "diseño curado premium" + cubrir potencial costo legal futuro (decisión 1.7).
- **Implica**: migración Prisma + cálculo cart action aplica surcharge si `CartItem.metadata.templateId` apunta a template con `kind=PREMADE` Y producto tiene `premadeSurcharge > 0`.
- **Admin**: edita surcharge desde `/admin/productos/[id]` con slider 0-30%.

---

### [5.6] Combinar prediseñado + personalizado en mismo cart (2026-05-15)

- **Decisión**: cliente puede agregar al mismo carrito items personalizados (con estudio) + prediseñados (sin estudio) + variants distintos. Sin restricciones.
- **Rationale**: máxima flexibilidad UX. Cliente compra 1 pack Coleccionables HP prediseñado + 1 Fotoimanes Polaroid personalizado con sus fotos en mismo checkout.
- **Implica**: ningún cambio. Cart action ya soporta múltiples items con metadata distinto.

---

### [5.7] Canvas PREMADE = 1 capa image simple (2026-05-15)

- **Decisión**: para templates con `kind=PREMADE`, `canvasData` es JSON simple con 1 capa "image" apuntando al `previewUrl`. Sin áreas editables ni capas adicionales.
- **Rationale**: PREMADE es imagen final, no requiere editor. Simplifica producción.
- **Implica**: Zod schema diferenciado por kind. UI admin oculta campos editor para PREMADE.

---

### [5.8] UX dos flujos diferenciados visualmente (2026-05-15)

- **Decisión**: PDP de producto muestra ambos flujos cuando aplica:
  - **Flujo prediseñado puro** (kind=NONE): grid de templates PREMADE + click directo a cart con templateId.
  - **Flujo Camino 1 con plantilla** (kind≠NONE): grid de templates EDITABLE + click navega a `/estudio/[slug]?templateId=X` pre-cargado.
  - **Flujo Camino 2 personalizar desde cero** (kind≠NONE): botón "Personaliza desde cero" → estudio canvas vacío.
- **Rationale**: cliente entiende claramente cuál es la opción "rápida" (prediseñado o template aplicada) vs "personalizada completa".
- **Implica**: PDP rediseño con dos/tres secciones visuales según `personalizationKind`.
- **Admin**: ningún cambio (PDP renderea según data del producto).

---

### [5.9] Admin `/admin/plantillas` con filtros + métricas (2026-05-15)

- **Decisión**: pantalla admin `/admin/plantillas` con:
  - Filtro por `kind` (EDITABLE / PREMADE).
  - Filtro por producto asociado (o "Globales").
  - Filtro por estado (activo / archivado).
  - CRUD: crear / editar / archivar / reorder.
  - Subir thumbnail (generado con IA según Nota N1).
  - Métricas por template: cuántas veces se vendió, qué ingresos generó.
- **Rationale**: Lucy decide qué expandir vs archivar según datos reales de venta.
- **Implica**: ampliación de `/admin/plantillas` existente.

---

### [5.10] API AI-ready expone templates (2026-05-15)

- **Decisión**: endpoint `GET /api/catalog/products/[slug]` (decisión 2.10) incluye en payload el array de `templates` con `{ id, slug, name, kind, previewUrl, description }`.
- **Endpoint adicional**: `GET /api/catalog/templates?productSlug=X&kind=PREMADE` para query directa.
- **Rationale**: cumple principio 2.11. Bot Fase 5+ responde "Para Coleccionables Harry Potter tenemos 9 diseños: Casas Hogwarts, Criaturas Mágicas...".
- **Implica**: incluido en ADR-038 (decisión 2.10).
- **Admin**: ningún cambio (admin ya gestiona templates).

---

### [6.1] Wizard "ayudame a elegir" MVP (2026-05-15)

- **Decisión**: componente wizard accesible desde header (CTA "¿Buscas algo? 🔮") + desde `/productos` (CTA prominente).
- **4 preguntas guiadas**:
  1. **¿Para qué ocasión?** — multi-select de los 15 tags (Cumpleaños, Matrimonio, Día Madre, Empresarial, etc.). Opción "Para mí mismo" ramifica scoring distinto.
  2. **¿Para quién?** — single-select: mí · pareja · familia · amigo · cliente empresa · niño · adolescente. Filtra `Product.idealFor`.
  3. **¿Cuánto quieres gastar?** — rangos COP: Menos de $30k / $30k-$80k / $80k-$200k / $200k+. Matchea contra precio variant más bajo del producto.
  4. **¿Personalizable o ya listo?** — personalizable (Camino 2 estudio) / prediseñado (Camino 1) / cualquiera. Matchea `personalizationKind`.
- **Output**: grid de 6-12 productos recomendados ordenados por score. Si 0 resultados, mensaje "no encontramos exacto, ¿relajamos el filtro X?".
- **Rationale**: cliente nuevo no quiere navegar 11 categorías. Wizard reduce fricción y aumenta conversión.
- **Implica**: ruta `/recomendador` + componente `WizardForm` + server action `recommendProducts(answers)` → llama `/api/catalog/recommend`.
- **Admin**: ningún cambio inicial. Métricas se ven en decisión 6.10.

---

### [6.2] Algoritmo scoring simple sin ML / embeddings (2026-05-15)

- **Decisión**: scoring de productos basado en puntos por match. NO ML, NO embeddings hoy.
- **Pesos del scoring**:
  - **+3** por match de tag ocasión.
  - **+2** por match destinatario en `Product.idealFor`.
  - **+1** por match rango precio (`ProductVariant.price` mínimo dentro del rango).
  - **+1** si `Product.isPersonalizable` matchea preferencia (o "cualquiera" suma sin penalizar).
  - **+0.5** boost discreto si `Product.isFeatured = true`.
- **Cutoff**: productos con score > 2 entran. Ordenados desc por score, tie-breaker `createdAt`.
- **Rationale**: simple, transparente, debuggeable. Suficiente para arranque. Embeddings semánticos (pgvector + ADR-036) se evalúan en Fase 5+ cuando bot tenga tracción.
- **Implica**: helper `features/recommendations/scoring.ts` con pesos configurables (futuro: settings desde admin).
- **Admin**: futuro Fase 5+ — settings de pesos del scoring desde `/admin/recomendaciones`.

---

### [6.3] Cross-sell en cart por ocasión dominante (2026-05-15)

- **Decisión**: widget "Completá tu regalo con..." debajo del cart antes de checkout.
- **Algoritmo**:
  - Detecta **ocasión dominante** sumando tags de productos actuales del cart.
  - Sugiere 3-4 productos de **OTRA categoría** que compartan esa ocasión.
  - Excluye productos ya en cart.
  - Ordena por `isFeatured` + alto rating.
- **Ejemplo**: cart tiene Recuerdos Matrimonio → sugiere Box Pareja + Cuadro con Foto + Glass Magnets.
- **Rationale**: incrementa AOV (Average Order Value). Cliente piensa en regalo completo, no solo un producto.
- **Implica**: componente `CartCrossSell` en `/carrito`. Server action `getCrossSellSuggestions(cartItems)`.
- **Admin**: configurar cantidad mínima de items cart para mostrar widget (`SiteSetting.CROSSSELL_MIN_CART_ITEMS` default 1).

---

### [6.4] Productos relacionados PDP con scoring 3 capas (2026-05-15)

- **Decisión**: reemplazar algoritmo actual "misma categoría" por scoring 3 capas en sección "También te puede gustar":
  - **Capa 1**: mismas ocasiones (peso 3). "Otros productos para matrimonio".
  - **Capa 2**: misma sub-categoría (peso 2). "Más en Fotoimanes Polaroid".
  - **Capa 3**: misma categoría (peso 1). Fallback actual.
- **Excluye**: producto actual + productos en cart si aplica.
- **Mostrar**: 4 productos.
- **Rationale**: descubrimiento más relevante. Cliente en producto matrimonio descubre cuadros / cajas relacionadas, no solo otros recuerdos.
- **Implica**: refactor `features/products/public-service.ts:listRelatedProducts` con scoring.
- **Admin**: ningún cambio.

---

### [6.5] Recomendaciones por historia cliente — dependencia Fase 4 (2026-05-15)

- **Decisión**: cliente logueado recibe sugerencias basadas en historial de pedidos (Fase 4 Orders).
- **Ejemplos**:
  - Compraste Fotoimanes Polaroid → te puede gustar Cuadro con Foto.
  - Compraste Recuerdos Bautizo hace 2 años → posiblemente quieras Recuerdos Primer Año (niño cumple 2).
- **Rationale**: retención + AOV en clientes recurrentes.
- **Implica**: dependencia bloqueante con Fase 4 (Orders productivos). Documentado en Notas Laterales (ver N6 abajo).
- **Admin**: futuro — métricas de tasa de re-compra desde `/admin/clientes`.

---

### [6.6] Bundles NO en Fase 1 — modelar con cupones (2026-05-15)

- **Decisión**: bundles / combos predefinidos (ej. "Pack Matrimonio Completo: 30 Recuerdos + 1 Cuadro + 1 Box") NO se implementan en Fase 1 con schema separado.
- **Solución alternativa**: Lucy crea cupón `MATRIMONIO10` (decisión 3.9) que aplica -10% cuando cart contiene combinación específica de productos. Cupones cubren el caso sin schema nuevo.
- **Rationale**: KISS + YAGNI. Bundle como entidad de schema solo se justifica cuando pattern de compra recurrente lo exija (Fase 6+ B2B avanzado). Mientras tanto Nota N4 `PricingRule` queda reservada.
- **Implica**: ningún cambio hoy.

---

### [6.7] Endpoint `/api/catalog/recommend` AI-ready compartido (2026-05-15)

- **Decisión**: endpoint público nuevo que sirve tanto al wizard UI como al bot futuro.
- **URL**: `GET /api/catalog/recommend?ocasion=X&destinatario=Y&precioMin=Z&precioMax=W&personalizable=B`.
- **Output**: array de productos con score + razón ("Match por ocasión: matrimonio + rango de precio").
- **Cache HTTP**: `public, max-age=600` (10 min — menos que catálogo porque depende de filtros y queremos data fresca).
- **Rate-limit**: 30/min por IP.
- **Bot consume directo**: "Para tu mamá en Día de la Madre con presupuesto $80k, te recomiendo: Cuadro 20×20 ($45k), Box Día Madre Mini ($45k), Set 6 Fotoimanes Corazón ($35k)".
- **Rationale**: principio 2.11 — mismo backend, dos consumidores. Wizard UI y bot evalúan los mismos productos con la misma lógica.
- **Implica**: route handler nuevo + helper compartido `features/recommendations/scoring.ts`.
- **Admin**: ningún cambio (admin no consume este endpoint).

---

### [6.8] Selección por OCASIÓN desde header (formalización de 1.5) (2026-05-15)

- **Decisión**: el menú "Por ocasión ▾" del header (decisión 1.5) navega a `/productos?ocasion=<slug>` con productos filtrados por tag.
- **Página dedicada**: cada ocasión tiene página `/ocasion/<slug>` con:
  - Descripción semántica de la ocasión (de `OcasionTag.description`).
  - Sugerencia cantidad (de `OcasionTag.suggestedQuantityRange`).
  - Grid de productos matcheados ordenados por score (decisión 6.2).
  - Subtítulo: "Lo mejor para [ocasión]".
- **Rationale**: SEO + UX. Cliente que busca "regalo matrimonio Colombia" llega a `/ocasion/matrimonio` con curaduría.
- **Implica**: ruta `/ocasion/[slug]/page.tsx` + meta tags SEO con `OcasionTag.description`.
- **Admin**: edita descripción y `suggestedQuantityRange` desde `/admin/ocasiones`.

---

### [6.9] `Category.featuredProductSlug` para destacar 1 producto por categoría (2026-05-15)

- **Decisión**: sumar campo `Category.featuredProductSlug: String?` para que Lucy destaque manualmente 1 producto top por categoría/sub-categoría.
- **UX**: en `/productos/<cat>` y `/productos/<cat>/<subcat>`, el producto destacado aparece primero en el grid con badge "Destacado".
- **Boost en scoring**: si una recomendación incluye varios productos de una categoría, el `featuredProductSlug` sube a la primera posición.
- **Rationale**: control editorial. Lucy decide qué empujar, no solo el algoritmo.
- **Implica**: migración Prisma + UI admin para seleccionar producto destacado.
- **Admin**: select desde `/admin/categorias/[id]` con autocomplete de productos de la categoría.

---

### [6.10] Admin `/admin/recomendaciones` con métricas básicas (2026-05-15)

- **Decisión**: pantalla admin nueva + tabla `RecommendationLog` para tracking.
- **`RecommendationLog` schema**:
  ```prisma
  model RecommendationLog {
    id              String   @id @default(cuid())
    sessionId       String   // anon cart session
    customerId      String?
    customer        Customer? @relation(fields: [customerId], references: [id])
    queryType       String   // "wizard" | "crosssell" | "related_pdp" | "api_bot"
    queryParams     Json     // filtros usados
    recommendedSlugs String[] // productos sugeridos
    clickedSlugs    String[] // los que cliquearon
    purchasedSlugs  String[] // los que terminaron en order
    createdAt       DateTime @default(now())
    @@index([sessionId, createdAt])
  }
  ```
- **Métricas en `/admin/recomendaciones`**:
  - Click-through rate (CTR) por queryType.
  - Conversion rate (cuántas recomendaciones terminan en compra).
  - Top búsquedas del wizard (qué ocasiones / presupuestos preguntan).
  - Productos con 0 ocasiones asignadas (gap data — Lucy completa).
  - Top productos recomendados vs top efectivamente comprados (efectividad del scoring).
- **Rationale**: datos para evolucionar pesos del scoring (decisión 6.2) en Fase 5+ con embeddings si lo justifica.
- **Implica**: migración + tracking en cada `/api/catalog/recommend` call + dashboard.
- **Admin**: pantalla dashboard con recharts (ya instalado).

---

### [7.1] Sidebar de filtros con 9 dimensiones + orden (2026-05-15)

- **Decisión**: layout `/productos` con sidebar izquierda 280px (desktop) o `<Sheet>` drawer (mobile).
- **9 dimensiones de filtro**:
  1. Categoría (multi-select chips)
  2. Sub-categoría (multi-select condicional a cat seleccionada)
  3. Ocasión (multi-select chips, 15 tags)
  4. Precio (slider COP min-max basado en variants reales del catálogo)
  5. Personalización (chips: Personalizable / Prediseñado / Cualquiera)
  6. Forma (chips: Rectangular / Circular / Corazón — solo aparece si la cat seleccionada tiene varias formas)
  7. Solo con descuento (toggle)
  8. Destacados (toggle)
  9. En stock (toggle, futuro Fase 4 inventario)
- **Dropdown orden** arriba del grid: Recientes / Precio ↑ / Precio ↓ / Más comprados / Destacados.
- **Implica**: componente `<CatalogFilters>` + state management con `searchParams`.

---

### [7.2] Filtros condicionales según contexto (2026-05-15)

- **Decisión**: filtros disponibles se calculan dinámicamente según qué variants existen en los productos del contexto. NO hardcoded.
- **Ejemplos**:
  - `/productos` global: todos los 9 filtros aplican.
  - `/productos/foto-imanes`: aparece "Forma" porque hay productos con distintas formas.
  - `/productos/foto-imanes/circulares`: NO aparece "Forma" (todos son circulares); aparece "Tamaño" porque hay 5/6/8 cm.
  - `/productos/recuerdos`: NO aparece "Forma" (todos rectangulares); aparece "Cantidad" porque variants difieren mucho.
- **Implica**: helper `features/catalog/filters.ts:computeAvailableFilters(productos)` que genera lista de filtros relevantes.
- **Admin**: complementa decisión 7.6 (override manual de filtros visibles).

---

### [7.3] URL sync con searchParams Next.js (2026-05-15)

- **Decisión**: estado de filtros se persiste en URL via `searchParams` Next.js.
- **Ejemplo**: `?categoria=foto-imanes&ocasion=matrimonio&precioMin=20000&precioMax=80000&forma=corazon&order=price_asc`.
- **Rationale**: links compartibles + SEO + back/forward navigation funciona.
- **Implica**: hooks `useFilterParams()` + `useRouter().replace()` sin reload.

---

### [7.4] Chips de filtros activos arriba del grid + Limpiar todos (2026-05-15)

- **Decisión**: chips visuales arriba del grid mostrando filtros aplicados, cada uno con × para quitar individualmente. Link "Limpiar todos los filtros" al final.
- **Implica**: componente `<ActiveFilterChips>`.

---

### [7.5] Empty state kawaii cuando 0 resultados (2026-05-15)

- **Decisión**: cuando filtros generan 0 productos, mostrar empty state con mascote Lucams + microcopy "No encontramos exacto, ¿probás relajar el filtro X?" con sugerencias del filtro que más restringe.
- **Implica**: componente `<EmptyState type="filter_no_results">` + helper para detectar filtro más restrictivo.

---

### [7.6] `Category.visibleFilters` configurable por admin (2026-05-15)

- **Decisión**: schema `Category.visibleFilters: String[] @default([])` con array de keys de filtros habilitados. Vacío = todos los filtros disponibles aplican (default decisión 7.2). No vacío = override manual.
- **Ejemplo**: en Coleccionables Lucy oculta "Personalización" porque todos son prediseñados.
- **Implica**: migración Prisma + UI admin con checkboxes de filtros por categoría.
- **Admin**: `/admin/categorias/[id]` con sección "Filtros visibles" multi-select.

---

### [7.7] Endpoint `/api/catalog/filters` AI-ready compartido (2026-05-15)

- **Decisión**: endpoint público nuevo `GET /api/catalog/filters?categoria=X&subcategoria=Y` retorna:
  - Filtros disponibles en ese contexto (calculados por 7.2 + override 7.6).
  - Rangos válidos por filtro (precio min/max real, formas/tamaños/cantidades disponibles).
  - Facet count: cantidad de productos por valor (ej. "23 productos circulares 5cm").
- **Bot consume**: "En Fotoimanes Circulares hay productos de 6/9/12 unidades en 5/6/8 cm Ø, precio entre $X y $Y".
- **Cache HTTP**: `public, max-age=3600` (filtros cambian raramente).
- **Implica**: route handler + helper compartido con UI.

---

### [7.8] Search bar extendida (2026-05-15)

- **Decisión**: search fuzzy pg_trgm existente se extiende para incluir `Product.richDescription + idealFor + tags ocasión` (decisión 2.10).
- **Rationale**: cliente busca "regalo aniversario" y matchea con productos cuyo `idealFor` contiene "aniversario" aunque el `name` no lo diga.
- **Implica**: migration nueva con índice GIN sobre los campos extendidos + update server action search.

---

### [7.9] Performance — índices compuestos + cache HTTP (2026-05-15)

- **Decisión**: medidas de performance temprana:
  - **Índices compuestos Prisma** para queries frecuentes:
    - `@@index([categoryId, isActive, deletedAt])` en Product
    - `@@index([categoryId, isPersonalizable, isActive, deletedAt])` en Product
    - GIN sobre `richDescription + name + idealFor` (decisión 7.8)
  - **Cache HTTP** en `/api/catalog/products` por hash de query params: `public, max-age=300` (5 min).
- **Rationale**: 60+ productos × 9 dimensiones de filtro escala mal sin índices. Cache reduce queries DB en navegación con mismos filtros.
- **Implica**: migration con índices + middleware cache.

---

### [7.10] `Category.defaultSort` configurable por admin (2026-05-15)

- **Decisión**: schema `Category.defaultSort: String? @default("recent")` con enum `"recent" | "price_asc" | "price_desc" | "most_purchased" | "featured"`.
- **Rationale**: Lucy controla primera impresión por categoría. Ej. en Coleccionables default "featured" para destacar los curados, en Recuerdos default "price_asc" para mostrar opciones económicas primero.
- **Implica**: migración + UI admin con select por categoría.
- **Admin**: `/admin/categorias/[id]` con dropdown "Orden default".

---

### [7.11] Filtros AI-suggested vía bot — diferido Fase 5+ (2026-05-15)

- **Decisión**: feature "bot sugiere filtros mientras cliente conversa" se difiere a Fase 5+ cuando bot tenga tracción.
- **Ejemplo futuro**: cliente le pregunta al bot "busco algo para mamá"; bot responde con productos + sugiere "¿agrego filtro 'Personalizable'? Mostraría productos más especiales".
- **Rationale**: requiere bot Fase 5+ funcionando primero. Hoy solo documentar.
- **Implica**: ninguno hoy. Nota lateral N7.

---

### [8.1] Sidebar admin permanente con 5 grupos (2026-05-15)

- **Decisión**: navegación admin migra de cards-only a sidebar persistente con 5 grupos:
  - **Catálogo**: Categorías · Productos · Variants · Plantillas · Ocasiones
  - **Comercial**: Cupones · Recomendaciones · Mayorista B2B
  - **Operación**: Pedidos (Fase 4) · Logística · Redirects
  - **Contenido**: CMS Blocks · Settings · Configuración
  - **Sistema**: Auditoría · Errores · Performance (existentes Fase F)
- **Rationale**: con 13+ pantallas, cards-only se vuelve inmanejable. Sidebar agrupado da navegación rápida.
- **Implica**: refactor `app/admin/layout.tsx` con `<AdminSidebar>` + responsive drawer mobile.
- **Admin**: dashboard mantiene cards de quick-access además del sidebar.

---

### [8.2] Multi-admin con roles `AdminRole` enum (2026-05-15)

- **Decisión**: `AdminUser` agrega campo `role: AdminRole` con enum:
  - `SUPERADMIN` — acceso total + DIAN + cupones + cambios estructurales
  - `EDITOR` — contenido CMS + descripciones de productos (no precios ni schema)
  - `OPERATOR` — pedidos + atención mensajes B2B (no edita catálogo)
- **Hoy**: solo SUPERADMIN activo (Lucy). Schema listo para sumar asistente futura.
- **Middleware**: verifica rol por ruta. Ej. `/admin/cupones/*` requiere SUPERADMIN; `/admin/contenido/*` permite EDITOR.
- **Implica**: migración Prisma + helper `lib/auth/require-role.ts` en cada server action sensible.
- **Admin**: pantalla `/admin/sistema/usuarios` (SUPERADMIN-only) para crear/editar admins con rol.

---

### [8.3] Bulk operations — solo exportar hoy (2026-05-15)

- **Decisión**: feature de bulk operations limitada a EXPORTAR.
- **Implementación inicial**: botón "Exportar" en `/admin/productos`, `/admin/categorias`, `/admin/cupones`, `/admin/ocasiones` que descarga CSV o JSON con todos los registros.
- **Diferido**: importar CSV (riesgo de corrupción + complejidad de validación) + archive batch (puede ser destructivo accidental).
- **Rationale**: KISS. Lucy puede usar exports para backup local + análisis externo. Importar y archive batch se evalúan si reporta fricción real.
- **Implica**: server action `exportEntityAction(entityType, format)` con stream para datasets grandes.
- **Admin**: botón dropdown "Exportar ▾" con opciones CSV / JSON.

---

### [8.4] Backup/snapshot manual desde admin (2026-05-15)

- **Decisión**: pantalla `/admin/sistema/backup` con botón "Descargar snapshot DB" que exporta JSON con tablas críticas:
  - `Product` · `Category` · `OcasionTag` · `PersonalizationTemplate` · `Coupon` · `CmsBlock` · `SiteSetting`
  - **NO** incluye: `Customer` / `Order` / `AdminUser` / `Cart` (datos sensibles / volumen alto).
- **Rationale**: Lucy mantiene backup local del catálogo + contenido. Útil para análisis, recuperación, compartir con contador.
- **Implica**: server action `exportSnapshotAction()` + ZIP de JSONs.
- **Admin**: 1 botón en pantalla simple. Recomendación: descargar mensualmente.

---

### [8.5] Card "Notificaciones" en dashboard con badges (2026-05-15)

- **Decisión**: dashboard suma card arriba con badges contadores:
  - Mensajes B2B sin responder (`SupportTicket` kind=B2B_INQUIRY status=OPEN).
  - Productos stock bajo (Fase 4).
  - Cupones por expirar esta semana.
  - Pedidos PENDING_PAYMENT > 24h (Fase 4).
  - **Alerta DIAN** si ingresos > 60% umbral (decisión 1.8).
  - Errores nuevos últimas 24h (referencia Fase F).
- **Rationale**: Lucy ve al instante qué requiere atención. Reduce navegación buscando estados.
- **UX**: badge rojo si count > 0, gris si count = 0. Click navega a la pantalla correspondiente.
- **Implica**: server action `getDashboardNotifications()` agrega todos los counters en 1 query.
- **Admin**: refresh on page load (sin real-time hoy).

---

### [8.6] Audit log visible `/admin/sistema/auditoria` (2026-05-15)

- **Decisión**: pantalla nueva con tabla paginada de `AdminActionLog` (modelo existe en schema).
- **Columnas**: timestamp · adminEmail · acción (`product.create`, `coupon.delete`, etc.) · entityType · entityId · IP · payload sanitizado (expandible).
- **Filtros**: por adminId / action / rango de fechas / entityType.
- **Export CSV**.
- **Rationale**: postmortem si algo sale mal. Compliance + auditoría para futura asistente EDITOR/OPERATOR.
- **Implica**: pantalla nueva + middleware `recordAdminAction` ya cableado (ver Fase A).
- **Admin**: SUPERADMIN-only.

---

### [8.7] Admin mobile responsive (2026-05-15)

- **Decisión**: TODAS las pantallas admin responsive con drawer sidebar en mobile.
- **Operaciones mobile-críticas**:
  - Responder mensajes B2B (atención al cliente).
  - Ver/cambiar status de pedidos (Fase 4).
  - Toggle stock de productos.
  - Aplicar cupón a cliente vía link.
  - Ver alertas DIAN.
- **Rationale**: Lucy opera el negocio desde celular (realidad e-commerce chico colombiano).
- **Implica**: layout admin responsive + breakpoints + drawer Radix.
- **Admin**: pruebas en 375px viewport mínimo.

---

### [8.8] Endpoints `/api/admin/insights/*` diferidos Fase 5+ (2026-05-15)

- **Decisión**: feature "bot operativo" (Lucy le pregunta al bot interno "¿cuántos pedidos esta semana?" desde admin) se difiere a Fase 5+ cuando bot Claude API esté funcionando.
- **Estructura ready**: cuando llegue, endpoints autenticados con cookie admin: `/api/admin/insights/orders/week`, `/api/admin/insights/coupons/expiring`, etc.
- **Rationale**: feature requiere bot funcional. Hoy solo documentar.
- **Implica**: ninguno hoy. Referenciado en Nota N7.

---

### [8.9] NO calendario operativo en MVP (2026-05-15)

- **Decisión**: vista calendario con recordatorios operativos (ej. "antes 11am confirmar pedidos") NO se implementa en MVP.
- **Reemplazo**: card "Notificaciones" (decisión 8.5) cubre casos críticos con badges sin necesidad de vista calendario.
- **Rationale**: feature nice-to-have que distrae de prioridades. Si Lucy lo pide después con uso real, se evalúa.

---

### [8.10] Standard UX no-técnico en todas las pantallas admin (2026-05-15)

- **Decisión**: TODAS las pantallas admin nuevas + existentes aplican consistentemente el standard validado en CMS (memoria `feedback_admin_ux_no_tecnico.md`):
  - **Labels en español llano** (no jerga técnica): "Cuerpo (markdown)" no "MD body". "Volver a esta versión" no "Revert".
  - **Cheatsheet siempre visible** donde aplique markdown / formato especial. No colapsable.
  - **Preview live side-by-side** en cualquier edición de contenido rico.
  - **Botones grandes con colores semánticos**: verde "Publicar", gris "Guardar borrador", rojo "Archivar", azul claro "Cancelar".
  - **Notices con emojis 🟢🟡🔴** más legibles que badges para no-técnicos.
  - **Confirmaciones antes de acciones públicas** (publicar / archivar / eliminar).
  - **Edición inline** donde sea natural (toggle estado, editar nombre rápido).
  - **Fechas humanas es-CO**: "hace 2 minutos" / "el 12 de mayo a las 3:45 p.m." vía `Intl.RelativeTimeFormat`.
  - **Tuteo (no voseo)**: "Eliges", "Personalizas", "Cuéntanos" — NO "Eligís".
- **Rationale**: Lucy es la editora (no programadora). Friction técnica = errores + atraso.
- **Implica**: revisión de cada pantalla nueva en review. Patterns reusables en `components/admin/*`.
- **Admin**: trans-pantalla. Estándar de calidad.

---

## Notas laterales

> Temas que surgieron fuera del área activa, se retoman en su área correspondiente.

### [Nota N1] Generación de thumbnails con IA (cruza Áreas 5 y 8)

Decisión Lucy 2026-05-15: los thumbnails curados de cada plantilla NO se contratan a diseñador externo. Lucy los genera con IA (Midjourney / DALL·E / Flux / Stable Diffusion). Claude entrega prompts curados kawaii por categoría y sub-categoría, estructura del `canvasData` JSON con áreas editables vs fijas, convenciones de tamaño / aspect ratio para Konva. Se itera en consola hasta cerrar cada plantilla.

Cuando aterricemos Área 5 (Pool prediseñado): Claude redacta el set inicial de prompts (estimación: ~10-15 plantillas por categoría personalizable × 9 categorías personalizables = 90-135 prompts iniciales). Cuando aterricemos Área 8 (Admin): se define el editor visual de plantillas en `/admin/plantillas` para que Lucy suba thumbnail + defina layer editable vs fijo sin tocar JSON manual.

### [Nota N2] Admin transversal en cada decisión

Recordatorio Lucy 2026-05-15: cada decisión del plan debe explicitar su **Implicación admin** desde el inicio, no como pensamiento posterior. Aplicado a las 9 decisiones cerradas de Área 1; se mantiene como regla para Áreas 2-8.

### [Nota N3] Principio AI-ready transversal (decisión 2.11 expandida)

Lucy 2026-05-15: el catálogo y todo el sistema debe estar pensado para que un chatbot Fase 5+ (Claude API + RAG sobre DB) pueda responder consultas del cliente consultando DB estructurada, sin usar el LLM como fuente de verdad.

**Reglas operativas**:

1. **DB > LLM**: todo dato consultable por bot vive en DB con campo estructurado, no en strings dispersas en código.
2. **API pública estructurada**: cada dominio relevante (catálogo, CMS, ocasiones, plantillas) expone endpoints `/api/<dominio>/*` con JSON estable, cache HTTP, rate-limit.
3. **Descripciones ricas**: para cada entidad (producto, categoría, variant, plantilla, ocasión) hay un campo descripción rica markdown que el bot usa como contexto (no la columna `description` corta del listado).
4. **Audit + versionado** donde sea relevante (CMS lo tiene; catálogo se apoya en AdminActionLog + git log de seed).
5. **Sin secretos en API pública**: NO exponer `cost`, `margin`, datos internos. Si el dato es público debe estar en API; si es interno debe estar en admin only.
6. **Embeddings ready** (futuro Fase 5+): pgvector + ADR-036. Schema actual debe permitir indexar `richDescription` cuando llegue.

**Criterio de validación para Áreas 3-8**: cada decisión nueva debe responder: _"¿puede el bot responder esto correctamente consultando API/DB sin halucinar?"_. Si la respuesta es no, hay gap que cerrar antes de cerrar la decisión.

### [Nota N4] `PricingRule` reservada como concepto (decisión 3.8 expandida)

Para futuro Fase 6+ cuando B2B avanzado lo justifique. Concepto reservado:

```prisma
model PricingRule {
  id          String   @id @default(cuid())
  name        String
  appliesTo   Json     // { categories?: [], productSlugs?: [], minQuantity?: int }
  ruleType    PricingRuleType // VOLUME_TIER | BUNDLE_DISCOUNT | CUSTOMER_TIER
  tiers       Json     // [{ minQty: 50, discount: 5 }, { minQty: 100, discount: 10 }]
  isActive    Boolean  @default(true)
  validFrom   DateTime?
  validTo     DateTime?
  priority    Int      @default(0)
}
```

Hoy NO se implementa. Cualquier descuento que necesitemos modelar antes de tener `PricingRule` se hace con cupones (decisión 3.9). KISS / YAGNI. Reabrir solo cuando:

- B2B real exige descuentos automáticos por volumen sin requerir código manual.
- Bundles aparecen como pattern de compra frecuente (ej. "Pack matrimonio: 30 recuerdos + 1 cuadro = -15%").
- Cupones se sienten limitados.

### [Nota N6] Dependencias bloqueantes con Fase 4 (Orders productivos)

Acumulado de decisiones que requieren Orders productivos en Fase 4:

- **Decisión 4.7** — Tracking visible al cliente: `Order.trackingUrl` + email + `/mi-cuenta/pedidos/[number]`.
- **Decisión 1.8** — DIAN auto-cálculo `INGRESOS_ANUALES_REGISTRADOS` desde Orders PAID/DELIVERED.
- **Decisión 3.9** — `CouponUsage` creado al confirmar Order.
- **Decisión 4.10** — Aveonline crea guía al pasar Order a PAID.
- **Decisión 6.5** — Recomendaciones por historia cliente (lee Orders pasados).
- **Decisión 6.10** — `RecommendationLog.purchasedSlugs` se actualiza al confirmar Order.

Implementación de Orders (Fase 4) bloquea producción de TODAS estas features. Cuando aterricemos Fase 4, retomar.

### [Nota N7] Bot Fase 5+ — features dependientes

Features que dependen del chatbot AI funcionando (Fase 5+ con Claude API + pgvector ADR-036):

- **Decisión 7.11** — Filtros AI-suggested durante conversación con bot.
- **Decisión 6.10** futuro — Settings de pesos del scoring desde admin.
- Recomendaciones conversacionales (vs wizard step-by-step) — bot pregunta y va refinando.
- Q&A semántico sobre productos (cliente pregunta "¿este imán resiste la nevera del trabajo o se cae?" → bot consulta richDescription + careInstructions + responde).

Hoy todas las decisiones que documentan APIs AI-ready están listas para que el bot consume cuando se construya. No bloquean nada del plan actual.

---

## Próximas acciones

> 🟢 Plan consensuado. Las 8 áreas cerradas con **80 decisiones** documentadas.

### Resumen del plan cerrado (2026-05-15)

| Área                            | Decisiones          | Estado     |
| ------------------------------- | ------------------- | ---------- |
| 1 — Categorías                  | 9                   | 🟢 cerrada |
| 2 — Productos                   | 11 (2.5 descartada) | 🟢 cerrada |
| 3 — Cantidad / Tamaño + Cupones | 9                   | 🟢 cerrada |
| 4 — Producto físico + Aveonline | 10                  | 🟢 cerrada |
| 5 — Pool prediseñado            | 10                  | 🟢 cerrada |
| 6 — Selección / Recomendación   | 10                  | 🟢 cerrada |
| 7 — Filtros                     | 11                  | 🟢 cerrada |
| 8 — Panel admin                 | 10                  | 🟢 cerrada |
| **TOTAL**                       | **80 decisiones**   | ✅         |

### ADRs a redactar antes de codear

| ADR                | Tema                                                                           | Áreas que lo demandan   |
| ------------------ | ------------------------------------------------------------------------------ | ----------------------- |
| ADR-038            | API Catálogo RAG-ready (5 endpoints + schema enriquecido + tabla OcasionTag)   | 2.10 / 5.10 / 6.7 / 7.7 |
| ADR-039            | Logística Aveonline con interface `ShippingProvider`                           | 4.10                    |
| ADR-040 (opcional) | Filtros configurables por categoría + endpoint `/api/catalog/filters` AI-ready | 7.2 / 7.6 / 7.7         |

### Migraciones Prisma necesarias

Las migraciones se agruparán en sub-bloques temáticos para no romper datos:

1. **`add_subcategories_and_ocasiones`**: `Category.parentId`, `Category.richDescription`, `Category.useCase`, `Category.visibleFilters`, `Category.defaultSort`, `Category.featuredProductSlug`, `Category.activeFrom/Until`, tabla `OcasionTag`, tabla `ProductOcasionTag`.
2. **`add_product_rich_metadata`**: `Product.richDescription`, `whyChooseThis`, `idealFor` (Json), `physicalSpecs` (Json), `warrantyMonths`, `productionDays`, `shippingDaysMin/Max`, `minimumQuantity`, `maximumQuantity`, `premadeSurcharge`.
3. **`add_variant_description`**: `ProductVariant.description`.
4. **`add_template_kind`**: `PersonalizationTemplate.kind` (enum EDITABLE | PREMADE), default EDITABLE para los existentes.
5. **`add_coupon_advanced`**: `Coupon.appliesToCategories`, `appliesToProductSlugs`, `maxUsesPerCustomer`, `isPublic`, `description`, `requiresMinQuantity`. Tabla `CouponUsage`.
6. **`add_admin_roles`**: `AdminUser.role` enum SUPERADMIN | EDITOR | OPERATOR (default SUPERADMIN existentes).
7. **`add_recommendation_log`**: tabla `RecommendationLog`.
8. **`add_dian_settings`**: filas seed en `SiteSetting` categoría `FACTURACION` (6 settings DIAN).
9. **`add_shipping_fields_to_order`**: `Order.shippingCarrier`, `trackingNumber`, `trackingUrl`, `labelUrl` (preparado para Fase 4).

### Refactors críticos en seed

- **Renombrar 15 slugs** (decisión 2.1) + redirects 301 en `proxy.ts`.
- **Refactor Polaroid** a 9 variants multi-dim (decisión 3.1).
- **Migrar `pack-separadores-libros`** → 9 productos temáticos + soft-delete viejo (decisión 2.7).
- **Marcos**: renombrar `marcos-magneticos-cuadrados` → `marcos-magneticos` (decisión 2.8).
- **Crear sub-cats hijas** para las 11 categorías (decisión 1.3) — total ~50 sub-categorías.
- **Crear 11 sub-cats estacionales** con `isActive: false` (decisión 2.9).
- **Crear 12 productos placeholder** `isActive: false` para sub-cats nuevas (Baby Shower, Día del Niño, Amor y Amistad, Halloween, Año Nuevo, 8 Universos Coleccionables) — decisión 2.4.
- **Variants quantity x4/x6/x9 uniformes** en los 14 Coleccionables (decisión 3.5).
- **Seed 15 `OcasionTag`** con `description` + `monthHint` + `suggestedQuantityRange` (decisiones 1.5 / 3.4).

### Pantallas admin (13 mejoradas/nuevas)

| #   | Ruta                                               | Estado | Decisiones                   |
| --- | -------------------------------------------------- | ------ | ---------------------------- |
| 1   | `/admin/categorias`                                | mejora | 1.3 / 1.4 / 6.9 / 7.6 / 7.10 |
| 2   | `/admin/productos`                                 | mejora | 2.10 / 3.3 / 4.1 / 4.2 / 5.5 |
| 3   | `/admin/productos/[id]/variants`                   | mejora | 2.10 / 3.1                   |
| 4   | `/admin/ocasiones`                                 | nueva  | 1.5 / 2.10 / 3.4             |
| 5   | `/admin/plantillas`                                | mejora | 5.1 / 5.9                    |
| 6   | `/admin/cupones`                                   | nueva  | 3.9                          |
| 7   | `/admin/mensajes` (B2B + soporte)                  | nueva  | 1.6                          |
| 8   | `/admin/recomendaciones`                           | nueva  | 6.10                         |
| 9   | `/admin/contenido/configuracion` (cat FACTURACION) | mejora | 1.8                          |
| 10  | `/admin/dashboard` (notificaciones + DIAN card)    | mejora | 1.8 / 8.5                    |
| 11  | `/admin/configuracion/logistica`                   | nueva  | 4.10                         |
| 12  | `/admin/redirects`                                 | nueva  | 2.1 / 2.7 / 2.8              |
| 13  | `/admin/sistema/auditoria`                         | nueva  | 8.6                          |
| 14  | `/admin/sistema/backup`                            | nueva  | 8.4                          |
| 15  | `/admin/sistema/usuarios` (roles)                  | nueva  | 8.2                          |

### Endpoints públicos nuevos

| Endpoint                           | Decisión          |
| ---------------------------------- | ----------------- |
| `GET /api/catalog/categories`      | 2.10              |
| `GET /api/catalog/products`        | 2.10              |
| `GET /api/catalog/products/[slug]` | 2.10 / 4.9 / 5.10 |
| `GET /api/catalog/ocasiones`       | 2.10              |
| `GET /api/catalog/search`          | 2.10              |
| `GET /api/catalog/recommend`       | 6.7               |
| `GET /api/catalog/filters`         | 7.7               |
| `GET /api/catalog/templates`       | 5.10              |
| `GET /api/coupons/public`          | 3.9               |

Todos: cache HTTP, rate-limit, sin auth (excepto admin insights diferidos).

### Componentes UI nuevos / refactor

- `<MegaMenu>` con thumbnails curados de sub-cats (1.4)
- `<OcasionMenu>` dropdown header "Por ocasión ▾" (1.5)
- `<RecommendationWizard>` (6.1)
- `<CatalogFilters>` sidebar + drawer mobile (7.1)
- `<ActiveFilterChips>` (7.4)
- `<EmptyState>` kawaii (7.5)
- `<CartCrossSell>` widget (6.3)
- `<PDPTwoPathsHero>` con flujo prediseñado + Camino 1 + Camino 2 (5.8)
- `<TemplateGrid>` para PREMADE en PDP (5.2)
- `<CouponInput>` en cart (3.9)
- `<DashboardNotifications>` (8.5)
- `<AdminSidebar>` con 5 grupos (8.1)

### Acciones humanas requeridas (Lucy)

1. **Onboarding Aveonline** (decisión 4.10):
   - Crear cuenta comercial en `aveonline.co`.
   - Consultar a comercial: costo plan, carriers disponibles para Bogotá origen, SLA, política logística inversa, HMAC webhook, sandbox.
2. **Generación de plantillas con IA** (Nota N1):
   - ~30 prediseñados PREMADE iniciales + ~30 EDITABLE.
   - Claude entrega prompts curados kawaii por sub-categoría cuando arranquemos Área 5 implementación.
3. **Validar copy y descripciones**:
   - `richDescription` por producto (300-800 palabras semánticas).
   - `description` por variant (por qué elegir esta vs otra).
   - `description` por sub-categoría (qué es, para quién).
4. **Decisión DIAN** (decisión 1.8):
   - Coordinar con contador cuándo activar facturación electrónica.
   - Decidir proveedor cuando llegue (Alegra / Siigo / Facture — ADR-025).
5. **Definir 15 ocasiones** (decisión 1.5):
   - Confirmar lista + descripción + rango cantidad sugerido + mes destacado.
6. **Cupones iniciales** (decisión 3.9):
   - Lucy crea 3-5 cupones para lanzamiento (BIENVENIDA10, etc.).

### Estimación de implementación (rough)

| Bloque                                                   | Horas estimadas               | Dependencias            |
| -------------------------------------------------------- | ----------------------------- | ----------------------- |
| Migraciones Prisma (9 migrations)                        | 6-8h                          | Schema validado         |
| Seed refactor (slugs + sub-cats + productos placeholder) | 10-12h                        | Migraciones aplicadas   |
| Componentes públicos (MegaMenu, Filtros, Wizard, etc.)   | 35-50h                        | Productos seeded        |
| Endpoints API públicos (9) + ADRs                        | 20-25h                        | Schema + service layer  |
| Refactor catálogo `/productos` + sub-cats jerárquicas    | 15-20h                        | Endpoints + componentes |
| PDP rediseño dos caminos                                 | 12-15h                        | Templates en seed       |
| Sistema cupones (admin + UI cart + API público)          | 15-20h                        | Schema + Order skeleton |
| Admin sidebar + 7 pantallas nuevas                       | 40-50h                        | Schema completo         |
| Wizard recomendación + scoring + log                     | 12-15h                        | Productos + ocasiones   |
| Filtros sidebar + chips + URL sync                       | 15-20h                        | Endpoints filters       |
| Aveonline integration (`ShippingProvider`)               | 25-30h                        | Schema Order + ADR-039  |
| Tests (unit + integration + E2E mínimo)                  | 25-30h                        | Features completas      |
| **TOTAL**                                                | **~230-295 horas ingeniería** |                         |

> Realista: 4-6 semanas de trabajo focused con commits incrementales. Cada bloque cerrado con visual check Lucy + push a develop antes de seguir.

### Orden de ejecución sugerido (sub-bloques M.4.x)

1. **M.4.1 — Schema migrations** (todas las 9 migrations, sin cambio funcional aún).
2. **M.4.2 — Seed refactor** (slugs nuevos + sub-cats + placeholders).
3. **M.4.3 — Admin foundation** (sidebar + roles + auditoría + backup) → permite a Lucy operar admin mejorado.
4. **M.4.4 — Admin catálogo enriquecido** (productos / categorías / ocasiones / variants con campos nuevos).
5. **M.4.5 — APIs públicas catálogo RAG-ready** (9 endpoints + ADR-038).
6. **M.4.6 — Storefront sub-cats + mega-menú + filtros sidebar**.
7. **M.4.7 — PDP rediseño dos caminos + plantillas PREMADE**.
8. **M.4.8 — Wizard recomendación + cross-sell + relacionados** (decisiones 6.x).
9. **M.4.9 — Cupones** (admin + cart + API público).
10. **M.4.10 — Aveonline integration** (preparado para Fase 4 Orders).
11. **M.4.11 — Tests + documentación** (consolidar antes de merge a main).

### Decisiones pendientes operativas (Lucy fuera de Claude)

| Item                                                | Estado                         |
| --------------------------------------------------- | ------------------------------ |
| ADR-025 — Proveedor DIAN (Alegra / Siigo / Facture) | Pendiente decisión Lucy        |
| Onboarding Aveonline + costo plan                   | Pendiente                      |
| Decisión TUVT 2026 valor exacto                     | [pendiente verificación DIAN]  |
| Validación HMAC webhook Aveonline                   | Pendiente confirmación soporte |

### Riesgos identificados al cierre del plan

1. **Volumen de cambios**: 80 decisiones implican refactor amplio. Mitigación: orden M.4.x con commits incrementales y validación Lucy por bloque.
2. **Migración Polaroid 4→9 variants**: refactor del producto más visible. Mitigación: redirects 301 + tests E2E + visual check.
3. **Riesgo legal Coleccionables Universos** (decisión 1.7): Lucy lo asumió. Plan B: admin permite archivar sub-cat completa en 1 click si llega cease & desist.
4. **Generación de plantillas con IA** (Nota N1): Lucy depende de tiempo + iteración. Mitigación: lanzar con ~30 plantillas mínimo, escalar con tracción.
5. **Aveonline API legacy PHP**: encapsular en `lib/aveonline.ts`. Mitigación: interface `ShippingProvider` aísla el acoplamiento si el API rinde mal.

---

## Cierre del plan

🟢 **El plan está completo y listo para implementación.**

Próximo paso operativo: cuando Lucy confirme, abrir sub-bloque **M.4.1** y empezar por migrations Prisma. Cada commit incremental con typecheck + lint + format + Vercel preview + visual check Lucy antes de seguir.
