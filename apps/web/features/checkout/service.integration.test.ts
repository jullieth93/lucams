/*
 * Tests del SERVICE de CHECKOUT — ruta de ingresos.
 *
 * El módulo @/features/checkout/service.ts orquesta el flow de checkout:
 *   - calculateTotals(): cálculo de subtotal/envío/descuento/IVA/total (PURO).
 *   - los step savers (saveContactStep, savePaymentMethodStep, etc.): escriben
 *     la cookie firmada checkout_state (COOKIE).
 *   - loadCheckoutContext(): cart + customer + state desde cookie/DB.
 *   - finalizeCheckout(): crea Order en DB + idempotencia + URL de Wompi (DB).
 *
 * Estrategia mixta (la pieza de mayor valor — finalizeCheckout — es DB):
 *   - calculateTotals + CheckoutError: unit puro, corre SIEMPRE.
 *   - Step savers / loadCheckoutContext / finalizeCheckout: integración DB.
 *     Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`); sin
 *     ella se saltan (skipIf) para no romper CI sin DB.
 *
 * Mocks (offline + determinista — NUNCA pega a servicios externos):
 *   - next/headers cookies(): jar en memoria stateful → setCheckoutState y
 *     peekCartSession round-trip real con la firma HMAC real (CSRF_SECRET de
 *     .env.local). Esto ejerce la verificación de firma de verdad.
 *   - @/lib/auth getCurrentUser(): controla si hay user logueado (default null).
 *   - @/features/payments/provider getPaymentProvider(): stub Wompi → no red.
 *   - @/features/shipping/provider getShippingProvider(): stub Aveonline.
 *   - next/cache: no-op (getSettingValue usa unstable_cache).
 *
 * DB real solo para: Category/Product/ProductVariant/Cart/CartItem/Customer/
 * Order/OrderItem/Design. Todo con prefijo único por corrida (RUN) y limpiado
 * en afterAll SCOPED al prefijo. JAMÁS toca datos reales.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ───────────────────────── Mocks (deben ir antes de importar el SUT) ─────────────────────────

// next/cache → no-op (getSettingValue → getSiteSetting usa unstable_cache, que
// fuera de un request real de Next puede comportarse raro; lo neutralizamos).
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// Jar de cookies en memoria — stateful entre get/set/delete dentro de un test.
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

// getCurrentUser controlable por test.
let mockUser: { id: string } | null = null;
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockUser,
}));

// Payment provider stub — registra llamadas para aserciones; controla fallo.
type CreateCheckoutCall = {
  reference: string;
  amountInCents: number;
  currency: string;
  customerEmail: string;
  redirectUrl: string;
};
const paymentCalls: CreateCheckoutCall[] = [];
let paymentShouldThrow: Error | null = null;
vi.mock("@/features/payments/provider", () => ({
  getPaymentProvider: () => ({
    name: "wompi" as const,
    createCheckout: async (input: CreateCheckoutCall) => {
      paymentCalls.push(input);
      if (paymentShouldThrow) throw paymentShouldThrow;
      return {
        checkoutUrl: `https://checkout.wompi.test/p/${input.reference}`,
        reference: input.reference,
      };
    },
  }),
}));

// Shipping provider stub — controla quotes devueltas o fallo de cotización.
type QuoteArgs = {
  origin: { city: string; department: string };
  destination: { city: string; department: string };
  items: unknown[];
  contraentrega: boolean;
};
let shippingQuoteResult: Array<{
  carrier: string;
  carrierName: string;
  fleteCop: number;
  deliveryDays: number;
  contraentrega: boolean;
  quoteId: string;
}> = [];
let shippingShouldThrow: Error | null = null;
const shippingCalls: QuoteArgs[] = [];
vi.mock("@/features/shipping/provider", () => ({
  getShippingProvider: async () => ({
    quote: async (args: QuoteArgs) => {
      shippingCalls.push(args);
      if (shippingShouldThrow) throw shippingShouldThrow;
      return shippingQuoteResult;
    },
  }),
}));

import { prisma } from "@/lib/db";
import {
  CheckoutError,
  calculateTotals,
  finalizeCheckout,
  loadCheckoutContext,
  quoteShipping,
  saveContactStep,
  saveAddressStep,
  saveShippingSelectionStep,
  savePaymentMethodStep,
  finishCheckoutSession,
} from "./service";
import { getCheckoutState } from "@/lib/checkout-session";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Toda fila creada lo lleva → limpieza scoped.
const RUN = `chk${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

// ───────────────────────── Helpers de fixtures ─────────────────────────

// UUID v4 válido (peekCartSession lo exige con regex estricto).
function uuid(): string {
  return crypto.randomUUID();
}

// Datos de contacto / dirección válidos por schema (no se validan en service,
// pero los usamos realistas).
const validContact = {
  fullName: "Lucia Perez",
  email: `${RUN}-buyer@lucams.test`,
  phone: "3001112233",
  documentType: "CC" as const,
  documentNumber: "1020304050",
};

const validUrbanAddress = {
  kind: "urban" as const,
  deptCode: "11",
  cityCode: "11001",
  department: "Bogotá D.C.",
  city: "Bogotá",
  viaType: "Calle" as const,
  viaNumber: "100",
  cruceNumber: "15-20",
  detail: "Apto 401",
  notes: "Dejar en portería",
};

// Dirección RURAL válida por schema. composeAddressLine la junta distinto a la
// urbana (vereda + finca + Ref) → ejercemos esa rama hasta Order.shippingAddress.
const validRuralAddress = {
  kind: "rural" as const,
  deptCode: "15",
  cityCode: "15001",
  department: "Boyacá",
  city: "Tunja",
  vereda: "El Roble",
  finca: "Las Flores",
  referencia: "a 200m del puente, casa color azul",
  notes: "Llamar antes de llegar",
};

const validShippingSelection = {
  carrier: "envia",
  carrierName: "Envía",
  fleteCop: 15_000,
  deliveryDays: 3,
  contraentrega: false,
  quoteId: `${RUN}-quote-1`,
};

let categoryId = "";
let productId = "";
// Variant con shipping dims configuradas (para quoteShipping happy path).
let variantWithDims = "";
// Variant SIN dims (para quoteShipping error path).
let variantNoDims = "";

/**
 * Crea un Cart real con un CartItem usando variantWithDims. Devuelve sessionId
 * + cartId. customerId opcional (para flujo logueado).
 */
