# Estudio de Personalización — Guía de Ingeniería (`app/estudio/[slug]/`)

> **Diferenciador #1 de Lucams Shop** (`ADR-013`, `ADR-035`, `ADR-037`).
> Referencia técnica exhaustiva de componentes cliente, geometría 2D/3D, estado Zustand, flujos de
> recuperación, validaciones de calidad y presupuesto de rendimiento dentro de
> `apps/web/app/estudio/[slug]/` y `apps/web/features/personalization/`.
> Para el modelo Prisma completo, las políticas RLS, la cola asíncrona de imprenta `RenderJob`, el
> empaquetado ZIP de taller y la retención Ley 1581, consulta
> [`docs/domains/studio-and-production.md`](../../../../../docs/domains/studio-and-production.md).

---

## 1. Filosofía de Diseño y Principios No Negociables

El Estudio es la superficie más sensible de **Lucams Shop**: el cliente diseña en vivo la pieza
física exacta que recibirá en su casa. Si el encuadre miente, si la cantidad de fotos no coincide
con la variante, si una plantilla oculta zonas imprimibles o si la experiencia móvil se traba, se
pierde la conversión o se generan reclamos por discrepancia frente al producto entregado.

Toda modificación en el Estudio se rige por estos **7 principios no negociables**:

1. **Cero atajos pragmáticos (`ADR-037`)**: cada flujo implementa la solución productiva completa
   (paridad geométrica WYSIWYG entre Konva, visor 3D y render 300 DPI de imprenta), sin parches
   provisionales ni estados silenciosos.
2. **Cero costos SaaS adicionales**: motor propio sobre `react-konva` + `@react-three/fiber` +
   `@napi-rs/canvas` + `sharp`, sin editores comerciales de pago por asiento o por exportación.
3. **Accesibilidad WCAG 2.1 AA**: navegación completa por teclado, roles y etiquetas ARIA en cada
   slot, anuncios `aria-live="polite"`, foco visible, objetivos táctiles `>= 44×44 px` y respeto
   estricto de `prefers-reduced-motion`.
4. **Presupuesto estricto de rendimiento**: Lighthouse Desktop `>= 95` y Mobile `>= 90`. Konva y
   Three.js se cargan bajo demanda con `next/dynamic(..., { ssr: false })` según la superficie del
   producto (los productos sin personalización o de fichas de letras jamás descargan Konva).
5. **Pruebas y cobertura gateadas en CI**: tests unitarios e integración colocados junto al código
   con umbrales obligatorios en `apps/web/vitest.config.ts` (`lines: 71`, `statements: 69.5`,
   `functions: 68.5`, `branches: 62`), suites E2E en Playwright, auditoría `axe-core` y Lighthouse CI.
6. **Plantillas y microcopy como código de primera clase**: los cromos vectoriales viven en
   `apps/web/public/templates/` (variantes claras, `_dark.svg` y `_noborder.svg`), y el 100 % del
   microcopy funcional de interfaz, ayudas y accesibilidad vive tipado en `studio-texts.ts`
   (`DEFAULT_STUDIO_TEXTS`, Capa 3 del CMS v2, `ADR-187`), sin consultas a base de datos.
7. **Telemetría de embudo respetuosa de privacidad (`[ANA-01]`, `ADR-193`)**: emisión dual hacia el
   agregador diario propio sin cookies ni PII (`POST /api/funnel` → `FunnelEventDaily`) y hacia GA4
   únicamente bajo consentimiento explícito `COOKIES_ANALYTICS`.

### Paradigma técnico: `slot-por-imán` (pieza física individual)

Para un producto multipieza como un pack de **6 Fotoimanes Polaroid**:

- El cliente elige **una plantilla unitaria** (por ejemplo, «Polaroid Clásica» o «Polaroid
  Instagram») que define la estructura de capas de **una pieza individual**.
- El Estudio despliega los **6 slots en una grilla fluida**: la misma `unitTemplate` aplicada `N`
  veces, donde cada slot mantiene su propia foto, encuadre, rotación, filtro, textos y avatar.
- El cliente sube sus fotos (arrastrar y soltar, toque sobre el slot o auto-fill inteligente) y
  ajusta cada pieza por separado.
- Al finalizar:
  - **Vista previa**: se genera **1 mosaico limpio** (`clean.webp`) + páginas individuales por
    unidad (`pages/00.webp`, `pages/01.webp`…) en el bucket privado `design-previews` para mostrar
    en el modal de confirmación, carrito, cotización, orden y portal de seguimiento.
  - **Producción**: el pipeline genera **`N` archivos PNG independientes a 300 DPI** en el bucket
    privado `design-outputs` (uno por cada pieza física que entra a impresión y troquelado).

**Diferencia frente al antipatrón «1 lienzo gigante con N ventanas»**:

- Un set de 6 fotoimanes no es una sola lámina rígida con 6 huecos: el taller imprime y troquela 6
  piezas separadas que el cliente reparte libremente en su nevera, tablero o libro.
- Modelar cada pieza como un `SlotState` independiente permite reescalar tamaños de pack, combinar
  caras A/B en separadores, paginar calendarios de 12 meses y re-renderizar cada pieza a su escala
  exacta de producción sin recortar un mosaico.

---

## 2. Modelo de Datos `canvasData` V2 y Validación Zod

El estado persistido en `Design.canvasData` utiliza la versión discriminada `version: 2`
(`MultiSlotCanvasData`), definida para el cliente en `apps/web/app/estudio/[slug]/types.ts` y
validada autoritativamente en el servidor mediante `apps/web/features/personalization/schemas.ts`.

### Esquema TypeScript completo (`MultiSlotCanvasData` + `CanvasDataV1`)

```ts
export type PersonalizationKind =
  | "PHOTO_PACK"
  | "PHOTO_GRID"
  | "CALENDAR_PHOTO_MONTH"
  | "CALENDAR_PHOTO_HERO"
  | "EVENT_FAVOR"
  | "BUSINESS_LOGO"
  | "CUSTOM_DECOR"
  | "TEXT_ONLY";

export type CalendarFontKey =
  | "fredoka"
  | "inter"
  | "caveat"
  | "baloo-2"
  | "nunito"
  | "patrick-hand"
  | "playfair-display"
  | "dancing-script";

export type PhotoFilterPreset = "vintage" | "vivid" | "bw" | "pastel" | "polaroid";

export type TextOverride = {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string;
};

export type SlotState = {
  slotIndex: number; // 0 .. slotCount - 1
  assetId: string | null;
  assetUrl: string | null; // Signed URL del master en customer-uploads (TTL 1 h)
  canvasUrl?: string | null; // Signed URL del derivado WebP <= 800 px para lienzo/preview (ADR-166)
  // Avatar circular por slot en Polaroid Instagram:
  profileAssetId?: string | null;
  profileAssetUrl?: string;
  profileCanvasUrl?: string;
  profileTransform?: { offsetX: number; offsetY: number; scale: number };
  // Encuadre interactivo unificado (Konva + @napi-rs/canvas + sharp):
  photoTransform?: {
    offsetX: number; // Desplazamiento X en coordenadas lógicas del stage
    offsetY: number; // Desplazamiento Y en coordenadas lógicas del stage
    scale: number; // Factor sobre cover base [0.5, 3] (default inicial 1.15; >= 1 en noFold)
    rotation?: number; // Pasos de 90° (-180..180)
  };
  filter?: PhotoFilterPreset | null;
  textOverrides?: Record<string, TextOverride>; // Indexado por TextLayer.id
  // Campos legacy preservados por retrocompatibilidad de lectura:
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
  brightness?: number; // -100 a +100
  contrast?: number; // -100 a +100
  saturation?: number; // -100 a +100
  rotation?: number;
  textOverride?: string;
};

export type MultiSlotCanvasData = {
  version: 2;
  unitTemplate: CanvasDataV1; // Plantilla unitaria V1 (stage lógico + layers)
  slotCount: number; // 1..50 (= unitCount * unitSlots)
  slots: SlotState[]; // Longitud exacta === slotCount
  gridLayout: { cols: number; rows: number; gap: number };
  borderColor?: string | null; // Hex #RRGGBB del marco full-bleed; null = sin marco
  borderWidthFactor?: number; // Multiplicador [0.25, 3] sobre el margen base (default 1, ADR-173)
  photoSlots?: number; // Tamaño de pack elegido en packs de fotoimanes
  sizeCm?: string; // Dimensión física nominal (ej. "6.5×8", "5×15")
  magnet?: boolean; // Con imán (true) o variante gemela sin imán (false, -NOMAG)
  calendarFont?: CalendarFontKey; // Tipografía del encabezado mensual en calendarios
  unitCount?: number; // Unidades físicas diseñables (solo cuando unitSlots > 1)
  unitSlots?: number; // Slots por unidad física (12 calendario, 3/4 tira, 2 separador)
  igNoBorder?: boolean; // Flag explícito del modo ancho completo en Polaroid Instagram
  clientRev?: number; // Reloj monotónico del cliente para reconciliar snapshots locales (ADR-133)
};
```

### Capas soportadas en `unitTemplate` (`CanvasDataV1`)

Cada plantilla unitaria declara un `stage` lógico (`{ width, height, dpiPreview, dpiProduction }`,
con cotas `1..5000 px`) y un arreglo ordenado `layers` (máximo 100 capas) compuesto por:

| Tipo (`layer.type`) | Propósito y reglas de renderizado                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `background`        | Relleno sólido base (`color` hex) detrás de toda la pieza y respaldo de huecos en zoom-out (`photoBackingHexFor`). |
| `frame-card`        | Tarjeta coloreada a sangre (`fill` fallback `#FFFFFF`, `cornerRadius` opcional) gobernada por `borderColor`.       |
| `image-placeholder` | Ventana de recorte de la foto principal del slot (`x, y, width, height, cornerRadius, rotation`).                  |
| `asset`             | Cromo vectorial o PNG interno (`src` restringido por Zod a rutas locales `/templates/<slug>.svg` o `.png`).        |
| `profile-photo`     | Recorte circular de foto de perfil (`x, y` centro + `radius`) situado inmediatamente encima del `asset` Instagram. |
| `shape`             | Primitiva geométrica decorativa (`kind: "rect" \| "circle" \| "heart"`, relleno, trazo y radio).                   |
| `text`              | Capa tipográfica (`editable?: boolean`, `fontFamily`, `fontSize`, `fill`, `fontWeight`, `align`).                  |

### Configuración por producto (`Product.personalizationSchema`) y cotas Zod

`PhotoProductConfig` + `BorderWidthConfig` gobiernan las capacidades del Estudio por producto sin
ramificaciones rígidas por SKU:

```json
{
  "photoSlots": 6,
  "aspectRatio": "3:4",
  "sizeCm": "6.5×8",
  "shape": "rectangle",
  "finish": "glossy",
  "cornerRadiusPx": 24,
  "frameOptions": ["blanco", "negro"],
  "allowText": true,
  "facesPerUnit": 1,
  "noFold": false,
  "backOptional": false,
  "borderWidth": {
    "enabled": true,
    "min": 0.5,
    "max": 2.0,
    "default": 1.0
  }
}
```

Cotas e invariantes que `features/personalization/schemas.ts` impone en cada Server Action y Route
Handler:

- **Peso máximo del JSON `canvasData`**: `MAX_CANVAS_DATA_BYTES = 1_048_576` (`1 MB` UTF-8) para
  impedir inyección de payloads gigantes en `JsonB`.
- **Consistencia estructural (`superRefine`)**: `slotCount` entero en `1..50`, `slots.length ===
slotCount` y, cuando se informan `unitCount` y `unitSlots`, cumplimiento exacto de
  `slotCount === unitCount * unitSlots`.
- **Presupuestos de binarios**: `DRAFT_PREVIEW_MAX_CHARS = 900_000` (~660 KB decodificados para la
  miniatura ligera del borrador), `PREVIEW_MAX_BYTES = 8 MB` en servidor (con presupuesto cliente
  `PREVIEW_UPLOAD_BUDGET_BYTES = 3.5 MB` en `lib/preview-encode.ts`) y
  `PRODUCTION_MAX_BYTES = 20 MB` por archivo de salida.

### Migración idempotente `V1 → V2` (`lib/canvas-migrate.ts`)

