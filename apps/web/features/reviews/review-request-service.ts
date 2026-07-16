import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { reviewRequestEmail } from "@/features/emails/templates/review-request";

/*
 * Palanca de reseñas (auditoría 2026-07-13): follow-up DEMORADO a pedidos entregados hace 7-30 días
 * que aún no recibieron la solicitud. Idempotente (Order.reviewRequestedAt + idempotencyKey de
 * Resend). Best-effort por pedido. Se agenda con pg_cron vía /api/cron/review-request.
 */

type ShippingAddr = { fullName?: string };
const DAY_MS = 24 * 60 * 60 * 1000;

export async function sendReviewRequests(
  now: Date = new Date(),
): Promise<{ sent: number; considered: number }> {
  const notOlderThan = new Date(now.getTime() - 30 * DAY_MS); // ignora entregas > 30 días
  const atLeastSince = new Date(now.getTime() - 7 * DAY_MS); // al menos 7 días desde la entrega

  const orders = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      reviewRequestedAt: null,
      deliveredAt: { gte: notOlderThan, lte: atLeastSince },
    },
    orderBy: { deliveredAt: "asc" },
    take: 100, // batch acotado por corrida (el cron corre a diario)
    select: {
      id: true,
      number: true,
      email: true,
      shippingAddress: true,
      items: {
        select: { variant: { select: { product: { select: { name: true, slug: true } } } } },
      },
    },
  });

  let sent = 0;
  for (const order of orders) {
    try {
      // Productos ÚNICOS por slug (un pedido puede repetir producto en varias líneas).
      const seen = new Set<string>();
      const products: Array<{ name: string; slug: string }> = [];
      for (const it of order.items) {
        const p = it.variant.product;
        if (!seen.has(p.slug)) {
          seen.add(p.slug);
          products.push({ name: p.name, slug: p.slug });
        }
      }

      // Sin productos legibles (caso raro) → marcar para no reconsiderar en cada corrida.
      if (products.length === 0) {
        await prisma.order.update({ where: { id: order.id }, data: { reviewRequestedAt: now } });
        continue;
      }

      const ship = (order.shippingAddress ?? {}) as ShippingAddr;
      const tpl = await reviewRequestEmail({
        orderNumber: order.number,
        customerName: ship.fullName ?? "Cliente",
        products,
      });
      const result = await sendEmail({
        to: order.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        idempotencyKey: `${order.number}-review-request`,
        tags: [
          { name: "type", value: "review_request" },
          { name: "order_number", value: order.number },
        ],
      });

      if (result.sent) {
        await prisma.order.update({ where: { id: order.id }, data: { reviewRequestedAt: now } });
        sent++;
      } else if (result.skipped) {
        // Dev sin RESEND_API_KEY → marcar igual para no reintentar en loop.
        await prisma.order.update({ where: { id: order.id }, data: { reviewRequestedAt: now } });
      }
      // Fallo REAL (no skipped): dejamos reviewRequestedAt=null → se reintenta el próximo ciclo.
    } catch (err) {
      logger.error({
        event: "review_request.fail",
        orderId: order.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ event: "review_request.batch", considered: orders.length, sent });
  return { sent, considered: orders.length };
}
