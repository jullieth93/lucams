import "server-only";

import {
  Prisma,
  type LifecycleEnrollment,
  type LifecycleJourney,
  type LifecycleJourneyStep,
} from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { hashBearerToken } from "@/lib/token-hash";
import { getSiteUrl } from "@/features/emails/layout";
import { getEmailOverrides } from "@/features/emails/overrides";
import { createLifecyclePublicToken } from "./attribution";
import { buildMessageMetadata, renderStoredLifecycleMessage } from "./messaging";
import {
  buildCommercialEmailHeaders,
  encodeUnsubscribeParam,
} from "@/features/newsletter/unsubscribe";
import {
  buildTriggerData,
  getLifecycleContactSelect,
  evaluateStepCondition,
  findEligibleContacts,
  getEnrollmentExitReason,
  hasAbandonedCart,
  hasDesignActivity,
  hasNewsletterOptIn,
  resolveLifecycleTargetPath,
  PAID_ORDER_STATUSES,
  type ContactBehavior,
  type EligibleContact,
} from "./eligibility";
import { nextAllowedAt, nextBogotaDay, nextStepRunAt, startOfBogotaDay } from "./schedule";
import { ensureLifecycleJourneySeeds } from "./seed";
import { getLifecycleSettings } from "./settings";
import { suppressLifecycleForEmails } from "./suppression";
import type { LifecycleRunScope, LifecycleRunSummary } from "./types";

type JourneyWithSteps = LifecycleJourney & { steps: LifecycleJourneyStep[] };
type EnrollmentWithRelations = LifecycleEnrollment & {
  journey: JourneyWithSteps;
  contact: EligibleContact;
};

const DAY_MS = 86_400_000;

function cooldownAt(journey: LifecycleJourney, now: Date): Date {
  return new Date(now.getTime() + journey.cooldownDays * DAY_MS);
}

async function advanceEnrollment(
  enrollment: EnrollmentWithRelations,
  step: LifecycleJourneyStep,
  now: Date,
): Promise<boolean> {
  const nextStep = enrollment.journey.steps.find((candidate) => candidate.position > step.position);
  if (nextStep) {
    await prisma.lifecycleEnrollment.updateMany({
      where: { id: enrollment.id, status: "ACTIVE" },
      data: {
        currentStepId: nextStep.id,
        nextRunAt: nextStepRunAt(nextStep.delayMinutes, enrollment.journey, now),
        lastRunAt: now,
      },
    });
    return false;
  }
  await prisma.lifecycleEnrollment.updateMany({
    where: { id: enrollment.id, status: "ACTIVE" },
    data: {
      status: "COMPLETED",
      completedAt: now,
      nextRunAt: cooldownAt(enrollment.journey, now),
      lastRunAt: now,
    },
  });
  return true;
}

type StepOutcome = "sent" | "suppressed" | "retry" | "skipped" | "failed" | "blocked" | "stopped";

function resolveTargetPath(
  enrollment: EnrollmentWithRelations,
  step: LifecycleJourneyStep,
): string {
  return resolveLifecycleTargetPath(enrollment.journey.trigger, step.ctaPath, enrollment.data);
}

async function ensureB2bFollowUpTask(
  enrollment: EnrollmentWithRelations,
  step: LifecycleJourneyStep,
  now: Date,
): Promise<boolean> {
  if (enrollment.journey.trigger !== "B2B_FOLLOW_UP") return false;
  const opportunity = enrollment.contact.opportunities[0];
  if (!opportunity || !["NEW", "QUALIFYING", "PROPOSAL_SENT"].includes(opportunity.stage)) {
    return false;
  }
  const dedupKey = `${enrollment.id}:${step.id}:${enrollment.cycle}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"lifecycle-task:" + dedupKey}))`;
    const existing = await tx.task.findFirst({
      where: { description: { contains: dedupKey } },
      select: { id: true },
    });
    if (existing) return false;
    const task = await tx.task.create({
      data: {
        title: `Seguir ${opportunity.number} · ${enrollment.journey.name} · paso ${step.position}`,
        description: `Seguimiento operativo creado por Lifecycle. Clave: ${dedupKey}`,
        status: "OPEN",
        priority: "HIGH",
        dueAt: now,
        ownerAdminId: opportunity.ownerAdminId,
        contactId: enrollment.contactId,
        opportunityId: opportunity.id,
      },
      select: { id: true },
    });
    await tx.contactActivity.create({
      data: {
        contactId: enrollment.contactId,
        kind: "SYSTEM",
        body: `Lifecycle creó la tarea ${task.id} para ${opportunity.number}.`,
        metadata: {
          source: "lifecycle",
          dedupKey,
          journeyId: enrollment.journeyId,
          enrollmentId: enrollment.id,
          stepId: step.id,
          opportunityId: opportunity.id,
          taskId: task.id,
        },
      },
    });
    return true;
  });
}

