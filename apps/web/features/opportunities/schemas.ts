/*
 * Catálogo, esquemas Zod y tipos client-safe para el pipeline consultivo B2B / Eventos
 * y propuestas formales (`Opportunity` + `OpportunityProposal` · `Fase 12 · S24` + `ADR-210`).
 */

import { z } from "zod";
import {
  NAME_REGEX,
  capitalizeName,
  countWords,
  normalizeAndValidateNit,
  normalizePhoneWithDial,
} from "@/lib/colombia-validators";

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

export function isCorporateEventType(eventType: OpportunityEventType): boolean {
  return eventType === "CORPORATE_GIFT" || eventType === "BRAND_MERCH";
}

export const B2B_ARTWORK_MODES = [
  "SAME_DESIGN",
  "ASSORTED_BATCH",
  "INDIVIDUAL_NOMINAL",
  "CREATIVE_ASSISTANCE",
] as const;

export type B2bArtworkMode = (typeof B2B_ARTWORK_MODES)[number];

export const B2B_ARTWORK_MODE_LABELS: Record<B2bArtworkMode, string> = {
  SAME_DESIGN: "Un mismo diseño para todas las unidades",
  ASSORTED_BATCH: "Varios diseños o fotos surtidas en el lote",
  INDIVIDUAL_NOMINAL: "Personalización 1 a 1 (ej. nombre por invitado o colaborador)",
  CREATIVE_ASSISTANCE: "Necesito asesoría creativa con mi logo o idea",
};

export const B2B_ARTWORK_MODE_HINTS: Record<B2bArtworkMode, string> = {
  SAME_DESIGN: "Ideal para logotipo empresarial, fecha de boda o recordatorio unificado.",
  ASSORTED_BATCH: "Combina entre 2 y 15 artes o fotografías distintas repartidas en el pedido.",
  INDIVIDUAL_NOMINAL: "Cada pieza lleva un nombre o dato único; cotizado a medida en tu propuesta.",
  CREATIVE_ASSISTANCE:
    "Nuestro equipo adapta tu identidad visual y te envía muestra digital previa.",
};

export const B2B_PACKAGING_TYPES = ["BULK_STANDARD", "INDIVIDUAL_FAVOR", "SPECIAL_KIT"] as const;

export type B2bPackagingType = (typeof B2B_PACKAGING_TYPES)[number];

export const B2B_PACKAGING_TYPE_LABELS: Record<B2bPackagingType, string> = {
  BULK_STANDARD: "Empaque protector estándar a granel",
  INDIVIDUAL_FAVOR: "Empaque individual listo para entregar por persona",
  SPECIAL_KIT: "Kit o presentación corporativa especial",
};

export const B2B_PACKAGING_TYPE_HINTS: Record<B2bPackagingType, string> = {
  BULK_STANDARD: "Incluido sin costo adicional; piezas agrupadas y protegidas para transporte.",
  INDIVIDUAL_FAVOR: "Presentación unitaria para recordatorio; se cotiza a medida en tu propuesta.",
  SPECIAL_KIT: "Cajas, tarjetas de respaldo impresas o armados mixtos cotizados en tu propuesta.",
};

export const PROPOSAL_STATUSES = [
  "DRAFT",
  "SENT",
  "APPROVED",
  "CONVERTED",
  "EXPIRED",
  "SUPERSEDED",
  "CANCELLED",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada al cliente",
  APPROVED: "Aprobada",
  CONVERTED: "Convertida en pedido",
  EXPIRED: "Vencida",
  SUPERSEDED: "Reemplazada por nueva versión",
  CANCELLED: "Cancelada",
};

export const PROPOSAL_STATUS_TONES: Record<
  ProposalStatus,
  "slate" | "blue" | "purple" | "emerald" | "amber" | "rose"
> = {
  DRAFT: "slate",
  SENT: "purple",
  APPROVED: "blue",
  CONVERTED: "emerald",
  EXPIRED: "amber",
  SUPERSEDED: "slate",
  CANCELLED: "rose",
};

