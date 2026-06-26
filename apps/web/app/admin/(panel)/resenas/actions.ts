"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCurrentAdmin } from "@/lib/auth";
import {
  approveReview,
  archiveReview,
  bulkApproveReviews,
  bulkArchiveReviews,
  rejectReview,
  restoreReview,
  toggleFeaturedReview,
} from "@/features/reviews/admin-service";
import { logger } from "@/lib/logger";

function getId(formData: FormData): string {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing review id");
  return id;
}

/**
 * Revalida las rutas storefront que muestran reseñas. La PDP por slug
 * + home (featured carousel). El admin lista también necesita refresh.
 */
function revalidateForReview(productSlug: string | null) {
  revalidatePath("/admin/resenas");
  revalidatePath("/");
  if (productSlug) revalidatePath(`/producto/${productSlug}`);
}

export async function approveReviewAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const id = getId(formData);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  await approveReview(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "review.approve",
    entityType: "Review",
    entityId: id,
  });
  logger.info({ event: "admin.review.approved", adminId: session.admin.id, reviewId: id });

  revalidateForReview(productSlug);
  redirect("/admin/resenas?approved=1");
}

export async function rejectReviewAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const id = getId(formData);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  await rejectReview(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "review.reject",
    entityType: "Review",
    entityId: id,
  });
  logger.info({ event: "admin.review.rejected", adminId: session.admin.id, reviewId: id });

  revalidateForReview(productSlug);
  redirect("/admin/resenas?rejected=1");
}

export async function toggleFeaturedReviewAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const id = getId(formData);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  try {
    const updated = await toggleFeaturedReview(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: updated.featured ? "review.feature" : "review.unfeature",
      entityType: "Review",
      entityId: id,
    });
    revalidateForReview(productSlug);
    redirect(`/admin/resenas?${updated.featured ? "featured" : "unfeatured"}=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof Error ? err.message : "Error al cambiar destacado.";
    redirect(`/admin/resenas?error=${encodeURIComponent(msg)}`);
  }
}

export async function archiveReviewAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const id = getId(formData);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  await archiveReview(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "review.archive",
    entityType: "Review",
    entityId: id,
  });
  logger.info({ event: "admin.review.archived", adminId: session.admin.id, reviewId: id });

  revalidateForReview(productSlug);
  redirect("/admin/resenas?archived=1");
}

export async function restoreReviewAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  const id = getId(formData);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  await restoreReview(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "review.restore",
    entityType: "Review",
    entityId: id,
  });
  revalidateForReview(productSlug);
  redirect("/admin/resenas?restored=1");
}

/**
 * Bulk approve/archive — Lucy 2026-06-26 Opción C backlog.
 * Patrón espejo de bulk-actions.ts de productos.
 */

const BulkReviewIdsSchema = z
  .array(z.string().min(1).max(50))
  .min(1, "Selecciona al menos una reseña")
  .max(100, "Máximo 100 reseñas por lote");

function getReviewIds(formData: FormData): string[] {
  return formData.getAll("reviewIds").map(String).filter(Boolean);
}

export async function bulkApproveReviewsAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const parsed = BulkReviewIdsSchema.safeParse(getReviewIds(formData));
  if (!parsed.success) {
    redirect(
      `/admin/resenas?bulkError=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Datos inválidos")}`,
    );
  }

  const ids = parsed.data;
  const result = await bulkApproveReviews(ids, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "review.bulk.approve",
    entityType: "Review",
    entityId: ids.join(","),
    metadata: { count: result.count, ids },
  });
  logger.info({
    event: "admin.review.bulk_approve",
    adminId: session.admin.id,
    count: result.count,
  });

  revalidatePath("/admin/resenas");
  revalidatePath("/admin/dashboard");
  revalidatePath("/");
  redirect(
    `/admin/resenas?bulkOk=${encodeURIComponent(`${result.count} reseñas aprobadas y publicadas.`)}`,
  );
}

export async function bulkArchiveReviewsAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const parsed = BulkReviewIdsSchema.safeParse(getReviewIds(formData));
  if (!parsed.success) {
    redirect(
      `/admin/resenas?bulkError=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Datos inválidos")}`,
    );
  }

  const ids = parsed.data;
  const result = await bulkArchiveReviews(ids, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "review.bulk.archive",
    entityType: "Review",
    entityId: ids.join(","),
    metadata: { count: result.count, ids },
  });
  logger.info({
    event: "admin.review.bulk_archive",
    adminId: session.admin.id,
    count: result.count,
  });

  revalidatePath("/admin/resenas");
  revalidatePath("/admin/dashboard");
  revalidatePath("/");
  redirect(
    `/admin/resenas?bulkOk=${encodeURIComponent(`${result.count} reseñas archivadas.`)}`,
  );
}
