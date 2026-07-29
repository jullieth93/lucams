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
import { isCatalogMode } from "@/lib/store-mode";
import { CheckoutStepper } from "../_components/stepper";
import { OrderSummary } from "../_components/order-summary";
import { PaymentMethodChooser } from "./pay-button";
import { CouponField } from "./coupon-field";
import {
  CheckoutError,
  getAppliedCoupon,
  loadCheckoutContext,
  assertCheckoutAvailability,
} from "@/features/checkout/service";
import { getSettingValue } from "@/lib/cms";
import { CmsText } from "@/components/cms/cms-text";
import { formatCityDept } from "@/lib/format";

const STOCK_GONE_MSG = "Uno de los productos ya no está disponible. Por favor revisa tu carrito.";

export const metadata: Metadata = {
  title: "Pago · Checkout",
  robots: { index: false, follow: false },
};

// El pago contraentrega confirma la orden AQUÍ (finalizeCheckout → processPaidOrder →
// createShipment ~20s). La función debe contener ese presupuesto para no matar la
// generación de guía a mitad. 60s cabe en el default de Vercel (300s). Ver ADR-049.
export const maxDuration = 60;

type SearchParams = Promise<{ error?: string; couponNotice?: string }>;

export default async function CheckoutPagoPage({ searchParams }: { searchParams: SearchParams }) {
  // Etapa 1 (modo catálogo): no hay pagos en línea — el checkout es solo el
  // formulario de cotización de 1 paso en /checkout/datos.
  if (isCatalogMode()) redirect("/checkout/datos");

  let ctx;
  try {
    ctx = await loadCheckoutContext();
    await assertCheckoutAvailability(ctx);
  } catch (err) {
    if (
      err instanceof CheckoutError &&
      (err.code === "CART_EMPTY" || err.code === "CART_NOT_FOUND")
    ) {
      redirect("/carrito");
    }
    if (err instanceof CheckoutError && err.code === "STOCK_UNAVAILABLE") {
      redirect(`/carrito?error=${encodeURIComponent(STOCK_GONE_MSG)}`);
    }
    throw err;
  }

  const sp = await searchParams;
  const errorMsg = sp.error;
  // Aviso de cupón invalidado: NO es un fallo de pago (la tarjeta nunca se tocó). Se muestra como
  // aviso suave, con param propio, para no alarmar al cliente con "No pudimos procesar el pago".
  const couponNotice = sp.couponNotice;

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
        {/* #22 — en móvil: avisos full-width arriba, luego el resumen+total (order-1, sidebar) y por
            último las tarjetas de revisión + botón de pago (order-2). En lg+ se restaura el layout de
            dos columnas (lg:order-none). Así el total deja de aparecer DESPUÉS del botón de pago. */}
        {(errorMsg || couponNotice) && (
          <div className="space-y-4 lg:col-span-3">
            {errorMsg && (
              <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-700" />
                <div>
                  <h3 className="text-sm font-semibold text-rose-900">
                    No pudimos procesar el pago
                  </h3>
                  {/* searchParams ya viene decodificado; un decodeURIComponent extra con '%' literal
                      lanzaría URIError y tumbaría la página (auditoría v3, quick win). */}
                  <p className="mt-1 text-xs text-rose-800">{errorMsg}</p>
                </div>
              </div>
            )}

            {couponNotice && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">
                    Revisa tu pedido antes de pagar
                  </h3>
                  <p className="mt-1 text-xs text-amber-800">{couponNotice}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="order-2 space-y-4 lg:order-none lg:col-span-2">
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
              {/* #30 — sin duplicar ciudad/departamento (Bogotá D.C.). */}
              {formatCityDept(address.city, address.department)}
              {address.zip && ` · ${address.zip}`}
            </p>
            {address.notes && (
              <p className="text-brand-muted mt-1 text-xs italic">Nota: {address.notes}</p>
            )}
            <p className="text-brand-purple-dark mt-2 text-xs font-medium">
              Vía {shippingSelection.carrierName}
              {shippingSelection.deliveryDays > 0 &&
                ` · estimado de la transportadora: ${shippingSelection.deliveryDays} día${shippingSelection.deliveryDays === 1 ? "" : "s"} hábil${shippingSelection.deliveryDays === 1 ? "" : "es"} tras el despacho`}
            </p>
          </ReviewCard>

          {/* Facturación (si aplica) */}
          {billing?.wantsInvoice && (
            <ReviewCard
              icon={<Receipt className="h-4 w-4" />}
              title="Facturación"
              href="/checkout/datos"
            >
              <p className="text-brand-purple-dark text-sm">{billing.name}</p>
              <p className="text-brand-purple-dark/70 text-xs">
                {billing.documentType} {billing.documentNumber}
              </p>
              <p className="text-brand-muted mt-1 text-xs">
                Coordinamos tu documento de venta (cuenta de cobro o factura, según corresponda) al
                correo {contact.email}
              </p>
            </ReviewCard>
          )}

          {/* Método de pago */}
          <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-lg font-bold">
              <CreditCard className="h-5 w-5" />
              <CmsText blockKey="checkout.pago.heading" fallback="Método de pago" />
            </h2>

            <PaymentMethodChooser
              backHref="/checkout/envio"
              codEnabled={codEnabled}
              couponInvalidAtRender={Boolean(applied?.error)}
            />
          </section>

          {/* Aviso legal en el punto de venta (Ley 1480 art. 23/47/7-16): antes de pagar el
              consumidor debe conocer el retracto y la garantía. */}
          <section
            aria-label="Retracto y garantía"
            className="border-brand-purple/10 text-brand-purple-dark/80 rounded-2xl border bg-white p-4 text-xs sm:p-5"
          >
            <p>
              <strong className="text-brand-purple-dark">Retracto:</strong> tienes 5 días hábiles
              desde que recibes para retractarte de productos del catálogo estándar; te devolvemos
              el dinero en máximo 15 días calendario. Los productos personalizados en el Estudio
              (con tu foto o tu texto) no tienen retracto por ser hechos a tu medida (Ley 1480, art.
              47).
            </p>
            <p className="mt-2">
              <strong className="text-brand-purple-dark">Garantía:</strong> todos los productos
              tienen garantía legal de 1 año por defectos de fabricación; puedes pedir reparación,
              cambio o devolución del dinero.
            </p>
            <p className="mt-2">
              Más en{" "}
              <Link href="/legal/devoluciones" className="text-brand-purple underline">
                Devoluciones y Retracto
              </Link>{" "}
              y{" "}
              <Link href="/legal/garantias" className="text-brand-purple underline">
                Garantías
              </Link>
              .
            </p>
          </section>
        </div>

        <div className="order-1 space-y-4 lg:order-none lg:col-span-1">
          <div className="border-brand-purple/10 rounded-2xl border bg-white p-4 shadow-sm">
            <CouponField appliedCode={applied?.code} appliedError={applied?.error} />
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
