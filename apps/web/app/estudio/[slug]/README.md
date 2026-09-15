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
5. **Tests rigurosos** — unit/integration con cobertura gateada en CI (umbrales
   reales de `apps/web/vitest.config.ts`: lines 71 / statements 69.5 /
   functions 68.5 / branches 62, calibrados por ratchet), E2E playwright,
   visual regression, axe a11y, Lighthouse CI.
6. **Plantillas son producto** — mockups SVG profesionales en `apps/web/public/templates/`
   (claro/oscuro y variantes `*_noborder.svg`), no placeholders genéricos.
7. ~~**Telemetry production-grade**~~ — **no implementado**: el módulo
   `lib/estudio-telemetry.ts` y los eventos `estudio.*` de abajo quedaron como contrato
   de diseño (ver sección Telemetry); hoy el embudo no se observa por eventos.

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
`app/estudio/[slug]/lib/canvas-migrate.ts → migrateCanvasV1ToV2(data, photoSlots)`:

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
├── loading.tsx                        # Fallback de la ruta
├── studio-editor-loader.tsx           # Frontera client: carga el editor con ssr:false
├── studio-editor.tsx                  # Orquestador client (state, auto-save, finalize)
├── studio-canvas-grid.tsx             # Grid responsive de N StudioSlots
├── studio-slot.tsx                    # 1 mini-canvas Konva por imán
├── studio-sidebar.tsx                 # Mis fotos + Plantillas + Auto-fill
├── studio-message-field.tsx           # "Tu mensaje" pack-level en sidebar (Ola 3c)
├── studio-toolbar.tsx                 # Header con auto-save + progress + Vista previa
├── studio-realism-overlay.tsx         # Bleed/safe area/grosor/sombra Konva layers
├── studio-asset-picker-modal.tsx      # Modal tap-on-slot picker
├── studio-photo-adjust-modal.tsx      # Encuadre (zoom/pan/rotar) + filtros
├── studio-slot-edit-modal.tsx         # Editor de slot a pantalla completa (Ola 6)
├── studio-text-editor-modal.tsx       # Edición de capas de texto del canvas (M.3.b.D)
├── studio-preview-modal.tsx           # "Así se verá tu pedido": preview final + total
│                                      #   (unitario × copias de la PDP) → recién ahí al carrito
├── studio-onboarding.tsx              # Modal de bienvenida / tour inicial
├── studio-gestures-hint.tsx           # Pista de gestos táctiles (drag/pinch/doble-tap)
├── studio-consent-text.tsx            # Consentimiento de derechos de imagen (Ley 1581)
├── studio-ai-panel.tsx                # Asistente IA de ideas (ADR-058) — copy CMS estudio.ia.*
├── studio-style-toolbar.tsx           # Toolbar de estilo: marco, fondo, tipografía (Ola 10)
├── studio-photo-preview.tsx           # Preview de foto subida (Ola 9)
├── studio-texts.ts                    # Tipos + defaults del copy del Estudio
├── studio-texts-provider.tsx          # Context client del copy (useStudioTexts)
├── studio-texts.server.ts             # getStudioTexts: 1 query por prefijo estudio.* (CMS B1)
├── name-editor.tsx                    # Editor de Nombre Personalizado (fichas de letras)
├── letter-set-editor.tsx              # Editor de sets de letras — Abecedario/Vocales (ADR-057)
├── letter-tile.tsx                    # Ficha de letra individual
├── letter-color-controls.tsx          # ThemePicker + SwatchRow (tema + color por ficha)
├── letter-style-picker.tsx            # Picker de estilo de letra
├── use-letter-colors.ts               # Estado de colores de fichas (tema/barajar/por ficha)
├── calendar-card-focus.tsx            # Visor detalle 1-a-1 de tarjetas mes (Ola 2C)
├── client-image-compress.ts           # Compresión de foto en el cliente antes de subir
├── types.ts                           # Types V2 client-safe
├── use-dialog-a11y.ts                 # Hook a11y de modales (focus trap, Esc, retorno foco)
├── use-is-touch.ts                    # Detección de dispositivo táctil
├── use-prefers-reduced-motion.ts      # Respeta prefers-reduced-motion
├── magnet-3d.tsx                      # Escena 3D base del imán (react-three-fiber)
├── polaroid-3d-view.tsx               # Vista 3D polaroid
├── calendar-view-3d.tsx               # Vista 3D calendario
├── book-view-3d.tsx                   # Vista 3D libro (separadores — ADR-063)
├── fridge-3d-view.tsx                 # Vista 3D nevera
├── room-board-view-3d.tsx             # Vista 3D tablero magnético en pared
├── scene-gallery.tsx                  # Galería "míralo en tu espacio" (ADR-063)
├── studio-3d-environment.tsx          # Entorno/luces compartido de las escenas 3D
├── fit-camera.tsx / fit-camera-polar.tsx  # Encuadre de cámara 3D
├── use-window-textures.ts             # Texturas de ventana para escenas
└── lib/
    ├── grid-layout.ts                 # generateGridLayout(N, stage) → cols/rows
    ├── cluster-layout.ts              # Clúster 3D a tamaño real (nevera/tablero): columnas
    │                                  #   balanceadas que se abren al superar el alto útil
    ├── canvas-migrate.ts              # migrateCanvasV1ToV2
    ├── photo-filters.ts               # 5 presets + apply Konva filters
    ├── smart-crop.ts                  # Smart auto-crop (smartcrop.js) de fotos nuevas
    ├── upload-guidance.ts             # accept (JPG/PNG/WebP/HEIC) + texto de resolución
    ├── size-comparator.ts             # "5×5 cm" vs objeto cotidiano (reemplazó al
    │                                  #   modal "Ver tamaño real")
    ├── calendar-card-preview.ts       # drawCalendarPage en vivo en el slot de calendario
    ├── compose-calendar-page.ts       # Composición de página de calendario (3D/confirmación)
    ├── compose-gift-flatlay.ts        # Flat-lay de regalo del fotoimán (ADR-063)
    ├── compose-shelf-flatlay.ts       # Flat-lay de repisa (ADR-063)
    ├── letter-set-resolve.ts          # Resuelve la variante exacta del set (tema/idioma/tamaño)
    ├── letter-tile-textures.ts        # Texturas de las fichas de letra
    ├── faces.ts                       # Caras por unidad física (separadores 2 caras, Ola 3)
    ├── fonts.ts                       # Font picker (M.3.b.D)
    ├── procedural-textures.ts         # Texturas procedurales canvas 2D → CanvasTexture
    ├── book-geometry.ts               # Geometría del libro 3D
    └── store.ts                       # zustand store interno (undo/redo)

