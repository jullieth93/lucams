/*
 * Utilidad E2E (auditoría 2026-11-08) — invalidación del tag "catalog".
 *
 * Los fixtures de Playwright crean y borran productos DIRECTO en la DB
 * (tests/e2e/fixtures/data-factory.ts), sin pasar por las server actions que
 * llaman updateTag("catalog") — y el proxy 404 de PDP (SEO-001) decide contra
 * el set CACHEADO de slugs vivos (getStorefrontProductSlugs, tag "catalog").
 * Resultado: un producto de test recién creado caía en un falso 404 del proxy
 * hasta que vencía el TTL de la caché.
 *
 * Gate: la ruta solo responde si E2E_UTILS_TOKEN está definida en el servidor
 * y el header x-e2e-utils-token coincide (comparación timing-safe). Sin la env
 * la ruta devuelve 404 como si no existiera — en PRD la variable NUNCA se
 * configura.
 */

import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const expected = process.env.E2E_UTILS_TOKEN;
  if (!expected) return new Response("Not found", { status: 404 });
  if (!tokenMatches(req.headers.get("x-e2e-utils-token") ?? "", expected)) {
    return new Response("Not found", { status: 404 });
  }
  // Next 16: updateTag es solo para Server Actions; en un Route Handler es
  // revalidateTag. `{ expire: 0 }` = sin ventana stale-while-revalidate: el
  // PRÓXIMO request relee el set de slugs (el test no puede permitirse un 404
  // en falso por una revalidación en segundo plano).
  revalidateTag("catalog", { expire: 0 });
  return Response.json({ ok: true, tag: "catalog" });
}
