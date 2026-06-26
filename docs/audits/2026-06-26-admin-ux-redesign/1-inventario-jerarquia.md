Now I have the full picture. Let me compile the analysis.

# Dimensión 1: Inventario + Jerarquía Operacional

## Inventario completo de las 29 páginas /admin

| Ruta | Qué hace | CTA principal | Frecuencia esperada |
|---|---|---|---|
| `/admin/login` | Autenticación de admin | "Iniciar sesión" | Por sesión |
| `/admin/dashboard` | Home: 4 OpsCards + 4 KpiCards + 6 QuickLinks + Trazabilidad | Click a OpsCard urgente | **Diaria (cada apertura)** |
| `/admin/pedidos` | **Tabla** de pedidos (debería ser kanban) | "Ver pedido N" | **Diaria (varias veces)** |
| `/admin/pedidos/[number]` | Detalle de pedido (Aveonline retry, estados) | "Cambiar estado / generar guía" | **Diaria** |
| `/admin/clientes` | Listado de clientes con filtros | "Ver cliente" | Semanal |
| `/admin/clientes/[id]` | Customer 360 (incompleto) | "Ver pedidos/diseños" | Semanal/eventual |
| `/admin/resenas` | Moderación de reseñas pendientes | "Aprobar / Rechazar" | **Diaria (si hay)** |
| `/admin/productos` | Listado catálogo + activar/desactivar | "Nuevo producto" | Semanal |
| `/admin/productos/nuevo` | Creación de producto | "Guardar" | Mensual |
| `/admin/productos/[id]` | Edición producto (Lucy reporta **SOBRECARGADO**) | "Guardar / Publicar" | Semanal |
| `/admin/productos/[id]/variants` | Editor de variantes (stock, atributos) | "Guardar variante" | Semanal |
| `/admin/categorias` | Listado de categorías + jerarquía | "Nueva categoría" | Mensual |
| `/admin/categorias/[id]` | Edición de categoría | "Guardar" | Mensual |
| `/admin/ocasiones` | Tags transversales (Día de la madre, Amor, etc.) | "Nueva ocasión" | Estacional |
| `/admin/ocasiones/[id]` | Edición de ocasión | "Guardar" | Estacional |
| `/admin/cupones` | Códigos de descuento | "Nuevo cupón" | Quincenal |
| `/admin/email-templates` | CmsBlocks tipo EMAIL (asunto + cuerpo) | "Editar plantilla" | Mensual |
| `/admin/contenido` | Hub CMS (redirige a bloques) | "Ir a bloques" | Eventual |
| `/admin/contenido/bloques` | Listado de bloques de conocimiento (legales/FAQ/hero) | "Nuevo bloque" | Mensual |
| `/admin/contenido/bloques/nuevo` | Crear bloque | "Guardar" | Mensual |
| `/admin/contenido/bloques/[id]` | Editar bloque markdown | "Publicar" | Mensual |
| `/admin/contenido/configuracion` | Settings generales (WA, email, horario, redes) | "Guardar" | **Setup → ocasional** |
| `/admin/finanzas` | Dashboard financiero (KPIs ingresos + DIAN) | (lectura) | Semanal/mensual |
| `/admin/integraciones` | Estado en vivo Wompi/Aveonline/Resend/etc. | "Verificar / probar" | Mensual / cuando falla algo |
| `/admin/integraciones/aveonline` | Detalle Aveonline (cuenta, agentes, retry) | "Reintentar guía" | Eventual |
| `/admin/auditoria` | Log inmutable de acciones admin | (lectura) | Eventual (forense) |
| `/admin/usuarios` | Gestión de admins (solo SUPERADMIN) | "Promover cliente" | Setup |
| `/admin/redirects` | URLs legacy → nuevas (SEO) | "Nuevo redirect" | Mensual |
| `/admin/[...placeholder]` | **Catch-all** para rutas declaradas pero ausentes | Volver al dashboard | (no debería usarse) |

