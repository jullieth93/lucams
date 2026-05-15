"use client";

/*
 * StudioRealismOverlay — M.3.b.B.1 (2026-05-13).
 *
 * Simula visualmente el imán físico: sombra exterior (grosor + lift),
 * acabado del material (matte/glossy/soft-touch), guías de seguridad
 * (bleed + safe area) que ayudan al cliente a saber dónde NO poner
 * texto importante.
 *
 * Se exportan DOS componentes:
 *   - <RealismShadowLayer>  → Va DEBAJO del content. Renderea la sombra
 *                              del imán físico flotando sobre superficie.
 *   - <RealismOverlayLayer> → Va ENCIMA del content. Renderea acabado
 *                              (PET glossy gradient) + bleed/safe guides
 *                              (opcionales según `showGuides`).
 *
 * Ambos componentes devuelven `<Layer>` Konva — el caller los stack-ea
 * en el orden bottom→top dentro del mismo `<Stage>`.
 *
 * Bleed / safe area:
 *   - Bleed (5mm @ 300dpi) = zona de corte. Lo dibujado acá puede cortarse.
 *     Se marca con dashed yellow. Cliente NO debe poner texto importante acá.
 *   - Safe (3mm más interior) = zona garantizada visible. Dashed green.
 *     Cliente sí puede poner texto importante en esta zona.
 *
 * Cálculos (porcentajes del width físico, sin asumir sizeCm específico):
 *   - bleedInset  = 4% (representativo de ~5mm en imán típico 5×5cm)
 *   - safeInset   = 8% (representativo de ~3mm más interior)
 *
 * Formas soportadas:
 *   - rectangle (default, con cornerRadius opcional)
 *   - circle
 *   - heart
 *
 * Performance: cada layer es `listening={false}` → no recibe eventos,
 * mejor performance que content layer.
 */

import { Layer, Rect } from "react-konva";

// M.3.b.UX.bug v4 (Lucy 2026-05-15): simplificación de guías.
// Quitamos la guía "bleed" (era la línea amarilla) — redundante porque la
// silueta del producto físico (heart/circle/rectangle) YA define el borde
// de impresión. Mantenemos UNA sola guía con concepto claro: "Distancia
// mínima del texto al borde" para que el cliente sepa dónde puede escribir
// con seguridad de que no se corta al imprimir.
//
// SAFE_INSET_PCT calibrado al ~3mm en un imán típico 5×5cm → ~6% del width.
// Opacidad aumentada (0.55 → 0.80) + strokeWidth +50% para que sea visible.
const SAFE_INSET_PCT = 0.08;
const SAFE_COLOR = "rgba(124, 106, 173, 0.85)"; // brand-purple — coherente con el resto del editor
const DASH_SAFE: number[] = [8, 6];

type Shape = "rectangle" | "circle" | "heart" | "custom";
type Finish = "matte" | "glossy" | "soft-touch";

type StageDims = { width: number; height: number };

type RealismProps = {
  stage: StageDims;
  shape?: Shape;
  finish?: Finish;
  cornerRadiusPx?: number;
};

// ──────────────────────────────────────────────────────────────────
//  RealismShadowLayer — DEBAJO del content
// ──────────────────────────────────────────────────────────────────

export function RealismShadowLayer({ stage, cornerRadiusPx = 0 }: RealismProps) {
  // M.3.b.UX.v5 (Lucy 2026-05-15) — el imán físico siempre es rectangular
  // (patrón de la industria de imanes magnéticos), independiente del shape
  // del área de foto. El `shape` ahora solo controla cómo se recorta la foto
  // adentro (heart/circle/rect). Por eso la sombra es siempre rect.
  const shadowProps = {
    fill: "#FFFFFF",
    shadowColor: "rgba(0, 0, 0, 0.28)",
    shadowBlur: Math.max(18, stage.width * 0.025),
    shadowOffsetX: 0,
    shadowOffsetY: Math.max(8, stage.width * 0.012),
    shadowOpacity: 1,
    listening: false,
  };

  return (
    <Layer listening={false}>
      <Rect
        x={0}
        y={0}
        width={stage.width}
        height={stage.height}
        cornerRadius={cornerRadiusPx}
        {...shadowProps}
      />
    </Layer>
  );
}

// ──────────────────────────────────────────────────────────────────
//  RealismOverlayLayer — ENCIMA del content (acabado + guías)
// ──────────────────────────────────────────────────────────────────

type RealismOverlayProps = RealismProps & {
  /** Mostrar bleed + safe area dashed (toggle desde toolbar). */
  showGuides?: boolean;
};

export function RealismOverlayLayer({
  stage,
  finish = "matte",
  cornerRadiusPx = 0,
  showGuides = false,
}: RealismOverlayProps) {
  // Acabado glossy: gradient blanco semi-transparente diagonal top-left → bottom-right.
  // Simula reflejo de luz sobre superficie laminada.
  const glossyGradient =
    finish === "glossy"
      ? {
          fillLinearGradientStartPoint: { x: 0, y: 0 },
          fillLinearGradientEndPoint: { x: stage.width, y: stage.height },
          fillLinearGradientColorStops: [
            0,
            "rgba(255, 255, 255, 0.22)",
            0.35,
            "rgba(255, 255, 255, 0.04)",
            0.7,
            "rgba(255, 255, 255, 0)",
            1,
            "rgba(0, 0, 0, 0.04)",
          ] as number[] | string[],
          listening: false,
        }
      : null;

  // Bordes finos sutiles para simular el borde físico del imán (3mm grosor)
  const edgeStroke = {
    stroke: "rgba(0, 0, 0, 0.10)",
    strokeWidth: Math.max(1, stage.width * 0.0025),
    fill: undefined,
    listening: false,
  };

  // Safe area = distancia mínima del texto al borde físico. Único guide visible.
  const safeX = stage.width * SAFE_INSET_PCT;
  const safeY = stage.height * SAFE_INSET_PCT;
  const safeW = stage.width * (1 - SAFE_INSET_PCT * 2);
  const safeH = stage.height * (1 - SAFE_INSET_PCT * 2);
  const safeStrokeWidth = Math.max(2, stage.width * 0.005);

  // M.3.b.UX.v5 (Lucy 2026-05-15) — silueta del producto físico siempre
  // rectangular (los imanes magnéticos se fabrican en rect/cuadrado). El
  // shape del producto controla solo el clipping de la foto adentro, no la
  // silueta del imán. Por eso overlay glossy + edge stroke + safe guide
  // son siempre rect (con cornerRadius si aplica).
  return (
    <Layer listening={false}>
      {/* Acabado glossy (si aplica) */}
      {glossyGradient && (
        <Rect
          x={0}
          y={0}
          width={stage.width}
          height={stage.height}
          cornerRadius={cornerRadiusPx}
          {...glossyGradient}
        />
      )}

      {/* Edge stroke fino que simula borde físico del imán rectangular */}
      <Rect
        x={0}
        y={0}
        width={stage.width}
        height={stage.height}
        cornerRadius={cornerRadiusPx}
        {...edgeStroke}
      />

      {/* Safe area guide rectangular — "mantén texto y caras adentro de esta
        línea para que no se corten al imprimir". Color brand-purple. */}
      {showGuides && (
        <Rect
          x={safeX}
          y={safeY}
          width={safeW}
          height={safeH}
          cornerRadius={Math.max(0, cornerRadiusPx - safeX)}
          stroke={SAFE_COLOR}
          strokeWidth={safeStrokeWidth}
          dash={DASH_SAFE}
          listening={false}
        />
      )}
    </Layer>
  );
}
