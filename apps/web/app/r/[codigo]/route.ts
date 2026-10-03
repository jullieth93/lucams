/*
 * /r/[codigo] — short-link de referidos (T8, 2026-10-01).
 *
 * El link que el cliente copia/comparte en /mi-cuenta pasa de
 * `/registro?ref=<codigo>` a `/r/<codigo>` (más corto para WhatsApp). Esta
 * ruta redirige 307 a `/registro?ref=<codigo>` con el MISMO saneamiento que
 * hace /registro (app/(auth)/registro/page.tsx): regex de código
 * [A-Za-z0-9-]{4,20} + uppercase. Código inválido → /registro sin ref
 * (sin error feo; el registro simplemente no pre-llena el campo).
 *
 * El proxy (apps/web/proxy.ts) no interfiere: /r/* no es /api ni /admin, así
 * que solo pasa por el lookup de UrlRedirect (sin fila para /r/... → miss) y
 * los security headers de siempre.
 */

import { NextResponse } from "next/server";

// Mismo regex que app/(auth)/registro/page.tsx — si cambia allá, cambia acá.
const CODE_REGEX = /^[A-Za-z0-9-]{4,20}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> },
): Promise<Response> {
  const { codigo } = await params;
  const code = codigo.trim();
  const target = CODE_REGEX.test(code)
    ? `/registro?ref=${encodeURIComponent(code.toUpperCase())}`
    : "/registro";
  return NextResponse.redirect(new URL(target, request.url), 307);
}