Los diseños históricos guardados con `canvasData.version === 1` se migran en memoria de forma
transparente al abrirse mediante `migrateCanvasV1ToV2(data, photoSlots)`:

1. El objeto `CanvasDataV1` original pasa íntegro a `unitTemplate` (limpiando `assetId`/`assetUrl`
   incrustados en el layer para no duplicar estado).
2. Se localiza el primer layer `type === "image-placeholder"` (típicamente `id: "p1"`) y se extraen
   sus referencias `assetId` y `assetUrl`.
3. `slotCount` se inicializa desde `product.personalizationSchema.photoSlots` (acotado a `>= 1`).
4. `slots[0]` recibe el `assetId`/`assetUrl` extraído y `slots[1 .. slotCount - 1]` se crean vacíos.
5. `gridLayout` se calcula automáticamente mediante `generateGridLayout(slotCount, unitTemplate.stage)`.

La función es **100 % idempotente**: invocarla con un objeto `version: 2` devuelve el mismo objeto
sin mutarlo.

---

## 3. Flujos de Recuperación, Auto-Guardado Serial y Ciclo de Vida de Borradores

### 3.1 Flujo de recuperación `?designId=<id>` («Editar» desde carrito o cuenta)

El enlace «Editar» de una línea personalizada en `/carrito` apunta a `/estudio/<slug>?designId=<id>`
(sin necesitar `?variant=` ni `?copies=`, porque toda la configuración viaja en el `Design`).
`page.tsx` verifica propiedad con `getOwnedDesign` (aislamiento estricto anti-IDOR por `customerId`
autenticado o cookie `HttpOnly` `cart_session`) y restaura el estado según la superficie:

- **Superficie Foto (`photo`, lienzo con slots)**:
  - Si el diseño está en estado `READY` (ya agregado al carrito), `cloneDesignForEdit` crea un clon
    en estado `DRAFT` para que el diseño original del carrito permanezca intacto si el cliente
    abandona la pestaña. Al confirmar el nuevo diseño, `replacesCartDesignId` sustituye el ítem del
    carrito en la misma posición.
  - **Rehidratación de URLs firmadas (`lib/remap-canvas-assets.ts`)**: como las URLs firmadas de
    `customer-uploads` expiran a 1 hora y Konva lee `slot.canvasUrl ?? slot.assetUrl`, el arranque
    reescribe cada slot por `assetId` y `profileAssetId` con URLs recién firmadas antes de
    `store.init`. Si un `DesignAsset` ya no existe en el servidor, el slot queda limpio en estado
    vacío y el editor muestra el aviso `texts.errores.assetsFaltantes` en vez de colgar un
    placeholder roto.
  - La plantilla activa se restaura priorizando `Design.templateId` persistido en base de datos y
    usando `findTemplateIdForCanvas` únicamente como respaldo geométrico para diseños antiguos.
- **Superficie Nombre (`name`, `name-editor.tsx`)**:
  - No clona filas `READY → DRAFT`: lee `Design.metadata` (`name`, `styleSetId` respetando `null`
    explícito para «Solo letra», `themeId`, arreglo `colors` índice a índice en `useLetterColors` y
    `withBorder`).
  - Al confirmar se crea un `Design` nuevo y `replacesCartDesignId` (`replaceDesignId` en
    `addPersonalizedToCart`) actualiza la referencia de la línea existente del carrito conservando
    su posición y recalculando el precio según el nuevo conteo de fichas.
- **Superficie Set de Letras (`letterset`, `letter-set-editor.tsx`)**:
  - Misma estrategia de lectura sin clon previo y reemplazo de referencia en sitio vía
    `replacesCartDesignId`.
  - Restaura `language`, `unitCount` y la configuración **independiente por set** desde
    `metadata.units[u].{colors, styleSetId, withBorder}` (con fallback a las claves raíz en diseños
    de un solo set). Al finalizar sube una lámina `production_i` por set como respaldo inmediato
    mientras el `RenderJob` genera en servidor **un PNG 300 DPI individual por ficha** (`ADR-188`).
- **Restauración exacta de variante (`lib/recover-variant.ts`)**:
  - Todas las superficies persisten `metadata.variantId` al crear el diseño y en cada auto-save
    (incluyendo packs de foto vía `packVariantIdFor`, validado contra las variantes activas del
    producto en `saveCanvas`).
  - `resolveRecoverVariantId` selecciona esa variante al abrir `?designId=<id>` (un `?variant=`
    explícito en la URL siempre tiene prioridad; si la variante fue archivada cae a la primera
    activa). El cálculo de cobro en servidor sigue derivándose del contenido real del diseño y nunca
    confía ciegamente en `metadata.variantId`.
- **Continuidad de propiedad en login y recuperación de carrito**:
  - Al iniciar sesión (`mergeAnonCartIntoCustomer`), `adoptSessionDesigns` y
    `adoptAnonDraftDesigns` transfieren los diseños anónimos (`sessionId` exacto y
    `customerId: null`) al `customerId` dentro de la misma transacción.
  - Al abrir un enlace de carrito abandonado (`mergeCartsAdopt`), `retargetSessionDesigns` migra los
    diseños de la sesión origen a la sesión destino bajo la misma guarda anti-IDOR.

### 3.2 Creación perezosa (`ensureDesignId`), auto-guardado serial y `clientRev`

- **Borrador perezoso (`store.ensureDesignId`)**: entrar a `/estudio/<slug>` sin `?designId=` **no**
  inserta filas vacías en `Design`. El registro `DRAFT` se crea únicamente tras el primer cambio
  real del usuario o cuando su primera acción es aplicar un diseño prediseñado de galería (con
  deduplicación de la promesa en vuelo para que un doble clic o un auto-save concurrente jamás creen
  dos borradores).
- **Cola serial determinista (`lib/serial-task-queue.ts`)**: las mutaciones del lienzo activan un
  debounce de `2 s` y se despachan a través de `createSerialTaskQueue()`, garantizando ejecución
  estrictamente FIFO sin carreras en red lenta. Antes de abrir la vista previa de confirmación,
  `handleFinalize` ejecuta `flushSaves()`, y mientras `autoSaveStatus.kind === "saving"` el botón
  «Ver diseño» permanece bloqueado con indicador visible tanto en desktop como en móvil (`<sm`).
- **Concurrencia optimista monotónica (`Design.clientRev` y `STALE_REVISION`)**: cada guardado
  incrementa un contador monotónico `clientRev` (`BigInt` en PostgreSQL). Si una pestaña antigua
  intenta sobrescribir un diseño que ya avanzó en otra pestaña, `saveCanvas` rechaza la escritura
  con código `STALE_REVISION` (`HTTP 409` en `POST /api/designs/save-canvas`) y el cliente detiene
  el bucle de auto-guardado para no pisar el trabajo más reciente.
- **Respaldo de cierre de pestaña (`sendBeacon` + snapshot local `ADR-133`)**: al dispararse
  `visibilitychange` (`hidden`) o `pagehide`, el editor envía el último payload sucio mediante
  `navigator.sendBeacon("/api/designs/save-canvas", blob)` y guarda en paralelo un snapshot local en
  `localStorage` (`lucams_studio_canvas_<designId>`, TTL `7 días`). Al reabrir el borrador,
  `shouldUseCanvasSnapshot` compara `clientRev` del servidor frente al local y restaura la copia
  local si el beacon de salida no alcanzó a completarse.

### 3.3 Retomador de borradores (`[STU-02]`), enlaces `/d/[token]` y poda automática

- **Retomador para clientes autenticados e invitados con sesión (`lib/draft-marker.ts`)**:
  - `page.tsx` habilita `draftResumeEnabled = studioCustomer !== null || cartSessionId !== null`.
  - En la superficie de foto, tras confirmarse el primer auto-save real en el servidor, se escribe
    el marcador `{ designId, savedAt, unitCount? }` bajo `lucams_studio_draft_<slug>:<variantId>`
    (vigencia de `30 días`).
  - En `NameEditor` (`lucams_studio_name_draft_<slug>:<variantId>`) y `LetterSetEditor`
    (`lucams_studio_letterset_draft_<slug>:<variantId>`), el estado en curso se persiste localmente
    con vigencia de `7 días` (`SIMPLE_STUDIO_DRAFT_MAX_AGE_MS`).
  - **Compuertas de honestidad al retomar**: no existe redirección silenciosa al entrar. El Estudio
    verifica primero que el borrador tenga trabajo real (`studioDraftHasRealProgress` en
    `features/personalization/draft-lifecycle.ts`: al menos un slot con foto, avatar o texto, o
    `templateId` elegido) y que coincida con la cantidad de unidades solicitada
    (`draftUnitsMismatch`), ofreciendo entonces el aviso explícito para continuar con
    `?designId=<id>&resume=1`. Si el borrador ya expiró o fue purgado al pulsar retomar, se limpia
    el marcador local y se informa con toast claro.
- **Enlaces públicos para compartir diseño (`/d/[token]`)**: cada diseño finalizado dispone de un
  `shareToken` opaco de 128 bits (`app/d/[token]/page.tsx`, `robots: noindex, nofollow`). La página
  muestra las vistas previas limpias autenticadas con `?st=<token>` y permite abrir una copia
  editable en el Estudio sin exponer el diseño original ni los archivos de imprenta.
- **Poda automática «últimos 3» (`trimExcessDraftDesigns`) y gestión en cuenta**:
  - Al crear un `DRAFT` nuevo por cualquier vía (`createDraftDesign`, `cloneDesignForEdit`,
    `cloneDesignForReorder`, `createNameDesign`, `createLetterSetDesign`), `draft-lifecycle.ts`
    conserva los **`MAX_DRAFTS_PER_PRODUCT = 3`** borradores con progreso más recientes del mismo
    dueño y producto, respetando una ventana de gracia de **`1 hora`** (`EMPTY_DRAFT_GRACE_MS`) para
    no cortar una pestaña hermana recién abierta. Los diseños `READY` o `USED_IN_ORDER` son inmunes.
  - La limpieza delega en `purgeDesignBatch` (`retention-service.ts`), que **preserva los objetos en
    Storage cuyos paths (`storageUrl` o `canvasPath` `.canvas.webp`) sigan referenciados por otros
    diseños vivos** (clave cuando un clon de edición comparte fotos con el diseño `READY` del
    carrito).
  - En `/mi-cuenta/disenos` (`app/mi-cuenta/disenos/actions.ts`), el cliente dispone de una sección
    colapsable de borradores con eliminación individual y botón «Vaciar borradores».

---

## 4. Estructura Exacta de Archivos

