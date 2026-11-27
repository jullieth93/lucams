/*
 * Test UNIT de la lógica de negocio de garantía (Ley 1480) que NO requiere DB real:
 *  - Guards de la máquina de estados (review/approve/resolve/reject): qué transiciones
 *    son válidas y cuáles lanzan WarrantyTransitionError.
 *  - Validación de createWarrantyClaim (propiedad, entrega, ventana, duplicado, descripción).
 *  - Cálculo de elegibilidad por item en getWarrantyItems (razón de inelegibilidad).
 *
 * Estrategia: mockeamos @/lib/db (prisma) con vi.hoisted → las funciones ejercitan su
 * lógica de guardas/mapeo sin tocar Postgres ni el pooler. Los caminos de persistencia
 * (que la fila realmente cambie en DB) se cubren aparte con integración; aquí verificamos
 * la LÓGICA que decide y con qué datos se llama a prisma.update/create.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  const mock = {
    warrantyClaim: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    orderItem: { findUnique: vi.fn(), findMany: vi.fn() },
    order: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { prismaMock: mock };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  reviewWarrantyClaim,
  approveWarrantyClaim,
  resolveWarrantyClaim,
  rejectWarrantyClaim,
  createWarrantyClaim,
  getWarrantyItems,
  WarrantyError,
  WarrantyTransitionError,
  type WarrantyStatus,
} from "./service";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.warrantyClaim.update.mockResolvedValue({});
  prismaMock.warrantyClaim.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.warrantyClaim.create.mockResolvedValue({ id: "new-claim" });
  prismaMock.$queryRaw.mockResolvedValue([
    { status: "DELIVERED", total: 8_000_000, withholdingCents: 0 },
  ]);
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
  );
});

/** loadClaim() lee status y resolutionType vía warrantyClaim.findUnique. */
function withClaimStatus(
  status: WarrantyStatus | null,
  resolutionType: "REPAIR" | "REPLACE" | "REFUND" | null = "REPLACE",
) {
  prismaMock.warrantyClaim.findUnique.mockResolvedValue(status ? { status, resolutionType } : null);
}

/** Asegura que la promesa rechaza con un WarrantyError (instancia real) del reason esperado. */
async function expectWarrantyError(p: Promise<unknown>, reason: WarrantyError["reason"]) {
  await expect(p).rejects.toBeInstanceOf(WarrantyError);
  await expect(p).rejects.toHaveProperty("reason", reason);
}

// =============================================================================
// review: PENDING → IN_REVIEW
// =============================================================================
describe("reviewWarrantyClaim", () => {
  it("PENDING → IN_REVIEW: actualiza status y sella processedBy", async () => {
    withClaimStatus("PENDING");
    await reviewWarrantyClaim("c1", "admin-1");
    expect(prismaMock.warrantyClaim.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "IN_REVIEW", processedBy: "admin-1" },
    });
  });

  it.each(["IN_REVIEW", "APPROVED", "RESOLVED", "REJECTED"] as WarrantyStatus[])(
    "desde %s lanza WarrantyTransitionError y NO actualiza",
    async (from) => {
      withClaimStatus(from);
      await expect(reviewWarrantyClaim("c1", "admin-1")).rejects.toBeInstanceOf(
        WarrantyTransitionError,
      );
      expect(prismaMock.warrantyClaim.update).not.toHaveBeenCalled();
    },
  );

  it("reclamo inexistente → WarrantyError NOT_FOUND", async () => {
    withClaimStatus(null);
    await expectWarrantyError(reviewWarrantyClaim("c1", "admin-1"), "NOT_FOUND");
  });
});

// =============================================================================
// approve: {PENDING, IN_REVIEW} → APPROVED (con remedio)
// =============================================================================
describe("approveWarrantyClaim", () => {
  it.each(["PENDING", "IN_REVIEW"] as WarrantyStatus[])(
    "desde %s → APPROVED guardando el resolutionType elegido",
    async (from) => {
      withClaimStatus(from);
      await approveWarrantyClaim("c1", "admin-1", "REPLACE");
      expect(prismaMock.warrantyClaim.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { status: "APPROVED", resolutionType: "REPLACE", processedBy: "admin-1" },
      });
    },
  );

  it.each(["APPROVED", "RESOLVED", "REJECTED"] as WarrantyStatus[])(
    "desde %s lanza WarrantyTransitionError",
    async (from) => {
      withClaimStatus(from);
      await expect(approveWarrantyClaim("c1", "admin-1", "REFUND")).rejects.toBeInstanceOf(
        WarrantyTransitionError,
      );
      expect(prismaMock.warrantyClaim.update).not.toHaveBeenCalled();
    },
  );
});

