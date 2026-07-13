"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAdminAction } from "@/lib/admin-audit";
import {
  reviewWarrantyClaim,
  approveWarrantyClaim,
  resolveWarrantyClaim,
  rejectWarrantyClaim,
  WARRANTY_RESOLUTIONS,
  type WarrantyResolution,
} from "@/features/warranty/service";
import { notifyWarrantyResolved } from "@/features/warranty/notify";

type St = { error?: string; success?: string } | null;

async function guard(): Promise<{ adminId: string } | { error: string }> {
  const s = await getCurrentAdmin();
  if (!s) return { error: "No autorizado" };
  if (s.admin.role !== "SUPERADMIN" && s.admin.role !== "MANAGER") {
    return { error: "Solo administrador o manager." };
  }
  return { adminId: s.admin.id };
}

function fail(action: string, id: string, err: unknown): St {
  logger.warn({
    event: `admin.warranty.${action}_fail`,
    id,
    err: err instanceof Error ? err.message : String(err),
  });
  return { error: err instanceof Error ? err.message : "Error inesperado" };
}

async function audit(adminId: string, action: string, id: string, metadata?: Record<string, unknown>) {
  await recordAdminAction({ actorId: adminId, action, entityType: "WarrantyClaim", entityId: id, metadata });
  revalidatePath("/admin/garantias");
}

export async function reviewWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  if ("error" in g) return g;
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Falta id" };
  try {
    await reviewWarrantyClaim(id, g.adminId);
    await audit(g.adminId, "warranty.review", id);
    return { success: "En diagnóstico." };
  } catch (err) {
    return fail("review", id, err);
  }
}

export async function approveWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  if ("error" in g) return g;
  const id = String(fd.get("id") ?? "");
  const resolution = String(fd.get("resolution") ?? "") as WarrantyResolution;
  if (!id) return { error: "Falta id" };
  if (!WARRANTY_RESOLUTIONS.includes(resolution)) return { error: "Elige un remedio." };
  try {
    await approveWarrantyClaim(id, g.adminId, resolution);
    await audit(g.adminId, "warranty.approve", id, { resolution });
    return { success: "Aprobado — remedio en ejecución." };
  } catch (err) {
    return fail("approve", id, err);
  }
}

export async function resolveWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  if ("error" in g) return g;
  const id = String(fd.get("id") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  if (!id) return { error: "Falta id" };
  try {
    await resolveWarrantyClaim(id, g.adminId, note || undefined);
    // Aviso al cliente con el remedio aplicado (best-effort).
    await notifyWarrantyResolved(id).catch((e) =>
      logger.warn({ event: "admin.warranty.notify_resolved_fail", id, err: String(e) }),
    );
    await audit(g.adminId, "warranty.resolve", id);
    return { success: "Garantía resuelta — cliente avisado." };
  } catch (err) {
    return fail("resolve", id, err);
  }
}

export async function rejectWarrantyAction(_p: St, fd: FormData): Promise<St> {
  const g = await guard();
  if ("error" in g) return g;
  const id = String(fd.get("id") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  if (!id) return { error: "Falta id" };
  if (!note) return { error: "Escribe el motivo del rechazo." };
  try {
    await rejectWarrantyClaim(id, g.adminId, note);
    await audit(g.adminId, "warranty.reject", id, { note });
    return { success: "Reclamo rechazado." };
  } catch (err) {
    return fail("reject", id, err);
  }
}
