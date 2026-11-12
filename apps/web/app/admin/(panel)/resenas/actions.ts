"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@lucams/db";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import {
  approveReview,
  archiveReview,
  bulkApproveReviews,
  bulkArchiveReviews,
  listProductSlugsForReviewIds,
  rejectReview,
  restoreReview,
  sanitizeReviewReturnPath,
  toggleFeaturedReview,
} from "@/features/reviews/admin-service";
import { logger } from "@/lib/logger";

function buildReturnRedirectUrl(basePath: string, extraParams: Record<string, string>): string {
  const qIdx = basePath.indexOf("?");
  const pathname = qIdx === -1 ? basePath : basePath.slice(0, qIdx);
  const existingQs = qIdx === -1 ? "" : basePath.slice(qIdx + 1);
  const params = new URLSearchParams(existingQs);
  for (const [k, v] of Object.entries(extraParams)) {
    params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function isNextRedirectSignal(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === "NEXT_REDIRECT") return true;
  if ("digest" in err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return true;
  }
  return false;
}

function safeReviewActionError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return "No encontramos la reseña solicitada (pudo eliminarse o actualizarse).";
  }
  if (err instanceof Error && /aprobadas/i.test(err.message)) {
    return "Solo las reseñas aprobadas pueden marcarse como destacadas.";
  }
  if (err instanceof Error && err.message === "Review not found") {
    return "No encontramos la reseña solicitada.";
  }
  return "No pudimos actualizar la reseña en este momento. Inténtalo de nuevo.";
}

function getId(formData: FormData, returnTo: string): string {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect(buildReturnRedirectUrl(returnTo, { error: "Falta el identificador de la reseña." }));
  }
  return id;
}

/**
 * Revalida las rutas storefront y admin que muestran reseñas (PDP, home, moderador y ficha producto).
 */
function revalidateForReview(productSlug: string | null, returnTo: string) {
  revalidatePath("/admin/resenas");
  revalidatePath("/admin/dashboard");
  revalidatePath("/");
  if (productSlug) revalidatePath(`/producto/${productSlug}`);
  if (returnTo.startsWith("/admin/productos/")) {
    const pathname = returnTo.split("?")[0];
    if (pathname) revalidatePath(pathname);
  }
}

export async function approveReviewAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "catalog:write" });
  const returnTo = sanitizeReviewReturnPath(formData.get("returnTo"));
  const id = getId(formData, returnTo);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  try {
    await approveReview(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "review.approve",
      entityType: "Review",
      entityId: id,
    });
    logger.info({ event: "admin.review.approved", adminId: session.admin.id, reviewId: id });

    revalidateForReview(productSlug, returnTo);
    redirect(
      buildReturnRedirectUrl(returnTo, {
        approved: "1",
        approvedId: id,
        ...(productSlug ? { slug: productSlug } : {}),
      }),
    );
  } catch (err) {
    if (isNextRedirectSignal(err)) throw err;
    logger.warn({ event: "admin.review.approve_fail", reviewId: id, err: String(err) });
    redirect(buildReturnRedirectUrl(returnTo, { error: safeReviewActionError(err) }));
  }
}

export async function rejectReviewAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "catalog:write" });
  const returnTo = sanitizeReviewReturnPath(formData.get("returnTo"));
  const id = getId(formData, returnTo);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  try {
    await rejectReview(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "review.reject",
      entityType: "Review",
      entityId: id,
    });
    logger.info({ event: "admin.review.rejected", adminId: session.admin.id, reviewId: id });

    revalidateForReview(productSlug, returnTo);
    redirect(buildReturnRedirectUrl(returnTo, { rejected: "1" }));
  } catch (err) {
    if (isNextRedirectSignal(err)) throw err;
    logger.warn({ event: "admin.review.reject_fail", reviewId: id, err: String(err) });
    redirect(buildReturnRedirectUrl(returnTo, { error: safeReviewActionError(err) }));
  }
}

