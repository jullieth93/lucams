/*
 * Server Actions — Admin Contenido (CMS v2: CmsPage → CmsSection → CmsField).
 *
 * Patrón Lucams: actions delgadas, validación Zod aquí + delegación
 * al service. getCurrentAdmin defensivo (requireAdminAction, set CONTENT:
 * SUPERADMIN + CMS_EDITOR). AdminActionLog en cada mutación.
 * updateTag("cms") invalida el cache
 * público cuando el cambio ya se ve en el sitio (publicar, despublicar,
 * archivar, crear/guardar un SETTING — los ajustes se aplican al guardar).
 *
 * Revalidación: cada mutación refresca el índice, el editor del campo y
 * el editor de la página a la que pertenece (se obtiene del propio campo).
 */

"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAdminAction } from "@/lib/admin-audit";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { logger } from "@/lib/logger";
import {
  CmsFieldCreateSchema,
  CmsFieldItemsSaveSchema,
  CmsFieldSaveSchema,
  CmsPageUpdateSchema,
  CmsSectionUpdateSchema,
} from "@/features/cms/schemas";
import {
  CmsValidationError,
  createCmsField,
  duplicateCmsField,
  getCmsFieldById,
  listCmsDraftFields,
  moveCmsFieldToSection,
  publishCmsFieldVersion,
  saveCmsFieldDraft,
  saveCmsFieldItems,
  scheduleCmsFieldPublish,
  softDeleteCmsField,
  unpublishCmsField,
  unscheduleCmsFieldPublish,
  updateCmsPage,
  updateCmsSection,
} from "@/features/cms/service";
import { StorageError } from "@/lib/storage";
import { deleteCmsMedia, updateCmsMediaAlt, uploadCmsMedia } from "@/lib/cms-media";

export type CmsActionState = {
  error?: string;
  ok?: boolean;
  fieldErrors?: Partial<
    Record<
      "sectionId" | "key" | "kind" | "label" | "helpText" | "type" | "category" | "body",
      string[]
    >
  >;
};

/** Ruta de vuelta segura: solo paths internos de contenido, sin query. */
function safeBackPath(raw: FormDataEntryValue | null, fallback: string): string {
  const v = String(raw ?? "").split("?")[0];
  return v.startsWith("/admin/contenido") ? v : fallback;
}

/** Revalida las 3 vistas afectadas por un campo: índice, su página y su editor. */
function revalidateCmsPaths(fieldId: string, pageSlug?: string | null) {
  revalidatePath("/admin/contenido");
  revalidatePath(`/admin/contenido/campos/${fieldId}`);
  if (pageSlug) revalidatePath(`/admin/contenido/paginas/${pageSlug}`);
}

// ─────────────────── Guardar (borrador BLOCK / save+publish SETTING) ───────────────────

/**
 * Única action de guardado: la usa la edición inline del editor de página
 * (solo id+body) y el editor completo del campo (id+body+label+helpText).
 * El service decide la semántica: BLOCK queda en borrador; SETTING publica
 * de inmediato (por eso ahí sí invalidamos el tag "cms").
 */
export async function saveCmsFieldAction(
  _prev: CmsActionState | null,
  formData: FormData,
): Promise<CmsActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  // label/helpText solo viajan desde el editor completo; si no vienen,
  // van undefined y el service conserva los valores actuales.
  const labelRaw = formData.get("label");
  const helpRaw = formData.get("helpText");
  const parsed = CmsFieldSaveSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    body: String(formData.get("body") ?? ""),
    ...(labelRaw !== null ? { label: String(labelRaw).trim() } : {}),
    ...(helpRaw !== null ? { helpText: String(helpRaw).trim() || null } : {}),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Te faltan algunos datos.",
      fieldErrors: flat.fieldErrors as CmsActionState["fieldErrors"],
    };
  }

  try {
    await saveCmsFieldDraft(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.save",
      entityType: "CmsField",
      entityId: parsed.data.id,
    });
    const field = await getCmsFieldById(parsed.data.id);
    // Los SETTING se publican al guardar → el sitio ya cambió.
    if (field?.kind === "SETTING") updateTag("cms");
    revalidateCmsPaths(parsed.data.id, field?.section.page.slug);
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsValidationError) {
      return { error: err.message };
    }
    logger.error({
      event: "admin.cms.field.save_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos guardar el cambio. Intenta de nuevo." };
  }
}

