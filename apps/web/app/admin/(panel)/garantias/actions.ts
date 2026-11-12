"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import type { AdminRole } from "@lucams/db";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { hasCapability } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  assignWarrantyClaim,
  reviewWarrantyClaim,
  approveWarrantyClaim,
  resolveWarrantyClaim,
  rejectWarrantyClaim,
  WARRANTY_RESOLUTIONS,
  WarrantyError,
  WarrantyTransitionError,
  type WarrantyResolution,
} from "@/features/warranty/service";
import { notifyWarrantyRejected, notifyWarrantyResolved } from "@/features/warranty/notify";

type St = { error?: string; success?: string; reauthRequired?: boolean } | null;

async function guard(): Promise<{ adminId: string; role: AdminRole }> {
  // Sesión + MFA aal2 + capacidad warranty:manage server-side (ADR-062 P0-1 + S17 + Bloque 6).
  const s = await requireAdminAction({ capability: "warranty:manage" });
  return { adminId: s.admin.id, role: s.admin.role };
}

function safeWarrantyErrorMessage(err: unknown): string {
  if (err instanceof WarrantyTransitionError) {
    return "Este reclamo cambió de estado recientemente. Recarga la página para ver el estado actual.";
  }
  if (err instanceof WarrantyError) {
    switch (err.reason) {
      case "NOT_FOUND":
        return "No encontramos el reclamo de garantía.";
      case "FORBIDDEN":
        return "No tienes permisos para gestionar este reclamo.";
      case "INVALID_ASSIGNEE":
        return "Selecciona un integrante activo del equipo de atención.";
      case "NOT_DELIVERED":
        return "El pedido aún no figura como entregado.";
      case "OUT_OF_WARRANTY":
        return "El producto se encuentra fuera de la ventana de garantía.";
      case "ACTIVE_CLAIM":
        return "Ya existe un reclamo activo para este producto.";
      case "INVALID":
        return "Revisa los datos ingresados e inténtalo de nuevo.";
    }
  }
  return "No pudimos procesar el reclamo en este momento. Inténtalo de nuevo.";
}

function fail(action: string, id: string, err: unknown): St {
  logger.warn({
    event: `admin.warranty.${action}_fail`,
    id,
    err: err instanceof Error ? err.message : String(err),
  });
  return { error: safeWarrantyErrorMessage(err) };
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
    entityType: "WarrantyClaim",
    entityId: id,
    metadata,
  });
  revalidatePath("/admin/garantias");
  revalidatePath("/admin/hoy");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/finanzas");
  revalidatePath("/admin/pedidos");
}

export async function assignWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  const id = String(fd.get("id") ?? "").trim();
  const rawAssignee = String(fd.get("assignedToAdminId") ?? "").trim();
  if (!id) return { error: "Falta el identificador del reclamo." };
  const assignedToAdminId = rawAssignee.length > 0 ? rawAssignee : null;
  try {
    await assignWarrantyClaim(id, assignedToAdminId);
    await audit(g.adminId, "warranty.assign", id, { assignedToAdminId });
    return {
      success: assignedToAdminId ? "Responsable actualizado." : "Reclamo liberado sin asignar.",
    };
  } catch (err) {
    return fail("assign", id, err);
  }
}

export async function reviewWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "Falta el identificador del reclamo." };
  try {
    await reviewWarrantyClaim(id, g.adminId);
    await audit(g.adminId, "warranty.review", id);
    return { success: "Reclamo puesto en diagnóstico." };
  } catch (err) {
    return fail("review", id, err);
  }
}

export async function approveWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  const id = String(fd.get("id") ?? "").trim();
  const resolution = String(fd.get("resolution") ?? "") as WarrantyResolution;
  if (!id) return { error: "Falta el identificador del reclamo." };
  if (!WARRANTY_RESOLUTIONS.includes(resolution)) return { error: "Elige un remedio legal." };
  if (resolution === "REFUND") {
    if (!hasCapability(g.role, "warranty:refund")) {
      return {
        error:
          "Solo Superadmin puede autorizar devoluciones de dinero en garantías. Escálalo para aprobación.",
      };
    }
    try {
      await requireRecentMfa();
    } catch (err) {
      if (isMfaReauthRequired(err)) return { error: MFA_REAUTH_MESSAGE, reauthRequired: true };
      throw err;
    }
  }
  try {
    await approveWarrantyClaim(id, g.adminId, resolution);
    await audit(g.adminId, "warranty.approve", id, { resolution });
    return { success: "Aprobado — remedio legal en ejecución." };
  } catch (err) {
    return fail("approve", id, err);
  }
}

export async function resolveWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  const id = String(fd.get("id") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim();
  if (!id) return { error: "Falta el identificador del reclamo." };

  const current = await prisma.warrantyClaim.findUnique({
    where: { id },
    select: { resolutionType: true },
  });
  if (current?.resolutionType === "REFUND") {
    if (!hasCapability(g.role, "warranty:refund")) {
      return {
        error:
          "Solo Superadmin puede cerrar garantías con devolución de dinero. Escálalo para ejecución.",
      };
    }
    try {
      await requireRecentMfa();
    } catch (err) {
      if (isMfaReauthRequired(err)) return { error: MFA_REAUTH_MESSAGE, reauthRequired: true };
      throw err;
    }
  }

  try {
    await resolveWarrantyClaim(id, g.adminId, note || undefined);
    // Aviso al cliente con el remedio aplicado (best-effort).
    await notifyWarrantyResolved(id).catch((e) =>
      logger.warn({ event: "admin.warranty.notify_resolved_fail", id, err: String(e) }),
    );
    await audit(g.adminId, "warranty.resolve", id, {
      resolutionType: current?.resolutionType ?? null,
    });
    // Remedio REFUND: el dinero se emite MANUAL en Wompi/transferencia y queda
    // fuera de todo tracking — el aviso en pantalla es el recordatorio operativo
    // (además del aviso persistente junto al estado en la lista).
    const closed = await prisma.warrantyClaim.findUnique({
      where: { id },
      select: {
        resolutionType: true,
        orderItem: { select: { order: { select: { number: true } } } },
      },
    });
    const refundReminder =
      closed?.resolutionType === "REFUND"
        ? ` Recuerda emitir la devolución manual en Wompi o transferencia y dejar constancia en el pedido ${closed.orderItem.order.number}.`
        : "";
    return { success: `Garantía resuelta — cliente avisado.${refundReminder}` };
  } catch (err) {
    return fail("resolve", id, err);
  }
}

export async function rejectWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  const id = String(fd.get("id") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim();
  if (!id) return { error: "Falta el identificador del reclamo." };
  if (!note) return { error: "Escribe el motivo del rechazo para informar al cliente." };
  try {
    await rejectWarrantyClaim(id, g.adminId, note);
    await notifyWarrantyRejected(id).catch((e) =>
      logger.warn({ event: "admin.warranty.notify_rejected_fail", id, err: String(e) }),
    );
    await audit(g.adminId, "warranty.reject", id, { note });
    return { success: "Reclamo rechazado — notificamos el motivo por correo." };
  } catch (err) {
    return fail("reject", id, err);
  }
}
