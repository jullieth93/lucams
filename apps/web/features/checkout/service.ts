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
import { processPaidOrder } from "@/features/orders/saga";
import { priceCouponForCart } from "@/features/coupons/redemption";
import { getPaymentProvider } from "@/features/payments/provider";
import { getShippingProvider } from "@/features/shipping/provider";
import {
  getEffectiveShippingDims,
  MissingShippingDimsError,
  parsePhysicalSpecs,
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
      | "PAYMENT_INIT_FAILED"
      | "STOCK_UNAVAILABLE",
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

  const currentState: CheckoutState = state ?? { step: 1, updatedAt: Date.now() };

  // Si hay user logueado, resolver el Customer (id + datos de contacto).
  let customerId: string | null = cart.customerId ?? null;
  if (user) {
    const customer = await prisma.customer.findFirst({
      where: cart.customerId
        ? { id: cart.customerId, deletedAt: null }
        : { supabaseUserId: user.id, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        documentType: true,
        documentNumber: true,
      },
    });
    if (customer) {
      customerId = customer.id;
      // Pre-llenar el contacto desde el perfil si el checkout aún no lo tiene
      // (un cliente logueado no debería retipear su nombre/correo/teléfono/documento).
      if (!currentState.contact) {
        currentState.contact = {
          fullName: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
          email: customer.email ?? user.email ?? "",
          phone: customer.phone ?? "",
          ...(customer.documentType ? { documentType: customer.documentType } : {}),
          ...(customer.documentNumber ? { documentNumber: customer.documentNumber } : {}),
        };
      }
    }
  }

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
  // El caller (page.tsx del step 2) ya cargó el contexto para redirigir si falta
  // contacto/dirección; se lo pasa para NO re-consultar cart+customer en el hot path
  // justo antes de la llamada lenta a Aveonline (revisión adversarial #7).
  ctx?: Awaited<ReturnType<typeof loadCheckoutContext>>;
}): Promise<ShippingSelectionInput[]> {
  const ctx = input.ctx ?? (await loadCheckoutContext());
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
      // Inspeccionar si el parse del Schema falló — capturamos el motivo real
      // para diagnóstico (ej. weightGrams<min, depthCm undefined, etc.).
      const parsed = parsePhysicalSpecs(v.product.physicalSpecs);
      const missing = new MissingShippingDimsError(v.product.slug, v.id);
      logger.warn({
        event: "checkout.quote_shipping.missing_dims",
        productSlug: v.product.slug,
        variantId: v.id,
        productPhysicalSpecsRaw: v.product.physicalSpecs,
        parseError: parsed.__parseError ?? null,
        variantAttributes: v.attributes,
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
  // getSettingValue solo aplica el fallback si la fila NO existe; si el admin guardó
  // el campo en BLANCO, devuelve "" y mandaríamos origen "()" a Aveonline → TODAS las
  // transportadoras fallan y el cliente ve "no pudo cotizar" sin causa visible. Lo
  // tratamos como misconfiguración dura, igual que createShipment (revisión #9).
  if (!pickupCity?.trim() || !pickupDept?.trim()) {
    logger.error({
      event: "checkout.quote_shipping.pickup_settings_missing",
      pickupCity,
      pickupDept,
    });
    throw new CheckoutError(
      "SHIPPING_QUOTE_FAILED",
      "Falta configurar la ciudad/departamento de recogida (PICKUP_CITY / PICKUP_DEPARTMENT) " +
        "en /admin/contenido/configuracion (categoría 'Negocio').",
    );
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
    // warn (no error): la página /checkout/envio maneja esto con banner
    // amarillo "No pudimos cotizar el envío" — no es crash.
    logger.warn({
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
      couponCode: state.couponCode, // F1 — se re-valida atómicamente en la tx
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

  // 2. Contraentrega (COD): no hay pago online. Confirmamos la orden AHORA reusando el
  //    saga battle-tested (commit stock + guía Aveonline con contraentrega + valor a
  //    recaudar + email). El courier cobra el total en efectivo al entregar y lo remite.
  //    processPaidOrder es idempotente; la orden avanza a FULFILLING. El caso de stock
  //    insuficiente REAL ya se atrapó arriba (createOrderFromCart). Si la guía falla por
  //    una carrera rara, la orden queda visible en reconciliación admin (no bloqueamos
  //    al cliente: su pedido existe). Redirigimos a la vista pública por token (sin IDOR).
  if (state.paymentMethod === "COD") {
    // Guard server-side: si el negocio desactivó COD (setting COD_ENABLED), rechazamos
    // aunque llegue un request forjado que saltó el UI (defensa en profundidad).
    const codEnabled = (await getSettingValue("COD_ENABLED", "true")) === "true";
    if (!codEnabled) {
      throw new CheckoutError(
        "PAYMENT_INIT_FAILED",
        "El pago contra entrega no está disponible en este momento.",
      );
    }
    // [P0 revisión] createOrderFromCart puede REUSAR una orden PENDING_PAYMENT de un
    // intento Wompi abandonado (idempotencia por cartId) con paymentMethod='WOMPI'. Si
    // no la corregimos, processPaidOrder generaría una guía PREPAGADA (contraentrega=false,
    // sin recaudo) y el mensajero entregaría SIN cobrar → pérdida total. Forzamos COD
    // (solo mientras sigue PENDING_PAYMENT: si ya se pagó por Wompi, no la tocamos).
    if (order.paymentMethod !== "COD") {
      await prisma.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT" },
        data: { paymentMethod: "COD" },
      });
    }

    const saga = await processPaidOrder({ orderId: order.id });
    logger.info({
      event: "checkout.finalize.cod_confirmed",
      orderId: order.id,
      orderNumber: order.number,
      sagaStatus: saga.status,
      trackingNumber: saga.trackingNumber ?? null,
    });

    // [P1 revisión] Reaccionar al resultado del saga — NO prometer una entrega que no
    // ocurrió. Si processPaidOrder no confirmó (carrera de stock o guía fallida) NO
    // devolvemos la página de éxito a ciegas.
    if (saga.status !== "ok" && saga.status !== "already_processed") {
      const fresh = await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true, trackingNumber: true },
      });
      if (fresh?.status === "PENDING_PAYMENT") {
        // Carrera de stock: la orden NO se confirmó. Como es COD (sin dinero online), la
        // cancelamos para no dejar basura + destrabar la reserva, y mandamos al carrito.
        await prisma.order.updateMany({
          where: { id: order.id, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED", needsReconciliation: false },
        });
        throw new CheckoutError(
          "STOCK_UNAVAILABLE",
          "Uno de los productos se agotó mientras confirmábamos tu pedido. Revisa tu carrito.",
        );
      }
      // La orden quedó PAID pero SIN guía (Aveonline falló). El pedido existe (stock
      // comprometido); la marcamos para reconciliación admin y suavizamos el mensaje.
      if (fresh && !fresh.trackingNumber) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            needsReconciliation: true,
            reconciliationReason: `COD confirmado sin guía Aveonline: ${saga.reason ?? "createShipment falló"}`,
          },
        });
        logger.warn({
          event: "checkout.finalize.cod_no_shipment",
          orderId: order.id,
          orderNumber: order.number,
          sagaStatus: saga.status,
        });
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.number,
      // Vista pública por token (sin IDOR). Defensivo: si faltara el token (no debería,
      // createOrderFromCart siempre lo genera), mandamos a la cuenta.
      checkoutUrl: order.publicAccessToken
        ? `/pedido/${order.publicAccessToken}?nueva=1`
        : "/mi-cuenta/pedidos",
    };
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

