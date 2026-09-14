/*
 * Test UNIT de features/support/admin-service — foco N-14: el email de cierre
 * al cliente dentro de setSupportTicketStatus.
 *
 * Todo el entorno está mockeado (prisma, Resend, CMS, logger) → determinista y
 * offline. El template de cierre se renderiza de verdad (con el CMS mockeado a
 * fallbacks, mismo criterio que templates.test.ts) así las aserciones sobre el
 * envío (destinatario, idempotencyKey, replyTo, subject) prueban el cableado
 * completo servicio → template → sendEmail.
 *
 * Reglas N-14 bajo prueba:
 *   - Transición real → CLOSED (desde OPEN o IN_PROGRESS): SÍ envía.
 *   - Cerrar un ticket que YA estaba CLOSED (resolvedAt ya sellado): NO reenvía.
 *   - Reabrir (OPEN) o pasar a IN_PROGRESS: NO envía.
 *   - Un fallo de Resend NUNCA rompe el cambio de estado (patrón orders/emails).
 *   - Ticket inexistente: lanza antes de intentar el update.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() =>
  vi.fn(async (_input: unknown): Promise<unknown> => ({ sent: true, id: "email_1" })),
);
const ticketFindUnique = vi.hoisted(() => vi.fn(async (_args?: unknown): Promise<unknown> => null));
const ticketUpdate = vi.hoisted(() => vi.fn(async (_args?: unknown): Promise<unknown> => ({})));
const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/resend", () => ({ sendEmail }));
vi.mock("@/lib/db", () => ({
  prisma: { supportTicket: { findUnique: ticketFindUnique, update: ticketUpdate } },
}));
// CMS mockeado: settings ausentes → fallbacks (CONTACT_EMAIL → hola@lucamsshop.com).
vi.mock("@/lib/cms", () => ({
  getSettingValue: vi.fn(async (_key: string, fallback: string) => fallback),
}));

import { setSupportTicketStatus } from "./admin-service";

const TICKET = {
  status: "OPEN",
  name: "Elena",
  email: "elena@example.com",
  subject: "MI_PEDIDO",
};

type SendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
};

beforeEach(() => {
  vi.clearAllMocks();
  ticketFindUnique.mockResolvedValue({ ...TICKET });
});

describe("setSupportTicketStatus — email de cierre (N-14)", () => {
  it("OPEN → CLOSED: sella resolvedAt/resolvedBy y envía el email de cierre al cliente", async () => {
    await setSupportTicketStatus("tkt_1", "CLOSED", "admin_9");

    const update = ticketUpdate.mock.calls[0][0] as {
      data: { status: string; resolvedAt: Date | null; resolvedBy: string | null };
    };
    expect(update.data.status).toBe("CLOSED");
    expect(update.data.resolvedAt).toBeInstanceOf(Date);
    expect(update.data.resolvedBy).toBe("admin_9");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const input = sendEmail.mock.calls[0][0] as SendInput;
    expect(input.to).toBe("elena@example.com");
    // idempotencyKey incluye ticketId + la transición concreta (closed).
    expect(input.idempotencyKey).toBe("support:closed:tkt_1");
    // Reply-To = buzón de soporte (fallback CONTACT_EMAIL del CMS mockeado).
    expect(input.replyTo).toBe("hola@lucamsshop.com");
    // Subject del template con el short id en mayúsculas.
    expect(input.subject).toBe("Atendimos tu solicitud — Ticket #TKT_1");
    expect(input.tags).toEqual([{ name: "kind", value: "support-closed" }]);
  });

  it("IN_PROGRESS → CLOSED también envía (es transición real a cierre)", async () => {
    ticketFindUnique.mockResolvedValue({ ...TICKET, status: "IN_PROGRESS" });
    await setSupportTicketStatus("tkt_2", "CLOSED", "admin_9");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("CLOSED → CLOSED (re-click): actualiza pero NO reenvía el email", async () => {
    ticketFindUnique.mockResolvedValue({ ...TICKET, status: "CLOSED" });
    await setSupportTicketStatus("tkt_3", "CLOSED", "admin_9");
    expect(ticketUpdate).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reabrir (→ OPEN): limpia resolvedAt/resolvedBy y NO envía email", async () => {
    ticketFindUnique.mockResolvedValue({ ...TICKET, status: "CLOSED" });
    await setSupportTicketStatus("tkt_4", "OPEN", "admin_9");

    const update = ticketUpdate.mock.calls[0][0] as {
      data: { status: string; resolvedAt: Date | null; resolvedBy: string | null };
    };
    expect(update.data).toEqual({ status: "OPEN", resolvedAt: null, resolvedBy: null });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("→ IN_PROGRESS: NO envía email (solo el cierre notifica)", async () => {
    await setSupportTicketStatus("tkt_5", "IN_PROGRESS", "admin_9");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("un fallo de Resend NO rompe el cambio de estado (best-effort, patrón orders)", async () => {
    sendEmail.mockRejectedValueOnce(new Error("resend down"));
    await expect(setSupportTicketStatus("tkt_6", "CLOSED", "admin_9")).resolves.toBeUndefined();
    expect(ticketUpdate).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "support.ticket.closed_email.fail", ticketId: "tkt_6" }),
    );
  });

  it("ticket inexistente: lanza y NO intenta update ni email", async () => {
    ticketFindUnique.mockResolvedValue(null);
    await expect(setSupportTicketStatus("tkt_x", "CLOSED", "admin_9")).rejects.toThrow(
      "no encontrado",
    );
    expect(ticketUpdate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
