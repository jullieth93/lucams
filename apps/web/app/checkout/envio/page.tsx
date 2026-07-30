/*
 * Step 2 — Selección de transportadora.
 *
 * Llama Aveonline para cotizar al cargar (server). Si quote falla
 * (Aveonline down, ciudad no servida, etc.), muestra fallback con CTA
 * a contacto WhatsApp.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Truck, AlertCircle } from "lucide-react";
import { isCatalogMode } from "@/lib/store-mode";
import { CheckoutStepper } from "../_components/stepper";
import { OrderSummary } from "../_components/order-summary";
import { EnvioStep } from "./envio-step";
import {
  CheckoutError,
  loadCheckoutContext,
  assertCheckoutAvailability,
  quoteShipping,
  sealShippingOffers,
} from "@/features/checkout/service";
import { logger } from "@/lib/logger";
import { getCmsBlock } from "@/lib/cms";
import { formatCityDept, splitCityTemplate } from "@/lib/format";
import { RetryQuoteButton } from "./retry-quote-button";

const STOCK_GONE_MSG = "Uno de los productos ya no está disponible. Por favor revisa tu carrito.";

export const metadata: Metadata = {
  title: "Envío · Checkout",
  robots: { index: false, follow: false },
};

// Corre quoteShipping (Aveonline `cotizarDoble`, medido 7–11 s contra la cuenta
// real; timeout 15 s × 2 intentos → peor caso ~30 s bajo degradación) + auth. Es
// una LECTURA idempotente (un kill a mitad es inofensivo), pero acotamos el techo a
// 45 s para no dejar al usuario esperando ni pagar cómputo de más. Ver ADR-049/053.
export const maxDuration = 45;

export default async function CheckoutEnvioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Etapa 1 (modo catálogo): no hay envíos integrados — el checkout es solo
  // el formulario de cotización de 1 paso en /checkout/datos.
  if (isCatalogMode()) redirect("/checkout/datos");

  // Error de la selección de transportadora (selectShippingAction redirige acá con
  // ?error=... cuando la opción elegida no valida). Sin leerlo, el usuario volvía a
  // esta página con la MISMA lista y sin mensaje → callejón sin salida invisible
  // (revisión adversarial #4).
  const { error: selectionError } = await searchParams;

  let ctx;
  try {
    ctx = await loadCheckoutContext();
    await assertCheckoutAvailability(ctx);
  } catch (err) {
    if (err instanceof CheckoutError) {
      if (err.code === "CART_EMPTY" || err.code === "CART_NOT_FOUND") redirect("/carrito");
      if (err.code === "STOCK_UNAVAILABLE") {
        redirect(`/carrito?error=${encodeURIComponent(STOCK_GONE_MSG)}`);
      }
    }
    throw err;
  }

  // Si no completó step 1, mandar de vuelta.
  if (!ctx.state.contact || !ctx.state.address) {
    redirect("/checkout/datos");
  }

  // Cotizar Aveonline. Si falla, mostramos fallback (no crash).
  let quotes: Awaited<ReturnType<typeof quoteShipping>> | null = null;
  let quoteErrorMessage: string | null = null;
  try {
    quotes = await quoteShipping({
      destinationCity: ctx.state.address.city,
      destinationDepartment: ctx.state.address.department,
      contraentrega: false,
      ctx, // ya cargado arriba → no re-consultar cart+customer (revisión #7)
    });
  } catch (err) {
    // La causa real (dims faltantes, timeout, cobertura, pickup mal configurado) YA se
    // loguea en el service con detalle. Al CLIENTE nunca le mostramos el mensaje interno
    // — puede citar rutas /admin, nombres de settings, etc. — sino un banner genérico
    // con salida por WhatsApp (revisión adversarial #1).
    logger.warn({
      event: "checkout.envio.quote_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    quoteErrorMessage = "No pudimos cotizar el envío en este momento.";
  }

  // Sellar el set de cotizaciones ofrecidas (HMAC) para que viaje por el form como
  // hidden input `offersToken`: selectShippingAction solo acepta una selección que
  // coincida EXACTAMENTE con una de estas cotizaciones (anti-manipulación de flete —
  // certificación 2026-07-29). La RSC no puede escribir cookies, por eso el set
  // firmado hace ida y vuelta dentro del HTML.
  const offersToken =
    quotes && quotes.length > 0 ? await sealShippingOffers({ offers: quotes, ctx }) : null;

  // Ruta A (2026-07-29) — microcopy del step editable por Lucy desde
  // /admin/contenido/paginas/checkout (checkout.envio.heading / checkout.envio.subtext);
  // el subtexto admite el token {{ciudad}} que se reemplaza por el destino real.
  const [headingBlock, subtextBlock] = await Promise.all([
    getCmsBlock("checkout.envio.heading"),
    getCmsBlock("checkout.envio.subtext"),
  ]);
  const headingText = headingBlock?.body ?? "Elige cómo te lo enviamos";
  const subtextTemplate = subtextBlock?.body ?? "Cotizamos con Aveonline para {{ciudad}}.";
  const cityLabel = formatCityDept(ctx.state.address.city, ctx.state.address.department);
  const sub = splitCityTemplate(subtextTemplate);

  return (
    <div className="mx-auto max-w-6xl">
      <CheckoutStepper current={2} />

      {selectionError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {selectionError} — elige de nuevo tu transportadora.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {quoteErrorMessage || !quotes || quotes.length === 0 ? (
          <>
            <div className="lg:col-span-2">
              <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-brand-purple-dark font-display mb-1 flex items-center gap-2 text-lg font-bold">
                  <Truck className="h-5 w-5" />
                  {headingText}
                </h2>
                <p className="text-brand-muted mb-5 text-sm">
                  {sub.pre}
                  <strong>{cityLabel}</strong>
                  {sub.post}
                </p>
                <QuoteError
                  message={
                    quoteErrorMessage ?? "No encontramos transportadoras que cubran esa ciudad."
                  }
                />
              </section>
            </div>
            <div className="lg:col-span-1">
              <OrderSummary
                cart={ctx.cart}
                shippingCost={ctx.state.shippingSelection?.fleteCop ?? null}
                shippingLabel={ctx.state.shippingSelection?.carrierName}
              />
            </div>
          </>
        ) : (
          // EnvioStep es client component que comparte state entre QuoteList
          // y OrderSummary (Lucy 2026-05-21 — sidebar reactivo al cambio de transportadora).
          <EnvioStep
            cart={ctx.cart}
            quotes={quotes}
            offersToken={offersToken!}
            preselectedQuoteId={ctx.state.shippingSelection?.quoteId}
            destinationCity={ctx.state.address.city}
            destinationDepartment={ctx.state.address.department}
            headingText={headingText}
            subtextTemplate={subtextTemplate}
          />
        )}
      </div>
    </div>
  );
}

function QuoteError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900">No pudimos cotizar el envío</h3>
          <p className="mt-1 text-xs text-amber-800">{message}</p>
          <p className="mt-1 text-xs text-amber-700">
            Suele resolverse reintentando en unos segundos.
          </p>
          {/* #25 — acción PRIMARIA: re-cotizar sin recargar la página. */}
          <div className="mt-3">
            <RetryQuoteButton />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/checkout/datos"
              className="text-xs font-semibold text-amber-900 underline hover:text-amber-950"
            >
              Revisar dirección
            </Link>
            <span className="text-amber-700">·</span>
            <Link
              href="/contacto"
              className="text-xs font-semibold text-amber-900 underline hover:text-amber-950"
            >
              Contáctanos por WhatsApp
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
