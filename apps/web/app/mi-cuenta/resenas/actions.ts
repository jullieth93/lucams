/*
 * Server Action — el cliente elimina SU PROPIA reseña (soft-delete).
 * Ownership verificado por customerId dentro del service.
 */

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/auth";
import { deleteOwnReview } from "@/features/reviews/customer-service";

export async function deleteReviewAction(id: string): Promise<{ ok: boolean }> {
  const session = await getCurrentCustomer();
  if (!session) return { ok: false };
  try {
    await deleteOwnReview(session.customer.id, id);
  } catch {
    return { ok: false };
  }
  revalidatePath("/mi-cuenta/resenas");
  return { ok: true };
}