```text
apps/web/app/estudio/
├── layout.tsx                           # Registra las variables CSS de las 6 fuentes .ttf extra del Estudio
├── fonts.ts                             # Declaración next/font/local (preload: false) para las fuentes extra
└── [slug]/
    ├── README.md                        # Esta guía de ingeniería
    ├── page.tsx                         # Entrada RSC (maxDuration = 60): sesión, producto, plantillas y recover
    ├── loading.tsx                      # Skeleton de carga de la ruta
    ├── types.ts                         # Contratos V1/V2 seguros para cliente (MultiSlotCanvasData, SlotState…)
    ├── studio-editor-loader.tsx         # Frontera client: carga dinámica ssr:false según superficie (foto/letras)
    ├── studio-editor.tsx                # Orquestador principal de superficie foto (auto-save, 3D, finalize)
    ├── name-editor.tsx                  # Superficie sin Konva para Nombre Personalizado (2–12 fichas)
    ├── letter-set-editor.tsx            # Superficie sin Konva para Abecedario / Vocales multi-set (hasta 10 sets)
    │
    ├── # Lienzo Konva, barras de herramientas y modales de edición
    ├── studio-canvas-grid.tsx           # Grilla responsiva de unidades/slots + StudioStageZoomControl + chips mes
    ├── studio-canvas-grid-size.ts       # Matemática pura de columnas, pisos, secciones por fila y zoom [0.5, 2.5]
    ├── studio-slot.tsx                  # Stage Konva unitario por pieza/cara/mes + gestos rueda/pinch/drag
    ├── studio-calendar-card-layer.tsx   # Render Konva en vivo (540×720) de tarjeta mensual con festivos
    ├── studio-realism-overlay.tsx       # Guía safe-area (8 %), brillo PET calibrado y sombra estática cacheada
    ├── studio-sidebar.tsx               # Panel lateral (desktop) y contenido compacto del Sheet «Editar» (móvil)
    ├── studio-checklist.tsx             # Checklist persistente «Tu diseño» + badge de bloqueantes del FAB móvil
    ├── studio-toolbar.tsx               # Header superior con progreso, AutoSaveIndicator y Popover «qué falta»
    ├── studio-simple-header.tsx         # Header sticky unificado para NameEditor y LetterSetEditor
    ├── studio-style-toolbar.tsx         # Borde, paleta y grosor (inline en >=sm, bottom-sheet accesible en <sm)
    ├── studio-unit-count-control.tsx    # Stepper de unidades físicas multi-slot en el lienzo
    ├── studio-photo-count-control.tsx   # Stepper de fotos de pack + insignia de solo lectura Con/Sin imán
    ├── studio-message-field.tsx         # Campo «Tu mensaje» a nivel de pack en el sidebar
    ├── studio-ig-post-fields.tsx        # Campos asistidos Polaroid Instagram (@usuario, ubicación, likes, tags)
    ├── studio-ig-slot-fields.tsx        # Edición por slot individual de campos Instagram
    ├── ig-debounced-input.tsx           # Input controlado con eco de commit para preservar espacios al escribir
    ├── studio-slot-edit-modal.tsx       # Modal unificado de ajuste de encuadre, avatar IG, fuente mes y Texto
    ├── studio-photo-adjust-modal.tsx    # Controles de zoom/pan/rotación 90° y los 5 filtros fotográficos
    ├── studio-photo-preview.tsx         # Previsualizador interactivo dentro del modal de ajuste
    ├── studio-text-editor-modal.tsx     # Formulario de capas de texto («Aplicar» arriba + alerta bajo contraste)
    ├── studio-asset-picker-modal.tsx    # Selector siempre montado de «Mis fotos» y galería de prediseñados
    ├── studio-face-choice-modal.tsx     # Elección explícita Cara A / Cara B para prediseñados de 1 cara
    ├── studio-replace-slot-modal.tsx    # Reemplazo explícito de slot o de par completo A+B (pairMode)
    ├── predesigned-hover-preview.tsx    # Vista previa flotante al pasar puntero fino en desktop
    ├── predesigned-view-dialog.tsx      # Diálogo táctil (botón «Ver» 44 px) con vista grande y toggle Cara A/B
    ├── photo-quality-modal.tsx          # Modal de advertencia de resolución/nitidez en portal (document.body z-50)
    ├── studio-quality-warnings-chip.tsx # Chip resumen de advertencias de calidad fotográfica
    ├── studio-preview-modal.tsx         # «Así se verá tu pedido»: preview paginado limpio + confirmación al carrito
    ├── preview-pages-upload.ts          # Subida resiliente de páginas individuales pages/NN.webp del preview
    ├── studio-ai-panel.tsx              # Panel del asistente IA de ideas por ocasión (Google Gemini)
    ├── studio-onboarding.tsx            # Bienvenida y recorrido guiado inicial
    ├── studio-gestures-hint.tsx         # Pista contextual de gestos táctiles
    ├── studio-text-edit-hint.tsx        # Pill descartable «toca el texto para editarlo» (localStorage)
    ├── studio-consent-text.tsx          # Leyenda de declaración de derechos sobre imágenes (Ley 1581)
    ├── studio-brand.ts                  # Colores de delimitadores de slot (SLOT_GUIDE_COLORS) y opacidades guía
    ├── studio-busy-cta.ts               # Estado ocupado compartido en botones de confirmación
    ├── studio-layout.ts                 # Tope de ancho máximo del contenedor del Estudio (1600 px)
    │
    ├── # Fichas de letras, copy tipado (Capa 3) y utilidades de navegador
    ├── letter-tile.tsx                  # Ficha visual unitaria de letra (colección ilustrada o «Solo letra»)
    ├── letter-style-picker.tsx          # Selector de colección ilustrada
    ├── letter-color-controls.tsx        # Selector de tema cromático, barajado y color individual por ficha
    ├── use-letter-colors.ts             # Hook de colores por ficha/set con restauración determinista por índice
    ├── studio-texts.ts                  # Diccionario tipado DEFAULT_STUDIO_TEXTS (Capa 3 CMS v2, ADR-187)
    ├── studio-texts-provider.tsx        # Contexto React cliente (useStudioTexts)
    ├── studio-texts.server.ts           # Helper servidor getStudioTexts() sin lecturas a base de datos
    ├── client-image-compress.ts         # Compresión WebP en cliente previa a la subida (> ~2 MB -> <= 2400 px)
    ├── client-photo-upscale.ts          # Orquestador de super-resolución local antes de subir
    ├── client-photo-upscale-core.ts     # Matemática pura de pasos <= 2x + kernel unsharp 3×3 (k = 0.3, tope 4x)
    ├── client-photo-upscale.worker.ts   # Web Worker con OffscreenCanvas para escalar sin bloquear el hilo UI
    ├── use-dialog-a11y.ts               # Trampa de foco, tecla Escape y retorno de foco en modales propios
    ├── use-is-touch.ts                  # Detección reactiva de puntero coarse
    ├── use-prefers-reduced-motion.ts    # Hook reactivo para prefers-reduced-motion
    │
    ├── # Previsualizador 3D «Míralo en tu espacio» (React Three Fiber / Three.js)
    ├── scene-gallery.tsx                # Galería de las 7 escenas 3D + compuerta honesta por magnet (ADR-180)
    ├── scene-3d-error-boundary.tsx      # ErrorBoundary aislado por escena WebGL
    ├── studio-3d-environment.tsx        # Iluminación calibrada y entorno compartido R3F
    ├── magnet-3d.tsx                    # Malla 3D con grosor físico real y dorso ferrita #1A1A1A / papel #FAF8F5
    ├── fridge-3d-view.tsx               # Escena 1: Nevecón French Door 178×91×75 cm (clúster partido sin junta)
    ├── polaroid-3d-view.tsx             # Escena 2: Tarjetas Polaroid sobre mesa
    ├── room-board-view-3d.tsx           # Escenas 3 y 4: Mural de corcho 120×80 cm y Tablero memo (pager por set)
    ├── book-view-3d.tsx                 # Escena 5: Libro 3D (separadores doblados o planos acostados + giro 180°)
    ├── shelf-3d-view.tsx                # Escena 6: Repisa 3D con piezas recostadas a escala real (ADR-172)
    ├── gift-3d-view.tsx                 # Escena 7: Caja de regalo 3D con piezas recostadas (ADR-172)
    ├── calendar-card-focus.tsx          # Visor 3D focal 1 a 1 de calendario con paginador de 2 niveles (Set + Mes)
    ├── calendar-view-3d.tsx             # Escena 3D auxiliar de calendario de escritorio
    ├── fit-camera.tsx / fit-camera-polar.tsx # Encuadre automático de cámara según muebles y clúster
    ├── use-window-textures.ts           # Carga y liberación segura de texturas para escenas
    │
    └── lib/                             # Estado Zustand, geometría pura y pipelines cliente
        ├── store.ts                     # createStudioStore (Zustand + historial undo/redo de 30 pasos)
        ├── active-studio-store.ts       # Referencia al store activo de la sesión del editor
        ├── serial-task-queue.ts         # Cola FIFO estricta para auto-guardados secuenciales
        ├── draft-marker.ts              # Marcadores localStorage de borradores y snapshots de emergencia
        ├── boot-template.ts             # resolveBootTemplate: separa geometría de arranque de selección explícita
        ├── recover-variant.ts           # resolveRecoverVariantId al abrir ?designId=
        ├── remap-canvas-assets.ts       # Rehidratación de signed URLs (master + canvasUrl + avatar IG) por assetId
        ├── canvas-migrate.ts            # Migración idempotente V1 -> V2
        ├── print-master-mode.ts         # runWithPrintMasters: conmutación fail-closed a masters para exportar
        ├── production-preview-render.ts # Composición cliente de vistas previas y snapshots de respaldo
        ├── preview-encode.ts            # fitPreviewToBudget (<= 3.5 MB antes de enviar payload)
        ├── preview-units.ts             # Paginación de vistas previas por unidad física
        ├── preview-variant-label.ts     # Etiquetas de variante con/sin dimensiones para lienzo y confirmación
        ├── upload-photo-pipeline.ts     # Pipeline unificado: upscale -> compresión -> subida ordenada (tope 3)
        ├── upload-with-retry.ts         # PUT resiliente a signed URLs con backoff exponencial y timeout 30 s
        ├── upload-guidance.ts           # Formatos aceptados y píxeles mínimos recomendados a 300 DPI
        ├── cart-design-assets.server.ts # AssetIds en uso por otras líneas del carrito para priorizar auto-fill
        ├── smart-crop.ts                # Auto-encuadre sobre copia <= 256 px + guarda frente a edición manual
        ├── quality-warnings.ts          # Recolección de advertencias de calidad fotográfica y requiresAck
        ├── stage-pinch.ts               # Gestos multitáctiles sobre stages Konva
        ├── photo-filters.ts             # 5 presets de filtros fotográficos Konva
        ├── filter-recache.ts            # Debounce del re-cache de filtros durante gestos continuos de zoom
        ├── konva-pixel-ratio.ts         # Tope Konva.pixelRatio <= 2 en pantalla (ADR-166)
        ├── chrome-bitmap-cache.ts       # Raster compartido único para cromos SVG repetidos entre slots
        ├── slot-snapshot-cache.ts       # Caché de snapshots a 720 px fijos con invalidación por referencia
        ├── slot-photo-readiness.ts      # Espera de decodificación de nodos slot-photo (4 s) antes de hornear
        ├── calendar-card-preview.ts     # Resolución de CSS vars --font-fredoka/--font-inter para canvas 2D
        ├── compose-calendar-page.ts     # Caché LRU (48 páginas) de tarjetas mensuales WebP para 3D y preview
        ├── ig-post-fields.ts            # Transformaciones puras de campos Polaroid Instagram (igLocationOverride…)
        ├── use-debounced-commit.ts      # Commit con debounce de 350 ms y parámetro commitEcho
        ├── apply-predesigned.ts         # Anclaje a Cara A (resolveFaceAAnchor) y reemplazo por par A+B
        ├── predesigned-variety.ts       # Reparto variado de diseños prediseñados
        ├── faces.ts                     # Emparejamiento de caras físicas (separadores de 2 caras)
        ├── brand-back-texture.ts        # Textura 3D CanvasTexture del patrón «Lucams» para cara B vacía (ADR-190)
        ├── book-geometry.ts             # Pose con grupos anidados de separadores doblados y planos en libro 3D
        ├── cluster-layout.ts            # Proporciones reales y clústeres para nevera French Door y tableros
        ├── leaning-scene-layout.ts      # Pose geométrica de piezas recostadas en repisa y caja de regalo
        ├── procedural-textures.ts       # Texturas procedurales Canvas 2D -> Three.js
        ├── texture-resolution.ts        # Cálculo de ancho de textura 3D según tamaño físico (1024 / 2048 px)
        ├── letter-set-resolve.ts        # Resolución de variante exacta en sets de letras
        ├── letter-tile-textures.ts      # Texturas de fichas de letras para el tablero 3D
        ├── grid-layout.ts               # generateGridLayout(slotCount, stage)
        ├── product-kind.ts              # Clasificación semántica de producto (calendar, strips, bookmarks, tiles…)
        ├── slot-noun.ts                 # Sustantivo exacto de pieza (jamás llama «imán» a una variante sin imán)
        ├── size-comparator.ts           # Comparación en línea en cm frente a objetos cotidianos colombianos
        ├── fonts.ts                     # Catálogo de fuentes y colores de la pestaña Texto
        ├── contrast.ts                  # Detección WCAG de bajo contraste texto/tarjeta (< 1.2)
        ├── canvas-image.ts / image-utils.ts # Carga segura CORS de imágenes para canvas 2D
        └── studio-tour.ts               # Estado persistido del recorrido inicial

apps/web/features/personalization/
├── schemas.ts                           # Esquemas e invariantes Zod V1/V2 + límites de bytes
├── service.ts                           # Dominio server-only: createDraft, saveCanvas, clone, finalizeDesign
├── actions.ts                           # Server Actions autenticadas (subida, borrado de asset, prediseñados…)
├── surface.ts                           # Resolución de superficie del Estudio ("photo" | "name" | "letterset")
├── draft-lifecycle.ts                   # Progreso real, discrepancia de unidades y poda MAX_DRAFTS_PER_PRODUCT = 3
├── design-units.ts                      # Multiplicadores autoritativos de unidades y precios en servidor
├── frame-palette.ts                     # Marcos full-bleed, canaletas de tira, backing y borderWidthFactor
├── instagram-template-spec.ts           # Geometría congelada, colores igTextFill y las 5 capas IG requeridas
├── brand-back-pattern.ts                # Dibujo 2D/300 DPI del reverso de marca «Lucams» (ADR-190)
├── photo-fit.ts                         # Matemática única cover-scale, clamp noFold y sensibilidad pinch (1.7)
├── calendar-layout.ts / calendar-draw.ts # Geometría y motor vectorial compartido de calendarios mensuales
├── colombian-holidays.ts                # Cálculo de festivos oficiales de Colombia (Ley Emiliani + Pascua)
├── letter-tiles.ts / letter-tile-render.ts # Lógica de fichas y render servidor 300 DPI por ficha (ADR-188)
├── production-render.ts                 # Orquestador de los 3 tiers de producción (PRODUCTION_SCALE = 3)
├── production-render-sharp.ts           # Tier 1: composición rápida con sharp para geometrías puras
├── production-render-canvas.ts          # Tier 2: composición @napi-rs/canvas con fuentes .ttf registradas
├── production-spec.ts                   # Especificación legible de unidades y piezas para el taller
├── render-job-service.ts                # Cola asíncrona RenderJob con lease y reintentos en background
├── assembly-sheet.ts / staged-slots.ts  # Hoja guía de armado y tickets acotados para subidas de respaldo
├── preview-access.ts                    # Matriz de autorización canAccessDesignPreview (LUC-SEC-001)
├── preview-compress.ts / preview-pages.ts # Compresión sharp de previews limpios y páginas individuales
├── line-preview.ts                      # Resumen de unidades personalizadas en líneas de carrito/orden
├── order-packaging.ts                   # Empaquetado ZIP de producción para descarga del taller
├── retention-service.ts                 # Purga escalonada de borradores y barrido de huérfanos en Storage
└── canvas-remap.ts                      # Remapeo de assetIds y profileAssetIds al clonar diseños

Superficies e integraciones conectadas:
├── apps/web/app/api/designs/save-canvas/route.ts             # Guardado vía fetch / sendBeacon (409 STALE_REVISION)
├── apps/web/app/api/designs/[designId]/render-status/route.ts # Polling de avance de RenderJob
├── apps/web/app/api/design-preview/[...path]/route.ts        # Pasarela autenticada al bucket privado design-previews
├── apps/web/app/d/[token]/page.tsx                           # Vista pública noindex de diseño compartido
├── apps/web/features/ai/{schemas.ts,actions.ts}              # Asistente Gemini con sanitización 0-PII (ADR-058)
├── apps/web/lib/{storage.ts,photo-validation.ts}             # Derivados .canvas.webp <= 800 px y chequeo sharp
├── apps/web/lib/{analytics.ts,funnel-client.ts}              # Telemetría dual GA4 + embudo propio FunnelEventDaily
└── packages/db/scripts/seed-{templates,letter-sets}.mjs      # Semillas idempotentes de plantillas y colecciones
```

