import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifecycleStepCondition, LifecycleTrigger } from "@lucams/db";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import { mergeContactsByHumanApproval } from "@/features/identity/merge-service";
import { NEWSLETTER_PRIVACY_VERSION } from "@/features/newsletter/service";
import { computeUnsubscribeToken, unsubscribeNewsletter } from "@/features/newsletter/unsubscribe";
import { saveLifecycleSettings } from "./settings";
import { resolveLifecycleClick } from "./attribution";
import {
  getLifecycleJourneyMetrics,
  previewLifecycleAudience,
  retryLifecycleMessage,
  setEnrollmentStatus,
} from "./admin-service";
import { runLifecycleCycle } from "./runner";

vi.mock("@/lib/resend", () => ({
  sendEmail: vi.fn(),
}));

const sendEmailMock = vi.mocked(sendEmail);
const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `lifecycle_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function createContact(optIn: boolean) {
  const contact = await prisma.contact.create({
    data: {
      primaryEmail: `${RUN}-${crypto.randomUUID()}@lucams.test`,
      displayName: "Contacto Lifecycle",
    },
  });
  if (optIn) {
    await prisma.consent.create({
      data: {
        contactId: contact.id,
        email: contact.primaryEmail,
        scope: "NEWSLETTER",
        accepted: true,
        version: NEWSLETTER_PRIVACY_VERSION,
      },
    });
  }
  return contact;
}

async function createOrder(contactId: string, status: "DELIVERED" | "PAID" = "DELIVERED") {
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    select: { primaryEmail: true },
  });
  return prisma.order.create({
    data: {
      number: `LCM-${RUN.replace(/\D/g, "").slice(-12)}-${crypto.randomUUID().slice(0, 8)}`,
      contactId,
      email: contact.primaryEmail!,
      phone: "3000000000",
      shippingAddress: { city: "Bogotá" },
      subtotal: 123_000,
      shipping: 0,
      total: 123_000,
      status,
      paymentMethod: "WOMPI",
      deliveredAt: status === "DELIVERED" ? new Date() : null,
    },
  });
}

async function createJourney(trigger: LifecycleTrigger, commercial = true) {
  const steps = [
    {
      position: 1,
      delayMinutes: 0,
      subject: "Asunto de prueba",
      heading: "Titular de prueba",
      preheader: "Preheader de prueba",
      body: "Hola {nombre}. Este es un paso de prueba.",
      ctaLabel: "Explorar",
      ctaPath: "/recomendador",
      commercial,
      condition: (trigger === "FIRST_PURCHASE"
        ? "NO_PAID_ORDER"
        : "ALWAYS") as LifecycleStepCondition,
    },
    {
      position: 2,
      delayMinutes: 10080,
      subject: "Segundo paso de prueba",
      heading: "Segundo paso de prueba",
      preheader: "Segundo paso de prueba",
      body: "Hola {nombre}. Este es un paso posterior.",
      ctaLabel: "Explorar",
      ctaPath: "/productos",
      commercial: true,
      condition: "ALWAYS" as const,
    },
  ];
  return prisma.lifecycleJourney.create({
    data: {
      key: `${RUN}-${trigger}-${commercial ? "commercial" : "transactional"}-${crypto.randomUUID()}`,
      name: "Recorrido de prueba",
      description: "Recorrido de prueba para validar el motor.",
      trigger,
      status: "ACTIVE",
      requireOptIn: false,
      maxMessagesPerDay: 2,
      quietStartHour: 20,
      quietEndHour: 8,
      steps: { create: steps },
    },
  });
}

async function runCleanCycle(journeyId: string, contactIds: string[]) {
  const summary = await runLifecycleCycle(undefined, { journeyId, contactIds });
  expect(summary.errors).toBe(0);
  return summary;
}

async function cleanFixtures() {
  await prisma.emailEvent.deleteMany({ where: { resendId: { startsWith: RUN } } });
  await prisma.task.deleteMany({
    where: { OR: [{ description: { contains: RUN } }, { title: { contains: RUN } }] },
  });
  await prisma.contactActivity.deleteMany({ where: { body: { contains: RUN } } });
  await prisma.cart.deleteMany({ where: { sessionId: { startsWith: RUN } } });
  await prisma.lifecycleJourney.deleteMany({ where: { key: { startsWith: RUN } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: RUN } } });
  await prisma.order.deleteMany({ where: { email: { startsWith: RUN } } });
  await prisma.consent.deleteMany({ where: { email: { startsWith: RUN } } });
  await prisma.contact.deleteMany({ where: { primaryEmail: { startsWith: RUN } } });
}

describe.skipIf(!hasDb)("lifecycle runner — integración PostgreSQL", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await cleanFixtures();
    await saveLifecycleSettings({ enabled: true, maxMessagesPerDay: 2 }, "admin-test");
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ sent: true, id: `resend-${RUN}` });
  });

  afterAll(async () => {
    await cleanFixtures();
    await saveLifecycleSettings({ enabled: true, maxMessagesPerDay: 2 }, "admin-test");
  });

  it("inscribe, envía sin duplicar, atribuye conversión y cierra por compra", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");

    const first = await runCleanCycle(journey.id, [contact.id]);
    expect(first.enrollmentsCreated).toBeGreaterThanOrEqual(1);
    expect(first.messagesSent).toBeGreaterThanOrEqual(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const enrollment = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: journey.id, contactId: contact.id },
    });
    const message = await prisma.lifecycleMessage.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    });
    expect(message.status).toBe("SENT");
    expect(message.publicTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(message.ctaUrl).toBe("/recomendador");
    expect(message.ctaUrl).not.toContain("/j/");
    expect(message.metadata).toMatchObject({ targetPath: "/recomendador" });

    const second = await runCleanCycle(journey.id, [contact.id]);
    expect(second.messagesSent).toBe(0);
    expect(await prisma.lifecycleMessage.count({ where: { enrollmentId: enrollment.id } })).toBe(1);

    const html = sendEmailMock.mock.calls[0][0].html;
    const token = html.match(/\/j\/([A-Za-z0-9_-]{32})/)?.[1];
    expect(token).toBeTruthy();
    expect(await resolveLifecycleClick(token!)).toBe("/recomendador");

    const order = await createOrder(contact.id, "PAID");
    await runCleanCycle(journey.id, [contact.id]);
    const converted = await prisma.lifecycleMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(converted.convertedAt).not.toBeNull();
    expect(converted.revenueCents).toBe(order.total);
    expect(
      await prisma.lifecycleEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } }),
    ).toMatchObject({
      status: "EXITED",
      exitReason: "ORDER_PAID",
    });
  });

  it("suprime un mensaje comercial cuando no hay consentimiento vigente", async () => {
    const contact = await createContact(false);
    const journey = await createJourney("FIRST_PURCHASE", true);

    await runCleanCycle(journey.id, [contact.id]);
    expect(sendEmailMock).not.toHaveBeenCalled();
    const enrollment = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: journey.id, contactId: contact.id },
    });
    expect(enrollment.status).toBe("ACTIVE");
    expect(
      (await previewLifecycleAudience(journey.id)).sample.map((member) => member.contactId),
    ).not.toContain(contact.id);
    const message = await prisma.lifecycleMessage.findFirstOrThrow({
      where: { contactId: contact.id, enrollment: { journeyId: journey.id } },
    });
    expect(message.status).toBe("SUPPRESSED");
  });

  it("permite cuidado transaccional tras entrega sin opt-in", async () => {
    const contact = await createContact(false);
    await createOrder(contact.id, "DELIVERED");
    const journey = await createJourney("SECOND_PURCHASE", false);

    await runCleanCycle(journey.id, [contact.id]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const message = await prisma.lifecycleMessage.findFirstOrThrow({
      where: { contactId: contact.id, enrollment: { journeyId: journey.id } },
    });
    expect(message.status).toBe("SENT");
  });

  it("reintenta el mismo mensaje sin cambiar token ni duplicar y respeta salidas manuales", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");
    sendEmailMock.mockResolvedValueOnce({ sent: false, reason: "timeout", status: 503 });

    await runCleanCycle(journey.id, [contact.id]);
    const enrollment = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: journey.id, contactId: contact.id },
    });
    const failed = await prisma.lifecycleMessage.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    });
    expect(failed).toMatchObject({ status: "FAILED", metadata: { attempts: 1 } });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const firstToken = sendEmailMock.mock.calls[0][0].html.match(/\/j\/([A-Za-z0-9_-]{32})/)?.[1];
    expect(firstToken).toBeTruthy();
    await prisma.lifecycleJourneyStep.update({
      where: { id: failed.stepId },
      data: { body: "Texto cambiado posteriormente" },
    });

    await retryLifecycleMessage(failed.id);
    await runCleanCycle(journey.id, [contact.id]);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const messages = await prisma.lifecycleMessage.findMany({
      where: { enrollmentId: enrollment.id },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: failed.id,
      dedupKey: failed.dedupKey,
      publicTokenHash: failed.publicTokenHash,
      status: "SENT",
    });
    const secondHtml = sendEmailMock.mock.calls[1][0].html;
    expect(secondHtml).toContain("Este es un paso de prueba.");
    expect(secondHtml).not.toContain("Texto cambiado posteriormente");
    const secondToken = secondHtml.match(/\/j\/([A-Za-z0-9_-]{32})/)?.[1];
    expect(secondToken).toBe(firstToken);

    await setEnrollmentStatus(enrollment.id, "pause");
    await runCleanCycle(journey.id, [contact.id]);
    expect(await prisma.lifecycleEnrollment.count({ where: { journeyId: journey.id } })).toBe(1);
    await setEnrollmentStatus(enrollment.id, "resume");
    await setEnrollmentStatus(enrollment.id, "exit");
    await runCleanCycle(journey.id, [contact.id]);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(await prisma.lifecycleEnrollment.count({ where: { journeyId: journey.id } })).toBe(1);
  });

  it("no procesa inscripciones cuando el recorrido está pausado y cierra contactos eliminados", async () => {
    const contact = await createContact(false);
    await createOrder(contact.id, "DELIVERED");
    const journey = await createJourney("SECOND_PURCHASE", false);
    const firstStep = await prisma.lifecycleJourneyStep.findFirstOrThrow({
      where: { journeyId: journey.id, position: 1 },
    });
    await prisma.lifecycleJourney.update({ where: { id: journey.id }, data: { status: "PAUSED" } });
    const enrollment = await prisma.lifecycleEnrollment.create({
      data: {
        journeyId: journey.id,
        contactId: contact.id,
        currentStepId: firstStep.id,
        nextRunAt: new Date(Date.now() - 1000),
      },
    });

    await runCleanCycle(journey.id, [contact.id]);
    expect(sendEmailMock).not.toHaveBeenCalled();
    await prisma.lifecycleJourney.update({ where: { id: journey.id }, data: { status: "ACTIVE" } });
    await runCleanCycle(journey.id, [contact.id]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    await prisma.contact.update({ where: { id: contact.id }, data: { deletedAt: new Date() } });
    await runCleanCycle(journey.id, [contact.id]);
    expect(
      await prisma.lifecycleEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } }),
    ).toMatchObject({ status: "EXITED", exitReason: "CONTACT_INACTIVE" });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("respeta revocación y nueva aceptación del consentimiento", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");
    await prisma.lifecycleJourney.update({
      where: { id: journey.id },
      data: { requireOptIn: true },
    });
    const accepted = await prisma.consent.findFirstOrThrow({ where: { contactId: contact.id } });
    const revoked = await prisma.consent.create({
      data: {
        contactId: contact.id,
        email: contact.primaryEmail,
        scope: "NEWSLETTER",
        accepted: false,
        version: NEWSLETTER_PRIVACY_VERSION,
        revokesId: accepted.id,
      },
    });

    expect(
      (await previewLifecycleAudience(journey.id)).sample.map((member) => member.contactId),
    ).not.toContain(contact.id);
    await runCleanCycle(journey.id, [contact.id]);
    expect(await prisma.lifecycleEnrollment.count({ where: { journeyId: journey.id } })).toBe(0);

    await prisma.consent.create({
      data: {
        contactId: contact.id,
        email: contact.primaryEmail,
        scope: "NEWSLETTER",
        accepted: true,
        version: NEWSLETTER_PRIVACY_VERSION,
        revokesId: revoked.id,
      },
    });
    expect(
      (await previewLifecycleAudience(journey.id)).sample.map((member) => member.contactId),
    ).toContain(contact.id);
    await runCleanCycle(journey.id, [contact.id]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("atribuye una orden una sola vez al último clic dentro de la ventana", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("SECOND_PURCHASE");
    const step = await prisma.lifecycleJourneyStep.findFirstOrThrow({
      where: { journeyId: journey.id, position: 1 },
    });
    const enrollment = await prisma.lifecycleEnrollment.create({
      data: {
        journeyId: journey.id,
        contactId: contact.id,
        currentStepId: step.id,
        nextRunAt: new Date(Date.now() + 86_400_000),
      },
    });
    for (const [index, minutes] of [60, 30].entries()) {
      await prisma.lifecycleMessage.create({
        data: {
          enrollmentId: enrollment.id,
          stepId: step.id,
          contactId: contact.id,
          dedupKey: `${RUN}-attribution-${index}`,
          subject: "Mensaje atribuible",
          ctaUrl: "/productos",
          scheduledFor: new Date(Date.now() - 2 * 3_600_000),
          sentAt: new Date(Date.now() - 2 * 3_600_000),
          clickedAt: new Date(Date.now() - minutes * 60_000),
          status: "SENT",
          metadata: { targetPath: "/productos" },
        },
      });
    }
    const order = await createOrder(contact.id, "PAID");
    await runCleanCycle(journey.id, [contact.id]);
    await runCleanCycle(journey.id, [contact.id]);

    const messages = await prisma.lifecycleMessage.findMany({
      where: { enrollmentId: enrollment.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages[0]?.convertedOrderId).toBeNull();
    expect(messages[1]?.convertedOrderId).toBe(order.id);
    const metrics = await getLifecycleJourneyMetrics(journey.id);
    expect(metrics.conversions).toBe(1);
    expect(metrics.revenueCents).toBe(order.total);
  });

  it("no trata una compra reembolsada como si nunca hubiera existido", async () => {
    const contact = await createContact(true);
    const order = await createOrder(contact.id, "PAID");
    await prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    const journey = await createJourney("FIRST_PURCHASE");

    await runCleanCycle(journey.id, [contact.id]);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await prisma.lifecycleEnrollment.count({ where: { journeyId: journey.id } })).toBe(0);
  });

  it("aplica el límite diario por contacto y no globalmente", async () => {
    const firstContact = await createContact(true);
    const secondContact = await createContact(false);
    const journey = await createJourney("FIRST_PURCHASE", false);
    await prisma.lifecycleJourney.update({
      where: { id: journey.id },
      data: { maxMessagesPerDay: 1 },
    });

    await runCleanCycle(journey.id, [firstContact.id, secondContact.id]);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(
      await prisma.lifecycleMessage.count({
        where: { enrollment: { journeyId: journey.id }, status: "SENT" },
      }),
    ).toBe(2);
  });

  it("conserva una sola inscripción al fusionar contactos", async () => {
    const survivor = await createContact(true);
    const absorbed = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");
    await runCleanCycle(journey.id, [absorbed.id]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const enrollment = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: journey.id, contactId: absorbed.id },
    });
    const actor = await prisma.adminUser.create({
      data: {
        supabaseUserId: crypto.randomUUID(),
        email: `${RUN}-merge-admin@lucams.test`,
        role: "SUPERADMIN",
      },
    });
    const candidate = await prisma.identityMergeCandidate.create({
      data: {
        primaryContactId: survivor.id,
        secondaryContactId: absorbed.id,
        reasonCode: "SAME_BUYER_PHONE_E164",
        reasonCodes: ["SAME_BUYER_PHONE_E164"],
        evidenceJson: { synthetic: true },
      },
    });

    const merged = await mergeContactsByHumanApproval({
      candidateId: candidate.id,
      survivorContactId: survivor.id,
      actorAdminId: actor.id,
      note: "Validación de recorrido en fusión.",
    });
    expect(merged.movedCounts.lifecycleEnrollments).toBe(1);
    expect(
      await prisma.lifecycleEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } }),
    ).toMatchObject({ contactId: survivor.id, status: "ACTIVE" });
    expect(
      await prisma.lifecycleMessage.count({
        where: { enrollmentId: enrollment.id, contactId: survivor.id },
      }),
    ).toBe(1);
    const snapshot = (
      await prisma.identityMergeCandidate.findUniqueOrThrow({ where: { id: candidate.id } })
    ).mergeSnapshotJson as { movedEntityIds: { lifecycleEnrollments: string[] } };
    expect(snapshot.movedEntityIds.lifecycleEnrollments).toEqual([enrollment.id]);

    await runCleanCycle(journey.id, [survivor.id]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(await prisma.lifecycleEnrollment.count({ where: { journeyId: journey.id } })).toBe(1);
  });

  it("espera el resultado de otro worker sin duplicar ni avanzar el paso", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");
    sendEmailMock.mockResolvedValue({ sent: false, reason: "timeout", status: 503 });

    await Promise.all([
      runCleanCycle(journey.id, [contact.id]),
      runCleanCycle(journey.id, [contact.id]),
    ]);

    const enrollment = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: journey.id, contactId: contact.id },
    });
    const step = await prisma.lifecycleJourneyStep.findFirstOrThrow({
      where: { journeyId: journey.id, position: 1 },
    });
    expect(enrollment.currentStepId).toBe(step.id);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(await prisma.lifecycleMessage.count({ where: { enrollmentId: enrollment.id } })).toBe(1);
    expect(
      await prisma.lifecycleMessage.findFirstOrThrow({
        where: { enrollmentId: enrollment.id },
      }),
    ).toMatchObject({ status: "FAILED", metadata: { attempts: 1 } });
  });

  it("no inscribe segunda compra a quien ya compró de nuevo", async () => {
    const repeatContact = await createContact(false);
    const firstPurchaseContact = await createContact(false);
    await createOrder(repeatContact.id, "DELIVERED");
    await createOrder(repeatContact.id, "PAID");
    await createOrder(firstPurchaseContact.id, "DELIVERED");
    const journey = await createJourney("SECOND_PURCHASE", false);

    await runCleanCycle(journey.id, [repeatContact.id, firstPurchaseContact.id]);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const enrollments = await prisma.lifecycleEnrollment.findMany({
      where: { journeyId: journey.id },
      select: { contactId: true },
    });
    expect(enrollments.map((item) => item.contactId)).toEqual([firstPurchaseContact.id]);
  });

  it("aplica el límite diario global entre recorridos distintos", async () => {
    const contact = await createContact(true);
    const firstJourney = await createJourney("FIRST_PURCHASE");
    const secondJourney = await createJourney("FIRST_PURCHASE");
    await saveLifecycleSettings({ enabled: true, maxMessagesPerDay: 1 }, "admin-test");
    try {
      await runCleanCycle(firstJourney.id, [contact.id]);
      await runCleanCycle(secondJourney.id, [contact.id]);
    } finally {
      await saveLifecycleSettings({ enabled: true, maxMessagesPerDay: 2 }, "admin-test");
    }

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const deferred = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: secondJourney.id, contactId: contact.id },
    });
    expect(deferred.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("ejecuta STG en DRY_RUN sin llamar a Resend", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      const summary = await runCleanCycle(journey.id, [contact.id]);
      expect(summary.dryRun).toBe(true);
      expect(summary.messagesSuppressed).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }

    expect(sendEmailMock).not.toHaveBeenCalled();
    const message = await prisma.lifecycleMessage.findFirstOrThrow({
      where: { enrollment: { journeyId: journey.id, contactId: contact.id } },
    });
    expect(message).toMatchObject({ status: "SUPPRESSED", error: "DRY_RUN", resendId: null });
  });

  it("detiene todo el motor con el interruptor general", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");
    await saveLifecycleSettings({ enabled: false, maxMessagesPerDay: 2 }, "admin-test");
    let summary;
    try {
      summary = await runCleanCycle(journey.id, [contact.id]);
    } finally {
      await saveLifecycleSettings({ enabled: true, maxMessagesPerDay: 2 }, "admin-test");
    }

    expect(summary.journeys).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await prisma.lifecycleEnrollment.count({ where: { journeyId: journey.id } })).toBe(0);
  });

  it("suprime antes de enviar ante un rebote conocido", async () => {
    const contact = await createContact(true);
    await prisma.emailEvent.create({
      data: {
        resendId: `${RUN}-bounce`,
        type: "email.bounced",
        to: contact.primaryEmail!,
        fromEmail: "hola@mail.lucamsshop.com",
        occurredAt: new Date(),
      },
    });
    const journey = await createJourney("FIRST_PURCHASE");

    await runCleanCycle(journey.id, [contact.id]);

    expect(sendEmailMock).not.toHaveBeenCalled();
    const enrollment = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: journey.id, contactId: contact.id },
    });
    expect(enrollment).toMatchObject({ status: "SUPPRESSED", exitReason: "EMAIL_BOUNCED" });
    expect(
      await prisma.lifecycleMessage.findFirstOrThrow({ where: { enrollmentId: enrollment.id } }),
    ).toMatchObject({ status: "SUPPRESSED", error: "EMAIL_BOUNCED" });
  });

  it("delega el carrito a la recuperación existente sin enviar otro recordatorio", async () => {
    const contact = await createContact(true);
    const cart = await prisma.cart.create({
      data: { sessionId: `${RUN}-${crypto.randomUUID()}`, currency: "COP" },
    });
    await prisma.abandonedCart.create({
      data: { cartId: cart.id, contactId: contact.id, email: contact.primaryEmail! },
    });
    const journey = await createJourney("FIRST_PURCHASE");

    await runCleanCycle(journey.id, [contact.id]);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(
      await prisma.lifecycleEnrollment.findFirstOrThrow({
        where: { journeyId: journey.id, contactId: contact.id },
      }),
    ).toMatchObject({ status: "EXITED", exitReason: "DELEGATED_CART_RECOVERY" });
  });

  it("crea una sola tarea B2B aun sin correo y sale al ganar la oportunidad", async () => {
    const contact = await createContact(false);
    await prisma.contact.update({ where: { id: contact.id }, data: { primaryEmail: null } });
    const opportunity = await prisma.opportunity.create({
      data: {
        number: `OP-${RUN}`,
        title: "Oportunidad Lifecycle",
        contactId: contact.id,
        stage: "NEW",
        updatedAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });
    const journey = await createJourney("B2B_FOLLOW_UP", false);
    await prisma.lifecycleJourney.update({
      where: { id: journey.id },
      data: { inactivityDays: 1 },
    });

    const first = await runCleanCycle(journey.id, [contact.id]);
    const second = await runCleanCycle(journey.id, [contact.id]);

    expect(first.tasksCreated).toBe(1);
    expect(second.tasksCreated).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await prisma.task.count({ where: { title: { contains: RUN } } })).toBe(1);
    expect(
      await prisma.contactActivity.count({ where: { body: { contains: opportunity.number } } }),
    ).toBe(1);

    await prisma.opportunity.update({ where: { id: opportunity.id }, data: { stage: "WON" } });
    await runCleanCycle(journey.id, [contact.id]);
    expect(
      await prisma.lifecycleEnrollment.findFirstOrThrow({
        where: { journeyId: journey.id, contactId: contact.id },
      }),
    ).toMatchObject({ status: "EXITED", exitReason: "OPPORTUNITY_WON" });
  });

  it("cierra de inmediato una inscripción al revocar el consentimiento", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");
    await prisma.lifecycleJourney.update({
      where: { id: journey.id },
      data: { requireOptIn: true },
    });
    await runCleanCycle(journey.id, [contact.id]);
    vi.stubEnv("CSRF_SECRET", "lifecycle-test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    try {
      await unsubscribeNewsletter(
        contact.primaryEmail!,
        computeUnsubscribeToken(contact.primaryEmail!),
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }

    expect(
      await prisma.lifecycleEnrollment.findFirstOrThrow({
        where: { journeyId: journey.id, contactId: contact.id },
      }),
    ).toMatchObject({ status: "EXITED", exitReason: "CONSENT_REVOKED" });
  });

  it("atribuye al último clic anterior a la orden y aísla entrega y clics por recorrido", async () => {
    const contact = await createContact(true);
    const journey = await createJourney("SECOND_PURCHASE");
    const step = await prisma.lifecycleJourneyStep.findFirstOrThrow({
      where: { journeyId: journey.id, position: 1 },
    });
    const enrollment = await prisma.lifecycleEnrollment.create({
      data: {
        journeyId: journey.id,
        contactId: contact.id,
        currentStepId: step.id,
        nextRunAt: new Date(Date.now() + 86_400_000),
      },
    });
    const earlyClick = new Date(Date.now() - 3 * 3_600_000);
    const lateClick = new Date(Date.now() - 3_600_000);
    const messages = await Promise.all(
      [earlyClick, lateClick].map((clickedAt, index) =>
        prisma.lifecycleMessage.create({
          data: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            contactId: contact.id,
            dedupKey: `${RUN}-last-before-order-${index}`,
            resendId: index === 0 ? `${RUN}-delivery` : null,
            subject: "Mensaje atribuible",
            ctaUrl: "/productos",
            scheduledFor: new Date(Date.now() - 5 * 3_600_000),
            sentAt: new Date(Date.now() - 5 * 3_600_000),
            clickedAt,
            status: "SENT",
            metadata: { targetPath: "/productos" },
          },
        }),
      ),
    );
    const order = await createOrder(contact.id, "PAID");
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - 2 * 3_600_000) },
    });
    await prisma.emailEvent.create({
      data: {
        resendId: `${RUN}-delivery`,
        type: "email.delivered",
        to: contact.primaryEmail!,
        fromEmail: "hola@mail.lucamsshop.com",
        occurredAt: new Date(),
      },
    });
    const otherJourney = await createJourney("SECOND_PURCHASE");
    const otherStep = await prisma.lifecycleJourneyStep.findFirstOrThrow({
      where: { journeyId: otherJourney.id, position: 1 },
    });
    const otherEnrollment = await prisma.lifecycleEnrollment.create({
      data: {
        journeyId: otherJourney.id,
        contactId: contact.id,
        currentStepId: otherStep.id,
        nextRunAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.lifecycleMessage.create({
      data: {
        enrollmentId: otherEnrollment.id,
        stepId: otherStep.id,
        contactId: contact.id,
        dedupKey: `${RUN}-other-journey-click`,
        subject: "Otro recorrido",
        ctaUrl: "/productos",
        scheduledFor: new Date(),
        sentAt: new Date(),
        clickedAt: new Date(),
        status: "SENT",
        metadata: { targetPath: "/productos" },
      },
    });

    await runCleanCycle(journey.id, [contact.id]);

    expect(
      await prisma.lifecycleMessage.findUniqueOrThrow({ where: { id: messages[0].id } }),
    ).toMatchObject({ convertedOrderId: order.id, revenueCents: order.total });
    expect(
      await prisma.lifecycleMessage.findUniqueOrThrow({ where: { id: messages[1].id } }),
    ).toMatchObject({ convertedOrderId: null });
    const metrics = await getLifecycleJourneyMetrics(journey.id);
    expect(metrics).toMatchObject({
      messagesSent: 2,
      messagesClicked: 2,
      messagesDelivered: 1,
      conversions: 1,
      deliveryRate: 0.5,
    });
  });

  it("conserva historial al fusionar dos contactos con inscripciones activas", async () => {
    const survivor = await createContact(true);
    const absorbed = await createContact(true);
    const journey = await createJourney("FIRST_PURCHASE");
    await runCleanCycle(journey.id, [survivor.id, absorbed.id]);
    const survivorEnrollment = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: journey.id, contactId: survivor.id },
    });
    const absorbedEnrollment = await prisma.lifecycleEnrollment.findFirstOrThrow({
      where: { journeyId: journey.id, contactId: absorbed.id },
    });
    const actor = await prisma.adminUser.create({
      data: {
        supabaseUserId: crypto.randomUUID(),
        email: `${RUN}-merge-two-admin@lucams.test`,
        role: "SUPERADMIN",
      },
    });
    const candidate = await prisma.identityMergeCandidate.create({
      data: {
        primaryContactId: survivor.id,
        secondaryContactId: absorbed.id,
        reasonCode: "SAME_BUYER_PHONE_E164",
        reasonCodes: ["SAME_BUYER_PHONE_E164"],
        evidenceJson: { synthetic: true },
      },
    });

    const merged = await mergeContactsByHumanApproval({
      candidateId: candidate.id,
      survivorContactId: survivor.id,
      actorAdminId: actor.id,
      note: "Validación de dos inscripciones activas.",
    });

    expect(merged.movedCounts.lifecycleEnrollments).toBe(1);
    expect(
      await prisma.lifecycleEnrollment.findUniqueOrThrow({ where: { id: survivorEnrollment.id } }),
    ).toMatchObject({ contactId: survivor.id, status: "ACTIVE" });
    expect(
      await prisma.lifecycleEnrollment.findUniqueOrThrow({ where: { id: absorbedEnrollment.id } }),
    ).toMatchObject({
      contactId: survivor.id,
      status: "EXITED",
      exitReason: "CONTACT_MERGED",
      cycle: 2,
    });
    expect(await prisma.lifecycleMessage.count({ where: { contactId: survivor.id } })).toBe(2);
    expect(
      await prisma.lifecycleEnrollment.count({
        where: { journeyId: journey.id, contactId: survivor.id, status: "ACTIVE" },
      }),
    ).toBe(1);
  });
});