apps/web/features/personalization/
├── schemas.ts                         # Zod V2 + retro-compat V1
├── service.ts                         # server-only: createDraft, save, finalize
├── actions.ts                         # Server Actions con Zod + ownership
├── letter-tiles.ts                    # Lógica de sets de letras (ADR-057)
├── calendar-layout.ts / calendar-draw.ts  # Layouts y draw de calendarios
├── production-render*.ts              # Render de producción 300 DPI (tiers sharp/canvas)
└── … (frame-palette, surface, staged-slots, assembly-sheet, etc.)

apps/web/features/ai/
├── schemas.ts                         # DesignSuggestInputSchema + sanitizeOccasion
│                                      #   (quita PII de la ocasión antes de llamar al LLM)
└── actions.ts                         # suggestDesignAction (Google Gemini, ADR-058)

apps/web/lib/
├── storage.ts                         # uploadCustomerPhoto extendido con validation
└── photo-validation.ts                # sharp checks (resolution, dark, blur)

packages/db/scripts/
├── seed-templates.mjs                 # Plantillas V2; los SVG mockup viven en
│                                      #   apps/web/public/templates/ (ig_post_3x4.svg, …)
└── seed-letter-sets.mjs               # Sets de fichas por defecto es/en (ADR-057)
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
  fijar columnas y gap) → 3 celdas pegadas = tira continua (con canaleta del color
  del marco ENTRE fotos vía `stripPhotoRect`, regla 2026-09-08 — ver Ola 4 abajo).
  En modo tira la barra de acciones flota sobre la foto (`overlayActions`).
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
  blanco → textos negros (los de la plantilla); fondo negro → textos blancos
  (`#FFFFFF`) y el chrome SVG cambia a su variante oscura
  (`/templates/ig_post_3x4_dark.svg`, swap en `AssetLayerRenderer` — el canvasData conserva
  el src original). El color de letra es MANUALMENTE sobreescribible tocando cada texto
  (modal con color picker — el `textOverrides[].fill` siempre manda sobre el automático).
  Un `borderColor` pastel residual (cambio de plantilla) cae a fondo blanco
  (`instagramBackgroundHex`: solo un hex OSCURO pinta el fondo). Producción: Instagram
  siempre hornea el PNG del cliente (asset SVG → NEEDS_KONVA) → WYSIWYG automático.
  **Ola 26 (2026-09-09) — EXCEPCIÓN hashtags:** la capa `hashtags` YA NO cae al
  blanco/negro del contraste — SIEMPRE se dibuja azul link de Instagram
  (`igTextFill` en instagram-template-spec.ts: `#00376B` sobre tarjeta clara,
  `#0095F6` sobre oscura — contraste AA ≥4.5 en ambas). El resto de textos
  (usuario, ubicación, likes, título) sigue el contraste de la tarjeta.
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
- **Tira photobooth — UNA pieza continua, con canaletas entre fotos (regla
  2026-09-08, Lucy validó en local).** La celda trae la foto a sangre VERTICAL
  (y=0) y la geometría final la pone `stripPhotoRect` por posición (la plantilla
  es uniforme por celda y no puede expresarlo): lados 12px (~2mm) de color, borde
  EXTERIOR 12px solo en first/last y —nuevo— media canaleta de 8px
  (`stripGutterPx` ≈ 0.7mm por cara) arriba/abajo de cada foto → 16px (~1.3mm)
  visibles entre fotos consecutivas, del color del marco (frame-card), como la
  tira física. Las celdas SIGUEN pegadas (gap CSS 0: el gap del grid no entraría
  al PNG de producción, que renderiza celda a celda — la canaleta vive dentro de
  cada celda para que preview Konva y `production-render-canvas` consuman la
  misma matemática, WYSIWYG). Sin sombra ni radio por celda (separaban la
  tira): UNA sombra CSS alrededor de la columna (`studio-canvas-grid` stripMode)
  y radio solo en las puntas. Preview compositado: sin stroke morado por celda,
  un solo borde exterior.

### Ola 30 (owner 2026-09-15) — placeholder-guide universal, delimitaciones progresivas, upscale local, 3D tamaño real

- **Texto placeholder VISIBLE en la grilla, en TODAS las plantillas (redefine Ola 25 y
  unifica la excepción Ola 28 de IG).** El owner pidió ver "cómo se vería" el texto
  directamente en el canvas del Estudio (no solo en edición/preview): `renderText` dibuja
  el default de la capa editable con opacidad 0.4 (`PLACEHOLDER_GUIDE_OPACITY`,
  `studio-brand.ts`) como nodo `name="placeholder-guide edit-indicator"` — mismo fill por
  capa (incluye `igTextFill`), `listening={false}`. Konva trocea `name()` por espacios,
  así que los 4 puntos que ya ocultan `.edit-indicator` antes de `toDataURL` lo excluyen
  de snapshots/preview-confirmación/producción SIN tocar esos call sites. Modal de
  edición, preview, 3D y confirmación siguen sin dibujar placeholders (regla Ola 25
  intacta fuera de la grilla) y el render server imprime solo `override.text`. El
  parámetro `showTemplateDefault` (excepción IG) desapareció: Clásica e Instagram se
  comportan idéntico. COROLARIO: el default decorativo de IG ("362 me gusta") ya no se
  hornea en producción vía snapshot — los 4 requeridos de Ola 26 igual seguían
  bloqueados hasta tener override.
- **Delimitaciones de slot progresivas (C1).** Tres niveles, colores centralizados en
  `SLOT_GUIDE_COLORS` (`studio-brand.ts`): reposo = contorno punteado morado sutil
  (0.35) SIEMPRE visible en slots vacíos (antes solo aparecía algo al arrastrar);
  hover = 0.6; drag-over = turquesa pleno (intacto). Respeta la forma física
  (heart/circle/rect) con los mismos dibujos de siempre.
- **Upscale local de fotos (C2, `client-photo-upscale.ts`).** Si la foto queda bajo el
  ratio 1.0 para el tamaño del producto (misma regla del server: min(cm)×118.11 px),
  se re-muestrea en el navegador ANTES de subir: pasos ≤×2 con
  `imageSmoothingQuality:"high"` + unsharp 3×3 leve (k=0.3), tope ×4. Si aun así queda
  bajo 0.5, banner con CMS `estudio.fotos.aviso-mejora-auto`. No crea información: una
  foto muy pequeña seguirá con aviso (por eso el copy pide la original).
