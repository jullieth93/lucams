/*
 * GET /api/cms/blocks/[key] — devuelve un bloque CMS publicado por su key.
 *
 * Ej: GET /api/cms/blocks/legal.privacidad
 *
 * 200 con el bloque, 404 si no existe o no está publicado.
 *
 * Rate-limit 30/min por IP. Cache HTTP 1 h CDN. Invalidado vía tag
 * "cms" al publicar desde admin.
 */

import { getCmsBlock } from "@/lib/cms";
import { applyRateLimit, extractIp, withCmsCacheHeaders } from "../../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const ip = await extractIp();
  const limited = await applyRateLimit(ip);
  if (limited) return limited;

  const { key } = await ctx.params;
  if (!key) {
    return Response.json(
      {
        type: "https://lucamsshop.com/errors/missing-key",
        title: "Key requerida",
        status: 400,
        detail: "El path debe incluir la key del bloque.",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  const block = await getCmsBlock(key);
  if (!block) {
    return Response.json(
      {
        type: "https://lucamsshop.com/errors/cms-block-not-found",
        title: "Bloque no encontrado",
        status: 404,
        detail: `No existe un bloque publicado con key "${key}".`,
      },
      { status: 404, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  return withCmsCacheHeaders({ block });
}
