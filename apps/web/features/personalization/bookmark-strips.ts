/*
 * Ola 3 (Lucy 2026-07-22) — Separadores de libros 2 CARAS: composición de la TIRA
 * DESPLEGADA para producción.
 *
 * El separador físico cuelga de la página con el DOBLEZ ARRIBA (sobre el borde
 * superior) y las dos piernas colgando hacia abajo: cara A al FRENTE, cara B al
 * RESPALDO. Para que una cara se lea DERECHA al colgar, la CABEZA de su imagen
 * tiene que quedar JUNTO AL DOBLEZ. Por eso la imprenta recibe la tira plana
 * VERTICAL en disposición "cabezas al doblez" (tête-bêche):
 *
 *   ┌───────────┐
 *   │  B (↑180°)│  ← cara B en la MITAD SUPERIOR, ROTADA 180° (cabeza hacia
 *   ├─ doblez ──┤    ABAJO, hacia el pliegue)
 *   │  A (0°)   │  ← cara A en la MITAD INFERIOR, DERECHA (cabeza hacia ARRIBA,
 *   └───────────┘    hacia el pliegue)
 *
 * Al doblar, la mitad superior se voltea 180° sobre el eje del doblez hacia
 * atrás: A cuelga al frente leyéndose derecha y B cuelga al respaldo leyéndose
 * derecha (el doblez sobre eje horizontal NO espeja izquierda-derecha, y el
 * respaldo se ve directo desde atrás — simulación del plegado verificada por
 * el owner, que opera la producción física, 2026-09-25).
 *
 * Tamaños desplegados (doblez a la mitad del alto):
 *   - rectangular 2×6 cm por cara  → tira 2×12 cm
 *   - cuadrado    4×4.2 cm por cara → tira 4×8.4 cm
 *
 * Historial de la convención:
 *   - 2026-09-22: componía HORIZONTAL A|B (resto del stage horizontal viejo).
 *   - 2026-09-22 (fix 1): VERTICAL pero A arriba derecha + B abajo rotada =
 *     cabezas hacia AFUERA → ambas caras colgaban cabeza-abajo. MAL.
 *   - 2026-09-25 (fix 2, actual): cabezas AL DOBLEZ (B arriba rotada, A abajo).
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
   * plegables): tira VERTICAL "cabezas al doblez" — cara B ARRIBA rotada 180°,
   * cara A ABAJO derecha.
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
    // Plegables: la cara B va ROTADA 180° en la mitad SUPERIOR — su cabeza apunta
    // hacia el doblez central, así cuelga derecha en el respaldo al plegar (ver el
    // docblock: "cabezas al doblez"). noFold: sin rotación (pieza plana, reverso
    // contra la página — ver FlatBookmarks).
    if (!noFold) {
      bBuffer = await sharp(bBuffer).rotate(180).png().toBuffer();
    }

    // Geometría de la tira: plegable = VERTICAL con B ARRIBA (rotada) y A ABAJO
    // (derecha) — cabezas al doblez horizontal a mitad del alto; noFold =
    // HORIZONTAL (A | B, histórico).
    const stripW = noFold ? w * 2 : w;
    const stripH = noFold ? h : h * 2;
    const composites: OverlayOptions[] = noFold
      ? [
          { input: faceA, left: 0, top: 0 },
          { input: bBuffer, left: w, top: 0 },
        ]
      : [
          { input: bBuffer, left: 0, top: 0 },
          { input: faceA, left: 0, top: h },
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
