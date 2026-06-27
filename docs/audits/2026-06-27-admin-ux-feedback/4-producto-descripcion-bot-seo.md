Confirmed. The catalog API route exists for a **future Fase 5+ bot** that does not yet exist — no current client fetches it for bot/WhatsApp purposes. I have everything I need.

# Cluster 4: Descripciones + bot + SEO — qué sobra, qué se auto-deriva, propuesta + esfuerzo

## Resumen ejecutivo

Lucy tiene razón en los tres puntos. Hoy el form le pide **4 campos de texto narrativo** (descripción corta, descripción larga markdown, "por qué elegir", "escenarios ideales") + **2 campos SEO** — total **6 campos de texto** para una sola ficha. De esos, **solo 1 se renderiza al cliente** (`description`). Los demás alimentan un bot que **todavía no existe** (Fase 5+) y un buscador interno. Y el SEO **ya tiene fallback automático**, así que esos campos son técnicamente opcionales hoy — pero el form no se lo comunica con suficiente fuerza.

---

## 1. ¿Cuántos campos de texto hay y cuáles se renderizan?

Inventario real de campos de texto narrativo en `product-form.tsx`:

| Campo | UI label | Tab | ¿Se renderiza al cliente? | ¿Para qué sirve HOY? |
|---|---|---|---|---|
| `description` | "Descripción corta" | Lo básico (`product-form.tsx:167-182`) | **SÍ** — PDP `page.tsx:192-194`, JSON-LD `:118`, fallback SEO `:42` | Lo único que el cliente lee |
| `richDescription` | "Descripción larga (markdown)" | Detalles (`:259-278`) | **NO** en la PDP | Solo buscador pg_trgm (`catalog.ts:758`) + API bot futura |
| `whyChooseThis` | "¿Por qué elegir este producto?" | Detalles (`:280-300`) | **NO** | Solo API bot futura (`api/catalog/products/[slug]/route.ts:6`) |
| `idealFor` | "Escenarios ideales" | Detalles (`:302-321`) | **NO** | Scoring del recomendador IA (`catalog.ts:586`) + API bot futura |
| `seoTitle` | "Título para Google" | Detalles (`:461-479`) | Indirecto (`<title>` `page.tsx:41`) | SEO, con fallback a `name` |
| `seoDescription` | "Descripción para Google" | Detalles (`:480-495`) | Indirecto (`<meta>` `page.tsx:42`) | SEO, con fallback a `description` |

**Dato clave:** la PDP del storefront **nunca renderiza `richDescription`** — line 192-194 solo muestra `product.description`. Lucy escribe 300-800 palabras de "descripción larga" y **el cliente no las ve en ningún lado**. Solo entran al índice de búsqueda y a una API de bot que no está conectada a nada. Esto es contraintuitivo y refuerza el feedback de Lucy de que sobran.

---

## 2. Bot WhatsApp: ¿tiene sentido pedir estos campos ahora?

**No.** Veredicto: **MEJORA UX (esconder)**, no bug.

- El bot es **Fase 5+** y no existe. Confirmado en el header de `api/catalog/products/[slug]/route.ts:2` ("contexto que el bot WhatsApp Fase 5+ necesita") y en el comentario del form (`product-form.tsx:14`).
- `grep` confirma que **ningún cliente** (ni WhatsApp `wa.me`, ni Claude API, ni componente front) consume `whyChooseThis`/`idealFor`/la API de catálogo para un bot hoy. La API existe pero está huérfana.
- El SectionCard "Para el bot de WhatsApp" (`product-form.tsx:280-322`) y la línea de la descripción larga ("El bot lo usa para responder consultas por WhatsApp", `:261`) le piden a una editora no-técnica que llene contenido para una funcionalidad que no podrá ver ni probar. Es exactamente el tipo de fricción que la premisa "simple y amigable" busca evitar.

**Recomendación:** ocultar el bloque "Para el bot de WhatsApp" (`whyChooseThis` + `idealFor`) hasta que el bot exista en Fase 5. **No borrar las columnas del schema** (`schema.prisma:307,309,312`) — los datos y el endpoint siguen ahí para cuando llegue el bot; solo se quita de la UI de Lucy. El recomendador IA (`catalog.ts:586`) seguirá funcionando con `idealFor` vacío (cae al branch `Array.isArray` sin matches, no rompe).

Cuando el bot llegue, Lucy debería poder **dejar que el bot lea de "Descripción"** por defecto (como ella pide), y solo opcionalmente refinar con campos extra. Es decir: el bot se alimenta de `description` salvo que haya override — invirtiendo el modelo actual de "campos dedicados obligatorios para el bot".

---

## 3. SEO/Google: ¿ya hay fallback automático? — SÍ

**Confirmado en código.** `generateMetadata` en `producto/[slug]/page.tsx:41-42`:

```
const title = product.seoTitle ?? product.name;
const description = product.seoDescription ?? product.description.slice(0, 160);
```

Y hay JSON-LD Product structured data completo (`page.tsx:114-133`) con name, description, sku, image, precio, disponibilidad, marca — **generado automáticamente sin que Lucy toque nada**. Esto es lo que hace que un producto sea "visible en Google" (rich results).

