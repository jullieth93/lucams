/*
 * Server Action — editar perfil del cliente (nombre + teléfono + documento DIAN).
 * Gate con getCurrentCustomer; actualiza SOLO la fila del cliente logueado.
 *
 * El documento (tipo + número) usa la MISMA regla del checkout
 * (features/checkout/schemas.ts) y es editable siempre: el cliente puede
 * corregirlo (a diferencia del autollenado del checkout, que no pisa).
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DocumentType as PrismaDocumentType } from "@lucams/db";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DocumentTypeSchema, DocumentNumberSchema } from "@/features/checkout/schemas";

const ProfileSchema = z
  .object({
    firstName: z.string().trim().max(60, "Máximo 60 caracteres.").optional(),
    lastName: z.string().trim().max(60, "Máximo 60 caracteres.").optional(),
    phone: z
      .string()
      .trim()
      .max(20, "Máximo 20 caracteres.")
      .regex(/^[+\d\s()-]*$/, "Solo números, espacios y + ( ) -.")
      .optional(),
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
  await prisma.customer.update({
    where: { id: session.customer.id },
    data: {
      firstName: norm(parsed.data.firstName),
      lastName: norm(parsed.data.lastName),
      phone: norm(parsed.data.phone),
      // El enum Zod del checkout calza 1:1 con el enum Prisma DocumentType.
      documentType: norm(parsed.data.documentType) as PrismaDocumentType | null,
      documentNumber: norm(parsed.data.documentNumber),
      updatedBy: session.customer.id,
    },
  });

  logger.info({ event: "account.profile.updated", customerId: session.customer.id });
  revalidatePath("/mi-cuenta");
  revalidatePath("/mi-cuenta/perfil");
  return { success: "Tu perfil quedó actualizado ✨" };
}