// ─────────────────── Guardar filas de un campo LISTA ───────────────────

/**
 * Guardado de un campo LISTA (el editor de filas serializa los items a JSON
 * en el hidden input `items`). Misma semántica que saveCmsFieldAction: BLOCK
 * queda en borrador (NO se invalida el tag "cms" — hay que Publicar aparte);
 * SETTING publica al guardar (ahí sí se invalida).
 */
export async function saveCmsFieldItemsAction(
  _prev: CmsActionState | null,
  formData: FormData,
): Promise<CmsActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  let itemsRaw: unknown;
  try {
    itemsRaw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Los datos de la lista llegaron incompletos. Intenta de nuevo." };
  }
  const parsed = CmsFieldItemsSaveSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    items: itemsRaw,
  });
  if (!parsed.success) {
    return { error: "Te faltan algunos datos." };
  }

  try {
    await saveCmsFieldItems(parsed.data.id, parsed.data.items, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.items.save",
      entityType: "CmsField",
      entityId: parsed.data.id,
      metadata: { itemCount: parsed.data.items.length },
    });
    const field = await getCmsFieldById(parsed.data.id);
    // Los SETTING se publican al guardar → el sitio ya cambió.
    if (field?.kind === "SETTING") updateTag("cms");
    revalidateCmsPaths(parsed.data.id, field?.section.page.slug);
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsValidationError) {
      return { error: err.message };
    }
    logger.error({
      event: "admin.cms.field.items_save_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos guardar la lista. Intenta de nuevo." };
  }
}

// ─────────────────── Crear campo ───────────────────

export async function createCmsFieldAction(
  _prev: CmsActionState | null,
  formData: FormData,
): Promise<CmsActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const parsed = CmsFieldCreateSchema.safeParse({
    sectionId: String(formData.get("sectionId") ?? ""),
    key: String(formData.get("key") ?? "").trim(),
    kind: formData.get("kind") ?? "BLOCK",
    label: String(formData.get("label") ?? "").trim(),
    helpText: ((formData.get("helpText") as string) || "").trim() || null,
    type: formData.get("type") ?? "TEXT",
    category: String(formData.get("category") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Te faltan algunos datos.",
      fieldErrors: flat.fieldErrors as CmsActionState["fieldErrors"],
    };
  }

  try {
    const field = await createCmsField(parsed.data, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.create",
      entityType: "CmsField",
      entityId: field.id,
      metadata: { key: field.key, kind: field.kind },
    });
    // Los SETTING nacen publicados (visibles en el sitio de inmediato).
    if (field.kind === "SETTING") updateTag("cms");
    revalidateCmsPaths(field.id);
    redirect(`/admin/contenido/campos/${field.id}?created=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (err instanceof CmsValidationError) {
      return {
        error: err.message,
        fieldErrors: { [err.field]: [err.message] } as CmsActionState["fieldErrors"],
      };
    }
    logger.error({
      event: "admin.cms.field.create_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos crear el campo. Intenta de nuevo." };
  }
}

// ─────────────────── Publicar / Despublicar / Archivar ───────────────────

export async function publishCmsFieldAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const fieldId = String(formData.get("fieldId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!fieldId || !versionId) redirect("/admin/contenido");
  const back = safeBackPath(formData.get("redirectTo"), `/admin/contenido/campos/${fieldId}`);

  try {
    await publishCmsFieldVersion(fieldId, versionId, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.publish",
      entityType: "CmsField",
      entityId: fieldId,
      metadata: { versionId },
    });
    updateTag("cms");
    const field = await getCmsFieldById(fieldId);
    revalidateCmsPaths(fieldId, field?.section.page.slug);
    redirect(`${back}?published=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.cms.field.publish_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(
      `${back}?error=${encodeURIComponent("No pudimos publicar la versión. Intenta de nuevo.")}`,
    );
  }
}