---

## 5. Reglas del Lienzo por Plantilla y Superficie

### 5.1 Marcos, fondos, paletas por producto y grosor configurable (`borderWidth`)

- **Marco full-bleed («fin del papel»)**: en productos con `frameOptions`, elegir un color en la
  barra de estilo pinta **toda la tarjeta** con `borderColor` y retrae la ventana de la foto con un
  margen relativo proporcional (`4 %` del lado menor del stage en tarjetas, `3 %` en tiras),
  calculado por `frameBleedMargin` e `insetToMinMargin` (`features/personalization/frame-palette.ts`)
  de modo idéntico en Konva y en `production-render-canvas.ts`.
- **Paleta declarada por producto (`personalizationSchema.frameOptions`)**: la barra de estilo
  muestra únicamente los colores habilitados para cada producto más las opciones fijas «Sin color» y
  «Personalizado»:
  - **Polaroid Clásica, Tiras Magnéticas y Fotoimanes Cuadrados**: paleta binaria
    `["blanco", "negro"]` (4 opciones totales: Sin color, Blanco, Negro y Personalizado).
  - **Resto de productos con marco**: paleta completa de los 6 colores de marca.
- **El marco mantiene ancho constante bajo zoom-out o paneo (`photoBackingHexFor`)**: cuando la
  tarjeta tiene marco coloreado y el cliente aleja o desplaza la foto dejando aire dentro de la
  ventana, ese hueco se rellena con el color base de la capa `background` (blanco neutro), nunca con
  el color del marco exterior. Así el borde no «engorda» visualmente. Aplica también a Polaroid
  Instagram con borde; en Instagram sin borde devuelve `null` porque las franjas viven fuera de la
  ventana de la foto.
- **Tarjetas simples (`isSimpleCardTemplate`, ej. Cuadrados)**: `simpleCardPhotoRect` aplica foto a
  sangre total del stage cuando `borderColor === null` y margen uniforme en los 4 lados cuando hay
  color activo. Las piezas rectangulares se exportan con **esquinas rectas a sangre del stage** en
  el PNG de 300 DPI porque el redondeo físico lo realiza la matriz de troquelado (`ADR-189`).
- **Contraste de tarjeta clara sobre lienzo claro (`white-on-white`)**: cuando la tarjeta es blanca
  o muy clara, el contenedor DOM del slot dibuja un filete sutil (`outline` `brand-purple/35`) solo
  en pantalla, sin alterar jamás el PNG exportado.
- **Orden y estado de `studio-style-toolbar.tsx`**: «Borde de foto» aparece siempre primero y «Color
  de tarjeta» debajo. En Polaroid Clásica y Tiras, elegir «Sin borde» atenúa y deshabilita la paleta
  (`aria-disabled`) conservando en memoria el último color elegido para restaurarlo al volver a «Con
  borde». En Polaroid Instagram «Sin borde», la paleta blanco/negro **permanece activa** porque
  gobierna las franjas superior e inferior.
- **Grosor de borde configurable por producto (`ADR-173`)**: cuando el administrador activa
  `personalizationSchema.borderWidth` (`{ enabled, min, max, default }`, leído por
  `readBorderWidthConfig`), la barra de estilo habilita en desktop y móvil un control deslizante que
  escribe `canvasData.borderWidthFactor` (acotado a `[0.25, 3]`, donde `1` es el margen histórico).
  Tanto los márgenes de tarjeta como las canaletas de tiras escalan por este factor en Konva y en
  producción.

### 5.2 Tira photobooth (`photo-strip-3-fotos` y `photo-strip-4-fotos`)

- **Geometría de pieza continua**: las plantillas `photo-strip-3-fotos` (`5×15 cm`, 3 celdas de
  `400×400 px`) y `photo-strip-4-fotos` (`5×16.5 cm`, 4 celdas de `400×330 px`,
  `aspectRatio: "5:4.125"`) fijan `gridCols: 1` y `gridGap: 0`. La grilla envuelve la columna entera
  con una única sombra exterior (`stripMode`) y redondeo solo en los extremos superior e inferior.
- **Canaletas horizontales internas (`stripPhotoRect`)**: como producción renderiza celda por celda,
  un `gap` CSS externo desaparecería al imprimir. Por eso las canaletas viven **dentro** de cada
  celda: `12 px` (~2 mm) en los bordes laterales, `12 px` en el borde exterior superior de la
  primera celda e inferior de la última, y media canaleta de `8 px` (`stripGutterPx`, sumando
  `16 px` ≈ 1.3 mm entre fotos consecutivas), todo multiplicado por `borderWidthFactor`.
- **Modo «Sin borde» (`isStripBorderless`)**: al desactivar el borde, `stripPhotoRect(..., {
borderless: true })` expande cada foto a sangre total de su celda, logrando una tira continua sin
  marco exterior ni canaletas intermedias.
- **Acciones flotantes solo en la celda activa (`overlayActions`)**: para no tapar las fotos de una
  tira llena, la barra de acciones solo se muestra en el slot seleccionado (el primer toque
  selecciona la celda y revela acciones; el segundo toque abre el modal de edición; tocar fuera
  libera la selección). Si una celda no seleccionada tiene advertencia de calidad, conserva visible
  únicamente un badge compacto `⚠` conectado al modal en portal.

### 5.3 Polaroid Instagram: fondo binario, avatar circular, modo sin borde y campos asistidos

- **Fondo binario blanco/negro y cromo adaptativo**: el selector ofrece únicamente blanco y negro
  (`StudioFramePicker allowCustom={false}`, normalizado por `instagramBackgroundHex` para descartar
  colores pastel heredados al cambiar de plantilla). Con fondo negro, `AssetLayerRenderer` intercambia
  en caliente el cromo vectorial a su variante oscura (`ig_post_3x4_dark.svg` o
  `ig_post_3x4_dark_noborder.svg`) sin mutar el `src` base del `unitTemplate`.
- **Contraste tipográfico por capa (`igTextFill` en `instagram-template-spec.ts`)**: `usuario`,
  `ubicación`, `likes_count` y `título` invierten entre negro y `#FFFFFF` según el fondo, mientras
  que `hashtags` se pinta siempre en azul enlace accesible (`#00376B` sobre tarjeta clara y
  `#0095F6` sobre tarjeta oscura, ambos con ratio WCAG AA `>= 4.5:1`), salvo override explícito de
  color elegido por el cliente.
- **5 capas de texto obligatorias (`IG_REQUIRED_TEXT_LAYER_IDS`)**: `usuario`, `ubicación`,
  `likes_count`, `título` y `hashtags` deben tener texto no vacío en **todos** los slots del pack
  (`igMissingRequiredTextLayerIds`, ya que cada pieza es una publicación independiente). Mientras
  falte alguno, «Ver diseño» permanece bloqueado y el Popover «qué falta» detalla qué campos restan
  por unidad.
- **Capa `profile-photo` por slot**: ubicada justo encima del cromo SVG (`IG_PROFILE_PHOTO_LAYER`,
  con `x, y` en el centro del círculo), recorta con `ctx.arc` la foto asignada en
  `slots[i].profileAssetId` respetando su encuadre `profileTransform` y dejando visible el aro de
  historia. Ofrece un área interactiva (`radius + 8 px`, marcada `edit-indicator`) que abre
  `StudioAssetPickerModal` en `mode="profile"`. Cambiar la foto principal del slot resetea encuadre,
  filtro y textos del post, pero **conserva** `profileAssetId`.
- **Modo «Sin borde» (`canvasData.igNoBorder`)**: al apagar el borde en Instagram, la foto se abre a
  todo el ancho del stage (`x = 0`, `width = stage.width`) manteniendo intacta su franja vertical
  (`y = 58 .. 450`) para preservar la cabecera (`@usuario`, ubicación, avatar) y el pie (iconos,
  me gusta, título y hashtags), con el selector blanco/negro activo sobre dichas franjas.
  `isInstagramNoBorder` prioriza el flag explícito y mantiene detección geométrica de respaldo para
  diseños anteriores.
- **Campos asistidos de «Datos de la publicación» (`studio-ig-post-fields.tsx` + `lib/ig-post-fields.ts`)**:
  todos los campos persisten en `textOverrides` el texto exacto que debe imprimirse y commitean con
  un debounce de **`350 ms`** (`lib/use-debounced-commit.ts`):
  - **`@usuario`**: prefijo `@` fijo fuera del input editable (se guarda con `@` incluido), sin
    espacios, restringido a letras, dígitos, punto y guion bajo, máximo `30` caracteres.
  - **`Ubicación` multi-palabra (`igLocationOverride` + `commitEcho`)**: input con `datalist` de
    ciudades de Colombia y destinos frecuentes, tope `40` caracteres y máximo una coma. Con coma
    formatea hasta dos segmentos multi-palabra capitalizados («Santa Marta, Colombia»); sin coma, 2
    palabras exactas se formatean como «Ciudad País» y 1 o 3+ palabras se conservan como un único
    lugar («Corea del Sur»). El cuarto parámetro `commitEcho` en `useDebouncedCommit` registra el
    eco formateado para que la sincronización externa a los 350 ms jamás borre el espacio que el
    usuario acaba de teclear.
  - **`likes_count` («Me gusta»)**: entrada numérica formateada con separador de miles `es-CO` y
    sufijo fijo `"me gusta"` fuera del input (persiste `"1.234 me gusta"`).
  - **`título` (pie de foto)**: contador en vivo `n/140` calibrado a dos líneas sin desborde sobre
    el stage de `450 px`.
  - **`hashtags`**: interfaz de chips (se agregan con `Enter`, coma o espacio y se quitan con `×` o
    `Backspace`), prefijo `#` automático sin espacios internos y tope estricto de **3 hashtags** con
    aviso `role="alert"`.

