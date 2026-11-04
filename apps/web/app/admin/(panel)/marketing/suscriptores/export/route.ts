/*
 * GET /admin/marketing/suscriptores/export — descarga CSV de la audiencia del
 * newsletter (Fase 3A + endurecimiento S11 · [SEC-02]).
 *
 * Exige:
 *   1. Sesión admin activa + TOTP verificado + MFA `aal2` + rol `MANAGER_UP` + idle check
 *      sin lanzar `NEXT_REDIRECT` (`verifyAdminRouteAccess`).
 *   2. Step-up MFA reciente (`requireRecentMfa`, ≤ 10 min) por tratarse de exportación
 *      masiva de PII.
 *   3. Registro inmutable en `AdminActionLog` (`newsletter.export_csv`).
 */

import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  buildNewsletterCsv,
  listAllNewsletterSubscribers,
} from "@/features/newsletter/admin-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRouteAccess({
    roles: ADMIN_ROLE_SETS.MANAGER_UP,
    req,
    checkIdle: true,
  });
  if (!auth.ok) {
    return Response.json(
      { error: "No autorizado.", reason: auth.reason },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

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

  const items = await listAllNewsletterSubscribers();
  const csv = buildNewsletterCsv(items);
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  await recordAdminAction({
    actorId: auth.session.admin.id,
    action: "newsletter.export_csv",
    entityType: "Consent",
    entityId: "NEWSLETTER",
    metadata: { count: items.length },
  });
  logger.info({
    event: "newsletter.subscribers.export",
    adminId: auth.session.admin.id,
    total: items.length,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suscriptores-newsletter-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
