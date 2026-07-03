/*
 * Redención de cupones en checkout (Bloque F1, 2026-07-03).
 *
 * La infraestructura de cupones (modelo Coupon/CouponUsage, admin CRUD, service)
 * ya existía; faltaba APLICARLOS en el checkout. Este módulo valida un código
 * contra un carrito y calcula el descuento en COP centavos, respetando TODAS las
 * reglas del modelo: vigencia, activación, usos globales/por-cliente, mínimo de
 * compra, mínimo de unidades, y restricción por categorías/productos.
 *
 * `priceCouponPure` es el núcleo sin DB (testeable directo); `priceCouponForCart`
 * carga cupón + items y acepta un TransactionClient para correr dentro de la tx de
 * creación de la orden (re-validación atómica al finalizar el checkout).
 */

import { prisma } from "@/lib/db";
import type { Prisma, CouponType } from "@lucams/db";

export type CouponRejectReason =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "MAX_USES_REACHED"
  | "MIN_ORDER_NOT_MET"
  | "MIN_QUANTITY_NOT_MET"
  | "PER_CUSTOMER_LIMIT"
  | "NOT_APPLICABLE"
  | "ZERO_DISCOUNT";

/** Mensajes en español (tuteo Colombia) para mostrar al cliente en el checkout. */
const REJECT_MESSAGES: Record<CouponRejectReason, string> = {
  NOT_FOUND: "Ese código no existe o ya no está disponible.",
  INACTIVE: "Ese cupón está pausado.",
  NOT_STARTED: "Ese cupón aún no está vigente.",
  EXPIRED: "Ese cupón ya venció.",
  MAX_USES_REACHED: "Ese cupón se agotó.",
  MIN_ORDER_NOT_MET: "Tu compra no alcanza el mínimo para este cupón.",
  MIN_QUANTITY_NOT_MET: "Necesitas más unidades para usar este cupón.",
  PER_CUSTOMER_LIMIT: "Ya usaste este cupón el máximo de veces permitido.",
  NOT_APPLICABLE: "Este cupón no aplica a los productos de tu carrito.",
  ZERO_DISCOUNT: "Este cupón no genera descuento en tu compra.",
};

export type CouponEligibleItem = {
  productSlug: string;
  categorySlug: string;
  qty: number;
  lineTotal: number; // unitPrice * qty (COP centavos)
};

/** Subconjunto del modelo Coupon necesario para tarificar. */
export type CouponRow = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrder: number | null;
  maxUses: number | null;
  usedCount: number;
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  appliesToCategories: string[];
  appliesToProductSlugs: string[];
  maxUsesPerCustomer: number | null;
  requiresMinQuantity: number | null;
};

export type PriceCouponResult =
  | { ok: true; couponId: string; code: string; type: CouponType; discount: number }
  | { ok: false; reason: CouponRejectReason; message: string };

const reject = (reason: CouponRejectReason): PriceCouponResult => ({
  ok: false,
  reason,
  message: REJECT_MESSAGES[reason],
});

/**
 * Núcleo puro (sin DB): valida el cupón contra el contexto del carrito y
 * calcula el descuento en centavos. `perCustomerUses` = usos previos de este
 * cliente (0 si invitado o sin límite por cliente).
 */
