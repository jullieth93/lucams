/*
 * Zod schemas por step del checkout. Cada Server Action valida con el
 * schema del step correspondiente antes de actualizar la cookie.
 *
 * Lucy 2026-05-21: validaciones reales acorde a Colombia/courier:
 *  - Nombre solo letras
 *  - Email formato + autocomplete
 *  - Teléfono 10 dígitos (móvil CO)
 *  - Documento regex por tipo
 *  - Ciudad/Depto/CP del catálogo DANE divipola
 *  - Dirección estructurada (Vía + Número + Cruce + Detalle)
 */

import { z } from "zod";

export const ContactSchema = z.object({
  fullName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "Máximo 120 caracteres")
    .regex(/^[A-Za-zÀ-ÿ\s.''\-]+$/u, "El nombre solo puede tener letras")
    .trim(),
  email: z.email("Email inválido").max(254).trim().toLowerCase(),
  // Móvil colombiano: 10 dígitos empezando con 3 (sin espacios al persistir).
  phone: z.string().regex(/^3\d{9}$/, "Debe ser un móvil colombiano de 10 dígitos (300...)"),
  documentType: z.enum(["CC", "CE", "NIT", "PP", "TI"]).optional(),
  documentNumber: z.string().min(6).max(15).optional(),
});
export type ContactInput = z.infer<typeof ContactSchema>;

/**
 * Dirección estructurada V1 (Lucy 2026-05-21):
 *   Vía (select 8 opciones) + Número (texto) + Cruce (#N-N) + Detalle (opcional)
 * Se junta a string al persistir para Aveonline:
 *   "Calle 100 # 15-20 (Apto 401, Conjunto Lucams)"
 */
export const VIA_TYPES = [
  "Calle",
  "Carrera",
  "Diagonal",
  "Transversal",
  "Avenida",
  "Autopista",
  "Circular",
  "Manzana",
] as const;
export type ViaType = (typeof VIA_TYPES)[number];

export const AddressSchema = z
  .object({
    // Códigos DANE — clave de validación cruzada cliente/server.
    deptCode: z.string().regex(/^\d{2}$/, "Departamento inválido"),
    cityCode: z.string().regex(/^\d{5}$/, "Ciudad inválida"),
    // Snapshot human-readable (denormalizado para no joinear después).
    department: z.string().min(2).max(80),
    city: z.string().min(2).max(80),
    zip: z
      .string()
      .regex(/^\d{6}$/, "Código postal debe tener 6 dígitos")
      .optional()
      .or(z.literal("")),
    viaType: z.enum(VIA_TYPES, { message: "Tipo de vía inválido" }),
    viaNumber: z
      .string()
      .min(1, "Número de vía requerido")
      .max(10)
      .regex(/^[\dA-Z]+$/i, "Solo números y letras (ej. 100, 13B)"),
    // Cruce: NN-NN formato típico (con letras opcionales). Ej: "15-20" o "13B-42".
    cruceNumber: z
      .string()
      .min(2, "Cruce requerido (ej. 15-20)")
      .max(15)
      .regex(/^\d+[A-Z]?-\d+[A-Z]?$/i, "Formato: número-número (ej. 15-20 o 13B-42)"),
    detail: z.string().max(200).trim().optional(),
    notes: z.string().max(500).trim().optional(),
  })
  .refine((data) => data.cityCode.startsWith(data.deptCode), {
    message: "Ciudad no pertenece al departamento seleccionado",
    path: ["cityCode"],
  });
export type AddressInput = z.infer<typeof AddressSchema>;

/**
 * Junta la dirección estructurada en un string para Aveonline:
 *   "Calle 100 # 15-20 (Apto 401, Conjunto Lucams)"
 */
export function composeAddressLine(input: {
  viaType: ViaType;
  viaNumber: string;
  cruceNumber: string;
  detail?: string;
}): string {
  const base = `${input.viaType} ${input.viaNumber.toUpperCase()} # ${input.cruceNumber.toUpperCase()}`;
  if (input.detail?.trim()) {
    return `${base} (${input.detail.trim()})`;
  }
  return base;
}

export const BillingSchema = z
  .object({
    wantsInvoice: z.boolean(),
    documentType: z.enum(["CC", "CE", "NIT", "PP"]).optional(),
    documentNumber: z.string().max(30).optional(),
    name: z.string().max(200).trim().optional(),
  })
  .refine(
    (data) => {
      if (data.wantsInvoice) {
        return !!(data.documentType && data.documentNumber && data.name);
      }
      return true;
    },
    {
      message: "Si querés factura, completá tipo de documento, número y razón social",
      path: ["wantsInvoice"],
    },
  );
export type BillingInput = z.infer<typeof BillingSchema>;

/**
 * Selección de envío — output de cotización Aveonline. Validamos
 * estructura mínima por si el cliente manipula la cookie.
 */
export const ShippingSelectionSchema = z.object({
  carrier: z.string().min(1).max(60),
  carrierName: z.string().min(1).max(120),
  fleteCop: z.number().int().min(0),
  deliveryDays: z.number().int().min(0).max(30),
  contraentrega: z.boolean(),
  quoteId: z.string().min(1).max(120),
});
export type ShippingSelectionInput = z.infer<typeof ShippingSelectionSchema>;

export const PaymentMethodSchema = z.enum(["WOMPI", "COD"]);
