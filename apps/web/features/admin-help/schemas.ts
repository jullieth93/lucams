import { z } from "zod";

export const SaveHelpProgressSchema = z.object({
  guideId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  currentStep: z.number().int().min(0).max(100),
  intent: z.enum(["progress", "complete", "dismiss"]),
});

export const SubmitHelpFeedbackSchema = z.object({
  guideId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  isHelpful: z.boolean(),
  comment: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => value || null),
});

export const GetContextualHelpSchema = z.object({
  pathname: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .refine((val) => val.startsWith("/admin"), "Ruta administrativa inválida"),
});
