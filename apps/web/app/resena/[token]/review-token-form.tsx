"use client";

/*
 * <TokenReviewForm> — formulario de reseña de /resena/[token] (sin login, 2026-10).
 * Selector de producto (cuando el pedido tiene varios pendientes) + estrellas +
 * comentario + Turnstile. Mismas reglas de contenido que el form de la PDP
 * (review-form.tsx): rating 1-5 y comentario 10-2000; la verificación de compra
 * la hace el server action con el token firmado (features/reviews/token-actions).
 * Todos los textos llegan por props resueltos desde el CMS en la página (server).
 */

import { useActionState, useState } from "react";
import Image from "next/image";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { submitTokenReviewAction } from "@/features/reviews/token-actions";
import type { ReviewActionState } from "@/features/reviews/actions";

export type TokenReviewTexts = {
  productLabel: string;
  ratingLabel: string;
  commentLabel: string;
  commentPlaceholder: string;
  submit: string;
  success: string;
  pendingNote: string;
};

type FormProduct = { id: string; name: string; slug: string; imageUrl: string | null };

export function TokenReviewForm({
  token,
  products,
  initialProductId,
  texts,
}: {
  token: string;
  products: FormProduct[];
  initialProductId: string;
  texts: TokenReviewTexts;
}) {
  const [state, formAction, pending] = useActionState<ReviewActionState | null, FormData>(
    submitTokenReviewAction,
    null,
  );
  const [productId, setProductId] = useState(initialProductId);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  // Textarea CONTROLADO (mismo patrón que review-form.tsx #12): el comentario
  // sobrevive a errores de la action (Turnstile expirado, rate limit, duplicado).
  const [comment, setComment] = useState("");

  if (state?.success) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        {texts.success}
      </div>
    );
  }

  const selected = products.find((p) => p.id === productId) ?? products[0]!;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="productId" value={selected.id} />
      <input type="hidden" name="slug" value={selected.slug} />
      <input type="hidden" name="rating" value={rating} />

      {products.length > 1 && (
        <div>
          <span className="text-brand-purple-dark mb-2 block text-sm font-semibold">
            {texts.productLabel}
          </span>
          <div className="space-y-2" role="radiogroup" aria-label={texts.productLabel}>
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={productId === p.id}
                onClick={() => setProductId(p.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  productId === p.id
                    ? "border-brand-purple bg-brand-cream/60 font-semibold"
                    : "border-brand-purple/15 bg-white"
                }`}
              >
                {p.imageUrl && (
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={p.imageUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                      unoptimized
                    />
                  </span>
                )}
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {products.length === 1 && (
        <div className="flex items-center gap-3">
          {selected.imageUrl && (
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md">
              <Image
                src={selected.imageUrl}
                alt=""
                fill
                sizes="48px"
                className="object-cover"
                unoptimized
              />
            </span>
          )}
          <p className="text-brand-purple-dark text-sm font-semibold">{selected.name}</p>
        </div>
      )}

      <div>
        <span className="text-brand-purple-dark mb-1 block text-sm font-semibold">
          {texts.ratingLabel}
        </span>
        <div className="flex gap-1" role="radiogroup" aria-label={texts.ratingLabel}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}`}
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
        <label
          htmlFor="token-review-comment"
          className="text-brand-purple-dark mb-1 block text-sm font-semibold"
        >
          {texts.commentLabel}
        </label>
        <textarea
          id="token-review-comment"
          name="comment"
          rows={4}
          maxLength={2000}
          required
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={texts.commentPlaceholder}
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
        {texts.submit}
      </button>

      <p className="text-brand-muted text-xs">{texts.pendingNote}</p>
    </form>
  );
}
