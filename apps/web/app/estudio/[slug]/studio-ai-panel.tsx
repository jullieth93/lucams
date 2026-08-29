"use client";

/*
 * Asistente IA de ideas (ADR-058) — panel del Estudio. El cliente cuenta la ocasión y recibe
 * sugerencias aplicables: color de marca, frase (si el producto lleva texto), composición y un tip.
 * Falla-seguro: si el asistente no está disponible, muestra un mensaje amable y no rompe nada.
 */

import { useRef, useState } from "react";
import { useDialogA11y } from "./use-dialog-a11y";
import { Sparkles, X, Loader2, Copy, Check } from "lucide-react";
import { suggestDesignAction } from "@/features/ai/actions";
import type { DesignSuggestion } from "@/features/ai/schemas";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, splitStudioText } from "./studio-texts";

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
  const texts = useStudioTexts();

  // #15 — foco inicial + trap + Escape + retorno de foco (activo solo cuando el panel está abierto).
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose, active: open });

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
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={texts.ia.panelAria}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm outline-none sm:items-center"
      onClick={onClose}
    >
      <div
        className="border-brand-purple/15 w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-brand-purple-dark flex items-center gap-2 text-lg font-bold">
            <Sparkles className="text-brand-pink-ink h-5 w-5" />
            {texts.ia.titulo}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={texts.comun.cerrarAsistente}
            className="text-brand-muted hover:bg-brand-purple/5 hover:text-brand-purple-dark rounded-full p-1.5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <label htmlFor="ai-occasion" className="text-brand-muted block text-xs">
            {texts.ia.label}
          </label>
          <input
            id="ai-occasion"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            maxLength={200}
            placeholder={texts.ia.placeholder}
            className="border-brand-purple/20 focus:ring-brand-purple/30 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          {/* E-2 — privacy notice: this text goes to a third-party AI provider. Fixed copy
              (not CMS-backed): a new `estudio.ia.*` key would require the site map in
              packages/db, outside the scope of this change. */}
          <p className="text-brand-muted text-[11px]">
            Evita escribir datos personales (nombres, cédulas, teléfonos) — cuéntanos solo la
            ocasión.
          </p>
          <button
            type="submit"
            disabled={loading || occasion.trim().length < 3}
            className="bg-brand-purple hover:bg-brand-purple-dark inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? texts.ia.cargando : texts.ia.enviar}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

        {suggestion && (
          <div className="mt-4 space-y-3">
            {suggestion.phrase && (
              <div className="bg-brand-cream rounded-xl p-3">
                <p className="text-brand-muted text-[11px] font-semibold uppercase">
                  {texts.ia.fraseLabel}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-brand-purple-dark text-sm font-semibold">
                    {suggestion.phrase}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyPhrase(suggestion.phrase!)}
                    className="text-brand-purple hover:bg-brand-purple/5 inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? texts.ia.copiada : texts.ia.copiar}
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
                {(() => {
                  // {color} se interpola conservando el <strong> (roadmap B1).
                  const parts = splitStudioText(texts.ia.colorLabel, "color");
                  if (!parts) {
                    return fillStudioText(texts.ia.colorLabel, { color: suggestion.colorLabel });
                  }
                  return (
                    <>
                      {parts[0]}
                      <strong>{suggestion.colorLabel}</strong>
                      {parts[1]}
                    </>
                  );
                })()}
              </p>
            </div>

            <div className="bg-brand-cream rounded-xl p-3">
              <p className="text-brand-muted text-[11px] font-semibold uppercase">
                {texts.ia.composicionLabel}
              </p>
              <p className="text-brand-purple-dark mt-1 text-sm">{suggestion.layout}</p>
            </div>

            <div className="bg-brand-cream rounded-xl p-3">
              <p className="text-brand-muted text-[11px] font-semibold uppercase">
                {texts.ia.tipLabel}
              </p>
              <p className="text-brand-purple-dark mt-1 text-sm">{suggestion.tip}</p>
            </div>

            <p className="text-brand-muted text-[11px]">{texts.ia.pie}</p>
          </div>
        )}
      </div>
    </div>
  );
}