async function createCartWithItem(opts: {
  sessionId: string;
  customerId?: string | null;
  qty?: number;
  unitPrice?: number;
  variantId?: string;
}): Promise<{ cartId: string; sessionId: string }> {
  const cart = await prisma.cart.create({
    data: {
      sessionId: opts.sessionId,
      customerId: opts.customerId ?? undefined,
      items: {
        create: [
          {
            variantId: opts.variantId ?? variantWithDims,
            qty: opts.qty ?? 2,
            unitPrice: opts.unitPrice ?? 50_000,
          },
        ],
      },
    },
    select: { id: true, sessionId: true },
  });
  return { cartId: cart.id, sessionId: cart.sessionId };
}

/** Resetea estado mutable entre tests. */
beforeEach(() => {
  cookieStore.clear();
  mockUser = null;
  paymentCalls.length = 0;
  paymentShouldThrow = null;
  shippingCalls.length = 0;
  shippingShouldThrow = null;
  shippingQuoteResult = [];
});

// ════════════════════════════════════════════════════════════════════════
// calculateTotals — PURO (corre siempre, con o sin DB)
// ════════════════════════════════════════════════════════════════════════

describe("calculateTotals — cálculo de totales (puro)", () => {
  it("suma subtotal + envío con descuento 0 por defecto", () => {
    const t = calculateTotals({ subtotal: 100_000, shippingCost: 15_000 });
    expect(t).toEqual({
      subtotal: 100_000,
      shipping: 15_000,
      discount: 0,
      tax: 0,
      total: 115_000,
    });
  });

  it("resta el descuento del total cuando se provee", () => {
    const t = calculateTotals({ subtotal: 100_000, shippingCost: 15_000, discount: 20_000 });
    expect(t.discount).toBe(20_000);
    expect(t.total).toBe(95_000); // 100k + 15k - 20k
  });

  it("IVA siempre es 0 (IVA incluido en precios COP, no se suma aparte)", () => {
    const t = calculateTotals({ subtotal: 999_999, shippingCost: 0 });
    expect(t.tax).toBe(0);
    expect(t.total).toBe(999_999);
  });

  it("envío gratis (shippingCost=0) no altera el subtotal", () => {
    const t = calculateTotals({ subtotal: 80_000, shippingCost: 0 });
    expect(t.total).toBe(80_000);
    expect(t.shipping).toBe(0);
  });

  it("todo en cero da total 0", () => {
    expect(calculateTotals({ subtotal: 0, shippingCost: 0 })).toEqual({
      subtotal: 0,
      shipping: 0,
      discount: 0,
      tax: 0,
      total: 0,
    });
  });

  it("BUG/comportamiento documentado: descuento > (subtotal+envío) da total NEGATIVO (sin clamp a 0)", () => {
    // calculateTotals no clampa. Un descuento mayor al cobrable produce un total
    // negativo. Documenta el comportamiento actual — el clamp/validación de
    // cupón es responsabilidad del caller (ver bugsFound).
    const t = calculateTotals({ subtotal: 50_000, shippingCost: 0, discount: 80_000 });
    expect(t.total).toBe(-30_000);
  });

  it("propaga los valores de entrada sin redondear ni mutar", () => {
    const t = calculateTotals({ subtotal: 123_456, shippingCost: 7_890, discount: 1_000 });
    expect(t.subtotal).toBe(123_456);
    expect(t.shipping).toBe(7_890);
    expect(t.total).toBe(123_456 + 7_890 - 1_000);
  });
});

