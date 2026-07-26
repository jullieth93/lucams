"use server";

/*
 * Server Actions del módulo Materiales e insumos (Fase 5 — gestión interna).
 *
 * A diferencia de redirects/garantías, acá NO hay service en features/: la
 * regla del módulo es autocontenerse bajo app/admin/(panel)/materiales, y el
 * CRUD es lo bastante simple para vivir directo en las actions (Prisma puro).
 *
 * Dinero: el form pide el costo por unidad en PESOS (lo que Lucy teclea) y
 * acá se convierte a CENTAVOS COP antes de guardar (mandato CLAUDE.md:
 * dinero siempre Int centavos en DB). Stock y mínimo son Float porque las
 * unidades de insumos no siempre son enteras (metros, ml, kilos…).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";

export type MaterialActionState = { error?: string };

// Unidades coherentes con el comentario del schema (model Material.unit).
const UNITS = ["unidad", "pliego", "metro", "ml", "paquete"] as const;

type ParsedFields = {
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  costPerUnit: number | null;
  note: string | null;
  isActive: boolean;
};

/** Convierte el input de costo en PESOS a centavos COP; vacío → null (opcional). */
function pesosToCents(raw: FormDataEntryValue | null): number | null {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number.parseInt(digits, 10) * 100;
}

function parseNonNegative(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Valida los campos comunes de crear/editar. Devuelve los campos listos
 * para Prisma o un mensaje de error amigable para admin no técnico.
 */
function parseMaterialForm(formData: FormData): ParsedFields | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Escribe el nombre del material." };
  if (name.length > 120) return { error: "El nombre es muy largo (máx. 120 caracteres)." };

  const unit = String(formData.get("unit") ?? "").trim();
  if (!(UNITS as readonly string[]).includes(unit)) return { error: "Elige una unidad válida." };

  const stock = parseNonNegative(formData.get("stock"));
  if (stock === null) return { error: "El stock actual debe ser un número mayor o igual a 0." };

  const minStock = parseNonNegative(formData.get("minStock"));
  if (minStock === null) return { error: "El stock mínimo debe ser un número mayor o igual a 0." };

  const costRaw = String(formData.get("costPerUnit") ?? "").trim();
  const costPerUnit = pesosToCents(costRaw);
  if (costRaw && costPerUnit === null) return { error: "El costo por unidad debe ser en pesos (sin decimales)." };

  const note = String(formData.get("note") ?? "").trim() || null;

  return {
    name,
    unit,
    stock,
    minStock,
    costPerUnit,
    note,
    isActive: formData.get("isActive") === "on",
  };
}

export async function createMaterialAction(
  _prev: MaterialActionState | null,
  formData: FormData,
): Promise<MaterialActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const parsed = parseMaterialForm(formData);
  if ("error" in parsed) return parsed;

  try {
    // Evitar duplicados por nombre: para un admin no técnico, dos filas
    // "Papel fotográfico" generan confusión al descontar stock.
    const dup = await prisma.material.findFirst({
      where: { name: { equals: parsed.name, mode: "insensitive" }, deletedAt: null },
      select: { id: true },
    });
    if (dup) return { error: "Ya existe un material con ese nombre." };

    const created = await prisma.material.create({
      data: { ...parsed, createdBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "material.create",
      entityType: "Material",
      entityId: created.id,
      metadata: { name: created.name, unit: created.unit },
    });
    logger.info({
      event: "admin.material.created",
      adminId: session.admin.id,
      materialId: created.id,
    });
    revalidatePath("/admin/materiales");
    redirect("/admin/materiales?created=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.material.create_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error al crear el material. Reintenta." };
  }
}

export async function updateMaterialAction(
  _prev: MaterialActionState | null,
  formData: FormData,
): Promise<MaterialActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta el material a editar." };

  const parsed = parseMaterialForm(formData);
  if ("error" in parsed) return parsed;

  try {
    // Mismo chequeo anti-duplicados que en crear, excluyendo la propia fila.
    const dup = await prisma.material.findFirst({
      where: {
        name: { equals: parsed.name, mode: "insensitive" },
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) return { error: "Ya existe otro material con ese nombre." };

    await prisma.material.update({
      where: { id },
      data: { ...parsed, updatedBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "material.update",
      entityType: "Material",
      entityId: id,
      metadata: { name: parsed.name },
    });
    revalidatePath("/admin/materiales");
    redirect("/admin/materiales?updated=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.material.update_fail",
      adminId: session.admin.id,
      materialId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error al actualizar el material. Reintenta." };
  }
}

export async function toggleMaterialActiveAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");
  try {
    const current = await prisma.material.findUniqueOrThrow({
      where: { id },
      select: { isActive: true },
    });
    const updated = await prisma.material.update({
      where: { id },
      data: { isActive: !current.isActive, updatedBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: updated.isActive ? "material.activate" : "material.deactivate",
      entityType: "Material",
      entityId: id,
    });
    revalidatePath("/admin/materiales");
    redirect(`/admin/materiales?${updated.isActive ? "activated" : "deactivated"}=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.material.toggle_fail",
      adminId: session.admin.id,
      materialId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/materiales?error=${encodeURIComponent("Error al cambiar el estado.")}`);
  }
}

// Soft delete (deletedAt/deletedBy): la fila se conserva para trazabilidad de
// costos históricos y se puede restaurar desde la vista "Papelera".
export async function deleteMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");
  try {
    await prisma.material.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: session.admin.id, isActive: false },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "material.delete",
      entityType: "Material",
      entityId: id,
    });
    revalidatePath("/admin/materiales");
    redirect("/admin/materiales?deleted=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.material.delete_fail",
      adminId: session.admin.id,
      materialId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/materiales?error=${encodeURIComponent("Error al eliminar el material.")}`);
  }
}

export async function restoreMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.SUPER });
  const id = String(formData.get("id") ?? "");
  try {
    await prisma.material.update({
      where: { id },
      data: { deletedAt: null, deletedBy: null, updatedBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "material.restore",
      entityType: "Material",
      entityId: id,
    });
    revalidatePath("/admin/materiales");
    redirect("/admin/materiales?restored=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.material.restore_fail",
      adminId: session.admin.id,
      materialId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`/admin/materiales?error=${encodeURIComponent("Error al restaurar el material.")}`);
  }
}
