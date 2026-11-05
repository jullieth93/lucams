/*
 * Admin > Contenido > Editor de campo (CMS v2) — adaptación de la vieja
 * pantalla bloques/[id] al modelo CmsField.
 *
 * 2 secciones:
 *  - Editor: según el tipo (Markdown con preview, JSON con validación suave,
 *    input/textarea simple) + nombre/ayuda colapsables. Los campos LISTA
 *    (metadata.listSchema) usan el editor de filas (list-editor-form).
 *  - Historial: versiones anteriores con botón "Volver a esta".
 *
 * Utilidades (roadmap C4): «Mover a otra sección» (de esta u otra página) y
 * «Duplicar este campo» (la copia nace borrador sin publicar).
 *
 * Acciones de header: Publicar última versión (si hay borrador más nuevo),
 * PROGRAMAR la publicación para una fecha futura (roadmap C3 — la publica el
 * cron lucams-cms-publish-scheduled; hora de Colombia), Despublicar (SOLO
 * kind BLOCK — los ajustes no se pueden despublicar) y Archivar (soft delete
 * → vuelve al editor de la página).
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ExternalLink,
  History,
  Send,
  EyeOff,
  X,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
} from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ADMIN_ROLE_SETS, adminHomePath } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { getCmsFieldById, getCmsFieldItems, getCmsListSchema } from "@/features/cms/service";
import { cmsMediaPublicUrl, listCmsMedia } from "@/lib/cms-media";
import { prisma } from "@/lib/db";
import {
  publishCmsFieldAction,
  scheduleCmsPublishAction,
  unpublishCmsFieldAction,
  unscheduleCmsPublishAction,
} from "../../actions";
import {
  MODULE_MANAGED_SETTING_KEYS,
  ownerModuleHrefForSettingKey,
  publicPathForCmsFieldKey,
} from "../../page-icons";
import { FieldEditorForm } from "./field-editor-form";
import { ListEditorForm } from "./list-editor-form";
import { VersionHistory } from "./version-history";
import { formatDateTimeCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Editar campo",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** "Ahora" en hora de Colombia (UTC-5 fijo) formateado para input datetime-local. */
function nowBogotaLocal(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16);
}

/** Fecha UTC → texto humano en hora de Colombia (es-CO) vía helper compartido. */
function formatBogotaHuman(d: Date): string {
  return formatDateTimeCO(d);
}

