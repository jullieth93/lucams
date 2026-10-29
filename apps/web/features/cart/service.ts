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
 *   - Precio por volumen (WholesaleTier, 2026-10-02): si hay niveles activos
 *     aplicables, el unitPrice de la línea es el del nivel alcanzado por la
 *     qty (ver volume-pricing.ts — reglas y precedencia). Como el nivel
 *     depende de la qty, el unitPrice se RE-CALCULA en addProductToCart /
 *     addPersonalizedToCart / updateCartItemQty cada vez que la qty cambia;
 *     cuando el producto NO tiene niveles configurados el snapshot queda
 *     intacto (semántica legacy).
 *   - Variante default ("<sku>-DEFAULT") es la que se usa cuando un
 *     producto no tiene variantes reales — ver features/products/service.ts.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  describeVariantAttributes,
  parseVariantAttributes,
} from "@/features/products/variant-schemas";
import {
  readPhotoPackDesignInfo,
  resolvePhotoPackVariant,
} from "@/features/products/photo-pack-resolve";
import { isPurchasableVariant } from "@/features/products/storefront-visibility";
import { logger } from "@/lib/logger";
import { designIdentity, sameLineContent } from "./design-identity";
import { describePieces, pieceKindFor, unitCountNounForLine, type UnitNoun } from "./line-preview";
import { isBookmarkGalleryTag, resolveGalleryTag } from "@/app/estudio/[slug]/lib/product-kind";
import { parsePhotoProductConfig } from "@/features/personalization/schemas";
import {
  designDisplayUnits,
  designUnitPriceMultiplier,
  inventoryUnitsForOrderItem,
  letterSetUnitCount,
} from "@/features/personalization/design-units";
import { letterSetBorderNote } from "@/features/personalization/letter-set-border";
import {
  designPreviewPageLabels,
  unitNounForLine,
} from "@/features/personalization/preview-page-labels";
import { designHasMeaningfulProgress } from "@/features/personalization/design-progress";
import { designPreviewDisplay } from "@/features/personalization/preview-artifacts";
import { applyVolumePricing, type VolumeTierInput } from "./volume-pricing";

export type CartLineItem = {
  itemId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string;
  variantName: string;
  /** SKU de la variante (E09 — item_id de los eventos GA4 de carrito/checkout). */
  variantSku: string;
  /**
   * Desglose estructurado de la variante (Paquete F, 2026-10-02 —
   * describeVariantAttributes): ["12 fotos", "6×8 cm", "Sin imán"].
   * El variantName es texto libre y no siempre informa las dimensiones de
   * compra (el set de 12 tarjetas no decía si era CON IMÁN). [] si la variante
   * no declara attributes.
   */
  variantBreakdown: string[];
  isPersonalizable: boolean;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /**
   * Stock actual de la variante (2026-09-29): la UI del carrito lo usa para el
   * badge "Solo quedan N" y para capar el stepper (no subir por encima del
   * stock disponible). No es una reserva — puede cambiar hasta el pago.
   */
  stock: number;
  /** Unidades físicas de inventario y logística derivadas de la línea, no solo su qty comercial. */
  inventoryUnits: number;
  imageUrl: string | null;
  designId: string | null;
  /** Si designId está set, este es el previewUrl del Design (1080×1080 PNG público).
   *  2026-10-13 — es la versión WATERMARK cuando existe (preview-wm.webp por
   *  convención de paths; fallback al limpio para diseños sin artefactos). */
  designPreviewUrl: string | null;
  /**
   * 2026-10-13 — páginas por unidad del preview (WATERMARK, wm/pages/NN.webp)
   * para el "Ver" paginado del carrito/pedidos; null = imagen única de siempre.
   */
  designPreviewPages: string[] | null;
  /**
   * 2026-10-22 — rótulo por página del "Ver" paginado ("Set 2 · con borde",
   * "Tira 1"), alineado por índice con `designPreviewPages`. null cuando el
   * diseño es de 1 unidad o las unidades no cuadran con las páginas.
   */
  designPreviewPageLabels: string[] | null;
  /** true cuando la imagen exhibida de la línea lleva marca de agua (aviso al cliente). */
  designWatermarked: boolean;
  /**
   * Unidades físicas que contiene el diseño (modelo multi-unidad 2026-09-09,
   * `designDisplayUnits`). El carrito las muestra como texto informativo en vez
   * del stepper de qty: subir qty duplicaría el pack entero (×5 → ×10) y el
   * cliente lo lee como error. `null` en líneas sin diseño (catálogo simple).
   */
  designUnits: number | null;
  /**
   * Sustantivo de la unidad comercial de la línea para los conteos ("2 tiras",
   * "3 packs" — unitCountNounForLine). El carrito lo usa en la etiqueta de
   * cantidad y como fallback del badge CMS «N …» sobre la miniatura.
   */
  unitNoun: UnitNoun;
  /**
   * Frase que describe la pieza FÍSICA ("6 imanes · 6×6 cm cada imán"), para que el checkout pueda
   * mostrar lo mismo que la modal del Estudio y el cliente confirme sabiendo qué recibe.
   * `null` cuando no hay nada verdadero que decir.
   */
  pieceSummary: string | null;
  /**
   * "Con borde" / "Sin borde" para sets de letras (opción de diseño persistida en el Design,
   * Lucy 2026-09-05). `null` para cualquier otro producto.
   */
  borderNote: string | null;
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
      | "STOCK_UNAVAILABLE"
      | "CART_IDENTITY_MISMATCH",
    /**
     * Copy customer-safe opcional que nombra el producto/stock (p. ej. "Solo
     * quedan 3 unidades de «Imán Nevera»"). Las actions lo prefieren sobre el
     * mensaje genérico del code. Nunca lleva internals (ids, variantId).
     */
    public detail?: string,
  ) {
    super(detail ?? code);
    this.name = "CartError";
  }
}

