/*
 * Purga de ÓRDENES DE TEST y sus fixtures anclados (AUTORIZADO por Lucy 2026-07-22:
 * "elimina toda esa basura del Panel Admin").
 *
 * ALCANCE (quirúrgico — la DB es compartida con producción):
 *   1. Órdenes con email @lucams.test (53 al 2026-07-22: LCM-TEST-VOID-*, LCM-SAGA*,
 *      RTR-*, ord*-trans, claim). TODAS de $10–$400 COP. GUARDARÁN: si alguna tuviera
 *      total > $10.000 COP (1.000.000 centavos) el script ABORTA sin tocar nada.
 *   2. Todo lo anclado EXCLUSIVAMENTE a esas órdenes: OrderItem, CouponUsage,
 *      RetractRequest (vía item), WarrantyClaim (vía item), CodReconciliation,
 *      InventoryLog (orderId), StockReservation (orderId), LoyaltyTxn (orderId),
 *      WebhookEvent (externalId = wompiTransactionId de la orden), y los Cart de
 *      origen (Order.cartId). NO existe modelo Payment en el schema (Wompi se
 *      concilia manual) ni vínculo Order→EmailEvent: se reportan como "no aplica".
 *   3. Los productos FIXTURE anclados por esas órdenes (slug con epoch de 13 dígitos
 *      + prefijo test/ord/rtr/saga — misma señal que purge-archived-test-junk.mjs),
 *      con sus variantes (Cascade), Designs (Restrict → borrado explícito) y
 *      CartItems huérfanos sobre esas variantes (Restrict → barrido explícito).
 *   4. Las categorías fixture de esos productos (misma señal; solo si quedan VACÍAS).
 *   5. Customers @lucams.test HUÉRFANOS (sin órdenes/carritos/diseños/etc.) — chk*.
 *
 * Seguridad extra: un producto/categoría referenciado por las órdenes de test que NO
 * matchee el patrón fixture NO se borra (se reporta). Los WebhookEvent/EmailEvent NO
 * ligados a estas órdenes quedan intactos (ajenos al alcance, ej. AVEONLINE real).
 *
 * Transaccional: TODO corre en UNA $transaction (all-or-nothing). Idempotente: un
 * re-run encuentra 0 órdenes @lucams.test y sale sin tocar nada.
 *
 * Uso:
 *   node scripts/purge-test-orders.mjs            # DRY-RUN: plan + conteos, sin escribir
 *   node scripts/purge-test-orders.mjs --apply    # ejecuta la purga
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** Techo de seguridad: $10.000 COP en centavos. Ninguna orden de test lo supera. */
const MAX_TEST_TOTAL = 1_000_000;
/** Misma señal de fixture que purge-archived-test-junk.mjs: epoch 13 dígitos + prefijo. */
const RUN_PREFIXES = [
  "test",
  "ord",
  "rtr",
  "saga",
  "chk",
  "cart",
  "e2e",
  "cms",
  "cons",
  "rls",
  "prod",
  "cat",
  "shots",
  "clone",
];
const looksLikeFixture = (slug) =>
  /1[0-9]{12}/.test(slug) && RUN_PREFIXES.some((p) => slug.startsWith(p));

