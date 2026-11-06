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
  }
}
