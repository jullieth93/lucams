"use client";

/*
 * StudioTextEditorModal — M.3.b.D (2026-05-14).
 *
 * Modal de edición inline de un text layer editable del template.
 * Cuando el cliente click sobre un texto editable en el canvas (ej. el
 * username de la plantilla Social Post), este modal se abre con:
 *
 *   - Input text para el contenido
 *   - Color picker (9 colores brand)
 *   - Font picker (8 fuentes pre-armadas)
 *
 * Diseño UX:
 *   - Modal compacto (Radix Dialog), no fullscreen
 *   - Preview en vivo del texto con los cambios mientras editás
 *   - Aplicar al click "Aplicar" → persiste en SlotState.textOverrides
 *   - Cerrar sin aplicar = cancela cambios (no auto-save preview)
 *
 * Constraint técnico: las fonts brand (Fredoka, Caveat, Patrick Hand) deben
 * estar cargadas vía CSS @import en globals.css para que Konva.Text las use.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Bold, Check, Italic, Type } from "lucide-react";
import { FONT_PRESETS, TEXT_COLOR_PRESETS } from "./lib/fonts";
import type { TextLayer, TextOverride } from "./types";

type StudioTextEditorModalProps = {
  isOpen: boolean;
  /** Layer base del template (el texto default si no hay override). */
  layer: TextLayer | null;
  /** Override actual del slot, si existe. */
  currentOverride: TextOverride | undefined;
  /** Etiqueta del slot que se está editando (ej. "Imán 1 de 6"). */
  slotLabel?: string;
  onClose: () => void;
  /** Aplicar el override final (combinación de cambios). null = limpiar override. */
  onApply: (override: TextOverride | null) => void;
};

export function StudioTextEditorModal(props: StudioTextEditorModalProps) {
  const { isOpen, layer, currentOverride, slotLabel, onClose, onApply } = props;
  // Re-mount el inner cada vez que cambia el layer target — así los useState
  // se re-inicializan con los valores correctos sin necesitar useEffect.
  // Key compuesto: layerId + override JSON para detectar cambios externos.
  const innerKey = layer ? `${layer.id}:${JSON.stringify(currentOverride ?? null)}` : "none";
  return (
    <ModalInner
      key={innerKey}
      isOpen={isOpen}
      layer={layer}
      currentOverride={currentOverride}
      slotLabel={slotLabel}
      onClose={onClose}
      onApply={onApply}
    />
  );
}

