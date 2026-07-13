/*
 * Helpers PUROS del backup de DB a R2 (ADR-059). Sin efectos ni dependencias: el
 * naming de la llave y la selección de backups a podar. Separados del entry para
 * poder testearlos con vitest sin cargar el SDK de AWS ni tocar la red.
 */

// Patrón de una llave de backup: <prefix>/lucams-YYYY-MM-DDThhmmssZ.sql.gz
// El timestamp es UTC y ordenable lexicográficamente (orden alfabético = cronológico).
export const BACKUP_KEY_RE = /(^|\/)lucams-\d{4}-\d{2}-\d{2}T\d{6}Z\.sql\.gz$/;

/**
 * Construye la llave del objeto en R2 para un backup en `date` (UTC).
 * Ej: buildBackupKey(new Date("2026-07-13T14:05:01Z")) → "db/lucams-2026-07-13T140501Z.sql.gz"
 */
export function buildBackupKey(date, prefix = "db") {
  const iso = date.toISOString(); // 2026-07-13T14:05:01.123Z
  const [day, time] = iso.split("T");
  const hms = time.slice(0, 8).replace(/:/g, ""); // "140501"
  const clean = prefix.replace(/\/+$/, ""); // sin barra final
  return `${clean}/lucams-${day}T${hms}Z.sql.gz`;
}

/**
 * Dado el listado de llaves existentes en el bucket y cuántos backups conservar,
 * devuelve las llaves ANTIGUAS que deben borrarse (retención). Sólo considera
 * llaves con forma de backup (BACKUP_KEY_RE) → nunca propone borrar otros objetos.
 *
 * - keep <= 0 → no borra nada (salvaguarda: jamás vaciar el bucket por un mal valor).
 * - Conserva los `keep` más recientes; devuelve el resto (los más viejos).
 */
export function selectStaleKeys(keys, keep) {
  if (!Number.isFinite(keep) || keep <= 0) return [];
  const backups = keys.filter((k) => BACKUP_KEY_RE.test(k)).sort(); // ascendente = viejo→nuevo
  if (backups.length <= keep) return [];
  return backups.slice(0, backups.length - keep); // todos menos los `keep` más nuevos
}
