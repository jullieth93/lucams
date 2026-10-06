/*
 * Referidos v2 (2026-10-05; v1: Lucy 2026-08-11, "Referidos v1 simple").
 *
 * Flujo:
 *  1. /mi-cuenta muestra tu código + link de compartir (wa.me).
 *  2. El registro acepta "código de referido" (opcional) → crea Referral PENDING,
 *     marca Customer.referredById y emite DE INMEDIATO el cupón de bienvenida
 *     del REFERIDO (PERCENT 10, 1 uso, 90 días, isPublic=false, customerId),
 *     visible en /mi-cuenta/cupones.
 *  3. Cuando el referido paga su PRIMER pedido, la saga llama
 *     issueReferralRewardsIfFirstPaidOrder: SOLO el referente recibe su cupón
 *     (el del referido ya existe desde el registro) y la Referral queda
 *     REWARDED. Excepción legacy: referidos PENDING creados en v1 (sin cupón
 *     de bienvenida) lo reciben aquí una sola vez.
 *
 * Idempotencia: la recompensa se mueve con la misma Referral (status PENDING→
 * REWARDED dentro de tx); un retry de la saga no duplica cupones. El ata se
 * deduplica por email referido (una sola Referral + un solo cupón de
 * bienvenida por correo, aunque el registro se reintente).
 */

import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { renderReferralRewardEmail } from "@/features/emails/registry";

const REWARD_PERCENT = 10;
const REWARD_DAYS = 90;

// Prefijo fijo de la description del cupón de bienvenida: lo usa el chequeo
// legacy de issueReferralRewardsIfFirstPaidOrder para no emitirlo dos veces,
// y lo distingue de los cupones v1 ("Referidos: regalo para…") en el backfill
// de la migración 20261005120000.
const WELCOME_DESC_PREFIX = "Referidos: bienvenida para";

function rewardValidityDays() {
  return new Date(Date.now() + REWARD_DAYS * 24 * 60 * 60 * 1000);
}

/** Campos comunes de los cupones personales del programa (bienvenida y premio). */
function personalCouponBase() {
  return {
    type: "PERCENT" as const,
    value: REWARD_PERCENT,
    maxUses: 1,
    maxUsesPerCustomer: 1,
    isPublic: false,
    validFrom: new Date(),
    validTo: rewardValidityDays(),
    createdBy: "referrals-v1",
  };
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function couponCode(prefix: string): string {
  // F-10 (security audit 2026-08-24): the old middle segment derived from the
  // recipient's email — predictable and it leaked 4 email chars into a code
  // that travels by plain email. Now the whole secret is 6 CSPRNG bytes →
  // 8 base64url chars uppercased (≈42 effective bits; it was 16).
  return `${prefix}-${randomBytes(6).toString("base64url").toUpperCase()}`;
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
 * propio email del referente; crea la Referral PENDING, marca referredById y
 * emite el cupón de BIENVENIDA del referido (lo ve en /mi-cuenta/cupones).
 * Devuelve null si se ató, o el mensaje de error para el campo.
 *
 * La dupla (Referral + cupón) se deduplica por email referido: un doble
 * registro con el mismo correo no crea segunda Referral ni segundo cupón.
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
  const email = input.refereeEmail.toLowerCase().trim();
  await prisma.$transaction(async (tx) => {
    // Dedup por email referido: un doble registro no crea una segunda Referral
    // (dos PENDING del mismo email premiarían dos veces al referente en la saga).
    const existing = await tx.referral.findFirst({
      where: { referredEmail: email },
      select: { id: true },
    });
    if (existing) return;
    await tx.referral.create({
      data: {
        referrerId: referrer.id,
        referredEmail: email,
        status: "PENDING",
      },
    });
    await tx.customer.update({
      where: { id: input.refereeCustomerId },
      data: { referredById: referrer.id },
    });
    await tx.coupon.create({
      data: {
        ...personalCouponBase(),
        code: couponCode("REF"),
        description: `${WELCOME_DESC_PREFIX} ${email} (código de ${referrer.email})`,
        customerId: input.refereeCustomerId,
      },
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
 * Recompensa de referido: si el email del pedido tiene una Referral PENDING
 * y este es su PRIMER pedido pagado, emite el cupón personal del REFERENTE
 * (10%, 1 uso, 90 días) y marca la Referral como REWARDED. El cupón del
 * referido ya se emitió en el registro (attachReferral); la única excepción
 * son las Referral PENDING heredadas de v1, que lo reciben aquí una sola vez.
 * Idempotente por status. Best-effort: nunca lanza ni interrumpe la saga.
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

    const referrerCouponCode = couponCode("REF");
    // Legacy v1: el referido se registró ANTES de que el cupón de bienvenida
    // se emitiera en el signup — le toca aquí, una sola vez.
    let refereeWelcomeCode: string | null = null;

    await prisma.$transaction(async (tx) => {
      if (referee) {
        const alreadyWelcomed = await tx.coupon.findFirst({
          where: {
            customerId: referee.id,
            createdBy: "referrals-v1",
            deletedAt: null,
            description: { startsWith: WELCOME_DESC_PREFIX },
          },
          select: { id: true },
        });
        if (!alreadyWelcomed) {
          refereeWelcomeCode = couponCode("REF");
          await tx.coupon.create({
            data: {
              ...personalCouponBase(),
              code: refereeWelcomeCode,
              description: `${WELCOME_DESC_PREFIX} ${email} (código de ${referrer.email}) · pedido ${order.number}`,
              customerId: referee.id,
            },
          });
        }
      }
      await tx.coupon.create({
        data: {
          ...personalCouponBase(),
          code: referrerCouponCode,
          description: `Referidos: regalo para ${referrer.email} (trajo a ${email}) · pedido ${order.number}`,
          customerId: referrer.id,
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
      referrerCoupon: referrerCouponCode,
      refereeWelcomeCoupon: refereeWelcomeCode,
    });

    // Emails best-effort (fuera de la tx): cada uno recibe SU código.
    const rewardData = {
      percent: REWARD_PERCENT,
      validDays: REWARD_DAYS,
      orderNumber: order.number,
    };
    if (referee && refereeWelcomeCode) {
      const tpl = await renderReferralRewardEmail({
        ...rewardData,
        role: "referee",
        couponCode: refereeWelcomeCode,
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
    const tplR = await renderReferralRewardEmail({
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
