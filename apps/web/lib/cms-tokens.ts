/*
 * resolveCmsTokens — tokens canónicos en contenido CMS (Ruta A+, 2026-07-29).
 *
 * Problema que resuelve (reportado por Lucy): la misma promesa ("3 días
 * hábiles = 2 fabricación + 1 entrega", "1.100+ destinos") estaba DUPLICADA
 * literal en bloques, fallbacks y settings — editar un lugar no movía los
 * demás, y la setting "Tiempo de fabricación" ni siquiera tenía lectores.
 *
 * Diseño: los valores viven UNA vez en SiteSettings (COMMERCE) y el
 * contenido referencia tokens en vez de números literales:
 *
 *   {{fab}}      → PRODUCTION_DAYS_DEFAULT  (días hábiles de fabricación)
 *   {{entrega}}  → DELIVERY_DAYS_ESTIMATE   (días hábiles de entrega estimado)
 *   {{total}}    → fab + entrega (calculado)
 *   {{cobertura}}→ DELIVERY_COVERAGE_COUNT  ("1.100+")
 *   {{ciudad}}   → ctx.city (solo si el caller la pasa; si no, queda literal)
 *
 * Se aplica en <CmsText>/<CmsMarkdown> sobre body Y fallback (los fallbacks
 * de código también pueden usar tokens). Tokens desconocidos quedan intactos.
 */

import "server-only";
import { getSettingValue, getCmsBlock } from "@/lib/cms";

export async function resolveCmsTokens(text: string, ctx?: { city?: string }): Promise<string> {
  if (!text.includes("{{")) return text;
  const [fabRaw, entregaRaw, cobertura] = await Promise.all([
    getSettingValue("PRODUCTION_DAYS_DEFAULT", "2"),
    getSettingValue("DELIVERY_DAYS_ESTIMATE", "1"),
    getSettingValue("DELIVERY_COVERAGE_COUNT", "1.100+"),
  ]);
  const fab = Number.parseInt(fabRaw, 10);
  const entrega = Number.parseInt(entregaRaw, 10);
  const total = String((Number.isNaN(fab) ? 2 : fab) + (Number.isNaN(entrega) ? 1 : entrega));
  const out = text
    .replaceAll("{{total}}", total)
    .replaceAll("{{fab}}", fabRaw)
    .replaceAll("{{entrega}}", entregaRaw)
    .replaceAll("{{cobertura}}", cobertura);
  return ctx?.city ? out.replaceAll("{{ciudad}}", ctx.city) : out;
}

/**
 * SEO por página estática (Ruta A, 2026-07-29): lee el bloque `seo.page.<nombre>`
 * (title = meta title, body = meta description) con fallback al valor hardcoded
 * y resolviendo tokens canónicos ({{cobertura}} etc.). Lucy los edita desde
 * /admin/contenido/paginas/seo sin tocar código. Vive acá (no en lib/cms) para no
 * crear un ciclo de imports cms ↔ cms-tokens.
 */
export async function getPageSeo(
  key: string,
  fallback: { title: string; description: string },
): Promise<{ title: string; description: string }> {
  const block = await getCmsBlock(key);
  return {
    title: await resolveCmsTokens(block?.title?.trim() || fallback.title),
    description: await resolveCmsTokens(block?.body?.trim() || fallback.description),
  };
}
