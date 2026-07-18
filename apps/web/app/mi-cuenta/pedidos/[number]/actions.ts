"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { getCurrentCustomer } from "@/lib/auth";
import { createRetractRequest, RetractError } from "@/features/retract/service";
import { sendRetractRequested } from "@/features/retract/emails";
import { createWarrantyClaim, WarrantyError } from "@/features/warranty/service";
import { notifyWarrantyClaimCreated } from "@/features/warranty/notify";

const REASON_MESSAGES: Record<string, string> = {
  NOT_FOUND: "No encontramos ese producto en tu pedido.",
  FORBIDDEN: "Ese pedido no es tuyo.",
  ALREADY_REQUESTED: "Ya solicitaste el retracto de este producto.",
  NOT_DELIVERED: "Solo puedes retractarte de pedidos ya entregados.",
  OUT_OF_WINDOW: "Pasaron los 5 días hábiles para retractarte de este producto.",
  PERSONALIZED: "Los productos personalizados no tienen derecho de retracto (ley).",
};

/**
 * F3 — el cliente solicita el retracto de un item entregado. La elegibilidad se
 * re-valida en el servicio (ventana, personalización, pertenencia).
 */
export async function requestRetractAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await getCurrentCustomer();
  if (!session) return { error: "Inicia sesión para solicitar un retracto." };

  const orderItemId = String(formData.get("orderItemId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orderItemId) return { error: "Falta el producto." };

  try {
    const { id } = await createRetractRequest(orderItemId, {
      customerId: session.customer.id,
      reason,
    });
    // H7 — acuse al cliente (comprobante legal) + aviso interno a Lucy (best-effort, no bloquea).
    await sendRetractRequested(id);
    revalidatePath("/mi-cuenta/pedidos/[number]", "page");
    return {
      success:
        "¡Listo! Recibimos tu solicitud de retracto. Te enviamos un correo de confirmación y te escribiremos para coordinar la devolución.",
    };
  } catch (err) {
    if (err instanceof RetractError) {
      return { error: REASON_MESSAGES[err.reason] ?? "No pudimos procesar tu solicitud." };
    }
    logger.error({
      event: "retract.request.fail",
      orderItemId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos procesar tu solicitud. Intenta de nuevo." };
  }
}

const WARRANTY_REASON_MESSAGES: Record<string, string> = {
  NOT_FOUND: "No encontramos ese producto en tu pedido.",
  FORBIDDEN: "Ese pedido no es tuyo.",
  NOT_DELIVERED: "Solo puedes reclamar garantía de pedidos ya entregados.",
  OUT_OF_WARRANTY: "Este producto ya está fuera del periodo de garantía.",
  ACTIVE_CLAIM: "Ya tienes un reclamo de garantía en curso para este producto.",
  INVALID: "Cuéntanos un poco más sobre la falla (mínimo 10 caracteres).",
};

/**
 * Garantía (Ley 1480) — el cliente reporta un defecto de un item entregado. La elegibilidad
 * (entrega, ventana warrantyMonths, no-duplicado, pertenencia) se re-valida en el servicio.
 */
export async function requestWarrantyAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const session = await getCurrentCustomer();
  if (!session) return { error: "Inicia sesión para reportar una garantía." };

  const orderItemId = String(formData.get("orderItemId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (!orderItemId) return { error: "Falta el producto." };
  if (description.length < 10) return { error: WARRANTY_REASON_MESSAGES.INVALID };

  try {
    const claim = await createWarrantyClaim({
      orderItemId,
      customerId: session.customer.id,
      description,
    });
    // Notificación best-effort (no bloquea la creación si el email falla).
    await notifyWarrantyClaimCreated(claim.id).catch((e) =>
      logger.warn({ event: "warranty.notify_created_fail", claimId: claim.id, err: String(e) }),
    );
    revalidatePath("/mi-cuenta/pedidos/[number]", "page");
    return {
      success:
        "¡Listo! Recibimos tu reclamo de garantía. Lo revisamos y te escribiremos con la solución.",
    };
  } catch (err) {
    if (err instanceof WarrantyError) {
      return { error: WARRANTY_REASON_MESSAGES[err.reason] ?? "No pudimos procesar tu reclamo." };
    }
    logger.error({
      event: "warranty.request.fail",
      orderItemId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos procesar tu reclamo. Intenta de nuevo." };
  }
}
