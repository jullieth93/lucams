"use client";

/*
 * Render estático y fiel de UNA plantilla, reusando el StudioSlot REAL del Estudio
 * (mismo Konva: sombra física + contenido + acabado glossy). Sirve para generar los
 * thumbnails de plantillas (Bloque F3/Fase 3) con un screenshot de Playwright, en
 * vez de placeholders de Unsplash. Read-only: callbacks no-op, sin guías, sin foto
 * (muestra el DISEÑO — marco/fondo/decoración/texto — que es lo que Lucy aprueba).
 */

import { useSyncExternalStore } from "react";
import { StudioSlot } from "@/app/estudio/[slug]/studio-slot";
import type { CanvasDataV1, SlotState } from "@/app/estudio/[slug]/types";

const noop = () => {};

// Foto de muestra (data URL SVG, sin archivo ni CORS) para que el slot se vea
// LLENO — el thumbnail muestra el diseño con una imagen, no el estado "agrega foto".
// Gradiente cálido neutro + textura suave; representa "aquí va tu foto".
const SAMPLE_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
<stop offset='0' stop-color='#F8C9A6'/><stop offset='0.5' stop-color='#E9A7C4'/>
<stop offset='1' stop-color='#A79BD6'/></linearGradient>
<radialGradient id='v' cx='0.5' cy='0.42' r='0.7'>
<stop offset='0.6' stop-color='#ffffff' stop-opacity='0'/><stop offset='1' stop-color='#3D2E5C' stop-opacity='0.28'/></radialGradient></defs>
<rect width='600' height='600' fill='url(#g)'/><rect width='600' height='600' fill='url(#v)'/></svg>`,
  );

export function PreviewCanvas({
  canvasData,
  width = 480,
  shape = "rectangle",
  finish = "glossy",
  cornerRadiusPx = 22,
  sizeCm,
}: {
  canvasData: CanvasDataV1;
  width?: number;
  shape?: "rectangle" | "circle" | "heart" | "custom";
  finish?: "matte" | "glossy" | "soft-touch" | "glass";
  cornerRadiusPx?: number;
  sizeCm?: string;
}) {
  // Konva necesita `window` → montar solo en cliente (evita romper el SSR sin
  // recurrir a dynamic(ssr:false), no permitido en Server Components en Next 16).
  // Konva necesita `window` → renderizar solo tras hidratar en cliente. useSyncExternalStore
  // devuelve false en SSR y true en cliente SIN setState-en-effect (react-compiler friendly).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const stage = canvasData.stage;
  const aspect = stage.height / stage.width; // alto/ancho
  const height = Math.round(width * aspect);

  const slotState: SlotState = {
    slotIndex: 0,
    assetId: "sample",
    assetUrl: SAMPLE_PHOTO,
  };

  if (!mounted) return <div data-preview-root style={{ width, height }} />;

  return (
    // Contenedor fijo + fondo transparente para un screenshot limpio del imán.
    <div
      data-preview-root
      style={{ width, height, display: "inline-block", background: "transparent" }}
    >
      <StudioSlot
        slotState={slotState}
        unitTemplate={canvasData}
        displaySize={width}
        displayHeight={height}
        isSelected={false}
        totalSlots={1}
        sizeCm={sizeCm}
        shape={shape}
        finish={finish}
        cornerRadiusPx={cornerRadiusPx}
        showRealismGuides={false}
        onClick={noop}
        onClear={noop}
        onAssetDrop={noop}
        onKeyboardNav={noop}
      />
    </div>
  );
}
