/*
 * Tests de integración del SERVICE de ORDERS contra la DB real.
 *
 * FOCO (complementa, NO duplica stock.integration.test.ts ni
 * order-transitions.test.ts): el CICLO DE VIDA de la Order desde el punto de
 * vista de service.ts —
 *
 *   - createOrderFromCart: snapshot Cart→Order, cálculo de total
 *     (subtotal + shipping − discount + tax), numeración humana única
 *     "LCM-YYYY-NNNN" secuencial, token público, snapshot de items,
 *     marcado de Designs como USED_IN_ORDER, mapeo de billing/dianStatus,
 *     idempotency por cartId (existing PENDING_PAYMENT), errores (cart vacío /
 *     inexistente), validación de stock previa.
 *   - getOrder: lookup por id O number, includes, filtro deletedAt, null.
 *   - listOrders: filtro por status / needsReconciliation / búsqueda q
 *     (number, email, phone, nombre customer), sort, paginación, exclusión
 *     de soft-deleted, _count de items.
 *   - countOrdersNeedingReconciliation.
 *   - clearCartAfterPaid: soft-delete idempotente.
 *   - transitionOrder: not-found, idempotencia same-status, transición ilegal,
 *     transición legal + updatedBy, no-op de revert sin decremento previo.
 *   - Shapes de OrderTransitionError / OrderNotFoundError.
 *
 * Lo que NO se toca acá (ya cubierto): el ledger de stock (decrement/revert/
 * idempotency físico del InventoryLog), el claim atómico de guía, la saga
 * VOIDED→REFUNDED, y la matriz pura de canTransition.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`). Sin él,
 * se salta (skipIf) para no romper CI sin DB.
 *
 * Aislamiento: TODO fixture lleva el prefijo RUN único por corrida. Los Orders
 * de test se identifican por Order.email/number RUN-prefijados y se limpian
 * SCOPED en afterAll — JAMÁS se borra sin filtro ni se tocan datos reales
 * (cuenta de Lucy, productos seed, órdenes reales del año).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createOrderFromCart,
  getOrder,
  listOrders,
  transitionOrder,
  clearCartAfterPaid,
  countOrdersNeedingReconciliation,
  OrderTransitionError,
  OrderNotFoundError,
  type CreateOrderFromCartInput,
} from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Cart.sessionId, Product/Category/Variant sku/slug,
// Order.email y Customer.email lo llevan → limpieza scoped por prefijo.
const RUN = `ord${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

// Timeout generoso — el pooler de Supabase (pgbouncer :6543) es lento bajo
// concurrencia; el default de 5s no alcanza. Espeja los otros .integration.
const T = 30_000;

// ───────────────────────── IDs de fixtures (se llenan en beforeAll) ─────────────────────────
let categoryId = "";
let productId = "";
let variantAId = "";
let variantBId = "";
let lowStockVariantId = "";
const PRICE_A = 12_000;
const PRICE_B = 20_000;
const LOW_STOCK = 2;

// ───────────────────────── helpers ─────────────────────────

function uniq(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Email RUN-prefijado (filtrable en cleanup). */
function email(label: string): string {
  return `${RUN}-${label}-${uniq()}@lucams.test`;
}

async function makeCustomer(overrides?: { firstName?: string; lastName?: string }) {
  const u = uniq();
  return prisma.customer.create({
    data: {
      email: `${RUN}-${u}@lucams.test`,
      supabaseUserId: `${RUN}-${u}-sub`,
      referralCode: `${RUN}-${u}-ref`,
      firstName: overrides?.firstName,
      lastName: overrides?.lastName,
    },
    select: { id: true },
  });
}

/**
 * Crea un Cart con N items (sobre los fixtures) y devuelve su id + sessionId.
 * Los items apuntan a las variantes fixture; unitPrice se pasa explícito
 * (snapshot que el service copiará tal cual a OrderItem).
 */
async function makeCartWithItems(
  items: Array<{
    variantId: string;
    qty: number;
    unitPrice: number;
    designId?: string;
  }>,
  opts?: { customerId?: string | null },
): Promise<{ cartId: string; sessionId: string }> {
  const sessionId = `${RUN}-cart-${uniq()}`;
  const cart = await prisma.cart.create({
    data: {
      sessionId,
      customerId: opts?.customerId ?? undefined,
      items: {
        create: items.map((it) => ({
          variantId: it.variantId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          designId: it.designId,
        })),
      },
    },
    select: { id: true, sessionId: true },
  });
  return { cartId: cart.id, sessionId: cart.sessionId };
}

/**
 * Input base para createOrderFromCart; se sobreescribe cartId y lo que haga falta.
 * `overrides.shipping` se MERGEA sobre el shipping default (parcial) — así los
 * tests solo especifican los campos que les importan (email/city/department).
 */
type BaseOverrides = Omit<Partial<CreateOrderFromCartInput>, "shipping"> & {
  shipping?: Partial<CreateOrderFromCartInput["shipping"]>;
};
function baseInput(cartId: string, overrides: BaseOverrides = {}): CreateOrderFromCartInput {
  const { shipping: shipOverride, ...rest } = overrides;
  return {
    cartId,
    customerId: null,
    shipping: {
      fullName: "Cliente Prueba",
      email: shipOverride?.email ?? email("ship"),
      phone: "3208873826",
      city: "Bogotá",
      department: "Cundinamarca",
      addressLine1: "Calle 123 # 45-67",
      ...shipOverride,
    },
    shippingSelection: {
      carrier: "coordinadora",
      carrierName: "Coordinadora",
      fleteCop: 15_000,
      deliveryDays: 3,
      contraentrega: false,
      quoteId: `${RUN}-quote`,
    },
    billing: { wantsInvoice: false },
    paymentMethod: "WOMPI",
    ...rest,
  };
}

// ───────────────────────── suite ─────────────────────────