/**
 * F1 — Valida un código contra el carrito actual y, si aplica, lo guarda en el
 * state. El descuento no se persiste (se recalcula al vuelo y se re-valida en la
 * tx al crear la orden), solo el código.
 */
export async function applyCoupon(
  rawCode: string,
): Promise<{ ok: true; code: string; discount: number } | { ok: false; message: string }> {
  const code = rawCode.trim();
  if (!code) return { ok: false, message: "Escribe un código." };
  const ctx = await loadCheckoutContext();
  const shippingCost = ctx.state.shippingSelection?.fleteCop ?? 0;
  const priced = await priceCouponForCart({
    code,
    cartId: ctx.cart.cartId,
    shippingCost,
    customerId: ctx.customerId,
  });
  if (!priced.ok) return { ok: false, message: priced.message };
  await setCheckoutState({ couponCode: priced.code });
  return { ok: true, code: priced.code, discount: priced.discount };
}

/** F1 — Quita el cupón aplicado del state. */
export async function removeCoupon(): Promise<void> {
  await setCheckoutState({ couponCode: undefined });
}

/**
 * F1 — Descuento vigente del cupón guardado en state, para el resumen del pedido.
 * null si no hay cupón; `error` si el guardado dejó de ser válido (ej. el carrito
 * bajó del mínimo) — el resumen lo muestra como aviso y no descuenta.
 */
export async function getAppliedCoupon(): Promise<{
  code: string;
  discount: number;
  error?: string;
} | null> {
  const ctx = await loadCheckoutContext();
  const code = ctx.state.couponCode;
  if (!code) return null;
  const shippingCost = ctx.state.shippingSelection?.fleteCop ?? 0;
  const priced = await priceCouponForCart({
    code,
    cartId: ctx.cart.cartId,
    shippingCost,
    customerId: ctx.customerId,
  });
  if (priced.ok) return { code, discount: priced.discount };
  return { code, discount: 0, error: priced.message };
}

export async function finishCheckoutSession() {
  await clearCheckoutState();
}