export const PROPOSAL_PROOF_MODES = ["BEFORE_PAYMENT", "AFTER_PAYMENT"] as const;
export type ProposalProofMode = (typeof PROPOSAL_PROOF_MODES)[number];

export const PROPOSAL_PROOF_MODE_LABELS: Record<ProposalProofMode, string> = {
  BEFORE_PAYMENT: "Aprobar muestra digital antes de pagar",
  AFTER_PAYMENT: "Pagar primero y aprobar muestra antes de pasar a taller",
};

export const PROPOSAL_SHIPPING_MODES = ["QUOTED", "PACTED_MANUAL"] as const;
export type ProposalShippingMode = (typeof PROPOSAL_SHIPPING_MODES)[number];

export const PROPOSAL_SHIPPING_MODE_LABELS: Record<ProposalShippingMode, string> = {
  QUOTED: "Transportadora cotizada (guía automática)",
  PACTED_MANUAL: "Tarifa pactada / multi-caja / despacho asistido",
};

export const DIRECT_PAYMENT_METHODS = ["BRE_B", "BANK_TRANSFER"] as const;
export type DirectPaymentMethodKind = (typeof DIRECT_PAYMENT_METHODS)[number];

export const DIRECT_PAYMENT_METHOD_LABELS: Record<DirectPaymentMethodKind, string> = {
  BRE_B: "Llave Bre-B (pago inmediato)",
  BANK_TRANSFER: "Transferencia bancaria tradicional",
};

export function isOpportunityStage(value: string): value is OpportunityStage {
  return (OPPORTUNITY_STAGES as readonly string[]).includes(value);
}

export function isOpportunityEventType(value: string): value is OpportunityEventType {
  return (OPPORTUNITY_EVENT_TYPES as readonly string[]).includes(value);
}

export function isB2bArtworkMode(value: string): value is B2bArtworkMode {
  return (B2B_ARTWORK_MODES as readonly string[]).includes(value);
}

export function isB2bPackagingType(value: string): value is B2bPackagingType {
  return (B2B_PACKAGING_TYPES as readonly string[]).includes(value);
}

export function isProposalStatus(value: string): value is ProposalStatus {
  return (PROPOSAL_STATUSES as readonly string[]).includes(value);
}

export function isProposalProofMode(value: string): value is ProposalProofMode {
  return (PROPOSAL_PROOF_MODES as readonly string[]).includes(value);
}

export function isProposalShippingMode(value: string): value is ProposalShippingMode {
  return (PROPOSAL_SHIPPING_MODES as readonly string[]).includes(value);
}

export function isDirectPaymentMethod(value: string): value is DirectPaymentMethodKind {
  return (DIRECT_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function todayBogotaIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const B2bConfiguredLineInputSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  variantId: z.string().trim().min(1).max(64),
  commercialQty: z.coerce.number().int().min(1).max(100_000),
});

export type B2bConfiguredLineInput = z.infer<typeof B2bConfiguredLineInputSchema>;

export const B2bConfiguredLineSnapshotSchema = z.object({
  productId: z.string(),
  productSlug: z.string(),
  productName: z.string(),
  variantId: z.string(),
  variantName: z.string(),
  sku: z.string(),
  magnet: z.boolean().nullable(),
  commercialQty: z.number().int().min(1),
  piecesPerUnit: z.number().int().min(1),
  physicalPieces: z.number().int().min(1),
  indicativeUnitCents: z.number().int().min(0),
});

export type B2bConfiguredLineSnapshot = z.infer<typeof B2bConfiguredLineSnapshotSchema>;

