import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashBearerToken } from "@/lib/token-hash";
import { computeSupportTicketSlaDueAt } from "@/lib/colombian-sla";
import { addGuestReplyByToken, getPublicSupportThreadByToken } from "./public-thread-service";
import {
  listSupportTicketsPaginated,
  setSupportTicketStatus,
  SupportConcurrencyError,
  updateSupportTicketGovernance,
} from "./admin-service";
import { addTicketMessage } from "./thread-service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/resend", () => ({
  sendEmail: vi.fn(async () => ({ sent: false, reason: "test-skip" })),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)(
  "Soporte bidireccional, SLA legal colombiano y concurrencia optimista (S21)",
  () => {
    const createdTicketIds: string[] = [];
    const createdAdminIds: string[] = [];

    afterAll(async () => {
      if (createdTicketIds.length > 0) {
        await prisma.supportTicket
          .deleteMany({ where: { id: { in: createdTicketIds } } })
          .catch(() => {});
      }
      if (createdAdminIds.length > 0) {
        await prisma.adminUser
          .deleteMany({ where: { id: { in: createdAdminIds } } })
          .catch(() => {});
      }
    });

    it("hilo público por token oculta notas internas, sella firstRespondedAt y reabre tickets cerrados cuando el cliente responde", async () => {
      const suffix = randomUUID().slice(0, 8);
      const admin = await prisma.adminUser.create({
        data: {
          email: `support-agent-${suffix}@lucams.test`,
          supabaseUserId: `supa-support-${suffix}`,
          role: "CUSTOMER_SUPPORT",
          isActive: true,
        },
      });
      createdAdminIds.push(admin.id);

      const plainToken = randomBytes(16).toString("hex");
      const now = new Date();
      const ticket = await prisma.supportTicket.create({
        data: {
          name: "Daniela Gómez",
          email: `daniela-${suffix}@lucams.test`,
          subject: "MI_PEDIDO",
          message: "Hola, ¿pueden confirmarme cuándo despachan mi pedido?",
          status: "OPEN",
          publicAccessTokenHash: hashBearerToken(plainToken),
          slaDueAt: computeSupportTicketSlaDueAt(now, "MI_PEDIDO"),
          ip: "190.24.10.20",
        },
      });
      createdTicketIds.push(ticket.id);

      // 1) Nota interna NO debe aparecer en el hilo público ni sellar firstRespondedAt.
      await addTicketMessage({
        ticketId: ticket.id,
        body: "Nota interna privada: revisar lote de sublimación.",
        adminId: admin.id,
        internal: true,
      });

      const afterInternal = await prisma.supportTicket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      expect(afterInternal.firstRespondedAt).toBeNull();
      expect(afterInternal.status).toBe("OPEN");

      // 2) Primera respuesta pública sella firstRespondedAt, pasa a IN_PROGRESS y autoasigna al agente.
      await addTicketMessage({
        ticketId: ticket.id,
        body: "¡Hola Daniela! Tu pedido sale hoy en la tarde con guía de Aveonline.",
        adminId: admin.id,
        internal: false,
      });

      const afterPublicReply = await prisma.supportTicket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      expect(afterPublicReply.firstRespondedAt).toBeInstanceOf(Date);
      expect(afterPublicReply.status).toBe("IN_PROGRESS");
      expect(afterPublicReply.assignedToAdminId).toBe(admin.id);

      const guestView = await getPublicSupportThreadByToken(plainToken);
      expect(guestView).not.toBeNull();
      expect(guestView!.customerFirstName).toBe("Daniela");
      expect(guestView).not.toHaveProperty("email");
      expect(guestView).not.toHaveProperty("ip");
      expect(guestView!.messages).toHaveLength(1);
      expect(guestView!.messages[0].authorKind).toBe("ADMIN");

      // 3) Cerramos el ticket con control optimista válido.
      await setSupportTicketStatus(ticket.id, "CLOSED", admin.id, {
        expectedUpdatedAt: afterPublicReply.updatedAt,
      });

      // Un segundo intento con el updatedAt viejo debe lanzar SupportConcurrencyError.
      await expect(
        updateSupportTicketGovernance({
          id: ticket.id,
          assignedToAdminId: admin.id,
          priority: "URGENT",
          expectedUpdatedAt: afterPublicReply.updatedAt,
        }),
      ).rejects.toBeInstanceOf(SupportConcurrencyError);

      // 4) El cliente responde desde su enlace /soporte/[token] -> el ticket se reabre a OPEN.
      const replyRes = await addGuestReplyByToken({
        token: plainToken,
        body: "¡Mil gracias! Quedo pendiente del número de guía.",
      });
      expect(replyRes.reopened).toBe(true);

      const reopenedTicket = await prisma.supportTicket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      expect(reopenedTicket.status).toBe("OPEN");
      expect(reopenedTicket.resolvedAt).toBeNull();

      // 5) El listado paginado lo encuentra por vista "mine" y búsqueda q.
      const inbox = await listSupportTicketsPaginated({
        view: "mine",
        q: `daniela-${suffix}`,
        actorAdminId: admin.id,
      });
      expect(inbox.items.some((it) => it.id === ticket.id)).toBe(true);
    });
  },
);
