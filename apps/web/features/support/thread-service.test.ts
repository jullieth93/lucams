/*
 * Test UNIT de features/support/thread-service — hilo del ticket (responder /
 * nota interna) y conversión a caso especializado (garantía / retracto).
 *
 * Todo el entorno está mockeado (prisma, Resend, CMS, módulos warranty/retract)
 * → determinista y offline. El template support-ticket-reply se renderiza de
 * verdad (CMS mockeado a fallbacks, mismo criterio que admin-service.test.ts).
 *
 * Reglas bajo prueba:
 *   - Respuesta pública: mensaje ADMIN en el hilo + email al cliente con
 *     idempotencyKey `support:reply:<messageId>`; OPEN → IN_PROGRESS.
 *   - Nota interna: NO envía email y NO cambia el estado.
 *   - Fallo de Resend NUNCA rompe el guardado del mensaje (best-effort).
 *   - Conversión: enlaza linkedCaseType/linkedCaseId, pasa OPEN → IN_PROGRESS,
 *     deja nota interna en el hilo y (garantía) dispara el acuse al cliente.
 *   - Doble conversión o asunto no-GARANTIA_DEVOLUCION: lanza antes de crear nada.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() =>
  vi.fn(async (_input: unknown): Promise<unknown> => ({ sent: true, id: "email_1" })),
);
const ticketFindUnique = vi.hoisted(() => vi.fn(async (_args?: unknown): Promise<unknown> => null));
const ticketUpdate = vi.hoisted(() => vi.fn(async (_args?: unknown): Promise<unknown> => ({})));
const messageCreate = vi.hoisted(() =>
  vi.fn(async (_args?: unknown): Promise<unknown> => ({ id: "msg_1" })),
);
const createWarrantyAsAdmin = vi.hoisted(() =>
  vi.fn(async (_input: unknown): Promise<unknown> => ({ id: "wc_1" })),
);
const createRetractAsAdmin = vi.hoisted(() =>
  vi.fn(async (_id: unknown, _opts?: unknown): Promise<unknown> => ({
    id: "rr_1",
    refundAmount: 1000,
  })),
);
const notifyWarrantyCreated = vi.hoisted(() => vi.fn(async (_id: unknown): Promise<void> => {}));
const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/resend", () => ({ sendEmail }));
vi.mock("@/lib/db", () => ({
  prisma: {
    supportTicket: { findUnique: ticketFindUnique, update: ticketUpdate },
    supportTicketMessage: { create: messageCreate },
  },
}));
// CMS mockeado: settings ausentes → fallbacks (CONTACT_EMAIL → hola@lucamsshop.com).
vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (_key: string, fallback: string) => fallback),
}));
// Los creators de los módulos destino se mockean pero las clases de error se
// conservan reales (caseConversionErrorMessage hace instanceof).
vi.mock("@/features/warranty/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/warranty/service")>()),
  createWarrantyClaimAsAdmin: createWarrantyAsAdmin,
}));
vi.mock("@/features/warranty/notify", () => ({
  notifyWarrantyClaimCreated: notifyWarrantyCreated,
}));
vi.mock("@/features/retract/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/retract/service")>()),
  createRetractRequestAsAdmin: createRetractAsAdmin,
}));

import {
  addTicketMessage,
  convertTicketToCase,
  caseConversionErrorMessage,
} from "./thread-service";
import { WarrantyError } from "@/features/warranty/service";
import { RetractError } from "@/features/retract/service";

const TICKET = {
  id: "tkt_1",
  status: "OPEN",
  name: "Elena",
  email: "elena@example.com",
  subject: "MI_PEDIDO",
};

type SendInput = {
  to: string;
  subject: string;
  replyTo?: string;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
};

beforeEach(() => {
  vi.clearAllMocks();
  ticketFindUnique.mockResolvedValue({ ...TICKET });
});

describe("addTicketMessage", () => {
  it("respuesta pública: guarda mensaje ADMIN, envía email y pasa OPEN → IN_PROGRESS", async () => {
    const r = await addTicketMessage({
      ticketId: "tkt_1",
      body: "Tu pedido va en camino.",
      adminId: "admin_9",
      internal: false,
    });
    expect(r.id).toBe("msg_1");

    const create = messageCreate.mock.calls[0][0] as {
      data: { ticketId: string; authorKind: string; authorId: string; isInternal: boolean };
    };
    expect(create.data).toMatchObject({
      ticketId: "tkt_1",
      authorKind: "ADMIN",
      authorId: "admin_9",
      isInternal: false,
    });

    const update = ticketUpdate.mock.calls[0][0] as { data: { status: string } };
    expect(update.data.status).toBe("IN_PROGRESS");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const input = sendEmail.mock.calls[0][0] as SendInput;
    expect(input.to).toBe("elena@example.com");
    expect(input.idempotencyKey).toBe("support:reply:msg_1");
    expect(input.replyTo).toBe("hola@lucamsshop.com");
    expect(input.tags).toEqual([{ name: "kind", value: "support-reply" }]);
  });

  it("nota interna: guarda pero NO envía email y NO toca el estado", async () => {
    await addTicketMessage({
      ticketId: "tkt_1",
      body: "Cliente insiste, priorizar.",
      adminId: "admin_9",
      internal: true,
    });
    const create = messageCreate.mock.calls[0][0] as { data: { isInternal: boolean } };
    expect(create.data.isInternal).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(ticketUpdate).not.toHaveBeenCalled();
  });

  it("ticket ya IN_PROGRESS: envía email pero NO re-actualiza el estado", async () => {
    ticketFindUnique.mockResolvedValue({ ...TICKET, status: "IN_PROGRESS" });
    await addTicketMessage({
      ticketId: "tkt_1",
      body: "Ya tenemos la guía.",
      adminId: "admin_9",
      internal: false,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(ticketUpdate).not.toHaveBeenCalled();
  });

  it("un fallo de Resend NO rompe el guardado del mensaje (best-effort)", async () => {
    sendEmail.mockRejectedValueOnce(new Error("resend down"));
    await expect(
      addTicketMessage({
        ticketId: "tkt_1",
        body: "Respuesta igualmente.",
        adminId: "admin_9",
        internal: false,
      }),
    ).resolves.toEqual({ id: "msg_1" });
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "support.ticket.reply_email.fail", ticketId: "tkt_1" }),
    );
  });

  it("mensaje vacío o gigante: lanza antes de tocar la DB", async () => {
    await expect(
      addTicketMessage({ ticketId: "tkt_1", body: "  ", adminId: "a", internal: false }),
    ).rejects.toThrow("vacío");
    await expect(
      addTicketMessage({
        ticketId: "tkt_1",
        body: "x".repeat(2001),
        adminId: "a",
        internal: false,
      }),
    ).rejects.toThrow("2000");
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it("ticket inexistente: lanza y NO crea mensaje", async () => {
    ticketFindUnique.mockResolvedValue(null);
    await expect(
      addTicketMessage({ ticketId: "tkt_x", body: "Hola", adminId: "a", internal: false }),
    ).rejects.toThrow("no encontrado");
    expect(messageCreate).not.toHaveBeenCalled();
  });
});

describe("convertTicketToCase", () => {
  const CONVERT_TICKET = {
    id: "tkt_gd",
    subject: "GARANTIA_DEVOLUCION",
    status: "OPEN",
    message: "El imán llegó despegado de la base.",
    linkedCaseId: null,
  };

  beforeEach(() => {
    ticketFindUnique.mockResolvedValue({ ...CONVERT_TICKET });
  });

  it("garantía: crea el reclamo con el mensaje del ticket, enlaza y deja nota interna", async () => {
    const r = await convertTicketToCase({
      ticketId: "tkt_gd",
      kind: "warranty",
      orderItemId: "oi_1",
      adminId: "admin_9",
    });
    expect(r.caseId).toBe("wc_1");

    const input = createWarrantyAsAdmin.mock.calls[0][0] as {
      orderItemId: string;
      description: string;
      adminId: string;
    };
    expect(input.orderItemId).toBe("oi_1");
    expect(input.description).toContain("[Ticket #TKT_GD]");
    expect(input.description).toContain("despegado");
    expect(input.adminId).toBe("admin_9");

    const update = ticketUpdate.mock.calls[0][0] as {
      data: { linkedCaseType: string; linkedCaseId: string; status?: string };
    };
    expect(update.data).toEqual({
      linkedCaseType: "warranty",
      linkedCaseId: "wc_1",
      status: "IN_PROGRESS",
    });

    const note = messageCreate.mock.calls[0][0] as {
      data: { isInternal: boolean; body: string };
    };
    expect(note.data.isInternal).toBe(true);
    expect(note.data.body).toContain("wc_1");

    expect(notifyWarrantyCreated).toHaveBeenCalledWith("wc_1");
  });

  it("retracto: crea la solicitud enlazada y NO dispara el acuse de garantía", async () => {
    const r = await convertTicketToCase({
      ticketId: "tkt_gd",
      kind: "retract",
      orderItemId: "oi_1",
      adminId: "admin_9",
    });
    expect(r.caseId).toBe("rr_1");
    expect(createRetractAsAdmin).toHaveBeenCalledWith(
      "oi_1",
      expect.objectContaining({ adminId: "admin_9" }),
    );
    const update = ticketUpdate.mock.calls[0][0] as {
      data: { linkedCaseType: string; linkedCaseId: string };
    };
    expect(update.data.linkedCaseType).toBe("retract");
    expect(update.data.linkedCaseId).toBe("rr_1");
    expect(notifyWarrantyCreated).not.toHaveBeenCalled();
  });

  it("ticket ya enlazado: lanza y NO crea otro caso", async () => {
    ticketFindUnique.mockResolvedValue({ ...CONVERT_TICKET, linkedCaseId: "wc_prev" });
    await expect(
      convertTicketToCase({
        ticketId: "tkt_gd",
        kind: "warranty",
        orderItemId: "oi_1",
        adminId: "admin_9",
      }),
    ).rejects.toThrow("ya tiene un caso enlazado");
    expect(createWarrantyAsAdmin).not.toHaveBeenCalled();
    expect(createRetractAsAdmin).not.toHaveBeenCalled();
  });

  it("asunto distinto de GARANTIA_DEVOLUCION: lanza", async () => {
    ticketFindUnique.mockResolvedValue({ ...CONVERT_TICKET, subject: "MI_PEDIDO" });
    await expect(
      convertTicketToCase({
        ticketId: "tkt_gd",
        kind: "retract",
        orderItemId: "oi_1",
        adminId: "admin_9",
      }),
    ).rejects.toThrow("garantía/devolución");
    expect(createRetractAsAdmin).not.toHaveBeenCalled();
  });
});

describe("caseConversionErrorMessage", () => {
  it("mapea las razones de los módulos a mensajes amigables", () => {
    expect(caseConversionErrorMessage(new WarrantyError("NOT_DELIVERED"))).toContain("entregado");
    expect(caseConversionErrorMessage(new WarrantyError("ACTIVE_CLAIM"))).toContain("reclamo");
    expect(caseConversionErrorMessage(new RetractError("PERSONALIZED"))).toContain(
      "personalizados",
    );
    expect(caseConversionErrorMessage(new RetractError("ALREADY_REQUESTED"))).toContain("retracto");
    expect(caseConversionErrorMessage(new Error("boom"))).toBe("No se pudo convertir el ticket.");
  });
});
