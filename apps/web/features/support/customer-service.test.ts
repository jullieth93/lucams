/*
 * Test UNIT de features/support/customer-service — listTicketsForCustomer (5.3),
 * ampliado con hilo de respuestas y enlace al pedido propio (flujo de solución,
 * 2026-09-29).
 *
 * Prisma mockeado (patrón admin-service.test.ts) → determinista y offline.
 *
 * Reglas bajo prueba:
 *   - Filtra por customerId (aislamiento: un cliente NUNCA ve tickets de otro).
 *   - Orden createdAt desc (más reciente primero) y tope de 50.
 *   - Campos NO sensibles: el select NO pide ip/userAgent/email/resolvedBy, y el
 *     sub-select de mensajes filtra notas internas EN LA QUERY (where
 *     isInternal:false) y no pide authorId ni isInternal.
 *   - shortId: 8 chars en mayúsculas (mismo formato que el email de cierre).
 *   - ownOrderNumber: solo se enlaza un pedido que existe Y es del cliente.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ticketFindMany = vi.hoisted(() => vi.fn(async (_args?: unknown): Promise<unknown> => []));
const orderFindMany = vi.hoisted(() => vi.fn(async (_args?: unknown): Promise<unknown> => []));

vi.mock("@/lib/db", () => ({
  prisma: { supportTicket: { findMany: ticketFindMany }, order: { findMany: orderFindMany } },
}));

import { listTicketsForCustomer } from "./customer-service";

const ROW = {
  id: "ckx1234567890abcdef",
  subject: "MI_PEDIDO",
  status: "OPEN",
  message: "¿Cómo va mi pedido?",
  orderNumber: null,
  createdAt: new Date("2026-09-10T15:00:00.000Z"),
  resolvedAt: null,
  messages: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  ticketFindMany.mockResolvedValue([ROW]);
  orderFindMany.mockResolvedValue([]);
});

describe("listTicketsForCustomer (5.3)", () => {
  it("filtra por customerId con orden desc y tope 50", async () => {
    await listTicketsForCustomer("cust_1");

    expect(ticketFindMany).toHaveBeenCalledTimes(1);
    const args = ticketFindMany.mock.calls[0][0] as {
      where: { customerId: string };
      orderBy: { createdAt: string };
      take: number;
    };
    expect(args.where).toEqual({ customerId: "cust_1" });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(args.take).toBe(50);
  });

  it("el select NO incluye campos sensibles (ip, userAgent, email, resolvedBy)", async () => {
    await listTicketsForCustomer("cust_1");

    const args = ticketFindMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(Object.keys(args.select).sort()).toEqual(
      [
        "createdAt",
        "id",
        "message",
        "messages",
        "orderNumber",
        "resolvedAt",
        "status",
        "subject",
      ].sort(),
    );
    expect(args.select).not.toHaveProperty("ip");
    expect(args.select).not.toHaveProperty("userAgent");
    expect(args.select).not.toHaveProperty("email");
    expect(args.select).not.toHaveProperty("resolvedBy");
  });

  it("las respuestas se filtran en la query: solo públicas del equipo, sin authorId", async () => {
    await listTicketsForCustomer("cust_1");

    const args = ticketFindMany.mock.calls[0][0] as {
      select: {
        messages: {
          where: { isInternal: boolean; authorKind: string };
          select: Record<string, boolean>;
        };
      };
    };
    expect(args.select.messages.where).toEqual({ isInternal: false, authorKind: "ADMIN" });
    expect(args.select.messages.select).not.toHaveProperty("authorId");
    expect(args.select.messages.select).not.toHaveProperty("isInternal");
  });

  it("devuelve shortId de 8 chars en mayúsculas + los campos del ticket", async () => {
    const tickets = await listTicketsForCustomer("cust_1");

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toEqual({
      shortId: "CKX12345",
      subject: "MI_PEDIDO",
      status: "OPEN",
      message: "¿Cómo va mi pedido?",
      ownOrderNumber: null,
      replies: [],
      createdAt: ROW.createdAt,
      resolvedAt: null,
    });
    // El id completo NO se expone en el resultado.
    expect(tickets[0]).not.toHaveProperty("id");
  });

  it("mapea las respuestas públicas al hilo visible", async () => {
    const replyAt = new Date("2026-09-11T10:00:00.000Z");
    ticketFindMany.mockResolvedValue([
      { ...ROW, messages: [{ body: "Va en camino.", createdAt: replyAt }] },
    ]);
    const tickets = await listTicketsForCustomer("cust_1");
    expect(tickets[0].replies).toEqual([{ body: "Va en camino.", createdAt: replyAt }]);
  });

  it("enlaza el pedido solo si existe Y es del cliente (match exacto y por dígitos)", async () => {
    ticketFindMany.mockResolvedValue([
      { ...ROW, id: "t1aaaaaaaaaaaaaaaa", orderNumber: "LCM-2026-1042" },
      { ...ROW, id: "t2bbbbbbbbbbbbbbbb", orderNumber: "1043" },
      { ...ROW, id: "t3cccccccccccccccc", orderNumber: "9999" },
    ]);
    orderFindMany.mockResolvedValue([{ number: "LCM-2026-1042" }, { number: "LCM-2026-1043" }]);

    const tickets = await listTicketsForCustomer("cust_1");
    expect(tickets[0].ownOrderNumber).toBe("LCM-2026-1042");
    expect(tickets[1].ownOrderNumber).toBe("LCM-2026-1043"); // dígitos → sufijo
    expect(tickets[2].ownOrderNumber).toBeNull(); // no existe entre los del cliente

    // La búsqueda de pedidos queda acotada al cliente (aislamiento).
    const q = orderFindMany.mock.calls[0][0] as { where: { customerId: string } };
    expect(q.where.customerId).toBe("cust_1");
  });

  it("sin tickets devuelve [] (estado vacío de la bandeja)", async () => {
    ticketFindMany.mockResolvedValue([]);
    await expect(listTicketsForCustomer("cust_vacia")).resolves.toEqual([]);
  });
});
