/*
 * Helper — conducir el checkout FULL por UI hasta /checkout/pago (suite §7.5):
 * PDP → carrito → datos → envío (cotización Aveonline live) → pago.
 * Todo por la interfaz real; los datos de contacto son sintéticos por RUN.
 */
import type { Page } from "@playwright/test";
import { dismissCookieBanner } from "../fixtures/auth";
import {
  createEphemeralProduct,
  fakeCustomer,
  type EphemeralProduct,
} from "../fixtures/data-factory";
import { PdpPage } from "../pages/pdp";
import { CarritoPage } from "../pages/carrito";
import { CheckoutDatosPage } from "../pages/checkout-datos";
import { CheckoutEnvioPage } from "../pages/checkout-envio";
import { CheckoutPagoPage } from "../pages/checkout-pago";

export type DrivenCheckout = {
  product: EphemeralProduct;
  customer: ReturnType<typeof fakeCustomer>;
  carriers: number;
};

/**
 * Conduce el checkout de un producto YA sembrado hasta dejar /checkout/pago
 * cargada. Devuelve el cliente sintético usado y el nº de transportadoras
 * cotizadas. Separada de driveCheckoutToPago para la matriz oversold (dos
 * clientes compran el MISMO producto con stock 1).
 */
export async function driveToPagoWithProduct(
  page: Page,
  product: EphemeralProduct,
  run: string,
): Promise<{ customer: ReturnType<typeof fakeCustomer>; carriers: number }> {
  const customer = fakeCustomer(run);
  const pdp = new PdpPage(page, product.slug);
  await pdp.goto();
  // El banner de cookies (fixed abajo) tapa CTAs bajo el fold — una sola vez.
  await dismissCookieBanner(page);
  await pdp.addToCart();

  const carrito = new CarritoPage(page);
  await carrito.expectItem(product.name);
  await carrito.checkoutCta().click();

  const datos = new CheckoutDatosPage(page);
  await datos.expectLoaded();
  await datos.fillAndContinue({
    fullName: customer.name,
    email: customer.email,
    phone: customer.whatsapp,
  });

  const envio = new CheckoutEnvioPage(page);
  const carriers = await envio.expectQuotes();
  await envio.selectFirstAndContinue();

  const pago = new CheckoutPagoPage(page);
  await pago.expectLoaded();
  return { customer, carriers };
}

/**
 * Crea el producto efímero (con dims de empaque — sin ellas la cotización
 * Aveonline falla por diseño) y conduce el checkout hasta /checkout/pago.
 * `stock` se expone para la matriz oversold.
 */
export async function driveCheckoutToPago(
  page: Page,
  run: string,
  opts: { stock?: number } = {},
): Promise<DrivenCheckout> {
  const product = await createEphemeralProduct(run, {
    withShippingDims: true,
    stock: opts.stock,
  });
  const { customer, carriers } = await driveToPagoWithProduct(page, product, run);
  return { product, customer, carriers };
}
