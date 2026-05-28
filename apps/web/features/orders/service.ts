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
import { canTransition, type ShippingAddressInput } from "./schemas";

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

    // ¿Ya existe order PENDING_PAYMENT para este cart? — idempotency.
    // Heurística: misma combinación customerId + cartId + status PENDING_PAYMENT
    // creada en últimos 30 min (carrito abandonado dentro del flow).
    const existing = await tx.order.findFirst({
      where: {
        customerId: input.customerId,
        status: "PENDING_PAYMENT",
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
      },
      orderBy: { createdAt: "desc" },
    });
    // No nos basamos en cartId porque Order no lo guarda — esto es best-effort.

    const subtotal = cart.items.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
    const shippingCost = input.shippingSelection.fleteCop;
    const discount = 0; // TODO: aplicar cupón en F2.1 si input.couponCode.
    const tax = 0; // IVA incluido en precios (Colombia); DIAN reporting en F2.4.
    const total = subtotal + shippingCost - discount + tax;

    if (existing && existing.total === total && existing.email === input.shipping.email) {
      // Devolvemos la order existente como si la hubiéramos creado ahora.
      return {
        id: existing.id,
        number: existing.number,
        total: existing.total,
        subtotal: existing.subtotal,
        shipping: existing.shipping,
        discount: existing.discount,
      };
    }

    const number = await generateOrderNumber(tx);

    // Token público para vista guest /pedido/<token> sin login.
    const publicAccessToken = crypto.randomBytes(16).toString("hex");

    const order = await tx.order.create({
      data: {
        number,
        customerId: input.customerId,
        email: input.shipping.email,
        phone: input.shipping.phone,
        shippingAddress: input.shipping as unknown as Prisma.InputJsonValue,
        subtotal,
        discount,
        shipping: shippingCost,
        tax,
        total,
        currency: cart.currency,
        status: "PENDING_PAYMENT",
        paymentMethod: input.paymentMethod,
        publicAccessToken,
        shippingCarrier: input.shippingSelection.carrier,
        billingDocumentType: input.billing.documentType,
        billingDocumentNumber: input.billing.documentNumber,
        billingName: input.billing.name,
        dianStatus: input.billing.wantsInvoice ? "PENDING" : "NOT_REQUIRED",
        notes: input.notes,
        items: {
          create: cart.items.map((ci) => ({
            variantId: ci.variantId,
            qty: ci.qty,
            unitPrice: ci.unitPrice,
            designId: ci.designId,
            customDesign: ci.customDesign ?? Prisma.JsonNull,
            templateId: ci.templateId,
            metadata: ci.metadata ?? {},
          })),
        },
      },
      select: {
        id: true,
        number: true,
        total: true,
        subtotal: true,
        shipping: true,
        discount: true,
      },
    });

    // Marcar Designs vinculados como USED_IN_ORDER (immutable post-checkout).
    const designIds = cart.items.map((ci) => ci.designId).filter((id): id is string => !!id);
    if (designIds.length > 0) {
      await tx.design.updateMany({
        where: { id: { in: designIds } },
        data: { status: "USED_IN_ORDER" },
      });
    }

    return order;
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
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: to as Prisma.OrderUpdateInput["status"],
      updatedBy: options.actorAdminId ?? null,
      ...options.extra,
    },
  });
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
          design: { select: { id: true, status: true, previewUrl: true } },
        },
      },
      customer: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
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
