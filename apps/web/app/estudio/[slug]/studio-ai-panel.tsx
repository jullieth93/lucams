"use client";

/*
 * Asistente IA de ideas (ADR-058) — panel del Estudio. El cliente cuenta la ocasión y recibe
 * sugerencias aplicables: color de marca, frase (si el producto lleva texto), composición y un tip.
 * Falla-seguro: si el asistente no está disponible, muestra un mensaje amable y no rompe nada.
 */

import { useEffect, useState } from "react";
import { Sparkles, X, Loader2, Copy, Check } from "lucide-react";
import { suggestDesignAction } from "@/features/ai/actions";
import type { DesignSuggestion } from "@/features/ai/schemas";

export function StudioAiPanel({
  open,
  onClose,
  productName,
  slotCount,
  allowText,
}: {
  open: boolean;
  onClose: () => void;
  productName: string;
  slotCount: number;
  allowText: boolean;
}) {
  const [occasion, setOccasion] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<DesignSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuggestion(null);
    setCopied(false);
    const res = await suggestDesignAction({
      occasion: occasion.trim(),
      productName,
      slotCount,
      allowText,
    });
    setLoading(false);
    if (res.ok) setSuggestion(res.suggestion);
    else setError(res.message);
  }

  async function copyPhrase(phrase: string) {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard no disponible — ignorar */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Asistente de ideas"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="border-brand-purple/15 w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-brand-purple-dark flex items-center gap-2 text-lg font-bold">
            <Sparkles className="text-brand-pink-ink h-5 w-5" />
            ¿Sin ideas? Te ayudo
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente"
            className="text-brand-muted hover:bg-brand-purple/5 hover:text-brand-purple-dark rounded-full p-1.5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <label htmlFor="ai-occasion" className="text-brand-muted block text-xs">
            ¿Para qué es? (ej. “cumpleaños de mi mamá”, “aniversario”)
          </label>
          <input
            id="ai-occasion"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            maxLength={200}
            placeholder="Cuéntame la ocasión…"
            className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || occasion.trim().length < 3}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Pensando ideas…" : "Dame ideas"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

        {suggestion && (
          <div className="mt-4 space-y-3">
            {suggestion.phrase && (
              <div className="bg-brand-cream rounded-xl p-3">
                <p className="text-brand-muted text-[11px] font-semibold uppercase">Frase sugerida</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-brand-purple-dark text-sm font-semibold">{suggestion.phrase}</p>
                  <button
                    type="button"
                    onClick={() => copyPhrase(suggestion.phrase!)}
                    className="text-brand-purple hover:bg-brand-purple/5 inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "¡Copiada!" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span
                className="border-brand-purple/15 h-8 w-8 flex-shrink-0 rounded-full border"
                style={{ backgroundColor: suggestion.colorHex }}
                aria-hidden
              />
              <p className="text-brand-purple-dark text-sm">
                Color sugerido: <strong>{suggestion.colorLabel}</strong>
              </p>
            </div>

            <div className="bg-brand-cream rounded-xl p-3">
              <p className="text-brand-muted text-[11px] font-semibold uppercase">Composición</p>
              <p className="text-brand-purple-dark mt-1 text-sm">{suggestion.layout}</p>
            </div>

            <div className="bg-brand-cream rounded-xl p-3">
              <p className="text-brand-muted text-[11px] font-semibold uppercase">Tip</p>
              <p className="text-brand-purple-dark mt-1 text-sm">{suggestion.tip}</p>
            </div>

            <p className="text-brand-muted text-[11px]">
              Son ideas para inspirarte — tú decides qué usar en tu diseño. ✨
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
