import "server-only";

import { Prisma, type LifecycleJourneyStatus } from "@lucams/db";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import { getSiteUrl } from "@/features/emails/layout";
import { renderLifecycleMessageEmail } from "@/features/emails/registry";
import { findEligibleContacts, toAudienceMember } from "./eligibility";
import type {
  LifecycleAudiencePreview,
  LifecycleJourneyInput,
  LifecycleJourneyMetrics,
} from "./types";

export class LifecycleValidationError extends Error {}

export async function listLifecycleJourneys() {
  return prisma.lifecycleJourney.findMany({
    include: {
      steps: { orderBy: { position: "asc" } },
      _count: {
        select: {
          enrollments: true,
          steps: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { key: "asc" }],
  });
}

export async function getLifecycleJourney(id: string) {
  return prisma.lifecycleJourney.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { position: "asc" } },
      enrollments: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          contact: { select: { primaryEmail: true, displayName: true } },
          currentStep: { select: { position: true, subject: true } },
        },
      },
    },
  });
}

export async function getLifecycleJourneyMessages(journeyId: string, take = 40) {
  return prisma.lifecycleMessage.findMany({
    where: { enrollment: { journeyId } },
    include: {
      contact: { select: { primaryEmail: true, displayName: true } },
      enrollment: {
        select: {
          cycle: true,
          status: true,
          journey: { select: { key: true, name: true } },
        },
      },
      step: { select: { position: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

function validateStepOwnership(steps: LifecycleJourneyInput["steps"]) {
  const positions = new Set(steps.map((step) => step.position));
  if (positions.size !== steps.length) {
    throw new LifecycleValidationError("Cada paso debe tener una posición única.");
  }
  if (
    steps.some((step) => step.commercial === false && step.condition === "HAS_OPT_IN") === false
  ) {
    return;
  }
}

export async function createLifecycleJourney(input: LifecycleJourneyInput, adminId: string) {
  validateStepOwnership(input.steps);
  if (input.status !== "DRAFT") {
    throw new LifecycleValidationError(
      "Crea el recorrido como borrador y actívalo después de revisarlo.",
    );
  }
  try {
    return await prisma.lifecycleJourney.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        status: "DRAFT",
        requireOptIn: input.requireOptIn,
        inactivityDays: input.inactivityDays,
        entryLookbackDays: input.entryLookbackDays,
        cooldownDays: input.cooldownDays,
        maxMessagesPerDay: input.maxMessagesPerDay,
        quietStartHour: input.quietStartHour,
        quietEndHour: input.quietEndHour,
        createdBy: adminId,
        updatedBy: adminId,
        steps: {
          create: input.steps.map((step) => ({
            position: step.position,
            delayMinutes: step.delayMinutes,
            subject: step.subject,
            heading: step.heading,
            preheader: step.preheader,
            body: step.body,
            ctaLabel: step.ctaLabel,
            ctaPath: step.ctaPath,
            commercial: step.commercial,
            condition: step.condition,
          })),
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new LifecycleValidationError("Ya existe un recorrido con esa clave.");
    }
    throw error;
  }
}

export async function updateLifecycleJourney(
  id: string,
  input: LifecycleJourneyInput,
  adminId: string,
) {
  validateStepOwnership(input.steps);
  const existing = await prisma.lifecycleJourney.findUnique({
    where: { id },
    include: { steps: { select: { id: true } } },
  });
  if (!existing) throw new LifecycleValidationError("El recorrido no existe.");

  const stepIds = input.steps.map((step) => step.id).filter((id): id is string => Boolean(id));
  const allowedIds = new Set(existing.steps.map((step) => step.id));
  if (stepIds.some((stepId) => !allowedIds.has(stepId))) {
    throw new LifecycleValidationError("Uno de los pasos no pertenece a este recorrido.");
  }

  const removedIds = [...allowedIds].filter((stepId) => !stepIds.includes(stepId));
  if (removedIds.length > 0) {
    const [messages, active] = await Promise.all([
      prisma.lifecycleMessage.count({ where: { stepId: { in: removedIds } } }),
      prisma.lifecycleEnrollment.count({
        where: { currentStepId: { in: removedIds }, status: "ACTIVE" },
      }),
    ]);
    if (messages > 0) {
      throw new LifecycleValidationError(
        "No puedes eliminar pasos que ya tienen mensajes históricos.",
      );
    }
    if (active > 0) {
      throw new LifecycleValidationError(
        "No puedes eliminar el paso actual de una inscripción activa.",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const journey = await tx.lifecycleJourney.update({
      where: { id },
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        status: input.status,
        requireOptIn: input.requireOptIn,
        inactivityDays: input.inactivityDays,
        entryLookbackDays: input.entryLookbackDays,
        cooldownDays: input.cooldownDays,
        maxMessagesPerDay: input.maxMessagesPerDay,
        quietStartHour: input.quietStartHour,
        quietEndHour: input.quietEndHour,
        version: { increment: 1 },
        updatedBy: adminId,
      },
    });
    await tx.lifecycleJourneyStep.updateMany({
      where: { journeyId: id },
      data: { position: { increment: 1000 } },
    });
    if (removedIds.length > 0) {
      await tx.lifecycleJourneyStep.deleteMany({ where: { id: { in: removedIds } } });
    }
    for (const step of input.steps) {
      const data = {
        position: step.position,
        delayMinutes: step.delayMinutes,
        subject: step.subject,
        heading: step.heading,
        preheader: step.preheader,
        body: step.body,
        ctaLabel: step.ctaLabel,
        ctaPath: step.ctaPath,
        commercial: step.commercial,
        condition: step.condition,
      };
      if (step.id) {
        await tx.lifecycleJourneyStep.update({ where: { id: step.id }, data });
      } else {
        await tx.lifecycleJourneyStep.create({ data: { journeyId: id, ...data } });
      }
    }
    return journey;
  });
}

export async function setLifecycleJourneyStatus(
  id: string,
  status: LifecycleJourneyStatus,
  adminId: string,
) {
  if (status === "ACTIVE") {
    const steps = await prisma.lifecycleJourneyStep.count({ where: { journeyId: id } });
    if (steps === 0) {
      throw new LifecycleValidationError("Agrega al menos un paso antes de activar el recorrido.");
    }
  }
  return prisma.lifecycleJourney.update({
    where: { id },
    data: { status, version: { increment: 1 }, updatedBy: adminId },
  });
}

export async function previewLifecycleAudience(
  journeyId: string,
): Promise<LifecycleAudiencePreview> {
  const journey = await prisma.lifecycleJourney.findUnique({ where: { id: journeyId } });
  if (!journey) throw new LifecycleValidationError("El recorrido no existe.");
  const eligible = await findEligibleContacts(journey, new Date(), { limit: 50 });
  return {
    eligible: eligible.total,
    excludedNoOptIn: eligible.excludedNoOptIn,
    sample: eligible.items.slice(0, 10).map(toAudienceMember),
  };
}

export async function sendLifecycleTest(
  journeyId: string,
  stepId: string | undefined,
  admin: { email: string; fullName: string | null },
) {
  const journey = await prisma.lifecycleJourney.findUnique({
    where: { id: journeyId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!journey) throw new LifecycleValidationError("El recorrido no existe.");
  const step = stepId ? journey.steps.find((item) => item.id === stepId) : journey.steps[0];
  if (!step) throw new LifecycleValidationError("El paso seleccionado no existe.");

  const siteUrl = await getSiteUrl();
  const rendered = await renderLifecycleMessageEmail({
    subject: step.subject,
    heading: step.heading,
    preheader: step.preheader,
    body: step.body,
    ctaLabel: step.ctaLabel,
    ctaUrl: `${siteUrl}${step.ctaPath}`,
    recipientName: admin.fullName ?? admin.email.split("@")[0],
    productNames: ["Fotoimanes Cuadrados", "Calendario personalizado"],
  });
  const result = await sendEmail({
    to: admin.email,
    subject: `[PRUEBA] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `lifecycle-test:${journeyId}:${step.id}:${Date.now()}`,
    tags: [{ name: "type", value: "lifecycle_test" }],
  });
  if (!result.sent)
    throw new LifecycleValidationError(`No pudimos enviar la prueba: ${result.reason}.`);
  return result.id;
}

export async function setEnrollmentStatus(
  enrollmentId: string,
  action: "pause" | "resume" | "exit",
) {
  const enrollment = await prisma.lifecycleEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      contact: { select: { deletedAt: true, anonymizedAt: true } },
    },
  });
  if (!enrollment) throw new LifecycleValidationError("La inscripción no existe.");
  if (enrollment.contact.deletedAt || enrollment.contact.anonymizedAt) {
    throw new LifecycleValidationError(
      "No puedes reactivar una inscripción de un contacto eliminado.",
    );
  }
  if (action === "pause") {
    if (enrollment.status !== "ACTIVE") {
      throw new LifecycleValidationError("Solo puedes pausar una inscripción activa.");
    }
    return prisma.lifecycleEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "SUPPRESSED", exitReason: "ADMIN_PAUSED" },
    });
  }
  if (action === "resume") {
    if (enrollment.status !== "SUPPRESSED") {
      throw new LifecycleValidationError("Solo puedes reanudar una inscripción pausada.");
    }
    return prisma.lifecycleEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "ACTIVE", exitReason: null, nextRunAt: new Date(), completedAt: null },
    });
  }
  if (enrollment.status === "COMPLETED" || enrollment.status === "EXITED") {
    throw new LifecycleValidationError("La inscripción ya está finalizada.");
  }
  return prisma.lifecycleEnrollment.update({
    where: { id: enrollmentId },
    data: { status: "EXITED", exitReason: "ADMIN_EXIT", completedAt: new Date() },
  });
}

export async function retryLifecycleMessage(messageId: string) {
  const message = await prisma.lifecycleMessage.findUnique({
    where: { id: messageId },
    include: {
      enrollment: {
        select: {
          id: true,
          journeyId: true,
          currentStepId: true,
          status: true,
          exitReason: true,
          journey: { select: { status: true } },
        },
      },
    },
  });
  if (!message) throw new LifecycleValidationError("El mensaje no existe.");
  if (message.status !== "FAILED") {
    throw new LifecycleValidationError("Solo puedes reintentar un mensaje fallido.");
  }
  if (message.enrollment.currentStepId !== message.stepId) {
    throw new LifecycleValidationError("La inscripción ya avanzó a otro paso.");
  }
  if (message.enrollment.journey.status === "ARCHIVED") {
    throw new LifecycleValidationError("Reactiva el recorrido antes de reintentar el mensaje.");
  }
  if (
    message.enrollment.status !== "ACTIVE" &&
    !(
      message.enrollment.status === "SUPPRESSED" &&
      message.enrollment.exitReason === "MESSAGE_FAILED"
    )
  ) {
    throw new LifecycleValidationError("La inscripción no está disponible para un reintento.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.lifecycleMessage.update({
      where: { id: messageId },
      data: {
        status: "PENDING",
        error: null,
        metadata: { ...(message.metadata as Prisma.JsonObject), attempts: 0 },
      },
      select: { id: true, status: true, enrollment: { select: { journeyId: true } } },
    });
    await tx.lifecycleEnrollment.update({
      where: { id: message.enrollmentId },
      data: { status: "ACTIVE", nextRunAt: new Date(), exitReason: null, completedAt: null },
    });
    return updated;
  });
}

export async function getLifecycleJourneyMetrics(
  journeyId?: string,
): Promise<LifecycleJourneyMetrics> {
  const enrollmentWhere = journeyId ? { journeyId } : {};
  const messageWhere = journeyId ? { enrollment: { journeyId } } : {};
  const [enrollments, active, completed, exited, suppressed, sent, clicked, conversions, revenue] =
    await Promise.all([
      prisma.lifecycleEnrollment.count({ where: enrollmentWhere }),
      prisma.lifecycleEnrollment.count({ where: { ...enrollmentWhere, status: "ACTIVE" } }),
      prisma.lifecycleEnrollment.count({ where: { ...enrollmentWhere, status: "COMPLETED" } }),
      prisma.lifecycleEnrollment.count({ where: { ...enrollmentWhere, status: "EXITED" } }),
      prisma.lifecycleEnrollment.count({ where: { ...enrollmentWhere, status: "SUPPRESSED" } }),
      prisma.lifecycleMessage.count({ where: { ...messageWhere, status: "SENT" } }),
      prisma.lifecycleMessage.count({ where: { ...messageWhere, clickedAt: { not: null } } }),
      prisma.lifecycleMessage.count({ where: { ...messageWhere, convertedAt: { not: null } } }),
      prisma.lifecycleMessage.aggregate({
        where: { ...messageWhere, convertedAt: { not: null } },
        _sum: { revenueCents: true },
      }),
    ]);
  return {
    enrollments,
    active,
    completed,
    exited,
    suppressed,
    messagesSent: sent,
    messagesClicked: clicked,
    conversions,
    revenueCents: revenue._sum.revenueCents ?? 0,
    clickRate: sent > 0 ? clicked / sent : 0,
    conversionRate: sent > 0 ? conversions / sent : 0,
  };
}