### 5.4 Textos, guías placeholder y contraste en todas las plantillas

- **Los textos guía nunca se imprimen**: el texto base de cualquier capa `editable: true` («Escribe
  tu mensaje», `@tu_usuario`, etc.) solo aparece en la grilla del editor como guía atenuada
  (`PLACEHOLDER_GUIDE_OPACITY = 0.4` en `studio-brand.ts`) con `name="placeholder-guide edit-indicator"`
  y `listening={false}`. Antes de cualquier `toDataURL` de snapshot, vista previa, textura 3D o
  exportación cliente se ocultan todos los nodos `.edit-indicator`, y el renderer de servidor
  imprime exclusivamente `override.text` no vacío.
- **Color automático de texto sobre tarjeta (`defaultTextFillOnCard`)**: usa luminancia Rec.601 con
  umbral `0.30` (distinto del `0.50` binario de `isDarkColor`): el texto pasa a blanco únicamente
  sobre tarjetas negras o casi negras, y se mantiene oscuro sobre blanco y sobre todos los pasteles
  de marca (aguamarina, rosa, lavanda, amarillo).
- **Alerta de contraste casi nulo (`lib/contrast.ts`)**: la pestaña Texto pinta la previsualización
  sobre el `borderColor` real de la tarjeta; si la relación de contraste WCAG cae por debajo de
  `1.2` (`isLowContrastOnCard`), añade un contorno sutil solo en el DOM del modal y muestra el aviso
  preventivo para evitar texto blanco sobre tarjeta blanca sin alterar el color elegido si el
  cliente decide mantenerlo. En `StudioTextEditorForm`, el botón primario «Aplicar» se ubica en la
  parte superior para ser visible sin hacer scroll.
- **Compuerta universal `allowText`**: si `Product.personalizationSchema.allowText` es `false` (por
  ejemplo, en Fotoimanes Cuadrados), `studio-canvas-grid.tsx` filtra toda capa editable residual,
  deshabilita la pestaña Texto en `StudioSlotEditModal` y apaga el pill descubrible
  `studio-text-edit-hint.tsx` (`TEXT_EDIT_HINT_STORAGE_KEY`).
- **Orden Borde → Colores en superficies de letras**: en `NameEditor` y `LetterSetEditor`, el
  selector «Borde de las fichas» precede siempre a «Elige los colores». Desactivar el borde solo
  apaga la paleta cuando hay una colección ilustrada activa (`styleId !== null`); en modo «Solo
  letra» (`styleId === null`) el color rellena el glifo tipográfico, por lo que la paleta y la
  selección por ficha siguen activas (`colorsEnabled = withBorder || styleId === null`).

### 5.5 Zoom de foto, gestos táctiles, biblioteca «Mis fotos», masters y prediseñados

- **Rotación y zoom milimétrico de foto**:
  - `photoTransform.rotation` rota en pasos de `90°` desde «Ajustar foto» (soportado en Konva y en
    `@napi-rs/canvas`; desactivado en calendarios).
  - La rueda avanza a `×1.04` por paso (`nextWheelScale` compartido entre Konva, listener nativo del
    slot y previsualización del modal). En la **grilla** exige modificador explícito (`Ctrl` / `Cmd`
    - rueda o pinch de trackpad) para que la rueda sola desplace verticalmente la página; dentro del
      **modal de ajuste** la rueda actúa directo sobre el zoom.
  - La sensibilidad de pellizco táctil está unificada entre la grilla y el modal mediante
    `PINCH_SENSITIVITY = 1.7` (`pinchAdjustedRatio` en `features/personalization/photo-fit.ts`).
- **Gestos táctiles y delimitadores progresivos de slot**: los slots en reposo declaran
  `touch-action: pan-y` y `preventDefault={false}` en capas Konva para no bloquear el scroll móvil;
  en el editor a pantalla completa un gesto de pellizco cancela cualquier drag activo. Los contornos
  de slots vacíos usan tres niveles centralizados en `SLOT_GUIDE_COLORS` (`studio-brand.ts`): reposo
  punteado morado (`0.35`), hover (`0.60`) y `drag-over` turquesa sólido, respetando la silueta
  física (`rectangle`, `circle`, `heart`).
- **Guía de subida y super-resolución local en Web Worker**:
  - `lib/upload-guidance.ts` centraliza formatos aceptados (`JPG, PNG, WebP, HEIC`, máx. `10 MB`) y
    calcula los píxeles mínimos recomendados del lado menor con `PX_PER_CM_300DPI = 118.11`.
  - Si una imagen está por debajo del ratio `1.0` a 300 DPI, `client-photo-upscale.ts` ejecuta antes
    de subir un remuestreo por etapas `<= 2×` con `imageSmoothingQuality: "high"` más un kernel
    _unsharp mask_ `3×3` suave (`k = 0.3`, tope `4×`) dentro de `client-photo-upscale.worker.ts`
    (`OffscreenCanvas`, con fallback idéntico en hilo principal desde `client-photo-upscale-core.ts`).
  - `StudioAsset` conserva en memoria `originalWidth` y `originalHeight` de la foto original antes
    del reescalado para que el diagnóstico de calidad nunca oculte artificialmente una baja
    resolución de origen.
- **Pipeline unificado de subida (`lib/upload-photo-pipeline.ts` + `lib/upload-with-retry.ts`)**:
  tanto el sidebar como el modal selector ejecutan `upscalePhotoForPrint` → `compressImageForUpload`
  (WebP `<= 2400 px` `q = 0.85` cuando supera ~2 MB) → `uploadDesignAssetAction`, con concurrencia
  máxima de **3 archivos en vuelo** y entrega estricta **en el orden de selección** (flush por
  prefijo contiguo). Los `PUT` hacia URLs firmadas aplican 2 reintentos con backoff exponencial
  (solo ante errores de red o `5xx`, nunca ante `4xx`) y timeout de `30 s` por intento.
- **Biblioteca persistente «Mis fotos» (`ADR-178`) y auto-fill priorizado (`ADR-176`)**:
  - `page.tsx` hidrata los `DesignAsset` recientes del dueño (`loadOwnerLibraryAssets`) para que la
    biblioteca persista tras recargar (`F5`). Tocar una miniatura la asigna al slot seleccionado o al
    próximo libre (mostrando antes `PhotoQualityModal` si tiene advertencia), y cada miniatura
    permite eliminación individual confirmada vía `deleteDesignAssetAction` (protegiendo bytes en
    Storage si están compartidos con otros diseños).
  - «Llenar slots con mis fotos» (`orderAssetsForAutoFill` en `lib/store.ts`) permanece deshabilitado
    mientras haya subidas en vuelo y prioriza: **(1)** fotos aún no usadas ni en este diseño ni en el
    carrito, **(2)** fotos usadas en otras líneas del carrito (`listCartDesignAssetIdsInUse`), y
    **(3)** fotos menos repetidas en el diseño actual.
- **Derivado ligero de lienzo (`canvasPath` ≤800 px) vs master de imprenta (`ADR-166`, `[STU-01]`)**:
  - `uploadCustomerPhoto` genera tras subir el master un derivado hermano `<uuid>.canvas.webp`
    (`<= 800 px`) registrado en `DesignAsset.canvasPath` y expuesto como `canvasUrl`. Konva, las
    miniaturas y los snapshots 2D/3D cargan `canvasUrl`, reduciendo drásticamente decodificación y
    memoria en móviles.
  - Producción en servidor lee siempre el master `DesignAsset.storageUrl`. Cuando un diseño usa el
    respaldo de snapshots de stages en cliente al finalizar, `runWithPrintMasters`
    (`lib/print-master-mode.ts`) conmuta temporalmente los slots a los masters originales, refresca
    firmas con `>= 40 min` de antigüedad (`refreshDesignMasterUrlsAction`) y aborta en modo
    _fail-closed_ (`MasterPhotoLoadError`) si algún master no decodifica.
- **Presupuesto de vista previa, snapshots estables y carrera de smart-crop**:
  - `fitPreviewToBudget` (`lib/preview-encode.ts`) mantiene el preview por debajo de **`3.5 MB`**
    antes de enviarlo para respetar el límite duro (~4.5 MB) del payload en funciones serverless
    (`page.tsx` exporta además `maxDuration = 60`).
  - `lib/slot-snapshot-cache.ts` rasteriza a un ancho objetivo fijo `SNAPSHOT_TARGET_WIDTH = 720 px`
    con `pixelRatio <= 2`, de modo que cambiar el zoom visual del lienzo jamás invalida la caché
    compartida entre confirmación y visor 3D.
  - `lib/slot-photo-readiness.ts` espera la decodificación real de los nodos `name="slot-photo"`
    (plazo máximo `4 s`) y marca entradas `photoPending` para nunca hornear en caché el fondo lila
    de carga.
  - `lib/smart-crop.ts` ejecuta `smartcrop` sobre una copia `<= 256 px` y verifica al resolver
    `shouldApplySmartCropResult` contra `photoTransformRef` para no sobrescribir un encuadre manual
    hecho mientras tanto.
- **Sustantivo exacto de pieza, Popover «qué falta» y galería de prediseñados**:
  - `resolveSlotNoun(productKind, magnet, texts)` (`lib/slot-noun.ts`) garantiza el sustantivo
    preciso (`tarjetas`, `separadores`, `fotos`, `fichas`, `fotoimanes`) y **jamás menciona «imán»
    cuando `magnet === false`**. Cada sección de unidad y header simple muestra el `variantLabel`
    completo con medidas en cm (`studioPreviewVariantLabel`).
  - Cuando «Ver diseño» está bloqueado, un `Popover` Radix accesible enumera exactamente las piezas
    sin foto (`selectMissingSlotIndexesKey`, exigiendo solo Cara A cuando `backOptional` está activo)
    y los campos Instagram faltantes por unidad.
  - En galería de prediseñados (`lib/apply-predesigned.ts`), `resolveFaceAAnchor` ancla siempre en
    Cara A sin pisar contenido existente; cuando todas las unidades están llenas,
    `StudioReplaceSlotModal` permite reemplazo explícito de slot o del **par completo A+B**
    (`pairMode` + `replacePair`). En pantallas táctiles (`ADR-158`), cada tarjeta ofrece un botón
    «Ver» (`44×44 px`) que abre `predesigned-view-dialog.tsx` con toggle Cara A / Cara B. En
    servidor, `assignPredesignedToDesignAction` omite `validatePhotoQuality` sobre artes ya curados y
    procesa las caras A y B en paralelo.

### 5.6 Calendario: el slot es la tarjeta mensual compuesta en vivo

- **Render compuesto idéntico a imprenta (`studio-calendar-card-layer.tsx`)**: cada uno de los 12
  slots por calendario dibuja en un canvas offscreen (`540×720 px`, escala `0.5×`) la misma función
  `drawCalendarPage` (`features/personalization/calendar-draw.ts`) empleada en el visor 3D y en el
  PNG 300 DPI: franja fotográfica `4:3`, encabezado del mes y año elegido, grilla mensual real y
  festivos oficiales de Colombia (`colombian-holidays.ts`).
- **Repintado instantáneo y fuentes reales**: cada actualización toma `< 3 ms` sin debounce; el nodo
  compuesto es arrastrable para ajustar el paneo de la foto dentro de su ventana `4:3`. Como
  `next/font` genera nombres internos con hash (`__Fredoka_<hash>`), `lib/calendar-card-preview.ts`
  resuelve en cliente las familias reales desde `--font-fredoka`, `--font-inter` y las 6 variables de
  `app/estudio/fonts.ts` (`calendarFont` seleccionable tanto en el banner como dentro de «Ajustar
  foto»), mientras que el servidor usa las mismas 8 fuentes `.ttf` registradas en `@napi-rs/canvas`.
