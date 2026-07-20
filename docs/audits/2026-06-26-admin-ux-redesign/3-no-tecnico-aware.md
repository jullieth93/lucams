I have enough evidence. Let me write the final audit output.

# Dimensión 3: Auditoría No-Técnico-Aware

## Reglas de oro UX no-técnico (recordatorio)
1. Labels en español LLANO — no jerga (ej. "Cuerpo (markdown)" no "MD body")
2. Cheatsheet SIEMPRE visible, no colapsable (markdown, atajos, etc.)
3. Preview live SIDE-BY-SIDE, no separate tabs
4. Botones GRANDES con colores SEMÁNTICOS: verde Publicar / gris Borrador / rojo Archivar
5. Notices con EMOJIS 🟢 publicado / 🟡 borrador / ⚫ archivado
6. Fechas HUMANAS es-CO ("hace 2 minutos" / "12 de junio a las 3:45 p.m.")
7. Edición INLINE donde posible (settings, valores simples)
8. CONFIRMACIONES antes de acciones públicas/destructivas
9. ES-CO TUTEO no voseo ("Eliges" no "Elegís")

---

## Audit por página crítica

### A) `/admin/dashboard` — `dashboard/page.tsx`

**✅ Cumple**
- Saludo cálido y tuteo correcto: "Hola, {firstName} 👋 / Bienvenida al panel. Aquí puedes gestionar..." (`dashboard/page.tsx:97-103`). Usa "puedes", no "podés". OK.
- Estado operativo claro con chip verde "Todo al día" o coral "{n} alertas" (`:104-116`). Semáforo correcto.
- OpsCards con descriptores humanos ("Por confirmar", "Sin gestionar", "Requieren tu visto bueno") (`:131,140,148,155`).
- KpiCards limpios sin jerga (`:168-171`).

**❌ Viola**
- "Sub-categorías" como label técnico aislado (`:170`). Lucy no usa "sub-categorías" mentalmente — debería decir "Categorías secundarias" o fusionarse con "Categorías".
- "Trazabilidad" como heading de sección (`:223`). Palabra rebuscada para no-técnico. Mejor "Historial y ajustes".
- Quick-link "Configuración general" descrito como "Email, WhatsApp, horario, redes y datos del negocio" mientras OTRO quick-link en la sección Trazabilidad dice "Ajustes del sitio" con la MISMA href `/admin/contenido/configuracion` (`:212-216` vs `:232-237`). Dos entradas al mismo lugar con nombre distinto → confunde.
- OpsCards apuntan a páginas ausentes (`/admin/reclamos`, sin filtro de stock real) — el contador "0 / Sin gestionar" miente cuando no hay módulo todavía. Lucy clicará y caerá al placeholder catch-all.
- Mezcla emoji ondulado 👋 con sparkles ícono — falta sistema consistente de emojis 🟢/🟡/⚫ que la memoria pide para estados.

**💡 Recomendaciones**
- Renombrar "Sub-categorías" → "Categorías secundarias" o quitar del bloque KPI (poco accionable diario).
- Cambiar "Trazabilidad" → "Historial y ajustes" o "Registro de cambios".
- Unificar los dos QuickLinks duplicados a `/admin/contenido/configuracion` — dejar uno solo llamado "Ajustes del negocio".
- Las OpsCards deshabilitadas (módulos pendientes) deben mostrar badge "Próximamente" en lugar de "0 / Sin gestionar".

---

### B) `/admin/pedidos` — `pedidos/page.tsx`

**✅ Cumple**
- Labels de estado traducidos al usuario: "Esperando pago", "En preparación", "Enviado", "Entregado" (`:45-54`). Esto SÍ está bien hecho — no expone `PENDING_PAYMENT` al UI.
- Badges con tono semántico por estado (`:56-65`).
- Subtitle natural: "{n} pedidos" pluralizado (`:106`).
- Empty state cálido: "Cuando el primer cliente complete checkout, aparecerá acá." (`:207`).

