import "server-only";
import { secureEquals } from "@/lib/timing-safe";

/**
 * Verificación del header `x-cron-secret` para las rutas /api/cron/* y el detalle
 * protegido de /api/health/*. Comparación en tiempo constante contra `CRON_SECRET`
 * y fail-closed: sin secreto configurado o sin header, la respuesta es `false`.
 */
export function cronSecretOk(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || !provided) return false;
  return secureEquals(provided, expected);
}
