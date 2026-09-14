import "server-only";

/*
 * Step-up MFA para acciones admin destructivas (auditoría pre-lanzamiento
 * 2026-09-04 · F-10).
 *
 * Problema: el guard central (admin-rbac-guard) exige sesión + MFA enrolado +
 * aal2 + rol, pero el aal2 puede ser del LOGIN de hace 29 min — una sesión
 * robada con aal2 fresco bastaba para reembolsar pedidos o auto-promover
 * SUPERADMINs sin re-probar identidad. El storefront ya re-autenticaba
 * (cambio de password pide la actual); el admin no.
 *
 * Solución: las acciones destructivas llaman `requireRecentMfa()` justo después
 * de `requireAdminAction(...)`. Se exige que la elevación aal2 sea RECIENTE
 * (default 10 min) leyendo el claim `amr` del JWT de sesión actual:
 *
 *   - getAuthenticatorAssuranceLevel() decodifica el access_token de la sesión
 *     y devuelve `currentAuthenticationMethods` (= claim amr). GoTrue anota ahí
 *     { method: "otp" | "totp" | "mfa/totp", timestamp } en cada verify TOTP,
 *     y el timestamp se preserva en los refreshes del token (vive en el registro
 *     de sesión server-side) — o sea que mide la última PRUEBA de segundo factor
 *     real, no la edad del JWT.
 *   - Confiar en el decode es seguro acá porque requireAdminAction corre ANTES:
 *     getCurrentAdmin() → supabase.auth.getUser() valida el token contra el
 *     Auth server; un JWT forjado en la cookie muere ahí, mucho antes de leer amr.
 *   - Fail-closed: sin aal2, sin entrada TOTP, o amr en formato RFC-8176 plano
 *     (strings sin timestamp — solo ocurre con un Custom Access Token Hook, que
 *     este proyecto NO configura) → se exige re-autenticación.
 *
 * Flujo completo: la acción devuelve `{ reauthRequired: true }` → la UI abre
 * <MfaReauthModal> (components/admin/mfa-reauth) → verifyAdminMfaReauthAction
 * hace challengeAndVerify server-side (refresca el JWT con un amr nuevo) →
 * la UI reintenta la acción UNA vez y esta vez el check pasa.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Código de dominio que viaja en el error y en el estado de las acciones. */
export const MFA_REAUTH_REQUIRED = "MFA_REAUTH_REQUIRED" as const;

/** Ventana default de frescura de la elevación aal2. */
export const MFA_REAUTH_WINDOW_MINUTES = 10;

/** Mensaje es-CO que las acciones devuelven junto a `reauthRequired`. */
export const MFA_REAUTH_MESSAGE =
  "Por seguridad, esta acción pide confirmar tu identidad con el código de tu app de autenticación.";

export class MfaReauthRequiredError extends Error {
  readonly code = MFA_REAUTH_REQUIRED;
  constructor() {
    super("MFA re-authentication required (stale aal2)");
    this.name = "MfaReauthRequiredError";
  }
}

/** Métodos amr que GoTrue registra para una verificación TOTP (según versión). */
const TOTP_AMR_METHODS: ReadonlySet<string> = new Set(["otp", "totp", "mfa/totp"]);

/**
 * Extrae el timestamp (epoch seconds) de la verificación TOTP MÁS reciente del
 * claim amr. Devuelve null si no hay ninguna entrada TOTP con timestamp (el
 * formato plano RFC-8176 —array de strings— no trae tiempos → null → fail-closed).
 */
export function latestTotpAmrTimestamp(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (typeof entry !== "object" || entry === null) continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (
      typeof method === "string" &&
      TOTP_AMR_METHODS.has(method) &&
      typeof timestamp === "number" &&
      Number.isFinite(timestamp)
    ) {
      if (latest === null || timestamp > latest) latest = timestamp;
    }
  }
  return latest;
}

/**
 * Exige que la sesión tenga una elevación aal2 de hace ≤ `maxMinutes`.
 * Llamar DESPUÉS de requireAdminAction (que ya validó sesión + token + aal2).
 * Lanza MfaReauthRequiredError si la elevación es vieja o indemostrable.
 */
export async function requireRecentMfa(opts: { maxMinutes?: number } = {}): Promise<void> {
  const maxMinutes = opts.maxMinutes ?? MFA_REAUTH_WINDOW_MINUTES;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const latest = latestTotpAmrTimestamp(data?.currentAuthenticationMethods);
  const nowSec = Math.floor(Date.now() / 1000);
  // `nowSec - latest > maxMinutes * 60` estricto: exactamente en el borde pasa.
  if (data?.currentLevel !== "aal2" || latest === null || nowSec - latest > maxMinutes * 60) {
    throw new MfaReauthRequiredError();
  }
}

/** Type guard para el catch de las acciones protegidas. */
export function isMfaReauthRequired(err: unknown): err is MfaReauthRequiredError {
  return err instanceof MfaReauthRequiredError;
}
