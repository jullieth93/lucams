"use client";

/*
 * CalendarCardLayer — la TARJETA COMPUESTA del mes dentro de un slot del Estudio
 * (feedback Lucy 2026-07-23: "cada celda de mes muestra solo la foto a sangre, sin
 * calendario" — el valor agregado es ver la tarjeta: foto + "ENE 2027" + grilla).
 *
 * El dibujo es el MISMO `drawCalendarPage` que producción (production-render-canvas) y
 * el preview de confirmación/3D (compose-calendar-page) → WYSIWYG total. Se dibuja en un
 * canvas offscreen a resolución reducida (0.5× = 540×720) y se usa como fuente de un
 * Konva.Image: la grilla completa de 12 tarjetas cuesta ~12 redraws de <3ms, así que se
 * RE-RENDERIZA EN VIVO ante cada cambio (foto, encuadre, año) sin debounce — decisión
 * documentada en el README del estudio (§ Ola 4).
 *
 * Interacción: la imagen compuesta es draggable, pero el marco NO se mueve:
 * el delta del drag se aplica EN VIVO al encuadre de la foto dentro de su
 * franja (estado local por gesto) y se comitea a photoTransform al soltar
 * (dragEnd) — antes el nodo de la tarjeta completa flotaba durante el drag y
 * "volvía" al soltar, lo que se percibía como roto (Lucy 2026-08-07). Zoom
 * (wheel/pinch) lo captura el Stage del slot como siempre. El smart-crop
 * inicial de fotos nuevas también se conserva (misma heurística que
 * ImagePlaceholder).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import { drawCalendarPage } from "@/features/personalization/calendar-draw";
import {
  CALENDAR_PAGE,
  CALENDAR_PHOTO,
  scalePhotoTransformToPage,
} from "@/features/personalization/calendar-layout";
import { ensureBrandCanvasFontsLoaded, type BrandCanvasFonts } from "./lib/calendar-card-preview";
import { analyzeSmartCrop } from "./lib/smart-crop";

/** Resolución del canvas offscreen: 0.5× de la página 1080×1440 → 540×720.
 *  Nítido a los tamaños reales de slot (≤ ~350px en desktop) y liviano: 12 tarjetas
 *  ≈ 18MB de bitmap en el peor caso. */
const RENDER_SCALE = 0.5;

type PhotoTransform = { offsetX: number; offsetY: number; scale: number };

