"use server";

/*
 * Rastreo público de pedidos (#14) — puerta de entrada segura al detalle del pedido.
 *
 * El cliente ingresa NÚMERO de pedido + CORREO. Si coinciden, lo mandamos a la vista pública
 * /pedido/<publicAccessToken> (que ya muestra estado, timeline y guía). Requerir AMBOS datos +
 * mensaje genérico + rate-limit evita enumerar pedidos por número. El token sigue siendo el permiso
 * real de acceso; /rastrear solo lo resuelve tras validar la identidad.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";

const Schema = z.object({
  number: z.string().trim().min(3, "Ingresa el número de tu pedido.").max(40),
  email: z.email("Ingresa el correo con el que hiciste el pedido.").trim().toLowerCase(),
});

export type RastrearState = { error?: string } | null;

export async function rastrearAction(
  _prev: RastrearState,
  formData: FormData,
): Promise<RastrearState> {
  const parsed = Schema.safeParse({
    number: formData.get("number"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: "Revisa el número de pedido y el correo." };
  }

  // Anti-abuso: 10 intentos por IP/hora (evita fuerza bruta de números + correos).
  const ip = getClientIp(await headers());
  const { allowed } = await rateLimit(ipKey("rastrear", ip), 10, 60 * 60);
  if (!allowed) {
    return { error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." };
  }

  // El número se guarda en mayúsculas (LCM-2026-0001); el correo se compara sin distinguir caso.
  const number = parsed.data.number.toUpperCase();
  const order = await prisma.order.findFirst({
    where: {
      number,
      email: { equals: parsed.data.email, mode: "insensitive" },
      deletedAt: null,
    },
    select: { publicAccessToken: true },
  });

  // Mensaje genérico (no revela si el número existe) — anti-enumeración.
  if (!order?.publicAccessToken) {
    logger.info({ event: "rastrear.miss", ip });
    return {
      error:
        "No encontramos un pedido con ese número y correo. Revísalos tal cual aparecen en tu correo de confirmación.",
    };
  }

  redirect(`/pedido/${order.publicAccessToken}`);
}
