/*
 * getCheckoutTexts — resuelve SERVER-SIDE los textos CMS del checkout
 * (roadmap B8): UNA query por prefijo `checkout.*` (kind BLOCK, publicado,
 * versión publicada) y sobreescribe el DEFAULT campo a campo. Cualquier campo
 * faltante/sin publicar, o la DB caída, deja el default exacto pre-CMS
 * (REGLA DE ORO) — mismo patrón que getAuthTexts (B7) y getAccountTexts (B9).
 *
 * Cache: `unstable_cache` con tag global "cms" (publicar en /admin/contenido
 * lo invalida vía updateTag). El guard E469 ejecuta la query cruda fuera de
 * un request de Next (scripts, tests).
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CHECKOUT_TEXT_KEYS, DEFAULT_CHECKOUT_TEXTS, type CheckoutTexts } from "./checkout-texts";

async function fetchCheckoutBodies(): Promise<Record<string, string>> {
  try {
    const fields = await prisma.cmsField.findMany({
      where: {
        kind: "BLOCK",
        isPublished: true,
        deletedAt: null,
        key: { startsWith: "checkout." },
      },
      include: { publishedVersion: true },
    });
    const bodies: Record<string, string> = {};
    for (const f of fields) {
      if (f.publishedVersion) bodies[f.key] = f.publishedVersion.body;
    }
    return bodies;
  } catch {
    // DB inalcanzable (build con placeholder, red caída) → {} → defaults completos.
    return {};
  }
}

const cachedCheckoutBodies = unstable_cache(fetchCheckoutBodies, ["checkout-texts"], {
  tags: ["cms"],
  revalidate: 3600,
});

async function loadBodiesSafe(): Promise<Record<string, string>> {
  try {
    return await cachedCheckoutBodies();
  } catch (err) {
    // Next 16 sin incrementalCache (fuera de un request/render) lanza el invariante
    // E469: ejecutar la query cruda (mismo guard que lib/cms.ts).
    const code = (err as { __NEXT_ERROR_CODE?: string } | null)?.__NEXT_ERROR_CODE;
    if (code === "E469" || (err instanceof Error && err.message.includes("incrementalCache"))) {
      return fetchCheckoutBodies();
    }
    return {};
  }
}

function setPath(target: Record<string, unknown>, path: string, value: string) {
  const [section, prop] = path.split(".");
  const bucket = target[section] as Record<string, string> | undefined;
  if (bucket && typeof bucket[prop] === "string") bucket[prop] = value;
}

export async function getCheckoutTexts(): Promise<CheckoutTexts> {
  const bodies = await loadBodiesSafe();
  // structuredClone: nunca mutar el DEFAULT compartido entre requests.
  const texts = structuredClone(DEFAULT_CHECKOUT_TEXTS) as CheckoutTexts;
  for (const [path, cmsKey] of Object.entries(CHECKOUT_TEXT_KEYS)) {
    const body = bodies[cmsKey];
    if (typeof body === "string" && body.length > 0) {
      setPath(texts as unknown as Record<string, unknown>, path, body);
    }
  }
  return texts;
}
