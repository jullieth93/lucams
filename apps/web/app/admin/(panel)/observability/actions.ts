/*
 * Server actions — triage de errores del cliente (ErrorReport) en /admin/observability.
 * Solo SUPERADMIN (mismo gate que la página). Registra en el audit log.
 */

"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireRole } from "@/lib/admin-rbac-guard";
import { setErrorReportStatus, type ErrorReportStatus } from "@/features/observability/service";

async function updateStatus(id: string, status: ErrorReportStatus) {
  const session = await requireRole(["SUPERADMIN"]);
  await setErrorReportStatus(id, status, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "error_report.status_change",
    entityType: "ErrorReport",
    entityId: id,
    metadata: { status },
  });
  revalidatePath("/admin/observability");
}

export async function resolveClientErrorAction(id: string) {
  await updateStatus(id, "RESOLVED");
}

export async function ignoreClientErrorAction(id: string) {
  await updateStatus(id, "IGNORED");
}
