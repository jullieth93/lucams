/*
 * Server Actions — CRUD de direcciones del cliente. Todo gated con
 * getCurrentCustomer; el customerId sale de la sesión (nunca del formulario).
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth";
import {
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  AddressNotFoundError,
} from "@/features/addresses/service";

const req = (label: string, max: number) =>
  z.string().trim().min(1, `${label} es obligatorio.`).max(max, `Máximo ${max} caracteres.`);

const AddressSchema = z.object({
  name: req("El nombre", 60),
  line1: req("La dirección", 120),
  line2: z.string().trim().max(120).optional(),
  city: req("La ciudad", 60),
  department: req("El departamento", 60),
  zip: z.string().trim().max(12).optional(),
  phone: req("El teléfono", 20).regex(/^[+\d\s()-]+$/, "Teléfono inválido."),
  isDefault: z.boolean().optional(),
});

export type AddressActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof AddressSchema>, string[]>>;
};

function parse(formData: FormData) {
  return AddressSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    line1: String(formData.get("line1") ?? ""),
    line2: String(formData.get("line2") ?? ""),
    city: String(formData.get("city") ?? ""),
    department: String(formData.get("department") ?? ""),
    zip: String(formData.get("zip") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    isDefault: formData.get("isDefault") === "on",
  });
}

export async function saveAddressAction(
  _prev: AddressActionState | null,
  formData: FormData,
): Promise<AddressActionState> {
  const session = await getCurrentCustomer();
  if (!session) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const parsed = parse(formData);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Revisa los datos.",
      fieldErrors: flat.fieldErrors as AddressActionState["fieldErrors"],
    };
  }

  const id = String(formData.get("id") ?? "").trim();
  try {
    if (id) {
      await updateAddress(session.customer.id, id, parsed.data);
    } else {
      await createAddress(session.customer.id, parsed.data);
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
