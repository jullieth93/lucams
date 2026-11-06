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
  CONTACT_SELECT,
  evaluateStepCondition,
  findEligibleContacts,
  getEnrollmentExitReason,
  hasAbandonedCart,
  hasDesignActivity,
  hasNewsletterOptIn,
  PAID_ORDER_STATUSES,
  type ContactBehavior,
  type EligibleContact,
} from "./eligibility";
import { nextAllowedAt, nextBogotaDay, nextStepRunAt, startOfBogotaDay } from "./schedule";
import { ensureLifecycleJourneySeeds } from "./seed";
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
    await prisma.lifecycleEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentStepId: nextStep.id,
        nextRunAt: nextStepRunAt(nextStep.delayMinutes, enrollment.journey, now),
        lastRunAt: now,
      },
    });
    return false;
  }
  await prisma.lifecycleEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "COMPLETED",
      completedAt: now,
      nextRunAt: cooldownAt(enrollment.journey, now),
      lastRunAt: now,
    },
  });
  return true;
}

async function sendStepMessage(
  enrollment: EnrollmentWithRelations,
  step: LifecycleJourneyStep,
  now: Date,
): Promise<"sent" | "suppressed" | "retry" | "skipped" | "failed"> {
  const email = enrollment.contact.primaryEmail;
  if (!email) return "skipped";
  const dedupKey = `${enrollment.id}:${step.id}:${enrollment.cycle}`;
  const initialMetadata = buildMessageMetadata(step, await getEmailOverrides("lifecycle-message"));
  if (step.commercial && !hasNewsletterOptIn(enrollment.contact)) {
    await prisma.lifecycleMessage.upsert({
      where: { dedupKey },
      update: {},
      create: {
        enrollmentId: enrollment.id,
        stepId: step.id,
        contactId: enrollment.contactId,
        dedupKey,
        status: "SUPPRESSED",
        subject: step.subject,
        ctaUrl: step.ctaPath,
        scheduledFor: now,
        error: "NO_OPT_IN",
        metadata: initialMetadata,
      },
    });
    return "suppressed";
  }

  const dailyCount = await prisma.lifecycleMessage.count({
    where: {
      contactId: enrollment.contactId,
      enrollment: { journeyId: enrollment.journeyId },
      sentAt: { gte: startOfBogotaDay(now) },
      status: "SENT",
    },
  });
  if (dailyCount >= enrollment.journey.maxMessagesPerDay) {
    await prisma.lifecycleEnrollment.update({
      where: { id: enrollment.id },
      data: { nextRunAt: nextAllowedAt(nextBogotaDay(now), enrollment.journey) },
    });
    return "retry";
  }

  const existing = await prisma.lifecycleMessage.findUnique({ where: { dedupKey } });
  const metadata: Prisma.InputJsonObject =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata
      : initialMetadata;
  if (existing?.status === "SENT" || existing?.status === "SUPPRESSED") return "skipped";
  if (existing?.status === "FAILED" && existing.error && existing.scheduledFor > now) {
    return "retry";
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
        ctaUrl: step.ctaPath,
        scheduledFor: now,
        metadata,
      },
    }));
  const siteUrl = await getSiteUrl();
  const publicToken = createLifecyclePublicToken(message.id);
  const ctaUrl = `${siteUrl}/j/${publicToken}`;
  const claimed = await prisma.lifecycleMessage.updateMany({
    where: {
      id: message.id,
      status: { in: ["PENDING", "FAILED"] },
      OR: [
        { error: null },
        { error: { not: "IN_FLIGHT" } },
        { updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
      ],
    },
    data: {
      publicTokenHash: hashBearerToken(publicToken),
      error: "IN_FLIGHT",
    },
  });
  if (claimed.count === 0) return "retry";

  const triggerData = enrollment.data as Record<string, unknown>;
  const productNames = [
    typeof triggerData.lastProductName === "string" ? triggerData.lastProductName : null,
  ].filter((value): value is string => Boolean(value));
  const rendered = await renderStoredLifecycleMessage({ ...message, ctaUrl }, step, {
    recipientName: enrollment.contact.displayName,
    productNames,
    unsubscribeUrl: step.commercial
      ? `${siteUrl}/unsubscribe?u=${encodeUnsubscribeParam(email)}`
      : undefined,
  });
  const result = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: dedupKey,
    commercial: step.commercial,
    headers: step.commercial ? buildCommercialEmailHeaders(email, siteUrl) : undefined,
    tags: [
      { name: "type", value: "lifecycle" },
      { name: "journey", value: enrollment.journey.key },
      { name: "message", value: message.id },
    ],
  });

  if (result.sent) {
    await prisma.lifecycleMessage.update({
      where: { id: message.id },
      data: { status: "SENT", resendId: result.id, sentAt: now, error: null },
    });
    return "sent";
  }
  if (result.reason === "suppressed") {
    await prisma.lifecycleMessage.update({
      where: { id: message.id },
      data: { status: "SUPPRESSED", error: result.reason },
    });
    return "suppressed";
  }

  const attempts =
    message.metadata &&
    typeof message.metadata === "object" &&
    !Array.isArray(message.metadata) &&
    typeof message.metadata.attempts === "number"
      ? message.metadata.attempts + 1
      : 1;
  const nextAttemptAt = new Date(now.getTime() + 30 * 60_000);
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
    await prisma.lifecycleEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "SUPPRESSED",
        exitReason: "MESSAGE_FAILED",
        completedAt: now,
        nextRunAt: cooldownAt(enrollment.journey, now),
      },
    });
    return "failed";
  }
  await prisma.lifecycleEnrollment.update({
    where: { id: enrollment.id },
    data: { nextRunAt: nextAttemptAt },
  });
  return "retry";
}

