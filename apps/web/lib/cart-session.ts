/*
 * Cart session — cookie sessionId para carritos anon.
 *
 * Modelo de amenazas VIGENTE (actualizado 2026-10-31, LUC-SEC-013 — el
 * anterior decía "el carrito no contiene datos sensibles", de antes de que la
 * identidad anónima protegiera diseños y fotos):
 *   - Cookie `cart_session` con un UUID v4 generado server-side.
 *   - Cart.sessionId @unique en DB — el sessionId mapea 1:1 a un Cart.
 *   - HttpOnly + SameSite=Lax + Secure(prod) + 30 días.
 *   - Sin firmar (HMAC) — el sessionId es alta entropía (122 bits) y firmarlo
 *     NO evita el robo de cookie (quien la roba la presenta firmada igual).
 *   - QUÉ ABRE HOY la cookie (por eso ya no es "sin datos sensibles"):
 *     el carrito, los borradores de diseño y —desde LUC-SEC-001— los previews
 *     de diseños personales vía /api/design-preview/* (Design.sessionId).
 *     Quien robe la cookie ve las fotos/diseños de esa sesión anónima.
 *   - Mitigaciones vigentes: rotación en self-heal de identidad
 *     (CART_IDENTITY_MISMATCH) y borrado en logout (auth/logout/actions.ts);
 *     purga de borradores anónimos idle (30 d) y de datos post-entrega (90 d)
 *     vía los crons de retención; el valor nunca se loguea ni va en URLs.
 *   - Residual ACEPTADO (decisión de producto pendiente del owner): el
 *     checkout NO rota la cookie — la página de gracias y la recuperación de
 *     carrito al re-login (ADR-171) dependen de ella. Diseños de pedidos
 *     pagados quedan además cubiertos por los tokens de orden (?ot=) y por la
 *     cuenta del cliente. Si el owner decide rotar en checkout, hay que mover
 *     la página de gracias a capacidad por token primero.
 *
 * Uso:
 *   const sessionId = await getOrCreateCartSession();   // crea si falta
 *   const sessionId = await peekCartSession();          // null si no hay
 *   const sessionId = await rotateCartSession();        // sesión nueva (self-heal)
 *   await clearCartSession();                           // logout/checkout
 */

import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const COOKIE_NAME = "cart_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

/** Nombre de la cookie — exportado para el Route Handler /auth/callback, que
 *  escribe la cookie en el RESPONSE (no vía cookies() de next/headers). */
export const CART_SESSION_COOKIE = COOKIE_NAME;

/** Opciones de la cookie — misma razón de exportación que CART_SESSION_COOKIE. */
export function cartSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  } as const;
}

export async function peekCartSession(): Promise<string | null> {
  const c = await cookies();
  const value = c.get(COOKIE_NAME)?.value;
  if (!value) return null;
  // Defensa básica: rechazar si no luce como UUID.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value;
}

export async function getOrCreateCartSession(): Promise<string> {
  const existing = await peekCartSession();
  if (existing) return existing;
  const sessionId = randomUUID();
  await setCartSessionCookie(sessionId);
  return sessionId;
}

export async function setCartSessionCookie(sessionId: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE_NAME, sessionId, cartSessionCookieOptions());
}

/**
 * Mint a fresh sessionId and replace the cookie, abandoning the current one.
 * Self-heal for CART_IDENTITY_MISMATCH (shared device / cookie not rotated
 * after an account switch): the cart of the old sessionId stays untouched in
 * DB for its real owner; the caller retries the operation once with the new
 * session.
 */
export async function rotateCartSession(): Promise<string> {
  const sessionId = randomUUID();
  await setCartSessionCookie(sessionId);
  return sessionId;
}

export async function clearCartSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}
