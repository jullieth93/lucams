import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("seed-lifecycle.mjs");

const prisma = new PrismaClient();
const journeys = JSON.parse(
  readFileSync(new URL("../lifecycle-journeys.json", import.meta.url), "utf8"),
);

const legacyCartSteps = [
  {
    journeyKey: "first-purchase",
    legacySubject: "Tu carrito te espera",
    nextSubject: "Tu primer producto está a un paso",
    legacyPosition: 4,
    nextPosition: 3,
  },
  {
    journeyKey: "high-intent",
    legacySubject: "Revisa tu selección cuando quieras",
    nextSubject: "Encuentra el formato que sí te representa",
    legacyPosition: 3,
    nextPosition: 2,
  },
];

async function reconcileLegacySeed(key) {
  if (key === "b2b-follow-up") {
    await prisma.lifecycleJourney.updateMany({
      where: { key, status: "DRAFT", version: 1, inactivityDays: 0 },
      data: { inactivityDays: 2 },
    });
    return;
  }
  const legacy = legacyCartSteps.find((item) => item.journeyKey === key);
  if (!legacy) return;
  const removed = await prisma.lifecycleJourneyStep.deleteMany({
    where: {
      journey: { key, status: "DRAFT", version: 1 },
      condition: "HAS_ABANDONED_CART",
      subject: legacy.legacySubject,
      messages: { none: {} },
      enrollments: { none: {} },
    },
  });
  if (removed.count === 0) return;
  await prisma.lifecycleJourneyStep.updateMany({
    where: {
      journey: { key, status: "DRAFT", version: 1 },
      subject: legacy.nextSubject,
      position: legacy.legacyPosition,
    },
    data: { position: legacy.nextPosition },
  });
}

try {
  for (const journey of APPLY ? journeys : []) {
    await prisma.lifecycleJourney.upsert({
      where: { key: journey.key },
      update: {},
      create: {
        key: journey.key,
        name: journey.name,
        description: journey.description,
        trigger: journey.trigger,
        status: journey.status,
        requireOptIn: journey.requireOptIn,
        inactivityDays: journey.inactivityDays,
        entryLookbackDays: journey.entryLookbackDays,
        cooldownDays: journey.cooldownDays,
        maxMessagesPerDay: journey.maxMessagesPerDay,
        quietStartHour: journey.quietStartHour,
        quietEndHour: journey.quietEndHour,
        steps: {
          create: journey.steps.map((step) => ({
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
    await reconcileLegacySeed(journey.key);
  }
  console.log(
    APPLY
      ? `✓ Lifecycle: ${journeys.length} recorridos DRAFT sembrados sin sobrescribir personalizaciones.`
      : `ℹ Lifecycle: se sembrarían ${journeys.length} recorridos DRAFT. Ejecuta con --apply para persistirlos.`,
  );
} finally {
  await prisma.$disconnect();
}
