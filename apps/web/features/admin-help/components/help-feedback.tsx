"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { submitHelpFeedbackAction } from "../actions";

export function AdminHelpFeedback({ guideId }: { guideId: string }) {
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(nextHelpful: boolean) {
    setSaving(true);
    setMessage(null);
    const result = await submitHelpFeedbackAction({
      guideId,
      isHelpful: nextHelpful,
      comment,
    });
    setMessage(result.message);
    if (result.ok) setHelpful(nextHelpful);
    setSaving(false);
  }

  return (
    <section
      className="rounded-xl border border-slate-200 p-4"
      aria-labelledby={`feedback-${guideId}`}
    >
      <h3 id={`feedback-${guideId}`} className="text-brand-purple-dark font-bold">
        ¿Te resultó útil esta guía?
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Tu valoración es interna. No incluyas datos de clientes ni información sensible.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit(true)}
          aria-pressed={helpful === true}
          className="aria-pressed:bg-brand-purple inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:opacity-50 aria-pressed:text-white"
        >
          <ThumbsUp className="h-4 w-4" aria-hidden /> Sí, me ayudó
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit(false)}
          aria-pressed={helpful === false}
          className="aria-pressed:bg-brand-purple inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:opacity-50 aria-pressed:text-white"
        >
          <ThumbsDown className="h-4 w-4" aria-hidden /> Necesita mejorar
        </button>
      </div>
      {helpful === false && (
        <div className="mt-3">
          <label htmlFor={`comment-${guideId}`} className="text-xs font-semibold text-slate-700">
            ¿Qué explicación faltó o no quedó clara? (opcional)
          </label>
          <textarea
            id={`comment-${guideId}`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            rows={3}
            className="focus:border-brand-purple mt-1 w-full rounded-lg border border-slate-300 p-2 outline-none"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit(false)}
            className="bg-brand-purple mt-2 min-h-11 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            Enviar comentario
          </button>
        </div>
      )}
      {message && (
        <p className="mt-2 text-sm text-slate-600" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
