/*
 * Test UNIT de features/support/customer-service — listTicketsForCustomer (5.3).
 *
 * Prisma mockeado (patrón admin-service.test.ts) → determinista y offline.
 *
 * Reglas bajo prueba:
 *   - Filtra por customerId (aislamiento: un cliente NUNCA ve tickets de otro).
 *   - Orden createdAt desc (más reciente primero) y tope de 50.
 *   - Campos NO sensibles: el select NO pide ip/userAgent/email/resolvedBy.
 *   - shortId: 8 chars en mayúsculas (mismo formato que el email de cierre).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ticketFindMany = vi.hoisted(() => vi.fn(async (_args?: unknown): Promise<unknown> => []));

vi.mock("@/lib/db", () => ({
  prisma: { supportTicket: { findMany: ticketFindMany } },
}));

import { listTicketsForCustomer } from "./customer-service";

const ROW = {
  id: "ckx1234567890abcdef",
  subject: "MI_PEDIDO",
  status: "OPEN",
  message: "¿Cómo va mi pedido?",
  createdAt: new Date("2026-09-10T15:00:00.000Z"),
  resolvedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  ticketFindMany.mockResolvedValue([ROW]);
});

describe("listTicketsForCustomer (5.3)", () => {
  it("filtra por customerId con orden desc y tope 50", async () => {
    await listTicketsForCustomer("cust_1");

    expect(ticketFindMany).toHaveBeenCalledTimes(1);
    const args = ticketFindMany.mock.calls[0][0] as {
      where: { customerId: string };
      orderBy: { createdAt: string };
      take: number;
      select: Record<string, boolean>;
    };
    expect(args.where).toEqual({ customerId: "cust_1" });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(args.take).toBe(50);
  });

  it("el select NO incluye campos sensibles (ip, userAgent, email, resolvedBy)", async () => {
    await listTicketsForCustomer("cust_1");

    const args = ticketFindMany.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(Object.keys(args.select).sort()).toEqual(
      ["createdAt", "id", "message", "resolvedAt", "status", "subject"].sort(),
    );
    expect(args.select).not.toHaveProperty("ip");
    expect(args.select).not.toHaveProperty("userAgent");
    expect(args.select).not.toHaveProperty("email");
    expect(args.select).not.toHaveProperty("resolvedBy");
  });

  it("devuelve shortId de 8 chars en mayúsculas + los campos del ticket", async () => {
    const tickets = await listTicketsForCustomer("cust_1");

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toEqual({
      shortId: "CKX12345",
      subject: "MI_PEDIDO",
      status: "OPEN",
      message: "¿Cómo va mi pedido?",
      createdAt: ROW.createdAt,
      resolvedAt: null,
    });
    // El id completo NO se expone en el resultado.
    expect(tickets[0]).not.toHaveProperty("id");
  });

  it("sin tickets devuelve [] (estado vacío de la bandeja)", async () => {
    ticketFindMany.mockResolvedValue([]);
    await expect(listTicketsForCustomer("cust_vacia")).resolves.toEqual([]);
  });
});
