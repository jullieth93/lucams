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

/**
 * Verificación dedicada para `POST /api/cron/monitor-heartbeat`.
 *
 * Aislamiento STG → PRD: el monitor externo vive en el Vault de Supabase STG
 * (`monitor_cron_secret`) y solo necesita reportar latidos, jamás ejecutar los
 * otros 16 crons mutantes/de correo de PRD. Cuando `MONITOR_HEARTBEAT_SECRET`
 * está configurado, SOLO ese secreto es válido en esta ruta (y no sirve en el
 * resto de `/api/cron/*`). Mientras no esté configurado aún en el ambiente,
 * cae a `cronSecretOk` para permitir rotación sin caída de servicio.
 */
export function monitorHeartbeatSecretOk(provided: string | null): boolean {
  const dedicated = process.env.MONITOR_HEARTBEAT_SECRET?.trim();
  if (dedicated) {
    if (!provided) return false;
    return secureEquals(provided, dedicated);
  }
  return cronSecretOk(provided);
}
