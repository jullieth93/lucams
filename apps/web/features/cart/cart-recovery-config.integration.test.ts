/*
 * Integración — recuperación de carrito abandonado CONFIGURABLE (Fase 4, 2026-10-13).
 *
 * Cubre la lógica config-driven del cron (sendCartRecoveryReminders):
 *  - módulo apagado (enabled=false) → no envía nada, skippedReason "disabled";
 *  - modo manual → el cron no envía, skippedReason "manual";
 *  - automático con parámetros: idleHours (1h en vez del default 4h),
 *    maxReminders=2 + intervalHours (segundo recordatorio a un carrito ya
 *    recordado; carrito en el tope NO se reprocesa);
 *  - envío manual a voluntad (sendReminderToCart): envía + marca (fecha y
 *    reminderCount), anti-duplicación too-soon, conversión detectada al vuelo,
 *    kill-switch del módulo;
 *  - settings: save → read roundtrip con self-healing (crea el CmsField
 *    SETTING si no existe) — patrón de features/loyalty/service.integration.test.ts.
 *
 * @/lib/cms → real, EXCEPTO getSettingValue de las keys CART_RECOVERY_*:
 * controlable por test (mismo patrón que LOYALTY_* en loyalty). Envío y
 * render mockeados (determinista). Fixtures RUN-prefijados, DB compartida de dev.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

// Settings controlables por test (null = cae a la DB real / default del reader).
const mockRecoverySettings: Record<string, string | null> = {};
const RECOVERY_KEYS = [
  "CART_RECOVERY_ENABLED",
  "CART_RECOVERY_MODE",
  "CART_RECOVERY_IDLE_HOURS",
  "CART_RECOVERY_MAX_REMINDERS",
  "CART_RECOVERY_INTERVAL_HOURS",
];
vi.mock("@/lib/cms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms")>();
  return {
    ...actual,
    getSettingValue: (key: string, fallback: string) =>
      RECOVERY_KEYS.includes(key) && mockRecoverySettings[key] != null
        ? Promise.resolve(mockRecoverySettings[key]!)
        : actual.getSettingValue(key, fallback),
  };
});
// Mismo criterio que cart-recovery.integration.test.ts: se verifica la LÓGICA
// (qué carritos se procesan y cómo se marcan), no el render ni la entrega.
vi.mock("@/lib/resend", () => ({
  sendEmail: vi.fn(async () => ({ sent: true, id: "test-email-id" })),
}));
vi.mock("@/features/emails/registry", () => ({
  renderCartRecoveryEmail: vi.fn(async () => ({ subject: "s", html: "h", text: "t" })),
}));

import { sendCartRecoveryReminders, sendReminderToCart } from "./recovery-service";
import { getCartRecoverySettings, saveCartRecoverySettings } from "./recovery-settings";

const RUN = `cartcfg${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const HOUR = 60 * 60 * 1000;
const T = 30_000;

let categoryId = "";
let productId = "";
let variantId = "";
const cartIds: string[] = [];
const abIds: Record<string, string> = {};

const NOW = new Date("2026-10-13T12:00:00Z");
const FIVE_H_AGO = new Date(NOW.getTime() - 5 * HOUR);
const ONE_H_AGO = new Date(NOW.getTime() - 1 * HOUR);

async function makeCartWithItem(tag: string, opts: { deleted?: boolean } = {}): Promise<string> {
  const cart = await prisma.cart.create({
    data: {
      sessionId: `${RUN}-${tag}`,
      deletedAt: opts.deleted ? new Date() : null,
      items: { create: { variantId, qty: 2, unitPrice: 10_000 } },
    },
    select: { id: true },
  });
  cartIds.push(cart.id);
  return cart.id;
}

async function makeAbandoned(
  tag: string,
  opts: {
    createdAt: Date;
    lastReminderSentAt?: Date | null;
    reminderCount?: number;
    cartDeleted?: boolean;
  },
): Promise<void> {
  const ab = await prisma.abandonedCart.create({
    data: {
      cartId: await makeCartWithItem(tag, { deleted: opts.cartDeleted }),
      email: `${RUN}-${tag}@lucams.test`,
      createdAt: opts.createdAt,
      lastReminderSentAt: opts.lastReminderSentAt ?? null,
      reminderCount: opts.reminderCount ?? (opts.lastReminderSentAt ? 1 : 0),
    },
    select: { id: true },
  });
  abIds[tag] = ab.id;
}

/** Defaults explícitos del mock (enabled, automático, 4h, 1 recordatorio, 24h). */
function mockDefaults() {
  mockRecoverySettings.CART_RECOVERY_ENABLED = "true";
  mockRecoverySettings.CART_RECOVERY_MODE = "automatic";
  mockRecoverySettings.CART_RECOVERY_IDLE_HOURS = "4";
  mockRecoverySettings.CART_RECOVERY_MAX_REMINDERS = "1";
  mockRecoverySettings.CART_RECOVERY_INTERVAL_HOURS = "24";
}

// Sección global/comercio: el self-healing de saveCartRecoverySettings la
// necesita (patrón ensureSection de loyalty/service.integration.test.ts).
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

