/*
 * Ola 3 (Lucy 2026-07-22) — Separadores de libros 2 CARAS: composición de la TIRA
 * DESPLEGADA para producción.
 *
 * El separador físico es una tira doblada a la mitad: cada unidad tiene 2 caras con
 * imagen propia (cara A / cara B). La imprenta recibe la tira DESPLEGADA con las 2
 * caras lado a lado (cara A izquierda, cara B derecha):
 *   - cuadrado    4×4.2 cm por cara → tira 8×4.2 cm
 *   - rectangular 6×2 cm por cara   → tira 12×2 cm
 *
 * Entrada: 2N buffers de caras ya renderizadas a resolución de producción (stage ×3,
 * convención slots 2k=cara A y 2k+1=cara B del Estudio). Salida: N buffers de tiras
 * PNG. Las esquinas EXTERIORES de la tira quedan redondeadas con transparencia (el
 * troquel real de los separadores es redondo, no puntiagudo); la unión central NO se
 * redondea: ahí va el doblez.
 *
 * sharp (sin deps nativas) — misma línea de producción que production-render.ts.
 */

import "server-only";
import sharp, { OverlayOptions } from "sharp";

export type ComposeFaceStripsOptions = {
  /**
   * Radio de esquina de la tira EN PÍXELES DEL BUFFER DE SALIDA (el caller escala el
   * cornerRadius lógico de la plantilla × el factor de producción). 0/undefined = tira
   * rectangular sin redondeo.
   */
  cornerRadiusPx?: number;
};

/**
 * Compone N tiras a partir de 2N caras. Lanza si la cantidad de caras es impar (la
 * convención 2N la garantiza el Estudio; un impar indica un diseño corrupto y NO hay
 * que producir una tira coja en silencio).
 */
export async function composeFaceStrips(
  faceBuffers: Buffer[],
  opts?: ComposeFaceStripsOptions,
): Promise<Buffer[]> {
  if (faceBuffers.length === 0) return [];
  if (faceBuffers.length % 2 !== 0) {
    throw new Error(
      `composeFaceStrips: cantidad impar de caras (${faceBuffers.length}) — se esperan pares A/B`,
    );
  }

  const radius = Math.max(0, Math.round(opts?.cornerRadiusPx ?? 0));
  const strips: Buffer[] = [];

  for (let unit = 0; unit < faceBuffers.length / 2; unit++) {
    const faceA = faceBuffers[unit * 2]!;
    const faceB = faceBuffers[unit * 2 + 1]!;

    const metaA = await sharp(faceA).metadata();
    const w = metaA.width ?? 0;
    const h = metaA.height ?? 0;
    if (w <= 0 || h <= 0) {
      throw new Error(`composeFaceStrips: cara A de la unidad ${unit + 1} ilegible`);
    }

    // Defensivo: si la cara B no trae las mismas dimensiones (fallback de cliente con
    // otro pixelRatio), se reescala a la cara A para que la tira quede alineada.
    const metaB = await sharp(faceB).metadata();
    const bBuffer =
      metaB.width === w && metaB.height === h
        ? faceB
        : await sharp(faceB, { failOn: "none" }).resize(w, h, { fit: "fill" }).png().toBuffer();

    const stripW = w * 2;
    const composites: OverlayOptions[] = [
      { input: faceA, left: 0, top: 0 },
      { input: bBuffer, left: w, top: 0 },
    ];

    // Esquinas exteriores redondeadas (troquel redondo del separador): máscara SVG
    // dest-in recorta el alpha de las 4 esquinas; el pliegue central queda intacto.
    if (radius > 0) {
      const mask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${stripW}" height="${h}">` +
          `<rect x="0" y="0" width="${stripW}" height="${h}" rx="${radius}" ry="${radius}" fill="#ffffff"/>` +
          `</svg>`,
      );
      composites.push({ input: mask, blend: "dest-in" });
    }

    const strip = await sharp({
      create: {
        width: stripW,
        height: h,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    strips.push(strip);
  }

  return strips;
}
