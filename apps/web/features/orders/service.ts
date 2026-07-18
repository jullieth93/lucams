/*
 * Service layer Orders — transición Cart → Order + máquina de estados.
 *
 * Reglas clave:
 *  - createOrderFromCart es transaccional: Order + OrderItems + decremento
 *    de stock + asociación de Designs (sub-bloque M) → todo o nada.
 *  - El Cart NO se elimina al crear Order. Se vacía solo cuando la Order
 *    transiciona a PAID (webhook Wompi). Si pago falla, el cliente
 *    conserva su cart y puede reintentar.
 *  - transitionOrder valida la transición contra ORDER_TRANSITIONS antes
 *    de aplicar. Rechaza transiciones ilegales con error claro.
 *  - Order.number es human-friendly: "LCM-2026-NNNN" (year + secuencial).
 *
 * NO se hace acá:
 *  - Llamadas a Wompi / Aveonline (lo hace el caller: server action o webhook).
 *  - Envío de emails (lo hace el saga tras transitionOrder a PAID).
 */

import "server-only";
import crypto from "node:crypto";
import { prisma, Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { canTransition, type ShippingAddressInput } from "./schemas";
import { assertStockAvailable, revertStockForOrder } from "./stock";
import { OrderAmountTooLargeError } from "./errors";
import { fitsMoneyInt4 } from "@/lib/money";
import { priceCouponForCart, CouponInvalidatedError } from "@/features/coupons/redemption";
import { sendOrderRefunded } from "./emails";

const ORDER_PAGE_SIZE = 20;

export class OrderTransitionError extends Error {
  constructor(
    public from: string,
    public to: string,
  ) {
    super(`Transición ilegal: ${from} → ${to}`);
  }
}

export class OrderNotFoundError extends Error {
  constructor(idOrNumber: string) {
    super(`Order no encontrada: ${idOrNumber}`);
  }
}

/**
 * Genera Order.number único, formato "LCM-YYYY-NNNN".
 *
 * Usa un counter por año: para el primer order de 2026 → "LCM-2026-0001".
 * Tomamos count de orders existentes del año + 1. Con índice unique en
 * Order.number, en caso de race condition Prisma devuelve P2002 y el
 * caller debe reintentar (raro: las orders en checkout no son concurrentes).
 */
async function generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  // Serializa la numeración concurrente con un advisory lock TRANSACCIONAL (ADR-062):
  // count()+1 no es concurrency-safe — dos transacciones simultáneas ven el mismo count (la
  // orden de la otra aún no commiteó) y generan el MISMO Order.number → P2002. El lock
  // (scope de transacción → se libera solo al commit/rollback) hace que las creaciones de orden
  // concurrentes tomen turnos: la siguiente ya ve la orden ganadora y avanza el número. Elimina
  // el race de raíz; el retry de createOrderFromCart queda como backstop. La creación de orden
  // es de baja frecuencia (nunca en el hot path de render) → serializarla es inocuo.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(918273)`;
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const count = await tx.order.count({
    where: { createdAt: { gte: yearStart, lt: yearEnd } },
  });
  return `LCM-${year}-${String(count + 1).padStart(4, "0")}`;
}

export type CreateOrderFromCartInput = {
  cartId: string;
  customerId: string | null;
  shipping: ShippingAddressInput;
  shippingSelection: {
    carrier: string;
    carrierName: string;
    fleteCop: number;
    deliveryDays: number;
    contraentrega: boolean;
    quoteId: string;
  };
  billing: {
    wantsInvoice: boolean;
    documentType?: "CC" | "CE" | "NIT" | "PP";
    documentNumber?: string;
    name?: string;
  };
  paymentMethod: "WOMPI" | "COD";
  couponCode?: string;
  notes?: string;
};

export type CreateOrderFromCartResult = {
  id: string;
  number: string;
  total: number;
  subtotal: number;
  shipping: number;
  discount: number;
  publicAccessToken: string | null;
  paymentMethod: "WOMPI" | "COD";
};

/**
 * Snapshot atómico Cart → Order. Idempotente bajo Order.number unique:
 * si dos llamadas concurrentes intentan crear desde el mismo cart,
 * la segunda ve la primera ya creada (lookup por cartId existing
 * Order en PENDING_PAYMENT) y retorna esa.
 *
 * IMPORTANTE: si el cart tiene 0 items, lanza error — caller debe
 * validar antes de invocar.
 */
