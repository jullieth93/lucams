import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import {
  createLifecycleJourney,
  getLifecycleJourney,
  previewLifecycleAudience,
  sendLifecycleTest,
  setLifecycleJourneyStatus,
  updateLifecycleJourney,
} from "./admin-service";
import type { LifecycleJourneyInput } from "./types";

vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn() }));
const sendEmailMock = vi.mocked(sendEmail);
const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `lifecycle-admin-${Date.now()}`;

const input: LifecycleJourneyInput = {
  key: RUN,
  name: "Recorrido administrativo",
  description: "Recorrido de prueba para crear y actualizar configuración.",
  trigger: "FIRST_PURCHASE",
  status: "DRAFT",
  requireOptIn: true,
  inactivityDays: 90,
  entryLookbackDays: 30,
  cooldownDays: 180,
  maxMessagesPerDay: 2,
  quietStartHour: 20,
  quietEndHour: 8,
  steps: [
    {
      position: 1,
      delayMinutes: 0,
      subject: "Primer paso",
      heading: "Primer paso",
      preheader: "Primer paso",
      body: "Hola {nombre}. Este es el primer paso.",
      ctaLabel: "Explorar",
      ctaPath: "/recomendador",
      commercial: true,
      condition: "NO_PAID_ORDER",
    },
    {
      position: 2,
      delayMinutes: 1440,
      subject: "Segundo paso",
      heading: "Segundo paso",
      preheader: "Segundo paso",
      body: "Hola {nombre}. Este es el segundo paso.",
      ctaLabel: "Comprar",
      ctaPath: "/productos",
      commercial: true,
      condition: "ALWAYS",
    },
  ],
};

describe.skipIf(!hasDb)("lifecycle admin service", { timeout: 30_000 }, () => {
  afterAll(async () => {
    await prisma.lifecycleJourney.deleteMany({ where: { key: { startsWith: RUN } } });
  });

  it("crea, versiona, activa, estima audiencia y envía prueba", async () => {
    const journey = await createLifecycleJourney(input, "admin-test");
    expect(journey.status).toBe("DRAFT");
    expect(journey.version).toBe(1);

    const updated = await updateLifecycleJourney(
      journey.id,
      { ...input, name: "Recorrido actualizado" },
      "admin-test-2",
    );
    expect(updated.version).toBe(2);
    expect(updated.name).toBe("Recorrido actualizado");

    const originalSteps = (await getLifecycleJourney(journey.id))!.steps;
    const reordered = await updateLifecycleJourney(
      journey.id,
      {
        ...input,
        steps: [
          { ...originalSteps[1], position: 1 },
          { ...originalSteps[0], position: 2 },
        ],
      },
      "admin-test-2",
    );
    expect(reordered.version).toBe(3);
    expect((await getLifecycleJourney(journey.id))!.steps.map((step) => step.subject)).toEqual([
      "Segundo paso",
      "Primer paso",
    ]);

    const activated = await setLifecycleJourneyStatus(journey.id, "ACTIVE", "admin-test-2");
    expect(activated.status).toBe("ACTIVE");

    const audience = await previewLifecycleAudience(journey.id);
    expect(audience.sample.length).toBeLessThanOrEqual(10);

    sendEmailMock.mockResolvedValue({ sent: true, id: "resend-admin-test" });
    const detailed = await getLifecycleJourney(journey.id);
    const resendId = await sendLifecycleTest(journey.id, detailed!.steps[0].id, {
      email: "admin@lucams.test",
      fullName: "Admin Test",
    });
    expect(resendId).toBe("resend-admin-test");
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@lucams.test", subject: "[PRUEBA] Segundo paso" }),
    );
  });

  it("valida inactividad mínima y no envía pruebas en modo STG", async () => {
    await expect(
      createLifecycleJourney(
        { ...input, key: `${RUN}-invalid`, trigger: "REACTIVATION", inactivityDays: 0 },
        "admin-test",
      ),
    ).rejects.toThrow("La reactivación exige al menos un día de inactividad.");
    const journey = await createLifecycleJourney({ ...input, key: `${RUN}-dry` }, "admin-test");
    const detailed = await getLifecycleJourney(journey.id);
    sendEmailMock.mockReset();
    vi.stubEnv("VERCEL_ENV", "preview");
    let result;
    try {
      result = await sendLifecycleTest(journey.id, detailed!.steps[0].id, {
        email: "admin@lucams.test",
        fullName: "Admin Test",
      });
    } finally {
      vi.unstubAllEnvs();
    }

    expect(result).toBe("dry-run");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