// ════════════════════════════════════════════════════════════════════════
// CheckoutError — forma del error (puro)
// ════════════════════════════════════════════════════════════════════════

describe("CheckoutError — forma del error (puro)", () => {
  it("es una Error con code y name=CheckoutError; message default = code", () => {
    const e = new CheckoutError("CART_EMPTY");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CheckoutError");
    expect(e.code).toBe("CART_EMPTY");
    expect(e.message).toBe("CART_EMPTY");
  });

  it("usa el message provisto si se pasa", () => {
    const e = new CheckoutError("SHIPPING_QUOTE_FAILED", "Aveonline timeout");
    expect(e.code).toBe("SHIPPING_QUOTE_FAILED");
    expect(e.message).toBe("Aveonline timeout");
  });
});

// ════════════════════════════════════════════════════════════════════════
// Step savers — escriben la cookie firmada (COOKIE; corren siempre)
// ════════════════════════════════════════════════════════════════════════

describe("step savers — persisten state firmado en la cookie (round-trip HMAC)", () => {
  // CSRF_SECRET viene de .env.local. Si no está, setCheckoutState lanza; skip.
  const hasSecret = Boolean(
    process.env.CSRF_SECRET && !process.env.CSRF_SECRET.startsWith("GENERATE_WITH"),
  );

  beforeEach(() => {
    cookieStore.clear();
  });

  it.skipIf(!hasSecret)("saveContactStep deja step=1 y contact recuperable", async () => {
    await saveContactStep(validContact);
    const state = await getCheckoutState();
    expect(state?.step).toBe(1);
    expect(state?.contact?.email).toBe(validContact.email);
    expect(state?.contact?.fullName).toBe("Lucia Perez");
  });

  it.skipIf(!hasSecret)(
    "los steps se MERGEAN: contact → address → shipping → payment acumulan",
    async () => {
      await saveContactStep(validContact);
      await saveAddressStep(validUrbanAddress, { wantsInvoice: false });
      await saveShippingSelectionStep(validShippingSelection);
      await savePaymentMethodStep("WOMPI");

      const state = await getCheckoutState();
      // Cada saver mantiene lo anterior (merge en setCheckoutState).
      expect(state?.contact?.email).toBe(validContact.email);
      expect(state?.address?.city).toBe("Bogotá");
      expect(state?.billing?.wantsInvoice).toBe(false);
      expect(state?.shippingSelection?.carrier).toBe("envia");
      expect(state?.paymentMethod).toBe("WOMPI");
      // savePaymentMethodStep fija step=3.
      expect(state?.step).toBe(3);
    },
  );

  it.skipIf(!hasSecret)("savePaymentMethodStep acepta COD y queda persistido", async () => {
    await savePaymentMethodStep("COD");
    const state = await getCheckoutState();
    expect(state?.paymentMethod).toBe("COD");
    expect(state?.step).toBe(3);
  });

  it.skipIf(!hasSecret)("finishCheckoutSession borra la cookie (state vuelve a null)", async () => {
    await saveContactStep(validContact);
    expect(await getCheckoutState()).not.toBeNull();
    await finishCheckoutSession();
    expect(await getCheckoutState()).toBeNull();
  });

  it.skipIf(!hasSecret)(
    "SEGURIDAD: una cookie con firma manipulada se ignora (getCheckoutState → null)",
    async () => {
      await saveContactStep(validContact);
      const raw = cookieStore.get("checkout_state")!;
      // Corromper la firma (parte tras el último ".").
      const dot = raw.lastIndexOf(".");
      const tampered = raw.slice(0, dot + 1) + "deadbeefdeadbeefdeadbeefdeadbeef";
      cookieStore.set("checkout_state", tampered);
      expect(await getCheckoutState()).toBeNull();
    },
  );
});

// ════════════════════════════════════════════════════════════════════════
// loadCheckoutContext / quoteShipping / finalizeCheckout — INTEGRACIÓN DB
// ════════════════════════════════════════════════════════════════════════

