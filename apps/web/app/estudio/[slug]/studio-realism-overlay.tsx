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

import { Layer, Rect, Circle, Path } from "react-konva";

// M.3.b.UX.v13 (Lucy 2026-05-15) — Revertido el "siempre rect" del v9.
// El imán físico ES el shape declarado (heart/circle/rect según producto).
// magneticas.cl + Casetify + Vistaprint venden fotoimanes corazón como
// silueta heart real, NO rectangular con foto recortada. La decisión v5
// fue una mala interpretación.
const HEART_PATH_DATA =
  "M50,82 C28,68 6,52 6,32 C6,18 16,8 28,8 C38,8 44,12 50,22 C56,12 62,8 72,8 C84,8 94,18 94,32 C94,52 72,68 50,82 Z";

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
type Finish = "matte" | "glossy" | "soft-touch" | "glass";

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

export function RealismShadowLayer({
  stage,
  shape = "rectangle",
  cornerRadiusPx = 0,
}: RealismProps) {
  // M.3.b.UX.v13 (Lucy 2026-05-15) — la sombra sigue el shape físico del imán.
  // Heart imán → sombra heart-shape. Circle imán → sombra circle. Rect → rect.
  const shadowProps = {
    fill: "#FFFFFF",
    shadowColor: "rgba(0, 0, 0, 0.28)",
    shadowBlur: Math.max(18, stage.width * 0.025),
    shadowOffsetX: 0,
    shadowOffsetY: Math.max(8, stage.width * 0.012),
    shadowOpacity: 1,
    listening: false,
  };

  if (shape === "circle") {
    return (
      <Layer listening={false}>
        <Circle
          x={stage.width / 2}
          y={stage.height / 2}
          radius={Math.min(stage.width, stage.height) / 2}
          {...shadowProps}
        />
      </Layer>
    );
  }

  if (shape === "heart") {
    return (
      <Layer listening={false}>
        <Path
          data={HEART_PATH_DATA}
          x={0}
          y={0}
          scaleX={stage.width / 100}
          scaleY={stage.height / 100}
          {...shadowProps}
        />
      </Layer>
    );
  }

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
  shape = "rectangle",
  finish = "matte",
  cornerRadiusPx = 0,
  showGuides = false,
}: RealismOverlayProps) {
  // Acabado glossy: gradient blanco semi-transparente diagonal top-left → bottom-right.
  // Simula reflejo de luz sobre superficie laminada.
  // Glass treat como glossy (mismo gradient blanco simula reflejo de vidrio).
  const glossyGradient =
    finish === "glossy" || finish === "glass"
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

  // M.3.b.UX.v13 (Lucy 2026-05-15) — silueta del producto físico = shape declarado.
  // Heart/circle/rect cada uno tiene su edge stroke, glossy, y safe guide.
  const isCircle = shape === "circle";
  const isHeart = shape === "heart";

  return (
    <Layer listening={false}>
      {/* Acabado glossy (si aplica) — usa shape del producto */}
      {glossyGradient && isCircle && (
        <Circle
          x={stage.width / 2}
          y={stage.height / 2}
          radius={Math.min(stage.width, stage.height) / 2}
          {...glossyGradient}
        />
      )}
      {glossyGradient && isHeart && (
        <Path
          data={HEART_PATH_DATA}
          x={0}
          y={0}
          scaleX={stage.width / 100}
          scaleY={stage.height / 100}
          {...glossyGradient}
        />
      )}
      {glossyGradient && !isCircle && !isHeart && (
        <Rect
          x={0}
          y={0}
          width={stage.width}
          height={stage.height}
          cornerRadius={cornerRadiusPx}
          {...glossyGradient}
        />
      )}

      {/* Edge stroke fino del borde físico del imán */}
      {isCircle && (
        <Circle
          x={stage.width / 2}
          y={stage.height / 2}
          radius={Math.min(stage.width, stage.height) / 2}
          {...edgeStroke}
        />
      )}
      {isHeart && (
        <Path
          data={HEART_PATH_DATA}
          x={0}
          y={0}
          scaleX={stage.width / 100}
          scaleY={stage.height / 100}
          {...edgeStroke}
        />
      )}
      {!isCircle && !isHeart && (
        <Rect
          x={0}
          y={0}
          width={stage.width}
          height={stage.height}
          cornerRadius={cornerRadiusPx}
          {...edgeStroke}
        />
      )}

      {/* Safe area guide siguiendo el shape físico real */}
      {showGuides && isCircle && (
        <Circle
          x={stage.width / 2}
          y={stage.height / 2}
          radius={Math.min(stage.width, stage.height) / 2 - safeX}
          stroke={SAFE_COLOR}
          strokeWidth={safeStrokeWidth}
          dash={DASH_SAFE}
          listening={false}
        />
      )}
      {showGuides && isHeart && (
        <Path
          data={HEART_PATH_DATA}
          x={safeX}
          y={safeY}
          scaleX={(stage.width - 2 * safeX) / 100}
          scaleY={(stage.height - 2 * safeY) / 100}
          stroke={SAFE_COLOR}
          strokeWidth={safeStrokeWidth / ((stage.width - 2 * safeX) / 100)}
          dash={DASH_SAFE.map((d) => d / ((stage.width - 2 * safeX) / 100))}
          listening={false}
        />
      )}
      {showGuides && !isCircle && !isHeart && (
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