- **Caché LRU y colapsado por set**: `lib/compose-calendar-page.ts` mantiene una caché LRU por valor
  de hasta **48 páginas WebP** (`calendarPageCacheKey`), recomponiendo únicamente los meses que
  cambiaron al abrir Vista previa o 3D. En el lienzo, cada calendario puede colapsarse mostrando un
  mapa rápido de chips por mes (`CalendarMonthChips`, «N de 12»).

### 5.7 Modelo multi-unidad («Unidades»), layout fluido, editores de letras y asistente IA

- **Cada unidad es diseñable por separado (`features/personalization/design-units.ts`)**: no existen
  «copias idénticas» forzadas en el Estudio. Si la PDP envía `?copies=2` en un calendario
  (`unitSlots = 12`) o en una tira de 3 fotos (`unitSlots = 3`), el Estudio despliega `2 × 12 = 24`
  o `2 × 3 = 6` slots agrupados en secciones de unidad independientes (hasta el tope Zod
  `slotCount <= 50`). Los packs de fotoimanes sueltos (`unitSlots = 1`) no persisten `unitCount`
  porque su variante ya representa el tamaño del pack.
- **Arranque sin plantilla preseleccionada y bloqueo guiado (`lib/boot-template.ts`, `ADR-167`)**:
  `resolveBootTemplate` separa la geometría inicial de render de la elección del usuario. Si el
  producto tiene **más de 1 plantilla activa** y la URL no trae `?template=<slug>` ni `?designId=`,
  `templateId` inicia en `null` (`Design.templateId = null` en BD), el checklist «Tu diseño» marca
  «Elige tu plantilla» como primer paso pendiente y pulsar «Ver diseño» abre y resalta la sección
  Plantillas hasta que el cliente elija una explícitamente. Con 1 sola plantilla se autoselecciona.
- **Controles de unidades y réplica rápida**: `StudioUnitCountControl` ajusta `unitCount` en
  productos multi-slot (`unitSlots > facesPerUnit`), mientras que `setPhotoSlotsPerUnit` distingue
  entre composición (3 vs 4 fotos por tira) y tamaño de pack. El botón «Aplicar este diseño a todas»
  (`store.applyUnitToAllUnits`, reversible con Deshacer) clona fotos, encuadres, filtros, textos y
  avatar IG de una unidad hacia las restantes.
- **Precio autoritativo en servidor y `RenderJob` asíncrono (`ADR-136`)**: el carrito recibe una
  línea (`qty = 1`) cuyo precio unitario multiplica el valor de la variante por
  `designUnitPriceMultiplier` calculado en el servidor desde `canvasData` (o `metadata.unitCount`
  con compuerta estricta `surface === "letterset"` para nunca multiplicar dos veces). Al finalizar se
  encola un `RenderJob` (`render-job-service.ts`) que renderiza en background todos los archivos 300
  DPI reportando avance en `GET /api/designs/[designId]/render-status`.
- **Superficies de letras (`letter-set-editor.tsx` y `name-editor.tsx`, `ADR-057`, `ADR-188`)**:
  - `LetterSetEditor` (Abecedario / Vocales, hasta **10 sets**) recibe el idioma ya elegido en la
    PDP (`ADR-139`), permite configurar colección ilustrada, tema cromático, color por ficha y borde
    por set (`LetterSetUnitState`), re-resuelve la variante exacta con `lib/letter-set-resolve.ts` y
    dispara en producción **un PNG 300 DPI individual por cada ficha** (`letter-tile-render.ts`).
  - `NameEditor` (2–12 fichas) y `LetterSetEditor` comparten `StudioSimpleHeader`, grillas fluidas
    (`44 px` mínimo táctil hasta `128–144 px`) y layout de dos columnas en `lg` donde en móvil
    (`<lg`) los controles aparecen arriba del lienzo.
- **Asistente IA de ideas (`studio-ai-panel.tsx`, `ADR-058`)**: consulta `suggestDesignAction`
  (Google Gemini) pasando antes la descripción por `sanitizeOccasion` (`features/ai/schemas.ts`)
  para eliminar correos, teléfonos o documentos (0-PII), degradando con mensaje amable si el
  proveedor no responde.
- **Layout fluido y zoom de lienzo (`studio-canvas-grid-size.ts`)**: contenedor acotado a
  `STUDIO_MAX_WIDTH = 1600 px` con `min-w-0` para impedir desbordes flex. En móvil (`< 640 px`) usa
  siempre 1 columna, marco estable `MOBILE_FRAME_HEIGHT = 640 px` y `shouldRemeasureViewportH` que
  ignora el ocultamiento de la barra del navegador móvil (solo re-mide si cambia el ancho). En
  pantallas mayores, `resolveMaxCols` apunta a `450 px` (`<= 6` slots) o `300 px` (`>= 7` slots) con
  guarda `fitColsToFloor`, y `StudioStageZoomControl` ofrece zoom solo de pantalla entre **`0.5×` y
  `2.5×`** (pasos de `0.25×`) con scroll horizontal interno cuando supera el ancho disponible.

---

## 6. Previsualizador 3D «Míralo en tu espacio» (`SceneGallery` y `CalendarCardFocus`)

Todas las vistas contextuales del Estudio son escenas 3D interactivas en tiempo real construidas con
**React Three Fiber / Three.js** (`is3DScene`, cero composiciones 2D planas), iluminadas mediante
`studio-3d-environment.tsx` y protegidas individualmente con `scene-3d-error-boundary.tsx`:

| ID escena    | Componente (`app/estudio/[slug]/`) | Geometría física y comportamiento a escala real                                                                                                                                             |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"fridge"`   | `fridge-3d-view.tsx`               | Nevecón **French Door `178×91×75 cm`** (dos puertas superiores, dispensador izquierdo y gaveta inferior libre). `frenchDoorClusterLayout` reparte piezas sin cruzar jamás la junta central. |
| `"polaroid"` | `polaroid-3d-view.tsx`             | Tarjetas dispuestas boca arriba sobre una mesa cálida con sombras suaves; compatible tanto con variantes magnéticas como sin imán.                                                          |
| `"board"`    | `room-board-view-3d.tsx` (`cork`)  | Mural de corcho de pared **`120×80 cm`** con marco de `5.5 cm` (`0.1 u/cm`), clúster multi-columna balanceado (`clusterLayout`) y encuadre ponderado `boardFitHalf`.                        |
| `"memo"`     | `room-board-view-3d.tsx` (`memo`)  | Tablero metálico magnético para sets de letras con **paginador por set** («Anterior / Siguiente», flechas `← →`, wrap-around e indicador «Set N de M»).                                     |
| `"book"`     | `book-view-3d.tsx`                 | Libro abierto con separadores doblados montados sobre la hoja o **separadores planos acostados** (`noFold`) + botón `aria-pressed` «Ver respaldo / Ver frente» (giro `180°`).               |
| `"shelf"`    | `shelf-3d-view.tsx` (`ADR-172`)    | Repisa decorativa 3D con piezas **recostadas a tamaño real** (`lib/leaning-scene-layout.ts`: arista inferior apoyada en la repisa y superior contra la pared).                              |
| `"gift"`     | `gift-3d-view.tsx` (`ADR-172`)     | Caja de regalo abierta 3D con las piezas personalizadas recostadas en fila centrada a escala física real (`lib/leaning-scene-layout.ts`).                                                   |

### Reglas de fidelidad física, material y calibración 3D

- **Visor focal `CalendarCardFocus` con paginador de dos niveles (`ADR-170`)**: los calendarios
  abren primero un visor 3D 1 a 1 (`calendar-card-focus.tsx`, `frameloop="demand"`). Cuando hay
  múltiples sets, «Anterior / Siguiente» (`←` / `→`) recorre los 12 meses con _wrap-around_ dentro
  del set activo («{mes} — Set N de M»), mientras chips dedicados saltan al mes 1 de cada set, y un
  CTA enlaza a la galería de escenas compatibles.
- **Compuerta honesta por variante Con/Sin imán (`ADR-180`)**: cuando `magnet === false` (variantes
  `-NOMAG`), `galleryScenes()` excluye automáticamente las escenas que afirman adherencia magnética
  (`"fridge"`, `"board"`, `"memo"` — los calendarios sin imán conservan `"shelf"` y `"gift"`) y
  pinta el dorso de las mallas en tono papel (`#FAF8F5`). Cuando `magnet === true`, todas las vistas
  aplicables pintan el dorso en negro ferrita (`#1A1A1A`, `MAGNET_BACK_COLOR`).
- **Reverso con patrón de marca «Lucams» en cara B vacía (`ADR-190`)**: en productos de 2 caras con
  reverso opcional (`backOptional`) cuya cara B se dejó sin foto, `lib/brand-back-texture.ts` genera
  una `CanvasTexture` con el mismo `drawBrandBackFace` (`features/personalization/brand-back-pattern.ts`)
  de la vista previa 2D y del render 300 DPI: wordmark **`"Lucams"`** en `Dancing Script` bold
  `#E9E6F0` rotado `-24°` sobre fondo `#FFFFFF` (sin apóstrofo ni subrayado).
- **Pose anidada de separadores planos (`lib/book-geometry.ts`)**: `flatBookmarkSlots` y
  `flatBookmarkPlacement` componen la pose con **grupos Three.js anidados** (`yaw → acostar -90° X →
volteo opcional 180°`) en lugar de un único ángulo de Euler, garantizando que la normal frontal
  mire exacta a `+Y` (`flatFrontNormalWorld`) sin alabear la pieza, con reencuadre de cámara
  `flatBookmarkFit` y rotación automática a 90° si las filas desbordan el fondo de la página.
- **Espesor real, iluminación calibrada y nitidez móvil**: `magnet-3d.tsx` deriva el espesor en
  unidades de mundo desde `uPerCm` (~`2 mm` para fotoimán y `thicknessCm = 0.04` para cartulina de
  calendario). Todas las texturas usan `SRGBColorSpace` con `envMapIntensity = 0.4` en caras impresas
  para igualar el brillo percibido del lienzo 2D (luces principales: Polaroid `0.7`, Nevera `0.85`,
  Libro `0.7` con contraluz `0.55`, Mural `0.7`, Calendario `0.75`), `dpr = 2` en los 7 canvas y
  distancias mínimas calibradas en móvil (`2.6` nevera, `1.7` tablero, `3.0` libro doblado / `2.8`
  plano, `3.0` polaroid, `3.5` calendario). El helper `lib/texture-resolution.ts` (`1024 px` base /
  `2048 px` para lados `>= 10 cm`) está listo y testeado para evolucionar `buildMagnetTextures`
  (actualmente en `512 px` fijos).

---

## 7. Chrome Móvil y Edición Transversal

- **Dos bottom-sheets dedicados en móvil (`< 1024 px` / `< 640 px`)**:
  - El FAB izquierdo **«Editar»** abre un `Sheet` inferior (`88vh`) que monta el mismo
    `StudioSidebar` con `density="compact"` (grillas de 4 columnas, espaciados reducidos y pie
    sticky «Listo»).
  - En `< 640 px`, `studio-style-toolbar.tsx` reemplaza la barra extendida por un botón resumen
    siempre visible (muestra de color + nombre del color elegido + estado del borde + chevron) que
    despliega un `Sheet` inferior con objetivos táctiles `>= 44 px`.
- **Checklist persistente «Tu diseño» (`studio-checklist.tsx`)**: encabeza el sidebar con pasos
  calculados dinámicamente por `useStudioChecklist` («Elige tu plantilla» si hay `> 1` opción,
  conteo de fotos cargadas, prediseñados disponibles, mensaje y datos de Instagram). Tocar un paso
  hace scroll suave dentro de esa instancia del panel (`rootRef`), y el FAB móvil «Editar» muestra un
  **badge numérico solo con los pasos bloqueantes pendientes** (plantilla sin elegir, fotos
  obligatorias y campos IG).
