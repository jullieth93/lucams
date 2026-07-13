"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAdminAction } from "@/lib/admin-audit";
import { processPaidOrder } from "@/features/orders/saga";
import { refundOrder, transitionOrder } from "@/features/orders/service";
import { sendOrderShipped, sendOrderDelivered, sendOrderCancelled } from "@/features/orders/emails";
import { formatCOP } from "@/lib/format";

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
  // Motivo opcional de la transición (ej. "cliente canceló", "dirección errada"). Queda en el
  // audit trail para saber POR QUÉ cambió el estado, no solo A QUÉ estado.
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!orderId || !to) return { error: "Faltan parámetros" };
  // REFUNDED debe pasar SIEMPRE por refundOrderAction (audita monto/quién/cuándo +
  // avisa al cliente + exige SUPERADMIN). Bloquearlo acá evita un reembolso "mudo".
  if (to === "REFUNDED") {
    return { error: "Para reembolsar usa el botón Reembolsar (registra auditoría y avisa al cliente)." };
  }

  try {
    await transitionOrder(orderId, to, { actorAdminId: session.admin.id });

    // Auditoría 2026-07-13: el path manual también avisa al cliente (antes solo la saga
    // del webhook lo hacía). Idempotente (idempotencyKey de Resend) y best-effort (un fallo
    // de email nunca rompe la transición). CANCELLED aquí es siempre manual (no pago-rechazado).
    if (to === "SHIPPED") await sendOrderShipped(orderId);
    else if (to === "DELIVERED") await sendOrderDelivered(orderId);
    else if (to === "CANCELLED") await sendOrderCancelled(orderId, reason || null);

    await recordAdminAction({
      actorId: session.admin.id,
      action: "order.transition",
      entityType: "Order",
      entityId: orderId,
      metadata: reason ? { to, reason } : { to },
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

/**
 * F2 — Reembolso desde admin. Marca la orden REFUNDED (revierte stock + audita
 * quién/cuándo/motivo/monto) y dispara el email al cliente. El DINERO en Wompi se
 * mueve MANUALMENTE: el mensaje de éxito se lo recuerda al admin. Solo aplica a
 * órdenes PAID o DELIVERED (la máquina de estados lo valida).
 */
export async function refundOrderAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "No autorizado" };
  // El reembolso es una operación financiera → SUPERADMIN, igual que finanzas/
  // cupones/retractos. La gate de rol vive acá porque las Server Actions son
  // endpoints POST invocables directamente (la page no las protege).
  if (session.admin.role !== "SUPERADMIN") {
    return { error: "Solo un administrador principal puede emitir reembolsos." };
  }

  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orderId) return { error: "Falta orderId" };

  try {
    const res = await refundOrder(orderId, {
      adminId: session.admin.id,
      reason: reason || undefined,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "order.refund",
      entityType: "Order",
      entityId: orderId,
      metadata: { status: res.status, amount: res.amount, reason: reason || null },
    });
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/[number]`, "page");
    if (res.status === "already_refunded") {
      return { success: "La orden ya estaba reembolsada." };
    }
    return {
      success: `Reembolso de ${formatCOP(res.amount)} registrado. Recuerda emitir el dinero en Wompi manualmente.`,
    };
  } catch (err) {
    logger.warn({
      event: "admin.order.refund_fail",
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : "Error al reembolsar" };
  }
}