**❌ Viola**
- **Voseo argentino: "Probá quitar algún filtro o cambiar el texto de búsqueda."** (`:207`). Debe ser "Prueba quitar algún filtro…".
- Detalle wompi expuesto en celda: `wompi · 8d2f3a...` (`:236-240`). Lucy no necesita ver el transaction ID en el listado — la confunde y ocupa espacio. Se ve más como debugging que UX.
- Filtro de estado por defecto "Todos" pero NO hay filtro semantic-color en filas (la columna Estado lo tiene, OK; pero falta una visión rápida tipo Kanban — ROADMAP prometió Kanban operacional según contexto).
- "Items" como columna (`:216`) — debería decir "Productos" en español llano.
- Fecha formateada con `Intl.DateTimeFormat` "es-CO" (`:91-97`) pero formato `dd MMM yyyy, HH:mm` NO es relativa. Lucy mira esto día a día — viola la regla "fechas humanas" (no "hace 2 horas" / "ayer a las 3:45 p.m.").
- Header "Pedidos" no indica cuántos están pendientes vs entregados (KPIs micro embedidos) — Lucy abre la página para ACCIONAR los urgentes.
- Tracking number en mono pequeñito (`:266`) — útil pero al lado el carrier sin link → no se puede copiar/abrir tracking fácil.
- Subtitle dice "{total} pedidos · con filtros aplicados" pero no aclara cuáles filtros — hint pobre.

**💡 Recomendaciones**
- Reemplazar todo voseo: "Probá" → "Prueba", "Pegá" → "Pega", "Usalo" → "Úsalo".
- Quitar el `wompi · {tx}…` del listado; mostrarlo solo en el detalle del pedido.
- Renombrar columna "Items" → "Productos" (o "Cant.").
- Fecha relativa con tooltip absoluto: "hace 2 horas" + `title="12 jun 2026, 3:45 p.m."`.
- Pasar a vista **Kanban** (Esperando pago / En preparación / Enviado / Entregado) como ROADMAP definió; mantener tabla como vista alterna.
- Agregar "chips de filtro" como "Pendientes (3)", "En preparación (2)" en el header para que Lucy filtre con un click.

---

### C) `/admin/pedidos/[number]` — detalle del pedido

No lo leí en esta auditoría (no estaba en los archivos abiertos), pero el comentario en `pedidos/page.tsx:6-7` lo describe como "detalle + items + tracking + botones (descargar label PDF, reintentar shipment si falló, cambiar estado)". **Riesgo flag (sin file:line confirmado)**: la palabra "shipment" en el comentario sugiere que la jerga puede haber filtrado al UI. **Recomendación**: auditarlo en el siguiente pase con focus en botones de acción y nombres de estados.

---

### D) `/admin/productos` (listado) — `productos/page.tsx`

**✅ Cumple**
- Tuteo correcto en empty state: "Crea el primero…" "Prueba con otro término o cambia los filtros" (`:197-199`). OK.
- Filtro Estado tiene LABELS explicativos en cada `<option>`: "Solo activos (visibles en tienda) / Solo inactivos (ocultos pero recuperables) / Solo archivados (papelera)" (`:144-148`). **Esto es ejemplar** — exactamente el patrón que pide la memoria.
- Badge de estado visual con colores semánticos: Archivado=rose, Inactivo=slate, Destacado=amber, Activo=emerald (`:328-331`).
- Notices con tone success/warning al confirmar acciones (`:101-108`).

**❌ Viola**
- "soft-delete" expuesto en texto UI: **"Producto archivado (soft-delete)."** (`:102`). "Soft-delete" es jerga técnica pura. Lucy no necesita saber qué es soft-delete.
- Tabla muestra `/{slug}` debajo del nombre del producto (`:226`). El slug es URL técnica — para Lucy es ruido salvo que esté buscando un link específico.
- "Por nombre, SKU o slug…" como placeholder (`:127`). "Slug" es jerga.
- Empty state: "Crea el primero o usa **`make seed-products`** para poblar el catálogo demo." (`:198-199`). **Comando de terminal expuesto en UI.** Lucy no programa.
- Falta emoji en los badges de estado — solo color. La memoria pide 🟢/🟡/⚫ explícitos.
- Sin contador rápido por estado en el header (cuántos activos vs archivados vs destacados) — Lucy lo tiene que averiguar abriendo el filtro.

**💡 Recomendaciones**
- Cambiar `Producto archivado (soft-delete).` → `Producto archivado. Sigue en tu papelera por 30 días — puedes restaurarlo cuando quieras.`
- Ocultar `/{slug}` debajo del nombre, o reemplazar con badge "URL: lucamsshop.com/producto/{slug}" solo en hover/tooltip.
- Cambiar placeholder buscar: `"Por nombre, SKU o slug…"` → `"Buscar por nombre o código…"`.
- Cambiar empty state: `"Crea el primero o usa make seed-products para poblar el catálogo demo."` → `"Crea tu primer producto con el botón de arriba a la derecha."` (sin comando).
- Agregar emojis a badges: 🟢 Activo / 🟡 Inactivo / ⚫ Archivado / ⭐ Destacado.

