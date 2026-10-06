/*
 * Integración DB — features/referrals/service (Referidos v2, 2026-10-05).
 *
 * Cubre: findReferrerByCode, attachReferral (código inválido, propio código,
 * vínculo PENDING + cupón de bienvenida del referido, dedup del cupón en
 * doble registro) y issueReferralRewardsIfFirstPaidOrder (primer pedido pagado
 * → SOLO cupón del referente + REWARDED; legacy v1 sin bienvenida → ambos;
 * pedido posterior → EXPIRED; idempotencia del retry de la saga). Además el
 * listado de "Mis cupones" (features/coupons/mine).
 *
 * Limpieza scoped por prefijo RUN (mismo patrón que las demás suites).
 * RESEND_API_KEY se vacía en beforeAll: los emails de recompensa quedan en stub
 * de dev (no se mandan correos reales a direcciones sintéticas).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listMyCoupons, myCouponStatus } from "@/features/coupons/mine";
import {
  attachReferral,
  findReferrerByCode,
  issueReferralRewardsIfFirstPaidOrder,
} from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `ref${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

let referrerId = "";
const referrerEmail = `${RUN}-referrer@lucams.test`;
const referrerCode = `LCS-${RUN.slice(-6).toUpperCase()}X`;
let refereeId = "";
const refereeEmail = `${RUN}-referee@lucams.test`;

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
    await prisma.coupon.deleteMany({
      where: {
        OR: [
          { code: { startsWith: "REF-" }, description: { contains: RUN } },
          { customer: { email: { contains: RUN } } },
        ],
      },
    });
    await prisma.order.deleteMany({ where: { email: { contains: RUN } } });
    await prisma.customer.deleteMany({ where: { email: { contains: RUN } } });
  }, T);

  it("findReferrerByCode encuentra por código (case-insensitive) y null si no existe", async () => {
    const found = await findReferrerByCode(referrerCode.toLowerCase());
    expect(found?.id).toBe(referrerId);
    expect(await findReferrerByCode("LCS-NOEXISTE")).toBeNull();
  });

  it("attachReferral crea Referral PENDING, marca referredById y emite el cupón de bienvenida", async () => {
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

    // Cupón de bienvenida del REFERIDO: personal (customerId), 10%, 1 uso, 90 días.
    const welcome = await prisma.coupon.findFirst({
      where: { customerId: refereeId, description: { contains: refereeEmail } },
    });
    expect(welcome).toMatchObject({
      type: "PERCENT",
      value: 10,
      maxUses: 1,
      maxUsesPerCustomer: 1,
      isPublic: false,
      createdBy: "referrals-v1",
    });
    expect(welcome?.code).toMatch(/^REF-[A-Z0-9_-]{8}$/);
    expect(welcome!.validTo.getTime() - welcome!.validFrom.getTime()).toBeGreaterThan(
      89 * 24 * 60 * 60 * 1000,
    );
  });

  it("attachReferral duplicado NO crea segunda Referral ni segundo cupón de bienvenida", async () => {
    const err = await attachReferral({
      refereeCustomerId: refereeId,
      refereeEmail: refereeEmail,
      rawCode: referrerCode,
    });
    expect(err).toBeNull();
    expect(await prisma.referral.count({ where: { referredEmail: refereeEmail } })).toBe(1);
    expect(
      await prisma.coupon.count({
        where: {
          customerId: refereeId,
          description: { startsWith: "Referidos: bienvenida para" },
        },
      }),
    ).toBe(1);
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

  it("primer pedido pagado → SOLO cupón del referente + Referral REWARDED; retry no duplica", async () => {
    const orderId = await makePaidOrder(refereeEmail, "first");
    await issueReferralRewardsIfFirstPaidOrder(orderId);

    const referral = await prisma.referral.findFirst({ where: { referredEmail: refereeEmail } });
    expect(referral?.status).toBe("REWARDED");
    expect(referral?.rewardedAt).not.toBeNull();

    // El referido conserva ÚNICAMENTE su cupón de bienvenida (emitido en el
    // registro): la primera compra NO le crea otro.
    const refereeCoupons = await prisma.coupon.findMany({ where: { customerId: refereeId } });
    expect(refereeCoupons).toHaveLength(1);
    expect(refereeCoupons[0].description).toContain("bienvenida");

    // El nuevo cupón es el del REFERENTE: personal (customerId), 10%, 1 uso.
    const referrerCoupons = await prisma.coupon.findMany({ where: { customerId: referrerId } });
    expect(referrerCoupons).toHaveLength(1);
    expect(referrerCoupons[0]).toMatchObject({
      type: "PERCENT",
      value: 10,
      maxUses: 1,
      maxUsesPerCustomer: 1,
      isPublic: false,
      createdBy: "referrals-v1",
    });
    // F-10 — el código es `REF-` + 8 chars aleatorios (≥36 bits); ya NO lleva
    // el segmento de 4 chars derivado del email del destinatario (formato
    // viejo REF-XXXX-XXXX, 16 bits, predecible).
    expect(referrerCoupons[0].code).toMatch(/^REF-[A-Z0-9_-]{8}$/);
    expect(referrerCoupons[0].code).not.toMatch(/^REF-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(referrerCoupons[0].description).toContain(referrerEmail);

    // Retry de la saga (idempotente): sigue habiendo 1 cupón por cabeza.
    await issueReferralRewardsIfFirstPaidOrder(orderId);
    expect(await prisma.coupon.count({ where: { customerId: referrerId } })).toBe(1);
    expect(await prisma.coupon.count({ where: { customerId: refereeId } })).toBe(1);
  });

  it("legacy v1 (Referral PENDING sin cupón de bienvenida) → primera compra emite AMBOS una vez", async () => {
    // Simula un referido registrado ANTES de v2: la Referral existe pero el
    // cupón de bienvenida nunca se emitió (en v1 se emitía aquí).
    const legacyEmail = `${RUN}-legacy@lucams.test`;
    const legacy = await prisma.customer.create({
      data: {
        email: legacyEmail,
        supabaseUserId: `${RUN}-legacy-sub`,
        referralCode: `LCS-${RUN.slice(-4).toUpperCase()}LG`,
      },
      select: { id: true },
    });
    await prisma.referral.create({
      data: { referrerId, referredEmail: legacyEmail, status: "PENDING" },
    });

    const orderId = await makePaidOrder(legacyEmail, "legacy-first");
    await issueReferralRewardsIfFirstPaidOrder(orderId);

    const legacyReferral = await prisma.referral.findFirst({
      where: { referredEmail: legacyEmail },
    });
    expect(legacyReferral?.status).toBe("REWARDED");
    // Bienvenida tardía del referido + premio del referente (uno por cabeza).
    const legacyCoupons = await prisma.coupon.findMany({ where: { customerId: legacy.id } });
    expect(legacyCoupons).toHaveLength(1);
    expect(legacyCoupons[0].description).toContain("bienvenida");
    expect(
      await prisma.coupon.count({
        where: { customerId: referrerId, description: { contains: legacyEmail } },
      }),
    ).toBe(1);

    // Retry: no duplica ninguno de los dos.
    await issueReferralRewardsIfFirstPaidOrder(orderId);
    expect(await prisma.coupon.count({ where: { customerId: legacy.id } })).toBe(1);
  });

  it("listMyCoupons devuelve solo los cupones del cliente con estado derivado", async () => {
    // El referido tras el flujo completo: su bienvenida sigue disponible; la
    // marcamos usada para verificar la derivación del estado.
    const mine = await listMyCoupons(refereeId);
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("AVAILABLE");

    await prisma.coupon.update({
      where: { id: mine[0].id },
      data: { usedCount: 1 },
    });
    expect((await listMyCoupons(refereeId))[0].status).toBe("USED");

    // El cupón de otro cliente nunca aparece en su lista.
    const referrerMine = await listMyCoupons(referrerId);
    expect(referrerMine.every((c) => c.code !== mine[0].code)).toBe(true);

    // Derivación pura: VENCIDO cuando pasó validTo y no se agotó.
    const past = new Date(Date.now() - 1000);
    expect(myCouponStatus({ maxUses: 1, usedCount: 0, validTo: past })).toBe("EXPIRED");
    expect(myCouponStatus({ maxUses: 1, usedCount: 1, validTo: past })).toBe("USED");
    expect(
      myCouponStatus({ maxUses: null, usedCount: 0, validTo: new Date(Date.now() + 1000) }),
    ).toBe("AVAILABLE");
  });

  it("si el referido YA tenía un pedido pagado previo → EXPIRED, sin premio al referente", async () => {
    const viejoEmail = `${RUN}-viejo@lucams.test`;
    const viejo = await prisma.customer.create({
      data: {
        email: viejoEmail,
        supabaseUserId: `${RUN}-viejo-sub`,
        referralCode: `LCS-${RUN.slice(-4).toUpperCase()}VJ`,
      },
      select: { id: true },
    });
    await attachReferral({
      refereeCustomerId: viejo.id,
      refereeEmail: viejoEmail,
      rawCode: referrerCode,
    });
    // Pedido pagado PREVIO al que dispara la evaluación.
    await makePaidOrder(viejoEmail, "old", 60);
    const newerId = await makePaidOrder(viejoEmail, "new");
    await issueReferralRewardsIfFirstPaidOrder(newerId);

    const referral = await prisma.referral.findFirst({
      where: { referredEmail: viejoEmail },
    });
    expect(referral?.status).toBe("EXPIRED");
    // Sin premio para el referente…
    expect(
      await prisma.coupon.count({
        where: { description: { contains: `trajo a ${viejoEmail}` } },
      }),
    ).toBe(0);
    // …pero el referido conserva su cupón de bienvenida (se emite al registrarse).
    expect(await prisma.coupon.count({ where: { customerId: viejo.id } })).toBe(1);
  });
});
