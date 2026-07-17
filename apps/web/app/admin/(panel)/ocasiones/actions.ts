"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { prisma } from "@/lib/db";
import {
  OcasionValidationError,
  createOcasionTag,
  linkProductToOcasion,
  softDeleteOcasionTag,
  unlinkProductFromOcasion,
  updateOcasionTag,
} from "@/features/ocasiones/service";
import { OcasionCreateSchema, OcasionUpdateSchema } from "@/features/ocasiones/schemas";
import { logger } from "@/lib/logger";

export type OcasionActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"slug" | "name" | "description" | "monthHint" | "order", string[]>>;
};

function parsePayload(formData: FormData) {
  const monthHintRaw = String(formData.get("monthHint") ?? "");
  const monthHint = monthHintRaw && monthHintRaw !== "0" ? Number(monthHintRaw) : null;

  const rangeMin = formData.get("rangeMin");
  const rangeIdeal = formData.get("rangeIdeal");
  const rangeMax = formData.get("rangeMax");
  const suggestedQuantityRange =
    rangeMin && rangeIdeal && rangeMax
      ? {
          min: Number(rangeMin),
          ideal: Number(rangeIdeal),
          max: Number(rangeMax),
        }
      : null;

  return {
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase(),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    monthHint,
    suggestedQuantityRange,
    order: Number(formData.get("order") ?? 0),
    isActive: formData.get("isActive") === "on",
  };
}

export async function createOcasionAction(
  _prev: OcasionActionState | null,
  formData: FormData,
): Promise<OcasionActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const parsed = OcasionCreateSchema.safeParse(parsePayload(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as OcasionActionState["fieldErrors"],
    };
  }

  try {
    const ocasion = await createOcasionTag(parsed.data, session.admin.id);
    logger.info({
      event: "admin.ocasion.created",
      adminId: session.admin.id,
      slug: parsed.data.slug,
    });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "ocasion.create",
      entityType: "OcasionTag",
      entityId: ocasion.id,
      metadata: { slug: ocasion.slug, name: ocasion.name },
    });
    revalidatePath("/admin/ocasiones");
    redirect("/admin/ocasiones?created=1");
  } catch (err) {
    if (err instanceof OcasionValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as OcasionActionState["fieldErrors"],
      };
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error(
      {
        event: "admin.ocasion.create_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to create ocasion",
    );
    return { error: "Error al crear ocasión. Reintenta." };
  }
}

export async function updateOcasionAction(
  _prev: OcasionActionState | null,
  formData: FormData,
): Promise<OcasionActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  const payload = parsePayload(formData);
  const parsed = OcasionUpdateSchema.safeParse({ id, ...payload });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Datos inválidos.",
      fieldErrors: flat.fieldErrors as OcasionActionState["fieldErrors"],
    };
  }

  try {
    await updateOcasionTag(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "ocasion.update",
      entityType: "OcasionTag",
      entityId: id,
      metadata: { slug: parsed.data.slug },
    });
    revalidatePath("/admin/ocasiones");
    redirect("/admin/ocasiones?updated=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    return { error: "Error al actualizar ocasión." };
  }
}

/**
 * Toggle activar/desactivar inline desde el listado. Mismo patrón que
 * `toggleCategoryActiveAction`. Activa = visible al cliente.
 */
export async function toggleOcasionActiveAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id) return;
  await prisma.ocasionTag.update({ where: { id }, data: { isActive: next } });
  await recordAdminAction({
    actorId: session.admin.id,
    action: next ? "ocasion.activate" : "ocasion.deactivate",
    entityType: "OcasionTag",
    entityId: id,
  });
  revalidatePath("/admin/ocasiones");
  revalidatePath("/productos");
  revalidatePath("/", "layout");
}

export async function deleteOcasionAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const id = String(formData.get("id") ?? "");
  await softDeleteOcasionTag(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "ocasion.delete",
    entityType: "OcasionTag",
    entityId: id,
  });
  revalidatePath("/admin/ocasiones");
  redirect("/admin/ocasiones?deleted=1");
}

export async function linkProductOcasionAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const productId = String(formData.get("productId") ?? "");
  const ocasionTagId = String(formData.get("ocasionTagId") ?? "");
  const rationale = (formData.get("rationale") as string | null) || null;

  await linkProductToOcasion(productId, ocasionTagId, rationale);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "ocasion.link_product",
    entityType: "ProductOcasionTag",
    entityId: `${productId}:${ocasionTagId}`,
    metadata: { rationale: rationale ?? "(sin rationale)" },
  });
  revalidatePath(`/admin/ocasiones/${ocasionTagId}`);
}

export async function unlinkProductOcasionAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.MANAGER_UP });

  const productId = String(formData.get("productId") ?? "");
  const ocasionTagId = String(formData.get("ocasionTagId") ?? "");

  await unlinkProductFromOcasion(productId, ocasionTagId);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "ocasion.unlink_product",
    entityType: "ProductOcasionTag",
    entityId: `${productId}:${ocasionTagId}`,
  });
  revalidatePath(`/admin/ocasiones/${ocasionTagId}`);
}
