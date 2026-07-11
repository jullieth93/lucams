/*
 * Server Actions — CRUD de direcciones del cliente. Todo gated con
 * getCurrentCustomer; el customerId sale de la sesión (nunca del formulario).
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@lucams/db";
import { getCurrentCustomer } from "@/lib/auth";
import { parseStructuredAddress } from "@/features/checkout/parse-address";
// composeAddressLine CANÓNICO (mismo que usa Aveonline/el courier) — incluye
// detail (urbano) y Ref (rural), a diferencia del duplicado lossy anterior.
import { composeAddressLine } from "@/features/checkout/schemas";
import {
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  AddressNotFoundError,
} from "@/features/addresses/service";

// Solo etiqueta + teléfono se validan acá; la dirección estructurada usa el mismo
// parseStructuredAddress + AddressSchema que el checkout (fuente única).
const LabelSchema = z.object({
  name: z.string().trim().min(1, "La etiqueta es obligatoria.").max(60, "Máximo 60 caracteres."),
  phone: z
    .string()
    .trim()
    .min(1, "El teléfono es obligatorio.")
    .max(20)
    .regex(/^[+\d\s()-]+$/, "Teléfono inválido."),
});

export type AddressActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function saveAddressAction(
  _prev: AddressActionState | null,
  formData: FormData,
): Promise<AddressActionState> {
  const session = await getCurrentCustomer();
  if (!session) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const label = LabelSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  const addr = parseStructuredAddress(formData);
  if (!label.success || !addr.ok) {
    return {
      error: "Revisa los datos.",
      fieldErrors: {
        ...(label.success ? {} : z.flattenError(label.error).fieldErrors),
        ...(addr.ok ? {} : addr.fieldErrors),
      },
    };
  }

  const structured = addr.data;
  const input = {
    name: label.data.name,
    phone: label.data.phone,
    isDefault: formData.get("isDefault") === "on",
    // line1 canónico ya incluye detail (urbano) / finca+Ref (rural), así que line2
    // queda null para no duplicar (revisión adversarial #3/#4/#9).
    line1: composeAddressLine(structured),
    line2: null,
    city: addr.cityName,
    department: addr.deptName,
    zip: structured.zip ?? null,
    // Se limpia undefined via round-trip JSON (Prisma.Json no acepta undefined).
    structured: JSON.parse(JSON.stringify(structured)) as Prisma.InputJsonValue,
  };

  const id = String(formData.get("id") ?? "").trim();
  try {
    if (id) {
      await updateAddress(session.customer.id, id, input);
    } else {
      await createAddress(session.customer.id, input);
    }
  } catch (err) {
    if (err instanceof AddressNotFoundError) return { error: "Esa dirección ya no existe." };
    // Colisión del índice parcial-único de "una sola default" (carrera de creates
    // concurrentes) → pedir reintento en vez de un 500.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return { error: "Hubo un conflicto momentáneo. Intenta guardar de nuevo." };
    }
    throw err;
  }
  revalidatePath("/mi-cuenta/direcciones");
  return { success: id ? "Dirección actualizada ✨" : "Dirección guardada ✨" };
}

export async function deleteAddressAction(id: string): Promise<{ ok: boolean }> {
  const session = await getCurrentCustomer();
  if (!session) return { ok: false };
  try {
    await deleteAddress(session.customer.id, id);
  } catch {
    return { ok: false };
  }
  revalidatePath("/mi-cuenta/direcciones");
  return { ok: true };
}

export async function setDefaultAddressAction(id: string): Promise<{ ok: boolean }> {
  const session = await getCurrentCustomer();
  if (!session) return { ok: false };
  try {
    await setDefaultAddress(session.customer.id, id);
  } catch {
    return { ok: false };
  }
  revalidatePath("/mi-cuenta/direcciones");
  return { ok: true };
}
