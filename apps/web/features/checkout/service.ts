/*
 * Service layer Checkout — orquesta los 3 steps del flow.
 *
 * Responsabilidades:
 *  - loadCheckoutContext(): cart + customer + cotizaciones (cuando aplique)
 *  - quoteShipping(): llama Aveonline con address y items del cart
 *  - finalizeCheckout(): crea Order desde el state acumulado + cart →
 *    devuelve URL de Wompi para redirigir al cliente
 *
 * Cada step de UI carga su context con loadCheckoutContext() para
 * tener datos frescos (precios, qty, totales).
 */

import "server-only";
import { peekCartSession } from "@/lib/cart-session";
import { getCartDetail } from "@/features/cart/service";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getSettingValue } from "@/lib/cms";
import { createOrderFromCart } from "@/features/orders/service";
import { getPaymentProvider } from "@/features/payments/provider";
import { getShippingProvider } from "@/features/shipping/provider";
import {
  getEffectiveShippingDims,
  MissingShippingDimsError,
} from "@/features/products/shipping-schemas";
import {
  getCheckoutState,
  setCheckoutState,
  clearCheckoutState,
  type CheckoutState,
} from "@/lib/checkout-session";
import { composeAddressLine, type ShippingSelectionInput } from "./schemas";

export class CheckoutError extends Error {
  constructor(
    public code:
      | "CART_EMPTY"
      | "CART_NOT_FOUND"
      | "MISSING_CONTACT"
      | "MISSING_ADDRESS"
      | "MISSING_SHIPPING_SELECTION"
      | "MISSING_PAYMENT_METHOD"
      | "SHIPPING_QUOTE_FAILED"
      | "ORDER_CREATE_FAILED"
      | "PAYMENT_INIT_FAILED",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CheckoutError";
  }
}

export type CheckoutContext = {
  cart: NonNullable<Awaited<ReturnType<typeof getCartDetail>>>;
  customerId: string | null;
  state: CheckoutState;
};

/**
 * Carga cart + customer + state actual. Lanza CART_EMPTY si el cart
 * está vacío (caller debe redirigir a /carrito).
 */
export async function loadCheckoutContext(): Promise<CheckoutContext> {
  const [sessionId, user, state] = await Promise.all([
    peekCartSession(),
    getCurrentUser(),
    getCheckoutState(),
  ]);

  if (!sessionId) {
    throw new CheckoutError("CART_NOT_FOUND", "No hay sesión de carrito activa");
  }

  const cart = await getCartDetail(sessionId);
  if (!cart) throw new CheckoutError("CART_NOT_FOUND");
  if (cart.items.length === 0) throw new CheckoutError("CART_EMPTY");

  // Si user logueado, lookup Customer.id
  let customerId: string | null = cart.customerId ?? null;
  if (!customerId && user) {
    const customer = await prisma.customer.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true },
    });
    customerId = customer?.id ?? null;
  }

  const currentState: CheckoutState = state ?? { step: 1, updatedAt: Date.now() };

  return { cart, customerId, state: currentState };
}

/**
 * Cotiza envío llamando Aveonline. Args: dirección de destino + items
 * del cart actual. Devuelve N opciones de transportadora.
 *
 * Peso por item: usamos 500g por unidad como default razonable hasta
 * que cada Product tenga peso configurado. TODO en V2.
 */
export async function quoteShipping(input: {
  destinationCity: string;
  destinationDepartment: string;
  contraentrega?: boolean;
}): Promise<ShippingSelectionInput[]> {
  const ctx = await loadCheckoutContext();
  const provider = await getShippingProvider();

  // PR C — leer peso/dimensiones REALES de cada producto+variant.
  // Sin asumir nada: si falta data → error claro a admin (no cotización fake).
  const variantIds = ctx.cart.items.map((it) => it.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      attributes: true,
      product: { select: { slug: true, physicalSpecs: true } },
    },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const items = ctx.cart.items.map((it) => {
    const v = variantById.get(it.variantId);
    if (!v) {
      throw new CheckoutError(
        "SHIPPING_QUOTE_FAILED",
        `Variant ${it.variantId} no encontrada para ${it.productSlug}`,
      );
    }
    const dims = getEffectiveShippingDims(v.product.physicalSpecs, v.attributes);
    if (!dims) {
      const missing = new MissingShippingDimsError(v.product.slug, v.id);
      logger.warn({
        event: "checkout.quote_shipping.missing_dims",
        productSlug: v.product.slug,
        variantId: v.id,
      });
      throw new CheckoutError("SHIPPING_QUOTE_FAILED", missing.message);
    }
    return {
      productSlug: it.productSlug,
      qty: it.qty,
      weightGrams: dims.weightGrams,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm,
      depthCm: dims.depthCm,
      declaredValueCop: it.unitPrice,
    };
  });

  // Origen del envío = donde Aveonline recoge. Se lee de SiteSettings PICKUP_CITY +
  // PICKUP_DEPARTMENT (Lucy los edita desde /admin/contenido/configuracion BUSINESS).
  // Fallback a Bogotá/Cundinamarca si por algún motivo no están seteados (no rompe la cotización
  // pero loguea warning para que admin lo corrija).
  const [pickupCity, pickupDept] = await Promise.all([
    getSettingValue("PICKUP_CITY", "Bogotá"),
    getSettingValue("PICKUP_DEPARTMENT", "Cundinamarca"),
  ]);
  if (!pickupCity || !pickupDept) {
    logger.warn({
      event: "checkout.quote_shipping.pickup_settings_missing",
      pickupCity,
      pickupDept,
    });
  }

  try {
    const quotes = await provider.quote({
      origin: { city: pickupCity, department: pickupDept },
      destination: { city: input.destinationCity, department: input.destinationDepartment },
      items,
      contraentrega: input.contraentrega ?? false,
    });
    return quotes.map((q) => ({
      carrier: q.carrier,
      carrierName: q.carrierName,
      fleteCop: q.fleteCop,
      deliveryDays: q.deliveryDays,
      contraentrega: q.contraentrega,
      quoteId: q.quoteId,
    }));
  } catch (err) {
    logger.error({
      event: "checkout.quote_shipping.fail",
      err: err instanceof Error ? err.message : String(err),
      destination: `${input.destinationCity}, ${input.destinationDepartment}`,
    });
    throw new CheckoutError(
      "SHIPPING_QUOTE_FAILED",
      err instanceof Error ? err.message : "Falla cotizando envío",
    );
  }
}