**Páginas que el sidebar promete pero caen al placeholder** (`admin-nav.ts:104-291`):
- `/admin/reclamos` (Fase 4)
- `/admin/plantillas` (Próximo)
- `/admin/recomendaciones` (Fase 4)
- `/admin/mayorista` (Próximo)
- `/admin/materiales`, `/admin/costos` (Fase 5)
- `/admin/canales/tienda`, `/admin/canales/mercadolibre` (Próximo)
- `/admin/bot` (Fase 5+)
- `/admin/metricas` (Fase 4)
- `/admin/performance` (Próximo)
- `/admin/mensajes` (Opcional)
- `/admin/password` (link en footer del sidebar — `admin-shell.tsx:321` — sin page.tsx)

## Jerarquía actual del sidebar

Fuente: `apps/web/lib/admin-nav.ts:78-293` (importado por `admin-shell.tsx:37,47`).

**11 áreas top-level**, todas mezcladas en una sola lista vertical sin separadores visuales:

1. Dashboard (leaf)
2. Ventas → Pedidos, Clientes, Reclamos*, Reseñas
3. Catálogo → Productos, Categorías, Ocasiones, Plantillas*, Recomendaciones*
4. Comercial → Cupones, Mayorista*, Redirects 301
5. Producción → Materiales*, Costos* (todo Fase 5)
6. Canales → Tienda*, MercadoLibre* (todo "Próximo")
7. Finanzas (leaf)
8. IA y Conocimiento → Base de conocimiento, Bot WhatsApp*
9. Analítica → Métricas*, Performance*, Auditoría
10. Configuración → General, Usuarios, Integraciones, Plantillas correo
11. Mensajes (leaf, "Opcional")

(*) badge `soon/phase4/phase5` → no clickeables, ocupan línea visual.

**Problemas estructurales del sidebar actual:**
- **11 grupos top-level** violan Miller's law (7±2). De esos 11, solo 5 tienen ítems realmente activos.
- **Mezcla cronologías**: lo que se usa hoy (Pedidos, Productos) está al mismo nivel visual que Fase 5 (Materiales, Bot, Mayorista) — Lucy escanea ruido.
- **No hay separador entre "operar" y "configurar"**: Finanzas (lectura mensual) está antes de Configuración, y Cupones (comercial diario) está enterrado en "Comercial" junto a Mayorista (Fase 5+).
- **Catálogo desordenado por afinidad técnica, no por tarea**: Productos, Categorías y Ocasiones cohabitan, pero variantes (`/productos/[id]/variants`) no aparece como entrada navegable.
- **"Mensajes" top-level y vacío**: ocupa slot premium sin contenido.
- **"Configuración › General"** apunta a `/admin/contenido/configuracion` — el URL no comunica que es la config maestra.
- **Sidebar single-column en desktop** (`lg:w-64` — `admin-shell.tsx:76`): scroll obligado en pantallas <1080px.

**Clicks para "ver pedidos del día"** desde cualquier punto:
- Hoy: si el grupo "Ventas" está cerrado → 1 click expandir + 1 click Pedidos = **2 clicks**. Si `defaultOpen=true` (lo es, `admin-nav.ts:87`) → **1 click**. Pero el dashboard ya tiene OpsCard Pedidos (1 click). Aceptable, pero "Pedidos pendientes" muestra `orderCount` (total), no pendientes reales (`dashboard/page.tsx:64,131`) — engaña.

## Jerarquía propuesta (agrupada por frecuencia operacional)

Reducir de 11 grupos a **5 secciones separadas visualmente con un divider y un eyebrow label**. Items "Próximo/Fase 4/Fase 5" se mueven a una sección colapsada al final (`Próximamente`) para no consumir cognición a diario.

### Sidebar reorganizado

```
─────── HOY ───────
🏠 Inicio                          (= dashboard, renombrar)
🛒 Pedidos               • badge
💬 Mensajes              • badge   (cuando exista; hoy oculto)
⭐ Reseñas               • badge
⚠️ Stock bajo            • badge   (link directo a productos?stock=low)

─────── CATÁLOGO ───────
📦 Productos
   ├─ Variantes          (sub-link contextual al estar en producto)
🗂️ Categorías
🎁 Ocasiones
🏷️ Cupones
✨ Plantillas Estudio                [Próximo]

─────── PERSONAS ───────
👥 Clientes
🛟 Reclamos                          [Fase 4]
🔑 Usuarios admin                    (solo SUPERADMIN)

─────── REPORTES ───────
💰 Finanzas
📈 Métricas                          [Fase 4]
📊 Performance                       [Próximo]
🧾 Auditoría
🚨 Errores                           [ausente, mandato #7]

─────── CONFIGURACIÓN ───────
⚙️ General                           (datos del negocio, WA, email)
📝 Bloques de contenido              (legales, FAQ, hero)
✉️ Plantillas de correo
🔌 Integraciones
↪️ Redirects 301
🤖 Bot WhatsApp                      [Fase 5+]
🏭 Producción + Costos               [Fase 5] (un solo placeholder)
🛍️ Canales adicionales               [Próximo] (un solo placeholder)
🤝 Mayorista B2B                     [Próximo]
```

