"use server";

/*
 * Server actions — Conciliación de efectivo contraentrega (COD) · ADR-064.
 * Operación financiera → SUPERADMIN + MFA aal2 (mismo estándar que refundOrderAction). El guard vive
 * acá porque las Server Actions son endpoints POST invocables directo.
 *
 * Fase 3D: setCodEnabledAction activa el ajuste CMS COD_ENABLED desde el
 * banner de la página (misma semántica que el editor de Ajustes del sitio:
 * saveCmsFieldDraft publica de inmediato los campos kind SETTING y se
 * invalida el tag "cms" para que el storefront lo vea ya).
 */

import { revalidatePath, updateTag } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { CmsValidationError, getCmsFieldByKey, saveCmsFieldDraft } from "@/features/cms/service";
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

/**
 * Activa la contraentrega (setting CMS COD_ENABLED = "true") desde el banner
 * de esta página. Mismo camino que el editor de Contenido › Ajustes del sitio:
 * el campo es kind SETTING → saveCmsFieldDraft lo publica al guardar, y el
 * checkout lo lee fail-closed (features/checkout/service.ts). SUPERADMIN
 * porque habilita una capacidad de cobro.
 */
export async function setCodEnabledAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  try {
    const field = await getCmsFieldByKey("COD_ENABLED");
    if (!field) {
      return {
        error:
          "No existe el ajuste COD_ENABLED. Créalo en Contenido › Ajustes del sitio (sección Comercio) y vuelve aquí.",
      };
    }
    if (field.kind !== "SETTING") {
      // Defensivo: un BLOCK queda en borrador al guardar y el sitio no lo
      // vería — el toggle prometería algo que no pasa.
      return {
        error:
          "El campo COD_ENABLED no es un ajuste (kind SETTING). Corrígelo desde Contenido › Ajustes del sitio.",
      };
    }
    await saveCmsFieldDraft({ id: field.id, body: "true" }, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.setting.cod_enabled",
      entityType: "CmsField",
      entityId: field.id,
      metadata: { key: "COD_ENABLED", value: "true" },
    });
    // El setting ya quedó publicado → el storefront lo debe ver al instante.
    updateTag("cms");
    revalidateReconciliation();
    revalidatePath("/admin/canales/tienda");
    return {
      success:
        "Contraentrega ACTIVADA. Los clientes ya pueden elegir «pago contra entrega» en el checkout.",
    };
  } catch (err) {
    if (err instanceof CmsValidationError) return { error: err.message };
    logger.warn({
      event: "admin.cod.enable_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No se pudo activar la contraentrega. Intenta de nuevo." };
  }
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