// =============================================================================
// resolve: APPROVED → RESOLVED
// =============================================================================
describe("resolveWarrantyClaim", () => {
  it("APPROVED → RESOLVED: sella resolvedAt y processedBy", async () => {
    withClaimStatus("APPROVED");
    await resolveWarrantyClaim("c1", "admin-1");
    const call = prismaMock.warrantyClaim.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "c1" });
    expect(call.data.status).toBe("RESOLVED");
    expect(call.data.processedBy).toBe("admin-1");
    expect(call.data.resolvedAt).toBeInstanceOf(Date);
    // sin nota → no se envía resolutionNote
    expect(call.data).not.toHaveProperty("resolutionNote");
  });

  it("con nota la guarda (truncada a 500)", async () => {
    withClaimStatus("APPROVED");
    const longNote = "x".repeat(800);
    await resolveWarrantyClaim("c1", "admin-1", longNote);
    const call = prismaMock.warrantyClaim.update.mock.calls[0][0];
    expect(call.data.resolutionNote).toHaveLength(500);
  });

  it.each(["PENDING", "IN_REVIEW", "RESOLVED", "REJECTED"] as WarrantyStatus[])(
    "desde %s lanza WarrantyTransitionError",
    async (from) => {
      withClaimStatus(from);
      await expect(resolveWarrantyClaim("c1", "admin-1")).rejects.toBeInstanceOf(
        WarrantyTransitionError,
      );
    },
  );

  it("REFUND exige confirmación explícita, método válido y monto válido dentro de INT4", async () => {
    withClaimStatus("APPROVED", "REFUND");
    await expectWarrantyError(resolveWarrantyClaim("c1", "admin-1"), "REFUND_UNCONFIRMED");

    withClaimStatus("APPROVED", "REFUND");
    await expectWarrantyError(
      resolveWarrantyClaim("c1", "admin-1", undefined, {
        refundAmount: 1_000_000,
        refundMethod: "WOMPI_VOID",
        refundConfirmed: false,
      }),
      "REFUND_UNCONFIRMED",
    );

    withClaimStatus("APPROVED", "REFUND");
    await expectWarrantyError(
      resolveWarrantyClaim("c1", "admin-1", undefined, {
        refundAmount: 1_000_000,
        refundMethod: "CASH" as unknown as "WOMPI_VOID",
        refundConfirmed: true,
      }),
      "REFUND_METHOD_INVALID",
    );

    withClaimStatus("APPROVED", "REFUND");
    await expectWarrantyError(
      resolveWarrantyClaim("c1", "admin-1", undefined, {
        refundAmount: 0,
        refundMethod: "BANK_TRANSFER",
        refundConfirmed: true,
      }),
      "REFUND_AMOUNT_INVALID",
    );

    withClaimStatus("APPROVED", "REFUND");
    await expectWarrantyError(
      resolveWarrantyClaim("c1", "admin-1", undefined, {
        refundAmount: 2_147_483_648,
        refundMethod: "BANK_TRANSFER",
        refundConfirmed: true,
      }),
      "REFUND_AMOUNT_INVALID",
    );
  });

  it("REFUND rechaza si el monto supera el disponible de la línea/orden y persiste si es válido", async () => {
    const claimForTx = {
      id: "c1",
      status: "APPROVED",
      resolutionType: "REFUND",
      orderItemId: "oi-1",
      orderItem: {
        id: "oi-1",
        qty: 1,
        unitPrice: 3_000_000,
        orderId: "ord-1",
        order: {
          id: "ord-1",
          status: "DELIVERED",
          subtotal: 8_000_000,
          total: 8_000_000,
          discount: 0,
          loyaltyDiscount: 0,
          withholdingCents: 0,
          coupon: null,
        },
      },
    };
    prismaMock.warrantyClaim.findUnique
      .mockResolvedValueOnce({ status: "APPROVED", resolutionType: "REFUND" })
      .mockResolvedValueOnce(claimForTx);
    prismaMock.orderItem.findMany.mockResolvedValueOnce([
      { id: "oi-1", retractRequest: null, warrantyClaims: [] },
    ]);

    await expectWarrantyError(
      resolveWarrantyClaim("c1", "admin-1", "Ref 123", {
        refundAmount: 3_500_000,
        refundMethod: "BANK_TRANSFER",
        refundConfirmed: true,
      }),
      "REFUND_EXCEEDS_AVAILABLE",
    );
    expect(prismaMock.warrantyClaim.updateMany).not.toHaveBeenCalled();

    prismaMock.warrantyClaim.findUnique
      .mockResolvedValueOnce({ status: "APPROVED", resolutionType: "REFUND" })
      .mockResolvedValueOnce(claimForTx);
    prismaMock.orderItem.findMany.mockResolvedValueOnce([
      { id: "oi-1", retractRequest: null, warrantyClaims: [] },
    ]);

    await resolveWarrantyClaim("c1", "admin-1", "Comprobante #999", {
      refundAmount: 2_000_000,
      refundMethod: "BANK_TRANSFER",
      refundConfirmed: true,
    });
    const call = prismaMock.warrantyClaim.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "c1", status: "APPROVED", resolutionType: "REFUND" });
    expect(call.data.status).toBe("RESOLVED");
    expect(call.data.refundAmount).toBe(2_000_000);
    expect(call.data.refundMethod).toBe("BANK_TRANSFER");
    expect(call.data.refundedAt).toBeInstanceOf(Date);
    expect(call.data.resolvedAt).toBeInstanceOf(Date);
    expect(call.data.resolutionNote).toBe("Comprobante #999");
  });
});

