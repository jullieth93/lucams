"use client";

/*
 * StudioPhotoPreview — Ola 9 (2026-07-24).
 *
 * Preview INTERACTIVO de la foto dentro de la pestaña Foto del modal unificado
 * de edición (`StudioSlotEditModal`). Reutiliza `renderLayer` de StudioSlot,
 * así que lo que se ve acá es EXACTAMENTE lo mismo que el slot de la grilla
 * (misma plantilla, marco, textos y filtros — WYSIWYG).
 *
 * Nació con la eliminación del slider de zoom (Lucy 2026-07-24: "lo ideal es
 * que no exista"): el zoom/encuadre se hace con gestos DIRECTOS sobre la foto —
 *   · Desktop: rueda del mouse = zoom, arrastre = pan.
 *   · Táctil:  pellizco = zoom, 1 dedo = pan (la grilla NO captura estos gestos
 *             para no bloquear el scroll de la página; este preview sí, porque
 *             vive dentro del modal a pantalla casi completa).
 *   · Doble click/tap = reset (centrar + zoom 100%).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer } from "react-konva";
import type Konva from "konva";
import { renderLayer } from "./studio-slot";
import { CalendarCardLayer } from "./studio-calendar-card-layer";
import {
  isDarkColor,
  isSimpleCardTemplate,
  isStripTemplate,
  stripPositionOf,
  isInstagramTemplate,
  instagramBackgroundHex,
} from "@/features/personalization/frame-palette";
import type { CanvasDataV1, SlotState } from "./types";

type PhotoTransformPartial = Partial<{ offsetX: number; offsetY: number; scale: number }>;

export type StudioPhotoPreviewProps = {
  /** Plantilla de la unidad (stage + layers) — la misma que usa la grilla. */
  unitTemplate: CanvasDataV1;
  /** Estado sintético del slot con los valores ACTUALES (foto, filtro, transform, textos). */
  slotState: SlotState;
  totalSlots: number;
  borderColor?: string | null;
  allowText?: boolean;
  frameFullBleed?: boolean;
  /** Calendarios: compone la tarjeta del mes (mismo dibujo que producción). */
  calendarCard?: { year: number; monthIndex0: number } | null;
  onTransformChange: (transform: PhotoTransformPartial) => void;
  /** Doble click/tap: vuelve la foto al centro con zoom 100%. */
  onResetTransform: () => void;
};

const SCALE_MIN = 0.5;
const SCALE_MAX = 3.0;

