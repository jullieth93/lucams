/*
 * Catálogo, esquemas Zod y tipos client-safe para el pipeline consultivo B2B / Eventos
 * (`Opportunity` · `Fase 12 · S24`).
 */

import { z } from "zod";

export const OPPORTUNITY_STAGES = ["NEW", "QUALIFYING", "PROPOSAL_SENT", "WON", "LOST"] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  NEW: "Nueva solicitud",
  QUALIFYING: "En calificación",
  PROPOSAL_SENT: "Propuesta enviada",
  WON: "Ganada",
  LOST: "Perdida",
};

export const OPPORTUNITY_STAGE_TONES: Record<
  OpportunityStage,
  "amber" | "blue" | "purple" | "emerald" | "slate"
> = {
  NEW: "amber",
  QUALIFYING: "blue",
  PROPOSAL_SENT: "purple",
  WON: "emerald",
  LOST: "slate",
};

export const OPPORTUNITY_EVENT_TYPES = [
  "CORPORATE_GIFT",
  "WEDDING_SOCIAL",
  "SCHOOL_GRADUATION",
  "BRAND_MERCH",
  "OTHER",
] as const;

export type OpportunityEventType = (typeof OPPORTUNITY_EVENT_TYPES)[number];

export const OPPORTUNITY_EVENT_LABELS: Record<OpportunityEventType, string> = {
  CORPORATE_GIFT: "Regalos corporativos / fin de año",
  WEDDING_SOCIAL: "Bodas, bautizos y eventos sociales",
  SCHOOL_GRADUATION: "Colegios, grados y promociones",
  BRAND_MERCH: "Merchandising personalizado de marca",
  OTHER: "Otro proyecto especial por volumen",
};

export function isOpportunityStage(value: string): value is OpportunityStage {
  return (OPPORTUNITY_STAGES as readonly string[]).includes(value);
}

export function isOpportunityEventType(value: string): value is OpportunityEventType {
  return (OPPORTUNITY_EVENT_TYPES as readonly string[]).includes(value);
}

export const B2bInquirySchema = z.object({
  contactName: z
    .string()
    .trim()
    .min(2, "Escribe tu nombre completo (mínimo 2 caracteres).")
    .max(120, "Nombre demasiado largo."),
  organizationName: z
    .string()
    .trim()
    .max(140, "El nombre de la empresa o evento no puede superar 140 caracteres.")
    .optional()
    .default(""),
  nit: z
    .string()
    .trim()
    .max(30, "El NIT es demasiado largo.")
    .refine((val) => val === "" || /^[0-9.\-\s]{5,25}$/.test(val), {
      message: "Ingresa un NIT válido (solo números y guion de verificación).",
    })
    .optional()
    .default(""),
  email: z.email("Ingresa un correo electrónico válido.").max(180),
  whatsapp: z
    .string()
    .trim()
    .refine(
      (val) => {
        const digits = val.replace(/\D/g, "");
        return digits.length >= 7 && digits.length <= 15;
      },
      { message: "Ingresa un número de WhatsApp o celular válido." },
    ),
  eventType: z.enum(OPPORTUNITY_EVENT_TYPES, {
    message: "Selecciona el tipo de proyecto o evento.",
  }),
  expectedUnits: z.coerce
    .number()
    .int("Ingresa un número entero de unidades.")
    .min(10, "Para proyectos B2B o eventos atendemos desde 10 unidades.")
    .max(100000, "Si superas 100.000 unidades indícalo en los detalles."),
  eventDate: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((val) => val === "" || /^\d{4}-\d{2}-\d{2}$/.test(val), {
      message: "Fecha estimada inválida.",
    }),
  city: z.string().trim().min(2, "Indica la ciudad de entrega.").max(80),
  department: z.string().trim().max(80).optional().default(""),
  notes: z
    .string()
    .trim()
    .min(10, "Cuéntanos brevemente qué tienes en mente (mínimo 10 caracteres).")
    .max(2500, "El mensaje no puede superar 2.500 caracteres."),
  acceptHabeasData: z.literal(true, {
    message: "Debes autorizar el tratamiento de tus datos personales (Ley 1581 de 2012).",
  }),
  acceptNewsletter: z.boolean().default(false),
});

export type B2bInquiryInput = z.infer<typeof B2bInquirySchema>;
