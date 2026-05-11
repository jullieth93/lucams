/*
 * Verificación de contraseña contra HaveIBeenPwned via k-anonymity.
 *
 * Por qué:
 *   Cuando un usuario elige una contraseña, queremos rechazar las que
 *   YA están en breaches públicos (credential stuffing protection).
 *   Pwned Passwords lista 800+ millones de hashes filtrados.
 *
 * Cómo (k-anonymity, privacy-preserving):
 *   1. Calcular SHA-1 de la contraseña.
 *   2. Tomar los primeros 5 chars del hash → "prefijo".
 *   3. GET https://api.pwnedpasswords.com/range/<prefijo>
 *   4. La respuesta lista ~500 suffixes que comparten ese prefijo, con
 *      count de cuántas veces apareció cada uno en breaches.
 *   5. Buscar localmente si el resto del hash está en la lista.
 *
 *   La API NUNCA recibe la contraseña ni el hash completo — solo el
 *   prefijo de 5 chars (que matchea decenas de miles de hashes).
 *   Imposible inferir la password del request.
 *
 * Latencia: ~100-300 ms desde Vercel (US East) — tolerable en signup/reset.
 * Free: sin API key, sin rate limit razonable. Si HIBP cae, fail-open
 *   (permitimos la password). Hay log para auditar fallas.
 *
 * Referencias:
 *   - https://haveibeenpwned.com/Passwords
 *   - https://www.troyhunt.com/ive-just-launched-pwned-passwords-version-2/
 */

import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";

const API_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3000;

export type PwnedCheckResult =
  | { pwned: false }
  | { pwned: true; count: number }
  | { pwned: false; failed: true; reason: string };

export async function checkPwnedPassword(
  password: string,
): Promise<PwnedCheckResult> {
  const sha1 = createHash("sha1")
    .update(password)
    .digest("hex")
    .toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}${prefix}`, {
      method: "GET",
      headers: {
        "User-Agent": "lucams-shop",
        "Add-Padding": "true",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({
        event: "security.pwned.api_fail",
        status: res.status,
      });
      return { pwned: false, failed: true, reason: `HTTP ${res.status}` };
    }

    const body = await res.text();
    const match = body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(suffix));

    if (!match) {
      return { pwned: false };
    }

    const count = parseInt(match.split(":")[1] ?? "0", 10);
    return { pwned: true, count };
  } catch (err) {
    logger.warn({
      event: "security.pwned.fetch_error",
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      pwned: false,
      failed: true,
      reason: err instanceof Error ? err.message : "unknown",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