export async function toggleFeaturedReviewAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "catalog:write" });
  const returnTo = sanitizeReviewReturnPath(formData.get("returnTo"));
  const id = getId(formData, returnTo);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  try {
    const updated = await toggleFeaturedReview(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: updated.featured ? "review.feature" : "review.unfeature",
      entityType: "Review",
      entityId: id,
    });
    revalidateForReview(productSlug, returnTo);
    redirect(
      buildReturnRedirectUrl(returnTo, updated.featured ? { featured: "1" } : { unfeatured: "1" }),
    );
  } catch (err) {
    if (isNextRedirectSignal(err)) throw err;
    logger.warn({ event: "admin.review.feature_fail", reviewId: id, err: String(err) });
    redirect(buildReturnRedirectUrl(returnTo, { error: safeReviewActionError(err) }));
  }
}

export async function archiveReviewAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "catalog:write" });
  const returnTo = sanitizeReviewReturnPath(formData.get("returnTo"));
  const id = getId(formData, returnTo);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  try {
    await archiveReview(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "review.archive",
      entityType: "Review",
      entityId: id,
    });
    logger.info({ event: "admin.review.archived", adminId: session.admin.id, reviewId: id });

    revalidateForReview(productSlug, returnTo);
    redirect(buildReturnRedirectUrl(returnTo, { archived: "1" }));
  } catch (err) {
    if (isNextRedirectSignal(err)) throw err;
    logger.warn({ event: "admin.review.archive_fail", reviewId: id, err: String(err) });
    redirect(buildReturnRedirectUrl(returnTo, { error: safeReviewActionError(err) }));
  }
}

export async function restoreReviewAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "catalog:write" });
  const returnTo = sanitizeReviewReturnPath(formData.get("returnTo"));
  const id = getId(formData, returnTo);
  const productSlug = (formData.get("productSlug") as string | null) ?? null;

  try {
    await restoreReview(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "review.restore",
      entityType: "Review",
      entityId: id,
    });
    revalidateForReview(productSlug, returnTo);
    redirect(buildReturnRedirectUrl(returnTo, { restored: "1" }));
  } catch (err) {
    if (isNextRedirectSignal(err)) throw err;
    logger.warn({ event: "admin.review.restore_fail", reviewId: id, err: String(err) });
    redirect(buildReturnRedirectUrl(returnTo, { error: safeReviewActionError(err) }));
  }
}

/**
 * Bulk approve/archive — exclusivo `catalog:write` con revalidación completa de PDPs afectadas.
 */

const BulkReviewIdsSchema = z
  .array(z.string().min(1).max(50))
  .min(1, "Selecciona al menos una reseña")
  .max(100, "Máximo 100 reseñas por lote");

function getReviewIds(formData: FormData): string[] {
  return formData.getAll("reviewIds").map(String).filter(Boolean);
}

export async function bulkApproveReviewsAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "catalog:write" });

  const parsed = BulkReviewIdsSchema.safeParse(getReviewIds(formData));
  if (!parsed.success) {
    redirect(
      `/admin/resenas?bulkError=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Datos inválidos")}`,
    );
  }

  const ids = parsed.data;
  const affectedSlugs = await listProductSlugsForReviewIds(ids);
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
  for (const slug of affectedSlugs) {
    revalidatePath(`/producto/${slug}`);
  }
  redirect(
    `/admin/resenas?bulkOk=${encodeURIComponent(
      `${result.count} reseñas aprobadas: ya aparecen en sus páginas de producto. Para mostrar alguna en la página principal, usa el botón ★ Destacar de su fila.`,
    )}`,
  );
}

export async function bulkArchiveReviewsAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ capability: "catalog:write" });

  const parsed = BulkReviewIdsSchema.safeParse(getReviewIds(formData));
  if (!parsed.success) {
    redirect(
      `/admin/resenas?bulkError=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Datos inválidos")}`,
    );
  }

  const ids = parsed.data;
  const affectedSlugs = await listProductSlugsForReviewIds(ids);
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
  for (const slug of affectedSlugs) {
    revalidatePath(`/producto/${slug}`);
  }
  redirect(`/admin/resenas?bulkOk=${encodeURIComponent(`${result.count} reseñas archivadas.`)}`);
}
