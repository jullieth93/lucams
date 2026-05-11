/*
 * Server actions del carrito.
 *
 * Cubre añadir, actualizar qty y remover. Las tres consultan/crean el
 * cart via lib/cart-session (cookie sessionId), llaman al service y
 * revalidan las paths impactadas.
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addProductToCart,
  CartError,
  removeCartItem,
  updateCartItemQty,
} from "@/features/cart/service";
import { getCurrentCustomer } from "@/lib/auth";
import { getOrCreateCartSession, peekCartSession } from "@/lib/cart-session";
import { logger } from "@/lib/logger";

function errorMessage(err: unknown): string {
  if (err instanceof CartError) {
    switch (err.code) {
      case "PRODUCT_NOT_FOUND":
        return "Este producto ya no está disponible.";
      case "NO_DEFAULT_VARIANT":
        return "Producto no comprable (sin variante).";
      case "QTY_INVALID":
        return "Cantidad inválida.";
      case "ITEM_NOT_FOUND":
        return "Ese ítem ya no está en tu carrito.";
    }
  }
  return "Algo salió mal. Reintenta.";
}

export async function addToCartAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const qty = Math.max(1, Number(formData.get("qty") ?? 1));
  const returnTo = String(formData.get("returnTo") ?? "/carrito");

  if (!slug) redirect(returnTo);

  const sessionId = await getOrCreateCartSession();
  const customer = await getCurrentCustomer();

  try {
    await addProductToCart({
      sessionId,
      customerId: customer?.customer.id ?? null,
      productSlug: slug,
      qty,
    });
    logger.info({
      event: "cart.add",
      sessionId,
      customerId: customer?.customer.id ?? null,
      slug,
      qty,
    });
    revalidatePath("/carrito");
    revalidatePath("/", "layout");
    redirect(`${returnTo}?added=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.warn({
      event: "cart.add_fail",
      slug,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`${returnTo}?error=${encodeURIComponent(errorMessage(err))}`);
  }
}

export async function updateQtyAction(formData: FormData): Promise<void> {
  const sessionId = await peekCartSession();
  if (!sessionId) redirect("/carrito");

  const itemId = String(formData.get("itemId") ?? "");
  const qty = Number(formData.get("qty") ?? 0);
  if (!itemId) redirect("/carrito");

  try {
    await updateCartItemQty(sessionId, itemId, qty);
    revalidatePath("/carrito");
    revalidatePath("/", "layout");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.warn({
      event: "cart.update_fail",
      itemId,
      qty,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  redirect("/carrito");
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const sessionId = await peekCartSession();
  if (!sessionId) redirect("/carrito");

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) redirect("/carrito");

  try {
    await removeCartItem(sessionId, itemId);
    revalidatePath("/carrito");
    revalidatePath("/", "layout");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.warn({
      event: "cart.remove_fail",
      itemId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  redirect("/carrito");
}
