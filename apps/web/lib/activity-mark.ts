/*
 * Primitivo compartido de marca de actividad FIRMADA: `<ts>.<hmac-sha256(ts)>`
 * con CSRF_SECRET (digest base64url, timing-safe compare — mismo patrón que
 * lib/checkout-session.ts). Extraído de lib/admin-activity.ts (2026-10-12) al
 * agregar la marca de cliente (lib/customer-activity.ts): una sola
 * implementación de sellar/verificar para ambas ventanas de inactividad.
 *
 * La firma existe para que un set de cookies robado no pueda fabricar
 * `<cookie>=<now>` y evadir el idle-timeout indefinidamente (B-8, auditoría
 * 2026-08-24). `node:crypto` es seguro acá: el runtime del proxy en Next.js 16
 * es `nodejs` (edge ya no se soporta en proxy).
 */

import crypto from "node:crypto";

function getSecret(): string {
  const secret = process.env.CSRF_SECRET?.trim();
  if (!secret || secret.startsWith("GENERATE_WITH")) {
    throw new Error(
      "CSRF_SECRET no configurado (usado para firmar las marcas de actividad). " +
        "Generar con: openssl rand -hex 32",
    );
  }
  return secret;
}

function signMark(ts: string): string {
  return crypto.createHmac("sha256", getSecret()).update(ts).digest("base64url");
}

/** Emite la marca de actividad firmada para `now` (epoch ms): `<ts>.<hmac-sha256(ts)>`. */
export function sealActivityMark(now: number): string {
  const ts = String(now);
  return `${ts}.${signMark(ts)}`;
}

/**
 * Verifica la marca de actividad que llega en la request. Devuelve el timestamp
 * de actividad (epoch ms), o null si la marca falta, es malformada o la firma
 * no coincide (forjada) — el caller trata null como stale.
 */
export function readActivityMark(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const ts = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!/^\d+$/.test(ts)) return null;
  const expected = signMark(ts);
  // timing-safe compare (mismo patrón que lib/checkout-session.ts)
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return Number(ts);
}

export type ActivityMarkInspection =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "valid"; at: number };

/**
 * Versión DISCRIMINADA de readActivityMark (2026-10-22): distingue AUSENTE de
 * PRESENTE-PERO-INVÁLIDA (malformada o firma que no coincide = forjada). El
 * idle-timeout de CLIENTE los trata distinto (ausente con sesión verificada se
 * re-sella; forjada revoca — ver lib/customer-activity.ts); el de ADMIN sigue
 * fail-closed con ambos vía readActivityMark.
 */
export function inspectActivityMark(raw: string | undefined | null): ActivityMarkInspection {
  if (!raw) return { status: "absent" };
  const at = readActivityMark(raw);
  return at === null ? { status: "invalid" } : { status: "valid", at };
}