export function priceCouponPure(
  coupon: CouponRow,
  ctx: {
    items: CouponEligibleItem[];
    subtotal: number;
    shippingCost: number;
    now: Date;
    perCustomerUses: number;
  },
): PriceCouponResult {
  if (!coupon.isActive) return reject("INACTIVE");
  if (ctx.now < coupon.validFrom) return reject("NOT_STARTED");
  if (ctx.now > coupon.validTo) return reject("EXPIRED");
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return reject("MAX_USES_REACHED");
  if (coupon.maxUsesPerCustomer != null && ctx.perCustomerUses >= coupon.maxUsesPerCustomer) {
    return reject("PER_CUSTOMER_LIMIT");
  }

  const totalQty = ctx.items.reduce((a, it) => a + it.qty, 0);
  if (coupon.requiresMinQuantity != null && totalQty < coupon.requiresMinQuantity) {
    return reject("MIN_QUANTITY_NOT_MET");
  }
  if (coupon.minOrder != null && ctx.subtotal < coupon.minOrder) return reject("MIN_ORDER_NOT_MET");

  // Items elegibles: si el cupón restringe por categoría o producto, solo esos
  // items reciben el descuento; sin restricción, todo el carrito es elegible.
  const hasFilter = coupon.appliesToCategories.length > 0 || coupon.appliesToProductSlugs.length > 0;
  const eligible = hasFilter
    ? ctx.items.filter(
        (it) =>
          coupon.appliesToProductSlugs.includes(it.productSlug) ||
          coupon.appliesToCategories.includes(it.categorySlug),
      )
    : ctx.items;
  if (hasFilter && eligible.length === 0) return reject("NOT_APPLICABLE");
  const eligibleSubtotal = eligible.reduce((a, it) => a + it.lineTotal, 0);

  let discount = 0;
  if (coupon.type === "PERCENT") discount = Math.floor((eligibleSubtotal * coupon.value) / 100);
  else if (coupon.type === "FIXED") discount = Math.min(coupon.value, eligibleSubtotal);
  else if (coupon.type === "FREE_SHIPPING") discount = ctx.shippingCost;

  // PERCENT/FIXED nunca descuentan más que el subtotal elegible; nada negativo.
  if (coupon.type !== "FREE_SHIPPING") discount = Math.min(discount, eligibleSubtotal);
  discount = Math.max(0, discount);
  if (discount === 0) return reject("ZERO_DISCOUNT");

  return { ok: true, couponId: coupon.id, code: coupon.code, type: coupon.type, discount };
}

/**
 * Carga el cupón por código + los items del carrito (con slug de producto y
 * categoría) y tarifica. `client` permite correr dentro de la $transaction de
 * creación de la orden para re-validar de forma atómica. `shippingCost` importa
 * para FREE_SHIPPING; 0 si aún no se eligió envío.
 */
export async function priceCouponForCart(
  input: { code: string; cartId: string; shippingCost: number; customerId: string | null; now?: Date },
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PriceCouponResult> {
  const code = input.code.trim();
  if (!code) return reject("NOT_FOUND");

  const coupon = await client.coupon.findFirst({
    where: { code: { equals: code, mode: "insensitive" }, deletedAt: null },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      minOrder: true,
      maxUses: true,
      usedCount: true,
      validFrom: true,
      validTo: true,
      isActive: true,
      appliesToCategories: true,
      appliesToProductSlugs: true,
      maxUsesPerCustomer: true,
      requiresMinQuantity: true,
    },
  });
  if (!coupon) return reject("NOT_FOUND");

  const cart = await client.cart.findFirst({
    where: { id: input.cartId, deletedAt: null },
    select: {
      items: {
        select: {
          qty: true,
          unitPrice: true,
          variant: {
            select: { product: { select: { slug: true, category: { select: { slug: true } } } } },
          },
        },
      },
    },
  });
  const items: CouponEligibleItem[] = (cart?.items ?? []).map((it) => ({
    productSlug: it.variant.product.slug,
    categorySlug: it.variant.product.category.slug,
    qty: it.qty,
    lineTotal: it.unitPrice * it.qty,
  }));
  const subtotal = items.reduce((a, it) => a + it.lineTotal, 0);

  let perCustomerUses = 0;
  if (coupon.maxUsesPerCustomer != null && input.customerId) {
    perCustomerUses = await client.couponUsage.count({
      where: { couponId: coupon.id, customerId: input.customerId },
    });
  }

  return priceCouponPure(coupon, {
    items,
    subtotal,
    shippingCost: input.shippingCost,
    now: input.now ?? new Date(),
    perCustomerUses,
  });
}

export { REJECT_MESSAGES };
