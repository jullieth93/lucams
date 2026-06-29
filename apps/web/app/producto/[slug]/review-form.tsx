"use client";

/*
 * <ReviewForm> — formulario para que un cliente deje una reseña (Lucy 2026-06-27).
 * Estrellas + comentario + Turnstile. La verificación de compra + moderación las
 * hace el server action (features/reviews/actions). Entra como pendiente de aprobar.
 */

import { useActionState, useState } from "react";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { submitReviewAction, type ReviewActionState } from "@/features/reviews/actions";

export function ReviewForm({ productId, slug }: { productId: string; slug: string }) {
  const [state, formAction, pending] = useActionState<ReviewActionState | null, FormData>(
    submitReviewAction,
    null,
  );
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  if (state?.success) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-5 w-5" />
        ¡Gracias por tu reseña! La revisamos y la publicamos pronto.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rating" value={rating} />

      <div>
        <span className="text-brand-purple-dark mb-1 block text-sm font-semibold">Tu calificación</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Calificación">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} estrella${n === 1 ? "" : "s"}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5"
            >
              <Star
                className={`h-7 w-7 transition-colors ${
                  (hover || rating) >= n
                    ? "fill-brand-yellow text-brand-yellow"
                    : "text-brand-purple-dark/25"
                }`}
              />
            </button>
          ))}
        </div>
        {state?.fieldErrors?.rating && (
          <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.rating[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="comment" className="text-brand-purple-dark mb-1 block text-sm font-semibold">
          Tu reseña
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={4}
          maxLength={2000}
          required
          placeholder="¿Qué te pareció el producto? ¿Cómo llegó? ¿Lo recomiendas?"
          className="border-brand-purple/25 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        {state?.fieldErrors?.comment && (
          <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.comment[0]}</p>
        )}
      </div>

      <TurnstileWidget />

      {state?.error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand-purple hover:bg-brand-purple-dark inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Publicar reseña
      </button>
    </form>
  );
}
