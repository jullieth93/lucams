/*
 * Anti-abuso del pago contra entrega (COD) · ADR-065.
 *
 * Cada pedido COD genera una guía Aveonline REAL (costo de flete + comisión de recaudo) y despacha
 * mercancía que se cobra recién al entregar. Un abusador puede spamear pedidos COD con datos falsos o
 * sin intención de recibir → la tienda paga el flete de paquetes que se devuelven. El único guard
 * previo era un rate-limit por IP (débil: rotan IPs) + el on/off global COD_ENABLED.
 *
 * Este módulo evalúa el riesgo por IDENTIDAD (teléfono/email/DIRECCIÓN), no por IP: block-list manual,
 * no-show marcado por admin, devoluciones previas, velocidad, pedidos COD en vuelo y tope para clientes
 * sin historial. Si dispara, se BLOQUEA el COD (el cliente puede pagar en línea) — nunca se revela la
 * regla exacta (para no darle el mapa al abusador).
 *
 * Server-only. Fail-open: si la evaluación falla (DB), NO bloquea (no castigar a un cliente legítimo
 * por un hipo de infra; quedan el rate-limit por IP + COD_ENABLED).
 */

import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// Política anti-abuso COD (constantes documentadas; conservadoras para lanzamiento).
const COD_MAX_PER_IDENTITY_24H = 3; // pedidos COD por teléfono/email en 24h
const COD_MAX_OUTSTANDING = 3; // pedidos COD confirmados sin entregar, a la vez
const COD_NEW_CUSTOMER_MAX_COP = 30_000_00 * 10; // $300.000 — tope COD para clientes sin entrega previa

const BLOCK_MESSAGE =
  "Por seguridad, este pedido no puede ir contra entrega. Puedes completarlo pagando en línea (tarjeta, PSE o Nequi).";

export type CodRiskResult = { allowed: true } | { allowed: false; code: string; message: string };

/**
 * Evalúa si una orden PENDING (recién creada) puede confirmarse como COD. Devuelve allowed:false con
 * un mensaje amable (sin revelar la regla) si dispara alguna señal de abuso. Excluye la propia orden.
 */
export async function assessCodRisk(orderId: string): Promise<CodRiskResult> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, email: true, phone: true, total: true, shippingAddressKey: true },
    });
    if (!order) return { allowed: true };

    const email = order.email?.trim().toLowerCase() || null;
    const phone = order.phone?.trim() || null;
    const addressKey = order.shippingAddressKey || null;
    // Sin identidad no se puede evaluar (no debería pasar: checkout exige contacto) → permitir.
    if (!email && !phone && !addressKey) return { allowed: true };

    const identity: Prisma.OrderWhereInput["OR"] = [];
    if (phone) identity.push({ phone });
    if (email) identity.push({ email });
    // (a) Velocity por DIRECCIÓN: cuenta también pedidos que comparten la dirección de envío,
    // aunque el abusador rote teléfono/email.
    if (addressKey) identity.push({ shippingAddressKey: addressKey });
    const byIdentity = { OR: identity, deletedAt: null, id: { not: orderId } };
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // (b) Block-list persistente: Lucy vetó a mano un teléfono/email/dirección abusivos.
    const blockClauses: Prisma.BlockedIdentityWhereInput[] = [];
    if (phone) blockClauses.push({ kind: "PHONE", value: phone });
    if (email) blockClauses.push({ kind: "EMAIL", value: email });
    if (addressKey) blockClauses.push({ kind: "ADDRESS", value: addressKey });

    const [blocked, recentCod, outstandingCod, deliveredHistory, priorReturned, priorNoShow] =
      await Promise.all([
        // 0. Block-list explícita (fail-open: 0 si no hay claves que consultar).
        blockClauses.length
          ? prisma.blockedIdentity.count({ where: { OR: blockClauses } })
          : Promise.resolve(0),
        // 1. Velocidad: pedidos COD de esta identidad en las últimas 24h.
        prisma.order.count({
          where: { ...byIdentity, paymentMethod: "COD", createdAt: { gte: since24h } },
        }),
        // 2. En vuelo: COD confirmados sin entregar (exposición acumulada de flete).
        prisma.order.count({
          where: {
            ...byIdentity,
            paymentMethod: "COD",
            status: { in: ["PAID", "FULFILLING", "SHIPPED"] },
          },
        }),
        // 3. Historial: ¿algún pedido ENTREGADO antes? (cualquier método) → cliente "conocido".
        prisma.order.count({ where: { ...byIdentity, status: "DELIVERED" } }),
        // 4. Devolución previa: un COD que el courier devolvió (RETURNED/EXCEPTION marca el motivo).
        prisma.order.count({
          where: {
            ...byIdentity,
            paymentMethod: "COD",
            needsReconciliation: true,
            reconciliationReason: { contains: "DEVUELTO" },
          },
        }),
        // 5. (c) No-show: un admin marcó a esta identidad como NO RECIBIDO en un pedido previo.
        prisma.order.count({ where: { ...byIdentity, noShowAt: { not: null } } }),
      ]);

    let code: string | null = null;
    if (blocked > 0) code = "blocklist";
    else if (priorNoShow > 0) code = "prior_noshow";
    else if (priorReturned > 0) code = "prior_return";
    else if (recentCod >= COD_MAX_PER_IDENTITY_24H) code = "velocity";
    else if (outstandingCod >= COD_MAX_OUTSTANDING) code = "outstanding";
    else if (deliveredHistory === 0 && order.total > COD_NEW_CUSTOMER_MAX_COP)
      code = "new_high_value";

    if (code) {
      logger.warn(
        {
          event: "checkout.cod_risk.blocked",
          orderId,
          code,
          blocked,
          recentCod,
          outstandingCod,
          deliveredHistory,
          priorReturned,
          priorNoShow,
          total: order.total,
        },
        "COD bloqueado por anti-abuso",
      );
      return { allowed: false, code, message: BLOCK_MESSAGE };
    }
    return { allowed: true };
  } catch (err) {
    // Fail-open: no bloquear a un cliente legítimo por un fallo de infra.
    logger.warn(
      {
        event: "checkout.cod_risk.error",
        orderId,
        err: err instanceof Error ? err.message : String(err),
      },
      "Evaluación anti-abuso COD falló — se permite (fail-open)",
    );
    return { allowed: true };
  }
}
