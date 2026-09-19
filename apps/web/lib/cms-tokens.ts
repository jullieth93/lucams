/*
 * resolveCmsTokens — tokens canónicos en contenido CMS (Ruta A+, 2026-07-29).
 *
 * Problema que resuelve (reportado por Lucy): la misma promesa ("despacho en
 * máx. N días hábiles + tránsito estimado de la transportadora", "1.100+
 * destinos") estaba DUPLICADA literal en bloques, fallbacks y settings —
 * editar un lugar no movía los demás, y la setting "Tiempo de fabricación"
 * ni siquiera tenía lectores. (2026-08-01: la promesa pasó de "entregamos en
 * máx. 3 días" a despacho + tránsito del courier — NUNCA se promete fecha de
 * entrega total, el tránsito no lo controlamos nosotros. 2026-09-11: Lucy
 * confirma que el despacho real es MÁX. 2 DÍAS — el catálogo traía 3 de default
 * y se bajó a 2; el tránsito declarado es el rango del operador, "2 a 5".)
 *
 * Diseño: los valores viven UNA vez en SiteSettings (COMMERCE) y el
 * contenido referencia tokens en vez de números literales:
 *
 *   {{fab}}      → PRODUCTION_DAYS_DEFAULT  (días hábiles de fabricación)
 *   {{entrega}}  → DELIVERY_DAYS_ESTIMATE   (rango de días de tránsito, ej. "2 a 5")
 *   {{total}}    → fab + entrega (calculado; con rango usa el mínimo)
 *   {{cobertura}}→ DELIVERY_COVERAGE_COUNT  ("1.100+")
 *   {{ciudad}}   → ctx.city (solo si el caller la pasa; si no, queda literal)
 *
 * Emails de contacto/legal (Fase 3C, 2026-09-18): los documentos legales
 * (packages/db/legal-content/*.md y sus fallbacks en app/legal/*) referencian
 * tokens en vez de correos literales, así Lucy los cambia desde «Ajustes del
 * sitio» sin tocar código ni republicar los 8 textos:
 *
 *   {{email_contacto}}    → CONTACT_EMAIL      (hola@lucamsshop.com)
 *   {{email_habeas_data}} → HABEAS_DATA_EMAIL  (habeas-data@lucamsshop.com)
 *   {{email_retracto}}    → RETRACTO_EMAIL     (retracto@lucamsshop.com)
 *   {{email_security}}    → SECURITY_EMAIL     (security@lucamsshop.com)
 *
 * Se aplica en <CmsText>/<CmsMarkdown> sobre body Y fallback (los fallbacks
 * de código también pueden usar tokens). Tokens desconocidos quedan intactos.
 */

import "server-only";
import { getSettingValue, getCmsBlock } from "@/lib/cms";

export async function resolveCmsTokens(text: string, ctx?: { city?: string }): Promise<string> {
  if (!text.includes("{{")) return text;
  const [
    fabRaw,
    entregaRaw,
    cobertura,
    emailContacto,
    emailHabeasData,
    emailRetracto,
    emailSecurity,
  ] = await Promise.all([
    getSettingValue("PRODUCTION_DAYS_DEFAULT", "2"),
    getSettingValue("DELIVERY_DAYS_ESTIMATE", "2 a 5"),
    getSettingValue("DELIVERY_COVERAGE_COUNT", "1.100+"),
    getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.com"),
    getSettingValue("HABEAS_DATA_EMAIL", "habeas-data@lucamsshop.com"),
    getSettingValue("RETRACTO_EMAIL", "retracto@lucamsshop.com"),
    getSettingValue("SECURITY_EMAIL", "security@lucamsshop.com"),
  ]);
  const fab = Number.parseInt(fabRaw, 10);
  const entrega = Number.parseInt(entregaRaw, 10);
  const total = String((Number.isNaN(fab) ? 2 : fab) + (Number.isNaN(entrega) ? 2 : entrega));
  const out = text
    .replaceAll("{{total}}", total)
    .replaceAll("{{fab}}", fabRaw)
    .replaceAll("{{entrega}}", entregaRaw)
    .replaceAll("{{cobertura}}", cobertura)
    .replaceAll("{{email_contacto}}", emailContacto)
    .replaceAll("{{email_habeas_data}}", emailHabeasData)
    .replaceAll("{{email_retracto}}", emailRetracto)
    .replaceAll("{{email_security}}", emailSecurity);
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