**Cuenta**: 5 secciones × 3-6 ítems activos = **~15 ítems "vivos"** en total (vs 35+ líneas hoy contando placeholders). Las secciones tienen separador visual claro.

**Reglas de la propuesta:**
- **HOY** arriba del todo, items con **badge dinámico** (count de pendientes) — es el "panel operacional".
- **Inicio** sustituye "Dashboard" (palabra más cómoda para no-técnica, en línea con `feedback_admin_ux_no_tecnico.md`).
- Items con badge `[Próximo / Fase X]` se mantienen visibles pero apagados, agrupados al final de su sección — Lucy ve el roadmap sin que la confunda.
- "Stock bajo" como entrada directa con count (cuando OpsCard del dashboard se haga real).
- "Mensajes" desaparece del top-level hasta que tenga contenido (hoy ocupa peso visual sin valor).

## Flujos típicos diarios de Lucy (actual vs propuesta)

### Flujo 1: "Llego en la mañana, ¿qué pedidos nuevos hay?"
- **Hoy**: dashboard → ver OpsCard "Pedidos pendientes" (que muestra `orderCount` total, no pendientes — `dashboard/page.tsx:131`) → click → tabla `/admin/pedidos` → identificar PENDING manualmente. **3 clicks + lectura confusa**.
- **Propuesto**: sidebar "HOY › Pedidos (3)" badge muestra pendientes reales → click directo → **kanban** por estado (Nuevo → Pago confirmado → Producción → Empacando → Enviado). **1 click + lectura visual**.

### Flujo 2: "Llegó pago, hay que generar guía Aveonline"
- **Hoy**: `/admin/pedidos` → buscar por número en tabla → `/admin/pedidos/[number]` → botón "Generar guía". Si falla → ir a `/admin/integraciones/aveonline` para diagnosticar. **3-5 clicks, navegación de ida y vuelta**.
- **Propuesto**: kanban → arrastrar tarjeta de columna "Pago confirmado" → "Producción" → modal con CTA "Generar guía Aveonline" inline. Si falla, link contextual a integraciones embedido en el toast. **1-2 clicks**.

### Flujo 3: "Quiero saber qué se vendió esta semana"
- **Hoy**: `/admin/finanzas` (es leaf top-level — accesible en 1 click). Pero dashboard NO muestra ventas hoy/semana → ir a Finanzas. **1 click pero la home no informa**.
- **Propuesto**: el "Inicio" muestra fila KPI: Ingresos hoy / semana / mes con sparkline. Si quiere detalle → "REPORTES › Finanzas". **0 clicks para enterarse, 1 si quiere drill-down**.

### Flujo 4: "Llegó un reclamo del cliente X por WhatsApp"
- **Hoy**: `/admin/reclamos` cae al placeholder (no existe). Lucy navega `/admin/clientes` → buscar por nombre/email → `/admin/clientes/[id]` (Customer 360 incompleto) → no hay tab de reclamos. **3+ clicks y dead-end**.
- **Propuesto**: SearchBar global en el topbar (Cmd+K) → escribir nombre cliente → ver perfil con tab "Conversaciones/Reclamos" prellenada con su historial. O desde "PERSONAS › Reclamos" (cuando exista). **1-2 clicks**.

### Flujo 5: "Hay que activar un cupón para Día de la Madre"
- **Hoy**: `/admin/cupones` (enterrado en grupo "Comercial" junto a Mayorista y Redirects) → expandir grupo → click Cupones → "Nuevo". **3 clicks**.
- **Propuesto**: "CATÁLOGO › Cupones" visible siempre (categoría diaria) → click → "Nuevo". **2 clicks**. Bonus: en página de Ocasión "Día de la madre" tener CTA "Crear cupón asociado" inline.

