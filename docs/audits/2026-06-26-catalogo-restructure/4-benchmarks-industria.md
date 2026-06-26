# Dimensión 4: Benchmarks industria

> Análisis comparativo de cómo SMB-focused e-commerce platforms estructuran su catálogo admin, destilado contra el caso Lucams_shop (Lucy = operadora no-técnica, 9→50 productos personalizables).

---

## Shopify Catalog Admin

**Estructura sidebar (sección Products):**
- `Products` — listado maestro de productos
- `Collections` — agrupaciones (automatic rules o manual)
- `Inventory` — vista stock cross-producto (módulo top, NO escondido en producto)
- `Purchase orders` — órdenes a proveedores
- `Transfers` — movimientos entre ubicaciones
- `Gift cards` — entidad separada

**Patterns clave:**
- **Solo 2 conceptos de organización**: Products + Collections. No hay "Tags como página" — tags existen pero son metadata inline en el producto, no entidad de primer nivel con su propio CRUD.
- **Collections fusiona Category + Tag**: una Collection puede ser jerárquica (Mujeres > Camisetas) o transversal (Día de la Madre, Sale, Nuevo). Dos modos: **Manual** (drag & drop) o **Automated** (rules: "incluye productos con tag X y precio < Y").
- **Variants viven dentro del producto** en la misma página (no sub-ruta), con tabla expandible. Para gestión masiva de stock cross-producto está `Inventory` como pestaña top.
- **Bulk actions everywhere**: selección múltiple en listado → publish/unpublish, change collection, edit price, archive, delete. Atajos rápidos sin entrar a cada ítem.
- **Reviews/Discounts** viven en módulos hermanos (Discounts top-level en sidebar, Reviews via app Shopify Product Reviews integrado como tab dentro del producto + listado global).

**Qué aprender para Lucams:**
1. **Fusionar Category + OcasionTag en un único concepto "Colecciones"** con modo manual o automático. Elimina la duda "¿esto va como categoría o como ocasión?" — la pregunta es "¿es jerárquico/permanente o transversal/estacional?", pero ambos son la misma entidad con metadata distinta.
2. **Inventario como módulo top en el sidebar** (no escondido en `/productos/[id]/variants`). Lucy debería ver de un vistazo qué se está agotando.
3. **Bulk actions** en el listado de Productos: activar/desactivar/archivar/asignar a colección sin entrar uno por uno. Crítico cuando lleguen 50 productos.

---

## Etsy Shop Manager

**Estructura (es el más cercano a Lucy: artesanal, 1 operadora, productos personalizables):**
- `Listings` — productos (Etsy los llama listings)
- `Sections` — agrupaciones simples del shop (equivalente a Categorías ligeras)
- `Stats` — analytics
- `Orders & Shipping` — pedidos
- `Marketing` — Coupons, ads, social
- `Community & Help` — reviews + mensajes con clientes

**Patterns clave:**
- **Sin "Variants" como página propia**: variations se editan dentro del listing en una sección colapsable. No hay sub-ruta `/listing/[id]/variants`.
- **Reviews dentro del listing**: cada producto tiene su tab "Reviews" inline + un feed global en Community. No es una sección separada en sidebar principal.
- **Coupons en Marketing**, no en catálogo. Etsy reconoce que un cupón es **acción comercial**, no contenido del producto.
- **Sections son ultra-simples**: sin jerarquía profunda. Solo "Mi shop tiene estas 5 carpetas". Etsy asume que la **búsqueda + tags** hace el trabajo pesado, no la jerarquía.
- **Tags inline en el listing** (hasta 13 por producto), sin CRUD propio. Etsy los sugiere automáticamente.

**Qué aprender para Lucams (es el benchmark más relevante):**
1. **Variants NO merece sub-ruta propia** — debe ser un tab dentro del editor de producto. La sub-ruta `/admin/productos/[id]/variants` está sobre-ingenierada para 9 productos.
2. **Reviews como tab dentro del producto** + feed global en otro lugar (no como módulo top "Reseñas" en Ventas). Lucy edita una ficha → ve sus reseñas ahí mismo.
3. **Cupones NO son catálogo** — Etsy los pone en Marketing porque son acción comercial. Mover `/admin/cupones` a un grupo "Promociones" o "Marketing".
4. **Jerarquía de categorías plana es OK** para escala SMB. Lucams no necesita árboles parent/child profundos con 9-50 productos; una sola capa basta hasta que el catálogo lo justifique.
5. **OcasionTag puede ser inline en el producto** (selector multi-tag) sin necesitar su propia página CRUD top. Solo necesita su propia página si Lucy quiere editar el `monthHint` o `suggestedQuantityRange` por tag (entonces es un módulo de configuración secundario, no top en sidebar).

---

## Squarespace / BigCartel / WooCommerce

**Patterns relevantes resumidos:**