beforeAll(async () => {
  categoryId = (
    await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      select: { id: true },
    })
  ).id;
  productId = (
    await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Imán ${RUN}`,
        description: "fixture",
        basePrice: 10_000,
        sku: `${RUN}-P`.toUpperCase(),
        categoryId,
        personalizationKind: "PHOTO_PACK",
      },
      select: { id: true },
    })
  ).id;
  variantId = (
    await prisma.productVariant.create({
      data: {
        productId,
        name: "Único",
        sku: `${RUN}-V`.toUpperCase(),
        price: 10_000,
        stock: 10,
        attributes: {},
      },
      select: { id: true },
    })
  ).id;

  await ensureSettingsSection();
}, T);

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  await safe(prisma.abandonedCart.deleteMany({ where: { email: { contains: RUN } } }));
  await safe(prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } }));
  await safe(prisma.cart.deleteMany({ where: { id: { in: cartIds } } }));
  await safe(prisma.productVariant.deleteMany({ where: { productId } }));
  await safe(prisma.product.deleteMany({ where: { id: productId } }));
  await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
  // Lo sembrado por ensureSettingsSection (solo si lo creó ESTE test).
  if (createdGlobalPage) await safe(prisma.cmsPage.deleteMany({ where: { slug: "global" } }));
  else if (createdComercioSectionId)
    await safe(prisma.cmsSection.deleteMany({ where: { id: createdComercioSectionId } }));
}, T);

beforeEach(() => {
  mockDefaults();
});

describe("sendCartRecoveryReminders — gobernado por settings (Fase 4)", () => {
  it("módulo apagado → no procesa nada y reporta skippedReason 'disabled'", async () => {
    await makeAbandoned("off-eligible", { createdAt: FIVE_H_AGO });
    mockRecoverySettings.CART_RECOVERY_ENABLED = "false";

    const res = await sendCartRecoveryReminders(NOW);

    expect(res).toMatchObject({ sent: 0, recovered: 0, considered: 0, skippedReason: "disabled" });
    const row = await prisma.abandonedCart.findUnique({
      where: { id: abIds["off-eligible"] },
      select: { lastReminderSentAt: true, reminderCount: true },
    });
    expect(row!.lastReminderSentAt).toBeNull();
    expect(row!.reminderCount).toBe(0);
  });

  it("modo manual → el cron no envía nada y reporta skippedReason 'manual'", async () => {
    await makeAbandoned("manual-eligible", { createdAt: FIVE_H_AGO });
    mockRecoverySettings.CART_RECOVERY_MODE = "manual";

    const res = await sendCartRecoveryReminders(NOW);

    expect(res).toMatchObject({ sent: 0, recovered: 0, considered: 0, skippedReason: "manual" });
    const row = await prisma.abandonedCart.findUnique({
      where: { id: abIds["manual-eligible"] },
      select: { lastReminderSentAt: true },
    });
    expect(row!.lastReminderSentAt).toBeNull();
  });

  it("automático con idleHours=1 → un carrito de 1h ya es elegible", async () => {
    await makeAbandoned("idle1h", { createdAt: ONE_H_AGO });
    mockRecoverySettings.CART_RECOVERY_IDLE_HOURS = "1";

    await sendCartRecoveryReminders(NOW);

    const row = await prisma.abandonedCart.findUnique({
      where: { id: abIds.idle1h },
      select: { lastReminderSentAt: true, reminderCount: true },
    });
    expect(row!.lastReminderSentAt).not.toBeNull();
    expect(row!.reminderCount).toBe(1);
  });

  it("maxReminders=2 + intervalHours → 2º recordatorio al ya recordado; el que llegó al tope no se reprocesa", async () => {
    // Ya recordado hace 5h (count 1) → con intervalo 1h es elegible de nuevo.
    await makeAbandoned("second", {
      createdAt: FIVE_H_AGO,
      lastReminderSentAt: FIVE_H_AGO,
      reminderCount: 1,
    });
    // Último recordatorio hace 30 min (< intervalo 1h) → aún no.
    await makeAbandoned("within-interval", {
      createdAt: FIVE_H_AGO,
      lastReminderSentAt: new Date(NOW.getTime() - 30 * 60 * 1000),
      reminderCount: 1,
    });
    // En el tope (count 2 = max) → fuera.
    await makeAbandoned("capped", {
      createdAt: FIVE_H_AGO,
      lastReminderSentAt: FIVE_H_AGO,
      reminderCount: 2,
    });
    mockRecoverySettings.CART_RECOVERY_MAX_REMINDERS = "2";
    mockRecoverySettings.CART_RECOVERY_INTERVAL_HOURS = "1";

    await sendCartRecoveryReminders(NOW);

    const second = await prisma.abandonedCart.findUnique({
      where: { id: abIds.second },
      select: { reminderCount: true, lastReminderSentAt: true },
    });
    expect(second!.reminderCount).toBe(2);
    expect(second!.lastReminderSentAt!.getTime()).toBe(NOW.getTime());

    const within = await prisma.abandonedCart.findUnique({
      where: { id: abIds["within-interval"] },
      select: { reminderCount: true },
    });
    expect(within!.reminderCount).toBe(1);

    const capped = await prisma.abandonedCart.findUnique({
      where: { id: abIds.capped },
      select: { reminderCount: true, lastReminderSentAt: true },
    });
    expect(capped!.reminderCount).toBe(2);
    expect(capped!.lastReminderSentAt!.getTime()).toBe(FIVE_H_AGO.getTime());
  });
});

describe("sendReminderToCart — envío manual a voluntad (Fase 4)", () => {
  it("envía a un carrito pendiente y marca fecha + conteo", async () => {
    await makeAbandoned("manual-send", { createdAt: FIVE_H_AGO });

    const res = await sendReminderToCart(abIds["manual-send"], NOW);

    expect(res.status).toBe("sent");
    const row = await prisma.abandonedCart.findUnique({
      where: { id: abIds["manual-send"] },
      select: { lastReminderSentAt: true, reminderCount: true, recoverTokenHash: true },
    });
    expect(row!.lastReminderSentAt!.getTime()).toBe(NOW.getTime());
    expect(row!.reminderCount).toBe(1);
    // F-11 — el token se generó al enviar: la fila tiene SOLO su hash sha256.
    expect(row!.recoverTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("anti-duplicación: reenviar antes de intervalHours → skipped too-soon con retryAt", async () => {
    await makeAbandoned("too-soon", {
      createdAt: FIVE_H_AGO,
      lastReminderSentAt: new Date(NOW.getTime() - 2 * HOUR),
      reminderCount: 1,
    });

    const res = await sendReminderToCart(abIds["too-soon"], NOW);

    expect(res.status).toBe("skipped");
    if (res.status === "skipped") {
      expect(res.reason).toBe("too-soon");
      // intervalHours=24 (mock default): retryAt = último envío + 24h.
      expect(res.retryAt!.getTime()).toBe(NOW.getTime() + 22 * HOUR);
    }
    const row = await prisma.abandonedCart.findUnique({
      where: { id: abIds["too-soon"] },
      select: { reminderCount: true },
    });
    expect(row!.reminderCount).toBe(1); // no contó como envío
  });

  it("pasado el intervalo el manual SÍ reenvía aunque maxReminders=1 (a voluntad)", async () => {
    await makeAbandoned("manual-resend", {
      createdAt: FIVE_H_AGO,
      lastReminderSentAt: new Date(NOW.getTime() - 25 * HOUR),
      reminderCount: 1,
    });

    const res = await sendReminderToCart(abIds["manual-resend"], NOW);

    expect(res.status).toBe("sent");
    const row = await prisma.abandonedCart.findUnique({
      where: { id: abIds["manual-resend"] },
      select: { reminderCount: true },
    });
    expect(row!.reminderCount).toBe(2);
  });

  it("carrito convertido al vuelo (soft-deleted) → recovered y queda marcado", async () => {
    await makeAbandoned("manual-converted", { createdAt: FIVE_H_AGO, cartDeleted: true });

    const res = await sendReminderToCart(abIds["manual-converted"], NOW);

    expect(res.status).toBe("recovered");
    const row = await prisma.abandonedCart.findUnique({
      where: { id: abIds["manual-converted"] },
      select: { recoveredAt: true },
    });
    expect(row!.recoveredAt!.getTime()).toBe(NOW.getTime());
  });

  it("kill-switch: módulo apagado → skipped module-disabled, sin tocar la fila", async () => {
    await makeAbandoned("manual-off", { createdAt: FIVE_H_AGO });
    mockRecoverySettings.CART_RECOVERY_ENABLED = "false";

    const res = await sendReminderToCart(abIds["manual-off"], NOW);

    expect(res).toEqual({ status: "skipped", reason: "module-disabled" });
    const row = await prisma.abandonedCart.findUnique({
      where: { id: abIds["manual-off"] },
      select: { lastReminderSentAt: true },
    });
    expect(row!.lastReminderSentAt).toBeNull();
  });
});

describe("settings de recuperación — save → read roundtrip (Fase 4)", () => {
  it("save crea los CmsField SETTING (self-healing) y read los parsea", async () => {
    // Valores distintos de los defaults pero de comportamiento equivalente para
    // los fixtures de OTROS tests que comparten la DB (idleHours=2 < 4: los
    // carritos de 1h de cualquier RUN siguen fuera; los de 5h siguen dentro).
    await saveCartRecoverySettings(
      { enabled: true, mode: "automatic", idleHours: 2, maxReminders: 1, intervalHours: 24 },
      null,
    );
    // Leer el valor REAL recién escrito (bypassear el mock de estas keys).
    for (const k of RECOVERY_KEYS) mockRecoverySettings[k] = null;
    const s = await getCartRecoverySettings();
    expect(s).toEqual({
      enabled: true,
      mode: "automatic",
      idleHours: 2,
      maxReminders: 1,
      intervalHours: 24,
    });
    // Limpieza: las keys vuelven a no existir y el mock a sus defaults.
    await prisma.cmsField.deleteMany({ where: { key: { in: RECOVERY_KEYS } } });
    mockDefaults();
  });
});