export async function unpublishCmsFieldAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const fieldId = String(formData.get("fieldId") ?? "");
  if (!fieldId) redirect("/admin/contenido");
  const back = safeBackPath(formData.get("redirectTo"), `/admin/contenido/campos/${fieldId}`);

  try {
    await unpublishCmsField(fieldId, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.unpublish",
      entityType: "CmsField",
      entityId: fieldId,
    });
    updateTag("cms");
    const field = await getCmsFieldById(fieldId);
    revalidateCmsPaths(fieldId, field?.section.page.slug);
    redirect(`${back}?unpublished=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // El service rechaza despublicar SETTING — el mensaje es amigable, se muestra tal cual.
    const msg =
      err instanceof CmsValidationError
        ? err.message
        : "No pudimos despublicar el campo. Intenta de nuevo.";
    if (!(err instanceof CmsValidationError)) {
      logger.error({
        event: "admin.cms.field.unpublish_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    redirect(`${back}?error=${encodeURIComponent(msg)}`);
  }
}

export async function deleteCmsFieldAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const fieldId = String(formData.get("fieldId") ?? "");
  if (!fieldId) redirect("/admin/contenido");

  // Buscamos la página ANTES de archivar para saber a dónde volver.
  const field = await getCmsFieldById(fieldId);
  const back = field ? `/admin/contenido/paginas/${field.section.page.slug}` : "/admin/contenido";

  await softDeleteCmsField(fieldId, session.admin.id);
  await recordAdminAction({
    actorId: session.admin.id,
    action: "cms.field.archive",
    entityType: "CmsField",
    entityId: fieldId,
    metadata: { key: field?.key },
  });
  updateTag("cms");
  revalidateCmsPaths(fieldId, field?.section.page.slug);
  redirect(`${back}?archived=1`);
}

// ─────────────────── Publicación programada (roadmap C3) ───────────────────

/**
 * La hora que elige Lucy en el date-picker (datetime-local, sin zona) es hora
 * de COLOMBIA (America/Bogota, UTC-5 fijo — sin horario de verano). Se
 * convierte a UTC pegando el offset; el service valida que sea futura.
 */
function parseBogotaDateTimeLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function scheduleCmsPublishAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const fieldId = String(formData.get("fieldId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!fieldId || !versionId) redirect("/admin/contenido");
  const back = safeBackPath(formData.get("redirectTo"), `/admin/contenido/campos/${fieldId}`);

  const publishAt = parseBogotaDateTimeLocal(String(formData.get("publishAt") ?? ""));
  if (!publishAt) {
    redirect(`${back}?error=${encodeURIComponent("Elige una fecha y hora válidas.")}`);
  }

  try {
    await scheduleCmsFieldPublish(fieldId, versionId, publishAt, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.schedule",
      entityType: "CmsField",
      entityId: fieldId,
      metadata: { versionId, publishAt: publishAt.toISOString() },
    });
    // No se invalida el tag "cms": el contenido público NO cambia hasta que
    // el cron publique la versión (ahí sí se invalida — ver endpoint del cron).
    const field = await getCmsFieldById(fieldId);
    revalidateCmsPaths(fieldId, field?.section.page.slug);
    redirect(`${back}?scheduled=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg =
      err instanceof CmsValidationError
        ? err.message
        : "No pudimos programar la publicación. Intenta de nuevo.";
    if (!(err instanceof CmsValidationError)) {
      logger.error({
        event: "admin.cms.field.schedule_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    redirect(`${back}?error=${encodeURIComponent(msg)}`);
  }
}

export async function unscheduleCmsPublishAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const fieldId = String(formData.get("fieldId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!fieldId || !versionId) redirect("/admin/contenido");
  const back = safeBackPath(formData.get("redirectTo"), `/admin/contenido/campos/${fieldId}`);

  try {
    await unscheduleCmsFieldPublish(fieldId, versionId);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.unschedule",
      entityType: "CmsField",
      entityId: fieldId,
      metadata: { versionId },
    });
    const field = await getCmsFieldById(fieldId);
    revalidateCmsPaths(fieldId, field?.section.page.slug);
    redirect(`${back}?unscheduled=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg =
      err instanceof CmsValidationError
        ? err.message
        : "No pudimos quitar la programación. Intenta de nuevo.";
    if (!(err instanceof CmsValidationError)) {
      logger.error({
        event: "admin.cms.field.unschedule_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    redirect(`${back}?error=${encodeURIComponent(msg)}`);
  }
}

// ─────────────────── Utilidades de estructura (roadmap C4) ───────────────────

export async function updateCmsPageAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const parsed = CmsPageUpdateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });
  const back = safeBackPath(formData.get("redirectTo"), "/admin/contenido");
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent("Revisa el nombre de la página.")}`);
  }

  try {
    await updateCmsPage(parsed.data);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.page.update",
      entityType: "CmsPage",
      entityId: parsed.data.id,
      metadata: { title: parsed.data.title },
    });
    revalidatePath("/admin/contenido");
    revalidatePath(back);
    redirect(`${back}?renamed=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.cms.page.update_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`${back}?error=${encodeURIComponent("No pudimos renombrar la página.")}`);
  }
}

export async function updateCmsSectionAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const parsed = CmsSectionUpdateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });
  const back = safeBackPath(formData.get("redirectTo"), "/admin/contenido");
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent("Revisa el nombre de la sección.")}`);
  }

  try {
    await updateCmsSection(parsed.data);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.section.update",
      entityType: "CmsSection",
      entityId: parsed.data.id,
      metadata: { title: parsed.data.title },
    });
    revalidatePath("/admin/contenido");
    revalidatePath(back);
    redirect(`${back}?renamed=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.cms.section.update_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(`${back}?error=${encodeURIComponent("No pudimos renombrar la sección.")}`);
  }
}

/** Mueve un campo a otra sección (de esta u otra página). */
export async function moveCmsFieldAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const fieldId = String(formData.get("fieldId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!fieldId || !sectionId) redirect("/admin/contenido");
  const back = safeBackPath(formData.get("redirectTo"), `/admin/contenido/campos/${fieldId}`);

  try {
    await moveCmsFieldToSection(fieldId, sectionId, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.move",
      entityType: "CmsField",
      entityId: fieldId,
      metadata: { sectionId },
    });
    // El contenido público NO cambia (es reordenamiento admin) → no updateTag.
    revalidatePath("/admin/contenido");
    const field = await getCmsFieldById(fieldId);
    if (field) revalidatePath(`/admin/contenido/paginas/${field.section.page.slug}`);
    redirect(`${back}?moved=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof CmsValidationError ? err.message : "No pudimos mover el campo.";
    if (!(err instanceof CmsValidationError)) {
      logger.error({
        event: "admin.cms.field.move_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    redirect(`${back}?error=${encodeURIComponent(msg)}`);
  }
}

/** Duplica un campo como borrador sin publicar y lleva a su editor. */
export async function duplicateCmsFieldAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const fieldId = String(formData.get("fieldId") ?? "");
  const newKey = String(formData.get("newKey") ?? "");
  if (!fieldId) redirect("/admin/contenido");
  const back = safeBackPath(formData.get("redirectTo"), `/admin/contenido/campos/${fieldId}`);

  try {
    const copy = await duplicateCmsField(fieldId, newKey, session.admin.id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.field.duplicate",
      entityType: "CmsField",
      entityId: copy.id,
      metadata: { sourceFieldId: fieldId, key: copy.key },
    });
    revalidatePath("/admin/contenido");
    redirect(`/admin/contenido/campos/${copy.id}?created=1`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof CmsValidationError ? err.message : "No pudimos duplicar el campo.";
    if (!(err instanceof CmsValidationError)) {
      logger.error({
        event: "admin.cms.field.duplicate_fail",
        adminId: session.admin.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    redirect(`${back}?error=${encodeURIComponent(msg)}`);
  }
}

/** Publica en lote TODOS los borradores del sitio (vista «Solo borradores»). */
export async function publishAllCmsDraftsAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });
  const back = safeBackPath(formData.get("redirectTo"), "/admin/contenido/borradores");

  try {
    const drafts = await listCmsDraftFields();
    let published = 0;
    for (const field of drafts) {
      const latest = field.versions[0];
      if (!latest) continue;
      await publishCmsFieldVersion(field.id, latest.id, session.admin.id);
      published += 1;
    }
    if (published > 0) {
      await recordAdminAction({
        actorId: session.admin.id,
        action: "cms.field.publish_all",
        entityType: "CmsField",
        entityId: "batch",
        metadata: { count: published },
      });
      updateTag("cms");
    }
    revalidatePath("/admin/contenido");
    revalidatePath("/admin/contenido/borradores");
    redirect(`${back}?published=${published}`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    logger.error({
      event: "admin.cms.field.publish_all_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    redirect(
      `${back}?error=${encodeURIComponent("No pudimos publicar en lote. Intenta de nuevo.")}`,
    );
  }
}

// ─────────────────── Mediateca (roadmap B5) ───────────────────

export type CmsMediaActionState = {
  error?: string;
  ok?: boolean;
  media?: {
    id: string;
    url: string;
    alt: string;
    width: number;
    height: number;
  };
};

/**
 * Sube una imagen a la mediateca (campos type IMAGE). Recibe el archivo y el
 * texto alternativo (obligatorio, a11y) por FormData; devuelve el asset creado
 * para que el editor del campo lo fije como `body` (CmsMedia.id). No invalida
 * el tag "cms": la imagen solo se ve en el sitio cuando el campo se GUARDA.
 */
export async function uploadCmsMediaAction(
  _prev: CmsMediaActionState | null,
  formData: FormData,
): Promise<CmsMediaActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const file = formData.get("file");
  const alt = String(formData.get("alt") ?? "");
  if (!(file instanceof File)) {
    return { error: "Elige un archivo de imagen primero." };
  }

  try {
    const media = await uploadCmsMedia({ file, alt, createdBy: session.admin.id });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.media.upload",
      entityType: "CmsMedia",
      entityId: media.id,
      metadata: { path: media.path, bytes: media.bytes, mime: media.mime },
    });
    revalidatePath("/admin/contenido/mediateca");
    return {
      ok: true,
      media: {
        id: media.id,
        url: media.url,
        alt: media.alt,
        width: media.width,
        height: media.height,
      },
    };
  } catch (err) {
    if (err instanceof CmsValidationError || err instanceof StorageError) {
      return { error: err.message };
    }
    logger.error({
      event: "admin.cms.media.upload_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos subir la imagen. Intenta de nuevo." };
  }
}

/** Edita el texto alternativo de un asset (desde la mediateca). */
export async function updateCmsMediaAltAction(
  _prev: CmsMediaActionState | null,
  formData: FormData,
): Promise<CmsMediaActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const id = String(formData.get("id") ?? "");
  const alt = String(formData.get("alt") ?? "");
  if (!id) return { error: "Imagen no encontrada." };

  try {
    await updateCmsMediaAlt(id, alt);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.media.alt",
      entityType: "CmsMedia",
      entityId: id,
    });
    revalidatePath("/admin/contenido/mediateca");
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsValidationError) return { error: err.message };
    logger.error({
      event: "admin.cms.media.alt_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos guardar el texto alternativo. Intenta de nuevo." };
  }
}