- **3D tamaño real SIEMPRE (E1/E2).** `magnetWorldSizes` ya no encoge (se eliminó el
  factor `f = min(1, …)`): cada pieza se dibuja a su tamaño físico (cm × uPerCm) en
  nevera y tablero; el clúster crece en filas/columnas y `FitCamera` encuadra
  nevera + clúster. Alargados en el libro:
  `flatBookmarkSlots(count, { pieceW })` separa centro-a-centro = pieza + 0.15 u y
  reparte en filas balanceadas en z si se sale del ancho de la hoja (antes el spread
  topeado a 0.9 u < pieza de 1.2 u los sobreponía siempre). La galería "en tu espacio"
  recibe `flat` (noFold) y ya no rota 90° las texturas de Alargados (misma excepción
  Ola 17 que el modal).
- **Fix desborde del clúster (mismo día, feedback owner: 12 tiras en UNA columna de 3+ m).**
  La lógica de disposición se UNIFICÓ en `lib/cluster-layout.ts` (`clusterLayout` /
  `clusterColumnCount`, puro y testeado), compartida por nevera y tablero (antes dos copias
  paralelas que divergían). Regla nueva: cuando una columna supera el ALTO útil de la
  superficie se ABREN más columnas balanceadas (≤ 1 pieza de diferencia entre columnas;
  relleno por filas → preserva el orden de lectura del grid, p.ej. meses del calendario) —
  el ancho puede crecer más allá de la puerta/tablero si hace falta y la cámara reencuadra
  (`maxDistance` de ambas escenas sube a 60 para que el reencuadre no quede topeado en
  móvil vertical). La galería 3D gana un rótulo overlay "N tiras/unidades · tamaño real"
  (`countBadgeLabel`, DOM como los hints — no toca texturas ni el canvas WebGL).
