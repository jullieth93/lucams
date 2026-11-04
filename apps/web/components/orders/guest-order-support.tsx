"use client";

/*
 * Bloque de ayuda y posventa para `/pedido/[token]` ([CX-01]).
 *
 * Cierra el callejón sin salida posventa de compradores invitados (especialmente en `DELIVERED`):
 *  - Ofrece salida directa a WhatsApp con el número de pedido pre-armado.
 *  - Permite abrir un ticket formal de soporte/PQR vinculado a la orden, protegido por el
 *    capability token del pedido (`publicAccessTokenHash`) + confirmación del correo de compra
 *    + rate-limit en servidor.
 */

import { useActionState } from "react";
import { HelpCircle, Loader2, MessageSquarePlus, CheckCircle2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/brand";
import type { GuestOrderSupportState } from "@/app/pedido/[token]/actions";

const GUEST_SUPPORT_TOPICS = [
  { value: "MI_PEDIDO", label: "Consulta sobre mi pedido" },
  { value: "ENVIO_RASTREO", label: "Entrega o seguimiento" },
  { value: "GARANTIA_DEVOLUCION", label: "Garantía, novedad o devolución" },
  { value: "PAGO_FACTURACION", label: "Pago o comprobante" },
] as const;

export function GuestOrderSupportCard({
  token,
  orderNumber,
  maskedEmail,
  waUrl,
  isDelivered,
  action,
}: {
  token: string;
  orderNumber: string;
  maskedEmail: string;
  waUrl: string | null;
  isDelivered: boolean;
  action: (prev: GuestOrderSupportState, formData: FormData) => Promise<GuestOrderSupportState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className="border-brand-purple/15 mb-4 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-brand-purple-dark flex items-center gap-2 text-sm font-bold">
        <HelpCircle className="text-brand-purple h-4 w-4" aria-hidden />
        ¿Necesitas ayuda con tu pedido?
      </h2>
      <p className="text-brand-muted mt-1 text-xs leading-relaxed">
        {isDelivered
          ? "Tu pedido figura como entregado. Si necesitas soporte, tienes alguna novedad o requieres gestionar garantía o retracto sobre un producto elegible arriba, estamos para acompañarte."
          : `Estamos atentos a tu pedido ${orderNumber}. Escríbenos por WhatsApp o déjanos un caso formal de soporte y te responderemos al correo de compra (${maskedEmail}).`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
          >
            <WhatsAppIcon className="h-4 w-4" aria-hidden />
            Escribir por WhatsApp
          </a>
        )}
      </div>

      {state?.ok ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-700" aria-hidden />
          <div>
            <p className="font-semibold">
              ¡Recibimos tu solicitud! Radicado #{state.ticketShortId}
            </p>
            <p className="mt-0.5 text-emerald-800">
              Te enviamos confirmación a tu correo de compra y nuestro equipo te responderá pronto.
            </p>
          </div>
        </div>
      ) : (
        <details className="border-brand-purple/10 mt-3 border-t pt-3">
          <summary className="text-brand-purple-dark hover:text-brand-purple inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold">
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
            Abrir solicitud de soporte por correo
          </summary>

          <form action={formAction} className="mt-3 space-y-3">
            <input type="hidden" name="token" value={token} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="guest-support-email"
                  className="text-brand-purple-dark block text-xs font-medium"
                >
                  Correo con el que compraste
                </label>
                <input
                  id="guest-support-email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  className="border-brand-purple/20 focus:ring-brand-purple/30 mt-1 min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-xs focus:ring-2 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="guest-support-subject"
                  className="text-brand-purple-dark block text-xs font-medium"
                >
                  Motivo
                </label>
                <select
                  id="guest-support-subject"
                  name="subject"
                  defaultValue={isDelivered ? "GARANTIA_DEVOLUCION" : "MI_PEDIDO"}
                  className="border-brand-purple/20 focus:ring-brand-purple/30 mt-1 min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-xs focus:ring-2 focus:outline-none"
                >
                  {GUEST_SUPPORT_TOPICS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="guest-support-message"
                className="text-brand-purple-dark block text-xs font-medium"
              >
                Cuéntanos cómo podemos ayudarte
              </label>
              <textarea
                id="guest-support-message"
                name="message"
                rows={3}
                required
                minLength={10}
                maxLength={2000}
                placeholder="Describe tu consulta o novedad con el mayor detalle posible…"
                className="border-brand-purple/20 focus:ring-brand-purple/30 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs focus:ring-2 focus:outline-none"
              />
            </div>

            {state && !state.ok && (
              <p role="alert" className="text-xs font-medium text-rose-700">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="bg-brand-purple hover:bg-brand-purple-dark inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors disabled:opacity-60"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Enviar solicitud
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
