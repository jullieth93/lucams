/*
 * GET /api/cms/settings — devuelve todos los SiteSetting.
 *
 * Querystring opcional:
 *   ?category=CONTACT|BUSINESS|LEGAL|COMMERCE|SOCIAL|EXTERNAL|
 *            WHATSAPP|COPYRIGHT|SEO
 *
 * Endpoint público sin auth — los settings son configurables visibles
 * al usuario final (email contacto, horarios, redes, etc.).
 *
 * Cuidado: si en el futuro se agregan settings con info sensible (claves
 * API, secretos), filtrar acá antes de devolverlos.
 *
 * Rate-limit 30/min por IP. Cache HTTP 1 h.
 */

import { getAllSiteSettings, getSettingsByCategory, type SiteSettingCategory } from "@/lib/cms";
import { applyRateLimit, extractIp, withCmsCacheHeaders } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CATEGORIES: SiteSettingCategory[] = [
  "CONTACT",
  "BUSINESS",
  "LEGAL",
  "COMMERCE",
  "SOCIAL",
  "EXTERNAL",
  "WHATSAPP",
  "COPYRIGHT",
  "SEO",
];

export async function GET(req: Request): Promise<Response> {
  const ip = await extractIp();
  const limited = await applyRateLimit(ip);
  if (limited) return limited;

  const url = new URL(req.url);
  const rawCategory = url.searchParams.get("category");

  if (rawCategory) {
    const upper = rawCategory.toUpperCase();
    if (!VALID_CATEGORIES.includes(upper as SiteSettingCategory)) {
      return Response.json(
        {
          type: "https://lucamsshop.co/errors/invalid-category",
          title: "Categoría inválida",
          status: 400,
          detail: `Categoría desconocida: ${rawCategory}. Válidas: ${VALID_CATEGORIES.join(", ")}.`,
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const settings = await getSettingsByCategory(upper);
    return withCmsCacheHeaders({
      count: settings.length,
      category: upper,
      settings,
    });
  }

  const settings = await getAllSiteSettings();
  return withCmsCacheHeaders({
    count: settings.length,
    settings,
  });
}