export const B2bRequestedConfigSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["CATALOG_LINES", "ADVISORY_OPEN"]),
  lines: z.array(B2bConfiguredLineSnapshotSchema).max(5),
  artworkMode: z.enum(B2B_ARTWORK_MODES),
  packagingType: z.enum(B2B_PACKAGING_TYPES),
  cityCode: z.string().nullable().optional(),
  departmentCode: z.string().nullable().optional(),
  dateSemaphore: z
    .enum(["UNSET", "PAST", "CRITICAL_TIGHT", "URGENT_VIABLE", "COMFORTABLE"])
    .optional(),
  businessDaysAvailable: z.number().int().nullable().optional(),
  recommendedMinBusinessDays: z.number().int().nullable().optional(),
  estimatedMinCents: z.number().int().min(0).nullable(),
  estimatedMaxCents: z.number().int().min(0).nullable(),
});

export type B2bRequestedConfig = z.infer<typeof B2bRequestedConfigSchema>;

export const B2bInquirySchema = z
  .object({
    contactName: z
      .string()
      .trim()
      .min(2, "Escribe tu nombre completo (mínimo 2 letras).")
      .max(120, "Nombre demasiado largo.")
      .regex(NAME_REGEX, "El nombre solo puede tener letras (sin números ni símbolos).")
      .refine((val) => countWords(val) <= 5, {
        message: "Ingresa máximo 5 palabras en tu nombre completo.",
      })
      .transform(capitalizeName),
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
      .superRefine((val, ctx) => {
        if (!val) return;
        const check = normalizeAndValidateNit(val);
        if (!check.valid) {
          ctx.addIssue({
            code: "custom",
            message: check.error ?? "Ingresa un NIT colombiano válido (ej. 900123456-8).",
          });
        }
      })
      .transform((val) => (val ? normalizeAndValidateNit(val).normalized : ""))
      .optional()
      .default(""),
    email: z
      .string()
      .transform((val) => val.trim().toLowerCase())
      .pipe(z.email("Ingresa un correo electrónico válido.").max(180)),
    whatsapp: z
      .string()
      .trim()
      .refine((val) => normalizePhoneWithDial(val) !== null, {
        message:
          "Ingresa un celular válido (en Colombia: 10 dígitos empezando en 3; otro país: 6 a 15 dígitos).",
      })
      .transform((val) => normalizePhoneWithDial(val) ?? val),
    eventType: z.enum(OPPORTUNITY_EVENT_TYPES, {
      message: "Selecciona el tipo de proyecto o evento.",
    }),
    expectedUnits: z.coerce
      .number()
      .int("Ingresa un número entero de unidades.")
      .min(25, "Para proyectos B2B o eventos atendemos desde 25 unidades.")
      .max(100000, "Si superas 100.000 unidades indícalo en los detalles."),
    eventDate: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((val) => val === "" || /^\d{4}-\d{2}-\d{2}$/.test(val), {
        message: "Fecha estimada inválida.",
      })
      .refine((val) => val === "" || val >= todayBogotaIso(), {
        message: "La fecha estimada de entrega no puede estar en el pasado.",
      }),
    city: z.string().trim().min(2, "Selecciona la ciudad de entrega.").max(80),
    department: z.string().trim().min(2, "Selecciona el departamento de entrega.").max(80),
    cityCode: z.string().trim().max(12).optional().default(""),
    departmentCode: z.string().trim().max(12).optional().default(""),
    configMode: z.enum(["CATALOG_LINES", "ADVISORY_OPEN"]).optional().default("ADVISORY_OPEN"),
    configuredLinesJson: z.string().max(10_000).optional().default(""),
    artworkMode: z.enum(B2B_ARTWORK_MODES).optional().default("SAME_DESIGN"),
    packagingType: z.enum(B2B_PACKAGING_TYPES).optional().default("BULK_STANDARD"),
    notes: z
      .string()
      .trim()
      .max(2500, "El mensaje no puede superar 2.500 caracteres.")
      .optional()
      .default(""),
    acceptHabeasData: z.literal(true, {
      message: "Debes autorizar el tratamiento de tus datos personales (Ley 1581 de 2012).",
    }),
    acceptNewsletter: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.configMode === "CATALOG_LINES") {
      let raw: unknown;
      try {
        raw = JSON.parse(val.configuredLinesJson || "[]");
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["configuredLinesJson"],
          message: "La selección de productos es inválida.",
        });
        return;
      }
      const linesRes = z.array(B2bConfiguredLineInputSchema).min(1).max(5).safeParse(raw);
      if (!linesRes.success) {
        ctx.addIssue({
          code: "custom",
          path: ["configuredLinesJson"],
          message: "Agrega entre 1 y 5 referencias válidas del catálogo.",
        });
      }
    } else if (val.notes.trim().length < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Cuéntanos brevemente qué tienes en mente (mínimo 10 caracteres).",
      });
    }
  });