export async function createOrderFromCart(
  input: CreateOrderFromCartInput,
): Promise<CreateOrderFromCartResult> {
  // #15 (post-launch Bloque A) — retry sobre colisión de Order.number.
  // generateOrderNumber usa count()+1: dos checkouts concurrentes de carts
  // DISTINTOS pueden calcular el mismo número → P2002 en Order.number. Antes
  // eso reventaba con error genérico (venta perdida). Reintentamos hasta 10×;
  // el count() siguiente ya ve la orden ganadora y avanza el número. 10 cubre
  // hasta 10 checkouts simultáneos en el mismo boundary (holgado para Instagram).
  const MAX_NUMBER_RETRIES = 10;
  for (let attempt = 1; attempt <= MAX_NUMBER_RETRIES; attempt++) {
    try {
      return await createOrderFromCartTx(input);
    } catch (err) {
      // #12 — Carrera del MISMO cart: el unique parcial Order(cartId) dejó crear
      // solo una. Devolvemos la ganadora (1 orden, 1 cobro).
      if (isCartPendingUniqueViolation(err)) {
        const winner = await prisma.order.findFirst({
          where: { cartId: input.cartId, status: "PENDING_PAYMENT", deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            number: true,
            total: true,
            subtotal: true,
            shipping: true,
            discount: true,
            publicAccessToken: true,
            paymentMethod: true,
          },
        });
        if (winner) {
          logger.info({
            event: "order.create.concurrent_idempotent",
            cartId: input.cartId,
            orderId: winner.id,
            orderNumber: winner.number,
          });
          return winner;
        }
        throw err;
      }
      // #15 — Colisión de número (carts distintos): reintentar con número fresco.
      if (isOrderNumberCollision(err) && attempt < MAX_NUMBER_RETRIES) {
        logger.warn({
          event: "order.create.number_collision_retry",
          cartId: input.cartId,
          attempt,
        });
        continue;
      }
      throw err;
    }
  }
  // Inalcanzable salvo 10 colisiones seguidas (improbabilísimo); fail explícito.
  throw new Error("No se pudo generar un número de orden único tras varios intentos");
}

/** Detecta P2002 del índice parcial unique de Order.cartId (carrera de checkout). */
function isCartPendingUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta ?? {}).includes("cartId")
  );
}

/** Detecta P2002 del unique de Order.number (colisión de numeración concurrente). */
function isOrderNumberCollision(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta ?? {}).includes("number")
  );
}

