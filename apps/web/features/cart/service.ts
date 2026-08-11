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
 *     Es el precio que el cliente VIO al armar el carrito y el que se cobra:
 *     la Order toma unitPrice del CartItem, NO re-lee variant.price en
 *     checkout (si Lucy cambia un precio, aplica a carritos nuevos — cobrar
 *     de más lo ya exhibido sería peor para el cliente y para el Estatuto
 *     del Consumidor; la ventana de exposición la acota el TTL del carrito).
 *   - Variante default ("<sku>-DEFAULT") es la que se usa cuando un
 *     producto no tiene variantes reales — ver features/products/service.ts.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { parseVariantAttributes } from "@/features/products/variant-schemas";
import { logger } from "@/lib/logger";
import { designIdentity } from "./design-identity";
import { describePieces, pieceKindFor } from "./line-preview";
import { parsePhotoProductConfig } from "@/features/personalization/schemas";

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
  /**
   * Frase que describe la pieza FÍSICA ("6 imanes · 6×6 cm cada imán"), para que el checkout pueda
   * mostrar lo mismo que la modal del Estudio y el cliente confirme sabiendo qué recibe.
   * `null` cuando no hay nada verdadero que decir.
   */
  pieceSummary: string | null;
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
    public code:
      | "PRODUCT_NOT_FOUND"
      | "NO_DEFAULT_VARIANT"
      | "QTY_INVALID"
      | "ITEM_NOT_FOUND"
      | "STOCK_UNAVAILABLE",
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
              // Para describir la pieza física en el checkout (nº de piezas y medida).
              personalizationKind: true,
              personalizationSchema: true,
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
  // `Cart.sessionId` es @unique GLOBAL, no parcial: un carrito soft-borrado sigue ocupando su
  // sessionId. Como `clearCartAfterPaid` soft-borra el carrito al crear una cotización (y al pagar),
  // el cliente que ya cotizó conserva la misma cookie de sesión y aquí no encuentra carrito ACTIVO
  // → el `create` de abajo violaba la restricción y salía un "Algo salió mal" genérico.
  //
  // Síntoma real (Lucy, 2026-07-25): tras pedir una cotización, agregar cualquier cosa al carrito
  // fallaba para siempre en esa sesión. En modo catálogo cotizar ES el flujo principal, así que
  // rompía el embudo completo desde la primera conversión.
  //
  // Se REVIVE el carrito en vez de crear otro: misma sesión, carrito nuevo y vacío. Sus ítems
  // viejos se borran —`clearCartAfterPaid` solo marca el carrito, los CartItem quedaban vivos— y
  // eso no pierde nada: la cotización o la orden ya guardaron su propio snapshot de las líneas.
  const soft = await prisma.cart.findUnique({ where: { sessionId }, select: { id: true } });
  if (soft) {
    await prisma.cartItem.deleteMany({ where: { cartId: soft.id } });
    return prisma.cart.update({
      where: { id: soft.id },
      data: { deletedAt: null, customerId: customerId ?? undefined },
      include: cartItemsInclude,
    });
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

/**
 * Frase que describe la pieza física de una línea ("6 imanes · 6×6 cm cada imán").
 *
 * La VARIANTE manda sobre el producto: "Set 12 unidades" y "Set 6 unidades" son el mismo producto
 * con distinto número de piezas y distinto tamaño, y lo que el cliente compró es la variante.
 */
function describeLine(item: RawCart["items"][number]): string | null {
  const attrs = parseVariantAttributes(item.variant.attributes);
  const schema = item.variant.product.personalizationSchema;
  const delProducto = schema ? parsePhotoProductConfig(schema) : null;
  return describePieces({
    kind: pieceKindFor(item.variant.product.personalizationKind, item.variant.name),
    pieces: attrs.photoSlots ?? delProducto?.photoSlots ?? null,
    sizeCm: attrs.sizeCm ?? (schema as { sizeCm?: string } | null)?.sizeCm ?? null,
  });
}

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
      pieceSummary: describeLine(i),
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
  // #3 — el badge del header corre en CADA página: sumamos qty en la DB en vez de traer el cart
  // completo (imágenes, nombre, preview del diseño). Mismo filtro que toDetail: solo items con
  // producto activo y no borrado. _sum.qty es null sin filas → 0 (idéntico al early-return previo).
  const { _sum } = await prisma.cartItem.aggregate({
    where: {
      cart: { sessionId, deletedAt: null },
      variant: { product: { isActive: true, deletedAt: null } },
    },
    _sum: { qty: true },
  });
  return _sum.qty ?? 0;
}

