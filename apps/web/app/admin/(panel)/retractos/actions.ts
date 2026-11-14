"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  approveRetract,
  assignRetractRequest,
  rejectRetract,
  markRetractReceived,
  refundRetract,
  RetractError,
  RetractTransitionError,
} from "@/features/retract/service";

type St = { error?: string; success?: string; reauthRequired?: boolean } | null;

async function guardOps(): Promise<{ adminId: string }> {
  const s = await requireAdminAction({ capability: "retract:manage" });
  return { adminId: s.admin.id };
}

async function guardSuper(): Promise<{ adminId: string }> {
  // Registrar reembolso es salida final de dinero → exclusivamente `retract:refund` (SUPERADMIN).
  const s = await requireAdminAction({ capability: "retract:refund" });
  return { adminId: s.admin.id };
}

function safeRetractErrorMessage(err: unknown): string {
  if (err instanceof RetractTransitionError) {
    return "Esta solicitud cambió de estado recientemente. Recarga la página para ver el estado actual.";
  }
  if (err instanceof RetractError) {
    switch (err.reason) {
      case "NOT_FOUND":
        return "No encontramos la solicitud de retracto.";
      case "FORBIDDEN":
        return "No tienes permisos para gestionar esta solicitud.";
      case "INVALID_ASSIGNEE":
        return "Selecciona un integrante activo del equipo de atención.";
      case "ALREADY_REQUESTED":
        return "Ya existe una solicitud de retracto para este producto.";
      case "NOT_DELIVERED":
        return "El pedido aún no figura como entregado.";
      case "OUT_OF_WINDOW":
        return "La solicitud supera la ventana legal de retracto.";
      case "PERSONALIZED":
        return "Los productos personalizados están exceptuados del retracto (Ley 1480 art. 47).";
    }
  }
  return "No pudimos procesar la solicitud en este momento. Inténtalo de nuevo.";
}

function fail(action: string, id: string, err: unknown): St {
  logger.warn({
    event: `admin.retract.${action}_fail`,
    id,
    err: err instanceof Error ? err.message : String(err),
  });
  return { error: safeRetractErrorMessage(err) };
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
  revalidatePath("/admin/hoy");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/finanzas");
  revalidatePath("/admin/pedidos");
}

export async function assignRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guardOps();
  const id = String(fd.get("id") ?? "").trim();
  const rawAssignee = String(fd.get("assignedToAdminId") ?? "").trim();
  if (!id) return { error: "Falta el identificador de la solicitud." };
  const assignedToAdminId = rawAssignee.length > 0 ? rawAssignee : null;
  try {
    await assignRetractRequest(id, assignedToAdminId);
    await audit(g.adminId, "retract.assign", id, { assignedToAdminId });
    return {
      success: assignedToAdminId ? "Responsable actualizado." : "Solicitud liberada sin asignar.",
    };
  } catch (err) {
    return fail("assign", id, err);
  }
}

export async function approveRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guardOps();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "Falta el identificador de la solicitud." };
  try {
    await approveRetract(id, g.adminId);
    await audit(g.adminId, "retract.approve", id);
    return { success: "Aprobado — enviamos las instrucciones de devolución al cliente." };
  } catch (err) {
    return fail("approve", id, err);
  }
}

export async function rejectRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guardOps();
  const id = String(fd.get("id") ?? "").trim();
  const note = String(fd.get("note") ?? "")
    .trim()
    .slice(0, 300);
  if (!id) return { error: "Falta el identificador de la solicitud." };
  if (!note) return { error: "Escribe el motivo del rechazo para informar al cliente." };
  try {
    await rejectRetract(id, g.adminId, note);
    await audit(g.adminId, "retract.reject", id, { note });
    return { success: "Solicitud rechazada — notificamos el motivo por correo." };
  } catch (err) {
    return fail("reject", id, err);
  }
}

export async function receiveRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guardOps();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "Falta el identificador de la solicitud." };
  try {
    await markRetractReceived(id, g.adminId);
    await audit(g.adminId, "retract.receive", id);
    return { success: "Producto recibido — listo para reembolso final." };
  } catch (err) {
    return fail("receive", id, err);
  }
}

export async function refundRetractAction(_p: St, fd: FormData): Promise<St> {
  const g = await guardSuper();
  // F-10: registrar un reembolso es salida final de dinero → aal2 RECIENTE + SUPERADMIN.
  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) return { error: MFA_REAUTH_MESSAGE, reauthRequired: true };
    throw err;
  }
  const id = String(fd.get("id") ?? "").trim();
  const method = String(fd.get("method") ?? "WOMPI_VOID");
  if (!id) return { error: "Falta el identificador de la solicitud." };
  const m = method === "BANK_TRANSFER" ? "BANK_TRANSFER" : "WOMPI_VOID";
  try {
    await refundRetract(id, g.adminId, m);
    await audit(g.adminId, "retract.refund", id, { method: m });
    return { success: "Reembolso registrado. Recuerda emitir el dinero en Wompi o banco." };
  } catch (err) {
    return fail("refund", id, err);
  }
}
