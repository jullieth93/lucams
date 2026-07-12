# Estrategia del Estudio de Personalización (core del negocio)

> **Fecha:** 2026-07-12 · **Origen:** pedido de Lucy de "pensar muy bien" el Estudio antes de masificar —
> no solo visualmente perfecto y fácil de manejar, sino **funcional** (coherente con cada producto), y
> evaluando **desde cero la tecnología** (dispuesta a refactorizar el core si la evidencia lo pedía).
>
> **Método:** 3 investigaciones en paralelo con verificación adversarial (139 agentes), cruzadas contra
> el código real. Separando lo verificado de lo pendiente (mandato #9) y priorizando $0 en dev (mandato #2).
> Versión visual para Lucy: artifact "Estudio · Decisión estratégica" (claude.ai).
>
> Relacionado: [ADR-057](DECISIONS.md), [ROADMAP.md](ROADMAP.md) Fase 3, `apps/web/app/estudio/[slug]/README.md`.

## TL;DR — el veredicto

1. **Tecnología: AUMENTAR, no refactorizar.** El motor (Konva/react-konva, MIT/$0, self-host) es la
   fundación correcta — es el mismo sobre el que se construye Polotno (editor comercial tipo-Canva de
   US$899/mo, mismo autor). No es callejón sin salida. Verificado: `polotno.com/sdk/product/compare`.
2. **Calidad visual: ya cumplimos o superamos el estándar** (300 DPI, validación pre-pago con banda
   blanda/dura, sangrado). Somos incluso más estrictos que los líderes móviles.
3. **Los gaps reales son funcionales, no de motor:**
   - (a) El Estudio **no ramifica por tipo de producto** → aplana ~24 de ~30 productos personalizables a
     "foto + texto". 3 tipos completamente rotos.
   - (b) El **archivo de impresión se genera en el celular del cliente**, no en el servidor → riesgo de
     "no se parecía a lo que diseñé" = devolución.

Todo el camino recomendado es **$0 en dev y sin lock-in**.

## 1. Problema funcional: el Estudio no habla el idioma de cada producto

**Causa raíz (verificada):** `studio-editor.tsx` nunca mira `product.personalizationKind`. La única
bifurcación por tipo es "si es NONE, no entres" (`page.tsx:65`). Todo lo demás cae en un **atajo
silencioso**: cuando el schema no trae `photoSlots`, `parsePhotoProductConfig` asume `{photoSlots:1}`
(`schemas.ts:220-224`, llamado sin condición en `page.tsx:82`) y abre el editor de foto.

**Consecuencia:** de ~30 productos personalizables (8 tipos), **solo los 6 PHOTO_PACK se ven bien**.
- **Rotos (degradan a cajita de foto vacía):** TEXT_ONLY (abecedario/nombre, frase), EVENT_FAVOR
  (recordatorios), BUSINESS_LOGO (imanes B2B) — ~16 productos, la mitad.
- **A medias:** CALENDAR_PHOTO_MONTH (12 huecos sin nombre de mes → riesgo de mes cambiado),
  CUSTOM_DECOR (boxes que nunca dejan escribir la nota de regalo, `includesNote` ignorado), PHOTO_GRID
  (emite N piezas cuando es 1 lámina compuesta).

**El arreglo:** un **enrutador** al entrar al Estudio que mire **tipo + forma de la config + variante** y
abra una de **5 superficies**: escribe-un-nombre · frase decorativa · formulario de evento · sube-tu-logo ·
lienzo de foto (el actual). Es el patrón de todos los líderes (Shutterfly, Minted, Sticker Mule,
fabricantes de rompecabezas de nombre): no existe un editor único; se usa la interacción más liviana que
exprese el producto completo.

### Taxonomía (familia → tipo → qué personaliza → editor)

| Familia | Tipo | Discriminador | Qué personaliza | Editor correcto |
|---|---|---|---|---|
| Escribe un nombre → fichas | TEXT_ONLY | `nameMaxLength` + variante `name` | cadena de 3–10 letras | 1 campo + tira de fichas kawaii en vivo. Sin foto. |
| Frase en un cuadro | TEXT_ONLY | `maxChars` + `fontOptions` | frase ≤80 + fuente/color | textarea + fuentes filtradas + preview. Sin foto. |
| Formulario de evento | EVENT_FAVOR | `eventFields[]` | datos del evento + 1 foto opcional | plantilla → formulario guiado → 1 diseño × N copias iguales. |
| Sube tu logo | BUSINESS_LOGO | `fields[]` / `requiresVectorFile` | logo + datos de contacto | subir logo + formulario, ×N. Troquelado → cotización WhatsApp. |
| Lienzo de foto *(actual)* | PHOTO_PACK | `photoSlots` | N fotos, 1 por imán | el editor de hoy tal cual. **Línea base.** |
| Grilla de celdas fijas | PHOTO_GRID | `gridCols/Rows` | N fotos en 1 pieza | grid fijo → **1 salida compuesta**, no N imanes. |
| Calendario por meses | CALENDAR_PHOTO_MONTH | `monthLabels`, `year` | 12 fotos, 1 por mes | slots **etiquetados Ene…Dic**. |
| Calendario foto-hero | CALENDAR_PHOTO_HERO | `layout` (`hero-top`/`header`) | 1 foto grande; planner pre-impreso | 1 slot hero; planner no editable. |
| Box decorativo | CUSTOM_DECOR | `includesNote` | fotos + **nota de regalo** | editor de foto + editor de **nota aparte**. |
| Compra directa | variante fija (abecedario `full`/`vowels`) | variante ≠ `name` | nada | **"Añadir al carrito"** directo (sin Estudio). |

### Ejemplo trabajado: "Abecedario Magnético" (son DOS productos: Español c/Ñ, Inglés sin Ñ)

Producto TEXT_ONLY, `personalizationSchema {nameMaxLength:10}`, 3 variantes
(`refactor-abecedario-separadores.mjs:106,116-118`):
- **Completo 27 letras** ($45.000) — set fijo → compra directa, sin Estudio.
- **Vocales 5 letras** ($15.000) — set fijo → compra directa.
- **Nombre 3–10 letras** ($25.000) — **única que personaliza**: escribe un nombre → preview de la tira de
  fichas kawaii (A de Ave, B de Burro). El validador es **por idioma** (español acepta Ñ; inglés la rechaza).

## 2. Problema de arquitectura: el archivo de impresión se genera en el cliente

**Verificado:** `finalizeDesign` (`features/personalization/service.ts`) recibe los PNG ya renderizados
(`productionBuffers`) desde el navegador, **solo valida la cantidad y los sube**. El servidor NO vuelve a
dibujar el diseño. La calidad final depende del teléfono del comprador (fuentes disponibles, límites de
tamaño de canvas en navegadores móviles de gama baja). Un pedido de 12 imanes a 300 DPI en un celular viejo
puede degradarse o fallar en silencio → devolución.

**El arreglo (máximo impacto / menor costo, $0, no toca Konva):** render de producción **en el servidor**
(Konva vía node-canvas, o mapear el diseño a SVG y rasterizar con resvg; fijar DPI con sharp, ya instalado).
El cliente sigue viendo su preview; el archivo de impresión deja de depender de su dispositivo. Es también el
punto exacto donde luego se enchufa el color de imprenta.

## 3. Calidad visual: estándar de la industria vs. lo que tenemos

Estándares verificados (Shutterfly, Mixtiles, Mixam, Omnicalculator, printingforless):
- **300 DPI** es el objetivo para impresión inspeccionada de cerca (el imán). `px = pulgadas × DPI`:
  5×5 cm ≈ 591 px/lado, 10×10 ≈ 1181, 15×15 ≈ 1772 a 300 DPI.
- **Banda blanda 100–300 DPI** "suitable"; líderes móviles (Mixtiles) operan a ~100–105 DPI apoyándose en
  upscaling por IA para bajar fricción. Piso duro ~100 DPI.
- **Validación pre-pago universal** con aviso blando (reparable) vs rechazo duro + remedio concreto.
- **Sangrado full-bleed 3 mm** + zona segura 3 mm.

Lo que ya tenemos (`lib/photo-validation.ts`, `studio-realism-overlay.tsx`) **cumple o supera**:
validación de resolución (300 DPI vs tamaño físico), blur (Laplaciano) y brillo con avisos amables;
sangrado de 5 mm + safe area; realism overlay glossy. **Somos más estrictos** que el norm móvil (error < 50%
de 300 DPI = 150 DPI). Mejora opcional $0: relajar el rechazo duro hacia ~33% (≈100 DPI) con warning fuerte
a 50%, y evaluar upscaling por IA para móvil.

**Gap real:** gestión de color (sRGB→CMYK, perfil ICC, soft-proofing). Matiz importante:
- Canal **POD global** (Printful/Printify) **exige sRGB, prohíbe PDF, desaconseja CMYK** → nuestro pipeline
  actual ya es correcto ahí. **No "mejorar" a CMYK en ese canal.**
- Canal **imprenta local colombiana** → suele pedir **CMYK, PDF, 300 dpi, sangrado, tipografías trazadas**.
  Ahí sí hace falta, como post-paso server-side ($0), **cuando aparezca ese proveedor**.

## 4. Evaluación de tecnología (por qué no refactorizar)

| Opción | ¿Mismo motor? | Costo/licencia | Veredicto |
|---|---|---|---|
| **Konva + react-konva** (actual) | — | MIT, **$0** ✔ | **Mantener.** ~8.700 líneas ya construidas, self-host, Next 16. |
| Piezas server (sharp, ImageMagick+lcms2, resvg) | complemento | Apache/MIT/ISC, **$0** ✔ | **Sumar.** Render server + color imprenta. |
| model-viewer (3D/AR) | complemento | Apache-2.0, **$0** ✔ | Opcional, baja prioridad (imán plano). |
| Fabric.js | no | MIT, $0 | Descartar: sin binding React 1ª parte; migrar 8.7k LOC por SVG (se resuelve server-side). |
| Polotno (editor sobre Konva) | **sí** | US$899/mo (verificado) | Futuro de menor migración; no hoy (mandato #2). |
| img.ly CE.SDK | no | ~US$13k/año (Vendr, *pendiente*) | Descartar: motor distinto + caro. |
| Zakeke/Customily/Kickflip | no | SaaS + fee/pedido | Descartar: lock-in, iframe daña Lighthouse/WCAG. |
| Fancy Product Designer | no | en cierre 2026 ✔ | Evitar. |

**Dato que cierra el debate:** Polotno (US$899/mo, tipo-Canva) está construido **sobre el mismo Konva**, por
el mismo autor (Anton Lavrenov). El "upgrade" de pago usa nuestra misma base.

### Qué NO tocar
- El motor Konva/react-konva.
- El paradigma foto (slot-por-imán) para los tipos con foto.
- El schema de 9 `PersonalizationKind` (ya modela bien el multi-tipo; completar sus editores, no rediseñarlo).
- La salida PNG sRGB 300 DPI para el canal POD global.

## 5. Plan por fases (todo $0 en dev)

| Fase | Qué | Esfuerzo | Notas |
|---|---|---|---|
| **0 — Fundación** | Render de producción en servidor + enrutador por tipo/variante + camino "añadir al carrito" por variante fija + extraer "esqueleto de diseño" agnóstico + limpieza de catálogo | **Medio-Alto** (incl. migración de datos) | No es plomería barata. Es LA fase. Ver prerrequisitos abajo. |
| **1 — Sub-editores por tipo + plantillas reales** | Construir los flujos de los 2–3 tipos de mayor valor + curar ~12–16 plantillas por ocasión | **Alto**, iterativo | Orden por **ventas reales de IG**, no por conteo de productos. Compuerta: spike de Polotno en su trial gratis 60 días para decidir build-vs-buy con evidencia. |
| **2 — Color CMYK/PDF** | Post-paso server, **solo si imprenta local lo exige** | ~3–5 días | ImageMagick+lcms2 (no sharp: issue #3129 revierte 300DPI+CMYK a RGB); PDF/X con Ghostscript → **revisar licencia AGPL antes**. |
| **3 — Preview 3D "en tu nevera"** | model-viewer, carga diferida | opcional | ROI dudoso en imán plano vs mockup 2D. |

### Prerrequisitos técnicos de la Fase 0 (verificados)
1. **El tipo de variante se pierde antes del editor.** `ProductVariantAttributesSchema`
   (`variant-schemas.ts:21-58`) no incluye `variant`/`letterCountMin/Max` → los descarta. Sin extenderlo, el
   portón y el mín/máx del nombre no tienen de dónde agarrarse.
2. **Auto-save solo guarda el canvas de foto** (`schemas.ts:126-141`) → extender para persistir `metadata`
   (nombre, campos de evento).
3. **Finalize/carrito exigen PNG** (`schemas.ts:162-182`, `cart/service.ts:305`, estado `READY`). Toda
   superficie sin foto (nombre, evento, logo) igual debe **generar un PNG de preview** + guardar los datos
   estructurados en `Design.metadata`.
4. **No existe "añadir al carrito directo" para variantes de productos personalizables.** El camino sin
   diseño busca SKU `-DEFAULT` (`cart/service.ts:193-219`) y fallaría con `ABC-ES-FULL/VOWELS/NAME`. La CTA de
   la ficha es por-producto, no por-variante (`producto/[slug]/page.tsx:118`).
5. **Peso del Estudio (Konva ~150 KB+):** decidir por superficie si el preview va en Konva (reusa finalize,
   carga Konva) o en HTML/CSS liviano (necesita otro camino de imagen).

## 6. Decisiones pendientes de Lucy

**Negocio:**
- **A) Acentos en nombres del abecedario** (José, María) — *la más urgente para evitar "pedí mal"*. Rec: ✅
  aceptar y convertir a letra base con aviso ("las fichas son sin tilde").
- **B) Prioridad de fases / posición del abecedario** — Rec: decidir por **ventas reales de IG**, no por
  conteo de productos; considerar adelantar el abecedario-con-nombre como pieza estrella.
- **C) Año del calendario** — Rec: ✅ auto-avanza al año siguiente (hoy 2027).
- **D) Nota de regalo** — Rec: ✅ texto libre ~200 chars + preview de tarjeta.
- **E) Troquelado B2B** — Rec: ✅ cotización por WhatsApp (no editor).
- **F) Inventario de letras** — Rec: ✅ lista de empaque manual (`["A","N","A"]`) para arrancar, no inventario
  por letra.