/**
 * Borra un asset de la mediateca. El service rechaza si algún campo lo usa
 * (borrador actual o cualquier versión del historial) — el mensaje llega tal
 * cual al admin con las keys de los campos.
 */
export async function deleteCmsMediaAction(
  _prev: CmsMediaActionState | null,
  formData: FormData,
): Promise<CmsMediaActionState> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Imagen no encontrada." };

  try {
    await deleteCmsMedia(id);
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.media.delete",
      entityType: "CmsMedia",
      entityId: id,
    });
    revalidatePath("/admin/contenido/mediateca");
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsValidationError || err instanceof StorageError) {
      return { error: err.message };
    }
    logger.error({
      event: "admin.cms.media.delete_fail",
      adminId: session.admin.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "No pudimos borrar la imagen. Intenta de nuevo." };
  }
}

// ─────────────────── Caché pública del CMS ───────────────────

/**
 * "Actualizar caché de contenido" (feedback Lucy 2026-07-23): las páginas públicas leen
 * CMS con unstable_cache tag "cms" (lib/cms.ts). Cuando el contenido se edita DIRECTO en
 * la DB con un script de packages/db/scripts (seed-cms, update-legal-*, fix-voseo-cms…),
 * nadie invalida el tag y el sitio sirve la versión vieja hasta 1h (revalidate 3600).
 * `updateTag` solo puede llamarse dentro de un Server Action (Next 16) → este botón es
 * el mecanismo manual de invalidación tras correr esos scripts. No toca la DB.
 */
export async function refreshCmsCacheAction(formData: FormData): Promise<void> {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });

  await recordAdminAction({
    actorId: session.admin.id,
    action: "cms.cache.refresh",
    entityType: "CmsField",
    entityId: "cms-cache",
    metadata: { reason: "manual refresh tras edición directa en DB" },
  });
  updateTag("cms");
  const back = safeBackPath(formData.get("from"), "/admin/contenido");
  revalidatePath(back);
  redirect(`${back}?cache=refreshed`);
}
