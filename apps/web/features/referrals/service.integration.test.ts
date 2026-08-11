/*
 * Integración DB — features/referrals/service (Referidos v1, 2026-08-11).
 *
 * Cubre: findReferrerByCode, attachReferral (código inválido, propio código,
 * vínculo PENDING) y issueReferralRewardsIfFirstPaidOrder (primer pedido pagado
 * → 2 cupones personales + REWARDED; pedido posterior → EXPIRED; idempotencia
 * del retry de la saga).
 *
 * Limpieza scoped por prefijo RUN (mismo patrón que las demás suites).
 * RESEND_API_KEY se vacía en beforeAll: los emails de recompensa quedan en stub
 * de dev (no se mandan correos reales a direcciones sintéticas).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  attachReferral,
  findReferrerByCode,
  issueReferralRewardsIfFirstPaidOrder,
} from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `ref${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

let referrerId = "";
let referrerEmail = `${RUN}-referrer@lucams.test`;
let referrerCode = `LCS-${RUN.slice(-6).toUpperCase()}X`;
let refereeId = "";
let refereeEmail = `${RUN}-referee@lucams.test`;

function makeOrderNumber(tag: string) {
  return `LCM-${RUN}-${tag}`.toUpperCase();
}

async function makePaidOrder(email: string, tag: string, createdMinutesAgo = 0) {
  const order = await prisma.order.create({
    data: {
      number: makeOrderNumber(tag),
      email,
      phone: "3001234567",
      shippingAddress: { fullName: "Test", city: "Bogotá", department: "Cundinamarca" },
      subtotal: 10_000,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 10_000,
      paymentMethod: "WOMPI",
      status: "PAID",
      createdAt: new Date(Date.now() - createdMinutesAgo * 60_000),
    },
    select: { id: true },
  });
  return order.id;
}

describe.skipIf(!hasDb)("referrals/service — integración DB", { timeout: T }, () => {
  beforeAll(async () => {
    process.env.RESEND_API_KEY = "";
    const referrer = await prisma.customer.create({
      data: {
        email: referrerEmail,
        supabaseUserId: `${RUN}-referrer-sub`,
        referralCode: referrerCode,
        firstName: "Referente",
      },
      select: { id: true },
    });
    referrerId = referrer.id;
    const referee = await prisma.customer.create({
      data: {
        email: refereeEmail,
        supabaseUserId: `${RUN}-referee-sub`,
        referralCode: `LCS-${RUN.slice(-4).toUpperCase()}YY`,
        firstName: "Referido",
      },
      select: { id: true },
    });
    refereeId = referee.id;
  }, T);

  afterAll(async () => {
    await prisma.referral.deleteMany({ where: { referredEmail: { contains: RUN } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: "REF-" }, description: { contains: RUN } } });
    await prisma.order.deleteMany({ where: { email: { contains: RUN } } });
    await prisma.customer.deleteMany({ where: { email: { contains: RUN } } });
  }, T);

  it("findReferrerByCode encuentra por código (case-insensitive) y null si no existe", async () => {
    const found = await findReferrerByCode(referrerCode.toLowerCase());
    expect(found?.id).toBe(referrerId);
    expect(await findReferrerByCode("LCS-NOEXISTE")).toBeNull();
  });

  it("attachReferral crea Referral PENDING y marca referredById", async () => {
    const err = await attachReferral({
      refereeCustomerId: refereeId,
      refereeEmail: refereeEmail,
      rawCode: referrerCode,
    });
    expect(err).toBeNull();
    const referral = await prisma.referral.findFirst({ where: { referredEmail: refereeEmail } });
    expect(referral).toMatchObject({ referrerId, status: "PENDING", rewardedAt: null });
    const referee = await prisma.customer.findUnique({
      where: { id: refereeId },
      select: { referredById: true },
    });
    expect(referee?.referredById).toBe(referrerId);
  });

  it("attachReferral rechaza código inexistente y el propio código", async () => {
    expect(
      await attachReferral({
        refereeCustomerId: refereeId,
        refereeEmail: refereeEmail,
        rawCode: "LCS-FALSO123",
      }),
    ).toEqual({ error: "Ese código de referido no existe." });
    expect(
      await attachReferral({
        refereeCustomerId: referrerId,
        refereeEmail: referrerEmail,
        rawCode: referrerCode,
      }),
    ).toEqual({ error: "No puedes usar tu propio código de referido." });
  });

  it("primer pedido pagado → cupón para AMBOS (10%, 1 uso) + Referral REWARDED; retry no duplica", async () => {
    const orderId = await makePaidOrder(refereeEmail, "first");
    await issueReferralRewardsIfFirstPaidOrder(orderId);

    const referral = await prisma.referral.findFirst({ where: { referredEmail: refereeEmail } });
    expect(referral?.status).toBe("REWARDED");
    expect(referral?.rewardedAt).not.toBeNull();

    const coupons = await prisma.coupon.findMany({
      where: { description: { contains: RUN } },
      orderBy: { code: "asc" },
    });
    expect(coupons).toHaveLength(2);
    for (const c of coupons) {
      expect(c).toMatchObject({ type: "PERCENT", value: 10, maxUses: 1, maxUsesPerCustomer: 1, isPublic: false });
    }

    // Retry de la saga (idempotente): sigue habiendo solo 2 cupones.
    await issueReferralRewardsIfFirstPaidOrder(orderId);
    expect(await prisma.coupon.count({ where: { description: { contains: RUN } } })).toBe(2);
  });

  it("si el referido YA tenía un pedido pagado previo → EXPIRED, sin cupones", async () => {
    const email2 = `${RUN}-late@lucams.test`;
    const referrer2 = await prisma.customer.create({
      data: {
        email: email2,
        supabaseUserId: `${RUN}-late-sub`,
        referralCode: `LCS-${RUN.slice(-4).toUpperCase()}ZZ`,
      },
      select: { id: true },
    });
    void referrer2;
    await attachReferral({
      refereeCustomerId: refereeId,
      refereeEmail: `${RUN}-viejo@lucams.test`,
      rawCode: referrerCode,
    });
    // Pedido pagado PREVIO al que dispara la evaluación.
    await makePaidOrder(`${RUN}-viejo@lucams.test`, "old", 60);
    const newerId = await makePaidOrder(`${RUN}-viejo@lucams.test`, "new");
    await issueReferralRewardsIfFirstPaidOrder(newerId);

    const referral = await prisma.referral.findFirst({
      where: { referredEmail: `${RUN}-viejo@lucams.test` },
    });
    expect(referral?.status).toBe("EXPIRED");
    expect(
      await prisma.coupon.count({
        where: { description: { contains: `${RUN}-viejo@lucams.test` } },
      }),
    ).toBe(0);
  });
});