**Squarespace Commerce:**
- `Inventory` es el nombre del módulo top que contiene productos (no "Products"). Reconoce que para SMB el concepto mental es "lo que tengo para vender".
- Categories = "Product categories" como tags dentro del producto, no CRUD top separado.
- Variants inline, mismo patrón Etsy.

**BigCartel** (foco indie/artesanal, muy similar a Lucams):
- Top sidebar: `Products` / `Orders` / `Customers` / `Promotions` / `Theme`.
- Solo **2 conceptos**: Products + Categories. Nada más en catálogo.
- Promotions = cupones + discounts en un solo grupo.
- Brutalmente minimalista. Sirve negocios de 5-200 productos sin sentirse limitado.

**WooCommerce:**
- Más complejo (extensible), pero el core es: `Products` / `Categories` / `Tags` / `Attributes` como 4 sub-páginas. **Esto es lo que NO queremos** — Lucy se perdería entre Categories/Tags/Attributes.
- Lección negativa: separar Category + Tag + Attribute en 3 páginas distintas confunde al operador no-técnico.

**BigCommerce:**
- Mid-market, separa `Catalog > Products / Categories / Brands / Reviews / Options & SKUs`. Demasiado granular para Lucams.
- Pattern útil: **Reviews dentro del módulo Catalog** (no en Ventas/Orders) porque conceptualmente son contenido del producto.

---

## Patterns DESTILADOS aplicables a Lucams_shop

1. **Inventario como módulo top, no escondido en sub-ruta**
   Sacar `/admin/productos/[id]/variants` del flujo profundo y darle entrada propia. Lucy necesita ver "qué se está agotando" sin abrir 9 productos uno por uno.

2. **Collections unifica Category + OcasionTag**
   Una sola entidad "Colecciones" con dos modos: **Permanente** (Tarjetas, Imanes, Pegatinas) y **Estacional/Transversal** (Día de la Madre, Aniversario). Mismo CRUD, mismo modelo mental para Lucy. La diferencia (`monthHint`, `activeFrom/Until`) es metadata opcional, no un concepto separado.

3. **Bulk actions en listados**
   Productos y Colecciones deben tener checkbox + acciones (activar/desactivar/archivar/asignar). Sin esto, gestionar 50 productos es 50 clicks.

4. **Reviews contextuales (tab dentro de producto)**
   Mover `/admin/resenas` a un tab dentro del editor de producto + opcionalmente un feed global "Últimas reseñas" en el Dashboard. No merece módulo top de sidebar.

5. **Cupones en grupo "Promociones/Marketing"**
   Sacar de "Comercial" (nombre técnico que confunde a Lucy) y agrupar con futuras campañas, descuentos automáticos, banners. Etsy/BigCartel coinciden: los cupones NO son catálogo.

6. **Variants como tab inline del producto, no sub-ruta**
   Eliminar `/admin/productos/[id]/variants` como página propia. Convertir en tab dentro del editor (Lucams ya tiene 5 tabs — agregar uno más es coherente).

7. **Eliminar placeholders "Plantillas" y "Recomendaciones" del sidebar**
   Etsy/Shopify/BigCartel no muestran funcionalidad futura. Solo confunde. Si "Plantillas" se refiere a `PersonalizationTemplate` del Estudio, debería vivir bajo "Estudio" o "Personalización", NO en Catálogo (porque NO son productos, son recursos del editor).

---

## Anti-patterns a EVITAR

- **Sidebar con 11+ grupos** (WooCommerce extendido): paraliza al operador. Lucams ya está cerca con 5 grupos + sub-items confusos.
- **Tabs ocultos sin descubrimiento** (sub-ruta `/[id]/variants` sin breadcrumb visible): Lucy no sabe que existe hasta que alguien le dice.
- **Conceptos similares en páginas separadas sin guía** (WooCommerce: Categories vs Tags vs Attributes): Category + OcasionTag en Lucams cae en este anti-pattern. Si ambos taggean productos, el operador no sabe cuál usar.
- **Placeholders vacíos en producción** ("Plantillas" / "Recomendaciones" sin implementar): genera desconfianza y clicks perdidos. Mejor ocultar hasta que estén listos.
- **Nombres técnicos en sidebar** ("Comercial", "IA y Conocimiento"): Lucy piensa en "Ventas / Promociones / Catálogo / Pedidos", no en categorías corporativas. Etsy usa "Marketing / Community" — palabras de operación real.
- **Forzar jerarquía profunda con catálogo pequeño**: Category con parent/children para 9 productos es over-engineering. Esperar a 100+ productos antes de necesitar jerarquía real (Shopify/Etsy coinciden).

---

## Veredicto del benchmark

La IA actual de Lucams_shop **se parece más a WooCommerce que a Etsy/BigCartel**, cuando el negocio (artesanal, 1 operadora, productos personalizables) reclama exactamente lo opuesto: el modelo Etsy/BigCartel. La reestructuración propuesta (colecciones unificadas, inventario top, reviews/variants contextuales, cupones en marketing) **no es opinión — es el patrón consolidado en plataformas que sirven al perfil exacto de Lucy**.