---

### E) `/admin/productos/[id]` (editor) — `productos/[id]/page.tsx` + `product-form.tsx`

**Aquí está la queja directa de Lucy: "se siente SOBRECARGADO".** Es la peor página del admin desde la perspectiva no-técnica. Tiene **8 Cards apiladas verticalmente** con ~30 campos.

**✅ Cumple**
- Confirmación antes de archivar: `"¿Archivar "{name}"? Quedará oculto del storefront. Podés restaurarlo después editando el producto."` (`[id]/page.tsx:68`). PERO contiene voseo (ver abajo).
- Subtitle muestra SKU + slug (`:48`) — útil para identificación rápida.
- `whyChooseThis`, `idealFor`, `richDescription` traen hints largos y ejemplos inline (`product-form.tsx:305, 320, 337-352`). Buen patrón.
- Bloque de envío con tip en notice amber: "💡 Estos son los datos del **paquete final**…" (`:514-519`).

**❌ Viola — la lista es larga**

1. **SOBRECARGA visual sin tabs/pasos**: 8 cards seguidas:
   - Información básica
   - Precio
   - Visibilidad y flags
   - SEO
   - Contenido enriquecido (bot AI)
   - Comercial + Logística
   - Envío y empaque
   - (más adelante) Imágenes y Variantes vía links
   Todo en una sola pantalla scrolleable. Lucy se pierde.

2. **Voseo argentino confirmado** en confirm dialog: `"Podés restaurarlo después"` (`[id]/page.tsx:68`). Debe ser `"Puedes restaurarlo después"`.

3. **Jerga técnica en labels expuestos al UI**:
   - `"Slug (URL)"` con hint `"solo minúsculas, números y guiones — aparece en la URL del producto"` (`product-form.tsx:112-113`). "Slug" no significa nada para Lucy.
   - `"SEO Title"`, `"SEO Description"` (`:264, 277`). En inglés.
   - `"Surcharge templates PREMADE (%)"` (`:433-434`). Mezcla inglés/español/mayúsculas — **incomprensible**. Hint dice "Universos con licencia: 10-15%" — más jerga.
   - `"Visibilidad y flags"` (`:232`). "Flags" es palabra de programador.
   - `"Activo (visible en el storefront)"` (`:237`). "Storefront" es jerga (también aparece en `:222`, `:329-330`, `quick-actions.tsx:46`).
   - `"Destacado (aparece en home y prioridad en listings)"` (`:243`). "Home", "listings" — jerga.
   - `"Personalizable (incluye el estudio de personalización en vivo)"` (`:249`). OK pero podría ser más cálido.
   - `"se guarda internamente en centavos"` (`:195`). Detalle de implementación expuesto.

4. **Botones**:
   - Botón principal "Guardar cambios" usa `bg-slate-900` color gris/negro genérico (`:535`). La memoria pide colores semánticos brand. Botón debería ser verde "Guardar" o usar `bg-gradient-brand`.
   - Botón "Archivar" rojo está OK pero **sin contraste con un botón "Despublicar/Desactivar"**, que sería menos destructivo y más común (Lucy quiere ocultar 1 día, no archivar).
   - No hay botón **Publicar/Despublicar** explícito como en bloques CMS — la "publicación" se hace toggleando un checkbox "Activo" enterrado en una card. Para Lucy esto es opuesto a CMS bloques (incongruente cross-páginas).

5. **Sin preview**: la página NO muestra cómo se verá el producto en el storefront. Lucy edita un nombre, descripción, precio, y solo lo ve real abriendo la URL pública en otra pestaña.

6. **Fechas**: no aparecen "última edición" ni "creado el…" en formato humano.

7. **Imágenes** abajo de todo el form (`[id]/page.tsx:128`), separadas del bloque "Visibilidad" → flujo mental roto. Cliente lo primero que ve en storefront es la imagen, debería estar al principio.

8. **Variantes accesible solo vía botón en header** (`[id]/page.tsx:56-65`). Para 9 productos eso OK; cuando crezca el catálogo Lucy querrá verlas inline o más cerca.

9. **Empty state de categorías con comando**: `"No hay categorías. Crea una primero o corre make seed-products."` (`product-form.tsx:182-183`). **Otra vez comando de terminal en UI.**

10. **`📦 Envío y empaque` con emoji** pero el resto de cards sin emoji → inconsistencia.

