"use client";

/*
 * StudioSlot — 1 mini-canvas Konva = 1 imán físico del pack.
 *
 * El componente core del editor multi-slot (M.3.b Capa 2). Cada slot
 * tiene 6 estados visuales distintos (empty / hover / dropping / filled
 * / selected / error) definidos en README del estudio.
 *
 * Interacciones soportadas:
 *   - Click / tap → abre el modal de asset picker (selección de foto)
 *   - Drag-over con asset desde sidebar → estado "dropping"
 *   - Drop con asset → assignAssetToSlot
 *   - Keyboard:
 *       Tab          → focus next/prev slot
 *       Enter / Space → abre asset picker
 *       Delete       → quitarle la foto (clearSlot)
 *       Arrows       → navegar entre slots adyacentes en el grid
 *
 * Accessibility:
 *   - role="button" con aria-label dinámico ("Slot 1 de 6, vacío" /
 *     "Slot 3 de 6, con foto cargada")
 *   - aria-pressed cuando está selected
 *   - Focus visible siempre con ring brand-turquoise
 *
 * El Konva Stage se monta solo cuando el slot está visible (lazy via
 * IntersectionObserver del padre — Capa 2.5 si performance lo pide).
 * Por ahora todos los slots se montan al inicio.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Wand2 } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { Stage, Layer, Rect, Image as KonvaImage, Group, Text, Circle, Path } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { FilterFunction } from "konva/lib/Node";
// Import filters específicos (no `import Konva from "konva"` que duplica instancia
// y dispara warning "Several Konva instances detected" rompiendo useImage).
// react-konva ya carga Konva runtime; acá solo necesitamos las funciones filter.
import { Brighten } from "konva/lib/filters/Brighten";
import { Contrast } from "konva/lib/filters/Contrast";
import { Grayscale } from "konva/lib/filters/Grayscale";
import { HSL } from "konva/lib/filters/HSL";
import type {
  CanvasDataV1,
  CanvasLayer,
  ImagePlaceholderLayer,
  SlotState,
  StudioAsset,
} from "./types";
import { RealismShadowLayer, RealismOverlayLayer } from "./studio-realism-overlay";
import { getFilterParams } from "./lib/photo-filters";

const FOCUS_RING = "0 0 0 3px rgb(93 217 209)"; // brand-turquoise

type StudioSlotProps = {
  slotState: SlotState;
  unitTemplate: CanvasDataV1;
  /** Ancho lógico del slot en pantalla. Si no se pasa displayHeight, se usa
   * el aspect ratio del unitTemplate.stage para calcular height (FIX-1). */
  displaySize: number;
  /** Alto lógico del slot en pantalla. Si se omite, deriva del aspect ratio
   * del unitTemplate. Importante: el slot DEBE respetar el aspect físico
   * del producto (7×9 cm = vertical, no cuadrado). */
  displayHeight?: number;
  isSelected: boolean;
  totalSlots: number;
  /** M.3.b.A2.5 — Tamaño físico del imán (ej "5×5 cm") leído del product.personalizationSchema.sizeCm. */
  sizeCm?: string;
  /** M.3.b.B.1 — forma física del imán para overlay realismo. */
  shape?: "rectangle" | "circle" | "heart" | "custom";
  /** M.3.b.B.1 — acabado físico para overlay glossy. */
  finish?: "matte" | "glossy" | "soft-touch";
  /** M.3.b.B.1 — cornerRadius en px del imán físico (solo aplica si shape=rectangle). */
  cornerRadiusPx?: number;
  /** M.3.b.B.1 — toggle global para mostrar bleed + safe guides. */
  showRealismGuides?: boolean;
  onClick: () => void;
  onClear: () => void;
  /** M.3.b.B.3 — Abrir modal de ajustar foto (filtros). Solo se llama si slot lleno. */
  onAdjust?: () => void;
  /** M.3.b.D — Click sobre text layer editable abre el editor inline. */
  onTextEdit?: (textLayerId: string) => void;
  onAssetDrop: (asset: StudioAsset) => void;
  onKeyboardNav: (direction: "up" | "down" | "left" | "right") => void;
  onRegisterStage?: (stage: Konva.Stage | null) => void;
};

