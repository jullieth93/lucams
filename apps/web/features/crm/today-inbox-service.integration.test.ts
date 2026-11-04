import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getTodayOperationalInbox } from "./today-inbox-service";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)(
  "Bandeja Hoy — aislamiento por rol RBAC, relojes SLA y enmascaramiento PII (S23)",
  () => {
    const createdTaskIds: string[] = [];
    const createdTicketIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdContactIds: string[] = [];
    const createdAdminIds: string[] = [];

    afterAll(async () => {
      if (createdTaskIds.length > 0) {
        await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } }).catch(() => {});
      }
      if (createdTicketIds.length > 0) {
        await prisma.supportTicket
          .deleteMany({ where: { id: { in: createdTicketIds } } })
          .catch(() => {});
      }
      if (createdOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
      }
      if (createdContactIds.length > 0) {
        await prisma.contact
          .deleteMany({ where: { id: { in: createdContactIds } } })
          .catch(() => {});
      }
      if (createdAdminIds.length > 0) {
        await prisma.adminUser
          .deleteMany({ where: { id: { in: createdAdminIds } } })
          .catch(() => {});
      }
    });

    it("filtra colas por capacidades de cada rol y enmascara PII en servidor para PRINT_WORKSHOP", async () => {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [supportAdmin, workshopAdmin, financeAdmin, cmsAdmin] = await Promise.all([
        prisma.adminUser.create({
          data: {
            supabaseUserId: randomUUID(),
            email: `itest-hoy-sac-${suffix}@lucams.test`,
            role: "CUSTOMER_SUPPORT",
            isActive: true,
          },
        }),
        prisma.adminUser.create({
          data: {
            supabaseUserId: randomUUID(),
            email: `itest-hoy-taller-${suffix}@lucams.test`,
            role: "PRINT_WORKSHOP",
            isActive: true,
          },
        }),
        prisma.adminUser.create({
          data: {
            supabaseUserId: randomUUID(),
            email: `itest-hoy-fin-${suffix}@lucams.test`,
            role: "FINANCE_ANALYST",
            isActive: true,
          },
        }),
        prisma.adminUser.create({
          data: {
            supabaseUserId: randomUUID(),
            email: `itest-hoy-cms-${suffix}@lucams.test`,
            role: "CMS_EDITOR",
            isActive: true,
          },
        }),
      ]);
      createdAdminIds.push(supportAdmin.id, workshopAdmin.id, financeAdmin.id, cmsAdmin.id);

      const contact = await prisma.contact.create({
        data: {
          primaryEmail: `itest-hoy-cliente-${suffix}@lucams.test`,
          displayName: "Mariana Restrepo",
        },
      });
      createdContactIds.push(contact.id);

      // 1) Pedido COD entregado hace 10 días sin conciliar (solo visible en FINANCE)
      const codOrder = await prisma.order.create({
        data: {
          number: `TEST-COD-${suffix}`,
          email: `itest-hoy-cliente-${suffix}@lucams.test`,
          phone: "+573001112233",
          contactId: contact.id,
          status: "DELIVERED",
          paymentMethod: "COD",
          subtotal: 8000000,
          shipping: 1200000,
          discount: 0,
          total: 9200000,
          shippingAddress: {
            fullName: "Mariana Restrepo",
            email: `itest-hoy-cliente-${suffix}@lucams.test`,
            phone: "+573001112233",
            city: "Medellín",
            department: "Antioquia",
            addressLine1: "Calle 10 # 40-20",
          },
          updatedAt: tenDaysAgo,
        },
      });
      createdOrderIds.push(codOrder.id);
      await prisma.$executeRaw`UPDATE "Order" SET "updatedAt" = ${tenDaysAgo} WHERE id = ${codOrder.id}`;

      // 2) Ticket de soporte vencido sin 1ª respuesta (visible en CARE_SLA)
      const ticket = await prisma.supportTicket.create({
        data: {
          contactId: contact.id,
          name: "Mariana Restrepo",
          email: `itest-hoy-cliente-${suffix}@lucams.test`,
          subject: "ESTADO_PEDIDO",
          message: "Hola, ¿cómo va mi pedido personalizado?",
          status: "OPEN",
          slaDueAt: yesterday,
          assignedToAdminId: supportAdmin.id,
        },
      });
      createdTicketIds.push(ticket.id);

      // 3) Tarea privada de CRM sin pedido (NO debe verla PRINT_WORKSHOP)
      const privateCrmTask = await prisma.task.create({
        data: {
          title: `itest llamar cliente VIP ${suffix}`,
          status: "OPEN",
          priority: "URGENT",
          dueAt: yesterday,
          ownerAdminId: supportAdmin.id,
          contactId: contact.id,
        },
      });
      createdTaskIds.push(privateCrmTask.id);

      // 4) Tarea operativa asignada a PRINT_WORKSHOP con contacto asociado (debe enmascarar apellido)
      const workshopTask = await prisma.task.create({
        data: {
          title: `itest revisar corte imán ${suffix}`,
          status: "OPEN",
          priority: "HIGH",
          dueAt: yesterday,
          ownerAdminId: workshopAdmin.id,
          contactId: contact.id,
          orderId: codOrder.id,
        },
      });
      createdTaskIds.push(workshopTask.id);

      // A) CUSTOMER_SUPPORT: ve su ticket y tareas CRM, NO ve finanzas COD
      const sacInbox = await getTodayOperationalInbox(
        { id: supportAdmin.id, role: "CUSTOMER_SUPPORT" },
        now,
      );
      expect(sacInbox.piiMasked).toBe(false);
      const sacTicketRow = sacInbox.items.find((i) => i.id === `ticket:${ticket.id}`);
      expect(sacTicketRow?.isOverdue).toBe(true);
      expect(sacTicketRow?.severity).toBe("CRITICAL");
      expect(sacInbox.items.some((i) => i.id === `task:${privateCrmTask.id}`)).toBe(true);
      expect(sacInbox.items.some((i) => i.id === `cod:${codOrder.id}`)).toBe(false);

      // B) FINANCE_ANALYST: ve remesa COD pendiente, NO ve soporte ni tarea privada CRM ajena
      const finInbox = await getTodayOperationalInbox(
        { id: financeAdmin.id, role: "FINANCE_ANALYST" },
        now,
      );
      expect(finInbox.items.some((i) => i.id === `cod:${codOrder.id}`)).toBe(true);
      expect(finInbox.items.some((i) => i.id === `ticket:${ticket.id}`)).toBe(false);
      expect(finInbox.items.some((i) => i.id === `task:${privateCrmTask.id}`)).toBe(false);

      // C) PRINT_WORKSHOP: ve su tarea de taller con PII enmascarada, NO ve ticket ni tarea privada CRM ni COD
      const workshopInbox = await getTodayOperationalInbox(
        { id: workshopAdmin.id, role: "PRINT_WORKSHOP" },
        now,
      );
      expect(workshopInbox.piiMasked).toBe(true);
      expect(workshopInbox.items.some((i) => i.id === `ticket:${ticket.id}`)).toBe(false);
      expect(workshopInbox.items.some((i) => i.id === `task:${privateCrmTask.id}`)).toBe(false);
      expect(workshopInbox.items.some((i) => i.id === `cod:${codOrder.id}`)).toBe(false);

      const ownTaskRow = workshopInbox.items.find((i) => i.id === `task:${workshopTask.id}`);
      expect(ownTaskRow).toBeDefined();
      expect(ownTaskRow?.subtitle).toContain("Mariana R.");
      expect(ownTaskRow?.subtitle).not.toContain("Restrepo");

      // D) CMS_EDITOR: cero acceso a Bandeja Hoy
      const cmsInbox = await getTodayOperationalInbox({ id: cmsAdmin.id, role: "CMS_EDITOR" }, now);
      expect(cmsInbox.counts.total).toBe(0);
    });
  },
);