async function createOrderFromCartTx(
  input: CreateOrderFromCartInput,
): Promise<CreateOrderFromCartResult> {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, deletedAt: null },
      include: {
        items: {
          include: {
            variant: {
              select: { id: true, productId: true, price: true, sku: true },
            },
          },
        },
      },
    });
    if (!cart) throw new Error(`Cart no encontrado: ${input.cartId}`);
    if (cart.items.length === 0) {
      throw new Error("Cart vacío — no se puede crear order");
    }

    // P0-020 (Lucy 2026-06-26) — Idempotency real por cartId.
    // Si este Cart ya tiene una Order PENDING_PAYMENT activa, NO creamos otra (el unique parcial lo
    // impide igual). Antes la devolvíamos TAL CUAL: si el cliente cambiaba algo entre "ir a pagar" y
    // "pagar" (items, cupón, envío, o el MÉTODO tras un COD bloqueado → Wompi) se cobraba lo viejo
    // (auditoría v3 · B1/H1/H3). Ahora: si nada cambió, refresh idempotente; si cambió, la
    // reconciliamos en el sitio con los datos frescos (mismo id/token/número).
    const existing = await tx.order.findFirst({
      where: {
        cartId: input.cartId,
        status: "PENDING_PAYMENT",
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        total: true,
        publicAccessToken: true,
        paymentMethod: true,
        email: true,
        shippingCarrier: true,
        couponId: true,
        items: { select: { variantId: true, qty: true, designId: true, unitPrice: true } },
      },
    });

    const subtotal = cart.items.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
    const shippingCost = input.shippingSelection.fleteCop;
    // F1 — aplicar cupón con re-validación atómica DENTRO de la tx: si el código
    // dejó de ser válido (venció, se agotó, tope por cliente) entre que el cliente
    // lo aplicó y pagó, se ignora en silencio (orden sin descuento) en vez de
    // reventar el checkout. Sin couponId → la saga PAID no crea CouponUsage.
    let discount = 0;
    let couponId: string | null = null;
    if (input.couponCode) {
      const priced = await priceCouponForCart(
        {
          code: input.couponCode,
          cartId: input.cartId,
          shippingCost,
          customerId: input.customerId,
          // #4 — mismo email del pedido que la saga guardará en CouponUsage: la re-validación atómica
          // aplica el tope por-cliente por identidad (customerId O email) también para invitados.
          email: input.shipping.email,
          now: new Date(),
        },
        tx,
      );
      if (priced.ok) {
        discount = priced.discount;
        couponId = priced.couponId;
      } else {
        // El cupón que el cliente aplicó dejó de ser válido entre el carrito y este punto (se
        // agotó, venció, dejó de alcanzar el mínimo, alguien más lo usó…). NO creamos la orden a
        // precio lleno en silencio: abortamos la tx. El checkout captura esto, limpia el cupón del
        // estado y deja que el cliente re-confirme viendo el total real (auditoría v3 · #8).
        throw new CouponInvalidatedError(priced.message, priced.reason);
      }
    }
    const tax = 0; // IVA incluido en precios (Colombia); DIAN reporting en F2.4.
    const total = subtotal + shippingCost - discount + tax;

    // Guard de overflow INT4: las columnas de dinero (subtotal/total/…) son Int (máx
    // MAX_MONEY_CENTS). Un pedido caro × cantidad alta puede superarlo y reventar el INSERT con un
    // "integer out of range" crudo. Lo atajamos ANTES con un mensaje claro (el checkout lo mapea a
    // UX; la máquina de estados sigue montos válidos). Basta validar subtotal y total (los mayores).
    if (!fitsMoneyInt4(subtotal) || !fitsMoneyInt4(total)) {
      throw new OrderAmountTooLargeError(Math.max(subtotal, total));
    }

    // Firma de items (independiente del orden) para detectar si el carrito cambió respecto a la
    // orden PENDING existente. Incluye designId + unitPrice para captar re-personalizaciones.
    const itemSignature = (
      list: ReadonlyArray<{
        variantId: string;
        qty: number;
        designId: string | null;
        unitPrice: number;
      }>,
    ) =>
      list
        .map((it) => `${it.variantId}:${it.qty}:${it.designId ?? ""}:${it.unitPrice}`)
        .sort()
        .join("|");
    const cartSig = itemSignature(cart.items);

    // Data de items para crear/recrear los OrderItem (snapshot inmutable del cart).
    const orderItemsCreate = cart.items.map((ci) => ({
      variantId: ci.variantId,
      qty: ci.qty,
      unitPrice: ci.unitPrice,
      designId: ci.designId,
      customDesign: ci.customDesign ?? Prisma.JsonNull,
      templateId: ci.templateId,
      metadata: ci.metadata ?? {},
    }));

    // Campos escalares comunes a crear y reconciliar (dependen del cart/checkout). `dianStatus` va en
    // un const aparte para que TS conserve el tipo literal del enum (no lo ensanche a string).
    const dianStatus = input.billing.wantsInvoice
      ? ("PENDING" as const)
      : ("NOT_REQUIRED" as const);
    const orderScalars = {
      couponId, // F1 — null si no hubo cupón válido
      // Consentimiento de derechos de imagen (ADR-062 P0-2, Ley 1581): confirmar el pedido implica
      // aceptar las condiciones (titularidad/uso de las imágenes + autorización de impresión).
      contentRightsAcceptedAt: new Date(),
      email: input.shipping.email,
      phone: input.shipping.phone,
      shippingAddress: input.shipping as unknown as Prisma.InputJsonValue,
      subtotal,
      discount,
      shipping: shippingCost,
      tax,
      total,
      paymentMethod: input.paymentMethod,
      shippingCarrier: input.shippingSelection.carrier,
      billingDocumentType: input.billing.documentType,
      billingDocumentNumber: input.billing.documentNumber,
      billingName: input.billing.name,
      dianStatus,
      notes: input.notes,
    };

    const returnSelect = {
      id: true,
      number: true,
      total: true,
      subtotal: true,
      shipping: true,
      discount: true,
      publicAccessToken: true,
      paymentMethod: true,
    } as const;

    // Marcar Designs vinculados como USED_IN_ORDER (immutable post-checkout).
    const designIds = cart.items.map((ci) => ci.designId).filter((id): id is string => !!id);
    const markDesignsUsed = async () => {
      if (designIds.length > 0) {
        await tx.design.updateMany({
          where: { id: { in: designIds } },
          data: { status: "USED_IN_ORDER" },
        });
      }
    };

    // P0-002 — Validar stock disponible antes de crear/reconciliar (lectura; el decremento real
    // ocurre en la saga POST-PAID). La defensa real contra concurrencia es el UPDATE atómico de
    // decrementStockForOrder; esto filtra el caso obvio "ya no hay".
    await assertStockAvailable(
      tx,
      cart.items.map((it) => ({ variantId: it.variantId, qty: it.qty })),
    );

    if (existing) {
      const identical =
        existing.total === total &&
        existing.email === input.shipping.email &&
        existing.paymentMethod === input.paymentMethod &&
        existing.shippingCarrier === input.shippingSelection.carrier &&
        (existing.couponId ?? null) === (couponId ?? null) &&
        itemSignature(existing.items) === cartSig;
      if (identical) {
        // Refresh idempotente (reload de /checkout/pago sin cambios) → misma orden.
        return {
          id: existing.id,
          number: existing.number,
          total,
          subtotal,
          shipping: shippingCost,
          discount,
          publicAccessToken: existing.publicAccessToken,
          paymentMethod: existing.paymentMethod,
        };
      }
      // RECONCILIAR (auditoría v3 · B1/H1/H3): el cliente cambió items/cupón/envío/método entre "ir a
      // pagar" y "pagar". Actualizamos la MISMA orden (mismo id/token/número) con datos frescos, en
      // vez de devolver la vieja — que cobraría el total, los items o el MÉTODO obsoletos.
      await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
      const reconciled = await tx.order.update({
        where: { id: existing.id },
        data: { ...orderScalars, items: { create: orderItemsCreate } },
        select: returnSelect,
      });
      await markDesignsUsed();
      logger.info({
        event: "order.create.reconciled_pending",
        cartId: input.cartId,
        orderId: existing.id,
        orderNumber: existing.number,
      });
      return reconciled;
    }

    // No hay orden PENDING para este cart → crear una nueva.
    const number = await generateOrderNumber(tx);
    // Token público para vista guest /pedido/<token> sin login.
    const publicAccessToken = crypto.randomBytes(16).toString("hex");
    const order = await tx.order.create({
      data: {
        number,
        customerId: input.customerId,
        cartId: input.cartId, // P0-020 idempotency
        ...orderScalars,
        currency: cart.currency,
        status: "PENDING_PAYMENT",
        publicAccessToken,
        items: { create: orderItemsCreate },
      },
      select: returnSelect,
    });
    await markDesignsUsed();
    return order;
  });
}