**Conclusión para Lucy:** el producto **ya sale en Google por defecto** con su nombre + descripción corta. Los campos `seoTitle`/`seoDescription` son **puro override avanzado** y opcionales. Su miedo ("no sé cómo funciona, quizás debería ser default") ya está resuelto en código — solo que el form no se lo dice con suficiente claridad. El SectionCard "Cómo se ve en Google" (`:461-463`) ya tiene el texto correcto ("Si dejas los campos vacíos, usamos el nombre y la descripción corta") pero está enterrado junto a 5 campos que la abruman, así que el mensaje se pierde.

---

## 4. Set MÍNIMO de campos de texto propuesto

**Lo que Lucy debería ver (siempre):**

1. **"Descripción"** (renombrar `description`, quitar el "corta") — `product-form.tsx:169`. Es el único texto que el cliente lee y la única fuente de verdad. Hint actualizado: "Lo que el cliente lee en la página del producto. También se usa para Google y, más adelante, para el bot de WhatsApp."

**Lo que se auto-deriva (Lucy no toca nada):**

- **SEO title** ← `name` (ya existe, `page.tsx:41`)
- **SEO description** ← `description` (ya existe, `page.tsx:42`)
- **JSON-LD / Google rich results** ← name + description + sku + precio (ya existe, `page.tsx:114`)
- **Búsqueda interna** ← seguirá indexando `description` aunque `richDescription` quede vacío

**Lo que se esconde hasta Fase 5 (bot):**

- `richDescription`, `whyChooseThis`, `idealFor` — el bloque "Para el bot de WhatsApp" completo + la card "Descripción larga (markdown)".

**Lo que queda como "Avanzado / opcional" (colapsado, no en Detalles a la vista):**

- `seoTitle`, `seoDescription` — mover a un `<details>` colapsable "Personalizar cómo se ve en Google (opcional)" dentro de Avanzado, cerrado por defecto, con la nota "Normalmente no necesitas tocar esto."

### Form resultante para Lucy

| Tab | Campos de texto narrativo |
|---|---|
| Lo básico | **Descripción** (1 campo) |
| Detalles | *(ninguno — solo logística: tiempos, garantía, empaque)* |
| Avanzado | SEO override colapsado (opcional) |

De **6 campos de texto → 1 visible**. Exactamente la dirección del feedback de Lucy.

---

## Clasificación + esfuerzo

| # | Cambio | Tipo | Esfuerzo | ¿Toca storefront? |
|---|---|---|---|---|
| 4.1 | Renombrar "Descripción corta" → **"Descripción"** + ajustar hint (`product-form.tsx:169-170`) | MEJORA UX | **S** | No |
| 4.2 | Ocultar bloque "Para el bot de WhatsApp" (`whyChooseThis`+`idealFor`, `:280-322`) y card "Descripción larga markdown" (`:259-278`) hasta Fase 5. Mantener columnas en schema + endpoint API intactos | MEJORA UX | **S** | No (datos y API quedan; PDP nunca los mostró) |
| 4.3 | Mover SEO (`seoTitle`/`seoDescription`, `:461-496`) a `<details>` colapsado en Avanzado con nota "normalmente no lo tocas" | MEJORA UX | **S** | No |
| 4.4 | (Opcional, decisión de Lucy) Cuando llegue el bot: que se alimente de `description` por defecto, no de campos dedicados | DECISIÓN-DE-LUCY (Fase 5) | M (futuro) | No |

**Total esfuerzo inmediato: S** (3 cambios cosméticos en un solo archivo, `product-form.tsx`, sin migración de schema, sin tocar storefront, sin tocar actions/service salvo dejar de enviar campos ocultos — y aun eso es opcional porque `actions.ts:75-77` tolera valores vacíos/null).

## Notas importantes (verificación)

- **No es bug:** todo lo anterior es comportamiento por diseño. El único "olor" cercano a bug es que `richDescription` se pida con instrucciones de "300-800 palabras" (`product-form.tsx:265`) cuando **nunca se renderiza al cliente** — la editora invierte esfuerzo en contenido invisible. Es desperdicio de UX, no un crash.
- **No borrar columnas:** `whyChooseThis`/`idealFor` alimentan el scoring del recomendador IA (`catalog.ts:585-588`) y la API del bot futura (`route.ts`). Esconder en UI ≠ borrar en DB. Quitar las columnas sería regresión funcional para Fase 5.
- **Conexión admin↔storefront confirmada:** el SEO/Google que Lucy menciona vive 100% en el storefront (`generateMetadata` + JSON-LD), alimentado por los campos del admin. El fallback automático ya cubre su preocupación — es cuestión de comunicárselo en el form, no de construir nada nuevo.

Archivos relevantes:
- `/home/ansible/workspaces/lucams_shop/apps/web/app/admin/(panel)/productos/product-form.tsx` (campos: `:167` description, `:259-321` rich/bot, `:461-496` SEO)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/producto/[slug]/page.tsx` (`:37-65` generateMetadata con fallback, `:114-133` JSON-LD, `:192-194` única render de description)
- `/home/ansible/workspaces/lucams_shop/apps/web/app/api/catalog/products/[slug]/route.ts` (API bot Fase 5+, huérfana hoy)
- `/home/ansible/workspaces/lucams_shop/apps/web/lib/catalog.ts` (`:585-588` scoring idealFor, `:752-765` búsqueda richDescription)
- `/home/ansible/workspaces/lucams_shop/packages/db/prisma/schema.prisma` (`:307,309,312` campos rich; `:345-346` seo) — NO modificar