"use client";

/*
 * StudioTextEditHint (Ola 2, 2026-10-26) — pista de DESCUBRIBILIDAD de la
 * edición directa de texto en el lienzo.
 *
 * La edición por tap sobre los textos editables (rect punteado + punto
 * turquesa → StudioSlotEditModal pestaña Texto) existe desde siempre, pero los
 * clientes no la descubren: esta pill junto al lienzo lo anuncia UNA vez por
 * sesión de Estudio hasta que el cliente la descarta (×), y el descarte
 * persiste en localStorage (no vuelve a aparecer).
 *
 * Diseño: pill EN FLUJO (no overlay) justo encima del lienzo — no puede
 * bloquear gestos ni taps del canvas (requisito explícito). Sin animaciones
 * (respeta prefers-reduced-motion de facto). La monta el editor SOLO cuando la
 * plantilla vigente tiene capas de texto editables.
 */

import { useState } from "react";
import { PencilLine, X } from "lucide-react";
import { useStudioTexts } from "./studio-texts-provider";

/** localStorage: "1" = la pista ya se descartó (no volver a mostrar). */
export const TEXT_EDIT_HINT_STORAGE_KEY = "lucams-estudio-text-edit-hint";

export function StudioTextEditHint() {
  const texts = useStudioTexts();
  // Initializer lazy (el editor carga con ssr:false — window existe): leer el
  // descarte persistido UNA vez, sin efecto (patrón react-hooks/set-state).
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(TEXT_EDIT_HINT_STORAGE_KEY) !== "1";
    } catch {
      // Incognito / storage bloqueado: se muestra igual (no persiste el descarte).
      return true;
    }
  });
  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(TEXT_EDIT_HINT_STORAGE_KEY, "1");
    } catch {
      // storage no disponible: el descarte solo aplica a esta sesión.
    }
    setVisible(false);
  };

  return (
    <p
      role="note"
      className="bg-brand-turquoise/10 text-brand-purple-dark mx-auto mb-2 flex max-w-md items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 text-xs font-medium"
    >
      <PencilLine className="text-brand-purple h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 leading-snug">{texts.lienzo.textoEditableHint}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={texts.comun.cerrarTip}
        className="text-brand-purple-dark/60 hover:bg-brand-purple/10 hover:text-brand-purple-dark focus:ring-brand-turquoise inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors focus:ring-2 focus:outline-none"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </p>
  );
}
