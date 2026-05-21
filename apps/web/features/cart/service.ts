/*
 * Service layer — Cart.
 *
 * Patrón doc'd en CONVENTIONS.md § capa de servicio: lógica de dominio
 * pura, sin imports de next/* ni @/lib/supabase. Server actions
 * envuelven estas funciones con auth + revalidación.
 *
 * Modelo de datos:
 *   - Cart  (sessionId @unique, customerId nullable)
 *   - CartItem (cartId, variantId, qty, unitPrice, customDesign?)
 *
 * Reglas:
 *   - El cart anon vive identificado solo por sessionId.
 *   - Al login, mergeAnonCartIntoCustomer combina el anon en el cart
 *     existente del customer (si lo hay) sumando qty por variantId.
 *   - unitPrice se snapshotea al añadir (variant.price ?? product.basePrice).
 *     Si después el admin sube el precio, el cart NO se actualiza
 *     hasta checkout (donde el price autoritativo se vuelve a leer).
 *   - Variante default ("<sku>-DEFAULT") es la que se usa cuando un
 *     producto no tiene variantes reales — ver features/products/service.ts.
 */

import "server-only";
import { prisma } from "@/lib/db";

export type CartLineItem = {
  itemId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string;
  variantName: string;
  isPersonalizable: boolean;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
  designId: string | null;
  /** Si designId está set, este es el previewUrl del Design (1080×1080 PNG público). */
  designPreviewUrl: string | null;
};

export type CartDetail = {
  cartId: string;
  sessionId: string;
  customerId: string | null;
  itemCount: number;
  subtotal: number;
  items: CartLineItem[];
};

export class CartError extends Error {
  constructor(
    public code: "PRODUCT_NOT_FOUND" | "NO_DEFAULT_VARIANT" | "QTY_INVALID" | "ITEM_NOT_FOUND",
  ) {
    super(code);
    this.name = "CartError";
  }
}

const MAX_QTY_PER_ITEM = 99;

// ─────────────────────────────────────────────────────────────────────
// Lookup / creación
// ─────────────────────────────────────────────────────────────────────

async function findCartBySession(sessionId: string) {
  return prisma.cart.findFirst({
    where: { sessionId, deletedAt: null },
    include: cartItemsInclude,
  });
}

async function findCartByCustomer(customerId: string) {
  return prisma.cart.findFirst({
    where: { customerId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: cartItemsInclude,
  });
}

const cartItemsInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              basePrice: true,
              images: true,
              isPersonalizable: true,
              isActive: true,
              deletedAt: true,
            },
          },
        },
      },
      design: {
        select: {
          id: true,
          previewUrl: true,
          status: true,
        },
      },
    },
  },
};

