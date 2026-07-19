"use server";

/*
 * Reseñas de clientes (Lucy 2026-06-27, Bloque C / T10).
 *
 * Reglas de seguridad:
 *   - Solo clientes autenticados.
 *   - Solo se reseña un producto que el cliente COMPRÓ (orden PAID+).
 *   - Turnstile (anti-bot) + rate-limit por IP.
 *   - Una reseña por cliente y producto (anti-spam).
 *   - Entra como isApproved=false → moderación en /admin/resenas.
 *   - Comentario saneado (texto plano, sin caracteres de control).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, Prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { REVIEWABLE_ORDER_STATUSES } from "./constants";

const ReviewSchema = z.object({
  productId: z.string().cuid(),
  slug: z.string().min(1),
  rating: z.coerce.number().int().min(1, "Elige cuántas estrellas").max(5),
  comment: z
    .string()
    .trim()
    .min(10, "Cuéntanos un poco más (mínimo 10 caracteres).")
    .max(2000, "Máximo 2000 caracteres."),
});

export type ReviewActionState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Partial<Record<"rating" | "comment", string[]>>;
};

export async function submitReviewAction(
  _prev: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState> {
  const session = await getCurrentCustomer();
  if (!session) {
    return { error: "Inicia sesión para dejar una reseña." };
  }

  const parsed = ReviewSchema.safeParse({
    productId: formData.get("productId"),
    slug: formData.get("slug"),
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) {
    return {
      error: "Revisa los datos de la reseña.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as ReviewActionState["fieldErrors"],
    };
  }

  // getClientIp prefiere x-vercel-forwarded-for (no spoofeable) para el rate-limit (ADR-062 P1).
  const ip = getClientIp(await headers());

  // Anti-bot.
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const turnstile = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstile.success) {
    logger.warn({ event: "review.turnstile_failed", ip, reason: turnstile.reason });
    return {
      error: "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.",
    };
  }

  // Anti-abuso.
  const { allowed } = await rateLimit(ipKey("review", ip), 5, 60 * 60);
  if (!allowed) {
    return { error: "Demasiados intentos. Espera un momento e intenta de nuevo." };
  }

  // Verificación de COMPRA: solo reseña quien compró el producto.
  const purchased = await prisma.order.findFirst({
    where: {
      customerId: session.customer.id,
      deletedAt: null,
      status: { in: REVIEWABLE_ORDER_STATUSES },
      items: { some: { variant: { productId: parsed.data.productId } } },
    },
    select: { id: true },
  });
  if (!purchased) {
    return { error: "Solo puedes reseñar productos que compraste." };
  }

  // Una reseña por cliente y producto.
  const existing = await prisma.review.findFirst({
    where: {
      productId: parsed.data.productId,
      customerId: session.customer.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) {
    return { error: "Ya dejaste una reseña para este producto. ¡Gracias!" };
  }

  const comment = parsed.data.comment
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const authorName =
    [session.customer.firstName, session.customer.lastName].filter(Boolean).join(" ").trim() ||
    null;

  // #17 — el findFirst de arriba es un pre-check amigable, pero dos submits concurrentes
  // (doble-click / dos pestañas / reintento) podían crear 2 reseñas. El índice único parcial
  // Review_productId_customerId_active_unique lo hace imposible; capturamos su P2002 y
  // devolvemos el MISMO mensaje que el pre-check (mismo patrón que registro/stock).
  try {
    await prisma.review.create({
      data: {
        productId: parsed.data.productId,
        customerId: session.customer.id,
        rating: parsed.data.rating,
        comment,
        authorName,
        isApproved: false, // moderación en /admin/resenas
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Ya dejaste una reseña para este producto. ¡Gracias!" };
    }
    throw err;
  }

  logger.info({
    event: "review.submitted",
    customerId: session.customer.id,
    productId: parsed.data.productId,
    rating: parsed.data.rating,
  });

  revalidatePath(`/producto/${parsed.data.slug}`);
  return { success: true };
}
