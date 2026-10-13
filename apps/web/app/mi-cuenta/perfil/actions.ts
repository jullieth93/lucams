/*
 * Server Action — editar perfil del cliente (nombre + teléfono + documento DIAN).
 * Gate con getCurrentCustomer; actualiza SOLO la fila del cliente logueado.
 *
 * Misma estandarización del checkout (lib/colombia-validators):
 *  - Nombre/apellido: solo letras, máx 3/2 palabras, se persisten con
 *    capitalizeName (title case que respeta de/del/la/las…).
 *  - Teléfono: llega del PhoneInput como "+<indicativo> <nacional>"; Colombia
 *    (+57) exige móvil de 10 dígitos y se persiste local, otro país "+dial+n".
 *  - Documento: validación POR TIPO con validateDocument (CC solo números,
 *    Pasaporte alfanumérico…); NIT de 9 dígitos sin DV recibe el dígito de
 *    verificación DIAN (calculateNitDV) al persistir.
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DocumentType as PrismaDocumentType } from "@lucams/db";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DocumentTypeSchema, DocumentNumberSchema } from "@/features/checkout/schemas";
import {
  NAME_REGEX,
  calculateNitDV,
  capitalizeName,
  countWords,
  getDocumentHelp,
  normalizePhoneWithDial,
  validateDocument,
} from "@/lib/colombia-validators";

// Nombre/apellido opcionales pero, si vienen, con la regla completa: letras,
// tope de palabras y normalización title-case (fail-closed igual que el form).
const OptionalNameSchema = (maxWords: number) =>
  z
    .string()
    .trim()
    .max(60, "Máximo 60 caracteres.")
    .refine((v) => !v || v.length >= 2, "Mínimo 2 caracteres.")
    .refine((v) => !v || NAME_REGEX.test(v), "Solo puede tener letras (sin números ni símbolos).")
    .refine((v) => !v || countWords(v) <= maxWords, `Máximo ${maxWords} palabras.`)
    .transform((v) => (v ? capitalizeName(v) : v));

const ProfileSchema = z
  .object({
    firstName: OptionalNameSchema(3),
    lastName: OptionalNameSchema(2),
    phone: z
      .string()
      .trim()
      .max(30, "Máximo 30 caracteres.")
      .refine((v) => !v || normalizePhoneWithDial(v) !== null, {
        message: "Teléfono inválido: en Colombia debe ser un móvil de 10 dígitos (300...).",
      })
      .transform((v) => (v ? (normalizePhoneWithDial(v) ?? v) : v)),
    documentType: DocumentTypeSchema.optional(),
    documentNumber: DocumentNumberSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Ambos o ninguno: medio documento no sirve para la DIAN ni para el courier.
    const hasType = Boolean(data.documentType);
    const hasNumber = Boolean(data.documentNumber?.trim());
    if (hasType !== hasNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message: "Completa el tipo y el número de documento, o deja ambos vacíos.",
      });
      return;
    }
    // Formato por tipo (misma regla del checkout): CC 6-10 dígitos, CE 6-7,
    // NIT 9 (+DV opcional), PP alfanumérico 6-12, TI 8-11.
    if (hasType && hasNumber && !validateDocument(data.documentType!, data.documentNumber!)) {
      ctx.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message: `Formato inválido. ${getDocumentHelp(data.documentType!)}`,
      });
    }
  });

export type ProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"firstName" | "lastName" | "phone" | "documentType" | "documentNumber", string[]>
  >;
};

export async function updateProfileAction(
  _prev: ProfileActionState | null,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await getCurrentCustomer();
  if (!session) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  // Cadena vacía → undefined (campos opcionales: "" no es un valor).
  const emptyToUndef = (v: string) => (v.trim() ? v.trim() : undefined);
  const parsed = ProfileSchema.safeParse({
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    documentType: emptyToUndef(String(formData.get("documentType") ?? "")),
    documentNumber: emptyToUndef(String(formData.get("documentNumber") ?? "")),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Revisa los datos.",
      fieldErrors: flat.fieldErrors as ProfileActionState["fieldErrors"],
    };
  }

  // Cadena vacía → null (no guardamos "" como valor).
  const norm = (v?: string) => (v && v.trim() ? v.trim() : null);
  // NIT de 9 dígitos sin dígito de verificación: se lo calculamos (DIAN,
  // módulo 11) y lo persistimos completo — mismo criterio del checkout.
  let documentNumber = norm(parsed.data.documentNumber);
  if (parsed.data.documentType === "NIT" && documentNumber && /^\d{9}$/.test(documentNumber)) {
    documentNumber = `${documentNumber}-${calculateNitDV(documentNumber)}`;
  }

  await prisma.customer.update({
    where: { id: session.customer.id },
    data: {
      firstName: norm(parsed.data.firstName),
      lastName: norm(parsed.data.lastName),
      phone: norm(parsed.data.phone),
      // El enum Zod del checkout calza 1:1 con el enum Prisma DocumentType.
      documentType: norm(parsed.data.documentType) as PrismaDocumentType | null,
      documentNumber,
      updatedBy: session.customer.id,
    },
  });

  logger.info({ event: "account.profile.updated", customerId: session.customer.id });
  revalidatePath("/mi-cuenta");
  revalidatePath("/mi-cuenta/perfil");
  return { success: "Tu perfil quedó actualizado ✨" };
}