async function ensureCart(sessionId: string, customerId: string | null) {
  // No usar upsert por sessionId — un cart soft-deleted con el mismo
  // sessionId puede ocupar la unique constraint. Buscar primero los
  // activos; si no existe, crear nuevo.
  const existing = await prisma.cart.findFirst({
    where: { sessionId, deletedAt: null },
    include: cartItemsInclude,
  });
  if (existing) {
    if (customerId && existing.customerId !== customerId) {
      return prisma.cart.update({
        where: { id: existing.id },
        data: { customerId },
        include: cartItemsInclude,
      });
    }
    return existing;
  }
  return prisma.cart.create({
    data: { sessionId, customerId: customerId ?? undefined },
    include: cartItemsInclude,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Conversión a DTO
// ─────────────────────────────────────────────────────────────────────

type RawCart = Awaited<ReturnType<typeof ensureCart>>;

function toDetail(cart: RawCart): CartDetail {
  const items: CartLineItem[] = cart.items
    // Filtra items donde el producto fue archivado entre add-to-cart y
    // la lectura. El admin que archive un producto efectivamente lo
    // saca de carritos en vuelo, lo cual es correcto.
    .filter((i) => i.variant.product.isActive && i.variant.product.deletedAt === null)
    .map((i) => ({
      itemId: i.id,
      productId: i.variant.product.id,
      productSlug: i.variant.product.slug,
      productName: i.variant.product.name,
      variantId: i.variantId,
      variantName: i.variant.name,
      isPersonalizable: i.variant.product.isPersonalizable,
      qty: i.qty,
      unitPrice: i.unitPrice,
      lineTotal: i.qty * i.unitPrice,
      // Si CartItem tiene designId vinculado, mostramos el preview del Design
      // en vez de la imagen genérica del producto. Mejora el "WYSIWYG" del cart.
      imageUrl: i.design?.previewUrl ?? i.variant.product.images[0] ?? null,
      designId: i.designId,
      designPreviewUrl: i.design?.previewUrl ?? null,
    }));
  return {
    cartId: cart.id,
    sessionId: cart.sessionId,
    customerId: cart.customerId,
    items,
    itemCount: items.reduce((sum, i) => sum + i.qty, 0),
    subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────

export async function getCartDetail(sessionId: string): Promise<CartDetail | null> {
  const cart = await findCartBySession(sessionId);
  return cart ? toDetail(cart) : null;
}

export async function getCartItemCount(sessionId: string): Promise<number> {
  const cart = await findCartBySession(sessionId);
  if (!cart) return 0;
  return cart.items
    .filter((i) => i.variant.product.isActive && i.variant.product.deletedAt === null)
    .reduce((sum, i) => sum + i.qty, 0);
}

export async function addProductToCart(opts: {
  sessionId: string;
  customerId: string | null;
  productSlug: string;
  qty: number;
}): Promise<CartDetail> {
  if (opts.qty < 1 || opts.qty > MAX_QTY_PER_ITEM) {
    throw new CartError("QTY_INVALID");
  }

  // Buscar producto + variante default. En el futuro habrá selector
  // de variante en la UI; mientras tanto, default es el único path.
  const product = await prisma.product.findFirst({
    where: { slug: opts.productSlug, isActive: true, deletedAt: null },
    select: {
      id: true,
      basePrice: true,
      variants: {
        where: { deletedAt: null, sku: { endsWith: "-DEFAULT" } },
        select: { id: true, price: true },
        take: 1,
      },
    },
  });
  if (!product) throw new CartError("PRODUCT_NOT_FOUND");
  const variant = product.variants[0];
  if (!variant) throw new CartError("NO_DEFAULT_VARIANT");

  const unitPrice = variant.price ?? product.basePrice;

  const cart = await ensureCart(opts.sessionId, opts.customerId);

  // Upsert por (cartId, variantId) — si ya existe item con esa variante,
  // suma qty. CartItem no tiene unique compuesto, así que lo manejamos
  // a mano.
  const existing = cart.items.find((i) => i.variantId === variant.id);
  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { qty: Math.min(MAX_QTY_PER_ITEM, existing.qty + opts.qty) },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId: variant.id,
        qty: opts.qty,
        unitPrice,
      },
    });
  }

  const reloaded = await findCartBySession(opts.sessionId);
  return toDetail(reloaded!);
}

// ─────────────────────────────────────────────────────────────────────
// Add personalized item — Estudio "¡Listo!" → cart
// ─────────────────────────────────────────────────────────────────────
//
// Una vez Design.status=READY, el cliente lo agrega al carrito. Diferencias
// vs addProductToCart:
//   - Se requiere designId (estado READY validado).
//   - Cada Design es UN cart item — no agrupar por variantId. Si el cliente
//     agrega "Pack 6 fotoimanes" personalizado dos veces, son dos diseños
//     distintos = dos CartItems. Si quiere 2 copias del mismo diseño,
//     ajusta qty del CartItem existente.
//   - Validación de ownership del Design ya la hizo el Server Action que
//     llama esto. Aquí solo verificamos status READY.

export async function addPersonalizedToCart(opts: {
  sessionId: string;
  customerId: string | null;
  designId: string;
  qty: number;
  /**
   * Variant elegido por el cliente en el flow PDP → Estudio
   * (`/estudio/[slug]?variant=X`). Si se omite, fallback a la primera
   * variant activa del producto (mantiene compat con productos sin variants).
   *
   * Si se pasa, se valida que pertenece a design.product.id (anti-tamper).
   */
  variantId?: string;
}): Promise<CartDetail> {
  if (opts.qty < 1 || opts.qty > MAX_QTY_PER_ITEM) {
    throw new CartError("QTY_INVALID");
  }

  // Fetch design + product + variantes activas. Validar status READY.
  const design = await prisma.design.findUnique({
    where: { id: opts.designId },
    select: {
      id: true,
      status: true,
      product: {
        select: {
          id: true,
          basePrice: true,
          isActive: true,
          deletedAt: true,
          variants: {
            where: { deletedAt: null },
            select: { id: true, price: true, sku: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!design || !design.product.isActive || design.product.deletedAt) {
    throw new CartError("PRODUCT_NOT_FOUND");
  }
  if (design.status !== "READY") {
    // Design no listo (DRAFT / USED_IN_ORDER / ARCHIVED). Reusar
    // PRODUCT_NOT_FOUND error para evitar surface DRAFT details al cliente.
    throw new CartError("PRODUCT_NOT_FOUND");
  }

  // Resolver variant: si caller pasó variantId (típico tras consolidación
  // de familias M.3.b.CAT donde N variants por size/qty), validar que
  // pertenece al producto del Design. Si no se pasó, fallback histórico:
  // primera variant disponible (post-M.3.b.CAT la mayoría de productos
  // tienen al menos 1 variant; pre-consolidación había un "-DEFAULT").
  let variant: { id: string; price: number | null } | undefined;
  if (opts.variantId) {
    variant = design.product.variants.find((v) => v.id === opts.variantId);
    if (!variant) {
      // El variantId no pertenece a este producto → posible tamper
      // (cliente cambió URL) o variant archivado entre PDP y Estudio.
      throw new CartError("NO_DEFAULT_VARIANT");
    }
  } else {
    // Compat: primera variant activa (orden por createdAt). Para productos
    // mono-variant queda igual; para multi-variant es elección arbitraria.
    variant = design.product.variants[0];
  }
  if (!variant) throw new CartError("NO_DEFAULT_VARIANT");

  const unitPrice = variant.price ?? design.product.basePrice;
  const cart = await ensureCart(opts.sessionId, opts.customerId);

  // Buscar si ya hay un CartItem para este designId — agregar al qty existente.
  // Caso de re-entrar al editor: el cliente personaliza Design X, lo agrega
  // al cart, vuelve al estudio, hace cambios, "¡Listo!" otra vez → mismo
  // designId, debe sumar al qty existente (mejora UX vs duplicar).
  const existing = cart.items.find((i) => i.designId === opts.designId);
  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { qty: Math.min(MAX_QTY_PER_ITEM, existing.qty + opts.qty) },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId: variant.id,
        designId: opts.designId,
        qty: opts.qty,
        unitPrice,
      },
    });
  }

  const reloaded = await findCartBySession(opts.sessionId);
  return toDetail(reloaded!);
}

export async function updateCartItemQty(
  sessionId: string,
  itemId: string,
  qty: number,
): Promise<CartDetail> {
  if (qty < 0 || qty > MAX_QTY_PER_ITEM) throw new CartError("QTY_INVALID");
  const cart = await findCartBySession(sessionId);
  if (!cart) throw new CartError("ITEM_NOT_FOUND");
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw new CartError("ITEM_NOT_FOUND");

  if (qty === 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
  } else {
    await prisma.cartItem.update({
      where: { id: itemId },
      data: { qty },
    });
  }
  const reloaded = await findCartBySession(sessionId);
  return toDetail(reloaded!);
}

export async function removeCartItem(sessionId: string, itemId: string): Promise<CartDetail> {
  return updateCartItemQty(sessionId, itemId, 0);
}

// ─────────────────────────────────────────────────────────────────────
// Merge on login — invocado desde loginAction y verifyOtpAction.
// ─────────────────────────────────────────────────────────────────────
//
// Estrategia:
//   - Si anon cart NO existe → nada que hacer.
//   - Si customer no tiene cart previo → setear customerId en el anon
//     (carta-misma, recibe a su nuevo dueño).
//   - Si ambos existen → merge inteligente: folder items del anon en
//     el cart del customer sumando qty por variantId; soft-delete anon.
//
// Retorna el sessionId que debería quedar en la cookie del usuario
// (puede ser el del cart del customer si existía uno previo).

export async function mergeAnonCartIntoCustomer(
  anonSessionId: string,
  customerId: string,
): Promise<string> {
  const anonCart = await findCartBySession(anonSessionId);
  if (!anonCart || anonCart.items.length === 0) {
    // Sin nada que mergear. Si existe un cart vacío anon, lo dejamos
    // estar — el cliente puede seguir agregando con su misma cookie.
    // Pero asociamos customerId para futuro tracking.
    if (anonCart && anonCart.customerId !== customerId) {
      await prisma.cart.update({
        where: { id: anonCart.id },
        data: { customerId },
      });
    }
    return anonSessionId;
  }

  const customerCart = await findCartByCustomer(customerId);

  // Caso 1: customer sin cart previo → el anon pasa a ser suyo.
  if (!customerCart) {
    await prisma.cart.update({
      where: { id: anonCart.id },
      data: { customerId },
    });
    return anonSessionId;
  }

  // Caso 2: ambos existen, mismo cart (raro) → noop.
  if (customerCart.id === anonCart.id) return anonSessionId;

  // Caso 3: merge. Fold del anon en el customer cart.
  // Items con designId NUNCA se agrupan con otros por variantId — cada diseño
  // personalizado es único. Solo agrupamos por (variantId AND mismo designId)
  // o (variantId AND ninguno tiene designId).
  await prisma.$transaction(async (tx) => {
    for (const anonItem of anonCart.items) {
      const dup = customerCart.items.find(
        (i) =>
          i.variantId === anonItem.variantId &&
          (i.designId ?? null) === (anonItem.designId ?? null),
      );
      if (dup) {
        await tx.cartItem.update({
          where: { id: dup.id },
          data: { qty: Math.min(MAX_QTY_PER_ITEM, dup.qty + anonItem.qty) },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: customerCart.id,
            variantId: anonItem.variantId,
            qty: anonItem.qty,
            unitPrice: anonItem.unitPrice,
            customDesign: anonItem.customDesign ?? undefined,
            designId: anonItem.designId ?? undefined, // M.4 preservar Design vinculado
          },
        });
      }
    }
    // Hard-delete anon cart (CartItem cascade). Cart es data efímera
    // sin valor de auditoría — además `sessionId @unique` no respeta
    // deletedAt, así que un soft-delete bloquearía reusar ese
    // sessionId para un nuevo cart en el futuro.
    await tx.cartItem.deleteMany({ where: { cartId: anonCart.id } });
    await tx.cart.delete({ where: { id: anonCart.id } });
  });

  return customerCart.sessionId;
}
