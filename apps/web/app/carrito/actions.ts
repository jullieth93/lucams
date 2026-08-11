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
  addPersonalizedToCart,
  addProductToCart,
  CartError,
  removeCartItem,
  updateCartItemQty,
} from "@/features/cart/service";
import { AddToCartSchema, RemoveItemSchema, UpdateQtySchema } from "@/features/cart/schemas";
import { getOwnedDesign } from "@/features/personalization/service";
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
      // Fase 1 — la opción elegida quedó agotada (gate por variante en carrito).
      case "STOCK_UNAVAILABLE":
        return "Esa opción se agotó. Elige otra cantidad o tamaño.";
    }
  }
  return "Algo salió mal. Reintenta.";
}

export async function addToCartAction(formData: FormData): Promise<void> {
  const parsed = AddToCartSchema.safeParse({
    slug: String(formData.get("slug") ?? ""),
    qty: Math.max(1, Number(formData.get("qty") ?? 1)),
    returnTo: (formData.get("returnTo") || undefined) as string | undefined,
    variantId: (formData.get("variantId") || undefined) as string | undefined,
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const firstError = Object.values(flat.fieldErrors)[0]?.[0] ?? "Datos inválidos";
    logger.warn({ event: "cart.add.invalid_input", err: flat.fieldErrors });
    redirect(`/carrito?error=${encodeURIComponent(firstError)}`);
  }

  const { slug, qty, returnTo: returnToValidated, variantId } = parsed.data;
  const returnTo = returnToValidated ?? "/carrito";

  const sessionId = await getOrCreateCartSession();
  const customer = await getCurrentCustomer();

  try {
    await addProductToCart({
      sessionId,
      customerId: customer?.customer.id ?? null,
      productSlug: slug,
      qty,
      variantId,
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

// ──────────── Add personalized (Estudio "¡Listo!" → cart) ────────────
//
// Programatic action (no FormData) — el editor M.3 la llama directamente.
// Recibe designId + qty. Verifica ownership del design (no se puede agregar
// el design de otro). Si todo OK, crea/incrementa CartItem con designId.

const AddPersonalizedSchema = z.object({
  designId: z.string().min(1),
  qty: z.number().int().min(1).max(99).default(1),
  // variantId elegido en PDP → Estudio (M.3.b.CAT consolidación familias).
  // Service valida que pertenece a design.product.id (anti-tamper).
  variantId: z.string().min(1).optional(),
  // Edición desde el carrito: id del diseño original a reemplazar en sitio (no duplicar).
  // Solo puede matchear un item del carrito PROPIO del caller → seguro sin validación extra.
  replaceDesignId: z.string().min(1).optional(),
});

export type AddPersonalizedResult =
  | { ok: true; itemCount: number }
  | {
      ok: false;
      code: "VALIDATION" | "FORBIDDEN" | "DESIGN_NOT_READY" | "INTERNAL";
      message: string;
    };

export async function addPersonalizedToCartAction(input: {
  designId: string;
  qty?: number;
  variantId?: string;
  replaceDesignId?: string;
}): Promise<AddPersonalizedResult> {
  const parsed = AddPersonalizedSchema.safeParse({
    designId: input.designId,
    qty: input.qty ?? 1,
    variantId: input.variantId,
    replaceDesignId: input.replaceDesignId,
  });
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.message };
  }

  const sessionId = await getOrCreateCartSession();
  const customer = await getCurrentCustomer();
  const customerId = customer?.customer.id ?? null;

  // Verify ownership del Design vía service de personalization.
  const design = await getOwnedDesign(parsed.data.designId, { customerId, sessionId });
  if (!design) {
    return { ok: false, code: "FORBIDDEN", message: "Diseño no encontrado o no autorizado" };
  }
  if (design.status !== "READY") {
    return {
      ok: false,
      code: "DESIGN_NOT_READY",
      message: `El diseño está en estado ${design.status} — debe estar READY para agregarlo al carrito`,
    };
  }

  try {
    const cart = await addPersonalizedToCart({
      sessionId,
      customerId,
      designId: parsed.data.designId,
      qty: parsed.data.qty,
      variantId: parsed.data.variantId,
      replaceDesignId: parsed.data.replaceDesignId,
    });
    logger.info({
      event: "cart.add_personalized.success",
      designId: parsed.data.designId,
      qty: parsed.data.qty,
      itemCount: cart.itemCount,
    });
    revalidatePath("/carrito");
    revalidatePath("/", "layout");
    return { ok: true, itemCount: cart.itemCount };
  } catch (err) {
    logger.warn({
      event: "cart.add_personalized.fail",
      designId: parsed.data.designId,
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      code: "INTERNAL",
      message: errorMessage(err),
    };
  }
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
