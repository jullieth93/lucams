"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAdminAction } from "@/lib/admin-audit";
import { processPaidOrder } from "@/features/orders/saga";
import { transitionOrder } from "@/features/orders/service";

/**
 * Reintenta la saga post-PAID (útil cuando el primer intento falló por
 * dims faltantes, Aveonline temporalmente caído, etc.).
 *
 * No transiciona la Order — sólo invoca processPaidOrder con la actual.
 * Si la Order ya tiene tracking, processPaidOrder es idempotente y
 * devuelve already_processed.
 */
export async function retryShipmentAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "No autorizado" };

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Falta orderId" };

  try {
    const result = await processPaidOrder({ orderId });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "order.retry_shipment",
      entityType: "Order",
      entityId: orderId,
      metadata: { sagaStatus: result.status, trackingNumber: result.trackingNumber ?? null },
    });
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/[number]`, "page");
    if (result.status === "ok") {
      return { success: `Guía generada: ${result.trackingNumber}` };
    }
    if (result.status === "already_processed") {
      return { success: `Ya tenía tracking: ${result.trackingNumber}` };
    }
    return { error: result.reason ?? "Falló crear guía" };
  } catch (err) {
    logger.error({
      event: "admin.order.retry_shipment_fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "Error inesperado" };
  }
}

/**
 * Cambio de estado manual (admin force). Valida ORDER_TRANSITIONS.
 * Usado para marcar SHIPPED manualmente cuando admin despacha sin webhook
 * Aveonline (caso edge), o CANCELLED por incidencia.
 */
export async function transitionOrderAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "No autorizado" };

  const orderId = String(formData.get("orderId") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!orderId || !to) return { error: "Faltan parámetros" };

  try {
    await transitionOrder(orderId, to, { actorAdminId: session.admin.id });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "order.transition",
      entityType: "Order",
      entityId: orderId,
      metadata: { to },
    });
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/[number]`, "page");
    return { success: `Estado cambiado a ${to}` };
  } catch (err) {
    logger.warn({
      event: "admin.order.transition_fail",
      orderId,
      to,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "Error transicionando" };
  }
}
