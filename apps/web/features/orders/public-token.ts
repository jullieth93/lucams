import "server-only";

/*
 * Rotación del token público de una Order (F-11).
 *
 * El token plano NUNCA se persiste (en DB solo vive su hash sha256), así que
 * no se puede releer: cada vez que un flujo autorizado necesita entregar un
 * link /pedido/<token> (rastrear con número+correo, email de confirmación al
 * invitado), emite uno FRESCO y guarda su hash — los links previos de la orden
 * dejan de funcionar. El último token emitido es el único válido.
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { hashBearerToken } from "@/lib/token-hash";

/**
 * Genera un token público nuevo para la orden, persiste su hash y devuelve el
 * plano (para construir el link /pedido/<token>). Invalida los tokens previos.
 */
export async function rotateOrderPublicAccessToken(orderId: string): Promise<string> {
  const token = crypto.randomBytes(16).toString("hex");
  await prisma.order.update({
    where: { id: orderId },
    data: { publicAccessTokenHash: hashBearerToken(token) },
  });
  return token;
}
