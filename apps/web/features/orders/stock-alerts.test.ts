/*
 * Unit tests de notifyStockSaleLost (alerta in-app inmediata al admin cuando
 * una venta se pierde por stock — 2026-10-26):
 *
 *  - Dispara con el contenido accionable (producto, pedía/quedaban, contexto,
 *    deep link al pedido o al inventario).
 *  - Dedup: máximo 1 alerta por variante cada 6h (AlertState.lastSentAt).
 *  - Best-effort: un fallo de notify/DB NUNCA se propaga (no rompe la compra)
 *    y NO sella la ventana (el próximo intento reintenta la alerta).
 *
 * Sin DB: prisma y notify mockeados (patrón de service-reconcile.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, notify, logger } = vi.hoisted(() => ({
  prisma: {
    alertState: {
      findUnique: vi.fn(async (): Promise<{ lastSentAt: Date } | null> => null),
      upsert: vi.fn(async () => ({})),
    },
  },
  notify: vi.fn(
    async (_input: {
      type: string;
      severity: string;
      title: string;
      detail: string;
      actionUrl?: string;
      actionLabel?: string;
      dedupKey?: string;
      metadata?: unknown;
    }) => ({}),
  ),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/features/notifications/service", () => ({ notify }));

import { notifyStockSaleLost, STOCK_SALE_LOST_DEDUP_MS } from "./stock-alerts";

const NOW = new Date("2026-10-26T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyStockSaleLost — dispara la alerta", () => {
  it("checkout_step: warning, nombra el producto, pedía/quedaban, link a inventario", async () => {
    await notifyStockSaleLost({
      context: "checkout_step",
      variantId: "v1",
      requested: 5,
      available: 3,
      productName: "Imán Nevera",
      now: NOW,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ALERT",
        severity: "warning",
        title: "Venta perdida por stock: «Imán Nevera»",
        actionUrl: "/admin/inventario",
        dedupKey: "stock_sale_lost:v1",
        detail: expect.stringContaining("pedía 5 y quedaban 3"),
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.stringContaining("checkout") }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.stringContaining("Inventario") }),
    );
    // La ventana se sella tras notificar OK.
    expect(prisma.alertState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "stock_sale_lost:v1" },
        create: expect.objectContaining({ key: "stock_sale_lost:v1", lastSentAt: NOW }),
      }),
    );
  });

  it("saga_paid: critical (dinero cobrado), deep link al pedido por número", async () => {
    await notifyStockSaleLost({
      context: "saga_paid",
      variantId: "v1",
      requested: 2,
      available: 0,
      productName: "Imán Nevera (Set 12)",
      orderId: "ord_1",
      orderNumber: "LCM-2026-0007",
      now: NOW,
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "critical",
        title: "Pago aprobado SIN stock: «Imán Nevera (Set 12)»",
        actionUrl: "/admin/pedidos/LCM-2026-0007",
        actionLabel: "Ver pedido",
        detail: expect.stringContaining("reconciliación"),
      }),
    );
  });

  it("cod_finalize: warning con el número del pedido cancelado", async () => {
    await notifyStockSaleLost({
      context: "cod_finalize",
      variantId: "v1",
      requested: 1,
      available: 0,
      orderNumber: "LCM-2026-0008",
      now: NOW,
    });

    // Sin nombre de producto: fallback al variantId (nunca un detalle vacío).
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "warning",
        title: expect.stringContaining("variante v1"),
        detail: expect.stringContaining("LCM-2026-0008"),
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.stringContaining("no hubo cobro") }),
    );
  });
});

describe("notifyStockSaleLost — dedup 6h por variante", () => {
  it("dentro de la ventana: NO notifica ni re-sella", async () => {
    prisma.alertState.findUnique.mockResolvedValueOnce({
      lastSentAt: new Date(NOW.getTime() - 60 * 60 * 1000), // hace 1h
    });

    await notifyStockSaleLost({
      context: "order_create",
      variantId: "v1",
      requested: 5,
      available: 3,
      now: NOW,
    });

    expect(notify).not.toHaveBeenCalled();
    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
  });

  it("ventana expirada: vuelve a notificar", async () => {
    prisma.alertState.findUnique.mockResolvedValueOnce({
      lastSentAt: new Date(NOW.getTime() - STOCK_SALE_LOST_DEDUP_MS - 1000),
    });

    await notifyStockSaleLost({
      context: "order_create",
      variantId: "v1",
      requested: 5,
      available: 3,
      now: NOW,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(prisma.alertState.upsert).toHaveBeenCalledOnce();
  });

  it("variantes distintas no se deduplican entre sí", async () => {
    prisma.alertState.findUnique.mockResolvedValueOnce({
      lastSentAt: new Date(NOW.getTime() - 60 * 1000), // v1 alertada hace 1 min
    });

    await notifyStockSaleLost({
      context: "checkout_step",
      variantId: "v1",
      requested: 1,
      now: NOW,
    });
    await notifyStockSaleLost({
      context: "checkout_step",
      variantId: "v2",
      requested: 1,
      now: NOW,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ dedupKey: "stock_sale_lost:v2" }),
    );
  });
});

describe("notifyStockSaleLost — un fallo de notify jamás rompe el flujo", () => {
  it("notify lanza: no propaga, NO sella la ventana (reintento en el próximo fallo de stock)", async () => {
    notify.mockRejectedValueOnce(new Error("DB caída"));

    await expect(
      notifyStockSaleLost({
        context: "order_create",
        variantId: "v1",
        requested: 5,
        available: 3,
        now: NOW,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.alertState.upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "stock_sale_lost.notify_failed" }),
    );
  });

  it("la lectura del dedup lanza: no propaga ni notifica a ciegas", async () => {
    prisma.alertState.findUnique.mockRejectedValueOnce(new Error("timeout"));

    await expect(
      notifyStockSaleLost({ context: "checkout_step", variantId: "v1", requested: 1, now: NOW }),
    ).resolves.toBeUndefined();

    expect(notify).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("el upsert del sello lanza tras notificar: la alerta llegó; no propaga (el próximo intento re-notifica, aceptable)", async () => {
    prisma.alertState.upsert.mockRejectedValueOnce(new Error("write fail"));

    await expect(
      notifyStockSaleLost({ context: "saga_paid", variantId: "v1", requested: 1, now: NOW }),
    ).resolves.toBeUndefined();

    expect(notify).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalled();
  });
});
