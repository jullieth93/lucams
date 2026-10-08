/*
 * POST /api/designs/save-canvas — guardado del canvas del Estudio vía sendBeacon.
 *
 * Ronda 2 QA (2026-10-08): el auto-save del Estudio es una Server Action con
 * debounce de 2 s; al recargar/cerrar la página dentro de esa ventana, el fetch
 * de la action muere con la navegación y «Continuar donde quedaste» volvía con
 * el lienzo VACÍO (confirmado con Playwright: 0/6 fotos tras resume). El flush
 * con la action seguía abortándose en unload; `navigator.sendBeacon` es la vía
 * del navegador para fire-and-forget confiable durante pagehide — esta ruta es
 * su destino. Es el MISMO contrato que saveCanvasAction (SaveCanvasSchema +
 * saveCanvas + ownership por customerId/sessionId de las cookies, que el beacon
 * envía same-origin). Respuesta mínima: el cliente no la lee (fire-and-forget).
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentCustomer } from "@/lib/auth";
import { peekCartSession } from "@/lib/cart-session";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { SaveCanvasSchema } from "@/features/personalization/schemas";
import { saveCanvas } from "@/features/personalization/service";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = SaveCanvasSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Mismo techo generoso que la action (auto-save legítimo por sesión).
  const rl = await rateLimit(
    ipKey("save_canvas_beacon", getClientIp(await headers())),
    process.env.VERCEL_ENV === "production" ? 600 : 2000,
    600,
  );
  if (!rl.allowed) {
    logger.warn({ event: "design.save_canvas_beacon.rate_limited", count: rl.count });
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const session = await getCurrentCustomer();
  const customerId = session?.customer.id ?? null;
  const sessionId = customerId ? null : await peekCartSession();
  try {
    await saveCanvas({
      designId: parsed.data.designId,
      canvasData: parsed.data.canvasData,
      templateId: parsed.data.templateId,
      customerId,
      sessionId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.warn(
      {
        event: "design.save_canvas_beacon.fail",
        designId: parsed.data.designId,
        err: err instanceof Error ? err.message : String(err),
      },
      "saveCanvas beacon failed",
    );
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
