/*
 * Server actions del carrito.
 *
 * Cubre añadir, actualizar qty y remover. Las tres validan input con
 * Zod, consultan/crean el cart via lib/cart-session (cookie sessionId),
 * llaman al service y revalidan las paths impactadas.
 *
 * Logging: cada acción emite `cart.<verb>.<result>` con sessionId +
 * customerId si está logueado.
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addProductToCart,
  CartError,
  removeCartItem,
  updateCartItemQty,
} from "@/features/cart/service";
import { AddToCartSchema, RemoveItemSchema, UpdateQtySchema } from "@/features/cart/schemas";
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
  const parsed = AddToCartSchema.safeParse({
    slug: String(formData.get("slug") ?? ""),
    qty: Math.max(1, Number(formData.get("qty") ?? 1)),
    returnTo: (formData.get("returnTo") || undefined) as string | undefined,
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const firstError = Object.values(flat.fieldErrors)[0]?.[0] ?? "Datos inválidos";
    logger.warn({ event: "cart.add.invalid_input", err: flat.fieldErrors });
    redirect(`/carrito?error=${encodeURIComponent(firstError)}`);
  }

  const { slug, qty, returnTo: returnToValidated } = parsed.data;
  const returnTo = returnToValidated ?? "/carrito";

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
      event: "cart.add.success",
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
      event: "cart.add.fail",
      slug,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`${returnTo}?error=${encodeURIComponent(errorMessage(err))}`);
  }
}

export async function updateQtyAction(formData: FormData): Promise<void> {
  const sessionId = await peekCartSession();
  if (!sessionId) redirect("/carrito");

  const parsed = UpdateQtySchema.safeParse({
    itemId: String(formData.get("itemId") ?? ""),
    qty: Number(formData.get("qty") ?? 0),
  });

  if (!parsed.success) {
    logger.warn({
      event: "cart.update.invalid_input",
      err: z.flattenError(parsed.error).fieldErrors,
    });
    redirect("/carrito");
  }

  try {
    await updateCartItemQty(sessionId, parsed.data.itemId, parsed.data.qty);
    logger.info({
      event: "cart.update.success",
      sessionId,
      itemId: parsed.data.itemId,
      qty: parsed.data.qty,
    });
    revalidatePath("/carrito");
    revalidatePath("/", "layout");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.warn({
      event: "cart.update.fail",
      itemId: parsed.data.itemId,
      qty: parsed.data.qty,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  redirect("/carrito");
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const sessionId = await peekCartSession();
  if (!sessionId) redirect("/carrito");

  const parsed = RemoveItemSchema.safeParse({
    itemId: String(formData.get("itemId") ?? ""),
  });
  if (!parsed.success) {
    logger.warn({
      event: "cart.remove.invalid_input",
      err: z.flattenError(parsed.error).fieldErrors,
    });
    redirect("/carrito");
  }

  try {
    await removeCartItem(sessionId, parsed.data.itemId);
    logger.info({
      event: "cart.remove.success",
      sessionId,
      itemId: parsed.data.itemId,
    });
    revalidatePath("/carrito");
    revalidatePath("/", "layout");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.warn({
      event: "cart.remove.fail",
      itemId: parsed.data.itemId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  redirect("/carrito");
}
