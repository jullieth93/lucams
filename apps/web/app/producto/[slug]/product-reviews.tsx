/*
 * <ProductReviews> — sección de reseñas del PDP (Lucy 2026-06-27, T10).
 * Lista las reseñas aprobadas + formulario para clientes logueados. El gate de
 * compra/duplicado se evalúa también aquí (para no mostrar un form que el action
 * rechazaría), pero el server action lo revalida como defensa en profundidad.
 */

import Link from "next/link";
import { Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import type { ProductRatingAggregate } from "@/features/reviews/public-service";
import { REVIEWABLE_ORDER_STATUSES } from "@/features/reviews/constants";
import { ReviewForm } from "./review-form";

export async function ProductReviews({
  productId,
  slug,
  ratingAggregate,
}: {
  productId: string;
  slug: string;
  ratingAggregate: ProductRatingAggregate | null;
}) {
  const [reviews, session] = await Promise.all([
    prisma.review.findMany({
      // H16 (auditoría v3) — solo reseñas de clientes REALES (customerId presente): las
      // fabricadas/demo (customerId=null) no se muestran como reales en el PDP.
      where: { productId, isApproved: true, deletedAt: null, customerId: { not: null } },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { id: true, rating: true, comment: true, authorName: true, createdAt: true },
    }),
    getCurrentCustomer(),
  ]);

  // #19 — gate visible del formulario: solo cuando hay sesión resolvemos compra + reseña previa
  // (mismas queries que el action, así el gate visible y el server-side no divergen). Los
  // visitantes anónimos no pagan estas queries.
  const [purchased, existingReview] = session
    ? await Promise.all([
        prisma.order.findFirst({
          where: {
            customerId: session.customer.id,
            deletedAt: null,
            status: { in: REVIEWABLE_ORDER_STATUSES },
            items: { some: { variant: { productId } } },
          },
          select: { id: true },
        }),
        prisma.review.findFirst({
          where: { productId, customerId: session.customer.id, deletedAt: null },
          select: { id: true },
        }),
      ])
    : [null, null];

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section id="resenas" className="border-brand-purple/10 border-t pt-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-brand-purple-dark text-2xl">Reseñas</h2>
        {/* #16 — mismo agregado que el JSON-LD (todas las reseñas aprobadas), no el promedio del
          slice de 20 visibles. Contenido-visible == datos estructurados (política de rich results). */}
        {ratingAggregate != null && (
          <span className="text-brand-purple-dark/70 inline-flex items-center gap-1 text-sm">
            <Star className="fill-brand-yellow text-brand-yellow h-4 w-4" />
            <strong>{ratingAggregate.ratingValue.toFixed(1)}</strong> ·{" "}
            {ratingAggregate.reviewCount} reseña{ratingAggregate.reviewCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="text-brand-muted text-sm">
          Todavía no hay reseñas. ¡Si compraste este producto, sé la primera persona en opinar!
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-brand-purple/10 rounded-lg border bg-white p-4">
                <div className="mb-1 flex items-center gap-2">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-4 w-4 ${
                          r.rating >= n
                            ? "fill-brand-yellow text-brand-yellow"
                            : "text-brand-purple-dark/20"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-brand-purple-dark text-sm font-semibold">
                    {r.authorName ?? "Cliente Lucams"}
                  </span>
                </div>
                <p className="text-brand-purple-dark/80 text-sm whitespace-pre-line">{r.comment}</p>
                <p className="text-brand-muted mt-1 text-xs">{dateFmt.format(r.createdAt)}</p>
              </li>
            ))}
          </ul>
          {/* #16 — aclara el tope de 20 cuando hay más reseñas que las visibles. */}
          {ratingAggregate != null && ratingAggregate.reviewCount > reviews.length && (
            <p className="text-brand-muted mt-3 text-sm">
              Mostrando las {reviews.length} reseñas más recientes de {ratingAggregate.reviewCount}.
            </p>
          )}
        </>
      )}

      {/* #19 — Formulario: 4 estados (sin sesión / ya reseñó / no compró / puede reseñar). */}
      <div className="bg-brand-cream/50 border-brand-purple/10 mt-8 rounded-xl border p-5">
        <h3 className="text-brand-purple-dark mb-3 font-semibold">Deja tu reseña</h3>
        {!session ? (
          <p className="text-brand-purple-dark/70 text-sm">
            <Link href="/login" className="text-brand-purple-dark font-semibold underline">
              Inicia sesión
            </Link>{" "}
            para dejar una reseña. Solo puedes reseñar productos que compraste.
          </p>
        ) : existingReview ? (
          <p className="text-brand-purple-dark/70 text-sm">
            Ya dejaste tu reseña de este producto ✨ ¡Gracias por opinar!
          </p>
        ) : !purchased ? (
          <p className="text-brand-purple-dark/70 text-sm">
            Solo puedes reseñar productos que compraste. Si ya lo compraste, revisa que iniciaste
            sesión con el mismo correo del pedido.
          </p>
        ) : (
          <ReviewForm productId={productId} slug={slug} />
        )}
      </div>
    </section>
  );
}
