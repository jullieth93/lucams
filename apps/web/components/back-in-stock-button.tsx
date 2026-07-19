"use client";

/*
 * "Avísame cuando vuelva" — para PDP de producto agotado. Suscribe un email (prellenado si el
 * cliente está logueado) vía subscribeBackInStockAction. Auditoría 2026-07-13.
 */

import { useState, useTransition } from "react";
import { Bell, Check } from "lucide-react";
import { subscribeBackInStockAction } from "@/features/back-in-stock/actions";

export function BackInStockButton({
  productId,
  defaultEmail = "",
}: {
  productId: string;
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await subscribeBackInStockAction({ productId, email: email.trim() || undefined });
      if (res.ok) setDone(true);
      else setError(res.message);
    });
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <Check className="h-4 w-4 flex-shrink-0" />
        ¡Listo! Te avisamos por correo apenas vuelva. 💜
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label htmlFor="bis-email" className="text-brand-muted block text-xs">
        Déjanos tu correo y te avisamos cuando vuelva:
      </label>
      <div className="flex gap-2">
        <input
          id="bis-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          className="border-brand-purple/20 focus:ring-brand-purple/30 flex-1 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Bell className="h-4 w-4" />
          Avísame
        </button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {/* #9 — aviso de tratamiento (Ley 1581, minimización): uso declarado estricto + link a la política. */}
      <p className="text-brand-muted text-[11px] leading-snug">
        Usaremos tu correo solo para avisarte cuando este producto vuelva. Consulta cómo tratamos
        tus datos en nuestra{" "}
        <a
          href="/legal/privacidad"
          target="_blank"
          rel="noopener"
          className="hover:text-brand-purple-dark underline"
        >
          Política de Privacidad
        </a>
        .
      </p>
    </form>
  );
}