**💡 Recomendaciones (refactor 360° en línea con feedback_redesign_profundo_no_superficial)**

1. **Partir el editor en TABS o pasos**: 
   - Tab 1: Básico (nombre, descripción, precio, imágenes) — lo que Lucy toca el 80% del tiempo
   - Tab 2: Categorización (categoría, ocasiones, destacado)
   - Tab 3: Envío y empaque (peso, dims)
   - Tab 4: Contenido enriquecido (bot AI) — colapsado por defecto
   - Tab 5: SEO — colapsado por defecto
   - Tab 6: Avanzado (slug, SKU manual, surcharge premade) — colapsado
2. **Renombrar todos los labels técnicos**:
   - "Slug (URL)" → "Dirección web del producto" + hint "Ej: lucamsshop.com/producto/**iman-foto-a4**"
   - "SKU" → "Código interno" (con hint "Lo usas tú para inventario")
   - "SEO Title" → "Título para Google"
   - "SEO Description" → "Descripción para Google"
   - "Visibilidad y flags" → "Visibilidad en la tienda"
   - "Activo (visible en el storefront)" → "🟢 Visible en la tienda"
   - "Destacado (aparece en home y prioridad en listings)" → "⭐ Mostrar en la página principal"
   - "Personalizable (incluye el estudio de personalización en vivo)" → "🎨 El cliente puede personalizarlo en el Estudio"
   - "Surcharge templates PREMADE (%)" → "Recargo por plantillas premium (%)" + hint "0 = mismo precio. Plantillas con licencia (Marvel, Disney, etc): 10-15%."
   - "se guarda internamente en centavos" → quitar.
3. **Cambiar confirm del Archivar**: `"Podés restaurarlo"` → `"Puedes restaurarlo"`.
4. **Botón principal** "Guardar cambios" → usar `bg-emerald-600` o `bg-gradient-brand` (no gris pizarra), tamaño grande, sticky bottom al estilo del editor de bloques (`block-editor-form.tsx:241-296`).
5. **Agregar botón "Despublicar"** (toggle visual del isActive) como acción de header, separada de "Archivar".
6. **Agregar preview thumbnail/ficha** al lado del form: cómo se ve en la tarjeta del listing storefront, así Lucy no tiene que abrir otra pestaña.
7. **Mover imágenes ARRIBA**, junto a nombre/descripción.
8. **Fecha humana** en subtitle: "Editado por última vez hace 3 horas" en lugar de solo "SKU: ... · slug: ...".
9. **Quitar mención `make seed-products`** del empty state de categorías → "No hay categorías todavía. Crea una primero en `/admin/categorias`."
10. **Emoji 📦 → o todas las cards tienen emoji, o ninguna.** Consistencia.

---

### F) `/admin/clientes` — `clientes/page.tsx`

**✅ Cumple**
- Filtros con labels claros: "Con pedidos", "Sin pedidos aún" (`:120-121`).
- Empty states humanos: "Aún no hay clientes registrados / Cuando el primer cliente se registre, aparecerá acá." (`:166, 170`).
- Badge verde para pedidos > 0 (`:202-203`).
- Documento muestra "CC 12345678" composición humana (`:196-198`).

**❌ Viola**
- **Voseo en empty state filtrado**: `"Probá quitar algún filtro o cambiar el texto de búsqueda."` (`:169`). Debe ser "Prueba quitar…".
- **Fecha NO relativa** — usa `dateFmt.format` con día/mes/año estático (`:60-64, 220`). Viola regla de fechas humanas. "Hace 2 días" sería más cálido.
- Columna "Puntos" con número crudo (`:217`). Sin contexto: ¿son puntos de loyalty? ¿qué hace Lucy con eso? Falta hint o tooltip.
- "Reseñas" como número (`:208-211`), pero la fila no es clickable para ir a las reseñas de ese cliente. Pierde affordance.
- No hay indicador semántico de "cliente VIP" / "cliente nuevo" / "cliente con compras recurrentes" — solo número de pedidos. Lucy necesita escanear visualmente.

**💡 Recomendaciones**
- "Probá" → "Prueba".
- Fechas relativas con tooltip absoluto: "Hace 12 días" + `title="12 jun 2026"`.
- Renombrar "Puntos" → "Puntos de fidelidad" o agregar tooltip.
- Hacer la fila entera clickable (link al perfil) — actualmente solo el "Ver perfil" → ChevronRight es clickable.
- Agregar badge "🆕 Nuevo" si registro < 7 días, "🔁 Recurrente" si pedidos ≥ 3.

