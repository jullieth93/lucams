"use server";

/*
 * Fase 7b — costeo por materiales: Server Actions de la receta (ProductMaterial)
 * del producto, consumidas por la pestaña "Materiales" de /admin/productos/[id].
 *
 * Autocontenidas (Prisma directo, sin service): el CRUD es simple y sigue la
 * misma regla del módulo hermano /admin/materiales. RBAC MANAGER_UP, coherente
 * con el resto de acciones del módulo de productos (stock, imágenes, bulk).
 *
 * La cantidad es Float (misma convención que Material.stock: metros, ml…) y la
 * DB además la protege con CHECK > 0 (migración 20260919130000). El costo
 * sugerido que esta receta alimenta es INFORMATIVO — nunca se escribe en
 * Product.cost desde acá; Lucy lo aplica a mano desde /admin/costos.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// Tope de bolsillo contra dedazos (1 millón de unidades de insumo por producto
// ya es un error de digitación, no una receta real).
const MAX_QUANTITY = 1_000_000;

function backToRecipe(productId: string, params: string): never {
  redirect(`/admin/productos/${productId}?section=materiales&${params}`);
}

/** Cantidad de insumo por unidad: número > 0, admite coma decimal ("0,75"). */
function parseQuantity(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= MAX_QUANTITY ? n : null;
}

const QUANTITY_ERROR =
  "La cantidad debe ser un número mayor que 0 (puedes usar decimales, ej. 0,75).";

export async function addProductMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const productId = String(formData.get("productId") ?? "");
  const materialId = String(formData.get("materialId") ?? "");
  if (!productId) redirect("/admin/productos");
  if (!materialId) backToRecipe(productId, `error=${encodeURIComponent("Elige el material.")}`);

  const quantity = parseQuantity(formData.get("quantity"));
  if (quantity === null) backToRecipe(productId, `error=${encodeURIComponent(QUANTITY_ERROR)}`);

  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    // Solo se puede recetar un insumo vigente (activo y no eliminado): recetar
    // uno de la papelera dejaría la receta apuntando a algo que ya no se usa.
    const material = await prisma.material.findFirst({
      where: { id: materialId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!material) {
      backToRecipe(
        productId,
        `error=${encodeURIComponent("Ese material ya no existe o fue eliminado.")}`,
      );
    }

    const created = await prisma.productMaterial.create({
      data: { productId, materialId, quantity, note, createdBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.material.add",
      entityType: "ProductMaterial",
      entityId: created.id,
      metadata: { productId, materialId, materialName: material.name, quantity },
    });
    revalidatePath(`/admin/productos/${productId}`);
    revalidatePath("/admin/costos");
    backToRecipe(productId, "added=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // P2002 = @@unique([productId, materialId]): el insumo ya está en la receta.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      backToRecipe(
        productId,
        `error=${encodeURIComponent("Ese material ya está en la receta; edita su cantidad.")}`,
      );
    }
    logger.error({
      event: "admin.product_material.add_fail",
      adminId: session.admin.id,
      productId,
      materialId,
      err: err instanceof Error ? err.message : String(err),
    });
    backToRecipe(
      productId,
      `error=${encodeURIComponent("No se pudo agregar el material. Reintenta.")}`,
    );
  }
}

export async function updateProductMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!productId) redirect("/admin/productos");
  if (!id) backToRecipe(productId, `error=${encodeURIComponent("Falta la fila a editar.")}`);

  const quantity = parseQuantity(formData.get("quantity"));
  if (quantity === null) backToRecipe(productId, `error=${encodeURIComponent(QUANTITY_ERROR)}`);

  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    await prisma.productMaterial.update({
      where: { id },
      data: { quantity, note, updatedBy: session.admin.id },
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.material.update",
      entityType: "ProductMaterial",
      entityId: id,
      metadata: { productId, quantity },
    });
    revalidatePath(`/admin/productos/${productId}`);
    revalidatePath("/admin/costos");
    backToRecipe(productId, "updated=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.product_material.update_fail",
      adminId: session.admin.id,
      productId,
      recipeItemId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    backToRecipe(productId, `error=${encodeURIComponent("No se pudo actualizar. Reintenta.")}`);
  }
}

// Borrado duro de la FILA de receta (no del material): quitar un insumo de la
// receta no necesita papelera — se re-agrega en 2 clics y no hay historial que
// preservar (el audit trail de recordAdminAction ya guarda el evento).
export async function removeProductMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!productId) redirect("/admin/productos");
  if (!id) backToRecipe(productId, `error=${encodeURIComponent("Falta la fila a quitar.")}`);

  try {
    await prisma.productMaterial.delete({ where: { id } });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "product.material.remove",
      entityType: "ProductMaterial",
      entityId: id,
      metadata: { productId },
    });
    revalidatePath(`/admin/productos/${productId}`);
    revalidatePath("/admin/costos");
    backToRecipe(productId, "removed=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.product_material.remove_fail",
      adminId: session.admin.id,
      productId,
      recipeItemId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    backToRecipe(productId, `error=${encodeURIComponent("No se pudo quitar. Reintenta.")}`);
  }
}
