import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { backInStockEmail } from "@/features/emails/templates/back-in-stock";

/*
 * "Avísame cuando vuelva" (palanca de ingreso, auditoría 2026-07-13). Suscripción por email a un
 * producto AGOTADO; el cron notifica al reponerse el stock. Funciona para anónimos y logueados.
 */

export async function subscribeBackInStock(
  productId: string,
  email: string,
  customerId: string | null,
): Promise<{ ok: boolean; reason?: "not_found" | "in_stock" }> {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true, deletedAt: null },
    select: {
      id: true,
      variants: { where: { deletedAt: null, isActive: true }, select: { stock: true } },
    },
  });
  if (!product) return { ok: false, reason: "not_found" };
  // Solo tiene sentido suscribirse a algo AGOTADO (anti-abuso + evita subs inútiles).
  if (product.variants.some((v) => v.stock > 0)) return { ok: false, reason: "in_stock" };

  await prisma.backInStockSubscription.upsert({
    where: { productId_email: { productId, email } },
    create: { productId, email, customerId },
    update: { notifiedAt: null, customerId }, // re-suscribir resetea el flag de notificado
  });
  return { ok: true };
}

export async function sendBackInStockNotifications(
  now: Date = new Date(),
): Promise<{ sent: number; considered: number }> {
  // Suscripciones aún NO notificadas de productos que AHORA tienen stock.
  const subs = await prisma.backInStockSubscription.findMany({
    where: {
      notifiedAt: null,
      product: {
        isActive: true,
        deletedAt: null,
        variants: { some: { deletedAt: null, isActive: true, stock: { gt: 0 } } },
      },
    },
    orderBy: { createdAt: "asc" }, // FIFO: primero los que llevan más esperando
    take: 200,
    select: {
      id: true,
      email: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          variants: { where: { deletedAt: null, isActive: true }, select: { stock: true } },
        },
      },
    },
  });

  // #13 — topar los avisos por producto al stock REALMENTE disponible (FIFO). Si Lucy repone 2
  // unidades y hay 50 suscriptores, avisamos solo a los 2 primeros; el resto queda notifiedAt=null
  // para una reposición futura → nadie llega a una PDP agotada por un aviso "¡volvió!".
  const byProduct = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = byProduct.get(s.product.id) ?? [];
    list.push(s);
    byProduct.set(s.product.id, list);
  }
  const eligible: typeof subs = [];
  for (const list of byProduct.values()) {
    const available = list[0].product.variants.reduce((a, v) => a + v.stock, 0);
    eligible.push(...list.slice(0, Math.max(0, available)));
  }

  let sent = 0;
  for (const s of eligible) {
    try {
      const tpl = await backInStockEmail({
        productName: s.product.name,
        productSlug: s.product.slug,
      });
      const result = await sendEmail({
        to: s.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        idempotencyKey: `back-in-stock-${s.id}`,
        tags: [{ name: "type", value: "back_in_stock" }],
      });
      // #18 — breaker abierto (skipped:'circuit-open') = fallo transitorio: NO marcar (aviso one-shot)
      // y cortar el batch; el marcado-sin-envío queda solo para el stub de dev ('no-api-key').
      if (!result.sent && result.skipped && result.reason === "circuit-open") break;
      if (result.sent || result.skipped) {
        await prisma.backInStockSubscription.update({
          where: { id: s.id },
          data: { notifiedAt: now },
        });
        if (result.sent) sent++;
      }
    } catch (err) {
      logger.error({
        event: "back_in_stock.fail",
        subId: s.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  logger.info({
    event: "back_in_stock.batch",
    considered: subs.length,
    notified: eligible.length,
    sent,
  });
  return { sent, considered: subs.length };
}
