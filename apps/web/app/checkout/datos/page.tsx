import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutStepper } from "../_components/stepper";
import { OrderSummary } from "../_components/order-summary";
import { PriceUpdatedBanner } from "../_components/price-updated-banner";
import { DatosForm } from "./datos-form";
import { TrackBeginCheckout } from "@/components/analytics-trackers";
import { formatPriceChangesNotice } from "@/features/cart/price-changes";
import {
  loadCheckoutContext,
  assertCheckoutAvailability,
  getGuestLoyaltyIncentive,
  CheckoutError,
} from "@/features/checkout/service";
import { getSavedAddressesForCheckout } from "@/features/addresses/service";
import { getCheckoutTexts } from "../checkout-texts.server";

// Mensaje único cuando un item se agotó mientras estaba en el carrito (auditoría 2026-07-16).
const STOCK_GONE_MSG = "Uno de los productos ya no está disponible. Por favor revisa tu carrito.";

export const metadata: Metadata = {
  title: "Datos · Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutDatosPage() {
  let ctx;
  try {
    ctx = await loadCheckoutContext();
    await assertCheckoutAvailability(ctx);
  } catch (err) {
    if (err instanceof CheckoutError && err.code === "CART_EMPTY") redirect("/carrito");
    if (err instanceof CheckoutError && err.code === "CART_NOT_FOUND") redirect("/carrito");
    if (err instanceof CheckoutError && err.code === "STOCK_UNAVAILABLE") {
      // El mensaje es customer-safe y nombra el producto cuando el service lo conoce.
      const msg = err.message && err.message !== err.code ? err.message : STOCK_GONE_MSG;
      redirect(`/carrito?error=${encodeURIComponent(msg)}`);
    }
    throw err;
  }

  const savedAddresses = ctx.customerId ? await getSavedAddressesForCheckout(ctx.customerId) : [];
  const texts = await getCheckoutTexts();
  const guestIncentive = await getGuestLoyaltyIncentive(ctx);
  const priceNotice = formatPriceChangesNotice(ctx.priceChanges);

  return (
    <div className="mx-auto max-w-6xl">
      <CheckoutStepper current={1} />
      {priceNotice && <PriceUpdatedBanner message={priceNotice} />}
      <TrackBeginCheckout
        valueCents={ctx.cart.subtotal}
        items={ctx.cart.items.map((i) => {
          const du = Math.max(1, i.designUnits ?? 1);
          return {
            sku: i.variantSku,
            name: i.productName,
            variantName: i.variantName,
            priceCents: Math.round(i.unitPrice / du),
            quantity: i.qty * du,
          };
        })}
        funnelLines={ctx.cart.items.map((i) => ({
          productSlug: i.productSlug,
          editorKind: i.editorKind,
        }))}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DatosForm
            initial={ctx.state}
            savedAddresses={savedAddresses}
            canSaveAddress={Boolean(ctx.customerId)}
            texts={texts.datos}
          />
        </div>
        <div className="lg:col-span-1">
          <OrderSummary
            cart={ctx.cart}
            guestIncentive={guestIncentive}
            guestTexts={texts.guestLoyalty}
            texts={texts.summary}
          />
        </div>
      </div>
    </div>
  );
}
