/*
 * Service para registrar consentimientos en DB (audit trail Ley 1581).
 *
 * Cada vez que el usuario interactúa con el banner de cookies, se
 * persiste UNA FILA por scope (necesarias / funcionales / analíticas
 * / marketing) con `accepted: true|false`. Esto permite:
 *   1. Demostrar consentimiento expreso ante SIC en caso de auditoría
 *   2. Trazar cambios de preferencias a lo largo del tiempo
 *   3. Si el aviso de privacidad cambia (nuevo `version`), requerir
 *      re-consent y comparar contra la versión que el usuario aceptó
 *
 * `version` viene de SiteSetting PRIVACY_POLICY_VERSION editable
 * desde admin. Cambiar el valor de ese setting invalida los consents
 * previos y dispara re-banner para visitantes recurrentes.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/cms";
import type { CookiePreferences } from "@/lib/cookie-consent";
import { CONSENT_SCOPES } from "@/lib/cookie-consent";

export async function recordCookieConsent(input: {
  prefs: CookiePreferences;
  customerId?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const version = await getSettingValue("PRIVACY_POLICY_VERSION", "v1");

  const rows = CONSENT_SCOPES.map((s) => ({
    scope: s.scope,
    accepted: !!input.prefs[s.key],
    version,
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    customerId: input.customerId ?? null,
    email: input.email ?? null,
  }));

  await prisma.consent.createMany({ data: rows });
}

/**
 * Registra la autorización de tratamiento de datos personales (habeas data, Ley 1581)
 * que el titular otorga al crear su cuenta. Sin esta fila, el "Al crear tu cuenta aceptas…"
 * del formulario es solo texto: no habría prueba auditable de "autorización previa, expresa
 * e informada" ante la SIC. Se registra UNA fila scope=HABEAS_DATA accepted=true, con la
 * versión vigente del aviso de privacidad + IP/UA para el audit trail.
 */
export async function recordHabeasDataConsent(input: {
  customerId: string;
  email: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const version = await getSettingValue("PRIVACY_POLICY_VERSION", "v1");
  await prisma.consent.create({
    data: {
      scope: "HABEAS_DATA",
      accepted: true,
      version,
      ipAddress: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      customerId: input.customerId,
      email: input.email,
    },
  });
}