/**
 * P0-001 (Lucy 2026-06-26) — Vacía el Cart de origen tras Order PAID exitosa.
 *
 * Soft-delete del Cart (deletedAt + deletedBy="saga:order-paid"). El próximo
 * lookup por sessionId/customerId en features/cart/service.ts filtra
 * `deletedAt: null`, así que el cliente recibe un cart vacío nuevo en la
 * próxima request sin romper la sesión activa.
 *
 * NO eliminamos CartItem físicamente: queda como audit history para reportes.
 * El snapshot de items para producción ya vive en OrderItem (immutable).
 *
 * Idempotente: si el cart ya fue soft-deleted, no-op silencioso.
 *
 * #9/#16 (post-launch Bloque A) — acepta un TransactionClient opcional para
 * correr DENTRO de la $transaction de PAID (atómico con el cambio de estado).
 * Antes corría afuera con `prisma` desnudo: si fallaba abortaba la creación de
 * guía, y si el cart no se vaciaba quedaba ventana de doble-checkout/doble-cobro.
 */
export async function clearCartAfterPaid(
  cartId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await client.cart.updateMany({
    where: { id: cartId, deletedAt: null },
    data: {
      deletedAt: new Date(),
      deletedBy: "saga:order-paid",
    },
  });
}

/**
 * Aplica una transición de estado validada. Lanza OrderTransitionError
 * si la transición no es legal (definida en ORDER_TRANSITIONS).
 *
 * Puede agregar campos auxiliares con la transición (ej. trackingNumber
 * al pasar a FULFILLING). El caller los pasa en `extra`.
 */
