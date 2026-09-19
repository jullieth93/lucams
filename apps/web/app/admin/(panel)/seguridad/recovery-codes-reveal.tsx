"use client";

/*
 * <RecoveryCodesReveal> — bloque de UNA SOLA VISTA para los códigos de
 * respaldo de MFA recién generados: advertencia + grilla + copiar/descargar.
 *
 * Lo comparten <RecoveryCodesPanel> (regeneración manual desde la pantalla de
 * Seguridad) y <MfaEnroll> (paso obligatorio tras enrolar el TOTP — Fase 3B,
 * feedback Lucy 2026-09-18), para no duplicar el renderizado de los códigos.
 *
 * `children` opcional se renderiza bajo el bloque: el enrolamiento lo usa para
 * el checkbox "Ya guardé mis códigos" + botón "Finalizar".
 */

import { useState, type ReactNode } from "react";
import { Copy, Check, Download, AlertTriangle } from "lucide-react";

export function RecoveryCodesReveal({
  codes,
  children,
}: {
  codes: string[];
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  function copyAll() {
    navigator.clipboard?.writeText(codes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadTxt() {
    const body = [
      "Lucams Shop — Códigos de respaldo de verificación en 2 pasos",
      "",
      "Cada código se puede usar UNA sola vez. Guárdalos en un lugar seguro.",
      "",
      ...codes,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lucams-codigos-respaldo.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="border-brand-purple/15 bg-brand-cream/40 rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2 text-amber-700">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-xs font-semibold">
          Cada código sirve UNA sola vez y no los volverás a ver: guárdalos AHORA en un lugar
          seguro. Si los regeneras, los anteriores dejan de servir.
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 font-mono text-sm sm:grid-cols-2">
        {codes.map((c) => (
          <li
            key={c}
            className="text-brand-purple-dark rounded bg-white px-2 py-1 text-center tracking-wider"
          >
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyAll}
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "¡Copiados!" : "Copiar todos"}
        </button>
        <button
          type="button"
          onClick={downloadTxt}
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar .txt
        </button>
      </div>
      {children}
    </div>
  );
}
