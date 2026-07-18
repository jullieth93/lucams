/*
 * <ProductReviews> — sección de reseñas del PDP (Lucy 2026-06-27, T10).
 * Lista las reseñas aprobadas + formulario para clientes logueados (la
 * verificación de compra la hace el server action).
 */

import Link from "next/link";
import { Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { ReviewForm } from "./review-form";

export async function ProductReviews({ productId, slug }: { productId: string; slug: string }) {
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

  const avg =
    reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : null;
  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section id="resenas" className="border-brand-purple/10 border-t pt-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-brand-purple-dark text-2xl">Reseñas</h2>
        {avg != null && (
          <span className="text-brand-purple-dark/70 inline-flex items-center gap-1 text-sm">
            <Star className="fill-brand-yellow text-brand-yellow h-4 w-4" />
            <strong>{avg}</strong> · {reviews.length} reseña{reviews.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="text-brand-muted mb-6 text-sm">
          Todavía no hay reseñas. ¡Si compraste este producto, sé la primera persona en opinar!
        </p>
      ) : (
        <ul className="mb-8 space-y-4">
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
      )}

      {/* Formulario: solo clientes logueados; el server action exige compra. */}
      <div className="bg-brand-cream/50 border-brand-purple/10 rounded-xl border p-5">
        <h3 className="text-brand-purple-dark mb-3 font-semibold">Deja tu reseña</h3>
        {session ? (
          <ReviewForm productId={productId} slug={slug} />
        ) : (
          <p className="text-brand-purple-dark/70 text-sm">
            <Link href="/login" className="text-brand-purple-dark font-semibold underline">
              Inicia sesión
            </Link>{" "}
            para dejar una reseña. Solo puedes reseñar productos que compraste.
          </p>
        )}
      </div>
    </section>
  );
}