export async function transitionOrder(
  orderId: string,
  to: string,
  options: {
    actorAdminId?: string;
    extra?: Prisma.OrderUpdateInput;
  } = {},
) {
  const current = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, status: true, number: true },
  });
  if (!current) throw new OrderNotFoundError(orderId);
  if (current.status === to) return current; // idempotent
  if (!canTransition(current.status, to)) {
    throw new OrderTransitionError(current.status, to);
  }

  // P0-002 (Lucy 2026-06-26) — Si la transición es a CANCELLED/REFUNDED,
  // revertir stock dentro de la misma transacción. revertStockForOrder es
  // idempotente y no-op si NO hubo decremento previo (caso PENDING_PAYMENT →
  // CANCELLED por DECLINED). El UPDATE de Order y el revert son atómicos.
  const needsRevert = to === "CANCELLED" || to === "REFUNDED";
  // F3 — al entregar, sellar deliveredAt (ancla la ventana de retracto). El caller
  // puede sobreescribirlo vía extra si necesita una fecha específica.
  const autoStamp: Prisma.OrderUpdateInput = to === "DELIVERED" ? { deliveredAt: new Date() } : {};

  if (needsRevert) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: to as Prisma.OrderUpdateInput["status"],
          updatedBy: options.actorAdminId ?? null,
          ...autoStamp,
          ...options.extra,
        },
      });
      const orderWithItems = await tx.order.findFirst({
        where: { id: orderId },
        select: {
          id: true,
          number: true,
          items: { select: { variantId: true, qty: true } },
        },
      });
      if (orderWithItems) {
        const revertReason = to === "REFUNDED" ? "ORDER_REFUNDED" : "ORDER_CANCELLED";
        await revertStockForOrder(tx, orderWithItems, revertReason);
      }

      // F2 — al CANCELAR/REEMBOLSAR, liberar el cupón consumido: borrar el CouponUsage y decrementar
      // el usedCount denormalizado, SIMÉTRICO a la saga PAID (saga.ts). Sin esto, un cupón de un solo
      // uso queda "quemado" por una orden reembolsada → el cliente no puede reusarlo y el cupo global
      // se pierde. La EXISTENCIA del CouponUsage (orderId @unique) es la verdad: la saga solo lo crea
      // si ganó el cupo e incrementó (no en el caso "agotado al pagar"), así el revert nunca
      // decrementa de más. Idempotente (transitionOrder ya es no-op si el estado no cambia) y el
      // guard atómico usedCount>0 evita bajar de cero.
      const usage = await tx.couponUsage.findUnique({
        where: { orderId },
        select: { couponId: true },
      });
      if (usage) {
        await tx.couponUsage.delete({ where: { orderId } });
        await tx.coupon.updateMany({
          where: { id: usage.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }
      return updated;
    });
  }

  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: to as Prisma.OrderUpdateInput["status"],
      updatedBy: options.actorAdminId ?? null,
      ...autoStamp,
      ...options.extra,
    },
  });
}

/**
 * F2 — Reembolso desde admin. Valida que la orden sea reembolsable (PAID o
 * DELIVERED → REFUNDED según la máquina de estados), transiciona a REFUNDED
 * (revierte stock atómicamente vía transitionOrder), registra la auditoría
 * (quién/cuándo/motivo/monto = total) y envía el email de confirmación. El
 * movimiento de dinero en Wompi es MANUAL (contraentrega + operación manual de
 * la pasarela). Idempotente: si ya está REFUNDED, no-op.
 */
export async function refundOrder(
  orderId: string,
  opts: { adminId: string; reason?: string },
): Promise<{ status: "refunded" | "already_refunded"; orderNumber: string; amount: number }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, number: true, status: true, total: true },
  });
  if (!order) throw new OrderNotFoundError(orderId);
  if (order.status === "REFUNDED") {
    return { status: "already_refunded", orderNumber: order.number, amount: order.total };
  }
  if (!canTransition(order.status, "REFUNDED")) {
    throw new OrderTransitionError(order.status, "REFUNDED");
  }

  await transitionOrder(orderId, "REFUNDED", {
    actorAdminId: opts.adminId,
    extra: {
      refundedAt: new Date(),
      refundedBy: opts.adminId,
      refundReason: opts.reason?.trim() || null,
      refundAmount: order.total,
    },
  });

  // Email best-effort (sendOrderRefunded ya captura sus errores internamente).
  await sendOrderRefunded(orderId);

  logger.info({
    event: "order.refund.done",
    orderId,
    orderNumber: order.number,
    amount: order.total,
    adminId: opts.adminId,
  });
  return { status: "refunded", orderNumber: order.number, amount: order.total };
}

