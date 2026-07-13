"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCurrentAdmin } from "@/lib/auth";
import {
  RedirectValidationError,
  archiveRedirect,
  createRedirect,
  restoreRedirect,
  toggleRedirectActive,
  updateRedirect,
} from "@/features/redirects/service";
import { logger } from "@/lib/logger";

export type RedirectActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"fromPath" | "toPath" | "statusCode", string[]>>;
};

function parseStatusCode(raw: FormDataEntryValue | null): 301 | 302 {
  const n = Number(raw);
  return n === 302 ? 302 : 301;
}

export async function createRedirectAction(
  _prev: RedirectActionState | null,
  formData: FormData,
): Promise<RedirectActionState> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };
  if (session.admin.role !== "SUPERADMIN") return { error: "Solo un administrador principal." };

  const fromPath = String(formData.get("fromPath") ?? "").trim();
  const toPath = String(formData.get("toPath") ?? "").trim();
  const statusCode = parseStatusCode(formData.get("statusCode"));
  const description = String(formData.get("description") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  try {
    const created = await createRedirect(
      { fromPath, toPath, statusCode, description, isActive },
      session.admin.id,
    );
    await recordAdminAction({
      actorId: session.admin.id,
      action: "redirect.create",
      entityType: "UrlRedirect",
      entityId: created.id,
      metadata: { fromPath: created.fromPath, toPath: created.toPath },
    });
    logger.info({
      event: "admin.redirect.created",
      adminId: session.admin.id,
      fromPath: created.fromPath,
    });
    revalidatePath("/admin/redirects");
    redirect("/admin/redirects?created=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (err instanceof RedirectValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as RedirectActionState["fieldErrors"],
      };
    }
    logger.error({
      event: "admin.redirect.create_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error al crear redirect. Reintenta." };
  }
}

export async function updateRedirectAction(
  _prev: RedirectActionState | null,
  formData: FormData,
): Promise<RedirectActionState> {
  const session = await getCurrentAdmin();
  if (!session) return { error: "Sesión expirada." };
  if (session.admin.role !== "SUPERADMIN") return { error: "Solo un administrador principal." };

  const id = String(formData.get("id") ?? "");
  const toPath = String(formData.get("toPath") ?? "").trim();
  const statusCode = parseStatusCode(formData.get("statusCode"));
  const description = String(formData.get("description") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  try {
    const updated = await updateRedirect(
      { id, toPath, statusCode, description, isActive },
      session.admin.id,
    );
    await recordAdminAction({
      actorId: session.admin.id,
      action: "redirect.update",
      entityType: "UrlRedirect",
      entityId: id,
      metadata: { fromPath: updated.fromPath, toPath: updated.toPath },
    });
    revalidatePath("/admin/redirects");
    redirect("/admin/redirects?updated=1");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (err instanceof RedirectValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as RedirectActionState["fieldErrors"],
      };
    }
    return { error: "Error al actualizar redirect." };
  }
}

export async function toggleRedirectActiveAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  if (session.admin.role !== "SUPERADMIN") redirect("/admin/dashboard?denied=1");
  const id = String(formData.get("id") ?? "");
  try {
    const updated = await toggleRedirectActive(id, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: updated.isActive ? "redirect.activate" : "redirect.deactivate",
      entityType: "UrlRedirect",
      entityId: id,
    });
    revalidatePath("/admin/redirects");
    redirect(`/admin/redirects?${updated.isActive ? "activated" : "deactivated"}=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof RedirectValidationError ? err.message : "Error al cambiar estado.";
    redirect(`/admin/redirects?error=${encodeURIComponent(msg)}`);
  }
}

export async function archiveRedirectAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  if (session.admin.role !== "SUPERADMIN") redirect("/admin/dashboard?denied=1");
  const id = String(formData.get("id") ?? "");
  await archiveRedirect(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "redirect.archive",
    entityType: "UrlRedirect",
    entityId: id,
  });
  revalidatePath("/admin/redirects");
  redirect("/admin/redirects?archived=1");
}

export async function restoreRedirectAction(formData: FormData): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");
  if (session.admin.role !== "SUPERADMIN") redirect("/admin/dashboard?denied=1");
  const id = String(formData.get("id") ?? "");
  await restoreRedirect(id, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "redirect.restore",
    entityType: "UrlRedirect",
    entityId: id,
  });
  revalidatePath("/admin/redirects");
  redirect("/admin/redirects?restored=1");
}
