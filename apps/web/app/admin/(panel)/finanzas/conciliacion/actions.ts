"use server";

/*
 * Server actions — Conciliación de efectivo contraentrega (COD) · ADR-064.
 * Operación financiera → SUPERADMIN + MFA aal2 (mismo estándar que refundOrderAction). El guard vive
 * acá porque las Server Actions son endpoints POST invocables directo.
 */

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { markCodRemitted, flagCodDiscrepancy } from "@/features/orders/cod-reconciliation";
import { formatCOP } from "@/lib/format";

type ActionResult = { error?: string; success?: string };

/** Convierte un input en PESOS (lo que teclea Lucy) a centavos COP; vacío → undefined. */
function pesosToCents(raw: FormDataEntryValue | null): number | undefined {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const pesos = Number.parseInt(digits, 10);
  return Number.isFinite(pesos) ? pesos * 100 : undefined;
}

function revalidateReconciliation() {
  revalidatePath("/admin/finanzas/conciliacion");
  revalidatePath("/admin/finanzas");
  revalidatePath("/admin/pedidos");
}

export async function markCodRemittedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Falta el pedido" };
  const remittedAmount = pesosToCents(formData.get("remittedAmountPesos"));
  const carrierRef = String(formData.get("carrierRef") ?? "").trim() || undefined;
  const note = String(formData.get("note") ?? "").trim() || undefined;

  try {
    const res = await markCodRemitted(orderId, {
      adminId: session.admin.id,
      remittedAmount,
      carrierRef,
      note,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cod.mark_remitted",
      entityType: "Order",
      entityId: orderId,
      metadata: {
        expected: res.expectedAmount,
        remitted: res.remittedAmount,
        carrierRef: carrierRef ?? null,
      },
    });
    revalidateReconciliation();
    const short =
      res.remittedAmount === res.expectedAmount
        ? `Remesa de ${formatCOP(res.remittedAmount)} registrada para ${res.orderNumber}.`
        : `Remesa de ${formatCOP(res.remittedAmount)} registrada (esperado ${formatCOP(res.expectedAmount)}) para ${res.orderNumber}.`;
    return { success: short };
  } catch (err) {
    logger.warn({
      event: "admin.cod.remit_fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "No se pudo registrar la remesa" };
  }
}

export async function flagCodDiscrepancyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Falta el pedido" };
  const discrepancyReason = String(formData.get("discrepancyReason") ?? "").trim();
  if (!discrepancyReason) return { error: "Escribe el motivo de la discrepancia" };
  const remittedAmount = pesosToCents(formData.get("remittedAmountPesos"));
  const note = String(formData.get("note") ?? "").trim() || undefined;

  try {
    const res = await flagCodDiscrepancy(orderId, {
      adminId: session.admin.id,
      discrepancyReason,
      remittedAmount,
      note,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cod.flag_discrepancy",
      entityType: "Order",
      entityId: orderId,
      metadata: { expected: res.expectedAmount, reason: discrepancyReason },
    });
    revalidateReconciliation();
    return {
      success: `Discrepancia registrada para ${res.orderNumber}. Aparece marcada en Pedidos para seguimiento.`,
    };
  } catch (err) {
    logger.warn({
      event: "admin.cod.discrepancy_fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "No se pudo registrar la discrepancia" };
  }
}
