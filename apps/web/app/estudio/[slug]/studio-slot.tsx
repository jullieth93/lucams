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
import { Camera, Trash2, Wand2 } from "lucide-react";
import { Stage, Layer, Rect, Image as KonvaImage, Group, Text, Circle, Path } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import type { FilterFunction } from "konva/lib/Node";
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
  displaySize: number; // px lógicos del slot en pantalla
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
  onAssetDrop: (asset: StudioAsset) => void;
  onKeyboardNav: (direction: "up" | "down" | "left" | "right") => void;
  onRegisterStage?: (stage: Konva.Stage | null) => void;
};

function StudioSlotImpl({
  slotState,
  unitTemplate,
  displaySize,
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

  // Calculate scale to fit unitTemplate stage en displaySize
  const scale = displaySize / Math.max(unitTemplate.stage.width, unitTemplate.stage.height);

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
        width: displaySize,
        height: displaySize,
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
        width={displaySize}
        height={displaySize}
        scaleX={scale}
        scaleY={scale}
        ref={(s: Konva.Stage | null) => {
          stageRef.current = s;
        }}
        listening={false}
      >
        <RealismShadowLayer
          stage={unitTemplate.stage}
          shape={shape}
          cornerRadiusPx={cornerRadiusPx}
        />
        <Layer>
          {unitTemplate.layers.map((layer) => renderLayer(layer, slotState, unitTemplate.stage))}
        </Layer>
        <RealismOverlayLayer
          stage={unitTemplate.stage}
          shape={shape}
          finish={finish}
          cornerRadiusPx={cornerRadiusPx}
          showGuides={showRealismGuides}
        />
      </Stage>

      {/* A1.4 — Empty state premium: pulse + camera icon + dashed border interno */}
      <AnimatePresence>
        {!slotState.assetUrl && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="from-brand-cream/95 to-brand-cream/85 absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br backdrop-blur-[1px]"
            aria-hidden="true"
          >
            {/* Dashed border interno animado */}
            <div className="border-brand-purple/25 absolute inset-2 rounded-md border-2 border-dashed" />

            {/* Camera icon con bounce sutil */}
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="from-brand-purple/15 to-brand-pink/15 ring-brand-purple/10 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ring-1"
            >
              <Camera className="text-brand-purple h-5 w-5" />
            </motion.div>

            {/* Número grande del slot */}
            <span className="text-brand-purple mt-2 text-2xl leading-none font-bold tabular-nums">
              {slotState.slotIndex + 1}
            </span>

            {/* Hint contextual: cambia si está en drop-state */}
            <span
              className={[
                "mt-1 text-[10px] font-medium tracking-wide uppercase transition-colors",
                isDropping ? "text-brand-turquoise" : "text-brand-purple-dark/55",
              ].join(" ")}
            >
              {isDropping ? "Soltá la foto" : "Click o arrastrá"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* A1.5 — Filled hover premium: glassmorphism + acciones flotantes con stagger */}
      <AnimatePresence>
        {slotState.assetUrl && (
          <motion.div
            key="filled-actions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
          >
            {/* Glassmorphism overlay sutil cuando hover */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/15" />

            {/* Acciones flotantes top-right con stagger */}
            <motion.div
              initial={{ x: 8, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="pointer-events-auto absolute top-2 right-2 flex flex-col gap-1.5"
            >
              {onAdjust && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdjust();
                  }}
                  aria-label={`Ajustar foto del imán ${slotState.slotIndex + 1} (filtros)`}
                  title="Aplicar filtros a esta foto"
                  className="text-brand-purple ring-brand-purple/10 focus:ring-brand-turquoise flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md ring-1 backdrop-blur-sm hover:bg-white focus:ring-2 focus:outline-none"
                  tabIndex={-1}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                </motion.button>
              )}
              <motion.button
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                aria-label={`Quitar foto del imán ${slotState.slotIndex + 1}`}
                title="Quitar esta foto"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-700 shadow-md ring-1 ring-red-200 backdrop-blur-sm hover:bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                tabIndex={-1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Badge del slot cuando está lleno (número discreto esquina) */}
      {slotState.assetUrl && (
        <div className="bg-brand-purple/85 absolute top-1.5 left-1.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white">
          {slotState.slotIndex + 1}
        </div>
      )}

      {/* M.3.b.A2.5 — Badge tamaño físico (bottom-right) — evidencia el tamaño real del imán.
          Posición bottom-right para no chocar con el trash button (top-right) cuando slot está lleno. */}
      {sizeCm && (
        <div
          className="text-brand-purple-dark ring-brand-purple/10 pointer-events-none absolute right-1.5 bottom-1.5 rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-bold tracking-tight shadow-sm ring-1"
          aria-label={`Tamaño físico ${sizeCm}`}
        >
          📐 {sizeCm}
        </div>
      )}
    </motion.div>
  );
}

export const StudioSlot = memo(StudioSlotImpl, (prev, next) => {
  return (
    prev.slotState.slotIndex === next.slotState.slotIndex &&
    prev.slotState.assetUrl === next.slotState.assetUrl &&
    prev.slotState.assetId === next.slotState.assetId &&
    prev.slotState.filter === next.slotState.filter &&
    prev.isSelected === next.isSelected &&
    prev.displaySize === next.displaySize &&
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

function renderLayer(
  layer: CanvasLayer,
  slotState: SlotState,
  stage: { width: number; height: number },
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
    case "image-placeholder":
      return (
        <ImagePlaceholder
          key={layer.id}
          layer={layer as ImagePlaceholderLayer}
          slotState={slotState}
        />
      );
    case "text":
      return renderText(layer as never, stage);
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
  align?: "left" | "center" | "right";
};

function renderText(layer: TextLayerData, stage: { width: number; height: number }) {
  // Convención del seed: text usa x/y como CENTER. Para centrar visualmente:
  // - Render con width = stage.width y align (default center) → texto se alinea
  //   respecto a esa width.
  // - x = 0 (alineamos desde el inicio del stage horizontal).
  // - y = layer.y - fontSize/2 → centra verticalmente alrededor de layer.y.
  // Esto solo funciona si align==="center" (que es el default del seed).
  const fontSize = layer.fontSize ?? 48;
  const align = layer.align ?? "center";
  return (
    <Text
      key={layer.id}
      x={align === "center" ? 0 : layer.x}
      y={layer.y - fontSize / 2}
      width={align === "center" ? stage.width : undefined}
      text={layer.text}
      fontFamily={layer.fontFamily ?? "Fredoka, Inter, sans-serif"}
      fontSize={fontSize}
      fill={layer.fill ?? "#3D2E5C"}
      align={align}
    />
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
    // Konva.Filters typed como `Filter = FilterFunction | string`. En runtime
    // siempre son FilterFunction — cast explicito para satisfacer el TS strict.
    if (params.grayscale) f.push(Konva.Filters.Grayscale as FilterFunction);
    if (params.brightness !== 0) f.push(Konva.Filters.Brighten as FilterFunction);
    if (params.contrast !== 0) f.push(Konva.Filters.Contrast as FilterFunction);
    if (params.saturation !== 0 || params.hue !== 0) f.push(Konva.Filters.HSL as FilterFunction);
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
