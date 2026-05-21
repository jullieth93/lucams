/*
 * Step 1 — Datos del cliente: contacto + dirección de envío + facturación opcional.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutStepper } from "../_components/stepper";
import { OrderSummary } from "../_components/order-summary";
import { DatosForm } from "./datos-form";
import { loadCheckoutContext, CheckoutError } from "@/features/checkout/service";

export const metadata: Metadata = {
  title: "Datos · Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutDatosPage() {
  let ctx;
  try {
    ctx = await loadCheckoutContext();
  } catch (err) {
    if (err instanceof CheckoutError && err.code === "CART_EMPTY") redirect("/carrito");
    if (err instanceof CheckoutError && err.code === "CART_NOT_FOUND") redirect("/carrito");
    throw err;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <CheckoutStepper current={1} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DatosForm initial={ctx.state} />
        </div>
        <div className="lg:col-span-1">
          <OrderSummary cart={ctx.cart} />
        </div>
      </div>
    </div>
  );
}