// =============================================================================
// reject: {PENDING, IN_REVIEW} → REJECTED (motivo obligatorio)
// =============================================================================
describe("rejectWarrantyClaim", () => {
  it.each(["PENDING", "IN_REVIEW"] as WarrantyStatus[])(
    "desde %s con motivo → REJECTED con resolutionNote",
    async (from) => {
      withClaimStatus(from);
      await rejectWarrantyClaim("c1", "admin-1", "No es defecto de fábrica");
      const call = prismaMock.warrantyClaim.update.mock.calls[0][0];
      expect(call.data.status).toBe("REJECTED");
      expect(call.data.resolutionNote).toBe("No es defecto de fábrica");
      expect(call.data.resolvedAt).toBeInstanceOf(Date);
    },
  );

  it("motivo vacío (solo espacios) → WarrantyError INVALID y NO actualiza", async () => {
    withClaimStatus("PENDING");
    await expectWarrantyError(rejectWarrantyClaim("c1", "admin-1", "   "), "INVALID");
    expect(prismaMock.warrantyClaim.update).not.toHaveBeenCalled();
  });

  it.each(["APPROVED", "RESOLVED", "REJECTED"] as WarrantyStatus[])(
    "desde %s lanza WarrantyTransitionError",
    async (from) => {
      withClaimStatus(from);
      await expect(rejectWarrantyClaim("c1", "admin-1", "motivo")).rejects.toBeInstanceOf(
        WarrantyTransitionError,
      );
    },
  );
});

