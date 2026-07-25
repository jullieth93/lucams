"use server";

/*
 * Server actions de la cola de moderación de contenido (ADR-062 P0-2). SUPERADMIN o MANAGER.
 * Aprobar/rechazar un diseño personalizado antes de imprimirlo. El rechazo avisa al cliente.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { approveDesign, rejectDesign } from "@/features/moderation/service";
import { sendDesignRejectedEmails } from "@/features/moderation/emails";

export async function approveDesignAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const designId = String(formData.get("designId") ?? "").trim();
  if (!designId) redirect("/admin/moderacion?error=" + encodeURIComponent("Falta el diseño."));

  await approveDesign(designId, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "design.moderation.approve",
    entityType: "Design",
    entityId: designId,
  });
  revalidatePath("/admin/moderacion");
  revalidatePath("/admin/dashboard");
  redirect("/admin/moderacion?approved=1");
}

export async function rejectDesignAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const designId = String(formData.get("designId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  if (!designId) redirect("/admin/moderacion?error=" + encodeURIComponent("Falta el diseño."));
  if (reason.length < 5) {
    redirect(
      "/admin/moderacion?error=" +
        encodeURIComponent("Escribe un motivo del rechazo (mínimo 5 caracteres)."),
    );
  }

  const result = await rejectDesign(designId, session.admin.id, reason);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "design.moderation.reject",
    entityType: "Design",
    entityId: designId,
    metadata: { reason, afectados: result.sources.map((x) => `${x.tipo} ${x.numero}`) },
  });
  // Avisar al cliente (best-effort: no rompe la acción si el correo falla).
  await sendDesignRejectedEmails(designId, result, reason);

  revalidatePath("/admin/moderacion");
  revalidatePath("/admin/dashboard");
  redirect("/admin/moderacion?rejected=1");
}
