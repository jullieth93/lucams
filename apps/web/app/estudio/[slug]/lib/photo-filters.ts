/*
 * Photo filter presets — M.3.b.B.3 (2026-05-13).
 *
 * 5 presets pre-armados cliente-side que aplican Konva built-in filters.
 * Cada preset es una combinación de brightness, contrast, saturation y
 * (opcionalmente) grayscale para lograr un "look" característico.
 *
 * Konva requiere `image.cache()` antes de aplicar filters — esto lo maneja
 * el componente <ImagePlaceholder> con un useEffect que detecta cambios
 * en slotState.filter.
 *
 * Parámetros:
 *   - brightness: -1 a +1  (Konva.Filters.Brighten, prop `brightness`)
 *   - contrast:   -100 a 100 (Konva.Filters.Contrast, prop `contrast`)
 *   - saturation: -1 a +1  (Konva.Filters.HSL, prop `saturation`)
 *   - hue:        -360 a 360 (Konva.Filters.HSL, prop `hue`) — tint cálido/frío
 *   - grayscale:  bool (Konva.Filters.Grayscale)
 *
 * Los valores son escalados de Konva — distinto de OpenCV. Tuneados
 * empíricamente para Lucams.
 */

import type { PhotoFilterPreset } from "../types";

export type PhotoFilterParams = {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  grayscale: boolean;
};

export const FILTER_PRESETS: Record<PhotoFilterPreset, PhotoFilterParams> = {
  vintage: {
    brightness: 0.05,
    contrast: -5,
    saturation: -0.3,
    hue: 20, // tint cálido sepia
    grayscale: false,
  },
  vivid: {
    brightness: 0.05,
    contrast: 15,
    saturation: 0.3,
    hue: 0,
    grayscale: false,
  },
  bw: {
    brightness: 0,
    contrast: 10,
    saturation: 0,
    hue: 0,
    grayscale: true,
  },
  pastel: {
    brightness: 0.1,
    contrast: -10,
    saturation: -0.2,
    hue: 0,
    grayscale: false,
  },
  polaroid: {
    brightness: 0.08,
    contrast: 5,
    saturation: -0.1,
    hue: 15, // tint cálido sutil tipo polaroid
    grayscale: false,
  },
};

export const FILTER_LABELS: Record<PhotoFilterPreset, string> = {
  vintage: "Vintage",
  vivid: "Vivid",
  bw: "Blanco y negro",
  pastel: "Pastel",
  polaroid: "Polaroid",
};

export const FILTER_DESCRIPTIONS: Record<PhotoFilterPreset, string> = {
  vintage: "Cálido y suave, look de los 70s",
  vivid: "Colores vibrantes y saturados",
  bw: "Clásico blanco y negro",
  pastel: "Tonos suaves y soñadores",
  polaroid: "Tono cálido tipo polaroid vintage",
};

export const FILTER_ORDER: PhotoFilterPreset[] = [
  "vivid",
  "vintage",
  "polaroid",
  "pastel",
  "bw",
];

/**
 * Devuelve los params Konva para un preset, o null si filter es null/"none".
 */
export function getFilterParams(filter: PhotoFilterPreset | null | undefined): PhotoFilterParams | null {
  if (!filter) return null;
  return FILTER_PRESETS[filter] ?? null;
}
