I have all six cluster analyses. Now I'll synthesize them into the final consolidated plan.

# Plan de Pulido UX Admin — feedback de Lucy 2026-06-27

## Resumen para Lucy (en español llano)

Revisé tu feedback a fondo, leyendo el código real punto por punto. La buena noticia: **la mayoría de lo que te molesta NO está roto** — son detalles de presentación que podemos pulir barato y rápido. Encontré **solo 3 bugs de verdad**, y uno de ellos es importante porque puede afectar precios reales que ve el cliente (el precio de las "opciones" se está guardando 100 veces más chico de lo que escribís). El resto se divide en mejoras de comodidad (esconder campos que no usás, hacer que el sidebar no se escape al hacer scroll, ordenar tablas con un clic) y **5 decisiones que necesito que tomes vos** porque cambian cómo funciona la tienda (fotos distintas por opción, sub-categorías, cómo reordenar categorías). La idea central: tu panel tiene que mostrarte **lo mínimo que de verdad usás** y esconder lo técnico — vamos en esa dirección, sacando campos crípticos ("aspect ratio", "centavos", "orden manual") y dejando lo que importa a la vista.

---

## Tabla maestra (~18 puntos)

| # | Punto (en tus palabras) | Tipo | Veredicto (confirmado en código) | Storefront | Esfuerzo |
|---|---|---|---|---|---|
| 1 | Ordenar tablas con clic en la columna, no dropdown | ✨ MEJORA | Real. Hoy es dropdown + "Aplicar". 8 listings usan el patrón (no 4). Server-side, migrable sin riesgo. `admin-page.tsx` no tiene header clickeable | No | **M** (1 primitive + 4 migraciones) |
| 2a | Categorías con el mismo "orden" se desordenan en la tienda | 🐛 BUG | **Confirmado.** `lib/catalog.ts:133,187` ordena por `order` sin desempate → orden indeterminado en el menú del cliente | **Sí** | **S** |
| 2b | Me piden inventar un "número de orden" | ✨ MEJORA | Real. Choca con "simple y amigable". Default `0` para todas → colisionan | No | **M** |
| 2c | No puedo crear sub-categorías | 🤔 DECISIÓN | Gap real: el schema y el storefront las soportan, pero el form no expone `parentId` (`actions.ts:23-33`) | Sí (ya hay rutas) | M si sí |
| 2d | Dos categorías con el mismo nombre | ✨ MEJORA | Real: slug se valida, nombre no (`service.ts:69-73`) | No | **S** |
| 3a | El precio de la opción se ve rarísimo / en centavos | 🐛 BUG **P0** | **Confirmado.** `variant-form.tsx:73-82` + `actions.ts:82,138` usan centavos crudos sin ×100. Escribís "5000" → se guarda $50 | Indirecto (precios corruptos) | **S** |
| 3b | El resumen "87 unidades · 3 opciones" no me dice nada | ✨ MEJORA | Real, no bug. `page.tsx:241-292` agrega todo sin decir qué opción está roja | No | **S** |
| 3c | Demasiados "atributos diferenciadores" (7 campos) | ✨ MEJORA | Real. `variant-form.tsx:101-171`, 7 inputs crípticos siempre visibles | No | **M** |
| 3d | Editar opción me pide stock que ya edité en la lista | ✨ MEJORA (riesgo datos) | Real. Stock en 2 lugares (`product-variants-panel.tsx:191` + `variant-form.tsx:83-90`) pueden divergir | No | **S** |
| 3e | "Precio base por defecto" en Avanzado confunde | 🤔 DECISIÓN | Real pero `basePrice` es columna requerida y fallback. No se puede borrar sin más | Indirecto | A:0 / B:M / C:S |
| 4a | Demasiados campos de texto en la descripción | ✨ MEJORA | Real: 6 campos de texto, **solo 1 (`description`) lo ve el cliente** (`page.tsx:192-194`) | No | **S** |
| 4b | Campos "para el bot de WhatsApp" que no entiendo | ✨ MEJORA | Real: el bot es Fase 5+, **no existe**. La API está huérfana. Pide contenido invisible | No | **S** |
| 4c | No sé si el producto sale en Google | ✨ MEJORA | Ya resuelto en código: SEO tiene fallback automático (`page.tsx:41-42`) + JSON-LD. Solo falta comunicártelo | No | **S** |
| 5a | ¿Dónde cargo la foto de portada? | ✨ MEJORA | Real: portada existe pero es "la primera de la grilla" (`product-images.tsx:137`), poco explícita | No | **S** |
| 5b | El Set 6 y el Set 12 muestran las mismas fotos | 🤔 DECISIÓN | **No soportado.** No hay imagen por opción en ninguna capa (schema/admin/storefront) | **Sí** | **L** |
| 6a | El sidebar se desliza al hacer scroll | 🐛 BUG (layout) | **Confirmado.** `admin-shell.tsx:76` el aside no es sticky/fixed ni tiene altura acotada | No | **S** |
| 6b | En Cupones no veo cómo volver/cancelar | ✨ MEJORA | Real: form inline sin botón "Cancelar"; tras crear quedás al fondo sin señal | No | **S** |
| 6c | Abajo del producto veo info de "todos los productos" | 🐛 BUG (claridad) | Real: 2 superficies — link "Ver inventario de todos…" (`product-variants-panel.tsx:73`) y widget cupones que mezcla store-wide diciendo "para este producto" (`product-coupons-widget.tsx:105`) | No | **S** |