// =============================================================================
// createWarrantyClaim: validaciones (propiedad, entrega, ventana, duplicado, texto)
// =============================================================================
describe("createWarrantyClaim — validaciones", () => {
  const RECENT = new Date(); // entrega hoy → dentro de ventana con cualquier warrantyMonths ≥ 1

  function mockItem(over: Record<string, unknown> = {}) {
    return {
      id: "oi-1",
      warrantyMonths: 12,
      variant: { product: {} },
      order: {
        customerId: "cust-1",
        status: "DELIVERED",
        deliveredAt: RECENT,
        deletedAt: null,
      },
      warrantyClaims: [] as { id: string }[],
      ...over,
    };
  }
  const validInput = {
    orderItemId: "oi-1",
    customerId: "cust-1",
    description: "El imán llegó partido a la mitad",
  };

  it("item inexistente → NOT_FOUND", async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(null);
    await expectWarrantyError(createWarrantyClaim(validInput), "NOT_FOUND");
  });

  it("orden borrada (deletedAt) → NOT_FOUND", async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(
      mockItem({
        order: {
          customerId: "cust-1",
          status: "DELIVERED",
          deliveredAt: RECENT,
          deletedAt: new Date(),
        },
      }),
    );
    await expectWarrantyError(createWarrantyClaim(validInput), "NOT_FOUND");
  });

  it("otro cliente → FORBIDDEN", async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(mockItem());
    await expectWarrantyError(
      createWarrantyClaim({ ...validInput, customerId: "otro" }),
      "FORBIDDEN",
    );
  });

  it("orden no entregada → NOT_DELIVERED", async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(
      mockItem({
        order: { customerId: "cust-1", status: "SHIPPED", deliveredAt: null, deletedAt: null },
      }),
    );
    await expectWarrantyError(createWarrantyClaim(validInput), "NOT_DELIVERED");
  });

  it("fuera de la ventana de garantía → OUT_OF_WARRANTY", async () => {
    const old = new Date("2020-01-01T00:00:00Z");
    prismaMock.orderItem.findUnique.mockResolvedValue(
      mockItem({
        order: { customerId: "cust-1", status: "DELIVERED", deliveredAt: old, deletedAt: null },
      }),
    );
    await expectWarrantyError(createWarrantyClaim(validInput), "OUT_OF_WARRANTY");
  });

  it("ya existe un reclamo activo → ACTIVE_CLAIM", async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(
      mockItem({ warrantyClaims: [{ id: "prev" }] }),
    );
    await expectWarrantyError(createWarrantyClaim(validInput), "ACTIVE_CLAIM");
  });

  it("descripción demasiado corta (<10) → INVALID", async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(mockItem());
    await expectWarrantyError(
      createWarrantyClaim({ ...validInput, description: "corta" }),
      "INVALID",
    );
  });

  it("válido → crea PENDING, trunca descripción (2000) y evidencias (5)", async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(mockItem());
    const res = await createWarrantyClaim({
      ...validInput,
      description: "d".repeat(2500),
      evidenceUrls: Array.from({ length: 9 }, (_, i) => `https://x/${i}.jpg`),
    });
    expect(res).toEqual({ id: "new-claim" });
    const call = prismaMock.warrantyClaim.create.mock.calls[0][0];
    expect(call.data.status).toBe("PENDING");
    expect(call.data.customerId).toBe("cust-1");
    expect(call.data.description).toHaveLength(2000);
    expect(call.data.evidenceUrls).toHaveLength(5);
  });
});

// =============================================================================
// getWarrantyItems: elegibilidad y razón por item
// =============================================================================
describe("getWarrantyItems — elegibilidad", () => {
  function mockOrder(over: Record<string, unknown> = {}) {
    return {
      status: "DELIVERED",
      deliveredAt: new Date(),
      items: [
        {
          id: "oi-1",
          qty: 2,
          warrantyMonths: 12,
          variant: { product: { name: "Imán foto" } },
          warrantyClaims: [] as { status: WarrantyStatus }[],
        },
      ],
      ...over,
    };
  }

  it("orden inexistente → arreglo vacío", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    expect(await getWarrantyItems("o1", "cust-1")).toEqual([]);
  });

  it("entregado, dentro de ventana, sin reclamo activo → eligible", async () => {
    prismaMock.order.findFirst.mockResolvedValue(mockOrder());
    const [it] = await getWarrantyItems("o1", "cust-1");
    expect(it.eligible).toBe(true);
    expect(it.reason).toBeNull();
    expect(it.productName).toBe("Imán foto");
    expect(it.warrantyEndsAt).toBeInstanceOf(Date);
  });

  it("no entregado → reason NOT_DELIVERED", async () => {
    prismaMock.order.findFirst.mockResolvedValue(
      mockOrder({ status: "PROCESSING", deliveredAt: null }),
    );
    const [it] = await getWarrantyItems("o1", "cust-1");
    expect(it.eligible).toBe(false);
    expect(it.reason).toBe("NOT_DELIVERED");
  });

  it("fuera de ventana → reason OUT_OF_WARRANTY", async () => {
    prismaMock.order.findFirst.mockResolvedValue(
      mockOrder({ deliveredAt: new Date("2020-01-01T00:00:00Z") }),
    );
    const [it] = await getWarrantyItems("o1", "cust-1");
    expect(it.reason).toBe("OUT_OF_WARRANTY");
  });

  it("con reclamo activo → reason ACTIVE_CLAIM y expone el status activo", async () => {
    prismaMock.order.findFirst.mockResolvedValue(
      mockOrder({
        items: [
          {
            id: "oi-1",
            qty: 1,
            warrantyMonths: 12,
            variant: { product: { name: "Imán foto" } },
            warrantyClaims: [{ status: "IN_REVIEW" as WarrantyStatus }],
          },
        ],
      }),
    );
    const [it] = await getWarrantyItems("o1", "cust-1");
    expect(it.reason).toBe("ACTIVE_CLAIM");
    expect(it.activeClaimStatus).toBe("IN_REVIEW");
  });
});
