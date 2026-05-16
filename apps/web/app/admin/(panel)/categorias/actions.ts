"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCurrentAdmin } from "@/lib/auth";
import {
  CategoryValidationError,
  createCategory,
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
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase(),
    description: (formData.get("description") || null) as string | null,
    isActive: formData.get("isActive") === "on",
    order: Number(formData.get("order") ?? 0),
  };
}

export async function createCategoryAction(
  _prev: CategoryActionState | null,
  formData: FormData,
): Promise<CategoryActionState> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

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
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };

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

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

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
