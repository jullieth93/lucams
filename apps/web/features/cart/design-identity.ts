import "server-only";

/*
 * ¿Son "exactamente el mismo diseño" dos diseños distintos? (Lucy, 2026-07-25)
 *
 * Cada pasada por el Estudio crea un `Design` con su propio id, así que dos pedidos idénticos daban
 * dos líneas de carrito idénticas: en la cotización de Lucy salieron dos «1× Abecedario Completo
 * (Español · 5×7 cm · Con imán)» seguidas, que se lee como un error de la tienda. Su regla:
 *
 *   · mismo producto + misma variante + mismo diseño  → UNA línea con cantidad 2
 *   · cambia la variante (color, tamaño, piezas)      → líneas separadas
 *
 * La variante ya la distingue `variantId`; lo que falta es comparar el CONTENIDO del diseño. Esto
 * calcula una huella estable de lo que define la identidad VISUAL, y solo de eso.
 *
 * Por qué lista NEGRA y no lista blanca. Se hashea el canvas completo quitando lo que se sabe que no
 * es identidad. Al revés —enumerar los campos que sí cuentan— cualquier campo nuevo (un filtro, un
 * marco, una opción de texto) quedaría fuera del hash por omisión y dos diseños DISTINTOS se
 * fusionarían en silencio: el cliente recibiría dos veces lo mismo. El modo de falla de la lista
 * negra es el contrario y es el seguro: si sobra algo variable, no agrupa, que es como está hoy.
 *
 * Lo que se excluye y por qué:
 *   · `assetUrl` — es una URL FIRMADA: lleva un token en la query que caduca y cambia en cada
 *     lectura. Dos diseños idénticos tendrían URLs distintas. El `assetId` sí queda dentro.
 *   · claves de tiempo (`updatedAt`, `savedAt`…) — cambian solas.
 *
 * Limitación conocida y aceptada: si el cliente vuelve a SUBIR la misma foto, se guarda como un
 * asset nuevo con otro id, así que su huella cambia y no agrupa. Los productos de foto solo agrupan
 * cuando se reutiliza el mismo asset. Falla hacia el lado seguro (dos líneas, como hoy) y se
 * resuelve el día que los assets tengan hash de bytes.
 */

import crypto from "node:crypto";
import type { Prisma } from "@lucams/db";

/** Claves que NO forman parte de la identidad visual, a cualquier profundidad. */
const IGNORADAS = new Set(["assetUrl", "updatedAt", "createdAt", "savedAt", "url", "signedUrl"]);

/**
 * Copia canónica de un valor JSON: claves de objeto ordenadas (para que el orden de serialización
 * no cambie la huella) y sin las claves ignoradas. Los arrays conservan su orden, que sí es
 * identidad — los slots están indexados y "foto A arriba, foto B abajo" no es lo mismo que al revés.
 */
function canonicalizar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizar);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (IGNORADAS.has(k)) continue;
      if (src[k] === undefined) continue;
      out[k] = canonicalizar(src[k]);
    }
    return out;
  }
  // -0 y 0 son el mismo encuadre; JSON.stringify los distingue.
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

/**
 * Huella del contenido visual de un diseño. Dos diseños con la misma huella producen exactamente el
 * mismo archivo de imprenta.
 */
export function designIdentity(design: {
  productId: string;
  canvasData: Prisma.JsonValue;
  metadata?: Prisma.JsonValue | null;
}): string {
  const payload = {
    // El producto entra en la huella aunque la variante ya lo acote: dos productos distintos nunca
    // son el mismo diseño, por parecidos que sean sus canvas.
    productId: design.productId,
    canvas: canonicalizar(design.canvasData),
    metadata: canonicalizar(design.metadata ?? null),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Lo mínimo que una línea de carrito/pedido necesita para compararse por CONTENIDO
 * (Paquete H, 2026-10-02): la variante y, si es personalizada, el diseño con lo
 * que alimenta designIdentity.
 */
export type LineIdentity = {
  variantId: string;
  designId: string | null;
  design?: {
    productId: string;
    canvasData: Prisma.JsonValue;
    metadata?: Prisma.JsonValue | null;
  } | null;
};

/**
 * ¿Dos líneas son la MISMA compra? (Paquete H — la regla de Lucy de
 * addPersonalizedToCart, generalizada a los merges y al snapshot de la orden):
 *
 *   · variantId distinto                          → NO (otra opción de compra)
 *   · ninguna con diseño                          → SÍ (catálogo simple, sumar qty)
 *   · mismo designId                              → SÍ
 *   · designId distinto, MISMO contenido visual   → SÍ (dos pasadas idénticas
 *     por el Estudio crean dos Designs; al cliente se leen como una sola línea)
 *   · contenido distinto (o falta el diseño para  → NO (líneas separadas)
 *     compararlo)
 *
 * Falla hacia el lado seguro: si no se puede probar identidad, NO agrupa.
 */
export function sameLineContent(a: LineIdentity, b: LineIdentity): boolean {
  if (a.variantId !== b.variantId) return false;
  if (!a.designId && !b.designId) return true;
  if (a.designId && b.designId) {
    if (a.designId === b.designId) return true;
    if (a.design && b.design) {
      return designIdentity(a.design) === designIdentity(b.design);
    }
  }
  return false;
}

/**
 * Consolida una lista de líneas sumando el qty de las que son la misma compra
 * (sameLineContent). Se conserva la PRIMERA línea de cada grupo — con el orden
 * habitual del carrito (createdAt asc) es la más vieja, la que el cliente vio
 * primero, y su diseño/preview es el que queda en la línea. Sin tope de qty:
 * consolidar no cambia el total comprado (el cap de 99 es del carrito, no del
 * pedido). Devuelve copias; no muta la entrada.
 */
export function consolidateIdenticalLines<T extends LineIdentity & { qty: number }>(
  items: readonly T[],
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const dup = out.find((o) => sameLineContent(o, item));
    if (dup) {
      dup.qty += item.qty;
    } else {
      out.push({ ...item });
    }
  }
  return out;
}
