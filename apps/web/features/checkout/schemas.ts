/*
 * Zod schemas por step del checkout. Cada Server Action valida con el
 * schema del step correspondiente antes de actualizar la cookie.
 */

import { z } from "zod";

export const ContactSchema = z.object({
  fullName: z.string().min(2, "El nombre es obligatorio").max(120, "Máximo 120 caracteres").trim(),
  email: z.email("Email inválido").max(160).trim().toLowerCase(),
  phone: z
    .string()
    .min(7, "Teléfono inválido")
    .max(30, "Máximo 30 caracteres")
    .regex(/^[\d\s+()\-]+$/, "Solo números y +, -, ( )"),
  documentType: z.enum(["CC", "CE", "NIT", "PP", "TI"]).optional(),
  documentNumber: z
    .string()
    .max(30)
    .regex(/^[\d-]*$/, "Solo números y guiones")
    .optional(),
});
export type ContactInput = z.infer<typeof ContactSchema>;

export const AddressSchema = z.object({
  city: z.string().min(2, "Ciudad obligatoria").max(80).trim(),
  department: z.string().min(2, "Departamento obligatorio").max(80).trim(),
  addressLine1: z.string().min(5, "Dirección requerida").max(200).trim(),
  addressLine2: z.string().max(200).trim().optional(),
  zip: z.string().max(10).optional(),
  notes: z.string().max(500).trim().optional(),
});
export type AddressInput = z.infer<typeof AddressSchema>;

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
