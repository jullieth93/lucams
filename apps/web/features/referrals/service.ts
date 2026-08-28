/*
 * Referidos v1 (Lucy 2026-08-11, "Referidos v1 simple").
 *
 * Flujo:
 *  1. /mi-cuenta muestra tu código + link de compartir (wa.me).
 *  2. El registro acepta "código de referido" (opcional) → crea Referral PENDING
 *     y marca Customer.referredById.
 *  3. Cuando el referido paga su PRIMER pedido, la saga llama
 *     issueReferralRewardsIfFirstPaidOrder: ambos reciben un cupón personal
 *     (PERCENT 10, 1 uso, 90 días, isPublic=false) por email y la Referral
 *     queda REWARDED.
 *
 * Idempotencia: la recompensa se mueve con la misma Referral (status PENDING→
 * REWARDED dentro de tx); un retry de la saga no duplica cupones.
 */

import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { referralRewardEmail } from "@/features/emails/templates/referral-reward";

const REWARD_PERCENT = 10;
const REWARD_DAYS = 90;

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function couponCode(prefix: string, seed: string): string {
  return `${prefix}-${seed
    .replace(/[^A-Z0-9]/gi, "")
    .slice(-4)
    .toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

/** Busca el dueño de un código de referido (para validar el campo del registro). */
export async function findReferrerByCode(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  return prisma.customer.findFirst({
    where: { referralCode: { equals: code, mode: "insensitive" }, deletedAt: null },
    select: { id: true, email: true, firstName: true, referralCode: true },
  });
}

/**
 * Ata de referido en el signup: valida que el código exista y que no sea el
 * propio email del referente; crea la Referral PENDING y marca referredById.
 * Devuelve null si se ató, o el mensaje de error para el campo.
 */
export async function attachReferral(input: {
  refereeCustomerId: string;
  refereeEmail: string;
  rawCode: string;
}): Promise<{ error: string } | null> {
  const code = normalizeCode(input.rawCode);
  if (!code) return null; // campo opcional vacío: nada que hacer
  const referrer = await findReferrerByCode(code);
  if (!referrer) return { error: "Ese código de referido no existe." };
  if (referrer.email.toLowerCase() === input.refereeEmail.toLowerCase()) {
    return { error: "No puedes usar tu propio código de referido." };
  }
  await prisma.$transaction(async (tx) => {
    await tx.referral.create({
      data: {
        referrerId: referrer.id,
        referredEmail: input.refereeEmail.toLowerCase().trim(),
        status: "PENDING",
      },
    });
    await tx.customer.update({
      where: { id: input.refereeCustomerId },
      data: { referredById: referrer.id },
    });
  });
  logger.info({
    event: "referral.attached",
    referrerId: referrer.id,
    code,
  });
  return null;
}

/**
 * Recompensa de referido v1: si el email del pedido tiene una Referral PENDING
 * y este es su PRIMER pedido pagado, emite cupón personal para AMBOS (10%, 1
 * uso, 90 días) y marca la Referral como REWARDED. Idempotente por status.
 * Best-effort: nunca lanza ni interrumpe la saga.
 */
export async function issueReferralRewardsIfFirstPaidOrder(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, number: true, email: true, status: true },
    });
    if (!order) return;
    const email = order.email.toLowerCase().trim();

    const referral = await prisma.referral.findFirst({
      where: { referredEmail: email, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    if (!referral) return;
    // Referral.referrerId es String pelado (sin @relation en el schema v1) —
    // el referente se resuelve aparte.
    const referrer = await prisma.customer.findFirst({
      where: { id: referral.referrerId, deletedAt: null },
      select: { id: true, email: true, firstName: true },
    });
    if (!referrer) return;

    // ¿Primer pedido pagado de este email? (contando el actual). Los estados
    // "dinero recibido" son PAID en adelante (fulfillment/entrega incluidos).
    const paidCount = await prisma.order.count({
      where: {
        email,
        deletedAt: null,
        status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
      },
    });
    if (paidCount > 1) {
      // Ya había pagado antes: la Referral no aplica y queda descartada para
      // no re-evaluarla en cada pedido futuro.
      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: "EXPIRED" },
      });
      return;
    }

    const referee = await prisma.customer.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, firstName: true },
    });
    const validTo = new Date(Date.now() + REWARD_DAYS * 24 * 60 * 60 * 1000);

    const refereeCouponCode = couponCode("REF", email);
    const referrerCouponCode = couponCode("REF", referrer.email);

    await prisma.$transaction(async (tx) => {
      const base = {
        type: "PERCENT" as const,
        value: REWARD_PERCENT,
        maxUses: 1,
        maxUsesPerCustomer: 1,
        isPublic: false,
        validFrom: new Date(),
        validTo,
        createdBy: "referrals-v1",
      };
      await tx.coupon.create({
        data: {
          ...base,
          code: refereeCouponCode,
          description: `Referidos: regalo para ${email} (vino de ${referrer.email}) · pedido ${order.number}`,
        },
      });
      await tx.coupon.create({
        data: {
          ...base,
          code: referrerCouponCode,
          description: `Referidos: regalo para ${referrer.email} (trajo a ${email}) · pedido ${order.number}`,
        },
      });
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: "REWARDED", rewardedAt: new Date() },
      });
    });
    logger.info({
      event: "referral.rewarded",
      referralId: referral.id,
      orderNumber: order.number,
      refereeCoupon: refereeCouponCode,
      referrerCoupon: referrerCouponCode,
    });

    // Emails best-effort (fuera de la tx): cada uno recibe SU código.
    const rewardData = {
      percent: REWARD_PERCENT,
      validDays: REWARD_DAYS,
      orderNumber: order.number,
    };
    if (referee) {
      const tpl = await referralRewardEmail({
        ...rewardData,
        role: "referee",
        couponCode: refereeCouponCode,
        firstName: referee.firstName,
        friendName: referrer.firstName,
      });
      await sendEmail({
        to: referee.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        idempotencyKey: `referral:${referral.id}:referee`,
        tags: [{ name: "type", value: "referral_reward" }],
      });
    }
    const tplR = await referralRewardEmail({
      ...rewardData,
      role: "referrer",
      couponCode: referrerCouponCode,
      firstName: referrer.firstName,
      friendName: referee?.firstName ?? null,
    });
    await sendEmail({
      to: referrer.email,
      subject: tplR.subject,
      html: tplR.html,
      text: tplR.text,
      idempotencyKey: `referral:${referral.id}:referrer`,
      tags: [{ name: "type", value: "referral_reward" }],
    });
  } catch (err) {
    logger.error({
      event: "referral.reward_fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
