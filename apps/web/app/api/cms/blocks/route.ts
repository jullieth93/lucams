/*
 * GET /api/cms/blocks — lista todos los bloques CMS publicados.
 *
 * Querystring opcional:
 *   ?category=LEGAL|HOME|FOOTER|EMPTY_STATE|COOKIES|FAQ|SUPPORT|
 *            MAINTENANCE|EMAIL|MARKETING
 *
 * Endpoint público sin auth — el contenido publicado es el mismo
 * que ya rendea el sitio. Pensado para consumo del futuro chatbot
 * Claude (RAG) y para integraciones externas.
 *
 * Rate-limit 30/min por IP. Cache HTTP agresivo (1h CDN), invalidado
 * vía tag "cms" cuando el admin publica.
 *
 * Referencias:
 *   - ADR-033 CMS arquitectura + RAG endpoints
 *   - docs/INTEGRATIONS.md § CMS API
 */

import { getAllCmsBlocks, getCmsBlocksByCategory, type CmsBlockCategory } from "@/lib/cms";
import { applyRateLimit, extractIp, withCmsCacheHeaders } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CATEGORIES: CmsBlockCategory[] = [
  "LEGAL",
  "HOME",
  "FOOTER",
  "EMPTY_STATE",
  "COOKIES",
  "FAQ",
  "SUPPORT",
  "MAINTENANCE",
  "EMAIL",
  "MARKETING",
];

export async function GET(req: Request): Promise<Response> {
  const ip = await extractIp();
  const limited = await applyRateLimit(ip);
  if (limited) return limited;

  const url = new URL(req.url);
  const rawCategory = url.searchParams.get("category");

  if (rawCategory) {
    const upper = rawCategory.toUpperCase();
    if (!VALID_CATEGORIES.includes(upper as CmsBlockCategory)) {
      return Response.json(
        {
          type: "https://lucamsshop.com/errors/invalid-category",
          title: "Categoría inválida",
          status: 400,
          detail: `Categoría desconocida: ${rawCategory}. Válidas: ${VALID_CATEGORIES.join(", ")}.`,
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const blocks = await getCmsBlocksByCategory(upper);
    return withCmsCacheHeaders({
      count: blocks.length,
      category: upper,
      blocks,
    });
  }

  const blocks = await getAllCmsBlocks();
  return withCmsCacheHeaders({
    count: blocks.length,
    blocks,
  });
}