---

### G) `/admin/contenido/bloques/[id]` — editor CMS (`block-editor-form.tsx`)

**Esta es la página más bien hecha del admin** desde la perspectiva de Lucy. Sirve como referencia para refactorizar las otras.

**✅ Cumple**
- Toolbar visual + preview SIDE-BY-SIDE (`:151-231`). Excelente.
- Estado con emojis explícitos: `🟢 Publicado en el sitio` / `🟡 Borrador — no se ve en el sitio` (`[id]/page.tsx:84-87`). Memoria cumplida.
- Notice de cambios sin guardar sticky-bottom con animación amber (`:241-264`). Muy bien para evitar pérdida de trabajo.
- Confirmaciones explícitas y descriptivas:
  - Despublicar: `"¿Despublicar "{title}"? El sitio dejará de mostrarlo y caerá al texto por defecto (fallback hardcoded en código)."` — bueno pero "fallback hardcoded en código" es jerga (ver abajo).
  - Archivar: `"¿Archivar el bloque "{title}"? Quedará oculto del sitio. Tu historial de versiones se conserva."` (`[id]/page.tsx:137`). Excelente.
- Toast post-guardar contextual: `"Borrador guardado. Cuando estés lista, dale a Publicar."` (`:71`). 
- Tuteo correcto: "Cuando estés lista", "Empieza a escribir a la izquierda...", "Una nota para acordarte" (`:71, 226, 145`).
- Cheatsheet siempre accesible pero colapsable + toolbar visual cubre lo común (`:172-210`).
- Botones con colores semánticos: Publicar=emerald, Despublicar=ghost neutro, Archivar=red (`[id]/page.tsx:107-150`).

**❌ Viola**
- "fallback hardcoded en código" en confirm de despublicar (`[id]/page.tsx:120`). Jerga programador. Lucy entenderá "fallback hardcoded" como "qué".
- Cheatsheet es `<details>` colapsable (`:173-210`). La memoria dice "Cheatsheet siempre visible, no colapsable". **Conflicto con memoria** — pero el código justifica "el toolbar cubre lo más usado, esto es referencia" (`:172`). Validar si Lucy realmente necesita los atajos visibles permanentemente, o si el toolbar visual hace el trabajo.
- Texto de hint dentro del placeholder: `"Acá va el contenido del bloque."` (`:303`). "Acá" en lugar de "Aquí" — mejor "es-CO" usar "aquí".
- "Volverá al contenido que tenía guardado antes" (`:97`). OK aunque podría ser más natural: "Volverá a la versión guardada que tenías antes."

**💡 Recomendaciones**
- Cambiar `"caerá al texto por defecto (fallback hardcoded en código)"` → `"caerá al texto por defecto que viene incorporado"` o simplemente quitar el paréntesis.
- Considerar volver el cheatsheet a panel lateral o footer permanentemente visible (validar con Lucy).
- "Acá" → "Aquí" en el placeholder.

---

### H) `/admin/integraciones/aveonline` — `aveonline/page.tsx`

**Esta página es la PEOR ofensora** en jerga técnica del admin para una operadora no-técnica.

**✅ Cumple**
- Tiene una sección "¿Cómo funciona?" (`:157-172`) — buen instinto pedagógico.
- Notice amber cuando falta secret (`:79-85`).

**❌ Viola — completa de jerga programador**

1. **Voseo argentino prominente** (`:81`, `:160-165`):
   - `"Generá uno con openssl rand -hex 32"`
   - `"agregalo a apps/web/.env.local"`
   - `"podés usar ngrok http 4000"`
   - `"usá tu dominio real"`
   - `"Registrá uno arriba"`

2. **Comandos de terminal y rutas de archivo en UI**:
   - `openssl rand -hex 32` en `<code>` (`:82`)
   - `apps/web/.env.local` en `<code>` (`:83`)
   - `ngrok http 4000` (`:161`)
   - `/api/webhooks/aveonline` ruta API expuesta (`:99-100`)

3. **Jerga completa**:
   - "webhook" (varias veces) — sin definición para no-técnico
   - "secret" como concepto
   - "AVEONLINE_WEBHOOK_SECRET" como nombre de variable de entorno expuesto literal (`:80`)
   - "endpoint" (`:101`)
   - "HTTPS", "URL pública" sin context
   - "registrar webhook" como acción
   - "tracking" (`:67`) mezclado con "estado de la integración"

4. **El subtitle**: "Gestión de webhooks de tracking + estado de la integración" (`:67`). Para Lucy esto es indescifrable.

