/*
 * /resena/[token] — landing del email "Dejar una reseña" (2026-10).
 *
 * Formulario de reseña SIN login para invitados: la compra queda verificada por
 * el token firmado HMAC (features/reviews/review-token.ts) que viaja en la URL.
 * Flujo:
 *   - Token inválido/manipulado/expirado, o pedido que ya no admite reseñas →
 *     pantalla honesta con salidas a /rastrear y al catálogo.
 *   - Token válido → productos del pedido (con foto) y formulario (estrellas +
 *     comentario + Turnstile) por producto pendiente; los ya reseñados se
 *     muestran como tales. ?p=<productId> preselecciona (links por producto del
 *     correo). La creación la hace submitTokenReviewAction (PENDING, misma
 *     moderación de siempre).
 *
 * noindex: la URL trae un token opaco de un solo uso. force-dynamic: el widget
 * Turnstile necesita el nonce CSP por request (mismo criterio que /rastrear).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch, Star } from "lucide-react";
import { CmsText } from "@/components/cms/cms-text";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCmsBlock } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";
import { prisma } from "@/lib/db";
import { verifyReviewToken } from "@/features/reviews/review-token";
import { REVIEWABLE_ORDER_STATUSES } from "@/features/reviews/constants";
import { TokenReviewForm, type TokenReviewTexts } from "./review-token-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const block = await getCmsBlock("review.page.meta-title");
  return {
    title: block?.body ?? "Dejar mi reseña",
    robots: { index: false, follow: false },
  };
}

// <TokenReviewForm> es client component ("use client") y no puede leer el CMS:
// sus textos se resuelven acá en el server y se pasan por props (mismo patrón
// que /rastrear).
async function cmsReviewText(key: string, fallback: string): Promise<string> {
  const block = await getCmsBlock(key);
  return resolveCmsTokens(block?.body ?? fallback);
}

export default async function ReviewTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const [{ token }, { p }] = await Promise.all([params, searchParams]);

  const payload = verifyReviewToken(token);
  const order = payload
    ? await prisma.order.findFirst({
        where: { id: payload.orderId, deletedAt: null, status: { in: REVIEWABLE_ORDER_STATUSES } },
        select: { id: true, number: true, customerId: true },
      })
    : null;

  if (!payload || !order) {
    return (
      <div className="bg-brand-cream flex min-h-screen flex-col">
        <SiteHeader />
        <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-12">
          <div className="mx-auto max-w-md text-center">
            <div className="bg-brand-purple/15 mx-auto inline-flex items-center justify-center rounded-full p-3">
              <Star className="text-brand-purple h-8 w-8" />
            </div>
            <h1 className="font-display text-brand-purple-dark mt-4 text-3xl font-bold">
              <CmsText
                blockKey="review.page.invalid-title"
                fallback="Este link de reseña no está disponible"
              />
            </h1>
            <p className="text-brand-purple/80 mt-2 text-sm">
              <CmsText
                blockKey="review.page.invalid-text"
                fallback="El link venció o ya no es válido. Si quieres, puedes rastrear tu pedido o seguir explorando el catálogo."
              />
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Link
                href="/rastrear"
                className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                <PackageSearch className="h-4 w-4" />
                <CmsText blockKey="review.page.invalid-cta-track" fallback="Rastrear mi pedido" />
              </Link>
              <Link
                href="/productos"
                className="text-brand-purple-dark text-sm font-semibold underline"
              >
                <CmsText blockKey="review.page.invalid-cta-catalog" fallback="Ver el catálogo" />
              </Link>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Productos del token, re-hidratados desde DB (nombre/foto actuales) y en el
  // orden del pedido. Productos eliminados del catálogo simplemente no salen.
  const dbProducts = await prisma.product.findMany({
    where: { id: { in: payload.productIds }, deletedAt: null },
    select: { id: true, name: true, slug: true, images: true },
  });
  const byId = new Map(dbProducts.map((prod) => [prod.id, prod]));
  const products = payload.productIds
    .map((id) => byId.get(id))
    .filter((prod): prod is NonNullable<typeof prod> => prod != null);

  // Productos ya reseñados por ESTA vía (marcador del pedido) o por el Customer
  // dueño del pedido: se muestran como "ya reseñaste" y no se ofrece el form.
  const marker = `review-token:${order.number}`;
  const doneReviews = await prisma.review.findMany({
    where: {
      productId: { in: products.map((prod) => prod.id) },
      deletedAt: null,
      OR: [{ createdBy: marker }, ...(order.customerId ? [{ customerId: order.customerId }] : [])],
    },
    select: { productId: true },
  });
  const doneIds = new Set(doneReviews.map((r) => r.productId));
  const pending = products.filter((prod) => !doneIds.has(prod.id));

  const initialProductId =
    (p && pending.some((prod) => prod.id === p) ? p : null) ?? pending[0]?.id ?? null;

  const texts: TokenReviewTexts = {
    productLabel: await cmsReviewText("review.page.product-label", "¿Sobre cuál producto opinas?"),
    ratingLabel: await cmsReviewText("review.page.rating-label", "Tu calificación"),
    commentLabel: await cmsReviewText("review.page.comment-label", "Tu reseña"),
    commentPlaceholder: await cmsReviewText(
      "review.page.comment-placeholder",
      "¿Qué te pareció el producto? ¿Cómo llegó? ¿Lo recomiendas?",
    ),
    submit: await cmsReviewText("review.page.submit", "Enviar reseña"),
    success: await cmsReviewText(
      "review.page.success",
      "¡Gracias por tu reseña! Queda pendiente de moderación: la publicamos después de revisarla.",
    ),
    pendingNote: await cmsReviewText(
      "review.page.pending-note",
      "Tu reseña se publica después de una revisión. ¡Gracias por tomarte el tiempo!",
    ),
  };

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-lg">
          <div className="text-center">
            <div className="bg-brand-purple/15 mx-auto inline-flex items-center justify-center rounded-full p-3">
              <Star className="text-brand-purple h-8 w-8" />
            </div>
            <h1 className="font-display text-brand-purple-dark mt-4 text-3xl font-bold">
              <CmsText blockKey="review.page.heading" fallback="Cuéntanos cómo te fue" />
            </h1>
            <p className="text-brand-purple/80 mt-2 text-sm">
              <CmsText
                blockKey="review.page.subtext"
                fallback="Tu opinión nos ayuda un montón — y a otras personas a decidir."
              />{" "}
              <span className="text-brand-purple-dark font-semibold">
                <CmsText blockKey="review.page.order-label" fallback="Pedido" /> {order.number}
              </span>
            </p>
          </div>

          {/* Productos ya reseñados por esta vía (p. ej. reabrió el correo). */}
          {doneIds.size > 0 && (
            <ul className="mt-6 space-y-2">
              {products
                .filter((prod) => doneIds.has(prod.id))
                .map((prod) => (
                  <li
                    key={prod.id}
                    className="border-brand-purple/10 text-brand-purple-dark/80 rounded-xl border bg-white px-4 py-3 text-sm"
                  >
                    <strong>{prod.name}</strong> —{" "}
                    <CmsText
                      blockKey="review.page.already"
                      fallback="ya nos dejaste tu reseña de este producto ✨ ¡Gracias!"
                    />
                  </li>
                ))}
            </ul>
          )}

          {pending.length > 0 && initialProductId && (
            <div className="border-brand-purple/10 mt-6 rounded-2xl border bg-white p-6 shadow-sm">
              <TokenReviewForm
                token={token}
                products={pending.map((prod) => ({
                  id: prod.id,
                  name: prod.name,
                  slug: prod.slug,
                  imageUrl: prod.images[0] ?? null,
                }))}
                initialProductId={initialProductId}
                texts={texts}
              />
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