- **Componentes transversales sin inconsistencias nativas**:
  - `apps/web/components/color-picker.tsx` + `lib/color.ts` reemplazan `<input type="color">` para
    ofrecer exactamente la misma experiencia en iOS, Android y escritorio.
  - `PhotoQualityModal` se monta siempre mediante `createPortal(..., document.body)` en `z-50` para
    no quedar atrapado bajo el contexto de apilamiento de celdas animadas.
  - `StudioPreviewModal` recibe un contador `generation` que invalida de inmediato las páginas del
    paginador al reeditar cualquier unidad, y las miniaturas en `/carrito` (`96 px`) y checkout
    (`48 px`) usan `object-contain` con margen neutro para no recortar mosaicos.

---

## 8. DPI, Sangrado, Tiers de Calidad, Acabado Glossy y Vistas Previas Privadas

### 8.1 Cobertura obligatoria en separadores planos (`noFold`, `ADR-186`)

Los separadores planos se imprimen a sangre total sin pliegue central; por ello prohíben dejar bandas
vacías alrededor de la foto:

- `constrainPhotoTransformToCover` (`features/personalization/photo-fit.ts`) fuerza `scale >= 1` y
  restringe `offsetX`/`offsetY` al excedente real de la imagen en la grilla y en el modal, incluidas
  rotaciones de `90°` y `270°`.
- Al pulsar «Ver diseño» sobre un diseño antiguo con encuadre incompleto, el Estudio enfoca el primer
  slot descubierto; en servidor, `finalizeDesign` revalida contra las dimensiones reales de cada
  `DesignAsset` y rechaza manipulaciones con código **`PHOTO_NOT_FULL_BLEED`**.

### 8.2 Escala `PRODUCTION_SCALE = 3`, ausencia de sangrado exterior y 3 tiers de imprenta

- **`PRODUCTION_SCALE = 3` (`features/personalization/production-render.ts`)**: cada PNG de imprenta
  se exporta multiplicando por `3` el tamaño lógico del `stage` (por ejemplo, `1080 → 3240 px`),
  independientemente del tamaño CSS o del dispositivo del cliente. Esto entrega **~686–762 DPI
  efectivos de lienzo** en el catálogo actual; el factor limitante real es siempre la foto subida por
  el cliente.
- **Sin guía de sangrado exterior de corte**: las siluetas se exportan al borde exacto del stage con
  esquinas rectas para troquelado físico (`ADR-189`), salvo el margen estético interior de marcos
  full-bleed (`frame-palette.ts`). La única guía activa en `studio-realism-overlay.tsx` es el área
  segura interior **`SAFE_INSET_PCT = 0.08`** (~3 mm hacia adentro) para proteger textos.
- **Los 3 tiers de render de producción**:
  1. **Tier 1 (`production-render-sharp.ts`)**: composición directa en servidor con `sharp` para
     plantillas de geometría pura sin rotaciones, marcos dinámicos, textos ni filtros.
  2. **Tier 2 (`production-render-canvas.ts` / `calendar-draw.ts` / `letter-tile-render.ts`)**:
     composición vectorial en servidor con `@napi-rs/canvas` y las 8 fuentes `.ttf` de
     `apps/web/assets/fonts/`, cubriendo marcos full-bleed, canaletas de tira, textos, rotaciones,
     filtros, reverso «Lucams», calendarios mensuales y fichas individuales de letras.
  3. **Tier 3 (respaldo de stages en cliente, `ADR-081` + `[STU-01]`)**: para plantillas con cromos
     SVG complejos (como Polaroid Instagram), el cliente rasteriza los stages tras conmutar a los
     masters originales con `runWithPrintMasters` y sube los PNGs mediante tickets acotados
     (`staged-slots.ts`).

### 8.3 Tiers de calidad fotográfica (`ADR-179`) y acabado glossy en pantalla

- **Validación de calidad (`apps/web/lib/photo-validation.ts` + `lib/smart-crop.ts`)**:
  - Resolución efectiva frente a `300 DPI` (`118.11 px/cm`): `< 0.25×` bloquea la subida (`error`),
    `< 200 DPI` emite **`warning-strong`**, y `200–240 DPI` emite **`warning-soft`** con mensaje
    accionable (sugiriendo usar la foto original de la galería en vez de una reenviada por WhatsApp).
  - Nitidez (varianza Laplaciana): umbrales `10` (`soft`) y `4` (`strong`).
  - Si el diseño usa fotos con advertencias (`collectQualityWarnings`), `StudioPreviewModal` exige
    marcar confirmación explícita (persistida en `Design.qualityAcknowledgedAt`), **excepto** cuando
    el único aviso es brillo bajo suave (`requiresAck = false`, respetando fotos nocturnas o de
    estética oscura intencional).
- **Acabado glossy solo en pantalla (`studio-realism-overlay.tsx`)**: todos los nodos con
  `name="realism"` se apagan antes de exportar a imprenta. El reflejo especular que simula el
  laminado PET usa opacidades calibradas suaves (`GLOSSY_HIGHLIGHT_OPACITY = 0.10`,
  `GLOSSY_MID_OPACITY = 0.02`, `GLOSSY_SHADE_OPACITY = 0.02`) para no lavar los colores de la foto.

### 8.4 Vistas previas limpias (`ADR-191`) y bucket privado `design-previews` (`LUC-SEC-001`)

- **Cero marca de agua sobre fotos del cliente (`ADR-191`)**: las vistas previas de diseños
  personalizados (`clean.webp`, `draft-preview.webp` y `pages/NN.webp`) se sirven **100 % limpias**
  en todas las superficies (Estudio, carrito, `/d/[token]`, cotizaciones y órdenes). Únicamente los
  artes propios de tienda en `DesignGalleryImage` (bucket público `product-images`) llevan marca de
  agua de protección de catálogo.
- **Pasarela autorizada `GET /api/design-preview/[...path]` (`features/personalization/preview-access.ts`)**:
  el bucket `design-previews` es privado; `canAccessDesignPreview` aplica control de acceso estricto
  con `Vary: Cookie` y `Cache-Control: private, max-age=300`:
  - **Staff autenticado con `designs.read` + MFA `aal2`** o **dueño del diseño** (`customerId` o
    cookie `cart_session`): acceso a `clean`, `draft-preview` y `pages/NN.webp`.
  - **Portador de capability secret en URL** (`?st=` de `/d/[token]`, `?qt=` de `/cotizacion/[token]`
    u `?ot=` de `/pedido/[token]`, comparación en tiempo constante): acceso solo a `clean` y
    `pages/NN.webp` (**nunca** a `draft-preview`).

---

## 9. Wireframes ASCII, Design Tokens y Máquina de Estados de Slot

### Desktop (`>= 1024 px`)

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║ ← Salir | Polaroid Clásica · 6 unidades · Con imán | ✓ 3/6 | [ Ver diseño ] ║
╠════════════════════════════╦═════════════════════════════════════════════════╣
║ TU DISEÑO (checklist)      ║  [Borde: Con borde] [Blanco ●] [Grosor ──●──]   ║
║  ✓ Elige tu plantilla      ║  [6 fotos −/+ · Con imán]  [3D]  [Zoom 100% −/+]║
║  ○ Sube tus fotos (3/6)    ║                                                 ║
║  ────────────────────────  ║        ┌──────────────┬──────────────┐          ║
║  PLANTILLAS                ║        │              │              │          ║
║  ┌──────────┬──────────┐   ║        │    Slot 1    │    Slot 2    │          ║
║  │ Clásica● │Instagram │   ║        │    ✓ foto    │    ✓ foto    │          ║
║  └──────────┴──────────┘   ║        ├──────────────┼──────────────┤          ║
║  MIS FOTOS (4)             ║        │              │              │          ║
║  ┌────┬────┬────┬────┐     ║        │    Slot 3    │   [ Slot 4 ] │ ← vacío  ║
║  │ 📷 │ 📷 │ 📷 │ 📷 │     ║        │    ✓ foto    │              │          ║
║  └────┴────┴────┴────┘     ║        ├──────────────┼──────────────┤          ║
║  [ + Subir fotos ]         ║        │              │              │          ║
║  [ 🪄 Llenar slots ]       ║        │   [ Slot 5 ] │   [ Slot 6 ] │ ← vacío  ║
║  TU MENSAJE                ║        │              │              │          ║
║  [ Nuestro viaje 2026   ]  ║        └──────────────┴──────────────┘          ║
║  [ ✨ Ideas con IA ]       ║   📐 6.5×8 cm (como una tarjeta bancaria)       ║
╚════════════════════════════╩═════════════════════════════════════════════════╝
```

### Mobile (`< 1024 px`)

```text
┌───────────────────────────────────────┐
│ ← Polaroid       3/6 · Guardando…     │ ← Header compacto con autosave visible
├───────────────────────────────────────┤
│ [Borde: Blanco ▾]  [3D]  [100% −/+]   │ ← Botón resumen abre bottom-sheet estilo
├───────────────────────────────────────┤
│          ┌─────────────────┐          │
│          │     Slot 1      │          │ ← 1 columna full-width (< 640 px)
│          │     ✓ foto      │          │
│          ├─────────────────┤          │
│          │   [ Slot 2 ]    │          │
│          └─────────────────┘          │
│                                       │
│ [✨ Editar (2)]          [Ver diseño] │ ← FABs: conteo bloqueantes / confirmación
└───────────────────────────────────────┘
   Sheet inferior «Editar» (88vh, StudioSidebar density="compact"):
   ┌───────────────────────────────────┐
   │ Tu diseño                         │
   │  ○ Elige tu plantilla (Pendiente) │
   │  ○ Sube tus fotos (3 de 6)        │
   │  ✓ Escribe tu mensaje             │
   ├───────────────────────────────────┤
   │ Plantillas · Mis fotos ·          │
   │ Prediseñados · Tu mensaje         │
   │                        [ Listo ]  │
   └───────────────────────────────────┘
