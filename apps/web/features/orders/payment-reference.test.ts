/*
 * Unit tests de features/orders/payment-reference.ts — referencia única por
 * intento de pago Wompi (bug STG "La referencia ya ha sido usada").
 *
 * Cubre:
 *  - buildWompiReference / extractOrderNumberFromWompiReference (puras).
 *  - resolveWompiPaymentReference: primer intento (base), reuso dentro de la
 *    ventana de reintento de Wompi (~3 min), rotación tras DECLINED terminal,
 *    bloqueo con tx APPROVED/PENDING (anti doble cobro), API caída (no rotar
 *    a ciegas), claim perdido por carrera (reuso de la referencia ganadora) y
 *    órdenes legacy sin contador.
 *  - findOrderIdByWompiReference: match exacto / number / base extraída.
 *
 * Sin DB: prisma y el cliente Wompi mockeados.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, getTransaction } = vi.hoisted(() => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
  getTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/wompi", () => ({ getTransaction }));

import {
  buildWompiReference,
  extractOrderNumberFromWompiReference,
  findOrderIdByWompiReference,
  resolveWompiPaymentReference,
  WOMPI_REFERENCE_RETRY_WINDOW_MS,
} from "./payment-reference";

const NOW = new Date("2026-10-12T12:00:00Z");

type OrderRow = {
  number: string;
  status: string;
  paymentAttempt: number;
  wompiReference: string | null;
  wompiReferenceAt: Date | null;
  wompiTransactionId: string | null;
};

function orderRow(over?: Partial<OrderRow>): OrderRow {
  return {
    number: "LCM-2026-0001",
    status: "PENDING_PAYMENT",
    paymentAttempt: 0,
    wompiReference: null,
    wompiReferenceAt: null,
    wompiTransactionId: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.order.updateMany.mockResolvedValue({ count: 1 });
});

describe("buildWompiReference", () => {
  it("intento 1 → número base; intentos ≥2 → sufijo -N", () => {
    expect(buildWompiReference("LCM-2026-0001", 1)).toBe("LCM-2026-0001");
    expect(buildWompiReference("LCM-2026-0001", 2)).toBe("LCM-2026-0001-2");
    expect(buildWompiReference("LCM-2026-0001", 13)).toBe("LCM-2026-0001-13");
  });
});

describe("extractOrderNumberFromWompiReference", () => {
  it("extrae el número base de una referencia con sufijo de intento", () => {
    expect(extractOrderNumberFromWompiReference("LCM-2026-0001-2")).toBe("LCM-2026-0001");
    expect(extractOrderNumberFromWompiReference("LCM-2026-1042-13")).toBe("LCM-2026-1042");
  });

  it("una referencia base se devuelve intacta", () => {
    expect(extractOrderNumberFromWompiReference("LCM-2026-0001")).toBe("LCM-2026-0001");
  });

  it("referencias ajenas al formato (seeds, sistemas viejos) se devuelven intactas", () => {
    expect(extractOrderNumberFromWompiReference("wompiroute123-LCM-APR")).toBe(
      "wompiroute123-LCM-APR",
    );
    expect(extractOrderNumberFromWompiReference("LCM-SAGA-1")).toBe("LCM-SAGA-1");
  });
});

describe("resolveWompiPaymentReference", () => {
  it("primer intento: reclama attempt 1 con la referencia BASE y la persiste", async () => {
    prisma.order.findFirst.mockResolvedValue(orderRow());

    const res = await resolveWompiPaymentReference("ord_1", NOW);

    expect(res).toEqual({ kind: "ready", reference: "LCM-2026-0001", attempt: 1 });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "ord_1",
        status: "PENDING_PAYMENT",
        paymentAttempt: 0,
        wompiReference: null,
      },
      data: {
        paymentAttempt: 1,
        wompiReference: "LCM-2026-0001",
        wompiReferenceAt: NOW,
        wompiTransactionId: null,
      },
    });
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it("referencia fresca (< ventana de reintento Wompi): REUSA la misma sin escribir ni consultar Wompi", async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderRow({
        paymentAttempt: 1,
        wompiReference: "LCM-2026-0001",
        wompiReferenceAt: new Date(NOW.getTime() - 60_000),
      }),
    );

    const res = await resolveWompiPaymentReference("ord_1", NOW);

    expect(res).toEqual({ kind: "ready", reference: "LCM-2026-0001", attempt: 1 });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it("reintento tras DECLINED fuera de ventana: rota a sufijo -2 y libera el txId terminal", async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderRow({
        paymentAttempt: 1,
        wompiReference: "LCM-2026-0001",
        wompiReferenceAt: new Date(NOW.getTime() - WOMPI_REFERENCE_RETRY_WINDOW_MS - 1_000),
        wompiTransactionId: "tx-old",
      }),
    );
    getTransaction.mockResolvedValue({ id: "tx-old", status: "DECLINED" });

    const res = await resolveWompiPaymentReference("ord_1", NOW);

    expect(res).toEqual({ kind: "ready", reference: "LCM-2026-0001-2", attempt: 2 });
    expect(getTransaction).toHaveBeenCalledWith("tx-old");
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentAttempt: 2,
          wompiReference: "LCM-2026-0001-2",
          wompiTransactionId: null,
        }),
      }),
    );
  });

  it.each(["DECLINED", "ERROR", "VOIDED"] as const)(
    "tx previa %s (terminal, sin dinero) → rota",
    async (status) => {
      prisma.order.findFirst.mockResolvedValue(
        orderRow({
          paymentAttempt: 2,
          wompiReference: "LCM-2026-0001-2",
          wompiReferenceAt: new Date(NOW.getTime() - 60 * 60_000),
          wompiTransactionId: "tx-old",
        }),
      );
      getTransaction.mockResolvedValue({ id: "tx-old", status });

      const res = await resolveWompiPaymentReference("ord_1", NOW);
      expect(res).toEqual({ kind: "ready", reference: "LCM-2026-0001-3", attempt: 3 });
    },
  );

  it("tx previa APPROVED (webhook perdido): NO genera otro cobro", async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderRow({
        paymentAttempt: 1,
        wompiReference: "LCM-2026-0001",
        wompiReferenceAt: new Date(NOW.getTime() - 60 * 60_000),
        wompiTransactionId: "tx-old",
      }),
    );
    getTransaction.mockResolvedValue({ id: "tx-old", status: "APPROVED" });

    const res = await resolveWompiPaymentReference("ord_1", NOW);
    expect(res).toEqual({ kind: "approved", txId: "tx-old" });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("tx previa PENDING (PSE async): in_flight, NO crea segundo cobro", async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderRow({
        paymentAttempt: 1,
        wompiReference: "LCM-2026-0001",
        wompiReferenceAt: new Date(NOW.getTime() - 60 * 60_000),
        wompiTransactionId: "tx-old",
      }),
    );
    getTransaction.mockResolvedValue({ id: "tx-old", status: "PENDING" });

    const res = await resolveWompiPaymentReference("ord_1", NOW);
    expect(res).toEqual({ kind: "in_flight", txId: "tx-old" });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("API de Wompi caída con tx previa: lookup_failed, NO rota a ciegas (doble cobro)", async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderRow({
        paymentAttempt: 1,
        wompiReference: "LCM-2026-0001",
        wompiReferenceAt: new Date(NOW.getTime() - 60 * 60_000),
        wompiTransactionId: "tx-old",
      }),
    );
    getTransaction.mockRejectedValue(new Error("Wompi getTransaction HTTP 500"));

    const res = await resolveWompiPaymentReference("ord_1", NOW);
    expect(res).toEqual({ kind: "lookup_failed" });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("orden legacy (txId sin contador, pre-feature): la base ya se consumió → arranca en attempt 2", async () => {
    prisma.order.findFirst.mockResolvedValue(orderRow({ wompiTransactionId: "tx-legacy" }));
    getTransaction.mockResolvedValue({ id: "tx-legacy", status: "ERROR" });

    const res = await resolveWompiPaymentReference("ord_1", NOW);
    expect(res).toEqual({ kind: "ready", reference: "LCM-2026-0001-2", attempt: 2 });
  });

  it("orden legacy backfill (paymentAttempt=1 sin wompiReference ni txId): rota a -2", async () => {
    prisma.order.findFirst.mockResolvedValue(orderRow({ paymentAttempt: 1 }));

    const res = await resolveWompiPaymentReference("ord_1", NOW);
    expect(res).toEqual({ kind: "ready", reference: "LCM-2026-0001-2", attempt: 2 });
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it("doble submit concurrente (claim perdido): re-lee y REUSA la referencia fresca del ganador", async () => {
    prisma.order.findFirst
      .mockResolvedValueOnce(orderRow()) // lectura de ambos requests
      .mockResolvedValueOnce(
        orderRow({
          paymentAttempt: 1,
          wompiReference: "LCM-2026-0001",
          wompiReferenceAt: NOW, // el ganador acaba de reclamar
        }),
      );
    prisma.order.updateMany.mockResolvedValueOnce({ count: 0 }); // claim perdido

    const res = await resolveWompiPaymentReference("ord_1", NOW);

    expect(res).toEqual({ kind: "ready", reference: "LCM-2026-0001", attempt: 1 });
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it("la orden dejó de ser payable en carrera (webhook pagó): approved con su txId", async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderRow({ status: "PAID", wompiTransactionId: "tx-paid" }),
    );
    const res = await resolveWompiPaymentReference("ord_1", NOW);
    expect(res).toEqual({ kind: "approved", txId: "tx-paid" });
  });

  it("orden inexistente → lookup_failed", async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    const res = await resolveWompiPaymentReference("ord_404", NOW);
    expect(res).toEqual({ kind: "lookup_failed" });
  });
});

describe("findOrderIdByWompiReference", () => {
  it("busca por wompiReference exacta, number exacto y número base en una sola query", async () => {
    prisma.order.findFirst.mockResolvedValue({ id: "ord_1" });

    const id = await findOrderIdByWompiReference("LCM-2026-0001-2");

    expect(id).toBe("ord_1");
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [
          { wompiReference: "LCM-2026-0001-2" },
          { number: "LCM-2026-0001-2" },
          { number: "LCM-2026-0001" },
        ],
      },
      select: { id: true },
    });
  });

  it("sin match → null", async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    expect(await findOrderIdByWompiReference("LCM-2026-9999-3")).toBeNull();
  });
});
