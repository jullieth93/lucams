"use server";

/*
 * Rastreo público de pedidos (#14) — puerta de entrada segura al detalle del pedido.
 *
 * El cliente ingresa NÚMERO de pedido + CORREO. Si coinciden, lo mandamos a la vista pública
 * /pedido/<token> (que ya muestra estado, timeline y guía). Requerir AMBOS datos + mensaje
 * genérico + rate-limit evita enumerar pedidos por número.
 *
 * F-11 (auditoría seguridad 2026-08-24): el token ya no se guarda en claro, así que no podemos
 * releer el original. Tras la prueba de identidad ROTAMOS el token (hash nuevo en DB, plano en
 * el redirect) — los links emitidos antes para esa orden dejan de funcionar. El token sigue
 * siendo el permiso real de acceso; /rastrear solo emite uno nuevo tras validar la identidad.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { hashBearerToken } from "@/lib/token-hash";
import { logger } from "@/lib/logger";
import { getCmsBlock } from "@/lib/cms";

// Mensajes de error visibles: editables desde /admin/contenido (página
// "Rastrear pedido"). El fallback es el texto exacto anterior (REGLA DE ORO).
async function cmsErrorText(key: string, fallback: string): Promise<string> {
  const block = await getCmsBlock(key);
  return block?.body ?? fallback;
}

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
    return {
      error: await cmsErrorText("track.error.invalid", "Revisa el número de pedido y el correo."),
    };
  }

  // Anti-abuso: 10 intentos por IP/hora (evita fuerza bruta de números + correos).
  const ip = getClientIp(await headers());
  const { allowed } = await rateLimit(ipKey("rastrear", ip), 10, 60 * 60);
  if (!allowed) {
    return {
      error: await cmsErrorText(
        "track.error.rate-limit",
        "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      ),
    };
  }

  // El número se guarda en mayúsculas (LCM-2026-0001); el correo se compara sin distinguir caso.
  const number = parsed.data.number.toUpperCase();
  const order = await prisma.order.findFirst({
    where: {
      number,
      email: { equals: parsed.data.email, mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });

  // Mensaje genérico (no revela si el número existe) — anti-enumeración.
  if (!order) {
    logger.info({ event: "rastrear.miss", ip });
    return {
      error: await cmsErrorText(
        "track.error.not-found",
        "No encontramos un pedido con ese número y correo. Revísalos tal cual aparecen en tu correo de confirmación.",
      ),
    };
  }

  // F-11 — identidad probada (número + correo, rate-limited): emitimos un token
  // NUEVO y redirigimos a él. Rotación: invalida los links previos de la orden
  // (el original no se puede releer — en DB solo queda su hash).
  const token = crypto.randomBytes(16).toString("hex");
  await prisma.order.update({
    where: { id: order.id },
    data: { publicAccessTokenHash: hashBearerToken(token) },
  });
  redirect(`/pedido/${token}`);
}