5. La columna "URL" en la tabla muestra la URL completa en font mono pequeño (`:129-131`) — utilitario para programador, no para Lucy operando.

**💡 Recomendaciones**
Esta página necesita un rediseño completo si Lucy alguna vez la va a operar. Idealmente, mover toda esta complejidad a **Setup wizard one-shot** (Lucy lo configura una vez con el devops, y después solo ve "✅ Conectado a Aveonline · Tracking activo"). 

Mientras tanto, si debe seguir siendo manual:
- **Eliminar todo el voseo**: "Genera", "agrégalo", "puedes usar", "usa", "Registra".
- **Esconder los comandos terminal** dentro de un toggle "Mostrar instrucciones técnicas" para que Lucy no los vea normalmente.
- **Renombrar la página**: "Aveonline · Notificaciones de envío" en lugar de "Aveonline · Integraciones".
- **Subtitle no-técnico**: "Aquí Aveonline nos avisa cuando un pedido cambia de estado (en camino, entregado, etc.)."
- **Sección "¿Cómo funciona?"**: reescribir sin jerga. "Aveonline necesita poder llamarnos cuando un pedido cambia de estado…" → "Cuando un pedido se entrega, Aveonline nos avisa automáticamente — así no tienes que revisar manualmente."
- **Considera flagear toda la página como ACCIÓN HUMANA REQUERIDA: Configuración técnica** y dejarla solo para SUPERADMIN.

---

## Violaciones de voseo argentino encontradas en /admin

Archivo:línea — texto exacto que debe cambiarse:

| Archivo:línea | Voseo encontrado | Debe decir |
|---|---|---|
| `app/admin/login/actions.ts:79` | `"reintentar"` | OK (es infinitivo, no voseo) ✓ |
| `app/admin/(panel)/categorias/[id]/page.tsx:127` | `"podés reactivarla"` | `"puedes reactivarla"` |
| `app/admin/(panel)/clientes/[id]/page.tsx:203,249,345,381` | `"aparecerá acá"` x4 | `"aparecerá aquí"` x4 |
| `app/admin/(panel)/clientes/page.tsx:169` | `"Probá quitar algún filtro"` | `"Prueba quitar algún filtro"` |
| `app/admin/(panel)/clientes/page.tsx:170` | `"aparecerá acá"` | `"aparecerá aquí"` |
| `app/admin/(panel)/email-templates/page.tsx:96` | `"podés crear uno manual"` | `"puedes crear uno manual"` |
| `app/admin/(panel)/finanzas/page.tsx:91-92` | `"te muestro... avisame"` | `"te muestro... avísame"` (avisame sin tilde + sin imperativo voseo) → `"te muestro… avísame"` |
| `app/admin/(panel)/finanzas/page.tsx:142` | `"Qué verás acá"` | `"Qué verás aquí"` |
| `app/admin/(panel)/finanzas/page.tsx:189` | `"podés operar manualmente"` | `"puedes operar manualmente"` |
| `app/admin/(panel)/integraciones/aveonline/page.tsx:81-83` | `"Generá... agregalo"` | `"Genera... agrégalo"` |
| `app/admin/(panel)/integraciones/aveonline/page.tsx:103` | `"Registrá"` | `"Registra"` |
| `app/admin/(panel)/integraciones/aveonline/page.tsx:116` | `"Registrá uno arriba"` | `"Registra uno arriba"` |
| `app/admin/(panel)/integraciones/aveonline/page.tsx:161` | `"podés usar ngrok"` | `"puedes usar ngrok"` (mejor: esconder todo el bloque dev) |
| `app/admin/(panel)/integraciones/aveonline/page.tsx:165` | `"usá tu dominio real"` | `"usa tu dominio real"` |
| `app/admin/(panel)/integraciones/page.tsx:325` | `"tenés que hacer... Refrescá"` | `"tienes que hacer... Refresca"` |
| `app/admin/(panel)/pedidos/page.tsx:207` | `"Probá quitar algún filtro"` | `"Prueba quitar algún filtro"` |
| `app/admin/(panel)/pedidos/page.tsx:207` | `"aparecerá acá"` | `"aparecerá aquí"` |
| `app/admin/(panel)/productos/[id]/page.tsx:68` | `"Podés restaurarlo"` | `"Puedes restaurarlo"` |
| `app/admin/(panel)/redirects/create-redirect-form.tsx:33` | `"querés redirigir"` | `"quieres redirigir"` |
| `app/admin/(panel)/resenas/page.tsx:265` | `"aparecerá acá"` | `"aparecerá aquí"` |
| `app/admin/(panel)/contenido/bloques/[id]/block-editor-form.tsx:303` | `"Acá va el contenido"` | `"Aquí va el contenido"` |
| `app/admin/(panel)/integraciones/page.tsx:6` (comentario) | `"ella lo ve acá"` | comentario, no UI — OK (pero ideal `"aquí"`) |

