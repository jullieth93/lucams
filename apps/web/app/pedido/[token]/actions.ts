"use server";

/*
 * Server actions de /pedido/[token] (vista pública del pedido, guest checkout).
 *
 * Paquete I — "Volver a pedir" para invitados: el token público del link ES la
 * autorización (mismo lookup por hash que la página). El carrito y los diseños
 * clonados quedan a nombre de la sesión actual (o del customer si está logueado).
 */

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { getCurrentCustomer } from "@/lib/auth";
import { getOrCreateCartSession } from "@/lib/cart-session";
import { rateLimit } from "@/lib/rate-limit";
import { ownerKey } from "@/lib/rate-limit-keys";
import { reorderGuestOrder, type ReorderActionState } from "@/features/orders/reorder";

export async function reorderGuestAction(
  _prev: ReorderActionState | null,
  formData: FormData,
): Promise<ReorderActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!/^[a-f0-9]{32}$/.test(token)) return { error: "No encontramos ese pedido." };

  const customer = await getCurrentCustomer();
  const sessionId = await getOrCreateCartSession();

  // Mismo tope que el reorder registrado, por dueño del carrito (cada reorder clona bytes).
  const rl = await rateLimit(ownerKey("reorder", customer?.customer.id ?? sessionId), 10, 600);
  if (!rl.allowed) {
    return { error: "Ya agregamos este pedido a tu carrito. Revisa tu carrito antes de repetir." };
  }

  try {
    const summary = await reorderGuestOrder({
      token,
      sessionId,
      customerId: customer?.customer.id ?? null,
    });
    if (!summary) return { error: "No encontramos ese pedido." };
    revalidatePath("/carrito");
    revalidatePath("/", "layout");
    return { summary };
  } catch (err) {
    logger.error({
      event: "orders.reorder.guest_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos volver a armar tu pedido. Intenta de nuevo." };
  }
}
