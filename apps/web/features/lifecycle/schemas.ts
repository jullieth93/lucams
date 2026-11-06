import { z } from "zod";
import { isSafeInternalPath } from "@/lib/safe-redirect";

const CtaPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(isSafeInternalPath, { message: "El enlace debe ser una ruta interna segura del sitio." })
  .refine((value) => !/\s/.test(value), { message: "El enlace no puede contener espacios." });

export const LifecycleJourneyStepSchema = z.object({
  id: z.string().cuid().optional(),
  position: z.number().int().min(1).max(50),
  delayMinutes: z.number().int().min(0).max(525_600),
  subject: z.string().trim().min(3).max(160),
  heading: z.string().trim().min(3).max(200),
  preheader: z.string().trim().min(3).max(240),
  body: z.string().trim().min(10).max(5000),
  ctaLabel: z.string().trim().min(2).max(100),
  ctaPath: CtaPathSchema,
  commercial: z.boolean(),
  condition: z.enum([
    "ALWAYS",
    "NO_PAID_ORDER",
    "HAS_ABANDONED_CART",
    "HAS_LOYALTY_POINTS",
    "HAS_DESIGN_ACTIVITY",
    "HAS_OPT_IN",
    "ORDER_DELIVERED",
    "NO_ORDER_SINCE_ENROLLMENT",
  ]),
});

export const LifecycleJourneySchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa solo minúsculas, números y guiones."),
  name: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(1000),
  trigger: z.enum([
    "FIRST_PURCHASE",
    "SECOND_PURCHASE",
    "REACTIVATION",
    "HIGH_INTENT",
    "B2B_FOLLOW_UP",
  ]),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]),
  requireOptIn: z.boolean(),
  inactivityDays: z.number().int().min(0).max(3650),
  entryLookbackDays: z.number().int().min(1).max(3650),
  cooldownDays: z.number().int().min(0).max(3650),
  maxMessagesPerDay: z.number().int().min(1).max(20),
  quietStartHour: z.number().int().min(0).max(23),
  quietEndHour: z.number().int().min(0).max(23),
  steps: z.array(LifecycleJourneyStepSchema).min(1).max(12),
});

export const LifecycleJourneyIdSchema = z.object({
  journeyId: z.string().cuid(),
});

export const LifecycleTestSchema = LifecycleJourneyIdSchema.extend({
  stepId: z.string().cuid().optional(),
});

export const LifecycleEnrollmentActionSchema = z.object({
  enrollmentId: z.string().cuid(),
  action: z.enum(["pause", "resume", "exit"]),
});

export const LifecycleMessageRetrySchema = z.object({
  messageId: z.string().cuid(),
});
