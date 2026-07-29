"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth";
import { toggleWishlist } from "./service";

const Schema = z.object({ productId: z.string().min(1) });

type Result =
  { ok: true; wishlisted: boolean } | { ok: false; code: "AUTH" | "VALIDATION"; message: string };

/** Alterna un producto en la wishlist del cliente logueado. */
export async function toggleWishlistAction(input: { productId: string }): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: "Producto inválido" };
  }
  const customer = await getCurrentCustomer();
  if (!customer) {
    return { ok: false, code: "AUTH", message: "Inicia sesión para guardar favoritos" };
  }
  const { wishlisted } = await toggleWishlist(customer.customer.id, parsed.data.productId);
  revalidatePath("/mi-cuenta/favoritos");
  return { ok: true, wishlisted };
}
