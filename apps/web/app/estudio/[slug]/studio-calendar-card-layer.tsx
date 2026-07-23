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
 * Interacción: la imagen compuesta es draggable → el delta del drag se ACUMULA en
 * photoTransform (pan de la foto dentro de su franja), igual que el ImagePlaceholder
 * genérico. Zoom (wheel/pinch) lo captura el Stage del slot como siempre. El smart-crop
 * inicial de fotos nuevas también se conserva (misma heurística que ImagePlaceholder).
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
import {
  ensureBrandCanvasFontsLoaded,
  type BrandCanvasFonts,
} from "./lib/calendar-card-preview";
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
      photoTransform: scalePhotoTransformToPage(photoTransform, templateStageWidth),
      year,
      monthIndex0,
      fontsOk: true,
      fonts: brandFonts ?? undefined,
    });
    imageNodeRef.current?.getLayer()?.batchDraw();
  }, [canvas, photo, photoTransform, year, monthIndex0, brandFonts, templateStageWidth]);

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
        if (onPhotoDragStart) onPhotoDragStart();
      }}
      onDragEnd={(e) => {
        if (!onPhotoTransformChange) return;
        // El drag mueve el NODO; el pan de la foto vive en photoTransform (stage units).
        // Acumulamos el delta y devolvemos el nodo al origen — la tarjeta no se mueve,
        // solo cambia el encuadre de la foto dentro de su franja.
        const node = e.target;
        onPhotoTransformChange({
          offsetX: (photoTransform?.offsetX ?? 0) + node.x(),
          offsetY: (photoTransform?.offsetY ?? 0) + node.y(),
        });
        node.position({ x: 0, y: 0 });
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