**Total: ~20 strings UI con voseo a corregir.** Concentración mayor en `/integraciones/aveonline` (6) y `/finanzas` (4).

---

## Findings de copy técnico expuesto

Strings UI admin con jerga técnica innecesaria, en orden de severidad:

| # | Archivo:línea | Copy actual | Copy propuesto |
|---|---|---|---|
| 1 | `productos/page.tsx:102` | `"Producto archivado (soft-delete)."` | `"Producto archivado. Sigue en tu papelera por 30 días — puedes restaurarlo cuando quieras."` |
| 2 | `productos/product-form.tsx:112` | `"Slug (URL)"` | `"Dirección web del producto"` |
| 3 | `productos/product-form.tsx:113` | `"solo minúsculas, números y guiones — aparece en la URL del producto"` | `"Ej: lucamsshop.com/producto/iman-foto-a4. Solo letras minúsculas, números y guiones."` |
| 4 | `productos/product-form.tsx:127` | placeholder `"Por nombre, SKU o slug…"` | `"Buscar por nombre o código…"` |
| 5 | `productos/product-form.tsx:146-147` | `"SKU"` con hint `"código interno — mayúsculas, números, guiones"` | `"Código interno (SKU)"` con hint `"Lo usas tú para inventario."` |
| 6 | `productos/product-form.tsx:193` | `"Precio (en pesos COP)"` con desc `"Se guarda internamente en centavos. Aquí se digita en pesos enteros (sin decimales)."` | `"Precio (en pesos COP)"` desc `"Escribe el precio en pesos enteros — sin decimales."` (quitar el "centavos internamente") |
| 7 | `productos/product-form.tsx:232` | `"Visibilidad y flags"` | `"Visibilidad en la tienda"` |
| 8 | `productos/product-form.tsx:237` | `"Activo (visible en el storefront)"` | `"🟢 Visible en la tienda"` |
| 9 | `productos/product-form.tsx:243` | `"Destacado (aparece en home y prioridad en listings)"` | `"⭐ Mostrar como destacado en la página principal"` |
| 10 | `productos/product-form.tsx:249` | `"Personalizable (incluye el estudio de personalización en vivo)"` | `"🎨 El cliente puede personalizarlo en el Estudio"` |
| 11 | `productos/product-form.tsx:258` | `"SEO (opcional)"` | `"Aparecer en Google (SEO, opcional)"` |
| 12 | `productos/product-form.tsx:260` | `"Si no se completan, se usan name y description como fallback."` | `"Si los dejas vacíos, Google usa el nombre y la descripción del producto."` |
| 13 | `productos/product-form.tsx:264` | `"SEO Title"` | `"Título para Google"` |
| 14 | `productos/product-form.tsx:277` | `"SEO Description"` | `"Descripción para Google"` |
| 15 | `productos/product-form.tsx:295` | `"Contenido enriquecido (bot AI)"` | `"Información extra (para el bot de WhatsApp)"` |
| 16 | `productos/product-form.tsx:304` | `"Descripción rica (markdown 300-800 palabras)"` | `"Descripción larga (300-800 palabras)"` |
| 17 | `productos/product-form.tsx:433-435` | `"Surcharge templates PREMADE (%)"` hint `"0 = mismo precio. Universos con licencia: 10-15%."` | `"Recargo por plantillas premium (%)"` hint `"0 = mismo precio. Plantillas con licencia (Marvel, Disney, etc): 10-15%."` |
| 18 | `productos/product-form.tsx:182-183` | `"No hay categorías. Crea una primero o corre make seed-products."` | `"No hay categorías todavía. Crea la primera desde Categorías."` |
| 19 | `productos/page.tsx:198-199` | `"Crea el primero o usa make seed-products para poblar el catálogo demo."` | `"Crea tu primer producto con el botón de arriba a la derecha."` |
| 20 | `productos/page.tsx:226` | mostrar `/{slug}` debajo del nombre | esconder o tooltip "URL: lucamsshop.com/producto/{slug}" |
| 21 | `productos/quick-actions.tsx:46` | `title="Ocultar del storefront"` / `"Mostrar en storefront"` | `"Ocultar de la tienda"` / `"Mostrar en la tienda"` |
| 22 | `productos/[id]/page.tsx:48` | subtitle `"SKU: {sku} · slug: {slug}"` | `"Código: {sku} · URL: /producto/{slug} · Editado hace 2 días"` |
| 23 | `pedidos/page.tsx:216` | columna `"Items"` | `"Productos"` o `"Cant."` |
| 24 | `pedidos/page.tsx:236-240` | `"wompi · 8d2f3a..."` en celda | quitar del listado (solo en detalle) |
| 25 | `pedidos/[number]/page.tsx` (comentario en `:6-7`) | "shipment" expuesto | revisar página, no leída esta vuelta |
| 26 | `clientes/page.tsx:182` | columna `"Puntos"` cruda | `"Puntos fidelidad"` o badge con tooltip |
| 27 | `bloques/[id]/page.tsx:120` | `"caerá al texto por defecto (fallback hardcoded en código)"` | `"caerá al texto por defecto que viene incorporado"` |
| 28 | `aveonline/page.tsx:67` | subtitle `"Gestión de webhooks de tracking + estado de la integración"` | `"Aquí Aveonline nos avisa cuando un pedido cambia de estado (en camino, entregado, etc.)."` |
| 29 | `aveonline/page.tsx:80` | `"AVEONLINE_WEBHOOK_SECRET no configurado"` | `"Falta configurar la clave secreta de Aveonline"` + esconder nombre var detrás de "ver detalle técnico" |
| 30 | `aveonline/page.tsx:91-101` toda la sección | jerga `webhook`, `secret`, `endpoint`, `path` | reescribir como "Permitir que Aveonline nos avise…" |
| 31 | `aveonline/page.tsx:108` | `"Webhooks registrados ({n})"` | `"Notificaciones configuradas ({n})"` |
| 32 | `dashboard/page.tsx:170` | `"Sub-categorías"` | `"Categorías secundarias"` o quitar |
| 33 | `dashboard/page.tsx:222` | `"Trazabilidad"` | `"Historial y ajustes"` |
| 34 | `productos/product-form.tsx:535` | botón principal `bg-slate-900` neutral gris | usar `bg-emerald-600` o `bg-gradient-brand` (color semántico de guardar/publicar) |
| 35 | Tipografía global: badges `Activo/Inactivo/Archivado` (`productos/page.tsx:328-331`) | sin emoji | `🟢 Activo / 🟡 Inactivo / ⚫ Archivado / ⭐ Destacado` para seguir patrón memoria |
| 36 | `pedidos/page.tsx:276`, `clientes/page.tsx:220` | fechas absolutas `dd MMM yyyy, HH:mm` | fechas relativas "hace 2 horas" con tooltip absoluto |

