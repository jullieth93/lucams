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
import { BILLING_DOCUMENT_ENABLED } from "./billing-document";
import {
  DESTINATION_CONFIG,
  DESTINATION_REQUIRED_ERRORS,
  DESTINATION_TYPES,
  type DestinationField,
} from "./destination-types";
import {
  NAME_REGEX,
  PHONE_REGEX,
  cruceNumberError,
  viaNumberError,
} from "@/lib/colombia-validators";

// Regla ÚNICA de documento de identidad (DIAN) — la reusan el checkout
// (ContactSchema) y el perfil del cliente (/mi-cuenta/perfil, T7 2026-10-01)
// para que ambos acepten exactamente lo mismo.
export const DOCUMENT_TYPES = ["CC", "CE", "NIT", "PP", "TI"] as const;
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);
export const DocumentNumberSchema = z
  .string()
  .min(6, "Mínimo 6 caracteres")
  .max(15, "Máximo 15 caracteres");

export const ContactSchema = z.object({
  fullName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "Máximo 120 caracteres")
    // Regex central de nombre (lib/colombia-validators) — fuente única.
    .regex(NAME_REGEX, "El nombre solo puede tener letras")
    .trim(),
  email: z.email("Email inválido").max(254).trim().toLowerCase(),
  // Móvil colombiano: 10 dígitos empezando con 3 (sin espacios al persistir).
  phone: z.string().regex(PHONE_REGEX, "Debe ser un móvil colombiano de 10 dígitos (300...)"),
  documentType: DocumentTypeSchema.optional(),
  documentNumber: DocumentNumberSchema.optional(),
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
 * 2026-10 (anti-devoluciones): la urbana gana `destinationType` (casa /
 * edificio / conjunto_torres / conjunto_casas / oficina) con campos
 * estructurados por tipo (apto, torre, casa, oficina…) y obligatoriedad por
 * tipo vía superRefine. `destinationType` es OPCIONAL en el schema para que
 * las direcciones/órdenes viejas sigan parseando; el FORM lo exige (y el
 * parser FormData lo re-valida en server). La rural gana `altPhone`
 * (teléfono alternativo en la zona — la causa #1 de devolución rural es que
 * el mensajero no localiza a nadie).
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
  // Zona de entrega (id de lib/lucams-zones.ts) — solo ciudades del catálogo.
  // Es DATO DE DIRECCIÓN: la pide siempre el checkout cuando la ciudad está en
  // el catálogo, y además alimenta la oferta de envío propio "Envío Lucams".
  // Nombre histórico "localityId" (V1 solo-Bogotá): representa la zona genérica
  // (localidad, comuna, …). Opcional en el schema: la obligatoriedad la decide
  // el server según el catálogo de zonas (getZoneCityByCode), no según las
  // settings del envío propio.
  localityId: z.string().max(60).trim().optional(),
  // Barrio (texto libre) — opcional para TODAS las ciudades; convive con la
  // zona/localidad (no son lo mismo: la zona es del catálogo, el barrio es libre).
  neighborhood: z.string().max(100).trim().optional(),
  notes: z.string().max(500).trim().optional(),
});

// Nomenclatura colombiana completa (Lucy 2026-05-21):
//   Carrera 7A Bis Sur # 23-45  → viaType=Carrera, viaNumber=7A, viaBis=true,
//                                  viaCardinal=Sur, cruceNumber=23-45
//
// viaNumber: dígitos + letras (7A, 13B, 100). Regex permite "100", "13B", "7AB".
// cruceNumber: NN-NN con letras opcionales (15-20, 13B-42, 100A-25C).
// Los mensajes de error los dan viaNumberError/cruceNumberError
// (lib/colombia-validators.ts) — heurística con mensaje ESPECÍFICO de qué
// falta ("Falta el número después del guion…"), compartida con la validación
// cliente del checkout (fix QA STG 2026-10: "Calle 3 sur #" incompleta).
const UrbanAddressSchema = BaseAddressFields.extend({
  kind: z.literal("urban"),
  viaType: z.enum(VIA_TYPES, { message: "Tipo de vía inválido" }),
  viaNumber: z
    .string()
    .max(10)
    .superRefine((val, ctx) => {
      const msg = viaNumberError(val);
      if (msg) ctx.addIssue({ code: "custom", message: msg });
    }),
  viaBis: z.boolean().optional(),
  viaCardinal: z.enum(CARDINAL_POINTS).optional(),
  cruceNumber: z
    .string()
    .max(20)
    .superRefine((val, ctx) => {
      const msg = cruceNumberError(val);
      if (msg) ctx.addIssue({ code: "custom", message: msg });
    }),
  cruceCardinal: z.enum(CARDINAL_POINTS).optional(),
  // Tipo de destino + campos estructurados (2026-10, anti-devoluciones).
  // Opcionales en el schema (backward-compat con direcciones guardadas y
  // órdenes viejas); la obligatoriedad por tipo va en el superRefine de abajo
  // y la presencia del tipo la exige el parser FormData (capturas nuevas).
  destinationType: z.enum(DESTINATION_TYPES, { message: "Tipo de destino inválido" }).optional(),
  apartment: z.string().max(20).trim().optional(),
  tower: z.string().max(20).trim().optional(),
  houseNumber: z.string().max(20).trim().optional(),
  blockCode: z.string().max(20).trim().optional(),
  complexName: z.string().max(100).trim().optional(),
  floor: z.string().max(10).trim().optional(),
  buildingName: z.string().max(100).trim().optional(),
  officeNumber: z.string().max(20).trim().optional(),
  companyName: z.string().max(120).trim().optional(),
  referencePoint: z.string().max(200).trim().optional(),
  // Texto libre LEGACY: direcciones viejas siguen parseando; si hay campos
  // estructurados, composeAddressLine los prefiere sobre `detail`.
  detail: z.string().max(200).trim().optional(),
}).superRefine((val, ctx) => {
  // Obligatoriedad por tipo de destino (DESTINATION_CONFIG.required). Sin
  // destinationType (legacy) no se exige nada — el form lo pide siempre.
  if (!val.destinationType) return;
  for (const field of DESTINATION_CONFIG[val.destinationType].required) {
    if (!val[field]?.trim()) {
      ctx.addIssue({ code: "custom", message: DESTINATION_REQUIRED_ERRORS[field], path: [field] });
    }
  }
});