- **Proporciones pieza↔mueble REALES (mismo día, feedback dueña: nevera "como muy
  grandes… puede ser un nevecón" · "3D Mural, totalmente desproporcionada").** Las
  dimensiones físicas de las superficies se centralizan en `lib/cluster-layout.ts`
  (`FRIDGE_SCENE` / `BOARD_SCENE`, fuente única que importan las vistas Y los tests de
  proporción). (a) La nevera pasa de top-freezer 170×68 cm (angosta: una tira de 6.5 cm
  era ~10% del ancho y dominaba) a NEVECÓN SIDE-BY-SIDE 178×91×75 cm — dos puertas
  verticales full-height con junta central y manijas en la junta; el clúster se reparte
  sobre AMBAS puertas con ancla en zona alta (una tira de 26.5 cm = ~15% del alto; un
  fotoimán 6.5 = ~7% del ancho). (b) El mural pasa de tablerito 45×33 cm (solo cabía 1
  fila de tiras → 12 columnas desbordadas por ambos lados) a corcho de pared 120×80 cm
  con marco de 5.5 cm (escala redonda 0.1 u/cm): las 12 tiras 6.5×26.5 quedan en grilla
  6×2 DENTRO del marco con aire; 24 fotoimanes 6×8 en grilla 4×6. Tests de proporción en
  `cluster-layout.test.ts` (ratios cm↔cm y grillas que caben con márgenes).
- **Nevecón FRENCH DOOR + imanes que nunca cruzan la junta (mismo día, 3ª pasada — foto de
  referencia de la dueña).** (a) El side-by-side de dos puertas full-height se leía como
  CLOSET ("el mueble parece un closet y no una nevera"): la geometría se rediseña como la
  referencia — DOS PUERTAS SUPERIORES (~68% del frente útil) + GAVETA DE FREEZER inferior
  (~32%, manija HORIZONTAL cromada sobre canal embutido) + DISPENSADOR de agua/hielo en la
  puerta izquierda (panel oscuro con receso y paleta, ~11×23 cm a la altura de los ojos).
  Mismas dimensiones físicas 178×91×75 cm y materiales. (b) Regla física: "las fotoimanes no
  pueden estar centradas en los bordes de las puertas" — un imán se pega a UNA puerta, NUNCA
  sobre la junta central. El clúster se parte en DOS sub-clústeres independientes
  (`frenchDoorClusterLayout` en `lib/cluster-layout.ts`, puro y testeado): la primera mitad
  ⌊n/2⌋ a la puerta IZQUIERDA (orden de lectura) y el resto a la DERECHA (con 1 pieza cae en
  la derecha, la que más se usa); cada sub-clúster usa `clusterLayout` dentro de SU región
  (`FRIDGE_SCENE.cluster.left/right`, `doorMaxW` 1.55 u — ni junta ni manijas bajo las
  piezas; la gaveta NO lleva imanes; el clúster izquierdo queda SIEMPRE bajo el dispensador,
  `left.topY < dispenser.bottomY`). Tests: aserción explícita de que ningún item intersecta
  la franja `seamHalfW` con 12 tiras (6/6), 24 fotoimanes (12/12), 1 y 2 piezas.

### Ola 23 (Lucy 2026-09-08) — placeholders no imprimibles, marco constante, tira sin borde

- **Textos por defecto = placeholders NO imprimibles Y NO VISIBLES (TODAS las plantillas).**
  _(Regla de la grilla REDEFINIDA por Ola 30: el placeholder SÍ se dibuja en la grilla
  como guía atenuada al 40%, nunca en snapshots; fuera de la grilla esta regla sigue
  vigente tal cual.)_
  El default de cualquier capa `editable` ("Escribe tu mensaje", "@tu_usuario", "362 me gusta"…)
  nunca es contenido de la tarjeta: NADA se dibuja (grilla, preview del modal, 3D,
  confirmación) hasta que el cliente escribe su texto. En la grilla el campo se descubre
  como ZONA DE EDICIÓN vacía (recuadro punteado turquesa + dot + hit invisible,
  `edit-indicator` — se esconde antes de `toDataURL`); la vía principal es la pestaña
  Texto del modal de edición, cuyo input muestra el default como placeholder gris
  (atributo HTML, no valor precargado). El render server (`renderTextLayer`) imprime solo
  `override.text`; un override solo de estilo (sin texto) sigue sin imprimir.
  **Historia:** Ola 23 los atenuaba (45%, `edit-indicator`) y Ola 24 endureció con
  itálica + subrayado punteado (también en la miniatura `polaroid_clasica.svg`); el dueño
  validó en STG que aun atenuados se leían como texto físico → Ola 25: la tarjeta nace
  VACÍA y la miniatura ya no hornea el texto.
- **El marco es MARCO, no fondo (marco de ancho constante bajo zoom/pan).** Con tarjeta de
  color (frame-card/full-bleed), el hueco que deja la foto al alejarla (zoom-out) o moverla
  se rellena con el color de la tarjeta SIN marco (capa `background`) — antes asomaba
  `borderColor` y la franja "crecía". Editor: Rect de respaldo en `ImagePlaceholder`
  (`photoBackingHex`, también en `StudioPhotoPreview`); producción: fillRect equivalente en
  `production-render-canvas`. **Ola 24:** la decisión vive en `photoBackingHexFor`
  (frame-palette, compartida por las 3 superficies) y la Instagram CON borde YA NO está
  excluida (su ventana también se inundaba del color del borde con tarjeta oscura); en
  Instagram SIN BORDE sigue sin aplicar (el hueco es el color de tarjeta del diseño).
- **Tira SIN borde (toggle "Borde de foto" de la toolbar).** El toggle reescribe el
  placeholder a sangre total de la celda → `isStripBorderless` + `stripPhotoRect(…,
{ borderless: true })`: la tira queda CONTINUA de verdad — sin marco exterior Y SIN
  canaletas entre fotos (las fotos se tocan; Ola 25 — Ola 23 conservaba las canaletas
  y el dueño las marcó con X en STG). Detección por geometría → producción consume la
  misma regla (el rect viaja en canvasData).
- **Tarjeta clara sobre lienzo claro (white-on-white).** El slot lleva un filete DOM de
  contraste (`outline` brand-purple/35) cuando la tarjeta es clara — adorno de pantalla,
  nunca entra al PNG de producción. **Ola 24:** para la tarjeta BLANCA el filete se
  reemplaza por una bandeja cuadriculada gris/blanco (patrón "transparencia" de los
  editores de foto): el Stage se dibuja 6px inset dentro del mismo footprint del slot
  (`WHITE_CARD_CHECKER` en studio-slot) → la tarjeta blanca se lee en pantalla. Sigue
  siendo 100% DOM: el snapshot captura solo el canvas Konva. **Ola 25:** la MISMA bandeja
  se aplica en el preview del modal de edición (`StudioPhotoPreview`) — la tarjeta blanca
  también se perdía contra el fondo blanco del modal.
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

### Ola 24 (Lucy 2026-09-09) — toolbar de estilo reordenada + zoom milimétrico

- **«Borde de foto» PRIMERO, «Color de tarjeta» DEBAJO** en `studio-style-toolbar.tsx`
  (ambas Polaroids y el resto de productos con marcos). Con «Sin borde» la paleta de
  color queda DESACTIVADA (visible pero inerte: `aria-disabled` + atenuada + aviso CMS
  `estudio.texto.estilo-color-deshabilitado-hint`) en las plantillas Polaroid — la foto
  cubre toda la tarjeta y el color no aplica — y en las TIRAS photobooth (aviso propio
  `estudio.texto.estilo-color-deshabilitado-hint-tira`): sin borde ya no hay canaletas
  entre fotos, así que `borderColor` no pinta nada. El estado NO se resetea (al volver
  a «Con borde» el color sigue, y en la tira vuelve a pintar las canaletas). Cuadrados
  NO se desactivan: su franja uniforme usa `borderColor` aun sin borde.
- **Zoom de foto "milimétrico"**: la rueda del mouse avanza ×1.04 por notch (antes
  ×1.15 — saltos toscos). La función `nextWheelScale` (studio-slot) la comparten el
  handler Konva, el listener nativo del slot y el preview del modal; el pinch sigue
  siendo continuo (ratio de distancia). El chip de % del slot refleja el valor exacto.

### Ola 26 (Lucy 2026-09-09) — IG: textos por capa + textos requeridos; checkerboard fuerte; tira 4 fotos

- **Polaroid Instagram — color de texto POR CAPA (hashtags siempre azules).** El default
  de letra sigue al color de la tarjeta por capa (`igTextFill`, instagram-template-spec):
  usuario/ubicación/likes/título = contraste (tarjeta clara → fill oscuro de plantilla;
  oscura → `#FFFFFF`), pero `hashtags` SIEMPRE azul link IG (`#00376B` clara / `#0095F6`
  oscura — AA ≥4.5 en ambas; nunca cae al blanco del contraste como antes). El
  `textOverrides[].fill` del cliente sigue mandando sobre todo. WYSIWYG: la Instagram
  siempre hornea el PNG del cliente (chrome SVG → NEEDS_KONVA en ambos tiers server), así
  que producción hereda la misma regla del render Konva (studio-slot `renderText` ahora
  recibe el `defaultFill` ya resuelto del call-site en vez del booleano `darkCard`).
- **Polaroid Instagram — TODOS los textos requeridos para finalizar** (decisión owner):
  usuario, ubicación, título y hashtags son obligatorios (`IG_REQUIRED_TEXT_LAYER_IDS`);
  el contador "362 me gusta" queda decorativo. Con la tarjeta que nace VACÍA (Ola 25),
  una polaroid IG podía finalizarse en blanco → «Vista previa» se BLOQUEA mientras alguna
  capa requerida no tenga override con texto en TODOS los slots del pack
  (`igMissingRequiredTextLayerIds`; un campo falta si ALGÚN slot no lo tiene — cada imán
  es un post independiente). Mismo patrón del bloqueo por fotos: botón deshabilitado +
  tooltip/aria con los campos faltantes (`estudio.lienzo.finalize-tooltip-textos` +
  etiquetas `estudio.texto.campo-ig-*`; el editor pasa `finalizeBlockReason` al
  `StudioToolbar`/`StudioFinalizeFab`, y `handleFinalize` tiene la defensa en profundidad
  con el mismo mensaje).
- **Checkerboard de la tarjeta blanca más fuerte** ("muy leve"): cuadrados `#CDC7DB`
  (antes `#ECE9F1`, casi invisible) de 16px (antes 12px) y bandeja de 8px (antes 6px) —
  `WHITE_CARD_CHECKER`/`WHITE_CARD_CHECKER_SIZE`/`WHITE_CARD_TRAY_PAD` en studio-slot,
  consumidos también por el preview del modal (studio-photo-preview). Sigue siendo
  adorno 100% DOM: nunca entra al PNG de producción.
- **Nombre Personalizado — «Borde de las fichas» ARRIBA de «Elige los colores»**
  (name-editor): primero se define el borde; debajo queda la paleta que se desactiva con
  «Sin borde» (mismo orden que la toolbar de estilo, Ola 24). Regla de desactivado intacta.
  El editor de sets de letras (abecedario/vocales) quedó con el MISMO orden tras el
  refactor multi-unidad (Ola 27) y el owner lo confirmó para esa superficie el 2026-09-11
  (el spec `estudio-letterset` se actualizó: antes fijaba el orden viejo).
- **FIX tira de 4 fotos sin canvas** (owner en STG): la plantilla `photo-strip-4-fotos`
  nació en el one-off `ola18b-cuadrados-tiras-fix.mjs` y NO estaba en
  `seed-templates.mjs` → el barrido de legacy del seed la soft-deleteaba en CADA corrida;
  sin plantilla activa que matcheara el `aspectRatio "3:4"` de la variante, el filtro de
  aspect dejaba la lista vacía y el boot caía al template cuadrado genérico 1080×1080
  (grilla 2×2 en vez de la tira). La plantilla (celda 390×530, gridCols 1, gridGap 0) se
  declaró en el seed → upsert idempotente que la mantiene activa. Regresión E2E en
  `pdp-cantidad-tira.spec.ts` (4 celdas verticales en UNA columna, no cuadrados 2×2).

### Ola 27 (owner 2026-09-09) — modelo MULTI-UNIDAD: N unidades, CADA UNA diseñable

**Regla general aprobada por el dueño: "Unidades" = N unidades del producto, CADA
UNA diseñable por separado en el Estudio. El concepto "copias idénticas" desaparece
de todas las superficies personalizables.**

- **Flujo**: la PDP fija "Unidades" = N (stepper, misma etiqueta de siempre) → el
  Estudio abre con N unidades a diseñar (2 tiras de 3 fotos = 2 × 3 slots; 2
  calendarios = 2 × 12 tarjetas; 3 separadores = 3 × 2 caras — el caso que ya
  existía vía `facesPerUnit`). La Vista previa muestra TODAS las unidades (el
  cliente ve exactamente lo que recibe), el carrito recibe UNA línea con el diseño
  completo (qty 1) y producción renderiza TODAS las unidades.
- **Schema (aditivo, sin bump de versión)**: `canvasData` V2 gana `unitCount?` y
  `unitSlots?` (ausentes = 1 unidad → los diseños guardados antes de la ola cargan
  intactos). Invariante: `slotCount = unitCount × unitSlots`. Con N unidades
  multi-slot (y fuera del modo agrupado de separadores) `gridLayout` describe la
  grilla de UNA unidad; en el resto de casos sigue describiendo el diseño completo.
  Helpers puros en `features/personalization/design-units.ts` (client y server).
- **Invariante de escritura**: `unitCount`/`unitSlots` solo se persisten cuando
  `unitSlots > 1` (tiras, calendarios, separadores). Los packs de imán suelto
  (polaroid/cuadrados) NO los declaran: su "Unidades" de la PDP es el pack size de
  la variante (cada imán se diseña por separado desde siempre, grilla plana) y su
  multiplicador de precio queda ×1 para siempre.
- **`?copies=N` conserva el nombre** del parámetro (compat con deep-links y e2e)
  pero cambia de significado: ya no es CartItem.qty, son las unidades a diseñar.
  La página lo acota a 1..99 y el editor al máximo del producto (`slotCount ≤ 50`
  del schema Zod → calendario 4 sets, tira de 4 fotos 12 tiras, separadores 25).
- **`?template=<slug>`** (lo genera el TemplatesStrip de la PDP; N-08 2026-09-11):
  la página lo resuelve contra la MISMA lista visible del sidebar
  (`listTemplatesForKind`: activas, `mode=EDITABLE`, kind del producto,
  específicas-o-globales, filtro de aspect) y el draft NUEVO arranca con ESA
  plantilla — `createDraftDesignAction` la recibe y el servidor la re-valida
  (misma regla). Slug inválido → primera plantilla, sin error visible; con
  `?designId=` manda el canvas guardado (SoT). Cambiar de plantilla en el
  sidebar persiste `Design.templateId` vía el auto-save (`saveCanvasAction`
  acepta `templateId` y `saveCanvas` lo valida; si no pasa —p.ej. desactivada
  entre carga y guardado— el canvas se guarda igual y el id queda como estaba).
  El concepto PREMADE está RETIRADO del storefront (0 datos, 0 consumidores;
  decisión de producto 2026-09-11).
- **UI del Estudio**: con N unidades multi-slot el lienzo se divide en SECCIONES
  apiladas (una por unidad, con header "Tira 1 de 2" + chip de progreso) y un
  **pager** de pastillas arriba (salta a cada sección; las secciones quedan TODAS
  montadas → los stages Konva viven en el DOM para los snapshots). Decisión de
  diseño: secciones apiladas y NO un pager que esconda unidades, porque (1) el
  pipeline de snapshots (preview/producción/3D) necesita todos los stages montados,
  (2) dos tiras apiladas con gap 0 se leerían como una sola tira de 6 sin la
  separación de sección, y (3) el calendario ×2 (24 tarjetas) ya maneja scroll con
  lazy-mount. Separadores: su modo agrupado YA era la vista por unidad (tarjetas
  "Separador N" cara A|B) — solo ganó progreso + el atajo por tarjeta.
- **"Aplicar este diseño a todas"**: `store.applyUnitToAllUnits(unitIndex)` copia
  los slots COMPLETOS de la unidad (foto, encuadre, filtro, textos, foto de perfil
  IG) a las demás unidades, conservando el slotIndex de destino (undoable). Vive
  en el header de cada sección (unidades multi-slot), en las tarjetas-unidad de
  separadores y en la ventana de edición del slot para productos de imán suelto
  (unitSlots = 1: el slot ES la unidad).
- **Stepper de fotos del Estudio (packs)**: `setPhotoSlotsPerUnit` distingue dos
  modos — COMPOSICIÓN (tiras: el N son fotos por tira, las unidades se conservan y
  el slotCount se multiplica por ellas) y UNIDADES (polaroid/separadores: el N ES
  el nº de unidades — comportamiento histórico). La unidad solo tiene más slots
  que sus caras en el primer caso.
- **Precio (la ruta del dinero NO confía en el cliente)**: la línea del carrito es
  UNA (qty 1 = el diseño con sus N unidades) y `unitPrice = variante × multiplicador`,
  donde el multiplicador se DERIVA del canvas guardado en el servidor
  (`designUnitPriceMultiplier`: `ceil(slotCount / (photoSlots_raíz × facesPerUnit))`
  para packs, `ceil(slotCount / unitSlots)` para composición fija) y de
  `metadata.unitCount` validado al crear (sets de letras). La variante cubre UNA
  unidad (tira, calendario, set) o el pack declarado (polaroid/separadores → ×1).
  Ojo (fix 2026-09-11): `letterSetUnitCount` exige `surface === "letterset"` —
  el finalize espeja `unitCount` en la metadata de TODO diseño V2 y sin el gate
  el precio multiplicaba dos veces (una tira ×2 llegaba al carrito cobrando ×4;
  lo cazó el E2E `pdp-cantidad-tira`, no los tests unitarios, porque el espejo
  solo lo escribe el finalize). El `unidadesFisicas` del spec de producción usa
  la misma combinación y quedó cubierto por el mismo gate.
  Cualquier tampering del canvas queda económicamente consistente (se paga por
  pieza equivalente; jamás se cobra de menos en un flujo legítimo). El `qty` del
  carrito sigue existiendo como multiplicador de líneas (2 líneas del mismo diseño
  de 2 tiras = 4 tiras).
- **Vista previa modal**: muestra TODAS las unidades (montaje multi-unidad en
  `buildCompositedPreview` — tiras lado a lado, una por pieza; calendarios: las 24
  páginas; separadores: las N tiras desplegadas como siempre). Total = unitario ×
  unidades; la línea "N unidades — cada una con su propio diseño" reemplaza al
  viejo "N copias idénticas". Tiras: copy propio ("2 tiras de 3 fotos" — antes se
  leía "3 imanes", incorrecto). Calendario ×2: "tus 2 calendarios — cada uno con
  12 páginas".
- **Producción (imprenta recibe TODAS las unidades)**: el finalize renderiza/sube
  los `slotCount` PNG de siempre (ahora N × unitSlots) y el spec de producción
  (`production-spec.ts`) describe las unidades: "6 archivos que son SEGMENTOS de 2
  tiras (3 por tira)", "24 archivos que forman 2 calendarios de 12 piezas", "2
  láminas (una por set)". `unidadesFisicas` usa el mismo multiplicador del precio.
  Los tickets de subida de cliente (fallback NEEDS_CLIENT_SLOTS) se acotan a
  `photoSlots × caras × unidades declaradas`.
- **Sets de letras (abecedario/vocales)**: multiplicador de SETS — cada unidad es
  un set con sus propios colores por ficha; tema/idioma/borde quedan a NIVEL DISEÑO
  (compartidos). Pager "Set 1 de N" + "Aplicar este diseño a todas" (clona colores).
  `metadata.units = [{colors}]` + `metadata.unitCount` (validados server-side al
  crear; el precio ×N sale de ahí). Producción: 1 lámina PNG por set. Tope 10 sets.
- **Nombre personalizado**: superficie del agente hermano (name-editor.tsx); su
  modelo multi-unidad llega por ese canal. La modal soporta AMBOS mundos:
  `unitCount` (nuevo, qty 1) y `initialCopies` (legacy, qty = copias).
- **Carrito/checkout**: la línea describe las unidades ("2 tiras de 3 fotos",
  "2 calendarios de 12 páginas", "2 sets de 27 fichas" — `line-preview.ts` con
  `metadata.unitCount` escrito al finalizar). La Vista previa del pedido y la
  confirmación muestran el mismo montaje de todas las unidades.

### Ola 28 (owner 2026-09-11) — validación ronda 4: texto visible donde hace falta

- **IG: los textos por defecto SE VEN** (excepción a Ola 25, SOLO plantilla
  Instagram — el owner revirtió la invisibilidad: "no se ve texto preview, se ve
  vacío"). `renderText` gana `showTemplateDefault` (lo pasa `renderLayer` cuando
  `isIg`): sin override del cliente se dibuja el texto de la plantilla con el
  color por capa de Ola 26 (oscuros sobre tarjeta blanca / claros sobre negra;
  hashtags siempre azules) en TODAS las superficies Konva (grilla, preview de la
  modal, 3D) y queda en el snapshot de producción. Sin riesgo de imprimir
  placeholders: los 4 textos requeridos siguen BLOQUEANDO «Vista previa» hasta
  tener override (Ola 26, intacto) y "362 me gusta" es decorativo (su default se
  imprime, como siempre se vio). Las demás plantillas siguen naciendo vacías.
- **«Editar» con letra casi invisible sobre la tarjeta** (1.2.1.A: blanco sobre
  tarjeta blanca no se veía): el preview de la pestaña Texto pinta el fondo del
  color REAL de la tarjeta (`cardColor` = borderColor del canvas, cableado
  slot-edit-modal → form) y, con contraste casi nulo (`isLowContrastOnCard`,
  ratio WCAG < 1.2 — `lib/contrast.ts`), cambia a la cuadrícula de
  "transparencia" (WHITE_CARD_CHECKER) + aviso CMS
  (`estudio.texto.color-sin-contraste-hint`). Ayuda 100% DOM del editor: el PNG
  imprime el color elegido tal cual.
- **Tiras: el banner del Estudio pasa de "¿Cuántas fotos lleva tu imán?" a
  «Unidades»** (1.3.A): la composición (3/4 fotos por tira) se elige en la PDP y
  no se repite en el lienzo. `StudioUnitCountControl` (nuevo) ajusta
  `unitCount` vía `store.setUnitCount` (redeclara el modelo: slotCount =
  unitSlots × N, slots preservados por índice, grid por unidad recalculado;
  tope = cap de 50 slots vía `maxUnitsForProduct`). La detección usa la MISMA
  regla del store (`unitSlots > facesPerUnit`) → polaroid/separadores conservan
  el stepper de fotos (allí el N de fotos ES el nº de unidades). Textos CMS:
  `estudio.lienzo.unidades-*`.
- **«Sin borde» apaga también el pintado ficha a ficha** (1.7 — nombre +
  abecedario/vocales): sin marco de color no hay nada que pintar → el hint
  "Toca una letra/ficha…" desaparece, las fichas quedan NO seleccionables
  (disabled) y la fila de colores por ficha se oculta. La paleta de temas ya se
  desactivaba (Ola 24/26); esto cierra la superficie.

### Ola 29 (owner 2026-09-11) — validación ronda 5

- **Letra por defecto sobre la tarjeta — REDEFINIDA 2026-09-14** (la regla de
  ronda 5 quedó SUPERSEDED): `defaultTextFillOnCard(cardHex, layerFill)` en
  frame-palette — letra BLANCA **solo con tarjeta NEGRA**; con blanca,
  aguamarina, rosa, lavanda o amarilla la letra sale NEGRA (oscuro de la
  plantilla). Umbral Rec.601 de 0.30 (solo los casi-negros cuentan como tarjeta
  oscura). La regla vieja (0.56) pintaba blanco también sobre rosa y lavanda;
  el owner lo revisó en STG y lo revirtió: el negro contrasta mejor sobre toda
  la paleta pastel. NO confundir con `isDarkColor` (0.5): esa también decide la
  tarjeta BINARIA de Instagram y no se toca. Misma regla en lienzo
  (studio-slot), producción (production-render-canvas) y el editor de texto
  (pestaña Texto): el host arma `textDefaultFills` por capa (en IG con
  `igTextFill`, que sigue mandando por capa) y el form arranca con ese color —
  sin tocar la paleta no se guarda override y preview/lienzo nunca divergen.
  El override de color del cliente siempre manda.
- **Tiras: secciones de unidad en grilla horizontal** (1.3.A mejora visual):
  las secciones de tira ya no se apilan una por fila — van 2-3 por fila con
  wrap (4 unidades → 3+1). Regla: `unitSectionsPerRowFor` (tope 3 desde
  contenedor ≥900px — el Estudio desktop resta la barra lateral; 2 en
  móvil/tableta). Cada sección se dimensiona con SU parte del ancho
  (`sectionAvailableW`) y el tope de zoom considera la fila completa. Solo
  tiras: calendarios (secciones anchas) y separadores (modo agrupado) intactos.
  Pager, lazy-mount y snapshots (todas las secciones montadas) sin cambios.

## Piezas posteriores (2026-07 en adelante) — confirmación con copias, letras, IA, 3D, copy CMS

- **Modal de confirmación** (`studio-preview-modal.tsx`): «Así se verá tu pedido» muestra el
  PNG final (el MISMO que se sube como archivo de producción — la promesa WYSIWYG) y el total
  `unitario × copias`. Desde la regla 2026-09-08b la modal YA NO tiene stepper de copias: las
  copias (CartItem.qty 1–99) las fija la PDP con su stepper "Unidades" en los productos de
  composición fija — y en el híbrido tiras-magneticas-fotos (2026-09-09, owner: allí convive con
  la dimensión de composición "Fotos por tira") — (viajan como `?copies=N` → prop `initialCopies`)
  y se ajustan en el carrito.
  El diseño se crea/finaliza y se agrega al carrito RECIÉN al confirmar; si el cliente vuelve
  a editar no queda nada creado. Lo usan tanto el Estudio principal como los editores de letras.
- **Sets de letras / Abecedario (ADR-057)**: `letter-set-editor.tsx` (Abecedario Completo /
  Pack Vocales) y `name-editor.tsx` (Nombre Personalizado). El TEMA y el IDIOMA se eligen EN
  el Estudio (ya no son variantes de la PDP — si la PDP los traía, se preseleccionan);
  `lib/letter-set-resolve.ts` re-resuelve la variante exacta (tamaño/imantado) para que la
  cotización quede precisa; `use-letter-colors.ts` maneja tema + barajar + color por ficha.
  Sets por defecto es/en con `make seed-letter-sets`.
- **Asistente IA de ideas (ADR-058)**: `studio-ai-panel.tsx` — el cliente cuenta la ocasión y
  recibe color de marca, frase (si el producto lleva texto), composición y un tip. Server:
  `features/ai/actions.ts → suggestDesignAction` (Google Gemini — `gemini-provider.ts`); `sanitizeOccasion`
  (`features/ai/schemas.ts`) remueve PII de la ocasión antes de llamar al LLM. Falla-seguro:
  si el asistente no está disponible, mensaje amable y nada se rompe.
- **Copy 100% administrable (CMS v2, roadmap B1)**: `studio-texts.server.ts` resuelve UNA
  query por prefijo `estudio.*` (cache tag `cms`) e inyecta con `<StudioTextsProvider>`; los
  defaults de `studio-texts.ts` son el copy exacto pre-CMS (regla de oro). Incluye el panel IA
  (`estudio.ia.*`, ej. la nota de privacidad `estudio.ia.nota-privacidad`, 2026-08-29) y los
  nombres audibles (aria-label/alt/sr-only).
- **Vistas 3D «míralo en tu espacio» (ADR-063)**: nevera, tablero magnético, libro
  (separadores), calendario y flat-lays de regalo/repisa — react-three-fiber con entorno
  compartido (`studio-3d-environment.tsx`) y texturas procedurales (`lib/procedural-textures.ts`).
- **Packs de foto: variante resuelta server-side (Lucy 2026-09-05 + 2026-09-08)**: la PDP elige
  "Unidades" (pack size) y "¿Con imán?"; el Estudio persiste `photoSlots`, `sizeCm` y `magnet`
  en la raíz del canvasData V2 (auto-save) y muestra el imán como badge read-only junto al
  stepper de fotos (`studio-photo-count-control.tsx`) — la PDP es la única fuente de verdad.
  Al agregar al carrito SIN variantId, `features/products/photo-pack-resolve.ts` resuelve la
  variante exacta (photoSlots + sizeCm + magnet → una sola) con precio y stock del servidor.

### Ola 17 (Lucy 2026-09-07) — Polaroid Instagram: foto de perfil editable

- **Nueva capa `profile-photo`** (`{ id, type: "profile-photo", x, y, radius }` — x/y =
  CENTRO del círculo): cubre el avatar placeholder horneado del chrome SVG
  (`public/templates/ig_post_3x4.svg` trae `circle cx=34 cy=34 r=16`) con la foto del
  cliente recortada a círculo (clipFunc `ctx.arc`, cover), dejando el anillo de historia
  (r=20, stroke 2.5) visible alrededor. Va INMEDIATAMENTE DESPUÉS del asset "frame" en el
  orden de capas. Sin foto elegida no dibuja nada → placeholder del SVG intacto
  (excepto el hit region interactivo de Ola 22, marcado `edit-indicator` — nunca
  se hornea).
- **La imagen vive en el SlotState, no en la capa**: `slots[i].profileAssetId` /
  `profileAssetUrl` (declaradas en `SlotStateSchema` — sin catchall, Zod stripea lo no
  declarado). POR SLOT: cada imán del pack es un post independiente con su propio usuario.
- **UI**: sección "Foto de perfil" en la pestaña Foto del `StudioSlotEditModal` (solo si la
  plantilla trae la capa) → abre el `StudioAssetPickerModal` en `mode="profile"` (título
  propio, sin diseños prediseñados). Store: `setSlotProfilePhoto(slotIndex, asset|null)`
  (patrón `assignAssetToSlot`; `clearSlot`/`removeAsset` también la sueltan).
- **Clonado (editar desde el carrito)**: `canvas-remap.ts` remapea `profileAssetId` además
  de `assetId` (bug silencioso corregido, test de regresión en `remap-canvas.test.ts`).
- **Producción**: sin cambios — la plantilla ya horneaba PNG del cliente (asset SVG →
  NEEDS_KONVA); el tier server ignora la capa nueva vía el mismo fallback.
- **Geometría congelada** en `features/personalization/instagram-template-spec.ts`
  (`IG_PROFILE_PHOTO_LAYER`) con test (`instagram-template-spec.test.ts`). Seed +
  migración: `packages/db/scripts/ola17-polaroid-instagram-profile-photo.mjs` (dry-run
  default, `--apply`, env-guard). Drafts/cotizaciones viejas no ganan la capa (aceptado).

### Ola 22 (Lucy 2026-09-08) — zoom de lienzo, badge a la barra, avatar tappeable, fuente del calendario

- **Stage más grande + zoom de lienzo (display-only)**: `MAX_VIEWPORT_WIDTH` 1024 → 1280.
  Control −/+%/reset INLINE en la fila de pills superior del editor (junto a «Ideas» /
  «Ver en tu espacio» — 2026-09-09: antes flotaba sobre la esquina del lienzo e "invadía
  el canvas"). El estado crudo vive en `studio-editor.tsx`; el grid lo clampa contra el
  tope por ancho (`stageZoomCap = containerWidth/contentWidth`, acercar hasta 2.5, alejar
  hasta 0.5, pasos de 0.25 — helpers en `studio-canvas-grid-size.ts`) y reporta el estado
  efectivo al pill (`StudioStageZoomControl`, exportado desde `studio-canvas-grid.tsx`).
  Los tamaños zoomados alimentan celdas, slots y placeholders,
  así el slot crece completo (no estira la foto): nada se desborda horizontalmente. Solo
  botones (no wheel/pinch del stage) para no pisar el wheel de zoom de la FOTO en edición.
  Exportación inmune: `pixelRatio` del export ya es relativo al tamaño lógico del stage
  (`studio-editor.tsx`), y previews/3D reescalan con pixelRatio fijo.
- **Identificador SIEMPRE en la barra de acciones**: el badge absoluto top-left del canvas
  (desde M.3.b, el editor multi-slot) se eliminó de `StudioSlot`; el número/identificador va
  como chip dentro de la barra de acciones del slot, renderizado siempre que haya foto —
  sin exclusions. Calendario
  lo muestra como "Ene"/"Feb"… (mes legible, no número), tira como "1", "2"… Nada invade la
  zona imprimible del template. Contrato cubierto por `studio-slot-badge.test.tsx`.
- **Avatar tappeable (Polaroid Instagram)**: el círculo de la capa `profile-photo` es un
  hit region (radio +8px, transparente) que abre el picker de foto de perfil al tocarlo,
  cableado `StudioCanvasGrid → StudioSlot → ProfilePhotoLayerRenderer` vía
  `onRequestChangeProfilePhoto`. Funciona con o sin foto elegida y solo cuando el padre
  cablea el callback. Anillo turquesa punteado permanente + sólido en hover + tooltip Konva
  ("Foto de perfil — toca para cambiarla") como affordance. Cobertura en
  `studio-slot-profile-photo.test.tsx`.
- **Fuente del calendario dentro de "Ajustar Foto"**: el `StudioSlotEditModal` acepta
  `calendarFont` + `onCalendarFontChange` (del store, solo en modo `calendarPreview`) y
  muestra el selector `#cal-font-select` en la pestaña Foto (después de "Cambiar foto").
  El banner del editor sigue existiendo; ambos comparten el mismo estado del store.
  Contrato en `studio-slot-edit-modal.test.tsx`.

## Wireframes ASCII

### Desktop (≥ 1024px)

```
╔═══════════════════════════════════════════════════════════════════════════╗
║ ← Volver | Personalizar: Set 6 Polaroid Grande | ✓ 3/6 fotos | Vista previa ✨ ║
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
│ ←  Personalizar    3/6  |  Vista previa │ ← header sticky
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

> **Reemplazado (2026-05-14, P0.5):** ya no existe `studio-size-modal.tsx`; la comparación de
> tamaño se hace inline con `lib/size-comparator.ts` (el tamaño en cm contra un objeto cotidiano
> colombiano, usado en `magnet-3d.tsx` y la leyenda de `studio-toolbar.tsx`). El wireframe de
> abajo queda como registro del diseño original.

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
4. **SVG mockup**: agregar el archivo en `apps/web/public/templates/<slug>.svg` (claro, más
   `_dark` / `_noborder` si aplica) y referenciarlo como asset/preview de la plantilla
5. **Grid layout**: si requiere layout no-standard, agregar caso en `lib/grid-layout.ts`
6. **Sub-editor opcional**: si el kind requiere UI específica (ej. EVENT_FAVOR con
   campos de texto evento), agregar `studio-sub-editor-<kind>.tsx` y switch en `studio-editor.tsx`

## Telemetry events estandarizados

> **Contrato de diseño — NO implementado.** El módulo `apps/web/lib/estudio-telemetry.ts`
> nunca se construyó y hoy ningún evento `estudio.*` se emite. La tabla queda como spec para
> cuando se retome el embudo de conversión del Estudio.

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
| `estudio.finalize.start`          | `designId, slotCount`                                    | Click "Vista previa"           |
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

Los specs unit/integration viven **colocados junto al código** (`*.test.ts` en este
directorio, `lib/`, `features/personalization/`, etc.) y los E2E en `apps/web/tests/e2e/`
(incluye `axe.spec.ts` / `a11y.spec.ts` con axe-core y `mobile-storefront-audit.spec.ts`).

Comandos (desde la raíz):

```bash
make test-unit        # vitest (unit + integration)
make test-e2e         # playwright (incluye axe a11y)
make test-coverage    # vitest con cobertura
pnpm lhci autorun     # Lighthouse CI (budgets en lighthouserc.json)
```

## Referencias

- **ADR-013**: Estudio de Personalización como diferenciador #1 (concepto)
- **ADR-035**: Arquitectura Estudio v1 — react-konva + 9 kinds + 3 buckets
- **ADR-035 addendum 2026-05-13**: Paradigma slot-por-imán + decisiones M.3.b
- **ADR-037**: Filosofía best practices Estudio v2 — sin atajos pragmáticos
- **Plan completo**: `~/.claude/plans/lee-complemtante-el-proyecto-wiggly-mist.md` § M.3.b
