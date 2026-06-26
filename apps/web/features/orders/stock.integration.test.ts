/*
 * Tests de integración del STOCK LEDGER contra la DB real.
 *
 * Certificación Bloque A (2026-06-26): el P0 bloqueante (índice unique
 * (orderId, reason) sin variantId rompía toda orden multi-ítem) NO era
 * detectable con tests unitarios mockeados — solo se manifiesta contra el
 * UNIQUE INDEX real de Postgres. Estos tests son el regression que habría
 * atrapado el bug en segundos.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`). Si no
 * está, se saltan (skipIf) para no romper CI sin DB.
 *
 * Aislamiento: crea fixtures con SKUs únicos por corrida + limpia en afterAll.
 * Usa orderIds sintéticos (InventoryLog.orderId no tiene FK).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  decrementStockForOrder,
  revertStockForOrder,
  INVENTORY_REASON,
} from "./stock";
import { StockAlreadyAppliedError } from "./errors";

const hasDb = Boolean(process.env.DATABASE_URL);
const run = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// IDs de fixtures (se llenan en beforeAll).
let categoryId = "";
let productId = "";
let variantA = "";
let variantB = "";

describe.skipIf(!hasDb)("stock ledger — integración DB (certificación Bloque A)", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${run}-cat`, name: `Cat ${run}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        slug: `${run}-prod`,
        name: `Prod ${run}`,
        description: "fixture de test",
        basePrice: 1000,
        sku: `${run}-PROD`,
        categoryId,
      },
    });
    productId = product.id;

    const vA = await prisma.productVariant.create({
      data: { productId, name: "Variante A", sku: `${run}-VA`, stock: 10, attributes: {} },
    });
    const vB = await prisma.productVariant.create({
      data: { productId, name: "Variante B", sku: `${run}-VB`, stock: 10, attributes: {} },
    });
    variantA = vA.id;
    variantB = vB.id;
  });

  afterAll(async () => {
    // Orden de borrado respeta FKs (InventoryLog → ProductVariant → Product → Category).
    if (variantA || variantB) {
      await prisma.inventoryLog.deleteMany({
        where: { variantId: { in: [variantA, variantB].filter(Boolean) } },
      });
      await prisma.productVariant.deleteMany({
        where: { id: { in: [variantA, variantB].filter(Boolean) } },
      });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("P0-A: decrementa una orden de 2 ítems (2 variantes) sin violar el índice unique", async () => {
    const orderId = `${run}-order-multi`;
    const result = await prisma.$transaction((tx) =>
      decrementStockForOrder(tx, {
        id: orderId,
        number: "LCM-TEST-0001",
        items: [
          { variantId: variantA, qty: 2 },
          { variantId: variantB, qty: 3 },
        ],
      }),
    );

    expect(result.alreadyApplied).toBe(false);
    expect(result.decrementedVariants).toHaveLength(2);

    // Stock decrementado en ambas.
    const [a, b] = await Promise.all([
      prisma.productVariant.findUnique({ where: { id: variantA }, select: { stock: true } }),
      prisma.productVariant.findUnique({ where: { id: variantB }, select: { stock: true } }),
    ]);
    expect(a?.stock).toBe(8); // 10 - 2
    expect(b?.stock).toBe(7); // 10 - 3

    // 2 InventoryLog ORDER_PAID, uno por variante — esto es lo que el índice
    // viejo (orderId, reason) hacía imposible.
    const logs = await prisma.inventoryLog.findMany({
      where: { orderId, reason: INVENTORY_REASON.ORDER_PAID },
    });
    expect(logs).toHaveLength(2);
    // sort numérico (no lexicográfico) — deltas son -2 y -3.
    expect(logs.map((l) => l.delta).sort((x, y) => x - y)).toEqual([-3, -2]);
  }, 30000);

  it("revierte una orden multi-ítem (ORDER_CANCELLED) restaurando el stock de todas", async () => {
    const orderId = `${run}-order-revert`;
    // Primero decrementar.
    await prisma.$transaction((tx) =>
      decrementStockForOrder(tx, {
        id: orderId,
        number: "LCM-TEST-0002",
        items: [
          { variantId: variantA, qty: 1 },
          { variantId: variantB, qty: 1 },
        ],
      }),
    );
    const beforeRevert = await prisma.productVariant.findUnique({
      where: { id: variantA },
      select: { stock: true },
    });

    // Revertir.
    const result = await prisma.$transaction((tx) =>
      revertStockForOrder(
        tx,
        {
          id: orderId,
          number: "LCM-TEST-0002",
          items: [
            { variantId: variantA, qty: 1 },
            { variantId: variantB, qty: 1 },
          ],
        },
        "ORDER_CANCELLED",
      ),
    );

    expect(result.skipped).toBe(false);
    expect(result.revertedVariants).toHaveLength(2);

    const afterRevert = await prisma.productVariant.findUnique({
      where: { id: variantA },
      select: { stock: true },
    });
    expect(afterRevert!.stock).toBe(beforeRevert!.stock + 1);

    const cancelLogs = await prisma.inventoryLog.findMany({
      where: { orderId, reason: INVENTORY_REASON.ORDER_CANCELLED },
    });
    expect(cancelLogs).toHaveLength(2);
  }, 30000);

  it("idempotencia: decrementar dos veces el mismo orderId es no-op la 2da vez", async () => {
    const orderId = `${run}-order-idem`;
    const items = [{ variantId: variantA, qty: 1 }];

    const first = await prisma.$transaction((tx) =>
      decrementStockForOrder(tx, { id: orderId, number: "LCM-TEST-0003", items }),
    );
    expect(first.alreadyApplied).toBe(false);

    const stockAfterFirst = await prisma.productVariant.findUnique({
      where: { id: variantA },
      select: { stock: true },
    });

    const second = await prisma.$transaction((tx) =>
      decrementStockForOrder(tx, { id: orderId, number: "LCM-TEST-0003", items }),
    );
    expect(second.alreadyApplied).toBe(true);
    expect(second.decrementedVariants).toHaveLength(0);

    // Stock NO cambió en la 2da llamada (no doble-decremento).
    const stockAfterSecond = await prisma.productVariant.findUnique({
      where: { id: variantA },
      select: { stock: true },
    });
    expect(stockAfterSecond!.stock).toBe(stockAfterFirst!.stock);
  }, 30000);

  it("backstop concurrente: insertar 2do InventoryLog (orderId, ORDER_PAID, variant) idéntico lanza unique violation", async () => {
    const orderId = `${run}-order-dup`;
    // 1er insert OK.
    await prisma.inventoryLog.create({
      data: {
        variantId: variantA,
        delta: -1,
        reason: INVENTORY_REASON.ORDER_PAID,
        orderId,
        createdBy: "test",
      },
    });
    // 2do insert idéntico → debe violar el índice parcial unique.
    await expect(
      prisma.inventoryLog.create({
        data: {
          variantId: variantA,
          delta: -1,
          reason: INVENTORY_REASON.ORDER_PAID,
          orderId,
          createdBy: "test",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  }, 30000);

  it("el mismo (orderId, ORDER_PAID) con DISTINTO variant SÍ se permite (lo que el índice viejo rompía)", async () => {
    const orderId = `${run}-order-twovariants`;
    await prisma.inventoryLog.create({
      data: { variantId: variantA, delta: -1, reason: INVENTORY_REASON.ORDER_PAID, orderId, createdBy: "test" },
    });
    // Distinto variant, mismo orderId+reason → NO debe lanzar.
    await expect(
      prisma.inventoryLog.create({
        data: { variantId: variantB, delta: -1, reason: INVENTORY_REASON.ORDER_PAID, orderId, createdBy: "test" },
      }),
    ).resolves.toBeTruthy();
  }, 30000);
});

// Garantiza que StockAlreadyAppliedError es exportable e instanciable
// (lo usa el catch de P2002 en la saga).
describe("StockAlreadyAppliedError", () => {
  it("es una Error con orderId y reason", () => {
    const e = new StockAlreadyAppliedError("ord_1", "ORDER_PAID");
    expect(e).toBeInstanceOf(Error);
    expect(e.orderId).toBe("ord_1");
    expect(e.reason).toBe("ORDER_PAID");
  });
});
