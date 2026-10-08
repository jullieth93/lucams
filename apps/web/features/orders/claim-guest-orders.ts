/*
 * Claim de órdenes de INVITADO al verificar/registrar la cuenta (E2, 2026-10-07).
 *
 * Problema: las compras guest nacen con Order.customerId = null (el email viaja
 * en Order.email — ver order-customer.ts). Si esa persona se registra después
 * con el MISMO correo, sus pedidos nunca aparecían en /mi-cuenta/pedidos porque
 * nadie los vinculaba a su Customer nuevo.
 *
 * claimGuestOrdersForCustomer re-vincula esas órdenes (customerId null + email
 * equals insensitive + deletedAt null) al Customer recién verificado. SEGURIDAD:
 * solo se invoca tras verifyOtp EXITOSO (confirmar-codigo) o tras un login con
 * password válido (JIT de login/actions) — NUNCA antes de probar que el caller
 * controla el buzón, o un atacante podría adjudicarse pedidos ajenos con solo
 * registrarse con el email de la víctima.
 *
 * Bonus: también adopta los Designs de esas órdenes (design.customerId null,
 * creados en flujo anónimo con sessionId) → customerId, para que "repetir
 * pedido" pueda clonarlos desde la cuenta.
 *
 * Módulo sin "server-only" (mismo patrón que order-customer.ts) para testearlo
 * directo con prisma mockeado.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Vincula al Customer las órdenes guest hechas con su email. Devuelve cuántas
 * órdenes se claimaron (0 si no había). Idempotente: una segunda corrida no
 * encuentra órdenes con customerId null y no hace nada.
 */
export async function claimGuestOrdersForCustomer(
  customerId: string,
  email: string,
): Promise<number> {
  const claimed = await prisma.order.updateMany({
    where: {
      customerId: null,
      email: { equals: email.trim(), mode: "insensitive" },
      deletedAt: null,
    },
    data: { customerId },
  });

  if (claimed.count === 0) return 0;

  logger.info({ event: "order.guest_claim", customerId, count: claimed.count });

  // Bonus — adoptar los Designs de las órdenes claimadas: nacieron en flujo
  // anónimo (customerId null + sessionId) y sin dueño no se pueden clonar en
  // "repetir pedido". Solo los que SIGUEN sin dueño (customerId null): un
  // design ya vinculado a otro Customer jamás se toca.
  const items = await prisma.orderItem.findMany({
    where: {
      order: { customerId, email: { equals: email.trim(), mode: "insensitive" }, deletedAt: null },
      designId: { not: null },
    },
    select: { designId: true },
  });
  const designIds = [
    ...new Set(items.map((i) => i.designId).filter((id): id is string => Boolean(id))),
  ];
  if (designIds.length > 0) {
    const adopted = await prisma.design.updateMany({
      where: { id: { in: designIds }, customerId: null },
      data: { customerId },
    });
    if (adopted.count > 0) {
      logger.info({
        event: "order.guest_claim.designs_adopted",
        customerId,
        count: adopted.count,
      });
    }
  }

  return claimed.count;
}