---

## Resumen ejecutivo

**Páginas en orden de severidad (peor primero)**:

1. **`/integraciones/aveonline`** — completamente inaccesible para Lucy: 6 voseos + comandos terminal + jerga `webhook/secret/endpoint`. Necesita rediseño total o esconderse tras flag SUPERADMIN.
2. **`/productos/[id]` editor** — la queja directa de Lucy ("sobrecargado"). Necesita partir en tabs/pasos + renombrar 15+ labels + colorear botón guardar + agregar preview + mover imágenes arriba.
3. **`/productos` listado** — expone "soft-delete", "slug" y `make seed-products` en empty state. Cambios chicos pero importantes.
4. **`/pedidos`** — voseo en empty + columna "Items" + fecha no-relativa + transaction ID expuesto. La falta de vista Kanban es item de arquitectura más que copy.
5. **`/clientes`** — voseo en empty + fechas no-relativas + columna "Puntos" sin contexto.
6. **`/dashboard`** — duplicación de QuickLink + "Sub-categorías" + "Trazabilidad".
7. **`/contenido/bloques/[id]` editor** — referencia de cómo se debe hacer; solo pulir `"fallback hardcoded"` y `"acá"` → `"aquí"`.

**Total trabajo de copy**: ~20 voseos + ~36 strings técnicos → estimación ~50-60 ediciones puntuales (1-2 horas) + refactor del editor de producto en tabs (1-2 días).

**Recomiendo arrancar por**: (a) script de búsqueda+reemplazo de voseo (rápido, win visible), (b) renombres del editor de producto (mayor impacto en queja directa de Lucy), (c) rediseño Aveonline o esconderlo tras flag.