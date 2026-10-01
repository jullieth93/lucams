"use server";

/*
 * Reseña por token firmado (email "Dejar una reseña" → /resena/<token>) — 2026-10.
 *
 * Vía SIN login para invitados: la compra queda verificada por el token HMAC
 * (review-token.ts), no por la sesión. Reutiliza las mismas reglas de contenido
 * y anti-abuso de submitReviewAction (actions.ts): rating 1-5, comentario
 * 10-2000 saneado, Turnstile, rate-limit por IP (mismo bucket "review") y
 * moderación PENDING (isApproved=false).
 *
 * Uso único (documentado en review-token.ts):
 *   - Con Customer identificado (el del pedido, o por correo del token si el
 *     invitado se registró después): pre-check amable + el índice parcial
 *     Review_productId_customerId_active_unique lo garantiza a nivel DB (P2002).
 *   - Invitado puro (customerId null): pre-check por marcador
 *     createdBy="review-token:<orderNumber>". Sin constraint posible sin
 *     migración; una race de doble submit queda mitigada por la moderación
 *     PENDING (el duplicado huérfano nunca se publica sin revisión humana).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, Prisma } from "@/lib/db";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { REVIEWABLE_ORDER_STATUSES } from "./constants";
import { verifyReviewToken } from "./review-token";
import type { ReviewActionState } from "./actions";

const TokenReviewSchema = z.object({
  token: z.string().min(1),
  productId: z.string().cuid(),
  slug: z.string().min(1),
  rating: z.coerce.number().int().min(1, "Elige cuántas estrellas").max(5),
  comment: z
    .string()
    .trim()
    .min(10, "Cuéntanos un poco más (mínimo 10 caracteres).")
    .max(2000, "Máximo 2000 caracteres."),
});

type ShippingAddr = { fullName?: string };

export async function submitTokenReviewAction(
  _prev: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState> {
  const parsed = TokenReviewSchema.safeParse({
    token: formData.get("token"),
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

  // Verificación de COMPRA vía token firmado (en vez de sesión).
  const payload = verifyReviewToken(parsed.data.token);
  if (!payload) {
    return {
      error:
        "Este link de reseña venció o no es válido. Si quieres reseñar, inicia sesión con el correo de tu compra y hazlo desde la ficha del producto.",
    };
  }
  if (!payload.productIds.includes(parsed.data.productId)) {
    return { error: "Este producto no hace parte del pedido de este link." };
  }

  // getClientIp prefiere x-vercel-forwarded-for (no spoofeable) para el rate-limit (ADR-062 P1).
  const ip = getClientIp(await headers());

  // Anti-bot.
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const turnstile = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstile.success) {
    logger.warn({ event: "review.turnstile_failed", via: "token", ip, reason: turnstile.reason });
    return {
      error: "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.",
    };
  }

  // Anti-abuso (mismo bucket que la reseña con sesión).
  const { allowed } = await rateLimit(ipKey("review", ip), 5, 60 * 60);
  if (!allowed) {
    return { error: "Demasiados intentos. Espera un momento e intenta de nuevo." };
  }

  // Defensa en profundidad: el pedido debe seguir existiendo y en estado
  // reseñable (pudo reembolsarse después de enviado el correo).
  const order = await prisma.order.findFirst({
    where: { id: payload.orderId, deletedAt: null, status: { in: REVIEWABLE_ORDER_STATUSES } },
    select: { id: true, number: true, customerId: true, shippingAddress: true },
  });
  if (!order) {
    return { error: "Este pedido ya no admite reseñas. Si crees que es un error, escríbenos." };
  }

  // Dueño de la reseña: el Customer del pedido; si el pedido fue de invitado,
  // buscamos por el correo del token (pudo registrarse después de comprar).
  // Si no hay Customer, la reseña queda con customerId=null (el schema lo
  // permite — mismo caso que los testimonios curados) y la compra sigue
  // trazada por el marcador createdBy.
  const customer = order.customerId
    ? await prisma.customer.findFirst({
        where: { id: order.customerId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      })
    : await prisma.customer.findFirst({
        where: { email: { equals: payload.email, mode: "insensitive" }, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      });

  // Marcador de trazabilidad + dedupe del invitado: una reseña por producto
  // y pedido aunque no exista Customer.
  const marker = `review-token:${order.number}`;

  if (customer) {
    const existing = await prisma.review.findFirst({
      where: { productId: parsed.data.productId, customerId: customer.id, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      return { error: "Ya dejaste una reseña para este producto. ¡Gracias!" };
    }
  }
  const existingByToken = await prisma.review.findFirst({
    where: { productId: parsed.data.productId, createdBy: marker, deletedAt: null },
    select: { id: true },
  });
  if (existingByToken) {
    return { error: "Ya recibimos tu reseña de este producto para este pedido. ¡Gracias!" };
  }

  const comment = parsed.data.comment
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const ship = (order.shippingAddress ?? {}) as ShippingAddr;
  const authorName =
    (ship.fullName ?? [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim()) ||
    null;

  // El P2002 del índice parcial (productId, customerId) cubre la race de doble
  // submit cuando hay Customer (mismo patrón que actions.ts #17).
  try {
    await prisma.review.create({
      data: {
        productId: parsed.data.productId,
        customerId: customer?.id ?? null,
        rating: parsed.data.rating,
        comment,
        authorName,
        isApproved: false, // moderación en /admin/resenas
        createdBy: marker,
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
    via: "token",
    orderNumber: order.number,
    productId: parsed.data.productId,
    rating: parsed.data.rating,
  });

  revalidatePath(`/producto/${parsed.data.slug}`);
  return { success: true };
}