const MAX_QTY_PER_ITEM = 99;

/**
 * Copy es-CO para el rechazo por stock en el carrito: nombra el producto y las
 * unidades disponibles, y aclara cuántas ya tiene en el carrito cuando aplica.
 */
function stockLimitMessage(productName: string, stock: number, inCart: number): string {
  const base = `Solo quedan ${stock} ${stock === 1 ? "unidad" : "unidades"} de «${productName}»`;
  return inCart > 0 ? `${base} y ya tienes ${inCart} en tu carrito.` : `${base}.`;
}

// ─────────────────────────────────────────────────────────────────────
// Precio por volumen (WholesaleTier → carrito, 2026-10-02)
// ─────────────────────────────────────────────────────────────────────
//
// Descuento por volumen PÚBLICO (todos los clientes, invitados incluidos).
// La resolución del nivel es pura (volume-pricing.ts); aquí solo se carga la
// data. ANTI-TAMPER: los tiers se leen server-side desde la DB en cada
// mutación del carrito (mismo patrón que los multiplicadores por-ficha) —
// nada del cálculo confía en payloads del cliente.
//
// Huella de queries: 1 query acotada por mutación de línea (producto +
// globales en un solo WHERE OR; el helper decide la precedencia en memoria).
// En updateCartItemQty es 1 query por línea afectada — aceptable: el stepper
// mueve una línea a la vez y evita cargar tiers de todo el catálogo.

/**
 * Tiers activos (isActive, no soft-eliminados) que pueden aplicar al producto:
 * los propios (productId) y los globales (productId null). Select acotado a
 * lo que el helper puro necesita.
 */
async function loadActiveVolumeTiers(productId: string): Promise<VolumeTierInput[]> {
  return prisma.wholesaleTier.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [{ productId }, { productId: null }],
    },
    select: { productId: true, minQty: true, unitPrice: true, isActive: true, deletedAt: true },
  });
}

/**
 * Base VIGENTE de una línea ya en el carrito (sin tier de volumen): replica el
 * cálculo de alta — `variant.price ?? product.basePrice` + multiplicadores
 * por-ficha (ADR-057) y multi-unidad (design-units.ts) si la línea tiene
 * diseño. Todo se deriva de datos server-side (variante, canvasData y metadata
 * guardados del Design), nunca del cliente.
 *
 * Se usa en updateCartItemQty para re-pricear al cruzar un umbral de volumen.
 * Devuelve null cuando la línea es inconsistente (variante por-ficha con
 * diseño sin letras — al alta se rechaza; aquí se conserva el snapshot en vez
 * de inventar un precio).
 */
function currentLineBaseUnitPrice(item: RawCart["items"][number]): number | null {
  let base = item.variant.price ?? item.variant.product.basePrice;
  if (!item.design) return base;
  const attrs = parseVariantAttributes(item.variant.attributes);
  const isPerTile = attrs.pricePerTile === true || attrs.variant === "name";
  if (isPerTile) {
    const meta = (item.design.metadata ?? null) as { letters?: unknown } | null;
    const letters = Array.isArray(meta?.letters) ? meta.letters : null;
    if (!letters || letters.length < 1) return null;
    base *= Math.min(40, Math.max(1, letters.length));
  }
  const facesPerUnit =
    parsePhotoProductConfig(item.variant.product.personalizationSchema).facesPerUnit ?? 1;
  base *= designUnitPriceMultiplier(item.design.canvasData, facesPerUnit);
  base *= letterSetUnitCount(item.design.metadata);
  return base;
}

// ─────────────────────────────────────────────────────────────────────
// Lookup / creación
// ─────────────────────────────────────────────────────────────────────

async function findCartBySession(sessionId: string) {
  return prisma.cart.findFirst({
    where: { sessionId, deletedAt: null },
    include: cartItemsInclude,
  });
}

function cartIdentityMatches(
  cart: { customerId: string | null },
  customerId: string | null,
): boolean {
  return cart.customerId === null || cart.customerId === customerId;
}

