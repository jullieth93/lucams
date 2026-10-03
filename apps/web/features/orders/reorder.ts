/*
 * "Volver a pedir" (reorder) — Paquete I, 2026-10-02.
 *
 * Reconstruye el carrito desde un pedido anterior, ítem a ítem, a PRECIO VIGENTE
 * (nunca al snapshot: los add*ToCart recalculan server-side). Cuatro destinos por ítem:
 *
 *   1. SIN personalización (incluye plantillas PREMADE, que se compran tal cual):
 *      addProductToCart con la variante viva → precio actual + clamp de stock. Si el
 *      producto/variante fue retirado o está agotado → "noDisponibles".
 *   2. PERSONALIZADO con fotos vivas (Design USED_IN_ORDER, purgedAt null): se clona con
 *      cloneDesignForReorder (copia de BYTES de fotos + renders, remap de ids) y entra con
 *      addPersonalizedToCart sobre la MISMA variante del pedido original.
 *   3. PERSONALIZADO purgado (≥90 días de entregado — retention-delivered.ts borró los
 *      bytes por privacidad, Ley 1581) o con el Design borrado: NO se puede reimprimir →
 *      "requierenFotos" con CTA al Estudio del producto (slug de la variante; con
 *      ?template=<slug> cuando el ítem conserva su plantilla).
 *   4. Producto/variante retirado o variante sin stock: skip con aviso ("noDisponibles").
 *
 * Autorización: cada entry point resuelve el pedido CON su prueba de propiedad (customerId
 * propio para registrados, hash del token público para invitados — mismo criterio que
 * /pedido/[token]). Un pedido que no matchea devuelve null (indistinguible de inexistente).
 */

import "server-only";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hashBearerToken } from "@/lib/token-hash";
import { addPersonalizedToCart, addProductToCart, CartError } from "@/features/cart/service";
import { cloneDesignForReorder } from "@/features/personalization/service";
import type { ReorderSummary } from "./reorder-types";

// Re-export para los consumidores server (actions); los client components usan reorder-types.
export type { ReorderActionState, ReorderSummary } from "./reorder-types";

const reorderItemsInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        select: {
          id: true,
          name: true,
          product: { select: { slug: true, name: true, isActive: true, deletedAt: true } },
        },
      },
      design: { select: { id: true, status: true, purgedAt: true } },
      template: { select: { slug: true } },
    },
  },
} satisfies Prisma.OrderInclude;

type ReorderOrder = Prisma.OrderGetPayload<{ include: typeof reorderItemsInclude }>;

/** CTA al Estudio para rehacer un diseño purgado (con plantilla de partida si sobrevivió). */
function studioUrlFor(item: ReorderOrder["items"][number]): string {
  const base = `/estudio/${item.variant.product.slug}`;
  return item.template?.slug ? `${base}?template=${item.template.slug}` : base;
}

function cartErrorReason(err: unknown): string {
  if (err instanceof CartError) {
    if (err.detail) return err.detail;
    switch (err.code) {
      case "STOCK_UNAVAILABLE":
        return "Se agotó por ahora.";
      case "QTY_INVALID":
        return "La cantidad del pedido original ya no es válida.";
      default:
        return "Ya no está disponible.";
    }
  }
  return "Ya no está disponible.";
}

