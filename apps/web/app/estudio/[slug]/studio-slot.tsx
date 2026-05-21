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

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Wand2, RotateCcw } from "lucide-react";
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
import { analyzeSmartCrop, checkPhotoQuality } from "./lib/smart-crop";

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
  finish?: "matte" | "glossy" | "soft-touch" | "glass";
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
  /** M.3.b.UX.v9 — Aplicar transform parcial a la foto del slot.
   *  Acepta cualquier combinación de { offsetX, offsetY, scale }. Útil para:
   *    - drag → { offsetX, offsetY }
   *    - wheel/pinch zoom → { scale }
   *    - tap/dblclick reset → null (manejado por onCenterPhoto) */
  onPhotoTransformChange?: (
    transform: Partial<{ offsetX: number; offsetY: number; scale: number }>,
  ) => void;
  /** M.3.b.UX.v6 — Reset transform (centra foto + scale=1). Solo se muestra
   *  si la foto fue transformada (offset != 0 o scale != 1). */
  onCenterPhoto?: () => void;
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
  onPhotoTransformChange,
  onCenterPhoto,
  onAssetDrop,
  onKeyboardNav,
  onRegisterStage,
}: StudioSlotProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [isDropping, setIsDropping] = useState(false);
  // M.3.b.UX.v5 (Lucy 2026-05-15) — flag para evitar que el drag de la foto
  // dispare el picker modal al soltar el click. Cuando Konva detecta drag,
  // se setea wasDraggingPhoto=true; el click handler del wrapper div verifica
  // este flag y aborta si está activo. Se libera 100ms después del drag end
  // para que el mouseup nativo subsequente no dispare el click.
  // Usamos useState (no ref) por la regla `react-hooks/refs` de React 19:
  // refs no se pueden leer durante render; los closures de los handlers
  // capturaban el ref. State es seguro y el extra rerender por drag start/end
  // es aceptable (1 vez por drag).
  const [wasDraggingPhoto, setWasDraggingPhoto] = useState(false);

  // M.3.b.UX.v13 (Lucy 2026-05-15) — CSS clip-path para que el slot wrapper
  // SE VEA con el shape físico del imán (heart/circle/rect). useId genera
  // un ID único por slot para el SVG clipPath inline (objectBoundingBox 0-1
  // → escala automática al tamaño del wrapper).
  const heartClipId = useId();
  const slotClipPath =
    shape === "circle"
      ? "circle(50% at 50% 50%)"
      : shape === "heart"
        ? `url(#${heartClipId})`
        : undefined;

  // M.3.b.UX.v11 — Quality check de la foto al cargar.
  // El slot también carga la image (además del ImagePlaceholder interno) para
  // poder calcular quality vs sizeCm. Browser cachea — no impact performance.
  const [photoImage] = useImage(slotState.assetUrl ?? "", "anonymous");
  const photoQuality = useMemo(() => {
    if (!photoImage || !slotState.assetUrl) return null;
    return checkPhotoQuality(photoImage, sizeCm);
  }, [photoImage, slotState.assetUrl, sizeCm]);

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

  // ──────────── Photo drag flag (M.3.b.UX.v5) ────────────
  const handlePhotoDragStart = useCallback(() => {
    setWasDraggingPhoto(true);
  }, []);
  const handlePhotoDragEnd = useCallback(() => {
    // 100ms post-dragend para que el mouseup del browser que llegue al
    // wrapper NO dispare el picker. Konva drag termina con mouseup nativo.
    setTimeout(() => {
      setWasDraggingPhoto(false);
    }, 100);
  }, []);

  // ──────────── Photo zoom helpers (M.3.b.UX.v10) ────────────
  // Constantes compartidas entre wheel (desktop) y pinch (mobile).
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 3.0;
  const clampScale = useCallback((s: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, s)), []);

  // Pinch state — distance entre 2 touches al inicio + scale al inicio.
  const pinchInitialDistRef = useRef<number | null>(null);
  const pinchInitialScaleRef = useRef<number>(1);

  // Wheel handler: scroll up → zoom in, scroll down → zoom out.
  // Solo aplica si la foto ya está cargada (slotState.assetUrl).
  //
  // Lucy 2026-05-21 bug: tras aplicar un filtro (B&N, Vintage, etc.),
  // el wheel via Konva onWheel dejaba de prevenir el scroll de la
  // página. El node.cache() del filter probablemente interfería con
  // el dispatch del wheel event de Konva. Fix: bind native listener
  // directo al wrapper div con `{ passive: false }` para garantizar
  // que preventDefault() siempre funciona, sin importar el estado del
  // filter ni de Radix Dialog encima.
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      if (!slotState.assetUrl || !onPhotoTransformChange) return;
      e.evt.preventDefault();
      const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
      const current = slotState.photoTransform?.scale ?? 1;
      const next = clampScale(current * factor);
      if (Math.abs(next - current) > 0.001) {
        onPhotoTransformChange({ scale: next });
      }
    },
    [slotState.assetUrl, slotState.photoTransform?.scale, onPhotoTransformChange, clampScale],
  );

  // Native wheel listener — backup que SIEMPRE puede preventDefault
  // independiente del estado del cache de Konva o de Radix Dialog.
  // Patrón industria standard cuando React's passive synthetic events
  // no son confiables para preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !slotState.assetUrl || !onPhotoTransformChange) return;
    function onWheelNative(e: WheelEvent) {
      // Solo manejamos wheel sobre el slot (no sobre el modal de filtros
      // que está fuera del slot DOM tree).
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      const current = slotState.photoTransform?.scale ?? 1;
      const next = clampScale(current * factor);
      if (Math.abs(next - current) > 0.001) {
        onPhotoTransformChange?.({ scale: next });
      }
    }
    // passive: false es clave — sin esto, React/browser puede ignorar
    // preventDefault() y la página termina scrolleando.
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [slotState.assetUrl, slotState.photoTransform?.scale, onPhotoTransformChange, clampScale]);

  // Pinch handlers — usan touchstart/move/end del Stage Konva.
  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (!slotState.assetUrl || !onPhotoTransformChange) return;
      if (e.evt.touches.length === 2) {
        e.evt.preventDefault();
        const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        pinchInitialDistRef.current = Math.sqrt(dx * dx + dy * dy);
        pinchInitialScaleRef.current = slotState.photoTransform?.scale ?? 1;
      }
    },
    [slotState.assetUrl, slotState.photoTransform?.scale, onPhotoTransformChange],
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (!onPhotoTransformChange || pinchInitialDistRef.current === null) return;
      if (e.evt.touches.length !== 2) return;
      e.evt.preventDefault();
      const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / pinchInitialDistRef.current;
      const next = clampScale(pinchInitialScaleRef.current * ratio);
      onPhotoTransformChange({ scale: next });
    },
    [onPhotoTransformChange, clampScale],
  );

  const handleTouchEnd = useCallback(() => {
    pinchInitialDistRef.current = null;
  }, []);

  // Doble click/tap → reset transform (= centrar + scale 1).
  const handleDblClick = useCallback(() => {
    if (!slotState.assetUrl || !onCenterPhoto) return;
    onCenterPhoto();
  }, [slotState.assetUrl, onCenterPhoto]);

  // ──────────── ARIA label ────────────
  const ariaLabel = slotState.assetUrl
    ? `Imán ${slotState.slotIndex + 1} de ${totalSlots}, con foto cargada. Enter para cambiar foto, Delete para quitar.`
    : `Imán ${slotState.slotIndex + 1} de ${totalSlots}, vacío. Enter para subir foto.`;

  return (
    <div className="group/wrapper flex flex-col items-center gap-1.5">
      {/* M.3.b.UX.v13 — SVG clipPath inline para shape heart. objectBoundingBox
        (0-1 normalized) escala automáticamente al tamaño del slot. */}
      {shape === "heart" && (
        <svg width="0" height="0" aria-hidden style={{ position: "absolute", overflow: "hidden" }}>
          <defs>
            <clipPath id={heartClipId} clipPathUnits="objectBoundingBox">
              <path d="M0.5,0.82 C0.28,0.68 0.06,0.52 0.06,0.32 C0.06,0.18 0.16,0.08 0.28,0.08 C0.38,0.08 0.44,0.12 0.5,0.22 C0.56,0.12 0.62,0.08 0.72,0.08 C0.84,0.08 0.94,0.18 0.94,0.32 C0.94,0.52 0.72,0.68 0.5,0.82 Z" />
            </clipPath>
          </defs>
        </svg>
      )}
      <motion.div
        ref={containerRef}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-pressed={isSelected}
        onClick={(e: ReactMouseEvent) => {
          // M.3.b.UX.v5 (Lucy 2026-05-15) — si el cliente acaba de arrastrar
          // la foto, NO abrir el picker modal. El drag termina con un mouseup
          // nativo que el browser propaga al wrapper div y dispararía
          // onClick() inadvertidamente.
          if (wasDraggingPhoto) {
            e.preventDefault();
            return;
          }
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
          // M.3.b.UX.v13 — borderRadius solo aplica si shape rectangle.
          // Para heart/circle, el clipPath define la silueta y borderRadius
          // sería ignorado igualmente.
          borderRadius: slotClipPath ? 0 : 8,
          clipPath: slotClipPath,
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
          // text layers editables. M.3.b.UX.v4+: también si hay drag/zoom de foto.
          listening={!!onTextEdit || !!onPhotoTransformChange}
          // M.3.b.UX.v10 (Lucy 2026-05-15) — gestos de zoom:
          //   Desktop: wheel sobre la foto → zoom in/out
          //   Mobile:  pinch 2 dedos → zoom
          //   Both:    doble click/tap → reset (centrar + scale 100%)
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDblClick={handleDblClick}
          onDblTap={handleDblClick}
        >
          <RealismShadowLayer
            stage={unitTemplate.stage}
            shape={shape}
            cornerRadiusPx={cornerRadiusPx}
          />
          <Layer>
            {/* M.3.b.UX.v13 (Lucy 2026-05-15) — Layer único sin Group clipFunc.
              El CSS clip-path del wrapper HTML recorta visualmente al shape
              físico del imán (heart/circle/rect). La sombra Konva + edge stroke
              también respetan el shape via RealismShadowLayer/Overlay.
              Para products heart/circle el text layer del template NO se
              renderea (renderLayer "text" returns null). */}
            {unitTemplate.layers.map((layer) =>
              renderLayer(
                layer,
                slotState,
                unitTemplate.stage,
                onTextEdit,
                shape,
                onPhotoTransformChange,
                handlePhotoDragStart,
                handlePhotoDragEnd,
              ),
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

        {/* M.3.b.UX.v10 — chip de zoom visible cuando scale != 100% (foto fue
          modificada). Feedback al cliente de cuánto zoom tiene actualmente.
          Top-right del slot para no chocar con el badge slot # ni con action bar.
          Solo se muestra si fluctúa del default — si está en 100%, no estorba. */}
        {slotState.assetUrl &&
          slotState.photoTransform?.scale &&
          Math.abs(slotState.photoTransform.scale - 1) > 0.001 && (
            <div
              className="bg-brand-turquoise/90 absolute top-1.5 right-1.5 flex h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white shadow-sm"
              aria-label={`Zoom actual ${Math.round(slotState.photoTransform.scale * 100)}%`}
              title={`Zoom ${Math.round(slotState.photoTransform.scale * 100)}% — doble click resetea`}
            >
              {Math.round(slotState.photoTransform.scale * 100)}%
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

          {/* M.3.b.UX.v11 — Warning de calidad si la foto es de baja resolución
            para imprimir al tamaño físico. Detección automática al cargar foto
            (checkPhotoQuality calcula DPI efectivo a 300 DPI estándar imprenta). */}
          {photoQuality && !photoQuality.ok && (
            <span
              className={[
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1",
                photoQuality.severity === "error"
                  ? "bg-red-50 text-red-700 ring-red-200"
                  : "bg-amber-50 text-amber-800 ring-amber-200",
              ].join(" ")}
              aria-label={
                photoQuality.severity === "error"
                  ? "Foto demasiado chica para imprimir bien"
                  : "Foto al límite de resolución"
              }
              title={
                photoQuality.severity === "error"
                  ? `Esta foto (${photoQuality.actualPx?.w}×${photoQuality.actualPx?.h}px) se verá pixelada al imprimir a ${sizeCm} cm. Recomendado: ${photoQuality.requiredPx?.w}×${photoQuality.requiredPx?.h}px o más.`
                  : `Esta foto está al límite de resolución para ${sizeCm} cm. Puede verse OK, pero recomendamos ${photoQuality.requiredPx?.w}×${photoQuality.requiredPx?.h}px o más.`
              }
            >
              {photoQuality.severity === "error" ? "⚠" : "ⓘ"} calidad
            </span>
          )}

          {/* Acciones secundarias derecha — solo cuando slot lleno.
              M.3.b.UX.2 — Action buttons 50% más grandes (h-6 → h-8, icons h-3 → h-4)
              Tap target compliant Material/HIG con wrapper padding. */}
          {slotState.assetUrl && (
            <div className="ml-auto flex items-center gap-1.5">
              {/* M.3.b.UX.v6 — Botón Centrar: visible solo si transform aplicado.
                Resetea offsetX/Y a 0 + scale a 1 (cover overscan default). */}
              {onCenterPhoto && slotState.photoTransform && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCenterPhoto();
                  }}
                  aria-label={`Centrar la foto del imán ${slotState.slotIndex + 1}`}
                  title="Volver al centro y resetear zoom"
                  className="text-brand-purple-dark/70 ring-brand-purple/15 hover:bg-brand-purple/5 hover:text-brand-purple-dark focus:ring-brand-turquoise hover:ring-brand-purple/30 flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-sm ring-1 focus:ring-2 focus:outline-none"
                  tabIndex={-1}
                >
                  <RotateCcw className="h-4 w-4" />
                </motion.button>
              )}
              {onAdjust && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdjust();
                  }}
                  aria-label={`Ajustar foto del imán ${slotState.slotIndex + 1} (zoom y filtros)`}
                  title="Aplicar zoom y filtros a esta foto"
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
    prev.slotState.photoTransform === next.slotState.photoTransform &&
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
  onPhotoTransformChange?: (
    transform: Partial<{ offsetX: number; offsetY: number; scale: number }>,
  ) => void,
  onPhotoDragStart?: () => void,
  onPhotoDragEnd?: () => void,
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
      // M.3.b.UX.v13 (Lucy 2026-05-15) — Para products heart/circle, el image
      // cubre TODO el stage. El stage para products heart/circle es cuadrado
      // (definido en la plantilla / forzado al cargar). El Konva clipFunc
      // adicional ya no es necesario porque el slot wrapper HTML clipPath
      // recorta visualmente — pero lo mantenemos para que la sombra Konva
      // también respete el shape físico.
      const useFullStage = shape === "heart" || shape === "circle";
      const effectiveLayer = useFullStage
        ? ({
            ...(layer as ImagePlaceholderLayer),
            x: 0,
            y: 0,
            width: stage.width,
            height: stage.height,
            cornerRadius: 0,
          } as ImagePlaceholderLayer)
        : (layer as ImagePlaceholderLayer);
      return (
        <ImagePlaceholder
          key={layer.id}
          layer={effectiveLayer}
          slotState={slotState}
          onPhotoTransformChange={onPhotoTransformChange}
          onPhotoDragStart={onPhotoDragStart}
          onPhotoDragEnd={onPhotoDragEnd}
        />
      );
    }
    case "text": {
      // M.3.b.UX.v13 (Lucy 2026-05-15) — Para products heart/circle, el imán
      // físico ES esa silueta. No hay zona "abajo del corazón" donde imprimir
      // texto. Por lo tanto omitimos el render de text layers en heart/circle.
      // Si la plantilla tiene textos (como Polaroid Instagram), aplican solo
      // a products rectangulares.
      if (shape === "heart" || shape === "circle") return null;
      const textLayer = layer as TextLayerData;
      const override = slotState.textOverrides?.[textLayer.id];
      return renderText(textLayer, stage, override, onTextEdit, false);
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
  // M.3.b.UX.bug v4 — el texto se renderea ENCIMA de la foto cliente (shape
  // heart/circle). Aplica stroke blanco + shadow para legibilidad sobre
  // cualquier color de fondo.
  onPhoto: boolean = false,
) {
  // Combinar layer base + override del slot. Cada campo del override
  // sobrescribe el layer base si está definido.
  const finalText = override?.text ?? layer.text;
  const fontSize = override?.fontSize ?? layer.fontSize ?? 48;
  const fontFamily = override?.fontFamily ?? layer.fontFamily ?? "Fredoka, Inter, sans-serif";
  const fill = override?.fill ?? layer.fill ?? "#3D2E5C";
  const fontStyle = override?.fontWeight ?? layer.fontWeight;
  const align = layer.align ?? "center";

  // Styling adicional cuando el texto va sobre foto.
  const onPhotoStyling = onPhoto
    ? {
        stroke: "rgba(255, 255, 255, 0.92)",
        strokeWidth: Math.max(2, fontSize * 0.08),
        fillAfterStrokeEnabled: true,
        shadowColor: "rgba(0, 0, 0, 0.55)",
        shadowBlur: 6,
        shadowOffsetY: 2,
        shadowOpacity: 1,
      }
    : null;

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
      {...(onPhotoStyling ?? {})}
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

// M.3.b.UX.v5 (Lucy 2026-05-15) — `shape` del producto controla SOLO el clipping
// del área de foto, NO la silueta del producto físico. El producto físico es
// siempre rectangular (más cornerRadius si aplica) — patrón de la industria
// de imanes magnéticos. Por eso:
//   - El heart/circle clip se aplica en una zona CUADRADA centrada del stage
//     (para que el shape no quede estirado en aspect 3:4 del template).
//   - El texto editable queda fuera de este clipping → visible en el rectángulo
//     del producto, abajo del heart, donde se va a imprimir realmente.
//   - El background del template también queda fuera del clipping → llena el
//     rectángulo entero (= silueta del producto).
//
// Exportado para reuso en <StudioPreviewModal>.
export function makeShapeClipFunc(
  shape: "heart" | "circle",
  stageWidth: number,
  stageHeight: number,
): (ctx: Konva.Context) => void {
  // Bounding box CUADRADO centrado en el stage. El heart/circle se renderea
  // dentro de este cuadrado sin estirar. El cuadrado se coloca pegado al
  // borde superior con padding leve (8% del lado) — coincide con la zona de
  // foto que da espacio para texto abajo (≈25% inferior del stage).
  const size = Math.min(stageWidth, stageHeight) * 0.92;
  const offsetX = (stageWidth - size) / 2;
  const offsetY = stageHeight * 0.04; // pegado arriba con padding pequeño
  return (ctx) => {
    ctx.beginPath();
    if (shape === "heart") {
      const sx = size / 100;
      const sy = size / 100;
      ctx.moveTo(offsetX + 50 * sx, offsetY + 82 * sy);
      ctx.bezierCurveTo(
        offsetX + 28 * sx,
        offsetY + 68 * sy,
        offsetX + 6 * sx,
        offsetY + 52 * sy,
        offsetX + 6 * sx,
        offsetY + 32 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 6 * sx,
        offsetY + 18 * sy,
        offsetX + 16 * sx,
        offsetY + 8 * sy,
        offsetX + 28 * sx,
        offsetY + 8 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 38 * sx,
        offsetY + 8 * sy,
        offsetX + 44 * sx,
        offsetY + 12 * sy,
        offsetX + 50 * sx,
        offsetY + 22 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 56 * sx,
        offsetY + 12 * sy,
        offsetX + 62 * sx,
        offsetY + 8 * sy,
        offsetX + 72 * sx,
        offsetY + 8 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 84 * sx,
        offsetY + 8 * sy,
        offsetX + 94 * sx,
        offsetY + 18 * sy,
        offsetX + 94 * sx,
        offsetY + 32 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 94 * sx,
        offsetY + 52 * sy,
        offsetX + 72 * sx,
        offsetY + 68 * sy,
        offsetX + 50 * sx,
        offsetY + 82 * sy,
      );
    } else {
      // circle — radio = size/2 (cuadrado centrado)
      const r = size / 2;
      ctx.arc(offsetX + r, offsetY + r, r, 0, Math.PI * 2);
    }
    ctx.closePath();
  };
}

// Helper para que image-placeholder y otras zonas que dependen del bounding
// box del heart/circle conozcan dónde está exactamente.
export function getShapeBoundingBox(
  stageWidth: number,
  stageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const size = Math.min(stageWidth, stageHeight) * 0.92;
  return {
    x: (stageWidth - size) / 2,
    y: stageHeight * 0.04,
    width: size,
    height: size,
  };
}

function ImagePlaceholder({
  layer,
  slotState,
  onPhotoTransformChange,
  onPhotoDragStart,
  onPhotoDragEnd,
}: {
  layer: ImagePlaceholderLayer;
  slotState: SlotState;
  /** M.3.b.UX.v9+ — callback parcial: drag manda offsetX/Y, zoom manda scale.
   * `undefined` = drag deshabilitado (modo vista previa). */
  onPhotoTransformChange?: (
    transform: Partial<{ offsetX: number; offsetY: number; scale: number }>,
  ) => void;
  /** M.3.b.UX.v5 — callbacks para que el wrapper sepa si el cliente está/estuvo
   * arrastrando la foto, y aborte el picker modal en ese caso. */
  onPhotoDragStart?: () => void;
  onPhotoDragEnd?: () => void;
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

  // M.3.b.B.3 — Konva filters requieren image.cache() para aplicarse.
  //
  // Lucy 2026-05-21 round 4 — bug: tras aplicar filtro, el zoom dejaba de
  // funcionar visualmente. Causa: node.cache() captura el bitmap al tamaño
  // CURRENT del node. Al cambiar `width`/`height` por scroll-zoom, el cache
  // queda fijo y la imagen no re-renderea al nuevo tamaño con el filter.
  // Fix: re-cache también cuando cambian las dimensiones renderizadas
  // (renderedW/H se calculan de photoTransform.scale + filtersArray).
  useEffect(() => {
    const node = imageNodeRef.current;
    if (!node || !image) return;
    if (filtersArray.length > 0) {
      // pixelRatio 2 = bitmap a 2x del tamaño visible (calidad nítida sin
      // que el cache sea desproporcionado en memoria).
      node.cache({ pixelRatio: 2 });
      node.getLayer()?.batchDraw();
    } else {
      node.clearCache();
      node.getLayer()?.batchDraw();
    }
  }, [image, filtersArray.length, slotState.filter, slotState.photoTransform?.scale]);

  // M.3.b.UX.v11 (Lucy 2026-05-15) — Smart auto-crop al cargar foto NUEVA.
  // Solo aplica si:
  //   1. Imagen cargada
  //   2. NO hay photoTransform persistido (foto recién subida, no editada)
  //   3. Hay callback para persistir el offset
  //
  // El algoritmo usa smartcrop.js (heurística contraste + saturación + bordes,
  // similar a Cloudinary / Apple Photos) para detectar el área más interesante
  // de la foto y centrar esa zona en el slot. Si el cliente carga una foto
  // familiar con caras descentradas a la derecha, el smart crop moverá la foto
  // a la izquierda para centrar las caras en el corazón/círculo/etc.
  //
  // El cliente puede sobreescribir manualmente con drag/zoom igual que antes.
  // La sugerencia es solo el punto inicial, no permanente.
  useEffect(() => {
    if (!image || !onPhotoTransformChange) return;
    if (slotState.photoTransform) return; // ya editada, no auto-aplicar
    const coverScale = Math.max(
      layer.width / image.naturalWidth,
      layer.height / image.naturalHeight,
    );
    let cancelled = false;
    analyzeSmartCrop(image, layer.width, layer.height, coverScale).then((result) => {
      if (cancelled || !result) return;
      // Solo aplicar si el offset es significativo (>5% del slot). Si el centro
      // de la imagen ya está bien encuadrado, no molestar.
      const minOffset = Math.min(layer.width, layer.height) * 0.05;
      if (Math.abs(result.offsetX) < minOffset && Math.abs(result.offsetY) < minOffset) return;
      onPhotoTransformChange({ offsetX: result.offsetX, offsetY: result.offsetY });
    });
    return () => {
      cancelled = true;
    };
  }, [image, slotState.photoTransform, onPhotoTransformChange, layer.width, layer.height]);

  if (slotState.assetUrl && image) {
    // M.3.b.UX.v9 (Lucy 2026-05-15) — Approach industria-estándar (Mixbook, Canva,
    // Vistaprint). Después de iteraciones v6-v8 con overscan automático invisible,
    // Lucy señaló correctamente que esos approaches "macheteaban" la solución.
    //
    // Approach correcto:
    //   1. Default scale = cover EXACTO sin overscan invisible. Cliente ve cover
    //      por default, sin sorpresas.
    //   2. Slider zoom AMPLIO (50%-300%) en el modal. Cliente DECIDE el zoom:
    //      - 50%: foto más chica que slot, padding visible. Útil para encuadrar
    //        toda la foto sin recorte.
    //      - 100%: cover exacto (default).
    //      - 200-300%: zoom-in fuerte para acercar a un detalle.
    //   3. Drag SIN bounds: el cliente puede mover la foto libremente. Sin
    //      limitaciones artificiales. Si la mueve fuera, ve el background y
    //      entiende.
    //   4. Warning visual sutil si la foto no cubre el slot completo.
    //
    // Es lo que hacen los editores reales. Modular, transparente, sin algoritmos
    // ocultos que limiten al cliente.

    const coverScaleBase = Math.max(layer.width / image.width, layer.height / image.height);
    const userScale = slotState.photoTransform?.scale ?? 1;
    // Permite zoom-out hasta 0.5 (foto 50% del cover). Floor para evitar
    // tamaños absurdos (foto < 10% del slot).
    const effectiveScale = Math.max(0.5, Math.min(3, userScale));
    const finalScale = coverScaleBase * effectiveScale;

    const renderedW = image.width * finalScale;
    const renderedH = image.height * finalScale;

    // v9 — offset directo del transform persistido. Sin clamping artificial.
    const photoOffset = slotState.photoTransform
      ? { x: slotState.photoTransform.offsetX, y: slotState.photoTransform.offsetY }
      : { x: 0, y: 0 };

    const isDraggable = !!onPhotoTransformChange;

    // Clip del Group local: rounded rect cuando cornerRadius, rect plano resto.
    // Para heart/circle no hace falta acá porque el Layer-level clipFunc del
    // Stage ya recorta a la silueta (este Group queda dentro del heart).
    const cornerR = layer.cornerRadius ?? 0;
    const groupClipFunc =
      cornerR > 0
        ? (ctx: Konva.Context) => {
            ctx.beginPath();
            const r = Math.min(cornerR, layer.width / 2, layer.height / 2);
            ctx.moveTo(r, 0);
            ctx.lineTo(layer.width - r, 0);
            ctx.quadraticCurveTo(layer.width, 0, layer.width, r);
            ctx.lineTo(layer.width, layer.height - r);
            ctx.quadraticCurveTo(layer.width, layer.height, layer.width - r, layer.height);
            ctx.lineTo(r, layer.height);
            ctx.quadraticCurveTo(0, layer.height, 0, layer.height - r);
            ctx.lineTo(0, r);
            ctx.quadraticCurveTo(0, 0, r, 0);
            ctx.closePath();
          }
        : undefined;

    return (
      <Group
        x={x + layer.width / 2}
        y={y + layer.height / 2}
        offsetX={layer.width / 2}
        offsetY={layer.height / 2}
        rotation={layer.rotation ?? 0}
        {...(groupClipFunc
          ? { clipFunc: groupClipFunc }
          : { clip: { x: 0, y: 0, width: layer.width, height: layer.height } })}
      >
        <KonvaImage
          ref={(n) => {
            imageNodeRef.current = n;
          }}
          image={image}
          width={renderedW}
          height={renderedH}
          x={layer.width / 2 + photoOffset.x}
          y={layer.height / 2 + photoOffset.y}
          offsetX={renderedW / 2}
          offsetY={renderedH / 2}
          draggable={isDraggable}
          // M.3.b.UX.v9 — drag SIN bounds (libre). El cliente decide dónde
          // poner la foto. Si la mueve fuera del slot, ve el background (warning
          // visible). Patrón industria: Mixbook, Canva, Vistaprint.
          onDragStart={() => {
            if (onPhotoDragStart) onPhotoDragStart();
          }}
          onDragEnd={(e) => {
            if (!onPhotoTransformChange) return;
            onPhotoTransformChange({
              offsetX: e.target.x() - layer.width / 2,
              offsetY: e.target.y() - layer.height / 2,
            });
            if (onPhotoDragEnd) onPhotoDragEnd();
          }}
          onMouseEnter={(e) => {
            if (isDraggable) {
              const s = e.target.getStage();
              if (s) s.container().style.cursor = "grab";
            }
          }}
          onMouseLeave={(e) => {
            if (isDraggable) {
              const s = e.target.getStage();
              if (s) s.container().style.cursor = "";
            }
          }}
          onMouseDown={(e) => {
            if (isDraggable) {
              const s = e.target.getStage();
              if (s) s.container().style.cursor = "grabbing";
            }
          }}
          onMouseUp={(e) => {
            if (isDraggable) {
              const s = e.target.getStage();
              if (s) s.container().style.cursor = "grab";
            }
          }}
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
