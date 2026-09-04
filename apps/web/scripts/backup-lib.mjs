/*
 * Helpers PUROS del backup de DB a R2 (ADR-059). Sin efectos ni dependencias: el
 * naming de la llave y la selección de backups a podar. Separados del entry para
 * poder testearlos con vitest sin cargar el SDK de AWS ni tocar la red.
 */

// Patrón de una llave de backup: <prefix>/lucams-YYYY-MM-DDThhmmssZ.sql.gz.gpg
// El timestamp es UTC y ordenable lexicográficamente (orden alfabético = cronológico).
// El sufijo .sql.gz (sin .gpg) queda aceptado para los backups LEGACY anteriores
// al cifrado gpg (A-3, auditoría 2026-08-24): la retención también los poda.
export const BACKUP_KEY_RE = /(^|\/)lucams-\d{4}-\d{2}-\d{2}T\d{6}Z\.sql\.gz(\.gpg)?$/;

/**
 * Normaliza R2_ACCOUNT_ID a la etiqueta DNS que va delante de `.r2.cloudflarestorage.com`.
 *
 * Motivo (2026-07-21): pegar el ENDPOINT COMPLETO en vez del Account ID producía un host
 * inválido y el SDK moría con `SSL alert number 40 (handshake failure)` — un error de OpenSSL
 * que no insinúa por ningún lado que el problema es una variable mal copiada. Se tolera el
 * endpoint completo (se extrae el id) y se rechaza cualquier cosa que no pueda ser una etiqueta
 * DNS, con un mensaje que diga qué hacer.
 */
export function normalizeR2AccountId(raw) {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("R2_ACCOUNT_ID está vacío.");

  const asUrl = value.match(/^https?:\/\/([^/.]+)\.r2\.cloudflarestorage\.com\/*$/i);
  const id = asUrl ? asUrl[1] : value;

  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    throw new Error(
      `R2_ACCOUNT_ID no parece un Account ID de Cloudflare (recibido ${id.length} caracteres con ` +
        `símbolos no válidos en un nombre de host). Debe ser SOLO el identificador — por ejemplo ` +
        `"a1b2c3…", no "https://a1b2c3….r2.cloudflarestorage.com" ni el Access Key ID ni el Token value. ` +
        `Se encuentra en el panel de R2, en Account Details → Account ID.`,
    );
  }
  return id;
}

/**
 * Traduce el fallo de TLS del endpoint S3 de R2 a algo accionable.
 *
 * Comprobado (2026-07-21): `<id>.r2.cloudflarestorage.com` corta el handshake con
 * `SSL alert number 40` — desde dos redes distintas, con TLS 1.2 y 1.3, con y sin ALPN — cuando
 * el endpoint no está servido para esa cuenta. El DNS resuelve igual (comodín), así que el rechazo
 * ocurre por SNI y NO distingue "id equivocado" de "R2 sin aprovisionar": el síntoma es idéntico
 * con un id inventado y con uno real de una cuenta sin R2 activo. Por eso el mensaje enumera las
 * dos causas en vez de afirmar una — una versión previa culpaba solo al id y era incorrecta.
 */
export function explainR2ConnectError(err, accountId) {
  const text = `${err?.code ?? ""} ${err?.message ?? ""}`;
  const isHandshake = /EPROTO|handshake failure|alert number 40|ERR_TLS/i.test(text);
  if (!isHandshake) return err;
  return new Error(
    `R2 rechazó el handshake TLS: no hay endpoint S3 servido para el R2_ACCOUNT_ID configurado ` +
      `(${accountId.length} caracteres). Dos causas posibles, indistinguibles por el error:\n` +
      `  1) R2 no está aprovisionado en esa cuenta (falta activar la suscripción de R2, o el ` +
      `aprovisionamiento aún no terminó). Comprobación: ¿aparece el bucket en R2 → Overview?\n` +
      `  2) El R2_ACCOUNT_ID no es el de esa cuenta. Ojo: el Account ID y el Access Key ID son ` +
      `ambos de 32 caracteres hexadecimales. El correcto está en la URL del panel: ` +
      `dash.cloudflare.com/<ACCOUNT_ID>/r2/...\n` +
      `(causa original: ${err?.message ?? err})`,
  );
}

/**
 * Construye la llave del objeto en R2 para un backup en `date` (UTC).
 * Ej: buildBackupKey(new Date("2026-07-13T14:05:01Z")) → "db/lucams-2026-07-13T140501Z.sql.gz.gpg"
 * (Desde 2026-08-29 el dump viaja cifrado con gpg simétrico → sufijo .gpg; A-3,
 * auditoría 2026-08-24.)
 */
export function buildBackupKey(date, prefix = "db") {
  const iso = date.toISOString(); // 2026-07-13T14:05:01.123Z
  const [day, time] = iso.split("T");
  const hms = time.slice(0, 8).replace(/:/g, ""); // "140501"
  const clean = prefix.replace(/\/+$/, ""); // sin barra final
  return `${clean}/lucams-${day}T${hms}Z.sql.gz.gpg`;
}

/**
 * Dado el listado de llaves existentes en el bucket y cuántos backups conservar,
 * devuelve las llaves ANTIGUAS que deben borrarse (retención). Sólo considera
 * llaves con forma de backup (BACKUP_KEY_RE) → nunca propone borrar otros objetos.
 *
 * - keep <= 0 → no borra nada (salvaguarda: jamás vaciar el bucket por un mal valor).
 * - Conserva los `keep` más recientes; devuelve el resto (los más viejos).
 *
 * `pattern` (optional, defaults to BACKUP_KEY_RE) selects which keys count as
 * backups — the Storage mirror passes its own archive/manifest patterns so the
 * same retention logic prunes `db-storage/` without ever touching DB dumps.
 */
export function selectStaleKeys(keys, keep, pattern = BACKUP_KEY_RE) {
  if (!Number.isFinite(keep) || keep <= 0) return [];
  const backups = keys.filter((k) => pattern.test(k)).sort(); // ascendente = viejo→nuevo
  if (backups.length <= keep) return [];
  return backups.slice(0, backups.length - keep); // todos menos los `keep` más nuevos
}