async function main() {
  console.log(`=== purge-test-orders (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // ── Alcance: órdenes de test (@lucams.test) con guardarrail de total ────────
  const orders = await prisma.order.findMany({
    where: { email: { endsWith: "@lucams.test" } },
    select: {
      id: true,
      number: true,
      email: true,
      total: true,
      wompiTransactionId: true,
      cartId: true,
    },
  });
  if (orders.length === 0) {
    console.log("No hay órdenes @lucams.test — nada que hacer (idempotente ✓).");
    return;
  }
  const overLimit = orders.filter((o) => o.total > MAX_TEST_TOTAL);
  if (overLimit.length > 0) {
    console.error(
      `✗ ABORTO: ${overLimit.length} orden(es) @lucams.test superan $${(MAX_TEST_TOTAL / 100).toLocaleString("es-CO")} COP — fuera del alcance autorizado:`,
    );
    for (const o of overLimit)
      console.error(`  ${o.number} · $${(o.total / 100).toLocaleString("es-CO")}`);
    process.exit(1);
  }
  const orderIds = orders.map((o) => o.id);
  const wompiTxIds = orders.map((o) => o.wompiTransactionId).filter(Boolean);
  const cartIds = orders.map((o) => o.cartId).filter(Boolean);
  console.log(
    `Órdenes de test en alcance: ${orders.length} (totales $${Math.min(...orders.map((o) => o.total)) / 100}–$${Math.max(...orders.map((o) => o.total)) / 100} COP)`,
  );

  const result = await prisma.$transaction(
    async (tx) => {
      const c = {};

      // ── Conteos de lo anclado (para el reporte fila-por-fila) ───────────────
      const items = await tx.orderItem.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true, variantId: true },
      });
      const itemIds = items.map((i) => i.id);

      // Productos anclados por esas líneas → fixture o NO (reporte).
      const variantIds = [...new Set(items.map((i) => i.variantId))];
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, product: { select: { id: true, slug: true, categoryId: true } } },
      });
      const anchoredProducts = new Map();
      for (const v of variants) anchoredProducts.set(v.product.id, v.product);
      const fixtureProducts = [...anchoredProducts.values()].filter((p) =>
        looksLikeFixture(p.slug),
      );
      const nonFixture = [...anchoredProducts.values()].filter((p) => !looksLikeFixture(p.slug));
      const fixtureIds = fixtureProducts.map((p) => p.id);
      const fixtureCatIds = [...new Set(fixtureProducts.map((p) => p.categoryId))];

      if (!APPLY) {
        // DRY-RUN: solo conteos, sin escribir.
        c.orderItems = await tx.orderItem.count({ where: { orderId: { in: orderIds } } });
        c.retractRequests = await tx.retractRequest.count({
          where: { orderItemId: { in: itemIds } },
        });
        c.warrantyClaims = await tx.warrantyClaim.count({
          where: { orderItemId: { in: itemIds } },
        });
        c.couponUsages = await tx.couponUsage.count({ where: { orderId: { in: orderIds } } });
        c.codReconciliations = await tx.codReconciliation.count({
          where: { orderId: { in: orderIds } },
        });
        c.inventoryLogs = await tx.inventoryLog.count({ where: { orderId: { in: orderIds } } });
        c.stockReservations = await tx.stockReservation.count({
          where: { orderId: { in: orderIds } },
        });
        c.loyaltyTxns = await tx.loyaltyTxn.count({ where: { orderId: { in: orderIds } } });
        c.webhookEvents = wompiTxIds.length
          ? await tx.webhookEvent.count({ where: { externalId: { in: wompiTxIds } } })
          : 0;
        c.carts = cartIds.length ? await tx.cart.count({ where: { id: { in: cartIds } } }) : 0;
        c.designs = await tx.design.count({ where: { productId: { in: fixtureIds } } });
        c.fixtureVariantIds = (
          await tx.productVariant.findMany({
            where: { productId: { in: fixtureIds } },
            select: { id: true },
          })
        ).length;
        c.cartItemsOnFixture = await tx.cartItem.count({
          where: { variant: { productId: { in: fixtureIds } } },
        });
        // Customers @lucams.test huérfanos (plan).
        const dryCustomers = await tx.customer.findMany({
          where: { email: { endsWith: "@lucams.test" } },
          select: {
            id: true,
            _count: {
              select: {
                orders: true,
                designs: true,
                designAssets: true,
                reviews: true,
                supportTickets: true,
                wishlist: true,
                backInStockSubs: true,
                loyaltyTxns: true,
                consents: true,
                addresses: true,
                couponUsages: true,
                recommendationLogs: true,
                warrantyClaims: true,
                referrals: true,
              },
            },
          },
        });
        c.customers = 0;
        for (const cu of dryCustomers) {
          const carts = await tx.cart.count({ where: { customerId: cu.id } });
          if (Object.values(cu._count).reduce((a, b) => a + b, 0) + carts === 0) c.customers++;
        }
        return { c, fixtureProducts, nonFixture, fixtureCatIds, fixtureIds };
      }

      // ── APPLY: borrado en orden de dependencias ─────────────────────────────
      // Ligados a la orden (WebhookEvent/InventoryLog/StockReservation/LoyaltyTxn
      // no tienen FK — deleteMany explícito; el resto cae por Cascade pero se borra
      // explícito para tener el conteo exacto).
      c.webhookEvents = wompiTxIds.length
        ? (await tx.webhookEvent.deleteMany({ where: { externalId: { in: wompiTxIds } } })).count
        : 0;
      c.inventoryLogs = (
        await tx.inventoryLog.deleteMany({ where: { orderId: { in: orderIds } } })
      ).count;
      c.stockReservations = (
        await tx.stockReservation.deleteMany({ where: { orderId: { in: orderIds } } })
      ).count;
      c.loyaltyTxns = (
        await tx.loyaltyTxn.deleteMany({ where: { orderId: { in: orderIds } } })
      ).count;
      c.codReconciliations = (
        await tx.codReconciliation.deleteMany({ where: { orderId: { in: orderIds } } })
      ).count;
      c.retractRequests = (
        await tx.retractRequest.deleteMany({ where: { orderItemId: { in: itemIds } } })
      ).count;
      c.warrantyClaims = (
        await tx.warrantyClaim.deleteMany({ where: { orderItemId: { in: itemIds } } })
      ).count;
      c.couponUsages = (
        await tx.couponUsage.deleteMany({ where: { orderId: { in: orderIds } } })
      ).count;
      c.orderItems = (
        await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
      ).count;
      c.orders = (await tx.order.deleteMany({ where: { id: { in: orderIds } } })).count;

      // Carts de origen de esas órdenes (Order.cartId, sin FK). Sus items caen por Cascade.
      c.carts = cartIds.length
        ? (await tx.cart.deleteMany({ where: { id: { in: cartIds } } })).count
        : 0;

      // ── Productos fixture: designs (Restrict), cartItems huérfanos (Restrict),
      //    inventoryLogs residuales por variante, luego el producto (variantes,
      //    reviews, ocasionTags, wishlist, backInStock, templates y reservations
      //    caen por Cascade; QuoteItem es SetNull).
      c.designs = (await tx.design.deleteMany({ where: { productId: { in: fixtureIds } } })).count;
      c.cartItemsOnFixture = (
        await tx.cartItem.deleteMany({
          where: {
            OR: [
              { variant: { productId: { in: fixtureIds } } },
              { design: { productId: { in: fixtureIds } } },
            ],
          },
        })
      ).count;
      const fixtureVariants = await tx.productVariant.findMany({
        where: { productId: { in: fixtureIds } },
        select: { id: true },
      });
      c.fixtureVariants = fixtureVariants.length;
      c.inventoryLogsResidual = fixtureVariants.length
        ? (
            await tx.inventoryLog.deleteMany({
              where: { variantId: { in: fixtureVariants.map((v) => v.id) } },
            })
          ).count
        : 0;
      c.fixtureProducts = 0;
      for (const p of fixtureProducts) {
        await tx.product.delete({ where: { id: p.id } });
        c.fixtureProducts++;
      }

      // Carritos de sesión de los fixtures (sessionId "<run>-cart-*") ya vacíos.
      const fixtureRunPrefixes = fixtureProducts.map((p) => p.slug.replace(/-prod$/, ""));
      c.fixtureCarts = (
        await tx.cart.deleteMany({
          where: {
            OR: fixtureRunPrefixes.map((pre) => ({ sessionId: { startsWith: `${pre}-cart-` } })),
          },
        })
      ).count;

      // ── Categorías fixture: solo si quedaron VACÍAS tras el borrado ─────────
      c.categories = 0;
      c.categoriesKept = [];
      for (const catId of fixtureCatIds) {
        const cat = await tx.category.findUnique({
          where: { id: catId },
          select: { slug: true, _count: { select: { products: true } } },
        });
        if (!cat) continue;
        if (!looksLikeFixture(cat.slug) || cat._count.products > 0) {
          c.categoriesKept.push(`${cat.slug} (${cat._count.products} productos)`);
          continue;
        }
        await tx.category.delete({ where: { id: catId } });
        c.categories++;
      }

      // ── Customers @lucams.test HUÉRFANOS (chk*): sin órdenes ni ningún vínculo.
      //    (Cart.customerId no es FK — se cuenta aparte.)
      const testCustomers = await tx.customer.findMany({
        where: { email: { endsWith: "@lucams.test" } },
        select: {
          id: true,
          email: true,
          _count: {
            select: {
              orders: true,
              designs: true,
              designAssets: true,
              reviews: true,
              supportTickets: true,
              wishlist: true,
              backInStockSubs: true,
              loyaltyTxns: true,
              consents: true,
              addresses: true,
              couponUsages: true,
              recommendationLogs: true,
              warrantyClaims: true,
              referrals: true,
            },
          },
        },
      });
      c.customers = 0;
      c.customersKept = [];
      for (const cu of testCustomers) {
        const carts = await tx.cart.count({ where: { customerId: cu.id } });
        const links = Object.values(cu._count).reduce((a, b) => a + b, 0) + carts;
        if (links > 0) {
          c.customersKept.push(`${cu.email} (${links} vínculos)`);
          continue;
        }
        await tx.customer.delete({ where: { id: cu.id } });
        c.customers++;
      }

      return { c, fixtureProducts, nonFixture, fixtureCatIds, fixtureIds };
    },
    { timeout: 60000, maxWait: 15000 },
  );

  const { c, fixtureProducts, nonFixture } = result;
  console.log(`\nProductos fixture anclados (${fixtureProducts.length}):`);
  for (const p of fixtureProducts) console.log(`  ⊘ ${p.slug}`);
  if (nonFixture.length > 0) {
    console.log(`\n⚠ Referenciados por las órdenes pero SIN patrón fixture — NO tocados:`);
    for (const p of nonFixture) console.log(`  ~ ${p.slug}`);
  }

  console.log(`\n${APPLY ? "FILAS BORRADAS" : "FILAS QUE SE BORRARÍAN"} por tabla:`);
  const rows = [
    ["Order", APPLY ? c.orders : orders.length],
    ["OrderItem", c.orderItems],
    ["RetractRequest", c.retractRequests],
    ["WarrantyClaim", c.warrantyClaims],
    ["CouponUsage", c.couponUsages],
    ["CodReconciliation", c.codReconciliations],
    ["InventoryLog", c.inventoryLogs + (c.inventoryLogsResidual ?? 0)],
    ["StockReservation", c.stockReservations],
    ["LoyaltyTxn", c.loyaltyTxns],
    ["WebhookEvent", c.webhookEvents],
    ["Cart (órdenes)", c.carts],
    ["Cart (sesiones fixture)", c.fixtureCarts ?? "—"],
    ["CartItem (fixtures)", c.cartItemsOnFixture],
    ["Design", c.designs],
    ["Product (fixture)", APPLY ? c.fixtureProducts : fixtureProducts.length],
    ["ProductVariant (cascade)", APPLY ? c.fixtureVariants : c.fixtureVariantIds],
    ["Category (fixture)", APPLY ? c.categories : result.fixtureCatIds.length],
    ["Customer (huérfanos)", c.customers ?? "—"],
  ];
  for (const [table, n] of rows) console.log(`  ${table}: ${n}`);
  console.log("  Payment: no aplica (no existe el modelo en el schema — Wompi se concilia manual)");
  console.log("  EmailEvent: no aplica (sin FK a Order; metadata no enlazada)");

  if (c.categoriesKept?.length)
    console.log(`\n⚠ Categorías NO borradas: ${c.categoriesKept.join(", ")}`);
  if (c.customersKept?.length)
    console.log(`⚠ Customers test CON vínculos, NO borrados: ${c.customersKept.join(", ")}`);
  if (!APPLY)
    console.log(
      "\nDRY-RUN (sin cambios). Para ejecutar: node scripts/purge-test-orders.mjs --apply",
    );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
