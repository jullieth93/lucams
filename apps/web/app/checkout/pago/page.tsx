/*
 * Step 3 — Resumen final + redirect a Wompi.
 *
 * Recap completo de lo que el cliente está por comprar.
 * Botón "Pagar con Wompi" dispara finalizeCheckout() → crea Order
 * + redirige a checkout hosted de Wompi.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CreditCard, MapPin, User, Receipt } from "lucide-react";
import { CheckoutStepper } from "../_components/stepper";
import { OrderSummary } from "../_components/order-summary";
import { PaymentMethodChooser } from "./pay-button";
import { CouponField } from "./coupon-field";
import { CheckoutError, getAppliedCoupon, loadCheckoutContext } from "@/features/checkout/service";
import { getSettingValue } from "@/lib/cms";

export const metadata: Metadata = {
  title: "Pago · Checkout",
  robots: { index: false, follow: false },
};

// El pago contraentrega confirma la orden AQUÍ (finalizeCheckout → processPaidOrder →
// createShipment ~20s). La función debe contener ese presupuesto para no matar la
// generación de guía a mitad. 60s cabe en el default de Vercel (300s). Ver ADR-049.
export const maxDuration = 60;

type SearchParams = Promise<{ error?: string }>;

export default async function CheckoutPagoPage({ searchParams }: { searchParams: SearchParams }) {
  let ctx;
  try {
    ctx = await loadCheckoutContext();
  } catch (err) {
    if (
      err instanceof CheckoutError &&
      (err.code === "CART_EMPTY" || err.code === "CART_NOT_FOUND")
    ) {
      redirect("/carrito");
    }
    throw err;
  }

  const sp = await searchParams;
  const errorMsg = sp.error;

  if (!ctx.state.contact || !ctx.state.address) redirect("/checkout/datos");
  if (!ctx.state.shippingSelection) redirect("/checkout/envio");

  const { contact, address, billing, shippingSelection } = ctx.state;

  // F1 — cupón aplicado (si hay): descuento vigente + posible aviso si dejó de valer.
  const applied = await getAppliedCoupon();

  // Toggle de negocio: ¿se ofrece contra entrega? (editable en /admin/contenido/configuracion)
  const codEnabled = (await getSettingValue("COD_ENABLED", "true")) === "true";

  return (
    <div className="mx-auto max-w-6xl">
      <CheckoutStepper current={3} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-700" />
              <div>
                <h3 className="text-sm font-semibold text-rose-900">No pudimos procesar el pago</h3>
                <p className="mt-1 text-xs text-rose-800">{decodeURIComponent(errorMsg)}</p>
              </div>
            </div>
          )}

          {/* Resumen de contacto */}
          <ReviewCard icon={<User className="h-4 w-4" />} title="Contacto" href="/checkout/datos">
            <p className="text-brand-purple-dark text-sm font-semibold">{contact.fullName}</p>
            <p className="text-brand-purple-dark/70 text-xs">{contact.email}</p>
            <p className="text-brand-purple-dark/70 text-xs">{contact.phone}</p>
            {contact.documentType && contact.documentNumber && (
              <p className="text-brand-muted text-xs">
                {contact.documentType} {contact.documentNumber}
              </p>
            )}
          </ReviewCard>

          {/* Resumen de envío */}
          <ReviewCard
            icon={<MapPin className="h-4 w-4" />}
            title="Dirección de envío"
            href="/checkout/datos"
          >
            <p className="text-brand-purple-dark text-sm">
              {address.kind === "urban" ? (
                <>
                  {address.viaType} {address.viaNumber}
                  {address.viaBis && " Bis"}
                  {address.viaCardinal && ` ${address.viaCardinal}`} # {address.cruceNumber}
                  {address.cruceCardinal && ` ${address.cruceCardinal}`}
                  {address.detail && ` (${address.detail})`}
                </>
              ) : (
                <>
                  Vereda {address.vereda}
                  {address.finca && ` · Finca ${address.finca}`}
                </>
              )}
            </p>
            {address.kind === "rural" && (
              <p className="text-brand-purple-dark/70 text-xs italic">Ref: {address.referencia}</p>
            )}
            <p className="text-brand-purple-dark/70 text-xs">
              {address.city}, {address.department}
              {address.zip && ` · ${address.zip}`}
            </p>
            {address.notes && (
              <p className="text-brand-muted mt-1 text-xs italic">Nota: {address.notes}</p>
            )}
            <p className="text-brand-purple-dark mt-2 text-xs font-medium">
              Vía {shippingSelection.carrierName}
              {shippingSelection.deliveryDays > 0 &&
                ` · ${shippingSelection.deliveryDays} día${shippingSelection.deliveryDays === 1 ? "" : "s"} hábil${shippingSelection.deliveryDays === 1 ? "" : "es"}`}
            </p>
          </ReviewCard>

          {/* Facturación (si aplica) */}
          {billing?.wantsInvoice && (
            <ReviewCard
              icon={<Receipt className="h-4 w-4" />}
              title="Facturación electrónica"
              href="/checkout/datos"
            >
              <p className="text-brand-purple-dark text-sm">{billing.name}</p>
              <p className="text-brand-purple-dark/70 text-xs">
                {billing.documentType} {billing.documentNumber}
              </p>
              <p className="text-brand-muted mt-1 text-xs">
                Recibirás la factura DIAN a {contact.email}
              </p>
            </ReviewCard>
          )}

          {/* Método de pago */}
          <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-lg font-bold">
              <CreditCard className="h-5 w-5" />
              Método de pago
            </h2>

            <PaymentMethodChooser backHref="/checkout/envio" codEnabled={codEnabled} />
          </section>
        </div>

        <div className="lg:col-span-1 space-y-4">
          <div className="border-brand-purple/10 rounded-2xl border bg-white p-4 shadow-sm">
            <CouponField
              appliedCode={applied?.code}
              appliedError={applied?.error}
            />
          </div>
          <OrderSummary
            cart={ctx.cart}
            shippingCost={shippingSelection.fleteCop}
            shippingLabel={shippingSelection.carrierName}
            discount={applied && !applied.error ? applied.discount : 0}
            couponCode={applied && !applied.error ? applied.code : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewCard({
  icon,
  title,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-brand-purple-dark flex items-center gap-2 text-sm font-bold">
          {icon}
          {title}
        </h3>
        <Link
          href={href}
          className="text-brand-purple-dark hover:text-brand-purple text-xs font-semibold"
        >
          Editar
        </Link>
      </header>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}
