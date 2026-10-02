"use client";

/*
 * "Volver a pedir" (Paquete I, 2026-10-02) — botón + resumen inline del reorder.
 *
 * Componente compartido por las dos superficies del pedido:
 *   - /mi-cuenta/pedidos/[number] (registrado — hiddenField orderNumber, reorderAction)
 *   - /pedido/[token] (invitado — hiddenField token, reorderGuestAction)
 * La página server le pasa la action como prop y los textos ya resueltos (CMS).
 *
 * Tras la action muestra el resumen por ítem: qué entró al carrito (a precio VIGENTE —
 * si cambió respecto al pedido original se muestra), qué requiere subir las fotos de
 * nuevo (diseños purgados por retención) con CTA al Estudio, y qué ya no está disponible.
 */

import { useActionState } from "react";
import Link from "next/link";
import { ImagePlus, Loader2, RefreshCcw, ShoppingCart, TriangleAlert } from "lucide-react";
import { formatCOP } from "@/lib/format";
import type { ReorderActionState } from "@/features/orders/reorder-types";

export type ReorderTexts = {
  cta: string;
  pending: string;
  addedTitle: string;
  needsPhotosTitle: string;
  needsPhotosNote: string;
  photosCta: string;
  unavailableTitle: string;
  goToCart: string;
  /** "ahora {precio}" — se muestra junto al ítem cuando el precio cambió. */
  priceNow: string;
  /** "antes {precio}" */
  priceWas: string;
};

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), template);
}

export function ReorderControl({
  action,
  hiddenField,
  texts,
}: {
  action: (prev: ReorderActionState | null, formData: FormData) => Promise<ReorderActionState>;
  hiddenField: { name: string; value: string };
  texts: ReorderTexts;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const summary = state?.summary;

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name={hiddenField.name} value={hiddenField.value} />
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCcw className="h-4 w-4" aria-hidden />
          )}
          {pending ? texts.pending : texts.cta}
        </button>
      </form>

      {state?.error && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {state.error}
        </p>
      )}

      {summary && (
        <div className="mt-4 space-y-3 text-left">
          {summary.added.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                <ShoppingCart className="h-4 w-4" aria-hidden />
                {texts.addedTitle}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-emerald-900">
                {summary.added.map((a, i) => (
                  <li key={i}>
                    {a.qty} × {a.productName} — {formatCOP(a.unitPrice)}
                    {a.unitPrice !== a.previousUnitPrice && (
                      <span className="text-emerald-700">
                        {" "}
                        ({interpolate(texts.priceNow, { precio: formatCOP(a.unitPrice) })}
                        {", "}
                        {interpolate(texts.priceWas, {
                          precio: formatCOP(a.previousUnitPrice),
                        })}
                        )
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Link
                href="/carrito"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                {texts.goToCart}
              </Link>
            </div>
          )}

          {summary.needsPhotos.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <ImagePlus className="h-4 w-4" aria-hidden />
                {texts.needsPhotosTitle}
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-amber-900">
                {summary.needsPhotos.map((n, i) => (
                  <li key={i}>
                    {n.productName} —{" "}
                    <Link href={n.studioUrl} className="font-semibold underline">
                      {texts.photosCta} →
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-800">{texts.needsPhotosNote}</p>
            </div>
          )}

          {summary.unavailable.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                {texts.unavailableTitle}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-slate-700">
                {summary.unavailable.map((u, i) => (
                  <li key={i}>
                    {u.productName} — {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
