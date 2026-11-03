/*
 * Patrón de marca «Lucams» para la CARA B por defecto de los separadores de 2 caras
 * (decisión owner 2026-11-03 — SUPERSEDE la regla «cara B vacía = EN BLANCO» de
 * ADR-128 para productos backOptional: separadores magnéticos 2×6/4×4.2 y
 * alargados planos 4×12/4×15).
 *
 * Cuando el cliente no diseña la cara B, la pieza sale con el wordmark script
 * «Lucams» tileado en diagonal sobre blanco (referencia de la owner: patrón de
 * marca de agua), en las TRES superficies: Vista Previa / «Ve Diseño», 3D y el
 * PNG de producción. Una sola fuente de verdad visual:
 *
 *   - ESTE módulo es PURO (sin server-only, sin DOM, sin Prisma): dibuja sobre
 *     cualquier ctx 2D (el DOM canvas del Estudio / libro 3D y el @napi-rs/canvas
 *     del render de producción), como hace calendar-draw.ts.
 *   - La FUENTE la resuelve cada lado: el server registra el TTF vendorizado
 *     (assets/fonts/DancingScript.ttf) y el navegador resuelve el nombre hasheado
 *     de next/font vía la CSS var `--font-dancing` (resolveCalendarTitleFont).
 *
 * Geometría proporcional al ANCHO de la cara (w): el patrón escala con la pieza,
 * así el separador 2×6 y el alargado 4×15 llevan la misma textura visual y la
 * Vista Previa (que dibuja la cara a otro tamaño en px) queda WYSIWYG con el
 * PNG de imprenta.
 */

/** Interfaz mínima del ctx 2D (DOM CanvasRenderingContext2D y SKRSContext2D la cumplen). */
export interface BrandPatternContext2D {
  fillStyle: unknown;
  font: string;
  textAlign: unknown;
  textBaseline: unknown;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

/** Texto del patrón: el wordmark de marca (ADR-138 — «Lucams», nunca «Lucam's»). */
export const BRAND_BACK_TEXT = "Lucams";
/** Rotación diagonal del tile (grados; negativo = asciende de izquierda a derecha). */
export const BRAND_BACK_ROTATION_DEG = -24;
/** Gris-lila muy claro sobre blanco (patrón sutil de reverso, no protagonista). */
export const BRAND_BACK_FILL = "#E9E6F0";
/** Familia script de marca. El server la registra del TTF; el navegador la resuelve hasheada. */
export const BRAND_BACK_FONT_FAMILY = "Dancing Script";

/** Métricas del patrón para una cara de `w` px de ancho (todas ∝ w — ver docblock). */
export function brandBackMetrics(w: number): {
  fontPx: number;
  dx: number;
  dy: number;
  rotation: number;
} {
  // Referencia de la owner (patrón 16:9): wordmark ≈ 7.5 % del ancho de fuente,
  // paso horizontal ≈ 20 % del ancho, paso vertical ≈ 16 %, filas en ladrillo.
  const fontPx = Math.max(10, Math.round(w * 0.075));
  return {
    fontPx,
    dx: Math.max(fontPx * 2, Math.round(w * 0.2)),
    dy: Math.max(Math.round(fontPx * 1.9), Math.round(w * 0.16)),
    rotation: (BRAND_BACK_ROTATION_DEG * Math.PI) / 180,
  };
}

/**
 * Dibuja la cara B completa: fondo blanco + wordmark tileado en diagonal
 * (patrón ladrillo: filas impares desplazadas medio paso). La grilla cubre un
 * margen fuera del lienzo para que la rotación no deje huecos en los bordes.
 *
 * `fontFamily` debe ser la familia REAL disponible en el ctx (server: el literal
 * registrado con GlobalFonts; navegador: el nombre hasheado de next/font). Si la
 * fuente no cargó, el ctx cae a su fallback genérico — el patrón sigue saliendo.
 */
export function drawBrandBackFace(
  ctx: BrandPatternContext2D,
  width: number,
  height: number,
  fontFamily: string = BRAND_BACK_FONT_FAMILY,
): void {
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  const { fontPx, dx, dy, rotation } = brandBackMetrics(width);
  ctx.fillStyle = BRAND_BACK_FILL;
  ctx.font = `700 ${fontPx}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Margen de cobertura: el texto rotado -24° sobresale de su celda; sembrar la
  // grilla más allá del lienzo garantiza borde a borde sin recortes visibles.
  const margin = fontPx * 3;
  let row = 0;
  for (let y = -margin; y <= height + margin; y += dy, row++) {
    const offset = row % 2 === 1 ? dx / 2 : 0;
    for (let x = -margin + offset; x <= width + margin; x += dx) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillText(BRAND_BACK_TEXT, 0, 0);
      ctx.restore();
    }
  }
}
