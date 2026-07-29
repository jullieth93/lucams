# Estudio de Personalización — Lucams_shop

> **Diferenciador #1 de Lucams_shop**. ADR-013 (concepto) + ADR-035 (arquitectura técnica).
> Sub-bloque M.3.b — versión v2 productiva (mayo 2026, "tienda que envidiar").

## Filosofía de diseño

El Estudio es la pieza más sensible del producto: el cliente diseña EN VIVO el imán físico
que va a recibir. Si no es cómoda, si la cantidad de fotos no se valida vs el producto, si
las plantillas no se ven completas, si en mobile no funciona — Lucy pierde la venta y
recibe devoluciones por "no se parecía a lo que diseñé".

Por eso M.3.b se construye con estas reglas no negociables:

1. **Cero atajos pragmáticos** — donde un plan original decía "V1 simple, V2 evalúa",
   acá hago la versión completa. Sin "plan B aceptable".
2. **Cero costos extra** (mandato #2 del proyecto) — Polotno y comerciales descartados.
3. **Accessibility WCAG 2.1 AA** — keyboard nav completa, ARIA, screen reader,
   focus management, `prefers-reduced-motion`.
4. **Performance budget**: Lighthouse desktop ≥ 95, mobile ≥ 90. Konva lazy load
   por kind (productos NONE no descargan canvas engine).
5. **Tests rigurosos** — unit cobertura ≥ 80%, integration, E2E playwright,
   visual regression, axe a11y, Lighthouse CI.
6. **Plantillas son producto** — 30 SVG mockups custom diseñados a mano, no
   placeholders Unsplash genéricos.
7. **Telemetry production-grade** — embudo de conversión observable en admin.

## Paradigma técnico: slot-por-imán

Para un producto como "Set 6 Foto-imanes Polaroid Grande" (6 imanes físicos en un pack):

- El cliente elige UNA plantilla unitaria (ej. "Polaroid Clásico") → cómo se ve
  cada imán individual.
- El editor muestra los **6 imanes en grid** (preview general): mismo template
  aplicado N veces, cada uno con su foto.
- El cliente sube N fotos (drag, tap-on-slot o auto-fill) y las distribuye.
- Producción genera **N PNGs separados** 300 DPI (uno por imán físico).
- Preview compositado: 1 PNG mosaico del grid para mostrar en cart/orden.

Diferencia con paradigma "1 canvas grande con N slots":

- Set de 6 imanes ≠ 1 imán grande con 6 ventanas
- Lucy imprime 6 piezas separadas, cliente recibe 6 imanes que distribuye en su nevera

## Modelo de datos `canvasData` v2

```ts
type MultiSlotCanvasData = {
  version: 2;
  unitTemplate: CanvasData; // plantilla unitaria (1 imán, V1 shape)
  slotCount: number; // 6, 9, 12, 20 según photoSlots producto
  slots: SlotState[];
  gridLayout: { cols: number; rows: number; gap: number };
  // Ola 2A (2026-07-22) — color del marco alrededor de la foto (hex #RRGGBB),
  // elegido en el Estudio (antes era la variante "Estilo"/"Marco" de la PDP).
  // null = sin marco. Viaja a la cotización y al render de producción.
  borderColor?: string | null;
};

type SlotState = {
  slotIndex: number; // 0..N-1
  assetId: string | null;
  assetUrl: string | null;
  // Per-slot overrides (M.3.b.4):
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
  brightness?: number; // -100 a +100
  contrast?: number;
  saturation?: number;
  rotation?: number; // grados
  filter?: "vintage" | "vivid" | "bw" | "pastel" | "polaroid" | null;
  textOverride?: string; // si el template tiene texto editable
};

type CanvasData = {
  // shape V1 — usado como unitTemplate dentro de V2
  version: 1;
  stage: { width: number; height: number; dpiPreview: number; dpiProduction: number };
  layers: CanvasLayer[];
};
```

### Migración V1 → V2

Designs existentes con `canvasData.version: 1` se migran al cargar via
`lib/canvas-migrate.ts → migrateCanvasV1ToV2(data, photoSlots)`:

1. El `canvasData V1` completo pasa a ser `unitTemplate` del V2
2. Buscar el `image-placeholder` layer V1 (típicamente id `p1`) y extraer su
   `assetUrl` actual
3. `slotCount` se setea desde `product.personalizationSchema.photoSlots`
4. `slots[0]` recibe el `assetId/assetUrl` original; `slots[1..N-1]` quedan vacíos
5. `gridLayout` calculado por `generateGridLayout(slotCount, unitTemplate.stage)`

Migración es idempotente: re-llamar con data V2 retorna data V2 sin cambios.

## Estructura de archivos

```
apps/web/app/estudio/[slug]/
├── README.md                          # Este archivo
├── page.tsx                           # Server entry (auth + load product + templates)
├── studio-editor.tsx                  # Orquestador client (state, auto-save, finalize)
├── studio-canvas-grid.tsx             # Grid responsive de N StudioSlots
├── studio-slot.tsx                    # 1 mini-canvas Konva por imán
├── studio-sidebar.tsx                 # Mis fotos + Plantillas + Auto-fill
├── studio-message-field.tsx           # "Tu mensaje" pack-level en sidebar (Ola 3c)
├── studio-ig-border-toggle.tsx        # Polaroid Instagram: foto con/sin borde (Ola 3c)
├── studio-toolbar.tsx                 # Header con auto-save + progress + ¡Listo!
├── studio-realism-overlay.tsx         # Bleed/safe area/grosor/sombra Konva layers
├── studio-asset-picker-modal.tsx      # Modal tap-on-slot picker
├── studio-photo-adjust-modal.tsx      # Encuadre (zoom/pan/rotar) + filtros
├── studio-size-modal.tsx              # "Ver tamaño real" con calibración
├── types.ts                           # Types V2 client-safe
└── lib/
    ├── grid-layout.ts                 # generateGridLayout(N, stage) → cols/rows
    ├── canvas-migrate.ts              # migrateCanvasV1ToV2
    ├── photo-validation.ts            # sharp checks (resolution, dark, blur)
    ├── photo-filters.ts               # 5 presets + apply Konva filters
    └── store.ts                       # zustand store interno (undo/redo)

apps/web/features/personalization/
├── schemas.ts                         # Zod V2 + retro-compat V1
├── service.ts                         # server-only: createDraft, save, finalize
└── actions.ts                         # Server Actions con Zod + ownership

apps/web/lib/
├── storage.ts                         # uploadCustomerPhoto extendido con validation
└── estudio-telemetry.ts               # logger structured estudio.<step>.<result>

packages/db/scripts/
├── seed-templates.mjs                 # 30 templates V2 + generateTemplatePreview
└── template-mockups/                  # SVG inline por plantilla
    ├── photo-pack-polaroid-clasico.svg.ts
    ├── photo-pack-corazon-rosa.svg.ts
    └── ... (28 más)
```

### Ola 3b/3c (Lucy 2026-07-22) — marco full-bleed, tira, rotación, texto, táctil

- **Marco full-bleed ("fin del papel")**: en productos con `frameOptions`, elegir color
  pinta la TARJETA ENTERA de `borderColor` y la foto va inserta con franja mínima
  relativa (4% del lado menor del stage → proporcional en 6.5/8/10 cm). Misma regla en
  el editor (Konva) y en producción (`production-render-canvas`; `service.ts` →
  `frameFullBleed`). Helpers puros en `frame-palette.ts` (`frameBleedMargin`,
  `insetToMinMargin`).
- **Tira photobooth 6.5×20**: plantilla `photo-strip-3-fotos` = celda 390×400 con
  `frame-card` + foto casi a sangre; `gridCols: 1` + `gridGap: 0` (la plantilla puede
  fijar columnas y gap) → 3 celdas pegadas = tira continua. En modo tira la barra de
  acciones flota sobre la foto (`overlayActions`).
- **Rotación de foto**: `photoTransform.rotation` (pasos de 90°) desde "Ajustar foto"
  (modal desktop y editor táctil a pantalla completa). Konva + tier canvas la
  dibujan; el tier sharp la rechaza (NEEDS_KONVA). Apagada en calendarios.
- **Texto Polaroid**: vía principal = campo "Tu mensaje" en sidebar (pack-level,
  escribe todos los slots); tap en el texto del canvas = atajo al modal (guard
  anti doble-panel táctil en `studio-slot.tsx`).
- **Móvil**: slots NO interactivos de la grilla con `touch-action: pan-y` y capas
  Konva con `preventDefault={false}` → el scroll de página funciona sobre las fotos;
  el pinch corta cualquier drag de Konva activo (el gesto manda) en el editor a
  pantalla completa.

### Ola 4 (Lucy 2026-07-23) — calendario: slot = TARJETA COMPUESTA

- **El slot del calendario muestra la tarjeta completa** (foto + "ENE 2027" + grilla real del
  mes con festivos), no la foto a sangre. Antes el cliente subía 12 fotos "a ciegas" y solo
  veía la composición al finalizar. `studio-calendar-card-layer.tsx` dibuja el MISMO
  `drawCalendarPage` de producción/preview-3D en un canvas offscreen (0.5× = 540×720) y lo
  usa como fuente de un `Konva.Image` dentro del stage del slot (`studio-slot.tsx` rama
  `calendarCard`; el grid la activa con `calendarPreview={{ year, startMonth }}` desde
  `studio-editor.tsx`, con `year` = estado `selectedYear` del banner).
- **Decisión de render: en vivo, SIN debounce.** Cada repintado son ~50 ops vectoriales + 1
  drawImage a 540×720 (<3ms); solo se repinta cuando cambia foto/encuadre/año/fuentes de ese
  slot. Se descartó debounce y vista-previa-por-slot porque el costo es despreciable y la
  respuesta inmediata (drag/zoom de la foto con la grilla visible) es la gracia del cambio.
- **Interacción conservada**: el Konva.Image compuesto es draggable (el delta se acumula en
  `photoTransform`, pan de la foto en su franja 4:3); wheel/pinch zoom sigue en el Stage;
  smart-crop inicial de fotos nuevas igual que `ImagePlaceholder`.
- **Fuentes de marca reales en canvas 2D**: next/font hashea los nombres de familia
  (`__Fredoka_<hash>`), así que el literal "Fredoka" no existe en el document y los canvas
  del navegador caían a una genérica. `lib/calendar-card-preview.ts` resuelve el nombre real
  via CSS vars `--font-fredoka`/`--font-inter` y `drawCalendarPage` acepta `fonts` opcional
  (el server sigue con los TTF registrados "Fredoka"/"Inter"). Aplica también al montaje de
  confirmación y a las texturas 3D (`compose-calendar-page.ts`).

### Ola 4 (Lucy 2026-07-23) — Instagram binario, texto opcional, cuadrados, tira continua

- **Polaroid Instagram — fondo SOLO blanco/negro + contraste automático.** El picker del
  sidebar muestra solo blanco/negro (`StudioFramePicker allowCustom={false}`). Regla: fondo
  blanco → textos negros (los de la plantilla); fondo negro → TODOS los textos blancos
  (`#FFFFFF`, incluidos los hashtags) y el chrome SVG cambia a su variante oscura
  (`/templates/ig_post_3x4_dark.svg`, swap en `AssetLayerRenderer` — el canvasData conserva
  el src original). El color de letra es MANUALMENTE sobreescribible tocando cada texto
  (modal con color picker — el `textOverrides[].fill` siempre manda sobre el automático).
  Un `borderColor` pastel residual (cambio de plantilla) cae a fondo blanco
  (`instagramBackgroundHex`: solo un hex OSCURO pinta el fondo). Producción: Instagram
  siempre hornea el PNG del cliente (asset SVG → NEEDS_KONVA) → WYSIWYG automático.
- **Polaroid Clásica — el mensaje es OPCIONAL.** El campo "Tu mensaje" arranca vacío
  (antes mostraba el placeholder como valor → parecía obligatorio y el "Escribe tu mensaje"
  terminaba IMPRESO). Sin override, el editor dibuja el placeholder atenuado (45%,
  `name="edit-indicator"` → nunca se hornea en snapshots) y producción NO imprime nada
  (`renderTextLayer`: capa `editable` imprime solo su override; capas no editables —
  decorativas — imprimen su base). Producción WYSIWYG igual.
- **Cuadrados — sin borde = foto a sangre TOTAL; con borde = franja UNIFORME.** Aplica a
  "tarjetas simples" (`isSimpleCardTemplate`: fondo + foto, sin frame-card/chrome/texto
  visible — no aplica a Polaroid/Instagram/tiras). `simpleCardPhotoRect`: borderColor null
  → ventana = todo el stage (0 margen; antes quedaba la franja blanca de la plantilla);
  borderColor set → franja uniforme `frameBleedMargin` en los 4 lados (antes: márgenes
  asimétricos de la plantilla). Misma geometría en Konva y en `production-render-canvas`;
  `service.ts` manda los productos con frameOptions directo al tier canvas (el tier sharp
  no conoce la regla). Tests pixel-level en `production-render-canvas.test.ts` (Ola 4).
- **Tira photobooth — UNA pieza continua.** La celda trae la foto a sangre VERTICAL
  (y=0 → las fotos de celdas vecinas se tocan, gap 0 REAL); lados 12px (~2mm) de color y
  borde EXTERIOR 12px solo en first/last (`stripPhotoRect` por posición — la plantilla es
  uniforme por celda y no puede expresarlo). Sin sombra ni radio por celda (separaban la
  tira): UNA sombra CSS alrededor de la columna (`studio-canvas-grid` stripMode) y radio
  solo en las puntas. Preview compositado: sin stroke morado por celda, un solo borde
  exterior. Decisión: gutter entre fotos = 0 (referencia de Lucy acepta separación fina;
  si la pide, `stripPhotoRect` con inset>0 la añade en 1 línea).
- **Marco máximo consistente del lienzo (T9).** El grid ahora se dimensiona por ancho Y
  por alto: `slotDisplaySize = min(porAncho, porAlto)` donde porAlto sale de un marco del
  78% del alto del viewport (acotado 420–900px). El grid usa ancho explícito (celdas+gaps)
  con `margin: 0 auto` → ningún estudio se desborda (calendario 4×3, polaroid de 1 slot,
  tira 1-col) ni queda estirado; centrado siempre. Modo agrupado (separadores) intacto.
- **Uploader con formatos y resolución.** `lib/upload-guidance.ts` centraliza el `accept`
  (JPG, PNG, WebP, HEIC) y el texto visible junto a los puntos de subida (sidebar "Mis
  fotos", modal de elegir foto, onboarding): "…máx 10 MB por foto · para que se vea nítida
  al imprimir, que el lado menor tenga al menos ~N px (salida 300 DPI)", con N de la misma
  fórmula del quality-check (`PX_PER_CM_300DPI` × lado menor del tamaño físico).

## Wireframes ASCII

### Desktop (≥ 1024px)

```
╔═══════════════════════════════════════════════════════════════════════════╗
║ ← Volver | Personalizar: Set 6 Polaroid Grande | ✓ 3/6 fotos | ¡Listo! ✨ ║
╠═══════════════════════════╦═══════════════════════════════════════════════╣
║                           ║                                               ║
║  MIS FOTOS (4)            ║         PREVIEW GENERAL (6 imanes)            ║
║  ┌────┬────┬────┬────┐    ║                                               ║
║  │ 📷 │ 📷 │ 📷 │ 📷 │    ║      ┌──────────┬──────────┐                  ║
║  └────┴────┴────┴────┘    ║      │          │          │                  ║
║                           ║      │  Slot 1  │  Slot 2  │                  ║
║  [ + Subir foto ]         ║      │  ✓ foto  │  ✓ foto  │                  ║
║                           ║      │          │          │                  ║
║  [ 🪄 Llenar slots ]      ║      ├──────────┼──────────┤                  ║
║                           ║      │          │          │                  ║
║  ──────────────────       ║      │  Slot 3  │  Slot 4  │                  ║
║                           ║      │  ✓ foto  │   [ 4 ]  │ ← vacío          ║
║  PLANTILLAS               ║      │          │          │                  ║
║  ┌──────┬──────┐          ║      ├──────────┼──────────┤                  ║
║  │ Pol  │ Vint │          ║      │          │          │                  ║
║  │ Clás │      │ ← active ║      │   [ 5 ]  │   [ 6 ]  │ ← vacío          ║
║  └──────┴──────┘          ║      │          │          │                  ║
║  ┌──────┬──────┐          ║      └──────────┴──────────┘                  ║
║  │ Cuad │ Coraz│          ║                                               ║
║  └──────┴──────┘          ║   📐 5×5 cm · PET laminado · Ver tamaño real  ║
║                           ║                                               ║
║  [ Mostrar guías 👁️ ]     ║                                               ║
║                           ║                                               ║
╚═══════════════════════════╩═══════════════════════════════════════════════╝
```

### Mobile (< 768px)

Canvas fullscreen + sheet drawer pull-up con tabs. Bottom sticky CTA cuando completo.

```
┌─────────────────────────────────────┐
│ ←  Personalizar    3/6  |  ¡Listo! │ ← header sticky
├─────────────────────────────────────┤
│                                     │
│         ┌───────┬───────┐           │
│         │ Slot 1│ Slot 2│           │
│         │   ✓   │   ✓   │           │
│         ├───────┼───────┤           │
│         │ Slot 3│ Slot 4│           │
│         │   ✓   │  [4]  │ ← tap     │
│         ├───────┼───────┤           │
│         │ Slot 5│ Slot 6│           │
│         │  [5]  │  [6]  │           │
│         └───────┴───────┘           │
│                                     │
│       [ + ] zoom    [ - ] zoom      │ ← botones flotantes
│                                     │
├─────────────────────────────────────┤
│ ░ Plantillas   📷 Mis fotos  ⚙ ░  │ ← sheet drawer tabs
│  ┌──────┬──────┬──────┐             │
│  │ Pol  │ Vint │ Cuad │             │ ← swipe-up para expandir
│  └──────┴──────┴──────┘             │
└─────────────────────────────────────┘
```

### Modal: Subir/Ajustar foto

```
╔═══════════════════════════════════════╗
║  ←  Ajustar foto              [ × ]   ║
╠═══════════════════════════════════════╣
║                                       ║
║       ┌─────────────────────┐         ║
║       │                     │         ║
║       │      [PREVIEW]      │         ║
║       │       LIVE          │         ║
║       │                     │         ║
║       └─────────────────────┘         ║
║                                       ║
║   ☀️ Brillo      [────●────]   +20    ║
║   ◐ Contraste    [───●─────]    0     ║
║   🎨 Saturación  [───●─────]    0     ║
║   ✨ Nitidez     [ off / on ]         ║
║                                       ║
║   Filtros:                            ║
║   [Vintage] [Vivid] [B&N] [Pastel]    ║
║                                       ║
║   [ Recortar ✂️ ]  [ Rotar ↻ ]        ║
║                                       ║
║   [ Resetear ]  [ Aplicar ✓ ]         ║
╚═══════════════════════════════════════╝
```

### Modal: "Ver tamaño real"

```
╔═══════════════════════════════════════╗
║  Tamaño real                  [ × ]   ║
╠═══════════════════════════════════════╣
║                                       ║
║    Tu imán será aproximadamente:      ║
║                                       ║
║         ┌──────────────┐              ║
║         │              │              ║
║         │   [PREVIEW]  │ 5 cm          ║
║         │              │              ║
║         └──────────────┘              ║
║              5 cm                     ║
║                                       ║
║   ✓ Tamaño taza chica de café         ║
║                                       ║
║   📏 ¿Se ve bien? Calibrá con tarjeta:║
║      Coloca una tarjeta de crédito    ║
║      debajo del monitor y ajustá:     ║
║                                       ║
║      [───────●──────────]             ║
║                                       ║
║         [ Guardar calibración ]       ║
╚═══════════════════════════════════════╝
```

## Design tokens del Editor

Extensión de los tokens brand globales (definidos en `apps/web/app/globals.css`):

```css
:root {
  /* Slot states */
  --estudio-slot-empty-bg: #fff8f0; /* brand-cream */
  --estudio-slot-empty-border: #7c6aad; /* brand-purple, dashed */
  --estudio-slot-filled-shadow: rgba(124, 106, 173, 0.15);
  --estudio-slot-selected-ring: #5dd9d1; /* brand-turquoise */
  --estudio-slot-error-bg: #ffe5ec;

  /* Realism overlay */
  --estudio-bleed-color: rgba(255, 255, 255, 0.85);
  --estudio-safe-area-color: rgba(93, 217, 209, 0.6);
  --estudio-shadow-exterior: rgba(0, 0, 0, 0.18);

  /* Transitions */
  --estudio-trans-fast: 150ms ease-out;
  --estudio-trans-medium: 300ms ease-out;
  --estudio-trans-slow: 600ms cubic-bezier(0.4, 0, 0.2, 1);
  --estudio-stagger: 80ms; /* entre slots en auto-fill */

  /* Spacing */
  --estudio-gap-tight: 8px;
  --estudio-gap: 16px;
  --estudio-gap-loose: 32px;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --estudio-trans-fast: 0ms;
    --estudio-trans-medium: 0ms;
    --estudio-trans-slow: 0ms;
    --estudio-stagger: 0ms;
  }
}
```

## Estados de un slot

| Estado     | Visual                                                             | Interacción                                |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `empty`    | Cream bg + dashed purple border + número grande "N" + hint "Click" | Click → asset picker / Tap → file picker   |
| `hover`    | Border 2px solid purple + scale 1.02                               | Pre-click feedback                         |
| `dropping` | Border 2px solid turquoise + bg turquoise/10 + pulse               | Cuando asset es draggeado encima           |
| `filled`   | Foto del cliente + overlay realismo + shadow purple/15             | Click → modal ajustar foto                 |
| `selected` | Filled + ring turquoise 3px afuera del bleed                       | Después de click; muestra controles inline |
| `error`    | Bg red-50 + border red + icon ⚠️                                   | Foto rechazada (low-res, etc.)             |

## Cómo agregar un `PersonalizationKind` nuevo

1. **Schema Prisma**: agregar valor al enum `PersonalizationKind`
2. **Type client**: agregar al union `PersonalizationKind` en `types.ts`
3. **Seed templates**: agregar plantilla(s) en `seed-templates.mjs` con `kind: 'NEW_KIND'`
   - `unitTemplate`: shape canvas V1 con layers (background, image-placeholder, text, shape)
   - Definir `personalizationSchema` por defecto en el `Product` que use este kind
4. **SVG mockup**: agregar archivo `packages/db/scripts/template-mockups/<slug>.svg.ts`
   con función `getSvgMockup({width, height, brand}): string` retornando SVG inline
5. **Grid layout**: si requiere layout no-standard, agregar caso en `lib/grid-layout.ts`
6. **Sub-editor opcional**: si el kind requiere UI específica (ej. EVENT_FAVOR con
   campos de texto evento), agregar `studio-sub-editor-<kind>.tsx` y switch en `studio-editor.tsx`

## Telemetry events estandarizados

| Event                             | Payload                                                  | Cuándo se emite                |
| --------------------------------- | -------------------------------------------------------- | ------------------------------ |
| `estudio.load.success`            | `productSlug, slotCount, kind`                           | Mount editor                   |
| `estudio.upload.success`          | `assetId, sizeBytes, mimeType, validationLevel`          | Foto subida OK                 |
| `estudio.upload.warn_low_quality` | `assetId, reason ('dark'/'blur'/'lowres')`               | Validación sharp warning       |
| `estudio.upload.fail`             | `reason, sizeBytes, mimeType`                            | Upload rechazado server        |
| `estudio.slot.assign`             | `slotIndex, designId, method ('drag'/'tap'/'auto-fill')` | Foto asignada a slot           |
| `estudio.slot.clear`              | `slotIndex, designId`                                    | Foto quitada de slot           |
| `estudio.template.change`         | `fromTemplate, toTemplate, preservedAssets`              | Plantilla cambiada             |
| `estudio.photo.adjust`            | `slotIndex, changes (brightness/etc.)`                   | Foto ajustada                  |
| `estudio.finalize.start`          | `designId, slotCount`                                    | Click "¡Listo!"                |
| `estudio.finalize.success`        | `designId, productionUrlsCount, durationMs`              | Snapshot generado + cart added |
| `estudio.finalize.fail`           | `designId, reason`                                       | Finalize falló                 |
| `estudio.abandon`                 | `designId, lastStep, slotsCompleted/slotCount`           | beforeunload sin finalizar     |

Todos los eventos pasan por `apps/web/lib/estudio-telemetry.ts` que loguea
structured + (futuro Fase 5) envía a analytics agregador respetando consent
cookies.

## Performance budget

Validado en CI vía Lighthouse CI:

| Métrica        | Desktop | Mobile  |
| -------------- | ------- | ------- |
| Performance    | ≥ 95    | ≥ 90    |
| Accessibility  | ≥ 95    | ≥ 95    |
| Best Practices | ≥ 95    | ≥ 95    |
| SEO            | ≥ 90    | ≥ 90    |
| LCP            | < 2.0s  | < 2.5s  |
| INP            | < 100ms | < 200ms |
| CLS            | < 0.05  | < 0.1   |

Estrategias aplicadas:

- Konva chunk lazy-loaded con `next/dynamic + ssr: false` (no en initial bundle)
- React 19 transitions para template change (no blocking UI)
- Image optim via `next/image` con responsive `sizes`
- SVG mockups inline en lugar de PNG cuando aplique
- Suspense boundaries por slot (cargan en paralelo)
- Auto-save debounced 2s + dirty flag (no save si no hubo cambio real)

## Accessibility — checklist WCAG 2.1 AA

- [x] Keyboard navigation: Tab por todos los controles + Enter/Space activan +
      arrows mueven entre slots + Esc cierra modales + Delete quita foto del slot
- [x] ARIA labels en cada slot: `aria-label="Slot N de M, vacío/lleno"`
- [x] `aria-live="polite"` para anuncios de auto-save y completion
- [x] Focus visible siempre (no `outline: none` sin reemplazo)
- [x] Contrast ratios AA validados con axe-core en CI
- [x] `prefers-reduced-motion` respetado en todas las animaciones
- [x] Modales con `<Dialog>` Radix → focus trap + Esc + click outside cierra
- [x] Skip links si scroll es largo (mobile con grid 20 slots)
- [x] Alt text en preview compositado para screen readers: "Vista previa de 6
      imanes Polaroid con tus fotos"
- [x] Form labels asociados explícito (htmlFor) en todos los sliders/inputs
- [x] Touch targets ≥ 44×44px en mobile

## Tests

Ver `tests/unit/`, `tests/integration/`, `tests/e2e/` para los specs.

Comandos:

```bash
make test-unit        # vitest
make test-integration # vitest con DB de test
make test-e2e         # playwright (incluye visual regression)
make test-a11y        # axe-core CLI sobre /estudio en preview
make test-lighthouse  # lighthouse-ci sobre /estudio
```

## Referencias

- **ADR-013**: Estudio de Personalización como diferenciador #1 (concepto)
- **ADR-035**: Arquitectura Estudio v1 — react-konva + 9 kinds + 3 buckets
- **ADR-035 addendum 2026-05-13**: Paradigma slot-por-imán + decisiones M.3.b
- **ADR-037**: Filosofía best practices Estudio v2 — sin atajos pragmáticos
- **Plan completo**: `~/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md` § M.3.b