describe.skipIf(!hasDb)("checkout/service — integración DB (ruta de ingresos)", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Prod ${RUN}`,
        description: "fixture checkout test",
        basePrice: 50_000,
        sku: `${RUN}-PROD`.toUpperCase(),
        categoryId,
        // physicalSpecs con los 4 campos críticos de shipping → quote OK.
        physicalSpecs: {
          weightGrams: 120,
          widthCm: 10,
          heightCm: 10,
          depthCm: 2,
        },
      },
    });
    productId = product.id;

    const vDims = await prisma.productVariant.create({
      data: {
        productId,
        name: "Con dims",
        sku: `${RUN}-VD`.toUpperCase(),
        stock: 100,
        attributes: {},
      },
    });
    variantWithDims = vDims.id;

    // Producto separado sin physicalSpecs → variant sin dims (error de quote).
    const prodNoDims = await prisma.product.create({
      data: {
        slug: `${RUN}-prod-nodims`,
        name: `ProdNoDims ${RUN}`,
        description: "fixture sin dims",
        basePrice: 30_000,
        sku: `${RUN}-PRODND`.toUpperCase(),
        categoryId,
        physicalSpecs: {}, // sin weight/dims
      },
    });
    const vNoDims = await prisma.productVariant.create({
      data: {
        productId: prodNoDims.id,
        name: "Sin dims",
        sku: `${RUN}-VND`.toUpperCase(),
        stock: 100,
        attributes: {},
      },
    });
    variantNoDims = vNoDims.id;
  });

  // Limpieza scoped a ESTA corrida. Los carts usan sessionId UUID (lo exige
  // peekCartSession) → no se pueden filtrar por prefijo RUN; los borramos por
  // asociación a las variantes-fixture de esta corrida (variantWithDims /
  // variantNoDims son únicas por RUN). Las orders se borran por email (lleva RUN).
  // FKs: OrderItem→Order, CartItem→Cart(Cascade) y CartItem.variant es Restrict,
  // así que TODO CartItem/OrderItem que referencie las variantes debe morir antes
  // de borrar las variantes en afterAll.
  async function cleanupRunData() {
    const fixtureVariants = [variantWithDims, variantNoDims].filter(Boolean);
    // Orders de esta corrida (email contiene RUN) + sus items.
    await prisma.orderItem.deleteMany({ where: { order: { email: { contains: RUN } } } });
    await prisma.order.deleteMany({ where: { email: { contains: RUN } } });
    // Carts que referencian las variantes-fixture (cubre los de sessionId UUID).
    const cartIds = (
      await prisma.cart.findMany({
        where: { items: { some: { variantId: { in: fixtureVariants } } } },
        select: { id: true },
      })
    ).map((c) => c.id);
    if (cartIds.length) {
      await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
      await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
    }
    // Carts vacíos huérfanos creados en tests (CART_EMPTY) — los borra cada
    // test inline, esto es defensa por si un test falló a mitad.
  }

  afterEach(async () => {
    await cleanupRunData();
  });

  afterAll(async () => {
    await cleanupRunData();
    await prisma.customer.deleteMany({ where: { email: { contains: RUN } } });
    await prisma.siteSetting.deleteMany({ where: { key: { startsWith: RUN } } });
    await prisma.productVariant.deleteMany({
      where: { id: { in: [variantWithDims, variantNoDims].filter(Boolean) } },
    });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  // Helper: setea la cookie cart_session apuntando al sessionId dado.
  function setCartCookie(sessionId: string) {
    cookieStore.set("cart_session", sessionId);
  }

  // ───────────────────────── loadCheckoutContext ─────────────────────────

  describe("loadCheckoutContext", () => {
    it("CART_NOT_FOUND cuando no hay cookie cart_session", async () => {
      // Sin setCartCookie → peekCartSession devuelve null.
      await expect(loadCheckoutContext()).rejects.toMatchObject({
        name: "CheckoutError",
        code: "CART_NOT_FOUND",
      });
    });

    it("CART_NOT_FOUND cuando la cookie no apunta a ningún Cart en DB", async () => {
      setCartCookie(uuid()); // UUID válido pero sin Cart asociado.
      await expect(loadCheckoutContext()).rejects.toMatchObject({
        code: "CART_NOT_FOUND",
      });
    });

    it("CART_EMPTY cuando el Cart existe pero no tiene items", async () => {
      // Cart vacío (sin items). sessionId debe ser UUID-shaped para peekCartSession.
      const sid = uuid();
      await prisma.cart.create({ data: { sessionId: sid } });
      setCartCookie(sid);
      await expect(loadCheckoutContext()).rejects.toMatchObject({
        code: "CART_EMPTY",
      });
      await prisma.cart.deleteMany({ where: { sessionId: sid } });
    });

    it("devuelve cart + state default (step 1) cuando hay items y no hay cookie de checkout", async () => {
      const sid = uuid();
      // sessionId con prefijo RUN para cleanup — pero debe ser UUID-shaped.
      // Usamos un UUID y guardamos su id para limpiar por id en afterEach via cart.
      const { cartId } = await prisma.cart
        .create({
          data: {
            sessionId: sid,
            items: { create: [{ variantId: variantWithDims, qty: 3, unitPrice: 50_000 }] },
          },
          select: { id: true },
        })
        .then((c) => ({ cartId: c.id }));
      setCartCookie(sid);

      const ctx = await loadCheckoutContext();
      expect(ctx.cart.cartId).toBe(cartId);
      expect(ctx.cart.items).toHaveLength(1);
      expect(ctx.cart.subtotal).toBe(150_000); // 3 * 50k
      expect(ctx.customerId).toBeNull();
      expect(ctx.state.step).toBe(1);

      await prisma.cartItem.deleteMany({ where: { cartId } });
      await prisma.cart.deleteMany({ where: { id: cartId } });
    });

    it("resuelve customerId vía supabaseUserId cuando hay user logueado y el cart no lo tiene seteado", async () => {
      const customer = await prisma.customer.create({
        data: {
          email: `${RUN}-cust@lucams.test`,
          firstName: "Cli",
          lastName: "Ente",
          supabaseUserId: `${RUN}-sub`,
          referralCode: `${RUN}-ref`,
        },
      });
      const sid = uuid();
      const cart = await prisma.cart.create({
        data: {
          sessionId: sid,
          // customerId NO seteado en el cart → fuerza el lookup por supabaseUserId.
          items: { create: [{ variantId: variantWithDims, qty: 1, unitPrice: 50_000 }] },
        },
        select: { id: true },
      });
      setCartCookie(sid);
      mockUser = { id: `${RUN}-sub` };

      const ctx = await loadCheckoutContext();
      expect(ctx.customerId).toBe(customer.id);

      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await prisma.cart.deleteMany({ where: { id: cart.id } });
    }, 30000);

    it("pre-llena el contacto del checkout desde el perfil del cliente logueado", async () => {
      const customer = await prisma.customer.create({
        data: {
          email: `${RUN}-prefill@lucams.test`,
          firstName: "Ana",
          lastName: "Ruiz",
          phone: "3009998877",
          documentType: "CC",
          documentNumber: "1020304050",
          supabaseUserId: `${RUN}-sub-pf`,
          referralCode: `${RUN}-ref-pf`,
        },
      });
      const sid = uuid();
      const cart = await prisma.cart.create({
        data: {
          sessionId: sid,
          items: { create: [{ variantId: variantWithDims, qty: 1, unitPrice: 50_000 }] },
        },
        select: { id: true },
      });
      setCartCookie(sid);
      mockUser = { id: `${RUN}-sub-pf` };

      const ctx = await loadCheckoutContext();
      expect(ctx.customerId).toBe(customer.id);
      // El contacto se pre-llenó desde el perfil (sin state de checkout previo).
      expect(ctx.state.contact?.fullName).toBe("Ana Ruiz");
      expect(ctx.state.contact?.email).toBe(`${RUN}-prefill@lucams.test`);
      expect(ctx.state.contact?.phone).toBe("3009998877");
      expect(ctx.state.contact?.documentType).toBe("CC");
      expect(ctx.state.contact?.documentNumber).toBe("1020304050");

      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await prisma.cart.deleteMany({ where: { id: cart.id } });
    }, 30000);
  });

  // ───────────────────────── quoteShipping ─────────────────────────

  describe("quoteShipping", () => {
    async function seedCartForQuote(variantId: string, sid: string) {
      await prisma.cart.create({
        data: {
          sessionId: sid,
          items: { create: [{ variantId, qty: 2, unitPrice: 50_000 }] },
        },
      });
      setCartCookie(sid);
    }

    it("mapea las quotes del provider al shape ShippingSelectionInput", async () => {
      const sid = uuid();
      await seedCartForQuote(variantWithDims, sid);
      shippingQuoteResult = [
        {
          carrier: "envia",
          carrierName: "Envía",
          fleteCop: 12_500,
          deliveryDays: 2,
          contraentrega: false,
          quoteId: "Q-1",
        },
        {
          carrier: "tcc",
          carrierName: "TCC",
          fleteCop: 9_900,
          deliveryDays: 4,
          contraentrega: true,
          quoteId: "Q-2",
        },
      ];

      const quotes = await quoteShipping({
        destinationCity: "Medellín",
        destinationDepartment: "Antioquia",
      });

      expect(quotes).toHaveLength(2);
      expect(quotes[0]).toEqual({
        carrier: "envia",
        carrierName: "Envía",
        fleteCop: 12_500,
        deliveryDays: 2,
        contraentrega: false,
        quoteId: "Q-1",
      });
      // El provider recibió items con las dims REALES del producto + declaredValue
      // = unitPrice del cart item.
      expect(shippingCalls).toHaveLength(1);
      const sentItems = shippingCalls[0].items as Array<Record<string, number>>;
      expect(sentItems[0]).toMatchObject({
        qty: 2,
        weightGrams: 120,
        widthCm: 10,
        heightCm: 10,
        depthCm: 2,
        declaredValueCop: 50_000,
      });
      expect(shippingCalls[0].destination).toEqual({
        city: "Medellín",
        department: "Antioquia",
      });

      await prisma.cartItem.deleteMany({ where: { cart: { sessionId: sid } } });
      await prisma.cart.deleteMany({ where: { sessionId: sid } });
    }, 30000);

    it("SHIPPING_QUOTE_FAILED cuando una variante del cart no tiene dims configuradas", async () => {
      const sid = uuid();
      await seedCartForQuote(variantNoDims, sid);
      shippingQuoteResult = [
        {
          carrier: "envia",
          carrierName: "Envía",
          fleteCop: 12_500,
          deliveryDays: 2,
          contraentrega: false,
          quoteId: "Q-1",
        },
      ];

      await expect(
        quoteShipping({ destinationCity: "Cali", destinationDepartment: "Valle del Cauca" }),
      ).rejects.toMatchObject({
        name: "CheckoutError",
        code: "SHIPPING_QUOTE_FAILED",
      });
      // Nunca llamó al provider (falló antes, al resolver dims).
      expect(shippingCalls).toHaveLength(0);

      await prisma.cartItem.deleteMany({ where: { cart: { sessionId: sid } } });
      await prisma.cart.deleteMany({ where: { sessionId: sid } });
    }, 30000);

    it("SHIPPING_QUOTE_FAILED (envuelto) cuando el provider lanza al cotizar", async () => {
      const sid = uuid();
      await seedCartForQuote(variantWithDims, sid);
      shippingShouldThrow = new Error("Aveonline 503");

      await expect(
        quoteShipping({ destinationCity: "Cali", destinationDepartment: "Valle del Cauca" }),
      ).rejects.toMatchObject({
        name: "CheckoutError",
        code: "SHIPPING_QUOTE_FAILED",
        message: "Aveonline 503",
      });

      await prisma.cartItem.deleteMany({ where: { cart: { sessionId: sid } } });
      await prisma.cart.deleteMany({ where: { sessionId: sid } });
    }, 30000);

    it("usa contraentrega=false por defecto cuando no se pasa", async () => {
      const sid = uuid();
      await seedCartForQuote(variantWithDims, sid);
      shippingQuoteResult = [];

      await quoteShipping({ destinationCity: "Tunja", destinationDepartment: "Boyacá" });
      expect(shippingCalls[0].contraentrega).toBe(false);

      await prisma.cartItem.deleteMany({ where: { cart: { sessionId: sid } } });
      await prisma.cart.deleteMany({ where: { sessionId: sid } });
    }, 30000);
  });

  // ───────────────────────── finalizeCheckout ─────────────────────────

  // Helper que arma el state completo en la cookie firmada para un sessionId
  // de cart dado. Usa los step savers reales → ejerce la firma HMAC.
  async function seedFullState(over?: {
    paymentMethod?: "WOMPI" | "COD";
    skipContact?: boolean;
    skipAddress?: boolean;
    skipShipping?: boolean;
    skipPayment?: boolean;
    address?: typeof validUrbanAddress | typeof validRuralAddress;
  }) {
    if (!over?.skipContact) await saveContactStep(validContact);
    if (!over?.skipAddress)
      await saveAddressStep(over?.address ?? validUrbanAddress, { wantsInvoice: false });
    if (!over?.skipShipping) await saveShippingSelectionStep(validShippingSelection);
    if (!over?.skipPayment) await savePaymentMethodStep(over?.paymentMethod ?? "WOMPI");
  }

  describe("finalizeCheckout", () => {
    it("happy path: crea Order PENDING_PAYMENT, calcula total y devuelve checkoutUrl de Wompi", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid, qty: 2, unitPrice: 50_000 });
      setCartCookie(sid);
      await seedFullState();

      const result = await finalizeCheckout({ redirectUrl: "https://lucamsshop.co/checkout/gracias" });

      // Order creada en DB con total correcto: subtotal(100k) + flete(15k) = 115k.
      expect(result.orderNumber).toMatch(/^LCM-\d{4}-\d{4}$/);
      const order = await prisma.order.findUnique({
        where: { id: result.orderId },
        include: { items: true },
      });
      expect(order).not.toBeNull();
      expect(order!.status).toBe("PENDING_PAYMENT");
      expect(order!.subtotal).toBe(100_000);
      expect(order!.shipping).toBe(15_000);
      expect(order!.total).toBe(115_000);
      expect(order!.email).toBe(validContact.email);
      expect(order!.paymentMethod).toBe("WOMPI");
      expect(order!.shippingCarrier).toBe("envia");
      expect(order!.items).toHaveLength(1);

      // El provider de pago recibió el Order.number + total en cents + email.
      expect(paymentCalls).toHaveLength(1);
      expect(paymentCalls[0]).toMatchObject({
        reference: order!.number,
        amountInCents: 115_000,
        currency: "COP",
        customerEmail: validContact.email,
        redirectUrl: "https://lucamsshop.co/checkout/gracias",
      });
      expect(result.checkoutUrl).toBe(`https://checkout.wompi.test/p/${order!.number}`);
    }, 30000);

    it("MISSING_CONTACT cuando falta el paso de contacto", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid });
      setCartCookie(sid);
      await seedFullState({ skipContact: true });

      await expect(
        finalizeCheckout({ redirectUrl: "https://x.test" }),
      ).rejects.toMatchObject({ code: "MISSING_CONTACT" });
      // No creó Order ni llamó a Wompi.
      expect(paymentCalls).toHaveLength(0);
      expect(await prisma.order.count({ where: { email: { contains: RUN } } })).toBe(0);
    }, 30000);

    it("MISSING_ADDRESS cuando falta la dirección", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid });
      setCartCookie(sid);
      await seedFullState({ skipAddress: true });
      await expect(
        finalizeCheckout({ redirectUrl: "https://x.test" }),
      ).rejects.toMatchObject({ code: "MISSING_ADDRESS" });
    }, 30000);

    it("MISSING_SHIPPING_SELECTION cuando falta la cotización elegida", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid });
      setCartCookie(sid);
      await seedFullState({ skipShipping: true });
      await expect(
        finalizeCheckout({ redirectUrl: "https://x.test" }),
      ).rejects.toMatchObject({ code: "MISSING_SHIPPING_SELECTION" });
    }, 30000);

    it("MISSING_PAYMENT_METHOD cuando no se eligió método de pago", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid });
      setCartCookie(sid);
      await seedFullState({ skipPayment: true });
      await expect(
        finalizeCheckout({ redirectUrl: "https://x.test" }),
      ).rejects.toMatchObject({ code: "MISSING_PAYMENT_METHOD" });
    }, 30000);

    it("PAYMENT_INIT_FAILED para COD: la Order se crea pero COD aún no está soportado (Fase 2.x)", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid });
      setCartCookie(sid);
      await seedFullState({ paymentMethod: "COD" });

      await expect(
        finalizeCheckout({ redirectUrl: "https://x.test" }),
      ).rejects.toMatchObject({
        code: "PAYMENT_INIT_FAILED",
        message: "Contraentrega aún no implementado (Fase 2.x)",
      });
      // La Order SÍ quedó creada (PENDING_PAYMENT) antes del throw de COD —
      // comportamiento actual del service (la guarda COD va después del create).
      const orders = await prisma.order.findMany({ where: { email: { contains: RUN } } });
      expect(orders).toHaveLength(1);
      expect(orders[0].paymentMethod).toBe("COD");
      // Nunca llamó a Wompi (rama COD corta antes).
      expect(paymentCalls).toHaveLength(0);
    }, 30000);

    it("PAYMENT_INIT_FAILED (envuelto) cuando Wompi lanza al crear checkout", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid });
      setCartCookie(sid);
      await seedFullState();
      paymentShouldThrow = new Error("Wompi gateway timeout");

      await expect(
        finalizeCheckout({ redirectUrl: "https://x.test" }),
      ).rejects.toMatchObject({
        code: "PAYMENT_INIT_FAILED",
        message: "Wompi gateway timeout",
      });
      // La Order ya fue creada en DB (se intenta el pago después del create).
      const orders = await prisma.order.findMany({ where: { email: { contains: RUN } } });
      expect(orders).toHaveLength(1);
    }, 30000);

    it("IDEMPOTENCIA: dos finalizeCheckout sobre el mismo cart devuelven la MISMA Order (1 sola fila)", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid, qty: 2, unitPrice: 50_000 });
      setCartCookie(sid);
      await seedFullState();

      const first = await finalizeCheckout({ redirectUrl: "https://x.test" });
      const second = await finalizeCheckout({ redirectUrl: "https://x.test" });

      // Mismo Order.id / number — createOrderFromCart es idempotente por cartId.
      expect(second.orderId).toBe(first.orderId);
      expect(second.orderNumber).toBe(first.orderNumber);

      const count = await prisma.order.count({
        where: { email: { contains: RUN }, status: "PENDING_PAYMENT" },
      });
      expect(count).toBe(1);
      // Wompi se invocó en ambas finalize (la idempotencia es sobre la Order,
      // no sobre la llamada al gateway).
      expect(paymentCalls).toHaveLength(2);
      expect(paymentCalls[0].reference).toBe(paymentCalls[1].reference);
    }, 30000);

    it("propaga la dirección compuesta (urban) al shippingAddress de la Order", async () => {
      const sid = uuid();
      await createCartWithItem({ sessionId: sid });
      setCartCookie(sid);
      await seedFullState();

      const result = await finalizeCheckout({ redirectUrl: "https://x.test" });
      const order = await prisma.order.findUnique({ where: { id: result.orderId } });
      const addr = order!.shippingAddress as Record<string, unknown>;
      // composeAddressLine("urban") → "Calle 100 # 15-20 (Apto 401)".
      expect(addr.addressLine1).toBe("Calle 100 # 15-20 (Apto 401)");
      expect(addr.city).toBe("Bogotá");
      expect(addr.fullName).toBe("Lucia Perez");
    }, 30000);

    it("propaga la dirección compuesta (RURAL) al shippingAddress de la Order", async () => {
      // Rama rural de composeAddressLine: vereda + finca + Ref descriptiva,
      // distinta a la nomenclatura urbana. Verifica que llega tal cual a la Order.
      const sid = uuid();
      await createCartWithItem({ sessionId: sid });
      setCartCookie(sid);
      await seedFullState({ address: validRuralAddress });

      const result = await finalizeCheckout({ redirectUrl: "https://x.test" });
      const order = await prisma.order.findUnique({ where: { id: result.orderId } });
      const addr = order!.shippingAddress as Record<string, unknown>;
      // composeAddressLine("rural") junta con " · ":
      //   "Vereda El Roble · Finca Las Flores · Ref: a 200m del puente, casa color azul".
      expect(addr.addressLine1).toBe(
        "Vereda El Roble · Finca Las Flores · Ref: a 200m del puente, casa color azul",
      );
      // department/city son los de la dirección rural, no los urbanos.
      expect(addr.city).toBe("Tunja");
      expect(addr.department).toBe("Boyacá");
      expect(addr.fullName).toBe("Lucia Perez");
    }, 30000);

    it("ORDER_CREATE_FAILED cuando no hay stock: NO crea Order ni llama a Wompi", async () => {
      // assertStockAvailable (dentro de createOrderFromCart) lanza
      // InsufficientStockError si qty pedida > stock de la variante (stock=100).
      // Pedimos 999 → falla en la creación de la Order; finalizeCheckout lo
      // envuelve como ORDER_CREATE_FAILED ANTES de tocar el gateway de pago.
      const sid = uuid();
      await createCartWithItem({ sessionId: sid, qty: 999, unitPrice: 50_000 });
      setCartCookie(sid);
      await seedFullState();

      await expect(
        finalizeCheckout({ redirectUrl: "https://x.test" }),
      ).rejects.toMatchObject({
        name: "CheckoutError",
        code: "ORDER_CREATE_FAILED",
        // El mensaje real propaga el de InsufficientStockError (no es genérico).
        message: expect.stringContaining("Stock insuficiente"),
      });

      // No quedó NINGUNA Order (la $transaction de createOrderFromCart hizo rollback).
      expect(await prisma.order.count({ where: { email: { contains: RUN } } })).toBe(0);
      // El gateway de pago nunca se invocó: el throw es anterior al bloque Wompi.
      expect(paymentCalls).toHaveLength(0);
    }, 30000);

    it("IDEMPOTENCIA con state divergente: el 2º finalize (email/total cambiados) NO crea otra Order — reusa la del cart", async () => {
      // Verificado empíricamente (no asumido): el índice parcial unique
      // Order_cartId_pending_unique (cartId WHERE status=PENDING_PAYMENT) hace
      // que un 2º finalize sobre el MISMO cart NO pueda crear otra Order, aunque
      // el state divergente (email/total nuevos en la cookie) evite el fast-path
      // de idempotencia (existing.total===total && existing.email===email). El
      // tx.order.create choca P2002(cartId) → isCartPendingUniqueViolation →
      // devuelve la Order existente SIN tocarla. El state divergente se DESCARTA
      // silenciosamente (ver bugsFound). Resultado: 1 sola Order, con los datos
      // del PRIMER finalize.
      const sid = uuid();
      await createCartWithItem({ sessionId: sid, qty: 2, unitPrice: 50_000 });
      setCartCookie(sid);
      await seedFullState();

      const first = await finalizeCheckout({ redirectUrl: "https://x.test" });

      // Cambiar email Y total (flete distinto) para el 2º finalize.
      await saveContactStep({ ...validContact, email: `${RUN}-changed@lucams.test` });
      await saveShippingSelectionStep({
        ...validShippingSelection,
        fleteCop: 99_000,
        quoteId: `${RUN}-quote-2`,
      });
      const second = await finalizeCheckout({ redirectUrl: "https://x.test" });

      // Misma Order: el cart ya tenía una PENDING_PAYMENT; el unique parcial la
      // protege. No se creó una segunda.
      expect(second.orderId).toBe(first.orderId);
      expect(second.orderNumber).toBe(first.orderNumber);
      // Solo este cart pertenece a este test (afterEach limpia entre tests) →
      // exactamente 1 Order para el RUN, ninguna segunda fila pese al divergente.
      const count = await prisma.order.count({ where: { email: { contains: RUN } } });
      expect(count).toBe(1);

      // La Order conserva los datos del PRIMER finalize — el state divergente NO
      // sobreescribió email ni total (subtotal 100k + flete original 15k = 115k).
      const order = await prisma.order.findUnique({ where: { id: first.orderId } });
      expect(order!.email).toBe(validContact.email);
      expect(order!.email).not.toBe(`${RUN}-changed@lucams.test`);
      expect(order!.total).toBe(115_000);
      expect(order!.shipping).toBe(15_000);

      // El 2º finalize SÍ vuelve a invocar Wompi (la idempotencia es sobre la
      // Order, no sobre el gateway) — ambas llamadas con la MISMA referencia.
      expect(paymentCalls).toHaveLength(2);
      expect(paymentCalls[0].reference).toBe(paymentCalls[1].reference);
      expect(paymentCalls[1].reference).toBe(first.orderNumber);
      // El monto cobrado en ambas es el original (115k), no el divergente.
      expect(paymentCalls[1].amountInCents).toBe(115_000);
    }, 30000);
  });
});