function ModalInner({
  isOpen,
  layer,
  currentOverride,
  slotLabel,
  onClose,
  onApply,
}: StudioTextEditorModalProps) {
  // Estado local inicializado con valores del layer + override actual.
  // Re-mount via key del wrapper garantiza que cada vez que se abre el
  // modal con otro target, estos defaults se recalculan.
  const [text, setText] = useState(currentOverride?.text ?? layer?.text ?? "");
  const [fontFamily, setFontFamily] = useState(
    currentOverride?.fontFamily ?? layer?.fontFamily ?? FONT_PRESETS[0].fontFamily,
  );
  const [fill, setFill] = useState(currentOverride?.fill ?? layer?.fill ?? "#262626");
  // M.3.b.UX.4 — Font size slider + bold/italic toggles
  const baseFontSize = layer?.fontSize ?? 24;
  const [fontSize, setFontSize] = useState(currentOverride?.fontSize ?? baseFontSize);
  const baseFontWeight = layer?.fontWeight ?? "normal";
  const initialWeight = currentOverride?.fontWeight ?? baseFontWeight;
  const [isBold, setIsBold] = useState(
    initialWeight === "bold" || initialWeight === "italic bold" || initialWeight === "bold italic",
  );
  const [isItalic, setIsItalic] = useState(
    initialWeight === "italic" ||
      initialWeight === "italic bold" ||
      initialWeight === "bold italic",
  );

  if (!layer) return null;

  // Compute fontWeight final desde toggles
  const computedFontWeight = (() => {
    if (isBold && isItalic) return "bold italic";
    if (isBold) return "bold";
    if (isItalic) return "italic";
    return "normal";
  })();

  // Construir el override final: solo incluye fields que difieren del base.
  const handleApply = () => {
    const override: TextOverride = {};
    if (text !== layer.text) override.text = text;
    if (fontFamily !== (layer.fontFamily ?? FONT_PRESETS[0].fontFamily))
      override.fontFamily = fontFamily;
    if (fill !== (layer.fill ?? "#262626")) override.fill = fill;
    if (fontSize !== baseFontSize) override.fontSize = fontSize;
    if (computedFontWeight !== baseFontWeight) override.fontWeight = computedFontWeight;
    // Si nada cambió, limpiar el override existente (null)
    const hasChanges = Object.keys(override).length > 0;
    onApply(hasChanges ? override : null);
    onClose();
  };

  const handleReset = () => {
    setText(layer.text);
    setFontFamily(layer.fontFamily ?? FONT_PRESETS[0].fontFamily);
    setFill(layer.fill ?? "#262626");
    setFontSize(baseFontSize);
    setIsBold(baseFontWeight === "bold" || baseFontWeight.includes("bold"));
    setIsItalic(baseFontWeight === "italic" || baseFontWeight.includes("italic"));
  };

  // Preview compute — escala 70% del fontSize actual (no del base original)
  const previewFontSize = Math.min(fontSize * 0.7, 36);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0">
        <div className="border-brand-purple/10 flex items-center gap-2 border-b px-4 py-3">
          <div className="bg-brand-purple/10 text-brand-purple flex h-7 w-7 items-center justify-center rounded-md">
            <Type className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <DialogTitle className="text-brand-purple-dark text-sm font-bold">
              Editar texto
            </DialogTitle>
            <DialogDescription className="text-brand-purple-dark/55 text-[11px]">
              {slotLabel ? `${slotLabel} · ` : ""}Click &quot;Aplicar&quot; para guardar
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-4 p-4">
          {/* Preview live — más grande (min-h 100px) + escala 70% en vez de 60% */}
          <div
            className="ring-brand-purple/10 from-brand-cream flex min-h-[100px] items-center justify-center rounded-md bg-gradient-to-br to-white px-3 py-4 text-center ring-1"
            style={{
              fontFamily,
              color: fill,
              fontSize: previewFontSize,
              fontWeight: isBold ? "bold" : "normal",
              fontStyle: isItalic ? "italic" : "normal",
              lineHeight: 1.1,
              wordBreak: "break-word",
            }}
          >
            {text || <span className="text-brand-purple-dark/30 italic">Sin texto</span>}
          </div>

          {/* Input texto */}
          <div>
            <label
              htmlFor="text-edit-input"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Texto
            </label>
            <input
              id="text-edit-input"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={120}
              className="border-brand-purple/15 text-brand-purple-dark focus:border-brand-turquoise focus:ring-brand-turquoise/30 w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none"
              placeholder="Escribí tu texto…"
              autoFocus
            />
          </div>

          {/* M.3.b.UX.4 — Font size slider + bold/italic toggles */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-brand-purple-dark/70 mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span>Tamaño</span>
                <span className="text-brand-purple-dark/55 tabular-nums">{fontSize}px</span>
              </label>
              <Slider
                min={8}
                max={72}
                step={2}
                value={[fontSize]}
                onValueChange={(v) => setFontSize(v[0])}
                aria-label="Tamaño del texto"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsBold((v) => !v)}
                aria-pressed={isBold}
                aria-label="Negrita"
                title="Negrita"
                className={[
                  "focus:ring-brand-turquoise flex h-9 w-9 items-center justify-center rounded-md transition-colors focus:ring-2 focus:outline-none",
                  isBold
                    ? "bg-brand-purple text-white shadow-sm"
                    : "ring-brand-purple/20 text-brand-purple-dark/70 hover:bg-brand-purple/10 ring-1",
                ].join(" ")}
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsItalic((v) => !v)}
                aria-pressed={isItalic}
                aria-label="Cursiva"
                title="Cursiva"
                className={[
                  "focus:ring-brand-turquoise flex h-9 w-9 items-center justify-center rounded-md transition-colors focus:ring-2 focus:outline-none",
                  isItalic
                    ? "bg-brand-purple text-white shadow-sm"
                    : "ring-brand-purple/20 text-brand-purple-dark/70 hover:bg-brand-purple/10 ring-1",
                ].join(" ")}
              >
                <Italic className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="text-brand-purple-dark/70 mb-1.5 block text-xs font-semibold">
              Color
            </label>
            <div className="grid grid-cols-9 gap-1.5">
              {TEXT_COLOR_PRESETS.map((c) => {
                const isSelected = fill === c.color;
                return (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => setFill(c.color)}
                    aria-label={c.label}
                    title={c.label}
                    className={[
                      "relative h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none",
                      isSelected
                        ? "ring-brand-turquoise scale-110 ring-2 ring-offset-2"
                        : "ring-brand-purple/15 hover:ring-brand-purple/40 ring-1",
                    ].join(" ")}
                    style={{ backgroundColor: c.color }}
                  >
                    {isSelected && (
                      <Check
                        className={[
                          "absolute inset-0 m-auto h-4 w-4",
                          c.color === "#FFFFFF" ? "text-brand-purple-dark" : "text-white",
                        ].join(" ")}
                        strokeWidth={3}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font picker */}
          <div>
            <label className="text-brand-purple-dark/70 mb-1.5 block text-xs font-semibold">
              Tipografía
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {FONT_PRESETS.map((f) => {
                const isSelected = fontFamily === f.fontFamily;
                return (
                  <button
                    key={f.fontFamily}
                    type="button"
                    onClick={() => setFontFamily(f.fontFamily)}
                    aria-label={`Tipografía ${f.label}`}
                    title={f.mood}
                    className={[
                      "flex items-center justify-between rounded-md px-2.5 py-2 text-left transition-all focus:outline-none",
                      isSelected
                        ? "bg-brand-turquoise/10 ring-brand-turquoise ring-2"
                        : "ring-brand-purple/15 hover:ring-brand-purple/40 ring-1",
                    ].join(" ")}
                  >
                    <span
                      className="text-brand-purple-dark text-sm"
                      style={{ fontFamily: f.fontFamily }}
                    >
                      {f.label}
                    </span>
                    {isSelected && <Check className="text-brand-turquoise h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-brand-purple/10 bg-brand-cream/30 flex items-center justify-between border-t px-4 py-3">
          <button
            type="button"
            onClick={handleReset}
            className="text-brand-purple-dark/70 hover:text-brand-purple-dark text-xs font-semibold underline"
          >
            Volver al original
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-brand-purple-dark/70 hover:bg-brand-purple/10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="bg-brand-purple hover:bg-brand-purple-dark rounded-md px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
