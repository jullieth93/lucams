"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/auth";
import {
  ensureDesignShareToken,
  archiveCustomerDesign,
  revokeDesignShareToken,
} from "@/features/personalization/service";

/**
 * Genera el token público del diseño para compartirlo. Si ya había un link activo
 * lo ROTA (F-11: en DB solo vive el hash, el plano no se puede releer) — la UI lo
 * advierte con un toast. El cliente arma la URL con su propio origin (/d/<token>).
 * Gated a dueño vía getCurrentCustomer.
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

/** #17 — Deja de compartir un diseño (revoca el link /d/<token>) SIN archivarlo. */
export async function revokeShareAction(designId: string): Promise<{ ok: boolean }> {
  const session = await getCurrentCustomer();
  if (!session) return { ok: false };
  const ok = await revokeDesignShareToken(designId, session.customer.id);
  if (ok) revalidatePath("/mi-cuenta/disenos");
  return { ok };
}