- **G) Campos B2B / mínimos** — ya sembrados por producto; confirmar, no inventar (50/100).

**Técnicas (confirmar):**
- **H) Aumentar Konva** (no refactor, no pago). Rec: ✅.
- **I) Extraer "esqueleto de diseño"** vs forkear por superficie. Rec: ✅ extraer, con la ruta de foto como red
  de regresión.
- **J) PHOTO_GRID / CALENDAR = 1 pieza compuesta** vs N piezas. Rec: ✅ confirmar 1 pieza (ajusta producción).
- **K) Limpieza de catálogo** — DB dev sembrada a medias, basura de pruebas, abecedario inglés inactivo, el
  refactor no está en `make seed`, script viejo aún siembra abecedario "NONE", `DECISIONS.md:1151-1152` dice
  (desactualizado) que abecedario es NONE/404. Rec: ✅ confirmar que el abecedario refactorizado (2 productos
  TEXT_ONLY) es la verdad → archivar viejo, activar inglés, conectar refactor al seed, limpiar, corregir doc.
- **L) Letra sin arte** — Rec: ✅ no habilitar la variante "nombre" hasta tener el set completo del idioma.

**Acción humana:** **53 ilustraciones kawaii de letras** (27 ES con Ñ + 26 EN), en `/public/templates/` con
nombre fijo por letra/idioma. Sin ellas no hay preview fiel. Empezar en paralelo a la Fase 0.

## 7. Rigor (mandato #9) — pendiente de verificar
- Precio "Grass Roots US$249/mo" de Polotno: no publicado (cotización a medida). No citarlo como hecho.
- img.ly ~US$13k/año: viene de Vendr (agregador), no del precio oficial.
- Zakeke/Customily/Kickflip: cifras exactas sin verificar contra fuente oficial (no cambia el veredicto).
- Gate WCAG/axe/Lighthouse "corriendo en CI": los specs existen pero `ci.yml` no los invoca → tratar como
  "tests escritos", no "barrera automática", hasta confirmarlo.
- Umbrales exactos de bleed/safe-area/DPI del proveedor físico real (imprenta CO) → confirmar con el proveedor
  antes de masificar.