export async function addProductToCart(opts: {
  sessionId: string;
  customerId: string | null;
  productSlug: string;
  qty: number;
  /**
   * Variante elegida en la ficha (selector). Si se pasa, se usa esa (validando
   * que pertenezca al producto). Si no, cae al legacy `-DEFAULT` (productos sin
   * selector). ADR-057 — productos NONE con opciones (tamaño/imantado/idioma).
   */
  variantId?: string;
}): Promise<CartDetail> {
  if (opts.qty < 1 || opts.qty > MAX_QTY_PER_ITEM) {
    throw new CartError("QTY_INVALID");
  }

  const product = await prisma.product.findFirst({
    where: { slug: opts.productSlug, isActive: true, deletedAt: null },
    select: {
      id: true,
      basePrice: true,
      variants: {
        // Con variantId: esa variante (scoping por producto valida ownership).
        // Sin variantId: la variante legacy `-DEFAULT`.
        where: opts.variantId
          ? { id: opts.variantId, deletedAt: null, isActive: true }
          : { deletedAt: null, sku: { endsWith: "-DEFAULT" } },
        select: { id: true, price: true, stock: true },
        take: 1,
      },
    },
  });
  if (!product) throw new CartError("PRODUCT_NOT_FOUND");
  const variant = product.variants[0];
  if (!variant) throw new CartError("NO_DEFAULT_VARIANT");
  // Fase 1 (stock por variante): la variante elegida agotada no es comprable.
  // El checkout ya lo validaba con STOCK_UNAVAILABLE; aquí evitamos que entre
  // al carrito en primer lugar (mismo código de error para un manejo coherente).
  if (variant.stock <= 0) throw new CartError("STOCK_UNAVAILABLE");

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
//   - Se agrupa por CONTENIDO, no por id de diseño (Lucy 2026-07-25). Cada pasada
//     por el Estudio crea un Design nuevo, así que pedir dos veces lo mismo daba
//     dos líneas idénticas seguidas, que se lee como un error de la tienda. La
//     regla: misma variante + mismo contenido → una línea con cantidad 2; si
//     cambia la variante (color, tamaño, piezas) → líneas separadas, porque son
//     productos físicos distintos. La huella la calcula `designIdentity`.
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
  /**
   * Edición desde el carrito (auditoría 2026-07-13): si el diseño viene de "Editar" un item del
   * carrito (el original se clonó a este DRAFT→READY), reemplazamos EN SITIO el item que apuntaba
   * al diseño original en vez de crear uno nuevo (no duplicar).
   */
  replaceDesignId?: string;
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
      // ADR-057 — metadata.surface + metadata.letters: para Nombre (precio por ficha) el
      // unitPrice = nº de letras × precio-por-ficha. Para el resto, es el precio de variante.
      metadata: true,
      product: {
        select: {
          id: true,
          basePrice: true,
          isActive: true,
          deletedAt: true,
          variants: {
            where: { deletedAt: null },
            select: { id: true, price: true, sku: true, attributes: true, stock: true },
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
  let variant: { id: string; price: number | null; attributes: unknown; stock: number } | undefined;
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
  // Fase 1 (stock por variante): misma regla que addProductToCart — la variante
  // agotada no entra al carrito (el checkout sigue como backstop de concurrencia).
  if (variant.stock <= 0) throw new CartError("STOCK_UNAVAILABLE");

  // ADR-057 — precio POR FICHA. El gate es la VARIANTE (verdad del servidor, anti-tamper),
  // NO metadata.surface: un draft genérico (createDraftDesign) sobre el producto Nombre no
  // pondría surface="name" y, si nos basáramos en metadata, cobraría 1 ficha por un nombre
  // completo (subcobro). Si la variante es por-ficha, el diseño DEBE traer sus letras
  // (server-side, vía createNameDesign): sin letras = diseño inválido para este producto →
  // rechazamos (nunca cobramos de menos). El resto de productos usan el precio tal cual.
  const perUnitPrice = variant.price ?? design.product.basePrice;
  const attrs = parseVariantAttributes(variant.attributes);
  const isPerTile = attrs.pricePerTile === true || attrs.variant === "name";
  const meta = (design.metadata ?? null) as { letters?: unknown } | null;
  let unitPrice = perUnitPrice;
  if (isPerTile) {
    const letters = Array.isArray(meta?.letters) ? meta.letters : null;
    if (!letters || letters.length < 1) {
      // Diseño sin letras sobre una variante por-ficha → inválido (posible tamper).
      // Reusar PRODUCT_NOT_FOUND para no exponer el detalle interno al cliente.
      throw new CartError("PRODUCT_NOT_FOUND");
    }
    // Clamp defensivo (1..40) — nunca precio 0 ni absurdo.
    const letterCount = Math.min(40, Math.max(1, letters.length));
    unitPrice = perUnitPrice * letterCount;
  }
  const cart = await ensureCart(opts.sessionId, opts.customerId);

  // Edición desde el carrito: el diseño original se clonó a este (opts.designId). Reemplazamos EN
  // SITIO el item que apuntaba al original — misma cantidad/posición, sin duplicar. Si el item
  // original ya no está (el cliente lo quitó), caemos al alta normal.
  const replacing = opts.replaceDesignId
    ? cart.items.find((i) => i.designId === opts.replaceDesignId)
    : undefined;
  if (replacing) {
    await prisma.cartItem.update({
      where: { id: replacing.id },
      data: { designId: opts.designId, variantId: variant.id, unitPrice },
    });
  } else {
    // Buscar si ya hay un CartItem para este designId — agregar al qty existente.
    // Caso de re-entrar al editor: el cliente personaliza Design X, lo agrega
    // al cart, vuelve al estudio, hace cambios, "¡Listo!" otra vez → mismo
    // designId, debe sumar al qty existente (mejora UX vs duplicar).
    let existing = cart.items.find((i) => i.designId === opts.designId);

    // Y si no es el MISMO diseño, ¿es uno IDÉNTICO? (Lucy 2026-07-25) Cada pasada por el Estudio
    // crea un Design nuevo, así que pedir dos veces lo mismo daba dos líneas iguales seguidas, que
    // se lee como un error de la tienda. Se agrupa solo con misma VARIANTE y mismo CONTENIDO: si
    // cambia el color, el tamaño o el número de piezas, la variante es otra y siguen separadas.
    if (!existing) {
      const nuevo = await prisma.design.findUnique({
        where: { id: opts.designId },
        select: { productId: true, canvasData: true, metadata: true },
      });
      const candidatos = cart.items.filter(
        (i) => i.variantId === variant.id && i.designId && i.designId !== opts.designId,
      );
      if (nuevo && candidatos.length > 0) {
        const huella = designIdentity(nuevo);
        const gemelos = await prisma.design.findMany({
          where: { id: { in: candidatos.map((i) => i.designId!) } },
          select: { id: true, productId: true, canvasData: true, metadata: true },
        });
        const gemelo = gemelos.find((g) => designIdentity(g) === huella);
        if (gemelo) {
          existing = candidatos.find((i) => i.designId === gemelo.id);
          logger.info(
            { event: "cart.personalized.grouped", designId: opts.designId, mergedInto: gemelo.id },
            "Diseño idéntico agrupado en la línea existente",
          );
        }
      }
    }

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

/**
 * #18 — Adopta el carrito `source` DENTRO del `target` (fold de items, SIN pérdida) y borra el source.
 * Se usa al recuperar un carrito abandonado por link: se folda el carrito ACTUAL (source) en el
 * recuperado (target) para NO pisar lo que el cliente ya tenía. Mismo fold que mergeAnonCartIntoCustomer
 * (agrupa por variantId + mismo designId, cap MAX_QTY_PER_ITEM). Se folda hacia el target para preservar
 * el FK AbandonedCart.cartId del carrito recuperado.
 */
export async function mergeCartsAdopt(
  sourceSessionId: string,
  targetSessionId: string,
): Promise<void> {
  if (sourceSessionId === targetSessionId) return;
  const [source, target] = await Promise.all([
    findCartBySession(sourceSessionId),
    findCartBySession(targetSessionId),
  ]);
  if (!target || !source || source.items.length === 0 || source.id === target.id) return;
  await prisma.$transaction(async (tx) => {
    for (const it of source.items) {
      const dup = target.items.find(
        (t) => t.variantId === it.variantId && (t.designId ?? null) === (it.designId ?? null),
      );
      if (dup) {
        await tx.cartItem.update({
          where: { id: dup.id },
          data: { qty: Math.min(MAX_QTY_PER_ITEM, dup.qty + it.qty) },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: target.id,
            variantId: it.variantId,
            qty: it.qty,
            unitPrice: it.unitPrice,
            customDesign: it.customDesign ?? undefined,
            designId: it.designId ?? undefined,
          },
        });
      }
    }
    await tx.cartItem.deleteMany({ where: { cartId: source.id } });
    await tx.cart.delete({ where: { id: source.id } });
  });
}