---

## Lo que recomiendo hacer YA (bugs + quick wins de alto impacto)

Agrupado por commit lógico. Todo esto es bajo riesgo, reversible, y mejora tu día a día.

**Commit 1 — `fix(catalog): precio opción en pesos + orden categorías determinista` (los 2 bugs de plata/visibles)**
- **3a (P0):** unificar el precio de la opción a PESOS (reusar el patrón `PriceField` del producto: input en pesos → ×100 a centavos; al leer, `/100`). Sacar la jerga "en centavos de peso". **Esto es lo más urgente: hoy un precio mal cargado llega al carrito 100× más barato.**
- **2a:** agregar desempate `{ name: "asc" }` en `lib/catalog.ts:133` y `:187`. Una línea cada uno, elimina el desorden del menú del cliente.

**Commit 2 — `fix(admin): sidebar sticky + bugs de claridad de navegación`**
- **6a:** `lg:sticky lg:top-0 lg:h-screen` en el aside (`admin-shell.tsx:76`). No rompe el drawer mobile. Arregla toda la navegación admin de una.
- **6c:** etiquetar los cupones store-wide con badge "General" y cambiar el título del widget a algo honesto ("Promociones que aplican aquí, incluye las de toda la tienda"). Reformular el copy del link a "Ver inventario completo →".
- **6b:** botón "Cancelar" (`type="reset"`) junto a "Crear cupón" + ancla/scroll tras crear.

**Commit 3 — `refactor(admin): form de producto más simple (menos campos)`**
- **4a/4b/4c:** renombrar "Descripción corta" → "Descripción"; esconder el bloque "Para el bot de WhatsApp" + "Descripción larga markdown" hasta Fase 5 (sin borrar columnas ni endpoint); mover SEO a un `<details>` colapsado "Personalizar cómo se ve en Google (opcional)". **De 6 campos de texto a 1 visible.**
- **3d:** quitar el campo Stock del form full de la opción (queda solo en el editor rápido). El schema ya tolera omitirlo (`.optional()`).
- **3b:** convertir el resumen de stock en mini-desglose por opción (nombre · stock con emoji · precio). Datos ya cargados, sin query nueva.

**Commit 4 — `feat(admin): foto de portada explícita + atributos de opción simplificados`**
- **5a:** portada en grande y aislada ("Foto de portada") + botón "Usar como portada" en cada celda + mover `ProductImages` arriba en el tab Editar.
- **3c:** dividir los 7 atributos en "Lo común" (4 visibles) + "Avanzado" colapsado (shape/finish/aspectRatio); renombrar a lenguaje llano.
- **2d:** warning suave de nombre de categoría duplicado.

> El **primitive de ordenar-por-clic (punto 1)** es M y conviene hacerlo de corrido sobre las 8 tablas — lo dejaría como su propio commit/mini-sprint, no mezclado con lo anterior.

---

## Decisiones que necesito de Lucy

Estas **no las decido yo** — cambian cómo funciona la tienda. Cada una con opciones claras:

**D1 — Fotos por opción (punto 5b).** ¿Querés que al elegir "Set 12" el cliente vea fotos distintas a "Set 6"?
- **(a) No por ahora** → mantenemos una galería por producto. Costo cero. *(recomendado para arrancar)*
- **(b) Sí, para todo el catálogo** → migración + uploader por opción + galería que reacciona a la opción. **Esfuerzo L, toca storefront.**
- **(c) Sí, pero solo para coleccionables** (productos con SKU físico real distinto, no personalizables) → donde de verdad aporta. Acota el L.
> En productos personalizables la foto final la genera el cliente en el Estudio, así que las fotos por opción serían solo mockups del formato.

**D2 — Sub-categorías (punto 2c).** ¿Tu catálogo es plano o jerárquico (ej. "Magnéticos > Foto", "Magnéticos > Frase")?
- **(a) Plano por ahora** → no tocamos nada, `parentId` queda latente. *(recomendado: tenés ~5-8 categorías)*
- **(b) Jerárquico** → agregamos selector "Categoría padre" al form. **Esfuerzo M, el storefront ya tiene las rutas.**

