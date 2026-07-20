"use server";

/*
 * Server actions — Block-list del anti-abuso COD (ADR-065). Operación sensible (decide si un cliente
 * puede pagar contraentrega) → SUPERADMIN + MFA aal2, mismo estándar que la conciliación. El guard vive
 * acá porque las Server Actions son endpoints POST invocables directo.
 */

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  addBlockedIdentity,
  removeBlockedIdentity,
  BlocklistError,
} from "@/features/anti-abuse/blocklist-service";

type ActionResult = { error?: string; success?: string };

function revalidateBloqueos() {
  revalidatePath("/admin/finanzas/bloqueos");
}

export async function addBlockedIdentityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const kind = String(formData.get("kind") ?? "");
  const value = String(formData.get("value") ?? "");
  const reason = String(formData.get("reason") ?? "");
  // Desde el panel solo se teclean teléfono/email (la dirección se bloquea desde el pedido, que tiene
  // la clave normalizada). ADDRESS se acepta por si llega de otro flujo, pero no se ofrece en el form.
  if (kind !== "PHONE" && kind !== "EMAIL" && kind !== "ADDRESS") {
    return { error: "Tipo de identidad inválido." };
  }

  try {
    const row = await addBlockedIdentity({ kind, value, reason, createdBy: session.admin.id });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cod.blocklist.add",
      entityType: "BlockedIdentity",
      entityId: row.id,
      metadata: { kind: row.kind, value: row.value },
    });
    logger.info({ event: "admin.cod_blocklist.add", adminId: session.admin.id, kind: row.kind });
    revalidateBloqueos();
    return { success: "Identidad bloqueada. No podrá pagar contra entrega." };
  } catch (err) {
    if (err instanceof BlocklistError) return { error: err.message };
    throw err;
  }
}

export async function removeBlockedIdentityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta el bloqueo a retirar." };

  await removeBlockedIdentity(id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "cod.blocklist.remove",
    entityType: "BlockedIdentity",
    entityId: id,
  });
  logger.info({ event: "admin.cod_blocklist.remove", adminId: session.admin.id, id });
  revalidateBloqueos();
  return { success: "Bloqueo retirado." };
}