export function CalendarCardLayer({
  assetUrl,
  photoTransform,
  year,
  monthIndex0,
  /** Ancho del stage de la plantilla (600): los offsets del transform viven en esas unidades. */
  templateStageWidth,
  /** Dimensiones del stage Konva donde se dibuja la tarjeta (600×800 en la plantilla actual). */
  stageWidth,
  stageHeight,
  onPhotoTransformChange,
  onPhotoDragStart,
  onPhotoDragEnd,
}: {
  assetUrl?: string | null;
  photoTransform?: PhotoTransform | null;
  year: number;
  monthIndex0: number;
  templateStageWidth: number;
  stageWidth: number;
  stageHeight: number;
  onPhotoTransformChange?: (
    transform: Partial<{ offsetX: number; offsetY: number; scale: number }>,
  ) => void;
  onPhotoDragStart?: () => void;
  onPhotoDragEnd?: () => void;
}) {
  const [photo] = useImage(assetUrl ?? "", "anonymous");
  const imageNodeRef = useRef<Konva.Image | null>(null);
  const [brandFonts, setBrandFonts] = useState<BrandCanvasFonts | null>(null);
  // Pan en vivo durante el drag (Lucy 2026-08-07): antes el NODO de la tarjeta
  // completa (foto+calendario+marco) flotaba con el cursor y al soltar "volvía"
  // — se veía roto. Ahora el marco queda quieto y la foto se re-encuadra en
  // vivo: el delta del drag vive en estado LOCAL mientras dura el gesto y solo
  // se comitea al store en dragEnd (el undo stack no se inunda).
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);
  // Espejo síncrono del delta (el state puede ir un frame atrás al dragEnd).
  const dragDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const liveTransform = useMemo(
    () =>
      dragDelta
        ? {
            offsetX: (photoTransform?.offsetX ?? 0) + dragDelta.x,
            offsetY: (photoTransform?.offsetY ?? 0) + dragDelta.y,
            scale: photoTransform?.scale ?? 1,
          }
        : (photoTransform ?? null),
    [dragDelta, photoTransform],
  );

  // Canvas offscreen estable (la identidad del elemento NO cambia entre renders —
  // Konva solo necesita batchDraw tras cada repintado).
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = Math.round(CALENDAR_PAGE.width * RENDER_SCALE);
    c.height = Math.round(CALENDAR_PAGE.height * RENDER_SCALE);
    return c;
  }, []);

  // Fuentes de marca reales (next/font hashea los nombres) — una vez; al resolver, repintar.
  useEffect(() => {
    let cancelled = false;
    void ensureBrandCanvasFontsLoaded().then((f) => {
      if (!cancelled) setBrandFonts(f);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ventana de foto en unidades del stage de la plantilla (para el smart-crop inicial,
  // misma matemática que ImagePlaceholder: la franja 4:3 top, espejo de CALENDAR_PHOTO).
  const photoWindowStage = useMemo(() => {
    const f = templateStageWidth / CALENDAR_PAGE.width;
    return { width: CALENDAR_PHOTO.width * f, height: CALENDAR_PHOTO.height * f };
  }, [templateStageWidth]);

  // Repintado en vivo: foto, encuadre, año/mes o fuentes → redraw + batchDraw.
  // Sin debounce: ~50 ops vectoriales + 1 drawImage a 540×720 (<3ms por tarjeta).
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    drawCalendarPage(ctx, {
      photo: photo ?? null,
      photoTransform: scalePhotoTransformToPage(liveTransform, templateStageWidth),
      year,
      monthIndex0,
      fontsOk: true,
      fonts: brandFonts ?? undefined,
    });
    imageNodeRef.current?.getLayer()?.batchDraw();
  }, [canvas, photo, liveTransform, year, monthIndex0, brandFonts, templateStageWidth]);

  // Smart auto-crop inicial (paridad con ImagePlaceholder): solo foto NUEVA sin encuadre
  // persistido, y solo si el offset sugerido es significativo (>5% de la ventana).
  useEffect(() => {
    if (!photo || !onPhotoTransformChange) return;
    if (photoTransform) return;
    const pw = photoWindowStage;
    const coverScale = Math.max(pw.width / photo.naturalWidth, pw.height / photo.naturalHeight);
    let cancelled = false;
    analyzeSmartCrop(photo, pw.width, pw.height, coverScale).then((result) => {
      if (cancelled || !result) return;
      const minOffset = Math.min(pw.width, pw.height) * 0.05;
      if (Math.abs(result.offsetX) < minOffset && Math.abs(result.offsetY) < minOffset) return;
      onPhotoTransformChange({ offsetX: result.offsetX, offsetY: result.offsetY });
    });
    return () => {
      cancelled = true;
    };
  }, [photo, photoTransform, onPhotoTransformChange, photoWindowStage]);

  const isDraggable = !!onPhotoTransformChange && !!photo;

  return (
    <KonvaImage
      ref={(n) => {
        imageNodeRef.current = n;
      }}
      image={canvas}
      x={0}
      y={0}
      width={stageWidth}
      height={stageHeight}
      draggable={isDraggable}
      // Igual que ImagePlaceholder: sin gestos inline (grilla táctil) no hay nada que
      // proteger → preventDefault={false} y el dedo scrollea la página (pan-y).
      preventDefault={isDraggable}
      onDragStart={() => {
        dragDeltaRef.current = { x: 0, y: 0 };
        setDragDelta({ x: 0, y: 0 });
        if (onPhotoDragStart) onPhotoDragStart();
      }}
      onDragMove={(e) => {
        if (!onPhotoTransformChange) return;
        const node = e.target;
        // Konva reasigna la posición del nodo en cada move (absoluta desde el
        // inicio del gesto), así que node.x/y ES el delta total — lo pasamos al
        // estado local y devolvemos el nodo al origen: el marco nunca se mueve.
        dragDeltaRef.current = { x: node.x(), y: node.y() };
        setDragDelta(dragDeltaRef.current);
        node.position({ x: 0, y: 0 });
      }}
      onDragEnd={(e) => {
        if (!onPhotoTransformChange) return;
        // Commit al store: transform base + el delta ACUMULADO del gesto (el
        // ref, no node.x/y — ese quedó reseteado por el pan en vivo).
        const d = dragDeltaRef.current;
        e.target.position({ x: 0, y: 0 });
        if (d.x !== 0 || d.y !== 0) {
          onPhotoTransformChange({
            offsetX: (photoTransform?.offsetX ?? 0) + d.x,
            offsetY: (photoTransform?.offsetY ?? 0) + d.y,
          });
        }
        setDragDelta(null);
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
    />
  );
}
