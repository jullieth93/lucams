"use server";

/*
 * Server actions de /admin/reclamos — cierre directo del WarrantyClaim.
 *
 * A propósito NO se usa features/warranty/service: ese service modela el
 * flujo largo de /admin/garantias (PENDING → IN_REVIEW → APPROVED → RESOLVED)
 * y no permite cerrar de una desde PENDING con remedio + nota. Acá el admin
 * resuelve en un solo paso, pero se respetan las mismas invariantes: solo se
 * cierran reclamos abiertos, el rechazo exige motivo y siempre se sellan
 * resolvedAt + processedBy, además del registro en la auditoría admin.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";

export type ClaimActionState = { error?: string; success?: string } | null;

const RESOLUTIONS = ["REPAIR", "REPLACE", "REFUND"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

// Solo un reclamo abierto puede cerrarse; evita dobles cierres y pisar la
// resolución hecha desde /admin/garantias.
const ACTIVE_STATUSES: readonly string[] = ["PENDING", "IN_REVIEW", "APPROVED"];

async function assertOpen(id: string): Promise<void> {
  const claim = await prisma.warrantyClaim.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!claim) throw new Error("Reclamo no encontrado.");
  if (!ACTIVE_STATUSES.includes(claim.status)) {
    throw new Error("Este reclamo ya fue cerrado. Recarga la página.");
  }
}

function fail(action: string, id: string, err: unknown): ClaimActionState {
  logger.warn({
    event: `admin.reclamo.${action}_fail`,
    id,
    err: err instanceof Error ? err.message : String(err),
  });
  return { error: err instanceof Error ? err.message : "Error inesperado. Reintenta." };
}

export async function resolveClaimAction(
  _prev: ClaimActionState,
  formData: FormData,
): Promise<ClaimActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const resolutionType = String(formData.get("resolutionType") ?? "") as Resolution;
  const note = String(formData.get("note") ?? "").trim();

  if (!id) return { error: "Falta el reclamo." };
  if (!RESOLUTIONS.includes(resolutionType)) {
    return { error: "Elige el tipo de solución: reparación, cambio o devolución." };
  }

  try {
    await assertOpen(id);
    await prisma.warrantyClaim.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolutionType,
        resolutionNote: note ? note.slice(0, 500) : null,
        resolvedAt: new Date(),
        processedBy: session.admin.id,
      },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "reclamo.resolve",
      entityType: "WarrantyClaim",
      entityId: id,
      metadata: { resolutionType },
    });
    revalidatePath("/admin/reclamos");
    revalidatePath(`/admin/reclamos/${id}`);
    return { success: "Reclamo marcado como resuelto." };
  } catch (err) {
    return fail("resolve", id, err);
  }
}

export async function rejectClaimAction(
  _prev: ClaimActionState,
  formData: FormData,
): Promise<ClaimActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!id) return { error: "Falta el reclamo." };
  if (!note) return { error: "Escribe el motivo del rechazo." };

  try {
    await assertOpen(id);
    await prisma.warrantyClaim.update({
      where: { id },
      data: {
        status: "REJECTED",
        // Sin remedio: el rechazo no aplica reparación/cambio/devolución.
        resolutionType: null,
        resolutionNote: note.slice(0, 500),
        resolvedAt: new Date(),
        processedBy: session.admin.id,
      },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "reclamo.reject",
      entityType: "WarrantyClaim",
      entityId: id,
      metadata: { note },
    });
    revalidatePath("/admin/reclamos");
    revalidatePath(`/admin/reclamos/${id}`);
    return { success: "Reclamo rechazado." };
  } catch (err) {
    return fail("reject", id, err);
  }
}
