/*
 * /mi-cuenta/resenas — Reseñas que el cliente ha escrito.
 * Muestra estado (Publicada / En revisión), producto y permite eliminar la propia.
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ChevronLeft, Star, MessageSquare } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { listReviewsByCustomer } from "@/features/reviews/customer-service";
import { DeleteReviewButton } from "./delete-review-button";
import { getAccountTexts } from "../account-texts.server";

export const metadata: Metadata = {
  title: "Mis reseñas",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function ResenasPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/resenas");

  const [reviews, texts] = await Promise.all([
    listReviewsByCustomer(session.customer.id),
    getAccountTexts(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        {texts.back.miCuenta}
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl">{texts.reviews.title}</h1>
        <p className="text-brand-muted mt-1 text-sm">{texts.reviews.subtitle}</p>
      </header>

      {reviews.length === 0 ? (
        <div className="border-brand-purple/15 rounded-2xl border border-dashed bg-white p-8 text-center">
          <MessageSquare className="text-brand-purple/60 mx-auto h-8 w-8" />
          <p className="text-brand-purple-dark mt-3 font-semibold">{texts.reviews.emptyTitle}</p>
          <p className="text-brand-muted mt-1 text-sm">{texts.reviews.emptySub}</p>
          <Link
            href="/mi-cuenta/pedidos"
            className="text-brand-pink-ink hover:text-brand-coral-ink mt-4 inline-block text-sm font-semibold"
          >
            {texts.reviews.emptyCta}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="border-brand-purple/15 rounded-2xl border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="bg-brand-purple/5 relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                  {r.product.image ? (
                    <Image
                      src={r.product.image}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/producto/${r.product.slug}`}
                      className="text-brand-purple-dark hover:text-brand-purple font-semibold"
                    >
                      {r.product.name}
                    </Link>
                    {r.status === "PUBLISHED" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                        {texts.reviews.published}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                        {texts.reviews.pending}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < r.rating ? "fill-brand-yellow text-brand-yellow" : "text-slate-300"
                        }`}
                      />
                    ))}
                    <span className="text-brand-muted ml-2 text-xs">
                      {dateFmt.format(r.createdAt)}
                    </span>
                  </div>
                  <p className="text-brand-purple-dark/85 mt-2 text-sm">{r.comment}</p>
                </div>
              </div>
              <div className="border-brand-purple/10 mt-3 flex justify-end border-t pt-2">
                <DeleteReviewButton id={r.id} texts={texts.reviews} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
