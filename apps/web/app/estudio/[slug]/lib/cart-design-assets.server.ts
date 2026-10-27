import "server-only";

/*
 * AssetIds usados en OTRAS líneas del carrito del mismo producto (2026-10-26).
 *
 * Bug del "segundo pack": el cliente ya tiene un pack de 6 en el carrito, abre
 * el Estudio para otro y «Mis fotos» muestra también las fotos anteriores —
 * el auto-fill las ponía primero y el nuevo pack salía repetido. La página del
 * Estudio resuelve acá qué assets ya usa el carrito (session o customer
 * actual, mismo producto) y el store los BAJA de prioridad en el auto-fill
 * (ver orderAssetsForAutoFill en lib/store.ts) — nunca los excluye.
 */

import { prisma } from "@/lib/db";

/**
 * AssetIds referenciados por un canvasData (slots: foto principal y foto de
 * perfil IG). Puro y defensivo: el canvas es JSON libre de la DB.
 */
export function collectCanvasAssetIds(canvasData: unknown): string[] {
  const slots = (canvasData as { slots?: unknown } | null)?.slots;
  if (!Array.isArray(slots)) return [];
  const ids = new Set<string>();
  for (const slot of slots) {
    const s = slot as { assetId?: unknown; profileAssetId?: unknown } | null;
    if (typeof s?.assetId === "string" && s.assetId !== "") ids.add(s.assetId);
    if (typeof s?.profileAssetId === "string" && s.profileAssetId !== "") {
      ids.add(s.profileAssetId);
    }
  }
  return [...ids];
}

/**
 * AssetIds usados por los designs de las líneas del carrito del dueño actual
 * (sessionId de la cookie y/o customerId) cuyo producto es `productId`.
 * `excludeDesignIds` (p.ej. el diseño que se está editando vía ?designId=) no
 * cuentan como "otras líneas".
 */
export async function listCartDesignAssetIdsInUse(opts: {
  sessionId: string | null;
  customerId: string | null;
  productId: string;
  excludeDesignIds?: readonly string[];
}): Promise<string[]> {
  const or = [
    ...(opts.sessionId ? [{ sessionId: opts.sessionId }] : []),
    ...(opts.customerId ? [{ customerId: opts.customerId }] : []),
  ];
  if (or.length === 0) return [];
  const exclude = new Set(opts.excludeDesignIds ?? []);
  const carts = await prisma.cart.findMany({
    where: { deletedAt: null, OR: or },
    select: {
      items: {
        select: {
          design: { select: { id: true, productId: true, canvasData: true } },
        },
      },
    },
  });
  const ids = new Set<string>();
  for (const cart of carts) {
    for (const item of cart.items) {
      if (item.design && !exclude.has(item.design.id) && item.design.productId === opts.productId) {
        for (const id of collectCanvasAssetIds(item.design.canvasData)) ids.add(id);
      }
    }
  }
  return [...ids];
}
