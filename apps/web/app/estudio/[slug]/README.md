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
  // Rediseño IG (2026-10-05) — modo sin-borde de la Polaroid Instagram como FLAG
  // explícito (foto a lo ancho completo, franjas intactas; owner 2026-10-06: las
  // franjas toman el color de tarjeta elegido — blanco/negro). Ausente =
  // diseño previo al flag → fallback por geometría (isInstagramNoBorder).
  igNoBorder?: boolean;
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

## Recover flow (`?designId=` — «Editar» desde el carrito)

El botón «Editar» de una línea personalizada del carrito enlaza
`/estudio/<slug>?designId=<id>` (sin `?variant=` ni `?copies=`: todo lo restaurable sale
del propio Design). La página resuelve ownership con `getOwnedDesign` (customer logueado
o sessionId anónimo) y cada superficie devuelve al editor lo persistido:

- **Foto (canvas con slots)**: si el diseño está READY (en el carrito) se CLONA a un
  DRAFT vía `cloneDesignForEdit` (el original queda intacto por si el cliente abandona;
  al finalizar `replacesCartDesignId` reemplaza el item en sitio). Se hidratan canvas +
  DesignAssets con signed URLs refrescadas.
- **Nombre (`name`)**: sin clonar — el editor siempre crea un diseño NUEVO al confirmar.
  Se lee `Design.metadata` y se le devuelve TODO: `name` (texto), conteo de fichas
  (largo del nombre), `styleSetId` (null explícito = «Solo letra», manda sobre el
  default del primer estilo), `themeId`, `colors` efectivos por ficha y `withBorder`.
  Los colores se restauran como `activeColors` del snapshot de `useLetterColors`
  (índice a índice, sin depender del barajado aleatorio del tema).
  **Reemplazo en sitio (2026-10-05)**: al venir de `?designId=` con el diseño READY,
  la página propaga `replacesCartDesignId` al editor y este lo manda como
  `replaceDesignId` a `addPersonalizedToCart` → la línea que apuntaba al diseño
  original queda apuntando al NUEVO (misma posición y qty, precio recalculado con
  las letras nuevas), sin línea duplicada. A diferencia de la superficie foto acá
  NO hay clon READY→DRAFT: el editor name nunca reusa el id (crea diseño nuevo sí o
  sí), así que el reemplazo es DE REFERENCIA (la línea cambia de designId) — el
  diseño original queda huérfano en READY, mismo manejo que los huérfanos del
  dedupe por contenido (no se borra).
- **Set de letras (`letterset`)**: mismo criterio (solo lectura de metadata, sin clonar
  - reemplazo en sitio vía `replacesCartDesignId`).
    Se restauran `language`, `styleSetId`, `withBorder`, `unitCount` (nº de sets) y los
    colores por ficha de CADA set (`metadata.units[u].colors`; el set 0 cae al `colors`
    raíz en diseños de un set) como snapshots iniciales del Map multi-unidad.
- **Variante del diseño (`metadata.variantId`, 2026-10-05)**: al crear el diseño desde
  cualquier superficie se persiste la variante (`createDraftDesign` —foto NO-pack—,
  `createNameDesign`, `createLetterSetDesign`; los packs de foto NO la guardan: su
  variante exacta se deriva del canvasData en el carrito). El link «Editar» del
  carrito sigue llevando SOLO `designId`: la página lee `metadata.variantId` del
  diseño recuperado y entra al Estudio con ESA variante (`resolveRecoverVariantId`,
  `lib/recover-variant.ts`) — antes caía a la primera del producto y mostraba el
  precio equivocado en multi-variante. Un `?variant=` explícito siempre manda; un
  variantId archivado o ausente (diseños legacy) cae a la primera variante, como
  siempre. El clon de la superficie foto hereda la metadata → conserva la variante.
- **Ownership tras login**: `mergeAnonCartIntoCustomer` (login/OTP) ADOPTA los diseños
  anónimos referenciados por los items mergeados (`adoptSessionDesigns`: `customerId`
  set, `sessionId` limpio, en la misma transacción del merge). Sin esto, tras loguearse
  el Design seguía con el sessionId anónimo y `getOwnedDesign({customerId})` devolvía
  null → el Estudio abría vacío. El guard del `where` (sessionId exacto + customerId
  null) impide adoptar diseños ajenos aunque un CartItem los referencie.
