"use client";

/*
 * Botón "Copiar" para el código/link de referido (referidos v1).
 * Mismo patrón que copy-quote-link: feedback inline breve.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function ReferralCopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard no disponible (permiso/contexto inseguro) — noop */
        }
      }}
      className={
        className ??
        "text-brand-purple-dark hover:bg-brand-purple/10 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
      }
      aria-live="polite"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? "¡Copiado!" : label}
    </button>
  );
}
