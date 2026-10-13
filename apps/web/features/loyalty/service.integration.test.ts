/*
 * Integración DB — features/loyalty/service (programa "Puntos Lucams", 2026-10-12).
 *
 * Cubre:
 *  - awardLoyaltyPointsForPaidOrder: acredita floor(total/earnCopPerPoint),
 *    idempotente por orden (retry = no-op vía índice único (orderId,"EARN")),
 *    no-op con programa apagado y con pedido de invitado.
 *  - quoteRedemptionForOrder + reserveRedeemedPoints: reserva atómica en tx,
 *    LoyaltyRedemptionError con balance insuficiente y con programa apagado.
 *  - transitionOrder a REFUNDED: restaura los puntos redimidos (simetría F2
 *    con la liberación de cupón) vía restoreRedeemedPoints.
 *
 * @/lib/cms → real, EXCEPTO getSettingValue de las keys LOYALTY_*: controlable
 * por test (mismo patrón que COD_ENABLED en checkout/service.integration.test.ts).
 * Limpieza scoped por prefijo RUN.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

// Settings controlables por test (null = cae al fallback del reader).
const mockLoyaltySettings: Record<string, string | null> = {};
const LOYALTY_KEYS = [
  "LOYALTY_ENABLED",
  "LOYALTY_EARN_COP_PER_POINT",
  "LOYALTY_REDEEM_POINTS_PER_1000",
  "LOYALTY_REDEEM_MIN_POINTS",
  "LOYALTY_REDEEM_MAX_PERCENT",
  "LOYALTY_EXPIRATION_ENABLED",
  "LOYALTY_EXPIRATION_DAYS",
];
vi.mock("@/lib/cms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms")>();
  return {
    ...actual,
    getSettingValue: (key: string, fallback: string) =>
      LOYALTY_KEYS.includes(key) && mockLoyaltySettings[key] != null
        ? Promise.resolve(mockLoyaltySettings[key]!)
        : actual.getSettingValue(key, fallback),
  };
});

import {
  awardLoyaltyPointsForPaidOrder,
  LoyaltyRedemptionError,
  quoteRedemptionForOrder,
  reserveRedeemedPoints,
} from "./service";
import { getLoyaltySettings, saveLoyaltySettings } from "./settings";
import { transitionOrder } from "@/features/orders/service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `loy${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

let customerId = "";
const customerEmail = `${RUN}@lucams.test`;

// Sección global/comercio: en local ya existe (site map sembrado), pero en CI
// la DB sale SOLO de migraciones (sin seed CMS) y el self-healing de
// saveLoyaltySettings la necesita. Mismo patrón que ensureSection de
// features/cms/service.integration.test.ts: el test siembra el mínimo y solo
// borra lo que él mismo creó.
let createdGlobalPage = false;
let createdComercioSectionId: string | null = null;
async function ensureSettingsSection(): Promise<void> {
  const page = await prisma.cmsPage.findUnique({
    where: { slug: "global" },
    select: { id: true },
  });
  if (!page) {
    createdGlobalPage = true;
    await prisma.cmsPage.create({
      data: {
        slug: "global",
        title: "Global",
        sortOrder: 0,
        sections: {
          create: { key: "comercio", title: "Comercio", sortOrder: 1 },
        },
      },
    });
    return;
  }
  const section = await prisma.cmsSection.findUnique({
    where: { pageId_key: { pageId: page.id, key: "comercio" } },
    select: { id: true },
  });
  if (!section) {
    const created = await prisma.cmsSection.create({
      data: { pageId: page.id, key: "comercio", title: "Comercio", sortOrder: 999 },
      select: { id: true },
    });
    createdComercioSectionId = created.id;
  }
}

function programOn() {
  mockLoyaltySettings.LOYALTY_ENABLED = "true";
}
function programOff() {
  mockLoyaltySettings.LOYALTY_ENABLED = "false";
}

async function makeOrder(opts: {
  total: number;
  status: string;
  withCustomer?: boolean;
  tag: string;
}) {
  const order = await prisma.order.create({
    data: {
      number: `LCM-${RUN}-${opts.tag}`.toUpperCase(),
      customerId: opts.withCustomer === false ? null : customerId,
      email: customerEmail,
      phone: "3001234567",
      shippingAddress: { fullName: "Test", city: "Bogotá", department: "Cundinamarca" },
      subtotal: opts.total,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: opts.total,
      paymentMethod: "WOMPI",
      status: opts.status as "PAID",
    },
    select: { id: true },
  });
  return order.id;
}

async function balanceOf(id: string): Promise<number> {
  const c = await prisma.customer.findUnique({ where: { id }, select: { loyaltyPoints: true } });
  return c?.loyaltyPoints ?? -1;
}

describe.skipIf(!hasDb)("loyalty/service — integración DB", { timeout: T }, () => {
  beforeAll(async () => {
    await ensureSettingsSection();
    const customer = await prisma.customer.create({
      data: {
        email: customerEmail,
        supabaseUserId: `${RUN}-sub`,
        referralCode: `LCS-${RUN.slice(-6).toUpperCase()}L`,
        firstName: "Puntos",
      },
      select: { id: true },
    });
    customerId = customer.id;
    programOn();
  }, T);

  afterAll(async () => {
    await prisma.loyaltyTxn.deleteMany({ where: { customerId } });
    await prisma.order.deleteMany({ where: { email: { contains: RUN } } });
    await prisma.customer.deleteMany({ where: { email: { contains: RUN } } });
    // Lo sembrado por ensureSettingsSection (solo si lo creó ESTE test — en
    // local la sección ya existía y no se toca).
    if (createdGlobalPage) await prisma.cmsPage.deleteMany({ where: { slug: "global" } });
    else if (createdComercioSectionId)
      await prisma.cmsSection.deleteMany({ where: { id: createdComercioSectionId } });
  }, T);

  it("earn: acredita floor(total/1000) puntos al pagar y es idempotente por orden", async () => {
    // $59.900 COP = 5_990_000 centavos → 59 puntos.
    const orderId = await makeOrder({ total: 5_990_000, status: "PAID", tag: "earn1" });
    await awardLoyaltyPointsForPaidOrder(orderId);
    expect(await balanceOf(customerId)).toBe(59);
    const txn = await prisma.loyaltyTxn.findFirst({
      where: { orderId, reason: "EARN" },
    });
    expect(txn).toMatchObject({ customerId, delta: 59 });

    // Retry de la saga (webhook duplicado / fallback /checkout/gracias): no duplica.
    await awardLoyaltyPointsForPaidOrder(orderId);
    expect(await balanceOf(customerId)).toBe(59);
    expect(await prisma.loyaltyTxn.count({ where: { orderId, reason: "EARN" } })).toBe(1);
  });

  it("earn: no-op con programa apagado, pedido de invitado o total < $1.000", async () => {
    const prev = await balanceOf(customerId);
    programOff();
    const offOrder = await makeOrder({ total: 5_990_000, status: "PAID", tag: "earn-off" });
    await awardLoyaltyPointsForPaidOrder(offOrder);
    expect(await balanceOf(customerId)).toBe(prev);
    programOn();

    const guestOrder = await makeOrder({
      total: 5_990_000,
      status: "PAID",
      withCustomer: false,
      tag: "earn-guest",
    });
    await awardLoyaltyPointsForPaidOrder(guestOrder);
    expect(await prisma.loyaltyTxn.count({ where: { orderId: guestOrder } })).toBe(0);

    const cheapOrder = await makeOrder({ total: 99_900, status: "PAID", tag: "earn-cheap" });
    await awardLoyaltyPointsForPaidOrder(cheapOrder);
    expect(await prisma.loyaltyTxn.count({ where: { orderId: cheapOrder } })).toBe(0);
    expect(await balanceOf(customerId)).toBe(prev);
  });

  it("settings: save → read roundtrip con self-healing (crea el CmsField SETTING si no existe)", async () => {
    await saveLoyaltySettings(
      {
        enabled: true,
        earnCopPerPoint: 2_000,
        redeemPointsPer1000: 200,
        redeemMinPoints: 50,
        redeemMaxPercent: 40,
        expirationEnabled: false,
        expirationDays: 365,
      },
      null,
    );
    // Limpiamos los overrides del mock para leer el valor REAL recién escrito
    // (en vitest, unstable_cache de lib/cms degrada a lectura directa — E469).
    for (const k of LOYALTY_KEYS) mockLoyaltySettings[k] = null;
    const s = await getLoyaltySettings();
    expect(s).toMatchObject({
      enabled: true,
      earnCopPerPoint: 2_000,
      redeemPointsPer1000: 200,
      redeemMinPoints: 50,
      redeemMaxPercent: 40,
    });
    // Limpieza: las keys vuelven a no existir (los demás tests usan el mock).
    await prisma.cmsField.deleteMany({ where: { key: { in: LOYALTY_KEYS } } });
    programOn();
  });

  it("redeem: quote + reserva atómica (decremento del balance + LoyaltyTxn REDEEM)", async () => {
    // Balance tras los tests de earn: 59 puntos. Le damos aire para redimir.
    await prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: 500 } });
    const orderId = await makeOrder({ total: 0, status: "PENDING_PAYMENT", tag: "redeem1" });
    const quote = await quoteRedemptionForOrder({
      customerId,
      requestedPoints: 300,
      merchandiseAfterCouponCents: 10_000_000,
    });
    expect(quote).toMatchObject({ points: 300, discountCents: 300_000 });

    await prisma.$transaction(async (tx) => {
      await reserveRedeemedPoints(tx, { orderId, customerId, points: quote!.points });
    });
    expect(await balanceOf(customerId)).toBe(200);
    const txn = await prisma.loyaltyTxn.findFirst({
      where: { orderId, reason: "REDEEM" },
    });
    expect(txn).toMatchObject({ customerId, delta: -300 });

    // Y al reembolsar la orden, transitionOrder restaura los puntos (simetría F2).
    // La orden debe ser transicionable a REFUNDED: PENDING_PAYMENT → CANCELLED.
    await prisma.order.update({
      where: { id: orderId },
      data: { loyaltyPointsRedeemed: 300 },
    });
    await transitionOrder(orderId, "CANCELLED");
    expect(await balanceOf(customerId)).toBe(500);
    const refund = await prisma.loyaltyTxn.findFirst({
      where: { orderId, reason: "REFUND" },
    });
    expect(refund).toMatchObject({ customerId, delta: 300 });
  });

  it("redeem: pedir de más clampa al saldo; programa apagado o bajo el mínimo → LoyaltyRedemptionError", async () => {
    // Balance 500: pedir 10.000 aplica TODO el saldo (clamp documentado, la UI
    // avisa "Aplicamos todo tu saldo de puntos") — no es error.
    const clamped = await quoteRedemptionForOrder({
      customerId,
      requestedPoints: 10_000,
      merchandiseAfterCouponCents: 999_000_000,
    });
    expect(clamped).toMatchObject({ points: 500 });

    // Bajo el mínimo de redención sí es error (mensaje customer-safe).
    await expect(
      quoteRedemptionForOrder({
        customerId,
        requestedPoints: 50,
        merchandiseAfterCouponCents: 10_000_000,
      }),
    ).rejects.toThrow(LoyaltyRedemptionError);

    programOff();
    await expect(
      quoteRedemptionForOrder({
        customerId,
        requestedPoints: 100,
        merchandiseAfterCouponCents: 10_000_000,
      }),
    ).rejects.toThrow(LoyaltyRedemptionError);
    programOn();
  });

  it("redeem: la reserva gateada no deja el balance negativo en carrera", async () => {
    const orderId = await makeOrder({ total: 0, status: "PENDING_PAYMENT", tag: "redeem-race" });
    // Balance 500: una reserva de 400 gana; la segunda (también 400) rebota.
    await prisma.$transaction(async (tx) => {
      await reserveRedeemedPoints(tx, { orderId, customerId, points: 400 });
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await reserveRedeemedPoints(tx, { orderId, customerId, points: 400 });
      }),
    ).rejects.toThrow(LoyaltyRedemptionError);
    expect(await balanceOf(customerId)).toBe(100);
    // Limpieza fina del escenario: restaurar la reserva para los tests siguientes.
    await prisma.order.update({ where: { id: orderId }, data: { loyaltyPointsRedeemed: 400 } });
    await transitionOrder(orderId, "CANCELLED");
    expect(await balanceOf(customerId)).toBe(500);
  });
});
