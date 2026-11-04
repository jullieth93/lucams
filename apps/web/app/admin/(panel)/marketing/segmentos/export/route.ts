/*
 * GET /admin/marketing/segmentos/export?segment=<key> (`Fase 12 · S25`)
 *
 * Exportación CSV de audiencias comerciales con triple blindaje:
 *   1. RBAC + TOTP + MFA `aal2` + idle check (`verifyAdminRouteAccess`, `MARKETING_EXPORT`).
 *   2. Step-up MFA reciente (`requireRecentMfa`, <= 10 min).
 *   3. Gate duro Ley 1581 en SQL (`newsletter_opted_in = true`) + neutralización
 *      de formula injection + registro en `AdminActionLog`.
 */

import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { recordAdminAction } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import {
  buildCrmSegmentCsv,
  isCrmSegmentKey,
  listAllConsentedSegmentMembersForExport,
  type CrmSegmentKey,
} from "@/features/crm/segments-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRouteAccess({
    roles: ADMIN_ROLE_SETS.MARKETING_EXPORT,
    req,
    checkIdle: true,
  });
  if (!auth.ok) {
    return Response.json(
      { error: "No autorizado.", reason: auth.reason },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const rawSegment = url.searchParams.get("segment") ?? "vip";
  if (!isCrmSegmentKey(rawSegment)) {
    return Response.json(
      { error: "Segmento inválido." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const segmentKey: CrmSegmentKey = rawSegment;

  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) {
      return Response.json(
        { error: MFA_REAUTH_MESSAGE, reauthRequired: true },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw err;
  }

  const items = await listAllConsentedSegmentMembersForExport(segmentKey);
  const csv = buildCrmSegmentCsv(items, segmentKey);
  const stamp = new Date().toISOString().slice(0, 10);

  await recordAdminAction({
    actorId: auth.session.admin.id,
    action: "marketing.export_segment_csv",
    entityType: "Consent",
    entityId: `CRM_SEGMENT:${segmentKey}`,
    metadata: {
      segment: segmentKey,
      exportedCount: items.length,
    },
  });

  logger.info({
    event: "crm.segment.export_csv",
    adminId: auth.session.admin.id,
    segment: segmentKey,
    exportedCount: items.length,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="segmento-${segmentKey}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
