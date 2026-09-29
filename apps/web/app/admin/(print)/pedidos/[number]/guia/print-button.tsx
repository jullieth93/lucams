"use client";

/** Botón de impresión de la guía de entrega interna (window.print()). */
export function PrintGuideButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white print:hidden"
    >
      🖨 Imprimir guía
    </button>
  );
}
