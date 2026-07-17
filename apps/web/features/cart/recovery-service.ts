import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { peekCartSession } from "@/lib/cart-session";
import { cartRecoveryEmail } from "@/features/emails/templates/cart-recovery";

/*
 * Recuperación de carrito abandonado (palanca de ingreso, auditoría 2026-07-13).
 *  - recordAbandonedCartEmail: hook ADITIVO del checkout (al escribir el email) que registra el
 *    carrito como abandonable + genera un token de recuperación. Best-effort → nunca rompe checkout.
 *  - sendCartRecoveryReminders: cron que envía UN recordatorio a carritos con email, inactivos ≥4h,
 *    y detecta conversión (el saga soft-deletea el cart tras PAID → recoveredAt).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export async function recordAbandonedCartEmail(email: string): Promise<void> {
  try {
    const sessionId = await peekCartSession();
    if (!sessionId) return;
    const cart = await prisma.cart.findFirst({
      where: { sessionId, deletedAt: null },
      select: { id: true, _count: { select: { items: true } } },
    });
    if (!cart || cart._count.items === 0) return;
    await prisma.abandonedCart.upsert({
      where: { cartId: cart.id },
      create: {
        cartId: cart.id,
        email,
        recoverToken: crypto.randomBytes(24).toString("base64url"),
      },
      // Solo refresca el email si cambió; NO toca token/recovered/reminder (idempotente).
      update: { email },
    });
  } catch (err) {
    logger.error({
      event: "abandoned_cart.record.fail",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendCartRecoveryReminders(
  now: Date = new Date(),
): Promise<{ sent: number; recovered: number; considered: number }> {
  const notOlderThan = new Date(now.getTime() - 7 * DAY_MS); // ignora abandonos > 7 días
  const waitedAtLeast = new Date(now.getTime() - 4 * HOUR_MS); // esperar 4h antes de molestar

  const rows = await prisma.abandonedCart.findMany({
    where: {
      recoveredAt: null,
      lastReminderSentAt: null, // UN solo recordatorio por carrito
      createdAt: { gte: notOlderThan, lte: waitedAtLeast },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      email: true,
      recoverToken: true,
      cart: {
        select: {
          deletedAt: true,
          items: {
            select: { qty: true, variant: { select: { product: { select: { name: true } } } } },
          },
        },
      },
    },
  });

  let sent = 0;
  let recovered = 0;
  for (const row of rows) {
    try {
      // Convertido: el saga soft-deletea el cart tras PAID → marcar recuperado y no molestar.
      if (row.cart.deletedAt) {
        await prisma.abandonedCart.update({ where: { id: row.id }, data: { recoveredAt: now } });
        recovered++;
        continue;
      }
      const items = row.cart.items.map((i) => ({ name: i.variant.product.name, qty: i.qty }));
      // Carrito vaciado o sin token → marcar reminder para no reconsiderarlo cada corrida.
      if (items.length === 0 || !row.recoverToken) {
        await prisma.abandonedCart.update({
          where: { id: row.id },
          data: { lastReminderSentAt: now },
        });
        continue;
      }
      const tpl = await cartRecoveryEmail({ recoverToken: row.recoverToken, items });
      const result = await sendEmail({
        to: row.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        idempotencyKey: `cart-recovery-${row.id}`,
        tags: [{ name: "type", value: "cart_recovery" }],
      });
      if (result.sent || result.skipped) {
        await prisma.abandonedCart.update({
          where: { id: row.id },
          data: { lastReminderSentAt: now },
        });
        if (result.sent) sent++;
      }
      // Fallo REAL (no skipped) → dejar lastReminderSentAt=null → reintenta el próximo ciclo.
    } catch (err) {
      logger.error({
        event: "cart_recovery.fail",
        abandonedCartId: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ event: "cart_recovery.batch", considered: rows.length, sent, recovered });
  return { sent, recovered, considered: rows.length };
}
