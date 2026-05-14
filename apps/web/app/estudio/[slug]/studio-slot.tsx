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

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { Stage, Layer, Rect, Image as KonvaImage, Group, Text } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type {
  CanvasDataV1,
  CanvasLayer,
  ImagePlaceholderLayer,
  SlotState,
  StudioAsset,
} from "./types";

const FOCUS_RING = "0 0 0 3px rgb(93 217 209)"; // brand-turquoise

type StudioSlotProps = {
  slotState: SlotState;
  unitTemplate: CanvasDataV1;
  displaySize: number; // px lógicos del slot en pantalla
  isSelected: boolean;
  totalSlots: number;
  onClick: () => void;
  onClear: () => void;
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
  onClick,
  onClear,
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
      {/* Konva Stage — render del unit template + asset si está lleno */}
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
        <Layer>
          {unitTemplate.layers.map((layer) => renderLayer(layer, slotState, unitTemplate.stage))}
        </Layer>
      </Stage>

      {/* Overlay placeholder cuando slot está vacío */}
      {!slotState.assetUrl && (
        <div
          className="bg-brand-cream/85 absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <div className="bg-brand-purple/15 flex h-10 w-10 items-center justify-center rounded-full">
            <Plus className="text-brand-purple h-5 w-5" />
          </div>
          <span className="text-brand-purple mt-2 text-2xl font-bold">
            {slotState.slotIndex + 1}
          </span>
          <span className="text-brand-purple-dark/60 mt-1 text-xs">Click para subir</span>
        </div>
      )}

      {/* Botón quitar foto cuando slot está lleno */}
      {slotState.assetUrl && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label={`Quitar foto del imán ${slotState.slotIndex + 1}`}
          className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-red-700 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-white focus:opacity-100 focus:ring-2 focus:ring-red-500 focus:outline-none"
          tabIndex={-1}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Badge del slot cuando está lleno (número discreto esquina) */}
      {slotState.assetUrl && (
        <div className="bg-brand-purple/85 absolute top-1.5 left-1.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white">
          {slotState.slotIndex + 1}
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
    prev.isSelected === next.isSelected &&
    prev.displaySize === next.displaySize &&
    prev.unitTemplate === next.unitTemplate
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
    default:
      return null;
  }
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

function renderShape(layer: ShapeLayerData) {
  const cornerRadius =
    layer.kind === "circle" ? Math.min(layer.width, layer.height) / 2 : (layer.cornerRadius ?? 0);
  // Convención del seed: shapes usan x/y como CENTER (heart-frame, ring, etc.).
  // Konva Rect espera top-left, así que restamos width/2 y height/2.
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
      cornerRadius={cornerRadius}
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
  // Convención del seed (verificada): image-placeholder usa x/y como TOP-LEFT
  // del slot (esquina superior izquierda). Ej. polaroid-clasico tiene
  // x=60, y=60, width=600, height=700 sobre stage 720x920 → slot va de
  // (60,60) a (660,760). NO restar width/2 ni height/2.
  const x = layer.x;
  const y = layer.y;

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
          image={image}
          width={layer.width}
          height={layer.height}
          cornerRadius={layer.cornerRadius ?? 0}
          crop={{ x: cropX, y: cropY, width: cropW, height: cropH }}
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
