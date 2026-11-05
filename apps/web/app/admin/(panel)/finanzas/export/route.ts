/*
 * GET /admin/finanzas/export — descarga CSV contable de órdenes cobradas
 * en la ventana seleccionada (Fase 8 · S18).
 *
 * Exige:
 *   1. Sesión admin activa + TOTP verificado + MFA `aal2` + capacidad
 *      `finance:export_csv` (`SUPERADMIN`, `FINANCE_ANALYST`) + idle check.
 *   2. Step-up MFA reciente (`requireRecentMfa`, ≤ 10 min) por tratarse de
 *      exportación masiva financiera y tributaria (DIAN + emails).
 *   3. Registro inmutable en `AdminActionLog` (`finance.export_orders_csv`).
 */

import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { isMfaReauthRequired, MFA_REAUTH_MESSAGE, requireRecentMfa } from "@/lib/admin-reauth";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  buildAccountingOrdersCsv,
  DEFAULT_PERIOD,
  isFinanzasPeriod,
  listCollectedOrdersForExport,
} from "@/features/finanzas/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRouteAccess({
    capability: "finance:export_csv",
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

  const url = new URL(req.url);
  const periodoRaw = url.searchParams.get("periodo") ?? undefined;
  const periodo = isFinanzasPeriod(periodoRaw) ? periodoRaw : DEFAULT_PERIOD;

  const rows = await listCollectedOrdersForExport(periodo);
  const csv = buildAccountingOrdersCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);

  await recordAdminAction({
    actorId: auth.session.admin.id,
    action: "finance.export_orders_csv",
    entityType: "Order",
    entityId: periodo,
    metadata: { count: rows.length, periodo },
  });
  logger.info({
    event: "finance.orders.export_csv",
    adminId: auth.session.admin.id,
    periodo,
    total: rows.length,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finanzas-pedidos-${periodo}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