**D3 — Cómo reordenar categorías (punto 2b).** Saco el campo "número de orden" (te confunde y causa el bug 2a). ¿Cómo reordenás?
- **(a) Flechas ↑/↓ por fila** → simple, accesible, suficiente para pocas categorías. **Esfuerzo M.** *(recomendado)*
- **(b) Arrastrar y soltar (drag&drop)** → más bonito pero **L** + dependencia nueva.

**D4 — "Precio base" del producto (punto 3e).** ¿Qué hago con el campo "Precio base por defecto" en Avanzado?
- **(a) Dejarlo como está** → correcto técnicamente, pero confuso.
- **(b) Esconderlo y derivarlo automático** (el sistema lo pone igual al precio de la primera opción). **Esfuerzo M.** *(recomendado: nunca más lo tocás)*
- **(c) Solo renombrarlo** a "Precio de respaldo (avanzado)" con hint claro. **Esfuerzo S.**
> Atado a esto: ¿dónde queda "Precio antes (promo)"? Probablemente también a nivel opción.

**D5 — Nombre de la opción (punto 3c).** ¿El nombre ("Set 12") se genera automático desde los atributos, o te lo sugerimos editable?
- Recomiendo **sugerido-editable** (menos mágico, podés corregir).

**D6 — Ordenar tablas (punto 1), detalle mobile.** Recomiendo: clic en header en desktop + mantener el dropdown solo en pantallas chicas (los headers no se alcanzan bien en celular). ¿Te sirve, o querés solo headers?

---

## Cómo encaja en el plan de trabajo general

Seamos honestos: **esto es pulido UX del admin, no bloquea el launch** — salvo el bug 3a (precio en centavos), que **sí** es riesgo real de vender a precio equivocado y debería arreglarse cuanto antes, independientemente del resto.

Mi recomendación de secuencia:
1. **Hotfix inmediato:** los 3 bugs (3a precio, 2a orden categorías, 6a sidebar). Son S/S/S, alto impacto, cero riesgo. **Antes de seguir con cualquier bloque.**
2. **Un sprint "Admin amigable" único** con los quick wins restantes (Commits 2-4 + el primitive de ordenar). Es barato (la gran mayoría son S), toca un set acotado de archivos, y mejora tu operación diaria. Vale la pena hacerlo de corrido para no volver 5 veces a `product-form.tsx`.
3. **Las decisiones D1-D5** las resolvés vos cuando puedas; las que digas "sí" (sobre todo D1 fotos-por-opción si es L) compiten en prioridad con **Bloque C Seguridad, D Observabilidad, E Testing, F Refund** — y esos van primero porque son pre-launch de verdad.

En una frase: **arreglar los 3 bugs ya; el pulido en un sprint dedicado; las features con decisión (fotos por opción) después de los bloques de seguridad/testing.**

---

## Realidad admin + front cliente (lo que conecta)

Varios puntos del admin **tienen contraparte directa en el storefront** y deben diseñarse juntos para no rehacer:

- **Orden de categorías (2a/2b):** el bug se *manifiesta* en el cliente (menú, home grid, sub-categorías), pero el fix vive en `lib/catalog.ts` (storefront) **+** el reordenamiento en admin. Hay que tocar ambos lados a la vez: el tiebreaker (storefront) y el auto-order/flechas (admin).
- **Fotos por opción (5b):** si decidís D1=(b/c), el admin (uploader por opción) y el storefront (galería que reacciona al `VariantSelector`, hoy desacoplados) se diseñan **en el mismo cambio**. El patrón de herencia recomendado ("opción usa sus fotos, si no, las del producto") espeja cómo ya funciona el precio (`variant.price ?? basePrice`) — coherente con tu modelo mental.
- **Descripciones/SEO (4a-4c):** todo el texto que escribís en admin alimenta el storefront. El descubrimiento clave: la **descripción larga que te pedimos (300-800 palabras) NUNCA se muestra al cliente** — solo `description` corta se renderiza. Esconder lo invisible es admin-only, pero confirma que el único texto que importa es el que el cliente lee.
- **Sub-categorías (2c):** si D2=(b), el storefront **ya tiene rutas y render** (`productos/[categoria]/[subcategoria]`), así que exponerlas en admin las activa de inmediato en la navegación del cliente — diseñar pensando en ambos.
- **Precio de opción (3a):** el bug corrompe datos que sí alimentan PDP y carrito; el fix es admin pero **protege el storefront**. Recordá la prueba GUI: tras el fix, verificar en navegador que un precio cargado en pesos se ve correcto tanto en el form como en la página pública del producto.

**Recordatorio prueba GUI:** todo este cluster toca UI. Al implementar, probar en navegador (no solo curl): `/admin/productos/[id]` (precio opción, resumen stock, portada), `/admin/categorias` (orden), `/admin/cupones` (cancelar/volver), cualquier `/admin/*` largo (sidebar sticky), y el storefront PDP + menú para 2a/3a/5b.