export function StudioPhotoPreview({
  unitTemplate,
  slotState,
  totalSlots,
  borderColor = null,
  allowText = false,
  frameFullBleed = false,
  calendarCard = null,
  onTransformChange,
  onResetTransform,
}: StudioPhotoPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(340);

  // Ancho fluido: el preview llena el ancho disponible del modal (tope 420px
  // para que en desktop no se desborde y en móvil se aproveche mejor la pantalla).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(Math.min(420, el.clientWidth || 340));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspect = unitTemplate.stage.height / unitTemplate.stage.width;
  const displayWidth = Math.max(200, containerWidth);
  const displayHeight = displayWidth * aspect;
  const scale = displayWidth / unitTemplate.stage.width;

  // ── Estilo de tarjeta — misma clasificación que StudioSlot (WYSIWYG) ──
  const hasFrameCard = useMemo(
    () => unitTemplate.layers.some((l) => l.type === "frame-card"),
    [unitTemplate],
  );
  const fullBleed =
    !!borderColor && frameFullBleed && !hasFrameCard;
  const isIg = useMemo(() => isInstagramTemplate(unitTemplate.layers), [unitTemplate]);
  const simpleCard = useMemo(
    () =>
      isSimpleCardTemplate(unitTemplate.layers, {
        hasFrameCard,
        textIsVisible: allowText && unitTemplate.layers.some((l) => l.type === "text"),
      }),
    [unitTemplate, hasFrameCard, allowText],
  );
  const isStrip = useMemo(
    () => isStripTemplate(unitTemplate as { gridCols?: unknown; gridGap?: unknown }),
    [unitTemplate],
  );
  const stripPosition = isStrip ? stripPositionOf(slotState.slotIndex, totalSlots) : null;
  const cardBgHex = useMemo(() => {
    const bgLayer = unitTemplate.layers.find((l) => l.type === "background") as
      | { color?: string }
      | undefined;
    const bgHex = bgLayer?.color ?? "#FFFFFF";
    const fcLayer = unitTemplate.layers.find((l) => l.type === "frame-card") as
      | { fill?: string }
      | undefined;
    if (isIg) return instagramBackgroundHex(borderColor ?? null, bgHex);
    if (fullBleed && borderColor) return borderColor;
    if (hasFrameCard) return borderColor ?? fcLayer?.fill ?? "#FFFFFF";
    return bgHex;
  }, [unitTemplate, isIg, fullBleed, borderColor, hasFrameCard]);
  const darkCardBg = isDarkColor(cardBgHex);

  // ── Gestos de zoom (rueda en desktop, pellizco en táctil) ──
  const clampScale = useCallback(
    (s: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, s)),
    [],
  );

  // Listener NATIVO con passive:false — el único camino de zoom por rueda.
  // Es el mismo patrón del slot: garantiza preventDefault incluso dentro del
  // Radix Dialog (sin esto la página/el modal scrollearía en vez de hacer zoom).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheelNative(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      const current = slotState.photoTransform?.scale ?? 1;
      const next = clampScale(current * factor);
      if (Math.abs(next - current) > 0.001) {
        onTransformChange({ scale: next });
      }
    }
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [slotState.photoTransform?.scale, onTransformChange, clampScale]);

  // Pinch — distancia entre 2 dedos al inicio + scale al inicio (misma curva
  // suavizada del slot, Ola 6). Al caer el 2º dedo se corta cualquier drag
  // activo para que pan y zoom no peleen.
  const pinchInitialDistRef = useRef<number | null>(null);
  const pinchInitialScaleRef = useRef<number>(1);

  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (e.evt.touches.length === 2) {
        e.evt.preventDefault();
        const stageNode = e.target.getStage();
        stageNode?.find("Image").forEach((n) => {
          if (n.isDragging()) n.stopDrag();
        });
        const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        pinchInitialDistRef.current = Math.sqrt(dx * dx + dy * dy);
        pinchInitialScaleRef.current = slotState.photoTransform?.scale ?? 1;
      }
    },
    [slotState.photoTransform?.scale],
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (pinchInitialDistRef.current === null || pinchInitialDistRef.current <= 0) return;
      if (e.evt.touches.length !== 2) return;
      e.evt.preventDefault();
      const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const rawRatio = dist / pinchInitialDistRef.current;
      // Ola 15 — pinch más sensible en móvil: amplificamos la curva para que
      // el gesto se sienta inmediato, sin tener que estirar mucho los dedos.
      const sensitivity = 1.35;
      const adjustedRatio = 1 + (rawRatio - 1) * sensitivity;
      onTransformChange({ scale: clampScale(pinchInitialScaleRef.current * adjustedRatio) });
    },
    [onTransformChange, clampScale],
  );

  const handleTouchEnd = useCallback(() => {
    pinchInitialDistRef.current = null;
  }, []);

  const handleDblClick = useCallback(() => {
    onResetTransform();
  }, [onResetTransform]);

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-[420px]">
      <div
        className="ring-brand-purple/15 relative overflow-hidden rounded-lg shadow-md ring-1"
        style={{ width: displayWidth, height: displayHeight, touchAction: "none" }}
      >
        <Stage
          width={displayWidth}
          height={displayHeight}
          scaleX={scale}
          scaleY={scale}
          listening
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDblClick={handleDblClick}
          onDblTap={handleDblClick}
        >
          <Layer name="content">
            {calendarCard ? (
              <CalendarCardLayer
                assetUrl={slotState.assetUrl}
                photoTransform={slotState.photoTransform ?? null}
                year={calendarCard.year}
                monthIndex0={calendarCard.monthIndex0}
                templateStageWidth={unitTemplate.stage.width}
                stageWidth={unitTemplate.stage.width}
                stageHeight={unitTemplate.stage.height}
                onPhotoTransformChange={onTransformChange}
              />
            ) : (
              unitTemplate.layers.map((layer) =>
                renderLayer(
                  layer,
                  slotState,
                  unitTemplate.stage,
                  undefined, // textos no editables acá — eso vive en la pestaña Texto
                  undefined, // shape rectangle (el preview es la tarjeta completa)
                  onTransformChange,
                  undefined,
                  undefined,
                  true, // siempre interactivo: es el lugar designado para los gestos
                  {
                    borderColor: borderColor ?? null,
                    allowText,
                    hasFrameCard,
                    fullBleed,
                    cardBgHex,
                    darkCardBg,
                    simpleCard,
                    isIg,
                    frameFullBleed,
                    stripPosition,
                  },
                ),
              )
            )}
          </Layer>
        </Stage>
      </div>
      <p className="text-brand-muted mt-1.5 text-center text-[11px] leading-snug">
        Arrastra la foto para encuadrar · Rueda del mouse o pellizco para zoom · Doble toque para
        centrar
      </p>
    </div>
  );
}