/**
 * Totales calculados sobre el cart + shippingSelection actuales.
 * Llamado por step 3 (review) y al crear Order.
 */
export function calculateTotals(input: {
  subtotal: number;
  shippingCost: number;
  discount?: number;
}): { subtotal: number; shipping: number; discount: number; tax: number; total: number } {
  const subtotal = input.subtotal;
  const shipping = input.shippingCost;
  const discount = input.discount ?? 0;
  const tax = 0; // IVA incluido en precios COP
  const total = subtotal + shipping - discount + tax;
  return { subtotal, shipping, discount, tax, total };
}

/**
 * Finaliza el checkout — crea Order en PENDING_PAYMENT desde el state
 * acumulado + devuelve URL del gateway (Wompi) para redirigir.
 *
 * NO se borra la cookie acá — el cliente vuelve a /checkout/gracias
 * tras pagar y leemos el state para mostrar resumen. La cookie se
 * limpia en /checkout/gracias tras confirmar status.
 */
export async function finalizeCheckout(input: {
  redirectUrl: string;
}): Promise<{ orderId: string; orderNumber: string; checkoutUrl: string }> {
  const ctx = await loadCheckoutContext();
  const { state } = ctx;

  if (!state.contact) throw new CheckoutError("MISSING_CONTACT");
  if (!state.address) throw new CheckoutError("MISSING_ADDRESS");
  if (!state.shippingSelection) throw new CheckoutError("MISSING_SHIPPING_SELECTION");
  if (!state.paymentMethod) throw new CheckoutError("MISSING_PAYMENT_METHOD");

  const billing = state.billing ?? { wantsInvoice: false };

  // 1. Crear Order en DB.
  let order;
  // Componer dirección urbana O rural en string para Aveonline + Order.
  // composeAddressLine recibe el discriminated union completo (kind + fields).
  const addressLine1 = composeAddressLine(state.address);

  try {
    order = await createOrderFromCart({
      cartId: ctx.cart.cartId,
      customerId: ctx.customerId,
      shipping: {
        fullName: state.contact.fullName,
        email: state.contact.email,
        phone: state.contact.phone,
        documentType: state.contact.documentType,
        documentNumber: state.contact.documentNumber,
        city: state.address.city,
        department: state.address.department,
        addressLine1,
        zip: state.address.zip,
        notes: state.address.notes,
      },
      shippingSelection: state.shippingSelection,
      billing,
      paymentMethod: state.paymentMethod,
      notes: state.address.notes,
    });
  } catch (err) {
    logger.error({
      event: "checkout.finalize.order_create_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    throw new CheckoutError(
      "ORDER_CREATE_FAILED",
      err instanceof Error ? err.message : "Error creando pedido",
    );
  }

  // 2. Si pago es COD (contraentrega), no llamamos a Wompi —
  //    la Order queda PENDING_PAYMENT (se pagará al recibir).
  //    Por ahora: COD NO soportado en F2.1 (Wompi only).
  if (state.paymentMethod === "COD") {
    throw new CheckoutError("PAYMENT_INIT_FAILED", "Contraentrega aún no implementado (Fase 2.x)");
  }

  // 3. Crear checkout en Wompi → devuelve URL hosted.
  try {
    const provider = getPaymentProvider();
    const result = await provider.createCheckout({
      reference: order.number,
      amountInCents: order.total,
      currency: "COP",
      customerEmail: state.contact.email,
      redirectUrl: input.redirectUrl,
    });
    logger.info({
      event: "checkout.finalize.success",
      orderId: order.id,
      orderNumber: order.number,
      total: order.total,
    });
    return {
      orderId: order.id,
      orderNumber: order.number,
      checkoutUrl: result.checkoutUrl,
    };
  } catch (err) {
    logger.error({
      event: "checkout.finalize.payment_init_fail",
      orderId: order.id,
      err: err instanceof Error ? err.message : String(err),
    });
    throw new CheckoutError(
      "PAYMENT_INIT_FAILED",
      err instanceof Error ? err.message : "Error iniciando pago",
    );
  }
}

/**
 * Helpers para steps individuales — wrappers que setean cookie state.
 */

export async function saveContactStep(contact: NonNullable<CheckoutState["contact"]>) {
  await setCheckoutState({ contact, step: 1 });
}

export async function saveAddressStep(
  address: NonNullable<CheckoutState["address"]>,
  billing?: CheckoutState["billing"],
) {
  await setCheckoutState({ address, billing, step: 2 });
}

export async function saveShippingSelectionStep(selection: ShippingSelectionInput) {
  await setCheckoutState({ shippingSelection: selection, step: 3 });
}

export async function savePaymentMethodStep(method: "WOMPI" | "COD") {
  await setCheckoutState({ paymentMethod: method, step: 3 });
}

export async function finishCheckoutSession() {
  await clearCheckoutState();
}
