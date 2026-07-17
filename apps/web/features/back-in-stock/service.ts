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
    take: 200,
    select: { id: true, email: true, product: { select: { name: true, slug: true } } },
  });

  let sent = 0;
  for (const s of subs) {
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
  logger.info({ event: "back_in_stock.batch", considered: subs.length, sent });
  return { sent, considered: subs.length };
}
