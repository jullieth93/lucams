/*
 * Server Action — editar perfil del cliente (nombre + teléfono).
 * Gate con getCurrentCustomer; actualiza SOLO la fila del cliente logueado.
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const ProfileSchema = z.object({
  firstName: z.string().trim().max(60, "Máximo 60 caracteres.").optional(),
  lastName: z.string().trim().max(60, "Máximo 60 caracteres.").optional(),
  phone: z
    .string()
    .trim()
    .max(20, "Máximo 20 caracteres.")
    .regex(/^[+\d\s()-]*$/, "Solo números, espacios y + ( ) -.")
    .optional(),
});

export type ProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"firstName" | "lastName" | "phone", string[]>>;
};

export async function updateProfileAction(
  _prev: ProfileActionState | null,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await getCurrentCustomer();
  if (!session) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const parsed = ProfileSchema.safeParse({
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
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
      updatedBy: session.customer.id,
    },
  });

  logger.info({ event: "account.profile.updated", customerId: session.customer.id });
  revalidatePath("/mi-cuenta");
  revalidatePath("/mi-cuenta/perfil");
  return { success: "Tu perfil quedó actualizado ✨" };
}