export type B2bInquiryInput = z.infer<typeof B2bInquirySchema>;

export const ProposalDraftItemSchema = z.object({
  variantId: z.string().trim().min(1, "Selecciona una opción válida."),
  qty: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1.").max(100_000),
  designUnits: z.coerce.number().int().min(1).max(60).default(1),
  unitPricePesos: z.coerce
    .number()
    .int("El precio unitario debe ser entero en pesos COP.")
    .min(0)
    .max(500_000_000),
  packagingNote: z.string().trim().max(240).optional().default(""),
  designId: z.string().trim().max(64).optional().default(""),
});

export const SaveProposalDraftSchema = z.object({
  opportunityId: z.string().trim().min(1),
  proposalId: z.string().trim().max(64).optional().default(""),
  validUntilDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha de vigencia válida.")
    .refine((val) => val >= todayBogotaIso(), {
      message: "La vigencia de la propuesta no puede estar en el pasado.",
    }),
  proofMode: z.enum(PROPOSAL_PROOF_MODES),
  artworkMode: z.enum(B2B_ARTWORK_MODES),
  packagingType: z.enum(B2B_PACKAGING_TYPES),
  estimatedProductionDays: z.coerce.number().int().min(1).max(90),
  shippingMode: z.enum(PROPOSAL_SHIPPING_MODES),
  shippingCarrier: z.string().trim().max(80).optional().default(""),
  shippingService: z.string().trim().max(120).optional().default(""),
  packageCount: z.coerce.number().int().min(1).max(100).default(1),
  departmentCode: z.string().trim().min(1, "Selecciona el departamento destino.").max(12),
  cityCode: z.string().trim().min(1, "Selecciona el municipio destino.").max(12),
  shippingPesos: z.coerce.number().int().min(0).max(100_000_000),
  discountPesos: z.coerce.number().int().min(0).max(500_000_000).default(0),
  allowDirectTransfer: z.boolean().default(false),
  allowBelowCostOverride: z.boolean().default(false),
  clientNotes: z.string().trim().max(2500).optional().default(""),
  termsNotes: z.string().trim().max(2500).optional().default(""),
  items: z
    .array(ProposalDraftItemSchema)
    .min(1, "Agrega al menos una línea a la propuesta.")
    .max(20),
});

export type SaveProposalDraftInput = z.infer<typeof SaveProposalDraftSchema>;

export const ReportDirectPaymentSchema = z.object({
  token: z.string().trim().min(20).max(160),
  method: z.enum(DIRECT_PAYMENT_METHODS),
  reference: z
    .string()
    .trim()
    .min(4, "Ingresa el número de comprobante, referencia o código CUS (mínimo 4 caracteres).")
    .max(120, "La referencia es demasiado larga."),
  notes: z.string().trim().max(500).optional().default(""),
});

export const ConfirmDirectPaymentSchema = z.object({
  orderId: z.string().trim().min(1),
  receivedCashPesos: z.coerce.number().int().min(0).max(2_000_000_000),
  withholdingPesos: z.coerce.number().int().min(0).max(500_000_000).default(0),
  referenceOverride: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(600).optional().default(""),
});
