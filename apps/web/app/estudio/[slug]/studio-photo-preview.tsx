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
import {
  renderLayer,
  nextWheelScale,
  WHITE_CARD_CHECKER,
  WHITE_CARD_CHECKER_SIZE,
  WHITE_CARD_TRAY_PAD,
} from "./studio-slot";
import { CalendarCardLayer } from "./studio-calendar-card-layer";
import {
  isDarkColor,
  isSimpleCardTemplate,
  isStripTemplate,
  stripPositionOf,
  isInstagramTemplate,
  cardBackgroundHex,
  isInstagramNoBorder,
  photoBackingHexFor,
} from "@/features/personalization/frame-palette";
import type { CanvasDataV1, SlotState } from "./types";
import type { CalendarLayoutKey } from "@/features/personalization/calendar-layout";
import type { CalendarFontKey } from "@/features/personalization/schemas";
import { useStudioTexts } from "./studio-texts-provider";

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
  calendarCard?: {
    year: number;
    monthIndex0: number;
    layout?: CalendarLayoutKey;
    /** Lucy 2026-09-07 — tipo de letra del título/mes (default "fredoka"). */
    font?: CalendarFontKey;
  } | null;
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
  const [viewportH, setViewportH] = useState(800);
  const texts = useStudioTexts();

  // Ancho fluido: el preview llena el ancho disponible del modal (tope 520px
  // en desktop; en móvil aprovecha todo el ancho para que el pellizco y el pan
  // sean más cómodos). También medimos el viewport para acotar el alto del preview
  // y evitar scroll en productos alargados.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerWidth(Math.min(520, el.clientWidth || 340));
      setViewportH(window.innerHeight || 800);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Ola 19/21 — el preview respeta la proporción real del producto, pero acota el alto
  // al espacio disponible del modal (~55 % del viewport, mín. 420 px) para que no aparezca
  // scroll en productos alargados y para que la edición sea maniobrable en móvil.
  const MAX_H = Math.max(420, Math.round(Math.min(620, viewportH * 0.55)));
  const aspect = unitTemplate.stage.height / unitTemplate.stage.width;
  let displayWidth = Math.max(220, containerWidth);
  let displayHeight = displayWidth * aspect;
  if (displayHeight > MAX_H) {
    displayHeight = MAX_H;
    displayWidth = Math.max(220, Math.round(displayHeight / aspect));
  }

  // ── Estilo de tarjeta — misma clasificación que StudioSlot (WYSIWYG) ──
  const hasFrameCard = useMemo(
    () => unitTemplate.layers.some((l) => l.type === "frame-card"),
    [unitTemplate],
  );
  const fullBleed = !!borderColor && frameFullBleed && !hasFrameCard;
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
  const cardBgHex = useMemo(
    // La regla vive en frame-palette.cardBackgroundHex (compartida con la grilla
    // y con el editor de texto, Ola 28) — misma clasificación de siempre.
    () => cardBackgroundHex({ layers: unitTemplate.layers, borderColor, frameFullBleed }),
    [unitTemplate, borderColor, frameFullBleed],
  );
  const darkCardBg = isDarkColor(cardBgHex);
  // Color de la capa background de la plantilla (blanco en todas las activas) — es el
  // "respaldo neutro" de la ventana de foto (la tarjeta SIN el tinte del borde).
  const bgLayerHex = useMemo(() => {
    const bgLayer = unitTemplate.layers.find((l) => l.type === "background") as
      { color?: string } | undefined;
    return bgLayer?.color ?? "#FFFFFF";
  }, [unitTemplate]);
  // Ola 16 — Instagram: detectar modo SIN BORDE por el rect del placeholder.
  const noBorder = useMemo(() => {
    if (!isIg) return false;
    const ph = unitTemplate.layers.find((l) => l.type === "image-placeholder") as
      { x?: number; y?: number; width?: number; height?: number } | undefined;
    return isInstagramNoBorder(ph, unitTemplate.stage);
  }, [unitTemplate, isIg]);
  // Ola 23/24 — respaldo neutro de la ventana de foto bajo zoom-out/pan (marco
  // constante): la DECISIÓN vive en photoBackingHexFor (frame-palette), compartida
  // con la grilla y con producción (WYSIWYG entre grilla, modal e imprenta).
  const photoBackingHex = photoBackingHexFor({
    borderColor,
    backgroundHex: bgLayerHex,
    hasFrameCard,
    fullBleed,
    isIg,
    igNoBorder: noBorder,
  });

  // Ola 25 (Lucy 2026-09-09) — tarjeta BLANCA dentro del modal (fondo blanco):
  // la MISMA bandeja cuadriculada gris/blanco del slot de la grilla (patrón
  // "transparencia") para que la Polaroid Clásica blanca se lea acá también.
  // Adorno 100% DOM/pantalla alrededor del Stage — nunca entra al snapshot.
  // Misma exclusión que en la grilla: modo tira (dibujaría costuras entre celdas).
  const whiteCardTray = cardBgHex.toUpperCase() === "#FFFFFF" && !isStrip;
  const stageWidth = whiteCardTray ? displayWidth - WHITE_CARD_TRAY_PAD * 2 : displayWidth;
  // Bug 2026-09-22 (mismo de la grilla): el inset fijo en px rompía el aspect en
  // tarjetas no cuadradas (alargados 1:3+) → banda de canvas muerta abajo. El
  // alto se deriva del ancho inset: el contenido llena el canvas y la bandeja
  // (que centra con flex) reparte el aire parejo arriba/abajo.
  const stageHeight = whiteCardTray ? stageWidth * aspect : displayHeight;
  const stageScale = stageWidth / unitTemplate.stage.width;

  // ── Gestos de zoom (rueda en desktop, pellizco en táctil) ──
  const clampScale = useCallback((s: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, s)), []);

  // Listener NATIVO con passive:false — el único camino de zoom por rueda.
  // Es el mismo patrón del slot: garantiza preventDefault incluso dentro del
  // Radix Dialog (sin esto la página/el modal scrollearía en vez de hacer zoom).
  // Ola 24 — paso fino compartido (nextWheelScale, ×1.04 por notch): zoom milimétrico.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheelNative(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const current = slotState.photoTransform?.scale ?? 1;
      const next = nextWheelScale(current, e.deltaY, SCALE_MIN, SCALE_MAX);
      if (Math.abs(next - current) > 0.001) {
        onTransformChange({ scale: next });
      }
    }
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [slotState.photoTransform?.scale, onTransformChange]);

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
      const sensitivity = 1.7;
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
    <div ref={containerRef} className="mx-auto w-full max-w-[520px]">
      <div
        className={[
          "ring-brand-purple/15 relative mx-auto overflow-hidden rounded-lg shadow-md ring-1",
          whiteCardTray ? "flex items-center justify-center" : "",
        ].join(" ")}
        style={{
          width: displayWidth,
          height: displayHeight,
          touchAction: "none",
          // Ola 25 — bandeja cuadriculada bajo la tarjeta BLANCA (adorno DOM de
          // pantalla; el Stage queda inset y centrado, como en la grilla).
          ...(whiteCardTray
            ? { backgroundImage: WHITE_CARD_CHECKER, backgroundSize: WHITE_CARD_CHECKER_SIZE }
            : {}),
        }}
      >
        <Stage
          width={stageWidth}
          height={stageHeight}
          scaleX={stageScale}
          scaleY={stageScale}
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
                layout={calendarCard.layout}
                calendarFont={calendarCard.font ?? "fredoka"}
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
                    noBorder,
                    stripPosition,
                    photoBackingHex,
                  },
                ),
              )
            )}
          </Layer>
        </Stage>
      </div>
      <p className="text-brand-muted mt-1.5 text-center text-[11px] leading-snug">
        {texts.texto.previewHint}
      </p>
    </div>
  );
}