/** Lookup por id o number (admin UI puede usar cualquiera). */
export async function getOrder(idOrNumber: string) {
  return prisma.order.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id: idOrNumber }, { number: idOrNumber }],
    },
    include: {
      items: {
        include: {
          variant: { select: { id: true, sku: true, productId: true, price: true } },
          // productionUrls: paths de los PNGs 300 DPI para imprenta (ADR-063 T1). El admin los
          // descarga desde el detalle del pedido vía signed URLs. moderationStatus: para no
          // producir diseños sin aprobar (ADR-062 P0-2).
          design: {
            select: {
              id: true,
              status: true,
              previewUrl: true,
              productionUrls: true,
              moderationStatus: true,
            },
          },
        },
      },
      customer: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
}

/**
 * ADR-063 T7 — datos ricos para el ZIP de impresión: nombre/kind del producto + año del calendario
 * (design.metadata) para nombrar cada pieza (meses del calendario, o "pieza-NN"). Solo items con
 * diseño finalizado (productionUrls no vacío). Server-only (rol privilegiado).
 */
export async function getOrderProductionBundle(idOrNumber: string) {
  const order = await prisma.order.findFirst({
    where: { deletedAt: null, OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    select: {
      id: true,
      number: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          variant: { select: { sku: true } },
          design: {
            select: {
              productionUrls: true,
              moderationStatus: true,
              metadata: true,
              product: {
                select: { name: true, personalizationKind: true, personalizationSchema: true },
              },
            },
          },
        },
      },
    },
  });
  if (!order) return null;
  const items = order.items
    .filter((it) => (it.design?.productionUrls?.length ?? 0) > 0)
    .map((it) => {
      const d = it.design!;
      const schema = (d.product?.personalizationSchema as { startMonth?: number } | null) ?? null;
      const meta = (d.metadata as { calendarYear?: number } | null) ?? null;
      return {
        sku: it.variant.sku,
        productName: d.product?.name ?? it.variant.sku,
        personalizationKind: d.product?.personalizationKind ?? "NONE",
        startMonth: typeof schema?.startMonth === "number" ? schema.startMonth : 0,
        calendarYear: typeof meta?.calendarYear === "number" ? meta.calendarYear : undefined,
        productionUrls: d.productionUrls,
        moderationStatus: d.moderationStatus,
      };
    });
  return { id: order.id, number: order.number, createdAt: order.createdAt, items };
}

export type OrderListOpts = {
  q?: string;
  status?:
    | "all"
    | "PENDING_PAYMENT"
    | "PAID"
    | "FULFILLING"
    | "SHIPPED"
    | "DELIVERED"
    | "CANCELLED"
    | "REFUNDED";
  /** #6 — filtro especial: solo órdenes que necesitan reconciliación admin. */
  needsReconciliation?: boolean;
  sort?: "recent" | "oldest" | "total-desc";
  page?: number;
  pageSize?: number;
};

export async function listOrders(opts: OrderListOpts = {}) {
  const q = opts.q?.trim();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? ORDER_PAGE_SIZE;

  const orderBy: Prisma.OrderOrderByWithRelationInput[] = (() => {
    switch (opts.sort) {
      case "oldest":
        return [{ createdAt: "asc" }];
      case "total-desc":
        return [{ total: "desc" }, { createdAt: "desc" }];
      case "recent":
      default:
        return [{ createdAt: "desc" }];
    }
  })();

  const where: Prisma.OrderWhereInput = {
    deletedAt: null,
    ...(opts.status && opts.status !== "all" ? { status: opts.status } : {}),
    ...(opts.needsReconciliation ? { needsReconciliation: true } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { customer: { firstName: { contains: q, mode: "insensitive" } } },
            { customer: { lastName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * #6 — Cuántas órdenes necesitan reconciliación admin (Wompi cobró pero stock
 * se agotó). Para el banner de alerta en /admin/pedidos y futuras métricas.
 */
export async function countOrdersNeedingReconciliation(): Promise<number> {
  return prisma.order.count({
    where: { needsReconciliation: true, deletedAt: null },
  });
}
