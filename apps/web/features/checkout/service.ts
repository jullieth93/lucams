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
import { assertStockAvailable } from "@/features/orders/stock";
import { InsufficientStockError, OrderAmountTooLargeError } from "@/features/orders/errors";
import { priceCouponForCart, CouponInvalidatedError } from "@/features/coupons/redemption";
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
  sealShippingOffersPayload,
  openShippingOffersPayload,
  type CheckoutState,
} from "@/lib/checkout-session";
import { composeAddressLine, type ShippingSelectionInput } from "./schemas";
import { assessCodRisk } from "./cod-risk";
import { assertTransactionalAllowed } from "@/lib/stage-guard";

export class CheckoutError extends Error {
  constructor(
    public code:
      | "CART_EMPTY"
      | "CART_NOT_FOUND"
      | "MISSING_CONTACT"
      | "MISSING_ADDRESS"
      | "MISSING_SHIPPING_SELECTION"
      | "SHIPPING_SELECTION_INVALID"
      | "MISSING_PAYMENT_METHOD"
      | "SHIPPING_QUOTE_FAILED"
      | "ORDER_CREATE_FAILED"
      | "ORDER_AMOUNT_TOO_LARGE"
      | "PAYMENT_INIT_FAILED"
      | "STOCK_UNAVAILABLE"
      | "COUPON_INVALIDATED"
      | "COD_NOT_ALLOWED",
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
 * Valida disponibilidad de stock al ENTRAR a un paso del checkout (auditoría 2026-07-16).
 * Antes la disponibilidad solo se validaba al pagar (createOrderFromCart), así que el cliente
 * podía llenar contacto + envío para toparse con "agotado" recién al pagar. Esto lo filtra al
 * entrar a cada paso. Lectura pura; la defensa real contra concurrencia sigue siendo el UPDATE
 * atómico en decrementStockForOrder. Traduce InsufficientStockError → STOCK_UNAVAILABLE para que
 * la página redirija a /carrito con un mensaje claro.
 */
export async function assertCheckoutAvailability(ctx: CheckoutContext): Promise<void> {
  try {
    await assertStockAvailable(
      prisma,
      ctx.cart.items.map((it) => ({ variantId: it.variantId, qty: it.qty })),
    );
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new CheckoutError("STOCK_UNAVAILABLE", err.message);
    }
    throw err;
  }
}

/**
 * Huella estable del carrito, para atar una cotización de envío al carrito que
 * la originó (anti-manipulación de flete — certificación 2026-07-29). Incluye
 * unitPrice porque el valor declarado asegurado mueve el precio del flete.
 */
export function fingerprintCartItems(
  items: ReadonlyArray<{ variantId: string; qty: number; unitPrice: number }>,
): string {
  return items
    .map((it) => `${it.variantId}x${it.qty}@${it.unitPrice}`)
    .sort()
    .join("|");
}

/** Llave de destino de una dirección de checkout (depto + ciudad DANE). */
export function destinationKeyOf(address: NonNullable<CheckoutState["address"]>): string {
  return `${address.deptCode}:${address.cityCode}`;
}

/** Match EXACTO de una selección contra las cotizaciones que el servidor ofreció. */
function matchShippingOffer(
  offers: ReadonlyArray<ShippingSelectionInput>,
  selection: ShippingSelectionInput,
): ShippingSelectionInput | null {
  return (
    offers.find(
      (o) =>
        o.quoteId === selection.quoteId &&
        o.carrier === selection.carrier &&
        o.fleteCop === selection.fleteCop &&
        o.deliveryDays === selection.deliveryDays &&
        o.contraentrega === selection.contraentrega,
    ) ?? null
  );
}

/**
 * Sella el set de cotizaciones ofrecidas para que viaje por el form del step 2
 * (hidden input `offersToken` firmado HMAC — la página RSC no puede escribir
 * cookies; ver checkout-session.ts). `ctx` opcional: la página ya lo cargó.
 */
export async function sealShippingOffers(input: {
  offers: ShippingSelectionInput[];
  ctx?: CheckoutContext;
}): Promise<string> {
  const ctx = input.ctx ?? (await loadCheckoutContext());
  if (!ctx.state.address) throw new CheckoutError("MISSING_ADDRESS");
  return sealShippingOffersPayload({
    offers: input.offers,
    cartHash: fingerprintCartItems(ctx.cart.items),
    destKey: destinationKeyOf(ctx.state.address),
    quotedAt: Date.now(),
  });
}

/**
 * Cotiza envío llamando Aveonline. Args: dirección de destino + items
 * del cart actual. Devuelve N opciones de transportadora.
 *
 * Peso/dimensiones por item: se leen los valores REALES de cada producto
 * (physicalSpecs + attributes de la variante). Si falta la data → error claro
 * a admin (no se cotiza con defaults inventados).
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
  // PICKUP_DEPARTMENT (Lucy los edita desde /admin/contenido/paginas/global, sección Negocio).
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
        "en /admin/contenido/paginas/global (sección 'Negocio').",
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
  // Backstop de etapa: aunque una Server Action nueva olvide su guard, aquí no se crea una
  // orden real mientras la tienda esté en modo catálogo (auditoría 2026-07-21, hallazgo A3).
  assertTransactionalAllowed("finalizeCheckout");

  const ctx = await loadCheckoutContext();
  const { state } = ctx;

  if (!state.contact) throw new CheckoutError("MISSING_CONTACT");
  if (!state.address) throw new CheckoutError("MISSING_ADDRESS");
  if (!state.shippingSelection) throw new CheckoutError("MISSING_SHIPPING_SELECTION");
  if (!state.paymentMethod) throw new CheckoutError("MISSING_PAYMENT_METHOD");

  // Defensa en profundidad anti-manipulación de flete (certificación 2026-07-29):
  // la selección debe seguir siendo una de las cotizaciones selladas por el servidor
  // para ESTE carrito y ESTE destino. El check del step 2 (saveShippingSelectionStep)
  // no puede ver lo que pasa DESPUÉS de seleccionar: items agregados en otra pestaña,
  // o volver al step 1, cambiar la dirección y saltar directo a /checkout/pago por URL.
  // Sin esto, la Order se crea con un flete obsoleto (casi siempre más barato) y
  // Aveonline nos cobra el flete real de la dirección/peso nuevo.
  const sealedOffers = state.shippingOffers;
  if (
    !sealedOffers ||
    !matchShippingOffer(sealedOffers.offers, state.shippingSelection) ||
    sealedOffers.cartHash !== fingerprintCartItems(ctx.cart.items) ||
    sealedOffers.destKey !== destinationKeyOf(state.address)
  ) {
    logger.warn({
      event: "checkout.finalize.shipping_selection_stale",
      hasOffers: Boolean(sealedOffers),
    });
    throw new CheckoutError("SHIPPING_SELECTION_INVALID", SHIPPING_SELECTION_INVALID_MSG);
  }

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
    // #8 — El cupón aplicado dejó de ser válido durante la creación de la orden. Limpiamos el cupón
    // del estado de checkout (para que la vista de pago re-renderice el total REAL, sin descuento) y
    // devolvemos un código propio: el cliente re-confirma en vez de pagar en silencio un total que
    // no vio. No lo tratamos como ORDER_CREATE_FAILED genérico.
    if (err instanceof CouponInvalidatedError) {
      await setCheckoutState({ couponCode: undefined });
      logger.warn({ event: "checkout.finalize.coupon_invalidated", reason: err.reason });
      throw new CheckoutError(
        "COUPON_INVALIDATED",
        `${err.message} Actualizamos el total de tu pedido; revísalo y confirma de nuevo.`,
      );
    }
    // #9 — el pedido supera el máximo representable (guard INT4). El copy de OrderAmountTooLargeError
    // es customer-safe (tuteo, "escríbenos y te lo cotizamos") → código propio para que llegue al
    // cliente, no como ORDER_CREATE_FAILED genérico (que se muestra como error interno).
    if (err instanceof OrderAmountTooLargeError) {
      logger.warn({ event: "checkout.finalize.amount_too_large" });
      throw new CheckoutError("ORDER_AMOUNT_TOO_LARGE", err.message);
    }
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

    // Anti-abuso COD (ADR-065): evalúa el riesgo por IDENTIDAD (teléfono/email) antes de generar la
    // guía real. Si dispara, se bloquea el COD; la orden queda PENDING_PAYMENT para que el cliente
    // la complete pagando EN LÍNEA (no la cancelamos → reusable por Wompi vía idempotencia de cartId).
    const codRisk = await assessCodRisk(order.id);
    if (!codRisk.allowed) {
      throw new CheckoutError("COD_NOT_ALLOWED", codRisk.message);
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
  // Espejo del guard COD (auditoría v3 · B1): createOrderFromCart pudo reusar/reconciliar una orden
  // que venía marcada COD (ej. COD bloqueado por anti-abuso → el cliente reintenta por Wompi). La
  // reconciliación ya normaliza el método, pero forzamos WOMPI acá también (solo mientras siga
  // PENDING_PAYMENT) para que la saga jamás genere una guía contraentrega sobre un pago en línea.
  if (order.paymentMethod !== "WOMPI") {
    await prisma.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { paymentMethod: "WOMPI" },
    });
  }
  try {
    const provider = getPaymentProvider();
    const result = await provider.createCheckout({
      reference: order.number,
      amountInCents: order.total,
      currency: "COP",
      customerEmail: state.contact.email,
      redirectUrl: input.redirectUrl,
      // Prefill en el checkout hospedado (doc Wompi customer-data): el cliente
      // no redigita nombre/teléfono/documento dentro de Wompi.
      customer: {
        fullName: state.contact.fullName,
        phone: state.contact.phone,
        legalIdType: state.contact.documentType,
        legalId: state.contact.documentNumber,
      },
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

/**
 * Copy customer-safe (es-CO, tuteo) para SHIPPING_SELECTION_INVALID — llega al
 * cliente vía redirect ?error= en /checkout/envio.
 */
const SHIPPING_SELECTION_INVALID_MSG =
  "La cotización de envío cambió. Elige de nuevo tu transportadora.";

/**
 * Guarda la selección de envío del step 2. Anti-manipulación de flete
 * (certificación 2026-07-29, hallazgo ShadowAgent): antes la selección llegaba
 * del FormData del cliente validada solo por ESTRUCTURA (Zod) → un POST forjado
 * con fleteCop=0 creaba la Order sin flete mientras Aveonline nos cobra el flete
 * real. Ahora la selección debe ser una de las cotizaciones EXACTAS que el
 * servidor selló en `offersToken` (HMAC — ver checkout-session.ts) y para el
 * MISMO destino guardado en la cookie. Se persiste la copia del SERVIDOR (la del
 * token), no los campos del cliente.
 */
export async function saveShippingSelectionStep(
  selection: ShippingSelectionInput,
  offersToken: string,
) {
  const sealed = openShippingOffersPayload(offersToken);
  const state = await getCheckoutState();
  const offer = sealed ? matchShippingOffer(sealed.offers, selection) : null;
  if (!sealed || !offer || !state?.address || sealed.destKey !== destinationKeyOf(state.address)) {
    logger.warn({
      event: "checkout.shipping_selection.rejected",
      reason: !sealed ? "token_invalid" : !offer ? "no_offer_match" : "destination_changed",
      quoteId: selection.quoteId,
    });
    throw new CheckoutError("SHIPPING_SELECTION_INVALID", SHIPPING_SELECTION_INVALID_MSG);
  }
  // Dejamos el set sellado en la cookie: finalizeCheckout lo re-valida contra el
  // carrito/destino FRESCOS en la frontera del dinero (defensa en profundidad).
  await setCheckoutState({ shippingSelection: offer, shippingOffers: sealed, step: 3 });
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
    email: ctx.state.contact?.email ?? null,
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
    email: ctx.state.contact?.email ?? null,
  });
  if (priced.ok) return { code, discount: priced.discount };
  return { code, discount: 0, error: priced.message };
}

export async function finishCheckoutSession() {
  await clearCheckoutState();
}
