"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyQuoteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado ✨ Ya puedes compartir tu cotización.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("Copia tu link para compartirlo:", { description: url, duration: 10000 });
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Link copiado" : "Copiar link de la cotización"}
    </button>
  );
}
