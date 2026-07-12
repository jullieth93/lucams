"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/auth";
import { ensureDesignShareToken, archiveCustomerDesign } from "@/features/personalization/service";

/**
 * Genera (o devuelve) el token público del diseño para compartirlo. El cliente arma
 * la URL con su propio origin (/d/<token>). Gated a dueño vía getCurrentCustomer.
 */
export async function shareDesignAction(
  designId: string,
): Promise<{ ok: boolean; token?: string }> {
  const session = await getCurrentCustomer();
  if (!session) return { ok: false };
  const token = await ensureDesignShareToken(designId, session.customer.id);
  if (!token) return { ok: false };
  return { ok: true, token };
}

/** Archiva un diseño (sale de "Mis diseños"). */
export async function archiveDesignAction(designId: string): Promise<{ ok: boolean }> {
  const session = await getCurrentCustomer();
  if (!session) return { ok: false };
  const ok = await archiveCustomerDesign(designId, session.customer.id);
  if (ok) revalidatePath("/mi-cuenta/disenos");
  return { ok };
}