async function sendStepMessage(
  enrollment: EnrollmentWithRelations,
  step: LifecycleJourneyStep,
  now: Date,
  settings: { dryRun: boolean; maxMessagesPerDay: number },
): Promise<StepOutcome> {
  const email = enrollment.contact.primaryEmail;
  if (!email) return "skipped";
  const dedupKey = `${enrollment.id}:${step.id}:${enrollment.cycle}`;
  const targetPath = resolveTargetPath(enrollment, step);
  const initialMetadata = {
    ...buildMessageMetadata(step, await getEmailOverrides("lifecycle-message")),
    targetPath,
    recipientName: enrollment.contact.displayName ?? "",
  };
  const existing = await prisma.lifecycleMessage.findUnique({ where: { dedupKey } });
  const metadata: Prisma.InputJsonObject =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata
      : initialMetadata;
  const commercial =
    typeof metadata.commercial === "boolean" ? metadata.commercial : step.commercial;
  if (existing && ["SENT", "SUPPRESSED", "CANCELLED"].includes(existing.status)) return "skipped";
  if (existing?.status === "FAILED" && existing.error && existing.scheduledFor > now) {
    return "retry";
  }

  if (commercial && !hasNewsletterOptIn(enrollment.contact)) {
    await prisma.lifecycleMessage.upsert({
      where: { dedupKey },
      update: { status: "SUPPRESSED", error: "NO_OPT_IN" },
      create: {
        enrollmentId: enrollment.id,
        stepId: step.id,
        contactId: enrollment.contactId,
        dedupKey,
        status: "SUPPRESSED",
        subject: step.subject,
        ctaUrl: targetPath,
        scheduledFor: now,
        error: "NO_OPT_IN",
        metadata: initialMetadata,
      },
    });
    return "suppressed";
  }

  const suppression = await prisma.emailEvent.findFirst({
    where: { to: email, type: { in: ["email.bounced", "email.complained"] } },
    select: { type: true },
  });
  if (suppression) {
    const reason = suppression.type === "email.complained" ? "EMAIL_COMPLAINED" : "EMAIL_BOUNCED";
    await prisma.lifecycleMessage.upsert({
      where: { dedupKey },
      update: { status: "SUPPRESSED", error: reason },
      create: {
        enrollmentId: enrollment.id,
        stepId: step.id,
        contactId: enrollment.contactId,
        dedupKey,
        status: "SUPPRESSED",
        subject: step.subject,
        ctaUrl: targetPath,
        scheduledFor: now,
        error: reason,
        metadata: initialMetadata,
      },
    });
    await suppressLifecycleForEmails([email], reason, now);
    return "stopped";
  }

  if (settings.dryRun) {
    await prisma.lifecycleMessage.upsert({
      where: { dedupKey },
      update: { status: "SUPPRESSED", error: "DRY_RUN" },
      create: {
        enrollmentId: enrollment.id,
        stepId: step.id,
        contactId: enrollment.contactId,
        dedupKey,
        status: "SUPPRESSED",
        subject: step.subject,
        ctaUrl: targetPath,
        scheduledFor: now,
        error: "DRY_RUN",
        metadata: initialMetadata,
      },
    });
    return "suppressed";
  }

  const message =
    existing ??
    (await prisma.lifecycleMessage.create({
      data: {
        enrollmentId: enrollment.id,
        stepId: step.id,
        contactId: enrollment.contactId,
        dedupKey,
        subject: step.subject,
        ctaUrl: targetPath,
        scheduledFor: now,
        metadata,
      },
    }));
  const publicToken = createLifecyclePublicToken(message.id);
  const staleClaimAt = new Date(now.getTime() - 5 * 60_000);
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"lifecycle-daily:" + enrollment.contactId}))`;
    const reservedWhere: Prisma.LifecycleMessageWhereInput = {
      contactId: enrollment.contactId,
      OR: [
        { status: "SENT", sentAt: { gte: startOfBogotaDay(now) } },
        { error: "IN_FLIGHT", updatedAt: { gte: staleClaimAt } },
      ],
    };
    const [journeyCount, globalCount] = await Promise.all([
      tx.lifecycleMessage.count({
        where: { AND: [reservedWhere, { enrollment: { journeyId: enrollment.journeyId } }] },
      }),
      tx.lifecycleMessage.count({ where: reservedWhere }),
    ]);
    if (
      journeyCount >= enrollment.journey.maxMessagesPerDay ||
      globalCount >= settings.maxMessagesPerDay
    ) {
      await tx.lifecycleEnrollment.updateMany({
        where: { id: enrollment.id, status: "ACTIVE" },
        data: { nextRunAt: nextAllowedAt(nextBogotaDay(now), enrollment.journey) },
      });
      return "deferred" as const;
    }
    const claimed = await tx.lifecycleMessage.updateMany({
      where: {
        id: message.id,
        status: { in: ["PENDING", "FAILED"] },
        OR: [{ error: null }, { error: { not: "IN_FLIGHT" } }, { updatedAt: { lt: staleClaimAt } }],
      },
      data: { publicTokenHash: hashBearerToken(publicToken), error: "IN_FLIGHT" },
    });
    return claimed.count === 1 ? ("claimed" as const) : ("busy" as const);
  });
  if (claim !== "claimed") return "retry";

  const siteUrl = await getSiteUrl();
  const ctaUrl = `${siteUrl}/j/${publicToken}`;
  const triggerData = enrollment.data as Record<string, unknown>;
  const productNames = [
    typeof triggerData.lastProductName === "string" ? triggerData.lastProductName : null,
  ].filter((value): value is string => Boolean(value));
  const rendered = await renderStoredLifecycleMessage({ ...message, ctaUrl }, step, {
    recipientName: enrollment.contact.displayName,
    productNames,
    unsubscribeUrl: commercial
      ? `${siteUrl}/unsubscribe?u=${encodeUnsubscribeParam(email)}`
      : undefined,
  });
  const result = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: dedupKey,
    commercial,
    headers: commercial ? buildCommercialEmailHeaders(email, siteUrl) : undefined,
    tags: [
      { name: "type", value: "lifecycle" },
      { name: "journey", value: enrollment.journey.key },
      { name: "message", value: message.id },
    ],
  });

  if (result.sent) {
    await prisma.lifecycleMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        resendId: result.id,
        sentAt: now,
        error: null,
        subject: rendered.subject,
      },
    });
    return "sent";
  }
  if (result.reason === "suppressed") {
    await prisma.lifecycleMessage.update({
      where: { id: message.id },
      data: { status: "SUPPRESSED", error: "EMAIL_SUPPRESSED" },
    });
    await suppressLifecycleForEmails([email], "EMAIL_SUPPRESSED", now);
    return "stopped";
  }

  const nextAttemptAt = new Date(now.getTime() + 30 * 60_000);
  if (result.reason === "circuit-open") {
    await prisma.lifecycleMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", error: result.reason, scheduledFor: nextAttemptAt },
    });
    await prisma.lifecycleEnrollment.updateMany({
      where: { id: enrollment.id, status: "ACTIVE" },
      data: { nextRunAt: nextAttemptAt },
    });
    return "blocked";
  }

  const attempts =
    message.metadata &&
    typeof message.metadata === "object" &&
    !Array.isArray(message.metadata) &&
    typeof message.metadata.attempts === "number"
      ? message.metadata.attempts + 1
      : 1;
  await prisma.lifecycleMessage.update({
    where: { id: message.id },
    data: {
      status: "FAILED",
      error: result.reason.slice(0, 500),
      scheduledFor: nextAttemptAt,
      metadata: { ...metadata, attempts },
    },
  });
  if (attempts >= 5) {
    await prisma.lifecycleEnrollment.updateMany({
      where: { id: enrollment.id, status: "ACTIVE" },
      data: {
        status: "SUPPRESSED",
        exitReason: "MESSAGE_FAILED",
        completedAt: now,
        nextRunAt: cooldownAt(enrollment.journey, now),
      },
    });
    return "failed";
  }
  await prisma.lifecycleEnrollment.updateMany({
    where: { id: enrollment.id, status: "ACTIVE" },
    data: { nextRunAt: nextAttemptAt },
  });
  return "retry";
}

async function loadContactBehavior(contactIds: string[]): Promise<Map<string, ContactBehavior>> {
  const uniqueIds = [...new Set(contactIds)];
  const [latestPaidOrders, paidCounts, deliveredOrders] = await Promise.all([
    prisma.order.findMany({
      where: {
        contactId: { in: uniqueIds },
        status: { in: [...PAID_ORDER_STATUSES] },
        deletedAt: null,
      },
      distinct: ["contactId"],
      orderBy: { createdAt: "desc" },
      select: { id: true, contactId: true, createdAt: true },
    }),
    prisma.order.groupBy({
      by: ["contactId"],
      where: {
        contactId: { in: uniqueIds },
        status: { in: [...PAID_ORDER_STATUSES] },
        deletedAt: null,
      },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["contactId"],
      where: { contactId: { in: uniqueIds }, deliveredAt: { not: null }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const latestByContact = new Map(latestPaidOrders.map((order) => [order.contactId, order]));
  const countByContact = new Map(paidCounts.map((order) => [order.contactId, order._count._all]));
  const deliveredContacts = new Set(deliveredOrders.map((order) => order.contactId));
  return new Map(
    uniqueIds.map((contactId) => {
      const latest = latestByContact.get(contactId);
      const paidOrderCount = countByContact.get(contactId) ?? 0;
      return [
        contactId,
        {
          hasPaidOrder: paidOrderCount > 0,
          paidOrderCount,
          lastPaidAt: latest?.createdAt ?? null,
          lastPaidOrderId: latest?.id ?? null,
          hasDeliveredOrder: deliveredContacts.has(contactId),
        },
      ];
    }),
  );
}

async function exitEnrollment(
  enrollment: EnrollmentWithRelations,
  reason: string,
  now: Date,
): Promise<void> {
  const updated = await prisma.lifecycleEnrollment.updateMany({
    where: { id: enrollment.id, status: "ACTIVE" },
    data: {
      status: "EXITED",
      exitReason: reason,
      completedAt: now,
      nextRunAt: cooldownAt(enrollment.journey, now),
      lastRunAt: now,
    },
  });
  if (updated.count === 1) enrollment.status = "EXITED";
}

type ProcessOutcome =
  "sent" | "suppressed" | "retry" | "completed" | "exited" | "skipped" | "failed" | "blocked";

async function processEnrollment(
  enrollment: EnrollmentWithRelations,
  now: Date,
  behavior: ContactBehavior,
  settings: { dryRun: boolean; maxMessagesPerDay: number },
  summary: LifecycleRunSummary,
): Promise<ProcessOutcome> {
  const exitReason = getEnrollmentExitReason(
    enrollment.journey,
    enrollment.contact,
    behavior,
    enrollment.triggerRef,
    enrollment.createdAt,
  );
  if (exitReason) {
    await exitEnrollment(enrollment, exitReason, now);
    return "exited";
  }

  const step = enrollment.journey.steps.find(
    (candidate) => candidate.id === enrollment.currentStepId,
  );
  if (!step) {
    await prisma.lifecycleEnrollment.updateMany({
      where: { id: enrollment.id, status: "ACTIVE" },
      data: {
        status: "COMPLETED",
        completedAt: now,
        nextRunAt: cooldownAt(enrollment.journey, now),
      },
    });
    return "completed";
  }

  const conditionMet = evaluateStepCondition(step.condition, {
    hasPaidOrder: behavior.hasPaidOrder,
    hasAbandonedCart: hasAbandonedCart(enrollment.contact),
    loyaltyPoints: enrollment.contact.customer?.loyaltyPoints ?? 0,
    hasDesignActivity: hasDesignActivity(enrollment.contact),
    hasOptIn: hasNewsletterOptIn(enrollment.contact),
    orderDelivered: behavior.hasDeliveredOrder,
    orderSinceEnrollment:
      behavior.lastPaidOrderId !== null &&
      (["SECOND_PURCHASE", "REACTIVATION"].includes(enrollment.journey.trigger) &&
      enrollment.triggerRef
        ? behavior.lastPaidOrderId !== enrollment.triggerRef
        : behavior.lastPaidAt! > enrollment.createdAt),
  });
  if (!conditionMet) {
    const completed = await advanceEnrollment(enrollment, step, now);
    return completed ? "completed" : "skipped";
  }

  try {
    if (!settings.dryRun && (await ensureB2bFollowUpTask(enrollment, step, now))) {
      summary.tasksCreated += 1;
    }
    const outcome = await sendStepMessage(enrollment, step, now, settings);
    if (outcome === "stopped") return "suppressed";
    if (outcome === "retry" || outcome === "failed" || outcome === "blocked") return outcome;
    const completed = await advanceEnrollment(enrollment, step, now);
    return completed && outcome !== "sent" && outcome !== "suppressed" ? "completed" : outcome;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "retry";
    }
    throw error;
  }
}

async function enrollEligibleContacts(
  journey: JourneyWithSteps,
  now: Date,
  contactIds?: string[],
): Promise<number> {
  const eligible = await findEligibleContacts(journey, now, { limit: 100, contactIds });
  let created = 0;
  for (const contact of eligible.items) {
    const lockKey = `${journey.id}:${contact.id}`;
    try {
      const createdEnrollment = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const active = await tx.lifecycleEnrollment.findFirst({
          where: { journeyId: journey.id, contactId: contact.id, status: "ACTIVE" },
          select: { id: true },
        });
        if (active) return null;
        const latest = await tx.lifecycleEnrollment.findFirst({
          where: { journeyId: journey.id, contactId: contact.id },
          orderBy: { cycle: "desc" },
          select: { cycle: true, status: true, nextRunAt: true, exitReason: true },
        });
        if (latest?.status === "SUPPRESSED") return null;
        if (latest?.status === "EXITED" && latest.exitReason === "ADMIN_EXIT") return null;
        if (latest && latest.nextRunAt > now) return null;
        const firstStep = journey.steps[0];
        if (!firstStep) return null;
        return tx.lifecycleEnrollment.create({
          data: {
            journeyId: journey.id,
            contactId: contact.id,
            cycle: latest ? latest.cycle + 1 : 1,
            currentStepId: firstStep.id,
            nextRunAt: nextStepRunAt(firstStep.delayMinutes, journey, now),
            triggerRef: contact.orders[0]?.id ?? contact.opportunities[0]?.id,
            data: buildTriggerData(contact),
          },
        });
      });
      if (createdEnrollment) created += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
    }
  }
  return created;
}

async function processEnrollmentExits(
  enrollments: EnrollmentWithRelations[],
  behavior: Map<string, ContactBehavior>,
  now: Date,
): Promise<number> {
  let exited = 0;
  for (const enrollment of enrollments) {
    const reason = getEnrollmentExitReason(
      enrollment.journey,
      enrollment.contact,
      behavior.get(enrollment.contactId)!,
      enrollment.triggerRef,
      enrollment.createdAt,
    );
    if (!reason) continue;
    await exitEnrollment(enrollment, reason, now);
    exited += 1;
  }
  return exited;
}

export async function attributeLifecycleConversions(
  now = new Date(),
  contactIds?: string[],
): Promise<number> {
  const clicked = await prisma.lifecycleMessage.findMany({
    where: {
      clickedAt: { not: null, gte: new Date(now.getTime() - 30 * DAY_MS) },
      convertedAt: null,
      status: "SENT",
      ...(contactIds ? { contactId: { in: contactIds } } : {}),
    },
    select: { id: true, contactId: true, clickedAt: true },
    orderBy: { clickedAt: "desc" },
    take: 200,
  });
  let converted = 0;
  for (const message of clicked) {
    const clickedAt = message.clickedAt!;
    const order = await prisma.order.findFirst({
      where: {
        contactId: message.contactId,
        createdAt: { gte: clickedAt, lte: now },
        status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, total: true },
    });
    if (!order) continue;
    const attributed = await prisma.lifecycleMessage.findUnique({
      where: { convertedOrderId: order.id },
      select: { id: true },
    });
    if (attributed) continue;
    try {
      const claimed = await prisma.lifecycleMessage.updateMany({
        where: { id: message.id, convertedAt: null },
        data: {
          convertedAt: order.createdAt,
          convertedOrderId: order.id,
          revenueCents: order.total,
        },
      });
      if (claimed.count > 0) converted += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
    }
  }
  return converted;
}

export async function runLifecycleCycle(
  now = new Date(),
  scope: LifecycleRunScope = {},
): Promise<LifecycleRunSummary> {
  const settings = await getLifecycleSettings();
  const summary: LifecycleRunSummary = {
    journeys: 0,
    enrollmentsCreated: 0,
    messagesSent: 0,
    messagesSuppressed: 0,
    messagesFailed: 0,
    messagesDeferred: 0,
    tasksCreated: 0,
    enrollmentsCompleted: 0,
    enrollmentsExited: 0,
    errors: 0,
    dryRun: settings.dryRun,
  };
  if (!settings.enabled) {
    logger.info({ event: "lifecycle.cycle", ...summary });
    return summary;
  }

  await ensureLifecycleJourneySeeds();
  const journeys = await prisma.lifecycleJourney.findMany({
    where: { status: "ACTIVE", ...(scope.journeyId ? { id: scope.journeyId } : {}) },
    include: { steps: { orderBy: { position: "asc" } } },
    orderBy: { key: "asc" },
  });
  summary.journeys = journeys.length;

  for (const journey of journeys) {
    try {
      summary.enrollmentsCreated += await enrollEligibleContacts(journey, now, scope.contactIds);
    } catch (error) {
      summary.errors += 1;
      logger.error({
        event: "lifecycle.enroll.fail",
        journeyKey: journey.key,
        code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "UNKNOWN",
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const activeEnrollments = await prisma.lifecycleEnrollment.findMany({
    where: {
      status: "ACTIVE",
      journey: { status: "ACTIVE", ...(scope.journeyId ? { id: scope.journeyId } : {}) },
      ...(scope.contactIds ? { contactId: { in: scope.contactIds } } : {}),
    },
    include: {
      journey: { include: { steps: { orderBy: { position: "asc" } } } },
      contact: { select: getLifecycleContactSelect(now) },
    },
    orderBy: { nextRunAt: "asc" },
    take: 500,
  });
  const enrollments = activeEnrollments as EnrollmentWithRelations[];
  const behavior = await loadContactBehavior(enrollments.map((enrollment) => enrollment.contactId));
  summary.enrollmentsExited += await processEnrollmentExits(enrollments, behavior, now);

  const dueEnrollments = enrollments
    .filter((enrollment) => enrollment.status === "ACTIVE" && enrollment.nextRunAt <= now)
    .slice(0, 100);
  const stopNewWorkAt = Date.now() + 30_000;
  for (const [index, enrollment] of dueEnrollments.entries()) {
    if (Date.now() >= stopNewWorkAt) {
      summary.messagesDeferred += dueEnrollments.length - index;
      break;
    }
    try {
      const outcome = await processEnrollment(
        enrollment,
        now,
        behavior.get(enrollment.contactId)!,
        settings,
        summary,
      );
      if (outcome === "sent") summary.messagesSent += 1;
      if (outcome === "suppressed") summary.messagesSuppressed += 1;
      if (outcome === "failed") summary.messagesFailed += 1;
      if (outcome === "completed") summary.enrollmentsCompleted += 1;
      if (outcome === "exited") summary.enrollmentsExited += 1;
      if (outcome === "blocked") {
        summary.messagesDeferred += dueEnrollments.length - index;
        break;
      }
    } catch (error) {
      summary.errors += 1;
      logger.error({
        event: "lifecycle.step.fail",
        enrollmentId: enrollment.id,
        code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "UNKNOWN",
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await attributeLifecycleConversions(now, scope.contactIds);
  logger.info({ event: "lifecycle.cycle", ...summary });
  return summary;
}