- **Ownership en recuperación de carrito abandonado (2026-10-05)**: `mergeCartsAdopt`
  (link del email, sesión→sesión) tenía la misma brecha — los items se foldaban al
  carrito recuperado pero los Designs quedaban con el sessionId del carrito source
  (borrado en el mismo fold). Ahora `retargetSessionDesigns` los re-sesiona al target
  en la misma transacción, con el mismo guard (sessionId exacto del origen +
  customerId null); si el cliente se loguea después, el merge de login los adopta
  por la vía de siempre.

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
    ├── recover-variant.ts             # resolveRecoverVariantId: variante del recover
    │                                  #   (?designId=) desde Design.metadata.variantId
    ├── photo-filters.ts               # 5 presets + apply Konva filters
    ├── filter-recache.ts              # Debounce del re-cache de filtros Konva en zoom (Paquete J)
    ├── slot-snapshot-cache.ts         # Cache de snapshots toDataURL por slot + yieldToMain (Paquete J);
    │                                  #   el snapshot sale a 720px fijos (2× celda preview), no al
    │                                  #   tamaño display del stage (fix STG 2026-10-05)
    ├── smart-crop.ts                  # Smart auto-crop (smartcrop.js) de fotos nuevas
    │                                  #   (análisis sobre copia ≤256px — Paquete J) +
    │                                  #   guard anti-carrera vs ajuste manual (2026-10-05)
    ├── texture-resolution.ts          # Ancho de textura 3D por tamaño físico de pieza
    │                                  #   (1024 default / 2048 ≥10 cm — propuesta para
    │                                  #   buildMagnetTextures de studio-editor, hoy 512 fijo)
    ├── upload-guidance.ts             # accept (JPG/PNG/WebP/HEIC) + texto de resolución
    ├── preview-encode.ts              # Codificación WebP/JPEG del preview + presupuesto de
    │                                  #   bytes del body del finalize (fitPreviewToBudget)
    ├── upload-with-retry.ts           # PUTs a signed URLs: concurrencia tope 3, retry con
    │                                  #   backoff y timeout (fix STG 2026-10-05)
    ├── upload-photo-pipeline.ts       # Pipeline UNIFICADO de subida (sidebar + picker modal):
    │                                  #   upscale → compresión → Server Action, concurrencia tope 3,
    │                                  #   resultados en orden de selección (fix STG 2026-10-05)
    ├── size-comparator.ts             # "5×5 cm" vs objeto cotidiano (reemplazó al
    │                                  #   modal "Ver tamaño real")
    ├── calendar-card-preview.ts       # drawCalendarPage en vivo en el slot de calendario
    ├── compose-calendar-page.ts       # Composición de página de calendario (3D/confirmación):
    │                                  #   cache por página (clave de contenido), fotos vía
    │                                  #   optimizador Next en paralelo, páginas WebP (fix STG 2026-10-05)
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
├── photo-fit.ts                       # Matemática ÚNICA cover-scale + clamp [0.5,3] + pinch
│                                      #   (editor/sharp/canvas — antes triplicada inline)
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
  **Paquete J (2026-10-02):** el trabajo pesado corre en un **Web Worker con
  OffscreenCanvas** (`client-photo-upscale.worker.ts` — antes era síncrono en el main
  thread dentro del evento de subir foto: candidato #1 del INP, auditoría §E-4). La
  matemática compartida (plan de re-muestreo + kernel unsharp) vive en
  `client-photo-upscale-core.ts` (pura, testeada); sin Worker/OffscreenCanvas se cae al
  pipeline inline con resultado idéntico.
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
  (ambas Polaroids y el resto de productos con marcos). _(El modo «Sin borde» de la
  Instagram se REDEFINIÓ dos veces: rediseño 2026-10-05 — ancho completo con franjas,
  flag `igNoBorder` explícito y tarjeta forzada a blanco al entrar; owner 2026-10-06 —
  la tarjeta YA NO se fuerza y la paleta queda ACTIVA en el modo: el color pinta las
  franjas. Ver el fix de esa fecha más abajo.)_ Con «Sin borde» la paleta de
  color queda DESACTIVADA (visible pero inerte: `aria-disabled` + atenuada + aviso CMS
  `estudio.texto.estilo-color-deshabilitado-hint`) en la Polaroid Clásica — la foto
  cubre toda la tarjeta y el color no aplica — y en las TIRAS photobooth (aviso propio
  `estudio.texto.estilo-color-deshabilitado-hint-tira`): sin borde ya no hay canaletas
  entre fotos, así que `borderColor` no pinta nada. El estado NO se resetea (al volver
  a «Con borde» el color sigue, y en la tira vuelve a pintar las canaletas). Cuadrados
  NO se desactivan: su franja uniforme usa `borderColor` aun sin borde.
- **Zoom de foto "milimétrico"**: la rueda del mouse avanza ×1.04 por notch (antes
  ×1.15 — saltos toscos). La función `nextWheelScale` (studio-slot) la comparten el
  handler Konva, el listener nativo del slot y el preview del modal; el pinch sigue
  siendo continuo (ratio de distancia). El chip de % del slot refleja el valor exacto.
  **Paquete B (2026-10-02)**: en la GRILLA el zoom con rueda exige modificador
  explícito (ctrl/cmd+wheel — estándar de editores; el pinch del trackpad llega como
  wheel con ctrlKey); la rueda SOLA sobre el canvas scrollea la página (antes la
  foto se zooomeaba y la página quedaba atrapada). En el preview del modal de
  edición la rueda sola sigue zooomeando (es el "modo edición").

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
  el contador "362 me gusta" queda decorativo. _(REDEFINIDO por el rediseño
  2026-10-05: «me gusta» también es REQUERIDO — 5 capas obligatorias, lista
  decorativa vacía.)_ Con la tarjeta que nace VACÍA (Ola 25),
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
  **REDEFINIDA (Fase 1B, owner 2026-09-29):** el apagado solo aplica con tema
  ILUSTRADO (`styleId !== null`). Con tema «Solo letra» el color pinta el
  relleno de la letra (`fillText`), así que la paleta, la selección por ficha
  y la fila de colores permanecen ACTIVAS aunque sea «Sin borde»
  (`colorsEnabled = withBorder || styleId === null`).

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
  _(Umbrales REDEFINIDOS por Ola 34: móvil <640px 1 por fila full-width; la 3ª
  columna solo con contenedor ≥1400px — secciones ~×1.5 más anchas.)_

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

- **Stage más grande + zoom de lienzo (display-only)**: `MAX_VIEWPORT_WIDTH` 1024 → 1280
  (2026-09-18: 1280 → 1600, ver «Canvas fluido» más abajo).
  Control −/+%/reset INLINE en la fila de pills superior del editor (junto a «Ideas» /
  «Ver en tu espacio» — 2026-09-09: antes flotaba sobre la esquina del lienzo e "invadía
  el canvas"). El estado crudo vive en `studio-editor.tsx`; el grid lo clampa contra el
  tope (Ola 33: fijo en `STAGE_ZOOM_MAX` 2.5 con scroll-x interno en el wrapper — antes
  `containerWidth/contentWidth`, que el dimensionado por ancho de Ola 31 dejaba en 1;
  alejar hasta 0.5, pasos de 0.25 — helpers en `studio-canvas-grid-size.ts`) y reporta
  el estado efectivo al pill (`StudioStageZoomControl`, exportado desde
  `studio-canvas-grid.tsx`).
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

### Ola 31 (owner 2026-09-18) — canvas fluido, tarjeta-unidad universal, cero overflow horizontal

- **Contexto**: el owner validó UX y fijó como referencia POSITIVA el estudio de
  separadores (canvas al ancho de pantalla, cada unidad en tarjeta `bg-white/70`) y
  como NEGATIVA fotoimanes/modo plano (canvas angosto centrado, sin tarjeta). La
  auditoría responsive (`tmp/responsive-audit`) detectó overflow horizontal real en
  polaroid @768/@1024, cuadrados @1024 y calendario @1024/@1280.
- **Decisión**: (1) el marco de 82vh solo aplica a productos de UNA fila — los grids
  multi-fila se dimensionan por ANCHO (cap por slots) y la página scrollea vertical;
  (2) los pisos de slot NUNCA desbordan el contenedor: si `minSize*cols + gaps` no
  cabe, se reducen columnas (`fitColsToFloor`); (3) `MAX_VIEWPORT_WIDTH` 1280 → 1600;
  (4) tarjeta-unidad SIEMPRE en packs (`slotCount >= unitGroupSlots`; con 1 pack, sin
  rótulo "Pack 1" ni pager) y TAMBIÉN en modo plano; (5) `min-w-0` en la `<section>`
  del editor — la causa raíz del overflow ≥1024 era un loop de medición: la sección
  (flex item con min-width:auto) se estiraba con el contenido y el ResizeObserver
  fijaba el ancho YA estirado (el aside se encogía de 288 a ~153px).
- **Contratos**: `studio-canvas-grid-size.test.ts` (marco multi-fila + guarda de piso)
  y `studio-canvas-grid.test.tsx` (1 pack con tarjeta sin rótulo/pager; plano con
  tarjeta). Auditoría: 70/70 capturas sin overflow ni errores (antes 5 con overflow).

### Ola 32 (owner 2026-09-18) — editores de letras al lienzo fluido + chrome móvil compacto

- **Contexto**: continuación de Ola 31 — los estudios de "Juegos y Aprendizaje"
  (Nombre Personalizado, Abecedario, Pack Vocales) seguían en una columna fija
  `max-w-3xl` (aire lateral en desktop) y con su propio chrome (back-link +
  header centrado), mientras el estudio de foto ya tenía la plantilla
  adaptativa de referencia. En móvil (375px) el estudio de foto apilaba ~700px
  de chrome antes del lienzo (stepper + hint, toolbar de estilo con labels
  partidos en 3 líneas, pills envueltos).
- **Decisión**: (1) header sticky UNIFICADO para los editores simples
  (`studio-simple-header.tsx` — idioma del StudioToolbar sin el store zustand:
  pill «Salir», avatar+nombre, total en vivo + CTA «Ver diseño» —misma acción
  del botón grande del panel; QA ronda 2 (owner 2026-10-07): TODOS los CTAs de
  finalizar comparten el rótulo «Ver diseño», revirtiendo la diferenciación
  «Vista previa»/«Ver diseño» de QA 1.6—); (2) layout
  a dos columnas en lg (controles en tarjeta lateral `lg:w-80`, lienzo fluido en
  la tarjeta-unidad `bg-white/70`) y lienzo PRIMERO en móvil _(REDEFINIDO
  2026-10-05: en móvil los CONTROLES van primero — ver el fix de esa fecha más
  abajo)_; contenedor fluido
  con cap `STUDIO_MAX_WIDTH=1600` (`studio-layout.ts` — el canvas-grid conserva
  su propia constante inline por estar congelado); (3) fichas del Nombre
  FLUIDAS (ResizeObserver + callback-ref, tope 120px = ficha de producción,
  piso 44px táctil) y grilla del set de letras con columnas progresivas
  (4/6/8/10/12/13); (4) el estado de color por set del letter-set se separó del
  markup: `LetterSetUnitPanel` → `LetterSetUnitState` (render-prop) porque el
  picker de tema va con los controles y la grilla ES el lienzo, pero el
  `useLetterColors` debe ser UNO por set; (5) chrome móvil del estudio foto:
  toolbar de estilo en una sola línea con scroll horizontal (labels
  `whitespace-nowrap`), fila de pills `flex-nowrap overflow-x-auto` en <sm,
  hint del stepper de packs oculto en <sm — el lienzo (tarjeta del pack) ya
  inicia visible en el primer viewport de 375×812.
- **Contratos**: mismos tests de vista previa (los selectores «Ver diseño»
  resuelven 2 botones — header + panel, mismo rótulo y misma acción: los specs
  pulsan el del panel); e2e `estudio-letterset` (orden borde → colores intacto: ambos en
  la columna de controles). Auditoría: 70/70 capturas sin overflow ni errores.

### Ola 33 (owner 2026-09-18) — zoom de lienzo restaurado (tope fijo + scroll-x interno), sondas e2e B4, grilla de letras centrada

- **Contexto**: Ola 31 dimensionó los grids por ANCHO (llenan el contenedor a
  zoom 1) → el tope de acercar por ancho (`containerWidth/contentWidth`)
  quedó en 1 y el "+" del zoom de lienzo (feature de Ola 22 pedida por el
  owner para ver detalles finos) no hacía nada.
- **Decisión**: (1) `computeStageZoomCap()` devuelve SIEMPRE `STAGE_ZOOM_MAX`
  (2.5) — cuando el contenido zoomado excede el ancho del marco, el WRAPPER
  INTERNO del grid scrollea horizontal (`overflow-x-auto` solo si hay overflow
  real, `needsStageHScroll`; a zoom ≤100% queda en `visible` y no clipea
  anillos/sombras). La PÁGINA jamás desborda: el gate
  `scrollWidth === clientWidth` sigue 0/70. Alejar (piso 0.5) intacto; el "+"
  del pill solo se deshabilita al llegar al 250% real (el UI no miente).
  (2) Sondas e2e de píxeles (`estudio-studio-ux.spec.ts`) actualizadas a dos
  reglas de render VIGENTES que las habían quedado obsoletas (no eran
  regresiones de render): B4 (2026-09-15) dibuja los textos por defecto como
  GUÍA atenuada al 40% (`PLACEHOLDER_GUIDE_OPACITY`) → los matchers de tinta
  plena se relajaron (light >90, blue con dominio de b >8); y la letra por
  defecto sale BLANCA solo sobre tarjeta casi-negra (regla owner 2026-09-14,
  `defaultTextFillOnCard`) → el test de la Clásica ahora exige oscuro sobre
  rosa y blanco sobre negro (antes pedía blanco sobre rosa, la regla vieja).
  (3) LetterSetEditor: la grilla de fichas pasa de `grid` a flex centrado con
  anchos idénticos por breakpoint — con pocas fichas (pack-vocales, 5) quedaba
  pegada a la izquierda de la tarjeta-lienzo.
- **Contratos**: `studio-canvas-grid-size.test.ts` (tope fijo MAX, pasos,
  pisos); e2e `estudio-studio-ux` (zoom 100→125→75→100 con canvas que
  crece/encoge) y `estudio-letterset` verdes; auditoría responsive 0/70.

### Ola 34 (owner 2026-09-18) — spec de tamaños v2: slots grandes tipo Magnéticos, móvil 1 col, título móvil, letras sin apretar

- **Contexto**: el owner validó los estudios midiendo con el ZOOM del estudio:
  "el 100% debería verse como se ve al 150% en web / al 125% en móvil (cuadrados
  móvil: al 250%)". En píxeles: slots objetivo ~430-470px en desktop para
  productos de pocos slots; en móvil el pack a UNA columna full-width (el 250%
  de cuadrados ≈ 343px = el ancho útil de un teléfono de 390px — la regla de 2
  columnas a 380-639 quedó rechazada explícitamente). Único "Ok" previo: el
  Calendario (INTOCABLE). Referencia correcta: el estudio de Magnéticos
  (tarjeta-unidad grande por unidad física). Editores de letras: "web mal
  distribuido; móvil mejor pero muy apretado". Y en móvil no se veía QUÉ
  producto se estaba trabajando.
- **Decisión**: (1) columnas por ANCHO OBJETIVO de slot en vez de breakpoints
  fijos (`resolveMaxCols`: cols = clamp(floor(containerW/objetivo), 1, preset),
  objetivo 450px ≤6 slots / 300px ≥7 slots, piso 2 cols desde 640px;
  `fitColsToFloor` intacto — el piso de tap nunca desborda); (2) móvil
  (<640px) SIEMPRE 1 columna full-width en todos los estudios foto
  (BP_NARROW eliminado de las reglas); (3) caps por conteo subidos
  (few 640/600/600, medium 700/660/600, many 640/600/560) para que no anulen
  el objetivo (polaroid 2×460×1.28 → alto 588 > cap viejo 560); (4) marco en
  alto de UNA fila FIJO en móvil (`MOBILE_FRAME_HEIGHT=640`): el alto del
  viewport móvil cambia al ocultarse la barra del navegador al scrollear y el
  tamaño del slot no debe moverse. **Paquete B (2026-10-02)** — el mismo bug
  ("el canvas respira" al scrollear) se reprodujo TAMBIÉN en tablet
  (Separadores 4×4.2cm, marco de 82vh aún vivo entre 640-1024px): el alto del
  viewport medido por el grid ahora queda ESTABILIZADO en puntero coarse —
  `shouldRemeasureViewportH` solo re-mide cuando cambia el ANCHO (rotación
  real), nunca con el show/hide de la barra (cambio solo de alto). En puntero
  fino (desktop) todo resize re-mide como antes; (5) separadores (modo agrupado): las filas
  del marco se cuentan en UNIDADES físicas, no en slots — las caras heredan el
  cap completo y crecen ~×1.25 donde el ancho lo permite; (6) tiras: móvil 1
  sección full-width por fila; la 3ª columna solo con contenedor ≥1400px
  (secciones ≥ ~440px ≈ ×1.5 vs los ~280px de Ola 29); (7) título del producto
  visible en móvil en AMBOS headers: en `StudioToolbar` dentro de la fila móvil
  de progreso (cero altura extra) y en `StudioSimpleHeader` en una fila fina
  propia (py-1) — la tarjeta del canvas sigue iniciando dentro del primer
  viewport de 375×812; (8) editores de letras: grilla del set 3/4/5/7/8 cols
  (antes 4/6/8/10/12/13) con tope 128px y gaps sm 16px — ficha móvil ~65→93px,
  desktop ya no se encoge a ~44px a 1024; lienzo con aire vertical
  (min-h 280/360 + contenido centrado); fichas del nombre con tope 144px
  (antes 120) y lienzo min-h 220/320.
- **Contratos**: `studio-canvas-grid-size.test.ts` reescrito al nuevo contrato
  (1 col móvil, ancho objetivo 450/300 con piso 2, marco móvil fijo, caps
  subidos, secciones de tira 1/2/3); `studio-canvas-grid.test.tsx` intacto.
  Sonda de píxeles (`tmp/responsive-audit/probe-slot-px.mjs`): polaroid/cuadrados
  @1280 ~450px (antes ~293), @375 1 col ~327px; tira @1280 ~640px (antes 429);
  separadores conserva el patrón Magnéticos con caras ~×1.25. Auditoría: 0/70.

### Rediseño Polaroid Instagram (owner 2026-10-05) — sin-borde con franjas, campos asistidos, «Aplicar» arriba

Validado por el owner en STG; tres cambios de producto sobre la plantilla IG:

- **«Sin borde» REDEFINIDO: foto A LO ANCHO COMPLETO con franjas blancas intactas.**
  Antes el modo sin-borde ponía la foto a sangre TOTAL (x=0 y=0 450×600, chrome
  encima). Ahora la foto solo pierde los bordes LATERALES (x=0, ancho = stage,
  conserva y/alto de la ventana base 58→450): las franjas blancas superior
  (header: usuario/ubicación) e inferior (iconos + likes/título/hashtags) se
  conservan, como un post real de Instagram. El chrome SVG `_noborder` NO cambió:
  solo dibuja cabecera (y<58) e iconos (y 468–496) → no se solapa con la nueva
  ventana. Detalles:
  - **FLAG EXPLÍCITO `canvasData.igNoBorder`** (schema Zod + types): el toggle
    «Borde de foto» de la toolbar lo persiste junto al rect
    (`setImagePlaceholderRect(rect, { igNoBorder })`) — antes el modo se infería
    comparando el rect del placeholder contra el stage 450×600 con redondeo
    (frágil). `isInstagramNoBorder(rect, stage, explicit?)` resuelve: flag si
    está presente; si no, fallback por geometría que reconoce AMBOS modos
    (sangre total legacy Y ancho-completo nuevo) → los consumidores que no
    conocen el flag (grilla Konva, preview del modal, production-render-canvas)
    siguen acertando sin cambios, y los diseños creados antes del flag cargan
    intactos. `applyTemplate` limpia el flag (la plantilla nueva trae su rect).
  - **Franjas con color de tarjeta elegible (REDEFINIDO owner 2026-10-06).** Al
    entrar a «Sin borde» la toolbar forzaba la tarjeta blanca y dejaba la paleta
    inerte (excepción deliberada a la regla Ola 24 de "el color no se resetea":
    un negro residual teñiría las franjas). El owner revirtió la excepción: la
    paleta blanco/negro queda HABILITADA en el modo y el color elegido pinta las
    franjas — la maquinaria de contraste ya existente cubre el modo sin cableado
    extra (fondo binario `instagramBackgroundHex`, textos por capa `igTextFill`,
    chrome `ig_post_3x4_dark_noborder.svg` vía `noBorderChromeSrc(src, true,
dark)`), y producción/preview/3D heredan la misma geometría del canvasData
    (WYSIWYG: IG hornea el PNG del cliente). El hint del modo pasó de "paleta
    desactivada" a informativo (`estilo-color-sin-borde-hint-ig`: "el color pinta
    las franjas de arriba y abajo de la foto"). Clásica y tiras conservan el
    apagado de Ola 24 intacto. Contrato en `studio-style-toolbar.test.tsx`.
    _(Texto original de la excepción, SUPERSEDED: "Franjas SIEMPRE blancas: al
    entrar a «Sin borde» la toolbar fuerza la tarjeta blanca… La paleta sigue
    desactivada en el modo, con hint propio (`estilo-color-deshabilitado-hint-ig`).")_
  - `photoBackingHexFor`: sin respaldo lateral en el modo (igNoBorder → null),
    como antes; las franjas viven fuera de la ventana → intactas. IG sigue
    horneando el PNG del cliente (chrome SVG → NEEDS_KONVA), así que producción
    hereda la geometría del canvasData (WYSIWYG); el fallback NEEDS_CLIENT_SLOTS
    no se toca.
- **Campos "Datos de la publicación" ASISTIDOS** (`studio-ig-post-fields.tsx` +
  helpers puros testeados en `lib/ig-post-fields.ts`): el override guarda el
  texto EXACTO del post (se imprime verbatim) y la UI muestra los fijos como
  adornos fuera del valor editable:
  - **@usuario**: "@" prefijada SIEMPRE visible (adorno fijo; el override se
    guarda CON "@"). Sanitización en vivo: sin espacios, solo letras/números/
    punto/guion bajo (caracteres válidos de usuario IG), tope 30.
  - **Ubicación**: datalist nativo (sin dependencias) con lista curada
    "Ciudad, País" (ciudades de Colombia + destinos frecuentes) — asistencia de
    escritura, no validación: la ubicación libre también vale.
  - **«Me gusta» pasa a OBLIGATORIO** (`IG_REQUIRED_TEXT_LAYER_IDS` gana
    `likes_count`; la lista decorativa queda vacía — el guard
    `igMissingRequiredTextLayerIds` lee el spec, sin tocar studio-editor):
    input solo numérico mostrado con separador de miles es-CO, y la palabra
    "me gusta" es sufijo FIJO fuera del input (el override guarda
    "1.234 me gusta"). NOTA: el mapa de etiquetas del popover de «Vista previa»
    en studio-editor.tsx usa fallback al id crudo para `likes_count` hasta que
    se agregue la línea `likes_count: texts.texto.campoIgLikes` (la clave CMS
    `estudio.texto.campo-ig-likes` ya existe).
  - **Título (caption)**: contador de caracteres `n/140` (límite decidido: el
    footer es una línea a 16px sobre 450px de stage — 140 caracteres ≈ 2 líneas
    reales de post sin riesgo de desborde impreso) y placeholder con ejemplo.
  - **Hashtags**: NO texto libre — UI de chips para agregar (Enter/coma/espacio)
    y quitar (× o Backspace con el draft vacío), MÁXIMO 3 tags con aviso claro
    (`role="alert"`), "#" siempre prefijada y sin espacios dentro de cada tag.
  - Mensajes de validación en español tuteo (claves CMS `estudio.texto.ig-*`).
- **«Aplicar» a la parte SUPERIOR del editor de texto** (owner: dos primarios
  confusos — el «Aplicar» abajo junto a «Restablecer» competía con el «Listo»
  del footer del modal): `StudioTextEditorForm` muestra «Aplicar» arriba
  (visible sin scroll), «Restablecer» queda abajo como acción secundaria y el
  «Listo» del `StudioSlotEditModal` baja a estilo outline (cierra el modal; el
  primario de la edición es «Aplicar»). La pestaña Foto no tenía botón
  «Aplicar» (aplica en vivo) → sin cambios allí.

### Fase 1A (owner 2026-09-27) — sustantivo real de la pieza, popover «qué falta», calendario SIN IMÁN abre su visor

- **`resolveSlotNoun(productKind, magnet, texts)`** (`lib/slot-noun.ts`, puro y
  testeado): fuente única del sustantivo de la pieza. Usa el productKind REAL
  (calendar→"tarjetas", bookmarks→"separadores", strips→"fotos" — el chip cuenta
  la composición —, tiles→"fichas") y una variante SIN IMÁN (`magnet === false`)
  NUNCA dice "imán" (cae a "ficha"). Bug corregido: el chip del toolbar le decía
  "12 imanes" al Calendario Set 12 Tarjetas aun en la variante sin imán. El
  editor lo cablea al chip del toolbar (par `{ one, many }`), al sustantivo de
  los slots/onboarding (singular) y a la modal de confirmación (productKind
  "tiles" cuando `magnet === false`). Los chips "📐" de sidebar/slot solo
  muestran tamaño (sin sustantivo) — verificados intactos.
- **Popover «qué falta» de «Vista previa»** (radix Popover, mismo paquete del
  Dialog): cuando el botón está bloqueado lista EXPLÍCITAMENTE las fotos por
  cargar con la label de cada slot ("Ene", "1A"…) y los textos IG faltantes por
  unidad (`igMissingRequiredTextLayersPerSlot` + etiquetas CMS `campo-ig-*`).
  Hover (desktop), tap/click (móvil), foco + Enter/Espacio (teclado), Esc
  cierra; trigger con nombre audible propio. Mismo patrón en el FAB móvil.
  Selector atómico nuevo en el store: `selectMissingSlotIndexesKey` (string
  primitivo, patrón `selectFilledSlotCount`; con backOptional solo caras A).
  Textos CMS: `estudio.lienzo.finalize-popover-*`. El tooltip nativo queda como
  fallback. Contrato en `studio-toolbar.test.tsx`.
- **Calendario SIN IMÁN abre «Ver mi calendario»**: el mount de la galería ya
  no se gatea entero por `hide3DView` cuando el kind es "calendar" — el visor
  detalle tarjeta-a-tarjeta (`CalendarCardFocus`) es válido sin imán. El gate se
  mueve ADENTRO: `SceneGallery` recibe `magnet` y con `magnet === false` la
  lista de escenas queda vacía (`galleryScenes`, puro y testeado) — nevera/
  tablero asumen imán y no se ofrecen — y el botón «Míralo en tu espacio» del
  visor se omite (`onOpenGallery` opcional).

### Fix (owner 2026-10-05) — prediseñados anclados a Cara A + controles del set de letras arriba en móvil

- **Prediseñados respetan la paridad Cara A/B en TODAS las vías** (clic del
  sidebar y drag & drop al lienzo — el picker modal ya lo hacía). El bug:
  `applyPredesignedToSlot` mandaba la A al slot destino y la B a `destino+1`
  siempre; si el destino era una cara B (slot impar — p.ej. el primer slot
  vacío cuando la A de su par ya tiene diseño), la A caía en una cara B y la B
  cruzaba a la cara A de la unidad SIGUIENTE. Ahora `resolveFaceAAnchor`
  (en `lib/apply-predesigned.ts`, con `facesPerUnit = 2`) fija el ancla:
  destino par → ese slot; destino impar → la A de SU par si está libre (la B
  del diseño cae exactamente donde apuntó el cliente); si la A del par está
  ocupada → el siguiente par con la A libre, buscando hacia adelante y
  retomando desde el inicio; sin ninguna cara A libre → la aplicación FALLA
  antes de subir el asset (nunca se pisa contenido para abrir sitio; owner
  2026-10-06: con razón `no-free-slot` y toast informativo propio — ver el fix
  de esa fecha más abajo). Un prediseñado SIN cara B también ancla en cara A. La regla de
  Paquete A se mantiene: una cara B ocupada nunca se pisa (`bBlocked` → toast
  CMS). `facesPerUnit` se pasa desde los dos call sites (sidebar y grid).
  Tests de la matriz de anclas en `lib/apply-predesigned.test.ts`.
- **"Juegos y Aprendizaje" (sets de letras) — en móvil los CONTROLES van
  ARRIBA del lienzo** (Tema → Idioma → Borde → Colores primero; el lienzo con
  la grilla de fichas queda debajo). Solo se invierten las clases `order-*`
  del `flex flex-col lg:flex-row` de `letter-set-editor.tsx`: `<lg` aside
  `order-1` / lienzo `order-2`; en `lg` nada cambia (controles a la izquierda
  `lg:w-80`, lienzo fluido a la derecha). La grilla de fichas y sus anchos por
  breakpoint (Ola 33/34) no se tocan; el CTA sticky del `StudioSimpleHeader`
  sigue visible. Contrato de orden en `letter-set-editor-preview.test.tsx`.

### Fixes STG (2026-10-05) — picker "procesando" eterno + confirmar robusto en Vercel

- **Modal "Mis fotos" ya no se queda "procesando" para siempre.** El
  `StudioAssetPickerModal` vive SIEMPRE montado (el editor solo lo oculta con
  `isOpen`) y el estado `assigningId` (spinner sobre la miniatura + resto
  deshabilitado) jamás se reseteaba: al abrir el picker para un segundo slot
  TODAS las fotos quedaban deshabilitadas. Ahora un `useEffect` sobre `isOpen`
  limpia `assigningId`/`applyingId` y cancela el timer de feedback de 450 ms
  al cerrar (que además se limpia solo al disparar y en unmount). Regresión en
  `studio-asset-picker-modal.test.tsx` (cerrar y reabrir para OTRO slot con
  las miniaturas habilitadas).
- **El preview viaja con presupuesto de bytes** (`lib/preview-encode.ts →
fitPreviewToBudget`): Vercel corta el body de una Function en ~4.5 MB y
  `serverActions.bodySizeLimit: "50mb"` NO lo levanta (solo configura el
  parser de Next). Un montaje multi-unidad grande moría en un 413 que el
  cliente veía como "NetworkError when attempting to fetch resource". Si el
  preview supera `PREVIEW_UPLOAD_BUDGET_BYTES` (3.5 MB) se re-codifica EN EL
  CLIENTE antes de armar el FormData (calidad decreciente y luego downscale,
  misma escalera que `compressPreviewImage` del server); el camino común pasa
  tal cual. El server conserva su re-compresión 3–8 MB como red de seguridad.
- **Las subidas a signed URLs son concurrentes y resilientes**
  (`lib/upload-with-retry.ts`): los PUTs del fallback `NEEDS_CLIENT_SLOTS`
  eran secuenciales, sin retry ni timeout, y el catch mostraba el error crudo
  del navegador. Ahora suben con concurrencia tope 3, retry con backoff
  exponencial (2 reintentos, solo errores de red y 5xx — un 4xx de firma
  vencida es definitivo) y timeout de 30 s por intento. Cualquier fallo (y los
  `TypeError` de red del finalize en general) se traduce al texto CMS
  `estudio.exportar.error-subida-archivos` ("No pudimos subir tus archivos.
  Revisa tu conexión e inténtalo de nuevo."), nunca el mensaje crudo del
  motor. Tests en `lib/upload-with-retry.test.ts` (concurrencia, retry, 4xx
  definitivo, timeout por AbortController) y `lib/preview-encode.test.ts`
  (tamaño de dataURL + escalera de re-codificación).
- **`export const maxDuration = 60` en la página del Estudio**: el finalize
  renderiza los PNG de imprenta server-side (sharp/canvas, hasta 24 páginas de
  calendario) y las Server Actions heredan el `maxDuration` de la página donde
  se invocan (mismo patrón que `/checkout/pago`).

### Fixes STG (2026-10-05) — subida de fotos unificada y confirmación de calendario con cache

Hallazgos STG: "subir fotos en Mis Fotos es demorado" y "confirmar Vista Previa
de calendario / varios separadores demora mucho". Tres frentes:

- **Pipeline de subida UNIFICADO (`lib/upload-photo-pipeline.ts`)**. El picker
  modal (tap-on-slot) subía el archivo CRUDO (fotos de iPhone de 5-8 MB) por la
  Server Action, sin el upscale local ni la compresión cliente que el sidebar
  ya aplicaba → más lento por foto y candidato al 413 de Vercel (~4.5 MB por
  request). Ahora AMBOS caminos (sidebar "Mis fotos" y picker) corren la misma
  secuencia por archivo: `upscalePhotoForPrint` (Web Worker) →
  `compressImageForUpload` (WebP 2400px q0.85 sobre ~2 MB) →
  `uploadDesignAssetAction`. Multi-archivo: hasta 3 archivos en vuelo
  (`mapWithConcurrency` de `upload-with-retry`; antes ambos loops eran
  estrictamente secuenciales) y los resultados se publican EN EL ORDEN EN QUE
  SE ELIGIERON, no en orden de finalización (flush por prefijo contiguo) — el
  orden de "Mis fotos" define qué foto cae en qué slot con «Llenar slots»,
  así que debe ser determinista. El worker del upscale NO es singleton (cada
  llamada crea y termina el suyo): correr hasta 3 en paralelo es seguro, sin
  pool. Un archivo que falla no frena a los demás; la clasificación
  too-big/network/server (`isTooBigUploadError`, pura) se comparte y ambos
  caminos muestran los mismos mensajes. La Server Action se INYECTA al pipeline
  (`upload`) para no importar código de servidor y testear con fakes. Tests en
  `lib/upload-photo-pipeline.test.ts` (orden con uploads fuera de orden, tope
  de concurrencia real, aislamiento de fallos, 413 → too-big).
- **Cache de páginas del calendario (`lib/compose-calendar-page.ts`)**. Era el
  path más pesado sin cache: CADA apertura de la Vista previa o del 3D
  recomponía las 12+ páginas en un loop secuencial — foto full-res del bucket
  directo, dibujo 810×1080 y `toDataURL` PNG — y el montaje decodificaba los 12
  PNG y se re-codificaba (3 pasadas encode/decode, todo main thread). Ahora:
  (a) cache por página con clave de contenido (`calendarPageCacheKey`: foto,
  encuadre, mes, año, layout, fuente del título — por VALOR porque el
  photoTransform se reconstruye en cada llamada; tope 48 con refresco LRU), de
  modo que re-abrir la Vista previa o abrir el 3D reutiliza las páginas
  intactas y solo recompone las que cambiaron; (b) las fotos se cargan a 1200px
  vía el optimizador de Next (`loadCanvasImage`, el patrón del Abecedario)
  — ~5-10× menos bytes por decodificar que el original — con fallback a la URL
  directa; (c) las cargas van en paralelo (tope 4) y solo el dibujo queda en
  main thread, en orden estable; (d) las páginas se codifican WebP q0.9 en vez
  de PNG (los consumidores — montaje con `<img>` y texturas 3D con
  TextureLoader — decodifican WebP en todos los browsers del soporte; la página
  es OPACA, sin riesgo de alfa; si el navegador no codifica WebP, toDataURL
  devuelve PNG en silencio y también vale). El montaje de confirmación además
  sale ya en el MIME efectivo (`canvasToPreviewDataUrl`) → el
  `reencodePreviewDataUrl` del editor queda como no-op y se elimina una pasada
  encode/decode. Tests en `lib/compose-calendar-page.test.ts` (misma entrada →
  misma clave/referencia, invalidación al cambiar transform/foto/mes/año/
  layout/fuente, desalojo FIFO + LRU).
- **Snapshots a tamaño de celda (`lib/slot-snapshot-cache.ts`)**.
  `snapshotSlotForPreview` rasterizaba a `pixelRatio: 1` al tamaño DISPLAY del
  stage (hasta ~1500px con zoom de lienzo 2.5×) para que TODOS los consumidores
  lo redujeran de inmediato (celdas de 360px del preview compositado, caras de
  300px de separadores, texturas de 512px del 3D). Ahora el snapshot se toma a
  un tamaño objetivo fijo (`SNAPSHOT_TARGET_WIDTH` = 720px = 2× la celda de
  360 → nitidez retina; cubre la cara de 300 a ~2.4× y la textura de 512 a
  ~1.4×, sin upscale en ningún consumidor), con pixelRatio topado a 2
  (`snapshotRasterPlan`, puro). UN solo tamaño para todos los consumidores
  mantiene el cache compartido entre Vista previa / 3D / galería (si cada uno
  pidiera el suyo se invalidarían entre sí). Consecuencia buscada y testeada:
  cambiar el ZOOM del lienzo ya NO invalida el cache — la salida es idéntica.
  La clave guarda el tamaño DE SALIDA (outW/outH) en vez del tamaño del stage.
  Tests actualizados en `lib/slot-snapshot-cache.test.ts`.

### Concordancia visual del pipeline (2026-10-05) — plantilla → canvas → 3D → preview → carrito → imprenta

- **Carrera smart-crop vs ajuste manual (fix — "la edición difiere del lienzo", separador 2×6).**
  `analyzeSmartCrop` corre async al cargar la foto y el chequeo `if (photoTransform) return`
  ocurría al INICIAR el efecto: si el cliente ajustaba el encuadre antes de que el análisis
  resolviera, el smart-crop le PISABA el ajuste. Ahora un ref espejo (`photoTransformRef`) se
  relee AL RESOLVER la promesa y el resultado se descarta si ya hay transform — el ajuste
  manual siempre manda (guard puro `shouldApplySmartCropResult` en `lib/smart-crop.ts`,
  testeado en `smart-crop.test.ts`).
- **Sensibilidad de pinch UNIFICADA (grilla = preview del modal).** El preview amplificaba
  ×1.7 y la grilla interactiva era lineal ×1: el mismo gesto daba zoom distinto en cada lado.
  La curva vive en `features/personalization/photo-fit.ts` (`PINCH_SENSITIVITY = 1.7`,
  `pinchAdjustedRatio`) y la consumen ambas superficies.
- **Matemática cover + clamp [0.5,3] en fuente ÚNICA (`photo-fit.ts`).** La regla estaba
  triplicada inline en `studio-slot.tsx`, `production-render.ts` y `production-render-canvas.ts`
  — cualquier divergencia rompía el WYSIWYG. Las tres superficies importan
  `clampPhotoScale` / `coverScaleBase`; la concordancia es por construcción y los valores
  exactos quedan fijados en `photo-fit.test.ts`.
- **Iluminación 3D calibrada (la cara impresa se veía MÁS CLARA que la foto).** Causa:
  sobre-iluminación PBR — irradiancia difusa frontal >1 por suma de luces directas + IBL del
  env-map procedural con `envMapIntensity` 1.0–1.15 en la cara impresa. Valores elegidos
  (irradiancia difusa frontal ≈ 1.0 por escena, IBL de la cara solo micro-relieve especular):
  - `magnet-3d.tsx` cara A: `envMapIntensity` 1.15 → **0.4**; cara B impresa: 1.0 → **0.4**.
    Bordes/imán/escena conservan su look (0.9/0.7).
  - `polaroid-3d-view.tsx` cara impresa: 1.05 → **0.4**; key 1.15 → **0.7**, hemi 0.3 → 0.22
    (≈ 1.07 total; antes ≈ 1.5).
  - `fridge-3d-view.tsx` key 1.15 → **0.85**, fill 0.3 → 0.25 (≈ 0.96; antes ≈ 1.16).
  - `book-view-3d.tsx` key 1.05 → **0.7** (≈ 1.10; la contraluz 0.55 de la cara B NO se toca).
  - `room-board-view-3d.tsx` key 1.0 → **0.7**, ambient 0.24 → 0.2 (≈ 1.07; antes ≈ 1.33).
  - `calendar-card-focus.tsx` key 1.05 → **0.75**, hemi 0.34 → 0.28 (≈ 1.07; antes ≈ 1.31).
    Las texturas siguen en SRGBColorSpace (correcto, no se tocó). **Validación manual pendiente
    (no se pudo correr navegador)**: comparar en STG la cara impresa del 3D contra el canvas 2D
    con la MISMA foto — deben leerse con el mismo brillo percibido; si queda oscura, subir el
    key de la escena ±0.1 antes de tocar el `envMapIntensity`.
- **Zoom 3D en móvil (minDistance por visor, objetivo: la pieza ≥50% del alto).** Cuenta
  (fracción del alto ≈ h/(2·d·tan(fov/2)), d = distancia cámara↔pieza):
  - Nevera (fov 40°, 0.049 u/cm): 7 → **2.6**. Las piezas están sobre la cara frontal
    (z≈1.85 u) → de frente la pieza queda a ~0.75 u: fotoimán 6.5 cm ≈ 59% del alto (a 7 era
    ~6%). Piso físico: fuera del nevecón + manijas en todo ángulo polar.
  - Tablero (fov 42°, 0.1 u/cm): 7 → **1.7** (6.5 cm ≈ 53%).
  - Libro doblado (fov 40°, 0.3 u/cm): 5 → **3.0** (cara 2×6 ≈ 42% — el 50% exacto exigiría
    mover el target a la pieza, fuera de alcance; el libro plano baja 3.5 → **2.8**).
  - Polaroid (fov 42°, 0.25 u/cm): 4 → **3.0** (tarjeta 6.5 cm ≈ 56%).
  - Calendario detalle: se conserva **3.5** (la tarjeta ~5.4 u ya desborda el alto a esa
    distancia).
- **dpr táctil 1.5 → 2** en los 5 Canvas (book/fridge/polaroid/room-board/calendar-focus):
  el zoom cercano necesitaba la nitidez retina. Trade-off documentado inline: ×1.78 más
  píxeles/frame en GPU móvil, mitigado por escenas estáticas con sombra horneada (y
  `frameloop="demand"` en el calendario). **Validar en dispositivo real de gama baja.**
- **Texturas 3D por tamaño físico (PROPUESTA pendiente de integración).** El zoom cercano
  también delató el 512 px fijo de `buildMagnetTextures` (studio-editor.tsx ~2625-2688, no
  editable por este cambio). Helper listo en `lib/texture-resolution.ts`:
  `magnetTextureWidth({ sizeCm })` → **1024** px por defecto, **2048** px si el lado mayor
  ≥ 10 cm (tiras, alargados, calendario). Integración propuesta: usarlo donde hoy va el 512
  fijo. Tests en `texture-resolution.test.ts`.
- **Glossy del preview recalibrado al acabado real (ver "Acabado glossy" abajo).**
- **Miniatura de carrito/checkout sin recorte.** El preview del diseño (mosaico de piezas)
  ya no se pinta `object-cover` cuadrado (se comía los bordes del diseño): `object-contain`
  con padding sobre fondo neutro claro en `/carrito` (96px) y en el order-summary del
  checkout (48px). Fotos de catálogo siguen en `cover`. Sin tocar el pipeline de generación
  del preview ni el lightbox (`design-preview-dialog.tsx`).

### Fixes STG (owner 2026-10-06) — modal de calidad en portal, toast sin-lienzo-libre, color en IG sin borde

- **El `PhotoQualityModal` se veía DETRÁS de la grilla del lienzo (stacking).** El
  modal (backdrop + tarjeta, `fixed z-50`) se renderizaba INLINE dentro del
  `StudioSlot`, atrapado en el stacking context de la celda del grid (un
  `motion.div` con `transform` de la animación de entrada crea contexto propio):
  el z-50 pasaba a ser relativo a esa celda y las tarjetas del canvas (p.ej. la
  grilla del calendario) se pintaban ENCIMA del modal y del backdrop. Fix:
  homologar con los Radix Dialog del estudio — el modal y su backdrop ahora se
  renderizan en PORTAL a `document.body` (`createPortal`), conservando z-50 (sigue
  por encima del picker z-40, que es quien lo abre desde "Mis fotos"). Aplica a
  los 3 call sites (chip del slot, sidebar, picker modal) de una vez. Los demás
  modales/overlays del estudio (onboarding, panel IA, galería 3D, picker, preview,
  overlays 3D) se montan en la raíz del editor, sin ancestros con transform —
  verificados sin el problema.
- **Toast correcto cuando no hay lienzo libre para un prediseñado.** Con todos los
  lienzos ocupados (p.ej. separadores con todas las caras A con diseño), aplicar un
  prediseñado fallaba con el toast genérico "No pudimos aplicar el diseño. Intenta
  de nuevo." — no es un error, es la decisión deliberada de nunca pisar contenido.
  `applyPredesignedToSlot` ahora devuelve `reason: "no-free-slot" | "error"` y los
  dos call sites (clic del sidebar y drag & drop al lienzo) muestran el texto CMS
  nuevo `estudio.plantillas.toast-sin-lienzo-libre`: "Todos los lienzos ya tienen
  un diseño. Si quieres cambiar uno, bórralo primero." Tests extendidos en
  `lib/apply-predesigned.test.ts` (razón no-free-slot sin subir asset; razón error
  con el mensaje del servidor).
- **Polaroid IG SIN BORDE con «Color de tarjeta» habilitado** (redefine la
  excepción blanca del rediseño 2026-10-05 — ver su sección arriba): la toolbar ya
  no fuerza el blanco al entrar al modo ni desactiva la paleta; el color
  (blanco/negro, la paleta binaria de IG) pinta las franjas con contraste
  automático de textos y chrome oscuro. Clásica y tiras conservan su apagado.

### Fase 2 (owner 2026-10-07) — SIN IMÁN sin escenas que afirman imán + grosor/pose reales en 3D

- **Reversa del gate de Paquete D (2.10):** con la variante SIN IMÁN
  (`magnet === false`) las escenas que AFIRMAN imán — nevera, mural de corcho y
  tablero memo (`MAGNET_SCENES` en `scene-gallery.tsx`) — ya NO se ofrecen en
  NINGÚN kind (Paquete D las había reabierto para photo/letters: "el 3D es
  ilustrativo"; el owner lo revirtió: adherir piezas sin imán es una afirmación
  falsa del producto físico). La escena Polaroid se MANTIENE (tarjetas acostadas
  en una mesa — no asume adherencia) y las 2D (repisa/regalo) y el libro
  tampoco asumen imán. Si ninguna escena sobrevive (calendario, letters) la
  galería muestra un estado vacío coherente (textos CMS nuevos
  `estudio.escenas.vacio` / `vacio-hint`); en el calendario el flujo sigue
  viviendo en el visor de detalle y su botón «Míralo en tu espacio» se omite,
  como desde Fase 1A. Contrato en `scene-gallery.test.ts`.
- **Pill de las escenas planas 2D eliminada (2.6):** el hint "Mantén presionada
  la imagen para guardarla o compartirla 💛" (`estudio.escenas.hint-plana`)
  salió del render, del tipo/default/mapa de `studio-texts.ts` y del
  `cms-site-map.mjs`. La pill de gestos solo se muestra en escenas 3D.
- **Grosor físico real en nevera/mural (2.11):** `MAGNET_DEPTH`/`TILE_DEPTH` de
  `magnet-3d.tsx` ya no son constantes de mundo (0.04 u ≈ 0.8–1.1 cm en nevera):
  se derivan del `uPerCm` de cada escena a un grosor real de fotoimán (~2 mm)
  con un mínimo de mundo anti-z-fighting — ver `magnet-3d.tsx` y sus tests.
- **Separadores largos ACOSTADOS sobre el libro (2.12):** las piezas planas
  (Alargados, `noFold`) dejan de renderizarse DE PIE (Ola 18) y van echadas
  sobre la hoja (`flatBookmarkPlacement` + rotación −90° X, como anticipaba el
  comentario de Ola 17) con encuadre de cámara ajustado — tamaño real intacto,
  solo pose + cámara (`book-view-3d.tsx`, `lib/book-geometry.ts`).
  - **Revisada 2026-10-07:** la pose se compone con GRUPOS ANIDADOS (yaw →
    acostar → volteo opcional); la Euler colapsada `[−π/2, yaw, 0]` aplicaba el
    yaw como ROLL sobre el eje largo y basculaba la cara impresa. Verificado en
    tests: la cara A mira EXACTA a +Y (`flatFrontNormalWorld`).
  - **Toggle "Ver respaldo / Ver frente" (owner 2026-10-07):** botón overlay en
    la vista del libro (`aria-pressed`) que voltea todas las piezas 180° sobre
    su eje largo (`FACE_FLIP_ROTATION`) mostrando la cara B — en BLANCO si está
    vacía. Vale para doblados y planos; estado local del modal (cara A al abrir).
    Textos provisionales en `lib/book-geometry.ts` (`BOOK_FACE_TOGGLE_LABEL`),
    pendientes de migrar a studio-texts/CMS.

## DPI y sangrado (estado real 2026-10-05)

- **Sin cambio de escala todavía** — requiere decisión con imprenta (ver abajo). Esta sección
  solo documenta el estado real para que esa conversación tenga los números encima de la mesa.
- **`PRODUCTION_SCALE = 3` fijo** (`features/personalization/production-render.ts`): el PNG
  de imprenta sale al ancho lógico del stage × 3 (1080 → 3240 px), igual en móvil y desktop
  (H5: el pixelRatio del snapshot va relativo al tamaño LÓGICO del stage, no al display).
- **`dpiProduction: 300` es una ETIQUETA** del `stage` del canvasData, no un remuestreo real:
  el DPI efectivo sale de (ancho del stage × 3 px) / (cm físicos / 2.54) y varía por plantilla
  (los stages no son todos 1080 px: hay celdas 390×400, caras 600×200 / 400×420, etc.). El
  rango efectivo medido del catálogo es ≈ **686–762 DPI** — sobra contra los 300 del estándar;
  el cuello de botella es la resolución de la FOTO del cliente, no el lienzo (de ahí el
  quality-check `checkPhotoQuality` a 118 px/cm y el upscale local).
- **Sin bleed (sangrado)** desde 2026-05-15: la guía bleed del overlay se eliminó (la silueta
  del producto YA es el borde de impresión) y producción renderiza al borde exacto del stage,
  salvo el **full-bleed de marcos** (`frame-palette.ts`: con `borderColor` la tarjeta entera se
  pinta del color y la foto va inserta con franja mínima 4% del lado menor — no es sangrado de
  corte, es la estética del marco). La única guía vigente del overlay es la **safe-area 8%**
  (~3 mm interior al borde) para texto.
- **Decisión pendiente con imprenta**: ¿el archivo final necesita sangrado real de corte
  (p.ej. 2–3 mm por lado → stage ×3 + margen con borde extendido/mirror) o la imprenta
  troquela al ras del PNG actual? Y si exigen exactamente 300 DPI al tamaño físico, habría que
  cambiar `PRODUCTION_SCALE` por producto (hoy es fija en 3) — hoy el archivo llega con MÁS
  resolución de la pedida, que la imprenta remuestrea.

## Acabado glossy (preview vs impresión)

- Producción **NO hornea glossy**: los adornos `name="realism"` (sombra, glossy, edge stroke)
  se ocultan durante el snapshot de imprenta (studio-editor.tsx — el archivo de producción es
  la tarjeta limpia). El glossy del overlay es una APROXIMACIÓN en pantalla del laminado PET
  (brillo especular leve en luz directa), no una simulación física.
- **2026-10-05 — intensidad recalibrada**: el gradient llegaba a 22% de blanco y el preview se
  veía más lavado que la pieza impresa. Constantes en `studio-realism-overlay.tsx`:
  `GLOSSY_HIGHLIGHT_OPACITY = 0.10` (pico), `GLOSSY_MID_OPACITY = 0.02`,
  `GLOSSY_SHADE_OPACITY = 0.02`. Si Lucy compara contra la pieza física y quiere más/menos
  brillo, se ajustan esas tres constantes (nunca volver a horneado en producción).

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
- **Paquete J (2026-10-02, INP — auditoría §E-4):** upscale/unsharp de fotos en
  Web Worker + OffscreenCanvas (`client-photo-upscale.worker.ts`, fallback inline
  idéntico); snapshots `toDataURL` de preview/3D cacheados por slot con
  invalidación por referencia (`lib/slot-snapshot-cache.ts`) + yields al event
  loop + decodificación en paralelo; re-cache de filtros Konva debounceado al
  finalizar el gesto de zoom (`lib/filter-recache.ts`); smartcrop sobre copia
  ≤256px (`lib/smart-crop.ts`). Harness de medición LoAF: `tmp/inp-audit/`.
  Cierre del ciclo: tabla "INP por elemento" en /admin/performance.
- **Fix 2026-10-08 (bug STG — separador plano "en blanco" en el libro 3D):** el
  snapshot podía caer en la ventana "foto subida pero `useImage` aún decodificando"
  y hornear el placeholder `#F4ECFF` en la textura (y el cache lo conservaba: la
  decodificación NO cambia la referencia del slot). Ahora el `KonvaImage` de la
  foto lleva `name="slot-photo"` (studio-slot.tsx), `buildMagnetTextures` espera
  esos nodos antes de rasterizar (`waitForSlotPhotosReady`, deadline 4 s
  best-effort) y el cache marca las entradas tomadas a medio cargar
  (`photoPending`) para re-rasterizarlas en cuanto la foto aparece.

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
