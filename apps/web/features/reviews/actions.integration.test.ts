/*
 * Tests de INTEGRACIÓN del server action submitReviewAction (auditoría v3 · #21).
 *
 * El action orquesta dependencias externas (auth, Turnstile, rate-limit) + DB.
 * Mockeamos SOLO las externas (offline, determinista — nunca pega a servicios
 * reales) y usamos la BD real para el gate de compra + unicidad:
 *   - @/lib/auth getCurrentCustomer(): controla la sesión (default null).
 *   - @/lib/turnstile verifyTurnstileToken(): siempre {success:true}.
 *   - @/lib/rate-limit rateLimit(): siempre {allowed:true}.
 *   - @/lib/client-ip getClientIp(): IP fija.
 *   - next/headers / next/cache: no-op.
 *
 * DB real: Category/Product/ProductVariant/Customer/Order/OrderItem/Review, todo
 * con prefijo RUN y afterAll SCOPED (memoria project_integration_tests_share_dev_db).
 * Copy es-CO (tuteo) reusa los mensajes reales del action. Dinero en centavos enteros.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

// ── Mocks (antes de importar el SUT) ──
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

let mockSession: {
  user: { id: string };
  customer: { id: string; firstName: string; lastName: string };
} | null = null;
vi.mock("@/lib/auth", () => ({
  getCurrentCustomer: async () => mockSession,
}));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: async () => ({ success: true }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/client-ip", () => ({
  getClientIp: () => "1.2.3.4",
}));

import { submitReviewAction } from "./actions";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `revact${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

let productId = "";
let productSlug = "";
let variantId = "";
let buyerCustomerId = "";
let nonBuyerCustomerId = "";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  f.set("cf-turnstile-response", "dummy");
  return f;
}

describe.skipIf(!hasDb)("submitReviewAction — integración DB", { timeout: T }, () => {
  beforeAll(async () => {
    const cat = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `ZZ ReviewAct ${RUN}`, order: 0 },
    });
    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Producto ${RUN}`,
        description: "Producto reseñable",
        basePrice: 30_000,
        sku: `${RUN}-PROD`.toUpperCase(),
        categoryId: cat.id,
        personalizationKind: "NONE",
        variants: {
          create: [
            {
              name: "Única",
              sku: `${RUN}-VAR`.toUpperCase(),
              price: 30_000,
              stock: 10,
              attributes: {},
            },
          ],
        },
      },
      select: { id: true, slug: true, variants: { select: { id: true } } },
    });
    productId = product.id;
    productSlug = product.slug;
    variantId = product.variants[0].id;

    const buyer = await prisma.customer.create({
      data: {
        email: `${RUN}-buyer@test.local`,
        supabaseUserId: `${RUN}-sup-buyer`,
        referralCode: `${RUN}-ref-buyer`,
        firstName: "Compradora",
        lastName: "Test",
      },
      select: { id: true },
    });
    buyerCustomerId = buyer.id;

    const nonBuyer = await prisma.customer.create({
      data: {
        email: `${RUN}-nonbuyer@test.local`,
        supabaseUserId: `${RUN}-sup-nonbuyer`,
        referralCode: `${RUN}-ref-nonbuyer`,
        firstName: "SinCompra",
        lastName: "Test",
      },
      select: { id: true },
    });
    nonBuyerCustomerId = nonBuyer.id;

    // Pedido DELIVERED de la compradora con un ítem del producto → habilita reseñar
    // (desde 2026-11-05 solo DELIVERED habilita reseña — ver constants.ts).
    await prisma.order.create({
      data: {
        number: `${RUN}-ord`.toUpperCase().slice(0, 40),
        email: `${RUN}-buyer@test.local`,
        phone: "3200000000",
        customerId: buyerCustomerId,
        shippingAddress: { city: "Cali", department: "Valle" },
        subtotal: 30_000,
        shipping: 0,
        total: 30_000,
        paymentMethod: "WOMPI",
        status: "DELIVERED",
        deliveredAt: new Date(),
        items: { create: [{ variantId, qty: 1, unitPrice: 30_000 }] },
      },
    });
  });

  afterAll(async () => {
    await prisma.review.deleteMany({
      where: {
        OR: [
          { product: { slug: { startsWith: RUN } } },
          { customer: { email: { startsWith: RUN } } },
        ],
      },
    });
    await prisma.orderItem.deleteMany({ where: { order: { email: { startsWith: RUN } } } });
    await prisma.order.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.productVariant.deleteMany({ where: { product: { slug: { startsWith: RUN } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: RUN } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: RUN } } });
    await prisma.customer.deleteMany({ where: { email: { startsWith: RUN } } });
  });

  it("sin sesión → pide iniciar sesión", async () => {
    mockSession = null;
    const res = await submitReviewAction(
      null,
      fd({
        productId,
        slug: productSlug,
        rating: "5",
        comment: "Excelente producto, muy recomendado.",
      }),
    );
    expect(res.error).toMatch(/inicia sesión/i);
  });

  it("logueado sin compra del producto → exige haberlo comprado", async () => {
    mockSession = {
      user: { id: nonBuyerCustomerId },
      customer: { id: nonBuyerCustomerId, firstName: "SinCompra", lastName: "Test" },
    };
    const res = await submitReviewAction(
      null,
      fd({
        productId,
        slug: productSlug,
        rating: "5",
        comment: "Quiero reseñar sin haber comprado.",
      }),
    );
    expect(res.error).toMatch(/solo puedes reseñar productos que compraste/i);
  });

  it("rating/comment inválidos → fieldErrors", async () => {
    mockSession = {
      user: { id: buyerCustomerId },
      customer: { id: buyerCustomerId, firstName: "Compradora", lastName: "Test" },
    };
    const res = await submitReviewAction(
      null,
      fd({ productId, slug: productSlug, rating: "9", comment: "corto" }),
    );
    expect(res.success).toBeUndefined();
    expect(res.fieldErrors).toBeDefined();
    expect(res.fieldErrors?.rating || res.fieldErrors?.comment).toBeTruthy();
  });

  it("comprador logueado → crea la reseña pendiente (isApproved:false)", async () => {
    mockSession = {
      user: { id: buyerCustomerId },
      customer: { id: buyerCustomerId, firstName: "Compradora", lastName: "Test" },
    };
    const res = await submitReviewAction(
      null,
      fd({
        productId,
        slug: productSlug,
        rating: "5",
        comment: "Producto increíble, llegó rápido y bien empacado.",
      }),
    );
    expect(res.success).toBe(true);
    const created = await prisma.review.findFirst({
      where: { productId, customerId: buyerCustomerId, deletedAt: null },
      select: { isApproved: true, rating: true, authorName: true },
    });
    expect(created).toMatchObject({ isApproved: false, rating: 5, authorName: "Compradora Test" });
  });

  it("comprador con pedido PAID (aún NO entregado) → NO puede reseñar (endurecido 2026-11-05: solo DELIVERED)", async () => {
    // Segundo producto + pedido PAID (pagado pero en producción): la clienta no lo
    // tiene en la mano → no opina todavía.
    const cat2 = await prisma.category.create({
      data: { slug: `${RUN}-cat2`, name: `ZZ ReviewAct2 ${RUN}`, order: 0 },
      select: { id: true },
    });
    const product2 = await prisma.product.create({
      data: {
        slug: `${RUN}-prod2`,
        name: `Producto No Entregado ${RUN}`,
        description: "Aún en producción",
        basePrice: 30_000,
        sku: `${RUN}-PROD2`.toUpperCase(),
        categoryId: cat2.id,
        personalizationKind: "NONE",
        variants: {
          create: [
            {
              name: "Única",
              sku: `${RUN}-VAR2`.toUpperCase(),
              price: 30_000,
              stock: 10,
              attributes: {},
            },
          ],
        },
      },
      select: { id: true, slug: true, variants: { select: { id: true } } },
    });
    await prisma.order.create({
      data: {
        number: `${RUN}-ord-paid`.toUpperCase().slice(0, 40),
        email: `${RUN}-buyer@test.local`,
        phone: "3200000000",
        customerId: buyerCustomerId,
        shippingAddress: { city: "Cali", department: "Valle" },
        subtotal: 30_000,
        shipping: 0,
        total: 30_000,
        paymentMethod: "WOMPI",
        status: "PAID",
        items: { create: [{ variantId: product2.variants[0].id, qty: 1, unitPrice: 30_000 }] },
      },
    });

    mockSession = {
      user: { id: buyerCustomerId },
      customer: { id: buyerCustomerId, firstName: "Compradora", lastName: "Test" },
    };
    const res = await submitReviewAction(
      null,
      fd({
        productId: product2.id,
        slug: product2.slug,
        rating: "5",
        comment: "Intento reseñar algo que aún no me ha llegado.",
      }),
    );
    expect(res.error).toMatch(/compraste/);
    expect(res.success).toBeUndefined();

    // Limpieza explícita del fixture extra (el afterAll general ya cubre por RUN).
    await prisma.orderItem.deleteMany({ where: { variant: { productId: product2.id } } });
    await prisma.order.deleteMany({
      where: { number: `${RUN}-ord-paid`.toUpperCase().slice(0, 40) },
    });
    await prisma.productVariant.deleteMany({ where: { productId: product2.id } });
    await prisma.product.deleteMany({ where: { id: product2.id } });
    await prisma.category.deleteMany({ where: { id: cat2.id } });
  });

  it("segundo submit del mismo cliente/producto → bloqueado por unicidad (#17)", async () => {
    mockSession = {
      user: { id: buyerCustomerId },
      customer: { id: buyerCustomerId, firstName: "Compradora", lastName: "Test" },
    };
    const res = await submitReviewAction(
      null,
      fd({
        productId,
        slug: productSlug,
        rating: "4",
        comment: "Intento duplicado de la misma persona.",
      }),
    );
    expect(res.error).toMatch(/ya dejaste una reseña/i);
    // Sigue habiendo exactamente 1 reseña activa de esta persona para el producto.
    const count = await prisma.review.count({
      where: { productId, customerId: buyerCustomerId, deletedAt: null },
    });
    expect(count).toBe(1);
  });
});
