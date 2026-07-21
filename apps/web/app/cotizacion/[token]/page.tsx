/*
 * Confirmación de cotización (Etapa 1 — modo catálogo).
 *
 * Vista PÚBLICA por token (guest sin login, mismo patrón que /pedido/[token]):
 * el cliente llega acá tras crear la cotización en /checkout/datos. Muestra el
 * número (COT-XXXXXX), el snapshot de items y el total, y el CTA principal:
 * botón verde de WhatsApp con el mensaje pre-armado (buildQuoteWhatsAppUrl).
 *
 * getQuoteByToken usa select explícito SIN PII sensible (ni WhatsApp ni email
 * del cliente, ni notas internas del admin) — esta página es compartible.
 * El carrito ya quedó vacío server-side al crear la cotización (el header lo
 * refleja solo); acá lo mencionamos para que el cliente no lo busque.
 *
 * noindex: la URL es de un solo uso y trae un token opaco.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, MessageCircle, Sparkles } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { LucamsLogo } from "@/components/lucams-logo";
import { formatCOP, formatCityDept } from "@/lib/format";
import { buildQuoteWhatsAppUrl, getQuoteByToken } from "@/features/quotes/service";

export const metadata: Metadata = {
  title: "Tu cotización · Lucams",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

export default async function CotizacionPage({ params }: { params: Params }) {
  const { token } = await params;
  const quote = await getQuoteByToken(token);
  if (!quote) notFound();

  const waUrl = await buildQuoteWhatsAppUrl(quote);

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-100">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          </div>
          <h1 className="font-display text-brand-purple-dark mt-6 text-3xl font-bold sm:text-4xl">
            ¡Listo, {quote.customerName.split(" ")[0]}! Tu cotización está lista ✨
          </h1>
          <p className="text-brand-purple-dark/75 mx-auto mt-3 max-w-md text-sm sm:text-base">
            Te contactamos por WhatsApp para concretar precio, pago y entrega
            {quote.city ? ` en ${formatCityDept(quote.city, quote.department)}` : ""}. ¿Quieres ir
            más rápido? Mándanos la cotización por aquí:
          </p>

          {/* Número grande de la cotización */}
          <div className="from-brand-purple/10 to-brand-pink/10 mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-5 py-2.5">
            <LucamsLogo className="h-6 w-6" />
            <span className="text-brand-purple-dark text-sm font-medium">Cotización</span>
            <code className="text-brand-purple-dark rounded bg-white/60 px-2 py-0.5 font-mono text-base font-bold">
              {quote.number}
            </code>
          </div>

          {/* Items cotizados */}
          <section className="border-brand-purple/10 mt-8 rounded-2xl border bg-white p-5 text-left shadow-sm">
            <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
              Esto es lo que cotizaste
            </h2>
            <ul className="divide-brand-purple/10 divide-y">
              {quote.items.map((item, idx) => {
                // La variante "Default" es interna (productos sin opciones) — no se muestra.
                const showVariant = item.variantName && item.variantName !== "Default";
                return (
                  <li key={idx} className="flex items-start gap-3 py-3">
                    <div className="bg-brand-purple/5 relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                      {item.previewUrl ? (
                        <Image
                          src={item.previewUrl}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Sparkles className="text-brand-muted h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-brand-purple-dark text-sm leading-snug font-medium">
                        {item.productName}
                        {showVariant && (
                          <span className="text-brand-muted font-normal"> · {item.variantName}</span>
                        )}
                      </p>
                      <p className="text-brand-muted text-xs tabular-nums">
                        {item.quantity} × {formatCOP(item.unitPrice)}
                      </p>
                    </div>
                    <div className="text-brand-purple-dark flex-shrink-0 text-sm font-semibold tabular-nums">
                      {formatCOP(item.unitPrice * item.quantity)}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-brand-purple/10 mt-2 flex justify-between border-t pt-3">
              <span className="text-brand-purple-dark font-display text-base font-bold">Total</span>
              <span className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
                {formatCOP(quote.total)}
              </span>
            </div>
            <p className="text-brand-muted mt-1 text-[10px]">
              Precios en pesos colombianos (COP) · el envío se coordina por WhatsApp al confirmar tu
              cotización
            </p>
          </section>

          {/* CTA principal: WhatsApp */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              asChild
              size="lg"
              className="w-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 sm:w-auto sm:px-8"
            >
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                Enviar cotización por WhatsApp
              </a>
            </Button>
            <p className="text-brand-muted max-w-md text-xs">
              Se abre WhatsApp con el mensaje ya listo (número de cotización, productos y total) —
              solo dale enviar.
            </p>
            <Link
              href="/productos"
              className="text-brand-purple-dark/70 hover:text-brand-purple mt-2 text-sm font-medium"
            >
              ← Seguir explorando
            </Link>
            <p className="text-brand-muted text-xs">
              Tu carrito quedó vacío al crear la cotización — puedes armar otra cuando quieras.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