```

### Modal «Ajustar foto» (`StudioSlotEditModal`)

```text
╔═══════════════════════════════════════════╗
║  Ajustar foto · Pieza 1           [ × ]   ║
║  [ Pestaña: Foto ● ]  [ Pestaña: Texto ]  ║
╠═══════════════════════════════════════════╣
║        ┌─────────────────────────┐        ║
║        │                         │        ║
║        │     [ VISTA EN VIVO ]   │        ║
║        │     rueda / pellizco    │        ║
║        │     arrastrar encuadre  │        ║
║        └─────────────────────────┘        ║
║   🔍 Zoom       [─────●─────]   115 %     ║
║   ↻  Rotación   [ Rotar 90° ]             ║
║   🎨 Filtros:                             ║
║   [Original] [Vintage] [Vivid] [B&N]      ║
║   [Pastel]   [Polaroid]                   ║
║                                           ║
║   [ Cambiar foto ]        [ Listo ✓ ]     ║
╚═══════════════════════════════════════════╝
```

> **Comparación de tamaño físico en línea (`lib/size-comparator.ts`)**: no se usa un modal de
> calibración manual con tarjeta física; la referencia de dimensiones se presenta en línea en cm
> comparada contra objetos cotidianos colombianos tanto en la barra del Estudio como en el visor 3D.

### Design tokens CSS del Editor (`apps/web/app/globals.css`)

```css
:root {
  /* Estados visuales de slot */
  --estudio-slot-empty-bg: #fff8f0; /* brand-cream */
  --estudio-slot-empty-border: #7c6aad; /* brand-purple punteado */
  --estudio-slot-filled-shadow: rgba(124, 106, 173, 0.15);
  --estudio-slot-selected-ring: #5dd9d1; /* brand-turquoise */
  --estudio-slot-error-bg: #ffe5ec;

  /* Guías y realismo en pantalla */
  --estudio-safe-area-color: rgba(93, 217, 209, 0.6);
  --estudio-shadow-exterior: rgba(0, 0, 0, 0.18);

  /* Transiciones */
  --estudio-trans-fast: 150ms ease-out;
  --estudio-trans-medium: 300ms ease-out;
  --estudio-trans-slow: 600ms cubic-bezier(0.4, 0, 0.2, 1);
  --estudio-stagger: 80ms;

  /* Espaciados */
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

### Máquina de estados de un slot

| Estado     | Representación visual                                                             | Interacción                                                     |
| ---------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `empty`    | Fondo crema + borde morado punteado (`0.35`) + identificador + indicación de clic | Clic o toque abre `StudioAssetPickerModal`                      |
| `hover`    | Contorno morado (`0.60`) + realce sutil                                           | Retroalimentación previa al clic en puntero fino                |
| `dropping` | Borde sólido turquesa + fondo `turquoise/10`                                      | Foto o prediseñado arrastrado encima del slot                   |
| `filled`   | Foto del cliente + cromo de plantilla + overlay de realismo + sombra cacheada     | Clic/toque selecciona (en tiras) o abre `StudioSlotEditModal`   |
| `selected` | `filled` + anillo turquesa exterior + barra de acciones visible                   | Habilita acciones rápidas (ajustar, rotar, reemplazar, limpiar) |
| `error`    | Fondo rosado de alerta + borde rojo + icono `⚠`                                   | Archivo rechazado por validación de formato, peso o resolución  |

---

## 10. Extensibilidad, Telemetría, Performance, Accesibilidad y Tests

### 10.1 Cómo agregar un `PersonalizationKind` nuevo (paso a paso)

1. **Esquema Prisma (`packages/db/prisma/schema.prisma`)**: añade el nuevo valor al enum
   `PersonalizationKind` y genera su migración Prisma + espejo SQL si aplica.
2. **Contratos cliente y Zod**: añade el literal en `apps/web/app/estudio/[slug]/types.ts` y en
   `PersonalizationKindSchema` dentro de `apps/web/features/personalization/schemas.ts`.
3. **Clasificación de superficie**: registra cómo resuelve la superficie en
   `features/personalization/surface.ts` (`resolveStudioSurface`) y su familia semántica en
   `app/estudio/[slug]/lib/product-kind.ts` + sustantivos en `lib/slot-noun.ts`.
4. **Semilla de plantillas (`packages/db/scripts/seed-templates.mjs`)**: define al menos una
   `DesignTemplate` idempotente (`mode: "EDITABLE"`) con su `unitTemplate` V1 y configura el
   `personalizationSchema` del producto correspondiente.
5. **Activos SVG (`apps/web/public/templates/`)**: incorpora el mockup vectorial claro (y variantes
   `_dark.svg` / `_noborder.svg` si soporta inversión o modo sin borde).
6. **Grilla y medidas (`lib/grid-layout.ts` + `studio-canvas-grid-size.ts`)**: si la geometría
   difiere de tarjetas estándar, declara sus columnas, pisos de celda y reglas de sección por unidad.
7. **Tiers de producción (`features/personalization/production-render-{sharp,canvas}.ts`)**:
   asegúrate de que el renderer de servidor reproduzca exactamente el `unitTemplate` a
   `PRODUCTION_SCALE = 3` (o delegue explícitamente en `NEEDS_KONVA` si depende de SVG complejos) y
   añade pruebas de paridad pixel-level.
8. **Escenas 3D y microcopy (`scene-gallery.tsx` + `studio-texts.ts`)**: mapea las escenas 3D
   compatibles en `scenesForKind` (respetando la compuerta `magnet`) y agrega los textos tipados
   necesarios en `DEFAULT_STUDIO_TEXTS`.

### 10.2 Eventos estandarizados de telemetría (`[ANA-01]`, `ADR-193`)

El Estudio instrumenta su embudo mediante dos canales sincronizados desde
`apps/web/lib/funnel-client.ts` (`trackStudioFunnelStep`) y `apps/web/lib/analytics.ts`, validados en
servidor por `apps/web/features/analytics/funnel-schema.ts`:

| Hito / Evento                   | Canal 1: `POST /api/funnel` (`FunnelEventDaily`, 0-PII sin cookies) | Canal 2: GA4 (`gtag`, solo con consentimiento `COOKIES_ANALYTICS`) | Cuándo se emite                                              |
| ------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `studio_open`                   | `{ step: "studio_open", surface }`                                  | `{ product_slug, surface, variant_id }`                            | Montaje inicial del editor (`photo`, `name` o `letterset`)   |
| `studio_template_select`        | `{ step: "studio_template_select", surface }`                       | `{ product_slug, template_slug }`                                  | Selección explícita de plantilla en el Estudio               |
| `studio_asset_upload_succeeded` | `{ step: "studio_asset_upload_succeeded", surface }`                | `{ product_slug, count }`                                          | Subida exitosa de una o más fotos del cliente                |
| `studio_asset_upload_failed`    | `{ step: "studio_asset_upload_failed", surface, reason }`           | `{ product_slug, reason }` (`too_big`, `invalid_type`, `network`…) | Fallo o rechazo en el pipeline de subida                     |
| `studio_preview_open`           | `{ step: "studio_preview_open", surface }`                          | `{ product_slug, surface, unit_count }`                            | Apertura exitosa del modal «Así se verá tu pedido»           |
| `studio_finalize_succeeded`     | `{ step: "studio_finalize_succeeded", surface }`                    | `{ product_slug, surface, unit_count }`                            | Diseño finalizado y línea agregada/actualizada en el carrito |
| `studio_finalize_failed`        | `{ step: "studio_finalize_failed", surface, reason }`               | `{ product_slug, surface, reason }`                                | Error controlado o de red durante la finalización            |

- **Privacidad por diseño**: `POST /api/funnel` incrementa únicamente contadores diarios agregados en
  `FunnelEventDaily` `(day, step, surface, reason)` sin cookies, IP persistida ni `designId`. En GA4,
  las URLs de página se sanitizan previamente para no filtrar jamás tokens sensibles.

### 10.3 Presupuesto de rendimiento (Performance Budget)

Validado en CI con Lighthouse CI (`lighthouserc.json`) y perfilado por producto con
`apps/web/scripts/profile-studio-entry.mjs`:

| Métrica        | Desktop    | Mobile     |
| -------------- | ---------- | ---------- |
| Performance    | `>= 95`    | `>= 90`    |
| Accessibility  | `>= 95`    | `>= 95`    |
| Best Practices | `>= 95`    | `>= 95`    |
| SEO            | `>= 90`    | `>= 90`    |
| LCP            | `< 2.0 s`  | `< 2.5 s`  |
| INP            | `< 100 ms` | `< 200 ms` |
| CLS            | `< 0.05`   | `< 0.10`   |

**Estrategias activas en producción**:

- Carga diferida del motor Konva y de las escenas Three.js con `next/dynamic(..., { ssr: false })`.
- Tope `Konva.pixelRatio <= 2` en pantalla (`lib/konva-pixel-ratio.ts`), raster compartido único para
  cromos SVG (`lib/chrome-bitmap-cache.ts`) y `Layer.cache()` en sombras estáticas (`ADR-166`).
- Derivados ligeros `.canvas.webp` `<= 800 px` (`DesignAsset.canvasPath`) para lienzo, miniaturas y
  snapshots, reservando el master de hasta `2400 px` exclusivamente para imprenta.
- Super-resolución y enfoque `3×3` fuera del hilo principal en Web Worker + `OffscreenCanvas`
  (`client-photo-upscale.worker.ts`).
- Caché de snapshots a `720 px` fijos (`lib/slot-snapshot-cache.ts`) con cesión al _event loop_
  (`yieldToMain`), espera de decodificación real `waitForSlotPhotosReady` (`4 s`), re-cache de
  filtros Konva con debounce al soltar el zoom (`lib/filter-recache.ts`) y análisis `smartcrop`
  restringido a copias `<= 256 px`.

### 10.4 Checklist de accesibilidad WCAG 2.1 AA

- [x] Navegación completa por teclado: `Tab` recorre controles, `Enter`/`Space` activan, flechas
      navegan entre slots/sets/meses, `Escape` cierra modales y `Delete` limpia la foto del slot.
- [x] Etiquetas `aria-label` descriptivas en cada slot con posición, sustantivo real y estado.
- [x] Regiones `aria-live="polite"` para anunciar progreso de subida, auto-guardado y validaciones.
- [x] Anillo de foco visible en todos los elementos interactivos (prohibido `outline: none` sin
      reemplazo accesible).
- [x] Ratios de contraste AA verificados automáticamente con `axe-core` en Playwright CI.
- [x] `prefers-reduced-motion` respetado en CSS (`0ms`) y animaciones JS (`usePrefersReducedMotion`).
- [x] Diálogos con Radix `<Dialog>` / `<Sheet>` o `useDialogA11y` (trampa de foco, `Escape` y
      retorno de foco al disparador).
- [x] Texto alternativo semántico en vistas previas compuestas y páginas del paginador.
- [x] Controles deslizantes e inputs con `<label htmlFor>` explícito y unidades audibles.
- [x] Objetivos táctiles mínimos de `44×44 px` en todas las acciones móviles (incluidos chips,
      selector de estilo y botón «Ver» de prediseñados).

### 10.5 Comandos de pruebas y perfilado

Los tests unitarios y de integración viven colocados junto a su módulo (`*.test.ts` / `*.test.tsx` en
`app/estudio/[slug]/`, `lib/` y `features/personalization/`), y las suites E2E en
`apps/web/tests/e2e/` (`estudio*.spec.ts`, `pdp-cantidad-tira.spec.ts`, `axe.spec.ts`,
`mobile-storefront-audit.spec.ts`).

```bash
# Suite unitaria e integración focalizada en el Estudio y personalización
pnpm --filter web exec vitest run app/estudio features/personalization

# Puerta integral de calidad (Prettier, typecheck, lint, guardas, voseo y paridad CMS)
make check

# Cobertura completa con umbrales gateados en vitest.config.ts
pnpm --filter web test:coverage

# Flujos E2E y accesibilidad axe-core en Playwright (requiere stack local arriba)
make test-e2e

# Presupuestos de Lighthouse CI y perfilado CPU×6 de entrada al Estudio por producto
pnpm lhci
node apps/web/scripts/profile-studio-entry.mjs
```

---

## 11. Referencias de Decisiones Arquitectónicas (`docs/DECISIONS.md`)

- **`ADR-013` / `ADR-035` / `ADR-037`**: concepto del Estudio como diferenciador #1, arquitectura
  `slot-por-imán` en `react-konva`, 3 buckets privados/públicos y mandato de cero atajos.
- **`ADR-057` / `ADR-139` / `ADR-188`**: superficies `LetterSetEditor` y `NameEditor`, selección de
  idioma en PDP y render servidor a 300 DPI de un PNG individual por cada ficha.
- **`ADR-058`**: asistente de ideas por ocasión con Google Gemini y sanitización 0-PII.
- **`ADR-063` / `ADR-170` / `ADR-172` / `ADR-180`**: galería 3D «Míralo en tu espacio» (7 escenas en
  React Three Fiber, incluidas repisa y regalo recostados), paginador de 2 niveles en calendario y
  compuerta honesta para variantes `-NOMAG` + dorso ferrita `#1A1A1A`.
- **`ADR-081` / `ADR-136`**: respaldo de snapshots en cliente con masters originales y cola asíncrona
  de renderizado 300 DPI `RenderJob`.
- **`ADR-133`**: auto-guardado serial con `clientRev` monotónico, `sendBeacon` y reconciliación de
  snapshot local.
- **`ADR-158`**: diálogo táctil «Ver» (`44 px`) con toggle Cara A/B para diseños prediseñados.
- **`ADR-166` / `ADR-169`**: tope `Konva.pixelRatio <= 2`, caché de cromos SVG, derivados ligeros
  `.canvas.webp` `<= 800 px` y perfilado de entrada móvil.
- **`ADR-167`**: arranque sin plantilla preseleccionada cuando hay `> 1` opción y bloqueo guiado.
- **`ADR-173`**: grosor de borde configurable por producto (`borderWidth` → `borderWidthFactor`).
- **`ADR-176` / `ADR-178` / `ADR-179`**: auto-fill priorizado considerando el carrito, biblioteca
  persistente «Mis fotos» con borrado individual y recalibración de avisos de calidad (`240/200 DPI`).
- **`ADR-186` / `ADR-189` / `ADR-190`**: cobertura obligatoria `noFold` (`PHOTO_NOT_FULL_BLEED`),
  exportación rectangular con esquinas rectas para troquel físico y patrón de marca «Lucams» en
  reversos vacíos.
- **`ADR-191` / `ADR-193`**: vistas previas limpias sin marca de agua servidas desde bucket privado
  `design-previews` e instrumentación dual del embudo (`FunnelEventDaily` + GA4).