export default async function EditarCampoPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await requireRole(ADMIN_ROLE_SETS.CONTENT);

  const { id } = await params;
  const sp = await searchParams;
  const justPublished = sp.published === "1";
  const justUnpublished = sp.unpublished === "1";
  const justScheduled = sp.scheduled === "1";
  const justUnscheduled = sp.unscheduled === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const field = await getCmsFieldById(id);
  if (!field) notFound();

  const page = field.section.page;
  if (page.slug === "global" && session.admin.role !== "SUPERADMIN") {
    redirect(`${adminHomePath(session.admin.role)}?denied=1`);
  }
  if (MODULE_MANAGED_SETTING_KEYS.has(field.key)) {
    redirect(ownerModuleHrefForSettingKey(field.key) ?? "/admin/contenido/paginas/global");
  }

  const pageHref = `/admin/contenido/paginas/${page.slug}`;
  const selfHref = `/admin/contenido/campos/${field.id}`;
  const fieldPublicPath = publicPathForCmsFieldKey(field.key) ?? page.path;

  // La última versión guardada (puede ser borrador o ya publicada).
  const latestVersion = field.versions[0];
  const canPublishLatest = latestVersion && latestVersion.id !== field.publishedVersionId;

  // Campo LISTA (roadmap B4): se edita como filas con inputs por subcampo,
  // no con el editor de body. Los items vienen de CmsListItem o se derivan
  // del body JSON (migración perezosa al abrir el editor).
  const listSchema = getCmsListSchema(field.metadata);
  const listItems = listSchema ? await getCmsFieldItems(field.id) : null;

  // Campo IMAGE (roadmap B5): body = CmsMedia.id. Se resuelve el asset actual
  // y la mediateca reciente para el control (subir / reutilizar).
  const isImage = field.type === "IMAGE" && !listSchema;
  // Lista con subcampo IMAGE (roadmap B6, ej. home.banners): el editor de
  // filas también necesita la mediateca para la imagen de cada fila.
  const listHasImage = listSchema?.some((s) => s.type === "IMAGE") ?? false;
  const imageMedia =
    isImage && field.body.trim()
      ? await prisma.cmsMedia.findUnique({ where: { id: field.body.trim() } })
      : null;
  const imageLibrary =
    isImage || listHasImage
      ? (await listCmsMedia(60)).map((m) => ({
          id: m.id,
          url: m.url,
          alt: m.alt,
          width: m.width,
          height: m.height,
        }))
      : null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<BookOpen className="h-5 w-5" />}
        title={field.label}
        subtitle={
          <>
            <code className="bg-brand-purple/8 text-brand-purple-dark mr-2 rounded px-1.5 py-0.5 font-mono text-[11px]">
              {field.key}
            </code>
            {field.isPublished ? (
              <AdminBadge tone="emerald">🟢 Publicado en el sitio</AdminBadge>
            ) : (
              <AdminBadge tone="amber">🟡 Borrador — no se ve en el sitio</AdminBadge>
            )}{" "}
            {field.kind === "SETTING" && (
              <AdminBadge tone="purple">Se aplica apenas guardas</AdminBadge>
            )}
          </>
        }
        breadcrumbs={
          page.slug === "global"
            ? [
                { label: "Admin", href: "/admin/dashboard" },
                { label: "Configuración" },
                { label: page.title, href: pageHref },
                { label: field.label },
              ]
            : [
                { label: "Admin", href: "/admin/dashboard" },
                { label: "Contenido", href: "/admin/contenido" },
                { label: page.title, href: pageHref },
                { label: field.label },
              ]
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton href={pageHref} variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </AdminButton>
            {fieldPublicPath && (
              <a
                href={fieldPublicPath}
                target="_blank"
                rel="noopener noreferrer"
                className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold transition-all"
              >
                Ver {fieldPublicPath}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {canPublishLatest && (
              <form action={publishCmsFieldAction}>
                <input type="hidden" name="fieldId" value={field.id} />
                <input type="hidden" name="versionId" value={latestVersion.id} />
                <input type="hidden" name="redirectTo" value={selfHref} />
                <Hint content="Hacer pública la última versión guardada">
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {field.isPublished ? "Publicar nueva versión" : "Publicar"}
                  </Button>
                </Hint>
              </form>
            )}
            {/* C3 — Publicación programada: el cron publica la versión cuando
                vence la fecha (hora de Colombia). Si ya hay programación, se
                muestra con opción de quitarla. */}
            {canPublishLatest &&
              (latestVersion.publishAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2.5 py-1.5 text-xs font-medium text-sky-900">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Sale el {formatBogotaHuman(latestVersion.publishAt)} (hora Colombia)
                  <form action={unscheduleCmsPublishAction}>
                    <input type="hidden" name="fieldId" value={field.id} />
                    <input type="hidden" name="versionId" value={latestVersion.id} />
                    <input type="hidden" name="redirectTo" value={selfHref} />
                    <Hint content="Quitar la programación (la versión queda como borrador)">
                      <button
                        type="submit"
                        className="ml-0.5 rounded-full p-0.5 hover:bg-sky-200"
                        aria-label="Quitar la programación"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Hint>
                  </form>
                </span>
              ) : (
                <form action={scheduleCmsPublishAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="fieldId" value={field.id} />
                  <input type="hidden" name="versionId" value={latestVersion.id} />
                  <input type="hidden" name="redirectTo" value={selfHref} />
                  <input
                    type="datetime-local"
                    name="publishAt"
                    required
                    min={nowBogotaLocal()}
                    aria-label="Fecha y hora de publicación (hora de Colombia)"
                    className="border-brand-purple/20 h-8 rounded-md border bg-white px-2 text-xs shadow-sm"
                  />
                  <Hint content="Programar: la versión se publica sola en esa fecha (hora de Colombia)">
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className="text-brand-purple-dark hover:bg-brand-purple/10"
                    >
                      <CalendarClock className="mr-1 h-3.5 w-3.5" />
                      Programar
                    </Button>
                  </Hint>
                </form>
              ))}
            {field.kind === "BLOCK" && field.isPublished && (
              <ConfirmAction
                action={unpublishCmsFieldAction}
                message={`¿Despublicar "${field.label}"? El sitio dejará de mostrarlo y caerá al texto por defecto (fallback hardcoded en código).`}
              >
                <input type="hidden" name="fieldId" value={field.id} />
                <input type="hidden" name="redirectTo" value={selfHref} />
                <Hint content="Despublicar (el sitio caerá al texto por defecto)">
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-brand-purple-dark hover:bg-brand-purple/10"
                  >
                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                    Despublicar
                  </Button>
                </Hint>
              </ConfirmAction>
            )}
          </div>
        }
      />

      <AdminPageBody>
        {justPublished && (
          <AdminNotice tone="success">Publicado. Los cambios ya se ven en el sitio.</AdminNotice>
        )}
        {justUnpublished && (
          <AdminNotice tone="warning">
            Despublicado. El sitio caerá al texto por defecto.
          </AdminNotice>
        )}
        {justScheduled && (
          <AdminNotice tone="success">
            Publicación programada. La versión saldrá sola en la fecha elegida (el cron pasa cada 5
            minutos).
          </AdminNotice>
        )}
        {justUnscheduled && (
          <AdminNotice tone="warning">
            Programación quitada. La versión queda como borrador (puedes publicarla a mano cuando
            quieras).
          </AdminNotice>
        )}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {/* Editor: lista (campos con listSchema) o editor de body normal */}
        {listSchema && listItems ? (
          <ListEditorForm
            field={{
              id: field.id,
              key: field.key,
              kind: field.kind,
              label: field.label,
              helpText: field.helpText,
              isPublished: field.isPublished,
              listSchema,
              items: listItems.map((item) => item.values),
            }}
            mediaLibrary={imageLibrary ?? []}
          />
        ) : (
          <FieldEditorForm
            field={{
              id: field.id,
              key: field.key,
              kind: field.kind,
              type: field.type,
              label: field.label,
              helpText: field.helpText,
              body: field.body,
              isPublished: field.isPublished,
            }}
            imageMedia={
              imageMedia
                ? {
                    id: imageMedia.id,
                    url: cmsMediaPublicUrl(imageMedia.bucket, imageMedia.path),
                    alt: imageMedia.alt,
                    width: imageMedia.width,
                    height: imageMedia.height,
                  }
                : null
            }
            imageLibrary={imageLibrary ?? undefined}
          />
        )}

        {/* Historial */}
        <section>
          <h3 className="text-brand-purple-dark font-display mb-2 flex items-center gap-2 text-base font-bold">
            <History className="h-5 w-5" />
            Historial de versiones
          </h3>
          <p className="text-brand-muted mb-3 text-sm">
            Cada vez que guardas se crea una versión. Puedes volver a cualquier versión anterior con
            un clic.
          </p>
          <AdminCard className="overflow-hidden p-0">
            <VersionHistory
              fieldId={field.id}
              versions={field.versions.map((v) => ({
                id: v.id,
                version: v.version,
                title: v.title,
                body: v.body,
                publishedAt: v.publishedAt,
                publishAt: v.publishAt,
                createdAt: v.createdAt,
                createdBy: v.createdBy,
              }))}
              currentPublishedVersionId={field.publishedVersionId}
            />
          </AdminCard>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
