import "server-only";

import type { LifecycleStepCondition, LifecycleTrigger } from "@lucams/db";
import { prisma } from "@/lib/db";
import defaultJourneys from "../../../../packages/db/lifecycle-journeys.json";

type SeedStep = {
  position: number;
  delayMinutes: number;
  subject: string;
  heading: string;
  preheader: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
  commercial: boolean;
  condition: LifecycleStepCondition;
};

type SeedJourney = {
  key: string;
  name: string;
  description: string;
  trigger: LifecycleTrigger;
  status: "DRAFT";
  requireOptIn: boolean;
  inactivityDays: number;
  entryLookbackDays: number;
  cooldownDays: number;
  maxMessagesPerDay: number;
  quietStartHour: number;
  quietEndHour: number;
  steps: SeedStep[];
};

const LEGACY_CART_STEPS = [
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
] as const;

async function reconcileLegacySeed(key: string): Promise<void> {
  if (key === "b2b-follow-up") {
    await prisma.lifecycleJourney.updateMany({
      where: { key, status: "DRAFT", version: 1, inactivityDays: 0 },
      data: { inactivityDays: 2 },
    });
    return;
  }
  const legacy = LEGACY_CART_STEPS.find((item) => item.journeyKey === key);
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

export async function ensureLifecycleJourneySeeds(): Promise<void> {
  for (const journey of defaultJourneys as SeedJourney[]) {
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
}
