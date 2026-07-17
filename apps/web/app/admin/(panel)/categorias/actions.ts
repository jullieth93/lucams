"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import {
  CategoryValidationError,
  createCategory,
  moveCategory,
  restoreCategory,
  softDeleteCategory,
  updateCategory,
} from "@/features/categories/service";
import { CategoryCreateSchema } from "@/features/categories/schemas";
import { logger } from "@/lib/logger";

export type CategoryActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "slug" | "description" | "order", string[]>>;
};

function parsePayload(formData: FormData) {
  const parentRaw = String(formData.get("parentId") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase(),
    description: (formData.get("description") || null) as string | null,
    isActive: formData.get("isActive") === "on",
    // "" (— Ninguna —) => null = categoría principal.
    parentId: parentRaw === "" ? null : parentRaw,
    // D3: el orden ya NO viene del form — lo auto-asigna el service.
  };
}

export async function createCategoryAction(
  _prev: CategoryActionState | null,
  formData: FormData,
): Promise<CategoryActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const parsed = CategoryCreateSchema.safeParse(parsePayload(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as CategoryActionState["fieldErrors"],
    };
  }

  try {
    const category = await createCategory(parsed.data, session.admin.id);
    logger.info({
      event: "admin.category.created",
      adminId: session.admin.id,
      slug: parsed.data.slug,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "category.create",
      entityType: "Category",
      entityId: category.id,
      metadata: { slug: category.slug, name: category.name },
    });
    revalidatePath("/admin/categorias");
    redirect("/admin/categorias?created=1");
  } catch (err) {
    if (err instanceof CategoryValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as CategoryActionState["fieldErrors"],
      };
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error(
      {
        event: "admin.category.create_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to create category",
    );
    return { error: "Algo salió mal." };
  }
}

export async function updateCategoryAction(
  _prev: CategoryActionState | null,
  formData: FormData,
): Promise<CategoryActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "ID inválido." };

  const parsed = CategoryCreateSchema.partial().safeParse(parsePayload(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as CategoryActionState["fieldErrors"],
    };
  }

  try {
    await updateCategory(id, parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "category.update",
      entityType: "Category",
      entityId: id,
      metadata: { fields: Object.keys(parsed.data) },
    });
    revalidatePath("/admin/categorias");
    return {};
  } catch (err) {
    if (err instanceof CategoryValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as CategoryActionState["fieldErrors"],
      };
    }
    logger.error(
      {
        event: "admin.category.update_fail",
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to update category",
    );
    return { error: "Algo salió mal." };
  }
}

/**
 * Toggle rápido del flag `isActive` de una categoría. Usado en el
 * listado /admin/categorias para activar/desactivar inline sin abrir el
 * form completo. Si está activa, queda inactiva (oculta del storefront);
 * si está inactiva, vuelve a activa.
 */
export async function toggleCategoryActiveAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true"; // estado deseado
  if (!id) return;

  try {
    await updateCategory(id, { isActive: next }, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: next ? "category.activate" : "category.deactivate",
      entityType: "Category",
      entityId: id,
    });
    revalidatePath("/admin/categorias");
    revalidatePath("/productos");
    revalidatePath("/", "layout");
  } catch (err) {
    logger.error(
      {
        event: "admin.category.toggle_active_fail",
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to toggle category active",
    );
    throw err;
  }
}

/**
 * Reordena una categoría dentro de su grupo (flechas ↑/↓ del listado).
 * D3 (Lucy 2026-06-27): reemplaza el campo manual "número de orden".
 */
export async function moveCategoryAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? "up" : "down";
  if (!id) return;

  try {
    await moveCategory(id, direction, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "category.reorder",
      entityType: "Category",
      entityId: id,
      metadata: { direction },
    });
    revalidatePath("/admin/categorias");
    revalidatePath("/productos");
    revalidatePath("/", "layout");
  } catch (err) {
    logger.error(
      {
        event: "admin.category.reorder_fail",
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to reorder category",
    );
    throw err;
  }
}

/** Restaura una categoría archivada (deletedAt → null). Queda inactiva
 * por seguridad — admin la activa después si quiere mostrarla. */
export async function restoreCategoryAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await restoreCategory(id, session.admin.id);
  logger.info({
    event: "admin.category.restored",
    adminId: session.admin.id,
    categoryId: id,
  });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "category.restore",
    entityType: "Category",
    entityId: id,
  });
  revalidatePath("/admin/categorias");
  revalidatePath("/productos");
  revalidatePath("/", "layout");
  redirect("/admin/categorias?restored=1");
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  try {
    await softDeleteCategory(id, session.admin.id);
    logger.info({
      event: "admin.category.deleted",
      adminId: session.admin.id,
      categoryId: id,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "category.archive",
      entityType: "Category",
      entityId: id,
    });
    revalidatePath("/admin/categorias");
    redirect("/admin/categorias?deleted=1");
  } catch (err) {
    if (err instanceof CategoryValidationError) {
      redirect(`/admin/categorias?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}