describe.skipIf(!hasDb)("orders/service — integración DB (ciclo de vida)", { timeout: T }, () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Prod ${RUN}`,
        description: "fixture orders",
        basePrice: 10_000,
        sku: `${RUN}-PROD`.toUpperCase(),
        categoryId,
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
        variants: {
          create: [
            {
              name: "Var A",
              sku: `${RUN}-VA`.toUpperCase(),
              price: PRICE_A,
              stock: 1000,
              attributes: {},
            },
            {
              name: "Var B",
              sku: `${RUN}-VB`.toUpperCase(),
              price: PRICE_B,
              stock: 1000,
              attributes: {},
            },
            {
              name: "Low",
              sku: `${RUN}-LOW`.toUpperCase(),
              price: 5_000,
              stock: LOW_STOCK,
              attributes: {},
            },
          ],
        },
      },
      select: { id: true, variants: { select: { id: true, sku: true } } },
    });
    productId = product.id;
    variantAId = product.variants.find((v) => v.sku.endsWith("-VA"))!.id;
    variantBId = product.variants.find((v) => v.sku.endsWith("-VB"))!.id;
    lowStockVariantId = product.variants.find((v) => v.sku.endsWith("-LOW"))!.id;
  }, T); // hookTimeout explícito: el default de vitest (10s) no alcanza al pooler.

  // Ids de orders / sessionIds de carts que un describe SEEDÓ en su beforeAll y
  // que deben SOBREVIVIR al afterEach (se limpian en el afterAll del describe o
  // en el afterAll del archivo). Sin esto, el afterEach (que borra por prefijo
  // RUN) barrería los fixtures compartidos del describe tras el 1er `it`.
  const keepAliveOrderIds = new Set<string>();
  const keepAliveSessionIds = new Set<string>();

  // Borra lo creado por tests, scoped al prefijo RUN, respetando keep-alive.
  // Orden FK: InventoryLog → OrderItem → Order → CartItem → Cart → Customer.
  async function cleanupOrdersAndCarts(
    opts: { respectKeepAlive: boolean } = { respectKeepAlive: true },
  ) {
    // NOTA: Order.cartId es un string plano SIN relación FK (schema: "NO FK"),
    // por eso NO se puede filtrar por `cart: {...}`. Identificamos las orders de
    // test por email/number RUN-prefijados y por los cartId de los carts RUN.
    const carts = await prisma.cart.findMany({
      where: { sessionId: { startsWith: RUN } },
      select: { id: true, sessionId: true },
    });
    const cartIds = carts
      .filter((c) => !(opts.respectKeepAlive && keepAliveSessionIds.has(c.sessionId)))
      .map((c) => c.id);

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { email: { contains: RUN } },
          { number: { contains: RUN } },
          ...(cartIds.length ? [{ cartId: { in: cartIds } }] : []),
        ],
      },
      select: { id: true },
    });
    const orderIds = orders
      .map((o) => o.id)
      .filter((id) => !(opts.respectKeepAlive && keepAliveOrderIds.has(id)));
    if (orderIds.length) {
      await prisma.inventoryLog.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    // Carts creados por los helpers (soft-delete o no).
    if (cartIds.length) {
      await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
      await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
    }
  }

  afterEach(async () => {
    await cleanupOrdersAndCarts();
    // Customers: no borrar los de orders keep-alive activos (romperían el include).
    // Los tests que crean customers los limpian implícitamente al no ser keep-alive;
    // acá borramos solo los que NO están referenciados por una order viva.
    await prisma.customer.deleteMany({
      where: { email: { contains: RUN }, orders: { none: {} } },
    });
  }, T);

  afterAll(async () => {
    // Cleanup RESILIENTE: cada paso en try/catch para que un blip transitorio del
    // pooler pgbouncer no aborte el barrido y deje fixtures huérfanos (hallado por
    // la revisión adversarial). Todo sigue RUN-scoped, nunca toca datos reales.
    const safe = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* blip del pooler — se ignora, el fixture es RUN-scoped */
      }
    };
    await safe(() => cleanupOrdersAndCarts({ respectKeepAlive: false }));
    // Cupones sembrados por los tests de revert (CouponUsage cascada al borrar orders arriba).
    await safe(() => prisma.coupon.deleteMany({ where: { code: { startsWith: RUN } } }));
    await safe(() => prisma.customer.deleteMany({ where: { email: { contains: RUN } } }));
    // Designs de esta corrida (Design.product es Restrict → antes que producto).
    await safe(() => prisma.design.deleteMany({ where: { productId } }));
    await safe(() => prisma.productVariant.deleteMany({ where: { productId } }));
    await safe(() => prisma.product.deleteMany({ where: { id: productId } }));
    await safe(() => prisma.category.deleteMany({ where: { id: categoryId } }));
  }, T);

  // ════════════════════════════════════════════════════════════════════════
  // createOrderFromCart — creación, total, numeración, snapshot
  // ════════════════════════════════════════════════════════════════════════

  describe("createOrderFromCart", () => {
    it("happy path: crea Order PENDING_PAYMENT desde el cart, snapshotea items y devuelve totales", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 2, unitPrice: PRICE_A }, // 24000
        { variantId: variantBId, qty: 1, unitPrice: PRICE_B }, // 20000
      ]);
      const shipEmail = email("hp");
      const result = await createOrderFromCart(
        baseInput(cartId, { shipping: { email: shipEmail } }),
      );

      const expectedSubtotal = 2 * PRICE_A + 1 * PRICE_B; // 44000
      const expectedTotal = expectedSubtotal + 15_000; // + flete, sin descuento ni tax
      expect(result.subtotal).toBe(expectedSubtotal);
      expect(result.shipping).toBe(15_000);
      expect(result.discount).toBe(0);
      expect(result.total).toBe(expectedTotal);
      expect(result.id).toBeTruthy();

      // Persistencia en DB: estado, email, método, cartId de origen, token público.
      const row = await prisma.order.findUnique({
        where: { id: result.id },
        include: { items: { select: { variantId: true, qty: true, unitPrice: true } } },
      });
      expect(row!.status).toBe("PENDING_PAYMENT");
      expect(row!.email).toBe(shipEmail);
      expect(row!.paymentMethod).toBe("WOMPI");
      expect(row!.cartId).toBe(cartId);
      expect(row!.tax).toBe(0);
      expect(row!.currency).toBe("COP");
      expect(row!.publicAccessToken).toMatch(/^[0-9a-f]{32}$/); // crypto.randomBytes(16).toString("hex")

      // Items snapshoteados 1:1 con el cart (qty + unitPrice congelados).
      expect(row!.items).toHaveLength(2);
      const byVariant = new Map(row!.items.map((i) => [i.variantId, i]));
      expect(byVariant.get(variantAId)!.qty).toBe(2);
      expect(byVariant.get(variantAId)!.unitPrice).toBe(PRICE_A);
      expect(byVariant.get(variantBId)!.qty).toBe(1);
      expect(byVariant.get(variantBId)!.unitPrice).toBe(PRICE_B);
    });

    it("total respeta el unitPrice SNAPSHOT del cart, no el price actual de la variante", async () => {
      // El cart congela unitPrice distinto al price vigente de la variante.
      const SNAP = 9_999; // != PRICE_A
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 3, unitPrice: SNAP },
      ]);
      const result = await createOrderFromCart(baseInput(cartId));
      expect(result.subtotal).toBe(3 * SNAP);
      expect(result.total).toBe(3 * SNAP + 15_000);
    });

    it("flete 0 (envío gratis): total == subtotal", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const result = await createOrderFromCart(
        baseInput(cartId, {
          shippingSelection: {
            carrier: "gratis",
            carrierName: "Envío gratis",
            fleteCop: 0,
            deliveryDays: 5,
            contraentrega: false,
            quoteId: `${RUN}-free`,
          },
        }),
      );
      expect(result.shipping).toBe(0);
      expect(result.total).toBe(PRICE_A);
    });

    it("Order.number tiene formato LCM-YYYY-NNNN con el año actual", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const result = await createOrderFromCart(baseInput(cartId));
      const year = new Date().getFullYear();
      expect(result.number).toMatch(new RegExp(`^LCM-${year}-\\d{4}$`));
    });

    it("dos Orders consecutivas reciben números ESTRICTAMENTE crecientes (contador anual)", async () => {
      const c1 = await makeCartWithItems([{ variantId: variantAId, qty: 1, unitPrice: PRICE_A }]);
      const c2 = await makeCartWithItems([{ variantId: variantBId, qty: 1, unitPrice: PRICE_B }]);
      const r1 = await createOrderFromCart(baseInput(c1.cartId));
      const r2 = await createOrderFromCart(baseInput(c2.cartId));

      // Extraer el secuencial numérico de "LCM-YYYY-NNNN".
      const seq = (n: string) => Number(n.split("-")[2]);
      expect(seq(r2.number)).toBe(seq(r1.number) + 1);
      // El número es único (constraint DB) — ambos distintos.
      expect(r1.number).not.toBe(r2.number);
    });

    it("marca los Designs vinculados como USED_IN_ORDER (immutable post-checkout)", async () => {
      const design = await prisma.design.create({
        data: {
          sessionId: `${RUN}-d-${uniq()}`,
          productId,
          status: "READY",
          canvasData: {},
          previewUrl: "https://cdn.lucams.test/p.png",
        },
        select: { id: true },
      });
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A, designId: design.id },
      ]);

      const result = await createOrderFromCart(baseInput(cartId));

      const after = await prisma.design.findUnique({
        where: { id: design.id },
        select: { status: true },
      });
      expect(after!.status).toBe("USED_IN_ORDER");

      // El OrderItem quedó vinculado al mismo designId (snapshot).
      const item = await prisma.orderItem.findFirst({
        where: { orderId: result.id },
        select: { designId: true },
      });
      expect(item!.designId).toBe(design.id);
    });

    it("billing.wantsInvoice=true → dianStatus PENDING + copia documento y nombre; false → NOT_REQUIRED", async () => {
      // Con factura.
      const withInvoice = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const r1 = await createOrderFromCart(
        baseInput(withInvoice.cartId, {
          billing: {
            wantsInvoice: true,
            documentType: "CC",
            documentNumber: "1020304050",
            name: "Ana Pérez",
          },
        }),
      );
      const o1 = await prisma.order.findUnique({
        where: { id: r1.id },
        select: {
          dianStatus: true,
          billingDocumentType: true,
          billingDocumentNumber: true,
          billingName: true,
        },
      });
      expect(o1!.dianStatus).toBe("PENDING");
      expect(o1!.billingDocumentType).toBe("CC");
      expect(o1!.billingDocumentNumber).toBe("1020304050");
      expect(o1!.billingName).toBe("Ana Pérez");

      // Sin factura.
      const noInvoice = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const r2 = await createOrderFromCart(
        baseInput(noInvoice.cartId, { billing: { wantsInvoice: false } }),
      );
      const o2 = await prisma.order.findUnique({
        where: { id: r2.id },
        select: { dianStatus: true },
      });
      expect(o2!.dianStatus).toBe("NOT_REQUIRED");
    });

    it("paymentMethod COD se persiste tal cual", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const result = await createOrderFromCart(baseInput(cartId, { paymentMethod: "COD" }));
      const row = await prisma.order.findUnique({
        where: { id: result.id },
        select: { paymentMethod: true },
      });
      expect(row!.paymentMethod).toBe("COD");
    });

    it("asocia el customerId cuando se pasa (order de usuario logueado)", async () => {
      const customer = await makeCustomer();
      const { cartId } = await makeCartWithItems(
        [{ variantId: variantAId, qty: 1, unitPrice: PRICE_A }],
        { customerId: customer.id },
      );
      const result = await createOrderFromCart(baseInput(cartId, { customerId: customer.id }));
      const row = await prisma.order.findUnique({
        where: { id: result.id },
        select: { customerId: true },
      });
      expect(row!.customerId).toBe(customer.id);
    });

    it("guarda la shippingAddress como snapshot JSON con los campos del checkout", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const shipEmail = email("addr");
      const result = await createOrderFromCart(
        baseInput(cartId, {
          shipping: { email: shipEmail, city: "Medellín", department: "Antioquia" },
        }),
      );
      const row = await prisma.order.findUnique({
        where: { id: result.id },
        select: { shippingAddress: true, phone: true },
      });
      const addr = row!.shippingAddress as Record<string, unknown>;
      expect(addr.city).toBe("Medellín");
      expect(addr.department).toBe("Antioquia");
      expect(addr.email).toBe(shipEmail);
      expect(row!.phone).toBe("3208873826");
    });

    // ── Idempotency por cartId ──────────────────────────────────────────────

    it("IDEMPOTENCIA: reintentar el MISMO cart (mismo total + email) devuelve la Order existente, no crea otra", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 2, unitPrice: PRICE_A },
      ]);
      const shipEmail = email("idem");
      const input = baseInput(cartId, { shipping: { email: shipEmail } });

      const first = await createOrderFromCart(input);
      const second = await createOrderFromCart(input);

      // Misma Order devuelta (mismo id y number) — NO se creó una segunda.
      expect(second.id).toBe(first.id);
      expect(second.number).toBe(first.number);
      const count = await prisma.order.count({
        where: { cartId, status: "PENDING_PAYMENT", deletedAt: null },
      });
      expect(count).toBe(1);
    });

    it("mismo cart con total distinto (flete distinto) RECONCILIA la MISMA Order con datos frescos (auditoría v3 · H1/H3)", async () => {
      // Comportamiento correcto: NO se crea una 2da Order (1 cart = 1 Order activa), pero si el
      // cliente cambia algo entre "ir a pagar" y "pagar" (acá, la transportadora → flete distinto)
      // la orden PENDING existente se ACTUALIZA en el sitio con el total/flete/carrier frescos, en
      // vez de devolver el total VIEJO (que cobraría distinto a lo que muestra el resumen).
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const shipEmail = email("diff");
      const first = await createOrderFromCart(
        baseInput(cartId, {
          shipping: { email: shipEmail },
          shippingSelection: {
            carrier: "a",
            carrierName: "A",
            fleteCop: 10_000,
            deliveryDays: 2,
            contraentrega: false,
            quoteId: `${RUN}-a`,
          },
        }),
      );
      const second = await createOrderFromCart(
        baseInput(cartId, {
          shipping: { email: shipEmail },
          shippingSelection: {
            carrier: "b",
            carrierName: "B",
            fleteCop: 30_000,
            deliveryDays: 5,
            contraentrega: false,
            quoteId: `${RUN}-b`,
          },
        }),
      );
      // Misma order (mismo id/number) PERO con el total y la transportadora ACTUALIZADOS.
      expect(second.id).toBe(first.id);
      expect(second.number).toBe(first.number);
      expect(first.total).toBe(PRICE_A + 10_000);
      expect(second.total).toBe(PRICE_A + 30_000);
      const row = await prisma.order.findUnique({
        where: { id: first.id },
        select: { total: true, shipping: true, shippingCarrier: true },
      });
      expect(row!.total).toBe(PRICE_A + 30_000);
      expect(row!.shipping).toBe(30_000);
      expect(row!.shippingCarrier).toBe("b");
      // Sigue habiendo exactamente 1 Order PENDING_PAYMENT para el cart.
      const count = await prisma.order.count({
        where: { cartId, status: "PENDING_PAYMENT", deletedAt: null },
      });
      expect(count).toBe(1);
    });

    it("reconcilia el paymentMethod al reusar una orden COD para pagar por Wompi (auditoría v3 · B1)", async () => {
      // Escenario del blocker: el cliente arma la orden como COD, se le bloquea (anti-abuso) y
      // reintenta por Wompi. createOrderFromCart debe DEVOLVER la orden con paymentMethod=WOMPI (no
      // COD), para que la saga jamás genere una guía contraentrega sobre un pago en línea.
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const shipEmail = email("codwompi");
      const asCod = await createOrderFromCart(
        baseInput(cartId, { shipping: { email: shipEmail }, paymentMethod: "COD" }),
      );
      expect(asCod.paymentMethod).toBe("COD");
      const asWompi = await createOrderFromCart(
        baseInput(cartId, { shipping: { email: shipEmail }, paymentMethod: "WOMPI" }),
      );
      expect(asWompi.id).toBe(asCod.id);
      expect(asWompi.paymentMethod).toBe("WOMPI");
      const row = await prisma.order.findUnique({
        where: { id: asCod.id },
        select: { paymentMethod: true },
      });
      expect(row!.paymentMethod).toBe("WOMPI");
    });

    // ── Errores / bordes ────────────────────────────────────────────────────

    it("cart vacío (0 items) lanza error explícito y NO crea Order", async () => {
      const { cartId } = await makeCartWithItems([]);
      await expect(createOrderFromCart(baseInput(cartId))).rejects.toThrow(/vac/i);
      expect(await prisma.order.count({ where: { cartId } })).toBe(0);
    });

    it("cart inexistente lanza 'Cart no encontrado'", async () => {
      await expect(createOrderFromCart(baseInput(`${RUN}-ghost-cart`))).rejects.toThrow(
        /Cart no encontrado/,
      );
    });

    it("cart soft-deleted (deletedAt) se trata como inexistente", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      await prisma.cart.update({
        where: { id: cartId },
        data: { deletedAt: new Date(), deletedBy: "test" },
      });
      await expect(createOrderFromCart(baseInput(cartId))).rejects.toThrow(/Cart no encontrado/);
    });

    it("stock insuficiente en una variante bloquea la creación (assertStockAvailable) y NO crea Order", async () => {
      // lowStockVariant tiene stock=2; pedimos 5.
      const { cartId } = await makeCartWithItems([
        { variantId: lowStockVariantId, qty: LOW_STOCK + 3, unitPrice: 5_000 },
      ]);
      await expect(createOrderFromCart(baseInput(cartId))).rejects.toThrow();
      expect(await prisma.order.count({ where: { cartId } })).toBe(0);
      // El stock NO se tocó (la validación es lectura; el decremento es post-PAID).
      const v = await prisma.productVariant.findUnique({
        where: { id: lowStockVariantId },
        select: { stock: true },
      });
      expect(v!.stock).toBe(LOW_STOCK);
    });

    it("#9 — total > MAX_MONEY_CENTS lanza OrderAmountTooLargeError y NO crea Order (guard INT4)", async () => {
      // variantA tiene stock=1000; el guard de overflow INT4 corre ANTES de assertStockAvailable.
      // unitPrice 300_000_000 centavos ($3.000.000) × 8 = 2.4e9 > MAX_MONEY_CENTS (2_147_483_647).
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 8, unitPrice: 300_000_000 },
      ]);
      await expect(createOrderFromCart(baseInput(cartId))).rejects.toMatchObject({
        name: "OrderAmountTooLargeError",
      });
      expect(await prisma.order.count({ where: { cartId } })).toBe(0);
    });

    it("stock exactamente igual a la cantidad pedida SÍ permite crear (>= qty)", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: lowStockVariantId, qty: LOW_STOCK, unitPrice: 5_000 },
      ]);
      const result = await createOrderFromCart(baseInput(cartId));
      expect(result.id).toBeTruthy();
      // Stock intacto: el decremento ocurre recién en PAID, no en creación.
      const v = await prisma.productVariant.findUnique({
        where: { id: lowStockVariantId },
        select: { stock: true },
      });
      expect(v!.stock).toBe(LOW_STOCK);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // getOrder — lookup por id o number
  // ════════════════════════════════════════════════════════════════════════

  describe("getOrder", () => {
    async function seedOrder() {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      return createOrderFromCart(baseInput(cartId, { shipping: { email: email("get") } }));
    }

    it("encuentra la Order por su id (cuid) con items + variant incluidos", async () => {
      const created = await seedOrder();
      const found = await getOrder(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.items).toHaveLength(1);
      // include: variant seleccionado (sku/productId/price).
      expect(found!.items[0].variant.productId).toBe(productId);
    });

    it("encuentra la MISMA Order por su number humano (admin puede usar cualquiera)", async () => {
      const created = await seedOrder();
      const byNumber = await getOrder(created.number);
      expect(byNumber).not.toBeNull();
      expect(byNumber!.id).toBe(created.id);
    });

    it("devuelve null para un id/number inexistente (no lanza)", async () => {
      expect(await getOrder(`${RUN}-nope`)).toBeNull();
    });

    it("no devuelve órdenes soft-deleted (deletedAt)", async () => {
      const created = await seedOrder();
      await prisma.order.update({
        where: { id: created.id },
        data: { deletedAt: new Date(), deletedBy: "test" },
      });
      expect(await getOrder(created.id)).toBeNull();
      expect(await getOrder(created.number)).toBeNull();
    });

    it("incluye el customer cuando la order tiene uno", async () => {
      const customer = await makeCustomer({ firstName: "Lina", lastName: "Gómez" });
      const { cartId } = await makeCartWithItems(
        [{ variantId: variantAId, qty: 1, unitPrice: PRICE_A }],
        { customerId: customer.id },
      );
      const created = await createOrderFromCart(baseInput(cartId, { customerId: customer.id }));
      const found = await getOrder(created.id);
      expect(found!.customer).not.toBeNull();
      expect(found!.customer!.firstName).toBe("Lina");
      expect(found!.customer!.lastName).toBe("Gómez");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // listOrders — filtro, búsqueda, sort, paginación
  // ════════════════════════════════════════════════════════════════════════

  describe("listOrders", () => {
    // Seedea varias orders con estados/emails/totales controlados para este describe.
    // NOTA: listOrders NO filtra por RUN — para aserciones precisas sobre CANTIDAD
    // filtramos con `q` por un token único, no por el total global de la DB.
    let seededEmailToken = "";
    let orderPaidId = "";
    let orderPendingId = "";
    let orderShippedId = "";

    beforeAll(async () => {
      seededEmailToken = `${RUN}list${uniq()}`;
      // 3 orders que comparten el token en el email → buscables con q exacto.
      // Registran keep-alive para SOBREVIVIR al afterEach entre los `it` de este
      // describe (se limpian en el afterAll del describe).
      const mk = async (qtyPrice: number) => {
        const { cartId, sessionId } = await makeCartWithItems([
          { variantId: variantAId, qty: 1, unitPrice: qtyPrice },
        ]);
        keepAliveSessionIds.add(sessionId);
        const order = await createOrderFromCart(
          baseInput(cartId, { shipping: { email: `${seededEmailToken}@lucams.test` } }),
        );
        keepAliveOrderIds.add(order.id);
        return order;
      };
      const a = await mk(PRICE_A); // total 12000 + 15000 = 27000
      const b = await mk(50_000); // total 50000 + 15000 = 65000 (el más caro)
      const c = await mk(30_000); // total 30000 + 15000 = 45000
      orderPendingId = a.id;
      orderPaidId = b.id;
      orderShippedId = c.id;

      // Llevar b a PAID y c a SHIPPED para probar filtro por status.
      await prisma.order.update({ where: { id: orderPaidId }, data: { status: "PAID" } });
      await prisma.order.update({ where: { id: orderShippedId }, data: { status: "SHIPPED" } });
    }, T); // hookTimeout: crea 3 orders vía el pooler; el default 10s no alcanza.

    it("busca por email (q, insensitive) y devuelve solo las 3 orders del token", async () => {
      const res = await listOrders({ q: seededEmailToken });
      expect(res.total).toBe(3);
      expect(res.items).toHaveLength(3);
      const ids = res.items.map((o) => o.id).sort();
      expect(ids).toEqual([orderPendingId, orderPaidId, orderShippedId].sort());
    });

    it("filtra por status combinado con q → solo la order PAID del token", async () => {
      const res = await listOrders({ q: seededEmailToken, status: "PAID" });
      expect(res.total).toBe(1);
      expect(res.items[0].id).toBe(orderPaidId);
    });

    it("status='all' equivale a no filtrar por estado", async () => {
      const res = await listOrders({ q: seededEmailToken, status: "all" });
      expect(res.total).toBe(3);
    });

    it("busca por number exacto (q) → 1 resultado", async () => {
      const target = await prisma.order.findUnique({
        where: { id: orderPaidId },
        select: { number: true },
      });
      const res = await listOrders({ q: target!.number });
      expect(res.items.some((o) => o.id === orderPaidId)).toBe(true);
      // El number es único → contiene exactamente esa order.
      expect(res.items.every((o) => o.id === orderPaidId)).toBe(true);
    });

    it("sort 'total-desc' ordena la más cara primero", async () => {
      const res = await listOrders({ q: seededEmailToken, sort: "total-desc" });
      expect(res.items[0].id).toBe(orderPaidId); // total 65000
      // Monotónicamente decreciente por total.
      const totals = res.items.map((o) => o.total);
      const sorted = [...totals].sort((x, y) => y - x);
      expect(totals).toEqual(sorted);
    });

    it("sort 'oldest' invierte el orden por createdAt vs 'recent'", async () => {
      const recent = await listOrders({ q: seededEmailToken, sort: "recent" });
      const oldest = await listOrders({ q: seededEmailToken, sort: "oldest" });
      // Los mismos 3 elementos, orden inverso extremo a extremo.
      expect(recent.items[0].id).toBe(oldest.items[oldest.items.length - 1].id);
      expect(recent.items[recent.items.length - 1].id).toBe(oldest.items[0].id);
    });

    it("paginación: pageSize=2 → página 1 con 2 items + totalPages=2; página 2 con 1 item", async () => {
      const p1 = await listOrders({ q: seededEmailToken, pageSize: 2, page: 1, sort: "oldest" });
      expect(p1.items).toHaveLength(2);
      expect(p1.total).toBe(3);
      expect(p1.page).toBe(1);
      expect(p1.pageSize).toBe(2);
      expect(p1.totalPages).toBe(2);

      const p2 = await listOrders({ q: seededEmailToken, pageSize: 2, page: 2, sort: "oldest" });
      expect(p2.items).toHaveLength(1);
      // No hay solape entre páginas.
      const p1ids = new Set(p1.items.map((o) => o.id));
      expect(p2.items.every((o) => !p1ids.has(o.id))).toBe(true);
    });

    it("page < 1 se normaliza a 1 (Math.max)", async () => {
      const res = await listOrders({ q: seededEmailToken, page: 0 });
      expect(res.page).toBe(1);
    });

    it("_count.items refleja la cantidad de líneas de cada order", async () => {
      const res = await listOrders({ q: seededEmailToken });
      // Cada order del token tiene exactamente 1 línea.
      expect(res.items.every((o) => o._count.items === 1)).toBe(true);
    });

    it("incluye customer.firstName/lastName cuando existe", async () => {
      const customer = await makeCustomer({ firstName: "Sara", lastName: "Ruiz" });
      const custToken = `${RUN}cust${uniq()}`;
      const { cartId } = await makeCartWithItems(
        [{ variantId: variantAId, qty: 1, unitPrice: PRICE_A }],
        { customerId: customer.id },
      );
      await createOrderFromCart(
        baseInput(cartId, {
          customerId: customer.id,
          shipping: { email: `${custToken}@lucams.test` },
        }),
      );
      // Buscar por nombre del customer (q pega también contra customer.firstName).
      const res = await listOrders({ q: "Sara" });
      const mine = res.items.find((o) => o.email === `${custToken}@lucams.test`);
      expect(mine).toBeTruthy();
      expect(mine!.customer!.firstName).toBe("Sara");
    });

    it("excluye órdenes soft-deleted del listado y del total", async () => {
      const del = await listOrders({ q: seededEmailToken });
      expect(del.total).toBe(3);
      await prisma.order.update({
        where: { id: orderPendingId },
        data: { deletedAt: new Date(), deletedBy: "test" },
      });
      const after = await listOrders({ q: seededEmailToken });
      expect(after.total).toBe(2);
      expect(after.items.some((o) => o.id === orderPendingId)).toBe(false);
      // Restaurar para no romper otros asserts del describe (aunque afterEach limpia todo).
      await prisma.order.update({
        where: { id: orderPendingId },
        data: { deletedAt: null, deletedBy: null },
      });
    });

    it("q sin coincidencias → lista vacía, total 0, totalPages mínimo 1", async () => {
      const res = await listOrders({ q: `${RUN}-zzz-nomatch` });
      expect(res.items).toHaveLength(0);
      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(1); // Math.max(1, ...)
    });

    // Los 3 orders seedeados sobreviven el afterEach vía keep-alive; se limpian
    // acá al terminar el describe (y el afterAll del archivo barre remanentes).
    afterAll(async () => {
      const ids = [orderPaidId, orderPendingId, orderShippedId].filter(Boolean);
      await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: ids } } });
      ids.forEach((id) => keepAliveOrderIds.delete(id));
    }, T);
  });

  // ════════════════════════════════════════════════════════════════════════
  // countOrdersNeedingReconciliation + filtro needsReconciliation
  // ════════════════════════════════════════════════════════════════════════

  describe("reconciliation", () => {
    it("countOrdersNeedingReconciliation sube al flaggear y baja al soft-deletear", async () => {
      // countOrdersNeedingReconciliation() es un conteo GLOBAL; otros archivos de
      // test pueden flaggear órdenes en paralelo. Por eso NO aseveramos igualdad
      // exacta (frágil) sino la DIRECCIÓN del cambio que causa NUESTRA mutación,
      // con lecturas contiguas para minimizar la ventana de ruido concurrente.
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      const created = await createOrderFromCart(
        baseInput(cartId, { shipping: { email: email("recon") } }),
      );

      const beforeFlag = await countOrdersNeedingReconciliation();
      await prisma.order.update({
        where: { id: created.id },
        data: {
          needsReconciliation: true,
          reconciliationReason: "stock agotado post-cobro (test)",
        },
      });
      const afterFlag = await countOrdersNeedingReconciliation();
      expect(afterFlag).toBeGreaterThan(beforeFlag); // nuestra flagged suma al conteo

      // Soft-delete la excluye del conteo.
      await prisma.order.update({
        where: { id: created.id },
        data: { deletedAt: new Date(), deletedBy: "test" },
      });
      const afterDelete = await countOrdersNeedingReconciliation();
      expect(afterDelete).toBeLessThan(afterFlag); // nuestra soft-deleted deja de contarse
    });

    it("listOrders({needsReconciliation:true}) devuelve solo las flagged (verificado vía q para aislar)", async () => {
      const token = `${RUN}recon${uniq()}`;
      // Una flagged y una no-flagged, mismo token de email.
      const c1 = await makeCartWithItems([{ variantId: variantAId, qty: 1, unitPrice: PRICE_A }]);
      const flagged = await createOrderFromCart(
        baseInput(c1.cartId, { shipping: { email: `${token}@lucams.test` } }),
      );
      const c2 = await makeCartWithItems([{ variantId: variantBId, qty: 1, unitPrice: PRICE_B }]);
      await createOrderFromCart(
        baseInput(c2.cartId, { shipping: { email: `${token}@lucams.test` } }),
      );

      await prisma.order.update({ where: { id: flagged.id }, data: { needsReconciliation: true } });

      const res = await listOrders({ q: token, needsReconciliation: true });
      expect(res.total).toBe(1);
      expect(res.items[0].id).toBe(flagged.id);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // clearCartAfterPaid — soft-delete idempotente
  // ════════════════════════════════════════════════════════════════════════

  describe("clearCartAfterPaid", () => {
    it("soft-deletea el cart (deletedAt + deletedBy=saga:order-paid)", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      await clearCartAfterPaid(cartId);
      const cart = await prisma.cart.findUnique({
        where: { id: cartId },
        select: { deletedAt: true, deletedBy: true },
      });
      expect(cart!.deletedAt).not.toBeNull();
      expect(cart!.deletedBy).toBe("saga:order-paid");
    });

    it("NO borra físicamente los CartItem (quedan como audit history)", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
        { variantId: variantBId, qty: 2, unitPrice: PRICE_B },
      ]);
      await clearCartAfterPaid(cartId);
      expect(await prisma.cartItem.count({ where: { cartId } })).toBe(2);
    });

    it("es idempotente: llamarlo 2 veces no cambia el deletedAt del primer clear", async () => {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      await clearCartAfterPaid(cartId);
      const first = await prisma.cart.findUnique({
        where: { id: cartId },
        select: { deletedAt: true },
      });
      await clearCartAfterPaid(cartId);
      const second = await prisma.cart.findUnique({
        where: { id: cartId },
        select: { deletedAt: true },
      });
      // El updateMany filtra deletedAt:null → la 2da vez es no-op, el timestamp no cambia.
      expect(second!.deletedAt!.getTime()).toBe(first!.deletedAt!.getTime());
    });

    it("cartId inexistente → no-op silencioso (no lanza)", async () => {
      await expect(clearCartAfterPaid(`${RUN}-no-cart`)).resolves.toBeUndefined();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // transitionOrder — máquina de estados a nivel DB
  // ════════════════════════════════════════════════════════════════════════

  describe("transitionOrder", () => {
    async function seedPending() {
      const { cartId } = await makeCartWithItems([
        { variantId: variantAId, qty: 1, unitPrice: PRICE_A },
      ]);
      return createOrderFromCart(baseInput(cartId, { shipping: { email: email("trans") } }));
    }

    it("transición legal PENDING_PAYMENT → PAID actualiza el status y setea updatedBy", async () => {
      const order = await seedPending();
      const updated = await transitionOrder(order.id, "PAID", { actorAdminId: "admin-42" });
      expect(updated.status).toBe("PAID");
      const row = await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true, updatedBy: true },
      });
      expect(row!.status).toBe("PAID");
      expect(row!.updatedBy).toBe("admin-42");
    });

    it("transición ilegal PENDING_PAYMENT → SHIPPED lanza OrderTransitionError y NO cambia el status", async () => {
      const order = await seedPending();
      await expect(transitionOrder(order.id, "SHIPPED")).rejects.toBeInstanceOf(
        OrderTransitionError,
      );
      const row = await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });
      expect(row!.status).toBe("PENDING_PAYMENT");
    });

    it("transición al MISMO status es idempotente: devuelve la order sin error ni update", async () => {
      const order = await seedPending();
      const res = await transitionOrder(order.id, "PENDING_PAYMENT", { actorAdminId: "admin-x" });
      expect(res.status).toBe("PENDING_PAYMENT");
      // Idempotente → NO escribió updatedBy (early return antes del update).
      const row = await prisma.order.findUnique({
        where: { id: order.id },
        select: { updatedBy: true },
      });
      expect(row!.updatedBy).toBeNull();
    });

    it("order inexistente lanza OrderNotFoundError", async () => {
      await expect(transitionOrder(`${RUN}-ghost-order`, "PAID")).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
    });

    it("order soft-deleted se trata como inexistente (OrderNotFoundError)", async () => {
      const order = await seedPending();
      await prisma.order.update({
        where: { id: order.id },
        data: { deletedAt: new Date(), deletedBy: "test" },
      });
      await expect(transitionOrder(order.id, "PAID")).rejects.toBeInstanceOf(OrderNotFoundError);
    });

    it("aplica campos extra junto con la transición (ej. trackingNumber al ir a FULFILLING)", async () => {
      const order = await seedPending();
      await transitionOrder(order.id, "PAID");
      const updated = await transitionOrder(order.id, "FULFILLING", {
        actorAdminId: "admin-guia",
        extra: { trackingNumber: `${RUN}-TRK-123`, shippingCarrier: "envia" },
      });
      expect(updated.status).toBe("FULFILLING");
      const row = await prisma.order.findUnique({
        where: { id: order.id },
        select: { trackingNumber: true, shippingCarrier: true, updatedBy: true },
      });
      expect(row!.trackingNumber).toBe(`${RUN}-TRK-123`);
      expect(row!.shippingCarrier).toBe("envia");
      expect(row!.updatedBy).toBe("admin-guia");
    });

    it("PENDING_PAYMENT → CANCELLED (needsRevert) sin decremento previo: transiciona y el revert es no-op", async () => {
      // No hubo InventoryLog ORDER_PAID (nunca se pagó), así que revertStockForOrder
      // detecta "no prior decrement" y no toca stock. La transición SÍ ocurre.
      const order = await seedPending();
      const stockBefore = (await prisma.productVariant.findUnique({
        where: { id: variantAId },
        select: { stock: true },
      }))!.stock;

      const updated = await transitionOrder(order.id, "CANCELLED", {
        actorAdminId: "admin-cancel",
      });
      expect(updated.status).toBe("CANCELLED");

      const row = await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true, updatedBy: true },
      });
      expect(row!.status).toBe("CANCELLED");
      expect(row!.updatedBy).toBe("admin-cancel");

      // Stock intacto (no había decremento que revertir) y sin InventoryLog de cancel.
      const stockAfter = (await prisma.productVariant.findUnique({
        where: { id: variantAId },
        select: { stock: true },
      }))!.stock;
      expect(stockAfter).toBe(stockBefore);
      const cancelLog = await prisma.inventoryLog.findFirst({ where: { orderId: order.id } });
      expect(cancelLog).toBeNull();
    });

    it("CANCELLED es terminal: intentar salir lanza OrderTransitionError", async () => {
      const order = await seedPending();
      await transitionOrder(order.id, "CANCELLED");
      await expect(transitionOrder(order.id, "PAID")).rejects.toBeInstanceOf(OrderTransitionError);
    });

    // F2 — revert de cupón al cancelar/reembolsar: simétrico a la saga PAID.
    describe("revert de cupón consumido", () => {
      // Reproduce el estado post-PAID que deja la saga: coupon.usedCount=1 + CouponUsage(orderId) +
      // order.couponId. Devuelve los ids para asertar el revert.
      async function seedPaidWithConsumedCoupon(maxUses: number | null) {
        const order = await seedPending();
        await transitionOrder(order.id, "PAID");
        const now = Date.now();
        const coupon = await prisma.coupon.create({
          data: {
            code: `${RUN}-CUP-${Math.random().toString(36).slice(2, 8)}`,
            type: "PERCENT",
            value: 10,
            maxUses,
            usedCount: 1,
            validFrom: new Date(now - 86_400_000),
            validTo: new Date(now + 86_400_000),
          },
          select: { id: true },
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { couponId: coupon.id, discount: 500 },
        });
        await prisma.couponUsage.create({
          data: { couponId: coupon.id, orderId: order.id, amount: 500 },
        });
        return { orderId: order.id, couponId: coupon.id };
      }

      it("REFUNDED libera el cupón: borra CouponUsage y decrementa usedCount (single-use reutilizable)", async () => {
        const { orderId, couponId } = await seedPaidWithConsumedCoupon(1);
        await transitionOrder(orderId, "REFUNDED", { actorAdminId: "admin-refund" });
        expect(await prisma.couponUsage.findUnique({ where: { orderId } })).toBeNull();
        const coupon = await prisma.coupon.findUnique({
          where: { id: couponId },
          select: { usedCount: true },
        });
        expect(coupon!.usedCount).toBe(0);
      });

      it("CANCELLED libera el cupón igual que REFUNDED (misma rama needsRevert)", async () => {
        const { orderId, couponId } = await seedPaidWithConsumedCoupon(5);
        await transitionOrder(orderId, "CANCELLED", { actorAdminId: "admin-cancel" });
        expect(await prisma.couponUsage.findUnique({ where: { orderId } })).toBeNull();
        const coupon = await prisma.coupon.findUnique({
          where: { id: couponId },
          select: { usedCount: true },
        });
        expect(coupon!.usedCount).toBe(0);
      });

      it("orden sin cupón consumido: el revert es no-op y no revienta", async () => {
        const order = await seedPending();
        await transitionOrder(order.id, "PAID");
        const updated = await transitionOrder(order.id, "REFUNDED", { actorAdminId: "admin-x" });
        expect(updated.status).toBe("REFUNDED");
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Shapes de errores (corren con DB porque el describe padre es skipIf)
  // ════════════════════════════════════════════════════════════════════════

  describe("error shapes", () => {
    it("OrderTransitionError expone from/to y un mensaje legible", () => {
      const e = new OrderTransitionError("PAID", "CANCELLED");
      expect(e).toBeInstanceOf(Error);
      expect(e.from).toBe("PAID");
      expect(e.to).toBe("CANCELLED");
      expect(e.message).toContain("PAID");
      expect(e.message).toContain("CANCELLED");
    });

    it("OrderNotFoundError incluye el id/number buscado en el mensaje", () => {
      const e = new OrderNotFoundError("LCM-2026-0007");
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toContain("LCM-2026-0007");
    });
  });
});
