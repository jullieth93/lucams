import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
if (APPLY) assertDestructiveAllowed("seed-lifecycle.mjs");

const prisma = new PrismaClient();
const journeys = JSON.parse(
  readFileSync(new URL("../lifecycle-journeys.json", import.meta.url), "utf8"),
);

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
  }
  console.log(
    APPLY
      ? `✓ Lifecycle: ${journeys.length} recorridos DRAFT sembrados sin sobrescribir personalizaciones.`
      : `ℹ Lifecycle: se sembrarían ${journeys.length} recorridos DRAFT. Ejecuta con --apply para persistirlos.`,
  );
} finally {
  await prisma.$disconnect();
}
