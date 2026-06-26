/*
 * Server Actions — Bulk actions de productos (Opción C Sprint 3).
 *
 * Patrón:
 *  - Form HTML envía N inputs name="productIds" value=ID (uno por checkbox marcado)
 *  - formData.getAll("productIds") devuelve array de strings
 *  - Validamos con Zod, llamamos al service helper bulk, auditamos
 *  - Redirect a /admin/productos con notice del resultado
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAdminAction } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import {
  bulkUpdateProductsActive,
  bulkUpdateProductsFeatured,
} from "@/features/products/service";

const BulkIdsSchema = z
  .array(z.string().min(1).max(50))
  .min(1, "Selecciona al menos un producto")
  .max(200, "Máximo 200 productos por lote");

function getIds(formData: FormData): string[] {
  return formData.getAll("productIds").map(String).filter(Boolean);
}

/**
 * bulkActivateProductsAction — activa N productos (visibles en la tienda).
 */
export async function bulkActivateProductsAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const parsed = BulkIdsSchema.safeParse(getIds(formData));
  if (!parsed.success) {
    redirect(
      `/admin/productos?bulkError=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Error de validación",
      )}`,
    );
  }

  const ids = parsed.data;
  const result = await bulkUpdateProductsActive(ids, true, session.admin.id);

  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.bulk.activate",
    entityType: "Product",
    entityId: ids.join(","),
    metadata: { count: result.count, ids },
  });
  logger.info({
    event: "admin.product.bulk_activate",
    adminId: session.admin.id,
    count: result.count,
  });

  revalidatePath("/admin/productos");
  revalidatePath("/admin/dashboard");
  redirect(`/admin/productos?bulkOk=${encodeURIComponent(`${result.count} productos activados.`)}`);
}

/**
 * bulkDeactivateProductsAction — pausa N productos (ocultos de la tienda).
 */
export async function bulkDeactivateProductsAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const parsed = BulkIdsSchema.safeParse(getIds(formData));
  if (!parsed.success) {
    redirect(
      `/admin/productos?bulkError=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Error de validación",
      )}`,
    );
  }

  const ids = parsed.data;
  const result = await bulkUpdateProductsActive(ids, false, session.admin.id);

  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.bulk.deactivate",
    entityType: "Product",
    entityId: ids.join(","),
    metadata: { count: result.count, ids },
  });
  logger.info({
    event: "admin.product.bulk_deactivate",
    adminId: session.admin.id,
    count: result.count,
  });

  revalidatePath("/admin/productos");
  revalidatePath("/admin/dashboard");
  redirect(
    `/admin/productos?bulkOk=${encodeURIComponent(`${result.count} productos pausados.`)}`,
  );
}

/**
 * bulkFeatureProductsAction — destaca N productos (aparecen en home).
 */
export async function bulkFeatureProductsAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const parsed = BulkIdsSchema.safeParse(getIds(formData));
  if (!parsed.success) {
    redirect(
      `/admin/productos?bulkError=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Error de validación",
      )}`,
    );
  }

  const ids = parsed.data;
  const result = await bulkUpdateProductsFeatured(ids, true, session.admin.id);

  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.bulk.feature",
    entityType: "Product",
    entityId: ids.join(","),
    metadata: { count: result.count, ids },
  });
  logger.info({
    event: "admin.product.bulk_feature",
    adminId: session.admin.id,
    count: result.count,
  });

  revalidatePath("/admin/productos");
  revalidatePath("/");
  redirect(
    `/admin/productos?bulkOk=${encodeURIComponent(`${result.count} productos destacados en home.`)}`,
  );
}

/**
 * bulkUnfeatureProductsAction — quita el destacado de N productos.
 */
export async function bulkUnfeatureProductsAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const parsed = BulkIdsSchema.safeParse(getIds(formData));
  if (!parsed.success) {
    redirect(
      `/admin/productos?bulkError=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Error de validación",
      )}`,
    );
  }

  const ids = parsed.data;
  const result = await bulkUpdateProductsFeatured(ids, false, session.admin.id);

  await recordAdminAction({
    actorId: session.admin.id,
    action: "product.bulk.unfeature",
    entityType: "Product",
    entityId: ids.join(","),
    metadata: { count: result.count, ids },
  });
  logger.info({
    event: "admin.product.bulk_unfeature",
    adminId: session.admin.id,
    count: result.count,
  });

  revalidatePath("/admin/productos");
  revalidatePath("/");
  redirect(
    `/admin/productos?bulkOk=${encodeURIComponent(
      `Se quitó destacado a ${result.count} productos.`,
    )}`,
  );
}
