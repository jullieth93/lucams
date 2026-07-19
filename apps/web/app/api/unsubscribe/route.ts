/*
 * POST /api/unsubscribe?u=… — One-Click unsubscribe (RFC 8058, auditoría v3 · #7).
 *
 * Los emails comerciales llevan el header List-Unsubscribe-Post: List-Unsubscribe=One-Click; Gmail/
 * Yahoo hacen POST a esta ruta con ese cuerpo y damos de baja SIN pasos extra. El param opaco `u`
 * (base64url(email).token) identifica y verifica al suscriptor sin exponer el email en claro.
 *
 * Devuelve 200 siempre que el token sea válido (idempotente); 400 si el param es inválido. No
 * requiere auth (el token ES la autorización). El GET humano sigue en /unsubscribe (page).
 */

import type { NextRequest } from "next/server";
import { decodeUnsubscribeParam, unsubscribeNewsletter } from "@/features/newsletter/unsubscribe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  const decoded = u ? decodeUnsubscribeParam(u) : null;
  if (!decoded) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const result = await unsubscribeNewsletter(decoded.email, decoded.token);
  // RFC 8058: al cliente de correo le basta un 2xx. Idempotente (already-unsubscribed → 200).
  return Response.json({ ok: result.ok });
}
