/*
 * Tiras Magnéticas (photobooth) — composición de la TIRA COMPLETA para
 * producción (owner 2026-11-10).
 *
 * La pieza física es UNA tira vertical continua (3 fotos 5×15 cm o 4 fotos
 * 5×16.5 cm) con las celdas apiladas SIN separación (gridGap=0 en la plantilla
 * del Estudio). Antes la imprenta recibía N PNG sueltos (un segmento por foto)
 * y la ficha de producción tenía que explicar «únelos a tope en orden» — paso
 * manual propenso a errores que ningún otro producto exige (los separadores ya
 * llegan compuestos vía composeFaceStrips). Ahora el servidor compone la tira:
 * un PNG por tira, fotos apiladas en orden, lista para imprimir y troquelar.
 *
 * Multi-unidad (2 tiras en un diseño): los buffers llegan en orden de slot
 * (tira 1 = segmentos 0..perStrip-1, tira 2 = los siguientes…) y la salida es
 * un buffer por tira, en el mismo orden.
 *
 * sharp (sin deps nativas) — misma línea de producción que bookmark-strips.ts.
 */

import "server-only";
import sharp, { type OverlayOptions } from "./sharp-safe";

/**
 * Compone N tiras photobooth a partir de N × perStrip segmentos (en orden de
 * slot). Lanza si la cantidad no es múltiplo exacto de perStrip (un sobrante
 * indica un diseño corrupto y NO hay que producir una tira coja en silencio).
 */
export async function composePhotoStrips(
  segmentBuffers: Buffer[],
  opts: { perStrip: number },
): Promise<Buffer[]> {
  const perStrip = Math.max(1, Math.trunc(opts.perStrip) || 1);
  if (segmentBuffers.length === 0) return [];
  if (perStrip <= 1) return segmentBuffers;
  if (segmentBuffers.length % perStrip !== 0) {
    throw new Error(
      `composePhotoStrips: ${segmentBuffers.length} segmentos no son múltiplo de ${perStrip} por tira`,
    );
  }

  const strips: Buffer[] = [];
  for (let unit = 0; unit < segmentBuffers.length / perStrip; unit++) {
    const segments = segmentBuffers.slice(unit * perStrip, (unit + 1) * perStrip);
    const meta0 = await sharp(segments[0]!).metadata();
    const w = meta0.width ?? 0;
    const h = meta0.height ?? 0;
    if (w <= 0 || h <= 0) {
      throw new Error(`composePhotoStrips: segmento 1 de la tira ${unit + 1} ilegible`);
    }

    // Defensivo: un segmento con dimensiones distintas (fallback de cliente con
    // otro pixelRatio) se reescala a la celda de la tira para que el apilado
    // quede alineado a tope.
    const composites: OverlayOptions[] = [];
    for (let i = 0; i < segments.length; i++) {
      const meta = await sharp(segments[i]!).metadata();
      const buf =
        meta.width === w && meta.height === h
          ? segments[i]!
          : await sharp(segments[i]!, { failOn: "none" })
              .resize(w, h, { fit: "fill" })
              .png()
              .toBuffer();
      composites.push({ input: buf, left: 0, top: i * h });
    }

    // RECTANGULAR a sangre (misma regla W3 de las tiras de separadores): el
    // corte físico del troquel resuelve los bordes; la imprenta necesita el
    // arte completo hasta las 4 esquinas.
    const strip = await sharp({
      create: {
        width: w,
        height: h * perStrip,
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
