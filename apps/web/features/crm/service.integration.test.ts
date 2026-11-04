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

    afterAll(async () => {
      if (createdTaskIds.length > 0) {
        await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } }).catch(() => {});
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
  },
);
