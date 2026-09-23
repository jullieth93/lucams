/*
 * Ola 3 (Lucy 2026-07-22) — Separadores de libros 2 CARAS: composición de la TIRA
 * DESPLEGADA para producción.
 *
 * El separador físico es una tira que se pliega HORIZONTALMENTE a la mitad (doblez
 * sobre la punta corta) para colgar de la página: cada unidad tiene 2 caras con
 * imagen propia (cara A al frente / cara B atrás). La imprenta recibe la tira
 * DESPLEGADA VERTICAL con las 2 caras APILADAS (cara A ARRIBA, cara B ABAJO):
 *   - rectangular 2×6 cm por cara  → tira 2×12 cm  (doblez a los 6 cm)
 *   - cuadrado    4×4.2 cm por cara → tira 4×8.4 cm (doblez a los 4.2 cm)
 *
 * (Bug 2026-09-22: hasta hoy componía HORIZONTAL A|B — resto de cuando el stage
 * era horizontal. El físico se pliega sobre el ANCHO, no sobre el largo, y el
 * canvas/preview del Estudio ya muestran las caras apiladas con filete de
 * doblez horizontal. Confirmado por el owner: desplegado total 2×12 y 4×8.4.)
 *
 * ROTACIÓN DE LA CARA B (plegables): para que ambas caras se lean DERECHAS
 * cuando la tira cuelga plegada de la página, la cara B se imprime ROTADA 180°
 * en la tira plana. Es la misma convención de la vista 3D (FoldedStripMesh en
 * magnet-3d.tsx: la textura trasera lleva flipV+flipU = rotación de 180°).
 *
 * NOFOLD (Alargados, marcapáginas plano): la pieza NO se pliega — se conserva
 * la composición HORIZONTAL histórica (frente | reverso lado a lado, producción
 * imprime espalda con espalda) y la cara B NO se rota (FlatBookmarks la muestra
 * sin rotar; el reverso físico queda contra la página).
 *
 * Entrada: 2N buffers de caras ya renderizadas a resolución de producción (stage ×3,
 * convención slots 2k=cara A y 2k+1=cara B del Estudio). Salida: N buffers de tiras
 * PNG. Las esquinas EXTERIORES de la tira quedan redondeadas con transparencia (el
 * troquel real de los separadores es redondo, no puntiagudo); la unión central NO se
 * redondea: ahí va el doblez (plegables) o la unión espalda con espalda (noFold).
 *
 * sharp (sin deps nativas) — misma línea de producción que production-render.ts.
 */

import "server-only";
import sharp, { type OverlayOptions } from "./sharp-safe";

export type ComposeFaceStripsOptions = {
  /**
   * Radio de esquina de la tira EN PÍXELES DEL BUFFER DE SALIDA (el caller escala el
   * cornerRadius lógico de la plantilla × el factor de producción). 0/undefined = tira
   * rectangular sin redondeo.
   */
  cornerRadiusPx?: number;
  /**
   * `true` (Alargados, personalizationSchema.noFold): la pieza es PLANA → composición
   * HORIZONTAL A|B histórica, cara B SIN rotar. `false`/undefined (separadores
   * plegables): tira VERTICAL (A arriba, B abajo) con la cara B rotada 180°.
   */
  noFold?: boolean;
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
  const noFold = opts?.noFold === true;
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
    let bBuffer =
      metaB.width === w && metaB.height === h
        ? faceB
        : await sharp(faceB, { failOn: "none" }).resize(w, h, { fit: "fill" }).png().toBuffer();
    // Plegables: la cara B se imprime rotada 180° para que se lea derecha con la
    // tira colgando plegada (doblez horizontal sobre la punta corta). noFold: sin
    // rotación (pieza plana, reverso contra la página — ver FlatBookmarks).
    if (!noFold) {
      bBuffer = await sharp(bBuffer).rotate(180).png().toBuffer();
    }

    // Geometría de la tira: plegable = VERTICAL (A arriba, B abajo — doblez
    // horizontal a mitad del alto); noFold = HORIZONTAL (A | B, histórico).
    const stripW = noFold ? w * 2 : w;
    const stripH = noFold ? h : h * 2;
    const composites: OverlayOptions[] = [
      { input: faceA, left: 0, top: 0 },
      { input: bBuffer, left: noFold ? w : 0, top: noFold ? 0 : h },
    ];

    // Esquinas exteriores redondeadas (troquel redondo del separador): máscara SVG
    // dest-in recorta el alpha de las 4 esquinas; la unión central queda intacta.
    if (radius > 0) {
      const mask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${stripW}" height="${stripH}">` +
          `<rect x="0" y="0" width="${stripW}" height="${stripH}" rx="${radius}" ry="${radius}" fill="#ffffff"/>` +
          `</svg>`,
      );
      composites.push({ input: mask, blend: "dest-in" });
    }

    const strip = await sharp({
      create: {
        width: stripW,
        height: stripH,
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