const RuralAddressSchema = BaseAddressFields.extend({
  kind: z.literal("rural"),
  vereda: z.string().min(2, "Vereda / corregimiento / sector requerido").max(120).trim(),
  finca: z.string().max(120).trim().optional(),
  // Teléfono alternativo EN LA ZONA (2026-10): si el mensajero no localiza al
  // destinatario, llama a este número. Móvil colombiano (misma PHONE_REGEX del
  // teléfono de contacto); se compone al final de la línea como "Tel. zona: X".
  altPhone: z
    .string()
    .regex(PHONE_REGEX, "Debe ser un móvil colombiano de 10 dígitos (300...)")
    .optional(),
  referencia: z
    .string()
    .min(
      20,
      "Indicaciones para llegar: mínimo 20 caracteres (ej. 'a 200 m del puente, casa azul portón negro')",
    )
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
 * Sufijo entre paréntesis de la dirección urbana (2026-10, anti-devoluciones):
 * los campos estructurados del tipo de destino en el orden pensado para el
 * mensajero — identificador de unidad primero (apto/casa/oficina), contenedores
 * después (torre, manzana, edificio, conjunto, empresa) y la referencia al final:
 *
 *   "Apto 401, Torre B, Conjunto Lucams · Ref: portería norte"
 *
 * Fallback: si no hay nada estructurado se conserva el `detail` legacy.
 * Devuelve null cuando no hay sufijo (ni estructurado ni detail).
 * Lo reusa la vista previa del checkout para que el cliente vea EXACTAMENTE
 * lo que va a la guía (por eso acepta un Partial: el form pasa solo los
 * campos del destino que tiene en estado).
 */
export function composeDestinationSuffix(
  input: Partial<Pick<UrbanAddressInput, DestinationField | "detail">>,
): string | null {
  const parts: string[] = [];
  if (input.apartment?.trim()) parts.push(`Apto ${input.apartment.trim()}`);
  if (input.officeNumber?.trim()) parts.push(`Oficina ${input.officeNumber.trim()}`);
  if (input.houseNumber?.trim()) parts.push(`Casa ${input.houseNumber.trim()}`);
  if (input.floor?.trim()) parts.push(`Piso ${input.floor.trim()}`);
  if (input.tower?.trim()) parts.push(`Torre ${input.tower.trim()}`);
  if (input.blockCode?.trim()) parts.push(`Mz ${input.blockCode.trim()}`);
  if (input.buildingName?.trim()) parts.push(input.buildingName.trim());
  if (input.complexName?.trim()) parts.push(input.complexName.trim());
  if (input.companyName?.trim()) parts.push(input.companyName.trim());
  if (parts.length === 0 && !input.referencePoint?.trim()) {
    const legacy = input.detail?.trim();
    return legacy || null;
  }
  let suffix = parts.join(", ");
  const ref = input.referencePoint?.trim();
  if (ref) suffix = suffix ? `${suffix} · Ref: ${ref}` : `Ref: ${ref}`;
  return suffix || null;
}

/**
 * Junta la dirección en un string que el courier (Aveonline) recibe.
 *
 *   Urbana: "Calle 100 # 15-20 (Apto 401, Torre B, Conjunto Lucams · Ref: portería norte)"
 *   Rural:  "Vereda El Roble · Finca Las Flores · Ref: a 200 m del puente,
 *           casa azul portón negro · Tel. zona: 3001234567"
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
    const suffix = composeDestinationSuffix(input);
    return suffix ? `${base} (${suffix})` : base;
  }
  // Rural
  const parts: string[] = [`Vereda ${input.vereda}`];
  if (input.finca?.trim()) parts.push(`Finca ${input.finca.trim()}`);
  parts.push(`Ref: ${input.referencia}`);
  if (input.altPhone?.trim()) parts.push(`Tel. zona: ${input.altPhone.trim()}`);
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
      // 2026-10-20 — con el documento tributario apagado (BILLING_DOCUMENT_ENABLED,
      // owner: persona natural sin trámites DIAN) el schema no exige nada.
      if (!BILLING_DOCUMENT_ENABLED) return true;
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
 * FLUJO REGALO — destinatario distinto del comprador ("compro yo, lo recibe
 * otra persona"). saveDatosAction lo valida SOLO cuando el toggle del form
 * está on; con el toggle off no se envía nada y el state queda gift=null.
 * El mensaje de la tarjeta solo se conserva si isGift está marcado.
 */
export const GiftSchema = z.object({
  recipientName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "Máximo 120 caracteres")
    // Regex central de nombre (lib/colombia-validators) — fuente única.
    .regex(NAME_REGEX, "El nombre solo puede tener letras")
    .trim(),
  recipientPhone: z
    .string()
    .regex(PHONE_REGEX, "Debe ser un móvil colombiano de 10 dígitos (300...)"),
  isGift: z.boolean(),
  giftMessage: z.string().max(300, "Máximo 300 caracteres").trim().optional(),
});
export type GiftInput = z.infer<typeof GiftSchema>;

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