### Flujo 6 (móvil, atendiendo WA): "¿Puedo confirmar este pedido desde el celu?"
- **Hoy**: drawer mobile (`admin-shell.tsx:104-131`) tiene los 11 grupos. Lucy abre menú → expande "Ventas" → "Pedidos" → tabla con scroll horizontal (`admin-page.tsx:166` `min-w-[640px]`). **Tabla NO está pensada para mobile**.
- **Propuesto**: vista mobile prioriza kanban como lista vertical por estado (cards), sidebar reducido a las 5 secciones de "HOY" como tabs inferiores tipo bottom-nav. **1 click + scroll vertical natural**.

## Findings principales

1. **Sobrecarga del sidebar — 11 grupos vs 7±2 de Miller's law.** `admin-nav.ts:78-293` declara 11 grupos top-level con un total de 30+ entradas; 13 de ellas son placeholders (`tone: "soon"/"phase4"/"phase5"`). El usuario gasta atención visual en items que ni siquiera puede clickear.

2. **No hay separación operacional vs setup.** Pedidos (diario), Cupones (semanal), Mayorista (Fase 5), Materiales (Fase 5) y Auditoría (eventual) están todos al mismo nivel visual sin agrupar por frecuencia de uso.

3. **El "Dashboard" no es el panel del día de Lucy.** Hoy es un menú secundario disfrazado: OpsCards con números engañosos (`orderCount` total, no pendientes — `dashboard/page.tsx:131`), Negocio sin trend, Acceso rápido duplica el sidebar, Trazabilidad enterrada. No responde "¿qué tengo que hacer hoy?".

4. **12 páginas declaradas en NAV pero ausentes** (caen al catch-all `[...placeholder]`): reclamos, plantillas, recomendaciones, mayorista, materiales, costos, canales/tienda, canales/mercadolibre, bot, metricas, performance, mensajes — más `/admin/password` linkeado en `admin-shell.tsx:321` sin page.tsx. Cada una rompe la promesa del sidebar.

5. **Inconsistencia URL ↔ etiqueta**: "Configuración › General" → `/admin/contenido/configuracion`. "Base de conocimiento" → `/admin/contenido/bloques`. El usuario no asocia "contenido" con esos ítems (`admin-nav.ts:223,261`).

6. **`/admin/pedidos` es tabla cuando el ROADMAP prometió kanban.** Para una operación diaria con cambios de estado frecuentes (PENDING → PAID → PRODUCTION → SHIPPED), la tabla obliga a editar pedido por pedido sin visión global del pipeline.

7. **El catch-all `[...placeholder]` enmascara dead-links.** En vez de mostrar 404 ruidoso, muestra "En desarrollo" con descripción contextual (lectura de `findNavItem` — `admin-nav.ts:299`). Es decisión correcta UX, pero da falsa sensación de que más cosas funcionan de las que realmente funcionan, lo que diluye confianza.

8. **No hay SearchBar global ni Cmd+K.** Para 29 páginas + búsqueda por SKU/número de pedido/cliente, Lucy navega siempre por sidebar — costo alto en clicks.

9. **Sidebar mobile sin priorización.** El drawer (`admin-shell.tsx:104-131`) replica los 11 grupos desktop. En mobile Lucy debería tener acceso instantáneo solo a "HOY" (Pedidos + Mensajes + Reseñas) — el resto colapsado.

10. **Footer del sidebar mezcla rol + tier.** El badge "Free" (`admin-shell.tsx:304`) junto a "Administradora" es información de pricing/dev, no operacional. Confunde porque sugiere que hay un tier Pro disponible (no lo hay durante desarrollo, mandato #2 de `CLAUDE.md`).

**Archivos clave para la refactorización propuesta:**
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/admin-nav.ts` (source of truth del NAV)
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-shell.tsx` (sidebar + topbar)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/dashboard/page.tsx` (rediseñar como "Hoy")
- `/home/ansible/workspaces/lucams_shop/apps/web/components/admin-page.tsx` (primitives — agregar `<AdminSection>` divider + bottom-nav mobile)