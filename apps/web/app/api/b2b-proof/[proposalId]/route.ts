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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROOF_BUCKET = "design-previews";
const PROPOSAL_TOKEN_RE = /^[a-f0-9]{64}$/i;

function notFound() {
  return Response.json(
    { error: "not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await ctx.params;
  const cleanId = decodeURIComponent(proposalId).trim();
  if (!cleanId || cleanId.length > 64) return notFound();

  const proposal = await prisma.opportunityProposal.findUnique({
    where: { id: cleanId },
    select: {
      id: true,
      tokenHash: true,
      proofAssetPath: true,
      opportunity: { select: { deletedAt: true } },
    },
  });

  if (!proposal || proposal.opportunity.deletedAt !== null || !proposal.proofAssetPath) {
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

  const { data, error } = await supabaseService.storage
    .from(PROOF_BUCKET)
    .download(proposal.proofAssetPath);
  if (error || !data) {
    return notFound();
  }

  const bytes = await data.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