function StudioSlotImpl({
  slotState,
  unitTemplate,
  displaySize,
  displayHeight,
  isSelected,
  totalSlots,
  sizeCm,
  shape,
  finish,
  cornerRadiusPx,
  showRealismGuides,
  onClick,
  onClear,
  onAdjust,
  onTextEdit,
  onAssetDrop,
  onKeyboardNav,
  onRegisterStage,
}: StudioSlotProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [isDropping, setIsDropping] = useState(false);

  // Expose Konva stage to parent (para snapshot al finalizar)
  useEffect(() => {
    if (onRegisterStage) onRegisterStage(stageRef.current);
    return () => {
      if (onRegisterStage) onRegisterStage(null);
    };
  }, [onRegisterStage]);

  // FIX-1 — Aspect ratio físico del slot.
  // El motion.div + Konva Stage DEBEN respetar las proporciones físicas del
  // producto (7×9 cm = vertical), no forzar cuadrado. Antes el container
  // CSS era `width=height=displaySize` lo que generaba padding interno
  // visible cuando el unitTemplate no era cuadrado.
  const aspect = unitTemplate.stage.height / unitTemplate.stage.width;
  const slotWidth = displaySize;
  const slotHeight = displayHeight ?? displaySize * aspect;
  // Scale Konva: misma proporción horizontal y vertical (no distorsiona)
  const scale = slotWidth / unitTemplate.stage.width;

  // ──────────── Drag & drop nativo ────────────
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("application/lucams-asset")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDropping(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => setIsDropping(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDropping(false);
      const raw = e.dataTransfer.getData("application/lucams-asset");
      if (!raw) return;
      try {
        const asset = JSON.parse(raw) as StudioAsset;
        onAssetDrop(asset);
      } catch {
        // Asset payload inválido, ignorar
      }
    },
    [onAssetDrop],
  );

  // ──────────── Keyboard ────────────
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          onClick();
          break;
        case "Delete":
        case "Backspace":
          if (slotState.assetUrl) {
            e.preventDefault();
            onClear();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          onKeyboardNav("up");
          break;
        case "ArrowDown":
          e.preventDefault();
          onKeyboardNav("down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          onKeyboardNav("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          onKeyboardNav("right");
          break;
      }
    },
    [onClick, onClear, onKeyboardNav, slotState.assetUrl],
  );

  // ──────────── ARIA label ────────────
  const ariaLabel = slotState.assetUrl
    ? `Imán ${slotState.slotIndex + 1} de ${totalSlots}, con foto cargada. Enter para cambiar foto, Delete para quitar.`
    : `Imán ${slotState.slotIndex + 1} de ${totalSlots}, vacío. Enter para subir foto.`;

  return (
    <div className="group/wrapper flex flex-col items-center gap-1.5">
      <motion.div
        ref={containerRef}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-pressed={isSelected}
        onClick={(e: ReactMouseEvent) => {
          e.preventDefault();
          onClick();
        }}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-slot-index={slotState.slotIndex}
        data-state={
          isDropping
            ? "dropping"
            : slotState.assetUrl
              ? isSelected
                ? "selected"
                : "filled"
              : "empty"
        }
        className={[
          "group relative cursor-pointer overflow-hidden bg-white outline-none",
          "transition-shadow duration-200",
          isSelected ? "ring-brand-turquoise ring-2 ring-offset-2" : "",
          isDropping ? "ring-brand-turquoise ring-2 ring-offset-2" : "",
        ].join(" ")}
        style={{
          width: slotWidth,
          height: slotHeight,
          borderRadius: 8,
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        animate={{ scale: isDropping ? 1.04 : 1 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        onFocus={(e) => {
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.boxShadow = FOCUS_RING;
          }
        }}
        onBlur={(e) => {
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.boxShadow = "";
          }
        }}
      >
        {/* Konva Stage — 3 layers stacked:
          1. RealismShadowLayer (bottom) — sombra del imán físico
          2. Content Layer (middle)      — unit template del seed
          3. RealismOverlayLayer (top)   — acabado glossy + bleed/safe guides */}
        <Stage
          width={slotWidth}
          height={slotHeight}
          scaleX={scale}
          scaleY={scale}
          ref={(s: Konva.Stage | null) => {
            stageRef.current = s;
          }}
          // M.3.b.D — Stage debe escuchar eventos para captar clicks sobre
          // text layers editables. Antes era listening={false} para que el
          // div padre captara todos los clicks (open picker modal). Ahora
          // diferenciamos: si el slot tiene texts editables, escuchamos
          // a nivel Konva Text node (los demás layers tienen listening=false).
          listening={!!onTextEdit}
        >
          <RealismShadowLayer
            stage={unitTemplate.stage}
            shape={shape}
            cornerRadiusPx={cornerRadiusPx}
          />
          <Layer>
            {/* M.3.b.UX.bug v2 — clipping a nivel Layer cuando shape es heart/circle.
              Group con clipFunc canvas-API recorta TODO el contenido (background +
              foto + asset SVG + texts editables) por la silueta del producto físico.
              Esto coincide exacto con el edge stroke del overlay (mismo stage), no
              hay franja desalineada. Texto que quede fuera del corazón no se ve
              (lo cual es correcto: un imán heart no se imprime en zona rectangular). */}
            {shape === "heart" || shape === "circle" ? (
              <Group
                clipFunc={makeShapeClipFunc(
                  shape,
                  unitTemplate.stage.width,
                  unitTemplate.stage.height,
                )}
              >
                {unitTemplate.layers.map((layer) =>
                  renderLayer(layer, slotState, unitTemplate.stage, onTextEdit, shape),
                )}
              </Group>
            ) : (
              unitTemplate.layers.map((layer) =>
                renderLayer(layer, slotState, unitTemplate.stage, onTextEdit),
              )
            )}
          </Layer>
          <RealismOverlayLayer
            stage={unitTemplate.stage}
            shape={shape}
            finish={finish}
            cornerRadiusPx={cornerRadiusPx}
            showGuides={showRealismGuides}
          />
        </Stage>

        {/* P0.1 — Slot vacío con mascote Lucams + microcopy emocional tuteo.
          Anti-patrón: NO usar "Photo here" / "Click para subir" (Shutterfly).
          Mensaje emocional + mascote como guía → es la mascota la que invita. */}
        <AnimatePresence>
          {!slotState.assetUrl && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={[
                "absolute inset-0 flex flex-col items-center justify-center gap-1 transition-colors",
                isDropping
                  ? "from-brand-turquoise/35 to-brand-turquoise/15 bg-gradient-to-br"
                  : "from-brand-cream/95 to-brand-cream/80 bg-gradient-to-br backdrop-blur-[1px]",
              ].join(" ")}
              aria-hidden="true"
            >
              {/* Borde punteado interno — animado al drop */}
              <motion.div
                animate={{
                  borderColor: isDropping ? "rgb(93, 217, 209)" : "rgba(124, 106, 173, 0.25)",
                  scale: isDropping ? 1.02 : 1,
                }}
                transition={{ duration: 0.2 }}
                className="pointer-events-none absolute inset-2 rounded-md border-2 border-dashed"
              />

              {/* Mascote Lucams bobbing — invita al cliente.
                Al drop: bounce + wiggle excitado. */}
              <motion.div
                animate={{
                  y: isDropping ? -4 : [0, -3, 0],
                  rotate: isDropping ? [0, -8, 8, 0] : 0,
                }}
                transition={{
                  y: {
                    duration: isDropping ? 0.3 : 2.4,
                    repeat: isDropping ? 0 : Infinity,
                    ease: "easeInOut",
                  },
                  rotate: { duration: 0.4, ease: "easeInOut" },
                }}
              >
                <LucamsLogo variant="mascot" size={44} />
              </motion.div>

              {/* Microcopy emocional tuteo — cambia según estado drop */}
              <span
                className={[
                  "mt-0.5 px-2 text-center text-[11px] leading-tight font-semibold transition-colors",
                  isDropping ? "text-brand-turquoise" : "text-brand-purple-dark/75",
                ].join(" ")}
              >
                {isDropping ? "¡Soltala acá! 💜" : "Pasame una foto"}
              </span>

              {/* Indicador del slot (sutil, sin gritar) */}
              <span className="text-brand-purple-dark/40 text-[9px] font-medium tracking-wider uppercase">
                Imán #{slotState.slotIndex + 1}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Glassmorphism overlay sutil cuando hover sobre foto (solo decorativo) */}
        {slotState.assetUrl && (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/10 opacity-0 transition-opacity duration-200 group-hover/wrapper:opacity-100"
            aria-hidden
          />
        )}

        {/* Número del slot top-left chiquito (badge mínimo, NO tapa la foto) */}
        {slotState.assetUrl && (
          <div
            className="bg-brand-purple/80 absolute top-1.5 left-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-sm"
            aria-hidden
          >
            {slotState.slotIndex + 1}
          </div>
        )}
      </motion.div>

      {/* FIX-2 — Footer bar de acciones FUERA del slot.
        Visible siempre que el slot está lleno O seleccionado (no solo hover),
        para que el cliente vea claramente qué puede hacer.
        Anti-patrón superpuesto adentro: tapaba la foto en slots chicos.
        Patrón Casetify/Mixbook: action bar inferior fuera del canvas. */}
      {(slotState.assetUrl || isSelected) && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex items-center gap-1.5"
          style={{ width: slotWidth }}
        >
          {/* Tamaño físico — chip a la izquierda con orientación explícita */}
          {sizeCm && (
            <span
              className="text-brand-purple-dark/70 bg-brand-cream/90 ring-brand-purple/10 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1"
              aria-label={`Tamaño físico ${sizeCm}`}
              title={`Tu imán será ${sizeCm} cm (ancho × alto)`}
            >
              📐 {sizeCm}
            </span>
          )}

          {/* Acciones secundarias derecha — solo cuando slot lleno.
              M.3.b.UX.2 — Action buttons 50% más grandes (h-6 → h-8, icons h-3 → h-4)
              Tap target compliant Material/HIG con wrapper padding. */}
          {slotState.assetUrl && (
            <div className="ml-auto flex items-center gap-1.5">
              {onAdjust && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdjust();
                  }}
                  aria-label={`Ajustar foto del imán ${slotState.slotIndex + 1} (filtros)`}
                  title="Aplicar filtros a esta foto"
                  className="text-brand-purple ring-brand-purple/20 hover:bg-brand-purple/5 focus:ring-brand-turquoise hover:ring-brand-purple/40 flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-sm ring-1 focus:ring-2 focus:outline-none"
                  tabIndex={-1}
                >
                  <Wand2 className="h-4 w-4" />
                </motion.button>
              )}
              <motion.button
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.94 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                aria-label={`Quitar foto del imán ${slotState.slotIndex + 1}`}
                title="Quitar esta foto"
                className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-red-600 shadow-sm ring-1 ring-red-200 hover:bg-red-50 hover:ring-red-400 focus:ring-2 focus:ring-red-500 focus:outline-none"
                tabIndex={-1}
              >
                <Trash2 className="h-4 w-4" />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

export const StudioSlot = memo(StudioSlotImpl, (prev, next) => {
  return (
    prev.slotState.slotIndex === next.slotState.slotIndex &&
    prev.slotState.assetUrl === next.slotState.assetUrl &&
    prev.slotState.assetId === next.slotState.assetId &&
    prev.slotState.filter === next.slotState.filter &&
    prev.slotState.textOverrides === next.slotState.textOverrides &&
    prev.isSelected === next.isSelected &&
    prev.displaySize === next.displaySize &&
    prev.displayHeight === next.displayHeight &&
    prev.unitTemplate === next.unitTemplate &&
    prev.sizeCm === next.sizeCm &&
    prev.shape === next.shape &&
    prev.finish === next.finish &&
    prev.cornerRadiusPx === next.cornerRadiusPx &&
    prev.showRealismGuides === next.showRealismGuides
  );
});
StudioSlot.displayName = "StudioSlot";

// ──────────────────────────────────────────────────────────────────
//  Layer rendering — replica del unitTemplate dentro de cada slot
// ──────────────────────────────────────────────────────────────────

// Exportado para reuso en <StudioPreviewModal>.
export function renderLayer(
  layer: CanvasLayer,
  slotState: SlotState,
  stage: { width: number; height: number },
  onTextEdit: ((layerId: string) => void) | undefined,
  shape?: "rectangle" | "circle" | "heart" | "custom",
) {
  switch (layer.type) {
    case "background":
      return (
        <Rect
          key={layer.id}
          x={0}
          y={0}
          width={stage.width}
          height={stage.height}
          fill={(layer as { color: string }).color}
        />
      );
    case "image-placeholder": {
      // M.3.b.UX.bug v2 — para productos shape heart/circle, expandir el
      // image-placeholder al stage completo. Razón: el seed declara el slot
      // con padding (ej. 40px) pensando en producto rectangular. Cuando el
      // shape es heart/circle, ese padding deja franjas blancas dentro de la
      // silueta clipeada. Override en runtime: la foto cubre todo el stage,
      // el clipFunc del Layer la recorta a la silueta del producto físico.
      const expandToStage = shape === "heart" || shape === "circle";
      const effectiveLayer = expandToStage
        ? ({
            ...(layer as ImagePlaceholderLayer),
            x: 0,
            y: 0,
            width: stage.width,
            height: stage.height,
            cornerRadius: 0,
          } as ImagePlaceholderLayer)
        : (layer as ImagePlaceholderLayer);
      return <ImagePlaceholder key={layer.id} layer={effectiveLayer} slotState={slotState} />;
    }
    case "text": {
      const textLayer = layer as never as { id: string };
      const override = slotState.textOverrides?.[textLayer.id];
      return renderText(textLayer as never, stage, override, onTextEdit);
    }
    case "shape":
      return renderShape(layer as never);
    case "asset":
      return <AssetLayerRenderer key={layer.id} layer={layer as never} />;
    default:
      return null;
  }
}

type AssetLayerData = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
};

/**
 * M.3.b.A2 — Renderea un asset SVG/PNG externo como capa visual.
 * Paradigma pacdora: el asset tiene transparencia y se superpone al
 * image-placeholder (la foto del cliente queda visible por el hueco).
 *
 * useImage("anonymous") permite cargar SVG via fetch + decode, listo para
 * stage.toDataURL() al finalize.
 */
function AssetLayerRenderer({ layer }: { layer: AssetLayerData }) {
  const [image] = useImage(layer.src, "anonymous");
  if (!image) {
    // Fallback rect transparente mientras carga (no se ve, evita layout shift)
    return null;
  }
  return (
    <KonvaImage
      image={image}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation ?? 0}
      opacity={layer.opacity ?? 1}
      listening={false}
    />
  );
}

type TextLayerData = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string;
  align?: "left" | "center" | "right";
  editable?: boolean;
};

/**
 * M.3.b.D — Render de text layer con soporte para overrides del slot.
 * Si el layer es editable y hay onTextEdit callback, el texto recibe
 * cursor pointer + click handler que abre el editor inline.
 */
function renderText(
  layer: TextLayerData,
  stage: { width: number; height: number },
  override: import("./types").TextOverride | undefined,
  onTextEdit: ((layerId: string) => void) | undefined,
) {
  // Combinar layer base + override del slot. Cada campo del override
  // sobrescribe el layer base si está definido.
  const finalText = override?.text ?? layer.text;
  const fontSize = override?.fontSize ?? layer.fontSize ?? 48;
  const fontFamily = override?.fontFamily ?? layer.fontFamily ?? "Fredoka, Inter, sans-serif";
  const fill = override?.fill ?? layer.fill ?? "#3D2E5C";
  const fontStyle = override?.fontWeight ?? layer.fontWeight;
  const align = layer.align ?? "center";

  const isEditable = layer.editable === true && onTextEdit !== undefined;

  // M.3.b.D — Bounding box aproximado para el indicador dashed visual.
  // Solo aplica si el text es editable — el cliente VE el rect dashed sutil
  // alrededor del texto que indica "esto se puede editar".
  // El cálculo es aproximado (text.length × fontSize × 0.55) — Konva no
  // expone bounding box exacto sin medirlo. Funciona OK para textos cortos.
  const textY = layer.y - fontSize / 2;
  const textX = align === "center" ? 0 : layer.x;
  const estWidth =
    align === "center" ? stage.width : Math.max(60, finalText.length * fontSize * 0.55);
  const estHeight = fontSize * 1.2;
  const padding = Math.max(2, fontSize * 0.1);

  const textNode = (
    <Text
      key={`${layer.id}-text`}
      x={textX}
      y={textY}
      width={align === "center" ? stage.width : undefined}
      text={finalText}
      fontFamily={fontFamily}
      fontSize={fontSize}
      fill={fill}
      fontStyle={fontStyle}
      align={align}
      listening={isEditable}
      onMouseEnter={(e) => {
        if (isEditable) {
          const stageNode = e.target.getStage();
          if (stageNode) stageNode.container().style.cursor = "text";
        }
      }}
      onMouseLeave={(e) => {
        if (isEditable) {
          const stageNode = e.target.getStage();
          if (stageNode) stageNode.container().style.cursor = "";
        }
      }}
      onClick={(e) => {
        if (isEditable && onTextEdit) {
          e.cancelBubble = true;
          onTextEdit(layer.id);
        }
      }}
      onTap={(e) => {
        if (isEditable && onTextEdit) {
          e.cancelBubble = true;
          onTextEdit(layer.id);
        }
      }}
    />
  );

  // Si NO es editable, solo render del text.
  if (!isEditable) return textNode;

  // Si editable, envolver con un Group y agregar Rect dashed visible ALREDEDOR
  // que indica al cliente "este texto se puede editar" + dot turquoise en corner
  // como hint visual extra. M.3.b.UX.3 — más visible que la versión inicial.
  return (
    <Group key={layer.id} listening={true}>
      <Rect
        x={textX - padding}
        y={textY - padding}
        width={estWidth + padding * 2}
        height={estHeight + padding * 2}
        fill="rgba(93, 217, 209, 0.10)"
        stroke="#5DD9D1"
        strokeWidth={1.5}
        dash={[5, 3]}
        cornerRadius={4}
        opacity={0.85}
        listening={false}
      />
      {/* Dot turquesa en corner top-right indicando "editable" — diferenciador
          visual evidente vs textos no editables del template */}
      <Circle
        x={textX + estWidth + padding - 2}
        y={textY - padding + 2}
        radius={3.5}
        fill="#5DD9D1"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        listening={false}
      />
      {textNode}
    </Group>
  );
}

type ShapeLayerData = {
  id: string;
  kind: "rect" | "circle" | "heart";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
};

// SVG path data normalizado para heart shape — bezier curves clásica.
// ViewBox 0 0 100 100, centro en (50, 50). Lo escalamos al width/height del layer.
//
// Path inspirado en SVG estándar de heart icon (Wikimedia commons CC0).
const HEART_PATH_DATA =
  "M50,82 C28,68 6,52 6,32 C6,18 16,8 28,8 C38,8 44,12 50,22 C56,12 62,8 72,8 C84,8 94,18 94,32 C94,52 72,68 50,82 Z";

function renderShape(layer: ShapeLayerData) {
  // M.3.b.A2.1 — Switch real por kind (antes siempre Rect, bug del heart "cuadrado")
  // Convención del seed: shapes usan x/y como CENTER.

  if (layer.kind === "circle") {
    return (
      <Circle
        key={layer.id}
        x={layer.x}
        y={layer.y}
        radius={Math.min(layer.width, layer.height) / 2}
        fill={layer.fill}
        stroke={layer.stroke}
        strokeWidth={layer.strokeWidth ?? 0}
      />
    );
  }

  if (layer.kind === "heart") {
    // Path está definido en viewBox 100×100. Scale al width/height del layer.
    // x/y del Path en Konva representan top-left de un bounding box implícito.
    return (
      <Path
        key={layer.id}
        x={layer.x - layer.width / 2}
        y={layer.y - layer.height / 2}
        scaleX={layer.width / 100}
        scaleY={layer.height / 100}
        data={HEART_PATH_DATA}
        fill={layer.fill}
        stroke={layer.stroke}
        strokeWidth={(layer.strokeWidth ?? 0) / (layer.width / 100)}
      />
    );
  }

  // Default: rect (con cornerRadius opcional)
  return (
    <Rect
      key={layer.id}
      x={layer.x - layer.width / 2}
      y={layer.y - layer.height / 2}
      width={layer.width}
      height={layer.height}
      fill={layer.fill}
      stroke={layer.stroke}
      strokeWidth={layer.strokeWidth ?? 0}
      cornerRadius={layer.cornerRadius ?? 0}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
//  ImagePlaceholder — renderiza el slot Konva con foto o placeholder
// ──────────────────────────────────────────────────────────────────

// M.3.b.UX.bug — Lucy 2026-05-15: cuando el producto es shape heart/circle,
// la foto del cliente debe verse RECORTADA por esa silueta, no como rectángulo
// con un corazón decorativo encima. Konva `Group.clipFunc` aplica un path
// arbitrario al canvas context — solo lo dentro del path se renderea.
// Exportado para reuso en <StudioPreviewModal>.
export function makeShapeClipFunc(
  shape: "heart" | "circle",
  width: number,
  height: number,
): (ctx: Konva.Context) => void {
  return (ctx) => {
    ctx.beginPath();
    if (shape === "heart") {
      // Mismo path bezier que HEART_PATH_DATA, ejecutado en canvas API.
      // viewBox 100×100 → escala a (width × height).
      const sx = width / 100;
      const sy = height / 100;
      ctx.moveTo(50 * sx, 82 * sy);
      ctx.bezierCurveTo(28 * sx, 68 * sy, 6 * sx, 52 * sy, 6 * sx, 32 * sy);
      ctx.bezierCurveTo(6 * sx, 18 * sy, 16 * sx, 8 * sy, 28 * sx, 8 * sy);
      ctx.bezierCurveTo(38 * sx, 8 * sy, 44 * sx, 12 * sy, 50 * sx, 22 * sy);
      ctx.bezierCurveTo(56 * sx, 12 * sy, 62 * sx, 8 * sy, 72 * sx, 8 * sy);
      ctx.bezierCurveTo(84 * sx, 8 * sy, 94 * sx, 18 * sy, 94 * sx, 32 * sy);
      ctx.bezierCurveTo(94 * sx, 52 * sy, 72 * sx, 68 * sy, 50 * sx, 82 * sy);
    } else {
      // circle — radio = min(w,h)/2
      const r = Math.min(width, height) / 2;
      ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
    }
    ctx.closePath();
  };
}

function ImagePlaceholder({
  layer,
  slotState,
}: {
  layer: ImagePlaceholderLayer;
  slotState: SlotState;
}) {
  const [image] = useImage(slotState.assetUrl ?? "", "anonymous");
  const imageNodeRef = useRef<Konva.Image | null>(null);
  // Convención del seed (verificada): image-placeholder usa x/y como TOP-LEFT
  // del slot (esquina superior izquierda). Ej. polaroid-clasico tiene
  // x=60, y=60, width=600, height=700 sobre stage 720x920 → slot va de
  // (60,60) a (660,760). NO restar width/2 ni height/2.
  const x = layer.x;
  const y = layer.y;

  // M.3.b.B.3 — Calcular Konva filters según slotState.filter preset.
  const { filtersArray, filterParams } = useMemo(() => {
    const params = getFilterParams(slotState.filter);
    if (!params) return { filtersArray: [] as FilterFunction[], filterParams: null };
    const f: FilterFunction[] = [];
    // Filters importados directamente del paquete (evita duplicar Konva runtime).
    if (params.grayscale) f.push(Grayscale as FilterFunction);
    if (params.brightness !== 0) f.push(Brighten as FilterFunction);
    if (params.contrast !== 0) f.push(Contrast as FilterFunction);
    if (params.saturation !== 0 || params.hue !== 0) f.push(HSL as FilterFunction);
    return { filtersArray: f, filterParams: params };
  }, [slotState.filter]);

  // M.3.b.B.3 — Cuando cambia la foto o filter, re-cache (Konva filters
  // requieren image.cache() para aplicarse correctamente).
  useEffect(() => {
    const node = imageNodeRef.current;
    if (!node || !image) return;
    if (filtersArray.length > 0) {
      node.cache();
      node.getLayer()?.batchDraw();
    } else {
      node.clearCache();
      node.getLayer()?.batchDraw();
    }
  }, [image, filtersArray.length, slotState.filter]);

  if (slotState.assetUrl && image) {
    // Calcular crop "cover": llenar el slot manteniendo aspect ratio de la foto,
    // recortando el exceso (igual que CSS object-fit: cover).
    const slotAspect = layer.width / layer.height;
    const imgAspect = image.width / image.height;
    let cropX = 0;
    let cropY = 0;
    let cropW = image.width;
    let cropH = image.height;
    if (imgAspect > slotAspect) {
      // Foto más ancha que slot → recortar laterales
      cropW = image.height * slotAspect;
      cropX = (image.width - cropW) / 2;
    } else if (imgAspect < slotAspect) {
      // Foto más alta que slot → recortar arriba/abajo
      cropH = image.width / slotAspect;
      cropY = (image.height - cropH) / 2;
    }

    // M.3.b.UX.bug v2 — Lucy 2026-05-15: el clipping NO se hace acá sino a nivel
    // Content Layer (en el Stage de studio-slot, ver más abajo). Si lo hago acá
    // sobre el bounding box del image-placeholder (que tiene padding del stage),
    // el heart de clipping queda desfasado del edge stroke del overlay (que se
    // dibuja sobre stage completo). Resultado visible: franja blanca entre la
    // foto recortada y el contorno gris. La solución correcta es clipear TODO
    // el Content Layer al stage completo → ambos shapes coinciden exactos.
    return (
      <Group
        x={x + layer.width / 2}
        y={y + layer.height / 2}
        offsetX={layer.width / 2}
        offsetY={layer.height / 2}
        rotation={layer.rotation ?? 0}
      >
        <KonvaImage
          ref={(n) => {
            imageNodeRef.current = n;
          }}
          image={image}
          width={layer.width}
          height={layer.height}
          cornerRadius={layer.cornerRadius ?? 0}
          crop={{ x: cropX, y: cropY, width: cropW, height: cropH }}
          // M.3.b.B.3 — filters + params (no-op si sin filter)
          filters={filtersArray.length > 0 ? filtersArray : undefined}
          brightness={filterParams?.brightness ?? 0}
          contrast={filterParams?.contrast ?? 0}
          saturation={filterParams?.saturation ?? 0}
          hue={filterParams?.hue ?? 0}
        />
      </Group>
    );
  }

  // Placeholder cuando vacío o foto cargando
  return (
    <Rect
      x={x}
      y={y}
      width={layer.width}
      height={layer.height}
      fill="#F4ECFF"
      stroke="#7C6AAD"
      strokeWidth={2}
      dash={[12, 8]}
      cornerRadius={layer.cornerRadius ?? 0}
    />
  );
}