function assertCartIdentity(cart: { customerId: string | null }, customerId: string | null): void {
  if (!cartIdentityMatches(cart, customerId)) {
    throw new CartError("CART_IDENTITY_MISMATCH");
  }
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
              category: { select: { isActive: true, deletedAt: true } },
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
          // 2026-10-13 — sellos de los artefactos watermark del preview
          // (preview-wm.webp / thumb.webp / wm/pages/NN.webp por convención de
          // paths): el carrito exhibe la versión CON marca de agua cuando existe.
          previewWatermarkedAt: true,
          previewPagesCount: true,
          status: true,
          // productId + canvasData + metadata: identidad de contenido del diseño
          // (designIdentity) — los merges agrupan líneas con diseños distintos pero
          // idénticos (Paquete H, 2026-10-02).
          productId: true,
          // Metadata del diseño: opciones de diseño que se muestran en el resumen (p. ej.
          // "Sin borde" de los sets de letras, Lucy 2026-09-05). El PNG las refleja; el texto
          // evita que el cliente tenga que deducirlas de la imagen.
          metadata: true,
          // Multi-unidad (2026-09-25): el canvas declara unitCount/unitSlots — con
          // designDisplayUnits el carrito muestra "N unidades" en vez del stepper.
          canvasData: true,
        },
      },
    },
  },
};

