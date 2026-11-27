/*
 * GET /api/b2b-proof/[proposalId] — Gateway privado para la muestra digital de una propuesta B2B (`ADR-210`).
 *
 * Autorización (cero enumeración: cualquier fallo devuelve 404 uniforme):
 *   1. Admin activo con capacidad `opportunities:manage` y MFA `aal2`.
 *   2. Poseedor del token secreto `?pt=<64-hex>` validado en tiempo constante
 *      contra `OpportunityProposal.tokenHash`.
 */

import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { verifyTokenHashTimingSafe } from "@/lib/token-hash";
import { buildWeakEtag, isWildcardIfNoneMatch, matchesIfNoneMatch } from "@/lib/http-etag";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROOF_BUCKET = "design-previews";
const PROPOSAL_TOKEN_RE = /^[a-f0-9]{64}$/i;
const SAFE_PROOF_PATH_RE = /^b2b-proofs\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+\.(webp|png|jpe?g)$/i;
const MIME_BY_EXT: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function isSafeProofAssetPath(assetPath: string): boolean {
  if (!assetPath || assetPath.includes("..") || assetPath.startsWith("/")) return false;
  return SAFE_PROOF_PATH_RE.test(assetPath);
}

function resolveSafeContentType(assetPath: string): string {
  const ext = assetPath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function notFound() {
  return Response.json(
    { error: "not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await ctx.params;
  let cleanId: string;
  try {
    cleanId = decodeURIComponent(proposalId).trim();
  } catch {
    return notFound();
  }
  if (!cleanId || cleanId.length > 64) return notFound();

  const proposal = await prisma.opportunityProposal.findUnique({
    where: { id: cleanId },
    select: {
      id: true,
      tokenHash: true,
      proofAssetPath: true,
      updatedAt: true,
      opportunity: { select: { deletedAt: true } },
    },
  });

  if (
    !proposal ||
    proposal.opportunity.deletedAt !== null ||
    !proposal.proofAssetPath ||
    !isSafeProofAssetPath(proposal.proofAssetPath)
  ) {
    return notFound();
  }

  const url = new URL(req.url);
  const pt = url.searchParams.get("pt")?.trim() ?? "";
  const tokenOk = PROPOSAL_TOKEN_RE.test(pt) && verifyTokenHashTimingSafe(pt, proposal.tokenHash);

  let adminOk = false;
  if (!tokenOk) {
    const adminAccess = await verifyAdminRouteAccess({
      roles: ADMIN_ROLE_SETS.OPPORTUNITIES,
      req,
    }).catch(() => ({ ok: false as const }));
    adminOk = adminAccess.ok;
  }

  if (!tokenOk && !adminOk) {
    return notFound();
  }

  const etag = buildWeakEtag([
    "b2b-proof:v1",
    proposal.id,
    proposal.proofAssetPath,
    proposal.updatedAt.getTime(),
  ]);
  const baseHeaders: Record<string, string> = {
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    ETag: etag,
    Vary: "Cookie",
  };
  const ifNoneMatch = req.headers.get("if-none-match");
  if (matchesIfNoneMatch(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  const { data, error } = await supabaseService.storage
    .from(PROOF_BUCKET)
    .download(proposal.proofAssetPath);
  if (error || !data) {
    return notFound();
  }

  if (isWildcardIfNoneMatch(ifNoneMatch)) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  return new Response(data.stream(), {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Type": resolveSafeContentType(proposal.proofAssetPath),
      ...(typeof data.size === "number" && data.size >= 0
        ? { "Content-Length": String(data.size) }
        : {}),
    },
  });
}
