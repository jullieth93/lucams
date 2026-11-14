import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createContactActivity,
  createCrmTask,
  CrmValidationError,
  listActivitiesForEntity,
  listTasksForEntity,
  updateCrmTaskStatus,
} from "./service";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)(
  "CRM Service — bitácora ContactActivity y motor de tareas Task (S22)",
  () => {
    const createdContactIds: string[] = [];
    const createdTaskIds: string[] = [];
    const createdAdminIds: string[] = [];
    const createdOpportunityIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdTicketIds: string[] = [];

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
      if (createdOpportunityIds.length > 0) {
        await prisma.opportunity
          .deleteMany({ where: { id: { in: createdOpportunityIds } } })
          .catch(() => {});
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

    it("registra actividades, redirige contactos fusionados al sobreviviente y bloquea listados sin filtro", async () => {
      const suffix = randomUUID().slice(0, 8);
      const admin = await prisma.adminUser.create({
        data: {
          supabaseUserId: randomUUID(),
          email: `itest-crm-adm-${suffix}@lucams.test`,
          role: "CUSTOMER_SUPPORT",
          isActive: true,
        },
      });
      createdAdminIds.push(admin.id);

      const survivor = await prisma.contact.create({
        data: {
          primaryEmail: `itest-crm-surv-${suffix}@lucams.test`,
          displayName: "Camila Sobreviviente",
        },
      });
      createdContactIds.push(survivor.id);

      const merged = await prisma.contact.create({
        data: {
          primaryEmail: `itest-crm-old-${suffix}@lucams.test`,
          displayName: "Camila Duplicada",
          deletedAt: new Date(),
        },
      });
      createdContactIds.push(merged.id);

      await prisma.identityMergeCandidate.create({
        data: {
          primaryContactId: survivor.id,
          secondaryContactId: merged.id,
          reasonCode: "SHARED_PHONE",
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedByAdminId: admin.id,
          mergeSnapshotJson: { survivorContactId: survivor.id, absorbedContactId: merged.id },
        },
      });

      // Si una vista con caché viejo apunta al contacto absorbido, la actividad cae en el sobreviviente.
      const act1 = await createContactActivity({
        contactId: merged.id,
        authorAdminId: admin.id,
        kind: "WHATSAPP",
        body: "Confirmamos foto principal en alta resolución por WhatsApp.",
      });
      expect(act1.contactId).toBe(survivor.id);

      await createContactActivity({
        contactId: survivor.id,
        authorAdminId: admin.id,
        kind: "NOTE",
        body: "Cliente pidió empaque de regalo para aniversario.",
      });

      const timeline = await listActivitiesForEntity({ contactId: survivor.id });
      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.kind).toBe("NOTE");
      expect(timeline[1]?.kind).toBe("WHATSAPP");
      expect(timeline[0]?.authorEmail).toBe(admin.email);

      await expect(listActivitiesForEntity({})).rejects.toThrow(CrmValidationError);
      await expect(listTasksForEntity({})).rejects.toThrow(CrmValidationError);
    });

    it("ordena tareas abiertas por vencimiento, sella completedAt al cerrar y permite reabrir", async () => {
      const suffix = randomUUID().slice(0, 8);
      const contact = await prisma.contact.create({
        data: {
          primaryEmail: `itest-crm-tasks-${suffix}@lucams.test`,
          displayName: "Mateo Tareas",
        },
      });
      createdContactIds.push(contact.id);

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const laterTask = await createCrmTask({
        title: `itest tarea mañana ${suffix}`,
        priority: "NORMAL",
        dueAt: tomorrow,
        contactId: contact.id,
      });
      createdTaskIds.push(laterTask.id);

      const urgentOverdueTask = await createCrmTask({
        title: `itest tarea vencida ${suffix}`,
        priority: "URGENT",
        dueAt: yesterday,
        contactId: contact.id,
      });
      createdTaskIds.push(urgentOverdueTask.id);

      const listBefore = await listTasksForEntity({ contactId: contact.id });
      expect(listBefore.map((t) => t.id)).toEqual([urgentOverdueTask.id, laterTask.id]);

      const completed = await updateCrmTaskStatus({
        taskId: urgentOverdueTask.id,
        status: "DONE",
      });
      expect(completed.status).toBe("DONE");
      expect(completed.completedAt).toBeInstanceOf(Date);

      // Al completarse, la tarea abierta restante sube al primer lugar.
      const listAfterDone = await listTasksForEntity({ contactId: contact.id });
      expect(listAfterDone.map((t) => t.id)).toEqual([laterTask.id, urgentOverdueTask.id]);

      const onlyOpen = await listTasksForEntity({
        contactId: contact.id,
        includeDone: false,
      });
      expect(onlyOpen.map((t) => t.id)).toEqual([laterTask.id]);

      const reopened = await updateCrmTaskStatus({
        taskId: urgentOverdueTask.id,
        status: "OPEN",
      });
      expect(reopened.status).toBe("OPEN");
      expect(reopened.completedAt).toBeNull();
    });

    it("persiste opportunityId en tareas y actividades para oportunidades consultivas B2B", async () => {
      const suffix = randomUUID().slice(0, 6).toUpperCase();
      const contact = await prisma.contact.create({
        data: {
          primaryEmail: `itest-crm-opp-${suffix.toLowerCase()}@lucams.test`,
          displayName: "Empresa Eventos S.A.S.",
        },
      });
      createdContactIds.push(contact.id);

      const oppNumber = `OP-${suffix}`;
      const opp = await prisma.opportunity.create({
        data: {
          number: oppNumber,
          contactId: contact.id,
          contactName: "Empresa Eventos S.A.S.",
          title: `Regalos corporativos ${suffix}`,
          eventType: "CORPORATE_GIFT",
          stage: "QUALIFYING",
          expectedUnits: 80,
          expectedAmountCop: 4_500_000_00,
        },
      });
      createdOpportunityIds.push(opp.id);

      const oppTask = await createCrmTask({
        title: `Enviar muestra física ${suffix}`,
        priority: "HIGH",
        contactId: contact.id,
        opportunityId: opp.id,
      });
      createdTaskIds.push(oppTask.id);

      await createContactActivity({
        contactId: contact.id,
        kind: "CALL",
        body: "Llamada con compras: aprueban anticipo 50%.",
        metadata: { opportunityId: opp.id, opportunityNumber: opp.number },
      });

      const oppTasks = await listTasksForEntity({ opportunityId: opp.id });
      expect(oppTasks).toHaveLength(1);
      expect(oppTasks[0]?.opportunityId).toBe(opp.id);
      expect(oppTasks[0]?.opportunityNumber).toBe(oppNumber);

      const contactActivities = await listActivitiesForEntity({ contactId: contact.id });
      expect(contactActivities[0]?.opportunityId).toBe(opp.id);
      expect(contactActivities[0]?.opportunityNumber).toBe(oppNumber);
    });

    it("rechaza relaciones cruzadas entre contacto, pedido, ticket y oportunidad", async () => {
      const suffix = randomUUID().slice(0, 8);
      const [contact, otherContact] = await Promise.all([
        prisma.contact.create({
          data: {
            primaryEmail: `itest-crm-rel-a-${suffix}@lucams.test`,
            displayName: "Contacto Relación A",
          },
        }),
        prisma.contact.create({
          data: {
            primaryEmail: `itest-crm-rel-b-${suffix}@lucams.test`,
            displayName: "Contacto Relación B",
          },
        }),
      ]);
      createdContactIds.push(contact.id, otherContact.id);

      const order = await prisma.order.create({
        data: {
          number: `TEST-CRM-${suffix}`,
          email: `itest-crm-rel-a-${suffix}@lucams.test`,
          phone: "+573001112233",
          contactId: contact.id,
          paymentMethod: "WOMPI",
          subtotal: 100_000,
          shipping: 0,
          total: 100_000,
          shippingAddress: { city: "Bogotá", department: "Bogotá D.C." },
        },
      });
      createdOrderIds.push(order.id);
      const ticket = await prisma.supportTicket.create({
        data: {
          contactId: contact.id,
          name: "Contacto Relación A",
          email: `itest-crm-rel-a-${suffix}@lucams.test`,
          subject: "ESTADO_PEDIDO",
          message: "Fixture de coherencia relacional",
        },
      });
      createdTicketIds.push(ticket.id);
      const opportunity = await prisma.opportunity.create({
        data: {
          number: `OP-REL-${suffix.toUpperCase()}`,
          contactId: contact.id,
          title: "Fixture de coherencia B2B",
        },
      });
      createdOpportunityIds.push(opportunity.id);

      await expect(
        createCrmTask({
          title: "Tarea con pedido cruzado",
          contactId: otherContact.id,
          orderId: order.id,
        }),
      ).rejects.toThrow("El pedido no pertenece al contacto indicado.");
      await expect(
        createCrmTask({
          title: "Tarea con ticket cruzado",
          contactId: otherContact.id,
          supportTicketId: ticket.id,
        }),
      ).rejects.toThrow("El ticket no pertenece al contacto indicado.");
      await expect(
        createCrmTask({
          title: "Tarea con oportunidad cruzada",
          contactId: otherContact.id,
          opportunityId: opportunity.id,
        }),
      ).rejects.toThrow("La oportunidad no pertenece al contacto indicado.");
      await expect(
        createContactActivity({
          contactId: otherContact.id,
          orderId: order.id,
          kind: "NOTE",
          body: "Actividad con pedido de otro contacto",
        }),
      ).rejects.toThrow("El pedido no pertenece al contacto indicado.");
      await expect(
        createContactActivity({
          contactId: otherContact.id,
          supportTicketId: ticket.id,
          kind: "NOTE",
          body: "Actividad con ticket de otro contacto",
        }),
      ).rejects.toThrow("El ticket no pertenece al contacto indicado.");
      await expect(
        createContactActivity({
          contactId: otherContact.id,
          kind: "NOTE",
          body: "Actividad con oportunidad de otro contacto",
          metadata: { opportunityId: opportunity.id },
        }),
      ).rejects.toThrow("La oportunidad no pertenece al contacto indicado.");

      const coherentTask = await createCrmTask({
        title: "Tarea con relaciones coherentes",
        contactId: contact.id,
        orderId: order.id,
        supportTicketId: ticket.id,
        opportunityId: opportunity.id,
      });
      createdTaskIds.push(coherentTask.id);
      const coherentActivity = await createContactActivity({
        contactId: contact.id,
        orderId: order.id,
        supportTicketId: ticket.id,
        kind: "NOTE",
        body: "Todas las entidades pertenecen al mismo contacto",
        metadata: { opportunityId: opportunity.id },
      });
      expect(coherentTask.contactId).toBe(contact.id);
      expect(coherentActivity.contactId).toBe(contact.id);
    });
  },
);
