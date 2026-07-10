"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { getCurrentCustomer } from "@/lib/auth";
import { createRetractRequest, RetractError } from "@/features/retract/service";

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
    await createRetractRequest(orderItemId, { customerId: session.customer.id, reason });
    revalidatePath("/mi-cuenta/pedidos/[number]", "page");
    return {
      success:
        "¡Listo! Recibimos tu solicitud de retracto. Te escribiremos para coordinar la devolución.",
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