async function ensureCart(sessionId: string, customerId: string | null) {
  const existing = await prisma.cart.findFirst({
    where: { sessionId, deletedAt: null },
    include: cartItemsInclude,
  });
  if (existing) {
    assertCartIdentity(existing, customerId);
    if (customerId && existing.customerId === null) {
      return prisma.cart.update({
        where: { id: existing.id },
        data: { customerId },
        include: cartItemsInclude,
      });
    }
    return existing;
  }

  // Un carrito pagado puede revivirse vacío con la misma sesión, pero solo si
  // también pasa la guarda de identidad; nunca se reasigna a otra cuenta.
  const soft = await prisma.cart.findUnique({
    where: { sessionId },
    select: { id: true, customerId: true },
  });
  if (soft) {
    assertCartIdentity(soft, customerId);
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
 *
 * Multi-unidad (2026-09-09): cuando el diseño declara sus unidades (metadata.unitCount,
 * escrito al finalizar), la frase las describe ("2 tiras de 3 fotos", "2 calendarios
 * de 12 páginas", "2 sets de 27 fichas") — la línea ES el diseño completo.
 */
function describeLine(item: RawCart["items"][number]): string | null {
  const attrs = parseVariantAttributes(item.variant.attributes);
  const schema = item.variant.product.personalizationSchema;
  const delProducto = schema ? parsePhotoProductConfig(schema) : null;
  const kind = pieceKindFor(item.variant.product.personalizationKind, item.variant.name);
  const meta = (item.design?.metadata ?? null) as {
    unitCount?: unknown;
    surface?: unknown;
    letters?: unknown;
  } | null;
  const units = typeof meta?.unitCount === "number" && meta.unitCount > 1 ? meta.unitCount : null;
  // Sustantivo de la unidad cuando el diseño trae varias. Sets de letras: "set";
  // las piezas son las fichas del alfabeto (metadata.letters).
  const isLetterSet = meta?.surface === "letterset";
  const unitNoun =
    units !== null
      ? kind === "calendar"
        ? { singular: "calendario", plural: "calendarios" }
        : kind === "strips"
          ? { singular: "tira", plural: "tiras" }
          : isLetterSet
            ? { singular: "set", plural: "sets" }
            : undefined
      : undefined;
  const letterCount = Array.isArray(meta?.letters) ? meta.letters.length : 0;
  const pieces =
    kind === "strips" || kind === "calendar"
      ? (attrs.photoSlots ?? delProducto?.photoSlots ?? null)
      : isLetterSet && letterCount > 0
        ? letterCount
        : (attrs.photoSlots ?? delProducto?.photoSlots ?? null);
  return describePieces({
    kind,
    pieces,
    sizeCm: attrs.sizeCm ?? (schema as { sizeCm?: string } | null)?.sizeCm ?? null,
    units: unitNoun ? units : null,
    unitNoun,
  });
}

function toDetail(cart: RawCart): CartDetail {
  const items: CartLineItem[] = cart.items
    .filter((i) =>
      isPurchasableVariant({
        variantIsActive: i.variant.isActive,
        variantDeletedAt: i.variant.deletedAt,
        productIsActive: i.variant.product.isActive,
        productDeletedAt: i.variant.product.deletedAt,
        categoryIsActive: i.variant.product.category.isActive,
        categoryDeletedAt: i.variant.product.category.deletedAt,
      }),
    )
    .map((i) => {
      // 2026-10-13 — exhibición con marca de agua: thumb representativa para la
      // miniatura de la línea (el montaje completo de un set se veía como
      // "punticos"), preview watermark para el "Ver" y las cotizaciones que lo
      // snapshotan. Admin/producción siguen leyendo el preview LIMPIO.
      const designDisp = i.design ? designPreviewDisplay(i.design) : null;
      return {
        itemId: i.id,
        productId: i.variant.product.id,
        productSlug: i.variant.product.slug,
        productName: i.variant.product.name,
        variantId: i.variantId,
        variantName: i.variant.name,
        variantSku: i.variant.sku,
        variantBreakdown: describeVariantAttributes(parseVariantAttributes(i.variant.attributes)),
        isPersonalizable: i.variant.product.isPersonalizable,
        qty: i.qty,
        unitPrice: i.unitPrice,
        lineTotal: i.qty * i.unitPrice,
        stock: i.variant.stock,
        inventoryUnits: inventoryUnitsForOrderItem({
          qty: i.qty,
          customDesign: i.design?.canvasData ?? i.customDesign,
          metadata: i.design?.metadata ?? i.metadata,
          variantAttrs: i.variant.attributes,
          productSchema: i.variant.product.personalizationSchema,
        }),
        // Si CartItem tiene designId vinculado, mostramos el preview del Design
        // en vez de la imagen genérica del producto. Mejora el "WYSIWYG" del cart.
        // Paquete F (2026-10-02) — sin diseño, la foto de LA VARIANTE manda sobre
        // la genérica del producto (ProductVariant.images, "vacío = hereda
        // Product.images"): el separador 2×6 mostraba la portada del 4×4.2.
        imageUrl:
          designDisp?.thumbUrl ?? i.variant.images[0] ?? i.variant.product.images[0] ?? null,
        designId: i.designId,
        designPreviewUrl: designDisp?.displayUrl ?? null,
        designPreviewPages: designDisp?.pageUrls ?? null,
        designPreviewPageLabels: designPreviewPageLabels(
          i.design,
          unitNounForLine(i.variant.product.personalizationKind, i.variant.name),
        ),
        designWatermarked: designDisp?.watermarked ?? false,
        designUnits: designDisplayUnits(i.design),
        unitNoun: unitCountNounForLine({
          personalizationKind: i.variant.product.personalizationKind,
          variantName: i.variant.name,
          designMetadata: i.design?.metadata,
          isBookmark: isBookmarkGalleryTag(
            resolveGalleryTag(i.variant.product.personalizationSchema, i.variant.product.slug),
          ),
        }),
        pieceSummary: describeLine(i),
        borderNote: letterSetBorderNote(i.design?.metadata),
      };
    });
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

export async function getCartDetail(
  sessionId: string,
  customerId: string | null = null,
): Promise<CartDetail | null> {
  const cart = await findCartBySession(sessionId);
  if (!cart || !cartIdentityMatches(cart, customerId)) return null;
  return toDetail(cart);
}

export async function getCartItemCount(
  sessionId: string,
  customerId: string | null = null,
): Promise<number> {
  const { _sum } = await prisma.cartItem.aggregate({
    where: {
      cart: {
        sessionId,
        deletedAt: null,
        ...(customerId ? { OR: [{ customerId: null }, { customerId }] } : { customerId: null }),
      },
      variant: {
        isActive: true,
        deletedAt: null,
        product: {
          isActive: true,
          deletedAt: null,
          category: { isActive: true, deletedAt: null },
        },
      },
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
    where: {
      slug: opts.productSlug,
      isActive: true,
      deletedAt: null,
      category: { isActive: true, deletedAt: null },
    },
    select: {
      id: true,
      basePrice: true,
      // name: para el copy del rechazo por stock ("Solo quedan N unidades de «X»").
      name: true,
      variants: {
        // Con variantId: esa variante (scoping por producto valida ownership).
        // Sin variantId: la variante legacy `-DEFAULT`.
        where: opts.variantId
          ? { id: opts.variantId, deletedAt: null, isActive: true }
          : { deletedAt: null, isActive: true, sku: { endsWith: "-DEFAULT" } },
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
  if (variant.stock <= 0) {
    throw new CartError("STOCK_UNAVAILABLE", `«${product.name}» está agotado por ahora.`);
  }

  const baseUnitPrice = variant.price ?? product.basePrice;
  // Precio por volumen (2026-10-02): tiers activos del producto (o globales si
  // no tiene propios). El nivel se resuelve con la qty FINAL de la línea (tras
  // clamp y acumulado) — cruzar un umbral re-pricea la línea existente.
  const volumeTiers = await loadActiveVolumeTiers(product.id);

  const cart = await ensureCart(opts.sessionId, opts.customerId);

  // Upsert por (cartId, variantId) — si ya existe item con esa variante,
  // suma qty. CartItem no tiene unique compuesto, así que lo manejamos
  // a mano.
  const existing = cart.items.find((i) => i.variantId === variant.id && !i.designId);
  // Tope efectivo de la línea: min(99, stock) con SEMÁNTICA DE CLAMP
  // (2026-09-29) — sumar más allá del tope se topa al tope, igual que el clamp
  // legacy a 99, ahora también contra el stock real de la variante. Solo se
  // RECHAZA cuando no hay margen: stock 0 (arriba) o el carrito ya está en el
  // tope y se intenta sumar más. Sin reservas, el checkout sigue siendo la
  // defensa final contra concurrencia; esto cierra el oversell "en frío" por
  // acumulación sin castigar al cliente que se pasa por un clic de más.
  const cap = Math.min(MAX_QTY_PER_ITEM, variant.stock);
  const inCart = existing?.qty ?? 0;
  if (inCart >= cap) {
    throw new CartError(
      "STOCK_UNAVAILABLE",
      stockLimitMessage(product.name, variant.stock, inCart),
    );
  }
  const newQty = Math.min(cap, inCart + opts.qty);
  // Sin niveles configurados la línea existente conserva su snapshot (legacy);
  // con niveles se re-pricea contra el base vigente (el tier es absoluto).
  const unitPrice =
    volumeTiers.length > 0
      ? applyVolumePricing(baseUnitPrice, volumeTiers, product.id, newQty)
      : (existing?.unitPrice ?? baseUnitPrice);
  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { qty: newQty, unitPrice },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId: variant.id,
        qty: newQty,
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
   * EXCEPCIÓN (Lucy 2026-09-05): los packs de fotoimanes eligen el N de fotos
   * DENTRO del Estudio y el flujo NO lo manda — el servidor lo resuelve desde
   * el canvasData del diseño (photoSlots + sizeCm). Así el precio cobrado
   * siempre corresponde a las fotos que el cliente diseñó, aunque el variantId
   * que fijó la PDP quedara desactualizado.
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
      // Multi-unidad (2026-09-09) — también metadata.unitCount (sets de letras ×N).
      metadata: true,
      // Lucy 2026-09-05 — packs de fotoimanes: el canvasData trae photoSlots/sizeCm
      // (y magnet desde 2026-09-08, "¿Con imán?") elegidos por el cliente → resolución
      // server-side de la variante cuando el caller no manda variantId
      // (features/products/photo-pack-resolve.ts).
      // Multi-unidad — también unitCount/unitSlots/slotCount: el multiplicador de
      // precio se DERIVA del canvas (design-units.ts), nunca se confía en el cliente.
      canvasData: true,
      product: {
        select: {
          id: true,
          basePrice: true,
          // name: copy del rechazo por stock ("Solo quedan N unidades de «X»").
          name: true,
          isActive: true,
          deletedAt: true,
          category: { select: { isActive: true, deletedAt: true } },
          // Multi-unidad — facesPerUnit para el multiplicador (separadores: 2 caras;
          // verdad del producto, no del canvas).
          personalizationSchema: true,
          variants: {
            where: { deletedAt: null, isActive: true },
            select: { id: true, price: true, sku: true, attributes: true, stock: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (
    !design ||
    !design.product.isActive ||
    design.product.deletedAt ||
    !design.product.category.isActive ||
    design.product.category.deletedAt
  ) {
    throw new CartError("PRODUCT_NOT_FOUND");
  }
  if (design.status !== "READY") {
    // Design no listo (DRAFT / USED_IN_ORDER / ARCHIVED). Reusar
    // PRODUCT_NOT_FOUND error para evitar surface DRAFT details al cliente.
    throw new CartError("PRODUCT_NOT_FOUND");
  }

  let variant: { id: string; price: number | null; attributes: unknown; stock: number } | undefined;
  if (opts.variantId && !design.product.variants.some((v) => v.id === opts.variantId)) {
    throw new CartError("NO_DEFAULT_VARIANT");
  }
  const packInfo = readPhotoPackDesignInfo(design.canvasData);
  if (packInfo) {
    variant = resolvePhotoPackVariant(design.product.variants, packInfo) ?? undefined;
    if (!variant) throw new CartError("NO_DEFAULT_VARIANT");
  } else if (opts.variantId) {
    variant = design.product.variants.find((v) => v.id === opts.variantId);
    if (!variant) throw new CartError("NO_DEFAULT_VARIANT");
  } else {
    variant = design.product.variants[0];
  }
  if (!variant) throw new CartError("NO_DEFAULT_VARIANT");
  // Fase 1 (stock por variante): misma regla que addProductToCart — la variante
  // agotada no entra al carrito (el checkout sigue como backstop de concurrencia).
  if (variant.stock <= 0) {
    throw new CartError("STOCK_UNAVAILABLE", `«${design.product.name}» está agotado por ahora.`);
  }

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
  // Modelo MULTI-UNIDAD (owner 2026-09-09): el diseño CONTIENE N unidades y la
  // línea es UNA (qty=1) → el unitPrice es variante × multiplicador. El
  // multiplicador se DERIVA del canvas guardado (slotCount vs lo que cubre la
  // variante — design-units.ts) y de metadata.unitCount validado al crear
  // (sets de letras): nunca de un multiplicador que mande el cliente.
  // Diseños legacy/packs (la variante ya cubre el pack) → 1, precio intacto.
  const facesPerUnit =
    parsePhotoProductConfig(design.product.personalizationSchema).facesPerUnit ?? 1;
  unitPrice *= designUnitPriceMultiplier(design.canvasData, facesPerUnit);
  unitPrice *= letterSetUnitCount(design.metadata);
  // Precio por volumen (2026-10-02): el tier REEMPLAZA el unitPrice FINAL por
  // unidad (tras multiplicadores por-ficha / multi-unidad). La "qty" del nivel
  // es la cantidad de la LÍNEA (diseños/packs que paga el cliente), no las
  // unidades internas del diseño — es lo que el cliente ve en el stepper.
  const baseUnitPrice = unitPrice;
  const volumeTiers = await loadActiveVolumeTiers(design.product.id);
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
      data: {
        designId: opts.designId,
        variantId: variant.id,
        // La línea conserva su qty; el tier se re-evalúa con esa qty.
        unitPrice: applyVolumePricing(baseUnitPrice, volumeTiers, design.product.id, replacing.qty),
      },
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
      // Mismo tope min(99, stock) con clamp que addProductToCart (2026-09-29):
      // agrupar un diseño idéntico SUMA qty sobre la misma variante; se rechaza
      // solo cuando la línea ya está en el tope (sin margen).
      const cap = Math.min(MAX_QTY_PER_ITEM, variant.stock);
      const inCart = existing.qty;
      if (inCart >= cap) {
        throw new CartError(
          "STOCK_UNAVAILABLE",
          stockLimitMessage(design.product.name, variant.stock, inCart),
        );
      }
      const newQty = Math.min(cap, inCart + opts.qty);
      await prisma.cartItem.update({
        where: { id: existing.id },
        // Sumar qty puede cruzar un umbral de volumen → re-priceo de la línea.
        // Sin niveles configurados se conserva el snapshot existente (legacy).
        data: {
          qty: newQty,
          unitPrice:
            volumeTiers.length > 0
              ? applyVolumePricing(baseUnitPrice, volumeTiers, design.product.id, newQty)
              : existing.unitPrice,
        },
      });
    } else {
      // Alta nueva: el stock>0 ya se validó arriba, así que hay margen; la qty
      // pedida se topa al stock disponible (clamp, no rechazo).
      const newQty = Math.min(MAX_QTY_PER_ITEM, variant.stock, opts.qty);
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: variant.id,
          designId: opts.designId,
          qty: newQty,
          unitPrice: applyVolumePricing(baseUnitPrice, volumeTiers, design.product.id, newQty),
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
  customerId: string | null = null,
): Promise<CartDetail> {
  if (qty < 0 || qty > MAX_QTY_PER_ITEM) throw new CartError("QTY_INVALID");
  const cart = await findCartBySession(sessionId);
  if (!cart) throw new CartError("ITEM_NOT_FOUND");
  assertCartIdentity(cart, customerId);
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw new CartError("ITEM_NOT_FOUND");

  if (qty === 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
  } else {
    // Tope efectivo min(99, stock) con SEMÁNTICA DE CLAMP (2026-09-29): el set
    // absoluto se topa al stock real de la variante (el stepper UI ya capa el
    // "+", pero la action es un endpoint POST invocable directo — defensa en
    // profundidad server-side). Si el clamp deja la qty igual a la actual,
    // aplica igual (no-op). Solo se rechaza cuando no hay margen alguno: la
    // variante quedó agotada con la línea en vuelo.
    if (item.variant.stock <= 0) {
      throw new CartError(
        "STOCK_UNAVAILABLE",
        `«${item.variant.product.name}» está agotado por ahora.`,
      );
    }
    const newQty = Math.min(qty, item.variant.stock);
    // Re-priceo por volumen (2026-10-02): cruzar un umbral de WholesaleTier al
    // cambiar la qty debe cambiar el unitPrice de la línea (bajar al subir de
    // nivel, volver al base al quedar por debajo). El base se recalcula con el
    // precio VIGENTE (mismo cálculo del alta, currentLineBaseUnitPrice) porque
    // el tier es absoluto y solo es comparable contra el precio actual.
    // Si el producto NO tiene niveles configurados, el snapshot queda intacto
    // (semántica legacy: un cambio de qty nunca tocaba el precio exhibido).
    // Líneas inconsistentes (base null) conservan su snapshot.
    let unitPrice = item.unitPrice;
    const baseUnitPrice = currentLineBaseUnitPrice(item);
    if (baseUnitPrice !== null) {
      const volumeTiers = await loadActiveVolumeTiers(item.variant.product.id);
      if (volumeTiers.length > 0) {
        unitPrice = applyVolumePricing(baseUnitPrice, volumeTiers, item.variant.product.id, newQty);
      }
    }
    await prisma.cartItem.update({
      where: { id: itemId },
      data: { qty: newQty, unitPrice },
    });
  }
  const reloaded = await findCartBySession(sessionId);
  return toDetail(reloaded!);
}

export async function removeCartItem(
  sessionId: string,
  itemId: string,
  customerId: string | null = null,
): Promise<CartDetail> {
  return updateCartItemQty(sessionId, itemId, 0, customerId);
}

// ─────────────────────────────────────────────────────────────────────
// Merge on login — invocado desde loginAction y verifyOtpAction.
// ─────────────────────────────────────────────────────────────────────
//
// Estrategia:
//   - Si anon cart NO existe → nada que hacer con el carrito (los borradores
//     se adoptan igual: un draft puede existir sin carrito).
//   - Si customer no tiene cart previo → setear customerId en el anon
//     (carta-misma, recibe a su nuevo dueño).
//   - Si ambos existen → merge inteligente: folder items del anon en
//     el cart del customer sumando qty por variantId; soft-delete anon.
//   - En ambos caminos los Designs anónimos referenciados por los items se
//     ADOPTAN (customerId set, sessionId limpio) — ver adoptSessionDesigns.
//   - Además TODOS los DRAFT anónimos con progreso real de la sesión se
//     adoptan al inicio (ver adoptAnonDraftDesigns) — sin esto un borrador
//     que nunca llegó al carrito quedaba huérfano tras el login.
//
// Retorna el sessionId que debería quedar en la cookie del usuario
// (puede ser el del cart del customer si existía uno previo).

/**
 * Adopta los diseños anónimos referenciados por los items del carrito que se está
 * mergeando: el CartItem pasa al customer en el login pero el Design seguía con el
 * sessionId anónimo (customerId null) → al dar «Editar» estando logueado,
 * getOwnedDesign({customerId, sessionId: null}) no lo encontraba y el Estudio abría
 * vacío. El guard doble del where (sessionId exacto + customerId null) garantiza que
 * un CartItem solo puede transferir diseños de ESTA sesión anónima, nunca ajenos.
 */
async function adoptSessionDesigns(
  tx: Pick<typeof prisma, "design">,
  opts: { designIds: (string | null)[]; anonSessionId: string; customerId: string },
): Promise<void> {
  const ids = opts.designIds.filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return;
  await tx.design.updateMany({
    where: { id: { in: ids }, sessionId: opts.anonSessionId, customerId: null },
    data: { customerId: opts.customerId, sessionId: null },
  });
}

/**
 * Versión sesión→sesión de adoptSessionDesigns (recuperación de carrito abandonado,
 * mergeCartsAdopt): los items del carrito `source` se foldan en el `target` pero los
 * Designs seguían con el sessionId del source (que se borra en el mismo fold) → al dar
 * «Editar» con la cookie del target, getOwnedDesign no los encontraba y el Estudio
 * abría vacío. Mismo guard anti-adopción-ajena (sessionId exacto del origen +
 * customerId null): un CartItem solo puede arrastrar diseños anónimos de ESTA sesión,
 * nunca ajenos ni de un customer. El design conserva customerId null: si el cliente
 * se loguea después, mergeAnonCartIntoCustomer lo adopta por la vía de siempre.
 */
async function retargetSessionDesigns(
  tx: Pick<typeof prisma, "design">,
  opts: { designIds: (string | null)[]; fromSessionId: string; toSessionId: string },
): Promise<void> {
  const ids = opts.designIds.filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return;
  await tx.design.updateMany({
    where: { id: { in: ids }, sessionId: opts.fromSessionId, customerId: null },
    data: { sessionId: opts.toSessionId },
  });
}

/**
 * Adopta TODOS los borradores (DRAFT) con progreso real de la sesión anónima al
 * hacer login — no solo los referenciados por ítems del carrito. Un borrador que
 * nunca se agregó al carrito quedaba HUÉRFANO: el server del Estudio resuelve el
 * owner como { customerId, sessionId: null } para logueados, así que
 * getOwnedDesign no lo encontraba y «Continuar donde quedaste» arrancaba vacío.
 * El progreso real se decide con designHasMeaningfulProgress (misma regla de la
 * poda de drafts): los drafts vacíos que el Estudio crea en cada boot NO se
 * adoptan (siguen anónimos y los reclama la purga por edad).
 * Mismo guard anti-adopción-ajena que adoptSessionDesigns (sessionId exacto +
 * customerId null, repetido en el updateMany): solo diseños anónimos de ESTA
 * sesión cambian de dueño. Solo toca ownership (customerId/sessionId) — nunca
 * assets ni bytes compartidos (ADR-152).
 */
async function adoptAnonDraftDesigns(
  tx: Pick<typeof prisma, "design">,
  opts: { anonSessionId: string; customerId: string },
): Promise<void> {
  const drafts = await tx.design.findMany({
    where: { sessionId: opts.anonSessionId, customerId: null, status: "DRAFT" },
    select: { id: true, canvasData: true, metadata: true },
  });
  const ids = drafts
    .filter((d) => designHasMeaningfulProgress({ canvasData: d.canvasData, metadata: d.metadata }))
    .map((d) => d.id);
  if (ids.length === 0) return;
  await tx.design.updateMany({
    where: { id: { in: ids }, sessionId: opts.anonSessionId, customerId: null },
    data: { customerId: opts.customerId, sessionId: null },
  });
}

export async function mergeAnonCartIntoCustomer(
  anonSessionId: string,
  customerId: string,
): Promise<string> {
  const [anonCart, customerCart] = await Promise.all([
    findCartBySession(anonSessionId),
    findCartByCustomer(customerId),
  ]);

  // Una cookie vieja de otra cuenta nunca se adopta ni se reasigna. Se devuelve
  // un contexto seguro para que el caller rote la cookie sin tocar ese carrito.
  if (anonCart?.customerId && anonCart.customerId !== customerId) {
    return customerCart?.sessionId ?? randomUUID();
  }

  // Adopción de borradores ANTES de cualquier early-return: un draft puede
  // existir sin carrito (nunca se agregó) y también debe sobrevivir al login.
  // Fuera del guard de carrito ajeno de arriba a propósito: si el carrito de la
  // sesión es de otra cuenta, la sesión entera se trata como ajena y nada se
  // adopta.
  await adoptAnonDraftDesigns(prisma, { anonSessionId, customerId });

  if (!anonCart) return customerCart?.sessionId ?? anonSessionId;
  if (anonCart.customerId === customerId || customerCart?.id === anonCart.id) {
    return anonSessionId;
  }

  if (anonCart.items.length === 0) {
    if (customerCart) {
      await prisma.cart.deleteMany({
        where: { id: anonCart.id, customerId: null, items: { none: {} } },
      });
      return customerCart.sessionId;
    }
    await prisma.cart.update({ where: { id: anonCart.id }, data: { customerId } });
    return anonSessionId;
  }

  if (!customerCart) {
    await prisma.$transaction(async (tx) => {
      await tx.cart.update({ where: { id: anonCart.id }, data: { customerId } });
      await adoptSessionDesigns(tx, {
        designIds: anonCart.items.map((i) => i.designId),
        anonSessionId,
        customerId,
      });
    });
    return anonSessionId;
  }

  await prisma.$transaction(async (tx) => {
    for (const anonItem of anonCart.items) {
      const dup = customerCart.items.find((i) => sameLineContent(i, anonItem));
      if (dup) {
        const mergedQty = dup.qty + anonItem.qty;
        if (mergedQty <= MAX_QTY_PER_ITEM) {
          await tx.cartItem.update({ where: { id: dup.id }, data: { qty: mergedQty } });
        } else {
          await tx.cartItem.update({ where: { id: dup.id }, data: { qty: MAX_QTY_PER_ITEM } });
          await tx.cartItem.create({
            data: {
              cartId: customerCart.id,
              variantId: anonItem.variantId,
              qty: mergedQty - MAX_QTY_PER_ITEM,
              unitPrice: anonItem.unitPrice,
              customDesign: anonItem.customDesign ?? undefined,
              designId: anonItem.designId ?? undefined,
            },
          });
        }
      } else {
        await tx.cartItem.create({
          data: {
            cartId: customerCart.id,
            variantId: anonItem.variantId,
            qty: anonItem.qty,
            unitPrice: anonItem.unitPrice,
            customDesign: anonItem.customDesign ?? undefined,
            designId: anonItem.designId ?? undefined,
          },
        });
      }
    }
    await adoptSessionDesigns(tx, {
      designIds: anonCart.items.map((i) => i.designId),
      anonSessionId,
      customerId,
    });
    await tx.cartItem.deleteMany({ where: { cartId: anonCart.id } });
    await tx.cart.delete({ where: { id: anonCart.id } });
  });

  return customerCart.sessionId;
}

/**
 * Login SIN cookie de carrito anónimo (el logout la borra — app/auth/logout):
 * devuelve el sessionId del carrito VIVO más reciente del cliente para que el
 * caller lo escriba en `cart_session` y el carrito reaparezca al re-entrar.
 * Sin esto, el primer addToCart tras el re-login mintaba un UUID nuevo y creaba
 * un SEGUNDO Cart para el mismo customer (el viejo quedaba huérfano hasta la
 * purga de 60 días).
 *
 * `null` cuando no hay nada recuperable (sin carrito, soft-deleted — lo filtra
 * la query — o vacío): el caller NO escribe cookie y el flujo normal minta una
 * sesión fresca en el primer add.
 */
export async function recoverCustomerCartSessionId(customerId: string): Promise<string | null> {
  const cart = await findCartByCustomer(customerId);
  if (!cart || cart.items.length === 0) return null;
  return cart.sessionId;
}

/**
 * #18 — Adopta el carrito `source` DENTRO del `target` (fold de items, SIN pérdida) y borra el source.
 * Se usa al recuperar un carrito abandonado por link: se folda el carrito ACTUAL (source) en el
 * recuperado (target) para NO pisar lo que el cliente ya tenía. Mismo fold que mergeAnonCartIntoCustomer
 * (Paquete H: agrupa por CONTENIDO — variante + identidad del diseño — cap MAX_QTY_PER_ITEM). Se folda
 * hacia el target para preservar el FK AbandonedCart.cartId del carrito recuperado.
 * Los diseños anónimos referenciados por los items movidos se RE-SESIÓNAN al target
 * (retargetSessionDesigns, mismo guard que adoptSessionDesigns) — si no, quedaban con el
 * sessionId del source ya borrado y «Editar» desde el carrito abría el Estudio vacío.
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
  if (source.customerId && source.customerId !== target.customerId) {
    throw new CartError("CART_IDENTITY_MISMATCH");
  }
  await prisma.$transaction(async (tx) => {
    for (const it of source.items) {
      const dup = target.items.find((t) => sameLineContent(t, it));
      if (dup) {
        const mergedQty = dup.qty + it.qty;
        if (mergedQty <= MAX_QTY_PER_ITEM) {
          await tx.cartItem.update({ where: { id: dup.id }, data: { qty: mergedQty } });
        } else {
          await tx.cartItem.update({ where: { id: dup.id }, data: { qty: MAX_QTY_PER_ITEM } });
          await tx.cartItem.create({
            data: {
              cartId: target.id,
              variantId: it.variantId,
              qty: mergedQty - MAX_QTY_PER_ITEM,
              unitPrice: it.unitPrice,
              customDesign: it.customDesign ?? undefined,
              designId: it.designId ?? undefined,
            },
          });
        }
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
    // Los diseños anónimos referenciados por los items movidos siguen al carrito
    // destino (misma transacción: si el fold falla, ningún diseño cambia a medias).
    await retargetSessionDesigns(tx, {
      designIds: source.items.map((i) => i.designId),
      fromSessionId: sourceSessionId,
      toSessionId: targetSessionId,
    });
    await tx.cartItem.deleteMany({ where: { cartId: source.id } });
    await tx.cart.delete({ where: { id: source.id } });
  });
}
