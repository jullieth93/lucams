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
 * Dirección estructurada V2 (Lucy 2026-05-21):
 * Soporta direcciones URBANAS (Calle/Carrera + número + cruce) y RURALES
 * (vereda/corregimiento + finca/lugar + referencia). Colombia tiene mucho
 * envío rural que NO encaja en la nomenclatura DIAN urbana.
 *
 * Discriminated union por `kind`:
 *   - "urban": Vía + Número + Cruce (#N-N) + Detalle (opcional)
 *   - "rural": Vereda + Finca/Lugar (opcional) + Referencia (descriptiva)
 *
 * `composeAddressLine` junta los campos en un string que Aveonline acepta.
 */
export const VIA_TYPES = [
  "Calle",
  "Carrera",
  "Diagonal",
  "Transversal",
  "Avenida",
  "Avenida Calle",
  "Avenida Carrera",
  "Autopista",
  "Circular",
  "Manzana",
] as const;
export type ViaType = (typeof VIA_TYPES)[number];

export const CARDINAL_POINTS = ["", "Norte", "Sur", "Este", "Oeste"] as const;
export type CardinalPoint = (typeof CARDINAL_POINTS)[number];

const BaseAddressFields = z.object({
  // Códigos DANE — clave de validación cruzada cliente/server.
  deptCode: z.string().regex(/^\d{2}$/, "Departamento inválido"),
  cityCode: z.string().regex(/^\d{5}$/, "Ciudad inválida"),
  department: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  zip: z
    .string()
    .regex(/^\d{6}$/, "Código postal debe tener 6 dígitos")
    .optional()
    .or(z.literal("")),
  notes: z.string().max(500).trim().optional(),
});

// Nomenclatura colombiana completa (Lucy 2026-05-21):
//   Carrera 7A Bis Sur # 23-45  → viaType=Carrera, viaNumber=7A, viaBis=true,
//                                  viaCardinal=Sur, cruceNumber=23-45
//
// viaNumber: dígitos + letras (7A, 13B, 100). Regex permite "100", "13B", "7AB".
// cruceNumber: NN-NN con letras opcionales (15-20, 13B-42, 100A-25C).
const UrbanAddressSchema = BaseAddressFields.extend({
  kind: z.literal("urban"),
  viaType: z.enum(VIA_TYPES, { message: "Tipo de vía inválido" }),
  viaNumber: z
    .string()
    .min(1, "Número de vía requerido")
    .max(10)
    .regex(/^\d+[A-Z]{0,3}$/i, "Empieza con número, opcional letras (ej. 100, 13B, 7AB)"),
  viaBis: z.boolean().optional(),
  viaCardinal: z.enum(CARDINAL_POINTS).optional(),
  cruceNumber: z
    .string()
    .min(2, "Cruce requerido (ej. 15-20)")
    .max(20)
    .regex(/^\d+[A-Z]{0,3}-\d+[A-Z]{0,3}$/i, "Formato: número-número (ej. 15-20, 13B-42)"),
  cruceCardinal: z.enum(CARDINAL_POINTS).optional(),
  detail: z.string().max(200).trim().optional(),
});

const RuralAddressSchema = BaseAddressFields.extend({
  kind: z.literal("rural"),
  vereda: z.string().min(2, "Vereda / corregimiento / sector requerido").max(120).trim(),
  finca: z.string().max(120).trim().optional(),
  referencia: z
    .string()
    .min(10, "Indicaciones para llegar: mínimo 10 caracteres (ej. 'a 200m del puente, casa azul')")
    .max(300)
    .trim(),
});

export const AddressSchema = z
  .discriminatedUnion("kind", [UrbanAddressSchema, RuralAddressSchema])
  .refine((data) => data.cityCode.startsWith(data.deptCode), {
    message: "Ciudad no pertenece al departamento seleccionado",
    path: ["cityCode"],
  });
export type AddressInput = z.infer<typeof AddressSchema>;
export type UrbanAddressInput = z.infer<typeof UrbanAddressSchema>;
export type RuralAddressInput = z.infer<typeof RuralAddressSchema>;

/**
 * Junta la dirección en un string que el courier (Aveonline) recibe.
 *
 *   Urbana: "Calle 100 # 15-20 (Apto 401, Conjunto Lucams)"
 *   Rural:  "Vereda El Roble — Finca Las Flores · Ref: a 200m del puente,
 *           casa color azul"
 */
export function composeAddressLine(input: AddressInput): string {
  if (input.kind === "urban") {
    // Carrera 7A Bis Sur # 23-45 Norte (Apto 401)
    const viaParts = [input.viaType, input.viaNumber.toUpperCase()];
    if (input.viaBis) viaParts.push("Bis");
    if (input.viaCardinal) viaParts.push(input.viaCardinal);
    const cruceParts = ["#", input.cruceNumber.toUpperCase()];
    if (input.cruceCardinal) cruceParts.push(input.cruceCardinal);
    const base = `${viaParts.join(" ")} ${cruceParts.join(" ")}`;
    return input.detail?.trim() ? `${base} (${input.detail.trim()})` : base;
  }
  // Rural
  const parts: string[] = [`Vereda ${input.vereda}`];
  if (input.finca?.trim()) parts.push(`Finca ${input.finca.trim()}`);
  parts.push(`Ref: ${input.referencia}`);
  return parts.join(" · ");
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
      message: "Si quieres factura, completa tipo de documento, número y razón social",
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