async function loadContactBehavior(contactIds: string[]): Promise<Map<string, ContactBehavior>> {
  const [paidOrders, deliveredOrders] = await Promise.all([
    prisma.order.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds }, status: { in: [...PAID_ORDER_STATUSES] } },
      _max: { createdAt: true },
    }),
    prisma.order.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds }, deliveredAt: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const paidByContact = new Map(paidOrders.map((order) => [order.contactId, order._max.createdAt]));
  const deliveredContacts = new Set(deliveredOrders.map((order) => order.contactId));
  return new Map(
    contactIds.map((contactId) => [
      contactId,
      {
        hasPaidOrder: paidByContact.has(contactId),
        lastPaidAt: paidByContact.get(contactId) ?? null,
        hasDeliveredOrder: deliveredContacts.has(contactId),
      },
    ]),
  );
}

async function exitEnrollment(
  enrollment: EnrollmentWithRelations,
  reason: string,
  now: Date,
): Promise<void> {
  await prisma.lifecycleEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "EXITED",
      exitReason: reason,
      completedAt: now,
      nextRunAt: cooldownAt(enrollment.journey, now),
      lastRunAt: now,
    },
  });
}

async function processEnrollment(
  enrollment: EnrollmentWithRelations,
  now: Date,
  behavior: ContactBehavior,
): Promise<"sent" | "suppressed" | "retry" | "completed" | "skipped" | "failed"> {
  const exitReason = getEnrollmentExitReason(
    enrollment.journey,
    enrollment.contact,
    behavior,
    enrollment.createdAt,
  );
  if (exitReason) {
    await exitEnrollment(enrollment, exitReason, now);
    return "completed";
  }

  const step = enrollment.journey.steps.find(
    (candidate) => candidate.id === enrollment.currentStepId,
  );
  if (!step) {
    await prisma.lifecycleEnrollment.update({
      where: { id: enrollment.id },
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
      behavior.lastPaidAt !== null && behavior.lastPaidAt > enrollment.createdAt,
  });
  if (!conditionMet) {
    const completed = await advanceEnrollment(enrollment, step, now);
    return completed ? "completed" : "skipped";
  }

  try {
    const outcome = await sendStepMessage(enrollment, step, now);
    if (outcome === "retry" || outcome === "failed") return outcome;
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
  const seenContacts = new Set<string>();
  let converted = 0;
  for (const message of clicked) {
    if (seenContacts.has(message.contactId)) continue;
    seenContacts.add(message.contactId);
    const order = await prisma.order.findFirst({
      where: {
        contactId: message.contactId,
        createdAt: { gte: message.clickedAt!, lte: now },
        status: { in: ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] },
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
  await ensureLifecycleJourneySeeds();
  const journeys = await prisma.lifecycleJourney.findMany({
    where: { status: "ACTIVE", ...(scope.journeyId ? { id: scope.journeyId } : {}) },
    include: { steps: { orderBy: { position: "asc" } } },
    orderBy: { key: "asc" },
  });

  const summary: LifecycleRunSummary = {
    journeys: journeys.length,
    enrollmentsCreated: 0,
    messagesSent: 0,
    messagesSuppressed: 0,
    messagesFailed: 0,
    enrollmentsCompleted: 0,
    enrollmentsExited: 0,
    errors: 0,
  };

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
      contact: { select: CONTACT_SELECT },
    },
    orderBy: { nextRunAt: "asc" },
    take: 500,
  });
  const enrollments = activeEnrollments as EnrollmentWithRelations[];
  const behavior = await loadContactBehavior(enrollments.map((enrollment) => enrollment.contactId));
  summary.enrollmentsExited += await processEnrollmentExits(enrollments, behavior, now);

  const dueEnrollments = enrollments
    .filter((enrollment) => enrollment.nextRunAt <= now)
    .slice(0, 100);
  for (const enrollment of dueEnrollments) {
    try {
      const outcome = await processEnrollment(enrollment, now, behavior.get(enrollment.contactId)!);
      if (outcome === "sent") summary.messagesSent += 1;
      if (outcome === "suppressed") summary.messagesSuppressed += 1;
      if (outcome === "failed") summary.messagesFailed += 1;
      if (outcome === "completed") summary.enrollmentsCompleted += 1;
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
