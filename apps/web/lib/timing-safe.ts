import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Comparación de strings en tiempo constante (anti timing-attack). Compara longitudes primero
 * (timingSafeEqual lanza si difieren) y luego byte a byte, sin cortocircuitar en el primer byte
 * distinto. Úsalo para secretos, tokens y firmas — nunca `===`/`!==`, que filtran los bytes
 * correctos por el tiempo de respuesta.
 */
export function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
