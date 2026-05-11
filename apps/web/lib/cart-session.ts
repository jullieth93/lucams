/*
 * Cart session — cookie sessionId para carritos anon.
 *
 * Modelo:
 *   - Cookie `cart_session` con un UUID v4 generado server-side.
 *   - Cart.sessionId @unique en DB — el sessionId mapea 1:1 a un Cart.
 *   - HttpOnly + SameSite=Lax + Secure(prod) + 30 días.
 *   - Sin firmar (HMAC) — el sessionId es alta entropía (122 bits) y
 *     el carrito anon no contiene datos sensibles (sin PII, sin precio
 *     final autoritativo). Adversary que adivine la cookie de otro
 *     usuario ve y modifica su carrito vacío — no es vector de daño.
 *     Si más adelante guardamos `customDesign` con datos sensibles, se
 *     evalúa firmar.
 *
 * Uso:
 *   const sessionId = await getOrCreateCartSession();   // crea si falta
 *   const sessionId = await peekCartSession();          // null si no hay
 *   await clearCartSession();                           // logout/checkout
 */

import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const COOKIE_NAME = "cart_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

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
  c.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearCartSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}
