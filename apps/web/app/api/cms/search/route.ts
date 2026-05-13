/*
 * GET /api/cms/search?q=texto — busca en bloques CMS publicados.
 *
 * Usa pg_trgm + unaccent: tolerante a typos y acentos. Devuelve top 20
 * resultados ordenados por similarity DESC.
 *
 * Diseñado para chatbot RAG (Claude API consume este endpoint con la
 * pregunta del usuario, embebe el body de los matches en el prompt).
 *
 * Validación: q requerido, mínimo 2 chars (evita queries triviales).
 *
 * Rate-limit 30/min por IP (mismo que /api/cms/blocks). Cache HTTP
 * más corto (5 min) porque el query varía.
 */

import { searchCmsBlocks } from "@/lib/cms";
import { applyRateLimit, extractIp } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const ip = await extractIp();
  const limited = await applyRateLimit(ip);
  if (limited) return limited;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return Response.json(
      {
        type: "https://lucamsshop.co/errors/invalid-query",
        title: "Query inválida",
        status: 400,
        detail: "El parámetro q es obligatorio y debe tener al menos 2 caracteres.",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  const results = await searchCmsBlocks(q);
  return Response.json(
    {
      query: q,
      count: results.length,
      results,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
