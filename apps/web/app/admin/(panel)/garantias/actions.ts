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
  isWarrantyRefundMethod,
  parseCopPesosToCents,
  WARRANTY_RESOLUTIONS,
  WarrantyError,
  WarrantyTransitionError,
  type ResolveWarrantyRefundInput,
  type WarrantyResolution,
} from "@/features/warranty/service";
import { formatCOP } from "@/lib/format";
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
      case "REFUND_UNCONFIRMED":
        return "Debes confirmar que el dinero ya fue devuelto al cliente antes de cerrar la garantía.";
      case "REFUND_METHOD_INVALID":
        return "Selecciona un método de reembolso válido (Reversa Wompi o Transferencia bancaria).";
      case "REFUND_AMOUNT_INVALID":
        return "Ingresa un monto de reembolso válido mayor a $0 COP.";
      case "REFUND_EXCEEDS_AVAILABLE":
        return "El monto supera el efectivo disponible de la línea o del pedido (o el pedido ya figura reembolsado).";
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
  revalidatePath("/admin/metricas");
  revalidatePath("/admin/clientes");
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
  let refundInput: ResolveWarrantyRefundInput | undefined;
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

    const rawAmountPesos = String(fd.get("refundAmountPesos") ?? "").trim();
    const rawMethod = String(fd.get("refundMethod") ?? "").trim();
    const rawConfirmed = String(fd.get("refundConfirmed") ?? "").trim();
    const refundConfirmed = rawConfirmed === "true" || rawConfirmed === "on";
    if (!refundConfirmed) {
      return {
        error:
          "Debes confirmar que el dinero ya fue devuelto al cliente antes de cerrar la garantía.",
      };
    }
    if (!isWarrantyRefundMethod(rawMethod)) {
      return {
        error: "Selecciona un método de reembolso válido (Reversa Wompi o Transferencia bancaria).",
      };
    }
    const refundAmount = parseCopPesosToCents(rawAmountPesos);
    if (refundAmount === null) {
      return { error: "Ingresa un monto de reembolso válido en COP mayor a $0." };
    }
    refundInput = {
      refundAmount,
      refundMethod: rawMethod,
      refundConfirmed: true,
    };
  }

  try {
    await resolveWarrantyClaim(id, g.adminId, note || undefined, refundInput);
    // Aviso al cliente con el remedio aplicado (best-effort).
    await notifyWarrantyResolved(id).catch((e) =>
      logger.warn({ event: "admin.warranty.notify_resolved_fail", id, err: String(e) }),
    );
    await audit(g.adminId, "warranty.resolve", id, {
      resolutionType: current?.resolutionType ?? null,
      ...(refundInput
        ? { refundAmount: refundInput.refundAmount, refundMethod: refundInput.refundMethod }
        : {}),
    });
    const refundSummary = refundInput
      ? ` Reembolso de ${formatCOP(refundInput.refundAmount)} (${refundInput.refundMethod === "BANK_TRANSFER" ? "transferencia bancaria" : "reversa Wompi"}) registrado en Finanzas.`
      : "";
    return { success: `Garantía resuelta — cliente avisado.${refundSummary}` };
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
