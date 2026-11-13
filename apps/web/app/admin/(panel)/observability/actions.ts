/*
 * Server actions — triage de errores del cliente (ErrorReport) en /admin/observability.
 * Solo SUPERADMIN (mismo gate que la página, con defensa AAL2 de acción). Registra en audit log y logs estructurados.
 */

"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { logger } from "@/lib/logger";
import { setErrorReportStatus, type ErrorReportStatus } from "@/features/observability/service";

async function updateStatus(id: string, status: ErrorReportStatus) {
  const session = await requireAdminAction({ roles: ["SUPERADMIN"] });
  const cleanId = id.trim();
  if (!cleanId) return;

  await setErrorReportStatus(cleanId, status, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "error_report.status_change",
    entityType: "ErrorReport",
    entityId: cleanId,
    metadata: { status },
  });
  logger.info({
    event: "observability.error_report_status_changed",
    actorId: session.admin.id,
    errorReportId: cleanId,
    status,
  });
  revalidatePath("/admin/observability");
}

export async function resolveClientErrorAction(id: string) {
  await updateStatus(id, "RESOLVED");
}

export async function ignoreClientErrorAction(id: string) {
  await updateStatus(id, "IGNORED");
}