async function reorderLoadedOrder(
  order: ReorderOrder,
  opts: { sessionId: string; customerId: string | null },
): Promise<ReorderSummary> {
  const summary: ReorderSummary = { added: [], needsPhotos: [], unavailable: [] };

  for (const it of order.items) {
    const productName = it.variant.product.name;

    // Caso 4 — producto retirado del catálogo: ni la variante ni el diseño sirven.
    if (!it.variant.product.isActive || it.variant.product.deletedAt) {
      summary.unavailable.push({ productName, reason: "Ya no está a la venta." });
      continue;
    }

    // Caso 1 — sin personalización (o plantilla PREMADE, que se compra tal cual).
    if (!it.designId) {
      try {
        const cart = await addProductToCart({
          sessionId: opts.sessionId,
          customerId: opts.customerId,
          productSlug: it.variant.product.slug,
          qty: it.qty,
          variantId: it.variantId,
        });
        // El precio VIGENTE lo fijó el service (variant.price ?? basePrice).
        const currentUnitPrice =
          cart.items.find((i) => i.variantId === it.variantId)?.unitPrice ?? it.unitPrice;
        summary.added.push({
          productName,
          qty: it.qty,
          unitPrice: currentUnitPrice,
          previousUnitPrice: it.unitPrice,
        });
      } catch (err) {
        summary.unavailable.push({ productName, reason: cartErrorReason(err) });
      }
      continue;
    }

    // Casos 2/3 — personalizado.
    const design = it.design;
    if (!design || design.purgedAt || design.status !== "USED_IN_ORDER") {
      // Caso 3 — bytes borrados por retención (privacidad) o diseño inexistente: las fotos
      // hay que subirlas de nuevo; el Estudio arranca con la plantilla si la hay.
      summary.needsPhotos.push({ productName, studioUrl: studioUrlFor(it) });
      continue;
    }
    // Caso 2 — fotos y renders vivos: clonar (copia de bytes) y agregar al carrito.
    const clone = await cloneDesignForReorder(design.id, {
      customerId: opts.customerId,
      sessionId: opts.sessionId,
    });
    if (!clone) {
      summary.unavailable.push({
        productName,
        reason: "No pudimos reutilizar tu diseño esta vez. Intenta de nuevo en unos minutos.",
      });
      continue;
    }
    try {
      const cart = await addPersonalizedToCart({
        sessionId: opts.sessionId,
        customerId: opts.customerId,
        designId: clone.id,
        qty: it.qty,
        variantId: it.variantId,
      });
      // Precio VIGENTE de la línea (puede haberse agrupado con un gemelo idéntico —
      // misma variante + mismo contenido — en cuyo caso el designId de la línea es
      // el del gemelo, no el del clon; se cae al lookup por variante).
      const currentUnitPrice =
        cart.items.find((i) => i.designId === clone.id)?.unitPrice ??
        cart.items.find((i) => i.variantId === it.variantId)?.unitPrice ??
        it.unitPrice;
      summary.added.push({
        productName,
        qty: it.qty,
        unitPrice: currentUnitPrice,
        previousUnitPrice: it.unitPrice,
      });
    } catch (err) {
      summary.unavailable.push({ productName, reason: cartErrorReason(err) });
    }
  }

  logger.info({
    event: "orders.reorder.done",
    orderId: order.id,
    customerId: opts.customerId,
    added: summary.added.length,
    needsPhotos: summary.needsPhotos.length,
    unavailable: summary.unavailable.length,
  });
  return summary;
}

/**
 * Reorder desde /mi-cuenta (registrado): el pedido debe ser del customer logueado.
 * Devuelve null si no existe o no es suyo (indistinguible — como notFound()).
 */
export async function reorderRegisteredOrder(opts: {
  orderNumber: string;
  customerId: string;
  sessionId: string;
}): Promise<ReorderSummary | null> {
  const order = await prisma.order.findFirst({
    where: { number: opts.orderNumber, customerId: opts.customerId, deletedAt: null },
    include: reorderItemsInclude,
  });
  if (!order) return null;
  return reorderLoadedOrder(order, { sessionId: opts.sessionId, customerId: opts.customerId });
}

/**
 * Reorder desde /pedido/[token] (invitado): el token público ES la autorización (mismo
 * lookup por hash que la página). El carrito/diseños clonados quedan a nombre de la
 * sesión actual (o del customer si además está logueado).
 */
export async function reorderGuestOrder(opts: {
  token: string;
  sessionId: string;
  customerId: string | null;
}): Promise<ReorderSummary | null> {
  // Mismo anti-fuzzing que la página: 32 hex chars antes de tocar la DB.
  if (!/^[a-f0-9]{32}$/.test(opts.token)) return null;
  const order = await prisma.order.findFirst({
    where: { publicAccessTokenHash: hashBearerToken(opts.token), deletedAt: null },
    include: reorderItemsInclude,
  });
  if (!order) return null;
  return reorderLoadedOrder(order, { sessionId: opts.sessionId, customerId: opts.customerId });
}
