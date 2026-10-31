/*
 * GET /api/design-preview/<designId>/<archivo> — ÚNICA puerta de lectura del
 * bucket design-previews (privado desde la migración 046, LUC-SEC-001).
 *
 * Autorización (matriz certificada en preview-access.test.ts):
 *   - admin activo o dueño (customerId autenticado / cookie cart_session que
 *     coincide con Design.sessionId) → cualquier variante.
 *   - capacidad por token (?st= share /d/, ?qt= cotización, ?ot= pedido) →
 *     SOLO variantes watermark. El preview limpio, las páginas limpias y los
 *     borradores nunca salen por token.
 *   - resto → 404 (no 403: no se filtra si el diseño existe).
 *
 * La respuesta es cache PRIVADA corta (nada de CDN pública de un año para
 * contenido personal — el endpoint depende de cookies/tokens).
 */

import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { hashBearerToken } from "@/lib/token-hash";
import { CART_SESSION_COOKIE } from "@/lib/cart-session";
import { logger } from "@/lib/logger";
import {
  canAccessDesignPreview,
  parsePreviewStoragePath,
} from "@/features/personalization/preview-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "design-previews";
const TOKEN_RE = /^[a-f0-9]{32}$/;
const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function notFound() {
  return Response.json({ error: "not found" }, { status: 404 });
}

/** Lee la cookie cart_session del header crudo (testeable sin next/headers). */
function readCartSession(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== CART_SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return SESSION_RE.test(value) ? value : null;
  }
  return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  const rel = (path ?? []).join("/");
  const parsed = parsePreviewStoragePath(rel);
  if (!parsed) return notFound();

  const design = await prisma.design.findUnique({
    where: { id: parsed.designId },
    select: { customerId: true, sessionId: true, shareTokenHash: true },
  });
  if (!design) return notFound();

  // Capacidades por token (solo se consultan con forma válida; el join exige
  // que la orden/cotización realmente contenga ESTE diseño).
  const url = new URL(req.url);
  const qt = url.searchParams.get("qt");
  const ot = url.searchParams.get("ot");
  let quoteTokenOk = false;
  let orderTokenOk = false;
  if (qt && TOKEN_RE.test(qt)) {
    quoteTokenOk = Boolean(
      await prisma.quote.findFirst({
        where: {
          publicAccessTokenHash: hashBearerToken(qt),
          deletedAt: null,
          items: { some: { designId: parsed.designId } },
        },
        select: { id: true },
      }),
    );
  }
  if (ot && TOKEN_RE.test(ot)) {
    orderTokenOk = Boolean(
      await prisma.order.findFirst({
        where: {
          publicAccessTokenHash: hashBearerToken(ot),
          deletedAt: null,
          items: { some: { designId: parsed.designId } },
        },
        select: { id: true },
      }),
    );
  }

  // Quién llama: cookie anónima + sesión autenticada (cliente y/o admin).
  const sessionId = readCartSession(req);
  const [customer, admin] = await Promise.all([
    getCurrentCustomer().catch(() => null),
    getCurrentAdmin().catch(() => null),
  ]);

  const allowed = canAccessDesignPreview({
    design,
    variantClass: parsed.variantClass,
    caller: {
      customerId: customer?.customer.id ?? null,
      sessionId,
      isAdmin: admin !== null,
    },
    shareToken: url.searchParams.get("st"),
    quoteTokenOk,
    orderTokenOk,
  });
  if (!allowed) return notFound();

  const { data, error } = await supabaseService.storage.from(BUCKET).download(rel);
  if (error || !data) {
    // Objeto faltante (purga de retención, diseño viejo sin artefacto): 404
    // igual que un no-autorizado — sin distinguir "existe pero no puedes".
    if (error) {
      logger.warn({ event: "design_preview.download_fail", err: error.message });
    }
    return notFound();
  }

  const ext = rel.split(".").pop()!.toLowerCase();
  return new Response(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "content-type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      // Privada y corta: la URL lleva capacidad por query o identidad por
      // cookie — ninguna caché compartida debe retenerla.
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
