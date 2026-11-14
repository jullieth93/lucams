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
import { formatIsoDateCO } from "@/lib/datetime";
import {
  buildNewsletterCsv,
  listAllNewsletterSubscribers,
  type NewsletterExportScope,
} from "@/features/newsletter/admin-service";
import { logger } from "@/lib/logger";

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
      {
        status: auth.status,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }

  const rawScope = new URL(req.url).searchParams.get("scope");
  if (rawScope !== null && rawScope !== "active_commercial" && rawScope !== "audit_ledger") {
    return Response.json(
      { error: "Alcance de exportación inválido." },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }

  const scope: NewsletterExportScope =
    rawScope === "audit_ledger" ? "audit_ledger" : "active_commercial";
  if (scope === "audit_ledger" && auth.session.admin.role !== "SUPERADMIN") {
    return Response.json(
      { error: "Solo SUPERADMIN puede descargar el libro histórico completo (SIC)." },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }

  try {
    await requireRecentMfa();
  } catch (err) {
    if (isMfaReauthRequired(err)) {
      return Response.json(
        { error: MFA_REAUTH_MESSAGE, reauthRequired: true },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Robots-Tag": "noindex, nofollow",
          },
        },
      );
    }
    throw err;
  }

  const items = await listAllNewsletterSubscribers({ scope });
  const csv = buildNewsletterCsv(items, { auditLedger: scope === "audit_ledger" });
  const stamp = formatIsoDateCO(new Date());
  const filename =
    scope === "audit_ledger"
      ? `suscriptores-ledger-sic-${stamp}.csv`
      : `suscriptores-newsletter-${stamp}.csv`;

  await recordAdminAction({
    actorId: auth.session.admin.id,
    action: "newsletter.export_csv",
    entityType: "Consent",
    entityId: "NEWSLETTER",
    metadata: { count: items.length, scope },
  });
  logger.info({
    event: "newsletter.subscribers.export",
    adminId: auth.session.admin.id,
    scope,
    total: items.length,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
