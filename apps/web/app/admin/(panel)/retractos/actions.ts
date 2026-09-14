"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  approveRetract,
  rejectRetract,
  markRetractReceived,
  refundRetract,
} from "@/features/retract/service";

type St = { error?: string; success?: string; reauthRequired?: boolean } | null;

async function guard(): Promise<{ adminId: string } | { error: string }> {
  // Retractos incluye reembolsos → SUPERADMIN. Sesión + MFA aal2 + rol server-side
  // (ADR-062 P0-1); las Server Actions son endpoints POST invocables directo. El guard
  // redirige ante fallo; la rama {error} se conserva por tipo para los callers.
  const s = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  return { adminId: s.admin.id };
}

function fail(action: string, id: string, err: unknown): St {
  logger.warn({
    event: `admin.retract.${action}_fail`,
    id,
    err: err instanceof Error ? err.message : String(err),
  });
  return { error: err instanceof Error ? err.message : "Error inesperado" };
}

async function audit(
  adminId: string,
  action: string,
  id: string,
  metadata?: Record<string, unknown>,
) {
  await recordAdminAction({
    actorId: adminId,
    action,
    entityType: "RetractRequest",
    entityId: id,
    metadata,
  });
  revalidatePath("/admin/retractos");
}

export async function approveRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  if ("error" in g) return g;
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Falta id" };
  try {
    await approveRetract(id, g.adminId);
    await audit(g.adminId, "retract.approve", id);
    return { success: "Aprobado — instrucciones enviadas al cliente." };
  } catch (err) {
    return fail("approve", id, err);
  }
}

export async function rejectRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  if ("error" in g) return g;
  const id = String(fd.get("id") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  if (!id) return { error: "Falta id" };
  if (!note) return { error: "Escribe el motivo del rechazo." };
  try {
    await rejectRetract(id, g.adminId, note);
    await audit(g.adminId, "retract.reject", id, { note });
    return { success: "Solicitud rechazada." };
  } catch (err) {
    return fail("reject", id, err);
  }
}

export async function receiveRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  if ("error" in g) return g;
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Falta id" };
  try {
    await markRetractReceived(id, g.adminId);
    await audit(g.adminId, "retract.receive", id);
    return { success: "Marcado como recibido." };
  } catch (err) {
    return fail("receive", id, err);
  }
}

export async function refundRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  if ("error" in g) return g;
  // F-10 (auditoría 2026-09-04): registrar un reembolso es operación de dinero →
  // aal2 RECIENTE (mismo estándar que refundOrderAction). La UI abre el modal
  // TOTP ante `reauthRequired` y reintenta.
  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) return { error: MFA_REAUTH_MESSAGE, reauthRequired: true };
    throw err;
  }
  const id = String(fd.get("id") ?? "");
  const method = String(fd.get("method") ?? "WOMPI_VOID");
  if (!id) return { error: "Falta id" };
  const m = method === "BANK_TRANSFER" ? "BANK_TRANSFER" : "WOMPI_VOID";
  try {
    await refundRetract(id, g.adminId, m);
    await audit(g.adminId, "retract.refund", id, { method: m });
    return { success: "Reembolso registrado. Recuerda emitir el dinero manualmente." };
  } catch (err) {
    return fail("refund", id, err);
  }
}
